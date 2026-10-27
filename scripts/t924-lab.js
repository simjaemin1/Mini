#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T924 계측기 · 판정 0 · 표만 낸다)
// === scripts/t924-lab.js — 랩 `마을실험실.html` 판: 죽음 빚(`_dPAccum`) · 전쟁 길이 — 서버 관찰기(`t924-observe`)의 짝 ==========
//
// 판 = `t904-lab-day` 의 결정론 판 그 꼴(rAF · performance.now 를 손에 쥐고 `lifeLoop` 를 프레임마다 직접 부른다 · `Math.random` = mulberry32(시드)).
//   속도 = 랩 빨리감기(12000 — 랩 정본 "빠름·초고속 = 스냅 + 일괄" 갈래 · 한 프레임 200 게임분 < 하루) · 세계 = 랩 정본 `lifeInit`(입력칸 기본: 마을 8 · 인구 6 · 시드만 바꾼다).
//   랩 줄을 한 글자도 안 바꾼다(읽기만). 전쟁 = 랩 정본 `warDaily`(마을실험실 — 동원은 `_warMobFrac → _laborMul` · econ 주민 표식 없음).
// 재는 것 — econ 날이 바뀐 프레임마다(그날 econ 틱 뒤):
//   마을 × 날: 인구 · `_dPAccum`(틱 뒤 빚) · `_deathsToday` · 곳간(식량 환산 — `EconEngine.totalFoodEquivalent`) · `_warMobFrac` · `_dpDebug` 항 · `lastStats` 건강 · 행복
//   전쟁 × 날: `WARS` 의 id · 공격 → 방어 · 명분 · 병력 · 국면 · eta · 행군일 · 선포 날(사라진 날 = 해제)
// 실행: node scripts/t924-lab.js [--seeds 1020,7,42] [--days 800] [--nvil 8] [--pop 6] [--json out.json]
//       node scripts/t924-lab.js --table a.json [b.json …]      # 판 JSON 만 읽어 표(세계를 안 세운다 · 곁에 <판>.sum.json)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DD = require('./lib-day-deaths');   // ★[T963] 그날 죽음 정본 — 쪽 안 엔진은 틱을 못 감싸서 하루 한 번 읽는 자리에서 `_deadTot` 차(`dayDelta` · 같은 함수를 쪽으로 넘긴다)
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = opt('seeds', '1020,7,42').split(',').map(Number);
const DAYS = parseInt(opt('days', '800'), 10), NVIL = opt('nvil', null), POP = opt('pop', null);
const JOUT = opt('json', null);
const FILE = path.join(ROOT, 'lab', opt('lab', '마을실험실.html'));
const FAST_SPEED = 12000;
const INIT = (seed) => `(() => {
  let s = (${seed} ^ 0x9e3779b9) | 0;
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0; window.__adv = (d) => { vt += d; return vt; };
  performance.now = () => vt;
  window.__rafQ = []; window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return window.__rafQ.length; };
})();`;
async function runSeed(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.addInitScript(INIT(seed));
  await page.goto('file://' + FILE, { waitUntil: 'load', timeout: 600000 });
  const t0 = Date.now();
  const r = await page.evaluate(({ seed, nvil, pop, days, fastSpeed, ddSrc }) => {
    const dayDelta = new Function('return (' + ddSrc + ')')();   // ★[T963] `lib-day-deaths.dayDelta` 그대로(사본 0)
    if (nvil != null) document.getElementById('nvil').value = String(nvil);
    if (pop != null) document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed'); if (![...sel.options].some((o) => o.value === String(fastSpeed))) sel.add(new Option(String(fastSpeed), String(fastSpeed)));
    sel.value = String(fastSpeed);
    window.__rafQ.length = 0;
    lifeToggle();
    const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
    const rows = {}, wars = {}; let frames = 0, lastD = null, recDays = 0;
    const tfeOf = (e) => { try { return EconEngine.totalFoodEquivalent(e); } catch (_) { return null; } };
    const d0 = ECON_WORLD ? ECON_WORLD.day : 0;
    const ddLast = new Map(); for (const V of VILS) if (V.econ) ddLast.set(V.name, +V.econ._deadTot || 0);   // ★[T963] 시작 누계
    while (ECON_WORLD && ECON_WORLD.day < d0 + days && frames < 3000000) {
      const q = window.__rafQ.splice(0); const now = window.__adv(16.667); for (const cb of q) cb(now); frames++;
      const d = ECON_WORLD.day;
      if (d === lastD) continue; lastD = d; recDays++;
      for (const V of VILS) {
        const e = V.econ; if (!e) continue; const D = e._dpDebug || {}, S = e.lastStats || {};
        (rows[V.name] || (rows[V.name] = [])).push([d, e.npcs.length, r3(e._dPAccum), dayDelta(ddLast, V.name, e), e._deadTot || 0, r3(tfeOf(e)), r3(e._warMobFrac || 0), e._warMobUntil || 0,
          D.logi, D.hunger, D.health, D.happy, D.dP, r3(S.health), r3(S.happiness), r3(e._fuelCov), S.foodGroups, D.K, e._kDbg ? e._kDbg.slot : null, e._kDbg ? e._kDbg.prod : null, e._kDbg ? e._kDbg.fuel : null, D.prestige]);
      }
      const seen = new Set();
      for (const w of (typeof WARS !== 'undefined' ? WARS : [])) {
        seen.add(w.id); let o = wars[w.id];
        if (!o) o = wars[w.id] = { id: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, casus: w.casus, force: w.force, born: w.born, marchDays: w.marchDays, first: d, end: null, tl: [] };
        o.tl.push([d, w.phase, w.eta]); o.last = d;
      }
      for (const id in wars) { const o = wars[id]; if (o.end == null && !seen.has(+id) && o.last < d) o.end = d; }
    }
    const C = { WAR_MARCH: typeof WAR_MARCH !== 'undefined' ? WAR_MARCH : null, WAR_RANGE: typeof WAR_RANGE !== 'undefined' ? WAR_RANGE : null, WAR_MIN_DAY: typeof WAR_MIN_DAY !== 'undefined' ? WAR_MIN_DAY : null, L_START: typeof L_START !== 'undefined' ? L_START : null };
    return { frames, recDays, d0, d1: ECON_WORLD ? ECON_WORLD.day : null, cols: ['day', 'pop', 'a1', 'deathsToday', 'deadTot', 'tfe', 'mobFrac', 'mobUntil', 'logi', 'hunger', 'healthT', 'happyT', 'dP', 'health', 'happiness', 'fuelCov', 'foodGroups', 'K', 'kSlot', 'kProd', 'kFuel', 'prestigeT'], rows, wars, C, nv: VILS.length, roles: VILS.map((v) => v.role) };
  }, { seed, nvil: NVIL, pop: POP, days: DAYS, fastSpeed: FAST_SPEED, ddSrc: DD.dayDelta.toString() });
  r.errs = errs.length; r.err0 = errs[0] || null; r.ms = Date.now() - t0;
  await page.close();
  return r;
}
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
// 표 — 서버 `t924-table` ① · ②-b · ③ 과 같은 잣대(366일~ · 곳간 찬 날 = 곳간 식량 환산 ≥ 인구 × 10 · 빚 = 틱 뒤 `_dPAccum ≤ −1` · 인구 > 0)
function summarize(r) {
  const C = {}; r.cols.forEach((c, i) => { C[c] = i; });
  const S = { debtDays: 0, debtMin: 0, rows: 0, deaths: 0, deathsFrom: 0, full: 0, bind: { slot: 0, prod: 0, fuel: 0 }, nk: { '<1': 0, '1~1.1': 0, '1.1~1.3': 0, '≥1.3': 0 }, terms: { logi: 0, hunger: 0, health: 0, happy: 0, dP: 0 },
    healthNeg: 0, happyNeg: 0, vdays: 0, health: 0, happiness: 0, fuelCov: 0, popEnd: 0, empty: 0, mobDays: 0, month: {}, slotDrop: 0 };
  const CAL = require(path.join(ROOT, 'server', 'calendar.js'));   // 달 = 정본 달력(econ 날 · 게임일 0 = 1년 3월 1일)
  for (const R of Object.values(r.rows)) {
    for (let xi = 0; xi < R.length; xi++) { const x = R[xi];
      S.rows++; S.deaths += x[C.deathsToday];
      if (x[C.a1] != null && x[C.a1] <= -1.001 && x[C.pop] > 0) S.debtDays++;   // 3자리 반올림 −1.000 은 −0.9996 일 수 있다 — 못 치른 빚은 −1 아래로 자란다
      if (x[C.a1] != null) S.debtMin = Math.min(S.debtMin, x[C.a1]);
      if (x[C.mobFrac] > 0) S.mobDays++;
      if (x[C.day] < 366) continue;
      if (x[C.pop] >= 5 && x[C.health] != null) { S.vdays++; S.health += x[C.health]; S.happiness += x[C.happiness]; S.fuelCov += (x[C.fuelCov] != null ? x[C.fuelCov] : 1); if (x[C.healthT] < 0) S.healthNeg++; if (x[C.happyT] < 0) S.happyNeg++; }
      const d = x[C.deathsToday]; if (!d) continue; S.deathsFrom += d;
      if (!(x[C.tfe] >= Math.max(1, x[C.pop] + d) * 10)) continue;
      S.full += d;
      { const mo = CAL.dateOf(x[C.day]).month; S.month[mo] = (S.month[mo] || 0) + d; }
      if (C.kSlot != null && xi > 0 && R[xi - 1][C.kSlot] != null && x[C.kSlot] < R[xi - 1][C.kSlot]) S.slotDrop += d;
      if (C.kSlot != null && x[C.kSlot] != null) { const m = Math.min(x[C.kSlot], x[C.kProd], x[C.kFuel]); S.bind[m === x[C.kFuel] ? 'fuel' : m === x[C.kProd] ? 'prod' : 'slot'] += d; }
      if (C.K != null && x[C.K] != null) { const nk = (x[C.pop] + d) / Math.max(1, x[C.K]); S.nk[nk < 1 ? '<1' : nk < 1.1 ? '1~1.1' : nk < 1.3 ? '1.1~1.3' : '≥1.3'] += d; }
      S.terms.logi += (x[C.logi] || 0) * d; S.terms.hunger += (x[C.hunger] || 0) * d; S.terms.health += (x[C.healthT] || 0) * d; S.terms.happy += (x[C.happyT] || 0) * d; S.terms.dP += (x[C.dP] || 0) * d;
    }
    const l = R[R.length - 1]; if (l) { S.popEnd += l[C.pop]; if (l[C.pop] === 0) S.empty++; }
  }
  for (const k in S.terms) S.terms[k] = S.full ? +(S.terms[k] / S.full).toFixed(3) : null;
  S.health = S.vdays ? +(S.health / S.vdays).toFixed(3) : null; S.happiness = S.vdays ? +(S.happiness / S.vdays).toFixed(3) : null; S.fuelCov = S.vdays ? +(S.fuelCov / S.vdays).toFixed(3) : null;
  //   길이 = 해제(목록에서 사라진 econ 날) − 처음 본 econ 날(랩 `w.born` 은 랩 날 = econ 날 + L_START 라 econ 날과 섞지 않는다)
  const W = Object.values(r.wars), E = W.filter((w) => w.end != null), L = E.map((w) => w.end - w.first);
  S.wars = { n: W.length, ended: E.length, med: q(L, 0.5), p90: q(L, 0.9), max: L.length ? Math.max(...L) : null, marchMax: Math.max(0, ...W.map((w) => w.marchDays || 0)), casus: [...new Set(W.map((w) => w.casus))], open: W.filter((w) => w.end == null).map((w) => ({ id: w.id, born: w.born, marchDays: w.marchDays })) };
  return S;
}
if (argv[0] === '--table') {
  for (const f of argv.slice(1)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [seed, r] of Object.entries(j.runs)) {
      const S = summarize(r); fs.writeFileSync(f.replace(/\.json$/, '') + '.sum.json', JSON.stringify(S));
      console.log(`[랩 시드 ${seed}] econ 날 ${r.d0} → ${r.d1} · 마을 ${r.nv} · 마을-날 ${S.rows} · 틱 뒤 빚 ≤ −1(인구>0) ${S.debtDays} · 가장 깊은 빚 ${S.debtMin.toFixed(3)} · 동원 있는 마을-날 ${S.mobDays} · 끝 인구 ${S.popEnd} · 빈 마을 ${S.empty}`);
      console.log(`  366일~ 죽음 ${S.deathsFrom} · 곳간 찬 날 ${S.full}(${(100 * S.full / Math.max(1, S.deathsFrom)).toFixed(1)}%) · K 묶음(자리 · 흐름 · 땔감) ${S.bind.slot} · ${S.bind.prod} · ${S.bind.fuel} · N/K ${JSON.stringify(S.nk)} · 그날 항(로지스틱 · 굶주림 · 건강 · 행복 · dP) ${S.terms.logi} · ${S.terms.hunger} · ${S.terms.health} · ${S.terms.happy} · ${S.terms.dP}`);
      console.log(`  곳간 찬 날 죽음 달별(3 ~ 2월): ` + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map((m) => `${m}월 ${S.month[m] || 0}`).join(' · ') + ` · 그날 식량 자리가 전날보다 준 죽음 ${S.slotDrop}`);
      console.log(`  366일~ 인구 ≥ 5 마을-날 ${S.vdays} · 건강 ${S.health} · 행복 ${S.happiness} · 땔감 충당 ${S.fuelCov} · 건강 항 음 ${S.healthNeg} · 행복 항 음 ${S.happyNeg}`);
      console.log(`  전쟁 ${S.wars.n} · 끝난 것 ${S.wars.ended} · 길이 중앙 ${S.wars.med} · 90% ${S.wars.p90} · 최대 ${S.wars.max} · 행군일 최대 ${S.wars.marchMax} · 명분 ${S.wars.casus.join('·')}`);
    }
  }
  process.exit(0);
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=4096'] });
  const all = {};
  for (const seed of SEEDS) {
    const r = await runSeed(browser, seed);
    all[seed] = r;
    const C = {}; r.cols.forEach((c, i) => { C[c] = i; });
    let debtDays = 0, debtMin = 0, rows = 0, deaths = 0, mass = 0, popEnd = 0, empty = 0;
    for (const R of Object.values(r.rows)) { for (const x of R) { rows++; deaths += x[C.deathsToday]; if (x[C.a1] != null && x[C.a1] <= -1.001 && x[C.pop] > 0) debtDays++; if (x[C.a1] != null) debtMin = Math.min(debtMin, x[C.a1]); if (x[C.deathsToday] >= 3 && x[C.tfe] >= Math.max(1, x[C.pop]) * 10) mass++; } const l = R[R.length - 1]; if (l) { popEnd += l[C.pop]; if (l[C.pop] === 0) empty++; } }
    const W = Object.values(r.wars), L = W.filter((w) => w.end != null).map((w) => w.end - w.first);
    console.log(`\n[랩 시드 ${seed}] 마을 ${r.nv}(${r.roles.join('·')}) · econ 날 ${r.d0} → ${r.d1}(${r.recDays}날 · 프레임 ${r.frames} · ${(r.ms / 1000).toFixed(0)}s · 오류 ${r.errs}${r.err0 ? ' ' + r.err0 : ''}) · 랩 수 ${JSON.stringify(r.C)}`);
    console.log(`  마을-날 ${rows} · 틱 뒤 빚 ≤ −1 인 마을-날(인구>0) ${debtDays} · 가장 깊은 틱 뒤 빚 ${debtMin.toFixed(3)} · 죽음 ${deaths} · 곳간 찬 날 하루 ≥3 죽음 ${mass} · 끝 인구 ${popEnd} · 빈 마을 ${empty}`);
    console.log(`  전쟁 ${W.length} · 끝난 것 ${L.length} · 길이(선포 → 해제) 중앙 ${q(L, 0.5)} · 90% ${q(L, 0.9)} · 최대 ${L.length ? Math.max(...L) : '—'} · 행군일 최대 ${Math.max(0, ...W.map((w) => w.marchDays || 0))} · 명분 ${[...new Set(W.map((w) => w.casus))].join('·')}`);
  }
  await browser.close();
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ at: new Date().toISOString(), seeds: SEEDS, days: DAYS, nvil: NVIL, pop: POP, speed: FAST_SPEED, runs: all }));
})().catch((e) => { console.error(e); process.exit(1); });
