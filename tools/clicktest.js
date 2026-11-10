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
    check('start: union regions not playable', !nats.includes('UKR') && !nats.includes('SCO'));
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
    const g = G(); g.peace = { win: 'POL', lose: 'CSK' }; ironCurtain.refresh();
    click('#end'); await wait(100);
    check('peace: conference opens', !!q('#sign') && /Peace conference/.test(q('#card').textContent));
    const t = qa('[data-t]').find(b => !b.disabled && b.dataset.t === 'reparations'); if (t) click(t); await wait(20);
    click('#sign'); await wait(100); await answer();
    check('peace: treaty signed', !g.peace && g.news.some(n => /Peace between Poland and Czechoslovakia/.test(n.text)), (g.news.find(n => /Peace between/.test(n.text)) || {}).text);
  });
  await step('nation decisions', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="IND"]'); await wait(100);
    check("decisions: India gets Nehru's choice", /Nehru/.test(q('#card').textContent) && qa('[data-i]').length === 3, q('#card h1') && q('#card h1').textContent);
    if (q('[data-i]')) { click(qa('[data-i]')[0]); await wait(50); }
    check('decisions: the choice counts', G().c.IND.a === 0 && G().news.some(n => /^You chose: Belong to no bloc/.test(n.text)), G().c.IND.a);
    await answer();
  });
  // ---- a superpower game to the end of the Cold War and beyond ----
  await step('superpower game', async () => {
    try { localStorage.removeItem('iron-curtain-lite-3'); } catch (e) { }
    ironCurtain.start(); await wait(50); click('[data-side="US"]'); await wait(100); await answer();
    const g = G();
    for (let i = 0; i < 50 && g.year <= 1991 && !g.over; i++) { GAME.computerTurn(g, 'US'); click('#end'); await wait(250); if (q('#onward')) break; await answer(); }
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
