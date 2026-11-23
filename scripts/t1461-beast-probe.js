// (@regress 없음 — 러너 밖 · T1461 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1461-beast-probe.js — 보는 사람 없는 몸 세계에서 짐승이 사람을 치는가(T1461_BEAST_UNSEEN)를 날마다 잰다 ==========================
//   쓰는 법: `T1461_PROBE_OUT=<파일.json> NODE_OPTIONS="--require $PWD/scripts/t1461-beast-probe.js" node scripts/t1331-run.js …`(존 아이에서만 돈다)
//   날마다: 인구 · 빈 마을 · 마을 밖에 선 NPC 몸 수 · 그 둘레(사냥판 깨움 반경) 짐승 몸 수의 합(= 만날 수 있었던 짝) · 짐승 죽음(T1432 · T1461 셈) ·
//   야생 층 깨우는 이 · 타 · 피해 · 사냥판 CPU(µs/틱) · 존 틱 평균 ms. 끝 = 죽음 기록(마을 · 직업 · 날).
//   ⚠읽기만 — 끔 판에서도 같은 줄(T1461 칸 null).
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1461_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.join(__dirname, '..');
const VF = path.join(ROOT, 'server', 'villages.js'), WF = path.join(ROOT, 'server', 'wildlife.js'), BF = path.join(ROOT, 'server', 'beast-body.js');
const OUT = process.env.T1461_PROBE_OUT;
const rec = { knobs: { T1432: process.env.T1432_NPC_DEATH || '', T1461: process.env.T1461_BEAST_UNSEEN || '' }, days: [], err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
let SV = null;
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1461v') < 0) src += '\n;module.exports.__t1461v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    SV = m.exports;
    const g = m.exports.onGameTick; let lastDay = -1, tt0 = 0, tn0 = 0, cpu0 = 0, tk0 = 0, pc0 = process.cpuUsage();
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1461v(), d = (st.world && st.world.day) | 0;
        if (d !== lastDay && st.ready) {
          lastDay = d;
          const W = require.cache[WF] && require.cache[WF].exports, Bm = require.cache[BF] && require.cache[BF].exports;
          const ws = W && W.t1393Stat ? W.t1393Stat() : null, w61 = W && W.t1461Stat ? W.t1461Stat() : null;
          let pop = 0, vils = 0, empty = 0; for (const vil of (st.villages || [])) { const v = vil.econ; if (!v) continue; vils++; const n = (v.npcs && v.npcs.length) || 0; pop += n; if (!n) empty++; }
          // 만날 수 있었던 짝 — 마을 밖 NPC 몸(마을 영토 칸 밖 · 캐러밴 · 마을 없는 몸) × 깨움 반경 안 짐승 몸(잠든 몸 포함 · 몸 표)
          let outN = 0, pairs = 0, near = 0;
          const B = Bm && Bm.current, R = (W && W.T1393_SEE) || 64;
          const grid = new Map();
          if (B) for (const b of B.W.bodies.values()) { if (b.mat) continue; const k = ((b.cx / R) | 0) * 65536 + ((b.cy / R) | 0); const l = grid.get(k); l ? l.push(b) : grid.set(k, [b]); }
          for (const p of (st.deps && st.deps.players ? st.deps.players.values() : [])) {
            if (!p.isNpc || p.simWar || p._bxExit || p.hp <= 0) continue;
            let o = false;
            if (p.simCaravan) o = true; else { const vil = p.simVillageId != null && st.byDbId ? st.byDbId.get(p.simVillageId | 0) : null; const cx = Math.floor(p.x / 32), cy = Math.floor(p.y / 32); o = !vil || !vil._terrSet || !vil._terrSet.has(cx + ',' + cy); }
            if (!o) continue; outN++;
            if (!B) continue;
            const px = p.x / 32, py = p.y / 32, bx = (px / R) | 0, by = (py / R) | 0; let c = 0;
            for (let ix = bx - 1; ix <= bx + 1; ix++) for (let iy = by - 1; iy <= by + 1; iy++) { const l = grid.get(ix * 65536 + iy); if (l) for (const b of l) if ((b.cx + 0.5 - px) ** 2 + (b.cy + 0.5 - py) ** 2 <= R * R) c++; }
            pairs += c; if (c) near++;
          }
          const s32 = SV.t1432Stat ? SV.t1432Stat() : null, s61 = SV.t1461Stat ? SV.t1461Stat() : null;
          const tt = global._tt || 0, tn = global._tn || 0;
          rec.days.push({ d, vils, pop, empty, outN, near, pairs,
            died: s32 ? { all: s32.died, wild: s32.wild, other: s32.other } : null, d61: s61 ? { all: s61.died, car: s61.car, esc: s61.esc, lone: s61.lone } : null,
            w: ws ? { cpuUs: ws.cpuUs, ticks: ws.ticks, awakeSum: ws.awakeSum, awakeN: ws.awakeN, fields: ws.fields } : null,
            w61: w61 ? { ticks: w61.ticks, wakers: w61.wakers, byKind: w61.byKind, hits: w61.hits, dmg: Math.round(w61.dmg), outHits: w61.outHits } : null,
            cpuDayMs: (() => { const u = process.cpuUsage(pc0); pc0 = process.cpuUsage(); return Math.round((u.user + u.system) / 1000); })(),   // 존 프로세스 CPU(그날 · 가상 시계 판에서도 참 값)
            tickMs: tn > tn0 ? +((tt - tt0) / (tn - tn0)).toFixed(3) : null, cpuUsPerTick: ws && ws.ticks > tk0 ? Math.round((ws.cpuUs - cpu0) / (ws.ticks - tk0)) : null });
          tt0 = tt; tn0 = tn; if (ws) { cpu0 = ws.cpuUs; tk0 = ws.ticks; }
          rec.ev32 = s32 ? s32.events : null; rec.ev61 = s61 ? s61.events : null;
          if (rec.days.length % 10 === 0) save();
        }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 600); save(); }
      return out;
    };
  }
  return r;
};
process.on('exit', save);
