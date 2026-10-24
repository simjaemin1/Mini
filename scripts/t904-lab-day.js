#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T904 계측기 · 판정 0 · 표만 낸다)
// === scripts/t904-lab-day.js — 랩 `마을실험실.html` 나무꾼 몸의 하루(관찰 속도 · 실제 도보) — 서버 몸 하루 표(T904 ①)의 짝 ==========
//
// 판 = `t641-lab-parity --slow` 의 결정론 관찰 판 그 꼴: rAF · performance.now 를 손에 쥐고 `lifeLoop` 를 프레임마다 직접 부른다
//   (속도 119 → 한 프레임 = 119 × 16.667ms = 1.983 게임분 < 6 ⇒ 랩의 "관찰·보통 = 실제 도보 + 셀작업" 갈래 · `Math.random` = mulberry32(시드)).
//   ⚠랩 세계는 처음 수십 날 전원 농부다(econ 이 직업을 천천히 나눈다 — 시드 7 · 마을 4 · 인구 40: 40날째 나무꾼이 처음 서고 120날께 자리 잡는다) ⇒
//     앞 `--fast` 날은 랩의 빨리감기(속도 12000 — 랩 정본 "빠름·초고속 = 스냅 + 일괄" 갈래)로 넘기고, 그 뒤 속도 119 로 바꿔 `--warm` 날을 흘린 다음 `--days` 날을 잰다.
//   세계 = 랩 정본 `lifeInit`(마을 수 · 인구 · 시드 입력칸 그대로) — 랩 줄을 한 글자도 안 바꾼다(읽기만).
// 재는 것 — 나무꾼(`a.job === 'lumberjack'`) 몸 × 랩 날(`VILS[i].day`):
//   라벨(`a.action`)별 프레임(낮 = L_DAWN ≤ f < L_DUSK · 밤 따로) · 일하던 셀(`a.work`)이 바뀐 수(= "고갈 → 가장 우거진 숲으로") ·
//   그날 반일 근무 추첨(`a._half`) · 아침 셀 richness(`forestRich` — 하루 한 번 `resourceTick` 이 L_CHOP 만큼 깎는다)
//   마을 × 날: econ 나무꾼 수 · `_woodOutLast`(econ 수식 그날 목재 — 랩은 이 수가 곧 곳간에 드는 목재다) · `land.wood`
//   랩 수: L_CHOP · L_WOODMAX · L_DAWN · L_DUSK · L_HALF — 랩 정본 글자를 읽어 적는다(표에 옮겨 적지 않는다).
//
// 실행: node scripts/t904-lab-day.js [--seeds 1020,7,42] [--nvil 2] [--pop 40] [--fast 120] [--warm 1] [--days 3] [--json out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = opt('seeds', '1020,7,42').split(',').map(Number);
const NVIL = parseInt(opt('nvil', '2'), 10), POP = parseInt(opt('pop', '40'), 10), FAST = parseInt(opt('fast', '120'), 10), WARM = parseInt(opt('warm', '1'), 10), DAYS = parseInt(opt('days', '3'), 10);
const JOUT = opt('json', null);
const FILE = path.join(ROOT, 'lab', '마을실험실.html');
const SPEED = 119, FAST_SPEED = 12000;
const SLOW_INIT = (seed) => `(() => {
  let s = (${seed} ^ 0x9e3779b9) | 0;
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0; window.__adv = (d) => { vt += d; return vt; };
  performance.now = () => vt;
  window.__rafQ = []; window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return window.__rafQ.length; };
})();`;
async function runSeed(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.addInitScript(SLOW_INIT(seed));
  await page.goto('file://' + FILE, { waitUntil: 'load', timeout: 600000 });
  const t0 = Date.now();
  const r = await page.evaluate(({ seed, nvil, pop, fast, warm, days, speed, fastSpeed }) => {
    document.getElementById('nvil').value = String(nvil); document.getElementById('pop').value = String(pop); document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed'); if (![...sel.options].some((o) => o.value === String(speed))) sel.add(new Option(String(speed), String(speed)));
    if (![...sel.options].some((o) => o.value === String(fastSpeed))) sel.add(new Option(String(fastSpeed), String(fastSpeed)));
    sel.value = String(fast > 0 ? fastSpeed : speed);
    window.__rafQ.length = 0;
    lifeToggle();
    const dF = VILS[0].day + fast; let fr0 = 0;
    while (fast > 0 && VILS[0].day < dF && fr0 < 2000000) { const q = window.__rafQ.splice(0); const now = window.__adv(16.667); for (const cb of q) cb(now); fr0++; }   // 빨리감기(랩 정본 갈래)
    sel.value = String(speed);   // ★관찰 속도로 — lifeLoop 가 프레임마다 이 칸을 읽는다
    const C = { L_CHOP, L_WOODMAX, L_DAWN, L_DUSK, L_HALF, L_MINDAY, frameGM: speed * 16.667 / 1000 };
    const ids = new WeakMap(); let idN = 0; const idOf = (a) => { let k = ids.get(a); if (k == null) { k = ++idN; ids.set(a, k); } return k; };
    const day0 = VILS[0].day, dA = day0 + warm, dB = day0 + warm + days;
    const B = {}, V = {}, LW = {}; let frames = 0;
    while (VILS[0].day < dB && frames < 2000000) {
      const q = window.__rafQ.splice(0); const now = window.__adv(16.667);
      for (const cb of q) cb(now);
      frames++;
      const f = (lifeGM % L_MINDAY) / L_MINDAY, isDay = f >= L_DAWN && f < L_DUSK;
      for (let i = 0; i < VILS.length; i++) {
        const v = VILS[i], d = v.day; if (d < dA || d >= dB) continue;
        const vk = i + '|' + d;
        if (!V[vk]) { const e = v.econ || {}; V[vk] = { vil: i, day: d, lj: (e.counts && e.counts.lumberjack) || 0, D: e._woodOutLast || 0, landWood: (e.land && e.land.wood) || 0, agentsLj: v.agents.filter((a) => a.job === 'lumberjack').length, pop: e.npcs ? e.npcs.length : null }; }
        for (const a of v.agents) {
          if (a.job !== 'lumberjack') continue;
          const k = i + '|' + idOf(a) + '|' + d;
          let b = B[k];
          const id = idOf(a), wk = a.work ? a.work.cx + ',' + a.work.cy : null;
          if (!b) {
            //   셀 옮김은 하루 경계(`resourceTick` — 랩 날이 바뀌는 프레임)에서 난다 ⇒ 어제 마지막 프레임의 셀(`LW`)과 견준다
            b = B[k] = { vil: i, day: d, act: {}, night: {}, dayF: 0, nightF: 0, moves: (LW[id] !== undefined && LW[id] !== wk) ? 1 : 0, w: wk, half: 0, rich0: (wk && v.forestRich) ? (v.forestRich.get(wk) ?? null) : null, richEnd: null, inForest: !!(wk && v.forestRich && v.forestRich.has(wk)), st: {} };
          }
          if (wk !== b.w) { b.moves++; b.w = wk; }
          LW[id] = wk; b.richEnd = (wk && v.forestRich) ? (v.forestRich.get(wk) ?? null) : null;
          if (a._half && a._hd === d) b.half = 1;
          const lab = a.action || '-';
          if (isDay) { b.dayF++; b.act[lab] = (b.act[lab] || 0) + 1; b.st[a.state] = (b.st[a.state] || 0) + 1; } else { b.nightF++; b.night[lab] = (b.night[lab] || 0) + 1; }
        }
      }
    }
    return { frames, fastFrames: fr0, C, bodies: Object.values(B), vils: Object.values(V), day0, nv: VILS.length, roles: VILS.map((v) => v.role) };
  }, { seed, nvil: NVIL, pop: POP, fast: FAST, warm: WARM, days: DAYS, speed: SPEED, fastSpeed: FAST_SPEED });
  r.errs = errs.length; r.err0 = errs[0] || null; r.ms = Date.now() - t0;
  await page.close();
  return r;
}
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const r2 = (x) => (x == null ? '—' : (Math.round(x * 100) / 100).toLocaleString('en-US'));
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=4096'] });
  const all = {};
  for (const seed of SEEDS) {
    const r = await runSeed(browser, seed);
    all[seed] = r;
    const bd = r.bodies.filter((b) => b.dayF > 0), F = r.C.frameGM;
    const act = {}; let dayF = 0; for (const b of bd) { dayF += b.dayF; for (const [l, c] of Object.entries(b.act)) act[l] = (act[l] || 0) + c; }
    const D = r.vils.filter((v) => v.lj > 0);
    console.log(`\n[랩 시드 ${seed}] 마을 ${r.nv}(${r.roles.join('·')}) · 빨리감기 ${FAST}날(${r.fastFrames} 프레임) → 관찰 프레임 ${r.frames} (${(r.ms / 1000).toFixed(0)}s · 오류 ${r.errs}${r.err0 ? ' ' + r.err0 : ''}) · 잰 랩 날 ${r.day0 + WARM}~${r.day0 + WARM + DAYS - 1} · 프레임 = ${F.toFixed(3)} 게임분`);
    console.log(`  랩 수: L_CHOP ${r.C.L_CHOP} · L_WOODMAX ${r.C.L_WOODMAX} · 낮 ${r.C.L_DAWN}~${r.C.L_DUSK} · 반일 퇴근 ${r.C.L_HALF}`);
    console.log(`  나무꾼 몸·날 ${bd.length} · 낮 라벨 몫: ${Object.entries(act).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} ${(100 * c / dayF).toFixed(1)}%`).join(' · ')}`);
    console.log(`  셀 옮김/몸·날 ${r2(bd.reduce((x, b) => x + b.moves, 0) / Math.max(1, bd.length))} · 반일 몸·날 ${bd.filter((b) => b.half).length} · 숲 셀에서 일한 몸·날 ${bd.filter((b) => b.inForest).length} · 아침 셀 richness 중앙 ${r2(med(bd.map((b) => b.rich0)))} · 저녁 ${r2(med(bd.map((b) => b.richEnd)))}`);
    console.log(`  econ: 나무꾼 있는 마을·날 ${D.length} · D(_woodOutLast) 중앙 ${r2(med(D.map((v) => v.D)))} · D/나무꾼 중앙 ${r2(med(D.map((v) => v.D / v.lj)))} · land.wood 중앙 ${r2(med(D.map((v) => v.landWood)))} · econ 나무꾼 중앙 ${med(D.map((v) => v.lj))} · 몸 나무꾼 중앙 ${med(D.map((v) => v.agentsLj))}`);
  }
  await browser.close();
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ at: new Date().toISOString(), seeds: SEEDS, nvil: NVIL, pop: POP, fast: FAST, warm: WARM, days: DAYS, speed: SPEED, fastSpeed: FAST_SPEED, runs: all }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
