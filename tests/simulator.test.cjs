const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

let server, browser, context, page, origin, errors;
before(async () => {
  const html = await readFile(require('node:path').join(__dirname, '..', 'index.html'));
  const legacyEntry = await readFile(require('node:path').join(__dirname, '..', 'lab-3d.html'));
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const data = pathname === '/lab-3d.html' ? legacyEntry : ['/', '/index.html'].includes(pathname) ? html : null;
    if (!data) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext(); context.setDefaultTimeout(15000); // Allow shared runners time to initialize the full board.
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
  assert.equal(await page.locator('#inspectionMarks .inspect-wire').count(), 2, 'the actual R source lead is also traced');
  assert.ok(await page.evaluate(()=>tracedTermIds('PLC.P20').has('PWR.R')));
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
  // Freeze work time in the menu before taking the snapshot; beforeunload saves again.
  const saved = await page.evaluate(() => { showHome(); save(); return { state: JSON.parse(localStorage.getItem(STORE)), score: scoreSheet().total }; });
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
  const p = await page.evaluate(({x,y}) => { const r = svg.getBoundingClientRect(),p=projectWorkPoint({x,y}); return { x:r.left+(p.x-UI.cam.x)/UI.cam.w*r.width, y:r.top+(p.y-UI.cam.y)/UI.cam.h*r.height }; }, {x,y});
  await page.mouse.click(p.x,p.y);
}

test('elevated faces move around fixed bases and their wire terminal hardware stays aligned on both views',async()=>{
  await fullState();
  const result=await page.evaluate(()=>{
    hideHome();S.finished=true;UI.detail=false;renderWorld(false);
    const i=S.inst.find(i=>i.type==='smps'),r=PROJECTION.owners.get('device-'+i.id),before=JSON.stringify({...S,elapsed:0}),terms=JSON.stringify(TERMS),wire=S.wires[0],route=wirePts(wire,0),nodes=[...gWorld.children];
    const t=TERM['SMPS.L'],terminal=SCENE_PARTS.get('device-'+i.id).querySelector(`use[x="${F(t.x)}"][y="${F(t.y)}"]`),extra=[...gWorld.querySelectorAll('[data-project-at] use')].find(n=>+n.getAttribute('x')===t.x&&+n.getAttribute('y')===t.y);
    const at=n=>new DOMPoint(t.x,t.y).matrixTransform(svgLocalMatrix(n));let aligned=true,anchored=true,inverse=true;const offsets=[];
    for(const sign of [-1,1]){
      const b=r.world,w=900,h=700;UI.cam={x:b.x+b.w/2+sign*260-w/2,y:b.y+b.h/2-h/2,w,h};applyCam();offsets.push(r.tx);
      const a=at(terminal),c=at(extra);aligned&&=Math.hypot(a.x-c.x,a.y-c.y)<.04;const shown=projectWorkPoint(t),picked=unprojectWorkPoint(shown);inverse&&=Math.hypot(picked.x-t.x,picked.y-t.y)<.04;
      const baseX=sign>0?b.x+b.w:b.x,m=svgLocalMatrix(r.sideX),vertices=projectionCommands(r.sideX.getAttribute('d')).flatMap(c=>{const p=[];for(let k=0;k<c.v.length;k+=2)p.push(new DOMPoint(c.v[k],c.v[k+1]).matrixTransform(m));return p;});
      anchored&&=vertices.some(p=>Math.abs(p.x-baseX)<.04)&&Math.abs(svgLocalMatrix(r.node).e)<.001;
    }
    const moved=offsets[0]>0&&offsets[1]<0;
    return{moved,anchored,aligned,inverse,state:before===JSON.stringify({...S,elapsed:0}),terms:terms===JSON.stringify(TERMS),route:route===wirePts(wire,0),nodes:nodes.every(n=>n.isConnected)};
  });
  for(const[k,v]of Object.entries(result))assert.equal(v,true,k);
});

test('connected duct top faces meet at every junction after horizontal and vertical camera movement',async()=>{
  await fullState();
  const errors=await page.evaluate(()=>{
    hideHome();for(const[,q]of frList())q.covered=false;UI.detail=false;renderWorld(false);const errors=[];
    for(const[x,y]of [[-300,-160],[500,500]]){UI.cam={x,y,w:900,h:700};applyCam();
      for(const j of JUNC){const vertical=PROJECTION.models.find(r=>r.kind==='duct'&&r.box[0]===SLOT[j.v].x&&r.box[1]===SLOT[j.v].y),horizontal=PROJECTION.models.find(r=>r.kind==='duct'&&r.box[0]===SLOT[j.d].x&&r.box[1]===SLOT[j.d].y),p=new DOMPoint(j.id.endsWith('L')?j.x+j.w:j.x,j.y+j.h/2),a=p.matrixTransform(svgLocalMatrix(vertical.face)),b=p.matrixTransform(svgLocalMatrix(horizontal.face));if(Math.hypot(a.x-b.x,a.y-b.y)>.02)errors.push(j.id);}
    }return errors;
  });
  assert.deepEqual(errors,[]);
});

test('projected terminals and the raised MCB handle accept their visible positions after a wide pan',async()=>{
  await fullState();
  const target=await page.evaluate(()=>{hideHome();S.finished=true;S.opBack=false;S.xtbClosed={};S.tool='wire';buildTerms();renderAll();const t=TERM['XTB1.A1'];UI.cam={x:t.x-140,y:t.y-300,w:900,h:700};applyCam();return{x:t.x,y:t.y};});
  await clickWorld(target.x,target.y);assert.equal(await page.evaluate(()=>UI.pending),'XTB1.A1');
  const handle=await page.evaluate(()=>{UI.pending=null;S.tool='hand';LIVE.inp.mcb=false;renderAll();const i=S.inst.find(i=>i.type==='mcb'),b=mcbSwRect(i);UI.cam={x:i.x-35,y:devY(i)-50,w:140,h:170};applyCam();return{x:b.x+b.w-1,y:b.y+b.h/2};});
  await clickWorld(handle.x,handle.y);assert.equal(await page.evaluate(()=>LIVE.inp.mcb),true);
});

test('every fitted device and both operator-panel faces have stable relief without changing work during camera movement',async()=>{
  await fullState();
  const result=await page.evaluate(()=>{
    const missing=S.inst.filter(i=>!SCENE_PARTS.get('device-'+i.id)?.querySelector('[data-relief]')).map(i=>i.type);
    const servo=!!SCENE_PARTS.get('servo').querySelector('[data-relief]');
    const cameras=[{x:-180,y:0,w:800,h:600},{x:440,y:70,w:800,h:600}];let stable=true,front=false,back=false;
    for(const rear of [false,true]){S.opBack=rear;buildTerms();renderWorld(false);const before=JSON.stringify({...S,elapsed:0}),terms=JSON.stringify(TERMS),score=scoreSheet().total;
      const op=SCENE_PARTS.get(rear?'op-back':'op-front');if(rear)back=!!op.querySelector('[data-relief-kind="rounded-graphite"]');else front=!!op.querySelector('[data-relief-kind="round-graphite"]');
      const nodes=[...gWorld.children];for(const c of cameras){UI.cam=c;applyCam();stable&&=before===JSON.stringify({...S,elapsed:0})&&terms===JSON.stringify(TERMS)&&score===scoreSheet().total&&nodes.every(n=>n.isConnected);}
    }
    return {missing,servo,front,back,stable,glass:reliefNodes.some(r=>r.kind==='glass'),fins:reliefNodes.some(r=>r.kind==='finned')};
  });
  assert.deepEqual(result.missing,[]);for(const k of ['servo','front','back','stable','glass','fins'])assert.equal(result[k],true,k);
});

test('photo-based IO-link covers open and close at their original coordinates without changing wiring',async()=>{
  await fullState();await page.evaluate(()=>{hideHome();S.finished=true;S.opBack=false;S.tool='hand';UI.carry=null;buildTerms();renderAll();});
  const initial=await page.evaluate(()=>({terms:JSON.stringify(TERMS),wires:JSON.stringify(S.wires),devices:S.inst.filter(i=>i.type.startsWith('xtb')).map(i=>({id:i.id,type:i.type,x:i.x,y:devY(i),w:DEV[i.type].w}))}));
  for(const i of initial.devices){
    await page.evaluate(i=>fitTo({x:i.x-12,y:i.y-45,w:i.w+24,h:120}),i);
    await clickWorld(i.x+i.w/2,i.y+28);
    assert.equal(await page.evaluate(id=>S.xtbClosed[id],i.id),false);
    const body=page.locator(`[data-scene-part="device-${i.id}"]`);
    assert.equal(await body.locator('[data-xtb-terminal]').count(),i.type==='xtb40'?40:50);
    assert.equal(await body.locator('[data-xtb-lid="open"]').count(),1);
    assert.equal(await body.locator('[data-xtb-release]').count(),1);
    await clickWorld(i.x+i.w/2,i.y-15);
    assert.equal(await page.evaluate(id=>S.xtbClosed[id],i.id),true,await page.evaluate(()=>$('#toast').textContent));
    assert.equal(await body.locator('[data-xtb-lid="open"]').count(),0);
  }
  assert.deepEqual(await page.evaluate(()=>({terms:JSON.stringify(TERMS),wires:JSON.stringify(S.wires)})),{terms:initial.terms,wires:initial.wires});
  assert.deepEqual(await page.evaluate(()=>Object.entries(getChecks().res).filter(([,r])=>!r.ok).map(([id])=>id)),[]);
  await page.evaluate(()=>{showHome();save();});await page.reload();await page.waitForFunction(()=>window.SIM);
  assert.equal(await page.locator('[data-scene-part="lids"] [data-xtb-lid="closed"]').count(),2);
});

test('photo housing sides stay attached on both views and reuse their vent artwork during camera movement',async()=>{
  await fullState();
  const result=await page.evaluate(()=>{
    hideHome();S.finished=true;renderAll();
    const state=JSON.stringify({...S,elapsed:0}),terms=JSON.stringify(TERMS),rows=reliefNodes.filter(r=>PHOTO_HOUSINGS.has(r.kind));
    const nodes=rows.map(r=>[r,...r.sideArt.querySelectorAll('*')]);let attached=true,reused=true,visible=true,unmirrored=true;
    for(const sign of [-1,1])for(const offset of [217,260]){
      UI.cam={x:380+sign*offset-650,y:300+(offset===217?-140:140)-488,w:1300,h:976};applyCam();
      for(const r of rows){
        const [x,y,w,h]=r.box,dx=+r.node.dataset.sideX,dy=+r.node.dataset.sideY,ex=dx>=0?x+w:x;
        const m=svgLocalMatrix(r.sidePlane),parent=svgLocalMatrix(r.node);
        const base=new DOMPoint(ex,y+h/2).matrixTransform(parent),front=new DOMPoint(ex-dx,y+h/2-dy).matrixTransform(parent);
        const ends=[new DOMPoint(0,h/2).matrixTransform(m),new DOMPoint(50,h/2).matrixTransform(m)];
        attached&&=ends.some(p=>Math.hypot(p.x-base.x,p.y-base.y)<.01)&&ends.some(p=>Math.hypot(p.x-front.x,p.y-front.y)<.01);
        visible&&=r.sidePlane.getAttribute('display')==='inline';unmirrored&&=m.a>0;
        if(r.ratingLabel)visible&&=r.ratingLabel.getAttribute('display')===(sign<0?'inline':'none');
        if(r.capPlane){
          const ey=dy>=0?y+h:y,cm=svgLocalMatrix(r.capPlane),baseCap=new DOMPoint(x+w/2,ey).matrixTransform(parent),frontCap=new DOMPoint(x+w/2-dx,ey-dy).matrixTransform(parent);
          const capEnds=[new DOMPoint(0,w/2).matrixTransform(cm),new DOMPoint(50,w/2).matrixTransform(cm)];
          attached&&=capEnds.some(p=>Math.hypot(p.x-baseCap.x,p.y-baseCap.y)<.01)&&capEnds.some(p=>Math.hypot(p.x-frontCap.x,p.y-frontCap.y)<.01);
          visible&&=r.capPlane.getAttribute('display')==='inline'&&r.capPlane.querySelector('[data-housing-cap-top]').getAttribute('display')===(dy<0?'inline':'none');
        }
      }
      reused&&=nodes.every(([r,...children])=>children.every(n=>n.isConnected&&r.sideArt.contains(n)));
    }
    SET.relief=false;applyCam();const flat=rows.every(r=>r.node.getAttribute('display')==='none'&&r.face.getAttribute('transform')==='translate(0 0)');
    SET.relief=true;applyCam();
    return{types:rows.map(r=>r.kind).sort(),attached,reused,visible,unmirrored,flat,state:state===JSON.stringify({...S,elapsed:0}),terms:terms===JSON.stringify(TERMS)};
  });
  assert.deepEqual(result.types,['mcb','plc','servo','smps']);
  for(const[k,v]of Object.entries(result))if(k!=='types')assert.equal(v,true,k);
});

test('redrawn PLC covers still open at their displayed positions and preserve wiring and cover locks',async()=>{
  await fullState();
  await page.evaluate(()=>{hideHome();S.finished=true;S.opBack=false;S.tool='hand';UI.carry=null;S.tbCover=false;for(const[,q]of frList())q.covered=false;renderAll();});
  const initial=await page.evaluate(()=>({terms:JSON.stringify(TERMS),wires:JSON.stringify(S.wires)}));
  for(const top of [true,false]){
    await page.evaluate(()=>{const i=S.inst.find(i=>i.type==='plc');fitTo({x:i.x-25,y:devY(i)-35,w:170,h:170});});
    for(const closed of [true,false]){
      assert.equal(await page.evaluate(top=>S.plcLid[top?'t':'b'],top),closed);
      const hit=await page.evaluate(top=>{const r=plcLidRect(top);return{x:r.x+r.w/2,y:r.y+r.h/2};},top);
      await clickWorld(hit.x,hit.y);
      assert.equal(await page.evaluate(top=>S.plcLid[top?'t':'b'],top),!closed);
      const locked=await page.evaluate(top=>{const t=devTerms('plc').find(t=>t.d===(top?'up':'down'));return!!wireLock('PLC.'+t.k,'TB.1.t');},top);
      assert.equal(locked,!closed);
    }
  }
  assert.deepEqual(await page.evaluate(()=>({terms:JSON.stringify(TERMS),wires:JSON.stringify(S.wires)})),initial);
});

test('ducts and both rail lengths receive tape on the back, then mount face up and undo correctly',async()=>{
  for(const type of ['duct','ch500','ch575']){
    const target=await page.evaluate(type=>{setMode('free',newState(false));hideHome();S.marginSide='L';S.stage=1;UI.trayOpen.add('fr');renderAll();const r=type==='duct'?SLOT.d1:ROWS.find(r=>r.ch===type);return type==='duct'?{x:r.x+r.w/2,y:r.y+r.h/2,slot:r.id}:{x:300,y:r.cy,slot:r.rail};},type);
    await page.waitForTimeout(80);await page.evaluate(()=>fitTo({x:-20,y:-20,w:800,h:920}));
    await page.locator(`[data-key="${type}"]`).click();await clickWorld(380,740);
    if(await page.evaluate(()=>!!UI.carry))await page.locator(`[data-key="${type}"]`).click();
    const id=await page.evaluate(()=>S.floor.at(-1).pid);
    assert.equal(await page.locator('#gWorld [data-frame-face="back"]').count(),1);
    assert.equal(await page.locator('#gWorld [data-frame-tape]').count(),0);
    await page.locator('[data-tool="hand"]').click();await clickWorld(380,740);await clickWorld(target.x,target.y);
    assert.equal(await page.evaluate(id=>S.fr[id].stuck,id),false,'untaped back must not adhere');
    await clickWorld(380,740);await page.locator('[data-tool="tape"]').click();await clickWorld(380,740);
    assert.equal(await page.evaluate(id=>S.fr[id].taped,id),true);assert.equal(await page.locator('#gWorld [data-frame-tape="back"]').count(),1);
    await page.evaluate(()=>{showHome();save();});await page.reload();await page.waitForFunction(()=>window.SIM);
    await page.locator('[data-home="free"]').click();await page.waitForTimeout(80);await page.evaluate(()=>fitTo({x:-20,y:-20,w:800,h:920}));
    assert.equal(await page.locator('#gWorld [data-frame-tape="back"]').count(),1,'saved loose part stays back up');
    await page.locator('[data-tool="hand"]').click();await clickWorld(380,740);await clickWorld(target.x,target.y);
    assert.equal(await page.evaluate(id=>S.fr[id].slot,id),target.slot);assert.equal(await page.evaluate(id=>S.fr[id].stuck,id),true);
    assert.equal(await page.locator('#gWorld [data-frame-face="back"]').count(),0);assert.equal(await page.locator('#gWorld [data-frame-tape]').count(),0,'tape is beneath the fitted part');
    assert.ok(await page.locator('#gWorld [data-frame-face="front"]').count()>0);
    await page.evaluate(()=>undo());assert.equal(await page.evaluate(id=>S.fr[id].stuck,id),false);
    await page.evaluate(()=>undo());assert.equal(await page.locator('#gWorld [data-frame-face="back"]').count(),1);assert.equal(await page.locator('#gWorld [data-frame-tape="back"]').count(),1);
  }
});

test('broken duct junctions stay visibly open through undo and reload',async()=>{
  await fullState();
  const junctions=await page.evaluate(()=>{hideHome();S.guide=false;S.tool='hand';S.dbreak={};S.wires=[];S.helical=0;for(const[,q]of frList())q.covered=false;renderAll();return JUNC;});
  const capArea=id=>page.evaluate(id=>{
    const j=JUNC.find(j=>j.id===id),r=frRect(frList().find(([,q])=>q.slot===j.v)[1]);
    return ductToothRects(r).reduce((n,a)=>n+Math.max(0,Math.min(a.x+a.w,j.x+j.w)-Math.max(a.x,j.x))*Math.max(0,Math.min(a.y+a.h,j.y+j.h)-Math.max(a.y,j.y)),0);
  },id);
  for(const j of junctions){
    assert.ok(await capArea(j.id)>0,'unbroken wall has teeth');
    await page.evaluate(j=>fitTo({x:j.x-55,y:j.y-40,w:150,h:120}),j);
    await clickWorld(j.x+j.w/2,j.y+j.h/2);
    assert.equal(await page.evaluate(id=>S.dbreak[id],j.id),true,j.id);
    assert.equal(await capArea(j.id),0,'broken wall must not be repainted above wires');
    assert.ok(await page.locator(`[data-duct-teeth="${j.v}"] path`).getAttribute('d'),'remaining wall stays visible');
  }
  await page.evaluate(()=>undo());assert.ok(await capArea(junctions.at(-1).id)>0,'undo restores the teeth');
  await page.evaluate(()=>{showHome();save();});await page.reload();await page.waitForFunction(()=>window.SIM);
  for(const j of junctions.slice(0,-1))assert.equal(await capArea(j.id),0,'saved opening stays open');
});

test('rear housings meet their real body bounds and device sides have no detached outline',async()=>{
  await fullState();
  const result=await page.evaluate(()=>{
    S.opBack=true;renderAll();const root=SCENE_PARTS.get('op-back'),boxes=[...root.querySelectorAll('[data-relief]')].map(n=>n.dataset.relief.split(',').map(Number));
    const missing=[];for(const[hid,k]of Object.entries(S.op.dev)){const[hx,y]=OP.holes[hid],x=OP.w-hx,b=OP_KIND[k]==='lamp'?[x-12,y-12,24,24]:[x-14,y-13,28,26];if(!boxes.some(a=>b.every((v,i)=>v===a[i])&&a[5]===OPW.x&&a[6]===OPW.y))missing.push(hid);}
    const g=hmiGeom(),hmi=boxes.some(a=>[g.x0,g.y0,g.w,g.h].every((v,i)=>v===a[i]));
    const detached=[];for(const c of [{x:-180,y:-100,w:800,h:600},{x:700,y:200,w:800,h:600}]){UI.cam=c;applyCam();for(const r of reliefNodes){if(['metal','duct','cover','stopper'].includes(r.kind))continue;if(getComputedStyle(r.sideX).stroke!=='none'||getComputedStyle(r.sideY).stroke!=='none')detached.push(r.kind);}}
    return{missing,hmi,detached,duplicate:document.querySelectorAll('[data-housing-finish]').length};
  });
  assert.deepEqual(result.missing,[]);assert.equal(result.hmi,true);assert.deepEqual(result.detached,[]);assert.equal(result.duplicate,0);
});

test('unplugged mains cannot energize a fully wired circuit; physical plug and outlet clicks restore supply',async()=>{
  await fullState();await page.evaluate(()=>{hideHome();S.tool='hand';fitTo({x:-65,y:660,w:360,h:245});renderTools();});
  const power=()=>page.evaluate(()=>evalOnce(staticLinks(S.wires),newSim(),{...LIVE.inp,mcb:true,cab:S.cables,fuses:fuseState(),plug:plugMap(),leads:convLeads()}).acOn);
  assert.equal(await power(),true);const outlet=await page.evaluate(()=>S.cables.outlet);
  await clickWorld(outlet.x,outlet.y);assert.equal(await power(),false);
  const plug=await page.evaluate(()=>{const p=powerPlaced();return{x:p.x+82,y:p.y+20};});
  await clickWorld(plug.x,plug.y);await clickWorld(outlet.x,outlet.y);assert.equal(await power(),true);await page.evaluate(()=>closeModal());
  await clickWorld(outlet.x,outlet.y);await page.evaluate(()=>save());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.SIM);assert.equal(await power(),false);
});

