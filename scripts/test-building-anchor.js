#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 건물 스프라이트 앵커 대조 하네스 ===
// client.js의 하드코딩 앵커 A표가 building_render.py의 결정적 카메라 수학(및 실제 PNG 치수)과
// 일치하는지 검증한다. ★앵커는 렌더 픽셀이 아니라 (W,D,top)에서 결정적으로 유도되므로
// Blender 없이 재계산 가능 — 재렌더 후 A표 갱신을 잊으면 여기서 잡힌다.
//   (배경: a5a4917의 클라 주석이 "하네스가 대조"라고 썼으나 실제 하네스가 없었다 — 검수 세션에서 신설.)
// 실행: node scripts/test-building-anchor.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// ── building_render.py 동형 수학(THETA 30°·PPU 64/√2·ZSQ·SLOPE 0.6·EAVE 2.0) ──
const th = Math.PI / 6, PPU = 64 / Math.SQRT2, ZSQ = 32 / (PPU * Math.cos(th));
const SLOPE = 0.6, EAVE = 2.0;
function anchor(W, D, top) {
  const DI = W + 1, DJ = D + 1;
  const Wpx = Math.trunc((DI + DJ) * 32) + 8, Hpx = Math.trunc((DI + DJ) * 16 + top * 32) + 12;
  const ctr = [DI / 2, DJ / 2, top * ZSQ / 2], rel = [-ctr[0], -ctr[1], -ctr[2]];
  const R = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
  const U = [-Math.sin(th) / Math.SQRT2, -Math.sin(th) / Math.SQRT2, Math.cos(th)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { w: Wpx, h: Hpx, ox: +(Wpx / 2 + dot(rel, R) * PPU).toFixed(1), oy: +(Hpx / 2 - dot(rel, U) * PPU).toFixed(1) };
}
// building_render.py JOBS 동형 발자국·용마루고
const JOBS = {
  hut_roof: anchor(6, 4, EAVE + 2.5 * SLOPE + 0.4),
  hall_roof: anchor(8, 8, EAVE + 4.5 * SLOPE + 0.4),
  granary: anchor(5, 3, 2.0 + 2.0 * SLOPE + 0.4),
  // ★움집 4단계 공정(8차) — 발자국은 완공과 같은 6×4, 높이만 단계별(building_render.py JOBS 동형)
  hut_s1: anchor(6, 4, 0.45),
  hut_s2: anchor(6, 4, EAVE + 0.35),
  hut_s3: anchor(6, 4, EAVE + 2.5 * SLOPE + 0.35),
  // ★노(爐) 3단계 + 완공 · 숯가마 2단계(2026-08-02) — 발자국 2×2, 높이만 단계별
  furn_s1: anchor(2, 2, 0.30),
  furn_s2: anchor(2, 2, 0.95),
  furn_s3: anchor(2, 2, 1.35),
  furnace: anchor(2, 2, 1.55),
  kiln_s1: anchor(2, 2, 0.30),
  charcoal_kiln: anchor(2, 2, 1.25),
  // ★[T136] 공용 쉼터 — 움집과 **같은 발자국·같은 용마루고**. 같아야 한다:
  //   클라가 지붕을 고정 오프셋으로 놓으므로 틀이 다르면 자리가 어긋난다(같은 값인지 아래 ④가 잰다).
  shelter_roof: anchor(6, 4, EAVE + 2.5 * SLOPE + 0.4),
};

// ── ① client.js A표 파싱 ──
console.log('[① client.js 앵커 A표 = 결정적 재계산값]');
const cj = require('./client-src.js').readClientSrc();
const m = cj.match(/const A = \{([^}]+)\}/);
ok(!!m, 'client.js에서 A표 발견');
if (m) {
  const A = {};
  for (const mm of m[1].matchAll(/(\w+):\s*\[([\d.]+),\s*([\d.]+)\]/g)) A[mm[1]] = [+mm[2], +mm[3]];
  for (const k in JOBS) {
    ok(A[k] && A[k][0] === JOBS[k].ox && A[k][1] === JOBS[k].oy,
      `${k}: 클라 [${A[k]}] = 계산 [${JOBS[k].ox},${JOBS[k].oy}]`);
  }
}

// ── ② 실제 PNG 치수 = 계산 치수 (IHDR 직접 파싱 — 의존성 0) ──
console.log('\n[② PNG 실치수 = 계산 치수]');
for (const k in JOBS) {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'buildings', k + '.png'));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  ok(w === JOBS[k].w && h === JOBS[k].h, `${k}.png ${w}×${h} = 계산 ${JOBS[k].w}×${JOBS[k].h}`);
}

