'use client';

import { useState } from 'react';

export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        window.location.assign('/login');
        return;
      }
      setError('No se pudo cerrar la sesión.');
    } catch {
      setError('No se pudo cerrar la sesión.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {pending ? 'Cerrando...' : 'Cerrar sesión'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
