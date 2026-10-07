// Overview page. No static images anywhere -- every figure here is
// computed live from the same JSON every other page uses. The pipeline's
// cross-product combined-overlay and monthly-anomaly-heatmap questions
// (formerly static PNGs) are answered by the *same* dynamic components
// already built elsewhere (explore.html's Compare variables, data.html's
// Heatmaps), not reimplemented a second time here -- one implementation, no
// risk of the two views drifting apart. This page only holds visualizations
// that don't already live elsewhere: the snow-drought quadrant
// classification, below. (The observational-coverage timeline used to live
// here too -- moved to about.html, since it's a dataset/reference fact, not
// a finding.)

// Snow-drought quadrant classification -- mirrors
// code/11_context_SnowDroughtQuadrants_analyze.py's VARIABLES/REGIMES/
// classify() exactly (do not diverge). The regime itself always comes from
// the pipeline's own precomputed classification (data/
// snow_drought_classification.json's "regime" field), never recomputed here.
// Labels are dataset-qualified, matching 11_context_SnowDroughtQuadrants_
// analyze.py's own VARIABLES dict verbatim (its "label" field, minus the
// "DJFM Anomaly (unit)" suffix -- unit/window are shown separately here).
// Expanded 2026-10-01 (Dylan: "we should be able to plot more temp/vpd/
// precip/snow variables") with 5 more ERA5-Land/PRISM drivers already in the
// same pipeline file, no new reducer needed.
const QUADRANT_VARIABLES = {
  t_anom: { label: "ERA5-Land Temperature", unit: "°C", stress_high: true, stress: "warm", benign: "cold" },
  ppt_anom: { label: "PRISM Precipitation", unit: "mm", stress_high: false, stress: "dry", benign: "wet" },
  swe_anom: { label: "SNOTEL Snowpack", unit: "mm", stress_high: false, stress: "low snow", benign: "high snow" },
  vpd_anom: { label: "PRISM Max VPD", unit: "hPa", stress_high: true, stress: "high VPD", benign: "low VPD" },
  vpdmin_anom: { label: "PRISM Min VPD", unit: "hPa", stress_high: true, stress: "high VPD", benign: "low VPD" },
  sca_terra_anom: { label: "MODIS-Terra Snow Cover", unit: "%", stress_high: false, stress: "low snow cover", benign: "high snow cover" },
  sca_aqua_anom: { label: "MODIS-Aqua Snow Cover", unit: "%", stress_high: false, stress: "low snow cover", benign: "high snow cover" },
  era5_vpd_anom: { label: "ERA5-Land VPD", unit: "hPa", stress_high: true, stress: "high VPD", benign: "low VPD" },
  era5_ppt_anom: { label: "ERA5-Land Precipitation", unit: "mm", stress_high: false, stress: "dry", benign: "wet" },
  era5_swe_anom: { label: "ERA5-Land SWE", unit: "mm", stress_high: false, stress: "low snow", benign: "high snow" },
  era5_sca_anom: { label: "ERA5-Land Snow Cover", unit: "%", stress_high: false, stress: "low snow cover", benign: "high snow cover" },
};
const REGIME_COLORS = { dry: "#dfc27d", warm_dry: "#d6604d", warm: "#f4a582", none: "#92c5de" };
const REGIME_LABELS = {
  dry: "Dry snow drought", warm_dry: "Warm & dry snow drought",
  warm: "Warm snow drought", none: "No snow drought",
};
// NCL precip_diff_12lev diverging ramp -- used when points are colored by a
// driver variable's anomaly (centered at 0), matching the rest of the site.
const PRECIP_DIFF = [
  [0, "#023858"], [0.0833, "#0570b0"], [0.1667, "#6eaac8"], [0.25, "#53bd9f"],
  [0.3333, "#99f0b2"], [0.4167, "#cdffcd"], [0.5, "#ffffff"], [0.5833, "#fff5ba"],
  [0.6667, "#f5e09e"], [0.75, "#f5cd84"], [0.8333, "#e1a564"], [0.9167, "#cd853f"], [1, "#b66a28"],
];

const quadrantState = { region: "ALL", x: "t_anom", y: "ppt_anom", color: "regime", rows: [] };

