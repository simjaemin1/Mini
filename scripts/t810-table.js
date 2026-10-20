#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T810 표 · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t810-table.js — 습격의 간접 몫: 대상 마을로 오는 캐러밴을 누가 · 왜 덜 보냈나 · 갈래 셋(장물 · 피해 학습 · 행상 피살) =========
//   쓰는 법: node scripts/t810-table.js <판 뿌리>   (뿌리 아래 run-a · run-g · run-loot0 · run-learn0 · run-keep · run-skip1 / base-<시드>.json · base-<시드>.t810.json)
//            [--json out.json]
//   대상 = T796 의 대상 8곳(T796 보고 §1 — 시드마다 이름) · 덧붙여 이 판 ⓐ 에서 해체 없이 굶어 빈 마을.
//   창 = 첫해 [1, 365) · 절벽 [300, 400) — T796 이 오는 캐러밴 차를 잰 두 창.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOTD = process.argv[2];
if (!ROOTD) { console.error('쓰는 법: node scripts/t810-table.js <판 뿌리> [--json out.json]'); process.exit(2); }
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SEEDS = [1020, 7, 42];
const ARMS = [['ⓐ', 'a', '지금 main'], ['ⓖ', 'g', '갱 전투만 끔'], ['㉠', 'loot0', '장물 0'], ['㉡', 'learn0', '피해 학습 0'], ['㉢', 'keep', '행상 피살만 0'], ['ⓩ', 'skip1', '첫 습격 하나만 건너뜀(대조)']];
const T796 = { 1020: ['농촌13', '농촌16', '농촌18'], 7: ['농촌6', '농촌7', '농촌15', '농촌18'], 42: ['농촌10'] };
const WINS = [['첫해', 1, 365], ['절벽', 300, 400]];
const BIN = 10;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const R = {};
for (const [k, tag] of ARMS) for (const s of SEEDS) {
  const d = path.join(ROOTD, 'run-' + tag), o = rd(path.join(d, `base-${s}.json`)), ob = rd(path.join(d, `base-${s}.t810.json`));
  if (o && ob) R[k + '|' + s] = { o, ob, byDay: new Map(ob.rows.map((r) => [r[0], r[1]])) };
}
const OUT = { arms: Object.keys(R), tables: {} };
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)));
const pc = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '—');
const sgn = (x) => (x > 0 ? '+' : '') + f1(x);
const have = (k) => SEEDS.every((s) => R[k + '|' + s]);

// ── 대상 ────────────────────────────────────────────────────────────────────
const TG = {};   // 시드 → Set(이름)
for (const s of SEEDS) TG[s] = new Set(T796[s]);
const NEW = [];
for (const s of SEEDS) { const A = R['ⓐ|' + s]; if (!A) continue; const o = A.o, last = o.rows[o.rows.length - 1][1];
  o.names.forEach((n, i) => { if (last[i] === 0 && o.bdtDay[i] == null && o.emptyDay[i] != null) NEW.push([s, n, o.emptyDay[i]]); }); }
console.log('\n### 대상\n');
console.log('* T796 대상 8곳: ' + SEEDS.map((s) => `${s} ${T796[s].join(' · ')}`).join(' / '));
console.log('* 이 판 ⓐ 에서 해체 없이 굶어 빈 마을: ' + (NEW.length ? NEW.map((x) => `${x[0]} ${x[1]}(${x[2]})`).join(' · ') : '없음'));
console.log('\n| 시드 | 마을 | ' + ARMS.filter(([k]) => have(k)).map(([k, , ko]) => `${k} ${ko} 끝 인구(빈 날)`).join(' | ') + ' |');
console.log('|---|---|' + ARMS.filter(([k]) => have(k)).map(() => '---').join('|') + '|');
for (const s of SEEDS) for (const n of T796[s]) {
  const cells = ARMS.filter(([k]) => have(k)).map(([k]) => { const r = R[k + '|' + s]; const i = r.o.names.indexOf(n); const p = r.o.rows[r.o.rows.length - 1][1][i];
    return p === 0 ? `**0**(${r.o.emptyDay[i]}${r.o.bdtDay[i] != null ? ' h' : ''})` : String(p); });
  console.log(`| ${s} | ${n} | ${cells.join(' | ')} |`);
}

