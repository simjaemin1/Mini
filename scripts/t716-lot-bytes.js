#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T716 계측기 · 제품 무접촉 · 판정 0)
// === scripts/t716-lot-bytes.js — 로트 하나가 힙에서 몇 바이트인가(꼴 둘 · 배열 크기 셋) ===
//
// ★왜 [T716 ③] 로트 수(그림자 장부 `t716-lots-probe.js`)에 곱할 한 개의 값. 어림이 아니라 V8 힙을 잰다:
//   gc → heapUsed 0점 → 로트 N 개를 (마을 × 재화) 배열에 나눠 담는다 → gc → heapUsed 차 ÷ N.
//   꼴 A = 지금 `lots.js` 레코드 `{ d, n, e, t, m, w }`(여섯 칸 · 플레이어·상자 로트 그대로) ·
//   꼴 B = 그림자 장부 `{ k, q, d }`(세 칸 — 얻은 순간 · 양 · 날).
//   JSON 바이트는 꼴 A 를 그대로 직렬화한 길이(저장 꼴).
//
// 쓰는 법: node --expose-gc scripts/t716-lot-bytes.js [--n 200000]
'use strict';
if (typeof global.gc !== 'function') {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, ['--expose-gc', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status == null ? 2 : r.status);
}
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const N = arg('--n', 200000);
const gcAll = () => { for (let i = 0; i < 4; i++) global.gc(); };
const heap = () => { gcAll(); return process.memoryUsage().heapUsed; };
const mkA = (i) => ({ d: 20000 + (i % 400), n: 1.234567 + (i % 7), e: 0.5 + (i % 13) / 7, t: 20400, m: 0.7, w: 0.55 });
const mkB = (i) => ({ k: 4.0e6 + i, q: 1.234567 + (i % 7), d: 20000 + (i % 400) });
function measure(mk, perArr) {
  const arrs = Math.ceil(N / perArr);
  let keep = null;
  const h0 = heap();
  keep = new Array(arrs);
  for (let a = 0, i = 0; a < arrs; a++) { const arr = []; for (let j = 0; j < perArr && i < N; j++, i++) arr.push(mk(i)); keep[a] = arr; }
  const h1 = heap();
  const per = (h1 - h0) / N;
  const json = JSON.stringify(keep.slice(0, Math.min(arrs, 2000))).length / Math.min(N, 2000 * perArr);
  keep = null;
  return { per: +per.toFixed(1), json: +json.toFixed(1) };
}
const out = { N, node: process.version, rows: [] };
for (const perArr of [5, 50, 500]) {
  const A = measure(mkA, perArr), B = measure(mkB, perArr);
  out.rows.push({ perArr, A_heapB: A.per, A_jsonB: A.json, B_heapB: B.per, B_jsonB: B.json });
}
console.log(JSON.stringify(out));
