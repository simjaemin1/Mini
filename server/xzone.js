'use strict';
// =============================================================================
// server/xzone.js — 존 경계 호스트 (T533 · 2026-09-30 · 세션3 · ★PM 결정 #456)
//
// ★무엇: econ 팔 `T525_CROSS_ZONE`(econ 이 `world.xzone` 을 읽는다 — T525 뼈대)에 **꽂을 것**을 세운다.
//   ① 경계 마을 — 이웃 존 어느 마을이든 걸어 2km(econ `infoRange`) 안인 마을(T525 §2 의 52·77 쌍)
//   ② 합친 걸음표 — 두 존 사각을 합친 지형의 정본 교역 BFS + 정본 교역로(`server/xzone-geo.js` · 워커 스레드 ·
//      기동 뒤 백그라운드 · 자 12~76 초 · 서버 60~120 초(경합 따라)). **표가 오기 전엔 `world.xzone` 을 안 꽂는다 = 끔과 같다**(스텁 0).
//   ③ 스텁 — 이웃이 **민** 경계 마을 스냅(6KB · 하루 한 번) · 시효 하루(econ 이 잰다 · 받는 존의 날로)
//   ④ 기록 줄 — 이웃이 민 몸 기록('arrive'·'return')을 **받은 그 자리에서** 줄에 세운다(토큰 0 · central 왕복 0) —
//      econ 이 읽는 것은 **보낸 경계 다음 경계**다(두 존 마감 순서에 안 달린다 · T525 §4 자의 "하루 늦음" 그 뜻).
// ★문 = `/handoff_prepare` 의 `kind`(`caravan`·`snap` · 새 라우트 0 · 안 문 `CENTRAL_SECRET`·호스트 표 `ZONE_HOSTS` 그대로 — zone.js).
// ★값은 가진 존이 **민다**(묻지 않는다). 이웃 목록 = `zone-config` `publicZoneMap` 의 동서남북(새 표 0 · 바다 존 제외).
// ★한 벌: 핵심(`createCore` — 세계 쪽)은 존 서버(`villages.js`)와 자(`scripts/t525-cross-zone.js two`)가 **같이** 쓴다(사본 0).
//   몸(캐러밴 실체)은 존 서버만 안다 — `villages.js` 가 이 핵심의 앞뒤에서 몸을 지우고 세운다.
// ★새 수 0: 거리 문턱 = econ `infoRange` · 시효 = econ 하루 · 걸음표 = 정본 BFS · 경계 칸 = 존 사각 그대로.
// =============================================================================
const path = require('path');

