// Shared across every page (index.html, map.html, explore.html, seasonal.html,
// compare.html, data.html, heatmaps.html, classification.html, about.html): the
// manifest fetch and the small set of constants/helpers every page needs.
// No page-specific state lives here.

// 8 nav items collapse into a toggled dropdown below 900px (see
// .nav-toggle/.site-nav.open in style.css) -- wires the hamburger button
// every page's header includes. A no-op if a page has no #nav-toggle.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
});

// Solid black axis border on every Plotly chart (Compare, Time Series,
// Seasonal Cycle) -- Plotly's own default draws no axis line at all, just
// gridlines, which read as an unstyled/default chart (Dylan, 2026-09-30:
// "this looks like an old Microsoft Excel plot"). mirror: true draws the
// matching line on the opposite (top/right) side too, so the plot area
// reads as a clean closed box, not just two bare edges.
const PLOTLY_AXIS_LINE = {
  showline: true, linecolor: "#1b1b1b", linewidth: 1, mirror: true,
  ticks: "outside", tickcolor: "#1b1b1b",
};

// A minor TICK MARK (not a gridline) at every calendar year, on top of
// whatever major ticks Plotly's own autotick picks for the labeled years
// (Dylan, 2026-09-30: "minor breaks are absolutely every calendar year",
// then "this is how it should look" against a reference matplotlib figure
// with no vertical gridlines at all, just a tick at every year) -- spread
// into any continuous (non-category) date xaxis alongside showgrid: false
// and PLOTLY_AXIS_LINE.
const PLOTLY_YEARLY_MINOR_TICKS = { minor: { dtick: "M12", ticks: "outside", ticklen: 4, showgrid: false } };

// One glyph per category, everywhere a category label renders (category
// tabs, category selects, table group rows, search results) -- Dylan,
// 2026-09: "text icons for each of the variable groups, like a leaf for
// photosynthesis." Keyed by manifest.category_order's own category ids, not
// guessed from the display label text.
// Written as \u{...} code point escapes, not literal characters -- some of
// these are outside the Basic Multilingual Plane (surrogate-pair territory)
// and got silently mangled as literal bytes through one editing pass.
const CATEGORY_ICONS = {
  snow: "\u{2744}", // snowflake
  climate: "\u{1F321}", // thermometer
  precipitation: "\u{1F327}", // cloud with rain
  soil_moisture: "\u{1F4A7}", // droplet
  vegetation: "\u{1F33F}", // herb (leaf)
  fire: "\u{1F525}", // fire
  drought: "\u{1F3DC}", // desert
};

function categoryLabelWithIcon(category) {
  const icon = CATEGORY_ICONS[category];
  return icon ? `${icon} ${manifest.category_labels[category]}` : manifest.category_labels[category];
}

// Hard floor across every page (Dylan, 2026-09): a handful of products
// (SPI/SPEI/PRISM-based) have a real record back to 1895, which compresses
// this whole dashboard's actual 1990-2026 baseline era into a sliver
// whenever a chart shares one axis/dropdown across many products. Same name
// as config.py's own DASHBOARD_MIN_YEAR, but deliberately a different value
// (1979 there) -- that one floors what 14_dashboard_export.py writes into
// the JSON in the first place; this one floors the narrower display window
// applied on top of that already-exported data. Not a bug if they diverge;
// would be a bug if this one ever floored BELOW 1979 (data that doesn't exist).
const DASHBOARD_MIN_YEAR = 1990;

