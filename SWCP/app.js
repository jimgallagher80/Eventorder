(() => {
  "use strict";

  const GEOJSON_URL = "./ALL_COASTAL_LEGS_ENRICHED.geojson";
  const ORANGE = "#ff7a00";

  const $ = (id) => document.getElementById(id);

  const panel = $("panel");
  const panelTip = $("panelTip");
  const panelExpanded = $("panelExpanded");
  const panelLegTitle = $("panelLegTitle");
  const panelSubtitle = $("panelSubtitle");
  const detailsGrid = $("detailsGrid");
  const closeBtn = $("closeBtn");
  const legSelect = $("legSelect");
  const topbar = $("topbar");

  // Map init
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  let routeLayer = null;
  const startMarkersLayer = L.layerGroup().addTo(map);

  let selectedLineLayer = null;
  let finishMarker = null;

  let lastSelectedCenter = null;
  let lastSelectedZoom = null;

  const layerByLeg = new Map();
  const featureByLeg = new Map();

  function safe(v) {
    return (v === undefined || v === null || v === "") ? "—" : v;
  }

  function formatKm(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(2)} km`;
  }

  function formatM(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${Math.round(n)} m`;
  }

  function asLink(url, label) {
    if (!url) return "—";
    const u = String(url);
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  function lineStyle(selected) {
    return {
      color: ORANGE,
      weight: selected ? 10 : 6,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    };
  }

  function diamondIcon(leg) {
    return L.divIcon({
      className: "",
      html: `
        <div class="diamond-wrap" aria-label="Leg ${leg} start marker">
          <div class="diamond-num">${leg}</div>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });
  }

  function finishIcon() {
    return L.divIcon({
      className: "finish-flag",
      html: "🏁",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });
  }

  function setCollapsed() {
    document.body.classList.remove("compact-header");
    panel.classList.remove("expanded");
    panel.classList.add("collapsed");
    panelExpanded.style.display = "none";
    panelTip.style.display = "block";
  }

  function setExpanded() {
    document.body.classList.add("compact-header");
    panel.classList.remove("collapsed");
    panel.classList.add("expanded");
    panelTip.style.display = "none";
    panelExpanded.style.display = "block";
  }

  function clearFinishFlag() {
    if (finishMarker) {
      map.removeLayer(finishMarker);
      finishMarker = null;
    }
  }

  function clearSelection(zoomOutALittle = false) {
    if (selectedLineLayer) {
      selectedLineLayer.setStyle(lineStyle(false));
      selectedLineLayer = null;
    }

    clearFinishFlag();
    legSelect.value = "";

    if (zoomOutALittle && lastSelectedCenter && Number.isFinite(lastSelectedZoom)) {
      const newZoom = Math.max(lastSelectedZoom - 1, map.getMinZoom());
      map.setView(lastSelectedCenter, newZoom, { animate: true });
    }

    setCollapsed();
  }

  function renderDetails(props) {
    const leg = safe(props.leg);
    const start = safe(props.start);
    const end = safe(props.end);

    panelLegTitle.textContent = `Leg ${leg}`;
    panelSubtitle.textContent = (start !== "—" && end !== "—") ? `${start} to ${end}` : "";

    detailsGrid.innerHTML = `
      <div class="row"><div class="label">Distance</div><div class="value">${formatKm(props.distance_km)}</div></div>
      <div class="row"><div class="label">Elevation gain</div><div class="value">${formatM(props.elevation_gain_m)}</div></div>
      <div class="row"><div class="label">Difficulty</div><div class="value">${safe(props.difficulty)}</div></div>
      <div class="row"><div class="label">Estimated running</div><div class="value">${safe(props.est_time_running)}</div></div>
      <div class="row"><div class="label">Estimated walking</div><div class="value">${safe(props.est_time_walking)}</div></div>
      <div class="row"><div class="label">Strava route</div><div class="value">${asLink(props.strava_url, "Open")}</div></div>
      <div class="row"><div class="label">Strava GPX</div><div class="value">${asLink(props.strava_gpx_url, "Download")}</div></div>
    `;
  }

  function addFinishFlagForFeature(feature) {
    clearFinishFlag();

    const coords = feature?.geometry?.coordinates;
    if (!coords || !coords.length) return;

    const last = coords[coords.length - 1]; // [lon, lat]
    if (!Array.isArray(last) || last.length < 2) return;

    const latlng = L.latLng(last[1], last[0]);
    finishMarker = L.marker(latlng, { icon: finishIcon(), interactive: false }).addTo(map);
  }

  function fitToLayerBetweenHeaderAndPanel(layer) {
    // Use Leaflet's padding options to keep the leg visible between header and expanded panel.
    const bounds = layer.getBounds();
    if (!bounds || !bounds.isValid()) return;

    // Measure actual UI heights at runtime
    const headerH = topbar.getBoundingClientRect().height;
    const panelH = panel.getBoundingClientRect().height;

    // Convert to pixel padding. Add a little breathing room.
    const padTop = Math.round(headerH + 12);
    const padBottom = Math.round(panelH + 14);

    map.fitBounds(bounds, {
      paddingTopLeft: [14, padTop],
      paddingBottomRight: [14, padBottom],
      animate: true,
    });
  }

  function selectLeg(legKey) {
    const layer = layerByLeg.get(String(legKey));
    const props = featureByLeg.get(String(legKey));
    if (!layer || !props) return;

    setExpanded();

    // style previous
    if (selectedLineLayer && selectedLineLayer !== layer) {
      selectedLineLayer.setStyle(lineStyle(false));
    }
    selectedLineLayer = layer;
    layer.setStyle(lineStyle(true));

    // dropdown reflect
    legSelect.value = String(legKey);

    // panel content
    renderDetails(props);

    // Fit with UI-aware padding
    // Wait one frame so the panel + compact header have their final sizes
    requestAnimationFrame(() => {
      fitToLayerBetweenHeaderAndPanel(layer);
      addFinishFlagForFeature(layer.feature);

      // Store this view for "zoom out a little" on close
      window.setTimeout(() => {
        lastSelectedCenter = map.getCenter();
        lastSelectedZoom = map.getZoom();
      }, 250);
    });
  }

  function populateDropdown(legs) {
    const frag = document.createDocumentFragment();
    for (const leg of legs) {
      const opt = document.createElement("option");
      opt.value = String(leg);
      opt.textContent = `Leg ${leg}`;
      frag.appendChild(opt);
    }
    legSelect.appendChild(frag);
  }

  async function load() {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch GeoJSON (${res.status})`);
    const geojson = await res.json();

    routeLayer = L.geoJSON(geojson, {
      style: () => lineStyle(false),
      filter: (f) => f && f.geometry && f.geometry.type === "LineString",
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const leg = props.leg;
        if (leg === undefined || leg === null || leg === "") return;

        const legKey = String(leg);
        layerByLeg.set(legKey, layer);
        featureByLeg.set(legKey, props);

        layer.on("click", () => selectLeg(legKey));
        layer.bindPopup(`Leg ${legKey}`, { closeButton: true });
      },
    }).addTo(map);

    startMarkersLayer.clearLayers();
    geojson.features
      .filter(f => f && f.geometry && f.geometry.type === "LineString" && Array.isArray(f.geometry.coordinates))
      .forEach(f => {
        const props = f.properties || {};
        const leg = props.leg;
        if (leg === undefined || leg === null || leg === "") return;

        const coords = f.geometry.coordinates;
        if (!coords.length) return;

        const first = coords[0];
        const latlng = L.latLng(first[1], first[0]);

        const marker = L.marker(latlng, {
          icon: diamondIcon(leg),
          title: `Leg ${leg} start`,
          riseOnHover: true,
        }).addTo(startMarkersLayer);

        marker.on("click", () => selectLeg(String(leg)));
        marker.bindPopup(`Leg ${leg}`, { closeButton: true });
      });

    // Populate dropdown
    const legsSorted = Array.from(layerByLeg.keys())
      .map(k => Number(k))
      .filter(n => Number.isFinite(n))
      .sort((a,b) => a - b)
      .map(n => String(n));

    populateDropdown(legsSorted);

    // Initial view: fit full route, very small padding
    const b = routeLayer.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b.pad(0.04), { animate: false });
    }

    setCollapsed();

    legSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (!val) return;
      selectLeg(val);
    });

    closeBtn.addEventListener("click", () => {
      clearSelection(true);
    });
  }

  load().catch((err) => {
    console.error(err);
    panelTip.textContent = "Couldn’t load the route. Please check the GeoJSON file path/name.";
    setCollapsed();
  });
})();
