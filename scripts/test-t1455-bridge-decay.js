#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @bait 7
// === scripts/test-t1455-bridge-decay.js — 마을이 놓은 다리는 낡는다(T1455 · ★재민 11-22 판정 71) ================================
//
// ★이 하네스가 지키는 계약:
//   ① 낡는 것 = 마을이 놓은 칸뿐 — 처음부터 있던 다리 칸(존 설정 `bridges`)과 겹친 칸은 낡는 칸이 아니다(덧댄 칸만) · 종류 = 공정 표의 그 다리 몫(나무)
//   ② 식 한 자리 — `decay.t1454Slow`(1 · 1.67 · 2.5 · 0 바로 위 5 · 0 = 끊김) · 걸음 배율 한 자리(`_streamWalkMul`)가 1 ÷ 그 수를 곱한다 · 클라 예측도 같은 수
//   ③ 끊김 = 그날 값 0 · 위에 몸이 있으면 기다린다(뭍에 닿은 뒤) · 끊긴 칸은 단일 술어가 물로 읽는다 · 되살림 = 넣은 나무 몫(0 에서)
//   ④ 고치는 손 = 놓은 마을(곳간 통나무 잉여 · 값이 설 때만) · 다른 마을 곳간은 안 빠진다 · 값을 못 세우면 "없음"(손질 0) · 아무나 보탠다(넣은 만큼)
//   ⑤ 다시 서기 = 그 다리 몫만 — 지나던 교역로만 버린다 · 막힘 비트는 그 칸만 · 거리행렬은 고른 쌍만 다시 세는데 그 답이 전쌍과 같다
//   ⑥ 끔 = 다리 행 글자 그대로(dk · cut 칸 없음) · welcome 칸 없음
// 실행: node scripts/test-t1455-bridge-decay.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const T = require('./lib-tmp');
const TMP = T.own(path.join(require('os').tmpdir(), `t1455-${process.pid}`));
fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lastJson = (s) => JSON.parse(s.toString().split('\n').filter((l) => l.startsWith('{')).pop());
const kid = (env, js, bait) => {
  const e = Object.assign({}, process.env, { ENABLE_VILLAGES: '0', T1438_DECAY: '1', T1455_BRIDGE_DECAY: '1', T527_BRIDGE_ACT: '1' }, env);
  if (bait) e.T1455_BAIT = JSON.stringify(bait);
  try { return lastJson(execFileSync(process.execPath, ['-e', PRE + js], { env: e, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, timeout: 120000 })); }
  catch (er) { return { err: String(er.stderr || er.message).slice(-600) }; }
};
//   미끼 — 아이가 그 파일을 바꾼 글자로 실는다(같은 파일 이름 · 모듈 캐시를 그 사본으로 · 손 0)
const PRE = `
const __B = process.env.T1455_BAIT ? JSON.parse(process.env.T1455_BAIT) : null;
if (__B) { const M = require('module'), fs = require('fs'), _l = M._extensions['.js'];
  M._extensions['.js'] = function (m, f) { if (f === __B.file) { let s = fs.readFileSync(f, 'utf8'); if (s.indexOf(__B.a) < 0) throw new Error('미끼 자리 없음: ' + __B.a.slice(0, 60)); s = s.split(__B.a).join(__B.b); m._compile(s, f); return; } return _l(m, f); }; }
`;
const VF = path.join(ROOT, 'server', 'villages.js'), ZF = path.join(ROOT, 'server', 'zone.js'), DF = path.join(ROOT, 'server', 'decay.js'), CF = path.join(ROOT, 'public', 'client', '11-r1-mountain.js');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const D = require(DF);

