#!/usr/bin/env python3
"""
KHL Full Benchmark Suite — vLLM + Hermes Agent
Covers: latency, concurrency, streaming, tool calling, context scaling.
Safe: conservative tokens, graceful OOM detection, no crashes.
"""
import asyncio, json, time, statistics, argparse, sys, urllib.request, subprocess, os

try:
    from openai import AsyncOpenAI, OpenAI
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openai", "-q",
                           "--break-system-packages"])
    from openai import AsyncOpenAI, OpenAI

URL   = "http://localhost:8000/v1"
MODEL = None   # auto-detected

BANNER = "═" * 72

def banner(title):
    print(f"\n{BANNER}")
    print(f"  {title}")
    print(BANNER)

def sep(title=""):
    if title:
        print(f"\n  ── {title} {'─'*(60-len(title))}")

def pct(data, p):
    if not data: return 0
    s = sorted(data); idx = max(0, int(len(s)*p/100)-1)
    return s[idx]

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def detect_model():
    global MODEL
    req = urllib.request.Request(f"{URL}/models")
    with urllib.request.urlopen(req, timeout=5) as r:
        d = json.loads(r.read())
        MODEL = d["data"][0]["id"]
        ctx   = d["data"][0].get("max_model_len","?")
    print(f"  Model   : {MODEL}")
    print(f"  Context : {ctx} tokens")
    return ctx

async def stream_request(client, messages, max_tokens, tools=None):
    t0 = time.perf_counter(); t1=None; toks=[]; err=None
    try:
        kwargs = dict(model=MODEL, messages=messages, max_tokens=max_tokens,
                      stream=True, temperature=0.7)
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        s = await client.chat.completions.create(**kwargs)
        async for chunk in s:
            if chunk.choices and chunk.choices[0].delta.content:
                now = time.perf_counter()
                if t1 is None: t1 = now
                toks.append(now)
    except Exception as e:
        err = str(e)
    t_end = time.perf_counter()
    if err or t1 is None:
        return {"error": err or "no tokens", "tokens": 0}
    ttft  = (t1-t0)*1e3
    tpot  = ((t_end-t1)/len(toks)*1e3) if len(toks)>1 else 0
    itl   = statistics.mean((toks[i]-toks[i-1])*1e3 for i in range(1,len(toks))) if len(toks)>1 else 0
    e2el  = (t_end-t0)*1e3
    return {"error":None,"ttft":ttft,"tpot":tpot,"itl":itl,"e2el":e2el,"tokens":len(toks)}

async def nonstream_request(client, messages, max_tokens):
    t0=time.perf_counter(); err=None; tok_count=0; ttft=None
    try:
        r = await client.chat.completions.create(
            model=MODEL, messages=messages, max_tokens=max_tokens,
            stream=False, temperature=0.7)
        ttft = (time.perf_counter()-t0)*1e3
        tok_count = r.usage.completion_tokens
    except Exception as e:
        err=str(e)
    e2el=(time.perf_counter()-t0)*1e3
    if err: return {"error":err,"tokens":0}
    return {"error":None,"ttft":ttft,"tpot":0,"itl":0,"e2el":e2el,"tokens":tok_count}

