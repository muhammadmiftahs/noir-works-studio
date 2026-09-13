'use client';

import { useTheme } from '../lib/themeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        background: 'none',
        border: '1px solid var(--line)',
        color: 'var(--muted)',
        padding: '8px 14px',
        borderRadius: 3,
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'IBM Plex Mono, monospace',
      }}
      title={`Ganti ke mode ${theme === 'dark' ? 'light' : 'dark'}`}
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
