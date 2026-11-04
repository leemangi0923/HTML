const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

let server, browser, context, page, origin, errors;
before(async () => {
  const html = await readFile(require('node:path').join(__dirname, '..', 'index.html'));
  server = createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext(); context.setDefaultTimeout(5000);
  // Fonts are optional; regression checks must also work offline.
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  page = await context.newPage(); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => window.SIM);
  // Stop the live conveyor; circuit checks advance their own deterministic timers.
  await page.evaluate(() => { clearInterval(LIVE.timer); });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], 'browser JavaScript errors'); });

async function fullState() {
  await page.evaluate(() => {
    setMode('free', pClone(pracRef())); S.selfChk = { '1-4': true }; S.usedFill = false;
    S.elapsed = 1000; buildTerms(); renderAll();
  });
  await page.waitForTimeout(60); // Allow the existing camera requestAnimationFrame to finish.
}

test('reference wiring passes all circuit and conveyor checks and scores 30', async () => {
  await fullState();
  const result = await page.evaluate(() => ({
    circuits: Object.entries(getChecks().res).filter(([, v]) => !v.ok).map(([k]) => k),
    judge: Object.entries(getJudge().res).filter(([, v]) => !v.ok).map(([k]) => k),
    rule7: getJudge().rule7, score: scoreSheet().total,
    counts: [CHECKS.length, JUDGE.length]
  }));
  assert.deepEqual(result.circuits, []); assert.deepEqual(result.judge, []);
  assert.equal(result.rule7, true); assert.equal(result.score, 30);
  assert.deepEqual(result.counts, [15, 11]);
});

test('all ten faults fail inspection, lose points, and pass after their documented repair', async () => {
  const faults = await page.evaluate(() => LESSONS.filter(l => l.fault).map(l => l.id));
  assert.equal(faults.length, 10);
  for (const id of faults) {
    await test(`fault ${id}`, async () => {
      const result = await page.evaluate(id => {
        const lesson = LESSONS.find(l => l.id === id);
        setMode('free', pracSetup(lesson));
        const broken = getJudge();
        const failed = Object.entries(broken.res).filter(([, v]) => !v.ok).map(([k]) => k);
        const scoreBefore = scoreSheet().total;
        lesson.fix(); const fixed = getJudge();
        return { failed, fixed: Object.entries(fixed.res).filter(([, v]) => !v.ok).map(([k]) => k), scoreBefore, scoreAfter: scoreSheet().total };
      }, id);
      assert.ok(result.failed.length > 0, `${id} must be detected`);
      assert.deepEqual(result.fixed, [], `${id} must be repairable`);
      assert.ok(result.scoreAfter > result.scoreBefore, `${id} must affect grading`);
    });
  }
});

test('score navigation highlights missing devices, labels, covers, and failed operations without changing work', async () => {
  await fullState();
  await page.evaluate(() => { delete S.op.labels.L_hmi; S.tbCover = false; S.wires = S.wires.filter(w => pairKey(w.a,w.b) !== pairKey('R3.5','PLC.N')); renderAll(); });
  for (const no of ['3-4', '(5)', '2-3']) {
    const before = await page.evaluate(() => { const { opBack, elapsed, ...rest } = S; return JSON.stringify(rest); });
    await page.locator('#btnScore').click();
    await page.locator(`[data-act="score-locate"][data-no="${no}"]`).click();
    assert.equal(await page.locator('#modal').isHidden(), true);
    assert.ok(await page.locator('#inspectionMarks .inspect-mark').count() > 0);
    const finite = await page.evaluate(() => Object.values(UI.cam).every(Number.isFinite)); assert.ok(finite);
    assert.equal(await page.evaluate(() => { const { opBack, elapsed, ...rest } = S; return JSON.stringify(rest); }), before);
  }
  await page.evaluate(() => { S.inst = S.inst.filter(i => names()[i.id] !== 'PLC'); buildTerms(); renderAll(); });
  await page.locator('#btnScore').click(); await page.locator('[data-no="1-1"]').click();
  assert.ok(await page.locator('#inspectionMarks rect').count() > 0);
});

test('search accepts symbols and Korean names; typing shortcuts does not operate tools', async () => {
  await fullState();
  await page.locator('#btnFind').click();
  for (const [query, expected] of [['PLC P20', 'PLC.P20'], ['TB 1번', 'TB.1.t'], ['부저', 'OP.BZ.1']]) {
    await page.locator('#termQuery').fill(query);
    assert.ok(await page.locator(`[data-term="${expected}"]`).count() > 0, query);
  }
  await page.locator('#termQuery').fill(''); await page.locator('#termQuery').pressSequentially('wz');
  assert.equal(await page.evaluate(() => S.tool), 'hand');
  assert.equal(await page.evaluate(() => !!UI.lens), false);
  await page.locator('#termQuery').fill('unknown-terminal');
  assert.equal(await page.locator('#termResults button').count(), 0);
  assert.match(await page.locator('#termCount').textContent(), /검색 결과가 없어요/);
  await page.locator('#termQuery').press('Escape');
  assert.equal(await page.locator('#termSearch').isHidden(), true);
  assert.equal(await page.locator('#btnFind').getAttribute('aria-expanded'), 'false');
});

test('search flips to rear terminals and traces actual wires, not reference answers', async () => {
  await fullState(); await page.evaluate(() => { S.opBack = false; buildTerms(); renderAll(); });
  await page.locator('#btnFind').click(); await page.locator('#termQuery').fill('OP.BZ.1');
  await page.locator('[data-term="OP.BZ.1"][data-trace="1"]').click();
  assert.equal(await page.evaluate(() => S.opBack), true);
  assert.ok(await page.locator('#inspectionMarks .inspect-wire').count() > 0);
  assert.ok(await page.evaluate(() => {
    const ids = tracedTermIds(UI.inspection.id), c = UI.cam;
    return S.wires.filter(w => ids.has(w.a) && ids.has(w.b)).every((w) => (wirePts(w, S.wires.indexOf(w)) || []).every(([x,y]) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h));
  }), 'the entire highlighted wire path fits in view');
  assert.equal(await page.locator('#termSearch').isHidden(), true);
  await page.evaluate(() => { S.wires = [{ a: 'PLC.P20', b: 'TB.1.t' }]; inspectTerms('PLC.P20', true); });
  const connected = await page.evaluate(() => [...tracedTermIds('PLC.P20')]);
  assert.ok(connected.includes('TB.1.b'), 'fixed terminal block common is included');
  assert.ok(!connected.includes('OP.BZ.1'), 'reference wiring is not used');
  assert.equal(await page.locator('#inspectionMarks .inspect-wire').count(), 1);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#inspectionMarks').count(), 0);
});