// The year range spanning every product's actual record_start/record_end,
// floored at DASHBOARD_MIN_YEAR -- a handful of products (e.g. PRISM back to
// 1895) would otherwise push the range's start back nearly a century for a
// dropdown that's really about this dashboard's 1990-2026 baseline era. A
// product with a shorter record than that still just produces "--" rows/cells
// for years outside its own coverage. Shared across any page needing a
// dashboard-wide year range (Summary Table, Heatmap), not page-specific.
function fullRecordYearRange() {
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const products of Object.values(manifest.categories)) {
    for (const responses of Object.values(products)) {
      for (const entry of Object.values(responses)) {
        if (entry.record_start) minYear = Math.min(minYear, parseInt(entry.record_start.slice(0, 4), 10));
        if (entry.record_end) maxYear = Math.max(maxYear, parseInt(entry.record_end.slice(0, 4), 10));
      }
    }
  }
  return { minYear: Math.max(DASHBOARD_MIN_YEAR, minYear), maxYear };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SEASON_LABELS = {
  MAM: "Mar–May", JJA: "Jun–Aug", SON: "Sep–Nov",
  DJF: "Dec–Feb", NDJF: "Nov–Feb",
  DJFM: "Dec–Mar", AMJJ: "Apr–Jul",
  MAMJJAS: "Mar–Sep", ANNUAL: "Jan–Dec",
};
const SEASON_ORDER = ["NDJF", "DJFM", "DJF", "MAM", "AMJJ", "MAMJJAS", "JJA", "SON", "ANNUAL"];
// Mirrors config.py's MAP_SEASONAL_PERIODS -- do not diverge for any window
// also used by the interactive map's period select (built server-side from
// that same dict, see code/17_dashboard_cog_export.py's SEASON_MONTHS).
// MAMJJAS/ANNUAL are dashboard-only additions with no COG coverage yet --
// they work everywhere else (summary table, heatmaps, compare) because
// those are computed live from monthly timeseries JSON, not pre-rendered maps.
const SEASON_MONTHS = {
  MAM: [3, 4, 5], JJA: [6, 7, 8], SON: [9, 10, 11],
  DJF: [12, 1, 2], NDJF: [11, 12, 1, 2], DJFM: [12, 1, 2, 3], AMJJ: [4, 5, 6, 7],
  MAMJJAS: [3, 4, 5, 6, 7, 8, 9], ANNUAL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

// Mirrors config.py's PRODUCT_OBSERVATION_KIND exactly -- do not diverge.
// Re-synced 2026-10-01 after this copy drifted from the Python source: 6
// real observation products (GBBEPx, SNOTEL, MODIS-Terra-SCA,
// MODIS-Aqua-SCA, VIIRS-LST, AmeriFlux) were missing entirely, which made
// their Compare-view lines render dashed/"model" by default (a bare-object
// lookup miss is undefined, not "observation") -- confirmed live,
// 2026-09-30/10-01: "a whole bunch of these are not labeled right." Also
// dropped a stale "VHP" entry that isn't a real product in either dict.
// Drives solid (observation) vs dashed (model) line styling in the
// category-grouped overlay view, same convention as
// 11_combined_GroupOverlays_analyze.py's line_style().
const PRODUCT_OBSERVATION_KIND = {
  "ERA5-Land": "model", "GFED5": "observation", "GBBEPx": "observation",
  "GPCP": "observation", "GRACE-JPL-L3": "observation", "NLDAS-Mosaic": "model",
  "NLDAS-Noah": "model", "NLDAS-VIC": "model", "PRISM": "observation",
  "SiB4": "model", "UA-SWE-Monthly": "observation", "IMS-Snow": "observation",
  "SNOTEL": "observation", "SMAP": "observation", "SNODAS": "model",
  "gridMET-Fire": "model", "OCO-2": "observation", "PhenoCam": "observation",
  "SMOS": "observation", "CAMS": "model", "CarbonTracker": "model",
  "FluxSat": "model", "GOSIF": "model", "GOSIF-GPP": "model", "MiCASA": "model",
  "MODIS-Terra": "observation", "MODIS-Aqua": "observation",
  "MODIS-Terra-SCA": "observation", "MODIS-Aqua-SCA": "observation",
  "TROPOSIF": "observation", "SPI": "observation", "SPEI": "observation",
  "EDDI": "model", "PDSI": "model", "ForDRI": "model", "ESI": "observation",
  "VegDRI": "observation", "USDM": "observation", "VIIRS": "observation",
  "VIIRS-LST": "observation", "VIIRS-NDVI": "observation", "GRACE-L4": "model",
  "NEON": "observation", "AmeriFlux": "observation",
};

// Mirrors config.py's COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION exactly.
// A calendar month is kept in the vegetation group overlay only where its
// baseline mean clears this fraction of the seasonal amplitude above the
// dormant trough -- otherwise a tiny winter absolute anomaly divided by a
// near-zero dormant-season spread explodes the standardized value.
const COMBINED_GROWING_SEASON_MIN_AMPLITUDE_FRACTION = 0.15;

// ---------------------------------------------------------- Window statistics
//
// Shared season-window aggregation + non-parametric standardization, used by
// both the homepage summary table (js/summary.js) and the dynamic heatmaps
// (js/explore.js) -- one implementation so the two views can never drift
// against each other.

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Inverse standard normal CDF (probit) via Peter Acklam's rational
// approximation (accurate to ~1.15e-9) -- mirrors scipy.stats.norm.ppf, used
// so the season-window statistic below matches code/common/detrend.py's
// normal_score_transform (the pipeline's canonical, non-parametric
// standardization) instead of a from-scratch parametric z-score.
function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function sigmaToPercentileLabel(percentile) {
  if (percentile >= 99.95) return ">99.9%";
  if (percentile <= 0.05) return "<0.1%";
  return `${Math.round(percentile)}%`;
}

// Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
// (max error ~1.5e-7) -- only used for native standardized indices
// (SPI/SPEI/EDDI/...), whose own value is already an approximately
// standard-normal quantity by construction, so a forward CDF is the correct
// (not the rank-based) way to read its percentile.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function nativeIndexPercentile(sigma) {
  return 50 * (1 + erf(sigma / Math.SQRT2));
}

