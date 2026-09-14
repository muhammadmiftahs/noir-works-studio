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
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'video', label: 'Video' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'image2prompt', label: 'Image→Prompt' },
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
      {/* ============ STICKY NAVBAR ============ */}
      <div className="sticky-navbar">
        <div className="navbar-inner">
          {/* Logo */}
          <div className="navbar-logo">
            <div className="eyebrow">CASE FILE</div>
            <h1 className="title">
              NO<span className="accent">Ï</span>R
            </h1>
          </div>

          {/* Status Bar di tengah */}
          <div className="navbar-status">
            <StatusBar />
          </div>

          {/* Logout & Theme */}
          <div className="navbar-actions">
            <ThemeToggle />
            <button className="btn-ghost logout-btn" onClick={handleLogout} title="Keluar dari aplikasi ini">
              Keluar
            </button>
          </div>
        </div>

        {/* Tab Switcher di bawah logo */}
        <div className="navbar-tabs">
          <div className="tabs tabs-scroll">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={'tab-btn' + (tab === t.id ? ' active' : '')}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ============ KONTEN UTAMA ============ */}
      <div className="main-content">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'prompt' && <PromptGenerator />}
        {tab === 'video' && <VideoPromptGenerator />}
        {tab === 'metadata' && <MetadataGenerator />}
        {tab === 'image2prompt' && <ImageToPrompt />}
      </div>
    </div>
  );
}
