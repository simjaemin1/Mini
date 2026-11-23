#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4
// === scripts/test-t1441-passage.js — 새 통로는 낸 마을 마음대로(★T1441 ⑥ · 판정 47) — villages.js 정본 함수 · 판이 세운 터 하나 · 아이 판 ==========
//
// ★지키는 것(`T1441_PASSAGE=1` · T527 켬 기본 · 터 · 마을 · 길은 판이 놓는다 — 손은 정본 함수 `_t1441Route` · `_t1441PassDay` · `_t1441Cross`)
//   다리 터 하나(가로 6칸 · 다 섰다 · 낸 마을 = 갑(1)) · 마을 셋: 갑(1 · 낸 마을) · 을(2 · 가까움) · 병(3 · 멀다) · 길 = 을 → 다리 → 저편
//   ⓐ 길 위 첫 통로 칸 — 길을 칸 걸음으로 훑어 찾는다(지나는 길 · 안 지나는 길)
//   ⓑ 열린 줄 알고 열린 통로 → 지름길 · 열린 줄 알고 닫힌 통로 → 헛걸음 표(입구에서 되짚는다)
//   ⓒ 닫힘(갑이 문을 닫은 날 d) — 갑은 그날 안다 · 을은 소문이 닿는 날(거리 ÷ econ 걸음)에야 · 병은 더 늦게 · 그 전엔 열린 줄 안다
//   ⓓ 닫힌 줄 아는 을은 더는 그 통로로 안 떠난다(헛걸음 없음 — 옛길을 구하거나 옛길이 없으면 센다)
//   ⓔ 다시 열림 — 을은 소문이 닿기 전까지 닫힌 줄 안다(지름길 안 씀) · 닿은 날부터 지름길
//   ⓕ 헛걸음으로 돌아온 날 — 돌아온 날에 닫힘을 적는다(소문보다 먼저면)
//   ★미끼 넷(이 파일 안 · 사본 `server/_t1441pbait-*` · 판 끝에 지움): ① 닫힌 통로로 계속 떠나는 사본(아는 것을 안 본다) → ⓓ 빨강 ·
//     ② 소문 없이 다시 열림을 아는 사본(여닫은 날 모두가 안다) → ⓒ ⓔ 빨강 · ③ 낸 마을을 안 적는 사본 → ⓒ 빨강 · ④ 진실을 안 보는 사본(늘 열림) → ⓑ 빨강
// ★박힌 날짜 0.   node scripts/test-t1441-passage.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1441P_MODE || '';
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 300); };