// ── 핵심 — `world.xzone` 을 세우고 하루 두 번(econ 앞 `dayIn` · 뒤 `dayOut`) 맞춘다 ─────────────────────
//   o = { zone, world, econV2, infoR }
//   경계(`g`)는 **절대 게임일**(`floor((now − worldEpoch) / dayMs)` — 존마다 같은 수)이다. 기록·스냅이 그 수를 싣는다.
function createCore(o) {
  const zone = o.zone, world = o.world, econV2 = o.econV2, infoR = o.infoR;
  const G = new Map();          // 이웃 존 → { flip, dist, split, mine:Set(내 경계 마을), theirs:Set(그쪽 경계 마을), n }
  const SN = new Map();         // 이웃 존 → [{ gday, snaps }](최근 셋 — 경계 순서가 흔들려도 "지난 경계"의 것을 고른다)
  const pend = [];              // 받은 기록 [{ gday, rec, seq }]
  let seq = 0;
  const st = { arriveOut: 0, returnOut: 0, arriveIn: 0, returnIn: 0, snapIn: 0, snapOut: 0, stubs: 0, stubsFresh: 0, pend: 0 };

  const _pair = (a, b) => {   // → [제 마을, 스텁] (둘 다 스텁이거나 둘 다 제 마을이면 null)
    if (a && a._xz && !(b && b._xz)) return [b, a];
    if (b && b._xz && !(a && a._xz)) return [a, b];
    return null;
  };
  function distNames(local, peer, pn) {
    const g = G.get(peer); if (!g) return null;
    const r = g.flip ? g.dist[pn] : g.dist[local];
    const d = r ? (g.flip ? r[local] : r[pn]) : null;
    return (d == null) ? null : d;
  }
  // 경계 칸·길 — 합친 길이 제 존을 **마지막으로** 나가는 자리. `ptsLocal` = 제 마을 → 경계 칸(제 존 로컬 px).
  function splitNames(local, peer, pn) {
    const g = G.get(peer); if (!g) return null;
    if (!g.flip) { const s = g.split[local] && g.split[local][pn]; return s ? { fLocal: s.fA, ptLocal: s.ptA, ptPeer: s.ptB, ptsLocal: s.ptsA } : null; }
    const s = g.split[pn] && g.split[pn][local];
    return s ? { fLocal: 1 - s.fA, ptLocal: s.ptB, ptPeer: s.ptA, ptsLocal: s.ptsB.slice().reverse() } : null;
  }
  const X = {
    zone, stubs: [], out: [], inbox: [],
    dist(a, b) { const p = _pair(a, b); if (!p) return Infinity; const d = distNames(p[0].name, p[1].zone, p[1].name); return (d == null) ? Infinity : d; },
    split(a, b) { const p = _pair(a, b); if (!p) return null; const s = splitNames(p[0].name, p[1].zone, p[1].name); return s ? { fLocal: s.fLocal, ptLocal: s.ptLocal, ptPeer: s.ptPeer } : null; },
  };

  // 합친 걸음표가 왔다(`xzone-geo.crossGeo` 의 답 · 두 존 이름 순서 A<B 로 잰 한 벌 — 두 존이 같은 표를 갖는다)
  function setGeo(peer, r) {
    const flip = (r.A !== zone);
    const mine = new Set(), theirs = new Set();
    let n = 0, noSplit = 0;
    for (const a in r.dist) for (const b in r.dist[a]) {
      const d = r.dist[a][b];
      if (d != null && d <= infoR) {
        n++; if (flip) { mine.add(b); theirs.add(a); } else { mine.add(a); theirs.add(b); }
        if (!(r.split && r.split[a] && r.split[a][b])) noSplit++;   // 2km 안인데 합친 길(A*)이 예산 안에 못 찾은 쌍 — 몸 없이 econ 만 간다
      }
    }
    G.set(peer, { flip, dist: r.dist, split: r.split, mine, theirs, n, noSplit, ms: r.ms, routed: r.routed, failed: r.failed });
    world.xzone = X;   // ★표가 선 뒤에만 꽂는다(그 전엔 econ 이 `world.xzone` 을 못 본다 = 끔과 같다)
    return { pairs: n, mine: mine.size, theirs: theirs.size, noSplit };
  }
  function onSnap(peer, m) {
    st.snapIn++;
    const L = SN.get(peer) || [];
    if (!L.some((x) => x.gday === m.gday)) L.push({ gday: m.gday, snaps: Array.isArray(m.snaps) ? m.snaps : [] });
    L.sort((p, q) => p.gday - q.gday); while (L.length > 3) L.shift();
    SN.set(peer, L);
  }
  function onRecord(m) {
    const r = m && m.rec; if (!r || (r.kind !== 'arrive' && r.kind !== 'return')) return false;
    pend.push({ gday: Math.floor(+m.gday || 0), rec: r, seq: seq++ });   // ⚠`| 0` 금지 — 짧은 하루(테스트)면 절대 게임일이 2^31 을 넘는다
    if (r.kind === 'arrive') st.arriveIn++; else st.returnIn++;
    return true;
  }
  // econ 앞 — 스텁(지난 경계에 이웃이 민 것)과 기록(지난 경계까지 보낸 것)을 꽂는다. world.day = 어제(econ 머리가 올린다).
  function dayIn(g, adjust) {
    const stubs = [];
    let fresh = 0;
    for (const [peer, L] of SN) {
      if (!G.has(peer)) continue;
      let s = null; for (const x of L) if (x.gday <= g - 1) s = x;   // 오늘 경계에 민 것은 내일 것(마감 순서 무관)
      if (!s) continue;
      const age = (g - 1) - s.gday;                                 // 0 = 어제 민 것(신선) · 시효는 econ 이 `_xzDay` 로 잰다
      const xd = world.day - age;
      if (age === 0) fresh += s.snaps.length;
      for (const sn of s.snaps) stubs.push(econV2.xzoneStub(sn, peer, { _xzDay: xd }));
    }
    X.stubs = stubs; st.stubs = stubs.length; st.stubsFresh = fresh;
    pend.sort((p, q) => (p.gday - q.gday) || (p.seq - q.seq));
    let k = 0; while (k < pend.length && pend[k].gday < g) k++;
    for (const p of pend.splice(0, k)) { if (adjust) adjust(p.rec); X.inbox.push(p.rec); }
    st.pend = pend.length;
  }
  // econ 뒤 — 나간 기록 · 경계 마을 스냅(이웃마다 그쪽 경계에 닿는 제 마을만)
  function dayOut(g) {
    const recs = X.out.splice(0);
    for (const r of recs) { if (r.kind === 'arrive') st.arriveOut++; else st.returnOut++; }
    const snaps = {};
    for (const [peer, geo] of G) {
      const list = [];
      for (const v of world.villages) if (geo.mine.has(v.name)) list.push(econV2.xzoneSnapshot(v, world.day, false));
      snaps[peer] = list; st.snapOut += list.length;
    }
    return { recs, snaps };
  }
  // ★[T598 추신 2026-10-03] **관측 칸** — 기록이 지금 어느 칸에 서 있나(종류별). 값은 안 고친다(읽기만 · 제품 동작 0).
  //   받은 기록의 길: `pend`(onRecord) → `X.inbox`(dayIn · econ 캐러밴 조각이 읽기 전) → econ 캐러밴 → `X.out`(econ 이 적고 dayOut 이 세기 전) → `st.*Out`.
  //   하루 마감은 조각으로 여러 프레임에 걸치므로 `/perf` 가 dayIn 과 econ 사이 · econ 과 dayOut 사이에 닿을 수 있다 — 그 두 칸을 센다.
  //   (`st.pend` 는 dayIn 순간의 값이라 그 뒤 받은 기록을 못 본다 — 여기 `pendArrive/pendReturn` 은 지금 값.)
  function live() {
    const o = { pendArrive: 0, pendReturn: 0, inboxArrive: 0, inboxReturn: 0, outArrive: 0, outReturn: 0 };
    for (const p of pend) if (p.rec.kind === 'arrive') o.pendArrive++; else o.pendReturn++;
    for (const r of X.inbox) if (r.kind === 'arrive') o.inboxArrive++; else if (r.kind === 'return') o.inboxReturn++;
    for (const r of X.out) if (r.kind === 'arrive') o.outArrive++; else if (r.kind === 'return') o.outReturn++;
    return o;
  }
  return { X, G, SN, pend, st, live, setGeo, onSnap, onRecord, dayIn, dayOut, distNames, splitNames,
    ready: () => G.size > 0, peersReady: () => [...G.keys()] };
}

