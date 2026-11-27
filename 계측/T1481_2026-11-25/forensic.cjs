'use strict';
// 저장본 사본에서만 쓰는 읽기 관찰기. 제품 원본·세계 값을 쓰지 않는다.
const Module = require('module');
const compile = Module.prototype._compile;
if (!process.env.T1481_FORENSIC) return;
Module.prototype._compile = function(src, filename) {
  if (filename.endsWith('/server/villages.js')) {
    const once = (a,b) => { if(src.split(a).length!==2) throw Error('forensic injection count: '+a);src=src.replace(a,b); };
    once("function _warEnsureDefense(body, sortie) {", "function _warEnsureDefense(body, sortie) { _t1481Forensic('defense-entry', body);");
    once("  if (!pool.length) return null;\n  const taken = new Set();", "  _t1481ForensicPool(vil,pool,warId);\n  if (!pool.length) return null;\n  const taken = new Set();");
    once("        WL.settle(f, 'walkover', 'A');", "        _t1481Forensic('walkover',body);\n        WL.settle(f, 'walkover', 'A');");
    src += `
const _t1481ForensicSeen = new Set();
function _t1481ForensicEmit(key,row) {
 if(_t1481ForensicSeen.has(key))return;_t1481ForensicSeen.add(key);
 require('fs').appendFileSync(process.env.T1481_FORENSIC,JSON.stringify(row)+'\\n');
}
function _t1481ForensicPool(vil,pool,warId) {
 const ps=(vil.npcPids||[]).map(pid=>state.deps.players.get(pid)).filter(Boolean);
 _t1481ForensicEmit('pool:'+warId+':'+vil.name,{event:'draft-pool',day:state.world.day,warId,village:vil.name,econPop:vil.econ.npcs.length,physical:ps.length,muster:ps.filter(p=>p._muster).length,simWar:ps.filter(p=>p.simWar).length,dead:ps.filter(p=>p.hp!=null&&p.hp<=0).length,eligible:pool.length});
}
function _t1481Forensic(event,body) {
 const w=body.w,ps=(w.def.npcPids||[]).map(pid=>state.deps.players.get(pid)).filter(Boolean);
 _t1481ForensicEmit(event+':'+w.id+':'+!!body.defBuilt,{event,day:state.world.day,warId:w.id,atk:w.atk.name,def:w.def.name,phase:w.phase,op:w.op,defBuilt:!!body.defBuilt,defGroup:!!body.defGroup,defPids:body.defPids&&body.defPids.length,econPop:w.def.econ.npcs.length,physical:ps.length,muster:ps.filter(p=>p._muster).length,simWar:ps.filter(p=>p.simWar).length,fight:body.fight&&body.fight.state,debug:body.fight?_warDbgSt(body.fight):null,walkover:state.war.stats().walkover});
}
`;
  }
  return compile.call(this,src,filename);
};
