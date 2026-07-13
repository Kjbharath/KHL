'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ─── Dynamic Endpoints Context ────────────────────────────────
const EndpointsContext = createContext();

function EndpointsProvider({ children }) {
  const [endpoints, setEndpoints] = useState({
    ollama: 'http://localhost:11434',
    vllm: 'http://localhost:8000',
    webui: 'http://localhost:8080',
    hermes: 'http://localhost:8000',
    hermesDashboard: 'http://localhost:9119',
    comfyui: 'http://localhost:8188'
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      setEndpoints({
        ollama: `http://${hostname}:11434`,
        vllm: `http://${hostname}:8000`,
        webui: `http://${hostname}:8080`,
        hermes: `http://${hostname}:8000`,
        hermesDashboard: `http://${hostname}:9119`,
        comfyui: `http://${hostname}:8188`
      });
    }
  }, []);

  return (
    <EndpointsContext.Provider value={{ endpoints, setEndpoints }}>
      {children}
    </EndpointsContext.Provider>
  );
}

// ─── Service Health Polling (Isolated) ────────────────────────
function useIsolatedServiceStatus(url, interval = 15000) {
  const [status, setStatus] = useState('loading');
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setStatus('online');
          setMeta(data);
        } else {
          setStatus('offline');
          setMeta(null);
        }
      } catch {
        if (mounted) {
          setStatus('offline');
          setMeta(null);
        }
      }
    };
    check();
    const id = setInterval(check, interval);
    return () => { mounted = false; clearInterval(id); };
  }, [url, interval]);

  return { status, meta };
}

// ─── Toast System ─────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => onDismiss(t.id)}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn btn-secondary btn-icon" onClick={handleCopy} title="Copy to clipboard" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.7rem' }}>
      {copied ? '✓ Copied' : '📋 Copy'}
    </button>
  );
}

function OpenButton({ url }) {
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="btn btn-secondary btn-icon" 
      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.7rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
      title="Open in new tab"
    >
      🌐 Open
    </a>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="badge-dot" />
      {status === 'loading' ? 'Checking…' : status === 'online' ? 'Online' : 'Offline'}
    </span>
  );
}

// ─── Control Panels ───────────────────────────────────────────

