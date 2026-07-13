export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { query } = await req.json();
    if (!query) return Response.json({ error: 'Query is required' }, { status: 400 });

    const encoder = new TextEncoder();
    
    // We stream the response directly using ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        // Run docker exec to execute uv run run_agent.py on the host
        // We use docker.sock mounted in khl-ui to spawn a temporary container that mounts the host dir
        const { spawn } = require('child_process');
        
        // This is the absolute ponytail way to run a host command from an alpine container: 
        // Spin up a transient alpine container that mounts the host's scratch dir and runs the python script.
        // Wait, since Hermes needs uv and the host environment, we just mount the host's /home/kenju 
        // into a lightweight python container! Or even better, we just use the hermes-agent docker image!
        
        const child = spawn('docker', [
          'run', '--rm', '--network=host',
          '-v', '/home/kenju/KHL-main/KHL-main/scratch/hermes-agent:/opt/hermes',
          '-w', '/opt/hermes',
          'ghcr.io/astral-sh/uv:0.11.6-python3.13-trixie', // uv image
          'uv', 'run', 'run_agent.py', 
          '--model', 'protoLabsAI/Qwythos-9B-v2-NVFP4', 
          '--base_url', 'http://127.0.0.1:8000/v1',
          '--api_key', 'dummy',
          '--query', query
        ]);

        child.stdout.on('data', (data) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        child.stderr.on('data', (data) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        child.on('close', (code) => {
          controller.enqueue(encoder.encode(`\n[Process exited with code ${code}]\n`));
          controller.close();
        });
        
        child.on('error', (err) => {
          controller.enqueue(encoder.encode(`\n[Spawn Error: ${err.message}]\n`));
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (err) {
    return Response.json({ error: 'Failed to trigger hermes', detail: err.message }, { status: 500 });
  }
}
