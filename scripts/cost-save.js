#!/usr/bin/env node
// === scripts/cost-save.js — 주기 저장의 **값** 실측 ==============================
//
// ★[재민 확정 2026-08-26] "주기 저장 비용을 재서 보고하라."
//
// ★이 스크립트가 재는 것과, **재지 않아도 되는 것**:
//   `_periodicSave` 는 구조적으로 **틱당 최대 한 명**만 저장한다(`return` 으로 끊는다).
//   그래서 "사람이 늘면 비용이 는다"가 성립하지 않는다 — 인원이 늘면 **한 사람당 저장 주기가
//   길어질 뿐** 서버가 한 틱에 하는 일은 그대로다. 그 상한이 코드에 박혀 있으므로
//   실측이 답해야 할 것은 하나로 줄어든다: **저장 1회가 몇 ms 인가.**
//   (그리고 그 상한이 진짜인지 — 틱당 2건 이상이 난 적이 있는지 — 를 같이 본다.)
//
// ★계측기 결백: zone 을 **같은 프로세스에서** 띄워 `__testBind()._saveStats()` 정본을
//   그대로 읽는다(하네스가 저장 횟수를 자기 방식으로 세면 그게 사본이다).
//
// 실행: node scripts/cost-save.js [사람수=8] [초=70]
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));
const ROOT = path.join(__dirname, '..');
const N = parseInt(process.argv[2], 10) || 8;
const SECS = parseInt(process.argv[3], 10) || 70;
const CPORT = 3010, ZPORT = 3021;
const CDB = `/tmp/cs-central-${process.pid}.db`, ZDB = `/tmp/cs-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'],
    env: Object.assign({}, process.env, { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }),
  });
  procs.push(c);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${CPORT}/zones`)).ok) break; } catch (e) {} await sleep(1000); }

  Object.assign(process.env, {
    ZONE_ID: 'hanbando', PORT: String(ZPORT), DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    SAVE_INTERVAL_MS: process.env.SAVE_INTERVAL_MS || '30000',
  });
  const _l = console.log; console.log = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  console.log = _l;
  const H = Zone.__testBind();
  await sleep(4000);

  const S = [];
  for (let i = 0; i < N; i++) {
    const s = { ws: new WS(`ws://localhost:${ZPORT}`), pid: null, ok: false };
    s.ws.on('message', (d) => { let m; try { m = JSON.parse(d.toString()); } catch (e) { return; } if (m.type === 'welcome') { s.pid = m.pid; s.ok = true; } });
    s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
    S.push(s); await sleep(150);
  }
  for (let i = 0; i < 100 && S.some((s) => !s.ok); i++) await sleep(200);
  const live = S.filter((s) => s.ok).length;
  console.log(`\n=== 주기 저장 비용 실측 — 사람 ${live}명 · ${SECS}초 · SAVE_INTERVAL_MS ${H._saveStats().intervalMs} ===`);
  if (live < N) console.log(`  ⚠ ${N}명 중 ${live}명만 입장했다 — 아래 수치는 그 인원 기준이다`);

  const t0 = Date.now(); let seq = 1, peak = 0, prev = H._saveStats().saved;
  const samples = [];
  while (Date.now() - t0 < SECS * 1000) {
    const a = (Date.now() / 900) % 2 < 1 ? 1 : -1;
    for (const s of S) s.send({ type: 'input', vx: a, vy: a * 0.4, seq: seq++, sprint: false });
    await sleep(60);
    const now = H._saveStats().saved;
    if (now - prev > peak) peak = now - prev;
    samples.push(now - prev); prev = now;
  }
  for (const s of S) { s.send({ type: 'input', vx: 0, vy: 0, seq: seq++ }); }
  await sleep(500);

  const st = H._saveStats();
  const per = st.saved ? st.ms / st.saved : 0;
  console.log(`  저장 ${st.saved}건 · 누적 ${st.ms}ms → **1회 ${per.toFixed(3)}ms**`);
  console.log(`  건너뜀 — 안 움직임 ${st.skippedClean} · 밀려난 세션 ${st.skippedSuperseded}`);
  console.log(`  60ms 표본 ${samples.length}개 중 한 표본 최다 저장 ${peak}건 (틱당 1건 상한이 지켜지는가)`);
  const rate = st.saved / SECS;
  console.log(`  실측 속도 ${rate.toFixed(2)}건/초 · 서버가 저장에 쓴 시간 비율 ≈ ${(rate * per / 10).toFixed(4)}%`);
  console.log(`\n  ※ 라이브 환산: 틱당 1건이 구조적 상한이므로 인원이 늘어도 초당 저장 건수는`);
  console.log(`     min(인원/${st.intervalMs / 1000}초, 1/틱) 을 넘지 않는다. 1회 ${per.toFixed(3)}ms 이므로`);
  console.log(`     상한을 다 쓰는 최악에도 서버 시간의 ${(per / 50 * 100).toFixed(2)}% (틱 50ms 기준) 이다.`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
