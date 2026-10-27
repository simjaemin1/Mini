#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T946 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t946-table.js — 첫 두 달(31~90날 = 날 30~89) 굶는 마을 · 날 · 까닭 표 · 서버 ↔ 랩 대조 ===
//   node scripts/t946-table.js --srv <판 뿌리> [--lab <랩 뿌리>] [--off C --on A] [--json <파일>]
//     서버 판 = <뿌리>/run-<판>/base-<시드>.t946.json · 랩 판 = <랩 뿌리>/<on|off>-<시드>.t946.json
//   셈(다 관찰기 칸 그대로 · 산수뿐 · 판정 0):
//     시딩 며칠치 = 창설 곳간 식량 ÷ 창설 인구(econ 이 쓴 `initN × seedFoodDays` 를 거꾸로 읽는다)
//     3일치 밑 첫날 = 식량 환산 < 인구 × 3 인 첫날(hunger 칸 문턱의 둘째 조건) · 흐름 = 그날 산출 − 먹을 몫(econ `dailySurplus`)
//     자급 첫날 = 흐름 ≥ 0 인 첫날(날 0 부터) · 받은 식량 = `foodImported` 증분 합(100날 창이 0 으로 돌아가면 새 값 = 증분)
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LABD = arg('--lab', null), OFF = arg('--off', 'C'), ON = arg('--on', 'A'), JOUT = arg('--json', null);
const SEEDS = [1020, 7, 42];
const W0 = 30, W1 = 90;   // 31~90날
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null ? '—' : (+x).toFixed(1));
const kind = (n) => (String(n).match(/^[^\d]+/) || ['?'])[0];

