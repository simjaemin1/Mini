#!/usr/bin/env node
// 인벤 아이콘 후처리 — Blender 512² 렌더 → 알파 bbox 크롭 → 96×96 캔버스(박스필터 축소, 중앙 정렬)
// 사용: node scripts/icons-postprocess.js <입력디렉토리> <출력디렉토리> [--sheet <시트경로>]
//   입력: <key>.png (RGBA, film_transparent)
//   출력: <key>.png (96×96 RGBA)
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const IN = process.argv[2] || 'icon_renders';
const OUT = process.argv[3] || 'public/assets/icons';
const sheetIdx = process.argv.indexOf('--sheet');
const SHEET = sheetIdx > 0 ? process.argv[sheetIdx + 1] : null;
const SIZE = 96;
const PAD = 2;              // 크롭 여유(안티에일리어싱 가장자리 보존)

fs.mkdirSync(OUT, { recursive: true });

function readPng(p) { return PNG.sync.read(fs.readFileSync(p)); }

function alphaBBox(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
  x1 = Math.min(png.width - 1, x1 + PAD); y1 = Math.min(png.height - 1, y1 + PAD);
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// 박스필터 축소 (프리멀티플라이드 가중 — 반투명 가장자리 색 번짐 방지)
function boxResize(png, bb, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  out.data.fill(0);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = bb.y0 + Math.floor(dy * bb.h / dh);
    const sy1 = bb.y0 + Math.max(sy0 - bb.y0 + 1, Math.floor((dy + 1) * bb.h / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = bb.x0 + Math.floor(dx * bb.w / dw);
      const sx1 = bb.x0 + Math.max(sx0 - bb.x0 + 1, Math.floor((dx + 1) * bb.w / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = sy0; y < sy1 && y < bb.y0 + bb.h; y++) {
        for (let x = sx0; x < sx1 && x < bb.x0 + bb.w; x++) {
          const i = (y * png.width + x) * 4;
          const al = png.data[i + 3] / 255;
          r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al;
          a += png.data[i + 3]; n++;
        }
      }
      if (!n) continue;
      const aa = a / n;
      const o = (dy * dw + dx) * 4;
      if (aa > 0.5) {
        const k = 255 / aa;   // 언프리멀티플라이
        out.data[o] = Math.min(255, Math.round(r / n * k));
        out.data[o + 1] = Math.min(255, Math.round(g / n * k));
        out.data[o + 2] = Math.min(255, Math.round(b / n * k));
      }
      out.data[o + 3] = Math.round(aa);
    }
  }
  return out;
}

function pasteCenter(src, size) {
  const out = new PNG({ width: size, height: size });
  out.data.fill(0);
  const ox = Math.floor((size - src.width) / 2), oy = Math.floor((size - src.height) / 2);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4, di = ((y + oy) * size + (x + ox)) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  }
  return out;
}

const files = fs.readdirSync(IN).filter(f => f.endsWith('.png')).sort();
const done = [];
for (const f of files) {
  const png = readPng(path.join(IN, f));
  const bb = alphaBBox(png);
  if (!bb) { console.warn('  [skip] 알파 비어있음:', f); continue; }
  const scale = SIZE / Math.max(bb.w, bb.h);
  const dw = Math.max(1, Math.round(bb.w * scale)), dh = Math.max(1, Math.round(bb.h * scale));
  const small = boxResize(png, bb, dw, dh);
  const fin = pasteCenter(small, SIZE);
  fs.writeFileSync(path.join(OUT, f), PNG.sync.write(fin));
  done.push({ key: f.replace(/\.png$/, ''), bb, dw, dh, png: fin });
  console.log(`  ${f.padEnd(20)} bbox ${bb.w}×${bb.h} → ${dw}×${dh} (96 캔버스)`);
}
console.log(`총 ${done.length}종 → ${OUT}`);

// 컨택트 시트 (UI 배경색 #2a2e2a 위 정렬 격자)
if (SHEET && done.length) {
  const COLS = 6, CELL = 112, LABEL = 16;
  const rows = Math.ceil(done.length / COLS);
  const W = COLS * CELL, H = rows * (CELL + LABEL);
  const sheet = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    sheet.data[i * 4] = 0x2a; sheet.data[i * 4 + 1] = 0x2e; sheet.data[i * 4 + 2] = 0x2a; sheet.data[i * 4 + 3] = 255;
  }
  done.forEach((d, i) => {
    const cx = (i % COLS) * CELL + Math.floor((CELL - SIZE) / 2);
    const cy = Math.floor(i / COLS) * (CELL + LABEL) + Math.floor((CELL - SIZE) / 2);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const si = (y * SIZE + x) * 4, di = ((cy + y) * W + (cx + x)) * 4;
      const a = d.png.data[si + 3] / 255;
      for (let k = 0; k < 3; k++) sheet.data[di + k] = Math.round(sheet.data[di + k] * (1 - a) + d.png.data[si + k] * a);
    }
  });
  fs.writeFileSync(SHEET, PNG.sync.write(sheet));
  console.log('시트:', SHEET, `${W}×${H}`);
}
