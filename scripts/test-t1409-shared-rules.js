#!/usr/bin/env node
// @regress
// @bait 3
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),S=require('./lib-t1409-source'),L=require('./lib-lab-diff'),F=require('./t1409-fixtures.json');
let pass=0,fail=0;const ok=(v,m,d='')=>{console.log((v?'  ✓ ':'  ✗ ')+m+(d?' — '+d:''));v?pass++:fail++;};
const file=path.join(__dirname,'..','sim','shared-lab-rules.js'),exists=fs.existsSync(file),source=exists?fs.readFileSync(file,'utf8'):'';
const load=code=>{const ctx={module:{exports:{}}};vm.runInNewContext(code,ctx);return ctx.module.exports;};
const R=exists?load(source):{};
const oldOre=vm.runInNewContext('(()=>{'+F.oreDeclarations.map(s=>'const '+s+';').join('')+'return ('+F.oreFunction+');})()');
const oldWater=nd=>vm.runInNewContext('('+F.waterExpression+')',{opts:{},nd});
ok(exists&&['waterAccess','oreRegenRaw','conscriptWith'].every(n=>typeof R[n]==='function'),'공유 계산 세 입구 존재');
if(exists){
 const samples=[0,0.1,0.5,250,1000,1001].flatMap(R0=>[-1,0,1,360].map(d=>({R0,d})));
 const wrong=samples.filter(({R0,d})=>!Object.is(R.oreRegenRaw(R0,d,1000,0.01,0.01),oldOre(R0,d)));
 ok(!wrong.length,'원래 HTML 실제 함수와 광맥 재생 24입력 동일(0/음수 날 포함)',JSON.stringify(wrong));
 ok([0,10,50,200,999].every(d=>Object.is(R.waterAccess(d),oldWater(d))),'원래 서버 물 접근식 5입력 동일');
 const labOre=S.locate('lab/전쟁실험실.html',{kind:'function',name:'oreRegen'});
 ok(!!labOre&&labOre.text.includes('EconEngine.Rules.oreRegenRaw'),'랩 광맥은 실제 공유 입구를 부름');
 const C=require('../server/specialty');ok(C.oreRegen(0.1,0)===0.1&&C.oreRegen(250,1)===R.oreRegenRaw(250,1,1000,0.01,0.01),'서버 0날 guard 보존 · 양수 날은 공유식');
 const V=require('../sim/war-core');ok(fs.readFileSync(path.join(__dirname,'..','sim','war-core.js'),'utf8').includes("require('./shared-lab-rules')"),'서버 편성도 공유 디스패치를 부름');
 const waterNode=S.locate('lab/전쟁실험실.html',{kind:'function',name:'_t1409Water'});
 let flagsOK=!!waterNode;for(const value of [undefined,'0','true','1']){if(!waterNode)break;const fn=vm.runInNewContext('('+waterNode.text+')',{window:{LAB_ENV:{T1409_WATER_RULE:value}},EconEngine:{Rules:R}});flagsOK=flagsOK&&fn(50,0.15)===(value==='1'?oldWater(50):0.15);}
 ok(flagsOK,'물 손잡이는 정확히 1만 켬 · 없음/0/true 끔');
 const valueNode=S.locate('lab/마을실험실.html',{kind:'function',name:'_t1409WarValue'});let warOK=!!valueNode;
 for(const [flag,key,legacy]of [['T1409_VIL_MARCH','WAR_MARCH',240],['T1409_VIL_RAID_MIN','WAR_RAID_MIN',3]])for(const value of [undefined,'0','true','1']){if(!valueNode)break;const fn=vm.runInNewContext('('+valueNode.text+')',{window:{LAB_ENV:{[flag]:value}},EconEngine:{WarRuleValues:V}});warOK=warOK&&fn(flag,legacy,key)===(value==='1'?V[key]:legacy);}
 ok(warOK,'마을랩 두 손잡이 각각 정확히 1만 정본 값 선택');
 const code=fs.readFileSync(path.join(__dirname,'..','sim','economy-engine.browser.js'),'utf8'),ctx={console:{log(){},warn(){},error(){}}};ctx.window=ctx;vm.runInNewContext(code,ctx);
 ok(ctx.EconEngine.WarRuleValues?.WAR_MARCH===V.WAR_MARCH&&ctx.EconEngine.WarRuleValues?.WAR_RAID_MIN===V.WAR_RAID_MIN,'번들 전쟁 값은 실제 war-core 수에서 생성');
 let calls=[];const ind=()=>{calls.push('individual');return {from:'individual'};},agg=()=>{calls.push('aggregate');return {from:'aggregate'};};
 ok(R.conscriptWith(ind,agg,{},'raid',{}).from==='individual'&&calls.join()==='individual','개인편성 성공이면 폴백 호출0');calls=[];
 ok(R.conscriptWith(()=>{calls.push('individual');return null;},agg,{},'raid',{}).from==='aggregate'&&calls.join()==='individual,aggregate','개인편성 실패 뒤에만 폴백1');
 function bait(needle,replace,detect){const n=source.split(needle).length-1;let red=false;if(n===1){const mutated=load(source.replace(needle,replace));red=detect(mutated);}return {n,red};}
 const b1=bait('nd / 140','nd / 141',m=>m.waterAccess(50)!==oldWater(50));
 ok(b1.n===1&&b1.red,'★미끼 — 물 분모(바꾼 자리 1) → 결과 검사 빨강');
 const b2=bait('Math.exp(-B * days)','Math.exp(B * days)',m=>m.oreRegenRaw(250,1,1000,0.01,0.01)!==oldOre(250,1));
 ok(b2.n===1&&b2.red,'★미끼 — 광맥 지수 부호(바꾼 자리 1) → 결과 검사 빨강');
 const b3=bait('if (ind) return ind;','if (!ind) return ind;',m=>m.conscriptWith(()=>1,()=>2,{},'raid',{})!==1);
 ok(b3.n===1&&b3.red,'★미끼 — 편성 분기(바꾼 자리 1) → 결과 검사 빨강');
}
console.log(`\n=== T1409 공유 계산: 통과 ${pass} · 실패 ${fail} ===`);process.exitCode=fail?1:0;
