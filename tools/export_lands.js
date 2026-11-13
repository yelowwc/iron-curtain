// Step 1 of the province build: every game country's land as GeoJSON (lon/lat), straight from
// the atlas and the hand-drawn rings in data.js. build_provinces.py cuts these into provinces.
// usage: node tools/export_lands.js OUT.json
global.window = global;
const topojson = require('./node_modules/topojson-client');
require('../lib/world.js'); require('../data.js');
const D = window.DATA, fs = require('fs');
const idMap = {}, nameMap = {};
D.COUNTRIES.forEach(c => { c.ids.forEach(i => idMap[i] = c.key); (c.names || []).forEach(n => nameMap[n] = c.key); });
const fc = topojson.feature(WORLD, WORLD.objects.countries);
const out = { lands: [], customs: [], names: {} };
D.COUNTRIES.forEach(d => out.names[d.key] = d.name);
out.cities = D.CITIES.map(c => ({ key: c.key, name: c.name, lon: c.lon, lat: c.lat, cap: !!c.cap || (D.CAPITALS || []).some(x => x.key === c.key && x.name === c.name) }));
for (const f of fc.features) {
  if (f.id === '010') continue;                                   // no Antarctica
  out.lands.push({ key: idMap[+f.id] || nameMap[f.properties.name] || null, name: f.properties.name, geometry: f.geometry });
}
for (const d of D.COUNTRIES) if (d.custom) out.customs.push({ key: d.key, clip: d.clip || null, ring: D.RINGS[typeof d.custom === 'string' ? d.custom : d.key] });
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('lands', out.lands.length, 'customs', out.customs.length);
