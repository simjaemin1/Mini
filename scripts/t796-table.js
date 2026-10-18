#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T796 표 · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t796-table.js — 빈 마을(해체 없이 굶어 빔)마다 굶기 전 60일 식량 흐름 · 판 넷(ⓐ main · ⓑ′ 길 훅 둘 끔 · ⓔ 길 위험만 끔 · ⓕ 습격만 끔) ===
//
// 읽는 것(`T577_DIR` · 판 이름 = `T577_TAG`): `<판>-<시드>.json`(t577 훅 — 이름 · 빈 날 · 해체 날 · 인구 줄) · `<판>-<시드>.t796.json`(t796 관찰기)
// 대상 = ⓐ 에서 끝 날 빈 마을 중 해체 표가 없는 곳(T766 §3-① "해체 없이 굶어 빔").
// 꼭대기 = 빈 날 앞 300일 안에서 인구가 가장 많던 날. 굶기 시작 = 꼭대기 뒤 처음으로 곳간 식량 < 인구(하루치)인 날. 창 = 그 앞 60일(달력 날 그대로 — 판 넷이 같은 날을 본다).
// 쓰는 법: node scripts/t796-table.js <판 디렉터리> [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
if (!DIR) { console.error('쓰는 법: node scripts/t796-table.js <판 디렉터리> [--json out.json]'); process.exit(2); }
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SEEDS = [1020, 7, 42];
const RUNS = [['ⓐ', 'a_main', '지금 main'], ['ⓑ′', 'b_hookoff', '길 훅 둘 끔'], ['ⓔ', 'e_riskoff', '길 위험만 끔'], ['ⓕ', 'f_gangoff', '습격만 끔']];
const WIN = 60;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const R = {};
for (const [k, tag] of RUNS) for (const s of SEEDS) {
  const o = rd(`${tag}-${s}.json`), ob = rd(`${tag}-${s}.t796.json`);
  if (o && ob) R[`${k}|${s}`] = { o, ob, byDay: new Map(ob.rows.map((r) => [r[0], r[1]])) };
}
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)));

// 판 하나 · 마을 하나 · 날 구간 [d0, d1) 의 흐름
function flows(run, name, d0, d1) {
  const { o, ob, byDay } = run, i = ob.names.indexOf(name);
  if (i < 0) return null;
  const fw = (r) => (r && ob.fw[r] != null ? ob.fw[r] : 0);
  const at = (d) => { for (let x = d; x >= 0; x--) { const r = byDay.get(x); if (r) return r[i]; } return null; };
  let nd = 0, pop = 0, tfe = 0, eat = 0, death = 0, kprod = 0, prodm = 0, risk = 0, jobs = 0, sur = 0;
  for (let d = d0; d < d1; d++) { const r = byDay.get(d); if (!r) continue; const v = r[i]; nd++;
    pop += v[0]; tfe += v[1]; eat += v[2]; death += v[3]; sur += v[4]; kprod += v[5] || 0; prodm += v[6]; risk += v[7]; jobs += v[16].reduce((a, x) => a + x, 0); }
  if (!nd) return null;
  const A = at(d0 - 1) || at(d0), Z = at(d1 - 1);
  const dc = (j) => (Z && A ? Z[j] - A[j] : 0);
  // 교역 기록 — 이 마을로 든 식량(남의 캐러밴이 팔고 간 것 · 내 캐러밴이 사 온 것) · 나간 식량
  let inSell = 0, inBuy = 0, outFood = 0, tIn = 0, tOut = 0, raidedT = 0;
  for (const t of ob.trades) { if (t[0] < d0 || t[0] >= d1) continue;
    if (t[2] === i) { tIn++; inSell += (t[4] || 0) * fw(t[3]); }
    if (t[1] === i) { tOut++; inBuy += (t[6] || 0) * fw(t[5]); outFood += (t[4] || 0) * fw(t[3]); if (t[7]) raidedT++; } }
  // 띄운 캐러밴 — 길 위험 > 0 몫 · 이 마을로 오는 캐러밴
  let sent = 0, sentRisk = 0, toMe = 0, toMeRisk = 0, sentFood = 0;
  for (const c of ob.caravans) { if (c[0] < d0 || c[0] >= d1) continue;
    if (c[1] === i) { sent++; if (c[6] > 0) sentRisk++; sentFood += (c[4] || 0) * fw(c[3]); }
    if (c[2] === i) { toMe++; if (c[6] > 0) toMeRisk++; } }
  return { nd, pop: pop / nd, tfe: tfe / nd, eatPC: pop ? eat / pop : 0, death, sur: sur / nd, kprod: kprod / nd, prodm: prodm / nd, risk: risk / nd, jobs: jobs / nd,
    imp: dc(9), sentN: dc(10), raided: dc(12), lost: dc(13), killed: dc(14),
    inSell, inBuy, outFood, tIn, tOut, raidedT, sent, sentRisk, toMe, toMeRisk, sentFood, popEnd: Z ? Z[0] : null, popStart: A ? A[0] : null };
}

