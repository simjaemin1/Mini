#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1346-birth-flow.js — T1346 출생 문이 겨울 끝과 흐름을 본다(`T1346_BIRTH_FLOW` · T1297 켬 안 · 끔 기본 · 묶음 밖 — 아홉째 갈래는 회부) ===
//   T1342 두 해 판의 2년째 굶어 죽음은 첫 겨울 끝 꼬리(2년 3 ~ 5월)였다 — 가을에 곳간 30일치 문만 보고 사람을 늘린 마을이 겨울 끝에 바닥났다(보고 T1346 §1).
//   켬 — ⓐ 가을 출생 문 = 다가오는 겨울 끝(다음 3월 1일)까지 남은 날(T1319 `'1'` 의 출생 몫 · 이주 문은 묶음 `mig` 그대로)
//        ⓑ 흐름 문 = 흐름 장부(`surplusEMA.food`) + 들여온 식량(`_importEMA`) < 한 사람 하루치면 그날 늘림 0(표지 `_t1346Gate`).
//   ① 손잡이 — 빈 값 = 끔 · `'1'` + T1297 = 켬 · T1297 없이 `'1'` = 끔(출생 문 안 갈래)
//   ② 날 수(달력 정본 `server/calendar` 에서 따로 셈 — econ 셈을 베끼지 않는다) — 켬: 가을 한가운데 = 다음 3월 1일까지 · 겨울 = 다음 3월 1일까지 · 봄 = 30 ·
//      이주 문 날 수(`t1319MigNeedDays`)는 이 손잡이로 안 바뀐다 · 끔: 가을 = 30(종전)
//   ③ 흐름 셈 — 장부 + 들여옴 < 하루치 = 모자람 · 같으면 안 모자람 · 들여옴이 장부 적자를 채우면 안 모자람 · 장부 없는 마을 = 안 모자람
//   ④ econ 하루(정본 `tickVillage` · 곳간 400일치 · 침상 넉넉 · 봄) — 켬 + 흐름 적자 → 그날 늘림 0 · 표지 1 / 켬 + 흐름 넉넉 → 늘림 > 0 · 표지 0 /
//      끔 + 흐름 적자 → 늘림 > 0(종전 · 표지 칸 없음) — 셋째가 앞 둘의 전제(곳간 · 침상 · 로지스틱이 늘림을 낸다)
//   ⑤ 묶음 밖 — 묶음 켬만으로는 이 손잡이가 안 채워진다(묶음 판 그대로 · 아홉째 갈래는 보고 T1346 회부 1 — 넣으면 묶음 1020 날 400 끔비 1.176 → 0.929) ·
//      묶음 켬 + 낱 `'1'` = 켬(이 카드 판 조건 — 묶음이 T1297 을 채워 손잡이가 선다)
//   ★미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ 흐름 문 줄을 뺀 econ 사본(`tickVillage` 안 그 한 줄) → ④ 첫 줄("켬 + 흐름 적자 → 그날 늘림 0")이 빨강
//     ⓑ 들여온 식량을 안 보는 `t1346FlowShort` 사본 → ③ "들여옴이 장부 적자를 채우면 안 모자람" 이 빨강
//   날짜 · 벽시계 0 — 날은 게임 달력(`dayOf`)으로만 고른다.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const GATE_LINE = '  if (T1346_BIRTH_FLOW) { v._t1346Gate = 0; if (dP > 0 && t1346FlowShort(v)) { dP = 0; v._t1346Gate = 1; } }';