if (MODE) {
  Object.assign(process.env, { T1441_PASSAGE: '1', T527_BRIDGE_ACT: '1' });
  const _l = console.log; console.log = () => {};
  const V = require(process.env.__T1441P_VIL || path.join(ROOT, 'server', 'villages.js'));
  console.log = _l;
  const T = V.__t1441, st = T.state(), R = {};
  const SZ = 32;
  try {
    // 터 하나 — 칸 (1000..1005, 500) 다리 · 다 섰다 · 낸 마을 갑(1)
    const cells = []; for (let x = 1000; x <= 1005; x++) cells.push(x, 500);
    st._t527Sites = [{ i: 0, v: ['갑'], span: 6, cells, stage: 9, mat: {}, done: true, day: 1, adv: [], sum: null, added: cells.slice(), by: null, mem: null }];
    st.ta = { isBlocked: () => false };
    const vil = (id, name, ccx, ccy) => ({ dbId: id, name, ccx, ccy, econ: { name } });
    const A = vil(1, '갑', 990, 500), B = vil(2, '을', 8000, 500), C = vil(3, '병', 30000, 500);   // 을 ≈ 7,000칸 · 병 ≈ 29,000칸(소문 이틀 · 열흘 남짓)
    st.byDbId = new Map([[1, A], [2, B], [3, C]]);
    st.byEcon = new Map([[A.econ, A], [B.econ, B], [C.econ, C]]);
    st.world = { day: 10, tradeLog: [] };
    let blocked = [];
    st.deps = Object.assign(st.deps || {}, { t1441PassBlock: () => blocked.slice() });
    // 낸 마을 — 크루가 일한 마을을 적는 손(`_t1441By`)을 판이 부른다(정본 `_t527BridgeDay` 가 부르는 그 한 줄)
    if (V.__t1441.by) V.__t1441.by(st._t527Sites[0], A);
    const site = st._t527Sites[0];
    const road = [{ x: 8000 * SZ, y: 500 * SZ + 16 }, { x: 990 * SZ, y: 500 * SZ + 16 }];   // 을 → 다리 → 갑 쪽
    const far = [{ x: 8000 * SZ, y: 600 * SZ }, { x: 8100 * SZ, y: 600 * SZ }];
    const h1 = T.cross(road, T.passes()), h2 = T.cross(far, T.passes());
    put(R, 'a_cross', h1 && h1.site === site && h2 === null, `지나는 길 ${h1 ? '통로 칸 찾음(입구까지 ' + Math.round(h1.prog / SZ) + '칸)' : '못 찾음'} · 안 지나는 길 ${h2 ? '찾음' : '없음'}`);
    const cv = { id: 7, from: B.econ, to: A.econ, arriveDay: 14, departDay: 10, returnArriveDay: 18, state: 'outbound' };
    const r1 = T.route(cv, B, B, A, road, 'outbound');
    blocked = [{ id: 'b1', type: 'door', vid: 1 }];   // 갑의 마을 문(닫힘) — 갑 몸은 지나고 남은 막힌다
    const r2 = T.route(cv, B, B, A, road, 'outbound'), rA = T.route(cv, A, A, B, road.slice().reverse(), 'outbound');
    put(R, 'b_route', r1.pts === road && !r1.waste && r2.waste && r2.waste.site === site && !rA.waste, `열림 → ${r1.waste ? '헛걸음' : '지름길'} · 닫힘(모름) → ${r2.waste ? '헛걸음(입구에서 되짚음)' : '지름길'} · 낸 마을 몸 → ${rA.waste ? '헛걸음' : '지름길(제 문)'}`);
    // ⓒ 닫힘 소문 — 닫은 날 d = 10
    T.passDay();
    const kA = T.know(site, 1), kB0 = T.know(site, 2), kC0 = T.know(site, 3);
    const q = (st._t1441Rq || []).slice(), qB = q.find((x) => x.vid === 2), qC = q.find((x) => x.vid === 3);
    put(R, 'c_rumor', kA === 'closed' && kB0 === 'open' && kC0 === 'open' && qB && qC && qB.at > 10 && qC.at > qB.at, `닫은 날 — 갑 ${kA} · 을 ${kB0} · 병 ${kC0} · 소문 닿는 날 을 ${qB && qB.at} · 병 ${qC && qC.at}`);
    let dB = null;
    for (let d = 11; d <= 400 && T.know(site, 2) !== 'closed'; d++) { st.world.day = d; T.passDay(); if (T.know(site, 2) === 'closed') dB = d; }
    put(R, 'c_learn', dB === qB.at, `을이 닫힘을 안 날 ${dB} · 소문 닿는 날 ${qB.at}`);
    // ⓓ 아는 을은 더는 헛걸음 안 한다
    const r3 = T.route(cv, B, B, A, road, 'outbound');
    const PS0 = JSON.parse(JSON.stringify(T.PS));
    put(R, 'd_known', !r3.waste, `닫힌 줄 아는 을 → ${r3.waste ? '헛걸음' : (r3.pts === road ? '옛길 없음(센다 ' + PS0.oldRoadMiss + ')' : '옛길')}`);
    // ⓔ 다시 열림 — 을은 소문 닿기 전까지 닫힌 줄 안다
    blocked = []; const d0 = st.world.day + 1; st.world.day = d0; T.passDay();
    const qB2 = (st._t1441Rq || []).find((x) => x.vid === 2 && x.st === 'open');
    const kB1 = T.know(site, 2), kA1 = T.know(site, 1);
    let dB2 = null;
    for (let d = d0 + 1; d <= d0 + 400 && T.know(site, 2) !== 'open'; d++) { st.world.day = d; T.passDay(); if (T.know(site, 2) === 'open') dB2 = d; }
    const r4 = T.route(cv, B, B, A, road, 'outbound');
    put(R, 'e_reopen', kA1 === 'open' && kB1 === 'closed' && qB2 && dB2 === qB2.at && !r4.waste && r4.pts === road, `연 날 갑 ${kA1} · 을 ${kB1} · 을이 연 줄 안 날 ${dB2}(소문 ${qB2 && qB2.at}) · 그 뒤 을 → ${r4.waste ? '헛걸음' : '지름길'}`);
    // ⓕ 헛걸음으로 돌아온 날 — 소문보다 먼저 안다
    blocked = [{ id: 'b2', type: 'wall', vid: null }]; const d1 = st.world.day + 1; st.world.day = d1;
    st._t1441Back = (st._t1441Back || []).concat([{ site: 0, vid: 3, ev: d1, at: d1 + 2 }]);   // 병 캐러밴이 헛걸음 — 이틀 뒤 집
    T.passDay();
    const qC3 = (st._t1441Rq || []).find((x) => x.vid === 3 && x.st === 'closed' && x.ev === d1);
    let dC = null; for (let d = d1 + 1; d <= d1 + 10 && T.know(site, 3) !== 'closed'; d++) { st.world.day = d; T.passDay(); if (T.know(site, 3) === 'closed') dC = d; }
    put(R, 'f_back', dC === d1 + 2 && qC3 && qC3.at > dC, `병이 돌아온 날 ${dC}(헛걸음 날 ${d1} + 2) · 소문은 ${qC3 && qC3.at}`);
    R['@PS'] = JSON.stringify(Object.assign({}, T.PS, { log: undefined }));
  } catch (e) { R.err = false; R['err#'] = String(e && e.stack || e).slice(0, 400); }
  console.log('@@T1441P ' + JSON.stringify(R));
  process.exit(0);
}

