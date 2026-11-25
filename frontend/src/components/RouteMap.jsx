import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function createNumberedIcon(label, isHub = false) {
  return L.divIcon({
    className: "v2-route-pin",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${isHub ? "#ff7b00" : "#2563eb"};color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.3);">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function RouteMap({ startHub = null, stops = [], polyline = [], height = "420px" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);

  const validStops = useMemo(
    () =>
      (stops || []).filter(
        (s) =>
          s?.coordinates &&
          Number.isFinite(Number(s.coordinates.latitude)) &&
          Number.isFinite(Number(s.coordinates.longitude)),
      ),
    [stops],
  );

  const points = useMemo(() => {
    if (Array.isArray(polyline) && polyline.length > 0) return polyline;
    const list = [];
    if (startHub?.coordinates) {
      list.push([Number(startHub.coordinates.latitude), Number(startHub.coordinates.longitude)]);
    }
    validStops.forEach((s) =>
      list.push([Number(s.coordinates.latitude), Number(s.coordinates.longitude)]),
    );
    return list;
  }, [polyline, startHub, validStops]);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: points[0],
        zoom: 6,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const group = layerGroupRef.current;
    group.clearLayers();

    if (points.length > 1) {
      L.polyline(points, {
        color: "#2563eb",
        weight: 4,
        dashArray: "8 6",
      }).addTo(group);
    }

    if (startHub?.coordinates && Number.isFinite(Number(startHub.coordinates.latitude))) {
      L.marker(
        [Number(startHub.coordinates.latitude), Number(startHub.coordinates.longitude)],
        { icon: createNumberedIcon("S", true) },
      )
        .bindPopup(`<strong>Start Hub: ${escapeHtml(startHub.title || startHub.city)}</strong>`)
        .addTo(group);
    }

    validStops.forEach((stop, idx) => {
      const locText = [stop.city, stop.country].filter(Boolean).join(", ");
      const priceText = stop.pricePerNight ? `<br/>Est. $${escapeHtml(stop.pricePerNight)}/night` : "";
      L.marker(
        [Number(stop.coordinates.latitude), Number(stop.coordinates.longitude)],
        { icon: createNumberedIcon(String(stop.order || idx + 1), false) },
      )
        .bindPopup(
          `<strong>Stop ${escapeHtml(stop.order || idx + 1)}: ${escapeHtml(stop.title)}</strong><br/>${escapeHtml(locText)}${priceText}`,
        )
        .addTo(group);
    });

    if (points.length === 1) {
      map.setView(points[0], 8);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 11 });
    }
  }, [points, startHub, validStops]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  if (points.length === 0) {
    return (
      <div className="v2-disclaimer" style={{ textAlign: "center", padding: "32px" }}>
        Select destinations with coordinates to visualize the multi-stop route map.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: "100%",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid #cbd5e1",
      }}
    />
  );
}
