#!/usr/bin/env node
// === scripts/t561-roster-table.js — T561 ③ 자: 앓힌 판 · 30일 판의 표를 낸다(계측 결과를 읽기만 · 판 0) ==================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 존을 띄우지 않는다 — `scripts/t449-body-day.js` 가 남긴
//   `body-day.json`(마을 하루 줄 · 조각) 과 `<팔>.body.json`(`t491-probe` — 몸 × 게임일 누계 · 마을 × 게임일 한도 칸)을 읽는다.
//
// ★내는 표
//   ⓐ 관측 마을 날마다(팔마다): 나무꾼 몸(econ 수 · 나선 몸 T561) · 일괄(그루 · 한도) · 몸이 곳간에 댄 단(사다리 + 해 질 녘) · 요양 몸 · 곳간 목재
//   ⓑ 몸 × 날(관측 마을 나무꾼): 벤 그루 · 벤 단 · 곳간행 · 걸음 · 요양 표본 — 몸 하루 = 짐 왕복 × 짐?
//   ⓒ 배수 — 일괄 한도(몸 한 사람 몫 · 그날 그 마을의 식 그대로 — 짐 수 × 짐당 그루 × w̄ 단) ÷ 몸이 실제로 댄 단(그날 나선 나무꾼 몸 한 사람)
//      · 수요 문(T374)이 켜진 팔은 그날 수요(`dem`)도 같이(일괄은 그 수에서 멈춘다)
//   ⓓ 나머지 마을(관측자 0): 일괄 마을·날 · 그루 · 명부(econ ↔ 나선 몸)
//
// 실행: node scripts/t561-roster-table.js <run 디렉터리> [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
if (!DIR) { console.error('쓰는 법: node scripts/t561-roster-table.js <run 디렉터리>'); process.exit(2); }
const OUTJ = (() => { const i = process.argv.indexOf('--json'); return i > 0 ? process.argv[i + 1] : null; })();
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'body-day.json'), 'utf8'));
const OBS = R.obs.name;
const r2 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(2) : x;
const out = { obs: R.obs, arms: {} };

