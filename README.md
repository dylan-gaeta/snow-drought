# Western US Climate and Snow Drought Explorer

Live site: https://dylan-gaeta.github.io/snow-drought/

A public, data-forward dashboard built on top of `snowdrought-carbon`, a NOAA Global Monitoring Laboratory / CIRES research pipeline studying winter and snow drought across the Western US. Not an official NOAA or NIDIS product, issues no forecasts, and makes no causal or year-against-year claims — every chart and map is a direct view into the underlying observational and model data.

## Pages

- **Explore** — time series of any product/response, standardized against its own baseline climatology
- **Map** — interactive Cloud-Optimized GeoTIFF viewer for raw, climatology, and anomaly fields
- **Compare** — overlay multiple products/responses on one standardized-anomaly chart
- **Summary Table** — regional snapshot across every tracked variable for a chosen season/year
- **Heatmaps** — year-by-year or month-by-year standardized-anomaly grids
- **Seasonal Cycle** — current water year traced against the historical seasonal envelope
- **Gallery** — static figure archive from the underlying pipeline
- **Findings** — narrative summaries of notable events
- **Data** — product inventory, units, baselines, and record coverage

## Architecture

Static site (HTML/CSS/vanilla JS) hosted on GitHub Pages. All data — JSON time series, Cloud-Optimized GeoTIFFs, and static figures — is served from a Cloudflare R2 bucket, exported from the private `snowdrought-carbon` pipeline via `dashboard_export.py` and `dashboard_cog_export.py`.