console.log('\n=== 마을이 놓은 다리는 낡는다 (T1455) ===');
console.log('\n① 종류 · 식 한 자리');
{
  const B = require(path.join(ROOT, 'server', 'bridge-stages.js'));
  const REC = Object.assign({}, require(path.join(ROOT, 'server', 'hut-stages.js')).HUT_RECIPES, require(path.join(ROOT, 'server', 'granary-stages.js')).GRANARY_RECIPES);
  const k = D.bridgeKind ? D.bridgeKind(21, 46) : { parts: [{ mats: {} }] }, p = k.parts[0];   // 옛 코드(종류 없음)면 ✗ 로(크래시 0)
  ok(p.mat === 'wood' && p.mats.wood === B.bridgeRaw(21, 46, REC).wood && k.stages === 2, '① 다리 종류 = 공정 표의 그 다리 몫(나무 — 말뚝 · 널 · 레시피 그대로)', `통나무 ${p.mats.wood}`);
  ok(!!D.bridgeKind && Math.abs(D.partRate(p) - D.perDay('wood')) < 1e-15, '① 빠르기 = 나무(가운데 15해 · T1438 표 그대로)', (D.partRate(p) * 100).toFixed(4) + '%/날');
  const m = [1, 0.5, 0.25, 1e-9, 0].map((x) => (D.t1454Slow ? D.t1454Slow(x) : NaN));
  ok(m[0] === 1 && Math.abs(m[1] - 5 / 3) < 1e-12 && m[2] === 2.5 && Math.abs(m[3] - 5) < 1e-6 && m[4] === Infinity, '① 식 — 새것 1배 · 절반 1.67 · 넷에 하나 2.5 · 0 바로 위 5배(발산 0) · 0 = 끊김', m.map((x) => isFinite(x) ? x.toFixed(3) : '∞').join(' · '));
  const all = ['server/zone.js', 'server/villages.js', 'server/decay.js'].map(rd).join('\n');
  ok((all.match(/\(1 \+ T1454_A\) \/ /g) || []).length === 1 && !/1 \/ \(?x \+ 0\.25/.test(all), '① 식은 한 자리(`decay.js`) — 존 · 마을 사본 0');
}

//   아이 세계(마을 쪽) — 작은 지도(가로 물 띠 · 다리 둘: 낡는 마을 다리 · 먼 처음 다리) · 마을 넷(양쪽 둘씩)
const VWORLD = `
const V=require(${JSON.stringify(VF)}), E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))}), V2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'))});
const P=V.__labProbe._t400Probe, Q=V.__t1455;
const W=64, H=64, CELLS=[]; for(let x=26;x<=37;x++) for(const y of [30,31]) CELLS.push(x,y);
const BR=new Set(); for(let i=0;i<CELLS.length;i+=2) BR.add(CELLS[i]+'_'+CELLS[i+1]);
const FAR=new Set(); for(let x=26;x<=37;x++) for(const y of [60,61]) FAR.add(x+'_'+y);
const wat=(x,y)=>x>=28&&x<=35;
const ta={isWater:(x,y)=>wat(x,y), isBlocked:(x,y)=>wat(x,y)&&!BR.has(x+'_'+y)&&!FAR.has(x+'_'+y), isBridgeCell:(x,y)=>BR.has(x+'_'+y)||FAR.has(x+'_'+y)};
const apply=[], cuts=[]; let cutAns=true, day=100;
const deps={players:new Map(),moveSpeed:120,broadcast(){},anyViewerNear:()=>false,t1438Now:()=>day,t1438EpochDay:()=>0,t1455Apply:(l)=>apply.push(JSON.parse(JSON.stringify(l))),t1455Cut:(i,c,cut)=>{cuts.push({i,cut,n:c.length/2}); if(!cut) return true; return cutAns;},t1455Cross:()=>null};
P.setup({deps,db:null,dayMs:1000,epoch:0,zoneId:'t1455z',tickCtx:{now:1},ta});
const ev=(name,cx,cy,wood)=>({name,coord:{x:cx*2.5,y:cy*2.5},npcs:[{currentJob:'farmer',skills:{}},{currentJob:'lumberjack',skills:{}}],storage:{wood},land:{},counts:{}});
const EA=ev('A',20,30,400), EB=ev('B',44,30,400), EC=ev('C',20,4,400), ED=ev('D',44,56,400);
const world={day:200,villages:[EA,EB,EC,ED],tradeLog:[]};
for(let d=171;d<=200;d++) world.tradeLog.push({day:d,from:'A',to:'B'});
const vil=(dbId,e)=>({dbId,name:e.name,econ:e,ccx:e.coord.x/2.5,ccy:e.coord.y/2.5,_granList:[],npcPids:[]});
const VA=vil(1,EA), VB=vil(2,EB), VC=vil(3,EC), VD=vil(4,ED);
const px=(cx,cy)=>({x:cx*32+16,y:cy*32+16});
const RC=new Map([['1_2',[px(20,30),px(32,30),px(44,30)]],['3_4',[px(20,4),px(20,60),px(44,60),px(44,56)]]]);
const site={i:0,v:['A'],span:8,cells:CELLS.slice(),stage:2,mat:{},done:true,day:10,adv:[],sum:null,added:CELLS.slice(),dk:{t:100,v:1}};
const V2s={t1217PricesOf:(e)=>e.name==='A'?{wood:1,food:1}:{wood:1,food:4},computeShadowPrices:(e)=>({wood:1,food:1}),TRANSPORT_COST_PER_1000:V2.TRANSPORT_COST_PER_1000,haulMul:()=>1,_legProfitPerUnit:V2._legProfitPerUnit,travelDaysForDistance:V2.travelDaysForDistance};
Q.setup({econ:Object.assign({},E,{setDistMatrix:(w,m)=>{w._distMatrix=m;}}),econV2:V2s,villages:[VA,VB,VC,VD],routeCache:RC,walkCache:new Map(),world,_distCtx:{ta,ZONE:{zoneWidth:W*32,zoneHeight:H*32}},_distBlk:null,ready:true,_t527Sites:[site]});
console.log=()=>{};
`;
console.log('\n② 마을 쪽 — 낡음 · 끊김 · 몸 기다림 · 되살림 · 손질 · 값 · 보탬(아이 세계)');
const VJS = VWORLD + `
const out={};
Q.dist('처음'); const W0=world._distMatrix.map(r=>r.slice());
out.x0=Q.x(site); day=100+5475/2; out.xHalf=+Q.x(site).toFixed(4);
// 손질 — 값이 선다(교역 다리 A↔B 가 그 다리를 지난다 · 최근 30날 30줄) · 놓은 마을 곳간에서만
const wA0=EA.storage.wood, wB0=EB.storage.wood;
Q.vilDay(VB); out.wB=EB.storage.wood-wB0;   // 놓은 마을이 아닌 마을
Q.vilDay(VA); out.wA=wA0-EA.storage.wood; out.xRep=+Q.x(site).toFixed(4); out.worth=site._worth;
// 값 없음 — 교역 장부가 비면 손질 0
const tl=world.tradeLog; world.tradeLog=[]; const RC0=new Map(RC); RC.clear(); day+=60; const w1=EA.storage.wood; Q.vilDay(VA); out.noneWood=w1-EA.storage.wood; out.none=Q.V.worthNone; world.tradeLog=tl; for(const [k,v] of RC0) RC.set(k,v);
// 끊김 — 0 에 닿은 날 · 몸이 위에 있으면 기다린다
site.dk={t:day,v:0.001}; day+=10; cutAns='pend';
Q.worldDay(); out.pend={cut:site.cut,pend:site.cutPend,calls:cuts.length};
// 존이 뭍에 닿았다고 알린다 → 끊김 · 그 다리 몫 다시 서기
for(let i=0;i<CELLS.length;i+=2) BR.delete(CELLS[i]+'_'+CELLS[i+1]);
V.t1455OnCut(0); out.cut={cut:site.cut,row:site.dk,legs:site._legsCut,rc:[...RC.keys()],rb:Q.V.rebuild[Q.V.rebuild.length-1]};
out.vb=V.t1455VilBridges(VA); out.vbB=V.t1455VilBridges(VB);
const job=Q.take(); out.job=job?{src:job.src.length,pairs:job.pairs}:null;
if(job) Q.dist('다리 몫',{t1455:job}); const W1=world._distMatrix.map(r=>r.slice());
Q.setup({_distBlk:null}); Q.dist('전쌍'); const WF=world._distMatrix.map(r=>r.slice());
out.W0=W0; out.W1=W1; out.WF=WF;
// 되살림 — 보탬(아무나) 0 에서
for(let i=0;i<CELLS.length;i+=2) BR.add(CELLS[i]+'_'+CELLS[i+1]);
const dn=V.t1455Donate(0,'plank',3); out.don=dn; out.rev={cut:site.cut,legs:site._legsCut};
const job2=Q.take(); if(job2) Q.dist('다리 몫',{t1455:job2}); out.W2=world._distMatrix.map(r=>r.slice()); out.job2=job2?job2.pairs:0;
out.apply=apply.length; out.cuts=cuts; out.V={cuts:Q.V.cuts,revives:Q.V.revives,repairs:Q.V.repairs,wood:Q.V.wood,donate:Q.V.donate};
process.stdout.write(JSON.stringify(out));`;
const fin = (M) => JSON.stringify((M || []).map((r) => r.map((d) => d == null || !isFinite(d) ? null : +(+d).toFixed(3))));
{
  const r = kid({}, VJS);
  if (r.err) console.log(r.err);
  ok(r.x0 === 1 && Math.abs(r.xHalf - 0.5) < 0.01, '② 낡음 = 읽을 때 셈(나무 15해 — 7.5해 뒤 절반)', `${r.x0} → ${r.xHalf}`);
  ok(r.wB === 0 && r.wA > 0 && r.xRep > r.xHalf, '② 손질 = 놓은 마을(A) 곳간 통나무만 · 다른 마을(B) 곳간 무변 · 넣은 몫만큼 오른다', `A −${r.wA} · B ${r.wB} · ${r.xHalf} → ${r.xRep}`);
  ok(r.worth && r.worth.legs === 1 && r.worth.tradeDay > 0 && r.worth.value * r.worth.daysPer >= r.worth.costPer, '② 고칠 값 — 그 다리를 지나는 교역 다리(A↔B · 하루 1번) × 잃는 낱개 이익 · 낱개 하나가 버는 날 × 하루 값 ≥ 낱개 값', JSON.stringify(r.worth && { legs: r.worth.legs, tradeDay: r.worth.tradeDay, value: r.worth.value, daysPer: Math.round(r.worth.daysPer), costPer: r.worth.costPer }));
  ok(r.noneWood === 0 && r.none >= 1, '② 값을 못 세우면 "없음" — 손질 0(교역로 · 장부 · 건넌 몸 다 없음)', `없음 ${r.none}`);
  ok(r.pend && r.pend.pend === true && !r.pend.cut, '③ 0 에 닿았는데 위에 몸 — 끊김을 기다린다(존 답 pend)', JSON.stringify(r.pend));
  ok(r.cut && r.cut.cut === true && r.cut.row.v === 0 && JSON.stringify(r.cut.legs) === '["1_2"]' && JSON.stringify(r.cut.rc) === '["3_4"]', '③ 뭍에 닿은 뒤 끊김 — 그 다리를 지나던 교역로(A↔B)만 버린다 · 먼 다리 길(C↔D)은 그대로', JSON.stringify(r.cut && { legs: r.cut.legs, rc: r.cut.rc }));
  ok(r.vb && r.vb.n === 1 && r.vb.fix === 1 && r.vb.cut === 1 && r.vbB && r.vbB.n === 0, '⑥ 마을 화면 한 줄 — 우리 다리 1 · 손볼 것 1 · 끊김 1(놓은 마을만 — 이웃은 0)', JSON.stringify([r.vb, r.vbB]));
  ok(r.job && r.job.pairs >= 1 && r.job.src < 4, '⑤ 거리행렬 — 그 다리를 지날 수 있었던 쌍만 · 소스 < 마을 수', JSON.stringify(r.job));
  ok(r.W1 && fin(r.W1) === fin(r.WF) && fin(r.W1) !== fin(r.W0), '⑤ ★다리 몫 다시 센 거리행렬 = 전쌍 다시 센 것(값 같음) · 옛 값과 다르다(A↔B 가 먼 다리로 돌아간다)', `A↔B ${r.W0 && r.W0[0][1]} → ${r.W1 && r.W1[0][1]} (전쌍 ${r.WF && r.WF[0][1]})`);
  ok(r.don && r.don.q === 3 && r.don.x > 0 && r.rev.cut === false && fin(r.W2) === fin(r.W0), '③ 되살림 — 아무나 넣은 판자 3(나무 몫) → 0 에서 다시 선다 · 거리행렬이 처음 값으로', JSON.stringify(r.don));
  ok(r.cuts && r.cuts.filter((c) => c.cut).length === 1 && r.cuts.some((c) => !c.cut), '③ 존에 끊김 한 번(기다린 것 포함) · 되살림 한 번', JSON.stringify(r.cuts));
}

console.log('\n① 덧댄 칸만 낡는다(한반도 지름길 64 — 처음 다리 칸 넷과 겹친다)');
const OJS = `
const V=require(${JSON.stringify(VF)}), Q=V.__t1455, P=V.__labProbe._t400Probe;
P.setup({deps:{t1438Now:()=>0,t1438EpochDay:()=>0},zoneId:'hanbando'});
const {ZONES}=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))}); const S=ZONES.hanbando.bridgeShortcuts[64];
const site={i:64,v:S.v,span:S.span,cells:S.cells.slice(),done:true}; Q.setup({_t527Sites:[site]});
const own=Q.own(site); process.stdout.write(JSON.stringify({n:S.cells.length/2,own:own.length/2}));`;
{
  const S = ZONES.hanbando.bridgeShortcuts[64], I = new Set(); const b = ZONES.hanbando.bridges; for (let i = 0; i + 1 < b.length; i += 2) I.add(b[i] + '_' + b[i + 1]);
  let ov = 0; for (let i = 0; i + 1 < S.cells.length; i += 2) if (I.has(S.cells[i] + '_' + S.cells[i + 1])) ov++;
  const r = kid({}, OJS);
  ok(r.own === r.n - ov && ov > 0, `① 낡는 칸 = 다리 ${r.n}칸 − 처음 다리와 겹친 ${ov}칸(처음 다리는 세계의 일부)`, JSON.stringify(r));
  const rb = kid({}, OJS, { file: VF, a: 'if (I.has(k) || seen.has(k)) continue;', b: 'if (seen.has(k)) continue;' });
  ok(rb.own === rb.n, '미끼 ㉠ 바꾼 자리 = 처음 다리 칸도 낡는 사본 → 낡는 칸에 처음 다리 칸이 든다(빨강을 잡는다)', JSON.stringify(rb));
}

console.log('\n③ 존 — 걸음 배율 한 자리 · 끊김(몸 기다림) · 그 칸만 · 되살림(아이 존 부팅)');
const ZJS = `console.log=()=>{};console.warn=()=>{};
const Z=require(${JSON.stringify(ZF)}); const H=Z.__testBind();
const CELLS=[]; for(let x=26;x<=37;x++) for(const y of [30,31]) CELLS.push(x,y);
const S=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))}).ZONES.hanbando.bridgeShortcuts[0];
const own=S.cells.slice(4), init=null;
H.addBridgeCells(S.cells);
const cx=own[0], cy=own[1], X=cx*32+16, Y=cy*32+16;
const far=[S.cells[0]+400, S.cells[1]]; H.isTerrainBlockedLocal(far[0]*32+16, far[1]*32+16); const bit0=H._t1455BlkBit(far[0],far[1]);
H.t1455Apply([{i:0,cells:own,x:0.5,cut:false,owner:'농촌22',ownerDb:1,gone:false}]);
const p={pid:'t',x:X,y:Y,isNpc:true,simVillageId:1}; const m1=H._streamWalkMul(p);
const q={pid:'u',x:S.cells[0]*32+16,y:S.cells[1]*32+16,isNpc:true}; const m0=H._streamWalkMul(q);
H.players.set('t',p);
const a=H.t1455Cut(0,own,true); const blkPend=H.isTerrainBlockedLocal(X,Y);
p.x=(cx-40)*32; H._t1455PendTick(); const blkCut=H.isTerrainBlockedLocal(X,Y), pendN=H._t1455Pend.size;
const bit1=H._t1455BlkBit(far[0],far[1]);
p.x=X; p.y=Y; const mCut=H._streamWalkMul(p);
const pay=H._t1455Payload();
H.t1455Cut(0,own,false); const blkRev=H.isTerrainBlockedLocal(X,Y);
H.players.delete('t');
process.stdout.write(JSON.stringify({m1,m0,a,blkPend,blkCut,pendN,bit0,bit1,mCut,pay:pay.map(r=>({i:r.i,cut:r.cut,n:r.cells.length/2,walk:r.walk})),blkRev,st:H.t1455Stat()}));
setTimeout(()=>process.exit(0),10);`;
const ZENV = (p) => ({ ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(p)), DB_PATH: path.join(TMP, `z${p}.db`), ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T356_SOA: '1' });
{
  const r = kid(ZENV(39411), ZJS);
  if (r.err) console.log(r.err);
  ok(Math.abs(r.m1 - 0.6) < 1e-9 && r.m0 === 1, '② 걸음 배율 한 자리 — 절반 낡은 마을 다리 칸 = 1 ÷ 1.67 = 0.6 · 처음 다리 칸(덧대지 않은 칸) = 1', `${r.m1} · ${r.m0}`);
  ok(r.a === 'pend' && r.blkPend === false, '③ 위에 몸 — 끊김을 미룬다(칸은 아직 다리 · 몸이 물에 빠지지 않는다)', `${r.a} · 막힘 ${r.blkPend}`);
  ok(r.blkCut === true && r.pendN === 0, '③ 몸이 뭍에 닿은 뒤 1초 안에 끊김 — 단일 술어가 그 칸을 물로 읽는다', `막힘 ${r.blkCut}`);
  ok(r.bit0 > 0 && r.bit1 === r.bit0, '⑤ 막힘 비트는 그 칸만 지운다 — 먼 칸의 구운 비트는 그대로(통째 영점 0)', `${r.bit0} → ${r.bit1}`);
  ok(r.mCut === 1 && r.pay && r.pay[0] && r.pay[0].cut === 1, '③ 끊긴 칸 = 배율 표에서 빠진다 · welcome 칸에 끊김 표지', JSON.stringify(r.pay));
  ok(r.blkRev === false, '③ 되살림 — 다시 다리(건넌다)');
  const b1 = kid(ZENV(39412), ZJS, { file: ZF, a: '    if (cut) BRIDGE_CELLS.delete(key); else BRIDGE_CELLS.add(key);', b: '    if (!cut) BRIDGE_CELLS.add(key);' });
  ok(b1.blkCut === false, '미끼 ㉡ 바꾼 자리 = 0 인데 건너지는 사본(칸을 안 뺀다) → 끊긴 칸이 막히지 않는다(빨강을 잡는다)', `막힘 ${b1.blkCut}`);
  const b2 = kid(ZENV(39413), ZJS, { file: ZF, a: '  if (cut && _t1455BodyOn(cells)) {', b: '  if (false && cut && _t1455BodyOn(cells)) {' });
  ok(b2.a === true && b2.blkPend === true, '미끼 ㉢ 바꾼 자리 = 몸이 위에 있는데 끊기는 사본 → 몸 아래 칸이 바로 물(빨강을 잡는다)', `${b2.a} · ${b2.blkPend}`);
  const b3 = kid(ZENV(39414), ZJS, { file: ZF, a: '    if (_BLK_BITS) _BLK_BITS[b >> 3] &= ~(3 << (b & 7));', b: '    if (_BLK_BITS) _BLK_BITS.fill(0);' });
  ok(b3.bit1 === 0, '미끼 ㉥ 바꾼 자리 = 통째로 다시 굽는 사본(막힘 비트 통째 영점) → 먼 칸 비트가 지워진다(빨강을 잡는다)', `${b3.bit0} → ${b3.bit1}`);
}

