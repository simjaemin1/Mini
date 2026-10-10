#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-seed-hold.js — 시딩 통나무 첫 30일: 흐름 EMA 초기값 `T683_EMA_INIT` · 수출 후보 문턱 `T683_EXPORT_FLOW`(둘 다 기본 끔) ===
//
// ★왜 [T683 · T659 회부 ③④]
//   ⓐ 새 세계 마을은 `_consEMA` 없이 태어나 통나무 흐름이 0 에서 30일을 덥힌다(초기값이 없다) — 그 사이 시딩 곳간이 빈다(중앙 23일).
//   ⓑ 발주 후보 문턱 `target = max(subs×30, 0.8N)`(그 외 품목 keep 0.5 · thresh 0.8)은 흐름을 모른다 — 통나무 thresh 1.2N(8명 9.6).
//   손잡이 A(v1 `createVillage`)는 시딩 때 아는 소비(땔감 `FIREWOOD_PC × n` + 집 몫 `houseDayBuild × houseCostPerCap('wood')`)로 EMA 를 연다.
//   손잡이 B(v2 `exportDaysSlot`)는 통나무에 한해 `subs×30` 자리에 흐름 EMA × 같은 날 수(30)를 쓴다. 새 수 0 · 판정 0.
//
// ★★이 하네스가 지키는 것
//   ⓐ 끔(기본) = 종전: 손잡이 둘 거짓 · 새 마을에 `_consEMA` 가 없다 · 수출 자리 = subs×30(EMA 무관) · `=0` = 미설정
//   ⓑ A 켬: 8명 마을 EMA.wood = 8 × FIREWOOD_PC + 집 몫(시딩 집 20 ≥ 8×1.15 → 0) · 20명 마을은 집 몫 > 0(같은 두 함수) ·
//      인구 0 터는 키 없음 · 통나무 키 하나 · 첫 틱(어제 소비 없음)은 그대로 · 둘째 날 폴드 = 종전 식(29/30 · 1/30)
//   ⓒ B 켬: 통나무 자리 = EMA × 30(5 → 150 · EMA 없음 → 0 → 목표 0.8N 바닥) · 돌 · 식량 = subs×30 그대로
//   ⓓ 끝에서 끝(작은 세계 6일 · 발주 훅 `onTradeLeg` 의 후보 잉여): 마을마다 그날 첫 화물의 통나무 잉여 = max(1, 곳간 − 0.5 × max(자리, 0.8N)) —
//      끔은 자리 = subs×30 · B 켬은 자리 = EMA×30 · A+B 켬은 첫날 EMA = 초기값(곳간 · 인구 같은 날 끔과 같다)
//   ⓔ 자리 하나: 손잡이를 읽는 자리 각 하나 · A 적용 줄 `createVillage` 안 하나 · B 자리 = 발주 후보 target 줄 하나 ·
//      출발 뒤 값 다시 매김(`tg = Math.max(subs * 30, buf)` 두 자리) · 귀환 화물 문턱 무변
//   ⓕ 3사본: 번들이 두 손잡이 줄을 싣는다 · 브라우저 꼴(process 심 env 빈 판)에선 끔 · 랩 두 벌 인라인 = 번들
//   ⓖ 미끼: A 적용 줄을 뺀 v1 사본 → 켬에서도 키 없음 ⇒ ⓑ 가 빨개진다 · B 판정 줄을 뺀 v2 사본 → 켬에서도 subs×30 ⇒ ⓒ · ⓓ 가 빨개진다
//
// 실행: node scripts/test-seed-hold.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const V1_PATH = path.join(ROOT, 'sim', 'economy-sim.js');
const V2_PATH = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const S1 = fs.readFileSync(V1_PATH, 'utf8'), S2 = fs.readFileSync(V2_PATH, 'utf8');
const A_LINE = '  if (T683_EMA_INIT && initN > 0) v._consEMA = { wood: t683WoodEmaInit(v, initN) };';
const B_LINE = "  if (T683_EXPORT_FLOW && r === 'wood') return (((v && v._consEMA) || {}).wood || 0) * 30;";
const B_CALL = '        const target = Math.max(exportDaysSlot(a.v, r, subs), buffer);';

