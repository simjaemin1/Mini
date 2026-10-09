#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T659 표 기계 · 판정 0 · 새 수 0)
// === scripts/t659-wood-anchor.js — 통나무 값의 닻(subs×30) ↔ 진짜 흐름(`_consEMA.wood`) · 그림자가격 궤적 · 켬/끔 표 ==========
//   닻 = v2 `SUBSISTENCE_PER_NPC.wood × n × 30`(정본 표에서 읽는다) · 흐름 = `_consEMA.wood × 30`(v2 flowT 그 식) · 비 = 흐름 ÷ 닻.
//   값의 기준 = v2 `BASE_VALUE_V2.wood`(희소도 1 = 닻에 곳간이 딱 맞는 값) — 그림자가격 ÷ 이것 = 희소도.
//   통나무 0 마을 = 곳간 < 1(T581 `wood0` 칸 · T652 표 그 문).
//
//   쓰는 법:
//     node scripts/t659-wood-anchor.js reh <끔 dir> <켬 dir> [표지=s1020_off]   # T652 자(t581 리허설 · `wood_<표지>_<존>.jsonl`) — 한반도 · 닛폰
//     node scripts/t659-wood-anchor.js srv <dir> [끔 표지=off] [켬 표지=on] [시드=1020,7,42]   # T650 결정론 자(t577 + `t659-wood-probe.js` · `<표지>-<시드>.json[.t659.json]`)
//     node scripts/t659-wood-anchor.js lab <dir> [시드=1020,7,42]               # 두 자(t17 · t176) — `<팔>_<자>_<시드>.json` (팔 = main · off · on)
//   T252 자(짝 Δ% · 부호 3/3 AND |평균| > 폭 → 가름 · 부호 3/3 → 방향만 · 나머지 못 가름 — t416-guard-table 그 식).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const _log = console.log; console.log = () => {};
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
console.log = _log;
const SUBS = V2.SUBSISTENCE_PER_NPC.wood;   // 0.05/인/일 — 닻의 원천
const FLOW_WIN = 30;                         // v2 flowT = EMA × 30 · subs × 30 — 같은 창
let BASE = null;
{ const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'); const m = /BASE_VALUE_V2\s*=\s*\{[\s\S]*?\bwood:\s*([\d.]+)/.exec(src); BASE = m ? +m[1] : null; }
const [MODE, ...A] = process.argv.slice(2);
const q = (a, p) => { const b = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; };
const med = (a) => q(a, 0.5);
const f2 = (x, d = 2) => (x == null ? '—' : (+x).toFixed(d));
const n0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const T252 = (base, arm) => {
  const d = base.map((b, i) => (b ? (arm[i] - b) / b * 100 : 0));
  const m = d.reduce((x, y) => x + y, 0) / d.length, w = Math.max(...d) - Math.min(...d);
  const sg = d.every((x) => x > 0) || d.every((x) => x < 0);
  return { d: d.map((x) => +x.toFixed(2)), mean: +m.toFixed(2), width: +w.toFixed(2), verdict: sg && Math.abs(m) > w ? '가름' : (sg ? '방향만' : '못 가름') };
};
const WIN = [[0, 30], [31, 100], [101, 400]];

// 마을-날 행 [{v, day, n, wood, ema, pw}] → 계수
function anchorStats(rows) {
  const out = {};
  const ok = rows.filter((r) => r.n > 0);
  const ratio = (r) => (r.ema * FLOW_WIN) / (SUBS * r.n * FLOW_WIN);
  const rawR = (r) => r.cons / (SUBS * r.n);   // 그날 소비 원값 ÷ 그날 닻 몫(0.05·n) — EMA 덥힘 없이
  for (const [a, b] of WIN) {
    const R = ok.filter((r) => r.day >= a && r.day <= b);
    const warm = R.filter((r) => r.ema > 0);
    const RC = R.filter((r) => r.cons != null);
    out[`d${a}_${b}`] = { rows: R.length, emaPos: warm.length, ratioMed: med(warm.map(ratio)), ratioP10: q(warm.map(ratio), 0.1), ratioP90: q(warm.map(ratio), 0.9),
      rawMed: RC.length ? med(RC.map(rawR)) : null, rawMean: RC.length ? RC.reduce((x, r) => x + r.cons, 0) / RC.reduce((x, r) => x + SUBS * r.n, 0) : null,
      sMed: med(R.filter((r) => r.pw != null).map((r) => r.pw / BASE)), above: R.filter((r) => r.pw != null).length ? R.filter((r) => r.pw != null && r.pw > BASE).length / R.filter((r) => r.pw != null).length : null,
      flowMed: med(warm.map((r) => r.ema)), anchorMed: med(R.map((r) => SUBS * r.n)) };
  }
  // 마을마다 중앙 비(31일 뒤 · EMA 덥혀진 뒤) — 마을 분포
  const byV = new Map(); for (const r of ok) if (r.day > 30 && r.ema > 0) { const a = byV.get(r.v) || []; a.push(ratio(r)); byV.set(r.v, a); }
  const vMed = [...byV.values()].map(med);
  out.villages = { n: vMed.length, p10: q(vMed, 0.1), med: med(vMed), p90: q(vMed, 0.9), below1: vMed.filter((x) => x < 1).length };
  return out;
}
function wood0At(byDay, D) { const d = byDay.find((x) => x.day >= D); if (!d) return null; return { day: d.day, wood0: d.rows.filter((r) => r.wood < 1).length, vils: d.rows.length, pop: d.rows.reduce((a, r) => a + r.n, 0) }; }
function traceOf(rows, name, every = 10, to = 60) { return rows.filter((r) => r.v === name && r.day <= to && (r.day % every === 0)).map((r) => [r.day, r.n, f2(r.wood, 1), f2(r.ema, 2), f2(SUBS * r.n, 2), r.pw == null ? '—' : f2(r.pw, 2)]); }

// ── T652 자(리허설) ─────────────────────────────────────────────────────────
function loadReh(dir, tag, zone) {
  const f = path.join(dir, `wood_${tag}_${zone}.jsonl`);
  if (!fs.existsSync(f)) return null;
  const days = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.day - b.day);
  const csum = (c) => (c && typeof c === 'object' ? Object.values(c).reduce((a, x) => a + (+x || 0), 0) : null);   // T644 `_t644Day`(쓴 자리별 그날 합)
  const byDay = days.map((d) => ({ day: d.day, rows: d.vils.map((r) => ({ v: r.v, day: d.day, n: r.n, wood: r.wood, ema: r.ema || 0, pw: r.pw, lj: r.lj || 0, cons: csum(r.cons), prod: r.prod })) }));
  // 수출 — 존 로그 캐러밴 출발 줄(T652 표 기계 그 셈 · econ 출발 날)
  const exp = [];
  try { const re = /캐러밴#\S+ 출발(?:\(경계 너머\))?: (\S+)→(\S+) wood×(\d+).*econ d(\d+)/;
    for (const l of fs.readFileSync(path.join(dir, `z_${tag}_${zone}.log`), 'utf8').split('\n')) { const m = re.exec(l); if (m) exp.push([+m[4], +m[3]]); } } catch (e) {}
  return { byDay, rows: byDay.flatMap((d) => d.rows), exp };
}
function reh(offDir, onDir, tag) {
  const out = { mode: 'reh', tag, BASE, SUBS, zones: {} };
  for (const z of ['hanbando', 'nippon']) {
    const Z = {};
    for (const [arm, dir] of [['off', offDir], ['on', onDir]]) {
      const L = dir ? loadReh(dir, tag, z) : null; if (!L) continue;
      const sumR = (key, a, b) => L.rows.filter((r) => r.day >= a && r.day <= b).reduce((x, r) => x + (r[key] || 0), 0);
      Z[arm] = { stats: anchorStats(L.rows), wood0: [30, 100, 200, 400].map((D) => wood0At(L.byDay, D)).filter(Boolean), days: L.byDay.length,
        flows: { seeded: L.byDay[0] ? L.byDay[0].rows.reduce((x, r) => x + (r.wood || 0), 0) : null, prod30: sumR('prod', 0, 30), cons30: sumR('cons', 0, 30),
          exp30: L.exp.filter(([d]) => d <= 30).reduce((x, [, q2]) => x + q2, 0), exp: L.exp.reduce((x, [, q2]) => x + q2, 0), cons: sumR('cons', 0, 1e9), prod: sumR('prod', 0, 1e9) },
        zeroDayMed: med([...new Set(L.rows.map((r) => r.v))].map((v) => { const r = L.rows.find((x) => x.v === v && x.wood < 1); return r ? r.day : null; })),
        lj: [30, 100, 400].map((D) => { const d = L.byDay.find((x) => x.day >= D); return d ? d.rows.reduce((a, r) => a + r.lj, 0) : null; }) };
      // 마을별 표(날 30 · 100 · 200 · 400) — 닻 = subs × n(하루 몫) · 소비 = EMA · 비 = EMA ÷ 닻 · 희소도 = 값 ÷ 기준
      Z[arm].perVillage = [30, 100, 200, 400].map((D) => { const d = L.byDay.find((x) => x.day >= D); return d ? { day: d.day, rows: d.rows.map((r) => ({ v: r.v, n: r.n, anchor: +(SUBS * r.n).toFixed(3), ema: r.ema, ratio: r.n > 0 ? +(r.ema / (SUBS * r.n)).toFixed(2) : null, wood: r.wood, s: r.pw != null ? +(r.pw / BASE).toFixed(3) : null, lj: r.lj })) } : null; }).filter(Boolean);
      if (arm === 'off') Z.traces = { 농촌3: traceOf(L.rows, '농촌3'), 어촌1: traceOf(L.rows, '어촌1') };
      if (arm === 'on') Z.tracesOn = { 농촌3: traceOf(L.rows, '농촌3'), 어촌1: traceOf(L.rows, '어촌1') };
    }
    out.zones[z] = Z;
    console.log(`\n[T652 자 · ${z}] 닻(subs ${SUBS}/인/일 × 30) · 흐름(EMA × 30) · 비 = 흐름 ÷ 닻 · 희소도 = 그림자가격 ÷ ${BASE}`);
    for (const arm of ['off', 'on']) {
      const X = Z[arm]; if (!X) continue;
      console.log(`  ${arm === 'off' ? '끔' : '켬'}(${X.days}날): ` + WIN.map(([a, b]) => { const s = X.stats[`d${a}_${b}`]; return `d${a}~${b} 비 중앙 ${f2(s.ratioMed)}(p10 ${f2(s.ratioP10)} · p90 ${f2(s.ratioP90)}) · 소비 중앙 ${f2(s.flowMed)}/일 vs 닻 ${f2(s.anchorMed)}/일 · 희소도 중앙 ${f2(s.sMed)} · 닻 위 ${s.above == null ? '—' : (s.above * 100).toFixed(0) + '%'}`; }).join('\n           '));
      console.log(`           마을 중앙 비(31일 뒤) p10 ${f2(X.stats.villages.p10)} · 중앙 ${f2(X.stats.villages.med)} · p90 ${f2(X.stats.villages.p90)} · 비 < 1 마을 ${X.stats.villages.below1}/${X.stats.villages.n} · 곳간 0 중앙 날 ${X.zeroDayMed}`);
      console.log(`           통나무 0 마을 ` + X.wood0.map((w) => `d${w.day} ${w.wood0}/${w.vils}`).join(' · ') + ` · 인구 ` + X.wood0.map((w) => w.pop).join(' / ') + ` · 나무꾼 d30/100/400 ${X.lj.join(' / ')}`);
      const F = X.flows; console.log(`           시딩 ${n0(F.seeded)} · 첫 30일 생산 ${n0(F.prod30)} · 소비 ${n0(F.cons30)} · 수출 ${n0(F.exp30)}(${F.seeded ? (F.exp30 / F.seeded * 100).toFixed(0) : '—'}%) · 판 전체 생산 ${n0(F.prod)} · 소비 ${n0(F.cons)} · 수출 ${n0(F.exp)}`);
      console.log(`           그날 소비 ÷ 닻 몫 — ` + WIN.map(([a, b]) => { const s2 = X.stats[`d${a}_${b}`]; return `d${a}~${b} 중앙 ${f2(s2.rawMed)}(합 비 ${f2(s2.rawMean)})`; }).join(' · '));
    }
  }
  return out;
}

