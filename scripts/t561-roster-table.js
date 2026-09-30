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
  if (BJ && BJ.bodies) {
    for (const [k, b] of Object.entries(BJ.bodies)) {
      if (b.vil !== OBS) continue;
      for (const [d, a] of Object.entries(b.days || {})) {
        const lj = (a.jobs && a.jobs.lumberjack) || 0; if (!lj) continue;               // 그날 나무꾼이었던 표본이 있는 날만
        bodyDays.push({ key: k, day: +d, n: a.n, lj, cutN: a.cutN, cutU: a.cutU, gran: a.gran, walkM: r2(a.walk / 32), rest: a.rest, half: a.half, hpMin: a.hpMin,
          dusk: a.dusk, handMax: a.handMax, lab: a.lab });
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
  for (const x of bodyDays) { const q = byDay[x.day] || (byDay[x.day] = { bodies: 0, worked: 0, cutU: 0, cutN: 0, rest: 0 }); q.bodies++; if (x.rest > 0) q.rest++; else { q.worked++; q.cutU += x.cutU || 0; q.cutN += x.cutN || 0; } }
  for (const [d, q] of Object.entries(byDay)) {
    const info = vilDay[d] || null;
    const per = info && info.trips != null ? info.trips * (info.treesPerLoad || 1) * (info.wBar || 0) : null;   // 옛 일괄의 한 사람 몫(단) = 짐 수 × 짐당 그루 × w̄
    const body491 = info && info.trips != null ? info.trips * (info.woodPerLoad || 0) : null;               // T491 의 몸 하루(단)
    const bodyU = q.worked > 0 ? q.cutU / q.worked : null;
    ratio.push({ day: +d, bodies: q.bodies, worked: q.worked, rest: q.rest, bodyU: r2(bodyU), bodyTrees: q.worked ? r2(q.cutN / q.worked) : null,
      batchPer: r2(per), body491: r2(body491), trips: info && info.trips, wBar: info && info.wBar, dCtr: info && info.dCtr,
      x: (bodyU > 0 && per != null) ? r2(per / bodyU) : null });
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
  out.arms[tag] = { env: A.env, obsDays, bodyDays, ratio,
    rest: { hlDays, hlCut, hlUnits: r2(hlUnits), roster: rosterRows ? { rows: rosterRows, econ: rosterEcon, body: rosterBody, zeroCrew, zeroCrewEcon } : null } };
}

// ── 찍기 ──
const fmt = (v) => (v == null ? '—' : v);
console.log(`관측 마을 ${OBS} · 팔 ${Object.keys(out.arms).join(' · ')}`);
for (const [tag, O] of Object.entries(out.arms)) {
  console.log(`\n── ${tag} ${JSON.stringify(O.env && { T561: O.env.T561_ROSTER_BODY || '', T374: O.env.T374_DEMAND_STOP == null ? '(기본 켬)' : O.env.T374_DEMAND_STOP })}`);
  console.log('  그 하루(경계) | econ 나무꾼 · 나선 몸 | 명부 | 해 질 녘 손 든 몸 | 일괄 그루 · 한도 | 수요 | 사다리 단 | 곳간에 든 단(T325) | 곳간 목재');
  for (const x of O.obsDays) console.log(`  ${x.of}(${x.day}) | ${fmt(x.econ)} · ${fmt(x.crew)} | ${fmt(x.ln)} | ${fmt(x.walked)} | ${fmt(x.cut)} · ${fmt(x.cap)} | ${fmt(x.dem)}${x.stop ? '(멈춤)' : ''} | ${fmt(x.lad)} | ${fmt(x.delW)} | ${fmt(r2(x.woodSto))}`);
  console.log('  몸 × 날(나무꾼) — 게임일 | 몸 | 요양 몸 | 나선 몸 한 사람: 벤 그루 · 벤 단 | 옛 일괄 한 사람 몫 단(짐 × 짐당 그루 × w̄) | T491 몸 하루 | 배수');
  for (const x of O.ratio) console.log(`  ${x.day} | ${x.bodies} | ${x.rest} | ${fmt(x.bodyTrees)} · ${fmt(x.bodyU)} | ${fmt(x.batchPer)}(짐 ${fmt(x.trips)} · w̄ ${fmt(x.wBar)}) | ${fmt(x.body491)} | ${fmt(x.x)}`);
  const Rr = O.rest; console.log(`  나머지 마을: 일괄 마을·날 ${Rr.hlDays} · 그루 ${Rr.hlCut} · 단 ${Rr.hlUnits}` + (Rr.roster ? ` · 명부(마을·날 ${Rr.roster.rows}) econ ${Rr.roster.econ} ↔ 나선 몸 ${Rr.roster.body} · 나선 몸 0 인데 econ > 0 ${Rr.roster.zeroCrew}(econ ${Rr.roster.zeroCrewEcon})` : ''));
}
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1));
