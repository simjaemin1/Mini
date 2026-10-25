#!/usr/bin/env node
// === scripts/t926-map-churn.js — 칸 캐시 꼴 Map 찾기 값(T926) — 계측 자 · 러너 밖 · 서버 없음 ==========================================
//
//   `E2E_BROWSER`(기본 chromium · `webkit`)의 빈 페이지에서 칸 캐시(`_waterCellCache` 꼴 — 열쇠 "zid_tx_ty" · 값 불리언)와 같은 꼴의 Map 을 만들고
//   한 판 그리기가 묻는 만큼(카메라 둘레 9,000 칸)을 **새로 만든 열쇠 문자열로** 찾는 데 드는 값(ns/번)을 잰다:
//     A 새 Map — 둘레 30,000 칸만 넣은 것
//     B 같은 30,000 칸 + 지우기 갈마듦 — 먼 칸 20,000 을 넣고 지우기를 R 번(T926 손잡이 켬의 자리 칸 지우기 꼴) 한 뒤
//     C 큰 Map — 300,000 칸(손잡이 끔의 한 시간 끝 꼴)
//     D B 를 통째로 비우고(`clear()`) 둘레 30,000 을 다시 넣은 것
//   판정 0 — 값만 적는다. 실행: [E2E_BROWSER=webkit] node scripts/t926-map-churn.js [--rounds 200] [--rep 5]
'use strict';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROUNDS = +arg('--rounds', '200'), REP = +arg('--rep', '5');
const BR = require('./e2e-browser').which();
(async () => {
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await page.goto('about:blank');
  const out = [];
  for (let rep = 0; rep < REP; rep++) {
    const r = await page.evaluate(([ROUNDS]) => {
      const W = 600, key = (i) => 'hanbando_' + (1000 + (i % W)) + '_' + (2000 + Math.floor(i / W));   // 칸 i → 열쇠(가로 600칸 줄)
      const fill = (m, a, b) => { for (let i = a; i < b; i++) m.set(key(i), (i % 7) === 0); };
      // 한 판 찾기 — 둘레 9,000 칸(앞 30,000 칸 안) · 열쇠 문자열은 그때그때 새로 만든다(isWaterAtAbs 와 같은 꼴)
      const look = (m) => { let s = 0; const t0 = performance.now(); for (let p = 0; p < 20; p++) for (let i = 0; i < 9000; i++) { const v = m.get(key(i * 3 + (p % 3))); if (v) s++; } return { ns: +((performance.now() - t0) * 1e6 / (20 * 9000)).toFixed(1), s }; };
      const A = new Map(); fill(A, 0, 30000); look(A);   // 첫 찾기는 데우기(JIT) — 버린다
      const B = new Map(); fill(B, 0, 30000);
      const tc0 = performance.now();
      for (let r = 0; r < ROUNDS; r++) { const base = 30000 + (r % 13) * 20000; fill(B, base, base + 20000); for (let i = base; i < base + 20000; i++) B.delete(key(i)); }
      const churnMs = Math.round(performance.now() - tc0);
      const C = new Map(); fill(C, 0, 300000);
      const res = { A: look(A), B: look(B), C: look(C), sizes: [A.size, B.size, C.size], churnMs };
      B.clear(); fill(B, 0, 30000); res.D = look(B);
      return res;
    }, [ROUNDS]);
    out.push(r);
    console.log(`  [${rep}] ns/번 — A 새 30k ${r.A.ns} · B 지우기 ${ROUNDS}번 뒤 ${r.B.ns} · C 300k ${r.C.ns} · D 비우고 다시 ${r.D.ns} · 갈마듦 ${r.churnMs}ms · 크기 ${r.sizes.join('/')}`);
  }
  const med = (k) => { const a = out.map((r) => r[k].ns).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.log(`=== T926 Map 찾기 값 — ${BR} · 중앙 A ${med('A')} · B ${med('B')} · C ${med('C')} · D ${med('D')} ns/번 ===`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
