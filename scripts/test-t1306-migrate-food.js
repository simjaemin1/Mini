#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1306-migrate-food.js — T1306: 이주도 받는 마을 곳간을 본다 · 소문으로 아는 만큼(`T1306_MIGRATE_FOOD` · T1297 켬 안) ======
//   진짜 서버 함수(`villages._t1147Pick` · `_t1306Record` · `_t1306Known` · `_t1306Pass`)를 존을 띄워 부른다 — 마을 행복 · 침상 · 곳간 · 들은 줄만 판 꾸밈으로 세운다.
//   ① 하루 한 줄(곳간 · 사람 수 · 오늘 날) · 같은 날 두 번이면 덮는다 · ② 소식이 아직 안 닿음(오늘 줄뿐) = 모른다 → 안 간다
//   ③ 들은 곳간이 넉넉 → 행복이 가장 높은 곳 · ④ 들은 곳간이 얇으면(지금 곳간이 넉넉해도) 건너뛴다 · ⑤ 들은 곳간이 넉넉하면(지금은 비었어도) 간다 — 아직 모른다
//   ⑥ 도달 일수보다 새 줄은 안 듣는다 · ⑦ 겨울 문턱(듣는 날의 출생 문 날 수 — 봄까지 남은 날) · ⑧ 모르는 마을 · 셈 칸
//   ⑨ 끔(T1306 끔 · T1297 켬) = 종전 줄 그대로(지금 곳간 · 3일치) · ⑩ T1297 끔이면 이주 문도 꺼진다
//   ★미끼 — `_t1306Pass` 사본에서 들은 줄 대신 지금 곳간을 읽게(모르는 곳간을 읽는 사본) → ④ 를 놓친다(빨강).
//   ★★[T1312 무리 절] 손잡이 `T1312_HERD`(T1306 켬 안) — ⑪ 하루 한 줄에 행복 · 침상도 싣는다 · ⑫ 같은 날 한 마을에서 20명이 떠나는 장면: 들은 곳간이 (들은 인구 + 6)까지만
//     먹이는 마을엔 6명만 가고 나머지는 다음 곳으로(무리 셈) · ⑬ 들은 침상이 찼으면(오늘은 비어도) 안 간다 · ⑭ 행복은 들은 줄 — 오늘 행복이 높아도 들은 행복이 낮으면 안 가고,
//     오늘 낮아도 들은 행복이 높으면 간다 · ⑮ 끔(T1312 끔 · T1306 켬) = T1306 그대로(20명 모두 한 곳 · 줄에 행복 · 침상 없음)
//     ★미끼 둘 — 앞서 고른 수를 안 더한 `_t1312Pass` 사본(20명 모두 한 곳 · 빨강) · 행복을 오늘 값으로 읽는 사본(⑭ 를 거꾸로 · 빨강)
//   ★★[T1319 절] 손잡이 `T1319_RECV_K`(T1312 켬 안) · `T1319_AUTUMN_LOOK`(T1297 켬 안 · econ) — ⑯ 손잡이 · ⑰ 하루 한 줄에 그날 K(econ `_dpDebug.K`)도 싣는다 ·
//     ⑱ K 를 넘는 마을로 안 간다 — 같은 날 20명: 들은 K = 들은 인구 + 6 인 b 엔 앞 6명만 · 나머지 14명은 c(무리 셈 포함) · ⑲ 들은 K 가 없으면(켜기 전 줄) K 문은 안 선다 ·
//     ⑳ K 는 들은 줄 — 들은 K 꽉 · 오늘 K 넉넉 → 안 감 / 들은 K 넉넉 · 오늘 K 꽉 → 감 · ㉑ 가을 문 날 수(8월 31일 30 · 9월 1일 181 · 11월 30일 91 · 12월 1일 90) ·
//     ㉒ 가을 문이 겨울 끝까지 본다 — 들은 곳간 60일치: 8월 31일엔 가고 9월 1일엔 안 간다
//     ★미끼 둘 — K 를 오늘 값으로 읽는 `_t1312Pass` 사본(⑳ 를 거꾸로 · 빨강) · 가을 문이 30일로 남은 econ 사본(㉒ 9월 1일에도 간다 · 빨강)
//     ㉓ `T1319_AUTUMN_LOOK=mig`(이주 문만) — 출생 문 날 수는 가을에도 30 · 이주 문 날 수는 181(9월 1일) · ㉒ 그대로(60일치 마을에 8월 31일엔 가고 9월 1일엔 안 간다)
'use strict';
if (process.env.T474_CARAVAN_WALK === undefined) process.env.T474_CARAVAN_WALK = '0';   // test-t1147-emig-pick 과 같은 판(교역로 4일 이웃 표본)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };

