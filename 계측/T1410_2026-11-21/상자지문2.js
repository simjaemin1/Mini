#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1410 ③ — Math 함수 결과를 상자끼리 맞대는 표본: 함수마다 입력 2,000 개의 결과 비트(16진)를 낸다(다른 상자 출력과 줄마다 견준다).
const fs = require('fs');
const out = {}; const b = Buffer.alloc(8);
const hex = (v) => { b.writeDoubleBE(v); return b.toString('hex'); };
for (const [k, f] of Object.entries({ pow: (x, y) => Math.pow(x, y), exp: (x) => Math.exp(x), log: (x) => Math.log(x), sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), atan2: (x, y) => Math.atan2(x, y), tanh: (x) => Math.tanh(x) })) {
  let s = 0x9e3779b9; const L = [];
  for (let i = 0; i < 2000; i++) { s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0; const a = (s / 4294967296) * 20 + 1e-3, c = ((Math.imul(s, 3266489917) >>> 0) / 4294967296) * 3 - 0.5; L.push(hex(f(a, c))); }
  out[k] = L;
}
fs.writeFileSync(process.argv[2] || '/dev/stdout', JSON.stringify({ arch: process.arch, out }));
