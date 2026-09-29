// Embeds a sibling app (Inspections, Invoicing) in an iframe that fills the
// main content area. A small header keeps a fallback "open in new tab" link in
// case the embedded app blocks framing (X-Frame-Options / CSP frame-ancestors).
export function AppFrame({ title, src }: { title: string; src: string }) {
  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src={src}
        title={title}
        className="w-full flex-1 rounded-lg border border-slate-200 bg-white"
      />
    </div>
  );
}
