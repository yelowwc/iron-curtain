// Iron Curtain Lite - the screen: map, side panel, pop-ups.
(function () {
  const D = window.DATA, GAME = window.GAME, NEIGHBOURS = window.NEIGHBOURS || {};
  const SAVE = 'iron-curtain-lite-3';
  let g = null, sel = null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ================= the map =================
  const W = 1000, H = 520, svg = d3.select('#map'), root = svg.append('g');
  svg.append('defs').append('pattern').attr('id', 'colony').attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
    .call(p => { p.append('rect').attr('width', 5).attr('height', 5).attr('fill', '#33372f'); p.append('rect').attr('width', 2.2).attr('height', 5).attr('fill', '#4a4d43'); });

  // The map is drawn from provinces (lib/provinces.js). Every land, hand-drawn ones like East Germany
  // included, is a set of real provinces; x.key is who holds the province right now (a treaty or a
  // truce can hand provinces over), x.home the country it belongs to.
  const PT = window.PROVTOPO;
  const geoms = PT.objects.provinces.geometries;
  geoms.forEach(x => { x.pid = +x.id; x.home = D.BY_KEY[x.properties.key] ? x.properties.key : null; x.key = x.home; });
  const shapes = topojson.feature(PT, PT.objects.provinces).features;
  shapes.forEach((f, i) => { f.pid = geoms[i].pid; f.home = geoms[i].home; f.key = f.home; });
  const customs = [], customOf = {};
  const parentOf = () => null, childrenOf = () => [];
  const geomsOf = k => geoms.filter(x => x.key === k);
  const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: shapes });
  const path = d3.geoPath(proj);
  const defs0 = svg.select('defs');
  const clipUrl = () => null;
  root.append('path').datum({ type: 'Sphere' }).attr('fill', 'var(--sea)').attr('d', path);
  const lands = root.append('g').selectAll('path').data(shapes).join('path')
    .attr('class', f => 'land' + (f.home ? ' click' : '')).attr('d', path).attr('fill', '#2a2e2c')
    .on('mousemove', (e, f) => hover(e, f)).on('mouseleave', () => hover())
    .on('click', (e, f) => { if (f.key) select(GAME.stateOf(g, f.key)); })
    .on('dblclick', (e, f) => { if (f.key) selectRegion(f.key); });                 // double click: that region
  // who holds each province: follows the cuts; every outline cache is thrown away when it changes
  let holdSig = '';
  function syncHolders() {
    const sig = g ? (g.cuts || []).map(k => k.land + k.taker + (k.ids || []).join('.')).join(',') : '';
    if (sig === holdSig) return; holdSig = sig;
    for (let i = 0; i < geoms.length; i++) { const k = g ? GAME.holderOf(g, geoms[i].pid) : geoms[i].home; geoms[i].key = k; shapes[i].key = k; }
    for (const c of [outline, stateCache, landsCache, regionCache, fieldCache]) for (const k in c) delete c[k];
    borderKey = null;
  }
  // borders between states (a region inside its country has none), coasts, and faint province lines
  const O = PT.objects.provinces;
  root.append('path').attr('class', 'coast').attr('d', path(topojson.mesh(PT, O, (a, b) => a === b)));
  const provPath = root.append('path').attr('class', 'provline');
  const borderPath = root.append('path').attr('class', 'border');
  let borderKey = null;
  // borders between states: annexed land shares its owner's state, so the line between them goes
  function drawBorders() {
    syncHolders();
    const st = k => (g && k ? GAME.stateOf(g, k) : k);
    const key = (g ? D.COUNTRIES.map(d => g.c[d.key].owner || '').join(',') : '') + '|' + holdSig;
    if (key === borderKey) return; borderKey = key;
    borderPath.attr('d', path(topojson.mesh(PT, O, (a, b) => a !== b && st(a.key) !== st(b.key))));
    provPath.attr('d', path(topojson.mesh(PT, O, (a, b) => a !== b && a.key && a.key === b.key)));
  }
  drawBorders();
  const hoverLine = root.append('path').attr('class', 'hover'), selLine = root.append('path').attr('class', 'selected');
  const defs = svg.select('defs');
  defs.append('marker').attr('id', 'arrowhead').attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5).attr('markerWidth', 4).attr('markerHeight', 4)
    .attr('orient', 'auto').append('path').attr('d', 'M0,0 L10,5 L0,10 z').attr('fill', '#ffa040');
  defs.append('pattern').attr('id', 'occupied').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(-45)')
    .append('rect').attr('width', 2).attr('height', 6).attr('fill', 'rgba(0,0,0,.45)');
  const fronts = root.append('g'), arrows = root.append('g');
  const wars = root.append('g'), towns = root.append('g'), capitals = root.append('g'), labels = root.append('g'), cityLabels = root.append('g');

  // outlines are merged from the provinces each state or land holds right now
  const stateCache = {}, landsCache = {}, regionCache = {}, outline = {};
  const mergeD = gs => gs.length ? path(topojson.merge(PT, gs)) || '' : '';
  function paintLand(ctx, key, colour) { ctx.save(); ctx.fillStyle = colour; ctx.fill(new Path2D(outlineOf(key))); ctx.restore(); }
  const boundsOf = key => path.bounds(topojson.merge(PT, geomsOf(key)));
  function stateOutline(key) {
    if (!g || !key || !g.c[key]) return outlineOf(key);
    syncHolders();
    const sig = D.COUNTRIES.map(d => g.c[d.key].owner || '').join(',');
    if (stateCache[key] && stateCache[key].sig === sig) return stateCache[key].d;
    const d = mergeD(geoms.filter(x => x.key && GAME.stateOf(g, x.key) === key));
    stateCache[key] = { sig, d };
    return d;
  }
  function landsOutline(keys) { const id = keys.join('+'); return landsCache[id] !== undefined ? landsCache[id] : (landsCache[id] = mergeD(geoms.filter(x => keys.includes(x.key)))); }
  function outlineOf(key) { return outline[key] !== undefined ? outline[key] : (outline[key] = mergeD(geomsOf(key))); }
  const regionOutline = outlineOf;
  // ---- war fronts ----
  // For a war, every point of the land gets its distance from where the attack comes from: the border with
  // the attacker (or the nearest coast, for a war over the sea). The front at depth t is where that distance
  // equals t times the land's size, so the occupied area grows from the border inward, like on a real war map.
  // Rebels with no friendly neighbour do the opposite: they hold the land farthest from the capital.
  const fieldCache = {};
  // the border between a land and a set of attacking lands, as screen polylines.
  // A hand-drawn land meets its parent along its own ring, and its parent's neighbours along the parent's real border.
  function sharedBorder(land, takers) {
    const T = new Set(takers);
    const mesh = topojson.mesh(PT, O, (a, b) => a !== b && ((a.key === land && T.has(b.key)) || (T.has(a.key) && b.key === land)));
    return mesh.coordinates.map(ln => ln.map(pt => proj(pt))).filter(l => l.length > 1);
  }
  // the lands a front covers: one region (a cut, a civil war) or a whole state (its own land, its regions, what it annexed)
  const looseOf = keys => keys.filter(k => customOf[k] && !keys.includes(parentOf(k)));
  const holesOf = keys => keys.flatMap(childrenOf).filter(k => !keys.includes(k));
  const plainOf = keys => keys.filter(k => !customOf[k]);
  function frontField(lands, taker) {
    const keys = (Array.isArray(lands) ? lands : [lands]).filter(k => customOf[k] || geomsOf(k).length), land = keys[0];
    const takers = taker ? [taker, ...(g ? GAME.ownedBy(g, taker) : [])] : [];
    const id = keys.join('+') + '<' + (takers.join('+') || 'rebels'); if (fieldCache[id]) return fieldCache[id];
    if (!keys.length) return null;
    // the war is fought on the part of the land where it starts: Britain's island, not the Falklands (or the reverse)
    const raw = taker ? keys.flatMap(k => sharedBorder(k, takers)) : [];
    const polys = [];
    const plain = plainOf(keys);
    if (plain.length) { const m0 = topojson.merge(PT, plain.flatMap(geomsOf)); polys.push(...(m0.type === 'Polygon' ? [m0.coordinates] : m0.coordinates)); }
    for (const k of looseOf(keys)) polys.push(customOf[k].geometry.coordinates);
    const pb = polys.map(p => path.bounds({ type: 'Polygon', coordinates: p }));
    const inBox = (b, q, e) => q[0] >= b[0][0] - e && q[0] <= b[1][0] + e && q[1] >= b[0][1] - e && q[1] <= b[1][1] + e;
    let pick = polys.map((p, i) => i).filter(i => raw.some(l => l.some(q => inBox(pb[i], q, 2))));
    if (!pick.length && polys.length > 1) {
      const target = taker ? center[taker] : center[land];
      const dist = i => { if (!target) return 0; let best = Infinity; for (const pt of polys[i][0]) { const q = proj(pt); if (q) best = Math.min(best, Math.hypot(q[0] - target[0], q[1] - target[1])); } return best; };
      const area = i => (pb[i][1][0] - pb[i][0][0]) * (pb[i][1][1] - pb[i][0][1]);
      pick = [polys.map((p, i) => i).sort((a, b) => taker ? dist(a) - dist(b) : (inBox(pb[b], target || [0, 0], 0) - inBox(pb[a], target || [0, 0], 0)) || area(b) - area(a))[0]];
    }
    const part = pick.length && pick.length < polys.length ? { type: 'MultiPolygon', coordinates: pick.map(i => polys[i]) } : null;
    const boxes = [...plain, ...looseOf(keys)].map(boundsOf), all = [[Math.min(...boxes.map(b => b[0][0])), Math.min(...boxes.map(b => b[0][1]))], [Math.max(...boxes.map(b => b[1][0])), Math.max(...boxes.map(b => b[1][1]))]];
    let [[x0, y0], [x1, y1]] = part ? path.bounds(part) : all;
    if (part) { x0 = Math.max(x0, all[0][0]); y0 = Math.max(y0, all[0][1]); x1 = Math.min(x1, all[1][0]); y1 = Math.min(y1, all[1][1]); }
    const size = Math.max(x1 - x0, y1 - y0, 2);
    let base = [], borderD = '', inward = true;
    const n = 90, m = size * 0.1, cell = (size + 2 * m) / n, gx = x0 - m, gy = y0 - m;
    const gw = Math.ceil((x1 - x0 + 2 * m) / cell) + 1, gh = Math.ceil((y1 - y0 + 2 * m) / cell) + 1;
    // a land mask at twice the grid's resolution: fast 'is this on the land' checks (carved-out regions are not this land)
    const mw = gw * 2, mh = gh * 2, mask = new Uint8Array(mw * mh);
    { const cv = document.createElement('canvas'); cv.width = mw; cv.height = mh; const ctx = cv.getContext('2d');
      ctx.setTransform(2 / cell, 0, 0, 2 / cell, -gx * 2 / cell + 0.5, -gy * 2 / cell + 0.5);
      for (const k of [...plain, ...looseOf(keys)]) paintLand(ctx, k, '#fff');
      ctx.globalCompositeOperation = 'destination-out'; for (const k of holesOf(keys)) paintLand(ctx, k, '#000');
      if (part) { ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#fff'; ctx.fill(new Path2D(path(part))); }
      const px = ctx.getImageData(0, 0, mw, mh).data; for (let k = 0; k < mask.length; k++) mask[k] = px[k * 4 + 3] > 110 ? 1 : 0; }
    const onLand = pt => { const i = Math.round((pt[0] - gx) * 2 / cell), j = Math.round((pt[1] - gy) * 2 / cell); return i >= 0 && j >= 0 && i < mw && j < mh && mask[j * mw + i] === 1; };
    const near = pt => { const e = cell * 1.2; return onLand(pt) || onLand([pt[0] + e, pt[1]]) || onLand([pt[0] - e, pt[1]]) || onLand([pt[0], pt[1] + e]) || onLand([pt[0], pt[1] - e]); };
    if (taker) {
      const lines = raw.map(l => l.filter(near)).filter(l => l.length > 1);
      for (const l of lines) base.push(...l);
      borderD = lines.map(l => d3.line()(l)).join('');
    }
    if (taker && !base.length) {                          // no land border: start from the coast nearest the attacker
      const target = center[taker] || [(x0 + x1) / 2, (y0 + y1) / 2];
      for (let j = 1; j < mh - 1; j++) for (let i = 1; i < mw - 1; i++) {
        const k = j * mw + i;
        if (mask[k] && (!mask[k - 1] || !mask[k + 1] || !mask[k - mw] || !mask[k + mw])) base.push([gx + (i - 0.5) * cell / 2, gy + (j - 0.5) * cell / 2]);
      }
      if (!base.length) base = [[(x0 + x1) / 2, (y0 + y1) / 2]];
      base.sort((p, q) => Math.hypot(p[0] - target[0], p[1] - target[1]) - Math.hypot(q[0] - target[0], q[1] - target[1]));
      base = base.slice(0, 3);
    }
    if (!taker) { base = [center[land] || [(x0 + x1) / 2, (y0 + y1) / 2]]; inward = false; }   // rebels: away from the capital
    const seed = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0), rnd = k => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    const heart = center[land] || [(x0 + x1) / 2, (y0 + y1) / 2];
    const thrusts = inward ? [0, 1, 2].slice(0, 1 + Math.floor(rnd(1) * 3)).map(k => {
      const T = base[Math.floor((0.15 + 0.7 * rnd(k + 2)) * (base.length - 1))] || heart, L = Math.hypot(heart[0] - T[0], heart[1] - T[1]) || 1;
      return { T, ax: (heart[0] - T[0]) / L, ay: (heart[1] - T[1]) / L, k: 0.35 + 0.4 * rnd(k + 7), w: size * (0.07 + 0.06 * rnd(k + 11)) };
    }) : [];
    const grid = new Float64Array(gw * gh);
    let far = 0, farBox = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = gx + i * cell, y = gy + j * cell;
      let best = Infinity;
      for (const q of base) { const d2 = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d2 < best) best = d2; }
      let gain = 1 + 0.12 * Math.sin(x / size * 9 + seed) * Math.cos(y / size * 7);            // a gentle wobble
      for (const th of thrusts) {                                                                // spearheads reach further
        const dx = x - th.T[0], dy = y - th.T[1], along = dx * th.ax + dy * th.ay, across = dx * th.ay - dy * th.ax;
        if (along > 0) gain += th.k * Math.exp(-(across * across) / (2 * th.w * th.w)) * Math.min(1, along / th.w);
      }
      const v = Math.sqrt(best) / gain;
      grid[j * gw + i] = inward ? -v : v;
      if (onLand([x, y])) far = Math.max(far, v); else if (x >= x0 && x <= x1 && y >= y0 && y <= y1) farBox = Math.max(farBox, v);
    }
    if (!far) far = farBox;
    const ring = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
    const levelOf = t => inward ? -Math.max(size * 0.03, far * Math.min(1, t) * 1.05) : far * (1 - Math.min(1, t)) * 0.98;
    const valAt = pt => { const i = Math.round((pt[0] - gx) / cell), j = Math.round((pt[1] - gy) / cell); return grid[clampI(j, gh) * gw + clampI(i, gw)]; };
    // is this point on the occupied side of the front at depth t?
    const held = (pt, t) => inward ? valAt(pt) >= levelOf(t) : valAt(pt) >= levelOf(t);
    // the front line proper: zone outline points well inside the land (not the coast or the old border)
    const onFront = q => { const e = cell * 0.9; return onLand(q) && onLand([q[0] + e, q[1]]) && onLand([q[0] - e, q[1]]) && onLand([q[0], q[1] + e]) && onLand([q[0], q[1] - e]); };
    // where a spearhead's tip is on a front line: the point of the line farthest along the spearhead, near its axis, on the land
    const tipOn = (th, res) => {
      const band = Math.max(th.w * 1.6, size * 0.12);
      let best = null, bestAlong = -Infinity;
      for (const r of res.rings) for (const q of r) {
        if (!onFront(q)) continue;
        const dx = q[0] - th.T[0], dy = q[1] - th.T[1], along = dx * th.ax + dy * th.ay, across = Math.abs(dx * th.ay - dy * th.ax);
        if (across < band && along > bestAlong) { bestAlong = along; best = q; }
      }
      return best;                                       // null: this spearhead has no front left (it reached the sea)
    };
    const at = t => {
      t = Math.min(1, t);
      const level = levelOf(t);
      const cont = d3.contours().size([gw, gh]).thresholds([level])(grid)[0];
      const rings = cont.coordinates.flatMap(poly => poly.filter(r => r.length > 3).map(r => r.map(q => [gx + q[0] * cell, gy + q[1] * cell])));
      return { d: rings.map(r => ring(r)).join(''), rings };
    };
    // is a screen point inside this land? (only the front line on real land gets soldiers)

    // how deep the front must go to reach a point (for capitals)
    const depthAt = pt => {
      if (!onLand(pt)) return 2;                                         // not on this part of the land (a capital on another island)
      const i = Math.round((pt[0] - gx) / cell), j = Math.round((pt[1] - gy) / cell); const v = Math.abs(grid[clampI(j, gh) * gw + clampI(i, gw)]); return far ? v / far : 0;
    };
    return (fieldCache[id] = { at, borderD, depthAt, inside: onLand, heart, held, tipOn, onFront, thrusts, size });
  }
  const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));
  const center = {};
  for (const c of D.COUNTRIES) {
    const cap = D.CAPITALS.find(x => x.key === c.key);
    center[c.key] = c.at ? proj(c.at) : cap ? proj([cap.lon, cap.lat]) : null;
  }

  let zoomK = 1;
  const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
    .on('zoom', e => { root.attr('transform', e.transform); zoomK = e.transform.k; drawLabels(); fronts.selectAll('.usize').attr('transform', `scale(${1 / Math.sqrt(zoomK)})`); rescale(); })
    .on('end', () => drawCities());                                     // city names are sorted out once the zoom stops
  svg.call(zoom).on('dblclick.zoom', null);
  // hatching and capital dots keep their size on screen at any zoom
  function rescale() {
    const k = 1 / zoomK;
    defs.select('#colony').attr('patternTransform', `rotate(45) scale(${k})`);
    defs.select('#occupied').attr('patternTransform', `rotate(-45) scale(${k})`);
    capitals.selectAll('circle').attr('r', function () { return (this.classList.contains('fallen') ? 2.6 : 1.6) * Math.pow(k, 0.75); });
    towns.selectAll('circle').attr('r', 1.1 * Math.pow(k, 0.75));
    cityLabels.selectAll('text').style('font-size', 5.5 * k + 'px').style('stroke-width', 1.6 * k + 'px').attr('dx', 2.6 * k).attr('dy', 1.9 * k);
  }
  // towns appear as you zoom in (2.6x); names of capitals from 2x, of towns with their dots. Names that would overlap are left out.
  const cityXY = {}; D.CITIES.forEach(c => cityXY[c.key + c.name] = proj([c.lon, c.lat]));
  function drawCities() {
    if (!g) return;
    const isCapital = c => c.cap && !g.c[c.key].owner;                  // a region's capital is just a town once its country holds it
    const shownTowns = zoomK >= 2.6 ? D.CITIES.filter(c => !isCapital(c)) : [];
    towns.selectAll('circle').data(shownTowns, c => c.key + c.name).join('circle').attr('class', 'town')
      .attr('cx', c => cityXY[c.key + c.name][0]).attr('cy', c => cityXY[c.key + c.name][1]).attr('r', 1.1 * Math.pow(1 / zoomK, 0.75));
    // country names come first: city names keep clear of them
    const boxes = labelled().map(labelBox);
    const cand = [...(zoomK >= 2 ? D.CITIES.filter(isCapital) : []), ...shownTowns], named = [];
    for (const c of cand) {
      const [x, y] = cityXY[c.key + c.name], w = c.name.length * 3.1 + 4, b = [x * zoomK, y * zoomK - 4, x * zoomK + w, y * zoomK + 4];
      if (boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b); named.push(c);
    }
    cityLabels.selectAll('text').data(named, c => c.key + c.name).join('text').attr('class', c => 'city' + (isCapital(c) ? ' cap' : ''))
      .attr('x', c => cityXY[c.key + c.name][0]).attr('y', c => cityXY[c.key + c.name][1]).text(c => c.name);
    rescale();
  }

  // Every country has its own colour, like a political atlas: classic colours for the big players,
  // a clean palette for everyone else, never the same as a neighbour (greedy colouring, done once).
  // Land a country holds takes its colour; colonies are hatched.
  const NAT_PAL = ['#5b8fc9', '#6aa35a', '#d6a23c', '#b75b5b', '#8b6fb8', '#3f9c95', '#d07a3a', '#a7a33f', '#c46b9a', '#4f7c4a', '#8f5a3c', '#5f6fb0',
    '#b8913a', '#4a9bc0', '#9a4d6e', '#77a07d'];
  const natColour = { USA: '#3a6fc4', SUN: '#b8281f', GBR: '#c8505f', FRA: '#4a76c0', FRG: '#8a8a82', GDR: '#a0605a', ITA: '#4f9a54', ESP: '#d9b23c',
    PRT: '#3e8a5e', CHN: '#e0b43c', TWN: '#4f78c0', JPN: '#e6dcc4', IND: '#e38b3a', PAK: '#3d8a4f', TUR: '#7aa36b', IRN: '#4fa38c', IRQ: '#c9a46b',
    EGY: '#d8c27a', SAU: '#4a8a4a', ISR: '#6d9bd6', BRA: '#5aa05a', ARG: '#86b8dd', MEX: '#5f9e6e', CAN: '#c45c5c', AUS: '#4c8a6e', POL: '#d36f8c',
    YUG: '#5d7fa8', SWE: '#4d79b0', NOR: '#a85454', FIN: '#dfe5ea', CSK: '#5b7fb5', HUN: '#7da05a', ROU: '#d4b85a', BGR: '#6aa37a', GRC: '#6fa8d8',
    KOR: '#7aa0d0', PRK: '#a33b3b', VNM: '#d34a3a', IDN: '#b5523b', ZAF: '#6f9a5a', NGA: '#4f9a5a', ETH: '#7fa34a', CUB: '#2f5fa8', MNG: '#8f5aa8' };
  D.COUNTRIES.slice().sort((a, b) => b.val - a.val || a.key.localeCompare(b.key)).forEach(d => {
    if (natColour[d.key]) return;
    const used = new Set((NEIGHBOURS[d.key] || []).map(k => natColour[k]).filter(Boolean));
    natColour[d.key] = NAT_PAL.find(c => !used.has(c)) || NAT_PAL[d.key.charCodeAt(0) % NAT_PAL.length];
  });
  // map modes: Nations (default), Alliances, Relations (to you), Military, Government, Stability
  let mapMode = 'nat';
  const GOV_COL = { Democracy: '#4f9fd6', Republic: '#8fb3a0', Monarchy: '#9b7fd0', Dictatorship: '#a0703c', Junta: '#7d8a3a', Socialist: '#d04a3a',
    Revolutionary: '#f08a3c', 'Islamic Republic': '#2f9e5b', Theocracy: '#d9a441', 'Minority rule': '#c9a227' };
  const STAB_COL = ['#555', '#b3261e', '#e07a3c', '#e8c45a', '#9cc36b', '#3e9e5b'];
  const govOf = key => GAME.isHome(key) ? (key === 'USA' ? 'Democracy' : 'Socialist') : g.c[key].gov;
  function mainPact(key) { const ps = GAME.pactsOf(g, key); return ps.length ? ps.slice().sort((a, b) => b.members.length - a.members.length)[0] : null; }
  function relColour(key) {
    const me = GAME.playerKey(g);
    if (key === me) return '#e8c45a';
    const w = GAME.warOf(g, me); if (w && (w.att === key || w.def === key)) return '#e0362b';
    if (GAME.allied(g, me, key)) return '#2e9e6b';
    const mine = g.nation ? g.c[g.nation].a : GAME.SIDE[g.side] * 100, their = GAME.isHome(key) ? GAME.SIDE[key === 'USA' ? 'US' : 'SU'] * 100 : g.c[key].a, d = Math.abs(their - mine);
    if (d <= 20) return '#7cc36b';
    return d3.interpolateLab('#8a8a80', '#7a2a24')(Math.min(1, (d - 20) / 100));
  }
  function colour(key) {
    if (!key || !g) return '#2a2e2c';
    if (g.c[key] && g.c[key].owner) return colour(g.c[key].owner);
    if (!GAME.isHome(key) && !g.c[key].independent) return 'url(#colony)';
    if (mapMode === 'pact') { const p = mainPact(key); return p ? p.color : '#41453f'; }
    if (mapMode === 'rel') return relColour(key);
    if (mapMode === 'mil') return d3.interpolateYlOrRd(0.08 + Math.min(1, g.c[key].army / (GAME.isHome(key) ? 50 : 24)) * 0.85);
    if (mapMode === 'gov') return GOV_COL[govOf(key)] || '#777';
    if (mapMode === 'stab') return STAB_COL[g.c[key].stab] || '#777';
    return natColour[key] || '#8d8873';
  }
  function legendHtml() {
    const sw = (c, t) => `<span><i style="background:${c}"></i>${t}</span>`;
    switch (mapMode) {
      case 'pact': return g.pacts.map(p => sw(p.color, esc(p.name))).join('') || '<span>No alliances yet</span>';
      case 'rel': return sw('#e8c45a', 'You') + sw('#2e9e6b', 'Allies') + sw('#7cc36b', 'Friends') + sw('#8a8a80', 'Indifferent') + sw('#7a2a24', 'Hostile') + sw('#e0362b', 'At war with you');
      case 'mil': return sw('#fff3b0', 'Small army') + sw('#f08a3c', '') + sw('#bd0026', 'Big army');
      case 'gov': { const seen = new Set(D.COUNTRIES.filter(d => !g.c[d.key].owner && (g.c[d.key].independent || GAME.isHome(d.key))).map(d => govOf(d.key))); return [...seen].filter(x => GOV_COL[x]).map(x => sw(GOV_COL[x], x)).join(''); }
      case 'stab': return [1, 2, 3, 4, 5].map(i => sw(STAB_COL[i], ['', 'Chaotic', 'Shaky', 'Steady', 'Stable', 'Rock solid'][i])).join('');
    }
    return '';
  }
  function setMode(m) { mapMode = m; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); if (g) drawMap(); }
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  const campColour = { US: '#3d7fd6', SU: '#d23b30' };
  // occupied land must stand out from the land it sits on: if the two colours are close, use a deeper shade
  function zoneColour(fill, under) {
    const a = d3.color(String(fill).startsWith('url') ? '#6b6a5a' : fill), b = d3.color(String(under).startsWith('url') ? '#3a3d35' : under);
    if (!a) return '#777777';
    if (!b) return a.formatHex();
    const la = d3.lab(a), lb = d3.lab(b), dist = Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b);
    if (dist >= 28) return a.formatHex();
    const out = d3.lab(la.l, la.a, la.b);
    out.l = la.l >= lb.l ? Math.min(90, lb.l + 20) : Math.max(20, lb.l - 22);              // move away from the land beneath
    const ch = Math.hypot(la.a, la.b);
    if (ch > 4) { const k = Math.min(2.2, (ch + 14) / ch); out.a = la.a * k; out.b = la.b * k; }   // and a little more colourful
    return out.formatHex();
  }
  // a tapered, slightly curved war-map arrow from a to b
  function fatArrow(a, b, w) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < w * 1.5) return null;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, head = Math.min(L * 0.45, w * 2.4), hw = w * 1.3;
    const bx = b[0] - ux * head, by = b[1] - uy * head, bend = L * 0.07;
    const mx = (a[0] + bx) / 2 + nx * bend, my = (a[1] + by) / 2 + ny * bend;
    const p = (x, y) => x.toFixed(2) + ',' + y.toFixed(2);
    return `M${p(a[0] + nx * w * 0.2, a[1] + ny * w * 0.2)}Q${p(mx + nx * w * 0.55, my + ny * w * 0.55)} ${p(bx + nx * w * 0.5, by + ny * w * 0.5)}`
      + `L${p(bx + nx * hw, by + ny * hw)}L${p(b[0], b[1])}L${p(bx - nx * hw, by - ny * hw)}L${p(bx - nx * w * 0.5, by - ny * w * 0.5)}`
      + `Q${p(mx - nx * w * 0.55, my - ny * w * 0.55)} ${p(a[0] - nx * w * 0.2, a[1] - ny * w * 0.2)}Z`;
  }
  // counters evenly spaced along the front line (only where it runs over land), in facing pairs
  function frontUnits(f, res, depth, z, attCol) {
    const segs = [];
    for (const r of res.rings) {
      let cur = [];
      for (let i = 0; i <= r.length; i++) {
        const q = r[i % r.length];
        if (f.onFront(q)) cur.push(q); else { if (cur.length > 1) segs.push(cur); cur = []; }
      }
      if (cur.length > 1) segs.push(cur);
    }
    const lens = segs.map(sg => { let L = 0; for (let i = 1; i < sg.length; i++) L += Math.hypot(sg[i][0] - sg[i - 1][0], sg[i][1] - sg[i - 1][1]); return L; });
    const total = lens.reduce((a, b) => a + b, 0);
    if (!total) return [];
    const nA = Math.max(1, Math.min(6, Math.round(!z.taker ? 3 : GAME.isHome(z.taker) ? 6 : g.c[z.taker].army / 3)));
    const nD = Math.max(1, Math.min(6, Math.round((GAME.isHome(z.state) ? 30 : g.c[z.state].army) / 3)));
    const n = Math.max(nA, nD);
    const pointAt = s => {                                   // point and direction at arc length s
      for (let k = 0; k < segs.length; k++) {
        if (s > lens[k]) { s -= lens[k]; continue; }
        const sg = segs[k];
        for (let i = 1; i < sg.length; i++) {
          const L = Math.hypot(sg[i][0] - sg[i - 1][0], sg[i][1] - sg[i - 1][1]);
          if (s <= L || i === sg.length - 1) { const u = L ? Math.min(1, s / L) : 0; return { x: sg[i - 1][0] + (sg[i][0] - sg[i - 1][0]) * u, y: sg[i - 1][1] + (sg[i][1] - sg[i - 1][1]) * u, dx: (sg[i][0] - sg[i - 1][0]) / (L || 1), dy: (sg[i][1] - sg[i - 1][1]) / (L || 1) }; }
          s -= L;
        }
      }
      return null;
    };
    const out = [], off = 4 / Math.sqrt(zoomK), defCol = colour(z.state);
    for (let i = 0; i < n; i++) {
      const p = pointAt((i + 0.5) / n * total); if (!p) continue;
      let nx = -p.dy, ny = p.dx;
      if (!f.held([p.x + nx * off, p.y + ny * off], depth)) { nx = -nx; ny = -ny; }        // normal pointing into the held zone
      if (i < nA) out.push({ id: 'a' + i, x: p.x + nx * off, y: p.y + ny * off, col: attCol });
      if (i < nD) out.push({ id: 'd' + i, x: p.x - nx * off, y: p.y - ny * off, col: defCol });
    }
    return out;
  }
  // each zone's animation: where its front is drawn now (cur) and where it is rolling to (target)
  const anim = {}, timers = {}, ROLL = 2000;
  let busyUntil = 0;                                       // pop-ups wait until the fronts have finished moving
  function drawMap() {
    drawBorders();
    $('legend-dyn').innerHTML = legendHtml();
    lands.attr('fill', f => colour(f.key)).classed('restless', f => !!(f.key && g.c[f.key] && g.c[f.key].owner && g.c[f.key].occ && g.c[f.key].occ.unrest >= 60));
    selLine.attr('d', sel ? (regionSel ? regionOutline(sel) : stateOutline(sel)) : g.nation ? stateOutline(g.nation) : null).classed('mine', !sel && !!g.nation).classed('region', !!sel && regionSel);
    // wars between countries: the winning side holds a band of the other's land along their border
    const W2 = g.wars.filter(w => center[w.att] && center[w.def]);
    // land taken in earlier wars: a real border, drawn first so wars go on top
    const zones = [];                                   // land taken in earlier wars is simply drawn as its new holder's provinces
    for (const w of W2) {
      const taker = w.front >= 0 ? w.att : w.def, state = w.front >= 0 ? w.def : w.att;
      // the fighting spreads over all the losing side's lands: its own, its regions, what it annexed (never a superpower's heartland)
      const land = GAME.landsOf(g, state).filter(k => !GAME.isHome(k));
      if (!land.length) continue;
      // a war that has just begun: a thin band over the border; after that the front from a year ago
      const prev = w.prev === undefined ? 0 : Math.sign(w.prev) === Math.sign(w.front) ? Math.abs(w.prev) / 100 : 0;
      zones.push({ id: 's' + w.id + (w.front >= 0 ? 'a' : 'd'), taker, land, state, depth: Math.max(0.05, Math.abs(w.front) / 100), prev, fill: colour(taker),
        capital: w.capFell && w.capFell[w.front >= 0 ? 'def' : 'att'] });
    }
    // civil wars: the rebels advance from a friendly neighbour's border, or hold the land far from the capital
    for (const d of D.COUNTRIES) {
      const w = g.c[d.key].war; if (!w || !center[d.key]) continue;
      const share = (GAME.SIDE[w.rebels] * w.balance + 100) / 200; if (share < 0.04) continue;
      const friend = (NEIGHBOURS[d.key] || []).find(n => n === GAME.HOME[w.rebels] || (g.c[n] && !GAME.isHome(n) && g.c[n].independent && g.c[n].a * GAME.SIDE[w.rebels] >= 30));
      zones.push({ id: 'c' + d.key, taker: friend || null, land: d.key, state: d.key, depth: share * 0.9, prev: 0, fill: (GAME.REBELS[w.ideo] || {}).color || campColour[w.rebels], civil: true });
    }
    const zg = fronts.selectAll('g.zone').data(zones, z => z.id);
    // a side that is driven out (or a war that ends) rolls back to its border before it goes
    zg.exit().each(function (z) {
      if (timers[z.id]) timers[z.id].stop();
      const A = anim[z.id], el = d3.select(this), f = frontField(z.land, z.taker); delete anim[z.id];
      const becomesBorder = (g.cuts || []).some(k => (Array.isArray(z.land) ? z.land.includes(k.land) : k.land === z.land) && k.taker === z.taker);
      if (!A || !f || z.cut || becomesBorder || window.NO_ANIM) return el.remove();
      el.attr('class', 'zonegone'); el.select('.units').remove(); el.select('.thrusts').remove();
      busyUntil = Math.max(busyUntil, performance.now() + ROLL * 0.6);
      const tm = d3.timer(t => {
        const u = Math.min(1, t / (ROLL * 0.6)), res = f.at(Math.max(0.001, A.cur * (1 - d3.easeCubicInOut(u))));
        el.selectAll('.zonefill,.zonehatch,.zoneline,.zoneglow').attr('d', res.d);
        el.select('#zclip-' + z.id + ' path').attr('d', res.d);
        if (u >= 1) { tm.stop(); el.remove(); }
      });
    });
    const zen = zg.enter().append('g').attr('class', 'zone');
    // the zone stays on its own land: a mask of the land (cut to its parent if hand-drawn) minus the regions carved out of it
    const zm = zen.append('mask').attr('id', z => 'mask-' + z.id).attr('maskUnits', 'userSpaceOnUse').attr('x', -50).attr('y', -50).attr('width', W + 100).attr('height', H + 100);
    zm.append('path').attr('class', 'mland').attr('fill', '#fff');
    zm.append('path').attr('class', 'mhole').attr('fill', '#000');
    zen.append('path').attr('class', 'zonefill')
      .on('click', (e, z) => { if (z.cut) select(GAME.stateOf(g, z.taker)); })
      .on('dblclick', (e, z) => { if (z.cut) selectRegion(z.land); })
      .on('mousemove', (e, z) => { if (z.cut) hover(e, { key: z.taker }); }).on('mouseleave', () => hover());
    zen.append('path').attr('class', 'zonehatch');
    zen.append('clipPath').attr('id', z => 'zclip-' + z.id).append('path');
    zen.append('path').attr('class', 'zonecover');
    zen.append('path').attr('class', 'zoneglow');
    zen.append('path').attr('class', 'zoneline');
    zen.append('g').attr('class', 'thrusts');
    zen.append('g').attr('class', 'units');
    zen.merge(zg).order().classed('cut', z => !!z.cut).classed('civil', z => !!z.civil).each(function (z) {
      const el = d3.select(this), f = frontField(z.land, z.taker);
      if (!f) return;
      let depth = z.depth;
      const cap = D.CAPITALS.find(x => x.key === z.state);
      const capAt = z.capital && cap ? f.depthAt(proj([cap.lon, cap.lat])) : 2;
      if (capAt <= 1) depth = Math.max(depth, capAt * 1.1);                                       // a fallen capital is always inside
      const fill = z.cut ? z.fill : zoneColour(z.fill, colour(z.state));
      if (Array.isArray(z.land)) { el.select('.mland').attr('d', landsOutline(z.land)).attr('clip-path', null); el.select('.mhole').attr('d', null); }
      else {
        el.select('.mland').attr('d', outlineOf(z.land)).attr('clip-path', clipUrl(z.land));
        el.select('.mhole').attr('d', childrenOf(z.land).map(outlineOf).join('') || null).attr('clip-path', defs0.select('#pclip-' + z.land).empty() ? null : `url(#pclip-${z.land})`);
      }
      el.selectAll('.zonefill,.zonehatch,.zoneline,.zoneglow').attr('mask', `url(#mask-${z.id})`);
      el.select('.zonecover').attr('clip-path', `url(#zclip-${z.id})`).attr('stroke', fill).attr('d', z.civil ? null : f.borderD || null);
      el.select('.zonefill').attr('fill', fill);
      el.select('.zoneglow').attr('stroke', d3.color(fill).brighter(0.7));
      // offensive arrows: where the front moved this year, along the spearheads (pushed back: the defender's arrows point home)
      const prev = z.prev === undefined ? depth : z.prev, moved = depth - prev;
      const arrows = z.cut || z.civil || Math.abs(moved) < 0.04 ? [] : f.thrusts.map((th, k) => ({ k, th }));
      const arrowFill = moved < 0 ? d3.color(zoneColour(colour(z.state), fill)).brighter(0.3) : d3.color(fill).brighter(0.45);
      const aw = Math.max(1, Math.min(6, f.size * 0.05));
      const ag = el.select('.thrusts').selectAll('path').data(arrows, a => a.k);
      ag.exit().remove();
      const agm = ag.enter().append('path').attr('class', 'thrust').merge(ag).attr('fill', arrowFill);
      const prevRes = arrows.length ? f.at(Math.max(0.001, prev)) : null;
      const paint = t => {
        const res = f.at(t);
        el.selectAll('.zonefill,.zonehatch,.zoneline,.zoneglow').attr('d', res.d);
        el.select('#zclip-' + z.id + ' path').attr('d', res.d);
        agm.attr('d', a => {                                                   // from last year's line to this one
          const b = f.tipOn(a.th, res); if (!b) return null;
          let s0 = prev < 0.01 ? a.th.T : f.tipOn(a.th, prevRes) || b;
          const L = Math.hypot(b[0] - s0[0], b[1] - s0[1]), min = f.size * 0.14;
          if (L < min) { const ux = L ? (b[0] - s0[0]) / L : a.th.ax * Math.sign(moved), uy = L ? (b[1] - s0[1]) / L : a.th.ay * Math.sign(moved); s0 = [b[0] - ux * min, b[1] - uy * min]; }
          return fatArrow(s0, b, aw);
        });
        return res;
      };
      // roll smoothly from where the front is drawn now to this year's line. A redraw while it rolls
      // (a click, an event) lets the roll go on; a new target makes it turn from where it is.
      const A = anim[z.id], fin = f.at(depth);
      if (!(A && A.running && Math.abs(A.target - depth) < 0.001)) {
        const from = A ? A.cur : prev;
        if (timers[z.id]) timers[z.id].stop();
        const st = anim[z.id] = { cur: from, target: depth, running: false };
        if (Math.abs(from - depth) < 0.005 || window.NO_ANIM) { st.cur = depth; paint(depth); }
        else {
          st.running = true; busyUntil = Math.max(busyUntil, performance.now() + ROLL);
          paint(from);
          timers[z.id] = d3.timer(t => {
            const u = Math.min(1, t / ROLL);
            st.cur = from + (depth - from) * d3.easeCubicInOut(u);
            paint(st.cur);
            if (u >= 1) { st.running = false; timers[z.id].stop(); }
          });
        }
      }
      // army counters stand in two lines along the front: the side holding the zone behind it, the other in front
      const units = z.cut ? [] : frontUnits(f, fin, depth, z, fill);
      const us = el.select('.units').selectAll('g.unit').data(units, u => u.id);
      us.exit().remove();
      const ue = us.enter().append('g').attr('class', 'unit').attr('transform', u => `translate(${u.x},${u.y})`).style('opacity', window.NO_ANIM ? 1 : 0);
      const inner = ue.append('g').attr('class', 'usize');
      inner.append('rect').attr('x', -3.4).attr('y', -2.3).attr('width', 6.8).attr('height', 4.6);
      inner.append('path').attr('d', 'M-3.4,-2.3L3.4,2.3M3.4,-2.3L-3.4,2.3');
      const um = ue.merge(us);
      um.select('rect').attr('fill', u => u.col);
      um.select('.usize').attr('transform', `scale(${1 / Math.sqrt(zoomK)})`);
      (window.NO_ANIM ? um : um.transition().duration(ROLL).ease(d3.easeCubicInOut)).attr('transform', u => `translate(${u.x},${u.y})`).style('opacity', 1);
    });
    arrows.selectAll('path').data(W2, w => w.id).join('path').attr('class', 'warline').attr('marker-end', 'url(#arrowhead)').attr('d', w => {
      const a = center[w.att], b = center[w.def], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      return `M${a[0]},${a[1]} Q${mx - (b[1] - a[1]) * 0.2},${my + (b[0] - a[0]) * 0.2} ${b[0]},${b[1]}`;
    });
    const atWar = D.COUNTRIES.filter(c => g.c[c.key].war && center[c.key]);
    wars.selectAll('text').data(atWar, c => c.key).join('text').attr('class', 'war').text('⚔')
      .attr('x', c => center[c.key][0]).attr('y', c => center[c.key][1] - 9);
    // capitals: a fallen one shows its conqueror's colour
    const fallenTo = {};
    for (const w of g.wars) for (const side of ['att', 'def']) if (w.capFell && w.capFell[side]) fallenTo[w[side]] = w[side === 'att' ? 'def' : 'att'];
    capitals.selectAll('circle').data(D.CAPITALS.filter(x => g.c[x.key] && !g.c[x.key].owner && (g.c[x.key].independent || GAME.isHome(x.key))), x => x.key)
      .join('circle').attr('class', x => 'capital' + (fallenTo[x.key] ? ' fallen' : '')).attr('r', x => (fallenTo[x.key] ? 2.6 : 1.6) * Math.pow(1 / zoomK, 0.75))
      .attr('fill', x => fallenTo[x.key] ? colour(fallenTo[x.key]) : null)
      .attr('cx', x => proj([x.lon, x.lat])[0]).attr('cy', x => proj([x.lon, x.lat])[1]);
    drawLabels(); drawCities();
  }
  // country names: the important ones first (the selection, superpowers, the most valuable); a name that would overlap one already placed is left out
  const labelBox = c => { const fs = 7 * Math.pow(zoomK, 0.2), [x, y] = center[c.key], w = c.name.length * fs * 0.56 + 2, yy = y * zoomK + 9 * Math.pow(zoomK, 0.2); return [x * zoomK - w / 2, yy - fs * 0.85, x * zoomK + w / 2, yy + fs * 0.25]; };
  const overlaps = (b, boxes) => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  function labelled() {
    const cand = D.COUNTRIES.filter(c => center[c.key] && !g.c[c.key].owner && (c.key === sel || c.val >= 4 || GAME.isHome(c.key) || zoomK >= 2.2 || (zoomK >= 1.5 && c.val >= 2)));
    const rank = c => (c.key === sel ? 1000 : 0) + (c.key === g.nation ? 500 : 0) + (GAME.isHome(c.key) ? 100 : 0) + GAME.valueOf(g, c.key) * 10 - c.name.length * 0.1;
    const out = [], boxes = [];
    for (const c of cand.sort((a, b) => rank(b) - rank(a))) { const b = labelBox(c); if (overlaps(b, boxes)) continue; boxes.push(b); out.push(c); }
    return out;
  }
  function drawLabels() {
    if (!g) return;
    labels.selectAll('text').data(labelled(), c => c.key).join('text').attr('class', 'label')
      .attr('x', c => center[c.key][0]).attr('y', c => center[c.key][1] + 9 / zoomK)
      .style('font-size', 7 / Math.pow(zoomK, .8) + 'px').style('stroke-width', 2 / Math.pow(zoomK, .8) + 'px').text(c => c.name);
  }
  function hover(e, f) {
    const tip = $('tip');
    if (!e || !f || !f.key || !g) { tip.hidden = true; hoverLine.attr('d', null); return; }
    const region = f.key, P = GAME.PBY[f.pid], home = f.home;
    const cut = home !== region ? (g.cuts || []).find(k => k.land === home && (k.ids || []).includes(f.pid)) : null;
    const provLine = P ? `<br><span class="prov">${esc(P.name)}${P.cap && home === region ? ' ★' : ''}</span>${cut ? `<br><span class="dim">Taken from ${esc(GAME.info(home).name)} in ${cut.year}</span>` : ''}` : '';
    f = { key: GAME.stateOf(g, f.key) };                    // show the whole state; name the region if it differs
    hoverLine.attr('d', stateOutline(f.key));
    const d = GAME.info(f.key), c = g.c[f.key];
    const ps = GAME.pactsOf(g, f.key).map(p => p.name).join(', ');
    tip.innerHTML = `<b>${esc(d.name)}${f.key === g.nation ? ' (you)' : ''}</b>${provLine}<br>${c.owner ? 'Part of ' + esc(GAME.info(c.owner).name) + (c.owner === g.nation ? ' (yours)' : '') : GAME.isHome(f.key) ? 'Superpower' : !c.independent ? 'Colony of ' + esc(d.colony) + ' until ' + d.indep : GAME.leaning(c.a) + (c.war ? ' · ⚔ civil war' : '')}
      ${c.independent || GAME.isHome(f.key) ? `<br>Army ${Math.round(c.army)}` : ''}${ps ? '<br>' + esc(ps) : ''}${GAME.warOf(g, f.key) ? '<br>⚔ at war' : ''}${GAME.lostLand(g, f.key).map(k => '<br>Lost ' + esc(GAME.provList(k.ids || [])) + ' to ' + esc(GAME.info(k.taker).name)).join('')}${region !== f.key ? '<br><i>Region: ' + esc(GAME.info(region).name) + (g.c[region].occ && !g.c[region].occ.core ? ' · unrest ' + Math.round(g.c[region].occ.unrest) : '') + '</i>' : ''}<br><span class="dim">Double-click: this region</span>`;
    tip.hidden = false;
    const r = $('mapbox').getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
  }

  // ================= top bar =================
  function topBar() {
    const t = g.tension, tc = t >= 80 ? '#ff4b3e' : t >= 55 ? '#f0a03c' : '#6fbf73';
    $('year').textContent = g.year;
    $('tension').innerHTML = `Tension <span class="bar"><i style="width:${t}%;background:${tc}"></i></span><b style="color:${tc}">${Math.round(t)}</b>`;
    $('end').disabled = !!g.over;
    $('detente').hidden = !!g.nation;
    $('finish').hidden = !!g.over || g.year <= GAME.END;
    if (g.nation) {
      const c = g.c[g.nation], sc = GAME.nationScore(g);
      $('ip').innerHTML = `Influence <b>${Math.floor(g.ip.ME)}</b> IP <span class="sub">+${GAME.nationIncome(g)}/yr</span>`;
      $('score').innerHTML = `${esc(GAME.info(g.nation).name)} · army <b>${Math.round(c.army)}</b> · score <b>${sc}</b> <span class="sub">(${sc - g.start >= 0 ? '+' : ''}${sc - g.start} since 1947)</span>`;
      return;
    }
    const me = g.side, upkeep = GAME.deployed(g, me) * GAME.UPKEEP;
    const hm = g.pw[me].home, hc = hm < 30 ? '#e0533c' : hm < 50 ? '#f0a03c' : '#6fbf73';
    $('ip').innerHTML = `Influence <b>${Math.floor(g.ip[me])}</b> IP <span class="sub">+${GAME.income(g, me) - upkeep}/yr${upkeep ? ' (troops −' + upkeep + ')' : ''}</span> · home <b style="color:${hc}">${Math.round(hm)}</b>`;
    const us = GAME.score(g, 'US'), su = GAME.score(g, 'SU'), w = Math.max(5, Math.min(95, us / Math.max(1, us + su) * 100));
    $('score').innerHTML = `<span style="color:#7fb0f0">USA <b>${us}</b></span><span class="vs"><i style="width:${w}%;background:var(--us)"></i><i style="flex:1;background:var(--su)"></i></span><span style="color:#f08a80"><b>${su}</b> USSR</span>`;
    $('detente').disabled = !!g.over || g.detenteUsed || g.ip[me] < GAME.DETENTE_COST;
  }

  // ================= side panel =================
  const pips = n => `<span class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const btn = (attr, name, cost, r, note) => `<button class="act" ${attr} ${r.ok ? '' : 'disabled'}><b>${esc(name)}</b><em>${cost} IP</em><small>${esc(r.ok ? note : r.why)}</small></button>`;
  const actor = () => g.nation ? 'ME' : g.side;
  function warBox(sw) {
    const A = GAME.info(sw.att).name, B = GAME.info(sw.def).name, f = (sw.front + 100) / 2;
    let h = `<div class="warbox"><b>⚔ War: ${esc(A)} attacked ${esc(B)}</b> <span class="sub">year ${sw.years + 1}</span>
      <div class="wsides"><span><b>${esc(A)}</b><small>army ${Math.round(g.c[sw.att].army)}</small></span><span><b>${esc(B)}</b><small>army ${Math.round(g.c[sw.def].army)}</small></span></div>
      <div class="warbar"><i style="width:${f}%;background:#e0903c"></i><i style="flex:1;background:#5aa39a"></i></div>
      <div class="wstate">${sw.front > 15 ? `${esc(A)} is advancing` : sw.front < -15 ? `${esc(A)} is pushed back` : 'Stalemate'}</div>
      ${['att', 'def'].filter(s => sw.capFell && sw.capFell[s]).map(s => `<div class="sub" style="color:#f0a03c">${esc(GAME.capitalName(sw[s]))} has fallen.</div>`).join('')}
      <div class="sub">${sw.limited ? 'A border war: after 3 years at most it ends, and at worst a strip of land changes hands.' : sw.annexOnWin ? 'A war of conquest: if the attacker wins, the country disappears into it. After 8 years: a truce.' : 'If the attacker wins, it installs a friendly government. After 8 years: a truce.'}</div>
      ${['US', 'SU'].filter(p => sw.troops[p]).map(p => `<div class="sub">${p === 'US' ? 'American' : 'Soviet'} troops fight for ${esc(GAME.info(sw[sw.troops[p]]).name)}.</div>`).join('')}</div>`;
    const mine = GAME.playerKey(g);
    if (sw.att === mine || sw.def === mine) return h + peaceTalks(sw, mine);
    h += `<h3>Take part</h3>`;
    for (const party of ['att', 'def']) for (const kind of g.nation ? ['arm'] : ['arm', 'troops']) {
      const r = GAME.warCheck(g, actor(), sw, party, kind), nm = GAME.info(sw[party]).name;
      h += btn(`data-war="${party}|${kind}"`, kind === 'arm' ? `Arm ${nm}` : `Send troops for ${nm}`, r.cost, r,
        kind === 'arm' ? 'Weapons: a push for their side this year.' : 'A big push every year. Tension rises, costs 2 IP a year, and losing hurts your score.');
    }
    return h;
  }
  // negotiating peace: tick terms, see whether they would sign
  let talkPicks = [];
  function peaceTalks(sw, mine) {
    const enemy = sw.att === mine ? sw.def : sw.att, score = Math.round(GAME.warScore(sw, sw.att === mine ? 'att' : 'def'));
    const terms = GAME.termsFor(g, mine, enemy);
    talkPicks = talkPicks.filter(id => terms.some(t => t.id === id && t.ok));
    const sign = GAME.peaceChance(g, sw, talkPicks.length ? talkPicks : ['white']);
    return `<h3>Negotiate peace</h3><div class="sub">War score ${score >= 0 ? '+' : ''}${score}. The better the war goes, and the longer it lasts, the more they accept.</div>
      <div class="terms">${terms.filter(t => t.id !== 'white').map(t => `<label class="${t.ok ? '' : 'off'}" title="${esc(t.ok ? t.help : t.why)}">
        <input type="checkbox" data-term="${t.id}" ${talkPicks.includes(t.id) ? 'checked' : ''} ${t.ok ? '' : 'disabled'}> ${esc(t.name)} <em>${t.cost}</em></label>`).join('')}</div>
      <button class="act" id="propose" ${sw.talked === g.year ? 'disabled' : ''}><b>${talkPicks.length ? 'Offer these terms' : 'Offer status quo peace'}</b><em>0 IP</em>
      <small>${sw.talked === g.year ? 'You already tried this year.' : sign ? `${esc(GAME.info(enemy).name)} will sign.` : `${esc(GAME.info(enemy).name)} will refuse.`}</small></button>`;
  }
  // one occupied territory: unrest, integration, policy and actions
  function terrCard(t) {
    const o = t.occ, uc = o.unrest >= 60 ? '#e0533c' : o.unrest >= 35 ? '#f0a03c' : '#6fbf73';
    let h = `<div class="terr"><div class="thead"><b>${esc(t.name)}</b><span class="sub">since ${t.since}${o.core ? ' · loyal' : ''}</span></div>
      <div class="meter"><small>Unrest</small><span class="bar"><i style="width:${o.unrest}%;background:${uc}"></i></span><b style="color:${uc}">${Math.round(o.unrest)}</b></div>
      <div class="meter"><small>Integration</small><span class="bar"><i style="width:${o.integ}%;background:#7fb0f0"></i></span><b>${Math.round(o.integ)}</b></div>`;
    if (o.unrest >= 60 && !o.core) h += `<div class="sub" style="color:#e0533c">Close to an uprising!</div>`;
    if (!o.core) h += `<div class="policies">${Object.keys(GAME.POLICIES).map(id => `<button class="pol ${o.policy === id ? 'on' : ''}" data-terr="${t.id}|${id}" title="${esc(GAME.POLICIES[id].help)}">${GAME.POLICIES[id].name}</button>`).join('')}</div>
      <div class="sub">${esc(GAME.POLICIES[o.policy].help)}</div>`;
    h += `<div class="tacts">${Object.keys(GAME.TERR_ACTIONS).map(id => { const A = GAME.TERR_ACTIONS[id], r = GAME.territoryCheck(g, t.id, id);
      return `<button class="act small" data-terr="${t.id}|${id}" ${r.ok ? '' : 'disabled'} title="${esc(r.ok ? A.help : r.why)}"><b>${A.name}</b><em>${A.cost} IP</em></button>`; }).join('')}</div></div>`;
    return h;
  }
  function civilBox(c) {
    const w = c.war, west = (w.balance + 100) / 2;
    return `<div class="warbox"><b>⚔ ${w.sep ? 'Uprising' : 'Civil war'}</b> <span class="sub">year ${w.years + 1} · ${w.sep ? `fighting for independence, backed by the ${w.rebels === 'SU' ? 'East' : 'West'}` : (GAME.REBELS[w.ideo] ? GAME.REBELS[w.ideo].name.toLowerCase() + ', backed by the ' + (w.rebels === 'SU' ? 'East' : 'West') : w.rebels === 'SU' ? 'communist rebels' : 'anti-communist rebels')}</span>
      <div class="warbar"><i style="width:${100 - west}%;background:var(--su)"></i><i style="flex:1;background:var(--us)"></i></div>
      <div class="ends"><span>pro-Soviet</span><span>${w.balance > 0 ? 'West winning' : w.balance < 0 ? 'East winning' : 'even'}</span><span>pro-Western</span></div>
      ${['US', 'SU'].filter(p => w.troops[p]).map(p => `<div class="sub">${p === 'US' ? 'American' : 'Soviet'} troops are fighting here.</div>`).join('')}</div>`;
  }
  function partiesHtml(key) {
    const c = g.c[key]; if (!c.parties) return '';
    const own = g.nation && key === g.nation, me = actor();
    const rows = GAME.PARTIES.map(p => {
      const v = c.parties[p.id], back = GAME.partyCheck(g, me, key, p.id, 'back'), power = own ? GAME.partyCheck(g, me, key, p.id, 'power') : null;
      const b1 = GAME.isHome(key) ? '' : `<button class="pbtn" data-party="${p.id}|back" ${back.ok ? '' : 'disabled'} title="${esc(back.ok ? 'Back the ' + p.name + ': +8% (1 IP)' : back.why)}">+</button>`;
      const b2 = power ? `<button class="pbtn" data-party="${p.id}|power" ${power.ok ? '' : 'disabled'} title="${esc(power.ok ? 'Hand power to the ' + p.name + ' (3 IP)' : power.why)}">⚑</button>` : '';
      return `<div class="${c.ruling === p.id ? 'rul' : ''}"><i style="background:${p.color}"></i><span>${p.name}${c.ruling === p.id ? ' <em>in power</em>' : ''}</span><b>${Math.round(v)}%</b>${b1}${b2}</div>`;
    }).join('');
    return `<h3>Government: ${esc(c.gov)}</h3><div class="parties">
      <div class="pbar">${GAME.PARTIES.slice().reverse().map(p => `<i style="height:${c.parties[p.id]}%;background:${p.color}"></i>`).join('')}</div>
      <div class="plist">${rows}</div></div>
      ${['Democracy', 'Republic'].includes(c.gov) ? '<div class="sub">Elections every four years: the strongest party takes over.</div>' : '<div class="sub">No free elections. A strong party shut out of power may rise up.</div>'}`;
  }
  function alliancesLine(key) {
    const ps = GAME.pactsOf(g, key);
    return ps.length ? `<div class="pacts">${ps.map(p => `<span style="border-color:${p.color}">${esc(p.name)}</span>`).join('')}</div>` : '';
  }
  // a superpower at home: morale, economy, the arms and space races, and programmes to spend on
  function homeFront() {
    const P = g.pw[g.side], O = g.pw[g.side === 'US' ? 'SU' : 'US'], hc = P.home < 30 ? '#e0533c' : P.home < 50 ? '#f0a03c' : '#6fbf73';
    const next = GAME.SPACE[P.space];
    let h = `<h3>At home</h3><div class="facts">
      <div class="fact"><small>Home morale</small><b style="color:${hc}">${Math.round(P.home)}</b> <span class="sub">${P.home < 30 ? 'dangerously low' : ''}</span></div>
      <div class="fact"><small>Economy</small>${P.growth >= 0 ? '+' : ''}${P.growth.toFixed(1)}% a year</div>
      <div class="fact"><small>Nuclear arsenal</small>${P.arms}/10 <span class="sub">rival ${O.arms}</span></div>
      <div class="fact"><small>Space race</small>${P.space}/${GAME.SPACE.length} <span class="sub">${next ? 'next: ' + next.n.toLowerCase() : 'done'}</span></div>
      <div class="fact"><small>Army</small>${Math.round(g.c[GAME.HOME[g.side]].army)}</div></div>
      <div class="sub">Morale falls with a weak economy, wars abroad and high tension. At 0 your side collapses and loses.</div>`;
    for (const id in GAME.PROGRAMS) { const R = GAME.PROGRAMS[id]; h += btn(`data-prog="${id}"`, R.name, R.cost, GAME.programCheck(g, g.side, id), R.help); }
    return h;
  }
  // the cabinet: hand part of the year's IP to your ministers
  function cabinetHtml() {
    const a = g.auto || { on: false, share: 0.5, focus: 'balanced' };
    return `<h3>Cabinet</h3><div class="sub">Let your ministers spend part of your IP each year when you press End Year.</div>
      <div class="policies"><button class="pol ${a.on ? 'on' : ''}" data-cab="on|${a.on ? 0 : 1}">${a.on ? 'On' : 'Off'}</button>
      ${[0.25, 0.5, 0.75, 1].map(s => `<button class="pol ${a.share === s ? 'on' : ''}" data-cab="share|${s}">${s * 100}%</button>`).join('')}</div>
      <div class="policies">${Object.keys(GAME.FOCUS).map(f => `<button class="pol ${a.focus === f ? 'on' : ''}" data-cab="focus|${f}">${GAME.FOCUS[f]}</button>`).join('')}</div>
      ${a.on && a.report ? `<div class="sub">${esc(a.report)}</div>` : ''}`;
  }
  // a nation still inside a union
  function unionPanel() {
    const key = g.nation, d = GAME.info(key), c = g.c[key], owner = GAME.info(GAME.stateOf(g, c.owner)).name, sup = Math.round(g.support || 0);
    let h = `<h2>${esc(d.name)} <span class="you">your nation</span></h2><div class="sub">Part of ${esc(owner)} since ${c.since}. ${d.core ? 'Most people here want to stay.' : ''}</div>
      <div class="facts"><div class="fact"><small>Support for independence</small><b style="color:${sup >= 40 ? '#6fbf73' : '#f0a03c'}">${sup}</b> <span class="sub">${sup >= 40 ? 'enough to rise' : 'needs 40 to rise'}</span></div>
      <div class="fact"><small>Militia</small>${g.militia || 0}/12</div><div class="fact"><small>Income</small>+${GAME.nationIncome(g)} IP/yr</div></div>
      <div class="sub">The movement grows by itself when ${esc(owner)} is weak. If you rise and lose, it is over.</div>`;
    if (c.war) h += civilBox(c);
    h += `<h3>The cause</h3>` + Object.keys(GAME.UNION_ACTIONS).map(k => { const A = GAME.UNION_ACTIONS[k]; return btn(`data-union="${k}"`, A.name, A.cost, GAME.unionCheck(g, k), A.help); }).join('');
    return h + cabinetHtml();
  }
  // the player's own nation
  function homePanel() {
    if (GAME.captive(g)) return unionPanel();
    const key = g.nation, d = GAME.info(key), c = g.c[key];
    let h = `<h2>${esc(d.name)} <span class="you">your nation</span></h2><div class="sub">${esc(D.REGIONS[d.region])} · worth ${'★'.repeat(GAME.valueOf(g, key))}</div>
      <div class="align"><b style="left:20%"></b><b style="left:80%"></b><i style="left:${(c.a + 100) / 2}%"></i></div>
      <div class="ends"><span>Soviet bloc</span><b style="color:var(--ink)">${GAME.leaning(c.a)}</b><span>American bloc</span></div>
      <div class="facts"><div class="fact"><small>Stability</small>${pips(c.stab)}</div><div class="fact"><small>Army</small>${Math.round(c.army)}</div>
      <div class="fact"><small>Economy</small>${'★'.repeat(GAME.valueOf(g, key))} <span class="sub">${c.dev < 3 ? c.devProgress + '/' + (3 + c.dev) : 'max'}</span></div><div class="fact"><small>Income</small>+${GAME.nationIncome(g)} IP/yr</div>
      <div class="fact"><small>Friends</small>${GAME.friendsOf(g).length}</div><div class="fact"><small>Defeated enemies</small>${GAME.puppetsOf(g).length}</div></div>
      <div class="sub">Foreign pressure: the superpowers can move your politics at most ${GAME.PUSH_CAP} a year${g.pushed ? ` (this year so far: ${Math.round(g.pushed)})` : ''}.</div>
      ${partiesHtml(key)}`;
    if (c.war) h += civilBox(c) + `<div class="sub" style="color:#f0a03c">If the rebels win, your government falls.</div>`;
    const sw = GAME.warOf(g, key); if (sw) h += warBox(sw);
    const home = k => { const A = GAME.HOME_ACTIONS[k]; return btn(`data-home="${k}"`, A.name, A.cost, GAME.homeCheck(g, k), A.help); };
    h += `<h3>Government</h3>` + ['stabilise', 'develop', 'army'].map(home).join('') + (c.war ? home('crush') : '');
    h += `<h3>Foreign policy <span class="sub">(one a year)</span></h3>` + ['west', 'neutral', 'east'].map(home).join('');
    h += `<h3>Alliances</h3>${alliancesLine(key) || '<div class="sub">You have no allies.</div>'}`;
    for (const p of g.pacts) {
      if (p.members.includes(key)) { const r = GAME.homeCheck(g, 'leave', p.id); h += btn(`data-leave="${p.id}"`, `Leave ${p.name}`, r.cost, r, GAME.HOME_ACTIONS.leave.help); continue; }
      const r = GAME.homeCheck(g, 'join', p.id);
      h += btn(`data-join="${p.id}"`, `Join ${p.name}`, r.cost, r, `${r.chance ? Math.round(r.chance * 100) + '% they say yes. ' : ''}${GAME.HOME_ACTIONS.join.help}`);
    }
    const forms = D.FORMABLES.filter(f => f.members.includes(key) && !g.formed.includes(f.id));
    if (forms.length) {
      h += `<h3>Form a nation</h3>`;
      for (const f of forms) {
        const r = GAME.formCheck(g, f);
        h += btn(`data-form="${f.id}"`, `Form ${f.name}`, r.cost, r, `Unites ${f.members.map(k => GAME.info(k).name).join(', ')}. Every member must be a close friend, defeated by you, or already yours.`);
      }
    }
    if (g.formed.length) h += `<div class="sub">Formed: ${g.formed.map(id => esc(D.FORMABLES.find(f => f.id === id).name)).join(', ')}</div>`;
    const lost = GAME.lostLand(g, key), terrs = GAME.territories(g);
    if (terrs.length) h += `<h3>Occupied lands</h3>` + terrs.map(terrCard).join('');
    if (lost.length) h += `<div class="sub" style="color:#f0a03c">Land you lost: to ${lost.map(k => esc(GAME.info(k.taker).name)).join(', ')}. Win a war against them to get it back.</div>`;

    h += cabinetHtml();
    h += `<div class="sub" style="margin-top:8px">Your score grows with your army, stability, friends (countries that think like you) and defeated enemies. Click another country to act on it.</div>`;
    return h;
  }
  function panel() {
    const el = $('panel');
    const terr = g.nation && sel && g.c[sel] && g.c[sel].owner === g.nation && GAME.territories(g).find(x => x.id === sel);
    if (terr) { const t = terr; el.innerHTML = `<h2>${esc(GAME.info(sel).name)} <span class="you">your territory</span></h2>` + terrCard(t) + '<h3 style="margin-top:18px">Your nation</h3>' + homePanel(); bind(el); return; }
    if (g.nation && (!sel || sel === g.nation)) { el.innerHTML = homePanel(); bind(el); return; }   // your own country: the management menu
    if (!sel || sel === GAME.HOME[g.side]) {
      el.innerHTML = `<h2>${esc(GAME.NAME[g.side])}</h2><div class="sub">You lead the ${g.side === 'US' ? 'West' : 'East'}. Goal: have the higher score in ${GAME.END}.</div>
        ${alliancesLine(GAME.HOME[g.side])}${homeFront()}${cabinetHtml()}${(sw => sw ? warBox(sw) : "")(GAME.warOf(g, GAME.HOME[g.side]))}
        <h3>What to do</h3><ul class="empty">
        <li><b>Click a country</b> on the map to see it and act on it.</li>
        <li>Push countries past <b>${GAME.BLOC}</b> toward you to bring them into your bloc. Each adds its value to your score.</li>
        <li>Neutral and unstable countries (few ● dots) are easiest to win.</li>
        <li>Coups and invasions are fast but raise <b>tension</b>. At 100: nuclear war, everybody loses. Use <b>Détente</b> to cool things down.</li>
        <li>Press <b>End Year</b> when you are done.</li></ul>`;
      bind(el); return;
    }
    const d = GAME.info(sel), c = g.c[sel], me = actor();
    let h = `<h2>${esc(d.name)}</h2><div class="sub">${esc(D.REGIONS[d.region])}${d.val && !GAME.isHome(sel) ? ' · worth ' + '★'.repeat(GAME.valueOf(g, sel)) : ''}</div>`;
    if (GAME.isHome(sel)) {
      h += `<div class="facts"><div class="fact"><small>Army</small>${Math.round(c.army)}</div><div class="fact"><small></small>${sel === GAME.HOME[g.side] ? 'Your country' : 'A superpower'}</div></div>${alliancesLine(sel)}${partiesHtml(sel)}`;
      const sw = GAME.warOf(g, sel); if (sw) h += warBox(sw);
      el.innerHTML = h; bind(el); return;
    }
    if (c.owner) {
      // a region: part of a country from the start, or annexed later. During an uprising others can take sides.
      const own = GAME.isUnionPart(g, sel), d0 = GAME.info(sel);
      h += `<p class="sub">${own ? `Part of ${esc(GAME.info(c.owner).name)} since ${c.since}.` : `Annexed by ${esc(GAME.info(c.owner).name)} in ${c.since}.`}
        ${d0.core ? 'Its people want to stay.' : c.war ? '' : c.stab <= 2 ? 'Restless: it may rise up.' : 'Quiet for now.'}</p>
        <div class="facts"><div class="fact"><small>Stability</small>${pips(c.stab)}</div><div class="fact"><small>Government</small>${esc(c.gov)}</div></div>`;
      if (c.war) {
        h += civilBox(c) + `<h3>Your moves</h3>`;
        for (const a of g.nation ? ['arm'] : ['arm', 'troops']) {
          const r = GAME.check(g, me, a, sel), A = GAME.ACTIONS[a];
          const mine = GAME.stateOf(g, c.owner) === GAME.playerKey(g);
          h += btn(`data-act="${a}"`, a === 'arm' ? (mine ? 'Arm your garrison' : 'Arm a side') : A.name, A.cost, r, mine ? 'A push against the rebels this year.' : A.help);
        }
      }
      el.innerHTML = h; bind(el); return;
    }
    if (!c.independent) { el.innerHTML = h + `<p class="sub">A colony of ${esc(d.colony)}. It becomes independent in ${d.indep}, and then you can win it over.</p>`; return; }
    h += `<div class="align"><b style="left:20%"></b><b style="left:80%"></b><i style="left:${(c.a + 100) / 2}%"></i></div>
      <div class="ends"><span>Soviet bloc</span><b style="color:var(--ink)">${GAME.leaning(c.a)}</b><span>American bloc</span></div>
      <div class="facts"><div class="fact"><small>Stability</small>${pips(c.stab)}</div><div class="fact"><small>Army</small>${Math.round(c.army)}</div>
      <div class="fact"><small>Your moves here</small>${c.moves}/2 this year</div>
      <div class="fact"><small>${g.nation ? 'Towards you' : 'Status'}</small>${g.nation ? (GAME.friendsOf(g).some(f => f.key === sel) ? 'A friend' : Math.round(Math.abs(c.a - g.c[g.nation].a)) + ' apart') : c.puppetOf ? 'Defeated' : 'Free'}</div></div>
      ${g.nation ? GAME.territories(g).filter(t => t.kind === 'cut' && t.land === sel).map(terrCard).join('') : ''}
      ${alliancesLine(sel)}${GAME.lostLand(g, sel).map(k => `<div class="sub" style="color:#f0a03c">Lost ${esc(GAME.provList(k.ids || []))} to ${esc(GAME.info(k.taker).name)} in ${k.year}.</div>`).join('')}${partiesHtml(sel)}`;
    if (c.war) h += civilBox(c);
    const sw = GAME.warOf(g, sel); if (sw) h += warBox(sw);
    h += `<h3>Your moves</h3>`;
    for (const a of ['propaganda', 'aid', 'coup', 'arm', 'troops', 'invade']) {
      if ((a === 'arm' || a === 'troops') !== !!c.war) continue;
      if (g.nation && (a === 'coup' || a === 'troops')) continue;
      if (a === 'invade' && g.nation && !GAME.borders(g, g.nation, sel)) continue;
      const r = GAME.check(g, me, a, sel), A = GAME.ACTIONS[a];
      let note = r.chance ? `${Math.round(r.chance * 100)}% chance. ${A.help}` : A.help;
      if (g.nation && (a === 'propaganda' || a === 'aid')) note = note.replace('toward you', 'toward your own politics');
      if (a === 'invade') note = `Your army ${Math.round(g.c[g.nation || GAME.HOME[g.side]].army)} against theirs ${Math.round(c.army)}${GAME.pactsOf(g, sel).length ? ' plus their allies' : ''}. ${A.help}`;
      h += btn(`data-act="${a}"`, A.name, A.cost, r, note);
    }
    el.innerHTML = h; bind(el);
  }
  function bind(el) {
    const me = actor();
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { toast(GAME.act(g, me, b.dataset.act, sel)); after(); });
    el.querySelectorAll('[data-war]').forEach(b => b.onclick = () => { const [party, kind] = b.dataset.war.split('|'); toast(GAME.warHelp(g, me, GAME.warOf(g, sel || g.nation), party, kind)); after(); });
    el.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { toast(GAME.homeAct(g, b.dataset.home)); after(); });
    el.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { toast(GAME.homeAct(g, 'join', b.dataset.join)); after(); });
    el.querySelectorAll('[data-leave]').forEach(b => b.onclick = () => { toast(GAME.homeAct(g, 'leave', b.dataset.leave)); after(); });
    el.querySelectorAll('[data-party]').forEach(b => b.onclick = () => { const [id, kind] = b.dataset.party.split('|'); toast(GAME.partyAct(g, me, sel || g.nation, id, kind)); after(); });
    el.querySelectorAll('[data-term]').forEach(b => b.onchange = () => { talkPicks = [...el.querySelectorAll('[data-term]:checked')].map(x => x.dataset.term); panel(); });
    const pr = el.querySelector('#propose'); if (pr) pr.onclick = () => { toast(GAME.proposePeace(g, talkPicks)); talkPicks = []; after(); };
    el.querySelectorAll('[data-terr]').forEach(b => b.onclick = () => { const [id, kind] = b.dataset.terr.split('|'); toast(GAME.territoryAct(g, id, kind)); after(); });
    el.querySelectorAll('[data-form]').forEach(b => b.onclick = () => { toast(GAME.form(g, b.dataset.form)); after(); });
    el.querySelectorAll('[data-union]').forEach(b => b.onclick = () => { toast(GAME.unionAct(g, b.dataset.union)); after(); });
    el.querySelectorAll('[data-cab]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.cab.split('|'); GAME.setCabinet(g, { [k]: k === 'on' ? v === '1' : k === 'share' ? +v : v }); after(); });
    el.querySelectorAll('[data-prog]').forEach(b => b.onclick = () => { toast(GAME.programAct(g, g.side, b.dataset.prog)); after(); });
  }
  function after() { refresh(); if (g.over) gameOver(); }
  function newsList() {
    $('news').innerHTML = g.news.slice(0, 40).map(n => `<li class="${n.year >= g.year - 1 ? 'now' : ''}"><span>${n.year}</span>${esc(n.text)}</li>`).join('');
  }
  function refresh() { if (!g) return; topBar(); drawMap(); panel(); newsList(); save(); }
  let regionSel = false;
  function select(key) { sel = key; regionSel = false; refresh(); }
  function selectRegion(key) { sel = key; regionSel = true; refresh(); zoomTo(key); }
  // zoom the map onto one region
  function zoomTo(key) {
    if (!customOf[key] && !geomsOf(key).length) return;
    const [[x0, y0], [x1, y1]] = boundsOf(key);
    const k = Math.max(1, Math.min(8, 0.7 * Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0))));
    (window.NO_ANIM ? svg : svg.transition().duration(650)).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));
  }

  // ================= pop-ups =================
  function modal(html) { $('card').innerHTML = html; $('modal').hidden = false; }
  function close() { $('modal').hidden = true; }
  function conference() {
    const P = g.peace, terms = GAME.termsFor(g, P.win, P.lose).filter(t => t.id !== 'white');
    let picks = [];
    const draw = () => {
      const spent = picks.reduce((t, id) => t + GAME.PEACE_TERMS[id].cost, 0);
      modal(`<div class="kicker">${g.year} · Peace conference</div><h1>${esc(GAME.info(P.lose).name)} is defeated</h1>
        <p>You won the war. Choose your terms: you have <b>${100 - spent}</b> of 100 points left.</p>
        ${terms.map(t => { const can = t.ok && (picks.includes(t.id) || spent + t.cost <= 100);
          return `<button class="choice ${picks.includes(t.id) ? 'on' : ''}" data-t="${t.id}" ${can ? '' : 'disabled'}><b>${esc(t.name)} · ${t.cost}</b><span>${esc(t.ok ? t.help : t.why)}</span></button>`; }).join('')}
        <button class="go" id="sign">SIGN THE TREATY</button>`);
      document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const id = b.dataset.t; picks = picks.includes(id) ? picks.filter(x => x !== id) : [...picks, id]; draw(); });
      $('sign').onclick = () => { GAME.conference(g, picks); refresh(); showEvents(); };
    };
    draw();
  }
  // the result of a game (or of the Cold War, at the end of 1991)
  function verdictText(o) {
    const late = o.year > GAME.END + 1, when = late ? `in ${o.year - 1}` : 'in 1991';
    if (o.why === 'nuclear') return ['Nuclear war', 'Tension reached 100 and the missiles flew. In a nuclear war, nobody wins.'];
    if (o.why === 'collapse') return [o.winner === g.side ? 'You win!' : 'Collapse', o.text];
    if (g.nation) {
      if (o.why === 'overthrown') return ['Overthrown', o.text];
      return [o.grade, `${GAME.info(g.nation).name} ${late ? 'has come this far' : 'comes through the Cold War'}. Your score changed by ${o.gain >= 0 ? '+' : ''}${o.gain} since 1947.`];
    }
    return [!o.winner ? 'A draw' : o.winner === g.side ? 'You win!' : 'You lose', `${late ? 'The game ends' : 'The Cold War is over'}. Score ${when}: USA ${o.us}, USSR ${o.su}.`];
  }
  function showEvents() {
    if (g.over) return gameOver();
    if (g.verdict && !g.verdictSeen) {
      const [title, text] = verdictText(g.verdict);
      modal(`<div class="kicker">1991 · The end of the Cold War</div><h1>${esc(title)}</h1><p>${esc(text)}</p>
        <p class="sub">The world goes on. Play on into the new century (the 1990s, 9/11, the Arab Spring, Crimea...), and end the game whenever you like.</p>
        <button class="go" id="onward">KEEP PLAYING</button><button class="choice" id="again" style="margin-top:8px"><b>Start a new game</b></button>`);
      $('onward').onclick = () => { g.verdictSeen = true; save(); refresh(); showEvents(); };
      $('again').onclick = () => { try { localStorage.removeItem(SAVE); } catch (e) { } start(); };
      return;
    }
    if (g.peace) return conference();
    const e = g.pending[0]; if (!e) return close();
    modal(`<div class="kicker">${g.year} · You decide</div><h1>${esc(e.title)}</h1><p>${esc(e.text)}</p>
      ${e.options.map((o, i) => `<button class="choice" data-i="${i}"><b>${esc(o.label)}</b><span>${esc(o.hint)}</span></button>`).join('')}`);
    document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { GAME.choose(g, +b.dataset.i); refresh(); showEvents(); });
  }
  function gameOver() {
    const [title, text] = verdictText(Object.assign({ year: g.year, us: GAME.score(g, 'US'), su: GAME.score(g, 'SU') }, g.over));
    const was = g.verdict && g.over.year > GAME.END + 1 && g.over.why === 'time' ? `<p class="sub">In 1991: ${esc(verdictText(g.verdict)[0])}.</p>` : '';
    modal(`<div class="kicker">${g.year}</div><h1>${esc(title)}</h1><p>${esc(text)}</p>${was}<button class="go" id="again">PLAY AGAIN</button>`);
    $('again').onclick = start;
    try { localStorage.removeItem(SAVE); } catch (e) { }
  }
  function howTo() {
    return `<ul>
      <li><b>Each year</b> you get Influence Points (IP). Click a country and spend them. Then press <b>End Year</b>.</li>
      <li><b>As a superpower</b>, push countries past ${GAME.BLOC} toward you to bring them into your bloc. When ${GAME.END} ends, the bigger bloc wins, and then you can keep playing into the new century.</li>
      <li><b>As a nation</b>, build your army, keep order at home, make friends, join an alliance, and maybe invade a neighbour. Don't get overthrown.</li>
      <li><b>Propaganda</b> (1 IP) and <b>Economic Aid</b> (3 IP) pull a country toward you. A superpower can also <b>Back a Coup</b> (5 IP).</li>
      <li><b>Wars</b> (➜): every country has an army. <b>Invade</b> to attack; take the enemy capital to weaken them. Alliances (NATO, Warsaw Pact…) defend their members.</li>
      <li><b>Civil wars</b> (⚔): arm a side or send troops to help it win.</li>
      <li><b>Tension</b> rises with coups, invasions and crises. At 100 it is nuclear war and everyone loses. <b>Détente</b> lowers it.</li></ul>`;
  }
  function start() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { }
    const nations = D.COUNTRIES.filter(d => !GAME.isHome(d.key) && !d.indep && !d.union);
    const captives = D.COUNTRIES.filter(d => d.union && !d.indep);
    const regions = ['EU', 'ME', 'AS', 'AF', 'LA'];
    const lean = a => a >= 25 ? 'var(--us)' : a <= -25 ? 'var(--su)' : 'var(--neutral)';
    modal(`<div class="kicker">1947 – 1991</div><h1>Iron Curtain Lite</h1>
      <p>The Second World War is over and two superpowers divide the world. Lead one of them, or any nation caught in between.</p>
      <div class="sides">
        <button class="choice" data-side="US"><b style="color:#2f6bc4">Play the United States</b><span>Lead the West: democracy and dollars.</span></button>
        <button class="choice" data-side="SU"><b style="color:#b8281f">Play the Soviet Union</b><span>Lead the East: revolution and planning.</span></button>
      </div>
      <h3 style="margin-top:16px">…or lead a nation</h3>
      <div class="nations">${regions.map(r => `<div><h4>${D.REGIONS[r]}</h4>${nations.filter(d => d.region === r).map(d =>
        `<button class="nat" data-side="${d.key}" style="--c:${lean(d.a)}">${esc(d.name)}</button>`).join('')}</div>`).join('')}</div>
      <h3 style="margin-top:16px">…or a nation inside a union</h3><div class="sub">No army and no foreign policy yet: build a movement, arm a militia, and choose the moment to declare independence.</div>
      <div class="nations"><div>${captives.map(d => `<button class="nat" data-side="${d.key}" style="--c:var(--neutral)" title="Part of ${esc(GAME.info(d.union).name)}">${esc(d.name)}</button>`).join('')}</div></div>
      ${saved && !saved.over ? `<button class="go" id="resume">CONTINUE (${esc(saved.nation ? GAME.info(saved.nation).name : saved.side === 'US' ? 'USA' : 'USSR')}, ${saved.year})</button>` : ''}
      <h3 style="margin-top:20px">How to play</h3>${howTo()}`);
    document.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { g = GAME.newGame(b.dataset.side); sel = null; close(); refresh(); showEvents(); });
    if ($('resume')) $('resume').onclick = () => { g = rebuild(saved); sel = null; close(); refresh(); showEvents(); };
  }
  // saved games lose their functions (event options), so pending events are looked up again
  function rebuild(s) { GAME.applyNames(s); GAME.fixCuts(s); s.pending = (s.pending || []).map(p => D.EVENTS.find(e => e.title === p.title)).filter(Boolean); return s; }
  function save() { try { if (g && !g.over) localStorage.setItem(SAVE, JSON.stringify(g)); } catch (e) { } }

  let toastTimer = 0;
  function toast(msg) { if (!msg) return; const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2200); }

  let waiting = false;
  function endYear() {
    if (!g || g.over || waiting || !$('modal').hidden) return;
    GAME.endYear(g); refresh();
    if (!g.over) toast(`${g.year} begins: +${g.nation ? GAME.nationIncome(g) : GAME.income(g, g.side)} IP`);
    const wait = window.NO_ANIM || window.NO_WAIT ? 0 : Math.max(0, busyUntil - performance.now());
    if (!wait) return g.over ? gameOver() : showEvents();
    waiting = true; $('end').disabled = true;
    setTimeout(() => { waiting = false; $('end').disabled = false; if (g.over) gameOver(); else showEvents(); }, wait + 150);
  }
  $('end').onclick = endYear;
  $('finish').onclick = () => {
    if (!g || g.over) return;
    modal(`<h1>End the game?</h1><p>The game is judged as it stands now, in ${g.year}.</p><button class="go" id="yes">END THE GAME</button><button class="choice" id="no" style="margin-top:8px"><b>Keep playing</b></button>`);
    $('yes').onclick = () => { GAME.finish(g); refresh(); gameOver(); };
    $('no').onclick = () => { close(); showEvents(); };
  };
  $('detente').onclick = () => { if (g && g.side && GAME.detente(g, g.side)) { toast('Summit held: tension −15'); refresh(); } };
  $('help').onclick = () => { if (g) { modal(`<h1>How to play</h1>${howTo()}<button class="go" id="ok">OK</button>`); $('ok').onclick = () => { close(); showEvents(); }; } };
  const MODES = ['nat', 'pact', 'rel', 'mil', 'gov', 'stab'];
  document.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (/^[1-6]$/.test(e.key) && $('modal').hidden) setMode(MODES[+e.key - 1]); if ((e.key === 'm' || e.key === 'M') && $('modal').hidden) setMode(MODES[(MODES.indexOf(mapMode) + 1) % MODES.length]); if (e.key === 'Enter' && $('modal').hidden) endYear(); if (e.key === 'Escape' && $('modal').hidden) { sel = null; refresh(); } });

  // for the browser console and tests: ironCurtain.game is the game being played
  window.ironCurtain = { get game() { return g; }, set game(v) { g = v; }, start, refresh, zoomTo, frontField, center,
    view: (lon, lat, k) => { const [x, y] = proj([lon, lat]); svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * x, H / 2 - k * y).scale(k)); } };
  start();
})();
