#!/usr/bin/env node
// === scripts/t1491-table.js — T1491 몫 문 푼 판 · 끈 세계 · 어부 길 · 밤 칸: 관찰기 판 자료 → 표(제품 무변 · 판 자료만 읽는다) ===
// 읽는 것: <R>/done.txt · <R>/runs/obs-<태그>-<시드>.json · <R>/runs/<태그>.json(byseed 지문)
//          <INV>/runs/(무변 판) · <T87>/inv/*-plain.json · <T87>/runs/<팔>-<시드>.json(T1487 기본 판 지문)
// 쓰는 법(인자 넷 다 적는다 — 기본값 없음): node scripts/t1491-table.js <R> <INV> <T87> <OUTDIR>
//   → <OUTDIR>/table.txt · <OUTDIR>/table.json
'use strict';
const fs = require('fs'), path = require('path');
const ARGV = process.argv.slice(2);
if (ARGV.length !== 4 || ARGV.some((a) => a.startsWith('-'))) { console.error('인자 넷: <R> <INV> <T87> <OUTDIR> (기본값 없음)'); process.exit(2); }
const [R, INV, T87, OUTDIR] = ARGV;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const readDone = (d) => { const m = new Map(); try { for (const l of fs.readFileSync(path.join(d, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) m.set(t, { rc: +rc, sec: +sec }); } } catch (e) {} return m; };
const f0 = (x) => x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US');
const f1 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(1), f2 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(2), f3 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(3);
const pc = (a, b) => (b > 0 ? 100 * a / b : null), P = (a, b) => f1(pc(a, b));
const dv = (a, b) => (b > 0 ? a / b : null);
const add = (A, B) => { if (B) for (const k in B) if (typeof B[k] === 'number') A[k] = (A[k] || 0) + B[k]; return A; };
const L = [], J = {};
const done = readDone(R), dinv = readDone(INV);
const PLAN = [['U-1020', 'U', 1020], ['U-2024', 'U', 2024], ['W0-1020', 'W0', 1020], ['W0-2024', 'W0', 2024], ['S-1020', 'S', 1020], ['S-2024', 'S', 2024], ['F-1020', 'F', 1020], ['F-2024', 'F', 2024], ['Sc-1020', 'Sc', 1020]];   // Sc = S-1020 과 같은 판 + 몸 셈(⑨ · ② 에만 쓴다)
const ARMNAME = { U: '나무꾼 · 몫 문+일괄 풂', W0: '나무꾼 · 건너뜀 0', S: '끈 세계(끔)', F: '어부', Sc: '끈 세계(끔) · 몸 셈' };
const T87TAG = { W0: 'wood', S: 'off', F: 'fish' };
const runs = {};
for (const [tag, arm, s] of PLAN) { const o = rd(path.join(R, 'runs', `obs-${tag}-${s}.json`)); if (!o && !done.has(tag)) continue; runs[tag] = { tag, arm, s, o, d: done.get(tag) || null, fp: rd(path.join(R, 'runs', `${tag}.json`)) }; }
const ofArm = (arm) => Object.values(runs).filter((r) => r.arm === arm && r.o);
const aggOf = (rs, key) => { const A = {}; for (const r of rs) add(A, r.o.agg[key]); return A; };
const aggKind = (rs, J1, pred) => { const A = {}; for (const r of rs) for (const k in r.o.agg) { const [j, kind, w] = k.split('|'); if (j !== J1 || kind === '*') continue; if (pred && !pred(kind, w)) continue; add(A, r.o.agg[k]); } return A; };
const glob = (rs, from, to) => { const G = { n: 0, pop: 0, cons: 0, D: 0, woodSt: 0, fuelShort: 0, vd: 0, lj: 0, fi: 0, gran: {} }; for (const r of rs) for (const g of r.o.glob) { if (g.day < from || g.day > to) continue; G.n++; G.pop += g.pop; G.cons += g.consWood; G.D += g.D; G.woodSt += g.woodSt; G.fuelShort += g.fuelShort; G.vd += g.vd; G.lj += g.lj; G.fi += g.fi; add(G.gran, g.gran); } return G; };
L.push('# T1491 몫 문 푼 판 — 표 (관찰기 서버 730날 · 가상 시계 · 제품 코드 손 0)'); L.push('');
// ① 판 상태
L.push('## ① 판 상태');
L.push('| 판 | 팔 | rc | 초 | 마지막 날 | 관찰기 err | 걸개 | 몫 문 건너뜀(번 · 몸-날) | 일괄 건너뜀(번) | 일괄 벰 껍질 = 마을 Dbg.cut | 몸 탐침(예산 없는 A*) | maxRss GB | 730날 인구 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.runs = {};
for (const t in runs) {
  const r = runs[t], o = r.o, g = o && o.glob[o.glob.length - 1];
  const row = { rc: r.d ? r.d.rc : null, sec: r.d ? r.d.sec : null, lastDay: o ? o.lastDay : null, err: o ? o.err : null, skips: o ? o.skips : null, batchHook: o ? o.batchHookCut : null, dbgCut: o ? o.dbg.cut : null, probes: o ? o.chk.probes : null, pop: g ? g.pop : null, maxRss: o ? o.maxRss : null };
  J.runs[t] = row;
  L.push(`| ${t} | ${ARMNAME[r.arm]} | ${row.rc ?? '—'} | ${row.sec ?? '—'} | ${row.lastDay ?? '—'} | ${o ? (o.err || '없음') : '—'} | ${o ? Object.keys(o.hooked).join(' ') : '—'} | ${o ? f0(o.skips.gate) + ' · ' + f0(o.skips.gateBD) : '—'} | ${o ? f0(o.skips.batch) : '—'} | ${o ? f0(o.batchHookCut) + ' = ' + f0(o.dbg.cut) + (o.batchHookCut === o.dbg.cut ? ' 같음' : ' 다름') : '—'} | ${o ? f0(o.chk.probes) + (o.chk.probeCapHit ? ' (상한 걸림 ' + f0(o.chk.probeCapHit) + ')' : '') : '—'} | ${o ? f2(o.maxRss / 1e9) : '—'} | ${row.pop ?? '—'} |`);
}
// ② 무변
L.push(''); L.push('## ② 관찰기 무변 — byseed 지문(관찰기 건너뜀 0 ↔ 관찰기 없는 기본 판)');
L.push('| 판(관찰기) | 견준 기본 판 | 날 | 같다 | runHash |'); L.push('|---|---|---|---|---|');
J.inv = [];
const same = (a, b) => a && b && JSON.stringify(a.byseed) === JSON.stringify(b.byseed);
const rh = (x) => x ? Object.values(x.byseed).map((y) => y.runHash).join(',') : '—';
for (const [it, pl, note] of [['i-off30', 'inv/off-plain', ''], ['i-wood30', 'inv/wood-plain', ''], ['i-f70', 'inv/f70-plain', ''], ['i-w150', 'inv/w150-plain', ''], ['i-u150', 'inv/w150-plain', '(건너뜀 all — 달라야 한다)'], ['i-off30c', 'inv/off-plain', '(몸 셈 넣은 관찰기)'], ['i-wood30c', 'inv/wood-plain', '(몸 셈 넣은 관찰기)']]) {
  const a = rd(path.join(INV, 'runs', `${it}.json`)), b = rd(path.join(T87, `${pl}.json`)), s = same(a, b);
  J.inv.push({ it, pl, same: !!s, days: a && a.days, rh: rh(a), rc: dinv.get(it) ? dinv.get(it).rc : null });
  L.push(`| ${it} ${note} | T1487 ${pl} | ${a ? a.days : '—'} | ${a && b ? (s ? '같다' : '다르다') : '자료 없음'} | ${rh(a)} |`);
}
for (const t in runs) {
  const r = runs[t]; if (!T87TAG[r.arm]) continue; const b = rd(path.join(T87, 'runs', `${T87TAG[r.arm]}-${r.s}.json`)); if (!b) continue;
  const s = same(r.fp, b); J.inv.push({ it: t, pl: `runs/${T87TAG[r.arm]}-${r.s}`, same: !!s, days: r.fp && r.fp.days, rh: rh(r.fp) });
  L.push(`| ${t} (730날 · 건너뜀 0) | T1487 runs/${T87TAG[r.arm]}-${r.s}(T1487 관찰기 판) | ${r.fp ? r.fp.days : '—'} | ${r.fp ? (s ? '같다' : '다르다') : '자료 없음'} | ${rh(r.fp)} |`);
}
if (runs['Sc-1020'] && runs['S-1020']) { const a1 = runs['Sc-1020'].fp, b1 = runs['S-1020'].fp, s1 = same(a1, b1); J.inv.push({ it: 'Sc-1020', pl: 'S-1020', same: !!s1, days: a1 && a1.days, rh: rh(a1) });
  L.push(`| Sc-1020 (730날 · 몸 셈 넣은 관찰기) | 이 카드 S-1020(몸 셈 전 관찰기) | ${a1 ? a1.days : '—'} | ${a1 && b1 ? (s1 ? '같다' : '다르다') : '자료 없음'} | ${rh(a1)} |`); }
// ③ 깔때기
const FUN = (A) => ({ bd: A.bd || 0, out: A.outA || 0, site: A.siteA || 0, reach: A.reachA || 0, cut: A.cut || 0, carry: A.carry || 0, gran: A.granAny || 0,
  cutU: A.cutU || 0, dG: A.dG || 0, dBG: A.dBG || 0, arr: A.arrS || 0, dlvN: A.dlvN || 0, st: A.st || 0, stD: A.stD || 0, mv: A.mv || 0, sd0: A.sd0 || 0, sd0n: A.sd0n || 0, sdmin: A.sdmin || 0, reach87: A.reach || 0, gH: A.gHit || 0, gL: A.gL || 0 });
L.push(''); L.push('## ③ 몸-날 깔때기 — 나섬 → 자리 → 닿음 → 벰 → 들고 옴 → 곳간');
L.push('나섬 = 그날 일 라벨(출근 · 벌목 · 낚시 …)이 생활 틱이나 걸음 틱에 한 번이라도 · 자리 = 현장 좌표가 있다 · 닿음 = **걸음 틱**에 현장 반경(나무꾼 44 / 옛 현장 240 · 어부 130 px) 안 · 벰 = 몸 틱 `t325CutTreeAt` 성공 · 들고 옴 = 몸 틱 안 `_t325Deliver` 에 손 통나무 · 곳간 = 그 몸이 곳간에 넣은 양 > 0(경계 정산 포함).');
L.push('| 판 | 몸 | 몸-날 | 나섬 % | 자리 % | 닿음 % | 벰 % | 들고 옴 % | 곳간 % | 한 몸-날 벤 양 | 한 몸-날 곳간 든 양 | 한 몸-날 현장 도착 | 한 몸-날 곳간 짐 | 걸음 틱/몸-날 | 낮 걸음 틱/몸-날 | 걸은 px/몸-날 | 현장 첫 거리 px | (T1487 생활 틱 자) 닿음 % |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.funnel = {};
for (const arm of ['U', 'W0', 'S', 'F']) for (const s of [1020, 2024, 0]) {
  const rs = ofArm(arm).filter((r) => !s || r.s === s); if (!rs.length) continue;
  for (const j of (arm === 'F' ? ['F', 'L'] : ['L', 'F'])) {
    const F = FUN(aggOf(rs, j + '|*|*')); if (!F.bd) continue; const k = `${arm}-${s || '합'}-${j}`; J.funnel[k] = F;
    L.push(`| ${arm}-${s || '합'} | ${j === 'L' ? '나무꾼' : '어부'} | ${f0(F.bd)} | ${P(F.out, F.bd)} | ${P(F.site, F.bd)} | ${P(F.reach, F.bd)} | ${P(F.cut, F.bd)} | ${P(F.carry, F.bd)} | ${P(F.gran, F.bd)} | ${f3(dv(F.cutU, F.bd))} | ${f3(dv(F.dG + F.dBG, F.bd))} | ${f3(dv(F.arr, F.bd))} | ${f3(dv(F.dlvN, F.bd))} | ${f2(dv(F.st, F.bd))} | ${f2(dv(F.stD, F.bd))} | ${f1(dv(F.mv, F.bd))} | ${f0(dv(F.sd0, F.sd0n))} | ${P(F.reach87, F.bd)} |`);
  }
}
// 필요 · 버팀
L.push(''); L.push('### 한 몸-날 벤 양 ↔ 사람당 하루 땔감 필요');
L.push('필요 = 곳간 일일 땔감 소비(`_consDay.wood`) ÷ 사람(T1487 과 같은 자) — 소비는 곳간 통나무에 묶이므로 **아래 끝(하한)** 이다 · 몫 D = `woodShareD`(몫 문 분자) ÷ 사람 · 버팀 = 한 몸-날 벤 양 ÷ 필요.');
L.push('U 판은 곳간 통나무가 0 이라 소비도 0 으로 떨어진다(필요가 아니라 못 쓴 것) ⇒ U 의 버팀은 **같은 시드 W0 판 730날 필요**로 나눈다(괄호 = 제 판 소비로 나눈 값 · 참고만).');
L.push('| 판 | 날 | 사람-날 | 필요(소비/사람) | 몫 D/사람 | 나무꾼 몸-날 | 한 몸-날 벤 양 | 버팀(W0 필요) | 곳간 통나무 마을 평균 | 땔감 모자란 마을-날 % | 곳간 든 양(맥락별 · 판 합) |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
J.need = {};
const needW0 = {}; for (const r of ofArm('W0')) { const G = glob([r], 1, 730); needW0[r.s] = dv(G.cons, G.pop); }
for (const t in runs) {
  const r = runs[t]; if (!r.o || r.arm === 'Sc') continue;
  for (const [a, b] of [[1, 730], [1, 380], [381, 730]]) {
    const G = glob([r], a, b), F = FUN(aggOf([r], 'L|*|*')), need = dv(G.cons, G.pop), cut = dv(F.cutU, F.bd);
    const gr = Object.entries(G.gran).filter(([k]) => k.endsWith('G')).map(([k, v]) => `${k.replace(/G$/, '')} ${f0(v)}`).join(' · ');
    const nW = needW0[r.s], holdW = nW ? (cut || 0) / nW : null;
    J.need[`${t}|${a}-${b}`] = { need, needW0: nW, Dpp: dv(G.D, G.pop), cut, hold: need ? (cut || 0) / need : null, holdW0: holdW, woodSt: dv(G.woodSt, G.vd), short: pc(G.fuelShort, G.vd), gran: G.gran };
    L.push(`| ${t} | ${a}–${b} | ${f0(G.pop)} | ${f3(need)} | ${f3(dv(G.D, G.pop))} | ${a === 1 && b === 730 ? f0(F.bd) : '(판 전체)'} | ${a === 1 && b === 730 ? f3(cut) : ''} | ${a === 1 && b === 730 ? `${f2(holdW)} (${f2(need ? (cut || 0) / need : null)})` : ''} | ${f1(dv(G.woodSt, G.vd))} | ${P(G.fuelShort, G.vd)} | ${gr || '0'} |`);
  }
}
// 판 경과(100날) — U ↔ W0
L.push(''); L.push('### 100날마다 — 인구 · 곳간 통나무 · 땔감 모자람 · 나무꾼 수(econ) · 나무꾼 몸-날(존)');
L.push('| 판 | 날 | 인구(끝날) | 곳간 통나무 마을 평균 | 땔감 모자란 마을-날 % | 소비/사람 | econ 나무꾼 하루 평균 | 존 나무꾼 몸-날 | 닿음 % | 벤 양 합 |'); L.push('|---|---|---|---|---|---|---|---|---|---|');
J.prog = {};
for (const t in runs) {
  const r = runs[t]; if (!r.o || !(r.arm === 'U' || r.arm === 'W0')) continue;
  for (let a = 1; a <= 730; a += 100) {
    const b = Math.min(730, a + 99), G = glob([r], a, b), last = r.o.glob.filter((g) => g.day <= b).pop();
    const B = {}; for (let bi = Math.floor((a - 1) / 50); bi <= Math.floor((b - 1) / 50); bi++) add(B, r.o.bins['L|' + bi]);
    J.prog[`${t}|${a}`] = { pop: last && last.pop, woodSt: dv(G.woodSt, G.vd), short: pc(G.fuelShort, G.vd), lj: dv(G.lj, G.n), bd: B.bd || 0, reach: pc(B.reachA || 0, B.bd || 0), cutU: B.cutU || 0 };
    L.push(`| ${t} | ${a}–${b} | ${last ? f0(last.pop) : '—'} | ${f1(dv(G.woodSt, G.vd))} | ${P(G.fuelShort, G.vd)} | ${f3(dv(G.cons, G.pop))} | ${f1(dv(G.lj, G.n))} | ${f0(B.bd || 0)} | ${P(B.reachA || 0, B.bd || 0)} | ${f2(B.cutU || 0)} |`);
  }
}
// ④ 다음 문
const GATE_KO = { noTerr: '영토 없음', rest: '요양', nightOnly: '밤 틱만(낮 생활 · 걸음 틱 0)', gate: '몫 문(안 풀림)', noForest: '숲 후보 0(우주 못 잼)', noForest_own: '숲 후보 0 — 영토 안에만 나무(16639 가 뺌)', noForest_nb: '숲 후보 0 — 이웃 영토에만', noForest_ring: '숲 후보 0 — 고리에 있는데 후보 0', noForest_far: '숲 후보 0 — 먼 고리에만', noForest_none: '숲 후보 0 — 숲 전무',
  none: '설 칸 없음(현장 none · `_t561Standing` null)', other: '다른 일 라벨', restHome: '휴식 귀가(몫 문 밖)', legacy: '레거시 폴스루(생활 틱 거짓)', idle: '그 밖', slow: '걷는 중(10 % 넘게 줄임 · 하루 안 못 닿음)', stuck: '나섰는데 거리 못 줄임(길 요청 null 0)' };
const gk = (k) => GATE_KO[k] || (k.startsWith('path_') ? '길 없음 — ' + k.slice(5) : k);
function gateTable(title, rs, J1) {
  L.push(''); L.push(title);
  const kinds = ['*', '농촌', '어촌', '광산', '임업'], rows = {}, tot = {};
  for (const kd of kinds) { const A = kd === '*' ? aggOf(rs, J1 + '|*|*') : aggKind(rs, J1, (k) => k === kd); tot[kd] = 0; for (const k in A) if (k.startsWith('g_')) { (rows[k.slice(2)] = rows[k.slice(2)] || {})[kd] = A[k]; tot[kd] += A[k]; } }
  L.push('| 까닭(차례 = 우선) | 전체 % (몸-날) | 농촌 % | 어촌 % | 광산 % | 임업 % |'); L.push('|---|---|---|---|---|---|');
  const order = Object.keys(rows).sort((a, b) => (rows[b]['*'] || 0) - (rows[a]['*'] || 0));
  for (const k of order) L.push(`| ${gk(k)} | ${P(rows[k]['*'] || 0, tot['*'])} (${f0(rows[k]['*'] || 0)}) | ${P(rows[k]['농촌'] || 0, tot['농촌'])} | ${P(rows[k]['어촌'] || 0, tot['어촌'])} | ${P(rows[k]['광산'] || 0, tot['광산'])} | ${P(rows[k]['임업'] || 0, tot['임업'])} |`);
  L.push(`| 못 닿은 몸-날 합 | ${f0(tot['*'])} | ${f0(tot['농촌'])} | ${f0(tot['어촌'])} | ${f0(tot['광산'])} | ${f0(tot['임업'])} |`);
  return { rows, tot, order };
}
J.gateU = gateTable('## ④ 풀고 나면 다음 문 — 몫 문 푼 판(U) 나무꾼 못 닿은 몸-날의 첫 까닭(마을 꼴별)', ofArm('U'), 'L');
J.gateW0 = gateTable('### 견줌: 건너뜀 0 판(W0) 나무꾼', ofArm('W0'), 'L');
L.push(''); L.push('### 겨울 ↔ 겨울 밖(U · 나무꾼 · 못 닿은 몸-날 까닭 첫 셋)');
J.win = {};
for (const w of ['1', '0']) { const A = aggKind(ofArm('U'), 'L', (k, ww) => ww === w), t = Object.entries(A).filter(([k]) => k.startsWith('g_')), T = t.reduce((x, [, v]) => x + v, 0); t.sort((a, b) => b[1] - a[1]); J.win[w] = { bd: A.bd || 0, reach: A.reachA || 0, top: t.slice(0, 3) };
  L.push(`- ${w === '1' ? '겨울' : '겨울 밖'}: 몸-날 ${f0(A.bd || 0)} · 닿음 ${P(A.reachA || 0, A.bd || 0)} % · ${t.slice(0, 3).map(([k, v]) => `${gk(k.slice(2))} ${P(v, T)} %`).join(' · ') || '—'}`); }
// ⑤ 끈 세계
L.push(''); L.push('## ⑤ 끈 세계 나무꾼 — 직접 잰 길(S 판)');
J.string = {};
for (const r of ofArm('S')) {
  const A = aggOf([r], 'L|*|*'), F = FUN(A), ks = Object.entries(A).filter(([k]) => k.startsWith('k_')), ks87 = Object.entries(A).filter(([k]) => k.startsWith('c_')), KT = ks.reduce((x, [, v]) => x + v, 0), K87 = ks87.reduce((x, [, v]) => x + v, 0);
  const g = r.o.gather.lumberjack || {}, gr = r.o.gran;
  J.string[r.tag] = { F, k: Object.fromEntries(ks), c87: Object.fromEntries(ks87), gather: g, gran: gr, np87: Object.fromEntries(Object.entries(A).filter(([k]) => k.startsWith('np87_'))) };
  L.push(`- ${r.tag}: 몸-날 ${f0(F.bd)} · 나섬 ${P(F.out, F.bd)} % (T1487 자 생활 틱 '나섬' ${P(A.out || 0, F.bd)} %) · 자리 ${P(F.site, F.bd)} % · **닿음(걸음 틱) ${P(F.reach, F.bd)} %** · 벰(t325) ${P(F.cut, F.bd)} % · 존 줍기(레거시 \`_npcGatherResource\`) 친 몸-날 ${P(F.gH, F.bd)} % · 주운 통나무 ${f2(F.gL)} · 곳간 든 몸-날 ${P(F.gran, F.bd)} %`);
  L.push(`  - 걸음 틱/몸-날 ${f2(dv(F.st, F.bd))} · 걸은 px/몸-날 ${f1(dv(F.mv, F.bd))} · 현장 첫 거리 ${f0(dv(F.sd0, F.sd0n))} px · 줄인 거리 합 ${f0(F.sd0 - F.sdmin)} px`);
  L.push(`  - 못 닿음 분류(걸음 틱 자): ${ks.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(2)} ${P(v, KT)} %`).join(' · ')}`);
  L.push(`  - T1487 생활 틱 '길없음' 몸-날의 걸음 틱 결과: ${Object.entries(J.string[r.tag].np87).map(([k, v]) => `${k.slice(5)} ${f0(v)}`).join(' · ') || '—'}`);
  L.push(`  - 곳간 든 양(woodToGranary 맥락 · 판 합): ${Object.entries(gr).map(([k, v]) => `${k} ${v.u !== undefined ? f1(v.g) + '/' + f1(v.u) : JSON.stringify(v)}`).join(' · ') || '0(이 팔은 `woodToGranary` 가 0 을 돌려준다 · 곳간은 공식)'}`);
}
// ⑥ 어부 길
L.push(''); L.push('## ⑥ 어부 "길 없음" — 걸음 틱으로 다시 잰다(F 판)');
J.fish = {};
const prKO = { tgt: '목표 칸 막힘(T381)', g_unreach: '문 그래프 못 닿음', g_blocked: '문 그래프 막힘', g_far: '문 그래프 멀다', rad: '반경 64 칸 밖', exh: 'A* 예산(1500) 다 씀', wait: '문 그래프 표 기다림(T1138)', cool: 'A* 쿨다운', other: '그 밖' };
for (const arm of ['F', 'U', 'W0', 'S']) {
  const rs = ofArm(arm); if (!rs.length) continue; const A = aggOf(rs, 'F|*|*'); if (!A.bd) continue; const F = FUN(A);
  const np = A.c_nopath || 0, np87 = Object.entries(A).filter(([k]) => k.startsWith('np87_')), pr = Object.entries(A).filter(([k]) => k.startsWith('pr0_')), prT = pr.reduce((x, [, v]) => x + v, 0);
  const PR = {}; for (const r of rs) add(PR, r.o.probe['F|nopath']); const PA = {}; for (const r of rs) for (const k in r.o.probe) if (k.startsWith('F|')) add(PA, r.o.probe[k]);
  J.fish[arm] = { bd: F.bd, out: F.out, nopath87: np, np87: Object.fromEntries(np87), pn: A.pnBD || 0, pr0: Object.fromEntries(pr), probe: PA, steps: F.st, stD: F.stD, mv: F.mv, sd0: dv(F.sd0, F.sd0n), reach: F.reach };
  L.push(`### ${arm} 판(시드 ${rs.map((r) => r.s).join(' · ')}) 어부`);
  L.push(`- 몸-날 ${f0(F.bd)} · 나섬 ${P(F.out, F.bd)} % · T1487 자 '길없음'(생활 틱 · 첫 거리 10 % 못 줄임) ${P(np, F.bd)} % · 닿음(걸음 틱) ${P(F.reach, F.bd)} % · 걸음 틱/몸-날 ${f2(dv(F.st, F.bd))} · 걸은 px/몸-날 ${f1(dv(F.mv, F.bd))} · 물가 현장 첫 거리 ${f0(dv(F.sd0, F.sd0n))} px`);
  L.push(`- '길없음' 몸-날의 걸음 틱 결과: ${np87.map(([k, v]) => `${k.slice(5)} ${P(v, np)} %`).join(' · ') || '—'} (still = 걸음 틱이 있었고 거리 10 % 못 줄임 · noStep = 걸음 틱 0 · moved = 10 % 넘게 줄임)`);
  L.push(`- 길 요청이 null 을 돌려준 몸-날 ${f0(A.pnBD || 0)} (${P(A.pnBD || 0, F.bd)} % 몸-날) · 그 첫 까닭: ${pr.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${prKO[k.slice(4)] || k.slice(4)} ${P(v, prT)} %`).join(' · ') || '—'}`);
  if (PA.n) {
    L.push(`- 곁 탐침(길 null 첫 번 · ${f0(PA.n)} 몸-날): 직선 거리 평균 ${f0(dv(PA.d, PA.n))} px · 맨해튼 칸 평균 ${f0(dv(PA.md, PA.n))} · 반경 64칸 넘음 ${P(PA.mdOver || 0, PA.n)} %`);
    L.push(`  - 직선 위 첫 막힘: ${Object.entries(PA).filter(([k]) => k.startsWith('first_')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(6)} ${P(v, PA.n)} %`).join(' · ')} · 선 위에 있음: 바위(산) ${P(PA.hasRock || 0, PA.n)} · 물 ${P(PA.hasWater || 0, PA.n)} · 남의 땅 ${P(PA.hasOther || 0, PA.n)} · 도랑 ${P(PA.hasDitch || 0, PA.n)} · 판 밖 ${P(PA.hasOut || 0, PA.n)} · 다리 ${P(PA.hasBridge || 0, PA.n)} %`);
    L.push(`  - 예산 없는 A*(같은 반경 · 같은 술어): ${Object.entries(PA).filter(([k]) => k.startsWith('unl_')).map(([k, v]) => `${k.slice(4)} ${f0(v)}`).join(' · ') || '—'}`);
    L.push(`  - 거리 칸(<256 · <512 · <1024 · <2048 · ≥2048 px): ${[0, 1, 2, 3, 4].map((i) => f0(PA['dbin_' + i] || 0)).join(' · ')}`);
  } else L.push('- 곁 탐침 0 — 길 요청이 null 인 몸-날이 없다');
}
// ⑦ 밤 칸
L.push(''); L.push('## ⑦ 밤 칸(T1487 생활 틱 자 \'밤\') — 누가 · 어느 시각');
J.night = {};
for (const arm of ['W0', 'U', 'F', 'S']) {
  const rs = ofArm(arm); if (!rs.length) continue;
  for (const j of ['L', 'F']) {
    const N = {}; for (const r of rs) for (const k in r.o.night) if (k.startsWith(j + '|')) add(N, r.o.night[k]);
    const A = aggOf(rs, j + '|*|*'); if (!N.n) continue;
    const byKind = {}; for (const r of rs) for (const k in r.o.night) if (k.startsWith(j + '|')) byKind[k.split('|')[1]] = (byKind[k.split('|')[1]] || 0) + r.o.night[k].n;
    const fh = []; for (let i = 0; i < 24; i++) fh.push(N['fh' + i] || 0); const fhT = fh.reduce((a, b) => a + b, 0);
    const f0h = []; for (let i = 0; i < 24; i++) f0h.push(N['f0_' + i] || 0);
    const lon = Object.entries(N).filter(([k]) => k.startsWith('lon_')).sort((a, b) => b[1] - a[1]).slice(0, 4);
    J.night[`${arm}|${j}`] = { n: N.n, bd: A.bd, split: Object.fromEntries(Object.entries(N).filter(([k]) => k.startsWith('s_'))), noDayStep: N.noDayStep || 0, outS: N.outS || 0, reachS: N.reachS || 0, fh, byKind, gh: Object.fromEntries(Object.entries(N).filter(([k]) => k.startsWith('gh_'))) };
    L.push(`- ${arm} ${j === 'L' ? '나무꾼' : '어부'}: 밤 몸-날 ${f0(N.n)} (${P(N.n, A.bd)} % 몸-날) · 그날 낮 걸음 틱 0 ${P(N.noDayStep || 0, N.n)} % · 그날 걸음 틱에 일 라벨 ${P(N.outS || 0, N.n)} % · 닿음 ${P(N.reachS || 0, N.n)} %`);
    L.push(`  - 가름: ${Object.entries(N).filter(([k]) => k.startsWith('s_')).map(([k, v]) => `${k.slice(2)} ${P(v, N.n)} %`).join(' · ')} · 꼴: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${P(v, N.n)} %`).join(' · ')}`);
    L.push(`  - 귀가 부름(_lifeGoHome 행동): ${Object.entries(N).filter(([k]) => k.startsWith('gh_')).map(([k, v]) => `${k.slice(3)} ${f0(v)}`).join(' · ') || '—'} · 생활 틱 수 ${f0(N.tk)} (밤 ${f0(N.nk)} · 낮 ${f0(N.dk)})`);
    L.push(`  - 생활 틱의 하루 몫 시각(fv × 24 시 · 틱 수): ${fh.map((v, i) => v ? `${i}시 ${P(v, fhT)} %` : null).filter(Boolean).join(' · ')}`);
    L.push(`  - 그날 첫 생활 틱 시각: ${f0h.map((v, i) => v ? `${i}시 ${f0(v)}` : null).filter(Boolean).join(' · ')} · 경도 몫(×24 시): ${lon.map(([k, v]) => `${k.slice(4)} ${f0(v)}`).join(' · ')}`);
  }
}
L.push(''); L.push('### W0-1020 · U-1020 50날마다 나무꾼 몸-날 · 닿음 · 밤 칸(380날 뒤 넓힘)');
L.push('| 판 | 날 | 나무꾼 몸-날 | 나섬 % | 닿음 % | 밤(T1487 자) % | 낮 걸음 틱 0 % | 몫 문 참 몸-날 % | 벤 양 |'); L.push('|---|---|---|---|---|---|---|---|---|');
J.bins = {};
for (const t of ['W0-1020', 'U-1020']) { const r = runs[t]; if (!r || !r.o) continue; for (let bi = 0; bi < 15; bi++) { const B = r.o.bins['L|' + bi]; if (!B || !B.bd) continue; J.bins[`${t}|${bi}`] = B;
  L.push(`| ${t} | ${bi * 50 + 1}–${Math.min(730, bi * 50 + 50)} | ${f0(B.bd)} | ${P(B.outA || 0, B.bd)} | ${P(B.reachA || 0, B.bd)} | ${P(B.c_night || 0, B.bd)} | ${P(B.g_nightOnly || 0, B.bd)} | ${P(B.gateBD || 0, B.bd)} | ${f2(B.cutU || 0)} |`); } }
// ⑧ 코너
L.push(''); L.push('## ⑧ 코너 케이스');
J.corner = {};
for (const t in runs) {
  const r = runs[t], o = r.o; if (!o || r.arm === 'Sc') continue;
  const A = aggOf([r], 'L|*|*'), dup = Object.entries(o.dup || {}), gd = o.gran.deliver || {};
  const over = Object.entries(o.gran).filter(([k, v]) => v && v.u !== undefined && v.u - v.g > 1e-6).map(([k, v]) => `${k} ${f1(v.u - v.g)}/${f1(v.u)}`);
  J.corner[t] = { noTerrBD: A.noTerr || 0, tr0: A.tr0 || 0, trSeen: A.trSeen || 0, dup: o.dup, rep: o.rep, deliverOver: { n: gd.overN || 0, u: gd.overU || 0 }, over, cut: o.cut, gateTrueOther: o.skips.gateTrueOther };
  L.push(`- ${t}: 영토 없는 몸-날 ${f0(A.noTerr || 0)} · 숲 후보 0 몸-날 ${f0(A.tr0 || 0)}/${f0(A.trSeen || 0)} · 같은 날 같은 그루 두 번 벰 ${dup.length ? dup.map(([k, v]) => `${k} ${f0(v)}`).join(' · ') : '0'} · 다른 날 같은 그루 다시 벰(다시 자람) ${f0(o.rep.n)}번(평균 간격 ${f1(dv(o.rep.gapSum, o.rep.n))}날) · 곳간 못 든 양(넘침 · 맥락별 못 듦/낸 양) ${over.join(' · ') || '0'} · 벰 맥락 ${Object.entries(o.cut).map(([k, v]) => `${k} ${f0(v.n)}번 ${f0(v.u)}`).join(' · ') || '0'}`);
}
// ⑨ 몸 셈(census · 하루 첫머리 한 번 · 살아 있는 나무꾼 · 어부 몸)
L.push(''); L.push('## ⑨ 몸 셈 — 하루 첫머리에 나무꾼 · 어부 몸이 활성 칸에 있나 · 늘 걷기(T316)인가 · 결정 · 걸음 건너뜀(얼음) 조건인가');
L.push('| 판 | 일 | 몸-날(셈) | 활성 칸 % | 늘 걷기 % | 얼음(활성 아님 · 늘 걷기 아님 · 캐나다 아님) % | 그날 틱 본 몸-날 % | 얼음인데 틱 본 % | 캐나다 마을 % |'); L.push('|---|---|---|---|---|---|---|---|---|');
J.census = {};
for (const t in runs) { const o = runs[t].o; if (!o || !o.cen) continue; for (const j of ['L', 'F']) { const c = o.cen[j + '|*']; if (!c || !c.nd) continue; J.census[`${t}|${j}`] = { all: c, bins: Object.fromEntries(Object.entries(o.cen).filter(([k]) => k.startsWith(j + '|') && k !== j + '|*')) };
  L.push(`| ${t} | ${j === 'L' ? '나무꾼' : '어부'} | ${f0(c.nd)} | ${P(c.act, c.nd)} | ${P(c.wa, c.nd)} | ${P(c.frozen, c.nd)} | ${P(c.seen, c.nd)} | ${P(c.seenFrozen, c.frozen)} | ${P(c.cv, c.nd)} |`); } }
if (!Object.keys(J.census).length) L.push('| — | — | 계측 없음(이 판들은 몸 셈 넣기 전 관찰기) | | | | | | |');
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'table.txt'), L.join('\n') + '\n');
fs.writeFileSync(path.join(OUTDIR, 'table.json'), JSON.stringify(J, null, 1));
console.log(`표 ${L.length}줄 → ${path.join(OUTDIR, 'table.txt')}`);
