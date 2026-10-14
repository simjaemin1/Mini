#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-vein-batch.js — 광맥 장부 모아 쓰기(T735)가 값을 지키는가 =================
//
// ★무엇을 지키나(`server/vein-batch.js` 머리말):
//   ① 같은 값 — 같은 1타 열을 "칠 때마다 쓰기"(종전)와 "모아 쓰기"(T735)로 돌린 뒤 저장하면 DB 행이 **바이트 같다**.
//   ② 쓰기 횟수 — 종전 = 1타마다 한 줄 · 모아 쓰기 = 저장마다 더러운 셀 수.
//   ③ 크래시(저장 없이 끊김)에 잃는 몫 = **마지막 저장 뒤에 친 몫 그대로**(그보다 많지도 적지도 않다) — 종전 팔은 0.
//      ★자명 통과 금지(test-save-periodic 꼴 A/B): 모아 쓰기 팔에서 마지막 저장 뒤에 **실제로 친 것이 있어야** 잃는 몫이 0 보다 크다 — 그것을 먼저 확인한다.
//   ④ 바로 쓰기(`now` — 플레이어 1타가 덩이를 떨군 순간)는 저장 없이도 그 셀이 DB 에 있다.
//   ⑤ 다 회복된 셀(메모리에서 지운 셀)은 저장 때 DB 행도 지운다 · 쓰기가 실패하면 더러운 셀을 잃지 않고 다음 저장에 쓴다.
// 실행: node scripts/test-vein-batch.js
'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const rm = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };

// 두 팔은 서로 다른 DB 파일(같은 프로세스에서 zone-local-db 를 두 번 싣는다 — require 캐시를 비운다)
function loadDb(file) {
  rm(file);
  process.env.DB_PATH = file;
  const k = require.resolve(path.join(ROOT, 'server', 'zone-local-db'));
  delete require.cache[k];
  return require(k);
}
const Spec = require(path.join(ROOT, 'server', 'specialty'));
const VB = require(path.join(ROOT, 'server', 'vein-batch'));

// 정해진 1타 열 — 셀 다섯 · 셀마다 깊이에 따라 1/타수씩 깎는다(광부 몸 갈래와 같은 식 · 주사위 0)
const KEYS = ['10_10', '10_11', '11_10', '200_5', '7_300'];
function strike(map, i, t) {
  const key = KEYS[i % KEYS.length];
  let rec = map.get(key);
  if (!rec) rec = { s: Spec.ORE_K, t, w: 0, kg: 0 };
  const need = Spec.mineSwingsNeeded(rec.s / Spec.ORE_K);
  rec.s -= 1 / need; rec.t = t;
  map.set(key, rec);
  return { key, cut: 1 / need };
}
const rows = (file) => { const d = new DatabaseSync(file, { readOnly: true }); const r = d.prepare('SELECT cell_key, prosperity, last_t, swings, kgsum FROM mined_cells ORDER BY cell_key').all(); d.close(); return r; };

const N = 1000, EVERY = 100, TAIL = 37;
const FA = `/tmp/vb-a-${process.pid}.db`, FB = `/tmp/vb-b-${process.pid}.db`;

// ── 종전 팔: 1타마다 한 줄 ──
const dbA = loadDb(FA), mapA = new Map();
let writesA = 0; const tA0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) { const r = strike(mapA, i, 1000 + i); const rec = mapA.get(r.key); dbA.upsertMinedCell(r.key, rec.s, rec.t, rec.w, rec.kg); writesA++; }
const usA = Number(process.hrtime.bigint() - tA0) / 1e3 / N;

// ── 모아 쓰기 팔: 표시만 · EVERY 타마다 저장 ──
const dbB = loadDb(FB), mapB = new Map();
const V = VB.create({ db: dbB, map: mapB });
const tB0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) { const r = strike(mapB, i, 1000 + i); V.mark(r.key); if ((i + 1) % EVERY === 0) V.flush('period'); }
const usB = Number(process.hrtime.bigint() - tB0) / 1e3 / N;
const st = V.stats();

