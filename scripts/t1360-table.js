#!/usr/bin/env node
// T1360 — 먹은 것 건강 세 손잡이 함께 켠 판 표(읽기만 · 러너 밖 · 판 JSON 에서 만든다 — 손으로 세지 않는다)
//   쓰는 법: node scripts/t1360-table.js [--json out.json] · env R(랩 판 폴더 · 기본 /dev/shm/t1360) · RS(서버 판 폴더 · 기본 /dev/shm/t1360srv)
//   랩: 팔 다섯(`계측/T1360_2026-11-17/jobs-lab.txt`) — OFF(바탕 C 세계 = 밭 + T1260 + T1298 장부 · 건강 · 요리사 다시) · ALL(+ 세 손잡이) ·
//       XM(MOVE 뺌) · XH(HEALTH 뺌 — DIVERSITY 는 HEALTH 위에서만 켜지므로 = MOVE 만) · XD(DIVERSITY 뺌)
//       칸 = farm.json `pop` · `lastStatsTot.{health, fg, happy}` · `foodImportedTot`(들여옴) · `famineDaysTot`(기근 마을-날) · 시드 짝 Δ% 가운데 · 같은 방향(가운데 부호와 같은 시드 수)/n
//   서버: `계측/T1360_2026-11-17/t1360-observe.js` 판 곁 JSON(<팔>-<시드>.obs.json) · 판 JSON(<팔>-<시드>.json)
//       칸 = 끝 날 사람 · 기근 마을-날 합 · 건강 > 0 로트 적힌 수 · 단위 · 먹은 건강 > 0 단위 · 조리식 로트 적힌 날(첫 · 끝 · 날 수) · 요리사 최대
'use strict';
const fs = require('fs'), path = require('path');
const R = process.env.R || '/dev/shm/t1360', RS = process.env.RS || '/dev/shm/t1360srv';
const SEEDS = [1020, 7, 42, 1, 2, 3, 4, 5, 6, 8];
const ARMS = ['OFF', 'ALL', 'XM', 'XH', 'XD'];
const COLS = { pop: (f) => f.pop, health: (f) => (f.lastStatsTot || {}).health, fg: (f) => (f.lastStatsTot || {}).fg, happy: (f) => (f.lastStatsTot || {}).happy, imp: (f) => f.foodImportedTot, famine: (f) => f.famineDaysTot };
const NAME = { pop: '인구', health: '건강', fg: '다양성', happy: '행복', imp: '들여옴', famine: '기근 날' };
const rd = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const q = (xs, p) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const f1 = (v) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—';
const out = { lab: { arms: {}, pairs: {} }, srv: {} };

// ── 랩
for (const a of ARMS) { out.lab.arms[a] = {}; for (const s of SEEDS) { const f = rd(`${R}/${a}-${s}/farm.json`); if (f) { const m = {}; for (const [k, g] of Object.entries(COLS)) m[k] = +g(f); out.lab.arms[a][s] = m; } } }
const PAIRS = [['셋 켬(OFF → ALL)', 'OFF', 'ALL'], ['MOVE 몫(XM → ALL)', 'XM', 'ALL'], ['HEALTH 몫(XH → ALL · HEALTH 와 그 위 DIVERSITY)', 'XH', 'ALL'], ['DIVERSITY 몫(XD → ALL)', 'XD', 'ALL'],
  ['MOVE 만(OFF → XH)', 'OFF', 'XH'], ['HEALTH + DIVERSITY(OFF → XM)', 'OFF', 'XM'], ['MOVE + HEALTH(OFF → XD)', 'OFF', 'XD']];
