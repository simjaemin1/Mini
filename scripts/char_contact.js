#!/usr/bin/env node
// === scripts/char_contact.js — 병사·포로 대조표(도형 vs 시트 · 8방향) [T143 2026-09-06] =======
//
// ★왜 이 스크립트가 있나: 카드 T143 ③ 이 요구하는 대조 그림(`산그림/디자인B/병사_포로.png`)을
//   **진짜 클라 코드로** 그린다. 도형 경로(`drawPlayerIso`)를 여기 베껴 그리면 그 순간
//   정본이 둘이 되고, 그림이 제품과 갈려도 아무도 모른다(이 레포의 제1 금기).
//   ⇒ `public/` 을 정적으로 띄우고 `client/42-r2-char.js` 를 **그대로 불러** 두 함수를 부른다.
// ★팔레트도 클라 원본에서 읽는다(`20-r2-visibility.js` 의 `WAR_BT_COL`) — 사본 0.
//
// 실행: node scripts/char_contact.js [출력.png]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = process.argv[2] || path.join(ROOT, '산그림', '디자인B', '병사_포로.png');

const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.html': 'text/html' };
const srv = http.createServer((req, res) => {
  const p = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#20242c">
<canvas id="cv" width="980" height="1360"></canvas>
<script>
window.__ready = false;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
// ── 클라가 기대하는 환경 최소 스텁(그리기와 무관한 것들) ──────────────────
const uiCfg = { charSprite: 1, charRunMin: 102, charWalkMin: 4 };
const equipSlots = {}, equipment = [], equipmentMeta = { clothes: [] };
function getEquippedInstance() { return null; }
let WAR_BT_COL = null, WAR_SIDE_COL = null;
(async () => {
  // ★팔레트는 **클라 원본에서** 읽는다 — 여기 적으면 사본이 된다.
  const vis = await (await fetch('/client/20-r2-visibility.js')).text();
  const grab = (n) => eval('(' + vis.match(new RegExp('const ' + n + '\\\\s*=\\\\s*(\\\\[[^\\\\]]+\\\\])'))[1] + ')');
  WAR_BT_COL = grab('WAR_BT_COL'); WAR_SIDE_COL = grab('WAR_SIDE_COL');
  window.__pal = WAR_BT_COL;
  await new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/client/42-r2-char.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  charMeta();                                   // 메타·시트 전수 선적재를 건다
  for (let i = 0; i < 200 && !window.__charMeta; i++) await new Promise((r) => setTimeout(r, 50));
  const m = window.__charMeta;
  for (let i = 0; i < 200; i++) {               // 전 시트가 뜰 때까지
    if (Object.keys(m.sheets).every((k) => charSheet(k))) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  window.__draw = (jobs) => {
    ctx.fillStyle = '#20242c'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '13px sans-serif';
    for (const j of jobs) {
      ctx.save(); ctx.translate(j.x, j.y);
      if (j.mode === 'shape') drawPlayerIso(0, 0, j.name, j.color, false, j.opts);
      else {
        const okk = drawCharSprite(0, 0, false, j.opts);
        if (!okk) { ctx.fillStyle = '#f66'; ctx.fillText('시트 실패', -20, 0); }
        else { drawWarMarks(0, 0, j.opts); if (j.name) drawNameTag(0, 0, j.name, false, null); }
      }
      ctx.restore();
    }
    return true;
  };
  // ★확대는 **그린 화면을 그대로 3배**로 뜬다(다시 그리지 않는다 — 그러면 두 그림이 된다).
  window.__zoom = (list) => {
    ctx.imageSmoothingEnabled = false;
    for (const z of list) {
      ctx.drawImage(cv, z.sx, z.sy, z.w, z.h, z.dx, z.dy, z.w * z.k, z.h * z.k);
      ctx.strokeStyle = '#4a5566'; ctx.lineWidth = 1;
      ctx.strokeRect(z.dx + 0.5, z.dy + 0.5, z.w * z.k - 1, z.h * z.k - 1);
      ctx.strokeRect(z.sx + 0.5, z.sy + 0.5, z.w - 1, z.h - 1);
    }
    ctx.imageSmoothingEnabled = true;
  };
  window.__label = (items) => {
    ctx.textAlign = 'center';
    for (const it of items) {
      ctx.font = (it.bold ? 'bold ' : '') + (it.size || 13) + 'px sans-serif';
      ctx.fillStyle = it.color || '#dfe6f0';
      ctx.fillText(it.t, it.x, it.y);
    }
    ctx.textAlign = 'start';
  };
  window.__ready = true;
})().catch((e) => { window.__err = String(e && e.stack || e); });
</script></body>`;

(async () => {
  const { chromium } = require('playwright');
  await new Promise((r) => srv.listen(3099, r));
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await br.newPage();
  pg.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await pg.route('**/__contact', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await pg.goto('http://127.0.0.1:3099/__contact');
  await pg.waitForFunction('window.__ready === true || window.__err', null, { timeout: 60000 });
  const err = await pg.evaluate('window.__err || null');
  if (err) throw new Error(err);
  const pal = await pg.evaluate('window.__pal');

  // ── 판 짜기 — 행 8방향 · 열 넷(병사 도형/시트 · 포로 도형/시트) + 병종 여덟 띠 ─────
  const CW = 150, CH = 118, X0 = 120, Y0 = 92;
  const jobs = [], labels = [];
  const dirVec = (d) => { const a = d * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
  labels.push({ t: 'T143 — 병사·포로: 도형 vs 시트 (8방향)', x: 490, y: 30, size: 18, bold: true });
  labels.push({ t: '왼쪽 둘 = 전쟁 병사(병종 3 창병 · 진영 0 · 지휘관) · 오른쪽 둘 = 포로(cap)', x: 490, y: 52, size: 12, color: '#9fb0c4' });
  const cols = [['병사 · 도형', 'shape', 'war'], ['병사 · 시트', 'sheet', 'war'], ['포로 · 도형', 'shape', 'cap'], ['포로 · 시트', 'sheet', 'cap']];
  cols.forEach((c, i) => labels.push({ t: c[0], x: X0 + i * CW, y: Y0 - 18, size: 13, bold: true }));
  for (let d = 0; d < 8; d++) {
    const [fx, fy] = dirVec(d);
    labels.push({ t: 'd' + d, x: 46, y: Y0 + d * CH + 8, size: 12, color: '#9fb0c4' });
    cols.forEach((c, i) => {
      const isCap = c[2] === 'cap';
      const opts = { pid: 'p' + d + i + c[1], fvx: fx, fvy: fy, speed: 40, moving: true,
                     war: !isCap, bt: 2, bs: 0, bc: !isCap ? 1 : 0, br: 0, cap: isCap, clothes: 'hemp' };
      // ★이름표는 끈다 — 이 그림의 용도는 **몸에 무엇이 붙었는지** 보는 것이고, 이름표는
      //   y−22 라 60px 짜리 시트의 허리를 정확히 가린다(도형 22px 기준으로 정해진 자리 · 종전 규약).
      jobs.push({ x: X0 + i * CW, y: Y0 + d * CH + 78, mode: c[1], name: '', color: '#5a9ae0', opts });
    });
  }
  // 병종 여덟 — 시트 경로만(같은 방향 d1)
  const PY = Y0 + 8 * CH + 44;
  labels.push({ t: '병종 여덟 — 띠 한 층을 팔레트로 채운다(시트 경로 · d1)', x: 490, y: PY - 58, size: 13, bold: true });
  for (let b = 0; b < 8; b++) {
    const [fx, fy] = dirVec(1);
    jobs.push({ x: 90 + b * 110, y: PY, mode: 'sheet', name: '', color: '#5a9ae0',
                opts: { pid: 'bt' + b, fvx: fx, fvy: fy, speed: 0, war: true, bt: b, bs: b % 2, bc: 0, br: 0, cap: false, clothes: 'hemp' } });
    labels.push({ t: pal[b], x: 90 + b * 110, y: PY + 16, size: 11, color: pal[b] });
  }
  // ── 밧줄 있고 없고 — 같은 자세·같은 방향, `cap` 만 다르다(A/B) ────────────────
  const ABY = PY + 190;
  for (let i = 0; i < 2; i++) {
    const [fx, fy] = dirVec(1);
    jobs.push({ x: 150 + i * 130, y: ABY, mode: 'sheet', name: '', color: '#5a9ae0',
                opts: { pid: 'ab' + i, fvx: fx, fvy: fy, speed: 40, war: false, cap: i === 1, clothes: 'hemp' } });
    labels.push({ t: i ? '포로(cap 1)' : '보통(cap 0)', x: 150 + i * 130, y: ABY + 18, size: 12, color: '#9fb0c4' });
  }
  labels.push({ t: '밧줄 있고 없고 — 같은 자세·같은 방향에서 `cap` 만 다르다 (손목 ×6)', x: 490, y: ABY - 138, size: 13, bold: true });
  await pg.evaluate((j) => window.__draw(j), jobs);
  const dbg = await pg.evaluate('JSON.parse(JSON.stringify(window.__charDbg||{}))');
  const pick = (k) => dbg[k] ? `${k}: ${(dbg[k].layers || []).join('+')} · clip ${dbg[k].clip} · bt ${dbg[k].bt} · 색 ${dbg[k].bandCol}` : `${k}: 없음`;
  console.log('[층] ' + pick('p01sheet'));
  console.log('[층] ' + pick('p03sheet'));
  console.log('[층] ' + pick('bt5'));
  // 확대 둘 — 병사의 허리(띠) · 포로의 손목(밧줄). 자리는 d1 행에서 딴다.
  // ★자리는 **메타에서** 딴다(눈대중 0): 손목은 `handScreen`, 허리는 `band` 층의 프레임 상자.
  const meta = await pg.evaluate('window.__charMeta');
  const D = 1;                                   // 확대에 쓸 방향 행
  const wrist = meta.handScreen.walk[D][0];      // 프레임 좌표(클라 px)
  const rel = (p) => [p[0] - meta.anchorX, p[1] - meta.anchorY];
  const [wdx, wdy] = rel(wrist);
  const bandY = -35.7;                           // 허리끈 프레임 y 46 − 앵커 81.663 (실측 · band_idle bbox)
  const cellXY = (col) => [X0 + col * CW, Y0 + D * CH + 78];
  const [sxS, syS] = cellXY(1), [sxC, syC] = cellXY(3);
  const ZS = [
    { sx: sxS - 22, sy: syS + bandY - 12, w: 44, h: 26, k: 4, dx: 620, dy: Y0 + 6, t: '병사 허리 ×4 (띠)' },
    { sx: sxC + wdx - 22, sy: syC + wdy - 13, w: 44, h: 26, k: 4, dx: 620, dy: Y0 + 140, t: '포로 손목 ×4 (밧줄)' },
  ];
  for (let i = 0; i < 2; i++)
    ZS.push({ sx: 150 + i * 130 + wdx - 15, sy: ABY + wdy - 11, w: 30, h: 22, k: 6, dx: 400 + i * 200, dy: ABY - 104, t: i ? '포로 ×6' : '보통 ×6' });
  await pg.evaluate((z) => window.__zoom(z), ZS);
  for (const z of ZS) labels.push({ t: z.t, x: z.dx + z.w * z.k / 2, y: z.dy - 8, size: 12, color: '#9fb0c4' });
  await pg.evaluate((l) => window.__label(l), labels);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const buf = await pg.locator('#cv').screenshot();
  fs.writeFileSync(OUT, buf);
  console.log('[대조표] ' + OUT + ' · ' + buf.length + ' bytes');
  await br.close(); srv.close();
})().catch((e) => { console.error(e); srv.close(); process.exit(1); });
