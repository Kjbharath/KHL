export const dynamic = 'force-dynamic';

import http from 'http';

// Helper function to query the Docker socket
function dockerApi(path, method = 'POST') {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: `/v1.43${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 304) {
          try {
            resolve(data ? JSON.parse(data) : { success: true });
          } catch {
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Docker API Error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export async function GET() {
  try {
    const [ollamaInfo, vllmInfo, comfyInfo] = await Promise.all([
      dockerApi('/containers/ollama-engine/json', 'GET').catch(() => null),
      dockerApi('/containers/vllm-engine/json', 'GET').catch(() => null),
      dockerApi('/containers/bharath-comfyui/json', 'GET').catch(() => null),
    ]);

    let logs = 'No logs available';
    try {
      const logBuffer = await dockerApiLogs('/containers/vllm-engine/logs?stdout=true&stderr=true&tail=100');
      logs = parseDockerLogs(logBuffer);
    } catch (e) {
      logs = 'Failed to fetch logs: ' + e.message;
    }

    return Response.json({
      ollama: ollamaInfo?.State?.Status || 'unknown',
      vllm: vllmInfo || 'unknown',
      comfyui: comfyInfo?.State?.Status || 'unknown',
      logs: logs
    });
  } catch (err) {
    return Response.json({ error: 'Failed to query Docker daemon', details: err.message }, { status: 500 });
  }
}

function dockerApiLogs(path) {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: `/v1.43${path}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = [];
      res.on('data', (chunk) => { data.push(chunk); });
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        resolve(buffer);
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

function parseDockerLogs(buffer) {
  let offset = 0;
  let text = '';
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const streamType = buffer.readUInt8(offset);
    const frameLength = buffer.readUInt32BE(offset + 4);
    offset += 8;
    
    if (offset + frameLength > buffer.length) break;
    const payload = buffer.slice(offset, offset + frameLength);
    offset += frameLength;
    
    text += payload.toString('utf8');
  }
  return text || buffer.toString('utf8');
}

// POST handler to toggle active GPU engine (ollama <-> vllm)
export async function POST(request) {
  try {
    const { target } = await request.json();

    if (target === 'get_logs') {
      const logBuffer = await dockerApiLogs('/containers/vllm-engine/logs?stdout=true&stderr=true&tail=100');
      const logs = parseDockerLogs(logBuffer);
      return Response.json({ success: true, logs });
    }

    if (target === 'ollama') {
      console.log('Toggling active engine: Ollama (stopping vLLM)...');
      // 1. Stop vLLM (freeing up the GPU memory)
      try {
        await dockerApi('/containers/vllm-engine/stop');
      } catch (err) {
        console.log('Stop vllm-engine ignored (might be already stopped):', err.message);
      }
      
      // 2. Start Ollama
      await dockerApi('/containers/ollama-engine/start');
      return Response.json({ success: true, active: 'ollama' });

    } else if (target === 'vllm') {
      console.log('Toggling active engine: vLLM (stopping Ollama)...');
      // 1. Stop Ollama (freeing up the GPU memory)
      try {
        await dockerApi('/containers/ollama-engine/stop');
      } catch (err) {
        console.log('Stop ollama-engine ignored (might be already stopped):', err.message);
      }

      // 2. Start vLLM
      await dockerApi('/containers/vllm-engine/start');
      return Response.json({ success: true, active: 'vllm' });

    } else if (target === 'stop_all') {
      console.log('Stopping both engines to free GPU completely...');
      await Promise.all([
        dockerApi('/containers/ollama-engine/stop').catch(() => null),
        dockerApi('/containers/vllm-engine/stop').catch(() => null),
      ]);
      return Response.json({ success: true, active: 'none' });
    }

    return Response.json({ error: 'Invalid target engine' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: 'Docker socket execution failed', details: err.message }, { status: 500 });
  }
}
