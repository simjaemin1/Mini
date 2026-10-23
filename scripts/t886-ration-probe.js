// (@regress 없음 — 러너 밖 · T886 계측기 · 제품 무변 · 읽기만 · `t811-arms-probe` 의 꼴)
// === scripts/t886-ration-probe.js — **짐이 먹는다(T423) 관찰자**: 원정 짐의 흐름 항등 · 교전 날 먹음 · 못 먹은 몫 ==========
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · `T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t886.json`)
//   ★잰다 — 1초마다 · econ 날마다(하루 마감 장부 `scanDay` 앞):
//     · 짐이 몸에 실린 원정(`w._packOnBodies` · `w._rationBook`)마다 몸 짐 합(식량등가 · `_warPackOf === w.id` 인 몸의 짐 칸 · war-core `bagFE` 그대로)
//     · 흐름 합 R = 몸 짐 + 몸이 먹음 + 내려놓음(→ 곳간) + 드랍 — 원정 내내 **한 값**이어야 한다(첫 표본 R0 · 최대 |R − R0|)
//       (R0 − 몸에 실은 몫 = 몸이 이미 들고 있던 같은 칸 — 짐 거울이 그것도 짐으로 본다 · T748 `_t748HandOf`)
//     · 원정 국면별 날 수 · 교전 날 먹음 · 못 먹은 몫(장부 칸 `battleEaten` · `battleUnfed` · `unfed` · `hungryDays` — T886)
//   ★판 끝: 원정마다 장부(적재 · 몸에 · 먹음 · 내려놓음 · 드랍 · 못 먹음 · 교전 칸) · R0 · 마지막 R · 최대 차 · 전쟁 셈
//   ★관찰만 한다 — 세계에 아무것도 안 쓴다.
'use strict';
const OUT = process.env.T886_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t886.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs');
  const Module = require('module');
  let VIL = null;
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
  const st = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  const R = { samples: 0, wars: new Map() };
  const bagFE = (S, w) => {
    const P = S.deps && S.deps.players, keys = w._packKeys || [], A = w.atk && w.atk.econ, ctx = { _priceCache: A && A._priceCache, _world: A && A._world };
    let fe = 0, n = 0; if (!P || !S.war || !S.war.bagFE) return { fe: 0, n: 0 };
    for (const [, p] of P) { if (!p || p._warPackOf !== w.id) continue; const bag = {}; const inv = p.inventory || {}; for (const k of keys) { const q = inv[k] || 0; if (q > 0) bag[k] = q; } fe += S.war.bagFE(bag, ctx); n++; }
    return { fe, n };
  };
  const look = (S, w, tag) => {
    const bk = w._rationBook; if (!bk || !(bk.split > 0)) return;
    const o = R.wars.get(w.id) || (R.wars.set(w.id, { w, id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, first: tag, R0: null, dMax: 0, phases: {} }), R.wars.get(w.id));
    const on = w._packOnBodies ? bagFE(S, w) : { fe: 0, n: 0 };
    const sum = on.fe + (bk.eaten || 0) + (bk.back || 0) + (bk.drop || 0);
    if (o.R0 == null) o.R0 = sum; else o.dMax = Math.max(o.dMax, Math.abs(sum - o.R0));
    o.last = tag; o.Rlast = sum; o.onLast = on.fe; o.nLast = on.n;
    if (tag[0] === 'd') o.phases[w.phase || '-'] = (o.phases[w.phase || '-'] || 0) + 1;
  };
  const sample = (tag) => {
    const S = st(); if (!S || !S.war) return; R.samples++;
    for (const w of (S.war.WARS || [])) look(S, w, tag);
    //   끝난 원정(목록에서 빠짐) — 마지막 몸 짐(풀려난 몸이 내려놓았나)까지 한 번 더
    for (const o of R.wars.values()) if (!(S.war.WARS || []).includes(o.w) && !o.closed) { look(S, o.w, tag); o.closed = tag; }
  };
  const dump = () => {
    try {
      const S = st();
      const ws = S && S.world && S.world._warStats;
      const wars = [...R.wars.values()].map((o) => { const b = o.w._rationBook || {}; return { id: o.id, atk: o.atk, def: o.def, first: o.first, closed: o.closed || null, phaseDays: o.phases,
        load: r3(b.load), split: r3(b.split), ledgerEaten: r3(b.ledgerEaten), eaten: r3(b.eaten), back: r3(b.back), drop: r3(b.drop), unfed: r3(b.unfed || 0), hungryDays: b.hungryDays || 0,
        battleDays: b.battleDays || 0, battleBodyDays: b.battleBodyDays || 0, battleEaten: r3(b.battleEaten || 0), battleUnfed: r3(b.battleUnfed || 0), battleHungry: b.battleHungry || 0,
        R0: r3(o.R0), Rlast: r3(o.Rlast), onLast: r3(o.onLast), dMax: o.dMax }; });
      const tot = (k) => r3(wars.reduce((a, x) => a + (x[k] || 0), 0));
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { T423_RATION_ACT: process.env.T423_RATION_ACT == null ? null : process.env.T423_RATION_ACT, WAR_FIXTURE: process.env.WAR_FIXTURE || null },
        ws: ws ? { decl: ws.decl, battle: ws.battle, atkWin: ws.atkWin, defWin: ws.defWin } : null, samples: R.samples, wars: wars.length,
        sum: { load: tot('load'), split: tot('split'), eaten: tot('eaten'), back: tot('back'), drop: tot('drop'), unfed: tot('unfed'), hungryDays: tot('hungryDays'), battleDays: tot('battleDays'), battleBodyDays: tot('battleBodyDays'), battleEaten: tot('battleEaten'), battleUnfed: tot('battleUnfed'), battleHungry: tot('battleHungry'), onLast: tot('onLast') },
        dMax: wars.reduce((a, x) => Math.max(a, x.dMax || 0), 0), list: wars }));
    } catch (e) {}
  };
  const _load = Module._load;
  let hooked = false;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !hooked && typeof m.createLedger === 'function') {
        hooked = true; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample('d' + (world && world.day)); } catch (e) {} return sd.apply(this, arguments); }; return L; };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  const t1 = setInterval(() => { try { sample('t' + Math.round(Date.now() / 1000)); } catch (e) {} }, +process.env.T886_SAMPLE_MS || 1000); if (t1.unref) t1.unref();
  process.on('exit', dump);
}
