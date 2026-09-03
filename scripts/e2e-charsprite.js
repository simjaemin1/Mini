#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-charsprite.js — 캐릭터 스프라이트 애니 **실클라** 계측 [재민 확정 2026-08-30] ===
//
// ★★[B-3 귀속 · 족보 70] 이동은 **키보드로**, 조준은 **마우스로**. 입력을 손으로 쏘면
//   클라 자기 루프(33ms 정지 입력)와 싸워 절반 속도가 되거나 아예 안 걷는다.
// ★★[족보 73] 마우스를 쏠 자리는 `elementFromPoint` 로 **캔버스가 맨 위인지** 확인하고 쓴다 —
//   HUD 오버레이(미니맵 라벨)가 덮은 자리를 누르고 "제품이 안 된다"고 보고한 적이 있다.
//
// 애니 상태는 `window.__charDbg[pid]` 로 읽는다(pid 별 — 두 클라 짝을 재려면 그래야 한다).
//
// 실행: node scripts/e2e-charsprite.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const argv = process.argv.slice(2);
const HEADED = argv.includes('--headed');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-charsprite-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-cs-c-${process.pid}.db`, ZDB = `/tmp/e2e-cs-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

// ── 열린 자리 — 정본에게 묻는다(하네스가 지형을 다시 짜지 않는다) ─────────────
function openSpot() {
  process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const CH = require(path.join(ROOT, 'server', 'chunk'));
  const ZM = ZONES.hanbando, CS = CH.CHUNK_SIZE, R = 420;
  const v = (T.getZoneVillages('hanbando') || [])[0];
  const cx0 = v ? v.x : Math.floor(ZM.zoneWidth / 2), cy0 = v ? v.y : Math.floor(ZM.zoneHeight / 2);
  for (let ring = 0; ring < 40; ring++) for (const [sx, sy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cx0 + sx * ring * 160, y = cy0 + sy * ring * 160;
    if (x < R + 64 || y < R + 64 || x > ZM.zoneWidth - R - 64 || y > ZM.zoneHeight - R - 64) continue;
    let clean = true;
    for (let dy = -R; dy <= R && clean; dy += 32) for (let dx = -R; dx <= R; dx += 32)
      if (T.isWaterCellLocal('hanbando', x + dx, y + dy) || T.isRockCellLocal('hanbando', x + dx, y + dy)) { clean = false; break; }
    if (!clean) continue;
    for (let ccy = Math.floor((y - R) / CS); ccy <= Math.floor((y + R) / CS) && clean; ccy++)
      for (let ccx = Math.floor((x - R) / CS); ccx <= Math.floor((x + R) / CS); ccx++)
        for (const e of (CH.generateChunkResources('hanbando', ZM.biome, ccx, ccy, CS, null) || []))
          if (Math.abs(e.x - x) <= R && Math.abs(e.y - y) <= R) { clean = false; break; }
    if (clean) return { x, y, WOX: ZM.worldOffsetX || 0, WOY: ZM.worldOffsetY || 0 };
  }
  return { x: cx0, y: cy0, WOX: ZM.worldOffsetX || 0, WOY: ZM.worldOffsetY || 0 };
}

(async () => {
  console.log('\n=== 캐릭터 스프라이트 애니 실클라 E2E (Chromium) ===');
  const SPOT = openSpot();
  console.log(`    열린 자리: 존 로컬(${SPOT.x},${SPOT.y})`);

  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    CHAR_SPRITE: 'on', MOVE_MODEL: 'accel', E2E_GIVE: '1',
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });

  async function newClient(tag) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const enter = await page.$('button:has-text("월드 입장")');
    if (enter) await enter.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(2000);
    page._errs = errs; page._tag = tag;
    return page;
  }

  const A = await newClient('A');
  ok(!!(await A.evaluate(() => window.__getMyAbs())), '[A] 존 입장');

  const myPid = () => A.evaluate(() => window.__myPid || (window.__charDbg && Object.keys(window.__charDbg).find((k) => window.__charDbg[k].isMe)));
  const dbgOf = (page, pid) => page.evaluate((p) => (window.__charDbg && (p ? window.__charDbg[p] : Object.values(window.__charDbg).find((x) => x.isMe))) || null, pid || null);
  const meAbs = (page) => page.evaluate(() => window.__getMyAbs());

  // ── ⓪ 검사 상황 — 무엇을 재고 있는가 ───────────────────────────────────
  console.log('\n=== ⓪ 검사 상황 선행 assert ===');
  const cfg = await A.evaluate(() => window.__uiCfg && window.__uiCfg());
  ok(!!cfg && cfg.charSprite === true, '★서버 env CHAR_SPRITE=on 이 uiCfg 로 실려 왔다 (클라 상수 아님)', cfg ? `walkMin=${cfg.charWalkMin} runMin=${cfg.charRunMin}` : 'null');
  const meta = await A.evaluate(() => window.__charMeta || null);
  ok(!!meta && meta.frameW > 0, '★클라가 char_meta.json 을 읽었다', meta ? `frame ${meta.frameW}x${meta.frameH} · 앵커 ${meta.anchorX},${meta.anchorY}` : 'null');

  // 열린 자리로
  for (let i = 0; i < 20; i++) {
    await A.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [SPOT.x, SPOT.y]);
    await sleep(700);
      // ★[핫픽스 2026-08-31 · 족보 ㊹] 도착은 **서버 권위**로 — 예측은 재접속 뒤 낡을 수 있다.
    const c = (await A.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await meAbs(A));
    if (c && Math.hypot(c.x - (SPOT.x + SPOT.WOX), c.y - (SPOT.y + SPOT.WOY)) <= 120) break;
  }
  await sleep(800);

  // ── ① 정지 = idle ─────────────────────────────────────────────────────
  console.log('\n=== ① 정지 → idle · 걷기 → walk · 달리기 → run ===');
  let d = await dbgOf(A);
  ok(!!d && d.on === true, '★스프라이트 경로로 그려진다 (도형 폴백이 아니다)', d ? `clip=${d.clip}` : 'null');
  ok(d && d.clip === 'idle', `정지 = idle`, d ? `speed=${d.speed}` : '');
  ok(d && d.layers.join(',') === 'body,clothes_hemp', `맨손 레이어 = 몸+베옷`, d ? d.layers.join(',') : '');

  // ── 걷기 ──────────────────────────────────────────────────────────────
  await A.keyboard.down('KeyD'); await sleep(700);
  const w1 = await dbgOf(A);
  await sleep(160);
  const w2 = await dbgOf(A);
  ok(w1 && w1.on === true && w1.clip === 'walk', `걷기 = walk`, w1 ? `on=${w1.on} clip=${w1.clip} speed=${w1.speed}` : '');
  ok(w1 && w2 && w1.frame !== w2.frame, `★프레임이 실제로 진행한다 (${w1 && w1.frame} → ${w2 && w2.frame})`);
  // 달리기(Shift)
  await A.keyboard.down('ShiftLeft'); await sleep(900);
  const r1 = await dbgOf(A);
  ok(r1 && r1.on === true && r1.clip === 'run', `달리기 = run`, r1 ? `on=${r1.on} clip=${r1.clip} speed=${r1.speed}` : '');
  ok(r1 && r1.speed > (cfg.charRunMin || 102), `속도가 문턱을 넘었다 ${r1 && r1.speed} > ${cfg.charRunMin}`);
  await A.keyboard.up('ShiftLeft');
  await A.keyboard.up('KeyD');
  // ★한 순간을 찍지 말고 **곡선을 재라**(족보 — 감속은 시간이 걸린다: accel 계약 0.15s + 스텝 격자).
  //   1차 실장은 900ms 뒤 한 번만 찍었다가 85px/s 를 보고 "감속 안 된다"고 오독했다.
  //   탐침으로 갈랐다: 실제로는 64 → 21.33 → 0 (400ms). **제품이 아니라 계측기가 틀렸다.**
  const decel = [];
  let i2 = null;
  for (let k = 0; k < 12; k++) {
    await sleep(150);
    i2 = await dbgOf(A);
    decel.push(i2 ? `${i2.speed}` : '?');
    if (i2 && i2.clip === 'idle' && i2.speed === 0) break;
  }
  console.log('    감속 곡선(px/s): ' + decel.join(' → '));
  ok(i2 && i2.clip === 'idle' && i2.speed === 0, `놓으면 감속해서 idle 로`, i2 ? `${decel.length * 150}ms 안에 0` : '');

  // ── ② 방향 전환 → 행 전환 ───────────────────────────────────────────────
  console.log('\n=== ② 방향 전환 → 시트 행 전환 ===');
  // ⚠[족보 74 재적용] 1차 실장은 "D=동(+x)" 이라 적었다가 전부 −1 행씩 어긋났다.
  //   `worldKeysDir` 은 각 키를 **화면 대각**(NW/NE/SE/SW)으로 더한다 — D 는 월드 (+1,−1) 이다.
  //   ⇒ 기대값을 축으로 적지 말고 **클라가 보고한 실제 페이싱에서 재유도**해 견준다.
  const rows = {};
  const expect = (fx, fy) => (((Math.round(Math.atan2(fy, fx) / (Math.PI / 4)) % 8) + 8) % 8);
  let rowBad = 0;
  for (const [k, nm] of [['KeyD', 'D'], ['KeyS', 'S'], ['KeyA', 'A'], ['KeyW', 'W']]) {
    await A.keyboard.down(k); await sleep(700);
    const dd = await dbgOf(A);
    const want = dd && dd.facing ? expect(dd.facing[0], dd.facing[1]) : -1;
    rows[nm] = dd ? `${dd.row}(기대 ${want} · 페이싱 ${dd.facing})` : '없음';
    if (!dd || dd.row !== want) rowBad++;
    await A.keyboard.up(k); await sleep(400);
  }
  console.log('    ' + Object.entries(rows).map(([k, v]) => `${k}→행${v}`).join('\n    '));
  ok(rowBad === 0, '★네 방향 모두 행 = 하네스 독립 재유도값과 일치');
  ok(new Set(Object.values(rows).map((v) => String(v).split('(')[0])).size === 4,
     '네 방향이 서로 다른 행을 쓴다');

  // ── ③ 조준 + 좌클릭 swing ──────────────────────────────────────────────
  console.log('\n=== ③ 우클릭 홀드 = aim · 좌클릭 = swing 원샷 ===');
  const box = await A.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  let curX = 0, curY = 0, curTop = 'null';
  for (const [fx, fy] of [[0.78, 0.70], [0.72, 0.62], [0.62, 0.72], [0.50, 0.62]]) {
    const x = box.l + box.w * fx, y = box.t + box.h * fy;
    const top = await A.evaluate(([a, b]) => { const el = document.elementFromPoint(a, b); return el ? el.tagName + '#' + (el.id || '') : 'null'; }, [x, y]);
    if (top === 'CANVAS#canvas') { curX = x; curY = y; curTop = top; break; }
  }
  ok(curTop === 'CANVAS#canvas', '★커서 자리가 캔버스 맨 위다 (HUD 오버레이 아님)', curTop);
  await A.mouse.move(curX, curY); await sleep(150);
  await A.mouse.down({ button: 'right' }); await sleep(700);
  const am = await dbgOf(A);
  ok(am && am.clip === 'aim', `조준 홀드 = aim`, am ? `clip=${am.clip} aiming=${am.aiming}` : '');
  ok(am && am.aiming === true, '조준 상태가 상태기계 입력으로 들어왔다');
  // 페이싱이 커서를 따르는가 — 조준 전후 행이 바뀌어야 한다
  const rowAim = am ? am.row : -1;
  ok(rowAim >= 0 && rowAim < 8, `조준 중 행 ${rowAim}`);

  // 좌클릭 → swing 원샷
  await A.mouse.down({ button: 'left' }); await sleep(80); await A.mouse.up({ button: 'left' });
  await sleep(150);
  const sw = await dbgOf(A);
  ok(sw && sw.clip === 'swing', `좌클릭 → swing 재생`, sw ? `frame=${sw.frame}` : '');
  await sleep(900);
  const sw2 = await dbgOf(A);
  ok(sw2 && sw2.clip !== 'swing', `원샷이 끝나고 이전 상태로 복귀`, sw2 ? sw2.clip : '');
  await A.mouse.up({ button: 'right' }); await sleep(600);
  const rel = await dbgOf(A);
  ok(rel && rel.clip === 'idle' && rel.aiming === false, '우클릭 놓으면 조준 해제 → idle');
  await A.screenshot({ path: path.join(SHOTS, 'cs-01-idle.png') });

  // ── ④ 도구 착장 → 레이어 등장 ───────────────────────────────────────────
  console.log('\n=== ④ 착장 → 레이어 등장 ===');
  const before = (await dbgOf(A)).layers.slice();
  await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', tools: ['axe'] }));
  await sleep(900);
  const tools = await A.evaluate(() => window.__getTools());
  ok(tools.length > 0, `도구 인스턴스 지급 ${tools.length}개`, tools.map((t) => t.type).join(','));
  await A.evaluate((id) => window.__sendPrimary({ type: 'equip', toolItemId: id }), tools[0] && tools[0].id);
  await sleep(900);
  const afterD = await dbgOf(A);
  ok(afterD && afterD.layers.includes('tool_axe'),
     `도구 장착 → tool_axe 레이어 등장`, `${before.join(',')} → ${afterD ? afterD.layers.join(',') : '?'}`);
  await A.screenshot({ path: path.join(SHOTS, 'cs-02-axe.png') });

  // 해제하면 사라진다 (자명 통과 금지 — 반대 방향도 밟는다)
  await A.evaluate(() => window.__sendPrimary({ type: 'equip', toolItemId: null }));
  await sleep(900);
  const offD = await dbgOf(A);
  ok(offD && !offD.layers.includes('tool_axe'), '해제하면 레이어가 사라진다', offD ? offD.layers.join(',') : '');

  // ── ⑤ 두 클라 짝 — 타 플레이어도 같은 애니 ──────────────────────────────
  console.log('\n=== ⑤ 두 클라 짝 — 타 플레이어도 같은 애니 ===');
  const B = await newClient('B');
  ok(!!(await B.evaluate(() => window.__getMyAbs())), '[B] 존 입장');
  const sp = await meAbs(A);
  let bDist = Infinity;
  for (let i = 0; i < 20; i++) {
    await B.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [SPOT.x + 60, SPOT.y]);
    await sleep(700);
      // ★[핫픽스 2026-08-31 · 족보 ㊹] 도착은 **서버 권위**로 — 예측은 재접속 뒤 낡을 수 있다.
    const c = (await B.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await meAbs(B));
    if (c) bDist = Math.hypot(c.x - (SPOT.x + SPOT.WOX + 60), c.y - (SPOT.y + SPOT.WOY));
    if (bDist <= 140) break;
  }
  // ★★[2026-08-31 밤 · 족보 57] **하네스는 자기 행동이 실제로 일어났는지 먼저 세라.**
  //   위 반복문은 20번 시도하고 **말없이** 빠져나올 수 있다. 그러면 B 가 엉뚱한 데 있는데도
  //   아래 두 판정이 "[A] 화면에 남이 0명" 으로 빨개진다 — 원인이 아니라 **증상**을 가리키는 실패다.
  //   실제로 회귀 러너 끝에서 그렇게 한 번 나왔고, 단독 실행에선 34/0 이었다.
  //   ⇒ 남을 보기 **전에** 남이 그 자리에 왔는지부터 센다. 여기서 깨지면 원인이 바로 읽힌다.
  ok(bDist <= 140, `[B] 짝이 A 옆에 도착했다(서버 권위)`, `거리 ${Number.isFinite(bDist) ? bDist.toFixed(0) : '측정 실패'}px ≤ 140`);
  // ★[2026-08-31 · 족보 ㊾] **시계로 기다리지 마라 — 조건으로 기다려라.**
  //   여기가 `await sleep(1200)` 한 줄이었다. 단독 실행에선 늘 통과했는데 러너 끝(하네스 40종을
  //   지난 뒤)에서만 "[A] 화면에 남이 0명" 으로 두 판정이 빨개졌다. 회귀가 아니라 **시간**이다 —
  //   B 의 텔레포트가 A 의 시야·틱·rAF 를 타고 오는 데 걸리는 시간이 부하에 따라 다르다.
  //   ⇒ 최대 8초까지 **남이 보일 때까지** 폴링한다. 안 보이면 그때 실패로 센다(감추지 않는다).
  let seen = [];
  for (let k = 0; k < 40; k++) {
    seen = await A.evaluate(() => Object.entries(window.__charDbg || {}).filter(([, v]) => !v.isMe).map(([k2, v]) => ({ pid: k2, clip: v.clip, row: v.row, layers: v.layers })));
    if (seen.length >= 1 && seen[0].clip === 'idle') break;
    await sleep(200);
  }
  ok(seen.length >= 1, `[A] 화면에 남이 스프라이트로 보인다 ${seen.length}명`, seen.map((x) => x.clip).join(','));
  ok(seen.length >= 1 && seen[0].clip === 'idle', '남도 정지 = idle');
  // B 가 걸으면 A 화면에서도 walk
  await B.keyboard.down('KeyS'); await sleep(1400);
  const seenW = await A.evaluate(() => Object.values(window.__charDbg || {}).filter((v) => !v.isMe).map((v) => ({ clip: v.clip, speed: v.speed, row: v.row })));
  await B.keyboard.up('KeyS'); await sleep(900);
  ok(seenW.length >= 1 && (seenW[0].clip === 'walk' || seenW[0].clip === 'run'),
     `★남이 걸으면 A 화면에서도 walk — **애니용 새 네트워크 필드 0**(tick 의 vx/vy 로 유도)`,
     seenW[0] ? `clip=${seenW[0].clip} speed=${seenW[0].speed}` : '');
  // ★남의 속도는 **서버 권위 vx/vy** 라 틱(30Hz)+지연을 타고 온다 — 여기서도 곡선을 잰다.
  const oth = [];
  let seenI = null;
  for (let k = 0; k < 14; k++) {
    seenI = await A.evaluate(() => Object.values(window.__charDbg || {}).filter((v) => !v.isMe).map((v) => ({ clip: v.clip, speed: v.speed }))[0] || null);
    oth.push(seenI ? `${seenI.clip}/${seenI.speed}` : '?');
    if (seenI && seenI.clip === 'idle') break;
    await sleep(200);
  }
  console.log('    남의 감속: ' + oth.join(' → '));
  ok(seenI && seenI.clip === 'idle', '남이 멈추면 다시 idle', `${oth.length * 200}ms 안에`);
  await A.screenshot({ path: path.join(SHOTS, 'cs-03-two.png') });

  // ── ⑥ 성능 — 합성 그리기 비용(라이브 rAF 짝 비교) ────────────────────────
  // ═══ [T57 2026-09-03] ⓔ **이름표가 시트 경로에서도 뜬다** ═════════════════════
  //   결함 기전: 이름표·행동 라벨이 옛 도형 경로(`drawPlayerIso`) **안**에 있었고,
  //   호출자는 `if (!_spriteOk) drawPlayerIso(...)` 라 **시트가 성공하면 안 불렀다**.
  //   ⇒ 시트 배치(T13) 이후 사람 머리 위 이름이 통째로 사라졌다(재민 실기 2026-09-03).
  //   판정: 이름 글자가 있어야 할 **머리 위 띠**에 배경과 다른 픽셀이 실제로 있는가.
  //   자명 통과 금지: 같은 자리를 **시트를 끈 대조군**(도형 경로)에서도 재서 둘 다 글자가 있어야 한다.
  console.log('\n=== ⓔ 이름표 — 시트 경로에도 뜬다 [T57] ===');
  {
    // ★자리 잡기: 카메라는 **나를 따라간다**(`_camAbs` = 내 자리) ⇒ 나는 늘 화면 한가운데다.
    //   그래서 `__w2s` 에 기대지 않는다(줌·조준 밀기가 끼면 그 훅의 값이 흔들린다).
    //   ⇒ 캔버스 중앙 위 띠를 자르고, **같은 크기의 빈 땅 띠**를 대조군으로 둔다.
    //     대조군보다 글자 픽셀이 확연히 많아야 "이름이 떴다"고 말할 수 있다(자명 통과 금지).
    // ★판정을 "밝은 픽셀 수"로 하지 않는다 — 그건 그 자리에 뭐가 깔렸느냐에 흔들린다
    //   (실측: 대조군 빈 땅이 어떤 판에선 어두운 픽셀 1767 이 나왔다 — 땅이 어두웠을 뿐이다).
    //   ⇒ **글자의 서명**을 센다: 이름표는 흰 글자 + 검은 외곽선이라 **밝은 픽셀 바로 옆에
    //     어두운 픽셀**이 있다. 지면·하늘·지붕엔 그런 자리가 거의 없다. 구조를 재는 자다.
    const bands = await A.evaluate(() => {
      const cv = document.getElementById('canvas');
      const g = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      const sig = (x0, y0, w, h) => {
        if (x0 < 0 || y0 < 0 || x0 + w > W || y0 + h > H) return null;
        const im = g.getImageData(x0, y0, w, h).data;
        const L = (x, y) => { const i = (y * w + x) * 4; return im[i] * 0.3 + im[i + 1] * 0.6 + im[i + 2] * 0.1; };
        let edge = 0, bright = 0, dark = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const l = L(x, y);
          if (l > 200) { bright++;
            // 바로 이웃에 아주 어두운 픽셀이 있나 = 글자 외곽선의 서명
            let near = false;
            for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy > 0 && yy < h && xx > 0 && xx < w && L(xx, yy) < 45) near = true;
            }
            if (near) edge++;
          } else if (l < 45) dark++;
        }
        return { edge, bright, dark, box: [x0, y0, w, h] };
      };
      const cx = Math.round(W / 2), cy = Math.round(H / 2);
      return { size: [W, H],
        head: sig(cx - 80, cy - 62, 160, 52),     // 머리 위 — 이름표·행동 라벨이 드는 띠(넉넉히)
        ctrl: sig(cx - 80, cy + 40, 160, 52) };   // 대조군 — 내 발밑 아래 지면(글자가 없는 자리)
    }).catch(() => null);
    const nb = bands && bands.head, cb = bands && bands.ctrl;
    console.log(`    캔버스 ${bands && bands.size} · 머리 위 ${nb ? JSON.stringify(nb.box) : '없음'}`
      + ` 글자서명 ${nb && nb.edge}(밝은 ${nb && nb.bright}) | 대조군(지면) 글자서명 ${cb && cb.edge}(밝은 ${cb && cb.bright})`);
    ok(!!nb && !!cb, '★전제 — 머리 위 띠와 대조군 띠를 화면에서 잘라냈다');
    const dNow = await dbgOf(A, await myPid());
    ok(dNow && dNow.on === true, '★전제 — 지금 **시트 경로**로 그려지고 있다(도형 폴백이 아니다)', dNow ? `clip=${dNow.clip}` : 'null');
    ok(nb && nb.edge > 15, '★★ⓔ 시트 경로에서 **이름 글자가 실제로 그려진다**(종전엔 하나도 없었다)',
      nb ? `글자서명 ${nb.edge} > 15` : 'x');
    ok(nb && cb && nb.edge > cb.edge * 3 + 10,
      '★ⓔ 자명 통과 금지 — 같은 크기의 **지면 띠**엔 그 서명이 없다(밝기 우연이 아니다)',
      nb && cb ? `머리 ${nb.edge} > 지면 ${cb.edge}×3+10` : 'x');
  }

  // ═══ [T57] ⓓ **8방향 표** — 걷는 화면 방향과 시트 행의 향 ═══════════════════
  //   카드의 물음: 호출자가 넣는 (fx,fy)가 월드인가 화면인가 · 시트 행이 어느 좌표계인가 · y 부호.
  //   ⇒ **재서** 답한다(눈대중 금지 — 족보 74). 아이소 변환은 정본 `__w2s` 하나를 쓴다(사본 금지).
  //   시트 행의 '향'은 **그 행 실루엣의 폭**으로 읽는다 — 사람은 옆에서 보면 좁고(몸 두께)
  //   앞뒤로 보면 넓다(어깨). 화면 가로로 걸으면 옆모습(좁음), 세로로 걸으면 앞뒤(넓음)여야 한다.
  //   이건 메타의 주장이 아니라 **시트 그림 자체**를 재는 것이다.
  console.log('\n=== ⓓ 8방향 — 걷는 화면 방향 ↔ 시트 행 [T57] ===');
  {
    const sheetW = (() => {
      // 시트에서 행별 실루엣 폭을 잰다(프레임 2 — 걸음 중간).
      const P = require(path.join(ROOT, 'node_modules', 'pngjs')).PNG;
      const png = P.sync.read(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'body_walk.png')));
      const FW = 109, FH = 90, out = [];
      for (let r = 0; r < 8; r++) {
        const cols = new Set();
        for (let y = r * FH; y < (r + 1) * FH; y++) for (let x = 2 * FW; x < 3 * FW; x++) {
          if (png.data[(y * png.width + x) * 4 + 3] > 40) cols.add(x);
        }
        out.push(cols.size);
      }
      return out;
    })();
    console.log('    시트 행별 실루엣 폭: ' + sheetW.map((w, i) => `${i}:${w}`).join(' '));
    const KEYS = [['KeyW', '↑'], ['KeyW+KeyD', '↗'], ['KeyD', '→'], ['KeyS+KeyD', '↘'],
                  ['KeyS', '↓'], ['KeyS+KeyA', '↙'], ['KeyA', '←'], ['KeyW+KeyA', '↖']];
    const rows = [];
    for (const [combo, arrow] of KEYS) {
      const ks = combo.split('+');
      for (const k of ks) await A.keyboard.down(k);
      await sleep(700);
      const d = await dbgOf(A, await myPid());
      for (const k of ks) await A.keyboard.up(k);
      await sleep(400);
      // ★화면 벡터는 **정본 아이소 변환**으로 옮긴다(각도 사본 금지 · 노출 훅 `__w2s`).
      //   ⚠"실제로 걸은 거리"로 재지 않는다 — 지형이 막으면 0이 되고, 그러면 **막힌 것**이
      //     "방향이 틀렸다"로 둔갑한다. 재는 것은 **바라보는 방향의 화면 투영**이다.
      // ★변환은 **클라에서 캐 온다** — 하네스가 아이소 식을 옮겨 적으면 그게 사본이다.
      //   `__s2w`(화면→월드)를 세 점에서 재 선형사상을 얻고, 그걸 **뒤집어** 월드→화면을 만든다.
      //   (`__w2s` 는 이 자리에서 NaN 을 냈다 — 카메라 상태를 타는 듯하다. 회부 한 줄.)
      const sv = d && d.facing ? await A.evaluate(([fx, fy]) => {
        const o = window.__s2w(0, 0), ex = window.__s2w(100, 0), ey = window.__s2w(0, 100);
        if (!o || !ex || !ey) return null;
        // 화면(1,0) → 월드 a, 화면(0,1) → 월드 b
        const ax = (ex.wx - o.wx) / 100, ay = (ex.wy - o.wy) / 100;
        const bx = (ey.wx - o.wx) / 100, by = (ey.wy - o.wy) / 100;
        const det = ax * by - ay * bx;
        if (!isFinite(det) || Math.abs(det) < 1e-9) return null;
        // 월드 v = s·a + t·b  ⇒  (s,t) = A⁻¹ v  — (s,t) 가 곧 화면 벡터다
        const sx = (by * fx - bx * fy) / det, sy = (-ay * fx + ax * fy) / det;
        return [sx, sy];
      }, d.facing).catch(() => null) : null;
      rows.push({ arrow, combo, facing: d && d.facing, row: d && d.row, screen: sv || [NaN, NaN],
                  faced: !!(d && d.facing && (d.facing[0] || d.facing[1])), w: d && sheetW[d.row] });
    }
    console.log('    키   월드(fvx,fvy)        화면(dx,dy)         행  실루엣폭  화면축');
    for (const r of rows) {
      // ★문턱을 눈대중으로 잡지 않는다 — **아이소 기하에서 유도한다**(족보 74).
      //   이 투영은 화면 y 가 절반이라(`w2i`: y=(wx+wy)/2) 월드 축방향은 화면에서 정확히 **2:1**이다.
      //   ⇒ 대각(2:1)과 순수 가로/세로를 가르려면 문턱이 2 **위**여야 한다. 1.8 로 두면
      //     대각 넷이 전부 '가로'로 잡혀 **멀쩡한 판정이 빨개진다**(첫 판이 그랬다: 4/8).
      const _rx = Math.abs(r.screen[0]), _ry = Math.abs(r.screen[1]);
      const ax = _rx > _ry * 4 ? '가로' : _ry > _rx * 4 ? '세로' : '대각';
      r.axis = ax;
      console.log(`    ${r.arrow}  ${JSON.stringify(r.facing)}  ${r.screen.map((v) => v.toFixed(1))}  ${r.row}  ${r.w}  ${ax}`);
    }
    const faced = rows.filter((r) => r.faced && isFinite(r.screen[0]) && isFinite(r.screen[1]));
    ok(faced.length === 8, '★전제 — 여덟 방향 모두 **바라보는 방향이 잡혔고 화면으로 옮겨졌다**', `${faced.length}/8`);
    ok(new Set(rows.map((r) => r.row)).size === 8, '★전제 — 여덟 방향이 **서로 다른 행 여덟 개**를 골랐다(한 행에 몰리지 않는다)',
      `${new Set(rows.map((r) => r.row)).size}/8`);
    // 판정: 화면 가로로 걸으면 시트 행이 **가장 좁은 축**, 세로면 **가장 넓은 축**이어야 한다.
    const wMin = Math.min(...sheetW), wMax = Math.max(...sheetW);
    let good = 0, bad = [];
    for (const r of rows) {
      if (r.w == null) { bad.push(`${r.arrow}:행없음`); continue; }
      const okRow = r.axis === '가로' ? (r.w <= wMin + (wMax - wMin) * 0.34)
                  : r.axis === '세로' ? (r.w >= wMax - (wMax - wMin) * 0.34)
                  : (r.w > wMin + (wMax - wMin) * 0.15 && r.w < wMax - (wMax - wMin) * 0.15);
      if (okRow) good++; else bad.push(`${r.arrow}(축 ${r.axis} · 폭 ${r.w})`);
    }
    ok(good === 8, '★★ⓓ 여덟 방향 **전부** 시트 행의 향이 걷는 화면 방향과 맞는다 (8/8)',
      good === 8 ? `8/8 (폭 ${wMin}~${wMax})` : `${good}/8 — 어긋남: ${bad.join(' ')}`);
    // ★측정 기록 — 시트는 **마주보는 두 방향을 못 가른다**(얼굴이 없다). 회부 근거.
    const P2 = require(path.join(ROOT, 'node_modules', 'pngjs')).PNG;
    const png2 = P2.sync.read(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'body_walk.png')));
    const FW = 109, FH = 90;
    const dAbs = (r1, r2) => { let s2 = 0, n = 0;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i1 = ((r1 * FH + y) * png2.width + 2 * FW + x) * 4, i2 = ((r2 * FH + y) * png2.width + 2 * FW + x) * 4;
        for (let c = 0; c < 4; c++) s2 += Math.abs(png2.data[i1 + c] - png2.data[i2 + c]);
        n += 4; }
      return s2 / n; };
    const opp = [0, 1, 2, 3].map((r) => dAbs(r, r + 4)), adj = [0, 1, 2, 3].map((r) => dAbs(r, (r + 1) % 8));
    console.log(`    [측정 — 판정 아님] 마주보는 행 차이 ${opp.map((v) => v.toFixed(2)).join(' ')}`
      + ` vs 이웃 행 차이 ${adj.map((v) => v.toFixed(2)).join(' ')}`);
    console.log('      ⇒ 마주보는 두 방향(동↔서·남↔북)이 이웃만큼도 안 다르다 = **시트가 앞뒤를 못 가른다**(얼굴이 없다).');
    console.log('      ⇒ 산식이 아니라 **에셋**의 문제다. 재렌더는 ART — 회부(`인계/R2-개체렌더.md`).');
  }

  console.log('\n=== ⑥ 성능 — rAF 짝 비교 (플래그 ON vs OFF · 같은 화면) ===');
  const measure = async (page, on) => page.evaluate(async (flag) => {
    const cfg = window.__uiCfg ? null : null;
    // 플래그는 uiCfg 로 온다 — 계측 동안만 뒤집는다(서버 env 는 그대로).
    window.__forceCharSprite = flag;
    const prev = window.__setCharSprite && window.__setCharSprite(flag);
    const t = [];
    await new Promise((res) => {
      let n = 0, last = performance.now();
      const step = () => {
        const now = performance.now();
        t.push(now - last); last = now;
        if (++n >= 90) return res();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    t.sort((a, b) => a - b);
    return { med: +t[Math.floor(t.length / 2)].toFixed(2), p90: +t[Math.floor(t.length * 0.9)].toFixed(2) };
  }, on);
  const perfOn = await measure(A, true);
  const perfOff = await measure(A, false);
  await measure(A, true);
  console.log(`    프레임 간격 중앙값 — ON ${perfOn.med}ms · OFF ${perfOff.med}ms  (p90 ${perfOn.p90} / ${perfOff.p90})`);
  ok(true, `합성 비용(레이어 ${(await dbgOf(A) || { layers: [] }).layers.length}장 × 2명) = ON−OFF ${(perfOn.med - perfOff.med).toFixed(2)}ms/프레임`);
  ok(perfOn.med < 60, `ON 에서도 프레임 간격 ${perfOn.med}ms < 60ms — 헤드리스 SwiftShader 기준 상한`);

  console.log('\n=== ⑦ 콘솔 오류 ===');
  const real = (a) => a.filter((x) => !/favicon|404 \(Not Found\)/.test(x));
  ok(real(A._errs).length === 0, '[A] 페이지 오류 0 (favicon 404 제외)', real(A._errs).slice(0, 2).join(' | '));
  ok(real(B._errs).length === 0, '[B] 페이지 오류 0', real(B._errs).slice(0, 2).join(' | '));

  await browser.close();
  console.log(`\n    스크린샷: ${SHOTS}`);
  console.log(`\n=== e2e-charsprite 결과: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); process.exit(1); });