test('wire dressing accepts a position beneath a duct tooth and keeps covered ducts blocked',async()=>{
  await fullState();const point=await page.evaluate(()=>{
    hideHome();for(const [,q]of frList())q.covered=false;
    const w=S.wires.find(dressable),T=TERM[w.a],d=SLOT[T.duct],wl=termWall(T),x=d.x+Math.round((exitX(T)-d.x)/10)*10+2,y=wl==='t'?d.y+3:d.y+d.h-3;
    delete w.ha;delete w.tk;UI.dsel=[{w,e:'a'}];S.tool='dress';renderAll();fitTo({x:x-65,y:y-60,w:180,h:150});return{x,y,a:w.a,b:w.b};
  });
  await clickWorld(point.x,point.y);
  const result=await page.evaluate(({a,b})=>{const w=S.wires.find(w=>w.a===a&&w.b===b);return{hole:w.ha,x:w.ha&&holeOf(w.ha).x,teeth:!!SCENE_PARTS.get('duct-teeth')?.childElementCount};},point);
  assert.ok(result.hole);assert.ok(Math.abs(result.x-point.x)<.1);assert.equal(result.teeth,true);
  await page.evaluate(({a,b})=>{const w=S.wires.find(w=>w.a===a&&w.b===b);delete w.ha;UI.dsel=[{w,e:'a'}];for(const[,q]of frList())q.covered=true;renderAll();},point);
  await clickWorld(point.x,point.y);assert.equal(await page.evaluate(({a,b})=>!!S.wires.find(w=>w.a===a&&w.b===b).ha,point),false);
});