test('empty work has no searchable terminals; highlights clear on mode changes', async () => {
  await page.locator('[data-home="free"]').click(); await page.locator('#btnFind').click();
  await page.locator('#termQuery').fill('PLC'); assert.equal(await page.locator('#termResults button').count(), 0);
  await fullState(); await page.evaluate(() => { inspectTerms('PLC.P20', true); setMode('exam', { ...newState(false), exam: { on: true } }); showScore(); });
  assert.equal(await page.locator('#inspectionMarks').count(), 0);
  assert.equal(await page.locator('[data-act="score-locate"]').count(), 0);
  assert.equal(await page.locator('#btnScore').isHidden(), true);
});

test('free and exam work survive reload independently, including electrical state and grading', async () => {
  await fullState();
  const saved = await page.evaluate(() => { save(); return { state: JSON.parse(localStorage.getItem(STORE)), score: scoreSheet().total }; });
  await page.reload(); await page.waitForFunction(() => window.SIM);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(STORE))), saved.state);
  assert.equal(await page.evaluate(() => scoreSheet().total), saved.score);
  await page.evaluate(() => { const st = pClone(S); st.exam = { on: true }; st.elapsed = 123000; st.op.labels.L_hmi = '시험'; setMode('exam', st); save(); });
  await page.reload(); await page.waitForFunction(() => window.SIM);
  await page.locator('[data-home="exam"]').click();
  assert.equal(await page.evaluate(() => MODE), 'exam');
  assert.equal(await page.evaluate(() => S.op.labels.L_hmi), '시험');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(STORE)).op.labels.L_hmi), saved.state.op.labels.L_hmi);
});

test('mobile search remains within the board and location navigation works', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await fullState();
  await page.locator('#btnFind').click(); await page.locator('#termQuery').fill('PLC P20');
  const bounds = await page.locator('#termSearch').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.locator('[data-term="PLC.P20"][data-trace="0"]').click();
  assert.equal(await page.locator('#termSearch').isHidden(), true);
  assert.equal(await page.locator('#inspectionMarks .inspect-mark').count(), 1);
});

test('every available score location on an empty board has finite visible marks', async () => {
  await page.locator('[data-home="free"]').click();
  await page.locator('#btnScore').click();
  const targets = await page.locator('[data-act="score-locate"]').evaluateAll(buttons => buttons.map(b => b.dataset.no));
  assert.ok(targets.length >= 10);
  for (const no of targets) {
    await page.evaluate(no => locateScore(no), no);
    assert.ok(await page.locator('#inspectionMarks .inspect-mark').count() > 0, no);
    assert.ok(await page.evaluate(() => Object.values(UI.cam).every(Number.isFinite)), no);
  }
});

async function clickWorld(x, y) {
  const p = await page.evaluate(({x,y}) => { const r = svg.getBoundingClientRect(); return { x:r.left+(x-UI.cam.x)/UI.cam.w*r.width, y:r.top+(y-UI.cam.y)/UI.cam.h*r.height }; }, {x,y});
  await page.mouse.click(p.x,p.y);
}

test('relay live diagram follows actual coil and all four contact poles through PB1 toggle', async () => {
  await fullState();
  await page.evaluate(() => { const d = deviceCatalog().find(d=>d.name==='R3'); openDevicePanel(d.key); LIVE.inp.mcb=true; liveStep(0); });
  let state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='R3')));
  assert.equal(state.coil,false); assert.deepEqual(state.contacts.map(c=>[c.com,c.closed]),[['9','1'],['10','2'],['11','3'],['12','4']]);
  await page.evaluate(() => { liveDown('pb1'); liveRelease(); });
  state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='R3')));
  assert.equal(state.coil,true); assert.deepEqual(state.contacts.map(c=>[c.com,c.closed]),[['9','5'],['10','6'],['11','7'],['12','8']]);
  assert.match(await page.locator('#deviceLive').textContent(), /신호를 받아 길이 바뀌었어요/);
  assert.match(await page.locator('#deviceLive svg').getAttribute('aria-label'), /작동할 때 길이 이어짐/);
  await page.locator('#deviceDetails summary').click();
  await page.locator('#deviceAdvancedLive svg').waitFor();
  assert.match(await page.locator('#deviceAdvancedLive').textContent(), /9–5 닫힘/);
  await page.evaluate(() => { liveDown('pb1'); liveRelease(); });
  assert.match(await page.locator('#deviceLive').textContent(), /신호를 기다리고 있어요/);
  assert.match(await page.locator('#deviceLive svg').getAttribute('aria-label'), /평소 길이 이어짐/);
  assert.match(await page.locator('#deviceAdvancedLive').textContent(), /9–1 닫힘/);
});

test('timer separates instantaneous contacts, delayed contacts, countdown, and power-off reset', async () => {
  await fullState();
  await page.evaluate(() => { openDevicePanel(deviceCatalog().find(d=>d.name==='T1').key); LIVE.inp.mcb=true; LIVE.inp.ss='M'; LIVE.pack=CONV.s1; liveStep(0); });
  let state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='T1')));
  assert.equal(state.coil,true); assert.equal(state.waiting,true);
  assert.deepEqual(state.contacts.map(c=>[c.com,c.closed]),[['1','3'],['8','5']]);
  await page.evaluate(() => liveStep(.5));
  state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='T1')));
  assert.equal(state.remaining,1.5); assert.match(await page.locator('#deviceLive').textContent(), /남은 1.5초/);
  await page.evaluate(() => liveStep(1.5));
  state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='T1')));
  assert.equal(state.out,true); assert.deepEqual(state.contacts.map(c=>[c.com,c.closed]),[['1','3'],['8','6']]);
  assert.match(await page.locator('#deviceLive').textContent(), /기다리기가 끝났어요/);
  await page.evaluate(() => { LIVE.inp.mcb=false; liveStep(0); });
  state = await page.evaluate(() => deviceContactState(deviceCatalog().find(d=>d.name==='T1')));
  assert.equal(state.coil,false); assert.equal(state.out,false); assert.equal(state.elapsed,0);
  assert.deepEqual(state.contacts.map(c=>[c.com,c.closed]),[['1',null],['8','5']]);
  assert.match(await page.locator('#deviceLive').textContent(), /신호를 기다리고 있어요/);
});

