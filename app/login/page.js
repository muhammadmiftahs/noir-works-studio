'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || 'Password salah.');
        return;
      }
      const next = params.get('next') || '/';
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError('Gagal menghubungi server. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap login-wrap">
      <div className="eyebrow">CASE FILE · ACCESS</div>
      <h1 className="title" style={{ fontSize: 28 }}>
        NO<span className="accent">Ï</span>R WORKS
      </h1>
      <div className="title-rule"></div>
      <p className="desc">Masukkan password untuk mengakses Prompt Generator &amp; Metadata Generator.</p>

      <form onSubmit={handleSubmit} className="panel" style={{ marginTop: 20 }}>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            autoFocus
          />
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn-primary full" type="submit" disabled={busy || !password}>
          {busy ? 'Memeriksa...' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
