const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('ranking SQL enforces owner isolation, payload bounds, best-only ordering, ties and submission limits',async()=>{
 const db=new PGlite();const sql=readFileSync(require('node:path').join(__dirname,'..','supabase/ranking.sql'),'utf8');
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;insert into auth.users values ('${a}'),('${b}');`);
 await db.exec(sql);
 const as=async(role,owner='')=>{await db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${owner}',false);`);};
 const submit=(mode,id,name,t,score=null,bad=null)=>db.query('select public.task1_submit_record($1,$2,$3,$4,$5,$6,$7)',[mode,id,name,t,score,bad,'2.19.0']);
 const unlock=async()=>{await db.exec("reset role;update task1_private.submit_limits set submitted_at=now()-interval '10 seconds'");};
 await as('anon');await assert.rejects(submit('fault','one','학생',10000),/permission denied/);await assert.rejects(db.query('select * from task1_private.best_records'),/permission denied/);
 await as('authenticated');await assert.rejects(submit('fault','one','학생',10000),/LOGIN_REQUIRED/);
 await as('authenticated',a);await assert.rejects(submit('exam','bad','학생',10000,31),/INVALID_RECORD/);await assert.rejects(submit('fault','bad','학생',0),/INVALID_RECORD/);await assert.rejects(submit('strip','bad','학생',10000,null,-1),/INVALID_RECORD/);
 await submit('exam','a','동명이인',30000,29);await submit('exam','a','동명이인',30000,29);
 await assert.rejects(submit('fault','rate','학생',10000),/RATE_LIMITED/);
 await unlock();await as('authenticated',a);await submit('exam','worse','이름변경',10000,28);
 await as('authenticated',b);await submit('exam','b','동명이인',30000,29);
 await as('anon');const list=await db.query("select * from public.task1_leaderboard('exam')");assert.equal(list.rows.length,2);assert.equal(list.rows[0].name,'동명이인');assert.equal(list.rows[1].name,'동명이인');assert.equal(String(list.rows[0].place),'1');assert.equal(String(list.rows[1].place),'1');assert.notEqual(list.rows[0].tag,list.rows[1].tag);
 await as('authenticated',a);await assert.rejects(db.query('delete from task1_private.best_records'),/permission denied/);
 await unlock();await as('authenticated',a);await submit('strip','strip-a','학생',20000,null,1);
 await as('authenticated',b);await submit('strip','strip-b','학생',50000,null,0);
 await as('anon');const strips=(await db.query("select * from public.task1_leaderboard('strip')")).rows;assert.equal(strips[0].bad,0);assert.equal(strips[1].bad,1);
 await db.exec('reset role');await db.exec(sql);assert.equal((await db.query('select count(*) from task1_private.best_records')).rows[0].count,4);
 }finally{await db.close();}
});
