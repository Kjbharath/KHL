// Proxy POST requests to Ollama's /api/pull endpoint (streaming)
export async function POST(request) {
  const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://ollama-engine:11434';

  try {
    const body = await request.json();

    const res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name, stream: true }),
    });

    if (!res.ok) {
      return Response.json({ error: 'Pull failed' }, { status: res.status });
    }

    // Stream the response back to the client
    return new Response(res.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
