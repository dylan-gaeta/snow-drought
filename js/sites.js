// Sites page: the individual observation stations behind the site-based
// products (AmeriFlux, NEON flux towers). An OpenLayers point map of the
// stations, colored by network; click a station to see its own monthly time
// series (data/sites/*). Reuses the Map page's WUS view + boundary layer.

const sitesState = {
  networks: {},        // key -> full network JSON (sites + series)
  visible: new Set(),  // networks currently shown on the map
  selected: null,      // { network, site } of the clicked station
  response: null,      // current variable for the selected site
  series: "value",     // value | anomaly
  map: null,
  layers: {},          // network -> ol vector layer
};

const SITES_EXTENT = ol.proj.transformExtent([-125.0, 31.0, -101.5, 49.5], "EPSG:4326", "EPSG:3857");
const SITES_PAN_EXTENT = ol.proj.transformExtent([-125.5, 30.5, -101.0, 50.0], "EPSG:4326", "EPSG:3857");

function buildSitesMap() {
  const boundary = new ol.layer.Vector({
    source: new ol.source.Vector({ url: assetUrl("data/western_states.geojson"), format: new ol.format.GeoJSON() }),
    style: new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#1b1b1b", width: 1 }) }),
    zIndex: 5,
  });
  sitesState.map = new ol.Map({
    target: "sites-map",
    layers: [new ol.layer.Tile({ source: new ol.source.OSM({ opaque: false }), opacity: 0.5 }), boundary],
    view: new ol.View({ center: ol.proj.fromLonLat([-113, 40]), zoom: 5, extent: SITES_PAN_EXTENT, showFullExtent: true }),
  });
  const mapEl = document.getElementById("sites-map");
  mapEl.style.aspectRatio = `${(SITES_EXTENT[2] - SITES_EXTENT[0]) / (SITES_EXTENT[3] - SITES_EXTENT[1])}`;
  sitesState.map.updateSize();
  sitesState.map.getView().fit(SITES_EXTENT, { size: sitesState.map.getSize() || [600, 500] });

  sitesState.map.on("click", (event) => {
    const feature = sitesState.map.forEachFeatureAtPixel(event.pixel, (f) => f, { hitTolerance: 5 });
    if (feature && feature.get("site")) selectSite(feature.get("network"), feature.get("site"));
  });
  sitesState.map.on("pointermove", (event) => {
    const hit = sitesState.map.hasFeatureAtPixel(event.pixel, { hitTolerance: 5 });
    sitesState.map.getTargetElement().style.cursor = hit ? "pointer" : "";
  });
}

function markerStyle(color, selected) {
  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: selected ? 8 : 5,
      fill: new ol.style.Fill({ color }),
      stroke: new ol.style.Stroke({ color: selected ? "#1b1b1b" : "#fff", width: selected ? 2.5 : 1.3 }),
    }),
  });
}

function buildNetworkLayer(network) {
  const net = sitesState.networks[network];
  const features = net.sites.map((s) => {
    const f = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([s.lon, s.lat])) });
    f.set("network", network);
    f.set("site", s.site);
    f.setStyle(markerStyle(net.color, false));
    return f;
  });
  const layer = new ol.layer.Vector({ source: new ol.source.Vector({ features }), zIndex: 10 });
  sitesState.layers[network] = layer;
  sitesState.map.addLayer(layer);
}

function refreshMarkerStyles() {
  Object.entries(sitesState.networks).forEach(([network, net]) => {
    const layer = sitesState.layers[network];
    if (!layer) return;
    layer.getSource().getFeatures().forEach((f) => {
      const isSel = sitesState.selected && sitesState.selected.network === network && sitesState.selected.site === f.get("site");
      f.setStyle(markerStyle(net.color, isSel));
    });
  });
}

function siteRecord(network, site) {
  return sitesState.networks[network].sites.find((s) => s.site === site);
}

