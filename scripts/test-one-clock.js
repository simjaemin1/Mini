#!/usr/bin/env node
// @regress
// === scripts/test-one-clock.js — 시계 하나: 몸 기온의 날 = econ 날 (T871 · 손잡이 T871_ONE_CLOCK='1' · 없음 = 끔 = main 바이트) ===
//
// ★왜 [T856 회부 1 · T871 ①] 몸은 존 `gameDayT`(= 생활층 `econDayT`)로 기온을 묻고 econ 은 `world.day` 로 그 마을 기온을 매긴다.
//   `econDayT` 의 몫은 1 을 넘어 이어져서(T484 "계단 0"), econ 마감이 하루보다 길면 몸이 econ 보다 며칠 앞의 기온을 산다(서버 판 평균 2.5일).
//   켬이면 몫 = 캐러밴 몸이 이미 쓰는 econ 날 몫 `_econDayFrac`([0, 1] · 한 함수) ⇒ 몸의 날 ∈ [D, D + 1].
//
//  ① 손잡이 — '1' 하나만 켬 · 없음 · 'true' = 끔
//  ② 값 — 운영 꼴(몫 < 1)은 끔 = 켬 · 밀린 마감(몫 ≥ 1)은 끔 = 종전 식(1 을 넘음) · 켬 = D + 1 에 선다 · econ 이 넘으면 이어서 간다 · 앵커 앞(몫 < 0)은 켬 = D
//  ③ 몸 기온 — 켬이면 밀린 판에서도 몸이 묻는 날(floor 또는 끝점)의 econ 하루 기온 = econ 이 그 날 매긴 값
//  ④ 배선 — 한 함수(`_econDayFrac`)를 캐러밴 보간 둘 · `econDayT` 가 부른다(식 사본 0) · 존 `gameDayT` 는 `econDayT` 를 읽는다
//
// 실행: node scripts/test-one-clock.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T871_SUB === 'clock') {
  const V = require(SV('villages.js'));
  const DAY = 1000, EP = 5000;
  // 창 D = 50 의 동쪽 끝 자정에 앵커(T731 켬 기본) — econ 날 50 의 경계 = EP + 100 × DAY
  const at = (day, anchor, now) => { V.__p3Bind({ world: { day }, dayMs: DAY, epoch: EP, lastGameDay: anchor, _t731Anchor: anchor }); return V.econDayT(now); };
  const B = EP + 100 * DAY;
  console.log(JSON.stringify({ on: V.T871_ONE_CLOCK,
    ops: at(50, 100, B + 400),            // 운영 꼴 — 그 날 안 0.4
    end: at(50, 100, B + 999),            // 그 날 끝 한 ms 앞
    lag: at(50, 100, B + 2500),           // 밀린 마감 — 경계에서 2.5 하루
    next: at(51, 100, B + 2500),          // econ 이 51 로 넘은 순간(같은 앵커 · 같은 벽시계)
    pre: at(50, 100, B - 300),            // 앵커 앞(몫 < 0)
    noWorld: (() => { V.__p3Bind({ world: null }); return V.econDayT(B); })() }));
  process.exit(0);
}

const KEEP = (() => { const e = Object.assign({}, process.env); delete e.T871_ONE_CLOCK; delete e.T871_SUB; return e; })();
const sub = (part, knob) => {
  const env = Object.assign({}, KEEP, { T871_SUB: part });
  if (knob !== undefined) env.T871_ONE_CLOCK = knob;
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; }
};
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-9;

say('=== 시계 하나 — 몸 기온의 날 = econ 날 (T871 · 손잡이 T871_ONE_CLOCK=1) ===');
const OFF = sub('clock'), TRUE = sub('clock', 'true'), ON = sub('clock', '1');

