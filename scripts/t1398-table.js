#!/usr/bin/env node
'use strict';
// T1398 계측 JSON에서만 표를 낸다. 판을 돌리거나 수를 제품에 되먹이지 않는다.
const fs = require('fs'), path = require('path');
const root = process.argv[2]; if (!root) throw Error('runs 경로 필요');
const read = p => { const bytes=fs.readFileSync(p); return JSON.parse(p.endsWith('.gz') ? require('zlib').gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')); };
const fmt = x => x == null || !Number.isFinite(x) ? '—' : (+x.toFixed(3)).toString();
const rows = [], diag = [], routes = [], producers = [];
for (const dir of fs.readdirSync(root).sort()) {
  const base = path.join(root, dir); if (!fs.statSync(base).isDirectory()) continue;
  if (!fs.existsSync(path.join(base,'done.txt'))) { console.log(`<!-- 진행 중 ${dir} -->`); continue; }
  const probeFile = fs.readdirSync(base).find(p => p.replace(/\.gz$/, '') === 'probe.json' || /\.t1385\.json(?:\.gz)?$/.test(p));
  const bandFile = fs.readdirSync(base).find(p => p.replace(/\.gz$/, '') === 'band.json' || /\.t1398\.json(?:\.gz)?$/.test(p));
  if (!probeFile || !bandFile) { console.log(`<!-- 미완료 ${dir} -->`); continue; }
  const p = read(path.join(base, probeFile)), b = read(path.join(base, bandFile));
  if (p.err) throw Error(dir + ': ' + p.err);
  const castCount = Array.isArray(p.casts) ? p.casts.length : p.casts.n;
  if (b.casts.length !== castCount) throw Error(dir + ': 주조 훅 수 어긋남 ' + b.casts.length + '/' + castCount);
  const col = Object.fromEntries(p.dcols.map((k,i) => [k,i]));
  for (const end of [365, 730, p.days.at(-1)?.[0]].filter((v,i,a) => v && a.indexOf(v) === i)) {
    const d = p.days.find(x => x[0] === end); if (!d) continue;
    const snap = p.snaps[end]; if (!snap) continue;
    const bronze = snap.map(v => v[3]).sort((a,b) => b-a), total = bronze.reduce((a,b) => a+b, 0);
    const cumulative = p.days.filter(v => v[0] <= end).reduce((n,v) => n + v[col.bzToday], 0);
    rows.push([dir, end, cumulative, snap.filter(v => v[3] >= 1).length, snap.filter(v => v[3] > v[2] / 2).length,
      total ? bronze.slice(0,5).reduce((a,b) => a+b,0) / total * 100 : 0,
      d[col.tin] ? d[col.idleTin] / d[col.tin] * 100 : 0, 51 - snap.length, d[col.pop]]);
  }
  for (const [gate,g] of Object.entries(b.gates)) diag.push([dir, gate, g.days, g.cu/g.days, g.tin/g.days, g.hands/g.days, g.buyer, g.unknown, g.readyBuyer]);
  const farmFile = ['farm.json','farm.json.gz'].map(n => path.join(base,n)).find(n => fs.existsSync(n));
  const farmPer = new Map(farmFile ? read(farmFile).per.map(v => [v.name,v]) : []);
  const made = {};
  for (const c of b.casts) made[c.village] = (made[c.village] || 0) + c.bronze;
  for (const [name, quantity] of Object.entries(made).sort((a,b) => b[1]-a[1])) if (quantity > 0) { const f=farmPer.get(name); producers.push([dir,name,quantity,f?.fuelCovMean ?? null,f ? f.jobDays.miner || 0 : null,f ? f.jobDays.smith || 0 : null]); }
  const aggregate = new Map();
  function add(t, item, from, to) {
    if (item?.res !== 'weapon') return;
    const key = from + '→' + to, a = aggregate.get(key) || { from, to, amount:0, n:0, distances:[], prices:[], days:[] };
    a.n++; a.amount += item.amt || 0; a.days.push(t.day); if (t.distance != null) a.distances.push(t.distance);
    if (item.pAtTo != null) a.prices.push(item.pAtTo); aggregate.set(key, a);
  }
  for (const t of b.trades) {
    if (!t.abandoned) {
      if (t.basket) for (const i of t.basket) add(t, i.res === t.sent?.res ? { ...i, pAtTo:t.sent.pAtTo } : i, t.from, t.to);
      else { add(t, t.sent, t.from, t.to); add(t, t.sent2, t.from, t.to); }
    }
    if (t.retBasket) for (const i of t.retBasket) add(t,i,t.to,t.from); else add(t,t.bought,t.to,t.from);
  }
  for (const a of aggregate.values()) routes.push([dir, a.from, a.to, a.n, a.amount, a.distances.length ? a.distances.reduce((x,y) => x+y,0)/a.distances.length : null,
    a.prices.length ? a.prices.reduce((x,y) => x+y,0)/a.prices.length : null, made[a.from] || 0]);
}
function table(headers, records) { console.log('| '+headers.join(' | ')+' |\n|'+headers.map(() => '---').join('|')+'|'); for (const row of records) console.log('| '+row.map(v => typeof v === 'number' ? fmt(v) : v).join(' | ')+' |'); }
const pairs = [];
for (const a of rows.filter(r => r[0].includes('-off-'))) {
  const b = rows.find(r => r[0] === a[0].replace('-off-', '-on-') && r[1] === a[1]);
  if (b) pairs.push([a[0].replace('-off-', '-'), a[1], a[2], b[2], a[2] ? b[2]/a[2] : null,
    `${a[3]} → ${b[3]}`, `${a[4]} → ${b[4]}`, `${fmt(a[5])} → ${fmt(b[5])}`, `${fmt(a[6])} → ${fmt(b[6])}`,
    `${a[7]} → ${b[7]}`, `${a[8]} → ${b[8]}`]);
}
console.log('# 끔/켬 짝 비교\n');
table(['판','날','끔 청동','켬 청동','끔비','쥔 마을 /51','병기고 절반 초과','상위 다섯 %','묵은 주석 %','빈 마을','인구'],pairs);
console.log('# 판 결과\n');
table(['판','날','청동 생산 누계','쥔 마을 /51','병기고 절반 초과','상위 다섯 %','묵은 주석 %','빈 마을','인구'],rows);
console.log('\n# 닫힌 조건 마을-날(구매자는 기존 값 캐시에 한함)\n');
table(['판','문','마을-날','구리 평균','주석 평균','손 평균','구매자 양수','구매자 미관측','재료+손+구매자'],diag);
console.log('\n# 청동 주조 마을\n');
table(['판','마을','청동 생산 누계','생활 연료 충족 평균','광부 사람-날','대장장이 사람-날'],producers);
console.log('\n# 무기 이동(청동만의 거래는 아님: 장부 품목이 weapon으로 합쳐져 있음)\n');
table(['판','보낸 마을','산 마을','줄 수','양','거리 평균','도착값 평균','보낸 마을 청동 생산 누계'],routes);
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify({ pairs, rows, diag, routes, producers },null,2));
