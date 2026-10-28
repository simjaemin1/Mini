#!/usr/bin/env node
// === scripts/t970-cut-near-check.js — `T970_CUT_NEAR` 켬 · 끔 같은 그림(T970 ②) — 계측 자 · 러너 밖 ======================================
//
//   실클라 하나(`E2E_BROWSER` — 기본 chromium · `webkit`) · 존 env 그대로(기본 = 끔 · welcome 칸 없음 · 갈래마다 페이지에서 `uiCfg.cutNear` 를 세운다 —
//   견줌은 welcome 값과 갈리지 않는다)로 띄워 **가르기 자리**(산에 가려 흐림 · 걸친 띠가 실제로 갈리는 자리 — `__mtCutN().split > 0`)마다:
//     자리 찾기 — 산 둘레 가운데(e2e-mtcut 산 자리 (2150,1959) · 정본 바위 술어로 고른 바위 무더기 — 아래 CENTERS)에 서서 다 구운 뒤 둘레 ±18칸(2칸 걸음)을 정본 술어
//       `__mtOccAt`(산이 나를 가리나)로 훑어(설 수 없는 칸 `isTerrainBlockedAtAbs` 은 거름) 가린 칸을 가까운 차례로 여덟까지 서 보고, 다 구운 뒤 걸친 띠가 있으면(`split > 0`) 그 칸이 자리다.
//     갈래마다 가르기 붙듦을 비우고(`_mtCutHold` 를 64 넘김과 같은 문법으로 놓는다 — `_cs = null` · `rec.mcache = null`) 손잡이를 세운 뒤:
//     ① 끔 — 자리에 서서 다 구운 뒤 본 캔버스 화소 · 붙든 띠마다 가르기 조각(`sg._cs.cv`) 화소 해시를 뜬다
//     ② 켬 — 먼 곳 셋(광산7 · 어촌2 · 광산5 · 6초씩)을 돌고 와서(그 사이 자리 띠의 가르기 조각이 놓인다 — 돌아오기 앞 붙듦 수 · 넓이를 센다)
//        같은 자리에서 다시 뜬다(놓인 조각은 종전 캐시 빗나감 길로 다시 만든다)
//     ③ 끔 — 같은 걸음을 한 번 더(같은 손잡이 두 장의 바닥)
//   견줌 = 화면 |Δ|(① ↔ ② · ① ↔ ③) · 바이트로 같은가 · 띠 조각 해시(같은 띠 — 청크 열쇠 · 띠 차례 — 끼리) · 돌아오기 앞 붙듦 · 선 채 10초 새로 만든 조각 수.
//   결정론 고정 — 물 · 바람 시각(`__terrain19.freezeT` · `windOff`) · 비 0 · 해 몫 한낮(1초마다) · 같은 자리 · 같은 걸음 · 갈래마다 · 먼 곳마다 몸 채움
//   (`__e2e_body` — 굶어 쓰러지면 누운 몸 · `× 이름표` 로 화면이 갈린다 · 찍을 때 `myIsDown` 을 적는다).
//   ★[T981] --knob <uiCfg 칸>(기본 `cutNear`) — 갈래가 세우고 지우는 손잡이 칸(다른 칸은 welcome 그대로 — T981 판은 `mtNear` · T970 켬 기본은 welcome 값).
//     --half — 갈래마다 굽다 만 청크를 만든다: 자리에서 다 구운 뒤 먼 곳 첫째로 가서 산 청크 캐시를 비우고(`_mt3Chunk` · `_mt3Jobs` — 존 바뀜 비움과 같은 문법)
//     손잡이를 세운 뒤 자리로 와서 **굽는 중 청크가 생기면 곧바로** 먼 곳으로 떠난다(떠날 때 굽는 중 수를 적는다) → 먼 곳 셋 → 자리로 돌아와 다 구운 뒤 뜬다.
//     세 갈래(끔 · 켬 · 끔둘째) 모두 같은 걸음이다. 더 뜨는 것 = 굽는 중 청크 수 · 버린 굽던 청크 수(`_mtNearJobN`) · 되돌린 판 수(`_mtNearCvN`) · 가르기 판 둘 넓이 ·
//     이번 판 그린 산 띠(`_mtLastRend` 의 mtseg) 띠 캔버스 화소 해시(청크 열쇠 · 띠 차례).
// 실행: [E2E_BROWSER=webkit] node scripts/t970-cut-near-check.js [--out /tmp/t970/near] [--spots 3] [--knob mtNear] [--half]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t970/near'); fs.mkdirSync(OUT, { recursive: true });
const NSPOT = +arg('--spots', '3');
const KNOB = arg('--knob', 'cutNear');   // [T981] 갈래가 세우는 uiCfg 칸
const HALF = process.argv.includes('--half');   // [T981] 굽다 만 청크를 만들고 떠나는 걸음
const SUF = (KNOB === 'cutNear' ? '' : '-' + KNOB.toLowerCase()) + (HALF ? '-half' : '');   // [T981] 결과 · PNG 이름 꼬리(T970 판 이름은 그대로)
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t970n-c-${process.pid}.db`, ZDB = `/tmp/t970n-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

