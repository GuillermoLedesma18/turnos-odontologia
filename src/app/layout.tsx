import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'Turnos Odontología',
  description: 'Reserva de turnos y agenda para consultorio odontológico',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
