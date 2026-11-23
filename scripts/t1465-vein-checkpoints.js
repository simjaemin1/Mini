#!/usr/bin/env node
'use strict';
// Read retained canonical snapshots. Untouched physical cells remain full;
// overlapping veins receive the same expected-share attribution as diagnosis.
const fs=require('fs'),path=require('path'),z=require('zlib'),v8=require('v8'),assert=require('assert');
const T=require('../server/terrain'),S=require('../server/specialty'),{ZONES}=require('../server/zone-config'),SZ=require('../server/pathfind').CELL;
T.setZonesMeta(ZONES);
const args=process.argv.slice(2),partial=args.includes('--partial'),root=args.find(a=>!a.startsWith('--'))||'계측/T1465_2026-11-23',D=JSON.parse(fs.readFileSync(path.join(root,'광맥-진단.json'))),ores=T._getHardcoded()[D.zone].ores,index=new Map(ores.map((o,i)=>[o,i]));
const rows=[],checks=[];
for(const stock of ['off','on'])for(const day of [3650,10585,10950]){
 const dir=path.join(root,'long',`bundle-${stock}-42/checkpoints/day-${String(day).padStart(5,'0')}`);
 if(partial&&!fs.existsSync(path.join(dir,'ready.json')))continue;
 const ready=JSON.parse(fs.readFileSync(path.join(dir,'ready.json')));
 assert.strictEqual(ready.day,day);assert.strictEqual(ready.stockOn,stock==='on');
 const body=v8.deserialize(z.gunzipSync(fs.readFileSync(path.join(dir,'world.v8.gz')))),w=body.world;
 assert.strictEqual(w.day,day);
 const deficit=new Map(),minerals={};let physicalDeficit=0;
 for(const[key,r]of Object.entries(w._oreStock?.cells||{})){
  const split=key.lastIndexOf(':'),zone=key.slice(0,split),[cx,cy]=key.slice(split+1).split(',').map(Number);
  assert.strictEqual(zone,D.zone);
  const missing=(S.ORE_K-S.oreRegen(r.s,Math.max(0,day-r.day)))*S.CHUNK_KG;
  assert(missing>=-1e-8);physicalDeficit+=missing;
  const candidates=T.oreCandidatesAt(zone,cx*SZ+SZ/2,cy*SZ+SZ/2),sum=candidates.reduce((n,c)=>n+c.p,0);
  assert(sum>0);
  for(const c of candidates){const i=index.get(c.o);assert(i!==undefined);deficit.set(i,(deficit.get(i)||0)+missing*c.p/sum);}
  for(const[m,f]of Object.entries(T.oreMixAt(zone,cx*SZ+SZ/2,cy*SZ+SZ/2)))minerals[m]=(minerals[m]||0)+missing*f;
 }
 const source=JSON.parse(fs.readFileSync(path.join(dir,'stock.json'))).final;
 for(const[m,n]of Object.entries(D.totals.mineralsKg))assert(Math.abs((n-(minerals[m]||0))-source.worldRemainingKg[m])<1e-5,m+' stock mismatch');
 const attributed=[...deficit.values()].reduce((a,b)=>a+b,0);assert(Math.abs(attributed-physicalDeficit)<1e-5,'overlap attribution mismatch');
 checks.push({stock,day,physicalDeficitReferenceKg:physicalDeficit,attributedDeficitReferenceKg:attributed,worldMineralSummaryMatched:true});
 for(const vein of D.veins){const remaining=vein.referenceKg-(deficit.get(vein.i)||0);rows.push([stock,day,day/365,vein.i,JSON.stringify(vein.name),vein.cells,vein.referenceKg,remaining,vein.referenceKg>0?100*remaining/vein.referenceKg:null]);}
}
if(!partial)assert.strictEqual(checks.length,6);
fs.writeFileSync(path.join(root,'광맥별-장기-저장시점.csv'),[['stock','day','year','vein_index','vein','physical_candidate_cells','attributed_reference_kg','remaining_reference_kg','remaining_percent'].join(','),...rows.map(r=>r.join(','))].join('\n')+'\n');
fs.writeFileSync(path.join(root,'광맥별-장기-합계검증.json'),JSON.stringify({complete:checks.length===6,definition:'10/29/30-year retained full-world snapshots; expected overlap attribution, canonical lazy refill, untouched full. OFF has no finite extraction ledger, so its full stock is a counterfactual reference, not a measured physical remainder. Annual mineral totals are separately in 결과.json; this CSV does not invent unretained annual per-vein history.',checks},null,2)+'\n');
console.log('Validated retained snapshots; wrote',rows.length,'per-vein rows.');