// ── 대상 고르기 ──
const T = [];
for (const s of SEEDS) {
  const A = R[`ⓐ|${s}`]; if (!A) continue;
  const o = A.o, last = o.rows[o.rows.length - 1][1];
  o.names.forEach((n, i) => {
    if (last[i] !== 0 || o.bdtDay[i] != null || o.emptyDay[i] == null) return;
    const ed = o.emptyDay[i];
    let best = -1, bd = null;
    for (const r of o.rows) { if (r[0] < ed - 300 || r[0] >= ed) continue; if (r[1][i] >= best) { best = r[1][i]; bd = r[0]; } }
    // 곳간 바닥 날 = 꼭대기 뒤 처음으로 곳간 식량 < 인구(하루치) — 굶기 시작(관찰기 줄 · 없으면 꼭대기 날)
    let floor = null; for (const r of A.ob.rows) { if (r[0] <= bd || r[0] >= ed) continue; const v = r[1][A.ob.names.indexOf(n)]; if (v[1] < v[0]) { floor = r[0]; break; } }
    T.push({ seed: s, name: n, empty: ed, peakDay: bd, peak: best, onset: floor != null ? floor : bd });
  });
}

console.log(`\n### 대상 — ⓐ 에서 해체 없이 굶어 빈 마을(${T.length}곳) · 다른 판에서 그 마을\n`);
console.log('| 시드 | 마을 | ⓐ 빈 날 | ⓐ 꼭대기(날 · 명) | ⓐ 굶기 시작(곳간 바닥) | ⓑ′ 끝 인구(빈 날) | ⓔ 끝 인구(빈 날) | ⓕ 끝 인구(빈 날) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const t of T) {
  const cell = (k) => { const r = R[`${k}|${t.seed}`]; if (!r) return '·'; const i = r.o.names.indexOf(t.name), n = r.o.rows[r.o.rows.length - 1][1][i];
    return n === 0 ? `**0**(${r.o.emptyDay[i]}${r.o.bdtDay[i] != null ? ' h' : ''})` : String(n); };
  console.log(`| ${t.seed} | ${t.name} | ${t.empty} | ${t.peakDay} · ${t.peak} | ${t.onset} | ${cell('ⓑ′')} | ${cell('ⓔ')} | ${cell('ⓕ')} |`);
}

