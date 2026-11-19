// @regress
// === scripts/test-t1342-gate-home.js — T1342 문 앞에서 집으로(`T1342_GATE_HOME` · T1319 K 문 켬 안 · 끔 기본) ===
//   T1334 두 해 판의 둘째 해 K 위 죽음은 무리가 든 마을에서 났다 — 하루 이틀 사이 열둘 ~ 스물넷 마을에서 떠난 사람이 한 마을 문 앞에 닿아 K 의 두세 배가 됐다(T1342 §1).
//   켬 — 불행 이탈로 걸어온 사람이 받는 마을 문 앞에 닿은 날, 그 마을이 오늘 제 인구 식 K 를 넘으면(지금 사람 + 1 > K) 들지 않고 떠난 마을로 걸어 돌아간다(한 길에 한 번).
//   ① 손잡이 — 끔(빈 값)이면 `_t1342On` 거짓 · 사람이 K 를 넘어도 `_t1342Full` 거짓(문 없음) · T1319 K 문이 꺼져 있으면 `'1'` 이어도 안 선다
//   ② 문 앞 K — 켬: 지금 사람 + 1 > K 면 찼다(K = 사람 + 0.5) · 같으면 든다(K = 사람 + 1) · 넉넉하면 든다(K = 사람 + 5) · 인구 식이 안 돈 마을(K 없음)은 든다
//   ③ 집 길 — 떠난 마을까지 길(길이 > 0 · 하루 걸음 그대로) · 집이 비었으면 없다(null — 종전대로 든다)
//   ④ 닿기(도적 걷기 장부 · 운영 함수 `_t765Arrive` 그대로 · 호스트 꾸밈) — ⓐ 찬 마을 문 앞에 닿은 불행 이탈은 안 들고 집 길에 든다(장부 받는 곳 = 집 · 표지 · 셈) ·
//        ⓑ 집 문 앞에 닿으면 집이 K 를 넘어도 든다(한 길에 한 번) · ⓒ 안 찬 마을엔 든다 · ⓓ 해체 남은 사람(불행 이탈 아님)은 찬 마을에도 든다(문 밖) ·
//        ⓔ 저장 줄 · 복원이 집 길 표지를 잇는다(재기동 뒤 집 문 앞에서 또 안 돌린다)
//   ⑤ 돌아온 사람 소식 — 집 길에 문 앞에서 본 것(그 마을 · 그날 · 사람 수 · K)을 싣고 집에 닿으면 집 마을이 안다(`_t1342Seen`) · 집 마을이 아는 그 마을 줄(`_t1306Known` — 받는 곳 문이 읽는 들은 줄)은 그 소식이 더 새면 사람 수 · K 만 소식으로(곳간 · 행복 · 침상 · 날은 들은 줄) · 끔이면 안 얹는다
//   ★미끼 셋 — 닿기 문을 뺀 도적 사본(ⓐ 찬 마을에 든다 · 빨강) · 문 앞 K 를 침상으로 읽는 villages 사본(② K 가 차도 침상이 넉넉하면 든다 · 빨강) ·
//     소식을 얹는 줄을 뗀 들은 줄 사본 + 그 사본을 읽는 받는 곳 문(`_t1312Pass` 글 그대로 · ⑤ 찼다는 소식을 듣고도 간다 · 빨강)
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다(PM land1082)
if (process.env.T1334_BUNDLE === undefined) process.env.T1334_BUNDLE = '0';   // 묶음은 글자로 끔 — 이 하네스는 낱 글자를 제 env 로 가른다(켬 기본 가지에서도 빈 값 = 안 준 것)
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const ENV_ON = { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1', T1312_HERD: '1', T1319_RECV_K: '1', T1342_GATE_HOME: '1' };

if (process.argv[2] === '--child') {
  const mode = process.argv[3];
  const R = {};
  (async () => {
    const TMP = `/tmp/test-t1342-${process.pid}.db`;
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(44160 + (mode === 'on' ? 0 : mode === 'off' ? 1 : 2))), DB_PATH: TMP, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', LATENCY_MS: '0' });
    const _l = console.log, _w = console.warn, _e = console.error;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    require(path.join(ROOT, 'server', 'zone.js'));
    const SV = require(path.join(ROOT, 'server', 'villages.js'));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let vils = [];
    for (let i = 0; i < 600; i++) { await sleep(500); const cv = (SV.clientVillages && SV.clientVillages()) || []; vils = cv.map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ && v.econ.npcs.length); if (vils.length >= 20) break; }
    console.log = _l; console.warn = _w; console.error = _e;
    R.vils = vils.length; R.on = SV._t1342On();
    if (vils.length < 20) return out();
    const b = vils[1], src = vils[0], N = b.econ.npcs.length;
    const setK = (K) => { b.econ._dpDebug = Object.assign({}, b.econ._dpDebug || {}, { K }); };
    setK(N + 0.5); R.full05 = SV._t1342Full(b);
    setK(N + 1); R.full1 = SV._t1342Full(b);
    setK(N + 5); R.full5 = SV._t1342Full(b);
    b.econ._dpDebug = Object.assign({}, b.econ._dpDebug || {}); delete b.econ._dpDebug.K; R.fullNoK = SV._t1342Full(b);
    // ★미끼 ② — `_t1342Full` 글을 떼어 K 대신 침상(min(집 · 지도 침상))을 읽는 사본
    const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const i0 = VS.indexOf('function _t1342Full('), i1 = VS.indexOf('\n}\n', i0) + 2, body = VS.slice(i0, i1);
    const bait = body.replace("e && e._dpDebug && typeof e._dpDebug.K === 'number' && isFinite(e._dpDebug.K) ? e._dpDebug.K : null", 'e ? Math.min(e.housing !== undefined ? e.housing : Infinity, e._mapBeds !== undefined ? e._mapBeds : Infinity) : null');
    R.baitLine = bait !== body;
    const mkB = new Function('_t1342On', '_t1342Stat', bait + '\nreturn _t1342Full;')(SV._t1342On, { gate: 0, full: 0, back: 0, noHome: 0 });
    setK(N + 0.5); b.econ.housing = N + 20; b.econ._mapBeds = N + 20;
    R.realFullBeds = SV._t1342Full(b); R.baitFullBeds = mkB(b);
    // ③ 집 길
    const day = (b.econ._world && b.econ._world.day) | 0;
    const w = { t1075: 1, from: src.dbId, to: b.dbId, d0: day - 2, len: 1000, ppd: 400, pid: null };
    const H = SV._t1342Home(w, day); R.home = H ? { to: H.to === src.dbId, len: H.len > 0, ppd: H.ppd === 400 } : null;
    const sv0 = src.econ.npcs; src.econ.npcs = []; R.homeEmpty = SV._t1342Home(w, day); src.econ.npcs = sv0;
    // ⑤ 돌아온 사람 소식 — 집 길에 문 앞에서 본 것(그 마을 오늘 사람 수 · K)을 싣고 · 집에 닿으면 집 마을이 안다 · 받는 곳 문이 들은 줄보다 새면 그것으로 셈
    setK(N + 0.5);
    const w2 = { t1075: 1, from: src.dbId, to: b.dbId, d0: day - 2, len: 1000, ppd: 400, pid: null };
    SV._t1342Home(w2, day); R.seen = w2.t1342Seen ? { v: w2.t1342Seen.v === b.dbId, d: w2.t1342Seen.d === day, n: w2.t1342Seen.n === N, K: w2.t1342Seen.K === N + 0.5 } : null;
    delete src.econ._t1342Seen; SV._t1342Tell(w2, src);
    R.told = src.econ._t1342Seen && src.econ._t1342Seen[b.dbId] ? { d: src.econ._t1342Seen[b.dbId].d === day, n: src.econ._t1342Seen[b.dbId].n === N } : null;
    R.toldNew = !!SV._t1342Told(src, b, { d: day - 3 }); R.toldOld = SV._t1342Told(src, b, { d: day + 1 }) === null;
    // 받는 곳 문(`_t1312Pass`) — b 의 들은 줄은 넉넉(사람 적음 · K 큼 · 곳간 · 침상 · 행복 높음)
    const E1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
    const lag = (SV._t1306Known(src, b, day + 100) || {}).lag || 1;
    const setH = (v, h) => { v.econ.lastStats = Object.assign({}, v.econ.lastStats || {}, { happiness: h }); };
    setH(src, 0.05); setH(b, 0.9);
    const per = E1.DAILY_FOOD_CONSUMPTION * (E1.t1319MigNeedDays || E1.t1297NeedDays)(day);
    b.econ._t1306Fd = [{ d: day - lag, fe: (N + 50) * per * 2, n: 5, h: 0.9, beds: N + 100, K: N + 100 }];
    src.econ._t1342Seen = { [b.dbId]: { d: day - lag - 5, n: N, K: N + 0.5 } };   // 들은 줄보다 옛 소식
    R.passOld = SV._t1312Pass(src, b, day, 0.05) != null;
    src.econ._t1342Seen = { [b.dbId]: { d: day, n: N, K: N + 0.5 } };             // 들은 줄보다 새 소식 — 찼다
    R.passNew = SV._t1312Pass(src, b, day + 1, 0.05) != null;
    // 들은 줄(`_t1306Known`) — 더 새 소식이면 사람 수 · K 만 소식으로(곳간 · 행복 · 침상 · 날은 들은 줄 그대로) · 끔이면 들은 줄 그대로
    const kn = SV._t1306Known(src, b, day + 1) || {};
    R.knownNew = { n: kn.n, K: kn.K, nTold: kn.n === N, KTold: kn.K === N + 0.5, fe: kn.fe === (N + 50) * per * 2, h: kn.h === 0.9, beds: kn.beds === N + 100, d: kn.d === day - lag };
    // ★미끼 ⑤ — 들은 줄 글에서 소식을 얹는 줄을 뗀 사본 + 그 사본을 읽는 받는 곳 문(`_t1312Pass` 글 그대로)
    const sl = (name) => { const a = VS.indexOf('function ' + name + '('), z = VS.indexOf('\n}\n', a) + 2; return VS.slice(a, z); };
    const kb = sl('_t1306Known'), kbB = kb.replace('return _t1342On() ? _t1342Merge(fromVil, toVil, row) : row;', 'return row;');
    R.baitPassLine = kbB !== kb;
    const knB = new Function('state', '_t1342On', '_t1342Merge', kbB + '\nreturn _t1306Known;')({ ledger: { delayTo: () => lag } }, SV._t1342On, SV._t1342Merge);
    const mkP = new Function('state', '_t1312Stat', '_t1306Known', '_t1312PickedOf', '_t1319KOn', '_t1319Stat', sl('_t1312Pass') + '\nreturn _t1312Pass;')(
      { econ: E1 }, { seen: 0, ok: 0, unknown: 0, unhappy: 0, beds: 0, thin: 0, herdCut: 0, picks: 0, herdPicks: 0, lagSum: 0 }, knB, SV._t1312PickedOf, SV._t1319KOn, { overK: 0 });
    R.baitPassNew = mkP(src, b, day + 1, 0.05) != null;
    R.stat = SV.t1342Stat();
    out();
  })().catch((e) => { R.err = String(e && e.stack); out(); });
  function out() { console.log('@@T1342G ' + JSON.stringify(R)); process.exit(0); }
} else {
  const ch = (mode, env) => { try { const o = execFileSync(process.execPath, ['--experimental-sqlite', __filename, '--child', mode], { env: Object.assign({}, process.env, env), encoding: 'utf8', maxBuffer: 64 << 20 });
    const l = o.split('\n').find((x) => x.startsWith('@@T1342G ')); return l ? JSON.parse(l.slice(9)) : null; } catch (e) { return { err: String(e.message).slice(0, 300) }; } };
  console.log('=== T1342 문 앞에서 집으로(`T1342_GATE_HOME` · T1319 K 문 켬 안) ===');
  const ON = ch('on', ENV_ON);
  const OFF = ch('off', Object.assign({}, ENV_ON, { T1342_GATE_HOME: '' }));
  const NOK = ch('nok', Object.assign({}, ENV_ON, { T1319_RECV_K: '0' }));
  if (!OFF || OFF.err || !(OFF.vils >= 20)) ok(false, '끔 판이 안 섰다', OFF);
  else ok(OFF.on === false && OFF.full05 === false && OFF.full1 === false && OFF.stat.gate === 0, '① 끔(빈 값) — 문 없음: 사람 + 1 > K 여도 찼다고 안 한다 · 셈 0', { on: OFF.on, full05: OFF.full05, stat: OFF.stat });
  if (!NOK || NOK.err || !(NOK.vils >= 20)) ok(false, 'K 문 끔 판이 안 섰다', NOK);
  else ok(NOK.on === false && NOK.full05 === false, '① T1319 K 문이 꺼져 있으면 `T1342_GATE_HOME=1` 이어도 안 선다', { on: NOK.on, full05: NOK.full05 });
  if (!ON || ON.err || !(ON.vils >= 20)) ok(false, '켬 판이 안 섰다', ON);
  else {
    ok(ON.on === true, '① 손잡이 — T1319 K 문 켬 안에서 `\'1\'` 만 켬');
    ok(ON.full05 === true && ON.full1 === false && ON.full5 === false && ON.fullNoK === false, '② 문 앞 K — 지금 사람 + 1 > K 면 찼다(K = 사람 + 0.5) · 같으면(K = 사람 + 1) · 넉넉하면 든다 · K 없는 마을은 든다',
      { k05: ON.full05, k1: ON.full1, k5: ON.full5, none: ON.fullNoK });
    ok(ON.baitLine && ON.realFullBeds === true && ON.baitFullBeds === false, '★미끼 ② — 문 앞 K 를 침상으로 읽는 사본은 K 가 찬 마을을 침상이 넉넉하다고 들인다(빨강 · 진짜는 돌려보냄)', { real: ON.realFullBeds, bait: ON.baitFullBeds });
    ok(ON.home && ON.home.to && ON.home.len && ON.home.ppd && ON.homeEmpty === null, '③ 집 길 — 떠난 마을까지(길이 > 0 · 하루 걸음 그대로) · 집이 비었으면 없다(종전대로 든다)', { home: ON.home, empty: ON.homeEmpty });
    ok(ON.seen && ON.seen.v && ON.seen.d && ON.seen.n && ON.seen.K && ON.told && ON.told.d && ON.told.n && ON.toldNew && ON.toldOld,
      '⑤ 돌아온 사람 소식 — 집 길에 문 앞에서 본 것(그 마을 · 그날 · 사람 수 · K)을 싣고 집에 닿으면 집 마을이 안다 · 들은 줄보다 새 것만 쓴다', { seen: ON.seen, told: ON.told, newer: ON.toldNew, older: ON.toldOld });
    ok(ON.passOld === true && ON.passNew === false && ON.knownNew && ON.knownNew.nTold && ON.knownNew.KTold && ON.knownNew.fe && ON.knownNew.h && ON.knownNew.beds && ON.knownNew.d,
      '⑤ 받는 곳 문 — 들은 줄은 넉넉해도 그보다 새 "찼다" 소식이 있으면 안 간다(옛 소식이면 들은 줄대로 간다) · 들은 줄은 사람 수 · K 만 소식으로(곳간 · 행복 · 침상 · 날은 그대로)', { old: ON.passOld, newer: ON.passNew, known: ON.knownNew });
    ok(OFF && OFF.passNew === true && OFF.knownNew && OFF.knownNew.n === 5, '⑤ 끔 — 돌아온 사람 소식이 있어도 들은 줄 그대로(사람 5 · 종전 문대로 간다)', OFF ? { newer: OFF.passNew, n: OFF.knownNew && OFF.knownNew.n } : null);
    ok(ON.baitPassLine && ON.baitPassNew === true, '★미끼 ⑤ — 소식을 얹는 줄을 뗀 들은 줄 사본을 읽는 받는 곳 문은 찼다는 소식을 듣고도 간다(빨강 · 진짜는 안 감)', { bait: ON.baitPassNew });
  }
  // ④ 닿기 — 운영 `_t765Arrive` 를 호스트 꾸밈으로 부른다(부팅 없음)
  const arrive = (srcText, full) => {
    const fn = path.join(ROOT, 'server', 'bandits.js');
    const m = new Module(fn, module); m.filename = fn; m.paths = Module._nodeModulePaths(path.dirname(fn));
    m._compile(srcText, fn);
    const B = m.exports, P = B._t765Probe;
    const mk = (id, n) => ({ dbId: id, name: 'v' + id, ccx: id * 10, ccy: 0, econ: { npcs: Array.from({ length: n }, (_, i) => ({ id: `v${id}n${i}`, age: 30, currentJob: 'farmer' })), counts: { farmer: n } } });
    const home = mk(1, 20), gate = mk(2, 20), open = mk(3, 5);
    const told = [];
    const host = { villages: [home, gate, open], t1342Full: (v) => full.has(v.dbId), t1342Home: (w, d) => { if (w.from !== home.dbId) return null; w.t1342Seen = { v: w.to, d, n: 20, K: 19.5 }; return { to: home.dbId, len: 100, ppd: 100 }; },
      t1342Tell: (w, to) => { told.push([w.t1342Seen.v, to.dbId]); }, t765Join: () => false };
    const k = P.setHost(host, null); P.reset();
    const L = P.ledger();
    const npc = (i) => ({ id: 'w' + i, age: 20, currentJob: 'farmer' });
    L.push({ npc: npc(1), from: home.dbId, to: gate.dbId, d0: 0, len: 100, ppd: 100, pid: null, t1075: 1 });   // ⓐ 찬 마을로
    L.push({ npc: npc(2), from: home.dbId, to: open.dbId, d0: 0, len: 100, ppd: 100, pid: null, t1075: 1 });   // ⓒ 안 찬 마을로
    L.push({ npc: npc(3), from: home.dbId, to: gate.dbId, d0: 0, len: 100, ppd: 100, pid: null });             // ⓓ 해체 남은 사람(불행 이탈 아님)
    const r = { };
    P.arrive(1);
    const inGate = (id) => gate.econ.npcs.some((p) => p.id === id), inOpen = (id) => open.econ.npcs.some((p) => p.id === id), inHome = (id) => home.econ.npcs.some((p) => p.id === id);
    r.a = { joined: inGate('w1'), back: L.filter((w) => w.npc.id === 'w1').map((w) => ({ to: w.to, flag: w.t1342Home || 0, from: w.from })) };
    r.c = inOpen('w2'); r.d = inGate('w3'); r.st = (B._t765Probe && B.stats ? B.stats().t1342Back : null) || 0;
    const keep = JSON.parse(JSON.stringify(L.filter((w) => w.npc.id === 'w1').map((w) => ({ npc: w.npc, from: w.from, to: w.to, d0: w.d0, len: w.len, ppd: w.ppd, t1075: 1, t1342Home: w.t1342Home, t1342Seen: w.t1342Seen }))));
    full.add(home.dbId);                                      // ⓑ 집도 K 를 넘었다
    P.arrive(3);
    r.b = inHome('w1'); r.told = told.slice();
    // ⓔ 저장 · 복원(운영 `save` · `restore` — 저장소 꾸밈)
    let saved = null; P.setHost(host, { upsertBanditState: (z, s) => { saved = s; } });
    P.reset(); keep.forEach((w) => P.ledger().push(Object.assign({ pid: null }, w)));
    P.save(5);
    const S0 = saved ? JSON.parse(saved) : null;
    r.e = S0 && Array.isArray(S0.walk) ? S0.walk.map((w) => (w.t1342Home || 0) + (w.t1342Seen && w.t1342Seen.v === 2 ? 10 : 0)) : null;
    P.reset(); if (saved) P.restore({ data: saved });
    r.e2 = P.ledger().map((w) => (w.t1342Home || 0) + (w.t1342Seen && w.t1342Seen.v === 2 ? 10 : 0));
    P.setHost(k.host, k.db);
    return r;
  };
  const BS = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
  const G0 = BS.indexOf('    if (w.t1075 && !w.t1342Home && S.host.t1342Full'), G1 = BS.indexOf('    }\n', G0) + 6;
  const BAIT = G0 > 0 ? BS.slice(0, G0) + BS.slice(G1) : null;
  let A = null, AB = null;
  { const _l = console.log; console.log = () => {};   // 도적 걷기 줄 글(로그)은 안 보인다
    try { A = arrive(BS, new Set([2])); } catch (e) { A = { err: String(e && e.stack).slice(0, 400) }; }
    try { AB = BAIT ? arrive(BAIT, new Set([2])) : null; } catch (e) { AB = { err: String(e && e.stack).slice(0, 400) }; }
    console.log = _l; }
  if (!A || A.err) ok(false, '④ 닿기 판이 안 섰다', A);
  else {
    ok(A.a.joined === false && A.a.back.length === 1 && A.a.back[0].to === 1 && A.a.back[0].flag === 1 && A.a.back[0].from === 2, '④ⓐ 찬 마을 문 앞에 닿은 불행 이탈은 안 든다 — 장부 받는 곳 = 집 · 집 길 표지 · 문 앞에서 떠남', A.a);
    ok(A.b === true && A.told.length === 1 && A.told[0][0] === 2 && A.told[0][1] === 1, '④ⓑ 집 문 앞에선 집이 K 를 넘어도 든다(한 길에 한 번) · 든 날 본 것을 집 마을에 전한다', { b: A.b, told: A.told });
    ok(A.c === true && A.d === true, '④ⓒ 안 찬 마을엔 든다 · ⓓ 해체 남은 사람은 찬 마을에도 든다(문 밖)', { c: A.c, d: A.d });
    ok(Array.isArray(A.e) && A.e.length === 1 && A.e[0] === 11 && A.e2.length === 1 && A.e2[0] === 11, '④ⓔ 저장 줄 · 복원이 집 길 표지 · 문 앞에서 본 것을 잇는다', { saved: A.e, restored: A.e2 });
  }
  ok(BAIT && AB && !AB.err && AB.a.joined === true, '★미끼 ④ — 닿기 문을 뺀 도적 사본은 찬 마을에 든다(빨강 · 진짜는 집으로)', AB && AB.a);
  console.log(`\n=== T1342 문 앞에서 집으로: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
