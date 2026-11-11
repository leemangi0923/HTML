// Compare actual scene primitives and camera work; this is not a display FPS test.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
(async()=>{
  const html=await readFile(resolve(__dirname,'..','index.html'));
  const server=createServer((_,res)=>res.end(html));let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));S.selfChk={'1-4':true};S.usedFill=false;S.elapsed=1000;showSettings();});
    const result=await page.evaluate(()=>{
      const before=JSON.stringify({...S,elapsed:0}),terms=JSON.stringify(TERMS),cam={...UI.cam},rows=[];
      for(const enabled of [true,false]){
        for(const key of GRAPHICS_KEYS)SET[key]=enabled;setApply();UI.cam={...cam};applyCam();
        let faces=0,paths=0,order=0;const a=updateSurfaceProjection,b=projectedPath,c=updateDepthOrder;
        updateSurfaceProjection=(...args)=>{faces++;return a(...args);};projectedPath=(...args)=>{paths++;return b(...args);};updateDepthOrder=(...args)=>{order++;return c(...args);};
        const start=performance.now();
        try{for(let i=0;i<6;i++){UI.cam.x+=25;UI.cam.y-=8;applyCam();}}
        finally{updateSurfaceProjection=a;projectedPath=b;updateDepthOrder=c;}
        rows.push({mode:enabled?'all-on':'all-off',worldNodes:gWorld.querySelectorAll('*').length,
          lightingLayers:gWorld.querySelectorAll('.edge-light,.side-light').length,wireShine:gWorld.querySelectorAll('.wire-shine').length,
          projectionPaths:PROJECTION.paths.length,cameraChanges:6,faceUpdates:faces,pathProjections:paths,depthUpdates:order,cameraWorkMs:+(performance.now()-start).toFixed(2)});
      }
      return{rows,sameWork:JSON.stringify({...S,elapsed:0})===before,sameTerminals:JSON.stringify(TERMS)===terms,score:scoreSheet().total};
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
