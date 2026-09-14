'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from '../components/Dashboard';
import PromptGenerator from '../components/PromptGenerator';
import VideoPromptGenerator from '../components/VideoPromptGenerator';
import MetadataGenerator from '../components/MetadataGenerator';
import ImageToPrompt from '../components/ImageToPrompt';
import StatusBar from '../components/StatusBar';
import ThemeToggle from '../components/ThemeToggle';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home' },
  { id: 'prompt', label: 'Prompt Generator', short: 'Prompt' },
  { id: 'video', label: 'Video Prompt', short: 'Video' },
  { id: 'metadata', label: 'Metadata', short: 'Meta' },
  { id: 'image2prompt', label: 'Image-to-Prompt', short: 'Image' },
];

export default function Home() {
  const [tab, setTab] = useState('dashboard');
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="wrap">
      {/* ============ COMPACT STICKY NAVBAR ============ */}
      <header className="sticky-navbar">
        <div className="navbar-inner">
          {/* Logo mini */}
          <div className="navbar-logo-compact" title="Noïr Works Studio">
            NO<span className="accent">Ï</span>R
          </div>

          {/* Status compact */}
          <StatusBar />

          {/* Icon actions */}
          <div className="navbar-actions">
            <ThemeToggle />
            <button
              className="navbar-icon-btn"
              onClick={handleLogout}
              title="Keluar dari aplikasi"
              aria-label="Keluar"
            >
              ⏻
            </button>
          </div>
        </div>

        {/* Tab segments — compact */}
        <nav className="navbar-tabs-compact" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={'nav-seg' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <span className="nav-seg-full">{t.label}</span>
              <span className="nav-seg-short">{t.short}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* ============ KONTEN UTAMA ============ */}
      <main className="main-content">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'prompt' && <PromptGenerator />}
        {tab === 'video' && <VideoPromptGenerator />}
        {tab === 'metadata' && <MetadataGenerator />}
        {tab === 'image2prompt' && <ImageToPrompt />}
      </main>
    </div>
  );
}
