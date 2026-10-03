#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T579 추신 ③ 무게 판 · 판정 0 — 부팅이 사는지는 `t538-boot-mem.js --boot` 가 답한다)
// =============================================================================
// T579 추신 ③ — 상한 `=2`(⌈인구÷6⌉ × 600 + 1,500)가 다 차면 영토 행이 몇이고, 그 DB 로 존이 **뜨나**(힙 상한 1000MB = 서울 978MB 판).
//   표: 인구 셋(3시드 800일 끝 · 서울 사본) × 상한 식 셋(=0 · =1 · =2)의 합 행 수 · 마을당 최대 · 상한이 시딩(3,450)을 넘는 마을 수.
//   DB: `--build` 면 두 판을 만든다 —
//     ⓐ 서울 사본 + 마을마다 영토를 max(지금, =2 상한(그 마을 인구)) 까지 바깥 고리로 늘린 판
//     ⓑ 씨앗 세계 + 마을마다 영토를 =2 상한(3시드 끝 인구 중 합이 가장 큰 시드)까지 늘린 판
//   고리는 중심에서 한 겹씩(이미 있는 칸은 건너뛴다 · `test-village-boot-mem` 의 `buildFat` 과 같은 꼴). 남의 영토와 겹친 칸은 부팅 정리(T569)가 가른다.
//
// 쓰는 법: node scripts/t579p-weight.js <t17 JSON …> [--seoul <사본.db>] [--seed <씨앗 zone db>] [--build <out dir>]
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const VL = require(path.join(__dirname, '..', 'server', 'village-layout.js'));
const SEED_TERR = 3450;
const CAPS = {
  '=0 인당 12': (p) => Math.ceil(p * VL.LAND_NEED),
  '=1 인당 32.67': (p) => Math.ceil(p * (VL.LAND_NEED + VL.LOT_PER_HEAD)),
  '=2 집 압력 항': (p) => Math.ceil(p / (VL.HOUSE_CAP_PER_FLOOR * VL.HOUSE_MAX_FLOORS)) * VL.TERR_PER_LOT + VL.TERR_CORE,
};
const cap2 = CAPS['=2 집 압력 항'];
const { DatabaseSync } = require('node:sqlite');

const sets = [];
const files = argv.filter((a, i) => a.endsWith('.json') && !['--seoul', '--seed', '--build'].includes(argv[i - 1]));
for (const f of files) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); sets.push({ label: `3시드 끝 시드 ${j.seed}`, pop: Object.fromEntries((j.vpop || []).map((v) => [v.name, v.pop])) }); }
const SEOUL = val('--seoul');
if (SEOUL) { const d = new DatabaseSync(SEOUL, { readOnly: true }); const m = {};
  for (const r of d.prepare("SELECT name, econ_state FROM villages WHERE zone = 'hanbando'").all()) { try { m[r.name] = (JSON.parse(r.econ_state).npcs || []).length; } catch (e) {} }
  d.close(); sets.push({ label: '서울 사본 9년', pop: m }); }

console.log('\n[T579 추신 ③] 상한이 다 찼을 때 영토 행(마을당 max(시딩 3,450, 상한)) — 인구 > 0 인 마을만');
console.log('| 인구 | 상한 식 | 마을 | 합 행 | 마을당 최대(마을 · 인구) | 시딩을 넘는 마을 |');
console.log('|---|---|---:|---:|---|---:|');
const table = [];
for (const S of sets) for (const [nm, f] of Object.entries(CAPS)) {
  let sum = 0, n = 0, over = 0, mx = { c: 0 };
  for (const [name, p] of Object.entries(S.pop)) { if (!p) continue; n++; const c = Math.max(SEED_TERR, f(p)); sum += c; if (f(p) > SEED_TERR) over++; if (c > mx.c) mx = { c, name, p }; }
  table.push({ set: S.label, cap: nm, n, sum, max: mx, over });
  console.log(`| ${S.label} | ${nm} | ${n} | ${sum.toLocaleString()} | ${mx.c.toLocaleString()}(${mx.name} · ${mx.p}) | ${over} |`);
}

