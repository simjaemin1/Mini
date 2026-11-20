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
//   ★마디 판(T1308 `--every N` · 상자가 다시 서도 잇는 판) — 마디마다 `seg-<시작 날>.json.<꼴>.json` 이 선다 · 날 줄을 이어 하나로(이름 차례는 마디마다 다시 맞춘다 · 뒤 마디는 앞 마디가 쓴 날을 덮지 않는다)
function loadSegs(dir, kind) {
  if (!dir || !fs.existsSync(dir)) return null;
  const re = new RegExp(`^seg-(\\d+)\\.json\\.${kind}\\.json$`);
  const fl = fs.readdirSync(dir).map((f) => { const m = re.exec(f); return m ? { f, from: +m[1] } : null; }).filter(Boolean).sort((a, b) => a.from - b.from);
  if (!fl.length) return loadJ(dir, new RegExp(`\\.json\\.${kind}\\.json$`));
  const J = fl.map((x) => { try { return JSON.parse(fs.readFileSync(path.join(dir, x.f), 'utf8')); } catch (e) { return null; } }).filter(Boolean);
  if (J.length === 1) return J[0];
  const out = Object.assign({}, J[J.length - 1]), names = [], idx = new Map();
  const gi = (n) => { let i = idx.get(n); if (i === undefined) { i = names.length; names.push(n); idx.set(n, i); } return i; };
  const tabs = kind === 't1345' ? [['rows', 'cols'], ['wrows', null]] : [['calls', 'ccols'], ['vrows', 'vcols'], ['use', 'ucols']];
  for (const [rk] of tabs) out[rk] = [];
  if (kind === 't1345') out.probes = [];
  const last = {};
  for (const o of J) {
    const map = (o.names || []).map(gi);
    for (const [rk, ck] of tabs) {
      const vI = ck && o[ck] ? o[ck].indexOf('v') : -1, L0 = last[rk] == null ? -Infinity : last[rk];
      let mx = L0;
      for (const r of (o[rk] || [])) { if (!(r[0] > L0)) continue; const q = r.slice(); if (vI >= 0 && q[vI] != null) q[vI] = map[q[vI]]; out[rk].push(q); if (r[0] > mx) mx = r[0]; }
      last[rk] = mx;
    }
    if (kind === 't1345') for (const pq of (o.probes || [])) out.probes.push(pq);
  }
  out.names = names; out.segs = fl.map((x) => x.from);
  if (kind === 't1380') out.lastDay = Math.max(...J.map((o) => o.lastDay || 0));
  return out;
}
function seedOf(dir) { try { return +JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf8')).seed; } catch (e) { return null; } }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const capF = (N) => Math.ceil(N / 6) * 600 + 1500, labF = (N) => Math.round((1500 + Math.ceil(N / 6) * 400) * 1.5);
function digest(R) {
  const H = loadSegs(R.dir, 't1345'), T = loadSegs(R.dir, 't1380');
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
  //   마을별 — 주거 문 닫힌 날(합 · 가장 긴 줄) · 끝 날 사람(이름 → 사람)
  const gv = new Map();
  for (const r of H.rows) { if (r[0] > o.last) continue; const nm = H.names[r[hx.v]]; let g = gv.get(nm); if (!g) { g = { n: 0, run: 0, max: 0 }; gv.set(nm, g); } if (r[hx.gated]) { g.n++; g.run++; if (g.run > g.max) g.max = g.run; } else g.run = 0; }
  let gw = null; for (const [nm, g] of gv) if (!gw || g.n > gw.n || (g.n === gw.n && g.max > gw.max)) gw = { v: nm, n: g.n, max: g.max };
  o.gateWorst = gw;
  o.popV = new Map(lastRows.map((r) => [H.names[r[hx.v]], r[hx.N] || 0]));
  o.empty = lastRows.filter((r) => !(r[hx.N] > 0)).length;
  //   ★[덧붙임 둘] 마을 크기 · 큰 마을 행복 · 불행 이탈 · 굶는 마을
  { const ns = lastRows.map((r) => ({ v: H.names[r[hx.v]], N: r[hx.N] || 0 })).filter((x) => x.N > 0).sort((a, b) => b.N - a.N);
    o.size = { med: ns.length ? ns[ns.length >> 1].N : null, top: ns.slice(0, 5), over200: ns.filter((x) => x.N > 200).length };
    const top = new Set(o.size.top.map((x) => x.v));
    const hs = H.rows.filter((r) => r[0] > o.last - 30 && r[0] <= o.last && top.has(H.names[r[hx.v]]) && r[hx.h] != null).map((r) => r[hx.h]);
    o.topH = mean(hs);
    let lt25 = 0, lt32 = 0, emig = 0; const fdV = new Map();
    for (const r of H.rows) { if (r[0] > o.last || !(r[hx.N] > 0)) continue; if (r[hx.h] != null) { if (r[hx.h] < 0.25) lt25++; if (r[hx.h] < 0.32) lt32++; } emig += r[hx.emig] || 0; if (r[hx.fd] > 0) fdV.set(H.names[r[hx.v]], (fdV.get(H.names[r[hx.v]]) || 0) + r[hx.fd]); }
    o.lt25 = lt25; o.lt32 = lt32; o.emig = emig; o.fdV = fdV; }
  o.yearRows = {}; for (const yd of [365, 730]) { if (yd > o.last) continue; o.yearRows[yd] = { pop: pop.get(yd), fd: H.rows.reduce((x, r) => x + (r[0] <= yd ? (r[hx.fd] || 0) : 0), 0), dead: H.rows.reduce((x, r) => x + (r[0] <= yd ? (r[hx.dead] || 0) : 0), 0) }; }
  o.terrSum = hx.terrN != null ? lastRows.reduce((x, r) => x + (r[hx.terrN] || 0), 0) : null;
  o.vils = lastRows.filter((r) => (r[hx.N] || 0) > 0).length;
  o.woodEnd = hx.wood != null ? mean(lastRows.filter((r) => (r[hx.N] || 0) > 0).map((r) => r[hx.wood] || 0)) : null;
  if (!T) return o;
  const cx = Object.fromEntries(T.ccols.map((c, i) => [c, i])), vx = Object.fromEntries(T.vcols.map((c, i) => [c, i]));
  const cs = T.calls.filter((c) => c[0] <= o.last), c90 = cs.filter((c) => c[0] <= 90);
  o.calls = cs.length; o.hits = cs.filter((c) => c[cx.hit]).length; o.calls90 = c90.length; o.hits90 = c90.filter((c) => c[cx.hit]).length;
  const stake = {}; for (const c of cs) for (const k in (c[cx.reasons] || {})) if (k === 'stake') stake.n = (stake.n || 0) + c[cx.reasons][k];
  o.stakeReason = stake.n || 0;
  //   부름 까닭 묶음(그 부름이 새로 판정한 후보) · 다시 훑기(T1380_SHADOW 판 — 빈손 부름의 전수 그림)
  const grp = (r) => /기존 집|집터와|의뢰/.test(r) ? 'house' : /영토 밖/.test(r) ? 'terr' : /농지/.test(r) ? 'field' : /쉼터/.test(r) ? 'shelter' : r === 'stake' ? 'stake' : r === 'ok' ? 'ok' : 'other';
  o.rsn = {}; for (const c of cs) for (const k in (c[cx.reasons] || {})) if (k[0] !== '_') { const g = grp(k); o.rsn[g] = (o.rsn[g] || 0) + c[cx.reasons][k]; }
  const sh = cs.filter((c) => c[cx.shadow]);
  if (sh.length) {
    o.shadow = { n: sh.length, pass: [0, 1].map((i) => { const P2 = sh.map((c) => c[cx.shadow][i]).filter(Boolean), R2 = {}; let cand = 0, outOk = 0; const miss = [];
      for (const p of P2) { cand += p.cand; outOk += p.outOk; for (const k in p.n) { const g = grp(k); R2[g] = (R2[g] || 0) + p.n[k]; } if (p.bestMiss != null) miss.push(p.bestMiss); }
      miss.sort((x, y) => x - y);
      return { cand: cand / P2.length, rsn: Object.fromEntries(Object.entries(R2).map(([k, v]) => [k, v / P2.length])), outOk: outOk / P2.length, missMed: miss.length ? miss[miss.length >> 1] : null, missQ: miss.length ? [miss[miss.length >> 2], miss[(3 * miss.length) >> 2]] : null }; }) };
  }
  o.shelterCalls = cs.filter((c) => c[cx.shelter]).length;
  { const per = new Map(); for (const c of cs) { const nm = T.names[c[cx.v]]; let q = per.get(nm); if (!q) { q = [0, 0]; per.set(nm, q); } q[0]++; if (c[cx.hit]) q[1]++; } o.zeroSite = [...per].filter(([, q]) => q[1] === 0).map(([nm, q]) => `${nm}(${q[0]})`); }
  const V = T.vrows.filter((r) => r[0] <= o.last);
  o.ratioYear = {}; for (const yd of [365, 730]) { if (yd > o.last) continue; const e = V.filter((r) => r[0] === yd && r[vx.N] > 0).map((r) => r[vx.terrN] / capF(r[vx.N])); o.ratioYear[yd] = { mean: mean(e), min: e.length ? Math.min(...e) : null }; }
  o.stakeW = V.reduce((x, r) => x + (r[vx.stakeW] || 0), 0) + V.reduce((x, r) => x + (r[vx.claimWood] || 0), 0);
  o.fuel = mean(V.filter((r) => r[0] > o.last - 30 && r[vx.N] > 0 && r[vx.fuelCov] != null).map((r) => r[vx.fuelCov]));
  const why = {}; for (const r of V) if (r[vx.N] > 0 && r[vx.why]) { const w = String(r[vx.why]).replace(/^grow\+.*/, 'grow'); why[w] = (why[w] || 0) + 1; }
  o.why = why;
  const K = {}; for (const k of ['lfDays', 'lfCells', 'claims', 'claimCells', 'claimWood', 'claimLabor', 'stake', 'happy', 'rateCut']) K[k] = vx[k] == null ? null : V.reduce((x, r) => x + (r[vx[k]] || 0), 0);
  o.knob = K;
  //   합격선 — 마을-날 비
  const below = V.filter((r) => r[vx.N] > 0 && r[vx.terrN] / capF(r[vx.N]) < 0.8).length;
  const end = V.filter((r) => r[0] === o.last && r[vx.N] > 0).map((r) => ({ v: T.names[r[vx.v]], N: r[vx.N], terr: r[vx.terrN], r: r[vx.terrN] / capF(r[vx.N]), lab: r[vx.terrN] / labF(r[vx.N]) }));
  end.sort((a, b) => a.r - b.r);
  o.ratioEnd = mean(end.map((e) => e.r)); o.labEnd = mean(end.map((e) => e.lab)); o.worst = end[0] || null; o.below = below; o.vdays = V.filter((r) => r[vx.N] > 0).length;
  if (o.fdV && o.fdV.size && vx.farmN != null) { const ends = V.filter((r) => r[0] === o.last && o.fdV.has(T.names[r[vx.v]])); o.trap = { vils: o.fdV.size, fd: [...o.fdV.values()].reduce((a, b) => a + b, 0), ratio: mean(ends.filter((r) => r[vx.N] > 0).map((r) => r[vx.terrN] / capF(r[vx.N]))), farm: mean(ends.map((r) => r[vx.farmN] || 0)), h: mean(ends.filter((r) => r[vx.h] != null).map((r) => r[vx.h])) }; }
  else if (o.fdV) o.trap = { vils: o.fdV.size, fd: [...o.fdV.values()].reduce((a, b) => a + b, 0) };
  o.ratioBy = {}; for (const d of [30, 90, 150, 240, 365, 730]) { if (d > o.last) continue; const e = V.filter((r) => r[0] === d && r[vx.N] > 0).map((r) => r[vx.terrN] / capF(r[vx.N])); o.ratioBy[d] = mean(e); }
  const ux = Object.fromEntries((T.ucols || []).map((c, i) => [c, i]));
  const ud = (T.use || []).map((u) => u[0]).filter((d) => d <= o.last); const uD = ud.length ? Math.max(...ud) : null;
  if (uD != null) { const U = {}; for (const u of T.use) if (u[0] === uD) for (const k of ['grown', 'house', 'field', 'pot', 'work', 'other', 'gone']) U[k] = (U[k] || 0) + (u[ux[k]] || 0); o.use = Object.assign({ day: uD }, U); }
  //   ★[덧붙임 셋] ⑩ 진단 — 넓히기 몸-분 · 기근 문(econ 곳간 식량 등가 < 사람 × 30) · 일괄 몸의 본업 · (몸 세계) 영토 일감을 쥔 몸
  if (vx.hgr != null) {
    let lab = 0, labH = 0, cells = 0, cellsH = 0, vd = 0, vdH = 0, spare = 0, tbn = 0, tb = 0, tbF = 0, tbH = 0, tbHF = 0, vdHt = 0; const job = {}, jobH = {};
    for (const r of V) {
      if (!(r[vx.N] > 0)) continue; vd++; const h = r[vx.hgr] === 1; if (h) vdH++;
      const m = r[vx.laborMin] || 0, c = r[vx.cellsT] || 0; lab += m; cells += c; if (h) { labH += m; cellsH += c; }
      const j = r[vx.bJob] || '—'; job[j] = (job[j] || 0) + m; if (h) jobH[j] = (jobH[j] || 0) + m;
      spare += r[vx.spare] || 0;
      if (r[vx.tBody] != null) { tbn++; tb += r[vx.tBody]; tbF += r[vx.tFood] || 0; if (h) { vdHt++; tbH += r[vx.tBody]; tbHF += r[vx.tFood] || 0; } }
    }
    const top = (q, tot) => Object.entries(q).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${tot ? (100 * v / tot).toFixed(0) : 0}%`).join(' · ') || '—';
    o.diag = { vd, vdH, lab, labH, cells, cellsH, spare, jobs: top(job, lab), jobsH: top(jobH, labH), tb: tbn ? { n: tbn, tb, tbF, nH: vdHt, tbH, tbHF } : null };
  }
  //   ★[덧붙임 셋] ⑪ 인구가 선 마을-날 — N(d) ≤ N(d − 30) 인 마을-날(사람 > 0 · 날 > 30)을 까닭으로 가른다(겹쳐 셈 + 차례로 한 칸)
  {
    const byV = new Map(); for (const r of H.rows) { if (r[0] > o.last) continue; const nm = H.names[r[hx.v]]; let m = byV.get(nm); if (!m) { m = new Map(); byV.set(nm, m); } m.set(r[0], r); }
    const fe = new Map(); if (vx.feRaw != null) for (const r of V) fe.set(r[0] + '|' + T.names[r[vx.v]], r[vx.feRaw]);
    const C = { n: 0, food: 0, desp: 0, unh: 0, gate: 0, K: 0, none: 0 }, Q = { food: 0, desp: 0, unh: 0, gate: 0, K: 0, none: 0 };
    for (const [nm, m] of byV) for (const [d, r] of m) {
      if (d <= 30 || !(r[hx.N] > 0)) continue; const p = m.get(d - 30); if (!p || r[hx.N] > p[hx.N]) continue;
      C.n++;
      const h = r[hx.h], fr = fe.get(d + '|' + nm);
      const f = (r[hx.fd] || 0) > 0 || r[hx.bGate] === 1, de = h != null && fr != null && h < 0.32 && fr < 10, un = h != null && h < 0.25, ga = r[hx.gated] === 1, k = r[hx.K] != null && r[hx.N] >= r[hx.K];
      if (f) C.food++; if (de) C.desp++; if (un) C.unh++; if (ga) C.gate++; if (k) C.K++; if (!f && !de && !un && !ga && !k) C.none++;
      Q[f ? 'food' : de ? 'desp' : un ? 'unh' : ga ? 'gate' : k ? 'K' : 'none']++;
    }
    o.stall = { C, Q, desp: vx.feRaw != null };
  }
  //   ★[덧붙임 셋] ⑫ K 세 항(econ `_kDbg` — 식량 자리 · 식량 흐름 · 땔감 · K = 셋 중 작은 것 · T1373_HOME_CAP 켬 = 식량 자리 빠짐) — 끝 날 마을마다
  if (vx.kS != null) {
    const Hl = new Map(lastRows.map((r) => [H.names[r[hx.v]], r])), hc = !!(T.env && T.env.HC === '1');
    const rows = V.filter((r) => r[0] === o.last && r[vx.N] > 0).map((r) => {
      const nm = T.names[r[vx.v]], h = Hl.get(nm) || [], ks = r[vx.kS], kp = r[vx.kP], kf = r[vx.kF];
      const terms = hc ? [['식량 흐름', kp], ['땔감', kf]] : [['식량 자리', ks], ['식량 흐름', kp], ['땔감', kf]];
      let by = null; for (const [n, v] of terms) if (v != null && (by == null || v < by[1])) by = [n, v];
      const K = h[hx.K], N = r[vx.N], beds = h[hx.beds];
      return { v: nm, N, K, by: by ? by[0] : '—', ks, kp, kf, nk: K ? N / K : null, h: h[hx.h], vac: beds != null ? beds - N : null, tr: r[vx.terrN] / capF(N), gated: h[hx.gated] };
    }).sort((a, b) => b.N - a.N);
    const cnt = {}; for (const x of rows) cnt[x.by] = (cnt[x.by] || 0) + 1;
    o.kterm = { top: rows.slice(0, 10), cnt, n: rows.length, hc };
  }
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
  const H = loadSegs(o.dir, 't1345'), hx = Object.fromEntries(H.cols.map((c, i) => [c, i]));
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
const WHY = [['grow', '늘었다'], ['target', '목표 닿음'], ['wood', '통나무 없음'], ['body', '몸 없음'], ['food', '기근 문(덧붙임 셋)'], ['labor', '개간 중'], ['none', '그 밖']];
P('| 판 | 시드 | ' + WHY.map((w) => w[1]).join(' | ') + ' |');
P('|---|---|' + WHY.map(() => '---').join('|') + '|');
for (const o of D) if (o.ok && o.why) P(`| ${o.k} | ${o.seed} | ` + WHY.map((w) => n0(o.why[w[0]] || 0)).join(' | ') + ' |');
P('\n## ④ 넓힌 칸의 쓰임(첫 날 뒤 영토에 든 칸 · 쓰임 날)\n');
P('| 판 | 시드 | 날 | 넓힌 칸 | 집 부지 | 밭 | 논 존닝 | 일터 | 그 밖 | 빠짐 |');
P('|---|---|---|---|---|---|---|---|---|---|');
for (const o of D) if (o.ok && o.use) { const u = o.use, s = (k) => `${n0(u[k])}(${u.grown ? (100 * u[k] / u.grown).toFixed(0) : 0}%)`; P(`| ${o.k} | ${o.seed} | ${u.day} | ${n0(u.grown)} | ${s('house')} | ${s('field')} | ${s('pot')} | ${s('work')} | ${s('other')} | ${s('gone')} |`); }
P('\n## ⑤ T1380 손잡이 셈(마을-날 합)\n');
P('| 판 | 시드 | (가) 앞세운 날 | 앞세운 칸 | (나) 그 자리 넣기 | 넣은 칸 | 통나무 | 안 치른 개간 분 | 거절 stake(부름 까닭 · 마을 셈) | 행복 lot 기다림 | 행복 rate 덜 넓힌 칸 |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
for (const o of D) if (o.ok && o.knob && !o.off) { const K = o.knob; P(`| ${o.k} | ${o.seed} | ${n0(K.lfDays)} | ${n0(K.lfCells)} | ${n0(K.claims)} | ${n0(K.claimCells)} | ${n0(K.claimWood)} | ${n0(K.claimLabor)} | ${n0(o.stakeReason)} · ${n0(K.stake)} | ${n0(K.happy)} | ${n0(K.rateCut)} |`); }
P('\n## ⑦ 마을별 최악(켬 기본 점검표 — 평균 아님)\n');
P('| 판 | 시드 | 집터 0 인 마을(부름 수) | 가장 오래 주거 문에 막힌 마을(날 · 가장 긴 줄) | 같은 시드 끔 대비 사람 비가 가장 낮은 마을(끔 사람 ≥ 10) | 빈 마을(끝 날) |');
P('|---|---|---|---|---|---|');
for (const o of D) {
  if (!o.ok) continue;
  const f = offOf(o); let wv = null;
  if (f && !o.off && f.popV) for (const [nm, n0f] of f.popV) { if (!(n0f >= 10)) continue; const r = (o.popV.get(nm) || 0) / n0f; if (!wv || r < wv.r) wv = { v: nm, r, n: o.popV.get(nm) || 0, nf: n0f }; }
  const g = o.gateWorst;
  P(`| ${o.k} | ${o.seed} | ${o.zeroSite ? (o.zeroSite.length ? `${o.zeroSite.length} — ${o.zeroSite.slice(0, 6).join(' · ')}${o.zeroSite.length > 6 ? ' …' : ''}` : '0') : '—'} | ${g ? `${g.v} ${g.n}날 · ${g.max}날` : '—'} | ${wv ? `${wv.v} ${f3(wv.r)}(${wv.n} : ${wv.nf})` : '—'} | ${n0(o.empty)} |`);
}
if (D.some((o) => o.ok && o.last >= 730)) {
  P('\n## ⑧ 해마다(두 해 판) — 날 365 · 730\n');
  P('| 판 | 시드 | 날 | 사람 | 끔비 | 합격선 비(마을 평균 · 가장 낮은 마을) | 굶어 죽음(누계) | 죽음(누계) |');
  P('|---|---|---|---|---|---|---|---|');
  for (const o of D) { if (!o.ok || !o.yearRows) continue; const f = offOf(o); for (const yd of [365, 730]) { const y = o.yearRows[yd]; if (!y) continue; const fy = f && f.yearRows ? f.yearRows[yd] : null, ry = o.ratioYear ? o.ratioYear[yd] : null;
    P(`| ${o.k} | ${o.seed} | ${yd} | ${n0(y.pop)} | ${o.off || !fy ? '—' : f3(y.pop / fy.pop)} | ${ry ? `${f3(ry.mean)} · ${f3(ry.min)}` : '—'} | ${n0(y.fd)}${fy && !o.off ? ` : ${n0(fy.fd)}` : ''} | ${n0(y.dead)}${fy && !o.off ? ` : ${n0(fy.dead)}` : ''} |`); } }
}
P('\n## ⑨ 덧붙임 둘 칸 — 마을 크기 · 큰 마을 행복 · 불행 이탈 · 굶는 마을(끝 날)\n');
P('| 판 | 시드 | 사람(끝) | 빈 마을 | 마을 크기 가운데 · 200명 넘는 마을 | 가장 큰 다섯 | 큰 다섯 행복(끝 30날) | h < 0.25 · < 0.32 마을-날 | 주거 문 닫힌 마을-날 | 떠남(불행 이탈) | 굶는 마을(굶어 죽음 · 영토 비 · 밭 칸 · h) |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
for (const o of D) if (o.ok && o.size) { const t = o.trap; P(`| ${o.k} | ${o.seed} | ${n0(o.pop.get(o.last))} | ${n0(o.empty)} | ${n0(o.size.med)} · ${n0(o.size.over200)} | ${o.size.top.map((x) => `${x.v} ${x.N}`).join(' · ')} | ${f3(o.topH)} | ${n0(o.lt25)} · ${n0(o.lt32)} | ${n0(o.gated)} | ${n0(o.emig)} | ${t ? `${t.vils}곳(${n0(t.fd)}${t.ratio != null ? ` · ${f3(t.ratio)} · ${n0(t.farm)} · ${f3(t.h)}` : ''})` : '—'} |`); }
if (D.some((o) => o.diag)) {
  P('\n## ⑩ 덧붙임 셋 진단 — 넓히기 몸-분과 기근 문(econ 곳간 식량 등가 < 사람 × `T1297_FAMINE_DAYS` 30) · 일괄 몸의 본업\n');
  P('| 판 | 시드 | 기근 문 닫힌 마을-날 / 마을-날 | 넓히기 몸-분 · 그중 기근 문 날 | 넓힌 칸(일괄) · 그중 기근 문 날 | 일괄 몸의 본업(몸-분 몫) | 그중 기근 문 날 | 문이 막은 마을-날(SPARE) | (몸 세계) 영토 일감을 쥔 몸 / 마을-날 · 그중 식량 일꾼 · 기근 문 날 |');
  P('|---|---|---|---|---|---|---|---|---|');
  for (const o of D) if (o.diag) { const g = o.diag, t = g.tb; P(`| ${o.k} | ${o.seed} | ${pc(g.vdH, g.vd)} | ${n0(g.lab)} · ${g.lab ? (100 * g.labH / g.lab).toFixed(1) : '—'}% | ${n0(g.cells)} · ${g.cells ? (100 * g.cellsH / g.cells).toFixed(1) : '—'}% | ${g.jobs} | ${g.jobsH} | ${n0(g.spare)} | ${t ? `${(t.tb / t.n).toFixed(2)} · ${t.tb ? (100 * t.tbF / t.tb).toFixed(0) : '—'}% · ${t.nH ? (t.tbH / t.nH).toFixed(2) : '—'}(식량 일꾼 ${t.tbH ? (100 * t.tbHF / t.tbH).toFixed(0) : '—'}%)` : '—'} |`); }
}
if (D.some((o) => o.stall)) {
  P('\n## ⑪ 인구가 선 마을-날(N(날) ≤ N(날 − 30) · 사람 > 0) — 무엇에 막혀 섰나(겹쳐 셈 · 끝 칸 = 차례로 한 칸: 식량 > 절망 > 불행 > 주거 문 > K > 그 밖)\n');
  P('| 판 | 시드 | 선 마을-날 | 식량(굶어 죽음 · 출생 곳간 문) | 절망 이탈 선(h < 0.32 · 날것 곳간 < 사람 × 10) | 불행 이탈(h < 0.25) | 주거 문(집 없음) | K 에 닿음(N ≥ K) | 넷 · K 다 아님 | 차례로 한 칸 |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (const o of D) if (o.stall) { const { C, Q } = o.stall, pp = (x) => C.n ? `${n0(x)}(${(100 * x / C.n).toFixed(0)}%)` : '—'; P(`| ${o.k} | ${o.seed} | ${n0(C.n)} | ${pp(C.food)} | ${o.stall.desp ? pp(C.desp) : '—'} | ${pp(C.unh)} | ${pp(C.gate)} | ${pp(C.K)} | ${pp(C.none)} | 식 ${n0(Q.food)} · 절 ${o.stall.desp ? n0(Q.desp) : '—'} · 불 ${n0(Q.unh)} · 주 ${n0(Q.gate)} · K ${n0(Q.K)} · 밖 ${n0(Q.none)} |`); }
  P('\n절망 이탈 문은 정착 보호기(`bandits.js` `BDT_MIN_DAY` 365날) 뒤에 열린다 — 첫 해 칸은 위기 선(그 문이 보는 줄)에 선 날이지 떠난 날이 아니다.');
}
if (D.some((o) => o.kterm)) {
  P('\n## ⑫ 인구 상한 K 의 세 항(econ `_kDbg` · K = 식량 자리 · 식량 흐름 · 땔감 흐름 중 작은 것 · `T1373_HOME_CAP=1` 이면 식량 자리가 빠진다) — 끝 날\n');
  for (const o of D) if (o.kterm) {
    const q = o.kterm, b = q.top[0];
    P(`**${o.k} · 시드 ${o.seed}${q.hc ? ' · HOME_CAP' : ''}** — 가장 큰 마을 ${b ? `${b.v} ${b.N}명 · K 를 정한 항 ${b.by}(N ÷ K ${f2(b.nk)} · 행복 ${f2(b.h)} · 집 빈자리 ${n0(b.vac)} · 영토 ÷ 목표 ${f2(b.tr)})` : '—'} · 항별 마을 수(${q.n}곳): ${Object.entries(q.cnt).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`);
    P('| 마을 | 사람 | K | K 를 정한 항 | 식량 자리 · 식량 흐름 · 땔감 | N ÷ K | 행복 | 집 빈자리 | 영토 ÷ 목표 | 주거 문 |');
    P('|---|---|---|---|---|---|---|---|---|---|');
    for (const x of q.top) P(`| ${x.v} | ${x.N} | ${n0(x.K)} | ${x.by} | ${n0(x.ks)} · ${n0(x.kp)} · ${n0(x.kf)} | ${f2(x.nk)} | ${f2(x.h)} | ${n0(x.vac)} | ${f2(x.tr)} | ${x.gated ? '닫힘' : '—'} |`);
    P('');
  }
}
P('\n## ⑥ 집터 찾기 부름 — 그 부름이 새로 판정한 후보의 거부 까닭(부름 합 · 끝 날까지) · 다시 훑기(빈손 부름 전수 · 부름당)\n');
const RG = [['house', '집과 너무 가까움'], ['terr', '영토 밖'], ['field', '개간 밭 위'], ['shelter', '쉼터'], ['stake', 'stake'], ['other', '그 밖']];
P('| 판 | 시드 | 부름 | 찾음 | 쉼터 선 마을의 부름 | ' + RG.map((g) => g[1]).join(' | ') + ' |');
P('|---|---|---|---|---|' + RG.map(() => '---').join('|') + '|');
for (const o of D) if (o.ok && o.rsn) P(`| ${o.k} | ${o.seed} | ${n0(o.calls)} | ${n0(o.hits)}(${o.calls ? (100 * o.hits / o.calls).toFixed(1) : '—'}%) | ${n0(o.shelterCalls)} | ` + RG.map((g) => n0(o.rsn[g[0]] || 0)).join(' | ') + ' |');
if (D.some((o) => o.shadow)) {
  P('\n| 판 | 패스 | 빈손 부름 | 후보/부름 | ' + RG.filter((g) => g[0] !== 'stake').map((g) => g[1]).join(' | ') + ' | 넣을 수 있는 영토 밖 후보/부름 | 가장 가까운 그 후보의 모자란 칸(가운데 · 사분) |');
  P('|---|---|---|---|' + RG.filter((g) => g[0] !== 'stake').map(() => '---').join('|') + '|---|---|');
  for (const o of D) if (o.shadow) for (const i of [0, 1]) { const p = o.shadow.pass[i]; P(`| ${o.k} | ${i ? '느슨' : '엄격'} | ${n0(o.shadow.n)} | ${p.cand.toFixed(1)} | ` + RG.filter((g) => g[0] !== 'stake').map((g) => (p.rsn[g[0]] || 0).toFixed(1)).join(' | ') + ` | ${p.outOk.toFixed(1)} | ${p.missMed == null ? '—' : `${p.missMed} · ${p.missQ[0]} ~ ${p.missQ[1]}`} |`); }
}
const txt = L.join('\n') + '\n';
if (MD) fs.writeFileSync(MD, txt); else process.stdout.write(txt);
if (JS) fs.writeFileSync(JS, JSON.stringify(D.map((o) => { const c = Object.assign({}, o); delete c.pop; delete c.fdAt; delete c.deadAt; delete c.popV; delete c.fdV; c.popEnd = o.pop ? o.pop.get(o.last) : null; c.pop150 = o.pop ? o.pop.get(150) : null; return c; }), null, 1));
