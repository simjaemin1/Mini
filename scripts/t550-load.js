#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T550 안 → 정본 nippon 절 · 다른 존 바이트 무변)
// 쓰는 법: node scripts/t550-load.js <안.json> [--strip]
//   `server/hanbando-terrain.json` 의 nippon 절을 안으로 **통째로** 바꾼다(다른 존 절은 같은 객체 그대로 → JSON.stringify 바이트 동일).
//   --strip: 안의 일꾼 칸(`_t550` · `_t549` · `_jm` · `_canyon` · `_bbox` · `_segIdx`)을 지운다 — 정본 적재(⑤) 때만.
//   절의 칸 차례는 한반도 절과 같게(rivers · lakes · ridges · passes · forests · ores · villages · valleys · 그 밖).
'use strict';
const fs = require('fs');
const path = require('path');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const STRIP = process.argv.includes('--strip');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const before = Object.fromEntries(Object.keys(world).filter((z) => z !== 'nippon').map((z) => [z, JSON.stringify(world[z])]));
const DROP = new Set(['_t550', '_t549', '_jm', '_canyon', '_bbox', '_segIdx']);
const clean = (v) => Array.isArray(v) ? v.map(clean) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).filter(([k]) => !(STRIP && DROP.has(k))).map(([k, x]) => [k, clean(x)])) : v;
const ORDER = ['rivers', 'lakes', 'ridges', 'passes', 'forests', 'ores', 'villages', 'valleys'];
const out = {};
for (const k of ORDER) if (plan[k] !== undefined) out[k] = clean(plan[k]);
for (const k of Object.keys(plan)) if (!(k in out) && !(STRIP && DROP.has(k))) out[k] = clean(plan[k]);
world.nippon = out;
for (const z of Object.keys(before)) if (JSON.stringify(world[z]) !== before[z]) { console.error(`[t550-load] ${z} 절이 바뀌었다 — 멈춘다`); process.exit(3); }
fs.writeFileSync(GAME, JSON.stringify(world));
console.log(`[t550-load] nippon ← ${process.argv[2]}${STRIP ? ' (일꾼 칸 지움)' : ''} · ` + ORDER.map((k) => `${k} ${(out[k] || []).length}`).join(' · '));