// 아이 프로세스 — env 를 바꿔 v1 · v2 를 새로 적재하고 값을 JSON 으로 돌려준다(손잡이는 적재 때 읽는다)
//   mutate: [파일, 찾을 글자, 바꿀 글자] — 적재 때 그 사본 글자만 바꾼다(미끼 — 디스크 무변 · T659 하네스 그 문법)
function child(env, mutate) {
  const code = `
    process.env.ENABLE_VILLAGES = '0';
    const fs = require('fs'), Module = require('module');
    const MUT = ${JSON.stringify(mutate || null)};
    if (MUT) { const _l = Module._extensions['.js']; Module._extensions['.js'] = function (m, f) {
      if (f === MUT[0]) { const c = fs.readFileSync(f, 'utf8'); if (!c.includes(MUT[1])) throw new Error('MUT_MISS'); m._compile(c.replace(MUT[1], MUT[2]), f); return; }
      return _l(m, f); }; }
    const l = console.log; console.log = () => {};
    const v1 = require(${JSON.stringify(V1_PATH)}), v2 = require(${JSON.stringify(V2_PATH)});
    try {
      const mk = (n) => v1.createVillage({ initialPop: n, name: 'fixture' + n });
      const a8 = mk(8), a0 = mk(0), a20 = mk(20);
      const keys = (v) => (v._consEMA ? Object.keys(v._consEMA) : null);
      const share = (v, n) => v1.houseDayBuild(v, n, v1.totalFoodEquivalent(v)) * v1.houseCostPerCap('wood');
      // 폴드 — 첫 틱(어제 소비 없음) · 둘째 틱
      const f8 = mk(8); const e0 = f8._consEMA ? f8._consEMA.wood : null;
      v1.tickVillage(f8, 1); const e1 = f8._consEMA ? f8._consEMA.wood : null, d1 = (f8._consDay || {}).wood || 0;
      v1.tickVillage(f8, 2); const e2 = f8._consEMA ? f8._consEMA.wood : null;
      // 자리
      const slot = (ema, r, subs) => v2.exportDaysSlot(ema == null ? {} : { _consEMA: { wood: ema } }, r, subs);
      // 끝에서 끝 — 작은 세계 6일 · 그날 마을별 첫 화물의 후보 잉여
      const world = v2.createWorldV2({ seed: 11, villageCount: 8 });
      const legs = []; world.onTradeLeg = (L) => legs.push(L);
      const init = world.villages.map((v) => ({ name: v.name, n: v.npcs.length, ema: v._consEMA ? v._consEMA.wood : null }));
      const rows = [];
      for (let d = 0; d < 6; d++) {
        const P = v2.tickWorldV2Parts(world);
        P.head(); for (const v of world.villages) P.village(v);
        const snap = new Map(world.villages.map((v) => [v.name, { stock: v.storage.wood || 0, N: v.npcs.length, ema: ((v._consEMA || {}).wood) || 0 }]));
        const b0 = legs.length; P.trade();
        const seen = new Set();
        for (const L of legs.slice(b0)) { if (seen.has(L.from)) continue; seen.add(L.from); const w = L.cands.find((c) => c.res === 'wood'); rows.push(Object.assign({ day: world.day, from: L.from, surplus: w ? w.surplus : null }, snap.get(L.from))); }
        P.caravans(); P.tail();
      }
      console.log = l;
      process.stdout.write(JSON.stringify({ A: v1.T683_EMA_INIT, B: v2.T683_EXPORT_FLOW, FW: v1.FIREWOOD_PC, subsWood: v2.SUBSISTENCE_PER_NPC.wood, HB: v1.HOUSE_BUFFER,
        a8: { ema: a8._consEMA || null, keys: keys(a8), housing: a8.housing, share: share(a8, 8) }, a0: { ema: a0._consEMA || null },
        a20: { ema: a20._consEMA || null, housing: a20.housing, share: share(a20, 20) },
        fold: { e0, e1, d1, e2 },
        slot: { w5: slot(5, 'wood', 0.4), w0: slot(null, 'wood', 0.4), s5: slot(5, 'stone', 0.32), f5: slot(5, 'food', 8) },
        world: { init, rows } }));
    } catch (e) { console.log = l; process.stdout.write(JSON.stringify({ err: String(e && e.stack || e).slice(0, 400) })); }`;
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(env)) if (env[k] == null) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: e, cwd: ROOT, maxBuffer: 1 << 26 }).toString());
}
const UNSET = { T683_EMA_INIT: null, T683_EXPORT_FLOW: null };
const near = (x, y) => x != null && y != null && Math.abs(x - y) < 1e-9;
// 끝에서 끝 줄 검사 — 그날 첫 화물의 통나무 잉여가 그 팔의 식과 같은가(후보에 없으면 곳간 ≤ thresh 인가)
function e2e(W, slotOf) {
  let n = 0, good = 0, withWood = 0;
  for (const r of W.rows) {
    n++;
    const target = Math.max(slotOf(r), r.N * 0.8), keep = target * 0.5, thresh = target * 0.8;
    if (r.surplus == null) { if (!(r.stock > thresh)) good++; continue; }
    withWood++;
    if (r.stock > thresh && near(r.surplus, Math.max(1, r.stock - keep))) good++;
  }
  return { n, good, withWood };
}

