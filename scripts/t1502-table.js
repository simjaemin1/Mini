#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1502 표 뽑기)
// === scripts/t1502-table.js — T1502 깔때기 표(직업마다) · 끈 세계 맞대기 · 인구 끔비 ==================================================
//   node scripts/t1502-table.js <runs 폴더> [out 폴더]
//     읽는 것: <runs>/funnel-<팔>-<시드>.json(`scripts/lib-act-funnel.js` 탐침) · <runs>/<팔>.json(server-baseline-check --make 지문)
//     팔 이름: off-<시드> · farm-<시드> · forage-<시드> · farmfix-<시드> · foragefix-<시드> (앞 토막 = 팔 · 끝 = 시드)
//   표는 모두 이 스크립트가 낸다(보고는 이 표를 옮긴다).
const fs = require('fs'), path = require('path');
const L = require('./lib-act-funnel.js');
const RUNS = process.argv[2], OUTD = process.argv[3] || null;
if (!RUNS) { console.error('쓰는 법: node scripts/t1502-table.js <runs 폴더> [out 폴더]'); process.exit(2); }
const E = require('../sim/economy-sim');
const FF = E.FORAGE_FOOD_FACTOR || {};

const recs = {};
for (const f of fs.readdirSync(RUNS)) {
  const m = /^funnel-(.+)-(\d+)\.json$/.exec(f); if (!m) continue;
  const tag = m[1], seed = m[2], arm = tag.replace(/-\d+$/, '');
  let r; try { r = JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')); } catch (e) { continue; }
  let fp = null; try { fp = JSON.parse(fs.readFileSync(path.join(RUNS, tag + '.json'), 'utf8')); } catch (e) {}
  recs[tag] = { tag, arm, seed, r, fp };
}
// off 판에 탐침이 없을 때(앞서 돈 main 끈 판) — T1472 관찰기 `obs-off-<시드>.json`(snaps 만)으로 인구 끔비만 잇는다
const obsOff = {};
for (const f of fs.readdirSync(RUNS)) { const m = /^obs-off-(\d+)\.json$/.exec(f); if (!m) continue; try { obsOff[m[1]] = JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')); } catch (e) {} }
const pct = (a, b) => b > 0 ? (100 * a / b).toFixed(1) : '-';
const f1 = (x) => (x == null || !isFinite(x)) ? '-' : (+x).toFixed(1);
const f3 = (x) => (x == null || !isFinite(x)) ? '-' : (+x).toFixed(3);
const lines = [], J = { runs: {} };
const out = (s) => { lines.push(s); };
const lastSnap = (r) => (r.snaps && r.snaps.length) ? r.snaps[r.snaps.length - 1] : null;
// 끈 세계 하루 생산(직업 몫 · 식량등가) — 농부 = 'food'(끈 세계 수식 밭) · 채집 = 채집 품목 × FORAGE_FOOD_FACTOR
function offProd(r) {
  const S = (r.prod && r.prod.sum) || {}, d = Math.max(1, r.prod ? r.prod.days : 1);
  let fo = 0; for (const k of Object.keys(FF)) fo += (S[k] || 0) * FF[k];
  return { farmer: (S.food || 0) / d, forager: fo / d, fish: (S.fish || 0) / d, meat: (S.meat || 0) / d, wood: (S.wood || 0) / d, feAll: (r.prod ? r.prod.fe : 0) / d };
}
const tags = Object.keys(recs).sort();
out('# T1502 표(스크립트가 뽑음 · `node scripts/t1502-table.js`)');
out('');
out('## 판 — 끝 날 · 인구 · 빈 마을 · 굶어 죽음 · 오류');
out('| 판 | 끝 날 | 인구 | 빈 마을 | 굶어 죽음(누계) | 걸음 틱 합 | 생활 틱 합 | 탐침 오류 | runHash |');
out('|---|---|---|---|---|---|---|---|---|');
for (const t of tags) {
  const { r, fp, seed } = recs[t]; const s = lastSnap(r) || {};
  const rh = fp && fp.byseed && fp.byseed[seed] ? fp.byseed[seed].runHash : '-';
  out(`| ${t} | ${r.lastDay} | ${s.pop ?? '-'} | ${s.empty ?? '-'} | ${s.fd ?? '-'} | ${r.ticks.steps} | ${r.ticks.lifes} | ${r.err ? '있음' : '없음'} | ${rh} |`);
  J.runs[t] = { lastDay: r.lastDay, snap: s, runHash: rh, err: r.err || null, prod: offProd(r), batch: r.batch };
}
out('');
out('## 인구 끔비(같은 시드 off 판 대비 · 끝 날)');
out('| 판 | 인구 | off 인구 | 끔비 | 굶어 죽음 | 빈 마을 |');
out('|---|---|---|---|---|---|');
for (const t of tags) {
  const { arm, seed, r } = recs[t]; if (arm === 'off') continue;
  const o = recs['off-' + seed]; const s = lastSnap(r) || {}, so = o ? lastSnap(o.r) || {} : (obsOff[seed] ? lastSnap(obsOff[seed]) || {} : {});
  out(`| ${t} | ${s.pop ?? '-'} | ${so.pop ?? '-'} | ${so.pop ? (s.pop / so.pop).toFixed(3) : '-'} | ${s.fd ?? '-'} | ${s.empty ?? '-'} |`);
  J.runs[t].ratio = so.pop ? +(s.pop / so.pop).toFixed(4) : null;
}
out('');
// 깔때기 — 판마다 · 직업마다(판 전체)
out('## 깔때기(판 전체 몸-날 · 단계 % = 몸-날 대비 · 샘 = 앞 단계 대비 새는 몫)');
out('| 판 | 직업 | 몸-날 | 틱 받음 | 나섬 | 닿음 | 일함 | 거둠 | 들고 옴 | 곳간 듦 | 가장 크게 새는 단계(샘) | 못 닿음 까닭: 틱0 · 자리0 · 멂 | 하루 걸은 px(틱 받은 몸) | 일터까지 첫 px | 멂/걸음 비 히스토(<1,<2,<5,<20,<100,≥100) | 거둔 양 | 곳간 든 양 | 들고 온 짐 ↔ 든 몫(못 듦 %): 몸 걸음 · 하루 경계 | 닿지 않고 거둠 |');
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const t of tags) {
  const { r } = recs[t];
  for (const j of L.JOBS) {
    const R = r.rows[j]; if (!R || !R.bd) continue;
    const F = L.funnelOf(R), w = F.worst;
    const dw = R.del.walk, dd = R.del.day;
    const miss = (D) => D.u > 0 ? `${f1(D.u)} ↔ ${f1(D.g)} (${pct(D.u - D.g, D.u)} %)` : '0';
    out(`| ${t} | ${j} | ${R.bd} | ${pct(R.tick, R.bd)} | ${pct(R.out, R.bd)} | ${pct(R.reach, R.bd)} | ${pct(R.work, R.bd)} | ${pct(R.harv, R.bd)} | ${pct(R.carry, R.bd)} | ${pct(R.gran, R.bd)} | ${w ? `${w.ko}(${(w.leak * 100).toFixed(1)} %)` : '-'} | ${pct(R.why.noTick, R.bd)} · ${pct(R.why.noSite, R.bd)} · ${pct(R.why.far, R.bd)} | ${f1(R.tick ? R.walkPx / R.tick : 0)} | ${f1(R.d0N ? R.d0Sum / R.d0N : 0)} | ${R.farHist.join(',')} | ${f1(R.harvU)} | ${f1(R.granU)} | ${miss(dw)} · ${miss(dd)} | ${R.harvNoReach} |`);
    J.runs[t][j] = { bd: R.bd, stages: F.stages, worst: w, why: R.why, walkPerTickDay: R.tick ? R.walkPx / R.tick : 0, d0: R.d0N ? R.d0Sum / R.d0N : 0, farHist: R.farHist, harvU: R.harvU, granU: R.granU, granFE: R.granFE, del: R.del, lab: R.lab, harvNoReach: R.harvNoReach, workN: R.workN, stepPerTickDay: R.tick ? R.stepN / R.tick : 0 };
  }
}
out('');
out('## 자리 0 몸-날의 마지막 생활 라벨(상위 6 · 판 · 직업)');
for (const t of tags) for (const j of ['farmer', 'forager']) {
  const R = recs[t].r.rows[j]; if (!R || !R.bd) continue;
  const top = Object.entries(R.lab).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ');
  out(`- ${t} ${j}: ${top || '-'}`);
}
out('');
// 다 닿았다면 — 닿아 일한 몸-날 하나가 거둔 양(식량등가 아닌 품목 단위 · 곳간 든 식량등가 비로 환산) × 그 직업 몸-날 ÷ 날 ↔ 끈 세계 같은 직업 하루 생산
out('## 끈 세계 맞대기 — "다 닿아 다 일했다면" 하루 곳간 입고(식량등가 · 셈) ↔ 끈 세계 하루 생산');
out('| 판 | 직업 | 닿아 일한 몸-날 하나가 거둔 양 | 든 양의 식량등가/단위 | 몸-날/날 | 다 닿았다면 하루 식량등가 | 끈 세계 같은 시드 하루(그 직업) | 비 | 판정 |');
out('|---|---|---|---|---|---|---|---|---|');
for (const t of tags) {
  const { arm, seed, r } = recs[t]; if (arm === 'off') continue;
  const o = recs['off-' + seed]; const op = o ? offProd(o.r) : null;
  for (const j of ['farmer', 'forager']) {
    const R = r.rows[j]; if (!R || !R.bd) continue;
    const perWork = R.work ? R.harvU / R.work : 0;   // 거둔 양은 닿은 몸 · 닿지 않은 몸 다 센다 — 닿지 않은 거둠은 0 이어야 한다(불변식)
    const fePerU = R.granU > 0 ? R.granFE / R.granU : null;
    const days = Math.max(1, r.lastDay - 1);
    const pot = fePerU != null ? perWork * fePerU * R.bd / days : null;
    const base = op ? op[j] : null;
    const ratio = (pot != null && base) ? pot / base : null;
    out(`| ${t} | ${j} | ${f3(perWork)} | ${f3(fePerU)} | ${f1(R.bd / days)} | ${f1(pot)} | ${f1(base)} | ${ratio != null ? ratio.toFixed(2) : '-'} | ${ratio == null ? '-' : ratio >= 0.95 ? '길(다 닿으면 넉넉)' : '수(다 닿아도 모자람)'} |`);
    J.runs[t][j].pot = { perWork, fePerU, bdPerDay: R.bd / days, pot, base, ratio };
  }
}
out('');
// 채집 일괄(몸 없는 채집꾼 몫 — `_lifeDaily` 채집 절 · 마을 하루 디버그 `_t347Dbg` 를 읽기만) — 마을-날 단위 깔때기
out('## 채집 일괄 깔때기(몸 없는 채집꾼 — 마을-날 · `_t347Dbg` 읽기만)');
out('| 판 | 마을-날 | 켜짐 | econ 채집꾼 0 | 몫(share) 0 | 수요 0(마을-날) | 셀 0 | 걸음 0 | 몸 없는 채집꾼(명-날) | 수요 D(단위 합) | 딴 단위 | 곳간 든 단위 | 든/D | 수요 멈춤 | 손 쥠 | 놀림(셀 있는데 0) |');
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const t of tags) {
  const F = recs[t].r.fb; if (!F || !F.vd) continue;
  out(`| ${t} | ${F.vd} | ${pct(F.on, F.vd)} % | ${pct(F.econ0, F.vd)} % | ${pct(F.share0, F.vd)} % | ${pct(F.dem0, F.vd)} % | ${pct(F.noCell, F.vd)} % | ${pct(F.noTrip, F.vd)} % | ${F.fg} | ${f1(F.D)} | ${f1(F.units)} | ${f1(F.gran)} | ${F.D > 0 ? (F.gran / F.D).toFixed(3) : '-'} | ${pct(F.stop, F.vd)} % | ${pct(F.hold, F.vd)} % | ${pct(F.idle, F.vd)} % |`);
  J.runs[t].fb = F;
}
out('');
out('## 100날 창 — 판 · 날 · 인구 · 굶어 죽음 · 곳간 날치 · 직업(농부 · 채집 · 어부 · 나무꾼 · 사냥꾼)');
for (const t of tags) { const S = recs[t].r.snaps || []; out(`- ${t}: ${S.map((s) => `${s.day}날 ${s.pop}(빈 ${s.empty} · 굶 ${s.fd} · ${s.foodDays}일치 · 직업 ${['farmer', 'forager', 'fisher', 'lumberjack', 'hunter'].map((k) => (s.jobs || {})[k] ?? '-').join('/')})`).join(' → ')}`); }
out('');
out('## 100날 창마다 농부 · 채집 몸 깔때기(틱 · 닿음 · 일함 · 거둠 · 곳간 듦 — 몸-날 대비 %)');
for (const t of tags) for (const j of ['farmer', 'forager']) {
  const W = recs[t].r.win || []; if (!W.length) continue;
  out(`- ${t} ${j}: ${W.map((w) => { const R = w.rows[j]; return R && R.bd ? `${w.day}날 몸-날 ${R.bd} · 틱 ${pct(R.tick, R.bd)} · 닿 ${pct(R.reach, R.bd)} · 일 ${pct(R.work, R.bd)} · 거 ${pct(R.harv, R.bd)} · 듦 ${pct(R.gran, R.bd)}` : `${w.day}날 -`; }).join(' | ')}`);
}
out('');
out('## 일괄(몸 다리 밖 곳간 입구) 판 전체 — 직업: 부름 · 든 양 · 식량등가');
for (const t of tags) { const b = recs[t].r.batch || {}; out(`- ${t}: ${Object.entries(b).map(([k, v]) => `${k} ${v.n} · ${f1(v.g)} · ${f1(v.fe)}`).join(' / ') || '-'}`); }
out('');
out('## 끈 세계 하루 생산(직업 몫 · 날 평균)');
for (const t of tags) { const p = offProd(recs[t].r); out(`- ${t}: 농부(food) ${f1(p.farmer)} · 채집(식량등가) ${f1(p.forager)} · 물고기 ${f1(p.fish)} · 고기 ${f1(p.meat)} · 나무 ${f1(p.wood)} · 생산 식량등가 합 ${f1(p.feAll)}`); }
out('');
out('## 불변식(check) — 판마다');
for (const t of tags) { const b = L.check(recs[t].r); out(`- ${t}: ${b.length ? '어김 ' + b.join(' / ') : '어김 0'}`); J.runs[t].check = b; }
const txt = lines.join('\n') + '\n';
process.stdout.write(txt);
if (OUTD) { fs.mkdirSync(OUTD, { recursive: true }); fs.writeFileSync(path.join(OUTD, 'table.txt'), txt); fs.writeFileSync(path.join(OUTD, 'table.json'), JSON.stringify(J, null, 1)); }
