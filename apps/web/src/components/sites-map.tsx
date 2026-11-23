import { buildNavigationUrl } from "@ddcrm/shared";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./sites-map.css";
import { useEffect, useRef } from "react";

export type SitesMapItem = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  clientName: string;
};

const pinIcon = L.divIcon({
  className: "",
  html: '<div class="ddcrm-site-pin"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const draggablePinIcon = L.divIcon({
  className: "",
  html: '<div class="ddcrm-site-pin ddcrm-site-pin--draggable"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type SitesMapProps = {
  items: SitesMapItem[];
  onOpenSite: (id: string) => void;
  openLabel: string;
  navigationLabel: string;
  className?: string;
};

export function SitesMap({
  items,
  onOpenSite,
  openLabel,
  navigationLabel,
  className,
}: SitesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onOpenRef = useRef(onOpenSite);
  onOpenRef.current = onOpenSite;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      attributionControl: true,
    }).setView([42.7, 25.5], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const latLngs: L.LatLngExpression[] = [];
    for (const item of items) {
      const ll: L.LatLngExpression = [item.latitude, item.longitude];
      latLngs.push(ll);
      const nav = buildNavigationUrl({
        lat: item.latitude,
        lng: item.longitude,
        address: item.address,
      });
      const marker = L.marker(ll, { icon: pinIcon });
      const popup = document.createElement("div");
      popup.innerHTML = `<strong></strong><div class="text-ink-muted"></div><div class="ddcrm-map-popup-actions"></div>`;
      const strong = popup.querySelector("strong")!;
      strong.textContent = item.name;
      const addr = popup.querySelector("div")!;
      addr.textContent = item.address;
      const actions = popup.querySelector(".ddcrm-map-popup-actions")!;
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = openLabel;
      openBtn.addEventListener("click", () => onOpenRef.current(item.id));
      const navLink = document.createElement("a");
      navLink.href = nav;
      navLink.target = "_blank";
      navLink.rel = "noopener noreferrer";
      navLink.textContent = navigationLabel;
      actions.append(openBtn, navLink);
      marker.bindPopup(popup);
      marker.addTo(layer);
    }
    if (latLngs.length === 1) {
      map.setView(latLngs[0]!, 14);
    } else if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28] });
    }
    map.invalidateSize();
  }, [items, openLabel, navigationLabel]);

  return <div ref={containerRef} className={className ?? "h-full min-h-[420px] w-full"} />;
}

type SiteLocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (coords: { latitude: number; longitude: number } | null) => void;
  className?: string;
};

/** ~240px map for the site drawer: click or drag sets coordinates. */
export function SiteLocationPicker({
  latitude,
  longitude,
  onChange,
  className,
}: SiteLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      dragging: true,
      attributionControl: true,
    }).setView(
      latitude != null && longitude != null ? [latitude, longitude] : [42.6977, 23.3219],
      latitude != null ? 15 : 12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    });

    mapRef.current = map;
    // Avoid page scroll hijack on touch while dragging the map.
    map.getContainer().style.touchAction = "none";

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude == null || longitude == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const ll: L.LatLngExpression = [latitude, longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { icon: draggablePinIcon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current?.getLatLng();
        if (pos) onChangeRef.current({ latitude: pos.lat, longitude: pos.lng });
      });
    } else {
      markerRef.current.setLatLng(ll);
    }
    map.setView(ll, Math.max(map.getZoom(), 14));
    map.invalidateSize();
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[240px] w-full overflow-hidden rounded-[var(--radius-panel)] border border-border"}
    />
  );
}
