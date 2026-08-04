#!/usr/bin/env node
// =============================================================================
// probe-spawn — 스폰·시딩 마을·구 레거시 자리를 **실화면**으로 찍는다 [배치 15 ②③]
//
// probe-roof.js 선례를 그대로 따른다: zone-config 를 덮어쓰는 얇은 래퍼(/tmp/zone-wrap.js)로
// 원하는 좌표에 스폰시키고, 진짜 클라이언트(Playwright)로 접속해 스크린샷을 남긴다.
// ★래퍼는 이 스크립트가 직접 써 낸다 — 손으로 만들어 둔 /tmp 파일에 의존하지 않는다(재현 가능).
//
// 사용:
//   node scripts/probe-spawn.js                       # 기본 3곳(스폰·시딩마을·구 레거시 자리)
//   SHOTS=/tmp/x node scripts/probe-spawn.js spawn    # 한 곳만
//   ZDB=/tmp/my.db node scripts/probe-spawn.js        # 이미 시딩된 DB 재사용(부팅 빠름)
//
// ★좌표계 함정(1차 실행에서 밟았다): zone-config 의 mainSquare 는 파일엔 **base** 로 적히지만
//   ×WORLD_SCALE(10)이 **모듈 로드 시점에 이미 적용**된다. 래퍼는 그 뒤에 덮어쓰므로
//   여기서 넘기는 값은 base 가 아니라 **실 px 그대로**여야 한다(/10 하면 엉뚱한 데로 간다).
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/b15-shots';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/probe-spawn-${process.pid}.db`;
const KEEP_DB = !!process.env.ZDB;
fs.mkdirSync(SHOTS, { recursive: true });

// ── 찍을 자리 ────────────────────────────────────────────────────────────────
//   px 는 존 로컬 픽셀. 셀 = px/32.
const SPOTS = {
  // ② 새 스폰 — 시딩 마을 농촌22 광장(큰집 남쪽 7셀). zone-config 채택값과 같은 자리.
  spawn: { px: 30848, py: 59872, name: '농촌22 광장(새 스폰)', walk: null },
  // ③ 큰집이 실제로 렌더되는지 — 광장에서 북쪽으로 걸어 큰집 정면
  hall: { px: 30848, py: 59872, name: '농촌22 큰집(북쪽으로 걸어서)', walk: { key: 'w', ms: 2600 } },
  // ① 구 레거시 마을 자리 — 농촌5(하드코딩 51 중 시딩 안 된 33곳의 하나). 끈 뒤엔 빈 들판이어야 한다.
  //   ★배치 16 부터는 51곳 전수 시딩이라 이 자리에도 **완전체 마을**이 선다(빈 들판 아님).
  legacy: { px: 44085, py: 66715, name: '농촌5 자리(배치 15 엔 빈 들판 · 배치 16 부턴 마을)', walk: null },
  // ② 옛 스폰 자리 — 재민이 본 첫 화면. 가장 가까운 마을이 212셀 밖이라 원래도 빈 들판이었다.
  oldspawn: { px: 35000, py: 65008, name: '벌말 광장(옛 스폰)', walk: null },
  // ③ [배치 16] 보강 6곳 중 하나 — 광산6. 못(방죽) 덕에 논이 0 → 35 로 생겼다.
  boosted: { px: 7264, py: 98483, name: '광산6(보강 대상 — 못으로 살아난 광산 마을)', walk: null },
  // ④ [배치 16] 광산6 방죽 — 새로 넣은 물 지물 자체
  pond: { px: 9040, py: 98512, name: '광산6 방죽(배치 16 이 넣은 못)', walk: null },
  // ⑤ [배치 16] 보강과 무관한 일반 마을 — 임업2
  normal: { px: 38000, py: 99000, name: '임업2(보강 무관 · 일반 시딩 마을)', walk: null },
};

