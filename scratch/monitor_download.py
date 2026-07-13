#!/usr/bin/env python3
import os
import time
import sys

def get_dir_size(path):
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    except Exception:
        pass
    return total

def main():
    model_path = "/home/kenju/KHL-main/KHL-main/models/hf/hub/models--SKT-NRS--NRS_QWEN_MYTHOS_1M"
    total_expected = 18 * 1024 * 1024 * 1024 # ~18 GB for a 9B BF16 model
    
    if not os.path.exists(model_path):
        print(f"Model path does not exist yet: {model_path}")
        return

    print("=" * 60)
    print("      Qwen Mythos 9B Download Progress Monitor")
    print("=" * 60)
    print(f"Monitoring folder: {model_path}")
    print("Press Ctrl+C to exit.\n")
    
    last_size = get_dir_size(model_path)
    last_time = time.time()
    
    while True:
        time.sleep(5)
        current_size = get_dir_size(model_path)
        current_time = time.time()
        
        elapsed = current_time - last_time
        downloaded_in_interval = current_size - last_size
        
        speed = downloaded_in_interval / elapsed if elapsed > 0 else 0
        speed_mb = speed / (1024 * 1024)
        
        progress = (current_size / total_expected) * 100
        progress = min(progress, 100.0)
        
        remaining = total_expected - current_size
        eta = remaining / speed if speed > 0 else 0
        
        size_gb = current_size / (1024 * 1024 * 1024)
        
        sys.stdout.write(
            f"\rProgress: {progress:.1f}% | Size: {size_gb:.2f} GB / 18.0 GB | Speed: {speed_mb:.2f} MB/s | ETA: {int(eta)//60}m {int(eta)%60}s"
        )
        sys.stdout.flush()
        
        if current_size >= total_expected:
            print("\nDownload finished! vLLM will now load the weights and compile the kernels.")
            break
            
        last_size = current_size
        last_time = current_time

if __name__ == "__main__":
    main()
