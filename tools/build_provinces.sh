#!/bin/sh
# Rebuild the provinces: lib/provinces.js (map topology) + provinces.js (table).
# Needs python with shapely, and Natural Earth 10m admin-1 (the copy from the world-sim project).
# Takes ~3 minutes. Re-run after changing a country's ids/names or a hand-drawn ring in data.js.
set -e
cd "$(dirname "$0")/.."
ADMIN1="${ADMIN1:-C:/Users/kir/Documents/world-sim/scripts/data/ne_10m_admin_1_states_provinces.geojson}"
TMP="${TMPDIR:-/tmp}/cw_prov"; mkdir -p "$TMP"
node tools/export_lands.js "$TMP/lands.json"
python tools/build_provinces.py "$TMP/lands.json" "$ADMIN1" "$TMP/feats.json" "$TMP/meta.json" 55000
node tools/topo_provinces.js "$TMP/feats.json" "$TMP/meta.json" "${MINW:-0.05}"
