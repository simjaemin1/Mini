// (@regress 없음 — 러너 밖 · T1442 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1442-army-probe.js — 행군 병사가 플레이어 울타리 · 벽 · 문을 뚫고 지나나(T1442 할 일 1 — 재현 · 관통 수) ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1442-army-probe.js" T1442_PROBE_OUT=<파일.json> WAR_FIXTURE=assault
//             node scripts/t577-server-run.js <날> <시드>` (판 자가 아이 존에 env 를 그대로 준다)
//   ⓐ 전쟁 몸(`state.warBodies`)이 처음 행군로(`body.pts` · px)를 가진 틱에 — 그 길 위 두 자리에 막는 줄을 놓는다:
//      pass = 행군로 40 % 자리(고개 · 행군 중) — 길에 곧게 가로지른 울타리(칸) 25개(가운데 ± 12 · `T1442_PROBE_HALF`)
//      gate = 주둔 링(`body.campProg`)과 방어 마을 사이 가운데(돌격 · 전장) — 길에 곧게 가로지른 벽(변) 25개 · 가운데 하나는 닫힌 문
//      가짜 플레이어(`p_t1442` · 소켓 0 · 보는 사람 0)가 **제품 건축 길 그대로**(`_tryBuildAt` · 비용 0) 놓는다 — 놓인 수 · 거절 수.
//   ⓑ 틱마다 — 모든 전쟁 몸의 모든 대형(공격 · 방어 · 귀환)의 병사(`g.units` — 셀 좌표) · 지휘관 점(`g.cmd`)이 지난 틱 칸 → 이번 틱 칸으로 걸을 때
//      놓은 울타리 칸에 들어서거나 벽 · 문 변을 넘으면 = 관통 한 번(병사-칸). 가름: 깨어 있는 청크 / 잠든 청크(존 `isPositionActive`) ×
//      행군(`w.phase` march) / 전진(battle · 교전 전 advance) / 전장(교전 engaged — battle-core 가 몸을 모는 판) / 귀환. 놓은 물건이 아직 서 있는지(건물 표)도 틱마다 본다.
//   ⚠읽기만 — 병사 · 대형 · 건물을 안 바꾼다(놓기 한 번 말고는). 존 술어 `_warBlockedCell` 을 같은 칸에 물어 "술어가 이 칸을 막힘으로 보나"도 적는다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1442_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();   // [T1288] 판 자(`판.js` · `t577-server-run`)가 central 을 준다 — 없을 때만 닿지 않는 값(무동작)
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1442_PROBE_OUT, SZ = 32, HALF = +(process.env.T1442_PROBE_HALF || 12);
const rec = { fixture: process.env.WAR_FIXTURE || null, wars: {}, pen: {}, penList: [], ticks: 0, firstFight: null, end: null, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
let Hz = null, HV = null;
const zH = () => Hz || (Hz = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
//   ★걸음마다 재려고 — 존 틱 한 번에 전쟁 몸이 여러 걸음(하루 몫 `_t681Flush` 가 `_warTickOne` 을 몇백 번 · 귀환 `_warPaceReturn`)을 걷는다.
//     틱마다 재면 한 번에 백 칸을 건너뛰어 "지나갔나 · 돌아갔나"를 못 가린다 ⇒ 읽을 때 두 함수 끝에 계측 한 줄을 붙인다(이 프로세스 메모리 안 글자만 · 파일 무변 · 판 값 무변).
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      const A = 'function _warTickOne(w, body, now, dtMs, C) {', B = 'function _warPaceReturn(body, now, dtMs) {';
      if (src.split(A).length === 2) src = src.replace(A, 'function _warTickOne(w, body, now, dtMs, C) { const __r = _warTickOne__t1442(w, body, now, dtMs, C); try { if (global.__t1442Step) global.__t1442Step(w, body); } catch (e) {} return __r; }\n' + A.replace('_warTickOne(', '_warTickOne__t1442('));
      else rec.err = 'hookA';
      if (src.split(B).length === 2) src = src.replace(B, 'function _warPaceReturn(body, now, dtMs) { const __r = _warPaceReturn__t1442(body, now, dtMs); try { if (global.__t1442Step) global.__t1442Step(body.w, body); } catch (e) {} return __r; }\n' + B.replace('_warPaceReturn(', '_warPaceReturn__t1442('));
      else rec.err = 'hookB';
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { tick(); } catch (e) { rec.err = String(e && e.stack).slice(0, 600); }
      return out;
    };
  }
  return r;
};
process.on('exit', () => { rec.end = { ticks: rec.ticks }; save(); });
const fences = new Map(), edges = new Map(), bars = [];   // 칸 키 → {war, kind, id} · 변 키(칸 × 2 + E) → {…}
const ck = (x, y) => x * 65536 + y;
function polyAt(pts, s) {   // 길 위 s(px) 자리 · 방향
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + L >= s && L > 0) { const t = (s - acc) / L; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L }; }
    acc += L;
  }
  const a = pts[pts.length - 2] || pts[0], b = pts[pts.length - 1]; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: b.x, y: b.y, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
}
//   줄 하나 놓기 — (cx, cy) 를 가운데로 길(방향 horiz = 동서)에 곧게 가로지른 2 × HALF + 1 칸 · what = fence(칸) | wall(변 · 가운데 하나는 닫힌 문)
function placeLine(w, kind, what, cx, cy, horiz) {
  const H = zH(); if (!H) return null;
  const P = { playerId: 'p_t1442', name: '길막이', inventory: {}, ws: null, x: 0, y: 0, floor: 0, vp: 0 };
  const placed = [], refused = [];
  for (let i = -HALF; i <= HALF; i++) {
    const x = horiz ? cx : cx + i, y = horiz ? cy + i : cy;
    const type = what === 'wall' && i === 0 ? 'door' : what, side = what === 'fence' ? null : (horiz ? 'E' : 'N');
    P.x = x * SZ + SZ / 2; P.y = y * SZ + SZ / 2; let ok = false;
    try { ok = !!H._tryBuildAt(P, type, 0, side, null, { skipCost: true }); } catch (e) { ok = false; }
    if (!ok) { refused.push([x, y]); continue; }
    let id = null; for (const b of H.buildings.values()) if (b.ownerId === 'p_t1442' && b.type === type && Math.floor(b.x / SZ) === x && Math.floor(b.y / SZ) === y && (!side || ((b.data && b.data.side) || 'N') === side)) { id = b.id; break; }
    if (type === 'door' && id) { const b = H.buildings.get(id); if (b && b.data) b.data.open = false; }
    placed.push({ x, y, id, type, side });
    const e = { war: w.id, kind, id, type };
    if (type === 'fence') fences.set(ck(x, y), e); else edges.set(ck(x, y) * 2 + (side === 'E' ? 1 : 0), e);
  }
  const ids = placed.map((q) => q.id).filter(Boolean);
  const lx = horiz ? (what === 'fence' ? cx + 0.5 : cx + 1) : cx + 0.5, ly = horiz ? cy + 0.5 : (what === 'fence' ? cy + 0.5 : cy);
  bars.push({ war: w.id, kind, type: what, ids, lx, ly, ax: horiz ? 1 : 0, ay: horiz ? 0 : 1, half: HALF + 0.5 });
  return { at: [cx, cy], horiz, placed: placed.length, refused: refused.length, cells: placed.map((q) => [q.x, q.y, q.type, q.side]),
    warBlk: placed.filter((q) => HV && HV._warBlockedCell && HV._warBlockedCell(q.x, q.y)).length };
}
//   자리 다섯 — route = 행군로(`body.pts`) 40 % 자리(지휘관 장부 걸음이 지나는 길 · 울타리) · camp = 행군로의 주둔 링과 방어 마을 사이 가운데(벽 + 문) ·
//     pass = 공격 대형 몸이 처음 선 때 그 무게중심에서 방어 마을 쪽 AHEAD 칸(병사 몸 앞 · 울타리) ·
//     gate = 돌격(교전 `advance`)이 열린 때 공격 무게중심에서 방어 마을 쪽 AHEAD 칸(방어 마을 앞 · 벽 + 문) ·
//     field = 교전(`engaged`)이 열린 때 두 무게중심 가운데(전장 · 울타리 — 전투 중 짓기 · `_tryBuildAt` 에 전쟁 문 없음)
const AHEAD = +(process.env.T1442_PROBE_AHEAD || 15);
function cen(g) { let x = 0, y = 0, n = 0; for (const u of (g && g.units) || []) if (!u.dead && isFinite(u.x)) { x += u.x; y += u.y; n++; } return n ? { x: x / n, y: y / n, n } : null; }
function ahead(w, c) { const tx = w.def.ccx, ty = w.def.ccy, dx = tx - c.x, dy = ty - c.y, L = Math.hypot(dx, dy) || 1, k = Math.min(AHEAD, L * 0.5);
  return { cx: Math.floor(c.x + dx / L * k), cy: Math.floor(c.y + dy / L * k), horiz: Math.abs(dx) >= Math.abs(dy) }; }
