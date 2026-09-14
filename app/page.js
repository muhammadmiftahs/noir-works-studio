'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from '../components/Dashboard';
import PromptGenerator from '../components/PromptGenerator';
import VideoPromptGenerator from '../components/VideoPromptGenerator';
import MetadataGenerator from '../components/MetadataGenerator';
import ImageToPrompt from '../components/ImageToPrompt';
import StatusBar from '../components/StatusBar';

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
      <StatusBar />
      <div className="tabs-row">
        <div className="tabs tabs-scroll">
          <button className={'tab-btn' + (tab === 'dashboard' ? ' active' : '')} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={'tab-btn' + (tab === 'prompt' ? ' active' : '')} onClick={() => setTab('prompt')}>
            Prompt Generator
          </button>
          <button className={'tab-btn' + (tab === 'video' ? ' active' : '')} onClick={() => setTab('video')}>
            Video Prompt Generator
          </button>
          <button className={'tab-btn' + (tab === 'metadata' ? ' active' : '')} onClick={() => setTab('metadata')}>
            Metadata Generator
          </button>
          <button className={'tab-btn' + (tab === 'image2prompt' ? ' active' : '')} onClick={() => setTab('image2prompt')}>
            Image-to-Prompt
          </button>
        </div>
        <button className="btn-ghost logout-btn" onClick={handleLogout} title="Keluar dari aplikasi ini">
          Keluar
        </button>
      </div>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'prompt' && <PromptGenerator />}
      {tab === 'video' && <VideoPromptGenerator />}
      {tab === 'metadata' && <MetadataGenerator />}
      {tab === 'image2prompt' && <ImageToPrompt />}
    </div>
  );
}
