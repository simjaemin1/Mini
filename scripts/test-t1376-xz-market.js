#!/usr/bin/env node
// @regress
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1376-xz-market.js — 이웃 존 상인도 같은 장 갈래(T1376 · `T1030_XZ_MARKET` 팔 안 켬 기본 · 캐논 재민 09-29 "존 경계가 없는 것처럼") ==========
//
// ★왜: 같은 존 상인은 닿으면 그 마을 장에 들어(T707 · `_t707` 찍음 · `_mktD`) 다음 econ 머리에 정산하고, 몸은 그때까지 장 마당에 선다(T1182 — 가상 시계
//   두 존 판 보인 머묾 3,067ms). 이웃 존 상인은 T1030 끔이면 장 밖에서 닿은 자리에서 곧장 정산했고 몸은 종전 1게임시간(125ms) 머물렀다 — 그 머묾이
//   현지 자정 창(333ms) 안에서 다 지나 보인 머묾 0(e2e-xzone-caravan ⓖ0 · ⓘ0 스무 판 다 빨강 — T1352 §6). T1376 이 팔 안 켬 기본으로 바꿨다.
// 판(econ 정본 함수 그대로 — `_xzProbe.handOff/arrive/arriveLoop` · `settleMarketsV2` · `tickWorldV2` · 두 세계 · 호스트 문은 기록만 옮기는 배열 — `t1030-xz-market-probe` 꼴):
//   손잡이는 모듈을 읽을 때 정해지므로 env 꼴마다 아이 프로세스 하나(기본 = env 없음 · `=0` · 팔 끔).
//   ① 기본(env 없음) · 팔 켬 — 이웃 존 상인이 닿은 자리에서 장에 든다(`_t707` 찍음 · `_mktD` = 그날) · 'return' 은 아직 0 — 같은 세계 같은 존 상인과 같은 갈래
//   ② 기본 · 팔 켬 · 하루 틱 — 장 선 날 = 닿은 날 · 다음 날 머리 정산 · 'return' 하나(그날) · 돌려보낸 짐 = 행이 산 짐
//   ③ `=0`(증인 · 종전) — 닿은 날 곧장 'return' 하나 · 장 갈래 안 탐(되돌림 길이 산다)
//   ④ 팔 끔 — 손잡이 거짓(팔 끔 세계 = 이 손잡이 무동작 = 기준선 · 라이브 바이트 같음)
//   ⑤ 기본 손잡이 값 — 팔 켬 · env 없음 = 참
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 기본 끔(T1376 앞 글자) econ 사본 → {①, ②, ⑤} · ㉡ 팔과 떼어 낸 econ 사본(팔 끔에도 참) → {④}
// 실행: node scripts/test-t1376-xz-market.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const EFILE = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const KLINE = "const T1030_XZ_MARKET = T525_CROSS_ZONE && (typeof process !== 'undefined' && process.env && process.env.T1030_XZ_MARKET !== '0');";
const BAITS = {
  defOff: { red: ['①', '②', '⑤'], at: [KLINE, "const T1030_XZ_MARKET = T525_CROSS_ZONE && (typeof process !== 'undefined' && process.env && process.env.T1030_XZ_MARKET === '1');   // 미끼 ㉠"] },
  noArm: { red: ['④'], at: [KLINE, "const T1030_XZ_MARKET = (typeof process !== 'undefined' && process.env && process.env.T1030_XZ_MARKET !== '0');   // 미끼 ㉡"] },
};

