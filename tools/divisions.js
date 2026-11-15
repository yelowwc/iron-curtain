// node tools/divisions.js [games] - how wars fought with divisions go: length, divisions, battles, endings
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME, runs = +process.argv[2] || 5, verbose = process.argv.includes('-v');
const st = { wars: 0, seasons: 0, battles: 0, divs: 0, noFight: 0, landings: 0, encircled: 0 };
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame('US'), seen = {};
  while (!g.over && !g.verdict) {
    while (g.pending.length) GAME.choose(g, 0);
    if (g.conf) GAME.confAuto(g);
    GAME.computerTurn(g, 'US');
    // play the seasons one by one to watch them
    while ((g.season || 0) < 4 && !g.conf && !g.over) {
      GAME.warSeason(g); g.season = (g.season || 0) + 1;
      for (const w of g.wars) {
        const s = seen[w.id] = seen[w.id] || { n: 0, b: 0, name: GAME.info(w.att).name + ' vs ' + GAME.info(w.def).name, max: 0 };
        s.n++; s.b += g.battles.filter(b => b.w === w.id).length; s.max = Math.max(s.max, GAME.unitsOf(g, w).length); s.front = w.front;
      }
    }
    if (g.conf) GAME.confAuto(g);
    GAME.endYear(g);
  }
  for (const x of g.news) { if (/lands troops/.test(x.text)) st.landings++; if (/surrounded/.test(x.text)) st.encircled++; }
  for (const id in seen) { const s = seen[id]; st.wars++; st.seasons += s.n; st.battles += s.b; st.divs += s.max; if (!s.b) st.noFight++; if (verbose) console.log(s.name, 'seasons', s.n, 'battles', s.b, 'divs', s.max, 'front', s.front); }
}
console.log(`${runs} games, ${st.wars} wars: avg ${(st.seasons / st.wars).toFixed(1)} seasons, ${(st.battles / st.wars).toFixed(1)} battles, ${(st.divs / st.wars).toFixed(1)} divisions; no battle at all ${st.noFight}; landings ${st.landings}; destroyed by encirclement ${st.encircled}`);
