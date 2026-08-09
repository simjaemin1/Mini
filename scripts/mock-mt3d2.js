#!/usr/bin/env node
// =============================================================================
// 목업 2차 — 3D 산을 **mtseg 자리에 꽂는** 판 [재민(타 세션) 2026-08-08 사양]
//
//  ① 재질 A/B      A = PEAK 식 플랫셰이딩 + 제한 팔레트
//                  B = mt_G 스프라이트에서 뽑은 바위 질감을 경사면에
//  ② 합성          기존 스프라이트(나무·바위·건물·NPC)를 **라이브 규약대로** 합성.
//                  산 뒤 개체가 제대로 가려지는지 **가림 실측**.
//  ③ 파괴          1셀 관통 통로 + 3×3 채석. 리메시 후 통로가 걸을 수 있게 보이나.
//  ④ 숲산          나무를 h(셀)만큼 올려 경사면에 꽂기.
//  ⑤ 안개          미탐사(검정) / 봤지만 시야 밖(0.2) / 시야 안 — 산 위에서 성립하나.
//  ⑥ 자락 톱니     1차 목업에 보인 경계 톱니 처리안.
//
//  전부 **1:1 게임 배율**, 실제 바위 마스크. 라이브 코드 무접촉(여기는 scripts/ 다).
//
//  실행: node scripts/mock-mt3d2.js            (전체)
//        SCENE=matAB node scripts/mock-mt3d2.js  (하나만)
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');

// ── 스테일 가드 ──────────────────────────────────────────────────────────────
// ★컨테이너가 여덟 번 롤백했다. 옛 코드로 잰 숫자를 낸 적이 두 번 있다.
for (const f of ['scripts/mt3d-engine.js', 'public/assets/terrain/rock_angled.png']) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error('✗ 없다: ' + f + ' — 롤백 의심. 측정 중단'); process.exit(2); }
}

// ★장면 크기 = **실제 게임 화면**. 등각에서 보이는 폭은 (W+H)·32px 다.
//   24+24 = 1536px ≈ 캔버스 1408px. 1차 판은 44×30(=2368px)이라 화면의 1.7배를
//   그리고 있었고, 그래서 개체가 화면 밖으로 나가 가림 표본이 3개까지 줄었다.
// ★자리도 눈으로 고르지 않았다 — 560×300 격자를 캐시해 훑고, 후보마다 **높이장을 실제로
//   만들어** '가릴 수 있는 셀 수(lift>1.2칸)'까지 세서 점수를 매긴 1위다.
//   (lift = 앞 마루가 발밑보다 솟은 높이. 이 카메라는 1칸 깊이 = 1칸 높이라
//    **경사가 45°를 넘는 곳에서만** 가림이 생긴다 — 그게 없는 장면은 ②를 못 본다.)
const CX = +(process.env.CX || 1914), CY = +(process.env.CY || 202);
// ★여백(MG) — 화면 밖까지 지형을 만든다. 없으면 장면 **가장자리에서 메시가 끊겨**
//   그 뒤가 뻥 뚫리고, 계측이 "부수기 전에도 바닥이 보였다(0.0%)" 같은 헛것을 잡는다.
const MG = +(process.env.MG || 6);
const SC_W = (+(process.env.W || 24)) + MG * 2, SC_H = (+(process.env.H || 24)) + MG * 2;
const HMAX = +(process.env.HMAX || 14), LAM = +(process.env.LAM || 7);
const CH = +(process.env.CH || 8), BAND = +(process.env.BAND || 1);
const SCENE = process.env.SCENE || 'all';
const OUTDIR = process.env.OUTDIR || '/tmp/mt3d2';
fs.mkdirSync(OUTDIR, { recursive: true });

