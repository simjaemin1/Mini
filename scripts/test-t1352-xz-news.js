#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1352-xz-news.js — 소식이 번지는 길(T1352 · 손잡이 `T1352_NEWS_LOCAL` ⓐ · `T1352_NEWS_SEAM` ⓑ · 기본 끔) ==========
//
// ★왜(T1352 할 일 2 · 7): 이웃 존으로 떠나는 사람은 이웃 존 마을을 **들은 만큼만** 안다(T1324 — 그 집 캐러밴이 실어 온 줄).
//   ⓐ 같은 존 소문 — 마을 A 가 들은 줄은 같은 존 마을 V 에 "A 가 들은 날 + T7 도달 일수(`ledger.delayTo`)"에 닿는다(먼저 알면 소식 텔레포트 · 늦으면 소문이 아니다).
//   ⓑ 이음매 소문 — 이웃 존 경계 마을 그날 줄이 스냅에 실려 "경계 g + T7 일수(`rumor.travelDaysOf(합친 걸음표 거리)`)"에 닿는다(ⓐ 켬이면 같은 존 다른 마을을 거쳐 더 빨리).
//   끔 = T1324 그대로(받는 곳 고르기는 제 줄만 · 스냅 · 'return' 줄 글자 그대로).
// 판(운영 함수 그대로 — `xzoneReceive`(캐러밴 'return' · 스냅 받는 문) · `__t1324Probe.pick/depart/news` · `__t1352Probe.known/dayOut`): 아이 하나 = 존 한 벌(villages.js)을
//   손잡이 다섯 꼴(끔 · ⓐ · ⓑ · ⓐ+ⓑ · ⓐ+ⓑ+T7 끔)로 띄워 같은 이야기를 돌린다 — 마을 셋(V 떠나는 마을 · A 캐러밴 집 · U 이음매 곁) · T7 일수 V–A 2 · V–U 1 · A–U 1.
//   A 묶음(ⓐ): A1 A 가 D0 에 들은 줄 — V 는 D0+1 에 모른다 · A2 D0+2 에 안다(켬만 고른다) · A3 떠남 줄에 소식 길 · 나이 ·
//     A4 A 가 더 새 줄(행복 낮음)을 D0+3 에 들어도 V 는 D0+4 에 앞 줄을 안다(잊음 0) · A5 D0+5 에 새 줄 · A6 고리 — 다 번진 줄보다 낡은 줄은 버린다
//   B 묶음(ⓑ): B1 경계 g 스냅 줄은 g 에선 모른다 · B2 g+1 에 안다(켬만 고른다) · B3 먼 마을 Y(곧장 4일)는 U(1일)+V–U(1일)로 g+2 에(ⓐ+ⓑ 만) ·
//     B4 곧장은 g+4 에 · B5 같은 날이면 제 줄 · 더 새 날이면 이음매 줄 · B6 보내는 쪽 스냅 줄(켬만 · 끔 = 칸 없음) · B7 'return' 줄 경계 수(켬만)
//   C 묶음: C1 끔 = 셈 0 · 고리 칸 0 · 받는 쪽 고리 0
//   미끼(이 파일 안 · 소스 자리가 꼭 한 번인지 센다 · 빨강이 될 줄을 단언): ㉠ ⓐ 일수 0 → {A1, A2, A3, A4}(먼저 안다 · 안 날이 들은 날) · ㉡ 고리 지움(잊음) → {A4, A6} ·
//     ㉢ 이음매 일수 무시 → {B1} · ㉣ ⓐ 기본 켬(끔 판에서) → {A0, A1, A2, A3, A4, A5, A6, B5, B7, C1}(끔 판이 켬처럼 돈다)
// ★날짜 · 벽시계 0 — `Date.now` 는 판 시계(고정 원점 + 하루 × 날)로 바꿔 끼운다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { fork } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  lag0: { mode: 'LS', red: ['A1', 'A2', 'A3', 'A4'], at: ["lag = L.delayTo(vil.dbId, A.dbId); if (!isFinite(lag)) continue; }", "lag = 0; }   // 미끼 ㉠"] },
  forget: { mode: 'LS', red: ['A4', 'A6'], at: ["  R.push(line); _t1352Stat.hist++;", "  R.length = 0; R.push(line); _t1352Stat.hist++;   // 미끼 ㉡"] },
  seamlag: { mode: 'LS', red: ['B1'], at: ["if (R[i].g <= g - lag) { row = R[i]; break; }", "if (R[i].g <= g) { row = R[i]; break; }   // 미끼 ㉢"] },
  defon: { mode: 'off', red: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B5', 'B7', 'C1'], at: ["const T1352_NEWS_LOCAL = T1324_XZ_MIGRATE && process.env.T1352_NEWS_LOCAL === '1';",
    "const T1352_NEWS_LOCAL = T1324_XZ_MIGRATE && process.env.T1352_NEWS_LOCAL !== '0';   // 미끼 ㉣"] },
};
const MODES = {
  off: {},
  L: { T1352_NEWS_LOCAL: '1' },
  S: { T1352_NEWS_SEAM: '1' },
  LS: { T1352_NEWS_LOCAL: '1', T1352_NEWS_SEAM: '1' },
  LS_OFF: { T1352_NEWS_LOCAL: '1', T1352_NEWS_SEAM: '1', RUMOR_OFF: '1' },
};

