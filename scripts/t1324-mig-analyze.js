#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1324 판 분석 · 제품 무변)
// =============================================================================
// scripts/t1324-mig-analyze.js — 두 존 가상 시계 판(`t1324-vclock-beast.js run … --env T1324_XZ_MIGRATE=1 --nobeast`)의 주민 이주 장부를 열쇠마다 맞춘다.
//
//   읽는 것: 존 로그 `z_<표지>_<존>.log` 의 `[T1324] 이주 <열쇠> …` 줄(제품 `_xzLog` — 켬일 때만 찍힌다) · 표본 `beast_<표지>.jsonl`(`/perf` 의 `t1324` 셈) ·
//            T1292 분석 끝 칸(존 인구 · 굶어 죽음 — `node scripts/t1292-xzone-live.js analyze` 를 먼저 돌려 `an1292_<표지>.json` 으로 둔다 · 없으면 빈칸).
//   열쇠 = `<보낸 존>:<부팅>:<번호>` — 한 사람 한 열쇠. 열쇠마다 끝 자리 하나:
//     건넘(보낸 존 넘김 OK · dup) → 받는 존 넘어옴 정확히 1 → 닿음 | 길 위 죽음(in) | 판 끝 받는 존 길 위
//     집으로(못 넘음) → 집에 돌아옴 | 길 위 죽음(back) | 판 끝 보낸 존 길 위
//     판 끝 보낸 존 길 위(넘기 전 · 답 모름 포함) | 길 위 죽음(out)
//   어긋남(빨강): 받는 존 넘어옴 2 이상(둘) · 넘어옴인데 떠남 없음 · 건넘인데 넘어옴 0(사라짐 — 답 OK 뒤 받는 존에 없다) ·
//                 집에 돌아옴 + 닿음 둘 다 · 넘어옴인데 보낸 존이 집으로(되돌림 + 받음 = 둘).
//   쓰는 법: node scripts/t1324-mig-analyze.js <outdir> <표지> [--json <파일>] · 두 판 날 줄 견줌: <outdir> <표지> --cmp <outdir2> <표지2>
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [OUTD, TAG] = process.argv.slice(2);
//   `--cmp <outdir2> <표지2>` — 두 판의 날 줄(T1292 훅 `rows_<표지>_<존>.jsonl`)을 날마다 견준다(시각 칸 뺀 econ · 경계 셈 칸) → 첫 갈린 날(존마다)
if (process.argv.includes('--cmp')) {
  const i = process.argv.indexOf('--cmp'), O2 = process.argv[i + 1], T2 = process.argv[i + 2];
  const keyOf = (r) => JSON.stringify({ day: r.day, g: r.g, pop: r.pop, dead: r.dead, ever: r.ever, deaths: r.deaths, fdDeaths: r.fdDeaths, trades: r.trades, caravans: r.caravans, bodies: r.bodies,
    xzBodies: r.xzBodies, xzLinger: r.xzLinger, xzHidden: r.xzHidden, st: r.xz && r.xz.st, core: r.xz && r.xz.core, stubs: r.xz && r.xz.stubs, retry: r.xz && r.xz.retry });
  const rd = (o, t, z) => { const f = path.join(o, `rows_${t}_${z}.jsonl`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
  const res = {};
  for (const z of ['hanbando', 'nippon']) {
    const A = rd(OUTD, TAG, z), B = rd(O2, T2, z), n = Math.min(A.length, B.length);
    let first = null; for (let d = 0; d < n; d++) if (keyOf(A[d]) !== keyOf(B[d])) { first = A[d].day; break; }
    res[z] = { daysA: A.length, daysB: B.length, compared: n, firstDiff: first, lastA: A.length ? { day: A[A.length - 1].day, pop: A[A.length - 1].pop, fdDeaths: A[A.length - 1].fdDeaths } : null, lastB: B.length ? { day: B[B.length - 1].day, pop: B[B.length - 1].pop, fdDeaths: B[B.length - 1].fdDeaths } : null };
  }
  console.log(JSON.stringify({ a: TAG, b: T2, res }, null, 1));
  process.exit(0);
}
const jout = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (!OUTD || !TAG) { console.error('쓰는 법: <outdir> <표지> [--json 파일]'); process.exit(2); }
const ZS = ['hanbando', 'nippon'];
const K = new Map();   // 열쇠 → { from, ev: [[존, 갈래, 덧]] }
const key = (k) => { let o = K.get(k); if (!o) { o = { from: k.split(':')[0], ev: [] }; K.set(k, o); } return o; };
const gran = [];   // 닿음 줄 — 받는 마을 곳간 · 인구 · 길 날
const heard = [];  // 떠남 줄 — 들은 곳간 · 인구 · 행복
const gaps = [];   // 넘김 순간 몸과 경계 칸 사이(px · 몸 없음 null)
const re = /\[T1324\] 이주 (\S+) (떠남|넘김 OK|넘김 dup|답 모름|못 넘음|넘어옴|길 위 죽음|닿음|집에 돌아옴|다시 고름)(.*)$/;
for (const z of ZS) {
  const f = path.join(OUTD, `z_${TAG}_${z}.log`);
  if (!fs.existsSync(f)) { console.error('로그 없음', f); continue; }
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = re.exec(line); if (!m) continue;
    const o = key(m[1]); o.ev.push([z, m[2], m[3]]);
    if (m[2] === '넘김 OK' || m[2] === '넘김 dup') { const g = /몸 경계 칸까지 (\d+)px/.exec(m[3]); gaps.push(g ? +g[1] : null); }
    if (m[2] === '닿음') { const g = /: (.+?) · 인구 (\d+) · 곳간 ([\d.?]+) · 길 (-?\d+)날/.exec(m[3]); if (g) gran.push({ key: m[1], zone: z, vil: g[1], n: +g[2], fe: g[3] === '?' ? null : +g[3], days: +g[4] }); }
    if (m[2] === '떠남') { const g = /: (.+?) 주민 1명 → (.+?)@(\S+) · .* 들은 줄 (\S+)날 곳간 (\S+) 인구 (\S+) 행복 (\S+)$/.exec(m[3]); if (g) heard.push({ key: m[1], from: g[1], to: g[2], toZone: g[3], d: +g[4], fe: +g[5], n: +g[6], h: +g[7] }); }
  }
}
const C = { keys: 0, depart: 0, crossed: 0, crossedDup: 0, unknownEv: 0, back: 0, home: 0, inRecv: 0, arrive: 0, deadOut: 0, deadBack: 0, deadIn: 0,
  transitOut: 0, transitBack: 0, transitIn: 0, byDir: {} };
const bad = { twoIn: [], inNoDepart: [], crossedNoIn: [], homeAndArrive: [], backAndIn: [], noDepart: [] };
for (const [k, o] of K) {
  C.keys++;
  const has = (z, t) => o.ev.filter((e) => (z == null || e[0] === z) && e[1] === t).length;
  const from = o.from, to = ZS.find((z) => z !== from);
  const dep = has(from, '떠남'), ok = has(from, '넘김 OK'), dup = has(from, '넘김 dup'), back = has(from, '못 넘음'), home = has(from, '집에 돌아옴');
  const inn = has(to, '넘어옴'), arr = has(to, '닿음');
  const dOut = o.ev.filter((e) => e[0] === from && e[1] === '길 위 죽음' && /out/.test(e[2])).length;
  const dBack = o.ev.filter((e) => e[0] === from && e[1] === '길 위 죽음' && /back/.test(e[2])).length;
  const dIn = o.ev.filter((e) => e[0] === to && e[1] === '길 위 죽음').length;
  C.unknownEv += has(from, '답 모름'); C.reroute = (C.reroute || 0) + o.ev.filter((e) => e[1] === '다시 고름').length;
  if (!dep) { bad.noDepart.push(k); }
  C.depart += dep ? 1 : 0;
  const dir = `${from}→${to}`; C.byDir[dir] = C.byDir[dir] || { depart: 0, crossed: 0, arrive: 0, home: 0, dead: 0 }; if (dep) C.byDir[dir].depart++;
  if (inn > 1) bad.twoIn.push(k);
  if (inn && !dep) bad.inNoDepart.push(k);
  if (home && arr) bad.homeAndArrive.push(k);
  if (back && inn) bad.backAndIn.push(k);
  if (ok || dup) {
    C.crossed++; if (!ok && dup) C.crossedDup++; C.byDir[dir].crossed++;
    if (!inn) bad.crossedNoIn.push(k);
  }
  if (inn) { C.inRecv++; if (arr) { C.arrive++; C.byDir[dir].arrive++; } else if (dIn) { C.deadIn++; C.byDir[dir].dead++; } else C.transitIn++; }
  else if (back) { C.back++; if (home) { C.home++; C.byDir[dir].home++; } else if (dBack) { C.deadBack++; C.byDir[dir].dead++; } else C.transitBack++; }
  else if (dOut) { C.deadOut++; C.byDir[dir].dead++; }
  else if (dep && !(ok || dup)) C.transitOut++;
}
//   표본 끝 — `/perf` 의 t1324 셈(존마다 마지막 표본)
const last = {};
const bf = path.join(OUTD, `beast_${TAG}.jsonl`);
if (fs.existsSync(bf)) for (const line of fs.readFileSync(bf, 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch (e) { continue; } if (j.op === 'xz' && j.z && j.t1324) last[j.z] = j.t1324; }
{ const mf = path.join(OUTD, `meta_${TAG}.json`); if (fs.existsSync(mf)) { try { const M = JSON.parse(fs.readFileSync(mf, 'utf8')); for (const z of ZS) if (M.perfEnd && M.perfEnd[z] && M.perfEnd[z].t1324) last[z] = M.perfEnd[z].t1324; } catch (e) {} } }   // 판 끝 관측이 있으면 그것(죽이기 전)
for (const z of ZS) if (last[z]) delete last[z].rows;   // 줄 낱장은 뺀다(셈만)
let an = null; const af = path.join(OUTD, `an1292_${TAG}.json`); if (fs.existsSync(af)) { try { an = JSON.parse(fs.readFileSync(af, 'utf8').replace(/^[^{]*/, '')); } catch (e) { an = null; } }
const fin = an && an.final ? Object.fromEntries(ZS.map((z) => [z, an.final[z] ? { pop: an.final[z].pop, deaths: an.final[z].deaths, fdDeaths: an.final[z].fdDeaths } : null])) : null;
const red = Object.values(bad).reduce((a, b) => a + b.length, 0);
//   맞춤: 떠남 = 닿음 + 집에 돌아옴 + 길 위 죽음 + 판 끝 길 위(보낸 존 · 받는 존)
const sum = C.arrive + C.home + C.deadOut + C.deadBack + C.deadIn + C.transitOut + C.transitBack + C.transitIn;
const out = { tag: TAG, counts: C, balance: { depart: C.depart, sum, ok: C.depart === sum }, bad: Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, { n: v.length, sample: v.slice(0, 5) }])), red,
  gap: (() => { const g = gaps.filter((x) => x != null).sort((a, b) => a - b); return { n: gaps.length, body: g.length, noBody: gaps.length - g.length, p50: g.length ? g[Math.floor(g.length / 2)] : null, max: g.length ? g[g.length - 1] : null, over32: g.filter((x) => x > 32).length }; })(),
  granary: gran, heard, perfLast: last, final: fin };
console.log(JSON.stringify(out, null, 1));
if (jout) fs.writeFileSync(jout, JSON.stringify(out, null, 1));
process.exit(red === 0 && C.depart === sum ? 0 : 1);
