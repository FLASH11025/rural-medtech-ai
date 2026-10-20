"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchDoctors } from "../../lib/api";
import type { Doctor } from "../../lib/types";
import { BottomNav, TopBar } from "../components/ui";

const SPECIALTIES = [
  "All Specialties",
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

const SPECIALTY_ICONS: Record<string, string> = {
  Pulmonology: "pulmonology",
  Radiology: "radiology",
  "General Medicine": "medical_services",
  "Chest Medicine": "respiratory_rate",
  "Internal Medicine": "healing",
};

function DoctorCard({ doctor }: { doctor: Doctor }) {
  const icon = SPECIALTY_ICONS[doctor.specialty] || "stethoscope";

  return (
    <article className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-[var(--color-primary-container)] flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[var(--color-primary)] text-[22px]" aria-hidden="true">
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--color-on-surface)] text-sm leading-snug">{doctor.name}</h3>
          <p className="text-xs text-[var(--color-secondary)] font-medium mt-0.5">{doctor.specialty}</p>
          <p className="text-xs text-[var(--color-on-surface-subtle)] mt-0.5">{doctor.hospital_name}</p>
        </div>
        <div className="flex-shrink-0">
          <span className="text-[10px] bg-[var(--color-surface-container)] border border-[var(--color-border)] px-2 py-0.5 rounded-full text-[var(--color-on-surface-muted)]">
            {doctor.district}
          </span>
        </div>
      </div>

      {/* Qualifications */}
      <div className="flex flex-wrap gap-1">
        {doctor.qualifications.map((q) => (
          <span
            key={q}
            className="text-[10px] bg-[var(--color-info-light)] text-[var(--color-info)] border border-[var(--color-info)] px-2 py-0.5 rounded-full font-mono font-semibold"
          >
            {q}
          </span>
        ))}
      </div>

      {/* Languages */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-on-surface-subtle)]">
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">language</span>
        {doctor.languages.join(" · ")}
      </div>

      {/* Recommendation basis */}
      <div className="bg-[var(--color-success-light)] rounded-lg p-2 flex gap-2">
        <span className="material-symbols-outlined text-[var(--color-success)] text-[14px] flex-shrink-0 mt-0.5" aria-hidden="true">
          recommend
        </span>
        <p className="text-[10px] text-[var(--color-success)] leading-snug">
          Recommended based on: specialty match ({doctor.specialty}) · hospital affiliation ({doctor.hospital_name})
        </p>
      </div>

      {/* Demo label */}
      {doctor.is_demo && (
        <p className="text-[9px] text-[var(--color-on-surface-subtle)] italic border-t border-[var(--color-border)] pt-2">
          ⚠ Demonstration record — verify credentials independently. Last updated: {doctor.last_verified}
        </p>
      )}
    </article>
  );
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState("All Specialties");
  const [district, setDistrict] = useState("All Districts");

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { specialty?: string; district?: string } = {};
      if (specialty !== "All Specialties") params.specialty = specialty;
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
    loadDoctors();
  }, [loadDoctors]);

  return (
    <>
      <TopBar title="Doctor Finder" subtitle="Pulmonologists & Radiologists" />

      <main className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Demo notice */}
        <div className="bg-[var(--color-warning-light)] border border-[var(--color-warning)] rounded-lg p-3 flex gap-2">
          <span className="material-symbols-outlined text-[var(--color-warning)] text-[16px] flex-shrink-0 mt-0.5" aria-hidden="true">info</span>
          <p className="text-xs text-[var(--color-warning)]">
            Records shown are <strong>demonstration data only</strong>. Do not contact these providers based on this listing. Always verify credentials through official medical councils.
          </p>
        </div>

        {/* Pneumonia-relevant guidance */}
        <div className="card p-3 flex gap-3 items-start">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-container)] flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[20px]" aria-hidden="true">info</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-on-surface)]">Recommended specialists for pneumonia screening</p>
            <p className="text-[10px] text-[var(--color-on-surface-subtle)] mt-1 leading-snug">
              For pneumonia screening follow-up, consult a <strong>Pulmonologist</strong> (lung specialist) or <strong>General Physician</strong>. Radiologists read X-rays but typically do not manage treatment.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="specialty-filter" className="block text-xs font-medium text-[var(--color-on-surface-muted)] mb-1">
              Specialty
            </label>
            <select
              id="specialty-filter"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium focus:outline-none focus:border-[var(--color-secondary)]"
            >
              {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="district-filter" className="block text-xs font-medium text-[var(--color-on-surface-muted)] mb-1">
              District
            </label>
            <select
              id="district-filter"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium focus:outline-none focus:border-[var(--color-secondary)]"
            >
              {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["Pulmonology", "Radiology", "General Medicine"].map((s) => (
            <button
              key={s}
              onClick={() => setSpecialty(specialty === s ? "All Specialties" : s)}
              className={`h-8 px-3 rounded-full border text-xs font-medium flex-shrink-0 transition-colors ${
                specialty === s
                  ? "bg-[var(--color-secondary)] text-white border-[var(--color-secondary)]"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-on-surface-muted)]"
              }`}
              aria-pressed={specialty === s}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="flex gap-3">
                  <div className="skeleton w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="skeleton h-5 w-12 rounded-full" />
                  <div className="skeleton h-5 w-10 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center space-y-3">
            <span className="material-symbols-outlined text-[36px] text-[var(--color-error)]" aria-hidden="true">cloud_off</span>
            <p className="text-sm text-[var(--color-error)]">{error}</p>
            <button onClick={loadDoctors} className="h-10 px-4 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold">
              Retry
            </button>
          </div>
        ) : doctors.length === 0 ? (
          <div className="card p-8 text-center space-y-2">
            <span className="material-symbols-outlined text-[40px] text-[var(--color-on-surface-subtle)]" aria-hidden="true">
              person_search
            </span>
            <p className="text-sm font-semibold text-[var(--color-on-surface-muted)]">No doctors found</p>
            <p className="text-xs text-[var(--color-on-surface-subtle)]">
              Try different specialty or district filters
            </p>
            <button
              onClick={() => { setSpecialty("All Specialties"); setDistrict("All Districts"); }}
              className="text-xs text-[var(--color-secondary)] underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-on-surface-subtle)]">
              {doctors.length} doctor{doctors.length !== 1 ? "s" : ""} found ·{" "}
              Recommended based on specialty and district match
            </p>
            {doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}
