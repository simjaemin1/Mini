'use strict';
// 원래 PID와 같아야 한다고 요구하지 않는다. 같은 안정 신원의 실제 새 몸에 큐가 붙었는지를 검사한다.
module.exports=function validate(first,second){
 const a=first.audit,b=second.audit;
 if(first.code!==0||second.code!==0||first.timedOut||second.timedOut||!a||!b||!a.lastSave||!b.restored||!b.stopping)return{passed:false,preconditionFailure:'native process/save/restore/observation incomplete'};
 const ids=a.lastSave.persisted.queue.owned.map(r=>r[0]);
 if(!ids.length)return{passed:false,preconditionFailure:'saved queue has no owned bodies'};
 const old=new Map(a.lastSave.view.bodies.map(r=>[r.id,r])),saved=new Map(a.lastSave.persisted.bodies.map(r=>[r.id,r]));
 const stable=new Map(b.stopping.bodies.filter(r=>r.stable!==null).map(r=>[String(r.stable),r]));
 const after=new Map(b.restored.after.bodies.map(r=>[r.id,r])),owners=new Map(b.restored.after.owned),pending=new Set(b.stopping.pending);
 const rows=ids.map(id=>{const before=old.get(id),target=before&&stable.get(String(before.stable)),applied=target&&after.get(target.id),row=saved.get(id);return{savedRuntimeId:id,savedStable:before&&before.stable,currentRuntimeForStable:target?target.id:null,stableActorPresent:!!target,restoreOwnsCurrentRuntime:!!(target&&owners.has(target.id)),savedKind:row&&row._des&&row._des.k,restoredKind:applied&&applied.kind,oldRuntimeStillPending:pending.has(id),boundToCorrectStable:!!(before&&before.stable!==null&&target&&applied&&applied.stable===before.stable&&owners.has(target.id)&&row&&row._des&&applied.kind===row._des.k&&!pending.has(id))};});
 const wrong=rows.filter(r=>!r.boundToCorrectStable);
 return{passed:wrong.length===0&&a.clock&&a.clock.errs===0&&b.clock&&b.clock.errs===0,savedOwned:ids.length,wrongBindings:wrong.length,stableActorsPresentButNotBound:wrong.filter(r=>r.stableActorPresent).length,pendingAfterReady:b.stopping.pending,rows,first:{code:first.code,ticks:a.ticks,clockErrors:a.clock&&a.clock.errs},second:{code:second.code,ticks:b.ticks,clockErrors:b.clock&&b.clock.errs},scope:'binding only; not full world atomicity, progress conservation or downtime rebase proof'};
};
