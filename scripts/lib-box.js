'use strict';
// (@regress 없음 — 러너 밖 · 판 자 공용 · 제품 무변)
// === scripts/lib-box.js — 이 상자의 "수 지문" (T1410 ③ · T1396 회부 8 · T1395 ②) ======================================
//
// ★왜: 끈 판 자(`server-baseline-check`)가 main 그대로에서 상자마다 갈렸다 — 맥(arm64)은 `다름 1/1`(econ 날 지문 날 219 · 마을 칸 날 1 `_oreCells`),
//   리눅스 컨테이너(x64)는 `같음 1/1`. 같은 Node(22.23 · V8 12.4.254.21)인데 **초월 함수 결과가 상자마다 1ulp 갈린다** — 표본 2,000 입력에서
//   pow 2 · exp 1 · sin 13 · cos 10 · atan2 2(arm64 ↔ x64 · log · tanh 0 · `계측/T1410_2026-11-21/상자지문_arm_x64.txt`). econ 은 혼돈계라 1ulp 가 수백 날 뒤 지문을 가른다.
//   ⇒ 기준선이 구워진 상자와 지금 상자의 "수 지문"이 다르면 갈림은 제품 증거가 아니다 — 판 자가 그 사실을 말하게 한다(제품 0줄).
// 쓰는 법:
//   const BX = require('./lib-box'); BX.box()            // { arch, node, v8, math: 지문 12자 }
//   BX.verdict(cur, base, same)                         // { rc, line } — 판 자 끝맺음(같음 0 · 다름 1 · 상자 다름 + 다름 = 75 유보)
const crypto = require('crypto');
const FN = { pow: (x, y) => Math.pow(x, y), exp: (x) => Math.exp(x), log: (x) => Math.log(x), sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), atan2: (x, y) => Math.atan2(x, y), tanh: (x) => Math.tanh(x) };
//   지문 — 함수마다 정해진 입력 N 개(정수 해시로 지은 수 · 벽시계 · 난수 0)의 결과 비트를 sha1 로. 2만 개면 arm64 ↔ x64 를 가른다(위 표본 비율 × 10).
function math(n) {
  n = n || 20000;
  const h = crypto.createHash('sha1'), b = Buffer.alloc(8);
  for (const k of Object.keys(FN)) {
    let s = 0x9e3779b9;
    for (let i = 0; i < n; i++) {
      s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0;
      const a = (s / 4294967296) * 20 + 1e-3, c = ((Math.imul(s, 3266489917) >>> 0) / 4294967296) * 3 - 0.5;
      b.writeDoubleBE(FN[k](a, c)); h.update(b);
    }
  }
  return h.digest('hex').slice(0, 12);
}
function box() { return { arch: process.arch, node: process.version, v8: process.versions.v8, math: math() }; }
//   판 자 끝맺음 — 기준선 상자(`base` — 없으면 모름)와 지금 상자(`cur`)의 수 지문이 다르고 판이 다르면 75(유보 · 빨강 아님 — `run-regress` 와 같은 수).
//   같으면 종전 그대로(같음 0 · 다름 1). 판이 같으면 상자가 달라도 0(같음은 같음이다).
function verdict(cur, base, same) {
  if (same) return { rc: 0, line: base && base.math && cur.math !== base.math ? `(상자 수 지문이 기준선과 다르다 — ${base.arch} ${base.math} ↔ ${cur.arch} ${cur.math} · 그래도 같음)` : '' };
  if (base && base.math && cur.math !== base.math) return { rc: 75, line: `⚠ 유보 — 상자 수 지문이 기준선과 다르다(기준선 ${base.arch} ${base.node} ${base.math} ↔ 이 상자 ${cur.arch} ${cur.node} ${cur.math}): 초월 함수가 1ulp 갈리는 상자라 이 다름은 제품 증거가 아니다 — 기준선을 구운 상자에서 다시 돌려라` };
  return { rc: 1, line: base && base.math ? '' : '(기준선 상자 수 지문 없음 — 상자 탓인지 못 가른다)' };
}
module.exports = { math, box, verdict, FN };
if (require.main === module) console.log(JSON.stringify(box()));
