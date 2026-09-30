#!/usr/bin/env bash
# Sync the local cogs/, data/, and figures/ staging directories (written by
# the snowdrought-carbon pipeline's export scripts) to the Cloudflare R2
# bucket that serves them to the live dashboard -- js/common.js's assetUrl()
# points at this same bucket for all three. cogs/ and figures/ are large
# binary data, too big for git; data/ is small individually but gets fully
# rewritten on every pipeline export, so committing it to git grows repo
# history forever with no way to reclaim the space (moved out of git
# 2026-09, see .gitignore).
#
# figures/maps/, figures/heatmaps/, figures/timeseries/, and
# figures/seasonal/ are all read by gallery.html (timeseries/seasonal added
# 2026-09-29, per Dylan: more important than the heatmaps already there) --
# figures/synthesis/ has no manifest index (dashboard_export.py doesn't
# curate it into manifest.json the way the other four are, and Dylan
# explicitly does not want the old headline/synthesis framing revived), so
# it's deliberately still not synced.
#
# R2 is not AWS -- this just reuses the aws-cli as a generic S3-compatible
# client pointed at R2's own endpoint, since R2 speaks the S3 API.
#
# Requires four environment variables, set in your own shell (never
# hardcoded here or passed on the command line):
#   R2_ACCOUNT_ID        Cloudflare dashboard > R2 > Overview (right side)
#   R2_ACCESS_KEY_ID      Cloudflare dashboard > R2 > Manage API Tokens > Create API Token
#   R2_SECRET_ACCESS_KEY  (shown once when the token is created -- save it then)
#   R2_BUCKET             the bucket name, e.g. wus-snowdrought
set -euo pipefail

: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?set R2_BUCKET}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# aws s3 sync returns non-zero if EVEN ONE file fails mid-transfer, which
# (combined with this script's own set -e) killed the entire script before
# later stages (figures/, or even the rest of cogs/) ever ran -- confirmed
# live, 2026-09-29: two consecutive real syncs each hit a handful of
# "SSLV3_ALERT_BAD_RECORD_MAC" failures (a transient TLS blip, not a real
# data problem -- confirmed by the retry succeeding on the exact same file
# seconds later) out of tens of thousands of files, and both times the
# script silently stopped there. aws s3 sync is idempotent/incremental, so a
# retry only re-attempts what's still missing/different -- 3 attempts with a
# short pause absorbs a one-off network blip without masking a real,
# persistent failure (the loop still exits non-zero after exhausting retries).
sync_with_retry() {
  local attempt
  for attempt in 1 2 3; do
    if aws s3 sync "$@" --endpoint-url "$ENDPOINT"; then
      return 0
    fi
    echo "sync attempt $attempt/3 failed for: $*" >&2
    if [ "$attempt" -lt 3 ]; then sleep 5; fi
  done
  echo "sync failed after 3 attempts, giving up: $*" >&2
  return 1
}

# data/ (manifest.json, timeseries/seasonal JSON, and map_styles/ -- each
# COG's boundaries/scale/colors) syncs BEFORE cogs/, not after. A COG's
# int16 encoding scale is chosen per-file at export time (dashboard_cog_
# export.py's _write_cog, sized to that file's own data range), so an old
# style JSON paired with a freshly-regenerated COG decodes every pixel by
# the WRONG scale -- confirmed live, 2026-09-29: ERA5-Land T2m's March 2026
# anomaly (a record-setting value) rendered as a completely blank map this
# way, mid-sync. Syncing data/ first means the worst case during a sync is
# the reverse pairing (new style, old COG still uploading) -- the map still
# renders, just briefly one file behind, never broken.
#
# R2's raw pub-*.r2.dev endpoint doesn't compress responses even when the
# client asks for it (confirmed via QA audit, 2026-09: manifest.json alone
# is 444KB uncompressed vs. 39KB gzipped, a 91% reduction, and every one of
# this dashboard's pages fetches it on load). aws s3 sync can't gzip on the
# fly and set Content-Encoding per file, so gzip into a scratch mirror with
# the exact same relative paths first, then sync THAT -- the URL path a
# browser requests (data/manifest.json) doesn't change, only the bytes and
# headers served from it do; browsers that sent Accept-Encoding: gzip (every
# real browser) decompress transparently.
GZIP_STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$GZIP_STAGING_DIR"' EXIT
(cd "$REPO_DIR/data" && find . -type f \( -name "*.json" -o -name "*.geojson" \) -print0) \
  | while IFS= read -r -d "" rel; do
      mkdir -p "$GZIP_STAGING_DIR/$(dirname "$rel")"
      gzip -c "$REPO_DIR/data/$rel" > "$GZIP_STAGING_DIR/$rel"
    done

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$GZIP_STAGING_DIR/" "s3://$R2_BUCKET/data/" \
  --content-type "application/json" \
  --content-encoding "gzip"
echo "synced $REPO_DIR/data/ -> s3://$R2_BUCKET/data/ (gzip-encoded)"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$REPO_DIR/cogs/" "s3://$R2_BUCKET/cogs/" \
  --content-type "image/tiff"
echo "synced $REPO_DIR/cogs/ -> s3://$R2_BUCKET/cogs/"

# gallery.html/js/gallery.js read figures/maps/ and figures/heatmaps/
# directly (see the comment above) -- this sync call was never actually
# added when that page was built, so every image on it has been 404ing
# against R2 since (Dylan, 2026-09-28). figures/synthesis/ is deliberately
# excluded, per the comment above: no manifest curates it, so nothing reads it.
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$REPO_DIR/figures/maps/" "s3://$R2_BUCKET/figures/maps/" \
  --content-type "image/png"
echo "synced $REPO_DIR/figures/maps/ -> s3://$R2_BUCKET/figures/maps/"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$REPO_DIR/figures/heatmaps/" "s3://$R2_BUCKET/figures/heatmaps/" \
  --content-type "image/png"
echo "synced $REPO_DIR/figures/heatmaps/ -> s3://$R2_BUCKET/figures/heatmaps/"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$REPO_DIR/figures/timeseries/" "s3://$R2_BUCKET/figures/timeseries/" \
  --content-type "image/png"
echo "synced $REPO_DIR/figures/timeseries/ -> s3://$R2_BUCKET/figures/timeseries/"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
sync_with_retry "$REPO_DIR/figures/seasonal/" "s3://$R2_BUCKET/figures/seasonal/" \
  --content-type "image/png"
echo "synced $REPO_DIR/figures/seasonal/ -> s3://$R2_BUCKET/figures/seasonal/"
