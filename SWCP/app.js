/* app.js — Leaflet map for SWCP legs (enriched GeoJSON) */

(() => {
  const GEOJSON_URL = "./ALL_COASTAL_LEGS.geojson";

  const ORANGE = "#ff7a00";

  const els = {
    statusText: document.getElementById("statusText"),
    legTitle: document.getElementById("legTitle"),
    legDetails: document.getElementById("legDetails"),
    btnFit: document.getElementById("btnFit"),
    btnClear: document.getElementById("btnClear"),
  };

  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  let geojsonLayer = null;
  let selectedLayer = null;

  const startMarkers = L.layerGroup().addTo(map);

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  function fmtNum(val, decimals = 1) {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return n.toFixed(decimals);
  }

  function safeLink(url, label) {
    if (!url) return null;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  function legTitle(feature) {
    const p = feature?.properties || {};
    const leg = (p.leg !== undefined && p.leg !== null) ? `Leg ${p.leg}` : "Leg";
    const se = (p.start && p.end) ? `${p.start} to ${p.end}` : null;
    return se ? `${leg} — ${se}` : leg;
  }

  function legDetailsHTML(feature) {
    const p = feature?.properties || {};
    const lines = [];

    // Required fields in your preferred order
    lines.push(`<strong>Leg ${p.leg ?? "?"}</strong>`);

    if (p.start && p.end) lines.push(`${p.start} to ${p.end}`);

    const dist = fmtNum(p.distance_km, 1);
    if (dist) lines.push(`Distance: ${dist} km`);

    const elev = fmtNum(p.elevation_gain_m, 0);
    if (elev) lines.push(`Elevation gain: ${elev} m`);

    if (p.difficulty) lines.push(`Difficulty: ${p.difficulty}`);

    if (p.est_time_running) lines.push(`Estimated running time: ${p.est_time_running}`);
    if (p.est_time_walking) lines.push(`Estimated walking time: ${p.est_time_walking}`);

    const strava = safeLink(p.strava_url, "Strava route");
    if (strava) lines.push(strava);

    const gpx = safeLink(p.strava_gpx_url, "Strava GPX");
    if (gpx) lines.push(gpx);

    return lines.map((x) => `<div>${x}</div>`).join("");
  }

  function styleForFeature(feature) {
    return {
      weight: 6,
      opacity: 0.95,
      color: ORANGE,
      lineCap: "round",
      lineJoin: "round",
    };
  }

  function styleSelected() {
    return {
      weight: 8,
      opacity: 1,
      color: "#ffd400",
      lineCap: "round",
      lineJoin: "round",
    };
  }

  function clearSelection() {
    if (selectedLayer) {
      selectedLayer.setStyle(styleForFeature(selectedLayer.feature));
      selectedLayer = null;
    }
    els.legTitle.textContent = "None";
    els.legDetails.innerHTML = "Tap/click a route segment or a diamond marker to see details here.";
  }

  function selectLayer(layer, openPopup = true) {
    if (!layer) return;

    // unselect previous
    if (selectedLayer && selectedLayer !== layer) {
      selectedLayer.setStyle(styleForFeature(selectedLayer.feature));
    }

    selectedLayer = layer;
    layer.setStyle(styleSelected());

    const title = legTitle(layer.feature);
    els.legTitle.textContent = title;
    els.legDetails.innerHTML = legDetailsHTML(layer.feature);

    if (openPopup) {
      layer.bindPopup(title, { closeButton: true }).openPopup();
    }
  }

  function makeStartMarker(feature, layer) {
    const coords = feature?.geometry?.coordinates;
    if (!coords || !coords.length) return;

    // GeoJSON coords are [lon, lat]
    const [lon, lat] = coords[0];
    if (typeof lat !== "number" || typeof lon !== "number") return;

    const icon = L.divIcon({
      className: "start-marker",
      html: `<div class="diamond"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const marker = L.marker([lat, lon], { icon, interactive: true, keyboard: false });
    marker.on("click", () => {
      selectLayer(layer, true);
    });

    startMarkers.addLayer(marker);
  }

  function onEachFeature(feature, layer) {
    layer.on("click", () => selectLayer(layer, true));
    makeStartMarker(feature, layer);
  }

  async function loadRoute() {
    try {
      setStatus("Loading route…");
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${GEOJSON_URL} (${res.status})`);
      const data = await res.json();

      // Clear markers if reloading
      startMarkers.clearLayers();

      geojsonLayer = L.geoJSON(data, {
        style: styleForFeature,
        onEachFeature,
      }).addTo(map);

      const bounds = geojsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.08));
      } else {
        map.setView([50.5, -4.5], 7);
      }

      setStatus("Route loaded — tap/click a leg or its diamond marker.");
    } catch (err) {
      console.error(err);
      setStatus("Couldn’t load the route file. Check the GeoJSON filename/path.");
      els.legDetails.textContent =
        "If you opened this page as a local file, fetch() may be blocked. GitHub Pages should work fine.";
    }
  }

  // Buttons
  els.btnFit.addEventListener("click", () => {
    if (!geojsonLayer) return;
    const b = geojsonLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b.pad(0.08));
  });

  els.btnClear.addEventListener("click", () => clearSelection());

  // Start
  clearSelection();
  loadRoute();
})();
