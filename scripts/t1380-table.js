#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1380 판 표 자 · 읽기만)
// === scripts/t1380-table.js — 영토 v2 를 랩 넓이에(T1380) 판들의 표 ==========================================================
//   쓰는 법: node scripts/t1380-table.js <이름>=<판 폴더> … [--day 365] [--md out.md] [--json out.json]
//     판 폴더 = T1308 판 폴더(`seg-*.json.t1345.json` — t1345hook 마을-날 줄 · `seg-*.json.t1380.json` — t1380hook 부름 · 넓히기 · 쓰임) · 시드 = progress.json
//     이름이 `끔` 으로 시작하면 그 시드의 끔 판(끔비 · 목표 넷 · 합격선의 끔 값이 그 판을 읽는다)
//   찍는 것(판마다 · 같은 시드 끔과 나란히):
//     ① 판 칸 — 끔비(날 150 · 끝 날) · 집터 찾음/부름(끝 날까지 · 날 90 까지) · 주거 문 닫힌 마을-날(그중 집터 없음) · 늦여름(8월) 출생 · 영토 칸(끝 날 합) ·
//        말뚝 통나무(넓히기 `_t1207.wood` 날 차 합 + (나) 그 자리 넣기) · 땔감 충당률(끝 30날 마을-날 평균) · 곳간 통나무(끝 날 마을 평균) · 굶어 죽음 · 죽음 전체 · 목표 넷
//     ② 합격선(★재민 11-19) — 마을마다 날마다 영토 칸 ÷ 목표 식(⌈인구 ÷ 6⌉ × 600 + 1,500): 끝 날 마을 평균(끔 판 같은 자) · 가장 뒤처진 마을 · 0.8 밑 마을-날 ·
//        (곁) 랩 식((1,500 + ⌈인구 ÷ 6⌉ × 400) × 1.5) 비 끝 날 평균
//     ③ 넓히기 까닭 — 마을-날(사람 > 0): 늘었다 · 목표 닿음 · 통나무 없음 · 몸 없음 · 개간 중 · 그 밖 (끝 날까지)
//     ④ 넓힌 칸의 쓰임 — 끝 날(또는 가장 가까운 앞 쓰임 날): 집 부지 · 밭 · 논 존닝 · 일터 · 그 밖 · 빠짐
//     ⑤ T1380 손잡이 셈 — 앞세운 날 · 앞세운 칸 · 그 자리 넣기 · 그 칸 · 통나무 · 안 치른 개간 분 · 거절 stake
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DAY = parseInt(opt('--day', '365'), 10) || 365, MD = opt('--md', null), JS = opt('--json', null);
const RUNS = A.filter((x, i) => /=/.test(x) && !(i > 0 && /^--/.test(A[i - 1]))).map((x) => { const i = x.indexOf('='); return { k: x.slice(0, i), dir: x.slice(i + 1) }; });
if (!RUNS.length) { console.error('쓰는 법: node scripts/t1380-table.js <이름>=<판 폴더> … [--day 365] [--md out.md] [--json out.json]'); process.exit(2); }
function loadJ(dir, re) {
  if (!dir || !fs.existsSync(dir)) return null;
  const fl = fs.readdirSync(dir).filter((f) => re.test(f)).sort();
  if (!fl.length) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, fl[fl.length - 1]), 'utf8')); } catch (e) { return null; }
}
function seedOf(dir) { try { return +JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf8')).seed; } catch (e) { return null; } }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const capF = (N) => Math.ceil(N / 6) * 600 + 1500, labF = (N) => Math.round((1500 + Math.ceil(N / 6) * 400) * 1.5);
function digest(R) {
  const H = loadJ(R.dir, /^seg-\d+\.json\.t1345\.json$/) || loadJ(R.dir, /\.json\.t1345\.json$/), T = loadJ(R.dir, /^seg-\d+\.json\.t1380\.json$/);
  const o = { k: R.k, dir: R.dir, seed: seedOf(R.dir), off: /^끔/.test(R.k), ok: !!H };
  if (!H) return o;
  const hx = Object.fromEntries(H.cols.map((c, i) => [c, i]));
  const days = [...new Set(H.rows.map((r) => r[0]))].sort((a, b) => a - b);
  o.last = Math.min(days[days.length - 1], DAY);
  const pop = new Map(); let fd = 0, dead = 0, lateBorn = 0, gated = 0, gatedNo = 0;
  for (const r of H.rows) {
    const d = r[0]; if (d > o.last) continue;
    pop.set(d, (pop.get(d) || 0) + (r[hx.N] || 0));
    fd += r[hx.fd] || 0; dead += r[hx.dead] || 0;
    const t = Cal.dateOf(d); if (t.year === 1 && t.month === 8) lateBorn += r[hx.born] || 0;
    if (r[hx.gated]) { gated++; if (hx.site != null && r[hx.site] < 0) gatedNo++; }
  }
  o.pop = pop; o.fd = fd; o.dead = dead; o.lateBorn = lateBorn; o.gated = gated; o.gatedNo = gatedNo;
  const lastRows = H.rows.filter((r) => r[0] === o.last);
  o.terrSum = hx.terrN != null ? lastRows.reduce((x, r) => x + (r[hx.terrN] || 0), 0) : null;
  o.vils = lastRows.filter((r) => (r[hx.N] || 0) > 0).length;
  o.woodEnd = hx.wood != null ? mean(lastRows.filter((r) => (r[hx.N] || 0) > 0).map((r) => r[hx.wood] || 0)) : null;
  if (!T) return o;
  const cx = Object.fromEntries(T.ccols.map((c, i) => [c, i])), vx = Object.fromEntries(T.vcols.map((c, i) => [c, i]));
  const cs = T.calls.filter((c) => c[0] <= o.last), c90 = cs.filter((c) => c[0] <= 90);
  o.calls = cs.length; o.hits = cs.filter((c) => c[cx.hit]).length; o.calls90 = c90.length; o.hits90 = c90.filter((c) => c[cx.hit]).length;
  const stake = {}; for (const c of cs) for (const k in (c[cx.reasons] || {})) if (k === 'stake') stake.n = (stake.n || 0) + c[cx.reasons][k];
  o.stakeReason = stake.n || 0;
  const V = T.vrows.filter((r) => r[0] <= o.last);
  o.stakeW = V.reduce((x, r) => x + (r[vx.stakeW] || 0), 0) + V.reduce((x, r) => x + (r[vx.claimWood] || 0), 0);
  o.fuel = mean(V.filter((r) => r[0] > o.last - 30 && r[vx.N] > 0 && r[vx.fuelCov] != null).map((r) => r[vx.fuelCov]));
  const why = {}; for (const r of V) if (r[vx.N] > 0 && r[vx.why]) { const w = String(r[vx.why]).replace(/^grow\+.*/, 'grow'); why[w] = (why[w] || 0) + 1; }
  o.why = why;
  const K = {}; for (const k of ['lfDays', 'lfCells', 'claims', 'claimCells', 'claimWood', 'claimLabor', 'stake']) K[k] = V.reduce((x, r) => x + (r[vx[k]] || 0), 0);
  o.knob = K;
  //   합격선 — 마을-날 비
  const below = V.filter((r) => r[vx.N] > 0 && r[vx.terrN] / capF(r[vx.N]) < 0.8).length;
  const end = V.filter((r) => r[0] === o.last && r[vx.N] > 0).map((r) => ({ v: T.names[r[vx.v]], N: r[vx.N], terr: r[vx.terrN], r: r[vx.terrN] / capF(r[vx.N]), lab: r[vx.terrN] / labF(r[vx.N]) }));
  end.sort((a, b) => a.r - b.r);
  o.ratioEnd = mean(end.map((e) => e.r)); o.labEnd = mean(end.map((e) => e.lab)); o.worst = end[0] || null; o.below = below; o.vdays = V.filter((r) => r[vx.N] > 0).length;
  o.ratioBy = {}; for (const d of [30, 90, 150, 240, 365, 730]) { if (d > o.last) continue; const e = V.filter((r) => r[0] === d && r[vx.N] > 0).map((r) => r[vx.terrN] / capF(r[vx.N])); o.ratioBy[d] = mean(e); }
  const ux = Object.fromEntries((T.ucols || []).map((c, i) => [c, i]));
  const ud = (T.use || []).map((u) => u[0]).filter((d) => d <= o.last); const uD = ud.length ? Math.max(...ud) : null;
  if (uD != null) { const U = {}; for (const u of T.use) if (u[0] === uD) for (const k of ['grown', 'house', 'field', 'pot', 'work', 'other', 'gone']) U[k] = (U[k] || 0) + (u[ux[k]] || 0); o.use = Object.assign({ day: uD }, U); }
  return o;
}
const D = RUNS.map(digest);
const offOf = (o) => D.find((x) => x.off && x.seed === o.seed && x.ok) || null;
const f3 = (x) => x == null ? '—' : x.toFixed(3), f2 = (x) => x == null ? '—' : x.toFixed(2), n0 = (x) => x == null ? '—' : Math.round(x).toLocaleString('en-US'), pc = (a, b) => b ? `${n0(a)}/${n0(b)}(${(100 * a / b).toFixed(0)}%)` : '—';
function goals(o, f) {
  if (!f || o.off) return null;
  const days = [...o.pop.keys()].filter((d) => f.pop.has(d) && d <= o.last).sort((a, b) => a - b); if (!days.length) return null;
  const L = days[days.length - 1], r = o.pop.get(L) / f.pop.get(L);
  let pk = 0, pd = 0; for (const d of days) { const n = o.pop.get(d); if (n > pk) { pk = n; pd = d; } }
  const drop = pk ? 100 * (pk - o.pop.get(L)) / pk : null;
  const fdO = f.fdAt ? f.fdAt(L) : null;
  const G = { day: L, ratio: r, g1: o.seed === 1020 ? r >= 1.10 : null, g2: r >= 0.98, peak: pk, peakDay: pd, drop, g3: drop != null ? drop <= 10 : null, fd: o.fd, fdO, g4: fdO != null ? o.fd <= fdO : null };
  G.n = [G.g1, G.g2, G.g3, G.g4].filter((x) => x === true).length; G.of = [G.g1, G.g2, G.g3, G.g4].filter((x) => x != null).length;
  return G;
}
//   끔 판의 굶어 죽음 · 죽음은 같은 끝 날까지(끔 판이 더 길 수 있다 — 730날)
for (const o of D) if (o.off && o.ok) {
  const H = loadJ(o.dir, /^seg-\d+\.json\.t1345\.json$/) || loadJ(o.dir, /\.json\.t1345\.json$/), hx = Object.fromEntries(H.cols.map((c, i) => [c, i]));
  o.fdAt = (L) => H.rows.reduce((x, r) => x + (r[0] <= L ? (r[hx.fd] || 0) : 0), 0);
  o.deadAt = (L) => H.rows.reduce((x, r) => x + (r[0] <= L ? (r[hx.dead] || 0) : 0), 0);
}
const ox = (b) => b == null ? '—' : (b ? '○' : '✗');
const L = [], P = (s) => L.push(s);
P(`# T1380 판 표 — ③ 조건(하루 24분 + 집 켬 · \`--body-day\` 자) · 끝 날 ${DAY}\n`);
P('## ① 판 칸\n');
P('| 판 | 시드 | 끝 날 | 사람(끝) | 끔비 날 150 | 끔비 끝 | 집터 찾음/부름 | 날 90 까지 | 주거 문 닫힘(집터 없음) | 8월 출생 | 영토 칸(끝 합) | 말뚝 통나무 | 땔감 충당(끝 30날) | 곳간 통나무(끝 · 마을 평균) | 굶어 죽음 | 죽음 | 목표 넷 |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const o of D) {
  if (!o.ok) { P(`| ${o.k} | ${o.seed} | (판 없음) |`); continue; }
  const f = offOf(o), G = goals(o, f);
  const rr = (d) => (f && o.pop.has(d) && f.pop.has(d)) ? f3(o.pop.get(d) / f.pop.get(d)) : '—';
  const fdO = f && f.fdAt ? f.fdAt(o.last) : null, dO = f && f.deadAt ? f.deadAt(o.last) : null;
  P(`| ${o.k} | ${o.seed} | ${o.last} | ${n0(o.pop.get(o.last))} | ${o.off ? '—' : rr(150)} | ${o.off ? '—' : rr(o.last)} | ${pc(o.hits, o.calls)} | ${pc(o.hits90, o.calls90)} | ${n0(o.gated)}(${n0(o.gatedNo)}) | ${n0(o.lateBorn)} | ${n0(o.terrSum)} | ${n0(o.stakeW)} | ${f3(o.fuel)} | ${f2(o.woodEnd)} | ${n0(o.fd)}${o.off ? '' : ` : ${n0(fdO)}`} | ${n0(o.dead)}${o.off ? '' : ` : ${n0(dO)}`} | ${G ? `${G.n}/${G.of} (${ox(G.g1)}${ox(G.g2)}${ox(G.g3)}${ox(G.g4)})` : '—'} |`);
  o.goals = G;
}
P('\n목표 넷(T1319 §4 자 · 끝 날): ① 1020 끔비 ≥ 1.10 ② 끔비 ≥ 0.98 ③ 꼭대기 뒤 내림 ≤ 10% ④ 굶어 죽음 ≤ 같은 시드 끔 · 굶어 죽음 · 죽음 칸 = 판 : 같은 시드 끔(같은 끝 날까지)\n');
P('## ② 합격선 — 영토 칸 ÷ 목표 식(⌈인구 ÷ 6⌉ × 600 + 1,500 · 마을마다 날마다)\n');
P('| 판 | 시드 | 끝 날 평균 | 끔 판 같은 날 | ≥ 끔? | 가장 뒤처진 마을(끝 날) | 0.8 밑 마을-날 / 마을-날 | 날 30 · 90 · 150 · 240 평균 | (곁) 랩 식 비 끝 날 |');
P('|---|---|---|---|---|---|---|---|---|');
for (const o of D) {
  if (!o.ok || o.ratioEnd == null) continue;
  const f = offOf(o), fo = f && f.ratioBy ? (f.ratioBy[o.last] != null ? f.ratioBy[o.last] : null) : null;
  const w = o.worst;
  o.pass = (!o.off && fo != null) ? o.ratioEnd >= fo : null;
  P(`| ${o.k} | ${o.seed} | **${f3(o.ratioEnd)}** | ${o.off ? '—' : f3(fo)} | ${o.off ? '—' : ox(o.pass)} | ${w ? `${w.v} ${f3(w.r)}(${w.N}명 · ${n0(w.terr)}칸)` : '—'} | ${n0(o.below)} / ${n0(o.vdays)} | ${[30, 90, 150, 240].map((d) => f2(o.ratioBy[d])).join(' · ')} | ${f3(o.labEnd)} |`);
}
P('\n## ③ 넓히기 까닭 — 마을-날(사람 > 0 · 끝 날까지)\n');
const WHY = [['grow', '늘었다'], ['target', '목표 닿음'], ['wood', '통나무 없음'], ['body', '몸 없음'], ['labor', '개간 중'], ['none', '그 밖']];
P('| 판 | 시드 | ' + WHY.map((w) => w[1]).join(' | ') + ' |');
P('|---|---|' + WHY.map(() => '---').join('|') + '|');
for (const o of D) if (o.ok && o.why) P(`| ${o.k} | ${o.seed} | ` + WHY.map((w) => n0(o.why[w[0]] || 0)).join(' | ') + ' |');
P('\n## ④ 넓힌 칸의 쓰임(첫 날 뒤 영토에 든 칸 · 쓰임 날)\n');
P('| 판 | 시드 | 날 | 넓힌 칸 | 집 부지 | 밭 | 논 존닝 | 일터 | 그 밖 | 빠짐 |');
P('|---|---|---|---|---|---|---|---|---|---|');
for (const o of D) if (o.ok && o.use) { const u = o.use, s = (k) => `${n0(u[k])}(${u.grown ? (100 * u[k] / u.grown).toFixed(0) : 0}%)`; P(`| ${o.k} | ${o.seed} | ${u.day} | ${n0(u.grown)} | ${s('house')} | ${s('field')} | ${s('pot')} | ${s('work')} | ${s('other')} | ${s('gone')} |`); }
P('\n## ⑤ T1380 손잡이 셈(마을-날 합)\n');
P('| 판 | 시드 | (가) 앞세운 날 | 앞세운 칸 | (나) 그 자리 넣기 | 넣은 칸 | 통나무 | 안 치른 개간 분 | 거절 stake(부름 까닭 · 마을 셈) |');
P('|---|---|---|---|---|---|---|---|---|');
for (const o of D) if (o.ok && o.knob && !o.off) { const K = o.knob; P(`| ${o.k} | ${o.seed} | ${n0(K.lfDays)} | ${n0(K.lfCells)} | ${n0(K.claims)} | ${n0(K.claimCells)} | ${n0(K.claimWood)} | ${n0(K.claimLabor)} | ${n0(o.stakeReason)} · ${n0(K.stake)} |`); }
const txt = L.join('\n') + '\n';
if (MD) fs.writeFileSync(MD, txt); else process.stdout.write(txt);
if (JS) fs.writeFileSync(JS, JSON.stringify(D.map((o) => { const c = Object.assign({}, o); delete c.pop; delete c.fdAt; delete c.deadAt; c.popEnd = o.pop ? o.pop.get(o.last) : null; c.pop150 = o.pop ? o.pop.get(150) : null; return c; }), null, 1));
