import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { resolveLoginPage } from '@/server/auth/guards';
import { SESSION_COOKIE_NAME } from '@/server/auth/constants';
import { sanitizeNext } from '@/server/auth/schemas';

import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const redirectTarget = await resolveLoginPage(token);
  if (redirectTarget) {
    redirect(redirectTarget);
  }

  const next = sanitizeNext(searchParams?.next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <LoginForm next={next} />
    </main>
  );
}
