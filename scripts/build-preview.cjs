'use strict';
const {build}=require('esbuild');
const {readFile,writeFile}=require('node:fs/promises');
const path=require('node:path');
async function buildPreview(){
  const root=path.resolve(__dirname,'..');
  const result=await build({entryPoints:[path.join(root,'preview25d/main.js')],bundle:true,minify:true,write:false,format:'iife',target:'chrome120',legalComments:'inline'});
  const template=await readFile(path.join(root,'preview25d/template.html'),'utf8');
  const css=await readFile(path.join(root,'preview25d/style.css'),'utf8');
  const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const html=template.replace('/* PREVIEW_STYLE */',()=>css).replace('/* PREVIEW_SCRIPT */',()=>js).replaceAll('PREVIEW_VERSION',version);
  await writeFile(path.join(root,'preview25d.html'),html);
  return html;
}
module.exports={buildPreview};
if(require.main===module)buildPreview().then(()=>console.log('Built offline 2.5D stage 1 preview')).catch(error=>{console.error(error);process.exitCode=1;});