test('displayed contact pairs agree with the circuit solver for every fitted and socket state', async () => {
  await fullState();
  const mismatches = await page.evaluate(() => {
    const bad=[];
    for (const name of [...RELAYS,...TIMERS]) for (const fitted of [false,true]) for (const on of [false,true]) for (const out of [false,true]) {
      const d=deviceCatalog().find(d=>d.name===name); S.plug[d.id]=fitted;
      LIVE.st.rel[name]=on;
      if(d.type==='timer') LIVE.st.tim[name]={on, out, el:out?2:0};
      const v=deviceContactState(d);
      const r=evalOnce([],LIVE.st,{...LIVE.inp,plug:plugMap(),leads:{},fuses:{},cab:{power:false}});
      for(const c of v.contacts) for(const target of [c.a,c.b].filter(Boolean)) {
        const joined=r.f(name+'.'+c.com)===r.f(name+'.'+target);
        if(joined !== (c.closed===target)) bad.push({name,fitted,on,out,com:c.com,target});
      }
    }
    return bad;
  });
  assert.deepEqual(mismatches,[]);
});

test('unplugged relay and timer show no closed socket contacts', async () => {
  await fullState();
  for (const name of ['R1','T1']) {
    await page.evaluate(name => { const d=deviceCatalog().find(d=>d.name===name); S.plug[d.id]=false; liveStep(0); openDevicePanel(d.key); renderOver(); },name);
    assert.match(await page.locator('#deviceLive').textContent(),/아직 꽂지 않았어요/);
    await page.locator('#deviceDetails summary').click();
  await page.locator('#deviceAdvancedLive svg').waitFor();
    assert.equal(await page.locator('#deviceAdvancedLive .contact-closed').count(),0);
    const state=await page.evaluate(name=>deviceContactState(deviceCatalog().find(d=>d.name===name)),name);
    assert.equal(state.coil,false); assert.ok(state.contacts.every(c=>c.closed===null));
  }
});

test('inspect tool opens a device by clicking its body and does not toggle MCB or remove hardware', async () => {
  await fullState(); await page.evaluate(()=>fitPanel());
  await page.locator('[data-tool="inspect"]').click();
  const before=await page.evaluate(()=>JSON.stringify({inst:S.inst,plug:S.plug,wires:S.wires}));
  const pos=await page.evaluate(()=>{const i=S.inst.find(i=>i.type==='mcb');return{x:i.x+17,y:devY(i)+41}});
  await clickWorld(pos.x,pos.y);
  assert.equal(await page.locator('#devicePanel').isVisible(),true);
  assert.match(await page.locator('#deviceTitle').textContent(),/MCB/);
  assert.equal(await page.evaluate(()=>LIVE.inp.mcb),false);
  const relay=await page.evaluate(()=>{const d=deviceCatalog().find(d=>d.name==='R1');return{x:d.box.x+15,y:d.box.y+37}});
  // Close the panel so the second click reaches the work board.
  await page.locator('#deviceClose').click(); await clickWorld(relay.x,relay.y);
  assert.match(await page.locator('#deviceTitle').textContent(),/R1/);
  assert.equal(await page.evaluate(()=>JSON.stringify({inst:S.inst,plug:S.plug,wires:S.wires})),before);
  assert.equal(await page.evaluate(()=>UI.carry),null);
});

test('all installed devices expose their terminal map and supported live state', async () => {
  await fullState();
  const items=await page.evaluate(()=>deviceCatalog().map(d=>({key:d.key,name:d.name,rows:deviceTerminalRows(d).length})));
  assert.ok(items.length>25);
  for (const d of items) {
    await page.evaluate(key=>openDevicePanel(key),d.key);
    assert.equal(await page.locator('#devicePins tbody tr').count(),d.rows,d.name);
    assert.ok((await page.locator('#deviceTitle').textContent()).startsWith(d.name),d.name);
    assert.equal(await page.locator('#deviceLive').isVisible(),true,d.name);
  }
  await page.evaluate(()=>openDevicePanel(deviceCatalog().find(d=>d.type==='fuse').key));
  assert.match(await page.locator('#deviceLive').textContent(),/퓨즈 2개가 정상이에요/);
  await page.evaluate(()=>{const d=deviceCatalog().find(d=>d.type==='fuse');S.fuses[d.id][0]='f5x';liveStep(0)});
  assert.match(await page.locator('#deviceLive').textContent(),/퓨즈가 끊어졌어요/);
});

test('board contact overlay is removed and device inspector remains available after exam submission', async () => {
  await fullState();
  // A legacy saved preference must not bring the deleted overlay back.
  await page.evaluate(()=>{SET.contacts=true;setSave();save();});
  await page.reload(); await page.waitForFunction(()=>window.SIM);
  await page.locator('[data-home="free"]').click();
  assert.equal(await page.locator('#btnContacts, #contactMarks').count(),0);
  await page.locator('#btnSet').click();
  assert.equal(await page.locator('[data-set="contacts"]').count(),0);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{liveDown('mcb');liveDown('pb1');liveRelease();});
  assert.equal(await page.locator('#contactMarks').count(),0);
  await page.evaluate(()=>{const st=pClone(S);st.exam={on:true};setMode('exam',st);openDevicePanel('inst:i7');});
  assert.equal(await page.locator('[data-tool="inspect"]').count(),0);
  assert.equal(await page.locator('#devicePanel').isHidden(),true);
  await page.evaluate(()=>{S.exam.on=false;S.exam.done=true;renderAll();openDevicePanel(deviceCatalog().find(d=>d.name==='R1').key);});
  assert.equal(await page.locator('#devicePanel').isVisible(),true);
  assert.equal(await page.locator('#btnContacts, #contactMarks').count(),0);
});

test('device panel fits mobile screen and closes with Escape and mode changes', async () => {
  await page.setViewportSize({width:390,height:844});await fullState();
  await page.evaluate(()=>openDevicePanel(deviceCatalog().find(d=>d.name==='T1').key));
  const b=await page.locator('#devicePanel').boundingBox();assert.ok(b.x>=0 && b.x+b.width<=390);
  await page.locator('#deviceSelect').selectOption('op:hmi');assert.match(await page.locator('#deviceTitle').textContent(),/HMI/);
  await page.locator('#deviceSelect').press('Escape');assert.equal(await page.locator('#devicePanel').isHidden(),true);
  await page.evaluate(()=>{openDevicePanel(deviceCatalog().find(d=>d.name==='R1').key);showHome();});
  assert.equal(await page.locator('#devicePanel').isHidden(),true);
});

