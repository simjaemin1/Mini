#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1074-food-debt.js — 굶주림 = 사람마다 식량 빚 · 적응 · 14일 [T1074 · ★재민 11-02] ===
//   잰다: ① 부분 식사는 부분만 빚 ② 남은 식량만 빚을 갚는다(열량 1:1) ③ 적응은 빚 있는 동안 내려가고(최대 −40%) 빚 0 이면 돌아온다
//         ④ 죽음 = 빚 > 14 이고 그날도 적자인 사람 가운데 가장 늙은 1명 · 제 몫을 다 먹은 날엔 안 죽는다 · 징발 중은 안 죽는다
//         ⑤ 원정 중 제 짐을 먹는 병사는 마을 식사 명부에서 빠진다 ⑥ 끔 = 칸이 안 선다(손잡이 기본 끔)
//         ⑦ econ 하루를 실제로 돌린 판 — 곳간 0 마을은 빚이 쌓이고 14일 넘긴 날부터 하루 1명 · 옛 굶주림 두 줄은 0
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? `  ${x}` : '')); };

if (process.env.T1074_CHILD) {
  const E = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
  const H = E.__t1074, out = {};
  const mk = (age, extra) => Object.assign({ age, currentJob: 'farmer' }, extra || {});
  // ① 반만 먹은 날
  { const ps = [mk(30), mk(40)]; const nd = H._fdNeed(ps); const r = H._fdSettle(ps, nd.need, nd.debt, nd.need / 2);
    out.half = { d0: ps[0]._fd, d1: ps[1]._fd, s: ps[0]._fdS, short: r.shortTotal, a: ps[0]._fdA }; }
  // ② 빚 3 · 하루 몫 + 2 를 먹은 날 → 빚 1
  { const ps = [mk(30, { _fd: 3, _fdA: 0.1 })]; const nd = H._fdNeed(ps); const r = H._fdSettle(ps, nd.need, nd.debt, nd.need + 2);
    out.pay = { need: nd.need, d: ps[0]._fd, paid: r.paid, s: ps[0]._fdS }; }
  // ③ 적응 — 빚 있는 날 168 번 → 0.40 · 그 뒤 빚 0 인 날 140 번 → 0
  { const p = mk(30); let mn = 1; for (let i = 0; i < 200; i++) { H._fdSettle([p], 1 * (1 - (p._fdA || 0)), p._fd || 0, 0); mn = Math.min(mn, 1 - p._fdA); }
    const a200 = p._fdA; p._fd = 0; const a1 = (() => { H._fdSettle([p], 1 - p._fdA, 0, 1 - p._fdA); return p._fdA; })();
    for (let i = 0; i < 200; i++) H._fdSettle([p], 1 - p._fdA, 0, 1 - p._fdA);
    out.adapt = { a200, a1, back: p._fdA, mn }; }
  // ④ 죽음
  { const v = { npcs: [mk(60, { _fd: 15, _fdS: 0.5 }), mk(70, { _fd: 15, _fdS: 0 }), mk(80, { _fd: 13, _fdS: 1 }), mk(90, { _fd: 20, _fdS: 1, _warDraft: 1 }), mk(50, { _fd: 16, _fdS: 0.1 })] };
    out.death = H._fdDeathIdx(v); }
  // ⑤ 징발 짐 병사
  { const v = { npcs: [mk(30), mk(31, { _warDraft: 2, _warPack: 1 }), mk(32, { _warDraft: 2 })] }; out.eaters = H._fdEaters(v).length; }
  out.knob = E.T1074_FOOD_DEBT; out.fd = typeof E.foodDebtOf === 'function' ? E.foodDebtOf({ npcs: [mk(1, { _fd: 2 }), mk(2, { _fd: 16 })] }) : null;
  out.consts = { max: H.FD_ADAPT_MAX, down: H.FD_ADAPT_DOWN_DAYS, up: H.FD_ADAPT_UP_DAYS, die: H.FD_DEATH_DAYS };
  // ⑦ econ 하루를 실제로 — 곳간을 비운 마을 하나(켬 판에서만 의미)
  try {
    const v = E.createVillage({ name: '빚마을', initialPop: 20, fertility: 0.0, arable: 0, game: 0, wood: 0.5, stone: 0.3, ore: 0 });
    v.founder = 'p1';   // 사람 마을 — 보호막 없음
    const zero = () => { for (const k of Object.keys(v.storage)) { const before = v.storage[k]; v.storage[k] = 0; if (E.totalFoodEquivalent(v) === E.totalFoodEquivalent(Object.assign({}, v, { storage: Object.assign({}, v.storage, { [k]: before }) }))) v.storage[k] = before; } };
    const days = []; let firstDeath = null;
    for (let d = 400; d < 430; d++) {
      zero();
      const n0 = v.npcs.length, dt0 = v._fdDeadTot || 0;
      E.tickVillage(v, d);
      const fd = E.foodDebtOf(v);
      days.push([d, n0, v.npcs.length, +(fd.max).toFixed(2), (v._fdDeadTot || 0) - dt0, v._dpDebug ? v._dpDebug.hunger : null]);
      if (firstDeath == null && (v._fdDeadTot || 0) > dt0) firstDeath = d - 400;
    }
    out.live = { days, firstDeath };
  } catch (e) { out.liveErr = String(e && e.stack || e).slice(0, 300); }
  console.log(JSON.stringify(out));
  process.exit(0);
}

