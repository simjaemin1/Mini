// (@regress 없음 — 러너 밖 · T1466 판정 재기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1466-judge-probe.js — 길목 선포 판정의 초가 어디에 드나(진단) ==========
//   쓰는 법: T1440 봇 판(`scripts/t1440-bot-probe.js`)에 같이 싣는다 —
//     NODE_OPTIONS="--require <t745-vclock> --require scripts/t1440-bot-probe.js --require scripts/t1466-judge-probe.js" T1466_JP_OUT=<파일.json> …
//   판정 하나(`RoadRule.judgeStep` 이 끝낸 일)마다: CPU · 쌍 · 갈래 일 수 · 쌍 전체 다시 구하기(`routeTemp`) 하나하나 —
//     걸음(1 · 2 · J) · 3배 문턱 · CPU · 코스 A* 꺼낸 수(`PathCore.pathStep` 의 S.pops) · 찾음 · 손댄 코스 칸 수(scratch 세대 칸) ·
//     메모가 차가워 새로 판 코스 칸 열림(`coarseOpen`) · 이웃 잇기(`_t598EdgeOk`) · 칸 배수(`openN`) 수.
//   그 판정의 쌍들이 떠나는 마을 수(쌍 열쇠 두 끝 · 겹침 — 탐욕 덮개 = 마을마다 한 번 훑기의 횟수) · 같은 코스 칸을 여러 쌍이 거듭 본 몫.
//   제품 글자에는 손대지 않는다 — villages.js 원문을 실을 때 셈 줄 셋만 덧붙인다(값 무관).
//   T1466_JP_SHADOW=<팔>(a · c …) — T1440 판정(이 판의 답)이 끝날 때마다 같은 조각 · 같은 메타로 그 팔의 판정을 그 자리에서 한 번 더(세계 무변 — 놓기 전 ·
//     RoadRule 셈은 되돌린다) · 답 견줌(판정 · 남의 사유지 내줌 · 길이 지나는 칸 · 쌍마다 새 길 길이 · 칸 · 걸음) · CPU 둘.
//   판 자체가 T1466 켬이면(`job.fast`) 그 판정의 한 번 훑기 셈(훑기 수 · 꺼냄 · CPU)도 적는다.
//   T1466_LAB=<econ 날> — 그날(마을 틱 뒤) 길 칸 전수: 지나는 쌍이 많은 칸 T1466_LAB_BUSY(기본 100 · 다리 포함) + 길 칸에서 고른 칸 T1466_LAB_RAND(기본 300 · 씨 1466)을
//     하나씩 "그 칸 하나를 사유지로 선포한다면"(급 = 마을 땅이면 3 · 아니면 2 · 처음 내줌에서 끝 — 한 칸 선포 그 판정) T1440 판정 + 그림자 팔 · 세계 무변(놓지 않는다) · 끝나면 판을 닫는다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1466_JP_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const RF = path.join(ROOT, 'server', 'road-rule.js'), VF = path.join(ROOT, 'server', 'villages.js'), PF = path.join(ROOT, 'sim', 'path-core.js');
const OUT = process.env.T1466_JP_OUT, MIN = +(process.env.T1466_JP_MIN || 150), SHADOW = process.env.T1466_JP_SHADOW || '';
const LAB = process.env.T1466_LAB ? +process.env.T1466_LAB : null, LAB_BUSY = +(process.env.T1466_LAB_BUSY || 100), LAB_RAND = +(process.env.T1466_LAB_RAND || 300);
const ZF = path.join(ROOT, 'server', 'zone.js');
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const plen = (p) => { let L = 0; for (let i = 1; i < (p || []).length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return L; };
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
const ARMS = SHADOW ? SHADOW.split(',') : [];
const cmp0 = () => ({ n: 0, same: 0, v: 0, pb: 0, pass: 0, len: 0, cells: 0, step: 0, pairs: 0, pairsLen: 0, pairsCells: 0, cpuA: [], cpuB: [], diff: [] });
const rec = { min: MIN, shadow: SHADOW, jobs: [], small: { n: 0, cpu: [] }, cmp: Object.fromEntries(ARMS.map((a) => [a, cmp0()])), err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
global.__t1466c = { co: 0, eo: 0, on: 0 };
const C = global.__t1466c;
let cur = null, inTemp = null;
const VV = () => { const m = require.cache[VF]; return m && m.exports && m.exports.__t1466v ? m.exports.__t1466v() : null; };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      const pat = [
        ['function coarseOpen(ta, gx, gy, brSet) {', 'function coarseOpen(ta, gx, gy, brSet) { __t1466c.co++;'],
        ['  if (E && (E.done[i] & bit)) return !!(E.ok[i] & bit);', '  if (E && (E.done[i] & bit)) return !!(E.ok[i] & bit);\n  __t1466c.eo++;'],
        ['    if (n < 0) {\n      n = 0;\n      const bx = gx * DIST_STEP, by = gy * DIST_STEP;', '    if (n < 0) { __t1466c.on++;\n      n = 0;\n      const bx = gx * DIST_STEP, by = gy * DIST_STEP;'],
        ['function _t1440Reroute(body, p) {\n  _t1440Flush();', 'function _t1440Reroute(body, p) { const __c0 = process.cpuUsage(); try { return __t1466rr(body, p); } finally { const __u = process.cpuUsage(__c0); (__t1466c.rr || (__t1466c.rr = [])).push((__u.user + __u.system) / 1000); } }\nfunction __t1466rr(body, p) {\n  _t1440Flush();'],
        ['  if (x0 <= x1) _t1440ForgetRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);\n}', '  if (x0 <= x1) _t1440ForgetRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);\n  if (x0 <= x1 && __t1466c.mark) __t1466c.mark(x0, y0, x1, y1);\n}'],
        ['  if (T1440_ROAD_RULE && Number.isFinite(cx) && Number.isFinite(cy)) { _t1440ForgetRect(cx - 1, cy - 1, cx + 1, cy + 1); lifeSiteResetAll(); return; }', '  if (T1440_ROAD_RULE && Number.isFinite(cx) && Number.isFinite(cy)) { if (__t1466c.mark) __t1466c.mark(cx, cy, cx, cy); _t1440ForgetRect(cx - 1, cy - 1, cx + 1, cy + 1); lifeSiteResetAll(); return; }\n  if (__t1466c.all) __t1466c.all();'],
      ];
      for (const [a, b] of pat) { const k = src.split(a).length - 1; if (k === 1) src = src.replace(a, b); else (rec.patchMiss = rec.patchMiss || []).push([a.slice(0, 40), k]); }
      if (src.indexOf('__t1466g') < 0) src += '\n;module.exports.__t1466g = function () { return { state, RoadRule, mode: _t1440Mode, forget: _t1440ForgetPiece, gen: () => ({ cg: (state.roads && state.roads.coarseGen) ? state.roads.coarseGen() : 0 }), ctx() { const R = ensureRouteGrid(); if (!R) return null; const { gw, gh, ta } = R, blk = R.blk, edge = _T598E; if (T598_ROUTE_COST || _T598E) _t598Arrays(gw, gh); const RD = state._routeFrozenRD || state.roads; const cost = _routeCostMul(R, RD, _routeTerrMul(R)); const E = ta._t1440M || state._t598Edge; const open = (x, y) => { const i = y * gw + x; let o = blk[i]; if (o === 0) o = blk[i] = coarseOpen(ta, x, y) ? 1 : 2; return o === 1; }; const step = (ux, uy, dx, dy) => { const nx = ux + dx, ny = uy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return false; if (!open(nx, ny)) return false; if (edge) { const u = uy * gw + ux, bit = 1 << ((dx + 1) * 3 + (dy + 1)); if (E && (E.done[u] & bit)) { if (!(E.ok[u] & bit)) return false; } else if (!_t598EdgeOk(ta, ux, uy, dx, dy, gw)) return false; } if (dx && dy && (!open(ux + dx, uy) || !open(ux, uy + dy))) return false; return true; }; const isBlk = _routeIsBlk(R, null); return { gw, gh, open, step, cost, snap: (px, py) => _routeSnap(R, isBlk, px, py), finish: (A, B, nodes) => _routeFinish({ x0: A.x, y0: A.y, x1: B.x, y1: B.y, half: R.half, ta: T1327_ROUTE_FIX ? ta : undefined }, nodes) }; } }; };\n';
      if (src.indexOf('__t1466v') < 0) src += '\n;module.exports.__t1466v = function () { return { state, cells: _t1327Cells, SZ, route2: (piece, x0, y0, x1, y1) => { RoadRule.sAdd(\'__t1440tmp\', piece, \'V\'); _t1440ForgetPiece(piece); try { return _t1440Route2(x0, y0, x1, y1); } finally { RoadRule.sDel(\'__t1440tmp\'); _t1440ForgetPiece(piece); } } }; };\n';
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF && LAB != null) {
    const g = m.exports.onGameTick; let did = false;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { const V = m.exports.__t1466v(), st = V.state, d = (st.world && st.world.day) | 0; if (!did && d >= LAB && st.routeCache && st.routeCache.size) { did = true; lab(V, m.exports, d); } }
      catch (e) { rec.err = 'lab ' + String(e && e.stack).slice(0, 800); save(); }
      return out;
    };
  }
  if (filename === PF) {
    const ps = m.exports.pathStep;
    m.exports.pathStep = function (S, b) {
      const c0 = cpuMs(), out = ps.apply(this, arguments), dt = cpuMs() - c0;
      if (inTemp && out && out.done && S) {
        let n = 0;
        if (S.sc && S.sc.stamp) {
          const st = S.sc.stamp, g = S.scGen;
          if (cur && (!cur.cnt || cur.cnt.length !== st.length)) cur.cnt = new Uint16Array(st.length);
          const cnt = cur ? cur.cnt : null;
          for (let i = 0; i < st.length; i++) if (st[i] === g) { n++; if (cnt && cnt[i] < 65535) cnt[i]++; }
        }
        inTemp.searches.push({ pops: S.pops, found: !!S.found, cpu: +dt.toFixed(2), touched: n, max: S.maxPops });
      }
      return out;
    };
  }
  if (filename === RF) {
    const ex = m.exports, js = ex.judgeStep, bj = ex.bindJudge;
    ex.bindJudge = function (ctx) {
      const rt = ctx.routeTemp, en = ctx.ends; let lastKey = null;
      if (ARMS.some((a) => a.indexOf('b') >= 0) && ctx.multiBegin) {   // ㉯ 시제품 — 'b' 팔의 한 번 훑기 자리를 관문 그래프 물음으로
        const mb = ctx.multiBegin, ms = ctx.multiStep, mf = ctx.multiFree;
        ctx.multiBegin = function (piece, M, src, tg, arm) { if (!arm || arm.indexOf('b') < 0) return mb.apply(this, arguments); return { gate: true, piece, M, src, tgts: tg, ph: 0, out: new Map(), cpu: 0, pops: 0, slices: 0, mode: M === ex.M1 ? '1' : '2' }; };
        ctx.multiStep = function (SS, budget) { if (!SS.gate) return ms.apply(this, arguments); if (SS.ph !== 3) { const r = gate().query(SS.piece, SS.M, SS.src, SS.tgts); SS.out = r.out; SS.cpu = r.cpu; SS.ph = 3; } return true; };
        ctx.multiFree = function (SS) { if (!SS || SS.gate) return; return mf.apply(this, arguments); };
      }
      ctx.ends = function (key) { lastKey = key; return en.apply(this, arguments); };
      ctx.routeTemp = function (piece, x0, y0, x1, y1, M, bound) {
        const call = { key: lastKey, mode: M === ex.M1 ? '1' : (M === ex.M2 ? '2' : 'J'), bound: bound ? Math.round(bound) : 0, d: Math.round(Math.hypot(x1 - x0, y1 - y0)), searches: [] };
        lastKey = null;
        const co0 = C.co, eo0 = C.eo, on0 = C.on, c0 = cpuMs(); inTemp = call;
        let r; try { r = rt.apply(this, arguments); } finally { inTemp = null; }
        call.cpu = +(cpuMs() - c0).toFixed(2); call.co = C.co - co0; call.eo = C.eo - eo0; call.on = C.on - on0; call.len = r ? Math.round(plen(r)) : null;
        if (cur) cur.calls.push(call);
        return r;
      };
      return bj.call(this, ctx);
    };
    ex.judgeStep = function (job, budget) {
      if (job._shadow) return js.apply(this, arguments);
      const prev = cur; cur = job._jp || (job._jp = { calls: [], cnt: null, t: Date.now() });
      try { return js.apply(this, arguments); }
      finally {
        const jp = cur; cur = prev;
        if (job.phase === 'done' && !job._jpDone) {
          job._jpDone = 1;
          let sh = null; if (ARMS.length && !job.fast) { sh = {}; for (const arm of ARMS) { if (arm.indexOf('b') >= 0 && (job.cpu || 0) < MIN) continue; try { sh[arm] = shadow(ex, js, job, arm); } catch (e) { rec.err = 'shadow ' + String(e && e.stack).slice(0, 600); } } }
          if (sh) job._sh = sh;
          try { done(job, jp, sh); } catch (e) { rec.err = String(e && e.stack).slice(0, 600); }
        }
      }
    };
  }
  return r;
};
let _gate = null;
function gate() {
  if (_gate) return _gate;
  const m = require.cache[VF], Gx = m.exports.__t1466g();
  _gate = require('./t1466-gate-proto.js')(Gx, +(process.env.T1466_GATE_C || 16));
  C.mark = (x0, y0, x1, y1) => _gate.mark(x0, y0, x1, y1); C.all = () => _gate.all();
  rec.gate = _gate.st;
  return _gate;
}
function cover(keys) {   // 탐욕 덮개 — 쌍 열쇠(두 끝 마을)마다 한 끝이 고른 마을이면 덮인다 · 고른 마을 수 = 마을마다 한 번 훑기 횟수
  const left = new Set(keys), pick = [];
  while (left.size) {
    const cnt = new Map(); for (const k of left) for (const v of String(k).split('_')) cnt.set(v, (cnt.get(v) || 0) + 1);
    let best = null, bn = -1; for (const [v, n] of cnt) if (n > bn || (n === bn && v < best)) { best = v; bn = n; }
    pick.push([best, bn]); for (const k of [...left]) if (String(k).split('_').includes(best)) left.delete(k);
  }
  return pick;
}
//   그림자 판정 — 같은 조각 · 같은 메타 · 같은 세계(놓기 전)로 그 팔을 끝까지 · RoadRule 셈(st)은 되돌린다
function stSave(st) { const o = {}; for (const [k, v] of Object.entries(st)) o[k] = Array.isArray(v) ? (k === 'cpu' || k === 'pairs' ? v.length : v.slice()) : (v && typeof v === 'object' ? Object.assign({}, v) : v); return o; }
function stLoad(st, o) { for (const [k, v] of Object.entries(o)) { if (k === 'cpu' || k === 'pairs') st[k].length = v; else st[k] = v; } }
function cellsOfPts(ex, pts) { const C = new Set(); if (!pts) return C; for (let i = 1; i < pts.length; i++) ex._R.cellsOf(pts[i - 1], pts[i], (x, y) => { C.add(x * 65536 + y); return false; }); return C; }
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
function passCells(ex, job) { const P = new Set(job.piece.cells), out = new Set(); for (const m of job.fail || []) for (const c of cellsOfPts(ex, m.pts)) { const k = (c % 65536) + Math.floor(c / 65536) * 65536; if (P.has(ex.K(Math.floor(c / 65536), c % 65536))) out.add(c); } return out; }
function pbOf(job) { const s = new Set(); for (const [, pb] of job.passBy || []) for (const id of pb.keys()) s.add(String(id)); return s; }
function fsOf(B) { if (!B.fs) return null; const runs = []; for (const [k, SS] of B.fs.S) if (!runs.some((r) => r.SS === SS)) runs.push({ SS, k }); return { runs: B.fs.runs, pops: B.fs.pops, cpu: +B.fs.cpu.toFixed(1), same: B.fs.same | 0, srcs: B.fs.S.size, each: runs.map(({ SS, k }) => ({ k, tg: SS.tgts.length, pops: SS.pops, rpops: SS.rpops | 0, pocket: SS.pocket | 0, rek: SS.rek | 0, cpu: +SS.cpu.toFixed(1), reach: [...SS.out.values()].filter(Boolean).length, mode: SS.mode, land: !!SS.land, fcpu: +(SS.fcpu || 0).toFixed(1), dsum: SS.dd ? SS.dd.reduce((t, x) => t + x[1], 0) : null, dmax: SS.dd && SS.dd.length ? Math.max(...SS.dd.map((x) => x[1])) : null, cheb: SS.dd && SS.dd.length ? Math.max(...SS.dd.map((x) => x[2])) : null })) }; }
function shadow(ex, js, A, ARM) {
  if (ARM.indexOf('d') >= 0 && !rec.land) { const Vm = require.cache[VF].exports; if (Vm.t1466LandStep && !Vm._t1466L.ready) { const c0 = cpuMs(); Vm.t1466LandStep(0); rec.land = { cpu: +(cpuMs() - c0).toFixed(0), land: Vm._t1466L.cpuLand, warm: +(Vm._t1466L.cpuWarm || 0).toFixed(0), mb: Vm._t1466L.mb, lm: Vm._t1466L.lm.length, hm: Vm._t1466L.hm, ready: Vm._t1466L.ready, st: Vm._t1466L.st, rss: Math.round(process.memoryUsage().rss / 1e6) }; save(); } }
  const st0 = stSave(ex._st), B = ex.judgeBegin(A.piece, A.meta); B.fast = ARM; B._shadow = 1;
  const c0 = cpuMs(); js.call(ex, B, 0); const cpuB = cpuMs() - c0;
  stLoad(ex._st, st0);
  const o = { cpuA: +(A.cpu || 0).toFixed(1), cpuB: +cpuB.toFixed(1), vA: A.verdict, vB: B.verdict, v: A.verdict === B.verdict, pb: setEq(pbOf(A), pbOf(B)), pass: setEq(passCells(ex, A), passCells(ex, B)), fs: fsOf(B) };
  let pairs = 0, len = 0, cells = 0, step = 0; const dl = [];
  if (A.verdict === 'protected' && B.verdict === 'protected') {
    const keys = new Set([...A.res.keys(), ...B.res.keys()]);
    for (const k of keys) {
      pairs++; const pa = A.res.get(k), pb = B.res.get(k), la = pa ? plen(pa) : -1, lb = pb ? plen(pb) : -1;
      if (Math.abs(la - lb) < 1) len++; else dl.push([k, Math.round(la), Math.round(lb), A.stepOf.get(k) || 0, B.stepOf.get(k) || 0]);
      if (setEq(cellsOfPts(ex, pa), cellsOfPts(ex, pb))) cells++;
      if ((A.stepOf.get(k) || 0) === (B.stepOf.get(k) || 0)) step++;
    }
  }
  Object.assign(o, { pairs, len, cells, step, same: o.v && o.pb && o.pass && len === pairs });
  if (ARM.indexOf('c') >= 0 && B.verdict === 'protected' && B.fs && B.fs.keys.size && VV) {   // ㉰ — 한 번 훑기로 끝난 쌍은 버린다 → 다음 출발이 늘 길 구하기(두 걸음)로 판다: 그 길을 지금 판다(조각을 잠깐 넣고) · T1440 이 저장한 길과 견줌
    const V = VV(), cpuR = []; let dn = 0, dl2 = 0, dc2 = 0, nul = 0;
    for (const k of B.fs.keys) {
      const e = ex._J ? null : null; const ids = String(k).split('_'), Av = V.state.byDbId.get(+ids[0]), Bv = V.state.byDbId.get(+ids[1]); if (!Av || !Bv) continue;
      const c1 = cpuMs(); const p = V.route2(A.piece, Av.ccx * V.SZ + V.SZ / 2, Av.ccy * V.SZ + V.SZ / 2, Bv.ccx * V.SZ + V.SZ / 2, Bv.ccy * V.SZ + V.SZ / 2); cpuR.push(+(cpuMs() - c1).toFixed(1));
      dn++; if (!p) nul++;
      const pa = A.res.get(k); if (pa && p && Math.abs(plen(pa) - plen(p)) < 1) dl2++; if (setEq(cellsOfPts(ex, pa), cellsOfPts(ex, p))) dc2++;
    }
    o.defer = { n: dn, lenSameA: dl2, cellsSameA: dc2, nul, cpu: { sum: +cpuR.reduce((a, b) => a + b, 0).toFixed(0), p50: q(cpuR, 0.5), p99: q(cpuR, 0.99), max: cpuR.length ? Math.max(...cpuR) : null } };
    stLoad(ex._st, st0);
  }
  if (dl.length) o.dl = dl.slice(0, 40);
  ex.fastFree(B);
  const C = rec.cmp[ARM]; C.n++; if (o.same) C.same++; if (o.v) C.v++; if (o.pb) C.pb++; if (o.pass) C.pass++; if (pairs && len === pairs) C.len++; if (pairs && cells === pairs) C.cells++; if (pairs && step === pairs) C.step++;
  C.pairs += pairs; C.pairsLen += len; C.pairsCells += cells;
  if (C.cpuA.length < 50000) { C.cpuA.push(o.cpuA); C.cpuB.push(o.cpuB); }
  if (!o.same && C.diff.length < 400) C.diff.push(Object.assign({ at: A.piece.cells.slice(0, 2).map((k) => [k % 65536, Math.floor(k / 65536)]), cls: A.meta.cls, max: A.meta.max, early: !!A.meta.early, npc: !!A.meta.npc, tp: A.touch ? A.touch.length : 0 }, o));
  return o;
}
function done(job, jp, sh) {
  const cpu = job.cpu || 0;
  if (job.meta && job.meta.npc) { const N = rec.npc || (rec.npc = { n: 0, cpu: [], fast: 0, runs: 0 }); N.n++; if (N.cpu.length < 50000) N.cpu.push(+cpu.toFixed(2)); if (job.fast) N.fast++; if (job.fs) N.runs += job.fs.runs | 0; }
  if (cpu < MIN && !(sh && Object.values(sh).some((o) => o && o.cpuB >= MIN))) { rec.small.n++; if (rec.small.cpu.length < 50000) rec.small.cpu.push(+cpu.toFixed(2)); if (rec.small.n % 200 === 0) save(); return; }
  const full = jp.calls.filter((c) => c.key), keys = [...new Set(full.map((c) => c.key))], vil = new Set(); for (const k of keys) for (const v of String(k).split('_')) vil.add(v);
  let tot = 0, uniq = 0, mx = 0; if (jp.cnt) for (let i = 0; i < jp.cnt.length; i++) { const c = jp.cnt[i]; if (c) { uniq++; tot += c; if (c > mx) mx = c; } }
  const pc = (job.piece && job.piece.cells) || [], b = pc.length ? pc.reduce((a, k) => [Math.min(a[0], k % 65536), Math.min(a[1], (k / 65536) | 0), Math.max(a[2], k % 65536), Math.max(a[3], (k / 65536) | 0)], [1e9, 1e9, -1, -1]) : null;
  const sumCpu = jp.calls.reduce((s, c) => s + c.cpu, 0), sumPops = jp.calls.reduce((s, c) => s + c.searches.reduce((t, x) => t + x.pops, 0), 0);
  rec.jobs.push({
    at: b, cells: pc.length, edges: (job.piece && job.piece.edges || []).length, meta: { cls: job.meta.cls, max: job.meta.max, early: !!job.meta.early, npc: !!job.meta.npc },
    verdict: job.verdict, cpu: +cpu.toFixed(1), wall: Date.now() - jp.t, pairs: job.touch ? job.touch.length : 0, groups: job.groups ? job.groups.length : 0,
    n: job.n, tm: Object.fromEntries(Object.entries(job.tm || {}).map(([k, v]) => [k, +(+v).toFixed(1)])), step: [...(job.stepOf || new Map()).values()].reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {}),
    temp: { n: jp.calls.length, cpu: +sumCpu.toFixed(1), pops: sumPops, keys: keys.length, villages: vil.size, cover: cover(keys), searches: jp.calls.reduce((s, c) => s + c.searches.length, 0) },
    overlap: { touchedSum: tot, unique: uniq, maxCount: mx, share: tot ? +(1 - uniq / tot).toFixed(3) : null },
    calls: jp.calls, sh, fs: fsOf(job),
  });
  save();
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lab(V, SV, day) {
  const H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null;
  const st = V.state, SZ = V.SZ, C = new Map();
  for (const [key, pts] of st.routeCache) { if (!pts || pts.length < 2) continue; const seen = new Set(); for (let i = 1; i < pts.length; i++) V.cells(pts[i - 1], pts[i], (x, y) => { const z = x * 65536 + y; if (!seen.has(z)) { seen.add(z); C.set(z, (C.get(z) || 0) + 1); } return false; }); }
  const all = [...C.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const busy = all.slice(0, LAB_BUSY), R = rng(1466), rest = all.slice(LAB_BUSY), rand = [];
  const pick = new Set(); while (rand.length < Math.min(LAB_RAND, rest.length)) { const i = Math.floor(R() * rest.length); if (pick.has(i)) continue; pick.add(i); rand.push(rest[i]); }
  const RR = H && H.RoadRule; if (!RR || !SV.t1440Judge) { rec.err = 'lab: no RoadRule'; save(); return; }
  rec.lab = { day, cells: C.size, busy: busy.length, rand: rand.length, maxPairs: all.length ? all[0][1] : 0, rows: [] };
  save();
  const one = (kind, z, n) => {
    const x = Math.floor(z / 65536), y = z % 65536, lvl = H._t1440VilLand(x, y) ? 3 : 2;
    const bridge = H.isBridgeTileLocal ? !!H.isBridgeTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) : null;
    const job = SV.t1440Judge(RR.pieceCell(x, y), { cls: lvl, max: lvl, early: true });
    job._lab = { kind, x, y, n, lvl, bridge };
    const c0 = cpuMs(); SV.t1440Step(job, 0);
    const row = { kind, x, y, n, lvl, bridge, v: job.verdict, cpu: +(job.cpu || 0).toFixed(1), wallAll: +(cpuMs() - c0).toFixed(1), pairs: job.touch ? job.touch.length : 0, sh: job._sh || null };   // cpu = 판정 안 CPU(판정이 센 것 · 그림자 · 견줌 빼고)
    rec.lab.rows.push(row); save();
  };
  for (const [z, n] of busy) one('busy', z, n);
  for (const [z, n] of rand) one('rand', z, n);
  rec.lab.done = true; rec.lab.cpu = +(cpuMs()).toFixed(0); save();
  setTimeout(() => process.exit(0), 10);
}
process.on('exit', () => { for (const C of Object.values(rec.cmp)) { if (!C.cpuA) continue; C.qa = { p50: q(C.cpuA, 0.5), p90: q(C.cpuA, 0.9), p99: q(C.cpuA, 0.99), max: C.cpuA.length ? Math.max(...C.cpuA) : null }; C.qb = { p50: q(C.cpuB, 0.5), p90: q(C.cpuB, 0.9), p99: q(C.cpuB, 0.99), max: C.cpuB.length ? Math.max(...C.cpuB) : null }; C.cpuA = undefined; C.cpuB = undefined; } if (rec.npc) { rec.npc.p50 = q(rec.npc.cpu, 0.5); rec.npc.p99 = q(rec.npc.cpu, 0.99); rec.npc.max = rec.npc.cpu.length ? Math.max(...rec.npc.cpu) : null; rec.npc.cpu = undefined; } rec.small.p50 = q(rec.small.cpu, 0.5); rec.small.p99 = q(rec.small.cpu, 0.99); rec.small.max = rec.small.cpu.length ? Math.max(...rec.small.cpu) : null; rec.small.cpu = undefined; if (C.rr) rec.reroute = { n: C.rr.length, p50: q(C.rr, 0.5), p99: q(C.rr, 0.99), max: C.rr.length ? +Math.max(...C.rr).toFixed(1) : null }; try { const ru = process.resourceUsage(), mu = process.memoryUsage(); rec.mem = { maxRssMB: Math.round(ru.maxRSS / 1024), rssMB: Math.round(mu.rss / 1e6), heapMB: Math.round(mu.heapUsed / 1e6) }; const Vm = require.cache[VF] && require.cache[VF].exports; if (Vm && Vm._t1466L) { const L = Vm._t1466L; rec.L = { ready: L.ready, st: L.st, bakes: L.bakes, drop: L.drop | 0, why: L.why || null, land: L.cpuLand, warm: Math.round(L.cpuWarm || 0), mb: L.mb }; } if (Vm && Vm._t1466S) rec.S = Object.assign({}, Vm._t1466S); } catch (e) {} rec.end = Date.now(); save(); });
