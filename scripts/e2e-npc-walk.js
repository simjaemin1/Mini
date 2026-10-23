#!/usr/bin/env node
// @regress
// @nightly B   ← 야간 세 밤 분할(T238) — 존을 두 번 띄운다(판당 4~5분)
// =============================================================================
// e2e — 마을 NPC 걸음 = 플레이어 걸음 (T888 · 재민 10-23 · ★PM "같다" — 랩이 목표 캐논)
//
// 무엇을 지키나:
//   ① 켬(기본 · `T888_NPC_WALK` 미설정): 마을 NPC 의 곧은 걸음이 **존 `MOVE_SPEED` × 1** 이다(64px/s = 2m/s = 플레이어 걸음 · 랩 `L_WALK` 평보).
//   ② 끔(`T888_NPC_WALK=0`): 같은 자로 **× 0.6**(38.4px/s — 종전) — 자가 두 걸음을 실제로 가른다(자명 통과 0).
//   ③ 켬 ÷ 끔 = 1 ÷ 0.6.
//   ④ 스크립트 오류 0(자원 404 `Failed to load resource` 는 소음으로 따로 적는다 — e2e-membership · e2e-craft 와 같은 규약).
//
// ★자 — **서버 권위 좌표**로 잰다(클라 예측 · 보간이 아니다): `__getNpcs()` 는 tick 이 실어 온 서버 자리
//   (`30-n-net.js` `c.others.set(pp.pid, { x: pp.x, y: pp.y … })` 그대로 · 렌더 보간은 따로 산다).
//   페이지 안 표본기(50ms)로 NPC 마다 자리를 모으고 → **자리가 바뀐 표본만** 남겨(= 서버 갱신 시각) →
//   1초 창마다 곧은 변위 ÷ 시간(창 안 경로 합 대비 곧음 ≥ 0.97 · 표본 사이 틈 ≤ 400ms · 창 ≤ 1.3초 · 변위 ≥ 8px)을 잰다 → 창 속도 중앙값.
//   · 길 배속(`_rdMul` ×1.10/1.15)을 빼려고 `ENABLE_ROADS=0`, 사냥꾼 두뇌 배속(`_huntSpd`)을 빼려고 `ENABLE_WILDLIFE=0`.
//     개울 칸(×0.5 · T585)은 중앙값이 거른다(마을 안 개울 칸은 몇 칸뿐).
//   · 기대 걸음은 **소스에서 읽는다**(사본 0): `const MOVE_SPEED = 64` · `NPC_WALK_MULT = T888_NPC_WALK ? 1 : 0.6`.
//
// 실행: node scripts/e2e-npc-walk.js [--headed]
//   ★Chromium 은 /opt/pw-browsers/chromium(playwright install 금지 — 컨테이너 규약). 포트 3010/3020 공용 — E2E 동시 실행 금지.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const HEADED = process.argv.includes('--headed');
const SHOTS = '/tmp/e2e-npc-walk-shots';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
FB.mustBeFree([CPORT, ZPORT], 'e2e-npc-walk');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
}
const procs = [];
function boot(tag, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p._name = tag; p._out = '';
  p.stdout.on('data', (d) => { const s = d.toString(); p._out += s; if (p._out.length > 400000) p._out = p._out.slice(-200000); });
  p.stderr.on('data', (d) => { p._out += d.toString(); });
  procs.push(p); return p;
}
async function killAll() {
  for (const p of procs) { try { fs.writeFileSync(path.join(SHOTS, `${p._name}.log`), p._out); } catch (e) {} try { p.kill('SIGKILL'); } catch (e) {} }
  procs.length = 0; await sleep(2500);
}

// ── 기대 걸음 — 소스에서 읽는다 ────────────────────────────────────────────────
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const mSpeed = /\nconst MOVE_SPEED = (\d+(?:\.\d+)?);/.exec(ZSRC);
const mMult = /\nconst NPC_WALK_MULT = T888_NPC_WALK \? (\d+(?:\.\d+)?) : (\d+(?:\.\d+)?);/.exec(ZSRC);
const MOVE_SPEED = mSpeed ? +mSpeed[1] : NaN;
const MULT_ON = mMult ? +mMult[1] : NaN, MULT_OFF = mMult ? +mMult[2] : NaN;

// ── 창 속도 — 서버 갱신 시각의 자리 열에서 1초 창의 곧은 걸음 ───────────────────
const WIN = 1000;
function windowSpeeds(rec) {
  const by = new Map();   // pid → [[t, x, y]] — 자리가 바뀐 표본만(= 서버가 새 자리를 실어 온 시각)
  for (const [t, arr] of rec) for (const [pid, x, y] of arr) {
    let a = by.get(pid); if (!a) by.set(pid, (a = []));
    const l = a[a.length - 1];
    if (!l || l[1] !== x || l[2] !== y) a.push([t, x, y]);
  }
  const out = [];
  for (const a of by.values()) {
    for (let i = 0; i < a.length; i++) {
      let j = i + 1, len = 0, gap = 0;
      while (j < a.length && a[j][0] - a[i][0] < WIN) { len += Math.hypot(a[j][1] - a[j - 1][1], a[j][2] - a[j - 1][2]); gap = Math.max(gap, a[j][0] - a[j - 1][0]); j++; }
      if (j >= a.length) break;
      len += Math.hypot(a[j][1] - a[j - 1][1], a[j][2] - a[j - 1][2]); gap = Math.max(gap, a[j][0] - a[j - 1][0]);
      const dt = a[j][0] - a[i][0], d = Math.hypot(a[j][1] - a[i][1], a[j][2] - a[i][2]);
      if (dt > WIN * 1.3 || gap > 400 || d < 8 || !(len > 0) || d / len < 0.97) continue;
      out.push(d / dt * 1000);
    }
  }
  return { speeds: out, npcs: by.size };
}
const med = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

