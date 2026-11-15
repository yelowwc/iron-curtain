// node tools/stage.js ATT DEF [seasons] - stage one war and print it season by season
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME, [a, d] = [process.argv[2] || 'IRQ', process.argv[3] || 'IRN'], n = +process.argv[4] || 16;
const g = GAME.newGame('US'); g.pending = []; g.wars = [];
for (const k in g.c) g.c[k].war = null;
const w = GAME.startWar(g, a, d, 0);
if (!w) { console.log('no war'); process.exit(); }
const P = GAME.PBY;
for (let s = 0; s < n && g.wars.includes(w); s++) {
  const news0 = g.news[0];
  GAME.warSeason(g);
  const us = GAME.unitsOf(g, w);
  const line = k => us.filter(u => u.k === k).map(u => `${P[u.p].name.slice(0, 12)}(${u.str.toFixed(2)}/${u.org.toFixed(2)}${u.cut ? ' CUT' : ''})`).join(' ');
  console.log(`S${s} front ${w.front} held ${w.held ? w.held.att.toFixed(2) + '/' + w.held.def.toFixed(2) : '-'} battles ${g.battles.filter(b => b.w === w.id).map(b => P[b.p].name + (b.won ? '+' : '-')).join(',')}`);
  console.log('  ' + a + ': ' + line(a)); console.log('  ' + d + ': ' + line(d));
  for (const x of g.news) { if (x === news0) break; console.log('  NEWS ' + x.text); }
}
