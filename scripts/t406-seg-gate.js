#!/usr/bin/env node
// === scripts/t406-seg-gate.js — 능선·강 선분 색인 켬 게이트 (T406 ①) ==================
//
// ★계측기다 — 러너 밖. 제품은 읽기만 한다.
// ★게이트: **존 전체 청크 산출 해시** — 켬/끔이 비트로 같아야 켠다(다르면 켜지 않는다 · 카드 §1).
//   · 한반도 8,763청크 + `europa`(#65 1위) 전 청크 — `generateChunkResources` + `overflowInto`
//     (나무·군락·덤불·바위·광맥·운철 — 청크가 켜질 때 서는 그대로)의 id·종류·좌표·종·단계
//   · 술어 답 1,000점 — `isRockCellLocal` · `isWaterCellLocal` (무작위 700 + **능선 옆 300** —
//     무작위만 쓰면 99%가 뭍이라 같음이 공짜다 · test-segindex 의 문법)
//   · 색인 메모리(MB) — 켠 판의 힙 차(`--expose-gc`) + 적재 수
// ★플래그는 모듈 적재 때 읽힌다 → **자식 둘**(`TERRAIN_SEG_INDEX=0` / `=1`). 부모가 비트로 맞춘다.
//
// 실행: node scripts/t406-seg-gate.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PTS = '/tmp/t406-pts.json';

