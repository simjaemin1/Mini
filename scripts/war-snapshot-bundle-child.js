'use strict';
// Writer mutation: omit a bundle before graph traversal, never edit live game objects.
process.env.T1517_WAR_SNAP='1';
const assert=require('assert'),u=require('util'),G=require('../server/war-snapshot'),F=require('./lib-war-snap-fixture'),{semantic}=require('./test-war-snapshot');
const f=F.create(42);const w=f.mobilize();let b;
for(let d=0;d<8;d++){for(let n=0;n<900;n++){f.tick();b=f.H.state.warBodies.get(w.id);if(b?.fight?.ctx.arrows.length)break;}if(b?.fight?.ctx.arrows.length)break;f.day();}
assert(b?.fight?.ctx.arrows.length,'native in-flight projectile exposure');
f.H.state._warNoCollide=false;f.deps.isTerrainBlockedLocal=(x,y)=>Math.floor(x/32)===500&&Math.floor(y/32)>=200&&Math.floor(y/32)<=600;f.H._warBuildRectIndex(true);
const mem=b._snapshotProbe={};f.H._t804Way(mem,480.5,400.5,600.5,400.5,1/15,b);assert(mem._t821s?.S,'native pending worker exposure');
const source=f.at(()=>f.H._warSnapPack()),before=semantic(source),kind=+process.argv[2];let hit=0;
const definitions=[
 [b,['pids','defPids','defBuilt','instantiated']], // 미끼① 전쟁 몸 지휘·행군·명부
 [b,['atkGroup','defGroup','retGroup','campPt']], // 미끼② 대형·포진 연결
 [mem,Object.keys(mem).filter(k=>/^_t(804|821)/.test(k))], // 미끼③ 실제 진행 중 걸음 기억
 [b.fight.ctx,['units']], // 미끼④ battle unit membership/order
 [b.fight.ctx,['sides']], // 미끼⑤ 실제 탄·사기/군량 ctx
 [b.fight.ctx,['arrows']], // 미끼⑥ 실제 비행탄
 [b.fight,['$rng']], // 미끼⑦ RNG current-state projection
 [b.fight,['state','t','gapT','contactT','bestGap','adv','holder','engagedOnce']], // 미끼⑧ fight control/time
];assert(kind>=1&&kind<=8);const[target,keys]=definitions[kind-1],pack=G.pack;
G.pack=(root,hooks={})=>pack(root,{...hooks,project(o){const p=hooks.project?.(o);if(o!==target)return p;const data=p?p.data:o;hit++;assert(keys.some(k=>Object.hasOwn(data,k)),'mutant hits a present field');return{type:p?.type||'object',data:Object.fromEntries(Object.entries(data).filter(([k])=>!keys.includes(k)))};}});
const broken=f.at(()=>f.H._warSnapPack());G.pack=pack;assert(hit>0,'writer projection actually omitted its bundle');
try{f.at(()=>f.H._warSnapRestore(broken));}catch(e){if(e.code==='WAR_SNAP_INVALID')assert.fail('independent complete-state contract rejects missing bundle '+kind);throw e;}
assert(u.isDeepStrictEqual(semantic(f.at(()=>f.H._warSnapPack())),before),'missing bundle '+kind+' must not match the complete native state');
