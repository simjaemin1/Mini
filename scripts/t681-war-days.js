#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T681 계측 · 제품 무변)
// === scripts/t681-war-days.js — 서버 판 자 한 판의 **전쟁 날 표**(선포 → 주둔 링 도착 → 전투 끝 → 귀환)를 낸다 ==========
//   쓰는 법: node scripts/t681-war-days.js <판 디렉터리>/<TAG>-<시드>.log
//   ★읽는 것: 아이 존 로그의 war-core 줄(`⚔️ D<날> …` — 선전포고 · 앞 도착 · 전투 … → 공격승/방어승 · 귀환) — 읽기만.
//   ★낸다: 전쟁 수 · 끝난 전투 수 · 날 차(도착 − 선포 · 전투 끝 − 선포 · 귀환 − 선포)의 분포 · 전쟁마다 한 줄(공격→방어 · 날 넷).
'use strict';
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const wars = [];   // 같은 쌍의 전쟁이 차례로 다시 선다 — 쌍마다 열린 전쟁 하나를 쥔다
const open = new Map();
for (const L of lines) {
  let m = L.match(/⚔️ D(\d+) (\S+?)→(\S+?) 선전포고/);
  if (m) { const w = { atk: m[2], def: m[3], declare: +m[1], arrive: null, battle: null, result: null, ret: null }; wars.push(w); open.set(m[2] + '>' + m[3], w); continue; }
  m = L.match(/⚔️ D(\d+) (\S+) → (\S+) 앞 도착/);
  if (m) { const w = open.get(m[2] + '>' + m[3]); if (w && w.arrive == null) w.arrive = +m[1]; continue; }
  m = L.match(/⚔️ D(\d+) 전투 (\S+) vs (\S+?)\[[^\]]*\] → (\S+)/);
  if (m) { const w = open.get(m[2] + '>' + m[3]); if (w && w.battle == null) { w.battle = +m[1]; w.result = m[4]; } continue; }
  m = L.match(/⚔️ D(\d+) (\S+) 귀환 —/);
  if (m) { for (const w of open.values()) if (w.atk === m[2] && w.ret == null) { w.ret = +m[1]; open.delete(w.atk + '>' + w.def); break; } continue; }
}
const hist = (xs) => { const h = {}; for (const x of xs) h[x] = (h[x] || 0) + 1; return Object.keys(h).map(Number).sort((a, b) => a - b).map((k) => `${k}:${h[k]}`).join(' '); };
const d = (k) => wars.filter((w) => w[k] != null).map((w) => w[k] - w.declare);
console.log(JSON.stringify({
  log: process.argv[2], wars: wars.length, arrived: d('arrive').length, battles: d('battle').length, returned: d('ret').length,
  arriveMinusDeclare: hist(d('arrive')), battleMinusDeclare: hist(d('battle')), returnMinusDeclare: hist(d('ret')),
  rows: wars.map((w) => `${w.atk}→${w.def} D${w.declare} 도착${w.arrive ?? '—'} 전투${w.battle ?? '—'}(${w.result ?? ''}) 귀환${w.ret ?? '—'}`),
}, null, 1));
