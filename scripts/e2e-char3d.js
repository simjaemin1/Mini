#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 19 · B 20 · C 19 — 적은 쪽 중 앞 글자
// @pixel     ← ★프레임을 화소로 잰다(`page.screenshot` · 타일 `getImageData`) — 하늘·바람을 끄고 잰다
// === scripts/e2e-char3d.js — 사람을 3D 로 (T522 한 몸 · T539 남의 몸·주민 · 장면 한 번 · 클립 나머지) =====================
//
// ★이 하네스가 지키는 계약:
//   ⓐ glTF — `char_export_gltf.py` 산물이 잠금과 같다 · 뼈 12 · 클립 셋(서기·걷기·조준 · 길이 = 메타) · 몸 7 + 옷 5
//      [T539] 클립 파일(`char_export_clips.py` · 뼈대만 · 나머지 아홉 · 시각 = 판) 잠금 · 몸 잠금은 **그대로** · ⓪ central `/?쿼리` = index
//   ⓑ 카메라 — 3D 타일과 시트 판(몸 + 가죽옷 · 서기 0판)을 **8방향 전부** 맞댄다: 발밑 줄 · 발 가운데 · 실루엣 IoU
//   ③ [T539] 클립 표 — `char_render.py` 클립 열둘 × 8방향 × 판 전부: 3D 몸 ↔ 시트 몸(발밑 · IoU) · 시트 옷을 얹은 합성 ↔ 시트 합성
//   ⓒ 걷기 — 그린 자리 = 같은 순간의 이동 모델 예측 자리 · 걷는 동안 걷기 클립 · 돌아서기는 **연속**(온 메시 몸)
//      가림 — 산 뒤에 서면 **시트와 같은 술어**(화가 순서 · 흐림 겹이 맨 위)로 덮인다 · 비교: 위에 얹은 투명 캔버스(`overlay`)는 못 덮인다
//   ⓓ 옷 한 벌(가죽) — 메시 하나가 방향·판 전부를 덮는다(시트는 재질 6 × 클립 12 = 72장) · 옷을 벗기면 화소가 갈린다
//   ⓔ 프레임 — 몸 1·10·100 × 시트·메시 짝(같은 자 `__frameCapture` · SwiftShader) · [T539] ★렌더 호출 = 프레임당 1 · 수치는 적기만
//   ① [T539] 남의 몸·주민 — 같은 문(몸마다 모드 하나)으로 3D · 남의 몸(둘째 접속) 합성 ↔ 시트 합성 발밑 ≤ 1px · 주민 합성 발밑 n/n
//   ⑤ [T539] 마을 광장 — 주민 3D 여럿 + 시트 옷 층 · 같은 자리 시트 판 나란히(그림)
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
const REC = { a: {}, b: [], c: {}, d: {}, e: [], f: {}, z: {}, clips: [], one: {}, five: {} };
const C3 = path.join(ROOT, 'public', 'assets', 'char3d');

