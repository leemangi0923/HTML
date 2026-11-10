'use strict';
const {readFile,writeFile,mkdir}=require('node:fs/promises');
const {createHash}=require('node:crypto');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..');
  // HTML parsing normalizes CRLF on Windows; hash the same normalized text.
  let html=(await readFile(path.join(root,'index.html'),'utf8')).replace(/\r\n?/g,'\n');
  html=html.replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g,'');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if(scripts.length!==1)throw new Error('Expected one inline game script');
  const hash=createHash('sha256').update(scripts[0][1]).digest('base64');
  const csp=`default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
  html=html.replace('<meta charset="utf-8">',`<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  await mkdir(path.join(__dirname,'generated'),{recursive:true});
  await writeFile(path.join(__dirname,'generated','index.html'),html);
  console.log('Prepared offline desktop game with a hashed inline script policy');
})().catch(error=>{console.error(error);process.exitCode=1;});
