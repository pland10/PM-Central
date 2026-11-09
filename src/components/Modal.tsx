"use client";

import { useEffect, useId, useRef } from "react";

// In-app modal (instead of the browser's confirm/alert boxes). Closes on Esc or
// a click on the backdrop; the first button in the footer gets focus.
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector<HTMLButtonElement>("[data-autofocus], footer button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-800">
          {title}
        </h2>
        <div className="px-5 py-4 text-sm text-slate-700">{children}</div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>
      </div>
    </div>
  );
}
