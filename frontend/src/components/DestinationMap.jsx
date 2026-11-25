import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./DestinationMap.css";

function createCustomPinIcon(isFeatured = false) {
  return L.divIcon({
    className: "travelogia-map-pin-wrapper",
    html: `<div class="travelogia-map-pin ${isFeatured ? "featured" : ""}"><span></span></div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function DestinationMap({
  destination = null,
  destinations = [],
  height = "380px",
  theme = "light",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const navigate = useNavigate();

  const [distanceInfo, setDistanceInfo] = useState(null);
  const [geoStatus, setGeoStatus] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const isSingle = Boolean(destination);

  const validItems = React.useMemo(() => {
    const items = destination ? [destination] : destinations;
    return items.filter(
      (item) =>
        item?.coordinates &&
        typeof item.coordinates.latitude === "number" &&
        typeof item.coordinates.longitude === "number" &&
        Number.isFinite(item.coordinates.latitude) &&
        Number.isFinite(item.coordinates.longitude),
    );
  }, [destination, destinations]);

  useEffect(() => {
    if (!mapContainerRef.current || validItems.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const first = validItems[0];
    const map = L.map(mapContainerRef.current, {
      center: [first.coordinates.latitude, first.coordinates.longitude],
      zoom: isSingle ? 11 : 4,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    const bounds = [];

    validItems.forEach((item) => {
      const { latitude, longitude } = item.coordinates;
      bounds.push([latitude, longitude]);

      const marker = L.marker([latitude, longitude], {
        icon: createCustomPinIcon(Boolean(item.featured)),
      }).addTo(map);

      // Build popup safely with DOM APIs (no unsafe innerHTML string interpolation)
      const popupEl = document.createElement("div");
      popupEl.className = "travelogia-map-popup";

      if (item.image?.url) {
        const img = document.createElement("img");
        img.src = item.image.url;
        img.alt = item.title || "Destination";
        img.className = "map-popup-img";
        popupEl.appendChild(img);
      }

      const titleEl = document.createElement("h4");
      titleEl.textContent = item.title || "Destination";
      popupEl.appendChild(titleEl);

      const locEl = document.createElement("p");
      locEl.className = "map-popup-loc";
      locEl.textContent = [item.city, item.state, item.country]
        .filter(Boolean)
        .join(", ");
      popupEl.appendChild(locEl);

      if (item.description) {
        const descEl = document.createElement("p");
        descEl.className = "map-popup-desc";
        descEl.textContent =
          item.description.length > 95
            ? `${item.description.slice(0, 95)}...`
            : item.description;
        popupEl.appendChild(descEl);
      }

      const metaEl = document.createElement("div");
      metaEl.className = "map-popup-meta";
      metaEl.textContent = `Est. $${item.pricePerNight}/night · ${item.category || "Travel"}`;
      popupEl.appendChild(metaEl);

      const actionsEl = document.createElement("div");
      actionsEl.className = "map-popup-actions";

      if (!isSingle && item._id) {
        const detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.className = "map-popup-btn";
        detailBtn.textContent = "View Details";
        detailBtn.addEventListener("click", () => {
          navigate(`/travels/${item._id}`);
        });
        actionsEl.appendChild(detailBtn);
      }

      const dirLink = document.createElement("a");
      dirLink.href = `https://www.openstreetmap.org/directions?to=${latitude},${longitude}`;
      dirLink.target = "_blank";
      dirLink.rel = "noopener noreferrer";
      dirLink.className = "map-popup-dir";
      dirLink.textContent = "Directions";
      actionsEl.appendChild(dirLink);

      popupEl.appendChild(actionsEl);

      marker.bindPopup(popupEl, { maxWidth: 260 });
      if (isSingle) {
        marker.openPopup();
      }
    });

    if (!isSingle && bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 11 });
    }

    mapInstanceRef.current = map;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [validItems, isSingle, navigate]);

  const handleCalculateDistance = () => {
    if (!isSingle || validItems.length === 0) return;
    if (!navigator.geolocation) {
      setGeoStatus("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setGeoStatus("Requesting location permission solely to calculate straight-line distance...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const target = validItems[0].coordinates;
        const km = haversineKm(
          pos.coords.latitude,
          pos.coords.longitude,
          target.latitude,
          target.longitude,
        );
        setDistanceInfo(`Approx. ${km.toLocaleString()} km away from your current location`);
        setGeoStatus("");
        setGeoLoading(false);
      },
      () => {
        setGeoStatus("Location permission was declined. You can still open directions below.");
        setGeoLoading(false);
      },
      { timeout: 10000 },
    );
  };

  if (validItems.length === 0) {
    return (
      <div className={`travelogia-map-fallback ${theme}`}>
        <p>Map coordinates are not available for this location yet.</p>
      </div>
    );
  }

  const primary = validItems[0];
  const lat = primary.coordinates.latitude;
  const lng = primary.coordinates.longitude;
  const osmDirectionsUrl = `https://www.openstreetmap.org/directions?to=${lat},${lng}`;
  const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className={`travelogia-map-shell ${theme}`}>
      <div className="travelogia-map-topbar">
        <div className="map-coords">
          {isSingle ? (
            <span>
              Coordinates: <strong>{lat.toFixed(4)}°, {lng.toFixed(4)}°</strong>
            </span>
          ) : (
            <span>
              Showing <strong>{validItems.length}</strong> destination
              {validItems.length === 1 ? "" : "s"} on interactive OpenStreetMap
            </span>
          )}
        </div>

        {isSingle && (
          <div className="map-top-actions">
            <button
              type="button"
              className="map-geo-btn"
              onClick={handleCalculateDistance}
              disabled={geoLoading}
              title="Uses your location once on click to compute approximate distance"
            >
              {geoLoading ? "Locating..." : "Check Distance"}
            </button>
            <a
              href={osmDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="map-dir-link"
            >
              OSM Directions
            </a>
            <a
              href={googleDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="map-dir-link"
            >
              Google Maps
            </a>
          </div>
        )}
      </div>

      {distanceInfo && <div className="map-geo-banner success">{distanceInfo}</div>}
      {geoStatus && <div className="map-geo-banner info">{geoStatus}</div>}

      <div className="travelogia-map-canvas-wrap" style={{ height }}>
        <div
          ref={mapContainerRef}
          className="travelogia-map-canvas"
          aria-label={
            isSingle
              ? `Interactive map showing ${primary.title}`
              : "Interactive map of Travelogia destinations"
          }
        />
      </div>
    </div>
  );
}

export default DestinationMap;