if (process.argv[2] === '--child') {
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === EFILE) {
      if (bait) { const n = content.split(bait.at[0]).length - 1; if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); } content = content.replace(bait.at[0], bait.at[1]); }
      content += '\n;module.exports.__t1376m = { arrive: _caravanArrive };\n';   // 같은 존 도착 정본(내보내기만 · 사본 0)
    }
    return _c.call(this, content, filename);
  };
  const mute = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
  const V2 = mute(() => require(EFILE));
  const out = { on: V2.T1030_XZ_MARKET, arm: V2.T525_CROSS_ZONE != null ? V2.T525_CROSS_ZONE : null };
  if (process.env.T525_CROSS_ZONE !== '1') { process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0); }
  const mk = () => mute(() => {
    const WA = V2.createWorldV2({ seed: 7, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
    const WB = V2.createWorldV2({ seed: 11, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
    for (let d = 0; d < 20; d++) { V2.tickWorldV2(WA); V2.tickWorldV2(WB); }
    const plug = (z) => ({ zone: z, out: [], inbox: [], stubs: [], dist: () => 300 });
    WA.xzone = plug('A'); WB.xzone = plug('B');
    const vA = WA.villages[0], vB = WB.villages[0], day = WA.day;
    const c = { id: 9001, trader: null, from: vA, to: { name: vB.name, zone: 'B', _xz: true }, giveRes: 'food', giveAmt: 10, giveRes2: null, giveAmt2: 0,
      pFrom_at_depart: 1, pTo_at_depart: 2, returnRes: 'fish', distance: 300, travelDays: 3, escort: 0, arriveDay: day + 1, departDay: day - 2, state: 'outbound' };
    vA.storage.food -= 10; WA.caravans.push(c);
    V2._xzProbe.handOff(WA, c, day);
    const m = JSON.parse(JSON.stringify(WA.xzone.out.splice(0)[0]));
    return { WB, vB, m };
  });
  // ① 닿은 자리 — 이웃 존 상인 · 같은 세계 같은 존 상인(B 마을 1 → 0)
  {
    const { WB, m } = mk();
    V2._xzProbe.arrive(WB, JSON.parse(JSON.stringify(m)), WB.day);
    const cB = WB.caravans.find((x) => String(x.id).indexOf('xz:') === 0);
    mute(() => V2._xzProbe.arriveLoop(WB, cB, WB.day));
    out.xz = { out: WB.xzone.out.length, t707: !!cB._t707, mktD: cB._mktD == null ? null : cB._mktD, day: WB.day, state: cB.state };
    const v1 = WB.villages[1], v0 = WB.villages[0];
    const s = { id: 9100, trader: null, from: v1, to: v0, giveRes: 'food', giveAmt: 5, giveRes2: null, giveAmt2: 0, pFrom_at_depart: 1, pTo_at_depart: 2, returnRes: 'fish',
      distance: 300, travelDays: 1, escort: 0, arriveDay: WB.day, departDay: WB.day - 1, state: 'outbound' };
    WB.caravans.push(s);
    let err = null; try { mute(() => V2.__t1376m.arrive(WB, s, WB.day)); } catch (e) { err = String(e.message || e); }
    out.same = { t707: !!s._t707, mktD: s._mktD == null ? null : s._mktD, state: s.state, err };
  }
  // ② 하루 틱
  {
    const { WB, m, vB } = mk();
    WB.xzone.inbox.push(JSON.parse(JSON.stringify(m)));
    const log = []; let err = null;
    for (let i = 0; i < 6; i++) {
      try { mute(() => V2.tickWorldV2(WB)); } catch (e) { err = String(e && e.message || e); break; }
      const cB = WB.caravans.find((x) => String(x.id).indexOf('xz:') === 0) || null;
      log.push({ day: WB.day, has: !!cB, state: cB ? cB.state : null, mktD: cB && cB._mktD != null ? cB._mktD : null, recs: WB.xzone.out.splice(0).map((r) => ({ kind: r.kind, rowDay: r.row ? r.row.day : null, bought: r.row && r.row.bought ? r.row.bought.amt : null, ret: r.returningAmt, res: r.returningRes })) });
    }
    const a = log.find((L) => !(L.has && L.state === 'outbound'));
    const recs = [].concat(...log.map((L) => L.recs.map((r) => Object.assign({ day: L.day }, r))));
    out.tick = { err, arrive: a ? a.day : null, mktD: a ? a.mktD : null, n: recs.length, r: recs[0] || null };
  }
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const child = (env, bait) => {
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env: Object.assign({}, process.env, { T525_CROSS_ZONE: '', T1030_XZ_MARKET: '', T707_MARKET: '' }, env), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-300)}` }; }
};
function rows(bait) {
  const D = child({ T525_CROSS_ZONE: '1' }, bait), O = child({ T525_CROSS_ZONE: '1', T1030_XZ_MARKET: '0' }, bait), A = child({}, bait), L = [];
  const X = D.xz || {}, S = D.same || {}, T = D.tick || {}, OT = O.tick || {};
  L.push(['①', !D.err && X.out === 0 && X.t707 === true && X.mktD === X.day && S.t707 === true && S.mktD != null,
    '① 기본(env 없음) · 팔 켬 — 이웃 존 상인이 닿은 자리에서 장에 든다(`_t707` · `_mktD` = 그날 · \'return\' 0) — 같은 세계 같은 존 상인과 같은 갈래', `이웃 존 ${JSON.stringify(X)} · 같은 존 ${JSON.stringify(S)}`]);
  L.push(['②', !T.err && T.n === 1 && T.mktD === T.arrive && T.r && T.r.kind === 'return' && T.r.day === T.arrive + 1 && T.r.rowDay === T.arrive + 1 && Math.abs((T.r.bought || 0) - (T.r.ret || 0)) < 0.005,
    "② 기본 · 하루 틱 — 장 선 날 = 닿은 날 · 다음 날 머리 정산(행의 날) · 그날 'return' 하나 · 돌려보낸 짐 = 행이 산 짐", JSON.stringify(T)]);
  L.push(['③', !OT.err && O.on === false && OT.n === 1 && OT.mktD == null && OT.r && OT.r.day === OT.arrive && OT.r.rowDay === OT.arrive,
    "③ `=0`(증인 · 종전) — 닿은 날 곧장 'return' 하나 · 장 갈래 안 탐(되돌림 길이 산다)", JSON.stringify(OT)]);
  L.push(['④', !A.err && A.on === false, '④ 팔 끔 — 손잡이 거짓(팔 끔 세계 = 이 손잡이 무동작 = 기준선 · 라이브 바이트 같음)', JSON.stringify(A)]);
  L.push(['⑤', !D.err && D.on === true, '⑤ 기본 손잡이 값 — 팔 켬 · env 없음 = 참(T1376 켬 기본)', JSON.stringify({ on: D.on })]);
  return L;
}
console.log('\n=== 이웃 존 상인도 같은 장 갈래 — `T1030_XZ_MARKET` 팔 안 켬 기본(T1376) ===');
for (const [, c, m, d] of rows()) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(EFILE, 'utf8');
const BR = {};
for (const [name, B] of Object.entries(BAITS)) {
  const n = SRC.split(B.at[0]).length - 1;
  const red = n === 1 ? rows(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(B.red.slice().sort()) };
}
ok(BR.defOff.n === 1 && BR.defOff.same, '미끼 ㉠ — 손잡이 기본 끔(T1376 앞 글자) econ 사본 → 빨강 줄이 꼭 {①, ②, ⑤}', `바꾼 자리 ${BR.defOff.n} · 빨강 {${(BR.defOff.red || []).join(', ')}}`);
ok(BR.noArm.n === 1 && BR.noArm.same, '미끼 ㉡ — 팔과 떼어 낸 econ 사본(팔 끔에도 참) → 빨강 줄이 꼭 {④}', `바꾼 자리 ${BR.noArm.n} · 빨강 {${(BR.noArm.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
