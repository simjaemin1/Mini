#!/usr/bin/env node
// === scripts/lab-happywork-ab.js — T157 A/B: 행복이 높으면 더 일한다 =========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T157 §2-③]
//   랩(`lab/전쟁실험실.html`)이 도는 econ 은 **이 저장소의 엔진 그 자체**다(인라인 번들).
//   그래서 800일 × 3시드 × 두 팔을 브라우저에서 돌리는 대신 **같은 엔진을 헤드리스로** 돌린다.
//   세계 크기도 랩과 같게 맞춘다(랩 기본 `NV=8` — `lifeInit` 의 마을 수).
//   ⚠**계수를 주는 자리는 랩과 같다** — `world.happyWorkW` 하나(엔진은 계수를 안 갖는다).
//
// ★이 파일에 산수는 **비율과 분위수**뿐이다. 계수·상한은 전부 엔진이 갖는다(사본 0).
//
// 실행: node scripts/lab-happywork-ab.js [일수=800] [H=0.24]
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const H = process.argv[3] != null ? parseFloat(process.argv[3]) : 0.24;
const SEEDS = [1020, 7, 42];
const NV = 8;                      // 랩 `lifeInit` 기본 마을 수
const NAMES = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타'];

const econV2 = R('sim/economy-sim-v2');
const Events = R('server/events');          // ★사건 장부는 **관측자**다(T94/T133) — 세계를 안 바꾼다

function run(seed, hw) {
  const _l = console.log; console.log = () => {};
  const w = econV2.createWorldV2({ seed, villageCount: NV, namePool: NAMES.slice(0, NV), infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  if (hw > 0) w.happyWorkW = hw;                     // ★랩 `hwInstallHook()` 과 **같은 한 줄**
  // ★사건 밀도(물음 ⓒ) — `t17-metrics.js` 와 **같은 장부·같은 문턱**(정본 기본값 · 사본 0).
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: {} });
  L.prime(w);
  for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(w); L.scanDay(w, w.day, {}); }
  console.log = _l;
  const S = L.stats || {};
  let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, clampDays = 0, hwmSum = 0, hwmN = 0;
  const per = [];
  for (const v of w.villages) {
    const n = (v.npcs || []).length; pop += n;
    if (v._everPop) ever++;
    if (v._everPop && n <= 0) dead++;
    weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
    expand += v.expansions || 0;
    clampDays += v._hwClampDays || 0;
    if (v._hwmLast != null) { hwmSum += v._hwmLast; hwmN++; }
    per.push({ name: v.name, N: n,
      happy: v.lastStats ? +v.lastStats.happiness.toFixed(3) : null,
      health: v.lastStats ? +v.lastStats.health.toFixed(3) : null,
      hwm: v._hwmLast != null ? +v._hwmLast.toFixed(4) : null,
      clampDays: v._hwClampDays || 0,
      food: +(v.storage.food || 0).toFixed(1),
      foodEq: +R('sim/economy-sim').totalFoodEquivalent(v).toFixed(1) });
  }
  return { seed, hw, pop, dead, ever, weapQ: +weapQ.toFixed(1), expand,
    trades: (w.tradeLog || []).length, events: S.emitted || 0, byType: S.byType || {},
    reqOpened: S.reqOpened || 0, evDays: S.days || DAYS,
    clampDays, hwmMean: hwmN ? +(hwmSum / hwmN).toFixed(4) : null, per };
}

const nf = (x) => Number(x).toLocaleString();
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

console.log(`\n=== T157 A/B — 행복 → 작업량 (랩 엔진 · 마을 ${NV} · ${DAYS}일 · H=${H}) ===`);
console.log(`  주입 자리: world.happyWorkW (엔진은 계수를 안 갖는다) · 배수 = clamp(1 + (행복−0.5)×H, 1±H/2)`);

const got = SEEDS.map((s) => ({ off: run(s, 0), on: run(s, H) }));

