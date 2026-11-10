const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.split('/* --- 온라인 랭킹 통신:')[1].split('/* --- 온라인 랭킹 통신 끝 --- */')[0];
const fn=source.slice(source.indexOf('function createOnlineRanking'));
const factory=vm.runInNewContext(fn+'\ncreateOnlineRanking',{AbortController,setTimeout,clearTimeout,fetch});
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),map};};
const config={url:'https://yljvxdqocewwaqvlfuds.supabase.co',key:'public-test',pause:async()=>{}};
const row={id:'one',type:'fault',name:'학생',t:30000,version:'2.19.0'};
const auth={access_token:'access-test',refresh_token:'refresh-test',expires_at:9999999999};

test('online is opt-in, authenticates only for uploads, and sends public reads without a bearer token',async()=>{
 const store=storage(),calls=[];const c=factory({...config,storage:store,fetcher:async(url,options)=>{calls.push({url,options});return response(url.includes('signup')?auth:url.includes('leaderboard')?[]:true);}});
 assert.equal(c.enqueue(row),false);await c.load('fault');assert.equal(calls.length,0);
 c.enable(true);await c.load('fault');assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,undefined);
 c.enqueue(row);await c.sync();c.stop();
 const upload=calls.find(x=>x.url.includes('submit_record'));assert.equal(upload.options.headers.Authorization,'Bearer access-test');assert.equal(upload.options.redirect,'error');assert.equal(JSON.parse(upload.options.body).p_elapsed_ms,30000);
 assert.equal(c.snapshot().pending,0);assert.equal(calls.filter(x=>x.url.includes('signup')).length,1);
});

test('offline queue persists, deduplicates and retries with the same run id after restart',async()=>{
 const store=storage();const bad=factory({...config,storage:store,fetcher:async()=>{throw new Error('offline');}});
 bad.enable(true);bad.enqueue(row);bad.enqueue(row);await bad.sync();bad.stop();assert.equal(bad.snapshot().pending,1);
 let submitted;const restored=factory({...config,storage:store,fetcher:async(url,opt)=>{if(url.includes('submit_record'))submitted=JSON.parse(opt.body);return response(url.includes('signup')?auth:url.includes('leaderboard')?[]:true);}});
 await restored.sync();restored.stop();assert.equal(submitted.p_run_id,row.id);assert.equal(restored.snapshot().pending,0);
});

test('expired sessions refresh, concurrent sync is serialized and rows enqueued during upload are retained',async()=>{
 const store=storage();store.setItem('t1sim.online.session',JSON.stringify({...auth,expires_at:1}));let refresh=0,signup=0,posts=0,c;
 c=factory({...config,storage:store,fetcher:async(url)=>{if(url.includes('token?')){refresh++;return response(auth);}if(url.includes('signup'))signup++;if(url.includes('submit_record')){posts++;if(posts===1)c.enqueue({...row,id:'two',type:'strip',bad:0});}return response(url.includes('leaderboard')?[]:true);}});
 c.enable(true);c.enqueue(row);await Promise.all([c.sync(),c.sync()]);c.stop();assert.equal(refresh,1);assert.equal(signup,0);assert.equal(posts,2);assert.equal(c.snapshot().pending,0);
});

test('server setup, disabled anonymous auth and invalid records have actionable retry behavior',async()=>{
 for(const [data,status,expected] of [[{code:'PGRST202'},404,'SQL'],[{msg:'Anonymous sign-ins are disabled'},422,'Anonymous']]){
  const c=factory({...config,storage:storage(),fetcher:async()=>response(data,status)});c.enable(true);c.enqueue(row);await c.sync();c.stop();assert.equal(c.snapshot().pending,1);assert.ok(c.snapshot().message.includes(expected));
 }
 const c=factory({...config,storage:storage(),fetcher:async(url)=>response(url.includes('signup')?auth:{message:'INVALID_RECORD'},url.includes('signup')?200:400)});c.enable(true);c.enqueue(row);await c.sync();c.stop();assert.equal(c.snapshot().pending,0);assert.match(c.snapshot().message,/許容|허용/);
});

test('turning online off prevents further uploads and storage failures preserve local operation',async()=>{
 const store=storage();let calls=0;const c=factory({...config,storage:store,fetcher:async()=>{calls++;throw new Error('not used');}});c.enable(true);c.enqueue(row);c.enable(false);await c.sync();c.stop();assert.equal(calls,0);assert.equal(c.snapshot().pending,1);
 const blocked=factory({...config,storage:{getItem:()=>null,setItem:()=>{throw new Error('full');}},fetcher:async()=>{throw new Error('not used');}});assert.equal(blocked.enable(true),false);assert.equal(blocked.snapshot().enabled,false);
});

test('desktop network policy and CSP allow only the configured ranking origin and specific endpoints',()=>{
 const {origin,allowedRankingRequest:allow}=require('../desktop/ranking-policy.cjs');
 for(const method of ['POST','OPTIONS'])assert.equal(allow(origin+'/rest/v1/rpc/task1_leaderboard',method),true);
 for(const url of [origin+'/rest/v1/anything',origin+'/auth/v1/admin/users',origin+'.evil.test/rest/v1/rpc/task1_submit_record','https://example.com'])assert.equal(allow(url,'POST'),false);
 assert.equal(allow(origin+'/auth/v1/token?grant_type=refresh_token','POST'),true);assert.equal(allow(origin+'/auth/v1/token?grant_type=password','POST'),false);assert.equal(allow(origin+'/auth/v1/signup','GET'),false);assert.ok(html.includes("url:'"+origin+"'"));
});


test('opting out stops transmission even when storage writes fail',async()=>{
 const store=storage();let calls=0;const c=factory({...config,storage:store,fetcher:async()=>{calls++;return response(auth);}});
 c.enable(true);c.enqueue(row);store.setItem=()=>{throw new Error('full');};
 c.enable(false);await c.sync();c.stop();assert.equal(c.snapshot().enabled,false);assert.equal(calls,0);assert.equal(c.snapshot().pending,1);
});
