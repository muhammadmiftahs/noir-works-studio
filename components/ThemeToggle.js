'use client';

import { useTheme } from '../lib/themeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="navbar-icon-btn"
      title={`Ganti ke mode ${theme === 'dark' ? 'light' : 'dark'}`}
      aria-label="Ganti tema"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
