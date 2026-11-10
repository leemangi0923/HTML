// Rasterize our existing SVG drawings so Godot preserves their text and patterns.
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),src=path.join(root,'lab-3d/reference'),out=path.join(root,'godot-workshop/assets');
 const server=createServer(async(req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><html><body></body></html>');return}try{const name=path.basename(new URL(req.url,'http://localhost').pathname);const data=await fs.readFile(path.join(src,name));res.writeHead(200,{'Content-Type':name.endsWith('.svg')?'image/svg+xml':'text/plain'}).end(data)}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const data=JSON.parse(await fs.readFile(path.join(src,'layout.json'),'utf8'));
  for(const name of (await fs.readdir(src)).filter(n=>n.endsWith('.svg'))){
   const png=await page.evaluate(async name=>{const img=new Image();img.src=name;await img.decode();const c=document.createElement('canvas');c.width=Math.min(img.width*2,4096);c.height=Math.round(img.height*c.width/img.width);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},name);
   await fs.writeFile(path.join(out,'faces',name.replace('.svg','.png')),Buffer.from(png,'base64'));
  }
  const hmi=await page.evaluate(async cut=>{const img=new Image();img.src='op-front.svg';await img.decode();const c=document.createElement('canvas');c.width=Math.round((cut.w+8)*3);c.height=Math.round((cut.h+8)*3);c.getContext('2d').drawImage(img,(cut.x-4)*3,(cut.y-4)*3,(cut.w+8)*3,(cut.h+8)*3,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},data.op.cut);
  await fs.writeFile(path.join(out,'faces/hmi.png'),Buffer.from(hmi,'base64'));
  const image=p=>'res://assets/faces/'+path.basename(p).replace('.svg','.png');
  const layout={panel:data.panel,devices:data.devices.map(d=>({...d,terminals:d.terminals||[],image:image(d.image)})),frames:data.frames.map(f=>({...f,image:image(f.image)})),op:{...data.op,plate:image(data.op.plate),front:image(data.op.front),back:image(data.op.back)},conveyor:data.conveyor};
  await fs.writeFile(path.join(out,'layout.json'),JSON.stringify(layout,null,2)+'\n');console.log('Godot assets ready: '+layout.devices.length+' devices');
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
