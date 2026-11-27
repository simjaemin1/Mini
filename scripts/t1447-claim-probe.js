// (@regress 없음 — 러너 밖 · T1447 그림 실험 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1447-claim-probe.js — 마을 곁에 사유지를 놓고 막힌 칸이 언제 얼마나 쌓이나(덧붙임 넷 ① 그림 실험) ==========================
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1447-claim-probe.js" T1447_PERSON_GRUDGE=1 T1447_PROBE_OUT=<파일.json> T1447_PROBE_CFG=<설정.json>
//            node scripts/t577-server-run.js <날> <시드>`(판 자가 아이 존에 env 를 그대로 준다 · 존 아이에서만 돈다)
//   설정 { d0: 놓는 날, size: 사유지 한 변(칸), gap: 떨어진 칸 수, classes: { S: 30, M: 100, L: 'top' }, per: 4, place: [['touch','grow'],['gap','grow'],['touch','away'],['gap','away']],
//          snapPct: [25,50,75], snapN: [10,30,100] }
//   ① 놓는 날(d0) 마을을 그날 인구로 셋으로 나눈다(작은 = 30 에 가까운 넷 · 중간 = 100 에 가까운 넷 · 큰 = 인구 위 넷) · 마을마다 자리 하나:
//      자랄 쪽 = 그날 넓힘 후보(영토 둘레 · `_terrGrowCore` 와 같은 값 — 비옥 3.5 − 중심 거리 0.1) 위 60칸의 평균 방향 · 안 자랄 쪽 = 그 반대.
//      그 방향 줄 위에서 한 변 `size` 의 네모가 영토 · 남의 영토 · 막힌 땅 · 다른 사유지에 안 닿는 첫 자리 — 붙음(영토와 변을 맞댐) / 떨어짐(가장 가까운 영토 칸까지 gap + 1).
//      사유지는 존 사유지 표(`claims` — 칸마다 한 행 · 주인 = 시험 주인 · DB 행 0)에 넣는다 → 존 사유지 칸 표(`_t1447ClaimIdx`)가 다음 넓힘부터 본다.
//   ② 날마다(econ 날이 바뀐 틱): 마을 인구 · 영토 · 목표(`_terrGrowCore` 와 같은 식) · 모자란 땅(카드 식 인구 × 32.67 − 영토 · 목표 − 영토) · 굶어 죽음(econ `_fdDeadTot` d0 뒤) ·
//      막힌 칸(econ `_grudgeLand` — 지금도 그 사유지 칸인 것) · 둘레 칸 수 · 그날 새로 막힌 칸.
//   ③ 그림 순간 — 막힌 칸이 사유지의 25 · 50 · 75 % 에 · N칸(10 · 30 · 100)에 처음 닿은 날 + d0 + 마지막 날: 그림 칸(영토 · d0 뒤 넓힌 칸 · 남의 영토 · 막힌 땅 · 사유지 · 막힌 칸).
//   ④ 30 % 판(덧붙임 셋 할 일) — `frac`(0 ~ 1): 토벌이 푸는 몫만 바꾼다 · 차례는 제품 `unclaimPick` 그대로(그 술어를 남은 칸 위에서 거듭 불러 앞에서부터 이어 붙인다 —
//      칸마다 따로 매기는 차례(영토까지 · 중심까지 · y · x)라 이어 붙인 줄 = 한 번에 다 매긴 줄 · 차례 사본 0) · `sizes`: 마을마다 사유지 한 변을 돌려 가며(한 판에 크기 여럿).
//      토벌마다(`rec.picks`) 푼 칸 · 그 칸이 마을 영토가 된 날(바뀐 날만 `tl`) · 날 줄에 명분(0/1) · 남은 사유지 칸 · 그림 순간 = 토벌 다음 날(풀린 칸 따로 표시).
//   ⚠읽기만 — 사유지를 놓는 것(과 ④ 의 푸는 몫) 말고는 마을 · 존 상태를 한 칸도 안 바꾼다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1447_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1447_PROBE_OUT;
const CFG = Object.assign({ d0: 200, size: 3, gap: 3, classes: { S: 30, M: 100, L: 'top' }, per: 4,
  place: [['touch', 'grow'], ['gap', 'grow'], ['touch', 'away'], ['gap', 'away']], snapPct: [25, 50, 75], snapN: [10, 30, 100], margin: 14 },
  process.env.T1447_PROBE_CFG ? JSON.parse(fs.readFileSync(process.env.T1447_PROBE_CFG, 'utf8')) : {});
