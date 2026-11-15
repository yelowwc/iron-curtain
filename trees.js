// Iron Curtain - decision trees. Like national focuses, but decisions: each costs Influence Points (IP)
// and needs the decisions above it. Every nation has the shared tree (economy, army, politics, foreign
// policy); the superpowers have trees of their own, and many countries have a branch of their own next to
// the shared one. The computer countries walk their trees too.
//
// A decision: id, name, cost (IP), col/row (place in the tree), req (all needed), any (one of them is
// enough), excl (taking one closes the others), year (not before), lean (+1 West, -1 East: the computer
// prefers decisions that fit its politics), ai(g, k) (the computer only takes it when this is true),
// when(g, T, k) / whenWhy (only possible when...), help (what it does), fx(g, T, k) (the effect; T are
// helpers from game.js, k the country).
(function (G) {
  const each = (g, T, test, fn) => { for (const d of G.DATA.COUNTRIES) { const c = g.c[d.key]; if (c && c.independent && !c.owner && !T.isHome(d.key) && test(d, c)) fn(d.key, c, d); } };
  const toward = (g, T, k, others, n) => { for (const o of others) if (g.c[o] && !g.c[o].owner && g.c[o].independent) T.lean(g, o, Math.sign(g.c[k].a - g.c[o].a) * Math.min(n, Math.abs(g.c[k].a - g.c[o].a))); };

  const NATION = [
    // ---- economy ----
    { id: 'plan', name: 'Five-Year Plan', cost: 4, col: 0, row: 0, excl: ['market'], lean: -1, help: 'The state builds the economy: development +1, Communists +5.', fx: (g, T, k) => { T.dev(g, k); T.party(g, k, 'com', 5); } },
    { id: 'market', name: 'Open Markets', cost: 4, col: 1, row: 0, excl: ['plan'], lean: 1, help: 'Foreign trade and private enterprise: development +1, Liberals +5.', fx: (g, T, k) => { T.dev(g, k); T.party(g, k, 'lib', 5); } },
    { id: 'industry', name: 'Heavy Industry', cost: 5, col: 0, row: 1, any: ['plan', 'market'], help: 'Steel mills and tractor works: development +1, a bigger standing army (+2).', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'army', 2); } },
    { id: 'rails', name: 'Roads and Railways', cost: 4, col: 1, row: 1, any: ['plan', 'market'], help: 'Goods and soldiers move faster: income +1 a year.', fx: (g, T, k) => T.mod(g, k, 'income', 1) },
    { id: 'light', name: 'Light Industry', cost: 4, col: 1, row: 2, req: ['rails'], help: 'Shoes, radios, refrigerators: income +1 a year, and the ruling party +5.', fx: (g, T, k) => { T.mod(g, k, 'income', 1); if (g.c[k].ruling) T.party(g, k, g.c[k].ruling, 5); } },
    { id: 'miracle', name: 'Economic Miracle', cost: 7, col: 0.5, row: 3, req: ['industry', 'light'], help: 'Development +1, income +1 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 1); } },
    // ---- army ----
    { id: 'conscription', name: 'Conscription', cost: 3, col: 2.5, row: 0, help: 'Every young man serves: army +4 now, a bigger standing army (+2).', fx: (g, T, k) => { T.army(g, k, 4); T.mod(g, k, 'army', 2); } },
    { id: 'academy', name: 'Officer Academy', cost: 4, col: 2, row: 1, req: ['conscription'], help: 'Better officers: your divisions fight 10% better.', fx: (g, T, k) => T.mod(g, k, 'quality', 0.1) },
    { id: 'forts', name: 'Border Fortifications', cost: 4, col: 3, row: 1, req: ['conscription'], help: 'Bunkers and minefields: your divisions defend your own land 15% better.', fx: (g, T, k) => T.mod(g, k, 'fort', 0.15) },
    { id: 'modern', name: 'Modern Equipment', cost: 6, col: 2, row: 2, req: ['academy'], help: 'Tanks, jets, radios: divisions 10% better, army +3.', fx: (g, T, k) => { T.mod(g, k, 'quality', 0.1); T.army(g, k, 3); } },
    { id: 'arms', name: 'Arms Industry', cost: 6, col: 2.5, row: 3, req: ['modern', 'industry'], help: 'Our own tanks and rifles: a bigger standing army (+3), divisions 5% better.', fx: (g, T, k) => { T.mod(g, k, 'army', 3); T.mod(g, k, 'quality', 0.05); } },
    // ---- politics ----
    { id: 'state', name: 'Strengthen the State', cost: 3, col: 4.5, row: 0, help: 'Police, courts, tax offices: stability +1.', fx: (g, T, k) => T.stab(g, k, 1) },
    { id: 'police', name: 'Secret Police', cost: 4, col: 4, row: 1, req: ['state'], excl: ['reform'], help: 'Rebels find it hard to organise: rebel armies a third weaker.', fx: (g, T, k) => T.mod(g, k, 'police', 1) },
    { id: 'reform', name: 'Reforms', cost: 4, col: 5, row: 1, req: ['state'], excl: ['police'], help: 'Free press, fair courts: Liberals +10, Socialists +5.', fx: (g, T, k) => { T.party(g, k, 'lib', 10); T.party(g, k, 'soc', 5); } },
    { id: 'purge', name: 'Party Purge', cost: 4, col: 4, row: 2, req: ['police'], help: 'Out with the doubters: the ruling party +15, outside pressure moves you 15% less.', fx: (g, T, k) => { if (g.c[k].ruling) T.party(g, k, g.c[k].ruling, 15); T.mod(g, k, 'resist', 0.15); } },
    { id: 'elections', name: 'Free Elections', cost: 4, col: 5, row: 2, req: ['reform'], help: 'A real vote: the country becomes a democracy and the strongest party governs.', fx: (g, T, k) => T.govern(g, k, 'Democracy', null) },
    { id: 'unity', name: 'National Unity', cost: 5, col: 4.5, row: 3, any: ['purge', 'elections'], help: 'The nation stands together: outside pressure moves you a third less.', fx: (g, T, k) => T.mod(g, k, 'resist', 0.33) },
    // ---- foreign policy ----
    { id: 'west', name: 'Seek Western Aid', cost: 3, col: 6, row: 0, excl: ['east', 'nonal'], lean: 1, ai: (g, k) => g.c[k].a >= 30, help: 'Dollars and advisers: 8 toward the Americans.', fx: (g, T, k) => T.lean(g, k, 8) },
    { id: 'east', name: 'Seek Soviet Aid', cost: 3, col: 7, row: 0, excl: ['west', 'nonal'], lean: -1, ai: (g, k) => g.c[k].a <= -30, help: 'Roubles and advisers: 8 toward the Soviets.', fx: (g, T, k) => T.lean(g, k, -8) },
    { id: 'nonal', name: 'Non-Aligned', cost: 3, col: 8, row: 0, excl: ['west', 'east'], ai: (g, k) => Math.abs(g.c[k].a) < 30, help: 'Neither camp: halfway back to the middle, and from now on you go your own way (no bloc without an alliance) - unless revolutionaries take over.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.5); T.mod(g, k, 'ownWay', 1); } },
    { id: 'westpact', name: 'Western Alliance', cost: 5, col: 6, row: 1, req: ['west'], when: (g, T, k) => g.c[k].a >= 45, whenWhy: 'Only when you lean clearly West (45+)', help: 'Join a Western alliance near you (NATO, SEATO, CENTO, the Rio Pact...) if one takes you; otherwise 6 more toward the West.', fx: (g, T, k) => { if (!T.joinNear(g, k, 'US')) T.lean(g, k, 6); } },
    { id: 'eastpact', name: 'Socialist Brotherhood', cost: 5, col: 7, row: 1, req: ['east'], when: (g, T, k) => g.c[k].a <= -45, whenWhy: 'Only when you lean clearly East (45+)', help: 'Join the Warsaw Pact if it takes you; otherwise Soviet advisers: army +3 and 6 more toward the East.', fx: (g, T, k) => { if (!T.joinNear(g, k, 'SU')) { T.army(g, k, 3); T.lean(g, k, -6); } } },
    { id: 'thirdworld', name: 'Voice of the Third World', cost: 5, col: 8, row: 1, req: ['nonal'], help: 'Outside pressure moves you a third less, and the world listens.', fx: (g, T, k) => { T.mod(g, k, 'resist', 0.33); T.glory(g, k, 2); } },
    { id: 'milaid', name: 'Military Aid', cost: 5, col: 6.5, row: 2, any: ['westpact', 'eastpact'], help: 'Your patron arms you: army +3, divisions 5% better.', fx: (g, T, k) => { T.army(g, k, 3); T.mod(g, k, 'quality', 0.05); } },
    { id: 'mediator', name: 'Peacemaker', cost: 5, col: 8, row: 2, req: ['thirdworld'], help: 'You broker talks between the camps: tension −8, and the world takes notice.', fx: (g, T, k) => { T.tension(g, -8); T.glory(g, k, 3); } },
    { id: 'regional', name: 'Regional Power', cost: 7, col: 7, row: 3, any: ['milaid', 'mediator'], req: ['academy'], help: 'Army +4, income +1 a year, and the neighbours take notice.', fx: (g, T, k) => { T.army(g, k, 4); T.mod(g, k, 'income', 1); T.glory(g, k, 3); } },
  ];

  // ---- the superpowers ----
  const US = [
    { id: 'truman', name: 'Truman Doctrine', cost: 6, col: 1, row: 0, help: 'Help free peoples resist: every country leaning West (20-59) moves 4 closer.', fx: (g, T) => each(g, T, (d, c) => c.a >= 20 && c.a < 60, k => T.lean(g, k, 4)) },
    { id: 'marshall', name: 'Marshall Plan', cost: 10, col: 0, row: 1, req: ['truman'], help: 'Rebuild Europe: European countries outside the Soviet bloc +6 toward the West and stability +1.', fx: (g, T) => each(g, T, (d, c) => d.region === 'EU' && c.a > -60, k => { T.lean(g, k, 6); T.stab(g, k, 1); }) },
    { id: 'containment', name: 'Containment', cost: 8, col: 1, row: 1, req: ['truman'], help: 'Arm the allies: every member of a Western alliance army +2.', fx: (g, T) => each(g, T, (d) => T.inSide(g, d.key, 'US'), k => T.army(g, k, 2)) },
    { id: 'nasa', name: 'NASA', cost: 8, col: 2, row: 0, year: 1955, help: 'A space agency: the space programme jumps ahead (+8).', fx: (g) => { g.pw.US.spaceProg += 8; } },
    { id: 'peacecorps', name: 'Peace Corps', cost: 8, col: 0, row: 2, req: ['marshall'], year: 1960, help: 'Volunteers in Africa and Asia: neutral countries there +4 toward the West.', fx: (g, T) => each(g, T, (d, c) => (d.region === 'AF' || d.region === 'AS') && Math.abs(c.a) < 60, k => T.lean(g, k, 4)) },
    { id: 'progress', name: 'Alliance for Progress', cost: 8, col: 1, row: 2, req: ['marshall'], year: 1961, help: 'Aid for Latin America: the Americas +5 toward the West, stability +1.', fx: (g, T) => each(g, T, (d, c) => d.region === 'LA' && c.a > -60, k => { T.lean(g, k, 5); T.stab(g, k, 1); }) },
    { id: 'society', name: 'Great Society', cost: 10, col: 2, row: 1, year: 1964, help: 'Schools, hospitals, civil rights: home morale +10.', fx: (g) => { g.pw.US.home = Math.min(100, g.pw.US.home + 10); } },
    { id: 'detente', name: 'Détente', cost: 6, col: 1, row: 3, req: ['containment'], year: 1969, help: 'Talks with Moscow: tension −20.', fx: (g, T) => T.tension(g, -20) },
    { id: 'sdi', name: 'Strategic Defense Initiative', cost: 14, col: 2, row: 3, req: ['nasa'], year: 1980, help: '"Star Wars": nuclear arsenal +1, and the Soviets wear themselves out keeping up (their morale −8).', fx: (g) => { g.pw.US.arms += 1; g.pw.SU.home = Math.max(0, g.pw.SU.home - 8); } },
  ];
  const SU = [
    { id: 'cominform', name: 'Cominform', cost: 6, col: 1, row: 0, help: 'The communist parties of the world under one roof: Communists +5 wherever they exist, and every country leaning East (20-59) moves 4 closer.', fx: (g, T) => { each(g, T, (d, c) => !!c.parties, k => T.party(g, k, 'com', 5)); each(g, T, (d, c) => c.a <= -20 && c.a > -60, k => T.lean(g, k, -4)); } },
    { id: 'warsawplus', name: 'Bloc Discipline', cost: 8, col: 0, row: 1, req: ['cominform'], help: 'Every member of an Eastern alliance: army +3, stability +1.', fx: (g, T) => each(g, T, (d) => T.inSide(g, d.key, 'SU'), k => { T.army(g, k, 3); T.stab(g, k, 1); }) },
    { id: 'thaw', name: 'The Thaw', cost: 8, col: 1, row: 1, req: ['cominform'], year: 1953, help: 'Fewer camps, more housing: home morale +10, tension −10.', fx: (g, T) => { g.pw.SU.home = Math.min(100, g.pw.SU.home + 10); T.tension(g, -10); } },
    { id: 'sputnik', name: 'Rocket Programme', cost: 10, col: 2, row: 0, year: 1955, help: 'Korolev\'s rockets: the space programme jumps ahead (+9).', fx: (g) => { g.pw.SU.spaceProg += 9; } },
    { id: 'virgin', name: 'Virgin Lands', cost: 8, col: 2, row: 1, year: 1954, help: 'Plough the steppe: economy +5.', fx: (g) => { g.pw.SU.econ += 5; } },
    { id: 'liberation', name: 'Wars of Liberation', cost: 8, col: 0, row: 2, req: ['cominform'], year: 1960, help: 'Arms for every rising: rebels backed by the East get a big push in every civil war; new states lean East.', fx: (g, T) => { each(g, T, (d, c) => c.war && c.war.rebels === 'SU', k => T.support(g, k, 'SU', 15)); each(g, T, (d, c) => d.indep >= 1955 && Math.abs(c.a) < 60, k => T.lean(g, k, -6)); } },
    { id: 'brezhnev', name: 'Brezhnev Doctrine', cost: 10, col: 0, row: 3, req: ['warsawplus'], year: 1964, help: 'No way out of the camp: Eastern allies stability +1 and 10 further East.', fx: (g, T) => each(g, T, (d) => T.inSide(g, d.key, 'SU'), k => { T.stab(g, k, 1); T.lean(g, k, -10); }) },
    { id: 'perestroika', name: 'Perestroika', cost: 10, col: 1, row: 3, req: ['thaw'], year: 1980, help: 'Rebuild the economy and open up a little: economy +10, home morale +10.', fx: (g) => { g.pw.SU.econ += 10; g.pw.SU.home = Math.min(100, g.pw.SU.home + 10); } },
  ];

  // ---- branches of their own, next to the shared tree (columns 9 and 10) ----
  const colonies = (g, T, k, by, n) => each(g, T, (d, c) => d.colony === by && Math.abs(c.a - g.c[k].a) > 0, o => T.lean(g, o, Math.sign(g.c[k].a - g.c[o].a) * Math.min(n, Math.abs(g.c[k].a - g.c[o].a))));
  const SPECIAL = {
    CHN: [
      { id: 'leap', name: 'Great Leap Forward', cost: 6, col: 9, row: 0, excl: ['newdem'], lean: -1, help: 'Backyard furnaces and communes: development +1, army +3, but stability −1.', fx: (g, T, k) => { T.dev(g, k); T.army(g, k, 3); T.stab(g, k, -1); } },
      { id: 'newdem', name: 'New Democracy', cost: 6, col: 10, row: 0, excl: ['leap'], help: 'A careful, mixed economy: stability +1, income +1 a year.', fx: (g, T, k) => { T.stab(g, k, 1); T.mod(g, k, 'income', 1); } },
      { id: 'split', name: 'Break with Moscow', cost: 5, col: 9.5, row: 1, any: ['leap', 'newdem'], year: 1958, help: 'Our own road: two thirds of the way back to the middle, and China goes its own way.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.66); T.mod(g, k, 'ownWay', 1); } },
      { id: 'culturalrev', name: 'Cultural Revolution', cost: 6, col: 9, row: 2, req: ['split', 'leap'], help: 'Red Guards everywhere: Communists +20, outside pressure moves China 40% less, stability −1.', fx: (g, T, k) => { T.party(g, k, 'com', 20); T.mod(g, k, 'resist', 0.4); T.stab(g, k, -1); } },
      { id: 'pingpong', name: 'Ping-Pong Diplomacy', cost: 8, col: 10, row: 2, req: ['split'], year: 1970, help: 'Open the door to America: 30 toward the West.', fx: (g, T, k) => T.lean(g, k, 30) },
      { id: 'fourmod', name: 'Four Modernizations', cost: 8, col: 10, row: 3, req: ['pingpong'], year: 1977, help: 'Industry, farming, science, defence: development +1, income +2 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 2); } },
    ],
    IND: [
      { id: 'nehruplan', name: 'Nehru\'s Five-Year Plans', cost: 5, col: 9, row: 0, help: 'Dams, steel, planning: development +1.', fx: (g, T, k) => T.dev(g, k) },
      { id: 'nam', name: 'Founder of the Non-Aligned', cost: 5, col: 10, row: 0, help: 'With Tito and Nasser: India goes its own way and outside pressure moves it a third less.', fx: (g, T, k) => { T.mod(g, k, 'ownWay', 1); T.mod(g, k, 'resist', 0.33); T.glory(g, k, 3); } },
      { id: 'green', name: 'Green Revolution', cost: 6, col: 9, row: 1, req: ['nehruplan'], year: 1965, help: 'New seeds, no more famines: stability +1, development +1.', fx: (g, T, k) => { T.stab(g, k, 1); T.dev(g, k); } },
      { id: 'buddha', name: 'Smiling Buddha', cost: 10, col: 9, row: 2, req: ['green'], year: 1974, help: 'An Indian atomic bomb: army +5, divisions 10% better, tension +5.', fx: (g, T, k) => { T.army(g, k, 5); T.mod(g, k, 'quality', 0.1); T.tension(g, 5); T.glory(g, k, 3); } },
    ],
    EGY: [
      { id: 'freeofficers', name: 'Free Officers', cost: 5, col: 9.5, row: 0, help: 'Nasser and the officers take over from the king: a republic run by the nationalists.', fx: (g, T, k) => T.govern(g, k, 'Republic', 'nat') },
      { id: 'suez', name: 'Nationalise the Suez Canal', cost: 6, col: 9, row: 1, req: ['freeofficers'], year: 1956, help: 'The canal is Egypt\'s: development +1, 10 toward the East, tension +5.', fx: (g, T, k) => { T.dev(g, k); T.lean(g, k, -10); T.tension(g, 5); T.glory(g, k, 3); } },
      { id: 'aswan', name: 'Aswan High Dam', cost: 7, col: 10, row: 1, req: ['freeofficers'], help: 'Power and water for the Nile valley: development +1, stability +1.', fx: (g, T, k) => { T.dev(g, k); T.stab(g, k, 1); } },
      { id: 'panarab', name: 'Pan-Arab Union', cost: 8, col: 9, row: 2, req: ['suez'], help: 'Syria and Iraq move halfway toward Egypt\'s politics.', fx: (g, T, k) => toward(g, T, k, ['SYR', 'IRQ'], 40) },
    ],
    YUG: [
      { id: 'titoroad', name: 'Tito\'s Own Road', cost: 4, col: 9.5, row: 0, help: 'Neither Moscow\'s nor Washington\'s: halfway to the middle, and Yugoslavia goes its own way.', fx: (g, T, k) => { T.lean(g, k, -g.c[k].a * 0.5); T.mod(g, k, 'ownWay', 1); } },
      { id: 'selfmanage', name: 'Workers\' Self-Management', cost: 5, col: 9, row: 1, req: ['titoroad'], help: 'Factories run by their workers: development +1, stability +1.', fx: (g, T, k) => { T.dev(g, k); T.stab(g, k, 1); } },
      { id: 'brioni', name: 'Brioni Declaration', cost: 5, col: 10, row: 1, req: ['titoroad'], year: 1956, help: 'With Nehru and Nasser: outside pressure moves Yugoslavia a third less.', fx: (g, T, k) => { T.mod(g, k, 'resist', 0.33); T.glory(g, k, 3); } },
    ],
    FRG: [
      { id: 'wunder', name: 'Wirtschaftswunder', cost: 6, col: 9.5, row: 0, help: 'The economic miracle: development +1, income +2 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 2); } },
      { id: 'bundeswehr', name: 'Bundeswehr', cost: 6, col: 9, row: 1, req: ['wunder'], year: 1955, help: 'A new German army: army +5, divisions 10% better.', fx: (g, T, k) => { T.army(g, k, 5); T.mod(g, k, 'quality', 0.1); } },
      { id: 'ostpolitik', name: 'Ostpolitik', cost: 6, col: 10, row: 1, req: ['wunder'], year: 1969, help: 'Change through rapprochement: tension −10, East Germany and Poland 10 closer to your politics.', fx: (g, T, k) => { T.tension(g, -10); toward(g, T, k, ['GDR', 'POL'], 10); } },
    ],
    FRA: [
      { id: 'frappe', name: 'Force de Frappe', cost: 8, col: 9, row: 0, year: 1960, help: 'A French bomb: army +4, divisions 10% better, and the world takes notice.', fx: (g, T, k) => { T.army(g, k, 4); T.mod(g, k, 'quality', 0.1); T.glory(g, k, 3); } },
      { id: 'francafrique', name: 'Françafrique', cost: 6, col: 10, row: 0, help: 'France keeps its hand on its old colonies: they move 10 closer to French politics.', fx: (g, T, k) => colonies(g, T, k, 'France', 10) },
      { id: 'grandeur', name: 'Grandeur', cost: 6, col: 9.5, row: 1, any: ['frappe', 'francafrique'], year: 1966, help: 'France goes its own way in the West: outside pressure moves it 40% less.', fx: (g, T, k) => T.mod(g, k, 'resist', 0.4) },
    ],
    GBR: [
      { id: 'welfare', name: 'Welfare State', cost: 6, col: 9, row: 0, help: 'The NHS and council houses: stability +1, Socialists +10.', fx: (g, T, k) => { T.stab(g, k, 1); T.party(g, k, 'soc', 10); } },
      { id: 'commonwealth', name: 'The Commonwealth', cost: 6, col: 10, row: 0, help: 'Old colonies stay friends: they move 8 closer to British politics.', fx: (g, T, k) => colonies(g, T, k, 'Britain', 8) },
      { id: 'special', name: 'Special Relationship', cost: 6, col: 9.5, row: 1, any: ['welfare', 'commonwealth'], help: 'Shoulder to shoulder with America: 10 toward the West, divisions 5% better.', fx: (g, T, k) => { T.lean(g, k, 10); T.mod(g, k, 'quality', 0.05); } },
    ],
    JPN: [
      { id: 'yoshida', name: 'Yoshida Doctrine', cost: 5, col: 9.5, row: 0, help: 'Trade, not soldiers: development +1, income +1 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 1); } },
      { id: 'jmiracle', name: 'Japanese Miracle', cost: 7, col: 9, row: 1, req: ['yoshida'], year: 1955, help: 'Cars, radios, ships for the world: development +1, income +2 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 2); } },
      { id: 'sdf', name: 'Self-Defense Forces', cost: 6, col: 10, row: 1, req: ['yoshida'], year: 1954, help: 'A small modern army: army +3, divisions 10% better.', fx: (g, T, k) => { T.army(g, k, 3); T.mod(g, k, 'quality', 0.1); } },
    ],
    ISR: [
      { id: 'aliyah', name: 'Ingathering of the Exiles', cost: 5, col: 9, row: 0, help: 'Immigrants from everywhere: army +3, stability +1.', fx: (g, T, k) => { T.army(g, k, 3); T.stab(g, k, 1); } },
      { id: 'idf', name: 'A Citizen Army', cost: 6, col: 10, row: 0, help: 'Everyone a reservist: divisions 15% better.', fx: (g, T, k) => T.mod(g, k, 'quality', 0.15) },
      { id: 'dimona', name: 'Dimona', cost: 8, col: 9.5, row: 1, req: ['idf'], year: 1960, help: 'A secret bomb: your divisions defend your own land 20% better; tension +5.', fx: (g, T, k) => { T.mod(g, k, 'fort', 0.2); T.tension(g, 5); } },
    ],
    CUB: [
      { id: 'revolution', name: 'The Revolution', cost: 6, col: 9.5, row: 0, year: 1956, help: 'The barbudos come down from the mountains: a socialist state, 40 toward the East.', fx: (g, T, k) => { T.govern(g, k, 'Socialist', 'com'); T.lean(g, k, -40); } },
      { id: 'sugar', name: 'Sugar for Oil', cost: 5, col: 9, row: 1, req: ['revolution'], help: 'Soviet oil for Cuban sugar: income +2 a year.', fx: (g, T, k) => T.mod(g, k, 'income', 2) },
      { id: 'export', name: 'Export the Revolution', cost: 7, col: 10, row: 1, req: ['revolution'], help: 'Guerrillas all over Latin America: Communists +6 there, and their rebels get a push.', fx: (g, T, k) => each(g, T, (d) => d.region === 'LA', o => { T.party(g, o, 'com', 6); T.support(g, o, 'SU', 6); }) },
    ],
    VNM: [
      { id: 'landreform', name: 'Land Reform', cost: 5, col: 9, row: 0, help: 'Land to the peasants: Communists +10, stability +1.', fx: (g, T, k) => { T.party(g, k, 'com', 10); T.stab(g, k, 1); } },
      { id: 'trail', name: 'Ho Chi Minh Trail', cost: 6, col: 10, row: 0, year: 1959, help: 'A road through the jungle: army +4, divisions 5% better.', fx: (g, T, k) => { T.army(g, k, 4); T.mod(g, k, 'quality', 0.05); } },
      { id: 'peoplewar', name: 'People\'s War', cost: 7, col: 9.5, row: 1, req: ['landreform', 'trail'], help: 'Every village a fortress: your divisions defend your own land 20% better.', fx: (g, T, k) => T.mod(g, k, 'fort', 0.2) },
    ],
    IRN: [
      { id: 'oil', name: 'Nationalise the Oil', cost: 6, col: 9, row: 0, excl: ['whiterev'], help: 'Mossadegh\'s choice: development +1, 15 toward the middle, tension +3.', fx: (g, T, k) => { T.dev(g, k); T.lean(g, k, -Math.sign(g.c[k].a) * Math.min(15, Math.abs(g.c[k].a))); T.tension(g, 3); } },
      { id: 'whiterev', name: 'White Revolution', cost: 6, col: 10, row: 0, excl: ['oil'], year: 1963, help: 'The Shah modernises from above: development +1, Liberals +5, stability −1.', fx: (g, T, k) => { T.dev(g, k); T.party(g, k, 'lib', 5); T.stab(g, k, -1); } },
      { id: 'imperialarmy', name: 'Imperial Army', cost: 7, col: 9.5, row: 1, any: ['oil', 'whiterev'], help: 'Tanks and jets bought with oil money: army +5, divisions 10% better.', fx: (g, T, k) => { T.army(g, k, 5); T.mod(g, k, 'quality', 0.1); } },
    ],
    POL: [
      { id: 'polishroad', name: 'The Polish Road', cost: 5, col: 9.5, row: 0, year: 1956, help: 'Gomułka\'s thaw: stability +1, outside pressure moves Poland a quarter less.', fx: (g, T, k) => { T.stab(g, k, 1); T.mod(g, k, 'resist', 0.25); } },
      { id: 'loans', name: 'Western Loans', cost: 5, col: 9, row: 1, req: ['polishroad'], year: 1970, help: 'Gierek borrows to build: income +2 a year, 5 toward the West.', fx: (g, T, k) => { T.mod(g, k, 'income', 2); T.lean(g, k, 5); } },
      { id: 'church', name: 'Peace with the Church', cost: 5, col: 10, row: 1, req: ['polishroad'], help: 'The bishops and the state get along: stability +1.', fx: (g, T, k) => T.stab(g, k, 1) },
    ],
    BRA: [
      { id: 'brasilia', name: 'Brasília', cost: 6, col: 9, row: 0, year: 1956, help: 'A new capital in the interior: development +1, stability +1.', fx: (g, T, k) => { T.dev(g, k); T.stab(g, k, 1); } },
      { id: 'milagre', name: 'Milagre Econômico', cost: 7, col: 10, row: 0, year: 1968, help: 'The Brazilian miracle: development +1, income +2 a year.', fx: (g, T, k) => { T.dev(g, k); T.mod(g, k, 'income', 2); } },
      { id: 'amazon', name: 'Trans-Amazonian Highway', cost: 6, col: 9.5, row: 1, any: ['brasilia', 'milagre'], help: 'A road through the forest: income +1 a year, a bigger standing army (+2).', fx: (g, T, k) => { T.mod(g, k, 'income', 1); T.mod(g, k, 'army', 2); } },
    ],
  };
  G.DATA = G.DATA || {};
  G.DATA.TREES = { NATION, US, SU, SPECIAL };
})(typeof window !== 'undefined' ? window : globalThis);
