#!/usr/bin/env node
// === scripts/lab-hunt.js — 랩(전쟁실험실) 사냥 표 (T144) ==========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// 랩을 헤드리스로 열어 **랩 자신의 생활층**(`lifeInit` + `lifeDayAll`)을 800일 돌리고
// 사냥의 표를 낸다. 재는 것은 넷이다(카드 ⑤):
//   ⓐ 인구·소멸        — 대체 뒤에도 세계가 서는가
//   ⓑ MSY              — 사냥꾼 수 대비 지속 가능 수확(과잉 사냥 마을이 생기나 · P 바닥이 몇 곳)
//   ⓒ 추상 vs 실체     — 곳간에 든 고기 중 실체가 낸 몫
//   ⓓ 사냥꾼 배분      — 직업 배분이 P 를 따라 움직이나
//
// ★★결정론 — `lab-trees.js` 와 같은 처방(페이지 뜨기 전 `Math.random` 을 시드 PRNG 로 교체).
//   ON/OFF 두 팔이 같은 난수열을 쓰므로 A/B 가 **짝지은 비교**가 된다(차이 = 사냥 실체화뿐).
//
// 실행: node scripts/lab-hunt.js [일수=800] [시드=1020] [--off] [--json <파일>]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OFF = process.argv.includes('--off');
// ★[T154] 사냥 소득 축 — abstract(기본 · 종전 비트) vs real(장부 마릿수 × 마리당 1 단위)
const _II = process.argv.indexOf('--income');
const INCOME = _II > 0 ? process.argv[_II + 1] : 'abstract';
const JSONI = process.argv.indexOf('--json');
const JSONP = JSONI > 0 ? process.argv[JSONI + 1] : null;

