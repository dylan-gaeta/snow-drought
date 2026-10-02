// Compare page: standardized anomalies (sigma removes each variable's own
// physical units) overlaid across every product in a category, on one
// shared axis -- no new statistic, no interpretation of what the
// co-movement means.
//
// Reproduces code/11_combined_GroupOverlays_analyze.py's canonical
// multi-product overlay dynamically instead of as a static PNG: every
// product/response the manifest already groups under one category
// (manifest.categories[category], the same figure_category() grouping the
// Python script's COMBINED_GROUPS is built from), styled with a
// distinct solid color per variable, sign-flipped
// by drier_is_high so a positive value always reads as the stress direction
// (the same convention js/summary.js, js/heatmaps.js, and js/map-viewer.js
// already use), and -- for vegetation -- limited to each product's own
// growing-season months via COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION
// so a near-zero dormant-season baseline spread doesn't explode the
// standardized value. Both constants mirror 00_config.py exactly (see
// js/common.js).

const compareState = {
  region: "ALL",
  category: null,
  // { [category]: Set of "product|response" keys currently checked }. Set
  // once per category the first time it's shown (defaulting to the first
  // CATEGORY_OVERLAY_DEFAULT_VISIBLE) and then persists across region
  // changes -- previously every re-render (including a plain region change)
  // rebuilt the legend from the hardcoded default, silently discarding
  // whatever the user had checked/unchecked (Dylan, 2026-09).
  checkedByCategory: {},
  // User-added { category, product, response } triplets from ANY category,
  // overlaid on top of whatever the currently-browsed category shows below.
  // Persists across category/region switches -- unlike checkedByCategory,
  // there's only one list, not one per category (Dylan, 2026-09: "you can't
  // compare different products from different variable classes").
  customSeries: [],
};
// NCL StepSeq25 (via the cmaps package), reordered hue-first-then-shade so
// the first 5 entries alone span 5 distinct hues -- the biggest category
// (vegetation) has 27 product/response pairs, so a 12-color palette put
// items 12 apart in identical colors with nothing else to distinguish them
// (Dylan, 2026-09). 25 colors leaves only one collision in the worst case,
// and none in the common case of a handful of checked series.
const CATEGORY_OVERLAY_COLORS = [
  "#990f0f", "#99540f", "#6b990f", "#0f6b99", "#260f99",
  "#b22c2c", "#b26f2c", "#85b22c", "#2c85b2", "#422cb2",
  "#cc5151", "#cc8e51", "#a3cc51", "#51a3cc", "#6551cc",
  "#e57e7e", "#e5b17e", "#c3e57e", "#7ec3e5", "#8f7ee5",
  "#ffb2b2", "#ffd8b2", "#e5ffb2", "#b2e5ff", "#bfb2ff",
];

// null = default recent window, see populateStartYearSelect. Same rationale
// as js/explore.js's timeseriesStartYear: the full 1990-2026 record crammed
// into one chart is a solid smear, worse here than on Explore since Compare
// overlays several lines at once, not one.
let compareStartYear = null;
const DEFAULT_RECENT_YEARS = 15;

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
  compareStartYear = Math.max(minYear, maxYear - DEFAULT_RECENT_YEARS + 1);
  select.value = String(compareStartYear);
}

function filterFromStartYear(dates, values) {
  const startYear = Math.max(DASHBOARD_MIN_YEAR, compareStartYear || DASHBOARD_MIN_YEAR);
  return {
    dates: dates.filter((d) => parseInt(d.slice(0, 4), 10) >= startYear),
    values: values.filter((_, i) => parseInt(dates[i].slice(0, 4), 10) >= startYear),
  };
}