// ── 판 하나 · 창 하나 — 대상으로 오는 캐러밴 · 출발 마을마다 ───────────────────────────
function arrivals(run, s, d0, d1) {   // 출발 마을 번호 → [대상으로 띄운 수 · 전부 띄운 수]
  const ob = run.ob, tg = new Set([...TG[s]].map((n) => ob.names.indexOf(n)));
  const m = new Map();
  for (const c of ob.caravans) { if (c[0] < d0 || c[0] >= d1) continue; const e = m.get(c[1]) || [0, 0]; e[1]++; if (tg.has(c[2])) e[0]++; m.set(c[1], e); }
  return { m, tg };
}
function origStat(run, i, d0, d1) {   // 출발 마을 하나의 창 평균
  const ob = run.ob; let nd = 0, pop = 0, tfe = 0, war = 0, idle = 0, risk = 0;
  for (let d = d0; d < d1; d++) { const r = run.byDay.get(d); if (!r || !r[i]) continue; const v = r[i]; nd++; pop += v[0]; tfe += v[1]; risk += v[7]; war += v[17] || 0; idle += v[19] || 0; }
  const A = run.byDay.get(d0) || run.byDay.get(d0 + 1), Z = run.byDay.get(d1 - 1);
  const dc = (j) => (A && Z && A[i] && Z[i] ? Z[i][j] - A[i][j] : 0);
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let b = (d0 / BIN) | 0; b < Math.ceil(d1 / BIN); b++) { const x = ob.orig[i + '|' + b]; if (x) x.forEach((y, j) => (o[j] += y)); }
  return { nd, pop: nd ? pop / nd : 0, tfe: nd ? tfe / nd : 0, war: nd ? war / nd : 0, idle: nd ? idle / nd : 0, risk: nd ? risk / nd : 0,
    raided: dc(12), lost: dc(13), killed: dc(14), repelled: dc(15), sent: dc(10), cyc: o[0], spare: o[0] ? o[2] / o[0] : 0, trading: o[0] ? o[3] / o[0] : 0,
    nolp: o[4], nocand: o[5], nobest: o[6], gateB: o[7], gateP: o[8] };
}
function evStat(run, i, tg, d0, d1) {   // 출발 i → 대상 묶음 결정
  const ob = run.ob; let n = 0, pos = 0, loss = 0, risk = 0, mx = 0, nb = 0;
  for (const t of tg) for (let b = (d0 / BIN) | 0; b < Math.ceil(d1 / BIN); b++) { const e = ob.ev[i + '|' + t + '|' + b]; if (!e) continue; n += e[0]; pos += e[1]; loss += e[3]; risk += e[4]; if (e[2] > -1e17) { mx += e[2]; nb++; } }
  let gp = 0, gb = 0;
  for (const t of tg) for (let b = (d0 / BIN) | 0; b < Math.ceil(d1 / BIN); b++) { const g = ob.gate[i + '|' + t + '|' + b]; if (g) { gp += g[0]; gb += g[1]; } }
  return { n, pos, loss: n ? loss / n : 0, risk: n ? risk / n : 0, mx: nb ? mx / nb : 0, gp, gb };
}

