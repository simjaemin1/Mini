#!/usr/bin/env node
// =============================================================================
// e2e-cutaway — 실내 컷어웨이 실클라 E2E [배치 17 ①]
//   재민 관측: "건물 안으로 들어가도 내부가 안 보이네.. 동쪽 벽과 남쪽 벽이 투명해지도록 한 게 안 먹네"
//
// ★원인(수리 대상): `data.hut`·`data.bld` 발자국 렉트는 **존 로컬 셀**인데 실내 판정이
//   `myAbsPredicted`(월드 절대)를 32 로 나눠 비교하고 있었다. 한반도 worldOffsetX=409,984 이라
//   플레이어 셀 13,775 vs 렉트 960~967 — **영원히 false**. 지붕도 벽도 실내 NPC 가림도 다 죽어 있었다.
//
// ★검사는 **두 층 다** 본다(하나만 보면 자명 통과가 난다):
//   ⓐ 계약 — `window.__cutawayDbg`(프레임의 발자국 렉트 + 지붕 표시 여부 + 내 로컬 셀)
//   ⓑ 화면 — 같은 자리에서 안/밖 스크린샷의 **픽셀 차이**. 지붕이 실제로 사라졌는지 눈으로 세는 층.
//     카메라는 플레이어를 중앙에 두므로 '화면 중앙 위쪽 상자'가 지붕 영역이다.
//     대조군(화면 아래 구석)도 같이 재서 "그냥 전체가 흔들린 것"과 구분한다.
//
// 사용: node scripts/e2e-cutaway.js         (시딩된 DB 재사용: ZDB=/path/to.db)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-cutaway-shots';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-cutaway-${process.pid}.db`;
const KEEP_DB = !!process.env.ZDB;
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const eq = (a, b, m) => ok(a === b, `${m} (${JSON.stringify(a)} === ${JSON.stringify(b)})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 스트레이 서버 정리 — 고정 포트라 옛 서버에 붙으면 딴 세계를 잰다
try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}

const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/시딩 완료|server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 200)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/ExperimentalWarning|trace-warnings/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 200)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function writeWrap() {
  // ★★[2026-08-04d 배치 18] **하루를 멈춘다.** 이 하네스는 안/밖 두 판을 **2분 간격**으로 띄워 찍는데,
  //   그 사이 게임 시각이 두 시간 흘러 조명이 바뀌면 픽셀 지표가 통째로 흔들린다.
  //   실제로 그렇게 깨졌다: 대조군(건물 밖 지면) 평균 절대차가 5.5 → **72.3** 으로 뛰어
  //   "변화가 지붕에 몰려 있다"가 거짓이 됐다. 지붕 신호(이엉 11.6%→1.8%)는 멀쩡했는데도.
  //   하루를 24시간으로 늘리고 epoch 을 정오에 앵커 → 촬영 중 조명 변화 ≈ 0.
  fs.writeFileSync('/tmp/zone-wrap.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
if(process.env.WRAP_DAY_MS){const d=parseInt(process.env.WRAP_DAY_MS,10);
  cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
  console.log('[wrap] 하루 정지 — dayLengthMs='+d+' · phase≈0.25(정오)');}
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);
console.log('[wrap] '+ZID+' 덮어쓰기: '+JSON.stringify(patch));}catch(e){console.error('[wrap] patch 실패:',e.message);}
require(path.join(ROOT,'server','zone.js'));`);
  return '/tmp/zone-wrap.js';
}
// 화면 상자 평균색 — 카메라가 플레이어를 중앙에 두므로 상자는 '플레이어 기준' 영역이다
function boxStat(png, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * png.width + x) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n, n };
}
function boxDiff(a, b, x0, y0, x1, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return s / n / 3;   // 채널 평균 절대차 (0~255)
}

