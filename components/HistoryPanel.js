'use client';

import { useState, useCallback } from 'react';
import { listItems, deleteItem, clearItems } from '../lib/savedItems';

export default function HistoryPanel({ kind, label, renderItem }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <details className="reference-box" open={open} onToggle={(e) => {
      const isOpen = e.currentTarget.open;
      setOpen(isOpen);
      if (isOpen) load();
    }}>
      <summary>📦 Riwayat tersimpan di database — {label} {items.length ? `(${items.length})` : ''}</summary>
      <div className="reference-body">
        {loading && <div className="status-row"><span className="spinner"></span> Memuat riwayat…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="field-hint">Belum ada yang tersimpan. Hasil generate akan muncul di sini setelah disimpan.</div>
        )}
        {!loading && items.length > 0 && (
          <>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {items.map((item) => (
                <div className="history-item" key={item.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renderItem ? renderItem(item) : <div className="history-title">{item.title}</div>}
                    <div className="history-meta">
                      {item.model ? `${item.model} · ` : ''}
                      {new Date(item.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <button className="link-btn" onClick={() => handleDelete(item.id)}>Hapus</button>
                </div>
              ))}
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
