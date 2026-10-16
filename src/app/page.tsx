export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">Turnos Odontología</h1>
      <p className="text-slate-600">
        Fundación del proyecto lista. La reserva de turnos y la agenda llegan en los próximos
        changes; por ahora el único endpoint es <code>GET /api/health</code>.
      </p>
    </main>
  );
}
