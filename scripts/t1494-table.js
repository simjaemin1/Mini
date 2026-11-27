#!/usr/bin/env node
'use strict';
// === scripts/t1494-table.js — T1494 표 만들기(커밋된 판 자료만 읽는다 · 제품 무변 · /dev/shm 안 읽는다 · @regress 없음) ===
// 읽는 것: $R/runs/<팔>-<시드>.done · .json.gz(판 JSON · runHash) · obs-<팔>-<시드>.json.gz(scripts/t1494-observe.js)
//   팔: off · on · only-<갈래>(그 갈래만 켬) · but-<갈래>(그 갈래만 끔) · noobs-off · noobs-on(관찰기 없음 — 시드 1020 · 7)
// 내는 것: $R/표.md · $R/요약.json · $R/빈마을_60날.csv · $R/장부_품목월.csv  (보고의 모든 수는 여기서 복사한다 · 손 셈 0)
// 쓰는 법: R=<자료 폴더> node scripts/t1494-table.js
// 말뜻: 출생 ‰ · 굶어 죽음 ‰ = 사람-날(날 1 이후 마을 사람 수 합) 당 ×1000 · 거둠/사람 = 사람-날 당 거둔 식량(날치) · 곳간 날수 = 마을 곳간 환산 ÷ 사람(사람 있는 마을-날 · 중앙)
//   빈 마을 = 마지막 날 사람 0 · 마을 최고 인구 날 = 그 마을 사람 수 최대 첫 날 · 곳간 0 까지 = 최고 날부터 "곳간 ÷ 사람 < 1날치"(또는 사람 0) 첫 날까지(T1488 과 같은 자)
//   유보 선(날수) = 'ref' 갈래가 켜진 판은 관찰기가 읽은 `_t1419N.d`(그날 물었을 때 · 없으면 건너뜀) · 그 밖(ref 꺼짐 · 끔) = 종전 30날(knobs.reservePCfood)
//   장부 틈 = 곳간 변화 − (거둠 − 먹음 + 들여옴 − 내보냄 − 썩음) · 합계 % = 틈 합 ÷ 흐름(|거둠|+먹음+들여옴+내보냄+|썩음|) 합(T1488 과 같다)
//   짝 Δ 자(T252): 시드 셋 짝 Δ 부호 3/3 일치 · |평균| > 폭(최대−최소) → 가름 · 부호 일치 · |평균| ≤ 폭 → 방향만 · 부호 갈림 → 못 가름
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = process.env.R || path.join(__dirname, '..', '계측', 'T1494_2026-11-26');
const SEEDS = [1020, 7, 42];
const G = ['ref', 'famine', 'birth', 'mig', 'keep', 'switch', 'depart'];
const TAGS = { ref: ['ref'], famine: ['famine', 'mason', 'rescue', 'foodsec'], birth: ['birth'], mig: ['mig'], keep: ['keep'], switch: ['switch', 'pace'], depart: ['depart'] };
const ARMS = ['off', 'on', ...G.map((g) => 'only-' + g), ...G.map((g) => 'but-' + g)];
const rd = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch (e) { return null; } };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const med = (a) => { if (!a.length) return null; const b = Float64Array.from(a).sort(), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f = (v, n) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(n == null ? 0 : n));
const ff = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const H6 = ['hf', 'hs', 'hm', 'hg', 'hc', 'ho'];
const done = (tag) => { try { const [, rc, sec] = fs.readFileSync(path.join(R, 'runs', `${tag}.done`), 'utf8').trim().split(/\s+/); return { rc: +rc, sec: +sec }; } catch (e) { return null; } };
const MET = {}, EMPT = [], LEDG = {}, HASH = {}, PROF = {}, SUM = { made: new Date().toISOString().slice(0, 10), arms: {}, notes: [] };
const csv60 = ['arm,seed,village,emptyDay,offset,day,n,granaryPerPerson,reserveLine,dEm,dFd,dBirth'];

