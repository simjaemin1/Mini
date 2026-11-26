#!/usr/bin/env node
// === scripts/t1492-table.js — T1492 표(손 셈 0): 판 자료에서 낸다 → <R>/table.txt · table.json · first-line.txt ===
//   쓰는 법: R=<자료 폴더> [REF=origin/batch/on-table-bots-1126] [REFER=<회부 수>] node scripts/t1492-table.js
//   자료 폴더: runs/<이름>/ — 긴 판(progress.json · seg-<날>.bots.json · sbc-<시드>.json) · 짧은 판(bots.json · sbc.json · probe.json) · done.txt · dead.txt · jobs.tsv
//   판 이름: <팔>-<시드>[-<날>] — 팔 = off · terrseq · nobuild · react · npcdeath · all4 · nd-u0 · nd-u1(봇 손짓 0 · NPC_DEATH 켬 · BEAST_UNSEEN 끔/켬) · prof-<팔> · ss-<팔> · jp-<팔>(닛폰)
//   T1486 견줌(지문): REF 가지의 계측/T1486_2026-11-25/runs/<팔>-<시드>.json 을 git 으로 읽는다(날 1 ~ 60 날 줄 · 20날마다 DB 행).
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = process.env.R || process.argv[2]; if (!R) { console.error('R=<폴더>'); process.exit(2); }
const RUNS = path.join(R, 'runs'), REF = process.env.REF || 'origin/batch/on-table-bots-1126', REFER = process.env.REFER || '○';
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const med = (a) => { a = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const f = (x, n = 2) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(n));
const mb = (b) => (b == null ? null : b / 1048576);
const pct = (a, b) => (a == null || !b ? '—' : ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(0) + ' %');
const L = []; const W = (s = '') => L.push(s);
const OUTJ = { runs: {}, item1: {}, item2: {}, item3: {}, item4: {}, item5: {}, fp: {} };
const done = {}; try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [n, rc, dt] = l.trim().split(/\s+/); if (n) done[n] = { rc: +rc, sec: +dt }; } } catch (e) {}
const deadLines = (() => { try { return fs.readFileSync(path.join(R, 'dead.txt'), 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } })();
const jobs = (() => { try { return fs.readdirSync(R).filter((x) => /^jobs.*\.tsv$/.test(x)).sort((a, b) => (a === 'jobs.tsv' ? -1 : b === 'jobs.tsv' ? 1 : a < b ? -1 : 1)).map((x) => fs.readFileSync(path.join(R, x), 'utf8')).join('\n').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [name, kind, days, seed, acts, zone, probe, envs] = l.split('\t'); return { name, kind, days: +days, seed: +seed, acts, zone, probe, envs }; }); } catch (e) { return []; } })();

