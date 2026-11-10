'use strict';
// (@regress 없음 — 러너 밖 · T1256 표 자 · 읽기만)
// === scripts/t1256-table.js — T1256 관찰기 JSON 둘(켬 · 끔)에서 10날 표를 낸다 ==========================================
//   쓰는 법: node scripts/t1256-table.js <켬 머리> <끔 머리> [표.md] [표.json]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁에 `.t1256.json` · `.t1243.json` 이 있어야 한다)
//   날 d 칸 = 날 d 머리(econ 틱 앞)의 값 · 흐름 칸(친 횟수 · 원석 · 녹임 · 표본)은 그 앞 10날(날 d−10 … d−1)의 합 또는 평균.
const fs = require('fs');
//   판 자 대조: node scripts/t1256-table.js --pz <라이브 켬> <라이브 끔> <판 자 켬> <판 자 끔> [표.md]   (같은 칸 · 날 10 · 50 · 100 · 판 자는 300 도)
const PZ = process.argv[2] === '--pz';
const [onH, offH, outMd, outJson] = PZ ? [process.argv[3], process.argv[4], process.argv[7], null] : process.argv.slice(2);
if (!onH || !offH) { console.error('쓰는 법: node scripts/t1256-table.js <켬 머리> <끔 머리> [표.md] [표.json]'); process.exit(2); }
const load = (h) => ({ o: JSON.parse(fs.readFileSync(h + '.t1256.json', 'utf8')), c: (() => { try { return JSON.parse(fs.readFileSync(h + '.t1243.json', 'utf8')); } catch (e) { return null; } })() });
const A = { on: load(onH), off: load(offH) };
if (PZ) { A.pzOn = load(process.argv[5]); A.pzOff = load(process.argv[6]); }
const DAYS = []; for (let d = 10; d <= 100; d += 10) DAYS.push(d);
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const med = (a) => { const b = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
function col(R, name) { return R.o.dcols.indexOf(name); }
function rowsAt(R, d) { return R.o.day[d] || null; }
// 한 판의 10날 칸
function cells(R, d) {
  const O = R.o, kgU = O.kgU || 5;
  const I = (n) => col(R, n);
  const head = rowsAt(R, d); if (!head) return null;
  const at = (k) => sum(head.map((r) => r[I(k)]));
  const win = []; for (let k = d - 9; k <= d; k++) if (O.day[k]) win.push(O.day[k]);   // 날 k 머리 줄 = 날 k−1 몫(어제)
  const bodyByKind = {}; let bodyU = 0, prodU = 0, cut = 0, walkVD = 0;
  for (const rows of win) for (const r of rows) {
    for (const [k, q] of Object.entries(r[I('bodyInY')] || {})) { bodyByKind[k] = (bodyByKind[k] || 0) + q; bodyU += q; }
    prodU += r[I('oreProdY')] || 0; cut += r[I('cutY')] || 0; walkVD += r[I('walkY')] || 0;
  }
  const nW = win.length || 1;
  const prev = rowsAt(R, d - 10) || rowsAt(R, 1);
  const smeltNow = at('smeltTot'), smeltPrev = prev ? sum(prev.map((r) => r[I('smeltTot')])) : 0;
  const bronzeNow = at('bronzeW');
  const smeltOut = {}; for (const r of head) for (const [k, q] of Object.entries(r[I('smeltOut')] || {})) smeltOut[k] = (smeltOut[k] || 0) + q;
  // 표본(날 d−10 … d−1)
  let n = 0, on = 0, onMax = 0, mb = 0, mine = 0, hit = 0; const acts = {};
  for (let k = d - 10; k <= d - 1; k++) {
    const S = O.samp[k]; if (!S) continue;
    n += S.n; let dayOnMax = 0;
    for (const v of Object.values(S.v)) { on += v.on; mb += v.mb; mine += v.mine; hit += v.hitMax; dayOnMax += v.onMax; }
    if (dayOnMax > onMax) onMax = dayOnMax;
    for (const [a, c] of Object.entries(S.acts || {})) acts[a] = (acts[a] || 0) + c;
  }
  const g = O.g[d], g0 = O.g[d - 10] || O.g[1];
  const t = g && g.t724, t0 = g0 && g0.t724;
  const dT = (k) => (t && typeof t[k] === 'number' ? t[k] : 0) - (t0 && typeof t0[k] === 'number' ? t0[k] : 0);
  return {
    eMiner: at('eMiner'), bMiner: at('bMiner'), eSmith: at('eSmith'), bSmith: at('bSmith'), worldMiners: g ? g.miners : null, pop: g ? g.pop : null,
    onAvg: n ? on / n : 0, onMax, onShare: mb ? on / mb : 0, mineShare: mb ? mine / mb : 0, mbAvg: n ? mb / n : 0,
    swings: dT('sw'), pulses: dT('pulse'), hitSamp: hit, bodyDays: dT('bodies'), walkVD,
    cut, bodyKgDay: bodyU * kgU / nW, bodyUDay: bodyU / nW, bodyKgByKind: Object.fromEntries(Object.entries(bodyByKind).map(([k, q]) => [k, +(q * kgU).toFixed(2)])),
    prodUDay: prodU / nW, oreStock: at('oreStock'), smelt: smeltNow - smeltPrev, smeltTot: smeltNow, smeltOut, bronze: bronzeNow, copper: at('copper'), tin: at('tin'), weapon: at('weapon'),
    done: dT('done'), none: dT('none'), wait: dT('wait'), full: dT('full'), noGran: dT('noGran'), repick: dT('repick'), walk: dT('walk'), picks: dT('picks'), calls: dT('calls'), gran: dT('gran'), dusk: dT('dusk'),
    acts,
    cpuMed: R.c && R.c.cpu ? med(R.c.cpu.filter((x) => x[0] > d - 10 && x[0] <= d && x[0] > 1).map((x) => x[1])) : null,
  };
}
const T = { on: {}, off: {} };
for (const arm of ['on', 'off']) for (const d of DAYS) T[arm][d] = cells(A[arm], d);
if (PZ) {   // 판 자 대조 표 — 같은 칸(광산 마을 11 합)
  const ff = (x, p = 1) => (x == null || !Number.isFinite(+x)) ? '—' : (+x).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p });
  const C = [['광부 econ', (c) => ff(c.eMiner, 0)], ['광부 몸', (c) => ff(c.bMiner, 0)], ['광맥 위 몸(표본 평균)', (c) => ff(c.onAvg, 2)], ['친 횟수(10날)', (c) => ff(c.swings, 0)],
    ['몸 원석 kg/날', (c) => ff(c.bodyKgDay, 2)], ['원석 산출 단위/날', (c) => ff(c.prodUDay, 2)], ['원석 재고', (c) => ff(c.oreStock, 1)], ['노 녹임(10날)', (c) => ff(c.smelt, 2)],
    ['청동 무기 누계', (c) => ff(c.bronze, 2)], ['대장장이 econ · 몸', (c) => `${ff(c.eSmith, 0)} · ${ff(c.bSmith, 0)}`], ['몸 채굴 걸음 부름(10날)', (c) => ff(c.calls, 0)]];
  const cols = [['라이브 켬', 'on', 10], ['라이브 끔', 'off', 10], ['판 자 켬', 'pzOn', 10], ['판 자 끔', 'pzOff', 10],
    ['라이브 켬', 'on', 50], ['라이브 끔', 'off', 50], ['판 자 켬', 'pzOn', 50], ['판 자 끔', 'pzOff', 50],
    ['라이브 켬', 'on', 100], ['라이브 끔', 'off', 100], ['판 자 켬', 'pzOn', 100], ['판 자 끔', 'pzOff', 100], ['판 자 켬', 'pzOn', 300], ['판 자 끔', 'pzOff', 300]];
  let m = '| 칸(광산 마을 11 합) | ' + cols.map(([n, , d]) => `${n} 날 ${d}`).join(' | ') + ' |\n|---|' + cols.map(() => '---:').join('|') + '|\n';
  const cc = cols.map(([, a, d]) => cells(A[a], d));
  for (const [n, fn] of C) m += `| ${n} | ` + cc.map((c) => c ? fn(c) : '—').join(' | ') + ' |\n';
  if (outMd) fs.writeFileSync(outMd, m);
  process.stdout.write(m);
  process.exit(0);
}
const f = (x, p = 1) => (x == null || !Number.isFinite(+x)) ? '—' : (+x).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p });
const ROWS = [
  ['광부(econ · 광산 마을 11)', (c) => f(c.eMiner, 0)],
  ['광부 몸(광산 마을)', (c) => f(c.bMiner, 0)],
  ['광맥 셀에 선 광부 몸(표본 평균 · 날 최대)', (c) => `${f(c.onAvg, 2)} · ${f(c.onMax, 0)}`],
  ["광부 몸-표본 중 광맥 위 · '채광' %", (c) => `${f(100 * c.onShare, 1)} · ${f(100 * c.mineShare, 1)}`],
  ['친 횟수(타 · 10날)', (c) => f(c.swings, 0)],
  ['몸이 친 마을-날(10날)', (c) => f(c.walkVD, 0)],
  ['깎은 덩이(10날)', (c) => f(c.cut, 2)],
  ['몸 원석 곳간 kg/날', (c) => f(c.bodyKgDay, 2)],
  ['원석 산출 econ 단위/날(`dailyProductionBuf`)', (c) => f(c.prodUDay, 2)],
  ['원석 재고(단위)', (c) => f(c.oreStock, 1)],
  ['노 녹임(원석 단위 · 10날)', (c) => f(c.smelt, 2)],
  ['청동 무기 누계(`_bronzeWeaponMade`)', (c) => f(c.bronze, 2)],
  ['구리 · 주석 재고', (c) => `${f(c.copper, 1)} · ${f(c.tin, 1)}`],
  ['대장장이 econ · 몸', (c) => `${f(c.eSmith, 0)} · ${f(c.bSmith, 0)}`],
  ['퇴근 까닭: 몫 참 · 셀 없음 · 닿나 기다림(10날 걸음)', (c) => `${f(c.done, 0)} · ${f(c.none, 0)} · ${f(c.wait, 0)}`],
  ['현장 걸음 · 짐 참 · 곳간 입고(10날)', (c) => `${f(c.walk, 0)} · ${f(c.full, 0)} · ${f(c.gran, 0)}`],
  ['하루 CPU 초(10날 가운데값)', (c) => f(c.cpuMed, 1)],
];
let md = '| 칸(켬 : 끔) | ' + DAYS.map((d) => `날 ${d}`).join(' | ') + ' |\n|---|' + DAYS.map(() => '---:').join('|') + '|\n';
for (const [name, fn] of ROWS) md += `| ${name} | ` + DAYS.map((d) => (T.on[d] && T.off[d]) ? `${fn(T.on[d])} : ${fn(T.off[d])}` : (T.on[d] ? `${fn(T.on[d])} : —` : '—')).join(' | ') + ' |\n';
// 원석 종류별 kg(100날 누계 · 몸 곳간) · 녹여 나온 금속
const byKind = (R) => { const O = R.o, kgU = O.kgU || 5, I = O.dcols.indexOf('bodyInY'), out = {}; for (const rows of Object.values(O.day)) for (const r of rows) for (const [k, q] of Object.entries(r[I] || {})) out[k] = (out[k] || 0) + q * kgU; return out; };
const kinds = { on: byKind(A.on), off: byKind(A.off) };
md += '\n| 몸 원석 곳간 kg 종류별(100날 누계) | 켬 | 끔 |\n|---|---:|---:|\n';
for (const k of [...new Set([...Object.keys(kinds.on), ...Object.keys(kinds.off)])].sort()) md += `| ${k} | ${f(kinds.on[k] || 0, 1)} | ${f(kinds.off[k] || 0, 1)} |\n`;
// 몸 셋의 하루(10날 평균)
function lifeTab(R, arm) {
  const O = R.o; let s = `\n| 몸 하루(${arm} · 10날 평균) | 몸 | 마을 | 채광 · 걸음 · 쉼 · 잠 · 그 밖 % | 걸은 셀/날 | 친 셀/날 | 손 원석 kg/날 |\n|---|---|---|---|---:|---:|---:|\n`;
  for (const d of DAYS) {
    const per = {};
    for (let k = d - 10; k <= d - 1; k++) for (const [pid, L] of Object.entries(O.life[k] || {})) {
      const p = per[pid] || (per[pid] = { vil: L.vil, n: 0, st: {}, dist: 0, cells: 0, kg: 0, days: 0 });
      p.days++; p.n += L.n; p.dist += +L.dist || 0; p.cells += (L.cells || []).length; p.kg += +L.kg || 0; if (L.vil) p.vil = L.vil;
      for (const [x, c] of Object.entries(L.st)) p.st[x] = (p.st[x] || 0) + c;
    }
    for (const [pid, p] of Object.entries(per)) {
      const pc = (x) => 100 * (p.st[x] || 0) / (p.n || 1);
      const oth = Math.max(0, 100 - pc('mine') - pc('walk') - pc('rest') - pc('sleep'));
      s += `| 날 ${d - 10}–${d - 1} | ${pid} | ${p.vil || '—'} | ${f(pc('mine'))} · ${f(pc('walk'))} · ${f(pc('rest'))} · ${f(pc('sleep'))} · ${f(oth)} | ${f(p.dist / p.days)} | ${f(p.cells / p.days, 2)} | ${f(p.kg / p.days, 2)} |\n`;
    }
  }
  return s;
}
md += lifeTab(A.on, '켬') + lifeTab(A.off, '끔');
if (outMd) fs.writeFileSync(outMd, md); else process.stdout.write(md);
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ T, kinds }, null, 1));
if (outMd) process.stdout.write(md);
