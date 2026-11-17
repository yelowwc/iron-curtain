// Iron Curtain - the rules of the game. No drawing here, so it also runs in Node for testing.
//
// Who plays: the player is either a superpower ('US' or 'SU') or any other nation ('ME').
// A superpower wins by having more countries in its bloc than the rival in 1991.
// A nation tries to survive and grow: a bigger army, more friends, defeated enemies.
(function (G) {
  if (!G.CWPROV && typeof require === 'function') try { require('./provinces.js'); } catch (e) { }
  if (!(G.DATA && G.DATA.TREES) && typeof require === 'function') try { require('./trees.js'); } catch (e) { }
  const D = G.DATA, NB = G.NEIGHBOURS || {};
  const START = 1947, END = 1991;
  const SIDE = { US: 1, SU: -1 };                 // +alignment is American, -alignment is Soviet
  const OTHER = { US: 'SU', SU: 'US' };
  const NAME = { US: 'United States', SU: 'Soviet Union' };
  const HOME = { US: 'USA', SU: 'SUN' };
  const BLOC = 60;                                 // alignment needed to count as part of a bloc
  const STAB = [0, 1.6, 1.3, 1, 0.7, 0.45];        // unstable countries are easier to sway

  // Moves on other countries. cost in Influence Points (IP).
  const ACTIONS = {
    propaganda: { name: 'Propaganda', cost: 1, help: 'Radio, newspapers and films. A small push toward you.' },
    aid: { name: 'Economic Aid', cost: 3, help: 'Loans and factories. A big push toward you.' },
    coup: { name: 'Back a Coup', cost: 5, help: 'Friendly officers seize power. Risky, and raises tension.' },
    arm: { name: 'Arm a Side', cost: 2, help: 'Send weapons to your side in a civil war.' },
    troops: { name: 'Send Troops', cost: 6, help: 'Your own army joins the fight. Strong, but raises tension, costs 2 IP every year, and losing hurts.' },
    invade: { name: 'Invade', cost: 6, help: 'March your army across the border. Win, and the country gets a government loyal to you.' },
  };
  // Moves a nation makes at home.
  const HOME_ACTIONS = {
    army: { name: 'Build the Army', cost: 3, help: 'More soldiers and tanks: army +3.' },
    stabilise: { name: 'Stabilise', cost: 3, help: 'Police, wages, order: stability +1. Unstable countries invite coups and rebels.' },
    develop: { name: 'Develop the Economy', cost: 4, help: 'Factories, roads, schools. Enough investment makes your country worth more: more income, a bigger army, a higher score.' },
    crush: { name: 'Fight the Rebels', cost: 2, help: 'Throw your army at the rebels: a push for the government this year.' },
    west: { name: 'Lean West', cost: 2, help: 'Move 15 toward the Americans.' },
    east: { name: 'Lean East', cost: 2, help: 'Move 15 toward the Soviets.' },
    neutral: { name: 'Stay Non-aligned', cost: 2, help: 'Move 15 toward the middle. Both superpowers will court you.' },
    join: { name: 'Join an alliance', cost: 3, help: 'Its members will defend you if you are attacked.' },
    leave: { name: 'Leave the alliance', cost: 0, help: 'Its members no longer defend you. Its leader will not be pleased.' },
  };
  // ---- political parties ----
  const PARTIES = [
    { id: 'com', name: 'Communists', color: '#c62828', gov: 'Socialist', pull: -3 },
    { id: 'soc', name: 'Socialists', color: '#e57373', gov: 'Republic', pull: -1 },
    { id: 'lib', name: 'Liberals', color: '#4f8fe6', gov: 'Democracy', pull: 1 },
    { id: 'con', name: 'Conservatives', color: '#1f4e8c', gov: 'Democracy', pull: 2 },
    { id: 'nat', name: 'Nationalists', color: '#8d6e4a', gov: 'Dictatorship', pull: 0 },
  ];
  const PARTY = {}; PARTIES.forEach(p => PARTY[p.id] = p);
  const VOTING = gov => gov === 'Democracy' || gov === 'Republic';
  const ARM_COST = 2, TROOPS_COST = 6, UPKEEP = 2, DETENTE_COST = 3;
  const RIVALS = [['ISR', 'EGY'], ['ISR', 'SYR'], ['IND', 'PAK'], ['IRQ', 'IRN'], ['SOM', 'ETH'], ['CHN', 'IND'], ['VNM', 'KHM'],
    ['CHN', 'VNM'], ['GRC', 'TUR'], ['MAR', 'DZA'], ['LBY', 'TCD'], ['IRQ', 'KWT'], ['PER', 'ECU'], ['HND', 'SLV'], ['UGA', 'TZA'], ['ARG', 'CHL']];
  const CAPITAL_AT = 60;                           // how far a front must get to take the capital
  // ---- the superpowers at home: programmes, the space race, morale ----
  const PROGRAMS = {
    space: { name: 'Space Programme', cost: 4, max: 2, help: 'Money for the rocket scientists. Reach a milestone first and the world takes notice (score).' },
    arms: { name: 'Nuclear Build-up', cost: 5, max: 1, help: 'Arsenal +1. Tension rises and the economy carries the cost, but a bigger arsenal than the rival’s is respected (score +1).' },
    homefront: { name: 'Home Front', cost: 4, max: 1, help: 'Housing, consumer goods, wages: home morale +6. At 0 morale the country falls apart.' },
    army: { name: 'Expand the Army', cost: 4, max: 1, help: 'More divisions, tanks and carriers: army +3, up to 60.' },
  };
  const SPACE = [
    { n: 'Satellite', c: 8, p: 2 }, { n: 'Animal in orbit', c: 8, p: 0 }, { n: 'Man in orbit', c: 10, p: 2 },
    { n: 'Spacewalk', c: 10, p: 0 }, { n: 'Orbital docking', c: 12, p: 1 }, { n: 'Moon landing', c: 18, p: 3 },
    { n: 'Space station', c: 14, p: 1 }, { n: 'Reusable shuttle', c: 14, p: 0 },
  ];
  const newPw = () => ({ US: { home: 70, econ: 100, growth: 3, arms: 2, space: 0, spaceProg: 0, buys: {} }, SU: { home: 70, econ: 45, growth: 6, arms: 1, space: 0, spaceProg: 0, buys: {} } });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const info = key => D.BY_KEY[key];
  const isHome = key => !!info(key) && info(key).region === 'HOME';
  const neighbours = (a, b) => (NB[a] || []).includes(b) || DYN.has(a + '|' + b);
  // do a's lands (itself and what it annexed) border b?
  // do the lands of state a (itself, its regions, what it annexed) border the lands of state b?
  const landsOf = (g, key) => [key, ...ownedBy(g, key)];
  const borders = (g, a, b) => { syncBorders(g); const B = landsOf(g, stateOf(g, b)); return landsOf(g, stateOf(g, a)).some(k => B.some(j => neighbours(k, j))); };
  const modOf = (g, key, m) => (g && g.c[key] && g.c[key].mods && g.c[key].mods[m]) || 0;
  const baseArmy = (key, g) => isHome(key) ? (key === 'USA' ? 30 : 40) : valueOf(g, key) * 3 + info(key).stab + modOf(g, key, 'army');
  // a country's worth: its starting value, plus what the player has developed, plus its lands
  // (its own regions - Scotland for Britain, Ukraine for the USSR - count a little; conquered countries in full)
  function valueOf(g, key) {
    if (!g || !g.c[key]) return info(key).val;
    const share = (k, o) => isUnionPart(g, k) ? 0.3 : o && o.policy === 'autonomy' ? 0.5 : 1;
    let v = info(key).val + (g.c[key].dev || 0) + ownedBy(g, key).reduce((t, k) => t + info(k).val * share(k, g.c[k].occ), 0);
    for (const k of g.cuts || []) { const kv = blockVal(k.ids || []); if (k.taker === key) v += kv * share(k.occ); if (k.land === key) v -= kv; }
    return Math.max(1, Math.round(v));
  }
  const ownedBy = (g, key) => D.COUNTRIES.filter(d => g.c[d.key] && g.c[d.key].owner === key).map(d => d.key);
  const stateOf = (g, key) => (g.c[key] && g.c[key].owner) || key;
  // a region of a union (a Soviet republic, Scotland, Quebec...) still inside the country it belongs to
  const isUnionPart = (g, key) => !!(g.c[key] && g.c[key].owner && info(key).union === g.c[key].owner);
  const regionsOf = (g, key) => D.COUNTRIES.filter(d => d.union === key && g.c[d.key].owner === key).map(d => d.key);
  const free = (g, key) => !!(g.c[key] && g.c[key].independent && !g.c[key].owner);

  // ================= provinces =================
  // Every land is cut into real provinces (provinces.js, built by tools/build_provinces.sh). A war's
  // front still rolls smoothly over the whole country; provinces matter when land changes hands:
  // a cut (g.cuts) is a list of provinces of `land` that `taker` now holds.
  const PROV = G.CWPROV || [], PBY = {}, PROVS_OF = {};
  for (const p of PROV) { PBY[p.id] = p; (PROVS_OF[p.key] = PROVS_OF[p.key] || []).push(p.id); }
  // a province's share of its country's value: half by area, half spread evenly; the capital counts double
  const PW = {};
  for (const k in PROVS_OF) {
    const ids = PROVS_OF[k], area = ids.reduce((t, i) => t + PBY[i].km2, 0) || 1;
    const raw = ids.map(i => (0.5 * PBY[i].km2 / area + 0.5 / ids.length) * (PBY[i].cap ? 2 : 1)), tot = raw.reduce((a, b) => a + b, 0);
    ids.forEach((i, n) => PW[i] = raw[n] / tot);
  }
  const provVal = id => (isHome(PBY[id].key) ? 10 : info(PBY[id].key).val) * PW[id];
  const blockVal = ids => ids.reduce((t, i) => t + provVal(i), 0);
  const cutsOf = g => (g && g.cuts) || [];
  function holderOf(g, id) { for (const k of cutsOf(g)) if (k.ids && k.ids.includes(id)) return k.taker; return PBY[id].key; }
  const provsHeldBy = (g, key) => PROV.filter(p => holderOf(g, p.id) === key).map(p => p.id);
  const provList = ids => { const n = ids.map(i => PBY[i].name); return n.length <= 3 ? n.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`; };
  // land borders follow the provinces: a country that takes a province now touches its neighbours
  const DYN = new Set(); let dynSig = '';
  function syncBorders(g) {
    const sig = cutsOf(g).map(k => k.land + k.taker + (k.ids || []).join('.')).join(',');
    if (sig === dynSig) return; dynSig = sig;
    DYN.clear();
    if (!cutsOf(g).length) return;
    const h = {}; for (const k of cutsOf(g)) for (const i of k.ids || []) h[i] = k.taker;
    for (const i in h) for (const q in PBY[i].nb) { const b = h[q] || PBY[q].key, a = h[i]; if (a !== b) { DYN.add(a + '|' + b); DYN.add(b + '|' + a); } }
  }
  // Treaty land is ONE compact block next to the winner: nearest the border first, never the capital,
  // never cutting the loser in two, every province sharing a real stretch of border with the winner
  // (or the block), at most a third of the land. A land of one or two provinces gives none.
  function landBlock(g, win, land, maxShare, maxDepth) {
    const winState = stateOf(g, win), isWin = id => { const h = holderOf(g, id); return h !== land && stateOf(g, h) === winState; };
    const pool = new Set(provsHeldBy(g, land).filter(i => PBY[i].key === land));
    if ((PROVS_OF[land] || []).length <= 2 || !pool.size) return [];
    const nbLen = id => Object.values(PBY[id].nb).reduce((a, b) => a + b, 0) || 1;
    const touch = (id, block) => Object.entries(PBY[id].nb).reduce((t, [q, l]) => t + (isWin(+q) || block.has(+q) ? l : 0), 0);
    const dist = {}, open = [];
    for (const id of pool) if (Object.keys(PBY[id].nb).some(q => isWin(+q))) { dist[id] = 0; open.push(id); }
    if (!open.length) return [];
    while (open.length) {                                       // how far each province lies from the winner, walking through the land
      open.sort((a, b) => dist[a] - dist[b]);
      const id = open.shift(), c = PBY[id].c;
      for (const q in PBY[id].nb) {
        const j = +q; if (!pool.has(j)) continue;
        const e = PBY[j].c, km = Math.hypot((c[0] - e[0]) * Math.cos((c[1] + e[1]) * Math.PI / 360), c[1] - e[1]) * 111;
        if (dist[j] === undefined || dist[id] + km < dist[j]) { if (dist[j] === undefined) open.push(j); dist[j] = dist[id] + km; }
      }
    }
    const far = Math.max(1, ...Object.values(dist));
    const parts = set => {
      const seen = new Set(); let n = 0;
      for (const id of set) {
        if (seen.has(id)) continue; n++;
        const s = [id]; seen.add(id);
        while (s.length) { const x = s.pop(); for (const q in PBY[x].nb) { const j = +q; if (set.has(j) && !seen.has(j)) { seen.add(j); s.push(j); } } }
      }
      return n;
    };
    const total = blockVal(PROVS_OF[land]), cap = total * Math.min(maxShare, 1 / 3) - blockVal((PROVS_OF[land] || []).filter(i => !pool.has(i)));
    const block = new Set(), keep = new Set(pool), pieces0 = parts(keep);
    let got = 0;
    const order = Object.keys(dist).map(Number).sort((a, b) => dist[a] - dist[b]);
    for (let pass = 0; pass < 3; pass++) for (const id of order) {
      if (block.has(id) || PBY[id].cap) continue;
      if (dist[id] / far > maxDepth + 0.05 || got + provVal(id) > cap + 1e-9 || touch(id, block) < 0.2 * nbLen(id)) continue;
      keep.delete(id);
      if (!keep.size || parts(keep) > pieces0) { keep.add(id); continue; }
      block.add(id); got += provVal(id);
    }
    for (const id of [...keep]) {                               // a pocket the winner now surrounds goes with the block
      if (PBY[id].cap || keep.size <= 1) continue;
      const nb = Object.keys(PBY[id].nb).map(Number);
      if (nb.length && nb.every(j => isWin(j) || block.has(j))) { keep.delete(id); block.add(id); }
    }
    return [...block].sort((a, b) => dist[a] - dist[b]);
  }

  // ================= a new game =================
  // who: 'US', 'SU', or the key of any other country
  const ORIGINAL_NAMES = {}; D.COUNTRIES.forEach(d => ORIGINAL_NAMES[d.key] = d.fullName);
  // names follow the map: the USSR without its republics is Russia, North Vietnam holding the South is Vietnam,
  // a united Germany is Germany; a nation the player formed keeps the name it was given
  function applyNames(g) {
    for (const d of D.COUNTRIES) d.name = ORIGINAL_NAMES[d.key];
    if (g && g.c) {
      for (const d of D.COUNTRIES) {
        if (d.coreName && !D.COUNTRIES.some(x => x.union === d.key && !x.core && g.c[x.key] && g.c[x.key].owner === d.key)) d.name = d.coreName;
        if (d.freeName && g.c[d.key] && g.c[d.key].owner !== d.union) d.name = d.freeName;
        if (d.unitedName && g.c[d.unites] && g.c[d.unites].owner === d.key) d.name = d.unitedName;
      }
      for (const u of D.UNIFICATIONS || []) if (!u.reunion && g.c[u.a] && g.c[u.b]) {
        if (g.c[u.b].owner === u.a) info(u.a).name = u.name;
        if (g.c[u.a].owner === u.b) info(u.b).name = u.name;
      }
    }
    for (const k in (g && g.names) || {}) if (info(k)) info(k).name = g.names[k];
  }
  function newGame(who) {
    applyNames(null);
    const nation = who === 'US' || who === 'SU' ? null : who;
    const g = { side: nation ? null : who, nation, year: START, tension: 15, over: null, pending: [], news: [], c: {}, wars: [], warId: 0, pacts: [],
      ip: { US: 14, SU: 13, ME: 6 }, bonus: { US: 0, SU: 0, ME: 0 }, detenteUsed: false, homeMoves: {}, start: 0, names: {}, peace: null, formed: [], cuts: [], pw: newPw(), firsts: {},
      reform: false, verdict: null, units: [], ctl: {}, unitId: 0, season: 0, stance: {} };
    for (const d of D.COUNTRIES)
      g.c[d.key] = { a: d.a, stab: d.stab, independent: !d.indep || d.indep <= START, war: null, moves: 0, army: baseArmy(d.key), puppetOf: null,
        gov: (D.GOVS || {})[d.key] || 'Republic', dev: 0, devProgress: 0, parties: null, ruling: null, owner: null, since: 0 };
    // regions start inside their union: no army of their own, the owner's politics
    for (const d of D.COUNTRIES) if (d.union) Object.assign(g.c[d.key], { owner: d.union, since: d.since || START, army: 0, occ: Object.assign(newOcc(0), { core: true }) });
    for (const d of D.COUNTRIES) if (d.union) g.c[d.key].a = ownerAlign(g, d.union);
    for (const d of D.COUNTRIES) setupParties(g, d.key);
    applyNames(g);
    say(g, 'The Second World War is over. The world splits into two camps.');
    runEvents(g);
    if (nation) g.start = nationScore(g);
    if (nation && g.c[nation].owner) { g.support = 20; g.militia = 0; g.fromUnion = true; }
    return g;
  }
  function say(g, text) { g.news.unshift({ year: g.year, text }); g.news.length = Math.min(g.news.length, 80); }
  const myKey = (g, actor) => actor === 'ME' ? g.nation : HOME[actor];
  const ownerAlign = (g, owner) => isHome(owner) ? (owner === 'USA' ? 100 : -100) : g.c[owner].a;
  const actorName = (g, actor) => actor === 'ME' ? info(g.nation).name : NAME[actor];

  // ================= who holds what =================
  function blocOf(g, key) {
    const c = g.c[key];
    if (c.owner) return isUnionPart(g, key) ? null : blocOf(g, c.owner);      // a union's own regions are part of it, not extra members
    if (isHome(key) || !c.independent || c.war) return null;
    return c.a >= BLOC ? 'US' : c.a <= -BLOC ? 'SU' : null;
  }
  function score(g, side) {
    let s = g.bonus[side];
    for (const d of D.COUNTRIES) if (blocOf(g, d.key) === side) s += d.val;
    return s;
  }
  function deployed(g, side) {
    let n = g.wars.filter(w => w.troops[side]).length;
    for (const k in g.c) if (g.c[k].war && g.c[k].war.troops && g.c[k].war.troops[side]) n++;
    return n;
  }
  function income(g, side) {
    let n = (side === 'SU' ? 14.3 : 8.8) + (g.pw ? g.pw[side].econ / (side === 'SU' ? 30 : 50) : 1.8);   // the Soviet planned economy starts with fewer friends but more to spend; both grow with the economy
    for (const d of D.COUNTRIES) if (blocOf(g, d.key) === side) n += d.val * 0.25;
    return Math.round(n + modOf(g, HOME[side], 'income'));
  }
  // Nationalists, kings, dictators and juntas go their own way: they may lean toward a superpower, but they do
  // not join its bloc unless they sign up to an alliance; outside pressure moves them less.
  const OWN_WAY = 45;
  const ownWay = (g, key) => { const c = g.c[key]; return !!c && !isHome(key) && (['Monarchy', 'Dictatorship', 'Junta'].includes(c.gov) || c.ruling === 'nat' || (c.mods && c.mods.ownWay && !['com', 'soc'].includes(c.ruling) && !['Socialist', 'Revolutionary'].includes(c.gov))) && !pactsOf(g, key).length; };
  function leaning(a) {
    if (a >= BLOC) return 'American bloc'; if (a >= 25) return 'Leans West';
    if (a <= -BLOC) return 'Soviet bloc'; if (a <= -25) return 'Leans East'; return 'Neutral';
  }
  // ---- a nation's own measures ----
  function friendsOf(g) {
    const me = g.c[g.nation];
    return D.COUNTRIES.filter(d => d.key !== g.nation && !isHome(d.key) && free(g, d.key) && Math.abs(g.c[d.key].a - me.a) <= 20);
  }
  const puppetsOf = g => D.COUNTRIES.filter(d => g.c[d.key].puppetOf === g.nation);
  function nationScore(g) {
    const me = g.c[g.nation];
    let s = g.bonus.ME + valueOf(g, g.nation) * 3 + me.stab * 2 + Math.round(me.army / 3) + g.formed.length * 5;
    for (const f of friendsOf(g)) s += f.val * 0.3;
    for (const k of new Set(pactsOf(g, g.nation).flatMap(p => p.members))) if (k !== g.nation && !isHome(k)) s += info(k).val * 0.3;
    for (const p of puppetsOf(g)) s += p.val * 2;
    s = Math.round(s);
    return s;
  }
  function nationIncome(g) {
    const occ = territories(g).reduce((t, x) => t + (x.occ.policy === 'exploit' ? x.worth * 1.5 : x.occ.policy === 'integrate' && !x.occ.core ? -1 : 0), 0);
    if (captive(g)) return Math.round(3 + (g.support || 0) / 12);
    return Math.round(3 + valueOf(g, g.nation) * 1.5 + (pactsOf(g, g.nation).length ? 2 : 0) + puppetsOf(g).length - (g.c[g.nation].war ? 2 : 0) + occ + modOf(g, g.nation, 'income'));
  }
  function grade(gain) {
    if (gain >= 30) return 'Rising Power';
    if (gain >= 10) return 'Respected Nation';
    if (gain >= 0) return 'Survivor';
    return 'Diminished';
  }

  // ================= parties and government =================
  // the support each party "naturally" has, from the country's camp and its government
  function partyTarget(c) {
    const a = c.a, w = { com: 4 + Math.max(0, -a) * 0.55, soc: 14 + Math.max(0, 40 - Math.abs(a + 20)) * 0.2, lib: 8 + Math.max(0, a) * 0.35, con: 10 + Math.max(0, a) * 0.3, nat: 12 };
    if (c.gov === 'Socialist') { w.com += 45; w.lib *= 0.4; w.con *= 0.4; }
    if (c.gov === 'Dictatorship' || c.gov === 'Junta') w.nat += 35;
    if (c.gov === 'Monarchy') w.con += 25;
    if (c.gov === 'Democracy') { w.lib += 14; w.con += 10; }
    if (c.gov === 'Republic') { w.soc += 8; w.lib += 6; }
    return normalise(w);
  }
  function normalise(w) { const t = Object.values(w).reduce((x, y) => x + y, 0) || 1; for (const k in w) w[k] = w[k] / t * 100; return w; }
  function rulingFor(c) {
    if (c.gov === 'Socialist') return 'com';
    if (c.gov === 'Dictatorship' || c.gov === 'Junta') return 'nat';
    if (c.gov === 'Monarchy') return 'con';
    return ['lib', 'con', 'soc'].sort((x, y) => c.parties[y] - c.parties[x])[0];
  }
  function setupParties(g, key) {
    const c = g.c[key];
    if (key === 'USA') { c.parties = { com: 1, soc: 4, lib: 48, con: 44, nat: 3 }; c.ruling = 'lib'; return; }
    if (key === 'SUN') { c.parties = { com: 92, soc: 3, lib: 2, con: 1, nat: 2 }; c.ruling = 'com'; return; }
    c.parties = partyTarget(c); c.ruling = rulingFor(c);
  }
  function boostParty(g, key, id, n) { const c = g.c[key]; c.parties[id] = Math.max(0, c.parties[id] + n); normalise(c.parties); }
  // a party takes over: the government changes to suit it
  function takePower(g, key, id) {
    const c = g.c[key]; c.ruling = id;
    if (!(c.gov === 'Monarchy' && (id === 'con' || id === 'lib'))) c.gov = PARTY[id].gov;
  }
  // parties drift and elections are held
  function partyYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key];
      if (isHome(d.key) || !c.independent || c.owner) continue;
      const T = partyTarget(c), P = c.parties;
      for (const k in P) P[k] += (T[k] - P[k]) * 0.1 + rand(-1, 1);
      normalise(P);
      const top = PARTIES.map(p => p.id).sort((x, y) => P[y] - P[x])[0];
      if (VOTING(c.gov) && (g.year + d.key.charCodeAt(0)) % 4 === 0 && top !== c.ruling && !c.war) {
        if (d.key === g.nation) say(g, `Elections: the ${PARTY[top].name} win and take over your government.`);
        else if (top === 'com' || top === 'nat') say(g, `${d.name}: the ${PARTY[top].name} win the election.`);
        takePower(g, d.key, top);
        if (d.key !== g.nation && (top === 'com' || top === 'nat')) c.a = clamp(c.a + (top === 'com' ? -12 : 0), -100, 100);
      } else if (!VOTING(c.gov) && !c.war && c.stab <= 2 && d.key !== g.nation) {
        // in a dictatorship, a strong party shut out of power may take up arms
        const opp = PARTIES.map(p => p.id).filter(i => i !== c.ruling && P[i] > 40)[0];
        if (opp && Math.random() < 0.08) civilWar(g, d.key, opp === 'com' || opp === 'soc' ? 'SU' : 'US', 0, opp);
      }
    }
  }

  // governments change by themselves: kings fall, juntas take over, dictators give way to elections
  function setGov(g, key, gov, ruling, text, lean) {
    const c = g.c[key]; c.gov = gov; c.ruling = ruling; c.govSince = g.year; boostParty(g, key, ruling, 12);
    if (lean) c.a = clamp(c.a + lean, -100, 100);
    say(g, text);
  }
  function govYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key];
      if (isHome(d.key) || !c.independent || c.owner || c.war || !c.parties || d.key === g.nation) continue;   // you run your own government
      const P = c.parties, nm = d.name, gov = c.gov, r = Math.random(), right = P.lib + P.con;
      if (gov === 'Monarchy' && c.stab <= 2 && r < 0.07) {
        if (P.com > 30) setGov(g, d.key, 'Socialist', 'com', `Revolution in ${nm}! The king is overthrown and a people's republic proclaimed.`, -25);
        else if (P.nat > 22) setGov(g, d.key, 'Junta', 'nat', `Army officers overthrow the king of ${nm}.`);
        else setGov(g, d.key, 'Republic', 'soc', `${nm} abolishes its monarchy and becomes a republic.`, -8);
      } else if (gov === 'Junta' && c.stab >= 4 && r < 0.15) setGov(g, d.key, 'Dictatorship', 'nat', `${nm}: the junta's leader makes himself president for life.`);
      else if ((gov === 'Dictatorship' || gov === 'Junta') && right + P.soc > 55 && r < (g.year >= 1974 ? 0.07 : 0.02) * (c.stab <= 3 ? 1.5 : 1)) {
        const w = ['lib', 'con', 'soc'].sort((x, y) => P[y] - P[x])[0];
        setGov(g, d.key, 'Democracy', w, `${nm} returns to democracy: the ${PARTY[w].name} win the first free elections.`, 8);
      } else if (VOTING(gov) && c.stab <= 2 && P.nat > 20 && r < 0.035) setGov(g, d.key, 'Junta', 'nat', `Coup in ${nm}: the army seizes power.`, c.a < 0 ? 10 : 0);
      else if (VOTING(gov) && c.ruling === 'com' && c.a <= -60 && c.stab <= 3 && r < 0.08 && !pactsOf(g, d.key).some(p => p.side === 'US'))
        setGov(g, d.key, 'Socialist', 'com', `${nm}: the Communist government bans the other parties.`);
      else if (gov === 'Socialist' && right > 40 && c.stab <= 2 && r < 0.05) setGov(g, d.key, 'Democracy', P.lib > P.con ? 'lib' : 'con', `${nm}: the Party gives up power; free elections are called.`, 20);
    }
  }

  // ================= alliances =================
  const pactsOf = (g, key) => g.pacts.filter(p => p.members.includes(key));
  const allied = (g, a, b) => pactsOf(g, a).some(p => p.members.includes(b));
  const fitsPact = (g, p, key) => isHome(key) ? HOME[p.side] === key : free(g, key) && g.c[key].a * SIDE[p.side] >= 0;
  function foundPact(g, def) {
    const p = { id: def.id, name: def.name, side: def.side, color: def.color, members: def.members.filter(k => g.c[k] && fitsPact(g, p0(def), k)) };
    g.pacts.push(p);
    say(g, `${def.name} is founded: ${p.members.length} countries promise to defend each other.`);
  }
  const p0 = def => ({ side: def.side });
  function allianceYear(g) {
    for (const def of D.PACTS) {
      if (def.year === g.year && !g.pacts.some(p => p.id === def.id)) foundPact(g, def);
      const p = g.pacts.find(x => x.id === def.id); if (!p) continue;
      if (def.ends === g.year) { g.pacts = g.pacts.filter(x => x !== p); say(g, `${p.name} is dissolved.`); continue; }
      for (const k of (def.later || {})[g.year] || []) if (!p.members.includes(k) && fitsPact(g, p, k)) { p.members.push(k); say(g, `${info(k).name} joins ${p.name}.`); }
      for (const k of p.members.slice()) if (!isHome(k) && g.c[k].a * SIDE[p.side] < -15) {
        p.members = p.members.filter(m => m !== k); say(g, `${info(k).name} leaves ${p.name}.`);
      }
    }
  }
  // how much a country's allies add to its defence (nobody fights for a member that attacks another member)
  function allyHelp(g, def, att) {
    let s = 0;
    for (const p of pactsOf(g, def)) for (const k of p.members) {
      if (k === def || k === att || allied(g, k, att)) continue;
      s += isHome(k) ? 18 : g.c[k].army * 0.25;
    }
    return Math.min(s, 45);
  }

  // ================= decision trees =================
  // Like national focuses, but decisions (trees.js): each costs IP and needs the ones above it. Who pays:
  // the player (their IP), a computer superpower (its IP), a computer nation (decision points it saves up).
  const TREES = (D.TREES || { NATION: [], US: [], SU: [], SPECIAL: {} });
  function treeOf(key) {
    if (key === 'USA') return TREES.US; if (key === 'SUN') return TREES.SU;
    return TREES.NATION.concat(TREES.SPECIAL[key] || []);
  }
  const payer = (g, key) => key === g.nation ? 'ME' : g.side && HOME[g.side] === key ? g.side : isHome(key) ? (key === 'USA' ? 'US' : 'SU') : null;
  function decisionCheck(g, key, id) {
    const c = g.c[key], n = treeOf(key).find(x => x.id === id), r = { ok: false, cost: n ? n.cost : 0, why: '' };
    if (!n || !c) return (r.why = 'No such decision', r);
    const done = c.done || [];
    if (done.includes(id)) return (r.why = 'Done', r);
    if ((n.excl || []).some(x => done.includes(x))) return (r.why = 'Closed by an earlier choice', r);
    if ((n.req || []).some(x => !done.includes(x))) return (r.why = 'Needs ' + n.req.filter(x => !done.includes(x)).map(x => treeOf(key).find(y => y.id === x).name).join(' and '), r);
    if (n.any && !n.any.some(x => done.includes(x))) return (r.why = 'Needs ' + n.any.map(x => treeOf(key).find(y => y.id === x).name).join(' or '), r);
    if (n.year && g.year < n.year) return (r.why = 'Not before ' + n.year, r);
    if (n.when && !n.when(g, TH, key)) return (r.why = n.whenWhy || 'Not now', r);
    if (!isHome(key) && (!c.independent || c.owner)) return (r.why = 'Not while it is not free', r);
    const p = payer(g, key), have = p ? g.ip[p] : (c.dp || 0);
    if (have < n.cost) return (r.why = p ? 'Not enough IP' : 'Not enough points', r);
    r.ok = true; return r;
  }
  // helpers for the effects in trees.js
  const TH = {
    isHome, dev: (g, k) => { const c = g.c[k]; if (c) c.dev = Math.min(3, (c.dev || 0) + 1); },
    mod: (g, k, m, n) => { const c = g.c[k]; if (!c) return; c.mods = c.mods || {}; c.mods[m] = (c.mods[m] || 0) + n; },
    stab: (g, k, n) => { const c = g.c[k]; if (c && !isHome(k)) c.stab = n > 0 ? Math.max(c.stab, Math.min(4, c.stab + n)) : clamp(c.stab + n, 1, 5); },   // decisions never make a country rock solid
    army: (g, k, n) => { const c = g.c[k]; if (c) c.army = Math.max(1, c.army + n); },
    party: (g, k, id, n) => { if (g.c[k] && g.c[k].parties) boostParty(g, k, id, n); },
    lean: (g, k, n) => shift(g, k, n),
    tension: (g, n) => addTension(g, n),
    glory: (g, k, n) => { if (k === g.nation) g.bonus.ME += n; },
    support: (g, k, side, n) => { const c = g.c[k]; if (c && c.war) c.war.help[side] += n; },
    inSide: (g, k, side) => pactsOf(g, k).some(p => p.side === side && !p.members.includes(HOME[OTHER[side]])),
    govern: (g, k, gov, party) => { const c = g.c[k]; if (!c) return; c.gov = gov; c.govSince = g.year; party = party || (c.parties ? Object.keys(c.parties).sort((x, y) => c.parties[y] - c.parties[x])[0] : c.ruling); if (party) takePower(g, k, party); },   // no party given: the strongest one
    // join an alliance of that side whose members border this country (or share its region)
    joinNear: (g, k, side) => {
      const reg = info(k).region;
      const p = g.pacts.filter(x => x.side === side && x.id !== 'eu' && !x.members.includes(k)).find(x => x.members.some(m => m !== HOME[side] && (neighbours(m, k) || info(m).region === reg)));
      if (!p) return false;
      p.members.push(k); say(g, `${info(k).name} joins ${p.name}.`); return true;
    },
  };
  function decide(g, key, id) {
    const r = decisionCheck(g, key, id); if (!r.ok) return r.why;
    const c = g.c[key], n = treeOf(key).find(x => x.id === id), p = payer(g, key);
    if (p) g.ip[p] -= n.cost; else c.dp -= n.cost;
    c.done = (c.done || []).concat([id]);
    n.fx(g, TH, key);
    say(g, `${info(key).name}: ${n.name}.`);
    return `${n.name}.`;
  }
  // the computer countries walk their trees: a decision when they can afford one, the ones that fit their politics first
  function aiDecide(g, key, budgetLeft) {
    const c = g.c[key], opts = treeOf(key).filter(n => decisionCheck(g, key, n.id).ok && (!n.ai || n.ai(g, key)));
    if (!opts.length) return false;
    const a = isHome(key) ? SIDE[key === 'USA' ? 'US' : 'SU'] * 100 : c.a;
    const score = n => (n.lean ? (Math.sign(a) === n.lean ? 3 : Math.abs(a) < 25 ? 1 : -3) : 1) + (n.excl && ownWay(g, key) && n.id === 'nonal' ? 3 : 0) + Math.random() * 2 - n.cost * 0.1;
    const pick = opts.sort((x, y) => score(y) - score(x))[0];
    if (budgetLeft !== undefined && pick.cost > budgetLeft) return false;
    decide(g, key, pick.id);
    return true;
  }
  function treeYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key];
      if (isHome(d.key) || d.key === g.nation || !c.independent || c.owner) continue;
      c.dp = Math.min(8, (c.dp || 0) + 0.45 + d.val * 0.2);
      aiDecide(g, d.key);
    }
  }

  // ================= helpers used by events =================
  function shift(g, key, amount) { const c = g.c[key]; if (c && !isHome(key)) c.a = clamp(c.a + amount, -100, 100); }
  function addTension(g, n) {
    g.tension = clamp(g.tension + n, 0, 100);
    if (g.tension >= 100 && !g.over) { g.over = { winner: null, why: 'nuclear' }; say(g, 'NUCLEAR WAR. Nobody wins.'); }
  }
  // Rebels fight for a cause: what they build if they win, and which camp backs them.
  const REBELS = {
    com: { name: 'Communists', camp: 'SU', gov: 'Socialist', a: -70, color: '#c62828' },
    soc: { name: 'Socialist revolutionaries', camp: 'SU', gov: 'Revolutionary', a: -60, color: '#e57373' },
    lib: { name: 'Democrats', camp: 'US', gov: 'Democracy', a: 65, color: '#4f8fe6' },
    con: { name: 'Royalists and conservatives', camp: 'US', gov: 'Monarchy', a: 35, color: '#1f4e8c' },
    nat: { name: 'Nationalist officers', camp: 'US', gov: 'Junta', a: 35, color: '#8d6e4a' },
  };
  // the cause: the biggest party of the rebels' camp that is not in power (Soviet-backed rebels are communists unless the socialists are much bigger)
  function rebelCause(c, rebels) {
    const P = c.parties || {}, ids = rebels === 'SU' ? ['com', 'soc'] : ['lib', 'con', 'nat'];
    const pick = ids.filter(i => i !== c.ruling).sort((x, y) => (P[y] || 0) - (P[x] || 0))[0];
    if (rebels === 'SU') return pick === 'soc' && (P.soc || 0) > (P.com || 0) * 2 ? 'soc' : 'com';
    if (pick === 'con' && c.gov !== 'Monarchy' && !['Socialist', 'Revolutionary'].includes(c.gov)) return (P.lib || 0) > (P.nat || 0) ? 'lib' : 'nat';
    return pick || 'nat';
  }
  function civilWar(g, key, rebels, balance, ideo) {
    const c = g.c[key]; if (!c || !c.independent || c.war || isHome(key) || c.owner) return;
    ideo = ideo && REBELS[ideo] && REBELS[ideo].camp === rebels ? ideo : rebelCause(c, rebels);
    c.war = { rebels, ideo, balance: balance || 0, years: 0, help: { US: 0, SU: 0 }, troops: {} };
    say(g, `Civil war in ${info(key).name}: ${REBELS[ideo].name.toLowerCase()} take up arms (backed by the ${rebels === 'SU' ? 'East' : 'West'}).`);
  }
  // a region rises against the country that holds it. The rebels find a patron in the other camp.
  function rise(g, key) {
    const c = g.c[key]; if (!c || !c.owner || c.war) return;
    const ownerSide = ownerAlign(g, stateOf(g, c.owner)) >= 0 ? 'US' : 'SU', rebels = OTHER[ownerSide];
    c.war = { rebels, balance: SIDE[ownerSide] * 10, years: 0, help: { US: 0, SU: 0 }, troops: {}, sep: true };
    say(g, `${info(key).name} rises against ${info(c.owner).name}!`);
  }
  function endCivil(g, key) { const c = g.c[key]; if (c && c.war) { c.war = null; c.stab = Math.max(c.stab, 2); } }
  // a region leaves its country peacefully and becomes a state of its own (a: its new alignment)
  function freeUnion(g, key, a) {
    const c = g.c[key]; if (!c || !c.owner) return;
    const was = c.owner;
    c.owner = null; c.war = null; c.occ = null; c.gov = 'Republic'; c.stab = 3; c.a = a; c.independent = true; c.puppetOf = null;
    c.army = Math.max(c.army, baseArmy(key, g) * 0.6); setupParties(g, key);
    g.cuts = g.cuts.filter(k => k.land !== key);
    say(g, `${info(key).name} becomes an independent country, free of ${info(was).name}.`);
    if (was === g.nation) g.c[g.nation].stab = Math.max(1, g.c[g.nation].stab - 1);
    applyNames(g);
  }
  // a region changes hands without a war of its own
  function transfer(g, key, owner) {
    const c = g.c[key]; if (!c || c.owner === owner || key === owner) return;
    const was = c.owner; c.war = null; c.owner = owner; c.since = g.year; c.a = ownerAlign(g, owner); c.stab = 2; c.army = 0; c.occ = newOcc(30);
    say(g, `${info(key).name} passes from ${info(was || key).name} to ${info(owner).name}.`);
    if (key === g.nation) overthrow(g, `Your country is handed to ${info(owner).name}. Your government is gone.`);
    applyNames(g);
  }
  // two halves of a divided nation become one (owner absorbs other)
  function unify(g, owner, other) {
    if (!free(g, owner) || !free(g, other) || isHome(other)) return;
    const u = (D.UNIFICATIONS || []).find(x => (x.a === owner && x.b === other) || (x.a === other && x.b === owner));
    annex(g, owner, other);
    Object.assign(g.c[other], { gov: 'Unified state', stab: 3, unified: true, occ: Object.assign(newOcc(0), { core: true }) });
    applyNames(g);
    say(g, `${u && !u.reunion ? u.name + ' is united! ' : ''}${ORIGINAL_NAMES[other]} joins ${ORIGINAL_NAMES[owner]}.`);
    if (other === g.nation) overthrow(g, `${ORIGINAL_NAMES[owner]} absorbs your country peacefully. The nation is one again, but you no longer govern it.`);
  }
  // the computer unites divided nations now and then, when both halves think alike
  function unifyCheck(g, owner, other) {
    const A = g.c[owner], B = g.c[other];
    if (!free(g, owner) || !free(g, other) || isHome(other) || A.war || B.war || warOf(g, owner) || warOf(g, other)) return 0;
    const gap = Math.abs(A.a - B.a); if (gap > 35) return 0;
    return clamp(0.15 + (35 - gap) / 60 + (B.stab <= 2 ? 0.15 : 0) - (B.stab >= 4 ? 0.1 : 0) + (info(owner).val >= info(other).val ? 0.1 : -0.1), 0.05, 0.85);
  }
  function unifyYear(g) {
    for (const u of D.UNIFICATIONS || []) {
      if (u.eventOnly || u.a === g.nation || u.b === g.nation) continue;
      const [big, small] = u.reunion || isHome(u.a) || info(u.a).val >= info(u.b).val ? [u.a, u.b] : [u.b, u.a];
      const ch = unifyCheck(g, big, small);
      if (ch && Math.random() < 0.08 * ch * (u.rare ? 0.12 : 1)) unify(g, big, small);
    }
  }
  // the Soviet Union comes apart: every republic but the Russian core goes its own way
  function endUSSR(g) {
    for (const k of regionsOf(g, 'SUN')) if (!info(k).core) freeUnion(g, k, ['UKR', 'MDA', 'GEO'].includes(k) ? 10 : -15);
    if (g.c.CRM && g.c.CRM.toUkr && g.c.CRM.owner === 'SUN' && free(g, 'UKR')) transfer(g, 'CRM', 'UKR');
    g.bonus.SU -= 5;
  }
  // is the Soviet Union weak enough to come apart? (reformed and not winning, or clearly losing)
  const sovietWeak = g => (g.reform && score(g, 'SU') <= score(g, 'US') + 10) || score(g, 'SU') < score(g, 'US') - 12 || (g.pw && g.pw.SU.home < 30);
  // an event war: nobody declares war for the player
  function eventWar(g, att, def, front) {
    if (att === g.nation) { say(g, `Hawks in ${info(att).name} demand war with ${info(def).name}. You hold them back.`); return null; }
    return startWar(g, att, def, front);
  }
  // A war between two countries. front: -100 (the defender wins) .. +100 (the attacker wins).
  function startWar(g, att, def, front) {
    if (!g.c[att] || !g.c[def] || !g.c[att].independent || !g.c[def].independent || g.c[att].owner || g.c[def].owner || warOf(g, att) || warOf(g, def)) return null;
    const w = { id: ++g.warId, att, def, front: front || 0, years: 0, help: { att: 0, def: 0 }, troops: {}, armed: {}, capFell: {} };
    g.wars.push(w);
    addTension(g, isHome(att) ? 15 : 4);
    say(g, `WAR: ${info(att).name} attacks ${info(def).name}!`);
    const helpers = pactsOf(g, def).flatMap(p => p.members).filter(k => k !== def && k !== att && !allied(g, k, att));
    if (helpers.length) say(g, `${info(def).name}'s allies come to its defence.`);
    return w;
  }
  const warOf = (g, key) => g.wars.find(w => w.att === key || w.def === key);
  // which party of a war is closer to an actor's own position
  function friendIn(g, w, actor) {
    if (actor === 'ME') { const me = g.c[g.nation].a; return Math.abs(g.c[w.att].a - me) <= Math.abs(g.c[w.def].a - me) ? 'att' : 'def'; }
    return (g.c[w.att].a - g.c[w.def].a) * SIDE[actor] >= 0 ? 'att' : 'def';
  }
  const H = {
    war: eventWar, attack: startWar, shift, civilWar, tension: addTension, rise, endCivil, freeUnion, transfer, unify, endUSSR, say,
    limited: (g, att, def, front, noCut) => { const w = eventWar(g, att, def, front); if (w) { w.limited = true; w.noCut = !!noCut; } },
    annexWar: (g, att, def, front) => { const w = eventWar(g, att, def, front); if (w) w.annexOnWin = true; },
    conquer: (g, att, key) => {
      if (key === g.nation) { const w = startWar(g, att, key, 30); if (w) w.annexOnWin = true; }
      else if (att !== g.nation && free(g, key)) { annex(g, att, key); say(g, `${info(att).name} takes over ${info(key).name}.`); }
    },
    liberate: (g, key) => liberate(g, key),
    peace: (g, a, b) => { const w = g.wars.find(x => (x.att === a && x.def === b) || (x.att === b && x.def === a)); if (w) { g.wars = g.wars.filter(x => x !== w); say(g, `Peace between ${info(a).name} and ${info(b).name}.`); } },
    ip: (g, side, n) => { g.ip[side] = Math.max(0, g.ip[side] + n); },
    bonus: (g, side, n) => { g.bonus[side] += n; },
    setAlign: (g, key, a) => { if (g.c[key] && !g.c[key].owner) g.c[key].a = a; },
    set: (g, key, o) => { const c = g.c[key]; if (!c || (c.owner && !('toUkr' in o))) return; Object.assign(c, o); if (o.gov) { c.ruling = rulingFor(c); c.govSince = g.year; } },
    stab: (g, key, n) => { const c = g.c[key]; if (c) c.stab = clamp(c.stab + n, 1, 5); },
    support: (g, key, side, n) => { const c = g.c[key]; if (c && c.war) c.war.help[side] += n; },
    troops: (g, key, side) => { const c = g.c[key]; if (c && c.war && !c.war.troops[side]) { c.war.troops[side] = true; say(g, `The ${NAME[side]} sends its army to ${info(key).name}.`); } },
    free, holds: (g, owner, key) => !!(g.c[key] && g.c[key].owner === owner), regions: regionsOf,
    weak: g => sovietWeak(g), score: (g, side) => score(g, side),
    // for the player's own decisions
    pay: (g, n) => { g.ip.ME = Math.max(0, g.ip.ME + n); },
    glory: (g, n) => { g.bonus.ME += n; },
    army: (g, key, n) => { const c = g.c[key]; if (c) c.army = Math.max(1, c.army + n); },
    party: (g, key, id, n) => { if (g.c[key] && g.c[key].parties) boostParty(g, key, id, n); },
    inPact: (g, id, key) => g.pacts.some(p => p.id === id && p.members.includes(key)),
    pactOpen: (g, id, key) => g.pacts.some(p => p.id === id && !p.members.includes(key)),
    joinPact: (g, id, key) => { const p = g.pacts.find(x => x.id === id); if (p && !p.members.includes(key)) { p.members.push(key); say(g, `${info(key).name} joins ${p.name}.`); } },
    leavePact: (g, id, key) => { const p = g.pacts.find(x => x.id === id); if (p && p.members.includes(key)) { p.members = p.members.filter(m => m !== key); say(g, `${info(key).name} leaves ${p.name}.`); } },
    isHome, atWar: (g, key) => !!warOf(g, key),
    // the player chose this war: no "hawks held back" here
    borderWar: (g, att, def, front) => { const w = startWar(g, att, def, front); if (w) { w.limited = true; w.noCut = true; } },
    conquestWar: (g, att, def, front) => { const w = startWar(g, att, def, front); if (w) w.annexOnWin = true; },
  };

  // ================= moves on other countries =================
  // actor: 'US', 'SU' or 'ME' (the player's nation). Returns { ok, cost, why, chance }.
  function check(g, actor, act, key) {
    const c = g.c[key], A = ACTIONS[act], r = { ok: false, cost: A.cost, why: '' };
    const sp = actor !== 'ME', me = myKey(g, actor);
    if (g.over) return (r.why = 'The game is over', r);
    if (key === me) return (r.why = 'Your own country', r);
    if (isHome(key)) return (r.why = 'A superpower', r);
    if (!c.independent) return (r.why = 'Still a colony', r);
    if (c.owner && !(c.war && (act === 'arm' || act === 'troops'))) return (r.why = `Part of ${info(c.owner).name}`, r);
    if (c.owner && act === 'troops' && stateOf(g, c.owner) === me) return (r.why = 'Your own land', r);
    if (c.moves >= 2) return (r.why = 'Two moves here per year', r);
    if (g.ip[actor] < A.cost) return (r.why = 'Not enough IP', r);
    if (!sp && (act === 'coup' || act === 'troops')) return (r.why = 'Only superpowers can do this', r);
    if ((act === 'arm' || act === 'troops') && !c.war) return (r.why = 'No civil war here', r);
    if (act !== 'arm' && act !== 'troops' && c.war) return (r.why = 'Only arms or troops help during a civil war', r);
    if (act === 'troops' && c.war.troops[actor]) return (r.why = 'Your troops are already there', r);
    if (act === 'invade') {
      if (warOf(g, key)) return (r.why = 'Already at war', r);
      if (warOf(g, me)) return (r.why = 'You are already fighting a war', r);
      if (!sp && !borders(g, me, key)) return (r.why = 'Not your neighbour', r);
      if (sp && c.a * SIDE[actor] >= BLOC) return (r.why = 'One of your own allies', r);
      if (!sp && allied(g, me, key)) return (r.why = 'Your own ally', r);
      if (g.c[me].army < 4) return (r.why = 'Army too small (need 4)', r);
    }
    if (act === 'coup') {
      if (c.a * SIDE[actor] >= BLOC) return (r.why = 'Already in your bloc', r);
      r.chance = clamp(0.3 + (3 - c.stab) * 0.15, 0.1, 0.8);
    }
    if (!sp && (act === 'propaganda' || act === 'aid') && Math.abs(c.a - g.c[g.nation].a) < 3) return (r.why = 'Already thinks like you', r);
    r.ok = true; return r;
  }
  // the camp a nation helps in a civil war: the one closer to its own position
  const nationCamp = g => g.c[g.nation].a >= 0 ? 'US' : 'SU';
  function act(g, actor, actName, key) {
    const r = check(g, actor, actName, key); if (!r.ok) return r.why;
    const c = g.c[key], name = info(key).name;
    const dir = actor === 'ME' ? Math.sign(g.c[g.nation].a - c.a) : SIDE[actor];
    g.ip[actor] -= r.cost; c.moves++;
    if (actName === 'propaganda') { push(g, key, dir * 5 * STAB[c.stab]); return `Propaganda in ${name}.`; }
    if (actName === 'aid') { push(g, key, dir * 12 * STAB[c.stab]); if (Math.random() < 0.25) c.stab = Math.min(4, c.stab + 1); return `Aid flows to ${name}.`; }
    if (actName === 'arm') { const camp = actor === 'ME' ? (c.owner && stateOf(g, c.owner) === g.nation ? OTHER[c.war.rebels] : nationCamp(g)) : actor; c.war.help[camp] += actor === 'ME' ? 8 : 15; addTension(g, 1); return `Weapons for your side in ${name}.`; }
    if (actName === 'troops') { c.war.troops[actor] = true; addTension(g, 8); say(g, `The ${NAME[actor]} sends its army to ${name}.`); return `Your troops land in ${name}.`; }
    if (actName === 'invade') { startWar(g, myKey(g, actor), key, 0); return `Your army crosses into ${name}!`; }
    // coup
    addTension(g, 7);
    if (Math.random() < r.chance) {
      c.a = dir * BLOC; c.stab = Math.max(1, c.stab - 1);
      takePower(g, key, actor === 'SU' ? 'com' : 'nat'); boostParty(g, key, c.ruling, 15);
      say(g, `Coup in ${name}! A government friendly to the ${NAME[actor]} takes power.`);
      if (key === g.nation) overthrow(g, `Officers backed by the ${NAME[actor]} seize power. Your government has fallen.`);
      return `The coup in ${name} worked!`;
    }
    shift(g, key, -dir * 10); g.bonus[actor] -= 2;
    say(g, `A coup in ${name} fails. The ${NAME[actor]} is blamed.`);
    return `The coup in ${name} failed.`;
  }
  // Outside pressure on a country. The player's own nation has a government that pushes back:
  // only 40% of the effect lands, and foreigners can move it at most PUSH_CAP a year.
  const PUSH_CAP = 10;
  const pushRoom = g => Math.max(0, PUSH_CAP - (g.pushed || 0));
  function push(g, key, amount) {
    if (ownWay(g, key)) amount *= 0.6;
    amount *= 1 - Math.min(0.8, modOf(g, key, 'resist'));
    if (key !== g.nation) return shift(g, key, amount);
    const n = Math.sign(amount) * Math.min(Math.abs(amount) * 0.4, pushRoom(g));
    g.pushed = (g.pushed || 0) + Math.abs(n);
    shift(g, key, n);
  }
  function overthrow(g, text) { if (!g.over) { g.over = { winner: null, why: 'overthrown', text }; say(g, text); } }

  // ================= a nation's moves at home =================
  function homeCheck(g, kind, pactId) {
    const A = HOME_ACTIONS[kind], c = g.c[g.nation], r = { ok: false, cost: A.cost, why: '' };
    if (g.over) return (r.why = 'The game is over', r);
    const group = kind === 'west' || kind === 'east' || kind === 'neutral' ? 'lean' : kind;
    if (kind === 'crush' ? (g.homeMoves.crush || 0) >= 2 : g.homeMoves[group]) return (r.why = kind === 'crush' ? 'Twice a year' : 'Once a year', r);
    if (g.ip.ME < A.cost) return (r.why = 'Not enough IP', r);
    if (kind === 'army' && c.army >= baseArmy(g.nation, g) * 2 + 6) return (r.why = 'The army is as big as you can afford', r);
    if (kind === 'develop' && c.dev >= 3) return (r.why = 'Fully developed', r);
    if (kind === 'crush' && !c.war) return (r.why = 'No rebellion', r);
    if (kind === 'neutral' && Math.abs(c.a) < 5) return (r.why = 'Already neutral', r);
    if (kind === 'leave') { const p = g.pacts.find(x => x.id === pactId); if (!p || !p.members.includes(g.nation)) return (r.why = 'Not a member', r); }
    if (kind === 'stabilise' && c.stab >= 5) return (r.why = 'Rock solid already', r);
    if (kind === 'west' && c.a >= 100) return (r.why = 'Already fully Western', r);
    if (kind === 'east' && c.a <= -100) return (r.why = 'Already fully Eastern', r);
    if (kind === 'join') {
      const p = g.pacts.find(x => x.id === pactId);
      if (!p) return (r.why = 'No such alliance', r);
      if (p.members.includes(g.nation)) return (r.why = 'Already a member', r);
      if (c.a * SIDE[p.side] < 25) return (r.why = `Lean ${p.side === 'US' ? 'West' : 'East'} first (25+)`, r);
      r.chance = clamp(0.35 + (c.a * SIDE[p.side] - 25) / 100, 0.2, 0.9);
    }
    r.ok = true; return r;
  }
  function homeAct(g, kind, pactId) {
    const r = homeCheck(g, kind, pactId); if (!r.ok) return r.why;
    const c = g.c[g.nation];
    g.ip.ME -= r.cost;
    if (kind === 'crush') g.homeMoves.crush = (g.homeMoves.crush || 0) + 1;
    else g.homeMoves[kind === 'west' || kind === 'east' || kind === 'neutral' ? 'lean' : kind] = true;
    if (kind === 'develop') {
      c.devProgress++;
      if (c.devProgress >= 3 + c.dev) { c.devProgress = 0; c.dev++; say(g, `${info(g.nation).name}'s economy grows: the country is now worth ${valueOf(g, g.nation)} stars.`); return 'The economy grows! Your country is worth more now.'; }
      return `Investing... ${c.devProgress}/${3 + c.dev} toward the next step.`;
    }
    if (kind === 'crush') { const gov = c.war.rebels === 'US' ? 'SU' : 'US'; c.war.help[gov] += 10 + c.army * 0.5; return 'Your army strikes the rebels.'; }
    if (kind === 'leave') { const p = g.pacts.find(x => x.id === pactId); p.members = p.members.filter(m => m !== g.nation); addTension(g, 2); say(g, `${info(g.nation).name} leaves ${p.name}.`); return `You leave ${p.name}.`; }
    if (kind === 'army') { c.army += 3; return `Your army grows to ${Math.round(c.army)}.`; }
    if (kind === 'stabilise') { c.stab++; return 'Order is restored. Stability +1.'; }
    if (kind === 'west' || kind === 'east' || kind === 'neutral') {
      const was = c.a; c.a = clamp(c.a + (kind === 'west' ? 15 : kind === 'east' ? -15 : -Math.sign(c.a) * Math.min(15, Math.abs(c.a))), -100, 100);
      // walking out of a bloc angers its leader
      for (const p of ['US', 'SU']) if (was * SIDE[p] >= BLOC && c.a * SIDE[p] < BLOC && Math.random() < 0.4) {
        civilWar(g, g.nation, p, SIDE[p] * 15);
        return `The ${NAME[p]} is furious and backs a rebellion against you!`;
      }
      return kind === 'west' ? 'You move closer to Washington.' : kind === 'east' ? 'You move closer to Moscow.' : 'You keep both giants at arm\'s length.';
    }
    const p = g.pacts.find(x => x.id === pactId);
    if (Math.random() < r.chance) { p.members.push(g.nation); say(g, `${info(g.nation).name} joins ${p.name}.`); return `Welcome to ${p.name}!`; }
    return `${p.name} says no this year.`;
  }

  // ================= border changes after wars =================
  // A cut: part of `land` (from the border with `taker`, `depth` 0..1 of the way in) now belongs to `taker`.
  // the provinces handed over are one compact block from the border (see landBlock)
  function cutLand(g, land, taker, depth) {
    if (isHome(land) || land === taker) return [];
    const ids = landBlock(g, taker, land, 1 / 3, clamp(depth, 0.12, 1));
    if (!ids.length) return [];
    const old = g.cuts.find(k => k.land === land && k.taker === taker);
    if (old) old.ids = [...new Set([...old.ids, ...ids])];
    else g.cuts.push({ land, taker, ids, year: g.year, occ: newOcc() });
    syncBorders(g);
    return ids;
  }
  // saves from before provinces: a cut was a depth, now it is the provinces that depth covered
  function fixCuts(g) {
    if (!g.pw) { g.pw = newPw(); g.firsts = {}; }
    const old = (g.cuts || []).filter(k => !k.ids); g.cuts = (g.cuts || []).filter(k => k.ids);
    for (const k of old) { const ids = landBlock(g, k.taker, k.land, 1 / 3, k.depth || 0.3); if (ids.length) g.cuts.push({ land: k.land, taker: k.taker, ids, year: k.year, occ: k.occ || newOcc() }); }
    syncBorders(g);
  }
  // the land `win` lost to `lose` comes back
  function returnLand(g, win, lose) {
    const back = g.cuts.filter(k => k.land === win && k.taker === lose);
    if (!back.length) return false;
    g.cuts = g.cuts.filter(k => !back.includes(k));
    say(g, `${info(win).name} wins back the land it lost to ${info(lose).name}.`);
    return true;
  }
  const lostLand = (g, key) => g.cuts.filter(k => k.land === key);
  const takenLand = (g, key) => g.cuts.filter(k => k.taker === key);

  // ================= annexation =================
  function annex(g, owner, key) {
    const c = g.c[key];
    c.owner = owner; c.since = g.year; c.puppetOf = null; c.war = null; c.army = 0; c.stab = Math.min(c.stab, 2); c.occ = newOcc(35);
    g.cuts = g.cuts.filter(k => !((k.land === key && k.taker === owner) || (k.land === owner && k.taker === key)));
    c.a = isHome(owner) ? (owner === 'USA' ? 100 : -100) : g.c[owner].a;
    g.wars = g.wars.filter(w => w.att !== key && w.def !== key);
    for (const p of g.pacts) p.members = p.members.filter(m => m !== key);
    for (const k of ownedBy(g, key)) g.c[k].owner = owner;
  }
  function liberate(g, key, text) {
    const c = g.c[key], was = c.owner; if (!was) return;
    c.owner = null; c.stab = 2; c.army = Math.max(c.army, 3); c.war = null; c.occ = null; c.independent = true;
    if (!VOTING(c.gov) && !['Socialist', 'Monarchy', 'Dictatorship', 'Junta'].includes(c.gov)) c.gov = 'Republic';
    setupParties(g, key);
    say(g, text || `${info(key).name} breaks free from ${info(was).name}!`);
    applyNames(g);
  }
  // annexed land follows its owner's politics, and unhappy land may break away
  function puppetYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key], m = c.puppetOf; if (!m) continue;
      const M = g.c[m], masterA = isHome(m) ? (m === 'USA' ? 100 : -100) : M && M.a;
      const gone = !M || M.owner || (!isHome(m) && !M.independent) || c.owner || !c.independent;
      if (gone || Math.abs(c.a - masterA) > 90) { c.puppetOf = null; if (!gone) say(g, `${d.name} breaks free of ${info(m).name}.`); continue; }
      if (m !== g.nation) c.a = clamp(c.a + Math.sign(masterA - c.a) * 3, -100, 100);   // a puppet follows its master's line
    }
  }
  function ownedYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key]; if (!c.owner) continue;
      c.a = ownerAlign(g, stateOf(g, c.owner));
      if (c.war) continue;
      if (c.stab < 4 && Math.random() < 0.12) c.stab++;
      // restless regions may rise: rarely in a democracy, never the core of a country, never what the player manages itself
      const mine = (c.owner === g.nation && !isUnionPart(g, d.key)) || d.key === g.nation;     // the player decides when to rise
      if (!d.core && !mine && !c.unified && c.stab <= 2 && Math.random() < 0.03 * (VOTING(g.c[c.owner].gov) ? 0.15 : 1)) rise(g, d.key);
    }
    territoryYear(g);
  }

  // ================= managing occupied land =================
  // Every annexed country and every piece of land taken in a war is a territory with
  // unrest (0-100: at the top it rises up) and integration (0-100: at 100 it is yours for good).
  const POLICIES = {
    garrison: { name: 'Garrison', help: 'Soldiers keep order: unrest falls. Ties down part of your army.' },
    integrate: { name: 'Integrate', help: 'Schools, roads, settlers: integration grows. Costs 1 IP a year. Unrest stays about where it is.' },
    exploit: { name: 'Exploit', help: 'Take its wealth: extra IP every year. Unrest rises fast.' },
    autonomy: { name: 'Autonomy', help: 'Let it run itself: unrest falls fastest, but it counts half.' },
  };
  const newOcc = (unrest) => ({ unrest: unrest === undefined ? 25 : unrest, integ: 0, policy: 'garrison', core: false, acted: 0 });
  // the player's territories: { id, kind, land, name, occ, worth, since }
  function territories(g, owner) {
    owner = owner || g.nation; if (!owner) return [];
    const out = [];
    for (const d of D.COUNTRIES) { const c = g.c[d.key]; if (c.owner === owner && !isUnionPart(g, d.key)) { c.occ = c.occ || newOcc(); out.push({ id: d.key, kind: 'annex', land: d.key, name: d.name, occ: c.occ, worth: d.val, since: c.since }); } }
    for (const k of g.cuts) if (k.taker === owner) { k.occ = k.occ || newOcc(); out.push({ id: 'cut:' + k.land, kind: 'cut', land: k.land, name: provList(k.ids || []) || `Occupied ${info(k.land).name}`, occ: k.occ, worth: blockVal(k.ids || []), since: k.year }); }
    return out;
  }
  const territory = (g, id) => territories(g).find(t => t.id === id);
  function territoryYear(g) {
    if (!g.nation) return;
    for (const t of territories(g)) {
      const o = t.occ; if (o.core) { o.unrest = 0; continue; }
      let d = g.year - t.since < 10 ? 4 : 2;                         // fresh conquests are angriest
      if (o.policy === 'garrison') { d -= 8; g.c[g.nation].army = Math.max(1, g.c[g.nation].army - 0.7); }
      if (o.policy === 'exploit') d += 7;
      if (o.policy === 'autonomy') d -= 10;
      if (o.policy === 'integrate') { d -= 3; if (g.ip.ME >= 1) o.integ = Math.min(100, o.integ + 9); }
      if (g.c[g.nation].stab <= 1) d += 5;
      if (warOf(g, g.nation)) d += 4;
      o.unrest = clamp(o.unrest + d + rand(-3, 3), 0, 100);
      if (o.integ >= 100 && !o.core) { o.core = true; o.unrest = 0; say(g, `${t.name} is now a loyal part of ${info(g.nation).name}.`); continue; }
      if (o.unrest >= 60 && Math.random() < (o.unrest - 50) / 110) uprising(g, t);
    }
  }
  function uprising(g, t) {
    if (t.kind === 'annex') liberate(g, t.land, `${info(t.land).name} rises up and throws out ${info(g.nation).name}!`);
    else { g.cuts = g.cuts.filter(k => !(k.land === t.land && k.taker === g.nation)); say(g, `The occupied part of ${info(t.land).name} rises up and rejoins its country!`); }
    g.c[g.nation].stab = Math.max(1, g.c[g.nation].stab - 1);
  }
  const TERR_ACTIONS = {
    invest: { name: 'Invest', cost: 3, help: 'Jobs and bread: unrest −15, integration +10.' },
    crackdown: { name: 'Crack down', cost: 2, help: 'Arrests and curfews: unrest −30, but integration −10 and tension rises.' },
    release: { name: 'Release it', cost: 0, help: 'Give it its freedom. It stays friendly to you, and the world approves.' },
  };
  function territoryCheck(g, id, kind) {
    const t = territory(g, id), r = { ok: false, cost: TERR_ACTIONS[kind] ? TERR_ACTIONS[kind].cost : 0, why: '' };
    if (!t) return (r.why = 'Not yours', r);
    if (g.over) return (r.why = 'The game is over', r);
    if (POLICIES[kind]) { if (t.occ.policy === kind) return (r.why = 'Current policy', r); if (t.occ.core) return (r.why = 'Fully integrated', r); r.ok = true; return r; }
    if (kind !== 'release' && t.occ.acted === g.year) return (r.why = 'Once a year per territory', r);
    if (kind !== 'release' && t.occ.core) return (r.why = 'Fully integrated', r);
    if (g.ip.ME < r.cost) return (r.why = 'Not enough IP', r);
    r.ok = true; return r;
  }
  function territoryAct(g, id, kind) {
    const r = territoryCheck(g, id, kind); if (!r.ok) return r.why;
    const t = territory(g, id), o = t.occ;
    if (POLICIES[kind]) { o.policy = kind; return `${t.name}: ${POLICIES[kind].name}.`; }
    g.ip.ME -= r.cost;
    if (kind === 'invest') { o.acted = g.year; o.unrest = Math.max(0, o.unrest - 15); o.integ = Math.min(100, o.integ + 10); return `Money flows into ${t.name}.`; }
    if (kind === 'crackdown') { o.acted = g.year; o.unrest = Math.max(0, o.unrest - 30); o.integ = Math.max(0, o.integ - 10); addTension(g, 1); return `Soldiers patrol ${t.name}.`; }
    // release
    if (t.kind === 'annex') {
      liberate(g, t.land, `${info(g.nation).name} grants ${info(t.land).name} its freedom.`);
      const c = g.c[t.land]; c.a = g.c[g.nation].a; c.puppetOf = g.nation;
    } else { g.cuts = g.cuts.filter(k => !(k.land === t.land && k.taker === g.nation)); shift(g, t.land, Math.sign(g.c[g.nation].a - g.c[t.land].a) * 20); say(g, `${info(g.nation).name} hands back the land it took from ${info(t.land).name}.`); }
    g.bonus.ME += 2;
    return 'Released.';
  }

  // ================= peace treaties =================
  // war score: how well the war is going for one side (-100..100), plus 15 for holding the enemy capital
  const PEACE_TERMS = {
    white: { name: 'Status quo', cost: 0, help: 'Everyone goes home. Nothing changes.' },
    reparations: { name: 'Reparations', cost: 25, help: 'The loser pays: IP, or soldiers and prestige.' },
    disarm: { name: 'Disarm them', cost: 20, help: 'Their army is cut in half.' },
    government: { name: 'Friendly government', cost: 55, help: 'A government loyal to you takes power there.' },
    annex: { name: 'Annex them', cost: 80, help: 'The country becomes part of yours. It may rebel later.' },
  };
  function warScore(w, side) {
    const other = side === 'att' ? 'def' : 'att';
    return (side === 'att' ? w.front : -w.front) + (w.capFell && w.capFell[other] ? 15 : 0) - (w.capFell && w.capFell[side] ? 15 : 0);
  }
  // which terms are possible against `enemy` for the player's country `me`
  // the provinces a winner could take: a block from its border, as deep as the war got
  function landTerm(g, me, enemy) {
    if (isHome(enemy) || g.c[enemy].owner) return null;
    const w = g.wars.find(x => (x.att === me && x.def === enemy) || (x.def === me && x.att === enemy));
    const depth = w ? Math.max(0.15, warScore(w, w.att === me ? 'att' : 'def') / 100) : 1;
    const ids = landBlock(g, me, enemy, 1 / 3, depth);
    return ids.length ? { id: 'land', name: `Take ${provList(ids)}`, cost: Math.round(12 + blockVal(ids) * 14), help: `${ids.length} border province${ids.length > 1 ? 's' : ''} of ${info(enemy).name} become yours (never the capital, never cutting it in two).`, ok: true, why: '', ids } : null;
  }
  const termCost = (g, me, enemy, id) => id === 'land' ? ((landTerm(g, me, enemy) || {}).cost || 0) : PEACE_TERMS[id].cost;
  function termsFor(g, me, enemy) {
    const out = [];
    const lt = landTerm(g, me, enemy);
    if (lt) out.push(lt);
    for (const id in PEACE_TERMS) {
      const T = PEACE_TERMS[id];
      let ok = true, why = '';
      if ((id === 'government' || id === 'annex') && isHome(enemy)) { ok = false; why = 'A superpower cannot be taken over'; }
      if (id === 'annex' && isHome(me)) { ok = false; why = 'Superpowers install governments instead'; }
      if (id === 'annex' && ok && !borders(g, me, enemy)) { ok = false; why = 'Must border your land'; }
      out.push({ id, name: T.name, cost: T.cost, help: T.help, ok, why });
    }
    return out;
  }
  const playerKey = g => g.nation || HOME[g.side];
  // would the enemy sign? (for the player's own war)
  function peaceChance(g, w, picks) {
    const me = playerKey(g), side = w.att === me ? 'att' : 'def', score = warScore(w, side);
    const enemy = w.att === me ? w.def : w.att, cost = picks.reduce((t, id) => t + termCost(g, me, enemy, id), 0);
    const ex = w.ex || { att: 0, def: 0 }, tired = w.years * 3 + ex[side === 'att' ? 'def' : 'att'] * 0.6;   // a tired enemy gives more
    return score >= 0 ? cost <= score + tired : cost === 0 && -score <= 20 + tired;
  }
  function proposePeace(g, picks) {
    const me = playerKey(g), w = warOf(g, me); if (!w || g.over) return 'No war to end';
    if (w.talked === g.year) return 'You already tried this year';
    w.talked = g.year;
    if (!picks.length) picks = ['white'];
    if (!peaceChance(g, w, picks)) return `${info(w.att === me ? w.def : w.att).name} refuses your terms.`;
    g.wars = g.wars.filter(x => x !== w);
    applyTerms(g, me, w.att === me ? w.def : w.att, picks, Math.max(0.15, warScore(w, w.att === me ? 'att' : 'def') / 100));
    return 'The treaty is signed.';
  }
  function applyTerms(g, win, lose, picks, depth) {
    const done = [];
    returnLand(g, win, lose);
    for (const id of picks) {
      const L = g.c[lose];
      if (id === 'reparations') {
        const payer = lose === g.nation ? 'ME' : lose === 'USA' ? 'US' : lose === 'SUN' ? 'SU' : null;
        if (payer) g.ip[payer] = Math.max(0, g.ip[payer] - 6); else L.army *= 0.7;
        const getter = win === g.nation ? 'ME' : win === 'USA' ? 'US' : win === 'SUN' ? 'SU' : null;
        if (getter) g.ip[getter] += 6;
      }
      if (id === 'disarm') L.army *= 0.5;
      if (id === 'government') {
        L.a = clamp(isHome(win) ? (win === 'USA' ? 75 : -75) : g.c[win].a, -100, 100); L.stab = Math.max(1, L.stab - 1);
        takePower(g, lose, g.c[win].ruling === 'com' ? 'com' : 'nat');
        if (win === g.nation) L.puppetOf = g.nation;
        if (lose === g.nation) overthrow(g, `The peace treaty puts a government loyal to ${info(win).name} in power. You are out.`);
      }
      if (id === 'annex') { annex(g, win, lose); if (lose === g.nation) overthrow(g, `${info(win).name} annexes your country.`); }
      if (id === 'land') { const ids = cutLand(g, lose, win, depth); if (ids.length) done.push(`${provList(ids)} to ${info(win).name}`); continue; }
      if (id !== 'white') done.push(PEACE_TERMS[id].name.toLowerCase());
    }
    if (win === g.nation) g.bonus.ME += 2;
    say(g, `Peace between ${info(win).name} and ${info(lose).name}${done.length ? ': ' + done.join(', ') : ' on the old borders'}.`);
  }
  // the computer side of the player's war makes offers: a loser concedes, a winner demands
  function makeOffer(g) {
    const me = playerKey(g); g.offer = null;
    const w = g.wars.find(x => x.att === me || x.def === me); if (!w || w.years < 2 || g.over || Math.random() < 0.5) return;
    const mySide = w.att === me ? 'att' : 'def', score = warScore(w, mySide), enemy = w[mySide === 'att' ? 'def' : 'att'];
    if (Math.abs(score) < 25) return;
    const [win, lose] = score > 0 ? [me, enemy] : [enemy, me], ex = w.ex || { att: 0, def: 0 }, budget = Math.abs(score) + w.years * 2 + ex[score > 0 ? (mySide === 'att' ? 'def' : 'att') : mySide] * 0.5;
    const picks = [];
    let spent = 0;
    for (const t of termsFor(g, win, lose)) {
      if (!t.ok || t.id === 'white' || t.id === 'annex' || (t.id === 'government' && score > 0)) continue;   // nobody offers its own annexation
      if (spent + t.cost <= budget * (score > 0 ? 0.8 : 1)) { picks.push(t.id); spent += t.cost; }
    }
    if (!picks.length) return;
    g.offer = { wid: w.id, from: enemy, win, lose, picks, year: g.year };
  }
  function answerOffer(g, yes) {
    const o = g.offer; g.offer = null; if (!o) return '';
    const w = g.wars.find(x => x.id === o.wid); if (!w) return 'That war is over.';
    if (!yes) { say(g, `You turn down ${info(o.from).name}'s peace offer. The war goes on.`); return 'The war goes on.'; }
    g.wars = g.wars.filter(x => x !== w);
    applyTerms(g, o.win, o.lose, o.picks, Math.max(0.15, Math.abs(warScore(w, w.att === o.win ? 'att' : 'def')) / 100));
    return 'Peace is signed.';
  }
  function offerView(g) {
    const o = g.offer; if (!o) return null;
    const terms = termsFor(g, o.win, o.lose);
    const youWin = o.win === playerKey(g), F = info(o.from).name;
    const say2 = t => youWin ? { name: t.id === 'land' ? t.name.replace(/^Take /, 'You get ') : t.id === 'reparations' ? `${F} pays reparations` : t.id === 'disarm' ? `${F} cuts its army in half` : t.name, help: t.help }
      : { name: t.id === 'land' ? t.name.replace(/^Take /, 'You hand over ') : t.id === 'reparations' ? 'You pay reparations' : t.id === 'disarm' ? 'Your army is cut in half' : t.id === 'government' ? `A government loyal to ${F} takes over (you are out)` : t.name, help: '' };
    return { from: F, youWin, terms: o.picks.map(id => terms.find(t => t.id === id)).filter(Boolean).map(say2) };
  }
  // ================= the peace conference (Hearts of Iron style) =================
  // A war won outright ends at the table. Every winner gets points for its part in the war: the
  // winner 100, a superpower that sent troops 50, allies who stood by the defender 25. Turn by turn,
  // whoever has the most points left makes one demand: a province (clicked on the map), a puppet,
  // the whole country, a new government, freedom for one of its regions, reparations, disarmament.
  // When everybody has passed, the treaty is signed. Land must touch what the claimant holds or has
  // claimed, the capital stays (unless the whole country is annexed), the loser is never cut in two,
  // and provinces alone take at most a third of it.
  const TOWNS = ['Geneva', 'Vienna', 'Helsinki', 'Stockholm', 'Bern', 'New Delhi', 'Cairo', 'Belgrade', 'Jakarta', 'Addis Ababa', 'Lima', 'Oslo', 'Reykjavik', 'Tashkent', 'Paris', 'Rangoon', 'Accra'];
  function startConference(g, w, done) {
    const win = w[done], lose = w[done === 'att' ? 'def' : 'att'];
    const winners = [{ key: win, pts: 100, done: false, main: true }];
    for (const p of ['US', 'SU']) if (w.troops[p] === done && HOME[p] !== win) winners.push({ key: HOME[p], pts: 50, done: false });
    if (done === 'def') for (const k of [...new Set(pactsOf(g, win).flatMap(p => p.members))]) {
      if (k === win || winners.some(x => x.key === k) || allied(g, k, lose) || winners.length >= 5) continue;
      if (isHome(k) || borders(g, k, lose)) winners.push({ key: k, pts: 25, done: false });
    }
    const conf = { att: w.att, def: w.def, win, lose, winners, claims: [], annexOk: !!w.annexOnWin && done === 'att',
      town: TOWNS[(g.year + w.id) % TOWNS.length], year: g.year,
      held: Object.keys(g.ctl || {}).filter(id => g.ctl[id] === win).map(Number) };   // what the winner's army stands on: it may claim that, and cheaper
    conf.total = blockVal(confPool(g, conf)) || 1;
    say(g, `${info(lose).name} is defeated. The winners meet at ${conf.town} to dictate the peace.`);
    if (winners.some(x => x.key === playerKey(g)) && !g.over) { g.conf = conf; runConf(g); }
    else { while (confStep(g, conf)); applyConf(g, conf); }
  }
  // every province the loser holds: its own land, its regions, what it annexed
  const loserLands = (g, conf) => [conf.lose, ...ownedBy(g, conf.lose)];
  function confPool(g, conf) { const L = new Set(loserLands(g, conf)); return PROV.filter(p => L.has(holderOf(g, p.id))).map(p => p.id); }
  const claimedIds = conf => new Set(conf.claims.flatMap(c => c.ids || []));
  const whole = conf => conf.claims.some(c => c.kind === 'annex');
  const once = (conf, kind) => conf.claims.some(c => c.kind === kind);
  const confLandVal = conf => blockVal([...claimedIds(conf)]);
  // the loser's provinces still on the table, and the ones that touch claimant k's land or its claims
  function confReach(g, conf, k) {
    const st = stateOf(g, k), claimed = claimedIds(conf), mine = new Set(conf.claims.filter(c => c.by === k).flatMap(c => c.ids || []));
    const pool = new Set(confPool(g, conf).filter(i => !claimed.has(i)));
    const ownsAt = id => mine.has(id) || (!pool.has(id) && !claimed.has(id) && stateOf(g, holderOf(g, id)) === st);
    const held = new Set(k === conf.win ? conf.held || [] : []);
    const touching = new Set([...pool].filter(id => held.has(id) || Object.keys(PBY[id].nb).some(q => ownsAt(+q))));
    return { pool, touching };
  }
  const pieces = set => {
    const seen = new Set(); let n = 0;
    for (const id of set) {
      if (seen.has(id)) continue; n++;
      const s = [id]; seen.add(id);
      while (s.length) { const x = s.pop(); for (const q in PBY[x].nb) { const j = +q; if (set.has(j) && !seen.has(j)) { seen.add(j); s.push(j); } } }
    }
    return n;
  };
  const provCost = (conf, k, id) => Math.round((6 + provVal(id) * 30) * (k === conf.win ? 0.8 : 1) * (k === conf.win && (conf.held || []).includes(id) ? 0.6 : 1));
  const capOf = key => PROV.find(p => p.key === key && p.cap);
  // what claimant k can demand now. kinds: take (one province), annex, puppet, gov, free (a region), rep, disarm
  function confOptions(g, conf, k) {
    const W = conf.winners.find(x => x.key === k), out = [], L = conf.lose, Lname = info(L).name, lv = valueOf(g, L);
    if (!W || W.done || whole(conf)) return out;
    const add = (kind, target, cost, name, help, ok, why, ids) => { cost = Math.round(cost); out.push({ id: kind + ':' + target, kind, target, cost, name, help, ids, ok: ok && W.pts >= cost, why: !ok ? why : W.pts < cost ? 'Not enough points' : '' }); };
    // land is taken province by province; the capital comes last, and whoever takes it annexes what is left of the country
    const { pool, touching } = confReach(g, conf, k), base = pieces(pool), cap = capOf(L);
    for (const id of touching) {
      const rest = new Set(pool); rest.delete(id);
      if (cap && cap.id === id) {
        const last = rest.size === 0;
        add('take', id, provCost(conf, k, id) + 10, `Take ${PBY[id].name}: annex ${Lname}`, `The capital, the last piece: ${Lname} disappears into your country. It may rebel later.`,
          last && !isHome(L) && !isHome(k), isHome(k) ? 'A superpower does not annex countries' : 'The capital comes last: take everything else first', [id]);
        continue;
      }
      const split = rest.size > 0 && pieces(rest) > base;
      add('take', id, provCost(conf, k, id), `Take ${PBY[id].name}`, `${PBY[id].name} (${info(PBY[id].key).name}) becomes yours.`, !split,
        'It would cut the country in two', [id]);
    }
    if (!isHome(L)) {
      const rest = [...pool].reduce((t, i) => t + provCost(conf, k, i), 0);
      const govSet = once(conf, 'puppet') || once(conf, 'gov');
      add('puppet', L, 22 + lv * 6, `Puppet ${Lname}`, 'A government that answers to you.', !govSet, 'Its government is already decided');
      add('gov', L, 15 + lv * 3, `New government in ${Lname}`, 'A friendly government takes power there.', !govSet, 'Its government is already decided');
    }
    for (const r of ownedBy(g, L)) if (!conf.claims.some(c => c.target === r)) add('free', r, 8 + info(r).val * 4, `Free ${info(r).name}`, `${info(r).name} becomes an independent country.`, true, '');
    if (!once(conf, 'rep')) add('rep', L, 14, `Reparations from ${Lname}`, 'They pay: IP, or soldiers.', true, '');
    if (!once(conf, 'disarm')) add('disarm', L, 10, `Disarm ${Lname}`, 'Their army is cut in half.', true, '');
    return out;
  }
  function confClaim(g, conf, k, o) {
    conf.claims.push({ by: k, kind: o.kind, target: o.target, ids: o.ids, name: o.name, cost: o.cost });
    conf.winners.find(x => x.key === k).pts -= o.cost;
  }
  // the computer's demand: land next door (cheap and close) first; superpowers prefer governments to land
  function aiConfPick(g, conf, k) {
    const sp = isHome(k), main = k === conf.win, lv = valueOf(g, conf.lose);
    const conquests = ownedBy(g, k).filter(x => !isUnionPart(g, x)).length;
    let best = null, bv = 0.45;
    for (const o of confOptions(g, conf, k)) {
      if (!o.ok) continue;
      let v = 0;
      if (o.kind === 'take') {
        const mine = conf.claims.filter(c => c.by === k && c.kind === 'take').reduce((t, c) => t + provVal(c.ids[0]), 0);
        const conquer = main && (conf.annexOk || (conf.conquer = conf.conquer !== undefined ? conf.conquer : !sp && conquests < 2 && lv <= valueOf(g, k) && Math.random() < 0.3));
        if (!conquer && mine + provVal(o.target) > conf.total / 3 + 1e-9) continue;            // without conquest in mind: at most a third
        v = provVal(o.target) * 30 * (sp ? 0.25 : 1) * (main ? 1.3 : 1) * (conquer ? 4 : 1);
      }
      if (o.kind === 'puppet') v = sp ? lv * 9 + 12 : main ? lv * 5 + 6 : 0;
      if (o.kind === 'gov') v = sp ? lv * 4 + 6 : lv * 3 + 6;
      if (o.kind === 'free') v = (sp ? 3 : 1.5) * info(o.target).val + (g.c[o.target].war ? 8 : 0);
      if (o.kind === 'rep') v = 9;
      if (o.kind === 'disarm') v = 6;
      v = v / o.cost + Math.random() * 0.05;
      if (v > bv) { bv = v; best = o; }
    }
    if (!best) return false;
    confClaim(g, conf, k, best);
    return true;
  }
  // one turn at the table; false when everybody has passed
  function confStep(g, conf) {
    const act = conf.winners.filter(x => !x.done).sort((a, b) => b.pts - a.pts)[0];
    if (!act) return false;
    if (!aiConfPick(g, conf, act.key)) act.done = true;
    return true;
  }
  // computer turns until it is the player's turn (or the table is empty and the treaty is signed)
  function runConf(g) {
    const conf = g.conf; if (!conf) return;
    for (let i = 0; i < 400; i++) {
      const act = conf.winners.filter(x => !x.done).sort((a, b) => b.pts - a.pts)[0];
      if (!act) { g.conf = null; applyConf(g, conf); return; }
      if (act.key === playerKey(g)) { if (!confOptions(g, conf, act.key).some(o => o.ok)) { act.done = true; continue; } return; }
      if (!aiConfPick(g, conf, act.key)) act.done = true;
    }
  }
  // the player's demand (an option id like 'take:123' or 'puppet:LBY'); then the others take their turns
  function confDemand(g, id) {
    const conf = g.conf; if (!conf) return 'No conference';
    const me = playerKey(g), o = confOptions(g, conf, me).find(x => x.id === id);
    if (!o) return 'Not possible now';
    if (!o.ok) return o.why;
    confClaim(g, conf, me, o); runConf(g);
    return g.conf ? `${o.name}.` : 'The treaty is signed.';
  }
  function confPass(g) { const conf = g.conf; if (!conf) return; const W = conf.winners.find(x => x.key === playerKey(g)); if (W) W.done = true; runConf(g); }
  // test tools and computer games: the player's seat is played by the computer too
  function confAuto(g) { const conf = g.conf; if (!conf) return; while (confStep(g, conf)); g.conf = null; applyConf(g, conf); }
  function applyConf(g, conf) {
    const L = conf.lose, parts = [], byTaker = {}; let annexBy = null;
    const lands = loserLands(g, conf);
    for (const c of conf.claims) {
      const by = c.by, name = info(by).name;
      if (c.kind === 'take') {
        const id = c.ids[0], land = holderOf(g, id); if (!lands.includes(land)) continue;
        if ((capOf(L) || {}).id === id) { annexBy = by; continue; }                         // the capital: the country goes with it (below)
        (byTaker[by] = byTaker[by] || []).push(id);
        const old = g.cuts.find(x => x.land === land && x.taker === by);
        if (old) old.ids.push(id); else g.cuts.push({ land, taker: by, ids: [id], year: g.year, occ: newOcc() });
      }
      if (c.kind === 'annex') { annex(g, by, L); applyNames(g); parts.push(`${name} annexes ${ORIGINAL_NAMES[L]}`); if (L === g.nation) overthrow(g, `${name} annexes your country at the peace table.`); }
      if (c.kind === 'puppet' || c.kind === 'gov') {
        const c2 = g.c[L]; c2.a = clamp(isHome(by) ? (by === 'USA' ? 75 : -75) : g.c[by].a, -100, 100); c2.stab = Math.max(1, c2.stab - 1);
        takePower(g, L, isHome(by) ? (by === 'USA' ? 'con' : 'com') : (g.c[by].ruling === 'com' ? 'com' : 'nat'));
        if (c.kind === 'puppet') { c2.puppetOf = by; c2.puppetSince = g.year; c2.a = clamp(c2.a * 1.1, -100, 100); }
        parts.push(c.kind === 'puppet' ? `${name} makes ${info(L).name} its puppet` : `${name} installs a new government in ${info(L).name}`);
        if (L === g.nation) overthrow(g, `The peace treaty puts a government loyal to ${name} in power. You are out.`);
      }
      if (c.kind === 'free') {
        const r = c.target;
        if (g.c[r] && g.c[r].owner) { if (isUnionPart(g, r)) freeUnion(g, r, clamp(ownerAlign(g, by) * 0.5, -100, 100)); else liberate(g, r, `${info(r).name} is set free by the peace.`); parts.push(`${name} frees ${info(r).name}`); }
      }
      if (c.kind === 'rep') { reparations(g, by, L); parts.push(`${name} takes reparations`); }
      if (c.kind === 'disarm') { if (g.c[L]) g.c[L].army *= 0.5; parts.push(`${name} disarms ${info(L).name}`); }
    }
    // a pocket of the loser that one taker now surrounds goes with it
    for (const id of confPool(g, conf)) {
      if (holderOf(g, id) !== L || (capOf(L) || {}).id === id) continue;
      const around = new Set(Object.keys(PBY[id].nb).map(q => holderOf(g, +q)));
      const t = around.size === 1 ? [...around][0] : null;
      if (t && t !== L && byTaker[t]) { byTaker[t].push(id); const old = g.cuts.find(x => x.land === L && x.taker === t); if (old) old.ids.push(id); }
    }
    for (const t in byTaker) if (t !== annexBy) parts.unshift(`${info(t).name} takes ${provList(byTaker[t])}`);
    if (annexBy) {
      g.cuts = g.cuts.filter(x => !(x.land === L && x.taker === annexBy));                // the whole land is the annexer's now
      annex(g, annexBy, L); applyNames(g);
      parts.unshift(`${info(annexBy).name} annexes ${ORIGINAL_NAMES[L]}`);
      if (L === g.nation) overthrow(g, `${info(annexBy).name} annexes your country at the peace table.`);
    }
    syncBorders(g);
    if (g.c[L] && !g.c[L].owner) { g.c[L].stab = Math.max(1, g.c[L].stab - 1); g.c[L].army = Math.min(g.c[L].army, 3); }
    if (conf.win === g.nation) g.bonus.ME += 3;
    if (isHome(conf.win)) g.bonus[conf.win === 'USA' ? 'US' : 'SU'] += 2;
    g.treaties = g.treaties || [];
    g.treaties.unshift({ year: g.year, name: `Peace of ${conf.town}`, text: parts.join('; ') || 'the winners demand nothing' });
    g.treaties.length = Math.min(g.treaties.length, 30);
    say(g, `Peace of ${conf.town}: ${parts.length ? parts.join('; ') : 'the winners demand nothing'}.`);
  }
  function confView(g) {
    const conf = g.conf; if (!conf) return null;
    const me = playerKey(g), act = conf.winners.filter(x => !x.done).sort((a, b) => b.pts - a.pts)[0];
    return { name: `Peace of ${conf.town}`, lose: conf.lose, loser: info(conf.lose).name, war: `${info(conf.att).name} → ${info(conf.def).name}`,
      winners: conf.winners.map(x => ({ key: x.key, name: info(x.key).name, pts: x.pts, done: x.done, me: x.key === me })),
      claims: conf.claims.map(c => ({ by: c.by, byName: info(c.by).name, kind: c.kind, ids: c.ids, name: c.name, target: c.target })),
      myTurn: !!act && act.key === me, options: confOptions(g, conf, me) };
  }

  // ================= formable nations =================
  function formCheck(g, f) {
    const me = g.nation, r = { ok: false, cost: 5, why: '' };
    if (!me || !f.members.includes(me)) return (r.why = 'Not your nation', r);
    if (g.formed.includes(f.id)) return (r.why = 'Already formed', r);
    if (g.over) return (r.why = 'The game is over', r);
    const myA = g.c[me].a;
    for (const k of f.members) {
      if (k === me) continue;
      const c = g.c[k];
      if (!c.independent && !c.owner) return (r.why = `${info(k).name} is still a colony`, r);
      const ok = c.owner === me || c.puppetOf === me || (!c.owner && Math.abs(c.a - myA) <= 15 && !c.war);
      if (!ok) return (r.why = `${info(k).name} must be a close friend (15 or less apart), defeated by you, or yours`, r);
      if (!c.owner && info(k).val > valueOf(g, me)) return (r.why = `${info(k).name} is bigger than you`, r);
    }
    if (warOf(g, me)) return (r.why = 'Not during a war', r);
    if (g.ip.ME < r.cost) return (r.why = 'Not enough IP', r);
    r.ok = true; return r;
  }
  function form(g, id) {
    const f = D.FORMABLES.find(x => x.id === id), r = formCheck(g, f); if (!r.ok) return r.why;
    g.ip.ME -= r.cost;
    for (const k of f.members) if (k !== g.nation && g.c[k].owner !== g.nation) annex(g, g.nation, k);
    g.formed.push(f.id); g.names[g.nation] = f.name; applyNames(g);
    g.c[g.nation].stab = Math.min(5, g.c[g.nation].stab + 1);
    say(g, `${f.name} is proclaimed! ${f.members.filter(k => k !== g.nation).map(k => ORIGINAL_NAMES[k]).join(', ')} join the new nation.`);
    return `${f.name} is born!`;
  }

  // ================= backing parties =================
  // '+' : a party gets 8% more support (1 IP; abroad it counts as one of your two moves there)
  // 'power' : in your own nation, hand power to a party with 25%+ support (3 IP, once a year)
  function partyCheck(g, actor, key, id, kind) {
    const c = g.c[key], own = actor === 'ME' && key === g.nation, cost = kind === 'power' ? 3 : 1, r = { ok: false, cost, why: '' };
    if (g.over) return (r.why = 'The game is over', r);
    if (isHome(key) || !c.independent) return (r.why = 'Not here', r);
    if (g.ip[actor] < cost) return (r.why = 'Not enough IP', r);
    if (kind === 'power') {
      if (!own) return (r.why = 'Only in your own country', r);
      if (c.ruling === id) return (r.why = 'Already in power', r);
      if (c.parties[id] < 25) return (r.why = 'Needs 25% support', r);
      if (g.homeMoves.power) return (r.why = 'Once a year', r);
    } else if (own ? (g.homeMoves.rally || 0) >= 3 : c.moves >= 2) return (r.why = own ? 'Three rallies a year' : 'Two moves here per year', r);
    r.ok = true; return r;
  }
  function partyAct(g, actor, key, id, kind) {
    const r = partyCheck(g, actor, key, id, kind); if (!r.ok) return r.why;
    const c = g.c[key], own = actor === 'ME' && key === g.nation;
    g.ip[actor] -= r.cost;
    if (kind === 'power') {
      g.homeMoves.power = true; takePower(g, key, id);
      if (id === 'com' || id === 'nat') c.stab = Math.max(1, c.stab - 1);
      say(g, `${info(key).name}: the ${PARTY[id].name} take over the government.`);
      return `The ${PARTY[id].name} now govern. Government: ${c.gov}.`;
    }
    if (own) g.homeMoves.rally = (g.homeMoves.rally || 0) + 1; else c.moves++;
    boostParty(g, key, id, 8);
    return `${PARTY[id].name} in ${info(key).name}: ${Math.round(c.parties[id])}%.`;
  }

  // ================= helping in a war between countries =================
  function warCheck(g, actor, w, party, kind) {
    const cost = kind === 'troops' ? TROOPS_COST : ARM_COST;
    if (g.over) return { ok: false, cost, why: 'The game is over' };
    if (actor === 'ME' && kind === 'troops') return { ok: false, cost, why: 'Only superpowers send troops abroad' };
    if (actor === 'ME' && (w.att === g.nation || w.def === g.nation)) return { ok: false, cost, why: 'It is your own war' };
    if (kind === 'arm' && w.armed[actor]) return { ok: false, cost, why: 'Once a year per war' };
    if (kind === 'troops' && w.troops[actor]) return { ok: false, cost, why: 'Your troops are already there' };
    if (actor !== 'ME' && (w.att === HOME[actor] || w.def === HOME[actor])) return { ok: false, cost, why: 'It is your own war' };
    if (g.ip[actor] < cost) return { ok: false, cost, why: 'Not enough IP' };
    return { ok: true, cost };
  }
  function warHelp(g, actor, w, party, kind) {
    const r = warCheck(g, actor, w, party, kind); if (!r.ok) return r.why;
    g.ip[actor] -= r.cost;
    const name = info(w[party]).name;
    if (kind === 'arm') { w.armed[actor] = true; w.help[party] += actor === 'ME' ? 8 : 15; addTension(g, 1); return `Weapons for ${name}.`; }
    w.troops[actor] = party; addTension(g, 8);
    say(g, `The ${NAME[actor]} sends its army to fight for ${name}.`);
    return `Your troops fight for ${name}.`;
  }
  // a nation at war can make peace on the spot, at a price
  function makePeace(g) { return proposePeace(g, ['white']); }
  // ---- programmes at home (superpowers only) ----
  function programCheck(g, side, id) {
    const P = g.pw[side], R = PROGRAMS[id], r = { ok: false, cost: R.cost, why: '' };
    if (g.over) return (r.why = 'The game is over', r);
    if ((P.buys[id] || 0) >= R.max) return (r.why = R.max > 1 ? 'Done twice this year' : 'Done this year', r);
    if (g.ip[side] < R.cost) return (r.why = 'Not enough IP', r);
    if (id === 'space' && P.space >= SPACE.length) return (r.why = 'Every milestone reached', r);
    if (id === 'arms' && P.arms >= 10) return (r.why = 'The arsenal is as big as it gets', r);
    if (id === 'army' && g.c[HOME[side]].army >= 60) return (r.why = 'The army is at its biggest', r);
    r.ok = true; return r;
  }
  function programAct(g, side, id) {
    const r = programCheck(g, side, id); if (!r.ok) return r.why;
    const P = g.pw[side]; g.ip[side] -= r.cost; P.buys[id] = (P.buys[id] || 0) + 1;
    if (id === 'space') {
      P.spaceProg += 5 * (side === 'SU' ? (g.year < 1962 ? 1.3 : 0.9) : (g.year < 1958 ? 0.8 : 1.2));   // the Soviets start ahead, America catches up
      let out = 'The rockets get more money.';
      while (P.space < SPACE.length && P.spaceProg >= SPACE[P.space].c) {
        const m = SPACE[P.space]; P.spaceProg -= m.c;
        if (g.firsts[P.space]) say(g, `Space: the ${NAME[side]} matches the ${m.n.toLowerCase()}.`);
        else { g.firsts[P.space] = side; g.bonus[side] += m.p; say(g, `SPACE: the ${NAME[side]} achieves the world's first ${m.n.toLowerCase()}!`); }
        out = `${m.n}!`; P.space++;
      }
      return out;
    }
    if (id === 'arms') { P.arms++; addTension(g, 4); if (P.arms > g.pw[OTHER[side]].arms) g.bonus[side] += 1; return `The arsenal grows to level ${P.arms}.`; }
    if (id === 'homefront') { P.home = Math.min(100, P.home + 6); return 'Investment at home lifts morale.'; }
    g.c[HOME[side]].army = Math.min(60, g.c[HOME[side]].army + 3); return `The army grows to ${Math.round(g.c[HOME[side]].army)}.`;
  }
  // each year: the economy grows (the Soviet one less and less), wars and the arms race cost, morale follows
  function powerYear(g) {
    const y = g.year;
    for (const side of ['US', 'SU']) {
      const P = g.pw[side], me = HOME[side];
      let gr = side === 'US' ? 3.2 : (y < 1960 ? 6 : y < 1970 ? 4.2 : y < 1975 ? 3 : y < 1980 ? 1.8 : y < 1985 ? 0.6 : y < 1992 ? -0.5 : 1.8);
      if (side === 'SU' && g.reform) gr += 1;
      gr -= (P.buys.arms || 0) * 0.6 + P.arms * 0.08;
      let h = 0;
      const away = deployed(g, side) + g.wars.filter(w => w.att === me).length;
      gr -= away * 0.5; h -= away * 3;
      if (g.wars.some(w => w.def === me)) { gr -= 1; h -= 2; }
      gr += rand(-0.6, 0.6);
      P.growth = gr; P.econ *= 1 + gr / 100;
      h += gr >= 3 ? 2 : gr >= 1.5 ? 0 : gr >= 0 ? -2 : -4;
      if (g.tension >= 75) h -= 2;
      P.home = clamp(P.home + h, 0, 100);
      g.c[me].stab = clamp(Math.ceil(P.home / 20), 1, 5);
      P.buys = {};
      if (P.home <= 0 && !g.over) {
        g.over = { winner: OTHER[side], why: 'collapse', text: side === 'SU' ? 'The Soviet Union has collapsed. The red flag comes down over the Kremlin.' : 'Exhausted and divided, America turns inward and abandons its allies.' };
        say(g, g.over.text);
      }
    }
  }
  function detente(g, side) {
    if (g.over || g.detenteUsed || g.ip[side] < DETENTE_COST) return false;
    g.ip[side] -= DETENTE_COST; g.detenteUsed = true; addTension(g, -15);
    say(g, `${NAME[side]} calls a summit. Tension eases.`);
    return true;
  }

  // ================= the computer superpowers =================
  function computerTurn(g, side) {
    if (g.ip[side] >= 14 && Math.random() < 0.4) aiDecide(g, HOME[side], g.ip[side] - 8);
    const s = SIDE[side], P = g.pw[side], O = g.pw[OTHER[side]];
    if (g.tension >= 70) detente(g, side);
    // programmes at home first, when they matter
    if (P.home < 40 && programCheck(g, side, 'homefront').ok) programAct(g, side, 'homefront');
    if (g.year >= 1951 && !P.buys.space && (((O.space > P.space || (O.space === P.space && O.spaceProg > P.spaceProg)) && g.ip[side] >= 6) || (g.ip[side] >= income(g, side) * 0.7 + 4 && Math.random() < 0.3)) && programCheck(g, side, 'space').ok) programAct(g, side, 'space');   // keep up in the race, otherwise only with spare money
    if (g.tension < 60 && P.arms < O.arms + (side === 'SU' ? 1 : 0) && P.arms < 8 && g.ip[side] >= income(g, side) * 0.8 + 5 && programCheck(g, side, 'arms').ok) programAct(g, side, 'arms');
    if (g.wars.some(w => w.def === HOME[side]) && programCheck(g, side, 'army').ok) programAct(g, side, 'army');
    for (let tries = 0; tries < 40 && g.ip[side] >= 1; tries++) {
      const options = [];
      for (const d of D.COUNTRIES) {
        const c = g.c[d.key], mine = c.a * s;
        const meh = d.key === g.nation ? (pushRoom(g) > 0 ? 0.4 : 0) : 1;   // the player's nation is hard to sway: worth less of the computer's money
        const consider = (a, value) => { value *= a === 'propaganda' || a === 'aid' ? meh : 1; if (value > 0 && check(g, side, a, d.key).ok) options.push({ a, key: d.key, value: value / ACTIONS[a].cost + Math.random() * 0.5 }); };
        if (c.war && !c.owner) consider('arm', d.val * 3 + (c.war.balance * s < 0 ? 4 : 1));
        else if (mine < 95 && mine > -70) {
          const near = mine >= 35 && mine < 65 ? 1.6 : 1;            // finish off countries close to joining
          consider('aid', d.val * 2 * near * STAB[c.stab]);
          consider('propaganda', d.val * 0.8 * STAB[c.stab]);
          if (g.tension < 45 && mine < 10 && c.stab <= 2 && d.val >= 2) consider('coup', d.val * 1.5);
        }
      }
      for (const w of g.wars) {
        const party = friendIn(g, w, side), v = info(w[party]).val, ahead = party === 'att' ? w.front : -w.front, losing = ahead < 0;
        if (isHome(w[party]) || g.c[w[party]].a * s < 25 || ahead > 40) continue;      // only help real friends who need it
        if (warCheck(g, side, w, party, 'arm').ok) options.push({ war: w, party, kind: 'arm', value: (v * 2 + (losing ? 3 : 0)) / ARM_COST });
        if (losing && g.tension < 50 && g.c[w[party]].a * s >= BLOC && warCheck(g, side, w, party, 'troops').ok) options.push({ war: w, party, kind: 'troops', value: v * 1.2 });
      }
      if (!options.length) break;
      options.sort((x, y) => y.value - x.value);
      const o = options[0];
      if (o.war) warHelp(g, side, o.war, o.party, o.kind); else act(g, side, o.a, o.key);
    }
  }

  // ================= playing a nation inside a union =================
  // Ukraine inside the USSR, Scotland inside Britain, Slovakia inside Czechoslovakia...: no army or foreign
  // policy of your own yet. Build support for independence, arm a militia, and choose the moment to rise.
  const UNION_ACTIONS = {
    movement: { name: 'National Movement', cost: 3, help: 'Poets, priests and underground papers: support for independence +12. The centre notices.' },
    militia: { name: 'Secret Militia', cost: 2, help: 'Hidden weapons and trained men: militia +2 (up to 12). It fights when you rise.' },
    declare: { name: 'Declare Independence', cost: 4, help: 'Rise against the union. Your militia and the people fight; if the uprising is crushed, it is over for you.' },
    fight: { name: 'Lead the Fight', cost: 2, help: 'Throw everything into the uprising: a push for the rebels this year (twice a year).' },
  };
  const captive = g => !!(g.nation && g.c[g.nation].owner);
  function unionCheck(g, kind) {
    const A = UNION_ACTIONS[kind], c = g.c[g.nation], r = { ok: false, cost: A.cost, why: '' };
    if (g.over) return (r.why = 'The game is over', r);
    if (!captive(g)) return (r.why = 'You are free', r);
    if (g.ip.ME < A.cost) return (r.why = 'Not enough IP', r);
    if (kind === 'fight') { if (!c.war) return (r.why = 'Not during peace', r); if ((g.homeMoves.fight || 0) >= 2) return (r.why = 'Twice a year', r); r.ok = true; return r; }
    if (c.war) return (r.why = 'The uprising has begun', r);
    if (g.homeMoves[kind]) return (r.why = 'Once a year', r);
    if (kind === 'militia' && (g.militia || 0) >= 12) return (r.why = 'As big as it can get in secret', r);
    if (kind === 'declare' && (g.support || 0) < 40) return (r.why = 'Support must reach 40 first', r);
    r.ok = true; return r;
  }
  function unionAct(g, kind) {
    const r = unionCheck(g, kind); if (!r.ok) return r.why;
    const c = g.c[g.nation], owner = stateOf(g, c.owner);
    g.ip.ME -= r.cost; g.homeMoves[kind] = (g.homeMoves[kind] || 0) + 1;
    if (kind === 'movement') { g.support = Math.min(100, (g.support || 0) + 12); return `Support for independence grows to ${Math.round(g.support)}.`; }
    if (kind === 'militia') { g.militia = Math.min(12, (g.militia || 0) + 2); return `The militia grows to ${g.militia}.`; }
    if (kind === 'fight') { c.war.help[c.war.rebels] += 12; return 'Your people push forward.'; }
    const ownerSide = ownerAlign(g, owner) >= 0 ? 'US' : 'SU', rebels = OTHER[ownerSide];
    c.war = { rebels, ideo: null, balance: SIDE[rebels] * ((g.support || 0) - 40 + (g.militia || 0) * 2) * 0.6, years: 0, help: { US: 0, SU: 0 }, troops: {}, sep: true };
    addTension(g, 4);
    say(g, `${info(g.nation).name} declares independence from ${info(owner).name}! The people take to the streets.`);
    return 'You declare independence. Now hold out.';
  }
  // the movement grows by itself a little where the centre is weak, and the centre pushes back
  function unionYear(g) {
    if (!captive(g)) return;
    const c = g.c[g.nation], owner = stateOf(g, c.owner);
    const weak = isHome(owner) ? (g.pw[owner === 'USA' ? 'US' : 'SU'].home < 40) : g.c[owner].stab <= 2;
    g.support = clamp((g.support || 0) + (weak ? 3 : 0) - (VOTING(isHome(owner) ? (owner === 'USA' ? 'Democracy' : 'Socialist') : g.c[owner].gov) ? 0 : 2) + rand(-1, 2), 0, 100);
  }

  // ================= the cabinet: your ministers spend part of your IP for you =================
  // g.auto = { on, share (0.25..1), focus: balanced | home | influence | defence, report }
  const FOCUS = { balanced: 'Balanced', home: 'Home first', influence: 'Influence abroad', defence: 'Defence' };
  function setCabinet(g, o) { g.auto = Object.assign(g.auto || { on: false, share: 0.5, focus: 'balanced', report: '' }, o); }
  function runCabinet(g) {
    const a = g.auto; if (!a || !a.on || g.over) return;
    const me = g.nation ? 'ME' : g.side, before = g.ip[me], keep = before * (1 - a.share), done = [];
    const spend = (fn, label) => { const ip0 = g.ip[me]; const r = fn(); if (g.ip[me] < ip0) done.push(label); return r; };
    if (!g.nation) {
      const side = g.side, P = g.pw[side];
      if ((a.focus === 'home' || P.home < 40) && programCheck(g, side, 'homefront').ok) spend(() => programAct(g, side, 'homefront'), 'Home Front');
      if (a.focus === 'home' && programCheck(g, side, 'space').ok) spend(() => programAct(g, side, 'space'), 'Space Programme');
      if (a.focus === 'defence' && programCheck(g, side, 'army').ok) spend(() => programAct(g, side, 'army'), 'Expand the Army');
      if (a.focus !== 'home' || g.ip[side] > keep + 6) {
        const held = Math.min(g.ip[side], keep); g.ip[side] -= held;               // the ministers only see their share
        const ip0 = g.ip[side]; computerTurn(g, side); if (g.ip[side] < ip0) done.push(`${Math.round(ip0 - g.ip[side])} IP of moves abroad`);
        g.ip[side] += held;
      }
    } else if (captive(g)) {
      for (const k of ['movement', 'militia', 'fight', 'fight']) if (unionCheck(g, k).ok && k !== 'declare' && g.ip.ME - UNION_ACTIONS[k].cost >= keep) spend(() => unionAct(g, k), UNION_ACTIONS[k].name);
    } else {
      const c = g.c[g.nation], try1 = k => homeCheck(g, k).ok && g.ip.ME - HOME_ACTIONS[k].cost >= keep ? spend(() => homeAct(g, k), HOME_ACTIONS[k].name) : null;
      if (c.war) { try1('crush'); try1('crush'); }
      if (c.stab <= 2 || a.focus === 'home') try1('stabilise');
      const threat = (NB[g.nation] || []).some(b => g.c[b] && free(g, b) && g.c[b].army > c.army);
      if (threat || a.focus === 'defence') try1('army');
      if (a.focus !== 'defence') try1('develop');
      if (a.focus === 'influence' || a.focus === 'balanced') {
        const targets = D.COUNTRIES.filter(d => d.key !== g.nation && !isHome(d.key) && free(g, d.key) && Math.abs(g.c[d.key].a - c.a) > 5 && Math.abs(g.c[d.key].a - c.a) < 40).sort((x, y) => y.val - x.val);
        for (const d of targets.slice(0, 4)) if (check(g, 'ME', 'aid', d.key).ok && g.ip.ME - ACTIONS.aid.cost >= keep) spend(() => act(g, 'ME', 'aid', d.key), `Aid for ${d.name}`);
      }
      try1('stabilise');
    }
    a.report = done.length ? `Your cabinet: ${done.join(', ')}.` : 'Your cabinet saw nothing worth the money.';
  }

  // ================= events =================
  function runEvents(g) {
    allianceYear(g);
    for (const e of D.EVENTS) {
      if (e.y !== g.year) continue;
      if (e.nations) {                                                   // a decision only the player's nation gets
        const k = g.nation;
        if (!k || g.over || !free(g, k) || (e.nations !== 'any' && !e.nations.includes(k)) || (e.when && !e.when(g, H, k))) continue;
        say(g, `${e.title}. ${e.text}`); g.pending.push(e); continue;
      }
      if (e.when && !e.when(g, H)) continue;
      say(g, `${e.title}. ${e.text}`);
      if (e.fx) e.fx(g, H);
      if (e.options) {
        if (e.who === g.side) g.pending.push(e);
        else { const pick = e.options[e.ai ? e.ai(g, H) : 0]; pick.fx(g, H); say(g, `${NAME[e.who]}: ${pick.label}.`); }
      }
    }
    applyNames(g);
  }
  function choose(g, i) {
    const e = g.pending.shift(); if (!e) return;
    e.options[i].fx(g, H, g.nation); say(g, `You chose: ${e.options[i].label}.`); applyNames(g);
  }

  // ================= the end of a year =================
  const armyPower = (g, key) => g.c[key].army * (isHome(key) ? 1 : 0.8 + g.c[key].stab * 0.08);
  // ================= divisions that move freely: wars are fought on a grid =================
  // The world is cut into half-degree cells (provgrid.js, about 50 km). A division stands on a cell and
  // marches cell by cell toward the point it was sent to; the land it passes takes its side's colour
  // unless enemy troops stand close by. Divisions that come into contact fight. Supply runs cell by cell
  // from a side's capital (or the sea): close a ring around enemy divisions and they waste away and
  // surrender, and enemy land inside the ring with nobody in it falls. A province counts as held by an
  // occupier when most of its cells are (g.ctl), which is what peace treaties and borders read.
  // w.front (-100..100) comes from the land each side holds, so the rest of the game reads it as before.
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DIV = 2;                                          // army points in one full-strength division
  const MAX_DIVS = 24;
  const SPEED = 320, WINTER = 0.6, SUB = 4, CONTACT = 80, REACH = 110, ENEMY_GROUND = 2;   // ... and how far around itself a division holds the ground // km a season (less in winter), steps in a season, km at which divisions fight
  if (!G.CWGRID && typeof require === 'function') try { require('./provgrid.js'); } catch (e) { }
  const GR = G.CWGRID || { step: 0.5, lon0: -180, lat0: 84, cols: 720, rows: 280, rle: '' };
  const GC = GR.cols, GRR = GR.rows, CELL = new Int16Array(GC * GRR).fill(-1), CELLS_OF = {};
  { let i = 0; for (const run of GR.rle ? GR.rle.split(',') : []) { const k = run.indexOf('.'), v = parseInt(run.slice(0, k), 36) - 1, n = parseInt(run.slice(k + 1), 36); for (let j = 0; j < n; j++) CELL[i++] = v; } }
  for (let i = 0; i < CELL.length; i++) if (CELL[i] >= 0) (CELLS_OF[CELL[i]] = CELLS_OF[CELL[i]] || []).push(i);
  const cellLL = i => [GR.lon0 + (i % GC + 0.5) * GR.step, GR.lat0 - (Math.floor(i / GC) + 0.5) * GR.step];
  const cellAt = (lon, lat) => { const r = Math.floor((GR.lat0 - lat) / GR.step), c = ((Math.floor((lon - GR.lon0) / GR.step) % GC) + GC) % GC; return r < 0 || r >= GRR ? -1 : r * GC + c; };
  // neighbours of every cell, worked out once (the four straight ones are slots 1, 3, 4, 6)
  const NCELL = GC * GRR, NBT = new Int32Array(NCELL * 8).fill(-1), COAST = new Uint8Array(NCELL);
  { const D8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (let i = 0; i < NCELL; i++) { const r = Math.floor(i / GC), c = i % GC; for (let k = 0; k < 8; k++) { const rr = r + D8[k][0]; if (rr >= 0 && rr < GRR) NBT[i * 8 + k] = rr * GC + (c + D8[k][1] + GC) % GC; } }
    for (let i = 0; i < NCELL; i++) if (CELL[i] >= 0) for (const k of [1, 3, 4, 6]) { const j = NBT[i * 8 + k]; if (j >= 0 && CELL[j] < 0) COAST[i] = 1; } }
  const cellNb = i => { const out = []; for (let k = 0; k < 8; k++) { const j = NBT[i * 8 + k]; if (j >= 0) out.push(j); } return out; };
  const cellNb4 = i => { const out = []; for (const k of [1, 3, 4, 6]) { const j = NBT[i * 8 + k]; if (j >= 0) out.push(j); } return out; };
  const coastal = i => COAST[i] === 1;
  const km = (a, b) => { let dx = Math.abs(a[0] - b[0]); if (dx > 180) dx = 360 - dx; return Math.hypot(dx * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111; };
  const capPid = key => { const p = PROV.find(x => x.key === key && x.cap); return p ? p.id : null; };
  // the cell of a province's middle, and of a country's capital city
  const pidCell = id => { const p = PBY[id], c = cellAt(p.c[0], p.c[1]); return CELL[c] === id ? c : (CELLS_OF[id] || [c])[0]; };
  const capCellOf = key => {
    const pid = capPid(key); if (pid === null) return null;
    const city = D.CAPITALS.find(x => x.key === key), c = city ? cellAt(city.lon, city.lat) : -1;
    return c >= 0 && CELL[c] === pid ? c : pidCell(pid);
  };
  const ctrlOf = (g, id) => (g.ctl && g.ctl[id]) || stateOf(g, holderOf(g, id));
  // who fights in a war: the two states, and a superpower that sent troops
  function sidesOf(g, w) {
    const s = { att: [w.att], def: [w.def] };
    for (const p of ['US', 'SU']) { const t = w.civil ? (w.troops[p] ? (p === w.rebels ? 'att' : 'def') : null) : w.troops[p]; if ((t === 'att' || t === 'def') && !s.att.includes(HOME[p]) && !s.def.includes(HOME[p])) s[t].push(HOME[p]); }
    return s;
  }
  const FOE = { att: 'def', def: 'att' };
  // ---- civil wars fought with divisions: the rebels are a side of their own, 'R:' + their land ----
  const REB = key => 'R:' + key;
  const rebLand = k => typeof k === 'string' && k.startsWith('R:') ? k.slice(2) : null;
  function nameOf(g, k) {
    const l = rebLand(k); if (!l) return info(k).name;
    const w = g.c[l] && g.c[l].war;
    return w && w.sep ? `the ${info(l).name} rebels` : 'the ' + (REBELS[w && w.ideo] || REBELS.nat).name.toLowerCase();
  }
  // a civil war is fought with divisions when its land has room for it (two provinces or more)
  function civilFronts(g) {
    const out = [];
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key], w = c.war; if (!w) continue;
      if (w.div === undefined) w.div = provsHeldBy(g, d.key).length >= 2;
      if (!w.div) continue;
      w.civil = true; w.land = d.key; w.att = REB(d.key); w.def = c.owner ? stateOf(g, c.owner) : d.key;
      if (w.id === undefined) w.id = 'c' + (++g.warId);
      w.capFell = w.capFell || {};
      out.push(w);
    }
    return out;
  }
  const fronts = g => [...g.wars, ...civilFronts(g)];
  const capOfSide = (w, s) => w.civil ? (s === 'def' ? capPid(w.land) : null) : capPid(w[s]);
  const capCellSide = (w, s) => w.civil ? (s === 'def' ? capCellOf(w.land) : null) : capCellOf(w[s]);
  // the player's own divisions: their state's, and the rebels' in their own rising
  const myKeys = g => { const k = playerKey(g); return g.nation && g.c[g.nation] && g.c[g.nation].owner ? [k, REB(g.nation)] : [k]; };
  const isMine = (g, u) => myKeys(g).includes(u.k);
  // how strong each side of a civil war starts
  function civilArmy(g, w, k) {
    const c = g.c[w.land], owner = c.owner ? stateOf(g, c.owner) : null, myRising = w.land === g.nation && !!owner;
    const gov = myRising ? g.c[owner].army * 0.8 * (isHome(owner) ? g.pw[owner === 'USA' ? 'US' : 'SU'].home / 70 : g.c[owner].stab / 3)   // against your rising the centre throws in what its grip allows
      : owner ? (isHome(owner) ? 12 : g.c[owner].army * 0.4) : c.army;
    if (k === w.def) return gov;
    return myRising ? 2 + (g.militia || 0) * 2 + (g.support || 0) / 5 : gov * (0.6 + (4 - c.stab) * 0.15) * (modOf(g, w.def, 'police') ? 0.67 : 1);
  }
  const civilDivs = (g, w, k) => clamp(Math.round(civilArmy(g, w, k) / DIV), 1, MAX_DIVS);
  const nbOf = id => Object.keys(PBY[id].nb).map(Number);
  // the land of a war, cell by cell: who it belongs to (own), who holds it now (side: 'att' / 'def'),
  // whether it is a superpower's heartland (no enemy enters it)
  function theatre(g, w) {
    const S = sidesOf(g, w), all = new Set([...S.att, ...S.def]), T = { S, pids: [], cells: [], own: {}, side: {}, home: {} };
    const add = (pid, own) => {
      T.pids.push(pid);
      const home = !w.civil && isHome(PBY[pid].key);
      for (const i of CELLS_OF[pid] || []) {
        const c = (g.cc && g.cc[i]) || own;
        T.cells.push(i); T.own[i] = own; T.home[i] = home;
        T.side[i] = S.att.includes(c) ? 'att' : S.def.includes(c) ? 'def' : null;
      }
    };
    if (w.civil) { for (const id of provsHeldBy(g, w.land)) add(id, w.def); return T; }
    for (const p of PROV) {
      const own = stateOf(g, holderOf(g, p.id));
      if (!all.has(own)) continue;
      if (isHome(p.key) && own !== w.att && own !== w.def) continue;   // a helping superpower's own country is far away
      add(p.id, own);
    }
    return T;
  }
  const unitsOf = (g, w) => (g.units || []).filter(u => u.w === w.id);
  const unitPower = u => u.str * Math.max(0.15, u.org) * u.q;
  const canEnter = (T, side, i) => { const s = T.side[i]; return !!s && (s === side || !T.home[i]); };
  const quality = (g, k) => rebLand(k) ? 0.9 : isHome(k) ? 1.4 : 0.85 + g.c[k].stab * 0.06 + modOf(g, k, 'quality');
  const sideOfU = (T, u) => T.S.att.includes(u.k) ? 'att' : 'def';
  const ll = u => [u.x, u.y];
  function putAt(u, i) { u.cell = i; const p = cellLL(i); u.x = p[0]; u.y = p[1]; u.p = CELL[i]; }
  // a cell changes hands: back to its owner's side, or held by the side's main state
  function setCell(g, w, T, i, side) {
    if (T.S[side].includes(T.own[i])) delete g.cc[i]; else g.cc[i] = w[side];
    T.side[i] = side;
  }
  const foeNear = (g, w, T, side, pt, r) => unitsOf(g, w).filter(u => sideOfU(T, u) !== side && km(ll(u), pt) < r);
  // ---- raising the armies ----
  // spots along the front: spread out, starting nearest the enemy's capital
  function spread(cells, n, start) {
    if (!cells.length) return [];
    const out = [cells.slice().sort((a, b) => km(cellLL(a), start) - km(cellLL(b), start))[0]], d = {};
    for (const c of cells) d[c] = km(cellLL(c), cellLL(out[0]));
    while (out.length < Math.min(n, cells.length)) {
      let best = null, bd = -1; for (const c of cells) if (d[c] > bd) { bd = d[c]; best = c; }
      if (bd <= 0) break;
      out.push(best); for (const c of cells) d[c] = Math.min(d[c], km(cellLL(c), cellLL(best)));
    }
    return out;
  }
  function frontCells(T, side, onlyOwnBy) {
    const foe = FOE[side], out = [];
    for (const i of T.cells) {
      if (T.side[i] !== side || (onlyOwnBy && T.own[i] !== onlyOwnBy)) continue;
      for (let k = 0; k < 8; k++) { const j = NBT[i * 8 + k]; if (j >= 0 && T.side[j] === foe && canEnter(T, side, j)) { out.push(i); break; } }
    }
    return out;
  }
  function raise(g, w, T, k, n, q) {
    const side = T.S.att.includes(k) ? 'att' : 'def', foe = FOE[side];
    const fc = capCellSide(w, foe), aim = fc !== null ? cellLL(fc) : [0, 0];
    let spots = frontCells(T, side, k);
    if (!spots.length) spots = frontCells(T, side);                                                  // a friend's border (troops sent abroad)
    if (!spots.length && side === 'att' && !w.civil) {                                              // no border at all: land on the enemy's shore
      const home = D.CAPITALS.find(x => x.key === k), from = home ? [home.lon, home.lat] : aim;
      const shore = T.cells.filter(i => T.side[i] === foe && !T.home[i] && coastal(i)).sort((a, b) => km(cellLL(a), from) - km(cellLL(b), from))[0];
      if (shore !== undefined) {
        setCell(g, w, T, shore, side); for (const j of cellNb(shore)) if (T.side[j] === foe && !T.home[j]) setCell(g, w, T, j, side);
        spots = [shore]; w.landed = w.landed || {}; w.landed[side] = true; say(g, `${info(k).name} lands troops in ${PBY[CELL[shore]].name}.`);
      }
    }
    if (!spots.length) { const cc = rebLand(k) ? null : capCellOf(k); spots = cc !== null && T.side[cc] === side ? [cc] : T.cells.filter(i => T.side[i] === side).slice(0, 1); }
    if (!spots.length) return;
    const at = spread(spots, n, aim);
    for (let i = 0; i < n; i++) { const u = { id: ++g.unitId, k, w: w.id, str: 1, org: 1, q, path: [], auto: true, goal: null }; putAt(u, at[i % at.length]); g.units.push(u); }
  }
  // a state's army as divisions: a full one per DIV army points
  const divsFor = (g, k) => isHome(k) ? 10 : clamp(Math.round(g.c[k].army / DIV), 1, MAX_DIVS);
  // the rebels start with land of their own: next to a friendly neighbour, or as far from the capital as they can get
  function seedRebels(g, w, T) {
    const ids = T.pids, set = new Set(ids), cap = capPid(w.land);
    const frac = clamp((w.sep ? 0.35 : 0.3) + SIDE[w.rebels] * (w.balance || 0) / 250, 0.15, 0.7);
    const n = clamp(Math.round(ids.length * frac), 1, ids.length - 1);
    const friendly = j => { const k = stateOf(g, holderOf(g, j)); if (k === w.def || k === w.land) return false; return k === HOME[w.rebels] || (!!g.c[k] && !isHome(k) && g.c[k].independent && g.c[k].a * SIDE[w.rebels] >= 30); };
    const capC = cap !== null && set.has(cap) ? PBY[cap].c : PBY[ids[0]].c;
    const score = id => (nbOf(id).some(friendly) ? 5000 : 0) + km(PBY[id].c, capC);
    const seed = ids.filter(id => id !== cap).sort((a, b) => score(b) - score(a))[0];
    if (seed === undefined) return;
    const got = new Set([seed]);
    while (got.size < n) {
      const next = [...got].flatMap(nbOf).filter(j => set.has(j) && !got.has(j) && j !== cap).sort((a, b) => km(PBY[b].c, capC) - km(PBY[a].c, capC))[0];
      if (next === undefined) break; got.add(next);
    }
    for (const id of got) for (const i of CELLS_OF[id] || []) setCell(g, w, T, i, 'att');
  }
  function muster(g, w, T) {
    w.raised = w.raised || {}; w.base = w.base || {};
    w.ff = w.ff || { att: 0, def: 0 }; w.ffMax = w.ffMax || { att: 0, def: 0 };
    if (w.civil && !w.raised[w.att]) seedRebels(g, w, T);
    for (const side of ['att', 'def']) for (const k of T.S[side]) {
      if (w.raised[k]) continue;
      w.raised[k] = true;
      const helper = isHome(k) && k !== w.att && k !== w.def;                              // a superpower's expedition: few, but the best
      const before = g.units.length;
      const n = helper ? 8 : w.civil ? civilDivs(g, w, k) : divsFor(g, k);
      w.base[k] = n;
      // behind the divisions you see stand the troops that hold the whole line: about half as many again
      const add = n * 0.25 * quality(g, k); w.ff[side] += add; w.ffMax[side] += add;
      raise(g, w, T, k, n, quality(g, k));
      const made = g.units.length - before;
      if (!w.civil && !isHome(k) && made) for (const u of g.units.slice(before)) u.str = clamp(g.c[k].army / (made * DIV), 0.3, 1);
    }
  }
  // ---- the way across the cells ----
  // one shared search buffer (a stamp per search, so nothing has to be cleared): use a result before the next search
  const STAMP = new Int32Array(NCELL), DIST = new Int32Array(NCELL), PARENT = new Int32Array(NCELL); let GEN = 0;
  function bfs(from, ok, stopAt, maxD) {
    GEN++; const q = [];
    for (const i of from) { if (STAMP[i] === GEN) continue; STAMP[i] = GEN; DIST[i] = 0; PARENT[i] = -1; q.push(i); }
    for (let n = 0; n < q.length; n++) {
      const i = q[n]; if (i === stopAt) break; if (maxD !== undefined && DIST[i] >= maxD) continue;
      for (let k = 0; k < 8; k++) { const j = NBT[i * 8 + k]; if (j < 0 || STAMP[j] === GEN || !ok(j)) continue; STAMP[j] = GEN; DIST[j] = DIST[i] + 1; PARENT[j] = i; q.push(j); }
    }
    const gen = GEN;
    return { has: i => STAMP[i] === gen, d: i => STAMP[i] === gen ? DIST[i] : undefined, list: q };
  }
  function route(T, side, from, to) {
    if (from === to) return [];
    if (!canEnter(T, side, to)) return null;
    const r = bfs([from], j => canEnter(T, side, j), to);
    if (!r.has(to)) return null;
    const path = []; for (let i = to; i !== from && i >= 0; i = PARENT[i]) path.push(i);
    return path.reverse();
  }
  // the nearest cell a side may enter, near a point
  function cellNear(T, side, pt) {
    let c = cellAt(pt[0], pt[1]);
    if (c >= 0 && canEnter(T, side, c)) return c;
    let best = null, bd = Infinity;
    for (const i of T.cells) { if (!canEnter(T, side, i)) continue; const d = km(cellLL(i), pt); if (d < bd) { bd = d; best = i; } }
    return bd < 400 ? best : null;
  }
  // ---- the computer's generals (and the player's divisions on front orders) ----
  // They spread along the front; where they are clearly stronger, they strike a few cells deep, toward the
  // enemy capital and where the enemy is thin; strikes from two places close the ring around what is between.
  function plan(g, w, T, side, units, stance) {
    const foe = FOE[side], all = unitsOf(g, w), ours = all.filter(u => sideOfU(T, u) === side), theirs = all.filter(u => sideOfU(T, u) === foe);
    for (const u of units) { u.path = []; u.goalCell = null; }
    if (!units.length) return;
    const pow = list => list.reduce((s, u) => s + unitPower(u), 0);
    const ff = w.ff || { att: 0, def: 0 };
    const total = pow(ours) + ff[side] * 0.5, enemy = pow(theirs) + ff[foe] * 0.5;
    const need = stance === 'hold' ? Infinity : (total < enemy * 0.7 ? 1.6 : 1) * (side === 'att' ? 0.85 : 1.15) * Math.max(0.55, 1 - (w.quiet || 0) * 0.06) * (1 + Math.max(0, ((w.ex && w.ex[side]) || 0) - 50) / 50);   // a tired army attacks less
    const go = (u, cell) => { u.goalCell = cell; u.path = route(T, side, u.cell, cell) || []; };
    // cut off: break out toward home first
    const free = [];
    for (const u of units) {
      if (!u.cut) { free.push(u); continue; }
      let best = null, bd = Infinity;
      for (const i of T.cells) { if (T.side[i] !== side || !T.S[side].includes(T.own[i])) continue; const d = km(cellLL(i), ll(u)); if (d < bd) { bd = d; best = i; } }
      if (best !== null) go(u, best);
    }
    const F = frontCells(T, side);
    if (!F.length || !free.length) return;
    const fc = capCellSide(w, foe), aim = fc !== null ? cellLL(fc) : ll(theirs[0] || free[0]);
    const near = (list, pt, r) => pow(list.filter(x => km(ll(x), pt) < r));
    const left = new Set(free);
    // worn-out divisions step back a little to recover; someone else takes their place
    for (const u of free) {
      if (u.org >= 0.25 || ours.length < 3) continue;
      const back = cellNb(u.cell).concat(...cellNb(u.cell).map(cellNb)).filter(j => T.side[j] === side && !F.includes(j))
        .sort((x, y) => near(theirs, cellLL(x), 200) - near(theirs, cellLL(y), 200))[0];
      if (back !== undefined) { left.delete(u); go(u, back); }
    }
    // 1. strikes: a few groups of two or three, at the weak spots of the enemy line and at bulges we can cut off
    if (need < Infinity) {
      const cand = new Set();
      for (const i of F) for (const j of cellNb(i)) if (T.side[j] === foe && canEnter(T, side, j)) cand.add(j);
      const sample = spread([...cand], 40, aim), scored = [];
      for (const c of sample) {
        const pt = cellLL(c);
        let around = 0; for (const j of cellNb(c)) for (const k of cellNb(j)) if (T.side[k] === side) around++;
        const weak = near(theirs, pt, 160) + (ff[foe] / Math.max(10, F.length)) * 1.5;
        scored.push({ c, pt, weak, s: around * 0.08 - weak * 1.2 + provVal(CELL[c]) * 3 - km(pt, aim) / 900 + Math.random() * 0.3 });
      }
      scored.sort((x, y) => y.s - x.s);
      // most of the army stays on the line: at most a quarter (a third when clearly stronger) goes on strikes
      const spare = Math.floor(left.size * (total > enemy * 1.3 ? 0.34 : 0.25));
      const groups = Math.max(left.size >= 4 ? 1 : 0, Math.floor(spare / 2)), taken = [];
      let striking = 0;
      for (const t of scored) {
        if (taken.length >= groups || striking >= Math.max(2, spare)) break;
        if (taken.some(x => km(x.pt, t.pt) < 300)) continue;
        const team = [...left].filter(u => u.org >= 0.45).sort((x, y) => km(ll(x), t.pt) - km(ll(y), t.pt)).slice(0, Math.min(3, Math.max(2, spare - striking))).filter(u => km(ll(u), t.pt) < 300);
        if (!team.length) continue;
        const punch = pow(team) + near(ours.filter(u => !team.includes(u)), t.pt, 160) * 0.3;
        if (punch < (t.weak * 1.3 || 0.01) * need) continue;
        // the goal: two or three cells beyond the line, toward their capital
        const r = bfs([t.c], j => T.side[j] === foe && canEnter(T, side, j), undefined, 3);
        let best = t.c, bs = Infinity;
        for (const i of r.list) { const sc = km(cellLL(i), aim) - r.d(i) * 70; if (sc < bs) { bs = sc; best = i; } }
        // side by side, not on one spot: each of the group aims at its own cell around the goal
        const tips = [best, ...cellNb(best).filter(j => T.side[j] === foe && canEnter(T, side, j))];
        team.forEach((u, n) => { left.delete(u); go(u, tips[(n * 3) % tips.length]); });
        striking += team.length;
        taken.push(t);
      }
    }
    // 2. everyone else holds the line: one post each, spread evenly along the whole front (where the front is
    // short, two share a post). A division already standing near a free post keeps it, so the line does not shuffle.
    if (!left.size) return;
    const posts = spread(F, left.size, aim);
    // a short front has fewer spots than divisions: the rest form a second (and third) line just behind it
    const fs = new Set(F);
    for (let ring = 0; ring < 2 && posts.length < left.size; ring++) {
      const back = new Set();
      for (const i of fs) for (const j of cellNb(i)) if (!fs.has(j) && T.side[j] === side && canEnter(T, side, j)) back.add(j);
      if (!back.size) break;
      posts.push(...spread([...back], left.size - posts.length, aim));
      for (const j of back) fs.add(j);
    }
    const n0 = posts.length;
    while (posts.length < left.size && n0) posts.push(posts[posts.length % n0]);
    const pairs = [];
    for (const p of posts) for (const u of left) pairs.push([km(ll(u), cellLL(p)) - near(theirs, cellLL(p), 200) * 15, p, u]);
    pairs.sort((x, y) => x[0] - y[0]);
    const used = new Map();
    for (const [, p, u] of pairs) {
      if (!left.has(u) || (used.get(p) || 0) >= posts.filter(x => x === p).length) continue;
      used.set(p, (used.get(p) || 0) + 1); left.delete(u); go(u, p);
    }
  }
  // ---- one season of fighting in every war ----
  function warSeason(g) {
    g.units = g.units || []; g.ctl = g.ctl || {}; g.cc = g.cc || {}; g.unitId = g.unitId || 0; g.battles = [];
    migrate(g);
    tidyWar(g);
    const mine = myKeys(g);
    for (const w of fronts(g)) {
      const T = theatre(g, w);
      muster(g, w, T);
      // help from outside: weapons patch up the side's divisions
      for (const side of ['att', 'def']) {
        const hk = w.civil ? (side === 'att' ? w.rebels : OTHER[w.rebels]) : side;     // a civil war's help is counted by camp
        if (!(w.help[hk] > 0)) continue;
        for (const u of unitsOf(g, w)) if (T.S[side].includes(u.k)) { u.str = Math.min(1, u.str + w.help[hk] * 0.004); u.org = Math.min(1, u.org + 0.2); }
        w.help[hk] = 0;
      }
      // orders: the computer's, and the player's divisions on front orders
      for (const side of ['att', 'def']) {
        const auto = unitsOf(g, w).filter(u => T.S[side].includes(u.k) && (u.auto || !mine.includes(u.k)));
        const stance = mine.some(k => T.S[side].includes(k)) ? ((g.stance || {})[w.id] || 'advance') : 'advance';
        plan(g, w, T, side, auto, stance);
      }
      // the player's own orders: find the way again around what changed
      for (const u of unitsOf(g, w)) if (!u.auto && mine.includes(u.k) && u.goal) {
        const r = wayPath(T, sideOfU(T, u), u);
        if (r === null) { u.path = []; u.goal = null; u.way = null; continue; }
        u.path = r;
      }
      w.quiet = (w.quiet || 0) + 1;
      for (const u of unitsOf(g, w)) u.trail = [[u.x, u.y]];                    // where each division went this season (the map follows it)
      const snap = new Map(unitsOf(g, w).map(u => [u, u.str])), lost = { att: 0, def: 0 };
      const count = () => { const live = new Set(g.units); for (const [u, s] of snap) { const now = live.has(u) ? u.str : 0; if (now < s) lost[sideOfU(T, u)] += s - now; snap.set(u, now); } };
      for (let s = 0; s < SUB; s++) { step(g, w, T); frontForces(g, w, T); }
      count();
      supply(g, w, T);
      count();
      syncCtl(g, T);
      measure(g, w, T);
      if (!w.outcome) weariness(g, w, T, lost);
    }
    // a war ends when one side is beaten, or after enough years: a truce
    for (const w of fronts(g)) {
      const done = w.outcome; if (!done) continue;
      delete w.outcome;
      if (w.civil) civilEnd(g, w.land, done === 'att' ? w.rebels : done === 'def' ? OTHER[w.rebels] : null);
      else endWar(g, w, done);
      if (g.over) return;
    }
    tidyWar(g);
  }
  // old saves: divisions on provinces get a cell, occupied provinces become occupied cells
  function migrate(g) {
    for (const u of g.units) if (u.cell === undefined && u.p !== undefined && PBY[u.p]) { putAt(u, pidCell(u.p)); u.path = []; if (typeof u.goal === 'number') u.goal = PBY[u.goal] ? PBY[u.goal].c : null; }
    if (!g.ccDone) { g.ccDone = true; for (const id in g.ctl) for (const i of CELLS_OF[id] || []) g.cc[i] = g.ctl[id]; }
  }
  // ---- a quarter of a season: marches, then battles ----
  function step(g, w, T) {
    const us = unitsOf(g, w).sort(() => Math.random() - 0.5), winter = (g.season || 0) === 3;
    const engaged = new Map();                                            // defender -> attackers
    const near = (side, pt, r) => us.filter(x => g.units.includes(x) && sideOfU(T, x) !== side && x.str > 0 && km(ll(x), pt) < r);
    for (const u of us) {
      if (!u.path || !u.path.length) continue;
      const side = sideOfU(T, u), foe = FOE[side];
      let left = (u.carry || 0) + SPEED * (isHome(u.k) ? 1.2 : 1) * (winter ? WINTER : 1) / SUB;
      while (u.path.length) {
        const next = u.path[0], d = km(cellLL(u.cell), cellLL(next)) * (T.side[next] !== side ? ENEMY_GROUND : 1);   // taking ground is slower than marching through your own
        if (d > left) break;
        if (!canEnter(T, side, next)) { u.path = []; break; }
        if (T.side[next] !== side) {
          const block = near(side, cellLL(next), CONTACT);
          if (block.length) {                                             // enemy troops in the way: attack the nearest
            if (u.org < 0.25) { u.path = []; break; }
            const t = block.sort((a, b) => km(ll(a), ll(u)) - km(ll(b), ll(u)))[0];
            if (!engaged.has(t)) engaged.set(t, []); engaged.get(t).push(u);
            break;
          }
        }
        left -= d; u.path.shift(); putAt(u, next); u.org = Math.max(0, u.org - 0.01);
        (u.trail = u.trail || []).push([u.x, u.y]);
        if (!u.path.length && u.goal && cellAt(u.goal[0], u.goal[1]) === u.cell) { u.x = u.goal[0]; u.y = u.goal[1]; u.trail[u.trail.length - 1] = [u.x, u.y]; }   // the very spot it was sent to
        if (T.side[next] !== side) setCell(g, w, T, next, side);
      }
      u.carry = u.path.length ? Math.min(left, 200) : 0;
    }
    // the battles: each defending division (and those standing with it) against the divisions attacking it
    const town = id => (PBY[id].towns && PBY[id].towns[0]) || PBY[id].name;
    for (const [t, A0] of engaged) {
      if (!g.units.includes(t)) continue;
      const A = A0.filter(u => g.units.includes(u) && u.str > 0); if (!A.length) continue;
      const side = sideOfU(T, A[0]), foe = FOE[side];
      const D0 = us.filter(x => g.units.includes(x) && sideOfU(T, x) === foe && x.str > 0 && km(ll(x), ll(t)) < 40);
      for (const u of [...A, ...D0]) u.fought = true;
      const allyBonus = foe === 'def' && !w.civil ? 1 + allyHelp(g, w.def, w.att) / 120 : 1;
      const capC = capCellSide(w, foe), atCap = capC !== null && km(ll(t), cellLL(capC)) < 60;
      let pa = A.reduce((s, u) => s + unitPower(u), 0) * rand(0.8, 1.2);
      const fort = T.S[foe].includes(T.own[t.cell]) ? 1 + modOf(g, T.own[t.cell], 'fort') : 1;          // fortifications on their own land
      const pd = D0.reduce((s, u) => s + unitPower(u), 0) * 1.3 * (atCap ? 1.25 : 1) * allyBonus * fort * rand(0.8, 1.2);
      const dirs = A.reduce((m, u) => Math.max(m, km(ll(u), ll(A[0]))), 0);
      if (dirs > 90) pa *= 1.15;                                          // attacked from more than one side
      const r = pa / Math.max(0.01, pd);
      for (const u of A) { u.org = Math.max(0, u.org - clamp(0.16 / r, 0.04, 0.32)); u.str = Math.max(0, u.str - clamp(0.03 / r, 0.01, 0.1)); }
      for (const u of D0) { u.org = Math.max(0, u.org - clamp(0.16 * r, 0.04, 0.32)); u.str = Math.max(0, u.str - clamp(0.03 * r, 0.01, 0.1)); }
      const worn = D0.reduce((x, u) => x + u.org, 0) / D0.length < 0.3;
      const won = r > 1 && (worn || r > 2.4);
      const from = A.slice().sort((a, b) => km(ll(a), ll(t)) - km(ll(b), ll(t)))[0];
      g.battles.push({ x: t.x, y: t.y, fx: from.x, fy: from.y, p: CELL[t.cell], w: w.id, att: w[side], def: w[foe], won, held: !won && r > 1, a: A.length, d: D0.length, r: Math.round(r * 100) / 100 });
      w.quiet = 0;
      if (!won) { for (const u of A) u.path = []; continue; }
      // the defenders fall back, away from the attackers; with nowhere to go they are destroyed
      const ac = [A.reduce((s, u) => s + u.x, 0) / A.length, A.reduce((s, u) => s + u.y, 0) / A.length];
      for (const u of D0) {
        const back = cellNb(u.cell).concat(...cellNb(u.cell).map(cellNb)).filter(j => T.side[j] === foe && j !== u.cell && !near(foe, cellLL(j), 45).length)
          .sort((a, b) => km(cellLL(b), ac) - km(cellLL(a), ac))[0];
        if (back === undefined) { u.str = 0; say(g, `A division of ${nameOf(g, u.k)} is surrounded at ${town(CELL[u.cell])} and destroyed.`); }
        else { putAt(u, back); u.path = []; u.org = Math.max(0, u.org - 0.1); (u.trail = u.trail || []).push([u.x, u.y]); }
      }
      if (T.side[t.cell] === foe && !near(side, cellLL(t.cell), 30).length) setCell(g, w, T, t.cell, side);
    }
    g.units = g.units.filter(u => u.str > 0.04);
    reach(g, w, T);
  }
  // ---- the front-line troops nobody sees ----
  // Spread evenly along a side's front (w.ff, in divisions), they push the line wherever their side is stronger
  // there - counting the divisions nearby - and hold it where it is weaker. No orders: they fight on their own.
  // They wear down in the fighting and fill up again each season.
  function frontForces(g, w, T) {
    if (!w.ff) return;
    const us = unitsOf(g, w).filter(u => u.str > 0.04), pairs = [], fronts = { att: 0, def: 0 };
    for (const side of ['att', 'def']) {
      const foe = FOE[side];
      for (const i of T.cells) {
        if (T.side[i] !== side) continue;
        let edge = false;
        for (const k of [1, 3, 4, 6]) { const j = NBT[i * 8 + k]; if (j >= 0 && T.side[j] === foe && canEnter(T, side, j)) { pairs.push([i, j, side]); edge = true; } }
        if (edge) fronts[side]++;
      }
    }
    if (!pairs.length) return;
    const dens = { att: w.ff.att / Math.max(8, fronts.att), def: w.ff.def / Math.max(8, fronts.def) };
    const local = (side, pt) => { let p = dens[side]; for (const u of us) if (sideOfU(T, u) === side) { const d = km(ll(u), pt); if (d < 140) p += unitPower(u) * 0.35 * (1 - d / 140); } return p; };
    const loss = { att: 0, def: 0 };
    for (let n = pairs.length - 1; n > 0; n--) { const k = Math.floor(Math.random() * (n + 1)); [pairs[n], pairs[k]] = [pairs[k], pairs[n]]; }
    const done = new Set();
    for (const [i, j, side] of pairs) {
      if (done.has(j) || T.side[i] !== side || T.side[j] === side) continue;
      const foe = FOE[side], pj = cellLL(j);
      const mine = local(side, cellLL(i)), theirs = local(foe, pj) * (T.S[foe].includes(T.own[j]) ? 1.25 : 1);
      loss[side] += theirs * 0.004; loss[foe] += mine * 0.004;
      if (mine <= theirs * 1.2) continue;
      if (Math.random() > Math.min(0.12, (mine / Math.max(0.001, theirs) - 1.2) * 0.15)) continue;
      if (us.some(u => km(ll(u), pj) < REACH)) continue;                      // where divisions stand, only they move the front
      setCell(g, w, T, j, side); done.add(j);
    }
    for (const side of ['att', 'def']) w.ff[side] = Math.max(0, w.ff[side] - loss[side]);
  }
  // Every division holds the ground around it (REACH km) where it is closer than any enemy division: the front
  // settles between the armies, a few divisions hold a wide country, and to push the enemy back you beat his troops.
  function reach(g, w, T) {
    const us = unitsOf(g, w).filter(u => u.str > 0.04); if (!us.length) return;
    const step = GR.step;
    for (const u of us) {
      const side = sideOfU(T, u), foe = FOE[side], enemies = us.filter(x => sideOfU(T, x) === foe);
      const dr = Math.ceil(REACH / 111 / step), dc = Math.ceil(REACH / (111 * Math.max(0.2, Math.cos(u.y * Math.PI / 180))) / step);
      const r0 = Math.floor(u.cell / GC), c0 = u.cell % GC;
      for (let r = r0 - dr; r <= r0 + dr; r++) {
        if (r < 0 || r >= GRR) continue;
        for (let c = c0 - dc; c <= c0 + dc; c++) {
          const i = r * GC + ((c % GC) + GC) % GC;
          if (T.side[i] !== foe || !canEnter(T, side, i)) continue;
          const p = cellLL(i), d = km(p, ll(u)); if (d > REACH) continue;
          if (enemies.some(x => km(ll(x), p) <= d + 30)) continue;          // the enemy is about as close: it stays theirs (the front runs about halfway between)
          setCell(g, w, T, i, side);
        }
      }
    }
  }
  // ---- supply: a side's land joined to its capital (or to the sea) feeds its divisions ----
  // A pocket - land of a side cut off from both - starves: its divisions waste away and surrender, and if
  // none of them stand in it, the land falls to the enemy around it.
  function supply(g, w, T) {
    const town = id => (PBY[id].towns && PBY[id].towns[0]) || PBY[id].name;
    for (const side of ['att', 'def']) {
      const foe = FOE[side], mine = T.cells.filter(i => T.side[i] === side);
      const sea = !w.civil && (T.S[side].some(isHome) || !!(w.landed && w.landed[side]));                      // a superpower's navy supplies any shore it holds
      const cap = capCellSide(w, side), rebels = w.civil && side === 'att';
      const src = w.civil ? mine.filter(i => rebels || T.own[i] === w.def) : mine.filter(i => (cap !== null && i === cap) || (coastal(i) && (sea || T.S[side].includes(T.own[i]))));
      if (!src.length) { const own = mine.filter(i => T.S[side].includes(T.own[i])); src.push(...own); }    // no capital, no shore: what is left of home
      const inReach = new Set(bfs(src, j => T.side[j] === side).list);
      const pocket = mine.filter(i => !inReach.has(i));
      const ours = unitsOf(g, w).filter(u => T.S[side].includes(u.k)); let trapped = 0, gave = 0, where = null;
      for (const u of ours) {
        if (inReach.has(u.cell)) { u.org = Math.min(1, u.org + (u.fought ? 0.08 : 0.25) * (1 - ((w.ex && w.ex[side]) || 0) / 250)); u.str = Math.min(1, u.str + (isHome(u.k) ? 0.05 : 0.03 + ((g.c[u.k] && g.c[u.k].stab) || 2) * 0.005)); u.cut = false; }
        else {
          u.org = Math.max(0, u.org - 0.25); u.str = Math.max(0, u.str - 0.1);
          if (!u.cut) { trapped++; where = CELL[u.cell]; }
          u.cut = true;
          if (u.org <= 0.05 && u.str < 0.6) { u.str = 0; gave++; where = CELL[u.cell]; }
        }
        u.fought = false;
      }
      if (trapped) say(g, `${trapped} division${trapped > 1 ? 's' : ''} of ${nameOf(g, w[side])} ${trapped > 1 ? 'are' : 'is'} encircled near ${town(where)}!`);
      if (gave) say(g, `${gave} encircled division${gave > 1 ? 's' : ''} of ${nameOf(g, w[side])} surrender${gave > 1 ? '' : 's'} near ${town(where)}.`);
      // land in a pocket with nobody of ours in it goes to the enemy around it
      const guards = ours.filter(u => u.cut && u.str > 0);
      for (const i of pocket) if (!guards.some(u => km(ll(u), cellLL(i)) < CONTACT)) setCell(g, w, T, i, foe);
    }
    g.units = g.units.filter(u => u.str > 0.04);
    // the front-line troops fill up again
    if (w.ff) for (const side of ['att', 'def']) w.ff[side] = Math.min(w.ffMax[side], w.ff[side] + w.ffMax[side] * 0.12 * (1 - ((w.ex && w.ex[side]) || 0) / 200));
    // every spring a side that lost many divisions raises fresh ones
    if ((g.season || 0) === 0) for (const side of ['att', 'def']) for (const k of T.S[side]) {
      if (isHome(k) && k !== w.att && k !== w.def) continue;
      const have = g.units.filter(u => u.w === w.id && u.k === k).length, want = Math.ceil(((w.base && w.base[k]) || divsFor(g, k)) * 0.6);
      if (have >= want || have === 0 || (!isHome(k) && !rebLand(k) && g.c[k].army < 1)) continue;
      const before = g.units.length;
      raise(g, w, T, k, 1, quality(g, k));
      for (const u of g.units.slice(before)) { u.str = 0.5; u.org = 0.6; }
    }
    // a state's army is what its divisions add up to
    for (const k of [w.att, w.def]) if (!isHome(k) && !rebLand(k) && (!w.civil || k === w.land)) g.c[k].army = g.units.filter(u => u.k === k).reduce((s, u) => s + u.str * DIV, 0);
  }
  // provinces held by an occupier: those where it holds most of the cells
  function syncCtl(g, T) {
    for (const pid of T.pids) {
      const cells = CELLS_OF[pid] || [], cnt = {};
      for (const i of cells) { const c = g.cc[i]; if (c) cnt[c] = (cnt[c] || 0) + 1; }
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      if (top && cnt[top] * 2 > cells.length) g.ctl[pid] = top; else delete g.ctl[pid];
    }
  }
  // where the war stands: how much of each side's land the other holds (by value, cell by cell)
  function measure(g, w, T) {
    const tot = { att: 0, def: 0 }, lost = { att: 0, def: 0 };
    for (const pid of T.pids) {
      const cells = CELLS_OF[pid] || []; if (!cells.length) continue;
      const own = T.own[cells[0]], side = T.S.att.includes(own) ? 'att' : T.S.def.includes(own) ? 'def' : null;
      if (!side || T.home[cells[0]]) continue;
      const taken = cells.filter(i => T.side[i] && T.side[i] !== side).length / cells.length, v = provVal(pid);
      tot[side] += v; lost[side] += v * taken;
    }
    const share = s => tot[s] ? lost[s] / tot[s] : 0;
    w.held = { att: share('def'), def: share('att') };
    w.prev = w.front;
    w.front = clamp(Math.round((w.held.att - w.held.def) * 160), -100, 100);
    for (const s of ['att', 'def']) {
      const cc = capCellSide(w, s), fell = cc !== null && T.side[cc] === FOE[s], town = cc !== null ? ((PBY[CELL[cc]].towns || [])[0] || capitalName(w[s])) : '';
      if (fell && !w.capFell[s]) say(g, w.civil ? `${town} falls to ${nameOf(g, w.att)}!` : `${town} falls! ${info(w[FOE[s]]).name} takes the capital of ${info(w[s]).name}.`);
      if (!fell && w.capFell[s]) say(g, `${w.civil ? 'The government' : info(w[s]).name} retakes ${town}.`);
      w.capFell[s] = fell;
    }
    const left = s => unitsOf(g, w).filter(u => u.k === w[s]).length;
    if (w.civil) {                                                       // the rebels win by taking the capital and half the land (a region: 60%); the government by destroying them
      w.balance = SIDE[w.rebels] * Math.round((share('def') * 2 - 1) * 100);
      if (w.raised && w.raised[w.att] && left('att') === 0) w.outcome = 'def';
      else if (w.raised && w.raised[w.def] && left('def') === 0) w.outcome = 'att';
      else if (w.sep ? share('def') >= 0.6 : (w.capFell.def && share('def') >= 0.5) || share('def') >= 0.8) w.outcome = 'att';
      else if (w.years >= 10) w.outcome = 'truce';
      return;
    }
    const wiped = s => left(s) === 0 && !!(w.raised && w.raised[w[s]]);
    const beaten = s => wiped(s) || (!isHome(w[s]) && ((w.capFell[s] && share(s) >= 0.6) || share(s) >= 0.85));
    if (beaten('def')) w.outcome = 'att';
    else if (beaten('att')) w.outcome = 'def';
    else if (w.limited && share('def') >= 0.15 && w.years >= 1) w.outcome = 'att';
    else if (w.years >= (w.limited ? 3 : 12)) w.outcome = 'truce';
  }
  // ---- war exhaustion (0-100 a side): the people tire of the war ----
  // It grows every season, faster with the divisions lost, the land the enemy holds and a fallen capital, and
  // slower for a side that is winning ground. Shaky states tire sooner, rebels and superpowers later. A tired
  // army attacks less and recovers slower; at 100 the side must make peace - and if it has lost land, it loses.
  const EX_WARN = 60, EX_HIT = 80;
  function exMult(g, w, T, side) {
    const k = w[side];
    if (w.civil && side === 'att') return 0.6;                              // guerrillas outlast governments
    if (isHome(k)) { const p = k === 'USA' ? 'US' : 'SU'; return clamp(1.3 - ((g.pw && g.pw[p] && g.pw[p].home) || 60) / 100, 0.5, 1.1); }
    const c = g.c[k]; return c ? clamp(1.3 - (c.stab || 2) * 0.1, 0.75, 1.2) : 1;
  }
  function weariness(g, w, T, lost) {
    w.ex = w.ex || { att: 0, def: 0 }; w.exSaid = w.exSaid || {}; w.seasons = (w.seasons || 0) + 1;
    const base = side => Math.max(4, T.S[side].reduce((s, k) => s + ((w.base && w.base[k]) || 0) * (isHome(k) && k !== w.att && k !== w.def ? 0.5 : 1), 0));
    const held = w.held || { att: 0, def: 0 };
    for (const side of ['att', 'def']) {
      const foe = FOE[side], theirs = held[foe], ours = held[side];
      // a long war wears on everyone: each season weighs a little more than the last
      const gain = 1.5 + w.seasons * 0.2 + 55 * lost[side] / base(side) + 8 * theirs + (w.capFell && w.capFell[side] ? 4 : 0) - 4 * ours;
      w.ex[side] = clamp(w.ex[side] + Math.max(0.8, gain) * exMult(g, w, T, side), 0, 100);

      if (w.ex[side] >= EX_WARN && !w.exSaid[side]) { w.exSaid[side] = 1; say(g, `War weariness in ${w.civil && side === 'att' ? 'the rebel camp' : info(w[side]).name}: people want the war in ${info(w.civil ? w.land : w[foe]).name} to end.`); }
      if (w.ex[side] >= EX_HIT && w.exSaid[side] < 2) { w.exSaid[side] = 2; const k = w[side]; if (!isHome(k) && g.c[k] && !rebLand(k)) g.c[k].stab = Math.max(1, g.c[k].stab - 1); say(g, `Protests against the war in ${w.civil && side === 'att' ? 'the rebel camp' : info(w[side]).name}. Soldiers desert.`); }
    }
    // the more tired side gives up first
    const s = ['att', 'def'].filter(x => w.ex[x] >= 100).sort((a, b) => w.ex[b] - w.ex[a] || held[b] - held[a])[0];
    if (!s) return;
    const foe = FOE[s], lostLand = held[foe], who = w.civil ? (s === 'att' ? 'The rebels' : `The government of ${info(w.land).name}`) : info(w[s]).name;
    w.gaveUp = s;
    if (w.civil) {
      const rebelLand = held.att;                                          // in a civil war what counts is how much the rebels hold
      w.outcome = s === 'att' ? (rebelLand < 0.15 ? 'def' : 'truce') : (rebelLand >= 0.3 ? 'att' : 'truce');
      say(g, `${who} ${s === 'att' ? 'can fight no more' : 'is worn out by the war'} and ${w.outcome === 'truce' ? 'agrees to a truce' : 'gives up'}.`);
      return;
    }
    const losing = lostLand >= 0.1 || (w.capFell && w.capFell[s]) || (s === 'att' ? w.front < -15 : w.front > 15);
    w.outcome = losing ? foe : 'truce';
    say(g, losing ? `${who} is exhausted by the war and sues for peace.` : `${who} is exhausted by the war. Neither side can win: both agree to stop.`);
  }
  // the divisions of a war that is over go home; occupied land goes back
  function tidyWar(g) {
    if (!g.units) return;
    const all = fronts(g), live = new Set(all.map(w => w.id));
    g.units = g.units.filter(u => live.has(u.w));
    const foes = new Set();
    for (const w of all) { const S = sidesOf(g, w); for (const a of S.att) for (const b of S.def) { foes.add(a + '|' + b); foes.add(b + '|' + a); } }
    const ownP = {}, own = i => { const p = CELL[i]; return ownP[p] !== undefined ? ownP[p] : (ownP[p] = stateOf(g, holderOf(g, p))); };
    for (const i in (g.cc || {})) { const c = g.cc[i], o = own(+i); if (c === o || !foes.has(c + '|' + o)) delete g.cc[i]; }
    for (const id in g.ctl) { const o = stateOf(g, holderOf(g, +id)), c = g.ctl[id]; if (c === o || !foes.has(c + '|' + o)) delete g.ctl[id]; }
  }
  // is the player in a war? (then the year runs season by season)
  const playerFights = g => { const ks = myKeys(g); return fronts(g).some(w => { const S = sidesOf(g, w); return ks.some(k => S.att.includes(k) || S.def.includes(k)); }); };
  // the player's orders: a point to march to ([lon, lat], or a province id), 'hold' (stay put) or 'auto' (front orders)
  // the way along the player's route: through each waypoint in turn (those already reached are dropped)
  function wayPath(T, side, u) {
    const way = (u.way && u.way.length ? u.way : [u.goal]).map(p => cellNear(T, side, p)).filter(c => c !== null);
    while (way.length && km(cellLL(way[0]), ll(u)) < 60) { way.shift(); if (u.way) u.way.shift(); }
    if (!way.length) return null;
    let at = u.cell; const path = [];
    for (const c of way) { if (c === at) continue; const r = route(T, side, at, c); if (!r) break; path.push(...r); at = c; }
    return path.length ? path : null;
  }
  function orderUnits(g, ids, goal) {
    let n = 0;
    if (typeof goal === 'number') goal = PBY[goal] ? PBY[goal].c : null;
    const way = Array.isArray(goal) && Array.isArray(goal[0]) ? goal : null;   // a drawn route: a list of points
    for (const u of (g.units || []).filter(x => ids.includes(x.id) && isMine(g, x))) {
      const w = fronts(g).find(x => x.id === u.w); if (!w) continue;
      if (goal === 'auto') { u.auto = true; u.goal = null; u.way = null; u.path = []; n++; continue; }
      if (goal === 'hold') { u.auto = false; u.goal = null; u.way = null; u.path = []; n++; continue; }
      if (!goal) continue;
      const T = theatre(g, w), side = sideOfU(T, u);
      const pts = way || [goal], end = cellNear(T, side, pts[pts.length - 1]); if (end === null) continue;
      const old = { goal: u.goal, way: u.way };
      u.goal = cellLL(end); u.way = pts.slice(0, -1).concat([u.goal]);
      const r = wayPath(T, side, u);
      if (!r) { u.goal = old.goal; u.way = old.way; continue; }
      u.auto = false; u.path = r; n++;
    }
    return n;
  }
  const marchShare = () => 0;
  function setStance(g, w, s) { g.stance = g.stance || {}; g.stance[w.id] = s; }
  // the cells of a war, for the map: each with who it belongs to and who holds it
  function warCells(g, w) { const T = theatre(g, w); return { S: T.S, cells: T.cells, own: T.own, side: T.side }; }
  // one season (each click of End Season); the year ends when the winter is over
  function endSeason(g) {
    if (g.over || g.pending.length || g.peace || g.conf) return;
    warSeason(g); if (g.over) return;
    g.season = (g.season || 0) + 1;
    if (g.season >= 4 && !g.conf) endYear(g);
  }
  // a civil war is over. winner: the camp that won ('US' / 'SU'), or null for a truce
  function civilEnd(g, key, winner) {
    const c = g.c[key], w = c.war, d = info(key); if (!w) return;
    for (const p of ['US', 'SU']) if (w.troops[p]) g.bonus[p] += winner === p ? 3 : -5;   // a lost war abroad is a humiliation
    if (c.owner) {                                                        // a region's war of independence
      const ow = c.owner;
      if (winner && winner === w.rebels) {
        c.war = null; freeUnion(g, d.key, SIDE[winner] * 40); say(g, `${d.name} wins its war of independence against ${info(ow).name}!`);
        if (d.key === g.nation) { g.bonus.ME += 8; g.c[d.key].army = Math.max(g.c[d.key].army, 3 + (g.militia || 0)); say(g, 'Your nation is free!'); }
      } else {
        c.war = null; c.stab = 2; say(g, `${info(ow).name} crushes the uprising in ${d.name}.`);
        if (d.key === g.nation) { if (winner) overthrow(g, `${info(ow).name}'s troops crush your uprising. Its leaders are shot or sent away.`); else g.support = Math.max(0, (g.support || 0) - 20); }
      }
      return;
    }
    const R = REBELS[w.ideo] || REBELS[w.rebels === 'SU' ? 'com' : 'nat'];
    c.a = winner ? (winner === w.rebels ? R.a : SIDE[winner] * 70) : Math.round(w.balance * 0.4);
    c.war = null; c.stab = 2;
    if (winner && winner === w.rebels) {                                  // the rebels build the state they fought for
      takePower(g, d.key, w.ideo === 'con' ? 'con' : w.ideo || (winner === 'SU' ? 'com' : 'nat')); boostParty(g, d.key, c.ruling, 20);
      c.gov = R.gov;
    }
    say(g, winner === w.rebels ? `${d.name}: the ${R.name.toLowerCase()} win the civil war. The new state: ${R.gov === 'Revolutionary' ? 'a revolutionary republic' : R.gov === 'Socialist' ? 'a socialist one-party state' : R.gov.toLowerCase()}.` : winner ? `${d.name}: the government defeats the ${R.name.toLowerCase()}.` : `${d.name}: the civil war ends in a truce.`);
    if (d.key === g.nation && winner === w.rebels) overthrow(g, 'The rebels march into your capital. Your government has fallen.');
  }
  function endYear(g) {
    if (g.over || g.pending.length || g.peace || g.conf) return;
    // ---- wars between countries: the seasons the player did not play one by one ----
    while ((g.season || 0) < 4) { warSeason(g); if (g.over) return; g.season = (g.season || 0) + 1; if (g.conf) return; }
    g.season = 0;
    for (const w of g.wars) w.years++;
    runCabinet(g);
    for (const side of ['US', 'SU']) if (side !== g.side) computerTurn(g, side);
    // ---- civil wars ----
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key], w = c.war; if (!w) continue;
      w.years++;
      if (w.div) continue;                                                  // fought with divisions, season by season
      const rebelsPush = SIDE[w.rebels] * ((4 - c.stab) * 2 + (d.key === g.nation && c.owner ? (g.militia || 0) * 0.8 + (g.support || 0) / 10 : 0));   // shaky governments lose ground; in the player's own rising the militia and popular support fight too
      const troops = (w.troops.US ? 25 : 0) - (w.troops.SU ? 25 : 0);
      const govArmy = c.owner ? (isHome(stateOf(g, c.owner)) ? 12 : g.c[stateOf(g, c.owner)].army * 0.4) : c.army;   // a region is held by its owner's army
      const army = SIDE[w.rebels] * -govArmy * 0.6;                           // the government's own army fights the rebels
      // against the player's own rising the centre throws in its whole army, as hard as its grip allows
      const ownerKey = c.owner ? stateOf(g, c.owner) : null;
      const crackdown = d.key === g.nation && ownerKey ? -SIDE[w.rebels] * g.c[ownerKey].army * 0.8 * (isHome(ownerKey) ? g.pw[ownerKey === 'USA' ? 'US' : 'SU'].home / 70 : g.c[ownerKey].stab / 3) : 0;
      w.balance = clamp(w.balance + (w.help.US - w.help.SU) + troops + rebelsPush + army * 0.3 + crackdown + rand(-12, 12), -100, 100);
      w.help = { US: 0, SU: 0 };
      const won = w.sep ? 70 : 100;                                         // a region needs less to break free than rebels need to take a capital
      if (Math.abs(w.balance) >= won || w.years >= 10) civilEnd(g, d.key, w.balance >= won ? 'US' : w.balance <= -won ? 'SU' : null);
    }
    if (g.over) return;
    makeOffer(g);
    // ---- rivals in opposite camps sometimes fight (unless the target has strong allies) ----
    if (g.wars.length < 3) for (const [x, y] of RIVALS) {
      const cx = g.c[x], cy = g.c[y];
      if (!cx || !cy || !cx.independent || !cy.independent || cx.war || cy.war || warOf(g, x) || warOf(g, y)) continue;
      if (g.nation === x || g.nation === y) continue;                     // nobody declares war for you
      const [a, b] = Math.random() < 0.5 ? [x, y] : [y, x];
      if (Math.abs(cx.a - cy.a) > 60 && allyHelp(g, b, a) < 20 && Math.random() < 0.025) { startWar(g, a, b, 0); break; }
    }
    powerYear(g);
    if (g.over) return;
    unionYear(g);
    partyYear(g);
    treeYear(g);
    govYear(g);
    ownedYear(g);
    puppetYear(g);
    unifyYear(g);
    // ---- lost land: the loser may try to win it back ----
    if (g.wars.length < 4) for (const k of g.cuts) {
      const L = g.c[k.land], T = g.c[k.taker];
      if (!L || !T || L.owner || T.owner || !L.independent || isHome(k.taker) || k.land === g.nation || k.taker === g.nation) continue;
      if (g.year - k.year < 5 || warOf(g, k.land) || warOf(g, k.taker) || L.war) continue;
      if (Math.random() < 0.03 && L.army >= T.army * 0.8) { say(g, `${info(k.land).name} wants its lost land back.`); startWar(g, k.land, k.taker, 0); break; }
    }
    // ---- countries drift, rebuild armies, and sometimes explode ----
    let wars = D.COUNTRIES.filter(d => g.c[d.key].war).length;
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key]; c.moves = 0;
      if (!warOf(g, d.key) && c.army < baseArmy(d.key, g)) c.army = Math.min(baseArmy(d.key, g), c.army + 1 + baseArmy(d.key, g) * 0.08);
      if (isHome(d.key) || !c.independent || c.war || c.owner) continue;
      if (Math.abs(c.a) < BLOC && d.key !== g.nation) c.a = clamp(c.a + rand(-2, 2), -100, 100);
      if (d.key !== g.nation && Math.abs(c.a) > OWN_WAY && ownWay(g, d.key)) c.a -= Math.sign(c.a) * (Math.abs(c.a) - OWN_WAY) * 0.25;   // back out of the bloc
      if (c.stab < 3 && Math.random() < 0.06) c.stab++;
      if (c.stab <= 2 && wars < 5 && Math.abs(c.a) < 75 && Math.random() < 0.012 * (4 - c.stab)) { civilWar(g, d.key, c.a >= 0 ? 'SU' : 'US', 0); wars++; }
    }
    addTension(g, g.pw.US.arms >= 6 && g.pw.SU.arms >= 6 ? -3 : -5);        // two big arsenals keep the world nervous
    if (g.over) return;
    // ---- a new year ----
    g.year++; g.detenteUsed = false; g.homeMoves = {}; g.pushed = 0;
    for (const side of ['US', 'SU']) g.ip[side] = Math.min(40, Math.max(0, g.ip[side] + income(g, side) - UPKEEP * deployed(g, side)));
    if (g.nation) g.ip.ME = Math.min(30, g.ip.ME + nationIncome(g));
    for (const d of D.COUNTRIES) if (d.indep === g.year) {
      const c = g.c[d.key]; c.independent = true;
      if (c.owner) { say(g, `${d.colony || 'The colonial power'} leaves. ${d.name} passes to ${info(c.owner).name}.`); continue; }
      c.a -= 10; setupParties(g, d.key);
      say(g, `${d.name} becomes independent from ${d.colony || 'its colonial rulers'}.`);
      if (d.warAt) civilWar(g, d.key, d.warAt, 0);
    }
    // the Cold War is judged at the end of 1991, but the world goes on
    if (g.year === END + 1 && !g.verdict) g.verdict = judge(g);
    runEvents(g);
  }
  function endWar(g, w, done) {
    g.wars = g.wars.filter(x => x !== w);
    const A = info(w.att).name, Dn = info(w.def).name;
    for (const p of ['US', 'SU']) if (w.troops[p]) g.bonus[p] += done === 'truce' ? -1 : w.troops[p] === done ? 3 : -5;
    // a border war: winning it only moves the line (or nothing at all)
    if (w.limited && done === 'att') { if (w.noCut) { say(g, `${A} makes its point and pulls back from ${Dn}.`); return; } done = 'truce'; }
    if (done === 'truce') {
      const ahead = w.front >= 0 ? w.att : w.def, behind = w.front >= 0 ? w.def : w.att;
      if (Math.abs(w.front) >= 15 && !isHome(behind) && !w.noCut) {
        // the ceasefire line runs through every land of the loser that touches the winner (not a superpower's heartland)
        syncBorders(g);
        const winLands = landsOf(g, ahead), lands = landsOf(g, behind).filter(k => !isHome(k) && winLands.some(j => neighbours(k, j)));
        // the ceasefire line runs where the armies stand
        const S = sidesOf(g, w), side = ahead === w.att ? 'att' : 'def';
        const held = k => { const ids = provsHeldBy(g, k); return ids.length ? ids.filter(i => g.ctl && S[side].includes(g.ctl[i])).length / ids.length : 0; };
        const got = (lands.length ? lands : [behind]).filter(k => held(k) >= 0.05).flatMap(k => cutLand(g, k, ahead, clamp(held(k), 0.05, 0.6)));
        say(g, got.length ? `${A} and ${Dn} sign a truce. The ceasefire line becomes the new border: ${info(ahead).name} keeps ${provList(got)}.` : `${A} and ${Dn} sign a truce. The old border stays.`);
      } else say(g, `${A} and ${Dn} sign a truce. Nobody wins.`);
      return;
    }
    returnLand(g, w[done], w[done === 'att' ? 'def' : 'att']);
    const win = w[done], lose = w[done === 'att' ? 'def' : 'att'];
    if (isHome(lose)) {                                                   // a superpower is never occupied: it pulls back in defeat
      const p = lose === 'USA' ? 'US' : 'SU'; g.bonus[p] -= 6;
      say(g, `The ${NAME[p]} withdraws from ${info(win).name} in defeat.`); return;
    }
    if (done === 'def') { g.c[lose].stab = Math.max(1, g.c[lose].stab - 1); say(g, w.gaveUp === 'att' ? `${A} gives up its war against ${Dn}.` : `${Dn} throws back the invasion from ${A} and carries the war into ${A}.`); }
    startConference(g, w, done);                                          // the winners dictate the peace
  }
  // the loser pays: its treasury (or its army, if it has none to speak of) goes to the winner
  function reparations(g, win, lose) {
    const payer = lose === g.nation ? 'ME' : lose === 'USA' ? 'US' : lose === 'SUN' ? 'SU' : null;
    if (payer) g.ip[payer] = Math.max(0, g.ip[payer] - 6); else g.c[lose].army *= 0.7;
    const getter = win === g.nation ? 'ME' : win === 'USA' ? 'US' : win === 'SUN' ? 'SU' : null;
    if (getter) g.ip[getter] += 6; else if (!isHome(win)) { g.c[win].army += 2; g.c[win].stab = Math.min(5, g.c[win].stab + 1); }
  }
  function capitalName(key) { const c = D.CAPITALS.find(x => x.key === key); return c ? c.name : 'the capital'; }
  // how the game stands: a nation by how much it grew, a superpower by the blocs
  function judge(g) {
    if (g.nation) { const gain = nationScore(g) - g.start; return { winner: null, why: 'time', grade: captive(g) ? 'Captive Nation' : grade(gain + (g.fromUnion ? 10 : 0)), gain, year: g.year }; }
    const us = score(g, 'US'), su = score(g, 'SU');
    return { winner: Math.abs(us - su) < 3 ? null : us > su ? 'US' : 'SU', why: 'time', us, su, year: g.year };
  }
  // the player ends the game (any time after 1991)
  function finish(g) { if (!g.over) g.over = judge(g); }

  G.GAME = { ARM_COST, TROOPS_COST, UPKEEP, CAPITAL_AT, START, END, BLOC, NAME, HOME, SIDE, ACTIONS, HOME_ACTIONS, DETENTE_COST,
    answerOffer, offerView, PROGRAMS, SPACE, programCheck, programAct, REBELS, FOCUS, setCabinet, UNION_ACTIONS, unionCheck, unionAct, captive: g => captive(g),
    newGame, check, act, homeCheck, homeAct, warOf, warCheck, warHelp, makePeace, deployed, detente, endYear, choose,
    score, income, nationScore, nationIncome, friendsOf, puppetsOf, pactsOf, allied, blocOf, leaning, isHome, info, neighbours,
    borders, landsOf, capitalName, computerTurn, baseArmy, valueOf, PARTIES, PARTY, partyCheck, partyAct,
    PUSH_CAP, isUnionPart, regionsOf, free, judge, finish, sovietWeak, POLICIES, TERR_ACTIONS, territories, territoryCheck, territoryAct, lostLand, takenLand, PROV, PBY, holderOf, treeOf, decisionCheck, decide, TREES, ownWay, OWN_WAY, SEASONS, DIV, ctrlOf, sidesOf, theatre, unitsOf, route, capPid, orderUnits, setStance, endSeason, playerFights, warSeason, startWar, marchShare, warCells, cellAt, cellLL, CELL, GRID: GR, CELLS_OF, capCellOf, fronts, nameOf, myKeys, isMine, rebLand, civilWar, provVal, provList, landBlock, cutLand, fixCuts, syncBorders, PEACE_TERMS, termsFor, peaceChance, proposePeace, confView, confDemand, confPass, confAuto, startConference, formCheck, form, ownedBy, stateOf, applyNames, playerKey, warScore };
})(typeof window !== 'undefined' ? window : globalThis);
