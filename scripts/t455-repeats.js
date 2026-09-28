#!/usr/bin/env node
// === scripts/t455-repeats.js — 자가 흔들린다: **같은 설정 n판**과 흔들림의 주인 (T455) ==========================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 코드 무접촉 — 판 하나는 `scripts/t371-tick-rest.js` 한 번이다
//   (탐침은 그 자가 `git worktree` 사본에만 박는다). 이 파일은 **판을 차례로 돌리고**(동시 0 — 호스트 경합이 후보라서)
//   결과를 한 표로 모은다. 규약 문법·n 유도는 `scripts/lib-tick-rule.js`(ⓕ `RULE_REPEATS`) 하나 — 여기서 다시 쓰지 않는다.
//
// ★판의 시계 셋(주인 후보 넷 중 둘을 켬/끔으로 가른다 — 나머지 둘(GC · 호스트 경합)은 판마다 값으로 적는다):
//   wall    — 종전(T433·T444 그대로) · 게임 시계 = 벽시계 · 첫 하루 경계를 기다린다(판마다 24분에 묶인다)
//   anchor  — T427 `ZONE_CLOCK_ANCHOR=boot`(기동 동안 멈춤) · 나머지 wall 과 같다
//   fixed   — anchor + `T455_CLOCK_AT`(자 · 사본에만) = 판마다 **같은 게임 시각**(같은 게임일 · 같은 phase)에서 첫 틱
//             ⇒ 씨의 게임일 · 기동 뒤 흐른 시간 · 템플릿 뒤 흐른 시간이 판마다 같다
//   seed    — fixed 인데 원점을 판마다 **하루씩** 민다(같은 phase · 다른 게임일) ⇒ fixed 와의 차가 곧 "씨(게임일)"의 몫
//   +hog    — 판 내내 한 코어를 도는 프로세스 하나(`node -e for(;;){}`) = 호스트 경합 켬
//
// 실행: node scripts/t455-repeats.js run <plan>   (plan = own | knobs | reach | 쉼표 목록 "tag:clock:env;…")
//       node scripts/t455-repeats.js table          (/tmp/t455 의 판 전부 → 표 · /tmp/t455/table.json)
//   T455_DIR=/tmp/t455 · T455_TPL=/tmp/t444/tpl-inf.db · T455_LEAD_S=150(fixed 원점 = 경계 앞 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync, spawn } = require('child_process');
const R = require('./lib-tick-rule');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.T455_DIR || '/tmp/t455';
const TPL = process.env.T455_TPL || '/tmp/t444/tpl-inf.db';
const DAY = 1440000;   // = zone-config WORLD.dayLengthMs(t371 DAY_MS 기본과 같은 수 — 아래에서 대조)
const LEAD_S = parseInt(process.env.T455_LEAD_S || '150', 10);
fs.mkdirSync(DIR, { recursive: true });

