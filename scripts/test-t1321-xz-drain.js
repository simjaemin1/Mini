#!/usr/bin/env node
// @regress
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1321-xz-drain.js — 끈 판의 안전망(T1321 ④ · T1292 회부 6 · econ `_t1321Hold`) =====================
//
// ★무엇: 팔(`T525_CROSS_ZONE`)을 켰다 끈 판 · 또는 다시 뜬 직후 걸음표가 아직인 판에서 메타가 되돌린 **이웃 존 캐러밴**(`_xzHome`)이
//   돌아갈 날(`_xzBack.day`) · 도착 날에 닿으면 — 종전: `_xzHandBack` 이 `world.xzone.zone` 을 읽다 TypeError(그날 캐러밴 고리가 통째로 멈춘다).
//   손잡이 `T1321_XZ_DRAIN=1` 이면 econ 이 그 캐러밴을 경계에 선 채 하루씩 미룬다(예외 0 · 'return' 기록 0 · 짐 그대로) · 팔 · 호스트가 다시 서면 그날부터 종전 그대로.
//   econ 정본 함수(`_caravanStepV2`)를 그대로 부른다(적재 때 내보내기 한 줄만 덧댄다 — 사본 0). 손잡이는 적재 때 읽혀 판마다 아이 프로세스로 가른다.
//   ① 켬 — 돌아갈 날 이웃 존 캐러밴: 예외 0 · 미룸(끝나지 않음 · 기록 0) · 이튿날도 · 호스트를 꽂으면 'return' 하나 · 끝
//   ② 켬 — 도착 날 이웃 존 캐러밴(outbound): 예외 0 · 미룸
//   ③ 끔(증인) — 같은 판이 TypeError(종전 결함이 아직 있다 — 안전망이 자명하지 않다)
//   ④ 켬 + 팔 켬 + 호스트 있음 — 종전 그대로('return' 하나 · 미룸 0)
//   ★미끼 [T1356] — econ 사본 한 곳: 돌아갈 날 자리(`_xzHandBack` 앞)의 안전망 부름 `!_t1321Hold(world, c)` 를 뺀다 → 켬 판 ① 이 빨강(TypeError).
//   ★[T1376] 이 판은 비우기 손잡이 하나를 잰다 — 같은 술어에 드는 `T1352_XZ_HOLD`(T1376 켬 기본) · 장 미룸 `T1030_XZ_MARKET` 은 아이 env 에서 `'0'`(끔)으로 떼어 둔다
//     (안 떼면 ③ · ④3 증인 — 안전망이 다 꺼진 판의 종전 TypeError — 이 켬 기본 미룸에 가려진다).
// 실행: node scripts/test-t1321-xz-drain.js
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.argv[2] === '--child') {
  const Module = require('module');
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('sim', 'economy-sim-v2.js'))) {
      if (process.env.__T1321_BAIT === '1') {   // ★미끼 [T1356] — 돌아갈 날 자리의 안전망 부름 한 곳만 뺀다(바꾼 자리 수를 적는다)
        const FROM = '!_t1030Hold(world, c) && !_t1321Hold(world, c)) _xzHandBack', TO = '!_t1030Hold(world, c)) _xzHandBack';
        process.env.__T1321_BAIT_N = String(content.split(FROM).length - 1); content = content.replace(FROM, TO);
      }
      content += '\n;module.exports.__t1321 = { step: _caravanStepV2, on: _xzOn };\n';
    }
    return _c.call(this, content, filename);
  };
  const E = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const mk = (kind) => {
    const v = { name: '아랫골', npcs: [{ id: 1 }], storage: {}, tradeStats: {} };
    const stub = E.xzoneStub ? E.xzoneStub({ name: '닛폰마을', pop: 10, prices: {}, storage: {} }, 'nippon', { _xzDay: 9 }) : { name: '닛폰마을', _xz: true, zone: 'nippon' };
    const c = kind === 'in'
      ? { id: 'xz:nippon:5', from: stub, to: v, state: 'inbound', _xzHome: { zone: 'nippon', id: 5 }, _xzBack: { day: 9, leg: 0, remain: 2, ptLocal: { x: 1, y: 1 }, ptPeer: { x: 2, y: 2 } },
        _returningRes: 'rice', _returningAmt: 3, giveRes: 'salt', giveAmt: 2, distance: 900, escort: 1 }
      : { id: 'xz:nippon:6', from: stub, to: v, state: 'outbound', _xzHome: { zone: 'nippon', id: 6 }, arriveDay: 9, returnArriveDay: 12, giveRes: 'salt', giveAmt: 2, distance: 900, escort: 1, travelDays: 2 };
    const w = { day: 10, villages: [v], caravans: [c], tradeLog: [] };
    return { w, c };
  };
  const out = {};
  const T = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = { err: String(e && e.message || e) }; } };
  T('in', () => {
    const { w, c } = mk('in');
    E.__t1321.step(w, c, 10); const a = { done: !!c._done, state: c.state };
    E.__t1321.step(w, c, 11); const b = { done: !!c._done, state: c.state };
    const X = { zone: 'hanbando', out: [], inbox: [], stubs: [], dist: () => 900, split: () => null };
    w.xzone = X;
    E.__t1321.step(w, c, 12);
    return { a, b, after: { done: !!c._done, handed: !!c._xzHandedBack, out: X.out.map((r) => ({ kind: r.kind, id: r.id, toZone: r.toZone, res: r.returningRes, amt: r.returningAmt })) }, xzOn: E.__t1321.on(w) };
  });
  T('out', () => {
    const { w, c } = mk('out');
    E.__t1321.step(w, c, 10);
    return { done: !!c._done, state: c.state, trades: w.tradeLog.length };
  });
  if (process.env.__T1321_BAIT_N != null) out.baitN = +process.env.__T1321_BAIT_N;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const child = (env) => {
  const r = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: Object.assign({}, process.env, { T525_CROSS_ZONE: '', T1321_XZ_DRAIN: '', T1030_XZ_MARKET: '0', T1352_XZ_HOLD: '0' }, env), encoding: 'utf8', maxBuffer: 1 << 26 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { err: (r.stderr || '').slice(-400) }; }
};
console.log('\n=== 끈 판의 안전망 — econ `_t1321Hold` (T1321 ④) ===');
// ① ② 켬 · 팔 끈 판(메타가 이웃 존 캐러밴을 되돌린 채 팔을 껐다)
{
  const R = child({ T1321_XZ_DRAIN: '1' });
  const I = R.in || {};
  ok(!I.err && I.a && I.a.done === false && I.b && I.b.done === false, '① 켬 · 팔 끔 — 돌아갈 날 이웃 존 캐러밴: 예외 0 · 미룸(이틀 · 끝나지 않음 · 짐 그대로)', JSON.stringify(I).slice(0, 200));
  ok(!I.err && I.after && I.after.done === false && I.after.out.length === 0, '①2 켬 · 팔 끔 — 호스트를 꽂아도 팔이 꺼져 있으면 그대로 미룸(econ 은 팔을 본다)', JSON.stringify(I.after));
  const O = R.out || {};
  ok(!O.err && O.done === false && O.state === 'outbound' && O.trades === 0, '② 켬 · 팔 끔 — 도착 날 이웃 존 캐러밴: 예외 0 · 미룸(도착 안 함)', JSON.stringify(O));
}
// ③ 끔(증인) — 종전 결함
{
  const R = child({});
  ok(R.in && R.in.err && /zone/.test(R.in.err), "③ 끔(증인) — 같은 판이 종전대로 TypeError(`world.xzone.zone`) — 안전망이 자명하지 않다", JSON.stringify(R.in).slice(0, 160));
}
// ④ 켬 + 팔 켬 — 호스트가 서기 전엔 미룸 · 서면 종전 그대로('return' 하나)
{
  const R = child({ T1321_XZ_DRAIN: '1', T525_CROSS_ZONE: '1' });
  const I = R.in || {};
  ok(!I.err && I.a.done === false && I.b.done === false, '④ 켬 + 팔 켬 · 호스트 전(걸음표 아직 — 다시 뜬 직후) — 예외 0 · 미룸', JSON.stringify({ a: I.a, b: I.b }));
  ok(!I.err && I.after && I.after.done === true && I.after.handed === true && I.after.out.length === 1 && I.after.out[0].kind === 'return' && I.after.out[0].id === 5 && I.after.out[0].amt === 3,
    "④2 켬 + 팔 켬 · 호스트가 서면 그날부터 종전 그대로 — 'return' 하나(돌려보낸 짐 그대로 · 생성 0 · 소멸 0)", JSON.stringify(I.after));
  const R0 = child({ T525_CROSS_ZONE: '1' });
  ok(R0.in && R0.in.err && /zone/.test(R0.in.err), '④3 끔 + 팔 켬 · 호스트 전(증인) — 종전 TypeError(다시 뜬 직후 창에도 결함이 있었다)', JSON.stringify(R0.in).slice(0, 160));
}
// ★미끼 [T1356] — 안전망 부름 한 곳을 뺀 econ 사본으로 ① 켬 판을 다시 — 돌아갈 날 이웃 존 캐러밴이 종전 TypeError 로 돌아온다(① 빨강)
{
  const R = child({ T1321_XZ_DRAIN: '1', __T1321_BAIT: '1' });
  const I = R.in || {};
  ok(R.baitN === 1 && !!I.err && /zone/.test(I.err) && !(R.out || {}).err, '미끼 — 돌아갈 날 안전망 부름을 뺀 econ 사본 → ① 켬 판이 빨강(TypeError · ② 도착 날은 그대로 미룸)', `바꾼 자리 ${R.baitN} · ① ${JSON.stringify(I).slice(0, 120)}`);
}
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
