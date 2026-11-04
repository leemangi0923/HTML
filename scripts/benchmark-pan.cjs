// Synthetic input-burst benchmark; counts work, not display FPS.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
(async()=>{
  const html=await readFile(resolve(process.argv[2]||resolve(__dirname,'..','index.html')));
  const server=createServer((_,res)=>res.end(html));let browser;
  try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));hideHome();});await page.waitForTimeout(100);
    const result=await page.evaluate(async()=>{
      const r=svg.getBoundingClientRect(),cam0={...UI.cam},sx=r.left+100,sy=r.top+100;
      UI.gesture={type:'pan',sx,sy,cam0,rect:r};document.body.classList.add('panning');
      let writes=0,reads=0,calls=0;const set=svg.setAttribute.bind(svg),get=svg.getBoundingClientRect.bind(svg),apply=applyCam;
      svg.setAttribute=(key,...args)=>{if(key==='viewBox')writes++;return set(key,...args);};
      svg.getBoundingClientRect=(...args)=>{reads++;return get(...args);};applyCam=(...args)=>{calls++;return apply(...args);};
      const start=performance.now();
      for(let i=1;i<=120;i++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:sx+i,clientY:sy+i*.3,pointerType:'mouse',pointerId:1,buttons:4,bubbles:true}));
      const dispatchMs=performance.now()-start;
      await new Promise(done=>requestAnimationFrame(done));
      return {events:120,viewBoxWrites:writes,boardRectReads:reads,cameraApplications:calls,dispatchMs:+dispatchMs.toFixed(2),worldNodes:gWorld.querySelectorAll('*').length};
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
