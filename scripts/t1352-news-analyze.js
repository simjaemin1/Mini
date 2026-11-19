#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1352 판 분석 · 제품 무변)
// =============================================================================
// scripts/t1352-news-analyze.js — 두 존 가상 시계 판(`t1324-vclock-beast.js run … --nobeast --env T1324_XZ_MIGRATE=1[,T1352_NEWS_LOCAL=1][,T1352_NEWS_SEAM=1]`)의
//   이웃 존 이주를 소식 길로 가른다: 넘은 주민 · 받는 마을 1인 곳간 · 길 위 굶음 · 한 곳 몰림(날을 달리해 든 사람까지) · 소식 나이(들은 줄이 낡아 생긴 몰림 날 줄).
//
//   읽는 것(판 폴더 · 그 판 글자 그대로): 존 로그 `z_<표지>_<존>.log` 의 `[T1324] 이주 <열쇠> 떠남 · 닿음 · 길 위 죽음` 줄과 `[T1352] 표 떠남 · 닿음 · 꾸밈` 줄 ·
//     날 줄 `rows_<표지>_<존>.jsonl`(날 → 경계 수 — 들은 줄의 그 존 날을 경계 수로) · 맞춤 `mig_<표지>.json`(`t1324-mig-analyze.js` — 열쇠마다 끝 자리 하나 · 두 존 합) ·
//     메타 `meta_<표지>.json`(판 끝 `/perf` — 길 위 하루 · 굶은 하루 · 소식 길 셈).
//   나이(경계 수 · 두 존 같은 수) = 떠난 경계 − 들은 줄의 경계(그 존 날 줄로 찾는다 — 손잡이 끔 판도 같은 자로 잰다).
//   몰림 = 받는 마을마다 넘어와 닿은 사람(판 전체 · 날마다) · 들은 인구 대비 닿은 때 인구(넘침 = 닿은 때 인구 − 1 − 들은 인구 − 같은 날 같은 마을에서 앞서 고른 수) ·
//     닿은 날 그 마을 인구 식 K 위(n > K).
//   두 존 합 — 로그 맞춤(`mig_*.json` · 떠남 줄 기준)과 셈 맞춤(`/perf` t1324: 두 존 떠남 = 붙음 + 집으로 + 길 위 죽음 + 판 끝 길 위 · 넘김 OK = 받음)을 같이 낸다.
//     자연 이탈은 econ 날 조각(console.log 를 끈 조각) 안에서 떠나 떠남 로그 두 줄이 안 찍힌다(셈은 선다) — 그 판은 셈 맞춤이 자(`perfConserve.departLogMuted`).
//   쓰는 법: node scripts/t1352-news-analyze.js <outdir> <표지> [--json 파일]
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [OUTD, TAG] = process.argv.slice(2);
const jout = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (!OUTD || !TAG) { console.error('쓰는 법: <outdir> <표지> [--json 파일]'); process.exit(2); }
const ZS = ['hanbando', 'nippon'];
const other = (z) => (z === 'hanbando' ? 'nippon' : 'hanbando');
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const rowsOf = (z) => rd(path.join(OUTD, `rows_${TAG}_${z}.jsonl`)).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const G = {}; for (const z of ZS) { G[z] = new Map(); for (const r of rowsOf(z)) G[z].set(r.day, r.g); }
const reDep = /\[T1324\] 이주 (\S+) 떠남: (.+?) 주민 1명 → (.+?)@(\S+) · 경계 칸까지 (\d+)셀 · 몸 (\S+?) · 들은 줄 (\S+)날 곳간 (\S+) 인구 (\S+) 행복 (\S+?)(?: · 소식 (own|local|seam)(?:\((.+?)\))? 나이 (\S+)날 · 안 날 (\S+))?$/;
const reArr = /\[T1324\] 이주 (\S+) 닿음: (.+?) · 인구 (\d+) · 곳간 ([\d.?]+) · 길 (-?\d+)날/;
const reDead = /\[T1324\] 이주 (\S+) 길 위 죽음\((\w+)\)/;
const reTD = /\[T1352\] 표 떠남 (\S+) g(\d+) d(\d+)/;
const reTA = /\[T1352\] 표 닿음 (\S+) g(\d+) d(\d+) K(\S+)/;
const reStage = /\[T1352\] 꾸밈 (\d+)날 (\S+) 행복 (\S+) — 떠남 (\d+)\/(\d+) · 들은 줄 (\d+)/;
const dep = new Map(), arr = new Map(), dead = [], staged = { hanbando: { rounds: 0, took: 0, tries: 0, own: 0 }, nippon: { rounds: 0, took: 0, tries: 0, own: 0 } };
for (const z of ZS) {
  for (const line of rd(path.join(OUTD, `z_${TAG}_${z}.log`)).split('\n')) {
    let m;
    if ((m = reDep.exec(line))) dep.set(m[1], Object.assign(dep.get(m[1]) || {}, { key: m[1], zone: z, from: m[2], to: m[3], toZone: m[4], cells: +m[5], body: m[6] === '있음', d: +m[7], fe: +m[8], n: +m[9], h: +m[10],
      via: m[11] || 'own', src: m[12] || null, ageLog: m[13] != null && m[13] !== '?' ? +m[13] : null, kat: m[14] != null ? +m[14] : null }));
    else if ((m = reTD.exec(line))) dep.set(m[1], Object.assign(dep.get(m[1]) || {}, { g: +m[2], dday: +m[3] }));
    else if ((m = reArr.exec(line))) arr.set(m[1], Object.assign(arr.get(m[1]) || {}, { key: m[1], zone: z, vil: m[2], n: +m[3], fe: m[4] === '?' ? null : +m[4], days: +m[5] }));
    else if ((m = reTA.exec(line))) arr.set(m[1], Object.assign(arr.get(m[1]) || {}, { g: +m[2], aday: +m[3], K: m[4] === '?' ? null : +m[4] }));
    else if ((m = reDead.exec(line))) dead.push({ key: m[1], zone: z, ph: m[2] });
    else if ((m = reStage.exec(line))) { const S = staged[z]; S.rounds++; S.took += +m[4]; S.tries += +m[5]; if (+m[6] > 0) S.own++; }
  }
}
//   나이 — 들은 줄의 그 존 날 → 경계 수(그 존 날 줄)
for (const D of dep.values()) {
  const gl = G[D.toZone] && G[D.toZone].get(D.d);
  D.gLine = gl == null ? null : gl;
  D.age = (D.g != null && gl != null) ? D.g - gl : null;
}
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
//   닿음 · 몰림
const rows = [];
for (const A of arr.values()) {
  const D = dep.get(A.key) || null;
  rows.push(Object.assign({}, A, { from: D && D.from, fromZone: D && D.zone, via: D && D.via, age: D ? D.age : null, nHeard: D ? D.n : null, feHeard: D ? D.fe : null, dLine: D ? D.d : null, gDep: D ? D.g : null,
    perHead: (A.fe != null && A.n > 0) ? A.fe / A.n : null, overK: (A.K != null && A.n > A.K) ? 1 : 0 }));
}
//   같은 날 같은 마을에서 같은 곳으로 앞서 고른 수(T1312 · T1324 무리 셈 — 그 몫은 들은 인구에 이미 든다)
const sameDayPrior = new Map(); { const seen = new Map(); for (const D of [...dep.values()].sort((a, b) => (a.g - b.g) || (a.key < b.key ? -1 : 1))) { const k = `${D.g}|${D.zone}|${D.from}|${D.toZone}|${D.to}`; const c = seen.get(k) || 0; sameDayPrior.set(D.key, c); seen.set(k, c + 1); } }
for (const r of rows) { const pk = sameDayPrior.get(r.key) || 0; r.over = (r.nHeard != null) ? (r.n - 1) - r.nHeard - pk : null; }   // 닿기 전 인구 − 들은 인구 − 앞서 고른 수 = 들은 줄 밖에서 든 사람
const byVil = new Map();
for (const r of rows) { const k = `${r.zone}|${r.vil}`; const L = byVil.get(k) || []; L.push(r); byVil.set(k, L); }
const herd = [...byVil].map(([k, L]) => {
  L.sort((a, b) => (a.g - b.g) || (a.key < b.key ? -1 : 1));
  const days = [...new Set(L.map((r) => r.g))];
  const lines = new Map(); for (const r of L) { const lk = `${r.dLine}`; lines.set(lk, (lines.get(lk) || 0) + 1); }
  return { vil: k, n: L.length, days: days.length, sameLineMax: Math.max(...lines.values()), firstN: L[0].n - 1, lastN: L[L.length - 1].n, overK: L.filter((r) => r.overK).length,
    perHeadMin: q(L.map((r) => r.perHead).filter((x) => x != null), 0), over: L.reduce((a, r) => a + Math.max(0, r.over || 0), 0),
    line: L.map((r) => [r.aday, r.g, r.from, r.via, r.age, r.nHeard, r.n, r.over, r.K, r.perHead == null ? null : +r.perHead.toFixed(1)]) };
}).sort((a, b) => b.n - a.n);
//   나이 띠(경계 수) — 들은 줄이 낡을수록 닿는 마을이 들은 것보다 찼나(넘침) · 1인 곳간
const BANDS = [[0, 1], [2, 3], [4, 7], [8, 15], [16, 1e9]];
const ageBands = BANDS.map(([a, b]) => { const R = rows.filter((r) => r.age != null && r.age >= a && r.age <= b);
  return { band: b >= 1e9 ? `${a}+` : `${a}~${b}`, n: R.length, overMean: R.length ? +(R.reduce((s, r) => s + (r.over || 0), 0) / R.length).toFixed(2) : null, overPos: R.filter((r) => (r.over || 0) > 0).length,
    perHeadP50: (() => { const v = q(R.map((r) => r.perHead).filter((x) => x != null), 0.5); return v == null ? null : +v.toFixed(1); })(), overK: R.filter((r) => r.overK).length }; });
