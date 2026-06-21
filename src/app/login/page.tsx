import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Suspense
        fallback={
          <section className="w-full max-w-sm rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">加载中...</p>
          </section>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
