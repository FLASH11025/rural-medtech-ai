"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Ban,
  Check,
  CircleAlert,
  Clock,
  Hospital,
  LayoutDashboard,
  ScanLine,
  Stethoscope,
  TriangleAlert,
  X,
} from "lucide-react";
import { getModelStatus, healthCheck } from "../../lib/api";
import type { ModelStatus } from "../../lib/types";

/* ============================================================
   LOGO — circular purple gradient with lung glyph
   ============================================================ */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <span className="grid flex-shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 28 28" className="rounded-full">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="55%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#3B1F7A" />
          </linearGradient>
        </defs>
        <circle cx="14" cy="14" r="14" fill={`url(#${id})`} />
        <g fill="#ffffff">
          <rect x="13.1" y="6.4" width="1.8" height="7" rx="0.9" />
          <path d="M11.6 12.2c-1 .2-2.5 1.4-2.7 3.6-.2 2.4.9 4.6 3.1 4.9 1.2.2 1.7-.7 1.7-1.9v-5.4c0-1-.9-1.4-2.1-1.2z" />
          <path d="M16.4 12.2c1 .2 2.5 1.4 2.7 3.6.2 2.4-.9 4.6-3.1 4.9-1.2.2-1.7-.7-1.7-1.9v-5.4c0-1 .9-1.4 2.1-1.2z" />
        </g>
      </svg>
    </span>
  );
}

/* ============================================================
   SLIDING PILL HOOK
   ============================================================ */
function useSlidingIndicator(
  containerRef: React.RefObject<HTMLElement | null>,
  refs: React.MutableRefObject<(HTMLElement | null)[]>,
  activeIndex: number
) {
  const [rect, setRect] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[activeIndex];
      const container = containerRef.current;
      if (!el || !container) return;
      const pr = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const left = r.left - pr.left;
      const width = r.width;
      if (width <= 0) return;
      setRect((prev) =>
        prev.ready && prev.left === left && prev.width === width ? prev : { left, width, ready: true }
      );
    };
    const t1 = setTimeout(measure, 0);
    const t2 = setTimeout(measure, 90);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, containerRef, refs]);

  return rect;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/", label: "Scan", icon: ScanLine },
  { href: "/hospitals", label: "Hospitals", icon: Hospital },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/history", label: "History", icon: Clock },
];

/* ============================================================
   TOP BAR — brand + desktop pill tabs + engine status + info
   ============================================================ */