// ── 아이 — 손잡이 env 는 어버이가 준다 · BAIT=gate 면 econ 원문에서 흐름 문 줄을 빼고 컴파일 ──
if (process.argv[2] === '--child') {
  const out = { bait: null };
  if (process.env.T1346_TEST_BAIT === 'gate') {
    const orig = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== F_E) return orig(m, filename);
      const src = fs.readFileSync(filename, 'utf8');
      const n = src.split(GATE_LINE).length - 1;
      out.bait = n;
      m._compile(n === 1 ? src.replace(GATE_LINE, '') : src, filename);
    };
  }
  const C = require(path.join(ROOT, 'server', 'calendar'));
  const E = require(F_E);
  out.on = E.T1346_BIRTH_FLOW;
  const dAut = C.dayOf(1, 10, 15), dWin = C.dayOf(2, 1, 20), dSpr = C.dayOf(1, 4, 10);
  out.need = { aut: E.t1297NeedDays(dAut), win: E.t1297NeedDays(dWin), spr: E.t1297NeedDays(dSpr), migAut: typeof E.t1319MigNeedDays === 'function' ? E.t1319MigNeedDays(dAut) : null };
  const tick = (sur, imp) => {
    E.setSeed(7);
    const v = E.createVillage({ name: '시험', initialPop: 20, fertility: 1, water: 0.3, game: 0.6, wood: 1, ore: 0.5, stone: 1, size: 200 });
    v.storage.food = 20 * 400;                 // 곳간 400일치 — 곳간 문(30일치 · 겨울 끝)은 늘 열린다
    v.housing = 1000;                           // 침상 문 열림
    v.surplusEMA.food = sur;
    v._importEMA = imp; v._lastImportSnapshot = v.tradeStats ? (v.tradeStats.foodImported || 0) : 0;   // 첫 틱이 들여옴 평균을 0 으로 되돌리지 않게
    E.tickVillage(v, dSpr);
    return { dP: v._dpDebug ? v._dpDebug.dP : null, gate: v._t1346Gate === undefined ? null : v._t1346Gate, sur: v.surplusEMA.food };
  };
  out.tick = { short: tick(-100, 0), rich: tick(100, 0) };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const child = (env) => {
  const e = Object.assign({}, process.env);
  for (const k of ['T1297_BIRTH_FOOD', 'T1346_BIRTH_FLOW', 'T1319_AUTUMN_LOOK', 'T1306_BIRTH_GRADE', 'T1334_BUNDLE', 'T1346_TEST_BAIT']) delete e[k];
  Object.assign(e, env);
  const r = spawnSync(process.execPath, [__filename, '--child'], { env: e, encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout); } catch (err) { return { err: (r.stderr || String(err)).slice(0, 300) }; }
};
const C = require(path.join(ROOT, 'server', 'calendar'));
const dAut = C.dayOf(1, 10, 15), dWin = C.dayOf(2, 1, 20);
const toMar1 = (d) => C.dayOf(C.dateOf(d).month >= 3 ? C.dateOf(d).year + 1 : C.dateOf(d).year, 3, 1) - d;   // 다음 3월 1일까지(달력 정본에서 따로)

const ON = child({ T1297_BIRTH_FOOD: '1', T1346_BIRTH_FLOW: '1' });
const OFF = child({ T1297_BIRTH_FOOD: '1' });
const NO97 = child({ T1346_BIRTH_FLOW: '1' });
const BAIT = child({ T1297_BIRTH_FOOD: '1', T1346_BIRTH_FLOW: '1', T1346_TEST_BAIT: 'gate' });

console.log('① 손잡이');
ok(ON.on === true, "켬 = T1297 '1' + T1346 '1'", ON.on);
ok(OFF.on === false, '끔 = 빈 값', OFF.on);
ok(NO97.on === false, "T1297 없이 '1' = 끔(출생 문 안 갈래)", NO97.on);

console.log('② 날 수(달력 정본 — 가을 10/15 · 겨울 1/20 · 봄 4/10)');
const need = ON.need || {}, needOff = OFF.need || {};
ok(need.aut === toMar1(dAut), '켬 · 가을 한가운데 = 다음 3월 1일까지 남은 날', { got: need.aut, want: toMar1(dAut) });
ok(need.win === Math.max(30, toMar1(dWin)), '켬 · 겨울 = 다음 3월 1일까지(30 밑이면 30 — 기근 문)', { got: need.win, want: Math.max(30, toMar1(dWin)) });
ok(need.spr === 30, '켬 · 봄 = 30(기근 문 그대로)', need.spr);
ok(needOff.aut === 30, '끔 · 가을 = 30(종전)', needOff.aut);
ok(need.migAut === needOff.migAut, '이주 문 날 수는 이 손잡이로 안 바뀐다(묶음 `mig` 가 정한다)', { on: need.migAut, off: needOff.migAut });

