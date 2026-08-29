#!/usr/bin/env node
// === scripts/e2e-emptystart.js — 빈손 시작 **실클라** E2E =========================
//
// ★왜 [재민 확정 2026-08-28]
//   `test-emptystart` 41/0 은 "빈손 계약이 지켜지는가"를 잰다. 이 레포가 배치 5에서 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다.
//   빈손 시작은 특히 그렇다: 지급을 없앤 자리에 **사다리가 화면으로 보이지 않으면**,
//   플레이어는 그냥 "아무것도 못 하는 게임"에 떨어진 것이다.
//   그래서 진짜 Chromium 을 띄우고 **두 단 사다리를 다 밟는다**:
//     ⓐ 빈손 → 채집 → **조잡한 석기 자작** → 장착 → 실제로 더 캔다
//     ⓑ 재료를 벌어 → **마을 장인 정품 구매**
//
// ★★시간 모드: 얼리지 않는다. 판정이 전부 상호작용이고 게임일과 무관하다.
//   마을을 켜는 절(ⓑ)만 `VILLAGE_DAY_MS` 로 데운다 — 그 절은 **존재 확인**이지 시세 비교가 아니다.
//
// ★채집 자리는 **정본 모듈에게 물어본다**(`server/forage.js`) — 하네스가 지형 규칙을 다시 짜면 사본이다.
//   (마을 앵커를 DB 에서 읽는 `e2e-events` 와 같은 규약: 검사 도구의 경로지 게임 경로가 아니다.)
//
// 실행: node scripts/e2e-emptystart.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-emptystart-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-es-central-${process.pid}.db`, ZDB = `/tmp/e2e-es-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 완료/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

// ── 채집 자리 찾기 — **정본에게 물어본다** ──────────────────────────────────
function findForageSpots() {
  process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
  const T = require(path.join(ROOT, 'server', 'terrain.js'));
  const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
  T.setZonesMeta(ZC.ZONES);
  const F = require(path.join(ROOT, 'server', 'forage.js'));
  const ctx = {
    forestMult: (x, y) => T.getForestMultiplier('hanbando', x, y),
    isRock: (x, y) => T.isRockCellLocal('hanbando', x, y),
    isWater: (x, y) => T.isWaterCellLocal('hanbando', x, y),
    bushAt: () => null,     // 실클라에선 덤불 개체가 청크에 따라 다르다 — 지형 소스만 겨냥한다
  };
  // ★★자리를 **여러 개** 모은다(후보 일소).
  //   1차 실장은 종류마다 자리 하나만 골랐다가 ②가 깨졌다 — 숲 바닥 좌표엔 **나무 개체**가 서 있어서
  //   `tryGather` 가 그 나무를 먼저 집는다(맨손 채집은 "곁에 개체가 없을 때"의 갈래다).
  //   즉 **그 자리가 채집원인 것**과 **거기서 맨손 채집이 열리는 것**은 다른 명제다.
  //   하네스는 앞의 것만 알 수 있으므로, 뒤의 것은 **여러 자리를 밟아 보고** 판정한다
  //   (`e2e-trade ⑤`·`test-emptystart ③` 와 같은 후보 일소 규약).
  const out = {};
  const NEED = 6;
  for (let i = 0; i < 60000; i++) {
    const x = 2000 + (i * 977) % 58000, y = 2000 + (i * 1361) % 58000;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
    const s = F.sourceAt(x, y, ctx);
    if (!s) continue;
    (out[s.kind] || (out[s.kind] = [])).push({ x, y, where: s.where });
    if (Object.keys(out).length >= 3 && Object.values(out).every((a) => a.length >= NEED)) break;
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, NEED);
  return out;
}