test('beginner guide introduces the job and current state while hiding pin jargon for every device', async () => {
  await fullState();
  const keys=await page.evaluate(()=>deviceCatalog().map(d=>d.key));
  for(const key of keys) {
    await page.evaluate(key=>openDevicePanel(key),key);
    assert.ok((await page.locator('#devicePurpose').textContent()).length>10,key);
    assert.ok((await page.locator('#deviceLive .device-now strong').textContent()).length>3,key);
    assert.equal(await page.locator('#deviceDetails').getAttribute('open'),null,key);
    assert.equal(await page.locator('#devicePins').isVisible(),false,key);
    assert.equal(await page.locator('#deviceSpec').isVisible(),false,key);
    const basic=await page.locator('#deviceLive').innerText();
    assert.doesNotMatch(basic,/COM|NC|NO|코일|a접점|b접점|순시접점|한시접점/,key);
  }
});

test('timer lesson shows three steps and progress corresponding to actual wait time', async () => {
  await fullState();
  await page.evaluate(()=>{openDevicePanel(deviceCatalog().find(d=>d.name==='T1').key);LIVE.inp.mcb=true;LIVE.inp.ss='M';LIVE.pack=CONV.s1;liveStep(0);liveStep(.5)});
  assert.match(await page.locator('#deviceLive .timer-steps .current').innerText(),/시간 기다리기/);
  assert.equal(await page.locator('#deviceLive progress').getAttribute('max'),'2');
  assert.equal(await page.locator('#deviceLive progress').getAttribute('value'),'0.5');
  await page.evaluate(()=>liveStep(1.5));
  assert.match(await page.locator('#deviceLive .timer-steps .current').innerText(),/스위치 바꾸기/);
  assert.equal(await page.locator('#deviceLive progress').getAttribute('value'),'2');
  await page.evaluate(()=>{LIVE.inp.mcb=false;liveStep(0)});
  assert.match(await page.locator('#deviceLive .timer-steps .current').innerText(),/신호 받기/);
  assert.equal(await page.locator('#deviceLive progress').getAttribute('value'),'0');
});

test('beginner guide stays readable in narrow dark screen and details remain optional', async () => {
  await page.setViewportSize({width:360,height:800});await page.emulateMedia({colorScheme:'dark'});await fullState();
  await page.evaluate(()=>openDevicePanel(deviceCatalog().find(d=>d.name==='R3').key));
  const b=await page.locator('#devicePanel').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=360);
  assert.equal(await page.locator('#devicePanel').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.equal(await page.locator('#deviceLive svg').isVisible(),true);
  await page.locator('#deviceDetails summary').click();
  await page.locator('#deviceAdvancedLive svg').waitFor();
  assert.equal(await page.locator('#devicePins').isVisible(),true);
  assert.match(await page.locator('#deviceAdvancedLive').textContent(),/9–1 닫힘/);
  await page.locator('#deviceSelect').selectOption('op:hmi');
  assert.equal(await page.locator('#deviceDetails').getAttribute('open'),null);
  assert.match(await page.locator('#devicePurpose').textContent(),/터치패널/);
});

async function remapTB(map) {
  await page.evaluate(map => {
    const remap = id => id.replace(/^TB\.(\d+)\./, (_, n) => `TB.${map[n] || n}.`);
    S.wires = S.wires.map(w=>({...w,a:remap(w.a),b:remap(w.b)}));
    S.convLeads = Object.fromEntries(Object.entries(S.convLeads).map(([k,t])=>[k,remap(t)]));
    S.cables = {...S.cables,powerTerms:powerTerms(S.cables).map(remap)};
    S.tbLabels = Array.from({length:TB_N},(_,i)=>tbLabel(i+1));
    const old=[...S.tbLabels];for(let n=1;n<=TB_N;n++) S.tbLabels[(map[n]||n)-1]=old[n-1];
    buildTerms();renderAll();
  }, map);
}
async function functionalResults() {
  return page.evaluate(()=>({
    checks:Object.entries(getChecks().res).filter(([,v])=>!v.ok).map(([k])=>k),
    judge:Object.entries(getJudge().res).filter(([,v])=>!v.ok).map(([k])=>k),
    operationPoints:scoreSheet().rows.filter(r=>r.no&&r.no.startsWith('2-')).reduce((n,r)=>n+r.got,0)
  }));
}

test('moving S+ one terminal left works in actual live operation and both functional inspections', async () => {
  await fullState();await remapTB({'18':19,'19':18});
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
  const live=await page.evaluate(()=>{LIVE.inp.mcb=true;LIVE.inp.ss='M';LIVE.pack=CONV.s1;liveStep(0);for(let n=0;n<41;n++)liveStep(.05);return{forward:LIVE.out.FR,lamp:LIVE.out.GL,lead:S.convLeads['S+']}});
  assert.equal(live.forward,true);assert.equal(live.lamp,true);assert.equal(live.lead,'TB.18.b');
});

test('reversing all 40 terminal positions including power inputs preserves electrical behavior', async () => {
  await fullState();await remapTB(Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,40-i])));
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
  assert.deepEqual(await page.evaluate(()=>powerTerms(S.cables)),['TB.40.b','TB.39.b']);
  assert.equal(await page.evaluate(()=>mixesACDC('SMPS.G2','TB.1.t')),false,'former power terminal can now carry a DC signal');
  assert.equal(await page.evaluate(()=>mixesACDC('SMPS.G2','TB.40.t')),true,'actual power input is still AC');
});

test('changing labels cannot rescue a disconnected sensor supply and changing leads invalidates cached checks', async () => {
  await fullState();const before=await functionalResults();assert.deepEqual(before.checks,[]);
  await page.evaluate(()=>{S.tbLabels[17]='S+';S.tbLabels[18]='';S.convLeads['S+']='TB.18.b';buildTerms()});
  const broken=await functionalResults();assert.ok(broken.checks.length>0);assert.ok(broken.judge.length>0);assert.ok(broken.operationPoints<18);
  await page.evaluate(()=>{S.convLeads['S+']='TB.19.b'});
  assert.deepEqual(await functionalResults(),before);
});

test('swapping relay roles and timer roles is accepted when actual behavior is equivalent', async () => {
  await fullState();
  await page.evaluate(()=>{
    const remap=id=>id.replace(/^(R3|R6|T1|T3)\./,(_,d)=>({R3:'R6',R6:'R3',T1:'T3',T3:'T1'})[d]+'.');
    S.wires=S.wires.map(w=>({...w,a:remap(w.a),b:remap(w.b)}));
    const nm=names(),t1=S.inst.find(i=>nm[i.id]==='T1'),t3=S.inst.find(i=>nm[i.id]==='T3');
    [S.tset[t1.id],S.tset[t3.id]]=[S.tset[t3.id],S.tset[t1.id]];buildTerms();renderAll();
  });
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
});

