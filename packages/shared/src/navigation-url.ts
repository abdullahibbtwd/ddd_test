/**
 * Build a Google Maps directions URL for field navigation.
 * Prefers coordinates when both are present; otherwise encodes the address.
 */
export function buildNavigationUrl(input: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): string {
  const hasCoords =
    input.lat != null &&
    input.lng != null &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  const destination = hasCoords
    ? `${input.lat},${input.lng}`
    : encodeURIComponent((input.address ?? "").trim());

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
