#!/usr/bin/env node
// (@regress 없음 — 증거 그림 한 장 · 제품 0)
// === scripts/t1194-draw-shot.js — 손잡이 `T1194_MODEL_SPRITES` 끔 ↔ 켬을 **클라 정본 함수 그대로** 빈 판에 그려 찍는다 ===
//
// ★무엇을 그리나: `public/client/40-r2-sprites.js` 의 `drawMobIso`(짐승 그리기) · T1194 블록(`modelSpriteOf` · `drawModelSprite`)과
//   `public/client/42-r2-char.js` 의 `charDirRow`(방향 행) — **글자 그대로 잘라 와서** 브라우저 캔버스에서 돌린다(사본 0).
//   그림 · 메타 · 목록은 `public/` 를 그대로 내주는 작은 서버에서 받는다(클라와 같은 경로 `/assets/animals/…`).
// ★실게임 화면은 아니다 — 그 함수가 받는 것(화면 좌표 · 짐승 칸 · 손잡이)만 세운 판이다. 실게임 실화면은 켜는 날의 카드다.
//
// 실행: node scripts/t1194-draw-shot.js <출력.png>
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '보고', 'T1194', '켬_그리기.png');

function cut(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a + startMark.length);
  if (a < 0 || b < 0) throw new Error('자르기 표식이 없다: ' + startMark);
  return src.slice(a, b);
}
const S40 = fs.readFileSync(path.join(ROOT, 'public', 'client', '40-r2-sprites.js'), 'utf8');
const S42 = fs.readFileSync(path.join(ROOT, 'public', 'client', '42-r2-char.js'), 'utf8');
const T1194 = cut(S40, '  // ═══ ★[T1194 모델 시트]', '  // ═══ ★[T1194] 끝 ═══');
const MOB = cut(S40, '  function drawMobIso(x, y, mob) {', '  // Phase 5-8: 입체 나무');
const DIR = cut(S42, '  function charDirRow(fx, fy) {', '\n  }\n') + '\n  }\n';

const MIME = { '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><canvas id="c" width="760" height="300"></canvas></body>'); return; }
  const f = path.join(ROOT, 'public', path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 760, height: 300 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.addScriptTag({ url: '/animals.js' });
  const code = `
    var ctx = document.getElementById('c').getContext('2d');
    var uiCfg = { modelSprites: false };
    ${DIR}
    ${T1194}
    ${MOB}
    window.__t = { drawMobIso, modelSpriteOf, set: (v) => { uiCfg.modelSprites = v; } };`;
  await page.addScriptTag({ content: code });
  const res = await page.evaluate(async () => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    const grass = new Image(); grass.src = '/assets/terrain/grass_angled.png';
    await new Promise((r) => { grass.onload = r; grass.onerror = r; });
    const pat = grass.width ? g.createPattern(grass, 'repeat') : '#40522f';
    g.fillStyle = pat; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, c.width, 22);
    g.font = '13px sans-serif'; g.fillStyle = '#eee'; g.textBaseline = 'middle';
    g.fillText('끔(기본) — 점선 칸', 14, 11); g.fillText('켬 T1194_MODEL_SPRITES=1 — 서 있기 그림 · 8방향(d = 0 동 … 7 북동)', 196, 11);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(180, 0); g.lineTo(180, c.height); g.stroke();
    const mob = (fx, fy, hp) => ({ mid: 'm' + fx + '_' + fy + '_' + hp, type: 'wild_boar', _fvx: fx, _fvy: fy, hp, maxHp: 60 });
    // 끔
    window.__t.set(false);
    window.__t.drawMobIso(90, 150, mob(1, 0, 60));
    window.__t.drawMobIso(90, 230, mob(1, 0, 25));
    // 켬 — 그림이 뜰 때까지(목록 → 메타 → 시트) 기다린다
    window.__t.set(true);
    for (let i = 0; i < 200 && !window.__t.modelSpriteOf('wild_boar'); i++) await new Promise((r) => setTimeout(r, 25));
    const ok = !!window.__t.modelSpriteOf('wild_boar');
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    dirs.forEach(([fx, fy], d) => {
      const x = 240 + d * 66, y = 120;
      window.__t.drawMobIso(x, y, mob(fx, fy, 60));
      g.fillStyle = '#eee'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText('d ' + d, x, y + 34); g.textAlign = 'start';
    });
    window.__t.drawMobIso(300, 230, mob(1, 0, 25));          // 다친 짐승 — 체력 막대가 그림 위로
    window.__t.drawMobIso(520, 230, { mid: 'y', type: 'cow', _fvx: 1, _fvy: 0, hp: 1, maxHp: 1 });        // 시트 없는 종 — 켜도 점선 칸
    g.fillStyle = '#eee'; g.font = '11px sans-serif'; g.textAlign = 'center';
    g.fillText('다친 멧돼지', 300, 262); g.fillText('소(시트 없음) → 점선 칸', 520, 262); g.textAlign = 'start';
    return { ok, dbg: window.__mdlDbg };
  });
  await page.locator('#c').screenshot({ path: OUT });
  await browser.close();
  server.close();
  console.log(JSON.stringify({ out: OUT, spriteLoaded: res.ok, drawn: Object.keys(res.dbg || {}).length, rows: Object.values(res.dbg || {}).map((d) => d.row) }));
  if (!res.ok) process.exit(1);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
