#!/usr/bin/env node
// === scripts/t1487-table.js — T1487 갈 자리 없음 깔때기: 관찰기 판 자료 → 표(제품 무변 · 판 자료만 읽는다) ===
// 읽는 것: $R/done.txt · $R/runs/obs-<팔>-<시드>.json(계측/T1487_2026-11-25/t1487-observe.js) · $R/runs/<팔>-<시드>.out
// 쓰는 법: R=<판 자료 폴더> OUTDIR=<표 폴더> node scripts/t1487-table.js
'use strict';
const fs = require('fs'), path = require('path');
const R = process.env.R || '/home/user/t1487/run', OUTDIR = process.env.OUTDIR || path.join(__dirname, '..', '계측', 'T1487_2026-11-25');
const ARMS = [['off', '끔'], ['wood', '나무꾼'], ['fish', '어부']], SEEDS = (process.env.SEEDS || '1020,7').split(',').map(Number);
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const done = new Map(); try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const f0 = (x) => x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'), f1 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(1), f2 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(2), f3 = (x) => x == null || !isFinite(x) ? '—' : x.toFixed(3);
const pc = (a, b) => b > 0 ? 100 * a / b : null;
const runs = {};
for (const [arm] of ARMS) for (const s of SEEDS) { const tag = `${arm}-${s}`; runs[tag] = { arm, seed: s, o: rd(path.join(R, 'runs', `obs-${tag}.json`)), d: done.get(tag) || null, out: (() => { try { return fs.readFileSync(path.join(R, 'runs', `${tag}.out`), 'utf8'); } catch (e) { return ''; } })() }; }
const L = [], J = {};
const FIx = (o) => { const I = {}; o.F.forEach((k, i) => { I[k] = i; }); return I; };
const KINDS = ['농촌', '어촌', '광산', '임업'];
const kindOf = (o, v) => (o.kind && o.kind[v]) || '?';
// 한 판 · 조건(마을 · 구간) 맞는 vb 합
function vsum(o, vf, bf) { const I = FIx(o), T = new Array(o.F.length).fill(0); for (const v in o.vb) { if (vf && !vf(v)) continue; for (const b in o.vb[v]) { if (bf && !bf(+b)) continue; const x = o.vb[v][b]; for (let i = 0; i < x.length; i++) T[i] += x[i]; } } return { I, T }; }
const armRuns = (arm) => SEEDS.map((s) => runs[`${arm}-${s}`]).filter((r) => r.o);
function pkSum(o, vf, tbl, binf) { const T = {}; const src = o[tbl] || {}; for (const v in src) { if (vf && !vf(v)) continue; for (const b in src[v]) { if (binf && !binf(+b)) continue; for (const k in src[v][b]) T[k] = (T[k] || 0) + src[v][b][k]; } } return T; }
const add = (A, B) => { for (const k in B) A[k] = (A[k] || 0) + B[k]; return A; };
L.push('# T1487 갈 자리 없음 — 깔때기 표 (관찰기 서버 730날 · 가상 시계 · 시드 ' + SEEDS.join(' · ') + ' · 제품 코드 손 0)'); L.push('');
// ① 판 상태
L.push('## ① 판 상태'); L.push('| 판 | rc | 초 | 마지막 날 | 관찰기 err | 걸개 적재 | 고리 스캔 대조(같음/다름) | 730날 인구 |'); L.push('|---|---|---|---|---|---|---|---|');
J.runs = {};
for (const tag in runs) { const r = runs[tag], o = r.o, g = o && o.glob[o.glob.length - 1]; L.push(`| ${tag} | ${r.d ? r.d.rc : '—'} | ${r.d ? r.d.sec : '—'} | ${o ? o.lastDay : '—'} | ${o ? (o.err || '없음') : '—'} | ${o ? o.hooked : '—'} | ${o ? o.chk.ok + '/' + o.chk.bad : '—'} | ${g ? f0(g.pop) : '—'} |`); J.runs[tag] = { rc: r.d && r.d.rc, sec: r.d && r.d.sec, lastDay: o && o.lastDay, err: o && o.err, chk: o && o.chk }; }
// ② 나무 우주 — 마을 꼴별(켠 나무꾼 팔 · 100날마다 잰 값 · 마을-표본)
L.push(''); L.push('## ② 나무 우주(마을 꼴별 · 100날마다 잰 마을-표본 평균 · 나무꾼 팔)');
L.push('영토 안 = 자기 영토 셀(후보 아님 · 제품이 빼는 곳) · 이웃 = 남의 영토 안 R=16칸 이내(뺀다) · 고리 = 영토 밖 16칸 이내 · 남의 영토 아닌 셀(**제품의 후보 셀**) · 먼 고리 = 17~32칸. 칸 = 나무가 선 셀 수 · 그루 = 나무 수.');
L.push('| 꼴 | 마을-표본 | 영토 안 그루 | 영토 안 칸 | 이웃 영토 그루(≤R) | 고리 그루 | 고리 칸(후보) | 먼 고리 그루 | 고리 0칸 표본 % | 숲 전무(영토·이웃·고리·먼고리 0) % | 숲이 영토 안에만 % | 숲이 영토 밖에만(고리·이웃·먼) % |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
J.univ = {};
const uagg = (rs, vf) => { const A = { n: 0, ownT: 0, ownC: 0, nbT: 0, ringT: 0, ringC: 0, farT: 0, ring0: 0, none: 0, ownOnly: 0, outOnly: 0, noTerr: 0 };
  for (const r of rs) for (const v in r.o.univ) { if (vf && !vf(r.o, v)) continue; for (const d in r.o.univ[v]) { const u = r.o.univ[v][d]; A.n++; A.ownT += u.own.t; A.ownC += u.own.c; A.nbT += u.nbR.t; A.ringT += u.ring.t; A.ringC += u.ring.c; A.farT += u.far.t; if (u.ring.c === 0) A.ring0++; if (u.noTerr) A.noTerr++;
    const out = u.nbR.t + u.ring.t + u.far.t; if (u.own.t === 0 && out === 0) A.none++; else if (u.own.t > 0 && out === 0) A.ownOnly++; else if (u.own.t === 0 && out > 0) A.outOnly++; } } return A; };
const wr = armRuns('wood'), orr = armRuns('off'), fr = armRuns('fish');
const allRuns = [...wr, ...orr, ...fr];
for (const K of [...KINDS, null]) { const A = uagg(wr.length ? wr : allRuns, K ? (o, v) => kindOf(o, v) === K : null); const n = A.n || 1;
  L.push(`| ${K || '전체'} | ${A.n} | ${f0(A.ownT / n)} | ${f0(A.ownC / n)} | ${f0(A.nbT / n)} | ${f0(A.ringT / n)} | ${f1(A.ringC / n)} | ${f0(A.farT / n)} | ${f1(pc(A.ring0, A.n))} | ${f1(pc(A.none, A.n))} | ${f1(pc(A.ownOnly, A.n))} | ${f1(pc(A.outOnly, A.n))} |`);
  J.univ[K || '전체'] = { n: A.n, ownT: A.ownT / n, ownC: A.ownC / n, nbT: A.nbT / n, ringT: A.ringT / n, ringC: A.ringC / n, farT: A.farT / n, ring0pct: pc(A.ring0, A.n), nonepct: pc(A.none, A.n), ownOnlyPct: pc(A.ownOnly, A.n), outOnlyPct: pc(A.outOnly, A.n), noTerr: A.noTerr }; }
// 시간 흐름(전체)
L.push(''); L.push('나무 우주의 날 흐름(전체 마을 평균 · 나무꾼 팔):'); L.push('| 날 | 영토 안 그루 | 고리 그루 | 고리 칸 | 먼 고리 그루 | 고리 0칸 마을 % |'); L.push('|---|---|---|---|---|---|');
const days = new Set(); for (const r of (wr.length ? wr : allRuns)) for (const v in r.o.univ) for (const d in r.o.univ[v]) days.add(+d);
J.univDay = {};
for (const d of [...days].sort((a, b) => a - b)) { let n = 0, a = 0, b = 0, c = 0, e = 0, z = 0; for (const r of (wr.length ? wr : allRuns)) for (const v in r.o.univ) { const u = r.o.univ[v][d]; if (!u) continue; n++; a += u.own.t; b += u.ring.t; c += u.ring.c; e += u.far.t; if (u.ring.c === 0) z++; } if (n) { L.push(`| ${d} | ${f0(a / n)} | ${f0(b / n)} | ${f1(c / n)} | ${f0(e / n)} | ${f1(pc(z, n))} |`); J.univDay[d] = { n, own: a / n, ring: b / n, ringC: c / n, far: e / n, ring0: pc(z, n) }; } }
// ③ 서 있는 셀 고르기(몸 단위 · 나무꾼 팔 · 호출 합)
L.push(''); L.push('## ③ 서 있는 셀 고르기 `_t561Standing`(나무꾼 팔 · 호출 단위 · 마을 꼴별)');
L.push('호출 = 몸 하나가 그날 현장을 고른 한 번(같은 날 다시 고르면 또 센다). 안 맡음 · 걸음 한계 · 물 · 산 · 사유지 거름 = 이 고르기에 **없다**(0 — 아래 "있나?" 칸). 건너뛴 셀 = 후보 목록에서 고른 셀보다 가까운데 서 있는 그루가 없어 건너뛴 칸.');
L.push('| 꼴 | 호출 | 목록 평균 칸 | 목록 평균 그루 | 빈 목록 아님 · 결과 없음(none) % | 첫 셀 비어 건너뜀 % | 건너뛴 칸 평균 | 건너뛴 그루 평균(스캔 때) | 같은 날 다시 고름 % | 같은 셀에 몰림 % | 한 셀 최대 | 평균 거리 px | ≤500 % | 500~1000 % | 1000~2000 % | 2000~4000 % | >4000 % | 걸음 한계 밖 % |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.pick = {};
for (const K of [...KINDS, null]) { const T = {}; for (const r of wr) add(T, pkSum(r.o, K ? (v) => kindOf(r.o, v) === K : null, 'pk')); const c = T.calls || 0, got = c - (T.none || 0);
  L.push(`| ${K || '전체'} | ${f0(c)} | ${f1(c ? T.trL / c : null)} | ${f1(c ? T.trTrees / c : null)} | ${f1(pc(T.none || 0, c))} | ${f1(pc(T.firstEmpty || 0, got))} | ${f2(c ? (T.skC || 0) / c : null)} | ${f2(c ? (T.skT || 0) / c : null)} | ${f1(pc(T.repick || 0, c))} | ${f1(pc(T.joined || 0, got))} | ${f0(T.crowdMax)} | ${f0(got ? (T.distSum || 0) / got : null)} | ${[0, 1, 2, 3, 4].map((i) => f1(pc(T['dist' + i] || 0, got))).join(' | ')} | ${f1(pc(T.beyondR || 0, got))} |`);
  J.pick[K || '전체'] = T; }
L.push(''); L.push(`걸음 한계(제품 \`_t1259WoodRadius\`) = ${wr.length && wr[0].o.radius ? f0(wr[0].o.radius) : '—'} px (T1259 손잡이가 켜졌을 때만 쓰는 자 · 몸의 고르기는 이 자를 안 쓴다 — 이 표는 그 자로 **재 본** 값).`);
// ④ 몸의 결말 · 팔별 · 꼴별
const RS = ['nopath', 'far', 'nosite', 'rest', 'night', 'quota', 'other', 'idle'], RK = { nopath: '길없음', far: '멂', nosite: '자리없음', rest: '쉼', night: '밤', quota: '몫', other: '딴일', idle: '놀음' };
L.push(''); L.push('## ④ 나무꾼 몸-날의 결말(몸 표본 · 팔별 · 꼴별 · 두 시드 합)');
L.push('자리없음 = 그날 현장 칸이 없다(none 표 or 현장 목록 빔 · 아래 둘로 쪼갬). 없음(none) = `_t325Site.none`(서 있는 셀이 한 곳도 없어 퇴근) · 빈 목록 = 스캔 목록이 빈(레거시 폴스루 · 현장이 안 선다).');
L.push('| 팔 | 꼴 | 표본 몸-날 | 나선 % | 닿은 % | 자리없음 % | 그중 none % | 그중 빈 목록 % | 밤 % | 몫 % | 길없음 % | 멂 % | 쉼 % | 딴일 % | 놀음 % |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.body = {};
for (const [arm, nm] of ARMS) for (const K of [...KINDS, null]) { const a = { b: 0, o: 0, r: 0, none: 0, empty: 0, rs: {} }; RS.forEach((k) => { a.rs[k] = 0; });
  for (const r of armRuns(arm)) { const { I, T } = vsum(r.o, K ? (v) => kindOf(r.o, v) === K : null); a.b += T[I.bL]; a.o += T[I.oL]; a.r += T[I.rL]; a.none += T[I.L_none]; a.empty += T[I.L_empty]; RS.forEach((k) => { a.rs[k] += T[I['L_' + k]]; }); }
  if (!a.b) continue; L.push(`| ${nm} | ${K || '전체'} | ${f0(a.b)} | ${f1(pc(a.o, a.b))} | ${f2(pc(a.r, a.b))} | ${f1(pc(a.rs.nosite, a.b))} | ${f1(pc(a.none, a.b))} | ${f1(pc(a.empty, a.b))} | ${f1(pc(a.rs.night, a.b))} | ${f1(pc(a.rs.quota, a.b))} | ${f1(pc(a.rs.nopath, a.b))} | ${f1(pc(a.rs.far, a.b))} | ${f1(pc(a.rs.rest, a.b))} | ${f1(pc(a.rs.other, a.b))} | ${f1(pc(a.rs.idle, a.b))} |`);
  J.body[arm + '|' + (K || '전체')] = a; }
// ⑤ 반사실(산수) — 자리 없는 몸-날(none 또는 빈 목록) 에서
L.push(''); L.push('## ⑤ 반사실(산수 · 제품 상태 무변) — 자리 없는 몸-날(none · 빈 목록) 이 **조건 하나를 풀면** 자리를 얻는 몫');
L.push('사건 = 닿지 못하고 none 이거나 목록이 빈 나무꾼 몸-날. 풀면 = 그날 쓴 나무 우주 표(≤30날 묵은 값)에서 그 칸에 서 있는 그루가 하나라도 있으면 자리가 선다고 센다. 걸음 · 길 · 짐은 따지지 않는다(자리가 서는 것까지만).');
L.push('| 꼴 | 사건 | ⓐ 영토 안 허용 % | ⓑ 이웃 영토(≤R) 허용 % | ⓒ 반경 R→2R % | ⓐ∪ⓑ(영토 조건) % | ⓐ∪ⓑ∪ⓒ % | 모든 곳에 나무 0 % | 고리에 나무가 있는데도 자리 없음(스캔 날짜 차) % |'); L.push('|---|---|---|---|---|---|---|---|---|');
J.cf = {};
for (const K of [...KINDS, null]) { const T = {}; for (const r of wr) add(T, pkSum(r.o, K ? (v) => kindOf(r.o, v) === K : null, 'cf')); const e = T.ev || 0; if (!e && K) { L.push(`| ${K} | 0 | — | — | — | — | — | — | — |`); continue; }
  L.push(`| ${K || '전체'} | ${f0(e)} | ${f1(pc(T.own || 0, e))} | ${f1(pc(T.nb || 0, e))} | ${f1(pc(T.far || 0, e))} | ${f1(pc(T.terr || 0, e))} | ${f1(pc(T.any || 0, e))} | ${f1(pc(T.noTreeAll || 0, e))} | ${f1(pc(T.ringHas || 0, e))} |`); J.cf[K || '전체'] = T; }
// ⑥ 끈 세계(off) 와 비교
L.push(''); L.push('## ⑥ 끈 세계 — 나섬 47.8 % 의 자와 닿음');
const stO = {}; for (const job of ['lumberjack', 'miner', 'forager', 'fisher', 'hunter']) { const T = {}; for (const r of [...orr]) add(T, pkSum(r.o, null, 'st') && (() => { const o = r.o.st[job] || {}; const t = {}; for (const b in o) add(t, o[b]); return t; })()); stO[job] = T; }
L.push('끈 팔의 현장 고르기 `_t427Site`(나무꾼 · 광부 · 채집꾼 · 어부 · 사냥꾼 · 호출 단위):'); L.push('| 일 | 호출 | 후보 현장 평균 수 | 후보 0 % | 현장을 못 정해 집으로 % | 보류(pending) % | 고른 현장이 첫째 아님 % | 평균 걸음 거리 px |'); L.push('|---|---|---|---|---|---|---|---|');
J.offSite = {};
for (const job in stO) { const T = stO[job], c = T.calls || 0; if (!c) continue; L.push(`| ${job} | ${f0(c)} | ${f1(T.ns / c)} | ${f1(pc(T.n0 || 0, c))} | ${f1(pc(T.home || 0, c))} | ${f1(pc(T.pend || 0, c))} | ${f1(pc(T.skipped || 0, c - (T.home || 0) - (T.pend || 0)))} | ${f0(T.dN ? T.dSum / T.dN : null)} |`); J.offSite[job] = T; }
// ⑦ 닿은 몸이 하루에 벤 양 ↔ 필요
L.push(''); L.push('## ⑦ 닿은 몸의 하루 — 벤 양 · 짐 · 곳간 ↔ 필요');
L.push('벤 양 = 손 통나무 증가(한 몸-날) · 짐 수 = 손에 통나무가 는 횟수 · 곳간에 낸 양 = 손 감소 · 필요 = 곳간 일일 땔감 소비(`_consDay.wood`) ÷ 사람.');
L.push('| 팔 | 나무꾼 닿은 몸-날 | 닿은 몸 하루 벤 양 | 하루 짐(벤 횟수) | 하루 곳간 낸 횟수 | 하루 곳간 낸 양 | 모든 나무꾼 몸-날(표본) 벤 양 평균 | 사람당 하루 땔감 필요 | 필요를 채우려는 닿은 몸 수(마을 평균 사람 기준) |'); L.push('|---|---|---|---|---|---|---|---|---|');
J.reach = {};
for (const [arm, nm] of ARMS) { let r = 0, cut = 0, del = 0, tr = 0, dtr = 0, b = 0, cutAll = 0, cons = 0, pop = 0;
  for (const x of armRuns(arm)) { const { I, T } = vsum(x.o); r += T[I.rL]; cut += T[I.cutLR]; del += T[I.delLR]; tr += T[I.tripLR]; dtr += T[I.dtripLR]; b += T[I.bL]; cutAll += T[I.cutL]; cons += T[I.consWood]; pop += T[I.n]; }
  if (!b) continue; const need = pop ? cons / pop : null, avgPop = pop && x0(armRuns(arm)) ? pop / x0(armRuns(arm)) : null;
  L.push(`| ${nm} | ${f0(r)} | ${f2(r ? cut / r : null)} | ${f2(r ? tr / r : null)} | ${f2(r ? dtr / r : null)} | ${f2(r ? del / r : null)} | ${f2(b ? cutAll / b : null)} | ${f3(need)} | ${f1(r && cut ? (need * 50) / (cut / r) : null)} |`); J.reach[arm] = { r, cut, del, tr, dtr, b, cutAll, need }; }
function x0(rs) { let vd = 0; for (const r of rs) { const { I, T } = vsum(r.o); vd += T[I.vd]; } return vd; }
// ⑧ 나무꾼이 준 까닭 — 직업 바뀜
L.push(''); L.push('## ⑧ 나무꾼 수의 흐름과 직업 바뀜(바뀌기 직전 값 · 나무꾼 팔 · 두 시드 합)');
const WIN = [[1, 100], [101, 200], [201, 250], [251, 300], [301, 400], [401, 500], [501, 600], [601, 730]];
L.push('| 날 | 나무꾼 평균(하루 마을 합) | 나무꾼→딴 직업 | 딴 직업→나무꾼 | 순 | 나가는 쪽 곳간 통나무÷사람 | 나가는 쪽 땔감충당률 | 나가는 쪽 기근 % | 나가는 쪽 부족량(short) | 들어오는 쪽 곳간 통나무÷사람 | 들어오는 쪽 기근 % | 들어오는 쪽 자리(slot) 평균 | 들어오는 쪽 나무 있는 칸 평균 |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.sw = {};
for (const [a, b] of WIN) { let lj = 0, nd = 0; const out = [], inn = [], dest = {};
  for (const r of wr) { for (const g of r.o.glob) if (g.day >= a && g.day <= b) { lj += g.lj; nd++; } for (const s of r.o.sw) if (s.d >= a && s.d <= b) { if (s.f === 'lumberjack') { out.push(s); dest[s.t] = (dest[s.t] || 0) + 1; } else if (s.t === 'lumberjack') inn.push(s); } }
  const av = (arr, f) => arr.length ? sum(arr.map(f)) / arr.length : null, wpp = (s) => s.N ? s.wood / s.N : null;
  L.push(`| ${a}–${b} | ${f1(nd ? lj / nd : null)} | ${out.length} | ${inn.length} | ${inn.length - out.length} | ${f2(av(out, wpp))} | ${f2(av(out.filter((s) => s.cov != null), (s) => s.cov))} | ${f1(pc(sum(out.map((s) => s.famine || 0)), out.length))} | ${f1(av(out.filter((s) => s.short != null), (s) => s.short))} | ${f2(av(inn, wpp))} | ${f1(pc(sum(inn.map((s) => s.famine || 0)), inn.length))} | ${f1(av(inn.filter((s) => s.slot != null), (s) => s.slot))} | ${f1(av(inn.filter((s) => s.cells != null), (s) => s.cells))} |`);
  J.sw[a + '-' + b] = { out: out.length, inn: inn.length, dest }; }
L.push(''); L.push('나무꾼이 간 곳(201–250 · 나무꾼에서 나간 몸):'); { const D = J.sw['201-250'] ? J.sw['201-250'].dest : {}; L.push('- ' + Object.keys(D).sort((x, y) => D[y] - D[x]).map((k) => `${k} ${D[k]}`).join(' · ')); }
// 201–250 구간 — 나간 몸들의 마을에 대한 하루 지표
L.push(''); L.push('201–250 나간 몸 하나하나의 마을 값(앞 20건 · 시드 구분 없이):'); L.push('| 시드 | 날 | 마을 | 가는 곳 | 인구 | 곳간 통나무 | 충당률 | 모자람 | 필요 | 나무꾼 하루 벤(마을) | 기근 | 자리 | 나무 칸 | 나무꾼 수 |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
{ let k = 0; for (const r of wr) for (const s of r.o.sw) if (s.d >= 201 && s.d <= 250 && s.f === 'lumberjack' && k < 20) { k++; L.push(`| ${r.seed} | ${s.d} | ${s.v} | ${s.t} | ${s.N} | ${f1(s.wood)} | ${s.cov != null ? f2(s.cov) : '—'} | ${f1(s.short)} | ${f1(s.need)} | ${f2(s.perLJ)} | ${s.famine} | ${s.slot} | ${s.cells} | ${s.lj} |`); } }
// ⑨ 어부
L.push(''); L.push('## ⑨ 어부 깔때기(어부 팔 · 끈 팔)');
L.push('| 팔 | 꼴 | 표본 몸-날 | 나선 % | 닿은 % | 자리없음 % | 밤 % | 몫 % | 길없음 % | 멂 % | 쉼 % | 딴일 % | 놀음 % |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.fbody = {};
for (const [arm, nm] of ARMS.filter((x) => x[0] !== 'wood')) for (const K of [...KINDS, null]) { const a = { b: 0, o: 0, r: 0, rs: {} }; RS.forEach((k) => { a.rs[k] = 0; });
  for (const r of armRuns(arm)) { const { I, T } = vsum(r.o, K ? (v) => kindOf(r.o, v) === K : null); a.b += T[I.bF]; a.o += T[I.oF]; a.r += T[I.rF]; RS.forEach((k) => { a.rs[k] += T[I['F_' + k]]; }); }
  if (!a.b) continue; L.push(`| ${nm} | ${K || '전체'} | ${f0(a.b)} | ${f1(pc(a.o, a.b))} | ${f2(pc(a.r, a.b))} | ${f1(pc(a.rs.nosite, a.b))} | ${f1(pc(a.rs.night, a.b))} | ${f1(pc(a.rs.quota, a.b))} | ${f1(pc(a.rs.nopath, a.b))} | ${f1(pc(a.rs.far, a.b))} | ${f1(pc(a.rs.rest, a.b))} | ${f1(pc(a.rs.other, a.b))} | ${f1(pc(a.rs.idle, a.b))} |`); J.fbody[arm + '|' + (K || '전체')] = a; }
L.push(''); L.push('어부 현장 고르기 `_t427Site` · 던지기 `_t340Try`(호출 단위):'); L.push('| 팔 | 고르기 호출 | 후보 평균 | 후보 0 % | 집으로 % | 보류 % | 첫째 아님 % | 평균 거리 px | 던지기 호출 | 대상없음 % | 기다림 % | 놓침 % | 입질 % | 몸-날 대상없음 | 몸-날 입질 |'); L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
J.fish = {};
for (const [arm, nm] of ARMS.filter((x) => x[0] !== 'wood')) { const S = {}, Z = {}; for (const r of armRuns(arm)) { const o = (r.o.st.fisher) || {}; for (const b in o) add(S, o[b]); const z = (r.o.fz.ALL) || {}; for (const b in z) add(Z, z[b]); }
  const c = S.calls || 0, zc = (Z.c_none || 0) + (Z.c_wait || 0) + (Z.c_miss || 0) + (Z.c_hook || 0) + (Z.c_other || 0); if (!c && !zc) continue;
  L.push(`| ${nm} | ${f0(c)} | ${f1(c ? S.ns / c : null)} | ${f1(pc(S.n0 || 0, c))} | ${f1(pc(S.home || 0, c))} | ${f1(pc(S.pend || 0, c))} | ${f1(pc(S.skipped || 0, c - (S.home || 0) - (S.pend || 0)))} | ${f0(S.dN ? S.dSum / S.dN : null)} | ${f0(zc)} | ${f1(pc(Z.c_none || 0, zc))} | ${f1(pc(Z.c_wait || 0, zc))} | ${f1(pc(Z.c_miss || 0, zc))} | ${f1(pc(Z.c_hook || 0, zc))} | ${f0(Z.bd_none)} | ${f0(Z.bd_hook)} |`); J.fish[arm] = { S, Z }; }
// ⑩ 구석
L.push(''); L.push('## ⑩ 구석');
const per = (rs, f) => { let a = 0, b = 0; for (const r of rs) for (const g of r.o.glob) { const x = f(g); if (x) { a += x[0]; b += x[1]; } } return [a, b]; };
L.push('밤 · 겨울(나무꾼 팔 · 날 단위 몸 표본):'); L.push('| 구분 | 표본 몸-날 | 나선 % | 닿은 % | 밤 % | 자리없음 % | 몫 % |'); L.push('|---|---|---|---|---|---|---|');
J.corner = {};
for (const [nm, w] of [['여름 · 겨울 아님', 0], ['겨울', 1]]) { const A = { b: 0, o: 0, r: 0, n: 0, s: 0, q: 0 }; for (const r of wr) for (const g of r.o.glob) if (g.win === w) { A.b += g.bL; A.o += g.oL; A.r += g.rL; A.n += g.why.L_night || 0; A.s += g.why.L_nosite || 0; A.q += g.why.L_quota || 0; } if (!A.b) continue; L.push(`| ${nm} | ${f0(A.b)} | ${f1(pc(A.o, A.b))} | ${f2(pc(A.r, A.b))} | ${f1(pc(A.n, A.b))} | ${f1(pc(A.s, A.b))} | ${f1(pc(A.q, A.b))} |`); J.corner[nm] = A; }
// 물 먼 18 마을 · 나머지
L.push(''); L.push('물이 가장 먼 18 마을(land.water 하위 18) vs 나머지 — 어부 팔:'); L.push('| 집단 | 마을 수 | 표본 어부 몸-날 | 나선 % | 닿은 % | 자리없음 % | 어부 하루 평균(마을-날) | 곳간 생선 가운데(마을-날 평균) |'); L.push('|---|---|---|---|---|---|---|---|');
{ const r0 = fr[0] || orr[0]; if (r0) { const names = Object.keys(r0.o.land).sort((a, b) => (r0.o.land[a].water || 0) - (r0.o.land[b].water || 0)), far18 = new Set(names.slice(0, 18));
  for (const [nm, f] of [['물 먼 18', (v) => far18.has(v)], ['나머지', (v) => !far18.has(v)]]) { const A = { b: 0, o: 0, r: 0, ns: 0, fi: 0, vd: 0, fish: 0, n: 0 }; for (const r of (fr.length ? fr : orr)) { const { I, T } = vsum(r.o, f); A.b += T[I.bF]; A.o += T[I.oF]; A.r += T[I.rF]; A.ns += T[I.F_nosite]; A.fi += T[I.fi]; A.vd += T[I.vd]; A.fish += T[I.fish]; A.n += T[I.n]; }
    L.push(`| ${nm} | ${nm === '물 먼 18' ? 18 : names.length - 18} | ${f0(A.b)} | ${f1(pc(A.o, A.b))} | ${f2(pc(A.r, A.b))} | ${f1(pc(A.ns, A.b))} | ${f2(A.vd ? A.fi / A.vd : null)} | ${f2(A.n ? A.fish / A.n : null)} |`); J.corner[nm] = A; }
  L.push(''); L.push('물 먼 18 마을 이름: ' + names.slice(0, 18).map((v) => `${v}(${f2(r0.o.land[v].water)})`).join(' · ')); } }
// 숲 없는 마을 · 숲이 영토 밖에만 있는 마을(마을 단위 · 시점 합)
L.push(''); L.push('마을 단위 숲(나무꾼 팔 · 100날 표본 중 비율 · 마을별):'); L.push('| 마을 | 꼴 | 영토 안 그루 평균 | 고리 그루 평균 | 먼 고리 그루 평균 | 숲 전무 % | 영토 밖에만 % | 나무꾼 하루 평균 | 나무꾼 0 날 % |'); L.push('|---|---|---|---|---|---|---|---|---|');
{ const r0 = wr[0]; if (r0) { const rows = []; for (const v in r0.o.univ) { let n = 0, a = 0, b = 0, c = 0, z = 0, oo = 0; for (const r of wr) for (const d in (r.o.univ[v] || {})) { const u = r.o.univ[v][d]; n++; a += u.own.t; b += u.ring.t; c += u.far.t; const out = u.nbR.t + u.ring.t + u.far.t; if (u.own.t === 0 && out === 0) z++; else if (u.own.t === 0) oo++; } let lj = 0, vd = 0, nl = 0; for (const r of wr) { const { I, T } = vsum(r.o, (x) => x === v); lj += T[I.lj]; vd += T[I.vd]; nl += T[I.noLJ]; } rows.push({ v, k: kindOf(r0.o, v), a: a / n, b: b / n, c: c / n, z: pc(z, n), oo: pc(oo, n), lj: vd ? lj / vd : null, nl: pc(nl, vd) }); }
  rows.sort((x, y) => x.b - y.b); J.village = rows; for (const x of rows) L.push(`| ${x.v} | ${x.k} | ${f0(x.a)} | ${f0(x.b)} | ${f0(x.c)} | ${f1(x.z)} | ${f1(x.oo)} | ${f1(x.lj)} | ${f1(x.nl)} |`); } }
fs.mkdirSync(OUTDIR, { recursive: true }); fs.writeFileSync(path.join(OUTDIR, 'table.txt'), L.join('\n') + '\n'); fs.writeFileSync(path.join(OUTDIR, 'table.json'), JSON.stringify(J));
console.log('wrote', path.join(OUTDIR, 'table.txt'), L.length, 'lines');
