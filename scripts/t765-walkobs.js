'use strict';
// === scripts/t765-walkobs.js — T765 실제 하루 판 관측 프리로드(읽기만 · 러너 밖 · `@regress` 없음) =======================
//
// ★무엇 [T765 ① 실제 하루 판 — "몸이 실제로 걷나: 걸은 몸 수 · 거리 · 하루 몫"]
//   `scripts/t765-realday.js` 가 띄우는 존에 덧 프리로드로 싣는다(`T765_WALK_OUT` 이 있을 때만 돈다).
//   1초마다 몸 층을 읽는다 — 걸어 나가는 몸 기록(`villages` 상태의 `bodyExits` · `__p3Bind({})` 는 빈 덮기 = 읽기)과 그 몸(존 `players`):
//     몸마다 [까닭 · 후보 표식 · 떠난 마을 · 처음 본 벽 초 · econ 날 · 걸은 거리(1초 표본 사이 직선 합) · 길 길이 · 끝(붙음 / 거둠 / 판 끝 걷는 중)].
//   마을마다 [econ 수 · 몸 수 · 그 뒤 새로 선 pid 수(생성)]를 날 경계마다 · 도적 로그(해체 · 후보 걷기 줄) · 후보 장부 증인을 판 끝에 쓴다.
//   ⚠세계에 아무것도 안 쓴다 — 읽고, 끝(`exit` · SIGUSR2)에 파일 하나.
const path = require('path');
const fs = require('fs');
const OUT = process.env.T765_WALK_OUT || '';
if (OUT) {
  const ROOT = process.cwd();
  const t0 = Date.now();
  const W = new Map();        // pid → 걷는 몸 표
  const days = [];            // 날 경계마다 마을 단면(해체 마을 · 받는 마을만)
  const born = new Map();     // 마을 이름 → 해체 뒤 그 마을에 새로 선 pid 수
  let seen0 = null, lastDay = null, watch = new Set(), err = null;
  const mod = (n) => { try { return require(path.join(ROOT, 'server', n)); } catch (e) { return null; } };
  function sample() {
    const V = mod('villages'), B = mod('bandits');
    if (!V || !V.banditHost) return;
    const host = V.banditHost(); if (!host || !host.players) return;
    const st = V.__p3Bind ? V.__p3Bind({}).state : null;   // 빈 덮기(Object.assign(state, {})) — 상태를 읽기만 한다
    const P = host.players, now = Date.now(), day = host.world ? host.world.day : null;
    const M = st && st.bodyExits;
    if (M) for (const [pid, r] of M) {
      if (r.cat === 'died') continue;
      const p = P.get(pid); if (!p) continue;
      let w = W.get(pid);
      if (!w) {
        const from = host.villages.find((v) => v.dbId === r.vid);
        w = { pid, k: r.k, t765: !!r.t765, from: from ? from.name : r.vid, sec0: Math.round((now - t0) / 1000), day0: day, len: Math.round(r.len), x0: Math.round(p.x), y0: Math.round(p.y), dist: 0, px: p.x, py: p.y, end: null };
        W.set(pid, w);
        if (from) watch.add(from.name);
      }
      w.dist += Math.hypot(p.x - w.px, p.y - w.py); w.px = p.x; w.py = p.y; w.lastSec = Math.round((now - t0) / 1000); w.lastDay = day;
      if (r.t765 && r.L != null) w.L = Math.round(r.L);
    }
    for (const w of W.values()) {   // 끝 — 기록에서 빠졌다: 붙었나(그 몸이 마을 명부에) · 거둬졌나(players 에 없음)
      if (w.end || (M && M.has(w.pid))) continue;
      const p = P.get(w.pid);
      if (!p) { w.end = 'gone'; w.endSec = Math.round((now - t0) / 1000); w.endDay = day; continue; }
      const v = host.villages.find((x) => x.npcPids && x.npcPids.indexOf(w.pid) >= 0);
      w.end = v ? 'joined' : 'other'; w.to = v ? v.name : null; w.endSec = Math.round((now - t0) / 1000); w.endDay = day;
      w.dist += Math.hypot(p.x - w.px, p.y - w.py); w.px = p.x; w.py = p.y;
      if (v) watch.add(v.name);
    }
    if (B && B.t765) { const t = B.t765(); for (const r of t.rows || []) { watch.add(r.from); watch.add(r.to); } }
    if (B && B.stats) for (const m of (B.stats().log || [])) { const q = /해체 뒤 남은 \d+명 → (\S+?)\(/.exec(m); if (q) watch.add(q[1]); }   // 받는 마을(종전 켬 판엔 장부 증인이 없다 — 도적 로그 줄에서)
    // 해체 뒤 새로 선 몸(생성) — 지켜보는 마을 명부에 처음 보는 pid(걷다 붙은 몸은 뺀다)
    if (!seen0) { seen0 = new Set(P.keys()); }
    for (const v of host.villages) {
      if (!watch.has(v.name) || !v.npcPids) continue;
      for (const pid of v.npcPids) if (!seen0.has(pid)) { seen0.add(pid); if (!W.has(pid)) born.set(v.name, (born.get(v.name) || 0) + 1); }
    }
    for (const pid of P.keys()) if (!seen0.has(pid) && !W.has(pid)) seen0.add(pid);   // 다른 곳에서 선 몸(캐러밴 · 도적 실체)은 기준에만
    if (day !== lastDay) {
      lastDay = day;
      days.push({ day, sec: Math.round((now - t0) / 1000), vil: host.villages.filter((v) => watch.has(v.name)).map((v) => ({ name: v.name, econ: v.econ ? v.econ.npcs.length : null, bodies: v.npcPids ? v.npcPids.length : null, dis: v.econ && v.econ._banditized ? 1 : 0 })) });
    }
  }
  const iv = setInterval(() => { try { sample(); } catch (e) { err = String(e && e.stack || e); } }, 1000);
  if (iv.unref) iv.unref();
  const dump = () => {
    try {
      try { sample(); } catch (e) {}
      const V = mod('villages'), B = mod('bandits');
      const st = B && B.stats ? B.stats() : {};
      const out = {
        knobs: { T577_CAND_WALK: process.env.T577_CAND_WALK || null, T521_GANG_ARMS: process.env.T521_GANG_ARMS || null, BANDIT_FIXTURE: process.env.BANDIT_FIXTURE || null, BANDIT_MINDAY: process.env.BANDIT_MINDAY || null, VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || null },
        sec: Math.round((Date.now() - t0) / 1000), lastDay,
        walkers: [...W.values()].map((w) => { const o = Object.assign({}, w); delete o.px; delete o.py; o.dist = Math.round(o.dist); return o; }),
        born: Object.fromEntries(born), days,
        bodyExit: V && V.bodyExitStats ? V.bodyExitStats() : null,
        t765Body: V && V.t765Stat ? V.t765Stat() : null,
        t765Ledger: B && B.t765 ? B.t765() : null,
        bandit: { conv: st.conv, t577Walk: st.t577Walk || 0, t765Arrive: st.t765Arrive || 0, t765Joined: st.t765Joined || 0, log: (st.log || []).filter((m) => /해체|T577|T765|FIXTURE/.test(m)) },
        err,
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} }
  };
  process.on('SIGUSR2', dump);
  process.on('exit', dump);
}
