export const dynamic = 'force-dynamic';

import http from 'http';

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

// Helper to decode Docker's multiplexed stream format for logs
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
    
    // We combine stdout (type 1) and stderr (type 2) for log display
    text += payload.toString('utf8');
  }
  // If parsing fails or the stream is not multiplexed (e.g. raw text), return the raw buffer
  return text || buffer.toString('utf8');
}

export async function GET() {
  try {
    const logBuffer = await dockerApiLogs('/containers/vllm-engine/logs?stdout=true&stderr=true&tail=100');
    const logs = parseDockerLogs(logBuffer);
    return Response.json({ logs });
  } catch (err) {
    return Response.json({ error: 'Failed to query logs', details: err.message }, { status: 500 });
  }
}
