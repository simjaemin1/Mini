#!/usr/bin/env node
// === scripts/t565-map-pic.js — 산그림/T565_지도.png : 같은 산맥(한재)을 세 배율로 · 전(main)/후(가지) (T565 ④) ============
//
// 한재 = 닛폰 고개(T408 접합 · 닛폰 로컬 (−216, 60000) · 반경 1850px)가 새벌 동쪽 끝(새벌 로컬 x ≈ 69,800)의 산맥 띠를 뚫은 자리.
//   전(main `80-bigmap.js`): 0.02 · 0.125 는 벡터 띠(고개가 없다) · 1.0 에서야 셀(클라 거울)이 보여 **빈 셀**이 나온다.
//   후(가지): 세 배율 모두 존이 구운 셀 답(0.02 는 4×4 표본 그림 · 0.125 · 1.0 은 1셀 = 1픽셀 조각).
// 두 판 모두 **같은 헤드리스 틀**(존 메타 · 지형 json · 캔버스 480×320)에서 그 파일을 그대로 돌린다 — 후 판은 실제 존 둘(새벌·닛폰)에게 그림을 묻는다.
//
// 실행: node scripts/t565-map-pic.js [--out=산그림/T565_지도.png] [--rev=origin/main] [--vec=/tmp/t565/t565-vector.json] [--baked=/tmp/t565/t565-baked.json]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execSync } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const zc = require(path.join(ROOT, 'server', 'zone-config'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((s) => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', '산그림/T565_지도.png'));
const REV = arg('rev', 'origin/main');
const HPORT = zc.ZONES.hanbando.port, NPORT = zc.ZONES.nippon.port;
const DBS = [`/tmp/tmp-h-${process.pid}.db`, `/tmp/tmp-n-${process.pid}.db`];
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of DBS) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
function boot(id, port, db) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PORT: String(port), ZONE_ID: id, DB_PATH: db, CENTRAL_HOST: 'localhost', CENTRAL_PORT: '3999', CENTRAL_URL: 'http://localhost:3999',
      ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0' }) });
  procs.push(p); return p;
}

