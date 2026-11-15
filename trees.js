// Iron Curtain - decision trees. Like national focuses, but decisions: each costs Influence Points (IP)
// and needs the decisions above it. Every nation has the shared tree (economy, army, politics, foreign
// policy); the superpowers and some big countries have trees of their own. The computer countries walk
// their trees too.
//
// A decision: id, name, cost (IP), col/row (place in the tree), req (all needed), any (one of them is
// enough), excl (taking one closes the others), year (not before), lean (+1 West, -1 East: the computer
// prefers decisions that fit its politics), help (what it does), fx(g, T, k) (the effect; T are helpers
// from game.js, k the country).
(function (G) {
  const near = (g, k, region) => { const d = G.DATA.BY_KEY[k]; return d && (!region || d.region === region); };
  const each = (g, T, test, fn) => { for (const d of G.DATA.COUNTRIES) { const c = g.c[d.key]; if (c && c.independent && !c.owner && !T.isHome(d.key) && test(d, c)) fn(d.key, c, d); } };

  const NATION = [
    // ---- economy ----
    { id: 'plan', name: 'Five-Year Plan', cost: 4, col: 0, row: 0, excl: ['market'], lean: -1, help: 'The state builds the economy: development +1, Communists +5.', fx: (g, T, k) => { T.dev(g, k); T.party(g, k, 'com', 5); } },
    { id: 'market', name: 'Open Markets', cost: 4, col: 1, row: 0, excl: ['plan'], lean: 1, help: 'Foreign trade and private enterprise: development +1, Liberals +5.', fx: (g, T, k) => { T.dev(g, k); T.party(g, k, 'lib', 5); } },
    { id: 'industry', name: 'Heavy Industry', cost: 6, col: 0.5, row: 1, any: ['plan', 'market'], help: 'Steel mills, railways, tractor works: development +1, income +1 a year, a bigger standing army (+2).', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 1); T.mod(g, k, 'army', 2); } },
    // ---- army ----
    { id: 'conscription', name: 'Conscription', cost: 3, col: 2, row: 0, help: 'Every young man serves: army +4 now, a bigger standing army (+2).', fx: (g, T, k) => { T.army(g, k, 4); T.mod(g, k, 'army', 2); } },
    { id: 'modern', name: 'Modern Army', cost: 6, col: 2, row: 1, req: ['conscription'], help: 'Officer schools, tanks, jets, radios: divisions fight 15% better, army +3.', fx: (g, T, k) => { T.mod(g, k, 'quality', 0.15); T.army(g, k, 3); } },
    // ---- politics ----
    { id: 'state', name: 'Strengthen the State', cost: 3, col: 3.5, row: 0, help: 'Police, courts, tax offices: stability +1.', fx: (g, T, k) => T.stab(g, k, 1) },
    { id: 'police', name: 'Secret Police', cost: 4, col: 3, row: 1, req: ['state'], excl: ['reform'], help: 'Rebels find it hard to organise (rebel armies a third weaker); stability +1.', fx: (g, T, k) => { T.stab(g, k, 1); T.mod(g, k, 'police', 1); } },
    { id: 'reform', name: 'Reforms', cost: 4, col: 4, row: 1, req: ['state'], excl: ['police'], help: 'Free press, fair courts: Liberals +10, Socialists +5.', fx: (g, T, k) => { T.party(g, k, 'lib', 10); T.party(g, k, 'soc', 5); } },
    // ---- foreign policy ----
    { id: 'west', name: 'Seek Western Aid', cost: 3, col: 5, row: 0, excl: ['east', 'nonal'], lean: 1, ai: (g, k) => g.c[k].a >= 30, help: 'Dollars and advisers: 8 toward the Americans.', fx: (g, T, k) => T.lean(g, k, 8) },
    { id: 'east', name: 'Seek Soviet Aid', cost: 3, col: 6, row: 0, excl: ['west', 'nonal'], lean: -1, ai: (g, k) => g.c[k].a <= -30, help: 'Roubles and advisers: 8 toward the Soviets.', fx: (g, T, k) => T.lean(g, k, -8) },
    { id: 'nonal', name: 'Non-Aligned', cost: 3, col: 7, row: 0, excl: ['west', 'east'], ai: (g, k) => Math.abs(g.c[k].a) < 30, help: 'Neither camp: halfway back to the middle, and from now on you go your own way (no bloc without an alliance) - unless revolutionaries take over.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.5); T.mod(g, k, 'ownWay', 1); } },
    { id: 'westpact', name: 'Western Alliance', cost: 5, col: 5, row: 1, req: ['west'], when: (g, T, k) => g.c[k].a >= 45, whenWhy: 'Only when you lean clearly West (45+)', help: 'Join a Western alliance near you (NATO, SEATO, CENTO, the Rio Pact...) if one takes you; otherwise 6 more toward the West.', fx: (g, T, k) => { if (!T.joinNear(g, k, 'US')) T.lean(g, k, 6); } },
    { id: 'eastpact', name: 'Socialist Brotherhood', cost: 5, col: 6, row: 1, req: ['east'], when: (g, T, k) => g.c[k].a <= -45, whenWhy: 'Only when you lean clearly East (45+)', help: 'Join the Warsaw Pact if it takes you; otherwise Soviet advisers: army +3 and 6 more toward the East.', fx: (g, T, k) => { if (!T.joinNear(g, k, 'SU')) { T.army(g, k, 3); T.lean(g, k, -6); } } },
    { id: 'thirdworld', name: 'Voice of the Third World', cost: 5, col: 7, row: 1, req: ['nonal'], help: 'Outside pressure moves you a third less, and the world listens.', fx: (g, T, k) => { T.mod(g, k, 'resist', 0.33); T.glory(g, k, 2); } },
  ];

  // ---- the superpowers ----
  const US = [
    { id: 'truman', name: 'Truman Doctrine', cost: 6, col: 0, row: 0, help: 'Help free peoples resist: every country leaning West (20-59) moves 4 closer.', fx: (g, T) => each(g, T, (d, c) => c.a >= 20 && c.a < 60, k => T.lean(g, k, 4)) },
    { id: 'marshall', name: 'Marshall Plan', cost: 10, col: 0, row: 1, req: ['truman'], help: 'Rebuild Europe: European countries outside the Soviet bloc +6 toward the West and stability +1.', fx: (g, T) => each(g, T, (d, c) => d.region === 'EU' && c.a > -60, k => { T.lean(g, k, 6); T.stab(g, k, 1); }) },
    { id: 'nasa', name: 'NASA', cost: 8, col: 2, row: 0, year: 1955, help: 'A space agency: the space programme jumps ahead (+8).', fx: (g) => { g.pw.US.spaceProg += 8; } },
    { id: 'detente', name: 'Détente', cost: 6, col: 1, row: 1, req: ['truman'], year: 1969, help: 'Talks with Moscow: tension −20.', fx: (g, T) => T.tension(g, -20) },
    { id: 'sdi', name: 'Strategic Defense Initiative', cost: 14, col: 2, row: 1, req: ['nasa'], year: 1980, help: '"Star Wars": nuclear arsenal +1, and the Soviets wear themselves out keeping up (their morale −8).', fx: (g) => { g.pw.US.arms += 1; g.pw.SU.home = Math.max(0, g.pw.SU.home - 8); } },
  ];
  const SU = [
    { id: 'cominform', name: 'Cominform', cost: 6, col: 0, row: 0, help: 'The communist parties of the world under one roof: Communists +5 wherever they exist, and every country leaning East (20-59) moves 4 closer.', fx: (g, T) => { each(g, T, (d, c) => !!c.parties, k => T.party(g, k, 'com', 5)); each(g, T, (d, c) => c.a <= -20 && c.a > -60, k => T.lean(g, k, -4)); } },
    { id: 'warsawplus', name: 'Bloc Discipline', cost: 8, col: 0, row: 1, req: ['cominform'], help: 'Every member of an Eastern alliance: army +3, stability +1.', fx: (g, T) => each(g, T, (d) => T.inSide(g, d.key, 'SU'), k => { T.army(g, k, 3); T.stab(g, k, 1); }) },
    { id: 'sputnik', name: 'Rocket Programme', cost: 10, col: 2, row: 0, year: 1955, help: 'Korolev\'s rockets: the space programme jumps ahead (+9).', fx: (g) => { g.pw.SU.spaceProg += 9; } },
    { id: 'thaw', name: 'The Thaw', cost: 8, col: 1, row: 1, req: ['cominform'], year: 1953, help: 'Fewer camps, more housing: home morale +10, tension −10.', fx: (g, T) => { g.pw.SU.home = Math.min(100, g.pw.SU.home + 10); T.tension(g, -10); } },
    { id: 'perestroika', name: 'Perestroika', cost: 10, col: 1, row: 2, req: ['thaw'], year: 1980, help: 'Rebuild the economy and open up a little: economy +10, home morale +10.', fx: (g) => { g.pw.SU.econ += 10; g.pw.SU.home = Math.min(100, g.pw.SU.home + 10); } },
  ];

  // ---- special branches, next to the shared tree ----
  const SPECIAL = {
    CHN: [
      { id: 'leap', name: 'Great Leap Forward', cost: 6, col: 8, row: 0, excl: ['newdem'], lean: -1, help: 'Backyard furnaces and communes: development +1, army +3, but stability −1.', fx: (g, T, k) => { T.dev(g, k); T.army(g, k, 3); T.stab(g, k, -1); } },
      { id: 'newdem', name: 'New Democracy', cost: 6, col: 9, row: 0, excl: ['leap'], help: 'A careful, mixed economy: stability +1, income +1 a year.', fx: (g, T, k) => { T.stab(g, k, 1); T.mod(g, k, 'income', 1); } },
      { id: 'split', name: 'Break with Moscow', cost: 5, col: 8.5, row: 1, any: ['leap', 'newdem'], year: 1958, help: 'Our own road: two thirds of the way back to the middle, and China goes its own way.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.66); T.mod(g, k, 'ownWay', 1); } },
      { id: 'pingpong', name: 'Ping-Pong Diplomacy', cost: 8, col: 8.5, row: 2, req: ['split'], year: 1970, help: 'Open the door to America: 30 toward the West.', fx: (g, T, k) => T.lean(g, k, 30) },
    ],
    IND: [
      { id: 'nam', name: 'Founder of the Non-Aligned', cost: 5, col: 9, row: 0, help: 'With Tito and Nasser: India goes its own way and outside pressure moves it a third less.', fx: (g, T, k) => { T.mod(g, k, 'ownWay', 1); T.mod(g, k, 'resist', 0.33); T.glory(g, k, 3); } },
      { id: 'green', name: 'Green Revolution', cost: 6, col: 8, row: 0, year: 1965, help: 'New seeds, no more famines: stability +1, development +1.', fx: (g, T, k) => { T.stab(g, k, 1); T.dev(g, k); } },
      { id: 'buddha', name: 'Smiling Buddha', cost: 10, col: 8, row: 1, req: ['green'], year: 1974, help: 'An Indian atomic bomb: army +5, divisions +10% better, tension +5.', fx: (g, T, k) => { T.army(g, k, 5); T.mod(g, k, 'quality', 0.1); T.tension(g, 5); T.glory(g, k, 3); } },
    ],
    EGY: [
      { id: 'freeofficers', name: 'Free Officers', cost: 5, col: 8.5, row: 0, help: 'Nasser and the officers take over from the king: a republic run by the nationalists.', fx: (g, T, k) => T.govern(g, k, 'Republic', 'nat') },
      { id: 'suez', name: 'Nationalise the Suez Canal', cost: 6, col: 8, row: 1, req: ['freeofficers'], year: 1956, help: 'The canal is Egypt\'s: development +1, 10 toward the East, tension +5.', fx: (g, T, k) => { T.dev(g, k); T.lean(g, k, -10); T.tension(g, 5); T.glory(g, k, 3); } },
      { id: 'aswan', name: 'Aswan High Dam', cost: 7, col: 9, row: 1, req: ['freeofficers'], help: 'Power and water for the Nile valley: development +1, stability +1.', fx: (g, T, k) => { T.dev(g, k); T.stab(g, k, 1); } },
    ],
    YUG: [
      { id: 'titoroad', name: 'Tito\'s Own Road', cost: 4, col: 8, row: 0, help: 'Neither Moscow\'s nor Washington\'s: halfway to the middle, and Yugoslavia goes its own way.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.5); T.mod(g, k, 'ownWay', 1); } },
      { id: 'selfmanage', name: 'Workers\' Self-Management', cost: 5, col: 8, row: 1, req: ['titoroad'], help: 'Factories run by their workers: development +1, stability +1.', fx: (g, T, k) => { T.dev(g, k); T.stab(g, k, 1); } },
    ],
  };
  G.DATA = G.DATA || {};
  G.DATA.TREES = { NATION, US, SU, SPECIAL };
})(typeof window !== 'undefined' ? window : globalThis);