console.log('\n① 같은 값 — 같은 1타 열 · 저장 뒤 DB 행');
const ra = rows(FA), rb = rows(FB);
ok(JSON.stringify(ra) === JSON.stringify(rb), `두 팔 DB 행 바이트 같음(셀 ${ra.length})`);
ok(ra.length === KEYS.length && ra.every((r) => r.prosperity < Spec.ORE_K), '★자명 통과 금지 — 행이 실제로 깎인 값이다', ra.map((r) => r.prosperity.toFixed(3)).join(' · '));

console.log('\n② 쓰기 횟수');
ok(writesA === N, `종전: 1타마다 한 줄 = ${writesA}`);
ok(st.flushes === N / EVERY && st.rows === (N / EVERY) * KEYS.length, `모아 쓰기: 저장 ${st.flushes}번 · ${st.rows} 줄(저장마다 더러운 셀 ${KEYS.length})`);
console.log(`    1타 평균 µs — 종전 ${usA.toFixed(1)} · 모아 쓰기 ${usB.toFixed(1)}(저장 몫 포함)`);

console.log('\n③ 크래시(저장 없이 끊김)에 잃는 몫');
let cutTail = 0; const before = new Map([...mapB].map(([k, r]) => [k, r.s]));
for (let i = N; i < N + TAIL; i++) { const r = strike(mapB, i, 1000 + i); V.mark(r.key); cutTail += r.cut; }
ok(V.size() > 0 && cutTail > 0, `★자명 통과 금지 — 마지막 저장 뒤에 실제로 ${TAIL}타를 쳤다(깎인 덩이 ${cutTail.toFixed(4)})`);
const crash = rows(FB);   // 다른 연결로 읽는다 = 끊긴 뒤 다시 띄운 판이 보는 것
let lost = 0; for (const r of crash) lost += r.prosperity - mapB.get(r.cell_key).s;
ok(Math.abs(lost - cutTail) < 1e-9, `잃는 몫 = 마지막 저장 뒤 친 몫 그대로(${lost.toFixed(6)} = ${cutTail.toFixed(6)})`);
let back = true; for (const r of crash) if (r.prosperity !== before.get(r.cell_key)) back = false;
ok(back, '끊긴 판의 DB = 마지막 저장 순간의 메모리(셀마다 같음)');
// 종전 팔은 같은 꼬리를 쳐도 잃는 몫 0
for (let i = N; i < N + TAIL; i++) { const r = strike(mapA, i, 1000 + i); const rec = mapA.get(r.key); dbA.upsertMinedCell(r.key, rec.s, rec.t, rec.w, rec.kg); }
let lostA = 0; for (const r of rows(FA)) lostA += r.prosperity - mapA.get(r.cell_key).s;
ok(Math.abs(lostA) < 1e-12, `대조군(종전 팔) 잃는 몫 0(${lostA})`);
V.flush('shutdown');
ok(JSON.stringify(rows(FA)) === JSON.stringify(rows(FB)), '종료 저장 뒤 두 팔 DB 다시 바이트 같음');

console.log('\n④ 바로 쓰기(덩이를 떨군 1타)');
{ const r = strike(mapB, 0, 9999); V.mark(r.key); V.now(r.key);
  const row = rows(FB).find((x) => x.cell_key === r.key);
  ok(row && row.prosperity === mapB.get(r.key).s, '저장 없이도 그 셀은 DB = 메모리'); ok(V.size() === 0, '그 셀은 더러운 목록에서 빠졌다'); }

console.log('\n⑤ 지운 셀 · 쓰기 실패');
{ mapB.delete('7_300'); V.mark('7_300'); V.flush('period');
  ok(!rows(FB).some((x) => x.cell_key === '7_300'), '메모리에서 지운 셀은 DB 행도 지운다');
  const bad = { db: { exec: (q) => { if (q === 'BEGIN') throw new Error('잠김'); } }, upsertMinedCell() { }, deleteMinedCell() { } };
  const m2 = new Map([['1_1', { s: 900, t: 1, w: 0, kg: 0 }]]), V2 = VB.create({ db: bad, map: m2 });
  V2.mark('1_1'); const r1 = V2.flush('period');
  ok(r1 === -1 && V2.size() === 1 && V2.stats().fail === 1, '쓰기가 실패하면 더러운 셀을 그대로 둔다(다음 저장에 다시)'); }

rm(FA); rm(FB);
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
