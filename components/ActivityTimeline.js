'use client';

import { useState, useEffect } from 'react';
import { listItems } from '../lib/savedItems';

const KIND_LABELS = {
  prompt: 'Prompt Gambar',
  'video-prompt': 'Prompt Video',
  metadata: 'Metadata',
  riset: 'Riset Tren',
  'riset-video': 'Riset Video',
};

const KIND_ICONS = {
  prompt: '🖼️',
  'video-prompt': '🎬',
  metadata: '📸',
  riset: '🔍',
  'riset-video': '🎬',
};

const KIND_COLORS = {
  prompt: 'var(--gold)',
  'video-prompt': '#8E75FF',
  metadata: 'var(--red)',
  riset: 'var(--muted)',
  'riset-video': '#8E75FF',
};

export default function ActivityTimeline({ maxItems = 10 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listItems('prompt').catch(() => []),
      listItems('video-prompt').catch(() => []),
      listItems('metadata').catch(() => []),
    ])
      .then(([prompts, videos, metadata]) => {
        const all = [...prompts, ...videos, ...metadata];
        all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setItems(all.slice(0, maxItems));
      })
      .finally(() => setLoading(false));
  }, [maxItems]);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Aktivitas Terbaru</h3>
          <p className="chart-subtitle">{items.length} aktivitas terakhir</p>
        </div>
      </div>
      <div className="timeline-container">
        {loading ? (
          <div className="chart-loading">Memuat aktivitas...</div>
        ) : items.length === 0 ? (
          <div className="chart-loading">Belum ada aktivitas yang tercatat.</div>
        ) : (
          <div className="timeline-list">
            {items.map((item, idx) => {
              const kind = item.kind || 'prompt';
              const label = KIND_LABELS[kind] || kind;
              const icon = KIND_ICONS[kind] || '📝';
              const color = KIND_COLORS[kind] || 'var(--cyan)';

              const time = new Date(item.created_at);
              const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
              const dateStr = time.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

              return (
                <div
                  key={item.id || idx}
                  className="timeline-item"
                  style={{
                    '--timeline-color': color,
                    animationDelay: `${idx * 0.05}s`,
                  }}
                >
                  <div className="timeline-dot"></div>
                  <div className="timeline-line"></div>
                  <div className="timeline-icon">{icon}</div>
                  <div className="timeline-content">
                    <div className="timeline-title">{item.title || 'Tanpa judul'}</div>
                    <div className="timeline-meta">
                      <span className="timeline-kind" style={{ color }}>{label}</span>
                      {item.model && <span className="timeline-model"> · {item.model}</span>}
                      <span className="timeline-date"> · {dateStr} {timeStr}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
