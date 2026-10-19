#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-one-decay.js — T803: 부패는 한 길(econ 일일 부패 ↔ 곳간 장부 버림) · 마감의 순간 = econ 날의 머리 (T789 손잡이 안) ===
//
// ★T789 회부 1·2: `T789_DISCARD` 켬이면 장부 버림(spoil 정본 보관일)이 econ 일일 부패(`tickDecay` · 품목별 일일률)에 **더해** 섰다 — 이중 셈.
//   그리고 마감의 순간이 벽시계(`_now()`)라 같은 트리 두 판이 갈렸다. 고친 것(새 손잡이 0):
//     ① 켬이면 econ `tickDecay` 가 감싼 마을의 로트 칸을 건너뛴다(훅 `decaySkip` 한 줄) · 아직 안 감싼 로트 칸은 그 순간 씨앗 레코드로 덮고 건너뛴다 ·
//        로트가 아닌 칸은 econ 그대로
//     ② 켬이면 마감의 순간 = 여는 econ 날 × 하루(부르는 쪽이 날을 넘긴다) — 그 마감 동안의 새 레코드 · 버림 판정 · 정산 도장이 다 그 순간
//  ① 훅(켬) — 감싼 로트 칸은 일일 부패 0 · 로트 아닌 칸은 econ 과 같은 값 · 새 로트 칸은 씨앗 레코드로 덮인다 · 장부 불변식
//  ② 마감의 순간(켬) — 새 레코드의 열쇠 = econ 날 × 하루 · 버림 판정이 그 순간(벽시계를 옮겨도 같은 답)
//  ③ 끔 탐침 — 훅에 칸이 없다 · econ 일일 부패가 그대로(훅 없는 econ 과 같은 값) · 마감의 순간 = 벽시계(종전)
//  ④ 글자 — econ 훅 한 줄(`_LOTH.decaySkip`) · 마을이 여는 econ 날을 넘긴다
//
// 실행: node scripts/test-one-decay.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const R6 = (x) => +(+x).toFixed(6);

function modRun() {
  const Lots = require(path.join(ROOT, 'server', 'lots.js'));
  const GL = require(path.join(ROOT, 'server', 'granary-lots.js'));
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const DAY = 1440000;
  let NOW = 900 * DAY + 0.37 * DAY;
  Lots.setClock(() => NOW, DAY);
  const out = { T789: GL.T789, hookHas: typeof GL.hooks.decaySkip === 'function' };
  const mk = () => ({ name: 'x', npcs: [{}, {}, {}], storage: { fish: 100, meat: 40, food: 300, clay: 0, wood: 50, hide: 30, fruit: 60 } });
  // 훅 없는 econ 이 같은 마을에 내는 값(대조)
  const ref = mk(); ref.storage.fish = 105; V2.setLotHook(null); V2.tickDecay(ref);   // 마감 동안 +5 를 얻은 그 값으로
  out.ref = Object.fromEntries(Object.entries(ref.storage).map(([k, v]) => [k, R6(v)]));
  out.isLot = Object.fromEntries(Object.keys(ref.storage).map((k) => [k, !!Lots.isLot(k)]));
  // 같은 마을을 장부에 붙이고 훅을 꽂는다(서버 꼴)
  const v = mk(); delete v.storage.fruit;   // fruit 는 감싼 뒤 econ 이 처음 만드는 칸으로
  GL.attach(v, null, 900 * DAY);           // 하루 전 씨앗(생선 보관일 2.5 안 — 버림 0)
  V2.setLotHook(GL.hooks);
  NOW = 905 * DAY + 0.61 * DAY;              // 벽시계는 econ 날과 무관하게 아무 데나
  GL.tickBegin([v], 901);                   // ★마감 머리 — 여는 econ 날 901
  v.storage.fruit = 60;                     // 그날 econ 이 처음 만든 칸(감싸기 전)
  v.storage.fish += 5;                      // 마감 동안 econ 이 얻은 몫
  const rk = (GL.ledger(v, 'fish') || []).map((r) => [r.k, R6(r.u)]);
  V2.tickDecay(v);
  out.on = Object.fromEntries(Object.entries(v.storage).map(([k, x]) => [k, R6(x)]));
  out.fishK = rk;
  out.fruitLed = (GL.ledger(v, 'fruit') || []).map((r) => [r.k, R6(r.u)]);
  out.check = GL.check([v]).bad.length;
  out.st = GL.stats();
  GL.tickEnd();
  // ② 버림 판정의 순간 — 벽시계를 옮겨도 econ 날이 같으면 같은 답
  const w1 = { name: 'a', storage: { fish: 0 } }, w2 = { name: 'b', storage: { fish: 0 } };
  for (const w of [w1, w2]) { GL.attach(w, null, 0); }
  const put = (w, k, u) => { GL.doorBegin(); w.storage.fish += u; const d = GL.doorEnd(true); GL.doorIn(d, w, 'fish', [{ k, u, f0: 1 }]); GL.doorRest(d); };
  put(w1, 1000 * DAY, 3); put(w2, 1000 * DAY, 3);   // 1000 날 0시에 든 생선(보관일 2.5)
  NOW = 1002 * DAY + 0.9 * DAY; GL.tickBegin([w1], 1002); out.d1 = R6(w1.storage.fish); GL.tickEnd();   // 벽시계는 2.9 날 뒤 · econ 날 1002 = 2.0 날 뒤
  NOW = 1002 * DAY + 0.1 * DAY; GL.tickBegin([w2], 1002); out.d2 = R6(w2.storage.fish); GL.tickEnd();
  NOW = 1003 * DAY + 0.5 * DAY; GL.tickBegin([w1, w2], 1003); out.d3 = [R6(w1.storage.fish), R6(w2.storage.fish)]; GL.tickEnd();   // econ 날 1003 = 3.0 날 뒤(상함)
  V2.setLotHook(null);
  return out;
}

