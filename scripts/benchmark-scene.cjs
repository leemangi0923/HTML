// Same-scene before/after probe: synthetic input work and DOM churn, not FPS.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
(async()=>{
  const html=await readFile(resolve(process.argv[2]||resolve(__dirname,'..','index.html')));
  const server=createServer((_,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));S.opBack=false;buildTerms();renderAll();});
    await page.waitForTimeout(100);
    const result=await page.evaluate(async()=>{
      let baseCalls=0,tieCalls=0,added=0,removed=0;
      const calculate=calculateBasePts,drag=tieDrag;
      calculateBasePts=(...args)=>{baseCalls++;return calculate(...args);};
      tieDrag=(...args)=>{tieCalls++;return drag(...args);};
      const observer=new MutationObserver(rs=>{for(const r of rs){for(const n of r.addedNodes)added+=1+(n.querySelectorAll?.('*').length||0);for(const n of r.removedNodes)removed+=1+(n.querySelectorAll?.('*').length||0);}});
      observer.observe(gWorld,{childList:true,subtree:true});
      LIVE.inp.mcb=true;liveStep(0);await new Promise(r=>setTimeout(r,0));baseCalls=added=removed=0;
      const samples=[];
      for(let i=0;i<20;i++){const start=performance.now();liveDown('pb1');liveRelease();samples.push(performance.now()-start);}
      await new Promise(r=>setTimeout(r,0));samples.sort((a,b)=>a-b);
      const live={presses:20,baseCalculations:baseCalls,addedNodes:added,removedNodes:removed,medianMs:+samples[10].toFixed(2),p95Ms:+samples[19].toFixed(2)};
      S.opBack=true;buildTerms();renderAll();fitOp();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const t=S.ties[0];tieToNew(t);const geo=tieGeo(t),r=svg.getBoundingClientRect(),sx=r.left+(geo.M.x-UI.cam.x)/UI.cam.w*r.width,sy=r.top+(geo.M.y-UI.cam.y)/UI.cam.h*r.height;
      UI.gesture={type:'tiemove',t,sx,sy,p0:{...geo.M},c0:{...t.c},rank:geo.rank,moved:true,rect:r};
      const before=JSON.stringify(t.c);baseCalls=tieCalls=added=removed=0;
      const start=performance.now();
      for(let i=1;i<=120;i++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:sx+i*.04,clientY:sy,pointerId:1,pointerType:'mouse',buttons:1,bubbles:true}));
      const dispatchMs=performance.now()-start,callsBeforeFrame=tieCalls;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const tie={events:120,callsBeforeFrame,dragCalculations:tieCalls,baseCalculations:baseCalls,addedNodes:added,removedNodes:removed,dispatchMs:+dispatchMs.toFixed(2),moved:before!==JSON.stringify(t.c)};
      UI.gesture=null;observer.disconnect();calculateBasePts=calculate;tieDrag=drag;
      return {live,tie,worldNodes:gWorld.querySelectorAll('*').length};
    });
    console.log(JSON.stringify(result,null,2));
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
