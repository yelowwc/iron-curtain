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

  // which game country each shape on the world map belongs to
  const owner = {};
  for (const c of D.COUNTRIES) { c.ids.forEach(id => owner['id' + id] = c.key); (c.names || []).forEach(n => owner['n' + n] = c.key); }
  const geoms = WORLD.objects.countries.geometries.filter(x => x.id !== '010');          // no Antarctica
  geoms.forEach(x => x.key = owner['id' + (+x.id)] || owner['n' + x.properties.name] || null);
  const shapes = topojson.feature(WORLD, { type: 'GeometryCollection', geometries: geoms }).features;
  shapes.forEach((f, i) => f.key = geoms[i].key);
  // Hand-drawn lands (East Germany, South Vietnam, Scotland, Tibet...) are painted over the country they
  // lie in, and cut to its real outline, so a rough ring only has to be right where it crosses the land.
  const customs = D.COUNTRIES.filter(d => d.custom && D.RINGS[d.key]).map(d => {
    const f = { type: 'Feature', key: d.key, clip: d.clip || null, custom: true, geometry: { type: 'Polygon', coordinates: [D.RINGS[d.key].slice()] } };
    if (d3.geoArea(f) > 2 * Math.PI) f.geometry.coordinates[0].reverse();
    return f;
  });
  const customOf = {}; customs.forEach(f => customOf[f.key] = f);
  const parentOf = k => customOf[k] ? customOf[k].clip || D.BY_KEY[k].union || null : null;      // the land it is painted over
  const childrenOf = k => customs.filter(f => parentOf(f.key) === k).map(f => f.key);
  const geomsOf = k => geoms.filter(x => x.key === k);

  const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: shapes });
  const path = d3.geoPath(proj);
  const defs0 = svg.select('defs');
  for (const k of new Set(customs.map(f => f.clip).filter(Boolean))) defs0.append('clipPath').attr('id', 'pclip-' + k).append('path').attr('d', path(topojson.merge(WORLD, geomsOf(k))));
  const clipUrl = k => customOf[k] && customOf[k].clip ? `url(#pclip-${customOf[k].clip})` : null;
  root.append('path').datum({ type: 'Sphere' }).attr('fill', 'var(--sea)').attr('d', path);
  const lands = root.append('g').selectAll('path').data([...shapes, ...customs]).join('path')
    .attr('class', f => 'land' + (f.key ? ' click' : '')).attr('d', path).attr('fill', '#2a2e2c').attr('clip-path', f => f.custom ? clipUrl(f.key) : null)
    .on('mousemove', (e, f) => hover(e, f)).on('mouseleave', () => hover())
    .on('click', (e, f) => { if (f.key) select(GAME.stateOf(g, f.key)); })
    .on('dblclick', (e, f) => { if (f.key) selectRegion(f.key); });                 // double click: that region
  // borders between states (a region inside its country has none), and coasts
  const sameCountry = (a, b) => a.key && a.key === b.key;
  root.append('path').attr('class', 'coast').attr('d', path(topojson.mesh(WORLD, { type: 'GeometryCollection', geometries: geoms }, (a, b) => a === b)));
  const borderPath = root.append('path').attr('class', 'border');
  const customBorders = root.append('g').selectAll('path').data(customs).join('path').attr('class', 'border').attr('clip-path', f => clipUrl(f.key));
  let borderKey = null;
  // borders between states: annexed land shares its owner's state, so the line between them goes
  function drawBorders() {
    const st = k => (g && k ? GAME.stateOf(g, k) : k);
    const key = g ? D.COUNTRIES.map(d => g.c[d.key].owner || '').join(',') : '';
    if (key === borderKey) return; borderKey = key;
    borderPath.attr('d', path(topojson.mesh(WORLD, { type: 'GeometryCollection', geometries: geoms }, (a, b) => a !== b && !sameCountry(a, b) && !(a.key && b.key && st(a.key) === st(b.key)))));
    customBorders.attr('d', f => !g || st(f.key) !== st(parentOf(f.key)) ? path(f) : null);
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

  // A state's outline: its own land and annexed land, minus land lost in wars, plus land taken.
  // With no war changes this is the exact vector outline; otherwise it is traced from a drawing.
  const stateCache = {};
  // land taken in a treaty never includes the capital
  function cutDepth(c) {
    const f = frontField(c.land, c.taker), cap = D.CAPITALS.find(x => x.key === c.land);
    if (!f || !cap) return c.depth;
    return Math.min(c.depth, f.depthAt(proj([cap.lon, cap.lat])) * 0.8);
  }
  // draw one land on a canvas: a hand-drawn land only inside its parent's outline
  function paintLand(ctx, key, colour) {
    ctx.save(); ctx.fillStyle = colour;
    if (customOf[key] && customOf[key].clip) ctx.clip(new Path2D(outlineOf(customOf[key].clip)));
    ctx.fill(new Path2D(outlineOf(key))); ctx.restore();
  }
  const boundsOf = key => {
    const b = path.bounds(customOf[key] || topojson.merge(WORLD, geomsOf(key)));
    if (customOf[key] && customOf[key].clip) {                      // a ring may reach far into the sea: keep to the parent's box
      const p = path.bounds(topojson.merge(WORLD, geomsOf(customOf[key].clip)));
      return [[Math.max(b[0][0], p[0][0]), Math.max(b[0][1], p[0][1])], [Math.min(b[1][0], p[1][0]), Math.min(b[1][1], p[1][1])]];
    }
    return b;
  };
  function stateOutline(key) {
    if (!g || !key || !g.c[key]) return outlineOf(key);
    const members = [key, ...GAME.ownedBy(g, key)];
    const inState = k => GAME.stateOf(g, k) === key;
    const lost = (g.cuts || []).filter(c => members.includes(c.land) && !inState(c.taker));
    const taken = (g.cuts || []).filter(c => inState(c.taker) && !inState(c.land));
    // hand-drawn lands: the ones held by others are holes, the ones held away from their parent are drawn on their own
    const holes = members.flatMap(childrenOf).filter(k => !inState(k));
    const loose = members.filter(k => customOf[k] && !inState(parentOf(k)));
    const plain = members.filter(k => !customOf[k]);
    const sig = members.join(',') + '|' + holes.join(',') + '|' + [...lost, ...taken].map(c => c.land + c.taker + c.depth.toFixed(3)).join(',');
    if (stateCache[key] && stateCache[key].sig === sig) return stateCache[key].d;
    let d = [...plain, ...loose].map(outlineOf).join('');
    const simple = !lost.length && !taken.length && !holes.length && loose.every(k => !customOf[k].clip) && (plain.length || loose.length === 1);
    if (!simple) {
      // anything harder is painted on a canvas and traced back into a line
      const boxes = [...plain, ...loose, ...taken.map(c => c.land)].map(boundsOf);
      const x0 = Math.min(...boxes.map(b => b[0][0])) - 2, y0 = Math.min(...boxes.map(b => b[0][1])) - 2;
      const x1 = Math.max(...boxes.map(b => b[1][0])) + 2, y1 = Math.max(...boxes.map(b => b[1][1])) + 2;
      const sc = Math.min(12, 900 / Math.max(x1 - x0, y1 - y0)), cw = Math.ceil((x1 - x0) * sc), ch = Math.ceil((y1 - y0) * sc);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d');
      ctx.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
      for (const k of [...plain, ...loose]) paintLand(ctx, k, '#fff');
      for (const k of holes) paintLand(ctx, k, '#000');
      for (const c of lost) { const f = frontField(c.land, c.taker); if (!f) continue; ctx.save(); ctx.clip(new Path2D(outlineOf(c.land))); ctx.fillStyle = '#000'; ctx.fill(new Path2D(f.at(cutDepth(c)).d)); ctx.restore(); }
      for (const c of taken) { const f = frontField(c.land, c.taker); if (!f) continue; ctx.save(); ctx.clip(new Path2D(outlineOf(c.land))); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(f.at(cutDepth(c)).d)); ctx.restore(); }
      const px = ctx.getImageData(0, 0, cw, ch).data, vals = new Float64Array(cw * ch);
      for (let i = 0; i < vals.length; i++) vals[i] = px[i * 4] / 255;
      const cont = d3.contours().size([cw, ch]).thresholds([0.5])(vals)[0];
      d = cont.coordinates.flatMap(poly => poly.map(r => 'M' + r.map(q => (x0 + q[0] / sc).toFixed(2) + ',' + (y0 + q[1] / sc).toFixed(2)).join('L') + 'Z')).join('');
    }
    stateCache[key] = { sig, d };
    return d;
  }
  // the exact outline of a set of lands (a state's lands at war): hand-drawn ones cut to their parent, lands carved out of them removed
  const landsCache = {};
  function landsOutline(keys) {
    const id = keys.join('+'); if (landsCache[id] !== undefined) return landsCache[id];
    const plain = plainOf(keys), loose = looseOf(keys), holes = holesOf(keys);
    if (!holes.length && loose.every(k => !customOf[k].clip)) return (landsCache[id] = [...plain, ...loose].map(outlineOf).join(''));
    const boxes = [...plain, ...loose].map(boundsOf);
    const x0 = Math.min(...boxes.map(b => b[0][0])) - 2, y0 = Math.min(...boxes.map(b => b[0][1])) - 2, x1 = Math.max(...boxes.map(b => b[1][0])) + 2, y1 = Math.max(...boxes.map(b => b[1][1])) + 2;
    const sc = Math.min(12, 900 / Math.max(x1 - x0, y1 - y0)), cw = Math.ceil((x1 - x0) * sc), ch = Math.ceil((y1 - y0) * sc);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const ctx = cv.getContext('2d');
    ctx.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
    for (const k of [...plain, ...loose]) paintLand(ctx, k, '#fff');
    for (const k of holes) paintLand(ctx, k, '#000');
    const px = ctx.getImageData(0, 0, cw, ch).data, vals = new Float64Array(cw * ch);
    for (let i = 0; i < vals.length; i++) vals[i] = px[i * 4] / 255;
    const cont = d3.contours().size([cw, ch]).thresholds([0.5])(vals)[0];
    return (landsCache[id] = cont.coordinates.flatMap(poly => poly.map(r => 'M' + r.map(q => (x0 + q[0] / sc).toFixed(2) + ',' + (y0 + q[1] / sc).toFixed(2)).join('L') + 'Z')).join(''));
  }
  // a single region's outline (a hand-drawn one is the raw ring: clip it with clipUrl when drawing)
  const outline = {};
  function outlineOf(key) {
    if (outline[key] !== undefined) return outline[key];
    const parts = geomsOf(key);
    return (outline[key] = customOf[key] ? path(customOf[key]) : parts.length ? path(topojson.merge(WORLD, parts)) : '');
  }
  // the exact outline of one region on its own (hand-drawn ones cut to their parent, carved-out lands removed)
  const regionCache = {};
  function regionOutline(key) {
    if (regionCache[key] !== undefined) return regionCache[key];
    if (!(customOf[key] && customOf[key].clip) && !childrenOf(key).length) return (regionCache[key] = outlineOf(key));
    const [[x0, y0], [x1, y1]] = boundsOf(key), sc = Math.min(12, 900 / Math.max(x1 - x0 + 4, y1 - y0 + 4));
    const cw = Math.ceil((x1 - x0 + 4) * sc), ch = Math.ceil((y1 - y0 + 4) * sc), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d'); ctx.setTransform(sc, 0, 0, sc, -(x0 - 2) * sc, -(y0 - 2) * sc);
    paintLand(ctx, key, '#fff'); for (const k of childrenOf(key)) paintLand(ctx, k, '#000');
    const px = ctx.getImageData(0, 0, cw, ch).data, vals = new Float64Array(cw * ch);
    for (let i = 0; i < vals.length; i++) vals[i] = px[i * 4] / 255;
    const cont = d3.contours().size([cw, ch]).thresholds([0.5])(vals)[0];
    return (regionCache[key] = cont.coordinates.flatMap(poly => poly.map(r => 'M' + r.map(q => (x0 - 2 + q[0] / sc).toFixed(2) + ',' + (y0 - 2 + q[1] / sc).toFixed(2)).join('L') + 'Z')).join(''));
  }
  // ---- war fronts ----
  // For a war, every point of the land gets its distance from where the attack comes from: the border with
  // the attacker (or the nearest coast, for a war over the sea). The front at depth t is where that distance
  // equals t times the land's size, so the occupied area grows from the border inward, like on a real war map.
  // Rebels with no friendly neighbour do the opposite: they hold the land farthest from the capital.
  const fieldCache = {};
  // the border between a land and a set of attacking lands, as screen polylines.
  // A hand-drawn land meets its parent along its own ring, and its parent's neighbours along the parent's real border.
  function sharedBorder(land, takers) {
    const T = new Set(takers), lines = [];
    const L = new Set([customOf[land] ? parentOf(land) : land]);
    for (const k of takers) if (customOf[k] && parentOf(k) && !T.has(parentOf(k)) && parentOf(k) !== land) T.add(parentOf(k));
    const ringOf = k => customOf[k] ? customOf[k] : null;
    const inside = (pt, k) => !ringOf(k) || d3.geoContains(ringOf(k), pt);
    // the real border, kept to the stretch that belongs to the hand-drawn lands on each side
    const mesh = topojson.mesh(WORLD, WORLD.objects.countries, (a, b) => a !== b && ((L.has(a.key) && T.has(b.key)) || (T.has(a.key) && L.has(b.key))));
    const takerRings = takers.filter(k => customOf[k] && parentOf(k) !== land);
    for (const ln of mesh.coordinates) {
      let cur = [];
      for (const pt of ln) {
        const ok = inside(pt, land) && (!takerRings.length || takers.some(k => !customOf[k]) || takerRings.some(k => inside(pt, k)));
        if (ok) cur.push(proj(pt)); else { if (cur.length > 1) lines.push(cur); cur = []; }
      }
      if (cur.length > 1) lines.push(cur);
    }
    // the hand-drawn line between a region and the land it was carved from (the 17th parallel, the inner German border)
    const pairs = [];
    if (customOf[land] && takers.includes(parentOf(land))) pairs.push(land);
    for (const k of takers) if (customOf[k] && parentOf(k) === land) pairs.push(k);
    for (const k of pairs) {
      const parent = topojson.merge(WORLD, geomsOf(parentOf(k))), ring = customOf[k].geometry.coordinates[0];
      let cur = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.15));
        for (let j = 0; j < n; j++) {
          const pt = [ax + (bx - ax) * j / n, ay + (by - ay) * j / n];
          if (d3.geoContains(parent, pt)) cur.push(proj(pt)); else { if (cur.length > 1) lines.push(cur); cur = []; }
        }
      }
      if (cur.length > 1) lines.push(cur);
    }
    return lines;
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
    if (plain.length) { const m0 = topojson.merge(WORLD, plain.flatMap(geomsOf)); polys.push(...(m0.type === 'Polygon' ? [m0.coordinates] : m0.coordinates)); }
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
    const fs = 7 * Math.pow(zoomK, 0.2), boxes = labelled().map(c => { const [x, y] = center[c.key], w = c.name.length * fs * 0.55; return [x * zoomK - w / 2, (y * zoomK + 9 * Math.pow(zoomK, 0.2)) - fs, x * zoomK + w / 2, y * zoomK + 9 * Math.pow(zoomK, 0.2) + 2]; });
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

  // a country's colour: red for the Soviet camp, blue for the American, grey-brown for neutral
  function colour(key) {
    if (!key || !g) return '#2a2e2c';
    if (g.c[key] && g.c[key].owner) return colour(g.c[key].owner);
    if (key === 'USA') return '#2f6bc4';
    if (key === 'SUN') return '#b8281f';
    const c = g.c[key];
    if (!c.independent) return 'url(#colony)';
    const t = c.a / 100;
    return t >= 0 ? d3.interpolateLab('#8d8873', t >= .6 ? '#3d7fd6' : '#7d9cc8')(Math.min(1, t / .6))
      : d3.interpolateLab('#8d8873', t <= -.6 ? '#d23b30' : '#c47a6d')(Math.min(1, -t / .6));
  }
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
    lands.attr('fill', f => colour(f.key)).classed('restless', f => !!(f.key && g.c[f.key] && g.c[f.key].owner && g.c[f.key].occ && g.c[f.key].occ.unrest >= 60));
    selLine.attr('d', sel ? (regionSel ? regionOutline(sel) : stateOutline(sel)) : g.nation ? stateOutline(g.nation) : null).classed('mine', !sel && !!g.nation).classed('region', !!sel && regionSel);
    // wars between countries: the winning side holds a band of the other's land along their border
    const W2 = g.wars.filter(w => center[w.att] && center[w.def]);
    // land taken in earlier wars: a real border, drawn first so wars go on top
    const zones = (g.cuts || []).filter(k => center[k.taker] && center[k.land]).map(k => ({ id: 'k' + k.land + k.taker, taker: k.taker, land: k.land, state: k.land, depth: cutDepth(k), fill: colour(k.taker), cut: true }));
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
      zones.push({ id: 'c' + d.key, taker: friend || null, land: d.key, state: d.key, depth: share * 0.9, prev: 0, fill: campColour[w.rebels], civil: true });
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
  const labelled = () => D.COUNTRIES.filter(c => center[c.key] && !g.c[c.key].owner && (c.key === sel || c.val >= 4 || GAME.isHome(c.key) || zoomK >= 2.2 || (zoomK >= 1.5 && c.val >= 2)));
  function drawLabels() {
    if (!g) return;
    labels.selectAll('text').data(labelled(), c => c.key).join('text').attr('class', 'label')
      .attr('x', c => center[c.key][0]).attr('y', c => center[c.key][1] + 9 / zoomK)
      .style('font-size', 7 / Math.pow(zoomK, .8) + 'px').style('stroke-width', 2 / Math.pow(zoomK, .8) + 'px').text(c => c.name);
  }
  function hover(e, f) {
    const tip = $('tip');
    if (!e || !f || !f.key || !g) { tip.hidden = true; hoverLine.attr('d', null); return; }
    const region = f.key; f = { key: GAME.stateOf(g, f.key) };                    // show the whole state; name the region if it differs
    hoverLine.attr('d', stateOutline(f.key));
    const d = GAME.info(f.key), c = g.c[f.key];
    const ps = GAME.pactsOf(g, f.key).map(p => p.name).join(', ');
    tip.innerHTML = `<b>${esc(d.name)}${f.key === g.nation ? ' (you)' : ''}</b><br>${c.owner ? 'Part of ' + esc(GAME.info(c.owner).name) + (c.owner === g.nation ? ' (yours)' : '') : GAME.isHome(f.key) ? 'Superpower' : !c.independent ? 'Colony of ' + esc(d.colony) + ' until ' + d.indep : GAME.leaning(c.a) + (c.war ? ' · ⚔ civil war' : '')}
      ${c.independent || GAME.isHome(f.key) ? `<br>Army ${Math.round(c.army)}` : ''}${ps ? '<br>' + esc(ps) : ''}${GAME.warOf(g, f.key) ? '<br>⚔ at war' : ''}${GAME.lostLand(g, f.key).map(k => '<br>Lost land to ' + esc(GAME.info(k.taker).name)).join('')}${region !== f.key ? '<br><i>Region: ' + esc(GAME.info(region).name) + (g.c[region].occ ? ' · unrest ' + Math.round(g.c[region].occ.unrest) : '') + '</i>' : ''}<br><span class="dim">Double-click: this region</span>`;
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
    $('ip').innerHTML = `Influence <b>${Math.floor(g.ip[me])}</b> IP <span class="sub">+${GAME.income(g, me) - upkeep}/yr${upkeep ? ' (troops −' + upkeep + ')' : ''}</span>`;
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
      <div class="warbar"><i style="width:${f}%;background:#e0903c"></i><i style="flex:1;background:#5aa39a"></i></div>
      <div class="ends"><span>${esc(A)} · army ${Math.round(g.c[sw.att].army)}</span><span>${sw.front > 15 ? 'advancing' : sw.front < -15 ? 'pushed back' : 'stalemate'}</span><span>army ${Math.round(g.c[sw.def].army)} · ${esc(B)}</span></div>
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
    return `<div class="warbox"><b>⚔ ${w.sep ? 'Uprising' : 'Civil war'}</b> <span class="sub">year ${w.years + 1} · ${w.sep ? `fighting for independence, backed by the ${w.rebels === 'SU' ? 'East' : 'West'}` : w.rebels === 'SU' ? 'communist rebels' : 'anti-communist rebels'}</span>
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
  // the player's own nation
  function homePanel() {
    const key = g.nation, d = GAME.info(key), c = g.c[key];
    let h = `<h2>${esc(d.name)} <span class="you">your nation</span></h2><div class="sub">${esc(D.REGIONS[d.region])} · worth ${'★'.repeat(GAME.valueOf(g, key))}</div>
      <div class="align"><b style="left:20%"></b><b style="left:80%"></b><i style="left:${(c.a + 100) / 2}%"></i></div>
      <div class="ends"><span>Soviet bloc</span><b style="color:var(--ink)">${GAME.leaning(c.a)}</b><span>American bloc</span></div>
      <div class="facts"><div class="fact"><small>Stability</small>${pips(c.stab)}</div><div class="fact"><small>Army</small>${Math.round(c.army)}</div>
      <div class="fact"><small>Economy</small>${'★'.repeat(GAME.valueOf(g, key))} <span class="sub">${c.dev < 3 ? c.devProgress + '/' + (3 + c.dev) : 'max'}</span></div><div class="fact"><small>Income</small>+${GAME.nationIncome(g)} IP/yr</div>
      <div class="fact"><small>Friends</small>${GAME.friendsOf(g).length}</div><div class="fact"><small>Defeated enemies</small>${GAME.puppetsOf(g).length}</div></div>
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

    h += `<div class="sub" style="margin-top:8px">Your score grows with your army, stability, friends (countries that think like you) and defeated enemies. Click another country to act on it.</div>`;
    return h;
  }
  function panel() {
    const el = $('panel');
    const terr = g.nation && sel && g.c[sel] && g.c[sel].owner === g.nation && GAME.territories(g).find(x => x.id === sel);
    if (terr) { const t = terr; el.innerHTML = `<h2>${esc(GAME.info(sel).name)} <span class="you">your territory</span></h2>` + terrCard(t) + '<h3 style="margin-top:18px">Your nation</h3>' + homePanel(); bind(el); return; }
    if (g.nation && (!sel || sel === g.nation)) { el.innerHTML = homePanel(); bind(el); return; }   // your own country: the management menu
    if (!sel) {
      el.innerHTML = `<h2>${esc(GAME.NAME[g.side])}</h2><div class="sub">You lead the ${g.side === 'US' ? 'West' : 'East'}. Goal: have the higher score in ${GAME.END}.</div>
        ${alliancesLine(GAME.HOME[g.side])}
        <h3>What to do</h3><ul class="empty">
        <li><b>Click a country</b> on the map to see it and act on it.</li>
        <li>Push countries past <b>${GAME.BLOC}</b> toward you to bring them into your bloc. Each adds its value to your score.</li>
        <li>Neutral and unstable countries (few ● dots) are easiest to win.</li>
        <li>Coups and invasions are fast but raise <b>tension</b>. At 100: nuclear war, everybody loses. Use <b>Détente</b> to cool things down.</li>
        <li>Press <b>End Year</b> when you are done.</li></ul>`;
      return;
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
      ${alliancesLine(sel)}${GAME.lostLand(g, sel).map(k => `<div class="sub" style="color:#f0a03c">Lost land to ${esc(GAME.info(k.taker).name)} in ${k.year}.</div>`).join('')}${partiesHtml(sel)}`;
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
      ${saved && !saved.over ? `<button class="go" id="resume">CONTINUE (${esc(saved.nation ? GAME.info(saved.nation).name : saved.side === 'US' ? 'USA' : 'USSR')}, ${saved.year})</button>` : ''}
      <h3 style="margin-top:20px">How to play</h3>${howTo()}`);
    document.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { g = GAME.newGame(b.dataset.side); sel = null; close(); refresh(); showEvents(); });
    if ($('resume')) $('resume').onclick = () => { g = rebuild(saved); sel = null; close(); refresh(); showEvents(); };
  }
  // saved games lose their functions (event options), so pending events are looked up again
  function rebuild(s) { GAME.applyNames(s); s.pending = (s.pending || []).map(p => D.EVENTS.find(e => e.title === p.title)).filter(Boolean); return s; }
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
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && $('modal').hidden) endYear(); if (e.key === 'Escape' && $('modal').hidden) { sel = null; refresh(); } });

  // for the browser console and tests: ironCurtain.game is the game being played
  window.ironCurtain = { get game() { return g; }, refresh, zoomTo, frontField, center,
    view: (lon, lat, k) => { const [x, y] = proj([lon, lat]); svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * x, H / 2 - k * y).scale(k)); } };
  start();
})();