console.log('\nⓐ 끔(기본) = 종전');
const OFF = child(UNSET);
if (OFF.err) console.log('  (아이 실패) ' + OFF.err);
ok(OFF.A === false && OFF.B === false, 'ⓐ 손잡이 둘 미설정 = 거짓(기본 끔)');
ok(OFF.a8 && OFF.a8.ema === null && OFF.a20.ema === null && OFF.a0.ema === null, 'ⓐ 새 마을(8 · 20 · 0명)에 `_consEMA` 가 없다(첫 폴드에서 선다 — 종전)');
const SUBS8 = OFF.subsWood * 8 * 30;
ok(OFF.slot && OFF.slot.w5 === 0.4 * 30 && OFF.slot.w0 === 0.4 * 30 && OFF.slot.s5 === 0.32 * 30, 'ⓐ 수출 자리 = subs×30 — 통나무 EMA 5 든 없든 12 · 돌 9.6(EMA 무관)', JSON.stringify(OFF.slot));
const ZERO = child({ T683_EMA_INIT: '0', T683_EXPORT_FLOW: '0' });
ok(ZERO.A === false && ZERO.B === false && ZERO.a8.ema === null && JSON.stringify(ZERO.slot) === JSON.stringify(OFF.slot)
  && JSON.stringify(ZERO.world.rows) === JSON.stringify(OFF.world.rows), 'ⓐ `=0` = 미설정과 같다(손잡이 · 키 · 자리 · 작은 세계 6일 후보)');

console.log('\nⓑ A 켬(`T683_EMA_INIT=1`) — 시딩 때 아는 소비로 EMA 를 연다');
const A = child({ T683_EMA_INIT: '1', T683_EXPORT_FLOW: null });
if (A.err) console.log('  (아이 실패) ' + A.err);
ok(A.A === true && A.B === false, 'ⓑ A 참 · B 거짓(손잡이 따로)');
ok(A.a8.share === 0 && A.a8.housing >= 8 * A.HB, `ⓑ 8명 시딩 — 집 ${A.a8.housing} ≥ 8 × ${A.HB} 이라 집 몫 0(오늘 올릴 집 없음)`, String(A.a8.share));
ok(near(A.a8.ema && A.a8.ema.wood, 8 * A.FW + A.a8.share) && JSON.stringify(A.a8.keys) === '["wood"]', `ⓑ 8명 EMA.wood = 8 × FIREWOOD_PC(${A.FW}) + 집 몫 = ${(8 * A.FW).toFixed(2)} · 키는 통나무 하나`, JSON.stringify(A.a8.ema));
ok(A.a20.share > 0 && near(A.a20.ema && A.a20.ema.wood, 20 * A.FW + A.a20.share), `ⓑ 20명 시딩 — 집 ${A.a20.housing} < 20 × ${A.HB} 이라 집 몫 > 0(같은 두 함수 · ${A.a20.share.toFixed(3)})`, JSON.stringify(A.a20.ema));
ok(A.a0.ema === null, 'ⓑ 인구 0 터(플레이어 마을)는 안 건다');
ok(near(A.fold.e1, A.fold.e0) && A.fold.d1 > 0 && near(A.fold.e2, A.fold.e0 * (29 / 30) + A.fold.d1 * (1 / 30)),
  'ⓑ 첫 틱은 초기값 그대로(어제 소비 없음) · 둘째 틱 = 종전 폴드(29/30 · 1/30)', `${A.fold.e0} → ${A.fold.e1} → ${A.fold.e2 && A.fold.e2.toFixed(4)}`);
