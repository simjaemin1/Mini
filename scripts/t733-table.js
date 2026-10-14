#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T733 표 기계 · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t733-table.js — 벤 그루의 잔가지 · 도토리 판 표: 끔(main) ↔ 켬(`T733_FELL_LOOT=1`) × 3시드 ==========
//   쓰는 법: node scripts/t733-table.js --pair W=<끔 폴더>,<켬 폴더> [--pair F=<끔>,<켬>] [--seeds 1020,7,42] [--json out.json] [--villages W]
//     폴더 = `t577-server-run.js` 판을 둔 곳(`<태그>-<시드>.json` · 관찰자 `<태그>-<시드>.json.t733.json` — `scripts/t733-loot-probe.js`).
//   ★① 장부 — 벤 전리품(존 문이 돌려준 잔가지 · 도토리 · 헤드리스 + 몸) = 곳간에 든 몫(켠 팔 `_t733Gr`) + 끝날 마을 짐 + 끝날 손 + **사라진 몫**.
//   ★땔감 충당률 — 마을·날 `_fuelCov`(1 에서 자름) 평균 · 추운 날(`_coldStress` > 0.01) · 못 땐 마을·날(< 1).
//   ★② 걸은 몸 — 채집 `_t347Dbg.walked`(끔 · 켬 같은 마을·날을 견준다) · 켠 팔의 [옛 셈 · 새 셈](`_t347Dbg.t733`).
//   ★가름(T252) — 시드 셋 부호가 같고 |평균 Δ%| > 퍼짐이면 가름 · 부호만 같으면 방향만 · 그 밖 못 가름.
'use strict';
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PAIRS = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--pair') { const [nm, dirs] = argv[i + 1].split('='); const [off, on] = dirs.split(','); PAIRS.push({ nm, off, on }); }
const SEEDS = String(opt('--seeds', '1020,7,42')).split(',').map(Number);
const JOUT = opt('--json', ''), VTAB = opt('--villages', '');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
const KN = (n) => +(SRC.match(new RegExp('const ' + n + ' = ([\\d.]+);')) || [])[1];
const FIREWOOD_PC = KN('FIREWOOD_PC'), FUEL_COLD_W = KN('FUEL_COLD_W'), LOW_FUEL_EQ = KN('LOW_FUEL_EQ');
const sum = (a) => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
const f1 = (x, d = 1) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d)) : '—');

