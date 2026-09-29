// Figure Gallery page: browse/download the pipeline's own pre-rendered
// static PNGs (code/dashboard_export.py's figures/maps/ and figures/
// heatmaps/), not the client-computed interactive charts every other page
// uses. Every path comes straight from the manifest -- entry.maps[period]
// for static maps, manifest.heatmaps for static heatmaps -- nothing is
// guessed or hardcoded.

function galleryFigureLabel(key) {
  if (key === "baseline") return "Climatology";
  const match = key.match(/^(raw|anomaly)_(\d{4})$/);
  if (match) return `${match[1] === "raw" ? "Raw value" : "Anomaly"}, ${match[2]}`;
  return key;
}

function populateGalleryPeriodSelect(entry) {
  const select = document.getElementById("gallery-period-select");
  select.innerHTML = "";
  const periods = sortedPeriods(Object.keys(entry.maps || {}));
  periods.forEach((period) => {
    const option = document.createElement("option");
    option.value = period;
    option.textContent = SEASON_LABELS[period] || MONTH_NAMES[parseInt(period, 10) - 1];
    select.appendChild(option);
  });
  return periods;
}

function populateGalleryFigureSelect(entry, period) {
  const select = document.getElementById("gallery-figure-select");
  select.innerHTML = "";
  const slot = (entry.maps || {})[period] || {};
  // baseline first, then raw/anomaly years oldest to newest -- reads as a
  // natural progression, not the arbitrary key-insertion order of the JSON.
  const keys = Object.keys(slot).sort((a, b) => {
    if (a === "baseline") return -1;
    if (b === "baseline") return 1;
    return a.localeCompare(b);
  });
  keys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = galleryFigureLabel(key);
    select.appendChild(option);
  });
  return { slot, keys };
}

function renderGalleryMap(entry) {
  const wrap = document.getElementById("gallery-map-wrap");
  const empty = document.getElementById("gallery-map-empty");
  const period = document.getElementById("gallery-period-select").value;
  const figureKey = document.getElementById("gallery-figure-select").value;
  const slot = (entry.maps || {})[period] || {};
  const relPath = slot[figureKey];
  if (!relPath) {
    wrap.style.display = "none";
    empty.style.display = "block";
    return;
  }
  wrap.style.display = "";
  empty.style.display = "none";
  const url = assetUrl(`figures/maps/${relPath}`);
  const img = document.getElementById("gallery-map-img");
  img.src = url;
  img.alt = `${pickerState.product} ${pickerState.response}, ${galleryFigureLabel(figureKey)}, ${document.getElementById("gallery-period-select").selectedOptions[0].textContent}`;
  const download = document.getElementById("gallery-map-download");
  download.href = url;
  download.setAttribute("download", relPath.split("/").pop());
}

function onGallerySelectionChanged(entry) {
  const periods = populateGalleryPeriodSelect(entry);
  if (periods.length === 0) {
    document.getElementById("gallery-map-wrap").style.display = "none";
    document.getElementById("gallery-map-empty").style.display = "block";
    document.getElementById("gallery-figure-select").innerHTML = "";
    return;
  }
  populateGalleryFigureSelect(entry, periods[0]);
  renderGalleryMap(entry);
}

function wireGalleryMapControls() {
  document.getElementById("gallery-period-select").addEventListener("change", (event) => {
    const entry = currentPickerEntry();
    populateGalleryFigureSelect(entry, event.target.value);
    renderGalleryMap(entry);
  });
  document.getElementById("gallery-figure-select").addEventListener("change", () => {
    renderGalleryMap(currentPickerEntry());
  });
}

// ------------------------------------------------------------- Heatmaps

function initGalleryHeatmaps() {
  const familySelect = document.getElementById("gallery-heatmap-family-select");
  Object.entries(manifest.heatmaps).forEach(([key, family]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = family.label;
    familySelect.appendChild(option);
  });
  familySelect.addEventListener("change", () => {
    populateGalleryHeatmapCategorySelect();
    renderGalleryHeatmap();
  });
  document.getElementById("gallery-heatmap-category-select").addEventListener("change", renderGalleryHeatmap);
  populateGalleryHeatmapCategorySelect();
  renderGalleryHeatmap();
}

function populateGalleryHeatmapCategorySelect() {
  const family = manifest.heatmaps[document.getElementById("gallery-heatmap-family-select").value];
  const select = document.getElementById("gallery-heatmap-category-select");
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All products";
  select.appendChild(allOption);
  manifest.category_order.forEach((category) => {
    if (!(category in family.categories)) return;
    const option = document.createElement("option");
    option.value = category;
    option.textContent = categoryLabelWithIcon(category);
    select.appendChild(option);
  });
}

function renderGalleryHeatmap() {
  const family = manifest.heatmaps[document.getElementById("gallery-heatmap-family-select").value];
  const category = document.getElementById("gallery-heatmap-category-select").value;
  const wrap = document.getElementById("gallery-heatmap-wrap");
  const empty = document.getElementById("gallery-heatmap-empty");
  const filename = (family.categories[category] || {}).all;
  if (!filename) {
    wrap.style.display = "none";
    empty.style.display = "block";
    return;
  }
  wrap.style.display = "";
  empty.style.display = "none";
  const url = assetUrl(`figures/heatmaps/${filename}`);
  const img = document.getElementById("gallery-heatmap-img");
  img.src = url;
  img.alt = `${family.label}, ${category === "all" ? "all products" : manifest.category_labels[category]}`;
  const download = document.getElementById("gallery-heatmap-download");
  download.href = url;
  download.setAttribute("download", filename);
}

async function init() {
  await loadManifest();
  wireGalleryMapControls();
  initProductPicker(onGallerySelectionChanged);
  initGalleryHeatmaps();
}

init();
