#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly C   ← 야간 세 밤 분할(T238)
// === scripts/e2e-site-exit.js — **터를 놓으면 건축 모드가 꺼진다** 실클라 E2E (T839 · ★T850 켬 기본 · 되돌림 `T839_SITE_EXIT=0`) ==========
//
//   다섯 터(움집 · 노 · 숯가마 · 우물 · 회관)는 버튼(`*_start`)이 `buildMode = true` 로 배치 모드에 들어간다.
//   종전에는 캔버스를 눌러 터를 놓아도 `placementMode` 만 걷히고 **건축 모드가 남았다** — 그 상태에서 커서가 터를 잡으면
//   좌클릭이 시공이 아니라 **3초 분해**로 샜다(T824 회부 1 · PM 10-21 결함 판정).
//   이 판은 존을 **두 번** 띄운다: 켬(손잡이 안 줌 = 기본 · ★T850) · 끔(`T839_SITE_EXIT=0` = 되돌림 · 옛 main). 같은 손짓(버튼 → 캔버스 클릭)을 다섯 터에 다 하고
//     켬 = 건축 모드 꺼짐 · 배치 모드 걷힘 · 알림 "건축 모드 꺼짐" / 끔 = 건축 모드 남음(종전 그대로 — 대조군이 실재한다).
//   곁 단정(켬): Shift 배치(이어 놓기)는 모드를 지킨다 · 다섯 터가 아닌 집 의뢰(`psite_request`)는 손대지 않는다.
//   서버로 직접 쏘는 것은 픽스처뿐이다(곡괭이 · 재료 `__e2e_give`). 터가 서버에서 서는지는 이 판이 재지 않는다 — 모드는 클라가 정한다
//     (터가 선 뒤 "안내대로 누르면 시공"은 `e2e-well` 이 켬 판에서 잰다).
// 실행: node scripts/e2e-site-exit.js [--headed]    (Chromium /opt/pw-browsers — playwright install 금지)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;   // ★존 포트는 존 설정의 그 수(hanbando 3020)여야 로비가 붙는다
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let procs = [];
function boot(name, file, env) {
  const E = Object.assign({}, process.env, env); for (const k of Object.keys(E)) if (E[k] === undefined) delete E[k];   // undefined = 그 손잡이를 **안 준다**(바깥 env 도 지운다)
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 140)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
// 띄운 아이가 정말 내려갔는지 기다린다(다음 판이 앞 판의 포트를 물지 않게 · T824 곁)
async function down() {
  const ps = procs; procs = [];
  for (const p of ps) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const p of ps) { if (p.exitCode === null && p.signalCode === null) await new Promise((r) => { p.once('exit', r); setTimeout(r, 5000); }); }
}

const SITES = [
  { a: 'hut_start', sp: 'hut_site', name: '움집터' },
  { a: 'furnace_start', sp: 'furnace_site', name: '노' },
  { a: 'kiln_start', sp: 'kiln_site', name: '숯가마' },
  { a: 'well_start', sp: 'well_site', name: '우물' },
  { a: 'village_start', sp: 'village_site', name: '회관' },
];