async function arm(tag, knob) {
  console.log(`\n=== 팔 ${tag} — T888_NPC_WALK ${knob == null ? '(미설정 = 켬 기본)' : '=' + knob} ===`);
  const dbc = `/tmp/npcwalk-c-${tag}.db`, dbz = `/tmp/npcwalk-z-${tag}.db`;
  for (const f of [dbc, dbz]) for (const s of ['', '-journal', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  const central = boot(`central-${tag}`, path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), DB_PATH: dbc, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const upC = FB.waitUp(central, /central server up on/, { name: 'central' });
  const zenv = { PORT: String(ZPORT), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`, DB_PATH: dbz, E2E_GIVE: '1',
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', VILLAGE_DAY_MS: '20000', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' };
  if (knob != null) zenv.T888_NPC_WALK = knob;
  const zone = boot(`zone-${tag}`, path.join(ROOT, 'server', 'zone.js'), zenv);
  const upZ = FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const uc = await upC;
  ok(uc.ok, `[${tag}] central 기동`, uc.ok ? `${uc.ms}ms` : uc.why);
  const uz = await upZ;
  ok(uz.ok, `[${tag}] zone 기동`, uz.ok ? `${uz.ms}ms` : uz.why);
  if (!uc.ok || !uz.ok) { await killAll(); return null; }

  // 심긴 마을의 자리 — 서버에게 묻는다(하네스가 좌표를 지어내지 않는다 · e2e-npcsprite 와 같은 창)
  let vil = null;
  for (let i = 0; i < 90 && !vil; i++) {
    try {
      const j = await (await fetch(`http://localhost:${ZPORT}/lifedbg`, { signal: AbortSignal.timeout(5000) })).json();
      const rows = Array.isArray(j) ? j : (j.villages || []);
      for (const r of rows) {
        const pts = (r.sample || []).filter((x) => x && typeof x.x === 'number');
        if (pts.length < 3) continue;
        vil = { name: r.name || r.v || '?', x: Math.round(med(pts.map((p) => p.x))), y: Math.round(med(pts.map((p) => p.y))), n: pts.length };
        break;
      }
    } catch (e) {}
    if (!vil) await sleep(2000);
  }
  ok(!!vil, `[${tag}] 서버가 심긴 마을과 주민 자리를 알려 준다(/lifedbg)`, vil ? `${vil.name} @ (${vil.x},${vil.y}) · 표본 ${vil.n}` : '못 받음');
  if (!vil) { await killAll(); return null; }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  //   ★스크립트 오류만 빨간불로 센다 — `Failed to load resource`(자원 404)는 소음으로 따로 적는다(e2e-membership · e2e-craft 와 같은 규약 · 어느 주소인지는 응답으로 적는다)
  const errs = [], noise = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() !== 'error') return; const t = m.text().slice(0, 160); (/Failed to load resource/.test(t) ? noise : errs).push('console: ' + t); });
  page.on('response', (r) => { if (r.status() >= 400) noise.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('#enter');
  if (enter) await enter.click();
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs()))); i++) await sleep(500);
  ok(!!(await page.evaluate(() => window.__getSrvAbs && window.__getSrvAbs())), `[${tag}] 월드 입장(서버 권위 자리를 받았다)`);
  // 마을 한가운데로 — 존 로컬 좌표(`teleport_debug` 규약)
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [vil.x, vil.y]);
  let near = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const s = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
    const zm = await page.evaluate(() => { const m = window.__getZonesMeta && window.__getZonesMeta(); const z = m && (m.hanbando || (Array.isArray(m) ? m.find((q) => q.id === 'hanbando') : null)); return z ? { ox: z.worldOffsetX || 0, oy: z.worldOffsetY || 0 } : { ox: 0, oy: 0 }; });
    if (s && Math.hypot(s.x - zm.ox - vil.x, s.y - zm.oy - vil.y) < 200) { near = s; break; }
  }
  ok(!!near, `[${tag}] 마을 한가운데에 섰다(서버 권위 자리 · 200px 안)`);
  await sleep(4000);

  // 표본 — 곧은 창이 예순 개 넘게 모일 때까지. ⚠주민의 낮밤은 세계 시계(`WORLD.dayLengthMs` 24분 · 마을 하루 `VILLAGE_DAY_MS` 와 따로)다 —
  //   밤(하루의 30% · 최대 7.2분)이면 주민이 침상에 누워 안 걷는다(이 하네스 둘째 판이 밤에 걸려 창 0 이었다). 그래서 **걷기 시작할 때까지** 기다린다(상한 9분 ·
  //   창이 처음 선 뒤 15초는 더 모은다). 기다린 시간은 줄에 적는다 — 기다림이 판정을 바꾸지 않는다(창이 모이면 같은 자로 잰다).
  await page.evaluate(() => {
    window.__t888 = [];
    window.__t888T = setInterval(() => {
      const n = window.__getNpcs ? window.__getNpcs() : [];
      window.__t888.push([performance.now(), n.map((q) => [q.pid, q.wx, q.wy])]);
    }, 50);
  });
  let W = { speeds: [], npcs: 0 }, t0 = Date.now(), tFirst = null;
  while (Date.now() - t0 < 540000) {
    await sleep(5000);
    const rec = await page.evaluate(() => window.__t888.slice());
    W = windowSpeeds(rec);
    if (W.speeds.length > 0 && tFirst == null) tFirst = Date.now();
    if (W.speeds.length >= 60 && tFirst != null && Date.now() - tFirst >= 15000) break;
  }
  await page.evaluate(() => clearInterval(window.__t888T));
  const m = med(W.speeds);
  console.log(`    NPC ${W.npcs} · 곧은 1초 창 ${W.speeds.length} · 중앙 ${m.toFixed(1)} · p10 ${pct(W.speeds, 0.1).toFixed(1)} · p90 ${pct(W.speeds, 0.9).toFixed(1)} px/s · ${((Date.now() - t0) / 1000) | 0}초(걷기 기다림 ${tFirst == null ? '—' : (((tFirst - t0) / 1000) | 0) + '초'})`);
  ok(W.npcs >= 1 && W.speeds.length >= 20, `[${tag}] 걷는 NPC 의 곧은 창이 모였다(자명 통과 금지 — 창 0 이면 아래 판정은 공짜다)`, `NPC ${W.npcs} · 창 ${W.speeds.length}`);
  const nz = [...new Set(noise.filter((x) => !/^console:/.test(x)))];
  ok(errs.length === 0, `[${tag}] 스크립트 오류 0(자원 404 는 소음 — 따로 적는다)`, errs.length ? errs.slice(0, 2).join(' | ') : (nz.length ? `소음 ${nz.slice(0, 3).join(' · ')}` : ''));
  try { await page.screenshot({ path: path.join(SHOTS, `${tag}.png`) }); } catch (e) {}
  await browser.close();
  await killAll();
  return { med: m, n: W.speeds.length, npcs: W.npcs };
}

