#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1345 사다리 표 자 · 읽기만)
// === scripts/t1345-ladder.js — 조건 사다리(서버 자 → 몸 세계) 판들의 끔 · 묶음 표 ===
//   쓰는 법: node scripts/t1345-ladder.js <계단>=<끔 판 폴더>,<묶음 판 폴더> … [--win 15] [--md <out.md>] [--json <out.json>]
//     판 폴더 = T1308 판 폴더(`<태그>-<시드>.json.t1345.json` 또는 `seg-<날>.json.t1345.json` — t1345hook 이 쓴 마을-날 줄)
//   찍는 것:
//     ① 사다리 — 계단마다 끔 · 묶음 인구 · 끔비(날 30 · 60 · 90 · 120 · 150 · 끝) · 끔비가 1 밑으로 처음 간 날
//     ② 날 줄(창 `--win` 날) — 끔 | 묶음: 끝 인구 · 곳간 일치(사람 가중) · 난 사람 · 떠남 · 닿음 · 굶어 죽음 · 인구 식 죽음(K 위 — dead − fd − nat) · 늙어 죽음
//     ③ 이주 문 — 철(봄 · 여름 · 가을 · 겨울 — server/calendar)마다 압력 선 마을-날(h < 0.25) · 물음 · 떠남 · 받는 곳 없음 · 문 까닭(본 후보 수: 모름 · 행복 · 침상 · K · 얇음 · 무리 몫 · 통과)
//     ④ 행복 몫 — 날 끝(마을 평균): h · 천천히 S · 부담 B · 영토 셀 · K · 출생 곳간 문 닫힌 마을-날
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const WIN = parseInt(opt('--win', '15'), 10) || 15, MD = opt('--md', null), JS = opt('--json', null);
const RUNGS = A.filter((x, i) => /=/.test(x) && !(i > 0 && /^--/.test(A[i - 1]))).map((x) => { const [k, v] = x.split('='); const [off, bun] = v.split(','); return { k, off, bun }; });
if (!RUNGS.length) { console.error('쓰는 법: node scripts/t1345-ladder.js <계단>=<끔 폴더>,<묶음 폴더> … [--win 15] [--md out.md] [--json out.json]'); process.exit(2); }

//   T1345 훅 줄이 없는 옛 판(T1335 등 — T1312 훅 `*.json.t1312.json` 만 있다)은 같은 이름 칸만 옮기고 나머지(행복 몫 · 물음 · 문 까닭 · 출생 문)는 빈칸으로 읽는다.
const T1345_COLS = ['day', 'v', 'N', 'arr', 'born', 'emig', 'dead', 'fd', 'nat', 'fdays', 'h', 'hS', 'hB', 'hG', 'terr', 'K', 'dP', 'hap', 'gated', 'beds',
  'acc', 'ask', 'ok1', 'none', 'gU', 'gH', 'gB', 'gK', 'gT', 'gHerd', 'gOk', 'bGate'];
