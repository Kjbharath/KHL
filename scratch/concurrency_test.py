#!/usr/bin/env python3
import json
import time
import urllib.request
import urllib.error
import threading
import sys

# Shared list to gather results from threads
results = []
results_lock = threading.Lock()

def send_request(thread_id, url, model_name, prompt):
    data = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 128
    }
    
    req_body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f"{url}/chat/completions",
        data=req_body,
        headers={"Content-Type": "application/json"}
    )
    
    start_time = time.time()
    first_token_time = None
    token_count = 0
    
    try:
        with urllib.request.urlopen(req) as response:
            buffer = ""
            for chunk in response:
                if not chunk:
                    continue
                
                buffer += chunk.decode('utf-8')
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    
                    if line.startswith("data:"):
                        data_content = line[5:].strip()
                        if data_content == "[DONE]":
                            break
                        
                        try:
                            json_data = json.loads(data_content)
                            delta = json_data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                if first_token_time is None:
                                    first_token_time = time.time()
                                token_count += 1
                        except Exception:
                            pass
                            
        end_time = time.time()
        
        if first_token_time is None:
            print(f"[Thread-{thread_id}] Error: No tokens generated.", file=sys.stderr)
            return
            
        ttft = (first_token_time - start_time) * 1000 # ms
        generation_time = end_time - first_token_time
        total_time = end_time - start_time
        tps = token_count / generation_time if generation_time > 0 else 0
        
        with results_lock:
            results.append({
                "thread_id": thread_id,
                "ttft": ttft,
                "generation_time": generation_time,
                "total_time": total_time,
                "token_count": token_count,
                "tps": tps
            })
            
        print(f"[Thread-{thread_id}] Done. Tokens: {token_count} | TTFT: {ttft:.1f}ms | Throughput: {tps:.1f} t/s")
        
    except Exception as e:
        print(f"[Thread-{thread_id}] Connection Error: {e}", file=sys.stderr)

def run_concurrency_test(concurrency_level, url, model_name, prompt):
    global results
    results = []
    
    print(f"\nRunning concurrency test with {concurrency_level} parallel requests...")
    threads = []
    
    start_test_time = time.time()
    
    for i in range(concurrency_level):
        t = threading.Thread(target=send_request, args=(i+1, url, model_name, prompt))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    end_test_time = time.time()
    total_elapsed = end_test_time - start_test_time
    
    if not results:
        print("All threads failed to complete.")
        return
        
    # Aggregate metrics
    total_tokens = sum(r["token_count"] for r in results)
    avg_ttft = sum(r["ttft"] for r in results) / len(results)
    avg_tps = sum(r["tps"] for r in results) / len(results)
    aggregate_tps = total_tokens / total_elapsed if total_elapsed > 0 else 0
    
    print("=" * 60)
    print(f"Results for Concurrency Level: {concurrency_level}")
    print(f"  - Total Elapsed Time: {total_elapsed:.2f} seconds")
    print(f"  - Total Generated Tokens (All Threads): {total_tokens}")
    print(f"  - Average TTFT: {avg_ttft:.2f} ms")
    print(f"  - Avg Throughput per Thread: {avg_tps:.2f} tokens/sec")
    print(f"  - Aggregate GPU Throughput: {aggregate_tps:.2f} tokens/sec")
    print("=" * 60)

def main():
    vllm_url = "http://localhost:8000/v1"
    model_name = "Qwen/Qwen2.5-7B-Instruct"
    prompt = "Write a comprehensive summary of general relativity in two paragraphs."
    
    # Auto-detect active model
    try:
        req = urllib.request.Request(f"{vllm_url}/models", method="GET")
        with urllib.request.urlopen(req, timeout=2) as response:
            models_data = json.loads(response.read().decode('utf-8'))
            if models_data.get("data"):
                model_name = models_data["data"][0]["id"]
    except Exception:
        pass
        
    print(f"Target Server: {vllm_url}")
    print(f"Active Model: {model_name}")
    print("-" * 50)
    
    # Run sequentially first
    run_concurrency_test(1, vllm_url, model_name, prompt)
    
    # Run with 2 parallel requests
    run_concurrency_test(2, vllm_url, model_name, prompt)
    
    # Run with 4 parallel requests
    run_concurrency_test(4, vllm_url, model_name, prompt)
    
    # Run with 8 parallel requests
    run_concurrency_test(8, vllm_url, model_name, prompt)

if __name__ == "__main__":
    main()
