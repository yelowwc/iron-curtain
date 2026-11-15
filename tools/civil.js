// node tools/civil.js [games] [game.js path] - how civil wars end: rebels / government / truce, by camp, and how long they last
require('../data.js'); require('../neighbours.js'); require(process.argv[3] || '../game.js');
const GAME = globalThis.GAME, runs = +process.argv[2] || 30;
const c = { rebelsUS: 0, rebelsSU: 0, govVsUS: 0, govVsSU: 0, truce: 0, freed: 0, crushed: 0, n: 0 };
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame('US');
  while (!g.over && !g.verdict) {
    while (g.pending.length) GAME.choose(g, 0);
    if (g.conf) GAME.confAuto(g);
    GAME.computerTurn(g, 'US');
    const before = {}; for (const k in g.c) if (g.c[k].war) before[k] = g.c[k].war.rebels;
    const top = g.news[0];
    GAME.endYear(g);
    for (const x of g.news) {
      if (x === top) break;
      if (/win the civil war/.test(x.text)) { const k = Object.keys(before).find(k => x.text.startsWith(GAME.info(k).name)); c['rebels' + (k ? before[k] : 'US')]++; c.n++; }
      else if (/government defeats/.test(x.text)) { const k = Object.keys(before).find(k => x.text.startsWith(GAME.info(k).name)); c['govVs' + (k ? before[k] : 'US')]++; c.n++; }
      else if (/civil war ends in a truce/.test(x.text)) { c.truce++; c.n++; }
      else if (/war of independence/.test(x.text)) c.freed++;
      else if (/crushes the uprising/.test(x.text)) c.crushed++;
    }
  }
}
for (const k in c) c[k] = +(c[k] / runs).toFixed(2);
console.log(`${runs} games, per game:`, c);
