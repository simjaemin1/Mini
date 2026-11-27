'use strict';
// (@regress 없음 — 러너 밖 · T1497 ④ 농촌18 진단 자 · 제품 무변 · 읽기만)
// === scripts/t1497-vil-hook.js — 서버 판(t577 · server-baseline-check)에 덧붙이는 마을 하루 표 =====
//   NODE_OPTIONS="--require scripts/t1497-vil-hook.js" 로 sbc / t577 판에 얹는다. 서버 장부 `scanDay`(econ 하루 끝 · t577 훅과 같은 문)에서
//   지켜보는 마을(`T1497_VILS` · 기본 = 농촌18 과 가장 가까운 이웃 셋)마다 날마다:
//     인구 · 들어온 사람(새로 태어남 = 나이 < 1 · 옮겨 옴) · 나간 사람(자연사 · 굶음(식량 빚) · 식 죽음 = 누계 칸 차 · 그 밖 = 떠남/징발/전쟁)
//     · 곳간 식량 환산 · 날치 · K · 건강 · 행복 · 땅 · 그날 장부 줄(들여온 것 · 보낸 마을 · 내보낸 것)
//   `T577_OUT` 곁 `<…>.t1497.json` 에 20날마다 · 끝 날에 쓴다. 세계에는 아무것도 안 쓴다.
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1497.json' : (process.env.T1497_OUT || '');
const DAYS = parseInt(process.env.T577_DAYS || '400', 10);
const Ev = require(path.join(ROOT, 'server', 'events'));
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const mk = Ev.createLedger;
let watch = null, prev = null; const seenTL = new WeakSet();
const out = { card: 'T1497', seed: process.env.T577_SEED || null, knobs: { T1457_NO_K_DEATH: process.env.T1457_NO_K_DEATH || '' }, vils: null, days: [] };
function pickWatch(world) {
  const want = (process.env.T1497_VILS || '').split(',').filter(Boolean);
  const V = world.villages;
  if (want.length) return want.map((n) => V.findIndex((v) => v.name === n)).filter((i) => i >= 0);
  const i0 = V.findIndex((v) => v.name === '농촌18'); if (i0 < 0) return [];
  const c0 = V[i0].coord || { x: 0, y: 0 };
  const near = V.map((v, i) => [i, Math.hypot((v.coord || c0).x - c0.x, (v.coord || c0).y - c0.y)]).filter(([i]) => i !== i0).sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
  return [i0, ...near];
}
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      const V = world.villages;
      if (!watch) { watch = pickWatch(world); out.vils = watch.map((i) => ({ i, name: V[i].name, coord: V[i].coord })); prev = watch.map(() => null); }
      const TL = world.tradeLog || [];
      const fresh = []; for (let j = TL.length - 1; j >= 0 && TL[j] && !seenTL.has(TL[j]); j--) { seenTL.add(TL[j]); fresh.push(TL[j]); }   // 그날 새로 붙은 장부 줄(5000 줄에서 잘려도 새 줄만)
      const row = { d: day | 0, v: [] };
      watch.forEach((i, k) => {
        const v = V[i], ids = new Set((v.npcs || []).map((p) => p.id)), p0 = prev[k];
        const cnt = { dead: v._deadTot || 0, nat: v._natDeadTot || 0, fd: v._fdDeadTot || 0, emig: v._emigTot || 0 };
        let born = 0, came = 0, gone = 0;
        if (p0) { for (const p of v.npcs || []) if (!p0.ids.has(p.id)) { if ((p.age || 0) < 1) born++; else came++; } for (const id of p0.ids) if (!ids.has(id)) gone++; }
        const dd = p0 ? { dead: cnt.dead - p0.cnt.dead, nat: cnt.nat - p0.cnt.nat, fd: cnt.fd - p0.cnt.fd, emig: cnt.emig - p0.cnt.emig } : { dead: 0, nat: 0, fd: 0, emig: 0 };
        const inn = fresh.filter((t) => t.to === v.name), outT = fresh.filter((t) => t.from === v.name);
        const N = (v.npcs || []).length, food = E.totalFoodEquivalent ? E.totalFoodEquivalent(v) : 0;
        row.v.push({ N, born, came, gone, ...dd, form: dd.dead - dd.nat - dd.fd, left: Math.max(0, gone - dd.dead),
          food: +food.toFixed(1), fdays: N ? +(food / N).toFixed(1) : 0, K: v._dpDebug ? v._dpDebug.K : null,
          h: v.lastStats ? +(+v.lastStats.health || 0).toFixed(3) : null, hap: v.lastStats ? +(+v.lastStats.happiness || 0).toFixed(3) : null,
          land: +(+(v.land && v.land.size) || 0).toFixed(2), fuel: v._fuelCov != null ? +(+v._fuelCov).toFixed(3) : null, cold: v._coldStress != null ? +(+v._coldStress).toFixed(3) : null,
          wood: +(+((v.storage && v.storage.wood) || 0)).toFixed(1), sub: v.lastStats ? +(+v.lastStats.subsistence || 0).toFixed(3) : null, hT: v._dpDebug ? v._dpDebug.health : null, fdebt: +((v.npcs || []).reduce((a, p) => a + (p._fd || 0), 0)).toFixed(1),
          in: inn.map((t) => [t.from, (t.bought && t.bought.res) || (t.bGave && t.bGave.res) || '', +((t.bought && t.bought.amt) || (t.bGave && t.bGave.amt) || 0).toFixed(1)]),
          out: outT.map((t) => [t.to, (t.sent && t.sent.res) || '', +((t.sent && t.sent.amt) || 0).toFixed(1)]) });
        prev[k] = { ids, cnt };
      });
      out.days.push(row);
      if (OUT && ((day | 0) % 20 === 0 || (day | 0) >= DAYS)) fs.writeFileSync(OUT, JSON.stringify(out));
    } catch (e) { console.error('[t1497-hook] 관측 실패:', e.message); }
    return r;
  };
  return L;
};