(async () => {
  console.log('\n=== 마을 NPC 걸음 = 플레이어 걸음 실클라 E2E (T888 · Chromium · 서버 권위 좌표) ===');
  ok(MOVE_SPEED > 0 && MULT_ON > 0 && MULT_OFF > 0, '기대 걸음을 소스에서 읽었다 — `MOVE_SPEED` · `NPC_WALK_MULT`(켬 · 끔)', `MOVE_SPEED ${MOVE_SPEED} · 켬 ×${MULT_ON} · 끔 ×${MULT_OFF}`);
  ok((ZSRC.match(/process\.env\.T888_NPC_WALK/g) || []).length === 1 && /\nconst T888_NPC_WALK = process\.env\.T888_NPC_WALK !== '0';/.test(ZSRC)
    && /MOVE_SPEED \* \(speedMult \|\| NPC_WALK_MULT\)/.test(ZSRC) && /let speedMult = npc\.behavior === 'flee' \? 2\.5 : NPC_WALK_MULT;/.test(ZSRC),
    '손잡이 한 자리(`!== \'0\'` = 켬 기본) · 배회 배율 한 글자를 두 자리(`npcStep` 기본 배속 · `followNpcPath` 기본값)가 같이 쓴다');
  const ON = await arm('on', null);
  const OFF = await arm('off', '0');
  const expOn = MOVE_SPEED * MULT_ON, expOff = MOVE_SPEED * MULT_OFF;
  if (ON) ok(Math.abs(ON.med / expOn - 1) <= 0.1, `★★① 켬 — NPC 곧은 걸음 = MOVE_SPEED × ${MULT_ON} = ${expOn}px/s(플레이어 걸음 · ±10%)`, `중앙 ${ON.med.toFixed(1)}px/s · 창 ${ON.n}`);
  if (OFF) ok(Math.abs(OFF.med / expOff - 1) <= 0.1, `★② 끔(=0) — 같은 자로 MOVE_SPEED × ${MULT_OFF} = ${expOff}px/s(종전 · 자가 두 걸음을 가른다)`, `중앙 ${OFF.med.toFixed(1)}px/s · 창 ${OFF.n}`);
  if (ON && OFF) ok(Math.abs((ON.med / OFF.med) / (MULT_ON / MULT_OFF) - 1) <= 0.1, `★③ 켬 ÷ 끔 = ${(MULT_ON / MULT_OFF).toFixed(3)}(±10%)`, `${(ON.med / OFF.med).toFixed(3)}`);
  console.log(`\n=== e2e-npc-walk 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await killAll(); process.exit(1); });
