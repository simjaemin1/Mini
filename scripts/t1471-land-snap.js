#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 지도 고침 문의 픽스처를 굽는 자 · 제품 무변) [T1471 덧붙임 셋 2026-11-27 · S5]
// === scripts/t1471-land-snap.js — 라이브 존 DB 사본에서 **마을 땅 칸**(영토 · 마을 건물 행 칸 · 발자국 칸)을 뽑아 레포에 둘 작은 파일로 ==========
//   CI(`test-t1471-map-gate.js`)는 라이브 DB(100MB+)를 못 본다 — 그 대신 이 칸 모음을 본다(지도를 고친 가지가 이 칸 위에 산을 새로 세우면 빨강).
//   node scripts/t1471-land-snap.js <존 DB 사본> <존> <out.json.gz>
//   꼴: { zone, src, made, W, n, cells: base64(칸 번호 y*W+x 를 오름차순 차이 varint) } — gzip.
'use strict';
const path = require('path'), fs = require('fs'), zlib = require('zlib');
const [DB, ZONE, OUT] = process.argv.slice(2);
if (!DB || !ZONE || !OUT) { console.log('쓰는 법: node scripts/t1471-land-snap.js <존 DB 사본> <존> <out.json.gz>'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const Z = require(path.join(ROOT, 'server', 'zone-config')).ZONES[ZONE]; if (!Z) { console.log('모르는 존 ' + ZONE); process.exit(2); }
const W = Math.ceil(Z.zoneWidth / 32);
const TerrRows = require(path.join(ROOT, 'server', 'terr-rows.js'));
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(DB, { readOnly: true });
//   발자국 — 제품 `_vbFootprint` 와 같은 렉트(villages.js · 집 · 집터 · 의뢰 집 · 쉼터 6 × 4 · 곳간 5 × 3 · 회관 8 × 8)
const foot = (t, cx, cy) => t === 'hall' ? [cx - 4, cy - 4, cx + 3, cy + 3] : (t === 'house' || t === 'phouse' || t === 'shelter' || t === 'housesite' || t === 'psitework') ? [cx - 5, cy - 5, cx, cy - 2] : t === 'granary' ? [cx - 2, cy - 1, cx + 2, cy + 1] : [cx, cy, cx, cy];
const S = new Set();
for (const v of db.prepare('SELECT id FROM villages').all()) {
  const T = new Set();
  for (const r of db.prepare("SELECT id, type, cx, cy, floors, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id").iterate(v.id)) TerrRows.replay([r], T);
  for (const k of T) { const i = k.indexOf(','); S.add(+k.slice(i + 1) * W + +k.slice(0, i)); }
  for (const r of db.prepare("SELECT type, cx, cy FROM village_buildings WHERE village_id = ? AND type NOT IN ('terr','terrseq')").iterate(v.id)) {
    const R = foot(r.type, r.cx, r.cy); for (let y = R[1]; y <= R[3]; y++) for (let x = R[0]; x <= R[2]; x++) S.add(y * W + x);
  }
}
const a = [...S].filter((n) => n >= 0).sort((p, q) => p - q), bytes = [];
let prev = 0; for (const n of a) { let d = n - prev; prev = n; while (d >= 0x80) { bytes.push((d & 0x7f) | 0x80); d = Math.floor(d / 128); } bytes.push(d); }
const doc = { zone: ZONE, src: path.basename(path.dirname(DB)) + '/' + path.basename(DB), made: new Date().toISOString().slice(0, 10), W, n: a.length, cells: Buffer.from(bytes).toString('base64') };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(doc), { level: 9 }));
console.log(`[T1471 마을 땅] ${ZONE} · 칸 ${a.length} → ${OUT} (${fs.statSync(OUT).size} B)`);