test('camera movement preserves model terminals, wiring, score and SVG nodes while projecting height',async()=>{
  await fullState();await page.evaluate(()=>hideHome());
  const result=await page.evaluate(()=>{
    const state=JSON.stringify({...S,elapsed:0}),terms=JSON.stringify(TERMS),score=scoreSheet().total,w=S.wires[0],path=wirePts(w,0),node=SCENE_PARTS.get('stoppers');
    const part=reliefNodes.find(r=>r.kind==='stopper'),{x,y,w:width,h:height}=projectionReference(part.world),cam={...UI.cam};
    UI.cam={...cam,x:x+width/2-250-cam.w/2};applyCam();const left=Number(part.node.dataset.sideX),leftPath=part.profile.getAttribute('transform');
    UI.cam={...cam,x:x+width/2+250-cam.w/2};applyCam();const right=Number(part.node.dataset.sideX),rightPath=part.profile.getAttribute('transform');
    return{left,right,changed:leftPath!==rightPath,shallow:reliefNodes.every(r=>Math.abs(Number(r.node.dataset.sideX))<=r.box[4]*.09+.011),state:state===JSON.stringify({...S,elapsed:0}),terms:terms===JSON.stringify(TERMS),score:score===scoreSheet().total,path:path===wirePts(w,0),node:node===SCENE_PARTS.get('stoppers'),pointer:part.node.getAttribute('pointer-events'),iframe:document.querySelectorAll('iframe,canvas').length};
  });
  assert.ok(result.left<0);assert.ok(result.right>0);
  for(const key of ['changed','shallow','state','terms','score','path','node'])assert.equal(result[key],true,key);
  assert.equal(result.pointer,'none');assert.equal(result.iframe,0);assert.equal(await page.locator('[data-home="preview25"]').count(),0);
});

test('UA-52 stopper has a white label and plastic side profile and installs through the existing top-view coordinates',async()=>{
  await fullState();const p=await page.evaluate(()=>{
    hideHome();LIVE.inp.mcb=false;S.tool='stopper';renderTools();
    const s=S.stoppers[0],cy=ROW[RAIL_ROW[s.rail]].cy;
    fitTo({x:s.x-55,y:cy-75,w:160,h:150});return{x:s.x+STOPPER_W/2,y:cy,n:S.stoppers.length};
  });
  const art=await page.evaluate(()=>{
    const r=reliefNodes.find(r=>r.kind==='stopper'),model=gWorld.querySelector('[data-stopper-model="UA-52"]');
    return{width:r.box[2],length:r.box[3],height:r.box[4],screws:model.querySelectorAll('use').length,label:!!model.querySelector('rect[fill="#fffef6"]'),profile:r.profile.textContent.includes('UA-52')};
  });
  assert.deepEqual(art,{width:8,length:45,height:30,screws:0,label:true,profile:true});
  await clickWorld(p.x,p.y);assert.equal(await page.evaluate(()=>S.stoppers.length),p.n-1);
  await clickWorld(p.x,p.y);assert.equal(await page.evaluate(()=>S.stoppers.length),p.n);assert.equal(await page.evaluate(()=>groupEnds().every(e=>e.ok)),true);
});

test('subtle relief setting persists and changes no work or grading',async()=>{
  await fullState();await page.evaluate(()=>{hideHome();showSettings();});
  const before=await page.evaluate(()=>({state:JSON.stringify({...S,elapsed:0}),score:scoreSheet().total}));
  await page.locator('[data-set="relief"]').uncheck();
  assert.equal(await page.evaluate(()=>reliefNodes.every(r=>r.node.getAttribute('display')==='none')),true);
  assert.deepEqual(await page.evaluate(()=>({state:JSON.stringify({...S,elapsed:0}),score:scoreSheet().total})),before);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.SIM);
  assert.equal(await page.evaluate(()=>SET.relief),false);
  await page.locator('[data-home="set"]').click();await page.locator('[data-set="relief"]').check();
  assert.equal(await page.evaluate(()=>reliefNodes.every(r=>!r.node.hasAttribute('display'))),true);
});

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
    S.cables = {...S.cables,powerLeads:Object.fromEntries(Object.entries(powerLeadMap(S.cables)).map(([k,t])=>[k,remap(t)]))};
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

test('power cable is placed on the floor and its three colored leads connect individually', async () => {
  await fullState();await page.evaluate(()=>{S.cables={power:false};S.tbCover=false;LIVE.inp.mcb=false;UI.carry={kind:'cable',key:'power',from:'tray',count:1};buildTerms();renderAll();fitTo({x:-50,y:440,w:650,h:450});});
  await clickWorld(10,785);
  assert.deepEqual(await page.evaluate(()=>S.cables.powerLeads),{});
  assert.equal(await page.evaluate(()=>S.cables.power),false);
  assert.equal(await page.evaluate(()=>UI.carry),null);
  for(const [k,n] of [['R',1],['T',2],['E',3]]) {
    const p=await page.evaluate(({k,n})=>({a:powerLeadEnd(k),b:TERM[`TB.${n}.b`]}),{k,n});
    await clickWorld(p.a.x,p.a.y);await clickWorld(p.b.x,p.b.y);
    assert.equal(await page.evaluate(k=>powerLeadMap(S.cables)[k],k),`TB.${n}.b`);
    assert.equal(await page.evaluate(()=>S.cables.power),k==='E');
  }
  assert.deepEqual(await page.evaluate(()=>powerLeadMap(S.cables)),{R:'TB.1.b',T:'TB.2.b',E:'TB.3.b'});
  await page.evaluate(()=>{S.cables.outlet={...OUTLET_POS};S.cables.plugged=true;commit();});
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
  const colors=await page.locator('[data-power-lead]').evaluateAll(a=>a.map(n=>n.getAttribute('stroke')));
  assert.deepEqual(colors,['#925523','#287be0','#21a65a']);
});

