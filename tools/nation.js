// node tools/nation.js [KEY ...] - a simple scripted player plays some nations; prints how they end
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME;
const keys = process.argv.slice(2).length ? process.argv.slice(2) : ['FRA', 'EGY', 'IND', 'POL', 'CUB', 'ISR', 'IRN', 'ARG'];
for (const key of keys) {
  const res = {};
  for (let i = 0; i < 10; i++) {
    const g = GAME.newGame(key);
    let guard = 0;
    while (!g.over && guard++ < 200) {
      const me = g.c[key];
      if (me.stab < 3) GAME.homeAct(g, 'stabilise');
      if (me.army < GAME.baseArmy(key) + 4) GAME.homeAct(g, 'army');
      for (const n of (globalThis.NEIGHBOURS[key] || [])) { GAME.act(g, 'ME', 'aid', n); GAME.act(g, 'ME', 'propaganda', n); }
      if (g.peace) GAME.conference(g, GAME.termsFor(g, g.peace.win, g.peace.lose).filter(t => t.ok && t.id === (g.nation ? 'annex' : 'government')).map(t => t.id));
    for (const f of globalThis.DATA.FORMABLES) if (g.nation) GAME.form(g, f.id);
    GAME.endYear(g);
    }
    const k = g.over.grade || g.over.why; res[k] = (res[k] || 0) + 1;
  }
  console.log(key.padEnd(4), JSON.stringify(res));
}
