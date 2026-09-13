// Statistik penggunaan niche dari riwayat database
'use client';

import { useState, useEffect } from 'react';
import { listItems } from '../lib/savedItems';

export default function NicheStats({ kind, label }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listItems(kind)
      .then((items) => {
        const counts = {};
        items.forEach((it) => {
          const niche = (it.data?.niche || it.title || 'Lainnya').trim().toLowerCase();
          if (niche) {
            counts[niche] = (counts[niche] || 0) + 1;
          }
        });
        const sorted = Object.entries(counts)
          .map(([niche, count]) => ({ niche, count }))
          .sort((a, b) => b.count - a.count);
        setStats(sorted);
      })
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [kind, open]);

  return (
    <details
      className="reference-box"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{ marginTop: 12 }}
    >
      <summary>📊 Statistik Niche / Kategori Paling Sering — {label}</summary>
      <div className="reference-body">
        {loading && <div className="status-row"><span className="spinner"></span> Menghitung statistik…</div>}
        {!loading && stats.length === 0 && (
          <div className="field-hint">Belum ada data riwayat untuk dihitung statistiknya.</div>
        )}
        {!loading && stats.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {stats.map((s, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  padding: '6px 10px',
                  background: 'var(--panel-raised)',
                  borderRadius: 3,
                  border: '1px solid var(--line)',
                }}
              >
                <span style={{ color: 'var(--white)', textTransform: 'capitalize' }}>{s.niche}</span>
                <span
                  style={{
                    color: 'var(--cyan)',
                    fontWeight: 600,
                    background: 'rgba(79,214,200,0.1)',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {s.count}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
