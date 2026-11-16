# Western US Climate and Snow Drought Explorer

Live site: https://snowdrought.org

A public, data-forward dashboard built on top of `snowdrought-carbon`, a NOAA Global Monitoring Laboratory / CIRES research pipeline studying winter and snow drought across the Western US. Not an official NOAA or NIDIS product, issues no forecasts, and makes no causal or year-against-year claims — every chart and map is a direct view into the underlying observational and model data.

## Pages

- **Home** (home.html; index.html is the snowdrought.org landing page)
- **Map** — interactive Cloud-Optimized GeoTIFF viewer for raw, climatology, and anomaly fields
- **Time Series** (explore.html) — time series of any product and variable, raw or standardized against its own baseline
- **Seasonal Cycle** — current water year traced against the historical seasonal envelope
- **Compare** — overlay products and variables on one standardized-anomaly chart
- **Sites** — AmeriFlux and NEON flux towers
- **SNOTEL** — station snowpack
- **SiB4** — modeled biosphere drought response
- **Summary Statistics** (data.html) — regional snapshot across every tracked variable for a chosen window and year
- **Classification** — snow drought by winter type
- **Heatmap** (heatmaps.html) — year-by-year or month-by-year standardized-anomaly grids
- **Figure Gallery** — static figure archive from the pipeline
- **About** — anomaly method, data availability, datasets and references, and the problem-report form

## Architecture

Static site (HTML/CSS/vanilla JS) hosted on GitHub Pages. All data — JSON time series, Cloud-Optimized GeoTIFFs, and static figures — is served from a Cloudflare R2 bucket, exported from the private `snowdrought-carbon` pipeline via `dashboard_export.py` and `dashboard_cog_export.py`.