async function makePage(browser, src, label) {
  const page = await browser.newPage({ viewport: { width: 600, height: 420 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(label + ' ' + String(e.message).slice(0, 160)));
  await page.setContent('<!doctype html><html><body style="margin:0;background:#000"><div id="bigMapPanel"><canvas id="bigMapCanvas" style="width:480px;height:320px;display:block"></canvas></div></body></html>');
  await page.evaluate((meta) => { window.__getZonesMeta = () => meta; window.isTypingTarget = () => false; }, zc.publicZoneMap('localhost'));
  await page.addScriptTag({ path: path.join(ROOT, 'public', 'terrain-gen.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'public', 'terrain.js') });
  await page.evaluate((all) => { for (const [z, d] of Object.entries(all)) window.Terrain.setHardcoded(z, d); }, JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')));
  await page.addScriptTag({ content: src });
  await page.evaluate(() => window.bigMap.show());
  await sleep(200);
  return { page, errs };
}
async function shot(pg, setView, z, w, waitNew) {
  await pg.page.evaluate(setView, { z, x: w.x, y: w.y });
  if (waitNew) {
    for (let i = 0; i < 80; i++) {
      const d = await pg.page.evaluate(() => window.__bigMapDbg());
      const zs = d.zones || {};
      const zOk = zs.hanbando && zs.hanbando.st === 'ok' && zs.nippon && zs.nippon.st === 'ok';
      if (zOk && (z < 0.125 || (d.tiles > 0 && d.tilesOk === d.tiles))) break;
      await sleep(200);
    }
  }
  await sleep(500);
  const el = await pg.page.$('#bigMapCanvas');
  return (await el.screenshot()).toString('base64');
}

(async () => {
  for (const p of [HPORT, NPORT]) if (!(await portFree(p))) { console.error(`포트 ${p} 가 이미 쥐여 있다 — 남의 존을 그리지 않는다`); process.exit(1); }
  const hp = boot('hanbando', HPORT, DBS[0]), np = boot('nippon', NPORT, DBS[1]);
  const ups = await Promise.all([FB.waitUp(hp, /zone server up on/, { name: 'hanbando' }), FB.waitUp(np, /zone server up on/, { name: 'nippon' })]);
  if (!ups.every((u) => u.ok)) { console.error(ups.map((u) => u.why).join(' · ')); process.exit(1); }
  for (const port of [HPORT, NPORT]) for (let i = 0; i < 120; i++) { const r = await fetch(`http://localhost:${port}/bigmap.png`).catch(() => null); if (r && r.status === 200) break; await sleep(1000); }

  const H = zc.ZONES.hanbando;
  const HJ = { x: H.worldOffsetX + 69808, y: H.worldOffsetY + 60016 };   // 한재 한가운데 셀
  const oldSrc = execSync(`git -C "${ROOT}" show ${REV}:public/client/80-bigmap.js`, { encoding: 'utf8', maxBuffer: 1 << 26 })
    .replace('window.bigMap = { show, hide, toggle };', 'window.bigMap = { show, hide, toggle };\n  window.__t565Set = (z, wx, wy) => { zoom = z; panX = Math.round(canvas.width / 2 - wx * z); panY = Math.round(canvas.height / 2 - wy * z); needsRedraw = true; vpCache = null; };');
  const newSrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '80-bigmap.js'), 'utf8');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const O = await makePage(browser, oldSrc, '전'), N = await makePage(browser, newSrc, '후');
  const ZS = [0.02, 0.125, 1.0];
  const HJN = { x: HJ.x, y: HJ.y - 1600 };   // 가운데 칸은 고개의 북쪽 가장자리(띠와 고개가 한 화면에 — 셀 4px 이면 화면이 ±40셀뿐이다)
  const CT = [HJ, HJN, HJ];
  const imgs = { old: [], new: [] };
  for (let i = 0; i < ZS.length; i++) {
    imgs.old.push(await shot(O, (a) => window.__t565Set(a.z, a.x, a.y), ZS[i], CT[i], false));
    imgs.new.push(await shot(N, (a) => window.__bigMapView(a.z, a.x, a.y), ZS[i], CT[i], true));
  }
  const errs = O.errs.concat(N.errs);
  // 수 — 자 두 판(있으면)
  let vec = null, baked = null;
  try { vec = JSON.parse(fs.readFileSync(arg('vec', '/tmp/t565/t565-vector.json'), 'utf8')); } catch (e) {}
  try { baked = JSON.parse(fs.readFileSync(arg('baked', '/tmp/t565/t565-baked.json'), 'utf8')); } catch (e) {}
  const pc = (a, b) => (b ? (100 * a / b).toFixed(2) + '%' : '—');
  const line1 = vec ? `전(벡터 · ${vec.zones.length}존 · 지도 해상도 표본): 지도 바위인데 셀은 뭍 ${pc(vec.total.rock.mapKland, vec.total.rock.mapK)} · 셀 바위인데 지도 아님 ${pc(vec.total.rock.truKnot, vec.total.rock.truK)} · 셀 물인데 지도 아님 ${pc(vec.total.water.truKnot, vec.total.water.truK)}(해안 띠) · 다리 ${pc(vec.total.bridge.truKnot, vec.total.bridge.truK)} 없음 · 광맥 ${pc(vec.total.ore.truKnot, vec.total.ore.truK)} 어긋남` : '';
  const line2 = baked ? `후(존이 구운 PNG · ${baked.zones.length}존): 표본 셀 ${baked.total.n.toLocaleString()}픽셀 불일치 ${baked.total.mismatch} · 줌인 조각 ${baked.totalTile.n.toLocaleString()}셀 불일치 ${baked.totalTile.mismatch}` : '';
  const cell = (b64, cap) => `<figure><div class="w"><img src="data:image/png;base64,${b64}"><i></i></div><figcaption>${cap}</figcaption></figure>`;
  const zl = (z) => (z < 0.125 ? `배율 ${z} · 셀 ${(32 * z).toFixed(2)}px` : `배율 ${z} · 셀 ${32 * z}px`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:18px 20px;background:#0b0f15;color:#dde3ea;font:14px/1.45 "Noto Sans CJK KR","Noto Sans KR",sans-serif;width:1520px}
    h1{font-size:19px;margin:0 0 4px} p{margin:2px 0;color:#9fb0c2;font-size:13px}
    .row{display:flex;gap:12px;align-items:flex-start;margin-top:12px} .lab{width:64px;font-weight:700;padding-top:140px;font-size:16px}
    figure{margin:0} figcaption{font-size:12px;color:#9fb0c2;margin-top:3px}
    .w{position:relative;width:480px;height:320px;border:1px solid #2c3440} .w img{display:block;width:480px;height:320px}
    .w i{position:absolute;left:232px;top:152px;width:14px;height:14px;border:2px solid #ff4fd8;border-radius:50%}
    .nums{margin-top:12px;font-size:13px;color:#cfd8e3} .nums b{color:#ffd23f}
  </style></head><body>
    <h1>T565 — 같은 산맥(한재 · 새벌 동쪽 끝)을 세 배율로 · 전 main / 후 가지</h1>
    <p>한재 = 닛폰 고개(T408 접합 · 반경 1,850px ≈ 58셀)가 새벌 동쪽 끝 산맥 띠를 뚫은 자리. 자홍 동그라미 = 화면 가운데(첫·셋째 칸 = 한재 한가운데 셀 새벌 로컬 69,808 · 60,016 · 가운데 칸 = 그 북쪽 1,600px). 캔버스 480×320 · 같은 헤드리스 틀.</p>
    <div class="row"><div class="lab">전</div>${ZS.map((z, i) => cell(imgs.old[i], `${zl(z)}${i === 1 ? ' · 고개 북쪽 가장자리' : ''} — ${z < 1 ? '벡터 띠(새벌 쪽 고개 없음 — 막혔다)' : '셀(클라 거울) — 뭍: <b>"산맥 한가운데 빈 셀"</b>'}`)).join('')}</div>
    <div class="row"><div class="lab">후</div>${ZS.map((z, i) => cell(imgs.new[i], `${zl(z)}${i === 1 ? ' · 고개 북쪽 가장자리' : ''} — ${z < 0.125 ? '존이 구운 그림(4×4셀 표본) — 고개가 뚫렸다' : '1셀 = 1픽셀 조각(같은 함수) — 같은 답'}`)).join('')}</div>
    <div class="nums">${line1 ? '<div>' + line1 + '</div>' : ''}${line2 ? '<div><b>' + line2 + '</b></div>' : ''}</div>
  </body></html>`;
  const cp = await browser.newPage({ viewport: { width: 1560, height: 900 } });
  await cp.setContent(html);
  await sleep(300);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await cp.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  console.log(`그림 → ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB) · 페이지 오류 ${errs.length}${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('예외:', e && e.stack || e); process.exit(1); });
