import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireDentistPageSession } from '@/server/auth/guards';
import { SESSION_COOKIE_NAME } from '@/server/auth/constants';
import LogoutButton from '@/components/auth/logout-button';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const dentist = await requireDentistPageSession(token);

  if (!dentist) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
          <span className="font-semibold">Consultorio odontológico</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
