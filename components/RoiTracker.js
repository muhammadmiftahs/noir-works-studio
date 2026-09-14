'use client';

import { useState, useEffect } from 'react';
import { listItems } from '../lib/savedItems';
import { computeRoi, computeRoiByNiche, formatMoney, DEFAULT_ROI_ASSUMPTIONS } from '../lib/roiTracker';

export default function RoiTracker() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [assumptions, setAssumptions] = useState(DEFAULT_ROI_ASSUMPTIONS);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Ambil semua jenis item untuk hitung total portfolio
        const [prompts, videos, metadata] = await Promise.all([
          listItems('prompt'),
          listItems('video-prompt'),
          listItems('metadata'),
        ]);
        if (!cancelled) {
          setItems([...prompts, ...videos, ...metadata]);
        }
      } catch (err) {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const totalRoi = computeRoi(items, assumptions);
  const nicheBreakdown = computeRoiByNiche(items, assumptions);

  if (loading) {
    return (
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="status-row">
          <span className="spinner"></span> Memuat data portfolio…
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <div className="dashboard-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="dashboard-title">💰 Earnings Estimator & Niche ROI</h2>
          <p className="dashboard-subtitle">Proyeksi pendapatan berdasarkan aset yang sudah kamu buat (tanpa biaya API)</p>
        </div>
        <button className="btn-ghost" onClick={() => setShowSettings((s) => !s)}>
          ⚙️ Asumsi
        </button>
      </div>

      {showSettings && (
        <div className="field" style={{ background: 'var(--panel-raised)', padding: 14, borderRadius: 6, marginBottom: 16 }}>
          <label>Asumsi Industri Microstock (bisa diubah)</label>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 11 }}>Royaliti per Download (USD)</label>
              <input
                type="number"
                step="0.01"
                value={assumptions.royaltyPerDownload}
                onChange={(e) => setAssumptions((a) => ({ ...a, royaltyPerDownload: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11 }}>Download/bulan per Gambar</label>
              <input
                type="number"
                step="0.01"
                value={assumptions.downloadsPerImageMonth}
                onChange={(e) => setAssumptions((a) => ({ ...a, downloadsPerImageMonth: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11 }}>Target Upload per Bulan</label>
              <input
                type="number"
                value={assumptions.uploadsPerMonth}
                onChange={(e) => setAssumptions((a) => ({ ...a, uploadsPerMonth: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="field-hint" style={{ marginTop: 10 }}>
            Angka default bersifat konservatif. Sesuaikan berdasarkan pengalaman portfolio Anda di Adobe Stock.
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ '--card-color': 'var(--cyan)', '--card-bg': 'rgba(79,214,200,0.1)' }}>
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-content">
            <div className="stat-card-label">Total Aset</div>
            <div className="stat-card-value">{totalRoi.totalAssets}</div>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': 'var(--gold)', '--card-bg': 'rgba(242,177,52,0.1)' }}>
          <div className="stat-card-icon">💵</div>
          <div className="stat-card-content">
            <div className="stat-card-label">Est. Bulanan</div>
            <div className="stat-card-value">{formatMoney(totalRoi.estMonthlyRevenue)}</div>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': '#8E75FF', '--card-bg': 'rgba(142,117,255,0.1)' }}>
          <div className="stat-card-icon">📈</div>
          <div className="stat-card-content">
            <div className="stat-card-label">Est. Tahunan</div>
            <div className="stat-card-value">{formatMoney(totalRoi.estYearlyRevenue)}</div>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': 'var(--muted)', '--card-bg': 'rgba(138,138,142,0.1)' }}>
          <div className="stat-card-icon">🎯</div>
          <div className="stat-card-content">
            <div className="stat-card-label">ROI per Aset</div>
            <div className="stat-card-value">{formatMoney(totalRoi.roiPerAsset)}</div>
          </div>
        </div>
      </div>

      {/* Niche Breakdown */}
      {nicheBreakdown.length > 0 && (
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Breakdown per Niche</h3>
              <p className="chart-subtitle">Niche dengan potensi pendapatan tertinggi</p>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Niche</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>Aset</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>Avg Potensi</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Est. Bulanan</th>
                </tr>
              </thead>
              <tbody>
                {nicheBreakdown.slice(0, 10).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(42,42,46,0.5)' }}>
                    <td style={{ padding: '8px 6px' }}>{row.niche}</td>
                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>{row.totalAssets}</td>
                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>{row.avgPotential}/5</td>
                    <td style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--cyan)', fontWeight: 600 }}>
                      {formatMoney(row.estMonthlyRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="footnote" style={{ marginTop: 16, fontSize: 11 }}>
        <b>Catatan:</b> Perhitungan ini bersifat estimasi berdasarkan asumsi industri. Royaliti aktual Adobe Stock bervariasi
        (Subscription vs On-Demand, tier kontributor, dan negara pembeli). Gunakan sebagai panduan strategis, bukan jaminan pendapatan.
      </div>
    </div>
  );
}
