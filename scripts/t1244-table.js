#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1244 표 · 읽기만)
// === scripts/t1244-table.js — 몸 전부 라이브 시계 판(켬 · 끔) 10날 표 — t1243 · t1230 관찰기 JSON(+ 판 JSON)을 읽어 줄로 ===============
//   쓰는 법: node scripts/t1244-table.js <켬 판 머리> <끔 판 머리>   (머리 = `<T577_DIR>/<판>-<시드>` · 뒤에 .t1243.json · .t1230.json · .json 을 붙여 읽는다)
//   칸(10날 줄 · 날 d = 그 날 머리):
//     인구 · 몸(사람 수) = t1243 날 줄 · 출생 · 죽음 = t1230 날 줄 합(그 10날) · 굶음 = 몸 층 `died.starve` 누계(t1243 `ten`) ·
//     빈 마을 · 밭 칸 · 심은 칸(누계 · `_crop` 심은 날 훑음) · 거둔 칸(누계 `_t100HarvestN`) · 칸당 식량(t1230 밭 식량 누계 ÷ 거둔 칸 누계 — 곳간에 풀린 몫) ·
//     칸당 kg(t1243 그날 `_t368InByItem` 합 ÷ 거둔 칸 — 고르게 풀림 몫이 틱 안에서 적히고 비워져 덜 센다) ·
//     곳간 식량 일수(식량등가 ÷ 사람 — 하루 1인 1.0 = `DAILY_FOOD_CONSUMPTION`) · 첫 곳간 상한 몫(첫 레코드 가운데 상한 단위 ÷ 첫 곳간 단위) ·
//     식량 값(t1230 사람 가중 그림자 값) · 농부(econ) · 나무꾼 몫(÷ 인구) · 몸 하루(그 10날 표본 — 일 · 걸음 · 쉼 · 잠 %) · 하루 CPU 초(그 10날 가운데값 · 평균)
const fs = require('fs');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function load(head) {
  const a = rd(head + '.t1243.json'), b = rd(head + '.t1230.json'), run = rd(head + '.json');
  return { a, b, run };
}
function rows(L, U0) {
  const { a, b } = L; if (!a) return [];
  const ci = (cols, k) => cols.indexOf(k);
  const A = new Map(a.rows.map((r) => [r[0], r]));
  const Bc = b ? b.cols : [], B = new Map((b ? b.rows : []).map((r) => [r[0], r]));
  const cpu = new Map((a.cpu || []).map((r) => [r[0], r]));
  const out = [];
  for (const t of (a.ten || [])) {
    const d = t.day, r = A.get(d); if (!r) continue;
    const pop = r[1], bodies = r[10], tfe = r[3], harvN = r[4];
    let born = 0, dead = 0, ff = 0, hn = 0, kgSum = 0;
    for (let x = d - 9; x <= d; x++) { const q = B.get(x - 1); if (q) { born += q[ci(Bc, 'born')]; dead += q[ci(Bc, 'dead')]; } }   // t1230 날 줄 x−1 = 날 x 머리 앞에 끝난 하루
    for (const [x, q] of B) if (x < d) { ff += q[ci(Bc, 'fieldFood')] || 0; hn += q[ci(Bc, 'harvN')] || 0; }   // 누계(날 d 머리 앞까지)
    for (const [x, q] of A) if (x <= d) kgSum += q[5] || 0;   // t1243 kg 칸 = 그날 `_t368InByItem` 낱개 × kg(덜 센다 — 보고 §칸당)
    const q = B.get(d - 1) || B.get(d);
    const px = q && q[ci(Bc, 'pxPop')] ? q[ci(Bc, 'pxFoodW')] / q[ci(Bc, 'pxPop')] : null;
    const farmer = q ? q[ci(Bc, 'farmer')] : null, lumber = q ? q[ci(Bc, 'lumber')] : null, qpop = q ? q[ci(Bc, 'pop')] : null;
    const st = { work: 0, walk: 0, wander: 0, rest: 0, sleep: 0, eat: 0, other: 0 };
    for (let x = d - 10; x < d; x++) { const s = (a.body || {})[x]; if (s) for (const k of Object.keys(st)) st[k] += s[k] || 0; }
    const sn = Object.values(st).reduce((p, v) => p + v, 0);
    const cs = []; for (let x = d - 9; x <= d; x++) { const c = cpu.get(x); if (c && x > 1) cs.push(c[1]); }
    cs.sort((p, v) => p - v);
    out.push({ d, pop, born, dead, starve: t.starve, fdDead: t.fdDead, empty: t.empty, farm: t.farm, stand: t.stand, sown: t.sown, pick: t.pick, harvN, reaped: t.reaped,
      kgPer: harvN ? kgSum / harvN : null, foodPer: hn ? ff / hn : null, ff, hn, foodDays: pop ? tfe / pop : null,
      firstBad: U0 ? t.gran.firstBadU / U0 : null, firstLeft: U0 ? t.gran.firstU / U0 : null, px, farmer, lumberShare: qpop ? lumber / qpop : null,
      body: sn ? { work: st.work / sn, walk: st.walk / sn, rest: st.rest / sn, sleep: st.sleep / sn, wander: st.wander / sn, eat: st.eat / sn, other: st.other / sn } : null,
      cpuMed: cs.length ? cs[cs.length >> 1] : null, cpuAvg: cs.length ? cs.reduce((p, v) => p + v, 0) / cs.length : null, bodies });
  }
  return out;
}
const f1 = (x, n = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n }));
const f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const pc = (x, n = 1) => (x == null ? '—' : (100 * x).toFixed(n));
if (require.main === module) {
  const [hOn, hOff] = process.argv.slice(2);
  const ON = load(hOn), OFF = load(hOff);
  // 첫 곳간 단위 — 켬 = 곳간에 넣은 곡식 낱개 합(`_t1243Stat.seedUnits`) · 끔 = 같은 양의 `food`(켬 `seedFood` — 같은 창설 곳간을 품목만 바꿨다 · 단위 = 식량 하나)
  const st = ON.a && ON.a.stat && ON.a.stat.t1243;
  const U0on = st && st.seedUnits ? Object.values(st.seedUnits).reduce((p, v) => p + v, 0) : null;
  const U0off = st ? st.seedFood : null;
  const R1 = rows(ON, U0on), R0 = rows(OFF, U0off);
  const byD = new Map(); for (const r of R1) byD.set(r.d, [r, null]); for (const r of R0) { const e = byD.get(r.d) || [null, null]; e[1] = r; byD.set(r.d, e); }
  const ds = [...byD.keys()].sort((p, v) => p - v);
  const two = (k, fmt) => ds.map((d) => { const [x, y] = byD.get(d); return `${x ? fmt(x[k], x) : '—'} : ${y ? fmt(y[k], y) : '—'}`; });
  const cols = [
    ['인구', 'pop', f0], ['출생', 'born', f0], ['죽음(econ)', 'dead', f0], ['굶음(몸 누계)', 'starve', f0], ['식량 빚 사망(econ 누계)', 'fdDead', f0], ['빈 마을', 'empty', f0],
    ['밭 칸', 'farm', f0], ['선 작물 칸', 'stand', f0], ['심은 칸(누계)', 'sown', f0], ['거둔 칸(누계)', 'harvN', f0], ['칸당 식량(사람-날 · 누계)', 'foodPer', (x) => f1(x, 1)], ['칸당 kg(관찰기 `_t368InByItem` · 덜 셈)', 'kgPer', (x) => f1(x, 1)],
    ['곳간 식량 일수', 'foodDays', (x) => f1(x, 1)], ['첫 곳간 상한 몫 %', 'firstBad', (x) => pc(x)], ['첫 곳간 남은 몫 %', 'firstLeft', (x) => pc(x)],
    ['식량 값', 'px', (x) => f1(x, 1)], ['농부(econ)', 'farmer', f0], ['나무꾼 몫 %', 'lumberShare', (x) => pc(x)],
    ['몸 하루 일 · 걸음 · 쉼 · 잠 %', 'body', (b) => (b ? `${pc(b.work)} · ${pc(b.walk)} · ${pc(b.rest)} · ${pc(b.sleep)}` : '—')],
    ['하루 CPU 초(가운데)', 'cpuMed', (x) => f1(x, 1)], ['사람 수(몸)', 'bodies', f0],
  ];
  console.log(`| 칸(켬 : 끔) | ${ds.map((d) => '날 ' + d).join(' | ')} |`);
  console.log(`|---|${ds.map(() => '---:').join('|')}|`);
  for (const [ko, k, fmt] of cols) console.log(`| ${ko} | ${two(k, fmt).join(' | ')} |`);
  const tot = (R, k) => R.reduce((p, r) => p + (r[k] || 0), 0);
  const peak = (R, k) => R.reduce((p, r) => (r[k] != null && r[k] > p ? r[k] : p), 0);
  const cpuAll = (L) => { const c = (L.a && L.a.cpu) || []; const xs = c.filter((r) => r[0] > 1).map((r) => r[1]); return { boot: c.length ? c[0][1] : null, sum: xs.reduce((p, v) => p + v, 0), n: xs.length, avg: xs.length ? xs.reduce((p, v) => p + v, 0) / xs.length : null }; };
  const out = { on: { rows: R1, U0: U0on, born: tot(R1, 'born'), dead: tot(R1, 'dead'), firstBadPeak: peak(R1, 'firstBad'), cpu: cpuAll(ON), run: ON.run ? { pop: ON.run.eight.pop, empty: ON.run.empty, days: ON.run.days, bodyExit: ON.run.bodyExit && ON.run.bodyExit.died } : null },
    off: { rows: R0, U0: U0off, born: tot(R0, 'born'), dead: tot(R0, 'dead'), firstBadPeak: peak(R0, 'firstBad'), cpu: cpuAll(OFF), run: OFF.run ? { pop: OFF.run.eight.pop, empty: OFF.run.empty, days: OFF.run.days, bodyExit: OFF.run.bodyExit && OFF.run.bodyExit.died } : null } };
  console.log('\n' + JSON.stringify({ on: Object.assign({}, out.on, { rows: undefined }), off: Object.assign({}, out.off, { rows: undefined }) }, null, 1));
  if (process.env.T1244_TABLE_JSON) fs.writeFileSync(process.env.T1244_TABLE_JSON, JSON.stringify(out, null, 1));
}
