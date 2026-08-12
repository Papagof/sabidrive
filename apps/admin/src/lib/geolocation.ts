export interface GeoPosition {
  lat: number;
  lng: number;
}

export type GeoErrorReason = "denied" | "unavailable" | "timeout" | "unsupported";

export class GeoError extends Error {
  reason: GeoErrorReason;
  constructor(reason: GeoErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Promise wrapper around the browser Geolocation API. */
export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new GeoError("unsupported", "This browser doesn't support location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new GeoError("denied", "Location access was denied."));
        } else if (error.code === error.TIMEOUT) {
          reject(new GeoError("timeout", "Timed out waiting for a location fix."));
        } else {
          reject(new GeoError("unavailable", "Location is currently unavailable."));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