// Mirrors common/detrend.py's MIN_BASELINE_YEARS -- must stay in sync.
const MIN_BASELINE_YEARS = 3;

function windowMonthYearPairs(windowKey, targetYear) {
  const months = SEASON_MONTHS[windowKey] || [parseInt(windowKey, 10)];
  // A window spanning all 12 months (ANNUAL) always has both January and
  // October-December present, but it's a single calendar year, not a
  // Dec->Jan wrap -- the length check disambiguates it from a genuine
  // winter window like NDJF/DJF/DJFM.
  const crossesNewYear = months.length < 12 && months.includes(1) && months.some((m) => m >= 10);
  return months.map((month) => ({
    month,
    year: crossesNewYear && month >= 10 ? targetYear - 1 : targetYear,
  }));
}

function aggregateWindow(region, windowKey, targetYear, rule, field) {
  const pairs = windowMonthYearPairs(windowKey, targetYear);
  const values = [];
  const weights = [];
  for (const { month, year } of pairs) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const idx = region.dates.indexOf(dateStr);
    if (idx === -1 || region[field][idx] === null) return null;
    values.push(region[field][idx]);
    weights.push(rule === "day_weighted_mean" ? daysInMonth(year, month) : 1);
  }
  if (rule === "sum") return values.reduce((a, b) => a + b, 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
}

