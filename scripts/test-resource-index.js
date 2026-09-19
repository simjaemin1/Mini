#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-resource-index.js — 관측자 무관 자원 색인 `resourceAt` 하네스 =====
//
// ★왜 이 하네스인가 [지시 T301 · T284 회부 ① · `설계/설계_생산_실체.md` §2-ⓗ]
//   존의 나무·바위·광맥은 **청크가 켜질 때** 생긴다. 그래서 관측자에 따라 있다 없다 하고,
//   전투가 그걸 읽으면 같은 씨로 다른 결과가 난다(T284 ①). 관측자 없는 마을의 나무꾼·광부도
//   **실제 나무**에 가야 한다(새 캐논). ⇒ 청크 없이 셀을 묻는 색인이 필요하다.
//
//   ⚠색인이 청크와 **한 바이트라도** 다르면 두 세계가 생긴다. T251 이 그 값을 치렀다:
//     같은 술어를 두 벌 적어 뒀더니 계측기와 제품이 다른 땅을 세웠다.
//     그래서 이 하네스는 논증을 안 믿고 **활성 청크를 전수로 맞대 본다**.
//
// 검사:
//   ⓐ 청크 100개 전수 — 청크가 놓은 개체 = 색인이 낸 개체(**JSON 바이트 대조** · 누락·초과 0)
//   ⓑ 색인 질의가 청크를 **안 켠다**(ChunkManager 의 청크 수가 불변 · 관측자 무관의 정의)
//   ⓒ 자명 통과 금지 — 시드(존 id)를 바꾸면 답이 **달라진다**(빈 답을 비교하고 통과하는 게 아니다)
//   ⓓ 부하 — 셀 질의 1회 µs · 마을 반경 16셀(33×33=1,089칸) 전수 ms
//
// 실행: node scripts/test-resource-index.js
'use strict';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const CH = R('server/chunk');
const { ZONES } = R('server/zone-config');
const T = R('server/terrain');
const Z = 'hanbando', ZONE = ZONES[Z];
const CS = CH.CHUNK_SIZE;

// ★검사할 청크는 **숲이 실제로 깔리는 곳**에서 고른다. 빈 들판 100개를 맞대고 통과하면
//   숲 그리드(청크당 ~340그루 · 이 카드가 연 빠른 길이 가장 위험한 자리)를 **한 번도 안 밟는다**.
//   고르는 방법은 지형 정본 한 줄뿐이다 — 자가 숲을 짓지 않는다.
function pickChunks(n) {
  const out = [], W = Math.floor(ZONE.zoneWidth / CS), H = Math.floor(ZONE.zoneHeight / CS);
  for (let ccy = 0; ccy < H && out.length < n; ccy++) {
    for (let ccx = 0; ccx < W && out.length < n; ccx++) {
      const sx = ccx * CS + CS / 2, sy = ccy * CS + CS / 2;
      if (T.getForestMultiplier(Z, sx, sy) > 1.5) out.push([ccx, ccy]);
    }
  }
  return out;
}
const FOREST_CHUNKS = pickChunks(100);
const HOT = FOREST_CHUNKS[0] || [Math.floor((ZONE.zoneWidth / CS) / 2), Math.floor((ZONE.zoneHeight / CS) / 2)];
const HOTCELL = [HOT[0] * (CS / 32), HOT[1] * (CS / 32)];

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + m + (extra ? '  ' + extra : '')); } };

// 개체를 **바이트로** 견준다 — 키 순서까지 같아야 한다(값만 같은 건 같은 게 아니다).
const wire = (e) => JSON.stringify(e);

