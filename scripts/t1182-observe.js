'use strict';
// 계측 preload: 실제 도착 증거, 몸 없는 정산, 이동 µs. 동작 변경은 명시적 멈춤 시험뿐.
if(require('worker_threads').isMainThread && (process.env.T577_SEED || (process.env.T1182_OBSERVE_DIR && process.env.ZONE_ID))){
 const fs=require('fs'),path=require('path'),Module=require('module');
 const ROOT=path.resolve(__dirname,'..'),out=process.env.T577_OUT?process.env.T577_OUT+'.t1182.json':path.join(process.env.T1182_OBSERVE_DIR,process.env.ZONE_ID+'-'+process.pid+'.json');
 const st={runtime:{node:process.version,v8:process.versions.v8,icu:process.versions.icu},flags:{body:process.env.T762_CARAVAN_BODY,escort:process.env.T1136_ESCORT_CARRY,basket:process.env.T1136_BASKET},source:{},seed:+process.env.T577_SEED,tickN:0,tickNs:0,bodySamples:0,actorSamples:0,xzone:0,xzoneNoBody:0,basketTrade:0,basketNoBody:0,moveN:0,moveNs:0,moveMaxNs:0,trade:0,tradeNoBody:0,deposit:0,depositNoBody:0,arrive:0,arriveNoBody:0,days:[],errors:[]};
 const proofs=new WeakMap();let S=null;
 const state=()=>{if(!S){const m=require.cache[path.join(ROOT,'server/villages.js')];if(m&&m.exports.__p3Bind)S=m.exports.__p3Bind({}).state;}return S;};
 function ready(c,leg){state();const m=require.cache[path.join(ROOT,'server/villages.js')];return !!(m&&m.exports.__labProbe._caravanBodyProbe.ready(c,leg));}
 globalThis.__t1182Observe={st,proofs,ready,state};
 const old=Module._extensions['.js'];
 Module._extensions['.js']=function(m,file){
  if(file!==path.join(ROOT,'server/villages.js')&&file!==path.join(ROOT,'sim/economy-sim-v2.js'))return old(m,file);
  const compile=m._compile;m._compile=function(src,name){
   st.source[path.relative(ROOT,file)]=require('crypto').createHash('sha256').update(src).digest('hex');
   if(file.endsWith('/server/villages.js'))src+=`
;(()=>{const O=globalThis.__t1182Observe,move=_t1182Move,tick=tickCaravanBodies;
tickCaravanBodies=function(...a){const t=process.hrtime.bigint();try{return tick.apply(this,a)}finally{O.st.tickN++;O.st.tickNs+=Number(process.hrtime.bigint()-t);const b=state.caravanBodies;if(b){O.st.bodySamples+=b.size;for(const c of b.values())O.st.actorSamples+=1+(c.escorts||[]).length;}}};
_t1182Move=function(...a){if(state.world.day<=+(process.env.T1182_FREEZE_UNTIL||-1))return;const t=process.hrtime.bigint();try{return move.apply(this,a)}finally{const n=Number(process.hrtime.bigint()-t);O.st.moveN++;O.st.moveNs+=n;O.st.moveMaxNs=Math.max(O.st.moveMaxNs,n);}};})();`;
   else src+=`
;(()=>{const O=globalThis.__t1182Observe,arr=_caravanArrive,tr=_caravanTrade,dep=_homeDepositV2,ba=_t1136Arrive,xo=_xzHandOff,xb=_xzHandBack;
_t1136Arrive=function(w,c,...a){O.st.basketTrade++;if(!O.ready(c,'outbound'))O.st.basketNoBody++;return ba.call(this,w,c,...a);};
_xzHandOff=function(w,c,...a){O.st.xzone++;if(!O.ready(c,'outbound'))O.st.xzoneNoBody++;return xo.call(this,w,c,...a);};
_xzHandBack=function(w,c,...a){O.st.xzone++;if(!O.ready(c,'inbound'))O.st.xzoneNoBody++;return xb.call(this,w,c,...a);};
_caravanArrive=function(w,c,...a){const had=O.ready(c,'outbound'),s=c.state,to=c.to;O.proofs.set(c,had);const r=arr.call(this,w,c,...a);if(c.state!==s||c.to!==to||c._done){O.st.arrive++;if(!had)O.st.arriveNoBody++;O.proofs.set(c,had);}return r;};
_caravanTrade=function(w,c,...a){O.st.trade++;if(!O.ready(c,'market') && !O.ready(c,'outbound'))O.st.tradeNoBody++;return tr.call(this,w,c,...a);};
_homeDepositV2=function(c,...a){O.st.deposit++;if(!O.ready(c,'inbound'))O.st.depositNoBody++;return dep.call(this,c,...a);};})();`;
   return compile.call(this,src,name);
  };return old(m,file);
 };
 const Ev=require(path.join(ROOT,'server/events')),mk=Ev.createLedger;
 Ev.createLedger=function(...a){const L=mk.apply(this,a),scan=L.scanDay;L.scanDay=function(w,day,...b){try{const s=state();st.days.push({day:w.day,trade:w.tradeLog.length,caravans:w.caravans.length,bodies:s&&s.caravanBodies?s.caravanBodies.size:0});}catch(e){st.errors.push(String(e));}return scan.call(this,w,day,...b);};return L;};
 const dump=()=>{st.tickUs=st.tickN?st.tickNs/st.tickN/1000:0;st.meanBodies=st.tickN?st.bodySamples/st.tickN:0;st.meanActors=st.tickN?st.actorSamples/st.tickN:0;st.moveUs=st.moveN?st.moveNs/st.moveN/1000:0;fs.writeFileSync(out,JSON.stringify(st));};
 process.on('exit',dump);
 if(process.env.T1182_OBSERVE_DIR)setInterval(dump,5000).unref();
}