test('alternative wire list is informational and never marks a nonexample pair wrong', async () => {
  await fullState();await remapTB({'18':19,'19':18});
  await page.locator('#btnWires').click();
  assert.equal(await page.locator('.wl li.bad').count(),0);
  assert.doesNotMatch(await page.locator('#modalCard').textContent(),/정답 배선에 없|예시 배선에 없/);
});

test('legacy saves without custom labels or source endpoints retain the original wiring', async () => {
  await fullState();await page.evaluate(()=>{delete S.tbLabels;S.cables={...CAB_ALL};delete S.cables.powerLeads;save()});
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

test('power leads reject reversed phases, ground on live circuits and duplicate terminals', async () => {
  await fullState();const r=await page.evaluate(()=>{
    S.cables={power:false,powerPlaced:{...POWER_POS},powerLeads:{}};S.tbCover=false;LIVE.inp.mcb=false;buildTerms();
    const rejected=[];
    for(const [k,t] of [['R','TB.2.b'],['T','TB.1.b'],['E','TB.1.b'],['E','TB.5.b'],['R','TB.7.b'],['R','TB.1.t']]){connectPowerLead('PWR.'+k,t);rejected.push(Object.keys(S.cables.powerLeads).length===0);}
    connectPowerLead('PWR.R','TB.1.b');connectPowerLead('PWR.T','TB.1.b');
    return {rejected,leads:powerLeadMap(S.cables),on:S.cables.power};
  });
  assert.deepEqual(r,{rejected:[true,true,true,true,true,true],leads:{R:'TB.1.b'},on:false});
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
    return{before,calls,pointer,expected:toWorkWorld(box.left+119,box.top+50)};
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
    // A legitimate ResizeObserver update can change projection transforms after the hint bar changes height.
    const html=gOver._markup;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return{gesture:UI.gesture,pending:overlayFrame,stable:html===gOver._markup};
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

test('middle-button pan batches camera writes, reuses geometry and preserves the final position', async()=>{
  await fullState();await page.evaluate(()=>hideHome());
  const b=await page.locator('#board').boundingBox(),x=b.x+100,y=b.y+100;
  await page.mouse.move(x,y);await page.mouse.down({button:'middle'});
  const r=await page.evaluate(async({x,y})=>{
    const snapshot=()=>JSON.stringify({...S,elapsed:0}); // The running work clock is allowed to advance while panning.
    const cam0={...UI.gesture.cam0},before=snapshot(),world=gWorld.firstChild;
    let writes=0,reads=0;const set=svg.setAttribute.bind(svg),get=svg.getBoundingClientRect.bind(svg);
    svg.setAttribute=(key,...a)=>{if(key==='viewBox')writes++;return set(key,...a);};
    svg.getBoundingClientRect=(...a)=>{reads++;return get(...a);};
    for(let n=1;n<=80;n++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:x+n,clientY:y+n/2,pointerId:1,pointerType:'mouse',buttons:4,bubbles:true}));
    const beforeFrame=writes,readBurst=reads,pending=!!cameraFrame;
    await new Promise(done=>requestAnimationFrame(done));
    const afterFrame=writes,unchangedWorld=world===gWorld.firstChild;
    // Release before the following frame: flush the final input synchronously.
    svg.dispatchEvent(new PointerEvent('pointermove',{clientX:x+90,clientY:y+50,pointerId:1,pointerType:'mouse',buttons:4,bubbles:true}));
    const rect=UI.gesture.rect,expected={x:cam0.x-90/rect.width*cam0.w,y:cam0.y-50/rect.height*cam0.h};
    svg.dispatchEvent(new PointerEvent('pointerup',{clientX:x+90,clientY:y+50,pointerId:1,pointerType:'mouse',button:1,bubbles:true}));
    const view=svg.getAttribute('viewBox'),flushed=cameraFrame===0;
    await new Promise(done=>requestAnimationFrame(done));
    svg.setAttribute=set;svg.getBoundingClientRect=get;
    return {beforeFrame,readBurst,pending,afterFrame,unchangedWorld,flushed,stable:view===svg.getAttribute('viewBox'),position:Math.abs(UI.cam.x-expected.x)<1e-7&&Math.abs(UI.cam.y-expected.y)<1e-7,unchanged:snapshot()===before,gesture:UI.gesture,panning:document.body.classList.contains('panning'),visible:getComputedStyle(gOver).visibility};
  },{x,y});
  await page.mouse.up({button:'middle'});
  assert.deepEqual(r,{beforeFrame:0,readBurst:0,pending:true,afterFrame:1,unchangedWorld:true,flushed:true,stable:true,position:true,unchanged:true,gesture:null,panning:false,visible:'visible'});
});

test('camera cancellation and lost capture flush pending movement without leaving panning active',async()=>{
  await fullState();await page.evaluate(()=>hideHome());
  for(const ending of ['pointercancel','lostpointercapture','blur']) {
    const result=await page.evaluate(async ending=>{
      const r=svg.getBoundingClientRect();UI.gesture={type:'pan',sx:r.left+40,sy:r.top+40,cam0:{...UI.cam},rect:r};beginCameraGesture();
      svg.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+90,clientY:r.top+70,pointerId:1,pointerType:'mouse',buttons:4,bubbles:true}));
      if(ending==='blur')window.dispatchEvent(new Event('blur'));else svg.dispatchEvent(new PointerEvent(ending,{pointerId:1,pointerType:'mouse',bubbles:true}));
      const view=svg.getAttribute('viewBox');await new Promise(done=>requestAnimationFrame(done));
      return {pending:cameraFrame,gesture:UI.gesture,panning:document.body.classList.contains('panning'),stable:view===svg.getAttribute('viewBox')};
    },ending);
    assert.deepEqual(result,{pending:0,gesture:null,panning:false,stable:true});
  }
});

test('touch pinch and left-button camera drag keep their final camera and refresh zoom detail',async()=>{
  await fullState();await page.evaluate(()=>hideHome());
  const r=await page.evaluate(async()=>{
    const b=svg.getBoundingClientRect();
    UI.gesture={type:'press',sx:b.left+10,sy:b.top+10,cam0:{...UI.cam},rect:b,moved:false};
    svg.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+50,clientY:b.top+30,pointerId:1,pointerType:'mouse',buttons:1,bubbles:true}));
    const dragged=!!cameraFrame&&document.body.classList.contains('panning');
    svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,pointerType:'mouse',bubbles:true}));
    UI.ptrs.set(11,{x:b.left+50,y:b.top+50});UI.ptrs.set(12,{x:b.left+150,y:b.top+50});
    const cam0={...UI.cam};UI.gesture={type:'pinch',d0:100,cam0,m0:{x:b.left+100,y:b.top+50},rect:b};beginCameraGesture();
    svg.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+1050,clientY:b.top+50,pointerId:12,pointerType:'touch',bubbles:true}));
    svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:12,pointerType:'touch',bubbles:true}));
    UI.ptrs.clear();
    return {dragged,zoomed:UI.cam.w<cam0.w,detail:UI.detail=== (b.width/UI.cam.w>4.2),pending:cameraFrame,panning:document.body.classList.contains('panning'),gesture:UI.gesture};
  });
  assert.deepEqual(r,{dragged:true,zoomed:true,detail:true,pending:0,panning:false,gesture:null});
});


test('power source follows equivalent relocated wiring and rejects saved wrong-color connections',async()=>{
  await fullState();await remapTB({1:7,7:1,2:17,17:2,3:18,18:3});
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
  const result=await page.evaluate(()=>{
    S.tbCover=false;LIVE.inp.mcb=false;S.cables.powerLeads={};S.cables.power=false;buildTerms();
    connectPowerLead('PWR.R','TB.7.b');connectPowerLead('PWR.T','TB.17.b');connectPowerLead('PWR.E','TB.18.b');
    const correct={...powerLeadMap(S.cables)},good=!powerFault(S.cables,staticLinks(S.wires));
    S.cables.powerLeads={R:correct.T,T:correct.R,E:correct.E};S.cables.power=true;
    const wrong=evalOnce(staticLinks(S.wires),newSim(),{...LIVE.inp,cab:S.cables,fuses:fuseState(),mcb:true,leads:convLeads(),plug:plugMap()});
    return {correct,good,wrongOn:wrong.acOn,smps:wrong.out.smps,error:wrong.powerError};
  });
  assert.deepEqual(result.correct,{R:'TB.7.b',T:'TB.17.b',E:'TB.18.b'});assert.equal(result.good,true);assert.equal(result.wrongOn,false);assert.equal(result.smps,false);assert.match(result.error,/R/);
});