let mig = null; try { mig = JSON.parse(rd(path.join(OUTD, `mig_${TAG}.json`)) || 'null'); } catch (e) { mig = null; }
let meta = null; try { meta = JSON.parse(rd(path.join(OUTD, `meta_${TAG}.json`)) || 'null'); } catch (e) { meta = null; }
const perfT = {}; for (const z of ZS) { const P = meta && meta.perfEnd && meta.perfEnd[z]; const t = P && P.t1324; perfT[z] = t ? { t1352: t.t1352 ? Object.assign({}, t.t1352, { none: undefined }) : null, why: t.why || null, t1147: t.t1147 || null } : null; }
const ph = rows.map((r) => r.perHead).filter((x) => x != null);
//   ★셈으로 맞춤(`/perf` t1324 — 로그 줄과 따로): 두 존 떠남 합 = 닿아 붙음 + 집으로 + 길 위 죽음 + 판 끝 길 위(줄) · 보낸 존 넘김 OK = 받는 존 받음.
//     자연 이탈은 econ 날 조각(console.log 를 끈 조각 — `villages.js` `_econDayParts` · T731 창 머리) 안에서 `_t1324Depart` 를 불러 그 떠남 로그 두 줄이 안 찍힌다(셈은 선다) —
//     그 판은 로그 맞춤(`mig_*.json` 떠남 줄 기준)이 '떠남 없음'으로 빨강이 되므로 이 셈 맞춤을 같이 낸다. 떠남 로그 줄 수 · 셈 떠남 수도 같이.
const perfConserve = (() => {
  const P = {}; for (const z of ZS) P[z] = (meta && meta.perfEnd && meta.perfEnd[z] && meta.perfEnd[z].t1324) || null;
  if (!P.hanbando || !P.nippon) return null;
  const sum = (f) => ZS.reduce((a, z) => a + ((P[z] && +P[z][f]) || 0), 0);
  const onRoad = ZS.reduce((a, z) => a + ((P[z] && Array.isArray(P[z].rows)) ? P[z].rows.length : 0), 0);
  const depart = sum('depart'), joined = sum('joined'), home = sum('home'), dead = sum('roadDead');
  const okOut = sum('ok'), inRecv = sum('in');
  return { depart, joined, home, dead, onRoad, ok: depart === joined + home + dead + onRoad, sentOk: okOut, inRecv, handOk: okOut === inRecv,
    departLog: dep.size, departLogMuted: Math.max(0, depart - dep.size) };
})();
const out = {
  tag: TAG, env: meta && meta.env, days: meta && meta.DAYS, stagePlan: meta && meta.stagePlan || null,
  crossed: mig && mig.counts ? mig.counts.crossed : [...dep.keys()].length, depart: dep.size, arrive: rows.length,
  byDir: mig && mig.counts ? mig.counts.byDir : null,
  conserve: mig ? { red: mig.red, balance: mig.balance, bad: Object.fromEntries(Object.entries(mig.bad || {}).map(([k, v]) => [k, v.n])) } : null,
  perfConserve,
  via: (() => { const o = {}; for (const D of dep.values()) o[D.via] = (o[D.via] || 0) + 1; return o; })(),
  perHead: { n: ph.length, p50: q(ph, 0.5) == null ? null : +q(ph, 0.5).toFixed(1), min: q(ph, 0) == null ? null : +q(ph, 0).toFixed(1) },
  road: { dead: dead.length, deadBy: dead.reduce((o, d) => (o[d.ph] = (o[d.ph] || 0) + 1, o), {}), days: ZS.reduce((a, z) => a + ((perfT[z] && perfT[z].t1352 && perfT[z].t1352.roadDays) || 0), 0),
    hungry: ZS.reduce((a, z) => a + ((perfT[z] && perfT[z].t1352 && perfT[z].t1352.roadHungry) || 0), 0) },
  herdMax: herd.length ? { vil: herd[0].vil, n: herd[0].n, days: herd[0].days, sameLineMax: herd[0].sameLineMax } : null,
  herd: herd.slice(0, 12), ageBands,
  ageAll: (() => { const a = [...dep.values()].map((D) => D.age).filter((x) => x != null); return { n: a.length, p50: q(a, 0.5), p90: q(a, 0.9), max: a.length ? Math.max(...a) : null }; })(),
  ageLogCheck: (() => { let n = 0, eq = 0; for (const D of dep.values()) if (D.ageLog != null && D.age != null) { n++; if (D.ageLog === D.age) eq++; } return { n, eq }; })(),
  staged, perf: perfT,
};
console.log(JSON.stringify(out, null, 1));
if (jout) fs.writeFileSync(jout, JSON.stringify(out, null, 1));