function OllamaPanel({ addToast }) {
  const { endpoints, setEndpoints } = useContext(EndpointsContext);
  const { status, meta } = useIsolatedServiceStatus('/api/ollama/tags');
  
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState('');

  const handlePull = async () => {
    if (!pullName.trim() || pulling) return;
    setPulling(true);
    setPullProgress('Initiating pull…');
    addToast('info', `Pulling ${pullName}…`);

    try {
      const res = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pullName.trim() }),
      });

      if (!res.ok) throw new Error('Pull request failed');
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.status) setPullProgress(json.status);
            } catch {}
          }
        }
      }
      addToast('success', `Successfully pulled ${pullName}`);
      setPullName('');
    } catch (err) {
      addToast('error', `Failed to pull: ${err.message}`);
    } finally {
      setPulling(false);
      setPullProgress('');
    }
  };

  return (
    <div className="panel" style={{ borderColor: 'var(--khl-accent-primary)' }}>
      <div className="panel-header">
        <div className="panel-title">
          <span>🦙</span> Ollama Engine
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="panel-body">
        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Endpoint URL</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              className="pull-input" 
              style={{ padding: '4px 8px', margin: 0, width: '200px' }}
              value={endpoints.ollama} 
              onChange={(e) => setEndpoints({...endpoints, ollama: e.target.value})}
            />
            <CopyButton text={endpoints.ollama} />
            <OpenButton url={endpoints.ollama} />
          </div>
        </div>
        
        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Documentation</span>
          <a href="https://github.com/ollama/ollama/blob/main/docs/api.md" target="_blank" rel="noopener noreferrer" className="comfyui-link" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
            Ollama API Docs ↗
          </a>
        </div>

        <div className="section-title" style={{ marginTop: '24px' }}>Model Manager</div>
        <div className="pull-bar">
          <input
            className="pull-input"
            type="text"
            placeholder="ollama pull model-name"
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePull()}
            disabled={status !== 'online' || pulling}
          />
          <button
            className="btn btn-primary"
            onClick={handlePull}
            disabled={status !== 'online' || pulling || !pullName.trim()}
          >
            {pulling ? '⏳ Pulling…' : '⬇ Pull'}
          </button>
        </div>
        {pulling && pullProgress && (
          <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--khl-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {pullProgress}
            <div className="progress-bar-container">
              <div className="progress-bar indeterminate" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VLLMPanel({ addToast }) {
  const { endpoints, setEndpoints } = useContext(EndpointsContext);
  const { status, meta } = useIsolatedServiceStatus('/api/vllm/models');
  
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState('');

  const activeModel = meta?.data?.[0]?.id || 'No model loaded';

  const handlePull = async () => {
    if (!pullName.trim() || pulling) return;
    setPulling(true);
    setPullProgress('Initiating vLLM model download/load…\n');
    addToast('info', `Configuring vLLM to load ${pullName}…`);

    try {
      const res = await fetch('/api/vllm/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pullName.trim() }),
      });

      if (!res.ok) throw new Error('Load request failed');
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.error) {
                setPullProgress((prev) => prev + `❌ Error: ${json.error}\n`);
                addToast('error', `vLLM load failed: ${json.error}`);
              } else if (json.status) {
                setPullProgress((prev) => prev + `ℹ ${json.status}\n`);
              } else if (json.log) {
                setPullProgress((prev) => prev + json.log);
              }
            } catch {
              setPullProgress((prev) => prev + line + '\n');
            }
          }
        }
      }
      addToast('success', `Successfully configured vLLM with ${pullName}`);
      setPullName('');
    } catch (err) {
      addToast('error', `Failed to load model: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="panel" style={{ borderColor: 'var(--khl-accent-cyan)' }}>
      <div className="panel-header">
        <div className="panel-title">
          <span>⚡</span> vLLM Engine
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="panel-body">
        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Endpoint URL (OpenAI Comp.)</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              className="pull-input" 
              style={{ padding: '4px 8px', margin: 0, width: '200px' }}
              value={endpoints.vllm} 
              onChange={(e) => setEndpoints({...endpoints, vllm: e.target.value})}
            />
            <CopyButton text={`${endpoints.vllm}/v1`} />
            <OpenButton url={`${endpoints.vllm}/v1`} />
          </div>
        </div>
        
        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Active Model</span>
          <span className="detail-value" style={{ color: 'var(--khl-accent-cyan)' }}>{activeModel}</span>
        </div>

        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Documentation</span>
          <a href="https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html" target="_blank" rel="noopener noreferrer" className="comfyui-link" style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: 'rgba(0, 206, 201, 0.3)', color: 'var(--khl-accent-cyan)' }}>
            vLLM API Docs ↗
          </a>
        </div>

        <div className="section-title" style={{ marginTop: '24px' }}>Model Manager</div>
        <div className="pull-bar">
          <input
            className="pull-input"
            type="text"
            placeholder="HuggingFace repository ID (e.g. Qwen/Qwen2.5-Coder-7B-Instruct)"
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePull()}
            disabled={pulling}
            style={{ borderColor: 'rgba(0, 206, 201, 0.3)' }}
          />
          <button
            className="btn btn-primary"
            onClick={handlePull}
            disabled={pulling || !pullName.trim()}
            style={{ background: 'var(--khl-accent-cyan)', borderColor: 'var(--khl-accent-cyan)', color: '#000', boxShadow: 'var(--khl-glow-cyan)' }}
          >
            {pulling ? '⏳ Loading…' : '⬇ Load Model'}
          </button>
        </div>
        {pullProgress && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--khl-text-secondary)' }}>Download / Startup Logs:</span>
              <button className="btn btn-secondary btn-icon" style={{ fontSize: '0.65rem', padding: '2px 6px', width: 'auto' }} onClick={() => setPullProgress('')}>Clear Logs</button>
            </div>
            <pre style={{ 
              maxHeight: '180px', 
              overflowY: 'auto', 
              background: 'rgba(0,0,0,0.5)', 
              color: '#00cecb', 
              fontSize: '0.7rem', 
              fontFamily: 'var(--font-mono)', 
              padding: '8px', 
              borderRadius: '4px',
              border: '1px solid rgba(0, 206, 201, 0.1)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0
            }}>
              {pullProgress}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function useDockerContainerStatus(interval = 10000) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch('/api/engine/toggle');
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          setStatus(data.hermes === 'running' ? 'online' : 'offline');
        } else {
          setStatus('offline');
        }
      } catch {
        if (mounted) setStatus('offline');
      }
    };
    check();
    const id = setInterval(check, interval);
    return () => { mounted = false; clearInterval(id); };
  }, [interval]);

  return status;
}

function HermesPanel({ addToast }) {
  const { endpoints, setEndpoints } = useContext(EndpointsContext);
  const status = useDockerContainerStatus();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    if (toggling) return;
    setToggling(true);
    const action = status === 'online' ? 'hermes_stop' : 'hermes_start';
    addToast('info', status === 'online' ? 'Stopping Hermes Agent...' : 'Starting Hermes Agent...');
    try {
      const res = await fetch('/api/engine/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: action }),
      });
      if (res.ok) {
        addToast('success', status === 'online' ? 'Hermes Agent stopped.' : 'Hermes Agent started.');
      } else {
        addToast('error', 'Action failed.');
      }
    } catch {
      addToast('error', 'Connection error.');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="panel" style={{ borderColor: 'var(--khl-accent-amber)' }}>
      <div className="panel-header">
        <div className="panel-title">
          <span>🦅</span> Hermes Agent
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="panel-body">
        <div className="detail-row" style={{ marginBottom: '16px' }}>
          <span className="detail-label">Hermes Endpoint</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              className="pull-input" 
              style={{ padding: '4px 8px', margin: 0, width: '200px' }}
              value={endpoints.hermes} 
              onChange={(e) => setEndpoints({...endpoints, hermes: e.target.value})}
            />
            <CopyButton text={endpoints.hermes} />
            <OpenButton url={endpoints.hermes} />
          </div>
        </div>

        <div className="detail-row" style={{ marginBottom: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <span className="detail-label">Launch Command</span>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <code style={{ flex: 1, background: 'var(--khl-bg-secondary)', padding: '8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              uv run cli.py
            </code>
            <CopyButton text="uv run cli.py" />
          </div>
        </div>

        <div style={{ padding: '12px', background: 'rgba(253, 203, 110, 0.05)', borderRadius: '8px', border: '1px solid rgba(253, 203, 110, 0.2)', fontSize: '0.8rem', color: 'var(--khl-text-secondary)', marginBottom: '24px' }}>
          <strong style={{ color: 'var(--khl-accent-amber)' }}>Notes:</strong> Ensure Hermes models support tool-calling via function definitions in the prompt. Use <code style={{color:'var(--khl-text-primary)'}}>&lt;think&gt;...&lt;/think&gt;</code> tags to encapsulate chain-of-thought reasoning before outputting the final JSON tool call.
        </div>
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
          {status === 'online' && (
            <a 
              href={endpoints.hermesDashboard} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '1rem', textDecoration: 'none', borderRadius: '30px', boxShadow: 'var(--khl-glow-amber)', background: 'var(--khl-accent-amber)', color: '#000' }}
            >
              🦅 Launch Hermes Dashboard
            </a>
          )}
          <button 
            className={status === 'online' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleToggle} 
            disabled={toggling}
            style={{ 
              padding: '12px 24px', 
              fontSize: '1rem', 
              borderRadius: '30px', 
              cursor: 'pointer',
              ...(status !== 'online' ? {
                background: 'var(--khl-accent-amber)',
                color: '#000',
                border: 'none',
                boxShadow: 'var(--khl-glow-amber)'
              } : {})
            }}
          >
            {toggling ? '⏳ Please wait...' : status === 'online' ? '🔴 Turn Off Hermes' : '🟢 Turn On Hermes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WebUIPanel() {
  const { endpoints, setEndpoints } = useContext(EndpointsContext);
  
  return (
    <div className="panel" style={{ borderLeft: '4px solid var(--khl-accent-primary)' }}>
      <div className="panel-header">
        <div className="panel-title">
          <span>💬</span> Open WebUI Interface
        </div>
      </div>
      <div className="panel-body" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div className="detail-row" style={{ justifyContent: 'center', marginBottom: '24px' }}>
           <span className="detail-label" style={{ marginRight: '12px' }}>WebUI Endpoint:</span>
           <input 
              className="pull-input" 
              style={{ padding: '4px 8px', margin: 0, width: '200px', textAlign: 'center' }}
              value={endpoints.webui} 
              onChange={(e) => setEndpoints({...endpoints, webui: e.target.value})}
            />
        </div>
        <p style={{ color: 'var(--khl-text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          Access your centralized chat, agent execution, and tool interactions.
        </p>
        <a 
          href={endpoints.webui} 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ padding: '16px 32px', fontSize: '1.1rem', textDecoration: 'none', borderRadius: '30px', boxShadow: 'var(--khl-glow-purple)' }}
        >
          🚀 Launch Chat Interface
        </a>
      </div>
    </div>
  );
}

function PonytailDiagnostics({ addToast }) {
  const { status, meta } = useIsolatedServiceStatus('/api/engine/gpu', 10000);
  const [toggling, setToggling] = useState(false);
  
  const gpu = meta || {
    name: 'Checking GPU…',
    utilization: 0,
    vram_total: 8192,
    vram_used: 0,
    temperature: 0,
    fallback: true
  };

  const handleToggle = async (target) => {
    if (toggling) return;
    setToggling(true);
    addToast('info', target === 'stop_all' ? 'Releasing GPU memory...' : `Switching GPU engine to ${target}...`);
    try {
      const res = await fetch('/api/engine/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (res.ok) {
        addToast('success', target === 'stop_all' ? 'Engines stopped.' : `Switched to ${target}. Give it a moment to load.`);
      } else {
        addToast('error', 'Switch failed.');
      }
    } catch {
      addToast('error', 'Connection error.');
    } finally {
      setToggling(false);
    }
  };

  const vramPercent = gpu.vram_total > 0 ? (gpu.vram_used / gpu.vram_total) * 100 : 0;
  const cpuPercent = meta?.cpu_utilization ?? 0;
  const ramTotalBytes = meta?.ram_total ?? 16 * 1024 * 1024 * 1024;
  const ramUsedBytes = meta?.ram_used ?? 0;
  const ramPercent = ramTotalBytes > 0 ? (ramUsedBytes / ramTotalBytes) * 100 : 0;
  const formatGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <div className="panel" style={{ background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.04), rgba(0, 206, 201, 0.04))', borderColor: 'var(--khl-border-active)' }}>
      <div className="panel-header">
         <div className="panel-title"><span>🦄</span> Ponytail Diagnostics</div>
         <StatusBadge status={status} />
      </div>
      <div className="panel-body">
         <p style={{ fontSize: '0.8rem', color: 'var(--khl-text-secondary)', marginBottom: '16px' }}>
           Monitor system health and actively manage VRAM to prevent CUDA OOMs. The "Ponytail" philosophy ensures you always have options.
         </p>
         
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '24px' }}>
           {/* CPU */}
           <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '8px' }}>
                <span>💻 CPU Load</span>
                <strong style={{ color: 'var(--khl-text-primary)' }}>{cpuPercent}%</strong>
              </div>
              <div className="progress-bar-container" style={{ height: '8px', background: 'rgba(255,255,255,0.05)' }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${Math.min(100, Math.max(0, cpuPercent))}%`,
                    background: 'linear-gradient(90deg, #a8ff78, #78ffd6)'
                  }} 
                />
              </div>
           </div>

           {/* System RAM */}
           <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '8px' }}>
                <span>🧠 System RAM</span>
                <strong style={{ color: 'var(--khl-text-primary)' }}>{formatGB(ramUsedBytes)} / {formatGB(ramTotalBytes)} GB ({Math.round(ramPercent)}%)</strong>
              </div>
              <div className="progress-bar-container" style={{ height: '8px', background: 'rgba(255,255,255,0.05)' }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${Math.min(100, Math.max(0, ramPercent))}%`,
                    background: 'linear-gradient(90deg, #4facfe, #00f2fe)'
                  }} 
                />
              </div>
           </div>

           {/* VRAM / GPU */}
           <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '8px' }}>
                <span>📟 GPU VRAM ({gpu.name})</span>
                <strong style={{ color: 'var(--khl-text-primary)' }}>{gpu.vram_used} / {gpu.vram_total} MB ({Math.round(vramPercent)}%)</strong>
              </div>
              <div className="progress-bar-container" style={{ height: '8px', background: 'rgba(255,255,255,0.05)' }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${Math.min(100, Math.max(0, vramPercent))}%`,
                    background: vramPercent > 85 ? 'var(--khl-accent-magenta)' : 'linear-gradient(90deg, var(--khl-accent-primary), var(--khl-accent-cyan))'
                  }} 
                />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--khl-text-secondary)' }}>
                 <span>🔥 Temp: <strong style={{ color: 'var(--khl-text-primary)' }}>{gpu.temperature}°C</strong></span>
                 <span>⚡ GPU Load: <strong style={{ color: 'var(--khl-text-primary)' }}>{gpu.utilization}%</strong></span>
              </div>
           </div>
         </div>

         <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => handleToggle('ollama')} disabled={toggling}>Start Ollama</button>
            <button className="btn btn-secondary" onClick={() => handleToggle('vllm')} disabled={toggling}>Start vLLM</button>
            <button className="btn btn-danger" onClick={() => handleToggle('stop_all')} disabled={toggling}>Kill All Engines (Free VRAM)</button>
         </div>
      </div>
    </div>
  );
}

// ─── Clock Component ──────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{time}</span>;
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function Dashboard() {
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <EndpointsProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-logo">
            <div className="app-logo-icon">⚡</div>
            <div className="app-logo-text">
              <h1>KenjuHomieLab</h1>
              <span>Dynamic Control Center</span>
            </div>
          </div>
          <div className="header-status">
            <div className="pulse-dot" />
            <Clock />
          </div>
        </header>

        <main className="app-content">
          <div className="section-title">System Diagnostics</div>
          <PonytailDiagnostics addToast={addToast} />

          <div className="section-title">AI Engines</div>
          <div className="status-grid">
            <OllamaPanel addToast={addToast} />
            <VLLMPanel addToast={addToast} />
            <HermesPanel addToast={addToast} />
          </div>

          <div className="section-title">Interfaces</div>
          <WebUIPanel />
        </main>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </EndpointsProvider>
  );
}
