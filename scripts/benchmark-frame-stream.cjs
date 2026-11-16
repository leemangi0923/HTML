// Real RAF intervals for the same full-quality camera workload, before/after.
// Internal worker-frame counts are separate from browser RAF timing.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
const mounted=process.env.BENCHMARK_MOUNTED==='1',svgOnly=process.env.BENCHMARK_SVG_ONLY==='1';
(async()=>{
  const html=await readFile(resolve(process.argv[2]||resolve(__dirname,'..','index.html'))),server=createServer((_,r)=>r.end(html));let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    await page.evaluate(({mounted,svgOnly})=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));S.finished=true;if(mounted){S.panelDocked=true;const d=panelDockPosition();positionPanel(d.x,d.y);S.mountClamps=Object.fromEntries(MOUNT_SLOTS.map(q=>[q.id,true]));renderAll();}if(svgOnly&&typeof FRAME_STREAM!=='undefined'){FRAME_STREAM.disabled=true;stopFrameStream();}hideHome();},{mounted,svgOnly});await page.waitForTimeout(100);
    const rows=[];
    for(let round=0;round<3;round++){
      await page.evaluate(mounted=>{if(mounted)return fitRoom('robot');UI.roomFocus='desk';const r=svg.getBoundingClientRect();UI.cam={x:-100,y:0,w:1100,h:1100*r.height/r.width};applyCam(r);renderOver();},mounted);
      await page.waitForFunction(()=>typeof FRAME_STREAM==='undefined'||FRAME_STREAM.disabled||frameAtlasCovers(UI.cam),{},{timeout:30000});
      await page.waitForTimeout(200);
      rows.push(await page.evaluate(async()=>{
        const frame=()=>new Promise(r=>requestAnimationFrame(r)),r=svg.getBoundingClientRect(),sx=r.left+r.width/2,sy=r.top+r.height/2;
        const stats=xs=>{xs.sort((a,b)=>a-b);return{p50Ms:+xs[Math.ceil(xs.length*.5)-1].toFixed(2),p95Ms:+xs[Math.ceil(xs.length*.95)-1].toFixed(2),over25:xs.filter(x=>x>25).length,over50:xs.filter(x=>x>50).length};};
        const state=JSON.stringify({...S,elapsed:0}),intervals=[],handlers=[],framesBefore=typeof FRAME_STREAM==='undefined'?0:FRAME_STREAM.frames;
        let applies=0,original=applyCam;applyCam=(...a)=>{applies++;return original(...a);};
        try{
          for(let i=0;i<12;i++){svg.dispatchEvent(new WheelEvent('wheel',{clientX:sx,clientY:sy,deltaY:i%2?12:-12,bubbles:true,cancelable:true}));await frame();}
          let last=await frame();
          for(let i=0;i<90;i++){
            const start=performance.now();for(let j=0;j<4;j++)svg.dispatchEvent(new WheelEvent('wheel',{clientX:sx,clientY:sy,deltaY:i%2?6:-6,bubbles:true,cancelable:true}));handlers.push(performance.now()-start);
            const t=await frame();intervals.push(t-last);last=t;
          }
          endCameraGesture();
          return{wires:S.wires.length,frames:stats(intervals),inputBursts:stats(handlers),cameraApplications:applies,workerFrames:(typeof FRAME_STREAM==='undefined'?0:FRAME_STREAM.frames)-framesBefore,streamReason:typeof FRAME_STREAM==='undefined'?'legacy':FRAME_STREAM.reason,unchanged:state===JSON.stringify({...S,elapsed:0}),allEffectsOn:GRAPHICS_KEYS.every(k=>SET[k])};
        }finally{applyCam=original;}
      }));
    }
    console.log(JSON.stringify({viewport:{width:1440,height:900},mounted,svgOnly,samplesPerRound:90,eventsPerFrame:4,rows},null,2));
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
