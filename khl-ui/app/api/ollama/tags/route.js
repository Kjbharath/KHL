export const dynamic = 'force-dynamic';

// Proxy GET requests to Ollama's /api/tags endpoint
export async function GET() {
  const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://ollama-engine:11434';

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return Response.json({ error: 'Ollama unreachable' }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
