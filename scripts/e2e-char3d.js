#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 19 · B 20 · C 19 — 적은 쪽 중 앞 글자
// @pixel     ← ★프레임을 화소로 잰다(`page.screenshot` · 타일 `getImageData`) — 하늘·바람을 끄고 잰다
// === scripts/e2e-char3d.js — 사람 하나를 3D 로 (T522) ============================================
//
// ★이 하네스가 지키는 계약(§0 다섯):
//   ⓐ glTF — `char_export_gltf.py` 산물이 잠금과 같다 · 뼈 12 · 클립 셋(서기·걷기·조준 · 길이 = 메타) · 몸 7 + 옷 5
//   ⓑ 카메라 — 3D 타일과 시트 판(몸 + 가죽옷 · 서기 0판)을 **8방향 전부** 맞댄다: 발밑 줄 · 발 가운데 · 실루엣 IoU
//   ⓒ 걷기 — 그린 자리 = 같은 순간의 이동 모델 예측 자리 · 걷는 동안 걷기 클립 · 돌아서기는 **연속**(45° 계단 아닌 값이 선다)
//      가림 — 산 뒤에 서면 **시트와 같은 술어**(화가 순서 · 흐림 겹이 맨 위)로 덮인다 · 비교: 위에 얹은 투명 캔버스(`overlay`)는 못 덮인다
//   ⓓ 옷 한 벌(가죽) — 메시 하나가 방향·판 전부를 덮는다(시트는 재질 6 × 클립 12 = 72장) · 옷을 벗기면 화소가 갈린다
//   ⓔ 프레임 — 몸 1·10·100 × 시트·메시 짝(같은 자 `__frameCapture` · SwiftShader) · 수치는 적기만(최적화 0)
//   ⓕ 끔(기본) — 주소창에 손잡이가 없으면 three.js·glb·char3d.js 요청 0 · `window.__char3d` 없음 · 시트가 그린다
// 실행: node scripts/e2e-char3d.js [그림.png] [--json 경로]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const args = process.argv.slice(2);
const OUTPNG = args.find((a) => a.endsWith('.png')) || null;
const JI = args.indexOf('--json'); const OUTJSON = JI >= 0 ? args[JI + 1] : null;
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/e2e-char3d-${process.pid}.db`, CDB = `/tmp/e2e-char3d-c-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
const REC = { a: {}, b: [], c: {}, d: {}, e: [], f: {} };
const C3 = path.join(ROOT, 'public', 'assets', 'char3d');