function series(o, nm) {   // 마을 하나 → 날 줄
  const C = {}; o.cols.forEach((c, i) => { C[c] = i; });
  const i = o.names.indexOf(nm); if (i < 0) return null;
  const out = [];
  for (const [d, row] of o.rows) { const r = row[i]; if (!r) continue; const x = { d }; for (const c of o.cols) x[c] = r[C[c]]; out.push(x); }
  return out;
}
function vil(o, nm) {      // 마을 하나 셈
  const s = series(o, nm); if (!s || !s.length) return null;
  const b = o.born[nm] || {};
  const m = { name: nm, kind: kind(nm), initN: b.initN, seedDays: b.initN > 0 ? b.food / b.initN : null, seedFood: b.food, fert: b.fert, water: b.water, game: b.game,
    job0: b.counts ? Object.entries(b.counts).filter(([, n]) => n > 0).map(([j, n]) => `${j}${n}`).join('·') : '?' };
  let imp = 0, prevImp = 0, impDays = 0;
  m.dWin = 0; m.dPre = 0; m.dPost = 0; m.firstDeath = null; m.below3 = null; m.selfDay = null; m.shieldWin = 0; m.peak = 0; m.peakDay = null;
  let fl0 = 0, n0 = 0, fl1 = 0, n1 = 0, prevTfe = null;
  m.outOther = 0; m.inOther = 0;
  for (const x of s) {
    if (m.pop0 == null) { m.pop0 = x.pop; m.day0 = x.d; } if (x.d === 29) m.pop30 = x.pop; if (x.d === 89) m.pop90 = x.pop;
    if (x.d === 29) { m.K30 = x.K; m.Kslot30 = x.Kslot; m.Kprod30 = x.Kprod; m.Kfuel30 = x.Kfuel; m.house30 = x.housing; m.food30 = x.tfe; m.ema30 = x.foodEMA; m.farm30 = x.farmer; m.fish30 = x.fisher; m.hunt30 = x.hunter; m.forg30 = x.forager; m.sent30 = x.sent; }
    const di = x.foodImp - prevImp; const inc = di >= 0 ? di : x.foodImp; prevImp = x.foodImp;
    if (m.firstDeath == null && x.d < W1) { imp += inc; if (inc > 1e-6) impDays++;
      if (prevTfe != null && prevTfe > 1) { const res = (x.tfe - prevTfe) - x.flow - inc; if (res < 0) m.outOther -= res; else m.inOther += res; } }
    prevTfe = x.tfe;
    if (m.below3 == null && x.pop > 0 && x.tfe < x.pop * 3) m.below3 = x.d;
    if (m.selfDay == null && x.flow >= 0) m.selfDay = x.d;
    if (x.d < W0) { fl0 += x.flow; n0++; m.dPre += x.deaths; }
    else if (x.d < W1) { m.dWin += x.deaths; m.shieldWin += x.shieldAte || 0; if (x.deaths > 0 && m.firstDeath == null) m.firstDeath = x.d; if (m.firstDeath == null) { fl1 += x.flow; n1++; } }
    else m.dPost += x.deaths;
    if (m.firstDeath == null && x.d < W1 && x.pop > m.peak) { m.peak = x.pop; m.peakDay = x.d; }
  }
  m.flow0 = n0 ? fl0 / n0 : null; m.flow1 = n1 ? fl1 / n1 : null; m.imp = imp; m.impDays = impDays;
  const fd = m.firstDeath != null ? s.find((x) => x.d === m.firstDeath) : null;
  if (fd) { m.atDeath = { pop: fd.pop, tfe: fd.tfe, ema: fd.foodEMA, hunger: fd.hunger, gapDay: fd.tfe < 1, K: fd.K, logi: fd.logi, sent: fd.sent }; }
  // 굶어 죽은 날 갈래: 곳간 바닥(그날 식량 환산 < 1 · foodGap 직격) ↔ 흐름 음수 ∧ 3일치 밑(EMA 몫)
  m.gapDeaths = 0; m.emaDeaths = 0;
  for (const x of s) if (x.d >= W0 && x.d < W1 && x.deaths > 0) { if (x.tfe < 1) m.gapDeaths += x.deaths; else m.emaDeaths += x.deaths; }
  // 캐러밴(관찰기 ③ 이 있으면) — 첫 죽음(없으면 90날) 앞에 떠난 이 마을 캐러밴
  if (o.car) {
    const end = m.firstDeath != null ? m.firstDeath : W1;
    const cs = Object.values(o.car).filter((c) => c.from === nm && c.depart < end);
    const FOOD = new Set(['food', 'cooked_food', 'fish', 'meat']);
    m.car = { n: cs.length, giveFood: 0, gives: {}, rets: {}, foodBack: 0, foodBackN: 0, emptyBack: 0, out: 0, wantFood: 0 };
    for (const c of cs) {
      m.car.gives[c.give] = (m.car.gives[c.give] || 0) + 1; if (FOOD.has(c.give)) m.car.giveFood += c.giveAmt || 0;
      if (c.ret) m.car.rets[c.ret] = (m.car.rets[c.ret] || 0) + 1; if (FOOD.has(c.ret)) m.car.wantFood++;
      const last = c.ev[c.ev.length - 1] || [];
      const got = c.ev.filter((e) => e[0] < end && e[2]).pop();
      if (got && FOOD.has(got[2]) && got[3] > 0) { m.car.foodBack += got[3]; m.car.foodBackN++; }
      else if (last[1] === 'inbound' && !last[2]) m.car.emptyBack++;
      if (last[1] === 'outbound') m.car.out++;
    }
  }
  return m;
}
function runSum(o) {
  if (!o) return null;
  const vs = o.names.map((nm) => vil(o, nm)).filter(Boolean);
  const S = { n: vs.length, dPre: 0, dWin: 0, dPost: 0, below3by90: 0, negFlow0: 0, selfNever: 0, pop0: 0, pop30: 0, pop90: 0, shieldWin: 0, starveVil: 0, gap: 0, ema: 0 };
  for (const m of vs) {
    S.dPre += m.dPre; S.dWin += m.dWin; S.dPost += m.dPost; S.shieldWin += m.shieldWin; S.gap += m.gapDeaths; S.ema += m.emaDeaths;
    if (m.below3 != null && m.below3 < W1) S.below3by90++;
    if (m.flow0 != null && m.flow0 < 0) S.negFlow0++;
    if (m.selfDay == null || m.selfDay >= W1) S.selfNever++;
    if (m.dWin > 0) S.starveVil++;
    S.pop0 += m.pop0 || 0; S.pop30 += m.pop30 || 0; S.pop90 += m.pop90 || 0;
  }
  return { S, vs, econ: o.econ, knob: o.knob };
}
const runs = {};
if (SRV) for (const d of fs.readdirSync(SRV).filter((x) => /^run-/.test(x)).sort()) runs[d.slice(4)] = SEEDS.map((s) => [s, runSum(J(path.join(SRV, d, `base-${s}.t946.json`)))]);
if (LABD) for (const a of ['on', 'off']) runs['lab-' + a] = SEEDS.map((s) => [s, runSum(J(path.join(LABD, `${a}-${s}.t946.json`)))]);