def print_stats(results, label=""):
    ok  = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]
    if err: print(f"  ⚠  {len(err)} failed: {err[0]['error'][:80]}")
    if not ok: print("  ❌ All failed."); return None
    ttfts=[r["ttft"] for r in ok]; tpots=[r["tpot"] for r in ok]
    itls=[r["itl"] for r in ok]; e2els=[r["e2el"] for r in ok]
    print(f"\n  {'Metric':<20} {'P50':>8} {'P90':>8} {'P99':>8} {'Mean':>8}")
    print(f"  {'-'*48}")
    print(f"  {'TTFT (ms)':<20} {pct(ttfts,50):>8.1f} {pct(ttfts,90):>8.1f} {pct(ttfts,99):>8.1f} {statistics.mean(ttfts):>8.1f}")
    print(f"  {'TPOT (ms/tok)':<20} {pct(tpots,50):>8.1f} {pct(tpots,90):>8.1f} {pct(tpots,99):>8.1f} {statistics.mean(tpots):>8.1f}")
    print(f"  {'ITL (ms)':<20} {pct(itls,50):>8.1f}  {'—':>7}  {'—':>7} {statistics.mean(itls):>8.1f}")
    print(f"  {'E2E (ms)':<20} {pct(e2els,50):>8.1f} {pct(e2els,90):>8.1f} {pct(e2els,99):>8.1f} {statistics.mean(e2els):>8.1f}")
    tokens=sum(r["tokens"] for r in ok)
    return {"n":len(ok),"tokens":tokens,"ttfts":ttfts,"tpots":tpots,"itls":itls}

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: Baseline Latency (single request, streaming vs non-streaming)
# ─────────────────────────────────────────────────────────────────────────────
async def section_baseline(client):
    banner("SECTION 1 — Baseline Latency (n=10 sequential requests)")
    prompt = "Explain what a neural network is in 3 sentences."

    sep("Streaming (stream=True)")
    results=[]
    for i in range(10):
        r = await stream_request(client,[{"role":"user","content":prompt}], 100)
        status = "✓" if not r["error"] else "✗"
        print(f"  [{i+1:02d}] {status}  TTFT={r.get('ttft',0):.1f}ms  tps={r.get('tokens',0)/r.get('e2el',1)*1e3:.1f}")
        results.append(r)
    streaming_stats = print_stats(results)

    sep("Non-Streaming (stream=False)")
    results2=[]
    for i in range(10):
        r = await nonstream_request(client,[{"role":"user","content":prompt}], 100)
        status = "✓" if not r["error"] else "✗"
        print(f"  [{i+1:02d}] {status}  TTFT={r.get('ttft',0):.1f}ms  tokens={r.get('tokens',0)}")
        results2.append(r)
    non_streaming_stats = print_stats(results2)

    if streaming_stats and non_streaming_stats:
        diff = statistics.mean(non_streaming_stats["ttfts"]) - statistics.mean(streaming_stats["ttfts"])
        print(f"\n  📊 Streaming vs Non-Streaming TTFT delta: {diff:+.1f}ms")
        print(f"     (Non-streaming TTFT = full generation time; streaming starts faster)")
    return streaming_stats

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2: Concurrency Sweep (continuous batching showcase)
# ─────────────────────────────────────────────────────────────────────────────
async def section_concurrency(client, summary_rows):
    banner("SECTION 2 — Concurrency Sweep (PagedAttention + Continuous Batching)")
    prompt = "Explain how transformer attention mechanisms work."
    levels = [1, 2, 4, 8, 16]
    n_per_level = 16   # enough for P99 without OOM risk

    for c in levels:
        sem = asyncio.Semaphore(c)
        async def bounded(i):
            async with sem:
                return await stream_request(client,[{"role":"user","content":prompt}], 120)

        sep(f"Concurrency = {c}  ({n_per_level} total requests)")
        t0=time.perf_counter()
        results = await asyncio.gather(*[bounded(i) for i in range(n_per_level)])
        wall = time.perf_counter()-t0

        ok=[r for r in results if not r.get("error")]
        if not ok: print("  ❌ All failed"); continue

        tokens=sum(r["tokens"] for r in ok)
        agg_tps=tokens/wall
        req_s=len(ok)/wall
        ttfts=[r["ttft"] for r in ok]
        tpots=[r["tpot"] for r in ok]

        print(f"  Wall: {wall:.1f}s | Req/s: {req_s:.2f} | Tok/s: {agg_tps:.1f} | TTFT-P50: {pct(ttfts,50):.1f}ms | TTFT-P99: {pct(ttfts,99):.1f}ms | TPOT-P50: {pct(tpots,50):.1f}ms")
        summary_rows.append({
            "section":"concurrency","c":c,"req_s":req_s,"agg_tps":agg_tps,
            "ttft_p50":pct(ttfts,50),"ttft_p99":pct(ttfts,99),"tpot_p50":pct(tpots,50),
            "tokens":tokens,"wall":wall
        })

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: Context Length Scaling
# ─────────────────────────────────────────────────────────────────────────────
async def section_context_scaling(client):
    banner("SECTION 3 — Context Length Scaling (TTFT vs prompt size)")

    short  = "What is 2+2?"
    medium = "Explain transformer attention mechanisms in detail, covering multi-head attention, keys, queries, values, positional encodings, and the relationship between layers."
    long_p = ("The following is a long document about machine learning. " * 40 +
              " Summarize the key concepts mentioned.")

    cases = [
        ("Short   (~10 tok)",  short,  60),
        ("Medium (~50 tok)",   medium, 100),
        ("Long  (~400 tok)",   long_p, 120),
    ]

    for label, prompt, max_tokens in cases:
        results=[]
        for _ in range(5):
            r = await stream_request(client,[{"role":"user","content":prompt}], max_tokens)
            results.append(r)
        ok=[r for r in results if not r.get("error")]
        if ok:
            ttfts=[r["ttft"] for r in ok]
            print(f"  {label}  →  TTFT P50={pct(ttfts,50):.1f}ms  P99={pct(ttfts,99):.1f}ms  mean={statistics.mean(ttfts):.1f}ms")
        else:
            print(f"  {label}  →  ❌ All failed")

    print(f"\n  📊 Note: TTFT grows with prompt length (longer prefill pass on GPU)")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4: Multi-turn Conversation
