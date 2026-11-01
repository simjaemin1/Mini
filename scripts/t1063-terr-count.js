#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1063 계측기 · 읽기만 · 제품 무변 · 판정 0)
// === scripts/t1063-terr-count.js — 판 자 DB 에서 **영토 밖에 선 건물**을 종류별로 센다 ===
//
// 쓰는 법: node scripts/t1063-terr-count.js <판.db> [<판.db> …]   → 표(markdown) 한 장
//
// 자(서버 정본 둘 · 화면 하나):
//   · 서버 정본 영토 = `village_buildings` 의 `terr` 행(마을마다 셀 집합 — `vil._terrSet` 이 부팅 때 읽는 그 행)
//   · 화면 영토 = 회관(`hall`) 행 `data.bnd`(시딩 때 구운 경계 셀 + 외곽변 마스크 — 클라 `34-m-renderloop` 가 그리는 그 초록 외곽선)를
//     중심 셀에서 외곽변을 안 넘게 채운 셀 집합(경계 셀 포함)
//   · 건물 = `village_buildings`(terr · nongzone 밖 — 집 · 회관 · 곳간 · 마당 · 광장 · 텃밭 · 농지 · 밭 · 도랑)는 그 칸(cx, cy) ·
//     `buildings` 행(owner `npc_simvil_<마을>` — 생활층이 지은 벽 · 바닥 등)은 좌표(px) ÷ 32 칸 · 사람(플레이어)·그 밖 주인은 "주인 마을 없음" 으로 따로
// 칸마다 셈: 주인 마을 영토 밖(서버) · 어느 마을 영토에도 없음(서버) · 주인 마을 화면 영토 밖(시딩 외곽선)
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const SZ = 32;
const files = process.argv.slice(2).filter((f) => fs.existsSync(f));
if (!files.length) { console.error('쓰는 법: node scripts/t1063-terr-count.js <판.db> …'); process.exit(2); }

function seedTerr(hall) {   // 회관 bnd(중심 상대 [dx,dy,mask] flat) → 칸 집합(중심에서 외곽변을 안 넘게 채움)
  let d = null; try { d = JSON.parse(hall.data || 'null'); } catch (e) { d = null; }
  const b = d && Array.isArray(d.bnd) ? d.bnd : null;
  if (!b || !b.length) return null;
  const mask = new Map(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < b.length; i += 3) { const x = hall.cx + b[i], y = hall.cy + b[i + 1]; mask.set(x + ',' + y, b[i + 2]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = new Set(), q = [[hall.cx, hall.cy]];
  const D = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
  while (q.length) {
    const [x, y] = q.pop(), k = x + ',' + y;
    if (out.has(k) || x < x0 || x > x1 || y < y0 || y > y1) continue;
    out.add(k);
    const m = mask.get(k) || 0;
    for (const [dx, dy, bit] of D) if (!(m & bit)) q.push([x + dx, y + dy]);
  }
  return out;
}

const tot = new Map();   // 종류 → { n, outOwn, outAny, outScreen, noOwner }
const add = (t, f) => { const r = tot.get(t) || { n: 0, outOwn: 0, outAny: 0, outScreen: 0, noOwner: 0, ex: [] }; f(r); tot.set(t, r); };
const perSeed = [];
for (const f of files) {
  const d = new DatabaseSync(f, { readOnly: true });
  const terr = new Map(), any = new Map();
  for (const r of d.prepare("SELECT village_id v, cx, cy FROM village_buildings WHERE type = 'terr'").all()) {
    const k = r.cx + ',' + r.cy; if (!terr.has(r.v)) terr.set(r.v, new Set()); terr.get(r.v).add(k); any.set(k, r.v);
  }
  const screen = new Map();
  for (const h of d.prepare("SELECT village_id v, cx, cy, data FROM village_buildings WHERE type = 'hall'").all()) screen.set(h.v, seedTerr(h));
  let sOwn = 0, sAny = 0, sScr = 0, sN = 0;
  const one = (type, v, cx, cy, where) => {
    const own = v != null ? terr.get(v) : null, scr = v != null ? screen.get(v) : null, k = cx + ',' + cy;
    add(type, (r) => {
      r.n++; sN++;
      if (v == null) { r.noOwner++; return; }
      if (!own || !own.has(k)) { r.outOwn++; sOwn++; if (r.ex.length < 3) r.ex.push(`${where} 마을 ${v} 칸 ${k}`); }
      if (!any.has(k)) { r.outAny++; sAny++; }
      if (scr && !scr.has(k)) { r.outScreen++; sScr++; }
    });
  };
  for (const r of d.prepare("SELECT village_id v, type, cx, cy FROM village_buildings WHERE type NOT IN ('terr','nongzone')").all()) one('vb:' + r.type, r.v, r.cx, r.cy, 'vb');
  for (const r of d.prepare('SELECT id, type, owner_id, x, y FROM buildings').all()) {
    const m = /^npc_simvil_(\d+)$/.exec(r.owner_id || '');
    one('b:' + r.type, m ? +m[1] : null, Math.floor(r.x / SZ), Math.floor(r.y / SZ), 'b#' + r.id);
  }
  perSeed.push({ f, n: sN, own: sOwn, any: sAny, scr: sScr, vils: terr.size, cells: [...terr.values()].reduce((s, x) => s + x.size, 0),
    scrCells: [...screen.values()].reduce((s, x) => s + (x ? x.size : 0), 0) });
}
console.log('| 판 | 마을 | 서버 영토 칸 | 화면(시딩 외곽선) 칸 | 건물 칸 | 주인 영토 밖(서버) | 어느 영토에도 없음(서버) | 주인 화면 영토 밖 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const s of perSeed) console.log(`| \`${s.f.replace(/^.*\//, '')}\` | ${s.vils} | ${s.cells} | ${s.scrCells} | ${s.n} | ${s.own} | ${s.any} | ${s.scr} |`);
console.log('');
console.log('| 종류 | 칸 | 주인 영토 밖(서버) | 어느 영토에도 없음(서버) | 주인 화면 영토 밖 | 주인 마을 없음 | 보기 |');
console.log('|---|---|---|---|---|---|---|');
for (const [t, r] of [...tot.entries()].sort()) console.log(`| \`${t}\` | ${r.n} | ${r.outOwn} | ${r.outAny} | ${r.outScreen} | ${r.noOwner} | ${r.ex.join(' · ') || '—'} |`);
