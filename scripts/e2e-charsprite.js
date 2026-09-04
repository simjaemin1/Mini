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
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    const enter = await page.$('#enter');
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
  // ★★[T87 2026-09-03] **짝은 `SPOT` 이 아니라 A **옆**에 세운다.**
  //   종전엔 `SPOT.x + 60` 으로 보냈는데(그 자리는 ⓪ 에서 A 가 서 있던 자리다), ①~③ 이
  //   A 를 걷게·달리게 해 놔서 그때쯤 A 는 SPOT 에서 140~190px 밀려나 있다. 그러면 짝이
  //   A 로부터 110~150px — **80px 밖**이고, 거기서부터는 `coneMultEntity` 가 **시야 뿔**을 건다:
  //     `dist < 80` 이면 무조건 보이고, 그 밖은 페이싱과의 내적이 −0.2 이하면 **안 보인다**.
  //   A 는 마지막에 오른쪽(+x)을 보고 서 있었고 짝은 그 **뒤**에 떨어졌다 ⇒ A 화면에서 0명.
  //   ★제품 결함이 아니다 — 뒤에 선 사람이 안 보이는 건 이 게임의 규약이다(`20-r2-visibility.js`
  //     "살아 움직이는 것에만 건다"). **하네스가 짝을 A 뒤에 세운 것**이 결함이었다.
  //     (이 절을 처음 쓴 사람도 그럴 뜻이었다 — `sp` 를 받아 놓고 안 썼다.)
  //   ⇒ A 의 **지금 자리** 옆 60px 에 세운다. 60 < 80 이라 페이싱과 무관하게 보인다(그 수가 근거다).
  const sp = await meAbs(A);
  const BX = Math.round(sp.x - SPOT.WOX) + 60, BY = Math.round(sp.y - SPOT.WOY);
  let bDist = Infinity;
  for (let i = 0; i < 20; i++) {
    await B.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [BX, BY]);
    await sleep(700);
      // ★[핫픽스 2026-08-31 · 족보 ㊹] 도착은 **서버 권위**로 — 예측은 재접속 뒤 낡을 수 있다.
    const c = (await B.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await meAbs(B));
    if (c) bDist = Math.hypot(c.x - (BX + SPOT.WOX), c.y - (BY + SPOT.WOY));
    if (bDist <= 140) break;
  }
  // ★★[2026-08-31 밤 · 족보 57] **하네스는 자기 행동이 실제로 일어났는지 먼저 세라.**
  //   위 반복문은 20번 시도하고 **말없이** 빠져나올 수 있다. 그러면 B 가 엉뚱한 데 있는데도
  //   아래 두 판정이 "[A] 화면에 남이 0명" 으로 빨개진다 — 원인이 아니라 **증상**을 가리키는 실패다.
  //   실제로 회귀 러너 끝에서 그렇게 한 번 나왔고, 단독 실행에선 34/0 이었다.
  //   ⇒ 남을 보기 **전에** 남이 그 자리에 왔는지부터 센다. 여기서 깨지면 원인이 바로 읽힌다.
  ok(bDist <= 140, `[B] 짝이 A 옆에 도착했다(서버 권위)`, `거리 ${Number.isFinite(bDist) ? bDist.toFixed(0) : '측정 실패'}px ≤ 140`);
  // ★상황부터 잰다 — 짝이 **A 의 무조건 보이는 반경(80px) 안**에 있는가. 밖이면 시야 뿔이 걸려
  //   아래 판정이 "애니가 안 온다"가 아니라 "뒤에 서 있다"를 재게 된다(그게 T81 까지의 상시 빨강이었다).
  {
    const aNow = await meAbs(A), bNow = await meAbs(B);
    const gap = Math.hypot(aNow.x - bNow.x, aNow.y - bNow.y);
    ok(gap < 80, '★★검사 전제 — 짝이 A 의 **무조건 보이는 반경**(80px · coneMultEntity) 안에 있다',
      `A↔B ${gap.toFixed(0)}px < 80`);
  }
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
      // ★★[T70 2026-09-03] **`__w2s` 는 멀쩡했다 — 우회를 걷는다.**
      //   T57 이 여기서 NaN 을 보고 "카메라 상태를 타는 듯"이라 적고 `__s2w` 를 세 점에서 재
      //   **뒤집어 쓰는** 우회를 넣었다. 재현 조건은 카메라가 아니라 **키 이름**이었다:
      //       `__s2w(px,py) → {wx, wy}`      `__w2s(wx,wy) → {px, py}`
      //   T57 코드가 `.x`/`.y` 를 읽었고 둘 다 없는 키라 `undefined − undefined = NaN` 이 됐다.
      //   (`e2e-zoom`·`e2e-onboarding` 은 처음부터 `.px`/`.py` 를 읽어 멀쩡히 돌고 있었다.)
      //   ⇒ 이름이 자기를 말하는 계약이다(w=월드 · p=픽셀). 우회 대신 **정본을 그대로 부른다.**
      const sv = d && d.facing ? await A.evaluate(([fx, fy]) => {
        const m = window.__getMyAbs();
        const s0 = window.__w2s(m.x, m.y), s1 = window.__w2s(m.x + fx * 64, m.y + fy * 64);
        if (!s0 || !s1) return null;
        return [s1.px - s0.px, s1.py - s0.py];
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
  }

  // ═══ [T65 2026-09-03] ⓕ **시트가 앞뒤를 가르는가** — T57 이 세운 자를 검사 절로 승격 ═══
  //   T57 은 이 자리를 '측정 — 판정 아님'으로만 찍었다. T65 가 시트를 다시 구웠으니 **판정한다.**
  //
  //   ★자를 하나 바꿨다. T57 의 '마주보는 행 차이 vs 이웃 행 차이'는 **다른 종류의 변화를 견준다** —
  //     이웃 행은 실루엣이 45° 통째로 돌아 차이가 크고, 마주보는 행은 실루엣이 같아 차이가 작다.
  //     실측으로 그 비는 앞 절반을 새까맣게 칠해도 0.447 을 못 넘었다(T65 보고서 §1). 1 은 닿을 수 없는 선이다.
  //   ⇒ 대신 **방향이 붙은 신호**를 잰다: 카메라를 향한 행(0·1·2)과 등진 행(4·5·6)의
  //     ⓐ 머리 영역 평균 밝기(앞이 밝다 — 이마가 살색, 뒤통수가 머리칼)
  //     ⓑ 옷 층 평균 밝기(앞이 어둡다 — 앞섶이 한 톤 짙다)
  //   ⇒ 자명 통과 금지: 행 순서를 **4칸 돌려**(앞뒤를 맞바꿔) 같은 자를 대면 부호가 뒤집혀야 한다.
  //     신호가 없는 시트는 둘 다 0 근처라 이 검사를 통과할 수 없다.
  console.log('\n=== ⓕ 시트가 앞뒤를 가른다 [T65] ===');
  {
    const P = require(path.join(ROOT, 'node_modules', 'pngjs')).PNG;
    const FW = 109, FH = 90;
    const rd = (n) => P.sync.read(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', n)));
    const lumRows = (png, headOnly) => {
      const nf = Math.floor(png.width / FW), out = [];
      for (let r = 0; r < 8; r++) {
        const vals = [];
        for (let f = 0; f < Math.min(nf, 4); f++) {
          let top = 1e9;
          for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
            const i = ((r * FH + y) * png.width + f * FW + x) * 4;
            if (png.data[i + 3] > 120 && y < top) top = y;
          }
          if (top > FH) continue;
          const y0 = headOnly ? top : 0, y1 = headOnly ? Math.min(FH, top + 7) : FH;
          let sum = 0, n = 0;
          for (let y = y0; y < y1; y++) for (let x = 0; x < FW; x++) {
            const i = ((r * FH + y) * png.width + f * FW + x) * 4;
            if (png.data[i + 3] > 200) { sum += png.data[i] * 0.3 + png.data[i + 1] * 0.6 + png.data[i + 2] * 0.1; n++; }
          }
          if (n > 10) vals.push(sum / n);
        }
        out.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
      }
      return out;
    };
    const gap = (v, sgn, rot) => {
      const g = (k) => v[(k + (rot || 0)) % 8];
      return sgn * (((g(0) + g(1) + g(2)) / 3) - ((g(4) + g(5) + g(6)) / 3));
    };
    // ★문턱은 **유도한다**(족보 74): 옛 시트와 새 시트의 실측을 로그 중앙(기하평균)에서 가른다.
    //   머리   옛 +2.35 · 새 +26.74  ⇒ √(2.35×26.74) = 7.9  ⇒ K_HEAD = 8
    //   옷     옛 +0.06 · 새 +14.73  ⇒ 옛이 사실상 0 이라 기하평균이 무의미 ⇒ 새 값의 1/3 로 잡는다 = 5
    const K_HEAD = 8, K_CLOTH = 5;
    for (const clip of ['idle', 'walk']) {
      const body = rd(`body_${clip}.png`), cloth = rd(`clothes_hemp_${clip}.png`);
      const hv = lumRows(body, true), cv = lumRows(cloth, false);
      const hGap = gap(hv, +1, 0), cGap = gap(cv, -1, 0);          // 머리는 앞이 밝다 · 옷은 앞이 어둡다
      const hRot = gap(hv, +1, 4), cRot = gap(cv, -1, 4);          // 앞뒤를 맞바꾼 대조군
      console.log(`    [${clip}] 머리 밝기 행별 ${hv.map((x) => x.toFixed(0)).join(' ')}  ⇒ 앞−뒤 ${hGap.toFixed(2)}`);
      console.log(`    [${clip}] 옷  밝기 행별 ${cv.map((x) => x.toFixed(0)).join(' ')}  ⇒ 뒤−앞 ${cGap.toFixed(2)}`);
      ok(hGap > K_HEAD, `★★ⓕ[${clip}] **앞을 보면 머리가 밝다**(이마) · 등지면 어둡다(뒤통수)`, `앞−뒤 ${hGap.toFixed(2)} > ${K_HEAD}`);
      ok(cGap > K_CLOTH, `★★ⓕ[${clip}] **앞을 보면 옷이 짙다**(앞섶)`, `뒤−앞 ${cGap.toFixed(2)} > ${K_CLOTH}`);
      ok(hRot < -K_HEAD * 0.5 && cRot < -K_CLOTH * 0.5,
        `★ⓕ[${clip}] 자명 통과 금지 — 행을 4칸 돌리면(앞뒤 맞바꿈) **부호가 뒤집힌다**`,
        `머리 ${hRot.toFixed(2)} · 옷 ${cRot.toFixed(2)} (신호 없는 시트는 둘 다 0 근처라 여기서 깨진다)`);
    }
  }

  // ═══ [T70 2026-09-03] ⓖ 투영 훅 왕복 · 셀 훅 선언 자리 ═══════════════════════
  //   ⓐ `__w2s` 는 NaN 을 내지 않는다 — T57 의 NaN 은 **키 이름**을 잘못 읽은 것이었다.
  //     그 사실을 검사로 못 박는다: 세 점을 왕복시켜 **모두 유한**이고 제자리로 돌아오는가.
  //   ⓑ 셀 계측 훅은 **한 자리에서만** 선언돼야 한다(소스 검사). 훅이 두 파일에 흩어지면
  //     다음 사람이 어느 쪽을 고쳐야 하는지 모르고, 한쪽만 고쳐 조용히 어긋난다.
  console.log('\n=== ⓖ 투영 훅 왕복 · 셀 훅 선언 자리 [T70] ===');
  {
    const rt = await A.evaluate(() => {
      const pts = [[0, 0], [200, 120], [-350, 480]];
      const out = [];
      for (const [dx, dy] of pts) {
        const m = window.__getMyAbs();
        const w = { x: m.x + dx, y: m.y + dy };
        const sc = window.__w2s(w.x, w.y);
        if (!sc) { out.push(null); continue; }
        const b = window.__s2w(sc.px, sc.py);
        out.push({ px: sc.px, py: sc.py, back: [b.wx, b.wy], want: [w.x, w.y] });
      }
      return out;
    }).catch(() => null);
    const finite = !!rt && rt.every((r) => r && isFinite(r.px) && isFinite(r.py));
    const worst = finite ? Math.max(...rt.map((r) => Math.hypot(r.back[0] - r.want[0], r.back[1] - r.want[1]))) : Infinity;
    console.log(`    왕복 세 점 — ${rt ? rt.map((r) => (r ? `(${r.px.toFixed(0)},${r.py.toFixed(0)})` : 'null')).join(' ') : '없음'}`
      + ` · 최대 왕복 오차 ${isFinite(worst) ? worst.toFixed(3) : '∞'}px`);
    ok(finite, '★★ⓖ `__w2s` 가 세 점 모두 **유한값**을 낸다 (NaN 0) — T57 의 NaN 은 키 이름 오독이었다',
      finite ? '3/3 유한' : '비유한 있음');
    ok(worst < 1.0, '★ⓖ 월드→화면→월드 왕복이 제자리로 돌아온다', `최대 ${isFinite(worst) ? worst.toFixed(3) : '∞'}px < 1.0`);

    const CDIR = path.join(ROOT, 'public', 'client');
    const decl = [];
    for (const f of fs.readdirSync(CDIR).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(CDIR, f), 'utf8');
      // 선언 형태 둘을 다 본다: `window.__X = {` · `Object.assign(window, { __X: {`
      for (const m of src.matchAll(/(?:window\.__|__)(simvilCells|claimCells)\s*[:=]\s*\{\s*cand/g)) decl.push(`${f}:${m[1]}`);
    }
    console.log(`    셀 훅 선언 자리: ${decl.join(' · ') || '없음'}`);
    const files = new Set(decl.map((d) => d.split(':')[0]));
    ok(decl.length === 2 && files.size === 1,
      '★★ⓖ 셀 계측 훅 둘이 **같은 파일 한 자리**에서 선언된다',
      `${decl.length}개 선언 · 파일 ${[...files].join(',') || '없음'}`);
  }

  console.log('\n=== ⑥ 성능 — rAF 짝 비교 (플래그 ON vs OFF · 같은 화면) ===');
  // ★[T70] 자기 실패 검사기 — `CHARSPRITE_SABOTAGE=1` 이면 **ON 팔에만** 일부러 일을 얹는다.
  //   판정을 비율로 옮겼으니 "무엇을 넣어도 통과"하지 않는다는 걸 밖에서 보일 수 있어야 한다.
  const PERF_SAB = process.env.CHARSPRITE_SABOTAGE === '1';
  if (PERF_SAB) console.log('    ★사보타주 — ON 팔에만 프레임마다 헛일을 얹는다(비율이 올라가 빨개져야 한다)');
  const measure = async (page, on) => page.evaluate(async ([flag, sab]) => {
    // 플래그는 uiCfg 로 온다 — 계측 동안만 뒤집는다(서버 env 는 그대로).
    window.__forceCharSprite = flag;
    const prev = window.__setCharSprite && window.__setCharSprite(flag);
    const t = [];
    await new Promise((res) => {
      let n = 0, last = performance.now();
      const step = () => {
        // ★사보타주의 크기는 **잡을 대상**에서 정한다 — 이 검사가 막으려는 회귀는
        //   "시트 경로가 도형 경로의 **두 배**로 비싸진다"이다. 프레임 간격이 ~36ms 이므로
        //   두 배가 되려면 ~36ms 를 더 얹어야 한다. 12ms 로 두면 효과비 1.29 밖에 안 돼
        //   **문턱(K=1.6) 밑을 지나간다** — 그건 사보타주가 약한 것이지 문턱이 헐거운 게 아니다.
        //   (문턱을 사보타주에 맞춰 내리면 그건 대조군에 판정을 맞추는 것이다 — 거꾸로다.)
        if (sab && flag) { const e = performance.now() + 40; while (performance.now() < e) { /* 헛일 */ } }
        const now = performance.now();
        t.push(now - last); last = now;
        if (++n >= 90) return res();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    t.sort((a, b) => a - b);
    return { med: +t[Math.floor(t.length / 2)].toFixed(2), p90: +t[Math.floor(t.length * 0.9)].toFixed(2) };
  }, [on, PERF_SAB]);
  // ★★[T70 2026-09-03] **절대 문턱(60ms)을 비율의 비율로 바꾼다**(T49 처방 · 족보 ⑻⓪).
  //   왜: `ON < 60ms` 는 **그날 기계가 얼마나 바빴는지**를 잰다. 실측으로 같은 하네스가
  //   34.0 · 38.2 · 72.4ms 를 오갔고(72.4 인 판은 다른 계측을 같이 돌리던 판이었다),
  //   그때 빨간 건 제품이 아니라 **기계**였다. 러너의 빨강이 제품 회귀를 안 뜻하게 되면
  //   사람은 빨강을 무시하는 법을 배운다.
  //   ⇒ 재는 것은 "시트 경로가 도형 경로보다 **얼마나** 비싼가"다. 같은 실행 안에서
  //     ON 을 **두 번** 재 잡음 바닥을 얻고, 효과비(ON중앙/OFF)를 그 잡음비로 나눈다.
  //   ⇒ 잡음이 크면 **판정하지 않는다**("안 비쌌다"가 아니라 "못 쟀다"). 절대값은 참고 출력.
  const perfOn = await measure(A, true);
  const perfOff = await measure(A, false);
  const perfOn2 = await measure(A, true);            // ★같은 조건 두 번 = 잡음 바닥
  const _o1 = perfOn.med, _o2 = perfOn2.med, _off = Math.max(0.01, perfOff.med);
  const noiseR = Math.max(_o1, _o2) / Math.max(0.01, Math.min(_o1, _o2));
  const onMed = (_o1 + _o2) / 2;
  const effectR = onMed / _off;
  const PK = parseFloat(process.env.CHAR_PERF_K || '1.6') || 1.6;
  const PNMAX = parseFloat(process.env.CHAR_PERF_NOISE_MAX || '1.5') || 1.5;
  console.log(`    프레임 간격 중앙값 — ON ${_o1}ms / ${_o2}ms · OFF ${perfOff.med}ms  (p90 ${perfOn.p90} / ${perfOff.p90})`);
  console.log(`    잡음 바닥 — 같은 조건(ON) 두 번 ${_o1}ms vs ${_o2}ms → 잡음비 ${noiseR.toFixed(3)}`);
  console.log(`    [참고 — 판정 아님] 절대 문턱 60ms · ${onMed < 60 ? '넘음' : '★못 넘음'} (ON 중앙 ${onMed.toFixed(1)}ms)`);
  ok(true, `합성 비용(레이어 ${(await dbgOf(A) || { layers: [] }).layers.length}장 × 2명) = ON−OFF ${(onMed - perfOff.med).toFixed(2)}ms/프레임`);
  ok(noiseR < 3, '⑥ 전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${noiseR.toFixed(3)}`);
  if (noiseR < PNMAX) {
    ok(effectR < noiseR * PK,
      `★★⑥ 시트 경로가 도형 경로보다 **눈에 띄게 비싸지 않다** — 비율의 비율 ${(effectR / Math.max(0.01, noiseR)).toFixed(2)} < ${PK}`,
      `효과비 ${effectR.toFixed(3)}(ON 중앙 ${onMed.toFixed(1)}ms / OFF ${perfOff.med}ms) vs 잡음비 ${noiseR.toFixed(3)}`);
  } else {
    console.log(`    ★이 판은 잡음이 커서(${noiseR.toFixed(3)} ≥ ${PNMAX}) ⑥ 을 가를 수 없다 — 판정하지 않는다("안 비쌌다"가 아니라 "못 쟀다").`);
    ok(effectR < noiseR * 3,
      '⑥ [잡음 큼] 최소한 **잡음 몇 배로 비싸지지는 않았다**(이것만 잰다)',
      `효과비 ${effectR.toFixed(3)} < 잡음비 ${noiseR.toFixed(3)}×3`);
  }

  // ═══ [T81 2026-09-03] ⓗ **옷 층 — 여섯이 갈린다** (시트 층) ═══════════════════
  //   재민 확정(09-03): "색 선택을 빼고 옷이 외형 축." 그러면 **옷 여섯이 서로 갈려야** 축이 된다.
  //   ★대조군은 **0 이다** — 같은 옷 두 번은 같은 시트다. 그래서 "0보다 크다"는 판정이 아니라 자명이다.
  //   ⇒ 잣대는 이 시트가 이미 "이 크기에서 읽힌다"고 인정한 유일한 수에서 온다(족보 74):
  //     T65 가 앞뒤를 가르려고 **채택한 앞섶 신호 = 평균 휘도차 14.73**.
  //     두 옷은 |Δ휘도| ≥ 14.7 **이거나** 화소의 절반 이상이 눈에 띄게 다른 색이어야 한다
  //     (휘도가 같아도 색이 다르면 갈린다 — 풀옷↔삼베가 그 경우다).
  console.log('\n=== ⓗ 옷 층 — 여섯이 갈린다(시트) ===');
  {
    const P = require(path.join(ROOT, 'node_modules', 'pngjs')).PNG;
    const DIR = path.join(ROOT, 'public', 'assets', 'char');
    const META = JSON.parse(fs.readFileSync(path.join(DIR, 'char_meta.json'), 'utf8'));
    const MATS = (META.layers || []).filter((l) => l.startsWith('clothes_')).map((l) => l.slice('clothes_'.length));
    ok(MATS.length === 6, `옷 층이 여섯이다 — 품목 표(server/clothes.js)와 같은 수`, MATS.join(','));
    const frameOf = (mat) => {
      const png = P.sync.read(fs.readFileSync(path.join(DIR, `clothes_${mat}_idle.png`)));
      const fw = META.frameW, fh = META.frameH, row = 2, col = 0;   // 한 방향·한 프레임이면 충분하다(같은 자리끼리 견준다)
      const out = [];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const i = ((row * fh + y) * png.width + (col * fw + x)) * 4;
        out.push([png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]);
      }
      return out;
    };
    const F = {}; let missing = 0;
    for (const m of MATS) { try { F[m] = frameOf(m); } catch (e) { missing++; } }
    ok(missing === 0, '여섯 층의 idle 시트가 전부 있다', missing ? `없음 ${missing}장` : '');
    const L = (p2) => 0.2126 * p2[0] + 0.7152 * p2[1] + 0.0722 * p2[2];
    const cmp = (a2, b2) => {
      let n = 0, tot = 0, s2 = 0;
      for (let i = 0; i < a2.length; i++) {
        const pa = a2[i], pb = b2[i];
        if (pa[3] <= 150 && pb[3] <= 150) continue;
        tot++;
        if (Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2])) > 16) n++;
        s2 += Math.abs(L(pa) - L(pb));
      }
      return { r: tot ? n / tot : 0, dl: tot ? s2 / tot : 0 };
    };
    // ★대조군 먼저 — 같은 옷 두 번은 **0** 이어야 한다. 여기서 0이 아니면 자가 틀린 것이다.
    const ctl = cmp(F[MATS[0]], F[MATS[0]]);
    ok(ctl.r === 0 && ctl.dl === 0, '★대조군 — 같은 옷끼리는 다른 화소 0 · |Δ휘도| 0 (자가 0을 낸다)',
      `${(ctl.r * 100).toFixed(1)}% · ${ctl.dl.toFixed(2)}`);
    const BAR = 14.7;   // T65 채택 앞섶 신호(눈대중 금지 — 족보 74)
    const weak = [];
    for (let i = 0; i < MATS.length; i++) for (let j = i + 1; j < MATS.length; j++) {
      const a3 = MATS[i], b3 = MATS[j];
      if (!F[a3] || !F[b3]) continue;
      const c = cmp(F[a3], F[b3]);
      if (!(c.dl >= BAR || c.r >= 0.5)) weak.push(`${a3}↔${b3}(|Δ|${c.dl.toFixed(1)}·${(c.r * 100).toFixed(0)}%)`);
    }
    ok(weak.length === 0, `★★★ⓗ 여섯 옷이 **쌍마다 갈린다** (${MATS.length * (MATS.length - 1) / 2}쌍 · |Δ휘도| ≥ ${BAR} 또는 다른 화소 ≥ 50%)`,
      weak.length ? `못 갈린 쌍: ${weak.join(' ')}` : '');
    // ★실루엣 — 갖옷만 제 기하(털 두께). 색이 아니라 **모양**으로도 갈리는 옷이 하나 있어야
    //   빛·색맹·압축에 안 무너지는 신호가 생긴다(§0-ⓐ 가 가죽옷과 색으로 못 가른 자리다).
    const box = (mat) => {
      const f = F[mat]; const fw = META.frameW;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
      for (let i = 0; i < f.length; i++) if (f[i][3] > 150) {
        const x = i % fw, y = (i / fw) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, n };
    };
    if (F.fur && F.hemp) {
      const bf = box('fur'), bh = box('hemp');
      console.log(`    실루엣 — 갖옷 ${bf.w}x${bf.h}(${bf.n}px) · 삼베 ${bh.w}x${bh.h}(${bh.n}px)`);
      ok(bf.w > bh.w && bf.n > bh.n * 1.1,
        '★★ⓗ 갖옷은 **실루엣도 다르다**(털 두께) — 색 말고도 갈리는 축이 하나 있다',
        `폭 ${bh.w}→${bf.w} · 화소 ${bh.n}→${bf.n}`);
    }
  }

  // ═══ [T81] ⓘ **남의 착장** — 둘째 클라가 첫째의 옷을 본다 ═══════════════════
  //   `charLayersFor` 주석이 "남의 착장은 네트워크에 없다(회부)"라고 적어 둔 자리다.
  //   ★자명 통과 금지: "본다"만 재면 기본 베옷이 우연히 맞아도 초록이다.
  //     ⇒ **옷을 바꾸면 둘째 화면의 층 이름이 따라 바뀌는지**를 잰다.
  console.log('\n=== ⓘ 남의 착장 — 둘째 클라가 첫째의 옷을 본다 ===');
  {
    // ★A 의 pid — 이 하네스가 이미 쓰는 술어를 그대로 쓴다(`window.__myPid` 는 없는 훅이다).
    const aPid = await myPid();
    ok(!!aPid, '검사 전제 — A 의 pid 를 안다', aPid || '못 찾음');
    // ★★**상황부터 만든다.** ⑤ 뒤에 ⓓ 가 A 를 8방향으로 걸려 놨다 — 둘이 서로 시야 밖일 수 있다.
    //   그리고 `__charDbg` 는 **지우지 않는다**: 시야에서 사라져도 옛 항목이 그대로 남는다.
    //   그래서 "B 의 훅에 A 가 있다"는 **지금 보고 있다는 뜻이 아니다**(실측으로 여기서 틀렸다 —
    //   12초를 기다려도 옛 삼베 값이 나왔다. 값이 안 온 게 아니라 **B 가 A 를 안 그리고 있었다**).
    //   ⇒ B 를 A 옆으로 데려오고, **훅의 시각이 실제로 나아가는지**로 '지금 그린다'를 증명한다.
    {
      const aAbs = await meAbs(A);
      for (let i = 0; i < 12; i++) {
        await B.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }),
          [Math.round(aAbs.x - SPOT.WOX) + 60, Math.round(aAbs.y - SPOT.WOY)]);
        await sleep(600);
        const c = (await B.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null)));
        if (c && Math.hypot(c.x - (aAbs.x + 60), c.y - aAbs.y) <= 140) break;
      }
      const tOf = () => B.evaluate((p2) => ((window.__charDbg || {})[p2] || {}).t || 0, aPid);
      let moved = false;
      for (let k = 0; k < 12 && !moved; k++) { const t1 = await tOf(); await sleep(500); moved = (await tOf()) > t1; }
      ok(moved, '★★검사 전제 — 둘째 클라가 **지금** 첫째를 그리고 있다(훅 시각이 나아간다)');
    }
    // ★입히는 길은 **이미 있는 정본 경로**다(족보 88 — 없는 줄 알고 만들 뻔했다):
    //   `__e2e_give` 의 `equip:` 가지(T12 신설)가 `PlayerItems.craftItem` + `doEquipItem` 를 그대로 부른다.
    //   ⚠제품의 제작 경로(`craft_equipment`)는 **작업대 앞에서만** 돌고(§8.5 시설 게이트) 큐에 들어간다 —
    //     이 하네스는 시설·대기열이 아니라 **옷 층**을 재는 자리라 지급 경로를 쓴다(서버 변경 0).
    const wear = async (mat) => {
      await A.evaluate((m) => window.__sendPrimary({ type: '__e2e_give', equip: [{ type: 'clothes', material: m, lvl: 5 }] }), mat);
      for (let k = 0; k < 30; k++) {
        const st = await A.evaluate(() => window.__equipState());
        const id = st && st.slots && st.slots.clothes;
        const inst = id ? (st.equipment || []).find((e) => e.id === id) : null;
        if (inst && inst.mat === mat) return inst.id;
        await sleep(200);
      }
      return null;
    };
    // ★★기다림은 **바라는 값**으로 한다 — "층 목록이 있다"로 빠져나오면 **낡은 값**을 집는다.
    //   실측으로 그렇게 틀렸다: 둘째 클라의 `__charDbg` 는 rAF 가 쓰는데 백그라운드 탭은 rAF 가
    //   느려서, 옷 정보는 이미 `others` 에 와 있는데 훅만 옛 값이었다(선을 직접 떠서 확인 —
    //   B 가 받은 tick 원문에 `clothes:"fur"` 가 실려 있었다). ⇒ 값이 올 때까지 기다린다.
    const waitLayer = async (page, pid, want, ms) => {
      const t0 = Date.now(); let last = null;
      for (;;) {
        last = await page.evaluate((p2) => ((window.__charDbg || {})[p2] || {}).layers || null, pid);
        if (last && last.indexOf(want) >= 0) return last;
        if (Date.now() - t0 > (ms || 12000)) return last;
        await sleep(250);
      }
    };
    const id1 = await wear('fur');
    ok(!!id1, '★검사 전제 — A 가 갖옷을 실제로 지어 입었다(제품 경로: 재료→제작→장착)', id1 || '실패');
    const mine1 = await waitLayer(A, aPid, 'clothes_fur');
    ok(!!mine1 && mine1.indexOf('clothes_fur') >= 0, '★A 자기 화면에서 갖옷 층을 쓴다', JSON.stringify(mine1));
    const his1 = await waitLayer(B, aPid, 'clothes_fur');
    ok(!!his1 && his1.indexOf('clothes_fur') >= 0,
      '★★★ⓘ **둘째 클라가 첫째의 갖옷을 본다** — 남의 착장이 네트워크를 탄다', JSON.stringify(his1));
    // ★★자명 통과 금지 — 옷을 바꾸면 **둘째 화면도 바뀐다**
    const id2 = await wear('ramie');
    ok(!!id2, '검사 전제 — A 가 모시옷으로 갈아입었다', id2 || '실패');
    const his2 = await waitLayer(B, aPid, 'clothes_ramie');
    ok(!!his2 && his2.indexOf('clothes_ramie') >= 0 && his2.indexOf('clothes_fur') < 0,
      '★★★ⓘ 옷을 바꾸면 **둘째 화면도 바뀐다**(갖옷 → 모시옷) — 최초 가시분만 오는 게 아니다',
      JSON.stringify(his2));
    // ★구조 — 그려진 층은 **언제나** 시트 메타 안에 있다(표 밖 값이 화면에 새면 404·반쪽 합성이다)
    const META2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'char_meta.json'), 'utf8'));
    const outside = (his2 || []).filter((l) => (META2.layers || []).indexOf(l) < 0);
    ok(outside.length === 0, '★그려진 층이 전부 시트 메타 안에 있다(표 밖 값 → 삼베 폴백이 사는 근거)', outside.join(','));
    const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '42-r2-char.js'), 'utf8');
    ok(/equipmentMeta && equipmentMeta\.clothes/.test(src) && /return 'clothes_hemp'/.test(src),
      '★표는 서버가 보낸 `equipmentMeta.clothes` 하나다(클라 사본 0) · 모르는 값은 삼베로 떨어진다');
  }

  // ═══ [T87 2026-09-03] ⓙ **남이 손에 든 것** · ⓚ **남이 등에 진 것** ═══════════════
  //   T81 이 옷 하나를 태우고 "도구는 여전히 안 간다"고 회부한 자리다. 이제 셋 다 간다.
  //   ★판정은 두 층 — 계약(층 이름)과 화면(그 자리 화소). 계약만 보면 "그리기는 하는데
  //     안 보인다"를 못 잡고, 화면만 보면 무엇이 바뀐 건지 못 가른다.
  console.log('\n=== ⓙⓚ 남의 손·등 — 도구와 지게가 남의 눈에 간다 ===');
  {
    const aPid2 = await myPid();
    const layersOf = (page) => page.evaluate((p2) => ((window.__charDbg || {})[p2] || {}).layers || null, aPid2);
    const waitL = async (page, want, ms) => {
      const t0 = Date.now(); let last = null;
      for (;;) {
        last = await layersOf(page);
        if (last && last.indexOf(want) >= 0) return last;
        if (Date.now() - t0 > (ms || 12000)) return last;
        await sleep(250);
      }
    };
    // ★A 가 B 화면 어디에 있나 — 클라 자신의 변환으로 받는다(하네스가 아이소를 베끼지 않는다).
    const aAbs = await meAbs(A);
    const spot = await B.evaluate(([x, y]) => { const s2 = window.__w2s(x, y); return s2 ? [Math.round(s2.px), Math.round(s2.py)] : null; }, [aAbs.x, aAbs.y]);
    ok(!!spot, '★A 가 B 화면 어디인지 클라 변환(__w2s)으로 받았다', JSON.stringify(spot));
    const P = require(path.join(ROOT, 'node_modules', 'pngjs')).PNG;
    // ★★사람은 **가만히 서 있어도 애니가 돈다**(idle 4프레임 · 0.9fps). 그래서 아무것도 안 바꾸고
    //   두 장을 찍으면 그 자리 화소가 115개쯤 바뀐다 — 실측으로 그렇게 나왔다. 그건 잡음이 아니라
    //   **다른 프레임**이다. ⇒ 찍을 때 **같은 애니 프레임**을 기다린다(찍고 나서도 그 프레임인지 되본다).
    //   이러면 "장착 안 하면 diff 0"이 참말이 되고, 효과도 프레임이 아니라 착장으로만 갈린다.
    const frameOfA = () => B.evaluate((p2) => { const d = (window.__charDbg || {})[p2]; return d && d.on ? d.frame : -1; }, aPid2);
    const shotB = async (n, want) => {
      const f = path.join(SHOTS, `t87-${n}.png`);
      for (let k = 0; k < 60; k++) {
        if ((await frameOfA()) !== want) { await sleep(120); continue; }
        await B.screenshot({ path: f });
        if ((await frameOfA()) === want) return P.sync.read(fs.readFileSync(f));   // 찍는 사이에 안 넘어갔다
      }
      await B.screenshot({ path: f });
      return P.sync.read(fs.readFileSync(f));
    };
    const SHOT_FRAME = 0;   // idle 0번 프레임에서만 찍는다
    // ★★바람을 끈다 — 지면 풀 카펫이 프레임마다 흔들린다(`e2e-nature` 실측 52만 화소). 상자 안엔
    //   A 말고 **땅**도 들어 있어서, 안 끄면 그게 대조군을 47화소로 들어 올린다(실측). 재는 층을 격리한다.
    await B.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
    await sleep(600);
    // ★★상자는 **A 만** 덮어야 한다. 짝은 A 에서 월드 +60px 에 서 있고, 아이소는 그걸 화면
    //   (+60, +30) 으로 옮긴다(`w2i` = {x: wx−wy, y: (wx+wy)/2}) — 반경 26이면 짝의 몸(폭 ±13)이
    //   안 들어온다. 안 그러면 **짝의 애니**가 잡음으로 들어와 자가 못 쓰게 된다(실측 438px).
    // ★그리고 `__w2s` 가 주는 자리는 **발밑 앵커**다. 손에 든 도끼는 가슴 높이라 상자를 키 절반만큼
    //   올려야 한다(키 54.4px — 메타의 수다. 눈대중 아님).
    const PR = 26;
    const CX0 = spot[0], CY0 = spot[1] - 27;
    const patch = (u, v) => { let c = 0, tot = 0;
      for (let y = Math.max(0, CY0 - PR); y < Math.min(u.height, CY0 + PR); y++)
        for (let x = Math.max(0, CX0 - PR); x < Math.min(u.width, CX0 + PR); x++) {
          const i = (y * u.width + x) * 4; tot++;
          if (Math.abs(u.data[i] - v.data[i]) + Math.abs(u.data[i + 1] - v.data[i + 1]) + Math.abs(u.data[i + 2] - v.data[i + 2]) > 24) c++;
        }
      return { c, tot }; };

    // ── ⓙ 도구 ─────────────────────────────────────────────────────────────
    const before = await layersOf(B);
    ok(!!before && !before.some((l) => l.indexOf('tool_') === 0),
      '★★자명 통과 금지 — 맨손일 땐 남에게 **도구 층이 없다**', JSON.stringify(before));
    // ★잡음 바닥 먼저(족보 80): 아무것도 안 바꾸고 두 장. 장착 안 하면 diff 0 이어야 한다.
    const n1 = await shotB('n1', SHOT_FRAME); await sleep(1400);
    const n2 = await shotB('n2', SHOT_FRAME);
    const noise = patch(n1, n2).c;
    ok(noise <= 8, '★★대조군 — **장착 안 하면 그 자리 화소가 안 바뀐다**(같은 애니 프레임 · 무풍)', `${noise}px ≤ 8`);
    // 도끼 지급 → 장착(제품 경로: 도구 인스턴스 + equip)
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', tools: ['axe'] }));
    let axeId = null;
    for (let k = 0; k < 30 && !axeId; k++) {
      const ts = await A.evaluate(() => window.__getTools());
      const t = (ts || []).find((q) => q.type === 'axe' && q.d > 0);
      if (t) axeId = t.id; else await sleep(200);
    }
    ok(!!axeId, '검사 전제 — A 가 도끼 인스턴스를 받았다', axeId || '실패');
    await A.evaluate((id) => window.__sendPrimary({ type: 'equip', toolItemId: id }), axeId);
    const mineTool = await waitL(A, 'tool_axe');
    ok(!!mineTool && mineTool.indexOf('tool_axe') >= 0, '★A 자기 화면에서 도끼 층을 쓴다', JSON.stringify(mineTool));
    const hisTool = await waitL(B, 'tool_axe');
    ok(!!hisTool && hisTool.indexOf('tool_axe') >= 0,
      '★★★ⓙ **둘째 클라가 첫째의 도끼를 본다** — 손에 든 것이 네트워크를 탄다', JSON.stringify(hisTool));
    const afterTool = await shotB('tool', SHOT_FRAME);
    const effTool = patch(n2, afterTool).c;
    ok(effTool > Math.max(noise * 3, 10),
      `★★★ⓙ 그 자리 **화면이 실제로 바뀐다** — 도끼를 쥐기 전/후 (${effTool}px > ${Math.max(noise * 3, 10)} · 잡음 ${noise})`);

    // ── ⓚ 등짐 ─────────────────────────────────────────────────────────────
    const beforeBack = await layersOf(B);
    ok(!!beforeBack && beforeBack.indexOf('back_carrier') < 0,
      '★★자명 통과 금지 — 지게를 안 졌을 땐 남에게 **등짐 층이 없다**', JSON.stringify(beforeBack));
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', equip: [{ type: 'carrier', lvl: 5 }] }));
    const mineBack = await waitL(A, 'back_carrier');
    ok(!!mineBack && mineBack.indexOf('back_carrier') >= 0, '★A 자기 화면에서 등짐 층을 쓴다', JSON.stringify(mineBack));
    const hisBack = await waitL(B, 'back_carrier');
    ok(!!hisBack && hisBack.indexOf('back_carrier') >= 0,
      '★★★ⓚ **둘째 클라가 첫째의 지게를 본다** — 등에 진 것이 네트워크를 탄다', JSON.stringify(hisBack));
    const afterBack = await shotB('back', SHOT_FRAME);
    const effBack = patch(afterTool, afterBack).c;
    ok(effBack > Math.max(noise * 3, 10),
      `★★ⓚ 그 자리 **화면이 실제로 바뀐다** — 지게를 지기 전/후 (${effBack}px > ${Math.max(noise * 3, 10)})`);
    ok(hisBack.join(',') === ['body', hisBack[1], 'back_carrier', 'tool_axe'].join(','),
      '★그리는 순서 = 몸 → 옷 → 등짐 → 손 (자기 판정과 같은 함수가 낸다)', JSON.stringify(hisBack));

    // ── ⓚ2 방향 표 — 등이 보이는 쪽에서 지게가 크다(시트 층) ───────────────
    //   ★화면이 아니라 **시트**로 잰다: 8방향을 한 판에 다 보려면 사람을 여덟 번 돌려야 하는데
    //     그건 이 절이 재려는 것(층이 방향을 타는가)이 아니라 조작을 재는 것이다.
    {
      const DIR = path.join(ROOT, 'public', 'assets', 'char');
      const META = JSON.parse(fs.readFileSync(path.join(DIR, 'char_meta.json'), 'utf8'));
      const png = P.sync.read(fs.readFileSync(path.join(DIR, 'back_carrier_idle.png')));
      const fw = META.frameW, fh = META.frameH;
      const rowN = (row) => { let n = 0;
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          const i = ((row * fh + y) * png.width + x) * 4;
          if (png.data[i + 3] > 150) n++;
        } return n; };
      const N = [0, 1, 2, 3, 4, 5, 6, 7].map(rowN);
      // 행 = 방향 d(= round(atan2(fy,fx)/(π/4)) mod 8 · d0 = +x). 카메라를 등지는 쪽이 d4~d6.
      const backRows = [4, 5, 6], frontRows = [0, 1, 2];
      const bk = Math.min(...backRows.map((r) => N[r])), fr = Math.max(...frontRows.map((r) => N[r]));
      console.log(`    등짐 화소(방향별): ${JSON.stringify(N)}  · 등 보이는 쪽 최소 ${bk} · 앞 보는 쪽 최대 ${fr}`);
      ok(bk > fr * 2, '★★ⓚ2 **등을 보이는 방향에서 지게가 크다**(등 최소 > 앞 최대 × 2) — 층이 방향을 탄다',
        `${bk} > ${fr}×2`);
      ok(fr > 0, '★앞을 보는 방향에서도 **어깨끈이 남는다**(0이 아니다) — 몸이 다 가리지 않는다', `${fr}px`);
    }
  }

  console.log('\n=== ⑦ 콘솔 오류 ===');
  const real = (a) => a.filter((x) => !/favicon|404 \(Not Found\)/.test(x));
  ok(real(A._errs).length === 0, '[A] 페이지 오류 0 (favicon 404 제외)', real(A._errs).slice(0, 2).join(' | '));
  ok(real(B._errs).length === 0, '[B] 페이지 오류 0', real(B._errs).slice(0, 2).join(' | '));

  await browser.close();
  console.log(`\n    스크린샷: ${SHOTS}`);
  console.log(`\n=== e2e-charsprite 결과: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); process.exit(1); });
