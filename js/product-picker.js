// Shared "pick a category, then a product, then a variable/response" UI --
// used by any page that shows ONE product at a time (Time Series, Seasonal
// Cycle). Compare picks a whole category instead (own logic, js/compare.js);
// the Map page has its own independent picker (js/map-viewer.js) since it
// also drives period/mode/year controls no other page has.
//
// A page using this includes #category-tabs/#product-select/#response-
// select/#product-meta/#region-toggle in its HTML, then calls
// initProductPicker(onSelectionChanged) with a callback that renders
// whatever that page's own chart is once category/product/response/region
// settle.

const pickerState = { category: null, product: null, response: null, region: "ALL" };

function currentPickerEntry() {
  return manifest.categories[pickerState.category][pickerState.product][pickerState.response];
}

// Set once from the URL hash on load (js/map-viewer.js's copyViewLink()
// writes this same shape for its own page), consumed once as each selector
// settles, then cleared -- never re-applied on later clicks.
let pendingPickerView = null;

function parseSharedPickerViewFromUrl() {
  if (!window.location.hash || window.location.hash.length < 2) return null;
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const view = Object.fromEntries(params.entries());
    return view.category && view.product && view.response ? view : null;
  } catch (err) {
    return null;
  }
}

let lastPickerSelection = null;

function initProductPicker(onSelectionChanged) {
  if (!document.getElementById("category-tabs")) return;
  populateRegionToggle(document.getElementById("region-toggle"), pickerState.region);
  renderPickerCategoryTabs(onSelectionChanged);
  pendingPickerView = parseSharedPickerViewFromUrl();
  lastPickerSelection = pendingPickerView ? null : loadLastSelection();
  const preferredCategory = pendingPickerView?.category || lastPickerSelection?.category;
  const initialCategory = (preferredCategory && manifest.categories[preferredCategory])
    ? preferredCategory
    : manifest.category_order.find((cat) => Object.keys(manifest.categories[cat]).length > 0);
  selectPickerCategory(initialCategory, onSelectionChanged);
  wirePickerControls(onSelectionChanged);
  wireProductSearch("product-search", "product-search-results", (category, product, response) => {
    pendingPickerView = { category, product, response };
    selectPickerCategory(category, onSelectionChanged);
  });
}

function renderPickerCategoryTabs(onSelectionChanged) {
  const nav = document.getElementById("category-tabs");
  nav.innerHTML = "";
  manifest.category_order.forEach((category) => {
    const products = manifest.categories[category];
    if (Object.keys(products).length === 0) return;
    const button = document.createElement("button");
    button.className = "category-tab";
    button.textContent = categoryLabelWithIcon(category);
    button.style.setProperty("--cat", manifest.category_colors[category]);
    button.dataset.category = category;
    button.addEventListener("click", () => selectPickerCategory(category, onSelectionChanged));
    nav.appendChild(button);
  });
}

function selectPickerCategory(category, onSelectionChanged) {
  pickerState.category = category;
  document.querySelectorAll("#category-tabs .category-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });
  populatePickerProductSelect(onSelectionChanged);
}

function populatePickerProductSelect(onSelectionChanged) {
  const select = document.getElementById("product-select");
  select.innerHTML = "";
  const products = Object.keys(manifest.categories[pickerState.category]);
  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product;
    option.textContent = product;
    select.appendChild(option);
  });
  const preferredProduct = pendingPickerView?.product || lastPickerSelection?.product;
  pickerState.product = (preferredProduct && products.includes(preferredProduct))
    ? preferredProduct : products[0];
  select.value = pickerState.product;
  populatePickerResponseSelect(onSelectionChanged);
}

function populatePickerResponseSelect(onSelectionChanged) {
  const select = document.getElementById("response-select");
  select.innerHTML = "";
  const responses = Object.keys(manifest.categories[pickerState.category][pickerState.product]);
  responses.forEach((response) => {
    const option = document.createElement("option");
    option.value = response;
    option.textContent = response;
    select.appendChild(option);
  });
  const preferredResponse = pendingPickerView?.response || lastPickerSelection?.response;
  pickerState.response = (preferredResponse && responses.includes(preferredResponse))
    ? preferredResponse : responses[0];
  select.value = pickerState.response;

  if (pendingPickerView) {
    if (pendingPickerView.region) {
      pickerState.region = pendingPickerView.region;
      document.querySelectorAll("#region-toggle button").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.region === pendingPickerView.region);
      });
    }
    pendingPickerView = null; // restore only on initial load, never again
  }
  lastPickerSelection = null; // consumed as a one-time fallback, same as pendingPickerView
  onPickerSelectionSettled(onSelectionChanged);
}

function onPickerSelectionSettled(onSelectionChanged) {
  const entry = currentPickerEntry();
  document.getElementById("product-meta").innerHTML = productMetaHtml(entry);
  saveLastSelection(pickerState.category, pickerState.product, pickerState.response);
  onSelectionChanged(entry);
}

function wirePickerControls(onSelectionChanged) {
  document.getElementById("product-select").addEventListener("change", (event) => {
    pickerState.product = event.target.value;
    populatePickerResponseSelect(onSelectionChanged);
  });
  document.getElementById("response-select").addEventListener("change", (event) => {
    pickerState.response = event.target.value;
    onPickerSelectionSettled(onSelectionChanged);
  });
  document.getElementById("region-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-region]");
    if (!button) return;
    pickerState.region = button.dataset.region;
    document.querySelectorAll("#region-toggle button").forEach((btn) => btn.classList.toggle("active", btn === button));
    onSelectionChanged(currentPickerEntry());
  });
}

// DASHBOARD_MIN_YEAR is defined once in js/common.js (shared by every page).
function filterFrom1990(dates, values) {
  return {
    dates: dates.filter((d) => parseInt(d.slice(0, 4), 10) >= DASHBOARD_MIN_YEAR),
    values: values.filter((_, i) => parseInt(dates[i].slice(0, 4), 10) >= DASHBOARD_MIN_YEAR),
  };
}
