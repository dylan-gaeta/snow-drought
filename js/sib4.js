// SiB4 page: the mechanistic land-biosphere model's drought response resolved
// by plant functional type (PFT) and by time of day. Reads the per-PFT detail
// data (data/sib4/*) written by dashboard_export.py's --sib4-detail; the
// compare panel reuses the standard data/timeseries/*.json. Standalone page
// (no product-picker.js); mirrors js/classification.js's structure.

const sib4State = {
  region: "ALL",
  tsVariable: "GPP",
  tsSeries: "raw",       // raw | sigma | anomaly
  tsView: "series",      // series | seasonal
  startYear: null,       // time-axis window floor
  tsAggregate: true,
  tsPfts: {},            // { [region]: Set of checked PFT codes } (per region, since PFT sets differ)
  limitationSeries: "raw",
  stressFactors: new Set(["ROOT_STRESS", "LEAF_STRESS", "TEMP_STRESS"]),
  diurnalVariable: "GPP",
  diurnalMonth: 7,
  diurnalPft: "AGG",
  compareVariable: "GPP",
  compareChecked: {}, // { [sib4var]: Set of "product|response" }
};

// Which observational + model datasets correspond to each SiB4 variable, for
// the compare panel. Filtered against the manifest at render time, so a pair
// that isn't in this build is silently skipped rather than 404-ing.
const SIB4_CORRESPONDENCE = {
  GPP: [["MODIS-Terra", "GPP"], ["MODIS-Aqua", "GPP"], ["FluxSat", "GPP"], ["GOSIF-GPP", "GPP"], ["AmeriFlux", "GPP"]],
  NEE: [["CarbonTracker", "NEE"], ["MiCASA", "NEE"], ["CAMS", "LAND_CARBON_EXCHANGE"], ["NEON", "NEE"], ["AmeriFlux", "NEE"]],
  RECO: [["MiCASA", "RH"]],
  SIF: [["TROPOSIF", "SIF"], ["GOSIF", "SIF"], ["OCO-2", "SIF"]],
  LAI: [["MODIS-Terra", "LAI"], ["MODIS-Aqua", "LAI"], ["MODIS-Terra", "NDVI"], ["VIIRS-NDVI", "NDVI"]],
};

const SIB4_NAVY = "#023858";
const COMPARE_COLORS = ["#b2182b", "#ef8a62", "#fddbc7", "#4393c3", "#2166ac", "#762a83", "#1b7837", "#999999"];
// Three distinct hues (soil=brown, air/humidity=blue, temperature=magenta):
// rstfac1 and rstfac2 were both brown and too close to tell apart once the
// axis autoscaled. Validated colorblind-safe (dataviz validate_palette).
const STRESS_COLORS = { ROOT_STRESS: "#8c510a", LEAF_STRESS: "#2166ac", TEMP_STRESS: "#c51b7d" };

const _sib4Cache = {};
function fetchSib4(kind, key) {
  const url = kind === "composition" ? "data/sib4/composition.json" : `data/sib4/${kind}/${key}.json`;
  if (!_sib4Cache[url]) _sib4Cache[url] = fetch(assetUrl(url)).then((r) => (r.ok ? r.json() : null));
  return _sib4Cache[url];
}

function pftMeta() { return manifest.sib4_pft; }
function pftColor(code) {
  const m = pftMeta();
  return (m.pft_line_colors && m.pft_line_colors[code]) || m.pft_colors[code] || "#888";
}
function pftFillColor(code) { return pftMeta().pft_colors[code] || "#888"; }
function pftLabel(code) { return pftMeta().pft_labels[code] || code; }
function monthlyVar(key) { return pftMeta().monthly_variables.find((v) => v.key === key); }