ok(JSON.stringify(A.slot) === JSON.stringify(OFF.slot), 'ⓑ A 만 켜면 수출 자리는 끔 그대로(자리는 B 가 연다)');

console.log('\nⓒ B 켬(`T683_EXPORT_FLOW=1`) — 통나무 자리가 흐름을 본다');
const B = child({ T683_EMA_INIT: null, T683_EXPORT_FLOW: '1' });
if (B.err) console.log('  (아이 실패) ' + B.err);
ok(B.A === false && B.B === true, 'ⓒ A 거짓 · B 참');
ok(B.slot.w5 === 150 && B.slot.w0 === 0, 'ⓒ 통나무 자리 = EMA × 30(5 → 150 · EMA 없음 → 0 → 목표는 0.8N 바닥)', JSON.stringify(B.slot));
ok(B.slot.s5 === OFF.slot.s5 && B.slot.f5 === OFF.slot.f5, 'ⓒ 돌 · 식량 = subs×30 그대로(통나무 하나)', `${B.slot.s5} · ${B.slot.f5}`);
ok(B.a8.ema === null, 'ⓒ B 만 켜면 새 마을 EMA 는 끔 그대로(초기값은 A 가 연다)');

console.log('\nⓓ 끝에서 끝 — 작은 세계(createWorldV2 seed 11 · 8마을) 6일 · 마을별 그날 첫 화물의 통나무 후보 잉여');
const AB = child({ T683_EMA_INIT: '1', T683_EXPORT_FLOW: '1' });
if (AB.err) console.log('  (아이 실패) ' + AB.err);
const subsSlot = (r) => OFF.subsWood * r.N * 30, flowSlot = (r) => r.ema * 30;
const eOff = e2e(OFF.world, subsSlot), eB = e2e(B.world, flowSlot), eAB = e2e(AB.world, flowSlot);
ok(eOff.n >= 10 && eOff.withWood >= 5 && eOff.good === eOff.n, `ⓓ 끔 — 잉여 = max(1, 곳간 − 0.5 × max(subs×30, 0.8N))`, `${eOff.good}/${eOff.n}줄 · 통나무 후보 ${eOff.withWood}`);
ok(eB.n >= 10 && eB.good === eB.n, 'ⓓ B 켬 — 잉여 = max(1, 곳간 − 0.5 × max(EMA×30, 0.8N)) (EMA 가 덥혀지는 중 · 바닥 0.8N)', `${eB.good}/${eB.n}줄 · 통나무 후보 ${eB.withWood}`);
ok(eAB.n >= 10 && eAB.good === eAB.n, 'ⓓ A+B 켬 — 같은 식 · EMA 는 초기값에서 시작', `${eAB.good}/${eAB.n}줄`);
const ab1 = AB.world.rows.filter((r) => r.day === 1 && r.surplus != null), off1 = OFF.world.rows.filter((r) => r.day === 1 && r.surplus != null);
const pair = ab1.map((r) => [r, off1.find((o) => o.from === r.from)]).filter(([, o]) => o);
const initOf = (nm) => (AB.world.init.find((x) => x.name === nm) || {}).ema;
ok(pair.length >= 1 && pair.every(([r, o]) => near(r.stock, o.stock) && r.N === o.N && near(r.ema, initOf(r.from)) && r.surplus < o.surplus),
  'ⓓ A+B 첫날 — 곳간 · 인구는 끔과 같고 EMA = 초기값이라 통나무 잉여가 끔보다 작다(덜 내놓는다)', pair.map(([r, o]) => `${r.from} ${o.surplus.toFixed(1)}→${r.surplus.toFixed(1)}`).join(' · '));
ok(AB.world.init.every((x) => x.ema != null && near(x.ema, x.n * AB.FW)), 'ⓓ A 켬 작은 세계 — 마을마다 EMA 초기값 = n × FIREWOOD_PC(6~10명 · 집 몫 0)', AB.world.init.map((x) => `${x.n}:${x.ema}`).join(' '));