for (const [wn, d0, d1] of WINS) {
  console.log(`\n## 창 ${wn} [${d0}, ${d1})\n`);
  // ① 판마다 합
  console.log('| 판 | 대상으로 오는 캐러밴 | 띄운 캐러밴(판 전체) | 그중 대상 몫 | 대상행 짐(평균) · 호위(평균) | 습격(판 전체) | 행상 피살 | 단 수(창 평균) · 단원 | 결정 중 대상 길 위험>0 몫 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  const sums = {};
  for (const [k, , ko] of ARMS) { if (!have(k)) continue;
    let toT = 0, all = 0, raid = 0, kill = 0, gn = 0, gm = 0, gd = 0, evn = 0, evr = 0, cg = 0, ce = 0;
    for (const s of SEEDS) { const run = R[k + '|' + s], { m, tg } = arrivals(run, s, d0, d1);
      for (const [, e] of m) { toT += e[0]; all += e[1]; }
      for (const c of run.ob.caravans) if (c[0] >= d0 && c[0] < d1 && tg.has(c[2])) { cg += c[4]; ce += c[5]; }
      for (let i = 0; i < run.ob.names.length; i++) { const st = origStat(run, i, d0, d1); raid += st.raided; kill += st.killed; const es = evStat(run, i, tg, d0, d1); evn += es.n; evr += es.risk * es.n; }
      for (const g of run.ob.gangs) if (g[0] >= d0 && g[0] < d1) { gn += g[1]; gm += g[2]; gd++; } }
    sums[k] = { toT, all };
    console.log(`| ${k} ${ko} | ${toT} | ${all} | ${pc(toT, all)} | ${f1(toT ? cg / toT : 0)} · ${(toT ? ce / toT : 0).toFixed(2)} | ${raid} | ${kill} | ${f1(gd ? gn / gd : 0)} · ${f1(gd ? gm / gd : 0)} | ${pc(evr, evn)} |`);
  }
  OUT.tables[wn + ':sum'] = sums;
  // ② 출발 마을마다 — ⓐ ↔ ⓖ 차가 큰 순
  if (!have('ⓐ') || !have('ⓖ')) continue;
  const rows = [];
  for (const s of SEEDS) { const A = R['ⓐ|' + s], G = R['ⓖ|' + s]; const aA = arrivals(A, s, d0, d1), aG = arrivals(G, s, d0, d1);
    for (let i = 0; i < A.ob.names.length; i++) {
      const ea = aA.m.get(i) || [0, 0], eg = aG.m.get(i) || [0, 0];
      if (!ea[0] && !eg[0]) continue;
      rows.push({ s, i, name: A.ob.names[i], a: ea, g: eg, sa: origStat(A, i, d0, d1), sg: origStat(G, i, d0, d1), va: evStat(A, i, aA.tg, d0, d1), vg: evStat(G, i, aG.tg, d0, d1) });
    } }
  rows.sort((x, y) => (y.g[0] - y.a[0]) - (x.g[0] - x.a[0]));
  const tot = rows.reduce((z, r) => z + (r.g[0] - r.a[0]), 0);
  console.log(`\n### 출발 마을 — 대상으로 보낸 수 ⓖ − ⓐ 큰 순(합 ${sgn(tot)} · 보낸 마을 ${rows.length})\n`);
  console.log('| 시드 · 출발 | 대상으로 ⓐ → ⓖ | 전부 띄움 ⓐ → ⓖ | 대상 몫 ⓐ → ⓖ | 인구 ⓐ → ⓖ | 곳간 식량 ⓐ → ⓖ | 전사 ⓐ → ⓖ | 제 캐러밴 습격 · 행상 피살(ⓐ) | 막힘 ⓐ(잉여 없음 · 이익 길 없음 · 관문) → ⓖ | 대상 길 결정 수 · 이익>0 ⓐ → ⓖ | 대상 길 기대손실 · 위험>0 ⓐ → ⓖ |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.slice(0, 14)) {
    const A = r.sa, G = r.sg, va = r.va, vg = r.vg;
    console.log(`| ${r.s} ${r.name} | ${r.a[0]} → ${r.g[0]} | ${r.a[1]} → ${r.g[1]} | ${pc(r.a[0], r.a[1])} → ${pc(r.g[0], r.g[1])} | ${f1(A.pop)} → ${f1(G.pop)} | ${f1(A.tfe)} → ${f1(G.tfe)} | ${f1(A.war)} → ${f1(G.war)} | ${A.raided} · ${A.killed}`
      + ` | ${A.nocand}·${A.nobest}·${A.gateB} → ${G.nocand}·${G.nobest}·${G.gateB} | ${va.n} · ${pc(va.pos, va.n)} → ${vg.n} · ${pc(vg.pos, vg.n)} | ${va.loss.toFixed(3)} · ${pc(va.risk * va.n, va.n)} → ${vg.loss.toFixed(3)} · ${pc(vg.risk * vg.n, vg.n)} |`);
  }
  // ③ 가름 — 덜 보낸 몫 = 덜 띄움(부피) + 몫이 바뀜(방향)
  let dVol = 0, dShare = 0;
  for (const r of rows) { const sa = r.a[1] ? r.a[0] / r.a[1] : 0, sg = r.g[1] ? r.g[0] / r.g[1] : 0; dVol += (r.g[1] - r.a[1]) * sa; dShare += r.g[1] * (sg - sa); }
  console.log(`\n* 가름(대상으로 보내던 마을 ${rows.length}곳): ⓖ − ⓐ = ${sgn(tot)} = 덜 띄움(부피 · ⓐ 몫으로) ${sgn(dVol)} + 대상 몫 차(방향 · ⓖ 부피로) ${sgn(dShare)}`);
  OUT.tables[wn + ':orig'] = rows.map((r) => ({ s: r.s, name: r.name, a: r.a, g: r.g, sa: r.sa, sg: r.sg, va: r.va, vg: r.vg }));
  OUT.tables[wn + ':split'] = { tot, dVol, dShare };
  // ④ 출발 마을 묶음 합 — 막힘 사유 · 결정 입력(대상 길)
  const agg = (k) => { const z = { cyc: 0, nolp: 0, nocand: 0, nobest: 0, gateB: 0, gateP: 0, pop: 0, tfe: 0, war: 0, raided: 0, killed: 0, lost: 0, evn: 0, evpos: 0, evloss: 0, evrisk: 0, gp: 0, gb: 0, spare: 0 };
    for (const r of rows) { const st = k === 'ⓐ' ? r.sa : r.sg, ev = k === 'ⓐ' ? r.va : r.vg;
      for (const f of ['cyc', 'nolp', 'nocand', 'nobest', 'gateB', 'gateP', 'raided', 'killed', 'lost']) z[f] += st[f];
      z.pop += st.pop; z.tfe += st.tfe; z.war += st.war; z.spare += st.spare * st.cyc; z.evn += ev.n; z.evpos += ev.pos; z.evloss += ev.loss * ev.n; z.evrisk += ev.risk * ev.n; z.gp += ev.gp; z.gb += ev.gb; }
    return z; };
  const za = agg('ⓐ'), zg = agg('ⓖ');
  console.log('\n| 묶음(대상으로 보내던 출발 마을) | 인구 합(창 평균) | 곳간 식량 합 | 전사 합 | 결정 날 | 막힘: 생산자 없음 · 잉여 없음 · 이익 길 없음 · 관문 | 관문 통과 | 대상 길 결정 · 이익>0 | 대상 길 기대손실 평균 · 위험>0 | 1등이 대상: 통과 · 막힘 | 제 캐러밴 습격 · 행상 피살 · 잃은 짐 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, z] of [['ⓐ', za], ['ⓖ', zg]]) console.log(`| ${k} | ${f1(z.pop)} | ${f1(z.tfe)} | ${f1(z.war)} | ${z.cyc} | ${z.nolp} · ${z.nocand} · ${z.nobest} · ${z.gateB} | ${z.gateP} | ${z.evn} · ${pc(z.evpos, z.evn)} | ${z.evn ? (z.evloss / z.evn).toFixed(3) : '—'} · ${pc(z.evrisk, z.evn)} | ${z.gp} · ${z.gb} | ${z.raided} · ${z.killed} · ${f1(z.lost)} |`);
  OUT.tables[wn + ':agg'] = { a: za, g: zg };
}

// ── 대상 마을 자신 — 날마다 합(인구 · 곳간 식량 · 제 캐러밴이 사 온 식량 누계 `foodImported`) · 시드마다 오는 캐러밴 ──
{
  const DAYS = [60, 120, 180, 240, 300, 365, 400];
  console.log('\n## 대상 8곳 자신 — 날마다 합\n');
  console.log('| 판 | 인구 ' + DAYS.join(' → ') + ' | 곳간 식량 ' + DAYS.join(' → ') + ' | 사 온 식량 누계 ' + DAYS.join(' → ') + ' | 오는 캐러밴 첫해(1020 · 7 · 42) | 절벽 창(1020 · 7 · 42) |');
  console.log('|---|---|---|---|---|---|');
  OUT.tables.self = {};
  for (const [k, , ko] of ARMS) { if (!have(k)) continue;
    const t = DAYS.map(() => [0, 0, 0]); const fy = [], cl = [];
    for (const s of SEEDS) { const run = R[k + '|' + s], ob = run.ob, tg = T796[s].map((n) => ob.names.indexOf(n));
      DAYS.forEach((d, j) => { const r = run.byDay.get(d); if (r) for (const i of tg) { t[j][0] += r[i][0]; t[j][1] += r[i][1]; t[j][2] += r[i][9]; } });
      const T = new Set(tg); let a1 = 0, a2 = 0; for (const c of ob.caravans) { if (!T.has(c[2])) continue; if (c[0] >= 1 && c[0] < 365) a1++; if (c[0] >= 300 && c[0] < 400) a2++; } fy.push(a1); cl.push(a2); }
    OUT.tables.self[k] = { t, fy, cl };
    console.log(`| ${k} ${ko} | ${t.map((x) => x[0]).join(' → ')} | ${t.map((x) => f1(x[1])).join(' → ')} | ${t.map((x) => f1(x[2])).join(' → ')} | ${fy.join(' · ')} (${fy.reduce((a, b) => a + b, 0)}) | ${cl.join(' · ')} (${cl.reduce((a, b) => a + b, 0)}) |`);
  }
}

// ── 판 끝 · 판 전체 ───────────────────────────────────────────────────────────
console.log('\n## 판 끝(800일) — 판 전체\n');
console.log('| 판 | 빈 마을(시드별) | 해체 없이 굶어 빔 | T796 대상 800일 산 | 습격당한 캐러밴 | 행상 피살 | 이 판이 살린 행상(㉢) | 장물 문 부름 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [k, , ko] of ARMS) { if (!have(k)) continue;
  const em = [], st = []; let alive = 0, raid = 0, kill = 0, keep = 0, lc = 0;
  for (const s of SEEDS) { const r = R[k + '|' + s], o = r.o, last = o.rows[o.rows.length - 1][1];
    em.push(o.empty); st.push(o.names.filter((n, i) => last[i] === 0 && o.bdtDay[i] == null).length);
    for (const n of T796[s]) if (last[o.names.indexOf(n)] > 0) alive++;
    const Z = r.ob.rows[r.ob.rows.length - 1][1]; for (const v of Z) { raid += v[12]; kill += v[14]; }
    keep += r.ob.keep || 0; lc += r.ob.lootCalls || 0; }
  console.log(`| ${k} ${ko} | ${em.join(' / ')} (${em.reduce((a, b) => a + b, 0)}) | ${st.reduce((a, b) => a + b, 0)} | ${alive}/8 | ${raid} | ${kill} | ${keep} | ${lc} |`);
}
// ── 관찰기 자기 확인 ──
console.log('\n* 관찰기: ' + Object.keys(R).map((k) => `${k} 끼움 ${R[k].ob.inj}${R[k].ob.injMiss.length ? ' ✗' + JSON.stringify(R[k].ob.injMiss) : ''} · 훅 감쌈 ${R[k].ob.armed}`).join(' / '));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(OUT));
