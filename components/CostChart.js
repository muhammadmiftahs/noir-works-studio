'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { listItems } from '../lib/savedItems';

export default function CostChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(7); // days

  useEffect(() => {
    if (range <= 0) return;
    setLoading(true);
    listItems('prompt')
      .then((items) => {
        // Group by date (last {range} days)
        const now = new Date();
        const chartData = [];
        for (let i = range - 1; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const dayStart = new Date(date);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(date);
          dayEnd.setHours(23, 59, 59, 999);

          const dayItems = items.filter(
            (it) => new Date(it.created_at) >= dayStart && new Date(it.created_at) <= dayEnd
          );
          chartData.push({ date: dateStr, count: dayItems.length });
        }
        setData(chartData);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [range]);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Prompt per Hari</h3>
          <p className="chart-subtitle">Total {range} hari terakhir</p>
        </div>
        <div className="range-selector">
          <button
            className={'range-btn' + (range === 7 ? ' active' : '')}
            onClick={() => setRange(7)}
            disabled={range === 7}
          >
            7H
          </button>
          <button
            className={'range-btn' + (range === 14 ? ' active' : '')}
            onClick={() => setRange(14)}
            disabled={range === 14}
          >
            14H
          </button>
          <button
            className={'range-btn' + (range === 30 ? ' active' : '')}
            onClick={() => setRange(30)}
            disabled={range === 30}
          >
            30H
          </button>
        </div>
      </div>
      <div className="chart-container">
        {loading ? (
          <div className="chart-loading">Memuat data chart...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4fd6c8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4fd6c8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.5} />
              <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => (val > 0 ? val : '')}
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
              <Area
                type="monotone"
                dataKey="count"
                stroke="#4fd6c8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCount)"
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="chart-footer">
        <span className="chart-total">
          <strong>Total: {total}</strong> prompt di {range} hari terakhir
        </span>
      </div>
    </div>
  );
}
