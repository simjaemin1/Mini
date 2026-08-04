#!/usr/bin/env node
// =============================================================================
// probe-nightlife — 밤 어부 · 낚시터 미세 방황 계측 [배치 17 ②]
//   재민 관측: "npc가 밤인데도 밖에서 낚시하고, 낚시터에서 미세하게 자꾸 방황하는데, 왜 그럴까?"
//
// 무엇을 재나 (추측 금지 — 전부 서버 실상태):
//   ⓐ **밤 판정** — NPC 취침 게이트는 `(worldPhase + simLonOff) % 1`(§19 경도 로컬 태양시)다.
//      ★★1차 작성의 전제가 틀렸다(2026-08-04c 정정): "화면 조명은 경도를 무시한다"고 적었는데
//        **아니다.** client.js worldPhase()는 `_lonView`(카메라 위치 기준 0~0.045)를 더한다(1079·3535행).
//        마을 앞에 선 플레이어의 `_lonView` 와 그 마을 `_lonOff` 는 같은 0.045 상수를 같은 비율로 쓰므로
//        (px/존폭 vs 셀/셀폭) 차이가 셀 반폭 = 0.015초에 불과하다 — **화면과 마을은 갈라질 수 없다.**
//        아래 '화면상 밤'은 그러니 **전역 밤**이라고 읽어라(서버 /lifedbg 의 phase = 경도 무가산).
//   ⓑ **밤에 밖** — 밤 구간에서 act 가 취침/귀가/요양이 아닌 NPC를 마을·직업별로 센다.
//   ⓒ **미세 방황** — 같은 NPC의 연속 표본 사이 이동거리 분포. 목표(tgt)가 매 표본 바뀌면
//      "도착 못 하고 목표만 새로 뽑는" 진동이다.
//
// 하루를 짧게 줄여 밤을 빨리 만난다: WORLD_DAY_MS 로 zone-config 의 dayLengthMs 를 덮어쓴다
// (래퍼가 WORLD 를 직접 고친다 — 프로덕션 기본값 무변).
//
// 사용: ZDB=/tmp/x.db node scripts/probe-nightlife.js [총초] [폴링초]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/probe-nightlife.db';
const DAY_MS = parseInt(process.env.WORLD_DAY_MS || '180000', 10);   // 기본 3분 = 낮 126초 · 밤 54초
const TOTAL = parseInt(process.argv[2] || '400', 10);
const EVERY = parseInt(process.argv[3] || '3', 10);
const OUT = process.env.OUT || '/tmp/nightlife.json';