export function TopBar() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((i) => i.href === pathname)
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const indicator = useSlidingIndicator(trackRef, itemRefs, activeIndex);

  const [online, setOnline] = useState<boolean | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    healthCheck().then(setOnline);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    getModelStatus().then(setModel).catch(() => setModel(null));
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanelOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  return (
    <header className="topbar">
      <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Brand — LEFT, never clipped */}
        <Link
          href="/"
          className="flex flex-shrink-0 items-center justify-self-start gap-2.5 whitespace-nowrap"
          aria-label="Rural MedTech AI home"
        >
          <Logo size={28} />
          <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-white">
            Rural MedTech <span className="text-ink2">AI</span>
          </span>
        </Link>

        {/* Desktop pill tabs — CENTER */}
        <nav aria-label="Primary" className="hidden justify-self-center md:block">
          <div ref={trackRef} className="tab-track relative">
            {indicator.ready && (
              <span
                aria-hidden="true"
                className="tab-indicator"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
            {NAV_ITEMS.map((item, i) => {
              const active = i === activeIndex;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={`tab-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={15} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Engine status + model info — RIGHT */}
        <div className="relative flex flex-shrink-0 items-center justify-self-end gap-2">
          <span className="chip chip-ink" role="status" aria-label={`Diagnostic engine ${online === false ? "offline" : "online"}`}>
            <span
              className="dot"
              style={{ background: online === false ? "var(--rederr)" : "var(--lime)", boxShadow: online === false ? "none" : "0 0 8px rgba(198,244,50,.6)" }}
            />
            <span className="hidden sm:inline">{online === false ? "Engine offline" : "Engine online"}</span>
          </span>

          <button
            className="icon-btn"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label="Model information"
            aria-expanded={panelOpen}
          >
            {panelOpen ? <X size={18} /> : <Activity size={18} />}
          </button>

          {panelOpen && (
            <div
              ref={panelRef}
              className="card absolute right-0 top-14 z-50 w-72 p-4"
              role="dialog"
              aria-label="Model status"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-ink2">Model status</p>
                {model && (
                  <span className={`chip ${model.model_loaded ? "chip-normal" : "chip-error"}`}>
                    {model.model_loaded ? "Loaded" : "Missing"}
                  </span>
                )}
              </div>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink2">Architecture</dt>
                  <dd className="truncate font-medium text-white">{model?.architecture ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink2">Classes</dt>
                  <dd className="truncate font-medium text-white">{model?.classes.join(" / ") ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink2">Runtime</dt>
                  <dd className="truncate font-medium text-white">PyTorch {model?.torch_version ?? "—"}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-white/5 pt-2.5 text-[10px] leading-snug text-ink3">
                Screening aid only — not a medical diagnosis. Requires radiologist review.
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   BOTTOM NAV — mobile floating pill
   ============================================================ */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav md:hidden" role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-10 items-center gap-1.5 rounded-full transition-colors ${
              active
                ? "bg-white px-3.5 font-semibold text-black"
                : "grid w-10 place-items-center text-ink2 hover:text-white"
            }`}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
          >
            <Icon size={19} aria-hidden="true" />
            {active && <span className="text-xs">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/* ============================================================
   STATUS BADGE
   ============================================================ */
type BadgeStatus = "pneumonia" | "normal" | "uncertain" | "error";

const BADGE_CONFIG: Record<
  BadgeStatus,
  { label: string; chip: string; icon: React.ComponentType<{ size?: number }> }
> = {
  pneumonia: { label: "Pneumonia Indicated", chip: "chip-pneumonia", icon: TriangleAlert },
  normal: { label: "Normal", chip: "chip-normal", icon: Check },
  uncertain: { label: "Inconclusive", chip: "chip-uncertain", icon: CircleAlert },
  error: { label: "Analysis Failed", chip: "chip-error", icon: Ban },
};

export function StatusBadge({ status, className = "" }: { status: BadgeStatus; className?: string }) {
  const c = BADGE_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={`chip ${c.chip} ${className}`}>
      <Icon size={12} aria-hidden="true" />
      {c.label}
    </span>
  );
}

/* ============================================================
   DISCLAIMER BANNER
   ============================================================ */
export function DisclaimerBanner() {
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl border px-4 py-3"
      style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.22)" }}
      role="note"
    >
      <TriangleAlert size={15} style={{ color: "var(--amber)" }} aria-hidden="true" className="flex-shrink-0" />
      <p className="text-xs leading-snug" style={{ color: "var(--amber)" }}>
        <strong>Screening aid only.</strong> Not a diagnosis. Consult a qualified doctor.
      </p>
    </div>
  );
}

/* ============================================================
   ENGINE OFFLINE BANNER
   ============================================================ */
export function EngineOfflineBanner() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border px-4 py-3" style={{ background: "rgba(248,113,113,0.07)", borderColor: "rgba(248,113,113,0.25)" }} role="alert">
      <span className="dot flex-shrink-0" style={{ background: "var(--rederr)" }} />
      <p className="text-xs leading-snug text-rederr">
        <strong>Engine offline.</strong> Start the backend on 127.0.0.1:8000 to analyze X-rays.
      </p>
    </div>
  );
}

/* ============================================================
   DEMO DATA TAG
   ============================================================ */
export function DemoDataTag({ lastVerified }: { lastVerified?: string }) {
  return (
    <span className="chip chip-uncertain !h-5 !px-2 text-[10px]">
      Demo data{lastVerified ? ` · ${lastVerified}` : ""}
    </span>
  );
}

/* ============================================================
   SKELETON
   ============================================================ */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/* ============================================================
   PILL BUTTON + ICON BUTTON + SEGMENTED CONTROL + STAT CHIP
   ============================================================ */
export function PillButton({
  variant = "dark",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "white" | "dark" | "lime" | "ghost";
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

interface SegOption {
  value: string;
  label: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const indicator = useSlidingIndicator(trackRef, itemRefs, activeIndex);

  return (
    <div
      ref={trackRef}
      className="segmented"
      role="tablist"
      aria-label={ariaLabel}
    >
      {indicator.ready && (
        <span
          aria-hidden="true"
          className="segmented-indicator"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            className={`segmented-item ${active ? "active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatChip({ label }: { label: string }) {
  return <span className="chip chip-ink">{label}</span>;
}

/* ============================================================
   SHARED MOTION HOOKS — reduced-motion + eased count-up
   ============================================================ */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const t = setTimeout(() => setReduced(mq.matches), 0);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", onChange);
    };
  }, []);
  return reduced;
}

export function useCountUp(target: number, reduced: boolean, duration = 600): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setValue(target), 0);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, duration]);
  return value;
}
