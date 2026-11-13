"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchOptions } from "@/lib/option-search";

// Type-ahead picker that replaces a native <datalist> (which dumps every option
// that contains the text, with no height limit). Shows the best `limit`
// matches (see searchOptions), arrow keys / Enter / Esc, and a "keep typing"
// hint. The list renders in a portal at a fixed position, so a scrolling table
// or a modal can't clip it.
//
// `strict` (pick-from-list fields like Property): the top match is highlighted,
// so Enter takes it. Otherwise (free text like Category) Enter keeps what you
// typed unless you arrowed onto a suggestion.
// `onCommit` fires once per change: on a pick, on Enter, or on blur.

export function Combobox({
  options,
  value,
  onChange,
  onCommit,
  ariaLabel,
  placeholder,
  className = "",
  strict = false,
  limit = 8,
  autoFocus,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  strict?: boolean;
  limit?: number;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(value); // last value handed to onCommit (or the initial one)
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);

  const result = useMemo(() => searchOptions(options, value, limit), [options, value, limit]);
  const exact = result.items.length === 1 && result.items[0] === value;
  const show = open && result.items.length > 0 && !exact;

  // Keep the highlight sensible as the matches change.
  useEffect(() => {
    setActive(strict && value.trim() ? 0 : -1);
  }, [value, strict]);

  // Position under the input; follow scrolling/resizing while open.
  useLayoutEffect(() => {
    if (!show) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 2, minWidth: r.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [show]);

  function commit(v: string) {
    if (v === committed.current) return;
    committed.current = v;
    onCommit?.(v);
  }

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    commit(v);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = result.items.length;
      if (!n) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (show && active >= 0 && result.items[active]) pick(result.items[active]);
      else {
        setOpen(false);
        commit(value);
      }
      inputRef.current?.blur();
    } else if (e.key === "Escape" && show) {
      e.stopPropagation(); // close the list, not a surrounding modal
      setOpen(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          commit(value);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {show &&
        pos &&
        createPortal(
          <div
            style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: Math.max(pos.minWidth, 224) }}
            className="z-[60] max-w-[26rem] overflow-hidden rounded-md border border-slate-200 bg-white text-xs shadow-lg"
          >
            <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-auto py-1">
              {result.items.map((o, i) => (
                <li
                  key={o}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer truncate px-2.5 py-1.5 ${i === active ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}
                  title={o}
                >
                  {o}
                </li>
              ))}
            </ul>
            {result.more > 0 && (
              <div className="border-t border-slate-100 px-2.5 py-1 text-[11px] text-slate-400">
                {result.more} more — keep typing to narrow
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