async function initQuadrantView() {
  const xSelect = document.getElementById("quadrant-x-select");
  if (!xSelect) return;
  const res = await fetch(assetUrl("data/snow_drought_classification.json"));
  if (!res.ok) {
    document.getElementById("snow-drought-classification").style.display = "none";
    return;
  }
  quadrantState.rows = await res.json();

  // This classification is computed over PILOT_REGIONS specifically (see
  // 11_context_SnowDroughtQuadrants_analyze.py), a narrower set than the
  // dashboard's general manifest.region_labels -- so the region options
  // here come from whichever regions actually appear in this file's own
  // data, not the full region list. manifest.region_labels only supplies
  // the display label for whatever region codes are actually present.
  const regionSelect = document.getElementById("quadrant-region-select");
  const regionCodes = [...new Set(quadrantState.rows.map((r) => r.region))];
  regionSelect.innerHTML = "";
  regionCodes.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = manifest.region_labels[code] || code;
    if (code === quadrantState.region) option.selected = true;
    regionSelect.appendChild(option);
  });

  const ySelect = document.getElementById("quadrant-y-select");
  Object.entries(QUADRANT_VARIABLES).forEach(([key, meta]) => {
    [xSelect, ySelect].forEach((select) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = meta.label;
      select.appendChild(option);
    });
  });
  xSelect.value = quadrantState.x;
  ySelect.value = quadrantState.y;

  const colorSelect = document.getElementById("quadrant-color-select");
  const colorOptions = [["year", "Winter year"],
    ...Object.entries(QUADRANT_VARIABLES).map(([key, meta]) => [key, meta.label]),
    ["regime", "Classification regime"]];
  colorOptions.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    colorSelect.appendChild(option);
  });
  colorSelect.value = quadrantState.color;

  xSelect.addEventListener("change", (e) => { quadrantState.x = e.target.value; renderQuadrantChart(); });
  ySelect.addEventListener("change", (e) => { quadrantState.y = e.target.value; renderQuadrantChart(); });
  colorSelect.addEventListener("change", (e) => { quadrantState.color = e.target.value; renderQuadrantChart(); });
  regionSelect.addEventListener("change", (e) => {
    quadrantState.region = e.target.value;
    renderQuadrantChart();
  });

  renderQuadrantChart();
}

