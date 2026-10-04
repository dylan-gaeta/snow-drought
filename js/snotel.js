// SNOTEL page: the NRCS automated snow network. A station map colored by SWE
// relative to normal for a selected month, a per-station snowpack record
// (selected water year vs the climatology percentile band + full history), and
// the elevation dependence of the anomaly (the warm-snow-drought signature).
// Data: data/snotel/{stations,monthly,climatology}.json.

const snotelState = {
  stations: null,     // stations.json
  monthly: null,      // monthly.json (shared dates + per-station arrays)
  climatology: null,  // climatology.json
  metric: "pct_of_median",
  year: null,
  month: 4,           // default April (peak snowpack)
  selected: null,     // selected station triplet
  map: null,
  layer: null,
};

const SNOTEL_EXTENT = ol.proj.transformExtent([-125.0, 31.0, -101.5, 49.5], "EPSG:4326", "EPSG:3857");
const SNOTEL_PAN_EXTENT = ol.proj.transformExtent([-125.5, 30.5, -101.0, 50.0], "EPSG:4326", "EPSG:3857");

// Discrete color scales per metric. % of normal and percentile are diverging
// (brown = low/drought, pale = normal, blue = high); raw SWE is sequential.
const METRIC_SCALES = {
  pct_of_median: {
    label: "SWE % of normal",
    bounds: [0, 50, 70, 90, 110, 130, 150, 200],
    colors: ["#8c510a", "#bf812d", "#dfc27d", "#f5f5f5", "#c7eae5", "#5ab4ac", "#2166ac", "#053061"],
    fmt: (v) => `${Math.round(v)}%`,
  },
  percentile: {
    label: "SWE percentile",
    bounds: [0, 10, 30, 50, 70, 90],
    colors: ["#b2182b", "#ef8a62", "#fddbc7", "#d1e5f0", "#67a9cf", "#2166ac"],
    fmt: (v) => `${Math.round(v)}`,
  },
  swe: {
    label: "SWE (mm)",
    bounds: [0, 50, 150, 300, 500, 750, 1000, 1500],
    colors: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08306b"],
    fmt: (v) => `${Math.round(v)}`,
  },
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function colorFor(metric, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const scale = METRIC_SCALES[metric];
  let bin = 0;
  while (bin < scale.bounds.length - 1 && value >= scale.bounds[bin + 1]) bin++;
  return scale.colors[bin];
}

// Value of the chosen metric for one station at the selected year/month, or
// null if that station has no observation then.
function metricValue(triplet) {
  const key = `${snotelState.year}-${String(snotelState.month).padStart(2, "0")}`;
  const dateIdx = snotelState.monthly.dates.indexOf(key);
  if (dateIdx === -1) return null;
  const s = snotelState.monthly.stations[triplet];
  if (!s) return null;
  const j = dateIdx - s.start;
  if (j < 0 || j >= s.swe.length) return null;
  const v = snotelState.metric === "swe" ? s.swe[j]
    : snotelState.metric === "percentile" ? s.percentile[j] : s.pct_of_median[j];
  return v === null || v === undefined ? null : v;
}

function markerStyle(color, selected) {
  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: selected ? 8 : 5,
      fill: new ol.style.Fill({ color: color || "rgba(150,150,150,0.35)" }),
      stroke: new ol.style.Stroke({ color: selected ? "#1b1b1b" : "#333", width: selected ? 2.5 : 0.8 }),
    }),
  });
}

function buildMap() {
  const boundary = new ol.layer.Vector({
    source: new ol.source.Vector({ url: assetUrl("data/western_states.geojson"), format: new ol.format.GeoJSON() }),
    style: new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#1b1b1b", width: 1 }) }),
    zIndex: 5,
  });
  snotelState.map = new ol.Map({
    target: "snotel-map",
    layers: [new ol.layer.Tile({ source: new ol.source.OSM({ opaque: false }), opacity: 0.5 }), boundary],
    view: new ol.View({ center: ol.proj.fromLonLat([-113, 40]), zoom: 5, extent: SNOTEL_PAN_EXTENT, showFullExtent: true }),
  });
  const mapEl = document.getElementById("snotel-map");
  mapEl.style.aspectRatio = `${(SNOTEL_EXTENT[2] - SNOTEL_EXTENT[0]) / (SNOTEL_EXTENT[3] - SNOTEL_EXTENT[1])}`;
  snotelState.map.updateSize();
  snotelState.map.getView().fit(SNOTEL_EXTENT, { size: snotelState.map.getSize() || [600, 500] });

  const features = snotelState.stations.stations.map((st) => {
    const f = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([st.lon, st.lat])) });
    f.set("triplet", st.triplet);
    return f;
  });
  snotelState.layer = new ol.layer.Vector({ source: new ol.source.Vector({ features }), zIndex: 10 });
  snotelState.map.addLayer(snotelState.layer);

  snotelState.map.on("click", (event) => {
    const feature = snotelState.map.forEachFeatureAtPixel(event.pixel, (f) => f, { hitTolerance: 4 });
    if (feature && feature.get("triplet")) selectStation(feature.get("triplet"));
  });
  snotelState.map.on("pointermove", (event) => {
    snotelState.map.getTargetElement().style.cursor = snotelState.map.hasFeatureAtPixel(event.pixel, { hitTolerance: 4 }) ? "pointer" : "";
  });
}

