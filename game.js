// Iron Curtain Lite - the rules of the game. No drawing here, so it also runs in Node for testing.
//
// Who plays: the player is either a superpower ('US' or 'SU') or any other nation ('ME').
// A superpower wins by having more countries in its bloc than the rival in 1991.
// A nation tries to survive and grow: a bigger army, more friends, defeated enemies.
(function (G) {
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

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const info = key => D.BY_KEY[key];
  const isHome = key => info(key).region === 'HOME';
  const neighbours = (a, b) => (NB[a] || []).includes(b);
  // do a's lands (itself and what it annexed) border b?
  // do the lands of state a (itself, its regions, what it annexed) border the lands of state b?
  const landsOf = (g, key) => [key, ...ownedBy(g, key)];
  const borders = (g, a, b) => { const B = landsOf(g, stateOf(g, b)); return landsOf(g, stateOf(g, a)).some(k => B.some(j => neighbours(k, j))); };
  const baseArmy = (key, g) => isHome(key) ? (key === 'USA' ? 30 : 40) : valueOf(g, key) * 3 + info(key).stab;
  // a country's worth: its starting value, plus what the player has developed, plus its lands
  // (its own regions - Scotland for Britain, Ukraine for the USSR - count a little; conquered countries in full)
  function valueOf(g, key) {
    if (!g || !g.c[key]) return info(key).val;
    const share = (k, o) => isUnionPart(g, k) ? 0.3 : o && o.policy === 'autonomy' ? 0.5 : 1;
    let v = info(key).val + (g.c[key].dev || 0) + ownedBy(g, key).reduce((t, k) => t + info(k).val * share(k, g.c[k].occ), 0);
    for (const k of g.cuts || []) { if (k.taker === key) v += info(k.land).val * k.depth * share(k.occ); if (k.land === key) v -= info(k.land).val * k.depth; }
    return Math.max(1, Math.round(v));
  }
  const ownedBy = (g, key) => D.COUNTRIES.filter(d => g.c[d.key] && g.c[d.key].owner === key).map(d => d.key);
  const stateOf = (g, key) => (g.c[key] && g.c[key].owner) || key;
  // a region of a union (a Soviet republic, Scotland, Quebec...) still inside the country it belongs to
  const isUnionPart = (g, key) => !!(g.c[key] && g.c[key].owner && info(key).union === g.c[key].owner);
  const regionsOf = (g, key) => D.COUNTRIES.filter(d => d.union === key && g.c[d.key].owner === key).map(d => d.key);
  const free = (g, key) => !!(g.c[key] && g.c[key].independent && !g.c[key].owner);

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
      ip: { US: 14, SU: 13, ME: 6 }, bonus: { US: 0, SU: 0, ME: 0 }, detenteUsed: false, homeMoves: {}, start: 0, names: {}, peace: null, formed: [], cuts: [],
      reform: false, verdict: null };
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
    let n = side === 'SU' ? 19 : 10;                   // the Soviet planned economy starts with fewer friends but more to spend
    for (const d of D.COUNTRIES) if (blocOf(g, d.key) === side) n += d.val * 0.25;
    return Math.round(n);
  }
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
    return Math.round(3 + valueOf(g, g.nation) * 1.5 + (pactsOf(g, g.nation).length ? 2 : 0) + puppetsOf(g).length - (g.c[g.nation].war ? 2 : 0) + occ);
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
        if (opp && Math.random() < 0.08) civilWar(g, d.key, opp === 'com' || opp === 'soc' ? 'SU' : 'US', 0);
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

  // ================= helpers used by events =================
  function shift(g, key, amount) { const c = g.c[key]; if (c && !isHome(key)) c.a = clamp(c.a + amount, -100, 100); }
  function addTension(g, n) {
    g.tension = clamp(g.tension + n, 0, 100);
    if (g.tension >= 100 && !g.over) { g.over = { winner: null, why: 'nuclear' }; say(g, 'NUCLEAR WAR. Nobody wins.'); }
  }
  function civilWar(g, key, rebels, balance) {
    const c = g.c[key]; if (!c || !c.independent || c.war || isHome(key) || c.owner) return;
    c.war = { rebels, balance: balance || 0, years: 0, help: { US: 0, SU: 0 }, troops: {} };
    say(g, `Civil war in ${info(key).name}: ${rebels === 'SU' ? 'communist' : 'anti-communist'} rebels take up arms.`);
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
  const sovietWeak = g => (g.reform && score(g, 'SU') <= score(g, 'US') + 10) || score(g, 'SU') < score(g, 'US') - 12;
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
    if (actName === 'propaganda') { shift(g, key, dir * 5 * STAB[c.stab]); return `Propaganda in ${name}.`; }
    if (actName === 'aid') { shift(g, key, dir * 12 * STAB[c.stab]); if (Math.random() < 0.25) c.stab = Math.min(4, c.stab + 1); return `Aid flows to ${name}.`; }
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
  function cutLand(g, land, taker, depth) {
    if (isHome(land) || land === taker) return;
    depth = clamp(depth, 0.12, 0.6);
    const old = g.cuts.find(k => k.land === land && k.taker === taker);
    if (old) old.depth = Math.max(old.depth, depth);
    else g.cuts.push({ land, taker, depth, year: g.year, occ: newOcc() });
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
  function ownedYear(g) {
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key]; if (!c.owner) continue;
      c.a = ownerAlign(g, stateOf(g, c.owner));
      if (c.war) continue;
      if (c.stab < 4 && Math.random() < 0.12) c.stab++;
      // restless regions may rise: rarely in a democracy, never the core of a country, never what the player manages itself
      const mine = c.owner === g.nation && !isUnionPart(g, d.key);
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
  const newOcc = (unrest) => ({ unrest: unrest || 25, integ: 0, policy: 'garrison', core: false, acted: 0 });
  // the player's territories: { id, kind, land, name, occ, worth, since }
  function territories(g, owner) {
    owner = owner || g.nation; if (!owner) return [];
    const out = [];
    for (const d of D.COUNTRIES) { const c = g.c[d.key]; if (c.owner === owner && !isUnionPart(g, d.key)) { c.occ = c.occ || newOcc(); out.push({ id: d.key, kind: 'annex', land: d.key, name: d.name, occ: c.occ, worth: d.val, since: c.since }); } }
    for (const k of g.cuts) if (k.taker === owner) { k.occ = k.occ || newOcc(); out.push({ id: 'cut:' + k.land, kind: 'cut', land: k.land, name: `Occupied ${info(k.land).name}`, occ: k.occ, worth: info(k.land).val * k.depth, since: k.year }); }
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
  function termsFor(g, me, enemy) {
    const out = [];
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
    const cost = picks.reduce((t, id) => t + PEACE_TERMS[id].cost, 0);
    const tired = w.years * 6;
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
      if (id !== 'white') done.push(PEACE_TERMS[id].name.toLowerCase());
    }
    if (win === g.nation) g.bonus.ME += 2;
    say(g, `Peace between ${info(win).name} and ${info(lose).name}${done.length ? ': ' + done.join(', ') : ' on the old borders'}.`);
  }
  // a won war: the player picks terms worth up to 100 points
  function conference(g, picks) {
    const P = g.peace; if (!P) return;
    const cost = picks.reduce((t, id) => t + PEACE_TERMS[id].cost, 0);
    if (cost > 100) return 'Too many demands';
    g.peace = null;
    applyTerms(g, P.win, P.lose, picks.length ? picks : ['white'], 0.5);
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
  function detente(g, side) {
    if (g.over || g.detenteUsed || g.ip[side] < DETENTE_COST) return false;
    g.ip[side] -= DETENTE_COST; g.detenteUsed = true; addTension(g, -15);
    say(g, `${NAME[side]} calls a summit. Tension eases.`);
    return true;
  }

  // ================= the computer superpowers =================
  function computerTurn(g, side) {
    const s = SIDE[side];
    if (g.tension >= 70) detente(g, side);
    for (let tries = 0; tries < 40 && g.ip[side] >= 1; tries++) {
      const options = [];
      for (const d of D.COUNTRIES) {
        const c = g.c[d.key], mine = c.a * s;
        const consider = (a, value) => { if (value > 0 && check(g, side, a, d.key).ok) options.push({ a, key: d.key, value: value / ACTIONS[a].cost + Math.random() * 0.5 }); };
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

  // ================= events =================
  function runEvents(g) {
    allianceYear(g);
    for (const e of D.EVENTS) {
      if (e.y !== g.year || (e.when && !e.when(g, H))) continue;
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
    e.options[i].fx(g, H); say(g, `You chose: ${e.options[i].label}.`);
  }

  // ================= the end of a year =================
  const armyPower = (g, key) => g.c[key].army * (isHome(key) ? 1 : 0.8 + g.c[key].stab * 0.08);
  function endYear(g) {
    if (g.over || g.pending.length || g.peace) return;
    for (const side of ['US', 'SU']) if (side !== g.side) computerTurn(g, side);
    // ---- civil wars ----
    for (const d of D.COUNTRIES) {
      const c = g.c[d.key], w = c.war; if (!w) continue;
      w.years++;
      const rebelsPush = SIDE[w.rebels] * (4 - c.stab) * 2;                // shaky governments lose ground
      const troops = (w.troops.US ? 25 : 0) - (w.troops.SU ? 25 : 0);
      const govArmy = c.owner ? (isHome(stateOf(g, c.owner)) ? 12 : g.c[stateOf(g, c.owner)].army * 0.4) : c.army;   // a region is held by its owner's army
      const army = SIDE[w.rebels] * -govArmy * 0.6;                           // the government's own army fights the rebels
      w.balance = clamp(w.balance + (w.help.US - w.help.SU) + troops + rebelsPush + army * 0.3 + rand(-12, 12), -100, 100);
      w.help = { US: 0, SU: 0 };
      const won = w.sep ? 70 : 100;                                         // a region needs less to break free than rebels need to take a capital
      if (Math.abs(w.balance) >= won || w.years >= 10) {
        const winner = w.balance >= won ? 'US' : w.balance <= -won ? 'SU' : null;
        for (const p of ['US', 'SU']) if (w.troops[p]) g.bonus[p] += winner === p ? 3 : -5;   // a lost war abroad is a humiliation
        if (c.owner) {                                                        // a region's war of independence
          const ow = c.owner;
          if (winner && winner === w.rebels) { c.war = null; freeUnion(g, d.key, SIDE[winner] * 40); say(g, `${d.name} wins its war of independence against ${info(ow).name}!`); }
          else { c.war = null; c.stab = 2; say(g, `${info(ow).name} crushes the uprising in ${d.name}.`); }
          continue;
        }
        c.a = winner ? SIDE[winner] * 70 : Math.round(w.balance * 0.4);
        c.war = null; c.stab = 2;
        if (winner && winner === w.rebels) { takePower(g, d.key, winner === 'SU' ? 'com' : 'nat'); boostParty(g, d.key, c.ruling, 20); }
        say(g, winner ? `${d.name}: the ${winner === 'US' ? 'pro-Western' : 'pro-Soviet'} side wins the civil war.` : `${d.name}: the civil war ends in a truce.`);
        if (d.key === g.nation && winner === w.rebels) overthrow(g, 'The rebels march into your capital. Your government has fallen.');
      }
    }
    if (g.over) return;
    // ---- wars between countries ----
    for (const w of g.wars.slice()) {
      w.years++;
      const pa = armyPower(g, w.att) * (w.capFell.att ? 0.7 : 1) + w.help.att;
      const pd = armyPower(g, w.def) * 1.15 * (w.capFell.def ? 0.7 : 1) + w.help.def + allyHelp(g, w.def, w.att);
      let d = (pa - pd) * 0.9 + rand(-16, 16);
      for (const p of ['US', 'SU']) if (w.troops[p]) d += w.troops[p] === 'att' ? 25 : -25;
      w.prev = w.front;                                                       // where the front stood a year ago (the map draws the advance)
      w.front = clamp(w.front + d * 2.2 + (w.lastD || 0) * 0.8, -100, 100);   // momentum: a winning side keeps winning
      w.lastD = d;
      // the fighting costs both armies
      g.c[w.att].army = Math.max(0, g.c[w.att].army - pd * 0.06);
      g.c[w.def].army = Math.max(0, g.c[w.def].army - pa * 0.06);
      w.help = { att: 0, def: 0 }; w.armed = {};
      // capitals
      for (const [side, other, reach] of [['def', 'att', w.front], ['att', 'def', -w.front]]) {
        const key = w[side];
        if (isHome(key)) continue;
        if (!w.capFell[side] && reach >= CAPITAL_AT) {
          w.capFell[side] = true; g.c[key].army *= 0.75; w.front += side === 'def' ? 10 : -10;
          say(g, `${capitalName(key)} falls! ${info(w[other]).name} takes the capital of ${info(key).name}.`);
        } else if (w.capFell[side] && reach < CAPITAL_AT - 15) {
          w.capFell[side] = false; say(g, `${info(key).name} retakes ${capitalName(key)}.`);
        }
      }
      w.front = clamp(w.front, -100, 100);
      const done = w.front >= 100 || g.c[w.def].army < 0.5 ? 'att' : w.front <= -100 || g.c[w.att].army < 0.5 ? 'def' : w.years >= (w.limited ? 3 : 8) ? 'truce' : null;
      if (!done) continue;
      endWar(g, w, done);
      if (g.over) return;
    }
    // ---- rivals in opposite camps sometimes fight (unless the target has strong allies) ----
    if (g.wars.length < 3) for (const [x, y] of RIVALS) {
      const cx = g.c[x], cy = g.c[y];
      if (!cx || !cy || !cx.independent || !cy.independent || cx.war || cy.war || warOf(g, x) || warOf(g, y)) continue;
      if (g.nation === x || g.nation === y) continue;                     // nobody declares war for you
      const [a, b] = Math.random() < 0.5 ? [x, y] : [y, x];
      if (Math.abs(cx.a - cy.a) > 60 && allyHelp(g, b, a) < 20 && Math.random() < 0.025) { startWar(g, a, b, 0); break; }
    }
    partyYear(g);
    govYear(g);
    ownedYear(g);
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
      if (c.stab < 3 && Math.random() < 0.06) c.stab++;
      if (c.stab <= 2 && wars < 5 && Math.abs(c.a) < 75 && Math.random() < 0.012 * (4 - c.stab)) { civilWar(g, d.key, c.a >= 0 ? 'SU' : 'US', 0); wars++; }
    }
    addTension(g, -5);
    if (g.over) return;
    // ---- a new year ----
    g.year++; g.detenteUsed = false; g.homeMoves = {};
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
        const A = landsOf(g, ahead), lands = landsOf(g, behind).filter(k => !isHome(k) && A.some(j => neighbours(k, j)));
        for (const k of lands.length ? lands : [behind]) cutLand(g, k, ahead, Math.abs(w.front) / 100 * 0.8);
        say(g, `${A} and ${Dn} sign a truce. The ceasefire line becomes the new border: ${info(ahead).name} keeps the land it holds.`);
      } else say(g, `${A} and ${Dn} sign a truce. Nobody wins.`);
      return;
    }
    returnLand(g, w[done], w[done === 'att' ? 'def' : 'att']);
    const win = w[done], lose = w[done === 'att' ? 'def' : 'att'];
    if (done === 'def') {                                                 // the invasion fails: the attacker is weakened, nothing more
      if (isHome(lose)) g.bonus[lose === 'USA' ? 'US' : 'SU'] -= 6; else g.c[lose].stab = Math.max(1, g.c[lose].stab - 1);
      if (win === g.nation) g.bonus.ME += 3;
      say(g, `${Dn} drives back the invasion from ${A}.`); return;
    }
    if (isHome(lose)) {                                                   // a superpower is never occupied: it pulls back in defeat
      const p = lose === 'USA' ? 'US' : 'SU'; g.bonus[p] -= 6;
      say(g, `The ${NAME[p]} withdraws from ${info(win).name} in defeat.`); return;
    }
    const L = g.c[lose];
    if (win === playerKey(g) && !g.over) { g.peace = { win, lose }; say(g, `${info(lose).name} is defeated. Dictate the peace.`); return; }
    // a war of conquest: the loser disappears into the winner
    if (w.annexOnWin && done === 'att' && !isHome(lose)) {
      annex(g, win, lose); applyNames(g);
      say(g, `${info(win).name} conquers ${ORIGINAL_NAMES[lose]}. The country disappears from the map.`);
      if (lose === g.nation) overthrow(g, `${info(win).name} conquers your country. It is now a province of the victor.`);
      return;
    }
    // the winner installs a friendly government
    L.a = clamp(isHome(win) ? (win === 'USA' ? 75 : -75) : g.c[win].a, -100, 100);
    L.stab = Math.max(1, L.stab - 1);
    takePower(g, lose, g.c[win].ruling === 'com' ? 'com' : 'nat');
    if (win === g.nation) { L.puppetOf = g.nation; g.bonus.ME += 3; }
    if (L.puppetOf && L.puppetOf !== win) L.puppetOf = null;
    if (isHome(win)) g.bonus[win === 'USA' ? 'US' : 'SU'] += 2;
    say(g, `${info(win).name} defeats ${info(lose).name} and installs a friendly government.`);
    if (lose === g.nation) overthrow(g, `${info(win).name}'s army takes your country. Your government is replaced.`);
  }
  function capitalName(key) { const c = D.CAPITALS.find(x => x.key === key); return c ? c.name : 'the capital'; }
  // how the game stands: a nation by how much it grew, a superpower by the blocs
  function judge(g) {
    if (g.nation) { const gain = nationScore(g) - g.start; return { winner: null, why: 'time', grade: grade(gain), gain, year: g.year }; }
    const us = score(g, 'US'), su = score(g, 'SU');
    return { winner: Math.abs(us - su) < 3 ? null : us > su ? 'US' : 'SU', why: 'time', us, su, year: g.year };
  }
  // the player ends the game (any time after 1991)
  function finish(g) { if (!g.over) g.over = judge(g); }

  G.GAME = { ARM_COST, TROOPS_COST, UPKEEP, CAPITAL_AT, START, END, BLOC, NAME, HOME, SIDE, ACTIONS, HOME_ACTIONS, DETENTE_COST,
    newGame, check, act, homeCheck, homeAct, warOf, warCheck, warHelp, makePeace, deployed, detente, endYear, choose,
    score, income, nationScore, nationIncome, friendsOf, puppetsOf, pactsOf, allied, blocOf, leaning, isHome, info, neighbours,
    borders, landsOf, capitalName, computerTurn, baseArmy, valueOf, PARTIES, PARTY, partyCheck, partyAct,
    isUnionPart, regionsOf, free, judge, finish, sovietWeak, POLICIES, TERR_ACTIONS, territories, territoryCheck, territoryAct, lostLand, takenLand, PEACE_TERMS, termsFor, peaceChance, proposePeace, conference, formCheck, form, ownedBy, stateOf, applyNames, playerKey, warScore };
})(typeof window !== 'undefined' ? window : globalThis);
