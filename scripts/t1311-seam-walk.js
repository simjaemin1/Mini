#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1311 판 자 · 제품 무변)
// === scripts/t1311-seam-walk.js — 쇠재 · 한재 골짜기를 실제 몸이 지나는가 (T1311 · T1296 회부 2 · 3 · 4) ===
//
//   hook                  — 존 프로세스 preload(`NODE_OPTIONS=--require …`): `t533-xzone-server.js` 훅이 연 `state` 창(globalThis.__t533st)을
//                            250ms 마다 읽어 **골짜기 둘레 창**(이음매 ±2,500px · 쇠재 y 40,000 · 한재 y 60,000 ± 2,500)에 든 캐러밴 몸(상인 · 호위)을
//                            지나감 한 줄로 적는다(`T1311_OUT` JSONL): 든 · 나간 시각 · 창 안 시간 · 멈춘 표본(걷는 중인데 1px 안 움직임) · 가장 긴 멈춤 ·
//                            막힌 칸 위 표본(존 걸음 칸 술어 `deps.isTerrainBlockedLocal` · ★[T1320] 종전 점 술어 → 칸) · 재경로 실패 셈 변화 · 이음매 칸에 닿았나. 읽기만(세계에 0).
//   rock <routes.json>    — `t1296-seam-valley.js routes` 판 길(정본 교역로 A*)을 8px 마다 짚어 골짜기 창 안 바위 · 물 칸 위 점을 센다.
//   run <outdir> <표지> <씨> [날=30] [하루ms=3000] — `t533-xzone-server.js run` 을 이 훅을 얹어 한 판(팔 on · 두 존 실서버) · 지나감 줄 = `<outdir>/pass_<표지>_<존>.jsonl`.
//   table <outdir>        — 판들을 한 표로(표지 앞머리 = 팔).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = require.main === module ? process.argv[2] : null;   // preload(--require)로 실리면 모드 없음 = 훅만

// 골짜기 둘레 창 — 존 로컬 px(한반도는 동쪽 끝 · 닛폰은 서쪽 끝)
const VALLEYS = [['쇠재', 40000], ['한재', 60000]];
const WIN = 2500;
function valleyOf(zone, x, y, ZW) {
  const nearSeam = zone === 'hanbando' ? x >= ZW - WIN : (zone === 'nippon' ? x <= WIN : false);
  if (!nearSeam) return null;
  for (const [nm, vy] of VALLEYS) if (Math.abs(y - vy) <= WIN) return nm;
  return null;
}