try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|시딩 완료|wrap|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 200)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/Experimental|trace-warnings/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 200)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
// 하루 길이까지 덮어쓰는 래퍼 — zone-config 의 WORLD 를 로드 직후 고친다
function writeWrap() {
  fs.writeFileSync('/tmp/zone-wrap-night.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
if(process.env.WORLD_DAY_MS){cfg.WORLD.dayLengthMs=parseInt(process.env.WORLD_DAY_MS,10);
  console.log('[wrap] dayLengthMs='+cfg.WORLD.dayLengthMs+' (낮비율 '+cfg.WORLD.dayPhaseRatio+')');}
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);}catch(e){}
require(path.join(ROOT,'server','zone.js'));`);
  return '/tmp/zone-wrap-night.js';
}

(async () => {
  console.log(`=== probe-nightlife — 하루 ${(DAY_MS / 1000).toFixed(0)}초 · ${TOTAL}초 동안 ${EVERY}초마다 표본 ===`);
  const wrap = writeWrap();
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WORLD_DAY_MS: String(DAY_MS),
  });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.error('zone 기동 실패'); process.exit(1); }
  await sleep(4000);

  // 어촌 하나에 관측자를 붙여 청크를 활성 상태로 둔다(비활성이면 NPC 가 휴면이라 방황을 못 잰다)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const vil = db.prepare("SELECT name, cx, cy FROM villages WHERE name LIKE '어촌%' ORDER BY id LIMIT 1").get()
    || db.prepare('SELECT name, cx, cy FROM villages ORDER BY id LIMIT 1').get();
  console.log(`  관측 마을: ${vil.name} 셀(${vil.cx},${vil.cy})`);
  const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WebSocket(`ws://localhost:${ZPORT}/?observer=1&vx=${vil.cx * 32}&vy=${vil.cy * 32}`);
  ws.on('error', () => {});
  const keep = setInterval(() => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: vil.cx * 32, y: vil.cy * 32 })); } catch (e) {} }, 3000);

  const samples = [];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < TOTAL) {
    try {
      const d = await (await fetch(`http://localhost:${ZPORT}/lifedbg`)).json();
      const v = (d.villages || []).find((x) => x.name === vil.name);
      // ★관측 마을(활성 청크)뿐 아니라 **전 마을** 표본도 담는다 — 휴면 마을(비활성 청크)의 NPC 는
      //   npcStep 이 안 돌아 그 자리에 얼어 있다. "밤인데 낚시터에 서 있다"의 유력 후보라 같이 센다.
      const all = [];
      for (const vv of (d.villages || [])) for (const n of (vv.sample || [])) all.push({ v: vv.name, ...n });
      samples.push({ t: Date.now(), phase: d.phase, dayR: d.dayR, sample: v ? v.sample : [], acts: v ? v.acts : {}, all });
    } catch (e) {}
    await sleep(EVERY * 1000);
  }
  clearInterval(keep); try { ws.close(); } catch (e) {}

  // ── 분석 ───────────────────────────────────────────────────────────────────
  const dayR = samples.find((s) => s.dayR)?.dayR || 0.7;
  const nightSamples = samples.filter((s) => s.phase != null && s.phase >= dayR);
  console.log(`\n표본 ${samples.length}개 · 그중 전역 밤(phase ≥ ${dayR} · 경도 무가산) ${nightSamples.length}개`);

  // ⓐ 경도 오프셋 폭
  const lons = new Set();
  for (const s of samples) for (const n of s.sample) if (n.lon != null) lons.add(n.lon);
  console.log(`\nⓐ 이 마을 §19 경도 오프셋: ${[...lons].join(', ')} (하루의 비율 — 마을 앞에 선 플레이어의 화면도 같은 값을 쓴다)`);

  // ⓑ 밤에 밖 — 화면상 밤인데 act 가 취침/귀가/요양이 아닌 NPC
  const OUTACT = (a) => a && !['취침', '귀가', '요양', '휴식'].includes(a);
  let nOut = 0, nTot = 0; const outJobs = {}, outActs = {};
  for (const s of nightSamples) for (const n of s.sample) {
    nTot++;
    if (OUTACT(n.act)) { nOut++; outJobs[n.job || '(무)'] = (outJobs[n.job || '(무)'] || 0) + 1; outActs[n.act] = (outActs[n.act] || 0) + 1; }
  }
  console.log(`\nⓑ-1 관측 마을(활성 청크) — 전역 밤인데 밖일: ${nOut}/${nTot} 표본 (${nTot ? (nOut / nTot * 100).toFixed(1) : 0}%)`);
  console.log(`   직업별: ${JSON.stringify(outJobs)}`);
  console.log(`   라벨별: ${JSON.stringify(outActs)}`);
  // ★전 마을(휴면 포함) — 활성(on=1)과 휴면(on=0)을 갈라 센다
  {
    let aOut = 0, aTot = 0, dOut = 0, dTot = 0; const dJobs = {}, dActs = {};
    for (const s of nightSamples) for (const n of (s.all || [])) {
      const act = OUTACT(n.act);
      if (n.on === 1) { aTot++; if (act) aOut++; }
      else { dTot++; if (act) { dOut++; dJobs[n.job || '(무)'] = (dJobs[n.job || '(무)'] || 0) + 1; dActs[n.act] = (dActs[n.act] || 0) + 1; } }
    }
    console.log(`ⓑ-2 전 마을 — 활성 청크: ${aOut}/${aTot} 밖 (${aTot ? (aOut / aTot * 100).toFixed(1) : 0}%)`);
    console.log(`ⓑ-3 전 마을 — **휴면 청크**: ${dOut}/${dTot} 밖 (${dTot ? (dOut / dTot * 100).toFixed(1) : 0}%)  ← npcStep 이 안 돌아 그 자리에 얼어 있는 무리`);
    console.log(`   휴면 밖 직업별: ${JSON.stringify(dJobs)}`);
    console.log(`   휴면 밖 라벨별: ${JSON.stringify(dActs)}`);
  }
  // 그 표본들의 로컬 태양시 — dayR 를 넘었는가(넘었는데도 밖이면 게이트 문제, 안 넘었으면 경도 설계)
  const fvs = [];
  for (const s of nightSamples) for (const n of s.sample) if (OUTACT(n.act) && n.fv != null) fvs.push(n.fv);
  if (fvs.length) {
    fvs.sort((a, b) => a - b);
    const over = fvs.filter((f) => f >= dayR).length;
    console.log(`   그 표본의 로컬 태양시 fv: 최소 ${fvs[0]} · 중앙 ${fvs[Math.floor(fvs.length / 2)]} · 최대 ${fvs[fvs.length - 1]}`);
    console.log(`   → fv 도 밤(≥${dayR})인 표본: ${over}/${fvs.length} ${over ? '★게이트가 안 먹은 것' : '→ 전부 경도 차이(설계)'}`);
  }

  // ⓒ 미세 방황 — 같은 (job,x0) 추적이 어려우니 표본 슬롯 인덱스로 근사(순서 안정)
  const jitter = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].sample, b = samples[i].sample;
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (a[k].job !== b[k].job) continue;
      const d = Math.hypot(b[k].x - a[k].x, b[k].y - a[k].y);
      const tgtChanged = JSON.stringify(a[k].tgt) !== JSON.stringify(b[k].tgt);
      jitter.push({ job: a[k].job, act: b[k].act, d, tgtChanged, beh: b[k].beh });
    }
  }
  const fish = jitter.filter((j) => j.job === 'fisher' && j.act === '낚시');
  const rep = (arr, tag) => {
    if (!arr.length) { console.log(`   ${tag}: 표본 없음`); return; }
    const ds = arr.map((x) => x.d).sort((a, b) => a - b);
    const chg = arr.filter((x) => x.tgtChanged).length;
    console.log(`   ${tag}: ${arr.length}쌍 · 이동거리 중앙 ${ds[Math.floor(ds.length / 2)].toFixed(1)}px · 최대 ${ds[ds.length - 1].toFixed(1)}px · **목표가 바뀐 비율 ${(chg / arr.length * 100).toFixed(0)}%**`);
  };
  console.log(`\nⓒ 미세 방황 (연속 표본 ${EVERY}초 간격)`);
  rep(fish, '낚시 중 어부');
  rep(jitter.filter((j) => j.job === 'farmer'), '농부(대조군)');
  rep(jitter.filter((j) => j.job === 'lumberjack'), '나무꾼(대조군)');

  fs.writeFileSync(OUT, JSON.stringify({ dayMs: DAY_MS, dayR, samples }, null, 1));
  console.log(`\n덤프: ${OUT}`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(0);
})();