(async () => {
  say('=== 실내 컷어웨이 실클라 E2E (배치 17) ===');
  const wrap = writeWrap();
  if (!KEEP_DB) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(ZDB + s); } catch (e) {} }

  // 시딩 DB 에서 큰집 자리를 읽어 스폰을 정한다 — 좌표를 손으로 박지 않는다(맵이 바뀌면 하네스가 거짓말한다)
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);

  // 1차 부팅: DB 를 만들거나(없으면) 그대로 쓴다. 스폰은 아래에서 정하므로 일단 기본으로 띄운다.
  let hall = null;
  if (fs.existsSync(ZDB)) hall = readHall(ZDB);
  if (!hall) {
    const z0 = boot('zone', path.join(ROOT, 'server', 'zone.js'), {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), '시딩 부팅(첫 판 — 50곳이라 오래 걸린다)');
    try { z0.kill(); } catch (e) {}
    await sleep(3000);
    hall = readHall(ZDB);
  }
  ok(!!hall, `큰집 자리 확보 — ${hall ? `${hall.name} 중심 셀(${hall.cx},${hall.cy})` : '실패'}`);
  if (!hall) return finish();

  // 큰집 발자국 [cx-4,cy-4,cx+3,cy+3] · 남벽 문 = (cx-1),(cx) @ y=cy+4
  const RECT = [hall.cx - 4, hall.cy - 4, hall.cx + 3, hall.cy + 3];
  const IN = { cx: hall.cx - 1, cy: hall.cy - 1 };            // 안 (중앙 근처)
  const OUT = { cx: hall.cx - 1, cy: hall.cy + 8 };           // 밖 (남쪽 8셀 — 문 앞 1셀 개방 규칙 밖)
  say(`  큰집 발자국 [${RECT}] · 안(${IN.cx},${IN.cy}) · 밖(${OUT.cx},${OUT.cy})`);

  const shots = {};
  for (const [tag, at] of [['inside', IN], ['outside', OUT]]) {
    const z = boot('zone', wrap, {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_DAY_MS: '86400000',
      WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: at.cx * 32 + 16, y: at.cy * 32 + 16, name: `컷어웨이 ${tag}` } }),
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), `zone 기동 (${tag})`);
    await sleep(4000);
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
    for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
      try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) {}
    }
    await sleep(14000);
    const dbg = await page.evaluate(() => window.__cutawayDbg || null).catch(() => null);
    const shotP = `${SHOTS}/${tag}.png`;
    await page.screenshot({ path: shotP });
    shots[tag] = { dbg, png: PNG.sync.read(fs.readFileSync(shotP)), path: shotP };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }

  // ── ⓐ 계약 층 ─────────────────────────────────────────────────────────────
  say('\n[ⓐ 계약 — window.__cutawayDbg]');
  const find = (d) => (d && d.rects || []).find((x) => x.r[0] === RECT[0] && x.r[1] === RECT[1]);
  const dIn = shots.inside.dbg, dOut = shots.outside.dbg;
  ok(!!dIn && !!dOut, '두 판 모두 컷어웨이 진단값이 나온다');
  const rIn = find(dIn), rOut = find(dOut);
  ok(!!rIn && !!rOut, '두 판 모두 그 큰집 발자국을 인식한다');
  if (dIn) eq(dIn.lcx, IN.cx, '안: 클라가 계산한 내 존 로컬 셀 x');
  if (dIn) eq(dIn.lcy, IN.cy, '안: 클라가 계산한 내 존 로컬 셀 y');
  if (dOut) eq(dOut.lcx, OUT.cx, '밖: 로컬 셀 x');
  if (rOut) eq(rOut.roofOn, true, '★밖에서는 지붕이 그려진다');
  if (rIn) eq(rIn.roofOn, false, '★★안에서는 지붕이 걷힌다(컷어웨이)');

  // ── ⓑ 화면 층 ─────────────────────────────────────────────────────────────
  //   플레이어는 항상 화면 중앙(700,450). 큰집 지붕은 그 '위쪽'을 크게 덮는다.
  say('\n[ⓑ 화면 — 픽셀]');
  const A = shots.inside.png, B = shots.outside.png;
  const ROOF = [430, 250, 970, 470];      // 중앙 위쪽 상자 = 지붕 영역
  const CTRL = [40, 700, 340, 870];       // 대조군 = 화면 좌하단 구석(건물 밖 지면)
  const dRoof = boxDiff(A, B, ...ROOF), dCtrl = boxDiff(A, B, ...CTRL);
  const sInRoof = boxStat(A, ...ROOF), sOutRoof = boxStat(B, ...ROOF);
  say(`    지붕 상자 평균 절대차 ${dRoof.toFixed(1)} · 대조군 ${dCtrl.toFixed(1)}`);
  say(`    지붕 상자 평균색 — 안 rgb(${sInRoof.r.toFixed(0)},${sInRoof.g.toFixed(0)},${sInRoof.b.toFixed(0)}) · 밖 rgb(${sOutRoof.r.toFixed(0)},${sOutRoof.g.toFixed(0)},${sOutRoof.b.toFixed(0)})`);
  ok(dRoof > 25, `★지붕 영역이 실제로 바뀐다 (절대차 ${dRoof.toFixed(1)} > 25)`);
  ok(dRoof > dCtrl * 1.8, `★변화가 지붕 영역에 몰려 있다 (지붕 ${dRoof.toFixed(1)} > 대조군 ${dCtrl.toFixed(1)} × 1.8)`);
  // ★자명 통과 금지 — "밖 화면에 지붕이 실제로 있었나"를 먼저 세운다. 평균색은 지면·다른 지붕에
  //   희석돼 신호가 거의 없다(1차 작성이 24.5 vs 23.3 으로 사실상 무의미했다) — **이엉 픽셀 비율**로 센다.
  //   이엉 = 초록기 없는 밝은 카키: (G−B) 크고 R≈G.
  const khakiPct = (g, x0, y0, x1, y1) => {
    let n = 0, k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * g.width + x) * 4, r = g.data[i], gg = g.data[i + 1], b2 = g.data[i + 2];
      n++; if (gg - b2 > 28 && r > 110 && Math.abs(r - gg) < 30) k++;
    }
    return k / n * 100;
  };
  const kIn = khakiPct(A, ...ROOF), kOut = khakiPct(B, ...ROOF);
  say(`    지붕 상자 이엉 픽셀 — 안 ${kIn.toFixed(1)}% · 밖 ${kOut.toFixed(1)}%`);
  ok(kOut > 6, `★자명 통과 금지 — 밖 화면의 지붕 상자에 이엉이 실제로 있다 (${kOut.toFixed(1)}% > 6%)`);
  ok(kIn < kOut * 0.4, `★★안에 들어가면 그 이엉이 사라진다 (안 ${kIn.toFixed(1)}% < 밖 ${kOut.toFixed(1)}% × 0.4)`);

  say(`\n스크린샷: ${shots.inside.path} · ${shots.outside.path}`);
  finish();

  function finish() {
    for (const p of procs) { try { p.kill(); } catch (e) {} }
    say(`\n=== 실내 컷어웨이 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
    process.exit(fail ? 1 : 0);
  }
})();

function readHall(dbPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const r = db.prepare('SELECT name, cx, cy FROM villages ORDER BY id LIMIT 1').get();
    return r ? { name: r.name, cx: r.cx, cy: r.cy } : null;
  } catch (e) { return null; }
}