console.log('\n| 판 | 시드 | econ 밭 수확(T100) · 시딩 며칠치(날 0) | 1~30날 죽음 | **31~90날 죽음** (곳간 바닥 · 흐름음수∧3일치 밑) | 91~150날 | 31~90날 굶는 마을 | 90날 앞 3일치 밑 마을 | 1~30날 흐름 평균 음수 마을 | 90날까지 자급 못 한 마을 | 인구 날 0 → 30 → 90 | 보호막이 지운 압력(31~90) |');
console.log('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|');
const tot = {};
for (const [k, arr] of Object.entries(runs)) {
  const t = tot[k] = { dPre: 0, dWin: 0, dPost: 0, starveVil: 0, below3by90: 0, negFlow0: 0, selfNever: 0, n: 0, gap: 0, ema: 0 };
  for (const [seed, r] of arr) {
    if (!r) { console.log(`| ${k} | ${seed} | 판 없음 |`); continue; }
    const S = r.S; for (const q of Object.keys(t)) if (q !== 'n') t[q] += S[q]; t.n++;
    console.log(`| ${k} | ${seed} | ${r.econ && r.econ.T100_FIELD_YIELD ? '켬' : '끔'} · ${r.econ ? r.econ.seedFoodDays0 : '?'} | ${f0(S.dPre)} | **${f0(S.dWin)}** (${f0(S.gap)} · ${f0(S.ema)}) | ${f0(S.dPost)} | ${S.starveVil}/${S.n} | ${S.below3by90} | ${S.negFlow0} | ${S.selfNever} | ${f0(S.pop0)} → ${f0(S.pop30)} → ${f0(S.pop90)} | ${f0(S.shieldWin)} |`);
  }
}
console.log('\n| 판 | 3시드 합 31~90날 죽음 (바닥 · EMA) | 굶는 마을 | 3일치 밑 마을 | 흐름 음수 마을 | 자급 못 한 마을 | 1~30날 · 91~150날 죽음 |');
console.log('|---|---:|---:|---:|---:|---:|---|');
for (const [k, t] of Object.entries(tot)) console.log(`| ${k} (${t.n}/3) | **${f0(t.dWin)}** (${f0(t.gap)} · ${f0(t.ema)}) | ${t.starveVil} | ${t.below3by90} | ${t.negFlow0} | ${t.selfNever} | ${f0(t.dPre)} · ${f0(t.dPost)} |`);

