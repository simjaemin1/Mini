'use strict';
// T1248 실제 native world/DB 재기동 진단. 추가는 읽기 창과 종료 문; PID 밀기는 명시한 fixture p2에서만.
const fs=require('fs'),path=require('path'),Module=require('module');
if(!/server[\\/]zone\.js$/.test(process.argv[1]||'')||!process.env.T1248_RESTART_AUDIT)return;
const root=path.dirname(path.dirname(path.resolve(process.argv[1]))),zone=path.join(root,'server/zone.js');
const output=process.env.T1248_RESTART_AUDIT,shift=Number(process.env.T1248_RESTART_SHIFT||0);
const doc={root,shift,ticks:0,stopping:null,firstReady:null,lastSave:null,restored:null,clock:null};
const compile=Module.prototype._compile;
Module.prototype._compile=function(src,filename){
 if(filename===zone){
  if(shift){const anchor='let nextPid = 1;';if(src.split(anchor).length!==2)throw Error('PID fixture anchor missing');src=src.replace(anchor,`let nextPid = ${1+shift};`);}
  src+=`\n;global.__t1248RestartView=()=>({now:Date.now(),saved:_desSaved,owned:[..._desQ.owned],pending:[..._desPending.keys()],bodies:[...players.values()].filter(b=>b.isNpc).map(b=>({id:b.pid,stable:b._sh===undefined?null:b._sh,village:b.simVillageId,kind:b._des&&b._des.k,until:b._des&&b._des.until,task:b._lifeTask||null}))});
  const _auditCopy=()=>JSON.parse(JSON.stringify(global.__t1248RestartView()));
  const _auditSave=_desSave;_desSave=function(){const r=_auditSave.apply(this,arguments);global.__t1248RestartLastSave={view:_auditCopy(),persisted:_desStore.load()};return r;};
  const _auditRestore=_desRestore;_desRestore=function(){if(_desSaved&&npcs.size){const before=_auditCopy(),r=_auditRestore.apply(this,arguments);global.__t1248RestartRestored={before,after:_auditCopy()};return r;}return _auditRestore.apply(this,arguments);};\n`;
 }
 return compile.call(this,src,filename);
};
const V=require(path.join(root,'server/villages')),get=()=>V.__p3Bind({}).state,step=V.onGameTick;
let stopped=false;
V.onGameTick=function(){
 const r=step.apply(this,arguments),s=get();
 if(s&&s.ready&&global.__t1248RestartView){
  doc.ticks++;if(!doc.firstReady)doc.firstReady=global.__t1248RestartView();
  if(!stopped&&doc.ticks>=100){const view=global.__t1248RestartView();if(view.owned.length){stopped=true;doc.stopping=view;process.emit('SIGTERM','SIGTERM');}}
 }
 return r;
};
process.on('exit',code=>{doc.code=code;doc.lastSave=global.__t1248RestartLastSave||null;doc.restored=global.__t1248RestartRestored||null;doc.clock=global.__t745?global.__t745():null;fs.writeFileSync(output,JSON.stringify(doc,null,2));});
