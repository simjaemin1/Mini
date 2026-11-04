#!/usr/bin/env node
// === scripts/t1144-sum.js — T1144 판 표(러너 밖 · 계측기) — `t646-anatomy table` 의 table.json 을 사람당 µs 표로 ============================
//   T1140 자 그대로(`scripts/t1140-sum.js` 의 칸 · 같은 환산) + 생활 층 안 갈래(포함 표본):
//     밭 칸(`_lifeNextFarmCell`) · 어부 던짐(`_t340Try`) · 종 뽑기(`freshfish.pick`) · 낱값(`_t1128HandUnits` + `econUnitsOf` 중 큰 쪽 — 같은 사슬이라 더하지 않는다) · `require()`
//   팔 = tag 머리 글자(A 끔 · B `T1144_LIFE_EVENT=1` · C B + `T1140_LIFE_REQ=1`) — 팔마다 판 중앙 · 범위.
//   대조 보정 = npcStep ÷ 대조(손 안 댄 구간 합 — T1140 자) × A 팔 대조 중앙(= A 팔 상자로 옮겨 적은 값).
// 실행: T646_DIR=<판 폴더> [T1144_ARMS=A,B] node scripts/t1144-sum.js [out.json] [out.txt] [out.md]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.env.T646_DIR || '/tmp/t646';
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'table.json'), 'utf8'));
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
const r3 = (x) => (x == null ? null : +x.toFixed(3));
const CTRL = ['몹 AI', '델타·방송(AOI)', '꼬리(어로·저장·쓰러짐·계측)', '계단·낙하·게이지·HP', '청크', '공간 색인·입력 시한'];   // T1140 대조 구간
const rows = [];
for (const r of T.runs) {
  const L = r.lines || {}, inc = Object.fromEntries((L.incl || []).map(([k, n]) => [k, n])), ns = L.stepSamples || 0;
  const u = (k) => (ns && inc[k] ? L.stepUs * inc[k] / ns : 0);
  const reqN = Object.entries(inc).filter(([k]) => /^(require|wrapModuleLoad)@/.test(k)).reduce((m, [, n]) => Math.max(m, n), 0);
  const ctrl = CTRL.reduce((t, k) => t + (r.segUs[k] || 0), 0);
  rows.push({ tag: r.tag, arm: r.tag.replace(/\d+$/, ''), ref: r.ref, W: r.W, pop: r.pop, ticks: r.ticks, totUs: r.totUs,
    decGate: r.segUs['결정 문(순회)'], moveGate: r.segUs['이동 문(순회)'],
    npcStep: r3(L.stepUs), self: r3(L.selfUs), dec: r3(u('decideNpcBehavior@zone.js')), life: r3(u('npcLifeTick@villages.js')),
    farm: r3(u('_lifeNextFarmCell@villages.js')), fish: r3(u('_t340Try@villages.js')), pick: r3(u('pick@freshfish.js')),
    unit: r3(Math.max(u('_t1128HandUnits@villages.js'), u('econUnitsOf@kcal.js'))), req: r3(ns ? L.stepUs * reqN / ns : 0),
    path: r3(u('computeNpcPath@zone.js')),
    p50: r.tq ? r3(r.tq.p50) : null, p99: r.tq ? r3(r.tq.p99) : null,
    ctrl: r3(ctrl), ratio: r3(L.stepUs / ctrl), lifeRatio: r3(u('npcLifeTick@villages.js') / ctrl), samples: ns });
}
const COLS = ['npcStep', 'totUs', 'decGate', 'dec', 'life', 'farm', 'fish', 'pick', 'unit', 'req', 'path', 'self', 'p50', 'p99', 'ctrl', 'ratio', 'lifeRatio'];
const arms = {};
for (const x of rows) { const k = x.arm + '|' + x.W; (arms[k] = arms[k] || []).push(x); }
const armRows = Object.entries(arms).map(([k, xs]) => { const [arm, W] = k.split('|'); const o = { arm, W, n: xs.length, tags: xs.map((x) => x.tag) };
  for (const c of COLS) { const v = xs.map((x) => x[c]); o[c] = r3(med(v)); o[c + 'Lo'] = r3(Math.min(...v.filter((y) => y != null))); o[c + 'Hi'] = r3(Math.max(...v.filter((y) => y != null))); } return o; });
