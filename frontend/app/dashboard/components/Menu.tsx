"use client";
import { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function Menu({ actions, label }: { actions: MenuAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <EllipsisVertical size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="card absolute right-0 top-10 z-50 w-44 overflow-hidden p-1"
          role="menu"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                a.danger
                  ? "text-rederr hover:bg-rederr/10"
                  : "text-ink2 hover:bg-white/5 hover:text-white"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