function place(st, body, w, W) {
  W.groups = W.groups || {};
  if (!W.groups.route && body.pts && body.pts.length >= 2) { const c = polyAt(body.pts, (body.len || 0) * 0.4); W.groups.route = placeLine(w, 'route', 'fence', Math.floor(c.x / SZ), Math.floor(c.y / SZ), Math.abs(c.dx) >= Math.abs(c.dy)); save(); }
  const a = cen(body.atkGroup);
  if (!W.groups.pass && a) { const q = ahead(w, a); W.groups.pass = placeLine(w, 'pass', 'fence', q.cx, q.cy, q.horiz); W.groups.pass.phase = w.phase; W.groups.pass.day = st.world.day; save(); }
  if (!W.groups.camp && body.pts && body.pts.length >= 2 && body.campProg != null) { const c = polyAt(body.pts, (body.campProg + (body.len || 0)) / 2); W.groups.camp = placeLine(w, 'camp', 'wall', Math.floor(c.x / SZ), Math.floor(c.y / SZ), Math.abs(c.dx) >= Math.abs(c.dy)); save(); }
  const d = cen(body.defGroup);
  if (!W.groups.field && a && d && body.fight && body.fight.state === 'engaged') { const mx = (a.x + d.x) / 2, my = (a.y + d.y) / 2; W.groups.field = placeLine(w, 'field', 'fence', Math.floor(mx), Math.floor(my), Math.abs(d.x - a.x) >= Math.abs(d.y - a.y)); W.groups.field.day = st.world.day; save(); }
  if (!W.groups.gate && a && body.fight && body.fight.state === 'advance') { const q = ahead(w, a); W.groups.gate = placeLine(w, 'gate', 'wall', q.cx, q.cy, q.horiz); W.groups.gate.phase = w.phase; W.groups.gate.day = st.world.day; save(); }
}
const edgeHit = (cx, cy, sx, sy) => sx === 1 ? edges.get(ck(cx, cy) * 2 + 1) : sx === -1 ? edges.get(ck(cx - 1, cy) * 2 + 1) : sy === 1 ? edges.get(ck(cx, cy + 1) * 2) : sy === -1 ? edges.get(ck(cx, cy) * 2) : null;
function stepHits(ox, oy, nx, ny) {   // 칸 걷기(`_t1423StepHit` 꼴 — 대각 = 두 L 길이 다 막혀야 · 들어선 칸 울타리) → 지난 물건들
  let cx = Math.floor(ox), cy = Math.floor(oy); const tx = Math.floor(nx), ty = Math.floor(ny), hit = [];
  let n = 0;
  while ((cx !== tx || cy !== ty) && ++n < 64) {
    const sx = Math.sign(tx - cx), sy = Math.sign(ty - cy);
    if (sx && sy) { const a1 = edgeHit(cx, cy, sx, 0) || edgeHit(cx + sx, cy, 0, sy), a2 = edgeHit(cx, cy, 0, sy) || edgeHit(cx, cy + sy, sx, 0); if (a1 && a2) hit.push(a1); cx += sx; cy += sy; }
    else if (sx) { const e = edgeHit(cx, cy, sx, 0); if (e) hit.push(e); cx += sx; }
    else { const e = edgeHit(cx, cy, 0, sy); if (e) hit.push(e); cy += sy; }
    const f = fences.get(ck(cx, cy)); if (f) hit.push(f);
  }
  return hit;
}
const prev = new WeakMap(), seenU = new WeakMap();   // 지난 자리 · 이미 센 병사(줄마다 한 번 — 관통 병사 수)
function standing(id) { const H = zH(); const b = H && H.buildings.get(id); if (!b) return false; const d = b.data || {}; return !d.damaged && !(b.type === 'door' && d.open); }
global.__t1442Step = (w, body) => {
  if (!HV) { const m = require.cache[VF]; if (!m || !m.exports.__p3Bind) return; HV = m.exports.__p3Bind({}); }
  try { step(HV.state, HV, w, body); } catch (e) { rec.err = String(e && e.stack).slice(0, 600); }
};
function tick(st) {   // 존 틱 — 셈 · 저장만(재기는 걸음마다 `step`)
  rec.ticks++;
  if (rec.ticks % 500 === 0) save();
}
function step(st, V, w, body) {
  rec.steps = (rec.steps || 0) + 1;
  const active = st.deps && st.deps.isPositionActive;
  const wid = w.id;
  let W = rec.wars[wid];
  if (!W) {
    if (!body.pts || body.pts.length < 2) return;
    W = rec.wars[wid] = { id: wid, atk: w.atk && w.atk.name, def: w.def && w.def.name, kind: w.kind || null, day0: st.world && st.world.day, len: Math.round(body.len || 0), campProg: Math.round(body.campProg || 0), groups: null, phases: {}, maxUnits: 0, fightDay: null, endDay: null, steps: 0 };
  }
  place(st, body, w, W);
  W.steps++;
  W.phases[w.phase] = (W.phases[w.phase] || 0) + 1;
  if (body.fight && body.fight.state === 'engaged' && W.fightDay == null) { W.fightDay = st.world.day; if (!rec.firstFight) rec.firstFight = st.world.day; }
  if (body.ended && W.endDay == null) { W.endDay = st.world.day; W.ended = body.ended; save(); }
  const gs = [['atk', body.atkGroup], ['def', body.defGroup], ['ret', body.retGroup]];
  let nu = 0;
  for (const [gn, g] of gs) {
    if (!g) continue;
    const subjects = (g.units || []).filter((u) => !u.dead).map((u) => [u, 'u']);
    if (g.cmd) subjects.push([{ _k: g, x: g.cmd.cx, y: g.cmd.cy }, 'cmd']);   // 지휘관 점(셀)
    for (const [u, who] of subjects) {
      if (who === 'u') nu++;
      const x = u.x, y = u.y; if (!(isFinite(x) && isFinite(y))) continue;
      const key = u._k || u, p = prev.get(key); prev.set(key, [x, y]);
      if (!p) { rec.first = rec.first || []; if (rec.first.length < 40) rec.first.push({ day: st.world.day, g: gn, who, phase: w.phase, at: [+x.toFixed(1), +y.toFixed(1)] }); continue; }
      const jump = Math.hypot(x - p[0], y - p[1]); if (jump > (rec.maxJump || 0)) rec.maxJump = +jump.toFixed(2);
      if (jump > 3) { rec.jumps = rec.jumps || []; if (rec.jumps.length < 60) rec.jumps.push({ day: st.world.day, g: gn, who, phase: w.phase, fight: body.fight ? body.fight.state : null, from: [+p[0].toFixed(1), +p[1].toFixed(1)], to: [+x.toFixed(1), +y.toFixed(1)], d: +jump.toFixed(1) }); rec.nJump = (rec.nJump || 0) + 1; }
      const zone = active ? (active(x * SZ, y * SZ) ? 'awake' : 'sleep') : 'na', where = w.phase === 'battle' ? (body.fight && body.fight.state === 'engaged' ? 'field' : 'advance') : (w.phase || 'march');
      if (who === 'cmd') continue;   // 지휘관 점은 명령 자리(몸 아님) — 셈 밖
      for (const e of stepHits(p[0], p[1], x, y)) {
        if (!standing(e.id)) continue;
        const k = [e.kind, e.type, gn, zone, where].join('|');
        rec.pen[k] = (rec.pen[k] || 0) + 1;
        { let S = seenU.get(u); if (!S) seenU.set(u, S = new Set()); if (!S.has(e.kind)) { S.add(e.kind); rec.penUnits = rec.penUnits || {}; rec.penUnits[e.kind + '|' + gn] = (rec.penUnits[e.kind + '|' + gn] || 0) + 1; } }
        const pb = V._warBlockedCell ? !!V._warBlockedCell(Math.floor(x), Math.floor(y)) : null;
        if (rec.penList.length < 400) rec.penList.push({ day: st.world.day, war: wid, kind: e.kind, type: e.type, g: gn, zone, where, from: [+p[0].toFixed(2), +p[1].toFixed(2)], to: [+x.toFixed(2), +y.toFixed(2)], predBlk: pb });
      }
      if (who === 'u') { const f = fences.get(ck(Math.floor(x), Math.floor(y))); if (f && standing(f.id)) { const k2 = ['in-fence', gn, zone, where].join('|'); rec.pen[k2] = (rec.pen[k2] || 0) + 1; } }
    }
  }
  if (nu > W.maxUnits) W.maxUnits = nu;
}