test('terminal labels edit, clear, escape HTML, update search and survive save/reload without rewiring', async () => {
  await fullState();const before=await page.evaluate(()=>JSON.stringify({w:S.wires,l:S.convLeads,c:S.cables,j:judgeKey()}));
  await page.locator('#btnTBLabels').click();
  await page.locator('[data-tb-label="18"]').fill('내 센서 +');await page.locator('[data-tb-label="19"]').fill('');
  await page.locator('[data-tb-label="20"]').fill('<img src=x>');
  await page.locator('[data-act="tb-label-save"]').click();
  assert.equal(await page.evaluate(()=>JSON.stringify({w:S.wires,l:S.convLeads,c:S.cables,j:judgeKey()})),before);
  assert.equal(await page.evaluate(()=>TERM['TB.18.t'].lab),'내 센서 +');
  assert.equal(await page.evaluate(()=>TERM['TB.19.t'].lab),'');
  assert.equal(await page.evaluate(()=>searchTerms('내 센서').length),2);
  assert.equal(await page.locator('#gWorld img').count(),0);
  await page.reload();await page.waitForFunction(()=>window.SIM);
  assert.equal(await page.evaluate(()=>tbLabel(18)),'내 센서 +');assert.equal(await page.evaluate(()=>tbLabel(19)),'');
});

test('label tool opens the physical white terminal label and cancel leaves data untouched', async () => {
  await fullState();await page.evaluate(()=>{setTool('label');fitPanel()});
  const p=await page.evaluate(()=>{const i=tbInst();return{x:tbTermX(i,18),y:devY(i)+21}});
  await clickWorld(p.x,p.y);assert.equal(await page.locator('[data-tb-label="18"]').isVisible(),true);
  await page.locator('[data-tb-label="18"]').fill('취소할 글씨');await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>tbLabel(18)), '');
});

test('power cable can be placed at two arbitrary lower terminals and drawing follows their positions', async () => {
  await fullState();await page.evaluate(()=>{S.cables.power=false;S.tbCover=false;UI.carry={kind:'cable',key:'power',from:'tray',count:1};fitPanel();});
  const p=await page.evaluate(()=>{const i=tbInst();return [7,17].map(n=>({x:tbTermX(i,n),y:devY(i)+34}))});
  await clickWorld(p[0].x,p[0].y);assert.equal(await page.evaluate(()=>S.cables.power),false);
  await clickWorld(p[1].x,p[1].y);
  assert.deepEqual(await page.evaluate(()=>powerTerms(S.cables)),['TB.7.b','TB.17.b']);
  assert.equal(await page.evaluate(()=>S.cables.power),true);
  assert.ok(await page.evaluate(()=>{const p={x:TERM['TB.7.b'].x,y:TERM['TB.7.b'].y+10};return cableAt(p)==='power'}));
  assert.equal(await page.evaluate(()=>cableAt({x:TERM['TB.12.b'].x,y:TERM['TB.12.b'].y+10})),null);
  const bad=await functionalResults();assert.ok(bad.judge.length>0,'new source without rewiring must not magically power the old circuit');
});

test('alternative wire list is informational and never marks a nonexample pair wrong', async () => {
  await fullState();await remapTB({'18':19,'19':18});
  await page.locator('#btnWires').click();
  assert.equal(await page.locator('.wl li.bad').count(),0);
  assert.doesNotMatch(await page.locator('#modalCard').textContent(),/정답 배선에 없|예시 배선에 없/);
});

test('legacy saves without custom labels or source endpoints retain the original wiring', async () => {
  await fullState();await page.evaluate(()=>{delete S.tbLabels;delete S.cables.powerTerms;save()});
  await page.reload();await page.waitForFunction(()=>window.SIM);
  assert.equal(await page.evaluate(()=>tbLabel(19)),'S+');
  assert.deepEqual(await page.evaluate(()=>powerTerms(S.cables)),['TB.1.b','TB.2.b']);
  assert.deepEqual((await functionalResults()).checks,[]);
});

test('custom labels support undo and actual AC short detection follows the moved source', async () => {
  await fullState();await page.locator('#btnTBLabels').click();await page.locator('[data-tb-label="18"]').fill('사용자 이름');
  await page.waitForTimeout(60); // Delayed modal autofocus must not steal the edited field.
  assert.equal(await page.locator('[data-tb-label="18"]').evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-act="tb-label-save"]').click();
  assert.equal(await page.evaluate(()=>tbLabel(18)),'사용자 이름');
  await page.evaluate(()=>{closeModal();undo()});assert.equal(await page.evaluate(()=>tbLabel(18)),'');
  await remapTB({'1':39,'39':1,'2':40,'40':2});
  const r=await page.evaluate(()=>{
    const wires=[...S.wires,{a:'TB.39.t',b:'TB.40.t'}];
    return evalOnce(staticLinks(wires),newSim(),{...LIVE.inp,mcb:false,cab:S.cables,fuses:fuseState(),leads:convLeads(),plug:plugMap()}).acShort;
  });
  assert.equal(r,true);
});

test('power selection rejects the same terminal twice and escape cancels a partial cable', async () => {
  await fullState();await page.evaluate(()=>{S.cables.power=false;S.tbCover=false;UI.carry={kind:'cable',key:'power',from:'tray',count:1};fitPanel()});
  const p=await page.evaluate(()=>({x:tbTermX(tbInst(),7),y:devY(tbInst())+34}));
  await clickWorld(p.x,p.y);await clickWorld(p.x,p.y);
  assert.equal(await page.evaluate(()=>S.cables.power),false);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>!!UI.powerStart),false);
  assert.equal(await page.evaluate(()=>UI.carry),null);
});