for (const [tag, A] of Object.entries(R.arms)) {
  let BJ = null; try { BJ = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.body.json`), 'utf8')); } catch (e) { BJ = null; }
  const days = A.days || [];
  // ── ⓐ 관측 마을 하루 줄(경계마다 — 그 줄의 `wd` 는 **방금 끝난 하루**의 절 머리 셈 · `del.wood` 는 누계)
  const rowsObs = days.map((D) => ({ day: D.day, zero: !!D.zero, r: (D.rows || []).find((x) => x.n === OBS) || null }));
  const obsDays = [];
  for (let i = 1; i < rowsObs.length; i++) {
    const a = rowsObs[i - 1].r, b = rowsObs[i].r; if (!a || !b) continue;
    const wd = b.wd || {}, t5 = wd.t561 || null, t5a = (a.wd && a.wd.t561) || null;
    const lad = (t5 && t5a) ? r2((t5.lad || 0) - (t5a.lad || 0)) : null;               // 그 하루 사다리에서 든 단(켠 팔만 — 누계의 차)
    const delW = r2((b.del && b.del.wood || 0) - (a.del && a.del.wood || 0));            // 그 하루 T325 로 곳간에 든 단 전부(몸 + 일괄)
    obsDays.push({ day: rowsObs[i].day, of: rowsObs[i].day - 1, econ: t5 ? t5.econ : wd.ln, crew: t5 ? t5.crew : null, ln: wd.ln, walked: wd.walked, cut: wd.cut, cap: wd.cap,   // ★경계 줄 = 방금 끝난 하루(`of`)의 절
      trips: wd.trips, perLoad: wd.perLoad, dem: wd.dem, stop: wd.stop, lad, delW, woodSto: b.wood });
  }
  // ── ⓑ 몸 × 날(관측 마을 나무꾼) · 마을 × 날 한도 칸
  const bodyDays = [], vilDay = {};
  //   ★온전한 하루만 — 첫 경계 줄의 날(그 하루부터 센다) ≤ d < 마지막 경계 줄의 날(그날은 아직 도는 중 · 부팅 날도 뺀다)
  const D0 = days.length ? days[0].day : -Infinity, D1 = days.length ? days[days.length - 1].day : Infinity;
  const whole = (d) => +d >= D0 && +d < D1;
  if (BJ && BJ.bodies) {
    for (const [k, b] of Object.entries(BJ.bodies)) {
      if (b.vil !== OBS) continue;
      for (const [d, a] of Object.entries(b.days || {})) {
        if (!whole(d)) continue;
        const lj = (a.jobs && a.jobs.lumberjack) || 0; if (!lj) continue;               // 그날 나무꾼이었던 표본이 있는 날만
        bodyDays.push({ key: k, day: +d, n: a.n, lj, cutN: a.cutN, cutU: a.cutU, gran: a.gran, walkM: r2(a.walk / 32), rest: a.rest, half: a.half, hpMin: a.hpMin,
          dusk: a.dusk, handMax: a.handMax, lab: a.lab,
          restMaj: (a.rest || 0) * 2 >= (a.n || 1),                                                            // 그날 표본의 절반 이상 요양(회복한 아침 몇 초는 요양 날이 아니다)
          stuck: (a.cutN || 0) === 0 && ((a.lab && a.lab['출근']) || 0) >= 800 && (a.walk || 0) < 8000 });   // 멈춘 몸(아래 ⓔ 의 그 문턱)
      }
    }
    for (const [vid, v] of Object.entries(BJ.vils || {})) {
      if (v.name !== OBS) continue;
      for (const [d, info] of Object.entries(v.days || {})) vilDay[d] = info;
    }
  }
  // ── ⓒ 배수 — 그날 나선 나무꾼 몸 한 사람이 댄 단 ↔ 일괄이 그 한 사람 몫으로 벨 단(그날 식)
  const ratio = [];
  const byDay = {};
  for (const x of bodyDays) { const q = byDay[x.day] || (byDay[x.day] = { bodies: 0, worked: 0, cutU: 0, cutN: 0, rest: 0, stuck: 0, cutUns: 0 }); q.bodies++;
    if (x.restMaj) q.rest++; else { q.worked++; q.cutU += x.cutU || 0; q.cutN += x.cutN || 0; if (x.stuck) q.stuck++; else q.cutUns += x.cutU || 0; } }
  for (const [d, q] of Object.entries(byDay)) {
    const info = vilDay[d] || null;
    const per = info && info.trips != null ? info.trips * (info.treesPerLoad || 1) * (info.wBar || 0) : null;   // 옛 일괄의 한 사람 몫(단) = 짐 수 × 짐당 그루 × w̄
    const body491 = info && info.trips != null ? info.trips * (info.woodPerLoad || 0) : null;               // T491 의 몸 하루(단)
    const bodyU = q.worked > 0 ? q.cutU / q.worked : null;
    const nsN = q.worked - q.stuck, bodyUns = nsN > 0 ? q.cutUns / nsN : null;                                   // 멈춘 몸을 뺀 한 사람
    ratio.push({ day: +d, bodies: q.bodies, worked: q.worked, rest: q.rest, stuck: q.stuck, bodyU: r2(bodyU), bodyTrees: q.worked ? r2(q.cutN / q.worked) : null,
      batchPer: r2(per), body491: r2(body491), trips: info && info.trips, wBar: info && info.wBar, dCtr: info && info.dCtr,
      x: (bodyU > 0 && per != null) ? r2(per / bodyU) : null, bodyUns: r2(bodyUns), xns: (bodyUns > 0 && per != null) ? r2(per / bodyUns) : null });
  }
  ratio.sort((a, b) => a.day - b.day);
  // ── ⓓ 나머지 마을(관측자 0) — 일괄 마을·날 · 그루 · 명부
  let hlDays = 0, hlCut = 0, hlUnits = 0, rosterEcon = 0, rosterBody = 0, rosterRows = 0, zeroCrew = 0, zeroCrewEcon = 0;
  for (let i = 1; i < days.length; i++) {
    const prev = new Map((days[i - 1].rows || []).map((x) => [x.n, x]));
    for (const b of days[i].rows || []) {
      if (b.n === OBS) continue; const a = prev.get(b.n); if (!a) continue;
      const wd = b.wd || {}; if (!wd.on) continue;
      if ((wd.cut || 0) > 0) { hlDays++; hlCut += wd.cut; hlUnits += (b.del && b.del.wood || 0) - (a.del && a.del.wood || 0); }
      if (wd.t561) { rosterRows++; rosterEcon += wd.t561.econ || 0; rosterBody += wd.t561.crew || 0; if (!wd.t561.crew && wd.t561.econ) { zeroCrew++; zeroCrewEcon += wd.t561.econ; } }
    }
  }
  // ── ⓔ 세계(모든 마을) — 나무꾼 몸·날(그날 나무꾼 표본이 있고 요양 표본 0 인 날): 그루 분포 · 단 · 곳간행 · 손 최대(곳간 있는/없는 마을) · 해 질 녘 손
  const gOf = (vname, d) => { if (!BJ) return null; for (const v of Object.values(BJ.vils || {})) if (v.name === vname) { const x = (v.days || {})[d]; return x ? x.gran : null; } return null; };
  const W = { bd: 0, hist: { '0': 0, '1': 0, '2': 0, '3-9': 0, '10+': 0 }, cutU: [], gran: [], handG: 0, handNG: 0, duskMax: 0, duskSum: 0, restBD: 0,
    stuck: 0, stuckRun: {}, rested: 0 };
  //   ★멈춘 몸·날(계측 문턱 — 제품 수 아님): 0그루 · `출근` 라벨 800초 이상 · 걸음 8,000px(≈ 210초 · 일한 몸은 20,000px 넘게 걷는다) 미만 — 닿지 못한 셀 앞에 하루 서 있었다(T491 §2-ⓑ 어촌3 의 그 꼴)
  //   ★쉰 몸·날: 0그루 · `휴식` 800초 이상 — 수요 문(T374 `_t374Done`) 또는 그날 목록이 빈 날(T561 ⓐ)
  const stuckOf = (a) => (a.cutN || 0) === 0 && ((a.lab && a.lab['출근']) || 0) >= 800 && (a.walk || 0) < 8000;
  const restedOf = (a) => (a.cutN || 0) === 0 && ((a.lab && a.lab['휴식']) || 0) >= 800;
  const sickVD = new Map();   // `${vil}|${d}` → 그날 요양 표본이 있는 나무꾼 몸 수
  const outZeroVD = new Map(); // `${vil}|${d}` → 그날 `출근` 하고도 0그루인 나무꾼 몸 수
  if (BJ && BJ.bodies) {
    for (const [bk, b] of Object.entries(BJ.bodies)) {
      for (const [d, a] of Object.entries(b.days || {})) {
        if (!whole(d)) continue;
        if (!((a.jobs && a.jobs.lumberjack) > 0)) continue;
        if (a.rest > 0) { W.restBD++; const k = `${b.vil}|${d}`; sickVD.set(k, (sickVD.get(k) || 0) + 1); continue; }
        W.bd++; const c = a.cutN || 0;
        if (stuckOf(a)) { W.stuck++; (W.stuckRun[`${b.vil}|${bk}`] || (W.stuckRun[`${b.vil}|${bk}`] = [])).push(+d); }
        if ((a.cutN || 0) === 0 && ((a.lab && a.lab['출근']) || 0) > 0) outZeroVD.set(`${b.vil}|${d}`, (outZeroVD.get(`${b.vil}|${d}`) || 0) + 1);   // 나섰는데 0그루(ⓓ 가 "그날 걸은 몸"으로 세는 몸)
        if (restedOf(a)) W.rested++;
        W.hist[c === 0 ? '0' : c === 1 ? '1' : c === 2 ? '2' : c < 10 ? '3-9' : '10+']++;
        W.cutU.push(a.cutU || 0); W.gran.push(a.gran || 0);
        const g = gOf(b.vil, d); if (g) W.handG = Math.max(W.handG, a.handMax || 0); else if (g === 0) W.handNG = Math.max(W.handNG, a.handMax || 0);
        W.duskMax = Math.max(W.duskMax, a.dusk || 0); W.duskSum += a.dusk || 0;
      }
    }
  }
  const med = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const sum = (xs) => xs.reduce((p, q) => p + q, 0);
  const world = { bodyDays: W.bd, hist: W.hist, cutUMed: r2(med(W.cutU)), cutUSum: r2(sum(W.cutU)), granMed: med(W.gran), handMaxGran: r2(W.handG), handMaxNoGran: r2(W.handNG),
    duskMax: r2(W.duskMax), duskSum: r2(W.duskSum), restBodyDays: W.restBD, stuck: W.stuck, rested: W.rested,
    //   멈춘 몸 — 가장 긴 연속 날(같은 몸) · 연속 3일 이상인 몸 수
    stuckLong: (() => { let best = 0, n3 = 0, who = null; for (const [k, ds] of Object.entries(W.stuckRun)) { const s = ds.slice().sort((p, q) => p - q); let run = 1, mx = 1; for (let i = 1; i < s.length; i++) { run = (s[i] === s[i - 1] + 1) ? run + 1 : 1; mx = Math.max(mx, run); } if (mx >= 3) n3++; if (mx > best) { best = mx; who = k; } } return { best, who, n3 }; })() };
  // ── ⓕ 세계 입고(T325 목재 · T347 채집 — `del` 누계의 처음↔끝 차) · 일괄 마을·날(모든 마을 · 관측 마을 포함) · 앓은 날(나무꾼 몸 요양 표본이 있는 마을·날)의 일괄
  let delW = 0, delF = 0, bW = { vd: 0, cut: 0 }, bF = { vd: 0, pick: 0 }, sick = { vd: 0, batchVd: 0, batchCut: 0, rosterSick: 0 }, fRoster = { rows: 0, econ: 0, body: 0 };
  const stuckVD = new Map(); for (const [k, ds] of Object.entries(W.stuckRun)) { const vn = k.split('|')[0]; for (const d of ds) stuckVD.set(`${vn}|${d}`, (stuckVD.get(`${vn}|${d}`) || 0) + 1); }
  const stuckB = { vd: 0, cut: 0 };   // 멈춘 몸이 있던 마을·날에 일괄이 돈 날(그 몸도 명부에 든다 — 성한 몸이다)
  const outZB = { vd: 0, cut: 0 };    // 나섰는데 0그루인 몸이 있던 마을·날에 일괄이 돈 날 — ⓓ 뒤라면 켠 팔에선 0 이다(그 몸이 그날 걸은 몸)
  if (days.length > 1) {
    const first = new Map((days[0].rows || []).map((x) => [x.n, x])), lastR = days[days.length - 1].rows || [];
    for (const b of lastR) { const a = first.get(b.n); if (!a) continue; delW += (b.del && b.del.wood || 0) - (a.del && a.del.wood || 0); delF += (b.del && b.del.forage || 0) - (a.del && a.del.forage || 0); }
    for (let i = 1; i < days.length; i++) {
      const of = days[i].day - 1;
      for (const b of days[i].rows || []) {
        const wd = b.wd || {}, fd = b.fd || {};
        if ((wd.cut || 0) > 0) { bW.vd++; bW.cut += wd.cut; }
        if ((fd.pick || 0) > 0) { bF.vd++; bF.pick += fd.pick; }
        if (fd.t561) { fRoster.rows++; fRoster.econ += fd.t561.econ || 0; fRoster.body += fd.t561.crew || 0; }
        const st = stuckVD.get(`${b.n}|${of}`) || 0;
        if (st > 0 && (wd.cut || 0) > 0) { stuckB.vd++; stuckB.cut += wd.cut; }
        const oz = outZeroVD.get(`${b.n}|${of}`) || 0;
        if (oz > 0 && (wd.cut || 0) > 0) { outZB.vd++; outZB.cut += wd.cut; }
        const s = sickVD.get(`${b.n}|${of}`) || 0;
        if (s > 0) { sick.vd++; if ((wd.cut || 0) > 0) { sick.batchVd++; sick.batchCut += wd.cut; sick.rosterSick += Math.min(s, wd.ln || 0); } }
      }
    }
  }
  const flow = { delWood: r2(delW), delForage: r2(delF), batchWood: bW, batchForage: bF, sick, stuckBatch: stuckB, outZeroBatch: outZB, forageRoster: fRoster.rows ? fRoster : null };
  //   일괄 단(어림) = 그루 × 그날 그 마을 w̄(`vils` 칸 · 정본 `_t325Trees.wBar`) — `del.wood` 는 몸·일괄 합이라 일괄 몫을 따로 셀 수 없다
  let bU = 0;
  const wbOf = (vname, d) => { if (!BJ) return 0; for (const v of Object.values(BJ.vils || {})) if (v.name === vname) { const x = (v.days || {})[d]; return (x && x.wBar) || 0; } return 0; };
  for (let i = 1; i < days.length; i++) for (const b of days[i].rows || []) { const c = (b.wd && b.wd.cut) || 0; if (c > 0) bU += c * wbOf(b.n, days[i].day - 1); }
  flow.batchWood.unitsEst = r2(bU);
  // ── ⓖ 끝(마지막 경계 줄) · 마을별 · 반일 나무꾼 몸·날(회부) · 숲 N = 0 마을(첫 온전한 날 ↔ 마지막 온전한 날 · `vils` 칸)
  const lastRows = days.length ? (days[days.length - 1].rows || []) : [];
  const end = { pop: 0, fe: 0, wood: 0, houses: 0 }, perVil = {};
  for (const b of lastRows) { end.pop += b.pop || 0; end.fe += b.fe || 0; end.wood += b.wood || 0; end.houses += b.houses || 0; perVil[b.n] = { pop: b.pop || 0, fe: b.fe || 0, wood: b.wood || 0, houses: b.houses || 0 }; }
  end.fe = r2(end.fe); end.wood = r2(end.wood);
  let halfBD = 0;
  if (BJ && BJ.bodies) for (const b of Object.values(BJ.bodies)) for (const [d, a] of Object.entries(b.days || {})) if (whole(d) && (a.jobs && a.jobs.lumberjack) > 0 && !(a.rest > 0) && a.half > 0) halfBD++;
  const n0 = { first: 0, last: 0, withK: 0 };
  if (BJ && BJ.vils && days.length > 1) {
    const dF = String(D0), dL = String(D1 - 1);
    for (const v of Object.values(BJ.vils)) { const a = (v.days || {})[dF], z = (v.days || {})[dL]; if (a && a.K > 0) { n0.withK++; if (!(a.N > 0)) n0.first++; if (z && !(z.N > 0)) n0.last++; } }
  }
  out.arms[tag] = { env: A.env, obsDays, bodyDays, ratio, world, flow, end, perVil, halfBD, n0,
    rest: { hlDays, hlCut, hlUnits: r2(hlUnits), roster: rosterRows ? { rows: rosterRows, econ: rosterEcon, body: rosterBody, zeroCrew, zeroCrewEcon } : null } };
}
// ── ⓗ 팔 짝 — 끝날 마을별 차(켬 − 끔 ↔ 끔2 − 끔 = A/A) · 있는 팔끼리만
const pairs = [['t561', 'off'], ['off2', 'off'], ['t561nd', 'offnd'], ['it561', 'ioff'], ['it561nd', 'ioffnd']].filter(([a, b]) => out.arms[a] && out.arms[b]);
out.pairs = {};
for (const [a, b] of pairs) {
  const A = out.arms[a].perVil, B = out.arms[b].perVil; let pop = 0, feN = 0, feSum = 0, feMax = 0, woodN = 0, woodMax = 0, housesN = 0, n = 0;
  for (const k of Object.keys(B)) { const x = A[k], y = B[k]; if (!x) continue; n++;
    if (x.pop !== y.pop) pop++; const df = Math.abs(x.fe - y.fe); if (df > 0.05) { feN++; feSum += df; feMax = Math.max(feMax, df); }
    const dw = Math.abs(x.wood - y.wood); if (dw > 0.05) { woodN++; woodMax = Math.max(woodMax, dw); } if (x.houses !== y.houses) housesN++; }
  out.pairs[`${a}-${b}`] = { n, popDiff: pop, feDiff: feN, feMeanAbs: feN ? r2(feSum / feN) : 0, feMaxAbs: r2(feMax), woodDiff: woodN, woodMaxAbs: r2(woodMax), housesDiff: housesN };
}

// ── 찍기 ──
const fmt = (v) => (v == null ? '—' : v);
console.log(`관측 마을 ${OBS} · 팔 ${Object.keys(out.arms).join(' · ')}`);
for (const [tag, O] of Object.entries(out.arms)) {
  console.log(`\n── ${tag} ${JSON.stringify(O.env && { T561: O.env.T561_ROSTER_BODY || '', T374: O.env.T374_DEMAND_STOP == null ? '(기본 켬)' : O.env.T374_DEMAND_STOP })}`);
  console.log('  그 하루(경계) | econ 나무꾼 · 나선 몸 | 명부 | 해 질 녘 손 든 몸 | 일괄 그루 · 한도 | 수요 | 사다리 단 | 곳간에 든 단(T325) | 곳간 목재');
  for (const x of O.obsDays) console.log(`  ${x.of}(${x.day}) | ${fmt(x.econ)} · ${fmt(x.crew)} | ${fmt(x.ln)} | ${fmt(x.walked)} | ${fmt(x.cut)} · ${fmt(x.cap)} | ${fmt(x.dem)}${x.stop ? '(멈춤)' : ''} | ${fmt(x.lad)} | ${fmt(x.delW)} | ${fmt(r2(x.woodSto))}`);
  console.log('  몸 × 날(나무꾼) — 게임일 | 몸 | 요양 몸 | 나선 몸 한 사람: 벤 그루 · 벤 단 | 옛 일괄 한 사람 몫 단(짐 × 짐당 그루 × w̄) | T491 몸 하루 | 배수');
  for (const x of O.ratio) console.log(`  ${x.day} | ${x.bodies} | ${x.rest} | ${fmt(x.bodyTrees)} · ${fmt(x.bodyU)} | ${fmt(x.batchPer)}(짐 ${fmt(x.trips)} · w̄ ${fmt(x.wBar)}) | ${fmt(x.body491)} | ${fmt(x.x)}` + (x.stuck ? ` (멈춘 몸 ${x.stuck} — 빼면 ${fmt(x.bodyUns)}단 · ${fmt(x.xns)})` : ''));
  { const xs = O.ratio.map((r) => r.x).filter((v) => v != null).sort((p, q) => p - q), xn = O.ratio.map((r) => r.xns).filter((v) => v != null).sort((p, q) => p - q);
    const m = (a) => a.length ? a[Math.floor(a.length / 2)] : null;
    if (xs.length) console.log(`  ⇒ 배수 중앙 ${m(xs)}(날 ${xs.length} · ${xs[0]}~${xs[xs.length - 1]}) · 멈춘 몸 뺀 중앙 ${fmt(m(xn))}`); }
  const Rr = O.rest; console.log(`  나머지 마을: 일괄 마을·날 ${Rr.hlDays} · 그루 ${Rr.hlCut} · 단 ${Rr.hlUnits}` + (Rr.roster ? ` · 명부(마을·날 ${Rr.roster.rows}) econ ${Rr.roster.econ} ↔ 나선 몸 ${Rr.roster.body} · 나선 몸 0 인데 econ > 0 ${Rr.roster.zeroCrew}(econ ${Rr.roster.zeroCrewEcon})` : ''));
  const Wd = O.world, Fl = O.flow;
  console.log(`  세계 나무꾼 몸·날(요양 뺌) ${Wd.bodyDays} · 그루 분포 ${JSON.stringify(Wd.hist)} · 단 중앙 ${fmt(Wd.cutUMed)} · 합 ${fmt(Wd.cutUSum)} · 곳간행 중앙 ${fmt(Wd.granMed)} · 손 최대(곳간 있는 ${Wd.handMaxGran} · 없는 ${Wd.handMaxNoGran}) · 해 질 녘 손 최대 ${Wd.duskMax} · 합 ${Wd.duskSum} · 요양 몸·날 ${Wd.restBodyDays} · 멈춘 몸·날 ${Wd.stuck}(최장 연속 ${Wd.stuckLong.best}일 ${Wd.stuckLong.who || ''} · 3일 이상 몸 ${Wd.stuckLong.n3}) · 쉰 몸·날 ${Wd.rested}`);
  console.log(`  세계 입고 목재 ${Fl.delWood} · 채집 ${Fl.delForage} · 일괄 나무 마을·날 ${Fl.batchWood.vd} · ${Fl.batchWood.cut}그루(≈ ${Fl.batchWood.unitsEst}단) · 일괄 채집 마을·날 ${Fl.batchForage.vd} · ${Fl.batchForage.pick} · 앓은 마을·날 ${Fl.sick.vd}(그 가운데 일괄 ${Fl.sick.batchVd} · ${Fl.sick.batchCut}그루 · 명부에 든 앓은 몸 ${Fl.sick.rosterSick}) · 멈춘 몸 있던 마을·날의 일괄 ${Fl.stuckBatch.vd} · ${Fl.stuckBatch.cut}그루 · 나섰는데 0그루 몸 있던 마을·날의 일괄 ${Fl.outZeroBatch.vd} · ${Fl.outZeroBatch.cut}그루` + (Fl.forageRoster ? ` · 채집 명부 econ ${Fl.forageRoster.econ} ↔ 나선 몸 ${Fl.forageRoster.body}(마을·날 ${Fl.forageRoster.rows})` : ''));
  console.log(`  끝 인구 ${O.end.pop} · 식량등가 ${O.end.fe} · 목재 ${O.end.wood} · 집 ${O.end.houses} · 반일 나무꾼 몸·날 ${O.halfBD} · 숲 있는 마을 ${O.n0.withK} 중 N = 0: 첫 날 ${O.n0.first} → 끝 날 ${O.n0.last}`);
}
for (const [k, P] of Object.entries(out.pairs || {})) console.log(`\n[짝 ${k}] 마을 ${P.n} · 인구 다른 ${P.popDiff} · 식량등가 다른 ${P.feDiff}(평균 |Δ| ${P.feMeanAbs} · 최대 ${P.feMaxAbs}) · 목재 다른 ${P.woodDiff}(최대 ${P.woodMaxAbs}) · 집 다른 ${P.housesDiff}`);
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1));