const runChild = (extra) => {
  let o = '';
  try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1441P_MODE: 'on' }, extra || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); }
  catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1441P (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { err: false, 'err#': '결과줄 없음' };
};
let pass = 0, fail = 0;
const ok = (c, name, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${x ? '  — ' + x : ''}`); };
const KEYS = [['a_cross', 'ⓐ 길 위 첫 통로 칸'], ['b_route', 'ⓑ 열림 = 지름길 · 모르고 닫힘 = 헛걸음 · 낸 마을 몸은 제 문을 지난다'], ['c_rumor', 'ⓒ 닫은 날 — 낸 마을만 안다 · 소문은 거리만큼 늦다'],
  ['c_learn', 'ⓒ 을은 소문이 닿은 날 안다'], ['d_known', 'ⓓ 닫힌 줄 알면 그 통로로 안 떠난다'], ['e_reopen', 'ⓔ 다시 열림도 소문이 닿아야 · 그 뒤 지름길'], ['f_back', 'ⓕ 헛걸음으로 돌아온 날 안다(소문보다 먼저)']];
if (require.main === module) {
  console.log('=== T1441 ⑥ 새 통로 ===');
  const R = runChild(); for (const [k, n] of KEYS) ok(R[k] === true, n, R[k + '#']); if (R.err === false) ok(false, '판이 끝까지 돌았다', R['err#']);
  if (R['@PS']) console.log('    집계 ' + R['@PS'].slice(0, 300));
  const BAITS = [
    { rep: [["function _t1441Know(site, vid) { const m = site.mem && site.mem[vid | 0]; return m ? m[0] : 'open'; }", "function _t1441Know(site, vid) { return 'open'; }"]], key: 'd_known', name: '① 닫힌 통로로 계속 떠나는 사본(아는 것을 안 본다)' },
    { rep: [["        if ((s.by || []).indexOf(v.dbId | 0) >= 0) { _t1441Learn(s, v.dbId, st, d, d, 'own'); continue; }", "        { _t1441Learn(s, v.dbId, st, d, d, 'own'); continue; }"]], key: 'c_rumor', name: '② 소문 없이 다시 열림을 아는 사본(여닫은 날 모두가 안다)' },
    { rep: [["  if (site.by.indexOf(vil.dbId | 0) < 0) { site.by.push(vil.dbId | 0); _t1441PS.by++; }", "  if (false) { site.by.push(vil.dbId | 0); _t1441PS.by++; }"]], key: 'c_rumor', name: '③ 낸 마을을 안 적는 사본' },
    { rep: [["function _t1441Block(site) { try {", "function _t1441Block(site) { return []; try {"]], key: 'b_route', name: '④ 통로 위 막는 것을 안 보는 사본(늘 열림)' },
  ];
  const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), made = [];
  console.log('=== 미끼 ===');
  const BR = [];
  try {
    BAITS.forEach((b, i) => {
      let s = src, nRep = 0;
      for (const [from, to] of b.rep) { if (s.split(from).length - 1 !== 1) { nRep = -1; break; } s = s.replace(from, to); nRep++; }
      if (nRep < 1) { ok(false, `미끼 ${b.name} — 고칠 곳이 한 곳이 아님`); return; }
      const p = path.join(ROOT, 'server', `_t1441pbait-${i + 1}.js`); fs.writeFileSync(p, s); made.push(p);
      const R2 = runChild({ __T1441P_VIL: p });
      BR[i] = { red: R2[b.key] === false, n: nRep, x: R2[b.key + '#'] };
    });
  } finally { for (const p of made) { try { fs.unlinkSync(p); } catch (e) {} } }
  const bk = (i) => BR[i] || { red: false, n: 0, x: '돌지 않음' };
  ok(bk(0).red, `미끼 ① 닫힌 통로로 계속 떠나는 사본(아는 것을 안 본다) → d_known 빨강(바꾼 자리 ${bk(0).n})`, bk(0).x);
  ok(bk(1).red, `미끼 ② 소문 없이 다시 열림을 아는 사본(여닫은 날 모두가 안다) → c_rumor 빨강(바꾼 자리 ${bk(1).n})`, bk(1).x);
  ok(bk(2).red, `미끼 ③ 낸 마을을 안 적는 사본 → c_rumor 빨강(바꾼 자리 ${bk(2).n})`, bk(2).x);
  ok(bk(3).red, `미끼 ④ 통로 위 막는 것을 안 보는 사본(늘 열림) → b_route 빨강(바꾼 자리 ${bk(3).n})`, bk(3).x);
  console.log(`\n=== T1441 새 통로: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