// ── 장면: 실제 바위 마스크 ───────────────────────────────────────────────────
const cx0 = CX - (SC_W >> 1), cy0 = CY - (SC_H >> 1);
const CELLS = [];
let nRock = 0;
for (let j = 0; j < SC_H; j++) {
  const row = [];
  for (let i = 0; i < SC_W; i++) {
    const x = (cx0 + i) * 32 + 16, y = (cy0 + j) * 32 + 16;
    const v = T.isWaterCellLocal('hanbando', x, y) ? 1 : (T.isRockCellLocal('hanbando', x, y) ? 2 : 0);
    row.push(v); if (v === 2) nRock++;
  }
  CELLS.push(row);
}
console.log(`장면 ${SC_W}×${SC_H}셀 @ (${cx0},${cy0}) · 바위 ${nRock} (${(nRock / (SC_W * SC_H) * 100).toFixed(1)}%)`);
if (nRock < SC_W * SC_H * 0.15) { console.error('✗ 바위가 너무 적다 — 산 장면이 아니다. CX/CY 를 옮겨라'); process.exit(2); }

// ── 자산 인라인 (file:// 페이지라 상대 경로가 안 뜬다) ────────────────────────
const b64 = (p) => 'data:image/' + (p.endsWith('.webp') ? 'webp' : 'png') + ';base64,'
  + fs.readFileSync(path.join(ROOT, p)).toString('base64');
const TEXSRC = {
  grass: b64('public/assets/terrain/grass_angled.png'),
  dry: b64('public/assets/terrain/dry_angled.png'),
  mud: b64('public/assets/terrain/mud_angled.png'),
  rock: b64('public/assets/terrain/rock_angled.png'),
};
const natAnchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/nature/nature_anchors.json'), 'utf8'));
const OBJ_NAMES = ['tree01', 'tree03', 'tree06', 'tree09', 'bush02', 'rock03', 'mossrock02', 'ore04'];
const OBJSRC = {};
for (const n of OBJ_NAMES) {
  const p = fs.existsSync(path.join(ROOT, 'public/assets/nature/' + n + '.png'))
    ? 'public/assets/nature/' + n + '.png' : 'public/assets/trees/' + n + '.png';
  if (fs.existsSync(path.join(ROOT, p))) OBJSRC[n] = b64(p);
}
const BLDSRC = {};
for (const n of ['hut_s1', 'hut_roof', 'granary']) {
  const p = 'public/assets/buildings/' + n + '.png';
  if (fs.existsSync(path.join(ROOT, p))) BLDSRC[n] = b64(p);
}
const ENGINE = fs.readFileSync(path.join(ROOT, 'scripts/mt3d-engine.js'), 'utf8');

const S = { W: SC_W, H: SC_H, CELLS, HMAX, LAM, cx0, cy0, MG };

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{background:#0a0d10;margin:0;font:13px sans-serif;color:#e6dfd0}canvas{display:block}</style></head><body>
<script>${ENGINE}<\/script>
<script>
const S = ${JSON.stringify(S)};
window.MT3D_SUBPX = ${+(process.env.SUBPX || 8)};
const CH = ${CH}, BAND = ${BAND}, SCENE = ${JSON.stringify(SCENE)};
const TEXSRC = ${JSON.stringify(TEXSRC)}, OBJSRC = ${JSON.stringify(OBJSRC)}, BLDSRC = ${JSON.stringify(BLDSRC)};
const NATA = ${JSON.stringify(natAnchors)};
${fs.readFileSync(path.join(ROOT, 'scripts/mt3d-scenes.js'), 'utf8')}
<\/script></body></html>`;

fs.writeFileSync('/tmp/mt3d2.html', html);

(async () => {
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 400)));
  pg.on('console', (m) => { const t = m.text(); if (!/^\[dbg\]/.test(t)) console.log('  ' + t); });
  await pg.goto('file:///tmp/mt3d2.html');
  await pg.waitForFunction(() => window.__done === true, { timeout: 300000 });
  const R = await pg.evaluate(() => window.__R);

  for (const s of R.shots) {
    const el = await pg.$('#' + s.id);
    if (el) { await el.screenshot({ path: path.join(OUTDIR, s.file) }); }
  }
  console.log('\n' + R.report);
  fs.writeFileSync(path.join(OUTDIR, '보고.txt'), R.report);
  console.log('\n산출 디렉터리: ' + OUTDIR);
  await br.close();
  process.exit(R.fail ? 1 : 0);
})();