// ── ⓐ glTF — 노드 쪽에서 먼저(서버 안 띄우고) ────────────────────────────────────────
console.log('\n=== 사람 하나를 3D 로 (T522) ===');
console.log('\nⓐ glTF — 내보낸 것이 잠금과 같고 뼈·클립·몸이 선다');
const crypto = require('crypto');
const sha16 = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const LOCK = JSON.parse(fs.readFileSync(path.join(C3, 'char3d.lock.json'), 'utf8'));
const META = JSON.parse(fs.readFileSync(path.join(C3, 'char3d_meta.json'), 'utf8'));
{
  const g = sha16(path.join(C3, 'char_body.glb')), m = sha16(path.join(C3, 'char3d_meta.json'));
  ok(LOCK.char3d['char_body.glb'] === g && LOCK.char3d['char3d_meta.json'] === m, 'ⓐ 잠금 — glb·메타 해시가 잠금표와 같다', `${g} · ${m}`);
  const inp = LOCK._입력 || {};
  const cur = { 'scripts/char_render.py': sha16(path.join(ROOT, 'scripts', 'char_render.py')),
                'assets-src/mocap/poses.json': sha16(path.join(ROOT, 'assets-src', 'mocap', 'poses.json')),
                'scripts/char_export_gltf.py': sha16(path.join(ROOT, 'scripts', 'char_export_gltf.py')) };
  const stale = Object.keys(cur).filter((k) => inp[k] !== cur[k]);
  ok(stale.length === 0, 'ⓐ 입력 지문 — 소체·포즈표·내보내기가 굽던 때와 같다(바뀌면 다시 굽는다)', stale.join(' ') || '셋 다 같다');
  const b = fs.readFileSync(path.join(C3, 'char_body.glb'));
  const jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const joints = (J.skins && J.skins[0] && J.skins[0].joints.length) || 0;
  const an = {}; for (const a of J.animations || []) { const acc = J.accessors[a.samplers[0].input]; an[a.name] = +(acc.max[0]).toFixed(4); }
  const meshN = J.meshes.map((x) => x.name).sort();
  const wantMesh = [...META.meshes.body, ...META.meshes.clothes].sort();
  REC.a = { bytes: b.length, joints, anims: an, meshes: meshN.length, generator: J.asset.generator, lock: LOCK.char3d['char_body.glb'] };
  ok(b.toString('ascii', 0, 4) === 'glTF' && J.asset.version === '2.0', 'ⓐ GLB 2.0', `${b.length}B · ${J.asset.generator}`);
  ok(joints === 12, 'ⓐ 뼈 12(char_render 의 CharRig 그대로)', String(joints));
  ok(['idle', 'walk', 'aim'].every((k) => Math.abs((an[k] || 0) - META.clips[k].duration) < 1e-3), 'ⓐ 클립 셋 — 서기·걷기·조준 · 길이 = 메타(판 ÷ fps)', JSON.stringify(an));
  ok(JSON.stringify(meshN) === JSON.stringify(wantMesh) && META.meshes.body.length === 7 && META.meshes.clothes.length === 5, 'ⓐ 몸 7 + 옷 5(가죽) — 메타와 같은 이름', meshN.join(' '));
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_export_gltf.py'), 'utf8');
  ok(/exec\(compile\(head, SRC/.test(src) && /공유 프레임 박스/.test(src) && !/primitive_\w+_add|from_pydata|bmesh/.test(src), 'ⓐ 새 형상 0 — 내보내기는 char_render.py 장면을 **읽어** 세운다(기하를 짓지 않는다)');
  const v = path.join(ROOT, 'public', 'vendor', 'three.0.186.1.min.js');
  const vh = fs.existsSync(v) ? fs.readFileSync(v, 'utf8').slice(0, 300) : '';
  ok(/three\.js 0\.186\.1/.test(vh) && /MIT/.test(vh) && fs.existsSync(path.join(ROOT, 'public', 'vendor', 'three.LICENSE.txt')), 'ⓐ three.js 한 판 고정(public/vendor · MIT 전문 동봉 · CDN 0)');
  const cr = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  ok(/three\.js/.test(cr) && /0\.186\.1/.test(cr), 'ⓐ CREDITS 에 three.js 한 줄');
}

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('server/zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', CHAR_SPRITE: 'on' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!cu.ok || !zu.ok) { ok(false, '서버가 떴다', `${cu.why || ''} ${zu.why || ''}`); process.exit(1); }
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const VW = 1280, VH = 800;
  const open = async (q) => {
    const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
    const reqs = [], errs = [];
    page.on('request', (r) => reqs.push(r.url()));
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/index.html${q || ''}`);
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
    try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
    const iw = await FX.waitInWorld(page);
    await FX.setClock(page, { day: FX.anchorDays().summer, night: false });
    await page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
    await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { if (window.__rainForce) window.__rainForce({ precip: 0 }); try { drawNameTag = function () {}; } catch (e) { } });
    return { page, reqs, errs, iw };
  };
  const send = (page, m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const meDbg = (page) => page.evaluate(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) return d[k]; return null; });

  // ── ⓕ 끔(기본) — 먼저 잰다(손잡이 없는 주소) ──
  console.log('\nⓕ 끔(기본) — 손잡이가 없으면 3D 는 한 바이트도 안 실린다');
  {
    const A = await open('');
    await sleep(4000);
    const knob = await A.page.evaluate(() => { try { return T522_CHAR_3D; } catch (e) { return 'ERR'; } });
    const has3d = await A.page.evaluate(() => typeof window.__char3d);
    const bad = A.reqs.filter((u) => /\/vendor\/|\/client3d\/|\/assets\/char3d\//.test(u));
    const d = await meDbg(A.page);
    REC.f = { knob, has3d, reqs3d: bad.length, sheet: !!(d && d.on && !d.mesh) };
    ok(A.iw.ok && knob === null && has3d === 'undefined', 'ⓕ 손잡이 끔 — `T522_CHAR_3D` null · `window.__char3d` 없음', `${knob} · ${has3d}`);
    ok(bad.length === 0, 'ⓕ ★three.js·glb·char3d.js 요청 0(끔 = 비트 동일 경로)', bad.slice(0, 3).join(' ') || '0');
    ok(!!(d && d.on && !d.mesh), 'ⓕ 내 몸은 시트가 그린다(종전 그대로)', d ? JSON.stringify({ on: d.on, clip: d.clip, layers: d.layers }) : 'null');
    ok(A.errs.length === 0, 'ⓕ pageerror 0', A.errs.slice(0, 2).join(' | '));
    await A.page.context().close();
  }

  // ── 켬 ──
  const B = await open('?T522_CHAR_3D=1');
  const P = B.page;
  await P.waitForFunction(() => window.__char3d && (window.__char3d.ready || (window.__char3d.why && window.__char3d.why !== '싣는 중')), { timeout: 60000 }).catch(() => {});
  const info = await P.evaluate(() => ({ ready: !!(window.__char3d && window.__char3d.ready), why: window.__char3d && window.__char3d.why, info: window.__char3d && window.__char3d.info }));
  REC.a.gl = info.info;
  ok(info.ready, 'ⓐ 켬 — three.js + glb 가 실리고 WebGL 층이 섰다', JSON.stringify(info.info));
  // 가죽옷을 입힌다 — 시트 쪽도 몸 + `clothes_leather` 두 층이 되게(맞대는 재료가 같다)
  await send(P, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'leather', lvl: 5 }] });
  await P.waitForFunction(() => { try { return !!(charSheet('body_idle') && charSheet('clothes_leather_idle') && charSheet('body_walk') && charSheet('clothes_leather_walk')); } catch (e) { return false; } }, { timeout: 60000 }).catch(() => {});

  // ── ⓑ 카메라 맞춤 — 8방향 ──
  console.log('\nⓑ 카메라 — 3D 타일 ↔ 시트 판(몸 + 가죽옷 · 서기 0판) 8방향');
  const cam = await P.evaluate(() => {
    const m = charMeta(), fw = m.frameW, fh = m.frameH, out = [];
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d');
    for (let d = 0; d < 8; d++) {
      g.clearRect(0, 0, fw, fh);
      g.drawImage(charSheet('body_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh);
      g.drawImage(charSheet('clothes_leather_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh);
      const sheet = Array.from(g.getImageData(0, 0, fw, fh).data);
      const mesh = window.__char3d.snap(d, 'idle', 0, true);
      out.push({ d, sheet, mesh: mesh.data });
    }
    return { fw, fh, ax: m.anchorX, ay: m.anchorY, out };
  });
  const maskOf = (a, fw, fh) => { const mk = new Uint8Array(fw * fh); for (let i = 0; i < fw * fh; i++) mk[i] = a[i * 4 + 3] > 127 ? 1 : 0; return mk; };
  const statOf = (mk, fw, fh) => {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
    for (let i = 0; i < fw * fh; i++) if (mk[i]) { const x = i % fw, y = (i / fw) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    let fx = 0, fn = 0;
    for (let i = 0; i < fw * fh; i++) if (mk[i]) { const y = (i / fw) | 0; if (y >= y1 - 3) { fx += i % fw; fn++; } }
    return { x0, x1, y0, y1, n, feetX: fn ? fx / fn : null };
  };
  let worstY = 0, worstX = 0, minIoU = 1;
  for (const r of cam.out) {
    const a = maskOf(r.sheet, cam.fw, cam.fh), b = maskOf(r.mesh, cam.fw, cam.fh);
    const sa = statOf(a, cam.fw, cam.fh), sb = statOf(b, cam.fw, cam.fh);
    let inter = 0, uni = 0, dc = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) { inter++; dc += (Math.abs(r.sheet[i * 4] - r.mesh[i * 4]) + Math.abs(r.sheet[i * 4 + 1] - r.mesh[i * 4 + 1]) + Math.abs(r.sheet[i * 4 + 2] - r.mesh[i * 4 + 2])) / 3; } if (a[i] || b[i]) uni++; }
    const iou = uni ? inter / uni : 0;
    // 색 Δ(겹친 화소의 RGB 평균 차 · 0–255) — 적기만: 시트는 먹선 1px·셀 4단 후처리(`char_render.py` T96)를 거친 그림이고 3D 층엔 그 후처리가 없다(회부)
    const row = { d: r.d, dBottom: sb.y1 - sa.y1, dFeetX: +(sb.feetX - sa.feetX).toFixed(2), dTop: sb.y0 - sa.y0, iou: +iou.toFixed(3), nSheet: sa.n, nMesh: sb.n, dRGB: inter ? +(dc / inter).toFixed(1) : null };
    REC.b.push(row);
    worstY = Math.max(worstY, Math.abs(row.dBottom)); worstX = Math.max(worstX, Math.abs(row.dFeetX)); minIoU = Math.min(minIoU, iou);
  }
  console.log('    [표] 방향 · 발밑 줄 Δ(px) · 발 가운데 Δx(px) · 정수리 Δ · IoU · 화소(시트/메시) · 색 Δ(적기만)');
  for (const r of REC.b) console.log(`      ${r.d} · ${r.dBottom} · ${r.dFeetX} · ${r.dTop} · ${r.iou} · ${r.nSheet}/${r.nMesh} · ${r.dRGB}`);
  ok(worstY <= 1 && worstX <= 1, 'ⓑ ★발 위치 오차 ≤ 1px — 8방향 전부(같은 앵커 · 같은 투영)', `발밑 최대 ${worstY}px · 발 가운데 최대 ${worstX}px`);
  ok(minIoU >= 0.95, 'ⓑ 실루엣 IoU ≥ 0.95 — 8방향 전부(같은 각 · 같은 축척 · 같은 거울)', `최소 ${minIoU.toFixed(3)}`);
  { // ★자명 통과 금지 — 한 방향 어긋난 타일(45°)을 대면 문다
    const a = maskOf(cam.out[0].sheet, cam.fw, cam.fh), b = maskOf(cam.out[2].mesh, cam.fw, cam.fh);
    let inter = 0, uni = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) uni++; }
    ok(inter / uni < 0.95, 'ⓑ 자명 통과 금지 — 방향이 다른 판(0 ↔ 2)을 맞대면 IoU 가 문턱 아래로 떨어진다', (inter / uni).toFixed(3));
  }

  // ── ⓒ 걷기 — 마을 안에서 ──
  console.log('\nⓒ 걷기 — 한반도 마을에서 한 몸이 걷는다(서버 무접촉 · 같은 이동 모델 예측)');
  const vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;
  await send(P, { type: 'teleport_debug', x: vx + 96, y: vy + 160 });
  await sleep(4000);
  const samples = [];
  const sample = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await P.evaluate(() => ({ ld: window.__char3d.lastDraw, dbg: (() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) return d[k]; return null; })() })); samples.push(s); await sleep(40); } };
  await P.keyboard.down('d'); await sample(1600);
  const shotWalk = '/tmp/e2e-char3d-walk.png'; await P.screenshot({ path: shotWalk });
  const walkScr = await P.evaluate(() => window.__char3d.lastDraw);
  await P.keyboard.down('s'); await sample(900); await P.keyboard.up('d'); await sample(900); await P.keyboard.up('s');
  await sample(1500);
  const dPos = samples.filter((s) => s.ld && s.ld.w2s).map((s) => Math.hypot(s.ld.x - s.ld.w2s[0], s.ld.y - s.ld.w2s[1]));
  const maxD = dPos.length ? Math.max(...dPos) : 1e9;
  const walked = samples.filter((s) => s.dbg && s.dbg.mesh && s.ld && s.ld.clip === 'walk').length;
  const idleEnd = samples.slice(-5).every((s) => s.dbg && s.dbg.mesh && s.ld && s.ld.clip === 'idle');
  const yaws = samples.filter((s) => s.ld).map((s) => s.ld.yaw);
  const offGrid = yaws.filter((y) => { const k = y / (Math.PI / 4); return Math.abs(k - Math.round(k)) > 0.02; }).length;
  const conv = samples.slice(-5).every((s) => s.ld && Math.abs(s.ld.yaw - s.ld.yawTarget) < 0.02);
  const abs0 = samples.find((s) => s.ld && s.ld.abs), abs1 = [...samples].reverse().find((s) => s.ld && s.ld.abs);
  const moved = abs0 && abs1 ? Math.hypot(abs1.ld.abs[0] - abs0.ld.abs[0], abs1.ld.abs[1] - abs0.ld.abs[1]) : 0;
  REC.c = { samples: samples.length, maxDrawVsPredPx: +maxD.toFixed(3), walkFrames: walked, idleEnd, yawOffGrid: offGrid, yawConverged: conv, movedPx: +moved.toFixed(1) };
  ok(moved > 60, 'ⓒ [상황] 몸이 실제로 걸었다(이동 모델 예측 자리)', `${moved.toFixed(1)}px`);
  ok(maxD < 0.51, 'ⓒ ★그린 자리 = 같은 순간의 몸 자리(`myAbsRender` — 시트와 같은 renderables 한 줄 · 이동 모델 예측을 보간해 따라간다)', `최대 ${maxD.toFixed(3)}px · ${dPos.length}표본`);
  { const lag = samples.filter((s) => s.ld && s.ld.pred && s.ld.abs).map((s) => Math.hypot(s.ld.pred[0] - s.ld.abs[0], s.ld.pred[1] - s.ld.abs[1])); REC.c.renderVsPredMaxPx = lag.length ? +Math.max(...lag).toFixed(2) : null; console.log(`    [곁] 보간 자리 ↔ 예측 자리 최대 ${REC.c.renderVsPredMaxPx}px(30Hz 예측 계단을 펴는 보간 — 시트도 같은 자리)`); }
  ok(walked >= 5 && idleEnd, 'ⓒ 걷는 동안 걷기 클립 · 멈추면 서기(시트와 같은 상태기계)', `걷기 ${walked}표본 · 끝 서기 ${idleEnd}`);
  ok(offGrid >= 2 && conv, 'ⓒ ★방향 8 → 연속 — 돌아서는 동안 45° 계단이 아닌 각이 서고 끝엔 목표에 붙는다', `계단 밖 ${offGrid}/${yaws.length} · 수렴 ${conv}`);

  // ── ⓒ 가림 — 이 엔진에서 사람을 덮는 것은 **산의 흐림 겹**이다 ──
  //   ★집·나무는 사람을 안 덮는다: 사람은 renderables 에서 z + 500 으로 선다(`34-m-renderloop` · 시트와 같은 한 줄) —
  //     그래서 여기서 재는 가림은 산 뒤에 선 몸 위에 얹히는 **흐림 겹**(`11-r1-mountain` · 앞 산을 모아 알파 `MT_OCC_A` 로 맨 위에 얹는다)이다.
  //   재는 법(수 하나로 갈린다): 흐림 겹 **아래**에 선 화소는 산을 켜면 바탕과의 대비가 정확히 (1 − MT_OCC_A) 배로 준다
  //     — 몸 B · 바탕 G · 산 M 이면 켠 판은 (1−A)B + AM 과 (1−A)G + AM, 둘의 차 = (1−A)(B − G).
  //     흐림 겹 **위**(덮개)면 몸 화소가 산을 켜도 **그대로**다(바뀐 양 0).
  console.log('\nⓒ 가림 — 산 뒤에 서면 흐림 겹이 몸을 덮는다(시트와 같은 화가 순서 · 새 규칙 0)');
  const OCC_A = +(/const MT_OCC_A = ([\d.]+)/.exec(fs.readFileSync(path.join(ROOT, 'public', 'client', '11-r1-mountain.js'), 'utf8')) || [0, NaN])[1];   // 정본 상수를 읽는다(사본 0)
  const MT = { cx: 2150, cy: 1959 };   // `e2e-mtcut` 의 그 산(한가운데 칸은 바위라 순간이동이 안 선다 — 둘레에서 찾는다)
  const offOf = (PG) => PG.evaluate(() => { const c = conns.get(primaryZoneId); return [c.meta.worldOffsetX || 0, c.meta.worldOffsetY || 0]; });
  const tpTo = async (PG, off, x, y) => {   // 존 좌표로 보내고 **내 자리가 실제로 옮겨졌나** 본다(바위·물은 서버가 거절한다)
    await send(PG, { type: 'teleport_debug', x, y });
    for (let i = 0; i < 12; i++) { await sleep(150); const a = await PG.evaluate(() => { const m = window.__getMyAbs(); return m ? [m.x, m.y] : null; }); if (a && Math.hypot(a[0] - off[0] - x, a[1] - off[1] - y) < 40) return true; }
    return false;
  };
  const settleMt = async (PG, maxMs) => { let prev = null, same = 0; const t0 = Date.now();   // 청크 굽기가 멎을 때까지(e2e-mtcut 의 그 안정 대기)
    while (Date.now() - t0 < maxMs) { const st = await PG.evaluate(() => { const d = window.__mtDbg || {}; const c = window.__mtCutN(); return [d.mt3chunks | 0, d.mt3segs | 0, c.split | 0].join(','); });
      if (st === prev) { if (++same >= 3) return; } else { same = 0; prev = st; } await sleep(600); } };
  const hereOcc = (PG) => PG.evaluate(() => { const a = window.__getMyAbs(); const r = window.__mtOccAt(a.x, a.y); return { n: r ? r.n : 0, split: window.__mtCutN().split | 0 }; });
  // 자리 찾기 — 방아쇠는 정본 그대로(`__mtOccAt` = `_mtOccludesMe`): **나를 덮는 산이 있는 칸**으로 간다
  const findSpot = async (PG) => {
    const off = await offOf(PG);
    let land = false;
    for (let r = 0; r <= 8 && !land; r++) for (let dx = -r; dx <= r && !land; dx++) for (let dy = -r; dy <= r && !land; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      land = await tpTo(PG, off, (MT.cx + dx) * 32 + 16, (MT.cy + dy) * 32 + 16);
    }
    if (!land) return null;
    await PG.evaluate(() => { window.__mtFadeCut(1); window.__mtFadePlane(0); });
    await settleMt(PG, 20000);
    const cand = await PG.evaluate((o) => { const a = window.__getMyAbs(), out = [];
      for (let dx = -24; dx <= 24; dx++) for (let dy = -24; dy <= 24; dy++) { const r = window.__mtOccAt(a.x + dx * 32, a.y + dy * 32);
        if (r && r.n) out.push({ x: Math.round(a.x - o[0]) + dx * 32, y: Math.round(a.y - o[1]) + dy * 32, n: r.n, d: Math.hypot(dx, dy) }); }
      return out.sort((p, q) => (q.n - p.n) || (p.d - q.d)).slice(0, 16); }, off);
    for (const c of cand) {
      if (!await tpTo(PG, off, c.x, c.y)) continue;
      await settleMt(PG, 12000);
      const h = await hereOcc(PG);
      if (h.n > 0 && h.split > 0) return { x: c.x, y: c.y };
    }
    return null;
  };
  const occOf = async (PG, label, spot) => {
    if (!spot) spot = await findSpot(PG);
    else { await tpTo(PG, await offOf(PG), spot.x, spot.y); await PG.evaluate(() => { window.__mtFadeCut(1); window.__mtFadePlane(0); }); await settleMt(PG, 20000); }
    if (!spot) return { spot: null, out: {} };
    const here = await hereOcc(PG);
    const box = await PG.evaluate(() => { const l = window.__char3d.lastDraw; return l ? [Math.round(l.x), Math.round(l.y)] : null; });
    const grab = async () => PNG.sync.read(await PG.screenshot({ clip: { x: box[0] - 60, y: box[1] - 90, width: 120, height: 100 } }));
    const set = async (o) => { await PG.evaluate((oo) => { Object.assign(window.__terrain19, { mtOff: oo.mtOff }); window.__char3d.hide = oo.hide; if (oo.mode) window.__char3d.mode = oo.mode; }, o); await sleep(700); };
    // ★몸의 시계를 멈춘다(서기 클립도 숨을 쉰다 — 판 사이 몸짓이 가림 잣대에 잡음이 된다).
    //   손잡이를 새로 두지 않고 정본 상태기계의 내 칸(`_charAnim`)의 t 만 0 에 묶는다 — 시트·3D 가 같은 칸을 읽는다.
    const freeze = (on) => PG.evaluate((f) => { const d = window.__charDbg || {};
      for (const k of Object.keys(d)) { if (!d[k] || !d[k].isMe) continue; const st = _charAnim.get(k) || _charAnim.get(+k); if (!st) continue;
        if (f) Object.defineProperty(st, 't', { get: () => 0, set: () => {}, configurable: true }); else { delete st.t; st.t = 0; } } }, on);
    await freeze(true);
    const out = {};
    for (const mode of (label === 'overlay' ? ['mesh'] : ['mesh', 'sheet'])) {
      await set({ mtOff: true, hide: false, mode }); const offOn = await grab();
      await set({ mtOff: true, hide: true, mode: 'mesh' }); const offHid = await grab(); const offHid2 = await grab();
      await set({ mtOff: false, hide: false, mode }); const onOn = await grab();
      await set({ mtOff: false, hide: true, mode: 'mesh' }); const onHid = await grab();
      await set({ mtOff: false, hide: false, mode: 'mesh' });
      const dif = (a, b, i) => Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      let mask = 0, tint = 0, bg = 0, noise = 0, sxy = 0, sxx = 0;
      for (let i = 0; i < offOn.data.length; i += 4) {
        noise += dif(offHid, offHid2, i) / 3;
        if (dif(onHid, offHid, i) > 24) bg++;                      // 산이 이 상자에 실제로 있다
        if (dif(offOn, offHid, i) <= 24) continue;                 // 몸 화소 = 산을 끈 판에서 몸 있음 ≠ 몸 없음
        mask++;
        tint += dif(onOn, offOn, i) / 3;                           // 산을 켜면 몸 화소가 얼마나 바뀌나(덮개면 0)
        for (let ch = 0; ch < 3; ch++) { const x = offOn.data[i + ch] - offHid.data[i + ch], y = onOn.data[i + ch] - onHid.data[i + ch]; sxy += x * y; sxx += x * x; }
      }
      const key = label === 'overlay' ? 'overlay' : (mode === 'mesh' ? 'slot' : 'sheet');
      out[key] = { mask, tint: mask ? +(tint / mask).toFixed(2) : 0, k: sxx ? +(sxy / sxx).toFixed(3) : null, bg, noise: +(noise / (offOn.data.length / 4)).toFixed(3), png: onOn };
    }
    await freeze(false);
    return { spot, here, box, out };
  };
  const occ = await occOf(P, 'slot');
  const OS = occ.out.slot || {}, OH = occ.out.sheet || {};
  REC.c.occ = { spot: occ.spot, here: occ.here, A: OCC_A, want: +(1 - OCC_A).toFixed(3),
                slot: { mask: OS.mask, tint: OS.tint, k: OS.k, noise: OS.noise }, sheet: { mask: OH.mask, tint: OH.tint, k: OH.k, noise: OH.noise }, bg: OS.bg };
  ok(!!occ.spot && occ.here.n > 0 && occ.here.split > 0 && OS.bg > 500 && OS.mask > 300 && OH.mask > 300,
     'ⓒ [상황] 산 뒤 자리 — 정본 방아쇠가 나를 덮는 산을 세고(걸친 띠가 갈린다) 몸 상자에 산이 실제로 있다',
     occ.spot ? `존 (${occ.spot.x},${occ.spot.y}) · 덮는 산 ${occ.here.n} · 걸친 띠 ${occ.here.split} · 산 화소 ${OS.bg} · 몸 ${OS.mask}/${OH.mask}px · 잡음 ${OS.noise}` : '자리 없음');
  const kOk = (o) => o && o.k != null && Math.abs(o.k - (1 - OCC_A)) < 0.1;
  ok(kOk(OS) && kOk(OH),
     `ⓒ ★가림 ○ — 3D(제 차례)도 시트도 흐림 겹 **아래**다: 산을 켜면 몸↔바탕 대비가 (1 − MT_OCC_A) = ${(1 - OCC_A).toFixed(2)} 배로 준다(같은 술어)`,
     `3D k ${OS.k} · 시트 k ${OH.k} · 바뀐 양 3D ${OS.tint} · 시트 ${OH.tint}(0–255)`);
  // ── ⓓ 옷 한 벌(가죽) 메시 ──
  console.log('\nⓓ 옷 한 벌(가죽) — 메시 하나가 방향·판 전부를 덮는다');
  const turn = await P.evaluate(() => {
    const out = [];
    for (let k = 0; k < 16; k++) out.push(window.__char3d.snap(k / 2, 'walk', 2, true).data);
    const bare = window.__char3d.snap(1, 'walk', 2, false).data, dressed = window.__char3d.snap(1, 'walk', 2, true).data;
    return { out, bare, dressed };
  });
  { let dif = 0; for (let i = 0; i < turn.bare.length; i += 4) if (Math.abs(turn.bare[i] - turn.dressed[i]) + Math.abs(turn.bare[i + 1] - turn.dressed[i + 1]) + Math.abs(turn.bare[i + 2] - turn.dressed[i + 2]) > 24) dif++;
    const clothesPng = fs.readdirSync(path.join(ROOT, 'public', 'assets', 'char')).filter((f) => /^clothes_.*\.png$/.test(f));
    const cBytes = clothesPng.reduce((s, f) => s + fs.statSync(path.join(ROOT, 'public', 'assets', 'char', f)).size, 0);
    const glbB = fs.statSync(path.join(C3, 'char_body.glb')).size;
    REC.d = { clothesSheets: clothesPng.length, clothesSheetBytes: cBytes, glbBytes: glbB, dressedDiffPx: dif, turntable: 16 };
    ok(clothesPng.length === 72, 'ⓓ 시트 옷 층 = 재질 6 × 클립 12 = 72장(방향 8 · 판 전부 구운 그림)', `${clothesPng.length}장 · ${(cBytes / 1024).toFixed(0)}KB`);
    ok(dif > 150, 'ⓓ ★옷 메시 하나를 입히고 벗기면 화소가 갈린다(같은 몸 · 같은 판 · 같은 방향)', `${dif}화소`);
    const distinct = new Set(turn.out.map((d) => crypto.createHash('sha1').update(Buffer.from(d)).digest('hex'))).size;
    ok(distinct === 16, 'ⓓ 16방향(22.5° 걸음) 돌림판이 전부 다른 그림 — 시트 8행 사이의 방향도 메시가 낸다', `${distinct}/16`);
    REC.d.turnPng = turn.out;
  }

  // ── ⓔ 프레임 짝 — 몸 1·10·100 × 시트·메시 ──
  console.log('\nⓔ 프레임 — 몸 1·10·100 × 시트·메시(같은 자 `__frameCapture` · 최적화 0 · 적기만)');
  await send(P, { type: 'teleport_debug', x: vx + 96, y: vy + 160 });
  await sleep(3000);
  for (const N of [1, 10, 100]) for (const mode of ['sheet', 'mesh']) {
    await P.evaluate(([n, md]) => { window.__char3d.benchN = n; window.__char3d.mode = md; }, [N, mode]);
    await sleep(1500);
    // 같은 창에서 3D 쪽 두 토막(타일 명령 · 옮기기)도 프레임마다 모아 평균한다(마지막 한 판이 아니라)
    const cap = await P.evaluate(async () => { const acc = { gl: [], blit: [] }; let last = null;
      const h = setInterval(() => { const l = window.__char3d.lastDraw; if (l && l !== last) { last = l; acc.gl.push(l.gl); acc.blit.push(l.blit); } }, 5);
      const fc = await window.__frameCapture(5); clearInterval(h);
      const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
      return { fc, gl: mean(acc.gl), blit: mean(acc.blit), n: acc.gl.length }; });
    const fc = cap.fc;
    const row = { N, mode, fps: fc.frames.fps, p50: fc.frames.p50, p95: fc.frames.p95, renderMs: +(fc.frames.sum.render / Math.max(1, fc.frames.n)).toFixed(2),
                  gl: mode === 'mesh' ? cap.gl : null, blit: mode === 'mesh' ? cap.blit : null };
    REC.e.push(row);
    console.log(`    [짝] 몸 ${N} · ${mode} · 렌더 ${row.renderMs}ms/프레임 · 프레임 p50 ${row.p50} · p95 ${row.p95} · fps ${row.fps}${row.gl != null ? ` · (3D 타일 ${row.gl}ms + 옮기기 ${row.blit}ms)` : ''}`);
    if (N === 100) await P.screenshot({ path: `/tmp/e2e-char3d-bench-${mode}.png` });
  }
  await P.evaluate(() => { window.__char3d.benchN = 1; window.__char3d.mode = 'mesh'; });
  const r1 = REC.e.filter((r) => r.N === 100);
  ok(REC.e.length === 6 && REC.e.every((r) => r.renderMs > 0), 'ⓔ 짝 여섯을 쟀다(몸 1·10·100 × 시트·메시)', r1.map((r) => `${r.mode} ${r.renderMs}ms`).join(' · '));
  ok(B.errs.length === 0, 'ⓒ pageerror 0(켬)', B.errs.slice(0, 2).join(' | '));

  // ── 덮개 비교: 위에 얹은 투명 캔버스(overlay) ──
  console.log('\nⓒ 비교 — 2D 위에 투명 캔버스로 얹으면(overlay) 산의 흐림 겹이 몸을 못 덮는다');
  {
    const O = await open('?T522_CHAR_3D=overlay');
    await O.page.waitForFunction(() => window.__char3d && window.__char3d.ready, { timeout: 60000 }).catch(() => {});
    await send(O.page, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'leather', lvl: 5 }] });
    const oc = occ.spot ? await occOf(O.page, 'overlay', occ.spot) : { out: {} };
    const OV = oc.out.overlay || {};
    REC.c.occ.overlay = { mask: OV.mask, tint: OV.tint, k: OV.k, noise: OV.noise, here: oc.here };
    occ.out.overlay = OV;
    ok(OV.mask > 300 && oc.here && oc.here.n > 0 && OV.tint < 1,
       'ⓒ ★덮개(overlay)는 가림 × — 같은 자리에서 산을 켜도 몸 화소가 **그대로**다(흐림 겹 **위**에 얹혔다 · 가리려면 새 규칙이 든다)',
       `덮개 바뀐 양 ${OV.tint}(0–255) · k ${OV.k} · 몸 ${OV.mask}px · 덮는 산 ${oc.here && oc.here.n}`);
    await O.page.context().close();
  }
  // ── 그림 넷 — 한 장에 캡션을 달아 쌓는다(같은 브라우저로 그린다 · 화소는 그대로 · 확대는 계단식) ──
  if (OUTPNG) {
    const crop = (png, cx, cy, w, h) => { const o = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(png.width - 1, Math.max(0, cx - (w >> 1) + x)), sy = Math.min(png.height - 1, Math.max(0, cy - (h >> 1) + y)); png.data.copy(o.data, (y * w + x) * 4, (sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4); } return o; };
    const uri = (png) => 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
    const im = (png, z, cap) => `<figure><img src="${uri(png)}" width="${png.width * z}" height="${png.height * z}">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
    const E = (n, m) => REC.e.find((r) => r.N === n && r.mode === m) || {};
    const w = PNG.sync.read(fs.readFileSync(shotWalk));
    const walkP = crop(w, Math.round(walkScr.x), Math.round(walkScr.y) - 30, 200, 130);
    // 돌림판 16 = 8 × 2 (바탕 = 풀빛 · 옷 메시를 입힌 걷기 2판)
    const fw = cam.fw, fh = cam.fh, tt = new PNG({ width: fw * 8, height: fh * 2 });
    for (let i = 0; i < tt.data.length; i += 4) { tt.data[i] = 70; tt.data[i + 1] = 84; tt.data[i + 2] = 62; tt.data[i + 3] = 255; }
    turn.out.forEach((d, k) => { const ox = (k % 8) * fw, oy = ((k / 8) | 0) * fh;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const si = (y * fw + x) * 4, di = ((oy + y) * tt.width + ox + x) * 4, a = d[si + 3] / 255;
        for (let ch = 0; ch < 3; ch++) tt.data[di + ch] = Math.round(d[si + ch] * a + tt.data[di + ch] * (1 - a)); } });   // getImageData = 곧은 알파
    const bs = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-sheet.png')), bm = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-mesh.png'));
    const O = occ.out, cm2 = (o) => (o && o.k != null ? o.k.toFixed(3) : '—');
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#1b1f1b;color:#e6e9e3;font:15px 'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif}
      .w{padding:22px;display:grid;gap:22px;width:max-content}
      h1{margin:0;font-size:20px;font-weight:700}
      section{display:grid;gap:8px} h2{margin:0;font-size:16px;font-weight:600} h2 b{color:#e0b074;font-weight:600}
      .row{display:flex;gap:10px;align-items:flex-start} figure{margin:0;display:grid;gap:4px}
      img{image-rendering:pixelated;display:block;border:1px solid #3a423a} figcaption{font-size:12.5px;color:#b7bfb4}
      .num{font-family:'Noto Sans Mono CJK KR',monospace}
    </style><div class="w">
      <h1>T522 — 사람 하나를 3D 로 (손잡이 <span class="num">?T522_CHAR_3D=1</span> · 끔이 기본)</h1>
      <section><h2>① 걷기 — 한반도 마을 · 3D 한 몸이 시트 자리에서 걷는다 <b>(그린 자리 ↔ 몸 자리 최대 ${REC.c.maxDrawVsPredPx.toFixed(2)}px)</b></h2>
        <div class="row">${im(walkP, 3, '× 3 · 가죽옷 · 방향은 8칸이 아니라 연속으로 돈다')}</div></section>
      <section><h2>② 가림 — 같은 산 뒤 한 자리 · 흐림 겹(알파 ${OCC_A}) 아래인가 <b>시트 ${kOk(O.sheet) ? '○' : '×'} · 3D 제 차례 ${kOk(O.slot) ? '○' : '×'} · 3D 덮개 ${O.overlay && O.overlay.tint < 1 ? '×' : '○'}</b></h2>
        <div class="row">${O.sheet ? im(O.sheet.png, 3, `시트 — 대비 k ${cm2(O.sheet)} (기대 ${(1 - OCC_A).toFixed(2)})`) : ''}${O.slot ? im(O.slot.png, 3, `3D · 제 차례 — k ${cm2(O.slot)}`) : ''}${O.overlay ? im(O.overlay.png, 3, `3D · 위 캔버스 덮개 — 몸 화소 바뀐 양 ${O.overlay.tint}`) : ''}</div></section>
      <section><h2>③ 옷 한 벌(가죽) 메시 — 22.5° 걸음 16방향 <b>(시트 옷 층은 72장 · 메시는 한 벌)</b></h2>
        <div class="row">${im(tt, 2, '× 2 · 걷기 2판 · 윗줄 0°→157.5° · 아랫줄 180°→337.5° · 시트 8행 사이 방향도 선다')}</div></section>
      <section><h2>④ 몸 100 — 같은 자리 · 시트 / 메시 <b>(SwiftShader 렌더 ${E(100, 'sheet').renderMs}ms / ${E(100, 'mesh').renderMs}ms)</b></h2>
        <div class="row">${im(crop(bs, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `시트 — 몸 1 · 10 · 100 = ${E(1, 'sheet').renderMs} · ${E(10, 'sheet').renderMs} · ${E(100, 'sheet').renderMs} ms`)}${im(crop(bm, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `메시 — ${E(1, 'mesh').renderMs} · ${E(10, 'mesh').renderMs} · ${E(100, 'mesh').renderMs} ms (최적화 0)`)}</div></section>
    </div>`;
    const pg = await (await browser.newContext({ viewport: { width: 1860, height: 900 }, deviceScaleFactor: 1 })).newPage();
    await pg.setContent(html, { waitUntil: 'load' });
    await pg.screenshot({ path: OUTPNG, fullPage: true });
    const sz = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    console.log('→', OUTPNG, `${sz[0]}x${sz[1]}`);
  }
  await browser.close();
  if (OUTJSON) { const r = JSON.parse(JSON.stringify(REC, (k, v) => (k === 'turnPng' ? undefined : v))); fs.writeFileSync(OUTJSON, JSON.stringify(r, null, 1)); }
  console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
