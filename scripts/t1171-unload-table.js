'use strict';
// T1171: preload 산출물에서 표와 원 사건을 남긴다. 결과 없는 시드는 실패.
const fs = require('fs'), path = require('path');
const dir=process.argv[2];
if (!dir) throw new Error('usage: node scripts/t1171-unload-table.js <판 폴더>');
const rows=[];
for (const seed of [1020,7,42]) {
  const x=JSON.parse(fs.readFileSync(path.join(dir,`sbc-${seed}.t1171.json`),'utf8'));
  if ((x.errors || []).length) throw new Error('observer errors: '+JSON.stringify(x.errors));
  const collect=x.events.filter(e=>e.stage==='collect-before-t681');
  const loaded=collect.filter(e=>e.result && Object.values(e.result).some(v=>v>0));
  const lay=x.events.filter(e=>e.stage==='body-laydown');
  rows.push({seed,collect:collect.length,loaded:loaded.length,
    beforeProgressEnd:loaded.filter(e=>e.before.prog!=null && e.before.prog<e.before.len).length,
    targetMeasured:loaded.filter(e=>Number.isFinite(e.before.targetDistanceM)).length,
    targetZero:loaded.filter(e=>e.before.targetDistanceM===0).length,
    targetNonzero:loaded.filter(e=>e.before.targetDistanceM>0).length,
    targetMax:Math.max(0,...loaded.map(e=>e.before.targetDistanceM||0)),
    bodyLay:lay.length,bodyPositive:lay.filter(e=>e.result>0).length,
    bodyBack:lay.reduce((s,e)=>s+(e.result||0),0),
    collectedItems:loaded.reduce((o,e)=>{for(const[k,v]of Object.entries(e.result))o[k]=(o[k]||0)+v;return o;},{}),
    events:x.events.map(e=>{ for(const side of [e.before,e.after]) if(side) {
      side.storage=Object.fromEntries(Object.entries(side.storage||{}).filter(([,v])=>v!==0));
      for(const row of side.rows||[]) if(row.inventory) row.inventory=Object.fromEntries(Object.entries(row.inventory).filter(([,v])=>v!==0));
    } return e; })});
}
process.stdout.write(JSON.stringify({arms:'--war inf + assault*3 repeat, 50 days',rows})+'\n');
