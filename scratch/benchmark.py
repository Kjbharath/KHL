#!/usr/bin/env python3
import json
import time
import urllib.request
import urllib.error
import sys

def benchmark_vllm(url, model_name, prompt):
    print(f"=== Benchmarking vLLM ===")
    print(f"Endpoint: {url}")
    print(f"Model: {model_name}")
    print(f"Prompt: '{prompt}'")
    print("-" * 50)

    data = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": 0.2,
        "max_tokens": 256
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
    generated_text = ""
    
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
                                generated_text += content
                                print(content, end="", flush=True)
                        except Exception:
                            pass
                            
        end_time = time.time()
        print("\n" + "-" * 50)
        
        if first_token_time is None:
            print("Error: No tokens generated.")
            return
            
        ttft = (first_token_time - start_time) * 1000 # ms
        generation_time = end_time - first_token_time
        total_time = end_time - start_time
        tokens_per_second = token_count / generation_time if generation_time > 0 else 0
        
        print(f"Benchmark Results:")
        print(f"  - Total Generated Tokens: {token_count}")
        print(f"  - Time to First Token (TTFT): {ttft:.2f} ms")
        print(f"  - Generation Time: {generation_time:.2f} s")
        print(f"  - Total Latency: {total_time:.2f} s")
        print(f"  - Throughput: {tokens_per_second:.2f} tokens/sec")
        print("-" * 50)
        
    except urllib.error.HTTPError as e:
        print(f"\nHTTP Error {e.code}: {e.reason}", file=sys.stderr)
        try:
            print(f"Response: {e.read().decode('utf-8')}", file=sys.stderr)
        except Exception:
            pass
    except urllib.error.URLError as e:
        print(f"\nConnection Error: Could not connect to vLLM on {url}.", file=sys.stderr)
        print(f"Details: {e.reason}", file=sys.stderr)
    except Exception as e:
        print(f"\nUnexpected Error: {e}", file=sys.stderr)

def benchmark_ollama(url, model_name, prompt):
    print(f"=== Benchmarking Ollama ===")
    print(f"Endpoint: {url}")
    print(f"Model: {model_name}")
    print(f"Prompt: '{prompt}'")
    print("-" * 50)

    data = {
        "model": model_name,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": 0.2,
            "num_predict": 256
        }
    }
    
    req_body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f"{url}/api/generate",
        data=req_body,
        headers={"Content-Type": "application/json"}
    )
    
    start_time = time.time()
    first_token_time = None
    token_count = 0
    generated_text = ""
    
    try:
        with urllib.request.urlopen(req) as response:
            for line in response:
                if not line:
                    continue
                
                try:
                    json_data = json.loads(line.decode('utf-8'))
                    content = json_data.get("response", "")
                    done = json_data.get("done", False)
                    
                    if content:
                        if first_token_time is None:
                            first_token_time = time.time()
                        token_count += 1
                        generated_text += content
                        print(content, end="", flush=True)
                        
                    if done:
                        actual_eval_count = json_data.get("eval_count")
                        if actual_eval_count:
                            token_count = actual_eval_count
                        break
                except Exception:
                    pass
                            
        end_time = time.time()
        print("\n" + "-" * 50)
        
        if first_token_time is None:
            print("Error: No response generated.")
            return
            
        ttft = (first_token_time - start_time) * 1000 # ms
        generation_time = end_time - first_token_time
        total_time = end_time - start_time
        tokens_per_second = token_count / generation_time if generation_time > 0 else 0
        
        print(f"Benchmark Results:")
        print(f"  - Total Generated Tokens: {token_count}")
        print(f"  - Time to First Token (TTFT): {ttft:.2f} ms")
        print(f"  - Generation Time: {generation_time:.2f} s")
        print(f"  - Total Latency: {total_time:.2f} s")
        print(f"  - Throughput: {tokens_per_second:.2f} tokens/sec")
        print("-" * 50)
        
    except urllib.error.HTTPError as e:
        print(f"\nHTTP Error {e.code}: {e.reason}", file=sys.stderr)
        try:
            print(f"Response: {e.read().decode('utf-8')}", file=sys.stderr)
        except Exception:
            pass
    except urllib.error.URLError as e:
        print(f"\nConnection Error: Could not connect to Ollama on {url}.", file=sys.stderr)
        print(f"Details: {e.reason}", file=sys.stderr)
    except Exception as e:
        print(f"\nUnexpected Error: {e}", file=sys.stderr)

def main():
    prompt = "Explain quantum computing in three detailed paragraphs."
    if len(sys.argv) > 1:
        prompt = sys.argv[1]

    # 1. Try to detect running vLLM first
    vllm_url = "http://localhost:8000/v1"
    try:
        req = urllib.request.Request(f"{vllm_url}/models", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            models_data = json.loads(response.read().decode('utf-8'))
            if models_data.get("data"):
                model_name = models_data["data"][0]["id"]
                benchmark_vllm(vllm_url, model_name, prompt)
                return
    except Exception:
        pass

    # 2. Try to detect running Ollama
    ollama_url = "http://localhost:11434"
    try:
        req = urllib.request.Request(f"{ollama_url}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            tags_data = json.loads(response.read().decode('utf-8'))
            models = tags_data.get("models", [])
            if models:
                model_name = models[0]["name"]
                # Prefer hermes or openhermes
                for m in models:
                    if "hermes" in m["name"].lower():
                        model_name = m["name"]
                        break
                benchmark_ollama(ollama_url, model_name, prompt)
                return
            else:
                print("Ollama is active, but no models are loaded. Please pull a model (e.g. openhermes) in the KHL dashboard.")
                return
    except Exception:
        pass

    print("Error: Neither vLLM (port 8000) nor Ollama (port 11434) is currently running.")
    print("Please activate an engine in the KenjuHomieLab dashboard first.")

if __name__ == "__main__":
    main()