function meanStd(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

// Returns { sigma, percentile, rawValue, percentOfNormal, isNativeIndex,
// stressRank, n } for one product/response/region/window/year.
// sigma/percentile standardize the window-aggregated anomaly the same way
// common/detrend.py's normal_score_transform standardizes a single month:
// rank the target against the baseline years' own aggregated-anomaly
// distribution (Weibull plotting position), then map that percentile
// through the inverse normal CDF -- non-parametric, so it stays meaningful
// for skewed/bounded fields instead of assuming the baseline years are
// normally distributed.
// percentOfNormal is null wherever the baseline mean is too close to zero to
// divide by meaningfully (e.g. some temperature/VPD anomaly-prone fields),
// or for native standardized indices (already a departure statistic, not a
// physical quantity with a "normal").
// stressRank/n: this target year's rank among the n baseline years, counted
// from the most stressful end (1 = the single most drought-stressed
// baseline year for this response's own drier_is_high direction) -- the
// same baseline sample sigma/percentile already rank against, just reported
// as a plain ordinal instead of a standardized score.
function computeWindowValue(data, region, windowKey, targetYear) {
  if (data.aggregation === "native_index") {
    // A native index (e.g. SPI-03) is already its own trailing N-month
    // statistic, so it can't be re-aggregated across a season window -- but
    // it's still meaningful for one: show its reading as of the window's
    // own last month (e.g. DJFM -> its March value, which for a 3-month
    // index already reflects Jan-Mar).
    const pairs = windowMonthYearPairs(windowKey, targetYear);
    const { month, year } = pairs[pairs.length - 1];
    const dateStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const idx = region.dates.indexOf(dateStr);
    if (idx === -1) return null;
    const v = region.value[idx];
    return {
      sigma: v, percentile: null, rawValue: v, percentOfNormal: null,
      isNativeIndex: true, stressRank: null, n: null,
    };
  }
  const targetAnomaly = aggregateWindow(region, windowKey, targetYear, data.aggregation, "anomaly");
  const targetRaw = aggregateWindow(region, windowKey, targetYear, data.aggregation, "value");
  if (targetAnomaly === null || targetRaw === null) return null;

  const baselineAnomalies = [];
  const baselineRaws = [];
  for (let y = region.baseline_start_year; y <= region.baseline_end_year; y++) {
    const a = aggregateWindow(region, windowKey, y, data.aggregation, "anomaly");
    const r = aggregateWindow(region, windowKey, y, data.aggregation, "value");
    if (a !== null) baselineAnomalies.push(a);
    if (r !== null) baselineRaws.push(r);
  }
  if (baselineAnomalies.length < MIN_BASELINE_YEARS) return null;
  baselineAnomalies.sort((a, b) => a - b);
  const n = baselineAnomalies.length;
  const rank = baselineAnomalies.filter((a) => a <= targetAnomaly).length; // matches np.searchsorted(..., side="right")
  const percentile = ((rank + 0.5) / (n + 1)) * 100;
  const sigma = normInv(percentile / 100);

  // The displayed "rank on record" badge is a separate statistic from sigma:
  // sigma/percentile stay anchored to the fixed baseline_start_year..
  // baseline_end_year climatology (unchanged above, matching the Python
  // pipeline's own baseline-relative standardization everywhere else). The
  // rank badge instead compares the target year against every year with
  // valid data in the record, not just the frozen baseline slice -- ranking
  // only against the baseline meant a post-baseline year that set a new
  // record (e.g. 2026) could never be distinguished from the baseline's own
  // most extreme year (e.g. 2015): both simply "beat all baseline years" and
  // saturated at the same rank, even though their actual anomalies differed
  // by more than 2x (confirmed live, 2026-09-29, ERA5-Land T2m DJFM).
  const recordAnomalies = [];
  const firstRecordYear = parseInt(region.dates[0].slice(0, 4), 10);
  const lastRecordYear = parseInt(region.dates[region.dates.length - 1].slice(0, 4), 10);
  for (let y = firstRecordYear; y <= lastRecordYear; y++) {
    const a = aggregateWindow(region, windowKey, y, data.aggregation, "anomaly");
    if (a !== null) recordAnomalies.push(a);
  }
  recordAnomalies.sort((a, b) => a - b);
  const nRecord = recordAnomalies.length;
  const rankRecord = recordAnomalies.filter((a) => a <= targetAnomaly).length;
  // rank counts from the driest/coolest (lowest-anomaly) end; drier_is_high
  // determines which end is actually the stressed one for this response.
  const stressRank = data.drier_is_high ? nRecord - rankRecord + 1 : rankRecord;

  let percentOfNormal = null;
  if (baselineRaws.length >= 2) {
    const { mean: meanRaw, std: stdRaw } = meanStd(baselineRaws);
    // Guard: a baseline mean within one baseline std of zero makes "percent
    // of normal" numerically unstable (small denominator), not meaningful.
    if (Math.abs(meanRaw) > stdRaw) percentOfNormal = ((targetRaw - meanRaw) / meanRaw) * 100;
  }
  return {
    sigma, percentile, rawValue: targetRaw, percentOfNormal,
    isNativeIndex: false, stressRank, n,
  };
}

let manifest = null;

async function loadManifest() {
  const response = await fetch(assetUrl("data/manifest.json"));
  manifest = await response.json();
  return manifest;
}

// Shared across every consumer of data/timeseries/*.json -- js/summary.js
// (data.html) and js/heatmaps.js (heatmaps.html, its own separate page) each
// fetch this independently, and explore.html's own single-product Explorer
// view and Compare view fetch the same product's file whenever the product
// checked in Compare is also the one selected in the Explorer picker. Each
// of those used to keep its own separate cache for the exact same URLs.
// Caches the in-flight PROMISE, not
// just the resolved value: two features' initial renders can call this for
// the same key before either fetch has resolved, so caching only the
// resolved value still let that first race double-fetch (confirmed 2026-09).
const _timeseriesCache = {};
function fetchTimeseriesJson(key) {
  if (!_timeseriesCache[key]) {
    _timeseriesCache[key] = fetch(assetUrl(`data/timeseries/${key}.json`)).then((res) => res.json());
  }
  return _timeseriesCache[key];
}

// Same sharing rationale as fetchTimeseriesJson above, for data/seasonal/*.json
// (explore.html's Explorer "Seasonal cycle" tab and Compare's vegetation-only
// growing-season mask both read it). Resolves to null on a non-ok response
// rather than rejecting -- mirrors the tolerance the old per-page
// fetchCompareSeasonal() already had, so callers can just check for a falsy
// result instead of a try/catch.
const _seasonalCache = {};
function fetchSeasonalJson(key) {
  if (!_seasonalCache[key]) {
    _seasonalCache[key] = fetch(assetUrl(`data/seasonal/${key}.json`)).then((res) => (res.ok ? res.json() : null));
  }
  return _seasonalCache[key];
}

// Every top-level region (Western US, CO-UT-WY, and whatever else the
// pipeline adds -- e.g. NOAA climate regions) comes from manifest.region_labels,
// never hardcoded here, so a new region shows up everywhere the moment the
// pipeline export includes it -- no dashboard code change needed. Kept
// separate from allRegionEntries() below: js/summary.js's "Regions" tab uses
// this narrower list on purpose, as one of three distinct tabs (Regions/
// States/HUC2) -- widening it here would duplicate every state and HUC2
// basin into that tab too.
function regionEntries() {
  return Object.entries(manifest.region_labels).map(([code, label]) => ({ code, label }));
}

// Every region code the pipeline actually exports data for: the 6 named
// regions plus all 11 states and 5 HUC2 basins, which every per-product
// timeseries JSON already carries. Used by the single flat region
// pickers (Explorer, Compare, Heatmaps) so they expose the same data
// js/summary.js's grouped Regions/States/HUC2 tabs already do -- confirmed
// 2026-09-25 those pickers were silently capped at the 6 named regions via
// regionEntries(), hiding 16 of 22 regions' worth of processed data.
function allRegionEntries() {
  const named = regionEntries();
  const states = manifest.western_states.map((code) => ({ code, label: manifest.state_labels[code] }));
  const huc2 = manifest.huc2_regions.map((code) => ({ code, label: manifest.huc2_labels[code] }));
  return [...named, ...states, ...huc2];
}

function populateRegionSelect(select, defaultCode = "ALL") {
  select.innerHTML = "";
  allRegionEntries().forEach(({ code, label }) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    if (code === defaultCode) option.selected = true;
    select.appendChild(option);
  });
}