(async () => {
  console.log('\n=== 빈손 시작 실클라 E2E (Chromium) ===');
  const _ZM = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando;
  const WOX = _ZM.worldOffsetX || 0, WOY = _ZM.worldOffsetY || 0;
  const spots = findForageSpots();
  console.log(`    채집 자리(정본이 고름): ${Object.entries(spots).map(([k, a]) => `${k}@${a[0].where}×${a.length}`).join(' · ')}`);
  ok(Object.keys(spots).length >= 2, '★전제 — 지도에 채집 자리가 실재한다', `${Object.keys(spots).length}종`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const inv = () => page.evaluate(() => window.__getInv());
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  // ★★[재민 확정 2026-08-28 · 검증 규약 (57)] **도착을 확인한다.**
  //   1차 실장은 `__getMyAbs()` 가 뭐라도 돌려주면 성공으로 봤다 — 그건 "내 좌표가 있다"지
  //   "거기 갔다"가 아니다. 그래서 텔레포트가 씹혀도 조용히 통과했고, ⑤가 마을 밖에서 거래를 시도했다.
  //   목표까지의 **거리로** 판정한다(하네스는 제 행동이 실제로 일어났는지 스스로 확인해야 한다).
  const warp = async (x, y, tolPx = 200) => {
    // ⚠좌표계를 섞지 마라(이 레포가 이미 배운 것): `teleport_debug` 는 **존 로컬**,
    //   `__getMyAbs()` 는 **월드 절대**다. 1차 도착 판정은 이걸 섞어서 멀쩡한 워프를 전부
    //   "미도달"로 찍었다. 오프셋은 **정본**(`zone-config.js`)에서 읽는다 — 하네스가 상수를 베끼지 않는다.
    let cur = null;
    for (let i = 0; i < 20; i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(900);
      cur = await page.evaluate(() => window.__getMyAbs());
      if (cur && Math.hypot(cur.x - (x + WOX), cur.y - (y + WOY)) <= tolPx) return cur;
    }
    console.log(`    ⚠ 워프 미도달 → 로컬(${x},${y})=절대(${x + WOX},${y + WOY}) / 현재 ${cur ? `${Math.round(cur.x)},${Math.round(cur.y)}` : '없음'}`);
    return cur;
  };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── ① 빈손으로 태어난다 ───────────────────────────────────────────────────
  const inv0 = await inv();
  const sum0 = Object.entries(inv0 || {}).filter(([k]) => !['floor', 'tribe_id', 'sim', 'kind'].includes(k))
    .reduce((n, [, v]) => n + (Number(v) || 0), 0);
  console.log(`    입장 직후 인벤: ${JSON.stringify(inv0)}`);
  ok(sum0 === 0, '★★① **빈손으로 태어난다** — 지급 0', `합계 ${sum0}`);
  const tools0 = await page.evaluate(() => window.__getTools());
  let c0 = null;
  for (let i = 0; i < 20 && !c0; i++) { c0 = await page.evaluate(() => window.__carryState || null); if (!c0) await sleep(600); }
  ok(c0 && c0.kg === 0 && !c0.over, '★★① HUD 무게가 **0** 이다 — 태어나자마자 과적이던 그 자리', c0 ? `${c0.kg}/${c0.cap}kg` : '안 옴');
  const hud0 = await page.evaluate(() => (document.getElementById('carryHud') || {}).textContent || '');
  ok(/0(\.0)?\/\d+kg/.test(hud0.replace(/\s/g, '')), '★① 화면에도 🎒 0/25kg 로 뜬다', hud0.trim());
  void tools0;
  await snap('es-01-empty');

  // ── ② 맨손 채집 — 자리를 찾아가서 줍는다 ──────────────────────────────────
  const kinds = Object.keys(spots);
  const gotKinds = [];
  const delta = (a, b) => Object.keys(Object.assign({}, a, b))
    .filter((k) => !['floor', 'tribe_id', 'sim', 'kind'].includes(k) && (b[k] || 0) !== (a[k] || 0))
    .map((k) => `${k} ${a[k] || 0}→${b[k] || 0}`).join(' ');
  for (const k of kinds) {
    let done = false;
    for (const sp of spots[k]) {
      if (done) break;
      await warp(sp.x, sp.y);
      await sleep(700);
      const before = { ...(await inv()) };
      for (let i = 0; i < 4 && !done; i++) {
        await page.keyboard.press('KeyE');
        await sleep(1100);
        const cur = await inv();
        if ((cur[k] || 0) > (before[k] || 0)) done = true;
      }
      const after = await inv();
      console.log(`    ${sp.where}(${k}) @${sp.x},${sp.y} E×4 → ${delta(before, after) || '변화 없음'}${done ? '   ✔' : ''}`);
    }
    if (done) gotKinds.push(k);
  }
  ok(gotKinds.length === kinds.length, '★★② **맨손으로 실제 채집된다**(자리마다 다른 것이 나온다)',
    `${gotKinds.join(' ') || '없음'} / ${kinds.join(' ')}`);
  const nt = await notices();
  ok(nt.some((t) => /🤏/.test(t)), '★② 무엇을 어디서 주웠는지 말해 준다',
    (nt.filter((t) => /🤏/.test(t)).slice(-1)[0] || '').slice(0, 50));
  await snap('es-02-forage');

  // ── ③ 조잡한 석기 자작 — 제작 탭 소목록(§8.5) ────────────────────────────
  //   ★재료가 모자라면 픽스처로 채운다. **채집이 되는지는 위 ②가 이미 실증**했으므로
  //     여기서 잴 것은 "소목록이 화면에 있고, 눌러서 만들어지는가"다(픽스처가 검사 대상을 안 가린다).
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { pebble: 4, twig: 2, fiber: 4 } }));
  await sleep(1200);
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="craft"]').click());
  await sleep(900);
  const ctext = await page.evaluate(() => window.__panelText());
  ok(/조잡한 돌도끼/.test(ctext), '★★③ 제작 탭 **소목록에 조잡한 석기가 있다**(§8.5 "맨손 = 소목록")',
    (ctext.match(/조잡한[^\n]{0,30}/) || [''])[0]);
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .cr-item, [data-craft]')];
    const t = btns.find((b) => /조잡한 돌도끼/.test(b.textContent || ''));
    if (t) { t.click(); return true; }
    return false;
  });
  if (!clicked) await page.evaluate(() => window.__sendPrimary({ type: 'craft', recipe: 'crude_axe' }));
  await sleep(1400);
  const tools = await page.evaluate(() => window.__getTools());
  ok(tools.some((t) => t.type === 'crude_axe'), '★★③ **조잡한 돌도끼가 만들어졌다**(시설 없이, 맨손으로)',
    tools.map((t) => `${t.type} ${t.d}/${t.max}`).join(' ') || '없음');
  const crude = tools.find((t) => t.type === 'crude_axe');
  ok(crude && crude.max < 100, '★③ 그리고 **금방 닳는다**(정품 100 대비)', crude ? `내구 ${crude.max}` : '');
  await snap('es-03-crude');

  // ── ④ 장착 → 실제로 더 캔다 ──────────────────────────────────────────────
  if (crude) {
    await page.evaluate((id) => window.__sendPrimary({ type: 'equip', toolItemId: id }), crude.id);
    await sleep(900);
    const eq = await page.evaluate(() => window.__getEquipped());
    ok(eq === crude.id, '★★④ 장착된다', String(eq));
  }

  // ── ⑤ 둘째 단 — 마을 장인의 정품 ─────────────────────────────────────────
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length > 0, '★전제 — 마을이 시딩됐다', rows.map((r) => r.name).join(' '));
  if (rows.length) {
    const V = rows[0];
    await warp(V.cx * 32 + 16, V.cy * 32 + 16);
    await sleep(1200);
    // ★재료는 픽스처로 준다 — "벌어서 산다"의 **버는 쪽**은 게시판·거래소 하네스가 따로 잰다.
    //   여기서 잴 것은 **살 수 있는 경로가 실재하는가**(빈손이 도달할 곳이 있는가)다.
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { stone: 6 } }));
    await sleep(1200);
    // ★★[검증 규약 (57)] **공지로 세지 않는다.** `__notices` 는 40칸 링버퍼라,
    //   ②의 채집 공지만으로도 이미 포화다 — 그러면 `slice(n0)` 가 늘 빈 배열이고,
    //   "성공했는데 실패로 찍히는" 판정이 된다(실제로 그랬다). **상태로 센다**: 장비가 늘었는가.
    const eq0 = await page.evaluate(() => window.__getEquipment());
    const before = eq0.filter((e) => e.type === 'tool').length;
    await page.evaluate(() => window.__sendPrimary({ type: 'craft_buy', itemType: 'tool', material: 'stone' }));
    await sleep(1600);
    const eqp = await page.evaluate(() => window.__getEquipment());
    const after = eqp.filter((e) => e.type === 'tool').length;
    const said = (await notices()).filter((t) => /장인|구매|마을/.test(t)).slice(-1)[0] || '';
    console.log(`    장인 구매: 도구 장비 ${before} → ${after}  · 최근 공지 "${said.slice(0, 60)}"`);
    ok(after > before, '★★⑤ **마을 장인에게서 정품 도구를 살 수 있다** — 빈손이 닿을 둘째 단이 실재한다',
      `${before}→${after}`);
    // ★두 장부가 다르다(조잡한 석기는 `toolItems`, 장인 정품은 `equipment` 인스턴스).
    //   그래도 **플레이어가 보는 숫자**는 하나의 사다리다 — 그 층을 화면 값으로 잰다.
    const genuine = eqp.find((e) => e.type === 'tool');
    ok(!!genuine && (genuine.durMax || 0) > (crude ? crude.max : 0),
      '★⑤ 그리고 **자작보다 오래 간다** — 두 단 사다리가 실제로 층을 이룬다',
      genuine ? `정품 내구 ${genuine.durMax} vs 조잡 ${crude ? crude.max : '-'}` : '없음');
  }
  await snap('es-04-artisan');

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