test('lamp wires enter from the left with parallel ferrules, including tied and bundled layouts', async () => {
  await fullState();
  const result = await page.evaluate(() => {
    const failures=[];let checked=0;
    for(const helical of [0,1,2]) for(const tied of [false,true]) {
      const ties=S.ties;S.helical=helical;if(!tied)S.ties=[];buildTerms();
      for(const [i,w] of S.wires.entries()) for(const end of ['a','b']) {
        const t=TERM[w[end]];if(!t?.entrySide)continue;
        const points=wirePts(w,i), p=end==='a'?points:[...points].reverse(), first=p[0];
        const next=p.find(q=>Math.hypot(q[0]-first[0],q[1]-first[1])>.5);
        if(!next || next[0]>=first[0] || Math.abs(next[1]-first[1])>1e-6 || Math.abs(first[0]-t.x)>1e-6 || !p.every(q=>q.every(Number.isFinite))) failures.push({helical,tied,id:t.id});
        let length=0;
        for(let k=1;k<p.length;k++) {length+=Math.hypot(p[k][0]-p[k-1][0],p[k][1]-p[k-1][1]);if(length<OP_LAMP_LEAD-1e-6 && Math.abs(p[k][1]-first[1])>1e-6)failures.push({helical,tied,id:t.id,bentAtPin:true});}
        checked++;
      }
      S.ties=ties;
    }
    const offsets=TERMS.filter(t=>t.entrySide&&S.wires.filter(w=>w.a===t.id||w.b===t.id).length===2).map(t=>S.wires.filter(w=>w.a===t.id||w.b===t.id).map(w=>{const p=basePts(w,S.wires.indexOf(w));return(w.a===t.id?p[0]:p.at(-1))[1]-t.y}));
    return{failures,checked,offsets};
  });
  assert.deepEqual(result.failures,[]);assert.ok(result.checked>=60);
  assert.ok(result.offsets.length>0);for(const ys of result.offsets)assert.ok(Math.min(...ys)<0&&Math.max(...ys)>0,'two wires stack vertically beside the same screw');
});

test('new lamp entry geometry preserves wiring, grading, and front/rear terminal mirroring', async () => {
  await fullState();
  const before=await page.evaluate(()=>JSON.stringify(S.wires));
  const rear=await functionalResults();assert.deepEqual(rear,{checks:[],judge:[],operationPoints:18});
  await page.evaluate(()=>{S.opBack=false;buildTerms();renderAll()});
  const flipped=await page.evaluate(()=>{
    const front=opFrontTerms(),id='OP.GL.+',w=S.wires.find(w=>w.a===id||w.b===id),points=basePts(w,S.wires.indexOf(w),front),p=w.a===id?points:[...points].reverse();
    return{side:front[id].entrySide,dx:p[1][0]-p[0][0],dy:p[1][1]-p[0][1]};
  });
  assert.equal(flipped.side,1);assert.ok(flipped.dx>0);assert.equal(flipped.dy,0);
  await page.reload();await page.waitForFunction(()=>window.SIM);
  // Persist through the ordinary save flow, without any geometry stored in wire data.
  await fullState();await page.evaluate(()=>save());await page.reload();await page.waitForFunction(()=>window.SIM);
  assert.equal(await page.evaluate(()=>JSON.stringify(S.wires)),before);
  assert.deepEqual(await functionalResults(),rear);
});

test('pointer bursts draw once per animation frame and keep the final pointer position', async () => {
  await fullState();
  const r=await page.evaluate(async()=>{
    const original=renderOver;let calls=0;renderOver=(...args)=>{calls++;return original(...args)};
    const box=svg.getBoundingClientRect();
    for(let i=0;i<80;i++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:box.left+40+i,clientY:box.top+50,pointerId:1,pointerType:'mouse',bubbles:true}));
    const before=calls;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const pointer={...UI.pointer};renderOver=original;
    return{before,calls,pointer,expected:toWorld(box.left+119,box.top+50)};
  });
  assert.equal(r.before,0);assert.equal(r.calls,1);assert.deepEqual(r.pointer,r.expected);
});

test('unchanged pointer overlays retain SVG nodes and reuse wire geometry', async () => {
  await fullState();
  const result=await page.evaluate(async()=>{
    UI.overBoard=true;UI.pointer={x:2000,y:2000};renderOver();
    const node=gOver.firstChild,original=calculateBasePts;let calculations=0,mutations=0;
    calculateBasePts=(...args)=>{calculations++;return original(...args)};
    const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(gOver,{childList:true});
    for(let i=0;i<30;i++)renderOver();
    await new Promise(resolve=>setTimeout(resolve,0));observer.disconnect();calculateBasePts=original;
    return{calculations,mutations,same:node===gOver.firstChild};
  });
  assert.deepEqual(result,{calculations:0,mutations:0,same:true});
});

test('cached wire paths refresh after rewiring, undo, and tie movement', async () => {
  await fullState();
  const r=await page.evaluate(()=>{
    const before=JSON.stringify(S.wires),w=S.wires.find(w=>w.a==='TB.14.b'&&w.b==='OP.GL.+'),i=S.wires.indexOf(w),old=wirePts(w,i);
    snap();w.a='TB.18.b';commit();const moved=wirePts(w,i);
    const changed=JSON.stringify(old)!==JSON.stringify(moved),nearNew=Math.abs(moved[0][0]-TERM['TB.18.b'].x)<4;
    undo();const restored=JSON.stringify(S.wires)===before;
    const t=S.ties[0];tieToNew(t);const g0=tieGeo(t),linked=S.wires.find(w=>w.a===t.ws[0].a&&w.b===t.ws[0].b),j=S.wires.indexOf(linked),p0=JSON.stringify(wirePts(linked,j));
    let reason='';for(const delta of [[3,0],[-3,0],[0,3],[0,-3]]) {
      reason=tieDrag({t,c0:{...t.c},p0:{x:0,y:0},rank:g0.rank},{x:delta[0],y:delta[1]});if(!reason)break;
    }
    renderWorld();const tieMoved=p0!==JSON.stringify(wirePts(linked,j));
    return{changed,nearNew,restored,reason,tieMoved};
  });
  assert.deepEqual(r,{changed:true,nearNew:true,restored:true,reason:'',tieMoved:true});
});

test('optimized polyline projection matches exhaustive segment search', async () => {
  await fullState();
  const diff=await page.evaluate(()=>{
    const reference=(pts,p)=>{let best=null,bd=Infinity,acc=0;for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),t=l?clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/(l*l),0,1):0,x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best={x,y,dist:d,s:acc+t*l}}acc+=l;}return best};
    const failures=[];let count=0;
    const paths=[[[0,0],[0,0],[10,0],[10,10]],...S.wires.filter((_,i)=>i%4===0).map(w=>wirePts(w,S.wires.indexOf(w)))];
    for(const pts of paths)for(let i=0;i<20;i++) {
      const p={x:(i*173.43+19)%1250,y:(i*97.37+53)%1050},a=reference(pts,p),b=projOn(pts,p);count++;
      if(['x','y','s','dist'].some(k=>Math.abs(a[k]-b[k])>1e-6))failures.push({p,a,b});
    }
    return{count,failures};
  });
  assert.ok(diff.count>500);assert.deepEqual(diff.failures,[]);
});

