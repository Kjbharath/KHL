#!/usr/bin/env python3
import urllib.request
import urllib.json
import json
import sys
import time

def test_model():
    url = "http://localhost:8000/v1/chat/completions"
    model = "protoLabsAI/Qwythos-9B-v2-NVFP4"
    
    # Simple prompt to test if the model works
    data = {
        "model": model,
        "messages": [
            {"role": "user", "content": "Explain quantum computing in one sentence."}
        ],
        "max_tokens": 50,
        "temperature": 0.0
    }
    
    req_body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=req_body,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Sending test prompt to vLLM at: {url}")
    print(f"Target Model: {model}\n")
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            res_data = json.loads(res_body)
            answer = res_data["choices"][0]["message"]["content"]
            elapsed = time.time() - start_time
            print("-" * 60)
            print(f"Response (received in {elapsed:.2f}s):")
            print(answer.strip())
            print("-" * 60)
            print("\nSUCCESS! The model is working perfectly on vLLM.")
    except Exception as e:
        print(f"Error connecting to vLLM: {e}")
        print("\nNote: Make sure the container was restarted with --enforce-eager and has loaded the weights.")

if __name__ == "__main__":
    test_model()