// ── ⓐ 청크 100개 전수 ────────────────────────────────────────────────────────
console.log('\nⓐ 청크가 놓은 것 = 색인이 낸 것 (숲 청크 전수 · 바이트 대조)');
{
  // ★청크는 자기 밖에도 낳는다(숲 그리드 지터가 경계를 넘는다). 그래서 "청크가 놓은 것"을
  //   셀별로 모으려면 **이웃 한 겹까지** 같이 낳아야 한다 — 안 그러면 경계 셀의 기대값이 반쪽이다.
  const core = new Set(FOREST_CHUNKS.map(([a, b]) => a + '_' + b));
  const need = new Map();
  for (const [a, b] of FOREST_CHUNKS) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const qx = a + dx, qy = b + dy; if (qx < 0 || qy < 0) continue;
    need.set(qx + '_' + qy, [qx, qy]);
  }
  const byCell = new Map();
  let ents = 0;
  for (const [, [qx, qy]] of need) {
    const list = CH.generateChunkResources(Z, ZONE.biome, qx, qy, CS, null, undefined);
    ents += list.length;
    for (const e of list) {
      const k = Math.floor(e.x / 32) + '_' + Math.floor(e.y / 32);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(e);
    }
  }
  // 견주는 것은 **집합**이다(개체는 바이트로, 순서는 id 로 정렬해 없앤다 — id 는 유일하다).
  const norm = (arr) => arr.slice().sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0)).map(wire).join('\n');
  let cells = 0, miss = 0, bad = 0, extra = 0;
  const badSamples = [];
  for (const [k, want] of byCell) {
    const [sx, sy] = k.split('_').map(Number);
    // 그 셀의 청크가 **핵심 100개 안**일 때만 견준다(halo 셀은 기여자가 다 안 났을 수 있다)
    const oc = Math.floor(sx * 32 / CS) + '_' + Math.floor(sy * 32 / CS);
    if (!core.has(oc)) continue;
    cells++;
    const got = CH.resourcesAtCell(Z, sx, sy, { biome: ZONE.biome, chunkSize: CS });
    if (got.length !== want.length) { miss++; if (badSamples.length < 3) badSamples.push(`${k} 수 ${want.length}→${got.length}`); continue; }
    if (norm(want) !== norm(got)) { bad++; if (badSamples.length < 3) badSamples.push(`${k} 바이트 다름`); }
  }
  // 색인이 **없는 자리에서 뭘 만들어 내지는 않나** — 개체 없는 셀을 핵심 청크마다 40칸씩 뽑는다
  for (const [a, b] of FOREST_CHUNKS) {
    for (let t = 0; t < 40; t++) {
      const sx = Math.floor((a * CS + (t * 97) % CS) / 32), sy = Math.floor((b * CS + (t * 137) % CS) / 32);
      if (byCell.has(sx + '_' + sy)) continue;
      const got = CH.resourcesAtCell(Z, sx, sy, { biome: ZONE.biome, chunkSize: CS });
      if (got.length) { extra++; if (badSamples.length < 3) badSamples.push(`빈칸 ${sx}_${sy} 에 ${got.length}개`); }
    }
  }
  ok(FOREST_CHUNKS.length === 100, `숲 청크 ${FOREST_CHUNKS.length}개 + 이웃 ${need.size - FOREST_CHUNKS.length}개를 낳았다`, `개체 ${ents.toLocaleString()} · 견준 셀 ${cells.toLocaleString()}`);
  ok(ents > 10000, '그 청크들에 개체가 실제로 있다(빈 표를 비교한 게 아니다)', `개체 ${ents.toLocaleString()}`);
  ok(miss === 0, '★색인이 낸 개체 수 = 청크가 놓은 개체 수 (셀 전수)', `어긋난 셀 ${miss}`);
  ok(bad === 0, '★★개체가 **바이트 동일**(id·좌표·hp·반경·키·종·단계 전부)', `다른 셀 ${bad}`);
  ok(extra === 0, '색인이 빈 셀에 없는 것을 만들어 내지 않는다', `초과 ${extra}`);
  if (badSamples.length) console.log('    표본: ' + badSamples.join(' | '));
}

