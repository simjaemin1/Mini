'use strict';
// (@regress 없음 — 러너 밖 · T1333 λ 표 · 읽기만 · 제품 무변)
// === scripts/t1333-lam.js — 바로 잡은 λ(`T1313_LAMBDA_ZERO`)에서 광부 · 어부가 일하려면 쉰 값 R 또는 원석 값의 자가 얼마여야 하나(T1333 ⑤ · T1313 회부 3) ==========
//   랩 세계(`econ-lab-real.js` 그대로 — 본 게임 배선 · 51곳)를 날 N 까지 돌린 뒤 마을마다 한 번 읽는다(읽기만 · 판에 값 안 넣음):
//     광부 — 원석 한 단위 값 `t1266OreValue(v, H, null, 그 마을 광맥 조성)`.unit(= Σ 조성 몫 × 그 원석 그림자 값 × λ) · 쉰 값 `rest`(= LEISURE_HAPPY_W ÷ (N × H))
//     어부 — 생선 한 단위 값 `t1217Value(v, H, null)`.unit · 같은 쉰 값
//   한 시간 W = 한 단위 값 × 한 시간에 드는 단위(--u · 광부 기본 = T1313 몸 세계 λ 판의 물음당 평균 단위 · 어부 --uf)
//   표 칸: λ 물건 · λ · 한 단위 값 ÷ R · 한 시간 W ÷ R · 일하려면 R 을 몇 배로(= W ÷ R) 또는 원석 값을 몇 배로(= R ÷ W)
//   쓰는 법: T1313_LAMBDA_ZERO=1 SEED_ALL=1 VILLAGE_MAX=51 node scripts/t1333-lam.js 100 --out 켬.json
//            node scripts/t1333-lam.js --md 켬.json [--u 0.63] [--uf 1] > 표.md
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = { u: 0.63, uf: 1 }; const pos = [];
for (let i = 0; i < args.length; i++) { if (/^--(out|md|u|uf)$/.test(args[i])) opt[args[i].slice(2)] = args[++i]; else pos.push(args[i]); }
const r4 = (x) => (x == null || !isFinite(x)) ? null : +(+x).toPrecision(4);
if (opt.md) {
  const A = JSON.parse(fs.readFileSync(opt.md, 'utf8')), U = +opt.u, UF = +opt.uf;
  const out = [`## λ ${A.lz ? '바로 잡음(켬)' : '종전(끔)'} — 랩 세계 날 ${A.day} · H ${A.H} · 광부 한 시간 단위 ${U} · 어부 ${UF}`, '',
    '| 마을 | 사람 · 광부 · 어부 | λ 물건 · λ | 원석 한 단위 값 ÷ R | 광부 한 시간 W ÷ R | 일하려면 R × · 또는 원석 값 × | 어부 한 단위 ÷ R |', '|---|---:|---|---:|---:|---:|---:|'];
  const need = [];
  for (const r of A.v.filter((q) => q.ore != null).sort((a, b) => (b.miner - a.miner) || a.name.localeCompare(b.name))) {
    const wr = r.ore * U / r.rest; need.push(wr);
    out.push(`| ${r.name} | ${r.N} · ${r.miner} · ${r.fisher} | ${r.best} · ${r.lam} | ${r4(r.ore / r.rest)} | ${r4(wr)} | ${wr >= 1 ? '— (친다)' : `R × ${r4(wr)} · 원석 × ${r4(1 / wr)}`} | ${r4(r.fish / r.rest)} |`);
  }
  need.sort((a, b) => a - b);
  const q = (p) => need.length ? need[Math.min(need.length - 1, Math.floor(p * need.length))] : null;
  out.push('', `광산 마을 ${need.length} 곳 — 한 시간 W ÷ R 가장 작은 ${r4(need[0])} · 가운데 ${r4(q(0.5))} · 가장 큰 ${r4(need[need.length - 1])} · 친다(≥ 1) ${need.filter((x) => x >= 1).length} 곳` +
    ` → 모든 광산 마을이 치려면 원석 값 × ${r4(1 / need[0])}(또는 R × ${r4(need[0])}) · 반이 치려면 × ${r4(1 / q(0.5))}`);
  console.log(out.join('\n'));
  return;
}
const DAYS = parseInt(pos[0], 10) || 100, H = 12;
process.argv = [process.argv[0], path.join(__dirname, 'econ-lab-real.js'), String(DAYS), '0'];
const _log = console.log; console.log = () => {};   // 랩 줄은 숨긴다(값 무변)
let world;
try { ({ world } = require('./econ-lab-real')); } finally { console.log = _log; }
const v1 = require('../sim/economy-sim'), v2 = require('../sim/economy-sim-v2'), OG = require('../server/ore-goods');
const rows = [];
for (const v of (world.villages || [])) {
  const f = v2.t1217Value(v, H, null); if (!f) continue;
  const m = (v.land && v.land.oreMix) || {}, mix = {};
  let s = 0; for (const k in m) if (m[k] > 0 && OG.idOf(k)) s += m[k];
  if (s > 0) for (const k in m) if (m[k] > 0 && OG.idOf(k)) mix[OG.idOf(k)] = m[k] / s;
  const o = Object.keys(mix).length ? v2.t1266OreValue(v, H, null, mix) : null;
  const c = v.counts || {};
  rows.push({ name: v.name, N: f.N, fisher: c.fisher || 0, miner: c.miner || 0, lam: r4(f.lam), best: f.best, fish: r4(f.unit), ore: o ? r4(o.unit) : null, p: o ? r4(o.p) : null, rest: r4(f.rest) });
}
const rec = { lz: !!v1.T1313_LAMBDA_ZERO, day: DAYS, H, v: rows };
if (opt.out) fs.writeFileSync(opt.out, JSON.stringify(rec)); else _log(JSON.stringify(rec));
_log(`λ 손잡이 ${rec.lz ? '켬' : '끔'} · 날 ${DAYS} · 마을 ${rows.length} · 광맥 마을 ${rows.filter((r) => r.ore != null).length}`);
