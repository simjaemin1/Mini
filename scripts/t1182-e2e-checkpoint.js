'use strict';
// 경계 e2e 전용: 일관된 저장 뒤 해당 프로세스를 멈춰, 관측과 SIGKILL 사이에 귀환이 끝나는 경합을 없앤다.
if(require('worker_threads').isMainThread && process.env.T1182_E2E_STOP_DIR && process.env.ZONE_ID==='nippon'){
 const fs=require('fs'),path=require('path'),Module=require('module');
 const dir=process.env.T1182_E2E_STOP_DIR,file=path.resolve(__dirname,'../server/villages.js'),old=Module._extensions['.js'];
 globalThis.__t1182Checkpoint={fs,dir,stopped:false};
 Module._extensions['.js']=function(m,f){
  if(f!==file)return old(m,f);
  const compile=m._compile;m._compile=function(src,name){return compile.call(this,src+`
;(()=>{const K=globalThis.__t1182Checkpoint,tick=tickCaravanBodies;
tickCaravanBodies=function(...a){const r=tick.apply(this,a);
 if(K.stopped || !K.fs.existsSync(K.dir+'/arm') || state.tickJobs || state._t731 || (state.saveQueue&&state.saveQueue.length))return r;
 const market=process.env.T1030_XZ_MARKET==='1';
 for(const c of state.world.caravans||[]){
  if(!c._xzHome || c._xzHome.zone!=='hanbando' || c._done || c._xzHandedBack || c.state!=='inbound')continue;
  const b=state.caravanBodies.get(c.id),p=b&&state.deps.players.get(b.pid);
  if(!b || b.c!==c || !p || p.hp<=0 || (market?(!c._t707||b.phase!=='linger'):(c._t707||b.phase!=='inbound'||!(c._returningAmt>0))))continue;
  K.stopped=true;
  try{
   _t728SaveMeta();
   const raw=state.db.getWorldMeta(state.zoneId),M=raw&&JSON.parse(raw.data),mc=M&&M.caravans.find(q=>q.id===c.id);
   if(!mc || !!mc._t707!==!!c._t707)throw new Error('checkpoint metadata mismatch');
   const before=xzonePerf();before.now=Date.now();
   K.fs.writeFileSync(K.dir+'/ready.json',JSON.stringify({target:before.caravans.find(q=>q.id===c.id),before,checkpoint:{day:M.anchor.day,t707:!!mc._t707,state:mc.state,ret:mc._returningAmt||0,from:typeof mc.from==='object'?'stub':mc.from},metrics:globalThis.__t1182Observe?.st}));
   process.kill(process.pid,'SIGSTOP');
  }catch(e){K.fs.writeFileSync(K.dir+'/ready.json',JSON.stringify({error:String(e.stack||e)}));}
  break;
 }
 return r;
};})();`,name);};
  return old(m,f);
 };
}