(async () => {
  console.log(`\n=== T970 가르기 붙듦 손잡이 켬 · 끔 같은 그림 — 브라우저 ${BR} · 손잡이 칸 ${KNOB}${HALF ? ' · 굽다 만 청크 걸음' : ''} ===`);
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
  const welcome = await page.evaluate(() => ({ cutNear: 'cutNear' in uiCfg ? uiCfg.cutNear : '(칸 없음)', mtNear: 'mtNear' in uiCfg ? uiCfg.mtNear : '(칸 없음)' }));
  console.log(`  · welcome ${JSON.stringify(welcome)}(존 env T970_CUT_NEAR ${process.env.T970_CUT_NEAR == null ? '없음' : process.env.T970_CUT_NEAR} · T981_MT_NEAR ${process.env.T981_MT_NEAR == null ? '없음' : process.env.T981_MT_NEAR})`);
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; if (window.__rainForce) window.__rainForce({ precip: 0 });
    setInterval(() => { try { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs; const p = (((0.5 * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; } catch (e) {} }, 1000);
    return true;
  });
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { try { const db = new DatabaseSync(ZDB); rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); db.close(); } catch (e) {} if (!rows.length) await sleep(1000); }
  const V = (n) => rows.find((r) => r.name === n);
  const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
  const tpTo = async (cx, cy, rMax = 8) => {   // 서버가 막힌 칸이면 거절한다 — 둘레를 가까운 칸부터(t926-near-check 와 같은 식)
    const ring = [[0, 0]]; for (let r = 1; r <= rMax; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    for (const [dx, dy] of ring) {
      const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16; await tp(x, y);
      for (let i = 0; i < 8; i++) { await sleep(700); const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
        return a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9; }, [x, y]); if (d <= 64) return [cx + dx, cy + dy]; }
    }
    return null;
  };
  const grab = async (f) => { const u = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png')); fs.writeFileSync(f, Buffer.from(String(u).split(',')[1], 'base64')); return f; };
  // 다 구울 때까지 — 산 굽기 수 · 굽는 중 청크 · 지면 굽기 · 가르기 만든 수가 다섯 번 연달아 그대로
  const settle = async () => { await sleep(3000); let last = -1, same = 0; for (let i = 0; i < 150 && same < 5; i++) { await sleep(1000);
    const n = await page.evaluate(() => (window.__mtDbg ? window.__mtDbg.mt3bakeN : 0) + ':' + window.__mtCutN().built + ':' + (typeof _mt3Jobs !== 'undefined' ? _mt3Jobs.size : 0) + ':' + (window.__groundDbg ? window.__groundDbg.baked : 0));
    if (n === last && /:0:0$/.test(n)) same++; else same = 0; last = n; } await sleep(1500); };
  // 가르기 붙듦 상태 — 붙든 띠 수 · 그 띠의 굽힌 캔버스 넓이 · 가르기 조각 수 · 넓이 · 지금 청크 캐시에 없는(낡은) 띠 수 · 띠 조각 해시(청크 열쇠 · 띠 차례)
  const holdState = (withHash) => page.evaluate((wh) => {
    const o = { hold: _mtCutHold.length, imgPx: 0, cs: 0, csPx: 0, stale: 0, near: (typeof _mtCutNearN !== 'undefined') ? _mtCutNearN : null, built: window.__mtCutN().built, split: window.__mtCutN().split, hs: {},
      jobs: _mt3Jobs.size, jobN: (typeof _mtNearJobN !== 'undefined') ? _mtNearJobN : null, cvN: (typeof _mtNearCvN !== 'undefined') ? _mtNearCvN : null,   // [T981]
      boards: [_mtMaskCv ? _mtMaskCv.width * _mtMaskCv.height : 0, _mtStripCv ? _mtStripCv.width * _mtStripCv.height : 0] };
    const seen = new Set();
    for (const q of _mtCutHold) {
      if (seen.has(q)) continue; seen.add(q);
      o.imgPx += q.img.width * q.img.height;
      const k = q.rec && q.rec.key, cur = k != null ? _mt3Chunk.get(k) : null, ix = cur ? cur.indexOf(q) : -1;
      if (ix < 0) o.stale++;
      if (q._cs && q._cs.cv) {
        o.cs++; o.csPx += q._cs.cv.width * q._cs.cv.height;
        if (wh && ix >= 0) {
          const cv = q._cs.cv, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0x811c9dc5;
          for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
          o.hs[k + '#' + ix] = [cv.width, cv.height, q._cs.c, q._cs.rT, q._cs.rB, q._cs.cL, q._cs.cR, h.toString(16)].join(':');
        }
      }
    }
    return o;
  }, !!withHash);
  const dropHold = () => page.evaluate(() => { for (const q of _mtCutHold) { q._cs = null; if (q.rec) q.rec.mcache = null; } _mtCutHold.length = 0; return true; });   // 64 넘김과 같은 문법으로 놓는다
  const setKnob = (on) => page.evaluate(([o, k]) => { if (o) uiCfg[k] = true; else delete uiCfg[k]; return k in uiCfg; }, [on, KNOB]);   // [T981] --knob 칸
  //   [T981] 이번 판 그린 산 띠(`_mtLastRend` 의 mtseg) — 띠 캔버스 화소 해시(청크 열쇠#띠 차례 · 크기)
  const segHash = () => page.evaluate(() => {
    const where = new Map(); for (const [k, a] of _mt3Chunk) if (Array.isArray(a)) a.forEach((sg, i) => where.set(sg, k + '#' + i));
    const o = {}; let n = 0, px = 0;
    for (const it of (_mtLastRend || [])) {
      if (!it || it.kind !== 'mtseg' || !it.sg || !it.sg.img) continue;
      const cv = it.sg.img, k = where.get(it.sg) || ('?' + it.sg.x + ',' + it.sg.y); if (k in o) continue;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
      o[k] = cv.width + 'x' + cv.height + ':' + h.toString(16); n++; px += cv.width * cv.height;
    }
    return { n, px, hs: o };
  });
  const clearMt = () => page.evaluate(() => { _mt3Chunk.clear(); _mt3Jobs.clear(); return true; });   // [T981] 존 바뀜 비움과 같은 문법(11-r1-mountain `_mt3Collect` 머리)
  //   [T981] 자리로 와서 굽는 중 청크가 생기면 곧바로 떠난다 — 떠날 때 굽는 중 수 · 자리 도착 여부
  const quickVisit = async (cx, cy, away) => {
    await tp(cx * 32 + 16, cy * 32 + 16);
    let arrived = false, jobs = 0;
    for (let i = 0; i < 200; i++) {
      await sleep(100);
      const st = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
        return { d: a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9, jobs: _mt3Jobs.size }; }, [cx * 32 + 16, cy * 32 + 16]);
      if (st.d <= 64) arrived = true;
      if (arrived && st.jobs >= 1) { jobs = st.jobs; break; }
    }
    await tp(away.cx * 32 + 16, away.cy * 32 + 16);
    return { arrived, jobsAtLeave: jobs };
  };
  //   몸 채우기(t926-mem-hour 와 같은 문 · E2E_GIVE) — 한 시간 가까이 도는 판에서 굶어 쓰러지면(× 이름표 · 누운 몸) 화면이 손잡이와 무관하게 갈린다
  const feed = () => page.evaluate(() => { window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, quiet: true }); return true; });
  const downNow = () => page.evaluate(() => (typeof myIsDown !== 'undefined' ? !!myIsDown : null));
  // 가르기 자리 찾기 — 가운데에 서서 다 구운 뒤 둘레를 `__mtOccAt` 로 훑는다
  const findSpot = async (cx, cy, taken) => {
    const at = await tpTo(cx, cy); if (!at) return null; await settle();
    const cand = await page.evaluate(([c0x, c0y]) => {
      const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}, ox = z2.worldOffsetX || 0, oy = z2.worldOffsetY || 0, out = [];
      for (let dy = -18; dy <= 18; dy += 2) for (let dx = -18; dx <= 18; dx += 2) {
        const ax = ox + (c0x + dx) * 32 + 16, ay = oy + (c0y + dy) * 32 + 16;
        if (typeof isTerrainBlockedAtAbs === 'function' && isTerrainBlockedAtAbs(ax, ay)) continue;   // 설 수 없는 칸(물 · 바위 · 막힘)은 미리 거른다 — 서버가 거절해 둘레를 헤맨다
        const r = window.__mtOccAt(ax, ay);
        if (r && r.n) out.push([c0x + dx, c0y + dy, Math.hypot(dx, dy), r.n]);
      }
      return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    }, at);
    for (const [x, y] of cand.slice(0, 8)) {
      if (taken.some((t) => Math.abs(t[0] - x) + Math.abs(t[1] - y) < 24)) continue;
      const s = await tpTo(x, y, 0); if (!s) continue; await settle();
      const st = await holdState(false);
      if (st.split > 0 && st.cs > 0) return { at: s, from: at, occ: cand.length, split: st.split };
    }
    return null;
  };
  // 산 둘레 가운데 — e2e-mtcut 산 자리 + 정본 바위 술어(server/terrain `isRockCellLocal`)로 고른 바위 무더기(48칸 걸음 격자 · 둘레 7×7 표본(3칸 걸음) 중 바위 20 이상 ·
  //   존 가운데에서 가까운 차례 · 앞 가운데들과 300칸 넘게 떨어진 것) — 손으로 고른 좌표 0(산 자리는 e2e-mtcut 의 그 자리)
  const CENTERS = [['산', { cx: 2150, cy: 1959 }]];
  {
    const { ZONES } = require(path.join(ROOT, 'server', 'zone-config')); const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
    const Z = ZONES.hanbando, W = Math.floor(Z.zoneWidth / 32), H = Math.floor(Z.zoneHeight / 32), cand = [];
    for (let cy = 200; cy < H - 200; cy += 48) for (let cx = 200; cx < W - 200; cx += 48) {
      let n = 0; for (let dy = -9; dy <= 9; dy += 3) for (let dx = -9; dx <= 9; dx += 3) if (T.isRockCellLocal('hanbando', (cx + dx) * 32 + 16, (cy + dy) * 32 + 16)) n++;
      if (n >= 20) cand.push([cx, cy, Math.hypot(cx - W / 2, cy - H / 2)]);
    }
    cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const [cx, cy] of cand) { if (CENTERS.length >= 7) break; if (CENTERS.every(([, v]) => Math.hypot(v.cx - cx, v.cy - cy) > 300)) CENTERS.push([`바위${cx}_${cy}`, { cx, cy }]); }
  }
  console.log(`  · 산 둘레 가운데 ${CENTERS.length}: ${CENTERS.map(([n]) => n).join(' · ')}`);
  const FAR = ['광산7', '어촌2', '광산5'].map(V).filter(Boolean);
  const res = { browser: BR, knob: KNOB, half: HALF, welcome, spots: [] }, taken = [];
  for (const [nm, v] of CENTERS) {
    if (res.spots.length >= NSPOT) break;
    await setKnob(false); await dropHold(); await feed();
    const sp = await findSpot(v.cx, v.cy, taken);
    console.log(`  · ${nm} 둘레 가르기 자리: ${sp ? JSON.stringify(sp) : '없음'}`);
    if (!sp) continue;
    taken.push(sp.at);
    const S = { nm, spot: sp, runs: [] };
    for (const [tag, on] of [['off', false], ['on', true], ['off2', false]]) {
      await setKnob(false); await dropHold(); await feed();
      await tpTo(sp.at[0], sp.at[1], 1); await settle();
      let leave = null;
      if (HALF) {   // [T981] 굽다 만 청크 — 먼 곳 첫째에서 산 청크 캐시를 비우고 손잡이를 세운 뒤 자리에 와서 굽는 중 청크가 생기면 곧바로 떠난다(세 갈래 같은 걸음)
        await feed(); await tpTo(FAR[0].cx, FAR[0].cy); await sleep(6000); await clearMt(); await dropHold();
        await setKnob(on);
        leave = await quickVisit(sp.at[0], sp.at[1], FAR[1] || FAR[0]);
      } else await setKnob(on);
      if (HALF || tag !== 'off') for (const f of FAR) { await feed(); await tpTo(f.cx, f.cy); await sleep(6000); }   // 먼 곳 셋을 돌고 온다(켬이면 그 사이 자리 띠의 가르기 조각이 놓인다 · [T981] 창 밖 굽던 청크를 버린다)
      await feed();
      const before = await holdState(false);
      const at = await tpTo(sp.at[0], sp.at[1], 1); await settle();
      const st = await holdState(true);
      const segs = HALF ? await segHash() : null;   // [T981] 이번 판 그린 산 띠 해시
      await sleep(10000);
      const still = await holdState(false);
      const down = await downNow();
      const f = await grab(path.join(OUT, `${BR}-${nm}-${tag}${SUF}.png`));
      S.runs.push({ tag, on, at, leave, beforeReturn: before, atShot: st, segs, stillBuilt: still.built - st.built, stillNear: (still.near != null && st.near != null) ? still.near - st.near : null, down, shot: f });
      console.log(`  · ${nm} ${tag}: 자리 ${JSON.stringify(at)} · 돌아오기 앞 붙듦 ${before.hold}띠(낡은 ${before.stale}) 띠 ${(before.imgPx / 1e6).toFixed(2)}M화소 · 조각 ${before.cs}장 ${(before.csPx / 1e6).toFixed(2)}M화소 · 놓은 수 ${before.near}` +
        ` | 찍을 때 붙듦 ${st.hold}띠 · 조각 ${st.cs}장 · 걸친 띠 ${st.split} · 선 채 10초 새 조각 ${still.built - st.built} · 쓰러짐 ${down}` +
        (HALF ? ` | [T981] 떠날 때 굽는 중 ${leave && leave.jobsAtLeave}(도착 ${leave && leave.arrived}) · 돌아오기 앞 굽는 중 ${before.jobs} · 버린 수 ${before.jobN} · 되돌린 판 ${before.cvN} · 판 넓이 ${before.boards.join('/')} → 찍을 때 ${st.boards.join('/')} · 그린 띠 ${segs.n}장 ${(segs.px / 1e6).toFixed(2)}M화소` : ''));
    }
    const [r0, r1, r2] = S.runs;
    const hcmp = (a, b) => { const ks = new Set(Object.keys(a).concat(Object.keys(b))); let same = 0, diff = 0, only = 0; for (const k of ks) { if (!(k in a) || !(k in b)) only++; else if (a[k] === b[k]) same++; else diff++; } return { same, diff, only }; };
    S.cmp = { scrOffOn: pdiff(r0.shot, r1.shot), scrOffOff2: pdiff(r0.shot, r2.shot), scrOnOff2: pdiff(r1.shot, r2.shot),
      csOffOn: hcmp(r0.atShot.hs, r1.atShot.hs), csOffOff2: hcmp(r0.atShot.hs, r2.atShot.hs),
      ...(HALF ? { segOffOn: hcmp(r0.segs.hs, r1.segs.hs), segOffOff2: hcmp(r0.segs.hs, r2.segs.hs) } : {}) };   // [T981] 그린 산 띠 해시
    res.spots.push(S);
    console.log(`  · ${nm} 견줌: ${JSON.stringify(S.cmp)}`);
    res.errs = errs; fs.writeFileSync(path.join(OUT, `${BR}-cutnear${SUF}.json`), JSON.stringify(res, null, 1));   // 자리마다 적는다(판이 끊겨도 앞 자리가 남는다)
  }
  res.errs = errs;
  fs.writeFileSync(path.join(OUT, `${BR}-cutnear${SUF}.json`), JSON.stringify(res, null, 1));
  console.log(`  · 오류 ${errs.length} · → ${path.join(OUT, `${BR}-cutnear${SUF}.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
