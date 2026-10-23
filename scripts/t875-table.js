#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T875 표 기계 · 읽기만)
// === scripts/t875-table.js — 첫해 기근 갈래 표 — `scripts/t875-observe.js` 가 적은 판들을 읽어 갈래마다 셈 · 띠(T837 갈림 대조) · 견줌을 낸다 ===
//   node scripts/t875-table.js --srv <판 뿌리> [--lab <판 뿌리>] [--base A] [--json <파일>]
//     서버 판 = <뿌리>/<판>/base-<시드>.t875.json (+ 곁의 base-<시드>.json · T875 관찰기 판이 없으면 T858 관찰기 판 `base-<시드>.t858.json` — 주거 · K · 수입 칸은 비운다)
//     랩 판 = <뿌리>/<판>/t17-<시드>.t875.json
//     판 이름에 `~raidN` 이 붙은 판은 그 앞 이름 판의 갈림 대조(띠)다 — 셈마다 띠 = 그 판 + 대조 판들의 최소 ~ 최대(T837 `diverge-table` 과 같은 잣대).
//   셈(3시드 합):
//     fam365 = 365일 앞 굶어 죽음(`_deathsToday` 합 · 첫해) · fam400 = 365~400일 굶어 죽음
//     empty = 끝 날 빈 마을(한 번이라도 사람이 있었고 끝 날 0) · empty365 = 그중 첫 빈 날이 365일 앞
//     pop100 · pop365 · popEnd = 그날 인구 합 · peak = 첫해 인구 합의 최고 · starve = 첫해 굶는 마을-날(인구 > 0 · 곳간 식량 환산 < 인구)
//     over20 = 첫해 최고 인구가 시딩 주거(첫날 `housing`)를 넘은 마을 수 · house365 = 365일 주거 합 · shield = 첫해 보호막이 지운 압력 합
//     k80 = 첫해 인구가 K(`_dpDebug.K`)의 80% 를 넘은 마을 수 · imp364 = 364일까지 받은 식량 합(`tradeStats.foodImported`)
//     took = 크루가 곳간에서 꺼낸 통나무(`actFromGranary` 합) · raids = 습격(판 JSON `bandit.loot`)
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), BASE = arg('--base', 'A'), OUTJ = arg('--json', null);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function perRun(o, side) {   // 판 하나(시드 하나)의 셈
  if (!o || !o.rows || !o.rows.length) return null;
  const C = o.cols, ix = (k) => C.indexOf(k);
  //   T858 관찰기 판(`*.t858.json` — 같은 장부 문 · 칸 [pop · tfe · deathsToday · shieldAte · …])도 읽는다(주거 칸 없음 → 주거 셈은 비운다)
  const iP = ix('pop'), iT = ix('tfe'), iD = ix('deaths') >= 0 ? ix('deaths') : ix('deathsToday'), iS = ix('shieldAte'), iH = ix('housing'), iK = ix('K'), iI = ix('foodImp');
  const n = o.names.length, firstPos = new Array(n).fill(null), emptyDay = new Array(n).fill(null), had = new Array(n).fill(false), peakV = new Array(n).fill(0), peakK = new Array(n).fill(0);
  const s = { fam365: 0, fam400: 0, starve: 0, shield: 0, pop100: null, pop365: null, popEnd: 0, peak: 0, house365: null, days: 0 };
  for (const [d, row] of o.rows) {
    let tot = 0;
    row.forEach((c, i) => {
      const N = c[iP]; tot += N;
      if (N > 0) { had[i] = true; emptyDay[i] = null; } else if (had[i] && emptyDay[i] == null) emptyDay[i] = d;
      if (d < 365) { s.fam365 += c[iD]; s.shield += c[iS] || 0; if (N > 0 && c[iT] < N) s.starve++; if (N > peakV[i]) peakV[i] = N; if (iK >= 0 && c[iK] > 0 && N / c[iK] > peakK[i]) peakK[i] = N / c[iK]; }
      else if (d <= 400) s.fam400 += c[iD];
    });
    if (d < 365 && tot > s.peak) s.peak = tot;
    if (d === 100) s.pop100 = tot;
    if (d === 364 && iI >= 0) s.imp364 = row.reduce((a, c) => a + (c[iI] || 0), 0);
    if (d === 365) { s.pop365 = tot; s.house365 = iH >= 0 ? row.reduce((a, c) => a + (c[iH] || 0), 0) : null; }
    s.days = d;
  }
  const lastRow = o.rows[o.rows.length - 1][1];
  s.popEnd = lastRow.reduce((a, c) => a + c[iP], 0);
  s.empty = 0; s.empty365 = 0; s.emptyNames = [];
  lastRow.forEach((c, i) => { if (had[i] && c[iP] === 0) { s.empty++; s.emptyNames.push(o.names[i]); if (emptyDay[i] != null && emptyDay[i] < 365) s.empty365++; } });
  const seedH = new Map((o.seed || []).map((x) => [x.name, x.housing]));
  s.over20 = (o.seed && o.seed.length) ? o.names.filter((nm, i) => seedH.get(nm) != null && peakV[i] > seedH.get(nm)).length : null;
  s.took = o.act ? ((o.act.took && o.act.took.wood) || 0) : null;
  s.k80 = iK >= 0 ? peakK.filter((q) => q >= 0.8).length : null;
  s.peakV = peakV;
  return s;
}
const KEYS = ['fam365', 'fam400', 'empty', 'empty365', 'pop100', 'pop365', 'popEnd', 'peak', 'starve', 'over20', 'k80', 'house365', 'imp364', 'shield', 'took', 'raids'];
function loadSide(root, side) {
  const out = {};
  if (!root) return out;
  for (const name of fs.readdirSync(root).sort()) {
    const d = path.join(root, name); if (!fs.statSync(d).isDirectory()) continue;
    const per = {}; let ok = true;
    for (const sd of SEEDS) {
      const o = J(side === 'srv' ? `${d}/base-${sd}.t875.json` : `${d}/t17-${sd}.t875.json`) || (side === 'srv' ? J(`${d}/base-${sd}.t858.json`) : null);
      const s = perRun(o, side);
      if (!s) { ok = false; continue; }
      if (side === 'srv') { const m = J(`${d}/base-${sd}.json`); s.raids = (m && m.bandit && m.bandit.loot) || 0; s.dissolved = m ? m.dissolved : null; s.tradersKilled = m ? m.tradersKilled : null; }
      else s.raids = 0;
      s.arm = o.arm; s.knob = o.knob; s.euclid = o.euclid || null; s.nolive = o.nolive || 0; s.act = o.act; s.names = o.names; s.seedSnap = o.seed;
      per[sd] = s;
    }
    if (!Object.keys(per).length) continue;
    const sum = {}; for (const k of KEYS) sum[k] = SEEDS.some((sd) => per[sd] && per[sd][k] == null) ? null : SEEDS.reduce((a, sd) => a + ((per[sd] && per[sd][k]) || 0), 0);   // 칸이 없는 판(T858 관찰기 판의 주거 · K · 수입)은 null
    sum.seeds = Object.keys(per).length; sum.complete = ok;
    out[name] = { per, sum };
  }
  return out;
}
const S = loadSide(SRV, 'srv'), Lb = loadSide(LAB, 'lab');
// 띠 — 판 X 와 X~raidN
function bandsOf(side) {
  const B = {};
  for (const name of Object.keys(side)) {
    if (name.includes('~')) continue;
    const members = [name, ...Object.keys(side).filter((k) => k.startsWith(name + '~'))].filter((k) => side[k].sum.complete);
    if (members.length < 2) continue;
    const by = {};
    for (const k of KEYS) { const xs = members.map((m) => side[m].sum[k]).filter((x) => x != null); if (xs.length < members.length) { by[k] = null; continue; } const lo = Math.min(...xs), hi = Math.max(...xs); by[k] = { lo, hi, w: hi - lo, mean: xs.reduce((a, x) => a + x, 0) / xs.length }; }
    B[name] = { n: members.length, members, by };
  }
  return B;
}
const BS = bandsOf(S);
function pair(x, y) {   // y − x
  const a = S[x], b = S[y]; if (!a || !b) return null;
  const rows = KEYS.map((k) => {
    const bx = BS[x] && BS[x].by[k], by = BS[y] && BS[y].by[k];
    const d = b.sum[k] - a.sum[k];
    const dm = (bx && by) ? by.mean - bx.mean : null;
    const ov = (bx && by) ? !(by.lo > bx.hi || bx.lo > by.hi) : null;
    const wmax = Math.max(bx ? bx.w : 0, by ? by.w : 0);
    return { k, a: a.sum[k], b: b.sum[k], d, dm, ov, wmax: (bx || by) ? wmax : null, big: (bx || by) ? Math.abs(d) > wmax : null };
  });
  return { x, y, rows };
}
const P = [];
for (const name of Object.keys(S)) { if (name.includes('~') || name === BASE) continue; const base = name.startsWith('C-') ? 'C' : (name === 'C' ? BASE : BASE); const pp = pair(base, name); if (pp) P.push(pp); }
// 시딩 — 랩 ↔ 서버 같은 마을을 세우나(시드마다 · 마을마다 land · storage · housing · 인구)
function seedCmp() {
  const la = Lb[Object.keys(Lb)[0]], sa = S[BASE]; if (!la || !sa) return null;
  const o = {};
  for (const sd of SEEDS) {
    const L = la.per[sd] && la.per[sd].seedSnap, R = sa.per[sd] && sa.per[sd].seedSnap; if (!L || !R) continue;
    const byN = new Map(R.map((x) => [x.name, x]));
    let same = 0, diff = 0; const ex = [];
    for (const x of L) { const y = byN.get(x.name); const a = JSON.stringify([x.n, x.housing, x.land, x.storage]), b = y ? JSON.stringify([y.n, y.housing, y.land, y.storage]) : null;
      if (a === b) same++; else { diff++; if (ex.length < 5) ex.push({ name: x.name, lab: x, srv: y || null }); } }
    o[sd] = { lab: L.length, srv: R.length, same, diff, ex };
  }
  return o;
}
const doc = { srv: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, { sum: v.sum, per: Object.fromEntries(Object.entries(v.per).map(([sd, s]) => [sd, Object.assign({}, s, { peakV: undefined, names: undefined, seedSnap: undefined })])) }])),
  lab: Object.fromEntries(Object.entries(Lb).map(([k, v]) => [k, { sum: v.sum, per: Object.fromEntries(Object.entries(v.per).map(([sd, s]) => [sd, Object.assign({}, s, { peakV: undefined, names: undefined, seedSnap: undefined })])) }])),
  bands: BS, pairs: P, seed: seedCmp() };
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(doc));
// 글 표
const f = (x) => (x == null ? '—' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(Math.round(x * 10) / 10)));
console.log('| 판 | 첫해 굶어 죽음 | 365~400 | 빈 마을(365 앞) | 인구 100 · 365 · 끝 | 첫해 최고 | 굶는 마을-날 | 시딩 주거 넘은 마을 | 365일 주거 | 크루 통나무 | 습격 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [side, X] of [['랩', Lb], ['서버', S]]) for (const [k, v] of Object.entries(X)) { const s = v.sum;
  console.log(`| ${side} ${k}${s.complete ? '' : ' (덜 됨)'} | ${f(s.fam365)} | ${f(s.fam400)} | ${s.empty} (${s.empty365}) | ${f(s.pop100)} · ${f(s.pop365)} · ${f(s.popEnd)} | ${f(s.peak)} | ${f(s.starve)} | ${f(s.over20)} | ${f(s.house365)} | ${f(s.took)} | ${s.raids} |`); }
for (const [k, b] of Object.entries(BS)) console.log(`띠 ${k}(${b.n}): 첫해 굶어 죽음 ${f(b.by.fam365.lo)}~${f(b.by.fam365.hi)} · 빈 마을 ${b.by.empty.lo}~${b.by.empty.hi} · 끝 인구 ${f(b.by.popEnd.lo)}~${f(b.by.popEnd.hi)}`);
const sc = doc.seed; if (sc) console.log('시딩 랩 ↔ 서버:', Object.entries(sc).map(([sd, x]) => `${sd} 같음 ${x.same}/${x.lab} · 다름 ${x.diff}`).join(' · '));
