"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchHospitals } from "../../lib/api";
import type { Hospital } from "../../lib/types";
import { BottomNav, TopBar } from "../components/ui";

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

const TYPE_COLORS: Record<string, string> = {
  Government: "bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]",
  Private: "bg-[var(--color-primary-container)] text-[var(--color-primary)] border-[var(--color-primary)]",
  PHC: "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]",
  CHC: "bg-[var(--color-secondary-container)] text-[var(--color-secondary)] border-[var(--color-secondary)]",
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function HospitalCard({ hospital, userLat, userLon }: {
  hospital: Hospital;
  userLat?: number;
  userLon?: number;
}) {
  const distance =
    userLat && userLon && hospital.lat && hospital.lon
      ? haversineKm(userLat, userLon, hospital.lat, hospital.lon)
      : null;

  const typeColor = TYPE_COLORS[hospital.type] || TYPE_COLORS.Government;

  return (
    <article className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--color-on-surface)] text-sm leading-snug">{hospital.name}</h3>
          <p className="text-xs text-[var(--color-on-surface-subtle)] mt-0.5">{hospital.address}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full ${typeColor}`}>
            {hospital.type}
          </span>
          {distance !== null && (
            <span className="text-[10px] text-[var(--color-on-surface-subtle)] font-mono">
              {distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`}
            </span>
          )}
        </div>
      </div>

      {/* Services */}
      <div className="flex flex-wrap gap-1.5">
        {hospital.has_xray && (
          <span className="text-[10px] bg-[var(--color-surface-container)] px-2 py-0.5 rounded-full border border-[var(--color-border)] flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">radiology</span> X-Ray
          </span>
        )}
        {hospital.has_ct && (
          <span className="text-[10px] bg-[var(--color-surface-container)] px-2 py-0.5 rounded-full border border-[var(--color-border)] flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">scanner</span> CT Scan
          </span>
        )}
        {hospital.departments.slice(0, 3).map((d) => (
          <span key={d} className="text-[10px] bg-[var(--color-surface-container)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">
            {d}
          </span>
        ))}
      </div>

      {/* Contact */}
      {hospital.contact && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-on-surface-muted)]">
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">call</span>
          <a href={`tel:${hospital.contact}`} className="hover:underline">{hospital.contact}</a>
        </div>
      )}

      {/* Demo label */}
      {hospital.is_demo && (
        <p className="text-[9px] text-[var(--color-on-surface-subtle)] italic border-t border-[var(--color-border)] pt-2">
          ⚠ Demonstration record — verify before use. Last updated: {hospital.last_verified}
        </p>
      )}
    </article>
  );
}

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("All Districts");
  const [filterXray, setFilterXray] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLon, setUserLon] = useState<number | undefined>();
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { q?: string; district?: string } = {};
      if (search.trim()) params.q = search.trim();
      if (district !== "All Districts") params.district = district;
      const data = await fetchHospitals(params);
      setHospitals(data);
    } catch {
      setError("Could not load hospital directory. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [search, district]);

  useEffect(() => {
    const t = setTimeout(loadHospitals, 300);
    return () => clearTimeout(t);
  }, [loadHospitals]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLon(pos.coords.longitude);
        setLocationStatus("granted");
      },
      () => setLocationStatus("denied")
    );
  };

  const filtered = hospitals
    .filter((h) => (filterXray ? h.has_xray : true))
    .sort((a, b) => {
      if (userLat && userLon && a.lat && b.lat && a.lon && b.lon) {
        return (
          haversineKm(userLat, userLon, a.lat, a.lon) -
          haversineKm(userLat, userLon, b.lat, b.lon)
        );
      }
      return 0;
    });

  return (
    <>
      <TopBar title="Hospital Finder" subtitle="Nearby facilities with radiology" />

      <main className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Demo notice */}
        <div className="bg-[var(--color-warning-light)] border border-[var(--color-warning)] rounded-lg p-3 flex gap-2">
          <span className="material-symbols-outlined text-[var(--color-warning)] text-[16px] flex-shrink-0 mt-0.5">info</span>
          <p className="text-xs text-[var(--color-warning)]">
            Records shown are <strong>demonstration data</strong>. Verify all details independently before visiting any facility.
          </p>
        </div>

        {/* Location */}
        <div className="card p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[var(--color-secondary)] text-[20px]" aria-hidden="true">my_location</span>
            <div>
              <p className="text-xs font-semibold text-[var(--color-on-surface)]">Distance sorting</p>
              <p className="text-[10px] text-[var(--color-on-surface-subtle)]">
                {locationStatus === "granted"
                  ? "Location active — sorted by distance"
                  : locationStatus === "denied"
                  ? "Location denied — sorted alphabetically"
                  : "Enable for distance-based sorting"}
              </p>
            </div>
          </div>
          {locationStatus !== "granted" && (
            <button
              onClick={requestLocation}
              disabled={locationStatus === "requesting"}
              className="flex-shrink-0 h-8 px-3 rounded-lg bg-[var(--color-secondary)] text-white text-xs font-semibold disabled:opacity-50"
              aria-label="Enable location for distance sorting"
            >
              {locationStatus === "requesting" ? "…" : "Use Location"}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-subtle)] text-[20px]" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            placeholder="Search hospitals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors"
            aria-label="Search hospitals"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="h-9 px-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium focus:outline-none focus:border-[var(--color-secondary)] flex-shrink-0"
            aria-label="Filter by district"
          >
            {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <button
            onClick={() => setFilterXray(!filterXray)}
            className={`h-9 px-3 rounded-full border text-xs font-medium flex-shrink-0 transition-colors flex items-center gap-1 ${
              filterXray
                ? "bg-[var(--color-secondary)] text-white border-[var(--color-secondary)]"
                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-on-surface-muted)]"
            }`}
            aria-pressed={filterXray}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">radiology</span>
            X-Ray Only
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
                <div className="flex gap-2">
                  <div className="skeleton h-6 w-16 rounded-full" />
                  <div className="skeleton h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center space-y-3">
            <span className="material-symbols-outlined text-[36px] text-[var(--color-error)]" aria-hidden="true">cloud_off</span>
            <p className="text-sm text-[var(--color-error)]">{error}</p>
            <button onClick={loadHospitals} className="h-10 px-4 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center space-y-2">
            <span className="material-symbols-outlined text-[40px] text-[var(--color-on-surface-subtle)]" aria-hidden="true">search_off</span>
            <p className="text-sm font-semibold text-[var(--color-on-surface-muted)]">No hospitals found</p>
            <p className="text-xs text-[var(--color-on-surface-subtle)]">
              Try different search terms or remove filters
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-on-surface-subtle)]">{filtered.length} hospitals found</p>
            {filtered.map((h) => (
              <HospitalCard key={h.id} hospital={h} userLat={userLat} userLon={userLon} />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}
