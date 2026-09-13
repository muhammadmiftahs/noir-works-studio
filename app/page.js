'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PromptGenerator from '../components/PromptGenerator';
import MetadataGenerator from '../components/MetadataGenerator';

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
      <div className="tabs" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={'tab-btn' + (tab === 'prompt' ? ' active' : '')} onClick={() => setTab('prompt')}>
            Prompt Generator
          </button>
          <button className={'tab-btn' + (tab === 'metadata' ? ' active' : '')} onClick={() => setTab('metadata')}>
            Metadata Generator
          </button>
        </div>
        <button className="btn-ghost" onClick={handleLogout} title="Keluar dari aplikasi ini">
          Keluar
        </button>
      </div>

      {tab === 'prompt' ? <PromptGenerator /> : <MetadataGenerator />}
    </div>
  );
}
