FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV COMFYUI_DIR=/root/ComfyUI

# Install system deps
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv git wget \
    && rm -rf /var/lib/apt/lists/*

# Clone ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git ${COMFYUI_DIR}

WORKDIR ${COMFYUI_DIR}

# Create venv and install deps
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 && \
    pip install --no-cache-dir -r requirements.txt

EXPOSE 8188

# Start ComfyUI on all interfaces
CMD ["/bin/bash", "-c", ". venv/bin/activate && python3 main.py --listen 0.0.0.0 --port 8188"]
