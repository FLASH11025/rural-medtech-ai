"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Building,
  CircleAlert,
  Hospital as HospitalIcon,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Search,
  X,
} from "lucide-react";
import { fetchHospitals, healthCheck } from "../../lib/api";
import type { Hospital } from "../../lib/types";
import {
  BottomNav,
  DisclaimerBanner,
  DemoDataTag,
  EngineOfflineBanner,
  IconButton,
  PillButton,
  Skeleton,
  TopBar,
} from "../components/ui";

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

const TYPE_TINT: Record<string, string> = {
  Government: "chip-violet",
  Private: "chip-ink",
  PHC: "chip-lime",
  CHC: "chip-uncertain",
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function directionsUrl(h: Hospital): string {
  if (h.lat && h.lon) {
    return `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.address}`)}`;
}

function HospitalCard({ hospital: h, userLat, userLon }: { hospital: Hospital; userLat?: number; userLon?: number }) {
  const distance =
    userLat && userLon && h.lat && h.lon ? haversineKm(userLat, userLon, h.lat, h.lon) : null;

  return (
    <article className="card flex flex-col gap-3.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl border border-white/8" style={{ background: "rgba(124,58,237,0.14)" }}>
          <HospitalIcon size={18} style={{ color: "var(--violetlight)" }} aria-hidden="true" />
        </div>
        <span className={`chip ${TYPE_TINT[h.type] ?? "chip-ink"}`}>{h.type}</span>
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-white">{h.name}</h3>
        <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-ink2">
          <MapPin size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            {h.address}, {h.district}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {distance !== null && (
          <span className="chip chip-lime">
            {distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`}
          </span>
        )}
        {h.has_xray && <span className="chip chip-violet">X-Ray</span>}
        {h.has_ct && <span className="chip chip-violet">CT</span>}
        {h.departments.slice(0, 3).map((d) => (
          <span key={d} className="chip chip-ink">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2">
        {h.contact && (
          <a href={`tel:${h.contact}`} className="btn btn-white !h-10 !px-4 !text-xs" aria-label={`Call ${h.name}`}>
            <Phone size={14} aria-hidden="true" />
            Call
          </a>
        )}
        <a
          href={directionsUrl(h)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-dark !h-10 !px-4 !text-xs"
          aria-label={`Get directions to ${h.name}`}
        >
          <Navigation size={14} aria-hidden="true" />
          Directions
        </a>
      </div>

      {h.is_demo && (
        <p className="border-t border-white/5 pt-3">
          <DemoDataTag lastVerified={h.last_verified} />
        </p>
      )}
    </article>
  );
}

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("All Districts");
  const [filterXray, setFilterXray] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLon, setUserLon] = useState<number | undefined>();
  const [locating, setLocating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    healthCheck().then(setOffline);
  }, []);

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
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLon(pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false)
    );
  };

  const filtered = hospitals
    .filter((h) => (filterXray ? h.has_xray : true))
    .sort((a, b) => {
      if (userLat && userLon && a.lat && b.lat && a.lon && b.lon) {
        return haversineKm(userLat, userLon, a.lat, a.lon) - haversineKm(userLat, userLon, b.lat, b.lon);
      }
      return 0;
    });

  const activeFilters = search.trim() !== "" || district !== "All Districts" || filterXray;

  return (
    <>
      <TopBar />

      <main className="container-x pb-28 pt-6 md:pb-12">
        <div className="mb-6">
          <h1 className="text-[28px] font-medium leading-tight tracking-tight md:text-[40px]">
            Nearby <span className="text-ink2">hospitals</span>
          </h1>
          <p className="mt-1 text-sm text-ink2">Demonstration records for AP &amp; Telangana — verify before visiting.</p>
        </div>

        {offline === false && (
          <div className="mb-4">
            <EngineOfflineBanner />
          </div>
        )}

        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search hospitals…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-dark w-full pl-10 pr-4"
              aria-label="Search hospitals"
            />
          </div>

          <div className="relative">
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="input-dark appearance-none pr-9 pl-4"
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

          <button
            onClick={() => setFilterXray(!filterXray)}
            className={`btn !h-11 !px-4 text-xs ${
              filterXray ? "!text-black" : "btn-dark"
            }`}
            style={filterXray ? { background: "var(--violet)" } : undefined}
            aria-pressed={filterXray}
          >
            {filterXray && <Building size={14} aria-hidden="true" />}
            X-Ray only
          </button>

          <IconButton
            label="Use my location for distance sorting"
            onClick={requestLocation}
            className="!h-11 !w-11"
            aria-busy={locating}
          >
            <LocateFixed size={17} style={userLat ? { color: "var(--lime)" } : undefined} aria-hidden="true" />
          </IconButton>
        </div>

        {/* Results */}
        {loading ? (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-2/3" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card grid place-items-center gap-3 p-10 text-center" role="alert">
            <CircleAlert size={28} style={{ color: "var(--rederr)" }} aria-hidden="true" />
            <p className="text-sm text-ink2">{error}</p>
            <PillButton variant="white" onClick={loadHospitals}>
              Retry
            </PillButton>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card grid place-items-center gap-3 p-10 text-center">
            <Search size={28} className="text-ink3" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">No hospitals found</p>
            <p className="text-xs text-ink3">Try different search terms or remove filters</p>
            {activeFilters && (
              <PillButton variant="ghost" onClick={() => { setSearch(""); setDistrict("All Districts"); setFilterXray(false); }}>
                <X size={14} aria-hidden="true" />
                Clear filters
              </PillButton>
            )}
          </div>
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <p className="col-span-full text-xs text-ink3">
              {filtered.length} hospital{filtered.length !== 1 ? "s" : ""} found
              {userLat ? " · sorted by distance from your location" : ""}
            </p>
            {filtered.map((h) => (
              <HospitalCard key={h.id} hospital={h} userLat={userLat} userLon={userLon} />
            ))}
          </div>
        )}

        <div className="mt-6">
          <DisclaimerBanner />
        </div>

        <p className="mt-4 text-center text-[11px] text-ink3">
          Looking for a specialist?{" "}
          <Link href="/doctors" className="underline hover:text-white">
            Find a doctor →
          </Link>
        </p>
      </main>

      <BottomNav />
    </>
  );
}
