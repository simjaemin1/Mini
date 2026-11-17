#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1325-one-rot.js — T1325: 썩음은 한 길로만 센다(`T1325_ONE_ROT` · ★T1336 켬 기본 · `=0` 끔) — 같은 곳간이면 몸 = 랩 직업 고르기 입력 ===
//
// ★T1325 ①: 몸 판(로트 켬 · 장부 버림 `T789_DISCARD` 끔)은 econ 일일 부패가 재고를 깎고(랩과 같은 길), 식량 합계(`storageFoodEquivalent`)는
//   거기에 더해 장부의 상한 레코드 몫을 **또** 뺐다 — 곳간에 남아 먹히는 식량이 0 으로 읽힌다. 날 72 에 시작 재고 레코드(팥 · 율무 — 보관일 45)가
//   한꺼번에 상해 기근 문(사람 × 10) 마을이 17 → 43 · 하루 2명 옮김 → 나무꾼이 농부로 빠졌다(몸 +239 : 랩 +109).
//   손잡이를 켜면 장부 버림이 꺼진 판에서는 상한 몫을 빼지 않는다(랩 글 = 정본 · 새 수 0).
//  ① 끔(`T1325_ONE_ROT=0` · T1325 판) — 같은 곳간 · 상한 시작 레코드: 몸 합계 < 랩 합계(결함 재현 · 직업 표가 갈린다)
//  ② 켬 — 몸 합계 = 랩 합계 · 식량 문(사람 × 10 · × 30) 같음 · 같은 세계 상태 ⇒ 같은 직업 표(`autoSwitchJob` 고른 일 · 옮긴 사람)
//  ③ 켬 + 장부 버림 켬(`T789_DISCARD=1`) — 손잡이 무동작(장부가 썩음 길을 맡는다 · 상한 몫은 계속 뺀다)
//  ④ 미끼 — 손잡이 갈래를 지운 사본(econ 을 그 사본으로 갈아 끼운다)은 ② 가 빨강
//
// 실행: node scripts/test-t1325-one-rot.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ECON = path.join(ROOT, 'sim', 'economy-sim.js');