const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG_INIT(SEED));
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 120)); });
  await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(({ days, seed, off, income }) => {
    const out = { rows: [], err: null };
    try {
      if (off) window.L_HUNTREAL = 0;
      window.L_HUNTINCOME = income;   // ★[T154]
      const si = document.getElementById('seed'); if (si) si.value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = '8';
      reseed(); lifeInit();
      out.vil0 = VILS.length;
      out.canon = { L_GAMEMAX, L_GAMER, L_HUNT, income: (typeof _huntIncomeMode === 'function' ? _huntIncomeMode() : null),
        L_GAMEHALF: (typeof L_GAMEHALF !== 'undefined' ? L_GAMEHALF : null),
        huntReal: (typeof _huntReal === 'function' ? _huntReal() : null) };
      // ★초기 P — 마을별 개체군(gameRich 합) · 셀 수
      out.p0 = VILS.map((v) => { let s2 = 0, n = 0; if (v.gameRich) for (const g of v.gameRich.values()) { s2 += g; n++; }
        return { name: v.name, P0: +s2.toFixed(1), cells: n, baseGame: v.baseGame, land0: v.econ ? v.econ.land.game : null }; });
      // ★추상 흐름을 같이 잰다(관측자 — 랩 무수정): 엔진이 오늘 만든 고기는 dailyProductionBuf 에 있다.
      out.abs = { meat: 0, hide: 0 };
      out.series = [];                       // 하루하루의 총 P·사냥꾼 수·고기(그림용)
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        for (const v of VILS) { const bb = v.econ && v.econ.dailyProductionBuf; if (!bb) continue;
          out.abs.meat += bb.meat || 0; out.abs.hide += bb.hide || 0; }
        for (const v of VILS) { out.kills = (out.kills || 0) + (v.econ ? (v.econ._hkillDay || 0) : 0); }
        if (d % 5 === 0 || d === days - 1) {
          let P = 0, H = 0, M = 0;
          for (const v of VILS) { if (v.gameRich) for (const g of v.gameRich.values()) P += g;
            const c = v.econ && v.econ.counts; if (c) H += c.hunter || 0;
            const st2 = v.econ && v.econ.storage; if (st2) M += st2.meat || 0; }
          out.series.push({ d, P: +P.toFixed(0), H: +H.toFixed(1), meat: +M.toFixed(0) });
        }
      }
      for (let i = 0; i < VILS.length; i++) {
        const v = VILS[i], ev = v.econ;
        let P = 0, cells = 0, empty = 0, low = 0;
        if (v.gameRich) for (const g of v.gameRich.values()) { P += g; cells++; if (g < 2) empty++; if (g < L_GAMEMAX * 0.2) low++; }
        const st = (ev && ev.storage) || {};
        const hs = v._hstat || {};
        out.rows.push({
          vid: i, name: v.name,
          N: (ev && ev.npcs) ? ev.npcs.length : 0,
          hN: (ev && ev.counts) ? +(ev.counts.hunter || 0).toFixed(1) : 0,
          cells, P: +P.toFixed(0), P0: +((v._initGameTotal) || 0).toFixed(0),
          Ppct: v._initGameTotal ? +(100 * P / v._initGameTotal).toFixed(1) : 0,
          emptyCells: empty, lowCells: low,
          landGame: ev ? ev.land.game : null, baseGame: v.baseGame,
          meat: +((st.meat || 0)).toFixed(0), hide: +((st.hide || 0)).toFixed(0),
          food: +((st.food || 0)).toFixed(0),
          // ★MSY 대조 — 셀당 로지스틱 MSY = r·K/4. 그 마을이 지속 가능하게 낼 수 있는 개체/일.
          msy: +(cells * L_GAMER * L_GAMEMAX / 4).toFixed(2),
          // 실체가 실제로 뺀 양(계측 — 랩의 세계 규칙은 이걸 안 읽는다)
          took: +((hs.took || 0)).toFixed(1), tookDays: hs.days || 0,
          huntRisk: ev && ev._huntRisk != null ? +ev._huntRisk.toFixed(3) : null,
        });
      }
      out.pop = out.rows.reduce((a, x) => a + x.N, 0);
      out.dead = Math.max(0, (out.vil0 || 0) - VILS.length);
      out.trade = (ECON_WORLD && ECON_WORLD.tradeLog) ? ECON_WORLD.tradeLog.length : 0;
      out.day = VILS[0] ? VILS[0].day : null;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 400); }
    return out;
  }, { days: DAYS, seed: SEED, off: OFF, income: INCOME });
  await b.close();
  if (r.err) { console.error('랩 오류:', r.err); process.exit(1); }
  if (errs.length) console.log('⚠ 페이지 오류 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));

  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  console.log(`\n=== 랩 사냥 표 — ${DAYS}일 · 시드 ${SEED} · ${OFF ? 'OFF(현재 랩)' : 'ON(실체)'} · 소득 ${INCOME} ===`);
  console.log(`정본: L_GAMEMAX=${r.canon.L_GAMEMAX} L_GAMER=${r.canon.L_GAMER} L_HUNT=${r.canon.L_HUNT}`
    + ` L_GAMEHALF=${r.canon.L_GAMEHALF} huntReal=${r.canon.huntReal}`);
  console.log(`인구 ${r.pop} · 소멸 ${r.dead}/${r.vil0} · 거래 ${r.trade} · day ${r.day}`);
  console.log(`산출 누계(곳간에 든 것) — meat ${r.abs.meat.toFixed(0)} · hide ${r.abs.hide.toFixed(0)}`);
  const _kk = r.rows.reduce((a, x) => a + (x.took || 0), 0);
  console.log(`장부 마릿수 누계 ${_kk.toFixed(0)} · 장부/산출 ${(r.abs.meat ? _kk / r.abs.meat : 0).toFixed(2)}배`
    + ` · 소득 모드 ${r.canon.income}`);
  console.log('\n마을'.padEnd(10) + 'N'.padStart(5) + '사냥꾼'.padStart(7) + '셀'.padStart(6)
    + 'P'.padStart(8) + 'P%'.padStart(7) + '빈셀'.padStart(6) + 'MSY/일'.padStart(8)
    + 'land.game'.padStart(11) + '고기'.padStart(7) + '가죽'.padStart(7));
  for (const x of r.rows) console.log(String(x.name).padEnd(10) + String(x.N).padStart(5) + String(x.hN).padStart(7)
    + String(x.cells).padStart(6) + String(x.P).padStart(8) + String(x.Ppct).padStart(7) + String(x.emptyCells).padStart(6)
    + String(x.msy).padStart(8) + String(x.landGame).padStart(11) + String(x.meat).padStart(7) + String(x.hide).padStart(7));
  const pp = r.rows.map((x) => x.Ppct), hh = r.rows.map((x) => x.hN);
  console.log(`\nP% 중앙 ${med(pp)} · 최소 ${Math.min(...pp)} · 최대 ${Math.max(...pp)}`
    + ` · P%<20 인 마을 ${r.rows.filter((x) => x.Ppct < 20).length}곳`);
  console.log(`사냥꾼 중앙 ${med(hh)} · 최대 ${Math.max(...hh)} · 합 ${hh.reduce((a, b2) => a + b2, 0).toFixed(1)}`);
  if (JSONP) { fs.writeFileSync(JSONP, JSON.stringify(r, null, 1)); console.log(`\nJSON → ${JSONP}`); }
})();
