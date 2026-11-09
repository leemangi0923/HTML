// Rebuild the 3D reference faces from the original simulator's completed example.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..'), html = await fs.readFile(path.join(root, 'index.html'));
  const server = createServer((req, res) => res.setHeader('Content-Type', 'text/html; charset=utf-8').end(html));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.SIM);
    const data = await page.evaluate(() => {
      clearInterval(LIVE.timer); setMode('free', pClone(pracRef())); S.guide = false; LIVE.on = false; S.opBack = true; buildTerms(); renderAll();
      const defs = document.querySelector('#board defs').innerHTML;
      const assets = {}, asset = (name, content, x, y, w, h) => {
        assets[name + '.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w * 3}" height="${h * 3}" viewBox="${x} ${y} ${w} ${h}"><defs>${defs}</defs><style>text{font-family:Arial,sans-serif}.matbg{fill:#204c3e}.dim{fill:#a7d3ba;stroke:#a7d3ba;stroke-width:.6}.dim text{stroke:none}.redmark{stroke:#c43832;fill:none;stroke-width:.7}</style>${content}</svg>`;
        return 'reference/' + name + '.svg';
      };
      const nm = names();
      const devices = S.inst.map(i => {
        const d = DEV[i.type], y = devY(i), extra = i.type.startsWith('xtb') ? !!S.xtbClosed[i.id] : i.type === 'plc' ? S.plcLid : ['relay','timer'].includes(i.type) ? !!S.plug[i.id] : S.fuses[i.id];
        return { name: nm[i.id], type: i.type, x: i.x, y, w: d.w, h: d.h, terminals: devTerms(i.type), image: asset(nm[i.id], drawDevice(i.type, i.x, y, nm[i.id], extra), i.x, y, d.w, d.h) };
      });
      devices.push({name:'SERVO',type:'servo',...SERVO,image:asset('SERVO',dServo(SERVO.x,SERVO.y,true),SERVO.x,SERVO.y,SERVO.w,SERVO.h)});
      const frames = frList().filter(([,q]) => q.slot).map(([id,q]) => {
        const r = frRect(q); return {name:id,type:q.type,...r,image:asset(id,q.type==='duct'?drawDuct(r,false):drawRail(r,false),r.x,r.y,r.w,r.h)};
      });
      const op = { ...OPW, w:OP.w, h:OP.h, cut:OP.cut, holes:OP.holes, answer:OP.answer,
        plate:asset('op-plate',drawOpPlate()+OP_ZONES.map(z=>drawLabel(z, S.op.labels[z.id] || '')).join(''),0,0,OP.w,OP.h),
        front:asset('op-front',world0(),0,0,OP.w,OP.h),
        back:asset('op-back',worldOp(),OPW.x,OPW.y,OP.w,OP.h) };
      const routes = S.wires.map((w,i)=>({op:isOPWire(w),points:wirePts(w,i)})).filter(w=>w.points?.length>1);
      return { assets, layout: { panel:PANEL, frames, devices, op, conveyor:{x:CVW.x,y:CVW.y,L:CONV.L,w:CVW.bw,mx:CVW.mx,mw:CVW.mw,mh:CVW.mh,s1:CONV.s1,s2:CONV.s2}, labels:TB_LABELS, routes, sourceVersion:APP_VER.v } };
    });
    const out = path.join(root, 'lab-3d/reference'); await fs.mkdir(out, {recursive:true});
    for (const [name,content] of Object.entries(data.assets)) await fs.writeFile(path.join(out,name),content);
    await fs.writeFile(path.join(out,'layout.json'),JSON.stringify(data.layout));
    console.log(`${data.layout.devices.length} devices, ${data.layout.frames.length} frames, ${data.layout.routes.length} wire routes exported`);
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1});
