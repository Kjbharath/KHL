export const dynamic = 'force-dynamic';

import http from 'http';

// Helper to query the Docker socket
function dockerApi(path, method = 'POST', body = null) {
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
      let data = [];
      res.on('data', (chunk) => { data.push(chunk); });
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(buffer.toString('utf8')));
          } catch {
            resolve(buffer);
          }
        } else {
          reject(new Error(`Docker API Error: ${res.statusCode} - ${buffer.toString('utf8')}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to decode Docker's multiplexed stream format
function parseDockerStream(buffer) {
  let offset = 0;
  let stdoutText = '';
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const streamType = buffer.readUInt8(offset);
    const frameLength = buffer.readUInt32BE(offset + 4);
    offset += 8;
    
    if (offset + frameLength > buffer.length) break;
    const payload = buffer.slice(offset, offset + frameLength);
    offset += frameLength;
    
    if (streamType === 1) { // stdout
      stdoutText += payload.toString('utf8');
    }
  }
  return stdoutText;
}

export async function GET() {
  try {
    // 1. Get running containers
    const containers = await dockerApi('/containers/json', 'GET');
    
    // We prioritize containers that have GPU runtime and are likely to have nvidia-smi
    const targetNames = ['/bharath-comfyui', '/ollama-engine', '/vllm-engine'];
    const running = containers.find(c => 
      c.Names.some(name => targetNames.includes(name)) && c.State === 'running'
    );

    if (!running) {
      throw new Error('No active GPU container found');
    }

    const containerName = running.Names[0].replace('/', '');

    // 2. Create exec instance
    const execObj = await dockerApi(`/containers/${containerName}/exec`, 'POST', {
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Cmd: [
        "sh",
        "-c",
        "nvidia-smi --query-gpu=gpu_name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits || /usr/bin/nvidia-smi --query-gpu=gpu_name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits || /usr/local/nvidia/bin/nvidia-smi --query-gpu=gpu_name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits"
      ]
    });

    // 3. Start exec instance to collect output
    const execOutputBuffer = await dockerApi(`/exec/${execObj.Id}/start`, 'POST', {
      Detach: false,
      Tty: false
    });

    const stdout = parseDockerStream(execOutputBuffer);

    // 4. Parse CSV format:
    // "NVIDIA GeForce RTX 5060 Ti, 0, 0, 8192, 128, 41"
    const parts = stdout.split(',').map(s => s.trim());
    if (parts.length < 6) {
      throw new Error('Malformed nvidia-smi output');
    }

    return Response.json({
      name: parts[0],
      utilization: parseInt(parts[1], 10),
      vram_total: parseInt(parts[3], 10),
      vram_used: parseInt(parts[4], 10),
      temperature: parseInt(parts[5], 10),
      container: containerName
    });
  } catch (err) {
    // Fallback response to prevent crashes when engines are fully offline
    return Response.json({
      name: 'NVIDIA GPU (Offline)',
      utilization: 0,
      vram_total: 8192,
      vram_used: 0,
      temperature: 0,
      fallback: true,
      error: err.message
    });
  }
}
