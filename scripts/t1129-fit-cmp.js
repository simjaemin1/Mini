#!/usr/bin/env node
// === scripts/t1129-fit-cmp.js — [T1129 2026-11-04] 갖옷을 몸에 붙게 · 보폭 — 전/후 그림 넷(앞 · 옆 · 달리기 한 주기 · 머리) ===
//
// ★무엇을 그리나(판정 0 · 그림과 표만): 사람 3D(`client3d/char3d.js` · `assets/char3d/`)를 T1129 전(main 뿌리)과 뒤(이 저장소)에서 **각 뿌리의 클라 그대로** 떠서
//   나란히 놓는다 — 재는 길(뿌리마다 central 정적 판 · 빈 쪽에 three.js + 시트 메타 + 그 뿌리의 char3d.js · `__char3d.snap`)은 `t654-mesh-cmp.js` 의 함수 그대로(사본 0).
//   ① 앞(1) · ② 옆(3): 몸 둘(남 · 여) × 옷 둘(삼베 · 갖옷) · 쉼 자세 — ×4 전 · 후 · 차 + 게임 크기(1×) 전 · 후 · (시트 2D 갖옷 8방향 전 · 후 — 한 몸)
//   ③ 달리기 한 주기: 몸 둘 × 옷 둘 · 옆(3) · 판 0~7 — ×4 전 · 후 · 보폭 표(`t723-foot-slide.py` (나) 디딘 발 미끄러짐 — 전 · 후 json)
//   ④ 머리: 몸 둘 · 삼베 · 앞(1) · 옆(3) · 쉼 — ×8(머리 둘레만 잘라) 전 · 후 — 묶은 머리 끝이 정면에서 보이는가(카드 14-a 머리 · 자산 무변)
// 실행: node scripts/t1129-fit-cmp.js --before=<뿌리> --out=<그림 폴더> [--slide-before=<dir>] [--slide-after=<dir>]
//   뿌리 = `git archive <전 커밋> public server sim package.json | tar -x -C <뿌리>` + `node_modules` 이음(T654 · T708 과 같은 꼴) ·
//   slide dir = `t723-foot-slide.py --out=` json 들(`sheet.json` · `glb_M.json` · `glb_F.json`)이 있는 폴더.
'use strict';
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const CMP = require('./t654-mesh-cmp');
const ROOT = path.join(__dirname, '..');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const BEFORE = arg('before') && path.resolve(arg('before'));
const OUT = arg('out') && path.resolve(arg('out'));
if (!BEFORE || !OUT || !fs.existsSync(path.join(BEFORE, 'public', 'client3d', 'char3d.js'))) {
  console.error('쓰는 법: node scripts/t1129-fit-cmp.js --before=<뿌리> --out=<그림 폴더> [--slide-before=<dir>] [--slide-after=<dir>]');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const C3 = (root) => path.join(root, 'public', 'assets', 'char3d');
const META = { before: JSON.parse(fs.readFileSync(path.join(C3(BEFORE), 'char3d_meta.json'), 'utf8')),
               after: JSON.parse(fs.readFileSync(path.join(C3(ROOT), 'char3d_meta.json'), 'utf8')) };
const SEX = ['M', 'F'], KIND = ['hemp', 'fur'], SN = { M: '남', F: '여' }, KN = { hemp: '삼베', fur: '갖옷' }, DN = { 1: '앞(1)', 3: '옆(3)' };
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const slide = (dir) => {
  if (!dir) return null;
  const rd = (f) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  return { sheet: rd('sheet.json'), M: rd('glb_M.json'), F: rd('glb_F.json') };
};
const SL = { before: slide(arg('slide-before')), after: slide(arg('slide-after')) };

// 시트(2D · 한 몸) 갖옷 — 몸 층 위에 옷 층(쉼 0판 · 8방향) — 그 뿌리의 시트 그대로
function sheetStrip(root) {
  const D = path.join(root, 'public', 'assets', 'char'), m = JSON.parse(fs.readFileSync(path.join(D, 'char_meta.json'), 'utf8'));
  const rd = (f) => PNG.sync.read(fs.readFileSync(path.join(D, f)));
  const body = rd('body_idle.png'), fur = rd('clothes_fur_idle.png'), fw = m.frameW, fh = m.frameH;
  const out = [];
  for (let d = 0; d < 8; d++) {
    const buf = Buffer.alloc(fw * fh * 4);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const si = ((d * fh + y) * body.width + x) * 4, o = (y * fw + x) * 4;
      const ab = body.data[si + 3] / 255, af = fur.data[si + 3] / 255, a = af + ab * (1 - af);
      for (let c = 0; c < 3; c++) buf[o + c] = a ? Math.round((fur.data[si + c] * af + body.data[si + c] * ab * (1 - af)) / a) : 0;
      buf[o + 3] = Math.round(a * 255);
    }
    out.push({ w: fw, h: fh, buf });
  }
  return out;
}

