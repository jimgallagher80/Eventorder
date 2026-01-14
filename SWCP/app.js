/* app.js — Leaflet map loader for ALL_COASTAL_LEGS.geojson */

(() => {
  const GEOJSON_URL = "./ALL_COASTAL_LEGS.geojson";

  const els = {
    statusText: document.getElementById("statusText"),
    legTitle: document.getElementById("legTitle"),
    legDetails: document.getElementById("legDetails"),
    btnFit: document.getElementById("btnFit"),
    btnClear: document.getElementById("btnClear"),
  };

  // Create map
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true, // better performance with lots of points
  });

  // Base tiles (OpenStreetMap)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Selection state
  let geojsonLayer = null;
  let selectedLayer = null;

  // Basic styling helpers
  function styleForFeature(feature) {
    // If later you add a `status` property (available/taken/completed), colour can change here.
    // For now, everything uses a clean default.
    return {
      weight: 5,
      opacity: 0.9,
      // Leaflet expects colour strings; keep it simple (white lines on map).
      color: "#ffffff",
    };
  }

  function styleSelected() {
    return {
      weight: 7,
      opacity: 1,
      color: "#ffd400", // highlighted leg
    };
  }

  function clearSelection() {
    if (selectedLayer) {
      // Reset previous selection style
      selectedLayer.setStyle(styleForFeature(selectedLayer.feature));
      selectedLayer = null;
    }
    els.legTitle.textContent = "None";
    els.legDetails.textContent = "Tap/click a segment on the map to see its details here.";
  }

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  function getLegLabel(feature) {
    const p = feature?.properties || {};
    const leg = (p.leg !== undefined && p.leg !== null) ? `Leg ${p.leg}` : "Leg";
    const name = p.name ? ` — ${p.name}` : "";
    return `${leg}${name}`;
  }

  function getLegDetails(feature) {
    const p = feature?.properties || {};
    const parts = [];

    if (p.leg !== undefined && p.leg !== null) parts.push(`Leg number: ${p.leg}`);
    if (p.name) parts.push(`Name: ${p.name}`);
    if (p.point_count) parts.push(`Track points: ${p.point_count.toLocaleString("en-GB")}`);

    // Placeholder for later integration with your spreadsheet data:
    // if (p.distance_km) parts.push(`Distance: ${p.distance_km} km`);
    // if (p.elevation_m) parts.push(`Elevation gain: ${p.elevation_m} m`);
    // if (p.difficulty) parts.push(`Difficulty: ${p.difficulty}`);
    // if (p.strava_url) parts.push(`Strava: ${p.strava_url}`);

    if (!parts.length) return "No details available for this leg.";
    return parts.join(" • ");
  }

  function onEachFeature(feature, layer) {
    layer.on("click", () => {
      // Unselect previous
      if (selectedLayer && selectedLayer !== layer) {
        selectedLayer.setStyle(styleForFeature(selectedLayer.feature));
      }

      // Select new
      selectedLayer = layer;
      layer.setStyle(styleSelected());

      // Update panel
      els.legTitle.textContent = getLegLabel(feature);
      els.legDetails.textContent = getLegDetails(feature);

      // Optional popup
      layer.bindPopup(getLegLabel(feature), { closeButton: true }).openPopup();
    });
  }

  async function loadRoute() {
    try {
      setStatus("Loading GeoJSON…");
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${GEOJSON_URL} (${res.status})`);

      const data = await res.json();

      geojsonLayer = L.geoJSON(data, {
        style: styleForFeature,
        onEachFeature,
      }).addTo(map);

      const bounds = geojsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.08));
      } else {
        map.setView([50.5, -4.5], 7); // fallback view (SW England-ish)
      }

      setStatus("Route loaded — tap/click a leg to inspect it.");
    } catch (err) {
      console.error(err);
      setStatus("Couldn’t load the route file. Check the GeoJSON filename/path and that you’re using a web server.");
      els.legDetails.textContent =
        "If you opened index.html directly from your phone/desktop (file://), fetch() may be blocked. Serve the folder over HTTP instead.";
    }
  }

  // Buttons
  els.btnFit.addEventListener("click", () => {
    if (!geojsonLayer) return;
    const b = geojsonLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b.pad(0.08));
  });

  els.btnClear.addEventListener("click", () => {
    clearSelection();
  });

  // Kick off
  clearSelection();
  loadRoute();
})();
