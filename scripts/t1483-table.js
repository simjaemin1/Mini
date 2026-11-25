#!/usr/bin/env node
// === scripts/t1483-table.js — T1483 나무꾼·어부 어디서 막히나: 관찰기 판 자료 → 표(제품 무변 · 판 자료만 읽는다) ===
// 읽는 것: $R/done.txt · $R/runs/obs-<팔>-<시드>.json(계측/T1483_2026-11-25/t1483-observe.js) · $R/runs/<팔>-<시드>.out
// 쓰는 법: R=<판 자료 폴더> OUTDIR=<표 폴더> node scripts/t1483-table.js
'use strict';
const fs = require('fs'), path = require('path');
const R = process.env.R || '/home/user/t1483/run', OUTDIR = process.env.OUTDIR || path.join(__dirname, '..', '계측', 'T1483_2026-11-25');
const ARMS = [['off', '끔'], ['wood', '나무꾼'], ['fish', '어부']], SEEDS = [1020, 7];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const done = new Map(); try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}
const sum = (a) => a.reduce((x, y) => x + y, 0), mean = (a) => a.length ? sum(a) / a.length : null;
const med = (a) => { a = a.filter((x) => x != null); if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const f0 = (x) => x == null ? '—' : Math.round(x).toLocaleString('en-US'), f1 = (x) => x == null ? '—' : x.toFixed(1), f2 = (x) => x == null ? '—' : x.toFixed(2), f3 = (x) => x == null ? '—' : x.toFixed(3);
const pc = (a, b) => b > 0 ? 100 * a / b : null;
const runs = {};
for (const [arm] of ARMS) for (const s of SEEDS) { const tag = `${arm}-${s}`, o = rd(path.join(R, 'runs', `obs-${tag}.json`)); runs[tag] = { arm, seed: s, o, d: done.get(tag) || null, out: (() => { try { return fs.readFileSync(path.join(R, 'runs', tag + '.out'), 'utf8'); } catch (e) { return ''; } })() }; }
const L = [], J = { runs: {}, arms: {}, series: {}, reasons: {}, off: {}, village: {}, corner: {}, none: [] };
const FI = (o) => { const I = {}; o.F.forEach((k, i) => { I[k] = i; }); return I; };
// 한 판 → 합계(F 필드별) · 마을별 합계
function tot(o, filter) { const I = FI(o), T = new Array(o.F.length).fill(0), PV = {}; for (const v in o.vb) { const P = PV[v] = new Array(o.F.length).fill(0); for (const b in o.vb[v]) { if (filter && !filter(+b)) continue; o.vb[v][b].forEach((x, i) => { T[i] += x; P[i] += x; }); } } return { I, T, PV }; }
const G = (k) => (r) => r.o.glob; 
const win = (r, a, b) => r.o.glob.slice(a - 1, b);
// ── ① 판 상태
L.push('# T1483 나무꾼 · 어부 — 어디서 막히나 (관찰기 서버 730날 · 가상 시계 · 시드 ' + SEEDS.join(' · ') + ')');
L.push('');
L.push('## ① 판 상태');
L.push('| 판 | rc | 초 | 마지막 날 | 관찰기 err | 730날 인구 | 소멸 마을 |');
L.push('|---|---|---|---|---|---|---|');
for (const tag in runs) { const r = runs[tag], o = r.o, g = o && o.glob[o.glob.length - 1]; const m = /소멸 (\d+)\/51/.exec(r.out);
  L.push(`| ${tag} | ${r.d ? r.d.rc : '—'} | ${r.d ? r.d.sec : '—'} | ${o ? o.lastDay : '—'} | ${o ? (o.err || '없음') : '—'} | ${g ? f0(g.pop) : '—'} | ${m ? m[1] : '—'} |`);
  J.runs[tag] = { rc: r.d && r.d.rc, sec: r.d && r.d.sec, lastDay: o && o.lastDay, err: o && o.err, pop730: g && g.pop, 소멸: m ? +m[1] : null }; }
// ── ② 몸이 현장에 닿았나(몸 표본 · 한 몸-날 = 그날 표본에 든 몸 하나)
L.push('');
L.push('## ② 몸 표본 — 나선 몸 · 닿은 몸 · 못 닿은 까닭(몸-날 합 · 두 시드)');
L.push('까닭은 제품에 "못 닿은 까닭" 칸이 없어 몸의 하루 이름표·거리로 바깥에서 가른 **근사**다: 길없음 = 나섰는데 첫 거리의 10% 도 못 좁힘 · 멂 = 좁혔으나 해 질 때까지 못 닿음 · 자리없음 = 그날 갈 자리 없음 · 밤 = 취침·귀가만 · 쉼 = 요양 · 몫 = 자리를 고른 뒤 휴식 · 딴일 = 다른 일 이름표 · 놀음 = 어느 것도 아님. 닿음 = 현장 반경(나무꾼 44px 몸의 하루 켬 · 240px 옛 · 어부 130px) 안에 든 적 있음.');
const RS = ['nopath', 'far', 'nosite', 'rest', 'night', 'quota', 'other', 'idle'], RK = { nopath: '길없음', far: '멂', nosite: '자리없음', rest: '쉼', night: '밤', quota: '몫', other: '딴일', idle: '놀음' };
L.push('| 팔 | 일 | 표본 몸-날 | 나선 몸 | 나선 % | 닿은 몸 | 닿은 % (표본 대비) | 첫 거리 평균 px | ' + RS.map((k) => RK[k] + ' %').join(' | ') + ' |');
L.push('|' + '---|'.repeat(8 + RS.length));
for (const [arm, nm] of ARMS) for (const job of ['L', 'F']) {
  const a = { b: 0, o: 0, r: 0, d0: 0, d0n: 0, cut: 0, del: 0, rs: {} }; RS.forEach((k) => { a.rs[k] = 0; });
  const per = {};
  for (const s of SEEDS) { const r = runs[`${arm}-${s}`]; if (!r.o) continue; const { I, T } = tot(r.o); a.b += T[I['b' + job]]; a.o += T[I['o' + job]]; a.r += T[I['r' + job]]; a.d0 += T[I['d0' + job]]; a.d0n += T[I['d0' + job + 'n']]; RS.forEach((k) => { a.rs[k] += T[I[job + '_' + k]]; }); per[s] = { b: T[I['b' + job]], o: T[I['o' + job]], r: T[I['r' + job]] }; }
  const top = RS.slice().sort((x, y) => a.rs[y] - a.rs[x])[0];
  L.push(`| ${nm} | ${job === 'L' ? '나무꾼' : '어부'} | ${f0(a.b)} | ${f0(a.o)} | ${f1(pc(a.o, a.b))} | ${f0(a.r)} | ${f2(pc(a.r, a.b))} | ${f0(a.d0n ? a.d0 / a.d0n : null)} | ${RS.map((k) => f1(pc(a.rs[k], a.b))).join(' | ')} |`);
  J.reasons[`${arm}-${job}`] = { 표본: a.b, 나선: a.o, 닿은: a.r, 나선pct: pc(a.o, a.b), 닿은pct: pc(a.r, a.b), 첫거리평균: a.d0n ? a.d0 / a.d0n : null, 까닭: a.rs, 까닭1위: top, 까닭1위pct: pc(a.rs[top], a.b), 시드별: per };
}
L.push('');
L.push('시드별(나선 · 닿은 몸-날 / 표본):');
for (const tag in runs) { const o = runs[tag].o; if (!o) continue; const { I, T } = tot(o); L.push(`- ${tag}: 나무꾼 ${f0(T[I.oL])} · ${f0(T[I.rL])} / ${f0(T[I.bL])} · 어부 ${f0(T[I.oF])} · ${f0(T[I.rF])} / ${f0(T[I.bF])}`); }
// ── ③ 구간별 흐름(두 시드 가운데값)
const WIN = [[1, 100], [101, 200], [201, 250], [251, 300], [301, 350], [351, 400], [401, 500], [501, 600], [601, 700], [701, 730]];
L.push('');
L.push('## ③ 구간별 흐름(날 구간 · 두 시드 가운데값 · 마을 가운데값은 하루 값의 가운데)');
L.push('통나무 가운데 = 마을별 곳간 통나무 ÷ 사람의 마을 가운데(하루) · 통나무 0 마을 = 곳간 통나무 < 1 인 마을 수 · 낮음 = ÷사람 < 0.1 인 마을 수 · 땔감 모자람 = `_fuelCov` < 1 인 마을 · 나무꾼 0 = 나무꾼 직업 0 마을.');
const SER = {};
for (const [arm, nm] of ARMS) {
  L.push(''); L.push(`### ${nm} 세계`);
  L.push('| 날 | 인구 | 나무꾼 | 어부 | 통나무 가운데 | 통나무 0 마을 | 통나무 낮음 | 생선 가운데 | 생선 낮음 | 땔감 모자람 | 나무꾼 0 | 남은 그루 | 추위 합 | 죽음 | 첫 거리 나무꾼 |');
  L.push('|' + '---|'.repeat(15));
  for (const [a, b] of WIN) {
    const vals = SEEDS.map((s) => { const r = runs[`${arm}-${s}`]; if (!r.o) return null; const w = win(r, a, b); if (!w.length) return null; const m = (k) => mean(w.map((x) => x[k] || 0));
      return { pop: m('pop'), lj: m('lj'), fi: m('fi'), wm: mean(w.map((x) => x.woodMed || 0)), wz: m('woodZero'), wl: m('woodLow'), fm: mean(w.map((x) => x.fishMed || 0)), fl: m('fishLow'), fs: m('fuelShort'), nl: m('noLJ'), tr: m('trees'), cold: m('cold'), dead: sum(w.map((x) => x.dead || 0)), d0: mean(w.filter((x) => x.d0Ln).map((x) => x.d0L / x.d0Ln)) }; }).filter(Boolean);
    const M = (k) => med(vals.map((v) => v[k]));
    const row = { a, b, pop: M('pop'), lj: M('lj'), fi: M('fi'), wm: M('wm'), wz: M('wz'), wl: M('wl'), fm: M('fm'), fl: M('fl'), fs: M('fs'), nl: M('nl'), tr: M('tr'), cold: M('cold'), dead: M('dead'), d0: M('d0') };
    (SER[arm] || (SER[arm] = [])).push(row);
    L.push(`| ${a}-${b} | ${f0(row.pop)} | ${f0(row.lj)} | ${f0(row.fi)} | ${f3(row.wm)} | ${f1(row.wz)} | ${f1(row.wl)} | ${f3(row.fm)} | ${f1(row.fl)} | ${f1(row.fs)} | ${f1(row.nl)} | ${f0(row.tr)} | ${f0(row.cold)} | ${f0(row.dead)} | ${f0(row.d0)} |`);
  }
}
J.series = SER;
// 나무꾼 세계 250~350 날을 10날 단위로(무엇이 먼저 0 인가)
L.push(''); L.push('### 나무꾼 세계 · 250~350날 10날 단위(두 시드 가운데값)');
L.push('| 날 | 통나무 가운데 | 통나무 0 마을 | 통나무 낮음 | 생선 가운데 | 생선 낮음 | 남은 그루 | 나무꾼 | 나무꾼 0 | 땔감 모자람 | 인구 |');
L.push('|' + '---|'.repeat(11));
const W300 = [];
for (let a = 241; a <= 350; a += 10) {
  const vals = SEEDS.map((s) => { const r = runs[`wood-${s}`]; if (!r.o) return null; const w = win(r, a, a + 9), m = (k) => mean(w.map((x) => x[k] || 0)); return { wm: m('woodMed'), wz: m('woodZero'), wl: m('woodLow'), fm: m('fishMed'), fl: m('fishLow'), tr: m('trees'), lj: m('lj'), nl: m('noLJ'), fs: m('fuelShort'), pop: m('pop') }; }).filter(Boolean);
  const M = (k) => med(vals.map((v) => v[k])); const row = { a, wm: M('wm'), wz: M('wz'), wl: M('wl'), fm: M('fm'), fl: M('fl'), tr: M('tr'), lj: M('lj'), nl: M('nl'), fs: M('fs'), pop: M('pop') }; W300.push(row);
  L.push(`| ${a}-${a + 9} | ${f3(row.wm)} | ${f1(row.wz)} | ${f1(row.wl)} | ${f3(row.fm)} | ${f1(row.fl)} | ${f0(row.tr)} | ${f0(row.lj)} | ${f1(row.nl)} | ${f1(row.fs)} | ${f0(row.pop)} |`);
}
J.wood300 = W300;
// ── ④ 겨울(달력 겨울 = 판의 win 칸) 대 아닌 날
L.push(''); L.push('## ④ 겨울 3달 — 겨울 날 대 아닌 날(마을-날 평균 · 두 시드)');
L.push('| 팔 | 겨울 날수/730 | 땔감 모자람 % 겨울 | 아님 | 추위 평균 겨울 | 아님 | 죽음 겨울/날 | 아님/날 | 통나무 가운데 겨울 | 아님 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const [arm, nm] of ARMS) {
  const A = { w: { fs: 0, v: 0, cold: 0, dead: 0, d: 0, wm: [] }, s: { fs: 0, v: 0, cold: 0, dead: 0, d: 0, wm: [] } }; let wd = 0;
  for (const sd of SEEDS) { const r = runs[`${arm}-${sd}`]; if (!r.o) continue; for (const g of r.o.glob) { const k = g.win ? 'w' : 's'; const v = g.vills - g.empty; A[k].fs += g.fuelShort; A[k].v += v; A[k].cold += g.cold; A[k].dead += g.dead; A[k].d++; A[k].wm.push(g.woodMed || 0); if (g.win) wd++; } }
  L.push(`| ${nm} | ${f0(wd / SEEDS.length)} | ${f1(pc(A.w.fs, A.w.v))} | ${f1(pc(A.s.fs, A.s.v))} | ${f1(A.w.cold / A.w.v)} | ${f1(A.s.cold / A.s.v)} | ${f2(A.w.dead / A.w.d)} | ${f2(A.s.dead / A.s.d)} | ${f3(med(A.w.wm))} | ${f3(med(A.s.wm))} |`);
  J.corner['겨울_' + arm] = { 겨울날: wd / SEEDS.length, 모자람겨울pct: pc(A.w.fs, A.w.v), 모자람아님pct: pc(A.s.fs, A.s.v) };
}
// ── ⑤ 끈 세계 — 땔감 모자란 날과 나무꾼 없는 까닭
L.push(''); L.push('## ⑤ 끈 세계 — 땔감 모자란 마을-날에 실제로 일어난 일 · 나무꾼 없는 까닭');
const offT = SEEDS.map((s) => runs[`off-${s}`]).filter((r) => r.o);
let vd = 0, fsd = 0, nl = 0, fsnl = 0; const jc = { noSlot: 0, noTree: 0, famine: 0, other: 0 };
for (const r of offT) { const { I, T } = tot(r.o); vd += T[I.vd]; fsd += T[I.fuelShort]; nl += T[I.noLJ]; fsnl += T[I.fuelShortNoLJ]; for (const k in jc) jc[k] += T[I['jc_' + k]]; }
L.push(`- 마을-날 ${f0(vd)} 가운데 땔감 모자란 날 ${f0(fsd)} (${f1(pc(fsd, vd))} %) · 나무꾼 0 마을-날 ${f0(nl)} (${f1(pc(nl, vd))} %) · 둘이 겹친 날 ${f0(fsnl)} (모자란 날의 ${f1(pc(fsnl, fsd))} %)`);
L.push(`- 나무꾼 0 마을-날의 까닭(바깥 재계산 근사): 자리 없음 ${f1(pc(jc.noSlot, nl))} % · 나무 칸 0 ${f1(pc(jc.noTree, nl))} % · 굶주림(식량환산 < 사람×30) ${f1(pc(jc.famine, nl))} % · 그 밖 ${f1(pc(jc.other, nl))} %`);
J.off = { vd, fuelShort: fsd, fuelShortPct: pc(fsd, vd), noLJ: nl, noLJpct: pc(nl, vd), 겹침: fsnl, jc, jcPct: Object.fromEntries(Object.entries(jc).map(([k, v]) => [k, pc(v, nl)])) };
// 모자란 날 비율이 높은 (마을 × 10날 묶음) 대 낮은 묶음 — 추위·죽음·행복
L.push('');
L.push('모자란 날 ≥ 50 % 인 (마을 × 10날) 묶음 대 < 50 % 묶음(끔 세계 · 두 시드):');
L.push('| 묶음 | 묶음 수 | 마을-날 | 추위/마을-날 | 굶어 죽음/천 마을-날 | 죽음 전체/천 마을-날 | 행복 평균 | 건강 평균 | 통나무÷사람(평균) | 나무꾼 0 % |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
const BK = { hi: null, lo: null }; const mk = () => ({ n: 0, vd: 0, cold: 0, fd: 0, dead: 0, happy: 0, health: 0, wood: 0, pop: 0, noLJ: 0 }); BK.hi = mk(); BK.lo = mk();
for (const r of offT) { const I = FI(r.o); for (const v in r.o.vb) for (const b in r.o.vb[v]) { const x = r.o.vb[v][b]; if (!x[I.vd]) continue; const t = x[I.fuelShort] / x[I.vd] >= 0.5 ? BK.hi : BK.lo; t.n++; t.vd += x[I.vd]; t.cold += x[I.cold]; t.fd += x[I.fdDead]; t.dead += x[I.dead]; t.happy += x[I.happy]; t.health += x[I.health]; t.wood += x[I.wood]; t.pop += x[I.n]; t.noLJ += x[I.noLJ]; } }
for (const [k, nm] of [['hi', '모자란 날 ≥ 50 %'], ['lo', '< 50 %']]) { const t = BK[k]; L.push(`| ${nm} | ${f0(t.n)} | ${f0(t.vd)} | ${f2(t.cold / t.vd)} | ${f2(1000 * t.fd / t.vd)} | ${f2(1000 * t.dead / t.vd)} | ${f1(t.happy / t.vd)} | ${f1(t.health / t.vd)} | ${f3(t.wood / t.pop)} | ${f1(pc(t.noLJ, t.vd))} |`); }
J.off.묶음 = { 높음: BK.hi, 낮음: BK.lo };
// ── ⑥ 어부 세계 500날 뒤 — 끔 세계 대비(구간)
L.push(''); L.push('## ⑥ 어부 세계 — 끔 세계 대비 구간 값(두 시드 가운데값)');
L.push('| 날 | 끔 인구 | 어부 인구 | 비 | 끔 어부수 | 어부 어부수 | 끔 생선 낮음 | 어부 생선 낮음 | 끔 생선 가운데 | 어부 생선 가운데 | 끔 땔감 모자람 | 어부 땔감 모자람 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
J.fishVsOff = [];
SER.off.forEach((o, i) => { const f = SER.fish[i]; L.push(`| ${o.a}-${o.b} | ${f0(o.pop)} | ${f0(f.pop)} | ${f3(f.pop / o.pop)} | ${f0(o.fi)} | ${f0(f.fi)} | ${f1(o.fl)} | ${f1(f.fl)} | ${f3(o.fm)} | ${f3(f.fm)} | ${f1(o.fs)} | ${f1(f.fs)} |`); J.fishVsOff.push({ a: o.a, b: o.b, 비: f.pop / o.pop }); });
// ── ⑦ 약한 마을
L.push(''); L.push('## ⑦ 약한 마을 — 농촌18 · 농촌10 · 농촌21 · 농촌6 · 광산3 (판별 두 시드 합 · 마을-날 평균)');
L.push('| 마을 | 땅(나무 · 물) | 팔 | 마을-날 | 사람 평균 | 나무꾼 평균 | 어부 평균 | 땔감 모자람 % | 나무꾼 0 % | 통나무 0 % | 굶어 죽음 | 죽음 | 추위/날 | 행복 | 나선 몸 · 닿은 몸 (나무꾼) | 남은 그루 평균 |');
L.push('|' + '---|'.repeat(16));
const WEAK = ['농촌18', '농촌10', '농촌21', '농촌6', '광산3'];
for (const v of WEAK) for (const [arm, nm] of ARMS) {
  const a = { vd: 0, n: 0, lj: 0, fi: 0, fs: 0, noLJ: 0, wz: 0, fd: 0, dead: 0, cold: 0, happy: 0, oL: 0, rL: 0, tr: 0 }; let land = null;
  for (const s of SEEDS) { const r = runs[`${arm}-${s}`]; if (!r.o || !r.o.vb[v]) continue; const I = FI(r.o); land = r.o.land[v]; for (const b in r.o.vb[v]) { const x = r.o.vb[v][b]; a.vd += x[I.vd]; a.n += x[I.n]; a.lj += x[I.lj]; a.fi += x[I.fi]; a.fs += x[I.fuelShort]; a.noLJ += x[I.noLJ]; a.wz += x[I.woodZero]; a.fd += x[I.fdDead]; a.dead += x[I.dead]; a.cold += x[I.cold]; a.happy += x[I.happy]; a.oL += x[I.oL]; a.rL += x[I.rL]; a.tr += x[I.trees]; } }
  L.push(`| ${v} | ${land ? f2(land.wood) + ' · ' + f2(land.water) : '—'} | ${nm} | ${f0(a.vd)} | ${f1(a.n / a.vd)} | ${f1(a.lj / a.vd)} | ${f1(a.fi / a.vd)} | ${f1(pc(a.fs, a.vd))} | ${f1(pc(a.noLJ, a.vd))} | ${f1(pc(a.wz, a.vd))} | ${f0(a.fd)} | ${f0(a.dead)} | ${f2(a.cold / a.vd)} | ${f1(a.happy / a.vd)} | ${f0(a.oL)} · ${f0(a.rL)} | ${f0(a.tr / a.vd)} |`);
  (J.village[v] || (J.village[v] = {}))[arm] = { vd: a.vd, 사람: a.n / a.vd, 나무꾼: a.lj / a.vd, 어부: a.fi / a.vd, 모자람pct: pc(a.fs, a.vd), 나무꾼0pct: pc(a.noLJ, a.vd), 통나무0pct: pc(a.wz, a.vd), 굶죽음: a.fd, 죽음: a.dead };
}
// ── ⑧ 구석 — 물 먼 마을 18 · 나무 없는 마을 · 섬
const o0 = runs['off-7'].o || runs['off-1020'].o, kinds = o0.kind, land = o0.land;
const byWater = Object.keys(land).sort((x, y) => (land[x].water || 0) - (land[y].water || 0));
const far18 = byWater.slice(0, 18), noForest = Object.keys(land).filter((v) => !(land[v].wood > 0));
const ISL = ['광산3', '어촌2', '임업5', '임업6', '농촌4', '어촌7', '어촌9', '어촌14', '농촌6', '농촌13', '농촌14', '광산7', '농촌3', '어촌6'];
const grp = (names, arm) => { const a = { vd: 0, n: 0, fs: 0, noLJ: 0, fd: 0, dead: 0, wz: 0, fi: 0, lj: 0 }; for (const s of SEEDS) { const r = runs[`${arm}-${s}`]; if (!r.o) continue; const I = FI(r.o); for (const v of names) for (const b in (r.o.vb[v] || {})) { const x = r.o.vb[v][b]; a.vd += x[I.vd]; a.n += x[I.n]; a.fs += x[I.fuelShort]; a.noLJ += x[I.noLJ]; a.fd += x[I.fdDead]; a.dead += x[I.dead]; a.wz += x[I.woodZero]; a.fi += x[I.fi]; a.lj += x[I.lj]; } } return a; };
L.push(''); L.push('## ⑧ 구석 — 물 먼 마을 18 · 나무 없는 마을 · 섬 마을 (판별 두 시드 합)');
L.push(`- 물 먼 마을 18 = 땅 물값(\`land.water\`)이 가장 낮은 18곳(제품에 "물 먼" 표지가 없어 이 줄로 정했다): ${far18.map((v) => v + '(' + f2(land[v].water) + ')').join(' ')}`);
L.push(`- 나무 없는 마을 = \`land.wood\` ≤ 0: ${noForest.length ? noForest.join(' ') : '없음'} · 섬 = 존 설정 주석에 적힌 섬 마을 ${ISL.length}곳(${ISL.join(' ')})`);
L.push('| 모음 | 팔 | 마을-날 | 사람 평균 | 나무꾼 평균 | 어부 평균 | 땔감 모자람 % | 나무꾼 0 % | 통나무 0 % | 굶어 죽음/천 마을-날 | 죽음/천 마을-날 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
const rest = Object.keys(land).filter((v) => !far18.includes(v));
for (const [gn, names] of [['물 먼 18', far18], ['나머지 33', rest], ['나무 없음', noForest], ['섬', ISL]]) { if (!names.length) continue; for (const [arm, nm] of ARMS) { const a = grp(names, arm); L.push(`| ${gn} | ${nm} | ${f0(a.vd)} | ${f1(a.n / a.vd)} | ${f1(a.lj / a.vd)} | ${f1(a.fi / a.vd)} | ${f1(pc(a.fs, a.vd))} | ${f1(pc(a.noLJ, a.vd))} | ${f1(pc(a.wz, a.vd))} | ${f2(1000 * a.fd / a.vd)} | ${f2(1000 * a.dead / a.vd)} |`); J.corner[gn + '_' + arm] = { vd: a.vd, 모자람pct: pc(a.fs, a.vd), 나무꾼0pct: pc(a.noLJ, a.vd), 굶죽음천: 1000 * a.fd / a.vd }; } }
// ── ⑨ 계측 없음
const NONE = ['곳간에서 나간 양 — 땔감 몫(직접)', '곳간에서 나간 양 — 건축 몫(직접)', '곳간에서 나간 양 — 먹음 몫(직접)', '곳간에서 나간 양 — 교역 몫(직접)', '곳간으로 들어간 양(직접 · 잔차로만)', '요리 실패 수', '나무꾼 벤 양(손 통나무 증가 — 값이 거의 0 이라 믿지 않음)', '나무꾼 날라 온 양(손 감소)', '어부 낚은 양(`_t312U` 증가 — 값 0)', '어부 날라 온 양', '낚시 입질(`_t340Hook` — 값 0)', '낚시 놓침(`_t340Miss` — 값 0)', '못 닿은 까닭(제품 칸 없음 · 근사만)', '추위로 죽음 · 굶음 직접(합 죽음만)'];
L.push(''); L.push(`## ⑨ 계측 없음 ${NONE.length}칸`); NONE.forEach((n) => L.push('- ' + n)); J.none = NONE;
// ── ⑪ 사라진 마을(사람 0 이 된 마을 · 날 = 사람 있던 마을-날 수 = 사라진 날 · 까닭 = 마지막 묶음 굶어 죽음·죽음)
L.push(''); L.push('## ⑪ 사라진 마을(판별) — 날 · 까닭');
L.push('| 판 | 마을 | 사라진 날(사람 있던 날 수) | 굶어 죽음 누계 | 죽음 누계 | 땅(나무 · 물) |');
L.push('|---|---|---|---|---|---|');
J.extinct = [];
for (const tag in runs) { const o = runs[tag].o; if (!o) continue; const I = FI(o); for (const v in o.vb) { let vdn = 0, fd = 0, dd = 0; for (const b in o.vb[v]) { vdn += o.vb[v][b][I.vd]; fd += o.vb[v][b][I.fdDead]; dd += o.vb[v][b][I.dead]; } if (vdn < o.lastDay - 5) { L.push(`| ${tag} | ${v} | ${f0(vdn)} | ${f0(fd)} | ${f0(dd)} | ${f2(o.land[v].wood)} · ${f2(o.land[v].water)} |`); J.extinct.push({ tag, v, day: vdn, fd, dd }); } } }
if (!J.extinct.length) L.push('| (없음) | | | | | |');
// 끝점: 인구비
L.push(''); L.push('## ⑩ 인구비(730날 · 끔 = 1)');
const pop = (arm) => mean(SEEDS.map((s) => { const o = runs[`${arm}-${s}`].o; return o ? o.glob[o.glob.length - 1].pop : null; }).filter((x) => x != null));
for (const [arm, nm] of ARMS) { J.arms[arm] = { pop730: pop(arm), 비: pop(arm) / pop('off') }; L.push(`- ${nm}: 인구 ${f0(pop(arm))} · 끔 대비 ${f3(pop(arm) / pop('off'))}`); }
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'table.txt'), L.join('\n') + '\n'); fs.writeFileSync(path.join(OUTDIR, 'table.json'), JSON.stringify(J));
console.log('table.txt ' + L.length + '줄');