function populateRegionToggle(container, defaultCode = "ALL") {
  container.innerHTML = "";
  allRegionEntries().forEach(({ code, label }) => {
    const button = document.createElement("button");
    button.dataset.region = code;
    button.textContent = label;
    if (code === defaultCode) button.classList.add("active");
    container.appendChild(button);
  });
}

// COGs (cogs/) are large binary assets served from external object storage
// (a Cloudflare R2 bucket, wus-snowdrought), not committed to this repo. On
// localhost, always fall back to the local relative cogs/ path instead --
// local dev/testing shouldn't depend on the R2 bucket being populated (and
// this account's DNS resolver blackholes *.r2.dev to 127.0.0.1, so pointing
// local testing at R2 doesn't even fail gracefully, it just hangs/refuses).
const IS_LOCALHOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const R2_BASE_URL = IS_LOCALHOST ? "" : "https://pub-0bea8387645a493dbf0dddd3045e4ae4.r2.dev";

function assetUrl(relativePath) {
  return R2_BASE_URL ? `${R2_BASE_URL.replace(/\/$/, "")}/${relativePath}` : relativePath;
}

function periodLabel(period) {
  return SEASON_LABELS[period] || MONTH_NAMES[parseInt(period, 10) - 1];
}

function sortedPeriods(periodKeys) {
  return periodKeys.slice().sort((a, b) => {
    const aSeason = SEASON_ORDER.indexOf(a);
    const bSeason = SEASON_ORDER.indexOf(b);
    if (aSeason !== -1 || bSeason !== -1) {
      if (aSeason === -1) return 1;
      if (bSeason === -1) return -1;
      return aSeason - bSeason;
    }
    return parseInt(a, 10) - parseInt(b, 10);
  });
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Looks up a response's manifest entry without needing to already know its
// category -- category is only known up front where a page's own picker
// state tracks it (js/explore.js's explorerState, js/map-viewer.js's
// mapPickerState); chart code building traces across many products at once
// (Compare variables, Heatmaps) only has product+response.
function findResponseEntry(product, response) {
  for (const products of Object.values(manifest.categories)) {
    if (products[product] && products[product][response]) return products[product][response];
  }
  return null;
}

// Shared by explore.js and map-viewer.js's product-meta line -- a short
// plain-language definition plus the same units/record/baseline facts
// already in the exported JSON, never any interpretive claim about current
// conditions.
function productMetaHtml(entry) {
  const recordRange = entry.record_start && entry.record_end
    ? `${entry.record_start.slice(0, 7)} – ${entry.record_end.slice(0, 7)}`
    : "unknown record range";
  const baseline = (entry.baseline_start_year && entry.baseline_end_year)
    ? `${entry.baseline_start_year}–${entry.baseline_end_year}`
    : "n/a";
  const glossaryLine = entry.glossary ? `<p class="product-glossary">${entry.glossary}</p>` : "";
  return `${glossaryLine}<p class="product-facts">Units: ${entry.units || "n/a"} · Baseline: ${baseline} · Record: ${recordRange} · Status: ${entry.status}</p>`;
}

// Cross-page continuity for the Explore <-> Maps product picker: the last
// category/product/response chosen on either page becomes the default on
// the other, so switching pages doesn't reset the view. Only a fallback --
// an incoming URL-hash shared view (js/explore.js's parseSharedViewFromUrl,
// js/map-viewer.js's parseSharedMapViewFromUrl) always takes priority, and
// writing here never touches the URL.
const LAST_SELECTION_KEY = "snowdroughtWUS.lastSelection";

function saveLastSelection(category, product, response) {
  try {
    localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({ category, product, response }));
  } catch (err) {
    // Private browsing / storage disabled -- selection just won't persist.
  }
}

