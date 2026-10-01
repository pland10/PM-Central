export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-500">{note}</p>
        <p className="mt-2 text-sm text-slate-400">
          The data model already supports this — the screen is next.
        </p>
      </div>
    </div>
  );
}
