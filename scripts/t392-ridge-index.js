#!/usr/bin/env node
// === scripts/t392-ridge-index.js — 능선 선분 색인 설계 표 (T392 ③) ==================
//
// ★계측기다 — 러너 밖(`@regress` 없음) · 제품 무접촉(`server/` 는 읽기만).
//
// ★§0 이 카드의 ③ 을 "설계"에서 "이미 있는 것을 재기"로 바꿨다:
//   능선 선분 색인은 **이미 있다** — `server/terrain-segindex.js`(2026-08-31 · `42764e2d`) ·
//   `_isPointInRiver` 가 `TERRAIN_SEG_INDEX=1` 일 때 512px 격자 후보만 본다. **기본 꺼짐**이고
//   `BENCHMARK.md` 가 적은 배포 상태도 **꺼짐**이다. 등가성 하네스(`test-segindex` · @regress)도 이미 있다.
//   ⇒ 이 계측기는 새로 짜지 않고 **그 손잡이를 켠 판과 끈 판**을 같은 청크에 돌려 잰다.
//
// ★플래그는 **모듈 적재 때** 읽힌다 → 한 프로세스에서 on/off 를 못 비교한다(test-segindex 와 같은 이유).
//   자식 둘을 띄우고, 부모가 **청크 산출 전체**(개체 id·좌표·종류)를 해시로 대조한다 — 술어 하나가 아니라
//   세계가 같은지를 본다.
//
// 실행: node scripts/t392-ridge-index.js
'use strict';
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ── 자식: 한 판을 돌리고 JSON 한 줄을 낸다 ──────────────────────────────────────
if (process.argv[2] === '--child') {
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const terrain = require(path.join(ROOT, 'server', 'terrain'));
  if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
  const chunk = require(path.join(ROOT, 'server', 'chunk'));
  const ZID = 'hanbando', Z = ZONES[ZID], cs = chunk.CHUNK_SIZE;
  const now = () => Number(process.hrtime.bigint()) / 1000;
  const regions = { forest: [57382, 61114], ridge: [41175, 44332] };
  const out = { on: process.env.TERRAIN_SEG_INDEX !== '0', regions: {} };   // ★[T406] 기본 켬 — 끔은 `=0`
  for (const [nm, [X, Y]] of Object.entries(regions)) {
    const c0 = Math.floor(X / cs), r0 = Math.floor(Y / cs);
    const keys = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const cx = c0 + dx, cy = r0 + dy; if (cx >= 0 && cy >= 0) keys.push([cx, cy]); }
    const h = crypto.createHash('sha1');
    const run = (hash) => {
      for (const [cx, cy] of keys) {
        const a = chunk.generateChunkResources(ZID, Z.biome, cx, cy, cs, null, 0);
        const b = chunk.overflowInto(ZID, Z.biome, cx, cy, cs, null, 0);
        if (hash) for (const r of a.concat(b)) h.update(`${r.id}|${r.type}|${r.x}|${r.y}|${r.sp || ''};`);
      }
    };
    let t = now(); run(true); const cold = now() - t;             // 첫 판 — 색인을 짓는 값 포함
    t = now(); run(false); const warm = now() - t;               // 이어진 판
    // 바위 술어 호출 — 인자를 받아 두고 덥힌 뒤 회당 µs
    const args = [], o = terrain.isRockCellLocal;
    terrain.isRockCellLocal = (z, x, y) => { args.push([z, x, y]); return o(z, x, y); };
    run(false);
    terrain.isRockCellLocal = o;
    let s = 0; for (const a of args) if (o(a[0], a[1], a[2])) s++;
    t = now(); for (let k = 0; k < 3; k++) for (const a of args) if (o(a[0], a[1], a[2])) s++;
    const per = (now() - t) / (3 * Math.max(1, args.length));
    out.regions[nm] = { chunks: keys.length, coldMs: cold / 1000, warmMsPerChunk: warm / 1000 / keys.length,
                        rockCalls: args.length, rockUs: per, hash: h.digest('hex').slice(0, 16), sink: s };
  }
  // 색인 모양(켠 판만) — 능선마다 선분 수 · 쓴 칸 · 칸당 후보
  if (out.on) {
    const T = terrain.ZONE_TERRAIN ? terrain.ZONE_TERRAIN.hanbando : null;
    const ridges = (T && T.ridges) || [];
    const cand = [];
    out.ridges = ridges.map((r) => {
      const ix = r._segIdx;
      if (ix) for (const c of ix.cells) if (c) cand.push(c.length);
      return { name: r.name, segs: (r.path || []).length - 1, built: !!ix, used: ix ? ix.used : 0, entries: ix ? ix.entries : 0 };
    });
    cand.sort((a, b) => a - b);
    const q = (p) => cand.length ? cand[Math.min(cand.length - 1, Math.floor(p * cand.length))] : 0;
    out.cand512 = { cells: cand.length, med: q(0.5), p90: q(0.9), p99: q(0.99), max: cand.length ? cand[cand.length - 1] : 0 };
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────
const child = (on) => JSON.parse(execFileSync(process.execPath, [__filename, '--child'],
  { env: { ...process.env, TERRAIN_SEG_INDEX: on ? '1' : '0' }, maxBuffer: 1 << 26, cwd: ROOT }).toString());
const off = child(false), on = child(true);

// 청크(1,024px) 격자로 색인하면 청크당 후보 선분 몇 개 — 같은 적재 규칙(구간 bbox + max(w1,w2)/2)으로 센다(계측만)
const T = require(path.join(ROOT, 'server', 'hanbando-terrain.json')).hanbando;
const perChunk = new Map();
let totalSegs = 0;
for (const r of T.ridges || []) {
  const P = r.path || [], defW = r.width || 200;
  const px = (p) => (p.pos ? p.pos[0] : p[0]), py = (p) => (p.pos ? p.pos[1] : p[1]), pw = (p) => (p.width != null ? p.width : defW);
  for (let i = 0; i + 1 < P.length; i++) {
    totalSegs++;
    const h = Math.max(pw(P[i]), pw(P[i + 1])) / 2;
    const x0 = Math.floor((Math.min(px(P[i]), px(P[i + 1])) - h) / 1024), x1 = Math.floor((Math.max(px(P[i]), px(P[i + 1])) + h) / 1024);
    const y0 = Math.floor((Math.min(py(P[i]), py(P[i + 1])) - h) / 1024), y1 = Math.floor((Math.max(py(P[i]), py(P[i + 1])) + h) / 1024);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + '_' + y; perChunk.set(k, (perChunk.get(k) || 0) + 1); }
  }
}
const pc = [...perChunk.values()].sort((a, b) => a - b);
const qq = (p) => pc[Math.min(pc.length - 1, Math.floor(p * pc.length))];