function analyze(arm, s, o) {
  const D = o.day.length, N = o.names.length, tag = `${arm}-${s}`;
  const refOn = arm === 'on' || arm === 'only-ref' || (arm.indexOf('but-') === 0 && arm !== 'but-ref');
  const line = (d, i) => { if (!refOn) return o.knobs.reservePCfood || 30; const x = o.nd[d] && o.nd[d][i]; return x == null ? null : x; };
  let pd = 0, births = 0, harv = 0, eat = 0, res = 0, flow = 0, imm = 0;
  const gran = [], lines = [];
  for (let d = 1; d < D; d++) for (let i = 0; i < N; i++) {
    const n = o.n[d][i]; pd += n; births += o.b[d][i] || 0; imm += o.im[d][i] || 0;
    const hv = sum(H6.map((h) => o[h][d][i] || 0)), e = o.eat[d][i] || 0, fin = o.fin[d][i] || 0, fout = o.fout[d][i] || 0, S1 = o.S1[d][i] || 0, S3 = o.S3[d][i] || 0;
    harv += hv; eat += e;
    const sp = (S1 || S3) ? S1 - S3 : 0, dfe = o.fe[d][i] - o.fe[d - 1][i];
    res += dfe - (hv - e + fin - fout - sp); flow += hv + e + fin + fout + Math.abs(sp);
    if (n > 0) { gran.push(o.fe[d][i] / n); const l = line(d, i); if (l != null) lines.push(l); }
  }
  const fd = sum(o.fd[D - 1]) - sum(o.fd[0]), em = sum(o.em[D - 1]) - sum(o.em[0]), dd = sum(o.dd[D - 1]) - sum(o.dd[0]);
  const popEnd = sum(o.n[D - 1]), empty = o.n[D - 1].filter((x) => x === 0).length;
  // 세계 최고 인구 날
  let wp = 0, wpd = 0; for (let d = 0; d < D; d++) { const t = sum(o.n[d]); if (t > wp) { wp = t; wpd = d; } }
  // 마을 최고 인구 날 곳간 날수 · 곳간 0 까지
  const atPk = [], toZero = [], toZeroW = [], phase = [[], [], [], [], [], []].map(() => ({ line: [], gr: [] }));
  for (let i = 0; i < N; i++) {
    let pk = 0, pdv = 0; for (let d = 0; d < D; d++) if (o.n[d][i] > pk) { pk = o.n[d][i]; pdv = d; }
    if (pk > 0) { atPk.push(o.fe[pdv][i] / pk); let z = null; for (let d = pdv; d < D; d++) { const n = o.n[d][i]; if (n === 0 || o.fe[d][i] / n < 1) { z = d; break; } } if (z != null) toZero.push(o.day[z] - o.day[pdv]); }
    if (o.n[wpd][i] > 0) { let z = null; for (let d = wpd; d < D; d++) { const n = o.n[d][i]; if (n === 0 || o.fe[d][i] / n < 1) { z = d; break; } } if (z != null) toZeroW.push(o.day[z] - o.day[wpd]); }
    for (let d = 1; d < D; d++) { const n = o.n[d][i]; if (!(n > 0) || !(pk > 0)) continue; const r = n / pk; const post = d > pdv;
      const k = !post ? (r < 0.5 ? 0 : r < 0.9 ? 1 : 2) : (r >= 0.9 ? 3 : r >= 0.5 ? 4 : 5); const l = line(d, i); if (l != null) phase[k].line.push(l); phase[k].gr.push(o.fe[d][i] / n); }
    // 빈 마을 마지막 60날
    if (o.n[D - 1][i] === 0) {
      let ez = 0; for (let d = D - 1; d >= 0; d--) if (o.n[d][i] > 0) { ez = d + 1; break; }
      let z = null; for (let d = pdv; d < D; d++) { const n = o.n[d][i]; if (n === 0 || o.fe[d][i] / n < 1) { z = d; break; } }
      let dep = null; for (let d = Math.max(pdv, 1); d < D; d++) if ((o.em[d][i] || 0) > (o.em[d - 1][i] || 0)) { dep = d; break; }
      const first = z == null && dep == null ? '없음' : dep == null ? '곳간' : z == null ? '떠남' : o.day[z] < o.day[dep] ? '곳간' : o.day[z] > o.day[dep] ? '떠남' : '같은 날';
      EMPT.push({ arm, seed: s, village: o.names[i], peak: pk, peakDay: o.day[pdv], stock0Day: z == null ? null : o.day[z], firstDepartDay: dep == null ? null : o.day[dep], first, emptyDay: o.day[Math.min(ez, D - 1)], fd: o.fd[D - 1][i], em: o.em[D - 1][i] });
      for (let off = -60; off <= 0; off++) { const d = Math.min(Math.max(ez + off, 1), D - 1), n = o.n[d][i];
        csv60.push([arm, s, o.names[i], o.day[Math.min(ez, D - 1)], off, o.day[d], n, n > 0 ? (o.fe[d][i] / n).toFixed(2) : '', line(d, i) == null ? '' : (+line(d, i)).toFixed(2), (o.em[d][i] || 0) - (o.em[d - 1][i] || 0), (o.fd[d][i] || 0) - (o.fd[d - 1][i] || 0), o.b[d][i] || 0].join(',')); }
    }
  }
  const tg = (o.tags[o.tags.length - 1] || [0, null])[1], calls = tg && tg.tags ? tg.tags : {};
  const qq = (o.q[o.q.length - 1] || [0, null])[1];
  MET[tag] = { arm, seed: s, days: D, popEnd, empty, pd, births, bPm: 1000 * births / pd, fd, fdPm: 1000 * fd / pd, em, emPm: 1000 * em / pd, dd, ddPm: 1000 * dd / pd, harvPer: harv / pd, eatPer: eat / pd, granMed: med(gran), granN: gran.length,
    gap: flow ? 100 * res / flow : null, worldPeak: wp, worldPeakDay: o.day[wpd], granAtWorldPeak: sum(o.fe[wpd]) / wp, granAtVillPk: med(atPk), toZero: med(toZero), toZeroN: toZero.length, toZeroW: med(toZeroW), toZeroWN: toZeroW.length, imm,
    lineMed: med(lines), lineN: lines.length, calls, q: qq, knobs: { on: o.knobs.T1494_ON, reservePCfood: o.knobs.reservePCfood, tags: o.knobs.T1494_info && o.knobs.T1494_info.tags } };
  PROF[tag] = phase.map((p) => ({ line: med(p.line), gr: med(p.gr), n: p.gr.length }));
  GRANV[tag] = gran;
  // 품목 · 달 장부
  LEDG[tag] = o.led;
}
const GRANV = {};
for (const arm of [...ARMS, 'noobs-off', 'noobs-on']) for (const s of SEEDS) {
  const tag = `${arm}-${s}`, d = done(tag); if (!d) continue;
  const mk = rd(path.join(R, 'runs', `${tag}.json.gz`)), fp = mk && mk.byseed && mk.byseed[s];
  HASH[tag] = { rc: d.rc, sec: d.sec, runHash: fp && fp.runHash, eight: fp && fp.eight ? JSON.stringify(fp.eight) : null, empty: fp && fp.empty };
  if (arm.indexOf('noobs') === 0) continue;
  const o = rd(path.join(R, 'runs', `obs-${tag}.json.gz`)); if (!o || !o.day || o.err) { SUM.notes.push(`${tag}: 관찰 자료 없음/오류 ${o && o.err}`); continue; }
  analyze(arm, s, o);
}
const have = (arm) => SEEDS.filter((s) => MET[`${arm}-${s}`]);
const pooled = (arm, k) => mean(have(arm).map((s) => MET[`${arm}-${s}`][k]));
const pooledMed = (arm) => med([].concat(...have(arm).map((s) => Array.from(GRANV[`${arm}-${s}`]))));
const pairD = (arm, k, base) => have(arm).filter((s) => MET[`${base || 'off'}-${s}`]).map((s) => MET[`${arm}-${s}`][k] - MET[`${base || 'off'}-${s}`][k]);
const pairR = (arm, k, base) => have(arm).filter((s) => MET[`${base || 'off'}-${s}`]).map((s) => MET[`${arm}-${s}`][k] / MET[`${base || 'off'}-${s}`][k]);
function verdict(d) {   // 짝 Δ 자
  if (d.length < 3) return `${d.length}시드`;
  const pos = d.filter((x) => x > 0).length, neg = d.filter((x) => x < 0).length, m = mean(d), w = Math.max(...d) - Math.min(...d);
  if (pos === 3 || neg === 3) return Math.abs(m) > w ? '가름' : '방향만';
  if (pos + neg === 0) return '변화 0';
  return '못 가름';
}
const callsOf = (arm, g) => { const t = TAGS[g]; return sum(have(arm).map((s) => sum(t.map((x) => (MET[`${arm}-${s}`].calls || {})[x] || 0)))); };
const L = [], KEYS = [['popEnd', '끝 인구', 0], ['bPm', '출생 ‰', 3], ['fdPm', '굶어 죽음 ‰', 3], ['empty', '빈 마을', 2], ['harvPer', '거둠/사람', 3], ['granMed', '곳간 날수 중앙', 2]];