say('\n① 손잡이');
const VS = fs.readFileSync(SV('villages.js'), 'utf8');
ok(/const T871_ONE_CLOCK = process\.env\.T871_ONE_CLOCK === '1';/.test(VS), "① `=== '1'` 하나");
ok(OFF.on === false && TRUE.on === false && ON.on === true, "① 없음 · 'true' = 끔 · '1' = 켬", JSON.stringify([OFF.on, TRUE.on, ON.on]));

say('\n② 값 — econDayT');
ok(near(OFF.ops, 50.4) && near(ON.ops, 50.4) && near(OFF.end, 50.999) && near(ON.end, 50.999), '② 운영 꼴(몫 < 1) — 끔 = 켬(그 날 안 · 같은 값)', `${OFF.ops} · ${ON.ops} · ${OFF.end} · ${ON.end}`);
ok(near(OFF.lag, 52.5) && near(TRUE.lag, 52.5), '② 끔 — 밀린 마감이면 몫이 1 을 넘는다(종전 식 · econ 날 50 에 몸은 52.5)', `${OFF.lag}`);
ok(near(ON.lag, 51) && ON.lag !== OFF.lag, '② 켬 — 밀린 마감이면 econ 날의 끝(D + 1)에 선다(몸의 날 ∈ [D, D + 1])', `${ON.lag}`);
ok(near(ON.next, 52) && ON.next >= ON.lag, '② 켬 — econ 이 넘으면 그 날에서 이어 간다(뒤로 안 간다)', `${ON.lag} → ${ON.next}`);
ok(near(ON.pre, 50) && near(OFF.pre, 49.7), '② 앵커 앞(몫 < 0) — 끔 = 종전(D 아래) · 켬 = D', `${OFF.pre} · ${ON.pre}`);
ok(OFF.noWorld === null && ON.noWorld === null, '② 세계 없음 = null(둘 다 · 존이 벽시계로 떨어지는 그 문)');

say('\n③ 몸 기온 — econ 이 그 날 매긴 값');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const day = (t, D) => (t === D + 1 ? D : Math.floor(t));   // 끝점 D + 1 = 그 날의 끝
  const eD = E.temperatureAt(50, null, 0);
  const bOff = E.temperatureAt(day(OFF.lag, 50), null, 0), bOn = E.temperatureAt(day(ON.lag, 50), null, 0);
  ok(Math.abs(bOn - eD) === 0 && Math.abs(bOff - eD) > 0, '③ 밀린 판 — 켬 = econ 하루 기온(차 0) · 끔 = 이틀 뒤 날의 기온', `econ ${eD.toFixed(4)} · 켬 ${bOn.toFixed(4)} · 끔 ${bOff.toFixed(4)}`);
}

say('\n④ 배선');
const ZS = fs.readFileSync(SV('zone.js'), 'utf8');
ok(/function _econDayFrac\(now\) \{ return Math\.min\(1, Math\.max\(0, \(now - econDayToMs\(state\.world\.day\)\) \/ Math\.max\(1, state\.dayMs\)\)\); \}/.test(VS), '④ 한 함수 — econ 날 몫 [0, 1](경계 `econDayToMs` 에서 벽시계 몫)');
ok((VS.match(/const f = _econDayFrac\(now\);/g) || []).length === 2 && !/const f = Math\.min\(1, Math\.max\(0, \(now - econDayToMs/.test(VS), '④ 캐러밴 보간 둘이 그 함수를 부른다(식 사본 0)');
ok(/return T871_ONE_CLOCK \? D \+ _econDayFrac\(now\) : D \+ \(now - econDayToMs\(D\)\) \/ state\.dayMs;/.test(VS), '④ econDayT — 켬 = 그 함수 · 끔 = 종전 식');
ok(/t = SimVillages\.econDayT \? SimVillages\.econDayT\(now\) : null;/.test(ZS) && /_dT = gameDayT\(now\)/.test(ZS), '④ 존 몸 기온(`gameDayT`)은 econDayT 를 읽는다');

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
