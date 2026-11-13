// node tools/wars.js [games] - how wars between countries end, per game
// (attacker wins and defender wins both go to a peace conference; truces keep the ceasefire line)
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME, runs = +process.argv[2] || 50;
const c = { attacker: 0, defender: 0, truce: 0, treaties: 0 };
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame('US');
  while (!g.over && !g.verdict) {
    while (g.pending.length) GAME.choose(g, 0);
    if (g.conf) GAME.confAuto(g);
    GAME.computerTurn(g, 'US');
    const top = g.news[0];
    GAME.endYear(g);
    let thrown = 0;
    for (const x of g.news) {
      if (x === top) break;
      if (/throws back the invasion/.test(x.text)) thrown++;
      if (/winners meet/.test(x.text)) c.treaties++;
      if (/sign a truce/.test(x.text)) c.truce++;
    }
    c.defender += thrown;
  }
}
c.attacker = c.treaties - c.defender;
for (const k in c) c[k] = +(c[k] / runs).toFixed(1);
console.log(`${runs} games, per game:`, c);
