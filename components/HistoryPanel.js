'use client';

import { useState, useCallback, useMemo } from 'react';
import { listItems, deleteItem, clearItems } from '../lib/savedItems';

export default function HistoryPanel({ kind, label, renderItem }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filterDate, setFilterDate] = useState('all'); // all | today | week | month

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listItems(kind);
      setItems(data);
    } catch (err) {
      setError(err.message || 'Gagal memuat riwayat. Pastikan DATABASE_URL sudah diset.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.filter((item) => {
        const title = (item.title || '').toLowerCase();
        const modelStr = (item.model || '').toLowerCase();
        return title.includes(query) || modelStr.includes(query);
      });
    }

    if (filterDate !== 'all') {
      const now = Date.now();
      result = result.filter((item) => {
        const itemTime = new Date(item.created_at).getTime();
        const diffMs = now - itemTime;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        switch (filterDate) {
          case 'today':
            return diffDays < 1;
          case 'week':
            return diffDays < 7;
          case 'month':
            return diffDays < 30;
          default:
            return true;
        }
      });
    }

    return result;
  }, [items, searchText, filterDate]);

  async function handleDelete(id) {
    try {
      await deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      setError(err.message || 'Gagal menghapus item.');
    }
  }

  async function handleClearAll() {
    if (!confirm(`Hapus semua riwayat "${label}" yang tersimpan di database?`)) return;
    try {
      await clearItems(kind);
      setItems([]);
    } catch (err) {
      setError(err.message || 'Gagal menghapus riwayat.');
    }
  }

  return (
    <details
      className="reference-box"
      open={open}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        setOpen(isOpen);
        if (isOpen) load();
      }}
    >
      <summary>📦 Riwayat tersimpan di database — {label} {items.length ? `(${items.length})` : ''}</summary>
      <div className="reference-body">
        {loading && <div className="status-row"><span className="spinner"></span> Memuat riwayat…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="field-hint">Belum ada yang tersimpan. Hasil generate akan muncul di sini setelah disimpan.</div>
        )}
        {!loading && items.length > 0 && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Cari judul atau model..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 3,
                  border: '1px solid var(--line)',
                  background: 'var(--panel-raised)',
                  color: 'var(--white)',
                  flex: 1,
                  minWidth: 150,
                }}
              />
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 3,
                  border: '1px solid var(--line)',
                  background: 'var(--panel-raised)',
                  color: 'var(--white)',
                }}
              >
                <option value="all">Semua waktu</option>
                <option value="today">Hari ini</option>
                <option value="week">Minggu ini</option>
                <option value="month">Bulan ini</option>
              </select>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{filteredItems.length} hasil</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredItems.length === 0 ? (
                <div className="field-hint">Tidak ada hasil yang cocok.</div>
              ) : (
                filteredItems.map((item) => (
                  <div className="history-item" key={item.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderItem ? renderItem(item) : <div className="history-title">{item.title}</div>}
                      <div className="history-meta">
                        {item.model ? `${item.model} · ` : ''}
                        {new Date(item.created_at).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <button className="link-btn" onClick={() => handleDelete(item.id)}>
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
            <button className="btn-ghost" style={{ marginTop: 10 }} onClick={handleClearAll}>
              Hapus semua riwayat {label}
            </button>
          </>
        )}
      </div>
    </details>
  );
}