// ── ⓑ 질의가 청크를 안 켠다 ──────────────────────────────────────────────────
console.log('\nⓑ 색인 질의가 청크를 **안 켠다** (관측자 무관의 정의)');
{
  const cm = new CH.ChunkManager(CS);
  const before = cm.chunks ? cm.chunks.size : 0;
  const cx0 = HOTCELL[0], cy0 = HOTCELL[1];
  let found = 0;
  for (let i = 0; i < 400; i++) {
    const a = CH.resourcesAtCell(Z, cx0 + (i % 20), cy0 + Math.floor(i / 20), { biome: ZONE.biome, chunkSize: CS });
    found += a.length;
  }
  const after = cm.chunks ? cm.chunks.size : 0;
  ok(after === before, '★질의 400회 뒤에도 청크 수가 그대로다', `${before} → ${after}`);
  ok(found > 0, '그 400칸에서 실제로 뭔가 나왔다(빈 질의로 통과한 게 아니다)', `개체 ${found}`);
}

// ── ⓒ 자명 통과 금지 ─────────────────────────────────────────────────────────
console.log('\nⓒ ★이 하네스가 실패할 줄 아는가 — 시드를 바꾸면 답이 달라져야 한다');
{
  const cx0 = HOTCELL[0], cy0 = HOTCELL[1];
  let same = 0, differ = 0, seen = 0;
  for (let i = 0; i < 300; i++) {
    const sx = cx0 + (i % 30), sy = cy0 + Math.floor(i / 30);
    const a = CH.resourcesAtCell(Z, sx, sy, { biome: ZONE.biome, chunkSize: CS });
    // 존 id 만 바꾼다 = 시드만 바꾼다(지형은 그 존 것을 그대로 쓰므로 자리 자체는 유효하다)
    const b = CH.resourcesAtCell(Z + '_변조', sx, sy, { biome: ZONE.biome, chunkSize: CS });
    seen += a.length;
    if (JSON.stringify(a) === JSON.stringify(b)) same++; else differ++;
  }
  ok(seen > 0, '원본 시드에서 개체가 난다', `개체 ${seen}`);
  ok(differ >= 30, '★시드를 바꾸면 답이 달라진다 — 검사가 상수를 보고 있는 게 아니다', `다른 칸 ${differ}/300`);
  // 같은 시드 두 번은 같아야 한다(결정성)
  let det = true;
  for (let i = 0; i < 100; i++) {
    const sx = cx0 + i, sy = cy0 + 3;
    if (JSON.stringify(CH.resourcesAtCell(Z, sx, sy, { biome: ZONE.biome, chunkSize: CS }))
      !== JSON.stringify(CH.resourcesAtCell(Z, sx, sy, { biome: ZONE.biome, chunkSize: CS }))) { det = false; break; }
  }
  ok(det, '★같은 시드·같은 셀은 **늘 같은 답**(결정성)');
}

// ── ⓓ 부하 ───────────────────────────────────────────────────────────────────
console.log('\nⓓ 부하 — 셀 질의 1회 · 마을 반경 16셀 전수');
{
  const cx0 = HOTCELL[0], cy0 = HOTCELL[1];
  const N = 3000;
  let t0 = Date.now(), sink = 0;
  for (let i = 0; i < N; i++) sink += CH.resourcesAtCell(Z, cx0 + (i % 60), cy0 + Math.floor(i / 60), { biome: ZONE.biome, chunkSize: CS }).length;
  const per = (Date.now() - t0) * 1000 / N;
  console.log(`    셀 질의 ${N.toLocaleString()}회 · 1회 ${per.toFixed(1)}µs (개체 ${sink.toLocaleString()})`);
  const R16 = 16;
  t0 = Date.now(); let got = 0;
  for (let dy = -R16; dy <= R16; dy++) for (let dx = -R16; dx <= R16; dx++)
    got += CH.resourcesAtCell(Z, cx0 + dx, cy0 + dy, { biome: ZONE.biome, chunkSize: CS }).length;
  const ms = Date.now() - t0;
  console.log(`    마을 반경 16셀(${(33 * 33).toLocaleString()}칸) 전수 ${ms}ms (개체 ${got.toLocaleString()})`);
  ok(per < 2000, '셀 질의 1회가 2ms 미만이다', `${per.toFixed(1)}µs`);
  ok(ms < 5000, '마을 반경 전수가 5초 미만이다', `${ms}ms`);
}

console.log(`\n=== 자원 색인 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
