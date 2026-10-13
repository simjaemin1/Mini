#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T717 표 기계 · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t717-table.js — 통나무 1단계 판 표: 팔(②·③·둘 다) × 3시드 — 통나무 0 마을 · 못 한 일(T702 정의) · 인구 · ② 소멸 장부 · ③ 문 ==========
//   쓰는 법: node scripts/t717-table.js --arm main=<판 폴더> --arm ②=<폴더> … [--base main] [--json out.json]
//     판 폴더 = 기준선 게이트(`server-baseline-check.js`)가 판을 둔 곳(`sbc-<시드>.json` · 관찰자 `sbc-<시드>.json.t717.json`).
//   ★"못 한 일" — T701 가지가 원격에 없어 **T702 의 정의**로 센다(econ 이 이미 남기는 칸만):
//     땔감 못 땜 = 그날 `_fuelCov < 1` · 집 못 지음(통나무) = 수용력 < 사람 × `HOUSE_BUFFER` 이고 곳간 통나무 < 1 · 노 못 돌림 = `_smeltNoFuel` 누계 · 숯가마 = `_kiln` 선 날.
//   ★② 장부(행위 층 켬 세계) — 세계 하루 벤 단(존 문) = 곳간에 든 단(입구가 받은 몫 · 세 자리 합) + 끝날 짐 + 끝날 손 + **사라진 단**.
//   ★가름(T252) — 시드 셋 부호가 같고 |평균 Δ%| > 퍼짐이면 가름 · 부호만 같으면 방향만 · 그 밖 못 가름.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const ARMS = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--arm') { const [nm, dir] = argv[i + 1].split('='); ARMS.push({ nm, dir }); }
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = String(opt('--seeds', '1020,7,42')).split(',').map(Number);
const BASE = opt('--base', ARMS[0] && ARMS[0].nm), JOUT = opt('--json', '');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const HOUSE_BUFFER = +(SRC.match(/const HOUSE_BUFFER = ([\d.]+);/) || [])[1];
const sum = (a) => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
const f1 = (x, d = 1) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d)) : '—');
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