function grow(db, perVil) {   // perVil: Map(id → 목표 셀) · 고리를 한 겹씩
  const vils = db.prepare("SELECT id, cx, cy FROM villages WHERE zone = 'hanbando' ORDER BY id").all();
  const have = db.prepare("SELECT cx, cy FROM village_buildings WHERE village_id = ? AND type = 'terr'");
  const ins = db.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'terr', ?, ?, 0, NULL, ?)");
  let added = 0; const t0 = Date.now();
  db.exec('BEGIN');
  for (const v of vils) {
    const want = perVil.get(v.id) || 0; if (!want) continue;
    const own = new Set(have.all(v.id).map((r) => r.cx + ',' + r.cy));
    for (let R = 1; own.size < want && R < 600; R++) {
      for (let dx = -R; dx <= R && own.size < want; dx++) {
        const dys = Math.abs(dx) === R ? Array.from({ length: 2 * R + 1 }, (_, i) => i - R) : [-R, R];
        for (const dy of dys) { if (own.size >= want) break; const x = v.cx + dx, y = v.cy + dy, k = x + ',' + y; if (x < 1 || y < 1 || own.has(k)) continue; own.add(k); ins.run(v.id, x, y, t0 + added); added++; }
      }
    }
  }
  db.exec('COMMIT');
  return { added, terr: db.prepare("SELECT COUNT(*) n FROM village_buildings WHERE type = 'terr'").get().n, total: db.prepare('SELECT COUNT(*) n FROM village_buildings').get().n };
}
const OUTD = val('--build');
const built = {};
if (OUTD) {
  fs.mkdirSync(OUTD, { recursive: true });
  const cp = (src, dst) => { for (const s of ['', '-wal']) { try { fs.copyFileSync(src + s, dst + s); fs.chmodSync(dst + s, 0o644); } catch (e) {} } for (const s of ['-shm']) { try { fs.unlinkSync(dst + s); } catch (e) {} } };
  if (SEOUL) {
    const dst = path.join(OUTD, 'seoul-cap2.db'); cp(SEOUL, dst);
    const db = new DatabaseSync(dst); const S = sets.find((s) => s.label.startsWith('서울'));
    const per = new Map(); for (const r of db.prepare("SELECT id, name FROM villages WHERE zone = 'hanbando'").all()) { const p = S.pop[r.name] || 0; if (p) per.set(r.id, cap2(p)); }
    built.seoul = { db: dst, ...grow(db, per) }; db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
    console.log(`\n  ⓐ 서울 사본 + =2 상한까지 — 영토 행 +${built.seoul.added} → terr ${built.seoul.terr.toLocaleString()} · village_buildings ${built.seoul.total.toLocaleString()} → ${dst}`);
  }
  const SEED = val('--seed');
  if (SEED && sets.some((s) => s.label.startsWith('3시드'))) {
    const S = sets.filter((s) => s.label.startsWith('3시드')).sort((a, b) => Object.values(b.pop).reduce((x, y) => x + y, 0) - Object.values(a.pop).reduce((x, y) => x + y, 0))[0];
    const dst = path.join(OUTD, 'seed-cap2.db'); cp(SEED, dst);
    const db = new DatabaseSync(dst);
    const per = new Map(); for (const r of db.prepare("SELECT id, name FROM villages WHERE zone = 'hanbando'").all()) { const p = S.pop[r.name] || 0; if (p) per.set(r.id, Math.max(SEED_TERR, cap2(p))); }
    built.seed = { db: dst, from: S.label, ...grow(db, per) }; db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
    console.log(`  ⓑ 씨앗 세계 + =2 상한까지(${S.label}) — 영토 행 +${built.seed.added} → terr ${built.seed.terr.toLocaleString()} · village_buildings ${built.seed.total.toLocaleString()} → ${dst}`);
  }
}
const out = process.env.T579P_OUT || '/tmp/t579p/weight.json';
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ table, built }, null, 1));
console.log('\n→', out);