for (const [name, A, B] of PAIRS) {
  const rows = []; for (const s of SEEDS) { const x = out.lab.arms[A][s], y = out.lab.arms[B][s]; if (!x || !y) continue; const r = { seed: s }; for (const k of Object.keys(COLS)) r[k] = x[k] ? (y[k] / x[k] - 1) * 100 : NaN; rows.push(r); }
  const sum = {}; for (const k of Object.keys(COLS)) { const xs = rows.map((r) => r[k]); const med = q(xs, 0.5); sum[k] = { n: rows.length, med, q1: q(xs, 0.25), q3: q(xs, 0.75), up: xs.filter((v) => v > 0).length, down: xs.filter((v) => v < 0).length, same: xs.filter((v) => Number.isFinite(med) && med !== 0 && Math.sign(v) === Math.sign(med)).length }; }
  const tA = rows.reduce((t, r) => t + out.lab.arms[A][r.seed].pop, 0), tB = rows.reduce((t, r) => t + out.lab.arms[B][r.seed].pop, 0);
  out.lab.pairs[name] = { A, B, rows, sum, totA: tA, totB: tB, totPct: tA ? (tB / tA - 1) * 100 : NaN };
}
// XH 와 MOVE 만이 같은지(DIVERSITY 는 HEALTH 위에서만) — 판이 따로 없으니 XH 가 MOVE 만 판이다 · 적어 둔다

// ── 서버
const SRV = []; try { for (const fn of fs.readdirSync(RS)) { const m = /^(.+)-(\d+)\.obs\.json$/.exec(fn); if (m) SRV.push([m[1], +m[2]]); } } catch (e) {}
for (const [arm, seed] of SRV.sort()) {
  const o = rd(`${RS}/${arm}-${seed}.obs.json`); if (!o) continue;
  const days = o.days || [], snaps = o.snaps || [];
  const ck = days.filter((d) => (d.tagItems || {}).cooked_food > 0).map((d) => d.day);
  const pv = days.filter((d) => Object.keys(d.tagItems || {}).some((k) => k !== 'cooked_food')).map((d) => d.day);
  const lastSnap = snaps[snaps.length - 1] || {};
  out.srv[`${arm}-${seed}`] = { arm, seed, knobs: o.knobs, err: o.err, days: days.length ? days[days.length - 1].day : 0, pop: lastSnap.pop, health: lastSnap.health, fg: lastSnap.fg, happy: lastSnap.happy,
    famine: days.reduce((t, d) => t + (d.famine || 0), 0), villDays: days.reduce((t, d) => t + (d.vill || 0), 0),
    tag: days.reduce((t, d) => t + d.tag, 0), tagH: days.reduce((t, d) => t + d.tagH, 0), tagHU: days.reduce((t, d) => t + d.tagHU, 0), eatHU: days.reduce((t, d) => t + d.eatHU, 0), eatHS: days.reduce((t, d) => t + d.eatHS, 0),
    cookTagDays: ck.length, cookTagFirst: ck.length ? ck[0] : null, cookTagLast: ck.length ? ck[ck.length - 1] : null, presTagDays: pv.length,
    cooksMax: snaps.reduce((m, x) => Math.max(m, x.cooks || 0), 0), cooksFirstDay: (snaps.find((x) => (x.cooks || 0) > 0) || {}).day ?? null };
}

if (process.argv.includes('--json')) { const p = process.argv[process.argv.indexOf('--json') + 1]; fs.writeFileSync(p, JSON.stringify(out, null, 1)); }

// ── 찍기
console.log('# T1360 랩 800날 · 열 시드 · 시드 짝 Δ% 가운데(사분위) · 같은 방향/n');
console.log('\n팔마다 판 수: ' + ARMS.map((a) => `${a} ${Object.keys(out.lab.arms[a]).length}`).join(' · '));
for (const [name, p] of Object.entries(out.lab.pairs)) {
  if (!p.rows.length) { console.log(`\n== ${name} — 판 없음`); continue; }
  console.log(`\n== ${name} · 인구 합 ${p.totA} → ${p.totB} (${f1(p.totPct)}) · n ${p.rows.length}`);
  console.log('| 칸 | 가운데 | 사분위 | 오름 · 내림 | 같은 방향 |'); console.log('|---|---|---|---|---|');
  for (const [k, s] of Object.entries(p.sum)) console.log(`| ${NAME[k]} | ${f1(s.med)} | ${f1(s.q1)} ~ ${f1(s.q3)} | ${s.up} · ${s.down} | ${s.same}/${s.n} |`);
}
console.log('\n== 팔 평균(열 시드)');
console.log('| 팔 | 인구 합 | 건강 | 다양성 | 행복 | 들여옴 합 | 기근 날 합 |'); console.log('|---|---|---|---|---|---|---|');
for (const a of ARMS) { const xs = Object.values(out.lab.arms[a]); if (!xs.length) continue; const sm = (k) => xs.reduce((t, x) => t + x[k], 0), mn = (k) => sm(k) / xs.length;
  console.log(`| ${a} (${xs.length}) | ${sm('pop')} | ${mn('health').toFixed(3)} | ${mn('fg').toFixed(3)} | ${mn('happy').toFixed(3)} | ${sm('imp').toFixed(0)} | ${sm('famine')} |`); }
