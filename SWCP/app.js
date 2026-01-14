(() => {
  "use strict";

  // IMPORTANT: keep the GeoJSON in the same /SWCP/ folder as index.html
  const GEOJSON_URL = "./ALL_COASTAL_LEGS_ENRICHED.geojson";

  const $ = (id) => document.getElementById(id);

  const statusText = $("statusText");
  const selectedTitle = $("selectedTitle");
  const detailsGrid = $("detailsGrid");

  // Map init
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
  });

  // OSM tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  // Route + markers layers
  let routeLayer = null;
  let startMarkersLayer = null;

  // Track last selected feature/layer for styling
  let selectedLineLayer = null;
  let selectedMarker = null;

  const ORANGE = "#ff7a00";

  function safe(v) {
    return (v === undefined || v === null || v === "") ? "—" : v;
  }

  function formatKm(v) {
    if (v === undefined || v === null || Number.isNaN(Number(v))) return "—";
    return `${Number(v).toFixed(2)} km`;
  }

  function formatM(v) {
    if (v === undefined || v === null || Number.isNaN(Number(v))) return "—";
    return `${Math.round(Number(v))} m`;
  }

  function asLink(url, label) {
    if (!url) return "—";
    const safeUrl = String(url);
    const text = label || safeUrl;
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${text}</a>`;
  }

  function lineStyle(isSelected) {
    return {
      color: ORANGE,
      weight: isSelected ? 10 : 6,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    };
  }

  function setStatus(text) {
    statusText.textContent = text;
  }

  function clearSelection() {
    if (selectedLineLayer) {
      selectedLineLayer.setStyle(lineStyle(false));
      selectedLineLayer = null;
    }
    if (selectedMarker) {
      // no special marker style currently, just clear ref
      selectedMarker = null;
    }
    selectedTitle.textContent = "None";
    detailsGrid.style.display = "none";
    detailsGrid.innerHTML = "";
    setStatus("Route loaded — tap/click a leg or its numbered diamond marker.");
  }

  function renderDetails(props) {
    // These property names match what’s inside the enriched GeoJSON. :contentReference[oaicite:1]{index=1}
    const leg = safe(props.leg);
    const name = safe(props.name);

    const start = safe(props.start);
    const end = safe(props.end);

    const dist = formatKm(props.distance_km);
    const elev = formatM(props.elevation_gain_m);

    const diff = safe(props.difficulty);
    const runTime = safe(props.est_time_running);
    const walkTime = safe(props.est_time_walking);

    const stravaUrl = props.strava_url;
    const stravaGpxUrl = props.strava_gpx_url;

    selectedTitle.textContent = `Leg ${leg}`;
    setStatus("Leg selected.");

    detailsGrid.style.display = "grid";
    detailsGrid.innerHTML = `
      <div class="row"><div class="label">Leg</div><div class="value">${safe(leg)}</div></div>
      <div class="row"><div class="label">Start to end</div><div class="value">${start} to ${end}</div></div>
      <div class="row"><div class="label">Distance</div><div class="value">${dist}</div></div>
      <div class="row"><div class="label">Elevation gain</div><div class="value">${elev}</div></div>
      <div class="row"><div class="label">Difficulty</div><div class="value">${safe(diff)}</div></div>
      <div class="row"><div class="label">Estimated running time</div><div class="value">${safe(runTime)}</div></div>
      <div class="row"><div class="label">Estimated walking time</div><div class="value">${safe(walkTime)}</div></div>
      <div class="row"><div class="label">Strava route</div><div class="value">${asLink(stravaUrl, "Open")}</div></div>
      <div class="row"><div class="label">Strava GPX</div><div class="value">${asLink(stravaGpxUrl, "Download")}</div></div>
      <div class="row"><div class="label">Internal name</div><div class="value">${safe(name)}</div></div>
    `;
  }

  function selectLine(layer, props) {
    if (selectedLineLayer && selectedLineLayer !== layer) {
      selectedLineLayer.setStyle(lineStyle(false));
    }
    selectedLineLayer = layer;
    layer.setStyle(lineStyle(true));
    renderDetails(props);
  }

  function diamondIcon(number) {
    return L.divIcon({
      className: "",
      html: `
        <div class="diamond-wrap" aria-label="Leg ${number} start marker">
          <div class="diamond-num">${number}</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  }

  async function load() {
    setStatus("Loading route…");

    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch GeoJSON: ${res.status}`);

    const geojson = await res.json();

    // Lines
    routeLayer = L.geoJSON(geojson, {
      style: () => lineStyle(false),
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const leg = safe(props.leg);

        layer.on("click", () => {
          selectLine(layer, props);
        });

        // A small popup for quick confirmation (optional)
        layer.bindPopup(`Leg ${leg}`, { closeButton: true });
      },
      filter: (feature) => feature && feature.geometry && feature.geometry.type === "LineString",
    }).addTo(map);

    // Start markers (diamond at first coordinate)
    startMarkersLayer = L.layerGroup().addTo(map);

    geojson.features
      .filter(f => f && f.geometry && f.geometry.type === "LineString" && Array.isArray(f.geometry.coordinates))
      .forEach(f => {
        const props = f.properties || {};
        const leg = safe(props.leg);

        const coords = f.geometry.coordinates;
        if (!coords.length) return;

        const first = coords[0]; // [lng, lat]
        const latlng = L.latLng(first[1], first[0]);

        const marker = L.marker(latlng, {
          icon: diamondIcon(leg),
          keyboard: true,
          title: `Leg ${leg} start`,
          riseOnHover: true,
        }).addTo(startMarkersLayer);

        marker.on("click", () => {
          // Also highlight the corresponding line (find the matching layer by leg)
          let matched = null;
          routeLayer.eachLayer(l => {
            const p = l.feature && l.feature.properties;
            if (p && String(p.leg) === String(props.leg)) matched = l;
          });
          if (matched) selectLine(matched, props);
          else renderDetails(props);
          selectedMarker = marker;
        });

        marker.bindPopup(`Leg ${leg}`, { closeButton: true });
      });

    // Fit to route bounds
    const b = routeLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b.pad(0.08));
    setStatus("Route loaded — tap/click a leg or its numbered diamond marker.");

    // Buttons
    $("fitBtn").addEventListener("click", () => {
      const bounds = routeLayer.getBounds();
      if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.08));
    });

    $("clearBtn").addEventListener("click", () => clearSelection());
  }

  load().catch(err => {
    console.error(err);
    setStatus("Couldn’t load the route data. Check the GeoJSON path and GitHub Pages deployment.");
  });
})();
