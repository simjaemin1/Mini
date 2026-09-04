#!/usr/bin/env node
// =============================================================================
// probe-fishing-shots — 낚시터 방황 **실화면** 전/후 비교 [배치 17 ②]
//   재민 관측: "낚시터에서 미세하게 자꾸 방황하는데, 왜 그럴까?"
//   서버 궤적(probe-nightlife)이 수치 증거라면, 이건 **재민이 보는 화면** 증거다.
//
// 무엇을 하나:
//   ① 어촌 낚시터 한복판에 스폰시키고(래퍼로 mainSquare 덮어쓰기 — probe-spawn 선례)
//   ② 진짜 클라이언트(Playwright)로 접속해 1초 간격 연속 스크린샷 N장
//   ③ **자명한 통과 금지** — 화면만 찍고 끝내지 않는다. 같은 프레임 창에서 클라가 들고 있는
//      NPC 좌표(window.__getNpcs)를 같이 떠서 **낚시 중 어부의 프레임 간 이동거리**를 잰다.
//      화면 픽셀 diff 는 물결·조명도 같이 세므로 보조 지표로만 쓴다.
//
// ROOT 를 env 로 받는다 — `git worktree` 로 뽑은 **수리 전 트리**에 그대로 겨눌 수 있다.
//   TREE=/tmp/wt-before OUT=/tmp/fish-before node scripts/probe-fishing-shots.js
//
// 사용: [TREE=경로] [ZDB=씨딩된DB] [OUT=폴더] [FRAMES=15] node scripts/probe-fishing-shots.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const HERE = path.join(__dirname, '..');
const TREE = process.env.TREE || HERE;              // 서버 코드를 꺼내 올 트리(전/후 비교용)
const OUT = process.env.OUT || '/tmp/fish-shots';
const FRAMES = parseInt(process.env.FRAMES || '15', 10);
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/fish-${process.pid}.db`;
// 어촌1 낚시터 — 셀(1296,2357) 중심. probe-nightlife 덤프의 어부 목표가 이 둘레에 몰려 있다.
const PX = parseInt(process.env.PX || '41472', 10);
const PY = parseInt(process.env.PY || '75424', 10);

fs.mkdirSync(OUT, { recursive: true });
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ★계측기는 전/후가 **같아야** 한다: central(=클라 public/ 을 서빙)은 언제나 현재 트리에서 띄우고,
//   비교 대상인 zone.js·villages.js 만 TREE 에서 띄운다. 방황은 서버 층 결함이고 클라는 관측기일 뿐이다.
function boot(name, file, env, cwd) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd || TREE });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|시딩 완료|wrap|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 200)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/Experimental|trace-warnings/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 200)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function writeWrap() {
  const f = `/tmp/zone-wrap-fish.js`;
  fs.writeFileSync(f, `const path=require('path');const ROOT=${JSON.stringify(TREE)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);
  console.log('[wrap] '+ZID+' 덮어쓰기: '+JSON.stringify(patch));}catch(e){}
require(path.join(ROOT,'server','zone.js'));`);
  return f;
}

(async () => {
  console.log(`=== probe-fishing-shots — 트리 ${TREE} · 어촌1 낚시터(${PX},${PY}) · ${FRAMES}프레임 ===`);
  const wrap = writeWrap();
  boot('central', path.join(HERE, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, HERE);
  await sleep(2500);
  boot('zone', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: PX, y: PY, name: '어촌1 낚시터(계측 스폰)' } }),
  });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.error('zone 기동 실패'); process.exit(1); }
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(16000);   // 접속 + 청크 활성화 + NPC 적재

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const f = `${OUT}/f${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: f });
    // 클라가 들고 있는 NPC 상태 — 서버가 브로드캐스트한 실좌표(사본 아님)
    const npcs = await page.evaluate(() => (typeof window.__getNpcs === 'function' ? window.__getNpcs() : [])).catch(() => []);
    frames.push({ t: Date.now(), file: f, npcs });
    await sleep(1000);
  }
  await browser.close();

  // ── 분석 ①: 낚시 중 어부의 프레임 간 이동거리(1초 간격) ────────────────────
  const step = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = new Map(frames[i - 1].npcs.map((n) => [n.pid, n]));
    for (const n of frames[i].npcs) {
      const p = prev.get(n.pid); if (!p) continue;
      step.push({ job: n.job, act: n.act, d: Math.hypot(n.wx - p.wx, n.wy - p.wy) });
    }
  }
  const rep = (arr, tag) => {
    if (!arr.length) { console.log(`  ${tag}: 표본 없음`); return null; }
    const ds = arr.map((x) => x.d).sort((a, b) => a - b);
    const mv = arr.filter((x) => x.d > 3).length;
    const o = { n: arr.length, med: ds[Math.floor(ds.length / 2)], p90: ds[Math.floor(ds.length * 0.9)], max: ds[ds.length - 1], movingPct: mv / arr.length * 100 };
    console.log(`  ${tag}: ${o.n}쌍 · 이동 중앙 ${o.med.toFixed(1)}px · p90 ${o.p90.toFixed(1)} · 최대 ${o.max.toFixed(1)} · **움직인 프레임 ${o.movingPct.toFixed(0)}%**`);
    return o;
  };
  console.log(`\n① 클라 화면상 NPC 프레임 간 이동(1초 간격)`);
  const fish = rep(step.filter((s) => s.job === 'fisher' && s.act === '낚시'), '낚시 중 어부');
  const all = rep(step, '전체 NPC(대조)');

  // ── 분석 ②: 화면 픽셀 diff(보조 — 물결·조명 포함) ──────────────────────────
  let px = null;
  try {
    const { PNG } = require(path.join(HERE, 'node_modules', 'pngjs'));
    const rd = (f) => PNG.sync.read(fs.readFileSync(f));
    const diffs = [];
    for (let i = 1; i < frames.length; i++) {
      const a = rd(frames[i - 1].file), b = rd(frames[i].file);
      let ch = 0; const N = Math.min(a.data.length, b.data.length);
      for (let k = 0; k < N; k += 4) if (Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2]) > 24) ch++;
      diffs.push(ch / (N / 4) * 100);
    }
    diffs.sort((x, y) => x - y);
    px = { med: diffs[Math.floor(diffs.length / 2)], max: diffs[diffs.length - 1] };
    console.log(`\n② 화면 픽셀 변화율(1초 간격 · 물결/조명 포함): 중앙 ${px.med.toFixed(2)}% · 최대 ${px.max.toFixed(2)}%`);
  } catch (e) { console.log(`\n② 픽셀 diff 생략: ${e.message}`); }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ tree: TREE, px: { x: PX, y: PY }, fish, all, pixel: px, frames: frames.map((f) => ({ file: f.file, n: f.npcs.length })) }, null, 1));
  console.log(`\n프레임 ${frames.length}장 · 보고 ${OUT}/report.json`);
  // ★자명한 통과 금지 — 화면에 낚시 중 어부가 없으면 이 측정은 아무것도 말하지 않는다. 조용히 성공하지 마라.
  if (!fish || fish.n < 20) {
    console.error(`\n❌ 무효 측정 — 낚시 중 어부 표본 ${fish ? fish.n : 0}쌍(<20). 스폰 좌표나 시각(밤이면 취침)을 확인하라.`);
    for (const p of procs) { try { p.kill(); } catch (e) {} }
    process.exit(2);
  }
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(0);
})();
