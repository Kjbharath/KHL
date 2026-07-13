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

## Ponytail Philosophy

This platform embraces the "Ponytail" engineering philosophy: keeping things sleek, deleting over-engineered cruft, and focusing on pure speed and utility. The dashboard polling has been optimized for low latency and zero UI blocking.
