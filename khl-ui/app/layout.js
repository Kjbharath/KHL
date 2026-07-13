import './globals.css';

export const metadata = {
  title: 'KenjuHomieLab — AI Platform Dashboard',
  description: 'Multi-engine AI inference platform with Ollama, vLLM, and ComfyUI orchestration.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