const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/시딩:|실물화|server up|레거시|wrap|Error/i.test(s)) process.stdout.write(`[${name}] ` + s.slice(0, 400)); });
  p.stderr.on('data', (d) => process.stdout.write(`[${name}!] ` + d.toString().slice(0, 300)));
  procs.push(p);
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url, tries = 400) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function writeWrap() {
  const wrap = `// probe-spawn 이 생성한 테스트 래퍼 — zone-config 만 덮어쓰고 zone.js 를 그대로 띄운다.
const path = require('path');
const ROOT = ${JSON.stringify(ROOT)};
const cfg = require(path.join(ROOT, 'server', 'zone-config'));
const ZID = process.env.ZONE_ID || 'hanbando';
try {
  const patch = JSON.parse(process.env.WRAP_ZONE_PATCH || '{}');
  Object.assign(cfg.ZONES[ZID], patch);
  console.log('[wrap] ' + ZID + ' 덮어쓰기: ' + JSON.stringify(patch));
} catch (e) { console.error('[wrap] patch 실패:', e.message); }
require(path.join(ROOT, 'server', 'zone.js'));
`;
  fs.writeFileSync('/tmp/zone-wrap.js', wrap);
  return '/tmp/zone-wrap.js';
}

(async () => {
  const want = process.argv.slice(2).filter((a) => SPOTS[a]);
  const list = want.length ? want : Object.keys(SPOTS);
  const wrapPath = writeWrap();
  if (!KEEP_DB) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(ZDB + s); } catch (e) {} }

  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(3000);

  const { chromium } = require('playwright');
  const results = [];
  for (const key of list) {
    const spot = SPOTS[key];
    // ★래퍼는 스케일 적용 뒤에 끼어들므로 **실 px 그대로** 넣는다(위 좌표계 함정 주석 참조).
    const patch = { mainSquare: { x: spot.px, y: spot.py, name: spot.name } };
    const z = boot('zone', wrapPath, {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify(patch),
    });
    if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.log('zone 기동 실패'); process.exit(1); }
    await sleep(4000);

    const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
    await page.goto(`http://localhost:${CPORT}/`);
    await sleep(2500);
    for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
      try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) {}
    }
    await sleep(14000);   // 접속 + 청크 활성화 + 건물 적재 + 렌더 안정
    if (spot.walk) { await page.keyboard.down(spot.walk.key); await sleep(spot.walk.ms); await page.keyboard.up(spot.walk.key); await sleep(2500); }
    const shot = `${SHOTS}/${key}.png`;
    await page.screenshot({ path: shot });
    // ★자명한 통과 금지 — 화면만 찍고 끝내지 않는다. 그 화면에 무엇이 올라와 있는지 클라 상태로 센다.
    const stat = await page.evaluate(() => {
      const bs = (typeof window.__getAllBuildings === 'function') ? window.__getAllBuildings() : [];
      const by = {};
      for (const b of bs) by[b.type] = (by[b.type] || 0) + 1;
      const own = {};
      for (const b of bs) { const p = String(b.ownerId || '').replace(/[0-9]+/g, '#'); own[p] = (own[p] || 0) + 1; }
      return { n: bs.length, by, own, me: (typeof window.__getMyAbs === 'function' ? window.__getMyAbs() : null) };
    }).catch(() => ({ n: -1, by: {}, own: {} }));
    console.log(`\n[${key}] ${spot.name}  → ${shot}`);
    console.log(`   클라 메모리 건물 ${stat.n}채 · type ${JSON.stringify(stat.by)}`);
    console.log(`   owner 패턴 ${JSON.stringify(stat.own)}`);
    results.push({ key, spot, stat, shot });
    await browser.close();
    try { z.kill(); } catch (e) {}
    await sleep(2500);
  }

  console.log(`\n=== 요약 ===`);
  for (const r of results) console.log(`  ${r.key.padEnd(7)} 건물 ${String(r.stat.n).padStart(4)}채  ${r.spot.name}`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(0);
})();
