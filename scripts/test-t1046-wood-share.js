#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1046-wood-share.js — 나무꾼 안전망이 출생 문과 같은 주거 상한을 읽는다 [T1046 · 손잡이 `T1046_WOOD_SHARE` 끔 기본] ======================
//
// ★왜 [T1018 회부 1 → T1046] 주거 목재 안전망(`pickDeficitJob_rational` — 인구 ≥ 읽는 주거 × 0.95 · 곳간 목재 < 인구 × 2 → 나무꾼)은 랩에서 econ 주거(목재로 짓는 칸)를 읽는다.
//   집 행위 마을(서버)은 T966 뒤 계획 주거(`_t958Plan` — 목재 없이 오르는 칸)를 읽어 이 줄이 한 번도 안 선다(서버 판 자 출생 고르기 0 · 랩 6.5% — 보고 T1046 ①).
//   켜면 출생 문(`tickVillage` 출생 줄 `_hcap` — econ 주거 ∧ 지은 침상)과 같은 상한을 읽는다.
//
// 재는 것:
//   ① 술어 — `T1046_WOOD_SHARE` 는 `=== '1'`(끔 기본 · 판 자 띠에서 첫해 기근이 서버 띠 밖 — 보고 T1046) · env 를 읽는 자리 하나 · 내보냄 · 안전망 `_hPick` 한 줄에서만 읽는다 ·
//      켬 갈래의 식은 출생 문 `_hcap` 줄과 같은 글자(econ 주거 ∧ 지은 침상)
//   ② 한 마을 60날(가짜 마을 · 존 안 띄움 · 아이 판): 집 행위 마을(`_t400Live` · 지은 침상 20) · 인구 20 · 주거 20 · 곳간 목재 0 · 식량 넉넉 · 도구 · 옷 넉넉 · 돌 · 무기 0
//      ⓐ 켬(`'1'`) — 직업 고르기(전환 날 · econ 진단 칸 `_dbgSwitch.need`)가 나무꾼을 낸다
//      ⓑ ★자명 통과 금지 — 끔(기본) 판은 계획 주거가 인구 ÷ 0.95 위로 올라 안전망이 안 서고 나무꾼을 안 낸다(결함이 실제로 보인다)
//      ⓒ 집 행위가 아닌 마을(`_t400Live` 없음 — 랩 꼴)은 켬 · 끔 같은 궤적(직업 · 주거 · 날마다 글자 그대로)
//
// 실행: node scripts/test-t1046-wood-share.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T1046_SUB === '1') {
  const _l = console.log; console.log = () => {};
  const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  if (econ.setSeed) econ.setSeed(1);
  const lp = { fertility: 1.2, arable: 1, water: 0.8, wood: 0.67, game: 0.74, stone: 0.2, ore: 0.1, size: 400, baseSize: 400, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, coastal: false };
  const fill = (v) => { v.storage.wood = 0; v.storage.food = 5000; v.storage.tool = 40; v.storage.clothes = 40; v.storage.stone = 0; v.storage.weapon = 0; };   // 석공 · 석재 · 재봉 · 전사 문이 안전망 앞에서 서지 않게
  const runOne = (live) => {
    const v = econ.createVillage({ ...lp, name: '시험농촌', initialPop: 20 });
    v._world = { picker: 'rational', villages: [v], day: 0 };
    v.housing = 20; fill(v);
    for (const n of v.npcs) n.lastJobChangeDay = -100;
    if (live) { v._t400Live = true; v._mapBeds = 20; }
    const plan = [], hs = [], jobs = [], need = [];
    for (let d = 1; d <= 60; d++) {
      v._world.day = d; fill(v);
      econ.tickVillage(v, d);
      plan.push(v._t958Plan === undefined ? null : +v._t958Plan.toFixed(4)); hs.push(+v.housing.toFixed(4));
      jobs.push(v.npcs.map((n) => n.currentJob).join(','));
      if (v._dbgSwitch && v._dbgSwitch.day === d) need.push(v._dbgSwitch.need);   // 직업 고르기가 낸 값(전환 날 · econ 진단 칸)
    }
    return { plan, hs, jobs, need, n: v.npcs.length };
  };
  const out = { on: econ.T1046_WOOD_SHARE, live: runOne(true), dead: runOne(false) };
  console.log = _l; console.log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const sub = (env) => { const e = Object.assign({}, process.env, env, { T1046_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T1046_WOOD_SHARE' in env)) delete e.T1046_WOOD_SHARE;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };

console.log('\n=== T1046 — 나무꾼 안전망이 출생 문과 같은 주거 상한을 읽는다(손잡이 `T1046_WOOD_SHARE` · 끔 기본) ===');
console.log('① 술어');
ok(/const T1046_WOOD_SHARE = \(typeof process !== 'undefined' && process\.env && process\.env\.T1046_WOOD_SHARE === '1'\);/.test(SRC), "`T1046_WOOD_SHARE` 는 `=== '1'` — 끔 기본(미설정 · 그 밖 · 브라우저 = 끔)");
ok((SRC.match(/process\.env\.T1046_WOOD_SHARE/g) || []).length === 1, 'env 를 읽는 자리 하나', (SRC.match(/process\.env\.T1046_WOOD_SHARE/g) || []).length);
ok(/^\s+T1046_WOOD_SHARE,/m.test(SRC), 'econ 이 내보낸다');
{ const L = SRC.split('\n').filter((l) => /T1046_WOOD_SHARE/.test(l) && !/^\s*\/\//.test(l) && !/^const T1046_WOOD_SHARE/.test(l) && !/^\s+T1046_WOOD_SHARE,/.test(l));
  ok(L.length === 1 && /const _hPick = T1046_WOOD_SHARE$/.test(L[0].trimEnd()), '읽는 자리는 안전망 `_hPick` 한 줄', `${L.length}줄`); }
{ const cap = 'Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity)';
  const hc = SRC.split('\n').filter((l) => l.includes(cap));
  ok(hc.length === 2 && hc.some((l) => /const _hcap = /.test(l)) && hc.some((l) => /^\s+\? Math\.min/.test(l)), '켬 갈래의 식 = 출생 문 `_hcap` 의 식(같은 글자 두 자리 · 새 수 0)', `${hc.length}자리`);
  ok(/: \(T958_HOUSE_REAL && v\._t958Plan !== undefined\) \? v\._t958Plan : v\.housing;/.test(SRC), '끔 갈래 = 종전 글자(T966 계획 주거)'); }
const ON = sub({ T1046_WOOD_SHARE: '1' }), OFF = sub({}), X = sub({ T1046_WOOD_SHARE: 'true' });
console.log('\n② 한 마을 60날 — 집 행위 마을 · 지은 침상 20 · 인구 20 · 목재 0');
ok(ON.on === true && OFF.on === false && X.on === false, "손잡이 값 — '1' = 켬 · 없음 = 끔 · 그 밖('true') = 끔");
ok(ON.live.need.length >= 4 && ON.live.need.every((x) => x === 'lumberjack'), 'ⓐ 켬 — 직업 고르기가 나무꾼을 낸다(안전망이 출생 문 상한 20 을 읽는다 · 인구 20 ≥ 20 × 0.95 · 목재 0)', ON.live.need.join(' '));
ok(OFF.live.need.length >= 4 && !OFF.live.need.includes('lumberjack') && OFF.live.plan.some((p) => p != null && p > 20 / 0.95), 'ⓑ 상황 — 끔(기본)은 계획 주거가 인구 ÷ 0.95 위로 올라 안전망이 안 서고 나무꾼을 안 낸다(결함이 보인다)', `${OFF.live.need.join(' ')} · 계획 주거 끝 ${OFF.live.plan[59]}`);
ok(ON.live.hs.every((h) => h <= 20 + 1e-9), '켬 판도 econ 주거는 지은 침상 20 을 안 넘는다(T958 그대로)', `최대 ${Math.max(...ON.live.hs)}`);
ok(JSON.stringify(ON.dead) === JSON.stringify(OFF.dead), 'ⓒ 집 행위가 아닌 마을(랩 꼴)은 켬 · 끔 같은 궤적(직업 · 주거 · 날마다 글자 그대로)');
ok(JSON.stringify(X) === JSON.stringify(OFF), "그 밖 값('true')은 끔과 같은 판");
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
