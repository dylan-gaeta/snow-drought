// Compare page: any two variables, side by side, each on its own panel in its
// own physical units, sharing one time axis. Pick a variable for panel A (top)
// and one for panel B (bottom); each is a raw-value monthly series read
// straight from the JSON exported by code/dashboard_export.py -- no
// standardization and no cross-variable statistic, so each keeps its real
// units. Deliberately limited to exactly two variables: the earlier
// category-checklist + add-series version grew cluttered (Dylan, 2026-10).

const compareState = {
  region: "ALL",
  startYear: null,
  series: "value", // "value" (raw, dual y-axis) | "sigma" (shared standardized axis)
  a: { category: null, product: null, response: null },
  b: { category: null, product: null, response: null },
};

// Two fixed, clearly-distinct line colors -- the series are overlaid on one
// plot now, so they can't be colored by category (two same-category variables
// would collide). Left axis + line A read blue, right axis + line B read orange.
const COMPARE_A_COLOR = "#1b6ca8";
const COMPARE_B_COLOR = "#e8702a";

// Opens on the modern era rather than the full 1990-2026 record, matching
// js/explore.js -- the whole record crams ~430 monthly points into a smear.
const COMPARE_DEFAULT_START_YEAR = 2000;

function nonEmptyCategories() {
  return manifest.category_order.filter((cat) => Object.keys(manifest.categories[cat]).length > 0);
}

function populateCategorySelect(slot) {
  const select = document.getElementById(`compare-${slot}-category`);
  select.innerHTML = "";
  nonEmptyCategories().forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = categoryLabelWithIcon(cat);
    select.appendChild(option);
  });
  compareState[slot].category = select.value;
  populateProductSelect(slot);
}

function populateProductSelect(slot) {
  const select = document.getElementById(`compare-${slot}-product`);
  select.innerHTML = "";
  Object.keys(manifest.categories[compareState[slot].category]).forEach((product) => {
    const option = document.createElement("option");
    option.value = product;
    option.textContent = product;
    select.appendChild(option);
  });
  compareState[slot].product = select.value;
  populateResponseSelect(slot);
}

function populateResponseSelect(slot) {
  const select = document.getElementById(`compare-${slot}-response`);
  select.innerHTML = "";
  const { category, product } = compareState[slot];
  Object.keys(manifest.categories[category][product]).forEach((response) => {
    const option = document.createElement("option");
    option.value = response;
    option.textContent = response;
    select.appendChild(option);
  });
  compareState[slot].response = select.value;
}

function setSlotCategory(slot, category) {
  document.getElementById(`compare-${slot}-category`).value = category;
  compareState[slot].category = category;
  populateProductSelect(slot);
}

function setupSlot(slot) {
  populateCategorySelect(slot);
  document.getElementById(`compare-${slot}-category`).addEventListener("change", (event) => {
    compareState[slot].category = event.target.value;
    populateProductSelect(slot);
    renderCompare();
  });
  document.getElementById(`compare-${slot}-product`).addEventListener("change", (event) => {
    compareState[slot].product = event.target.value;
    populateResponseSelect(slot);
    renderCompare();
  });
  document.getElementById(`compare-${slot}-response`).addEventListener("change", (event) => {
    compareState[slot].response = event.target.value;
    renderCompare();
  });
}

function populateStartYearSelect() {
  const { minYear, maxYear } = fullRecordYearRange();
  const select = document.getElementById("compare-start-year-select");
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = `All years (from ${minYear})`;
  select.appendChild(allOption);
  for (let y = minYear; y <= maxYear; y++) {
    const option = document.createElement("option");
    option.value = String(y);
    option.textContent = String(y);
    select.appendChild(option);
  }
  compareState.startYear = Math.max(minYear, COMPARE_DEFAULT_START_YEAR);
  select.value = String(compareState.startYear);
}

