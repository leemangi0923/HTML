const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdates}=require('../desktop/updater.cjs');
function setup(enabled=true){
 const updater=new EventEmitter(),calls=[];
 updater.checkForUpdates=async()=>{calls.push('check');};
 updater.downloadUpdate=async()=>{calls.push('download');};
 updater.quitAndInstall=(silent,restart)=>calls.push(['install',silent,restart]);
 const control=createUpdates(updater,enabled,()=>{},()=>calls.push('flush'));
 return{updater,control,calls};
}
test('updates require download and explicit install, flush first, and never install on ordinary quit',async()=>{
 const {updater,control,calls}=setup();
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
 await control.action('install');assert.deepEqual(calls,[]);
 await control.check();await control.check();assert.deepEqual(calls,['check']);
 updater.emit('update-available',{version:'2.18.0'});await control.action('download');await control.action('download');
 assert.deepEqual(calls,['check','download']);
 updater.emit('download-progress',{percent:44});assert.equal(control.snapshot().percent,44);
 updater.emit('update-downloaded',{version:'2.18.0'});assert.equal(calls.length,2);
 await control.action('dismiss');assert.equal(control.snapshot().visible,false);
 await control.action('check');assert.equal(control.snapshot().phase,'downloaded');
 await control.action('install');await control.action('install');
 assert.deepEqual(calls,['check','download','flush',['install',true,true]]);
});
test('offline checks and download failures remain retryable and development does not check',async()=>{
 const {updater,control,calls}=setup();
 updater.checkForUpdates=async()=>{throw new Error('offline');};
 await control.check();assert.equal(control.snapshot().phase,'error');assert.equal(control.snapshot().visible,false);
 await control.check(true);assert.equal(control.snapshot().visible,true);
 updater.checkForUpdates=async()=>updater.emit('update-available',{version:'2.18.0'});
 await control.check(true);assert.equal(control.snapshot().phase,'available');
 updater.downloadUpdate=async()=>{throw new Error('download');};await control.action('download');assert.equal(control.snapshot().phase,'error');
 assert.equal(calls.length,0);
 const dev=setup(false);await dev.control.check(true);await dev.control.action('download');await dev.control.action('install');assert.deepEqual(dev.calls,[]);
});