# ─────────────────────────────────────────────────────────────────────────────
async def section_multiturn(client):
    banner("SECTION 4 — Multi-Turn Conversation (growing KV cache)")
    print("  Simulates a real chat session — each turn adds to the context window.")

    history=[{"role":"user","content":"You are a helpful assistant. Let's talk about AI."}]
    turns=[
        "What are the main differences between supervised and unsupervised learning?",
        "Can you give me a concrete example of unsupervised learning in production?",
        "How does that compare to reinforcement learning in terms of data requirements?",
        "Which approach would you recommend for anomaly detection in server logs?",
    ]

    total_ctx=0
    for i, turn in enumerate(turns):
        history.append({"role":"user","content":turn})
        t0=time.perf_counter(); t1=None; toks=[]
        try:
            s = await client.chat.completions.create(
                model=MODEL,messages=history,max_tokens=120,stream=True,temperature=0.7)
            reply=""
            async for chunk in s:
                if chunk.choices and chunk.choices[0].delta.content:
                    now=time.perf_counter()
                    if t1 is None: t1=now
                    toks.append(now)
                    reply+=chunk.choices[0].delta.content
            history.append({"role":"assistant","content":reply})
        except Exception as e:
            print(f"  Turn {i+1} FAILED: {e}"); continue

        ttft=(t1-t0)*1e3 if t1 else 0
        e2el=(time.perf_counter()-t0)*1e3
        total_ctx+=len(turn.split())+len(reply.split())
        print(f"  Turn {i+1}  TTFT={ttft:.1f}ms  E2E={e2el:.1f}ms  ctx≈{total_ctx} words")
    print(f"\n  📊 TTFT should stay stable — KV cache is reused across turns (PagedAttention)")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5: Tool Calling Performance
# ─────────────────────────────────────────────────────────────────────────────
async def section_tool_calling(client):
    banner("SECTION 5 — Tool Calling (Hermes-style function calling overhead)")

    tools = [
        {"type":"function","function":{
            "name":"search_web",
            "description":"Search the web for current information",
            "parameters":{"type":"object","properties":{
                "query":{"type":"string","description":"Search query"}
            },"required":["query"]}
        }},
        {"type":"function","function":{
            "name":"read_file",
            "description":"Read a file from the filesystem",
            "parameters":{"type":"object","properties":{
                "path":{"type":"string","description":"File path"}
            },"required":["path"]}
        }},
        {"type":"function","function":{
            "name":"execute_code",
            "description":"Execute Python code and return result",
            "parameters":{"type":"object","properties":{
                "code":{"type":"string","description":"Python code to run"}
            },"required":["code"]}
        }},
    ]

    prompts=[
        "Search for the latest Python 3.13 release notes.",
        "Read the file at /etc/os-release and tell me the OS name.",
        "Calculate the factorial of 10 using code.",
        "What is the capital of France? Answer directly.",   # no tool needed
    ]

    print(f"\n  {'Query':<45} {'TTFT':>8}  {'Tool?':>6}  {'E2E':>8}")
    print(f"  {'-'*72}")

    for prompt in prompts:
        t0=time.perf_counter(); t1=None; tool_called=None
        try:
            # Non-streaming to detect tool calls in response
            r = await client.chat.completions.create(
                model=MODEL,
                messages=[{"role":"user","content":prompt}],
                tools=tools, tool_choice="auto",
                max_tokens=150, stream=False, temperature=0.0)
            t1=time.perf_counter()
            msg=r.choices[0].message
            if msg.tool_calls:
                tool_called=msg.tool_calls[0].function.name
        except Exception as e:
            print(f"  {prompt[:43]:<45}  ERROR: {str(e)[:40]}")
            continue
        ttft=(t1-t0)*1e3
        e2el=(time.perf_counter()-t0)*1e3
        tc_str=f"→{tool_called[:12]}" if tool_called else "(direct)"
        print(f"  {prompt[:45]:<45} {ttft:>8.1f}ms {tc_str:>8}  {e2el:>8.1f}ms")

    sep("Concurrent tool-calling requests (4 simultaneous)")
    async def tool_req(i):
        t0=time.perf_counter(); t1=None
        try:
            r = await client.chat.completions.create(
                model=MODEL,
                messages=[{"role":"user","content":f"Request {i}: search for AI news."}],
                tools=tools[:1], tool_choice="auto",
                max_tokens=100, stream=False, temperature=0.0)
            t1=time.perf_counter()
            tc=r.choices[0].message.tool_calls
            return {"ttft":(t1-t0)*1e3,"tool":tc[0].function.name if tc else None}
        except Exception as e:
            return {"error":str(e)}

    results = await asyncio.gather(*[tool_req(i) for i in range(8)])
    ok=[r for r in results if not r.get("error")]
    if ok:
        ttfts=[r["ttft"] for r in ok]
        tools_triggered=sum(1 for r in ok if r.get("tool"))
        print(f"  8 concurrent tool-call requests:")
        print(f"  TTFT P50={pct(ttfts,50):.1f}ms  P99={pct(ttfts,99):.1f}ms  Tool trigger rate={tools_triggered}/{len(ok)}")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6: Sustained Load / Throughput Ceiling
