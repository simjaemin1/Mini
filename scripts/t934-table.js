#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T934 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t934-table.js — 첫해 굶어 죽음을 날 · 마을 · 까닭(인구 고리 칸)으로 가른다 · 보호막 켬 ↔ 끔 첫 갈림 날 ===
//   node scripts/t934-table.js --srv <판 뿌리> [--lab <랩 뿌리>] [--on A --off C] [--json <파일>]
//     서버 판 = <뿌리>/run-<판>/base-<시드>.t934.json · 랩 판 = <랩 뿌리>/<on|off>-<시드>.t934.json
//   까닭 몫: 죽음은 빚(`_dPAccum ≤ −1`)에서 난다. 그날 칸들(logi · hunger · health · happy · prestige) 가운데 음수인 칸의 크기 비로 그날 죽음을 나눈다.
//     그날 음수 칸이 없으면(앞서 쌓인 빚) 그 마을의 그때까지 음수 칸 누계 비로 나눈다. ⇒ 몫은 근사다(산수뿐 · 판정 0).
//     logi = θ-로지스틱(N 이 K 를 넘으면 음수 — "K 넘김") · hunger = 식량 흐름 음수 + 곳간 3일치 미만 · 그날 모자란 식량(foodGap) · health · happy = 마을 상태 칸.
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LABD = arg('--lab', null), ON = arg('--on', 'A'), OFF = arg('--off', 'C'), JOUT = arg('--json', null);
const SEEDS = [1020, 7, 42];
const TERMS = ['logi', 'hunger', 'health', 'happy', 'prestige'];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const pc = (a, b) => (b > 0 ? (100 * a / b).toFixed(1) + '%' : '—');
const kind = (n) => (String(n).match(/^[^\d]+/) || ['?'])[0];