function load(dir, s) {
  let run = null, pr = null;
  try { run = JSON.parse(fs.readFileSync(path.join(dir, `sbc-${s}.json`), 'utf8')); } catch (e) {}
  try { pr = JSON.parse(fs.readFileSync(path.join(dir, `sbc-${s}.json.t717.json`), 'utf8')); } catch (e) {}
  return { run, pr };
}
function metr(pr, run) {
  const D = pr.days, V = pr.v;
  const at = (d) => D.indexOf(d);
  const zeroAt = (d) => { const k = at(d); if (k < 0) return NaN; let z = 0; for (const S of V) if (S.wood[k] < 1) z++; return z; };
  const vd = (fn) => { let c = 0; for (const S of V) for (let k = 0; k < D.length; k++) if (fn(S, k)) c++; return c; };
  const cold = (S, k) => (S.cold[k] || 0) > 0.01;
  // 겨울 건강 — 추운 날 마을·날 평균(땔감 0 마을 · 있는 마을)
  let hW0 = 0, nW0 = 0, hW1 = 0, nW1 = 0;
  for (const S of V) for (let k = 0; k < D.length; k++) if (cold(S, k) && Number.isFinite(S.hl[k])) { if (S.fc[k] < 1) { hW0 += S.hl[k]; nW0++; } else { hW1 += S.hl[k]; nW1++; } }
  // 직업 판단 — 나무꾼 판단 · 기근 블록(식량 < 30일) 안 나무꾼 판단
  let swAll = 0, swLj = 0, swLjFam = 0, swFam = 0;
  for (const S of V) for (let k = 0; k < D.length; k++) { const w = S.sw[k]; if (!w) continue; swAll++; const fd = S.fd[k]; const fam = Number.isFinite(fd) && fd < 30; if (fam) swFam++; if (/^lumberjack>/.test(w)) { swLj++; if (fam) swLjFam++; } }
  // ② 장부
  let gC = [0, 0], gH = [0, 0], gP = [0, 0], cutTrees = 0;
  for (const S of V) for (let k = 0; k < D.length; k++) {
    for (const [acc, a] of [[gC, S.gc[k]], [gH, S.gh[k]], [gP, S.gp[k]]]) if (a) { acc[0] += a[0]; acc[1] += a[1]; }
    if (S.ct[k] > 0) cutTrees += S.ct[k];
  }
  const cutU = sum((pr.cut || []).map((x) => x[0])), cutN = sum((pr.cut || []).map((x) => x[1]));
  const kEnd = D.length - 1;
  const pkEnd = sum(V.map((S) => S.pk[kEnd] || 0)), hdEnd = sum(V.map((S) => S.hd[kEnd] || 0));
  const acc = gC[1] + gH[1] + gP[1];
  return {
    w0_30: zeroAt(30), w0_100: zeroAt(100), w0_400: zeroAt(D[kEnd]),
    w0vd: vd((S, k) => S.wood[k] < 1),
    fc1: vd((S, k) => Number.isFinite(S.fc[k]) && S.fc[k] < 1),
    fc1cold: vd((S, k) => cold(S, k) && Number.isFinite(S.fc[k]) && S.fc[k] < 1),
    fcMean: (() => { let a = 0, n = 0; for (const S of V) for (let k = 0; k < D.length; k++) if (Number.isFinite(S.fc[k])) { a += Math.min(1, S.fc[k]); n++; } return n ? a / n : NaN; })(),
    fcMeanCold: (() => { let a = 0, n = 0; for (const S of V) for (let k = 0; k < D.length; k++) if (Number.isFinite(S.fc[k]) && cold(S, k)) { a += Math.min(1, S.fc[k]); n++; } return n ? a / n : NaN; })(),
    hz: vd((S, k) => S.house[k] < S.n[k] * HOUSE_BUFFER && S.wood[k] < 1),
    sns: sum(V.map((S) => S.sns[kEnd] || 0)),
    kiln: vd((S, k) => !!S.kiln[k]),
    fam: vd((S, k) => !!S.fam[k]),
    lj0_400: V.filter((S) => (S.lj[kEnd] || 0) === 0).length,
    ljVd: vd((S, k) => (S.lj[k] || 0) >= 1),
    pop: run && run.eight ? run.eight.pop : sum(V.map((S) => S.n[kEnd])),
    dead: run && run.eight ? run.eight.dead : NaN,
    deadTot: sum(V.map((S) => S.dead[kEnd] || 0)),
    hW0: nW0 ? hW0 / nW0 : NaN, hW1: nW1 ? hW1 / nW1 : NaN, nW0, nW1,
    swAll, swLj, swLjFam, swFam,
    cutU, cutN, cutTrees, offC: gC[0], accC: gC[1], offH: gH[0], accH: gH[1], offP: gP[0], accP: gP[1], acc, pkEnd, hdEnd,
    lost: cutU - acc - pkEnd - hdEnd, refusedFresh: (gC[0] - gC[1]) + (gH[0] - gH[1]),
  };
}
const D = {}, M = {};
for (const a of ARMS) { D[a.nm] = {}; M[a.nm] = {}; for (const s of SEEDS) { const x = load(a.dir, s); D[a.nm][s] = x; if (x.pr) M[a.nm][s] = metr(x.pr, x.run); } }
const verdict = (base, arm, k) => {
  const d = SEEDS.map((s) => { const x = M[base][s] && M[base][s][k], y = M[arm][s] && M[arm][s][k]; return (Number.isFinite(x) && Number.isFinite(y) && x !== 0) ? 100 * (y - x) / Math.abs(x) : (x === 0 && y === 0 ? 0 : NaN); });
  const ok = d.filter(Number.isFinite);
  const mean = ok.length ? sum(ok) / ok.length : NaN;
  const sg = ok.length === SEEDS.length && (ok.every((x) => x > 0) || ok.every((x) => x < 0));
  const w = ok.length ? Math.max(...ok) - Math.min(...ok) : NaN;
  const v = !ok.length ? '—' : (ok.every((x) => x === 0) ? '같음' : sg && Math.abs(mean) > w ? `가름(${f1(mean)}%)` : sg ? `방향만(${f1(mean)}%)` : '못 가름');
  return { d, mean, v };
};
const KEYS = [['w0_30', '통나무 0 마을 d30'], ['w0_100', 'd100'], ['w0_400', 'd400'], ['w0vd', '통나무 0 마을·날'],
  ['fc1', '땔감 못 땜 마을·날'], ['fc1cold', '그중 추운 날'], ['fcMean', '땔감 충당률 평균(마을·날 · 1 에서 자름)'], ['fcMeanCold', '그중 추운 날'], ['hz', '집 못 지음(통나무) 마을·날'], ['sns', '노 연료 0 번 누계'], ['kiln', '숯가마 선 마을·날'],
  ['fam', '기근 마을·날'], ['pop', '인구 d400'], ['dead', '빈 마을'], ['lj0_400', '나무꾼 0 마을 d400'], ['ljVd', '나무꾼 있는 마을·날'],
  ['hW0', '추운 날 건강 — 땔감 모자란 마을·날'], ['hW1', '추운 날 건강 — 땔감 찬 마을·날'], ['swLj', '나무꾼 판단'], ['swLjFam', '그중 기근 블록 안'], ['swFam', '기근 블록 판단']];