// ── ⓐ 인구·소멸 — 폭주하나 ──────────────────────────────────────────────────
console.log('\nⓐ 인구·소멸 — 양의 되먹임이 폭주하나');
console.log('  시드   팔     인구      Δ     소멸    무기Q   확장셀    거래    사건   작업량배수(끝)  상한에 걸린 마을·일');
for (const g of got) {
  const row = (tag, o, base) => '  ' + String(g.off.seed).padEnd(7) + tag.padEnd(6)
    + String(o.pop).padStart(6) + (base ? pct(o.pop, base).padStart(8) : '—'.padStart(8))
    + `${o.dead}/${o.ever}`.padStart(8) + String(Math.round(o.weapQ)).padStart(8) + String(o.expand).padStart(8)
    + String(o.trades).padStart(8) + String(o.events).padStart(8)
    + (o.hwmMean != null ? o.hwmMean.toFixed(4) : '—').padStart(14) + String(o.clampDays).padStart(20);
  console.log(row('OFF', g.off, null));
  console.log(row('ON', g.on, g.off.pop));
}

// ── ⓑ 마을별 Δ산출 분포 — 격차가 벌어지나 ──────────────────────────────────
console.log('\nⓑ 마을별 Δ(곳간 식량등가) 분포 — 행복 낮은 마을이 더 가난해지나');
console.log('  시드   Δ최저     Δ25%     Δ중앙     Δ75%     Δ최고   |  행복 최저→최고(ON)  배수 최저→최고');
for (const g of got) {
  const m = new Map(g.off.per.map((p) => [p.name, p]));
  const d = g.on.per.filter((p) => m.has(p.name) && m.get(p.name).foodEq > 0)
    .map((p) => (p.foodEq / m.get(p.name).foodEq - 1) * 100);
  const hs = g.on.per.filter((p) => p.happy != null).map((p) => p.happy);
  const ms = g.on.per.filter((p) => p.hwm != null).map((p) => p.hwm);
  const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
  console.log('  ' + String(g.off.seed).padEnd(7)
    + (d.length ? [q(d, 0), q(d, 0.25), q(d, 0.5), q(d, 0.75), q(d, 0.999)].map((x) => f(x).padStart(9)).join('') : '  (없음)')
    + '  |  ' + (hs.length ? `${Math.min(...hs).toFixed(2)} → ${Math.max(...hs).toFixed(2)}` : '—').padStart(16)
    + '  ' + (ms.length ? `${Math.min(...ms).toFixed(3)} → ${Math.max(...ms).toFixed(3)}` : '—').padStart(14));
}

// ── ⓒ' 사건 밀도 — 값 유형(T133 문법) ───────────────────────────────────────
console.log("\nⓒ' 사건 밀도 — 장부는 관측자다(t17-metrics 와 같은 문턱)");
console.log('  시드   팔    사건     의뢰   마을·일/건    유형별(상위 6)');
for (const g of got) {
  for (const [tag, o] of [['OFF', g.off], ['ON', g.on]]) {
    const live = o.per.filter((p) => p.N > 0).length || 1;
    const dpe = (live * (o.evDays || DAYS)) / Math.max(1, o.events);
    const tt = Object.entries(o.byType).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' · ');
    console.log('  ' + String(o.seed).padEnd(7) + tag.padEnd(5) + nf(o.events).padStart(7)
      + nf(o.reqOpened).padStart(8) + dpe.toFixed(2).padStart(12) + '    ' + tt);
  }
}

// ── ⓒ 마을 전수 — 행복·배수·인구 ────────────────────────────────────────────
console.log('\nⓒ 마을 전수(ON · 시드 1020) — 행복 · 작업량 배수 · 상한일 · 인구');
console.log('  마을   행복    건강   작업량배수  상한일    인구   곳간식량등가   (OFF 인구 · 식량등가)');
{
  const g = got[0], m = new Map(g.off.per.map((p) => [p.name, p]));
  for (const p of g.on.per) {
    const o = m.get(p.name) || {};
    console.log('  ' + String(p.name).padEnd(6) + String(p.happy).padStart(6) + String(p.health).padStart(8)
      + String(p.hwm).padStart(12) + String(p.clampDays).padStart(8) + String(p.N).padStart(8)
      + nf(Math.round(p.foodEq)).padStart(14) + `   (${o.N} · ${nf(Math.round(o.foodEq || 0))})`);
  }
}
console.log('');