test('partly connected power cable saves, restores and can be reconnected with undo',async()=>{
  await fullState();await page.evaluate(()=>{S.cables={power:false,powerPlaced:{x:35,y:800},powerLeads:{R:'TB.1.b'}};S.tbCover=false;save();});
  await page.reload();await page.waitForFunction(()=>window.SIM);
  assert.deepEqual(await page.evaluate(()=>S.cables),{power:false,powerPlaced:{x:35,y:800},powerLeads:{R:'TB.1.b'}});
  const r=await page.evaluate(()=>{LIVE.inp.mcb=false;connectPowerLead('PWR.T','TB.2.b');connectPowerLead('PWR.E','TB.3.b');const full=powerConnected();selectPowerLead(TERM['PWR.T']);const removed=!S.cables.power&&!powerLeadMap(S.cables).T;undo();return{full,removed,restored:powerConnected(),T:powerLeadMap(S.cables).T};});
  assert.deepEqual(r,{full:true,removed:true,restored:true,T:'TB.2.b'});
});

test('power cable blocks live edits, closed covers and missing earth',async()=>{
  await fullState();const r=await page.evaluate(()=>{
    S.cables={power:false,powerPlaced:{...POWER_POS},powerLeads:{}};buildTerms();S.tbCover=false;LIVE.inp.mcb=true;
    connectPowerLead('PWR.R','TB.1.b');const liveBlocked=!S.cables.powerLeads.R;
    LIVE.inp.mcb=false;S.tbCover=true;connectPowerLead('PWR.R','TB.1.b');const coverBlocked=!S.cables.powerLeads.R;
    S.tbCover=false;connectPowerLead('PWR.R','TB.1.b');connectPowerLead('PWR.T','TB.2.b');
    S.cables.outlet={...OUTLET_POS};S.cables.plugged=true;S.cables.power=true; // Even a malformed save claiming completion cannot omit earth.
    const result=evalOnce(staticLinks(S.wires),newSim(),{...LIVE.inp,mcb:true,cab:S.cables,fuses:fuseState(),leads:convLeads(),plug:plugMap()});
    return {liveBlocked,coverBlocked,ready:powerConnected(),on:result.acOn,error:result.powerError};
  });
  assert.equal(r.liveBlocked,true);assert.equal(r.coverBlocked,true);assert.equal(r.ready,false);assert.equal(r.on,false);assert.match(r.error,/E/);
});

test('legacy relocated power keeps actual terminals and inspection record during migration',async()=>{
  await fullState();await remapTB(Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,40-i])));
  const r=await page.evaluate(()=>{const old=powerTerms(S.cables);S.cables={power:true,powerTerms:old,outlet:{...OUTLET_POS},plugged:true};S.judge={key:judgeKey()};fixState();return {map:powerLeadMap(S.cables),placed:!!powerPlaced(),inspected:judgeRan()};});
  assert.deepEqual(r,{map:{R:'TB.40.b',T:'TB.39.b',E:'TB.38.b'},placed:true,inspected:true});
  assert.deepEqual(await functionalResults(),{checks:[],judge:[],operationPoints:18});
});

test('power practice lesson accepts floor placement and R T E connection one at a time',async()=>{
  const r=await page.evaluate(()=>{
    const L=LESSONS.find(l=>l.t.includes('전원 케이블')),st=pracSetup(L);
    setMode('prac',st);PRAC.L=L;PRAC.state='run';PRAC.cur=null;PRAC.sig=pracSig();PRAC.good=JSON.stringify(S);renderAll();
    UI.carry={kind:'cable',key:'power',count:1};dropCable({...POWER_POS});
    const afterDrop=PRAC.state;
    S.cables.outlet={...OUTLET_POS};S.cables.plugged=true;for(const [k,,,t] of POWER_LEADS)connectPowerLead('PWR.'+k,t);
    return {afterDrop,state:PRAC.state,complete:L.goal(),leads:powerLeadMap(S.cables)};
  });
  assert.deepEqual(r,{afterDrop:'run',state:'win',complete:true,leads:{R:'TB.1.b',T:'TB.2.b',E:'TB.3.b'}});
});


test('walkthrough places the cable then connects all three leads and retains a valid inspection',async()=>{
  const result=await page.evaluate(()=>{
    const steps=demoScript(),st=newState(true),power=[];
    for(const step of steps){demoApply(st,step.ops);if(step.text.includes('전원 케이블을 바닥')||/^(갈색 R|파란색 T|초록색 E)선/.test(step.text))power.push(JSON.parse(JSON.stringify(st.cables)));}
    setMode('free',st);return {power,ready:powerConnected(),inspected:judgeRan(),error:powerFault(S.cables,staticLinks(S.wires))};
  });
  assert.equal(result.power.length,4);assert.deepEqual(result.power.map(x=>Object.keys(x.powerLeads).length),[0,1,2,3]);
  assert.deepEqual(result.power.map(x=>x.power),[false,false,false,true]);assert.equal(result.ready,true);assert.equal(result.inspected,true);assert.equal(result.error,'');
});




test('wiring rejection explains endpoints, highlights them and clears after a valid connection',async()=>{
  await fullState();await page.evaluate(()=>{S.cables={power:false,powerPlaced:{...POWER_POS},powerLeads:{}};S.tbCover=false;LIVE.inp.mcb=false;buildTerms();connectPowerLead('PWR.R','TB.2.b');});
  assert.equal(await page.locator('#wiringNotice').isVisible(),true);
  assert.match(await page.locator('#wiringEndpoints').textContent(),/갈색 R/);assert.match(await page.locator('#wiringReason').textContent(),/T 전원 회로.*차단기/);
  assert.equal(await page.locator('#wiringErrorMarks circle').count(),2);
  await page.locator('#wiringFocus').click();
  assert.equal(await page.evaluate(()=>['PWR.R','TB.2.b'].every(id=>{const t=TERM[id],c=UI.cam;return t.x>=c.x&&t.x<=c.x+c.w&&t.y>=c.y&&t.y<=c.y+c.h})),true);
  assert.equal(await page.evaluate(()=>{const r=svg.getBoundingClientRect(),n=$('#wiringNotice').getBoundingClientRect();return ['PWR.R','TB.2.b'].every(id=>{const t=TERM[id],x=r.left+(t.x-UI.cam.x)/UI.cam.w*r.width,y=r.top+(t.y-UI.cam.y)/UI.cam.h*r.height;return x<n.left||x>n.right||y<n.top||y>n.bottom;});}),true,'notice must not cover the highlighted endpoints');
  await page.evaluate(()=>connectPowerLead('PWR.R','TB.1.b'));
  assert.equal(await page.locator('#wiringNotice').isHidden(),true);assert.equal(await page.locator('#wiringErrorMarks').count(),0);
});

test('AC DC and conveyor wiring errors show persistent guidance without adding a wire',async()=>{
  await fullState();await page.evaluate(()=>{S.tbCover=false;for(const f of Object.values(S.fr))f.covered=false;addWire('MCB.B1','SMPS.V2');});
  assert.match(await page.locator('#wiringReason').textContent(),/220V.*24V/);
  assert.equal(await page.evaluate(()=>S.wires.some(w=>w.a==='MCB.B1'&&w.b==='SMPS.V2')),false);
  await page.evaluate(()=>connectLead('CV.S1','R1.13'));
  assert.match(await page.locator('#wiringReason').textContent(),/단자대.*아래쪽/);
  await page.evaluate(()=>{const w=S.wires.find(w=>w.a==='TB.1.t'&&w.b==='MCB.B1');UI.replug={w,end:'a',keep:'MCB.B1'};finishReplug(TERM['SMPS.V2']);});
  assert.match(await page.locator('#wiringReason').textContent(),/220V.*24V/);
  await page.setViewportSize({width:390,height:844});
  const box=await page.locator('#wiringNotice').boundingBox();assert.ok(box.width<=390);
  await page.locator('#wiringClose').click();assert.equal(await page.locator('#wiringNotice').isHidden(),true);
});




test('home adds practical fault drills without the retired 3D workshop or quizzes',async()=>{
  assert.equal(await page.locator('.hm-card').count(),6);
  assert.equal(await page.locator('[data-home="lab3d"]').count(),0);
  assert.equal(await page.locator('[data-home="quiz"]').count(),0);
  assert.equal(await page.evaluate(()=>typeof QUIZ_BANK),'undefined');
  for(const route of ['help','strip','prac','fault']){
    await page.locator(`[data-home="${route}"]`).click();
    assert.equal(await page.locator('.hm-top h1').count(),1);
    await page.locator('.hm-back[data-home="main"]').click();
  }
});


