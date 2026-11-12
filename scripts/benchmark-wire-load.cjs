// Real requestAnimationFrame intervals in a controlled headless browser.
// This compares wire-heavy editing, not the user's hardware FPS.
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
(async()=>{
  const html=await readFile(resolve(process.argv[2]||resolve(__dirname,'..','index.html')));
  const server=createServer((_,res)=>res.end(html));let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.SIM);
    const result=await page.evaluate(async()=>{
      clearInterval(LIVE.timer);const source=pClone(pracRef()),rows=[],frame=()=>new Promise(r=>requestAnimationFrame(r));
      const stats=xs=>{xs.sort((a,b)=>a-b);return{p50Ms:+xs[Math.ceil(xs.length*.5)-1].toFixed(2),p95Ms:+xs[Math.ceil(xs.length*.95)-1].toFixed(2),over50:xs.filter(x=>x>50).length};};
      for(const count of [40,source.wires.length]){
        const st=pClone(source);st.wires=st.wires.slice(0,count);st.finished=true;setMode('free',st);UI.cam={x:-200,y:-150,w:1300,h:976};applyCam(svg.getBoundingClientRect());setTool('wire');UI.pending='PLC.N';
        const rect=svg.getBoundingClientRect(),move=i=>svg.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+200+i%25*2,clientY:rect.top+200,pointerType:'mouse',pointerId:1,bubbles:true}));
        for(let i=0;i<15;i++){move(i);await frame();}
        const hover=[];let last=await frame();for(let i=0;i<50;i++){move(i);const t=await frame();hover.push(t-last);last=t;}
        UI.pending=null;UI.overBoard=false;UI.pointer=null;renderOver();
        let reads=0;const original=svgLocalMatrix;svgLocalMatrix=(...args)=>{reads++;return original(...args);};
        const edit=[],handler=[];let wire;
        try{last=await frame();for(let i=0;i<40;i++){
          const start=performance.now();if(i%2)S.wires.push(wire);else wire=S.wires.pop();buildTerms();renderAll();handler.push(performance.now()-start);
          const t=await frame();edit.push(t-last);last=t;
        }}finally{svgLocalMatrix=original;}
        rows.push({wires:count,worldNodes:gWorld.querySelectorAll('*').length,hoverFrames:stats(hover),editFrames:stats(edit),editHandlers:stats(handler),coordinateMatrixReads:reads,allEffectsOn:GRAPHICS_KEYS.every(k=>SET[k])});
      }return{viewport:{width:1440,height:900},hoverSamples:50,editSamples:40,rows};
    });console.log(JSON.stringify(result,null,2));
  }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