// T837 띠 — 같은 갈래(이름 `~` 앞)의 판들(기준 · 습격 하나 건너뛴 판 · 다시 돌린 판) 3시드 합의 최소 ~ 최대
const fam = {};
for (const [k, t] of Object.entries(tot)) { if (t.n < 3) continue; const f = k.split('~')[0]; (fam[f] = fam[f] || []).push([k, t]); }
console.log('\n| 갈래 | 판 수 | 31~90날 죽음 띠 | 곳간 바닥 몫 띠 | 굶는 마을 띠 | 3일치 밑 마을 띠 | 91~150날 죽음 띠 | 판 |');
console.log('|---|---:|---|---|---|---|---|---|');
const band = (a, q) => { const v = a.map(([, t]) => t[q]); return `${f0(Math.min(...v))} ~ ${f0(Math.max(...v))}`; };
for (const [f, a] of Object.entries(fam)) console.log(`| ${f} | ${a.length} | ${band(a, 'dWin')} | ${band(a, 'gap')} | ${band(a, 'starveVil')} | ${band(a, 'below3by90')} | ${band(a, 'dPost')} | ${a.map(([k]) => k).join(' · ')} |`);
// ① 끔 판 굶는 마을 한 줄씩 · 같은 마을의 켬 판 · 랩 끔 · 랩 켬
const pick = (k, seed, nm) => { const a = runs[k]; if (!a) return null; const e = a.find(([s]) => s === seed); return e && e[1] ? e[1].vs.find((m) => m.name === nm) : null; };
const rowsOut = [];
const keysOff = [OFF, 'lab-off'].filter((k) => runs[k]);
for (const kOff of keysOff) {
  const kOn = kOff === 'lab-off' ? 'lab-on' : ON;
  const kOther = kOff === 'lab-off' ? OFF : 'lab-off';
  console.log(`\n### ${kOff} — 31~90날 굶는 마을(시드:마을) · 같은 마을 ${kOn} · ${kOther}`);
  console.log('| 시드:마을 | 땅 비옥·물·사냥감 | 창설 인구 · 직업 | 시딩 며칠치(곳간) | 인구 날 0 → 30 → 꼭대기(날) | 30날 K(자리·흐름·연료) · 주거 | 1~30날 흐름/날 | 30날~첫 죽음 흐름/날 | 자급 첫날 | 3일치 밑 첫날 | 첫 죽음 날 | 받은 식량(받은 날) · 낸 캐러밴 | 그 밖 곳간에서 빠짐 · 듦 | 캐러밴(첫 죽음 앞 떠남): 낸 품목 · 받아 올 품목 · 식량 싣고 옴(건) · 빈손 | 31~90날 죽음(바닥·EMA) | ' + kOn + ' 죽음 · 지운 압력 | ' + kOther + ' 죽음 · 3일치 밑 |');
  console.log('|---|---|---|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---|');
  for (const [seed, r] of runs[kOff]) {
    if (!r) continue;
    for (const m of r.vs.filter((x) => x.dWin > 0).sort((a, b) => b.dWin - a.dWin)) {
      const on = pick(kOn, seed, m.name), ot = pick(kOther, seed, m.name);
      rowsOut.push({ run: kOff, seed, ...m, on: on && { dWin: on.dWin, shieldWin: on.shieldWin, below3: on.below3 }, other: ot && { dWin: ot.dWin, below3: ot.below3, seedDays: ot.seedDays } });
      console.log(`| ${seed}:${m.name} | ${f1(m.fert)}·${f1(m.water)}·${f1(m.game)} | ${m.initN} · ${m.job0} | ${f1(m.seedDays)} (${f0(m.seedFood)}) | ${m.pop0} → ${m.pop30} → ${m.peak}(${m.peakDay}) | ${f0(m.K30)}(${f0(m.Kslot30)}·${f0(m.Kprod30)}·${f0(m.Kfuel30)}) · ${f0(m.house30)} | ${f1(m.flow0)} | ${f1(m.flow1)} | ${m.selfDay == null ? '없음' : m.selfDay} | ${m.below3 == null ? '없음' : m.below3} | ${m.firstDeath} | ${f0(m.imp)}(${m.impDays}) · ${m.atDeath ? m.atDeath.sent : '—'} | ${f0(m.outOther)} · ${f0(m.inOther)} | ${m.car ? `${Object.entries(m.car.gives).map(([a, b]) => a + b).join('·')} · ${Object.entries(m.car.rets).map(([a, b]) => a + b).join('·') || '—'} · ${f0(m.car.foodBack)}(${m.car.foodBackN}) · ${m.car.emptyBack}` : '로그 없음'} | ${m.dWin} (${m.gapDeaths}·${m.emaDeaths}) | ${on ? `${on.dWin} · ${f0(on.shieldWin)}` : '—'} | ${ot ? `${ot.dWin} · ${ot.below3 == null ? '없음' : ot.below3}` : '없음(그 마을 없음)'} |`);
    }
  }
}
// ② 마을 전체 분포 — 서버 ↔ 랩(같은 시드 · 같은 이름) 1~30날
console.log('\n| 판 | 시드 | 마을 | 시딩 며칠치(최소~최대) | 30날 인구 ÷ 창설 인구 | 1~30날 흐름 음수 마을 | 3일치 밑 첫날(중앙 · 90날 앞 마을 수) | 첫날부터 자급 마을 |');
console.log('|---|---|---:|---|---:|---:|---|---:|');
for (const [k, arr] of Object.entries(runs)) for (const [seed, r] of arr) {
  if (!r) continue;
  const sd = r.vs.map((m) => m.seedDays).filter((x) => x != null);
  const g = r.vs.reduce((a, m) => a + (m.pop30 || 0), 0) / Math.max(1, r.vs.reduce((a, m) => a + (m.initN || 0), 0));
  const b3 = r.vs.map((m) => m.below3).filter((x) => x != null && x < W1).sort((a, b) => a - b);
  console.log(`| ${k} | ${seed} | ${r.vs.length} | ${sd.length ? f1(Math.min(...sd)) + '~' + f1(Math.max(...sd)) : '—'} | ${g.toFixed(2)} | ${r.S.negFlow0} | ${b3.length ? b3[Math.floor(b3.length / 2)] : '—'} · ${b3.length} | ${r.vs.filter((m) => m.selfDay != null && m.selfDay === m.day0).length} |`);
}
// ③ 서버 ↔ 랩 첫 갈림(같은 시드 · 같은 마을 · 보호막 끔 둘): 날 줄(인구 · 곳간 식량 · 식량 환산 · 흐름 · 낸 캐러밴)이 처음 다른 날과 그 칸 · 그 마을 첫 캐러밴들(떠난 날 · 어디로 · 낸 것 · 받아 올 것 · 실제로 싣고 온 것)
const splitOut = [];
const SRVK = arg('--split', null);   // 예: --split C~re (캐러밴 로그가 있는 서버 판)
if (SRVK && runs[SRVK] && runs['lab-off']) {
  console.log(`\n### 서버 ${SRVK} ↔ 랩 끔 — 첫 갈림(같은 시드 · 같은 마을)`);
  console.log('| 시드 | 마을 | 31~90날 죽음 서버 · 랩 | 첫 갈림 날 · 칸 | 첫 캐러밴 셋 — 서버 | 첫 캐러밴 셋 — 랩 |');
  console.log('|---|---|---|---|---|---|');
  const KEYS = ['pop', 'food', 'tfe', 'flow', 'sent'];
  const carStr = (o, nm) => Object.values(o.car || {}).filter((c) => c.from === nm).sort((a, b) => a.depart - b.depart).slice(0, 3)
    .map((c) => { const g = c.ev.filter((e) => e[2]).pop(); return `${c.depart}날 →${c.to} ${c.give} ${f0(c.giveAmt)} ⇒ ${c.ret || '—'} / ${g ? `${g[2]} ${f1(g[3])}` : '빈손'}`; }).join(' ; ') || '없음';
  for (const seed of SEEDS) {
    const oS = J(path.join(SRV, 'run-' + SRVK, `base-${seed}.t946.json`)), oL = J(path.join(LABD.replace(/\/?$/, ''), `off-${seed}.t946.json`));
    if (!oS || !oL) continue;
    const names = new Set([...(runs[SRVK].find(([x]) => x === seed)[1] || { vs: [] }).vs.filter((m) => m.dWin > 0).map((m) => m.name),
      ...(runs['lab-off'].find(([x]) => x === seed)[1] || { vs: [] }).vs.filter((m) => m.dWin > 0).map((m) => m.name)]);
    let worldFirst = null;
    for (const nm of oS.names) {
      const a = series(oS, nm), b = series(oL, nm); if (!a || !b) continue;
      let sp = null;
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const dif = KEYS.filter((k) => Math.abs((a[i][k] || 0) - (b[i][k] || 0)) > 1e-6); if (dif.length) { sp = { d: a[i].d, cols: dif }; break; } }
      if (sp && (!worldFirst || sp.d < worldFirst.d)) worldFirst = { ...sp, nm };
      if (!names.has(nm)) continue;
      const mS = vil(oS, nm), mL = vil(oL, nm);
      splitOut.push({ seed, nm, srv: mS.dWin, lab: mL.dWin, split: sp, carS: carStr(oS, nm), carL: carStr(oL, nm) });
      console.log(`| ${seed} | ${nm} | ${mS.dWin} · ${mL.dWin} | ${sp ? `${sp.d} · ${sp.cols.join('·')}` : '같음'} | ${carStr(oS, nm)} | ${carStr(oL, nm)} |`);
    }
    if (worldFirst) console.log(`| ${seed} | (세계 첫 갈림) | | ${worldFirst.d} · ${worldFirst.nm} · ${worldFirst.cols.join('·')} | | |`);
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ tot, fam: Object.fromEntries(Object.entries(fam).map(([f, a]) => [f, a.map(([k]) => k)])), rows: rowsOut, split: splitOut, runs: Object.fromEntries(Object.entries(runs).map(([k, a]) => [k, a.map(([s, r]) => [s, r && r.S])])) }));
