// Summary Table page (data.html). Computed entirely client-side from the
// same monthly grid-cell-detrended anomaly arrays the Time Series page
// uses -- no new statistics invented here. Each response's multi-month
// aggregation rule (sum / mean / day_weighted_mean / native_index) comes
// from code/dashboard_export.py's AGGREGATION_RULE, audited against each
// product's actual reducer/analyzer code, not guessed. "Stress vs relief"
// coloring uses drier_is_high, straight from config.py's own
// response_drier_is_high() -- the same function the canonical multi-product
// heatmap uses -- not a locally invented sign convention.

const summaryState = {
  window: "DJFM", year: 2026, valueType: "sigma", regionGroup: "summary",
  // Set of "product|response" keys currently showing their OLS-detrended
  // companion instead of the mean-centered default -- only ever populated
  // for pairs where has_detrend_companion is true, same toggle idea as
  // js/compare.js's compareState.detrendToggled, just one button per table
  // row instead of per checked legend item (Dylan, 2026-09-29: has_detrend_
  // companion/sigma_detrend was only reachable from Compare and the Map,
  // not here).
  detrendToggled: new Set(),
};
let summaryRegionColumns = []; // [{code, label}], rebuilt whenever regionGroup changes

async function fetchSummaryData(product, response) {
  return fetchTimeseriesJson(`${product}_${response}`);
}

function regionColumnsForGroup(group) {
  if (group === "states") return manifest.western_states.map((code) => ({ code, label: code }));
  if (group === "huc2") return manifest.huc2_regions.map((code) => ({ code, label: manifest.huc2_labels[code] }));
  return regionEntries(); // "Regions": Western US, CO-UT-WY, and whatever else manifest.region_labels has
}

function rebuildRegionColumns() {
  summaryRegionColumns = regionColumnsForGroup(summaryState.regionGroup);
  const headerRow = document.getElementById("summary-table-header");
  while (headerRow.children.length > 3) headerRow.removeChild(headerRow.lastChild); // keep Variable/Product/Detrended?
  summaryRegionColumns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    headerRow.appendChild(th);
  });
}

// fullRecordYearRange() now lives in js/common.js -- shared with heatmaps.js.