async function round(label, env) {
  console.log(`\n── ${label} ──`);
  const tag = `${process.pid}-${label === '켬' ? 'on' : 'off'}`;
  const CDB = `/tmp/e2esx-central-${tag}.db`, ZDB = `/tmp/e2esx-zone-${tag}.db`;
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  const _c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cu = FB.waitUp(_c, /central server up on/, { name: 'central' });
  const _z = boot('zone', 'zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', VILLAGE_DAY_MS: '2000', E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, env));
  const _zu = FB.waitUp(_z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const cu = await _cu, zu = await _zu;
  ok(cu.ok, `[${label}] central 기동`, cu.ok ? '' : cu.why); ok(zu.ok, `[${label}] zone 기동`, zu.ok ? '' : zu.why);
  if (!cu.ok || !zu.ok) { await down(); return; }
  for (let i = 0; i < 180; i++) { try { const z = await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(4000) })).json(); const hz = (z.zones || {}).hanbando || {}; if (hz.cap && hz.population !== null && hz.population !== undefined) break; } catch (e) {} await sleep(1000); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const btn = await page.$('#enter');
  for (let i = 0; i < 120 && btn && (await btn.isDisabled()); i++) await sleep(1000);
  if (btn) await btn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), `[${label}] 게스트 입장`);
  await page.evaluate(() => { window.__sendPrimary({ type: '__e2e_give', items: { wood: 40, stone: 40, pebble: 60 }, tools: ['pickaxe'] }); });
  await sleep(800);

  const st = () => page.evaluate(() => ({ bm: buildMode, pm: placementMode ? (placementMode.special || placementMode.itemType || 'on') : null, n: (window.__notices || []).slice(-2) }));
  const siteExit = await page.evaluate(() => !!(uiCfg && uiCfg.siteExit));
  ok(siteExit === (label === '켬'), `[${label}] ★welcome \`uiCfg.siteExit\` = ${label === '켬'}(★T850 기본 켬 · 서버 env 가 정본 · \`=0\` 이면 칸이 없다)`, String(siteExit));
  // 캔버스 위 · 내 자리에서 오른쪽 40px(배치 거리 160px 안 · HUD 밖)
  const spotScreen = () => page.evaluate(() => {
    const a = window.__getMyAbs(); const s = window.__w2s(a.x + 40, a.y); const cv = document.getElementById('canvas'); const r = cv.getBoundingClientRect();
    return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) };
  });
  const offIfOn = async () => { if ((await st()).bm) { await page.keyboard.press('b'); await sleep(200); } };   // 앞 터가 남긴 모드는 사람이 하듯 B 로 끈다

  for (const S of SITES) {
    await offIfOn();
    await page.evaluate((a) => { const b = document.querySelector(`[data-action="${a}"]`); if (b) b.click(); }, S.a);
    await sleep(200);
    const s0 = await st();
    ok(s0.bm === true && s0.pm === S.sp, `[${label}] ${S.name} — 버튼 → 배치 모드(\`${S.sp}\`) · 건축 모드 켜짐`, JSON.stringify(s0));
    const p = await spotScreen();
    await page.mouse.click(p.x, p.y);
    await sleep(400);
    const s1 = await st();
    if (label === '켬') ok(s1.bm === false && s1.pm === null && s1.n.includes('짓기를 마쳤습니다.'), `[${label}] ★★${S.name} — 캔버스 클릭(착공 요청) 뒤 **건축 모드 꺼짐** · 배치 모드 걷힘 · 알림 "짓기를 마쳤습니다"`, JSON.stringify(s1));
    else ok(s1.bm === true && s1.pm === null, `[${label}] ★${S.name} — 캔버스 클릭 뒤 건축 모드가 **남는다**(종전 그대로 — 대조군)`, JSON.stringify(s1));
    if (S.a === 'hut_start') {
      //   움집터는 곡괭이만 있으면 그 자리에 선다(① 굴착 완료 · 다음 "② … (움집터 클릭)") — **안내대로 터를 누르면** 무엇이 되나.
      let site = null;
      for (let i = 0; i < 15 && !site; i++) { await sleep(200); site = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []).find((b) => b.type === 'hut_site') || null); }
      ok(!!site, `[${label}] [상황] 움집터가 섰다(안내 "다음: ② … (움집터 클릭)")`, site ? `${site.wx},${site.wy}` : '없음');
      if (site) {
        const q = await page.evaluate(([x, y]) => { const s2 = window.__w2s(x, y); const cv = document.getElementById('canvas'); const r = cv.getBoundingClientRect(); return { x: r.left + s2.px * (r.width / cv.width), y: r.top + s2.py * (r.height / cv.height) }; }, [site.wx, site.wy]);
        await page.mouse.move(q.x - 3, q.y); await page.mouse.move(q.x, q.y); await sleep(150);
        await page.mouse.click(q.x, q.y); await sleep(600);
        const r = await page.evaluate(() => ({ act: (typeof buildAction !== 'undefined' && buildAction) ? buildAction.kind : null, hover: (typeof hoverBuildingId !== 'undefined') ? hoverBuildingId : null, n: (window.__notices || []).slice(-2) }));
        if (label === '켬') ok(r.act === null && !r.n.some((t) => /분해/.test(t)), `[${label}] ★★움집터 — 안내대로 터를 누르면 **분해가 아니다**(3초 분해 0 · 시공 쪽으로 간다)`, JSON.stringify(r));
        else ok(r.act === 'dismantle', `[${label}] ★움집터 — 건축 모드가 남은 채 터를 누르면 **3초 분해**가 걸린다(고친 결함 — 대조군이 실재한다)`, JSON.stringify(r));
        if (r.act) { await page.mouse.move(q.x + 200, q.y); await sleep(300); }   // 분해는 움직이면 취소된다(종전 문)
      }
    }
  }

  if (label === '켬') {
    // 곁 ① Shift 배치(이어 놓기) — 모드를 지킨다(종전 그대로)
    await offIfOn();
    await page.evaluate(() => { const b = document.querySelector('[data-action="kiln_start"]'); if (b) b.click(); });
    await sleep(200);
    const p = await spotScreen();
    await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
    await sleep(400);
    const s2 = await st();
    ok(s2.bm === true && s2.pm === 'kiln_site', `[${label}] ★자명 통과 금지 — Shift 배치(이어 놓기)는 배치 · 건축 모드를 **지킨다**(종전 그대로)`, JSON.stringify(s2));
    // 곁 ② 다섯 터가 아닌 집 의뢰는 손대지 않는다
    await page.keyboard.press('b'); await sleep(200); await offIfOn();
    await page.evaluate(() => { const b = document.querySelector('[data-action="psite_request"]'); if (b) b.click(); });
    await sleep(200);
    const p2 = await spotScreen();
    await page.mouse.click(p2.x, p2.y);
    await sleep(400);
    const s3 = await st();
    ok(s3.bm === true && s3.pm === null, `[${label}] ★자명 통과 금지 — 집 의뢰(\`psite\`)는 다섯 터가 아니다 — 건축 모드가 남는다(손대지 않음)`, JSON.stringify(s3));
  }
  await browser.close();
  await down();
}

(async () => {
  console.log('\n=== 터를 놓으면 건축 모드가 꺼진다 (T839 · ★T850 켬 기본 · 되돌림 `T839_SITE_EXIT=0`) ===');
  await round('켬', { T839_SITE_EXIT: undefined });   // ★[T850] 기본 = 켬 — 손잡이를 **안 준** 판(키 자체가 없다)이 켬이어야 한다
  await round('끔', { T839_SITE_EXIT: '0' });   // 되돌림 — 대조군(건축 모드가 남고 움집터 클릭이 3초 분해)
  console.log(`\n=== 터 · 건축 모드 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '✗' : '✅'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('E2E 실패:', e && e.message); shutdown(); process.exit(1); });