console.log('\n④ 미끼 — 마을 쪽');
{
  const b4 = kid({}, VJS, { file: VF, a: "const mine = S.filter((s) => s.done && (s.v.indexOf(vil.name) >= 0 || (vil._seedName && s.v.indexOf(vil._seedName) >= 0)));", b: 'const mine = S.filter((s) => s.done);' });
  ok(b4.wB < 0, '미끼 ㉣ 바꾼 자리 = 놓은 마을 아닌 마을의 곳간에서 재료가 빠지는 사본 → B 곳간이 준다(빨강을 잡는다)', `B ${b4.wB}`);
  const b5 = kid({}, VJS, { file: VF, a: '  if (pairs === null || pairs.length) state.distDirty = true;', b: '  state._t1455Dist = null;' });
  ok(fin(b5.W1) === fin(b5.W0) && fin(b5.W1) !== fin(b5.WF), '미끼 ㉤ 바꾼 자리 = 끊김 뒤 거리행렬이 옛 값인 사본 → 전쌍과 다르다(빨강을 잡는다)', `A↔B ${b5.W1 && b5.W1[0][1]} · 전쌍 ${b5.WF && b5.WF[0][1]}`);
}

console.log('\n⑦ 클라 미러 — 끊긴 칸을 건너는 예측 0 · 같은 배수');
{
  const src = rd('public/client/11-r1-mountain.js');
  const grab = (s, name) => { const i = s.indexOf('  function ' + name + '('); let d = 0, j = s.indexOf('{', i); for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return s.slice(i, k + 1); } return ''; };
  const run = (s) => {
    const fn = new Function('CL_BUILDING_SIZE', `const _bridgeAbs=new Set(); const _t1455Abs=new Map();\n${grab(s, 't1455WalkMultAt')}\n${grab(s, 't1455Recv')}
      const c={meta:{worldOffsetX:0,worldOffsetY:0},bridges:new Set()}; const L=[{i:0,cells:[30,30,31,30],walk:0.6,cut:0,x:0.5}];
      t1455Recv(c,L); const a={abs:_bridgeAbs.has('30,30'),m:t1455WalkMultAt(30*32+5,30*32+5)};
      t1455Recv(c,[{i:0,cells:[30,30,31,30],walk:0.6,cut:1,x:0}]); const b={abs:_bridgeAbs.has('30,30'),m:t1455WalkMultAt(30*32+5,30*32+5),cut:c.bridgesCut.has('30,30'),ren:c.bridges.has('30,30')};
      return {a,b};`);
    return fn(32);
  };
  const safe = (x) => { try { return run(x); } catch (e) { return { a: {}, b: { abs: null }, err: String(e.message).slice(0, 80) }; } };   // 옛 코드(함수 없음)면 ✗ 로
  const r = safe(src);
  ok(r.a.abs && r.a.m === 0.6 && !r.b.abs && r.b.cut && !r.b.ren && r.b.m === 1, '⑦ 클라 — 선 다리 = 콜라이더 미러 + 같은 배수(0.6) · 끊긴 다리 = 미러에서 빠짐(건너는 예측 0) · 끊긴 칸 그림 집합', JSON.stringify(r));
  const rb = safe(src.replace('if (r.cut) { _bridgeAbs.delete(ak);', 'if (r.cut) {'));
  ok(rb.b.abs === true, '미끼 ㉦ 바꾼 자리 = 클라만 건너는 사본(끊긴 칸을 미러에 남김) → 클라가 끊긴 다리를 건너 예측(빨강을 잡는다)', JSON.stringify(rb.b));
  const mv = rd('public/client/31-m-move.js');
  ok(/streamWalkMultAt\(myAbsPredicted\.x, myAbsPredicted\.y\) : 1\) \* \(\(typeof t1455WalkMultAt === 'function'\) \? t1455WalkMultAt\(myAbsPredicted\.x, myAbsPredicted\.y\)/.test(mv), '⑦ 걸음 예측 = 개울 × 다리(서버 걸음 배율 한 자리와 같은 칸 · 같은 곱)');
}

