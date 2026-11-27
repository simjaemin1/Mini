// (@regress 없음 — 러너 밖 · T1466 괴롭히기 판 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1466-stress-probe.js — 길 확인 줄을 괴롭힌다(가짜 플레이어 · 제품 문 그대로 `tryClaim` 임시 사유지 · `tryUnclaim`) ==========
//   쓰는 법: NODE_OPTIONS="--require <t745-vclock> --require scripts/t1466-stress-probe.js" T1466_ST_OUT=<파일.json> T1466_ST_DAY=<econ 날> node scripts/t577-server-run.js <날> <시드>
//   그날(마을 틱 뒤) 지나는 쌍이 많은 길 칸(마을 30칸 밖 · 서로 40칸 밖) 열 곳을 고르고, 틱을 따라 셋을 차례로 한다 — 손짓은 한 번씩만(줄에 서면 틱이 민다 · 봇처럼 끝까지 밀지 않는다):
//     ① 한 사람이 같은 칸을 잡았다 놓았다 100번(손짓 → 판정이 끝나면 다시 손짓 = 선포 → 놓기)
//     ② 열 사람이 서로 다른 목을 한 틱에(각자 한 번 손짓 → 줄 → 다 끝날 때까지)
//     ③ 한 사람이 목 열 곳을 잇달아(앞 판정이 끝나면 다음 손짓)
//   잰 것: 판정마다 손짓에서 답까지 틱(존 `_t1440Zs.pendTicks` 의 끝난 차례) · 그 판 동안 서버 CPU(초 · 33ms 틱 시계 대비 %) · 틱 CPU 분포 ·
//     같은 판정을 기억에서 다시 쓴 수(존 판정 메모 히트) · 캐러밴이 선 수(`claimStop`) · 다시 구해 이음(`reroute`)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1466_ST_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js'), SZ = 32;
const OUT = process.env.T1466_ST_OUT, DAY = +(process.env.T1466_ST_DAY || 10), N1 = +(process.env.T1466_ST_N1 || 100);
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const rec = { day: DAY, knob: process.env.T1466_ROAD_FAST || '', sites: null, s1: null, s2: null, s3: null, err: null, end: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const TK = []; let tkOn = false;
{ const _si = global.setInterval; global.setInterval = function (fn, ms, ...rest) {
  if (typeof fn === 'function' && ms > 30 && ms < 40 && String(fn).length > 20000) { const f0 = fn; fn = function () { const c0 = cpuMs(); try { return f0.apply(this, arguments); } finally { if (tkOn) TK.push(cpuMs() - c0); } }; }
  return _si.call(this, fn, ms, ...rest);
}; try { require('timers').setInterval = global.setInterval; } catch (e) {} }
const Hz = () => { const m = require.cache[ZF]; return m && m.exports && m.exports.__testBind ? m.exports.__testBind() : null; };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let fired = false;
    m.exports.onGameTick = function () { const out = g.apply(this, arguments); try { tick(m.exports); } catch (e) { rec.err = String(e && e.stack).slice(0, 900); save(); } void fired; return out; };
  }
  return r;
};
const BOTS = new Map();
const bot = (id) => { let P = BOTS.get(id); if (!P) { P = { playerId: id, pid: null, name: '괴롭' + id.slice(-3), inventory: { wood: 9999, stone: 9999 }, ws: null, x: 0, y: 0, floor: 0, vp: 0, toolItems: [] }; BOTS.set(id, P); } return P; };
let S = null;   // 판 상태
function pick(H, st) {
  const C = new Map();
  for (const [key, pts] of st.routeCache) { if (!pts || pts.length < 2) continue; const seen = new Set(); for (let i = 1; i < pts.length; i++) H.SimVillages.__t1440.cells(pts[i - 1], pts[i], (x, y) => { const z = x * 65536 + y; if (!seen.has(z)) { seen.add(z); C.set(z, (C.get(z) || 0) + 1); } return false; }); }
  const vil = st.villages || [], far = (x, y, pts, r) => pts.every(([a, b]) => Math.hypot(a - x, b - y) > r);
  const out = [];
  for (const [z, n] of [...C.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    const x = Math.floor(z / 65536), y = z % 65536;
    if (!far(x, y, vil.map((v) => [v.ccx, v.ccy]), 30) || !far(x, y, out.map((o) => [o.x, o.y]), 40)) continue;
    if (H._t1440VilLand(x, y)) continue;   // 마을 땅 밖(급 2)
    out.push({ x, y, n }); if (out.length >= 10) break;
  }
  return out;
}
const pendOf = (H, P) => H._t1440Q.some((e) => e.player === P && !e.peek);
function gesture(H, P, x, y) {
  P.x = x * SZ + SZ / 2; P.y = y * SZ + SZ / 2; P._t1440Msg = { type: 'claim', kind: 'temporary' }; P._t1440Raw = null;
  const sig = H._t1440Sig(H.RoadRule.pieceCell(x, y)); P._t1440Ok = sig; P._t1440Road = 'avoid:' + sig;   // 묻는 판정이면 다짐 · 길 위 칸 고름 = 비켜 가게(판정 51 기본)
  const hit0 = S.memoHit;
  try { H.tryClaim(P, 'temporary'); } catch (e) { rec.gErr = String(e && e.message); }
  return { pend: pendOf(H, P), mine: [...H.claims.values()].find((c) => c.ownerPid === P.playerId && Math.floor(c.x / SZ) === x && Math.floor(c.y / SZ) === y) || null, hit: S.memoHit > hit0 };
}
function release(H, P, c) { if (c) { try { H.tryUnclaim(P, c.id, true); } catch (e) { rec.uErr = String(e && e.message); } } }
function win(H, V) { return { c0: cpuMs(), t0: S.tick, pd0: H._t1440Zs.pendTicks.length, T0: Object.assign({}, V.t1440Stat ? V.t1440Stat() : {}), tk0: TK.length }; }
function close(H, V, w) {
  const T1 = V.t1440Stat ? V.t1440Stat() : {}, ticks = S.tick - w.t0, cpu = cpuMs() - w.c0, pt = H._t1440Zs.pendTicks.slice(w.pd0), tk = TK.slice(w.tk0);
  return { ticks, wallS: +(ticks / 30).toFixed(1), cpuS: +(cpu / 1000).toFixed(2), cpuPct: ticks ? +(100 * cpu / (ticks * 33.3)).toFixed(1) : null, waits: pt.map((x) => x[0]), waitP50: q(pt.map((x) => x[0]), 0.5), waitMax: pt.length ? Math.max(...pt.map((x) => x[0])) : null, judgeCpuMax: pt.length ? Math.max(...pt.map((x) => x[1])) : null,
    tickP50: q(tk, 0.5), tickP99: q(tk, 0.99), tickMax: tk.length ? +Math.max(...tk).toFixed(1) : null, judgeCpuS: +(((T1.judgeCpu || 0) - (w.T0.judgeCpu || 0)) / 1000).toFixed(2), claimStop: (T1.claimStop | 0) - (w.T0.claimStop | 0), reroute: (T1.reroute | 0) - (w.T0.reroute | 0), rerouteFail: (T1.rerouteFail | 0) - (w.T0.rerouteFail | 0), memoHit: S.memoHit };
}
function tick(V) {
  const H = Hz(); if (!H || !H._t1440Q) return;
  const st = V.__t1440 ? V.__t1440.state() : null; if (!st || !st.routeCache) return;
  const d = (st.world && st.world.day) | 0;
  if (!S) { if (d < DAY || !st.routeCache.size) return; S = { ph: 's1', i: 0, tick: 0, memoHit: 0, wait: 0 }; rec.sites = pick(H, st); save(); tkOn = true;
    const _jc = H._t1440Jc, _get = _jc.get.bind(_jc); _jc.get = (k) => { const j = _get(k); if (j && j.phase === 'done') S.memoHit++; return j; };   // 기억한 판정을 꺼낸 수(낡음 검사 앞 — 버린 것도 센다)
    S.w = win(H, V); }
  S.tick++;
  const sites = rec.sites; if (!sites.length) { rec.err = 'no sites'; S.ph = 'end'; }
  if (S.ph === 's1') {   // ① 한 사람 · 같은 칸 · 잡았다 놓았다 N1 번
    const P = bot('p_t1466a'), X = sites[0];
    if (S.wait) { if (pendOf(H, P)) return; S.wait = 0; }
    const g = gesture(H, P, X.x, X.y);
    if (g.pend) { S.wait = 1; return; }
    if (g.mine) { release(H, P, g.mine); S.i++; }
    else { S.i++; (rec.s1refuse = rec.s1refuse || []).push(S.i); }
    if (S.i >= N1) { rec.s1 = close(H, V, S.w); rec.s1.n = S.i; save(); S.ph = 's2'; S.i = 0; S.w = win(H, V); S.ps = null; }
  } else if (S.ph === 's2') {   // ② 열 사람 · 서로 다른 목 · 한 틱에
    if (!S.ps) { S.ps = sites.map((X, i) => ({ P: bot('p_t1466b' + i), X, done: false })); for (const o of S.ps) { const g = gesture(H, o.P, o.X.x, o.X.y); o.first = g.pend ? 'pend' : (g.mine ? 'placed' : 'refused'); if (!g.pend) { o.done = true; release(H, o.P, g.mine); } } return; }
    let left = 0; for (const o of S.ps) { if (o.done) continue; if (pendOf(H, o.P)) { left++; continue; } const g = gesture(H, o.P, o.X.x, o.X.y); o.done = true; release(H, o.P, g.mine); }
    if (!left && S.ps.every((o) => o.done)) { rec.s2 = close(H, V, S.w); rec.s2.first = S.ps.map((o) => o.first); save(); S.ph = 's3'; S.i = 0; S.w = win(H, V); }
  } else if (S.ph === 's3') {   // ③ 한 사람 · 목 열 곳 잇달아
    const P = bot('p_t1466c');
    if (S.wait) { if (pendOf(H, P)) return; S.wait = 0; const X = sites[S.i]; const g = gesture(H, P, X.x, X.y); release(H, P, g.mine); S.i++; }
    else { if (S.i >= sites.length) { rec.s3 = close(H, V, S.w); save(); S.ph = 'end'; tkOn = false; return; } const X = sites[S.i]; const g = gesture(H, P, X.x, X.y); if (g.pend) { S.wait = 1; return; } release(H, P, g.mine); S.i++; }
  }
}
process.on('exit', () => { rec.end = Date.now(); if (S) rec.ph = S.ph; save(); });