// ── 판 하나 읽기(긴 판 = 마디 이음 · 짧은 판 = 하나) ──
function load(name) {
  const dir = path.join(RUNS, name); if (!fs.existsSync(dir)) return null;
  const job = jobs.find((j) => j.name === name) || {};
  let segs = [];
  if (fs.existsSync(path.join(dir, 'bots.json'))) segs = [{ from: 0, rec: J(path.join(dir, 'bots.json')) }];
  else segs = fs.readdirSync(dir).map((x) => (x.match(/^seg-(\d+)\.bots\.json$/) || [])[1]).filter((x) => x != null).map(Number).sort((a, b) => a - b).map((from) => ({ from, rec: J(path.join(dir, `seg-${from}.bots.json`)) })).filter((s) => s.rec);
  if (!segs.length) return null;
  const days = new Map(), db = new Map(), spd = new Map();
  for (const s of segs) {
    const rows = s.rec.days || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (r.d < s.from) continue;
      days.set(r.d, Object.assign({}, r, { seg: s.from }));
      if (i > 0 && rows[i - 1].d === r.d - 1 && r.d > s.from + 1) spd.set(r.d, r.wall - rows[i - 1].wall);   // 마디 첫 날(부팅 · 되살림)은 뺀다
    }
    for (const o of s.rec.db || []) if (o && o.d != null && !db.has(o.d)) db.set(o.d, o);   // 그 날 첫 줄(날 중 20날 셈) — 마디 끝 줄(멈춤 경계 저장 뒤 · WAL 이 큼)은 안 쓴다
  }
  const ds = [...days.keys()].sort((a, b) => a - b), last = ds.length ? days.get(ds[ds.length - 1]) : null;
  const prog = J(path.join(dir, 'progress.json')), lastRec = segs[segs.length - 1].rec;
  const sum = (k) => segs.reduce((a, s) => a + ((s.rec.g && s.rec.g[k.split('.')[0]] && s.rec.g[k.split('.')[0]][k.split('.')[1]]) | 0), 0);
  return { name, job, dir, segs, days, db, spd, ds, last, lastD: last ? last.d : 0, prog, lastRec, sum, done: done[name], probe: J(path.join(dir, 'probe.json')), sbc: J(path.join(dir, 'sbc.json')) || J(path.join(dir, `sbc-${job.seed}.json`)) };
}
const names = fs.existsSync(RUNS) ? fs.readdirSync(RUNS).filter((x) => fs.statSync(path.join(RUNS, x)).isDirectory()).sort() : [];
const RUN = {}; for (const n of names) { const r = load(n); if (r) RUN[n] = r; }
const winSpd = (r, a, b) => { const v = []; for (const [d, s] of r.spd) if (d > a && d <= b) v.push(s); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const dbAt = (r, d) => { let best = null; for (const [k, o] of r.db) if (k <= d && k > d - 20 && (!best || k > best.d)) best = o; return best; };   // 그 날(또는 앞 20날 안 마지막) DB 줄
const row = (r, d) => r.days.get(d) || null;
const deadOf = (n) => deadLines.filter((l) => l.startsWith(n + ' '));

// ── 판 목록 ──
W('## 판 목록'); W('');
W('| 판 | 꼴 | 날(목표 → 닿음) | 손짓 | 존 | 손잡이 env | 끝 | 걸린 시간 | 마디 | 끊김 · 죽음 |');
W('|---|---|---|---|---|---|---|---|---|---|');
const allNames = [...new Set(jobs.map((j) => j.name).concat(Object.keys(RUN)))];
let deadRuns = 0, cutRuns = 0;
for (const n of allNames) {
  const r = RUN[n], j = jobs.find((x) => x.name === n) || {}, dl = deadOf(n), d = done[n];
  const st = d ? (d.rc === 0 ? '끝' : `코드 ${d.rc}`) : (r ? '덜 돎' : '안 띄움');
  if (!d || d.rc !== 0) cutRuns++;
  if (dl.length) deadRuns++;
  const segN = r && r.prog ? r.prog.segs.length : (r ? 1 : 0);
  W(`| ${n} | ${j.kind || '—'} | ${j.days || '—'} → ${r ? r.lastD : 0} | ${j.acts || '—'} | ${j.zone && j.zone !== '-' ? j.zone : '한반도'} | ${j.envs && j.envs !== '-' ? j.envs.replace(/,/g, ' ') : '(없음)'} | ${st} | ${d ? f(d.sec / 3600, 1) + ' h' : '—'} | ${segN} | ${dl.length ? dl.length + ': ' + dl.map((l) => l.split(' ').slice(1).join(' ')).join(' / ') : '0'} |`);
  OUTJ.runs[n] = { kind: j.kind, target: j.days, reached: r ? r.lastD : 0, status: st, sec: d ? d.sec : null, dead: dl };
}
W(''); W(`죽은 판(끊겨 체크포인트에서 이은 판 포함) ${deadRuns} · 다 못 돈 판 ${cutRuns}`); W('');

// ── 지문: 끈 판 날 1 ~ 60 = main 기본 판(이 main · T1486 판 자 그대로 · 마디 없음 `main-off-<시드>`) · 곁에 T1486 판(옛 main) ──
W('## 지문 — 끈 판 날 1 ~ 60 = main 기본 판'); W('');
W('견줌 둘: ⓐ 이 main(6896843ae)에서 T1486 판 자 그대로(`t577-server-run` · 마디 없음) 돈 `main-off-<시드>` · ⓑ T1486 판(옛 main 9d5c764c0 · git 에서 읽음). 잣대 = 날마다 인구 · 빈 마을 · 굶음 · 죽음 · 떠남 + 날 20 · 40 · 60 `village_buildings` 행.'); W('');
W('| 판 | 견준 판 | 견준 날 | 인구 · 빈 마을 · 굶음 · 죽음 · 떠남 같은 날 | village_buildings 행(날 20 · 40 · 60 · 견준 판/이 판) | stopSleep(날 60 · 견준 판/이 판) | 같음 |'); W('|---|---|---|---|---|---|---|');
const refCache = {};
function ref(tag) { if (tag in refCache) return refCache[tag]; let o = null; try { o = JSON.parse(execFileSync('git', ['-C', path.join(__dirname, '..'), 'show', `${REF}:계측/T1486_2026-11-25/runs/${tag}.json`], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { o = null; } return (refCache[tag] = o); }
let fpSame = 0, fpN = 0, fpMainSame = 0, fpMainN = 0;
function fpCmp(n, r, oName, oDays, oDb, oSS) {
  const K = ['pop', 'empty', 'fd', 'dead', 'emig'];
  let same = 0, tot = 0, firstDiff = null;
  for (const x of oDays) { if (x.d > 60) break; const y = row(r, x.d); if (!y) continue; tot++; if (K.every((k) => x[k] === y[k])) same++; else if (firstDiff == null) firstDiff = x.d; }
  const vbOf = (d) => { const a = oDb(d), b = r.db.get(d); return [a ? a.vb : null, b ? b.vb : null]; };
  const vb = [20, 40, 60].map((d) => { const [a, b] = vbOf(d); return a != null && b != null ? `${a}/${b}` : '—'; }).join(' · ');
  const vbSame = [20, 40, 60].every((d) => { const [a, b] = vbOf(d); return a == null || b == null || a === b; });
  const y = row(r, 60), ss = `${oSS != null ? oSS : '—'}/${y && y.beast ? y.beast.stopSleep : '—'}`;
  const ok = tot > 0 && same === tot && vbSame;
  W(`| ${n} | ${oName} | ${tot} | ${same}/${tot}${firstDiff != null ? ' (첫 갈림 날 ' + firstDiff + ')' : ''} | ${vb} | ${ss} | ${ok ? '같음' : (same === tot ? '날 줄 같음 · 행 다름' : '다름')} |`);
  return { tot, same, firstDiff, vbSame, ok };
}
for (const n of Object.keys(RUN)) {
  const m = n.match(/^(off|react|nobuild|npcdeath|terrseq)-(\d+)$/) || n.match(/^(?:ss|prof|cnt|main)-(off|react|nobuild)-(\d+)$/); if (!m) continue;
  const r = RUN[n];
  const mn = RUN['main-' + m[1] + '-' + m[2]];
  if (mn && mn !== r) { const o = fpCmp(n, r, mn.name + '(이 main)', mn.ds.map((d) => mn.days.get(d)), (d) => mn.db.get(d), (() => { const z = row(mn, 60); return z && z.beast ? z.beast.stopSleep : null; })()); fpMainN++; if (o.ok) fpMainSame++; OUTJ.fp[n + ' ~ main'] = o; }
  const o = ref(`${m[1]}-${m[2]}`); if (!o) continue;
  const c = fpCmp(n, r, `T1486 ${m[1]}-${m[2]}(옛 main)`, o.days, (d) => (o.db || []).find((q) => q.d === d), o.t1423 && o.t1423.stopSleep);
  fpN++; if (c.ok) fpSame++; OUTJ.fp[n + ' ~ T1486'] = c;
}
W(''); W(`지문 같음 — 이 main 기본 판과 ${fpMainSame}/${fpMainN} · T1486 판(옛 main)과 ${fpSame}/${fpN}`); W('');

// ── ① TERR_SEQ 800날 ──
const SEEDS1 = [...new Set(Object.keys(RUN).map((n) => (n.match(/^(?:off|terrseq)-(\d+)$/) || [])[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
W('## ① T1433_TERR_SEQ 800날 — 100날마다(끔 → 켬)'); W('');
W('| 시드 | 날 | 건물 행 village_buildings | 영토 낱칸 terr 행 · 묶음 terrseq 행 | DB(본체+WAL) MB | 영토 칸(마을 `_terrSet` 합) | 마을(산 것 / 전부) | 인구 | 하루 걸린 초(앞 100날 평균) | 행 켬/끔 |');
W('|---|---|---|---|---|---|---|---|---|---|');
const I1 = {};
for (const s of SEEDS1) {
  const off = RUN['off-' + s], on = RUN['terrseq-' + s]; if (!off && !on) continue;
  I1[s] = [];
  for (let d = 100; d <= 800; d += 100) {
    const a = off && dbAt(off, d), b = on && dbAt(on, d), ra = off && row(off, d), rb = on && row(on, d);
    if (!a && !b && !ra && !rb) continue;
    const pr = (x, y, fn, n = 0) => `${x ? f(fn(x), n) : '—'} → ${y ? f(fn(y), n) : '—'}`;
    const ratio = a && b ? b.vb / a.vb : null;
    I1[s].push({ d, vbOff: a && a.vb, vbOn: b && b.vb, dbOff: a && mb(a.db + a.wal), dbOn: b && mb(b.db + b.wal), terrOff: ra && ra.terr, terrOn: rb && rb.terr, spdOff: off && winSpd(off, d - 100, d), spdOn: on && winSpd(on, d - 100, d), popOff: ra && ra.pop, popOn: rb && rb.pop, ratio });
    W(`| ${s} | ${d} | ${pr(a, b, (x) => x.vb)} | ${a ? a.terr + ' · ' + a.seq : '—'} → ${b ? b.terr + ' · ' + b.seq : '—'} | ${pr(a, b, (x) => mb(x.db + x.wal), 1)} | ${pr(ra, rb, (x) => x.terr)} | ${ra ? (ra.vills - ra.empty) + '/' + ra.vAll : '—'} → ${rb ? (rb.vills - rb.empty) + '/' + rb.vAll : '—'} | ${pr(ra, rb, (x) => x.pop)} | ${f(off && winSpd(off, d - 100, d), 1)} → ${f(on && winSpd(on, d - 100, d), 1)} | ${f(ratio, 3)} |`);
  }
}
W('');
// 다시 불어남 — 시드마다: 켬/끔 행 비가 가장 낮은 날 · 그 뒤 100날 사이 켬의 행 늚(Δ)이 끔의 행 늚 이상인 첫 날(= 틈이 안 벌어지고 좁혀지기 시작) · 400날 뒤에도 켬 < 끔인가
W('| 시드 | 행 켬/끔 비(100 · 200 · … 날) | 비 최저 날 | 400날 뒤에도 켬 < 끔 | 다시 불어난 첫 날(켬 100날 늚 ≥ 끔 100날 늚) | 그 100날 늚 켬 · 끔 |'); W('|---|---|---|---|---|---|');
const regrow = [];
for (const s of Object.keys(I1)) {
  const P = I1[s].filter((x) => x.ratio != null); if (!P.length) continue;
  const minP = P.reduce((m, x) => (x.ratio < m.ratio ? x : m), P[0]);
  const after400 = P.filter((x) => x.d > 400); const below = after400.length ? after400.every((x) => x.vbOn < x.vbOff) : null;
  let rg = null;
  for (let i = 1; i < P.length; i++) { if (P[i].d - P[i - 1].d !== 100) continue; const dOn = P[i].vbOn - P[i - 1].vbOn, dOff = P[i].vbOff - P[i - 1].vbOff; if (dOn >= dOff) { rg = { d: P[i].d, dOn, dOff }; break; } }
  regrow.push({ s, rg, minD: minP.d, below, lastD: P[P.length - 1].d });
  W(`| ${s} | ${P.map((x) => f(x.ratio, 3)).join(' · ')} | ${minP.d} | ${below == null ? '(400날 못 닿음)' : below ? '예' : '아니오'} | ${rg ? rg.d : '없음(' + P[P.length - 1].d + '날까지)'} | ${rg ? rg.dOn + ' · ' + rg.dOff : '—'} |`);
}
OUTJ.item1 = { rows: I1, regrow };
W('');

// ── ② 다리 머리 느려짐 ──
W('## ② 다리 머리가 막힌 세계 — 하루 걸린 초의 주인'); W('');
const P2 = RUN['prof-off-1020'], P2n = RUN['prof-nobuild-1020'];
function profDays(r) { return r && r.probe ? r.probe.days.filter((x) => x.d >= 1 && x.prof) : []; }
const pd = profDays(P2), pdn = profDays(P2n);
let owner = null;
if (pd.length) {
  const walls = pd.filter((x) => x.d >= 2).map((x) => x.wall), m = med(walls);
  const spike = pd.filter((x) => x.d >= 2 && x.wall > m * 1.8), calm = pd.filter((x) => x.d >= 2 && x.wall <= m * 1.3);
  W(`프로파일 판 prof-off-1020(날 ${pd[0].d} ~ ${pd[pd.length - 1].d}): 하루 벽시계 가운데 ${f(m, 1)} 초 · 튄 날(가운데 ×1.8 넘음) ${spike.map((x) => x.d + '(' + f(x.wall, 0) + ' 초)').join(' · ')} · 고른 날 ${calm.length}`); W('');
  const agg = (D) => { const t = new Map(); for (const x of D) for (const [k, ms] of x.prof.top) t.set(k, (t.get(k) || 0) + ms); for (const [k, v] of t) t.set(k, v / Math.max(1, D.length)); return t; };
  const A = agg(spike), B = agg(calm);
  const diff = [...new Set([...A.keys(), ...B.keys()])].map((k) => [k, (A.get(k) || 0) - (B.get(k) || 0), A.get(k) || 0, B.get(k) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  //   호출 수 = 셈 판 cnt-off-1020(같은 시드 · 같은 손짓 · 함수 선언 몸 첫머리 셈 · 프로파일 없음) — 그 판의 튄 날 · 고른 날(같은 문턱)로 가른다
  const C = RUN['cnt-off-1020'] && RUN['cnt-off-1020'].probe ? RUN['cnt-off-1020'].probe.days.filter((x) => x.d >= 2 && x.calls) : [];
  const cm = med(C.map((x) => x.wall)), cSpike = C.filter((x) => x.wall > cm * 1.8), cCalm = C.filter((x) => x.wall <= cm * 1.3);
  const cnt = (D, fn) => { const nm = fn.split(' @')[0], src = D === spike ? cSpike : cCalm; if (!src.length) return null; return src.reduce((a, x) => a + (x.calls[nm] | 0), 0) / src.length; };
  if (C.length) { const names = [...new Set(C.flatMap((x) => Object.keys(x.calls)))]; W(`셈 판 cnt-off-1020: 튄 날 ${cSpike.map((x) => x.d).join(' · ')} · 함수 호출 수/날(튄 날 평균 ↔ 고른 날 평균) — ` + names.map((n) => `\`${n}\` ${f(cSpike.reduce((a, x) => a + (x.calls[n] | 0), 0) / Math.max(1, cSpike.length), 0)} ↔ ${f(cCalm.reduce((a, x) => a + (x.calls[n] | 0), 0) / Math.max(1, cCalm.length), 0)}`).join(' · ')); W(''); }
  W('| 함수(자기 시간) | 튄 날 − 고른 날 ms/날 | 튄 날 ms/날 | 고른 날 ms/날 | 호출 수/날 튄 날 · 고른 날 |'); W('|---|---|---|---|---|');
  for (const [k, dd, a, b] of diff) W(`| \`${k}\` | ${f(dd, 0)} | ${f(a, 0)} | ${f(b, 0)} | ${f(cnt(spike, k), 0)} · ${f(cnt(calm, k), 0)} |`);
  //   주인 = 튄 날에만 도는 함수(셈 판에서 튄 날 ≥ 1번 · 고른 날 0번) 가운데 자기 시간 차가 가장 큰 것 · 없으면 자기 시간 차 1위. 그 안에서 시간을 먹은 것(자기 시간 차 1위)도 적는다.
  const only = diff.filter(([k]) => { const a = cnt(spike, k), b = cnt(calm, k); return a != null && a >= 1 && b === 0; });
  const ownK = (only[0] || diff[0] || [null])[0], extra = med(spike.map((x) => x.wall)) - med(calm.map((x) => x.wall));
  owner = ownK ? { fn: ownK, inner: diff[0][0], innerMs: diff[0][1], innerCalls: [cnt(spike, diff[0][0]), cnt(calm, diff[0][0])], calls: [cnt(spike, ownK), cnt(calm, ownK)], extraSec: extra, spikeDays: spike.map((x) => x.d), med: m,
    edge: [cnt(spike, '_t598EdgeOk'), cnt(calm, '_t598EdgeOk')] } : null;
  if (owner) W(''), W(`주인: \`${owner.fn.split(' @')[0]}\`(튄 날에만 돈다 · ${f(owner.calls[0], 0)}번/튄 날) — 튄 날 하루가 고른 날보다 ${f(extra, 1)} 초 길다 · 그 안에서 시간을 먹은 것 \`${owner.inner.split(' @')[0]}\`(+${f(owner.innerMs / 1000, 1)} 초 · ${f(owner.innerCalls[0], 0)} ↔ ${f(owner.innerCalls[1], 0)}번/날)`);
  W('');
  // 튄 날의 날 묶음 — 봇 다리 손짓 날(6 · 16 · 26 …에 놓고 사흘 뒤 허묾)과 견줌
  const bridgeDays = new Set(); for (let d = 6; d <= 800; d += 10) { bridgeDays.add(d); bridgeDays.add(d + 3); }
  W(`튄 날 가운데 다리 머리 울타리를 놓은 날 · 허문 날(봇 손짓 6 · 16 · 26 …날 놓고 9 · 19 · 29 …날 허묾 — 날 6 은 길막기 울타리 47 도 같은 날): ${spike.filter((x) => bridgeDays.has(x.d)).length}/${spike.length}`);
  if (pdn.length) { const wn = pdn.filter((x) => x.d >= 2).map((x) => x.wall), mn = med(wn); W(`견줌 prof-nobuild-1020: 하루 벽시계 가운데 ${f(mn, 1)} 초 · 튄 날 ${pdn.filter((x) => x.d >= 2 && x.wall > mn * 1.8).map((x) => x.d + '(' + f(x.wall, 0) + ')').join(' · ') || '없음'}`); }
  W('');
}
// 손잡이 하나씩 — 하루 걸린 초 · 튄 날 수(하루가 그 판 가운데 ×1.8 넘음) · T1486 판(시드 1020 · 7 · 42 · 날 7 ~ 60)과 이 판(날 7 ~ 100 · 101 ~ 800)
const spikes = (walls) => { const m = med(walls.map((x) => x[1])); return walls.filter((x) => x[1] > m * 1.8).map((x) => x[0]); };
W('| 팔 | T1486 하루 걸린 초(시드 1020 · 7 · 42 · 날 7 ~ 60) | T1486 튄 날 수(세 시드 합 · 54날씩) | 튄 날이 다리 손짓 날 | 끔 대비 |'); W('|---|---|---|---|---|');
const refSpd = {};
for (const a of ['off', 'nobuild', 'react', 'npcdeath', 'terrseq']) {
  const per = [], sp = []; let onBridge = 0;
  for (const sd of [1020, 7, 42]) { const o = ref(`${a}-${sd}`); if (!o) continue; const w = []; for (let i = 1; i < o.days.length; i++) if (o.days[i].d >= 7 && o.days[i - 1].d === o.days[i].d - 1) w.push([o.days[i].d - 1, o.days[i].wall - o.days[i - 1].wall]); per.push(w.reduce((x, y) => x + y[1], 0) / Math.max(1, w.length)); const s2 = spikes(w); sp.push(...s2); onBridge += s2.filter((d) => (d - 6) % 10 === 0 || (d - 9) % 10 === 0).length; }
  refSpd[a] = { spd: med(per), spikes: sp.length, onBridge };
}
for (const a of Object.keys(refSpd)) W(`| ${a} | ${f(refSpd[a].spd, 1)} | ${refSpd[a].spikes} | ${refSpd[a].onBridge}/${refSpd[a].spikes} | ${pct(refSpd[a].spd, refSpd.off && refSpd.off.spd)} |`);
W('');
W('| 판(이 카드 · 시드 1020) | 하루 걸린 초 날 7 ~ 100 | 날 101 ~ 800 | 끔 대비(7 ~ 100) |'); W('|---|---|---|---|');
const base2 = RUN['off-1020'] ? winSpd(RUN['off-1020'], 6, 100) : null;
const knobSpd = {};
for (const a of ['off', 'nobuild', 'react', 'npcdeath', 'terrseq', 'all4']) { const r = RUN[a + '-1020']; if (!r) continue; const s1 = winSpd(r, 6, 100), s2 = winSpd(r, 100, 800); knobSpd[a] = [s1, s2]; W(`| ${a}-1020 | ${f(s1, 1)} | ${f(s2, 1)} | ${pct(s1, base2)} |`); }
for (const a of ['jp-off', 'jp-nobuild']) { const r = RUN[a + '-1020']; if (!r) continue; const s1 = winSpd(r, 6, 100); knobSpd[a] = [s1, null]; W(`| ${a}-1020(닛폰) | ${f(s1, 1)} | — | ${pct(s1, RUN['jp-off-1020'] ? winSpd(RUN['jp-off-1020'], 6, 100) : null)}(닛폰 끔 대비) |`); }
W('');
OUTJ.item2 = { owner, knobSpd, refSpd };

// ── ③ stopSleep ──
W('## ③ BLOCK_REACT 의 stopSleep — 부른 자리 · 헛깨움 · 하루 CPU 몫'); W('');
const S3 = RUN['ss-react-1020']; let top3 = null;
if (S3 && S3.probe) {
  const P = S3.probe, T = P.ss_tot;
  W(`판 ss-react-1020(날 ${P.days.length ? P.days[0].d : '—'} ~ ${P.days.length ? P.days[P.days.length - 1].d : '—'}) · 글자 끼움 ${JSON.stringify(P.patch || {})} · stopSleep 합 ${T.n} · 선 채 다시 셈(같은 몸 · 같은 칸 · 바로 앞 틱) ${T.rep}(${f(100 * T.rep / Math.max(1, T.n), 1)} %) · 다음 틱 움직임 ${T.moved} · 그대로 ${T.still} · 사라짐 ${T.gone}`); W('');
  W('| 부른 자리(셈 자리 · 몸 · 스택) | 셈 | 몫 | 선 채 다시 셈 % | 다음 틱 움직인 % | 그대로 % |'); W('|---|---|---|---|---|---|');
  const sites = Object.entries(P.ss_sites).sort((a, b) => b[1].n - a[1].n);
  for (const [k, s] of sites.slice(0, 12)) W(`| \`${k}\` | ${s.n} | ${f(100 * s.n / Math.max(1, T.n), 1)} % | ${f(100 * s.rep / Math.max(1, s.n), 1)} | ${f(100 * s.moved / Math.max(1, s.n), 1)} | ${f(100 * s.still / Math.max(1, s.n), 1)} |`);
  W('');
  const D = P.days.filter((x) => x.d >= 7);
  const tot = (k1, k2) => D.reduce((a, x) => a + (x[k1][k2] || 0), 0);
  const cpu = D.reduce((a, x) => a + (x.cpu || 0), 0), wall = D.reduce((a, x) => a + (x.wall || 0), 0);
  const stepMs = tot('step', 'ms'), cbrMs = tot('cbr', 'ms');
  W(`날 7 ~ 끝(${D.length}날): 하루 CPU ${f(cpu / Math.max(1, D.length), 1)} 초 · 잠든 청크 걸음 검사(\`t1423StepHit\`) ${f(tot('step', 'n') / Math.max(1, D.length), 0)}번/날 · ${f(stepMs / 1000 / Math.max(1, D.length), 2)} 초/날(${f(100 * stepMs / 1000 / Math.max(1e-9, cpu), 2)} %) · 막힘 반응(\`caravanBlockedResponse\`) ${f(tot('cbr', 'n') / Math.max(1, D.length), 0)}번/날 · ${f(cbrMs / 1000 / Math.max(1, D.length), 2)} 초/날(${f(100 * cbrMs / 1000 / Math.max(1e-9, cpu), 2)} %) · 둘 합 ${f(100 * (stepMs + cbrMs) / 1000 / Math.max(1e-9, cpu), 2)} %`);
  top3 = sites.length ? { site: sites[0][0], n: sites[0][1].n, share: sites[0][1].n / Math.max(1, T.n), rep: sites[0][1].rep / Math.max(1, sites[0][1].n), still: sites[0][1].still / Math.max(1, sites[0][1].n), totRep: T.rep / Math.max(1, T.n), cpuPct: 100 * (stepMs + cbrMs) / 1000 / Math.max(1e-9, cpu), total: T.n } : null;
  W('');
}
OUTJ.item3 = top3;

// ── ④ 짐승 길 ──
W('## ④ NPC_DEATH 짐승 길 — 봇 손짓 0 · BEAST_UNSEEN 끔(u0) ↔ 켬(u1)'); W('');
W('| 판 | 날 | 인구 | 죽음(NPC_DEATH · 짐승 · 그 밖) | 굶어 죽음 | 야생 틱(활성 청크 있는 틱) | 블록 몹(살아 있는 · 끝 날) | 존 몹 | 블록 사람 대리 | 맞힘 | T1461 마을 밖 물음 · 밖 | T1461 사냥판 셈 |'); W('|---|---|---|---|---|---|---|---|---|---|---|---|');
const I4 = []; let beastHits = 0, beastTicks = 0, beastMobs = 0;
for (const n of Object.keys(RUN).filter((x) => /^nd-u[01]-\d+$/.test(x)).sort()) {
  const r = RUN[n], l = r.last; if (!l) continue; const b = l.beast || {};
  let maxLab = 0, maxZone = 0, maxAg = 0; for (const d of r.ds) { const x = r.days.get(d).beast || {}; maxLab = Math.max(maxLab, x.lab | 0); maxZone = Math.max(maxZone, x.zoneMobs | 0); maxAg = Math.max(maxAg, x.agents | 0); }
  // 마디마다 야생 셈은 0 에서 다시 센다 — 마디 끝 줄을 더한다
  const segSum = (k) => r.segs.reduce((a, s) => { const rows = s.rec.days || []; const z = rows.length ? rows[rows.length - 1].beast || {} : {}; return a + (z[k] | 0); }, 0);
  const ticks = segSum('ticks'), hits = segSum('hits'), wild = segSum('wild'), died = segSum('died'), other = segSum('other');
  beastHits += wild; beastTicks += ticks; beastMobs += maxLab + maxZone;
  I4.push({ n, d: l.d, pop: l.pop, died, wild, other, ticks, hits, maxLab, maxZone, maxAg });
  W(`| ${n} | ${l.d} | ${l.pop} | ${died} · ${wild} · ${other} | ${l.fd} | ${ticks} | ${maxLab}(최대) | ${maxZone}(최대) | ${maxAg}(최대) | ${hits} | ${b.v1461 ? b.v1461.outQ + ' · ' + b.v1461.outY : '—'} | ${b.w1461 ? JSON.stringify(b.w1461).slice(0, 80) : '없음(사냥판 끔)'} |`);
}
const why4 = beastHits ? null : (beastTicks === 0 ? '야생 층이 한 틱도 안 돎(활성 청크 0 = 보는 사람 0 · 사냥판 T1331·T1393 끔 기본 → BEAST_UNSEEN 이 붙는 판이 없음)' : (beastMobs === 0 ? '짐승 몸 0' : '만남 0'));
W(''); W(`짐승이 스스로 친 죽음 합 ${beastHits}${why4 ? ' — 까닭: ' + why4 : ''}`); W('');
OUTJ.item4 = { runs: I4, beastHits, why4 };

// ── ⑤ 넷 다 켬 ↔ 넷 다 끔 · 겹침 ──
W('## ⑤ 넷 다 켬 ↔ 넷 다 끔(시드 1020) — 따로 켠 효과의 합과 견줌'); W('');
const O5 = RUN['off-1020'], A5 = RUN['all4-1020'];
const singles = ['nobuild', 'react', 'npcdeath', 'terrseq'].map((a) => [a, RUN[a + '-1020']]).filter(([, r]) => r);
const MET = [['pop', '인구', (r, d) => row(r, d) && row(r, d).pop], ['dead', '죽음 누계', (r, d) => row(r, d) && row(r, d).dead], ['fd', '굶어 죽음', (r, d) => row(r, d) && row(r, d).fd], ['empty', '빈 마을', (r, d) => row(r, d) && row(r, d).empty],
  ['vb', '건물 행', (r, d) => { const x = dbAt(r, d); return x && x.vb; }], ['dbmb', 'DB MB', (r, d) => { const x = dbAt(r, d); return x && mb(x.db + x.wal); }], ['spd', '하루 걸린 초(앞 100날)', (r, d) => winSpd(r, Math.max(6, d - 100), d)]];
const I5 = [];
if (O5 && A5) {
  W('| 날 | 잣대 | 끔 | 넷 다 켬 | 켬 − 끔 | 하나씩 효과(' + singles.map(([a]) => a).join(' · ') + ') | 하나씩 합 | 겹침(넷 효과 − 하나씩 합) | 겹침 / 끔 |'); W('|---|---|---|---|---|---|---|---|---|');
  for (let d = 100; d <= 800; d += 100) {
    if (!row(O5, d) || !row(A5, d)) continue;
    for (const [k, nm, g] of MET) {
      const o = g(O5, d), a = g(A5, d); if (o == null || a == null) continue;
      const eff = singles.map(([s, r]) => { const v = g(r, d); return v == null ? null : v - o; });
      const have = eff.every((x) => x != null), S = have ? eff.reduce((x, y) => x + y, 0) : null, ov = have ? (a - o) - S : null;
      I5.push({ d, k, off: o, all: a, eff, sum: S, overlap: ov, full: have });
      const nd = k === 'dbmb' || k === 'spd' ? 1 : 0;
      W(`| ${d} | ${nm} | ${f(o, nd)} | ${f(a, nd)} | ${f(a - o, nd)} | ${eff.map((x) => f(x, nd)).join(' · ')} | ${f(S, nd)} | ${f(ov, nd)} | ${ov == null ? '—' : f(100 * ov / Math.max(1e-9, Math.abs(o)), 1) + ' %'} |`);
    }
  }
  W('');
}
OUTJ.item5 = I5;

// ── 첫 줄 ──
const rows800 = Object.values(I1).map((P) => P.filter((x) => x.vbOff != null && x.vbOn != null).slice(-1)[0]).filter(Boolean);
const lastDay1 = rows800.length ? Math.min(...rows800.map((x) => x.d)) : null;
const vbOff = med(rows800.map((x) => x.vbOff)), vbOn = med(rows800.map((x) => x.vbOn)), dbOff = med(rows800.map((x) => x.dbOff)), dbOn = med(rows800.map((x) => x.dbOn));
const rgTxt = regrow.length ? regrow.map((x) => `${x.s} ${x.rg ? '날 ' + x.rg.d : '없음'}`).join(' · ') : '—';
const ownTxt = owner ? `\`${owner.fn.split(' @')[0]}\`(울타리가 서거나 헐린 날 +${f(owner.extraSec, 1)} 초 · 그 날 1번 · 안의 A* \`${owner.inner.split(' @')[0]}\` ${f(owner.innerCalls[0], 0)}번 · 칸 검사 \`_t598EdgeOk\` ${f(owner.edge[0], 0)}번` : '○(';
const spdGap = refSpd.off && refSpd.nobuild ? `평균 끔 ${f(refSpd.off.spd, 1)} ↔ NO_BUILD ${f(refSpd.nobuild.spd, 1)} 초/날` : '';
const knobTxt = (() => { const ks = Object.keys(refSpd).filter((a) => a !== 'off'); if (!ks.length || !refSpd.off) return '○'; const gone = ks.filter((a) => refSpd[a].spikes <= refSpd.off.spikes / 3); return gone.length ? gone.map((a) => ({ nobuild: 'NO_BUILD', react: 'BLOCK_REACT', npcdeath: 'NPC_DEATH', terrseq: 'TERR_SEQ' })[a]).join(' · ') + ' 켬에서만 사라짐' : '없음'; })();
const ovTxt = (() => { const L5 = I5.filter((x) => x.full && x.k === 'pop'); if (!L5.length) { const p = I5.filter((x) => x.k === 'pop').slice(-1)[0]; return p ? `하나씩 판 덜 돎(넷 − 끔 인구 ${f(p.all - p.off, 0)} · 날 ${p.d})` : '○'; } const z = L5[L5.length - 1]; const v = I5.filter((x) => x.full && x.d === z.d); return `날 ${z.d} ` + v.filter((x) => ['pop', 'vb', 'spd'].includes(x.k)).map((x) => `${x.k} ${f(x.overlap, x.k === 'spd' ? 1 : 0)}`).join(' · '); })();
const fl = `영토 차례 800날 — 건물 행 ${vbOff != null ? Math.round(vbOff) : '○'} → ${vbOn != null ? Math.round(vbOn) : '○'}${lastDay1 && lastDay1 < 800 ? `(날 ${lastDay1})` : ''} · DB ${f(dbOff, 1)} → ${f(dbOn, 1)} MB · 다시 불어남 ${rgTxt} · 다리 머리 느려짐의 주인 ${ownTxt} · ${spdGap} · 손잡이 ${knobTxt}) · 잠 깨움 부른 자리 1위 ${top3 ? '`' + top3.site.split(' · ').slice(0, 3).join(' · ') + '`' : '○'}(헛깨움 ${top3 ? f(100 * top3.totRep, 1) : '○'} %) · 짐승이 스스로 친 건 ${beastHits}(0 이면 까닭 ${why4 || '—'}) · 넷 다 켬 겹침 ${ovTxt} · 죽은 판 ${deadRuns} · 회부 ${REFER}`;
fs.writeFileSync(path.join(R, 'table.txt'), L.join('\n') + '\n');
fs.writeFileSync(path.join(R, 'table.json'), JSON.stringify(OUTJ, null, 1));
fs.writeFileSync(path.join(R, 'first-line.txt'), fl + '\n');
console.log(fl);
