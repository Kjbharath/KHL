import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const envPath = '/project/.env';

function updateEnv(modelName, maxModelLen) {
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  const modelRegex = /^VLLM_MODEL=.*$/m;
  if (modelRegex.test(content)) {
    content = content.replace(modelRegex, `VLLM_MODEL=${modelName}`);
  } else {
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    content += `VLLM_MODEL=${modelName}\n`;
  }

  if (maxModelLen) {
    const lenRegex = /^VLLM_MAX_MODEL_LEN=.*$/m;
    if (lenRegex.test(content)) {
      content = content.replace(lenRegex, `VLLM_MAX_MODEL_LEN=${maxModelLen}`);
    } else {
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += `VLLM_MAX_MODEL_LEN=${maxModelLen}\n`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
}

export async function POST(request) {
  try {
    const { name, max_model_len } = await request.json();
    if (!name || !name.trim()) {
      return Response.json({ error: 'Model name is required' }, { status: 400 });
    }

    const modelName = name.trim();

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // 1. Update the env file
        try {
          updateEnv(modelName, max_model_len);
          controller.enqueue(encoder.encode(JSON.stringify({ status: `Configured VLLM_MODEL=${modelName} ${max_model_len ? `and VLLM_MAX_MODEL_LEN=${max_model_len} ` : ''}in .env` }) + '\n'));
        } catch (err) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: `Failed to update .env: ${err.message}` }) + '\n'));
          controller.close();
          return;
        }

        // 2. Recreate container
        controller.enqueue(encoder.encode(JSON.stringify({ status: 'Recreating vllm-engine container (starting model download)...' }) + '\n'));
        
        const recreate = spawn('docker', [
          'compose', 
          '-p', 'khl-main',
          '-f', '/project/docker-compose.yml', 
          '--env-file', '/project/.env',
          'up', '-d', 'vllm-engine', '--force-recreate'
        ]);

        recreate.stdout.on('data', (data) => {
          controller.enqueue(encoder.encode(JSON.stringify({ status: data.toString().trim() }) + '\n'));
        });
        recreate.stderr.on('data', (data) => {
          controller.enqueue(encoder.encode(JSON.stringify({ status: data.toString().trim() }) + '\n'));
        });

        recreate.on('close', (code) => {
          if (code !== 0) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: `Container recreation failed (exit code ${code})` }) + '\n'));
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(JSON.stringify({ status: 'Container started. Streaming download/initialization logs...' }) + '\n'));

          // 3. Stream container logs
          const logs = spawn('docker', ['logs', '-f', '--tail', '30', 'vllm-engine']);

          logs.stdout.on('data', (data) => {
            const text = data.toString();
            controller.enqueue(encoder.encode(JSON.stringify({ log: text }) + '\n'));
            
            const progressMatch = /(\d+)%/.exec(text);
            if (progressMatch) {
              const percent = parseInt(progressMatch[1], 10);
              controller.enqueue(encoder.encode(JSON.stringify({ percent }) + '\n'));
            }

            if (text.includes('Uvicorn running on') || text.includes('Application startup complete.')) {
              controller.enqueue(encoder.encode(JSON.stringify({ status: 'Ready' }) + '\n'));
              logs.kill();
              controller.close();
            }
          });

          logs.stderr.on('data', (data) => {
            const text = data.toString();
            controller.enqueue(encoder.encode(JSON.stringify({ log: text }) + '\n'));

            const progressMatch = /(\d+)%/.exec(text);
            if (progressMatch) {
              const percent = parseInt(progressMatch[1], 10);
              controller.enqueue(encoder.encode(JSON.stringify({ percent }) + '\n'));
            }

            if (text.includes('Uvicorn running on') || text.includes('Application startup complete.')) {
              controller.enqueue(encoder.encode(JSON.stringify({ status: 'Ready' }) + '\n'));
              logs.kill();
              controller.close();
            }
          });

          logs.on('close', async () => {
            await new Promise(resolve => setTimeout(resolve, 1500));
            try {
              const inspectRes = await fetch('http://localhost:3000/api/engine/toggle');
              if (inspectRes.ok) {
                const statusData = await inspectRes.json();
                if (statusData.vllm !== 'running') {
                  controller.enqueue(encoder.encode(JSON.stringify({ error: 'vLLM container exited or crashed. Check logs below for the exact error.' }) + '\n'));
                }
              }
            } catch (err) {
              console.error('Failed to verify container status on close:', err.message);
            }
            try {
              controller.close();
            } catch {}
          });

          request.signal.addEventListener('abort', () => {
            logs.kill();
          });
        });

        request.signal.addEventListener('abort', () => {
          recreate.kill();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    return Response.json({ error: 'Failed to initiate load', detail: err.message }, { status: 500 });
  }
}
