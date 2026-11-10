const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
let circuit, browser, server, origin;
before(async () => {
  circuit = await import('../lab-3d/circuit.mjs');
  const root = path.resolve(__dirname, '..');
  const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
  server = createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' }); res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

test('3D circuit follows the actual button, coil and normally-open contact connections', () => {
  const { inspect, EXAMPLE } = circuit;
  assert.deepEqual(inspect(EXAMPLE, false, true), { short: false, relay: false, lamp: false });
  assert.deepEqual(inspect(EXAMPLE, true, false), { short: false, relay: false, lamp: false });
  assert.deepEqual(inspect(EXAMPLE, true, true), { short: false, relay: true, lamp: true });
  assert.equal(inspect(EXAMPLE.slice(1), true, true).relay, false);
  assert.equal(inspect(EXAMPLE.slice(0, -1), true, true).lamp, false);
});
test('3D circuit accepts alternative terminal-block routes and detects source and contact shorts', () => {
  const { inspect, EXAMPLE } = circuit;
  const alternate = [...EXAMPLE.slice(1), ['DC.+', 'TB.4.t'], ['TB.4.b', 'PB.1']];
  assert.deepEqual(inspect(alternate, true, true), { short: false, relay: true, lamp: true });
  assert.equal(inspect([...EXAMPLE, ['DC.+', 'DC.-']], true, false).short, true);
  const contactShort = [...EXAMPLE, ['K1.14', 'DC.-']];
  assert.equal(inspect(contactShort, true, false).short, false);
  assert.deepEqual(inspect(contactShort, true, true), { short: true, relay: false, lamp: false });
  assert.deepEqual(circuit.validWires([null, ['bogus', 'PB.1'], ['PB.1', 'PB.1'], ['PB.1', 'PB.2'], ['PB.2', 'PB.1']]), [['PB.1', 'PB.2']]);
});

async function session(viewport = { width: 1440, height: 1000 }, mode = 'circuit') {
  const context = await browser.newContext({ viewport }); context.setDefaultTimeout(15000);
  const errors = [], external = [];
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/lab-3d.html${mode === 'circuit' ? '?mode=circuit' : ''}`); await unlock(page); await page.waitForFunction(mode === 'circuit' ? () => window.LAB3D : () => window.WORKSHOP3D?.ready);
  return { page, context, errors, external };
}
async function unlock(page) {
  if (await page.locator('#labGate').isVisible()) { await page.locator('#gatePassword').fill('0923'); await page.locator('#gatePassword').press('Enter'); }
}
async function state(page) { return page.evaluate(() => LAB3D.state); }
async function clickTerminal(page, id) {
  const { x, y } = await page.evaluate(id => LAB3D.screenPoint(id), id); await page.mouse.click(x, y);
}
async function topView(page) {
  await page.locator('[data-view="top"]').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('3D workbench loads offline and button release, edit lock and power-off behavior work', async () => {
  const { page, context, errors, external } = await session();
  try {
    assert.equal((await state(page)).wires.length, 6);
    assert.equal(await page.locator('#loading').isHidden(), true);
    await page.locator('#power').click();
    assert.equal(await page.locator('#clear').isDisabled(), true);
    await topView(page); await clickTerminal(page, 'DC.+');
    assert.equal((await state(page)).selected, null);
    const push = await page.locator('#push').boundingBox();
    await page.mouse.move(push.x + push.width / 2, push.y + push.height / 2); await page.mouse.down();
    assert.equal((await state(page)).lamp, true);
    await page.mouse.move(20, 140); await page.mouse.up();
    assert.equal((await state(page)).pressed, false); assert.equal((await state(page)).lamp, false);
    await page.locator('#push').focus(); await page.keyboard.down('Space');
    assert.equal((await state(page)).relay, true);
    await page.keyboard.up('Space'); assert.equal((await state(page)).relay, false);
    await page.locator('#power').click(); assert.equal((await state(page)).power, false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await context.close(); }
});

test('3D terminal picking, wire deletion, undo, orbit and independent save use real UI input', async () => {
  const { page, context, errors } = await session();
  try {
    await page.evaluate(() => localStorage.setItem('existing-2d-work', 'untouched'));
    await page.locator('#clear').click(); await topView(page);
    await clickTerminal(page, 'DC.+'); assert.equal((await state(page)).selected, 'DC.+');
    await clickTerminal(page, 'PB.1'); assert.deepEqual((await state(page)).wires, [['DC.+', 'PB.1']]);
    await page.locator('[data-tool="erase"]').click();
    const point = await page.evaluate(() => LAB3D.screenWirePoint(0)); await page.mouse.click(point.x, point.y);
    assert.equal((await state(page)).wires.length, 0);
    await page.locator('#undo').click(); assert.equal((await state(page)).wires.length, 1);
    const beforeCamera = await page.evaluate(() => LAB3D.camera);
    await page.mouse.move(450, 300); await page.mouse.down(); await page.mouse.move(540, 350, { steps: 6 }); await page.mouse.up();
    assert.notDeepEqual(await page.evaluate(() => LAB3D.camera), beforeCamera);
    assert.equal((await state(page)).wires.length, 1);
    await page.reload(); await page.waitForFunction(() => window.LAB3D);
    assert.deepEqual((await state(page)).wires, [['DC.+', 'PB.1']]); assert.equal((await state(page)).power, false);
    assert.equal(await page.evaluate(() => localStorage.getItem('existing-2d-work')), 'untouched');
    await topView(page); await clickTerminal(page, 'DC.+'); await clickTerminal(page, 'DC.-');
    await page.locator('#power').click(); assert.equal((await state(page)).power, false);
    assert.match(await page.locator('#status').textContent(), /직접 연결/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('3D workbench fits a narrow screen and remains reachable from the main menu', async () => {
  const { page, context, errors } = await session({ width: 390, height: 844 });
  try {
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(size.scroll <= size.width);
    assert.equal(await page.locator('#power').isVisible(), true);
    await topView(page); await clickTerminal(page, 'DC.+');
    assert.equal((await state(page)).selected, 'DC.+');
    await page.locator('.back').click(); await page.waitForFunction(() => window.SIM);
    await page.locator('[data-home="lab3d"]').click(); await page.waitForFunction(() => window.WORKSHOP3D);
    assert.equal(await page.evaluate(() => WORKSHOP3D.layout.devices.length), 19);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('original 3D workshop matches source dimensions and device positions and exposes front/back views', async () => {
  const { page, context, errors, external } = await session();
  try {
    await page.goto(`${origin}/lab-3d.html`); await page.waitForFunction(() => window.WORKSHOP3D?.ready);
    const layout = await page.evaluate(() => WORKSHOP3D.layout);
    const source = await context.newPage(); await source.goto(`${origin}/index.html`); await source.waitForFunction(() => window.SIM);
    const expected = await source.evaluate(() => {
      clearInterval(LIVE.timer); setMode('free', pClone(pracRef())); const nm=names();
      return {panel:PANEL,op:{...OPW,w:OP.w,h:OP.h}, devices:[...S.inst.map(i=>({name:nm[i.id],type:i.type,x:i.x,y:devY(i),w:DEV[i.type].w,h:DEV[i.type].h})),{name:'SERVO',type:'servo',x:SERVO.x,y:SERVO.y,w:SERVO.w,h:SERVO.h}]};
    });
    await source.close();
    assert.deepEqual(layout.panel,expected.panel);assert.deepEqual(layout.op,expected.op);assert.deepEqual(layout.devices,expected.devices);
    assert.equal(layout.frames,9);assert.equal(layout.conveyor.L,500);
    await page.locator('#flipOp').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.back),true);
    await page.locator('#showWires').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.wireVisible),true);
    await page.locator('[data-focus="panel"]').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.focus),'panel');
    await page.locator('[data-focus="conveyor"]').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.focus),'conveyor');
    await page.locator('#flipOp').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.back),false);
    await page.locator('.circuit-link').click();await page.waitForFunction(()=>window.LAB3D);assert.equal((await state(page)).wires.length,6);
    assert.deepEqual(errors,[]);
    // Only the original simulator's optional fonts can request external assets.
    assert.ok(external.every(url=>/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)));
  } finally {await context.close();}
});

test('walking body cannot tunnel through the table, slides around its edge and stays inside the room', async () => {
  const { moveBody, blocked, walkingDirection } = await import('../lab-3d/walk-physics.mjs');
  const front=moveBody({x:0,z:24},0,-100);
  assert.ok(front.z>=18 && front.z<19);assert.equal(front.x,0);assert.equal(blocked(front.x,front.z),false);
  const side=moveBody(front,30,-5);assert.ok(side.x>20);assert.equal(blocked(side.x,side.z),false);
  const wall=moveBody({x:25,z:24},200,200);assert.ok(wall.x<=46 && wall.z<=39);
  assert.ok(Math.abs(Math.hypot(...Object.values(walkingDirection(1,1,0)))-1)<1e-10);
  const turned=walkingDirection(1,0,Math.PI/2);assert.ok(turned.x<-.999 && Math.abs(turned.z)<1e-10);
});

test('first-person walking uses real keyboard and mouse input, stops at the bench and clears on Escape', async () => {
  const {page,context,errors,external}=await session(undefined,'workshop');
  try {
    assert.equal(await page.evaluate(()=>WORKSHOP3D.state.walk.mode),'walk');
    assert.ok(await page.evaluate(()=>WORKSHOP3D.state.details.screws>300));
    await page.locator('#walkStart').click();await page.waitForFunction(()=>WORKSHOP3D.state.walk.active);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(()=>WORKSHOP3D.state.walk.position.z<18.65,{},{timeout:15000});
    await page.keyboard.up('KeyW');
    assert.ok(await page.evaluate(()=>WORKSHOP3D.state.walk.position.z>=18));
    await page.keyboard.down('KeyD');await page.waitForFunction(()=>WORKSHOP3D.state.walk.position.x>1);
    const yaw=await page.evaluate(()=>WORKSHOP3D.state.walk.yaw);await page.mouse.move(700,340);
    await page.waitForFunction(yaw=>WORKSHOP3D.state.walk.yaw!==yaw,yaw);
    await page.keyboard.press('Escape');await page.keyboard.up('KeyD');
    await page.waitForFunction(()=>!WORKSHOP3D.state.walk.active);
    const position=await page.evaluate(()=>WORKSHOP3D.state.walk.position);await page.waitForTimeout(160);
    assert.deepEqual(await page.evaluate(()=>WORKSHOP3D.state.walk.position),position);
    assert.deepEqual(await page.evaluate(()=>WORKSHOP3D.state.walk.keys),[]);
    await page.locator('#crouch').click();await page.waitForFunction(()=>WORKSHOP3D.state.walk.height<24.3);
    await page.locator('#walkHome').click();assert.deepEqual(await page.evaluate(()=>WORKSHOP3D.state.walk.position),{x:0,z:24});
    await page.locator('[data-focus="panel"]').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.walk.mode),'orbit');
    await page.locator('#walkMode').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.walk.mode),'walk');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  } finally {await context.close();}
});

test('mobile walking controls release outside the button and focus loss cannot leave movement held', async () => {
  const {page,context,errors}=await session({width:390,height:844},'workshop');
  try {
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const button=await page.locator('[data-walk="KeyA"]').boundingBox();
    await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();
    await page.waitForFunction(()=>WORKSHOP3D.state.walk.position.x<-.5);
    await page.mouse.move(350,100);await page.mouse.up();
    await page.waitForFunction(()=>WORKSHOP3D.state.walk.keys.length===0);
    const forward=await page.locator('[data-walk="KeyW"]').boundingBox();
    await page.mouse.move(forward.x+forward.width/2,forward.y+forward.height/2);await page.mouse.down();
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
    const paused=await page.evaluate(()=>WORKSHOP3D.state.walk);assert.equal(paused.active,false);assert.deepEqual(paused.keys,[]);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});

test('3D entry requires 0923 before loading a scene, supports same-tab reload and can be locked again', async () => {
  const context=await browser.newContext({viewport:{width:390,height:844}});context.setDefaultTimeout(15000);
  const page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(`${origin}/lab-3d.html?mode=circuit`);
    assert.equal(await page.locator('#labGate').isVisible(),true);assert.equal(await page.locator('#labApp').isHidden(),true);
    assert.equal(await page.evaluate(()=>typeof LAB3D),'undefined');
    assert.ok(requests.every(u=>!u.includes('vendor/three')&&!u.endsWith('/main.mjs')&&!u.endsWith('/workshop.mjs')));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#gatePassword').fill('1111');await page.keyboard.press('Enter');
    assert.match(await page.locator('#gateError').textContent(),/맞지/);assert.equal(await page.evaluate(()=>typeof LAB3D),'undefined');
    await unlock(page);await page.waitForFunction(()=>window.LAB3D);
    await page.reload();await page.waitForFunction(()=>window.LAB3D);assert.equal(await page.locator('#labGate').isHidden(),true);
    await page.locator('#lockLab').click();await page.waitForFunction(()=>!document.querySelector('#labGate').hidden);
    assert.equal(await page.evaluate(()=>typeof LAB3D),'undefined');
    assert.equal(await page.locator('#gatePassword').inputValue(),'');
    await page.locator('#gateForm a').click();await page.waitForFunction(()=>window.SIM);assert.equal(await page.locator('#home').count()>0,true);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});

test('school uniform preview preserves school identity, concealed zipper and hidden first-person shoulder badges', async () => {
  const {page,context,errors}=await session(undefined,'workshop');
  try {
    const info=await page.evaluate(()=>WORKSHOP3D.state.uniform);
    assert.equal(info.school,'국립전북기계공업고등학교');assert.equal(info.english,'Chonbuk Mechanical Technical High School');assert.equal(info.innerText,'마이스터고');
    assert.equal(info.bodyVisible,true);assert.equal(info.badgesVisibleInCamera,false);assert.match(info.closure,/덮개.*똑딱/);
    await page.locator('#avatarView').click();assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.preview),true);
    const scene=await page.locator('#scene').boundingBox();await page.mouse.move(scene.x+scene.width/2,scene.y+scene.height/2);await page.mouse.down();await page.mouse.move(scene.x+scene.width/2+120,scene.y+scene.height/2,{steps:6});await page.mouse.up();
    await page.locator('#walkMode').click();
    assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.preview),false);assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.bodyVisible),true);assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.badgesVisibleInCamera),false);
    await page.locator('#walkStart').click();await page.mouse.move(700,1000);await page.mouse.move(700,1450);
    await page.waitForFunction(()=>WORKSHOP3D.state.walk.pitch<-1.4);
    assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.bodyVisible),true);assert.equal(await page.evaluate(()=>WORKSHOP3D.state.uniform.badgesVisibleInCamera),false);
    await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
  } finally {await context.close();}
});
