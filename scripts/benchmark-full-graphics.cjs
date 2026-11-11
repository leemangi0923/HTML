// Full-quality CPU work comparison. Timings are synthetic, not display FPS.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
(async()=>{
  const html=await readFile(resolve(process.argv[2]||resolve(__dirname,'..','index.html')));
  const server=createServer((_,res)=>res.end(html));let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));S.selfChk={'1-4':true};S.usedFill=false;S.finished=true;S.elapsed=1000;renderAll();});
    await page.waitForTimeout(80);
    const result=await page.evaluate(()=>{
      const state=JSON.stringify(S),terms=JSON.stringify(TERMS),rect=svg.getBoundingClientRect(),pan=[],animation=[],unchanged=[];
      const median=a=>+a.sort((x,y)=>x-y)[Math.floor(a.length/2)].toFixed(2);
      for(let round=0;round<5;round++){
        UI.cam={x:-200,y:-150,w:1300,h:976};applyCam(rect);
        let start=performance.now();for(let i=0;i<6;i++){UI.cam.x+=25;UI.cam.y-=8;applyCam(rect);}pan.push(performance.now()-start);
        start=performance.now();for(let i=0;i<6;i++){UI.cam.x-=25;UI.cam.y+=8;applyCam();}animation.push(performance.now()-start);
        start=performance.now();for(let i=0;i<5;i++)renderWorld(false);unchanged.push(performance.now()-start);
      }
      // Warm the same views before counting cache work.
      let inside=false,lookups=0,prepares=0;const a=projectedPath,b=projectionBinding,c=prepareProjection;
      projectedPath=(...args)=>{inside=true;try{return a(...args);}finally{inside=false;}};
      projectionBinding=(...args)=>{if(inside)lookups++;return b(...args);};prepareProjection=(...args)=>{prepares++;return c(...args);};
      try{for(let i=0;i<6;i++){UI.cam.x+=25;UI.cam.y-=8;applyCam(rect);}for(let i=0;i<5;i++)renderWorld(false);}
      finally{projectedPath=a;projectionBinding=b;prepareProjection=c;}
      return{allEffectsOn:GRAPHICS_KEYS.every(k=>SET[k]),worldNodes:gWorld.querySelectorAll('*').length,lightingLayers:gWorld.querySelectorAll('.edge-light,.side-light').length,
        sixPanMedianMs:median(pan),sixAnimatedCameraMedianMs:median(animation),fiveUnchangedSceneMedianMs:median(unchanged),vertexLookups:lookups,scenePreparations:prepares,
        sameWork:state===JSON.stringify(S),sameTerminals:terms===JSON.stringify(TERMS),score:scoreSheet().total};
    });console.log(JSON.stringify(result,null,2));
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