const f2 = (v) => (+v).toFixed(2), f1 = (v) => (+v).toFixed(1);
console.log('=== 능선 선분 색인 — 이미 있는 `terrain-segindex.js` 를 켠 판 / 끈 판 (T392 ③) ===');
console.log(`능선 ${(T.ridges || []).length}개 · 선분 ${totalSegs.toLocaleString()} · 손잡이 TERRAIN_SEG_INDEX(기본 꺼짐)`);
console.log('');
console.log('| 자리(13×13 청크) | 판 | 청크당 ms(이어진 판) | 첫 판 ms(전체) | 바위 호출 | 바위 회당 µs | 청크 산출 해시 |');
console.log('|---|---|---:|---:|---:|---:|---|');
for (const nm of Object.keys(off.regions)) {
  for (const [lab, R] of [['끔(배포 그대로)', off.regions[nm]], ['켬', on.regions[nm]]]) {
    console.log(`| ${nm === 'forest' ? '숲(임업3)' : '능선(먹뫼산맥)'} | ${lab} | ${f2(R.warmMsPerChunk)} | ${f1(R.coldMs)} | ${R.rockCalls.toLocaleString()} | ${f2(R.rockUs)} | \`${R.hash}\` |`);
  }
  const a = off.regions[nm], b = on.regions[nm];
  console.log(`| | **배율** | **×${f1(a.warmMsPerChunk / b.warmMsPerChunk)}** | ×${f1(a.coldMs / b.coldMs)} | | **×${f1(a.rockUs / b.rockUs)}** | ${a.hash === b.hash ? '**같다**' : '★다르다'} |`);
}
console.log('');
console.log('색인 모양(켠 판 · 512px 칸 · 제품 그대로):');
console.log(`  칸당 후보 선분 — 쓴 칸 ${on.cand512.cells.toLocaleString()} · 중앙 ${on.cand512.med} · p90 ${on.cand512.p90} · p99 ${on.cand512.p99} · 최대 ${on.cand512.max} (끈 판은 bbox 를 통과하면 그 능선 선분 **전부**)`);
console.log('  | 능선 | 선분 | 쓴 칸 | 적재 |');
console.log('  |---|---:|---:|---:|');
for (const r of on.ridges) console.log(`  | ${r.name} | ${r.segs} | ${r.used} | ${r.entries} |`);
console.log('');
console.log(`청크(1,024px) 격자로 쌓으면(계측만): 능선이 닿는 청크 ${pc.length.toLocaleString()} · 청크당 후보 중앙 ${qq(0.5)} · p90 ${qq(0.9)} · p99 ${qq(0.99)} · 최대 ${pc[pc.length - 1]}`);