test('pointer cancel clears a pending selection rectangle without a stale next-frame draw', async () => {
  await fullState();
  const r=await page.evaluate(async()=>{
    const b=svg.getBoundingClientRect();S.tool='dress';UI.overBoard=true;UI.gesture={type:'dbox',moved:true,p0:toWorld(b.left+20,b.top+20)};
    svg.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+80,clientY:b.top+80,pointerId:1,pointerType:'mouse',bubbles:true}));
    svg.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true}));
    const html=gOver.innerHTML;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return{gesture:UI.gesture,pending:overlayFrame,stable:html===gOver.innerHTML};
  });
  assert.deepEqual(r,{gesture:null,pending:0,stable:true});
});

test('side-entry lamp connections approach directly without a vertical reversal near the pin', async () => {
  await fullState();
  const result=await page.evaluate(()=>{
    const failed=[];let checked=0;
    for(const helical of [1,2]) {
      S.helical=helical;buildTerms();
      for(const [i,w] of S.wires.entries())for(const end of ['a','b']) {
        const t=TERM[w[end]],other=TERM[w[end==='a'?'b':'a']];
        if(!t?.entrySide || t.k!=='+' || other.entrySide)continue;
        const pts=calculateBasePts(w,i),p=(end==='a'?pts:[...pts].reverse()).slice(0,16),direction=Math.sign(p.at(-1)[1]-p[0][1]);
        let reversed=false;for(let k=1;k<p.length;k++)if((p[k][1]-p[k-1][1])*direction < -1e-6)reversed=true;
        if(reversed)failed.push({helical,id:t.id,wire:[w.a,w.b]});checked++;
      }
    }
    return{failed,checked};
  });
  assert.ok(result.checked>=10);assert.deepEqual(result.failed,[]);
});

test('older lamp ties migrate onto the new route once, including a save viewed from the front', async () => {
  const fixture=require('./fixtures/lamp-ties-2.5.2.json');
  for(const back of [true,false]) {
    await fullState();
    const result=await page.evaluate(({fixture,back})=>{
      const st=pClone(S);st.ties=pClone(fixture.ties);delete st.lampRouteV;st.opBack=back;
      const wires=JSON.stringify(st.wires);setMode('free',st);effects();buildTerms();
      const first=JSON.stringify(S.ties),score=scoreSheet().total;fixState();
      return{ties:nTies(),cut:nTieCut(),score,view:S.opBack,unchangedWires:wires===JSON.stringify(S.wires),stable:first===JSON.stringify(S.ties),version:S.lampRouteV};
    },{fixture,back});
    assert.deepEqual(result,{ties:12,cut:12,score:30,view:back,unchangedWires:true,stable:true,version:1});
  }
});

test('quiz bank serves all one hundred questions without repeats, locks answers and explains every answer', async () => {
  const before = await page.evaluate(() => JSON.stringify(S));
  await page.locator('[data-home="quiz"]').click();
  const ids=[];
  for(let n=0;n<200;n++) {
    const info=await page.evaluate(()=>({id:QZ.current.id,right:QZ.choices.findIndex(a=>a.correct),count:QUIZ_BANK.length}));
    assert.equal(info.count,100); ids.push(info.id);
    const answer=n%2===0?info.right:(info.right+1)%4;
    await page.locator(`[data-answer="${answer}"]`).click();
    assert.equal(await page.locator('.qz-choice:disabled').count(),4);
    assert.equal(await page.locator('.qz-choice.is-correct').count(),1);
    assert.ok((await page.locator('#qzFeedback').textContent()).length>20);
    await page.evaluate(()=>quizAct('qz-answer',{dataset:{answer:'0'}}));
    assert.equal(await page.evaluate(()=>QZ.solved),n+1,'double answer must not count');
    await page.locator('[data-home="qz-next"]').click();
  }
  assert.equal(new Set(ids.slice(0,100)).size,100); assert.equal(new Set(ids.slice(100)).size,100);
  assert.notEqual(ids[99],ids[100]);
  assert.equal(await page.evaluate(()=>QZ.correct),100);
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),before,'quiz must not modify the simulation');
  assert.equal(await page.locator('button').filter({hasText:'틀린 문제'}).count(),0);
});

