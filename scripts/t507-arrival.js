#!/usr/bin/env node
// === scripts/t507-arrival.js — 도착 지점 추위 표 [T507 ⑤ · 2026-09-29] =====================
//
// ★묻는 것: "첫날 위험은 물지 않는다"(온보딩 캐논)를 **도착 셀**이 지키나 —
//   빈손(맨몸 · 옷 0)으로 나루터·길목에 선 사람의 추위 목표점이 계절 × 낮/밤에서 얼마이고,
//   그 밤을 서 있으면 추위 무들 1단계가 **첫날 안에** 서는가.
// ★판정은 한 줄도 여기서 짓지 않는다:
//   도착 자리 = 존 `/startinfo`(온보딩 `arriveFor` 가 앉히는 그 자리) · 그 자리의 마을 완충·바람 노출 = 게스트로
//   그 마을을 골라 **실제로 도착해** 받은 `gauges.weather`(`villageShelterOf`·`windExposureOf` 정본) ·
//   추위 목표점 = `body.coldTarget`(존 틱이 부르는 그 함수) · 1단계 문턱 = `body.STAGE_AT.cold[0] + STAGE_HYST` ·
//   서 있을 때 도달 시각 = `body.tick` 을 1초씩(존 틱과 같은 함수 · 새 식 0).
// ★제품 코드 0 · 러너 밖 · 도구. 실행: node scripts/t507-arrival.js [--out file.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const CPORT = 3712, ZPORT = 3722;
const CDB = `/tmp/t507a-central-${process.pid}.db`, ZDB = `/tmp/t507a-zone-${process.pid}.db`;
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : '/tmp/t507-arrival.json'; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  // 도착 자리 — 배경 굽기가 끝날 때까지(줄 수가 멈출 때까지) 묻는다
  let rows = [], prev = -1;
  for (let i = 0; i < 90; i++) {
    try { const j = await (await fetch(`http://localhost:${ZPORT}/startinfo`)).json(); rows = (j.villages || []).filter((v) => v.arrive && Number.isFinite(v.arrive.x)); } catch (e) {}
    if (rows.length && rows.length === prev) break;
    prev = rows.length; await sleep(4000);
  }
  console.log(`도착 자리 ${rows.length}곳`);
  const WS = require('ws');
  const got = [];
  for (const v of rows) {
    const q = new URLSearchParams({ name: `t507a${v.vid}`, color: '#777777', start_vid: String(v.vid) });
    const r = await new Promise((res) => {
      const ws = new WS(`ws://localhost:${ZPORT}/?${q}`);
      let wel = null; const to = setTimeout(() => { try { ws.close(); } catch (e) {} res(null); }, 20000);
      ws.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
        if (m.type === 'welcome') wel = m;
        if (m.type === 'gauges' && m.weather && Number.isFinite(m.weather.shelter) && wel) {
          clearTimeout(to); try { ws.close(); } catch (e) {}
          res({ x: wel.self && wel.self.x, y: wel.self && wel.self.y, shelter: m.weather.shelter, exp: m.weather.exp });
        } });
      ws.on('error', () => { clearTimeout(to); res(null); });
    });
    if (r) got.push(Object.assign({ vid: v.vid, name: v.name, kind: v.arrive.kind, ax: v.arrive.x, ay: v.arrive.y }, r));
  }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  // ── 계산 — 정본 함수 그대로(존 틱이 부르는 것) ──
  process.env.ZONE_ID = 'hanbando';
  const Body = require(path.join(ROOT, 'server', 'body.js'));
  const W = require(path.join(ROOT, 'server', 'weather.js'));
  const E = require(path.join(ROOT, 'server', 'events.js'));
  const TH = Body.STAGE_AT.cold[0] + Body.CFG.STAGE_HYST;
  const yd = E.calendarOf(0).yearDays;
  const mids = {};
  for (let d = 0; d < yd; d++) { const s = E.seasonOf(d); (mids[s] = mids[s] || []).push(d); }
  const seasons = Object.keys(mids).map((s) => ({ s, ko: E.KO_SEASON[s], day: mids[s][Math.floor(mids[s].length / 2)] }));
  const table = [];
  for (const a of got) for (const S of seasons) for (const night of [false, true]) {
    const ph = night ? W.PH.midnight : W.PH.noon;
    const ctx = { day: S.day, dayT: S.day + ph, dayPh: ph, night, warmth: 0, villageShelter: a.shelter, windExposure: a.exp, elevKm: 0 };
    const tgt = Body.coldTarget(ctx);
    // 서 있으면 언제 1단계가 서나 — 새 몸(추위 0)에서 1초씩(존 틱의 그 함수 · 한 게임 반날 = 실초 상한)
    const p = { hunger: 100, thirst: 100, hp: 100, maxHp: 100 };
    Body.ensure(p);
    let sec = null;
    const cap = 24 * 60;   // 게임 하루 = 실시간 24분(WORLD.dayLengthMs) — 첫날 안에 서나
    for (let t = 1; t <= cap; t++) { Body.tick(p, 1, Object.assign({ moving: false, now: Date.now() + t * 1000 }, ctx)); if (Body.ensure(p).cold >= TH) { sec = t; break; } }
    table.push({ vid: a.vid, name: a.name, kind: a.kind, season: S.ko, night, tempC: +(W.tempAtT ? W.tempAtT(ctx.dayT, 0, ph) : NaN).toFixed(1),
      shelter: a.shelter, exp: a.exp, target: tgt, stage1At: +TH.toFixed(3), bites: tgt >= TH, firstDaySec: sec });
  }
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), threshold: TH, seasons, arrivals: got, table }, null, 1));
  // 요약 — 계절 × 낮밤마다: 도착 자리 몇 곳에서 무는가 · 목표점 범위 · 첫 무들까지 실시간(분)
  console.log(`1단계 문턱 ${TH.toFixed(3)} · 도착 ${got.length}곳`);
  for (const S of seasons) for (const night of [false, true]) {
    const r = table.filter((t) => t.season === S.ko && t.night === night);
    const bite = r.filter((t) => t.firstDaySec !== null);
    const tg = r.map((t) => t.target);
    console.log(`${S.ko} ${night ? '밤' : '낮'} · 기온 ${r[0] && r[0].tempC}℃ · 목표점 ${Math.min(...tg).toFixed(3)}~${Math.max(...tg).toFixed(3)} · 문다 ${bite.length}/${r.length}`
      + (bite.length ? ` · 첫 무들 ${(Math.min(...bite.map((t) => t.firstDaySec)) / 60).toFixed(1)}~${(Math.max(...bite.map((t) => t.firstDaySec)) / 60).toFixed(1)}분` : ''));
  }
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
