// node tools/history.js [games] [year] - the computer plays on past 1991; counts how often big changes happen
require('../data.js'); require('../neighbours.js'); require('../game.js');
const GAME = globalThis.GAME, D = globalThis.DATA, runs = +process.argv[2] || 40, until = +process.argv[3] || 2030;
const watch = { 'Soviet Union dissolved': /Soviet Union is dissolved/, 'Germany united': /Germany is united/, 'Yugoslavia breaks up': /Yugoslavia falls apart/,
  'Vietnam united': /conquers South Vietnam|Vietnam is united/, 'Tibet taken': /conquers Tibet/, 'region wins independence': /wins its war of independence/,
  'region crushed': /crushes the uprising/, 'king falls': /overthrow the king|monarchy is overthrown|abolishes its monarchy/, 'coup': /Coup in .*army seizes/,
  'back to democracy': /returns to democracy/, 'AI unification': /is united!/, 'Bangladesh free': /Bangladesh/ };
const seen = {}; let errors = 0, maxWars = 0;
for (let i = 0; i < runs; i++) {
  const g = GAME.newGame(i % 2 ? 'US' : 'SU'), log = [];
  try {
    while (!g.over && g.year < until) {
      while (g.pending.length) GAME.choose(g, 0);
      GAME.computerTurn(g, g.side);
      if (g.conf) GAME.confAuto(g);
      const y0 = g.year; GAME.endYear(g); log.push(...g.news.filter(n => n.year >= y0).map(n => n.text));
      maxWars = Math.max(maxWars, g.wars.length);
    }
  } catch (e) { errors++; console.log(g.year, e.stack.split('\n').slice(0, 3).join(' | ')); }
  const all = [...new Set(log)].join('\n');
  for (const k in watch) if (watch[k].test(all)) seen[k] = (seen[k] || 0) + 1;
}
console.log(`${runs} games to ${until}, errors ${errors}, most wars at once ${maxWars}`);
for (const k in watch) console.log(`  ${k}: ${seen[k] || 0}`);
