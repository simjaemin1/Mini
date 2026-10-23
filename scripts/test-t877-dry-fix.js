#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t877-dry-fix.js — 요리사 갈무리 열량 보존 · 건굴 · 마른 미역 econ 칸 [T877] ==========================
//
// ★왜 [T860 회부 4 · 1] ① 요리사 갈무리는 과일 · 남새(식량 환산 0.4)를 수율 0.4 로 말려 보존식 환산 2.5 로 먹였다 — 열량 2.5 배(생성).
//   손잡이 하나 `T877_DRY_KCAL`('1' 만 켬 · 끔 = main 바이트) — 켜면 잡은 날 말리기와 같은 식(`_t860Unit`)으로 열량을 지킨다.
//   ② 건굴(`dried_oyster`) · 마른 미역(`dried_seaweed`)은 spoil 정본에 있고 econ 칸이 없었다 — econ 품목 둘을 원물에서 유도해 세웠다.
//
// 재는 것:
//   ① 술어 — `=== '1'` 만 켬 · 읽는 자리 = `sim/economy-sim.js` 하나 · 끔 탐침 · 요리사 부름 글자(켬 = `_t860Unit` · 끔 = null)
//   ② 한 걸음(가짜 마을) — 끔: 과일 1 → 말린 과실 0.4(환산 1.0 — 원물 0.4 의 2.5 배 · 미끼) · 켬: 0.16(환산 0.4 = 원물 그대로) · 생선은 켬 · 끔 같다
//   ③ 품목 둘 — 이름 · 보관일 = spoil 정본 · 값 = 원물 ÷ 수율 · 무게 = `tidal.weightMap` · 쓸모 = 보존식 넷과 같다 · 기여 = 원물 subsistence ·
//      부류 `preserved`(부패 자동) · 곳간 대응 항등 · 보존식 목록(환산 2.5 · 사다리 맨 뒤) · 잡은 날 말리기 표(굴 → 건굴 · 해조 → 마른 미역 = 정본 레시피)
//   ④ 열량 보존(잡은 날 말리기) — 굴 1 → 건굴 0.12(× 2.5 = 0.3 = 굴 0.3) · 해조 1 → 마른 미역 0.1(× 2.5 = 0.25)
//   ⑤ 세계(econ v2 · 시드 7 · 마을 다섯 · 200날 · 아이 판) — `=0` 판 = env 없는 판(곳간 전 칸) · 음수 칸 0(켬 · T860 켬 위 포함)
//
// 실행: node scripts/test-t877-dry-fix.js   (존 안 띄움 · 약 1분)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T877_SUB === '1') {
  const _l = console.log; console.log = () => {};
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const out = world.villages.map((v) => ({ name: v.name, n: v.npcs.length, neg: Object.values(v.storage).filter((x) => x < -1e-9).length,
    st: Object.keys(v.storage).sort().map((k) => [k, +(+v.storage[k] || 0).toFixed(9)]) }));
  console.log = _l; console.log(JSON.stringify({ on: require(path.join(ROOT, 'sim', 'economy-sim')).T877_ON, out }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(S);
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const near = (a, b) => Math.abs(a - b) < 1e-12;

console.log('\n=== 요리사 갈무리 열량 보존 · 건굴 · 마른 미역 econ 칸 (T877) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침 · 부름 글자');
{ const decl = S.match(/const T877_ON = \(typeof process !== 'undefined' && process\.env && process\.env\.T877_DRY_KCAL === '1'\);/g) || [];
  ok(decl.length === 1, '① 선언 하나 · `=== \'1\'` 만 켬(기본 끔)', `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => !/economy-engine\.browser\.js$/.test(p) && codeOnly(fs.readFileSync(p, 'utf8')).includes('T877_DRY_KCAL')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('sim', 'economy-sim.js'), '① 읽는 자리 = sim/economy-sim.js 하나(번들은 그 사본)', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T877_DRY_KCAL; if (v != null) e.T877_DRY_KCAL = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))}).T877_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'false' && probe('0') === 'false' && probe('1') === 'true', '① 끔 탐침 — env 없음 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('1')}`);
  ok(/if \(T17_PRESERVE\) _preserveSurplus\(v, PRESERVE_FROM, jdef\.base \* skillMul, addProduce, null, T877_ON \? _t860Unit : null\);/.test(C),
    '① 요리사 부름 — 켬 = 잡은 날 말리기와 같은 환산 함수(`_t860Unit` · 사본 0) · 끔 = null(종전 글자)'); }

console.log('\n② 한 걸음 — 가짜 마을(과일 · 생선)');
{ const mk = () => ({ npcs: new Array(10).fill(0).map(() => ({})), storage: { food: 1000, fish: 50, meat: 0, cooked_food: 0, fruit: 30 }, land: {}, treasury: {} });
  const sink = (v) => { const got = []; return { got, f: (r, a) => { got.push([r, a]); v.storage[r] = (v.storage[r] || 0) + a; } }; };
  const FF = E.FORAGE_FOOD_FACTOR, PF = E.PRESERVE_FOOD_FACTOR, Y = E.PRESERVE_YIELD;
  let v = mk(), s = sink(v); E._preserveSurplus(v, { fruit: 'dried_fruit' }, 1, s.f, null, null);
  const offOut = s.got[0] && s.got[0][1];
  ok(near(offOut, 1 * Y) && offOut * PF > 1 * FF.fruit + 1e-9, '② 미끼(끔) — 과일 1(식량 0.4) → 말린 과실 0.4(× 2.5 = 1.0) · 열량이 2.5 배로 생긴다', `${offOut} × ${PF} vs ${FF.fruit}`);
  v = mk(); s = sink(v); E._preserveSurplus(v, { fruit: 'dried_fruit' }, 1, s.f, null, E._t860Unit);
  const onOut = s.got[0] && s.got[0][1];
  ok(near(onOut, 1 * Y * FF.fruit) && near(onOut * PF, 1 * FF.fruit), '② ★켬 — 과일 1 → 말린 과실 0.16(× 2.5 = 0.4 = 원물 그대로 · 생성 0)', `${onOut}`);
  const fo = (u) => { const w = mk(), t = sink(w); E._preserveSurplus(w, { fish: 'dried_fish' }, 1, t.f, null, u); return t.got[0][1]; };
  ok(fo(null) === fo(E._t860Unit), '② 생선(식량 환산 1)은 켬 · 끔 같다(x × 1 === x)', `${fo(null)}`); }

console.log('\n③ 품목 둘 — 건굴 · 마른 미역');
{ const SP = require(path.join(ROOT, 'server', 'specialty.js')).RESOURCES;
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const Tidal = require(path.join(ROOT, 'server', 'tidal.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const DM = V.playerVillageDepositMap(), WM = Tidal.weightMap();
  for (const [k, from] of [['dried_oyster', 'oyster'], ['dried_seaweed', 'seaweed']]) {
    const r = SP[k], raw = SP[from], ref = SP.dried_fish;
    ok(!!r && r.ko === Spoil.PRESERVED_ITEMS[k].ko && Spoil.PRESERVED_ITEMS[k].shelf > 0, `③ ${k} — 이름 = spoil 정본(${Spoil.PRESERVED_ITEMS[k].ko} · 보관 ${Spoil.PRESERVED_ITEMS[k].shelf}일)`);
    ok(r && Math.abs(r.baseValue - raw.baseValue / E.PRESERVE_YIELD) < 1e-9, `③ ${k} — 값 = 원물 ${raw.baseValue} ÷ 수율 ${E.PRESERVE_YIELD} = ${r && r.baseValue}`);
    ok(r && r.weight === WM[k], `③ ${k} — 무게 = tidal.weightMap ${WM[k]}`);
    ok(r && r.utility === ref.utility && r.category === 'preserved' && r.harvest === ref.harvest, `③ ${k} — 쓸모 · 부류 · 얻는 길 = 보존식(건어물)과 같다(부패는 부류 자동)`);
    ok(r && JSON.stringify(r.contributes) === JSON.stringify({ subsistence: raw.contributes.subsistence }), `③ ${k} — 기여 = 원물 subsistence ${raw.contributes.subsistence}(보존은 열량을 늘리지 않는다)`);
    ok(DM[k] === k && E.PRESERVED_FOODS.includes(k), `③ ${k} — 곳간 대응 항등 · 보존식 목록(환산 2.5 · 사다리 맨 뒤)`);
    const rec = Object.values(Spoil.PRESERVE).find((x) => x.out === k);
    ok(rec && rec.from === from && E.CATCH_FROM.fisher[from] === k, `③ ${k} — 잡은 날 말리기 표 ${from} → ${k} = 정본 레시피`);
  } }

console.log('\n④ 열량 보존 — 잡은 날 말리기(굴 · 해조)');
{ const FF = E.FORAGE_FOOD_FACTOR, PF = E.PRESERVE_FOOD_FACTOR;
  for (const r of ['oyster', 'seaweed']) {
    const v = { npcs: new Array(10).fill(0).map(() => ({})), storage: { food: 1000, fish: 0, meat: 0, cooked_food: 0, [r]: 20 }, land: {}, treasury: {} };
    const got = []; E._preserveSurplus(v, { [r]: E.CATCH_FROM.fisher[r] }, 1, (k, a) => got.push([k, a]), { [r]: 5 }, E._t860Unit);
    ok(got.length === 1 && near(got[0][1] * PF, 1 * FF[r]), `④ ${r} 1(식량 ${FF[r]}) → ${got[0] && got[0][0]} ${got[0] && +got[0][1].toFixed(6)}(× ${PF} = ${FF[r]}) · 생성 0`);
  } }

console.log('\n⑤ 세계 — econ v2 · 시드 7 · 마을 다섯 · 200날');
{ const sub = (env) => { const e = Object.assign({}, process.env, env, { T877_SUB: '1' }); for (const k of ['T877_DRY_KCAL', 'T860_CATCH_DRY']) if (env[k] == null) delete e[k];
    return JSON.parse(execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); };
  const none = sub({}), off = sub({ T877_DRY_KCAL: '0' }), on = sub({ T877_DRY_KCAL: '1' }), both = sub({ T877_DRY_KCAL: '1', T860_CATCH_DRY: '1' }), c860 = sub({ T860_CATCH_DRY: '1' });
  ok(none.on === false && off.on === false && on.on === true, '⑤ 전제 — 손잡이가 실제로 읽힌다');
  ok(JSON.stringify(none.out) === JSON.stringify(off.out), '⑤ `=0` 판 = env 없는 판(곳간 전 칸 바이트)');
  //   (이 작은 세계엔 요리사가 서지 않아 켬 · 끔 판이 같다 — 세계 쪽 갈림은 보고 §3 서버 판 띠가 잰다 · 함수 쪽 미끼는 ②)
  ok([none, on, both, c860].every((x) => x.out.every((r) => r.neg === 0)), '⑤ 음수 칸 0(넷)'); }

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
