#!/usr/bin/env node
// (@regress 없음 — PM 착지 게이트 · 러너 밖)
// === scripts/editor-baked-check.js — 맵 에디터 내장 작업(lab/map-editor-baked.json)이 정본과 같은가 ===
// ★왜(PM 10-03 · 재민 "맵 에디터 최종본이 완전 옛날 거"): 내장 작업은 07-31 판에서 한 번도 다시 안 뽑혔다 —
//   T550(닛폰 정본) · T580(다리) · 자잘 광맥이 정본에 들어가도 에디터는 옛 세계를 "최신"이라 띄웠다.
//   에디터의 "낡음" 배너는 로컬 작업 ↔ 내장 작업만 견준다 — 내장 ↔ 정본은 아무도 안 봤다. 이 자가 그 칸이다.
// 쓰는 법: node scripts/editor-baked-check.js          → 같으면 0 · 다르면 1(무엇이 다른지)
//          node scripts/editor-baked-check.js --write  → 정본에서 다시 뽑아 lab/map-editor-baked.json 을 덮는다
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BAKED = path.join(ROOT, 'lab', 'map-editor-baked.json');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ebk-')), 'w.json');
execFileSync(process.execPath, [path.join(__dirname, 'export-editor-work.js')], { env: { ...process.env, EW_ZONE: 'hanbando', EW_OUT: tmp }, stdio: 'ignore' });
const work = JSON.parse(fs.readFileSync(tmp, 'utf8'));
const Z = require(path.join(ROOT, 'server', 'zone-config.js')); const zs = Z.ZONES_BASE || Z.ZONES || Z;
const bridges = {}; for (const k of Object.keys(zs)) if (zs[k] && zs[k].bridges && zs[k].bridges.length) bridges[k] = zs[k].bridges;
const fresh = JSON.stringify({ work, bridges }) + '\n';
if (process.argv.includes('--write')) { fs.writeFileSync(BAKED, fresh); console.log('[editor-baked] 다시 뽑음 · ' + work.stamp); process.exit(0); }
const cur = fs.existsSync(BAKED) ? fs.readFileSync(BAKED, 'utf8') : '';
if (cur === fresh) { console.log('[editor-baked] 정본과 같다 ✅ ' + work.stamp); process.exit(0); }
let old = {}; try { old = JSON.parse(cur); } catch (e) {}
console.log('[editor-baked] **정본과 다르다** ❌ 내장 ' + ((old.work && old.work.stamp) || '?') + ' ↔ 정본 ' + work.stamp
  + ' · 다리 ' + Object.keys(bridges).map((k) => k + ' ' + ((old.bridges && old.bridges[k] || []).length / 2) + '→' + bridges[k].length / 2).join(' ')
  + ' — `node scripts/editor-baked-check.js --write` 뒤 `node scripts/build-map-editor.js ~/Mini/map-editor.html`(맥 사본)');
process.exit(1);
