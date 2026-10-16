'use strict';
// (@regress 없음 — 러너 밖 · T763 계측기 · 제품 무변 · 읽기만)
// === scripts/t763-war-hook.js — 전쟁마다 군량 짐 · 약탈 장부를 판 끝까지 적는다(F3 `T423_RATION_ACT` · F4 `T466_LOOT_ACT` 켜 본 기록) ====
//   NODE_OPTIONS="--require scripts/t763-war-hook.js" 로 존에 얹는다(`server-baseline-check` 는 부르는 쪽 NODE_OPTIONS 를 아이 판에 잇는다).
//   ⇒ `<T577_OUT>.t763.json`(T577_OUT 이 없으면 `T763_OUT`) — 전쟁마다 마지막으로 본 꼴 + 짐꾼 몸 걸음(T763_WALK_MS 마다 짐꾼 몸 자리 · 걸은 px 합)
//   읽는 칸: `state.war.WARS`(war-core) · `w._rationBook`(T423 · T466 장부) · `w._packOnBodies` · 짐꾼 몸(`p._warPackOf`) 자리 · 짐 kg(`weights.js`)
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const OUT0 = process.env.T577_OUT ? process.env.T577_OUT + '.t763.json' : (process.env.T763_OUT || '');
if (OUT0) {
  {
    const _p2 = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== VILL) return _p2(m, filename);
      const _c = m._compile;
      m._compile = function (src, fn) { src += '\n;module.exports.__t763 = function () { return state; };\n'; return _c.call(this, src, fn); };
      return _p2(m, filename);
    };
  }
  const getSt = () => { try { const m = require.cache[VILL]; return m && m.exports && m.exports.__t763 ? m.exports.__t763() : null; } catch (e) { return null; } };
  const R = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
  const wars = new Map();   // id → 마지막 꼴
  const walk = new Map();   // pid → { war, x, y, px, n }
  let lastDay = -1, ticks = 0;
  let W = null; const kgOf = (k) => { try { W = W || require(path.join(ROOT, 'server', 'weights.js')); return W.kgOfOrDefault ? W.kgOfOrDefault(k) : 0; } catch (e) { return 0; } };
  function snapWar(st, w) {
    const bk = w._rationBook || null;
    const o = { id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, op: w.op || null, phase: w.phase, born: w.born, force: w.force,
      packRem: R(w._packRem), onBodies: !!w._packOnBodies, outcome: w.outcome || w.result || null, lastSeen: st.world && st.world.day };
    if (bk) { const b = {}; for (const k of Object.keys(bk)) if (k !== 'days' && k !== 'fgDays') b[k] = R(bk[k]); b.nDays = (bk.days || []).length; b.days = (bk.days || []).slice(0, 64); o.book = b; }
    return o;
  }
  function bearersKg(st) {   // 짐꾼 몸마다 짐 kg(팩 칸만 — `_packKeys`) · 최대 · 25 kg 넘은 몸
    const P = st.deps && st.deps.players; if (!P) return null;
    const byWar = {};
    P.forEach((p, pid) => {
      if (!p || p._warPackOf == null) return;
      const w = (st.war && st.war.WARS || []).find((x) => x.id === p._warPackOf); const keys = (w && w._packKeys) || [];
      let kg = 0; for (const k of keys) kg += ((p.inventory && p.inventory[k]) || 0) * kgOf(k);
      const s = byWar[p._warPackOf] || (byWar[p._warPackOf] = { n: 0, alive: 0, kgMax: 0, kgSum: 0, over25: 0 });
      s.n++; if (p.hp == null || p.hp > 0) s.alive++; s.kgSum += kg; if (kg > s.kgMax) s.kgMax = kg; if (kg > 25 + 1e-9) s.over25++;
      const q = walk.get(pid); const x = p.x, y = p.y;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (!q) walk.set(pid, { war: p._warPackOf, x, y, px: 0, n: 0 });
        else { const d = Math.hypot(x - q.x, y - q.y); if (d > 0 && d < 4000) { q.px += d; q.n++; } q.x = x; q.y = y; }
      }
    });
    for (const k in byWar) { byWar[k].kgMax = R(byWar[k].kgMax); byWar[k].kgSum = R(byWar[k].kgSum); }
    return byWar;
  }
  const kgPeak = {}; let lastStats = null;
  function sample() {
    const st = getSt(); if (!st || !st.war || !st.war.WARS) return;
    const A = st.war.WARS;
    if (!A.__t763) {   // 귀환 끝(war-core `WARS.splice`) 순간의 꼴 — 짐 장부가 다 찬 자리(내려놓기 · 귀가 날)
      Object.defineProperty(A, '__t763', { value: 1 });
      Object.defineProperty(A, 'splice', { configurable: true, writable: true, value: function (i, n) { try { for (let j = i; j < i + (n == null ? this.length : n) && j < this.length; j++) { const w = this[j]; if (w) { const o = snapWar(st, w); o.ended = st.world && st.world.day; wars.set(w.id, o); } } } catch (e) {} return Array.prototype.splice.apply(this, arguments); } });
    }
    for (const w of A) wars.set(w.id, snapWar(st, w));
    try { lastStats = st.war.stats ? JSON.parse(JSON.stringify(st.war.stats())) : null; } catch (e) {}
    const b = bearersKg(st);
    if (b) for (const k in b) { const s = kgPeak[k] || (kgPeak[k] = { bearers: 0, kgMax: 0, over25: 0 }); s.bearers = Math.max(s.bearers, b[k].n); s.kgMax = Math.max(s.kgMax, b[k].kgMax); s.over25 = Math.max(s.over25, b[k].over25); }
  }
  const flush = () => {
    try {
      const wk = {}; for (const [pid, q] of walk) { const s = wk[q.war] || (wk[q.war] = { bodies: 0, walked: 0, px: 0 }); s.bodies++; if (q.px > 0) s.walked++; s.px = R(s.px + q.px); }
      fs.writeFileSync(OUT0, JSON.stringify({ wars: [...wars.values()], kgPeak, walk: wk, ticks, stats: lastStats }));
    } catch (e) {}
  };
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) { try { const d = day | 0; if (d !== lastDay) { lastDay = d; sample(); if (d % 25 === 0) flush(); } } catch (e) {} return sd.apply(this, arguments); };
    return L;
  };
  const WMS = +(process.env.T763_WALK_MS || 0);
  if (WMS > 0) { const iv = setInterval(() => { try { ticks++; sample(); } catch (e) {} }, WMS); iv.unref && iv.unref(); }
  process.on('exit', () => { try { sample(); } catch (e) {} flush(); });
}
