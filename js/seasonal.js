// Seasonal Cycle page: one product's water-year cycle (climatology + a few
// highlight years + any user-added ones). Picker (category/product/
// response/region) is shared with Time Series (js/product-picker.js).

let seasonalSeries = "raw";
let extraYears = []; // user-added years, beyond manifest.seasonal_highlight_years

// Distinct from manifest.seasonal_highlight_year_colors (an orange/red
// family) and from the teal climatology-mean line, so user-added years
// never blend into either.
const EXTRA_YEAR_COLORS = ["#3182bd", "#756bb1", "#31a354", "#e7298a", "#636363", "#1b9e77"];

// "2025-2026" not "Water year 2026" -- matches the format the pre-defined
// highlight years already use (manifest.seasonal_highlight_years' own
// curve.label), so a user-added year reads the same way, not a different
// naming convention for what's otherwise an identical kind of series.
function waterYearLabel(year) {
  return `${year - 1}-${year}`;
}

// Water-year-ordered {raw, anomaly} for an arbitrary year, built client-side
// from the already-complete monthly timeseries data (region.dates/.value/
// .anomaly cover the full record) -- the same shape manifest.seasonal_
// highlight_years' precomputed curves already use, so it overlays exactly
// like one of the default highlight years. null where a whole year's data
// isn't available (e.g. year not fully in the record) rather than plotting
// a broken partial curve.
function computeWaterYearCurve(region, year) {
  const months = [
    [10, year - 1], [11, year - 1], [12, year - 1],
    [1, year], [2, year], [3, year], [4, year], [5, year],
    [6, year], [7, year], [8, year], [9, year],
  ];
  const raw = [];
  const anomaly = [];
  for (const [month, y] of months) {
    const dateStr = `${y}-${String(month).padStart(2, "0")}-01`;
    const idx = region.dates.indexOf(dateStr);
    raw.push(idx === -1 ? null : region.value[idx]);
    anomaly.push(idx === -1 ? null : region.anomaly[idx]);
  }
  return raw.every((v) => v === null) ? null : { raw, anomaly };
}

function populateAddYearControl(entry) {
  const recordStartYear = entry.record_start
    ? Math.max(DASHBOARD_MIN_YEAR, parseInt(entry.record_start.slice(0, 4), 10))
    : null;
  const recordEndYear = entry.record_end ? parseInt(entry.record_end.slice(0, 4), 10) : null;

  const select = document.getElementById("seasonal-add-year-select");
  select.innerHTML = "";
  // A water year runs Oct(Y-1)-Sep(Y), so the earliest addable one needs a
  // full prior October already in the record -- starts one year after the
  // record's own first calendar year, not at it.
  if (recordStartYear !== null && recordEndYear !== null) {
    for (let y = recordStartYear + 1; y <= recordEndYear; y++) {
      const option = document.createElement("option");
      option.value = String(y);
      option.textContent = waterYearLabel(y);
      select.appendChild(option);
    }
  }
}

