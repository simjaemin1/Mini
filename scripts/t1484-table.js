#!/usr/bin/env node
// === scripts/t1484-table.js — T1484 표 만들기(판 자료만 읽는다 · 제품 무변 · @regress 없음) ===
// 읽는 것: $R/runs/<팔>-<시드>.done · <팔>-<시드>.json.gz(판 JSON) · obs-<팔>-<시드>.json.gz(scripts/t1484-observe.js) — 팔 off · on · noobs-off(관찰기 없는 끔 한 판)
// 내는 것: $R/표.md · $R/요약.json · $R/빈마을.csv · $R/굶어죽음_마을별.csv · $R/굶어죽음_달별.csv (보고의 모든 수는 여기서 복사한다 · 손 셈 0)
// 쓰는 법: R=<판 자료 폴더> node scripts/t1484-table.js
// 말뜻: 빈 마을 = 날 400(마지막 장부)에 사람 0 · 비는 날 = 그 마지막 0 구간의 첫날 · 비기 시작한 날 = 빈 날 앞 최고 인구의 절반 아래로 마지막으로 내려선 날 ·
//   앞 60날 = 빈 날 앞 60날 · 곳간 = `totalFoodEquivalent`(1.0 = 사람 하루치 → "날치") · 이웃 = econ 거리(`villageDist`) 가까운 5곳 ·
//   들어온/나간 식량 = 교역 장부 줄의 식량류 수량(약탈 전 값) · 달 = 30날 토막 · 철 = 달력 정본(server/calendar).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = process.env.R || path.join(__dirname, '..', '계측', 'T1484_2026-11-26');
const SEEDS = [1020, 7, 42, 3, 11, 99];
const ARMS = ['off', 'on'];
const rd = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch (e) { return null; } };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
const f = (v, n) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(n == null ? 0 : n));
const ff = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const typeOf = (name) => { const m = /^(농촌|어촌|광산|임업)/.exec(name); return m ? m[1] : '기타'; };
const TYPES = ['농촌', '어촌', '광산', '임업', '기타'];

// ---- 읽기 ----
const run = {};
for (const arm of [...ARMS, 'noobs-off']) for (const s of (arm === 'noobs-off' ? [1020] : SEEDS)) {
  const tag = `${arm}-${s}`; let d = null;
  try { const [, rc, sec] = fs.readFileSync(path.join(R, 'runs', `${tag}.done`), 'utf8').trim().split(/\s+/); d = { rc: +rc, sec: +sec }; } catch (e) {}
  const mk = rd(path.join(R, 'runs', `${tag}.json.gz`)), ob = rd(path.join(R, 'runs', `obs-${tag}.json.gz`));
  const fp = mk && mk.byseed && mk.byseed[s] ? mk.byseed[s] : null;
  run[tag] = { tag, arm, seed: s, d, fp, ob, ok: !!(d && d.rc === 0 && ob && ob.day && ob.day.length >= 399 && !ob.err) };
}
const have = (arm, s) => run[`${arm}-${s}`] && run[`${arm}-${s}`].ok;

// ---- 판 하나의 셈 ----
function stats(r) {
  const o = r.ob, D = o.day.length, N = o.names.length, L = D - 1;
  const popT = o.n.map((a) => sum(a));
  const fdEnd = o.fd[L], ddEnd = o.dd[L], emEnd = o.em[L];
  const empty = []; for (let i = 0; i < N; i++) if (o.n[L][i] === 0) empty.push(i);
  const everEmpty = []; for (let i = 0; i < N; i++) { let z = false; for (let d = 1; d < D; d++) if (o.n[d][i] === 0) { z = true; break; } if (z) everEmpty.push(i); }
  const fdTot = sum(fdEnd), meanPop = mean(popT);
  // 몰림: 굶어 죽음이 전체의 몫 이상 되는 데 모자란 마을 수
  const sorted = fdEnd.slice().sort((a, b) => b - a);
  const cover = (share) => { let c = 0, k = 0; const t = sum(sorted); if (t <= 0) return 0; while (k < sorted.length && c < t * share - 1e-9) { c += sorted[k++]; } return k; };
  const top = (k) => (fdTot > 0 ? sum(sorted.slice(0, k)) / fdTot : null);
  return { D, N, L, popEnd: popT[L], meanPop, vills: N, empty, everEmpty, fdTot, ddTot: sum(ddEnd), emTot: sum(emEnd), fdEnd, ddEnd, emEnd,
    nVillFd: fdEnd.filter((x) => x > 0).length, c50: cover(0.5), c80: cover(0.8), top1: top(1), top3: top(3), top5: top(5), per1000: meanPop > 0 ? 1000 * fdTot / meanPop : null,
    typeCount: TYPES.map((t) => o.names.filter((n) => typeOf(n) === t).length) };
}
const S = {};
for (const [tag, r] of Object.entries(run)) if (r.ok) S[tag] = stats(r);