function one(o) {   // 판 하나(시드 하나) → 셈(첫해 = 날 < 365)
  if (!o || !o.rows) return null;
  const C = {}; o.cols.forEach((c, i) => { C[c] = i; });
  const nV = o.names.length;
  const cum = Array.from({ length: nV }, () => Object.fromEntries(TERMS.map((t) => [t, 0])));
  const m = { deaths: 0, by: Object.fromEntries(TERMS.map((t) => [t, 0])), unattributed: 0, press: Object.fromEntries(TERMS.map((t) => [t, 0])),
    month: new Array(13).fill(0), vil: {}, kind: {}, overK: 0, overKDeath: 0, drafted: 0, shieldAte: 0, starveDays: 0, deathDays: 0 };
  for (const [day, row] of o.rows) {
    if (day >= 365) break;
    for (let i = 0; i < nV; i++) {
      const r = row[i]; if (!r) continue;
      const N = r[C.pop], dth = r[C.deaths], K = r[C.K];
      const neg = {}; let negSum = 0;
      for (const t of TERMS) { const x = +r[C[t]] || 0; if (x < 0) { neg[t] = -x; negSum += -x; cum[i][t] += -x; m.press[t] += -x; } }
      m.shieldAte += +r[C.shieldAte] || 0; m.drafted += r[C.drafted] || 0;
      if (N > 0 && K > 0 && N > K) { m.overK++; if (dth > 0) m.overKDeath += dth; }
      if (N > 0 && (+r[C.tfe] || 0) < N) m.starveDays++;
      if (!(dth > 0)) continue;
      m.deaths += dth; m.deathDays++; m.month[Math.floor(day / 30)] += dth;
      const nm = o.names[i]; m.vil[nm] = (m.vil[nm] || 0) + dth; m.kind[kind(nm)] = (m.kind[kind(nm)] || 0) + dth;
      let base = negSum > 0 ? neg : cum[i], bs = 0; for (const t of TERMS) bs += base[t] || 0;
      if (!(bs > 0)) { m.unattributed += dth; continue; }
      for (const t of TERMS) m.by[t] += dth * ((base[t] || 0) / bs);
    }
  }
  return m;
}
function sum(ms) {
  const s = { deaths: 0, by: Object.fromEntries(TERMS.map((t) => [t, 0])), press: Object.fromEntries(TERMS.map((t) => [t, 0])), unattributed: 0, month: new Array(13).fill(0), kind: {}, vil: {}, overK: 0, overKDeath: 0, drafted: 0, shieldAte: 0, starveDays: 0, deathDays: 0, n: 0 };
  for (const [seed, m] of ms) {
    if (!m) continue; s.n++;
    for (const k of ['deaths', 'unattributed', 'overK', 'overKDeath', 'drafted', 'shieldAte', 'starveDays', 'deathDays']) s[k] += m[k];
    for (const t of TERMS) { s.by[t] += m.by[t]; s.press[t] += m.press[t]; }
    m.month.forEach((x, i) => { s.month[i] += x; });
    for (const [k, x] of Object.entries(m.kind)) s.kind[k] = (s.kind[k] || 0) + x;
    for (const [k, x] of Object.entries(m.vil)) s.vil[seed + ':' + k] = x;
  }
  return s;
}
// 첫 갈림(켬 ↔ 끔 · 같은 시드 · 같은 마을): 그 마을 줄(인구 · 죽음)이 처음 다른 날 · 그날 켬 판에서 보호막이 지운 압력과 음수 칸
function firstSplit(oOn, oOff) {
  if (!oOn || !oOff) return null;
  const C = {}; oOn.cols.forEach((c, i) => { C[c] = i; });
  const out = [];
  for (let i = 0; i < oOn.names.length; i++) {
    const nm = oOn.names[i], j = oOff.names.indexOf(nm); if (j < 0) continue;
    let firstShield = null, split = null, why = null;
    for (let d = 0; d < Math.min(oOn.rows.length, oOff.rows.length); d++) {
      const a = oOn.rows[d][1][i], b = oOff.rows[d][1][j]; if (!a || !b) continue;
      if (firstShield == null && (+a[C.shieldAte] || 0) > 0) firstShield = oOn.rows[d][0];
      if (split == null && (a[C.pop] !== b[C.pop] || a[C.deaths] !== b[C.deaths] || a[C.accum] !== b[C.accum])) {
        split = oOn.rows[d][0];
        const neg = TERMS.filter((t) => (+a[C[t]] || 0) < 0).map((t) => `${t}${a[C[t]]}`);
        why = { shieldAte: a[C.shieldAte], neg, N: a[C.pop], K: a[C.K] };
      }
      if (split != null && firstShield != null) break;
    }
    out.push({ name: nm, split, firstShield, why });
  }
  return out;
}
const runs = {};
if (SRV) for (const d of fs.readdirSync(SRV).filter((x) => /^run-/.test(x)).sort()) runs[d.slice(4)] = SEEDS.map((s) => [s, one(J(path.join(SRV, d, `base-${s}.t934.json`)))]);
if (LABD) for (const a of ['on', 'off']) runs['lab-' + a] = SEEDS.map((s) => [s, one(J(path.join(LABD, `${a}-${s}.t934.json`)))]);
const S = {}; for (const [k, ms] of Object.entries(runs)) S[k] = sum(ms);
console.log('\n| 판 | 첫해 굶어 죽음 | K 넘김(logi) | 굶주림(hunger) | 건강(health) | 행복(happy) | 몫 못 나눔 | 죽음 난 마을-날 | N > K 마을-날 (그날 죽음) | 굶는 마을-날 | 징발 마을-날·명 | 보호막이 지운 압력 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|');
for (const [k, s] of Object.entries(S)) {
  console.log(`| ${k} (${s.n}/3) | ${f0(s.deaths)} | ${f0(s.by.logi)} (${pc(s.by.logi, s.deaths)}) | ${f0(s.by.hunger)} (${pc(s.by.hunger, s.deaths)}) | ${f0(s.by.health)} (${pc(s.by.health, s.deaths)}) | ${f0(s.by.happy)} (${pc(s.by.happy, s.deaths)}) | ${f0(s.unattributed)} | ${f0(s.deathDays)} | ${f0(s.overK)} (${f0(s.overKDeath)}) | ${f0(s.starveDays)} | ${f0(s.drafted)} | ${f0(s.shieldAte)} |`);
}
console.log('\n| 판 | 첫해 음수 칸 누계 — logi · hunger · health · happy |'); console.log('|---|---|');
for (const [k, s] of Object.entries(S)) console.log(`| ${k} | ${TERMS.slice(0, 4).map((t) => f0(s.press[t])).join(' · ')} |`);
console.log('\n| 판 | 30일 칸마다 죽음(1 ~ 13번째 칸) |'); console.log('|---|---|');
for (const [k, s] of Object.entries(S)) console.log(`| ${k} | ${s.month.map(f0).join(' · ')} |`);
console.log('\n| 판 | 마을 갈래별 죽음 | 죽음 많은 마을 다섯 |'); console.log('|---|---|---|');
for (const [k, s] of Object.entries(S)) console.log(`| ${k} | ${Object.entries(s.kind).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${f0(b)}`).join(' · ')} | ${Object.entries(s.vil).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, b]) => `${a} ${f0(b)}`).join(' · ')} |`);
const splits = {};
if (SRV && runs[ON] && runs[OFF]) {
  for (const s of SEEDS) splits[s] = firstSplit(J(path.join(SRV, 'run-' + ON, `base-${s}.t934.json`)), J(path.join(SRV, 'run-' + OFF, `base-${s}.t934.json`)));
  const all = Object.values(splits).flat().filter(Boolean);
  const sd = all.map((x) => x.split).filter((x) => x != null).sort((a, b) => a - b);
  const sameAsShield = all.filter((x) => x.split != null && x.firstShield != null && x.split === x.firstShield).length;
  const q = (p) => sd.length ? sd[Math.min(sd.length - 1, Math.floor(p * sd.length))] : null;
  console.log(`\n첫 갈림(${ON} ↔ ${OFF} · 같은 마을): 마을 ${all.length} · 갈린 마을 ${sd.length} · 첫 갈림 날 최소 ${sd[0]} · 중앙 ${q(0.5)} · 90% ${q(0.9)} · 그날 = 켬 판에서 보호막이 처음 압력을 지운 날 ${sameAsShield}`);
  const before = all.filter((x) => x.split != null && (x.firstShield == null || x.split < x.firstShield)).length, noShield = all.filter((x) => x.firstShield == null).length;
  const own = all.filter((x) => x.firstShield != null).map((x) => x.firstShield).sort((a, b) => a - b);
  console.log(`  제 보호막보다 먼저 갈린 마을(이웃 · 교역으로 번진 갈림) ${before} · 첫해에 제 보호막이 한 번도 안 선 마을 ${noShield} · 제 보호막 첫날 최소 ${own[0]} · 중앙 ${own.length ? own[Math.floor(own.length / 2)] : '—'}`);
  const negCount = {}; for (const x of all) if (x.why) for (const t of x.why.neg) { const k = t.replace(/-?[0-9.]+$/, ''); negCount[k] = (negCount[k] || 0) + 1; }
  console.log(`  첫 갈림 날 켬 판의 음수 칸(마을 수): ${Object.entries(negCount).map(([a, b]) => `${a} ${b}`).join(' · ')}`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ sums: S, splits }));
