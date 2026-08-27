#!/usr/bin/env node
// === scripts/trade-metrics.js — 거래소 대리 지표 ================================
//
// ★[재민 확정 2026-08-27 · 검증 §] 지시가 요구한 세 가지를 **실측**한다:
//   ① 곡식 환산 시세표(여러 품목) — 그리고 **마을마다 다른가**(다르면 걸어갈 이유가 생긴다)
//   ② 스프레드별 왕복 손실 — s 를 바꿔 가며 A→B→A
//   ③ 물리 상한이 실제로 **얼마나 자주 무는가**
//
// ⚠이건 계측기지 하네스가 아니다 — PASS/FAIL 을 세지 않는다. 러너 목록에 넣지 마라.
// ⚠가격을 손으로 재계산하지 않는다. 전부 정본(`villageTradeBoard/Quote/Exec`)이 낸 수다.
//
// 실행: node scripts/trade-metrics.js [마을수=4]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const TMP = `/tmp/trade-metrics-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const NV = parseInt(process.argv[2], 10) || 4;
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(38000 + (process.pid % 800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1'; process.env.VILLAGE_MAX = String(NV);
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★★하루를 빠르게 돌린다 — **갓 시딩한 마을은 재고가 서로 똑같아 시세도 똑같다.**
//   1차 측정이 그래서 10품목 중 8종이 `×1.0`(전 마을 동일)이 나왔다. 그건 "마을마다 다르지 않다"가
//   아니라 **아직 살아 보지 않았다**는 뜻이다. 며칠 살려 놓고 재야 생산·소비·교역이 시세를 갈라 놓는다.
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || '300';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const V = H.SimVillages, T = H.Trade;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => String(s).padStart(n);

(async () => {
  console.log('\n=== 거래소 대리 지표 (정본 함수만 사용) ===');
  let list = [];
  for (let i = 0; i < 200; i++) { list = V.clientVillages ? V.clientVillages() : []; if (list && list.length >= 1) break; await sleep(1000); }
  const WARM_S = Math.max(0, parseInt(process.env.TM_WARM_S || '45', 10));
  console.log(`  마을 ${list.length}곳 시딩됨 — ${WARM_S}초 데운다(하루 ${process.env.VILLAGE_DAY_MS}ms)`);
  await sleep(WARM_S * 1000);
  // ★데운 뒤 **얼린다** — 아래 ②가 재고를 되돌려 가며 재는데, 그 사이에 날이 흐르면
  //   되돌린 자리가 이미 다른 자리다(계측기가 자기 실험을 오염시킨다).
  if (V.__e2eDayFreeze) { const f = V.__e2eDayFreeze(true); console.log(`  게임일 ${f.day} 에서 정지`); }
  const at = (cv) => [cv.cx * 32 + 16, cv.cy * 32 + 16];
  const B = (cv, inv) => { const [x, y] = at(cv); return V.villageTradeBoard(cv.id, x, y, inv || {}); };
  const Q = (cv, a, b, q) => { const [x, y] = at(cv); return V.villageTradeQuote(cv.id, x, y, a, b, q); };
  const X = (cv, inv, a, b, q) => { const [x, y] = at(cv); return V.villageTradeExec(cv.id, x, y, inv, a, b, q); };

  // ── ① 곡식 환산 시세표 ─────────────────────────────────────────────────────
  console.log('\n① 곡식 환산 시세 — 같은 물건이 마을마다 얼마나 다른가');
  const b0 = B(list[0]);
  console.log(`   기준 품목: ${b0.numeraireKo}(${b0.numeraire}) · 스프레드 ${b0.spread}`);
  const resAll = [...new Set(list.flatMap((cv) => B(cv).rows.map((r) => r.res)))];
  const head = list.map((cv) => pad(cv.name.slice(0, 6), 9)).join('');
  console.log(`   ${pad('품목', 10)}${head}   ${pad('최대/최소', 10)}`);
  for (const res of resAll) {
    const vals = list.map((cv) => (B(cv).rows.find((r) => r.res === res) || {}).num);
    const fin = vals.filter((v) => v != null && v > 0);
    if (fin.length < 2) continue;
    const ratio = Math.max(...fin) / Math.min(...fin);
    const ko = (B(list[0]).rows.find((r) => r.res === res) || {}).ko || res;
    console.log(`   ${pad(ko, 10)}${vals.map((v) => pad(v == null ? '—' : v, 9)).join('')}   ${pad('×' + ratio.toFixed(1), 10)}`);
  }
  console.log('   ⇒ 배수가 클수록 "걸어가서 사고파는" 이유가 크다(§3.2 정보 비대칭 = 콘텐츠).');

  // ── ② 스프레드별 왕복 손실 ─────────────────────────────────────────────────
  //   ★★판마다 **재고를 원위치로 되돌린다.** 안 그러면 앞 판이 다음 판의 시세를 바꿔
  //     s 가 아니라 **실행 순서**를 재게 된다(계측기가 자기 앞판을 재는 고전적 함정).
  //   ★★그리고 **거래 크기를 재고에 견줘 작게** 잡는다. 1차 측정은 그러지 않아
  //     `열매 1761개 ↔ 가죽 11개`(재고의 10배를 쏟아부음)가 나왔고, 손실이 81%→73%→75%→78%→77% 로
  //     **s 와 무관하게 널뛰었다** — 스프레드가 아니라 **내가 만든 가격 붕괴**를 재고 있었던 것이다.
  //     크기를 재고의 5%로 낮추면 가격 충격이 작아져 스프레드 효과가 드러난다.
  //   ★비교 기준으로 **스프레드만의 이론 손실** `1−((1−s)/(1+s))²` 를 나란히 찍는다.
  //     측정값 − 이론값 = **가격 충격 몫**이다(그게 곡선 적분이 하는 일).
  console.log('\n② 왕복 손실 vs 스프레드 — A→B→A (내 거래가 만든 값 변화는 내가 못 먹는다)');
  const keep = T.CFG.SPREAD;
  const host = V.banditHost && V.banditHost();
  // 짝 고르기: 양쪽 재고가 넉넉하고(≥40) 값이 서로 비슷한(≤4배) 쌍 — 그래야 작은 거래로도 정수 절삭이 안 지배한다.
  let best = null;
  for (const c of list) {
    const rs = B(c).rows.filter((r) => r.canGive && r.canTake && r.stock >= 40 && r.num > 0);
    for (const a of rs) for (const b of rs) {
      if (a.res === b.res) continue;
      const rat = Math.max(a.num / b.num, b.num / a.num);
      if (rat > 4) continue;
      const score = Math.min(a.stock, b.stock) / rat;
      if (!best || score > best.score) best = { c, a, b, rat, score };
    }
  }
  if (!best) console.log('   ⚠재고 40 이상 + 값이 4배 이내인 쌍이 어느 마을에도 없다 — 이 판에선 못 잰다');
  const vilObj = best && host && (host.villages || []).find((x) => x && (x.dbId === best.c.id || x.id === best.c.id));
  if (!best) { /* skip */ } else if (!(vilObj && vilObj.econ)) {
    console.log(`   ⚠마을 객체를 못 잡았다(banditHost ${host ? 'ok' : '없음'} · 마을 ${host ? (host.villages || []).length : 0}곳)`);
  } else {
    const cv2 = best.c, A = best.a.res, Bb = best.b.res;
    const itemOf = (res) => { const r = B(cv2).rows.find((x) => x.res === res); return r ? (r.give[0] || r.item) : null; };
    const N0 = Math.max(40, Math.floor(Math.min(best.a.stock, best.b.stock) * 0.05));
    console.log(`   ${cv2.name} — 짝: ${best.a.ko}(재고 ${best.a.stock} · ${best.a.num}) ↔ ${best.b.ko}(재고 ${best.b.stock} · ${best.b.num})`);
    console.log(`   ${N0}개로 왕복 (재고의 ${(100 * N0 / Math.min(best.a.stock, best.b.stock)).toFixed(1)}%)`);
    console.log(`   ${pad('s', 6)}${pad('A→B', 7)}${pad('B→A', 8)}${pad('측정 손실', 11)}${pad('스프레드만', 11)}${pad('가격충격 몫', 12)}`);
    const meas = [];
    for (const sp of [0, 0.02, 0.05, 0.10, 0.20]) {
      const st = vilObj.econ.storage;
      const snap = { [A]: st[A], [Bb]: st[Bb] };            // ★스냅샷
      let line;
      try {
        T.CFG.SPREAD = sp;
        const inv = { [itemOf(A)]: N0 };
        const r1 = X(cv2, inv, A, Bb, N0);
        let r2 = null, back = 0;
        if (!r1.err) { r2 = X(cv2, inv, Bb, A, r1.take); back = r2.err ? 0 : r2.take; }
        const loss = (N0 - back) / N0;
        const theo = 1 - Math.pow((1 - sp) / (1 + sp), 2);
        meas.push({ sp, loss, ok: !r1.err });
        line = `   ${pad(sp.toFixed(2), 6)}${pad(r1.err ? '—' : r1.take, 7)}${pad(r2 && !r2.err ? r2.take : '—', 8)}`
             + `${pad((loss * 100).toFixed(1) + '%', 11)}${pad((theo * 100).toFixed(1) + '%', 11)}`
             + `${pad(((loss - theo) * 100).toFixed(1) + '%p', 12)}` + (r1.err ? `  (${r1.err})` : '');
      } finally {
        st[A] = snap[A]; st[Bb] = snap[Bb];                 // ★복원 — 계측이었지 거래가 아니다
        T.CFG.SPREAD = keep;
      }
      console.log(line);
    }
    // ★결론을 **데이터에서** 낸다 — 고정 문구를 찍으면 그건 측정이 아니라 주장이다.
    const good = meas.filter((m) => m.ok);
    const mono = good.every((m, i) => i === 0 || m.loss >= good[i - 1].loss - 1e-9);
    const zero = good.find((m) => m.sp === 0);
    console.log(`   ⇒ s 가 커질수록 손실이 ${mono ? '**단조 증가**한다' : '**단조 증가하지 않는다** ← 크기가 커서 가격 충격이 지배한 것이다(위 주석)'}`);
    if (zero) console.log(`   ⇒ s=0 에서도 손실 ${(zero.loss * 100).toFixed(1)}% — 스프레드가 0 이어도 왕복이 이득이 아니다`
      + `(그게 \`planSliced\` 곡선 적분의 존재 이유다).`);
  }

  // ── ③ 물리 상한이 무는 빈도 ────────────────────────────────────────────────
  console.log('\n③ 물리 상한(재고 × ' + T.CFG.STOCK_FRAC + ')이 실제로 무는 빈도');
  let cells = 0, zero = 0, tiny = 0;
  for (const c of list) {
    for (const r of B(c).rows) {
      if (!r.canTake) continue;
      cells++;
      if (r.sell <= 0) zero++;
      else if (r.sell < 5) tiny++;
    }
  }
  console.log(`   마을×품목 ${cells}칸 중 — 마을이 **한 개도 못 내주는** 칸 ${zero}(${(100 * zero / cells).toFixed(0)}%) · 5개 미만 ${tiny}(${(100 * tiny / cells).toFixed(0)}%)`);
  console.log('   ⇒ "마을은 없는 걸 못 준다"(B-1)가 거래소에서도 그대로 보인다. 작은 마을 거래소는 대부분 비어 있다(회부 B-5).');
  console.log('   ★같은 상한을 게시판도 쓴다 — 800일 3시드 실측에서 **못 갚아서 못 게시한 의뢰 44,875~54,953건** 대 게시 1,487~1,561건.');
  console.log('     즉 이 상한은 **거의 항상 무는** 제약이고, 그게 의뢰가 희소한 이유다.');
  console.log('');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
