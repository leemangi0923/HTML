'use strict';
// The renderer receives only display state; feed URLs and installer paths stay here.
function createUpdates(updater, enabled, publish, flush) {
  updater.autoDownload=false;
  updater.autoInstallOnAppQuit=false;
  updater.allowPrerelease=false;
  updater.allowDowngrade=false;
  updater.disableDifferentialDownload=true;
  let state={phase:enabled?'idle':'disabled',visible:false,version:'',percent:0};
  const set=patch=>{state={...state,...patch};publish({...state});};
  const fail=()=>set({phase:'error'});
  updater.on('checking-for-update',()=>set({phase:'checking'}));
  updater.on('update-available',info=>set({phase:'available',visible:true,version:String(info.version).slice(0,64),percent:0}));
  updater.on('update-not-available',()=>set({phase:'current',version:'',percent:0}));
  updater.on('download-progress',p=>set({phase:'downloading',percent:Math.max(0,Math.min(100,Number(p.percent)||0))}));
  updater.on('update-downloaded',info=>set({phase:'downloaded',visible:true,version:String(info.version).slice(0,64),percent:100}));
  updater.on('error',fail);
  async function check(manual=false) {
    if(manual)set({visible:true});
    if(!enabled || ['checking','downloading','downloaded','installing'].includes(state.phase))return {...state};
    set({phase:'checking'});
    try{await updater.checkForUpdates();}catch{fail();}
    return {...state};
  }
  async function action(name) {
    if(name==='check')return check(true);
    if(name==='dismiss'){set({visible:false});return {...state};}
    if(!enabled)return {...state};
    if(name==='download' && state.phase==='available') {
      set({phase:'downloading',visible:true});
      try{await updater.downloadUpdate();}catch{fail();}
    } else if(name==='install' && state.phase==='downloaded') {
      set({phase:'installing'});try{flush();updater.quitAndInstall(true,true);}catch{fail();}
    }
    return {...state};
  }
  return {check,action,snapshot:()=>({...state})};
}
module.exports={createUpdates};
