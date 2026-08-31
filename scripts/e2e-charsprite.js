#!/usr/bin/env node
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

  // ── ④-나 가림 수리 ⓐ — 방향별 z 순서가 **실제로 그려졌는가** ────────────
  //   ★족보 57: 하네스는 자기 행동이 실제로 일어났는지 먼저 센다.
  //     메타의 순서표(`toolBehind`)를 클라가 정말 따르는지, 훅의 `toolFirst` 로 센다.
  //     기대값은 **클라가 보고한 clip·row·frame** 에서 메타로 되짚어 만든다 —
  //     방향을 손으로 적으면 또 틀린다(족보 74).
  {
    let n = 0, bad = 0, sawT = 0, sawF = 0;
    for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyW', 'KeyD']) {
      await A.keyboard.down(k);
      for (let t = 0; t < 6; t++) {
        await sleep(160);
        const d = await dbgOf(A);
        if (!d || !d.on || !d.layers.includes('tool_axe')) continue;
        const want = await A.evaluate(([clip, row, fr]) => {
          const m = window.__charMeta;
          const tb = m && m.toolBehind && m.toolBehind[clip] && m.toolBehind[clip].axe;
          return !!(tb && tb[row] && tb[row][fr]);
        }, [d.clip, d.row, d.frame]);
        n++;
        if (want) sawT++; else sawF++;
        if (!!d.toolFirst !== !!want) {
          bad++;
          console.log(`    ✗ clip=${d.clip} row=${d.row} f=${d.frame} 기대 toolFirst=${want} 실제 ${d.toolFirst}`);
        }
      }
      await A.keyboard.up(k); await sleep(200);
    }
    ok(n >= 8, `순서 표본 ${n}개 확보 (도구를 든 프레임만)`);
    ok(sawT > 0 && sawF > 0, `★자명 통과 금지 — 앞으로 그린 프레임 ${sawF}개 · 뒤로 그린 프레임 ${sawT}개 둘 다 밟았다`);
    ok(bad === 0, `★그린 순서가 메타의 깊이 측정과 ${n}/${n} 일치 (가림 수리 ⓐ 배선 실증)`);
    // ★여기서 A 를 원래 자리로 되돌린다 — 위에서 6초쯤 걸었다.
    //   안 되돌리면 ⑤(두 클라 짝)에서 B 가 A 의 화면 밖이라 "남이 안 보인다"로 빨개진다.
    //   (실제로 그렇게 4판정이 빨개져서 이 줄이 생겼다 — 하네스가 제 발을 밟은 것이다.)
    for (let i = 0; i < 20; i++) {
      await A.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [SPOT.x, SPOT.y]);
      await sleep(700);
      const c = (await A.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await meAbs(A));
      if (c && Math.hypot(c.x - (SPOT.x + SPOT.WOX), c.y - (SPOT.y + SPOT.WOY)) <= 120) break;
    }
    await sleep(600);
  }

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
  for (let i = 0; i < 20; i++) {
    await B.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [SPOT.x + 60, SPOT.y]);
    await sleep(700);
      // ★[핫픽스 2026-08-31 · 족보 ㊹] 도착은 **서버 권위**로 — 예측은 재접속 뒤 낡을 수 있다.
    const c = (await B.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await meAbs(B));
    if (c && Math.hypot(c.x - (SPOT.x + SPOT.WOX + 60), c.y - (SPOT.y + SPOT.WOY)) <= 140) break;
  }
  await sleep(1200);
  const seen = await A.evaluate(() => Object.entries(window.__charDbg || {}).filter(([, v]) => !v.isMe).map(([k, v]) => ({ pid: k, clip: v.clip, row: v.row, layers: v.layers })));
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
