// Compare page: standardized anomalies (sigma removes each variable's own
// physical units) overlaid across every product in a category, on one
// shared axis -- no new statistic, no interpretation of what the
// co-movement means.
//
// Reproduces code/11_combined_GroupOverlays_analyze.py's canonical
// multi-product overlay dynamically instead of as a static PNG: every
// product/response the manifest already groups under one category
// (manifest.categories[category], the same figure_category() grouping the
// Python script's COMBINED_GROUPS is built from), styled solid
// (observation) / dashed (model) per PRODUCT_OBSERVATION_KIND, sign-negated
// per COMBINED_INVERTED_VALENCE_RESPONSES, and -- for vegetation -- limited
// to each product's own growing-season months via
// COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION so a near-zero dormant-
// season baseline spread doesn't explode the standardized value. All three
// constants mirror 00_config.py exactly (see js/common.js).

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

// DASHBOARD_MIN_YEAR is defined once in js/common.js (shared by every page).
function filterFrom1990(dates, values) {
  return {
    dates: dates.filter((d) => parseInt(d.slice(0, 4), 10) >= DASHBOARD_MIN_YEAR),
    values: values.filter((_, i) => parseInt(dates[i].slice(0, 4), 10) >= DASHBOARD_MIN_YEAR),
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

  renderCategoryOverlay();
}

function plotlyLayout() {
  return {
    margin: { t: 20, r: 20, b: 45, l: 60 },
    yaxis: { title: "Standardized anomaly (σ)", zeroline: true },
    xaxis: { title: "Year" },
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
  // Snow/precipitation/soil-moisture categories are never OLS-detrended
  // (a deliberate pipeline-wide policy, not a per-product coincidence), so
  // every single item in those categories carries the same "(no trend)"
  // suffix -- with 15-27 items that's pure repetition, not useful
  // per-line information. Only show it per-item when the category actually
  // mixes methods (where it's genuinely telling you which ones differ);
  // otherwise state it once for the whole category instead.
  const methodsInCategory = new Set(
    pairs.map(({ product, response }) => products[product][response].detrend_method)
  );
  const uniformMethod = methodsInCategory.size === 1 ? [...methodsInCategory][0] : null;
  const baseNote = "Solid = observation, dashed = model. Check a variable below to add it to the chart.";
  note.textContent = uniformMethod
    ? `${baseNote} Every product here is ${DETREND_METHOD_LABELS[uniformMethod]}.`
    : baseNote;

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

  const traces = [];
  const legendItems = [];
  let colorIndex = 0;
  pairs.forEach(({ product, response }, pairIndex) => {
    const data = seriesList[pairIndex];
    const region = data.regions[compareState.region];
    if (!region) return;

    let sigma = region.sigma;
    if (category === "vegetation") {
      const seasonal = seasonalList[pairIndex];
      const seasonalRegion = seasonal && seasonal.regions[compareState.region];
      if (seasonalRegion) {
        const mean = seasonalRegion.climatology_mean;
        const trough = Math.min(...mean);
        const amplitude = Math.max(...mean) - trough;
        const keepMonth = mean.map((v) => (v - trough) > COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION * amplitude);
        sigma = region.dates.map((d, i) => {
          const month = parseInt(d.slice(5, 7), 10);
          return keepMonth[month - 1] ? sigma[i] : null;
        });
      }
    }
    if (COMBINED_INVERTED_VALENCE_RESPONSES.has(response)) {
      sigma = sigma.map((v) => (v === null || v === undefined ? null : -v));
    }

    const isObservation = PRODUCT_OBSERVATION_KIND[product] === "observation";
    const detrendMethod = products[product][response].detrend_method;
    const color = CATEGORY_OVERLAY_COLORS[colorIndex % CATEGORY_OVERLAY_COLORS.length];
    const name = `${product} ${response}${uniformMethod ? "" : detrendShortSuffix(detrendMethod)}`;
    const pairKey = `${product}|${response}`;
    const visible = checkedKey.has(pairKey);
    const { dates, values } = filterFrom1990(region.dates, sigma);
    traces.push({
      x: dates, y: values, type: "scatter", mode: "lines", connectgaps: false,
      line: { color, width: 1.6, dash: isObservation ? "solid" : "dash" },
      name, visible,
    });
    legendItems.push({ name, color, visible, pairKey });
    colorIndex++;
  });
  Plotly.newPlot(chart, traces, { ...plotlyLayout(), showlegend: false }, { responsive: true, displaylogo: false });
  renderCategoryLegend(legendItems);
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
      Plotly.restyle(document.getElementById("compare-chart"), { visible: event.target.checked }, [i]);
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
