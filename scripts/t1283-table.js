#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1283-table.js — T1283 판 표: 끔 · v2 만 · 묶음 · v2 만 + T1283 · 묶음 + T1283 · 묶음 + 걸음(나) (· 실험 판 둘) — 3시드 × 400날 ===
//   읽는 것: 기준선 JSON(끔 — 인구 · 빈 마을) · `--make` JSON(팔마다 · 인구 · 빈 마을) · 판 폴더의
//     `sbc-<시드>.json.t1275.json`(날 줄 — 인구 · 나무꾼 · 곳간 통나무 · 말뚝 통나무 · 영토) · `sbc-<시드>.json.t1283.json`(마을-날 — 땔감 충당 · 나무꾼 흐름) ·
//     `sbc-<시드>.fd-deaths.json`(굶어 죽음 누계)
//   재는 것(시드마다): 인구 · 끔비 · 빈 마을 · 꼭대기(날) · 꼭대기 뒤 내림 %(=(꼭대기 − 끝) ÷ 꼭대기) · 굶어 죽음 · 끝 날 나무꾼 · 곳간 통나무 · 땔감 충당 평균(끝 50날) · 말뚝 통나무 누계 · 영토 칸
//   쓰는 법: node scripts/t1283-table.js --off <기준선>[@<끔 판 폴더>,…] --arm <이름>=<make.json>[,…]@<판 폴더>[,…] … [--out 계측/T1283_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SEEDS = [1020, 7, 42];
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') { const v = A[i + 1], j = v.indexOf('='), [js, ds] = v.slice(j + 1).split('@'); arms.push({ k: v.slice(0, j), jsons: js.split(','), dirs: (ds || '').split(',').filter(Boolean) }); }
const OFFA = (opt('--off') || '').split('@'), OFF = OFFA[0] || null, OFFD = (OFFA[1] || '').split(',').filter(Boolean), OUT = opt('--out');
const find = (dirs, s, suf) => { for (const d of dirs) { const p = path.join(d, `sbc-${s}${suf}`); if (fs.existsSync(p)) return p; } return null; };
//   T1275 훅 날 줄 칸: 0 날 · 1 인구 · 2 영토 · 3 곳간 통나무 · 10 말뚝 통나무 누계 · 14 나무꾼
function seedRow(r, dirs, s) {
  const o = { pop: r ? r.eight.pop : null, empty: r ? r.empty : null };
  const h5 = rd(find(dirs, s, '.json.t1275.json') || ''), h3 = rd(find(dirs, s, '.json.t1283.json') || ''), fd = rd(find(dirs, s, '.fd-deaths.json') || '');
  if (h5 && h5.days && h5.days.length) {
    const D = h5.days, last = D[D.length - 1];
    let pk = D[0]; for (const q of D) if (q[1] > pk[1]) pk = q;
    o.peak = pk[1]; o.peakDay = pk[0]; o.drop = +(100 * (pk[1] - last[1]) / pk[1]).toFixed(1);
    o.lj = last[14]; o.wood = +last[3].toFixed(0); o.postW = +last[10].toFixed(0); o.terr = last[2];
    o.traj = D.filter((q) => q[0] % 50 === 0).map((q) => [q[0], q[1], q[14], +q[3].toFixed(0)]);
  }
  if (h3 && h3.rows) {
    const c = {}; h3.cols.forEach((k, i) => { c[k] = i; });
    const lastDay = h3.rows.reduce((m, q) => Math.max(m, q[c.day]), 0);
    let n = 0, sum = 0; for (const q of h3.rows) if (q[c.day] > lastDay - 50 && q[c.N] > 0 && q[c.fuelCov] != null) { n++; sum += q[c.fuelCov]; }
    o.fuelCov = n ? +(sum / n).toFixed(3) : null;
    let out = 0, inn = 0; for (const q of h3.rows) { out += q[c.ljOut] || 0; inn += q[c.ljIn] || 0; }
    o.ljOut = out; o.ljIn = inn;
  }
  if (fd) o.famine = fd.fdDeadTot;
  return o;
}
const res = {};
if (OFF) { const b = rd(OFF); res.off = { seeds: {} }; for (const s of SEEDS) { const r = b && b.byseed && b.byseed[String(s)]; if (r) res.off.seeds[s] = seedRow(r, OFFD, s); } }
for (const a of arms) {
  const by = {}; for (const f of a.jsons) { const b = rd(f); if (b && b.byseed) Object.assign(by, b.byseed); }
  res[a.k] = { seeds: {} };
  for (const s of SEEDS) { const r = by[String(s)]; if (r) res[a.k].seeds[s] = seedRow(r, a.dirs, s); }
}
const NAME = { off: '끔(기준선 11-11)', v2: 'v2 만', bundle: '묶음(나무꾼 몸 + v2)', v2T: 'v2 만 + T1283', bundleT: '묶음 + T1283', bundleH: '묶음 + 걸음(나)', bundleTW: '묶음 + T1283 + 출생 곳간 문(T1149 birth · 실험 · 가지에 안 실음)', bundleTK: '묶음 + T1283 + K 곳간(T1149 k · 실험 · 가지에 안 실음)' };
const offPop = (s) => res.off && res.off.seeds[s] ? res.off.seeds[s].pop : null;
const num = (x, f) => (typeof x !== 'number' ? (x == null ? '—' : x) : (f === 'drop' || f === 'fuelCov') ? String(x) : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const md = [];
md.push('| 판 | 인구(명) 1020 · 7 · 42 | 끔비 1020 · 7 · 42 | 빈 마을(곳) | 꼭대기(명 · 날) | 꼭대기 뒤 내림(%) | 굶어 죽음(명 · 400날 누계) | 나무꾼(끝 · 명) | 나무꾼 나감 · 들어옴(명 · 400날) | 곳간 통나무(끝 · 단) | 땔감 충당(끝 50날 마을 평균 · 0 ~ 1) | 말뚝 통나무 누계(단) |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of Object.keys(res)) {
  const o = res[k], per = (f) => SEEDS.map((s) => (o.seeds[s] ? num(o.seeds[s][f], f) : '—')).join(' · ');
  const ratio = SEEDS.map((s) => (o.seeds[s] && offPop(s) ? (o.seeds[s].pop / offPop(s)).toFixed(3) : '—')).join(' · ');
  const peak = SEEDS.map((s) => (o.seeds[s] && o.seeds[s].peak != null ? `${num(o.seeds[s].peak)} (${o.seeds[s].peakDay})` : '—')).join(' · ');
  const flow = SEEDS.map((s) => (o.seeds[s] && o.seeds[s].ljOut != null ? `${o.seeds[s].ljOut}/${o.seeds[s].ljIn}` : '—')).join(' · ');
  md.push(`| ${NAME[k] || k} | ${per('pop')} | ${k === 'off' ? '1 · 1 · 1' : ratio} | ${per('empty')} | ${peak} | ${per('drop')} | ${per('famine')} | ${per('lj')} | ${flow} | ${per('wood')} | ${per('fuelCov')} | ${k === 'off' ? '—' : per('postW')} |`);
}
const txt = md.join('\n'); console.log(txt);
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 't1283-table.json'), JSON.stringify(res)); fs.writeFileSync(path.join(OUT, 't1283-table.md'), txt + '\n'); console.log(`\n→ ${OUT}/t1283-table.{json,md}`); }
