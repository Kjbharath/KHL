// Proxy DELETE requests to Ollama's /api/delete endpoint
export async function DELETE(request) {
  const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://ollama-engine:11434';

  try {
    const body = await request.json();

    const res = await fetch(`${OLLAMA_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name }),
    });

    if (!res.ok) {
      return Response.json({ error: 'Delete failed' }, { status: res.status });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
