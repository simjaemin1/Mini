#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 야간 세 밤 분할(T238) · `run-regress.sh --list "nightly B"`
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`getImageData` — 같은 판 캔버스에서 획 상자를 읽는다 · 그림 한 장은 `page.screenshot`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`·`42-r2-char`)을 만지는 카드는 이 표를 전수로 돌려라.
// =============================================================================
// e2e-breath — 입김: 영하 · 바깥 · 살아 선 몸의 숨 주기 한 획 [T500 ② 2026-09-28]
//   카드 ② "`tempC < 0` ∧ 바깥 ∧ 살아 움직이는 몸(플레이어·주민)에 숨 주기 작은 스트로크(안개 규격 · 실내 0 · 파티클 0)"
//
// ★세우는 것: `__e2e_clock`(겨울 밤 — 서버 기온이 영하를 **말하게** 한다 · 하늘은 래퍼가 한낮에 묶어 밤 어둠은 없다) ·
//   방 하나(DB 에 미리 · `fixture-house` — e2e-weather·e2e-rooms 문법) · 두 번째 몸(두 번째 창 — "남의 몸" 길).
//   ⚠기온을 진단 훅으로 세우지 않는다 — 입김이 읽는 `tempC` 는 서버가 보낸 그 값이다(맑게 하려고 `precip: 0` 만 덮는다).
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같은 판에서 잰다:
//   ⓐ 실내 0          ↔ 같은 기온 바깥에선 선다
//   ⓑ 숨 주기(반 주기) ↔ 들숨 판이 실제로 있다(늘 그리면 주기가 아니다)
//   ⓒ 입 자리          ↔ 판이 바뀌면 원점도 그 판의 입만큼 움직인다(한 점 = 발밑)
//   ⓓ 화소            ↔ 같은 몸 판(같은 선 판 번호)에서 기온만 영상으로 — 그 상자가 **같다**(잡음 0)
//   ⓔ 남의 몸          ↔ 같은 술어가 실내 칸·영상·끔·쓰러짐에서 0 을 낸다
//
// 사용: node scripts/e2e-breath.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');     // ★T349 기동 기다리기 정본(사본 0)
const FX = require('./fixture-clock');    // ★T140 시계·입장 기다리기 정본(사본 0)
const FH = require('./fixture-house');    // ★[T500] 방 하나(e2e-weather·e2e-rooms 문법)
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-breath-${process.pid}.db`;
const SHOTS = process.env.SHOTS || '/tmp/e2e-breath-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, extra) => { if (c) { pass++; say(`  ✓ ${m}` + (extra !== undefined ? `  ${extra}` : '')); }
                              else { fail++; say(`  ✗ ${m}` + (extra !== undefined ? `  ${extra}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, `/tmp/e2e-breath-c-${process.pid}.db`]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
const HOUSE = FH.RECT(100, 100, 104, 103);          // 5×4 = 20칸 (e2e-weather 와 같은 방)
const IN = { cx: 102, cy: 101 };                    // 방 한가운데 = 스폰
const OUT = { x: (IN.cx + 40) * FH.SZ + 16, y: (IN.cy + 40) * FH.SZ + 16 };   // 40칸 밖 빈 땅(e2e-weather 의 바깥 자리)
// ★하늘을 한낮에 묶고 스폰을 방 한가운데로(e2e-weather 래퍼와 같은 문법)
const WRAP = `/tmp/zone-wrap-breath-${process.pid}.js`;
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES.hanbando, { mainSquare: { x: ${IN.cx * FH.SZ + 16}, y: ${IN.cy * FH.SZ + 16}, name: '입김 시험 방' } });
require(path.join(ROOT,'server','zone.js'));`);
// 겨울 밤 — econ 곡선이 정한 겨울 한가운데부터 **밤 기온이 영하인 첫날**(e2e-snow ④ 와 같은 규칙 · 날짜를 지어내지 않는다)
let WN = FX.anchorDays().winter; while (FX.expectAt(WN, true).tempC >= 0 && WN < FX.anchorDays().winter + 60) WN++;

async function enter(browser, name) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say(`  [클라 오류 ${name}] ` + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { await page.fill('#name', name); } catch (e) { }
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  const w = await FX.waitInWorld(page);
  // 잡음 걷기 — 바람(풀 카펫)·하늘 획(T98 §4-c · T104 ⑤d). 기온은 **서버 값 그대로** 둔다(precip 만 0 으로 덮는다).
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__rainForce({ precip: 0 }));
  return { page, inWorld: w.ok };
}
// 숨 한 주기(메타 선 판) 넘게 **매 판** 입김 계기를 모은다 — 들숨·날숨이 다 들어간다
const sampleBreath = (page, periods) => page.evaluate((k) => new Promise((res) => {
  const P = window.__charMeta.clips.idle.frames / window.__charMeta.clips.idle.fps;
  const t0 = performance.now(), frames = [];
  const step = () => {
    const b = window.__breathDbg();
    frames.push({ t: performance.now() - t0, on: b.on, strokes: b.strokes });
    if (performance.now() - t0 < k * P * 1000) requestAnimationFrame(step); else res({ P, frames });
  };
  requestAnimationFrame(step);
}), periods);

(async () => {
  say('=== 입김 — 영하 · 바깥 · 살아 선 몸의 숨 주기 한 획 (T500 ②) ===');
  const _central = boot('central', path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), DB_PATH: `/tmp/e2e-breath-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _up = await FB.waitUp(_central, /central server up on/, { name: 'central' });
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms` : _up.why);
  const ZENV = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' };
  {
    const z0 = boot('zone0', path.join(ROOT, 'server', 'zone.js'), ZENV);
    const u0 = await FB.waitUp(z0, /zone server up on/, { name: 'zone', capMs: 300000 });
    ok(u0.ok, 'DB 스키마 생성용 1차 부팅');
    try { z0.kill('SIGKILL'); } catch (e) { }
    await new Promise((r) => { if (z0.exitCode !== null) r(); else z0.once('exit', r); });
  }
  const seeded = FH.seedHouse(ZDB, HOUSE);
  ok(seeded.floors === 20, `★검사 전제 — 방이 DB 에 들어갔다 (바닥 ${seeded.floors}칸 · 벽 ${seeded.walls}장)`);
  const z = boot('zone', WRAP, { ...ZENV, E2E_GIVE: '1', T500_WINTER_FX: '1', CHAR_SPRITE: 'on' });   // CHAR_SPRITE = 라이브 env(몸이 시트로 선다)
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok(zu.ok, 'zone 기동(T500_WINTER_FX=1 · CHAR_SPRITE=on)');
  if (!_up.ok || !zu.ok) { shutdown(); process.exit(1); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const A = await enter(browser, 'breathA');
  ok(A.inWorld, '입장(나)');
  const fx = await FX.setClock(A.page, { day: WN, night: true });
  ok(fx.ok && fx.got.tempC < 0, `겨울 밤에 세웠다 — 서버 기온 ${fx.got && fx.got.tempC}℃ (day ${WN} · 하늘은 한낮에 묶여 밝다)`);
  // ★[T515 ⓪-a] 기다림은 **바라는 값**으로 — 내 몸이 시트로 선 판까지(`__charDbg[myPid].on`).
  //   픽스처가 얼린 시계의 한 점을 맞추자 `setClock` 이 60초 헛기다림 → 1초로 앉았고, 그 60초가 가려 주던 경주가 드러났다:
  //   시트 192장이 오기 전에 계기를 읽어 `sheet:false`(가지 1판 실측 · 도형 경로로 그린 판).
  await A.page.waitForFunction(() => !!(window.__charMeta && window.__charMeta.mouthScreen) && typeof window.__breathDbg === 'function'
    && !!(window.__charDbg && window.__charDbg[myPid] && window.__charDbg[myPid].on), { timeout: 60000 }).catch(() => {});
  const pre = await A.page.evaluate(() => ({ meta: !!(window.__charMeta && window.__charMeta.mouthScreen), on: window.__breathDbg().on, pid: myPid,
    room: window.__roomDbg(), sheet: !!(window.__charDbg && window.__charDbg[myPid] && window.__charDbg[myPid].on) }));
  ok(pre.meta && pre.on && pre.sheet, '★계기 — 메타에 입 자리 표가 있고 · 손잡이 켬 · 내 몸이 **시트로** 그려진다', JSON.stringify({ meta: pre.meta, on: pre.on, sheet: pre.sheet }));

  // ══ ⓐ 실내 0 ═════════════════════════════════════════════════════════════════
  say('\n[ⓐ 실내 — 상황을 먼저 세우고(내가 정말 방 안이다) 숨 한 주기 넘게 본다]');
  ok(pre.room && pre.room.indoors === true, '★검사 전제 — 클라가 "나는 실내다"라고 답한다(방 정본)', JSON.stringify(pre.room && { cx: pre.room.cx, cy: pre.room.cy, cells: pre.room.roomCells }));
  const IND = { cx: pre.room.cx, cy: pre.room.cy };                  // 방 칸(절대) — ⓔ 가 "남의 몸" 술어에 쓴다
  const sIn = await sampleBreath(A.page, 1.2);
  const inMine = sIn.frames.filter((f) => f.strokes.some((s) => s.me)).length;
  ok(sIn.frames.length > 10 && inMine === 0, `★★ⓐ 영하라도 **실내면 한 획도 안 그린다** — ${sIn.frames.length}판 중 내 입김 ${inMine}`);

  // ══ ⓑ 바깥 — 숨 주기 ═══════════════════════════════════════════════════════════
  say('\n[ⓑ 바깥 — 40칸 밖 빈 땅으로 옮겨 숨 한 주기 넘게 본다]');
  await A.page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [OUT.x, OUT.y]);
  await sleep(5000);
  await A.page.evaluate(() => { window.__terrain19.windOff = true; });
  const room2 = await A.page.evaluate(() => window.__roomDbg());
  ok(room2 && room2.indoors === false, '★검사 전제 — 이제 실외다', JSON.stringify(room2 && { cx: room2.cx, cy: room2.cy }));
  const sOut = await sampleBreath(A.page, 2.2);
  const mine = sOut.frames.map((f) => f.strokes.find((s) => s.me) || null);
  const nOn = mine.filter(Boolean).length, nOff = mine.length - nOn;
  say(`    숨 한 주기 ${sOut.P.toFixed(3)}초(메타 선 판) · ${mine.length}판 중 날숨 ${nOn} · 들숨 ${nOff}`);
  ok(nOn > 0, `★★ⓑ 영하 · 바깥이면 **입김이 선다** (${nOn}판)`);
  ok(nOff > 0, `★ⓑ 반례 — 들숨 판이 실제로 있다(늘 그리면 숨 주기가 아니다) (${nOff}판)`);
  const es = mine.filter(Boolean).map((s) => s.e);
  ok(es.every((e) => e >= 0 && e <= 1) && es.some((e) => e < 0.5) && es.some((e) => e >= 0.5),   // 기록은 셋째 자리 반올림이라 끝 판이 1.000 으로 적힌다
    '★ⓑ 한 날숨 안에서 자라며 옅어진다(e 가 앞 반·뒤 반을 다 지난다 · 파티클 0 — 시각에서 낸다)', `e ${Math.min(...es).toFixed(3)}~${Math.max(...es).toFixed(3)}`);
  // 날숨 판의 몫 — 반 주기(sin 부호)가 가르므로 **양쪽 판이 다 여럿**이어야 한다(한쪽만 한두 판이면 주기 판이 아니다)
  const runs = []; let cur = null;
  for (const s of mine) { const k = !!s; if (!cur || cur.k !== k) { cur = { k, n: 0 }; runs.push(cur); } cur.n++; }
  const maxRuns = Math.ceil(2.2 * 2) + 1;                          // 2.2 주기 = 반 주기 4.4개 — 덩어리는 많아야 그 수 + 1
  ok(runs.filter((r) => r.k).length >= 1 && runs.filter((r) => !r.k).length >= 1 && runs.length <= maxRuns,
    '★ⓑ 날숨·들숨이 **덩어리로** 번갈아 선다(판마다 깜빡이지 않는다 — 주기가 한 바퀴 넘게 두세 번 바뀔 뿐)', runs.map((r) => `${r.k ? '날' : '들'}${r.n}`).join(' '));

  // ══ ⓒ 입 자리 · 방향 ═══════════════════════════════════════════════════════════
  say('\n[ⓒ 입 자리 — 원점 − 그 판의 입 오프셋 = 한 점(발밑) · 획은 바라보는 쪽]');
  const geo = await A.page.evaluate(() => new Promise((res) => {
    const out = []; const t0 = performance.now();
    const step = () => {
      const b = window.__breathDbg(), me = b.strokes.find((s) => s.me), cd = window.__charDbg && window.__charDbg[myPid];
      const mo = charMouthOffset(myPid);
      if (me && cd && mo) out.push({ a: me.a, b: me.b, e: me.e, clip: cd.clip, frame: cd.frame, row: cd.row, facing: cd.facing, mo });
      if (performance.now() - t0 < 12000 && (out.length < 400)) requestAnimationFrame(step); else res(out);
    };
    requestAnimationFrame(step);
  }));
  const anchors = geo.map((g) => [+(g.a[0] - g.mo[0]).toFixed(1), +(g.a[1] - g.mo[1]).toFixed(1)]);
  const frames = [...new Set(geo.map((g) => `${g.clip}/${g.frame}/${g.row}`))];
  const moSet = [...new Set(geo.map((g) => g.mo.map((v) => v.toFixed(3)).join(',')))];
  // 원점 기록은 0.1px 로 반올림된다(계기) ⇒ 한 점이라면 흩어짐은 그 반올림 폭(0.05)의 두 배 안이다
  const spread = anchors.length ? Math.max(...anchors.map((p) => Math.hypot(p[0] - anchors[0][0], p[1] - anchors[0][1]))) : 1e9;
  ok(geo.length > 5 && frames.length >= 2 && moSet.length >= 2, `★검사 전제 — 날숨을 여러 판 잡았고 몸 판이 둘 이상 바뀌었다(입 오프셋도 둘 이상)`, `${geo.length}판 · 몸 판 ${frames.join(' ')} · 입 ${moSet.length}가지`);
  ok(spread <= 0.1 + 1e-9, `★★ⓒ 입김 원점 − 그 판의 입(메타) = **한 점**(발밑) — 몸 판이 바뀌면 원점이 입만큼 따라 움직인다`, `흩어짐 ${spread.toFixed(3)}px · 발밑 ${JSON.stringify(anchors[0])}`);
  const dirOk = geo.every((g) => {
    const [fx0, fy0] = g.facing, fl = Math.hypot(fx0, fy0); if (!(fl > 0)) return false;
    const fx = fx0 / fl, fy = fy0 / fl, ex = fx - fy, ey = (fx + fy) / 2;   // 월드 바라봄 → 아이소 화면 방향
    const vx = g.b[0] - g.a[0], vy = g.b[1] - g.a[1], L = Math.hypot(vx, vy);
    if (L < 1) return true;                                                  // 막 자라기 시작한 판(0.1px 반올림이 방향을 못 말한다)
    return (vx * ex + vy * ey) > 0 && Math.abs(vx * ey - vy * ex) / Math.hypot(ex, ey) <= 0.1;   // 같은 쪽 · 옆으로 벗어남 ≤ 반올림 폭 둘
  });
  ok(dirOk, '★ⓒ 획은 **바라보는 쪽**으로 자란다(월드 바라봄을 아이소로 눕힌 방향 · 옆 벗어남 ≤ 기록 반올림)', `바라봄 ${JSON.stringify(geo[0] && geo[0].facing)}`);

  // ══ ⓓ 화소 — 같은 몸 판에서 기온만 바꾼다 ══════════════════════════════════════════
  say('\n[ⓓ 화소 — 같은 선 판 번호 · 기온 영하(입김) vs 영상(없음) · 잡음 대조]');
  const pix = await A.page.evaluate(() => new Promise((res) => {
    // 입김 판 하나를 잡고(그 판의 몸 판 번호 F 와 획 상자) → 기온을 영상으로 덮고 같은 F 두 판을 더 잡는다
    const grabBox = (bx) => { const d = ctx.getImageData(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]).data; return Array.from(d); };
    let phase = 0, F = null, box = null, A1 = null, B1 = null, gN1 = 0, t0 = performance.now();
    const step = () => {
      const cd = window.__charDbg && window.__charDbg[myPid], me = window.__breathDbg().strokes.find((s) => s.me);
      if (phase === 0 && cd && cd.clip === 'idle' && me && me.e > 0.3 && me.e < 0.7) {
        F = cd.frame + '/' + cd.row;
        const pad = Math.ceil(WX_SNOW_W) + 2;                       // 획 굵기 + 안티에일리어싱 두 칸
        box = [Math.floor(Math.min(me.a[0], me.b[0])) - pad, Math.floor(Math.min(me.a[1], me.b[1])) - pad,
               Math.ceil(Math.max(me.a[0], me.b[0])) + pad, Math.ceil(Math.max(me.a[1], me.b[1])) + pad];
        A1 = grabBox(box); phase = 1; window.__rainForce({ precip: 0, tempC: 5 });
      } else if (phase === 1 && cd && cd.clip === 'idle' && cd.frame + '/' + cd.row === F && window.__breathDbg().n === 0) {
        B1 = grabBox(box); gN1 = window._gN || 0; phase = 2;
      } else if (phase === 2 && cd && cd.clip === 'idle' && cd.frame + '/' + cd.row === F && window.__breathDbg().n === 0 && (window._gN || 0) > gN1) {   // 한 판 **더 그린 뒤**
        const B2 = grabBox(box);
        let dAB = 0, dBB = 0, whiter = 0;
        for (let i = 0; i < A1.length; i += 4) {
          const a = A1[i] + A1[i + 1] + A1[i + 2], b = B1[i] + B1[i + 1] + B1[i + 2];
          if (a !== b || A1[i + 3] !== B1[i + 3]) dAB++;
          if (a > b) whiter++;
          if (B1[i] !== B2[i] || B1[i + 1] !== B2[i + 1] || B1[i + 2] !== B2[i + 2]) dBB++;
        }
        window.__rainForce({ precip: 0 });
        return res({ F, box, dAB, dBB, whiter, n: A1.length / 4 });
      }
      if (performance.now() - t0 < 30000) requestAnimationFrame(step); else { window.__rainForce({ precip: 0 }); res({ err: `phase ${phase}` }); }
    };
    requestAnimationFrame(step);
  }));
  say(`    몸 판 ${pix.F} · 획 상자 ${JSON.stringify(pix.box)}(${pix.n}화소) · 입김↔없음 다른 화소 ${pix.dAB}(더 밝은 ${pix.whiter}) · 없음↔없음 ${pix.dBB}`);
  ok(!pix.err && pix.dBB === 0, `★ⓓ 잡음 대조 — 같은 몸 판 두 장(입김 없음)은 획 상자에서 **한 화소도 안 다르다**`, pix.err || `${pix.dBB}`);
  ok(!pix.err && pix.dAB > 0 && pix.whiter > 0, `★★ⓓ 입김이 화면에 **실제로 실린다** — 같은 몸 판에서 기온만 바꾸면 그 상자가 달라진다(밝아진 화소 ${pix.whiter})`, pix.err || `${pix.dAB}`);
  await A.page.screenshot({ path: `${SHOTS}/breath-out.png` });   // 그림 한 장(재민 눈 참고용 · 판정 아님)

  // ══ ⓔ 남의 몸 — 두 번째 창 ═══════════════════════════════════════════════════════
  say('\n[ⓔ 남의 몸 — 두 번째 창이 내 곁 바깥에 선다 · 같은 술어가 실내 칸·영상·끔·쓰러짐에서 0]');
  const B = await enter(browser, 'breathB');
  ok(B.inWorld, '입장(남)');
  const bPid = await B.page.evaluate(() => myPid);
  await B.page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [OUT.x + 2 * FH.SZ, OUT.y]);
  await sleep(5000);
  const sB = await sampleBreath(A.page, 2.2);
  const other = sB.frames.filter((f) => f.strokes.some((s) => !s.me && String(s.pid) === String(bPid))).length;
  ok(other > 0, `★★ⓔ 내 화면에서 **남의 몸**도 입김을 낸다(곁 바깥 · 같은 영하) — ${sB.frames.length}판 중 ${other}`);
  const pred = await A.page.evaluate(([bp, cx, cy]) => {
    const P = window.__charMeta.clips.idle.frames / window.__charMeta.clips.idle.fps;
    const h = _wxPidPhase(bp), tEx = ((((0.75 - h) % 1) + 1) % 1) * P * 1000;   // 그 몸의 날숨 한가운데(e = 0.5) 시각
    const cell = (x) => x * CL_BUILDING_SIZE + CL_BUILDING_SIZE / 2;
    const outItem = { pid: bp, isMe: false, ax: cell(cx) + 40 * CL_BUILDING_SIZE, ay: cell(cy) + 40 * CL_BUILDING_SIZE, floor: 0 };
    const inItem = { pid: bp, isMe: false, ax: cell(cx), ay: cell(cy), floor: 0 };
    const call = (it, down) => { ctx.save(); const r = drawBreath(-100, -100, it, 1, 0, down, tEx); ctx.restore(); return r; };   // 화면 밖에 그린다(술어만 잰다)
    const r = { out: call(outItem, false), inRoom: call(inItem, false), down: call(outItem, true), carried: call(Object.assign({}, outItem, { carriedOn: true }), false) };
    window.__rainForce({ precip: 0, tempC: 5 }); r.warm = call(outItem, false); window.__rainForce({ precip: 0 });
    const had = ('frost' in myWeather), v = myWeather.frost; delete myWeather.frost; r.off = call(outItem, false); if (had) myWeather.frost = v;
    r.cellIndoor = isCellIndoor(cx, cy, 0);
    return r;
  }, [bPid, IND.cx, IND.cy]);
  say(`    술어(남의 몸 · 날숨 한가운데): 바깥 ${pred.out} · 방 칸 ${pred.inRoom}(isCellIndoor ${pred.cellIndoor}) · 영상 ${pred.warm} · 끔 ${pred.off} · 쓰러짐 ${pred.down} · 업힘 ${pred.carried}`);
  ok(pred.out === 1, '★ⓔ 전제 — 같은 술어가 바깥 칸에선 **그린다**(날숨 한가운데)');
  ok(pred.cellIndoor === true && pred.inRoom === 0, '★★ⓔ 남의 몸도 **방 칸이면 0**(방 정본 `isCellIndoor`)');
  ok(pred.warm === 0 && pred.off === 0, '★ⓔ 영상이면 0 · **끔(칸 없음)이면 0**(끔 = 아무것도 안 한다)');
  ok(pred.down === 0 && pred.carried === 0, '★ⓔ 쓰러진 몸 · 업힌 몸은 0(살아 선 몸만)');

  await browser.close(); shutdown(); try { fs.unlinkSync(WRAP); } catch (e) { }
  say(`\n=== 입김: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); shutdown(); process.exit(1); });
