// (@regress 없음 — 러너 밖 · T804 계측기 · 제품 무변 · 읽기만 · `t790-speed-probe.js` 와 같은 꼴)
// === scripts/t804-stuck-probe.js — **막혀 선 몸** 관찰자: 하루 경계마다 전쟁 대형(공격 · 방어 · 귀환)의 걷는 몸이 제 자리(슬롯)에 다가가나 ==========
//   쓰는 법(T650 · 전쟁 자): NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · 판 JSON 옆 `.t804.json`) · 주 스레드만
//   ★무엇을 세나(하루 경계 = econ 장부 `scanDay` 앞 · 대형이 모는 몸만 — battle-core 에 풀린 몸은 뺀다):
//     · 늦은 몸-날 — 몸이 제 자리(지휘 = 원점 · 병사 = 슬롯 · 반경 `FOLLOW_SNAP`) 밖.
//     · 막혀 선 몸-날 — 늦은 몸인데, 그 대형 원점이 그 하루 동안 그대로(반경 `FOLLOW_SNAP` 안)였고, 몸에서 제 자리까지의 **걸음 길**이 전날보다
//       줄지 않았다. 걸음 길 = 경로 정본 path-core `localPath`(걸음 프리셋 · 존 술어 `_warBlockedCell` · 목표 칸이 막혔으면 설 수 있는 가장 가까운 칸 —
//       제품과 같은 문)로 잰 칸 수(관찰자가 따로 묻는다 · 제품 캐시 무관). 원점이 움직인 날(행군 · 돌격 · 주둔 걷기)은 견주지 않는다(목표가 움직였다).
//       그중 대형에서 `FOLLOW_CAP` 칸 밖(제 자리 곁 몇 칸이 아니라 떨어져 섰다)인 것을 따로 센다(stuckFar) — 막힌 슬롯 곁 반 칸 남짓은 그 안에 든다.
//     · 못 가는 몸-날 — 걸음 길이 없다(path-core 탐색 상한 안에서 못 찾음).
//     · 몸마다 가장 긴 막힘 연속 · 전쟁마다 공격 대형이 처음 다 제 자리에 선 날(닿은 날).
//   ★관찰만 한다 — 상태를 읽기만 하고 세계의 함수를 감싸지 않는다(`createLedger` 만 감싸 `scanDay` 앞에서 표본 · 같은 인수 · 같은 반환).
'use strict';
const OUT = process.env.T804_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t804.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs'); const Module = require('module'); const path = require('path');
  let VIL = null, H = null, PC = null;
  const S = () => { try { if (VIL && VIL.__p3Bind) { H = VIL.__p3Bind({}); return H.state; } } catch (e) {} return null; };
  const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  const tot = { late: 0, stuck: 0, stuckFar: 0, noPath: 0, static: 0, moving: 0, days: 0 };
  const units = new Map(), wars = new Map(), top = [], prevCmd = new WeakMap();   // 대형 → 전날 원점(관찰자 쪽 · 대형 객체에 안 쓴다)
  let lastDay = -1;
  const walkLen = (u, tx, ty) => {   // 몸 → 제 자리 걸음 길(칸) · 없으면 -1
    try {
      if (!PC) PC = require(path.join(__dirname, '..', 'sim', 'path-core.js'));
      const gl = H._warStandNear(tx, ty); if (!gl) return -1;
      const sx = Math.floor(u.x), sy = Math.floor(u.y), gx = Math.floor(gl.cx), gy = Math.floor(gl.cy);
      if (sx === gx && sy === gy) return 0;
      const blk = (cx, cy) => H._warBlockedCell(cx, cy);
      if (blk(sx, sy)) { const o = H._warStandNear(u.x, u.y); if (!o) return -1; const p = PC.localPath(Math.floor(o.cx), Math.floor(o.cy), gx, gy, { blocked: blk, blockedStep: (fx, fy, x2, y2) => blk(x2, y2) }); return p ? p.length : -1; }
      const p = PC.localPath(sx, sy, gx, gy, { blocked: blk, blockedStep: (fx, fy, x2, y2) => blk(x2, y2) });
      return p ? p.length - 1 : -1;
    } catch (e) { return -1; }
  };
  const sample = () => {
    const s = S(); if (!s || !s.warBodies || !s.world || !s.warLive || !H || !H._warBlockedCell) return;
    const day = s.world.day | 0; if (day === lastDay) return; lastDay = day; tot.days++;
    const WL = s.warLive, SNAP = WL.MU.FOLLOW_SNAP;
    for (const [id, b] of s.warBodies) {
      let wo = wars.get(id); if (!wo) { wo = { id, atk: b.w && b.w.atk ? b.w.atk.name : null, def: b.w && b.w.def ? b.w.def.name : null, first: day, last: day, atkAtSlot: null, lateDays: 0, stuckDays: 0 }; wars.set(id, wo); }
      wo.last = day;
      for (const [gk, g] of [['A', b.atkGroup], ['B', b.defGroup], ['R', b.retGroup]]) {
        if (!g || !g.units || !g.cmd) continue;
        const gid = id + gk, pc = prevCmd.get(g); prevCmd.set(g, { cx: g.cmd.cx, cy: g.cmd.cy });
        const still = pc && Math.hypot(g.cmd.cx - pc.cx, g.cmd.cy - pc.cy) <= SNAP;
        let allIn = true, any = false;
        for (const u of g.units) {
          if (u.dead || (u.bu && !u.bu.ctl)) continue; any = true;
          let tx = g.cmd.cx, ty = g.cmd.cy; if (!u.cmd) { const sl = WL._muSlotXY(g, u); tx = sl[0] + (u.jx || 0); ty = sl[1] + (u.jy || 0); }
          const lag = Math.hypot(tx - u.x, ty - u.y);
          const key = gid + ':' + u.pid; let o = units.get(key); if (!o) { o = { key, war: id, g: gk, pid: u.pid, len: null, streak: 0, maxStreak: 0, late: 0, stuck: 0, noPath: 0, maxLagM: 0 }; units.set(key, o); }
          if (!(lag > SNAP)) { o.len = 0; o.streak = 0; continue; }
          allIn = false; tot.late++; wo.lateDays++; o.late++; if (lag * WL.M_PER_CELL > o.maxLagM) o.maxLagM = lag * WL.M_PER_CELL;
          const len = walkLen(u, tx, ty);
          if (len < 0) { tot.noPath++; o.noPath++; }
          if (still && o.len != null && o.len >= 0) {
            tot.static++;
            if (len < 0 || len >= o.len) { tot.stuck++; if (lag > WL.MU.FOLLOW_CAP) tot.stuckFar++; o.stuck++; wo.stuckDays++; o.streak++; if (o.streak > o.maxStreak) o.maxStreak = o.streak;
              if (top.length < 40) top.push([day, id, gk, u.pid, r1(lag * WL.M_PER_CELL), o.len, len]); }
            else o.streak = 0;
          } else if (!still) tot.moving++;
          o.len = len;
        }
        if (gk === 'A' && any && allIn && wo.atkAtSlot == null) wo.atkAtSlot = day;
      }
    }
  };
  const dump = () => { try {
    const s = S(); const us = [...units.values()];
    const stuckUnits = us.filter((o) => o.stuck > 0);
    fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), knobs: { T790: process.env.T790_NO_SNAP || null, T771: process.env.T771_SORTIE_MISS || null },
      tot, stuckUnits: stuckUnits.length, maxStreak: us.reduce((m, o) => Math.max(m, o.maxStreak), 0), maxLagM: r1(us.reduce((m, o) => Math.max(m, o.maxLagM), 0)),
      worst: stuckUnits.sort((a, z) => z.stuck - a.stuck).slice(0, 10).map((o) => [o.war, o.g, o.pid, o.stuck, o.maxStreak, o.late, o.noPath, r1(o.maxLagM)]),
      top, wars: [...wars.values()], t804: H && H._t804Stat ? Object.assign({}, H._t804Stat) : null, t790: H && H._t790Stat ? Object.assign({}, H._t790Stat) : null,
      t821: H && H._t821Stat ? Object.assign({}, H._t821Stat) : null,   // ★[T821] 재개형 걸음 탐색 셈(없는 판 = null)
      warStat: s && s._warStat ? Object.assign({}, s._warStat) : null }));
  } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t804s) { m.__t804s = true; const mk = m.createLedger; m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample(); } catch (e) {} return sd.apply(this, arguments); }; return L; }; }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  process.on('exit', dump);
}
