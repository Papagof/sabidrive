"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Bundlers break Leaflet's default marker icon URL resolution — point at the CDN instead.
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
}

const DEFAULT_CENTER: MapPoint = { lat: 6.5244, lng: 3.3792 }; // Lagos, Nigeria

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

export interface TripMapProps {
  busPosition: MapPoint | null;
  stops?: MapStop[];
  highlightStopId?: string;
}

/** Single-bus live map — parent's per-child tracking view. */
export function TripMap({ busPosition, stops = [], highlightStopId }: TripMapProps) {
  const center = busPosition ?? stops[0] ?? DEFAULT_CENTER;

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stops.map((stop) => (
        <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={defaultIcon}>
          <Popup>
            {stop.name}
            {stop.id === highlightStopId ? " (your stop)" : ""}
          </Popup>
        </Marker>
      ))}
      {busPosition ? (
        <>
          <Marker position={[busPosition.lat, busPosition.lng]} icon={defaultIcon}>
            <Popup>Bus</Popup>
          </Marker>
          <Recenter lat={busPosition.lat} lng={busPosition.lng} />
        </>
      ) : null}
    </MapContainer>
  );
}

export interface FleetBusMarker {
  tripId: string;
  label: string;
  position: MapPoint;
}

export interface FleetMapProps {
  buses: FleetBusMarker[];
  center?: MapPoint;
}

/** Fleet-wide live map — admin dashboard, one marker per in-progress trip. */
export function FleetMap({ buses, center }: FleetMapProps) {
  const mapCenter = center ?? buses[0]?.position ?? DEFAULT_CENTER;

  return (
    <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {buses.map((bus) => (
        <Marker key={bus.tripId} position={[bus.position.lat, bus.position.lng]} icon={defaultIcon}>
          <Popup>{bus.label}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export interface ClickToAddMapProps {
  points: MapPoint[];
  onAddPoint: (point: MapPoint) => void;
  center?: MapPoint;
}

function ClickCapture({ onAddPoint }: { onAddPoint: (point: MapPoint) => void }) {
  const map = useMap();
  useEffect(() => {
    function handleClick(e: L.LeafletMouseEvent) {
      onAddPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map, onAddPoint]);
  return null;
}

/** Click-to-append route/stop editor used by the admin route builder. */
export function ClickToAddMap({ points, onAddPoint, center }: ClickToAddMapProps) {
  const mapCenter = center ?? points[0] ?? DEFAULT_CENTER;

  return (
    <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture onAddPoint={onAddPoint} />
      {points.map((point, i) => (
        <Marker key={`${point.lat}-${point.lng}-${i}`} position={[point.lat, point.lng]} icon={defaultIcon}>
          <Popup>Point {i + 1}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
