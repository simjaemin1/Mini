#!/usr/bin/env node
// @regress
// === scripts/test-t1352-xz-hold.js — 다시 뜬 존의 첫 하루 안전망(T1352 · T1324 회부 15 · econ `_t1321Hold` 를 비우기 명령과 떼어 낸 손잡이 `T1352_XZ_HOLD`) ==========
//
// ★무엇: 다시 뜬 존(팔 `T525_CROSS_ZONE` 켬)은 이웃 존 걸음표가 서기 전(`_xzOn` 거짓 — 이웃 명부가 와야 워커)에 첫 하루를 연다. 메타가 되돌린 **이웃 존 캐러밴**(`_xzHome`)의
//   돌아갈 날(`_xzBack.day`)이 그 하루면 종전: `_xzHandBack` 이 `world.xzone.zone` 을 읽다 TypeError — 서버에선 현지 자정 창(T731)이 안 닫혀 그 존 econ 이 멎는다
//   (e2e-xzone-caravan ⓗ4 · ⓗ5 — 가상 시계 판은 매번 · 실시간 판은 걸음표 · 첫 창 경주라 가끔). T1321 안전망(미룸)은 비우기 env(`T1321_XZ_DRAIN` — 새 넘김 0)와 한 글자라 평소 판엔 없다.
//   `T1352_XZ_HOLD=1` 은 미룸만 켠다 — 경계에 선 채 하루씩 · 걸음표(호스트)가 서면 그날부터 종전 그대로('return' 하나).
//   econ 정본 함수(`_caravanStepV2`)를 그대로 부른다(적재 때 내보내기 한 줄만 덧댄다 — 사본 0). 손잡이는 적재 때 읽혀 판마다 아이 프로세스로 가른다.
//   ① 켬 · 팔 켬 · 호스트 전 — 돌아갈 날 이웃 존 캐러밴: 예외 0 · 미룸(이틀) · 호스트를 꽂으면 'return' 하나(돌려보낸 짐 그대로) · 끝
//   ② 켬 · 팔 켬 · 호스트 전 — 도착 날 이웃 존 캐러밴(outbound): 예외 0 · 미룸(도착 안 함)
//   ③ 끔(증인) · 팔 켬 · 호스트 전 — 같은 판이 TypeError(종전 결함 — 안전망이 자명하지 않다)
//   ④ 켬 · 팔 켬 · 호스트 있음 — 미룸 0(그날 'return' 하나 — 끔과 같다)
//   ⑤ 켬은 비우기를 안 켠다 — econ 쪽 `T1321_XZ_DRAIN` 글자 그대로 끔(이 손잡이는 미룸 술어 하나에만 든다)
//   미끼(이 파일 안 · 소스 자리가 꼭 한 번인지 센다 · 빨강 줄 단언): ㉠ 술어에서 이 손잡이를 뺀 사본 → {①, ①2, ②} · ㉡ 손잡이 기본 켬 사본(끔 판에서) → {③}
// 실행: node scripts/test-t1352-xz-hold.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const EFILE = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const BAITS = {
  noHold: { red: ['①', '①2', '②'], at: ["function _t1321Hold(world, c) { return (T1321_XZ_DRAIN || T1352_XZ_HOLD) && !!(c && c._xzHome) && !_xzOn(world); }",
    "function _t1321Hold(world, c) { return T1321_XZ_DRAIN && !!(c && c._xzHome) && !_xzOn(world); }   // 미끼 ㉠"] },
  defOn: { red: ['③'], at: ["const T1352_XZ_HOLD = (typeof process !== 'undefined' && process.env && process.env.T1352_XZ_HOLD === '1');",
    "const T1352_XZ_HOLD = (typeof process !== 'undefined' && process.env && process.env.T1352_XZ_HOLD !== '0');   // 미끼 ㉡"] },
};

