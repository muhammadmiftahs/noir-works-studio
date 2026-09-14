'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { listItems } from '../lib/savedItems';

const COLORS = ['#4fd6c8', '#8E75FF', '#f2b134', '#e3384f', '#4285F4'];

export default function NicheChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('prompt'); // prompt | video-prompt | metadata

  useEffect(() => {
    setLoading(true);
    listItems(kind)
      .then((items) => {
        const counts = {};
        items.forEach((it) => {
          const niche = (it.data?.niche || '').trim().toLowerCase();
          if (niche) {
            counts[niche] = (counts[niche] || 0) + 1;
          }
        });
        const top = Object.entries(counts)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);
        setData(top);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [kind]);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Top Niche</h3>
          <p className="chart-subtitle">Kategori paling sering di-generate</p>
        </div>
        <div className="range-selector">
          <button
            className={'range-btn' + (kind === 'prompt' ? ' active' : '')}
            onClick={() => setKind('prompt')}
          >
            Prompt
          </button>
          <button
            className={'range-btn' + (kind === 'video-prompt' ? ' active' : '')}
            onClick={() => setKind('video-prompt')}
          >
            Video
          </button>
          <button
            className={'range-btn' + (kind === 'metadata' ? ' active' : '')}
            onClick={() => setKind('metadata')}
          >
            Metadata
          </button>
        </div>
      </div>
      <div className="chart-container">
        {loading ? (
          <div className="chart-loading">Memuat data niche...</div>
        ) : data.length === 0 ? (
          <div className="chart-loading">Belum ada data niche untuk ditampilkan.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.4} horizontal={false} />
              <XAxis type="number" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={150}
                tickFormatter={(val) => (val.length > 18 ? val.slice(0, 17) + '…' : val)}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  color: 'var(--white)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18} animationDuration={600}>
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}