// ── 팔 정의 ──────────────────────────────────────────────────────────────
const BASE = process.env.T455_BASE || 'VILLAGE_NPC_CAP=999999,T312_FISH_ACT=1';   // ★[T461] `T455_BASE` — 다른 틀(몸 1,329 · 상한 기본)의 켬 팔   // T433 ③ #54 켬 팔 · T444 와 같은 설정(무제한 틀 · 어획 걸음)
function clockAt(tpl, shiftDays) {
  const m = fs.statSync(tpl).mtimeMs;
  return (Math.floor(m / DAY) + 2 + (shiftDays || 0)) * DAY - LEAD_S * 1000;   // 템플릿 뒤 둘째 경계 앞 LEAD_S 초
}
const PLANS = {
  // ① 흔들림 해부 — 차례가 곧 설계다(판마다 시계를 섞어 흐름 탓을 나눠 가진다)
  own: [
    ['wall', 1], ['anchor', 1], ['fixed', 1], ['fixedhog', 1], ['seed', 1],
    ['wall', 2], ['anchor', 2], ['fixed', 2], ['fixedhog', 2], ['seed', 2],
    ['wall', 3], ['anchor', 3], ['fixed', 3], ['fixedhog', 3], ['seed', 3],
    ['wall', 4], ['fixed', 4],
    ['wall', 5], ['fixed', 5],
  ].map(([c, i]) => ({ tag: `${c}-${i}`, clock: c.replace('hog', ''), hog: c.endsWith('hog'), env: BASE, round: i })),
};
// ③ 손잡이 — 팔 다섯을 한 바퀴로 돌리고 바퀴를 n 번(흐름을 팔이 나눠 가진다)
function knobPlan(rounds, clock, from, only) {
  let arms = [['on', BASE], ['t385off', BASE + ',T385_ONE_SWEEP=0'], ['t421off', BASE + ',T421_SPATIAL_INC=0'],
    ['t394off', BASE + ',T394_WORK_TERRAIN=0'], ['t427on', BASE + ',T427_SITE_REACH=1'], ['ww', BASE + ',T461_WALK_WASM=1'], ['wwoff', BASE + ',T461_WALK_WASM=0']];   // ★[T461] 걸음 커널 켬 · ★[T499] 기본 켬 뒤의 끔 팔
  if (only) arms = arms.filter(([a]) => only.split('+').includes(a));   // 바퀴를 늘릴 때 — 작은 몫의 팔만(켬은 짝이라 늘 같이)
  const out = [];
  for (let i = from || 1; i <= rounds; i++) for (const [a, e] of arms) out.push({ tag: `k-${a}-${i}`, clock, hog: false, env: e, round: i });
  return out;
}
// ③ T427 제 설정(틀 t316 · 몸 상한 40 · T381 자와 같은 설정) — 끔/켬 짝
function reachPlan(rounds, clock) {
  const out = [];
  for (let i = 1; i <= rounds; i++) for (const [a, e] of [['off', 'T312_FISH_ACT=1'], ['on', 'T312_FISH_ACT=1,T427_SITE_REACH=1']])
    out.push({ tag: `r-${a}-${i}`, clock, hog: false, env: e, round: i, tpl: '/tmp/t316-tpl.db' });
  return out;
}