function initCompareView() {
  const chart = document.getElementById("compare-chart");
  if (!chart) return;

  populateRegionSelect(document.getElementById("compare-region-select"), compareState.region);
  populateStartYearSelect();
  setupSlot("a");
  setupSlot("b");

  // Default B to a different category than A so the page opens on an actual
  // cross-variable comparison, not two snow products.
  const cats = nonEmptyCategories();
  if (cats.length > 1) setSlotCategory("b", cats[1]);

  document.getElementById("compare-region-select").addEventListener("change", (event) => {
    compareState.region = event.target.value;
    renderCompare();
  });
  document.getElementById("compare-start-year-select").addEventListener("change", (event) => {
    compareState.startYear = event.target.value ? parseInt(event.target.value, 10) : null;
    renderCompare();
  });
  document.getElementById("compare-series-toggle").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-series]");
    if (!btn) return;
    compareState.series = btn.dataset.series;
    document.querySelectorAll("#compare-series-toggle button").forEach((x) => x.classList.toggle("active", x === btn));
    renderCompare();
  });

  renderCompare();
}

function slotSeries(slot, data) {
  const region = data.regions[compareState.region];
  if (!region) return null;
  const startYear = Math.max(DASHBOARD_MIN_YEAR, compareState.startYear || DASHBOARD_MIN_YEAR);
  const keep = region.dates.map((d) => parseInt(d.slice(0, 4), 10) >= startYear);
  const raw = compareState.series === "sigma" ? region.sigma : region.value;
  return {
    dates: region.dates.filter((_, i) => keep[i]),
    values: raw.filter((_, i) => keep[i]).map((v) => (v === null || v === undefined ? null : v)),
    name: `${compareState[slot].product} · ${data.response}`,
    units: data.units,
  };
}

// Both variables share one time axis. In raw mode each keeps its own units on
// its own y-axis (A left/blue, B right/orange); in sigma mode both are
// standardized and share a single axis, so the lines sit on a common scale.
async function renderCompare() {
  const chart = document.getElementById("compare-chart");
  const [aData, bData] = await Promise.all([
    fetchTimeseriesJson(`${compareState.a.product}_${compareState.a.response}`),
    fetchTimeseriesJson(`${compareState.b.product}_${compareState.b.response}`),
  ]);
  const a = slotSeries("a", aData);
  const b = slotSeries("b", bData);
  const isSigma = compareState.series === "sigma";

  if (!a && !b) {
    chart.innerHTML = `<p class="chart-empty">No data for ${regionLabelFor(compareState.region)}.</p>`;
    return;
  }

  const traces = [];
  if (a) traces.push({
    x: a.dates, y: a.values, type: "scatter", mode: "lines", connectgaps: false,
    name: a.name, line: { color: COMPARE_A_COLOR, width: 2.5 }, yaxis: "y",
    hovertemplate: `%{x|%Y-%m}: %{y:.2f}<extra>${a.name}</extra>`,
  });
  if (b) traces.push({
    x: b.dates, y: b.values, type: "scatter", mode: "lines", connectgaps: false,
    name: b.name, line: { color: COMPARE_B_COLOR, width: 2.5 }, yaxis: isSigma ? "y" : "y2",
    hovertemplate: `%{x|%Y-%m}: %{y:.2f}<extra>${b.name}</extra>`,
  });

  const layout = {
    margin: { t: 10, r: isSigma ? 20 : 66, b: 45, l: 66 },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
    legend: { orientation: "h", y: 1.1, x: 0, yanchor: "bottom", font: { size: 13 } },
    hovermode: "x unified",
    xaxis: { title: "Year", showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    shapes: isSigma ? [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 0, line: { color: "#888", width: 1 } }] : [],
  };
  if (isSigma) {
    layout.yaxis = { title: "Standardized anomaly (σ)", zeroline: true, ...PLOTLY_AXIS_LINE };
  } else {
    layout.yaxis = { title: { text: a ? a.units : "", font: { color: COMPARE_A_COLOR } }, color: COMPARE_A_COLOR, ...PLOTLY_AXIS_LINE };
    layout.yaxis2 = { title: { text: b ? b.units : "", font: { color: COMPARE_B_COLOR } }, color: COMPARE_B_COLOR, overlaying: "y", side: "right", showgrid: false, ...PLOTLY_AXIS_LINE };
  }
  Plotly.newPlot(chart, traces, layout, { responsive: true, displaylogo: false });
}

loadManifest().then(initCompareView);
