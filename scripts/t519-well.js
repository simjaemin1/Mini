#!/usr/bin/env node
// === scripts/t519-well.js — 우물 단계 셋 한 장(재민 눈) [T519 2026-09-29] ==================
//
// ★카드 ④ "헤드리스 스크린샷 셋 `~/Mini/산그림/T519_우물.png` · 재민 눈"
//   하네스가 아니다(판정 0 · 이름이 `test-`·`e2e-` 가 아니라 러너·린트가 안 줍는다) — **그림을 만드는 자**다.
//   판정은 `scripts/test-well-art.js` 가 한다(같은 PNG · 같은 클라 갈래).
//
// ★세계를 바꾸지 않는다. 세우는 것은 테스트 전용 문과 진단 훅뿐이다(`t515-clothes.js` 와 같은 문법):
//   `__e2e_clock`(여름 한낮) · 하늘 위상(래퍼) · `__rainForce({precip:0})`·`windOff` · `__e2e_give`(곡괭이 · 자갈 · 사유지 값) ·
//   `teleport_debug`(자리) · 제품 메시지 셋(`claim` 임시 · `well_start` · `well_advance` — 클라에 우물 배치 모드가 아직 없다 · 회부).
//   손잡이 = `T509_WELL=1`(우물 켬 — 끔이면 그림이 안 선다 · 카드 전제).
//   ⚠②(자갈 벽 쌓는 중)는 **서버에 없는 단계**다(`WELL_STAGES` 둘 — 벽은 한 번에 선다). 그래서 그 한 장만
//     **이 페이지의 터 사본**에 stage 2 를 얹어 클라가 `well_s2` 를 고르게 한 그림이다(세계 무변 · 서버 무접촉 · 보고 회부).
//   그리기만 둘 걷는다(이 페이지 · 세계 무변): 이름표(우물 라벨과 겹친다) · 사유지 덮개(주황 점선 + 칸마다 임자 이름 넷 —
//     1판 실측: 우물 위에 글자 넷이 얹혀 그림이 안 읽혔다). 사유지는 서버에 그대로 있다(이 페이지 사본만 비운다).
//
// 한 장 = 2줄 × 3칸: 윗줄 ×3 확대(최근접 · 화소 그대로) · 아랫줄 같은 자리 1:1(게임에서 보는 크기 · 마을 둘레).
// 실행: node scripts/t519-well.js <out.png>
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const WS = require(path.join(ROOT, 'server', 'well-stages.js'));
const OUT = process.argv[2] || '/tmp/T519_우물.png';
const TMP = path.join(path.dirname(OUT), 't519-well-shots');
fs.mkdirSync(TMP, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t519-well-${process.pid}.db`, CDB = `/tmp/t519-well-c-${process.pid}.db`;
const PHF = `/tmp/t519-well-phase-${process.pid}.txt`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
const WRAP = `/tmp/zone-wrap-t519-${process.pid}.js`;
fs.writeFileSync(PHF, String(Wx.PH.noon));
fs.writeFileSync(WRAP, `const path=require('path');const fs=require('fs');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d;
const setPh=(p)=>{ cfg.WORLD.worldEpoch=Date.now()-Math.round(d*p); };
setPh(parseFloat(fs.readFileSync(${JSON.stringify(PHF)},'utf8'))||0.35);
require(path.join(ROOT,'server','zone.js'));`);
const DAY = FX.anchorDays().summer;

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T509_WELL: '1' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  console.log('central', cu.ok, '· zone', zu.ok);
  if (!cu.ok || !zu.ok) process.exit(2);
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  console.log('마을', V && `${V.name}(${V.cx},${V.cy})`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const VW = 1400, VH = 900;
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  if (!(await FX.waitInWorld(page)).ok) { console.log('입장 실패'); process.exit(3); }
  const fx = await FX.setClock(page, { day: DAY, night: false });
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__rainForce({ precip: 0 }));
  await page.evaluate(() => { try { drawNameTag = function () {}; } catch (e) { } });
  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const tp = async (x, y) => { await send({ type: 'teleport_debug', x, y }); await sleep(450); };
  const claimsN = () => page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'temporary').length);
  const claimIds = () => page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'temporary').map((c) => c.id));
  const wellsOf = (t) => page.evaluate((tt) => (window.__getAllBuildings ? window.__getAllBuildings() : []).filter((b) => b.type === tt), t);
  const notices = () => page.evaluate(() => (window.__notices || []).slice(-3));
  // 재료 — 착공 곡괭이 · 벽 자갈(`WELL_PEBBLES` · 정본) · 임시 사유지 넷 값(나무·돌 넉넉히)
  await send({ type: '__e2e_give', items: { pebble: WS.WELL_PEBBLES, wood: 400, stone: 60 }, tools: ['pickaxe'] });   // 임시 사유지 한 칸 = 나무 1(회수 없음)
  await sleep(1200);
  await tp(V.cx * 32 + 16, V.cy * 32 + 16 + 96);            // 마을로 먼저 간다 — 둘레 건물이 이 페이지에 와야 후보를 거를 수 있다(2판 실측)
  await sleep(6000);
  // 자리 — 마을 가까이(5~14칸)에서 2×2 가 서는 첫 자리. 사유지·물·바위·건물 판정은 **서버가** 한다(여기서 안 고른다).
  //   ⓘ 1판 실측: 마을 둘레 5~6칸은 전부 마당 타일(`vtile`) 자리라 "다른 건축물" 로 거절됐다 ⇒ 이 페이지가 **받은** 건물·사유지
  //     칸을 피해(2×2 + 둘레 한 칸) 마을에서 가까운 순으로 후보를 뽑는다(서버 판정은 그대로 — 물·바위는 서버가 거른다).
  const cand = await page.evaluate(([vx, vy]) => {
    const busy = new Set();
    for (const c of conns.values()) {
      for (const b of c.buildings.values()) busy.add(`${Math.round((b.x - (b.type === 'wall' ? 0 : 16)) / 32)},${Math.round((b.y - (b.type === 'wall' ? 0 : 16)) / 32)}`);
      for (const cl of (c.claims ? c.claims.values() : [])) for (let x = cl.x; x < cl.x + cl.w; x += 32) for (let y = cl.y; y < cl.y + cl.h; y += 32) busy.add(`${Math.floor(x / 32)},${Math.floor(y / 32)}`);
    }
    const out = [];
    for (let dx = -24; dx <= 24; dx++) for (let dy = -24; dy <= 24; dy++) {
      const cx = vx + dx, cy = vy + dy; let free = true;
      for (let x = cx - 1; x <= cx + 2 && free; x++) for (let y = cy - 1; y <= cy + 2 && free; y++) if (busy.has(`${x},${y}`)) free = false;
      if (free) out.push([cx, cy, dx * dx + dy * dy]);
    }
    return out.sort((a, b) => a[2] - b[2]).slice(0, 40).map((a) => [a[0], a[1]]);
  }, [V.cx, V.cy]);
  console.log('후보', cand.length, JSON.stringify(cand.slice(0, 5)));
  let site = null, at = null;
  for (const [cx, cy] of cand) {
    for (const id of await claimIds()) { await send({ type: 'unclaim', claimId: id }); await sleep(250); }
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { await tp((cx + ox) * 32 + 16, (cy + oy) * 32 + 16); await send({ type: 'claim', kind: 'temporary' }); await sleep(450); }
    if ((await claimsN()) !== 4) { console.log('사유지 거절', cx, cy, JSON.stringify(await notices())); continue; }
    await tp((cx + 3) * 32 + 16, (cy + 1) * 32 + 16);                       // 동쪽 두 칸 옆에 선다(사람 키가 자 노릇)
    await send({ type: 'well_start', atX: cx * 32 + 16, atY: cy * 32 + 16 });
    for (let k = 0; k < 20 && !site; k++) { const w = await wellsOf('well_site'); if (w.length) site = w[0]; else await sleep(250); }
    if (site) { at = [cx, cy]; break; }
    console.log('자리 거절', cx, cy, JSON.stringify(await notices()));
  }
  if (!site) { console.log('우물 터가 안 섰다'); process.exit(4); }
  console.log('우물 터', JSON.stringify(site), '셀', at.join(','));
  const shots = [];
  const shoot = async (key, wantType, wantStage) => {
    await page.evaluate(() => { for (const c of conns.values()) if (c.claims) c.claims.clear(); });   // 사유지 덮개(그리기만 · 머리말)
    for (let k = 0; k < 60; k++) {                          // 그 종류·단계의 그림이 실제로 그려질 때까지(판 대신 세계를 기다린다)
      const ok = await page.evaluate(([t, s]) => { const b = (window.__getAllBuildings() || []).find((x) => x.type === t); return !!b && (s == null || b.stage === s); }, [wantType, wantStage]);
      if (ok) break; await sleep(200);
    }
    await sleep(1500);                                      // 카메라 트윈이 멎을 때까지
    const b = (await wellsOf(wantType))[0];
    const scr = await page.evaluate(([x, y]) => window.__w2s(x, y), [b.wx, b.wy]);
    const p = path.join(TMP, key + '.png');
    await page.screenshot({ path: p });
    shots.push({ key, p, scr, b });
    console.log(JSON.stringify({ shot: key, type: b.type, stage: b.stage, screen: [Math.round(scr.px), Math.round(scr.py)] }));
  };
  await shoot('s1', 'well_site', 1);
  // ② 쌓는 중 — **이 페이지의 터 사본**에만 stage 2(서버엔 없는 단계 · 머리말 ⚠)
  await page.evaluate((id) => { for (const c of conns.values()) { const b = c.buildings.get(id); if (b && b.data) b.data.stage = 2; } }, site.id);
  await shoot('s2', 'well_site', 2);
  await page.evaluate((id) => { for (const c of conns.values()) { const b = c.buildings.get(id); if (b && b.data) b.data.stage = 1; } }, site.id);
  await send({ type: 'well_advance', buildingId: site.id });
  await shoot('done', 'well', null);
  console.log('알림', JSON.stringify(await notices()));
  // ③ 곁 — 우물 칸을 **살피면** 서버가 무엇이라 답하나(물 칸이면 `water` 가 실려 물 메뉴가 선다 · `46-h-verbs verbOpenWaterMenu`)
  await page.evaluate(() => { try { const o = verbsOnLook; verbsOnLook = function (m) { window.__lastLook = m; return o(m); }; } catch (e) { } });
  for (const [ox, oy, give] of [[0, 0, 0], [0, 0, 1]]) {
    if (give) { await send({ type: '__e2e_give', items: { water_bottle: 1 } }); await sleep(800); }
    await page.evaluate(() => { window.__lastLook = null; });
    await send({ type: 'look', x: (at[0] + ox) * 32 + 16, y: (at[1] + oy) * 32 + 16 });
    let L = null; for (let k = 0; k < 30 && !L; k++) { L = await page.evaluate(() => window.__lastLook); if (!L) await sleep(150); }
    console.log(JSON.stringify({ look: '우물 칸', bottle: give, water: L && L.water, line: L && L.line }));
  }
  await browser.close();
  // ── 2줄 × 3칸 — 윗줄 ×3(우물 둘레) · 아랫줄 1:1(같은 칸 크기의 마을 둘레) ──
  const { PNG } = require('pngjs');
  const Z = 3, CW = 280, CH = 180, G = 8;
  const PW = CW * Z, PH = CH * Z;
  const out = new PNG({ width: PW * 3 + G * 2, height: PH * 2 + G });
  out.data.fill(255);
  shots.forEach((s, k) => {
    const im = PNG.sync.read(fs.readFileSync(s.p));
    const ox = k * (PW + G);
    const x0 = Math.round(s.scr.px - CW / 2), y0 = Math.round(s.scr.py - CH / 2 - 14);          // 우물 가운데(라벨 쪽으로 조금 위)
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const sx = Math.min(im.width - 1, Math.max(0, x0 + Math.floor(x / Z))), sy = Math.min(im.height - 1, Math.max(0, y0 + Math.floor(y / Z)));
      const si = (sy * im.width + sx) * 4, di = (y * out.width + ox + x) * 4;
      im.data.copy(out.data, di, si, si + 4);
    }
    const cx0 = Math.min(im.width - PW, Math.max(0, Math.round(s.scr.px - PW / 2))), cy0 = Math.min(im.height - PH, Math.max(0, Math.round(s.scr.py - PH / 2)));
    for (let y = 0; y < PH; y++) {
      const si = ((cy0 + y) * im.width + cx0) * 4, di = ((PH + G + y) * out.width + ox) * 4;
      im.data.copy(out.data, di, si, si + PW * 4);
    }
  });
  fs.writeFileSync(OUT, PNG.sync.write(out));
  console.log('→', OUT, `${out.width}x${out.height}`, errs.length ? `pageerror ${errs.length}: ${errs[0]}` : 'pageerror 0', `fx ${fx.ok}`);
  shutdown(); for (const f of [WRAP, PHF]) { try { fs.unlinkSync(f); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