function selectSite(network, site) {
  sitesState.selected = { network, site };
  const net = sitesState.networks[network];
  // Populate the variable selector with this site's available responses.
  const rec = siteRecord(network, site);
  const responses = net.responses.filter((r) => rec.series[r]);
  const select = document.getElementById("sites-response-select");
  select.innerHTML = "";
  responses.forEach((r) => {
    const o = document.createElement("option");
    o.value = r; o.textContent = r;
    select.appendChild(o);
  });
  if (!responses.includes(sitesState.response)) sitesState.response = responses[0];
  select.value = sitesState.response;
  refreshMarkerStyles();
  renderSiteChart();
}

function renderSiteChart() {
  const el = document.getElementById("sites-chart");
  if (!sitesState.selected) { el.innerHTML = ""; return; }
  const { network, site } = sitesState.selected;
  const net = sitesState.networks[network];
  const rec = siteRecord(network, site);
  const response = sitesState.response;
  const s = rec.series[response];
  document.getElementById("sites-chart-title").textContent = `${site} · ${response} — ${net.label}`;
  if (!s) { el.innerHTML = '<p class="chart-empty">No data for this variable at this site.</p>'; return; }
  const isAnom = sitesState.series === "anomaly";
  const y = isAnom ? s.anomaly : s.value;
  const traces = [{
    x: s.dates, y, type: "scatter", mode: "lines+markers",
    line: { color: net.color, width: 1.6 }, marker: { size: 3, color: net.color },
    hovertemplate: "%{x|%Y-%m}: %{y:.2f}<extra></extra>",
  }];
  Plotly.newPlot(el, traces, {
    margin: { t: 10, r: 16, b: 44, l: 60 },
    yaxis: { title: isAnom ? `${response} anomaly (${net.units})` : `${response} (${net.units})`, zeroline: isAnom, ...PLOTLY_AXIS_LINE },
    xaxis: { title: "Year", showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
    shapes: isAnom ? [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 0, line: { color: "#888", width: 1 } }] : [],
  }, { responsive: true, displaylogo: false });
}

function buildNetworkToggles(index) {
  const row = document.getElementById("sites-network-toggles");
  row.innerHTML = "";
  index.networks.forEach((n) => {
    const label = document.createElement("label");
    label.className = "boundary-toggle sites-network-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true;
    cb.addEventListener("change", () => {
      if (cb.checked) sitesState.visible.add(n.key); else sitesState.visible.delete(n.key);
      if (sitesState.layers[n.key]) sitesState.layers[n.key].setVisible(cb.checked);
    });
    const swatch = document.createElement("span");
    swatch.className = "sites-network-swatch"; swatch.style.background = n.color;
    label.appendChild(cb);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(`${n.label} (${n.n_sites})`));
    row.appendChild(label);
  });
}

async function init() {
  if (typeof ol === "undefined") {
    document.getElementById("sites-map").innerHTML = '<p class="chart-empty">Map library failed to load.</p>';
    return;
  }
  const index = await fetch(assetUrl("data/sites/index.json")).then((r) => (r.ok ? r.json() : null));
  if (!index || !index.networks.length) {
    document.getElementById("sites").insertAdjacentHTML("beforeend", '<p class="chart-empty">Site data not available yet.</p>');
    return;
  }
  buildSitesMap();
  buildNetworkToggles(index);
  const loaded = await Promise.all(index.networks.map((n) =>
    fetch(assetUrl(`data/sites/${n.key}.json`)).then((r) => r.json())));
  loaded.forEach((net) => {
    sitesState.networks[net.network] = net;
    sitesState.visible.add(net.network);
    buildNetworkLayer(net.network);
  });

  document.getElementById("sites-response-select").addEventListener("change", (e) => { sitesState.response = e.target.value; renderSiteChart(); });
  document.getElementById("sites-series-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-series]");
    if (!b) return;
    sitesState.series = b.dataset.series;
    document.querySelectorAll("#sites-series-toggle button").forEach((x) => x.classList.toggle("active", x === b));
    renderSiteChart();
  });
}

init();