if (process.argv[2] === '--child') { const o = modRun(); process.stdout.write('\n@@JSON@@' + JSON.stringify(o)); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const child = (env) => JSON.parse(String(execFileSync(process.execPath, [__filename, '--child'], { env: Object.assign({}, process.env, { T789_DISCARD: '' }, env), encoding: 'utf8' })).split('@@JSON@@').pop());

console.log('\n=== T803 부패는 한 길 · 마감의 순간 = econ 날의 머리 ===');
const ON = child({ T789_DISCARD: '1' });
console.log('\n① 훅(켬)');
ok(ON.T789 && ON.hookHas, '켬 — 훅에 `decaySkip` 이 선다');
const lots = Object.keys(ON.isLot).filter((k) => ON.isLot[k]), non = Object.keys(ON.isLot).filter((k) => !ON.isLot[k]);
ok(lots.includes('fish') && lots.includes('food'), '대조 — 생선 · 곡식은 로트 칸', lots.join(','));
const INI = { fish: 105, meat: 40, food: 300, clay: 0, wood: 50, hide: 30, fruit: 60 };
const decayedRef = Object.keys(ON.ref).filter((k) => ON.ref[k] !== INI[k]);
ok(decayedRef.includes('fish') && decayedRef.includes('meat'), '대조 — 훅 없는 econ 은 생선 · 고기를 하루 깎는다', JSON.stringify(ON.ref));
ok(ON.on.fish === 105 && ON.on.meat === 40 && ON.on.food === 300, '★감싼 로트 칸은 일일 부패 0(장부 버림이 그 몫 — 한 길)', JSON.stringify(ON.on));
ok(ON.on.fruit === 60 && ON.fruitLed.length === 1 && ON.fruitLed[0][0] === 901 * 1440000 && ON.fruitLed[0][1] === 60, '★새 로트 칸(감싸기 전)은 그 순간 씨앗 레코드로 덮이고 건너뛴다', JSON.stringify(ON.fruitLed));
const nonLotDecay = non.filter((k) => decayedRef.includes(k));
ok(nonLotDecay.every((k) => ON.on[k] === ON.ref[k]), '로트 아닌 칸은 econ 그대로(훅 없는 econ 과 같은 값)', nonLotDecay.map((k) => `${k} ${ON.on[k]}`).join(' · ') || '(로트 아닌 부패 칸 없음)');
ok(ON.check === 0, '장부 불변식(장부 합 − 빚 = 곳간)', ON.check);
ok(ON.st.t803Skip >= 4 && ON.st.t803Seed === 1, '셈 — 건너뛴 칸 · 씨앗 덮음', `skip ${ON.st.t803Skip} · seed ${ON.st.t803Seed}`);
console.log('\n② 마감의 순간(켬)');
const newRec = ON.fishK.find((r) => r[1] === 5);
ok(newRec && newRec[0] === 901 * 1440000, '★마감 동안 얻은 몫의 열쇠 = 여는 econ 날 × 하루(벽시계 905.61 날이 아니라 901 날 0시)', JSON.stringify(ON.fishK));
ok(ON.d1 === 3 && ON.d2 === 3, '★버림 판정 = econ 날의 머리 — 벽시계를 2.9 날 · 2.1 날 뒤로 옮겨도 econ 날 1002(2.0 날 뒤)면 둘 다 안 상했다', `${ON.d1} · ${ON.d2}`);
ok(ON.d3[0] === 0 && ON.d3[1] === 0, 'econ 날 1003(3.0 날 뒤) — 둘 다 같은 마감에 버려진다', JSON.stringify(ON.d3));

console.log('\n③ 끔 탐침');
const OFF = child({});
ok(!OFF.T789 && !OFF.hookHas, '끔 — 훅에 칸이 없다(econ 훅 줄 무동작)');
ok(Object.keys(OFF.ref).every((k) => OFF.on[k] === OFF.ref[k]), '끔 — econ 일일 부패가 그대로(훅 없는 econ 과 같은 값 · 로트 칸도)', JSON.stringify(OFF.on));
const offRec = OFF.fishK.find((r) => r[1] === 5);
ok(offRec && offRec[0] === Math.round((905 + 0.61) * 1440000), '끔 — 마감의 순간 = 벽시계(종전 그대로)', JSON.stringify(OFF.fishK));

console.log('\n④ 글자');
const econ = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
ok((econ.match(/_LOTH\.decaySkip/g) || []).length === 2 && /if \(_LOTH !== null && _LOTH\.decaySkip && _LOTH\.decaySkip\(v, r\)\) continue;/.test(econ), 'econ 훅 한 줄(`tickDecay` 품목 줄 앞)');
const bundle = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(bundle.includes('_LOTH.decaySkip(v, r)) continue;'), '번들에도 같은 줄(랩 사본 — 훅 없으면 무동작)');
const vil = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/G\.tickBegin\(state\.world && state\.world\.villages, state\.world \? state\.world\.day \+ 1 : undefined\)/.test(vil), '마을 하루 마감 머리가 여는 econ 날을 넘긴다');

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
