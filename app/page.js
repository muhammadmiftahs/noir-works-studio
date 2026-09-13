'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PromptGenerator from '../components/PromptGenerator';
import VideoPromptGenerator from '../components/VideoPromptGenerator';
import MetadataGenerator from '../components/MetadataGenerator';
import StatusBar from '../components/StatusBar';

export default function Home() {
  const [tab, setTab] = useState('prompt');
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="wrap">
      <StatusBar />
      <div className="tabs" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={'tab-btn' + (tab === 'prompt' ? ' active' : '')} onClick={() => setTab('prompt')}>
            Prompt Generator
          </button>
          <button className={'tab-btn' + (tab === 'video' ? ' active' : '')} onClick={() => setTab('video')}>
            Video Prompt Generator
          </button>
          <button className={'tab-btn' + (tab === 'metadata' ? ' active' : '')} onClick={() => setTab('metadata')}>
            Metadata Generator
          </button>
        </div>
        <button className="btn-ghost" onClick={handleLogout} title="Keluar dari aplikasi ini">
          Keluar
        </button>
      </div>

      {tab === 'prompt' && <PromptGenerator />}
      {tab === 'video' && <VideoPromptGenerator />}
      {tab === 'metadata' && <MetadataGenerator />}
    </div>
  );
}
