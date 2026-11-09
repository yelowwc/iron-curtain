// node tools/balance.js [games] - the computer plays both sides; prints who wins.
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME;
const runs = +process.argv[2] || 50, result = {};
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame('US');
  while (!g.over) {
    while (g.pending.length) GAME.choose(g, 0);
    GAME.computerTurn(g, 'US');
    if (g.peace) GAME.conference(g, GAME.termsFor(g, g.peace.win, g.peace.lose).filter(t => t.ok && t.id === (g.nation ? 'annex' : 'government')).map(t => t.id));
    for (const f of globalThis.DATA.FORMABLES) if (g.nation) GAME.form(g, f.id);
    GAME.endYear(g);
  }
  const k = g.over.why === 'nuclear' ? 'nuclear war' : (g.over.winner || 'draw');
  result[k] = (result[k] || 0) + 1;
}
console.log(`${runs} games:`, result);