function loadLastSelection() {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

// Flat (category, product, response) index for the product search box,
// shared by explore.js and map-viewer.js. Matches against the product/
// response codes and each response's own glossary text, so a search for a
// physical quantity ("snow water equivalent") finds it even without
// knowing the acronym.
function buildSearchIndex() {
  const index = [];
  for (const category of manifest.category_order) {
    for (const [product, responses] of Object.entries(manifest.categories[category])) {
      for (const [response, entry] of Object.entries(responses)) {
        index.push({ category, product, response, glossary: entry.glossary || "" });
      }
    }
  }
  return index;
}

function searchProductIndex(index, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index.filter((item) =>
    item.product.toLowerCase().includes(q) ||
    item.response.toLowerCase().includes(q) ||
    item.glossary.toLowerCase().includes(q)
  ).slice(0, 12);
}

// Wires a search <input> + results <div> pair (matching IDs on both Explore
// and Maps pages) to buildSearchIndex/searchProductIndex, calling
// onSelect(category, product, response) when a result is clicked.
function wireProductSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;
  const index = buildSearchIndex();
  input.addEventListener("input", () => {
    const matches = searchProductIndex(index, input.value);
    if (matches.length === 0) {
      results.innerHTML = "";
      results.style.display = "none";
      return;
    }
    results.innerHTML = matches.map((m, i) =>
      `<button type="button" class="search-result" data-index="${i}">
        <strong>${m.product}</strong> &ndash; ${m.response}
        <span class="search-result-category">${categoryLabelWithIcon(m.category)}</span>
      </button>`
    ).join("");
    results.style.display = "block";
    results.querySelectorAll(".search-result").forEach((button, i) => {
      button.addEventListener("click", () => {
        const m = matches[i];
        input.value = "";
        results.innerHTML = "";
        results.style.display = "none";
        onSelect(m.category, m.product, m.response);
      });
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target !== input && !results.contains(event.target)) {
      results.style.display = "none";
    }
  });
}
