export const dynamic = 'force-dynamic';

// Proxy GET requests to vLLM's /v1/models endpoint
export async function GET() {
  const VLLM_URL = process.env.VLLM_API_URL || 'http://127.0.0.1:8001/v1';

  try {
    const res = await fetch(`${VLLM_URL}/models`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return Response.json({ error: 'vLLM unreachable' }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