function initCompareView() {
  const chart = document.getElementById("compare-chart");
  if (!chart) return;

  populateRegionSelect(document.getElementById("compare-region-select"), compareState.region);

  const categorySelect = document.getElementById("compare-category-select");
  manifest.category_order.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = categoryLabelWithIcon(cat);
    categorySelect.appendChild(option);
  });
  compareState.category = manifest.category_order[0];
  categorySelect.addEventListener("change", (event) => {
    compareState.category = event.target.value;
    renderCategoryOverlay();
  });

  document.getElementById("compare-region-select").addEventListener("change", (event) => {
    compareState.region = event.target.value;
    renderCategoryOverlay();
  });

  populateStartYearSelect();
  document.getElementById("compare-start-year-select").addEventListener("change", (event) => {
    compareStartYear = event.target.value ? parseInt(event.target.value, 10) : null;
    renderCategoryOverlay();
  });

  wireAddSeriesControls();
  renderCategoryOverlay();
}

// Category/product/response cascade for adding an arbitrary extra series
// from ANY category -- separate from the main category-select above, which
// only browses one category's own checklist at a time.
function populateAddCategorySelect() {
  const select = document.getElementById("compare-add-category");
  select.innerHTML = "";
  manifest.category_order
    .filter((cat) => Object.keys(manifest.categories[cat]).length > 0)
    .forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = categoryLabelWithIcon(cat);
      select.appendChild(option);
    });
  populateAddProductSelect();
}

function populateAddProductSelect() {
  const select = document.getElementById("compare-add-product");
  select.innerHTML = "";
  const category = document.getElementById("compare-add-category").value;
  Object.keys(manifest.categories[category]).forEach((product) => {
    const option = document.createElement("option");
    option.value = product;
    option.textContent = product;
    select.appendChild(option);
  });
  populateAddResponseSelect();
}

function populateAddResponseSelect() {
  const select = document.getElementById("compare-add-response");
  select.innerHTML = "";
  const category = document.getElementById("compare-add-category").value;
  const product = document.getElementById("compare-add-product").value;
  Object.keys(manifest.categories[category][product]).forEach((response) => {
    const option = document.createElement("option");
    option.value = response;
    option.textContent = response;
    select.appendChild(option);
  });
}

function wireAddSeriesControls() {
  populateAddCategorySelect();
  document.getElementById("compare-add-category").addEventListener("change", populateAddProductSelect);
  document.getElementById("compare-add-product").addEventListener("change", populateAddResponseSelect);
  document.getElementById("compare-add-button").addEventListener("click", () => {
    const category = document.getElementById("compare-add-category").value;
    const product = document.getElementById("compare-add-product").value;
    const response = document.getElementById("compare-add-response").value;
    const alreadyAdded = compareState.customSeries.some(
      (s) => s.category === category && s.product === product && s.response === response
    );
    if (alreadyAdded) return;
    compareState.customSeries.push({ category, product, response });
    renderCategoryOverlay();
  });
}

function plotlyLayout() {
  return {
    margin: { t: 20, r: 20, b: 45, l: 60 },
    yaxis: { title: "Standardized anomaly (σ)", zeroline: true, ...PLOTLY_AXIS_LINE },
    xaxis: { title: "Year", showgrid: false, ...PLOTLY_AXIS_LINE, ...PLOTLY_YEARLY_MINOR_TICKS },
    font: { family: "Source Sans Pro, sans-serif", size: 13 },
    shapes: [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 0, line: { color: "#888", width: 1 } }],
  };
}

// How many series start checked/visible the first time a category is shown
// -- the rest are opt-in via the checkbox legend (renderCategoryLegend
// below). Only applies on first view; compareState.checkedByCategory
// remembers whatever the user changes it to after that.
const CATEGORY_OVERLAY_DEFAULT_VISIBLE = 2;

