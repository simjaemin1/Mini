#!/usr/bin/env node
// === scripts/t1477-table.js — T1477 어부 · 나무꾼 켠 서버 730날 3시드 점검표(판 자료만 읽는다 · 제품 무변) ===
// 읽는 것: $R/done.txt("팔-시드 rc 초") · $R/runs/obs-<팔>-<시드>.json(계측/T1477_2026-11-24/t1477-observe.js) · $R/runs/<팔>-<시드>.{out,log}(죽은 판 꼬리)
// 내는 것: 표 칸 전부(table.txt · table.json) + 보고 첫 줄 후보
// 쓰는 법: R=<판 자료 폴더> OUTDIR=<표 폴더> node scripts/t1477-table.js
'use strict';
const fs = require('fs'), path = require('path');
const R = process.env.R || '/home/user/t1477/run';
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '..', '계측', 'T1477_2026-11-24');
const ARMS = [['off', '끔', ''], ['fish', '어부', 'T312_FISH_ACT=1'], ['wood', '나무꾼', 'T325_WOOD_ACT=1'], ['both', '둘 같이', 'T312_FISH_ACT=1 T325_WOOD_ACT=1']];
const ON = ARMS.slice(1), SEEDS = [1020, 7, 42], FINAL = 730, SNAPD = [100, 200, 300, 400, 500, 600, 700, 730];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const tail = (f, n) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n); } catch (e) { return []; } };
const done = new Map();
try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}
const runs = {};
for (const [arm] of ARMS) for (const s of SEEDS) {
  const tag = `${arm}-${s}`, ob = rd(path.join(R, 'runs', `obs-${tag}.json`)), d = done.get(tag) || null, snaps = (ob && ob.snaps) || [];
  const fin = snaps.find((x) => x.day === FINAL) || null;
  runs[tag] = { arm, seed: s, rc: d ? d.rc : null, sec: d ? d.sec : null, snaps, vil: (ob && ob.vil) || {}, land: (ob && ob.land) || {}, lastDay: ob ? ob.lastDay : null,
    err: ob ? ob.err : null, maxRss: ob ? ob.maxRss : null, fin, full: !!(d && d.rc === 0 && fin) };
}
const at = (r, d) => r.snaps.find((x) => x.day === d) || null;
const lastS = (r) => r.snaps.length ? r.snaps[r.snaps.length - 1] : null;
const sum = (a) => a.reduce((x, y) => x + y, 0), mean = (a) => a.length ? sum(a) / a.length : null;
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const f0 = (x) => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const f1 = (x) => x == null ? '—' : x.toFixed(1), f2 = (x) => x == null ? '—' : x.toFixed(2), f3 = (x) => x == null ? '—' : x.toFixed(3);
const pc = (a, b) => b > 0 ? (100 * a / b) : null;
const L = [], J = { arms: {}, runs: {}, groups: {}, worst: {} };
const nFull = Object.values(runs).filter((r) => r.full).length, nRun = Object.values(runs).filter((r) => r.rc != null).length;
L.push(`# T1477 어부 · 나무꾼 켜고 두 해 — 서버 730날 · 가상 시계 · 시드 ${SEEDS.join(' · ')} · 끝까지 돈 판 ${nFull}/${ARMS.length * SEEDS.length}(돌린 판 ${nRun})`);
L.push('');
L.push('팔: ' + ARMS.map(([, n, e]) => `${n}(${e || 'env 없음'})`).join(' · '));
L.push('- 굶어 죽음 = econ 마을 장부 `_fdDeadTot`(누계 · 마을 합) — 1해차 = 365날 값 · 2해차 = 730날 − 365날. 땔감 모자란 마을-날 = 사람 있는 마을-날 중 `_fuelCov` < 1 인 날. 나무꾼 0 마을-날 = 그 중 나무꾼 수 0 인 날.');
L.push('- 생선 곳간 = 생선 + 말림 · 절임 생선 합 ÷ 사람 · 통나무 곳간 = `storage.wood` ÷ 사람. "가운데 · 가장 낮은 마을" = 사람 있는 마을들 가운데(마을 단위). 겨울 = 달력 계절(12 ~ 2월).');
L.push('');
// ① 팔 × 시드
L.push('## ① 팔 × 시드');
L.push('');
L.push('| 팔 | 시드 | ' + SNAPD.map((d) => '인구 ' + d).join(' | ') + ' | 빈 마을 | 굶어 죽음 1해/2해 | 어부 | 나무꾼 | 나무꾼 0 마을-날 % | 땔감 모자란 마을-날 % | 생선÷사람 가운데/최저 | 통나무÷사람 가운데/최저 | 초/날 | RSS MB | rc | 초 |');
L.push('|' + '---|'.repeat(SNAPD.length + 15));
const rowAgg = (r) => { let vd = 0, w0 = 0, fs_ = 0; for (const k in r.vil) { vd += r.vil[k].vd; w0 += r.vil[k].w0; fs_ += r.vil[k].fs; } return { vd, w0, fs: fs_, w0p: pc(w0, vd), fsp: pc(fs_, vd) }; };
for (const [arm, name] of ARMS) for (const s of SEEDS) {
  const r = runs[`${arm}-${s}`], x = r.fin || lastS(r), a = rowAgg(r), s365 = at(r, 365);
  const stale = x && x.day !== FINAL ? `(${x.day}날)` : '';
  const fd1 = s365 ? s365.fd : null, fd2 = x && s365 ? x.fd - s365.fd : null;
  const st = r.rc == null ? '안 끝남/미착수' : r.rc === 0 ? 'ok' : r.rc === 124 ? '안 끝남(124)' : `죽음 ${r.rc}`;
  const cpd = x && r.sec != null && x.day ? (r.sec / x.day) : null;
  L.push(`| ${name} | ${s} | ${SNAPD.map((d) => d === FINAL ? (x ? f0(x.pop) + stale : '—') : f0((at(r, d) || {}).pop)).join(' | ')} | ${x ? x.empty : '—'} | ${fd1 == null ? '—' : fd1}/${fd2 == null ? '—' : fd2} | ${x ? x.jobs.fisher : '—'} | ${x ? x.jobs.lumberjack : '—'} | ${f1(a.w0p)} | ${f1(a.fsp)} | ${x ? f2(x.fishPPmed) + '/' + f2(x.fishPPmin) : '—'} | ${x ? f2(x.woodPPmed) + '/' + f2(x.woodPPmin) : '—'} | ${f2(cpd)} | ${r.maxRss ? Math.round(r.maxRss / 1048576) : '—'} | ${st} | ${r.sec == null ? '—' : r.sec} |`);
  J.runs[`${arm}-${s}`] = { rc: r.rc, sec: r.sec, lastDay: r.lastDay, maxRss: r.maxRss, agg: a, snaps: r.snaps.map((q) => Object.assign({}, q, { vs: undefined })) };
}
// ② 팔 평균
L.push('');
L.push('## ② 팔 평균(세 시드 · 730날 칸)');
L.push('');
L.push('| 팔 | 인구 평균 | 끔비 | 빈 마을 평균 | 굶어 죽음 1해 평균 | 2해 평균 | 땔감 모자란 마을-날 % | 나무꾼 0 마을-날 % | 어부 | 나무꾼 | 끝까지 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
const finOf = (arm) => SEEDS.map((s) => runs[`${arm}-${s}`].fin).filter(Boolean);
const offFin = finOf('off'), offM = mean(offFin.map((x) => x.pop));
for (const [arm, name] of ARMS) {
  const xs = finOf(arm), rs = SEEDS.map((s) => runs[`${arm}-${s}`]);
  const pm = mean(xs.map((x) => x.pop)), em = mean(xs.map((x) => x.empty));
  const f1y = mean(rs.filter((r) => at(r, 365) && r.fin).map((r) => at(r, 365).fd)), f2y = mean(rs.filter((r) => at(r, 365) && r.fin).map((r) => r.fin.fd - at(r, 365).fd));
  let vd = 0, w0 = 0, fsd = 0; for (const r of rs) { const a = rowAgg(r); vd += a.vd; w0 += a.w0; fsd += a.fs; }
  J.arms[arm] = { n: xs.length, pop: pm, ratio: offM && pm != null ? pm / offM : null, empty: em, fd1: f1y, fd2: f2y, fuelShortPct: pc(fsd, vd), w0Pct: pc(w0, vd), fisher: mean(xs.map((x) => x.jobs.fisher)), lumber: mean(xs.map((x) => x.jobs.lumberjack)), pops: SEEDS.map((s) => runs[`${arm}-${s}`].fin ? runs[`${arm}-${s}`].fin.pop : null) };
  const A = J.arms[arm];
  L.push(`| ${name} | ${f0(pm)} | ${f3(A.ratio)} | ${f1(em)} | ${f0(f1y)} | ${f0(f2y)} | ${f1(A.fuelShortPct)} | ${f1(A.w0Pct)} | ${f0(A.fisher)} | ${f0(A.lumber)} | ${xs.length}/${SEEDS.length} |`);
}
// ②b 100날마다 평균 끔비
L.push('');
L.push('100날마다 끔비(세 시드 인구 합 ÷ 끔 합 · 그 날 칸이 있는 시드만):');
L.push('');
L.push('| 팔 | ' + SNAPD.join(' | ') + ' |');
L.push('|' + '---|'.repeat(SNAPD.length + 1));
const ratioAt = (arm, d) => { let a = 0, b = 0, n = 0; for (const s of SEEDS) { const x = at(runs[`${arm}-${s}`], d), o = at(runs[`off-${s}`], d); if (x && o) { a += x.pop; b += o.pop; n++; } } return n && b ? a / b : null; };
for (const [arm, name] of ARMS) { L.push(`| ${name} | ${SNAPD.map((d) => f3(ratioAt(arm, d))).join(' | ')} |`); J.arms[arm].ratioByDay = Object.fromEntries(SNAPD.map((d) => [d, ratioAt(arm, d)])); }
// ③ 마을별 최악
L.push('');
L.push('## ③ 마을별 최악 — 730날 인구 ÷ 끔 같은 시드 같은 마을(끔 사람 10 이상인 마을만) 가장 낮은 다섯');
const kindOf = (name) => { for (const s of SEEDS) for (const [arm] of ARMS) { const v = runs[`${arm}-${s}`].vil[name]; if (v) return v.kind; } return '?'; };
const worstRows = (pairs) => pairs.filter((p) => p.off >= 10).sort((a, b) => a.ratio - b.ratio).slice(0, 5);
for (const [arm, name] of ON) {
  L.push(''); L.push(`### ${name}`); L.push('');
  const pooled = {};
  for (const s of SEEDS) {
    const r = runs[`${arm}-${s}`], o = runs[`off-${s}`], x = r.fin || lastS(r), xo = o.fin || lastS(o);
    if (!x || !xo) { L.push(`- 시드 ${s}: 판 없음`); continue; }
    const pairs = Object.keys(xo.vs).map((k) => ({ v: k, kind: kindOf(k), off: xo.vs[k][0], on: x.vs[k] ? x.vs[k][0] : 0 })).map((p) => Object.assign(p, { ratio: p.off ? p.on / p.off : null }));
    for (const p of pairs) { const q = pooled[p.v] || (pooled[p.v] = { v: p.v, kind: p.kind, off: 0, on: 0 }); q.off += p.off; q.on += p.on; }
    L.push(`- 시드 ${s}(${x.day}날): ` + worstRows(pairs).map((p) => `${p.v}[${p.kind}] ${p.on}/${p.off}=${f2(p.ratio)}`).join(' · '));
  }
  const pl = Object.values(pooled).map((p) => Object.assign(p, { ratio: p.off ? p.on / p.off : null }));
  const w = worstRows(pl.map((p) => Object.assign({}, p)));
  L.push(`- 세 시드 합: ` + w.map((p) => `${p.v}[${p.kind}] ${p.on}/${p.off}=${f2(p.ratio)}`).join(' · '));
  J.worst[arm] = w;
}
// ④ 마을 꼴별
const names = new Set(); for (const r of Object.values(runs)) for (const k in r.vil) names.add(k);
const lands = {}; for (const r of Object.values(runs)) for (const k in r.land) if (!lands[k]) lands[k] = r.land[k];
const wl = Object.values(lands).map((l) => l.wood).filter((v) => v != null).sort((a, b) => a - b), wt = wl.length ? wl[Math.floor(wl.length / 3)] : null;
const al = Object.values(lands).map((l) => l.water).filter((v) => v != null).sort((a, b) => a - b), at3 = al.length ? al[Math.floor(al.length / 3)] : null;
const GROUPS = [
  ['어촌(생선이 주식)', (k) => kindOf(k) === '어촌'],
  ['임업 마을', (k) => kindOf(k) === '임업'],
  [`숲이 먼 마을(땅 숲 하위 3분의 1 · wood ≤ ${wt})`, (k) => lands[k] && lands[k].wood != null && lands[k].wood <= wt],
  [`물이 먼 마을(땅 물 하위 3분의 1 · water ≤ ${at3})`, (k) => lands[k] && lands[k].water != null && lands[k].water <= at3],
  ['전체', () => true],
];
const statsFor = (arm, pred, winter) => {
  let vd = 0, w0 = 0, fsd = 0; const fpp = [], wpp = []; let pop = 0, empty = 0, n = 0, base = 0;
  for (const s of SEEDS) {
    const r = runs[`${arm}-${s}`], x = r.fin || lastS(r), o = runs[`off-${s}`], xo = o.fin || lastS(o);
    for (const k of Object.keys(r.vil)) {
      if (!pred(k)) continue; const v = r.vil[k], D = winter ? v.wvd : v.vd;
      if (D > 0) { vd += D; w0 += winter ? v.ww0 : v.w0; fsd += winter ? v.wfs : v.fs; fpp.push((winter ? v.wfpp : v.fpp) / D); wpp.push((winter ? v.wwpp : v.wpp) / D); }
      if (x && x.vs[k]) { pop += x.vs[k][0]; if (x.vs[k][0] === 0) empty++; n++; }
      if (xo && xo.vs[k]) base += xo.vs[k][0];
    }
  }
  return { vd, w0p: pc(w0, vd), fsp: pc(fsd, vd), fppMed: med(fpp), fppMin: fpp.length ? Math.min.apply(null, fpp) : null, wppMed: med(wpp), wppMin: wpp.length ? Math.min.apply(null, wpp) : null, pop, base, ratio: base ? pop / base : null, empty, nVil: n };
};
L.push('');
L.push('## ④ 마을 꼴별(세 시드를 마을-시드로 합침 · 가운데/최저는 마을-시드 단위의 날 평균값)');
for (const [gname, pred] of GROUPS) {
  const members = [...names].filter(pred); L.push(''); L.push(`### ${gname} — 마을 ${members.length}곳`); L.push('');
  L.push('| 팔 | 730날 인구 합 | 끔비 | 빈 마을-시드 | 나무꾼 0 마을-날 % | 땔감 모자란 마을-날 % | 생선÷사람 가운데/최저 | 통나무÷사람 가운데/최저 | 겨울 나무꾼 0 % | 겨울 땔감 모자란 % | 겨울 생선÷사람 가운데/최저 | 겨울 통나무÷사람 가운데/최저 |');
  L.push('|' + '---|'.repeat(12));
  J.groups[gname] = { n: members.length, arms: {} };
  for (const [arm, name] of ARMS) {
    const a = statsFor(arm, pred, false), w = statsFor(arm, pred, true);
    J.groups[gname].arms[arm] = { all: a, winter: w };
    L.push(`| ${name} | ${f0(a.pop)} | ${arm === 'off' ? '—' : f3(a.ratio)} | ${a.empty}/${a.nVil} | ${f1(a.w0p)} | ${f1(a.fsp)} | ${f2(a.fppMed)}/${f2(a.fppMin)} | ${f2(a.wppMed)}/${f2(a.wppMin)} | ${f1(w.w0p)} | ${f1(w.fsp)} | ${f2(w.fppMed)}/${f2(w.fppMin)} | ${f2(w.wppMed)}/${f2(w.wppMin)} |`);
  }
}
// ⑤ 겨울 석 달 전체
L.push('');
L.push('## ⑤ 겨울 석 달(12 ~ 2월) — 생선 · 땔감 · 통나무');
L.push('');
L.push('- 위 ④ 의 "전체" 줄의 겨울 칸이 같은 값이다(마을-시드 전부). 꼴별 겨울 칸은 각 꼴 표 오른쪽 네 칸.');
// ⑥ 죽은 판
L.push('');
L.push('## ⑥ 죽거나 멎은 판');
L.push('');
const bad = Object.values(runs).filter((r) => (r.rc != null && r.rc !== 0) || (r.rc === 0 && !r.fin));
if (!bad.length) L.push('없음');
for (const r of bad) {
  const heap = ['out', 'log'].some((e) => tail(path.join(R, 'runs', `${r.arm}-${r.seed}.${e}`), 60).some((l) => /heap out of memory|JavaScript heap|allocation failed/i.test(l)));
  L.push(`- ${r.arm}-${r.seed} · rc ${r.rc}${r.rc === 124 ? '(상한 — 안 끝남)' : ''} · ${r.sec}초 · 죽은(마지막) 날 ${r.lastDay} · 까닭 ${heap ? '힙 넘침' : '예외 · 기타'}${r.err ? ' · 관찰기 오류 ' + r.err.slice(0, 100) : ''}`);
  for (const x of tail(path.join(R, 'runs', `${r.arm}-${r.seed}.out`), 3)) L.push('    ' + x.slice(0, 160));
}
// ⑦ 한 줄 답 · 첫 줄 후보
const holds = {};
for (const [arm] of ON) {
  const A = J.arms[arm], off = J.arms.off;
  holds[arm] = { ratioOk: A.ratio != null && A.ratio > 0.95, emptyOk: A.n > 0 && A.empty === 0, fdOk: A.fd1 != null && off.fd1 != null && (A.fd1 + A.fd2) <= (off.fd1 + off.fd2) * 1.2 + 10 };
  holds[arm].ok = holds[arm].ratioOk && holds[arm].emptyOk && holds[arm].fdOk && A.n === SEEDS.length;
  const bd = SNAPD.find((d) => { const q = ratioAt(arm, d); return q != null && q <= 0.95; });
  holds[arm].breakDay = bd == null ? null : bd;
  const ev = []; for (const s of SEEDS) { const r = runs[`${arm}-${s}`]; const e = r.snaps.find((q) => q.empty > 0); if (e) ev.push(`시드 ${s} ${e.day}날`); } holds[arm].firstEmpty = ev;
}
J.holds = holds;
L.push('');
L.push('## ⑦ 한 줄 답(스크립트가 낸 판정 — 끔비 > 0.95 · 빈 마을 0 · 굶어 죽음 ≤ 끔 × 1.2 + 10)');
L.push('');
for (const [arm, name] of ON) { const h = holds[arm]; L.push(`- ${name}: 끔비 ${f3(J.arms[arm].ratio)} ${h.ratioOk ? 'ok' : '미달'} · 빈 마을 평균 ${f1(J.arms[arm].empty)} ${h.emptyOk ? 'ok' : '있음'} · 굶어 죽음(2해 합) ${f0(J.arms[arm].fd1 + J.arms[arm].fd2)} : 끔 ${f0(J.arms.off.fd1 + J.arms.off.fd2)} ${h.fdOk ? 'ok' : '많음'} → ${h.ok ? '버팀' : '안 버팀'}${h.breakDay != null ? ` · 끔비 0.95 이하가 처음 보인 칸 ${h.breakDay}날` : ''}${h.firstEmpty.length ? ` · 빈 마을 처음 ${h.firstEmpty.join(', ')}` : ''}`); }
let weak = null; for (const arm of ['fish', 'wood', 'both']) for (const p of (J.worst[arm] || []).slice(0, 1)) if (!weak || p.ratio < weak.ratio) weak = Object.assign({ arm }, p);
const allOk = ON.every(([a]) => holds[a].ok), bad2 = Object.values(runs).filter((r) => r.rc != null && r.rc !== 0).length;
const sumSeeds = (arm) => J.arms[arm].pops.map(f0).join(' · ');
const offPops = SEEDS.map((s) => runs[`off-${s}`].fin ? f0(runs[`off-${s}`].fin.pop) : '—').join(' · ');
const first = `730날 인구 끔 ${offPops} / 어부 ${f0(J.arms.fish.pop)} / 나무꾼 ${f0(J.arms.wood.pop)} / 둘 ${f0(J.arms.both.pop)} · 빈 마을 ${ON.map(([a]) => f1(J.arms[a].empty)).join(' · ')} · 굶어 죽음 ${f0(J.arms.off.fd1 + J.arms.off.fd2)} → ${ON.map(([a]) => f0(J.arms[a].fd1 + J.arms[a].fd2)).join(' · ')} · 가장 약한 마을 ${weak ? `${weak.v}(${weak.arm === 'fish' ? '어부' : weak.arm === 'wood' ? '나무꾼' : '둘'} · 끔비 ${f2(weak.ratio)})` : '계측 없음'} · 땔감 모자란 마을-날 ${ON.map(([a]) => f1(J.arms[a].fuelShortPct)).join(' · ')} % · 버팀 ${allOk ? '예(셋 다)' : ON.map(([a, n]) => `${n} ${holds[a].ok ? '예' : '아니오'}`).join(' · ')} · 죽은 판 ${bad2} · 회부 ○`;
L.push(''); L.push('## ⑧ 보고 첫 줄 후보(회부 수만 손으로)'); L.push(''); L.push(first);
J.firstLine = first;
const txt = L.join('\n');
console.log(txt);
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'table.txt'), txt + '\n');
fs.writeFileSync(path.join(OUTDIR, 'table.json'), JSON.stringify(J, null, 1));