test('old workshop bookmarks return to 2D without loading 3D assets or changing saved work', async () => {
  await fullState();
  const saved = await page.evaluate(() => {
    save();
    const ex = pClone(S); ex.exam = { on: true }; ex.elapsed = 123000; ex.op.labels.L_hmi = '시험';
    localStorage.setItem(STORE_EXAM, JSON.stringify(ex));
    localStorage.setItem(STORE_PRAC, JSON.stringify({ done: { '1-1': 12500 } }));
    return [STORE, STORE_EXAM, STORE_PRAC].map(key => localStorage.getItem(key));
  });
  const threeRequests = [];
  page.on('request', req => { if (/\/(?:lab-3d|vendor)\//.test(req.url())) threeRequests.push(req.url()); });
  for (const suffix of ['', '?mode=circuit']) {
    await page.goto(origin + '/lab-3d.html' + suffix);
    await page.waitForURL(origin + '/index.html');
    await page.waitForFunction(() => window.SIM);
    await page.evaluate(() => clearInterval(LIVE.timer));
    assert.equal(await page.locator('#home').isVisible(), true);
    assert.equal(await page.locator('.hm-card').count(), 6);
    assert.deepEqual(await page.evaluate(() => [STORE, STORE_EXAM, STORE_PRAC].map(key => localStorage.getItem(key))), saved);
  }
  assert.deepEqual(threeRequests, []);
  await page.locator('[data-home="free"]').click();
  assert.equal(await page.evaluate(() => scoreSheet().total), 30);
});

test('all 10 fault cases and 19 challenge pairs are observable, repairable, and require both repairs', async () => {
  const results = await page.evaluate(() => {
    const keep = S, cases = [...fdPool(1), ...fdPool(2)], rows = [];
    try {
      for (const ids of cases) {
        const st = fdBuild(ids);
        if (!st) { rows.push({ ids, valid: false }); continue; }
        S = pClone(st); buildTerms();
        const initial = fdReport(), broken = initial.bad.length;
        const failing = JUDGE.filter(c => !initial.judge.res[c.id].ok).map(c => c.id);
        const partial = ids.length === 2 ? ids.map(id => {
          S = pClone(st); FD_SOURCE[id].fix(); buildTerms();
          const report = fdReport();
          return {bad:report.bad.length, failing:JUDGE.filter(c=>!report.judge.res[c.id].ok).map(c=>c.id)};
        }) : [];
        S = pClone(st); for (const id of ids) FD_SOURCE[id].fix(); buildTerms();
        rows.push({ ids, valid: true, broken, failing, partial, repaired: fdReport().bad.length });
      }
    } finally { S = keep; buildTerms(); }
    return rows;
  });
  assert.equal(results.length, 29);
  for (const r of results) {
    assert.equal(r.valid, true, `generated ${r.ids}`);
    assert.ok(r.broken > 0, `fault must affect real operation: ${r.ids}`);
    assert.ok(r.partial.every(p => p.bad > 0), `both faults must be fixed: ${r.ids}`);
    if (r.partial.length) for (const [i,p] of r.partial.entries()) {
      assert.ok(p.failing.some(k => !r.partial[1-i].failing.includes(k)), `each fault must have a distinct observable failure: ${r.ids}`);
      assert.ok(p.failing.every(k => r.failing.includes(k)), `both-fault symptoms must include each fault's failures: ${r.ids}`);
    }
    assert.equal(r.repaired, 0, `full repair must work: ${r.ids}`);
  }
});

test('random fault bags cover every case before repeating and avoid a repeated boundary case', async () => {
  const results = await page.evaluate(() => [1,2].map(level => {
    const n = fdPool(level).length, draws = Array.from({length: n}, () => fdKey(fdDraw(level))), next = fdKey(fdDraw(level));
    return { n, draws, next, bagSaved: !!localStorage.getItem(STORE_FAULT + '.deck') };
  }));
  for (const r of results) {
    assert.equal(new Set(r.draws).size, r.n);
    assert.notEqual(r.next, r.draws.at(-1));
    assert.equal(r.bagSaved, true);
  }
});

test('fault practice shows symptoms first, reveals hints in stages, and resumes without changing other modes', async () => {
  await fullState();
  await page.evaluate(() => {
    save(); const ex = pClone(S); ex.exam = {on:true}; ex.elapsed = 123000;
    localStorage.setItem(STORE_EXAM, JSON.stringify(ex));
    localStorage.setItem(STORE_PRAC, JSON.stringify({done:{'1-1':12000}}));
    localStorage.setItem(STORE_FAULT + '.deck', JSON.stringify({'1':['1']}));
    setMode('exam', ex);
  });
  await page.locator('#btnHome').click();
  const saved = await page.evaluate(() => [STORE,STORE_EXAM,STORE_PRAC].map(k => localStorage.getItem(k)));
  await page.locator('[data-home="fault"]').click();
  await page.locator('[data-fd="start"][data-level="1"]').click();
  assert.equal(await page.evaluate(() => MODE), 'fault');
  assert.equal(await page.locator('#home').isHidden(), true);
  assert.equal(await page.locator('#btnDemo').isHidden(), true);
  assert.equal(await page.locator('#btnGuide').isHidden(), true);
  assert.equal(await page.locator('#faultHintMarks').count(), 0);
  assert.ok(await page.locator('#steps .todo').count() > 0);
  assert.equal(await page.evaluate(() => document.querySelector('#nextWrap').textContent.includes(FD_SOURCE[1].reveal)), false);
  const hint = page.locator('#nextWrap [data-fd="hint"]');
  await hint.click(); assert.deepEqual(await page.evaluate(() => S.fault.hints), [1]);
  assert.equal(await page.locator('[data-fd="locate"]').count(), 0);
  await hint.click();
  assert.equal(await page.locator('[data-fd="locate"]').count(), 0);
  await hint.click(); await page.locator('[data-fd="locate"]').click();
  assert.equal(await page.locator('#faultHintMarks circle').count(), 2);
  assert.equal(await page.evaluate(() => document.querySelector('#nextWrap').textContent.includes(FD_SOURCE[1].reveal)), false);
  assert.equal(await hint.isDisabled(), true);
  await page.locator('#pracCap [data-fd="judge"]').click();
  assert.match(await page.locator('#modalCard h2').textContent(), /아직/);
  await page.locator('#modal [data-act="close"]').click();
  assert.equal(await page.evaluate(() => S.fault.status), 'run');
  await page.locator('#btnHome').click();
  await page.reload(); await page.waitForFunction(() => window.SIM);
  await page.evaluate(() => clearInterval(LIVE.timer));
  await page.locator('[data-home="fault"]').click();
  await page.locator('[data-fd="resume"]').click();
  assert.deepEqual(await page.evaluate(() => ({ids:S.fault.ids,hints:S.fault.hints,attempts:S.fault.attempts,status:S.fault.status})),{ids:[1],hints:[3],attempts:1,status:'run'});
  assert.deepEqual(await page.evaluate(() => [STORE,STORE_EXAM,STORE_PRAC].map(k => localStorage.getItem(k))), saved);
});

async function faultClickTerminal(id) {
  const point = await page.evaluate(id => {
    const t = TERM[id], r = svg.getBoundingClientRect(), c = UI.cam;
    return {x:r.left + (t.x-c.x)/c.w*r.width, y:r.top + (t.y-c.y)/c.h*r.height};
  }, id);
  await page.mouse.click(point.x, point.y);
}

test('physical terminal clicks repair a fault and complete practice through real operation checks', async () => {
  await page.evaluate(() => localStorage.setItem(STORE_FAULT+'.deck', JSON.stringify({'1':['5']})));
  await page.locator('[data-home="fault"]').click();
  await page.locator('[data-fd="start"][data-level="1"]').click();
  await page.evaluate(() => { setTool('meter'); fitAvoid(span2('R4.14','TB.14.t')); });
  await faultClickTerminal('R4.14'); await faultClickTerminal('TB.14.t');
  assert.equal(await page.evaluate(() => UI.meter.b), 'TB.14.t');
  assert.match(await page.evaluate(() => meterRead(UI.meter.a, UI.meter.b).txt), /∞/);
  await page.locator('[data-tool="wire"]').click();
  await faultClickTerminal('R4.14'); await faultClickTerminal('TB.14.t');
  assert.equal(await page.evaluate(() => S.wires.some(w => pairKey(w.a,w.b)===pairKey('R4.14','TB.14.t'))), true);
  await page.locator('#pracCap [data-fd="judge"]').click();
  assert.equal(await page.evaluate(() => S.fault.status), 'win');
  assert.match(await page.locator('#modalCard h2').textContent(), /고장을 해결/);
  await page.locator('#modal [data-fd="next"]').click();
  assert.equal(await page.evaluate(() => S.fault.status), 'run');
  assert.notDeepEqual(await page.evaluate(() => S.fault.ids), [5]);
});

test('fault inspection accepts equivalent terminal relocation and undo cannot reset hint or check counts', async () => {
  await page.evaluate(() => fdEnter(fdBuild([1])));
  await page.evaluate(() => { snap(); FD_SOURCE[1].fix(); commit(); fdHint(0); });
  await remapTB({'18':19,'19':18});
  await page.locator('#pracCap [data-fd="judge"]').click();
  assert.equal(await page.evaluate(() => S.fault.status), 'win');
  assert.equal(await page.evaluate(() => S.convLeads['S+']), 'TB.18.b');
  await page.evaluate(() => { closeModal(); undo(); });
  assert.deepEqual(await page.evaluate(() => ({hints:S.fault.hints,attempts:S.fault.attempts,status:S.fault.status})), {hints:[1],attempts:1,status:'run'});
});

test('fault practice menu and staged hints fit narrow dark screens; retry preserves the selected faults', async () => {
  await page.setViewportSize({width:390,height:844}); await page.emulateMedia({colorScheme:'dark'});
  await page.locator('[data-home="fault"]').click();
  assert.ok(await page.evaluate(() => document.querySelector('#home').scrollWidth <= innerWidth));
  await page.locator('[data-fd="start"][data-level="2"]').click();
  const ids = await page.evaluate(() => S.fault.ids);
  await page.evaluate(() => fdJudge());
  assert.ok(await page.locator('#modalCard .pr-jr li span').first().evaluate(el => el.getBoundingClientRect().width > 100));
  await page.locator('#modal [data-act="close"]').click();
  await page.evaluate(() => { fdHint(0);fdHint(0);fdHint(0); });
  assert.ok(await page.locator('#nextWrap').evaluate(el => el.scrollWidth<=el.clientWidth));
  await page.locator('#btnReset').click();
  await page.locator('#modal [data-act="ok"]').click();
  assert.deepEqual(await page.evaluate(() => S.fault.ids),ids);
  assert.deepEqual(await page.evaluate(() => S.fault.hints),[0,0]);
  assert.equal(await page.evaluate(() => S.fault.attempts),0);
});

test('live switching retains unchanged device and wire SVG nodes without recalculating physical routes', async () => {
  await fullState();
  const result=await page.evaluate(()=>{
    S.opBack=false;buildTerms();renderAll();LIVE.inp.mcb=true;liveStep(0);
    const panel=gWorld.querySelector('[data-scene-part="panel"] path'),wire=gWorld.querySelector('[data-scene-part^="wire-inner-2:"] path');
    const r3=S.inst.find(i=>names()[i.id]==='R3'),relay=gWorld.querySelector(`[data-scene-part="device-${r3.id}"]`),off=relay.innerHTML;
    const original=calculateBasePts;let calculations=0;calculateBasePts=(...args)=>{calculations++;return original(...args);};
    liveDown('pb1');liveRelease();const on=!!LIVE.out.plc,relayChanged=off!==relay.innerHTML;
    liveDown('pb1');liveRelease();const turnedOff=!LIVE.out.plc;
    calculateBasePts=original;
    const retained=panel===gWorld.querySelector('[data-scene-part="panel"] path')&&wire===gWorld.querySelector('[data-scene-part^="wire-inner-2:"] path');
    const roles=[...gWorld.children].map(n=>/^wire-inner-(\d):/.exec(n.dataset.scenePart)).filter(Boolean).map(m=>+m[1]);
    return{calculations,on,turnedOff,relayChanged,retained,paintOrder:roles.every((n,i)=>!i||n>=roles[i-1])};
  });
  assert.deepEqual(result,{calculations:0,on:true,turnedOff:true,relayChanged:true,retained:true,paintOrder:true});
});

test('tie input bursts calculate once per frame, retain unrelated SVG, and save the final release position with undo', async () => {
  await fullState();
  const result=await page.evaluate(async()=>{
    S.finished=true;S.opBack=true;buildTerms();renderAll();fitOp();
    const t=S.ties[0];tieToNew(t);snap();
    const geo=tieGeo(t),r=svg.getBoundingClientRect(),sx=r.left+(geo.M.x-UI.cam.x)/UI.cam.w*r.width,sy=r.top+(geo.M.y-UI.cam.y)/UI.cam.h*r.height;
    const g={type:'tiemove',t,sx,sy,p0:{...geo.M},c0:{...t.c},rank:geo.rank,moved:true,rect:r};UI.gesture=g;
    const before={...t.c},panel=gWorld.querySelector('[data-scene-part="panel"] path'),wireSig0=wireSig();
    const original=tieDrag;let calls=0;tieDrag=(...args)=>{calls++;return original(...args);};
    for(let i=1;i<=120;i++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:sx+i*.04,clientY:sy,pointerId:1,pointerType:'mouse',buttons:1,bubbles:true}));
    const beforeFrame=calls;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));const afterFrame=calls;
    const end=toWorkWorld(sx+5.4,sy),expected={x:Math.round((g.c0.x+end.x-g.p0.x)*100)/100,y:Math.round((g.c0.y+end.y-g.p0.y)*100)/100};
    svg.dispatchEvent(new PointerEvent('pointerup',{clientX:sx+5.4,clientY:sy,pointerId:1,pointerType:'mouse',button:0,bubbles:true}));
    tieDrag=original;const saved=loadKey(STORE).ties[0].c;
    const retained=panel===gWorld.querySelector('[data-scene-part="panel"] path'),connected=wireSig0===wireSig(),atEnd={...S.ties[0].c};
    const finalMarkup=[...gWorld.children].map(n=>n._markup).join('');await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));const stable=finalMarkup===[...gWorld.children].map(n=>n._markup).join('');
    undo();return{beforeFrame,afterFrame,expected,atEnd,saved,retained,connected,stable,undone:JSON.stringify(before)===JSON.stringify(S.ties[0].c)};
  });
  assert.equal(result.beforeFrame,0);assert.equal(result.afterFrame,1);
  assert.deepEqual(result.atEnd,result.expected);assert.deepEqual(result.saved,result.expected);
  for(const key of ['retained','connected','stable','undone'])assert.equal(result[key],true,key);
});