async function renderCategoryOverlay() {
  const chart = document.getElementById("compare-chart");
  const note = document.getElementById("compare-category-note");
  const category = compareState.category;
  const products = manifest.categories[category] || {};
  const pairs = [];
  for (const [product, responses] of Object.entries(products)) {
    for (const response of Object.keys(responses)) pairs.push({ product, response });
  }
  if (pairs.length === 0) {
    chart.innerHTML = '<p class="chart-empty">No products in this category.</p>';
    document.getElementById("compare-category-legend").innerHTML = "";
    return;
  }
  note.textContent = "Each color is one variable. Check a variable below to add it to the chart.";

  // First time this category is shown, default to the first N visible;
  // after that, keep whatever the user has checked/unchecked -- switching
  // region re-renders the same category and must not silently discard it.
  const checkedKey = compareState.checkedByCategory[category] || new Set(
    pairs.slice(0, CATEGORY_OVERLAY_DEFAULT_VISIBLE).map((p) => `${p.product}|${p.response}`)
  );
  compareState.checkedByCategory[category] = checkedKey;

  // Fetch every product's JSON concurrently instead of one at a time (plus
  // each one's seasonal JSON too, for the vegetation category's growing-
  // season mask) -- some categories have 15-27 products, and awaiting each
  // fetch in turn meant a full re-render waited on that many sequential
  // network round-trips (fetchTimeseriesJson/fetchSeasonalJson's shared
  // per-page caches, js/common.js, apply per key either way).
  const seriesList = await Promise.all(
    pairs.map(({ product, response }) => fetchTimeseriesJson(`${product}_${response}`))
  );
  const seasonalList = category === "vegetation"
    ? await Promise.all(pairs.map(({ product, response }) => fetchSeasonalJson(`${product}_${response}`)))
    : null;

  // Extra series added from any category (compareState.customSeries), minus
  // whatever duplicates a pair the browsed category is already plotting
  // below -- adding e.g. "PRISM Precipitation" while browsing precipitation
  // itself would otherwise double-plot the same line.
  const extraEntries = compareState.customSeries.filter(
    (s) => !(s.category === category && pairs.some((p) => p.product === s.product && p.response === s.response))
  );
  const extraSeriesList = await Promise.all(
    extraEntries.map((e) => fetchTimeseriesJson(`${e.product}_${e.response}`))
  );
  const extraSeasonalList = await Promise.all(
    extraEntries.map((e) => (e.category === "vegetation" ? fetchSeasonalJson(`${e.product}_${e.response}`) : null))
  );

  function standardizedSeries(product, response, region, seasonalRegion, entryCategory, drierIsHigh) {
    let sigma = region.sigma;
    if (entryCategory === "vegetation" && seasonalRegion) {
      const mean = seasonalRegion.climatology_mean;
      const trough = Math.min(...mean);
      const amplitude = Math.max(...mean) - trough;
      const keepMonth = mean.map((v) => (v - trough) > COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION * amplitude);
      sigma = region.dates.map((d, i) => {
        // mean/keepMonth are water-year ordered (index 0 = Oct ... index 11
        // = Sep, see manifest.water_year_month_names), but `d` is a real
        // calendar date -- converting to a water-year index before indexing
        // keepMonth is required, not optional. Indexing with the calendar
        // month directly was a 3-month-offset bug: it kept December (the
        // dormant trough month) and dropped March-May (the real growing-
        // season ramp), confirmed against MODIS-Terra_GPP.json's own
        // climatology (Dylan, 2026-09).
        const calendarMonth = parseInt(d.slice(5, 7), 10);
        const waterYearMonth = (calendarMonth - 10 + 12) % 12;
        return keepMonth[waterYearMonth] ? sigma[i] : null;
      });
    }
    // Flip to the same drier_is_high convention js/summary.js, js/heatmaps.js,
    // and js/map-viewer.js already use, so positive always means the stress
    // direction here too -- replaces the old hardcoded 5-response
    // COMBINED_INVERTED_VALENCE_RESPONSES negation (dead code once this
    // flip applies everywhere: every response in that list was exactly the
    // drier_is_high=True oddity within an otherwise drier_is_high=False/None
    // group, e.g. NEE within vegetation, TD2m within climate -- this flip
    // reproduces that same alignment for free, and also fixes drought-group
    // EDDI-03/06/12 and USDM, which needed the identical treatment but had
    // drifted out of this file's own copy of the Python constant).
    const sign = drierIsHigh ? 1 : -1;
    return sigma.map((v) => (v === null || v === undefined ? null : sign * v));
  }

  const traces = [];
  const legendItems = [];
  let colorIndex = 0;
  pairs.forEach(({ product, response }, pairIndex) => {
    const data = seriesList[pairIndex];
    const region = data.regions[compareState.region];
    if (!region) return;

    const pairKey = `${product}|${response}`;

    const seasonal = seasonalList ? seasonalList[pairIndex] : null;
    const seasonalRegion = seasonal && seasonal.regions[compareState.region];
    const sigma = standardizedSeries(product, response, region, seasonalRegion, category, data.drier_is_high);

    const color = CATEGORY_OVERLAY_COLORS[colorIndex % CATEGORY_OVERLAY_COLORS.length];
    const name = `${product} ${response}`;
    const visible = checkedKey.has(pairKey);
    const { dates, values } = filterFromStartYear(region.dates, sigma);
    traces.push({
      x: dates, y: values, type: "scatter", mode: "lines", connectgaps: false,
      line: { color, width: 2.5 },
      name, visible,
    });
    legendItems.push({ name, color, visible, pairKey });
    colorIndex++;
  });

  const extraChipColors = [];
  extraEntries.forEach((entry, i) => {
    const data = extraSeriesList[i];
    const region = data.regions[compareState.region];
    if (!region) { extraChipColors.push(null); return; }

    const seasonal = extraSeasonalList[i];
    const seasonalRegion = seasonal && seasonal.regions[compareState.region];
    const sigma = standardizedSeries(entry.product, entry.response, region, seasonalRegion, entry.category, data.drier_is_high);

    const color = CATEGORY_OVERLAY_COLORS[colorIndex % CATEGORY_OVERLAY_COLORS.length];
    const name = `${entry.product} ${entry.response}`;
    const { dates, values } = filterFromStartYear(region.dates, sigma);
    traces.push({
      x: dates, y: values, type: "scatter", mode: "lines", connectgaps: false,
      line: { color, width: 2.5 },
      name, visible: true,
    });
    extraChipColors.push(color);
    colorIndex++;
  });

  Plotly.newPlot(chart, traces, { ...plotlyLayout(), showlegend: false }, { responsive: true, displaylogo: false });
  renderCategoryLegend(legendItems);
  renderExtraSeriesChips(extraEntries, extraChipColors);
}