L.push('# T1494 표 (scripts/t1494-table.js 출력)');
L.push('');
const kn = MET['on-1020'] && MET['on-1020'].knobs;
L.push(`읽은 판: ${Object.keys(MET).length}/48 관찰 판 · ${Object.keys(HASH).length}/52 판 · 날 ${MET['off-1020'] ? MET['off-1020'].days : '?'}(관찰 칸) · 시드 ${SEEDS.join(' · ')} · 유보 식량 종전 선 \`RESERVE_PC.food\` = ${MET['off-1020'] ? MET['off-1020'].knobs.reservePCfood : '?'}날.`);
L.push('');
L.push('코드가 정본인 갈래 → 태그(읽힌 `T1419_SITE` 열쇠 · 스위치 표 `scripts/t1494-site.js`): ' + G.map((g) => `${g}=${TAGS[g].join('·')}`).join(' · '));
const allTags = {}; for (const t of Object.keys(MET)) for (const k in (MET[t].calls || {})) allTags[k] = (allTags[k] || 0) + MET[t].calls[k];
L.push('');
L.push('실제로 읽힌 태그(전 판 호출 합): ' + Object.keys(allTags).sort().map((k) => `${k} ${ff(allTags[k])}`).join(' · ') + ' — 이 밖의 태그(' + G.flatMap((g) => TAGS[g]).filter((k) => !allTags[k]).join(' · ') + ')는 어느 판에서도 한 번도 안 읽혔다.');
L.push('');

