'use strict';
// (@regress 없음 — 러너 밖 · T1331 진단 자 · 읽기만 · 세계 0)
// === scripts/t1331-ledger-probe.js — 사냥터 개체 장부(`_gameRich`)와 실체 몹 · 짐승 몸 표(T1331)를 날마다 센다 =====================
//   판 자 아이에 `NODE_OPTIONS=--require <이 파일>` 로 싣는다(t577 아이 env 는 부르는 쪽 env 를 그대로 받는다).
//   env: T1331_PROBE_OUT=<jsonl> · T1331_PROBE_DAYS=1,2,5,…(없으면 날마다)
//   줄 하나 = { d, zone, vil: [[이름, 셀, 합, 가득 셀(≥99.5), 빈 셀(<2), tot0, 짓는 중, 장부 없음, 몸 pid 수, land.game, econ 사냥꾼, econ 인구]] , hist, mobs: {종: 수}, wildShadow, body, show, meat, pop … }
//   ⚠읽기만 — 서버 장부 `scanDay` 문 앞에 서서 그날 세계를 본다(baseline 훅과 같은 문 · 같은 꼴).
const path = require('path'), fs = require('fs');
const OUT = process.env.T1331_PROBE_OUT || '';
if (OUT) {
  const ROOT = path.join(__dirname, '..');
  const WANT = (process.env.T1331_PROBE_DAYS || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 0);
  // ★진단 갈래(판 자 전용 · 제품 무변) `T1331_PROBE_RATIO=cells` — 몸 세계의 14일 부존 비를 "서식 칸 / 처음 칸"으로 갈아 끼운다
  //   (장부 세계처럼 벌채된 칸의 짐승이 그 자리에서 사라진 셈 — 몸 세계 인구 차이가 부존 비에서 오는지 가르는 대조 판).
  if (process.env.T1331_PROBE_RATIO === 'cells') {
    const BB = require(path.join(ROOT, 'server', 'beast-body'));
    const c0 = BB.create;
    BB.create = function (o) {
      const api = c0.apply(this, arguments);
      api.gameRatio = (v) => { const h = api.W.hab.get(v); if (!h || !(h.K0 > 0)) return null; const c = h.K0 * api.SCALE / 100; return Math.max(0.05, Math.min(1, h.set.size / c)); };
      return api;
    };
  }
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  let last = -1;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last && (!WANT.length || WANT.includes(d))) { last = d; fs.appendFileSync(OUT, JSON.stringify(snap(d)) + '\n'); }
      } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ d: day, err: e.message }) + '\n'); } catch (x) {} }
      return sd.apply(this, arguments);
    };
    return L;
  };
  function snap(d) {
    const V = require(path.join(ROOT, 'server', 'villages'));
    const st = V.__t740();
    const vil = [], hist = [0, 0, 0, 0, 0, 0];   // <2 · <12 · <30 · <60 · <99.5 · 가득
    let cells = 0, sum = 0;
    for (const v of (st.villages || [])) {
      const m = v._gameRich;
      if (!m) { vil.push([v.name, 0, 0, 0, 0, 0, v._gameScan ? 1 : 0, v._gameNone ? 1 : 0, (v.npcPids || []).length, v.econ && v.econ.land ? v.econ.land.game : null, (v.econ && v.econ.counts && v.econ.counts.hunter) || 0, v.econ ? (v.econ.npcs || []).length : 0]); continue; }
      let s = 0, full = 0, empty = 0;
      for (const g of m.values()) { s += g; if (g >= 99.5) full++; if (g < 2) empty++;
        hist[g < 2 ? 0 : g < 12 ? 1 : g < 30 ? 2 : g < 60 ? 3 : g < 99.5 ? 4 : 5]++; }
      cells += m.size; sum += s;
      vil.push([v.name, m.size, +s.toFixed(1), full, empty, v._gameTot0 || 0, 0, 0, (v.npcPids || []).length, v.econ && v.econ.land ? v.econ.land.game : null, (v.econ && v.econ.counts && v.econ.counts.hunter) || 0, v.econ ? (v.econ.npcs || []).length : 0]);
    }
    let mobs = null, wild = 0;
    try {
      const Z0 = require.main && require.main.exports, Z = Z0 && Z0.__testBind ? Z0.__testBind() : Z0;   // zone.js 는 하네스 문(`__testBind`)으로만 내보낸다(읽기만)
      if (Z && Z.mobs) { mobs = {}; for (const m of Z.mobs.values()) { if (m.isWild) { wild++; continue; } mobs[m.type] = (mobs[m.type] | 0) + 1; } }
    } catch (e) { mobs = { err: e.message }; }
    let body = null; try { body = V.t1331Stat ? V.t1331Stat() : null; if (body && body.w) { body.w.home = undefined; } } catch (e) { body = { err: e.message }; }
    let show = null; try { const W = require(path.join(ROOT, 'server', 'wildlife')); show = W.t1331Stat ? W.t1331Stat() : null; } catch (e) { show = null; }
    // 사냥 고기 — econ 마을 하루 생산(사냥꾼 몫 고기 · 끔 판은 수식 · T1195 켬이면 몸이 든 고기) · 마을 인구
    let meat = 0, pop = 0, hunters = 0, game = 0;
    for (const v of (st.villages || [])) { const e = v.econ; if (!e) continue; pop += (e.npcs || []).length; hunters += (e.counts && e.counts.hunter) || 0; game += (e.land && e.land.game) || 0;
      const b = e.dailyProductionBuf || {}; meat += (b.meat || 0); }
    return { d, zone: st.zoneId, t: Date.now(), cpu: process.cpuUsage(), cells, sum: +sum.toFixed(1), hist, vil, mobs, wildShadow: wild, body, show, meat: +meat.toFixed(3), pop, hunters, game: +game.toFixed(2), mem: process.memoryUsage().heapUsed };
  }
}