function initSummaryTable() {
  const windowSelect = document.getElementById("summary-window-select");
  if (!windowSelect) return;
  SEASON_ORDER.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${key} (${SEASON_LABELS[key]})`;
    windowSelect.appendChild(option);
  });
  MONTH_NAMES.forEach((name, i) => {
    const option = document.createElement("option");
    option.value = String(i + 1).padStart(2, "0");
    option.textContent = name;
    windowSelect.appendChild(option);
  });
  windowSelect.value = summaryState.window;

  windowSelect.addEventListener("change", (event) => {
    summaryState.window = event.target.value;
    renderSummaryTable();
  });

  const yearSelect = document.getElementById("summary-year-select");
  const { minYear, maxYear } = fullRecordYearRange();
  for (let year = maxYear; year >= minYear; year--) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  }
  yearSelect.value = String(summaryState.year);
  yearSelect.addEventListener("change", (event) => {
    summaryState.year = parseInt(event.target.value, 10);
    renderSummaryTable();
  });

  const valueSelect = document.getElementById("summary-value-select");
  const updateValueGlossary = () => {
    document.getElementById("summary-value-glossary").textContent =
      (manifest.value_type_glossary || {})[valueSelect.value] || "";
  };
  valueSelect.addEventListener("change", (event) => {
    summaryState.valueType = event.target.value;
    updateValueGlossary();
    renderSummaryTable();
  });
  updateValueGlossary();

  document.getElementById("summary-region-group-select").addEventListener("change", (event) => {
    summaryState.regionGroup = event.target.value;
    rebuildRegionColumns();
    renderSummaryTable();
  });
  rebuildRegionColumns();

  // Event delegation on the (persistent) tbody element, not a per-button
  // listener -- renderSummaryTable() below replaces body.innerHTML wholesale
  // on every render, which would silently drop any listener attached
  // directly to a row button.
  document.getElementById("summary-table-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-pair-key]");
    if (!button) return;
    const pairKey = button.dataset.pairKey;
    if (summaryState.detrendToggled.has(pairKey)) summaryState.detrendToggled.delete(pairKey);
    else summaryState.detrendToggled.add(pairKey);
    renderSummaryTable();
  });

  renderSummaryTable();
}

function formatSummaryValue(result, units, valueType) {
  const sign = result.sigma >= 0 ? "+" : "";
  if (valueType === "raw") return `${result.rawValue.toFixed(2)} ${units}`;
  if (valueType === "percentile") {
    const percentile = result.isNativeIndex ? nativeIndexPercentile(result.sigma) : result.percentile;
    return sigmaToPercentileLabel(percentile);
  }
  if (valueType === "percent_of_normal") {
    if (result.percentOfNormal === null) return "n/a";
    const pctSign = result.percentOfNormal >= 0 ? "+" : "";
    return `${pctSign}${result.percentOfNormal.toFixed(0)}%`;
  }
  if (valueType === "rank") {
    if (result.stressRank === null || result.n === null) return "&mdash;";
    return `${result.stressRank}/${result.n}`;
  }
  return `${sign}${result.sigma.toFixed(1)}`; // "sigma" default
}

async function renderSummaryTable() {
  const body = document.getElementById("summary-table-body");
  const colCount = 3 + summaryRegionColumns.length;
  body.innerHTML = `<tr><td colspan="${colCount}">Computing&hellip;</td></tr>`;

  // Fetch every product's JSON concurrently instead of one at a time -- the
  // full table is ~100 products, and awaiting each fetch in turn meant the
  // table waited on ~100 sequential network round-trips before rendering
  // anything (fetchSummaryData's own cache still applies per key, so a
  // repeat render of the same window/year is unaffected either way).
  const toFetch = [];
  for (const category of manifest.category_order) {
    const products = manifest.categories[category];
    for (const [product, responses] of Object.entries(products)) {
      for (const [response, entry] of Object.entries(responses)) {
        if (!entry.aggregation) continue; // no established aggregation rule (e.g. NEON NEE) -- excluded, not guessed
        toFetch.push({ category, product, response, entry });
      }
    }
  }
  const dataList = await Promise.all(toFetch.map((item) => fetchSummaryData(item.product, item.response)));

  const rowsByCategory = {};
  toFetch.forEach((item, i) => {
    const data = dataList[i];
    const pairKey = `${item.product}|${item.response}`;
    const hasDetrend = !!item.entry.has_detrend_companion;
    const useDetrend = hasDetrend && summaryState.detrendToggled.has(pairKey);
    const cells = summaryRegionColumns.map((col) => {
      const region = data.regions[col.code];
      if (!region) return null;
      return computeWindowValue(data, region, summaryState.window, summaryState.year, useDetrend);
    });
    if (cells.every((cell) => cell === null)) return;
    (rowsByCategory[item.category] = rowsByCategory[item.category] || []).push({
      product: item.product, response: item.response, cells, detrendMethod: item.entry.detrend_method,
      hasDetrend, pairKey, useDetrend, data,
    });
  });

  body.innerHTML = "";
  let anyRows = false;
  manifest.category_order.forEach((category) => {
    const rows = rowsByCategory[category];
    if (!rows || rows.length === 0) return;
    anyRows = true;
    const groupRow = document.createElement("tr");
    groupRow.className = "group-row";
    groupRow.innerHTML = `<td colspan="${colCount}">${categoryLabelWithIcon(category)}</td>`;
    body.appendChild(groupRow);
    rows.forEach((row) => {
      const data = row.data;
      let note = "";
      if (row.cells.some((cell) => cell && cell.isNativeIndex)) {
        if (SEASON_MONTHS[summaryState.window]) {
          const lastMonth = SEASON_MONTHS[summaryState.window].slice(-1)[0];
          note = ` (native index, as of ${MONTH_NAMES[lastMonth - 1]})`;
        } else {
          note = " (native index)";
        }
      }
      const cellsHtml = row.cells.map((result) => {
        if (!result) return "<td>&mdash;</td>";
        const isStress = data.drier_is_high ? result.sigma > 0 : result.sigma < 0;
        const cls = isStress ? "stress" : "relief";
        const text = formatSummaryValue(result, data.units, summaryState.valueType);
        return `<td class="${cls}">${text}</td>`;
      }).join("");
      const tr = document.createElement("tr");
      const responseCell = data.glossary
        ? `<td title="${data.glossary.replace(/"/g, "&quot;")}">${row.response}${note}</td>`
        : `<td>${row.response}${note}</td>`;
      // A real toggle button for this row, not a static badge, whenever this
      // response actually has an OLS-detrended companion to switch to --
      // same idea as js/compare.js's per-row toggle (Dylan, 2026-09-29:
      // has_detrend_companion/sigma_detrend used to be reachable only from
      // Compare and the Map, not here). Reuses .compare-legend-detrend-toggle
      // (css/style.css) rather than a near-duplicate rule for the same pill
      // button shape.
      const detrendCell = row.hasDetrend
        ? `<td><button type="button" class="compare-legend-detrend-toggle" data-pair-key="${row.pairKey}" aria-pressed="${row.useDetrend}">${row.useDetrend ? "Detrended" : "Not detrended"}</button></td>`
        : `<td>${detrendBadgeHtml(row.detrendMethod)}</td>`;
      tr.innerHTML = `${responseCell}<td>${row.product}</td>${detrendCell}${cellsHtml}`;
      body.appendChild(tr);
    });
  });
  if (!anyRows) {
    body.innerHTML = `<tr><td class="no-data-cell" colspan="${colCount}">No data for this window/year.</td></tr>`;
  }
}

loadManifest().then(initSummaryTable);
