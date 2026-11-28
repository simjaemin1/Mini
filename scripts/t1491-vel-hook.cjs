// (@regress 없음 — 계측 훅 · 러너 밖 · T1491 · 판정 0 · 제품 무접촉)
// === scripts/t1491-vel-hook.cjs — 걷는 몸의 속도가 틱마다 왜 바뀌나(진단 ①) · 막힘을 몇 틱 만에 알아채나 · 겹친 몸(진단 ②) ===
//   쓰는 법(t646 판 · `--seg` 탐침 `_A6start` · `_A6end` 가 틱 머리 · 꼬리):
//     T646_PRELOAD=$PWD/scripts/t1491-vel-hook.cjs T1491_VEL_OUT=<파일> node scripts/t646-anatomy.js run inf <tag> --seg --ref <커밋>
//     (us-line: `--arm vel=<커밋>:T646_PRELOAD=<이 파일>,T1491_VEL_OUT=<파일>`)
//   · 존 글자(server/zone.js)를 컴파일 때 고친다(사본 트리 · 제품 파일 무접촉): 이동 문 몸통(`_moveOne`)을 감싸 몸마다 옮기기 앞뒤 자리 ·
//     `sepNpcs`(서로 비키기) · `unstuckNpc`(막힘 풀기)를 되묶어 그 틱에 민 몸 · 푼 몸을 적는다. 셈에 쓴 시간은 세계 시계(Date.now)에서 뺀다(T1467 훅 그 꼴).
//   · 틱 꼬리마다 몸(NPC = `npcs` · 짐승 = `mobs`)의 vx · vy 를 지난 틱 꼬리 값과 견준다 — 걷는 틱(앞 · 뒤 어느 쪽이든 속도가 0 아님) 가운데
//       같음 · 바뀜 · 뜻 있게 바뀜(방향 각 > 1° 또는 빠르기 > 1 % 또는 서기 · 출발) 을 까닭별 · 몸 꼴별로 센다.
//     까닭(차례대로 첫째): 서기·출발 → 막힘 풀기(그 틱 `unstuckNpc`) → 목표·길 새로(길 배열 · 목표 · 행동이 바뀜) → 가속·감속(방향 그대로 · 빠르기만) →
//       다음 칸 가운데로(길 번호가 이 틱이나 지난 틱에 넘어감) → 서로 밀기(지난 틱 `sepNpcs` 가 옮김) → 벽 미끄러짐(지난 틱 이동 문이 속도와 다르게 옮김) →
//       끝자리(각 < 1e-6 rad · 빠르기 1e-9 안) → 그밖.
//   · 막힘 사건(진단 ②): 걷는 몸의 한 틱 실제 나아감(이동 문 + 비키기 · 속도 방향 성분) < 명령 걸음(|v| · moveDt)의 0.5 → 막힘 틱.
//       막힘이 시작된 틱의 속도 v0 에서 뜻 있게 바뀐 속도가 나올 때까지 틱(알아챔) · 그 전에 막힘이 풀리면 "저절로 풀림" · 450 틱(15초) 넘으면 "못 알아챔".
//       막은 것: 이동 문이 0.5 아래로 옮김 = 벽·문·물(지형) · 이동 문은 다 옮겼는데 비키기가 되밀었다 = 다른 몸.
//   · 겹친 몸(표본 틱 — `T1491_EVERY` 틱마다 · 기본 10): 같은 층 두 몸 사이 < 16px(SEP_BODY_PX) 쌍 수 — 자리: 다리 위 · 문간(문 칸 ±1) · 곳간 앞(곳간 칸 ±2) · 그밖.
//   · 창 = 세계 국면(낮 0.10 ~ 0.62 · 밤 0.72 ~ 0.97) · 30초마다 · 끝날 때 파일에 쓴다.
//   날짜 · 벽시계를 안 쓴다(국면은 세계 시계).
'use strict';
const OUT = process.env.T1491_VEL_OUT;
if (OUT && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
  const Module = require('module'), _c = Module.prototype._compile, ZP = require('path').join('server', 'zone.js');
  const EVERY = +(process.env.T1491_EVERY || 10), SSONLY = process.env.T1491_SS_ONLY === '1';
  //   `T1491_SS_ONLY=1` = 감싸기 없이 첫 거름 표 셈 · 결정 문 예산 끊김(`_npcCursor`)만 — 훅이 틱에 얹는 짐이 결정 문 예산을 건드리나 가르는 맨 판
  Module.prototype._compile = function (content, filename) {
    if (SSONLY && filename.endsWith(ZP) && content.indexOf('let _npcCursor = null;') >= 0) {
      content += `
;(function () {   // [T1491 맨 판 훅 · 계측기가 박았다 · 제품엔 없다]
  const H = globalThis.__T91; H.bind({ worldPhase, SS: typeof SS !== 'undefined' ? SS : null, cut: () => _npcCursor !== null });
  if (typeof _A6start === 'function') { const e0 = _A6end; _A6end = function () { e0(); H.ssTick(); }; }
})();
`;
      console.log('[T1491 맨 판 훅] 끼움');
    } else if (!SSONLY && filename.endsWith(ZP) && content.indexOf('const _moveOne = (p) => { do {') >= 0) {
      const head = '  const _moveOne = (p) => { do {', tail = '\n  } while (false); };';
      const i = content.indexOf(head); if (i < 0 || content.indexOf(head, i + 1) >= 0) throw new Error('[T1491 훅] 머리 앵커');
      const j = content.indexOf(tail, i); if (j < 0) throw new Error('[T1491 훅] 끝 앵커');
      content = content.slice(0, i) + head.replace('const _moveOne =', 'const _moveOneT91 =') + content.slice(i + head.length, j + tail.length) +
        '\n  const _moveOne = globalThis.__T91.wrapMove(_moveOneT91);' + content.slice(j + tail.length);
      content += `
;(function () {   // [T1491 속도 훅 · 계측기가 박았다 · 제품엔 없다]
  const H = globalThis.__T91;
  H.bind({ players, npcs, mobs, buildings, worldPhase, isBridgeTileLocal, edgeBlockedStep, moveDt: 1 / TICK_HZ, tick: _tick, SS: typeof SS !== 'undefined' ? SS : null });
  { const f0 = sepNpcs; sepNpcs = function (dt) { H.sepBeg(); const r = f0.apply(this, arguments); H.sepEnd(); return r; }; }
  { const f0 = unstuckNpc; unstuckNpc = function (npc) { H.unstuck(npc); return f0.apply(this, arguments); }; }
  if (typeof _A6start === 'function') { const s0 = _A6start, e0 = _A6end; _A6start = function () { H.tickBeg(); s0(); }; _A6end = function () { e0(); H.tickEnd(); }; }
  else console.log('[T1491 훅] ⚠ _A6start 없음 — t646 --seg 로 띄운다');
})();
`;
      console.log('[T1491 속도 훅] 끼움');
    }
    return _c.call(this, content, filename);
  };
  const fs = require('fs'), pf = require('perf_hooks').performance;
  let OFF = 0; { const dn = Date.now; Date.now = function () { return dn() - OFF; }; }
  let D = null, W = 'other', tickN = 0;
  const R = {};
  const box = () => R[W] || (R[W] = { ticks: 0, kinds: {}, ep: {}, ov: { samples: 0, pairs: {}, bodies: 0 } });
  const win = () => { const ph = D.worldPhase(Date.now()); return ph >= 0.10 && ph <= 0.62 ? 'day' : ph >= 0.72 && ph <= 0.97 ? 'night' : 'other'; };
  const kindOf = (p, mob) => mob ? '짐승' : p.simWar ? '병사' : p.simCaravan ? '캐러밴' : p.simJob === 'bandit' ? '도적' : (p.simVillageId || p.canadiaVillage) ? '마을 사람' : '그밖 NPC';
  const S = new Map();            // 몸 → 지난 틱 꼬리 상태
  const mv = new Map();           // 이 틱 이동 문: 몸 → [x0, y0, vx, vy, x1, y1]
  const sepPre = new Map();       // 비키기 앞 자리
  const pushed = new Set(), unst = new Set();
  const ANG1 = Math.PI / 180;
  const angOf = (ax, ay, bx, by) => { const c = ax * by - ay * bx, d = ax * bx + ay * by; return Math.abs(Math.atan2(c, d)); };
  const kbox = (B, k) => B.kinds[k] || (B.kinds[k] = { walk: 0, same: 0, chg: 0, mean: 0, cause: {}, angH: {}, cellX: 0 });
  const cbox = (K, c) => K.cause[c] || (K.cause[c] = { n: 0, mean: 0 });
  const hb = (a) => a < 1e-9 ? '<1e-9' : a < 1e-6 ? '<1e-6' : a < 1e-3 ? '<1e-3' : a < ANG1 * 0.1 ? '<0.1°' : a < ANG1 ? '<1°' : a < ANG1 * 10 ? '<10°' : a < ANG1 * 45 ? '<45°' : '≥45°';
  const epB = (B, k) => B.ep[k] || (B.ep[k] = { n: 0, wall: 0, body: 0, notice: {}, free: {}, never: 0, ticksBlocked: 0 });
  const NOTE_MAX = 450;
  function meaningful(ax, ay, bx, by) {
    const sa = Math.hypot(ax, ay), sb = Math.hypot(bx, by);
    if (!sa !== !sb) return true;
    if (!sa && !sb) return false;
    return angOf(ax, ay, bx, by) > ANG1 || Math.abs(sb / sa - 1) > 0.01;
  }
  //   자리 표(900 틱마다 다시): 바닥 칸(집 안) · 문간(바닥 칸 가운데 옆이 바닥 아닌데 그 변이 안 막힌 칸 + 그 바깥 칸) · 곳간 앞(마을 곳간 칸 조각 cx ± 2 · cy ± 1 을 한 겹 넓힘 — 존 db 를 읽기만)
  let floorC = null, doorC = null, granC = null, placeAt = -1e9;
  const ck = (cx, cy) => cx * 100003 + cy;
  function places() {
    floorC = new Set(); doorC = new Set(); granC = new Set();
    for (const b of D.buildings.values()) if (b.type === 'floor' && !(b.floor || 0)) floorC.add(ck(Math.floor(b.x / 32), Math.floor(b.y / 32)));
    for (const k of floorC) { const cx = Math.floor(k / 100003), cy = k - cx * 100003;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = ck(cx + sx, cy + sy);
        if (!floorC.has(n) && !D.edgeBlockedStep(cx, cy, sx, sy, 0)) { doorC.add(k); doorC.add(n); } } }
    if (!granC.size) try {
      const db = new (require('better-sqlite3'))(process.env.DB_PATH, { readonly: true, fileMustExist: true });
      for (const r of db.prepare("select cx, cy from village_buildings where type = 'granary'").all()) for (let x = r.cx - 3; x <= r.cx + 3; x++) for (let y = r.cy - 2; y <= r.cy + 2; y++) granC.add(ck(x, y));
      db.close();
    } catch (e) { console.log('[T1491 훅] 곳간 못 읽음 ' + e.message); }
  }
  function overlap(B) {
    const O = B.ov; O.samples++;
    if (tickN - placeAt >= 900) { places(); placeAt = tickN; O.doorCells = doorC.size; O.floorCells = floorC.size; O.granCells = granC.size; }
    const G = new Map(); let nb = 0;
    for (const pid of D.npcs) { const p = D.players.get(pid); if (!p || p.hp <= 0 || p.handingOff) continue; nb++;
      const k = ((p.x / 32) | 0) * 100003 + ((p.y / 32) | 0); let c = G.get(k); if (!c) G.set(k, c = []); c.push(p); }
    O.bodies += nb;
    for (const [k, c] of G) {
      const cx = Math.floor(k / 100003), cy = k - cx * 100003;
      for (let ii = 0; ii <= 1; ii++) for (let jj = -1; jj <= 1; jj++) {
        if (ii === 0 && jj < 0) continue;
        const o = ii === 0 && jj === 0 ? c : G.get((cx + ii) * 100003 + (cy + jj)); if (!o) continue;
        for (let a = 0; a < c.length; a++) for (let b = (o === c ? a + 1 : 0); b < o.length; b++) {
          const p = c[a], q = o[b]; if ((p.floor || 0) !== (q.floor || 0)) continue;
          const dx = p.x - q.x, dy = p.y - q.y; if (dx * dx + dy * dy >= 256) continue;
          const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, mk = ck(Math.floor(mx / 32), Math.floor(my / 32));
          const where = D.isBridgeTileLocal(mx, my) ? '다리 위' : doorC.has(mk) ? '문간' : granC.has(mk) ? '곳간 앞' : floorC.has(mk) ? '집 안' : '그밖';
          O.pairs[where] = (O.pairs[where] || 0) + 1;
        }
      }
    }
  }
  globalThis.__T91 = {
    bind(d) { D = d; },
    ssAdd(B) { if (!D.SS || !D.SS.stat) return; const st = D.SS.stat, L = B.ss || (B.ss = {}), P0 = this._ss || (this._ss = {});   // 첫 거름 표 셈(걷는 몸 열 커널 · 건넘 · 깨움 까닭) — 창마다 늘어난 몫
      for (const k of ['wstep', 'skip', 'wgrant', 'stuck', 'stale', 'arrive', 'clock', 'gap', 'gone', 'due', 'dusk']) { const v = +st[k] || 0; if (P0[k] !== undefined) L[k] = (L[k] || 0) + (v - P0[k]); P0[k] = v; }
      if (D.cut) { if (D.cut()) B.cut = (B.cut || 0) + 1; } },
    ssTick() { W = win(); const B = box(); B.ticks++; this.ssAdd(B); },
    wrapMove(f) { return function (p) {
      if (!p || !p.isNpc || (!p.vx && !p.vy)) return f(p);
      const x0 = p.x, y0 = p.y, vx = p.vx, vy = p.vy; const r = f(p);
      mv.set(p, [x0, y0, vx, vy, p.x, p.y]); return r; }; },
    sepBeg() { const h0 = pf.now(); sepPre.clear(); for (const pid of D.npcs) { const p = D.players.get(pid); if (p) sepPre.set(p, [p.x, p.y]); } OFF += pf.now() - h0; },
    sepEnd() { const h0 = pf.now(); for (const [p, a] of sepPre) if (!Object.is(p.x, a[0]) || !Object.is(p.y, a[1])) pushed.add(p); OFF += pf.now() - h0; },
    unstuck(p) { unst.add(p); },
    tickBeg() { const h0 = pf.now(); tickN++; W = win(); mv.clear(); pushed.clear(); unst.clear(); OFF += pf.now() - h0; },
    tickEnd() {
      const h0 = pf.now(), B = box(); B.ticks++;
      this.ssAdd(B);
      const dt = D.moveDt;
      const one = (p, mob) => {
        const vx = p.vx || 0, vy = p.vy || 0, k = kindOf(p, mob), pv = S.get(p);
        const P = mob ? null : p.path, pi = mob ? 0 : p.pathIndex, beh = mob ? (p.state || p.aiState || p.mode || '') : p.behavior, tx = mob ? p.targetX : p.targetX, ty = mob ? p.targetY : p.targetY;
        const m = mv.get(p);
        // 이 틱 막힘(이동 문 + 비키기) — 몸 앞 방향 성분
        let blocked = 0, slide = 0;
        if (m) {
          const sp = Math.hypot(m[2], m[3]), ex = sp * dt;
          if (ex > 1e-9) {
            const ux = m[2] / sp, uy = m[3] / sp;
            const amx = m[4] - m[0], amy = m[5] - m[1], aM = amx * ux + amy * uy;         // 이동 문 나아감
            const atx = p.x - m[0], aty = p.y - m[1], aT = atx * ux + aty * uy;           // 틱 전체 나아감(비키기 포함)
            const dm = Math.hypot(amx, amy);
            if (dm > 1e-9 && angOf(m[2], m[3], amx, amy) > ANG1 * 0.5) slide = 1;
            if (aM < 0.4 * ex) slide = 1;
            if (aT < 0.5 * ex) blocked = aM < 0.5 * ex ? 1 : 2;                             // 1 = 벽·문·물 · 2 = 다른 몸
          }
        }
        if (pv) {
          const walking = pv.vx || pv.vy || vx || vy;
          if (walking) {
            const K = kbox(B, k); K.walk++;
            if (Object.is(pv.vx, vx) && Object.is(pv.vy, vy)) K.same++;
            else {
              K.chg++;
              const sa = Math.hypot(pv.vx, pv.vy), sb = Math.hypot(vx, vy);
              const ang = sa && sb ? angOf(pv.vx, pv.vy, vx, vy) : 0, rr = sa && sb ? Math.abs(sb / sa - 1) : 1;
              const mean = !sa !== !sb || ang > ANG1 || rr > 0.01;
              let c;
              if (!sa !== !sb) c = '서기·출발';
              else if (unst.has(p)) c = '막힘 풀기';
              else if (P !== pv.P || !Object.is(tx, pv.tx) || !Object.is(ty, pv.ty) || beh !== pv.beh) c = '목표·길 새로';
              else if (ang < 1e-6 && rr > 1e-6) c = '가속·감속';
              else if (pi !== pv.pi || pv.piCh) c = '다음 칸 가운데로';
              else if (pv.pushed) c = '서로 밀기';
              else if (pv.slide) c = '벽 미끄러짐';
              else if (ang < 1e-6 && rr < 1e-9) c = '끝자리';
              else c = '그밖';
              const C = cbox(K, c); C.n++; if (mean) { C.mean++; K.mean++; }
              const hk = hb(ang); K.angH[hk] = (K.angH[hk] || 0) + 1;
            }
            // 칸 넘음(32px 칸) — 걷는 틱 가운데
            if (Math.floor(p.x / 32) !== Math.floor(pv.x / 32) || Math.floor(p.y / 32) !== Math.floor(pv.y / 32)) K.cellX++;
          }
          // 막힘 사건
          let ep = pv.ep;
          if (ep) {
            const E = epB(B, ep.k); ep.t++;
            if (meaningful(ep.vx, ep.vy, vx, vy)) { E.notice[ep.t] = (E.notice[ep.t] || 0) + 1; ep = null; }
            else if (!blocked) { E.free[ep.t] = (E.free[ep.t] || 0) + 1; ep = null; }
            else if (ep.t >= NOTE_MAX) { E.never++; ep = null; }
            else E.ticksBlocked++;
          }
          if (!ep && blocked && !pv.blocked) { const E = epB(B, k); E.n++; if (blocked === 1) E.wall++; else E.body++; ep = { k, t: 0, vx: m[2], vy: m[3] }; }
          pv.ep = ep;
          pv.piCh = pi !== pv.pi; pv.vx = vx; pv.vy = vy; pv.x = p.x; pv.y = p.y; pv.pi = pi; pv.P = P; pv.beh = beh; pv.tx = tx; pv.ty = ty;
          pv.pushed = pushed.has(p); pv.slide = slide; pv.blocked = blocked; pv.seen = tickN;
        } else S.set(p, { vx, vy, x: p.x, y: p.y, pi, P, beh, tx, ty, piCh: false, pushed: pushed.has(p), slide, blocked, ep: null, seen: tickN });
      };
      for (const pid of D.npcs) { const p = D.players.get(pid); if (p) one(p, false); }
      for (const m of D.mobs.values()) one(m, true);
      if (tickN % 600 === 0) for (const [p, v] of S) if (tickN - v.seen > 30) S.delete(p);
      if (tickN % EVERY === 0) overlap(B);
      OFF += pf.now() - h0;
    },
  };
  const put = () => { try { fs.writeFileSync(OUT, JSON.stringify({ every: EVERY, win: R })); } catch (e) {} };
  process.on('exit', put); process.on('SIGTERM', () => { put(); process.exit(0); }); setInterval(put, 30000).unref();
}