async function renderSeasonal() {
  const chart = document.getElementById("seasonal-chart");
  const data = await fetchSeasonalJson(`${pickerState.product}_${pickerState.response}`);
  const region = data.regions[pickerState.region];
  if (!region) {
    chart.innerHTML = '<p class="chart-empty">No data for this region.</p>';
    return;
  }
  const x = manifest.water_year_month_names;
  // Two-row tick labels (month above, calendar year below) using the most
  // recent highlight year as the reference water year -- Oct/Nov/Dec are
  // that water year's own prior calendar year, Jan-Sep are its own. Every
  // overlaid curve is still its OWN real water year underneath (the x
  // values themselves stay plain month names); this only makes the
  // shared axis concretely dated instead of a bare, ambiguous "Oct...Sep".
  const referenceYear = Math.max(...manifest.seasonal_highlight_years);
  const tickText = x.map((month, i) => `${month}<br>${i < 3 ? referenceYear - 1 : referenceYear}`);
  const isAnomaly = seasonalSeries === "anomaly";
  const teal = manifest.climatology_color;
  const upper = isAnomaly ? region.anomaly_upper : region.climatology_upper;
  const lower = isAnomaly ? region.anomaly_lower : region.climatology_lower;
  const mean = isAnomaly ? upper.map(() => 0) : region.climatology_mean;

  const traces = [
    { x, y: lower, type: "scatter", mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
    {
      x, y: upper, type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty",
      fillcolor: hexToRgba(teal, 0.25), name: "Climatology ± 2σ", hoverinfo: "skip",
    },
    {
      x, y: mean, type: "scatter", mode: "lines+markers", line: { color: teal, width: 3 },
      marker: { color: teal, size: 6 }, name: "Climatological mean",
    },
  ];
  manifest.seasonal_highlight_years.forEach((year) => {
    const curve = region.highlight_years[String(year)];
    if (!curve) return;
    traces.push({
      x, y: isAnomaly ? curve.anomaly : curve.raw, type: "scatter", mode: "lines",
      line: { color: manifest.seasonal_highlight_year_colors[String(year)], width: 2 },
      name: curve.label,
    });
  });
  if (extraYears.length > 0) {
    // The precomputed highlight_years curves only cover manifest.seasonal_
    // highlight_years -- any other year is built client-side from the
    // already-complete monthly timeseries data instead of needing a new
    // pipeline export.
    const tsData = await fetchTimeseriesJson(`${pickerState.product}_${pickerState.response}`);
    const tsRegion = tsData.regions[pickerState.region];
    extraYears.forEach((year, i) => {
      const curve = tsRegion && computeWaterYearCurve(tsRegion, year);
      if (!curve) return;
      traces.push({
        x, y: isAnomaly ? curve.anomaly : curve.raw, type: "scatter", mode: "lines",
        line: { color: EXTRA_YEAR_COLORS[i % EXTRA_YEAR_COLORS.length], width: 2, dash: "dot" },
        name: waterYearLabel(year),
      });
    });
  }
  const layout = {
    margin: { t: 20, r: 20, b: 55, l: 60 },
    yaxis: { title: isAnomaly ? `${data.response} anomaly (${data.units})` : `${data.response} (${data.units})`, zeroline: isAnomaly },
    xaxis: { type: "category", tickvals: x, ticktext: tickText },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
  };
  Plotly.newPlot(chart, traces, layout, { responsive: true, displaylogo: false });
  renderExtraYearChips();
}

function renderExtraYearChips() {
  const row = document.getElementById("seasonal-extra-years");
  row.innerHTML = "";
  extraYears.forEach((year, i) => {
    const chip = document.createElement("span");
    chip.className = "year-chip";
    chip.style.background = EXTRA_YEAR_COLORS[i % EXTRA_YEAR_COLORS.length];
    chip.innerHTML = `${waterYearLabel(year)} <button type="button" aria-label="Remove ${year}">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      extraYears = extraYears.filter((y) => y !== year);
      renderSeasonal();
    });
    row.appendChild(chip);
  });
}

function onSeasonalSelectionChanged(entry) {
  // A new product/response has its own record span -- last product's added
  // years may not even exist in this one, so reset rather than carry over.
  extraYears = [];
  populateAddYearControl(entry);
  renderSeasonal();
}

function wireSeasonalControls() {
  document.getElementById("seasonal-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-series]");
    if (!button) return;
    seasonalSeries = button.dataset.series;
    document.querySelectorAll("#seasonal-toggle button").forEach((btn) => btn.classList.toggle("active", btn === button));
    renderSeasonal();
  });
  document.getElementById("seasonal-add-year-btn").addEventListener("click", () => {
    const year = parseInt(document.getElementById("seasonal-add-year-select").value, 10);
    if (!year || extraYears.includes(year) || manifest.seasonal_highlight_years.includes(year)) return;
    extraYears.push(year);
    renderSeasonal();
  });
}

async function init() {
  await loadManifest();
  wireSeasonalControls();
  initProductPicker(onSeasonalSelectionChanged);
}

init();