const rec = { cfg: CFG, knob: process.env.T1447_PERSON_GRUDGE || '', placed: [], days: [], snaps: [], picks: [], err: null, last: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1447v') < 0) src += '\n;module.exports.__t1447v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1447v(), d = (st.world && st.world.day) | 0;
        if (d !== lastDay) { lastDay = d; day(st, m.exports, d); }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 800); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
const VL = () => require(path.join(ROOT, 'server', 'village-layout'));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const K = (x, y) => x + ',' + y;
const popOf = (v) => (v.econ && v.econ.npcs && v.econ.npcs.length) || 0;
function targetOf(v) {
  const e = v.econ; if (!e || !e.land) return 0;
  const L = VL(), hs = (e._t958Plan !== undefined && e._t958Plan !== null) ? e._t958Plan : (e.housing || 0);
  let t = L.territoryTarget(e.land.size, hs).target;
  if (!e.founder) t = Math.min(t, Math.ceil(popOf(v) / ((L.HOUSE_CAP_PER_FLOOR || 6) * (L.HOUSE_MAX_FLOORS || 1))) * L.TERR_PER_LOT + L.TERR_CORE);
  return t;
}
//   그날 넓힘 후보의 값(`_terrGrowCore` 와 같은 식 — 비옥 3.5 · 중심 거리 −0.1) 위 60칸의 평균 방향
function growDir(st, v) {
  const ta = st.ta, own = v._terrSet, cand = new Map(), fert = (x, y) => (ta.fert ? ta.fert(x, y) : 0.5);
  const others = (st.villages || []).filter((w) => w !== v && w._terrSet);
  for (const k of own) {
    const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, nk = K(nx, ny); if (own.has(nk) || cand.has(nk) || ta.isBlocked(nx, ny)) continue;
      if (others.some((w) => w._terrSet.has(nk))) continue;
      cand.set(nk, 3.5 * fert(nx, ny) - 0.1 * Math.hypot(nx - v.ccx, ny - v.ccy)); }
  }
  const top = [...cand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  let sx = 0, sy = 0;
  for (const [k] of top) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1), dx = x - v.ccx, dy = y - v.ccy, L = Math.hypot(dx, dy) || 1; sx += dx / L; sy += dy / L; }
  if (Math.hypot(sx, sy) < 1e-6 && top.length) { const k = top[0][0], i = k.indexOf(','); sx = +k.slice(0, i) - v.ccx; sy = +k.slice(i + 1) - v.ccy; }
  return { th: Math.atan2(sy, sx), cand: cand.size, top: top.length, mag: +(Math.hypot(sx, sy) / Math.max(1, top.length)).toFixed(3) };
}
//   자리 찾기 — 방향 th 줄 위 · 영토 · 남의 영토 · 막힌 땅 · 다른 사유지 칸이 없는 네모(한 변 s) · 붙음 / 떨어짐
function findSpot(st, v, th, s, mode, gap, taken) {
  const ta = st.ta, own = v._terrSet, others = (st.villages || []).filter((w) => w !== v && w._terrSet);
  const free = (x, y) => !own.has(K(x, y)) && !ta.isBlocked(x, y) && !taken.has(K(x, y)) && !others.some((w) => w._terrSet.has(K(x, y)));
  const minD = (x0, y0) => {   // 네모에서 가장 가까운 제 영토 칸까지 체비쇼프 거리(gap + 2 까지만 본다)
    for (let r = 1; r <= gap + 2; r++) for (let y = y0 - r; y < y0 + s + r; y++) for (let x = x0 - r; x < x0 + s + r; x++) {
      if (x >= x0 && x < x0 + s && y >= y0 && y < y0 + s) continue;
      if (Math.max(x < x0 ? x0 - x : (x >= x0 + s ? x - x0 - s + 1 : 0), y < y0 ? y0 - y : (y >= y0 + s ? y - y0 - s + 1 : 0)) !== r) continue;
      if (own.has(K(x, y))) return r;
    }
    return gap + 3;
  };
  for (const dth of [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05]) {
    const a = th + dth;
    for (let t = 0; t <= 260; t += 0.5) {
      const cx = v.ccx + t * Math.cos(a), cy = v.ccy + t * Math.sin(a), x0 = Math.round(cx - s / 2), y0 = Math.round(cy - s / 2);
      let ok = true;
      for (let y = y0; y < y0 + s && ok; y++) for (let x = x0; x < x0 + s && ok; x++) if (!free(x, y)) ok = false;
      if (!ok) continue;
      if (mode === 'touch') {
        let adj = false;
        for (let y = y0; y < y0 + s && !adj; y++) for (let x = x0; x < x0 + s && !adj; x++) for (const [dx, dy] of N4) if (own.has(K(x + dx, y + dy))) { adj = true; break; }
        if (adj) return { x0, y0, t, dth };
        continue;
      }
      if (minD(x0, y0) >= gap + 1) return { x0, y0, t, dth, d: minD(x0, y0) };
    }
  }
  return null;
}
let placed = false, ix0 = null;
const T = [];   // 시험 사유지
function place(st, d) {
  const Hb = Hz(); if (!Hb || !Hb.claims) { rec.err = 'zone __testBind 없음'; return; }
  const vs = (st.villages || []).filter((v) => v.econ && v._terrSet && v._terrSet.size && !v.econ.founder && popOf(v) > 0);
  const used = new Set(), pick = (n, fn) => { const out = []; for (const v of vs.slice().sort(fn)) { if (used.has(v)) continue; out.push(v); used.add(v); if (out.length >= n) break; } return out; };
  const C = CFG.classes, groups = [];
  groups.push(['L', C.L === 'top' ? pick(CFG.per, (a, b) => popOf(b) - popOf(a)) : pick(CFG.per, (a, b) => Math.abs(popOf(a) - C.L) - Math.abs(popOf(b) - C.L))]);
  groups.push(['M', pick(CFG.per, (a, b) => Math.abs(popOf(a) - C.M) - Math.abs(popOf(b) - C.M))]);
  groups.push(['S', pick(CFG.per, (a, b) => Math.abs(popOf(a) - C.S) - Math.abs(popOf(b) - C.S))]);
  const taken = new Set();
  for (const c of Hb.claims.values()) for (const [x, y] of (c.cells && c.cells.length ? c.cells : [[Math.floor(c.x / 32), Math.floor(c.y / 32)]])) taken.add(K(x, y));
  let n = 0;
  for (const [cls, list] of groups) list.forEach((v, i) => {
    const [mode, side] = CFG.place[i % CFG.place.length], S = CFG.sizes ? CFG.sizes[(rec.placed.length) % CFG.sizes.length] : CFG.size;
    const gd = growDir(st, v), th = side === 'grow' ? gd.th : gd.th + Math.PI;
    const sp = findSpot(st, v, th, S, mode, CFG.gap, taken);
    const ent = { cls, vid: v.dbId, vname: v.name, pop0: popOf(v), terr0: v._terrSet.size, target0: targetOf(v), fd0: v.econ._fdDeadTot || 0, ccx: v.ccx, ccy: v.ccy, mode, side, grow: gd, spot: sp };
    if (!sp) { ent.fail = true; rec.placed.push(ent); return; }
    n++;
    const pid = 'T1447P' + n, cells = [];
    for (let y = sp.y0; y < sp.y0 + S; y++) for (let x = sp.x0; x < sp.x0 + S; x++) {
      const id = `t1447c_${n}_${x}_${y}`;
      Hb.claims.set(id, { id, ownerPid: pid, ownerName: '시험' + n, x: x * 32, y: y * 32, w: 32, h: 32, kind: 'personal', guildTribeId: null, guildTribeName: null, state: 'active', createdAt: 0 });
      cells.push([x, y]); taken.add(K(x, y));
    }
    const per = new Set(); for (const [x, y] of cells) for (const [dx, dy] of N4) if (!cells.some(([a, b]) => a === x + dx && b === y + dy)) { per.add(K(x, y)); break; }
    Object.assign(ent, { pid, cells, perim: per.size, size: cells.length });
    rec.placed.push(ent);
    T.push({ ent, v, terr0: new Set(v._terrSet), hit: {}, last: -1 });
  });
  placed = true; ix0 = d;
  if (CFG.frac != null) {   // ④ 푸는 몫 — 제품 술어의 차례 그대로 앞에서 frac 만큼(올림 · 적어도 한 칸)
    const G = require(path.join(ROOT, 'server', 'grudge')), orig = G.unclaimPick;
    G.unclaimPick = function (cells, terr, ccx, ccy) {
      const n = Math.max(1, Math.ceil(cells.length * CFG.frac)), out = [];
      let rem = cells.slice();
      while (out.length < n && rem.length) { const p = orig(rem, terr, ccx, ccy); if (!p.length) break; out.push(...p); const s = new Set(p); rem = rem.filter((k) => !s.has(k)); }
      const pick = out.slice(0, n), v = (st.villages || []).find((w) => w._terrSet === terr), t = T.find((x) => x.v === v);
      rec.picks.push({ d: curDay, vid: v ? v.dbId : null, vname: v ? v.name : null, i: t ? T.indexOf(t) : -1, n: pick.length, of: cells.length, cells: pick, tl: [] });
      save();
      return pick;
    };
  }
}
let curDay = -1;
const liveOf = (pid) => { const Hb = Hz(), s = new Set(); if (Hb && Hb.claims) for (const c of Hb.claims.values()) if (c.ownerPid === pid && c.state !== 'released') s.add(K(Math.floor(c.x / 32), Math.floor(c.y / 32))); return s; };
function snap(t, st, d, why) {
  const v = t.v, e = t.ent, M = CFG.margin, own = v._terrSet;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const k of own) { const i = k.indexOf(','); ext(+k.slice(0, i), +k.slice(i + 1)); }
  for (const [x, y] of e.cells) ext(x, y);
  x0 -= M; y0 -= M; x1 += M; y1 += M;
  const W = x1 - x0 + 1, Hh = y1 - y0 + 1, g = new Array(W * Hh).fill(0);   // 0 빈 땅 · 1 막힌 땅 · 2 남의 영토 · 3 d0 영토 · 4 d0 뒤 넓힌 칸 · 5 사유지 · 6 막힌 칸
  const ta = st.ta, others = (st.villages || []).filter((w) => w !== v && w._terrSet);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = K(x, y), i = (y - y0) * W + (x - x0);
    if (own.has(k)) g[i] = t.terr0.has(k) ? 3 : 4;
    else if (others.some((w) => w._terrSet.has(k))) g[i] = 2;
    else if (ta.isBlocked(x, y)) g[i] = 1;
  }
  const L = v.econ._grudgeLand && v.econ._grudgeLand[e.pid], blk = new Set(L ? L.c : []), live = liveOf(e.pid);
  for (const [x, y] of e.cells) { const i = (y - y0) * W + (x - x0), k = K(x, y); g[i] = live.has(k) ? (blk.has(k) ? 6 : 5) : (own.has(k) ? 8 : 7); }   // 7 토벌로 풀린 빈 칸 · 8 풀린 뒤 마을이 가진 칸
  rec.snaps.push({ i: T.indexOf(t), why, d, x0, y0, W, H: Hh, g: g.join(''), line: lineOf(t, d) });
  save();
}
function lineOf(t, d) {
  const v = t.v, e = t.ent, pop = popOf(v), terr = v._terrSet.size, tgt = targetOf(v), G = require(path.join(ROOT, 'server', 'grudge'));
  return { d, pop, terr, tgt, short32: Math.round(pop * 32.67 - terr), shortT: tgt - terr, fd: (v.econ._fdDeadTot || 0) - e.fd0, blk: G.landCount(v.econ, e.pid), grown: terr - t.ent.terr0 };
}
//   값 표(덧붙임 넷 ②) — 그날 마을마다 그림자 값(거래소가 쓰는 `shadowPricesOf`) · 원한 1 의 값(30날 × 식량 값) · 해코지 몇 가지의 값
function prices(st, SV, d) {
  const E2 = st.econV2; if (!E2) return;
  const K = ['food', 'wood', 'stone', 'wheat', 'rice', 'barley', 'fruit', 'meat', 'fish', 'cooked_food', 'salt'];
  const rows = [];
  for (const v of st.villages || []) {
    if (!v.econ) continue;
    let P = null; try { P = E2.shadowPricesOf ? E2.shadowPricesOf(v.econ, K) : E2.computeShadowPrices(v.econ); } catch (e) { P = null; }
    if (!P) continue;
    const r = { vid: v.dbId, name: v.name, pop: popOf(v), p: {}, q: {}, b: {} }; for (const k of K) r.p[k] = +(+P[k] || 0).toFixed(4);
    //   견줌 둘 — 시세(`computeVillagePrices` — 기준가 × 곳간 형편 배수 0.3 ~ 5 · central 마을 시세 패널이 보이는 그 값) · 기준가(`BASE_VALUE` — 마을 무관)
    try { const E1 = require(path.join(ROOT, 'sim', 'economy-sim')), Q = E1.computeVillagePrices(v.econ); for (const k of K) { r.q[k] = +(+(Q && Q[k]) || 0).toFixed(4); r.b[k] = +(+(E1.BASE_VALUE && E1.BASE_VALUE[k]) || 0).toFixed(4); } } catch (e) { r.qErr = String(e.message).slice(0, 120); }
    r.unit = SV.t1447Unit ? +SV.t1447Unit(v).toFixed(4) : null;
    r.fe = st.warCore && st.warCore.warFE ? +st.warCore.warFE(v.econ).toFixed(1) : null;
    rows.push(r);
  }
  (rec.prices || (rec.prices = [])).push({ d, rows });
  save();
}
function day(st, SV, d) {
  if (CFG.prices && CFG.prices.includes(d)) prices(st, SV, d);
  if (CFG.noClaims) return;
  if (!placed && d >= CFG.d0) place(st, d);
  if (!placed) return;
  const G = require(path.join(ROOT, 'server', 'grudge'));
  curDay = d;
  const row = { d, t: [] };
  for (const t of T) {
    const L = lineOf(t, d), r = [L.pop, L.terr, L.tgt, L.blk, L.fd, L.grown];
    if (CFG.frac != null) { let cs = 0; try { cs = (SV.t1447Casus ? SV.t1447Casus(t.v, t.ent.pid) : G.casus(t.v.econ, t.ent.pid)).ok ? 1 : 0; } catch (e) {} r.push(cs, liveOf(t.ent.pid).size); }
    row.t.push(r);
    const e = t.ent, pct = 100 * L.blk / e.size;
    if (d === ix0) snap(t, st, d, 'd0');
    for (const p of CFG.snapPct) if (pct >= p && !t.hit['p' + p]) { t.hit['p' + p] = d; snap(t, st, d, p + '%'); }
    for (const n of CFG.snapN) if (L.blk >= n && !t.hit['n' + n]) { t.hit['n' + n] = d; snap(t, st, d, n + '칸'); }
    if (L.blk > t.last) { t.last = L.blk; }
  }
  for (const p of rec.picks) {   // ④ 푼 칸 가운데 마을 영토가 된 칸 수(바뀐 날만) · 토벌 다음 날 그림
    const t = T[p.i]; if (!t) continue;
    const got = p.cells.filter((k) => t.v._terrSet.has(k)).length, lt = p.tl.length ? p.tl[p.tl.length - 1][1] : -1;
    if (got !== lt) p.tl.push([d, got]);
    if (d === p.d + 1) snap(t, st, d, '토벌 뒤');
  }
  rec.days.push(row);
  rec.last = { d, hits: T.map((t) => t.hit) };
  if (rec.days.length % 20 === 0) save();
}
process.on('exit', () => {
  try { const st = require.cache[VF] && require.cache[VF].exports.__t1447v && require.cache[VF].exports.__t1447v(); if (st) for (const t of T) snap(t, st, (st.world && st.world.day) | 0, '끝'); } catch (e) { rec.err = String(e && e.stack).slice(0, 800); }
  try { const SV = require.cache[VF] && require.cache[VF].exports; rec.stat = SV && SV.t1447Stat ? SV.t1447Stat() : null; } catch (e) {}
  save();
});