// ---- ① 자리 하나씩 켠 판 ----
L.push('## ① 자리 하나씩만 켠 판 (시드 셋 평균 · 괄호 = 끔 대비 비)');
L.push('');
L.push('| 판 | ' + KEYS.map((k) => k[1]).join(' | ') + ' | 호출(그 갈래 태그, 시드 합) |');
L.push('|---|' + KEYS.map(() => '---').join('|') + '|---|');
const row1 = (arm, g) => {
  const cells = KEYS.map(([k, , n]) => { const v = k === 'granMed' ? pooledMed(arm) : pooled(arm, k), o = k === 'granMed' ? pooledMed('off') : pooled('off', k); return `${f(v, n)} (×${f(o ? v / o : null, 3)})`; });
  const c = g ? callsOf(arm, g) : (arm === 'on' ? sum(have('on').map((s) => sum(Object.values(MET[`on-${s}`].calls || {})))) : 0);
  L.push(`| ${arm} | ${cells.join(' | ')} | ${g ? (c === 0 ? '**0 (호출 0)**' : ff(c)) : (arm === 'on' ? ff(c) : '—')} |`);
};
row1('off'); row1('on'); for (const g of G) row1('only-' + g, g);
L.push('');
L.push('### 갈래 하나 켠 판 − 끔, 시드 짝 Δ 자(T252) — 출생 ‰ · 굶어 죽음 ‰ · 끝 인구 · 거둠/사람');
L.push('');
L.push('| 판 | 출생 ‰ Δ (시드별 · 평균) | 판정 | 굶어 죽음 ‰ Δ | 판정 | 끝 인구 Δ | 판정 | 거둠/사람 Δ | 판정 | 빈 마을 Δ |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
const VERD = {};
for (const arm of ['on', ...G.map((g) => 'only-' + g)]) {
  const c = (k, n) => { const d = pairD(arm, k); return `${d.map((x) => f(x, n)).join(' / ')} · ${f(mean(d), n)}`; };
  const vb = verdict(pairD(arm, 'bPm')), vf = verdict(pairD(arm, 'fdPm')), vp = verdict(pairD(arm, 'popEnd')), vh = verdict(pairD(arm, 'harvPer'));
  VERD[arm] = { b: vb, fd: vf, pop: vp, harv: vh, bR: mean(pairR(arm, 'bPm')), fdR: mean(pairR(arm, 'fdPm')), popR: mean(pairR(arm, 'popEnd')), harvR: mean(pairR(arm, 'harvPer')), emptyD: mean(pairD(arm, 'empty')) };
  L.push(`| ${arm} | ${c('bPm', 3)} | ${vb} | ${c('fdPm', 3)} | ${vf} | ${c('popEnd', 0)} | ${vp} | ${c('harvPer', 3)} | ${vh} | ${c('empty', 2)} |`);
}
L.push('');
L.push('### 호출 0 갈래 확인 — 끔과 같은 판인가 (runHash)');
L.push('');
L.push('| 갈래 | 호출 합 | 시드별 runHash == 끔 | 모든 칸 끔과 같음(끝 인구 · 출생 · 굶음) |');
L.push('|---|---|---|---|');
const zeroG = [];
for (const g of G) {
  const arm = 'only-' + g, c = callsOf(arm, g); if (c !== 0) continue; zeroG.push(g);
  const same = SEEDS.map((s) => HASH[`${arm}-${s}`] && HASH[`off-${s}`] && HASH[`${arm}-${s}`].runHash === HASH[`off-${s}`].runHash);
  const alleq = SEEDS.every((s) => MET[`${arm}-${s}`] && MET[`off-${s}`] && ['popEnd', 'births', 'fd', 'empty'].every((k) => MET[`${arm}-${s}`][k] === MET[`off-${s}`][k]));
  L.push(`| ${g} | ${c} | ${same.map((x) => (x ? '같음' : '다름')).join(' · ')} | ${alleq ? '같음' : '다름'} |`);
}
if (!zeroG.length) L.push('| (호출 0 갈래 없음) | | | |');
SUM.zeroCall = zeroG;
// ---- ② 하나만 끈 판 ----
L.push('');
L.push('## ② 하나만 끈 판 · 따로 켠 합 ↔ 전부 켬 (시드 셋 평균)');
L.push('');
L.push('끈 판 = 일곱 가운데 하나만 끄고 나머지 여섯을 켠 판. 효과 = 끈 쪽이 전부 켠 판에서 얼마를 덜어내나(켬 − 끈).');
L.push('');
L.push('| 판 | ' + KEYS.map((k) => k[1]).join(' | ') + ' |');
L.push('|---|' + KEYS.map(() => '---').join('|') + '|');
for (const arm of ['off', 'on', ...G.map((g) => 'but-' + g)]) L.push(`| ${arm} | ${KEYS.map(([k, , n]) => `${f(k === 'granMed' ? pooledMed(arm) : pooled(arm, k), n)}`).join(' | ')} |`);
L.push('');
L.push('### 갈래마다 · 켬 − 끔 중 이 갈래 몫 (평균 Δ)');
L.push('');
const KM = ['popEnd', 'bPm', 'fdPm', 'empty', 'harvPer'];
L.push('| 갈래 | ' + KM.map((k) => KEYS.find((x) => x[0] === k)[1]).join(' | ') + ' |');
L.push('|---|' + KM.map(() => '---').join('|') + '|');
const sumSingle = {}, onOff = {};
for (const k of KM) { onOff[k] = mean(pairD('on', k)); sumSingle[k] = 0; }
for (const g of G) { L.push(`| 따로 켠 ${g} (only − off) | ${KM.map((k) => { const x = mean(pairD('only-' + g, k)); sumSingle[k] += x; return f(x, KEYS.find((y) => y[0] === k)[2] + 0); }).join(' | ')} |`);
  L.push(`| 하나만 끈 ${g} (on − but) | ${KM.map((k) => { const d = have('but-' + g).map((s) => MET[`on-${s}`] && MET[`but-${g}-${s}`] ? MET[`on-${s}`][k] - MET[`but-${g}-${s}`][k] : null).filter((x) => x != null); return f(mean(d), KEYS.find((y) => y[0] === k)[2] + 0); }).join(' | ')} |`); }
L.push(`| **따로 켠 일곱의 합** | ${KM.map((k) => f(sumSingle[k], KEYS.find((y) => y[0] === k)[2])).join(' | ')} |`);
L.push(`| **전부 켬 − 끔** | ${KM.map((k) => f(onOff[k], KEYS.find((y) => y[0] === k)[2])).join(' | ')} |`);
L.push(`| 겹침(전부 켬 − 합) | ${KM.map((k) => f(onOff[k] - sumSingle[k], KEYS.find((y) => y[0] === k)[2])).join(' | ')} |`);
SUM.sumVsAll = { sumSingle, onOff };
SUM.verd = VERD;

// ---- ③ 곳간을 먹으며 최고 인구 ----
L.push('');
L.push('## ③ 곳간을 먹으며 최고 인구 — 유보 선 ↔ 인구 곡선');
L.push('');
L.push('유보 선 = ref 켬 판은 `_t1419N.d`(그날 물은 마을-날 중앙) · 그 밖 = 종전 30날. 마을 최고 날 곳간 = 마을마다 자기 최고 인구 날 곳간÷사람 중앙. 곳간 0 까지 = 그날부터 곳간÷사람 < 1 (또는 빈) 첫 날까지 며칠(중앙 · 닿은 마을 수 / 마을 수).');
L.push('');
L.push('| 판 | 세계 최고 인구(날) | 그날 곳간 날수(전체) | 마을 최고 날 곳간 날수 중앙 | 마을 최고 → 곳간 0 까지 날 중앙(닿은 마을-판) | 세계 최고 날 → 곳간 0 까지(닿은 마을-판) | 유보 선 중앙 |');
L.push('|---|---|---|---|---|---|---|');
for (const arm of ['off', 'on', ...G.map((g) => 'only-' + g)]) {
  const hs = have(arm); if (!hs.length) continue; const M = hs.map((s) => MET[`${arm}-${s}`]);
  L.push(`| ${arm} | ${M.map((m) => `${ff(m.worldPeak)}(${m.worldPeakDay})`).join(' / ')} | ${M.map((m) => f(m.granAtWorldPeak, 1)).join(' / ')} | ${f(med(M.map((m) => m.granAtVillPk)), 1)} | ${f(med(M.map((m) => m.toZero)), 0)} (${sum(M.map((m) => m.toZeroN))}) | ${f(med(M.map((m) => m.toZeroW)), 0)} (${sum(M.map((m) => m.toZeroWN))}) | ${f(med(M.map((m) => m.lineMed)), 1)} |`);
}
L.push('');
L.push('### 마을 인구 곡선 위치별 유보 선 · 곳간 날수 (마을 최고 인구 대비 · 시드 셋 마을-날 중앙)');
L.push('');
const PH = ['오름 <50 %', '오름 50~90 %', '오름 90~100 %', '내림 100~90 %', '내림 90~50 %', '내림 <50 %'];
L.push('| 판 | 값 | ' + PH.join(' | ') + ' |'); L.push('|---|---|' + PH.map(() => '---').join('|') + '|');
for (const arm of ['off', 'on', 'only-ref']) { const hs = have(arm); if (!hs.length) continue;
  const pl = PH.map((_, k) => med(hs.map((s) => PROF[`${arm}-${s}`][k].line).filter((x) => x != null))), pg = PH.map((_, k) => med(hs.map((s) => PROF[`${arm}-${s}`][k].gr).filter((x) => x != null))), pn = PH.map((_, k) => sum(hs.map((s) => PROF[`${arm}-${s}`][k].n)));
  L.push(`| ${arm} | 유보 선(날) | ${pl.map((x) => f(x, 1)).join(' | ')} |`); L.push(`| ${arm} | 곳간 날수 | ${pg.map((x) => f(x, 1)).join(' | ')} |`); L.push(`| ${arm} | 마을-날 수 | ${pn.map(ff).join(' | ')} |`); }
L.push('');
L.push('### 빈 마을');
L.push('');
const byArm = {}; for (const e of EMPT) (byArm[e.arm] = byArm[e.arm] || []).push(e);
L.push('| 판 | 빈 마을 수(시드 합) | 곳간 0 이 먼저 | 떠남이 먼저 | 같은 날 | 없음 |'); L.push('|---|---|---|---|---|---|');
for (const arm of ARMS) { const e = byArm[arm] || []; L.push(`| ${arm} | ${e.length} | ${e.filter((x) => x.first === '곳간').length} | ${e.filter((x) => x.first === '떠남').length} | ${e.filter((x) => x.first === '같은 날').length} | ${e.filter((x) => x.first === '없음').length} |`); }
L.push('');
L.push('### 빈 마을 마지막 60날 — 켬(on) 판 (오프셋 = 빈 날 기준 · 칸 = 사람 / 곳간÷사람 / 유보 선) · 전체 61날은 `빈마을_60날.csv`');
L.push('');
const OFFS = [-60, -45, -30, -15, -7, -3, -1, 0];
L.push('| 시드 | 마을 | 최고(날) | 곳간0 날 | 첫 떠남 날 | 먼저 | 빈 날 | 굶음 | ' + OFFS.map((x) => `${x}`).join(' | ') + ' |');
L.push('|---|---|---|---|---|---|---|---|' + OFFS.map(() => '---').join('|') + '|');
const rows60 = {}; for (const line of csv60.slice(1)) { const p = line.split(','); if (p[0] !== 'on') continue; rows60[`${p[1]}|${p[2]}|${p[4]}`] = p; }
for (const e of (byArm.on || [])) L.push(`| ${e.seed} | ${e.village} | ${e.peak}(${e.peakDay}) | ${e.stock0Day == null ? '—' : e.stock0Day} | ${e.firstDepartDay == null ? '—' : e.firstDepartDay} | ${e.first} | ${e.emptyDay} | ${e.fd} | ${OFFS.map((x) => { const p = rows60[`${e.seed}|${e.village}|${x}`]; return p ? `${p[6]}/${p[7] || '—'}/${p[8] || '—'}` : '—'; }).join(' | ')} |`);
if (!(byArm.on || []).length) L.push('| (켬 판에 빈 마을 없음) |');
L.push('');
L.push('끔(off) 판의 빈 마을: ' + ((byArm.off || []).length ? (byArm.off || []).map((e) => `${e.seed} ${e.village}`).join(' · ') : '없음') + '.');
SUM.empty = Object.fromEntries(ARMS.map((a) => [a, (byArm[a] || []).length]));

// ---- ④ 장부 틈 ----
L.push('');
L.push('## ④ 장부 틈 쪼개기 (품목 · 달) — 마을 합 · 날치 · 시드 셋 합');
L.push('');
L.push('틈 = 곳간 변화 − (거둠 − 먹음 + 들여옴 − 내보냄 − 썩음), 마을-날-품목마다 낸 뒤 달에 쌓는다. 흐름 = 거둠 + 먹음 + 들여옴 + 내보냄 + |썩음|. 틈 % = 틈 합 ÷ 흐름. 품목 틈 합은 곳간 전체(`fe`) 틈과 다를 수 있다 — 아래 "품목 밖" 줄(`__fe` 변화 − 품목 곳간 변화 합).');
L.push('');
const ledSum = (arm) => { const A = {}; for (const s of have(arm)) { const led = LEDG[`${arm}-${s}`]; for (const m in led) for (const it in led[m]) { const a = (A[m] = A[m] || {}); const t = (a[it] = a[it] || new Array(9).fill(0)); for (let k = 0; k < 9; k++) t[k] += led[m][it][k]; } } return A; };
const ledCsv = ['arm,month,item,harvest,eat,spoil,in,out,dStock,gap,gapAbs,flow'];
const LEDSUM = {};
for (const arm of ['off', 'on', ...G.map((g) => 'only-' + g)]) { const A = ledSum(arm); LEDSUM[arm] = A; for (const m in A) for (const it in A[m]) ledCsv.push([arm, m, it, ...A[m][it].map((x) => x.toFixed(2))].join(',')); }
fs.writeFileSync(path.join(R, '장부_품목월.csv'), ledCsv.join('\n') + '\n');
for (const arm of ['off', 'on']) {
  const A = LEDSUM[arm]; if (!A) continue;
  const items = {}; let tFlow = 0, tGap = 0, tAbs = 0, tDS = 0;
  for (const m in A) for (const it in A[m]) { if (it.indexOf('__') === 0) continue; const t = A[m][it], x = (items[it] = items[it] || new Array(9).fill(0)); for (let k = 0; k < 9; k++) x[k] += t[k]; tFlow += t[8]; tGap += t[6]; tAbs += t[7]; tDS += t[5]; }
  let fe = 0; for (const m in A) if (A[m].__fe) fe += A[m].__fe[5];
  L.push(`### ${arm} — 품목별 (품목 틈 합 ${ff(tGap)} · 흐름 ${ff(tFlow)} · 합계 ${f(100 * tGap / tFlow, 2)} % · 절댓값 ${f(100 * tAbs / tFlow, 2)} % · 품목 곳간 변화 합 ${ff(tDS)} · 곳간 전체 변화 ${ff(fe)} → 품목 밖 ${ff(fe - tDS)})`);
  L.push('');
  L.push('| 품목 | 거둠 | 먹음 | 썩음 | 들여옴 | 내보냄 | 곳간 변화 | 틈 합 | 틈 % (흐름 대비) | 틈 몫 % (전체 틈 중) | 틈 절댓값 % |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  const sorted = Object.keys(items).sort((a, b) => Math.abs(items[b][6]) - Math.abs(items[a][6]));
  for (const it of sorted.slice(0, 14)) { const t = items[it]; L.push(`| ${it} | ${ff(t[0])} | ${ff(t[1])} | ${ff(t[2])} | ${ff(t[3])} | ${ff(t[4])} | ${ff(t[5])} | ${ff(t[6])} | ${f(t[8] ? 100 * t[6] / t[8] : null, 2)} | ${f(tGap ? 100 * t[6] / tGap : null, 1)} | ${f(t[8] ? 100 * t[7] / t[8] : null, 2)} |`); }
  L.push('');
  L.push(`### ${arm} — 달별 (달력 달 1~12 · 모든 품목)`);
  L.push('');
  L.push('| 달 | 흐름 | 틈 합 | 틈 % | 틈 절댓값 % | 틈이 가장 큰 품목(틈 합) |'); L.push('|---|---|---|---|---|---|');
  SUM['ledMonth_' + arm] = {};
  for (let m = 1; m <= 12; m++) { const a = A[m]; if (!a) continue; let fl = 0, g = 0, ab = 0, best = null, bv = 0; for (const it in a) { if (it.indexOf('__') === 0) continue; fl += a[it][8]; g += a[it][6]; ab += a[it][7]; if (Math.abs(a[it][6]) > Math.abs(bv)) { bv = a[it][6]; best = it; } }
    SUM['ledMonth_' + arm][m] = { flow: fl, gap: g, pct: fl ? 100 * g / fl : null };
    L.push(`| ${m} | ${ff(fl)} | ${ff(g)} | ${f(fl ? 100 * g / fl : null, 2)} | ${f(fl ? 100 * ab / fl : null, 2)} | ${best} (${ff(bv)}) |`); }
  L.push('');
  SUM['ledItem_' + arm] = Object.fromEntries(sorted.map((it) => [it, { gap: items[it][6], flow: items[it][8], pct: items[it][8] ? 100 * items[it][6] / items[it][8] : null, share: tGap ? 100 * items[it][6] / tGap : null }]));
  SUM['ledTot_' + arm] = { gap: tGap, flow: tFlow, pct: 100 * tGap / tFlow, abs: 100 * tAbs / tFlow, fe, ds: tDS };
}
L.push('### 판마다 곳간 전체 장부 틈 % (T1488 과 같은 식 — 마을-날, 곳간 `fe` 기준)');
L.push('');
L.push('| 판 | ' + SEEDS.join(' | ') + ' | 평균 |'); L.push('|---|' + SEEDS.map(() => '---').join('|') + '|---|');
for (const arm of ARMS) if (have(arm).length) L.push(`| ${arm} | ${SEEDS.map((s) => (MET[`${arm}-${s}`] ? f(MET[`${arm}-${s}`].gap, 2) : '—')).join(' | ')} | ${f(pooled(arm, 'gap'), 2)} |`);

// ---- ⑤ 관찰기 지문 ----
L.push('');
L.push('## ⑤ 관찰기 없는 판 지문 (runHash · 판 끝 여덟 수)');
L.push('');
L.push('| 판 | 시드 | 관찰기 있음 runHash | 관찰기 없음 runHash | 같음 | 여덟 수 같음 | 초(있음 / 없음) |'); L.push('|---|---|---|---|---|---|---|');
let obsSame = 0, obsN = 0;
for (const arm of ['off', 'on']) for (const s of [1020, 7]) { const a = HASH[`${arm}-${s}`], b = HASH[`noobs-${arm}-${s}`] || HASH[`noobs-${arm}-${s}`]; if (!a || !b) { L.push(`| ${arm} | ${s} | — | — | 자료 없음 | | |`); continue; }
  const same = a.runHash === b.runHash; obsN++; if (same) obsSame++;
  L.push(`| ${arm} | ${s} | ${a.runHash} | ${b.runHash} | ${same ? '같음' : '**다름**'} | ${a.eight === b.eight ? '같음' : '다름'} | ${a.sec} / ${b.sec} |`); }
SUM.obsInvariance = { same: obsSame, n: obsN };

fs.writeFileSync(path.join(R, '표.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(R, '빈마을_60날.csv'), csv60.join('\n') + '\n');
SUM.met = MET; SUM.hash = HASH; SUM.empties = EMPT.length;
fs.writeFileSync(path.join(R, '요약.json'), JSON.stringify(SUM, null, 1));
console.log(`표 ${L.length}줄 · 관찰 판 ${Object.keys(MET).length} · 빈 마을 ${EMPT.length} · 관찰기 지문 ${obsSame}/${obsN}`);
