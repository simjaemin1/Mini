#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1410 ③ — 끈 판 자가 상자마다 다른가: 제품 수 계산이 상자(cpu · node 판)를 타는지 지문으로 본다.
//   ⓐ Math 함수 지문 — pow · exp · log · sin · cos · atan2 · hypot · sqrt 를 정해진 입력 20만 개에 돌린 결과의 해시
//   ⓑ 광맥 확률장 지문 — `server/terrain.js` `oreProbAt('hanbando', x, y)` 를 존 격자(셀 32px · 16셀마다)에서 해시 · `_oreCells` 정렬 열쇠(p)의 정본
//   쓰는 법: node 계측/T1410_2026-11-21/상자지문.js [server 폴더]
const path = require('path'), crypto = require('crypto');
const SRV = process.argv[2] || path.join(__dirname, '..', '..', 'server');
const H = () => crypto.createHash('sha1');
const fm = {};
for (const [k, f] of Object.entries({ pow: (x, y) => Math.pow(x, y), exp: (x) => Math.exp(x), log: (x) => Math.log(x), sin: (x) => Math.sin(x), cos: (x) => Math.cos(x),
  atan2: (x, y) => Math.atan2(x, y), hypot: (x, y) => Math.hypot(x, y), sqrt: (x) => Math.sqrt(x), cbrt: (x) => Math.cbrt(x), tanh: (x) => Math.tanh(x) })) {
  const h = H(); let s = 0x9e3779b9;
  for (let i = 0; i < 200000; i++) { s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0; const a = (s / 4294967296) * 20 + 1e-3, b = ((Math.imul(s, 3266489917) >>> 0) / 4294967296) * 3 - 0.5;
    const v = f(a, b); h.update(String(v)); }
  fm[k] = h.digest('hex').slice(0, 10);
}
const T = require(path.join(SRV, 'terrain.js'));
const ho = H(); let n = 0, nz = 0;
for (let y = 0; y < 60000; y += 512) for (let x = 0; x < 60000; x += 512) { const p = T.oreProbAt('hanbando', x, y); ho.update(String(p)); n++; if (p) nz++; }
console.log(JSON.stringify({ arch: process.arch, node: process.version, v8: process.versions.v8, math: fm, ore: { n, nz, h: ho.digest('hex').slice(0, 12) } }));