(async () => {
  const { chromium } = require('playwright');
  const jobs4 = [], jobs1 = [], jobs8 = [];
  for (const sex of SEX) for (const kind of KIND) {
    for (const d of [1, 3]) { jobs4.push({ id: `${sex}|${kind}|${d}|rest|0`, sex, kind, d, clip: null, f: 0 }); jobs1.push({ id: `${sex}|${kind}|${d}|rest|0`, sex, kind, d, clip: null, f: 0 }); }
    for (let f = 0; f < META.after.clips.run.frames; f++) jobs4.push({ id: `${sex}|${kind}|3|run|${f}`, sex, kind, d: 3, clip: 'run', f });
  }
  for (const sex of SEX) for (const d of [1, 3]) jobs8.push({ id: `${sex}|hemp|${d}|rest|0`, sex, kind: 'hemp', d, clip: null, f: 0 });
  const R = { before: BEFORE, after: ROOT }, shots = {};
  const browser = await chromium.launch({ headless: true });
  let port = require('./lib-port').ports(3, 3271);   // [T1288] 뿌리 둘이 ++port 로 다음 두 자리를 쓴다
  for (const [nm, root] of Object.entries(R)) {
    await CMP.bootCentral(root, ++port);
    const p1 = await CMP.openRoot(browser, port, root, 1, null), s1 = await CMP.snapAll(p1, jobs1);
    const p4 = await CMP.openRoot(browser, port, root, 4, null), s4 = await CMP.snapAll(p4, jobs4);
    const p8 = await CMP.openRoot(browser, port, root, 8, null), s8 = await CMP.snapAll(p8, jobs8);
    shots[nm] = { s1, s4, s8, sheet: sheetStrip(root) };
    console.log(`[t1129] ${nm}: 1× ${Object.keys(s1).length} · ×4 ${Object.keys(s4).length} · ×8 ${Object.keys(s8).length}판`);
    await p1.close(); await p4.close(); await p8.close();
  }
  const box = (ts, pad) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const t of ts) for (let i = 3; i < t.buf.length; i += 4) if (t.buf[i]) {
      const q = (i - 3) / 4, x = q % t.w, y = (q / t.w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(ts[0].w - 1, x1 + pad), y1: Math.min(ts[0].h - 1, y1 + pad) };
  };
  const crop = (t, buf, B) => { const w = B.x1 - B.x0 + 1, h = B.y1 - B.y0 + 1, o = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) buf.copy(o, y * w * 4, ((y + B.y0) * t.w + B.x0) * 4, ((y + B.y0) * t.w + B.x0 + w) * 4); return CMP.png(w, h, o); };
  const upscale = (t, k) => { const w = t.w * k, h = t.h * k, o = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.buf.copy(o, (y * w + x) * 4, (((y / k) | 0) * t.w + ((x / k) | 0)) * 4, (((y / k) | 0) * t.w + ((x / k) | 0)) * 4 + 4);
    return { w, h, buf: o }; };
  const xor = (a, b) => { const r = CMP.cmp(a.buf, b.buf); return r.U ? +(100 * r.X / r.U).toFixed(2) : 0; };
  const shape = (t) => { let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 3, q = 0; i < t.buf.length; i += 4, q++) if (t.buf[i] > 127) { n++; const x = q % t.w, y = (q / t.w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return n ? `${n}px · ${x1 - x0 + 1}×${y1 - y0 + 1}` : '0'; };
  const coatLine = (M) => SEX.map((sex) => { const c = M.bodies[sex].coat || {};
    return `${SN[sex]}: 단 ${c.cut && c.cut.hem === 'knee' ? '무릎' : '시트 단(무릎 위)'} · 소매 ${c.cut && c.cut.sleeve === 'long' ? '긴팔' : '?'} · ${c.fit === 'body' ? '몸에 붙음(본 옷 링) · 털 테(깃 · 소매 끝 · 단)' : '가슴 아래 볼록 껍질 · 둘레마다 털'} · 털 두께 ${((c.pad || 0) * 100).toFixed(1)}cm · 옷 점 옮김 최대 ${((c.offsetMaxM || 0) * 100).toFixed(1)}cm · 옮김 0 ${c.offsetZero}점`; }).join(' / ');
  const hairLine = (M) => SEX.map((sex) => `${SN[sex]} ${M.bodies[sex].parts.hair.split('/')[1]} ${M.bodies[sex].trisParts.hair}삼각`).join(' · ');
  const CSS = `body{font:13px/1.45 sans-serif;margin:14px;background:#fff;color:#222}h1{font-size:17px;margin:0 0 6px}h2{font-size:14px;margin:14px 0 5px}
    .row{display:flex;align-items:flex-end;gap:4px;margin:3px 0}.row img{border:1px solid #ddd;image-rendering:pixelated}.lab{width:150px;font-size:12px;flex:none;align-self:center}
    .cap{font-size:11px;color:#555}.col{display:flex;flex-direction:column;align-items:center;margin-right:10px}.t{font-size:11px;color:#555}
    table{border-collapse:collapse;margin:3px 0}td,th{border:1px solid #bbb;padding:2px 6px;text-align:right}td:first-child{text-align:left}`;
  const shoot = async (html, file, width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}`);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    await page.close();
    console.log(`[t1129] 그림 ${path.join(OUT, file)}`);
  };
  const head = `<div>전 = main(T1129 앞) · 후 = 이 가지 — 그리는 길 = 각 뿌리의 <code>client3d/char3d.js</code> 그대로(<code>__char3d.snap</code> · 게임 투영 · 한낮 빛) · 차: 회색 = 같음 · 노랑→빨강 = 색만 다름 · 자주 = 실루엣 갈림</div>
    <div>갖옷 전: ${esc(coatLine(META.before))}</div><div>갖옷 후: ${esc(coatLine(META.after))}</div>`;

  // ①② 앞 · 옆
  for (const d of [1, 3]) {
    const ids = [];
    for (const sex of SEX) for (const kind of KIND) ids.push(`${sex}|${kind}|${d}|rest|0`);
    const B4 = box(['before', 'after'].flatMap((nm) => ids.map((id) => shots[nm].s4[id])), 2);
    const B1 = box(['before', 'after'].flatMap((nm) => ids.map((id) => shots[nm].s1[id])), 1);
    const rows = ids.map((id) => { const [sex, kind] = id.split('|'), a = shots.before.s4[id], b = shots.after.s4[id], a1 = shots.before.s1[id], b1 = shots.after.s1[id];
      return `<div class="row"><div class="lab">${SN[sex]} · ${KN[kind]}<div class="cap">실루엣 차 ${xor(a, b)}% (×4)<br>게임 크기 ${shape(a1)} → ${shape(b1)}</div></div>
        <div class="col"><img src="${crop(a, a.buf, B4)}"><span class="t">전</span></div><div class="col"><img src="${crop(b, b.buf, B4)}"><span class="t">후</span></div>
        <div class="col"><img src="${crop(a, CMP.diffImg(a.buf, b.buf), B4)}"><span class="t">차</span></div>
        <div class="col"><img src="${crop(a1, a1.buf, B1)}" style="width:${(B1.x1 - B1.x0 + 1) * 2}px"><span class="t">전 1×(×2 확대)</span></div>
        <div class="col"><img src="${crop(b1, b1.buf, B1)}" style="width:${(B1.x1 - B1.x0 + 1) * 2}px"><span class="t">후 1×(×2 확대)</span></div></div>`; }).join('');
    const sh = ['before', 'after'].map((nm) => { const ts = shots[nm].sheet.map((t) => upscale(t, 3)), B = box(ts, 2);
      return `<div class="row"><div class="lab">시트(2D · 한 몸) 갖옷 · ${nm === 'before' ? '전' : '후'}<div class="cap">쉼 0판 · 방향 0~7 · ×3</div></div>${ts.map((t) => `<img src="${crop(t, t.buf, B)}">`).join('')}</div>`; }).join('');
    await shoot(`<h1>T1129 — 갖옷을 몸에 붙게 · ${DN[d]} · 쉼(묶기 자세) · 남 · 여 × 삼베 · 갖옷 — 전 ↔ 후</h1>${head}<h2>3D ×4 · 게임 크기</h2>${rows}<h2>시트(2D) 갖옷 — 같은 판 · 8방향</h2>${sh}`,
      `T1129_${d === 1 ? '앞' : '옆'}.png`, 1400);
  }
  // ③ 달리기 한 주기
  {
    const F = META.after.clips.run.frames, ids = [];
    for (const sex of SEX) for (const kind of KIND) for (let f = 0; f < F; f++) ids.push(`${sex}|${kind}|3|run|${f}`);
    const B4 = box(['before', 'after'].flatMap((nm) => ids.map((id) => shots[nm].s4[id])), 2);
    const rows = [];
    for (const sex of SEX) for (const kind of KIND) for (const nm of ['before', 'after']) rows.push(`<div class="row"><div class="lab">${SN[sex]} · ${KN[kind]} · ${nm === 'before' ? '전' : '후'}</div>${Array.from({ length: F }, (_, f) => { const t = shots[nm].s4[`${sex}|${kind}|3|run|${f}`]; return `<img src="${crop(t, t.buf, B4)}">`; }).join('')}</div>`);
    const st = (nm, body, clip) => { const s = SL[nm] && SL[nm][body]; const c = s && s.clips[clip]; return c ? `${(100 * c.stance.slipCycle).toFixed(2)} cm · L ${c.stance.L.toFixed(3)} m` : '—'; };
    const POSE = { before: JSON.parse(fs.readFileSync(path.join(BEFORE, 'assets-src', 'mocap', 'poses.json'), 'utf8')), after: JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-src', 'mocap', 'poses.json'), 'utf8')) };
    const stride = (nm, body, clip) => { const M = META[nm];
      const g = body === 'sheet' ? ((POSE[nm].source[clip] || {}).gait || {}) : body === 'M' ? (M.clips[clip].gait || {}) : (((M.bodies.F || {}).gait || {})[clip] || {});
      return g.stride != null ? `×${g.stride}` : '×1'; };
    const tbl = `<table><tr><th>몸 · 클립</th><th>전: 보폭 배율 · (나) 디딘 발 미끄러짐 /주기 · 디딘 발 L</th><th>후</th><th>v·T(게임 속도 × 주기)</th></tr>${['M', 'F', 'sheet'].flatMap((b) => ['walk', 'run'].map((clip) => {
      const c = (SL.after && SL.after[b] && SL.after[b].clips[clip]) || (SL.before && SL.before[b] && SL.before[b].clips[clip]);
      return `<tr><td>${b === 'sheet' ? '시트(2D)' : SN[b] + '(3D)'} · ${clip === 'walk' ? '걷기' : '달리기'}</td><td>${stride('before', b, clip)} · ${st('before', b, clip)}</td><td>${stride('after', b, clip)} · ${st('after', b, clip)}</td><td>${c ? (c.v * c.T).toFixed(3) + ' m' : '—'}</td></tr>`; })).join('')}</table>`;
    await shoot(`<h1>T1129 — 달리기 한 주기(옆 3 · 판 0~${F - 1} · ×4) — 보폭 × 배율(디딘 발 미끄러짐 = 0) · 윗몸 = CMU 09_01 모캡 그대로 — 전 ↔ 후</h1>${head}${tbl}${rows.join('')}`, 'T1129_달리기.png', 1500);
  }
  // ④ 머리 — ×8 · 머리 둘레(정수리 ~ 어깨 아래)만
  {
    const rows = [];
    for (const sex of SEX) {
      const ts = ['before', 'after'].flatMap((nm) => [1, 3].map((d) => shots[nm].s8[`${sex}|hemp|${d}|rest|0`]));
      const B = box(ts, 2), hh = Math.round((B.y1 - B.y0) * 0.42);
      const BH = { x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y0 + hh };
      rows.push(`<div class="row"><div class="lab">${SN[sex]} · 삼베 · ${esc(META.after.bodies[sex].parts.hair.split('/')[1])}</div>${['before', 'after'].map((nm) => [1, 3].map((d) => { const t = shots[nm].s8[`${sex}|hemp|${d}|rest|0`];
        return `<div class="col"><img src="${crop(t, t.buf, BH)}"><span class="t">${nm === 'before' ? '전' : '후'} · ${DN[d]}</span></div>`; }).join('')).join('')}</div>`);
    }
    await shoot(`<h1>T1129 — 머리(묶은 머리) · 정면 · 옆 · ×8 · 머리 자산 무변 — 전 ↔ 후</h1>
      <div>머리 삼각형(예산 6,000 − 살·눈·눈썹 − 옷 · 내보내기가 머리만 줄인다): 전 ${esc(hairLine(META.before))} → 후 ${esc(hairLine(META.after))}</div>${rows.join('')}`, 'T1129_머리.png', 1300);
  }
  await browser.close();
  CMP.cleanup();
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); CMP.cleanup(); process.exit(1); });