function runOne(p) {
  const out = path.join(DIR, `${p.tag}.json`);
  if (fs.existsSync(out)) { console.log('[t455] 있음 — 건너뜀', p.tag); return; }
  const tpl = p.tpl || TPL;
  let env = p.env;
  const E = Object.assign({}, process.env, { WAITDAY: '1', T444_SUB: '1', T455_OWN: '1', WINDOW: 'day', PH_LO: '0.10', PH_HI: '0.115',
    TPL: tpl, ARM: p.tag, SRC_REF: process.env.T455_REF || 'HEAD' });
  delete E.T455_CLOCK_AT;
  if (p.clock !== 'wall') env += ',ZONE_CLOCK_ANCHOR=boot';
  if (p.clock === 'fixed') E.T455_CLOCK_AT = String(clockAt(tpl, 0));
  if (p.clock === 'seed') E.T455_CLOCK_AT = String(clockAt(tpl, p.round));
  E.ARM_ENV = env;
  let hog = null;
  if (p.hog) hog = spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', detached: false });
  const t0 = Date.now();
  console.log('[t455] 판', p.tag, '·', p.clock, p.hog ? '+hog' : '', '·', env, E.T455_CLOCK_AT ? '· 원점 ' + new Date(+E.T455_CLOCK_AT).toISOString() : '');
  const r = spawnSync(process.execPath, [path.join(__dirname, 't371-tick-rest.js'), out + '.tmp'], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  if (hog) { try { process.kill(hog.pid); } catch (e) {} }
  fs.writeFileSync(path.join(DIR, `${p.tag}.log`), String(r.stdout || '') + String(r.stderr || ''));
  if (r.status === 0 && fs.existsSync(out + '.tmp')) {
    const j = JSON.parse(fs.readFileSync(out + '.tmp', 'utf8'));
    j.t455 = { tag: p.tag, clock: p.clock, hog: !!p.hog, env, round: p.round, clockAt: E.T455_CLOCK_AT ? +E.T455_CLOCK_AT : null, wallMs: Date.now() - t0, tpl };
    fs.writeFileSync(out, JSON.stringify(j));
    fs.unlinkSync(out + '.tmp');
    console.log('[t455] 끝', p.tag, Math.round((Date.now() - t0) / 1000), 's');
  } else console.log('[t455] 실패', p.tag, r.status);
  spawnSync('sleep', ['15']);
}

// ── 표 ────────────────────────────────────────────────────────────────────
function runValues(j) {
  const S = j.run.slices;
  const rest = (s) => (s.rest && s.rest[0]) || null;
  const p50 = S.map((s) => s.p50), p95 = S.map((s) => s.p95);
  const ticks = S.map((s) => { const r = rest(s); return r ? r.n : null; });
  const perTick = (f) => { let a = 0, n = 0; for (const s of S) { const r = rest(s); if (r && r.x) { a += f(r); n += r.n; } } return n ? a / n : null; };
  const own = (k) => S.map((s) => { const r = rest(s); return r && r.own ? r.own[k] : null; });
  const sum = (a) => a.filter((x) => x != null).reduce((x, y) => x + y, 0);
  const pops = S.map((s) => { const r = rest(s); return r ? r.pop : null; });
  const nonSleep = S.map((s) => s.nonSleep);
  const host = (k) => S.map((s) => (s.host ? s.host[k] : null));
  const bnd = j.run.dayWait;
  return {
    tag: j.t455.tag, clock: j.t455.clock, hog: j.t455.hog, env: j.t455.env, round: j.t455.round,
    p50: R.median(p50), p95: R.median(p95), p50s: p50, p95s: p95, p95max: Math.max(...p95.filter((x) => x != null)),
    sliceSd: R.sd(p50), under: p95.filter((x) => x != null && x < 33.3).length + '/' + p95.length,
    pathMsTick: perTick((r) => r.x.pathT || 0), pathCallsTick: perTick((r) => r.x.path || 0),
    gcMsS: sum(own('gcMs')) / (S.length * j.SLICE_S), gcN: sum(own('gcN')), gcMaj: sum(own('gcMaj')),
    cpuPct: 100 * (sum(own('cpuU')) + sum(own('cpuS'))) / (S.length * j.SLICE_S * 1000),
    busy: R.median(host('busy')), steal: R.median(host('steal')), load1: R.median(host('load1')),
    pop: R.median(pops), nonSleep: R.median(nonSleep), drop: sum(S.map((s) => s.drop || 0)),
    bootMs: j.run.bootMs, boundWaitMs: bnd ? bnd.waitedMs : null, bootToWinS: j.run.winAt && j.run.bootAt ? (j.run.winAt - j.run.bootAt) / 1000 : null,
    startAt: j.run.bootAt, heapMB: R.median(own('heapMB')),
  };
}
function pearson(x, y) {
  const P = x.map((v, i) => [v, y[i]]).filter(([a, b]) => a != null && b != null && isFinite(a) && isFinite(b));
  const n = P.length; if (n < 3) return null;
  const mx = P.reduce((a, [v]) => a + v, 0) / n, my = P.reduce((a, [, v]) => a + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of P) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function table() {
  const loadAll = () => fs.readdirSync(DIR).filter((f) => /\.json$/.test(f) && f !== 'table.json').map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).filter((j) => j.t455 && j.run);
  const runs = loadAll().map(runValues)
    .sort((a, b) => a.startAt - b.startAt);
  const groups = {};
  for (const r of runs) { const g = r.tag.replace(/-\d+$/, ''); (groups[g] = groups[g] || []).push(r); }
  const f2 = (x, d = 2) => (x == null ? '—' : (+x).toFixed(d));
  console.log('\n## 판 하나씩(시작 차례)');
  console.log('| 판 | 낮 p50 | p95 | 조각 sd | A* ms/틱 | GC ms/s | 존 CPU% | 호스트 busy% | steal% | load1 | 기동 s | 기동→창 s | 비취침 | 몸 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of runs) console.log(`| ${r.tag} | ${f2(r.p50)} | ${f2(r.p95)} | ${f2(r.sliceSd)} | ${f2(r.pathMsTick, 3)} | ${f2(r.gcMsS)} | ${f2(r.cpuPct, 1)} | ${f2(r.busy, 1)} | ${f2(r.steal)} | ${f2(r.load1)} | ${f2(r.bootMs / 1000, 0)} | ${f2(r.bootToWinS, 0)} | ${r.nonSleep} | ${r.pop} |`);
  console.log('\n## 설정마다 — 판 사이(중앙값 [폭 · n판]) · 판 사이 sd · 한 판 안 조각 sd(합동) · 조각 흔들림만으로 기대되는 판 sd');
  const G = {};
  for (const [g, rs] of Object.entries(groups)) {
    const s = R.summarize(rs.map((r) => r.p50)), s95 = R.summarize(rs.map((r) => r.p95));
    const within = Math.sqrt(rs.map((r) => r.sliceSd ** 2).reduce((a, b) => a + b, 0) / rs.length);
    const k = rs[0] ? rs[0].p50s.length : 8;
    const expect = within * Math.sqrt(Math.PI / 2) / Math.sqrt(k);   // 조각 k 개의 중앙값 sd(판 사이 성분이 0 일 때)
    const runComp = s.sd != null ? Math.sqrt(Math.max(0, s.sd ** 2 - expect ** 2)) : null;
    G[g] = { n: s.n, p50: s, p95: s95, within, expect, runComp, path: R.summarize(rs.map((r) => r.pathMsTick)), gc: R.summarize(rs.map((r) => r.gcMsS)), busy: R.summarize(rs.map((r) => r.busy)) };
    console.log(`| ${g} | p50 ${R.fmtRepeats(s)} · sd ${f2(s.sd)} (폭 ${f2(s.hi - s.lo)}) | p95 ${R.fmtRepeats(s95)} | 조각 sd ${f2(within)} → 기대 판 sd ${f2(expect)} · 판 성분 ${f2(runComp)} | A* ${R.fmtRepeats(G[g].path, 3)} |`);
  }
  console.log('\n## 주인 후보 값(판 p50 과의 상관 · 같은 시계 무리 안)');
  for (const g of Object.keys(groups)) {
    const rs = groups[g]; if (rs.length < 3) continue;
    const y = rs.map((r) => r.p50);
    console.log(`| ${g} | GC ms/s r=${f2(pearson(rs.map((r) => r.gcMsS), y))} | busy r=${f2(pearson(rs.map((r) => r.busy), y))} | steal r=${f2(pearson(rs.map((r) => r.steal), y))} | load1 r=${f2(pearson(rs.map((r) => r.load1), y))} | 기동→창 r=${f2(pearson(rs.map((r) => r.bootToWinS), y))} | 비취침 r=${f2(pearson(rs.map((r) => r.nonSleep), y))} | 시작 차례 r=${f2(pearson(rs.map((r) => r.startAt), y))} |`);
  }
  // 조각 수준(모든 판): 조각 p50 대 조각 GC·busy — 한 판 안 흔들림의 주인
  //   ★판마다 평균을 뺀 값끼리(판 안 흔들림만) — 설정·판이 다른 조각을 섞으면 설정 차가 상관으로 나온다
  const sl = []; for (const j of loadAll()) {
    const one = j.run.slices.map((s) => { const r = s.rest && s.rest[0]; return { g: j.t455.tag.replace(/-\d+$/, ''), p50: s.p50, gc: r && r.own ? r.own.gcMs / j.SLICE_S : null, busy: s.host && s.host.busy, ns: s.nonSleep, path: r && r.x && r.n ? (r.x.pathT || 0) / r.n : null }; })
      .filter((o) => o.p50 != null && o.gc != null && o.path != null && o.busy != null);
    for (const k of ['p50', 'gc', 'busy', 'ns', 'path']) { const m = one.reduce((a, o) => a + o[k], 0) / (one.length || 1); for (const o of one) o[k] -= m; }
    sl.push(...one);
  }
  const noHog = sl.filter((s) => !/hog/.test(s.g));
  console.log(`\n조각 ${noHog.length}개(hog 뺀 · 판 평균 뺀 값 = 판 안 흔들림) — p50 대 GC ms/s r=${f2(pearson(noHog.map((s) => s.gc), noHog.map((s) => s.p50)))} · 대 호스트 busy r=${f2(pearson(noHog.map((s) => s.busy), noHog.map((s) => s.p50)))} · 대 A* ms/틱 r=${f2(pearson(noHog.map((s) => s.path), noHog.map((s) => s.p50)))} · 대 비취침 r=${f2(pearson(noHog.map((s) => s.ns), noHog.map((s) => s.p50)))}`);
  // ── ③ 손잡이 — 규약 여섯째로 다시 낸 몫(켬 팔 = `k-on` · 같은 바퀴 안 차례로 섞었다) ──
  //   s = 이 자(고정 원점)의 같은 설정 판 사이 sd — `fixed` ∪ `k-on`(설정이 글자까지 같다) · 폭 = RULE_REPEATS.width(s, nA, nB)
  const K = {};
  const base = (groups['k-on'] || []);
  const sPool = R.sd([...(groups.fixed || []), ...base].map((r) => r.p50));
  const sPool95 = R.sd([...(groups.fixed || []), ...base].map((r) => r.p95));
  const sPoolA = R.sd([...(groups.fixed || []), ...base].map((r) => r.pathMsTick));
  if (base.length) {
    console.log(`\n## ③ 손잡이 — 켬(기본) 팔 대 한 손잡이씩 · s(p50) = ${f2(sPool, 3)} · s(p95) = ${f2(sPool95, 3)} · s(A*) = ${f2(sPoolA, 3)} (fixed ∪ k-on · ${(groups.fixed || []).length + base.length}판)`);
    const OLD = { 'k-t385off': 1.83, 'k-t421off': 0.41, 'k-t394off': -0.45, 'k-t427on': null, 'k-ww': null, 'k-wwoff': 1.04 };
    for (const g of ['k-t385off', 'k-t421off', 'k-t394off', 'k-t427on', 'k-ww', 'k-wwoff']) {
      const rs = groups[g] || []; if (!rs.length) continue;
      const a = R.summarize(base.map((r) => r.p50)), b = R.summarize(rs.map((r) => r.p50));
      const d = b.med - a.med, w = R.RULE_REPEATS.width(sPool, a.n, b.n);
      const a95 = R.summarize(base.map((r) => r.p95)), b95 = R.summarize(rs.map((r) => r.p95));
      const aA = R.summarize(base.map((r) => r.pathMsTick)), bA = R.summarize(rs.map((r) => r.pathMsTick));
      const dA = bA.med - aA.med, wA = R.RULE_REPEATS.width(sPoolA, aA.n, bA.n);
      const need = OLD[g] != null ? R.RULE_REPEATS.n(sPool, OLD[g]) : null, needNow = R.RULE_REPEATS.n(sPool, d);
      // 짝(같은 바퀴) — 팔−켬 차를 바퀴마다
      const byR = (arr) => Object.fromEntries(arr.map((r) => [r.round, r]));
      const B0 = byR(base), B1 = byR(rs);
      const pr = Object.keys(B1).filter((k) => B0[k]);
      const pd = pr.map((k) => B1[k].p50 - B0[k].p50), pd95 = pr.map((k) => B1[k].p95 - B0[k].p95), pdA = pr.map((k) => B1[k].pathMsTick - B0[k].pathMsTick);
      const P = (arr) => { const sd = R.sd(arr), m = R.median(arr), w = sd != null ? R.RULE_REPEATS.widthPaired(sd, arr.length) : null; return { n: arr.length, med: m, lo: Math.min(...arr), hi: Math.max(...arr), sd, w, verdict: w != null ? R.RULE_REPEATS.verdict(m, w) : '—', needOld: OLD[g] != null && sd != null ? R.RULE_REPEATS.nPaired(sd, OLD[g]) : null, needNow: sd != null ? R.RULE_REPEATS.nPaired(sd, m) : null }; };
      K[g] = { on: a, arm: b, d, w, verdict: R.RULE_REPEATS.verdict(d, w), on95: a95, arm95: b95, onA: aA, armA: bA, dA, wA, verdictA: R.RULE_REPEATS.verdict(dA, wA), needOld: need, needNow,
        paired: { p50: P(pd), p95: P(pd95), path: P(pdA), diffs: pd } };
      const q = K[g].paired;
      console.log(`|   짝 ${q.p50.n}바퀴 | 팔−켬 p50 ${f2(q.p50.med)} [${f2(q.p50.lo)}–${f2(q.p50.hi)}] s_d ${f2(q.p50.sd, 3)} ± 폭 ${f2(q.p50.w)} → **${q.p50.verdict}** · n(옛) ${q.p50.needOld} · n(잰) ${q.p50.needNow} | p95 ${f2(q.p95.med)} ± ${f2(q.p95.w)} → ${q.p95.verdict} | A* ${f2(q.path.med, 3)} ± ${f2(q.path.w, 3)} → ${q.path.verdict} |`);
      console.log(`| ${g} | 켬 ${R.fmtRepeats(a)} · 팔 ${R.fmtRepeats(b)} | 팔−켬 ${d >= 0 ? '+' : ''}${f2(d)} ± 폭 ${f2(w)} → **${K[g].verdict}** | 옛 효과로 뽑은 n ${need} · 잰 차로 뽑은 n ${needNow} | p95 켬 ${R.fmtRepeats(a95)} · 팔 ${R.fmtRepeats(b95)} | A* 켬 ${R.fmtRepeats(aA, 3)} · 팔 ${R.fmtRepeats(bA, 3)} · Δ ${f2(dA, 3)} ± ${f2(wA, 3)} → ${K[g].verdictA} |`);
    }
  }
  // ── ③ T427 제 설정(틀 t316 · 몸 상한 40) — 짝 바퀴 ──
  let RE = null;
  if (groups['r-off'] && groups['r-on']) {
    const byR = (arr) => Object.fromEntries(arr.map((r) => [r.round, r]));
    const A = byR(groups['r-off']), B = byR(groups['r-on']); const ks = Object.keys(B).filter((k) => A[k]);
    const one = (f) => { const d = ks.map((k) => f(B[k]) - f(A[k])); const sd = R.sd(d), m = R.median(d), w = sd != null ? R.RULE_REPEATS.widthPaired(sd, d.length) : null;
      return { off: R.summarize(ks.map((k) => f(A[k]))), on: R.summarize(ks.map((k) => f(B[k]))), d: m, lo: Math.min(...d), hi: Math.max(...d), sd, w, verdict: w != null ? R.RULE_REPEATS.verdict(m, w) : '—', rel: d.map((x, i) => x / f(A[ks[i]])) }; };
    RE = { n: ks.length, path: one((r) => r.pathMsTick), p50: one((r) => r.p50), p95: one((r) => r.p95) };
    RE.path.relMed = R.median(RE.path.rel);
    console.log(`\n## ③ T427 제 설정(t316 · 상한 40) 짝 ${ks.length}바퀴`);
    for (const k of ['path', 'p50', 'p95']) { const q = RE[k]; console.log(`| ${k} | 끔 ${R.fmtRepeats(q.off, 3)} · 켬 ${R.fmtRepeats(q.on, 3)} | 켬−끔 ${f2(q.d, 3)} [${f2(q.lo, 3)}–${f2(q.hi, 3)}] ± 폭 ${f2(q.w, 3)} → **${q.verdict}** | 비 ${(100 * R.median(q.rel)).toFixed(1)}% |`); }
  }
  // ── ③ T410 사람당(t410 load · awake · 관측자 0 · 틀 T368 b · T421 끔 = T432 ⓐ 칸) ──
  const T4 = fs.readdirSync(DIR).filter((f) => /^t410-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  let TT = null;
  if (T4.length) {
    const per = T4.map((j) => { const sl = (j.arms.awake || {}).slices || []; const day = sl.filter((x) => !x.night); return { us: R.median(day.map((x) => x.usPer)), p50: R.median(day.map((x) => x.p50)), bodies: R.median(day.map((x) => x.bodies)), cpu: R.median(day.map((x) => x.cpu)), nS: day.length }; });
    TT = { us: R.summarize(per.map((x) => x.us)), p50: R.summarize(per.map((x) => x.p50)), per };
    console.log(`\n## ③ T410 사람당(낮 · 마을 명부) ${R.fmtRepeats(TT.us, 3)} µs · p50 ${R.fmtRepeats(TT.p50, 3)} ms · 몸 ${per.map((x) => x.bodies).join('/')} · CPU ${per.map((x) => x.cpu).join('/')}%`);
  }
  fs.writeFileSync(path.join(DIR, 'table.json'), JSON.stringify({ runs, groups: G, knobs: K, sPool, sPool95, sPoolA, reach: RE, t410: TT }, null, 1));
  return { runs, G };
}

(async () => {
  const [mode, plan] = process.argv.slice(2);
  if (mode === 'table') { table(); return; }
  // `segs <가.json> <나.json> …` — t371 판 둘 이상의 갈래를 틱당 ms 로 나란히(첫 판 대비 비) · 흔들림이 **세계**인가 **호스트**인가:
  //   세계면 걸음·A* 같은 갈래만 오르고 세계와 무관한 토막(aoi·worldDay·econDay·chunks)은 그대로다 · 호스트면 **전부 같이** 오른다.
  if (mode === 'segs') {
    const files = process.argv.slice(3);
    const segs = ['tot', 'loopDec', 'loopMov', 'aoi', 'spatial', 'sweep', 'wildlife', 'mobs', 'chunks', 'econDay', 'worldDay', 'head', 'idleScan', 'inputTO'];
    const rows = files.map((f) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); const o = { n: 0, steps: 0 }; for (const sl of j.run.slices) { const r = sl.rest && sl.rest[0]; if (!r) continue; o.n += r.n; for (const k of segs) o[k] = (o[k] || 0) + (r[k] || 0); o.path = (o.path || 0) + ((r.x && r.x.pathT) || 0); o.steps += sl.walk ? sl.walk.steps : 0; }
      const v = { f: path.basename(f), p50: R.median(j.run.slices.map((x) => x.p50)), ns: R.median(j.run.slices.map((x) => x.nonSleep)), stepsT: o.steps / o.n, path: o.path / o.n }; for (const k of segs) v[k] = o[k] / o.n; return v; });
    const keys = ['p50', ...segs, 'path', 'stepsT', 'ns'];
    console.log('| 판 | ' + keys.join(' | ') + ' |'); console.log('|---|' + keys.map(() => '---:').join('|') + '|');
    for (const v of rows) console.log(`| ${v.f} | ` + keys.map((k) => { const r = v[k] / rows[0][k]; return `${(+v[k]).toFixed(3)}${v === rows[0] ? '' : ` (${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(0)}%)`}`; }).join(' | ') + ' |');
    return;
  }
  if (mode === 'run') {
    const { WORLD } = require(path.join(ROOT, 'server', 'zone-config.js'));
    if (WORLD.dayLengthMs !== DAY) throw new Error('하루 길이가 다르다: ' + WORLD.dayLengthMs);
    let list;
    if (PLANS[plan]) list = PLANS[plan];
    else if (/^knobs/.test(plan)) { const [, n, c, from, only] = plan.split(':'); list = knobPlan(+n || 3, c || 'fixed', +from || 1, only); }
    else if (/^reach/.test(plan)) { const [, n, c] = plan.split(':'); list = reachPlan(+n || 3, c || 'fixed'); }
    else throw new Error('plan?');
    for (const p of list) runOne(p);
    fs.writeFileSync(path.join(DIR, `done-${plan.replace(/[^a-z0-9]/gi, '_')}`), new Date().toISOString());
    console.log('[t455] 계획 끝', plan);
    return;
  }
  console.log('node scripts/t455-repeats.js run own|knobs:<n>:<clock>|reach:<n>:<clock> · table');
})();