function refreshMap() {
  snotelState.layer.getSource().getFeatures().forEach((f) => {
    const triplet = f.get("triplet");
    const color = colorFor(snotelState.metric, metricValue(triplet));
    f.setStyle(markerStyle(color, triplet === snotelState.selected));
  });
  renderLegend();
  renderElevation();
}

function renderLegend() {
  const scale = METRIC_SCALES[snotelState.metric];
  const el = document.getElementById("snotel-legend");
  const swatches = scale.colors.map((c, i) => {
    const lo = scale.bounds[i];
    const hi = i < scale.bounds.length - 1 ? scale.bounds[i + 1] : null;
    const title = hi === null ? `≥ ${lo}` : `${lo}–${hi}`;
    return `<span class="snotel-legend-item"><span class="snotel-legend-swatch" style="background:${c}"></span>${title}</span>`;
  }).join("");
  el.innerHTML = `<span class="snotel-legend-label">${scale.label} · ${MONTH_LABELS[snotelState.month - 1]} ${snotelState.year}</span>${swatches}`;
}

// ---------------------------------------------------- station detail
function stationMeta(triplet) {
  return snotelState.stations.stations.find((s) => s.triplet === triplet);
}

function waterYearMonthsFor(year) {
  // Oct(year-1) .. Sep(year): [[10,y-1],...,[9,y]]
  return [[10, year - 1], [11, year - 1], [12, year - 1],
    [1, year], [2, year], [3, year], [4, year], [5, year], [6, year], [7, year], [8, year], [9, year]];
}

function selectStation(triplet) {
  snotelState.selected = triplet;
  renderDetail();
  refreshMap();
}