# ─────────────────────────────────────────────────────────────────────────────
async def section_throughput_ceiling(client, summary_rows):
    banner("SECTION 6 — Throughput Ceiling (finding max stable tok/s)")
    prompt = "Write a concise explanation of quantum computing in 2 paragraphs."
    results_by_c = {}

    for c in [8, 16, 24]:
        sem=asyncio.Semaphore(c)
        n=24
        async def b(i):
            async with sem:
                return await stream_request(client,[{"role":"user","content":prompt}],150)
        print(f"\n  Testing concurrency={c} with n={n} requests...")
        t0=time.perf_counter()
        rs = await asyncio.gather(*[b(i) for i in range(n)])
        wall=time.perf_counter()-t0
        ok=[r for r in rs if not r.get("error")]
        if not ok:
            print(f"  ❌ All failed at c={c} — likely OOM or queue overflow")
            break
        tokens=sum(r["tokens"] for r in ok)
        agg=tokens/wall
        ttfts=[r["ttft"] for r in ok]
        print(f"  c={c}: {agg:.1f} tok/s  |  TTFT P99={pct(ttfts,99):.1f}ms  |  {len(ok)}/{n} ok")
        results_by_c[c]=agg
        if len(ok)<n*0.9:
            print(f"  ⚠ >10% failures at c={c}, stopping ceiling test")
            break
        await asyncio.sleep(1)  # brief cooldown between stress levels

    if results_by_c:
        peak_c = max(results_by_c, key=results_by_c.get)
        print(f"\n  📊 Peak throughput: {results_by_c[peak_c]:.1f} tok/s at concurrency={peak_c}")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7: Prometheus / vLLM Internal Metrics Snapshot
# ─────────────────────────────────────────────────────────────────────────────
async def section_metrics_snapshot():
    banner("SECTION 7 — vLLM Prometheus Metrics Snapshot")
    try:
        req=urllib.request.Request("http://localhost:8000/metrics")
        with urllib.request.urlopen(req,timeout=5) as r:
            raw=r.read().decode()
        keys=[
            "vllm:gpu_cache_usage_perc",
            "vllm:cpu_cache_usage_perc",
            "vllm:num_requests_running",
            "vllm:num_requests_waiting",
            "vllm:avg_generation_throughput_toks_per_s",
            "vllm:avg_prompt_throughput_toks_per_s",
        ]
        print()
        for line in raw.splitlines():
            for k in keys:
                if line.startswith(k+" ") or line.startswith(k+"{"):
                    print(f"  {line}")
    except Exception as e:
        print(f"  ⚠  Could not fetch /metrics: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Final Summary
# ─────────────────────────────────────────────────────────────────────────────
def print_final_summary(summary_rows):
    banner("FINAL SUMMARY — Concurrency Scaling")
    rows=[r for r in summary_rows if r.get("section")=="concurrency"]
    if not rows: return
    base=rows[0]["agg_tps"] if rows else 1
    print(f"\n  {'C':>4}  {'Req/s':>6}  {'Tok/s':>7}  {'TTFT-P50':>9}  {'TTFT-P99':>9}  {'TPOT-P50':>9}")
    print(f"  {'-'*56}")
    for r in rows:
        print(f"  {r['c']:>4}  {r['req_s']:>6.2f}  {r['agg_tps']:>7.1f}  {r['ttft_p50']:>9.1f}  {r['ttft_p99']:>9.1f}  {r['tpot_p50']:>9.1f}")
    print(f"\n  Throughput scaling vs C=1:")
    for r in rows:
        bar="█"*int(r["agg_tps"]/base*30)
        print(f"    C={r['c']:>2}  {bar:<35} {r['agg_tps']:.1f} tok/s ({r['agg_tps']/base:.2f}x)")
    print(f"\n{'═'*72}\n")

# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    global URL, MODEL
    client = AsyncOpenAI(base_url=URL, api_key="dummy")

    print(f"\n{'#'*72}")
    print(f"  KHL Full Benchmark Suite — vLLM + Hermes Agent Level")
    print(f"  {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*72}")
    print(f"  Endpoint: {URL}")
    detect_model()

    summary_rows = []

    await section_baseline(client)
    await section_concurrency(client, summary_rows)
    await section_context_scaling(client)
    await section_multiturn(client)
    await section_tool_calling(client)
    await section_throughput_ceiling(client, summary_rows)
    await section_metrics_snapshot()
    print_final_summary(summary_rows)

    print("  ✅ All benchmark sections complete!")

if __name__ == "__main__":
    asyncio.run(main())