function load(dir, s) {
  let run = null, pr = null;
  const fs0 = fs.readdirSync(dir);
  const pf = fs0.find((f) => f.endsWith(`-${s}.json.t733.json`)), rf = pf ? pf.replace(/\.t733\.json$/, '') : null;
  try { if (rf) run = JSON.parse(fs.readFileSync(path.join(dir, rf), 'utf8')); } catch (e) {}
  try { if (pf) pr = JSON.parse(fs.readFileSync(path.join(dir, pf), 'utf8')); } catch (e) {}
  return { run, pr };
}
function metr(pr, run) {
  const D = pr.days, V = pr.v, kEnd = D.length - 1;
  const cold = (S, k) => (S.cold[k] || 0) > 0.01;
  const vd = (fn) => { let c = 0; for (const S of V) for (let k = 0; k < D.length; k++) if (fn(S, k)) c++; return c; };
  const mean = (fn, pick) => { let a = 0, n = 0; for (const S of V) for (let k = 0; k < D.length; k++) { if (pick && !pick(S, k)) continue; const x = fn(S, k); if (Number.isFinite(x)) { a += x; n++; } } return n ? a / n : NaN; };
  const lootV = V.map((S) => { const c = [0, 0, 0, 0]; for (const x of S.cut) if (x) for (let i = 0; i < 4; i++) c[i] += x[i]; return c; });
  const W = [0, 0, 0, 0, 0, 0, 0, 0]; for (const d of (pr.world || [])) for (let i = 0; i < 8; i++) W[i] += d[i] || 0;
  const last = (S, key) => S[key][kEnd] || 0;
  const grV = V.map((S) => last(S, 'gr') || [0, 0]), pkV = V.map((S) => last(S, 'pk') || [0, 0]), hdV = V.map((S) => last(S, 'hd') || [0, 0]);
  const grT = sum(grV.map((g) => g[0])), grA = sum(grV.map((g) => g[1])), pkT = sum(pkV.map((g) => g[0])), pkA = sum(pkV.map((g) => g[1])), hdT = sum(hdV.map((g) => g[0])), hdA = sum(hdV.map((g) => g[1]));
  const lootT = W[1] + W[5], lootA = W[2] + W[6];
  let f7d = 0, f7un = 0, f7o = 0, f7n = 0; for (const S of V) for (const x of S.f7) if (x) { f7o += x[0]; f7n += x[1]; if (x[0] !== x[1]) f7d++; if (x[0] > 0 && x[1] === 0) f7un++; }
  return {
    trees: W[3] + W[7], treesHead: W[3], treesBody: W[7], lootW: W[0] + W[4], lootT, lootA, lootHeadT: W[1], lootHeadA: W[2], lootBodyT: W[5], lootBodyA: W[6],
    lootVillT: sum(lootV.map((c) => c[1])), lootVillA: sum(lootV.map((c) => c[2])), lost733: pr.lost,
    grT, grA, pkT, pkA, hdT, hdA,
    lostT: lootT - grT - pkT - hdT, lostA: lootA - grA - pkA - hdA,
    fcMean: mean((S, k) => (Number.isFinite(S.fc[k]) ? Math.min(1, S.fc[k]) : NaN)),
    fcMeanCold: mean((S, k) => (Number.isFinite(S.fc[k]) ? Math.min(1, S.fc[k]) : NaN), cold),
    fc1: vd((S, k) => Number.isFinite(S.fc[k]) && S.fc[k] < 1), fc1cold: vd((S, k) => cold(S, k) && Number.isFinite(S.fc[k]) && S.fc[k] < 1),
    twMean: mean((S, k) => S.tw[k]), acMean: mean((S, k) => S.ac[k]),
    hlCold: mean((S, k) => S.hl[k], cold),
    pop: run && run.eight ? run.eight.pop : sum(V.map((S) => S.n[kEnd])), empty: run ? run.empty : NaN,
    expand: run && run.eight ? run.eight.expand : NaN, grain: run && run.eight ? run.eight.grain : NaN,
    fwVd: vd((S, k) => (S.fw[k] || 0) > 0), fwSum: sum(V.map((S) => sum(S.fw.map((x) => x || 0)))), wwVd: vd((S, k) => (S.ww[k] || 0) > 0),
    f7d, f7un, f7o, f7n,
    wdMean: mean((S, k) => (S.wd ? S.wd[k] : NaN)), ljMean: mean((S, k) => (S.lj ? S.lj[k] : NaN)), woMean: mean((S, k) => (S.wo ? S.wo[k] : NaN)),
    exEnd: S0(V, 'ex', kEnd), trFood: mean((S, k) => (S.tr && S.tr[k] ? S.tr[k][0] : NaN)), trWood: mean((S, k) => (S.tr && S.tr[k] ? S.tr[k][1] : NaN)),
    fhEnd: S0(V, 'fh', kEnd), fhMean: mean((S, k) => (S.fh ? S.fh[k] : NaN)), fgEnd: S0(V, 'fg', kEnd), fpSum: sum(V.map((S) => sum((S.fp || []).map((x) => x || 0)))),
    //   직접 몫 — 그날 든 잔가지가 그날 하급 연료로 탄 몫 ÷ 그날 땔감 수요(취사·난방 · 제련 뺌 · 충당률 < 1 인 마을·날만 · 1 에서 자른 충당률 위로는 안 센다)
    fcDirect: !(grT > 0) ? 0 : (() => { let a = 0, n = 0; for (const S of V) for (let k = 0; k < D.length; k++) { const fc = S.fc[k]; if (!Number.isFinite(fc)) continue; n++;
      const tw = S.cut[k] ? S.cut[k][1] : 0; const need = S.n[k] * FIREWOOD_PC * (1 + FUEL_COLD_W * (S.cold[k] || 0));
      if (tw > 0 && need > 0 && fc < 1) a += Math.min(tw * LOW_FUEL_EQ / need, fc); } return n ? a / n : NaN; })(),
    twEqNeed: (() => { let t = 0, nd = 0; for (const S of V) for (let k = 0; k < D.length; k++) { t += S.cut[k] ? S.cut[k][1] : 0; nd += S.n[k] * FIREWOOD_PC * (1 + FUEL_COLD_W * (S.cold[k] || 0)); } return nd ? 100 * t * LOW_FUEL_EQ / nd : NaN; })(),
    lootV, grV, names: pr.names, land: pr.land, days: D.length,
  };
}
function S0(V, key, k) { if (!V.length || !V[0][key]) return NaN; return sum(V.map((S) => (S[key] ? (S[key][k] || 0) : NaN))); }
const verdict = (A, B, k) => {
  const d = SEEDS.map((s) => { const x = A[s] && A[s][k], y = B[s] && B[s][k]; return (Number.isFinite(x) && Number.isFinite(y) && x !== 0) ? 100 * (y - x) / Math.abs(x) : (x === 0 && y === 0 ? 0 : NaN); });
  const ok = d.filter(Number.isFinite);
  const mean = ok.length ? sum(ok) / ok.length : NaN;
  const sg = ok.length === SEEDS.length && (ok.every((x) => x > 0) || ok.every((x) => x < 0));
  const w = ok.length ? Math.max(...ok) - Math.min(...ok) : NaN;
  const v = !ok.length ? '—' : (ok.every((x) => x === 0) ? '같음' : sg && Math.abs(mean) > w ? `가름(${f1(mean)}%)` : sg ? `방향만(${f1(mean)}%)` : '못 가름');
  return { d, mean, v };
};
//   두 팔이 처음 갈린 날(마을 인구) · 그 앞 날들의 충당률 차(직접 몫만 있는 구간 — 그 뒤는 혼돈이 섞인다)
function early(pOff, pOn) {
  if (!pOff || !pOn) return null;
  const nOn = new Map(pOn.names.map((nm, i) => [nm, i]));
  let first = null;
  for (let k = 0; k < pOff.days.length && first == null; k++) for (let i = 0; i < pOff.names.length; i++) { const j = nOn.get(pOff.names[i]); if (j != null && pOff.v[i].n[k] !== pOn.v[j].n[k]) { first = k; break; } }
  const K = first == null ? pOff.days.length : first;
  const fm = (p, k) => { let a = 0, n = 0; for (const S of p.v) { const x = S.fc[k]; if (Number.isFinite(x)) { a += Math.min(1, x); n++; } } return n ? a / n : NaN; };
  let a = 0, b = 0; for (let k = 0; k < K; k++) { a += fm(pOff, k); b += fm(pOn, k); }
  return { day: first == null ? null : pOff.days[first], d: K ? 100 * (b - a) / a : NaN };
}
//   끔 · 켬 같은 마을·날의 걸은 몸이 갈린 날(채집 · 나무)
function walkDiff(pOff, pOn) {
  if (!pOff || !pOn) return null;
  const nOn = new Map(pOn.names.map((nm, i) => [nm, i]));
  const kOn = new Map(pOn.days.map((d, k) => [d, k]));
  let fd = 0, wd = 0, both = 0;
  pOff.names.forEach((nm, i) => {
    const j = nOn.get(nm); if (j == null) return;
    const A = pOff.v[i], B = pOn.v[j];
    pOff.days.forEach((d, k) => { const m = kOn.get(d); if (m == null) return; both++; if ((A.fw[k] || 0) !== (B.fw[m] || 0)) fd++; if ((A.ww[k] || 0) !== (B.ww[m] || 0)) wd++; });
  });
  return { fd, wd, both };
}
const OUT = { seeds: SEEDS, pairs: {} };
const KEYS1 = [['trees', '벤 그루(존 문 · 헤드리스 + 몸)'], ['treesBody', '그중 몸 갈래'], ['lootW', '벤 단'], ['lootT', '벤 잔가지'], ['lootA', '벤 도토리'],
  ['grT', '곳간에 든 잔가지(`_t733Gr`)'], ['grA', '곳간에 든 도토리'], ['pkT', '끝날 마을 짐 — 잔가지'], ['pkA', '— 도토리'], ['hdT', '끝날 손 — 잔가지'], ['hdA', '— 도토리'],
  ['lostT', '**사라진 잔가지**'], ['lostA', '**사라진 도토리**']];
