export const dynamic = 'force-dynamic';
import http from 'http';

function getDockerLogs(containerName, lines = 50) {
  return new Promise((resolve) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: `/v1.43/containers/${containerName}/logs?stdout=true&stderr=true&tail=${lines}`,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Parse Docker multiplexed stream (8 byte header per frame)
          let out = '';
          let offset = 0;
          while (offset < data.length) {
            if (offset + 8 > data.length) break;
            const len = data.readUInt32BE(offset + 4);
            offset += 8;
            if (offset + len > data.length) break;
            out += data.slice(offset, offset + len).toString('utf-8');
            offset += len;
          }
          resolve(out.trim());
        } else {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.end();
  });
}

function getContainerStatus(containerName) {
  return new Promise((resolve) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: `/v1.43/containers/${containerName}/json`,
      method: 'GET',
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const json = JSON.parse(data);
            resolve(json?.State?.Status || 'unknown');
          } else {
            resolve('unknown');
          }
        } catch {
          resolve('unknown');
        }
      });
    });
    req.on('error', () => resolve('unknown'));
    req.end();
  });
}

export async function GET() {
  try {
    const engines = ['vllm-engine', 'ollama-engine', 'bharath-comfyui'];
    
    const results = await Promise.all(
      engines.map(async (name) => {
        const state = await getContainerStatus(name);
        let logs = '';
        if (state === 'running' || state === 'starting') {
          logs = await getDockerLogs(name, 20);
        }
        
        // Extract a meaningful status message from logs
        let message = 'Idle / Waiting...';
        const logLines = logs.split('\n').map(l => l.trim()).filter(Boolean);
        
        if (logLines.length > 0) {
          const lastLine = logLines[logLines.length - 1];
          // Try to clean up timestamp or ANSI codes if necessary, but returning last line is often good enough
          message = lastLine.replace(/\u001b\[[0-9;]*m/g, '').substring(0, 100); 
        }

        if (state !== 'running' && state !== 'starting') {
          message = `Container is ${state}`;
        } else if (state === 'running' && logLines.length === 0) {
          message = `Container is running`;
        }
        
        return { name, state, message };
      })
    );
    
    return Response.json({ success: true, engines: results });
  } catch (err) {
    return Response.json({ error: 'Failed to query system boot status', details: err.message }, { status: 500 });
  }
}
