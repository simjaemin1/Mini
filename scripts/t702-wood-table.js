#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T702 표 기계 · 제품 무변 · 판 JSON 만 읽는다)
// === scripts/t702-wood-table.js — `t702-wood-probe` 판 JSON + `t702-forest-audit` 산출 → T702 보고 표 ==========
//   쓰는 법: node scripts/t702-wood-table.js --audit <audit.json> --trees <trees.json> --arm main=<dir>[:tag] [--arm lf0=<dir>:lf0] [--seeds 1020,7,42]
//     판 JSON = `<dir>/<tag>-<seed>.json`(T650 자) + `<dir>/<tag>-<seed>.json.t702.json`(관찰자)
//   ★표:
//     ① 땅 칸(숲 몫 · land.wood)별 — 나무꾼 몫 · 1인 1일 통나무 생산 · 소비 · 순들여옴 · 땔감 못 땜 날 · 곳간 0 날(창 1~30 · 31~100 · 101~400)
//     ② 품목별 — 마을이 보는 필요량(v2 발주 문 `target = max(subs × 30, 0.8n)` · 그 외 품목 keep 0.5 · thresh 0.8)과 실제 쓴 양(땔감 · 집 · 노 · 숯가마 · 생존 몫)
//        · 땔감 = `_cons` 합 − 노 − 숯가마 − 집(집 = 그날 지은 수용력 × `HOUSE_WOOD` · 지은 수용력 = 오늘 − 어제 × (1 − `HOUSE_DECAY`))
//        · 생존 몫 + 그 밖 = 생산 + 들여옴 − `_cons` − 내보냄 − 곳간 변화(`tickSubsistence` 0.05n 은 `_cons` 밖이다 · 활대도 밖)
//     ③ 첫 30일 통나무 화물 한 건씩 · 실어 온 것 · 판 마을의 그 뒤(곳간 0 첫날 · 땔감 못 땜 · 집 못 지음 · 인구)
//     ④ 벤 나무(서버 끝날) — 걸음 띠별 시딩 날 서 있던 그루 · 벤 날 · 자리(영토 · 다져진 길 · 그 밖) · 다시 안 남(술어)
//     ⑤ 팔끼리(main ↔ lf0 등) — 0 마을 d30/d100/d400 · 첫 30일 수출 · 인구 · 소멸 · 못 한 일(마을·날) · T252
//   상수는 소스에서 읽는다(`sim/economy-sim.js` 의 `const 이름 = 값` 줄 — 사본 0).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const args = (k) => argv.reduce((a, x, i) => (x === k && argv[i + 1] ? a.concat([argv[i + 1]]) : a), []);
const SEEDS = String(arg('--seeds', '1020,7,42')).split(',').map(Number);
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (nm) => { const m = SRC.match(new RegExp('^const ' + nm + ' = ([0-9.]+)', 'm')); if (!m) throw new Error('상수 없음 ' + nm); return +m[1]; };
const HOUSE_DECAY = K('HOUSE_DECAY'), HOUSE_WOOD = K('HOUSE_WOOD'), HOUSE_BUFFER = K('HOUSE_BUFFER'), FIREWOOD_PC = K('FIREWOOD_PC'), FUEL_COLD_W = K('FUEL_COLD_W'), SMELT_FUEL_PER = K('SMELT_FUEL_PER');
const AUD = JSON.parse(fs.readFileSync(arg('--audit'), 'utf8'));
const TREES = arg('--trees') ? JSON.parse(fs.readFileSync(arg('--trees'), 'utf8')) : null;
const ARMS = args('--arm').map((s) => { const [nm, rest] = s.split('='); const [dir, tag] = rest.split(':'); return { nm, dir, tag: tag || nm }; });
const load = (a, seed) => {
  const f = path.join(a.dir, `${a.tag}-${seed}.json`);
  let run = null, pr = null;
  try { run = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  try { pr = JSON.parse(fs.readFileSync(f + '.t702.json', 'utf8')); } catch (e) {}
  return { run, pr };
};
const D = {};
for (const a of ARMS) { D[a.nm] = {}; for (const s of SEEDS) D[a.nm][s] = load(a, s); }
const audBy = new Map(AUD.rows.map((r) => [r.name, r]));
const med = (a) => { const b = a.filter(Number.isFinite).slice().sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const sum = (a) => a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pc = (x, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—');
const WIN = [[1, 30], [31, 100], [101, 400]];
const J = { seeds: SEEDS, arms: ARMS.map((a) => a.nm), consts: { HOUSE_DECAY, HOUSE_WOOD, HOUSE_BUFFER, FIREWOOD_PC, FUEL_COLD_W, SMELT_FUEL_PER }, one: {}, two: {}, zero: {}, sellers: {}, cut: {}, five: null };

// ── 마을 하나 · 창 하나의 통나무 장부 ──
function budget(pr, i, lo, hi) {
  const S = pr.v[i], days = pr.days, sd = pr.seed[i] || {};
  const o = { pd: 0, prod: 0, cons: 0, smelt: 0, kiln: 0, house: 0, fuel: 0, exS: 0, exB: 0, imS: 0, imB: 0, dStock: 0, ljd: 0, fc1: 0, w0: 0, hz: 0, fam: 0, days: 0, need: 0, sns: 0 };
  let k0 = -1, k1 = -1;
  for (let k = 0; k < days.length; k++) { if (days[k] >= lo && k0 < 0) k0 = k; if (days[k] <= hi) k1 = k; }
  if (k0 < 0 || k1 < k0) return null;
  const prev = (arr, k, base) => (k > 0 ? arr[k - 1] : base);
  o.dStock = S.wood[k1] - prev(S.wood, k0, sd.wood || 0);
  o.smelt = S.smw[k1] - prev(S.smw, k0, 0);
  o.kiln = S.kw[k1] - prev(S.kw, k0, 0);
  o.sns = (S.sns ? S.sns[k1] - prev(S.sns, k0, 0) : 0);
  for (let k = k0; k <= k1; k++) {
    const n = S.n[k]; o.pd += n; o.days++;
    o.prod += S.prod[k]; o.cons += S.cons[k];
    const hp = prev(S.house, k, sd.housing != null ? sd.housing : n);
    const built = Math.max(0, S.house[k] - hp * (1 - HOUSE_DECAY));
    o.house += built * HOUSE_WOOD;
    o.exS += S.exS[k]; o.exB += S.exB[k]; o.imS += S.imS[k]; o.imB += S.imB[k];
    o.ljd += S.lj[k];
    if (Number.isFinite(S.fc[k]) && S.fc[k] < 1) o.fc1++;
    if (S.wood[k] < 1) o.w0++;
    if (S.house[k] < n * HOUSE_BUFFER && S.wood[k] < 1) o.hz++;
    if (S.fam[k]) o.fam++;
    o.need += n * FIREWOOD_PC * (1 + FUEL_COLD_W * (S.cold[k] || 0)) + (S.sm[k] || 0) * SMELT_FUEL_PER;
  }
  o.fuel = Math.max(0, o.cons - o.smelt - o.kiln - o.house);
  o.rest = o.prod + o.imS + o.imB - o.cons - o.exS - o.exB - o.dStock;   // 생존 몫(0.05n) + 활대 + 그 밖
  return o;
}
const bins = [[0, 0.6, '< 0.6'], [0.6, 1.0, '0.6~1.0'], [1.0, 1.6, '1.0~1.6'], [1.6, 9, '≥ 1.6']];
const binOf = (w) => bins.find((b) => w >= b[0] && w < b[1]);

function tableOne(arm) {
  console.log(`\n### ① 땅 칸별 통나무 장부 — 팔 ${arm} · 시드 ${SEEDS.join('·')} 마을·시드 묶음(중앙)\n`);
  for (const [lo, hi] of WIN) {
    console.log(`\n**창 ${lo}~${hi}일**\n`);
    console.log('| land.wood | 마을×시드 | 숲 몫(스텝4) 중앙 | 걸음 100셀 안 나무 중앙 | 나무꾼 몫 | 1인 1일 생산 | 1인 1일 `_cons` | 1인 1일 생존 몫+그 밖 | 1인 1일 순들여옴 | 땔감 못 땜 날 | 곳간 0 날 | 집 못 지음(곳간 0) 날 | 기근 날 |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const b of bins) {
      const R = [];
      for (const s of SEEDS) {
        const pr = D[arm][s].pr; if (!pr) continue;
        pr.names.forEach((nm, i) => {
          const sd = pr.seed[i]; if (!sd || !sd.land) return;
          if (binOf(sd.land.wood) !== b) return;
          const o = budget(pr, i, lo, hi); if (!o || !o.pd) return;
          const a = audBy.get(nm) || {};
          R.push({ fs: a.share ? a.share.step4 : NaN, t100: a.trees ? a.trees[0] + a.trees[1] + a.trees[2] : NaN, lj: o.ljd / o.pd, prod: o.prod / o.pd, cons: o.cons / o.pd, rest: o.rest / o.pd,
            net: (o.imS + o.imB - o.exS - o.exB) / o.pd, fc1: o.fc1 / o.days, w0: o.w0 / o.days, hz: o.hz / o.days, fam: o.fam / o.days });
        });
      }
      if (!R.length) continue;
      const m = (k) => med(R.map((r) => r[k]));
      ((J.one[arm] || (J.one[arm] = {}))[lo + '-' + hi] || (J.one[arm][lo + '-' + hi] = {}))[b[2]] = { n: R.length, fs: m('fs'), t100: m('t100'), lj: m('lj'), prod: m('prod'), cons: m('cons'), rest: m('rest'), net: m('net'), fc1: m('fc1'), w0: m('w0'), hz: m('hz'), fam: m('fam') };
      console.log(`| ${b[2]} | ${R.length} | ${pc(m('fs'))} | ${f1(m('t100'), 0)} | ${pc(m('lj'))} | ${f1(m('prod'), 3)} | ${f1(m('cons'), 3)} | ${f1(m('rest'), 3)} | ${f1(m('net'), 3)} | ${pc(m('fc1'), 0)} | ${pc(m('w0'), 0)} | ${pc(m('hz'), 0)} | ${pc(m('fam'), 0)} |`);
    }
  }
}

function tableTwo(arm) {
  console.log(`\n### ② 품목별 — 마을이 보는 필요량 ↔ 실제로 쓴 양(1인 1일 · 팔 ${arm} · 마을·날 합 ÷ 사람·날 합)\n`);
  console.log('| 창 | 사람·날 | 땔감(통나무) | 집 | 노(제련 숯 대신 태운 통나무) | 숯가마 | `_cons` 합 | 생존 몫 + 그 밖(장부 잔차) | 실제 합 | 땔감 수요식(0.085 × (1 + 0.6 추위) + 야금공 0.5) | 실제 합 ÷ 0.05 | keep 0.75n 이 버티는 날 | thresh 1.2n 이 버티는 날 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [lo, hi] of WIN) {
    const T = { pd: 0, fuel: 0, house: 0, smelt: 0, kiln: 0, cons: 0, rest: 0, need: 0 };
    for (const s of SEEDS) { const pr = D[arm][s].pr; if (!pr) continue; pr.names.forEach((nm, i) => { const o = budget(pr, i, lo, hi); if (!o) return; for (const k of Object.keys(T)) T[k] += o[k]; }); }
    const p = (x) => x / T.pd;
    const tot = p(T.cons) + p(T.rest);
    (J.two[arm] || (J.two[arm] = {}))[lo + '-' + hi] = { pd: T.pd, fuel: p(T.fuel), house: p(T.house), smelt: p(T.smelt), kiln: p(T.kiln), cons: p(T.cons), rest: p(T.rest), total: tot, need: p(T.need) };
    console.log(`| ${lo}~${hi} | ${T.pd} | ${f1(p(T.fuel), 4)} | ${f1(p(T.house), 4)} | ${f1(p(T.smelt), 4)} | ${f1(p(T.kiln), 4)} | ${f1(p(T.cons), 4)} | ${f1(p(T.rest), 4)} | ${f1(tot, 4)} | ${f1(p(T.need), 4)} | ×${f1(tot / 0.05, 2)} | ${f1(0.75 / tot, 1)} | ${f1(1.2 / tot, 1)} |`);
  }
}

function tableThree(arm) {
  console.log(`\n### ③ 첫 30일 통나무 화물(문 ① 출발) — 팔 ${arm}\n`);
  const ALL = [];
  for (const s of SEEDS) {
    const { pr, run } = D[arm][s]; if (!pr) continue;
    const idx = new Map(pr.names.map((nm, i) => [nm, i]));
    const done = new Map(pr.ev.done.map((x) => [x.id, x]));
    for (const e of pr.ev.dep) {
      if (e.d > 30) continue;
      const dn = done.get(e.id) || null;
      const i = idx.get(e.from), j = idx.get(e.to);
      const S = pr.v[i], sd = pr.seed[i] || {};
      const k30 = pr.days.indexOf(30), k100 = pr.days.indexOf(100), k400 = pr.days.indexOf(400);
      let z = null; for (let k = pr.days.indexOf(e.d); k >= 0 && k < pr.days.length; k++) if (S.wood[k] < 1) { z = pr.days[k]; break; }
      const w = budget(pr, i, 31, 100);
      ALL.push({ seed: s, id: e.id, d: e.d, from: e.from, to: e.to, amt: e.amt, stockAfter: e.stock, n: S.n[pr.days.indexOf(e.d)], ret: dn ? dn.retRes : '(안 끝남)', retAmt: dn ? dn.retAmt : null, aband: dn ? dn.aband : null,
        pF: e.pF, pT: e.pT, landW: sd.land ? sd.land.wood : null, bonus: sd.wood != null ? sd.wood - 8 * (sd.n || 8) : null, toLandW: (pr.seed[j] && pr.seed[j].land) ? pr.seed[j].land.wood : null,
        zero: z, fc1: w ? w.fc1 : null, hz: w ? w.hz : null, pop: [S.n[k30], S.n[k100], S.n[k400]] });
    }
  }
  console.log('| 시드 | 날 | 판 마을(land.wood · 시딩 덤) | 받은 마을(land.wood) | 통나무 | 판 뒤 곳간 · 사람 | 출발 값 판/받 | 실어 온 것 | 판 마을 곳간 0 첫날 | 31~100일 땔감 못 땜 · 집 못 지음 날 | 판 마을 인구 d30 · d100 · d400 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of ALL) console.log(`| ${r.seed} | ${r.d} | ${r.from}(${r.landW} · ${f1(r.bonus, 0)}) | ${r.to}(${r.toLandW}) | ${f1(r.amt, 1)} | ${f1(r.stockAfter, 1)} · ${r.n} | ${f1(r.pF, 2)} / ${f1(r.pT, 1)} | ${r.ret || '없음'} ${r.retAmt != null ? f1(r.retAmt, 1) : ''}${r.aband ? ' (빈손 귀환 — 통나무 그대로)' : ''} | ${r.zero ?? '—'} | ${r.fc1 ?? '—'} · ${r.hz ?? '—'} | ${r.pop.join(' · ')} |`);
  // 묶음
  const byRet = {};
  for (const r of ALL) { const k = r.aband ? '(빈손 — 통나무 되돌아옴)' : (r.ret || '없음'); const b = byRet[k] || (byRet[k] = { n: 0, wood: 0, back: 0 }); b.n++; b.wood += r.amt || 0; b.back += r.retAmt || 0; }
  console.log('\n| 실어 온 품목 | 건 | 내보낸 통나무 | 실어 온 양 |');
  console.log('|---|---|---|---|');
  for (const [k, b] of Object.entries(byRet).sort((x, y) => y[1].wood - x[1].wood)) console.log(`| ${k} | ${b.n} | ${f1(b.wood, 0)} | ${f1(b.back, 0)} |`);
  // 판 마을 ↔ 안 판 마을(같은 land.wood 칸 · 마을×시드 중앙)
  console.log('\n| land.wood | 첫 30일 | 마을×시드 | 시딩 통나무 중앙 | 첫 30일 내보낸 통나무 중앙 | 곳간 0 첫날 중앙 | 31~100 들여온 통나무 중앙 | 31~100 땔감 못 땜 날 | 31~100 곳간 0 날 | 31~100 집 못 지음(곳간 0) 날 | 인구 d30 · d100 · d400 중앙 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const b of bins) {
    for (const sold of [true, false]) {
      const R = [];
      for (const s of SEEDS) {
        const pr = D[arm][s].pr; if (!pr) continue;
        const k30 = pr.days.indexOf(30), k100 = pr.days.indexOf(100), k400 = pr.days.indexOf(400);
        pr.names.forEach((nm, i) => {
          const sd = pr.seed[i]; if (!sd || !sd.land || binOf(sd.land.wood) !== b) return;
          const S = pr.v[i];
          let ex = 0; for (let k = 0; k < pr.days.length && pr.days[k] <= 30; k++) ex += S.exS[k] + S.exB[k];
          if ((ex > 0) !== sold) return;
          let z = NaN; for (let k = 0; k < pr.days.length; k++) if (S.wood[k] < 1) { z = pr.days[k]; break; }
          const w = budget(pr, i, 31, 100);
          R.push({ seedW: sd.wood, ex, z, im: w ? w.imS + w.imB : NaN, fc1: w ? w.fc1 : NaN, w0: w ? w.w0 : NaN, hz: w ? w.hz : NaN, p30: S.n[k30], p100: S.n[k100], p400: S.n[k400] });
        });
      }
      if (!R.length) continue;
      const m = (k) => med(R.map((r) => r[k]));
      ((J.sellers[arm] || (J.sellers[arm] = {}))[b[2]] || (J.sellers[arm][b[2]] = {}))[sold ? 'sold' : 'kept'] = { n: R.length, seedW: m('seedW'), ex: m('ex'), z: m('z'), im: m('im'), fc1: m('fc1'), w0: m('w0'), hz: m('hz'), p30: m('p30'), p100: m('p100'), p400: m('p400') };
      console.log(`| ${b[2]} | ${sold ? '판 마을' : '안 판 마을'} | ${R.length} | ${f1(m('seedW'), 0)} | ${f1(m('ex'), 0)} | ${f1(m('z'), 0)} | ${f1(m('im'), 0)} | ${f1(m('fc1'), 0)} | ${f1(m('w0'), 0)} | ${f1(m('hz'), 0)} | ${f1(m('p30'), 0)} · ${f1(m('p100'), 0)} · ${f1(m('p400'), 0)} |`);
    }
  }
  return ALL;
}

function tableFour(arm) {
  if (!TREES) return;
  console.log(`\n### ④ 벤 나무 — 서버 끝날(팔 ${arm}) · 걸음 띠별 · 시드 ${SEEDS.join('·')}\n`);
  const nV = TREES.names.length, nB = TREES.bands.length;
  const st = Array.from({ length: nV }, () => new Array(nB).fill(0));
  for (const k in TREES.keys) { const t = TREES.keys[k]; st[t[0]][t[1]]++; }
  console.log('| 시드 | 장부 줄 | 표 안 | 띠 | 시딩 날 선 나무 | 벤 ≤1일 | ≤30 | ≤100 | ≤400 | 자리: 영토 · 다져진 길 · 그 밖 | 다시 안 남(술어) | 끝날 선 나무 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of SEEDS) {
    const pr = D[arm][s].pr; if (!pr || !pr.cut || pr.cut.err) { console.log(`| ${s} | (없음 ${pr && pr.cut && pr.cut.err || ''}) |`); continue; }
    const C = pr.cut;
    for (let b = 0; b < nB; b++) {
      const S0 = sum(st.map((r) => r[b]));
      const cb = (bin) => sum(C.cutBy[bin].map((r) => r[b]));
      const c1 = cb('d1'), c30 = c1 + cb('d30'), c100 = c30 + cb('d100'), c400 = c100 + cb('d400');
      const T = sum(C.terr.map((r) => r[b])), R2 = sum(C.road.map((r) => r[b])), O = sum(C.other.map((r) => r[b])), G = sum(C.gone.map((r) => r[b]));
      ((J.cut[s] || (J.cut[s] = { ledger: C.ledger, inTable: C.inTable, bands: [] })).bands)[b] = { band: TREES.bands[b], seedTrees: S0, c1, c30, c100, c400, terr: T, road: R2, other: O, gone: G, standEnd: S0 - c400 - cb('later') };
      console.log(`| ${s} | ${b === 0 ? C.ledger : ''} | ${b === 0 ? C.inTable : ''} | ${TREES.bands[b]} | ${S0} | ${c1} | ${c30} | ${c100} | ${c400} | ${T} · ${R2} · ${O} | ${G} | ${S0 - c400 - cb('later')} |`);
    }
  }
}

function eventsDay(pr, lo, hi) { let w = 0; for (const e of pr.ev.dep) if (e.d >= lo && e.d <= hi) w += e.amt || 0; return w; }
function tableFive() {
  if (ARMS.length < 2) return;
  console.log(`\n### ⑤ 팔끼리 — ${ARMS.map((a) => a.nm).join(' · ')}\n`);
  const rows = [];
  const pick = (pr, d) => { const k = pr.days.indexOf(d); return k; };
  const zeroAt = (pr, d, key) => { const k = pick(pr, d); if (k < 0) return NaN; let z = 0; pr.v.forEach((S) => { if (S[key][k] < 1) z++; }); return z; };
  const vd = (pr, f) => { let c = 0; pr.v.forEach((S) => { for (let k = 0; k < pr.days.length; k++) if (f(S, k)) c++; }); return c; };
  const metr = (pr, run) => ({
    w0_30: zeroAt(pr, 30, 'wood'), w0_100: zeroAt(pr, 100, 'wood'), w0_400: zeroAt(pr, 400, 'wood'),
    s0_100: zeroAt(pr, 100, 'stone'), t0_100: zeroAt(pr, 100, 'tool'),
    ex30: eventsDay(pr, 1, 30),
    pop: run && run.eight ? run.eight.pop : NaN, dead: run && run.eight ? run.eight.dead : NaN,
    fc1: vd(pr, (S, k) => Number.isFinite(S.fc[k]) && S.fc[k] < 1), hz: vd(pr, (S, k) => S.house[k] < S.n[k] * HOUSE_BUFFER && S.wood[k] < 1), fam: vd(pr, (S, k) => !!S.fam[k]),
    sns: sum(pr.v.map((S) => S.sns ? S.sns[S.sns.length - 1] : 0)),
  });
  const M = {};
  for (const a of ARMS) { M[a.nm] = {}; for (const s of SEEDS) { const { pr, run } = D[a.nm][s]; if (pr) M[a.nm][s] = metr(pr, run); } }
  const keys = [['w0_30', '통나무 0 마을 d30'], ['w0_100', 'd100'], ['w0_400', 'd400'], ['s0_100', '돌 0 마을 d100'], ['t0_100', '도구 0 마을 d100'], ['ex30', '첫 30일 통나무 수출(문 ①)'], ['pop', '인구 d400'], ['dead', '소멸'],
    ['fc1', '땔감 못 땜 마을·날'], ['hz', '집 못 지음(곳간 0) 마을·날'], ['fam', '기근 마을·날'], ['sns', '노 연료 0 번 누계']];
  const base = ARMS[0].nm;
  J.five = M;
  console.log(`| 수 | ${ARMS.map((a) => a.nm + ' ' + SEEDS.join('/')).join(' | ')} | ${ARMS.slice(1).map((a) => 'Δ% ' + a.nm + ' ' + SEEDS.join('/') + ' · T252').join(' | ')} |`);
  console.log('|---|' + ARMS.map(() => '---|').join('') + ARMS.slice(1).map(() => '---|').join(''));
  for (const [k, lab] of keys) {
    const cells = ARMS.map((a) => SEEDS.map((s) => (M[a.nm][s] ? f1(M[a.nm][s][k], 0) : '—')).join(' / '));
    const dcells = ARMS.slice(1).map((a) => {
      const d = SEEDS.map((s) => { const x = M[base][s] && M[base][s][k], y = M[a.nm][s] && M[a.nm][s][k]; return (Number.isFinite(x) && Number.isFinite(y) && x !== 0) ? 100 * (y - x) / Math.abs(x) : (x === 0 && y === 0 ? 0 : NaN); });
      const ok = d.filter(Number.isFinite);
      const mean = ok.length ? sum(ok) / ok.length : NaN;
      const sg = ok.length === SEEDS.length && (ok.every((x) => x > 0) || ok.every((x) => x < 0));
      const w = ok.length ? Math.max(...ok) - Math.min(...ok) : NaN;
      const v = !ok.length ? '—' : (sg && Math.abs(mean) > w ? `가름(${f1(mean)}%)` : sg ? `방향만(${f1(mean)}%)` : '못 가름');
      return d.map((x) => f1(x)).join(' / ') + ' · ' + v;
    });
    console.log(`| ${lab} | ${cells.join(' | ')} | ${dcells.join(' | ')} |`);
  }
}

// ⓪ 시딩 곳간 — 덤 셋(통나무 · 돌 · 도구) · 사람당 무게(`weights.js` 정본 · 짐 상한 `carry.js`)
function tableZero(arm) {
  const W = require(path.join(ROOT, 'server', 'weights')), CA = require(path.join(ROOT, 'server', 'carry'));
  const kg = (k) => W.kgOf(k) || 0;
  console.log(`\n### ⓪ 시딩 곳간 — 팔 ${arm}(createVillage 가 돌려준 곳간 · 첫 틱 전)\n`);
  console.log('| 시드 | 마을 | 덤 받은 마을(통나무 · 돌 · 도구) | 덤 합 통나무 · 돌 · 도구 | 시딩 통나무 합 | 사람당 짐 kg 최소 · 중앙 · 최대(식량 · 도구 · 옷 · 통나무 · 돌 · 원석 · 약재 · 활) | 짐 상한 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const s of SEEDS) {
    const pr = D[arm][s].pr; if (!pr) continue;
    let nb = [0, 0, 0], sb = [0, 0, 0], wsum = 0; const kgs = [];
    pr.seed.forEach((sd) => {
      if (!sd) return; const n = sd.n || 8, L = sd.land || {};
      const bw = sd.wood - 8 * n, bs = sd.stone - 5 * n, bt = sd.tool - 3 * n;
      if (bw > 1e-6) nb[0]++; if (bs > 1e-6) nb[1]++; if (bt > 1e-6) nb[2]++;
      sb[0] += Math.max(0, bw); sb[1] += Math.max(0, bs); sb[2] += Math.max(0, bt); wsum += sd.wood;
      const ore = Math.floor(n * (L.ore || 0) * 5);
      const tot = sd.food * kg('food') + sd.tool * kg('tool') + n * 1.1 * kg('clothes') + sd.wood * kg('wood') + sd.stone * kg('stone') + ore * kg('ore') + n * 0.5 * kg('herb') + n * 0.15 * kg('weapon');
      kgs.push(tot / n);
    });
    kgs.sort((a, b) => a - b);
    (J.zero[s] = J.zero[s] || {}).seed = { bonusVillages: nb, bonusSum: sb, seedWood: wsum, kg: [kgs[0], med(kgs), kgs[kgs.length - 1]] };
    console.log(`| ${s} | ${pr.seed.length} | ${nb.join(' · ')} | ${sb.map((x) => f1(x, 0)).join(' · ')} | ${f1(wsum, 0)} | ${f1(kgs[0], 0)} · ${f1(med(kgs), 0)} · ${f1(kgs[kgs.length - 1], 0)} | ${CA.CFG.CAP_KG} |`);
  }
  // 첫 30일 통나무 수출(두 문)이 덤 받은 마을에서 나간 몫
  console.log('\n| 시드 | 첫 30일 통나무 수출 문① + 문② | 그중 덤 받은 마을 | 몫 |');
  console.log('|---|---|---|---|');
  for (const s of SEEDS) {
    const pr = D[arm][s].pr; if (!pr) continue;
    let all = 0, bon = 0;
    pr.v.forEach((S, i) => { const sd = pr.seed[i]; let e = 0; for (let k = 0; k < pr.days.length && pr.days[k] <= 30; k++) e += S.exS[k] + S.exB[k]; all += e; if (sd && sd.wood - 8 * (sd.n || 8) > 1e-6) bon += e; });
    (J.zero[s] = J.zero[s] || {}).ex30 = { all, bonus: bon };
    console.log(`| ${s} | ${f1(all, 0)} | ${f1(bon, 0)} | ${pc(bon / all)} |`);
  }
}
tableZero(ARMS[0].nm);
for (const a of ARMS) { tableOne(a.nm); tableTwo(a.nm); }
const EV = tableThree(ARMS[0].nm);
tableFour(ARMS[0].nm);
tableFive();
const JOUT = arg('--json', '');
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(Object.assign(J, { events: EV })));