function modRun() {
  // 미끼 판: econ 을 사본으로 갈아 끼운다(v2 가 부르는 './economy-sim' 까지 — 한 모듈)
  if (process.env.T1325_DECOY) {
    const Module = require('module');
    const orig = Module._resolveFilename;
    Module._resolveFilename = function (req, parent, ...rest) {
      const f = orig.call(this, req, parent, ...rest);
      return f === ECON ? process.env.T1325_DECOY : f;
    };
  }
  const Lots = require(path.join(ROOT, 'server', 'lots.js'));
  const GL = require(path.join(ROOT, 'server', 'granary-lots.js'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const DAY = 1440000;
  let NOW = 0;
  Lots.setClock(() => NOW, DAY);
  const mk = () => {
    const w = E2.createWorldV2({ seed: 1020, villageCount: 1 }), v = w.villages[0];
    w.picker = 'rational';
    return { w, v };
  };
  const B = mk(), L = mk();   // 몸(장부 붙임) · 랩(장부 없음) — 같은 씨앗 = 같은 세계 상태
  const N = B.v.npcs.length;
  const per = E.storageFoodPer(B.v, 'azuki');
  // 곳간: 팥(보관일 45) 시작 레코드 = 사람 × 40 날치 · 나머지 식량 0 — 통째로 세면 넉넉(× 30 위) · 상한 몫을 빼면 기근(× 10 아래)
  for (const X of [B, L]) {
    for (const r of Object.keys(X.v.storage)) if (E.storageFoodPer(X.v, r) > 0) X.v.storage[r] = 0;
    X.v.storage.azuki = per > 0 ? (N * 40) / per : 0;
    X.v.storage.wood = 1000;
  }
  NOW = 0;
  const att = GL.attach(B.v, null, 0);   // 날 0 시작 레코드(몸 판의 그 씨앗)
  E.setLotHook(GL.hooks);
  NOW = 200 * DAY;                       // 날 200 — 시작 레코드가 상했다(보관일 45 · 곳간 배율 안)
  const fr = GL.freshOf(B.v, 'azuki');
  const out = { N, per, att, T789: GL.T789, spoiledU: fr ? fr.spoiledU : null, u: fr ? fr.u : null };
  out.feB = E.totalFoodEquivalent(B.v); out.feL = E.totalFoodEquivalent(L.v);
  const reg = (fe) => (fe < N * 10 ? 'r10' : fe < N * 30 ? 'r30' : 'rOk');
  out.regB = reg(out.feB); out.regL = reg(out.feL);
  const jobs = (v) => v.npcs.map((p) => p.currentJob).join(',');
  const j0B = jobs(B.v), j0L = jobs(L.v);
  E._autoSwitchJobForTest(B.v, 100, B.w); E._autoSwitchJobForTest(L.v, 100, L.w);
  out.sameStart = j0B === j0L;
  out.needB = B.v._dbgSwitch ? B.v._dbgSwitch.need : null; out.needL = L.v._dbgSwitch ? L.v._dbgSwitch.need : null;
  out.jobsSame = jobs(B.v) === jobs(L.v);
  out.movedB = B.v.npcs.filter((p, i) => p.currentJob !== j0B.split(',')[i]).length;
  out.movedL = L.v.npcs.filter((p, i) => p.currentJob !== j0L.split(',')[i]).length;
  E.setLotHook(null);
  return out;
}

if (process.argv[2] === '--child') { const o = modRun(); process.stdout.write('\n@@JSON@@' + JSON.stringify(o)); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const BASE = { T1243_FARM_ON: '1', T789_DISCARD: '', T1325_ONE_ROT: '0', T1325_DECOY: '' };   // ★[T1336] 켬 기본 — 끔 판은 '0' 을 글자로
const child = (env) => JSON.parse(String(execFileSync(process.execPath, [__filename, '--child'], { env: Object.assign({}, process.env, BASE, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).split('@@JSON@@').pop());
const f1 = (x) => (x == null ? '-' : (+x).toFixed(1));

console.log('\n=== T1325 썩음은 한 길로만 센다 · 같은 곳간이면 몸 = 랩 직업 고르기 입력 ===');
const OFF = child({});                       // 끔 = '0'(BASE)
const DEF = child({ T1325_ONE_ROT: '' });   // ★[T1336] 빈 값 = 기본 = 켬
console.log('\n① 끔(`=0` · T1325 판) — 결함 재현');
ok(OFF.att && OFF.per > 0 && OFF.spoiledU > 0 && Math.abs(OFF.spoiledU - OFF.u) < 1e-6, '대조 — 몸 곳간에 장부가 붙고 팥 시작 레코드가 통째로 상했다(장부 버림 끔 = 곳간에 남는다)', `N ${OFF.N} · 상한 ${f1(OFF.spoiledU)} / ${f1(OFF.u)}`);
ok(OFF.feB < OFF.feL && OFF.regB === 'r10' && OFF.regL === 'rOk', '★끔 — 몸 합계가 상한 몫을 빼 기근 문 · 랩은 같은 곳간을 넉넉으로 센다', `몸 ${f1(OFF.feB)}(${OFF.regB}) : 랩 ${f1(OFF.feL)}(${OFF.regL})`);
ok(OFF.sameStart && (OFF.needB !== OFF.needL || !OFF.jobsSame), '끔 — 같은 세계 상태인데 직업 표가 갈린다', `고른 일 몸 ${OFF.needB} : 랩 ${OFF.needL} · 옮김 ${OFF.movedB} : ${OFF.movedL}`);

const ON = child({ T1325_ONE_ROT: '1' });
console.log('\n② 켬 — 몸 = 랩');
ok(ON.feB === ON.feL && ON.feB === OFF.feL, '★켬 — 몸 합계 = 랩 합계(상한 몫을 또 빼지 않는다 · 랩 값 그대로)', `몸 ${f1(ON.feB)} : 랩 ${f1(ON.feL)}`);
ok(ON.regB === ON.regL, '★식량 문(사람 × 10 · × 30) 같음 — 옮김 빈도가 같은 자리', `${ON.regB} : ${ON.regL}`);
ok(ON.sameStart && ON.needB === ON.needL && ON.jobsSame && ON.movedB === ON.movedL, '★같은 세계 상태 ⇒ 같은 직업 표(고른 일 · 옮긴 사람)', `고른 일 ${ON.needB} : ${ON.needL} · 옮김 ${ON.movedB} : ${ON.movedL}`);
ok(ON.feL === OFF.feL && ON.needL === OFF.needL, '랩 쪽은 손잡이와 무관(장부 없음 = 손잡이 무동작)', `${f1(ON.feL)} · ${ON.needL}`);

const DIS = child({ T1325_ONE_ROT: '1', T789_DISCARD: '1' });
console.log('\n②ⓑ 기본(빈 값) = 켬 · T1336');
ok(DEF.feB === DEF.feL && DEF.feB === ON.feB && DEF.needB === ON.needB && DEF.jobsSame, '★켬 기본 — 손잡이를 안 주면 켬과 같은 합계 · 같은 직업 표(T1336)', `몸 ${f1(DEF.feB)} : 랩 ${f1(DEF.feL)}`);
console.log('\n③ 켬 + 장부 버림 켬');
ok(DIS.T789 && DIS.feB < DIS.feL && DIS.feB === OFF.feB, '장부가 썩음 길을 맡는 판 — 손잡이 무동작(상한 몫은 계속 뺀다 · 끔 값 그대로)', `몸 ${f1(DIS.feB)} : 랩 ${f1(DIS.feL)}`);

console.log('\n④ 글자 · 미끼');
const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const GATE = '!(T1325_ONE_ROT && !T1325_LOT_DISCARD)';
ok(src.split(GATE).length === 2, '손잡이 갈래는 econ 식량 합계 한 줄(`storageFoodEquivalent`)');
ok(/const foodEquiv_for_switch = totalFoodEquivalent\(v\)/.test(src) && /function pickDeficitJob_rational[\s\S]{0,200}const foodEquiv = totalFoodEquivalent\(v\)/.test(src), '옮김 빈도 문(7절) · 피커 기근 문이 같은 합계를 읽는다(사본 0)');
const bundle = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(bundle.includes(GATE), '브라우저 묶음도 같은 줄(build-econ-bundle)');
const decoy = path.join(ROOT, 'sim', `.t1325-decoy-${process.pid}.js`);
try {
  fs.writeFileSync(decoy, src.replace(GATE, 'true'));
  const D = child({ T1325_ONE_ROT: '', T1325_DECOY: decoy });   // 기본(켬) 판에서 손잡이 갈래를 지운 사본 = 두 번 빼기
  ok(D.feB < D.feL && !(D.needB === D.needL && D.jobsSame), '★미끼(손잡이 갈래 지운 사본) — ② 가 빨강(몸 합계 < 랩 · 직업 표 갈림)', `몸 ${f1(D.feB)} : 랩 ${f1(D.feL)} · ${D.needB} : ${D.needL}`);
} finally { try { fs.unlinkSync(decoy); } catch (e) {} }

console.log(`\n${fail ? '✗' : '✓'} test-t1325-one-rot ${pass}/${fail}`);
process.exit(fail ? 1 : 0);
