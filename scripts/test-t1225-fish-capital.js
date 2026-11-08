#!/usr/bin/env node
// @regress
'use strict';
// [T1225] 물속 자본 — 어부 한 시간 값에서 "물에 남겨 두면 돌아올 값"을 뺀다(★재민 11-08 문 38 ⓒ · 손잡이 `T1225_FISH_CAPITAL` 끔 기본).
//   한 시간 값 × (1 − λ) · λ = r·(1 − 2s)/ρ × 제 마을 몫 — r = 어장 재생(`fishing.fishR`) · s = 그 버킷 재고 비율 · ρ = 그 사람의 하루 할인
//   ('1' = 그 마을 어부 나이의 T1206 생명표 하루 사망 몫 평균 · 'h30' = 행복 평형 반감기 30날 · 그 밖 = 끔).
//   잰다: ① 손잡이 값(미설정 · '' · '0' · 'yes' = 끔 · '1' = life · 'h30') ② 끔 = 몫 1(한 시간 값 그대로)
//         ③ 켬 식 — 반쯤 찬 물 = 1 · 반보다 비면 < 1 · 반보다 차면 > 1 · 황금률 재고 s* = (1 − ρ/r)/2 에서 몫 0(멈춘다)
//         ④ ρ = 어부 나이의 `t1206DayP` 평균(어부가 없으면 마을 사람) · 하루에 한 번 · 'h30' = 1 − 0.5^(1/30)
//         ⑤ 공유 어장 — 제 마을 몫만큼만(이웃 몫은 안 센다 · 장부가 없으면 1) ⑥ 자명 통과 금지 — r · ρ 를 바꾸면 몫이 바뀐다
const assert = require('assert'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); } }
const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + ' != ' + b);
const lastJson = (r) => JSON.parse(r.stdout.trim().split('\n').at(-1));

