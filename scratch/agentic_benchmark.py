#!/usr/bin/env python3
"""
KHL Grounded Agentic Benchmark
Tests REAL hermes agent runs with actual tool execution and 64K context.
Measures: tokens used, tool calls fired, latency per step, success rate.
"""
import subprocess, json, time, os, sys, re, statistics, textwrap
from pathlib import Path

HERMES_DIR  = Path("/home/kenju/KHL-main/KHL-main/scratch/hermes-agent")
VLLM_URL    = "http://localhost:8000/v1"
MODEL       = "protoLabsAI/Qwythos-9B-v2-NVFP4"
RESULTS_LOG = Path("/home/kenju/KHL-main/KHL-main/scratch/agentic_benchmark_results.jsonl")
BANNER      = "═" * 72

# ── Pretty print helpers ──────────────────────────────────────────────────────
def h1(t): print(f"\n{BANNER}\n  {t}\n{BANNER}")
def h2(t): print(f"\n  ── {t} {'─'*(60-len(t))}")
def ok(t):  print(f"  ✅  {t}")
def err(t): print(f"  ❌  {t}")
def inf(t): print(f"  ℹ   {t}")

# ── Run one hermes agent query, return parsed metrics ─────────────────────────
def run_agent(query: str, label: str, timeout: int = 300) -> dict:
    h2(f"Task: {label}")
    inf(f"Query: {query[:80]}{'...' if len(query)>80 else ''}")

    cmd = [
        "uv", "run", "run_agent.py",
        "--model",    MODEL,
        "--base_url", VLLM_URL,
        "--api_key",  "dummy",
        "--query",    query,
    ]

    t0 = time.perf_counter()
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, cwd=HERMES_DIR
    )
    elapsed = time.perf_counter() - t0
    output  = result.stdout + result.stderr

    # Parse key metrics from hermes output
    api_calls     = _parse_int(output, r"📞 API Calls:\s*(\d+)")
    messages      = _parse_int(output, r"💬 Messages:\s*(\d+)")
    completed     = "✅ Completed: True" in output
    context_limit = _parse_int(output, r"📊 Context limit:\s*([\d,]+)", strip_comma=True)
    req_tokens    = _parse_all_ints(output, r"~([\d,]+) tokens", strip_comma=True)
    tool_calls    = _parse_tool_calls(output)
    final_resp    = _parse_final_response(output)
    errors        = _parse_errors(output)

    # Print live summary
    status = "✅ COMPLETED" if completed else "⚠️  INCOMPLETE"
    print(f"\n  {status}  |  {elapsed:.1f}s  |  {api_calls} API calls  |  {messages} msgs")
    print(f"  Context limit: {context_limit:,} tokens")
    if req_tokens:
        print(f"  Request sizes: {' → '.join(f'{t:,}' for t in req_tokens)} tokens")
    if tool_calls:
        print(f"  Tools called:  {', '.join(tool_calls)}")
    else:
        print(f"  Tools called:  (none / direct answer)")
    if errors:
        for e in errors[:3]:
            print(f"  ⚠  {e}")
    print(f"\n  Final response preview:")
    preview = final_resp[:300].replace('\n', ' ') if final_resp else "(empty)"
    print(f"  {textwrap.fill(preview, 65, subsequent_indent='  ')}")

    record = {
        "label":         label,
        "query":         query[:120],
        "completed":     completed,
        "elapsed_s":     round(elapsed, 2),
        "api_calls":     api_calls,
        "messages":      messages,
        "context_limit": context_limit,
        "max_tokens_used": max(req_tokens) if req_tokens else 0,
        "tool_calls":    tool_calls,
        "n_tool_calls":  len(tool_calls),
        "errors":        errors,
    }
    with open(RESULTS_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")
    return record

def _parse_int(text, pattern, strip_comma=False):
    m = re.search(pattern, text)
    if not m: return 0
    v = m.group(1).replace(",","") if strip_comma else m.group(1)
    return int(v)

def _parse_all_ints(text, pattern, strip_comma=False):
    matches = re.findall(pattern, text)
    result = []
    for m in matches:
        try: result.append(int(m.replace(",","") if strip_comma else m))
        except: pass
    return result

def _parse_tool_calls(text):
    # Hermes logs tool calls like: 🔧 Tool: search_files(...)  or  🛠 Calling tool: xyz
    tools = re.findall(r'(?:🔧|calling tool)[:\s]+([a-z_]+)', text, re.IGNORECASE)
    tools += re.findall(r'Tool call:\s*([a-z_]+)', text, re.IGNORECASE)
    tools += re.findall(r"'name':\s*'([a-z_]+)'", text)
    # deduplicate preserving order
    seen, out = set(), []
    for t in tools:
        if t not in seen: seen.add(t); out.append(t)
    return out

def _parse_final_response(text):
    m = re.search(r'🎯 FINAL RESPONSE:\s*-+\s*(.*?)(?:\n👋|$)', text, re.DOTALL)
    return m.group(1).strip() if m else ""

def _parse_errors(text):
    lines = text.splitlines()
    return [l.strip() for l in lines if "error" in l.lower() and "⚠" in l][:5]

# ── Build a REAL 64K context document from repo files ────────────────────────
def build_64k_context() -> str:
    files = [
        HERMES_DIR / "AGENTS.md",
        HERMES_DIR / "README.md",
        HERMES_DIR / "CONTRIBUTING.md",
        HERMES_DIR / "hermes_constants.py",
    ]
    chunks = []
    total  = 0
    target = 180_000  # chars ≈ 45K tokens, leaves room for system prompt + response
    for f in files:
        if not f.exists(): continue
        content = f.read_text(errors="replace")
        chunks.append(f"\n\n=== FILE: {f.name} ===\n{content}")
        total += len(content)
        if total >= target: break
    return "".join(chunks)[:target]

# ══════════════════════════════════════════════════════════════════════════════
# BENCHMARK SCENARIOS
# ══════════════════════════════════════════════════════════════════════════════

def bench_simple_tool_use():
    """Tools that actually execute on the system."""
    h1("BENCH A — Simple Grounded Tool Use")
    results = []

    results.append(run_agent(
        "Use the terminal tool to run: uname -a && nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader. Report the exact output.",
        label="terminal:nvidia-smi",
        timeout=120
    ))

    results.append(run_agent(
        "Use the terminal tool to count how many Python files exist under /home/kenju/KHL-main/KHL-main and list the 5 largest ones with their sizes.",
        label="terminal:find-python-files",
        timeout=120
    ))

    results.append(run_agent(
        "Use execute_code to write a Python function that computes the first 20 Fibonacci numbers and returns them as a list. Run it and show the output.",
        label="execute_code:fibonacci",
        timeout=120
    ))

    results.append(run_agent(
        "Use the read_file tool to read /home/kenju/KHL-main/KHL-main/docker-compose.yml and tell me exactly which Docker services are defined, their image names, and exposed ports.",
        label="read_file:docker-compose",
        timeout=120
    ))

    return results

def bench_multi_step_reasoning():
    """Multi-step tasks requiring chained tool calls."""
    h1("BENCH B — Multi-Step Agentic Reasoning")
    results = []

    results.append(run_agent(
        "Step 1: Use terminal to check if vLLM is running on port 8000 (curl localhost:8000/v1/models). "
        "Step 2: If it is, make a test completion request (curl -X POST localhost:8000/v1/chat/completions with model protoLabsAI/Qwythos-9B-v2-NVFP4 and a short query). "
        "Step 3: Report the model name, max_model_len, and the response content. Show all curl outputs.",
        label="multi-step:vllm-verification",
        timeout=180
    ))

    results.append(run_agent(
        "Use terminal to: (1) find the largest 3 files in /home/kenju/KHL-main/KHL-main/scratch/, "
        "(2) read the first 30 lines of the largest one, "
        "(3) write a 2-sentence summary of what that file does to /tmp/file_summary.txt, "
        "(4) read back /tmp/file_summary.txt and confirm it was written. Report each step.",
        label="multi-step:file-pipeline",
        timeout=180
    ))

    results.append(run_agent(
        "Use execute_code to: (1) import time and measure how long it takes to compute sum(range(10_000_000)), "
        "(2) compute the mean and standard deviation of 1000 random numbers using only stdlib, "
        "(3) format and print a report table with the results. Show all output.",
        label="multi-step:code-execution",
        timeout=180
    ))

    return results

def bench_64k_context():
    """Fill near the 64K context window with real document content and reason over it."""
    h1("BENCH C — Real 64K Context Window Utilization")
    inf("Building ~45K token context from real Hermes Agent repo files...")

    context_doc = build_64k_context()
    char_count   = len(context_doc)
    est_tokens   = char_count // 4
    inf(f"Context document: {char_count:,} chars ≈ {est_tokens:,} tokens")

    results = []

    # Query 1: deep document analysis
    q1 = (
        f"I am giving you the full source of the Hermes Agent project. "
        f"Read all of it carefully and answer: "
        f"(1) What is the MINIMUM_CONTEXT_LENGTH constant set to and what file is it in? "
        f"(2) List every tool mentioned in the AGENTS.md toolset. "
        f"(3) What Python version is required? "
        f"(4) What is the compression threshold percentage used before context is compressed? "
        f"Answer with exact values from the documents.\n\n"
        f"<documents>\n{context_doc[:120000]}\n</documents>"
    )
    results.append(run_agent(q1, label="64k-context:deep-analysis", timeout=240))

    # Query 2: cross-document reasoning
    q2 = (
        f"Given the full Hermes Agent codebase below, identify: "
        f"(1) What session storage path does Hermes use by default? "
        f"(2) How many distinct tool categories are defined in AGENTS.md? "
        f"(3) What is the maximum number of API retries configured? "
        f"Quote the exact lines.\n\n"
        f"<documents>\n{context_doc[:120000]}\n</documents>"
    )
    results.append(run_agent(q2, label="64k-context:cross-doc-reasoning", timeout=240))

    return results

def bench_tool_calling_accuracy():
    """Test that tool_choice=auto correctly routes to tools vs direct answers."""
    h1("BENCH D — Tool Call Routing Accuracy")
    results = []

    # Should use terminal
    results.append(run_agent(
        "What is the current system uptime? Check it using a system command.",
        label="routing:should-use-terminal",
        timeout=120
    ))

    # Should use execute_code
    results.append(run_agent(
        "Write and run code to generate a 10x10 multiplication table and print it neatly.",
        label="routing:should-use-code",
        timeout=120
    ))

    # Should use read_file
    results.append(run_agent(
        "Read /home/kenju/KHL-main/KHL-main/docker-compose.yml and tell me the vllm-engine container's command arguments.",
        label="routing:should-use-read_file",
        timeout=120
    ))

    # Should answer directly (no tool needed)
    results.append(run_agent(
        "What is the capital of Japan?",
        label="routing:direct-answer-no-tool",
        timeout=60
    ))

    return results

# ── Print final summary table ─────────────────────────────────────────────────
def print_summary(all_results):
    h1("FULL BENCHMARK SUMMARY")
    print(f"\n  {'Label':<38} {'Done':>5} {'t(s)':>6} {'APIs':>5} {'Tools':>6} {'MaxToks':>8}")
    print(f"  {'-'*68}")
    for r in all_results:
        done  = "✅" if r["completed"] else "⚠️ "
        tools = ",".join(r["tool_calls"][:3]) if r["tool_calls"] else "—"
        print(f"  {r['label']:<38} {done:>5} {r['elapsed_s']:>6.1f} {r['api_calls']:>5} "
              f"{tools:<14} {r['max_tokens_used']:>8,}")

    completed  = sum(1 for r in all_results if r["completed"])
    tool_tasks = sum(1 for r in all_results if r["tool_calls"])
    total      = len(all_results)
    avg_time   = statistics.mean(r["elapsed_s"] for r in all_results)

    print(f"\n  Tasks completed:   {completed}/{total} ({100*completed//total}%)")
    print(f"  Tasks used tools:  {tool_tasks}/{total}")
    print(f"  Avg task time:     {avg_time:.1f}s")
    print(f"\n  Full JSONL log: {RESULTS_LOG}")
    print(f"{BANNER}\n")

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    RESULTS_LOG.unlink(missing_ok=True)  # fresh run

    print(f"\n{'#'*72}")
    print(f"  KHL Grounded Agentic Benchmark")
    print(f"  Model: {MODEL}")
    print(f"  Hermes Agent: {HERMES_DIR}")
    print(f"  {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*72}")

    all_results = []
    all_results += bench_simple_tool_use()
    all_results += bench_multi_step_reasoning()
    all_results += bench_64k_context()
    all_results += bench_tool_calling_accuracy()

    print_summary(all_results)