function renderExtraSeriesChips(extraEntries, extraChipColors) {
  const row = document.getElementById("compare-extra-series");
  row.innerHTML = "";
  extraEntries.forEach((entry, i) => {
    const color = extraChipColors[i];
    if (!color) return; // region had no data for this entry -- nothing plotted, nothing to show
    const chip = document.createElement("span");
    chip.className = "year-chip";
    chip.style.background = color;
    chip.innerHTML = `${entry.product} ${entry.response} <button type="button" aria-label="Remove ${entry.product} ${entry.response}">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      compareState.customSeries = compareState.customSeries.filter((s) => s !== entry);
      renderCategoryOverlay();
    });
    row.appendChild(chip);
  });
}

function renderCategoryLegend(items) {
  const container = document.getElementById("compare-category-legend");
  container.innerHTML = "";
  items.forEach((item, i) => {
    const label = document.createElement("label");
    label.className = "compare-legend-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.visible;
    checkbox.addEventListener("change", (event) => {
      const checkedKey = compareState.checkedByCategory[compareState.category];
      if (event.target.checked) checkedKey.add(item.pairKey);
      else checkedKey.delete(item.pairKey);
      const chart = document.getElementById("compare-chart");
      Plotly.restyle(chart, { visible: event.target.checked }, [i]);
      // restyle() alone doesn't recompute the axis range for the now-
      // different set of visible traces -- confirmed live: check/uncheck a
      // few series and the y-axis stayed pinned to whatever range the
      // ORIGINAL default-visible traces needed, not the current ones.
      Plotly.relayout(chart, { "yaxis.autorange": true });
    });
    const swatch = document.createElement("span");
    swatch.className = "compare-legend-swatch";
    swatch.style.background = item.color;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(item.name));
    container.appendChild(label);
  });
}

loadManifest().then(initCompareView);
