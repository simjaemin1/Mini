#!/usr/bin/env node
// (@regress 없음 — 표 기계 · 러너 밖 · T1241 · 판정 0)
// === scripts/t1241-table.js — 사건 판 ↔ 틱 판 대조 표(`t1241-hook.js` 가 남긴 jsonl 둘) ===
// 실행: node scripts/t1241-table.js <틱 jsonl> <사건 jsonl> [시계 ns]   → 표(사람이 읽는 줄) + 끝에 JSON 한 줄
'use strict';
const fs = require('fs');
const [fa, fb, clkArg] = process.argv.slice(2);
const rd = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const A = rd(fa), B = rd(fb);
const dA = A.filter((o) => o.d != null && o.d >= 0), dB = B.filter((o) => o.d != null && o.d >= 0);
const cA = A.filter((o) => o.cp != null), cB = B.filter((o) => o.cp != null);
const byD = (L) => new Map(L.map((o) => [o.d, o]));
const mA = byD(dA), mB = byD(dB);
// ── econ 지문 ──
let n = 0, sto = 0, crop = 0, pop = 0, farm = 0, all = 0, first = null; const popA = [], popB = [];
for (const [d, a] of mA) { const b = mB.get(d); if (!b) continue; n++;
  const s1 = a.sto === b.sto, s2 = a.crop === b.crop, s3 = a.pop === b.pop, s4 = a.farm === b.farm;
  sto += s1; crop += s2; pop += s3; farm += s4; if (s1 && s2 && s3 && s4) all++; else if (first == null) first = d;
  popA.push(a.pop); popB.push(b.pop); }
const lastA = dA[dA.length - 1], lastB = dB[dB.length - 1];
// 수확 날(작물 장부 지문이 바뀐 날 · 작물 수가 준 날) — 두 판 같은 날인가
const harvDays = (L) => { const s = []; for (let i = 1; i < L.length; i++) if (L[i].cropN < L[i - 1].cropN) s.push(L[i].d); return s; };
const hA = harvDays(dA), hB = harvDays(dB);
const hSame = hA.length === hB.length && hA.every((d, i) => d === hB[i]);
// ── 체크포인트 몸 자리 ──
const errs = []; let cpN = 0, matched = 0, lab = 0, onlyA = 0, onlyB = 0; const cpRows = [];
const mcB = new Map(cB.map((o) => [o.cp, o]));
for (const a of cA) { const b = mcB.get(a.cp); if (!b) continue; cpN++;
  const MB = new Map(b.b.map((r) => [r[0], r])); const E = [];
  for (const r of a.b) { const q = MB.get(r[0]); if (!q) { onlyA++; continue; } matched++; const e = Math.hypot(r[1] - q[1], r[2] - q[2]) / 32; errs.push(e); E.push(e); if (r[3] === q[3]) lab++; MB.delete(r[0]); }
  onlyB += MB.size;
  E.sort((x, y) => x - y);
  cpRows.push([a.cp, a.b.length, b.b.length, E.length ? +E[E.length >> 1].toFixed(2) : null, E.length ? +E[E.length - 1].toFixed(2) : null]); }
