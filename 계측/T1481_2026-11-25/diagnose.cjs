'use strict';
// 계측 전용 프리로드: 제품 파일은 쓰지 않는다. 같은 인자·반환값·호출 순서를 유지한다.
// T1481_DIAG=<jsonl> NODE_OPTIONS='-r <이 파일>' ... t1308-long-run.js
const fs = require('fs'), path = require('path'), Module = require('module');
if (!process.env.T1481_DIAG) return;
const compile = Module.prototype._compile;
function once(src, from, to) {
  if (src.split(from).length !== 2) throw new Error('T1481 injection count: ' + from);
  return src.replace(from, to);
}
Module.prototype._compile = function(src, filename) {
  if (filename.endsWith('/server/zone.js')) src += '\nglobalThis.__t1481Rock = isRockTileLocal;\n';
  if (filename.endsWith('/server/war-live.js')) {
    src = once(src, 'const t = g.detour.target(tx, ty);', 'const t = (globalThis.__t1481Unit = u.pid, g.detour.target(tx, ty)); globalThis.__t1481Unit = null;');
  }
  if (filename.endsWith('/server/villages.js')) {
    src = once(src, 'function _warStandNear(cx, cy) {', 'function _t1481StandOriginal(cx, cy) {');
    src = once(src, '(x, y) => _warBlockedCell(x / SZ, y / SZ)', '(x, y) => _t1481Cell(x / SZ, y / SZ)');
    src = once(src, 'function tickWarBodies(now) {', 'function _t1481TickOriginal(now) {');
    src = once(src, 'function _warTickOne(w, body, now, dtMs, C) {', 'function _t1481OneOriginal(w, body, now, dtMs, C) {');
    src += `
const _t1481 = {day:-1, ticks:0, oneTicks:0, calls:0, scans:0, blocked:0, terrain:0, rock:0, repeat:0, identified:0, nulls:0, body:null, depth:0, seen:new Map(), gen:null, unique:new Set(), rockMemo:new Map(), perTickMax:0, tickCalls:0};
function _t1481Active() { return state.world && state.world.day >= +(process.env.T1481_FROM || 869); }
function _t1481Write() {
  const D=_t1481; if(D.day<0) return;
  const bodies=[]; if(state.warBodies) for(const b of state.warBodies.values()) {
    const f=b.fight; const units=f&&f.ctx&&f.ctx.units||[];
    const sides={}; for(const side of ['A','B']) { const us=units.filter(u=>u.side===side&&u.hp>0); sides[side]={alive:us.length,ctl:us.filter(u=>u.ctl).length,states:us.reduce((a,u)=>(a[u.st]=(a[u.st]||0)+1,a),{}),hp:us.reduce((a,u)=>a+u.hp,0)}; }
    bodies.push({id:b.w.id,atk:b.w.atk.name,def:b.w.def.name,born:b.w.born,warAge:state.world.day-b.w.born,phase:b.w.phase,op:b.w.op,fight:f&&f.state,debug:f?_warDbgSt(f):null,sides});
  }
  const row={day:D.day,snapshotDay:state.world.day,pid:process.pid,ticks:D.ticks,warTicks:D.oneTicks,calls:D.calls,callsPerTick:D.ticks?D.calls/D.ticks:null,callsPerWarTick:D.oneTicks?D.calls/D.oneTicks:null,perTickMax:D.perTickMax,scans:D.scans,scansPerCall:D.calls?D.scans/D.calls:null,uniqueCells:D.unique.size,blocked:D.blocked,blockedPct:D.scans?100*D.blocked/D.scans:null,terrainBlocked:D.terrain,rock:D.rock,rockPct:D.scans?100*D.rock/D.scans:null,identified:D.identified,repeat:D.repeat,repeatPct:D.identified?100*D.repeat/D.identified:null,nulls:D.nulls,cache:{hit:_t1349Stand.hit,miss:_t1349Stand.miss,size:_t1349Stand.m.size},rss:process.memoryUsage().rss,war:state.war&&state.war.stats(),bodies};
  require('fs').appendFileSync(process.env.T1481_DIAG,JSON.stringify(row)+'\\n');
}
function tickWarBodies(now) {
  if(!_t1481Active()) return _t1481TickOriginal(now);
  const D=_t1481, day=state.world.day;
  if(D.day!==day) { _t1481Write(); D.day=day; for(const k of ['ticks','oneTicks','calls','scans','blocked','terrain','rock','repeat','identified','nulls','perTickMax']) D[k]=0; D.unique.clear(); }
  D.ticks++; D.tickCalls=0;
  try { return _t1481TickOriginal(now); } finally { D.perTickMax=Math.max(D.perTickMax,D.tickCalls); }
}
function _warTickOne(w,body,now,dtMs,C) { const old=_t1481.body; _t1481.body=w.id; if(_t1481Active())_t1481.oneTicks++;try{return _t1481OneOriginal(w,body,now,dtMs,C);}finally{_t1481.body=old;} }
function _warStandNear(cx,cy) {
  if(!_t1481Active()) return _t1481StandOriginal(cx,cy);
  const D=_t1481; D.calls++; D.tickCalls++;
  if(D.gen!==state._warRectCells) {D.gen=state._warRectCells;D.seen.clear();}
  const pid=globalThis.__t1481Unit;
  if(pid!=null&&D.body!=null) { D.identified++; const key=D.body+':'+pid+':'+cx+','+cy; if(D.seen.has(key)) D.repeat++; else D.seen.set(key,1); }
  D.depth++; try { const r=_t1481StandOriginal(cx,cy);if(!r)D.nulls++;return r;} finally {D.depth--;}
}
function _t1481Cell(cx,cy) {
  const r=_warBlockedCell(cx,cy),D=_t1481;
  if(_t1481Active()&&D.depth) {D.scans++;if(r)D.blocked++;const ix=Math.floor(cx),iy=Math.floor(cy),k=ix*65536+iy;D.unique.add(k);if(state._warTerrMemo&&state._warTerrMemo.get(k)===1)D.terrain++;if(globalThis.__t1481Rock){if(!D.rockMemo.has(k))D.rockMemo.set(k,globalThis.__t1481Rock(ix*SZ+SZ/2,iy*SZ+SZ/2));if(D.rockMemo.get(k))D.rock++;}}
  return r;
}
process.on('exit',_t1481Write);
`;
  }
  return compile.call(this,src,filename);
};
