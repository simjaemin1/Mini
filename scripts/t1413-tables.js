#!/usr/bin/env node
'use strict';
// Audit the complete experiment before publishing tables. No partial seed pairs.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
const dir=process.argv[2];if(!dir)throw Error('measurement directory required');
const source=path.join(dir,'연간표','전체.jsonl'),rows=fs.readFileSync(source,'utf8').split('\n').filter(Boolean).map(JSON.parse);
const species=['🦌','🐗','🐇'],exchanges=[500,5000,50000,187000],shares=['1','0.25','0.1','5d'],hunters=[1,3,17],seeds=[7,1020],profiles=[['lab',0.002],['free',0.002],['lab',0.0004],['lab',0.0006]];
const key=r=>[r.sp,r.exch,r.nh,r.share,r.seed,r.cap,r.r,r.days].join('|'),byKey=new Map();
const holds=r=>typeof r.holds==='boolean'?r.holds:r.end>=0.9;
const effort=s=>s==='5d'?0.2:+s,shareName=s=>s==='5d'?'닷새에 하루':(+s*100)+'%';
const f=(n,d=3)=>Number.isFinite(n)?+n.toFixed(d):'—',name={'🦌':'사슴','🐗':'멧돼지','🐇':'토끼'};
for(const r of rows){assert(!r.skip);assert(!byKey.has(key(r)),'duplicate '+key(r));assert(r.days===365);assert(Number.isFinite(r.end));assert(r.kg===r.harv*({'🦌':33,'🐗':4,'🐇':1}[r.sp]));if(typeof r.holds!=='boolean')assert(r.end!==0.9,'rounded boundary needs remeasurement');byKey.set(key(r),r);}
for(const [cap,r] of profiles)for(const sp of species)for(const exch of exchanges)for(const share of shares)for(const nh of hunters)for(const seed of seeds)assert(byKey.has(key({cap,r,sp,exch,share,nh,seed,days:365})),'missing cell');
assert.equal(byKey.size,1152);
const profileResults=[];
for(const [cap,r]of profiles){
  const cells=[];
  for(const sp of species)for(const exch of exchanges)for(const share of shares)for(const nh of hunters){
    const pair=seeds.map(seed=>byKey.get(key({cap,r,sp,exch,share,nh,seed,days:365})));
    cells.push({sp,exch,share,nh,intensity:effort(share)*nh,holds:pair.every(holds),rows:pair});
  }
  const makeStrongest=positiveOnly=>species.map(sp=>{
    const good=cells.filter(c=>c.sp===sp&&c.holds&&(!positiveOnly||c.rows.every(x=>x.harv>0))).sort((a,b)=>b.intensity-a.intensity||b.nh-a.nh||a.exch-b.exch||shares.indexOf(a.share)-shares.indexOf(b.share));
    if(!good.length)return {sp,found:false};const top=good[0],kg=top.rows.map(x=>x.kg/x.nh),mean=kg.reduce((a,b)=>a+b,0)/kg.length;
    return {sp,found:true,exch:top.exch,share:top.share,nh:top.nh,intensity:top.intensity,kgPerHunterYear:kg,meanKg:mean,personDays:kg.map(x=>x*1200/2450),meanPersonDays:mean*1200/2450,endRatios:top.rows.map(x=>x.end),hunterDeaths:top.rows.map(x=>x.hDead),zeroHarvest:top.rows.every(x=>x.harv===0),ties:good.filter(x=>x.intensity===top.intensity).length};
  });
  profileResults.push({cap,r,rawRows:288,rawHolds:cells.reduce((n,c)=>n+c.rows.filter(holds).length,0),pairedConditions:144,pairedHolds:cells.filter(c=>c.holds).length,pairedHoldsWithoutHarvest:cells.filter(c=>c.holds&&c.rows.every(x=>x.harv===0)).length,pairedHoldsWithZeroHarvestSeed:cells.filter(c=>c.holds&&c.rows.some(x=>x.harv===0)).length,strongest:makeStrongest(false),strongestProductive:makeStrongest(true)});
}
const effects=[],common=['empty','emptied','harv','kg','kgHD','end','killed','predKill','trimmed','hDead','inj','shots','over','kb'];
for(const sp of species)for(const exch of exchanges)for(const share of shares)for(const nh of hunters)for(const seed of seeds){
  const get=cap=>byKey.get(key({sp,exch,share,nh,seed,cap,r:0.002,days:365})),a=get('lab'),b=get('free');
  const differs=common.filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
  if(exch>=50000)assert(!differs.length,'nonbinding cap changed results '+key(a)+' '+differs.join(','));
  effects.push({sp,exch,share,nh,seed,labEmpty:a.empty,labEmptied:a.emptied,freeEmpty:b.empty,freeEmptied:b.emptied,emptyDayDelta:b.empty-a.empty,emptyMetricChanged:a.empty!==b.empty||a.emptied!==b.emptied,kgDelta:b.kg-a.kg,endDelta:f(b.end-a.end,4),labHolds:holds(a),freeHolds:holds(b),anyOutcomeChanged:!!differs.length});
}
const effectConditions=new Map();
for(const e of effects){const k=[e.sp,e.exch,e.share,e.nh].join('|');if(!effectConditions.has(k))effectConditions.set(k,[]);effectConditions.get(k).push(e);}
const conditionPairs=[...effectConditions.values()];assert(conditionPairs.every(p=>p.length===2));
const effectSummary={matchedSeedRows:effects.length,emptyMetricChanged:effects.filter(x=>x.emptyMetricChanged).length,anyOutcomeChanged:effects.filter(x=>x.anyOutcomeChanged).length,holdChanged:effects.filter(x=>x.labHolds!==x.freeHolds).length,nonbindingRowsVerified:effects.filter(x=>x.exch>=50000).length,matchedConditions:conditionPairs.length,emptyMetricChangedConditions:conditionPairs.filter(p=>p.some(e=>e.emptyMetricChanged)).length,anyOutcomeChangedConditions:conditionPairs.filter(p=>p.some(e=>e.anyOutcomeChanged)).length,pairedHoldChangedConditions:conditionPairs.filter(p=>p.every(e=>e.labHolds)!==p.every(e=>e.freeHolds)).length};
const summary={complete:true,total:rows.length,inherited:rows.filter(r=>r._origin?.kind==='inherited').length,newMeasured:rows.filter(r=>r._origin?.kind==='measured').length,scope:'cap lab/free at r=.002; historical rate comparison at default cap lab',profiles:profileResults,capEffects:effectSummary};
fs.writeFileSync(path.join(dir,'표-요약.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(dir,'상한-짝차이.json'),JSON.stringify(effects,null,2)+'\n');
const csv=(file,heads,rs)=>{const cell=v=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};fs.writeFileSync(path.join(dir,file),'\ufeff'+heads.map(cell).join(',')+'\n'+rs.map(r=>heads.map(k=>cell(r[k])).join(',')).join('\n')+'\n');};
csv('전수표.csv',['sp','exch','share','nh','seed','cap','r','days','K','empty','emptied','harv','kg','kgHD','kgPerHunterDay','kgPerScheduledHunterDay','end','hDead','inj','killed','refills','activeHunterMinutes','over','initialBodies','endBodies','holds','sourceKind'],rows.map(r=>({...r,kgPerHunterDay:r.kg/(r.nh*365),kgPerScheduledHunterDay:r.kg/(r.nh*365*effort(r.share)),holds:holds(r),sourceKind:r._origin?.kind})));
csv('상한-짝차이.csv',Object.keys(effects[0]),effects);
fs.writeFileSync(path.join(dir,'전수표.md'),cp.execFileSync(process.execPath,[path.join(__dirname,'t1413-hunt-year.js'),'--sum',source],{encoding:'utf8',maxBuffer:8<<20}));
let text='# T1413 버티는 경계\n\n두 씨(7·1020) 모두 끝 몸 장부가 처음의90% 이상인 조건만 버팀이다. 세기=사냥 몫×정원. 동률은 정원 큰 순, 환율 작은 순으로 대표 한 조건을 고른다. 연속적인 생태 임계값이나 수확 보장으로 해석하지 않는다.\n\n';
text+='|상한|r/날|씨별 버팀/측정|두 씨 버팀/조건|그중 양쪽 수확0|\n|---|---:|---:|---:|---:|\n';
for(const p of profileResults)text+=`|${p.cap}|${p.r}|${p.rawHolds}/288|${p.pairedHolds}/144|${p.pairedHoldsWithoutHarvest}|\n`;
text+='\n|상한|r|종|대표 환율|가장 센 조합|세기|정원 한 자리당 연간kg(씨7/1020)|평균kg|평균 사람날치|사냥꾼 사망(씨7/1020)|\n|---|---:|---|---:|---|---:|---|---:|---:|---|\n';
for(const p of profileResults)for(const t of p.strongest)text+=t.found?`|${p.cap}|${p.r}|${name[t.sp]}|${t.exch}|${shareName(t.share)}×${t.nh}|${f(t.intensity)}|${t.kgPerHunterYear.map(x=>f(x)).join(' / ')}|${f(t.meanKg)}|${f(t.meanPersonDays)}|${t.hunterDeaths.join(' / ')}|\n`:`|${p.cap}|${p.r}|${name[t.sp]}|—|버티는 조건 없음|—|—|—|—|—|\n`;
text+='\n## 두 씨 모두 수확도 양수인 조건 중의 최대\n\n원래90% 기준의 표는 위에 유지했다. 아래는 수확0으로 몸이 남는 조건을 구분해서 읽기 위한 보조 표다.\n\n|상한|r|종|환율|조합|세기|정원 한 자리당 평균 연간kg|평균 사람날치|\n|---|---:|---|---:|---|---:|---:|---:|\n';
for(const p of profileResults)for(const t of p.strongestProductive)text+=t.found?`|${p.cap}|${p.r}|${name[t.sp]}|${t.exch}|${shareName(t.share)}×${t.nh}|${f(t.intensity)}|${f(t.meanKg)}|${f(t.meanPersonDays)}|\n`:`|${p.cap}|${p.r}|${name[t.sp]}|—|없음|—|—|—|\n`;
text+=`\n상한 비교의 두 씨 묶음144조건 중 빈 날/빔 여부가 한 씨라도 바뀐 조건${effectSummary.emptyMetricChangedConditions}, 두 씨 버팀 판정이 바뀐 조건${effectSummary.pairedHoldChangedConditions}. 씨별 짝288개 중 빈 날/빔 여부가 바뀐 짝${effectSummary.emptyMetricChanged}, 어느 결과든 바뀐 짝${effectSummary.anyOutcomeChanged}, 버팀 판정이 바뀐 짝${effectSummary.holdChanged}. 환율50,000·187,000의144짝은 상한24가 처음부터 비활성이며 공통 결과 전 칸이 같음을 확인했다. 빈 날365는 관측 창의 끝이므로 빔 여부도 함께 비교했다.\n\n`;
text+='kg는 현재 서버 드롭(사슴33·멧돼지4·토끼1kg/수확)이며 사람날치는1,200 kcal/kg÷2,450 kcal/사람날이다. kgHD는 정원×365의 달력 사냥꾼-날로 나눈 값이다. 사망 보충이 있으므로 개인 생존자의 수확이 아닌 사냥 자리당 수확이다. 고증 번식률 비교는 기본 상한 lab에서 수행했다.\n';
fs.writeFileSync(path.join(dir,'경계.md'),text);
console.log(JSON.stringify({total:summary.total,inherited:summary.inherited,newMeasured:summary.newMeasured,profiles:profileResults.map(p=>({cap:p.cap,r:p.r,pairedHolds:p.pairedHolds})),capEffects:effectSummary},null,2));