if (process.argv[2] === '--child') {
  const mode = process.argv[3];
  const R = {};
  (async () => {
    const TMP = `/tmp/test-t1306-${process.pid}.db`;
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(44100 + (mode === 'on' ? 0 : mode === 'off' ? 1 : mode === 'herd' ? 3 : mode === 'k19' ? 4 : mode === 'k19m' ? 5 : 2))), DB_PATH: TMP, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', LATENCY_MS: '0' });
    const _l = console.log, _w = console.warn, _e = console.error;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    require(path.join(ROOT, 'server', 'zone.js'));
    const SV = require(path.join(ROOT, 'server', 'villages.js'));
    const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
    const E1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let vils = [];
    for (let i = 0; i < 600; i++) { await sleep(500); const cv = (SV.clientVillages && SV.clientVillages()) || []; vils = cv.map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ && v.econ.npcs.length); if (vils.length >= 20) break; }
    console.log = _l; console.warn = _w; console.error = _e;
    R.vils = vils.length; R.on = SV._t1306On(); R.knob297 = E1.T1297_BIRTH_FOOD;
    if (vils.length < 20) return out();
    const W = vils[0].econ._world, M = W._distMatrix, ev = W.villages;
    const days = (a, b) => { const i = ev.indexOf(a.econ), j = ev.indexOf(b.econ); const d = (M && i >= 0 && j >= 0) ? M[i][j] : Math.hypot(a.ccx - b.ccx, a.ccy - b.ccy) * 2.5; return isFinite(d) ? V2.travelDaysForDistance(d) : Infinity; };
    let src = null, near = [];
    for (const v of vils) { const n = vils.filter((u) => u !== v && days(v, u) <= 4); if (n.length >= 3) { src = v; near = n; break; } }
    R.src = !!src;
    if (!src) return out();
    const setH = (v, h) => { v.econ.lastStats = Object.assign({}, v.econ.lastStats || {}, { happiness: h }); };
    const room = (v) => { v.econ.housing = v.econ.npcs.length + 10; v.econ._mapBeds = v.econ.npcs.length + 10; v.econ.storage.food = Math.max(v.econ.storage.food || 0, (v.econ.npcs.length + 1) * 3 + 50); };
    for (const v of vils) { setH(v, 0.1); room(v); }
    setH(src, 0.2);
    const [a, b, c] = near;
    setH(a, 0.5); setH(b, 0.7); setH(c, 0.6);
    const day = W.day | 0, name = (x) => (x ? x.name : null), P = () => name(SV._t1147Pick(src));
    R.names = { a: a.name, b: b.name, c: c.name };
    const need = (v, d) => (v.econ.npcs.length + 1) * E1.DAILY_FOOD_CONSUMPTION * E1.t1297NeedDays(d);
    const rich = (v, d) => need(v, d) * 1.5, thin = (v, d) => need(v, d) * 0.5;   // 판 꾸밈 — 문턱의 1.5배 · 0.5배
    if (mode === 'on') {
      SV._t1306Record(); SV._t1306Record();
      const ring = b.econ._t1306Fd || [], last = ring[ring.length - 1] || {};
      R.rec = { len: ring.length, d: last.d, day, fe: last.fe, feNow: E1.totalFoodEquivalent(b.econ), n: last.n, nNow: b.econ.npcs.length, all: vils.every((v) => Array.isArray(v.econ._t1306Fd) && v.econ._t1306Fd.length === 1) };
      const lag = (SV._t1306Known(src, b, day + 100) || {}).lag;   // 먼 날로 물으면 오늘 줄이 들린다 — 도달 일수만 꺼낸다
      R.lag = lag;
      R.unknownToday = SV._t1306Known(src, b, day) === null;      // ② 오늘 줄뿐 — 소식이 아직 안 닿았다
      const setRing = (v, rows) => { v.econ._t1306Fd = rows.map(([d, fe]) => ({ d, fe, n: v.econ.npcs.length })); };
      for (const v of near) setRing(v, [[day - lag, rich(v, day)]]);
      R.p3 = P();                                                   // ③ 모두 들은 곳간 넉넉 → b(0.7)
      setRing(b, [[day - lag, thin(b, day)]]);
      R.feNowB = E1.totalFoodEquivalent(b.econ); R.needB = need(b, day);
      R.p4 = P();                                                   // ④ b 들은 곳간 얇음(지금은 넉넉) → c(0.6)
      const keep = b.econ.storage; b.econ.storage = Object.assign({}, keep); for (const k of Object.keys(b.econ.storage)) b.econ.storage[k] = 0;
      setRing(b, [[day - lag, rich(b, day)]]);
      R.feNowB0 = E1.totalFoodEquivalent(b.econ);
      R.p5 = P();                                                   // ⑤ b 지금은 비었지만 들은 곳간은 넉넉 → b(아직 모른다)
      b.econ.storage = keep;
      setRing(b, [[day - lag, rich(b, day)], [day, thin(b, day)]]);
      R.p6 = P();                                                   // ⑥ 오늘 줄(얇음)은 아직 안 들린다 → b
      const wd = 276 + lag;                                         // ⑦ 겨울 들머리 날 276 줄을 듣는 날(출생 문 날 수 = 89)
      setRing(b, [[276, (b.econ.npcs.length + 1) * 60]]); R.w60 = SV._t1306Pass(src, b, wd);
      setRing(b, [[276, (b.econ.npcs.length + 1) * 100]]); R.w100 = SV._t1306Pass(src, b, wd); R.wNeed = E1.t1297NeedDays(wd);
      delete b.econ._t1306Fd;
      const s0 = Object.assign({}, SV.t1306Stat());
      R.p8 = P();                                                   // ⑧ b 소식 없음 → 모름 → c
      const s1 = SV.t1306Stat(); R.st = { seen: s1.seen - s0.seen, unknown: s1.unknown - s0.unknown, ok: s1.ok - s0.ok, thin: s1.thin - s0.thin };
      // ★미끼 — 진짜 `_t1306Pass` 글에서 들은 줄 대신 지금 곳간을 읽게 한 사본(④ 판)
      const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
      const i0 = VS.indexOf('function _t1306Pass('), i1 = VS.indexOf('\n}\n', i0) + 2;
      const body = VS.slice(i0, i1);
      R.baitLine = body.split('_t1306Known(fromVil, toVil, day)').length === 2;
      const baitSrc = body.replace('_t1306Known(fromVil, toVil, day)', '__omni(fromVil, toVil, day)');
      const bait = new Function('state', '_t1306Stat', '__omni', baitSrc + '\nreturn _t1306Pass;')({ econ: E1 }, { seen: 0, ok: 0, thin: 0, unknown: 0, lagSum: 0 },
        (f, t) => ({ d: day, fe: E1.totalFoodEquivalent(t.econ), n: t.econ.npcs.length, lag: 0 }));
      setRing(b, [[day - lag, thin(b, day)]]);
      R.realThin = SV._t1306Pass(src, b, day); R.baitThin = bait(src, b, day);
      // ⑮ T1312 끔 = T1306 그대로 — 들은 곳간이 (인구 + 6)까지만 먹이는 b 에도 20명이 모두 간다 · 줄에 행복 · 침상 칸 없음
      const per = E1.DAILY_FOOD_CONSUMPTION * E1.t1297NeedDays(day);
      for (const v of near) setRing(v, [[day - lag, (v.econ.npcs.length + 1 + 30) * per]]);
      setRing(b, [[day - lag, (b.econ.npcs.length + 1 + 5) * per]]);
      R.herdOff = []; for (let i = 0; i < 20; i++) R.herdOff.push(P());
      SV._t1306Record(); const rr = (a.econ._t1306Fd || []).slice(-1)[0] || {}; R.rowOffKeys = Object.keys(rr).sort().join(',');
      R.on12 = SV._t1312On();
    } else if (mode === 'herd') {
      // ⑪ ~ ⑭ — T1312 켬(T1297 · T1306 · T1312)
      R.on12 = SV._t1312On();
      SV._t1306Record();
      const rr = (b.econ._t1306Fd || []).slice(-1)[0] || {};
      const bedsNow = Math.min(b.econ.housing, b.econ._mapBeds);
      R.row = { keys: Object.keys(rr).sort().join(','), h: rr.h, hNow: (b.econ.lastStats || {}).happiness, beds: rr.beds, bedsNow };
      const lag = (SV._t1306Known(src, b, day + 100) || {}).lag;
      const per = E1.DAILY_FOOD_CONSUMPTION * E1.t1297NeedDays(day);
      const row = (v, o) => Object.assign({ d: day - lag, fe: (v.econ.npcs.length + 1 + 30) * per, n: v.econ.npcs.length, h: 0.1, beds: v.econ.npcs.length + 100 }, o);
      const setR = (v, o) => { v.econ._t1306Fd = [row(v, o)]; };
      const reset = () => { SV._t1312PickedOf(src, b, day + 7); };   // 다른 날로 한 번 물어 무리 셈을 비운다(날이 바뀌면 비우는 그 줄)
      const H0 = 0.2;
      // ⑫ 무리 — b(들은 행복 0.7)는 (인구 + 6)까지만 먹인다 · c(0.6)는 넉넉 · a(0.5)
      setR(a, { h: 0.5 }); setR(b, { h: 0.7, fe: (b.econ.npcs.length + 1 + 5) * per }); setR(c, { h: 0.6 });
      reset(); const s0 = Object.assign({}, SV.t1312Stat());
      R.herd = []; for (let i = 0; i < 20; i++) R.herd.push(P());
      const s1 = SV.t1312Stat(); R.st = { picks: s1.picks - s0.picks, herdPicks: s1.herdPicks - s0.herdPicks, herdCut: s1.herdCut - s0.herdCut };
      // ⑬ 들은 침상이 찼다(오늘은 비었다)
      reset(); setR(b, { h: 0.7, beds: b.econ.npcs.length }); R.bedsNowB = Math.min(b.econ.housing, b.econ._mapBeds) - b.econ.npcs.length;
      R.pBeds = P();
      // ⑭ 행복은 들은 줄 — b 오늘 0.9 · 들은 0.1 → 안 감 / 오늘 0.05 · 들은 0.95 → 감
      reset(); setR(b, { h: 0.1 }); setH(b, 0.9); R.pHeardLow = P();
      reset(); setR(b, { h: 0.95 }); setH(b, 0.05); R.pHeardHigh = P();
      setH(b, 0.7);
      // ★미끼 둘 — `_t1312Pass` 글을 떼어 ⓐ 앞서 고른 수를 안 더한 사본 · ⓑ 행복을 오늘 값으로 읽는 사본
      const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
      const i0 = VS.indexOf('function _t1312Pass('), i1 = VS.indexOf('\n}\n', i0) + 2, body = VS.slice(i0, i1);
      const mk = (src2) => new Function('state', '_t1312Stat', '_t1306Known', '_t1312PickedOf', '__hNow', '_t1319KOn', '_t1319Stat', src2 + '\nreturn _t1312Pass;')(
        { econ: E1 }, { seen: 0, ok: 0, unknown: 0, unhappy: 0, beds: 0, thin: 0, herdCut: 0, picks: 0, herdPicks: 0, lagSum: 0 }, SV._t1306Known, SV._t1312PickedOf, (v) => (v.econ.lastStats || {}).happiness, SV._t1319KOn, { overK: 0 });   // ★[T1319] 진짜 글에 K 문 한 줄이 들었다(이 판은 T1319 끔 — `_t1319KOn` 거짓)
      R.baitLines = [body.split('nk = k.n + pk').length, body.split('k.h').length - 1];
      const baitA = mk(body.replace('nk = k.n + pk', 'nk = k.n')), baitB = mk(body.split('k.h').join('__hNow(toVil)')), real = SV._t1312Pass;
      const sim = (pass) => { reset(); const out = []; for (let i = 0; i < 20; i++) { let best = null, bh = -Infinity; for (const x of near) { const hk = pass(src, x, day, H0); if (hk != null && hk > bh) { bh = hk; best = x; } } out.push(best ? best.name : null); if (best) SV._t1312Note(src, best, day); } return out; };
      setR(a, { h: 0.5 }); setR(b, { h: 0.7, fe: (b.econ.npcs.length + 1 + 5) * per }); setR(c, { h: 0.6 });
      R.simReal = sim(real); R.simBaitA = sim(baitA);
      setR(b, { h: 0.95 }); setH(b, 0.05);
      R.hiReal = real(src, b, day, H0) != null; R.hiBaitB = baitB(src, b, day, H0) != null;
      setH(b, 0.7);
    } else if (mode === 'k19' || mode === 'k19m') {
      // ⑯ ~ ㉒ — T1319 켬(T1297 · T1306 · T1312 · T1319_RECV_K · T1319_AUTUMN_LOOK)
      R.on19 = SV._t1319KOn(); R.aut = E1.T1319_AUTUMN_LOOK === true;
      const keepDbg = b.econ._dpDebug, nB = b.econ.npcs.length;
      b.econ._dpDebug = Object.assign({}, keepDbg || {}, { K: 42.5 });
      SV._t1306Record();
      const rr = (b.econ._t1306Fd || []).slice(-1)[0] || {};
      R.row = { keys: Object.keys(rr).sort().join(','), K: rr.K };                       // ⑰ 그날 K(인구 식이 쓴 값)
      const lag = (SV._t1306Known(src, b, day + 100) || {}).lag;
      const per = E1.DAILY_FOOD_CONSUMPTION * E1.t1297NeedDays(day);
      const row = (v, o) => Object.assign({ d: day - lag, fe: (v.econ.npcs.length + 1 + 30) * per, n: v.econ.npcs.length, h: 0.1, beds: v.econ.npcs.length + 100, K: v.econ.npcs.length + 1000 }, o);
      const setR = (v, o) => { v.econ._t1306Fd = [row(v, o)]; };
      const reset = () => { SV._t1312PickedOf(src, b, day + 7); };
      const H0 = 0.2;
      // ⑱ K 를 넘는 마을로 안 간다 — b(들은 행복 0.7) 들은 K = 들은 인구 + 6 · 곳간 · 침상 넉넉 · c(0.6) · a(0.5)
      setR(a, { h: 0.5 }); setR(b, { h: 0.7, K: nB + 6 }); setR(c, { h: 0.6 });
      reset(); const k0 = SV.t1319Stat().overK;
      R.kHerd = []; for (let i = 0; i < 20; i++) R.kHerd.push(P());
      R.overK = SV.t1319Stat().overK - k0;
      // ⑲ 들은 K 없음(켜기 전 줄) → K 문 안 섬 → 20명 모두 b(곳간 · 침상 넉넉)
      setR(b, { h: 0.7, K: null }); reset();
      R.kNull = []; for (let i = 0; i < 20; i++) R.kNull.push(P());
      // ⑳ K 는 들은 줄 — 들은 K 꽉(= 들은 인구) · 오늘 K 넉넉 → c / 들은 K 넉넉 · 오늘 K 꽉 → b
      setR(b, { h: 0.7, K: nB }); b.econ._dpDebug = Object.assign({}, b.econ._dpDebug, { K: nB + 100 }); reset(); R.kHeardFull = P();
      setR(b, { h: 0.7, K: nB + 100 }); b.econ._dpDebug = Object.assign({}, b.econ._dpDebug, { K: nB }); reset(); R.kHeardRoom = P();
      // ★미끼 ① — `_t1312Pass` 글에서 들은 K(`k.K`)를 오늘 K 로 읽게 한 사본
      const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
      const i0 = VS.indexOf('function _t1312Pass('), i1 = VS.indexOf('\n}\n', i0) + 2, body = VS.slice(i0, i1);
      const mk = (src2, econ) => new Function('state', '_t1312Stat', '_t1306Known', '_t1312PickedOf', '_t1319KOn', '_t1319Stat', '__kNow', src2 + '\nreturn _t1312Pass;')(
        { econ }, { seen: 0, ok: 0, unknown: 0, unhappy: 0, beds: 0, thin: 0, herdCut: 0, picks: 0, herdPicks: 0, lagSum: 0 }, SV._t1306Known, SV._t1312PickedOf, SV._t1319KOn, { overK: 0 }, (v) => (v.econ._dpDebug || {}).K);
      R.kBaitLine = body.split('k.K').length - 1;
      const baitK = mk(body.split('k.K').join('__kNow(toVil)'), E1);
      setR(b, { h: 0.7, K: nB }); b.econ._dpDebug = Object.assign({}, b.econ._dpDebug, { K: nB + 100 }); reset();
      R.kReal = SV._t1312Pass(src, b, day, H0) != null; reset(); R.kBait = baitK(src, b, day, H0) != null;
      b.econ._dpDebug = keepDbg;
      // ㉑ 가을 문 날 수 — 달력 정본(9 · 10 · 11월) · 다음 3월 1일까지 남은 날
      const C = require(path.join(ROOT, 'server', 'calendar')), y = C.dateOf(day).year;
      const aug31 = C.dayOf(y, 8, 31), sep1 = C.dayOf(y, 9, 1), nov30 = C.dayOf(y, 11, 30), dec1 = C.dayOf(y, 12, 1);
      R.need = { aug31: E1.t1297NeedDays(aug31), sep1: E1.t1297NeedDays(sep1), nov30: E1.t1297NeedDays(nov30), dec1: E1.t1297NeedDays(dec1), leanSep1: E1.t1149LeanDays(sep1), leanNov30: E1.t1149LeanDays(nov30) };
      R.needMig = { aug31: E1.t1319MigNeedDays(aug31), sep1: E1.t1319MigNeedDays(sep1), nov30: E1.t1319MigNeedDays(nov30), dec1: E1.t1319MigNeedDays(dec1) }; R.mig = E1.T1319_AUTUMN_MIG === true;   // 이주 문 날 수(서버가 읽는 것)
      // ㉒ 들은 곳간 60일치(K · 침상 넉넉) — 8월 31일엔 간다 · 9월 1일엔(문턱 181일치) 안 간다
      const at = (D) => { b.econ._t1306Fd = [{ d: D - lag, fe: (nB + 1) * E1.DAILY_FOOD_CONSUMPTION * 60, n: nB, h: 0.7, beds: nB + 100, K: nB + 1000 }]; SV._t1312PickedOf(src, b, D + 3); };
      at(aug31); R.autAug = SV._t1312Pass(src, b, aug31, H0) != null;
      at(sep1); R.autSep = SV._t1312Pass(src, b, sep1, H0) != null;
      // ★미끼 ② — 가을 항을 뺀 econ 사본(문턱 날 수가 가을에도 30) — 9월 1일에도 60일치 마을로 간다
      const PP = path.join(ROOT, 'sim', 'economy-sim.js'), EC = fs.readFileSync(PP, 'utf8'), AL = 'T1319_AUTUMN_MIG ? t1319AutumnLeft(day) : 0';   // 이주 문 날 수(`t1319MigNeedDays`)의 가을 항
      R.autBaitLine = EC.split(AL).length - 1;
      const Module = require('module'), mm = new Module(PP + '.bait19', null); mm.filename = PP; mm.paths = Module._nodeModulePaths(path.dirname(PP)); mm._compile(EC.replace(AL, '0'), PP);
      const baitA = mk(body, mm.exports);
      at(sep1); R.autReal = SV._t1312Pass(src, b, sep1, H0) != null; SV._t1312PickedOf(src, b, sep1 + 5); R.autBait = baitA(src, b, sep1, H0) != null; R.autBaitNeed = mm.exports.t1319MigNeedDays(sep1);
    } else {
      // ⑨ · ⑩ 끔 — 들은 줄이 얇아도 지금 곳간(3일치)으로 고른다
      b.econ._t1306Fd = [{ d: day - 1, fe: 0, n: b.econ.npcs.length }];
      R.pOffRich = P();
      const keep = b.econ.storage; b.econ.storage = Object.assign({}, keep); for (const k of Object.keys(b.econ.storage)) b.econ.storage[k] = 0;
      R.pOffEmpty = P(); b.econ.storage = keep;
      R.st = SV.t1306Stat();
    }
    out();
  })().catch((e) => { R.err = String(e && e.stack); out(); });
  function out() { console.log('@@T1306M ' + JSON.stringify(R)); process.exit(0); }
} else {
  const ch = (mode, env) => { try { const o = execFileSync(process.execPath, ['--experimental-sqlite', __filename, '--child', mode], { env: Object.assign({}, process.env, env), encoding: 'utf8', maxBuffer: 64 << 20 });
    const l = o.split('\n').find((x) => x.startsWith('@@T1306M ')); return l ? JSON.parse(l.slice(9)) : null; } catch (e) { return { err: String(e.message).slice(0, 300) }; } };
  console.log('=== T1306 이주 문(`T1306_MIGRATE_FOOD` · T1297 켬 안) — 소문으로 아는 받는 마을 곳간 ===');
  const ON = ch('on', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1' });
  const OFF = ch('off', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '0' });
  const KN = ch('knob', { T1297_BIRTH_FOOD: '0', T1306_MIGRATE_FOOD: '1' });
  const HD = ch('herd', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1', T1312_HERD: '1' });
  const K19 = ch('k19', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1', T1312_HERD: '1', T1319_RECV_K: '1', T1319_AUTUMN_LOOK: '1' });
  const K19M = ch('k19m', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1', T1312_HERD: '1', T1319_RECV_K: '1', T1319_AUTUMN_LOOK: 'mig' });
  if (!ON || ON.err || !(ON.vils >= 20) || !ON.src) ok(false, '켬 판이 안 섰다', ON);
  else {
    const N = ON.names;
    ok(ON.on === true && ON.knob297 === true, '손잡이 — T1297 켬 안에서 `\'1\'` 만 켬');
    ok(ON.rec.len === 1 && ON.rec.d === ON.rec.day && ON.rec.fe === ON.rec.feNow && ON.rec.n === ON.rec.nNow && ON.rec.all, '① 하루 한 줄(오늘 날 · 곳간 식량 환산 · 사람 수) · 같은 날 두 번 적으면 덮는다 · 모든 마을', ON.rec);
    ok(ON.lag >= 1 && ON.unknownToday, `② 소식이 닿는 날 수(T7 도달 시각표) = ${ON.lag}날 — 오늘 줄뿐이면 아직 모른다`, { lag: ON.lag });
    ok(ON.p3 === N.b, '③ 들은 곳간이 모두 넉넉 → 행복이 가장 높은 곳(0.7)', { got: ON.p3, want: N.b });
    ok(ON.p4 === N.c && ON.feNowB >= ON.needB, '★④ 들은 곳간이 얇으면 건너뛴다 — 지금 곳간은 넉넉해도(떠나는 사람은 모른다) → 다음 0.6', { got: ON.p4, want: N.c, feNow: ON.feNowB, need: ON.needB });
    ok(ON.p5 === N.b && ON.feNowB0 === 0, '★⑤ 지금은 비었어도 들은 곳간이 넉넉하면 간다 — 비었다는 소식이 아직 안 닿았다', { got: ON.p5, want: N.b });
    ok(ON.p6 === N.b, '⑥ 도달 일수보다 새 줄(오늘 · 얇음)은 아직 안 들린다 → 들은 줄(넉넉)로 고른다', { got: ON.p6 });
    ok(ON.wNeed === 89 - ON.lag && ON.w60 === false && ON.w100 === true, `⑦ 겨울 — 날 276 줄을 듣는 날(276 + ${ON.lag})의 출생 문 날 수 ${ON.wNeed}일치(봄까지 남은 날 · 같은 자) — 60일치 막힘 · 100일치 통과`, { need: ON.wNeed, w60: ON.w60, w100: ON.w100 });
    ok(ON.p8 === N.c && ON.st.unknown >= 1 && ON.st.seen === ON.st.unknown + ON.st.ok + ON.st.thin, '⑧ 소식 없는 마을은 모른다 → 안 간다 · 셈 칸(본 = 모름 + 넉넉 + 얇음)', { got: ON.p8, st: ON.st });
    ok(ON.baitLine && ON.realThin === false && ON.baitThin === true, '★미끼 — 들은 줄 대신 지금 곳간을 읽는 사본은 ④ 의 얇다는 소식을 놓친다(빨강 · 사본 통과)', { real: ON.realThin, bait: ON.baitThin });
    const allB = ON.herdOff && ON.herdOff.length === 20 && ON.herdOff.every((x) => x === N.b);
    ok(ON.on12 === false && allB && ON.rowOffKeys === 'd,fe,n', '⑮ T1312 끔(T1306 켬) = T1306 그대로 — (인구 + 6)까지만 먹이는 b 에도 20명이 모두 간다 · 줄 칸은 날 · 곳간 · 사람 수뿐', { herd: ON.herdOff, keys: ON.rowOffKeys });
  }
  if (!OFF || OFF.err || !(OFF.vils >= 20)) ok(false, '끔 판이 안 섰다', OFF);
  else ok(OFF.on === false && OFF.pOffRich === OFF.names.b && OFF.pOffEmpty === OFF.names.c && OFF.st.seen === 0, '⑨ 끔(T1306 끔 · T1297 켬) = 종전 줄 — 들은 줄을 안 보고 지금 곳간(3일치)으로 고른다 · 셈 0', { rich: OFF.pOffRich, empty: OFF.pOffEmpty, st: OFF.st });
  if (!KN || KN.err || !(KN.vils >= 20)) ok(false, 'T1297 끔 판이 안 섰다', KN);
  else ok(KN.on === false && KN.knob297 === false && KN.st.seen === 0, '⑩ T1297 끔이면 이주 문도 꺼진다(`T1306_MIGRATE_FOOD=1` 이어도)', { on: KN.on, st: KN.st });
  console.log('=== T1312 무리 절(`T1312_HERD` · T1306 켬 안) — 무리 셈 · 들은 행복 · 침상 ===');
  if (!HD || HD.err || !(HD.vils >= 20) || !HD.src) ok(false, '무리 판이 안 섰다', HD);
  else {
    const N = HD.names, cnt = (arr, x) => arr.filter((y) => y === x).length;
    ok(HD.on12 === true, '손잡이 — T1306 켬 안에서 `\'1\'` 만 켬');
    ok(HD.row.keys === 'beds,d,fe,h,n' && HD.row.h === HD.row.hNow && HD.row.beds === HD.row.bedsNow, '⑪ 하루 한 줄에 그날 행복 · 침상(min(집 · 지도 침상))도 싣는다', HD.row);
    ok(HD.herd.length === 20 && cnt(HD.herd, N.b) === 6 && cnt(HD.herd, N.c) === 14 && HD.herd.slice(0, 6).every((x) => x === N.b) && HD.st.picks === 20 && HD.st.herdCut >= 1,
      '★⑫ 무리 — 같은 날 20명: 들은 곳간이 (들은 인구 + 6)까지만 먹이는 b(0.7)엔 앞 6명만 · 나머지 14명은 c(0.6) — 앞서 고른 수를 들은 인구에 더해 셈', { herd: HD.herd, st: HD.st });
    ok(HD.pBeds === N.c && HD.bedsNowB > 0, '⑬ 들은 침상이 찼으면(오늘은 비어도 — 모른다) 안 간다 → c', { got: HD.pBeds, bedsNow: HD.bedsNowB });
    ok(HD.pHeardLow === N.c && HD.pHeardHigh === N.b, '★⑭ 행복은 들은 줄 — b 오늘 0.9 · 들은 0.1 → 안 감(c) / 오늘 0.05 · 들은 0.95 → 감(b)', { low: HD.pHeardLow, high: HD.pHeardHigh });
    ok(HD.baitLines[0] === 2 && cnt(HD.simReal, N.b) === 6 && cnt(HD.simBaitA, N.b) === 20, '★미끼 ⓐ — 앞서 고른 수를 안 더한 사본은 20명을 모두 b 로 보낸다(빨강 · 진짜 6명)', { real: cnt(HD.simReal, N.b), bait: cnt(HD.simBaitA, N.b) });
    ok(HD.baitLines[1] >= 2 && HD.hiReal === true && HD.hiBaitB === false, '★미끼 ⓑ — 행복을 오늘 값으로 읽는 사본은 들은 행복 0.95 인 b 를 오늘 0.05 로 버린다(빨강)', { real: HD.hiReal, bait: HD.hiBaitB });
  }
  console.log('=== T1319 절(`T1319_RECV_K` · `T1319_AUTUMN_LOOK`) — 받는 곳 문에 K · 가을에 겨울 끝까지 ===');
  if (!K19 || K19.err || !(K19.vils >= 20) || !K19.src) ok(false, 'T1319 판이 안 섰다', K19);
  else {
    const N = K19.names, cnt = (arr, x) => arr.filter((y) => y === x).length;
    ok(K19.on19 === true && K19.aut === true && HD && HD.on12 === true, '⑯ 손잡이 — K 문은 T1312 켬 안 · 가을 문은 T1297 켬 안에서 `\'1\'` 만 켬');
    ok(K19.row.keys === 'K,beds,d,fe,h,n' && K19.row.K === 42.5, '⑰ 하루 한 줄에 그날 인구 식 부양력 K(econ `_dpDebug.K` — 인구 식이 쓴 바로 그 값)도 싣는다', K19.row);
    ok(K19.kHerd.length === 20 && cnt(K19.kHerd, N.b) === 6 && cnt(K19.kHerd, N.c) === 14 && K19.kHerd.slice(0, 6).every((x) => x === N.b) && K19.overK >= 14,
      '★⑱ K 를 넘는 마을로 안 간다 — 같은 날 20명: 들은 K = 들은 인구 + 6 인 b(0.7 · 곳간 · 침상 넉넉)엔 앞 6명만(무리 셈 포함) · 나머지 14명은 c', { herd: K19.kHerd, overK: K19.overK });
    ok(K19.kNull.length === 20 && K19.kNull.every((x) => x === N.b), '⑲ 들은 K 가 없으면(켜기 전 줄) K 문은 안 선다 — 곳간 · 침상 · 행복 문만(20명 모두 b)', { got: K19.kNull });
    ok(K19.kHeardFull === N.c && K19.kHeardRoom === N.b, '★⑳ K 는 들은 줄 — 들은 K 꽉 · 오늘 K 넉넉 → 안 감(c) / 들은 K 넉넉 · 오늘 K 꽉 → 감(b)', { full: K19.kHeardFull, room: K19.kHeardRoom });
    const nd = K19.need;
    ok(nd.aug31 === 30 && nd.sep1 === 181 && nd.sep1 === nd.leanSep1 && nd.nov30 === 91 && nd.nov30 === nd.leanNov30 && nd.dec1 === 90, '㉑ 가을 문 날 수 — 8월 31일 30(기근 문) · 9월 1일 181 · 11월 30일 91(다음 3월 1일까지 · 달력 정본) · 12월 1일 90(겨울 줄 그대로)', nd);
    ok(K19.autAug === true && K19.autSep === false, '★㉒ 가을 문이 겨울 끝까지 본다 — 들은 곳간 60일치: 8월 31일엔 간다 · 9월 1일엔(문턱 181일치) 안 간다', { aug31: K19.autAug, sep1: K19.autSep });
    ok(K19.kBaitLine >= 2 && K19.kReal === false && K19.kBait === true, '★미끼 ① — K 를 오늘 값으로 읽는 사본은 들은 K 가 꽉 찬 b 로 간다(빨강 · 진짜는 안 감)', { real: K19.kReal, bait: K19.kBait });
    ok(K19.autBaitLine === 1 && K19.autReal === false && K19.autBait === true && K19.autBaitNeed === 30, '★미끼 ② — 가을 문이 30일로 남은 econ 사본은 9월 1일에도 60일치 마을로 간다(빨강 · 진짜는 안 감)', { real: K19.autReal, bait: K19.autBait, need: K19.autBaitNeed });
  }
  if (!K19M || K19M.err || !(K19M.vils >= 20) || !K19M.src) ok(false, 'T1319 이주 문만 판이 안 섰다', K19M);
  else {
    const nb = K19M.need, nm = K19M.needMig;
    ok(K19M.aut === false && K19M.mig === true && nb.sep1 === 30 && nb.nov30 === 30 && nm.sep1 === 181 && nm.nov30 === 91 && nm.aug31 === 30 && nm.dec1 === 90 && K19M.autAug === true && K19M.autSep === false,
      '★㉓ `T1319_AUTUMN_LOOK=mig`(이주 문만) — 출생 문 날 수는 가을에도 30 · 이주 문 날 수는 9월 1일 181 · 11월 30일 91 — 60일치 마을에 8월 31일엔 가고 9월 1일엔 안 간다', { birth: nb, mig: nm, aug31: K19M.autAug, sep1: K19M.autSep });
  }
  console.log(`\n=== T1306 이주 문 + T1312 무리 절 + T1319 절: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