const KEYS2 = [['cutU', '벤 단(존 문)'], ['cutN', '벤 그루'], ['acc', '곳간에 든 단'], ['refusedFresh', '입구가 안 받은 단(새로 벤 것)'], ['pkEnd', '끝날 마을 짐'], ['hdEnd', '끝날 손'], ['lost', '사라진 단'], ['accP', '짐에서 든 단'], ['offH', '손 입고 내민 단'], ['accH', '손 입고 받은 단']];
function table(keys, arms, base) {
  console.log(`| 수 | ${arms.map((a) => a + ' ' + SEEDS.join('/')).join(' | ')} | ${arms.filter((a) => a !== base).map((a) => `Δ% ${a} · T252`).join(' | ')} |`);
  console.log('|---|' + arms.map(() => '---|').join('') + arms.filter((a) => a !== base).map(() => '---|').join(''));
  for (const [k, lab] of keys) {
    const dec = /^(h|fcMean)/.test(k) ? 3 : 0;
    const cells = arms.map((a) => SEEDS.map((s) => (M[a][s] ? f1(M[a][s][k], dec) : '—')).join(' / '));
    const dcells = arms.filter((a) => a !== base).map((a) => { const r = verdict(base, a, k); return r.d.map((x) => f1(x)).join(' / ') + ' · ' + r.v; });
    console.log(`| ${lab} | ${cells.join(' | ')} | ${dcells.join(' | ')} |`);
  }
}
const names = ARMS.map((a) => a.nm);
const G = {}; for (const a of ARMS) { const g = a.nm.startsWith('T325') ? 'T325' : 'main'; (G[g] = G[g] || []).push(a.nm); }
for (const g of Object.keys(G)) {
  const arms = G[g], base = arms[0];
  console.log(`\n### ${g === 'main' ? '기본 세계(행위 층 끔 · T650 자)' : '행위 층 켬 세계(`T325_WOOD_ACT=1` · T650 자)'} — 기준 팔 ${base}\n`);
  table(KEYS, arms, base);
  if (g === 'T325') { console.log(`\n#### ② 장부 — 벤 단 = 곳간 + 짐 + 손 + 사라짐\n`); table(KEYS2, arms, base); }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ seeds: SEEDS, arms: ARMS, M }, null, 1));