// ── 궤적 — 대상 마을마다 판 넷의 인구 · 식량 부양력 · 곳간(겨울 바닥) ──
console.log('\n### 궤적 — 대상 마을 · 판 넷(인구 · 괄호 = 식량 부양력 K)\n');
const DAYS = [100, 200, 300, 365, 400, 500, 800];
console.log(`| 시드 | 마을 | 판 | ${DAYS.map((d) => d + '일').join(' | ')} | 꼭대기(날) | 식량 일꾼 몫(꼭대기) | 받은 식량 누계(꼭대기) |`);
console.log(`|---|---|---|${DAYS.map(() => '---').join('|')}|---|---|---|`);
const TRAJ = [];
for (const t of T) for (const [k] of RUNS) {
  const r = R[`${k}|${t.seed}`]; if (!r) continue; const i = r.ob.names.indexOf(t.name);
  const at = (d) => { for (let x = d; x >= 0; x--) { const q = r.byDay.get(x); if (q) return q[i]; } return null; };
  let pk = -1, pd = 0; for (const q of r.ob.rows) if (q[1][i][0] > pk) { pk = q[1][i][0]; pd = q[0]; }
  const P = at(pd), share = P && P[0] ? P[16].reduce((a, x) => a + x, 0) / P[0] : 0;
  const cells = DAYS.map((d) => { const v = at(d); return v ? `${v[0]}(${v[5] != null ? v[5].toFixed(0) : '—'})` : '—'; });
  TRAJ.push({ seed: t.seed, name: t.name, k, pop: DAYS.map((d) => { const v = at(d); return v ? v[0] : null; }), peak: pk, peakDay: pd, share, imp: P ? P[9] : 0 });
  console.log(`| ${t.seed} | ${t.name} | ${k} | ${cells.join(' | ')} | ${pk}(${pd}) | ${(100 * share).toFixed(0)}% | ${P ? f1(P[9]) : '—'} |`);
}

// ── 굶기 전 60일 — 마을마다 판 넷 ──
const COLS = [['인구', (f) => f1(f.pop)], ['곳간 식량', (f) => f1(f.tfe)], ['1인 먹음/일', (f) => f.eatPC.toFixed(2)], ['죽음', (f) => f.death],
  ['식량 일꾼', (f) => f1(f.jobs)], ['부양력 K(식량)', (f) => f1(f.kprod)], ['받은 식량(귀환)', (f) => f1(f.imp)],
  ['교역 듦(남이 팜 · 내가 사 옴)', (f) => `${f1(f.inSell)} · ${f1(f.inBuy)}`], ['나간 식량', (f) => f1(f.outFood)],
  ['띄운 캐러밴(위험 길)', (f) => `${f.sent}(${f.sentRisk})`], ['오는 캐러밴(위험 길)', (f) => `${f.toMe}(${f.toMeRisk})`],
  ['습격 · 잃은 짐 · 행상 피살', (f) => `${f.raided} · ${f1(f.lost)} · ${f.killed}`], ['위험 학습', (f) => f.risk.toFixed(2)]];
console.log(`\n### 굶기 전 ${WIN}일 — 마을마다 판 넷(같은 달력 창 · 흐름은 창 합 · 인구 · 곳간 · 일꾼 · K · 위험은 창 평균)\n`);
const AGG = {};
for (const t of T) {
  const d0 = t.onset - WIN, d1 = t.onset;
  console.log(`\n**${t.seed} ${t.name}** — 창 ${d0}~${d1 - 1}(ⓐ 빈 날 ${t.empty})\n`);
  console.log(`| 판 | ${COLS.map((c) => c[0]).join(' | ')} |`);
  console.log(`|---|${COLS.map(() => '---').join('|')}|`);
  for (const [k] of RUNS) {
    const r = R[`${k}|${t.seed}`]; if (!r) continue;
    const f = flows(r, t.name, d0, d1); if (!f) continue;
    (AGG[k] || (AGG[k] = [])).push(f);
    console.log(`| ${k} | ${COLS.map((c) => c[1](f)).join(' | ')} |`);
  }
}
console.log(`\n### 합(대상 ${T.length}곳 · 굶기 전 ${WIN}일)\n`);
const sum = (a, g) => a.reduce((x, f) => x + g(f), 0);
console.log('| 판 | 인구(평균 합) | 곳간 식량(평균 합) | 1인 먹음/일 | 죽음 | 식량 일꾼 | 받은 식량 | 교역 듦(남이 팜 · 내가 사 옴) | 나간 식량 | 띄운 캐러밴(위험 길) | 오는 캐러밴(위험 길) | 습격 · 잃은 짐 · 피살 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, , lab] of RUNS) { const a = AGG[k]; if (!a) continue;
  const pop = sum(a, (f) => f.pop), eat = sum(a, (f) => f.eatPC * f.pop);
  console.log(`| ${k} ${lab} | ${f1(pop)} | ${f1(sum(a, (f) => f.tfe))} | ${(pop ? eat / pop : 0).toFixed(2)} | ${sum(a, (f) => f.death)} | ${f1(sum(a, (f) => f.jobs))} | ${f1(sum(a, (f) => f.imp))}`
    + ` | ${f1(sum(a, (f) => f.inSell))} · ${f1(sum(a, (f) => f.inBuy))} | ${f1(sum(a, (f) => f.outFood))} | ${sum(a, (f) => f.sent)}(${sum(a, (f) => f.sentRisk)}) | ${sum(a, (f) => f.toMe)}(${sum(a, (f) => f.toMeRisk)})`
    + ` | ${sum(a, (f) => f.raided)} · ${f1(sum(a, (f) => f.lost))} · ${sum(a, (f) => f.killed)} |`); }