errs.sort((x, y) => x - y);
const q = (p) => (errs.length ? +errs[Math.min(errs.length - 1, Math.floor(p * errs.length))].toFixed(3) : null);
const mean = errs.length ? +(errs.reduce((s, x) => s + x, 0) / errs.length).toFixed(3) : null;
// ── 빠르기 ──
const cpu = (L) => +L.reduce((s, o) => s + (o.cpu || 0), 0).toFixed(1);
const sA = lastA.st, sB = lastB.st;
const clk = clkArg != null ? +clkArg : (lastB.clk || lastA.clk || 0);
const per = (ns, nn) => (nn ? (ns / nn - clk) / 1000 : 0);
const stepUsA = per(sA.nsStep || 0, sA.nStep || 0), stepUsB = per(sB.nsStep || 0, sB.nStep || 0), heldUsB = per(sB.nsHeld || 0, sB.nHeld || 0);
const moveUsA = (sA.nsMove || 0) / Math.max(1, sA.nMoveTicks || 1) / 1000, moveUsB = (sB.nsMove || 0) / Math.max(1, sB.nMoveTicks || 1) / 1000;
const bodyTicksA = (sA.steps || 0), bodyTicksB = (sB.steps || 0) + (sB.held || 0);
// 한 틱 몫(결정 문 + 걸음 문) ÷ 몸-틱 = 몸 하나 한 틱 µs
const decA = stepUsA * (sA.nStep || 0), decB = stepUsB * (sB.nStep || 0) + heldUsB * (sB.nHeld || 0);
const perBodyA = (decA + moveUsA * (sA.nMoveTicks || 0)) / Math.max(1, bodyTicksA), perBodyB = (decB + moveUsB * (sB.nMoveTicks || 0)) / Math.max(1, bodyTicksB);
const segs = sB.begin || {}, ends = sB.end || {};
const days = Math.max(1, dB.length);
const out = {
  days: n, econ: { same: all, sto, crop, pop, farm, firstDiff: first, popEnd: [lastA.pop, lastB.pop], foodEnd: [lastA.food, lastB.food], harvDays: [hA.length, hB.length], harvSame: hSame },
  cp: { n: cpN, bodies: matched, onlyTick: onlyA, onlyDes: onlyB, meanM: mean, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1), labelSame: matched ? +(lab / matched).toFixed(4) : null, rows: cpRows },
  speed: { cpuTick: cpu(dA), cpuDes: cpu(dB), stepsTick: sA.steps, stepsDes: sB.steps, held: sB.held, heldShare: +((sB.held || 0) / Math.max(1, bodyTicksB)).toFixed(4),
    heldWalk: sB.heldWalk, begin: segs, end: ends, intrWhy: sB.intrWhy, handoffPerDay: +(((ends.due || 0) + (ends.intr || 0)) / days).toFixed(1), beginPerDay: +(((segs.sleep || 0) + (segs.rest || 0) + (segs.walk || 0)) / days).toFixed(1),
    sleepH: +((sB.sleepMs || 0) / 3.6e6).toFixed(1), walkH: +((sB.walkMs || 0) / 3.6e6).toFixed(1), restH: +((sB.restMs || 0) / 3.6e6).toFixed(1),
    clkNs: clk, stepUsTick: +stepUsA.toFixed(3), stepUsDes: +stepUsB.toFixed(3), heldUs: +heldUsB.toFixed(3), moveUsPerTick: [+moveUsA.toFixed(2), +moveUsB.toFixed(2)],
    perBodyTickUs: [+perBodyA.toFixed(3), +perBodyB.toFixed(3)], bodyTicks: [bodyTicksA, bodyTicksB] },
};
console.log(`날 ${n} · econ 같은 날 ${all}/${n}(곳간 ${sto} · 작물 ${crop} · 인구 ${pop} · 밭 ${farm}) · 첫 갈림 ${first == null ? '없음' : first} · 끝 인구 ${lastA.pop}:${lastB.pop} · 식량 ${lastA.food}:${lastB.food} · 수확 날 ${hA.length}:${hB.length} ${hSame ? '같음' : '다름'}`);
console.log(`체크포인트 ${cpN} · 몸 ${matched}(틱만 ${onlyA} · 사건만 ${onlyB}) · 자리 오차 m 평균 ${mean} · 가운데 ${q(0.5)} · 90% ${q(0.9)} · 99% ${q(0.99)} · 최대 ${q(1)} · 라벨 같음 ${out.cp.labelSame}`);
console.log(`CPU ${out.speed.cpuTick} → ${out.speed.cpuDes} 초 · npcStep ${sA.steps} → ${sB.steps} · 쥔 몸-틱 ${sB.held}(${(out.speed.heldShare * 100).toFixed(1)}%) · 토막 ${JSON.stringify(segs)} · 넘김 ${out.speed.handoffPerDay}/날 · 끊김 ${JSON.stringify(sB.intrWhy)}`);
console.log(`µs(시계 ${clk} ns 뺌) — 걸린 몸 한 부름 틱 판 ${out.speed.stepUsTick} · 사건 판 ${out.speed.stepUsDes} · 쥔 몸 ${out.speed.heldUs} · 걸음 문 틱당 ${out.speed.moveUsPerTick.join(' → ')} · 몸 하나 한 틱 ${out.speed.perBodyTickUs.join(' → ')}`);
console.log(JSON.stringify(out));