console.log('\n== 시드마다 인구');
console.log('| 팔 | ' + SEEDS.join(' | ') + ' |'); console.log('|---|' + SEEDS.map(() => '---').join('|') + '|');
for (const a of ARMS) console.log(`| ${a} | ` + SEEDS.map((s) => out.lab.arms[a][s] ? out.lab.arms[a][s].pop : '—').join(' | ') + ' |');

console.log('\n# T1360 서버 몸 판(밭 켬 · 몸 전부)');
console.log('| 판 | 날 | 사람 | 기근 마을-날 | 건강 | 다양성 | 행복 | 로트 적음 | 건강 > 0 로트(번 · 단위) | 먹은 건강 > 0(단위 · 건강 합) | 조리식 로트 적은 날(수 · 첫 · 끝) | 갈무리 로트 날 | 요리사 최대(첫 날) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const n2 = (v, d = 3) => v == null ? '—' : (+v).toFixed(d);
for (const r of Object.values(out.srv)) console.log(`| ${r.arm}-${r.seed} | ${r.days} | ${r.pop ?? '—'} | ${r.famine} / ${r.villDays} | ${n2(r.health)} | ${n2(r.fg)} | ${n2(r.happy)} | ${r.tag} | ${r.tagH} · ${n2(r.tagHU, 1)} | ${n2(r.eatHU, 1)} · ${n2(r.eatHS, 2)} | ${r.cookTagDays} · ${r.cookTagFirst ?? '—'} · ${r.cookTagLast ?? '—'} | ${r.presTagDays} | ${r.cooksMax} (${r.cooksFirstDay ?? '—'}) |${r.err ? ' ⚠ ' + String(r.err).slice(0, 60) : ''}`);

// ── 켬 기본 점검표(인계/공통.md 테스트 강화 규약 ⑤) — 이 판으로 채워지는 칸
const labN = Object.keys(out.lab.arms.ALL).length, srvN = Object.values(out.srv).filter((r) => r.knobs && r.knobs.HEALTH).length;
const CHK = [
  ['두 해 판 3시드(해마다 칸)', '✗', '랩 800날은 두 해(720날)를 넘지만 해마다 칸을 안 낸다 · 서버는 120날 — 안 채워짐'],
  ['마을별 최악 칸(평균 아님)', '✗', '이 표는 시드 합 · 사람 가중 평균 — 마을 최악 칸 없음 · 안 채워짐'],
  ['몸 세계 판(끔과 나란히)', srvN > 0 ? '부분' : '✗', `서버 몸 판 끔 · 셋 켬 짝 ${srvN} 판 — 120날이라 두 해 몸 세계 판은 아님`],
  ['끈 판 바이트 같음', '이 판 밖', '이 카드는 제품 손 0 — T1309 가 낸 끈 판 1/1(손잡이 끔 = main 그대로)'],
  ['verify 손잡이 어긋남 0', '해당 없음', '세 손잡이에 verify 갈래 없음'],
  ['옛 코드 빨강', '이 판 밖', 'T1309 하네스 ⑧ 미끼 5/5(옛 글자 사본이 문다)'],
  ['(카드 할 일 1) 랩 열 시드 짝 · 같은 방향', labN >= 10 ? '○' : `${labN}/10`, `셋 켬 ${labN}/10 시드 · 하나씩 뺀 셋`],
];
console.log('\n# 켬 기본 점검표(⑤) — 이 판으로 채워지는 칸 · 안 채워지는 칸');
console.log('| 칸 | 이 판 | 무엇으로 |'); console.log('|---|---|---|');
for (const [k, ok, w] of CHK) console.log(`| ${k} | ${ok} | ${w} |`);
