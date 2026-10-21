"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CircleAlert,
  Languages,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { fetchDoctors } from "../../lib/api";
import type { Doctor } from "../../lib/types";
import {
  BottomNav,
  DemoDataTag,
  DisclaimerBanner,
  PillButton,
  Skeleton,
  TopBar,
} from "../components/ui";

const SPECIALTIES = [
  "All",
  "Pulmonology",
  "Radiology",
  "General Medicine",
  "Chest Medicine",
  "Internal Medicine",
];

const DISTRICTS = [
  "All Districts",
  "Nellore",
  "Kurnool",
  "Visakhapatnam",
  "Tirupati",
  "Guntur",
  "Vijayawada",
  "Hyderabad",
  "Warangal",
];

function initials(name: string): string {
  const clean = name.replace(/^Dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "D";
}

function DoctorCard({ doctor: d }: { doctor: Doctor }) {
  return (
    <article className="card flex flex-col gap-3.5 p-5">
      <div className="flex items-start gap-3.5">
        <div
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)" }}
          aria-hidden="true"
        >
          {initials(d.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{d.name}</h3>
          <p className="mt-1 truncate text-xs text-ink2">{d.hospital_name}</p>
        </div>
        <span className="chip chip-violet flex-shrink-0">{d.district}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip chip-violet">{d.specialty}</span>
        {d.qualifications.map((q) => (
          <span key={q} className="chip chip-ink">
            {q}
          </span>
        ))}
      </div>

      {d.languages.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink2">
          <Languages size={14} className="flex-shrink-0" aria-hidden="true" />
          {d.languages.join(" · ")}
        </p>
      )}

      <p className="rounded-xl border border-white/5 bg-white/3 px-3 py-2 text-[11px] leading-snug text-ink3">
        Recommended because: {d.specialty} matches pneumonia follow-up · affiliated with {d.hospital_name}
      </p>

      {d.is_demo && (
        <p className="mt-auto border-t border-white/5 pt-3">
          <DemoDataTag lastVerified={d.last_verified} />
        </p>
      )}
    </article>
  );
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState("All");
  const [district, setDistrict] = useState("All Districts");

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { specialty?: string; district?: string } = {};
      if (specialty !== "All") params.specialty = specialty;
      if (district !== "All Districts") params.district = district;
      const data = await fetchDoctors(params);
      setDoctors(data);
    } catch {
      setError("Could not load doctor directory. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [specialty, district]);

  useEffect(() => {
    const t = setTimeout(loadDoctors, 0);
    return () => clearTimeout(t);
  }, [loadDoctors]);

  return (
    <>
      <TopBar />

      <main className="container-x pb-28 pt-6 md:pb-12">
        <div className="mb-6">
          <h1 className="text-[28px] font-medium leading-tight tracking-tight md:text-[40px]">
            Find a <span className="text-ink2">doctor</span>
          </h1>
          <p className="mt-1 text-sm text-ink2">
            Demonstration specialist records — verify credentials through official medical councils.
          </p>
        </div>

        {/* Quick filter chips */}
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
          {SPECIALTIES.map((s) => (
            <button
              key={s}
              onClick={() => setSpecialty(s)}
              className={`btn !h-10 !px-4 text-xs ${specialty === s ? "btn-white" : "btn-dark"}`}
              aria-pressed={specialty === s}
            >
              {s}
            </button>
          ))}
        </div>

        {/* District */}
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="input-dark appearance-none pl-4 pr-9"
              aria-label="Filter by district"
            >
              {DISTRICTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true">
              ▾
            </span>
          </div>
          <p className="text-xs text-ink3">Pulmonologists and physicians manage treatment; radiologists read images.</p>
        </div>

        {/* Results */}
        {loading ? (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card p-5">
                <div className="mb-4 flex items-start gap-3.5">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card grid place-items-center gap-3 p-10 text-center" role="alert">
            <CircleAlert size={28} style={{ color: "var(--rederr)" }} aria-hidden="true" />
            <p className="text-sm text-ink2">{error}</p>
            <PillButton variant="white" onClick={loadDoctors}>
              Retry
            </PillButton>
          </div>
        ) : doctors.length === 0 ? (
          <div className="card grid place-items-center gap-3 p-10 text-center">
            <Search size={28} className="text-ink3" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">No doctors found</p>
            <p className="text-xs text-ink3">Try a different specialty or district</p>
            <PillButton
              variant="ghost"
              onClick={() => {
                setSpecialty("All");
                setDistrict("All Districts");
              }}
            >
              <X size={14} aria-hidden="true" />
              Clear filters
            </PillButton>
          </div>
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <p className="col-span-full flex items-center gap-2 text-xs text-ink3">
              <Stethoscope size={14} aria-hidden="true" />
              {doctors.length} doctor{doctors.length !== 1 ? "s" : ""} found · ranked by specialty and district match
            </p>
            {doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        )}

        <div className="mt-6">
          <DisclaimerBanner />
        </div>
      </main>

      <BottomNav />
    </>
  );
}