const KEYS2 = [['fcMean', '땔감 충당률 평균(마을·날 · 1 에서 자름)'], ['fcDirect', '그중 곳간에 든 잔가지가 그날 탄 몫(직접 몫 · 충당률 < 1 마을·날)'], ['twEqNeed', '벤 잔가지 × 0.3 ÷ 땔감 수요 합(%)'], ['fcMeanCold', '그중 추운 날'], ['fc1', '땔감 못 땐 마을·날(< 1)'], ['fc1cold', '그중 추운 날'],
  ['twMean', '곳간 잔가지 평균(마을·날)'], ['acMean', '곳간 도토리 평균(마을·날)'], ['hlCold', '추운 날 건강 평균'], ['pop', '인구 d400'], ['empty', '빈 마을'], ['expand', '영토 확장 셀(판 JSON 여덟 수)'], ['grain', '곡물(판 JSON 여덟 수)'],
  ['wdMean', '곳간 통나무 평균(마을·날)'], ['ljMean', '나무꾼 평균(마을·날)'], ['woMean', '수식 하루 통나무 몫 평균'], ['exEnd', '영토 확장 셀 누계 d400'], ['trFood', '국고 식량 평균'], ['trWood', '국고 통나무 평균'],
  ['fpSum', '채집 헤드리스 딴 개체(누계)'], ['fgEnd', '채집 곳간 든 몫(누계 `_t347Gran`)'], ['fhEnd', '끝날 몸 손 — 열매 · 약초'],
  ['fwVd', '채집 걸은 몸 > 0 마을·날'], ['wwVd', '나무 걸은 몸 > 0 마을·날'], ['f7d', '켠 팔 — 옛 셈 ≠ 새 셈 마을·날'], ['f7un', '켠 팔 — 옛 셈이면 막혔을 일괄']];
