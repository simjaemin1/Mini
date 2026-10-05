#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T656 자)
// =============================================================================
// T656 — 통나무가 왜 0 마을로 안 가나: T581 판(`T581_WOOD=1 T581_FLOW=1`)의 `flow_*.jsonl`·`wood_*.jsonl` 을 한 장 표로 접는다.
//   node scripts/t656-flow.js <outdir> [표지 = s1020_off] [md]
//   읽는 칸(t581-rehearsal.js `flowObs` 가 적는다):
//     k:'v' — 통나무가 수출 문턱을 넘는 마을의 그날 차례(여유 노동 상한 cap · 지금 교역 중 cur)
//     k:'c' — 발주 루프 한 바퀴(이익 나는 다리 0 이면 ch=null · 아니면 고른 화물 ch · 기회비용 관문 g)
//             wc = 통나무가 후보였나 · wb = 통나무 최고 다리 · zs = 0 마을마다 [까닭 · 거리 · 도착값 · 총이익]
//   까닭 낱말(0 마을 하나를 두고 그 바퀴에서): sent 실렸다 · gate 골랐는데 기회비용 관문에 막힘 · res 통나무 최고 목적지였는데 다른 화물이 이김
//     · dest 이익은 났는데 다른 목적지가 더 남음 · neg 이익 ≤ 0 · nb 목적지 후보(가까운 20곳 · 행렬 최대의 절반)에 없음
//     · info 정보 반경 밖 · dup 오늘 이미 보냄 · empty/iso/grudge 사람 없음/고립/원한
//   ⚠새 수 0 — 셈만 한다. 그림자가격 상한 = 통나무 기준값 × min(1000, 10 × 10^(효용×2)) (economy-sim-v2 의 그 식 · 값은 거기서 읽는다).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [OUTD, TAG0, MD] = process.argv.slice(2);
if (!OUTD) { console.error('쓰는 법: node scripts/t656-flow.js <outdir> [표지] [md]'); process.exit(2); }
const TAG = TAG0 && TAG0 !== 'md' ? TAG0 : 's1020_off';
const md = MD === 'md' || TAG0 === 'md';
const rd = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : 0;
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const E2 = require(path.join(__dirname, '..', 'sim', 'economy-sim-v2.js'));
const OUT = {};
for (const z of ['hanbando', 'nippon']) {
  const F = rd(path.join(OUTD, `flow_${TAG}_${z}.jsonl`));
  const W = rd(path.join(OUTD, `wood_${TAG}_${z}.jsonl`));
  if (!F.length) continue;
  const C = F.filter((r) => r.k === 'c'), V = F.filter((r) => r.k === 'v');
  // ── ① 출발 — 실제로 떠난 바퀴(ch 있고 관문 통과)
  const dep = C.filter((r) => r.ch && r.g === true);
  const depW = dep.filter((r) => r.wc);
  const chW = dep.filter((r) => r.ch[0] === 'wood');
  const byRes = {}; for (const r of dep) byRes[r.ch[0]] = (byRes[r.ch[0]] || 0) + 1;
  // 통나무가 후보였는데 다른 화물이 떠난 까닭
  const lost = { noProfit: 0, unitLower: 0, qtyLower: 0, override: 0 };
  const lostEx = [];
  for (const r of depW) {
    if (r.ch[0] === 'wood') continue;
    if (!r.wb) { lost.noProfit++; continue; }
    if (r.ov && r.ov[0] === 'wood') { lost.override++; continue; }
    const wUnit = r.wb[1] / Math.max(1, r.wb[2]), cUnit = r.ch[2] / Math.max(1, r.ch[3]);
    if (wUnit >= cUnit) lost.qtyLower++; else lost.unitLower++;
    if (lostEx.length < 6) lostEx.push({ d: r.d, s: r.s, ch: r.ch, wb: r.wb });
  }
  // 통나무 출발의 목적지 — 0 마을이었나
  const wDest = {}; let wToZero = 0;
  for (const r of chW) { wDest[r.ch[1]] = (wDest[r.ch[1]] || 0) + 1; if (r.zs && r.zs[r.ch[1]] && r.zs[r.ch[1]][0] === 'sent') wToZero++; }
  const wFrom = {}; for (const r of chW) wFrom[r.s] = (wFrom[r.s] || 0) + 1;
  // ── ② 통나무가 남는데 루프가 안 돈 날(여유 노동)
  const loopKey = new Set(C.map((r) => r.d + '|' + r.s));
  let vDays = 0, vNoLoop = 0, vNoLoopCap = 0; for (const r of V) { vDays++; if (!loopKey.has(r.d + '|' + r.s)) { vNoLoop++; if (r.cur >= r.cap) vNoLoopCap++; } }
  // 루프는 돌았는데 출발 0 — 이익 0 · 관문
  const loops = C.length, noBest = C.filter((r) => !r.ch).length, gateFail = C.filter((r) => r.ch && r.g === false).length;
  // ── ③ 0 마을 쪽 — 쌍(출발 → 0 마을)마다 까닭 분포
  const pair = new Map();   // key → {sent, cnt{}}
  const stat = {};
  const distBy = {};   // 까닭별 거리(다리가 선 것만)
  for (const r of C) {
    if (!r.wc || !r.zs) continue;
    for (const [b, x] of Object.entries(r.zs)) {
      const k = r.s + '>' + b; let p = pair.get(k); if (!p) { p = { sent: 0, cnt: {} }; pair.set(k, p); }
      p.cnt[x[0]] = (p.cnt[x[0]] || 0) + 1; if (x[0] === 'sent') p.sent++;
      stat[x[0]] = (stat[x[0]] || 0) + 1;
      if (x[1] != null) (distBy[x[0]] || (distBy[x[0]] = [])).push(x[1]);
    }
  }
  const pairsSent = [...pair.values()].filter((p) => p.sent > 0).length;
  const mainR = {};
  for (const p of pair.values()) { if (p.sent > 0) continue; const m = Object.entries(p.cnt).sort((a, b) => b[1] - a[1])[0][0]; mainR[m] = (mainR[m] || 0) + 1; }
  // 통나무 최고 다리의 거리 vs 0 마을 다리 거리
  const wbDist = depW.filter((r) => r.wb).map((r) => r.wb[4]);
  // ── ④ 그림자가격 — 0 마을 vs 나머지 vs 상한
  const cap = 1.67 * Math.min(1000, 10 * Math.pow(10, 0.9 * 2));   // 기준값 1.67 × 상한(효용 0.9) — economy-sim-v2 BASE_VALUE_V2·UTILITY_WEIGHT 의 통나무 칸
  const pz = [], pnz = [], pzCap = [], pBigDest = [];
  const days = W.map((r) => r.day);
  for (const r of W) for (const v of r.vils) { if (v.pw == null || !(v.n > 0)) continue; if (v.wood < 1) { pz.push(v.pw); pzCap.push(v.pw >= cap * 0.999 ? 1 : 0); } else pnz.push(v.pw); }
  // 통나무 출발 목적지(받은 마을)의 그날 값 · 0 마을의 그날 값 — 같은 날 짝
  const priceOn = new Map(); for (const r of W) for (const v of r.vils) priceOn.set(r.day + '|' + v.v, v);
  const destP = [], zeroPsameDay = [];
  for (const r of chW) { const x = priceOn.get(r.d + '|' + r.ch[1]); if (x && x.pw != null) destP.push(x.pw); if (r.zs) for (const b of Object.keys(r.zs)) { const y = priceOn.get(r.d + '|' + b); if (y && y.pw != null) zeroPsameDay.push(y.pw); } }
  // 0 마을 수(날마다)
  const zeroN = W.map((r) => r.vils.filter((v) => v.n > 0 && v.wood < 1).length);
  OUT[z] = {
    days: [days[0], days[days.length - 1]], vils: W.length ? W[W.length - 1].vils.length : 0, zeroMed: med(zeroN),
    loops, noBest, gateFail, dep: dep.length, depWoodCand: depW.length, depWoodCandPct: pct(depW.length, dep.length), chWood: chW.length, chWoodToZero: wToZero,
    byRes: Object.entries(byRes).sort((a, b) => b[1] - a[1]).slice(0, 8), lost, lostEx,
    wFrom: Object.entries(wFrom).sort((a, b) => b[1] - a[1]).slice(0, 8), wDest: Object.entries(wDest).sort((a, b) => b[1] - a[1]).slice(0, 8),
    surplusDays: vDays, surplusNoLoop: vNoLoop, surplusNoLoopCap: vNoLoopCap,
    pairs: pair.size, pairsSent, pairsNever: pair.size - pairsSent, mainReason: Object.entries(mainR).sort((a, b) => b[1] - a[1]), statAll: Object.entries(stat).sort((a, b) => b[1] - a[1]),
    distMed: Object.fromEntries(Object.entries(distBy).map(([k, a]) => [k, med(a)])), woodBestDistMed: med(wbDist),
    price: { cap: +cap.toFixed(1), zeroMed: med(pz), zeroP10: q(pz, 0.1), zeroAtCapPct: pct(pzCap.reduce((s, x) => s + x, 0), pzCap.length), nonZeroMed: med(pnz), nonZeroP90: q(pnz, 0.9),
      destOfWoodMed: med(destP), zeroSameDayMed: med(zeroPsameDay) },
  };
}
fs.writeFileSync(path.join(OUTD, `t656_${TAG}.json`), JSON.stringify(OUT, null, 1));
if (!md) { console.log(JSON.stringify(OUT, null, 1)); process.exit(0); }
for (const [z, o] of Object.entries(OUT)) {
  console.log(`### ${z} (날 ${o.days.join('~')} · 마을 ${o.vils} · 0 마을 중앙 ${o.zeroMed})`);
  console.log(`| 칸 | 값 |\n|---|---|`);
  console.log(`| 발주 바퀴 · 이익 다리 0 · 관문 막힘 · 출발 | ${o.loops} · ${o.noBest} · ${o.gateFail} · **${o.dep}** |`);
  console.log(`| 통나무가 후보였던 출발 | **${o.depWoodCand}/${o.dep} (${o.depWoodCandPct}%)** |`);
  console.log(`| 통나무를 실은 출발 · 그중 0 마을행 | ${o.chWood} · ${o.chWoodToZero} |`);
  console.log(`| 통나무 후보인데 다른 화물(이익 0 · 단위이익 낮음 · 단위이익은 높은데 총이익 낮음 · 덮임) | ${o.lost.noProfit} · ${o.lost.unitLower} · ${o.lost.qtyLower} · ${o.lost.override} |`);
  console.log(`| 통나무 남는 마을-날 · 루프 안 돎 · 그중 여유 노동 꽉 참 | ${o.surplusDays} · ${o.surplusNoLoop} · ${o.surplusNoLoopCap} |`);
  console.log(`| 쌍(출발 → 0 마을) · 한 번이라도 감 · 못 감 | ${o.pairs} · ${o.pairsSent} · ${o.pairsNever} |`);
  console.log(`| 못 간 쌍의 주된 까닭 | ${o.mainReason.map(([k, n]) => `${k} ${n}`).join(' · ')} |`);
  console.log(`| 그림자가격 0 마을 중앙(p10) · 상한 닿음 · 나머지 중앙(p90) · 상한 | ${o.price.zeroMed}(${o.price.zeroP10}) · ${o.price.zeroAtCapPct}% · ${o.price.nonZeroMed}(${o.price.nonZeroP90}) · ${o.price.cap} |`);
  console.log(`| 통나무 받은 마을 값 중앙 · 같은 날 0 마을 값 중앙 | ${o.price.destOfWoodMed} · ${o.price.zeroSameDayMed} |`);
  console.log(`| 화물 순위 | ${o.byRes.map(([k, n]) => `${k} ${n}`).join(' · ')} |`);
  console.log(`| 통나무 보낸 마을 | ${o.wFrom.map(([k, n]) => `${k} ${n}`).join(' · ')} |`);
  console.log(`| 통나무 받은 마을 | ${o.wDest.map(([k, n]) => `${k} ${n}`).join(' · ')} |`);
  console.log('');
}
