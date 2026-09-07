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
//       node scripts/char_contact.js --captive [출력.png]   ← T149 판(포로 두 손 · 옛 판 대조)
//
// ★[T149] 옛 판(T143)을 어떻게 그리나 — **클립을 지운 클라**로 그린다.
//   `drawCharSprite` 는 묶인 판이 없으면 종전 상태기로 떨어지므로(폴백), `__charMeta.clips` 에서
//   `captive_*` 를 빼고 같은 함수를 부르면 그게 **정확히 T143 의 그림**이다.
//   옛 그림을 따로 짜 넣지 않는다 — 그러면 정본이 둘이 된다.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const ARGV = process.argv.slice(2).filter((v) => !v.startsWith('--'));
const CAPTIVE = process.argv.includes('--captive');
const MOCAP = process.argv.includes('--mocap');
const OUT = ARGV[0] || path.join(ROOT, '산그림', '디자인B',
  MOCAP ? '캐릭터_모캡_도끼질_조준.png' : (CAPTIVE ? '포로_두손.png' : '병사_포로.png'));

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
  window.__draw = (jobs, keep) => {
    if (!keep) { ctx.fillStyle = '#20242c'; ctx.fillRect(0, 0, cv.width, cv.height); }
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
  // ★클립을 잠깐 빼고 그린다 — 폴백 경로가 곧 옛 그림이다(사본 0).
  window.__withoutClips = (keys, fn) => {
    const m = window.__charMeta, saved = {};
    for (const k of keys) { saved[k] = m.clips[k]; delete m.clips[k]; }
    try { return fn(); } finally { for (const k of keys) if (saved[k]) m.clips[k] = saved[k]; }
  };
  window.__drawOld = (jobs) => window.__withoutClips(['captive_walk', 'captive_idle'], () => window.__draw(jobs, true));
  // ★[T155] 클립·판을 **지정해서** 한 판을 합성한다 — 대조표는 "그 판"을 보여야 하는데
  //   'drawCharSprite' 는 시간이 판을 고른다(도끼질은 원샷이라 더 그렇다).
  //   ⚠고르는 것은 **판뿐**이다: 어느 층을 쌓을지는 클라의 'charLayersFor' 가 정하고,
  //     시트도 클라의 'charSheet' 가 준다. 자리는 메타의 앵커다(수 사본 0).
  window.__cell = (x, y, clip, frame, row, opts) => {
    const m = window.__charMeta;
    const layers = charLayersFor(false, opts || {});
    const fw = m.frameW, fh = m.frameH;
    const dx = Math.round(x - m.anchorX), dy = Math.round(y - m.anchorY);
    for (const L of layers) {
      const img = charSheet(L + '_' + clip);
      if (!img) return false;
      ctx.drawImage(img, frame * fw, row * fh, fw, fh, dx, dy, fw, fh);
    }
    return true;
  };
  window.__lumaDiff = (clipA, clipB, frame, row, layer) => {
    const m = window.__charMeta, fw = m.frameW, fh = m.frameH;
    const a = charSheet(layer + '_' + clipA), b = charSheet(layer + '_' + clipB);
    if (!a || !b) return null;
    const cv2 = document.createElement('canvas'); cv2.width = fw * 2; cv2.height = fh;
    const t = cv2.getContext('2d');
    t.drawImage(a, frame * fw, row * fh, fw, fh, 0, 0, fw, fh);
    t.drawImage(b, frame * fw, row * fh, fw, fh, fw, 0, fw, fh);
    const d = t.getImageData(0, 0, fw * 2, fh).data;
    let s = 0, n = 0;
    for (let i = 0; i < fw * fh; i++) {
      const p = i * 4, q = (fw * fh + i) * 4;
      if (d[p + 3] < 200 && d[q + 3] < 200) continue;
      const L1 = d[p + 3] < 200 ? 0 : 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
      const L2 = d[q + 3] < 200 ? 0 : 0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2];
      s += Math.abs(L1 - L2); n++;
    }
    return n ? +(s / n).toFixed(2) : null;
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

/** T155 판 — 손 포즈 vs CMU 모캡 · 도끼질·조준·서기 · 8방향 + 옷 셋 + |Δ휘도|. */
async function mocapSheet(pg) {
  const CW = 112, CH = 112, X0 = 96, Y0 = 136;
  await pg.evaluate((h) => { document.getElementById('cv').height = h; }, Y0 + 8 * CH + 210);
  const meta = await pg.evaluate('window.__charMeta');
  // 내려치는 판은 **잰다** — 하네스와 같은 뜻으로, 손이 가장 앞으로 나가는 이웃 쌍의 뒤 판.
  const strike = await pg.evaluate((m) => {
    const hs = m.handScreen.swing2; let best = 0, bf = 1;
    for (let f = 0; f + 1 < m.clips.swing2.frames; f++) {
      let s = 0;
      for (let d = 0; d < 8; d++) s += hs[d][f + 1][1] - hs[d][f][1];   // 화면에서 아래로 = 내려침
      if (s > best) { best = s; bf = f + 1; }
    }
    return bf;
  }, meta);
  // ★도끼질은 **들어올림과 내려침을 같이** 보여야 한다 — 내려침 한 판만 놓으면 모캡판이
  //   허리를 접은 그림 하나로만 읽힌다(실제로 그 판이 그렇다). 두 판을 나란히 두는 것이 공정하다.
  const raise2 = await pg.evaluate((m) => {
    const hs = m.handScreen.swing2; let best = 1e9, bf = 0;
    for (let f = 0; f < m.clips.swing2.frames; f++) {
      let s = 0; for (let d = 0; d < 8; d++) s += hs[d][f][1];   // 화면에서 위 = 작은 y
      if (s < best) { best = s; bf = f; }
    }
    return bf;
  }, meta);
  const cols = [['도끼질 손 · 들어올림', 'swing', 2], ['도끼질 손 · 내려침', 'swing', 3],
                ['도끼질 모캡 · 들어올림', 'swing2', raise2], ['도끼질 모캡 · 내려침', 'swing2', strike],
                ['조준 · 손 포즈', 'aim', 0], ['조준 · 모캡', 'aim2', 0],
                ['서기 · 손 포즈', 'idle', 0], ['서기 · 모캡', 'idle2', 0]];
  const labels = [];
  labels.push({ t: 'T155 — 도끼질·조준·서기: 손 포즈 vs CMU 모캡 (8방향)', x: 490, y: 34, size: 18, bold: true });
  labels.push({ t: '왼쪽이 지금 배포본(손으로 지은 포즈) · 오른쪽이 둘째 판(CMU 모캡) — 같은 판 번호·같은 방향', x: 490, y: 56, size: 12, color: '#9fb0c4' });
  labels.push({ t: `모캡 판 번호는 재서 골랐다 — 들어올림 f${raise2}(손이 화면에서 가장 높은 판) · 내려침 f${strike}(가장 많이 내려가는 이웃 쌍)`, x: 490, y: 76, size: 11, color: '#7f8ea3' });
  cols.forEach((c, i) => labels.push({ t: c[0], x: X0 + i * CW, y: Y0 - 22 - (i % 2 ? 0 : 15), size: 11, bold: true }));
  const cells = [];
  for (let d = 0; d < 8; d++) {
    labels.push({ t: 'd' + d, x: 44, y: Y0 + d * CH + 8, size: 12, color: '#9fb0c4' });
    cols.forEach((c, i) => cells.push({ x: X0 + i * CW, y: Y0 + d * CH + 74, clip: c[1], frame: c[2], row: d,
                                        opts: { clothes: 'hemp' } }));
  }
  // 옷 셋 — 삼베·갖옷·가죽으로 도끼질 두 판을 나란히(d1)
  const CY = Y0 + 8 * CH + 92;
  labels.push({ t: '옷 셋 — 도끼질 손 포즈 vs 모캡 (d1 · 삼베 · 갖옷 · 가죽)', x: 490, y: CY - 78, size: 13, bold: true });
  ['hemp', 'fur', 'leather'].forEach((mat, k) => {
    cells.push({ x: 180 + k * 220, y: CY, clip: 'swing', frame: cols[0][2], row: 1, opts: { clothes: mat } });
    cells.push({ x: 265 + k * 220, y: CY, clip: 'swing2', frame: strike, row: 1, opts: { clothes: mat } });
    labels.push({ t: mat, x: 222 + k * 220, y: CY + 18, size: 11, color: '#9fb0c4' });
  });
  const bad = [];
  for (const c of cells) {
    const okc = await pg.evaluate((j) => window.__cell(j.x, j.y, j.clip, j.frame, j.row, j.opts), c);
    if (!okc) bad.push(c.clip + ' f' + c.frame + ' d' + c.row);
  }
  if (bad.length) console.error('[대조표] ⚠못 그린 칸: ' + bad.slice(0, 5).join(', '));
  // |Δ휘도| — 같은 판·같은 방향에서 두 판이 얼마나 다른가(몸 층 기준)
  const dl = [];
  for (const [a2, b2, f] of [['swing', 'swing2', 0], ['aim', 'aim2', 0], ['idle', 'idle2', 0]]) {
    const v = await pg.evaluate((q) => window.__lumaDiff(q[0], q[1], q[2], 1, 'body'), [a2, b2, f]);
    dl.push(`${a2}↔${b2} ${v}`);
  }
  labels.push({ t: '|Δ휘도| (몸 층 · d1 · f0 · 실루엣 합집합 안): ' + dl.join('  ·  '), x: 490, y: CY + 56, size: 12, color: '#9fb0c4' });
  await pg.evaluate((l) => window.__label(l), labels);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const buf = await pg.locator('#cv').screenshot();
  fs.writeFileSync(OUT, buf);
  console.log('[대조표] ' + OUT + ' · ' + buf.length + ' bytes · 내려침 판 f' + strike);
}

/** T149 판 — 옛 판(T143 · 팔이 옆) vs 이 판(묶인 자세) · 8방향. */
async function captiveSheet(pg, pal) {
  const CW = 150, CH = 118, X0 = 150, Y0 = 96;
  await pg.evaluate((h) => { document.getElementById('cv').height = h; }, Y0 + 8 * CH + 60);
  const dirVec = (d) => { const a = d * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
  const labels = [];
  labels.push({ t: 'T149 — 포로: 옛 판(T143) vs 묶인 자세 (8방향 · 걷기)', x: 490, y: 32, size: 18, bold: true });
  labels.push({ t: '옛 판은 클립을 뺀 **같은 클라**가 그린 것이다 — 시트가 없을 때의 폴백이 곧 그 그림이다', x: 490, y: 54, size: 12, color: '#9fb0c4' });
  ['옛 판 · 팔이 옆', '이 판 · 두 손 앞', '이 판 · 서 있는 포로'].forEach((t, i) =>
    labels.push({ t, x: X0 + i * CW, y: Y0 - 18, size: 13, bold: true }));
  const mk = (col, d, opts) => ({ x: X0 + col * CW, y: Y0 + d * CH + 80, mode: 'sheet', name: '', color: '#5a9ae0', opts });
  const oldJobs = [], newJobs = [];
  for (let d = 0; d < 8; d++) {
    const [fx, fy] = dirVec(d);
    labels.push({ t: 'd' + d, x: 60, y: Y0 + d * CH + 10, size: 12, color: '#9fb0c4' });
    oldJobs.push(mk(0, d, { pid: 'old' + d, fvx: fx, fvy: fy, speed: 40, cap: true, clothes: 'hemp' }));
    newJobs.push(mk(1, d, { pid: 'new' + d, fvx: fx, fvy: fy, speed: 40, cap: true, clothes: 'hemp' }));
    newJobs.push(mk(2, d, { pid: 'sit' + d, fvx: fx, fvy: fy, speed: 0, cap: true, clothes: 'hemp' }));
  }
  await pg.evaluate((j) => window.__draw(j), newJobs);
  await pg.evaluate((j) => window.__drawOld(j), oldJobs);
  const dbg = await pg.evaluate('JSON.parse(JSON.stringify(window.__charDbg||{}))');
  for (const k of ['old1', 'new1', 'sit1']) console.log('[층] ' + k + ': ' + (dbg[k] ? `${(dbg[k].layers||[]).join('+')} · clip ${dbg[k].clip} f${dbg[k].frame}` : '없음'));
  // 확대 — 손목 자리는 메타에서 딴다(눈대중 0)
  const meta = await pg.evaluate('window.__charMeta');
  const D = 1;
  const rel = (p) => [p[0] - meta.anchorX, p[1] - meta.anchorY];
  const [ow, oh] = rel(meta.handScreen.walk[D][0]);
  const [nw, nh] = rel(meta.handScreen.captive_walk[D][0]);
  const ZS = [
    { sx: X0 + ow - 20, sy: Y0 + D * CH + 80 + oh - 15, w: 40, h: 30, k: 5, dx: 620, dy: Y0 + 8, t: '옛 판 손목 ×5' },
    { sx: X0 + CW + nw - 20, sy: Y0 + D * CH + 80 + nh - 15, w: 40, h: 30, k: 5, dx: 620, dy: Y0 + 190, t: '이 판 손목 ×5' },
  ];
  await pg.evaluate((z) => window.__zoom(z), ZS);
  for (const z of ZS) labels.push({ t: z.t, x: z.dx + z.w * z.k / 2, y: z.dy - 8, size: 12, color: '#9fb0c4' });
  labels.push({ t: `묶인 손 목표(굽기가 푼 값): 앞 ${meta.captiveGrip[0]}m · 반간격 ${meta.captiveGrip[1]}m · 높이 ${meta.captiveGrip[2]}m · 잔차 ${meta.captiveHitMm}mm`,
                x: 490, y: Y0 + 8 * CH + 34, size: 12, color: '#9fb0c4' });
  await pg.evaluate((l) => window.__label(l), labels);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const buf = await pg.locator('#cv').screenshot();
  fs.writeFileSync(OUT, buf);
  console.log('[대조표] ' + OUT + ' · ' + buf.length + ' bytes');
}

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

  if (MOCAP) { await mocapSheet(pg); await br.close(); srv.close(); return; }
  if (CAPTIVE) { await captiveSheet(pg, pal); await br.close(); srv.close(); return; }

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