for (const P of PAIRS) {
  const A = {}, B = {}, RA = {}, RB = {};
  for (const s of SEEDS) { const a = load(P.off, s), b = load(P.on, s); RA[s] = a; RB[s] = b; if (a.pr) A[s] = metr(a.pr, a.run); if (b.pr) B[s] = metr(b.pr, b.run); }
  const dec = (k) => (/^fcDirect$/.test(k) ? 4 : /^(fcMean|hlCold|ljMean|woMean)/.test(k) ? 3 : /^(twMean|acMean)$/.test(k) ? 4 : /Mean$|^tr(Food|Wood)$|^twEqNeed$/.test(k) ? 2 : 0);
  const row = (k, lab, withV) => {
    const c = (M) => SEEDS.map((s) => (M[s] ? f1(M[s][k], dec(k)) : '—')).join(' / ');
    const r = verdict(A, B, k);
    return `| ${lab} | ${c(A)} | ${c(B)} |${withV ? ` ${r.d.map((x) => f1(x)).join(' / ')} · ${r.v} |` : ''}`;
  };
  console.log(`\n### ${P.nm} — 끔 ${P.off} ↔ 켬 ${P.on}\n`);
  console.log(`| ① 장부(3시드) | 끔 ${SEEDS.join(' / ')} | 켬 ${SEEDS.join(' / ')} |`); console.log('|---|---|---|');
  for (const [k, lab] of KEYS1) console.log(row(k, lab, false));
  console.log(`\n| 판 수(3시드) | 끔 ${SEEDS.join(' / ')} | 켬 ${SEEDS.join(' / ')} | Δ% · T252 |`); console.log('|---|---|---|---|');
  for (const [k, lab] of KEYS2) console.log(row(k, lab, true));
  const wd = SEEDS.map((s) => walkDiff(RA[s].pr, RB[s].pr));
  console.log(`\n* 걸은 몸이 갈린 마을·날(끔 ↔ 켬 같은 마을·날): 채집 ${wd.map((x) => (x ? x.fd : '—')).join(' / ')} · 나무 ${wd.map((x) => (x ? x.wd : '—')).join(' / ')}(견준 마을·날 ${wd.map((x) => (x ? x.both : '—')).join(' / ')})`);
  const ea = SEEDS.map((s) => early(RA[s].pr, RB[s].pr));
  console.log(`* 두 팔이 처음 갈린 날(마을 인구): ${ea.map((x) => (x && x.day != null ? x.day : '—')).join(' / ')} · 그 앞 날들의 충당률 차 ${ea.map((x) => (x ? f1(x.d, 2) + '%' : '—')).join(' / ')}`);
  console.log(`* 관찰자가 마을로 못 이은 헤드리스 전리품: 끔 ${SEEDS.map((s) => (A[s] ? A[s].lost733 : '—')).join(' / ')} · 켬 ${SEEDS.map((s) => (B[s] ? B[s].lost733 : '—')).join(' / ')}`);
  OUT.pairs[P.nm] = { off: P.off, on: P.on, A: {}, B: {}, walk: wd, early: ea };
  for (const s of SEEDS) { for (const [M, o] of [[A, OUT.pairs[P.nm].A], [B, OUT.pairs[P.nm].B]]) if (M[s]) { const x = Object.assign({}, M[s]); delete x.lootV; delete x.grV; delete x.names; delete x.land; o[s] = x; } }
  //   마을별(3시드) — 끔: 사라진 잔가지 · 도토리(= 헤드리스 전리품 · 몸 갈래 0 일 때) · 켬: 곳간에 든 잔가지 · 도토리
  if (VTAB === P.nm) {
    const names = A[SEEDS[0]] ? A[SEEDS[0]].names : B[SEEDS[0]].names, land = (A[SEEDS[0]] || B[SEEDS[0]]).land;
    const rows = names.map((nm, i) => {
      const off = SEEDS.map((s) => { const M = A[s]; if (!M) return null; const j = M.names.indexOf(nm); return j < 0 ? null : M.lootV[j]; });
      const on = SEEDS.map((s) => { const M = B[s]; if (!M) return null; const j = M.names.indexOf(nm); return j < 0 ? null : M.grV[j]; });
      return { nm, w: land[i] && land[i].wood, off, on };
    });
    rows.sort((x, y) => (y.w || 0) - (x.w || 0));
    console.log(`\n#### ${P.nm} 마을별 — land.wood 큰 차례 · 끔 사라진 잔가지·도토리(시드 ${SEEDS.join('/')}) · 켬 곳간에 든 잔가지·도토리(시드 ${SEEDS.join('/')})\n`);
    console.log('| 마을 | land.wood | 끔 사라짐 잔가지 | 끔 사라짐 도토리 | 켬 곳간 잔가지 | 켬 곳간 도토리 |'); console.log('|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.nm} | ${f1(r.w, 2)} | ${r.off.map((c) => (c ? f1(c[1], 0) : '—')).join(' / ')} | ${r.off.map((c) => (c ? f1(c[2], 0) : '—')).join(' / ')} | ${r.on.map((c) => (c ? f1(c[0], 0) : '—')).join(' / ')} | ${r.on.map((c) => (c ? f1(c[1], 0) : '—')).join(' / ')} |`);
    OUT.pairs[P.nm].villages = rows;
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(OUT, null, 1));