function renderDetail() {
  const triplet = snotelState.selected;
  if (!triplet) return;
  const meta = stationMeta(triplet);
  const s = snotelState.monthly.stations[triplet];
  const bands = snotelState.climatology.stations[triplet];
  document.getElementById("snotel-detail-title").textContent =
    `${meta.name}, ${meta.state} — ${meta.elev_ft ? meta.elev_ft.toLocaleString() + " ft" : "elevation n/a"}`;
  document.getElementById("snotel-detail-note").textContent =
    `Water year ${snotelState.year} monthly SWE vs the ${snotelState.climatology.baseline_start_year}–${snotelState.climatology.baseline_end_year} normal (median, 10th–90th percentile band).`;

  // Seasonal: selected water year vs climatology band, by water-year month order.
  const months = waterYearMonthsFor(snotelState.year);
  const x = months.map(([m]) => MONTH_LABELS[m - 1]);
  const sweOf = (m, y) => {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const idx = snotelState.monthly.dates.indexOf(key);
    if (idx === -1 || !s) return null;
    const j = idx - s.start;
    return (j < 0 || j >= s.swe.length) ? null : s.swe[j];
  };
  const yearCurve = months.map(([m, y]) => sweOf(m, y));
  const median = months.map(([m]) => (bands && bands[m] ? bands[m][2] : null));
  const p10 = months.map(([m]) => (bands && bands[m] ? bands[m][0] : null));
  const p90 = months.map(([m]) => (bands && bands[m] ? bands[m][4] : null));
  const traces = [
    { x, y: p10, type: "scatter", mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
    { x, y: p90, type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(33,102,172,0.15)", name: "10th–90th pct", hoverinfo: "skip" },
    { x, y: median, type: "scatter", mode: "lines+markers", line: { color: "#2166ac", width: 2, dash: "dot" }, marker: { size: 5 }, name: "Normal (median)" },
    { x, y: yearCurve, type: "scatter", mode: "lines+markers", line: { color: "#8c510a", width: 3 }, marker: { size: 6 }, name: `WY ${snotelState.year}` },
  ];
  Plotly.newPlot("snotel-detail-chart", traces, {
    margin: { t: 10, r: 16, b: 40, l: 60 },
    yaxis: { title: "SWE (mm)", rangemode: "tozero", ...PLOTLY_AXIS_LINE },
    xaxis: { type: "category", showgrid: false, ...PLOTLY_AXIS_LINE },
    legend: { orientation: "h", y: -0.18 }, font: { family: "Source Sans Pro, sans-serif", size: 13 },
  }, { responsive: true, displaylogo: false });

  // Full monthly history.
  if (s) {
    const histDates = s.swe.map((_, i) => snotelState.monthly.dates[s.start + i] + "-01");
    Plotly.newPlot("snotel-history-chart", [{
      x: histDates, y: s.swe, type: "scatter", mode: "lines", line: { color: "#2166ac", width: 1 },
      hovertemplate: "%{x|%Y-%m}: %{y:.0f} mm<extra></extra>",
    }], {
      margin: { t: 10, r: 16, b: 40, l: 60 },
      yaxis: { title: "SWE (mm)", rangemode: "tozero", ...PLOTLY_AXIS_LINE },
      xaxis: { title: "Full record", showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
      font: { family: "Source Sans Pro, sans-serif", size: 13 },
    }, { responsive: true, displaylogo: false });
  }
}

// ---------------------------------------------------- elevation lens
function renderElevation() {
  const scale = METRIC_SCALES.pct_of_median;
  document.getElementById("snotel-elev-title").textContent =
    `Snow drought by elevation — ${MONTH_LABELS[snotelState.month - 1]} ${snotelState.year}`;
  const xs = [], ys = [], colors = [], text = [];
  snotelState.stations.stations.forEach((st) => {
    if (st.elev_ft === null) return;
    const saved = snotelState.metric;
    snotelState.metric = "pct_of_median";
    const v = metricValue(st.triplet);
    snotelState.metric = saved;
    if (v === null) return;
    xs.push(st.elev_ft); ys.push(v); colors.push(colorFor("pct_of_median", v));
    text.push(`${st.name}, ${st.state}`);
  });
  Plotly.newPlot("snotel-elev-chart", [{
    x: xs, y: ys, text, type: "scatter", mode: "markers",
    marker: { size: 6, color: colors, line: { color: "#333", width: 0.5 } },
    hovertemplate: "%{text}<br>%{x:,} ft · %{y:.0f}% of normal<extra></extra>",
  }], {
    margin: { t: 10, r: 16, b: 46, l: 60 },
    xaxis: { title: "Elevation (ft)", showgrid: false, ...PLOTLY_AXIS_LINE },
    yaxis: { title: "SWE % of normal", rangemode: "tozero", ...PLOTLY_AXIS_LINE },
    shapes: [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 100, y1: 100, line: { color: "#888", width: 1, dash: "dash" } }],
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
  }, { responsive: true, displaylogo: false });
}

// ---------------------------------------------------- init
function defaultYearMonth() {
  // Most recent April present in the data (peak-snowpack reference); fall back
  // to the latest month otherwise.
  const dates = snotelState.monthly.dates;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i].endsWith("-04")) return { year: parseInt(dates[i].slice(0, 4), 10), month: 4 };
  }
  const last = dates[dates.length - 1];
  return { year: parseInt(last.slice(0, 4), 10), month: parseInt(last.slice(5, 7), 10) };
}

function populateYearMonth() {
  const dates = snotelState.monthly.dates;
  const years = [...new Set(dates.map((d) => parseInt(d.slice(0, 4), 10)))].sort((a, b) => a - b);
  const yearSel = document.getElementById("snotel-year-select");
  years.forEach((y) => { const o = document.createElement("option"); o.value = y; o.textContent = y; if (y === snotelState.year) o.selected = true; yearSel.appendChild(o); });
  const monthSel = document.getElementById("snotel-month-select");
  MONTH_LABELS.forEach((label, i) => { const o = document.createElement("option"); o.value = i + 1; o.textContent = label; if (i + 1 === snotelState.month) o.selected = true; monthSel.appendChild(o); });
}

async function init() {
  if (typeof ol === "undefined") { document.getElementById("snotel-map").innerHTML = '<p class="chart-empty">Map library failed to load.</p>'; return; }
  const [stations, monthly, climatology] = await Promise.all([
    fetch(assetUrl("data/snotel/stations.json")).then((r) => r.json()),
    fetch(assetUrl("data/snotel/monthly.json")).then((r) => r.json()),
    fetch(assetUrl("data/snotel/climatology.json")).then((r) => r.json()),
  ]);
  snotelState.stations = stations;
  snotelState.monthly = monthly;
  snotelState.climatology = climatology;
  const def = defaultYearMonth();
  snotelState.year = def.year; snotelState.month = def.month;
  populateYearMonth();
  buildMap();
  refreshMap();

  document.getElementById("snotel-metric-select").addEventListener("change", (e) => { snotelState.metric = e.target.value; refreshMap(); });
  document.getElementById("snotel-year-select").addEventListener("change", (e) => { snotelState.year = parseInt(e.target.value, 10); refreshMap(); if (snotelState.selected) renderDetail(); });
  document.getElementById("snotel-month-select").addEventListener("change", (e) => { snotelState.month = parseInt(e.target.value, 10); refreshMap(); });
}

init();
