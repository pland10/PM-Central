import Link from "next/link";

// Tactical | Strategic switcher, shown on top of both meeting pages.
export function MeetingTabs({ active }: { active: "tactical" | "strategic" }) {
  const tabs = [
    { key: "tactical", href: "/meetings", label: "Monday · Tactical" },
    { key: "strategic", href: "/meetings/strategic", label: "Tuesday · Strategic" },
  ] as const;
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            active === t.key
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