console.log('\n⑥ 끔 — 행 글자 · welcome · 걸음 그대로');
{
  const V = rd('server/villages.js'), Zs = rd('server/zone.js');
  ok(/dk: site\.dk, cut: site\.cut \|\| undefined/.test(V) && /if \(T1455_BRIDGE_DECAY\) \{ site\.dk = st\.dk \|\| null;/.test(V), '⑥ 끔 = 다리 행 JSON 에 칸 없음(dk · cut 이 undefined — 글자 그대로) · 되읽기도 켬일 때만');
  ok(/const T1455_BRIDGE_DECAY = T1438_DECAY && process\.env\.T1455_BRIDGE_DECAY === '1';/.test(V) && /const T1455_BRIDGE_DECAY = Decay\.ON && process\.env\.T1455_BRIDGE_DECAY === '1';/.test(Zs), '⑥ 손잡이 = `T1438_DECAY` 안 · `=1` 만 켬(존 · 마을 같은 글자)');
  ok(/\.\.\.\(T1455_BRIDGE_DECAY && _t1455Site\.size \? \{ t1455: _t1455Payload\(\) \} : \{\}\)/.test(Zs) && /if \(T1455_BRIDGE_DECAY && _t1455Cell\.size\) \{/.test(Zs), '⑥ 끔 = welcome 칸 없음 · 걸음 배율 종전 줄');
  const r = kid({ T1455_BRIDGE_DECAY: '0' }, VWORLD + `Q.vilDay(VA); process.stdout.write(JSON.stringify({w:EA.storage.wood,a:apply.length,c:cuts.length,on:V.T1455_BRIDGE_DECAY}));`);
  ok(r.on === false && r.a === 0 && r.c === 0, '⑥ 끔 — 하루 절이 안 돈다(존 반영 0 · 끊김 0)', JSON.stringify(r));
}

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
