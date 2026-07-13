# KenjuHomieLab (KHL)

Welcome to **KenjuHomieLab**, a premium Multi-Engine AI Platform designed for high-performance workloads, integrating state-of-the-art AI engines seamlessly.

## Platform Features

- **Multi-Engine Orchestration**: Dynamically switch between AI engines without CUDA Out-Of-Memory (OOM) errors.
- **Ollama Engine**: Run efficient local models easily.
- **vLLM Engine**: High-throughput and memory-efficient LLM serving.
- **Open WebUI**: Centralized chat, agent execution, and tool interactions.
- **Hermes / ComfyUI**: Integrated video and image generation lab.
- **Premium Aesthetics**: Stunning dark mode, glassmorphism UI built on Next.js.

## Services & Ports

The platform runs multiple services locally on the following ports:

| Service | Port | Description |
|---|---|---|
| **KHL Dashboard** | `3000` | The main React/Next.js dashboard (you are here!) |
| **Ollama Engine** | `11434` | Backend for Ollama models |
| **vLLM Engine** | `8001` | High-performance inference engine |
| **Open WebUI** | `8080` | Primary AI Chat Interface |
| **ComfyUI** | `8188` | AI Video & Image Workflow Canvas |

## How to Start

KHL uses Docker Compose to manage its services efficiently.

1. **Start all core services:**
   ```bash
   docker compose up -d
   ```

2. **Access the Dashboard:**
   Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

3. **Start specific engines (if needed):**
   ```bash
   docker compose up -d ollama-engine
   docker compose up -d vllm-engine
   docker compose up -d bharath-comfyui
   ```

Use the **KHL Dashboard** to manage VRAM allocation automatically between Ollama and vLLM.

## Model Managers & Hugging Face Integration

The dashboard features built-in Model Managers for both engines:
1. **Ollama**: Download models natively from the Ollama library.
2. **vLLM**: Pull models directly from **Hugging Face** repositories using the dashboard UI. You can also specify the desired **Context Length** window (e.g. 32k, 64k) before loading.

### Hugging Face Access Token Setup (Optional)
To pull gated models (like Llama 3) and unlock faster download rates, configure your Hugging Face Access Token:
1. Generate a **Read** token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Open your local `.env` file and append:
   ```env
   HF_TOKEN=hf_your_actual_token_here
   ```
*(Note: `.env` is already configured in `.gitignore`, so your token will remain local and private, and will never be pushed to Git.)*

## Ponytail Philosophy

This platform embraces the "Ponytail" engineering philosophy: keeping things sleek, deleting over-engineered cruft, and focusing on pure speed and utility. The dashboard polling has been optimized for low latency and zero UI blocking.
