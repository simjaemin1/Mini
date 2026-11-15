'use strict';
// (@regress 없음 — 러너 밖 · T1313 λ 자 · 읽기만)
// === scripts/t1313-lam.js — 마을마다 한 시간 값의 λ(`_t1217Lam` — 어부 `t1217Value` · 광부 `t1266OreValue` 가 같은 함수)와 λ 물건 · 어부 한 단위 값 ==========
//   랩 세계(`econ-lab-real.js` 그대로 — 본 게임 배선 · 51곳)를 날 N 까지 돌린 뒤 마을마다 `t1217Value(v, 12, null)` 를 한 번 읽는다(읽기만 · 판에 값 안 넣음).
//   λ 손잡이 `T1313_LAMBDA_ZERO` 는 실을 때 한 번 읽으므로 두 프로세스로 잰다. 랩은 `t1217Value` 를 안 부르니 두 세계는 같고 λ 만 다르다.
//   쓰는 법: VILLAGE_MAX=51 node scripts/t1313-lam.js 100 --out 끔.json
//            T1313_LAMBDA_ZERO=1 VILLAGE_MAX=51 node scripts/t1313-lam.js 100 --out 켬.json
//            node scripts/t1313-lam.js --cmp 끔.json 켬.json [--md λ.md]
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = {}; const pos = [];
for (let i = 0; i < args.length; i++) { if (/^--(out|md)$/.test(args[i])) opt[args[i].slice(2)] = args[++i]; else if (args[i] === '--cmp') opt.cmp = [args[++i], args[++i]]; else pos.push(args[i]); }
const r4 = (x) => (x == null || !isFinite(x)) ? null : +(+x).toPrecision(4);
if (opt.cmp) {
  const [A, B] = opt.cmp.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const kind = (n) => n.replace(/\d+$/, '');
  const out = [`## λ 끔(${A.lz ? '켬' : '끔'}) ↔ 켬(${B.lz ? '켬' : '끔'}) — 랩 세계 날 ${A.day} · 마을 ${A.v.length}`, '',
    '| 마을 | 사람 · 어부 · 광부 | λ 물건 끔 → 켬 | λ 끔 → 켬(배) | 어부 한 단위 값 ÷ 쉰 값 끔 → 켬 | 빚(끼니) |', '|---|---:|---|---:|---:|---:|'];
  const by = {}; let ch = 0;
  for (const a of A.v) {
    const b = B.v.find((q) => q.name === a.name); if (!b) continue;
    const k = kind(a.name), o = by[k] || (by[k] = { n: 0, ch: 0, f: [] }); o.n++;
    if (a.best !== b.best || a.lam !== b.lam) { ch++; o.ch++; o.f.push(b.lam / a.lam); out.push(`| ${a.name} | ${a.N} · ${a.fisher} · ${a.miner} | ${a.best} → ${b.best} | ${a.lam} → ${b.lam}(×${r4(b.lam / a.lam)}) | ${r4(a.unit / a.rest)} → ${r4(b.unit / b.rest)} | ${r4(a.debt)} |`); }
  }
  out.push('', `λ 가 바뀐 마을 ${ch}/${A.v.length} — ` + Object.entries(by).map(([k, o]) => { o.f.sort((x, y) => x - y); return `${k} ${o.ch}/${o.n}${o.f.length ? `(가운데 ×${r4(o.f[o.f.length >> 1])})` : ''}`; }).join(' · '));
  const md = out.join('\n'); console.log(md); if (opt.md) fs.writeFileSync(opt.md, md + '\n');
  return;
}
const DAYS = parseInt(pos[0], 10) || 100;
process.argv = [process.argv[0], path.join(__dirname, 'econ-lab-real.js'), String(DAYS), '0'];
const _log = console.log; console.log = () => {};   // 랩 줄은 숨긴다(값 무변)
let world;
try { ({ world } = require('./econ-lab-real')); } finally { console.log = _log; }
const v1 = require('../sim/economy-sim'), v2 = require('../sim/economy-sim-v2');
const rows = [];
for (const v of (world.villages || [])) {
  const r = v2.t1217Value(v, 12, null); if (!r) continue;
  const c = v.counts || {};
  rows.push({ name: v.name, N: r.N, fisher: c.fisher || 0, miner: c.miner || 0, lam: r4(r.lam), best: r.best, unit: r4(r.unit), vEat: r4(r.vEat), vSur: r4(r.vSur), rest: r4(r.rest), debt: r4(r.debt) });
}
const rec = { lz: !!v1.T1313_LAMBDA_ZERO, day: DAYS, v: rows };
if (opt.out) fs.writeFileSync(opt.out, JSON.stringify(rec)); else _log(JSON.stringify(rec));
_log(`λ 손잡이 ${rec.lz ? '켬' : '끔'} · 날 ${DAYS} · 마을 ${rows.length}`);