// ── 존 서버 겉 — 이웃 목록 · 걸음표 워커 · 미는 문 ────────────────────────────────────────────────
//   o = { zone, core, rosterOf: () => [{ name, cx, cy }], post: (peer, payload) => Promise, log }
function neighborsOf(zone) {
  const ZC = require('./zone-config');
  const m = ZC.publicZoneMap();
  const me = m[zone]; if (!me) return [];
  const out = [];
  for (const id of [me.north, me.south, me.east, me.west]) if (id && id !== zone && m[id] && !m[id].isOcean && !out.includes(id)) out.push(id);
  return out;
}
function createHost(o) {
  const zone = o.zone, core = o.core, log = o.log || (() => {});
  const peers = neighborsOf(zone);
  const W = new Map();   // 이웃 → { sig, running, want, done }
  const hs = { peers, geo: {}, postOk: 0, postFail: 0, snapPush: 0, rosterIn: {}, rosterSent: {} };
  const sigOf = (ros) => JSON.stringify((ros || []).map((v) => [v.name, v.cx, v.cy]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  // 이웃 명부가 왔다 — 걸음표가 없거나 명부가 바뀌었으면 워커로 잰다(한 이웃에 한 번에 하나 · 틱을 안 막는다)
  function onRoster(peer, roster) {
    if (!peers.includes(peer) || !Array.isArray(roster) || !roster.length) return;
    hs.rosterIn[peer] = roster.length;
    const mine = o.rosterOf();
    if (!mine.length) return;
    const sig = sigOf(mine) + '|' + sigOf(roster);
    const w = W.get(peer) || { sig: null, running: false, want: null };
    W.set(peer, w);
    if (w.sig === sig || (w.want && w.want.sig === sig)) return;
    w.want = { sig, mine, roster };
    if (!w.running) _run(peer, w);
  }
  function _run(peer, w) {
    const job = w.want; w.want = null; if (!job) return;
    w.running = true;
    const A = zone < peer ? zone : peer, B = zone < peer ? peer : zone;   // 두 존이 같은 순서로 잰다 ⇒ 같은 표
    const q = { A, B, rosterA: A === zone ? job.mine : job.roster, rosterB: A === zone ? job.roster : job.mine, coast: true };
    const t0 = Date.now();
    let Worker; try { ({ Worker } = require('worker_threads')); } catch (e) { w.running = false; log(`걸음표 워커 없음: ${e.message}`); return; }
    const os = require('os');
    const tmpDb = path.join(os.tmpdir(), `xzone-geo-${process.pid}-${peer}-${Date.now()}.db`);
    let wk;
    try {
      wk = new Worker(path.join(__dirname, 'xzone-geo.js'), { workerData: { xzoneGeo: q },
        env: Object.assign({}, process.env, { ENABLE_VILLAGES: '0', DB_PATH: tmpDb }), stdout: true, stderr: true });
    } catch (e) { w.running = false; log(`걸음표 워커 실패(${peer}): ${e.message}`); return; }
    wk.stdout.resume(); wk.stderr.resume();   // 워커 안 소음은 버린다(모듈 적재 로그 — 정본이 말하는 것)
    let got = false;
    const done = () => { w.running = false; for (const s of ['', '-wal', '-shm']) { try { require('fs').unlinkSync(tmpDb + s); } catch (e) {} } if (w.want) _run(peer, w); };
    wk.on('message', (m) => {
      got = true;
      if (m && m.ok) {
        const r = core.setGeo(peer, m.r);
        w.sig = job.sig;
        hs.geo[peer] = { pairs: Object.keys(m.r.dist || {}).reduce((a, k) => a + Object.keys(m.r.dist[k]).length, 0), within: r.pairs, withinNoRoute: r.noSplit, mine: r.mine, theirs: r.theirs,
          routed: m.r.routed, failed: m.r.failed, bfsMs: m.r.ms && m.r.ms.bfs, routeMs: m.r.ms && m.r.ms.route, wallMs: Date.now() - t0 };
        log(`경계 걸음표 ${A}+${B} — 쌍 ${hs.geo[peer].pairs} · 걸어 2km 안 ${r.pairs}(그중 합친 길 못 판 ${r.noSplit}) · 경계 마을 이쪽 ${r.mine} · 저쪽 ${r.theirs} · 길 ${m.r.routed}(못 판 ${m.r.failed}) · BFS ${(m.r.ms.bfs / 1000).toFixed(1)}s · 길 ${(m.r.ms.route / 1000).toFixed(1)}s(워커 · 틱 안 막음)`);
      } else log(`걸음표 실패(${peer}): ${m && m.err}`);
      try { wk.terminate(); } catch (e) {}   // 답을 받았으면 워커를 닫는다(지형·길 격자 메모리를 존에 남기지 않는다)
    });
    wk.on('error', (e) => { log(`걸음표 워커 오류(${peer}): ${e && e.message}`); });
    wk.on('exit', () => { if (!got) log(`걸음표 워커가 답 없이 끝났다(${peer})`); done(); });
  }
  // 받는 문 — zone.js `/handoff_prepare` 의 `kind` 갈래가 부른다(snap). caravan 은 몸을 아는 villages.js 가 먼저 본다.
  function onSnapMsg(data) {
    const peer = data.zone;
    if (!peers.includes(peer)) return { ok: false, why: 'not-neighbor' };
    if (!data.rosterOnly) core.onSnap(peer, data);   // 명부만 온 것(기동 · 되받이)은 스냅이 아니다(그 경계의 스냅 자리를 비우지 않는다)
    onRoster(peer, data.roster);
    if (!hs.rosterSent[peer]) pushRoster(data.gday, peer);   // 이웃이 내 명부를 아직 못 받았다(내가 먼저 떴을 때) — 받은 그 자리에서 되민다
    return { ok: true };
  }
  function _push(peer, payload) {
    Promise.resolve().then(() => o.post(peer, payload))
      .then((r) => { if (r && r.ok) { hs.snapPush++; hs.rosterSent[peer] = true; } else hs.postFail++; })
      .catch(() => { hs.postFail++; });
  }
  // 명부만 — 기동 때 한 번 · 이웃이 먼저 민 명부를 받았는데 내 것을 아직 못 보냈을 때
  function pushRoster(g, only) {
    const roster = o.rosterOf();
    for (const peer of peers) if (!only || peer === only) _push(peer, { kind: 'snap', zone, gday: g, roster, snaps: [], rosterOnly: true });
  }
  // 미는 문 — 하루 한 번(econ 뒤): 명부(걸음표를 잴 재료 — 작다)와 경계 마을 스냅
  function pushSnaps(g, snaps) {
    const roster = o.rosterOf();
    for (const peer of peers) _push(peer, { kind: 'snap', zone, gday: g, roster, snaps: (snaps && snaps[peer]) || [] });
  }
  return { peers, hs, onRoster, onSnapMsg, pushSnaps, pushRoster, W };
}

module.exports = { createCore, createHost, neighborsOf };