// Order a region's PFTs by the manifest's WUS-dominant pft_order.
function orderPfts(codes) {
  const order = pftMeta().pft_order;
  return codes.slice().sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

const PLOTLY_BASE = { font: { family: "Source Sans Pro, sans-serif", size: 13 }, displaylogo: false, responsive: true };

// --------------------------------------------------------------- 1. composition
async function renderComposition() {
  const el = document.getElementById("sib4-composition");
  const comp = await fetchSib4("composition");
  const region = comp.regions[sib4State.region];
  document.getElementById("sib4-composition-title").textContent = `PFT land cover — ${regionLabelFor(sib4State.region)}`;
  if (!region) { el.innerHTML = '<p class="chart-empty">No composition for this region.</p>'; return; }
  const traces = region.pft_order.map((code) => ({
    x: [region.pft[code].area_fraction * 100], y: ["land cover"], name: pftLabel(code),
    type: "bar", orientation: "h", marker: { color: pftFillColor(code), line: { color: "#fff", width: 0.5 } },
    hovertemplate: `${pftLabel(code)}: %{x:.1f}%<extra></extra>`,
  }));
  Plotly.newPlot(el, traces, {
    barmode: "stack", showlegend: true,
    legend: { orientation: "h", y: -0.55, yanchor: "top", font: { size: 12 } },
    margin: { t: 6, r: 12, b: 48, l: 12 },
    xaxis: { title: "share of land (%)", range: [0, 100], ...PLOTLY_AXIS_LINE },
    yaxis: { showticklabels: false }, ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
}

// --------------------------------------------------- 2. SiB4 stress functions
const STRESS_KEYS = ["ROOT_STRESS", "LEAF_STRESS", "TEMP_STRESS"];
const STRESS_LABELS = { ROOT_STRESS: "Rootzone water (rstfac2)", LEAF_STRESS: "Leaf/humidity water (rstfac1)", TEMP_STRESS: "Temperature (rstfac3)" };

function renderStressFactorButtons() {
  const box = document.getElementById("sib4-limitation-factors");
  box.innerHTML = STRESS_KEYS.map((k) =>
    `<button type="button" data-factor="${k}" class="${sib4State.stressFactors.has(k) ? "active" : ""}">${STRESS_LABELS[k]}</button>`
  ).join("");
}

async function renderLimitation() {
  const el = document.getElementById("sib4-limitation");
  document.getElementById("sib4-limitation-title").textContent = `Stress functions — ${regionLabelFor(sib4State.region)}`;
  const isAnom = sib4State.limitationSeries === "anomaly";
  const shown = STRESS_KEYS.filter((k) => sib4State.stressFactors.has(k));
  const data = await Promise.all(shown.map((k) => fetchSib4("timeseries", k)));
  const traces = [];
  shown.forEach((k, i) => {
    const agg = data[i] && data[i].regions[sib4State.region] && data[i].regions[sib4State.region].AGG;
    if (!agg) return;
    // Plot the actual rstfac stress function (0-1, 1 = unstressed); anomaly = raw departure.
    const raw = isAnom ? agg.anomaly : agg.value;
    const { dates, values } = afterStart(data[i].dates, raw);
    traces.push({ x: dates, y: values, type: "scatter", mode: "lines", name: STRESS_LABELS[k], line: { color: STRESS_COLORS[k], width: 2 } });
  });
  Plotly.newPlot(el, traces, {
    margin: { t: 8, r: 16, b: 40, l: 56 },
    // Autorange rather than a forced [0,1]: WUS rstfac values sit low (~0.06-0.33),
    // so pinning the axis to the full 0-1 range flattened all three lines against
    // the bottom and hid their variation (Dylan, 2026-10). The title still states
    // the 0-1 convention.
    yaxis: { title: isAnom ? "stress-function anomaly" : "stress function (0-1, 1 = unstressed)", zeroline: isAnom, ...PLOTLY_AXIS_LINE },
    xaxis: { showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    legend: { orientation: "h", y: -0.18 }, ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
}

// --------------------------------------------------- 3. per-PFT time series
function afterStart(dates, values) {
  const y0 = sib4State.startYear;
  if (!y0) return { dates, values };
  const keep = dates.map((d) => parseInt(d.slice(0, 4), 10) >= y0);
  return { dates: dates.filter((_, i) => keep[i]), values: values.filter((_, i) => keep[i]) };
}

// Which PFTs are checked for the current region. Default: the 4 most dominant
// (pfts arrives pre-ordered by WUS cover), so a region doesn't open with 14
// lines overlaid (Dylan, 2026-10). Persists per region.
const SIB4_DEFAULT_PFT_COUNT = 4;
function checkedPfts(orderedPfts) {
  const region = sib4State.region;
  if (!sib4State.tsPfts[region]) {
    sib4State.tsPfts[region] = new Set(orderedPfts.slice(0, SIB4_DEFAULT_PFT_COUNT));
  }
  return sib4State.tsPfts[region];
}

function renderPftCheckboxes(orderedPfts, checked) {
  const box = document.getElementById("sib4-pft-checkboxes");
  box.innerHTML = "";
  orderedPfts.forEach((code) => {
    const label = document.createElement("label");
    label.className = "compare-legend-item";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = checked.has(code);
    cb.addEventListener("change", (e) => {
      if (e.target.checked) checked.add(code); else checked.delete(code);
      renderPftTimeseries();
    });
    const sw = document.createElement("span");
    sw.className = "compare-legend-swatch"; sw.style.background = pftFillColor(code);
    label.appendChild(cb); label.appendChild(sw); label.appendChild(document.createTextNode(pftLabel(code)));
    box.appendChild(label);
  });
}

async function renderPftTimeseries() {
  if (sib4State.tsView === "seasonal") return renderPftSeasonal();
  const el = document.getElementById("sib4-pft-timeseries");
  const key = sib4State.tsVariable;
  const info = monthlyVar(key);
  const data = await fetchSib4("timeseries", key);
  const region = data && data.regions[sib4State.region];
  document.getElementById("sib4-ts-title").textContent = `${info.long_name} by PFT — ${regionLabelFor(sib4State.region)}`;
  const mode = sib4State.tsSeries; // raw | sigma | anomaly
  const isSigma = mode === "sigma";
  const isAnom = mode === "anomaly";
  const departure = isSigma || isAnom;
  const noteEl = document.getElementById("sib4-ts-note");
  noteEl.textContent = info.bounded && isSigma
    ? "Bounded 0–1 stress scalar: shown as native departure (no σ); switch to Anomaly (raw)."
    : `Units: ${data.units} · area-weighted mean per PFT.`;
  if (!region) { el.innerHTML = '<p class="chart-empty">No data for this region.</p>'; return; }
  const pick = (s) => isSigma ? (info.bounded ? s.anomaly : s.sigma) : isAnom ? s.anomaly : s.value;
  const pfts = orderPfts(Object.keys(region).filter((p) => p !== "AGG"));
  const checked = checkedPfts(pfts);
  renderPftCheckboxes(pfts, checked);
  const traces = [];
  pfts.filter((code) => checked.has(code)).forEach((code) => {
    const { dates, values } = afterStart(data.dates, pick(region[code]));
    traces.push({ x: dates, y: values, type: "scatter", mode: "lines", name: pftLabel(code), line: { color: pftColor(code), width: 1.8 }, connectgaps: false });
  });
  if (sib4State.tsAggregate && region.AGG) {
    const { dates, values } = afterStart(data.dates, pick(region.AGG));
    traces.push({ x: dates, y: values, type: "scatter", mode: "lines", name: "Region mean", line: { color: SIB4_NAVY, width: 3 }, connectgaps: false });
  }
  const yTitle = isSigma && !info.bounded ? "Standardized anomaly (σ)"
    : departure ? `${key} anomaly (${data.units})` : `${key} (${data.units})`;
  const isNarrow = window.innerWidth < 820;
  Plotly.newPlot(el, traces, {
    margin: { t: 8, r: 16, b: isNarrow ? 90 : 40, l: 60 },
    yaxis: { title: yTitle, zeroline: departure, ...PLOTLY_AXIS_LINE },
    xaxis: { showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    legend: isNarrow ? { orientation: "h", y: -0.3 } : {},
    shapes: departure ? [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 0, line: { color: "#888", width: 1 } }] : [],
    ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
}

// Per-PFT water-year seasonal cycle (climatology mean ±2σ band + the region
// mean), from data/sib4/seasonal/{KEY}.json. Raw units only (anomaly band is
// a departure already); sigma not applicable to a climatology.
async function renderPftSeasonal() {
  const el = document.getElementById("sib4-pft-timeseries");
  const key = sib4State.tsVariable;
  const info = monthlyVar(key);
  const data = await fetchSib4("seasonal", key);
  document.getElementById("sib4-ts-title").textContent = `${info.long_name} seasonal cycle by PFT — ${regionLabelFor(sib4State.region)}`;
  const region = data && data.regions[sib4State.region];
  document.getElementById("sib4-ts-note").textContent = `Water year (Oct–Sep) · units ${data ? data.units : ""}.`;
  if (!region) { el.innerHTML = '<p class="chart-empty">Seasonal cycle not available for this variable.</p>'; return; }
  const x = manifest.water_year_month_names;
  const isAnom = sib4State.tsSeries !== "raw"; // raw climatology vs anomaly band
  const pfts = orderPfts(Object.keys(region).filter((p) => p !== "AGG"));
  const checked = checkedPfts(pfts);
  renderPftCheckboxes(pfts, checked);
  const traces = [];
  pfts.filter((code) => checked.has(code)).forEach((code) => {
    const c = region[code];
    if (!c) return;
    const y = isAnom ? (c.anomaly_upper ? c.anomaly_upper.map(() => 0) : null) : c.climatology_mean;
    if (!y) return;
    traces.push({ x, y, type: "scatter", mode: "lines", name: pftLabel(code), line: { color: pftColor(code), width: 1.5 }, opacity: 0.85 });
  });
  const agg = region.AGG;
  if (sib4State.tsAggregate && agg) {
    const upper = isAnom ? agg.anomaly_upper : agg.climatology_upper;
    const lower = isAnom ? agg.anomaly_lower : agg.climatology_lower;
    const mean = isAnom ? upper.map(() => 0) : agg.climatology_mean;
    if (upper && lower) {
      traces.push({ x, y: lower, type: "scatter", mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" });
      traces.push({ x, y: upper, type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: hexToRgba(SIB4_NAVY, 0.15), name: "Region mean ±2σ", hoverinfo: "skip" });
    }
    traces.push({ x, y: mean, type: "scatter", mode: "lines+markers", line: { color: SIB4_NAVY, width: 3 }, marker: { size: 5 }, name: "Region mean" });
  }
  const isNarrow = window.innerWidth < 820;
  Plotly.newPlot(el, traces, {
    margin: { t: 8, r: 16, b: isNarrow ? 90 : 45, l: 60 },
    yaxis: { title: isAnom ? `${key} anomaly (${data.units})` : `${key} (${data.units})`, zeroline: isAnom, ...PLOTLY_AXIS_LINE },
    xaxis: { type: "category", showgrid: false, ...PLOTLY_AXIS_LINE },
    legend: isNarrow ? { orientation: "h", y: -0.3 } : {}, ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
}

// --------------------------------------------------- 4. diurnal cycle
async function renderDiurnal() {
  const el = document.getElementById("sib4-diurnal");
  const key = sib4State.diurnalVariable;
  const data = await fetchSib4("diurnal", key);
  const region = data && data.regions[sib4State.region];
  const dv = pftMeta().diurnal_variables.find((v) => v.key === key);
  const monthIdx = sib4State.diurnalMonth - 1;
  const pft = sib4State.diurnalPft;
  document.getElementById("sib4-diurnal-title").textContent =
    `Diurnal ${dv.long_name} · ${MONTH_NAMES[monthIdx]} — ${regionLabelFor(sib4State.region)}${pft === "AGG" ? "" : " · " + pftLabel(pft)}`;
  if (!region) { el.innerHTML = '<p class="chart-empty">No diurnal data for this region.</p>'; return; }
  const hours = data.hours;
  const traces = [];
  const climatology = pft === "AGG" ? region.climatology_aggregate : (region.climatology[pft] || null);
  if (climatology) {
    traces.push({ x: hours, y: climatology[monthIdx], type: "scatter", mode: "lines", name: "Climatology", line: { color: "#555", width: 3 } });
  }
  // Highlight (drought) years are stored aggregate-only.
  if (pft === "AGG" && region.highlight_years) {
    const colors = manifest.seasonal_highlight_year_colors || {};
    Object.keys(region.highlight_years).sort().forEach((yr) => {
      traces.push({ x: hours, y: region.highlight_years[yr][monthIdx], type: "scatter", mode: "lines", name: yr, line: { color: colors[yr] || "#1f78b4", width: 2 } });
    });
  }
  if (!traces.length) { el.innerHTML = '<p class="chart-empty">This PFT has no cover in this region.</p>'; return; }
  Plotly.newPlot(el, traces, {
    margin: { t: 8, r: 16, b: 46, l: 60 },
    xaxis: { title: "local solar time (hour)", dtick: 3, range: [0, 23], ...PLOTLY_AXIS_LINE },
    yaxis: { title: `${key} (${data.units})`, ...PLOTLY_AXIS_LINE },
    legend: { orientation: "h", y: -0.2 }, ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
}

// --------------------------------------------------- 5. compare vs SiB4
async function renderCompare() {
  const chart = document.getElementById("sib4-compare-chart");
  const legendEl = document.getElementById("sib4-compare-legend");
  const key = sib4State.compareVariable;
  const info = monthlyVar(key);
  document.getElementById("sib4-compare-title").textContent = `${info.long_name}: datasets vs SiB4 — ${regionLabelFor(sib4State.region)}`;
  const pairs = (SIB4_CORRESPONDENCE[key] || []).filter(([p, r]) => findResponseEntry(p, r));
  if (!sib4State.compareChecked[key]) sib4State.compareChecked[key] = new Set(pairs.slice(0, 3).map(([p, r]) => `${p}|${r}`));
  const checked = sib4State.compareChecked[key];

  const sib4Data = await fetchSib4("timeseries", key);
  const sib4Region = sib4Data && sib4Data.regions[sib4State.region];
  const traces = [];
  if (sib4Region && sib4Region.AGG && !info.bounded) {
    const sign = info.drier_is_high ? 1 : -1;
    const { dates, values } = afterStart(sib4Data.dates, sib4Region.AGG.sigma.map((v) => (v == null ? null : sign * v)));
    traces.push({ x: dates, y: values, type: "scatter", mode: "lines", name: "SiB4", line: { color: SIB4_NAVY, width: 3 }, connectgaps: false });
  }
  const others = await Promise.all(pairs.map(([p, r]) => fetchTimeseriesJson(`${p}_${r}`)));
  const legendItems = [];
  pairs.forEach(([product, response], i) => {
    const d = others[i];
    const region = d && d.regions[sib4State.region];
    const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
    const name = `${product} ${response}`;
    const pairKey = `${product}|${response}`;
    legendItems.push({ name, color, pairKey, visible: checked.has(pairKey) });
    if (!region) return;
    const sign = d.drier_is_high ? 1 : -1;
    const { dates, values } = afterStart(region.dates, region.sigma.map((v) => (v == null ? null : sign * v)));
    traces.push({ x: dates, y: values, type: "scatter", mode: "lines", name, line: { color, width: 2 }, visible: checked.has(pairKey), connectgaps: false });
  });
  Plotly.newPlot(chart, traces, {
    margin: { t: 8, r: 16, b: 40, l: 56 },
    yaxis: { title: "Standardized anomaly (σ)", zeroline: true, ...PLOTLY_AXIS_LINE },
    xaxis: { showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    showlegend: false, shapes: [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 0, line: { color: "#888", width: 1 } }], ...PLOTLY_BASE,
  }, { displaylogo: false, responsive: true });
  // checkbox legend (SiB4 is always on; datasets toggle)
  legendEl.innerHTML = "";
  legendItems.forEach((item) => {
    const label = document.createElement("label");
    label.className = "compare-legend-item";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = item.visible;
    cb.addEventListener("change", (e) => { if (e.target.checked) checked.add(item.pairKey); else checked.delete(item.pairKey); renderCompare(); });
    const sw = document.createElement("span");
    sw.className = "compare-legend-swatch"; sw.style.background = item.color;
    label.appendChild(cb); label.appendChild(sw); label.appendChild(document.createTextNode(item.name));
    legendEl.appendChild(label);
  });
}

// --------------------------------------------------------------- init / wiring
function populateVariableSelect(id, variables, selected) {
  const sel = document.getElementById(id);
  sel.innerHTML = "";
  variables.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.key; o.textContent = v.long_name;
    if (v.key === selected) o.selected = true;
    sel.appendChild(o);
  });
}

async function populateDiurnalPftSelect() {
  const data = await fetchSib4("diurnal", sib4State.diurnalVariable);
  const region = data && data.regions[sib4State.region];
  const sel = document.getElementById("sib4-diurnal-pft");
  sel.innerHTML = "";
  const addOpt = (val, text) => { const o = document.createElement("option"); o.value = val; o.textContent = text; if (val === sib4State.diurnalPft) o.selected = true; sel.appendChild(o); };
  addOpt("AGG", "Region mean (all vegetation)");
  if (region) orderPfts(Object.keys(region.climatology)).forEach((code) => addOpt(code, pftLabel(code)));
  if (!region || (sib4State.diurnalPft !== "AGG" && !region.climatology[sib4State.diurnalPft])) sib4State.diurnalPft = "AGG";
  sel.value = sib4State.diurnalPft;
}

const SIB4_DEFAULT_START_YEAR = 2000;
function populateStartYear() {
  const meta = pftMeta();
  const first = parseInt(meta.record_start.slice(0, 4), 10);
  const last = parseInt(meta.record_end.slice(0, 4), 10);
  const sel = document.getElementById("sib4-start-year");
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = ""; all.textContent = `All years (from ${first})`;
  sel.appendChild(all);
  for (let y = first; y <= last; y++) {
    const o = document.createElement("option");
    o.value = String(y); o.textContent = String(y);
    sel.appendChild(o);
  }
  sib4State.startYear = Math.min(Math.max(first, SIB4_DEFAULT_START_YEAR), last);
  sel.value = String(sib4State.startYear);
}

// Panels that honor the start-year window (the diurnal + composition panels
// are climatologies, so a start-year filter doesn't apply to them).
function renderWindowed() {
  renderLimitation();
  renderPftTimeseries();
  renderCompare();
}

function renderAll() {
  renderComposition();
  renderLimitation();
  renderPftTimeseries();
  renderDiurnal();
  renderCompare();
}

async function init() {
  await loadManifest();
  if (!manifest.sib4_pft) {
    document.getElementById("sib4").insertAdjacentHTML("beforeend", '<p class="chart-empty">SiB4 detail data not available yet.</p>');
    return;
  }
  const meta = pftMeta();
  populateRegionToggle(document.getElementById("region-toggle"), sib4State.region);
  document.getElementById("region-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-region]");
    if (!btn) return;
    sib4State.region = btn.dataset.region;
    activateRegionButton(document.getElementById("region-toggle"), sib4State.region);
    populateDiurnalPftSelect().then(renderAll);
  });

  populateStartYear();
  document.getElementById("sib4-start-year").addEventListener("change", (e) => {
    sib4State.startYear = e.target.value ? parseInt(e.target.value, 10) : null;
    renderWindowed();
  });

  populateVariableSelect("sib4-ts-variable", meta.monthly_variables, sib4State.tsVariable);
  populateVariableSelect("sib4-diurnal-variable", meta.diurnal_variables, sib4State.diurnalVariable);
  populateVariableSelect("sib4-compare-variable", meta.monthly_variables.filter((v) => SIB4_CORRESPONDENCE[v.key]), sib4State.compareVariable);

  const monthSel = document.getElementById("sib4-diurnal-month");
  MONTH_NAMES.forEach((name, i) => { const o = document.createElement("option"); o.value = String(i + 1); o.textContent = name; if (i + 1 === sib4State.diurnalMonth) o.selected = true; monthSel.appendChild(o); });

  document.getElementById("sib4-ts-variable").addEventListener("change", (e) => { sib4State.tsVariable = e.target.value; renderPftTimeseries(); });
  document.getElementById("sib4-ts-toggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-series]"); if (!b) return; sib4State.tsSeries = b.dataset.series; document.querySelectorAll("#sib4-ts-toggle button").forEach((x) => x.classList.toggle("active", x === b)); renderPftTimeseries(); });
  document.getElementById("sib4-ts-view").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (!b) return; sib4State.tsView = b.dataset.view; document.querySelectorAll("#sib4-ts-view button").forEach((x) => x.classList.toggle("active", x === b)); renderPftTimeseries(); });
  document.getElementById("sib4-ts-aggregate").addEventListener("change", (e) => { sib4State.tsAggregate = e.target.checked; renderPftTimeseries(); });
  document.getElementById("sib4-limitation-toggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-series]"); if (!b) return; sib4State.limitationSeries = b.dataset.series; document.querySelectorAll("#sib4-limitation-toggle button").forEach((x) => x.classList.toggle("active", x === b)); renderLimitation(); });
  renderStressFactorButtons();
  document.getElementById("sib4-limitation-factors").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-factor]");
    if (!b) return;
    const k = b.dataset.factor;
    if (sib4State.stressFactors.has(k)) { if (sib4State.stressFactors.size > 1) sib4State.stressFactors.delete(k); }
    else sib4State.stressFactors.add(k);
    renderStressFactorButtons();
    renderLimitation();
  });
  document.getElementById("sib4-diurnal-variable").addEventListener("change", (e) => { sib4State.diurnalVariable = e.target.value; populateDiurnalPftSelect().then(renderDiurnal); });
  document.getElementById("sib4-diurnal-month").addEventListener("change", (e) => { sib4State.diurnalMonth = parseInt(e.target.value, 10); renderDiurnal(); });
  document.getElementById("sib4-diurnal-pft").addEventListener("change", (e) => { sib4State.diurnalPft = e.target.value; renderDiurnal(); });
  document.getElementById("sib4-compare-variable").addEventListener("change", (e) => { sib4State.compareVariable = e.target.value; renderCompare(); });

  await populateDiurnalPftSelect();
  renderAll();
}

init();
