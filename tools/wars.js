// node tools/wars.js [games] - how wars between countries end
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME, runs = +process.argv[2] || 50, end = { attacker: 0, defender: 0, truce: 0 };
let years = 0, n = 0;
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame('US'); let seen = new Set();
  while (!g.over) {
    while (g.pending.length) GAME.choose(g, 0);
    GAME.computerTurn(g, 'US');
    const before = g.wars.map(w => ({ id: w.id, y: g.year }));
    if (g.peace) GAME.conference(g, GAME.termsFor(g, g.peace.win, g.peace.lose).filter(t => t.ok && t.id === (g.nation ? 'annex' : 'government')).map(t => t.id));
    for (const f of globalThis.DATA.FORMABLES) if (g.nation) GAME.form(g, f.id);
    GAME.endYear(g);
    for (const b of before) if (!g.wars.some(w => w.id === b.id)) {
      const t = g.news.find(x => /defeats|drives back|truce\. Nobody/.test(x.text) && x.year >= b.y);
      if (t) { end[/defeats/.test(t.text) ? 'attacker' : /drives back/.test(t.text) ? 'defender' : 'truce']++; }
    }
  }
}
console.log(`${runs} games, wars ended:`, end);