if (process.argv[2] === '--child') {
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === EFILE) {
      if (bait) { const n = content.split(bait.at[0]).length - 1; if (n !== 1) { process.stdout.write(JSON.stringify({ baitErr: `미끼 자리가 한 번이 아니다(${n}번)` })); process.exit(3); } content = content.replace(bait.at[0], bait.at[1]); }
      content += '\n;module.exports.__t1352h = { step: _caravanStepV2, on: _xzOn, drain: typeof T1321_XZ_DRAIN !== "undefined" ? T1321_XZ_DRAIN : null, hold: typeof T1352_XZ_HOLD !== "undefined" ? T1352_XZ_HOLD : null };\n';
    }
    return _c.call(this, content, filename);
  };
  const E = require(EFILE);
  const P = E.__t1352h || null;
  const mk = (kind) => {
    const v = { name: '아랫골', npcs: [{ id: 1 }], storage: {}, tradeStats: {} };
    const stub = E.xzoneStub({ name: '닛폰마을', n: 10, prices: {}, storage: {} }, 'nippon', { _xzDay: 9 });
    const c = kind === 'in'
      ? { id: 'xz:nippon:5', from: stub, to: v, state: 'inbound', _xzHome: { zone: 'nippon', id: 5 }, _xzBack: { day: 9, leg: 0, remain: 2, ptLocal: { x: 1, y: 1 }, ptPeer: { x: 2, y: 2 } },
        _returningRes: 'rice', _returningAmt: 3, giveRes: 'salt', giveAmt: 2, distance: 900, escort: 1 }
      : { id: 'xz:nippon:6', from: stub, to: v, state: 'outbound', _xzHome: { zone: 'nippon', id: 6 }, arriveDay: 9, returnArriveDay: 12, giveRes: 'salt', giveAmt: 2, distance: 900, escort: 1, travelDays: 2 };
    return { w: { day: 10, villages: [v], caravans: [c], tradeLog: [] }, c };
  };
  const host = () => ({ zone: 'hanbando', out: [], inbox: [], stubs: [], dist: () => 900, split: () => null });
  const out = { knob: P ? { drain: P.drain, hold: P.hold } : null };
  const T = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = { err: String(e && e.message || e) }; } };
  T('in', () => {
    const { w, c } = mk('in');
    P.step(w, c, 10); const a = { done: !!c._done, state: c.state };
    P.step(w, c, 11); const b = { done: !!c._done, state: c.state };
    const X = host(); w.xzone = X;
    P.step(w, c, 12);
    return { a, b, after: { done: !!c._done, handed: !!c._xzHandedBack, out: X.out.map((r) => ({ kind: r.kind, id: r.id, toZone: r.toZone, res: r.returningRes, amt: r.returningAmt })) } };
  });
  T('out', () => { const { w, c } = mk('out'); P.step(w, c, 10); return { done: !!c._done, state: c.state, trades: w.tradeLog.length }; });
  T('ready', () => { const { w, c } = mk('in'); const X = host(); w.xzone = X; P.step(w, c, 10); return { done: !!c._done, out: X.out.length }; });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const child = (env, bait) => {
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env: Object.assign({}, process.env, { T525_CROSS_ZONE: '', T1321_XZ_DRAIN: '', T1030_XZ_MARKET: '', T1352_XZ_HOLD: '' }, env), encoding: 'utf8', maxBuffer: 1 << 26 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { err: (r.stderr || '').slice(-400) }; }
};
//   줄마다 [이름, 참] — 미끼 판이 같은 줄을 다시 셈해 빨강 줄을 단언한다
function rows(bait) {
  const L = [];
  const On = child({ T525_CROSS_ZONE: '1', T1352_XZ_HOLD: '1' }, bait), I = On.in || {}, O = On.out || {}, R = On.ready || {};
  L.push(['①', !I.err && I.a && I.a.done === false && I.b && I.b.done === false, '① 켬 · 팔 켬 · 호스트 전(다시 뜬 직후 — 걸음표 아직) — 돌아갈 날 이웃 존 캐러밴: 예외 0 · 미룸(이틀 · 끝나지 않음 · 짐 그대로)', JSON.stringify({ a: I.a, b: I.b, err: I.err })]);
  L.push(['①2', !I.err && I.after && I.after.done === true && I.after.handed === true && I.after.out.length === 1 && I.after.out[0].kind === 'return' && I.after.out[0].id === 5 && I.after.out[0].amt === 3,
    "①2 켬 — 호스트(걸음표)가 서면 그날부터 종전 그대로: 'return' 하나(돌려보낸 짐 그대로 · 생성 0 · 소멸 0)", JSON.stringify(I.after)]);
  L.push(['②', !O.err && O.done === false && O.state === 'outbound' && O.trades === 0, '② 켬 · 팔 켬 · 호스트 전 — 도착 날 이웃 존 캐러밴: 예외 0 · 미룸(도착 안 함)', JSON.stringify(O)]);
  const Off = child({ T525_CROSS_ZONE: '1' }, bait);
  L.push(['③', !!(Off.in && Off.in.err && /zone/.test(Off.in.err)), '③ 끔(증인) · 팔 켬 · 호스트 전 — 같은 판이 종전대로 TypeError(`world.xzone.zone`) — 안전망이 자명하지 않다', JSON.stringify(Off.in).slice(0, 160)]);
  L.push(['④', !R.err && R.done === true && R.out === 1, "④ 켬 · 호스트 있음 — 미룸 0(그날 'return' 하나 · 끔과 같다)", JSON.stringify(R)]);
  L.push(['⑤', !!(On.knob && On.knob.hold === true && On.knob.drain === false), '⑤ 켬은 비우기를 안 켠다 — econ `T1321_XZ_DRAIN` 끔 그대로(미룸 술어 하나에만 든다)', JSON.stringify(On.knob)]);
  return L;
}
console.log('\n=== 다시 뜬 존의 첫 하루 안전망 — econ 미룸(`T1352_XZ_HOLD` · T1324 회부 15) ===');
for (const [, c, m, d] of rows()) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(EFILE, 'utf8');
for (const [name, B] of Object.entries(BAITS)) {
  const n = SRC.split(B.at[0]).length - 1;
  if (n !== 1) { ok(false, `미끼 ${name} — 소스 자리가 꼭 한 번(지금 ${n}번)`, B.at[0].slice(0, 60)); continue; }
  const red = rows(name).filter((r) => !r[1]).map((r) => r[0]).sort();
  ok(JSON.stringify(red) === JSON.stringify(B.red.slice().sort()), `미끼 ${name} — 빨강 줄이 꼭 {${B.red.join(', ')}}`, `빨강 {${red.join(', ')}}`);
}
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
