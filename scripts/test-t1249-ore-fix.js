#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1249-ore-fix.js — 원석 쪼개기(T1188) 뒤 조성 모르는 광산촌이 광부 대신 대장장이를 뽑는 결함 · 고침 손잡이 `T1249_ORE_FIX` ===
//
// ★무엇을 보나(마을 하나 · econ 만 · 30날 · 같은 씨 — 판마다 자식 프로세스: 쪼개기 손잡이는 모듈 상수라 한 프로세스에서 못 바꾼다)
//   ① 결함이 선다(자명 통과 금지) — 쪼개기 켬 · 고침 끔 · 조성 모르는 광산촌(`land.oreMix` 없음 = 랩 · CLI): 대장장이 > 0 · 광부 0 · 곳간 목재 0
//   ② 고침 켬 = 쪼개기 전 직업 — 같은 마을이 쪼개기 끔 판과 직업 수가 같다(대장장이 0 · 광부 > 0 · 곳간 목재가 산다)
//   ③ 조성을 아는 마을(지도 · 서버)은 고침이 안 건드린다 — 고침 켬 ↔ 끔 직업 수 · 원석 · 목재 같다
// 실행: node scripts/test-t1249-ore-fix.js   (몇 초)
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 자식: 마을 하나(광산촌 — 광맥 1.5 · 인구 40) 30날 → 직업 수 · 원석 합(쪼개기 종류 + 옛 ore) · 곳간 목재
const KID = `
const E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))}), V2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'))});
const OG=require(${JSON.stringify(path.join(ROOT, 'server', 'ore-goods'))});
const mix=process.env.Q_MIX==='1'?{copper:0.6,tin:0.4}:null;
if(E.setSeed)E.setSeed(7);
const w=V2.createWorldV2({seed:7,villageCount:1,picker:'rational',infoRange:5000,raidPer100:0.005}); w.villages=[]; w.events=[];
const v=E.createVillage({name:'광산촌',ore:1.5,fertility:0.6,wood:0.8,initialPop:40,size:258,oreMix:mix}); v._world=w; v.coord={x:0,y:0}; w.villages.push(v); w.day=0;
for(let d=0;d<30;d++)V2.tickWorldV2(w);
const j={}; for(const n of v.npcs) j[n.currentJob]=(j[n.currentJob]||0)+1;
const ks=Object.keys(j).sort(), jobs={}; for(const k of ks) jobs[k]=j[k];
process.stdout.write(JSON.stringify({jobs,ore:+(OG.total(v.storage)+(v.storage.ore||0)).toFixed(6),wood:+(v.storage.wood||0).toFixed(6)}));
`;
const run = (env) => {
  const r = spawnSync(process.execPath, ['-e', KID], { env: Object.assign({}, process.env, { T1188_ORE_SPLIT: '1', T1249_ORE_FIX: '0', Q_MIX: '0' }, env), encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (e) { return { err: String(r.stderr).slice(0, 300) }; }
};
const jobsOf = (o) => JSON.stringify(o.jobs || {});

console.log('\n=== ① 결함 — 쪼개기 켬 · 고침 끔 · 조성 모르는 광산촌 ===');
const A = run({});
ok(!A.err, '판이 돌았다', A.err || '');
ok((A.jobs && A.jobs.smith > 0) && !(A.jobs && A.jobs.miner > 0) && A.wood === 0, '대장장이 > 0 · 광부 0 · 곳간 목재 0(조성 모르는 원석을 녹이느라 숯이 목재를 먹는다)', jobsOf(A) + ` · 목재 ${A.wood}`);

console.log('\n=== ② 고침 켬 = 쪼개기 전 세계 ===');
const B = run({ T1249_ORE_FIX: '1' }), C = run({ T1188_ORE_SPLIT: '0' });
ok(!B.err && !C.err, '두 판이 돌았다', (B.err || '') + (C.err || ''));
ok(jobsOf(B) === jobsOf(C) && B.wood > 0 && C.wood > 0, '고침 켬 직업 수 = 쪼개기 끔 판(곳간 목재가 산다)', `${jobsOf(B)} · 목재 ${B.wood} ↔ ${jobsOf(C)} · 목재 ${C.wood}`);
//   ⚠목재 소수점 몇 자리는 같지 않다 — 쪼개기는 원석 효용 예산 · 원석 종류별 재고 같은 다른 몫도 바꾼다(T1188 의 뜻한 차이 · 이 고침 밖). 이 고침이 되돌리는 것은 직업 고르기다.
ok(!(B.jobs && B.jobs.smith > 0) && (B.jobs && B.jobs.miner > 0), '대장장이 0 · 광부가 선다', jobsOf(B));
ok(jobsOf(A) !== jobsOf(B), '자명 통과 금지 — 고침 켬 ↔ 끔 직업 수가 실제로 다르다', '');

console.log('\n=== ③ 조성을 아는 마을은 그대로 ===');
const D0 = run({ Q_MIX: '1' }), D1 = run({ Q_MIX: '1', T1249_ORE_FIX: '1' });
ok(!D0.err && !D1.err && jobsOf(D0) === jobsOf(D1) && D0.ore === D1.ore && D0.wood === D1.wood, '고침 켬 ↔ 끔 — 직업 수 · 원석 · 목재 같다(지도 조성이 있는 마을 · 서버)', `${jobsOf(D0)} · 원석 ${D0.ore} · 목재 ${D0.wood}`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
