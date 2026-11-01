#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1030 · 서버 포트 0 · 몇 초)
// === scripts/t1030-xz-market-probe.js — 교차 존 캐러밴도 장을 연다: econ 판 탐침 (손잡이 T1030_XZ_MARKET · 끔 기본) ===
//
// ★왜 [T1030 · T952 회부 2 ㄱ] 받는 존 econ 은 교차 존 도착 순간 정산해 그 자리에서 'return'(교역 행 · 돌려보낼 짐 · 짐 레코드)을 적었다.
//   켬이면 그 도착도 T707 장 갈래(값만 찍고 정산은 다음 econ 틱 머리)를 타고 'return' 은 정산 뒤에 적는다. 이 탐침은 **econ 정본 함수 그대로**
//   (두 세계 · 호스트 문은 기록만 옮기는 배열 — test-moment-lot ⑨⑦ 꼴) 그 차례를 잰다. 끔 · 켬은 아이 판 둘(손잡이는 모듈을 읽을 때 정해진다).
//
//  ① 같은 계약 — 시간이 안 흐르면(도착 뒤 곧장 정산) 켬 'return' 기록 = 끔 'return' 기록(글자 그대로 · 교역 행 포함)
//  ② 차례 — 실제 하루 틱(`tickWorldV2`)으로: 도착 날 · 장이 선 날 · 정산 날 · 'return' 날 · 행의 날 · 'return' 하나 · 돌려보낸 짐 = 행이 산 짐
//  ③ 다시 뜸 — 도착 뒤 그 캐러밴을 서버 T728 메타 꼴(마을 = 이름 · 스텁 = 스텁째)로 JSON 왕복해 갈아 끼워도 'return' 이 ②와 글자 그대로
//  ④ 호스트 전 — 도착 뒤 `world.xzone` 을 이틀 뽑아도(다시 뜬 존이 걸음표 전) 예외 0 · 'return' 0 · 다시 꽂으면 하나 · 값은 ②와 같다
//
// 실행: node scripts/t1030-xz-market-probe.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T1030_SUB === '1') {
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const mk = () => {
    const WA = V2.createWorldV2({ seed: 7, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
    const WB = V2.createWorldV2({ seed: 11, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
    for (let d = 0; d < 20; d++) { V2.tickWorldV2(WA); V2.tickWorldV2(WB); }
    const plug = (z) => ({ zone: z, out: [], inbox: [], stubs: [], dist: () => 300 });   // 호스트가 꽂는 문(기록 배열 · 걸음 하나)
    WA.xzone = plug('A'); WB.xzone = plug('B');
    const vA = WA.villages[0], vB = WB.villages[0];
    const day = WA.day;
    const c = { id: 9001, trader: null, from: vA, to: { name: vB.name, zone: 'B', _xz: true }, giveRes: 'food', giveAmt: 10, giveRes2: null, giveAmt2: 0,
      pFrom_at_depart: 1, pTo_at_depart: 2, returnRes: 'fish', distance: 300, travelDays: 3, escort: 0, arriveDay: day + 1, departDay: day - 2, state: 'outbound' };
    vA.storage.food -= 10;
    WA.caravans.push(c);
    V2._xzProbe.handOff(WA, c, day);
    const m = JSON.parse(JSON.stringify(WA.xzone.out.splice(0)[0]));
    return { WA, WB, vA, vB, c, m };
  };
  const strip = (r) => r ? JSON.stringify(r) : null;
  const out = { on: V2.T1030_XZ_MARKET, t707: V2.T707_MARKET };
  // ① 같은 계약 — 시간 0
  {
    const { WB, m } = mk();
    V2._xzProbe.arrive(WB, JSON.parse(JSON.stringify(m)), WB.day);
    const cB = WB.caravans.find((x) => String(x.id).indexOf('xz:') === 0);
    V2._xzProbe.arriveLoop(WB, cB, WB.day);
    const at = { out: WB.xzone.out.length, t707: !!cB._t707, mktD: cB._mktD == null ? null : cB._mktD, state: cB.state };
    if (cB._t707) { V2.settleMarketsV2(WB); V2._xzProbe.handBack(WB, cB, WB.day, cB._xzRow || null, cB._xzBack.remain); }
    out.s1 = { at, rec: strip(WB.xzone.out[0] || null), n: WB.xzone.out.length };
  }
  // ② 차례 — 하루 틱으로 · ③ 다시 뜸(JSON 왕복) · ④ 호스트 전(이틀 뽑기)
  const run = (variant) => {
    const { WB, m, vB } = mk();
    WB.xzone.inbox.push(JSON.parse(JSON.stringify(m)));
    const log = [];
    let err = null, hidden = null;
    const g0 = vB.storage.food || 0;
    for (let i = 0; i < 8; i++) {
      if (variant === 'hold' && i === 1) { hidden = WB.xzone; WB.xzone = null; }
      if (variant === 'hold' && i === 3) { WB.xzone = hidden; }
      try { V2.tickWorldV2(WB); } catch (e) { err = String(e && e.message || e); break; }
      const cB = WB.caravans.find((x) => String(x.id).indexOf('xz:') === 0) || null;
      const recs = WB.xzone ? WB.xzone.out.splice(0) : [];
      log.push({ day: WB.day, has: !!cB, state: cB ? cB.state : null, t707: !!(cB && cB._t707), mktD: cB && cB._mktD != null ? cB._mktD : null,
        row: !!(cB && cB._xzRow), xback: cB && cB._xzBack ? cB._xzBack.day : null, recs: recs.map((r) => JSON.stringify(r)) });
      if (variant === 'restore' && i === 0 && cB) {   // 서버 T728 메타 꼴 — 마을 = 이름 · 스텁 = 스텁째(켬) · 상인 = 번호 → 되돌릴 때 이름으로 다시 잇는다
        const o = {};
        for (const k of Object.keys(cB)) { const x = cB[k]; if (k === 'from' || k === 'to') o[k] = x ? (x._xz ? Object.assign({}, x) : x.name) : null; else o[k] = x; }
        const J = JSON.parse(JSON.stringify(o));
        const byName = new Map(WB.villages.map((v) => [v.name, v]));
        J.from = (J.from && typeof J.from === 'object') ? J.from : byName.get(J.from); J.to = (J.to && typeof J.to === 'object') ? J.to : byName.get(J.to);
        WB.caravans[WB.caravans.indexOf(cB)] = J;
      }
    }
    const recs = [].concat(...log.map((L) => L.recs.map((r) => ({ day: L.day, r }))));
    return { log, err, recs, food: +((vB.storage.food || 0) - g0).toFixed(6) };
  };
  out.s2 = run('tick'); out.s3 = run('restore'); out.s4 = run('hold');
  console.log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (on) => {
  const env = Object.assign({}, process.env, { T1030_SUB: '1', T525_CROSS_ZONE: '1', T1030_XZ_MARKET: on ? '1' : '' });
  const s = execFileSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(s.trim().split('\n').pop());
};
console.log('\n=== T1030 교차 존 장 — econ 판 탐침(정본 함수 그대로 · 두 세계 · 기록 배열) ===');
const F = sub(false), N = sub(true);
ok(F.on === false && N.on === true && F.t707 && N.t707, '[전제] 아이 판 손잡이 — 끔 false · 켬 true · 장(T707) 켬 둘 다', `끔 ${F.on} · 켬 ${N.on}`);
console.log('\n① 같은 계약 — 시간 0(도착 뒤 곧장 정산)');
ok(F.s1.at.out === 1 && !F.s1.at.t707 && F.s1.at.mktD === null, '①0 끔 — 도착 자리에서 \'return\' 하나(장 갈래 안 탐 · `_mktD` 없음)', JSON.stringify(F.s1.at));
ok(N.s1.at.out === 0 && N.s1.at.t707 && N.s1.at.mktD != null && N.s1.at.state === 'inbound', '①1 켬 — 도착 자리에선 \'return\' 0 · 장이 선다(`_t707` 찍음 · `_mktD`)', JSON.stringify(N.s1.at));
ok(N.s1.n === 1 && N.s1.rec === F.s1.rec, '①2 ★켬 정산 뒤 \'return\' = 끔 \'return\'(글자 그대로 — 교역 행 · 돌려보낼 짐 · 남은 일수)', N.s1.rec === F.s1.rec ? `${N.s1.rec.length} 글자 같음` : `다름\n    끔 ${F.s1.rec}\n    켬 ${N.s1.rec}`);
console.log('\n② 차례 — 하루 틱(`tickWorldV2`)');
//   도착 날 = 그 캐러밴이 처음으로 '가는 길'이 아닌 날(끔은 그날 'return' 을 적고 목록에서 빠진다 — 없음도 도착 뒤다)
const desc = (S) => { const a = S.log.find((L) => !(L.has && L.state === 'outbound')); const r = S.recs[0]; const R = r ? JSON.parse(r.r) : null;
  return { arrive: a ? a.day : null, mktD: a ? a.mktD : null, ret: r ? r.day : null, rowDay: R && R.row ? R.row.day : null, n: S.recs.length,
    sold: R && R.row && R.row.sent ? R.row.sent.amt : null, bought: R && R.row && R.row.bought ? R.row.bought.amt : null, retAmt: R ? R.returningAmt : null, retRes: R ? R.returningRes : null, xback: a ? a.xback : null, err: S.err }; };
const f2 = desc(F.s2), n2 = desc(N.s2);
console.log('  | 판 | 도착 날 | 장 선 날 | 정산(행의 날) | \'return\' 날 | \'return\' 수 | 판 짐 | 산 짐 | 돌려보낸 짐 |');
console.log('  |---|---|---|---|---|---|---|---|---|');
for (const [t, d] of [['끔', f2], ['켬', n2]]) console.log(`  | ${t} | ${d.arrive} | ${d.mktD == null ? '-' : d.mktD} | ${d.rowDay} | ${d.ret} | ${d.n} | ${d.sold} | ${d.bought} | ${d.retRes}×${d.retAmt} |`);
ok(!f2.err && f2.n === 1 && f2.ret === f2.arrive && f2.rowDay === f2.arrive, '②0 끔 — 도착 날 \'return\' 하나 · 행의 날 = 도착 날(종전)', JSON.stringify(f2));
ok(!n2.err && n2.n === 1 && n2.mktD === n2.arrive && n2.ret === n2.arrive + 1 && n2.rowDay === n2.arrive + 1,
  '②1 ★켬 — 도착 날 장이 서고 \'return\' 0 · 다음 날 머리 정산(행 · 그 날) · 같은 날 \'return\' 하나(경계에 붙은 마을 leg 0)', JSON.stringify(n2));
ok(n2.sold === 10 && f2.sold === 10 && Math.abs(n2.bought - n2.retAmt) < 0.005 && Math.abs(f2.bought - f2.retAmt) < 0.005 && n2.retRes === 'fish',
  '②2 같은 계약 — 판 짐 = 넘긴 짐 · 돌려보낸 짐 = 행이 산 짐(끔 · 켬 둘 다 · 값은 정산 날 곳간으로)', `끔 ${f2.bought}=${f2.retAmt} · 켬 ${n2.bought}=${n2.retAmt}`);
console.log('\n③ 다시 뜸 — 도착 뒤 캐러밴을 T728 메타 꼴로 JSON 왕복');
const sameRecs = (A, B) => JSON.stringify(A.recs) === JSON.stringify(B.recs);
ok(!N.s3.err && sameRecs(N.s3, N.s2) && N.s3.food === N.s2.food, '③0 ★켬 — 장 중(정산 전 `_t707` · 스텁 집)을 JSON 왕복해도 \'return\' 글자 · 날 · 받는 마을 곳간이 ②와 같다(생성 0 · 소멸 0)',
  `return ${N.s3.recs.length} · 곳간 Δ ${N.s3.food} = ${N.s2.food}`);
ok(!F.s3.err && sameRecs(F.s3, F.s2), '③1 끔 — 같은 왕복(\'return\' 은 이미 도착 날 나갔다 · 같다)', `return ${F.s3.recs.length}`);
console.log('\n④ 호스트 전 — 도착 뒤 `world.xzone` 을 이틀 뽑음(다시 뜬 존이 걸음표 전)');
const n4 = desc(N.s4);
ok(!N.s4.err && N.s4.recs.length === 1 && n4.ret === n2.arrive + 3 && JSON.parse(N.s4.recs[0].r).returningAmt === JSON.parse(N.s2.recs[0].r).returningAmt,
  '④0 ★켬 — 예외 0 · 뽑힌 이틀 \'return\' 0(캐러밴이 짐을 쥔다) · 다시 꽂은 날 하나 · 돌려보낸 짐 = ②', `err ${N.s4.err} · return 날 ${n4.ret} · ${n4.retRes}×${n4.retAmt}`);
ok(!F.s4.err && F.s4.recs.length === 1, '④1 끔 — \'return\' 은 도착 날(뽑기 전) 하나', `return ${F.s4.recs.length} · err ${F.s4.err}`);
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