// ---- ① 판 표 ----
const L = [];
const rowsRun = [];
for (const s of SEEDS) for (const arm of ARMS) {
  const t = `${arm}-${s}`, x = S[t], o = S[`off-${s}`];
  if (!x) { rowsRun.push({ arm, seed: s, missing: true }); continue; }
  rowsRun.push({ arm, seed: s, pop: x.popEnd, ratio: o ? x.popEnd / o.popEnd : null, empty: x.empty.length, everEmpty: x.everEmpty.length, fd: x.fdTot, dead: x.ddTot, em: x.emTot, per1000: x.per1000, meanPop: x.meanPop,
    sec: run[t].d && run[t].d.sec, lastDay: run[t].ob.day[x.L] });
}
const okSeeds = SEEDS.filter((s) => have('off', s) && have('on', s));
L.push(`# T1484 끔 ↔ 켬(T1419_FOOD_NEED=seen) — 400날 · 시드 ${SEEDS.join(' · ')} · 끝까지 돈 판 ${Object.values(run).filter((r) => r.ok).length}/${Object.keys(run).length}`);
L.push('');
L.push('판 자: `scripts/server-baseline-check.js --make … --days 400 --seeds <시드> --par 1 --vclock` · 곁 관찰기 `scripts/t1484-observe.js`(읽기만). 칸은 마지막 장부(날 400) 값 · 굶어 죽음 · 죽음 · 떠남은 400날 누계(`_fdDeadTot` · `_deadTot` · `_emigTot`).');
L.push('');
L.push('## ① 판마다');
L.push('');
L.push('| 시드 | 팔 | 인구(날 400) | 끔비 | 빈 마을(날 400) | 한 번이라도 빈 마을 | 굶어 죽음 | 굶어 죽음 1,000명당(평균 인구 기준) | 평균 인구 | 죽음 합 | 떠남 합 | 걸린 초 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rowsRun) L.push(r.missing ? `| ${r.seed} | ${r.arm} | 판 없음 | | | | | | | | | |` : `| ${r.seed} | ${r.arm} | ${ff(r.pop)} | ${f(r.ratio, 3)} | ${r.empty} | ${r.everEmpty} | ${ff(r.fd)} | ${f(r.per1000, 1)} | ${ff(r.meanPop)} | ${ff(r.dead)} | ${ff(r.em)} | ${r.sec == null ? '—' : r.sec} |`);
L.push('');

// ---- ④ 흔들림 폭 ----
const arr = (arm, k) => SEEDS.filter((s) => S[`${arm}-${s}`]).map((s) => ({ s, v: k(S[`${arm}-${s}`]) }));
const spreadDefs = [['빈 마을(날 400)', (x) => x.empty.length], ['한 번이라도 빈 마을', (x) => x.everEmpty.length], ['굶어 죽음 합', (x) => x.fdTot], ['굶어 죽음 1,000명당', (x) => x.per1000], ['인구(날 400)', (x) => x.popEnd], ['평균 인구', (x) => x.meanPop]];
const spread = {};
L.push('## ② 흔들림 폭 — 끔 여섯 시드 ↔ 켬 여섯 시드');
L.push('');
L.push('| 칸 | 끔 최소 | 끔 최대 | 끔 평균 | 끔 표준편차 | 켬 최소 | 켬 최대 | 켬 평균 | 켬 중 끔 폭 밖 | 켬 시드별 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const [nm, k] of spreadDefs) {
  const a = arr('off', k).map((x) => x.v), b = arr('on', k);
  if (!a.length || !b.length) continue;
  const lo = Math.min(...a), hi = Math.max(...a), out = b.filter((x) => x.v < lo - 1e-9 || x.v > hi + 1e-9);
  spread[nm] = { offMin: lo, offMax: hi, offMean: mean(a), offSd: sd(a), onMin: Math.min(...b.map((x) => x.v)), onMax: Math.max(...b.map((x) => x.v)), onMean: mean(b.map((x) => x.v)), outside: out.length, n: b.length, offVals: a, onVals: b.map((x) => x.v) };
  const d = nm.includes('1,000') ? 1 : 0;
  L.push(`| ${nm} | ${f(lo, d)} | ${f(hi, d)} | ${f(mean(a), d)} | ${f(sd(a), d)} | ${f(spread[nm].onMin, d)} | ${f(spread[nm].onMax, d)} | ${f(spread[nm].onMean, d)} | ${out.length}/${b.length} | ${b.map((x) => f(x.v, d)).join(' · ')} |`);
}
L.push('');
L.push(`끔 시드별: ${spreadDefs.map(([nm]) => spread[nm] ? `${nm} ${spread[nm].offVals.map((v) => f(v, nm.includes('1,000') ? 1 : 0)).join('/')}` : '').filter(Boolean).join(' · ')}`);
L.push('');

// ---- ② 빈 마을 한 줄씩 ----
const WIN = 60, NEAR = 5;
const emptyRows = [];
function emptyRow(arm, s, i) {
  const r = run[`${arm}-${s}`], o = r.ob, x = S[`${arm}-${s}`], Lx = x.L, name = o.names[i];
  let e = Lx; while (e > 0 && o.n[e - 1][i] === 0) e--;           // 마지막 0 구간의 첫 장부 칸
  const P = Math.max(...o.n.slice(0, e).map((a) => a[i])), half = Math.ceil(P / 2);
  let sIdx = 0; for (let d = e - 1; d >= 0; d--) if (o.n[d][i] >= half) { sIdx = d + 1; break; }
  const w0 = Math.max(0, e - WIN), w1 = e - 1;
  let fin = 0, fout = 0, noTrade = 0, winter = 0, isoD = 0, nDays = 0; const days = [];
  for (let d = w0; d <= w1; d++) { fin += o.fin[d][i]; fout += o.fout[d][i]; nDays++; if (!(o.fin[d][i] + o.fout[d][i] > 0)) noTrade++; if (o.sea[d] === 'winter') winter++; if (o.iso[d][i]) isoD++; if (o.n[d][i] > 0) days.push(o.fe[d][i] / o.n[d][i]); }
  const nb = o.stat[i].near.slice(0, NEAR).map((p) => p[0]);
  const nbAt = (d) => nb.filter((j) => o.n[d][j] > 0).map((j) => o.fe[d][j] / o.n[d][j]);
  const nbMed = []; let nbSurplusDays = 0, nbAliveSum = 0;
  for (let d = w0; d <= w1; d++) { const v = nbAt(d); if (v.length) { nbMed.push(med(v)); nbAliveSum += v.length; if (v.filter((q) => q >= 30).length >= 1) nbSurplusDays++; } }
  const nbEnd = nbAt(w1), ownEnd = o.n[w1][i] > 0 ? o.fe[w1][i] / o.n[w1][i] : null, ownStart = o.n[w0][i] > 0 ? o.fe[w0][i] / o.n[w0][i] : null;
  const fd = o.fd[w1][i] - (w0 > 0 ? o.fd[w0 - 1][i] : 0), em = o.em[w1][i] - (w0 > 0 ? o.em[w0 - 1][i] : 0), dd = o.dd[w1][i] - (w0 > 0 ? o.dd[w0 - 1][i] : 0);
  const pop0 = w0 > 0 ? o.n[w0 - 1][i] : o.n[w0][i], popE = o.n[w1][i];
  // 비기 시작 → 빈 날 전체(60날보다 길 수 있다)
  const fdAll = o.fd[w1][i] - (sIdx > 0 ? o.fd[sIdx - 1][i] : 0), emAll = o.em[w1][i] - (sIdx > 0 ? o.em[sIdx - 1][i] : 0), ddAll = o.dd[w1][i] - (sIdx > 0 ? o.dd[sIdx - 1][i] : 0);
  const popS = sIdx > 0 ? o.n[sIdx - 1][i] : o.n[sIdx][i];
  const mn = mean(o.n.slice(w0, w1 + 1).map((a) => a[i]));
  return { arm, seed: s, name, type: typeOf(name), water: o.stat[i].water, coastal: o.stat[i].coastal, peak: P, startDay: o.day[sIdx], emptyDay: o.day[e], winLen: nDays,
    fppStart: ownStart, fppEnd: ownEnd, fppMean: mean(days), fppMin: days.length ? Math.min(...days) : null,
    fin, fout, finPP: mn > 0 ? fin / mn : null, foutPP: mn > 0 ? fout / mn : null, fd, em, dd, otherDead: dd - fd, pop0, popE, fdAll, emAll, otherAll: ddAll - fdAll, popS,
    nbMed: mean(nbMed), nbMedEnd: med(nbEnd), nbEndN: nbEnd.length, nbEndOver30: nbEnd.filter((q) => q >= 30).length, nbSurplusDaysPct: nDays ? 100 * nbSurplusDays / nDays : null,
    noTradePct: nDays ? 100 * noTrade / nDays : null, winterPct: nDays ? 100 * winter / nDays : null, isoDays: isoD,
    gap: o.day[e] - o.day[sIdx] };
}
for (const arm of ARMS) for (const s of SEEDS) if (S[`${arm}-${s}`]) for (const i of S[`${arm}-${s}`].empty) emptyRows.push(emptyRow(arm, s, i));
const onE = emptyRows.filter((r) => r.arm === 'on'), offE = emptyRows.filter((r) => r.arm === 'off');
L.push('## ③ 빈 마을 한 줄씩(날 400에 사람 0)');
L.push('');
L.push(`앞 60날 = 빈 날 앞 ${WIN}날 · 곳간 = 마을 곳간 식량 환산 ÷ 사람(날치) · 이웃 = 가까운 ${NEAR}곳(econ 거리) 가운데 사람이 있는 곳 · 이웃 곳간 = 그 곳들 날치의 중앙값을 60날 평균 · 이웃 ≥ 30날치 = 60날 끝에 이웃 중 30날치 이상 곳간을 쥔 이웃 수/이웃 수 · 들어온/나간 = 교역 장부 식량류 수량(약탈 전) · 떠남 = \`_emigTot\` 증가 · 그 밖 죽음 = 죽음 − 굶어 죽음.`);
L.push('');
function emptyTable(rows) {
  L.push('| 시드 | 마을 | 꼴 | 물 | 최고 인구 | 비기 시작 | 빈 날 | 곳간 앞60날 처음 → 끝(날치) | 곳간 60날 평균 · 최저 | 들어온 식량 | 나간 식량 | 굶어 죽음 | 떠남 | 그 밖 죽음 | 사람 60날 앞 → 빈 날 앞 | 이웃 곳간 중앙값(날치) | 이웃 ≥ 30날치(끝) | 교역 없는 날 % | 겨울 날 % |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.seed} | ${r.name} | ${r.type} | ${f(r.water, 2)} | ${r.peak} | ${r.startDay} | ${r.emptyDay} | ${f(r.fppStart, 1)} → ${f(r.fppEnd, 1)} | ${f(r.fppMean, 1)} · ${f(r.fppMin, 1)} | ${f(r.fin, 0)} | ${f(r.fout, 0)} | ${r.fd} | ${r.em} | ${r.otherDead} | ${r.pop0} → ${r.popE} | ${f(r.nbMed, 1)} | ${r.nbEndOver30}/${r.nbEndN} | ${f(r.noTradePct, 0)} | ${f(r.winterPct, 0)} |`);
}
L.push(`### 켬 — 빈 마을 ${onE.length}곳`); L.push(''); emptyTable(onE); L.push('');
L.push(`### 끔 — 빈 마을 ${offE.length}곳`); L.push(''); if (offE.length) emptyTable(offE); else L.push('없음'); L.push('');
L.push('### 비기 시작한 날부터 빈 날까지 전체(60날보다 길 수 있다) — 사람이 어디로 갔나');
L.push('');
L.push('| 시드 | 마을 | 비기 시작 | 빈 날 | 걸린 날 | 시작 때 사람 | 굶어 죽음 | 떠남 | 그 밖 죽음 | 모자란 몫(= 사람 − 위 셋 · 출생 · 들어온 이주자 몫 — 계측 없음) |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of onE) L.push(`| ${r.seed} | ${r.name} | ${r.startDay} | ${r.emptyDay} | ${r.gap} | ${r.popS} | ${r.fdAll} | ${r.emAll} | ${r.otherAll} | ${r.popS - r.fdAll - r.emAll - r.otherAll} |`);
L.push('');

// ---- 빈 마을 묶음 ----
const byType = {}; for (const t of TYPES) byType[t] = { empty: 0, total: 0 };
for (const s of SEEDS) { const x = S[`on-${s}`]; if (!x) continue; x.typeCount.forEach((c, k) => { byType[TYPES[k]].total += c; }); }
for (const r of onE) byType[r.type].empty++;
const offByType = {}; for (const t of TYPES) offByType[t] = 0; for (const r of offE) offByType[r.type]++;
const nbBig = onE.filter((r) => r.nbMed != null && r.nbMed >= 30).length;
const sumKey = (rows, k) => sum(rows.map((r) => r[k] || 0));
L.push('## ④ 빈 마을 묶음(켬 · 여섯 시드)');
L.push('');
L.push('| 꼴 | 켬 빈 마을 | 켬 판 여섯의 이 꼴 마을 합 | 비는 비율 % | 끔 빈 마을 |');
L.push('|---|---|---|---|---|');
for (const t of TYPES) if (byType[t].total) L.push(`| ${t} | ${byType[t].empty} | ${byType[t].total} | ${f(100 * byType[t].empty / byType[t].total, 1)} | ${offByType[t]} |`);
L.push('');
const wAll = []; const o0 = run[`on-${SEEDS.find((s) => have('on', s))}`]; if (o0) for (const st of o0.ob.stat) wAll.push(st.water);
const wSorted = wAll.slice().sort((a, b) => a - b), wLo = wSorted[Math.floor(wSorted.length / 3)], wHi = wSorted[Math.floor(2 * wSorted.length / 3)];
const wBin = (w) => (w <= wLo ? '물 먼(아래 3분의 1)' : w >= wHi ? '물 가까운(위 3분의 1)' : '가운데');
L.push('요약(켬 빈 마을 전체):');
L.push('');
L.push('| 칸 | 값 |');
L.push('|---|---|');
const Q = {
  nOn: onE.length, nOff: offE.length,
  fppEndMed: med(onE.map((r) => r.fppEnd).filter((v) => v != null)), fppMeanMed: med(onE.map((r) => r.fppMean).filter((v) => v != null)), fppMinMed: med(onE.map((r) => r.fppMin).filter((v) => v != null)),
  fppEndMax: onE.length ? Math.max(...onE.map((r) => r.fppEnd == null ? 0 : r.fppEnd)) : null,
  nbMedMed: med(onE.map((r) => r.nbMed).filter((v) => v != null)), nbBig, nbEndOver30Rows: onE.filter((r) => r.nbEndOver30 > 0).length,
  fdWin: sumKey(onE, 'fd'), emWin: sumKey(onE, 'em'), otherWin: sumKey(onE, 'otherDead'), popWin0: sumKey(onE, 'pop0'),
  fdAll: sumKey(onE, 'fdAll'), emAll: sumKey(onE, 'emAll'), otherAll: sumKey(onE, 'otherAll'), popS: sumKey(onE, 'popS'),
  finMed: med(onE.map((r) => r.finPP).filter((v) => v != null)), foutMed: med(onE.map((r) => r.foutPP).filter((v) => v != null)),
  gapMed: med(onE.map((r) => r.gap)), startMed: med(onE.map((r) => r.startDay)), emptyDayMed: med(onE.map((r) => r.emptyDay)), emptyDayMin: onE.length ? Math.min(...onE.map((r) => r.emptyDay)) : null, emptyDayMax: onE.length ? Math.max(...onE.map((r) => r.emptyDay)) : null,
  noTradeMed: med(onE.map((r) => r.noTradePct)), winterMed: med(onE.map((r) => r.winterPct)), isoRows: onE.filter((r) => r.isoDays > 0).length,
  waterBins: {}, peakMed: med(onE.map((r) => r.peak)),
};
for (const r of onE) { const b = wBin(r.water); Q.waterBins[b] = (Q.waterBins[b] || 0) + 1; }
const popPeakAll = []; for (const s of SEEDS) { const x = S[`on-${s}`]; if (!x) continue; const o = run[`on-${s}`].ob; for (let i = 0; i < x.N; i++) popPeakAll.push(Math.max(...o.n.map((a) => a[i]))); }
Q.peakAllMed = med(popPeakAll);
const rowsQ = [
  ['켬 빈 마을 수(여섯 시드 합)', Q.nOn], ['끔 빈 마을 수(여섯 시드 합)', Q.nOff],
  ['앞 60날 끝 곳간 날치 — 중앙값 · 최대', `${f(Q.fppEndMed, 1)} · ${f(Q.fppEndMax, 1)}`], ['앞 60날 평균 곳간 날치 — 중앙값', f(Q.fppMeanMed, 1)], ['앞 60날 최저 곳간 날치 — 중앙값', f(Q.fppMinMed, 1)],
  ['이웃 곳간 중앙값(날치) — 마을 중앙값', f(Q.nbMedMed, 1)], ['이웃 곳간 중앙값 ≥ 30날치인 빈 마을', `${Q.nbBig}/${Q.nOn}`], ['60날 끝에 30날치 넘는 이웃이 하나라도 있던 빈 마을', `${Q.nbEndOver30Rows}/${Q.nOn}`],
  ['앞 60날 사람 합 → 굶어 죽음 · 떠남 · 그 밖 죽음', `${Q.popWin0} → ${Q.fdWin} · ${Q.emWin} · ${Q.otherWin}`],
  ['비기 시작 → 빈 날 전체: 시작 사람 합 → 굶어 죽음 · 떠남 · 그 밖 죽음', `${Q.popS} → ${Q.fdAll} · ${Q.emAll} · ${Q.otherAll}`],
  ['들어온 식량 — 사람당 앞 60날(중앙값) · 나간 식량', `${f(Q.finMed, 1)} · ${f(Q.foutMed, 1)}`],
  ['비기 시작한 날 중앙값 · 빈 날 중앙값(최소 ~ 최대)', `${f(Q.startMed, 0)} · ${f(Q.emptyDayMed, 0)}(${f(Q.emptyDayMin, 0)} ~ ${f(Q.emptyDayMax, 0)})`],
  ['비기 시작 → 빈 날 걸린 날 중앙값', f(Q.gapMed, 0)], ['앞 60날 교역 없는 날 % 중앙값 · 겨울 날 % 중앙값', `${f(Q.noTradeMed, 0)} · ${f(Q.winterMed, 0)}`], ['앞 60날에 봉쇄가 걸렸던 빈 마을', `${Q.isoRows}/${Q.nOn}`],
  ['최고 인구 중앙값(빈 마을) · 전체 마을 최고 인구 중앙값', `${f(Q.peakMed, 0)} · ${f(Q.peakAllMed, 0)}`],
  ['물(land.water) 묶음별 빈 마을(물 먼 ≤ ' + f(wLo, 2) + ' · 가까운 ≥ ' + f(wHi, 2) + ')', Object.entries(Q.waterBins).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'],
];
for (const [k, v] of rowsQ) L.push(`| ${k} | ${v} |`);
L.push('');

// ---- ⑤ 굶어 죽음 주인 ----
L.push('## ⑤ 굶어 죽음의 주인');
L.push('');
L.push('몰림 = 굶어 죽음 합의 절반(80 %)을 채우는 데 드는 마을 수(많이 죽은 마을부터) · 위 1 · 3 · 5 = 가장 많이 죽은 마을 하나 · 셋 · 다섯의 몫 · 죽은 마을 = 굶어 죽음 ≥ 1인 마을.');
L.push('');
L.push('| 시드 | 팔 | 굶어 죽음 | 죽은 마을 수 | 절반 채우는 마을 수 | 80 % 채우는 마을 수 | 위 1 % | 위 3 % | 위 5 % |');
L.push('|---|---|---|---|---|---|---|---|---|');
for (const s of SEEDS) for (const arm of ARMS) { const x = S[`${arm}-${s}`]; if (x) L.push(`| ${s} | ${arm} | ${ff(x.fdTot)} | ${x.nVillFd} | ${x.c50} | ${x.c80} | ${f(100 * x.top1, 0)} | ${f(100 * x.top3, 0)} | ${f(100 * x.top5, 0)} |`); }
L.push('');
// 켬 − 끔 같은 시드 같은 마을(같은 시드는 같은 땅이라 이름이 같은 자리다)
const excess = {}; const excRows = [];
for (const s of okSeeds) {
  const a = S[`off-${s}`], b = S[`on-${s}`], names = run[`on-${s}`].ob.names, offNames = run[`off-${s}`].ob.names;
  const sameNames = names.every((n, i) => n === offNames[i]);
  const d = names.map((n, i) => b.fdEnd[i] - a.fdEnd[i]);
  const pos = d.map((v) => Math.max(0, v)), tp = sum(pos);
  const idxs = d.map((v, i) => i).sort((p, q) => d[q] - d[p]);
  let c = 0, k50 = 0, k80 = 0; for (const i of idxs) { if (c >= 0.5 * tp - 1e-9 && k50 === 0) k50 = idxs.indexOf(i); c += pos[i]; }
  const need = (sh) => { let cc = 0, k = 0; if (tp <= 0) return 0; for (const i of idxs) { if (cc >= sh * tp - 1e-9) break; cc += pos[i]; k++; } return k; };
  excess[s] = { sameNames, total: b.fdTot - a.fdTot, posTotal: tp, k50: need(0.5), k80: need(0.8), nPos: pos.filter((v) => v > 0).length, top: idxs.slice(0, 5).map((i) => [names[i], d[i], b.fdEnd[i], a.fdEnd[i], typeOf(names[i])]) };
  for (const i of idxs) excRows.push({ seed: s, name: names[i], type: typeOf(names[i]), off: a.fdEnd[i], on: b.fdEnd[i], diff: d[i], peakOn: Math.max(...run[`on-${s}`].ob.n.map((r) => r[i])), peakOff: Math.max(...run[`off-${s}`].ob.n.map((r) => r[i])) });
}
L.push('### 켬 − 끔 같은 시드 같은 마을 — 늘어난 굶어 죽음은 몇 마을에 몰리나');
L.push('');
L.push('| 시드 | 이름 같은 땅 | 늘어난 굶어 죽음(켬 − 끔) | 늘어난 마을(+)만 합 | 늘어난 마을 수 | 절반 채우는 마을 수 | 80 % 채우는 마을 수 | 늘어난 위 다섯(이름 · 켬 − 끔 · 꼴) |');
L.push('|---|---|---|---|---|---|---|---|');
for (const s of okSeeds) { const e = excess[s]; L.push(`| ${s} | ${e.sameNames ? '예' : '아니오'} | ${ff(e.total)} | ${ff(e.posTotal)} | ${e.nPos} | ${e.k50} | ${e.k80} | ${e.top.map((t) => `${t[0]} ${t[1] >= 0 ? '+' : ''}${t[1]} (${t[3]} → ${t[2]})`).join(' · ')} |`); }
L.push('');
// 꼴별 굶어 죽음
L.push('### 꼴별 굶어 죽음(여섯 시드 합 · 평균 사람 1,000명당)');
L.push('');
L.push('| 꼴 | 마을 수(판 하나) | 끔 굶어 죽음 | 켬 굶어 죽음 | 켬 ÷ 끔 | 끔 사람 평균 합 | 켬 사람 평균 합 | 끔 1,000명당 | 켬 1,000명당 |');
L.push('|---|---|---|---|---|---|---|---|---|');
const typeStat = {};
for (const t of TYPES) {
  const acc = { off: { fd: 0, pop: 0 }, on: { fd: 0, pop: 0 }, n: 0 };
  for (const s of okSeeds) for (const arm of ARMS) {
    const o = run[`${arm}-${s}`].ob, x = S[`${arm}-${s}`];
    const idx = o.names.map((n, i) => (typeOf(n) === t ? i : -1)).filter((i) => i >= 0);
    if (arm === 'on') acc.n += idx.length;
    acc[arm].fd += sum(idx.map((i) => x.fdEnd[i]));
    acc[arm].pop += mean(o.n.map((a) => sum(idx.map((i) => a[i]))));
  }
  if (!acc.n) continue;
  typeStat[t] = { n: acc.n / okSeeds.length, offFd: acc.off.fd, onFd: acc.on.fd, offPop: acc.off.pop, onPop: acc.on.pop };
  L.push(`| ${t} | ${f(acc.n / okSeeds.length, 1)} | ${ff(acc.off.fd)} | ${ff(acc.on.fd)} | ${acc.off.fd > 0 ? f(acc.on.fd / acc.off.fd, 2) : '—'} | ${ff(acc.off.pop)} | ${ff(acc.on.pop)} | ${f(acc.off.pop > 0 ? 1000 * acc.off.fd / acc.off.pop : null, 1)} | ${f(acc.on.pop > 0 ? 1000 * acc.on.fd / acc.on.pop : null, 1)} |`);
}
L.push('');
// 달별
const MB = 30, nB = Math.ceil(400 / MB);
const monthly = [];
for (let b = 0; b < nB; b++) {
  const row = { b, from: b * MB + 1, to: Math.min(400, (b + 1) * MB) };
  for (const arm of ARMS) {
    let fd = 0, popm = 0, em = 0, ns = 0;
    for (const s of okSeeds) {
      const o = run[`${arm}-${s}`].ob, d0 = b * MB, d1 = Math.min(o.day.length - 1, (b + 1) * MB - 1);
      if (d0 > d1) continue; ns++;
      const pre = d0 > 0 ? o.fd[d0 - 1] : o.fd[0].map(() => 0), preE = d0 > 0 ? o.em[d0 - 1] : o.em[0].map(() => 0);
      fd += sum(o.fd[d1]) - sum(pre); em += sum(o.em[d1]) - sum(preE);
      popm += mean(o.n.slice(d0, d1 + 1).map((a) => sum(a)));
    }
    row[arm] = { fd, em, pop: popm, per1000: popm > 0 ? 1000 * fd / popm : null, ns };
  }
  monthly.push(row);
}
L.push('### 달별(30날 토막 · 시드 합) — 굶어 죽음 · 사람 1,000명당(토막 평균 인구 기준)');
L.push('');
L.push('| 토막 | 날 | 끔 굶어 죽음 | 켬 굶어 죽음 | 켬 − 끔 | 끔 1,000명당 | 켬 1,000명당 | 끔 사람(평균 합) | 켬 사람(평균 합) | 켬 떠남 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const m of monthly) L.push(`| ${m.b + 1} | ${m.from}~${m.to} | ${ff(m.off.fd)} | ${ff(m.on.fd)} | ${ff(m.on.fd - m.off.fd)} | ${f(m.off.per1000, 1)} | ${f(m.on.per1000, 1)} | ${ff(m.off.pop)} | ${ff(m.on.pop)} | ${ff(m.on.em)} |`);
L.push('');
// 철별
const seaStat = {};
for (const arm of ARMS) for (const s of okSeeds) {
  const o = run[`${arm}-${s}`].ob;
  for (let d = 0; d < o.day.length; d++) {
    const se = o.sea[d] || '—'; const A = (seaStat[arm] = seaStat[arm] || {}); const B = (A[se] = A[se] || { days: 0, fd: 0, popDays: 0 });
    B.days++; B.popDays += sum(o.n[d]); B.fd += sum(o.fd[d]) - (d > 0 ? sum(o.fd[d - 1]) : 0);
  }
}
L.push('### 철별(달력 정본 · 시드 합) — 굶어 죽음 · 사람 1,000명-날당(= 굶어 죽음 ÷ 사람-날 × 1,000 × 100날)');
L.push('');
L.push('| 철 | 끔 날(시드 합) | 끔 굶어 죽음 | 켬 굶어 죽음 | 끔 100날 · 1,000명당 | 켬 100날 · 1,000명당 |');
L.push('|---|---|---|---|---|---|');
for (const se of ['spring', 'summer', 'autumn', 'winter']) { const a = (seaStat.off || {})[se], b = (seaStat.on || {})[se]; if (!a || !b) continue; L.push(`| ${se} | ${a.days} | ${ff(a.fd)} | ${ff(b.fd)} | ${f(100000 * a.fd / a.popDays, 1)} | ${f(100000 * b.fd / b.popDays, 1)} |`); }
L.push('');

// ---- 코너 케이스 ----
L.push('## ⑥ 코너 케이스');
L.push('');
// 물 묶음 × 꼴: 굶어 죽음 · 빈 마을
const cornerW = {};
for (const arm of ARMS) for (const s of okSeeds) {
  const o = run[`${arm}-${s}`].ob, x = S[`${arm}-${s}`];
  for (let i = 0; i < x.N; i++) { const b = wBin(o.stat[i].water); const A = (cornerW[arm] = cornerW[arm] || {}); const B = (A[b] = A[b] || { n: 0, fd: 0, pop: 0, empty: 0 }); B.n++; B.fd += x.fdEnd[i]; B.pop += mean(o.n.map((a) => a[i])); if (o.n[x.L][i] === 0) B.empty++; }
}
L.push('물이 먼 마을(`land.water` 3분의 1 묶음 · 여섯 시드 합):');
L.push('');
L.push('| 묶음 | 마을-판 수 | 끔 굶어 죽음 | 켬 굶어 죽음 | 끔 1,000명당 | 켬 1,000명당 | 끔 빈 마을 | 켬 빈 마을 |');
L.push('|---|---|---|---|---|---|---|---|');
for (const b of ['물 먼(아래 3분의 1)', '가운데', '물 가까운(위 3분의 1)']) { const a = (cornerW.off || {})[b], c = (cornerW.on || {})[b]; if (!a || !c) continue; L.push(`| ${b} | ${a.n} | ${ff(a.fd)} | ${ff(c.fd)} | ${f(1000 * a.fd / a.pop, 1)} | ${f(1000 * c.fd / c.pop, 1)} | ${a.empty} | ${c.empty} |`); }
L.push('');
// 수입 마을(광산 · 임업): 사람당 식량 들어옴 − 나감
const imp = {};
for (const arm of ARMS) for (const s of okSeeds) {
  const o = run[`${arm}-${s}`].ob, x = S[`${arm}-${s}`];
  for (let i = 0; i < x.N; i++) { const t = typeOf(o.names[i]); const A = (imp[arm] = imp[arm] || {}); const B = (A[t] = A[t] || { fin: 0, fout: 0, popDays: 0, n: 0 }); B.n++; B.fin += sum(o.fin.map((a) => a[i])); B.fout += sum(o.fout.map((a) => a[i])); B.popDays += sum(o.n.map((a) => a[i])); }
}
L.push('먹을 것을 들여오는 마을(꼴별 식량 교역 · 여섯 시드 합 · 사람-날당 = 교역 수량 ÷ 사람-날):');
L.push('');
L.push('| 꼴 | 끔 들어옴 사람-날당 | 끔 나감 사람-날당 | 켬 들어옴 사람-날당 | 켬 나감 사람-날당 | 끔 순입 사람-날당 | 켬 순입 사람-날당 |');
L.push('|---|---|---|---|---|---|---|');
for (const t of TYPES) { const a = (imp.off || {})[t], b = (imp.on || {})[t]; if (!a || !b) continue; const g = (z) => z.fin / z.popDays, h = (z) => z.fout / z.popDays; L.push(`| ${t} | ${f(g(a), 3)} | ${f(h(a), 3)} | ${f(g(b), 3)} | ${f(h(b), 3)} | ${f(g(a) - h(a), 3)} | ${f(g(b) - h(b), 3)} |`); }
L.push('');
// 캐러밴 끊긴 날
const car = {};
for (const arm of ARMS) for (const s of okSeeds) {
  const o = run[`${arm}-${s}`].ob; const A = (car[arm] = car[arm] || { days: 0, zeroCar: 0, zeroRow: 0, minCar: 1e9, rowsSum: 0 });
  for (let d = 5; d < o.day.length; d++) { A.days++; if (o.car[d] === 0) A.zeroCar++; if (o.rows[d] === 0) A.zeroRow++; A.minCar = Math.min(A.minCar, o.car[d]); A.rowsSum += o.rows[d]; }
}
L.push('캐러밴이 끊긴 날(날 6 ~ 400 · 시드 합):');
L.push('');
L.push('| 팔 | 날 수 | 길 위 캐러밴 0인 날 | 새 교역 장부 줄 0인 날 | 길 위 캐러밴 최소 | 하루 새 장부 줄 평균 |');
L.push('|---|---|---|---|---|---|');
for (const arm of ARMS) { const A = car[arm]; if (A) L.push(`| ${arm} | ${A.days} | ${A.zeroCar} | ${A.zeroRow} | ${A.minCar} | ${f(A.rowsSum / A.days, 1)} |`); }
L.push('');
// 빈 마을: 교역 없는 날
L.push(`빈 마을의 앞 60날 교역 없는 날 % — 중앙값 ${f(Q.noTradeMed, 0)} · 같은 판 모든 마을 중앙값은 아래.`);
const allNoTrade = [];
for (const s of okSeeds) { const o = run[`on-${s}`].ob, x = S[`on-${s}`]; for (let i = 0; i < x.N; i++) { let nt = 0, c = 0; for (let d = 5; d < o.day.length; d++) { if (o.n[d][i] > 0) { c++; if (!(o.fin[d][i] + o.fout[d][i] > 0)) nt++; } } if (c) allNoTrade.push(100 * nt / c); } }
Q.allNoTradeMed = med(allNoTrade);
L.push('');
L.push(`전체 마을(켬 · 사람 있는 날 중 교역 없는 날 %) 중앙값 ${f(Q.allNoTradeMed, 0)} %.`);
L.push('');

// ---- 관찰기 무변 ----
const inv = (() => {
  const a = run['off-1020'], b = run['noobs-off-1020'];
  if (!a || !b || !a.fp || !b.fp) return { ok: null, why: '판 없음' };
  const j = (x) => JSON.stringify([x.runHash, x.days, x.side && x.side.days]);
  return { ok: j(a.fp) === j(b.fp), runHashObs: a.fp.runHash, runHashNo: b.fp.runHash, days: (a.fp.days || []).length, daysNo: (b.fp.days || []).length, bytes: j(a.fp).length };
})();
L.push('## ⑦ 관찰기 무변');
L.push('');
L.push('| 견줌 | 판 지문(runHash · 경제 날 지문 · 생활층 지문) | runHash(관찰기 켬) | runHash(관찰기 없음) | 경제 날 지문 줄 수 | 비교한 글자 수 |');
L.push('|---|---|---|---|---|---|');
L.push(`| 끔 1020 — 관찰기 있음 ↔ 없음 | ${inv.ok == null ? inv.why : inv.ok ? '바이트 같음' : '다름'} | ${inv.runHashObs || '—'} | ${inv.runHashNo || '—'} | ${inv.days || '—'} · ${inv.daysNo || '—'} | ${inv.bytes || '—'} |`);
L.push('');

// ---- ⑧ 한 줄 답 ----
L.push('## ⑧ 한 줄 답(표)');
L.push('');
const tn = (x) => (x == null ? '—' : x);
const ans = {
  nOn: Q.nOn, startMed: Q.startMed, emptyDayMed: Q.emptyDayMed,
  popS: Q.popS, fdAll: Q.fdAll, emAll: Q.emAll, otherAll: Q.otherAll,
  fppEndMed: Q.fppEndMed, fppMeanMed: Q.fppMeanMed, nbMedMed: Q.nbMedMed, nbBig: Q.nbBig, fppEndMax: Q.fppEndMax,
};
L.push('| 칸 | 값 |');
L.push('|---|---|');
L.push(`| 켬 빈 마을(여섯 시드) | ${ans.nOn} |`);
L.push(`| 비기 시작 → 빈 날 사람 합 | ${ans.popS} |`);
L.push(`| 그 사이 굶어 죽음 · 떠남 · 그 밖 죽음 | ${ans.fdAll} · ${ans.emAll} · ${ans.otherAll} |`);
L.push(`| 앞 60날 끝 곳간 날치 중앙값 | ${f(ans.fppEndMed, 1)} |`);
L.push(`| 이웃 곳간 날치 중앙값 | ${f(ans.nbMedMed, 1)} |`);
L.push(`| 이웃 곳간 ≥ 30날치인 빈 마을 | ${ans.nbBig}/${ans.nOn} |`);
L.push('');
fs.writeFileSync(path.join(R, '표.md'), L.join('\n') + '\n');
// CSV
const q = (v) => (v == null ? '' : typeof v === 'string' && /[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const csv = (cols, rows) => cols.join(',') + '\n' + rows.map((r) => cols.map((c) => q(r[c])).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(R, '빈마을.csv'), csv(['arm', 'seed', 'name', 'type', 'water', 'peak', 'startDay', 'emptyDay', 'fppStart', 'fppEnd', 'fppMean', 'fppMin', 'fin', 'fout', 'fd', 'em', 'otherDead', 'pop0', 'popE', 'fdAll', 'emAll', 'otherAll', 'popS', 'nbMed', 'nbEndOver30', 'nbEndN', 'noTradePct', 'winterPct', 'isoDays'], emptyRows));
fs.writeFileSync(path.join(R, '굶어죽음_마을별.csv'), csv(['seed', 'name', 'type', 'off', 'on', 'diff', 'peakOff', 'peakOn'], excRows));
fs.writeFileSync(path.join(R, '굶어죽음_달별.csv'), csv(['b', 'from', 'to', 'offFd', 'onFd', 'offPer1000', 'onPer1000', 'offPop', 'onPop', 'onEm'], monthly.map((m) => ({ b: m.b + 1, from: m.from, to: m.to, offFd: m.off.fd, onFd: m.on.fd, offPer1000: m.off.per1000, onPer1000: m.on.per1000, offPop: m.off.pop, onPop: m.on.pop, onEm: m.on.em }))));
const agg = (arm, k) => sum(okSeeds.map((s) => k(S[`${arm}-${s}`])));
const head = okSeeds.length ? {
  seeds: okSeeds, emptyOffSix: agg('off', (x) => x.empty.length), emptyOnSix: agg('on', (x) => x.empty.length),
  emptyOffBySeed: okSeeds.map((s) => S[`off-${s}`].empty.length), emptyOnBySeed: okSeeds.map((s) => S[`on-${s}`].empty.length),
  fdOffSix: agg('off', (x) => x.fdTot), fdOnSix: agg('on', (x) => x.fdTot), per1000Off: 1000 * agg('off', (x) => x.fdTot) / agg('off', (x) => x.meanPop), per1000On: 1000 * agg('on', (x) => x.fdTot) / agg('on', (x) => x.meanPop),
  popOffSix: agg('off', (x) => x.popEnd), popOnSix: agg('on', (x) => x.popEnd), ratioBySeed: okSeeds.map((s) => S[`on-${s}`].popEnd / S[`off-${s}`].popEnd),
  c50On: okSeeds.map((s) => S[`on-${s}`].c50), c80On: okSeeds.map((s) => S[`on-${s}`].c80), c50Off: okSeeds.map((s) => S[`off-${s}`].c50),
  excessK50: okSeeds.map((s) => excess[s].k50), excessK80: okSeeds.map((s) => excess[s].k80), excessNPos: okSeeds.map((s) => excess[s].nPos),
} : null;
fs.writeFileSync(path.join(R, '요약.json'), JSON.stringify({ head, spread, Q, byType, offByType, typeStat, monthly, seaStat, cornerW, imp, car, inv, excess, emptyRows, rowsRun, wLo, wHi }, null, 1));
console.log(L.join('\n'));