//   대조 보정 — A 팔 상자로(같은 창의 A 대조 중앙)
for (const a of armRows) { const A = armRows.find((x) => x.arm === 'A' && x.W === a.W); if (A) { a.npcStepCorr = r3(a.ratio * A.ctrl); a.lifeCorr = r3(a.lifeRatio * A.ctrl); } }
const out = { at: new Date().toISOString(), dir: DIR, rule: 'inf · --seg --lines · 구간 시계 혼자 판 · 틀 tpl-t100(오늘 main 200날) · ABBA', rows, arms: armRows };
const pad = (s, n) => String(s == null ? '—' : s).padStart(n);
let txt = '판 · 창 · ' + COLS.join(' · ') + ' (µs/사람 · p50/p99 ms)\n';
for (const x of rows.slice().sort((a, b) => (a.tag + a.W).localeCompare(b.tag + b.W))) txt += pad(x.tag, 4) + pad(x.W, 6) + COLS.map((c) => pad(x[c], 8)).join('') + '\n';
txt += '\n팔 중앙(범위)\n';
for (const a of armRows.sort((p, q) => (p.arm + p.W).localeCompare(q.arm + q.W))) txt += pad(a.arm, 4) + pad(a.W, 6) + ' n' + a.n + ' ' + COLS.map((c) => `${c} ${a[c]}[${a[c + 'Lo']}~${a[c + 'Hi']}]`).join(' · ') + ` · 보정 npcStep ${a.npcStepCorr} · 생활 층 ${a.lifeCorr}\n`;
const NAME = { npcStep: '`npcStep`', totUs: '사람당 전체', decGate: '결정 문', dec: '└ 결정(포함)', life: '└ └ 생활 층', farm: '└ └ └ 밭 칸(`_lifeNextFarmCell`)', fish: '└ └ └ 어부 던짐(`_t340Try`)',
  pick: '└ └ └ └ 종 뽑기(`freshfish.pick`)', unit: '└ └ └ 물린 한 마리 낱값', req: '└ └ └ require()', path: '└ 길 묻기', self: '└ 걸음 몸통 자기', p50: '틱 p50 ms', p99: '틱 p99 ms', ctrl: '대조(손 안 댄 구간 합)', ratio: '`npcStep` ÷ 대조', lifeRatio: '생활 층 ÷ 대조' };
const cell = (a, c) => (a ? (a.n > 1 ? `${a[c]} [${a[c + 'Lo']}~${a[c + 'Hi']}]` : `${a[c]}`) : '—');
function md(armList) {
  const A = (arm, W) => armRows.find((x) => x.arm === arm && x.W === W);
  let t = '| µs/사람 | ' + armList.map((a) => `${a} 낮 | ${a} 밤`).join(' | ') + ' |\n|---|' + armList.map(() => '---:|---:').join('|') + '|\n';
  for (const c of COLS) t += `| ${NAME[c]} | ` + armList.map((a) => `${cell(A(a, 'day'), c)} | ${cell(A(a, 'night'), c)}`).join(' | ') + ' |\n';
  t += '| `npcStep` 대조 보정(A 상자) | ' + armList.map((a) => `${(A(a, 'day') || {}).npcStepCorr} | ${(A(a, 'night') || {}).npcStepCorr}`).join(' | ') + ' |\n';
  t += '| 생활 층 대조 보정(A 상자) | ' + armList.map((a) => `${(A(a, 'day') || {}).lifeCorr} | ${(A(a, 'night') || {}).lifeCorr}`).join(' | ') + ' |\n';
  return t;
}
out.md = md((process.env.T1144_ARMS || 'A,B,C').split(',').filter((a) => armRows.some((x) => x.arm === a)));   // 표에 실을 팔(기본 셋 다)
if (process.argv[4]) fs.writeFileSync(process.argv[4], out.md);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
if (process.argv[3]) fs.writeFileSync(process.argv[3], txt);
console.log(txt + '\n' + out.md);
