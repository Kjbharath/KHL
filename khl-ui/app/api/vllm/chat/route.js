export const dynamic = 'force-dynamic';

export async function POST(req) {
  const VLLM_URL = process.env.VLLM_API_URL || 'http://127.0.0.1:8001/v1';

  try {
    const body = await req.json();
    
    // We enforce stream: false per our findings that vLLM XML parsers break on streaming
    const res = await fetch(`${VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(300000), // 5 min timeout for 64K context
    });

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json({ error: 'vLLM chat failed', details: errorText }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
