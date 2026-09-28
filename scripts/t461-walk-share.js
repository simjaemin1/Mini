#!/usr/bin/env node
// === scripts/t461-walk-share.js — 걸음 문(`movePlayerStep` · NPC)의 **비중**을 규약 ⓖ(n판)로 (T461 ①) ============
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 무접촉 — 판 하나는 `scripts/t356-tick-anatomy.js`(ARMS=probe) 한 번이다
//   (탐침은 그 자가 사본에만 박는다 · 걸음 문 = 탐침 `step` = `movePlayerStep(p)` NPC 한 번 · T352 가 잰 그 문).
//   판은 **차례로만**(동시 0) · 두 설정을 한 바퀴 안에 번갈아(짝 바퀴 — T455 ⓖ: 몇 시간에 걸친 호스트 흐름을 나눠 가진다).
//   원점은 **고정**(`scripts/t455-clock.js` 적재 순간 덧붙임 — 판마다 같은 게임 시각 · T455 ① 에서 폭이 가장 준 자).
//
// 설정 둘(카드): `c1329` = 틀 T368 b(`/tmp/t368/tpl-t100.db` · 몸 상한 기본) · `inf` = 무제한 틀(T376 · `tpl-inf` · 상한 999999)
//   ★둘 다 T356 자 그대로 — 관측자 1 · `T312_FISH_ACT=1` · 낮 창 · 첫 하루 경계 뒤(ⓐ).
//
// 실행: node scripts/t461-walk-share.js run <n> [설정,…]   · node scripts/t461-walk-share.js table
//   T461_DIR=/tmp/t461 · T461_LEAD_S=200 · T461_ENV_<설정>='K=V,…'(팔 env 더하기 — 예: 켬 팔 `T461_WALK_WASM=1`)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const R = require('./lib-tick-rule');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.T461_DIR || '/tmp/t461';
const DAY = 1440000;
const LEAD_S = parseInt(process.env.T461_LEAD_S || '200', 10);
fs.mkdirSync(DIR, { recursive: true });
const CONF = {
  c1329: { tpl: '/tmp/t368/tpl-t100.db', env: {} },
  inf: { tpl: '/tmp/t444/tpl-inf.db', env: { VILLAGE_NPC_CAP: '999999' } },
};
const clockAt = (tpl) => (Math.floor(fs.statSync(tpl).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;
const extra = (c) => { const o = {}; for (const kv of String(process.env['T461_ENV_' + c] || '').split(',').filter(Boolean)) { const i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1); } return o; };

function runOne(conf, i, tag) {
  const out = path.join(DIR, `${tag}-${i}.json`);
  if (fs.existsSync(out)) { console.log('[t461] 있음', tag, i); return; }
  const C = CONF[conf];
  const E = Object.assign({}, process.env, C.env, extra(tag), {
    ARMS: 'probe', WINDOW: 'day', WAITDAY: '1', TPL: C.tpl,
    NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(clockAt(C.tpl)) });
  const t0 = Date.now();
  console.log('[t461] 판', tag, i, '· 틀', path.basename(C.tpl), '· 원점', new Date(+E.T455_CLOCK_AT).toISOString());
  const r = spawnSync(process.execPath, [path.join(__dirname, 't356-tick-anatomy.js'), out + '.tmp'], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  fs.writeFileSync(path.join(DIR, `${tag}-${i}.log`), String(r.stdout || '') + String(r.stderr || ''));
  if (r.status === 0 && fs.existsSync(out + '.tmp')) {
    const j = JSON.parse(fs.readFileSync(out + '.tmp', 'utf8')); j.t461 = { conf, tag, i, wallMs: Date.now() - t0, env: extra(tag) };
    fs.writeFileSync(out, JSON.stringify(j)); fs.unlinkSync(out + '.tmp');
    console.log('[t461] 끝', tag, i, Math.round((Date.now() - t0) / 1000), 's');
  } else console.log('[t461] 실패', tag, i, r.status);
  spawnSync('sleep', ['15']);
}

function runValues(j) {
  const a = j.arms[0]; const S = a.slices;
  const s = { n: 0, tot: 0, step: 0, stepN: 0, loopDec: 0, loopMov: 0, aoi: 0, dec: 0, astar: 0, life: 0, npcStepT: 0, popN: 0 };
  for (const sl of S) for (const x of sl.ana) { for (const k of Object.keys(s)) if (k !== 'popN' && x[k] != null) s[k] += x[k]; s.popN += x.pop * x.n; }
  const pop = s.popN / s.n;                               // 분모 = npcs.size(ⓔ)
  const us = (ms) => ms / s.n * 1000 / pop;               // ms 합 → 틱당 사람당 µs
  const rest = s.tot - s.loopDec - s.loopMov - s.aoi;      // T356 의 "그 밖"
  return { tag: j.t461.tag, conf: j.t461.conf, i: j.t461.i, pop: Math.round(pop), ticks: s.n,
    p50: R.median(S.map((x) => x.p50)), p95: R.median(S.map((x) => x.p95)),
    stepUs: us(s.step), stepCallUs: s.step / s.stepN * 1000, stepPerTick: s.stepN / s.n,
    totUs: us(s.tot), share: s.step / s.tot, shareMov: s.step / s.loopMov,
    decUs: us(s.dec), astarUs: us(s.astar), lifeUs: us(s.life), movUs: us(s.loopMov), restUs: us(rest), aoiUs: us(s.aoi),
    stepMsTick: s.step / s.n, totMsTick: s.tot / s.n };
}
function table() {
  const runs = fs.readdirSync(DIR).filter((f) => /\.json$/.test(f) && f !== 'table.json').map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).filter((j) => j.t461).map(runValues);
  const G = {}; for (const r of runs) (G[r.tag] = G[r.tag] || []).push(r);
  const f = (x, d = 3) => (x == null ? '—' : (+x).toFixed(d));
  console.log('| 판 | 몸 | p50 | 걸음 µs/사람 | 걸음 한 번 µs | 걸음/틱 | 전체 µs/사람 | **비중** | 이동 문 안 몫 | 결정 | A* | 생활 | 그 밖 | aoi |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of runs.sort((a, b) => a.tag.localeCompare(b.tag) || a.i - b.i)) console.log(`| ${r.tag}-${r.i} | ${r.pop} | ${f(r.p50, 2)} | ${f(r.stepUs)} | ${f(r.stepCallUs)} | ${f(r.stepPerTick, 0)} | ${f(r.totUs)} | ${(100 * r.share).toFixed(1)}% | ${(100 * r.shareMov).toFixed(1)}% | ${f(r.decUs)} | ${f(r.astarUs)} | ${f(r.lifeUs)} | ${f(r.restUs)} | ${f(r.aoiUs)} |`);
  const out = {};
  for (const [g, rs] of Object.entries(G)) {
    const S = (k) => R.summarize(rs.map((r) => r[k]));
    const o = { n: rs.length, stepUs: S('stepUs'), totUs: S('totUs'), share: S('share'), p50: S('p50'), p95: S('p95'), stepCallUs: S('stepCallUs'), pop: S('pop') };
    // ★판정(카드 ②): 비중이 폭보다 큰가 — 폭 = 전체 µs/사람의 판 사이 폭(규약 ⓖ · 두 팔 n판 중앙값 차의 폭)을 전체 대비 비로
    o.widthTot = o.totUs.sd != null ? R.RULE_REPEATS.width(o.totUs.sd, o.n, o.n) : null;
    o.widthRel = o.widthTot != null ? o.widthTot / o.totUs.med : null;
    out[g] = o;
    console.log(`\n**${g}** (${o.n}판 · 몸 ${R.fmtRepeats(o.pop, 0)}) — 걸음 ${R.fmtRepeats(o.stepUs)} µs/사람 · 전체 ${R.fmtRepeats(o.totUs)} µs/사람 · **비중 ${R.fmtRepeats({ ...o.share, med: 100 * o.share.med, lo: 100 * o.share.lo, hi: 100 * o.share.hi }, 1)} %** · 전체의 판 사이 sd ${f(o.totUs.sd)} → 두 팔 폭 ${f(o.widthTot)} µs(= 전체의 ${o.widthRel != null ? (100 * o.widthRel).toFixed(1) : '—'} %) · p50 ${R.fmtRepeats(o.p50, 2)} · p95 ${R.fmtRepeats(o.p95, 2)}`);
  }
  fs.writeFileSync(path.join(DIR, 'table.json'), JSON.stringify({ runs, groups: out }, null, 1));
}

// `repeats <T455_DIR>` — ③ 켬 값: `t455-repeats` 의 `k-on`/`k-ww` 짝 바퀴(t371 자 · 틱당 탐침만 · 걸음마다 시계 0 — 두 팔에 같은 자)
//   사람당 µs = Σtot ÷ Σ틱 ÷ 몸(`npcs.size` · ⓔ) · p50/p95 · GC ms/s · heap MB · 짝 차 [lo–hi] ± 폭(ⓖ `widthPaired`)
function repeats(dir) {
  const js = fs.readdirSync(dir).filter((f) => /^k-(on|ww)-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const val = (j) => { let tot = 0, n = 0, pop = 0, gc = 0, heap = []; for (const sl of j.run.slices) { const r = sl.rest && sl.rest[0]; if (!r) continue; tot += r.tot; n += r.n; pop = r.pop; if (r.own) { gc += r.own.gcMs; heap.push(r.own.heapMB); } }
    return { arm: j.t455.tag.split('-')[1], round: j.t455.round, us: tot / n * 1000 / pop, pop, p50: R.median(j.run.slices.map((x) => x.p50)), p95: R.median(j.run.slices.map((x) => x.p95)),
      under: j.run.slices.filter((x) => x.p95 < 33.3).length + '/' + j.run.slices.length, gcS: gc / (j.run.slices.length * j.SLICE_S), heap: R.median(heap), drop: j.run.slices.reduce((a, x) => a + (x.drop || 0), 0) }; };
  const V = js.map(val); const by = (a) => Object.fromEntries(V.filter((v) => v.arm === a).map((v) => [v.round, v]));
  const A = by('on'), B = by('ww'); const ks = Object.keys(B).filter((k) => A[k]).sort();
  const out = { dir, n: ks.length, pop: V[0] && V[0].pop };
  for (const k of ['us', 'p50', 'p95', 'gcS', 'heap']) {
    const d = ks.map((r) => B[r][k] - A[r][k]); const sd = R.sd(d), m = R.median(d), w = sd != null ? R.RULE_REPEATS.widthPaired(sd, d.length) : null;
    out[k] = { off: R.summarize(ks.map((r) => A[r][k])), on: R.summarize(ks.map((r) => B[r][k])), d: m, lo: Math.min(...d), hi: Math.max(...d), sd, w, verdict: w != null ? R.RULE_REPEATS.verdict(m, w) : '—', rel: m / R.median(ks.map((r) => A[r][k])) };
    const q = out[k]; console.log(`| ${k} | 끔 ${R.fmtRepeats(q.off, 3)} | 켬 ${R.fmtRepeats(q.on, 3)} | 켬−끔 ${q.d.toFixed(3)} [${q.lo.toFixed(3)}–${q.hi.toFixed(3)}] ± ${q.w != null ? q.w.toFixed(3) : '—'} → **${q.verdict}** | ${(100 * q.rel).toFixed(1)}% |`);
  }
  out.under = { off: ks.map((r) => A[r].under), on: ks.map((r) => B[r].under) }; out.drop = { off: ks.map((r) => A[r].drop), on: ks.map((r) => B[r].drop) };
  console.log(`몸 ${out.pop} · 조각 p95<33.3 끔 ${out.under.off.join(' ')} · 켬 ${out.under.on.join(' ')} · drop 끔 ${out.drop.off.join(' ')} · 켬 ${out.drop.on.join(' ')}`);
  fs.writeFileSync(path.join(dir, 'ww.json'), JSON.stringify(out, null, 1));
}
// `host <접두>` — ③ 26존 동시(`t410-zone-awake host` · 한반도 관측자 1 + 빈 25존 · 짝 바퀴 끔/켬) — 합 CPU(한 코어) · 한반도 p50 · RSS 합
function host(prefix) {
  const P = {}; for (const f of fs.readdirSync(DIR).filter((f) => f.startsWith(prefix + '-') && f.endsWith('.json'))) {
    const m = f.match(/-(off|on)-(\d+)\.json$/); if (!m) continue; const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).rounds[0];
    (P[m[2]] = P[m[2]] || {})[m[1]] = { sum: r.han.cpu + r.othersCpu, han: r.han.cpu, others: r.othersCpu, p50: r.han.p50, p95: r.han.p95, rss: (r.han.rss + r.othersRss) / 1024, steps: r.han.steps, steal: r.hostSteal }; }
  const ks = Object.keys(P).filter((k) => P[k].off && P[k].on).sort(); const out = { n: ks.length };
  for (const k of ['sum', 'han', 'others', 'p50', 'p95', 'rss']) {
    const d = ks.map((r) => P[r].on[k] - P[r].off[k]); const sd = R.sd(d), m = R.median(d), w = sd != null ? R.RULE_REPEATS.widthPaired(sd, d.length) : null;
    out[k] = { off: R.summarize(ks.map((r) => P[r].off[k])), on: R.summarize(ks.map((r) => P[r].on[k])), d: m, lo: Math.min(...d), hi: Math.max(...d), w, verdict: w != null ? R.RULE_REPEATS.verdict(m, w) : '—' };
    const q = out[k]; console.log(`| ${k} | 끔 ${R.fmtRepeats(q.off, 2)} | 켬 ${R.fmtRepeats(q.on, 2)} | 켬−끔 ${m.toFixed(2)} [${q.lo.toFixed(2)}–${q.hi.toFixed(2)}] ± ${w != null ? w.toFixed(2) : '—'} → **${q.verdict}** |`);
  }
  console.log('한반도 걸음(180초) ' + ks.map((r) => `${P[r].off.steps}/${P[r].on.steps}`).join(' · ') + ' · steal ' + ks.map((r) => `${P[r].off.steal}/${P[r].on.steal}`).join(' · '));
  fs.writeFileSync(path.join(DIR, prefix + '.json'), JSON.stringify(out, null, 1));
}
const [mode, n, confs] = process.argv.slice(2);
if (mode === 'host') host(n);
else if (mode === 'repeats') repeats(n);
else if (mode === 'table') table();
else if (mode === 'run') {
  const list = (confs || 'c1329,inf').split(',');   // `설정` 또는 `태그=설정`(켬 팔 — 태그의 T461_ENV_<태그> 를 얹는다)
  for (let i = 1; i <= (+n || 5); i++) for (const c of list) { const [tag, conf] = c.includes('=') ? c.split('=') : [c, c]; runOne(conf, i, tag); }
  fs.writeFileSync(path.join(DIR, 'done-' + (confs || 'c1329,inf').replace(/[^a-z0-9]/gi, '_')), new Date().toISOString());
} else console.log('node scripts/t461-walk-share.js run <n> [c1329,inf | on1329=c1329,…] · table');
