#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),W=require('../server/weights'),E=require('../sim/economy-sim');
const dir=process.argv[2]||'계측/T1465_2026-11-23',D=JSON.parse(fs.readFileSync(path.join(dir,'광맥-진단.json'))),base=require('../계측/T1427_2026-11-22/요약-new.json');
const read=f=>JSON.parse(f.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(f)):fs.readFileSync(f));
const rows=[];
for(const b of base){
 const f=path.join('계측/T1427_2026-11-22/runs','new-lab-'+b.arm+'-'+b.seed,'t1407.json.gz'),r=read(f),per={};
 for(const day of Object.values(r.day))day.forEach((a,i)=>{if(!a)return;const v=per[r.names[i]]||(per[r.names[i]]={});for(const [mineral,col]of [['tin','minedTin'],['copper','minedCu']])v[mineral]=(v[mineral]||0)+(a[r.vcols.indexOf(col)]||0)*W.kgOf('ore_'+mineral)*b.yr;});
 const annualTin=b.tot.minedTin*W.kgOf('ore_tin')*b.yr,castTinPerBz=b.tot.castBz>0?b.tot.castTin*W.kgOf('tin')/b.tot.castBz:null;
 const metalsPerRawKg=E._SMELT_YIELD*W.kgOf('tin')/W.kgOf('ore_tin');
 rows.push({arm:b.arm,seed:+b.seed,source:f,observedDays:b.span,perVillageAnnualRawKg:per,worldTinRawKgYear:annualTin,
  npcTinReserveReferenceKg:D.totals.npcAccessibleMineralsKg.tin,npcTinRefillUpperKgYear:D.totals.npcRegenMaxKgPer365Days.tin,
  flowOverRefillUpper:annualTin/D.totals.npcRegenMaxKgPer365Days.tin,grossReserveYearsIgnoringRefill:annualTin>0?D.totals.npcAccessibleMineralsKg.tin/annualTin:null,
  observedRefinedTinKgPerBronzeSword:castTinPerBz,sustainableSwordsIfObservedRecipeAndLabourHold:castTinPerBz>0?D.totals.npcRegenMaxKgPer365Days.tin*metalsPerRawKg/castTinPerBz:null});
}
const other=[];
for(const arm of ['off','bundle'])for(const seed of [1020,7,42]){
 const fresh=path.join(dir,'runs-stock-off','lab-'+arm+'-'+seed,'stock.json'),fallback=arm==='off'&&seed===1020?path.join(dir,'eq/seed-1020-stock-off.json'):path.join(dir,'eq',arm+'-'+seed,'make-stock.json'),f=fs.existsSync(fresh)?fresh:fallback;
 if(!fs.existsSync(f))continue;const d=read(f),sample=f===fresh?d.final:d.annual.find(a=>a.day===730);if(!sample||d.partial===true)continue;const spanDays=sample.elapsedDays||sample.day;
 const kg={};for(const v of Object.values(sample.perVillage))for(const [id,n]of Object.entries(v.minedKg))kg[id]=(kg[id]||0)+n*365/spanDays;
 let swords=null;
 if(f===fresh){const src=path.join(dir,'runs-stock-off','lab-'+arm+'-'+seed,'t1407.json'),qfile=fs.existsSync(src)?src:src+'.gz',q=read(qfile);let tin=0,bz=0;for(const day of Object.values(q.day))for(const a of day){if(!a)continue;tin+=a[q.vcols.indexOf('castTin')]||0;bz+=a[q.vcols.indexOf('castBz')]||0;}const per=bz>0?tin*W.kgOf('tin')/bz:null,k=per>0?E._SMELT_YIELD*W.kgOf('tin')/W.kgOf('ore_tin')/per:null;swords={source:qfile,observedRefinedTinKgPerBronzeSword:per,npcSustainableSwordsIfObservedRecipeAndLabourHold:k?D.totals.npcRegenMaxKgPer365Days.tin*k:null,worldSustainableSwordsIfObservedRecipeAndLabourHold:k?D.totals.regenMaxKgPer365Days.tin*k:null};}
 other.push({arm,seed,source:f,spanDays,swords,minerals:Object.fromEntries(['tin','copper','gold','iron'].map(m=>{const flow=kg['ore_'+m]||0;return [m,{annualRawKg:flow,npcReferenceStockKg:D.totals.npcAccessibleMineralsKg[m]||0,npcRefillUpperKgYear:D.totals.npcRegenMaxKgPer365Days[m]||0,grossReserveYearsIgnoringRefill:flow>0?(D.totals.npcAccessibleMineralsKg[m]||0)/flow:null}];}))});
}
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
const csv=[['vein','minor','physical_cells','equivalent_chunks','reference_kg','mineral_reference_kg','regen_upper_kg_year','npc_mineral_reference_kg','shared_npc_cells','village_rights'].join(',')];
for(const v of D.veins)csv.push([q(v.name),v.minor,v.cells,v.chunks,v.referenceKg,q(JSON.stringify(v.mineralsKg)),q(JSON.stringify(v.regenMaxKgPer365Days)),q(JSON.stringify(v.npcAccessibleMineralsKg)),v.sharedCells,q(JSON.stringify(v.villages))].join(','));
fs.writeFileSync(path.join(dir,'광맥별.csv'),csv.join('\n')+'\n');
fs.writeFileSync(path.join(dir,'흐름-재고-진단.json'),JSON.stringify({units:'reference raw chunk kg (CHUNK_KG), actual produced ore item kg for flow; skill-dependent chunk mass means reserve/flow is a reference-scale gross estimate, not a depletion forecast',refill:'empty-cell instantaneous upper bound maintained by extraction; not an idle one-year refill; aggregate flow below this bound does not guarantee grade-first local cells stay full',attribution:'Old econ did not select physical cells. Per-vein measured extraction is not identifiable; per-village actual flows and per-vein labour rights are provided separately, without inventing an allocation.',swords:'conditional conversion using each actual run refined-tin kg / bronze-sword count and canonical SMELT_YIELD, not a new fixed recipe',old800DayTinCopper:rows,observedAllFourMinerals:other},null,2)+'\n');
console.log('veins',D.veins.length,'inherited800dayRuns',rows.length,'fullMineralRuns',other.length);
