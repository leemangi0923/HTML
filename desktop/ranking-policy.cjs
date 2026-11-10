'use strict';
const origin='https://yljvxdqocewwaqvlfuds.supabase.co';
function allowedRankingRequest(raw,method){
  try {
    const u=new URL(raw);if(u.origin!==origin||u.username||u.password||!['POST','OPTIONS'].includes(method))return false;
    if(u.pathname==='/auth/v1/token')return u.search==='?grant_type=refresh_token';
    return !u.search&&['/auth/v1/signup','/rest/v1/rpc/task1_leaderboard','/rest/v1/rpc/task1_submit_record'].includes(u.pathname);
  }catch(_){return false;}
}
module.exports={origin,allowedRankingRequest};
