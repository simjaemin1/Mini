#!/usr/bin/env node
'use strict';
// Read completed measurement artifacts only. Never starts or changes a world.
const fs=require('fs'),path=require('path'),z=require('zlib'),v8=require('v8'),assert=require('assert'),W=require('../server/weights');
const ROOT=process.argv.slice(2).find(a=>!a.startsWith('--'))||'계측/T1465_2026-11-23',partial=process.argv.includes('--partial');
const file=f=>fs.existsSync(f)?f:fs.existsSync(f+'.gz')?f+'.gz':null;
const read=f=>{const p=file(f);if(!p)return null;const b=fs.readFileSync(p);return JSON.parse(p.endsWith('.gz')?z.gunzipSync(b):b);};
const D=read(path.join(ROOT,'광맥-진단.json')),pending=[];
const done=(f,why)=>{if(!fs.existsSync(f)){pending.push(why);return false;}return true;};
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
const median=a=>{const s=a.filter(x=>x>0).sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:null;};
function composition(m,p){
 if(!p)return;
 const key=Object.keys(p.snaps).map(Number).sort((a,b)=>a-b).at(-1),rows=p.snaps[key]||[],c=p.vcols.indexOf('bronzeS');
 m.legacyShadowHolderProxy={day:key,names:rows.filter(a=>a[c]>=1).map(a=>a[0]),warning:'Legacy observer callback stack can multiply shadow stock; do not use this proxy as native bundle stock or compare different preload stacks.'};
 m.nativeCompositionTracking=p.knobs?.t1344===true;
 if(!m.nativeCompositionTracking){m.bronzeHolders=null;m.holderMeaning='Native composition tracking is OFF, so actual final bronze ownership is unknown. Legacy shadow proxy is separately labelled with its observed day.';}
}
function metrics(r,baseStarved=0,at){
 const f=at||r.final,days=f.elapsedDays??f.day,startDay=f.startDay??1,production={stone:f.stoneMadeSinceStart??f.stoneMade,bronze:f.bronzeMadeSinceStart??f.bronzeMade};
 const perVillageAnnualRawKg=Object.fromEntries(Object.entries(f.perVillage).map(([name,v])=>[name,Object.fromEntries(Object.entries(v.minedKg).map(([id,kg])=>[id,kg*365/days]))]));
 const oreAnnual={};for(const v of Object.values(perVillageAnnualRawKg))for(const[id,kg]of Object.entries(v))oreAnnual[id]=(oreAnnual[id]||0)+kg;
 const mining=r.mining.filter(a=>a[0]>=startDay&&a[0]<=f.day);
 const ratio=production.bronze>0?production.stone/production.bronze:null;
 return {node:r.node||'v24.22.1 (runner provenance)',stockOn:r.stockOn,day:f.day,days,pop:f.pop,production,stoneBronzeRatio:ratio,starvedSinceStart:f.starved-baseStarved,starvedCumulative:f.starved,emptyVillages:f.emptyVillages,bronzeHolders:f.bronzeHolders??null,
  holderMeaning:'Native _t1344BronzeStock >= 1; composition is tracked in bronze-bundle world. Default-world proxy, if needed, is separately labelled from unchanged T1385 observer.',
  mine5:{minersMean:mean(mining.map(a=>a[1])),minersFinal:mining.at(-1)?.[1],tinPriceMean:mean(mining.filter(a=>a[2]>0).map(a=>a[2])),tinPriceMedian:median(mining.map(a=>a[2])),tinPriceFinal:mining.at(-1)?.[2],annualRawKg:perVillageAnnualRawKg['광산5']||{}},
  trade:f.trade??null,oreAnnualRawKg:oreAnnual,perVillageAnnualRawKg,npcTinRemainingPercent:100*f.npcRemainingKg.tin/D.totals.npcAccessibleMineralsKg.tin,worldTinRemainingPercent:100*f.worldRemainingKg.tin/D.totals.mineralsKg.tin,
  npcRemainingPercent:Object.fromEntries(Object.entries(D.totals.npcAccessibleMineralsKg).map(([k,n])=>[k,100*f.npcRemainingKg[k]/n])),worldRemainingPercent:Object.fromEntries(Object.entries(D.totals.mineralsKg).map(([k,n])=>[k,100*f.worldRemainingKg[k]/n])),touchedCells:f.touchedCells,emptyAccessibleCells:f.emptyAccessibleCells};
}
function loadRun(dir,name,days,baseStarved=0){
 if(!done(path.join(dir,'done'),name))return null;
 const r=read(path.join(dir,'stock.json'));assert(r&&r.partial!==true&&(r.final.elapsedDays??r.final.day)===days,name+' incomplete stock result');
 const w=read(path.join(dir,'world.json'));if(w)assert.strictEqual(r.final.pop,w.base.pop,name+' population mismatch');
 const m=metrics(r,baseStarved),watch=read(path.join(dir,'stock.json.empty-events.json'));
 if(watch){assert.strictEqual(watch.scannedDays,days,name+' incomplete daily exhaustion witness');m.exhaustion={firstEmptyCellDay:watch.firstEmptyCellDay,firstDepletedVeinDay:watch.firstDepletedVeinDay,maxEmptyCells:watch.maxEmptyCells,definition:watch.definition};}
 else if(name==='no-decrement ablation'){assert.strictEqual(m.npcTinRemainingPercent,100,'ablation stock fell');m.exhaustion={firstDepletedVeinDay:{},definition:'Diagnostic copy deletes the only decrement; stock stays full by construction.'};}
 else if(r.stockOn){const bounds=read(path.join(ROOT,'단기-전체광맥-고갈상한.json')),bound=bounds?.find(b=>b.run===path.basename(dir));assert(bound&&bound.unknown.length===0,name+' missing no-exhaustion proof');m.exhaustion={firstDepletedVeinDay:{},proof:'단기-전체광맥-고갈상한.json: conservative extraction bound for every vein; cell-level first date was not recorded'};}
 else m.exhaustion={firstDepletedVeinDay:{},definition:'Feature OFF has no finite abstract extraction book; remaining full values are counterfactual reference values.'};
 const t=read(path.join(dir,'t1407.json'));if(t){const cols=Object.fromEntries(t.lcols.map((c,i)=>[c,i])),trade={};for(const leg of t.legs){const id=leg[cols.res];if(!['tin','ore_tin'].includes(id))continue;const a=trade[id]||(trade[id]={legs:0,kg:0});a.legs++;a.kg+=leg[cols.amt]*W.kgOf(id);}m.legacyRecordedTinCaravan=trade;}
 const p=read(path.join(dir,'probe.json'));composition(m,p);
 const annual=r.annual.map(a=>metrics(r,baseStarved,a));if(p&&p.knobs?.t1344!==true)for(const a of annual){a.bronzeHolders=null;a.nativeCompositionTracking=false;}
 return {metrics:m,annual};
}
const matrix=[];
for(const arm of ['off','bundle'])for(const seed of [1020,7,42]){
 const a=loadRun(path.join(ROOT,'runs-stock-off',`lab-${arm}-${seed}`),`matrix OFF ${arm} ${seed}`,800),b=loadRun(path.join(ROOT,'runs',`lab-${arm}-${seed}`),`matrix ON ${arm} ${seed}`,800);
 if(!a||!b)continue;const parity=read(path.join(ROOT,'runs-stock-off',`lab-${arm}-${seed}`,'parity.json'));assert(parity?.worldByteEqual&&parity?.probeByteEqual,'OFF legacy bytes');
 matrix.push({arm,seed,off:a,on:b,popOffRatio:b.metrics.pop/a.metrics.pop,offLegacyByteParity:parity});
}
const equilibrium=[];
for(const arm of ['off','bundle'])for(const seed of [1020,7,42]){
 const dir=path.join(ROOT,'eq',`${arm}-${seed}`);if(!done(path.join(dir,'done'),`EQ ${arm} ${seed}`))continue;
 const snap=path.join(ROOT,'eq/snapshots',`${arm}-${seed}`,`lab-hanbando-${seed}-d1900.v8.gz`),body=v8.deserialize(z.gunzipSync(fs.readFileSync(snap))),baseStarved=body.world.villages.reduce((n,v)=>n+(v._fdDeadTot||0),0);
 const status=read(path.join(dir,'continuation',arm==='off'&&seed===1020?'paired-status.json':'eq-run.json'));
 if(status?.arms)assert(status.arms.length===2&&status.arms.every(a=>a.code===0&&a.days===730),'EQ child failed');else assert(status?.complete&&status.daysPerArm===730,'EQ retry failed');
 const arms={};for(const key of ['off','stock']){const r=read(path.join(dir,'continuation',key+'.obs.stock.json'));assert(r&&r.partial!==true&&r.final.day===2630&&r.final.elapsedDays===730,'EQ short result');arms[key]={metrics:metrics(r,baseStarved),annual:r.annual.map(a=>metrics(r,baseStarved,a))};const probe=read(path.join(dir,'continuation',key+'.obs.probe.json'));composition(arms[key].metrics,probe);if(probe&&probe.knobs?.t1344!==true)for(const a of arms[key].annual){a.bronzeHolders=null;a.nativeCompositionTracking=false;}if(key==='stock'){const watch=read(path.join(dir,'continuation',key+'.obs.stock.json.empty-events.json'));assert(watch?.scannedDays===730,'EQ missing daily witness');arms[key].metrics.exhaustion=watch;}}
 equilibrium.push({arm,seed,snapshot:{file:snap,day:body.world.day,meta:body.meta,initialStarved:baseStarved},off:arms.off,on:arms.stock,popOffRatio:arms.stock.metrics.pop/arms.off.metrics.pop});
}
const long=[];
for(const stock of ['off','on']){const dir=path.join(ROOT,'long',`bundle-${stock}-42`),r=loadRun(dir,`30yr ${stock}`,10950);if(!r)continue;assert(r.annual.length===30,'long annual coverage');long.push({stock,seed:42,...r,year10:r.annual.find(a=>a.days===3650)});}
const ablation=loadRun(path.join(ROOT,'ablation/bundle-no-decrement-1020'),'no-decrement ablation',800);
if(!partial)assert(pending.length===0,'Incomplete measurements: '+pending.join(', '));
const result={complete:pending.length===0,pending,notes:['800-day two-year ruler retained; annualisation uses 365 days.','Actual daily production (800/730/10950 completed days) and native production counters; legacy T1407 uses 799/729-day buffered flow window.','Final primary matrix uses the complete24-point table and same-runner old/new OFF controls; earlier local worlds are supplemental, not mixed with remote controls.','Annual remaining stock is reference CHUNK_KG; actual skill-dependent output has a different chunk mass.','No new market balance constants, miner caps, or price tuning.'],matrix,equilibrium,long,ablation};
fs.writeFileSync(path.join(ROOT,partial?'결과-진행.json':'결과.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({complete:result.complete,matrix:matrix.length,equilibrium:equilibrium.length,long:long.length,ablation:!!ablation,pending}));