// ── ⓐ glTF — 노드 쪽에서 먼저(서버 안 띄우고) ────────────────────────────────────────
console.log('\n=== 사람을 3D 로 (T522 · T539) ===');
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
// ── ⓐ [T539] 클립 파일 — 뼈대 + 나머지 클립(몸 파일·몸 잠금은 그대로) ──
const CLOCK = JSON.parse(fs.readFileSync(path.join(C3, 'char3d_clips.lock.json'), 'utf8'));
const CMETA = JSON.parse(fs.readFileSync(path.join(C3, 'char3d_clips_meta.json'), 'utf8'));
const RCLIPS = (() => {   // `char_render.py` 의 CLIPS 표(이름·판·루프·fps) — 정본을 읽는다(사본 0)
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
  const blk = src.slice(src.indexOf('\nCLIPS = ['), src.indexOf('\n]', src.indexOf('\nCLIPS = [')));
  const out = []; for (const m of blk.matchAll(/\(\"(\w+)\",\s*(\d+),\s*(True|False),\s*([\d.]+)\)/g)) out.push({ name: m[1], frames: +m[2], loop: m[3] === 'True', fps: +m[4] });
  return out;
})();
{
  const g = sha16(path.join(C3, 'char_clips.glb')), m = sha16(path.join(C3, 'char3d_clips_meta.json'));
  ok(CLOCK.char3d_clips['char_clips.glb'] === g && CLOCK.char3d_clips['char3d_clips_meta.json'] === m, 'ⓐ [T539] 클립 잠금 — glb·메타 해시가 잠금표와 같다', `${g} · ${m}`);
  const cur = { 'scripts/char_render.py': sha16(path.join(ROOT, 'scripts', 'char_render.py')),
                'assets-src/mocap/poses.json': sha16(path.join(ROOT, 'assets-src', 'mocap', 'poses.json')),
                'scripts/char_export_gltf.py': sha16(path.join(ROOT, 'scripts', 'char_export_gltf.py')),
                'scripts/char_export_clips.py': sha16(path.join(ROOT, 'scripts', 'char_export_clips.py')) };
  const stale = Object.keys(cur).filter((k) => (CLOCK._입력 || {})[k] !== cur[k]);
  ok(stale.length === 0, 'ⓐ [T539] 클립 입력 지문 — 소체·포즈표·몸 내보내기·클립 내보내기가 굽던 때와 같다', stale.join(' ') || '넷 다 같다');
  const b = fs.readFileSync(path.join(C3, 'char_clips.glb'));
  const jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const bb = fs.readFileSync(path.join(C3, 'char_body.glb')), JB = JSON.parse(bb.slice(20, 20 + bb.readUInt32LE(12)).toString('utf8'));
  const jn = (JJ) => JJ.skins[0].joints.map((i) => JJ.nodes[i].name).join(',');
  ok(b.toString('ascii', 0, 4) === 'glTF' && (J.meshes || []).length === 0 && jn(J) === jn(JB), 'ⓐ [T539] 클립 파일 = 뼈대만(메시 0) · 뼈 이름·차례가 몸 파일과 같다(이름으로 건다)', `${b.length}B · 메시 ${(J.meshes || []).length} · ${jn(J)}`);
  const want = RCLIPS.filter((c) => !META.clips[c.name]).map((c) => c.name);
  const got = (J.animations || []).map((a) => a.name);
  const span = {}; for (const a of J.animations || []) span[a.name] = J.accessors[a.samplers[0].input].max[0];
  const spanOk = RCLIPS.filter((c) => got.includes(c.name)).every((c) => Math.abs(span[c.name] - (c.frames > 1 ? (c.loop ? c.frames : c.frames - 1) : 1)) < 1e-6 && CMETA.clips[c.name].span === (c.frames > 1 ? (c.loop ? c.frames : c.frames - 1) : 0));
  REC.a.clips = { bytes: b.length, got, span, timeUnit: CMETA.timeUnit };
  ok(JSON.stringify(got) === JSON.stringify(want) && CMETA.timeUnit === 'frame' && spanOk,
     'ⓐ [T539] 나머지 클립 = char_render.py 표 가운데 몸 파일에 없는 전부(표 차례) · 시각 = 판(열쇠 = 판 번호)', got.join(' '));
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_export_clips.py'), 'utf8');
  ok(/exec\(compile\(part1, BASE/.test(src) && /exec\(compile\(part4, BASE/.test(src) && !/primitive_\w+_add|from_pydata|bmesh/.test(src),
     'ⓐ [T539] 새 형상 0 — 클립 내보내기는 몸 내보내기 원문을 **읽어** 장면·내보내기를 세운다(몸 파일 무접촉)');
}

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('server/zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '1', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', CHAR_SPRITE: 'on' });
    // ★[T539] 마을 하나 · 하루 0.5초(`e2e-npcsprite` 의 그 세계 문법) — 광장에 주민이 나와 다닌다(⑤ 그림 · ① 주민 합성)
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!cu.ok || !zu.ok) { ok(false, '서버가 떴다', `${cu.why || ''} ${zu.why || ''}`); process.exit(1); }
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const VW = 1280, VH = 800;
  const open = async (q, root) => {   // root = `/?…`(T539 ⓪ — 쿼리를 뗀 길이 `/` 여도 index) · 아니면 `/index.html?…`
    const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
    const reqs = [], errs = [];
    page.on('request', (r) => reqs.push(r.url()));
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/${root ? '' : 'index.html'}${q || ''}`);
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

  // ── ⓪ [T539] central 정적 절 — 쿼리를 뗀 길이 `/` 면 index(`/?T522_CHAR_3D=1` 이 404 였다) ──
  {
    const get = async (u) => { try { const r = await fetch(`http://localhost:${CPORT}${u}`, { signal: AbortSignal.timeout(5000) }); return { st: r.status, body: await r.text() }; } catch (e) { return { st: 0, body: '' }; } };
    const idx = await get('/index.html'), rq = await get('/?T522_CHAR_3D=1'), rv = await get('/?v=1'), nope = await get('/nope?x=1'), idq = await get('/index.html?T522_CHAR_3D=1');
    REC.z = { idx: idx.st, rootQ: rq.st, rootV: rv.st, nope: nope.st, idxQ: idq.st };
    ok(rq.st === 200 && rq.body === idx.body && rv.st === 200 && idq.st === 200 && nope.st === 404,
       '⓪ [T539] `/?T522_CHAR_3D=1` = index(200 · 같은 바이트) · `/index.html?…` 그대로 · 없는 길은 404 그대로', JSON.stringify(REC.z));
  }

  // ── 켬 — ★주소는 `/?T522_CHAR_3D=1`(⓪ 이 연 문) ──
  const B = await open('?T522_CHAR_3D=1', true);
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

  // ── ③ [T539] 클립 표 — char_render.py 클립 열둘: 내보냈나 · 3D 몸 ↔ 시트 몸 · 시트 옷(삼베)을 얹은 합성 ↔ 시트 합성 ──
  //   ★몸 + 시트 층 몸(주민·남의 몸 대부분)은 3D 몸을 **시트 판과 같은 자세**(행 × 45° · 판 열쇠)에 세우고 시트 옷을 얹는다 —
  //     그 합성이 시트 합성과 맞는지를 클립마다 8방향 × 판 **전부** 잰다(발밑 줄 · 발 가운데 · 실루엣 IoU).
  console.log('\n③ [T539] 클립 표 — 열둘 × 8방향 × 판 전부(3D 몸 ↔ 시트 몸 · 3D 몸 + 삼베옷 시트 ↔ 시트 합성)');
  await P.waitForFunction((names) => { try { return names.every((n) => charSheet('body_' + n) && charSheet('clothes_hemp_' + n)); } catch (e) { return false; } }, RCLIPS.map((c) => c.name), { timeout: 90000 }).catch(() => {});
  REC.clips = [];
  for (const c of RCLIPS) {
    const r = await P.evaluate(([name, frames]) => {
      const has = !!window.__char3d.clips().find((q) => q.name === name);
      if (!has) return { name, has, n: 0 };
      const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh;
      const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d', { willReadFrequently: true });
      const body = charSheet('body_' + name), cl = charSheet('clothes_hemp_' + name);
      const mk = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0; return o; };
      const st = (k) => { let y1 = -1, fx = 0, fn = 0; for (let i = 0; i < N; i++) if (k[i]) y1 = Math.max(y1, (i / fw) | 0);
        for (let i = 0; i < N; i++) if (k[i] && ((i / fw) | 0) >= y1 - 3) { fx += i % fw; fn++; } return { y1, fx: fn ? fx / fn : 0 }; };
      const iou = (a, b) => { let I = 0, U = 0; for (let i = 0; i < N; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++; } return U ? I / U : 1; };
      let maxB = 0, maxX = 0, minB = 1, minC = 1, n = 0;
      for (let d = 0; d < 8; d++) for (let f = 0; f < frames; f++) {
        g.clearRect(0, 0, fw, fh); g.drawImage(body, f * fw, d * fh, fw, fh, 0, 0, fw, fh);
        const sB = mk(g.getImageData(0, 0, fw, fh).data);
        g.drawImage(cl, f * fw, d * fh, fw, fh, 0, 0, fw, fh);
        const sC = mk(g.getImageData(0, 0, fw, fh).data);
        const t = window.__char3d.snap(d, name, f, false);
        const mB = mk(t.data);
        g.clearRect(0, 0, fw, fh); g.putImageData(new ImageData(new Uint8ClampedArray(t.data), fw, fh), 0, 0);
        g.drawImage(cl, f * fw, d * fh, fw, fh, 0, 0, fw, fh);
        const mC = mk(g.getImageData(0, 0, fw, fh).data);
        const a = st(sB), b = st(mB);
        maxB = Math.max(maxB, Math.abs(b.y1 - a.y1)); maxX = Math.max(maxX, Math.abs(b.fx - a.fx));
        minB = Math.min(minB, iou(sB, mB)); minC = Math.min(minC, iou(sC, mC)); n++;
      }
      // 그림 재료 — 방향 1 · 가운데 판: 3D 몸 + 삼베옷 시트 ↔ 시트 몸 + 삼베옷
      const fT = (frames / 2) | 0, dT = 1;
      g.clearRect(0, 0, fw, fh); g.drawImage(body, fT * fw, dT * fh, fw, fh, 0, 0, fw, fh); g.drawImage(cl, fT * fw, dT * fh, fw, fh, 0, 0, fw, fh);
      const thS = Array.from(g.getImageData(0, 0, fw, fh).data);
      const tt = window.__char3d.snap(dT, name, fT, false);
      g.clearRect(0, 0, fw, fh); g.putImageData(new ImageData(new Uint8ClampedArray(tt.data), fw, fh), 0, 0); g.drawImage(cl, fT * fw, dT * fh, fw, fh, 0, 0, fw, fh);
      const thM = Array.from(g.getImageData(0, 0, fw, fh).data);
      return { name, has, n, maxB, maxX: +maxX.toFixed(2), minB: +minB.toFixed(3), minC: +minC.toFixed(3), thumbs: { m: thM, s: thS, fw, fh, f: fT } };
    }, [c.name, c.frames]);
    r.fits = r.has && r.maxB <= 1 && r.minC >= 0.95;   // 카드: 발밑 ≤ 1px · 합성(3D 몸 + 시트 옷 = 화면에 서는 것) IoU ≥ 0.95 — 발 가운데·몸만 IoU 는 적기만
    REC.clips.push(r);
  }
  console.log('    [표] 클립 · 3D · 표본(방향×판) · 발밑 줄 최대 Δ · 발 가운데 최대 Δx · IoU 최소(몸) · IoU 최소(몸+삼베옷) · 판정');
  for (const r of REC.clips) console.log(`      ${r.name} · ${r.has ? '내보냄' : '시트'} · ${r.n} · ${r.has ? r.maxB : '-'} · ${r.has ? r.maxX : '-'} · ${r.has ? r.minB : '-'} · ${r.has ? r.minC : '-'} · ${r.fits ? '○' : (r.has ? '×' : '시트로')}`);
  ok(REC.clips.length === RCLIPS.length && REC.clips.every((r) => r.has), `③ [T539] 내보낸 클립 ${REC.clips.filter((r) => r.has).length}/${RCLIPS.length} · 시트로 넘긴 클립 ${REC.clips.filter((r) => !r.has).length}(char_render.py 표 전부)`, REC.clips.filter((r) => !r.has).map((r) => r.name).join(' ') || '0');
  ok(REC.clips.every((r) => !r.has || r.fits), '③ [T539] ★클립 전부 — 발밑 줄 ≤ 1px · 합성(3D 몸 + 시트 옷) IoU ≥ 0.95 — 8방향 × 판 전부(발 가운데 Δx · 몸만 IoU 는 적기만 · 시트는 굽고 나서 가장자리를 섞는다)',
     REC.clips.filter((r) => r.has && !r.fits).map((r) => `${r.name}(${r.maxB}/${r.maxX}/${r.minB}/${r.minC})`).join(' ') || `${REC.clips.reduce((a, r) => a + r.n, 0)}표본`);
  { // ★자명 통과 금지 — 판이 어긋난 3D 몸(걷기 0판 ↔ 시트 4판 · 다리가 반대)을 대면 IoU 가 문턱 아래로 떨어진다
    const bad = await P.evaluate(() => { const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh;
      const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(charSheet('body_walk'), 4 * fw, 1 * fh, fw, fh, 0, 0, fw, fh); const a = g.getImageData(0, 0, fw, fh).data, b = window.__char3d.snap(1, 'walk', 0, false).data;
      let I = 0, U = 0; for (let i = 0; i < N; i++) { const x = a[i * 4 + 3] > 127, y = b[i * 4 + 3] > 127; if (x && y) I++; if (x || y) U++; } return +(I / U).toFixed(3); });
    ok(bad < 0.95, '③ 자명 통과 금지 — 판이 어긋난 몸(걷기 3D 0판 ↔ 시트 4판)은 IoU 문턱 아래', String(bad));
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
  const yaws = samples.filter((s) => s.ld && s.ld.yaw != null).map((s) => s.ld.yaw);
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
  // ★[T539] 재는 자리 = 마을 밖 들판(하루 0.5초 마을의 주민이 화면에 들고 나면 두 판의 몸 수가 흔들린다)
  const FIELD = { x: vx + 20 * 32, y: vy - 12 * 32 };
  { const offF = await offOf(P); let land = false;
    for (let r = 0; r <= 6 && !land; r++) for (let dx = -r; dx <= r && !land; dx++) land = await tpTo(P, offF, FIELD.x + dx * 64, FIELD.y + r * 64);
    REC.e_spot = land; }
  await sleep(3000);
  for (const N of [1, 10, 100]) for (const mode of ['sheet', 'mesh']) {
    await P.evaluate(([n, md]) => { window.__char3d.benchN = n; window.__char3d.mode = md; }, [N, mode]);
    await sleep(1500);
    // 같은 창에서 3D 쪽 두 토막(타일 명령 · 옮기기)도 프레임마다 모아 평균한다(마지막 한 판이 아니라)
    const cap = await P.evaluate(async () => { const acc = { gl: [], blit: [] }; let last = null;
      const S0 = { ...window.__char3d.stats };
      const h = setInterval(() => { const l = window.__char3d.lastDraw; if (l && l !== last) { last = l; acc.gl.push(l.gl); acc.blit.push(l.blit); } }, 5);
      const fc = await window.__frameCapture(5); clearInterval(h);
      const S1 = { ...window.__char3d.stats };
      const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
      return { fc, gl: mean(acc.gl), blit: mean(acc.blit), n: acc.gl.length,
               glR: S1.glRenders - S0.glRenders, bodyF: S1.bodyFrames - S0.bodyFrames, toks: S1.tok - S0.tok, bodies: S1.bodies, calls: S1.calls }; });
    const fc = cap.fc;
    const row = { N, mode, fps: fc.frames.fps, p50: fc.frames.p50, p95: fc.frames.p95, renderMs: +(fc.frames.sum.render / Math.max(1, fc.frames.n)).toFixed(2),
                  gl: mode === 'mesh' ? cap.gl : null, blit: mode === 'mesh' ? cap.blit : null,
                  glRenders: cap.glR, bodyFrames: cap.bodyF, toks: cap.toks, bodies: mode === 'mesh' ? cap.bodies : null, calls: mode === 'mesh' ? cap.calls : null };
    REC.e.push(row);
    console.log(`    [짝] 몸 ${N} · ${mode} · 렌더 ${row.renderMs}ms/프레임 · 프레임 p50 ${row.p50} · p95 ${row.p95} · fps ${row.fps}${row.gl != null ? ` · (3D 한 판 ${row.gl}ms + 옮기기 ${row.blit}ms · 몸 ${row.bodies} · 그리기 호출 ${row.calls}) · WebGL 렌더 ${row.glRenders}번 / 3D 몸 판 ${row.bodyFrames}` : ''}`);
    if (N === 100) await P.screenshot({ path: `/tmp/e2e-char3d-bench-${mode}.png` });
  }
  await P.evaluate(() => { window.__char3d.benchN = 1; window.__char3d.mode = 'mesh'; });
  const r1 = REC.e.filter((r) => r.N === 100);
  ok(REC.e.length === 6 && REC.e.every((r) => r.renderMs > 0), 'ⓔ 짝 여섯을 쟀다(몸 1·10·100 × 시트·메시)', r1.map((r) => `${r.mode} ${r.renderMs}ms`).join(' · '));
  { // ★[T539 ②] 장면은 한 번 — 3D 몸을 그린 판마다 WebGL 렌더 **한 번**(몸 수와 무관 · T522 는 몸 수만큼 불렀다)
    const ms = REC.e.filter((r) => r.mode === 'mesh');
    ok(ms.every((r) => r.bodyFrames > 0 && r.glRenders === r.bodyFrames), '② [T539] ★장면 한 번 — 3D 몸을 부른 판마다 WebGL 렌더 1(몸 1·10·100 다)',
       ms.map((r) => `몸 ${r.N}: 렌더 ${r.glRenders} / 판 ${r.bodyFrames}`).join(' · '));
    const sh = REC.e.filter((r) => r.mode === 'sheet');
    ok(sh.every((r) => r.glRenders === 0), '② 시트 판(기준선)은 WebGL 렌더 0 — 벤치가 정말 시트로만 그렸다', sh.map((r) => r.glRenders).join(' · '));
    const S = r1.find((r) => r.mode === 'sheet'), M = r1.find((r) => r.mode === 'mesh');
    REC.e100 = { sheet: S && S.renderMs, mesh: M && M.renderMs, ratio: S && M ? +(M.renderMs / S.renderMs).toFixed(2) : null };
    console.log(`    [표] 몸 100 · 시트 ${REC.e100.sheet}ms · 메시 ${REC.e100.mesh}ms · 메시 ÷ 시트 ×${REC.e100.ratio}(카드 목표 ×2 안 — 적기만 · SwiftShader 는 GPU 가 CPU 다)`);
  }
  ok(B.errs.length === 0, 'ⓒ pageerror 0(켬)', B.errs.slice(0, 2).join(' | '));

  // ── ① [T539] 남의 몸 · 주민 — 시트가 고르던 그 자리에서 몸마다 모드 하나 ──
  console.log('\n① [T539] 남의 몸 · 주민 — 같은 문(`drawCharSprite` 층 고리)으로 3D · 시트 층은 타일의 판·행으로 얹는다');
  const recent = (PG) => PG.evaluate(() => { const d = window.__charDbg || {}, now = performance.now(), out = [];
    for (const k of Object.keys(d)) { const e = d[k]; if (e && e.on && !e.isMe && now - e.t < 400) out.push({ pid: k, job: e.job || null, mesh: !!e.mesh, full: !!e.meshFull, clip: e.clip, frame: e.frame, row: e.row, layers: (e.layers || []).slice(), speed: e.speed }); }
    return out; });
  const offP = await offOf(P);
  // 합성 맞대기(타일 자리 · 알파 > 127 — ⓑ·③ 과 같은 자) — 그 몸이 이번에 그린 판(클립·판·행·층)으로
  //   3D 몸(+ 온 메시면 가죽옷) + 나머지 시트 층 ↔ 시트 층 전부: 발밑 줄 Δ · 발 가운데 Δx · IoU
  const CHK = (list) => P.evaluate((L0) => {
    const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh, out = [];
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d', { willReadFrequently: true });
    const mk = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0; return o; };
    const st = (k) => { let y1 = -1, fx = 0, fn = 0; for (let i = 0; i < N; i++) if (k[i]) y1 = Math.max(y1, (i / fw) | 0);
      for (let i = 0; i < N; i++) if (k[i] && ((i / fw) | 0) >= y1 - 3) { fx += i % fw; fn++; } return { y1, fx: fn ? fx / fn : 0 }; };
    for (const e of L0) {
      const sheets = e.layers.map((L) => charSheet(L + '_' + e.clip));
      if (!sheets.every(Boolean)) { out.push({ pid: e.pid, skip: 'sheet' }); continue; }
      const sx = e.frame * fw, sy = e.row * fh, fullC = e.full && e.layers.includes('clothes_leather');
      g.clearRect(0, 0, fw, fh); e.layers.forEach((L, i) => { if (L !== 'band') g.drawImage(sheets[i], sx, sy, fw, fh, 0, 0, fw, fh); });
      const S = mk(g.getImageData(0, 0, fw, fh).data);
      const t = window.__char3d.snap(e.row, e.clip, e.frame, fullC);
      g.clearRect(0, 0, fw, fh); g.putImageData(new ImageData(new Uint8ClampedArray(t.data), fw, fh), 0, 0);
      e.layers.forEach((L, i) => { if (L !== 'body' && L !== 'band' && !(fullC && L === 'clothes_leather')) g.drawImage(sheets[i], sx, sy, fw, fh, 0, 0, fw, fh); });
      const M = mk(g.getImageData(0, 0, fw, fh).data);
      let I = 0, U = 0; for (let i = 0; i < N; i++) { if (S[i] && M[i]) I++; if (S[i] || M[i]) U++; }
      const a = st(S), b = st(M);
      out.push({ pid: e.pid, job: e.job, clip: e.clip, full: e.full, layers: e.layers.join('+'), bottom: b.y1 - a.y1, feetX: +(b.fx - a.fx).toFixed(2), iou: U ? +(I / U).toFixed(3) : 0 });
    }
    return out;
  }, list);
  // ①-a 남의 몸 — 둘째 접속 Q(손잡이 끔 · 제 화면은 시트)를 들판에 내 곁에 세우고 P 화면에서 Q 몸을 잰다
  //   바탕 = 같은 판에서 **Q 의 몸 층만** 뺀 것(그림자는 둔다 — 그림자는 두 판에 똑같이 들어 발밑 줄을 거저 맞춰 버린다)
  {
    const Q = await open('');
    const SP = FIELD;                                           // 마을 밖 들판(주민이 드문 자리 · ⓔ 와 같은 곳)
    let spot = null;
    for (let r = 0; r <= 6 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) {
      const x = SP.x + dx * 64, y = SP.y + r * 64;
      if (await tpTo(P, offP, x, y) && await tpTo(Q.page, await offOf(Q.page), x + 64, y - 64)) spot = { x, y };
    }
    await sleep(2500);
    // ★Q 의 pid 는 자리를 잡은 **뒤에** 읽는다 — 새 접속은 들어오며 한 번 다시 붙고 그때 pid 가 바뀐다(실측: 존 로그 `게스트 접속` 두 줄)
    const qpid = String(await Q.page.evaluate(() => myPid));
    const qPos = () => P.evaluate((qp) => { for (const c of conns.values()) { const o = c.others.get(qp); if (o) { const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0; const s2 = window.__w2s(ox + o.x, oy + o.y); return [Math.round(s2.px), Math.round(s2.py)]; } } return null; }, qpid);
    await P.waitForFunction((qp) => { const e = (window.__charDbg || {})[qp]; return !!(e && e.on && e.mesh && performance.now() - e.t < 400); }, qpid, { timeout: 20000 }).catch(() => {});
    // Q 의 시계를 멈춘다(서기도 숨을 쉰다) — 두 판이 같은 판을 그리게
    await P.evaluate((qp) => { const st = _charAnim.get(qp) || _charAnim.get(+qp); if (st) Object.defineProperty(st, 't', { get: () => 0, set: () => {}, configurable: true }); }, qpid);
    // Q 몸만 빼는 문 — 그 몸이면 그림자만 그리고 돌아간다(이름표는 이미 껐다 · 재는 판 전용)
    await P.evaluate(() => { window.__t539hide = null; if (!window.__t539wrap) { window.__t539wrap = true; const d0 = drawCharSprite;
      drawCharSprite = function (x, y, isMe, opts) { if (window.__t539hide && opts && String(opts.pid) === window.__t539hide) { if (!opts.carriedOn) drawCharShadow(x, y, !!opts.down); return true; } return d0.apply(this, arguments); }; } });
    await sleep(600);
    const q0 = (await recent(P)).find((e) => e.pid === qpid) || null;
    const qp = await qPos();
    let gM = null, gS = null, gB = null;
    if (qp && q0) {
      const grab = async () => PNG.sync.read(await P.screenshot({ clip: { x: qp[0] - 60, y: qp[1] - 90, width: 120, height: 100 } }));
      await P.evaluate(() => { window.__char3d.mode = 'mesh'; window.__t539hide = null; }); await sleep(700); gM = await grab();
      await P.evaluate(() => { window.__char3d.mode = 'sheet'; }); await sleep(700); gS = await grab();
      await P.evaluate((q) => { window.__char3d.mode = 'mesh'; window.__t539hide = q; }, qpid); await sleep(700); gB = await grab();
      await P.evaluate(() => { window.__t539hide = null; });
    }
    let scr = { bottom: null, feetX: null, iou: 0, px: [0, 0] }, tileC = null;
    if (gB) {
      const W = gM.width, H = gM.height, N = W * H;
      const dif = (a, b, i) => Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      const mk = (g) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = dif(g, gB, i * 4) > 8 ? 1 : 0; return o; };   // 바탕은 멈춰 있다(바람·비 끔)
      const mM = mk(gM), mS = mk(gS);
      const st = (k) => { let y1 = -1, fx = 0, fn = 0, n = 0; for (let i = 0; i < N; i++) if (k[i]) { n++; y1 = Math.max(y1, (i / W) | 0); }
        for (let i = 0; i < N; i++) if (k[i] && ((i / W) | 0) >= y1 - 3) { fx += i % W; fn++; } return { y1, fx: fn ? fx / fn : 0, n }; };
      let I = 0, U = 0; for (let i = 0; i < N; i++) { if (mM[i] && mS[i]) I++; if (mM[i] || mS[i]) U++; }
      const a = st(mS), b = st(mM);
      scr = { bottom: b.y1 - a.y1, feetX: +(b.fx - a.fx).toFixed(2), iou: U ? +(I / U).toFixed(3) : 0, px: [a.n, b.n], footY: a.y1 - 90 };
      tileC = (await CHK([q0]))[0] || null;
    }
    REC.one.other = { pid: qpid, spot, dbg: q0, screen: scr, tile: tileC, png: gM ? [gM, gS] : null };
    ok(!!(q0 && q0.mesh && !q0.job), '①-a 남의 몸(둘째 접속)이 3D 로 그려졌다 — 같은 문 · 몸마다 모드 하나', q0 ? JSON.stringify({ mesh: q0.mesh, full: q0.full, clip: q0.clip, layers: q0.layers }) : '안 보였다');
    ok(!!tileC && scr.px[0] > 300 && Math.abs(scr.bottom) <= 1 && Math.abs(scr.feetX) <= 1 && Math.abs(tileC.bottom) <= 1 && tileC.iou >= 0.95,
       '①-a ★남의 몸 발밑 ≤ 1px — 화면(그림자를 뺀 몸 화소)에서 3D 합성(3D 몸 + 시트 옷) ↔ 시트 합성 · 같은 판의 타일 자리 IoU ≥ 0.95',
       `화면 발밑 Δ ${scr.bottom}px(발밑 줄 = 앵커 ${scr.footY >= 0 ? '+' : ''}${scr.footY}) · 발 가운데 Δx ${scr.feetX}px · 화소 ${scr.px.join('/')} · 화면 IoU ${scr.iou}(적기만 — 시트 가장자리 반투명 고리가 화면 문턱에 잡힌다) · 타일 발밑 Δ ${tileC && tileC.bottom} · IoU ${tileC && tileC.iou}`);
    await Q.page.context().close();
  }
  // ①-b 주민 — 마을로 가서 주민이 그려지는 동안 표본을 모은다(하루 0.5초라 들고 난다): 그려진 주민이 3D 인가 ·
  //   처음 본 판마다 그 주민의 판(클립·판·행·층)으로 3D 합성 ↔ 시트 합성을 맞대 발밑 n/n
  // ⑤ 광장 그림 — 그려진 주민이 가장 많은 순간에 3D 판 · 시트 판을 붙여 찍는다(말풍선·이름표는 그림에서 뺀다)
  {
    await P.evaluate(() => { try { drawSpeechBubble = function () {}; } catch (e) { } });
    const seenN = new Map();           // pid → {job, n, mesh, chk}
    let bestShot = null, bestK = 0;
    await tpTo(P, offP, vx, vy);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      await sleep(700);
      const rs = (await recent(P)).filter((e) => e.job);
      for (const e of rs) { let v = seenN.get(e.pid); if (!v) { v = { job: e.job, n: 0, mesh: 0, chk: null }; seenN.set(e.pid, v); } v.n++; if (e.mesh) v.mesh++; }
      const todo = rs.filter((e) => e.mesh && !seenN.get(e.pid).chk);
      if (todo.length) for (const r of await CHK(todo)) { const v = seenN.get(r.pid); if (v) v.chk = r; }
      // ⑤ — 그려진 주민이 가장 많을 때 두 장(3D → 시트 · 0.25초 사이)
      if (rs.length > bestK && rs.length >= 3) {
        bestK = rs.length;
        const fM = PNG.sync.read(await P.screenshot());
        // 그려진 주민만(집 안·안개 속 주민은 `__getNpcs` 엔 있어도 화면엔 없다) — 그 발밑 화면 자리
        const npcScr = await P.evaluate((pids) => (window.__getNpcs ? window.__getNpcs() : []).filter((q) => pids.includes(String(q.pid))).map((q) => { const s2 = window.__w2s(q.wx, q.wy); return [Math.round(s2.px), Math.round(s2.py), q.job]; }), rs.map((e) => String(e.pid)));
        await P.evaluate(() => { window.__char3d.mode = 'sheet'; }); await sleep(150);
        const fS = PNG.sync.read(await P.screenshot());
        await P.evaluate(() => { window.__char3d.mode = 'mesh'; });
        bestShot = { frames: [fM, fS], npcScr, drawn: rs.length, mesh: rs.filter((e) => e.mesh).length };
      }
      const checked = [...seenN.values()].filter((v) => v.chk && !v.chk.skip).length;
      const multiN = [...seenN.values()].filter((v) => v.n >= 3).length;   // 여러 판 이어 본 주민(한 판만 본 것은 "계속 3D" 를 못 댄다)
      if (checked >= 6 && multiN >= 5 && (bestK >= 10 || Date.now() - t0 > 30000)) break;   // 그림은 30초 안에서 가장 많이 그려진 판
      // 그려진 주민이 적으면 주민이 몰린 곳으로 옮긴다(`__getNpcs` 자리 · 반경 8칸에 가장 많은 점)
      if (rs.length < 3 && ((Date.now() - t0) / 700 | 0) % 6 === 5) {
        const tgt = await P.evaluate((o) => { const n = window.__getNpcs ? window.__getNpcs() : []; let best = null;
          for (const q of n) { const k = n.filter((r) => Math.hypot(r.wx - q.wx, r.wy - q.wy) < 256).length; if (!best || k > best.k) best = { k, x: Math.round(q.wx - o[0]), y: Math.round(q.wy - o[1]) }; } return best; }, offP);
        if (tgt) await tpTo(P, offP, tgt.x + 48, tgt.y + 48);
      }
    }
    const all = [...seenN.values()];
    const multi = all.filter((v) => v.n >= 3);
    const chk = all.map((v) => v.chk).filter((r) => r && !r.skip);
    const good = chk.filter((r) => Math.abs(r.bottom) <= 1 && r.iou >= 0.95);
    REC.one.npc = { distinct: all.length, multi: multi.length, meshAll: multi.filter((v) => v.mesh >= v.n - 1).length, checked: chk.length, good: good.length,
                    jobs: [...new Set(all.map((v) => v.job))], rows: chk };
    console.log('    [표] 주민 · 클립 · 층 · 온메시 · 발밑 Δ · 발 가운데 Δx · IoU');
    for (const r of chk.slice(0, 14)) console.log(`      ${r.job} · ${r.clip} · ${r.layers} · ${r.full ? '○' : '-'} · ${r.bottom} · ${r.feetX} · ${r.iou}`);
    ok(multi.length >= 3 && REC.one.npc.meshAll === multi.length, `①-b 세 표본(0.7초 간격) 넘게 그려진 주민 ${multi.length}명이 전부 3D(처음 보인 한 판만 시트 — 타일이 한 판 늦다 · 직업 ${REC.one.npc.jobs.join(',')})`,
       `3D ${REC.one.npc.meshAll}/${multi.length} · 본 주민 ${all.length}`);
    ok(chk.length >= 3 && good.length === chk.length, `①-b ★주민 발밑 ≤ 1px — 제 판(클립·판·행)의 3D 몸 + 시트 층 ↔ 시트 합성 ${good.length}/${chk.length}`,
       chk.filter((r) => !good.includes(r)).map((r) => `${r.job}:${r.clip}(${r.bottom}/${r.iou})`).join(' ') || '어긋남 0');
    REC.five = bestShot ? { frames: bestShot.frames, npcScr: bestShot.npcScr, drawn: bestShot.drawn, mesh: bestShot.mesh } : {};
    ok(!!bestShot && bestShot.drawn >= 3, `⑤ [T539] 마을 광장 — 그려진 주민 ${bestShot ? bestShot.drawn : 0}명(3D ${bestShot ? bestShot.mesh : 0}) · 3D 판 · 시트 판 두 장(그림)`);
  }
  ok(B.errs.length === 0, '① pageerror 0(켬 · 남의 몸·주민)', B.errs.slice(0, 2).join(' | '));

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
  // ── 그림 — T539 산그림(한 장 · 캡션 · 같은 브라우저로 그린다 · 화소 그대로 · 확대는 계단식) ──
  if (OUTPNG) {
    const crop = (png, cx, cy, w, h) => { const o = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(png.width - 1, Math.max(0, cx - (w >> 1) + x)), sy = Math.min(png.height - 1, Math.max(0, cy - (h >> 1) + y)); png.data.copy(o.data, (y * w + x) * 4, (sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4); } return o; };
    const uri = (png) => 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
    const im = (png, z, cap) => `<figure><img src="${uri(png)}" width="${png.width * z}" height="${png.height * z}">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
    const E = (n, m) => REC.e.find((r) => r.N === n && r.mode === m) || {};
    const onBg = (arr, fw, fh) => { const o = new PNG({ width: fw, height: fh }); for (let i = 0; i < fw * fh * 4; i += 4) { const a = arr[i + 3] / 255; o.data[i] = Math.round(arr[i] * a + 70 * (1 - a)); o.data[i + 1] = Math.round(arr[i + 1] * a + 84 * (1 - a)); o.data[i + 2] = Math.round(arr[i + 2] * a + 62 * (1 - a)); o.data[i + 3] = 255; } return o; };
    const sec = [];
    // ⑤ 마을 광장 — 같은 자리 3D 판 · 시트 판
    if (REC.five.frames) {
      const [fM, fS] = REC.five.frames, ps = REC.five.npcScr || [];
      const mx = ps.length ? ps.reduce((s, q) => s + q[0], 0) / ps.length : VW >> 1, my = ps.length ? ps.reduce((s, q) => s + q[1], 0) / ps.length - 30 : (VH >> 1) - 10;
      const cx = Math.round(Math.max(310, Math.min(VW - 310, mx))), cy = Math.round(Math.max(210, Math.min(VH - 210, my)));   // 그려진 주민 무게중심에 판을 댄다
      sec.push(`<section><h2>⑤ 마을 광장 — 주민 3D 여럿 + 시트 옷·도구 층 · 같은 자리 시트 판 나란히 <b>(그려진 주민 ${REC.five.mesh}/${REC.five.drawn} 3D)</b></h2>
        <div class="row">${im(crop(fM, cx, cy, 620, 420), 1, '3D — 몸은 메시 · 옷·도구·등짐은 시트 그대로(타일의 판·행)')}${im(crop(fS, cx, cy, 620, 420), 1, '시트 — 같은 자리(주민이 걸어 다녀 두 장 사이 0.15초)')}</div></section>`);
      // 주민이 가장 많이 모인 점 — 확대 ×2
      const pts = (REC.five.npcScr || []).filter((q) => q[0] > 140 && q[0] < VW - 140 && q[1] > 110 && q[1] < VH - 70);
      let best = null; for (const q of pts) { const k = pts.filter((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 110).length; if (!best || k > best.k) best = { q, k }; }
      if (best) sec.push(`<section><h2>⑤ 확대 ×2 — 주민 ${best.k}명 둘레</h2><div class="row">${im(crop(fM, best.q[0], best.q[1] - 30, 280, 180), 2, '3D')}${im(crop(fS, best.q[0], best.q[1] - 30, 280, 180), 2, '시트')}</div></section>`);
    }
    // ① 남의 몸 — 3D 합성 ↔ 시트 합성
    if (REC.one.other && REC.one.other.png) {
      const [gM, gS] = REC.one.other.png, o = REC.one.other;
      sec.push(`<section><h2>① 남의 몸(둘째 접속 · 삼베옷) — 화면 합성 3D ↔ 시트 <b>(화면 발밑 Δ ${o.screen.bottom}px · 발 가운데 Δx ${o.screen.feetX}px · 타일 IoU ${o.tile ? o.tile.iou : '-'})</b></h2>
        <div class="row">${im(gM, 3, '3D 몸 + 시트 삼베옷 × 3')}${im(gS, 3, '시트 몸 + 시트 삼베옷 × 3')}</div></section>`);
    }
    // ③ 클립 열둘 — 방향 1 · 가운데 판 · 3D 몸 + 삼베옷 ↔ 시트
    if (REC.clips.length && REC.clips[0].thumbs) {
      const cells = REC.clips.map((r) => r.thumbs ? `<div class="pair">${im(onBg(r.thumbs.m, r.thumbs.fw, r.thumbs.fh), 1)}${im(onBg(r.thumbs.s, r.thumbs.fw, r.thumbs.fh), 1)}<figcaption>${r.name} ${r.thumbs.f}판 · ${r.fits ? '○' : '×'} IoU ${r.minC}</figcaption></div>` : '').join('');
      sec.push(`<section><h2>③ 클립 열둘 — 전부 내보냈다 · 방향 1 가운데 판(왼쪽 3D 몸 + 시트 삼베옷 · 오른쪽 시트) <b>(8방향 × 판 전부 발밑 ≤ 1px)</b></h2><div class="grid">${cells}</div></section>`);
    }
    // ② 몸 100 — 같은 자리 · 시트 / 메시
    if (fs.existsSync('/tmp/e2e-char3d-bench-mesh.png') && fs.existsSync('/tmp/e2e-char3d-bench-sheet.png')) {
      const bs = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-sheet.png')), bm = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-mesh.png'));
      const M = E(100, 'mesh');
      sec.push(`<section><h2>② 몸 100 — 장면 한 번(WebGL 렌더 ${M.glRenders}번 / 3D 판 ${M.bodyFrames}) <b>(SwiftShader 렌더 시트 ${E(100, 'sheet').renderMs}ms / 메시 ${M.renderMs}ms)</b></h2>
        <div class="row">${im(crop(bs, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `시트 — 몸 1 · 10 · 100 = ${E(1, 'sheet').renderMs} · ${E(10, 'sheet').renderMs} · ${E(100, 'sheet').renderMs} ms`)}${im(crop(bm, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `메시 — ${E(1, 'mesh').renderMs} · ${E(10, 'mesh').renderMs} · ${M.renderMs} ms · 그리기 호출 ${M.calls}`)}</div></section>`);
    }
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#1b1f1b;color:#e6e9e3;font:15px 'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif}
      .w{padding:22px;display:grid;gap:22px;width:max-content}
      h1{margin:0;font-size:20px;font-weight:700}
      section{display:grid;gap:8px} h2{margin:0;font-size:16px;font-weight:600} h2 b{color:#e0b074;font-weight:600}
      .row{display:flex;gap:10px;align-items:flex-start} figure{margin:0;display:grid;gap:4px}
      .grid{display:grid;grid-template-columns:repeat(6,max-content);gap:10px 14px} .pair{display:grid;grid-template-columns:repeat(2,max-content);gap:2px}
      .pair figcaption{grid-column:1/3}
      img{image-rendering:pixelated;display:block;border:1px solid #3a423a} figcaption{font-size:12.5px;color:#b7bfb4}
      .num{font-family:'Noto Sans Mono CJK KR',monospace}
    </style><div class="w">
      <h1>T539 — 3D 둘째: 남의 몸 · 주민 · 장면 한 번 · 클립 나머지 (손잡이 <span class="num">/?T522_CHAR_3D=1</span> · 끔이 기본)</h1>
      ${sec.join('\n')}
    </div>`;
    const pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })).newPage();
    await pg.setContent(html, { waitUntil: 'load' });
    await pg.screenshot({ path: OUTPNG, fullPage: true });
    const sz = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    console.log('→', OUTPNG, `${sz[0]}x${sz[1]}`);
  }
  await browser.close();
  if (OUTJSON) { const r = JSON.parse(JSON.stringify(REC, (k, v) => (['turnPng', 'png', 'frames', 'thumbs'].includes(k) ? undefined : v))); fs.writeFileSync(OUTJSON, JSON.stringify(r, null, 1)); }
  console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
