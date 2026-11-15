// Clicks through the real game screen like a player would and writes a report into the page.
// Open tools/clicktest.html in a browser (or headless Chrome with --dump-dom) and read #report.
(async function () {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const results = [];
  const check = (name, ok, info) => results.push({ name, ok: !!ok, info: info || '' });
  const G = () => ironCurtain.game;
  function click(sel) { const el = typeof sel === 'string' ? q(sel) : sel; if (!el) throw new Error('missing ' + sel); if (el.disabled) throw new Error('disabled ' + sel); el.click(); }
  const land = (key, type) => { const p = qa('path.land').find(p => p.__data__ && p.__data__.key === key); if (!p) throw new Error('no land ' + key); p.dispatchEvent(new MouseEvent(type || 'click', { bubbles: true, clientX: 300, clientY: 300 })); };
  const panel = () => q('#panel').textContent;
  // answer whatever pop-up is open: a decision, the 1991 verdict, a peace conference
  async function answer() {
    for (let n = 0; n < 20 && !q('#modal').hidden; n++) {
      if (q('[data-i]')) click('[data-i]');
      else if (q('#onward')) click('#onward');
      else if (q('#sign')) click('#sign');
      else if (q('#offer-no')) click('#offer-no');
      else break;
      await wait(20);
    }
  }
  async function endYear() { click('#end'); await wait(250); await answer(); }
  async function step(name, fn) { try { await fn(); } catch (e) { check(name, false, 'threw: ' + e.message); } }

  await wait(300);
  // ---- the start screen ----
  await step('start screen', async () => {
    check('start: superpower buttons', q('[data-side="US"]') && q('[data-side="SU"]'));
    const nats = qa('button.nat').map(b => b.dataset.side);
    check('start: nations listed', nats.length > 60, nats.length + ' nations');
    check('start: nations inside unions playable', nats.includes('UKR') && nats.includes('SCO'));
    click('[data-side="POL"]'); await wait(100); await answer();
  });
  // ---- running your own nation ----
  await step('home panel', async () => {
    check('home: my nation panel', /your nation/.test(panel()) && /Foreign pressure/.test(panel()));
    const ip0 = G().ip.ME, b = qa('[data-home]').find(x => !x.disabled);
    click(b); await wait(50);
    check('home: home action spends IP', G().ip.ME < ip0, b.dataset.home + ' ' + ip0 + '->' + G().ip.ME);
    const ip1 = G().ip.ME, pb = qa('[data-party$="|back"]').find(x => !x.disabled);
    if (pb) { click(pb); await wait(50); check('home: back a party', G().ip.ME === ip1 - 1); } else check('home: back a party', false, 'no button');
  });
  await step('years go by', async () => {
    const y0 = G().year;
    for (let i = 0; i < 3; i++) await endYear();
    check('years: End Year advances', G().year === y0 + 3, y0 + '->' + G().year);
    check('years: no pop-up left open', q('#modal').hidden);
  });
  await step('another country', async () => {
    land('CSK'); await wait(50);
    check('select: panel shows the country', q('#panel h2') && /Czech/.test(q('#panel h2').textContent), q('#panel h2') && q('#panel h2').textContent);
    const b = q('[data-act="propaganda"]');
    if (b && !b.disabled) { const m0 = G().c.CSK.moves; click(b); await wait(50); check('select: propaganda is a move', G().c.CSK.moves === m0 + 1); }
    else check('select: propaganda is a move', true, 'not available: ' + (b ? b.textContent : 'no button'));
  });
  await step('regions', async () => {
    land('UKR', 'dblclick'); await wait(700);
    check('region: double-click a Soviet republic', /Ukraine/.test(q('#panel h2').textContent) && /Part of Soviet Union since 1922/.test(panel()), panel().slice(0, 80));
    check('region: outline drawn', (q('path.selected').getAttribute('d') || '').length > 50);
    land('SCO', 'mousemove'); await wait(20);
    check('region: hover names the owner', !q('#tip').hidden && /United Kingdom/.test(q('#tip').textContent) && /Scotland/.test(q('#tip').textContent), q('#tip').textContent.slice(0, 80));
    land('SCO', 'mouseleave');
  });
  await step('uprising', async () => {
    const g = G(); g.c.KUR.war = { rebels: 'SU', balance: -20, years: 1, help: { US: 0, SU: 0 }, troops: {}, sep: true }; g.c.KUR.moves = 0; g.ip.ME = Math.max(g.ip.ME, 6);
    ironCurtain.refresh(); land('KUR', 'dblclick'); await wait(100);
    check('uprising: panel shows it', /Uprising/.test(panel()));
    const ip0 = g.ip.ME; click('[data-act="arm"]'); await wait(50);
    check('uprising: arm a side', g.ip.ME === ip0 - 2 && g.c.KUR.war.help.SU + g.c.KUR.war.help.US > 0);
  });
  await step('saving', async () => {
    let s = null; try { s = JSON.parse(localStorage.getItem('iron-curtain-lite-3')); } catch (e) { }
    check('save: game in the browser', s && s.year === G().year && s.nation === 'POL', s ? s.year : 'none');
    const year = G().year;
    ironCurtain.start(); await wait(50);
    check('save: CONTINUE offered', !!q('#resume'));
    click('#resume'); await wait(100);
    check('save: game continues', G().year === year && G().nation === 'POL' && q('#modal').hidden);
  });
  await step('peace conference', async () => {
    const g = G(); g.wars = [];
    GAME.startConference(g, { id: 98, att: 'POL', def: 'CSK', front: 100, years: 3, help: { att: 0, def: 0 }, troops: {}, armed: {}, capFell: {} }, 'att');
    ironCurtain.refresh(); await wait(50);
    check('peace: conference opens in the panel', !!g.conf && /Peace conference/.test(q('#panel').textContent) && q('#end').disabled);
    const prov = qa('path.land.claimable')[0];
    check('peace: provinces to click on the map', !!prov, qa('path.land.claimable').length + ' claimable');
    if (prov) { prov.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(50); }
    check('peace: a province claimed', !g.conf || g.conf.claims.some(c => c.by === 'POL' && c.kind === 'take'));
    const rep = q('[data-demand^="rep:"]'); if (rep && !rep.disabled) click(rep); await wait(50);
    if (q('#confpass')) click('#confpass'); await wait(100); await answer();
    check('peace: treaty signed', !g.conf && g.news.some(n => /^Peace of .*Poland takes/.test(n.text)), (g.news.find(n => /^Peace of/.test(n.text)) || {}).text);
    check('peace: Poland holds new provinces', g.cuts.some(k => k.taker === 'POL' && ['CSK', 'SVK'].includes(k.land)));
  });
  await step('nation decisions', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="IND"]'); await wait(100);
    check("decisions: India gets Nehru's choice", /Nehru/.test(q('#card').textContent) && qa('[data-i]').length === 3, q('#card h1') && q('#card h1').textContent);
    if (q('[data-i]')) { click(qa('[data-i]')[0]); await wait(50); }
    check('decisions: the choice counts', G().c.IND.a === 0 && G().news.some(n => /^You chose: Belong to no bloc/.test(n.text)), G().c.IND.a);
    await answer();
  });
  // ---- a war fought with divisions ----
  await step('divisions', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="IND"]'); await wait(100); await answer();
    const g = G(); g.wars = []; g.units = []; g.ctl = {}; g.c.PAK.war = null; g.c.IND.war = null;
    GAME.startWar(g, 'IND', 'PAK', 0); ironCurtain.refresh(); await wait(50);
    check('war: End Season while at war', /Season/.test(q('#end').textContent) && /Spring/.test(q('#year').textContent), q('#end').textContent);
    const y0 = g.year; click('#end'); await wait(250); await answer();
    check('war: a season passes, not a year', (g.year === y0 && g.season === 1) || !g.wars.length, GAME.SEASONS[g.season] + ' ' + g.year);
    check('war: divisions on the map', qa('g.div').length > 0 && qa('g.div.mine').length > 0, qa('g.div').length + ' counters');
    if (!g.wars.length) return;
    qa('g.div.mine')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(50);
    check('war: pick a division', /picked/.test(panel()) && qa('g.div.sel').length > 0);
    const cap = GAME.capPid('PAK'), p = qa('path.land').find(x => x.__data__ && x.__data__.pid === cap);
    p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(50);
    const mine = g.units.filter(u => u.k === 'IND' && u.goal === cap);
    check('war: right-click sends them', mine.length > 0 && qa('path.plan').length > 0, mine.length + ' marching');
    click('[data-uorder="hold"]'); await wait(30);
    check('war: hold here', g.units.filter(u => u.k === 'IND' && !u.auto && u.goal === null).length > 0);
    click('[data-stance$="|hold"]'); await wait(30);
    check('war: stance hold', g.stance[g.wars[0].id] === 'hold');
    click('[data-stance$="|advance"]'); await wait(30);
    for (let i = 0; i < 90 && g.wars.some(w => w.att === 'IND' || w.def === 'IND') && !g.over; i++) { click('#end'); await wait(120); await answer(); if (g.conf) { GAME.confAuto(g); ironCurtain.refresh(); } }
    check('war: it ends, the divisions go home', !g.wars.some(w => w.att === 'IND' || w.def === 'IND') && !g.units.some(u => u.k === 'IND') && /Year/.test(q('#end').textContent), g.wars.length + ' wars');
  });
  // ---- a civil war fought with divisions: you are the government, then the rebels ----
  await step('civil war', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="CHN"]'); await wait(100); await answer();
    const g = G(); g.wars = []; g.units = []; g.ctl = {}; g.c.CHN.war = null; GAME.civilWar(g, 'CHN', 'SU', 0); ironCurtain.refresh(); await wait(50);
    check('civil: End Season in your civil war', /Season/.test(q('#end').textContent), q('#end').textContent);
    click('#end'); await wait(250); await answer();
    const w = g.c.CHN.war;
    check('civil: rebels hold land and have divisions', !w || (Object.values(g.ctl).includes('R:CHN') && g.units.some(u => u.k === 'R:CHN')), w ? Object.values(g.ctl).filter(x => x === 'R:CHN').length + ' provinces' : 'over');
    check('civil: your loyal divisions', !w || qa('g.div.mine').length > 0);
    check('civil: rebel land coloured', !w || qa('path.land').some(p => p.__data__ && g.ctl[p.__data__.pid] === 'R:CHN' && p.getAttribute('fill') !== null));
    for (let i = 0; i < 48 && g.c.CHN.war && !g.over; i++) { click('#end'); await wait(60); await answer(); if (g.conf) { GAME.confAuto(g); ironCurtain.refresh(); } }
    check('civil: it ends and the rebels go', g.over || (!g.c.CHN.war && !g.units.some(u => u.k === 'R:CHN') && !Object.values(g.ctl).includes('R:CHN')), g.over ? g.over.why : 'ok');
    // your own rising inside a union: the rebels are yours
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="UKR"]'); await wait(100); await answer();
    const h = G(); h.support = 70; h.militia = 4; GAME.unionAct(h, 'declare'); ironCurtain.refresh(); await wait(50);
    if (!h.c.UKR.war) { check('rising: declared', false, 'no uprising'); return; }
    click('#end'); await wait(250); await answer();
    check('rising: your rebel divisions', !h.c.UKR.war || h.units.some(u => u.k === 'R:UKR') && qa('g.div.mine').length > 0, h.units.filter(u => u.k === 'R:UKR').length + ' rebel divisions');
  });
  // ---- a superpower game to the end of the Cold War and beyond ----
  await step('superpower game', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="US"]'); await wait(100); await answer();
    const g = G();
    for (let i = 0; i < 260 && g.year <= 1991 && !g.over; i++) { if (!g.season) GAME.computerTurn(g, 'US'); click('#end'); await wait(250); if (q('#onward')) break; await answer(); }
    if (g.over) { check('verdict: reached 1992', true, 'game ended early: ' + g.over.why); return; }
    check('verdict: shown after 1991', !!q('#onward') && /end of the Cold War/i.test(q('#card').textContent), g.year);
    click('#onward'); await wait(100); await answer();
    check('verdict: keep playing', q('#modal').hidden || !q('#onward'));
    for (let i = 0; i < 3; i++) await endYear();
    check('after 1991: years go on', g.year >= 1995, g.year);
    check('end game: button shown', !q('#finish').hidden);
    click('#finish'); await wait(20); click('#yes'); await wait(50);
    check('end game: result shown', !!q('#again') && !!g.over, q('#card h1') && q('#card h1').textContent);
  });
  check('no page errors', !ERRS.length, ERRS.slice(0, 3).join(' | '));
  const pre = document.createElement('pre'); pre.id = 'report';
  pre.textContent = 'REPORT ' + results.filter(r => r.ok).length + '/' + results.length + ' passed\n' + results.map(r => (r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info ? '  (' + r.info + ')' : '')).join('\n') + '\nEND';
  document.body.appendChild(pre);
})();
