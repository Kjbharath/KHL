import { render, screen, waitFor, act } from '@testing-library/react';
import Dashboard from './page';

// Mock fetch globally
global.fetch = jest.fn();

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetch.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders the dashboard header', async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false }));
    await act(async () => {
      render(<Dashboard />);
    });
    expect(screen.getByText(/KenjuHomieLab/i)).toBeInTheDocument();
    expect(screen.getByText(/Multi-Engine AI Platform/i)).toBeInTheDocument();
  });

  it('polls and displays GPU metrics', async () => {
    const mockGpuData = {
      name: 'NVIDIA RTX 4090',
      utilization: 45,
      vram_total: 24576,
      vram_used: 12000,
      temperature: 65,
      fallback: false
    };

    fetch.mockImplementation((url) => {
      if (url === '/api/engine/gpu') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGpuData),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Dashboard />);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Wait for microtasks to flush
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/NVIDIA RTX 4090/i)).toBeInTheDocument();
    expect(screen.getByText(/12000 MB \/ 24576 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/65°C/i)).toBeInTheDocument();
    expect(screen.getAllByText(/45%/i).length).toBeGreaterThan(0);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    
    const gpuCalls = fetch.mock.calls.filter(call => call[0] === '/api/engine/gpu');
    expect(gpuCalls.length).toBeGreaterThan(1);
  });

  it('displays correct initial statuses for services', async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false }));
    render(<Dashboard />);
    
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getAllByText(/Ollama Engine/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vLLM Engine/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ComfyUI/i).length).toBeGreaterThan(0);
  });

  it('handles service status polling correctly for Ollama', async () => {
    fetch.mockImplementation((url) => {
      if (url === '/api/ollama/tags') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [{ name: 'llama3', size: 1024 }] }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Dashboard />);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const badges = screen.getAllByText(/Online/i);
    expect(badges.length).toBeGreaterThan(0);
  });
});
