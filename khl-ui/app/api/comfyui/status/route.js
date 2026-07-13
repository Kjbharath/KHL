export const dynamic = 'force-dynamic';

// Proxy GET requests to ComfyUI's health/status endpoint
export async function GET() {
  const COMFYUI_URL = process.env.COMFYUI_API_URL || 'http://bharath-comfyui:8188';

  try {
    // ComfyUI exposes system stats at /system_stats
    const res = await fetch(`${COMFYUI_URL}/system_stats`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return Response.json({ error: 'ComfyUI unreachable' }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Connection failed', detail: err.message }, { status: 502 });
  }
}
