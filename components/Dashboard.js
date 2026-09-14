'use client';

import { useState, useEffect } from 'react';
import { getCounts } from '../lib/savedItems';
import CostChart from './CostChart';
import NicheChart from './NicheChart';
import ActivityTimeline from './ActivityTimeline';

export default function Dashboard() {
  const [stats, setStats] = useState({
    prompt: 0,
    videoPrompt: 0,
    metadata: 0,
    riset: 0,
    risetVideo: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCounts()
      .then((counts) => {
        setStats({
          prompt: counts.prompt || 0,
          videoPrompt: counts['video-prompt'] || 0,
          metadata: counts.metadata || 0,
          riset: counts.riset || 0,
          risetVideo: counts['riset-video'] || 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const totalGenerated = stats.prompt + stats.videoPrompt + stats.metadata;
  const totalResearch = stats.riset + stats.risetVideo;

  const cards = [
    {
      label: 'Total Generated',
      value: totalGenerated,
      icon: '✨',
      color: 'var(--cyan)',
      bgColor: 'rgba(79,214,200,0.1)',
    },
    {
      label: 'Prompt Gambar',
      value: stats.prompt,
      icon: '🖼️',
      color: 'var(--gold)',
      bgColor: 'rgba(242,177,52,0.1)',
    },
    {
      label: 'Prompt Video',
      value: stats.videoPrompt,
      icon: '🎬',
      color: '#8E75FF',
      bgColor: 'rgba(142,117,255,0.1)',
    },
    {
      label: 'Metadata',
      value: stats.metadata,
      icon: '📸',
      color: 'var(--red)',
      bgColor: 'rgba(227,56,79,0.1)',
    },
    {
      label: 'Total Riset',
      value: totalResearch,
      icon: '🔍',
      color: 'var(--muted)',
      bgColor: 'rgba(138,138,142,0.1)',
    },
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span className="spinner"></span> Memuat dashboard...
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">Dashboard Overview</h2>
          <p className="dashboard-subtitle">Ringkasan aktivitas generate & riset Anda</p>
        </div>
      </div>

      <div className="stats-grid">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className="stat-card"
            style={{
              '--card-color': card.color,
              '--card-bg': card.bgColor,
              animationDelay: `${idx * 0.1}s`,
            }}
          >
            <div className="stat-card-icon">{card.icon}</div>
            <div className="stat-card-content">
              <div className="stat-card-label">{card.label}</div>
              <div className="stat-card-value">{card.value.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <CostChart />
          <NicheChart />
        </div>
        <div className="dashboard-side">
          <ActivityTimeline />
        </div>
      </div>
    </div>
  );
}