console.log('\nⓔ 자리 하나 — 읽는 자리 · 적용 자리 · 무변 자리');
ok((S1.split('process.env.T683_EMA_INIT').length - 1) === 1 && (S2.split('process.env.T683_EXPORT_FLOW').length - 1) === 1, 'ⓔ 손잡이를 읽는 자리 각 하나(v1 · v2)');
ok((S1.split('T683_EMA_INIT &&').length - 1) === 1 && S1.includes(A_LINE) && S1.indexOf(A_LINE) > S1.indexOf('function createVillage(') && S1.indexOf(A_LINE) < S1.indexOf('\nfunction jobCounts('),
  'ⓔ A 적용 줄 하나 — `createVillage` 안(집 `v.housing` 뒤)');
ok(S1.indexOf(A_LINE) > S1.indexOf('  v.housing = Math.max(initN, HOUSE_START);'), 'ⓔ A 는 시딩 집이 선 뒤에 잰다(집 몫이 그 집을 본다)');
ok((S2.split('T683_EXPORT_FLOW &&').length - 1) === 1 && S2.includes(B_LINE) && (S2.split('exportDaysSlot(a.v, r, subs)').length - 1) === 1 && S2.includes(B_CALL),
  'ⓔ B 판정 줄 하나(`exportDaysSlot` 안) · 부르는 자리 하나(발주 후보 target 줄)');
ok((S2.split('tg = Math.max(subs * 30, buf)').length - 1) === 2 && S2.includes('const bTarget = Math.max(bSubs * 30, b.v.npcs.length * 0.3);'),
  'ⓔ 무변 — 출발 뒤 값 다시 매김 두 자리(`tg = max(subs×30, buf)`) · 귀환 화물 문턱(`bTarget`)');

console.log('\nⓕ 3사본 — 번들 · 랩');
const BUN = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(BUN.includes(A_LINE) && BUN.includes(B_LINE) && BUN.includes(B_CALL), 'ⓕ 번들이 같은 줄 셋을 싣는다(A 적용 · B 판정 · B 부름)');
{
  const win = {};
  try { vm.runInNewContext(BUN, { window: win, console: { log() {}, info() {}, warn() {}, error() {} } }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  ok(!!E && E.T683_EMA_INIT === false && E.T683_EXPORT_FLOW === false && E.exportDaysSlot({ _consEMA: { wood: 5 } }, 'wood', 0.4) === 12,
    'ⓕ 브라우저 꼴(process 심 env 빈 판)에선 둘 다 끔 — 랩 기본 = 종전', win.err || '');
}
let inl = 0; try { execFileSync(process.execPath, [path.join(ROOT, 'sim', 'inline-engine.js'), '--check'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { inl = e.status || 1; }
ok(inl === 0, 'ⓕ 랩 두 벌 인라인 = 번들(`inline-engine --check`)');

console.log('\nⓖ 미끼 — 줄을 뺀 사본');
let BA = null; try { BA = child({ T683_EMA_INIT: '1', T683_EXPORT_FLOW: null }, [V1_PATH, A_LINE, '']); } catch (e) { BA = { err: String(e.message).slice(0, 160) }; }
ok(!!BA && BA.A === true && BA.a8 && BA.a8.ema === null, 'ⓖ [자명 통과 금지] A 적용 줄을 뺀 v1 사본 — 켬에서도 키가 없다 ⇒ ⓑ 가 빨개진다', BA && BA.a8 ? JSON.stringify(BA.a8.ema) : (BA && BA.err));
let BB = null; try { BB = child({ T683_EMA_INIT: '1', T683_EXPORT_FLOW: '1' }, [V2_PATH, B_LINE, '']); } catch (e) { BB = { err: String(e.message).slice(0, 160) }; }
const eBait = BB && BB.world ? e2e(BB.world, flowSlot) : null;
ok(!!BB && BB.B === true && BB.slot && BB.slot.w5 === 12 && eBait && eBait.good < eBait.n, 'ⓖ [자명 통과 금지] B 판정 줄을 뺀 v2 사본 — 켬에서도 subs×30 · 끝에서 끝 식이 어긋난다 ⇒ ⓒ · ⓓ 가 빨개진다',
  BB && BB.slot ? `자리 ${BB.slot.w5} · 식 맞음 ${eBait.good}/${eBait.n}` : (BB && BB.err));

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