// ── ③ ★[T132] 배포 메타 = 계산값 = 클라 표 (세 자리가 한 값인가) ──
// ★여태 건물 앵커의 정본은 **저장소에 없었다**(`scripts/building_renders/` 는 gitignore).
//   그래서 클라가 수를 손으로 베껴 들고, 이 하네스가 결정적 재계산으로 그 둘을 맞대 왔다.
//   T132 가 `public/assets/buildings/building_anchors.json` 을 배포로 올렸으니 이제 셋이다 —
//   **셋이 한 값**임을 여기서 못 박는다. 그래야 다음 카드가 클라 사본을 안심하고 지운다.
console.log('\n[③ 배포 메타 = 계산값 = 클라 표 (T132)]');
{
  const MP = path.join(__dirname, '..', 'public', 'assets', 'buildings', 'building_anchors.json');
  ok(fs.existsSync(MP), 'public/assets/buildings/building_anchors.json 이 배포돼 있다');
  if (fs.existsSync(MP)) {
    const MA = JSON.parse(fs.readFileSync(MP, 'utf8'));
    const keys = Object.keys(JOBS);
    const missing = keys.filter((k) => !MA[k]);
    const extra = Object.keys(MA).filter((k) => !JOBS[k]);
    ok(missing.length === 0 && extra.length === 0,
       `메타 ${Object.keys(MA).length}키 ↔ 굽는 표 ${keys.length}키 전수 일치` +
       (missing.length ? ` — 메타에 없음: ${missing.join(', ')}` : '') +
       (extra.length ? ` — 표에 없음: ${extra.join(', ')}` : ''));
    const bad = keys.filter((k) => !MA[k] || MA[k].w !== JOBS[k].w || MA[k].h !== JOBS[k].h
      || Math.abs(MA[k].ox - JOBS[k].ox) > 0.05 || Math.abs(MA[k].oy - JOBS[k].oy) > 0.05);
    ok(bad.length === 0, `배포 메타가 결정적 재계산값과 같다 ${bad.length ? '— 어긋남: ' + bad.join(', ') : `(${keys.length}키)`}`);
    // ★자명 통과 금지 — 메타가 서식을 갖췄나(w·h·ox·oy 넷 다)
    const shape = keys.filter((k) => MA[k] && ['w', 'h', 'ox', 'oy'].every((f) => typeof MA[k][f] === 'number'));
    ok(shape.length === keys.length, `메타 서식 {w,h,ox,oy} 전수 (${shape.length}/${keys.length}) — 못박기 읽개가 읽는 그 서식이다`);
    // ★굽기가 이 파일을 **못박기 자로 쓴다**(읽고 버리는 게 아니다)
    const py = fs.readFileSync(path.join(__dirname, 'building_render.py'), 'utf8');
    ok(/assert_pinned_box\(/.test(py) && /building_anchors\.json/.test(py),
       '★굽기가 이 메타를 **상자 못박기 자**로 쓴다 — 발자국을 고치면 굽기가 먼저 죽는다');
  }
}

// ── ④ ★[T136] 쉼터 지붕은 움집 지붕과 **틀·앵커가 같아야 한다** ──
// ★왜 — 클라는 지붕을 `w2i(rax-96, ray-128)` 고정 오프셋에 놓는다(34-m-renderloop).
//   즉 자리 계산이 그림마다 다르지 않다. 틀이 1px 라도 다르면 쉼터만 어긋나 뜬다.
//   ⇒ "같은 발자국"이라는 말을 **수로** 못 박는다.
console.log('\n[④ 쉼터 지붕 = 움집 지붕과 같은 틀·앵커 (T136)]');
{
  const a = JOBS.hut_roof, b = JOBS.shelter_roof;
  ok(a.w === b.w && a.h === b.h && a.ox === b.ox && a.oy === b.oy,
     `틀·앵커 동일 — 움집 ${a.w}×${a.h}(${a.ox},${a.oy}) · 쉼터 ${b.w}×${b.h}(${b.ox},${b.oy})`);
  // ★자명 통과 금지 — 그림은 **달라야** 한다(같은 틀에 같은 그림이면 갈릴 이유가 없다)
  const rd = (k) => fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'buildings', k + '.png'));
  const h = rd('hut_roof'), sh = rd('shelter_roof');
  ok(!h.equals(sh), '★그림은 다르다 — 같은 틀에 같은 그림이면 쉼터를 세운 뜻이 없다');
  // ★클라가 **선언으로** 고른다 — 이름 문자열로 고르면 이름표가 렌더 열쇠가 된다
  const rl = fs.readFileSync(path.join(__dirname, '..', 'public', 'client', '34-m-renderloop.js'), 'utf8');
  ok(/data\.shelter\b/.test(rl) && /_bldSpr\.shelter_roof/.test(rl),
     '★클라가 `data.shelter` 선언으로 고른다(이름 파싱 0)');
  const vg = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  ok(/shelter:\s*1/.test(vg), '★서버가 `shelter: 1` 을 실어 준다 — 선언이 있어야 화면이 갈린다');
  ok(!/ownerName[^\n]*쉼터|쉼터[^\n]*indexOf|includes\('쉼터'\)/.test(rl),
     '★렌더가 이름표(`쉼터`)를 파싱하지 않는다');
}

console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