test('tie release, cancellation, lost capture and focus loss flush pending motion without a later stale frame', async () => {
  for(const end of ['pointerup','pointercancel','lostpointercapture','blur']){
    await fullState();
    const result=await page.evaluate(async end=>{
      S.finished=true;fitOp();const t=S.ties[0];tieToNew(t);snap();
      const geo=tieGeo(t),r=svg.getBoundingClientRect(),sx=r.left+(geo.M.x-UI.cam.x)/UI.cam.w*r.width,sy=r.top+(geo.M.y-UI.cam.y)/UI.cam.h*r.height;
      const g={type:'tiemove',t,sx,sy,p0:{...geo.M},c0:{...t.c},rank:geo.rank,moved:true,rect:r};UI.gesture=g;
      const cx=sx+5,point=toWorkWorld(cx,sy),expected={x:Math.round((g.c0.x+point.x-g.p0.x)*100)/100,y:Math.round((g.c0.y+point.y-g.p0.y)*100)/100};
      svg.dispatchEvent(new PointerEvent('pointermove',{clientX:cx,clientY:sy,pointerId:1,pointerType:'mouse',buttons:1,bubbles:true}));
      if(end==='blur')window.dispatchEvent(new Event('blur'));
      else svg.dispatchEvent(new PointerEvent(end,{clientX:cx,clientY:sy,pointerId:1,pointerType:'mouse',bubbles:true}));
      const after={...S.ties[0].c},html=[...gWorld.children].map(n=>n._markup).join('');
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      return{expected,after,gesture:UI.gesture,pending:g.raf,stable:html===[...gWorld.children].map(n=>n._markup).join(''),saved:loadKey(STORE).ties[0].c};
    },end);
    assert.deepEqual(result.after,result.expected,end);assert.deepEqual(result.saved,result.expected,end);
    assert.equal(result.gesture,null,end);assert.equal(result.pending,0,end);assert.equal(result.stable,true,end);
  }
});

test('fault catalog hides all names until an actual repair passes and keeps reveals after reload', async () => {
  await page.locator('[data-home="fault"]').click();
  assert.equal(await page.locator('.fault-case').count(),10);
  assert.deepEqual(await page.locator('.fault-case b').allTextContents(),Array.from({length:10},(_,i)=>`고장 ${i+1}`));
  await page.locator('[data-fd="select"][data-id="0"]').click();
  for(let i=0;i<4;i++) await page.locator('#nextWrap [data-fd="hint"]').click();
  assert.equal(await page.evaluate(()=>fdProgress()[0]),undefined);
  assert.equal(await page.evaluate(()=>document.querySelector('#nextWrap').textContent.includes(FD_SOURCE[0].reveal)),true);
  await page.locator('#pracCap [data-fd="judge"]').click();
  assert.equal(await page.evaluate(()=>fdProgress()[0]),undefined);
  await page.evaluate(()=>{closeModal();FD_SOURCE[0].fix();buildTerms();fdJudge();});
  await page.locator('#modal [data-fd="menu"]').click();
  assert.equal(await page.locator('.fault-case[data-id="0"] b').textContent(),'퓨즈 고장');
  assert.equal(await page.locator('.fault-case.done').count(),1);
  await page.reload();await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>clearInterval(LIVE.timer));
  await page.locator('[data-home="fault"]').click();
  assert.equal(await page.locator('.fault-case[data-id="0"] b').textContent(),'퓨즈 고장');
  assert.equal(await page.locator('.fault-case[data-id="1"] b').textContent(),'고장 2');
});

test('four hint levels obey study, introductory and challenge limits, including direct action guards', async () => {
  const result=await page.evaluate(()=>['study','intro','challenge'].map(kind=>{
    const ids=kind==='challenge'?[1,2]:[1];fdEnter(fdBuild(ids,kind));
    for(let i=0;i<6;i++) fdHint(0);
    fdLocate(0);
    return {kind,hints:S.fault.hints[0],answer:$('#nextWrap').textContent.includes(FD_SOURCE[1].reveal),marks:!!$('#faultHintMarks'),disabled:$('#nextWrap [data-fd="hint"]').disabled};
  }));
  assert.deepEqual(result,[{kind:'study',hints:4,answer:true,marks:true,disabled:true},{kind:'intro',hints:3,answer:false,marks:true,disabled:true},{kind:'challenge',hints:2,answer:false,marks:false,disabled:true}]);
});

test('ranked faults require all ten repairs, cannot skip or request hints, and resume one timed run', async () => {
  await page.locator('[data-home="ranks"]').click();
  await page.locator('#rankName').fill('만기');await page.locator('[data-rank="name"]').click();
  await page.locator('[data-rank="tab"][data-type="fault"]').click();
  await page.locator('[data-fd="rank"]').click();await page.locator('#modal [data-act="ok"]').click();
  const initial=await page.evaluate(()=>{S.fault.rank.startedAt-=60000;save();return pClone(S.fault.rank);});
  assert.equal(new Set(initial.order).size,10);
  await page.evaluate(()=>{fdHint(0);fdLocate(0);fdNext();});
  assert.equal(await page.locator('[data-fd="hint"]').count(),0);
  assert.equal(await page.locator('#faultHintMarks').count(),0);
  assert.equal(await page.evaluate(()=>S.fault.rank.index),0);
  assert.deepEqual(await page.evaluate(()=>S.fault.hints),[0]);
  await page.evaluate(()=>fdJudge());
  assert.equal(await page.locator('#modalCard .pr-jr small').count(),0,'rank inspection must not reveal repair clues');
  await page.evaluate(()=>{closeModal();FD_SOURCE[S.fault.ids[0]].fix();buildTerms();fdJudge();fdNext();});
  assert.equal(await page.evaluate(()=>rankRead().length),0,'partial clear is not ranked');
  await page.locator('#btnHome').click();await page.reload();await page.waitForFunction(()=>window.SIM);
  await page.evaluate(()=>clearInterval(LIVE.timer));
  await page.locator('[data-home="fault"]').click();await page.locator('[data-fd="resume"]').click();
  const resumed=await page.evaluate(()=>pClone(S.fault.rank));
  assert.equal(resumed.id,initial.id);assert.equal(resumed.startedAt,initial.startedAt);assert.deepEqual(resumed.order,initial.order);assert.equal(resumed.index,1);
  const complete=await page.evaluate(()=>{
    localStorage.setItem(RANK_PROFILE,'후배');
    for(let i=1;i<10;i++){
      closeModal();FD_SOURCE[S.fault.ids[0]].fix();buildTerms();fdJudge();
      if(i<9)fdNext();
    }
    const row=rankRead()[0],count=rankRead().length;
    fdJudge();return {row,count,countAgain:rankRead().length,progress:Object.keys(fdProgress()).length};
  });
  assert.equal(complete.count,1);assert.equal(complete.countAgain,1);assert.equal(complete.row.name,'만기');assert.equal(complete.row.type,'fault');assert.ok(complete.row.t>=60000);assert.equal(complete.progress,10);
  await page.locator('#modal [data-fd="next"]').click();
  assert.equal(await page.locator('[data-rank="tab"][data-type="fault"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.rank-table').textContent(),/만기/);
});