if (MODE === null && (process.env.T1311_OUT || process.env.T1311_OUT_DIR) && process.env.ZONE_ID) {
  // ── 훅(존 프로세스 · 본 스레드만) ──
  let main = true; try { main = require('worker_threads').isMainThread; } catch (e) {}
  if (main) {
    const ZID = process.env.ZONE_ID, OUT = process.env.T1311_OUT || path.join(process.env.T1311_OUT_DIR, `pass_${process.env.T1311_TAG || 'x'}_${ZID}.jsonl`);
    let T = null, ZW = 0;
    const live = new Map();   // 몸 키 → 지나감
    const flush = (k, o, why) => { live.delete(k); o.end = why; o.dt = o.tOut - o.tIn; try { fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); } catch (e) {} };
    // ★걸음마다(8px — `_t1182Walk` 의 SZ/4 걸음이 길 도장 `state.roads.stampEntityPx` 를 부른다) 골짜기 창 안 몸 자리를 잰다 — 표본(250ms)은
    //   빠른 하루 판(하루 3초 ⇒ 걸음 ×480)에서 창을 한 번에 건너뛰므로 걸음 하나하나를 본다(읽기만 · 도장은 그대로 부른다).
    const stepAgg = { n: 0, rock: 0, water: 0, by: { 쇠재: 0, 한재: 0 }, pids: new Set(), rs: [] };
    const roleOf = new Map();   // pid → 'm'(상인) · 'e'(호위) — 표본 고리가 채운다
    // ★[T1320] `T1311_ALL=1` — 존 전체 걸음(도장 부르는 모든 몸)의 바위 칸 · 바위 걸음마다 (자리 · 몸 · 그 몸 길(body.pts)에서 떨어진 거리 px) ·
    //   처음 본 캐러밴 몸(세움 · 넘김 받음)의 자리가 바위인가(`spawn`)
    const ALL = process.env.T1311_ALL === '1';
    const allAgg = { n: 0, rock: 0, rs: [], byRole: {}, spawnN: 0, spawnRock: [] };
    const bodyOf = new Map();   // pid → 캐러밴 몸(상인 · 호위 둘 다)
    const seenPid = new Set();
    // 바위 걸음이 놓인 길 마디 — [마디 번호 · 마디 수 · 앞 점 · 뒤 점 · 앞 점 바위? · 뒤 점 바위? · 마디 길이 px](모서리 깎기인가 · 끝점이 바위인가)
    const segAt = (pts, x, y) => { if (!pts || pts.length < 2) return null; let b = Infinity, bi = 0; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], c = pts[i + 1], dx = c.x - a.x, dy = c.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0; const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y); if (d < b) { b = d; bi = i; } }
      const a = pts[bi], c = pts[bi + 1]; let ra = null, rc = null; ra = blkC(a.x, a.y); rc = blkC(c.x, c.y);
      return [bi, pts.length - 1, [Math.round(a.x), Math.round(a.y)], [Math.round(c.x), Math.round(c.y)], ra, rc, Math.round(Math.hypot(c.x - a.x, c.y - a.y))]; };
    const distTo = (pts, x, y) => { if (!pts || pts.length < 2) return null; let b = Infinity; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], c = pts[i + 1], dx = c.x - a.x, dy = c.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0; const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y); if (d < b) b = d; } return Math.round(b); };
    let wrapped = false, ST0 = null;
    // ★[T1320] 막힌 칸 = 존 걸음 정본 술어(`deps.isTerrainBlockedLocal` — 칸 단위: 바위 · 물(다리 예외) · 해안 띠). 종전(T1311)은 걸음 점 자체를 지형 술어에 물어
    //   칸 경계 근처 점(점은 능선 다각형 안 · 칸 중심은 열림)을 바위로 셌다 — 칸 정본과 다른 셈. 바위 칸만(`rockC`)은 칸 중심을 `isRockCellLocal` 로.
    const blkC = (x, y) => { try { return ST0 && ST0.deps && ST0.deps.isTerrainBlockedLocal ? !!ST0.deps.isTerrainBlockedLocal(x, y) : false; } catch (e) { return false; } };
    const rockC = (x, y) => { try { return T.isRockCellLocal(ZID, Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16); } catch (e) { return false; } };
    const wrap = (st) => {
      if (wrapped || !st.roads || typeof st.roads.stampEntityPx !== 'function') return; wrapped = true; ST0 = st;
      const f = st.roads.stampEntityPx.bind(st.roads);
      st.roads.stampEntityPx = function (p, x, y) {
        if (ALL) try { allAgg.n++; { const pr = p && p.pid != null ? p.pid : null, rr = (roleOf.get(pr) || ((p && p.isNPC) ? 'npc' : '?')).split('#')[0], NB = allAgg.nBy || (allAgg.nBy = {}); NB[rr] = (NB[rr] || 0) + 1; } if (blkC(x, y)) { allAgg.rock++; if (rockC(x, y)) allAgg.rockC = (allAgg.rockC || 0) + 1;
          { // ★[T1320] 전수 가름(표본 400 이 아니라 막힌 걸음 하나하나) — 칸: 바위 · 물(다리 아님) · 그 밖(해안 띠 · 판 중 생긴 막힘 — 환호 도랑) / 꼴: 길 꼭짓점이 막힌 칸 · 마디가 막힌 칸을 깎음 · 길 밖(다시 붙기 · 호위 잇기) · 몸 모름
            const cx = Math.floor(x / 32) * 32 + 16, cy = Math.floor(y / 32) * 32 + 16, K = allAgg.k || (allAgg.k = {});
            const cell = rockC(x, y) ? 'rock' : (T.isWaterCellLocal(ZID, cx, cy) ? 'water' : 'other');
            const pid0 = p && p.pid != null ? p.pid : null, b0 = bodyOf.get(pid0); let geo = 'unk';
            if (b0) { const dd = distTo(b0.pts, x, y), sg = segAt(b0.pts, x, y); geo = dd > 2 ? 'off' : (sg && (sg[4] || sg[5]) ? 'vertex' : 'cut'); }
            const key = cell + '/' + geo; K[key] = (K[key] || 0) + 1; } const pid = p && p.pid != null ? p.pid : null, role = roleOf.get(pid) || ((p && p.isNPC) ? 'npc' : '?');
          const rk = role.split('#')[0]; allAgg.byRole[rk] = (allAgg.byRole[rk] || 0) + 1;
          if (allAgg.rs.length < 400) { const b = bodyOf.get(pid); allAgg.rs.push([Math.round(x), Math.round(y), role, pid, b ? distTo(b.pts, x, y) : null, b && b._t661 && b._t661.path ? distTo(b._t661.path.pts, x, y) : null, Math.round(p.x), Math.round(p.y), b ? segAt(b.pts, x, y) : null]); } } } catch (e) {}
        try { const v = valleyOf(ZID, x, y, ZW); if (v) { stepAgg.n++; stepAgg.by[v]++; if (p && p.pid != null) stepAgg.pids.add(p.pid);
          if (blkC(x, y)) { stepAgg.rock++; if (stepAgg.rs.length < 200) stepAgg.rs.push([Math.round(x), Math.round(y), v, roleOf.get(p && p.pid != null ? p.pid : (p && p.id)) || '?', p && p.pid != null ? p.pid : null]); }
          } } catch (e) {}
        return f(p, x, y);
      };
    };
    const STEPF = OUT.replace(/\.jsonl$/, '') + '.steps.json';
    const iv2 = setInterval(() => { try { fs.writeFileSync(STEPF, JSON.stringify({ zone: ZID, wrapped, n: stepAgg.n, rock: stepAgg.rock, water: stepAgg.water, by: stepAgg.by, bodies: stepAgg.pids.size, rockAt: stepAgg.rs, all: ALL ? allAgg : undefined, t1320: (() => { try { const VV = require(path.join(ROOT, 'server', 'villages')); return VV.t1320Stat ? VV.t1320Stat() : null; } catch (e) { return null; } })(), pidRole: ALL ? Object.fromEntries(allAgg.rs.map((r) => [r[3], roleOf.get(r[3]) || null])) : undefined, daily })); } catch (e) {} }, 2000);
    if (iv2.unref) iv2.unref();
    // ★[T1320] 날마다 누계(econ 날이 바뀐 첫 표본 — 가상 시계 판에선 같은 씨 = 같은 줄 · 판 끝을 언제 끊었는지와 무관)
    const daily = []; let lastD = null;
    const iv = setInterval(() => {
      const st = globalThis.__t533st && globalThis.__t533st();
      if (st && st.world && st.world.day !== lastD) { lastD = st.world.day; daily.push([lastD, stepAgg.n, stepAgg.rock, stepAgg.by.쇠재, stepAgg.by.한재, allAgg.n, allAgg.rock, allAgg.spawnN, allAgg.spawnRock.length, allAgg.rockC || 0, Object.assign({}, allAgg.k || {})]); }
      if (st && T) wrap(st);
      if (!st || !st.ready || !st.caravanBodies || !st.deps || !st.deps.players) return;
      if (!ST0) ST0 = st;
      if (!T) { T = require(path.join(ROOT, 'server', 'terrain')); const { ZONES } = require(path.join(ROOT, 'server', 'zone-config')); ZW = ZONES[ZID].zoneWidth; }
      const now = Date.now(), seen = new Set();
      for (const body of st.caravanBodies.values()) {
        const ents = [['m', body.pid]].concat((body.escorts || []).map((e, i) => ['e' + i, e && (e.pid != null ? e.pid : e)]));
        for (const [role, pid] of ents) roleOf.set(pid, role + '#' + (body.c ? body.c.id : '?') + ':' + body.phase);
        for (const [role, pid] of ents) { bodyOf.set(pid, body); if (ALL && !seenPid.has(pid)) { seenPid.add(pid); const pp = st.deps.players.get(pid); if (pp) { allAgg.spawnN++; try { if (blkC(pp.x, pp.y) && allAgg.spawnRock.length < 100) allAgg.spawnRock.push([Math.round(pp.x), Math.round(pp.y), role, body.phase, !!body._xzIn]); } catch (e) {} } } }
        for (const [role, pid] of ents) {
          const p = st.deps.players.get(pid); if (!p) continue;
          const v = valleyOf(ZID, p.x, p.y, ZW); const k = (body.c ? body.c.id : body.pid) + ':' + role;
          let o = live.get(k);
          if (!v) { if (o) { o.tOut = now; flush(k, o, 'left'); } continue; }
          seen.add(k);
          if (!o) { o = { zone: ZID, valley: v, cid: body.c ? body.c.id : null, role, phase0: body.phase, xz: !!(body.c && (body.c._xz || body._xzSendWait || body._xzIn)), tIn: now, tOut: now, n: 0, stillN: 0, stillMs: 0, stillMax: 0, _still0: null, rockN: 0, minX: p.x, maxX: p.x, rf0: body.repairFailN | 0, lx: p.x, ly: p.y, seamTouch: false }; live.set(k, o); }
          o.n++; o.tOut = now; o.minX = Math.min(o.minX, p.x); o.maxX = Math.max(o.maxX, p.x); o.phase = body.phase; o.rf = body.repairFailN | 0;
          if (ZID === 'hanbando' ? p.x >= ZW - 48 : p.x <= 48) o.seamTouch = true;
          const moved = Math.hypot(p.x - o.lx, p.y - o.ly);
          if (moved < 1 && body.phase !== 'linger' && (body.len - body.prog) > 0.5) { if (o._still0 == null) o._still0 = now; o.stillN++; o.stillMax = Math.max(o.stillMax, now - o._still0); }
          else o._still0 = null;
          o.lx = p.x; o.ly = p.y;
          if (blkC(p.x, p.y)) o.rockN++;
        }
      }
      for (const [k, o] of live) if (!seen.has(k)) flush(k, o, 'gone');
    }, 250);
    if (iv.unref) iv.unref();
  }
} else if (MODE === 'rock') {
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); T.setZonesMeta(ZONES);
  const J = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); const SX = ZONES.nippon.worldOffsetX;
  let tot = 0, rock = 0, water = 0, routes = 0, bad = 0; const badList = [];
  for (const r of J.rows) {
    if (r.at === '그 밖') continue; routes++; let rr = 0;
    for (const [Z, pts] of [['hanbando', r.ptsA], ['nippon', r.ptsB]]) { const z = ZONES[Z];
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
        for (let t = 0; t <= L; t++) { const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L; if (Math.abs(x + z.worldOffsetX - SX) > 3000) continue;
          tot++; const cx = Math.floor(x / 32) * 32 + 16, cy = Math.floor(y / 32) * 32 + 16; if (T.isRockCellLocal(Z, cx, cy)) { rock++; rr++; } else if (T.isWaterCellLocal(Z, cx, cy)) water++; } } }   // ★[T1320] 칸 중심(존 걸음 칸 정본)
    if (rr) { bad++; badList.push(`${r.a}→${r.b}@${r.at}:${rr}`); }
  }
  console.log(`골짜기 창을 지나는 길 ${routes} · 창 안 점 ${tot} · 바위 위 ${rock} · 물 위 ${water} · 바위 밟는 길 ${bad}${badList.length ? ' · ' + badList.slice(0, 8).join(' ') : ''}`);
} else if (MODE === 'straighten') {
  // 한반도 짝 골짜기 쇠재 · 한재의 이음매 앞 갈고리 펴기 — 첫 점 → 끝 점 곧은 줄 위에 같은 점 수(4)를 고르게(폭 그대로 · 끝 두 점 그대로 ⇒ 닛폰 골짜기 방향 무변)
  //   node scripts/t1311-seam-walk.js straighten [--file <json>]
  const i = process.argv.indexOf('--file'), FILE = i > 0 ? process.argv[i + 1] : path.join(ROOT, 'server', 'hanbando-terrain.json');
  const disk = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const nm of ['쇠재', '한재']) {
    const v = disk.hanbando.valleys.find((x) => x.name === nm); const P = v.path, a = P[0].pos, b = P[P.length - 1].pos, n = P.length;
    const before = JSON.stringify(P.map((q) => q.pos));
    v.path = P.map((q, k) => ({ pos: [Math.round(a[0] + (b[0] - a[0]) * k / (n - 1)), Math.round(a[1] + (b[1] - a[1]) * k / (n - 1))], width: q.width }));
    console.log(`${nm}: ${before} → ${JSON.stringify(v.path.map((q) => q.pos))}`);
  }
  fs.writeFileSync(FILE, JSON.stringify(disk));
} else if (MODE === 'run') {
  const [OUTD, TAG, SEED, DAYS = '30', DMS = '3000'] = process.argv.slice(3);
  fs.mkdirSync(OUTD, { recursive: true });
  const { spawnSync } = require('child_process');
  const env = Object.assign({}, process.env);
  env.NODE_OPTIONS = ((env.NODE_OPTIONS || '') + ` --require ${__filename}`).trim();
  for (const z of ['hanbando', 'nippon']) { try { fs.unlinkSync(path.join(OUTD, `pass_${TAG}_${z}.jsonl`)); } catch (e) {} }
  // 훅은 존마다 제 파일에 — 존 id 를 파일 이름에 넣으려고 `T1311_OUT` 은 디렉터리 + 표지(훅이 존 id 를 붙인다)
  env.T1311_OUT_DIR = OUTD; env.T1311_TAG = TAG;
  const r = spawnSync(process.execPath, [path.join(__dirname, 't533-xzone-server.js'), 'run', TAG, SEED, DMS, DAYS, OUTD, 'on'], { cwd: ROOT, env, stdio: 'inherit' });
  process.exit(r.status || 0);
} else if (MODE === 'table') {
  const D = process.argv[3]; const rows = [];
  for (const f of fs.readdirSync(D).filter((x) => /^meta_.*\.json$/.test(x))) {
    const m = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); const tag = m.tag;
    const last = (z) => { try { const L = fs.readFileSync(path.join(D, `rows_${tag}_${z}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); return L.filter((r) => r.day <= m.DAYS).pop() || L.pop(); } catch (e) { return null; } };
    const pass = (z) => { try { return fs.readFileSync(path.join(D, `pass_${tag}_${z}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
    const H = last('hanbando'), N = last('nippon'), P = pass('hanbando').concat(pass('nippon'));
    const xs = (r) => (r && r.xz && r.xz.st) || {};
    const by = (v) => P.filter((p) => p.valley === v && p.role === 'm');
    const cell = (v) => { const L = by(v); return { n: L.length, seam: L.filter((p) => p.seamTouch).length, stillMax: L.reduce((a, p) => Math.max(a, p.stillMax), 0), stillN: L.reduce((a, p) => a + p.stillN, 0), rock: L.reduce((a, p) => a + p.rockN, 0), rf: L.reduce((a, p) => a + Math.max(0, (p.rf | 0) - (p.rf0 | 0)), 0) }; };
    rows.push({ tag, seed: m.seed, done: m.done, days: m.days, wallS: m.wallS,
      H: { sent: xs(H).sent, sentOk: xs(H).sentOk, bodyOut: xs(H).bodyOut, bodyIn: xs(H).bodyIn, crossArrive: xs(H).crossArrive, crossReturn: xs(H).crossReturn, soldOk: xs(H).soldOk, deposited: xs(H).deposited, lost: xs(H).lost, walkWaitLate: xs(H).walkWaitLate, pop: H && H.pop },
      N: { sent: xs(N).sent, sentOk: xs(N).sentOk, bodyOut: xs(N).bodyOut, bodyIn: xs(N).bodyIn, crossArrive: xs(N).crossArrive, crossReturn: xs(N).crossReturn, soldOk: xs(N).soldOk, deposited: xs(N).deposited, lost: xs(N).lost, walkWaitLate: xs(N).walkWaitLate, pop: N && N.pop },
      쇠재: cell('쇠재'), 한재: cell('한재'),
      steps: ['hanbando', 'nippon'].map((z) => { try { return JSON.parse(fs.readFileSync(path.join(D, `pass_${tag}_${z}.steps.json`), 'utf8')); } catch (e) { return null; } }),
      logs: ['hanbando', 'nippon'].map((z) => { let t = ''; try { t = fs.readFileSync(path.join(D, `z_${tag}_${z}.log`), 'utf8'); } catch (e) {} return { block: (t.match(/차단 감지/g) || []).length, repairFail: (t.match(/로컬 재경로 실패/g) || []).length, isolate: (t.match(/완전 고립/g) || []).length, late: (t.match(/econ 도착 \+\d+일 지연/g) || []).length }; }), escort: P.filter((p) => p.role !== 'm').length, escortRock: P.filter((p) => p.role !== 'm').reduce((a, p) => a + p.rockN, 0) });
  }
  rows.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  console.log(JSON.stringify(rows, null, 1));
}
