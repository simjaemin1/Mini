// (@regress 없음 — 러너 밖 · T781 ③ 계측기 · 제품 무변 · 읽기만 · T764 관찰자(`t764-arms-probe.js`)의 꼴)
// === scripts/t781-return-probe.js — **귀환 몸 관찰자**: 전쟁 몸의 귀환 국면과 풀린 뒤 — 몸 층 진척 · 병사 자리 · 풀린 자리 · 집까지 거리 · 걸음/튐 ==========
//   쓰는 법(T650 · 전쟁 자): NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · 판 JSON 옆 `.t781r.json`) · 주 스레드만
//   ★잰다(1초 표본 + 하루 마감 장부 `scanDay` 앞 표본):
//     · 귀환 국면 몸마다 — prog · cmd(px) · T681 장부 칸([leg, D0, D1]) · 병사마다 [pid · 지휘 몸 · x · y] · 몸 짐 품목 수
//     · 병사 pid 마다 — 몸 안(귀환 국면) 걸음 m · 튐 수(`JUMP_PXS` 320 px/s 넘는 표본 사이 — T764 관찰자와 같은 문턱) · 최대 속도
//     · 몸에서 빠진 순간(풀림 · 전사 · 포로) — 날 · 살았나 · AI(`npcs`) · 자리 · 집(제 마을 중심) 직선 거리 m · 그 뒤 표본(집까지 거리 · 속도 · AI)
//   ★관찰만 한다 — 상태를 읽기만 하고 세계의 함수를 감싸지 않는다(`createLedger` 만 감싸 `scanDay` 앞에서 표본 · 같은 인수 · 같은 반환).
'use strict';
const OUT = process.env.T781R_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t781r.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs'); const Module = require('module');
  const SZ = 32, JUMP_PXS = 320, AFTER_N = 400;   // 셀 px(villages.js SZ) · 튐 문턱(T764 관찰자와 같은 값 — 10 m/s) · 풀린 뒤 표본 수
  let VIL = null;
  const S = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  const bodies = new Map(), cur = new Map(), rel = [], open = new Map();
  const homeOfPid = (s, p) => { const v = p && p.simVillageId != null && s.byDbId ? s.byDbId.get(p.simVillageId) : null; return v ? { name: v.name, x: v.ccx * SZ, y: v.ccy * SZ } : null; };
  const sample = (tag) => {
    const s = S(); if (!s || !s.warBodies || !s.deps || !s.deps.players) return;
    const P = s.deps.players, NP = s.deps.npcs, now = Date.now(), day = s.world ? s.world.day : null;
    const seen = new Map();
    for (const [id, b] of s.warBodies) {
      const atk = b.w && b.w.atk ? b.w.atk.name : null, def = b.w && b.w.def ? b.w.def.name : null;
      let bo = bodies.get(id); if (!bo) { bo = { id, atk, def, len: r1(b.len), rows: [] }; bodies.set(id, bo); }
      if (b.phase === 'return' && bo.rows.length < 3000) {
        const rg = b.retGroup;
        bo.rows.push({ tag, day, at: now, prog: r1(b.prog), cmd: b.cmd ? [r1(b.cmd.cx * SZ), r1(b.cmd.cy * SZ)] : null, t681: b._t681 ? [b._t681.leg, b._t681.D0, b._t681.D1] : null,
          pids: (b.pids || []).slice(), units: (rg && rg.units || []).map((u) => [u.pid || null, u.cmd ? 1 : 0, r1(u.x * SZ), r1(u.y * SZ)]),
          inv: (b.pids || []).map((pid) => { const p = P.get(pid); return p && p.inventory ? Object.keys(p.inventory).filter((k) => (p.inventory[k] || 0) > 0).length : 0; }) });
      }
      for (const pid of (b.pids || [])) seen.set(pid, { war: id, phase: b.phase, side: 'A', atk, def });
      for (const pid of (b.defPids || [])) seen.set(pid, { war: id, phase: b.phase, side: 'B', atk, def });
    }
    for (const [pid, o] of seen) {   // 몸 안 — 걸음 · 튐(귀환 국면만)
      const p = P.get(pid); let c = cur.get(pid);
      if (!c || c.war !== o.war) { c = { war: o.war, side: o.side, prev: null, ret: { walk: 0, jump: 0, maxV: 0, n: 0 } }; cur.set(pid, c); }
      c.phase = o.phase;
      if (p) { if (c.prev && o.phase === 'return') { const dt = (now - c.prev[2]) / 1000, d = Math.hypot(p.x - c.prev[0], p.y - c.prev[1]); if (dt > 0) { const v = d / dt; c.ret.n++; if (v > JUMP_PXS) c.ret.jump++; else c.ret.walk += d; c.ret.maxV = Math.max(c.ret.maxV, v); } } c.prev = [p.x, p.y, now]; }
    }
    for (const [pid, c] of [...cur]) {   // 몸에서 빠졌다 — 풀림(산 몸) 또는 사라짐(전사 · 포로)
      if (seen.has(pid)) continue;
      const p = P.get(pid), h = homeOfPid(s, p);
      const ev = { pid, war: c.war, side: c.side, lastPhase: c.phase, day, at: now, alive: !!p, ai: p && NP && NP.has ? NP.has(pid) : null, x: p ? r1(p.x) : null, y: p ? r1(p.y) : null,
        home: h ? h.name : null, dHome: p && h ? r1(Math.hypot(p.x - h.x, p.y - h.y) / SZ) : null, ret: { walkM: r1(c.ret.walk / SZ), jump: c.ret.jump, maxV: r1(c.ret.maxV), n: c.ret.n }, after: [] };
      rel.push(ev); cur.delete(pid); if (p) open.set(pid, { ev, prev: [p.x, p.y, now] });
    }
    for (const [pid, o] of [...open]) {   // 풀린 뒤 — 집까지 거리(m) · 속도(px/s) · AI 여부
      if (seen.has(pid)) { open.delete(pid); continue; }
      const p = P.get(pid); if (!p || o.ev.after.length >= AFTER_N) { open.delete(pid); continue; }
      const h = homeOfPid(s, p), dt = (now - o.prev[2]) / 1000, d = Math.hypot(p.x - o.prev[0], p.y - o.prev[1]);
      o.ev.after.push([day, r1(h ? Math.hypot(p.x - h.x, p.y - h.y) / SZ : null), dt > 0 ? r1(d / dt) : null, NP && NP.has ? (NP.has(pid) ? 1 : 0) : null]);
      o.prev = [p.x, p.y, now];
    }
  };
  const dump = () => { try { fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), knobs: { T403: process.env.T403_ARMS_LEDGER || null, T771: process.env.T771_SORTIE_MISS || null, T423: process.env.T423_RATION_ACT || null }, bodies: [...bodies.values()], rel })); } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t781r) { m.__t781r = true; const mk = m.createLedger; m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample('d' + (world && world.day)); } catch (e) {} return sd.apply(this, arguments); }; return L; }; }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  const t1 = setInterval(() => { try { sample('t'); } catch (e) {} }, 1000); if (t1.unref) t1.unref();
  process.on('exit', dump);
}
