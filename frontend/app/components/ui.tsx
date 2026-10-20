"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", icon: "document_scanner", label: "Scan", activeColor: "text-[#0d7377]" },
  { href: "/hospitals", icon: "local_hospital", label: "Hospitals", activeColor: "text-[#0d7377]" },
  { href: "/doctors", icon: "stethoscope", label: "Doctors", activeColor: "text-[#0d7377]" },
  { href: "/history", icon: "history", label: "History", activeColor: "text-[#0d7377]" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[var(--color-border)] safe-area-pb"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[60px] ${
                isActive
                  ? `${item.activeColor} font-semibold`
                  : "text-[var(--color-on-surface-subtle)] hover:text-[var(--color-on-surface-muted)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`material-symbols-outlined text-[24px]`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TopBar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[var(--color-border)] shadow-sm">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[18px]" aria-hidden="true">
              radiology
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-[var(--color-primary)] truncate leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[11px] text-[var(--color-on-surface-subtle)] truncate leading-tight">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function StatusBadge({
  status,
}: {
  status: "pneumonia" | "normal" | "uncertain" | "error";
}) {
  const config = {
    pneumonia: {
      label: "Pneumonia Indicated",
      icon: "warning",
      bg: "bg-[var(--color-pneumonia-bg)]",
      text: "text-[var(--color-pneumonia)]",
      border: "border-[var(--color-pneumonia)]",
    },
    normal: {
      label: "Normal",
      icon: "check_circle",
      bg: "bg-[var(--color-normal-bg)]",
      text: "text-[var(--color-normal)]",
      border: "border-[var(--color-normal)]",
    },
    uncertain: {
      label: "Inconclusive",
      icon: "help",
      bg: "bg-[var(--color-uncertain-bg)]",
      text: "text-[var(--color-uncertain)]",
      border: "border-[var(--color-uncertain)]",
    },
    error: {
      label: "Analysis Failed",
      icon: "error",
      bg: "bg-[var(--color-error-light)]",
      text: "text-[var(--color-error)]",
      border: "border-[var(--color-error)]",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{c.icon}</span>
      {c.label}
    </span>
  );
}

export function DisclaimerBanner() {
  return (
    <div
      className="bg-[var(--color-info-light)] border border-[var(--color-info)] rounded-lg p-3 flex gap-2"
      role="note"
    >
      <span className="material-symbols-outlined text-[var(--color-info)] text-[18px] flex-shrink-0 mt-0.5" aria-hidden="true">
        info
      </span>
      <p className="text-xs text-[var(--color-info)] leading-snug">
        <strong>Screening tool only.</strong> This AI provides preliminary analysis to assist
        healthcare workers. It does not replace a qualified radiologist or physician.
        Always obtain professional medical evaluation before treatment decisions.
      </p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