function renderQuadrantChart() {
  const chart = document.getElementById("quadrant-chart");
  const { region, x, y, rows } = quadrantState;
  const xMeta = QUADRANT_VARIABLES[x];
  const yMeta = QUADRANT_VARIABLES[y];
  const points = rows.filter((r) => r.region === region && r[x] !== null && r[y] !== null);
  if (points.length === 0) {
    chart.innerHTML = '<p class="chart-empty">No data for this axis pair/region.</p>';
    return;
  }

  const xmax = Math.max(...points.map((p) => Math.abs(p[x]))) * 1.12;
  const ymax = Math.max(...points.map((p) => Math.abs(p[y]))) * 1.12;
  const shapes = [];
  const annotations = [];
  // Stress-quadrant shading, identical for every axis pair including the
  // Dierauer temperature-vs-precip default: tint each quadrant by how many of
  // the two axes point toward drought stress, and label the fully-stressed and
  // fully-benign corners by AXIS POSITION (e.g. "dry + warm", "wet + cold").
  // The actual snow-drought regime is SWE-gated (SWE is on neither axis), so
  // it is shown per point via color-by-regime + hover -- never implied by the
  // quadrant, which would mislabel the ~25% of winters whose regime differs
  // from their temperature/precipitation position.
  const sx = xMeta.stress_high ? 1 : -1;
  const sy = yMeta.stress_high ? 1 : -1;
  const tint = { 2: "#b66a28", 1: "#f5e09e", 0: "#0570b0" };
  [1, -1].forEach((xs) => {
    const [x0, x1] = xs > 0 ? [0, xmax] : [-xmax, 0];
    [1, -1].forEach((ys) => {
      const [y0, y1] = ys > 0 ? [0, ymax] : [-ymax, 0];
      const n = (xs === sx ? 1 : 0) + (ys === sy ? 1 : 0);
      shapes.push({ type: "rect", x0, x1, y0, y1, fillcolor: tint[n], opacity: 0.13, line: { width: 0 }, layer: "below" });
    });
  });
  const sxp = sx > 0 ? xmax : -xmax;
  const syp = sy > 0 ? ymax : -ymax;
  annotations.push({
    x: sxp * 0.96, y: syp * 0.96, text: `${yMeta.stress} + ${xMeta.stress}`, showarrow: false,
    font: { size: 12, color: "#955910", weight: 700 },
    xanchor: sx > 0 ? "right" : "left", yanchor: sy > 0 ? "top" : "bottom",
  });
  annotations.push({
    x: -sxp * 0.96, y: -syp * 0.96, text: `${yMeta.benign} + ${xMeta.benign}`, showarrow: false,
    font: { size: 12, color: "#0570b0", weight: 700 },
    xanchor: sx > 0 ? "left" : "right", yanchor: sy > 0 ? "bottom" : "top",
  });

  // Year labels on every point with a short leader line, matching the static
  // classification figures (Dylan, #3); 2026 is bold and larger. On a phone the
  // 36 labels collide into an unreadable mass, so there show only 2026.
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 600;
  const sizes = points.map((p) => (p.winter_year === 2026 ? 16 : 9));
  points.forEach((p) => {
    if (isNarrow && p.winter_year !== 2026) return;
    annotations.push({
      x: p[x], y: p[y], text: String(p.winter_year),
      showarrow: true, arrowhead: 0, arrowwidth: 0.7, arrowcolor: "#bbb", ax: 10, ay: -11,
      font: {
        size: p.winter_year === 2026 ? 14 : 12,
        color: p.winter_year === 2026 ? "#111" : "#555",
        weight: p.winter_year === 2026 ? 700 : 400,
      },
    });
  });

  // Color encoding (3rd axis): by regime (default; categorical, so one trace
  // per regime to get a real legend -- a discrete field has no colorbar), by
  // winter year (sequential), or by any driver variable's anomaly (diverging,
  // centered at 0).
  const colorBy = quadrantState.color;
  let traces;
  if (colorBy === "regime") {
    traces = Object.keys(REGIME_COLORS)
      .filter((regime) => points.some((p) => p.regime === regime))
      .map((regime) => {
        const pr = points.filter((p) => p.regime === regime);
        return {
          x: pr.map((p) => p[x]), y: pr.map((p) => p[y]),
          mode: "markers", type: "scatter", name: REGIME_LABELS[regime],
          marker: {
            size: pr.map((p) => (p.winter_year === 2026 ? 16 : 9)),
            color: REGIME_COLORS[regime], line: { color: "#333", width: 0.8 },
          },
          hovertext: pr.map((p) => `${p.winter_year}: ${REGIME_LABELS[p.regime]}`),
          hoverinfo: "text",
        };
      });
  } else {
    let marker;
    if (colorBy === "year") {
      marker = {
        size: sizes, color: points.map((p) => p.winter_year), colorscale: "Viridis",
        colorbar: { title: { text: "Winter year", side: "right" }, thickness: 14 },
        line: { color: "#333", width: 0.8 },
      };
    } else {
      const cMeta = QUADRANT_VARIABLES[colorBy];
      // Flip the diverging ramp for benign-direction variables (stress_high
      // false, e.g. precipitation / SWE / snow cover) so the stressed end
      // always reads brown and the benign end blue, matching the site-wide
      // palette; cmid:0 keeps white anchored at zero anomaly either way.
      marker = {
        size: sizes, color: points.map((p) => p[colorBy]), colorscale: PRECIP_DIFF, cmid: 0,
        reversescale: !cMeta.stress_high,
        colorbar: { title: { text: `${cMeta.label} (${cMeta.unit})`, side: "right" }, thickness: 14 },
        line: { color: "#333", width: 0.8 },
      };
    }
    traces = [{
      x: points.map((p) => p[x]), y: points.map((p) => p[y]),
      mode: "markers", type: "scatter", marker,
      hovertext: points.map((p) => `${p.winter_year}: ${REGIME_LABELS[p.regime]}`),
      hoverinfo: "text",
    }];
  }

  const layout = {
    margin: { t: colorBy === "regime" ? 46 : 20, r: isNarrow ? 58 : 80, b: 55, l: isNarrow ? 48 : 65 },
    xaxis: { ...PLOTLY_AXIS_LINE, title: `${xMeta.label} anomaly (${xMeta.unit})`, range: [-xmax, xmax], zeroline: true, zerolinecolor: "#555" },
    yaxis: { ...PLOTLY_AXIS_LINE, title: `${yMeta.label} anomaly (${yMeta.unit})`, range: [-ymax, ymax], zeroline: true, zerolinecolor: "#555" },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
    shapes, annotations,
    showlegend: colorBy === "regime",
    legend: { orientation: "h", y: 1, yanchor: "bottom", x: 0.5, xanchor: "center", font: { size: 12 } },
  };
  Plotly.newPlot(chart, traces, layout, { responsive: true, displaylogo: false });
}

loadManifest().then(() => {
  initQuadrantView();
});