if (process.argv[2] === '--child') {
  const gc = global.gc || (() => {});
  gc(); const heap0 = process.memoryUsage().heapUsed;
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const terrain = require(path.join(ROOT, 'server', 'terrain'));
  if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
  const chunk = require(path.join(ROOT, 'server', 'chunk'));
  const cs = chunk.CHUNK_SIZE;
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const out = { flag: process.env.TERRAIN_SEG_INDEX, zones: {} };
  for (const zid of ['hanbando', 'europa']) {
    const Z = ZONES[zid];
    const cx1 = Math.ceil(Z.zoneWidth / cs), cy1 = Math.ceil(Z.zoneHeight / cs);
    const H = crypto.createHash('sha1');
    const per = [];
    let ents = 0;
    const t0 = now();
    for (let cy = 0; cy < cy1; cy++) for (let cx = 0; cx < cx1; cx++) {
      const h = crypto.createHash('sha1');
      const list = chunk.generateChunkResources(zid, Z.biome, cx, cy, cs, null, 0)
        .concat(chunk.overflowInto(zid, Z.biome, cx, cy, cs, null, 0));
      for (const r of list) h.update(`${r.id}|${r.type}|${r.x}|${r.y}|${r.sp || ''}|${r.regrown || ''};`);
      ents += list.length;
      const d = h.digest('hex').slice(0, 12);
      per.push(d); H.update(d);
    }
    out.zones[zid] = { chunks: per.length, ents, ms: now() - t0, hash: H.digest('hex').slice(0, 16), per };
  }
  // 술어 1,000점
  const pts = JSON.parse(fs.readFileSync(PTS, 'utf8'));
  let bits = '';
  let t = now();
  for (const [zid, x, y] of pts) bits += (terrain.isRockCellLocal(zid, x, y) ? '1' : '0') + (terrain.isWaterCellLocal(zid, x, y) ? '1' : '0');
  out.predMs = now() - t;
  out.bits = bits;
  // 색인 모양·메모리
  let paths = 0, built = 0, entries = 0, cells = 0;
  for (const zid of ['hanbando', 'europa']) {
    const T = terrain.ZONE_TERRAIN && terrain.ZONE_TERRAIN[zid]; if (!T) continue;
    for (const k of ['rivers', 'ridges', 'valleys']) for (const p of (T[k] || [])) {
      paths++; const ix = p._segIdx; if (ix) { built++; entries += ix.entries; cells += ix.used; }
    }
  }
  gc(); out.heapMB = (process.memoryUsage().heapUsed - heap0) / 1048576;
  out.idx = { paths, built, entries, cells };
  // ★결과는 **파일**로 낸다 — 모듈이 적재 중에 stdout 에 찍는 줄이 섞이면 JSON 이 깨진다(1차 판 실측).
  fs.writeFileSync(process.env.T406_OUT, JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const CANON = require(path.join(ROOT, 'server', 'hanbando-terrain.json'));
let s = 20260926; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pts = [];
for (const zid of ['hanbando', 'europa']) {
  const Z = ZONES[zid];
  const n = zid === 'hanbando' ? 500 : 200;
  for (let i = 0; i < n; i++) pts.push([zid, rnd() * Z.zoneWidth, rnd() * Z.zoneHeight]);   // 무작위(비-셀중심)
}
// 능선 옆 300 — 능선 path 점에서 폭의 0~0.8배 안팎으로(경계 양쪽이 둘 다 나오게)
const ridgePts = [];
for (const zid of ['hanbando', 'europa']) for (const r of ((CANON[zid] || {}).ridges || [])) {
  for (const p of r.path || []) ridgePts.push([zid, p.pos ? p.pos[0] : p[0], p.pos ? p.pos[1] : p[1], (p.width != null ? p.width : (r.width || 200))]);
}
for (let i = 0; i < 300 && ridgePts.length; i++) {
  const [zid, x, y, w] = ridgePts[Math.floor(rnd() * ridgePts.length)];
  const a = rnd() * Math.PI * 2, d = rnd() * w * 0.8;
  pts.push([zid, x + Math.cos(a) * d, y + Math.sin(a) * d]);
}
fs.writeFileSync(PTS, JSON.stringify(pts));
const child = (flag) => {
  const f = `/tmp/t406-gate-${flag}.json`;
  execFileSync(process.execPath, ['--expose-gc', __filename, '--child'],
    { env: { ...process.env, TERRAIN_SEG_INDEX: flag, T406_OUT: f }, stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT });
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};
const off = child('0'), on = child('1');

const f1 = (v) => (+v).toFixed(1), f2 = (v) => (+v).toFixed(2);
console.log('=== 선분 색인 켬 게이트 — 존 전체 청크 산출 해시 · 술어 1,000점 (T406 ①) ===');
console.log('| 존 | 청크 | 개체 | 끔 해시 | 켬 해시 | 다른 청크 | 끔 ms(전체) | 켬 ms(전체) | 배율 |');
console.log('|---|---:|---:|---|---|---:|---:|---:|---:|');
let allSame = true;
for (const zid of Object.keys(off.zones)) {
  const a = off.zones[zid], b = on.zones[zid];
  let diff = 0; for (let i = 0; i < a.per.length; i++) if (a.per[i] !== b.per[i]) diff++;
  if (diff || a.hash !== b.hash || a.ents !== b.ents) allSame = false;
  console.log(`| ${zid} | ${a.chunks.toLocaleString()} | ${a.ents.toLocaleString()} | \`${a.hash}\` | \`${b.hash}\` | **${diff}** | ${f1(a.ms)} | ${f1(b.ms)} | ×${f1(a.ms / b.ms)} |`);
}
let bd = 0, rockT = 0, watT = 0;
for (let i = 0; i < off.bits.length; i++) { if (off.bits[i] !== on.bits[i]) bd++; if (off.bits[i] === '1') { if (i % 2 === 0) rockT++; else watT++; } }
if (bd) allSame = false;
console.log('');
console.log(`술어 ${pts.length.toLocaleString()}점(무작위 700 + 능선 옆 300) × 둘 — 다른 답 **${bd}** · 참: 바위 ${rockT} · 물 ${watT} · 끔 ${f1(off.predMs)}ms · 켬 ${f1(on.predMs)}ms`);
console.log(`색인(켠 판): 경로 ${on.idx.paths} 중 지어진 것 ${on.idx.built} · 쓴 칸 ${on.idx.cells.toLocaleString()} · 적재 ${on.idx.entries.toLocaleString()} · 힙 차(켬 − 끔) ${f2(on.heapMB - off.heapMB)}MB (켬 ${f2(on.heapMB)} · 끔 ${f2(off.heapMB)})`);
console.log('');
console.log(allSame ? '★게이트: **같다** — 켠다.' : '★게이트: **다르다 — 켜지 않는다.**');
process.exit(allSame ? 0 : 2);