// ── 첫해(0~365) — 세계가 갈리는 자리(T766 §3-①) ──
console.log('\n### 첫해(0~365일) — 대상 마을 합 · 판 넷\n');
console.log('| 판 | 365일 인구 합 | 곳간 식량(365일) | 받은 식량 | 교역 듦(남이 팜 · 내가 사 옴) | 나간 식량 | 띄운 캐러밴(위험 길) | 오는 캐러밴(위험 길) | 습격 · 잃은 짐 · 피살 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const Y1 = {};
for (const [k, , lab] of RUNS) {
  const a = T.map((t) => { const r = R[`${k}|${t.seed}`]; return r ? flows(r, t.name, 1, 366) : null; }).filter(Boolean);
  if (!a.length) continue; Y1[k] = a;
  console.log(`| ${k} ${lab} | ${sum(a, (f) => f.popEnd || 0)} | — | ${f1(sum(a, (f) => f.imp))} | ${f1(sum(a, (f) => f.inSell))} · ${f1(sum(a, (f) => f.inBuy))} | ${f1(sum(a, (f) => f.outFood))}`
    + ` | ${sum(a, (f) => f.sent)}(${sum(a, (f) => f.sentRisk)}) | ${sum(a, (f) => f.toMe)}(${sum(a, (f) => f.toMeRisk)}) | ${sum(a, (f) => f.raided)} · ${f1(sum(a, (f) => f.lost))} · ${sum(a, (f) => f.killed)} |`);
}

// ── 판 전체 — 빈 마을 · 해체 · 캐러밴 · 위험 길 몫 ──
console.log('\n### 판 전체(3시드)\n');
console.log('| 판 | 빈 마을(시드별) | 그중 해체 없이 굶음 | 해체 | 띄운 캐러밴 | 그중 위험 길 | 습격당한 캐러밴 | 잃은 짐 | 행상 피살 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const WHOLE = {};
for (const [k, , lab] of RUNS) {
  const per = SEEDS.map((s) => R[`${k}|${s}`]).filter(Boolean); if (!per.length) continue;
  let emp = [], starve = 0, dis = 0, car = 0, carR = 0, raid = 0, lost = 0, kill = 0;
  for (const r of per) { const o = r.o, last = o.rows[o.rows.length - 1][1];
    emp.push(o.empty); dis += o.dissolved; starve += o.names.filter((n, i) => last[i] === 0 && o.bdtDay[i] == null && o.emptyDay[i] != null).length;
    car += r.ob.caravans.length; carR += r.ob.caravans.filter((c) => c[6] > 0).length;
    const L = r.ob.rows[r.ob.rows.length - 1][1]; for (const v of L) { raid += v[12]; lost += v[13]; kill += v[14]; } }
  WHOLE[k] = { emp, starve, dis, car, carR, raid, lost, kill };
  console.log(`| ${k} ${lab} | ${emp.join(' / ')} (${emp.reduce((a, x) => a + x, 0)}) | ${starve} | ${dis} | ${car} | ${carR}(${car ? (100 * carR / car).toFixed(1) : 0}%) | ${raid} | ${f1(lost)} | ${kill} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ dir: DIR, targets: T, traj: TRAJ, agg: AGG, year1: Y1, whole: WHOLE }, null, 1));