test('exam ranking snapshots submitted score and starting nickname and excludes example-filled work', async () => {
  await page.evaluate(()=>localStorage.setItem(RANK_PROFILE,'시험생'));
  await page.locator('[data-home="exam"]').click();await page.locator('#modal [data-act="ok"]').click();
  const record=await page.evaluate(()=>{
    const ex=S.exam;S=pClone(pracRef());S.exam=ex;S.usedFill=false;S.elapsed=65000;S.selfChk={'1-4':true};buildTerms();
    localStorage.setItem(RANK_PROFILE,'바뀐이름');submitExam(false);
    const row=rankRead()[0];S.selfChk={};submitExam(false);return {row,count:rankRead().length,score:row.score};
  });
  assert.equal(record.row.name,'시험생');assert.equal(record.row.type,'exam');assert.equal(record.row.t,65000);assert.equal(record.count,1);assert.equal(record.score,30);
  await page.evaluate(()=>{closeModal();S.exam={on:true,rankId:runId(),rankName:'예시사용'};S.usedFill=true;submitExam(false);});
  assert.equal(await page.evaluate(()=>rankRead().length),1);
});

test('strip ranking records only saved inspected sets with the starting nickname and ranks quality first', async () => {
  await page.evaluate(()=>localStorage.setItem(RANK_PROFILE,'선따기'));
  await page.locator('[data-home="strip"]').click();await page.locator('[data-home="s-start"]').click();
  await page.evaluate(()=>{const d=stripData();d.cur-=25000;stripSave(d);localStorage.setItem(RANK_PROFILE,'다른이름');});
  await page.locator('[data-home="s-stop"]').click();
  await page.reload();await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>clearInterval(LIVE.timer));
  await page.locator('[data-home="strip"]').click();
  assert.equal(await page.evaluate(()=>rankRead().length),0);
  await page.locator('[data-home="s-ck"][data-k="cut"][data-d="1"]').click();
  await page.locator('[data-home="s-save"]').click();
  const rows=await page.evaluate(()=>{
    rankRecord({id:'clean',type:'strip',name:'천천히정확히',t:90000,bad:0});
    rankRecord({id:'faster',type:'strip',name:'선따기',t:10000,bad:2});
    rankRecord({id:'repeat',type:'strip',name:'더빠름',t:20000,bad:1});
    rankRecord({id:'repeat',type:'strip',name:'중복',t:1,bad:0});
    return {raw:rankRead(),best:rankBest('strip')};
  });
  assert.equal(rows.raw[0].name,'선따기');assert.equal(rows.raw[0].bad,1);assert.ok(rows.raw[0].t>=25000);
  assert.deepEqual(rows.best.map(r=>r.name),['천천히정확히','더빠름','선따기']);assert.equal(rows.raw.length,4);
});

test('local rank UI escapes nicknames, uses shared positions for ties, fits mobile and reports storage failures', async () => {
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    rankRecord({id:'a',type:'exam',name:'<img src=x>',score:29,t:10000});
    rankRecord({id:'b',type:'exam',name:'공동',score:29,t:10000});
    rankRecord({id:'c',type:'exam',name:'삼등',score:28,t:1000});
    showHome('ranks');
  });
  assert.equal(await page.locator('.rank-table img').count(),0);
  assert.deepEqual(await page.locator('.rank-table tbody tr td:first-child').allTextContents(),['1','1','3']);
  assert.ok(await page.evaluate(()=>$('#home').scrollWidth<=innerWidth));
  assert.equal(await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=()=>{throw new Error('full');};
    try{return rankRecord({id:'fail',type:'fault',name:'실패',t:1000});}finally{Storage.prototype.setItem=original;}
  }),false);
  assert.match(await page.locator('#toast').textContent(),/저장하지 못/);
  await page.evaluate(()=>{localStorage.setItem(RANK_KEY,'{bad');localStorage.setItem(STORE_FAULT+'.cleared','[]');renderHome();});
  assert.equal(await page.locator('.rank-table').count(),0);
  await page.locator('#rankName').fill('');await page.locator('[data-rank="name"]').click();
  assert.match(await page.locator('#rankFeedback').textContent(),/닉네임/);
  await page.locator('#rankName').fill('저장오류');
  await page.evaluate(()=>{window.originalRankSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('full');};});
  await page.locator('[data-rank="name"]').click();
  assert.match(await page.locator('#rankFeedback').textContent(),/저장하지 못/);
  await page.evaluate(()=>Storage.prototype.setItem=window.originalRankSet);
});

test('online rank consent, anonymous upload, shared positions and nickname escaping work in the browser',async()=>{
 const calls=[];let submitted=false;
 await page.route('https://yljvxdqocewwaqvlfuds.supabase.co/**',async route=>{
  const request=route.request(),url=request.url();calls.push({url,body:request.postDataJSON()});
  const row={name:'<img src=x>',tag:'1234abcd',t:25000,score:29,bad:null,at:'2026-11-10T01:00:00Z',place:2};
  let data=[];
  if(url.includes('signup'))data={access_token:'test-access',refresh_token:'test-refresh',expires_at:9999999999};
  else if(url.includes('submit_record')){submitted=true;data=true;}
  else data=[row];
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
 });
 await page.evaluate(()=>rankRecord({id:'browser-one',type:'exam',name:'학생',t:60000,score:29}));
 await page.locator('[data-home="ranks"]').click();assert.equal(calls.length,0);
 await page.locator('[data-rank="scope"][data-scope="online"]').click();assert.equal(calls.length,0);
 await page.locator('[data-rank="online-toggle"]').click();
 await page.waitForFunction(()=>ONLINE.snapshot().lists.exam);
 assert.equal(await page.locator('.rank-table img').count(),0);assert.equal(await page.locator('.rank-table tbody tr td').first().textContent(),'2');
 assert.equal(calls.some(c=>c.url.includes('signup')),false);
 await page.locator('#rankName').fill('입력중인닉네임');
 await page.locator('[data-rank="refresh"]').click();await page.waitForFunction(()=>!ONLINE.snapshot().loading.exam);
 assert.equal(await page.locator('#rankName').inputValue(),'입력중인닉네임');
 await page.locator('[data-rank="upload"]').click();await page.waitForFunction(()=>ONLINE.snapshot().pending===0&&!ONLINE.snapshot().sending);
 assert.equal(submitted,true);assert.equal(calls.find(c=>c.url.includes('submit_record')).body.p_name,'학생');
 await page.locator('[data-rank="scope"][data-scope="local"]').click();assert.match(await page.locator('.rank-table').textContent(),/학생/);
});

test('online failures retain local and queued records across reload and missing SQL has a clear message',async()=>{
 let offline=true;
 await page.route('https://yljvxdqocewwaqvlfuds.supabase.co/**',async route=>{
  if(offline)return route.abort();
  const url=route.request().url();let data=url.includes('signup')?{access_token:'test-access',refresh_token:'test-refresh',expires_at:9999999999}:url.includes('submit_record')?true:[];
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
 });
 await page.evaluate(()=>{ONLINE.enable(true);rankRecord({id:'offline-row',type:'fault',name:'대기학생',t:30000});return ONLINE.sync();});
 assert.equal(await page.evaluate(()=>ONLINE.snapshot().pending),1);
 await page.reload();await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>clearInterval(LIVE.timer));
 assert.equal(await page.evaluate(()=>ONLINE.snapshot().pending),1);assert.equal(await page.evaluate(()=>rankRead()[0].name),'대기학생');
 offline=false;
 await page.locator('[data-home="ranks"]').click();await page.locator('[data-rank="scope"][data-scope="online"]').click();
 await page.locator('[data-rank="refresh"]').click();await page.waitForFunction(()=>ONLINE.snapshot().pending===0&&!ONLINE.snapshot().sending);
 await page.unroute('https://yljvxdqocewwaqvlfuds.supabase.co/**');
 await page.route('https://yljvxdqocewwaqvlfuds.supabase.co/**',route=>route.fulfill({status:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({code:'PGRST202'})}));
 await page.locator('[data-rank="refresh"]').click();await page.waitForFunction(()=>!ONLINE.snapshot().loading.exam);
 assert.match(await page.locator('#onlineStatus').textContent(),/SQL/);
});