function from1312(o) {
  const ix = Object.fromEntries(o.cols.map((k, i) => [k === 'bornE' ? 'born' : k, i]));
  return { cols: T1345_COLS, wcols: [], names: o.names, wrows: [], env: Object.assign({ from: 't1312' }, o.env || {}),
    rows: o.rows.map((r) => T1345_COLS.map((k) => (k in ix ? r[ix[k]] : null))) };
}
function load(dir) {   // → { cols, names, rows(날 차례 · 마디 이음), wrows }
  if (!dir || !fs.existsSync(dir)) return null;
  const fs1 = fs.readdirSync(dir);
  let files = fs1.filter((f) => /^seg-\d+\.json\.t1345\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
  if (!files.length) files = fs1.filter((f) => /\.json\.t1345\.json$/.test(f));
  const old = !files.length;
  if (old) files = fs1.filter((f) => /\.json\.t1312\.json$/.test(f) && !/^seg-/.test(f));
  let out = null; const seen = new Set();
  for (const f of files) {
    let o; try { o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (old) o = from1312(o);
    if (!out) out = { cols: o.cols, wcols: o.wcols, names: o.names.slice(), rows: [], wrows: [], env: o.env, probes: [] };
    for (const q of (o.probes || [])) if (!out.probes.some((x) => x.day === q.day)) out.probes.push(q);
    const remap = o.names.map((n) => { let i = out.names.indexOf(n); if (i < 0) { i = out.names.length; out.names.push(n); } return i; });
    for (const r of o.rows) { const key = r[0] + '|' + remap[r[1]]; if (seen.has(key)) continue; seen.add(key); const q = r.slice(); q[1] = remap[r[1]]; out.rows.push(q); }
    for (const w of o.wrows) if (!out.wrows.some((x) => x[0] === w[0])) out.wrows.push(w);
  }
  if (out) { out.rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]); out.wrows.sort((a, b) => a[0] - b[0]); }
  return out;
}
const SEASON = (d) => { const t = Cal.dateOf(d), m = t.month, y = m <= 2 ? t.year - 1 : t.year; return (m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울') + (y > 1 ? ` ${y}해` : ''); };   // 겨울(12 · 1 · 2월)은 시작한 해
function byDay(R) {   // 날 → { N, food, born, emig, arr, dead, fd, nat, kdead, ask, ok1, none, g…, hlt, bGate, h…(평균) }
  const C = R.cols, ix = Object.fromEntries(C.map((k, i) => [k, i])), M = new Map();
  for (const r of R.rows) {
    let o = M.get(r[0]); if (!o) { o = { N: 0, food: 0, born: 0, emig: 0, arr: 0, dead: 0, fd: 0, nat: 0, ask: 0, ok1: 0, none: 0, gU: 0, gH: 0, gB: 0, gK: 0, gT: 0, gHerd: 0, gOk: 0, hlt: 0, bGate: 0, hGate: 0, hs: [], hSs: [], hBs: [], ts: [], Ks: [], vils: 0 }; M.set(r[0], o); }
    const N = r[ix.N]; o.N += N; if (N > 0) o.vils++;
    if (r[ix.fdays] != null) o.food += r[ix.fdays] * N;
    for (const k of ['born', 'emig', 'arr', 'dead', 'fd', 'nat', 'ask', 'ok1', 'none', 'gU', 'gH', 'gB', 'gK', 'gT', 'gHerd', 'gOk', 'bGate']) o[k] += r[ix[k]] || 0;
    if (r[ix.h] != null && N > 0) { o.hs.push(r[ix.h]); if (r[ix.h] < 0.25) o.hlt++; }
    if (r[ix.gated]) o.hGate++;   // 주거 문(econ `_dpDebug.gated` — 늘림 > 0 인데 사람 ≥ 집 · 지도 침상)
    if (r[ix.hS] != null && N > 0) o.hSs.push(r[ix.hS]); if (r[ix.hB] != null && N > 0) o.hBs.push(r[ix.hB]);
    if (r[ix.terr] != null && N > 0) o.ts.push(r[ix.terr]); if (r[ix.K] != null && N > 0) o.Ks.push(r[ix.K]);
  }
  for (const o of M.values()) o.kdead = o.dead - o.fd - o.nat;
  return M;
}
//   시드 — 판 폴더 progress.json(T1308) · 없으면 계단 이름의 `@<시드>` · 없으면 1020
function seedOf(g) {
  for (const d of [g.bun, g.off]) { try { const P = JSON.parse(fs.readFileSync(path.join(d, 'progress.json'), 'utf8')); if (P.seed) return +P.seed; } catch (e) {} }
  const m = /@(\d+)/.exec(g.k); return m ? +m[1] : 1020;
}
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const f3 = (x) => x == null ? '—' : x.toFixed(3), f2 = (x) => x == null ? '—' : x.toFixed(2), f1 = (x) => x == null ? '—' : x.toFixed(1), n0 = (x) => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const res = { win: WIN, rungs: [] };
const L = [];
const P = (s) => { L.push(s); };
P(`# T1345 사다리 표 — 끔 · 묶음 (창 ${WIN}날)\n`);
const pts = [30, 60, 90, 120, 150];
P('## ① 사다리 — 끔비(같은 날 묶음 인구 ÷ 끔 인구)\n');
P('| 계단 | ' + pts.map((d) => `날 ${d} 끔 · 묶음 · 끔비`).join(' | ') + ' | 끝 날 | 끔비 1 밑 첫 날 | 가장 낮은 끔비(날) |');
P('|---|' + pts.map(() => '---').join('|') + '|---|---|---|');
for (const g of RUNGS) {
  const O = load(g.off), B = load(g.bun);
  const mo = O ? byDay(O) : new Map(), mb = B ? byDay(B) : new Map();
  const common = [...mo.keys()].filter((d) => mb.has(d)).sort((a, b) => a - b);
  const last = common.length ? common[common.length - 1] : null;
  let below = null, minR = Infinity, minD = null;
  for (const d of common) { const r = mb.get(d).N / mo.get(d).N; if (below == null && r < 1) below = d; if (r < minR) { minR = r; minD = d; } }
  const cell = (d) => (mo.has(d) && mb.has(d)) ? `${n0(mo.get(d).N)} · ${n0(mb.get(d).N)} · **${f3(mb.get(d).N / mo.get(d).N)}**` : '—';
  P(`| ${g.k} | ` + pts.map(cell).join(' | ') + ` | ${last == null ? '—' : last} | ${below == null ? '없음' : below} | ${isFinite(minR) ? f3(minR) + ` (${minD})` : '—'} |`);
  res.rungs.push({ k: g.k, off: g.off, bun: g.bun, envOff: O && O.env, envBun: B && B.env, rawOff: O, rawBun: B, last, below, minR: isFinite(minR) ? minR : null, minD,
    ratio: Object.fromEntries(common.map((d) => [d, +(mb.get(d).N / mo.get(d).N).toFixed(4)])), mo, mb });
}
P('');
P(`## ② 날 줄 — 창 ${WIN}날(끔 | 묶음): 끝 인구 · 곳간 일치(사람 가중 · 창 끝) · 난 · 떠남 · 닿음 · 굶어 죽음 · K 위(인구 식) 죽음 · 늙어 죽음\n`);
for (const g of res.rungs) {
  P(`### ${g.k}\n`);
  P('| 날 | 끔 인구 | 묶음 인구 | 끔비 | 곳간 일치 끔 · 묶음 | 난 끔 · 묶음 | 떠남 끔 · 묶음 | 닿음 끔 · 묶음 | 굶어 죽음 끔 · 묶음 | K 위 죽음 끔 · 묶음 | 늙어 죽음 끔 · 묶음 |');
  P('|---|---|---|---|---|---|---|---|---|---|---|');
  const days = [...g.mo.keys()].filter((d) => g.mb.has(d)).sort((a, b) => a - b);
  g.win = [];
  for (let s = 1; days.length && s <= days[days.length - 1]; s += WIN) {
    const ds = days.filter((d) => d >= s && d < s + WIN); if (!ds.length) continue;
    const e = ds[ds.length - 1], sum = (m, k) => ds.reduce((x, d) => x + (m.get(d)[k] || 0), 0);
    const o = g.mo.get(e), b = g.mb.get(e);
    const row = { from: s, to: e, offN: o.N, bunN: b.N, offFd: o.N ? o.food / o.N : null, bunFd: b.N ? b.food / b.N : null };
    for (const k of ['born', 'emig', 'arr', 'fd', 'kdead', 'nat']) { row['off_' + k] = sum(g.mo, k); row['bun_' + k] = sum(g.mb, k); }
    g.win.push(row);
    P(`| ${s} ~ ${e} | ${n0(o.N)} | ${n0(b.N)} | ${f3(b.N / o.N)} | ${f1(row.offFd)} · ${f1(row.bunFd)} | ${row.off_born} · ${row.bun_born} | ${row.off_emig} · ${row.bun_emig} | ${row.off_arr} · ${row.bun_arr} | ${row.off_fd} · ${row.bun_fd} | ${row.off_kdead} · ${row.bun_kdead} | ${row.off_nat} · ${row.bun_nat} |`);
  }
  P('');
}
P('## ③ 이주 문 — 철마다(끔 | 묶음): 압력 선 마을-날(h < 0.25) · 물음 · 떠남 · 받는 곳 없음 · 문 까닭(본 후보 수 — 묶음은 T1312 무리 문 · 끔은 종전 줄이라 까닭 칸이 없다)\n');
P('| 계단 | 팔 | 철(날) | 마을-날 | h < 0.25 | 물음 | 떠남 | 받는 곳 없음 | 모름 | 행복 | 침상 | K | 얇음 | 무리 몫 | 통과 |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const g of res.rungs) {
  g.gates = {};
  for (const [arm, m] of [['끔', g.mo], ['묶음', g.mb]]) {
    const bySeason = new Map();
    for (const [d, o] of m) { const s = SEASON(d); let q = bySeason.get(s); if (!q) { q = { d0: d, d1: d, vd: 0, hlt: 0, ask: 0, ok1: 0, none: 0, gU: 0, gH: 0, gB: 0, gK: 0, gT: 0, gHerd: 0, gOk: 0 }; bySeason.set(s, q); }
      q.d0 = Math.min(q.d0, d); q.d1 = Math.max(q.d1, d); q.vd += o.vils; q.hlt += o.hlt; for (const k of ['ask', 'ok1', 'none', 'gU', 'gH', 'gB', 'gK', 'gT', 'gHerd', 'gOk']) q[k] += o[k]; }
    g.gates[arm] = Object.fromEntries(bySeason);
    for (const [s, q] of bySeason) P(`| ${g.k} | ${arm} | ${s}(${q.d0} ~ ${q.d1}) | ${n0(q.vd)} | ${n0(q.hlt)} | ${n0(q.ask)} | ${n0(q.ok1)} | ${n0(q.none)} | ${n0(q.gU)} | ${n0(q.gH)} | ${n0(q.gB)} | ${n0(q.gK)} | ${n0(q.gT)} | ${n0(q.gHerd)} | ${n0(q.gOk)} |`);
  }
}
P('');
P('## ④ 행복 몫 · 부양력 · 문 — 창 끝 날의 마을 평균(끔 | 묶음): h · 천천히 S · 부담 B · 영토 셀 · K · 창 합: 출생 곳간 문 닫힌 마을-날 · 주거 문 닫힌 마을-날\n');
P('| 계단 | 날 | h 끔 · 묶음 | S 끔 · 묶음 | B 끔 · 묶음 | 영토 끔 · 묶음 | K 끔 · 묶음 | 출생 곳간 문 닫힘 끔 · 묶음 | 주거 문 닫힘 끔 · 묶음 |');
P('|---|---|---|---|---|---|---|---|---|');
for (const g of res.rungs) {
  for (const w of g.win || []) {
    if (w.to % 30 !== 0 && w !== g.win[g.win.length - 1]) continue;
    const o = g.mo.get(w.to), b = g.mb.get(w.to);
    const bg = (m, k) => { let x = 0; for (const [d, q] of m) if (d >= w.from && d <= w.to) x += q[k || 'bGate']; return x; };
    P(`| ${g.k} | ${w.to} | ${f3(mean(o.hs))} · ${f3(mean(b.hs))} | ${f3(mean(o.hSs))} · ${f3(mean(b.hSs))} | ${f3(mean(o.hBs))} · ${f3(mean(b.hBs))} | ${n0(mean(o.ts))} · ${n0(mean(b.ts))} | ${f1(mean(o.Ks))} · ${f1(mean(b.Ks))} | ${bg(g.mo)} · ${bg(g.mb)} | ${bg(g.mo, 'hGate')} · ${bg(g.mb, 'hGate')} |`);
  }
}
//   ⑤ 목표 넷(T1319 §4 자 — 판 끝 날): ① 1020 끔비 ≥ 1.10 ② 끔비 ≥ 0.98 ③ 묶음 꼭대기 뒤 내림 ≤ 10% ④ 굶어 죽음 ≤ 같은 시드 끔(곁: 죽음 전체)
P('');
P('## ⑤ 목표 넷(T1319 §4 자 · 판 끝 날) — ① 1020 끔비 ≥ 1.10 · ② 끔비 ≥ 0.98 · ③ 묶음 꼭대기 뒤 내림 ≤ 10% · ④ 굶어 죽음 ≤ 같은 시드 끔\n');
P('| 줄 | 끝 날 | 끔비(끝 25날 평균) | ① ≥ 1.10 | ② ≥ 0.98 | 묶음 꼭대기(날) → 끝 · 내림 | ③ ≤ 10% | 굶어 죽음 묶음 : 끔 | ④ | (곁) 죽음 전체 묶음 : 끔 | 넷 중 |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
const ox = (b) => b == null ? '—' : (b ? '○' : '✗');
for (const g of res.rungs) {
  const days = [...g.mo.keys()].filter((d) => g.mb.has(d)).sort((a, b) => a - b); if (!days.length) continue;
  const D = days[days.length - 1], r = g.mb.get(D).N / g.mo.get(D).N;
  const t25 = days.filter((d) => d > D - 25), avg25 = mean(t25.map((d) => g.mb.get(d).N / g.mo.get(d).N));
  let pk = 0, pd = 0; for (const d of days) { const n = g.mb.get(d).N; if (n > pk) { pk = n; pd = d; } }
  const end = g.mb.get(D).N, drop = pk ? 100 * (pk - end) / pk : null;
  const sum = (m, k) => days.reduce((x, d) => x + (m.get(d)[k] || 0), 0);
  const fdB = sum(g.mb, 'fd'), fdO = sum(g.mo, 'fd'), dB = sum(g.mb, 'dead'), dO = sum(g.mo, 'dead');
  const is1020 = seedOf(g) === 1020;
  const G = { day: D, ratio: r, avg25, g1: is1020 ? r >= 1.10 : null, g2: r >= 0.98, peak: pk, peakDay: pd, end, drop, g3: drop != null ? drop <= 10 : null, fdB, fdO, g4: fdB <= fdO, dB, dO };
  G.n = [G.g1, G.g2, G.g3, G.g4].filter((x) => x === true).length; G.of = [G.g1, G.g2, G.g3, G.g4].filter((x) => x != null).length;
  g.goals = G;
  P(`| ${g.k} | ${D} | ${f3(r)} (${f3(avg25)}) | ${ox(G.g1)} | ${ox(G.g2)} | ${n0(pk)}(${pd}) → ${n0(end)} · ${f1(drop)}% | ${ox(G.g3)} | ${fdB} : ${fdO} | ${ox(G.g4)} | ${dB} : ${dO} | ${G.n}/${G.of} |`);
}
//   ⑥ 집 켬 판의 집터 · 침상(T1345 훅 판만 — 옛 판은 빈칸): 집터 찾기 찾음/부름(생활층 `_probe` 누계) · 지은 집 칸 · 지도 침상 · 주거 문 닫힌 마을-날 중 집터 없는 몫
P('');
P('## ⑥ 집 켬 판 — 집터 찾기 · 침상(T1345 훅 판만 · 날 10 · 30 · 90 · 150 · 끝) — 찾음/부름 · 지은 집 칸 · 지도 침상 · 창 합 주거 문 닫힘(그중 집터 없음)\n');
P('| 계단 | 팔 | 날 | 집터 찾음/부름 | 지은 집 칸 | 지도 침상 | 사람 | 주거 문 닫힘(집터 없음) — 그 날까지 |');
P('|---|---|---|---|---|---|---|---|');
for (const g of res.rungs) for (const [arm, R] of [['끔', g.rawOff], ['묶음', g.rawBun]]) {
  if (!R || !R.cols.includes('site')) continue;
  const ix = Object.fromEntries(R.cols.map((k, i) => [k, i])), days = [...new Set(R.rows.map((r) => r[0]))].sort((a, b) => a - b), D = days[days.length - 1];
  for (const d of [10, 30, 90, 150, D].filter((x, i, a) => x <= D && a.indexOf(x) === i)) {
    const rs = R.rows.filter((r) => r[0] === d), pr = (R.probes || []).filter((q) => q.day <= d).sort((a, b) => b.day - a.day)[0];
    let gt = 0, gn = 0; for (const r of R.rows) if (r[0] <= d && r[ix.gated]) { gt++; if (r[ix.site] < 0) gn++; }
    const sum = (k) => rs.reduce((x, r) => x + (r[ix[k]] || 0), 0);
    P(`| ${g.k} | ${arm} | ${d} | ${pr ? `${n0(pr.siteHit)}/${n0(pr.siteCall)}(날 ${pr.day})` : '—'} | ${n0(sum('houses'))} | ${n0(sum('mapBeds'))} | ${n0(sum('N'))} | ${n0(gt)}(${n0(gn)}) |`);
  }
}
const txt = L.join('\n') + '\n';
if (MD) fs.writeFileSync(MD, txt); else process.stdout.write(txt);
if (JS) fs.writeFileSync(JS, JSON.stringify({ win: WIN, rungs: res.rungs.map((g) => ({ k: g.k, envOff: g.envOff, envBun: g.envBun, last: g.last, below: g.below, minR: g.minR, minD: g.minD, ratio: g.ratio, win: g.win, gates: g.gates, goals: g.goals,
  probes: { off: g.rawOff && g.rawOff.probes, bun: g.rawBun && g.rawBun.probes } })) }, null, 1));
