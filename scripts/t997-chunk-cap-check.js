#!/usr/bin/env node
// === scripts/t997-chunk-cap-check.js — 산 청크 캐시 260 상한 통째 비우기가 그림을 깜빡이게 하나(T997 ②) — 계측 자 · 러너 밖 =============================
//
//   실클라 하나(`E2E_BROWSER` — 기본 chromium · `webkit`) · 존 env 그대로(T997 켬 기본 — welcome 칸을 적는다) · 한반도 한 존.
//   갈고리(그림 무접촉 — 적기만 한다):
//     · 산 청크 캐시 `_mt3Chunk`(11-r1-mountain) 객체의 `clear` 를 감싸 부른 자리를 호출 더미로 가른다 — `_mt3Bake` = 260 상한(`if (_mt3Chunk.size > 260)`) ·
//       `_mt3Collect` = 존 바뀜 · 그 밖 = 이 계측 자(ⓐ) · 손잡이. 비우기 앞 청크 수 · 캐시가 든 띠 수 · 띠 캔버스 장 수 · 넓이(같은 캔버스는 한 번)를 적는다.
//     · 판마다(rAF — 게임 판 `loop` 뒤에 불린다 · 둘 다 판 끝에 다음 판을 건다) 그린 산 띠 수(`__mtDbg.segs` = 그 판 `_mt3Collect` 가 낸 수) · 청크 캐시 수 ·
//       굽는 중 청크 수 · 산 굽기 수 · 카메라(`myAbsRender`).
//     · 상한 비우기가 난 판 · 다음 판 · 열하나째 판에 본 캔버스를 그 판에서 뜬다(ⓐ 는 비운 다음 판 · 열째 판).
//   ⓐ 다잡은 견줌 — e2e-mtcut 산 자리 (2150,1959)에 서서 다 구운 뒤 화면 A → 260 상한 줄과 같은 글자로 비운다(`_mt3Chunk.clear(); _mt3Jobs.clear()`)
//      → 선 채 다 구울 때까지 판마다 적고 → 다 구운 뒤 화면 B. 견줌 = A ↔ 다음 판 · A ↔ 열째 판 · A ↔ B(바이트로 같은가).
//   ⓑ · ⓒ 존 안에서 넓게 걷기 — 걷는 빠르기(존 `MOVE_SPEED` 64px/s = 1초에 2칸) 그대로 워프 걸음(걸음 칸이 막혔으면 클라 정본 `isTerrainBlockedAtAbs` 로 둘레 3칸 안
//      가까운 칸 · 다 막혔으면 그 걸음을 건너뛴다 · 1분마다 몸 채움):
//      ⓑ 곧은 길 — 산 자리에서 바위 무더기들(t970-cut-near-check CENTERS 와 같은 식 — 정본 바위 술어 `isRockCellLocal` · 48칸 격자 · 7×7 표본 바위 20 이상 ·
//         존 가운데에서 가까운 차례 · 앞 것들과 300칸 넘게)을 잇는 선 — 상한 비우기 1번 · 6분 중 먼저.
//      ⓒ 능선 옆 — 산 자리 능선의 서쪽 기슭(정본 바위 술어 — 걸음마다 y 2칸 · 앞 기슭 −30 ~ +80 칸에서 서쪽 첫 바위 칸 · 한 걸음 2칸 넘게 안 옮김 · 선 칸 = 기슭 − 3)을
//         북끝(칸 y 1344)에서 남끝(3200)으로 — 산이 화면에 있는 채 상한에 닿는 길 · 상한 비우기 `--caps`(기본 3)번 · `--walk-min`(기본 15)분 중 먼저.
//      260 상한 비우기가 나면 그 자리에 서서 다 구울 때까지 판마다 적고 다 구운 뒤 화면을 떠 그 비우기의 판 화면과 견준 뒤 다시 걷는다.
//   견줌 = 비우기마다 앞 판 그린 산 띠 · 비운 판 · 다음 판 · 0 인 판 수 · 앞 판의 반 아래인 판 수 · 앞 판 수로 돌아오기까지 판 수 · 시간 · 화면 |Δ|(다 구운 뒤 ↔ 판들)
//     · 걷는 동안 여느 판(비우기 뒤 선 채 다 구운 창 · 길 첫 자리 워프 밖)에서 그린 띠가 바로 앞 30판 가운데값의 반 아래로 떨어진 판 수(걸음 끝 새 청크 ·
//       창을 떠난 청크 몫 — 바닥) · 그 가운데 카메라 뜀(막힌 걸음을 건너뛴 뒤 걸음 하나보다 먼 걸음 — 워프 꼴) 뒤로 다 구운 판이 없던 것은 따로 센다.
//   걸음 열마다 `heldLog` — [길 · 분 · 걸음 · 청크 수 · 장 수 · 넓이 · 굽는 중 · 서버 칸 · 그린 띠 · 렌더러(웹 프로세스) RSS MB(ps)].
//   결정론 고정 — 물 · 바람 시각(`__terrain19.freezeT` · `windOff`) · 비 0 · 해 몫 한낮(1초마다) · 같은 자리 · 같은 길.
// 실행: [E2E_BROWSER=webkit] node scripts/t997-chunk-cap-check.js [--out /tmp/t997/cap] [--caps 3] [--walk-min 15]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t997/cap'); fs.mkdirSync(OUT, { recursive: true });
const NCAP = +arg('--caps', '3');
const WALK_MIN = +arg('--walk-min', '15');
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t997c-c-${process.pid}.db`, ZDB = `/tmp/t997c-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 렌더러(웹 프로세스) RSS MB — ps 한 번(t926-mem-hour `rss()` 와 같은 가름)
function rendRss() {
  let txt = ''; try { txt = execFileSync('ps', ['-eo', 'pid=,rss=,args='], { encoding: 'utf8', maxBuffer: 16 << 20 }); } catch (e) { return null; }
  let kb = 0;
  for (const line of txt.split('\n')) { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (!m) continue;
    if (/WebKitWebProcess/.test(m[3]) || (/\/chrome-linux\/chrome( |$)|headless_shell/.test(m[3]) && /--type=renderer/.test(m[3]))) kb += +m[2]; }
  return kb ? Math.round(kb / 1024) : null;
}
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });
const { PNG } = require('pngjs');
const readPng = (f) => PNG.sync.read(fs.readFileSync(f));
function pdiff(fa, fb) {
  const a = readPng(fa), b = readPng(fb);
  if (a.width !== b.width || a.height !== b.height) return { err: '크기 다름' };
  let sum = 0, big = 0, n = 0, px = 0;
  for (let i = 0; i < a.data.length; i += 4) { const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; sum += d; if (d > 24) big++; if (d > 0 || a.data[i + 3] !== b.data[i + 3]) px++; n++; }
  return { meanAbs: +(sum / n).toFixed(3), bigPct: +(100 * big / n).toFixed(3), px, bytesSame: fs.readFileSync(fa).equals(fs.readFileSync(fb)) };
}
// 판마다 적는 줄 — [판, 시각 ms, 그린 산 띠, 청크 캐시 수, 굽는 중 수, 산 굽기 수, 카메라 x, y]
const F_FR = 0, F_T = 1, F_SEG = 2, F_CH = 3, F_JOB = 4, F_BAKE = 5, F_CX = 6, F_CY = 7;
const HOOK = () => {
  if (window.__t997) return true;
  const T = window.__t997 = { f: 0, rows: [], clears: [], grabAt: [], grabs: {} };
  const C = _mt3Chunk;
  C.clear = function () {
    const st = String((new Error()).stack || '');
    const src = /_mt3Bake/.test(st) ? 'cap' : /_mt3Collect/.test(st) ? 'zone' : 'other';
    const seen = new Set(); let px = 0, segs = 0;
    for (const a of this.values()) if (Array.isArray(a)) for (const sg of a) { segs++; if (sg && sg.img && !seen.has(sg.img)) { seen.add(sg.img); px += sg.img.width * sg.img.height; } }
    T.clears.push({ fr: T.f, size: this.size, src, segs, cvN: seen.size, px, jobs: _mt3Jobs.size, t: Math.round(performance.now()) });
    if (src === 'cap') T.grabAt.push([T.f + 1, 'cap0'], [T.f + 2, 'cap1'], [T.f + 11, 'cap10']);
    return Map.prototype.clear.call(this);
  };
  const tick = () => {
    T.f++;
    const d = window.__mtDbg || {};
    const cam = (typeof myAbsRender !== 'undefined' && myAbsRender) ? myAbsRender : null;
    T.rows.push([T.f, Math.round(performance.now()), d.segs | 0, d.mt3chunks | 0, _mt3Jobs.size, d.mt3bakeN | 0, cam ? Math.round(cam.x) : null, cam ? Math.round(cam.y) : null]);
    while (T.grabAt.length && T.grabAt[0][0] <= T.f) {
      const [fr, tag] = T.grabAt.shift();
      try { T.grabs[tag + '@' + fr] = { f: T.f, cam: cam ? [Math.round(cam.x), Math.round(cam.y)] : null, segs: d.segs | 0, url: document.getElementById('canvas').toDataURL('image/png') }; } catch (e) { T.grabs[tag + '@' + fr] = { err: String(e).slice(0, 120) }; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
};

(async () => {
  console.log(`\n=== T997 산 청크 캐시 260 상한 통째 비우기 — 브라우저 ${BR} · 상한 비우기 ${NCAP}번 · 걷기 ${WALK_MIN}분 ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(3000);
  const welcome = await page.evaluate(() => { const o = {}; for (const k of ['mtBand', 'cutNear', 'mtNear']) o[k] = (k in uiCfg) ? uiCfg[k] : '(칸 없음)'; return o; });
  console.log(`  · welcome ${JSON.stringify(welcome)}(존 env T970_CUT_NEAR ${process.env.T970_CUT_NEAR == null ? '없음' : process.env.T970_CUT_NEAR} · T981_MT_NEAR ${process.env.T981_MT_NEAR == null ? '없음' : process.env.T981_MT_NEAR})`);
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; if (window.__rainForce) window.__rainForce({ precip: 0 });
    setInterval(() => { try { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs; const p = (((0.5 * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; } catch (e) {} }, 1000);
    return true;
  });
  const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
  const srvCell = () => page.evaluate(() => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
    return a ? [Math.floor((a.x - (z2.worldOffsetX || 0)) / 32), Math.floor((a.y - (z2.worldOffsetY || 0)) / 32)] : null; });
  const tpTo = async (cx, cy, rMax = 8) => {   // 서버가 막힌 칸이면 거절한다 — 둘레를 가까운 칸부터(t970-cut-near-check 와 같은 식)
    const ring = [[0, 0]]; for (let r = 1; r <= rMax; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    for (const [dx, dy] of ring) {
      const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16; await tp(x, y);
      for (let i = 0; i < 8; i++) { await sleep(700); const s = await srvCell(); if (s && Math.abs(s[0] - (cx + dx)) <= 2 && Math.abs(s[1] - (cy + dy)) <= 2) return [cx + dx, cy + dy]; }
    }
    return null;
  };
  const feed = () => page.evaluate(() => { window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, quiet: true }); return true; });
  const grab = async (f) => { const u = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png')); fs.writeFileSync(f, Buffer.from(String(u).split(',')[1], 'base64')); return f; };
  // 판 줄 · 비우기 · 뜬 화면을 페이지에서 가져온다(페이지 쪽은 비운다)
  const ROWS = [], CLEARS = [], GRABS = {};
  const pull = async () => {
    const o = await page.evaluate(() => { const T = window.__t997; const r = T.rows.splice(0), g = T.grabs; T.grabs = {}; return { r, c: T.clears.length, g }; });
    for (const x of o.r) ROWS.push(x);
    for (const [k, v] of Object.entries(o.g)) {
      if (v.url) { const f = path.join(OUT, `${BR}-${k.replace('@', '-')}.png`); fs.writeFileSync(f, Buffer.from(String(v.url).split(',')[1], 'base64')); GRABS[k] = { f: v.f, cam: v.cam, segs: v.segs, file: f }; }
      else GRABS[k] = v;
    }
    if (o.c > CLEARS.length) { const add = await page.evaluate((n) => window.__t997.clears.slice(n), CLEARS.length); for (const x of add) CLEARS.push(x); }
  };
  // 다 구울 때까지 — 산 굽기 수 · 굽는 중 청크 · 그린 띠 · 지면 굽기가 네 번(0.5초마다) 연달아 그대로 · 굽는 중 0
  const settle = async (capMs = 180000) => { const t0 = Date.now(); await sleep(1500); let last = '', same = 0;
    while (Date.now() - t0 < capMs && same < 4) { await sleep(500);
      const n = await page.evaluate(() => (window.__mtDbg ? window.__mtDbg.mt3bakeN + ':' + window.__mtDbg.segs : '-') + ':' + _mt3Jobs.size + ':' + (window.__groundDbg ? window.__groundDbg.baked : 0));
      const jobs0 = n.split(':')[2] === '0';
      if (n === last && jobs0) same++; else same = 0; last = n; await pull(); }
    return { ms: Date.now() - t0, ok: same >= 4 }; };
  // 캐시가 든 것 — 청크 수 · 띠 수 · 띠 캔버스 장 수 · 넓이(같은 캔버스는 한 번)
  const held = () => page.evaluate(() => { const seen = new Set(); let px = 0, segs = 0; for (const a of _mt3Chunk.values()) if (Array.isArray(a)) for (const sg of a) { segs++; if (sg && sg.img && !seen.has(sg.img)) { seen.add(sg.img); px += sg.img.width * sg.img.height; } }
    return { size: _mt3Chunk.size, segs, cvN: seen.size, px, jobs: _mt3Jobs.size }; });
  // 비우기 하나 — 그 판 앞뒤 판 줄로 센다. c0 = 비운 판(상한 = 그 판 `_mt3Collect` 도중에 비워 앞쪽 청크는 이미 실렸다 · ⓐ = 판 사이에 비워 c0 = 비운 다음 판) ·
  //   c1 = 빈 캐시로 처음부터 그린 판(상한 = c0 + 1 · ⓐ = c0) · pre = 비우기 앞 판 그린 띠.
  //   back = c1 부터 그린 띠가 pre 에 닿은 첫 판(c0 에서 센 판 수) · backS = 다 구운 뒤 수(endSegs)에 닿은 첫 판 · zero · low = c1 ~ back 앞에서 0 인 판 · pre 의 반 아래인 판
  const windowStats = (c0, c1, pre, endFr) => {
    const rs = ROWS.filter((r) => r[F_FR] >= c0 && r[F_FR] <= endFr);
    const endSegs = rs.length ? rs[rs.length - 1][F_SEG] : null, t0 = rs.length ? rs[0][F_T] : null;
    let zero = 0, low = 0, back = null, backMs = null, backS = null, backSMs = null;
    for (const r of rs) {
      if (r[F_FR] < c1) continue;
      if (back == null) { if (r[F_SEG] === 0) zero++; if (r[F_SEG] < pre * 0.5) low++; if (r[F_SEG] >= pre) { back = r[F_FR] - c0; backMs = r[F_T] - t0; } }
      if (backS == null && endSegs != null && r[F_SEG] >= endSegs) { backS = r[F_FR] - c0; backSMs = r[F_T] - t0; }
    }
    const seq = rs.slice(0, 12).map((r) => r[F_SEG]);
    const cams = new Set(rs.map((r) => r[F_CX] + ',' + r[F_CY]));
    return { frames: rs.length, zero, low, back, backMs, backS, backSMs, first12: seq, endSegs, endCam: rs.length ? [rs[rs.length - 1][F_CX], rs[rs.length - 1][F_CY]] : null, camN: cams.size,
      ms: rs.length ? rs[rs.length - 1][F_T] - t0 : null };
  };
  await page.evaluate(HOOK);
  const res = { browser: BR, welcome, args: { caps: NCAP, walkMin: WALK_MIN }, ctl: null, walk: null, caps: [], other: [], normal: null, heldLog: [] };
  // ── ⓐ 다잡은 견줌 — 산 자리 ─────────────────────────────────────────────
  await feed();
  const at = await tpTo(2150, 1959); await settle();
  await pull();
  const fA = await grab(path.join(OUT, `${BR}-ctl-A.png`));
  const hA = await held();
  const preA = ROWS.length ? ROWS[ROWS.length - 1][F_SEG] : null;
  const frA = await page.evaluate(() => { const T = window.__t997; T.grabAt.push([T.f + 1, 'ctl1'], [T.f + 10, 'ctl10']); _mt3Chunk.clear(); _mt3Jobs.clear(); return T.f; });   // 260 상한 줄과 같은 글자
  const stA = await settle(); await pull();
  const fB = await grab(path.join(OUT, `${BR}-ctl-B.png`));
  const endA = ROWS.length ? ROWS[ROWS.length - 1][F_FR] : frA;
  const wA = windowStats(frA + 1, frA + 1, preA, endA);
  const g1 = GRABS['ctl1@' + (frA + 1)], g10 = GRABS['ctl10@' + (frA + 10)];
  res.ctl = { at, heldBefore: hA, pre: preA, settle: stA, win: wA, cmp: { A_B: pdiff(fA, fB), A_next: g1 && g1.file ? pdiff(fA, g1.file) : null, A_10: g10 && g10.file ? pdiff(fA, g10.file) : null },
    grabs: { next: g1 ? { f: g1.f, cam: g1.cam, segs: g1.segs } : null, ten: g10 ? { f: g10.f, cam: g10.cam, segs: g10.segs } : null }, shots: [fA, fB] };
  console.log(`  · ⓐ 산 자리 ${JSON.stringify(at)} · 캐시 ${hA.size}청크 ${hA.segs}띠 ${hA.cvN}장 ${(hA.px / 1e6).toFixed(2)}M화소 · 그린 띠 ${preA} → 비운 다음 판 ${g1 && g1.segs} · 0 인 판 ${wA.zero} · 반 아래 판 ${wA.low} · 돌아오기 ${wA.back}판 ${wA.backMs}ms | ` +
    `A↔다음 판 ${JSON.stringify(res.ctl.cmp.A_next)} · A↔B ${JSON.stringify(res.ctl.cmp.A_B)}`);
  fs.writeFileSync(path.join(OUT, `${BR}-chunkcap.json`), JSON.stringify(res, null, 1));
  // ── ⓑ · ⓒ 존 안에서 넓게 걷기 ─────────────────────────────────────────
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config')); const TR = require(path.join(ROOT, 'server', 'terrain')); if (TR.setZonesMeta) TR.setZonesMeta(ZONES);
  const rockC = (x, y) => TR.isRockCellLocal('hanbando', x * 32 + 16, y * 32 + 16);
  //   ⓑ 곧은 길 — 산 자리 → 바위 무더기들(t970-cut-near-check CENTERS 와 같은 식) 잇는 선 · 2칸 걸음
  const CENTERS = [['산', { cx: 2150, cy: 1959 }]];
  {
    const Z = ZONES.hanbando, W = Math.floor(Z.zoneWidth / 32), H = Math.floor(Z.zoneHeight / 32), cand = [];
    for (let cy = 200; cy < H - 200; cy += 48) for (let cx = 200; cx < W - 200; cx += 48) {
      let n = 0; for (let dy = -9; dy <= 9; dy += 3) for (let dx = -9; dx <= 9; dx += 3) if (rockC(cx + dx, cy + dy)) n++;
      if (n >= 20) cand.push([cx, cy, Math.hypot(cx - W / 2, cy - H / 2)]);
    }
    cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const [cx, cy] of cand) { if (CENTERS.length >= 7) break; if (CENTERS.every(([, v]) => Math.hypot(v.cx - cx, v.cy - cy) > 300)) CENTERS.push([`바위${cx}_${cy}`, { cx, cy }]); }
  }
  const lineRoute = [];
  for (let li = 1; li < CENTERS.length; li++) { const A = CENTERS[li - 1][1], B = CENTERS[li][1], n = Math.ceil(Math.hypot(B.cx - A.cx, B.cy - A.cy) / 2);
    for (let s2 = 1; s2 <= n; s2++) lineRoute.push([Math.round(A.cx + (B.cx - A.cx) * s2 / n), Math.round(A.cy + (B.cy - A.cy) * s2 / n), li]); }
  //   ⓒ 능선 옆 — 산 자리 능선(정본 바위 술어)의 서쪽 기슭을 북끝(칸 y 1344 — 그 위 서쪽 갈래 줄은 뺀다)에서 남끝(3200)까지 · 걸음마다 y 2칸 · 기슭 x = 앞 기슭 −30 ~ +80 칸에서 서쪽 첫 바위 칸
  //      (한 걸음에 2칸 넘게 안 옮긴다 — 걷는 빠르기) · 선 칸 = 기슭 − 3
  const ridgeRoute = [];
  { let xe = null; for (let y = 1344; y <= 3200; y += 2) { const from = xe == null ? 2050 : xe - 30, to = xe == null ? 2300 : xe + 80; let e = null;
      for (let x = from; x <= to; x++) if (rockC(x, y)) { e = x; break; }
      if (e == null) e = xe; if (e == null) continue;
      xe = xe == null ? e : xe + Math.max(-2, Math.min(2, e - xe)); ridgeRoute.push([xe - 3, y, 0]); } }
  console.log(`  · ⓑ 곧은 길: ${CENTERS.map(([n]) => n).join(' → ')} (${lineRoute.length}걸음) · ⓒ 능선 옆: (${ridgeRoute[0]}) → (${ridgeRoute[ridgeRoute.length - 1]}) ${ridgeRoute.length}걸음`);
  const stepTo = (cx, cy) => page.evaluate(([cx0, cy0]) => {
    const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}, ox = z2.worldOffsetX || 0, oy = z2.worldOffsetY || 0;
    const ring = [[0, 0]]; for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    for (const [dx, dy] of ring) { const x = (cx0 + dx) * 32 + 16, y = (cy0 + dy) * 32 + 16;
      if (typeof isTerrainBlockedAtAbs === 'function' && isTerrainBlockedAtAbs(ox + x, oy + y)) continue;
      window.__sendPrimary({ type: 'teleport_debug', x, y }); return [cx0 + dx, cy0 + dy]; }
    return null;
  }, [cx, cy]);
  const frW0 = await page.evaluate(() => window.__t997.f);   // 걷기 첫 판(여느 판 셈은 여기부터)
  const capDone = new Set(), capWin = [];
  let lastFeed = Date.now();
  const walkRoute = async (name, route, start, maxCaps, maxMin) => {
    const frTp = await page.evaluate(() => window.__t997.f);
    await feed(); const st0 = await tpTo(start[0], start[1], 4); await settle(); await pull();
    const W = { name, start: st0, steps: 0, skipped: 0, cells: 0, min: 0, caps: 0, routeSteps: route.length, fr0: await page.evaluate(() => window.__t997.f) };
    capWin.push([frTp, W.fr0]);   // 길 첫 자리로 가는 워프 · 다 굽기는 여느 판 셈에서 뺀다
    const t0 = Date.now(); let lastHeld = 0, prevCell = st0 || start;
    for (const [cx, cy, li] of route) {
      const got = await stepTo(cx, cy);
      if (got) { W.steps++; W.cells += Math.hypot(got[0] - prevCell[0], got[1] - prevCell[1]); prevCell = got; } else W.skipped++;
      await sleep(1000);
      await pull();
      if (Date.now() - lastFeed > 60000) { await feed(); lastFeed = Date.now(); }
      if (W.steps - lastHeld >= 10) { lastHeld = W.steps; const h = await held(); res.heldLog.push([name, +((Date.now() - t0) / 60000).toFixed(2), W.steps, h.size, h.cvN, h.px, h.jobs, await srvCell(), (ROWS.length ? ROWS[ROWS.length - 1][F_SEG] : null), rendRss()]); }
      const newCaps = CLEARS.filter((e) => e.src === 'cap' && !capDone.has(e.fr));
      for (const ev of newCaps) {
        capDone.add(ev.fr); W.caps++;
        const c0 = ev.fr + 1;   // 비운 판(그 판 `_mt3Collect` 안에서 비웠다)
        const preRow = ROWS.find((r) => r[F_FR] === ev.fr);
        const pre = preRow ? preRow[F_SEG] : null;
        const st = await settle(); await pull();
        const fS = await grab(path.join(OUT, `${BR}-cap${res.caps.length + 1}-settled.png`));
        const endFr = ROWS.length ? ROWS[ROWS.length - 1][F_FR] : c0;
        const w = windowStats(c0, c0 + 1, pre, endFr); capWin.push([c0, endFr]);
        const gs = ['cap0', 'cap1', 'cap10'].map((t, i) => GRABS[`${t}@${c0 + [0, 1, 10][i]}`]);
        const cmp = {}; const lab = ['비운판', '다음판', '열하나째판'];
        gs.forEach((g, i) => { cmp[lab[i]] = g && g.file ? Object.assign(pdiff(g.file, fS), { cam: g.cam, segs: g.segs, file: g.file }) : null; });
        const hS = await held(); hS.rssMB = rendRss();
        const rec = { k: res.caps.length + 1, route: name, atMin: +((Date.now() - t0) / 60000).toFixed(2), step: W.steps, cell: prevCell, leg: li, clear: ev, pre, settle: st, win: w, settledSegs: w.endSegs, settledCam: w.endCam, cmp, heldAfter: hS, shot: fS };
        res.caps.push(rec);
        console.log(`  · ${name} 상한 비우기 ${rec.k} — ${rec.atMin}분 · 걸음 ${rec.step} · 칸 ${JSON.stringify(prevCell)} · 비우기 앞 ${ev.size}청크 ${ev.segs}띠 ${ev.cvN}장 ${(ev.px / 1e6).toFixed(2)}M화소 · ` +
          `그린 띠 앞 판 ${pre} → ${JSON.stringify(w.first12)} · 0 인 판 ${w.zero} · 반 아래 ${w.low} · 돌아오기 ${w.back}판 ${w.backMs}ms · 다 구운 뒤 ${w.endSegs}띠 | 화면 ${JSON.stringify(Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, v && { meanAbs: v.meanAbs, bigPct: v.bigPct, px: v.px, same: v.bytesSame, segs: v.segs }])))}`);
        fs.writeFileSync(path.join(OUT, `${BR}-chunkcap.json`), JSON.stringify(res, null, 1));
      }
      if (W.caps >= maxCaps || Date.now() - t0 > maxMin * 60000) break;
    }
    W.min = +((Date.now() - t0) / 60000).toFixed(2); W.cells = Math.round(W.cells);
    console.log(`  · ${name} 걷기 ${W.min}분 · 걸음 ${W.steps}(건너뜀 ${W.skipped}) · ${W.cells}칸 · 상한 비우기 ${W.caps}`);
    return W;
  };
  res.walk = { line: await walkRoute('ⓑ곧은길', lineRoute, [2150, 1959], 1, 6) };
  fs.writeFileSync(path.join(OUT, `${BR}-chunkcap.json`), JSON.stringify(res, null, 1));
  res.walk.ridge = await walkRoute('ⓒ능선옆', ridgeRoute, ridgeRoute[0], NCAP, WALK_MIN);
  await pull();
  res.other = CLEARS.filter((e) => e.src !== 'cap');
  // 여느 판 — 걷기 판 가운데 상한 비우기 뒤 선 채 다 구운 창 밖 · 그 밖 비우기 뒤 600판 밖에서 그린 띠가 바로 앞 30판 가운데값의 반 아래로 떨어진 판(가운데값 10 이상만)
  {
    const excl = capWin.slice();
    for (const ev of CLEARS) if (ev.src !== 'cap' && ev.fr >= frW0) excl.push([ev.fr + 1, ev.fr + 601]);
    const walkRows = ROWS.filter((r) => r[F_FR] >= frW0);
    //   카메라 뜀 — 판 사이 카메라가 걸음 하나(길 2칸 + 양끝 둘레 3칸 = 8칸 · 256px)보다 멀리 옮긴 판(막힌 걸음을 건너뛴 뒤 다음 걸음 — 워프 꼴).
    //   다 구운 판 = 굽는 중 0 · 산 굽기 수가 30판 앞과 같다. 반 아래 판은 마지막 뜀 뒤로 다 구운 판이 한 번도 없었으면 `dropHalfAfterJump` 로 따로 센다
    //   (뜀이 데려간 자리의 안 구운 청크 — T870 띠 예산의 새 청크와 같은 길 · 비우기와 무관).
    const JUMP = (2 + 2 * 3) * 32, jumpI = [], jumps = [], settled = new Array(walkRows.length).fill(false);
    for (let i = 1; i < walkRows.length; i++) { const a = walkRows[i - 1], b = walkRows[i];
      if (a[F_CX] != null && b[F_CX] != null) { const d = Math.hypot(b[F_CX] - a[F_CX], b[F_CY] - a[F_CY]); if (d > JUMP) { jumpI.push(i); jumps.push([b[F_FR], Math.round(d)]); } }
      if (i >= 30 && b[F_JOB] === 0 && b[F_BAKE] === walkRows[i - 30][F_BAKE]) settled[i] = true; }
    let n = 0, flag = 0, flagJ = 0, flagEx = []; const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
    for (let i = 30; i < walkRows.length; i++) {
      const fr = walkRows[i][F_FR]; if (excl.some(([a, b]) => fr >= a && fr <= b)) continue;
      const m = med(walkRows.slice(i - 30, i).map((r) => r[F_SEG])); if (m < 10) continue;
      n++; if (walkRows[i][F_SEG] < m * 0.5) {
        let j = -1; for (const k of jumpI) if (k <= i) j = k;
        let after = j >= 0; if (after) for (let k = j; k <= i; k++) if (settled[k]) { after = false; break; }
        if (after) flagJ++; else { flag++; if (flagEx.length < 12) flagEx.push([fr, walkRows[i][F_SEG], m]); } }
    }
    const segs = walkRows.map((r) => r[F_SEG]), dts = []; for (let i = 1; i < walkRows.length; i++) dts.push(walkRows[i][F_T] - walkRows[i - 1][F_T]);
    res.normal = { frames: n, dropHalf: flag, dropHalfAfterJump: flagJ, jumps, ex: flagEx, allFrames: walkRows.length, segMax: segs.length ? Math.max(...segs) : null, dtMed: dts.length ? med(dts) : null };
  }
  res.errs = errs;
  fs.writeFileSync(path.join(OUT, `${BR}-chunkcap.json`), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(OUT, `${BR}-chunkcap-rows.json`), JSON.stringify({ cols: ['판', 'ms', '그린띠', '청크', '굽는중', '굽기수', 'camx', 'camy'], rows: ROWS, clears: CLEARS }));
  console.log(`  · 걷기 ${res.walk.line.min} + ${res.walk.ridge.min}분 · 상한 비우기 ${res.caps.length}(그린 띠 앞 판 > 0 인 것 ${res.caps.filter((r) => r.pre > 0).length}) · 그 밖 비우기 ${res.other.length}(${res.other.map((e) => e.src).join(',')}) · ` +
    `여느 판 ${res.normal.frames} 중 반 아래 ${res.normal.dropHalf}(카메라 뜀 ${res.normal.jumps.length}번 바로 뒤 ${res.normal.dropHalfAfterJump} 따로) · 판 간격 가운데 ${res.normal.dtMed}ms`);
  console.log(`  · 오류 ${errs.length} · → ${path.join(OUT, `${BR}-chunkcap.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