console.log('③ 흐름 셈(`t1346FlowShort` 정본 함수 그대로)');
process.env.T1297_BIRTH_FOOD = '1'; process.env.T1346_BIRTH_FLOW = '1';
const E = require(F_E);
const fs3 = typeof E.t1346FlowShort === 'function' ? E.t1346FlowShort : null;
const c = E.DAILY_FOOD_CONSUMPTION;
const FS = (f, sur, imp) => (f ? f({ surplusEMA: { food: sur }, _importEMA: imp }) : null);
ok(FS(fs3, 0.4 * c, 0.5 * c) === true, '장부 0.4 + 들여옴 0.5 < 하루치 = 모자람', FS(fs3, 0.4 * c, 0.5 * c));
ok(FS(fs3, 0.4 * c, 0.6 * c) === false, '장부 0.4 + 들여옴 0.6 = 하루치 = 안 모자람(경계)', FS(fs3, 0.4 * c, 0.6 * c));
const IMP_FILL = 'imp-fill';
const impFill = (f) => FS(f, -2 * c, 3.5 * c) === false;
ok(impFill(fs3), '들여옴이 장부 적자를 채우면 안 모자람(장부 −2 + 들여옴 3.5)', { id: IMP_FILL, got: FS(fs3, -2 * c, 3.5 * c) });
ok(FS(fs3, 0.99 * c, 0) === true && FS(fs3, 2 * c, 0) === false, '들여옴 0 — 장부 0.99 = 모자람 · 2 = 안 모자람', [FS(fs3, 0.99 * c, 0), FS(fs3, 2 * c, 0)]);
ok(fs3 ? fs3({}) === false : false, '장부 없는 마을 = 안 모자람(문 없음)', fs3 ? fs3({}) : null);

console.log('④ econ 하루(정본 `tickVillage` · 곳간 400일치 · 침상 넉넉 · 봄)');
const T = ON.tick || {}, To = OFF.tick || {};
const gateRed = (t) => !!(t && t.short && t.short.dP === 0 && t.short.gate === 1);
ok(gateRed(T), '켬 + 흐름 적자 → 그날 늘림 0 · 표지 1', T.short);
ok(!!(T.rich && T.rich.dP > 0 && T.rich.gate === 0), '켬 + 흐름 넉넉 → 늘림 > 0 · 표지 0', T.rich);
ok(!!(To.short && To.short.dP > 0 && To.short.gate === null), '끔 + 흐름 적자 → 늘림 > 0(종전 · 앞 둘의 전제)', To.short);

console.log('⑤ 묶음 밖(`server/t1334-bundle.js` 무변 — 아홉째 갈래는 회부)');
const B = require(path.join(ROOT, 'server', 't1334-bundle.js'));
const e1 = { T1334_BUNDLE: '1' }; const set1 = B.fill(e1);
ok(e1.T1346_BIRTH_FLOW === undefined && set1.indexOf('T1346_BIRTH_FLOW') < 0 && e1.T1297_BIRTH_FOOD === '1', '묶음 켬만 — 이 손잡이 안 채움(묶음 판 그대로) · T1297 은 채움', { flow: e1.T1346_BIRTH_FLOW, set: set1 });
const e2 = { T1334_BUNDLE: '1', T1346_BIRTH_FLOW: '1' }; B.fill(e2);
const BUN = child(e2);
ok(BUN.on === true, "묶음 켬 + 낱 '1' = 켬(이 카드 판 조건)", BUN.on);

console.log('★미끼 ⓐ — 흐름 문 줄을 뺀 econ 사본(tickVillage 안 한 줄)');
ok(BAIT.bait === 1, '바꾼 자리 정확히 1곳', BAIT.bait);
ok(BAIT.tick && !gateRed(BAIT.tick), "사본에선 ④ 첫 줄('켬 + 흐름 적자 → 그날 늘림 0')이 빨강", BAIT.tick && BAIT.tick.short);

console.log('★미끼 ⓑ — 들여온 식량을 안 보는 `t1346FlowShort` 사본');
const SRC = fs.readFileSync(F_E, 'utf8');
const j0 = SRC.indexOf('function t1346FlowShort('), j1 = SRC.indexOf('\n', j0);
const body = j0 >= 0 ? SRC.slice(j0, j1) : '';
const IMP_TERM = ' + (v._importEMA || 0)';
const nImp = body.split(IMP_TERM).length - 1;
ok(nImp === 1, '바꾼 자리 정확히 1곳(들여옴 항)', nImp);
let baitFn = null;
try { baitFn = new Function('DAILY_FOOD_CONSUMPTION', body.replace(IMP_TERM, '') + '\nreturn t1346FlowShort;')(c); } catch (err) { baitFn = null; }
ok(!!baitFn && !impFill(baitFn), "사본에선 ③ '들여옴이 장부 적자를 채우면 안 모자람' 이 빨강", baitFn ? FS(baitFn, -2 * c, 3.5 * c) : null);

console.log(`\n${fail ? '✗' : '✓'} test-t1346-birth-flow ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