// ── 아이 — 존 하나(villages.js 한 벌) · 이야기 한 판 → 줄마다 { id, ok, msg, got } ─────────────────────────────
if (process.argv[2] === '--child') {
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const out = [];
  const ck = (id, c, msg, got) => out.push({ id, ok: !!c, msg, got: got === undefined ? '' : JSON.stringify(got) });
  try {
    if (bait) {
      const old = Module._extensions['.js'];
      Module._extensions['.js'] = function (m, f) {
        if (f !== VFILE) return old(m, f);
        const src = fs.readFileSync(f, 'utf8'), n = src.split(bait.at[0]).length - 1;
        if (n !== 1) { process.send({ t: 'err', err: `미끼 자리가 한 번이 아니다(${n}번): ${bait.at[0].slice(0, 70)}` }); process.exit(3); }
        m._compile(src.replace(bait.at[0], bait.at[1]), f);
      };
    }
    const env = process.env, L = env.T1352_NEWS_LOCAL === '1', SE = env.T1352_NEWS_SEAM === '1', OFF = env.RUMOR_OFF === '1';
    const on = L || SE, l = L && !OFF, s = SE && !OFF;
    const ZONE = 'hanbando', PEER = 'nippon';
    const logs = [];
    const mute = (fn) => { const a = console.log, b = console.warn; console.log = (...x) => logs.push(x.join(' ')); console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
    const V = require(VFILE), E1 = require(path.join(ROOT, 'sim', 'economy-sim')), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
    const H = V.__p3Bind({}), S = H.state, P = V.__t1324Probe, Q = V.__t1352Probe || null;
    const M = 240000, G0 = 4800, D0 = 100, E0 = 1.6e12;
    let CLK = E0 + (G0 + 0.3) * M; Date.now = () => CLK;
    const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
    w.day = D0; w.caravans = [];
    const [a, b, c] = w.villages;
    for (const e of [a, b, c]) { e.lastStats = Object.assign({}, e.lastStats, { happiness: 0.1 }); e.housing = 999; e._mapBeds = 999; e.storage.food = Math.max(e.storage.food || 0, 5000); }
    a.lastStats.happiness = 0.2;   // V — 떠나는 마을(같은 존 둘은 더 불행 — 받는 곳은 이웃 존뿐)
    const vV = { dbId: 1, name: 'A마을1', ccx: 10, ccy: 10, npcPids: [], econ: a, housesPx: [] };
    const vA = { dbId: 2, name: 'A마을2', ccx: 30, ccy: 10, npcPids: [], econ: b, housesPx: [] };
    const vU = { dbId: 3, name: 'A마을3', ccx: 10, ccy: 30, npcPids: [], econ: c, housesPx: [] };
    a.name = vV.name; b.name = vA.name; c.name = vU.name;
    const DL = { '1|2': 2, '1|3': 1, '2|3': 1 };   // T7 도달 일수(대칭 · 그 표의 꼴)
    const DN = { 'A마을1|X': 1200, 'A마을2|X': 1200, 'A마을3|X': 1200, 'A마을1|Y': 30000, 'A마을2|Y': 30000, 'A마을3|Y': 1200 };   // 합친 걸음표 거리(econ) — 1200 = 1일 · 30000 = 4일(T7 식)
    let pushed = null;
    Object.assign(S, { zoneId: ZONE, world: w, ready: true, dayMs: M, lastGameDay: G0, epoch: E0, tickJobs: null, villages: [vV, vA, vU], byDbId: new Map([[1, vV], [2, vA], [3, vU]]),
      byEcon: new Map([[a, vV], [b, vA], [c, vU]]), econ: E1, econV2: E2, caravanBodies: new Map(), bodyExits: new Map(),
      ledger: { delayTo: (x, y) => (x === y ? 0 : (DL[x + '|' + y] != null ? DL[x + '|' + y] : (DL[y + '|' + x] != null ? DL[y + '|' + x] : Infinity))), cfg: { PRICE_WIN: 30 } },
      deps: { players: new Map(), npcs: new Map(), moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {}, xzonePost: () => new Promise(() => {}) } });
    S.xzone = { st: { sent: 0, sentOk: 0, sentFail: 0, bounced: 0, retried: 0, dup: 0, bodyOut: 0, crossArrive: 0, crossReturn: 0, deposited: 0, lost: 0, bodyInSkip: 0 }, track: new Map(), trace: [], retry: [], seen: new Set(), seenQ: [],
      host: { peers: [PEER], pushSnaps: (g, snaps) => { pushed = { g, snaps }; }, onSnapMsg: () => ({ ok: true }) },
      core: { G: new Map([[PEER, { mine: new Set([vV.name, vA.name, vU.name]) }]]), infoR: 5000, pend: [], X: { stubs: [], out: [], inbox: [] },
        dayOut: () => ({ recs: [], snaps: { [PEER]: [{ name: vA.name, n: b.npcs.length }] } }),
        distNames: (local, peer, pn) => (DN[local + '|' + pn] == null ? null : DN[local + '|' + pn]),
        splitNames: () => ({ ptLocal: { x: 4000, y: 700 }, ptPeer: { x: 0, y: 700 }, ptsLocal: [{ x: 400, y: 700 }, { x: 4000, y: 700 }] }),
        onRecord: function (m) { this.pend.push({ gday: m.gday, rec: m.rec, seq: this.pend.length }); return true; } } };
    const step = (n) => { for (let i = 0; i < n; i++) { w.day++; CLK += M; S.lastGameDay++; } };
    const pick = () => { const d = mute(() => P.pick(vV)); return d ? (d._t1324 ? 'X:' + d.name + '@' + d.zone : 'local:' + d.name) : null; };
    const known = () => (Q ? mute(() => Q.known(vV, w.day)) : undefined);
    let cid = 100;
    const hear = (econ, row, remain) => { const id = ++cid; w.caravans.push({ id, from: econ, to: { name: row.name, zone: PEER, _xz: true }, state: 'xzone', departDay: w.day - 2 });
      return mute(() => V.xzoneReceive({ kind: 'caravan', zone: PEER, gday: S.lastGameDay, rec: { kind: 'return', id, toZone: ZONE, returningRes: 'food', returningAmt: 1, remain, lastTo: row.name, t1324: row } })); };
    const snapIn = (g, rows) => mute(() => V.xzoneReceive({ kind: 'snap', zone: PEER, gday: g, roster: [], snaps: rows.map((r) => ({ name: r.name, n: r.n, storage: {}, prices: {}, day: r.d,
      t1352: { d: r.d, g, fe: r.fe, n: r.n, h: r.h, beds: r.beds } })) }));
    const KX = PEER + '|X', KY = PEER + '|Y';
    const row = (o) => Object.assign({ name: 'X', fe: 1e5, n: 10, h: 0.9, beds: 100 }, o);

    // ── A 묶음 — 같은 존 소문(ⓐ) ────────────────────────────────────────────
    ck('A0', !!Q && Q.on() === on, `[전제] 손잡이 꼴 — 소식 길 켬 = ${on}(ⓐ ${L} · ⓑ ${SE} · T7 끔 ${OFF})`, Q ? Q.on() : '탐침 없음');
    const r1 = hear(b, row({ d: 50, g: G0 - 3 }), 0);   // A 가 D0 에 듣는다(상인이 오늘 집에 닿음 — 남은 날 0)
    step(1);
    { const p = pick(), k = known();
      ck('A1', r1 && r1.ok && p === null && (on ? (k && Object.keys(k).length === 0) : k === null), 'A1 A 가 D0 에 들은 줄 — D0+1 엔 V 가 모른다(T7 V–A 2일 · 먼저 알면 소식 텔레포트)', { p, k: k && Object.keys(k) }); }
    step(1);
    let dest = null;
    { dest = mute(() => P.pick(vV)); const p = dest ? (dest._t1324 ? 'X:' + dest.name : 'local') : null, k = known();
      ck('A2', l ? (p === 'X:X' && k && k[KX] && k[KX].via === 'local' && k[KX].src === 2 && k[KX].kat === D0 + 2) : p === null,
        `A2 D0+2 — ${l ? 'V 가 안다(같은 존 소문 · 안 날 = D0 + 2) → 이웃 존 X 를 고른다' : '켬(ⓐ · T7)이 아니면 V 는 끝까지 모른다(제 줄 없음)'}`, { p, k: k && k[KX] ? { via: k[KX].via, src: k[KX].src, kat: k[KX].kat } : (k === null ? null : 0) }); }
    { let okd = false; const n0 = logs.length;
      if (dest && dest._t1324) okd = mute(() => P.depart(vV, a.npcs[a.npcs.length - 1], dest, w.day));
      const line = logs.slice(n0).find((x) => x.includes('[T1324] 이주') && x.includes('떠남')) || '';
      const st = Q ? Q.stat() : {};
      ck('A3', l ? (okd && line.includes('소식 local(A마을2) 나이 5날 · 안 날 102') && line.includes('들은 줄 50날') && st.pickLocal === 1 && st.ageN === 1 && st.ageMax === 5)
        : (!okd && !line && (!Q || (st.pickLocal | 0) === 0)), `A3 ${l ? '떠남 줄 — 고른 줄(들은 줄 50날) · 소식 길(같은 존 A마을2) · 나이(경계 수 5날) · 안 날' : '떠남 0(고를 곳 없음)'}`, { okd, line: line.slice(line.indexOf('들은 줄')), pickLocal: st.pickLocal, ageMax: st.ageMax }); }
    const r2 = hear(b, row({ d: 60, g: G0, h: 0.05 }), 0);   // D0+2 에 A 가 더 새 줄(행복 0.05 — V 0.2 보다 낮다)
    step(1);   // D0+3 — 새 줄은 V 에 D0+4 에 닿는다
    { const p = pick(), k = known();
      ck('A4', r2 && r2.ok && (l ? (p === 'X:X@nippon' && k[KX].row.d === 50) : p === null), `A4 ${l ? 'A 가 더 새 줄을 들어도 그 줄이 V 에 닿기 전(D0+3)엔 V 는 앞 줄(50날 · 행복 0.9)을 안다 — 잊음 0' : '켬이 아니면 모른다'}`,
        { p, d: k && k[KX] ? k[KX].row.d : null }); }
    step(1);   // D0+4
    { const p = pick(), k = known();
      ck('A5', l ? (p === null && k[KX].row.d === 60 && k[KX].via === 'local') : (p === null && (on ? !!k && Object.keys(k).length === 0 : k === null)), `A5 ${l ? 'D0+4 — 새 줄(60날 · 행복 0.05)이 닿았다 → 안 고른다' : '모름 그대로'}`, { p, d: k && k[KX] ? k[KX].row.d : null }); }
    step(1);   // D0+5 — 60날 줄은 A 에서 가장 먼 마을(2일)까지 다 번졌다
    hear(b, row({ d: 70, g: G0 + 3, h: 0.06 }), 0);
    { const R = b._t1352Hist && b._t1352Hist[KX] ? b._t1352Hist[KX].map((x) => x.d) : undefined;
      const want = L ? (OFF ? [70] : [60, 70]) : undefined;
      ck('A6', JSON.stringify(R) === JSON.stringify(want), `A6 고리 — ${L ? (OFF ? 'T7 끔이면 번질 곳이 없어 가장 새 줄만' : '다 번진 줄(60날) 앞 줄(50날)은 버리고 60 · 70 날') : '켬(ⓐ)이 아니면 고리 칸이 없다(econ 칸 0)'}`, { R, want }); }

    // ── B 묶음 — 이음매 소문(ⓑ) ─────────────────────────────────────────────
    for (const e of [a, b, c]) { delete e._t1324Heard; delete e._t1352Hist; }
    step(5);   // D0+10 · 경계 G0+10
    const g1 = S.lastGameDay;
    const s1 = snapIn(g1, [row({ d: 80, h: 0.95 })]);
    { const p = pick(), R = Q ? Q.seamRing() : undefined;
      ck('B1', s1 && s1.ok && p === null && (SE ? !!(R && R.get(KX) && R.get(KX).length === 1 && R.get(KX)[0].g === g1) : !R), `B1 경계 g 에 받은 스냅 줄 — 그 경계엔 모른다(T7 1일)${SE ? ' · 받는 쪽 고리에 든다' : ' · 끔 = 고리 없음'}`,
        { p, ring: R && R.get(KX) ? R.get(KX).map((x) => x.g - g1) : null }); }
    step(1);
    { const p = pick(), k = known();
      ck('B2', s ? (p === 'X:X@nippon' && k[KX].via === 'seam' && k[KX].row.g === g1 && k[KX].kat === w.day) : p === null, `B2 g+1 — ${s ? '이음매로 들은 X(행복 0.95)를 고른다 · 안 날 = 오늘' : '이음매 소문이 없으면 모른다'}`,
        { p, k: k && k[KX] ? { via: k[KX].via, g: k[KX].row.g - g1, kat: k[KX].kat } : null }); }
    snapIn(S.lastGameDay, [row({ name: 'Y', d: 81, h: 0.95 })]);   // Y — V 에서 곧장 4일 · U 에서 1일(+ V–U 1일)
    step(2);   // g+3 — Y 줄 경계 + 2
    { const k = known(), hasY = !!(k && k[KY]);
      ck('B3', hasY === (s && l), `B3 먼 마을 Y — 경계 + 2 에 ${s && l ? 'U 를 거쳐 안다(이음매 1일 + 같은 존 1일 · T7 다익스트라에 이음매 한 칸)' : '아직 모른다(곧장 4일 · ⓐ 끔이면 다른 마을을 안 거친다)'}`, { hasY }); }
    step(2);   // 경계 + 4
    { const k = known(), hasY = !!(k && k[KY]);
      ck('B4', hasY === s, `B4 Y — 경계 + 4 에 ${s ? '곧장으로도 안다' : '모른다(이음매 소문 끔)'}`, { hasY }); }
    a._t1324Heard = { [KX]: { zone: PEER, name: 'X', d: 80, at: D0, fe: 1e5, n: 10, h: 0.5, beds: 100 } };   // 제 줄 — 이음매 줄과 같은 날(80)
    const k5a = known(); const v5a = k5a && k5a[KX] ? k5a[KX].via : null;
    a._t1324Heard[KX].d = 79;   // 제 줄이 하루 낡았다
    const k5b = known(); const v5b = k5b && k5b[KX] ? k5b[KX].via : null;
    ck('B5', v5a === (on ? 'own' : null) && v5b === (s ? 'seam' : (on ? 'own' : null)), `B5 가장 새 줄 — 같은 날이면 제 줄 · ${s ? '이음매 줄이 더 새면 이음매 줄' : '이음매 소문이 없으면 제 줄'}`, { same: v5a, older: v5b });
    pushed = null; mute(() => Q ? Q.dayOut() : null);
    { const sn = pushed && pushed.snaps && pushed.snaps[PEER] && pushed.snaps[PEER][0], t = sn && sn.t1352;
      const beds = Math.min(b.housing, b._mapBeds), fe = +E1.totalFoodEquivalent(b).toFixed(3);
      ck('B6', SE ? !!(t && t.d === w.day && t.g === S.lastGameDay && t.n === b.npcs.length && t.fe === fe && t.h === b.lastStats.happiness && t.beds === beds) : !!(sn && !('t1352' in sn)),
        `B6 보내는 쪽 — ${SE ? '경계 마을 스냅에 그날 줄(날 · 경계 · 사람 · 곳간 식량 환산 · 행복 · 침상)' : '끔 = 스냅에 줄 칸 없음(글자 그대로)'}`, { t: t || null, has: !!sn }); }
    { const r = { kind: 'return', id: 5, lastTo: vA.name }; mute(() => P.news(r));
      ck('B7', on ? (r.t1324 && r.t1324.g === S.lastGameDay) : (r.t1324 && !('g' in r.t1324)), `B7 'return' 줄 — ${on ? '경계 수를 싣는다(소식 나이 · 두 존 같은 수)' : '끔 = 경계 칸 없음(T1324 글자 그대로)'}`, r.t1324 ? { g: r.t1324.g == null ? null : r.t1324.g - S.lastGameDay } : null); }

    // ── C — 끔 = 셈 0 · 칸 0 ────────────────────────────────────────────────
    { const st = Q ? Q.stat() : null, keys = st ? Object.keys(st).filter((q) => !['roadDays', 'roadHungry'].includes(q) && st[q] !== 0) : ['탐침 없음'];
      const hist = [a, b, c].some((e) => '_t1352Hist' in e), ring = Q ? !!Q.seamRing() : true;
      ck('C1', on ? (st && st.calls > 0) : (keys.length === 0 && !hist && !ring), `C1 ${on ? '켬 — 소식 길이 돌았다(셈 > 0)' : '끔 — 소식 길 셈 0 · econ 고리 칸 0 · 받는 쪽 고리 0(T1324 그대로)'}`, on ? { calls: st && st.calls } : { keys, hist, ring }); }
  } catch (e) { out.push({ id: 'X', ok: false, msg: '아이 예외', got: String(e && e.stack || e).slice(0, 400) }); }
  process.send({ t: 'done', out });
  setTimeout(() => process.exit(0), 50);
  return;
}

// ── 부모 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function run(mode, bait) {
  return new Promise((res) => {
    const E = Object.assign({}, process.env, { T525_CROSS_ZONE: '1', T1324_XZ_MIGRATE: '1' }, MODES[mode]);
    for (const k of ['T1352_NEWS_LOCAL', 'T1352_NEWS_SEAM', 'RUMOR_OFF']) if (!(k in MODES[mode])) delete E[k];
    const c = fork(__filename, ['--child', bait || '-'], { env: E, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    let got = null;
    c.on('message', (m) => { got = m; });
    c.on('exit', (code) => res(got || { t: 'err', err: 'exit ' + code }));
  });
}
(async () => {
  console.log('\n=== T1352 — 소식이 번지는 길(ⓐ 같은 존 소문 · ⓑ 이음매 소문 · 기본 끔) ===');
  for (const mode of Object.keys(MODES)) {
    console.log(`\n  ── 꼴 ${mode} (${JSON.stringify(MODES[mode])})`);
    const r = await run(mode);
    if (r.t !== 'done') { ok(false, `${mode} 아이`, r.err); continue; }
    for (const q of r.out) ok(q.ok, `[${mode}] ${q.msg}`, q.got);
  }
  console.log('\n  ── 미끼(이 파일 안 · 자리 한 번 · 빨강 줄 단언)');
  const VSRC = fs.readFileSync(VFILE, 'utf8');
  for (const [name, B] of Object.entries(BAITS)) {
    const n = VSRC.split(B.at[0]).length - 1;
    if (n !== 1) { ok(false, `미끼 ${name} — 소스 자리가 꼭 한 번(지금 ${n}번)`, B.at[0].slice(0, 60)); continue; }
    const r = await run(B.mode, name);
    if (r.t !== 'done') { ok(false, `미끼 ${name} 아이`, r.err); continue; }
    const red = r.out.filter((q) => !q.ok).map((q) => q.id).sort();
    ok(JSON.stringify(red) === JSON.stringify(B.red.slice().sort()), `미끼 ${name}(${B.mode} 꼴) — 빨강 줄이 꼭 {${B.red.join(', ')}}`, `빨강 {${red.join(', ')}}`);
  }
  console.log(`\n  합: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