// ── T650 결정론 자(서버 판) ─────────────────────────────────────────────────
function loadSrv(dir, tag, seed) {
  const fJ = path.join(dir, `${tag}-${seed}.json`), fP = fJ + '.t659.json';
  const J = fs.existsSync(fJ) ? JSON.parse(fs.readFileSync(fJ, 'utf8')) : null;
  const P = fs.existsSync(fP) ? JSON.parse(fs.readFileSync(fP, 'utf8')) : null;
  let byDay = null, rows = null, fam = 0, pf = [];
  if (P) {
    const g = (k, key, i) => (P.v[k][key] ? P.v[k][key][i] : null);
    byDay = P.days.map((d, i) => ({ day: d, rows: P.names.map((nm, k) => ({ v: nm, day: d, n: P.v[k].n[i], wood: P.v[k].wood[i], ema: P.v[k].ema[i] || 0, pw: P.v[k].pw[i], pf: P.v[k].pf[i], fam: P.v[k].fam[i],
      cons: g(k, 'cons', i), prod: g(k, 'prod', i), lj: g(k, 'lj', i), tin: g(k, 'tin', i), tout: g(k, 'tout', i) })) }));
    rows = byDay.flatMap((d) => d.rows);
    fam = rows.reduce((a, r) => a + (r.fam || 0), 0);
    pf = rows.filter((r) => r.n > 0 && r.pf != null).map((r) => r.pf);
  }
  return { J, P, byDay, rows, fam, pfMed: med(pf) };
}
function srv(dir, tOffCsv = 'off', tOnCsv = 'on', seedsCsv = '1020,7,42') {
  const SEEDS = seedsCsv.split(',').map(Number);
  const OFFS = tOffCsv.split(','), ONS = tOnCsv.split(',');   // 같은 팔 되풀이 판(판 사이 흔들림을 잰다)
  const out = { mode: 'srv', dir, BASE, SUBS, seeds: SEEDS, offTags: OFFS, onTags: ONS, arms: {}, delta: {}, spread: {}, det: {} };
  const cols = [['인구', (o) => o.J && o.J.eight.pop], ['무기Q', (o) => o.J && o.J.eight.weapQ], ['확장셀', (o) => o.J && o.J.eight.expand], ['게시', (o) => o.J && o.J.eight.board],
    ['도구Q', (o) => o.J && o.J.eight.toolQ], ['보존식', (o) => o.J && o.J.eight.preserve], ['생곡', (o) => o.J && o.J.eight.grain],
    ['기근 마을·날', (o) => o.fam], ['통나무 0 마을·날', (o) => o.rows && o.rows.filter((r) => r.wood < 1).length]];
  for (const tag of [...OFFS, ...ONS]) {
    out.arms[tag] = SEEDS.map((s) => {
      const o = loadSrv(dir, tag, s);
      const st = o.rows ? anchorStats(o.rows) : null;
      const w0 = o.byDay ? [30, 100, 200, 400].map((D) => wood0At(o.byDay, D)).filter(Boolean) : [];
      const sum = (key, a, b) => (o.rows ? o.rows.filter((r) => r.day >= a && r.day <= b).reduce((x, r) => x + (r[key] || 0), 0) : null);
      const flows = o.rows ? { prod30: sum('prod', 0, 30), cons30: sum('cons', 0, 30), out30: sum('tout', 0, 30), prod: sum('prod', 0, 1e9), cons: sum('cons', 0, 1e9), out: sum('tout', 0, 1e9), inn: sum('tin', 0, 1e9),
        seeded: o.byDay && o.byDay[0] ? o.byDay[0].rows.reduce((x, r) => x + (r.wood || 0), 0) : null,
        lj: [30, 100, 400].map((D) => { const d = o.byDay.find((x) => x.day >= D); return d ? d.rows.reduce((x, r) => x + (r.lj || 0), 0) : null; }) } : null;
      return { seed: s, eight: o.J && o.J.eight, empty: o.J && o.J.empty, dissolved: o.J && o.J.dissolved, fam: o.fam, pfMed: o.pfMed, stats: st, wood0: w0, flows,
        cols: Object.fromEntries(cols.map(([k, f]) => [k, f(o)])), probeKnob: o.P ? o.P.T659_WOOD_FLOW : null };
    });
  }
  console.log(`\n[T650 자(VILLAGE_CARAVAN_MAX=0) · 400일 · 시드 ${SEEDS.join('·')}] 끔(${OFFS.join('·')}) ↔ 켬(${ONS.join('·')})`);
  // 결정론 — 같은 팔 되풀이 판의 날 행(rows) 첫 갈림
  for (const [arm, T] of [['끔', OFFS], ['켬', ONS]]) if (T.length > 1) for (const s0 of SEEDS) {
    const J = T.map((t) => { const f = path.join(dir, `${t}-${s0}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; });
    if (J.some((x) => !x)) continue;
    let first = null; for (let i = 0; i < J[0].rows.length && first == null; i++) for (let k = 1; k < J.length; k++) if (JSON.stringify(J[0].rows[i]) !== JSON.stringify(J[k].rows[i])) { first = J[0].rows[i][0]; break; }
    out.det[`${arm}:${s0}`] = first;
    console.log(`  결정론 ${arm} 시드 ${s0}: ${T.join(' ↔ ')} 날 행 ${first == null ? '400일 같음' : '첫 갈림 날 ' + first}`);
  }
  console.log('| 팔 | 시드 | 인구 | 소멸 | 빈 마을 | 게시 | 무기Q | 확장셀 | 도구Q | 보존식 | 생곡 | 기근 마을·날 | 통나무 0 마을 d30/100/200/400 | 비 중앙 d31~100 · d101~400 | 희소도 중앙 d0~30 · d31~100 · d101~400 | 식량값 중앙 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const tag of [...OFFS, ...ONS]) for (const r of out.arms[tag]) {
    const e = r.eight || {}, s = r.stats || {};
    const g = (k, key) => (s[k] ? s[k][key] : null);
    console.log(`| ${tag} | ${r.seed} | ${n0(e.pop)} | ${e.dead}/${e.ever} | ${r.empty} | ${n0(e.board)} | ${n0(e.weapQ)} | ${n0(e.expand)} | ${e.toolQ} | ${e.preserve} | ${e.grain} | ${n0(r.fam)} | ${r.wood0.map((w) => w.wood0).join(' / ')} (${r.wood0.length ? r.wood0[0].vils : '—'}곳) | ${f2(g('d31_100', 'ratioMed'))} · ${f2(g('d101_400', 'ratioMed'))} | ${f2(g('d0_30', 'sMed'))} · ${f2(g('d31_100', 'sMed'))} · ${f2(g('d101_400', 'sMed'))} | ${f2(r.pfMed)} |`);
  }
  console.log('\n| 팔 | 시드 | 시딩 통나무 | 첫 30일 생산 · 소비 · 수출 | 400일 생산 · 소비 · 나감 · 들어옴 | 나무꾼 d30/100/400 | 그날 소비 ÷ 닻 몫 — 중앙(평균) d0~30 · d31~100 · d101~400 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const tag of [...OFFS, ...ONS]) for (const r of out.arms[tag]) { const F = r.flows, s = r.stats || {}; if (!F) continue;
    const rr = (k) => (s[k] ? `${f2(s[k].rawMed)}(${f2(s[k].rawMean)})` : '—');
    console.log(`| ${tag} | ${r.seed} | ${n0(F.seeded)} | ${n0(F.prod30)} · ${n0(F.cons30)} · ${n0(F.out30)} | ${n0(F.prod)} · ${n0(F.cons)} · ${n0(F.out)} · ${n0(F.inn)} | ${F.lj.join(' / ')} | ${rr('d0_30')} · ${rr('d31_100')} · ${rr('d101_400')} |`); }
  const meanOf = (T, k) => SEEDS.map((_, i) => { const xs = T.map((t) => out.arms[t][i].cols[k]); return xs.some((x) => x == null) ? null : xs.reduce((a, x) => a + x, 0) / xs.length; });
  for (const [k] of cols) {
    const b = meanOf(OFFS, k), a = meanOf(ONS, k);
    if (b.some((x) => x == null) || a.some((x) => x == null)) continue;
    out.delta[k] = T252(b, a);
    // 판 사이 흔들림 — 같은 팔 되풀이의 (최대 − 최소) ÷ 평균(시드마다 · %)
    const sp = (T) => SEEDS.map((_, i) => { const xs = T.map((t) => out.arms[t][i].cols[k]); const m = xs.reduce((x, y) => x + y, 0) / xs.length; return m ? +((Math.max(...xs) - Math.min(...xs)) / m * 100).toFixed(1) : 0; });
    out.spread[k] = { off: sp(OFFS), on: sp(ONS) };
  }
  console.log(`\n짝 Δ% (켬 − 끔)/끔 · 되풀이 평균끼리 · T252 자 · [판 사이 흔들림 % 끔 | 켬]:`);
  for (const [k, d] of Object.entries(out.delta)) console.log(`  ${k}: ${d.d.join(' / ')}% · 평균 ${d.mean} · 폭 ${d.width} → ${d.verdict}   [${out.spread[k].off.join('/')} | ${out.spread[k].on.join('/')}]`);
  return out;
}

// ── 두 자(t17 · t176) ─────────────────────────────────────────────────────
function lab(dir, seedsCsv = '1020,7,42') {
  const SEEDS = seedsCsv.split(',').map(Number);
  const out = { mode: 'lab', dir, seeds: SEEDS, cmp: {}, rows: [], delta: {} };
  const P = (arm, ruler, s) => path.join(dir, `${arm}_${ruler}_${s}.json`);
  const J = (arm, ruler, s) => { const f = P(arm, ruler, s); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
  for (const ruler of ['t17', 't176']) {
    out.cmp[ruler] = SEEDS.map((s) => { const a = P('main', ruler, s), b = P('off', ruler, s); if (!fs.existsSync(a) || !fs.existsSync(b)) return null; return fs.readFileSync(a).equals(fs.readFileSync(b)); });
  }
  const pick = (j, ruler) => {
    if (!j) return null;
    if (ruler === 't17') return { 인구: j.base.pop, 소멸: `${j.base.dead}/${j.base.ever}`, 무기Q: j.base.weapQ, 확장셀: j.base.expand, 게시: j.board.reqOpened, 도구Q: j.tool && j.tool.q, 보존식: j.preserve && j.preserve.stock, 생곡: j.eight.grain, '㉮': j.eight.densAll, '㉯': j.eight.densValue, '부족 wood': (j.short || {}).wood || 0, '부족 합': Object.values(j.short || {}).reduce((a, x) => a + x, 0) };
    // t176(평평한 꼴): 여덟 수 + 통나무 장부(생산 · 소비 · 땔감 · 집 · 수입 · 모자란 날 = 곳간 < HOUSE_WOOD 인 마을·날 · 값 평균) · 기근 마을·날
    return { 인구: j.pop, 소멸: `${j.dead}/${j.ever}`, 무기Q: j.weapQ, 확장셀: j.expand, 게시: j.reqOpened, 도구Q: j.toolQ, 보존식: j.preserved, 생곡: j.rawGrain, '㉮': j.densAll, '㉯': j.densVal,
      '통나무 모자란 마을·날': j.woodZeroDaysTot, '통나무값 평균': j.priceWoodMean, '통나무 생산': j.woodProdTot, '통나무 소비': j.woodConsTot, '땔감': j.woodFuelTot, '집 목재': j.woodBuiltTot, '통나무 수입': j.woodImportedTot, '기근 마을·날': j.famineDaysTot };
  };
  for (const ruler of ['t17', 't176']) for (const arm of ['main', 'off', 'on']) for (const s of SEEDS) { const r = pick(J(arm, ruler, s), ruler); if (r) out.rows.push(Object.assign({ ruler, arm, seed: s }, r)); }
  console.log(`\n[두 자 · 800일 · 시드 ${SEEDS.join('·')}] 끔 = main 바이트: t17 ${out.cmp.t17.map((x) => (x == null ? '—' : x ? '○' : '✗')).join('')} · t176 ${out.cmp.t176.map((x) => (x == null ? '—' : x ? '○' : '✗')).join('')}`);
  const keys = ['인구', '소멸', '무기Q', '확장셀', '게시', '도구Q', '보존식', '생곡', '㉮', '㉯', '부족 wood', '부족 합', '통나무 모자란 마을·날', '통나무값 평균', '통나무 생산', '통나무 소비', '땔감', '집 목재', '통나무 수입', '기근 마을·날'];
  console.log('| 자 | 팔 | 시드 | ' + keys.join(' | ') + ' |'); console.log('|' + '---|'.repeat(keys.length + 3));
  for (const r of out.rows) console.log(`| ${r.ruler} | ${r.arm} | ${r.seed} | ` + keys.map((k) => (r[k] == null ? '—' : typeof r[k] === 'number' ? (Number.isInteger(r[k]) ? n0(r[k]) : f2(r[k])) : r[k])).join(' | ') + ' |');
  for (const ruler of ['t17', 't176']) {
    const base = SEEDS.map((s) => pick(J('off', ruler, s), ruler)), arm = SEEDS.map((s) => pick(J('on', ruler, s), ruler));
    if (base.some((x) => !x) || arm.some((x) => !x)) continue;
    out.delta[ruler] = {};
    for (const k of keys) { if (typeof base[0][k] !== 'number') continue; out.delta[ruler][k] = T252(base.map((x) => x[k]), arm.map((x) => x[k])); }
    console.log(`\n${ruler} 짝 Δ% (켬 − 끔)/끔 · T252 자:`);
    for (const [k, d] of Object.entries(out.delta[ruler])) console.log(`  ${k}: ${d.d.join(' / ')}% · 평균 ${d.mean} · 폭 ${d.width} → ${d.verdict}`);
  }
  return out;
}

let res = null;
if (MODE === 'reh') res = reh(A[0], A[1], A[2] || 's1020_off');
else if (MODE === 'srv') res = srv(A[0], A[1], A[2], A[3]);
else if (MODE === 'lab') res = lab(A[0], A[1]);
else { console.error('쓰는 법: reh <끔 dir> <켬 dir> [표지] · srv <dir> [끔] [켬] [시드] · lab <dir> [시드]'); process.exit(2); }
const OUTF = process.env.T659_JSON;
if (OUTF) { fs.writeFileSync(OUTF, JSON.stringify(res, null, 1)); console.log('\n→', OUTF); }