test('task quiz categories cover tool identification, materials and working methods', async () => {
  await page.locator('[data-home="quiz"]').click();
  for(const [category,count] of [['공구',20],['기구·재료',20],['설치·가공',15],['전선·배선',20],['동작·진단',15],['안전·마무리',10]]) {
    await page.locator(`[data-category="${category}"]`).click();
    const seen=[];
    for(let i=0;i<count;i++) {
      const info=await page.evaluate(()=>({id:QZ.current.id,cat:QZ.current.cat,right:QZ.choices.findIndex(a=>a.correct),scene:QZ.current.scene}));
      assert.equal(info.cat,category); seen.push(info.id);
      assert.equal(await page.locator('[data-home="qz-next"]').count(),0);
      await page.locator(`[data-answer="${info.right}"]`).click();
      if(info.scene.art) {
        assert.equal(await page.locator('.qz-art svg').count(),1);
        assert.match(await page.locator('.qz-art figcaption').textContent(),/실제 사진 아님/);
        const answer=await page.evaluate(()=>QZ.current.answers[0]);
        assert.ok((await page.locator('.qz-art figcaption').textContent()).includes(answer));
      }
      assert.ok((await page.locator('.qz-ref').textContent()).length>10);
      await page.locator('[data-home="qz-next"]').click();
    }
    assert.equal(new Set(seen).size,count);
    assert.equal(await page.evaluate(()=>QZ.solved),count);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.hm-card').count(),6);
});

test('quiz remains readable on a narrow screen and supports keyboard answers', async () => {
  await page.setViewportSize({width:360,height:740});
  await page.locator('[data-home="quiz"]').click();
  for(const cat of ['공구','기구·재료','설치·가공','전선·배선','동작·진단','안전·마무리']) {
    await page.locator(`[data-category="${cat}"]`).click();
    await page.locator('[data-answer="0"]').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='qzFeedback');
    assert.equal(await page.evaluate(()=>document.querySelector('#home').scrollWidth<=innerWidth),true);
    await page.locator('[data-home="qz-next"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'qzQuestion');
  }
  await page.locator('[data-home="main"]').click();
  assert.equal(await page.locator('.hm-card.quiz').count(),1);
});


test('tool illustrations load offline without exposing the answer before selection', async () => {
  await page.route('https://**/*',route=>route.abort());
  await page.locator('[data-home="quiz"]').click();
  await page.locator('[data-category="공구"]').click();
  // These ten identification questions have no text answer outside the choices.
  for(let i=1;i<=10;i++) {
    await page.evaluate(id=>{QZ.current=QUIZ_BANK.find(q=>q.id===id);QZ.selected=null;QZ.choices=quizShuffle(QZ.current.answers.map((text,i)=>({text,correct:i===0})));renderHome();},i);
    const picture=page.locator('.qz-art svg');
    assert.equal(await picture.count(),1);
    assert.ok(await picture.locator('path').count()>0);
    assert.equal(await picture.locator('image').count(),0,'no remote picture dependency');
    const answer=await page.evaluate(()=>QZ.current.answers[0]);
    assert.ok(!(await page.locator('.qz-art').textContent()).includes(answer));
    assert.ok(!(await picture.getAttribute('aria-label')).includes(answer));
    await page.locator('[data-answer="0"]').click();
    assert.ok((await page.locator('.qz-art figcaption').textContent()).includes(answer));
    await page.locator('[data-home="qz-next"]').click();
  }
});


test('reviewed quiz conditions and concept diagrams are explicit and stable', async () => {
  const data=await page.evaluate(()=>QUIZ_BANK.map(q=>({id:q.id,q:q.q,cat:q.cat,choices:q.answers,conditions:q.conditions||'',ex:q.ex,scene:q.scene})));
  assert.deepEqual(data.map(q=>q.id),Array.from({length:100},(_,i)=>i+1));
  for(const q of data) assert.equal(new Set(q.choices).size,4,`four distinct choices: ${q.id}`);
  for(const id of [76,77,78]) {
    const q=data[id-1];assert.match(q.conditions,/공통선/);assert.match(q.conditions,/우회/);assert.match(q.conditions,/비유지형/);
  }
  assert.match(data[78].choices[0],/제어전원/);assert.match(data[78].choices[0],/공통선/);
  assert.match(data[86].q,/전원 투입형·비유지형/);assert.match(data[86].q,/완전히 초기화/);
  assert.match(data[90].ex,/전후/);assert.match(data[90].ex,/검증된 전압원/);
  assert.match(data[59].q,/옆으로/);assert.match(data[59].ex,/앞끝/);
  await page.locator('[data-home="quiz"]').click();
  for(const [id,expected] of [[29,'KACON'],[30,'TIMER']]) {
    const text=await page.evaluate(id=>{const q=QUIZ_BANK.find(q=>q.id===id);const el=document.createElement('div');el.innerHTML=quizScene(q);return el.textContent;},id);
    assert.match(text,new RegExp(expected),'device body, not just an empty socket');
  }
  await page.setViewportSize({width:360,height:740});
  for(const id of [43,44,59,60,61,66,71,76,77,78,86,87,97]) {
    await page.evaluate(id=>{QZ.current=QUIZ_BANK.find(q=>q.id===id);QZ.selected=null;QZ.choices=QZ.current.answers.map((text,i)=>({text,correct:i===0}));renderHome();},id);
    assert.equal(await page.locator('.qz-art svg').count(),1);
    assert.equal(await page.evaluate(()=>document.querySelector('#home').scrollWidth<=innerWidth),true,`mobile width: ${id}`);
    if([76,77,78,86,87].includes(id)) {
      assert.ok((await page.locator('.qz-conditions').textContent()).length>35);
      assert.match(await page.locator('.qz-art figcaption').textContent(),/개념도/);
    }
  }
  const links=await page.evaluate(()=>{QZ.current=QUIZ_BANK.find(q=>q.id===91);QZ.selected=0;renderHome();return [...document.querySelectorAll('.qz-sources a')].map(a=>({href:a.href,rel:a.rel}));});
  assert.equal(links.length,2);for(const a of links){assert.ok(a.href.startsWith('https://'));assert.match(a.rel,/noopener/);}
});

test('helical covering pins wires while ties move exposed tails in either endpoint direction', async () => {
  for(const phase of ['partial','wrapped','duct'])for(const reverse of [false,true]) {
    await fullState();
    const result=await page.evaluate(({phase,reverse})=>{
      S.helical=phase==='duct'?2:phase==='wrapped'?1:0;S.hcov=phase==='partial'?.5:0;UI.hcovLive=null;
      S.hgath=S.wires.filter(isExtWire).map(w=>pairKey(w.a,w.b));S.ties=[];
      if(reverse)S.wires=S.wires.map(w=>isExtWire(w)?{...w,a:w.b,b:w.a}:w);
      buildTerms();invalidateWireGeometry();
      const wires=JSON.stringify(S.wires),ws=S.wires.filter(isExtWire).slice(0,2);
      const paths=ws.map(w=>{const i=S.wires.indexOf(w),p=basePts(w,i);return {w,i,p,L:pathLen(p),fixed:wireFixedRanges(w,i,p)[0]};});
      for(const which of ['op','panel']) {
        const anchors=paths.map(o=>{
          const side=(which==='op')===opStart(o.w)?'before':'after';
          const edge=side==='before'?o.fixed[0]:o.fixed[1],room=side==='before'?edge:o.L-edge;
          if(room<65)return null;
          const s=edge+(side==='before'?-35:35),a=ptAtS(o.p,s);
          return {a:o.w.a,b:o.w.b,f:s/o.L,x:a.x,y:a.y};
        });
        if(anchors.some(a=>!a))continue;
        S.ties.push({ws:anchors,state:'cut',c:{x:anchors.reduce((s,a)=>s+a.x,0)/2+25,y:anchors.reduce((s,a)=>s+a.y,0)/2+15},u:{x:1,y:0}});
      }
      invalidateWireGeometry();let drift=0,moved=0,seams=0;
      for(const o of paths) {
        const pts=wirePts(o.w,o.i);let s=0;
        for(let k=0;k<o.p.length;k++) {
          if(k)s+=Math.hypot(o.p[k][0]-o.p[k-1][0],o.p[k][1]-o.p[k-1][1]);
          if(s>=o.fixed[0] && s<=o.fixed[1])drift=Math.max(drift,projOn(pts,{x:o.p[k][0],y:o.p[k][1]}).dist);
        }
        for(const edge of o.fixed)seams=Math.max(seams,projOn(pts,ptAtS(o.p,edge)).dist);
        for(const p of pts)moved=Math.max(moved,projOn(o.p,{x:p[0],y:p[1]}).dist);
      }
      return {drift,moved,seams,ties:S.ties.length,unchanged:JSON.stringify(S.wires)===wires};
    },{phase,reverse});
    assert.ok(result.ties>0,`${phase}: exercise a tie`);
    assert.ok(result.drift<1e-6,`${phase}, reversed=${reverse}: band drift ${result.drift}`);
    assert.ok(result.seams<1e-6,`${phase}: unchanged band exit`);
    assert.ok(result.moved>5,`${phase}: uncovered tail still moves`);
    assert.equal(result.unchanged,true);
  }
});
