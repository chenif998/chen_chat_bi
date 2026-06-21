'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '登录失败');
      }

      const from = searchParams.get('from') || '/';
      router.replace(from);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-sm rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-sky-900">CHAT BI</h1>
      <p className="mt-2 text-sm text-zinc-600">请输入访问密码后继续。</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="访问密码"
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring"
        />
        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? '验证中...' : '进入系统'}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
