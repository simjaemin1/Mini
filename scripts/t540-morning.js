#!/usr/bin/env node
// === scripts/t540-morning.js — 침대 곁 아침 첫 걸음 표(주민 전체) [T540 ① · 2026-09-30] =====================
//
// ★묻는 것: 밤을 침대 곁에서 난 주민이 **깨고 나서** 실제로 나서는가 — 촌장만인가(T529 회부 ①) 주민 전체인가.
//   ⓐ 해 뜨기 전(세계 phase 0.97) 침대 곁(`dBed` ≤ 12px)에 선 주민 명부 · 슬롯(`BED_SLOTS` i) · 집 종류(움집 · 폴백)
//   ⓑ 깬 뒤(로컬 태양시 `fv` ≥ 개인 기상 시차 `_dOff`) 60초 안에 침대에서 몇 px 떨어졌나 — 6px 미만이면 "못 뗐다"
//   ⓒ 못 뗀 주민의 그 자리 — 셀 네 변의 벽(`edgeBlockedStep`) · 지형 · 목표 · 직선 · A*(예산 1,500 · 무한 · 제 마당) · 속도 · 경로
// ★판정은 한 줄도 여기서 짓지 않는다 — 전부 존의 관측창 `/walkdbg`(안 문 · 존 정본 술어를 **그대로** 부른 값)다.
//   손님 50명(쉼터 안 도착 · T520)은 마을 청크를 깨우는 관측자다(비활성 청크 주민은 원래 안 걷는다 — `active` 칸으로 가른다).
// ★밤을 당겨 재기: `NODE_OPTIONS="--require scripts/t455-clock.js" T455_CLOCK_PRE=1 T455_CLOCK_AT=<phase 0.56 의 ms>`(T455 자 · 서버 무접촉).
// ★제품 코드 0 · 러너 밖 · 도구. 실행: node scripts/t540-morning.js [--cport 3716 --zport 3726] [--env K=V …] [--out f.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ZC = require('../server/zone-config');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const CPORT = +val('--cport', '3716'), ZPORT = +val('--zport', '3726');
const OUT = val('--out', '/tmp/t540-morning.json');
const CDB = `/tmp/t540-central-${process.pid}.db`, ZDB = `/tmp/t540-zone-${process.pid}.db`;
const ZENV = { T520_ARRIVE_INDOOR: '1' };
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const jget = async (u) => { try { return await (await fetch(u)).json(); } catch (e) { return null; } };
const ph = () => ZC.worldPhase(Date.now());
async function untilPhase(target) {   // 세계 phase 가 target 을 지날 때까지(0 을 넘어가는 것 포함)
  const W = ZC.WORLD; let wait = ((target - ph() + 1) % 1) * W.dayLengthMs; if (wait > W.dayLengthMs - 2000) wait = 0;
  say(`  phase ${ph().toFixed(3)} → ${target.toFixed(3)} · ${(wait / 60000).toFixed(1)}분`); await sleep(wait);
}

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0', ...ZENV });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await cu).ok || !(await zu).ok) { say('기동 실패'); process.exit(1); }
  let rows = [], prev = -1;
  for (let i = 0; i < 90; i++) {
    const j = await jget(`http://localhost:${ZPORT}/startinfo`);
    rows = ((j && j.villages) || []).filter((v) => v.arrive && Number.isFinite(v.arrive.x));
    if (rows.length && rows.length === prev) break;
    prev = rows.length; await sleep(4000);
  }
  for (let k = 0; k < 3; k++) { await jget(`http://localhost:${ZPORT}/shelterdbg?scan=1`); await sleep(1500); }
  say(`도착 자리 ${rows.length}곳 · 손잡이 ${JSON.stringify(ZENV)}`);
  // 손님(관측자) — 다섯씩 · 30초 좀비 문에 안 걸리게 핑
  const WS = require('ws'); const socks = [];
  const pinger = setInterval(() => { for (const ws of socks) { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} } }, 8000);
  const join = (v) => new Promise((res) => {
    const ws = new WS(`ws://localhost:${ZPORT}/?${new URLSearchParams({ name: `t540${v.vid}`, color: '#777777', start_vid: String(v.vid) })}`);
    socks.push(ws); const to = setTimeout(res, 20000);
    ws.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; } if (m.type === 'welcome') { clearTimeout(to); res(); } });
    ws.on('error', () => { clearTimeout(to); res(); });
  });
  for (let i = 0; i < rows.length; i += 5) await Promise.all(rows.slice(i, i + 5).map(join));
  say(`손님 ${socks.filter((w) => w.readyState === 1).length}명 · phase ${ph().toFixed(3)}`);
  // ⓐ 해 뜨기 전 명부
  await untilPhase(0.965);
  const pre = await jget(`http://localhost:${ZPORT}/walkdbg`);
  const inBed = new Map();
  for (const n of (pre && pre.npcs) || []) if (n.dBed != null && n.dBed <= 12) inBed.set(n.pid, { ...n, bx: n.x, by: n.y, wakeAt: null, maxD: 0, d60: null, samples: 0 });
  say(`주민 ${pre ? pre.n : '?'} · 침대 곁 ${inBed.size} · 활성 ${[...inBed.values()].filter((n) => n.active).length}`);
  // ⓑ 새벽 걸음 — 3초마다 전수(가벼운 칸)
  const t0 = Date.now(); const FZ = [];
  while (Date.now() - t0 < 6.5 * 60000) {
    await sleep(3000);
    const d = await jget(`http://localhost:${ZPORT}/walkdbg`); if (!d || !d.npcs) continue;
    const now = d.t;
    { const aw = d.npcs.filter((n) => n.fv != null && n.dOff != null && n.fv >= n.dOff && n.fv < 0.7);   // ★멎음 — 깬 주민 가운데 5초 넘게 걸음 문을 못 받은 수(`stepAge`)
      const fr = aw.filter((n) => (n.stepAge || 0) > 5000); FZ.push({ ph: d.phase, awake: aw.length, frozen: fr.length, maxAge: Math.max(0, ...aw.map((n) => n.stepAge || 0)), cursor: d.cursor, cut: d.cut }); }
    for (const n of d.npcs) {
      const r = inBed.get(n.pid); if (!r) continue;
      const awake = n.fv != null && n.dOff != null && n.fv >= n.dOff && n.fv < 0.7;
      if (awake && r.wakeAt == null) r.wakeAt = now;
      const dd = Math.hypot(n.x - r.bx, n.y - r.by);
      if (r.wakeAt != null && now - r.wakeAt <= 60000) { r.maxD = Math.max(r.maxD, dd); r.samples++; if (now - r.wakeAt >= 55000 && r.d60 == null) r.d60 = Math.round(dd); }
      r.last = { x: n.x, y: n.y, act: n.act, beh: n.beh, tgt: n.tgt, active: n.active, task: n.task };
    }
    const woke = [...inBed.values()].filter((r) => r.wakeAt != null && Date.now() - r.wakeAt > 60000).length;
    if (woke === inBed.size && inBed.size) break;
  }
  // ⓒ 못 뗀 주민의 자리 — 존 술어 그대로(A* 포함 · 한 번)
  const diag = await jget(`http://localhost:${ZPORT}/walkdbg?bed=1&astar=1`);
  const dg = new Map(((diag && diag.npcs) || []).map((n) => [n.pid, n]));
  clearInterval(pinger);
  for (const ws of socks) { try { ws.close(); } catch (e) {} }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  const L = [...inBed.values()].map((r) => ({ pid: r.pid, vid: r.vid, job: r.job, slot: r.slot, hk: r.hk, active: r.active,
    woke: r.wakeAt != null, maxD: Math.round(r.maxD), stuck: r.wakeAt != null && r.maxD < 6, last: r.last || null, diag: dg.get(r.pid) || null }));
  const woke = L.filter((r) => r.woke), stuck = woke.filter((r) => r.stuck);
  const by = (arr, k) => arr.reduce((o, r) => { const key = String(r[k]); o[key] = (o[key] || 0) + 1; return o; }, {});
  const sum = { residents: pre ? pre.n : null, inBed: L.length, woke: woke.length, activeWoke: woke.filter((r) => r.active).length,
    frozenPeak: Math.max(0, ...FZ.map((f) => f.frozen)), stepAgeMax: Math.max(0, ...FZ.map((f) => f.maxAge)), frozenPolls: FZ.filter((f) => f.frozen > 0).length,
    stuck: stuck.length, stuckActive: stuck.filter((r) => r.active).length,
    bySlotAll: by(woke, 'slot'), bySlotStuck: by(stuck, 'slot'), byHkAll: by(woke, 'hk'), byHkStuck: by(stuck, 'hk'),
    stuckEdges: by(stuck.map((r) => ({ e: r.diag && r.diag.edges ? Object.entries(r.diag.edges).filter(([, b]) => b).map(([k]) => k).join('') || '-' : '?' })), 'e'),
    stuckAstar: by(stuck.map((r) => ({ a: r.diag && r.diag.astar ? `b1500:${r.diag.astar.b1500 != null ? 'y' : 'n'}·inf:${r.diag.astar.inf != null ? 'y' : 'n'}·home:${r.diag.astar.home != null ? 'y' : 'n'}` : (r.diag ? 'noTgt' : 'left') })), 'a'),
    stuckTask: by(stuck.map((r) => ({ t: r.diag ? `${r.diag.act || '·'}/${r.diag.beh}/${r.diag.task || '-'}` : 'left' })), 't') };
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), env: ZENV, sum, frozen: FZ, list: L }, null, 1));
  say(JSON.stringify(sum, null, 1));
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
