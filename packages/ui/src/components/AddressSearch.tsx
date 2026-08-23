"use client";

import { useState, type FormEvent } from "react";
import { Button } from "./Button";

export interface AddressSearchResult {
  displayName: string;
  lat: number;
  lng: number;
}

export interface AddressSearchProps {
  onSelect: (result: AddressSearchResult) => void;
  placeholder?: string;
  className?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * Address lookup for the admin route/stop builder, backed by OpenStreetMap's
 * free Nominatim search -- same source as the map tiles TripMap/FleetMap/
 * ClickToAddMap already pull from directly in the browser, so this follows
 * the same no-API-key, client-side-call precedent rather than introducing a
 * paid geocoder. One explicit search per submit (no as-you-type debounce),
 * matching Nominatim's usage policy against automated/bulk querying.
 */
export function AddressSearch({ onSelect, placeholder, className }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(trimmed)}`
      );
      if (!res.ok) throw new Error("Address search failed");
      const data = (await res.json()) as NominatimResult[];
      const parsed = data.map((r) => ({ displayName: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
      setResults(parsed);
      if (parsed.length === 0) setError("No matches found -- try a more specific address.");
    } catch {
      setError("Address search failed. You can still click the map directly.");
    } finally {
      setIsSearching(false);
    }
  }

  function handlePick(result: AddressSearchResult) {
    onSelect(result);
    setQuery(result.displayName);
    setResults([]);
  }

  return (
    <div className={className}>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? "Search an address…"}
          className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={isSearching || !query.trim()}>
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </form>
      {error ? <p className="mt-1 text-xs text-critical-600">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                onClick={() => handlePick(r)}
                className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
