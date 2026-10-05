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
  a: { category: null, product: null, response: null },
  b: { category: null, product: null, response: null },
};

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

  renderCompare();
}

function slotSeries(slot, data) {
  const region = data.regions[compareState.region];
  if (!region) return null;
  const startYear = Math.max(DASHBOARD_MIN_YEAR, compareState.startYear || DASHBOARD_MIN_YEAR);
  const keep = (d) => parseInt(d.slice(0, 4), 10) >= startYear;
  return {
    dates: region.dates.filter(keep),
    values: region.value.filter((_, i) => keep(region.dates[i])),
    color: manifest.category_colors[compareState[slot].category],
    name: `${compareState[slot].product} · ${data.response}`,
    units: data.units,
  };
}

// Two panels stacked top (A) over bottom (B), both referencing the single
// shared x-axis so their time axes stay aligned; each keeps its own y-axis in
// its own units. Panel titles sit above each panel (A in the top margin, B in
// the gap between panels) so the units-only y-axis label stays short.
async function renderCompare() {
  const chart = document.getElementById("compare-chart");
  const [aData, bData] = await Promise.all([
    fetchTimeseriesJson(`${compareState.a.product}_${compareState.a.response}`),
    fetchTimeseriesJson(`${compareState.b.product}_${compareState.b.response}`),
  ]);
  const a = slotSeries("a", aData);
  const b = slotSeries("b", bData);

  const traces = [];
  const annotations = [];
  const regionLabel = regionLabelFor(compareState.region);

  if (a) {
    traces.push({
      x: a.dates, y: a.values, type: "scatter", mode: "lines",
      line: { color: a.color, width: 2 }, xaxis: "x", yaxis: "y",
      hovertemplate: "%{x|%Y-%m}: %{y:.2f}<extra></extra>",
    });
    annotations.push(panelTitle(a.name, a.color, 1.0));
  } else {
    annotations.push(emptyPanel(`No ${regionLabel} data`, 0.78));
  }
  if (b) {
    traces.push({
      x: b.dates, y: b.values, type: "scatter", mode: "lines",
      line: { color: b.color, width: 2 }, xaxis: "x", yaxis: "y2",
      hovertemplate: "%{x|%Y-%m}: %{y:.2f}<extra></extra>",
    });
    annotations.push(panelTitle(b.name, b.color, 0.42));
  } else {
    annotations.push(emptyPanel(`No ${regionLabel} data`, 0.22));
  }

  const layout = {
    margin: { t: 34, r: 20, b: 45, l: 70 },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
    showlegend: false,
    annotations,
    xaxis: { title: "Year", showgrid: false, anchor: "y2", ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    yaxis: { title: a ? a.units : "", domain: [0.58, 1.0], anchor: "x", ...PLOTLY_AXIS_LINE },
    yaxis2: { title: b ? b.units : "", domain: [0.0, 0.42], anchor: "x", ...PLOTLY_AXIS_LINE },
  };
  Plotly.newPlot(chart, traces, layout, { responsive: true, displaylogo: false });
}

function panelTitle(text, color, yTop) {
  return {
    text, xref: "paper", yref: "paper", x: 0, y: yTop, xanchor: "left", yanchor: "bottom",
    showarrow: false, font: { size: 14, color }, align: "left",
  };
}

function emptyPanel(text, yMid) {
  return {
    text, xref: "paper", yref: "paper", x: 0.5, y: yMid, xanchor: "center", yanchor: "middle",
    showarrow: false, font: { size: 14, color: "#888" },
  };
}

loadManifest().then(initCompareView);