//   아이 판 — 손잡이 값마다 villages 를 새로 싣는다(모드는 모듈을 실을 때 읽는다)
const CHILD = `
process.env.ENABLE_VILLAGES = '0';
const V = require('./server/villages'), E = require('./sim/economy-sim');
const P = V._t1225Probe;
const mk = (ages, job) => ({ name: '시험촌', econ: { npcs: ages.map((a) => ({ age: a, currentJob: job || 'fisher' })) } });
const F = (s, r) => ({ bucketRatioAt: () => s, fishR: () => r, bucketOf: (cx, cy) => [Math.floor(cx / 24), Math.floor(cy / 24)] });
const out = { mode: P.mode, keep: {}, rho: null, rhoNoFisher: null, rhoCache: null, share: {}, keepShared: null };
const vil = mk([20, 30, 40]);
out.rho = P.rho(vil, 5);
vil.econ.npcs.push({ age: 70, currentJob: 'fisher' }); out.rhoCache = P.rho(vil, 5); out.rhoNext = P.rho(vil, 6);
out.rhoNoFisher = P.rho(mk([25, 35], 'farmer'), 1);
out.dayP = [20, 30, 40, 70, 25, 35].map((a) => E.t1206DayP(a));
out.h30 = 1 - Math.pow(0.5, 1 / (E.HAPPY_EQ_HALF_DAYS || 30));
const r = 0.00219;
for (const s of [0, 0.25, 0.5, 0.75, 1]) out.keep[s] = V.t1225Keep(F(s, r), mk([30]), 1, 0, 0, 0);
out.keepR2 = V.t1225Keep(F(0.25, 2 * r), mk([30]), 1, 0, 0, 0);
out.keepOld = V.t1225Keep(F(0.25, r), mk([70]), 1, 0, 0, 0);
//   공유 — 버킷 (0,0) 에서 지금까지 시험촌 30 · 이웃 70 마리
P.shared.set('0_0', { v: { '시험촌': 30, '이웃': 70 }, n: 100 });
out.share.mine = P.share(F(0.25, r), 3, 4, { name: '시험촌' });
out.share.none = P.share(F(0.25, r), 100, 100, { name: '시험촌' });
out.keepShared = V.t1225Keep(F(0.25, r), mk([30]), 1, 3, 4, 0);
out.keepSolo = V.t1225Keep(F(0.25, r), mk([30]), 1, 100, 100, 0);
out.stat = V.t1225Stat();
console.log(JSON.stringify(out));
`;
function run(val) {
  const env = { ...process.env, ENABLE_VILLAGES: '0' }; delete env.T1225_FISH_CAPITAL; if (val !== undefined) env.T1225_FISH_CAPITAL = val;
  const r = spawnSync(process.execPath, ['-e', CHILD], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.strictEqual(r.status, 0, r.stderr);
  return lastJson(r);
}

const R = {};
for (const val of [undefined, '', '0', 'yes', '1', 'h30']) check('① 손잡이 ' + String(val), () => {
  const o = R[String(val)] = run(val);
  assert.strictEqual(o.mode, val === '1' ? 'life' : val === 'h30' ? 'h30' : null);
});

const off = R['undefined'], on = R['1'], h = R['h30'];
check('② 끔 = 몫 1(한 시간 값 그대로 · 계측 0)', () => {
  for (const s of Object.keys(off.keep)) assert.strictEqual(off.keep[s], 1);
  assert.strictEqual(off.keepShared, 1); assert.strictEqual(off.stat.n, 0);
});
check('④ ρ(life) = 어부 나이의 t1206DayP 평균 · 하루에 한 번 · 어부가 없으면 마을 사람', () => {
  const [d20, d30, d40, d70, d25, d35] = on.dayP;
  near(on.rho, (d20 + d30 + d40) / 3);
  near(on.rhoCache, on.rho);                       // 같은 날 = 적어 둔 값
  near(on.rhoNext, (d20 + d30 + d40 + d70) / 4);   // 다음 날 = 바뀐 명부
  near(on.rhoNoFisher, (d25 + d35) / 2);
  assert(on.rho > 1e-5 && on.rho < 2e-4, '어른 하루 사망 몫 ' + on.rho);
});
check('④ ρ(h30) = 1 − 0.5^(1/30)', () => { near(h.rho, h.h30); near(h.h30, 1 - Math.pow(0.5, 1 / 30)); });
check('③ 켬 식 — 몫 = 1 − r(1 − 2s)/ρ · 반쯤 찬 물 = 1 · 빈 쪽 < 1 · 찬 쪽 > 1', () => {
  const r = 0.00219, rho = on.dayP[1];
  for (const s of [0, 0.25, 0.5, 0.75, 1]) near(on.keep[s], 1 - r * (1 - 2 * s) / rho, 1e-9);
  assert.strictEqual(on.keep['0.5'], 1);
  assert(on.keep['0.25'] < 1 && on.keep['0'] < on.keep['0.25'], '빈 물일수록 남긴 값이 크다');
  assert(on.keep['0.75'] > 1 && on.keep['1'] > on.keep['0.75'], '찬 물일수록 빼는 값이 크다');
});
check('③ 황금률 — 몫이 0 이 되는 재고 s* = (1 − ρ/r)/2(life ≈ 0.49 · h30 < 0 = 어디서도 안 멈춘다)', () => {
  const r = 0.00219, rho = on.dayP[1], sStar = (1 - rho / r) / 2;
  assert(sStar > 0.48 && sStar < 0.5, 's* ' + sStar);
  const k = 1 - r * (1 - 2 * sStar) / rho; near(k, 0, 1e-9);
  const sH = (1 - h.h30 / r) / 2; assert(sH < 0, 'h30 s* ' + sH);
  near(h.keep['0'], 1 - r / h.h30, 1e-9); assert(h.keep['0'] > 0.9, 'h30 빈 물에서도 값의 90 % 남짓이 남는다 ' + h.keep['0']);
});
check('⑤ 공유 어장 — 제 마을 몫(30/100)만 센다 · 장부 없는 버킷 = 1', () => {
  near(on.share.mine, 0.3); assert.strictEqual(on.share.none, 1);
  const r = 0.00219, rho = on.dayP[1], lam = r * (1 - 2 * 0.25) / rho;
  near(on.keepSolo, 1 - lam, 1e-9); near(on.keepShared, 1 - 0.3 * lam, 1e-9);
  assert(on.keepShared > on.keepSolo, '이웃과 나누면 덜 남긴다(공유지의 비극)');
});
check('⑥ 자명 통과 금지 — r 두 배면 λ 두 배 · 늙은 어부(ρ 큼)는 덜 남긴다 · 켬 계측이 센다', () => {
  const lam1 = 1 - on.keep['0.25'], lam2 = 1 - on.keepR2; near(lam2, 2 * lam1, 1e-9);
  assert(on.keepOld > on.keep['0.25'], '70세 ' + on.keepOld + ' > 30세 ' + on.keep['0.25']);
  assert(on.stat.n > 0 && on.stat.mode === 'life');
});

//   ⑦ 덧붙임 ① 자리 효율(`T1225_SITE_EFF` · 고증 켬일 때만) — 반쯤 찬 물: 평범 0.5 · 좋은 어장 2.2 kg/시간 · 가득 찬 물 두 배 · 끔 = T1218 식 그대로
const SITE = `const F=require('./server/fishing');const h=60000,k=2.5;const kg=(sp,s)=>k/F.villageWaitMs(sp,s,k,h)*h;
console.log(JSON.stringify({on:F.T1225_SITE_EFF,ord:[kg({seam01:0},0.5),kg({seam01:0},1)],good:[kg({seam01:1},0.5),kg({conflu:true,seam01:0},0.5)],mid:kg({seam01:0.5},0.5),q:[F.siteQuality({seam01:0.3}),F.siteQuality({conflu:true})],t1218:kg({seam01:1},1)}));`;
function site(env) { const e = { ...process.env, ENABLE_VILLAGES: '0', T1218_FISH_CANON: '1' }; delete e.T1225_SITE_EFF; Object.assign(e, env); const r = spawnSync(process.execPath, ['-e', SITE], { cwd: ROOT, env: e, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); return lastJson(r); }
check('⑦ 자리 효율 켬 — 반쯤 찬 물 평범 0.5 · 좋은 어장 2.2 kg/시간(합류부도 좋은 어장) · 가운데 q 0.5 = 1.35 · 가득 찬 물 두 배', () => {
  const o = site({ T1225_SITE_EFF: '1' }); assert.strictEqual(o.on, true);
  near(o.ord[0], 0.5, 1e-9); near(o.ord[1], 1.0, 1e-9); near(o.good[0], 2.2, 1e-9); near(o.good[1], 2.2, 1e-9); near(o.mid, 1.35, 1e-9);
  near(o.q[0], 0.3); assert.strictEqual(o.q[1], 1);
});
check('⑦ 자리 효율 끔 = T1218 식 그대로(가장 좋은 자리 가득 찬 물 7 kg/시간)', () => {
  const o = site({}); assert.strictEqual(o.on, false); near(o.t1218, 7.0, 1e-9);
});
console.log(`\n=== T1225 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