const run = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1074_CHILD: '1' }, env), encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop());
console.log('\n=== T1074 식량 빚 하네스 ===\n');
const on = run({ T1074_FOOD_DEBT: '1' }), off = run({ T1074_FOOD_DEBT: '' });
ok(on.knob === true && off.knob === false, '⑥ 손잡이 — `T1074_FOOD_DEBT=1` 만 켬 · 기본 끔');
ok(on.consts.max === 0.4 && on.consts.down === 168 && on.consts.up === 140 && on.consts.die === 14, '수 넷 — 적응 −40% · 168일(24주) · 140일(R20) · 14일', JSON.stringify(on.consts));
ok(Math.abs(on.half.d0 - 0.5) < 1e-9 && Math.abs(on.half.d1 - 0.5) < 1e-9 && Math.abs(on.half.short - 1) < 1e-9, '★① 반만 먹은 날 — 사람마다 반 끼 빚(부분 식사는 부분만)', JSON.stringify(on.half));
ok(on.half.a > 0, '① 빚이 생긴 날 적응이 한 걸음 내려간다', on.half.a);
ok(Math.abs(on.pay.need - 0.9) < 1e-9 && Math.abs(on.pay.d - 1) < 1e-9 && Math.abs(on.pay.paid - 2) < 1e-9 && on.pay.s === 0, '★② 하루 몫(적응만큼 덜 · 0.9)을 다 먹고 남은 2 만 빚을 갚는다(3 → 1 · 열량 1:1)', JSON.stringify(on.pay));
ok(Math.abs(on.adapt.a200 - 0.4) < 1e-9 && Math.abs(on.adapt.mn - 0.6) < 1e-9, '★③ 빚 있는 날이 이어지면 적응은 −40% 에서 멈춘다(그 아래로 안 간다)', JSON.stringify(on.adapt));
ok(on.adapt.a1 < on.adapt.a200 && on.adapt.back === 0, '★③ 빚이 0 이면 적응이 천천히 돌아와 0 이 된다', JSON.stringify(on.adapt));
ok(on.death === 0, '★④ 죽음 — 빚 > 14 이고 그날도 적자인 사람 가운데 가장 늙은 1명(60 · 50 살 가운데 60) · 그날 다 먹은 70 살 · 빚 13 인 80 살 · 징발 중 90 살은 아니다',
  on.death === 0 ? '' : `고른 자리 ${on.death}`);
ok(on.eaters === 2, '⑤ 원정 중 제 짐을 먹는 병사는 마을 식사 명부에서 빠진다(방어 소집은 마을을 먹는다)', on.eaters);
ok(on.fd && on.fd.max === 16 && on.fd.starving === 1 && on.fd.mean === 9, '읽는 함수 하나 `foodDebtOf` — 평균 · 최대 · 빚 > 14 수', JSON.stringify(on.fd));
if (on.liveErr) ok(false, '⑦ econ 하루 판이 섰다', on.liveErr);
else {
  const L = on.live, O = off.live || { days: [] };
  ok(L.days.some((x) => x[3] > 0), '⑦ 곳간 0 마을 — 빚이 쌓인다', JSON.stringify(L.days.slice(0, 3)));
  ok(L.firstDeath != null && L.firstDeath >= 14, '★⑦ 첫 빚 죽음은 14일을 넘긴 뒤다(곳간이 빈 첫날부터 죽지 않는다)', `첫 빚 죽음 ${L.firstDeath}일째`);
  ok(L.days.every((x) => x[4] <= 1), '★⑦ 빚 죽음은 하루 1명을 넘지 않는다', JSON.stringify(L.days.map((x) => x[4])));
  ok(L.days.every((x) => !x[5]), '★⑦ 켬 = 옛 굶주림 두 줄(`_dpDebug.hunger`)은 0', JSON.stringify(L.days.map((x) => x[5]).slice(0, 5)));
  ok(O.days.some((x) => x[5] < 0), '⑦ 대조 — 끔이면 같은 마을에 옛 굶주림 줄이 선다(위가 자명 통과가 아니다)', JSON.stringify(O.days.map((x) => x[5]).slice(0, 5)));
  ok(O.days.every((x) => x[3] === 0), '⑥ 끔 = 빚 칸이 안 선다', JSON.stringify(O.days.map((x) => x[3]).slice(0, 5)));
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
