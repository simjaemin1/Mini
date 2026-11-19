#!/usr/bin/env node
// (@regress 없음 — 러너 밖 진단 자 · T1368 ① · 제품 무변)
// === scripts/t1368-diag.js — 마을마다: 안내가 가리킨 바위 곁 맨손 E 가 무엇을 주나(Q16) · 도착 때 의뢰판에 새 사람이 낼 것이 있나(Q19) ====================
//
// ★손은 플레이어 손이다(ws · 게스트 계정 · 시작 마을을 골라 들어온다) — 안내 칸(`onboarding_state.own.rock`) 자리에서 바위 곁(+30px)으로
//   순간이동(`teleport_debug` · E2E_GIVE 판) → 맨손 E(`gather` 무지목) 두 번 → 가방에 무엇이 들었나 · 그 마을 한복판에서 의뢰판(`village_board`).
//   검사 하네스(`test-onb-blackbox`)가 재는 그 자리를 51 마을로 넓힌 것이다(그 하네스 글자를 안 부른다 — 손 순서만 같다).
// ★"새 사람이 낼 수 있는 것" — 검사 하네스와 같은 뜻(맨손 · 조잡한 도구로 얻는 것: 나무 · 돌 · 자갈 · 잔가지 · 풀 · 열매 · 약초 — 그 하네스 머리 표 그대로).
//
// 쓰는 법: node scripts/t1368-diag.js [--max 51] [--day-ms 500] [--port 3110] [--knob 1|0] --out <json>
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const MAX = val('--max', '51'), DMS = val('--day-ms', '500'), PB = +val('--port', '3110'), KN = val('--knob', '1'), OUT = val('--out', '/tmp/t1368-diag.json');
const CPORT = PB, ZPORT = PB + 10;
const NEWBIE = new Set(['wood', 'stone', 'pebble', 'twig', 'fiber', 'berry', 'herb']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const CDB = `/tmp/t1368-diag-c-${process.pid}.db`, ZDB = `/tmp/t1368-diag-z-${process.pid}.db`;
function boot(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; }
function down() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', down);
function connect(user, vid) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username: user, password: 'pw-' + user, name: user, color: '#5a9ae0' }); if (vid != null) q.set('start_vid', String(vid));
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const B = { ws, inv: {}, notices: [], msgs: [], res: new Map() };
    const to = setTimeout(() => reject(new Error('접속 시간초과')), 90000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') { B.W = m; B.inv = m.inventory || {}; for (const r of m.resources || []) B.res.set(r.id, r); clearTimeout(to); resolve(B); }
      else if (m.type === 'inventory') B.inv = m.inventory || {};
      else if (m.type === 'notice') B.notices.push(String(m.text || ''));
      else if (m.type === 'resources_spawn') { for (const r of m.resources || []) B.res.set(r.id, r); }
      else if (m.type === 'onboarding_state' || m.type === 'village_board') B.msgs.push(m);
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    B.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const send = (B, o) => { try { B.ws.send(JSON.stringify(o)); } catch (e) {} };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return fn(); }
async function ask(B, msg, type) { const n0 = B.msgs.length; send(B, msg); return waitFor(() => B.msgs.slice(n0).find((x) => x.type === type), 4000); }
async function warp(B, x, y) { const n0 = B.notices.length; send(B, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); await waitFor(() => B.notices.slice(n0).some((t) => /텔레포트 →/.test(t)), 3000); await sleep(600); }
(async () => {
  const t0 = Date.now();
  const cen = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zon = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    VILLAGE_MAX: MAX, VILLAGE_DAY_MS: DMS, E2E_GIVE: '1', T1341_OWN_HOUSE: KN === '1' ? '1' : '' });
  const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!a.ok || !b.ok) { console.log('기동 실패'); process.exit(2); }
  const probe = await connect('t1368probe', null);
  const VILS = (probe.W.simVillages || []).map((v) => ({ id: v.id, name: v.name }));
  try { probe.ws.close(); } catch (e) {}
  console.log(`마을 ${VILS.length}곳 · 켬 ${KN} · 기동 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  const rows = [];
  for (const v of VILS) {
    let P = null;
    try {
      P = await connect(`t1368v${v.id}x${process.pid}`, v.id); await sleep(1500);
      const st = await ask(P, { type: 'onboarding_state' }, 'onboarding_state');
      const own = st && st.state && st.state.own, arr = st && st.arrive;
      const out = { vid: v.id, name: v.name, rock: own && own.rock ? own.rock : null, tree: own && own.tree ? own.tree : null };
      if (own && own.rock) {
        await warp(P, own.rock.x + 30, own.rock.y);
        const i0 = Object.assign({}, P.inv), n0 = P.notices.length;
        for (let k = 0; k < 2; k++) { send(P, { type: 'gather' }); await sleep(1100); }
        const got = {}; for (const k of Object.keys(P.inv)) { const d = (P.inv[k] | 0) - (i0[k] | 0); if (d > 0) got[k] = d; }
        out.e = got; out.said = P.notices.slice(n0).slice(-2);
        out.rockD = arr ? Math.round(Math.hypot(own.rock.x - arr.x, own.rock.y - arr.y)) : null;
      }
      if (arr) {
        await warp(P, arr.centerX, arr.centerY);
        const bd = await ask(P, { type: 'village_board', vid: v.id }, 'village_board');
        const items = ((bd && bd.board && bd.board.rows) || []).map((r) => r.item);
        out.board = items; out.newbie = items.filter((x) => NEWBIE.has(x));
      }
      out.t = +((Date.now() - t0) / 1000).toFixed(0);
      rows.push(out);
      console.log(`  ${v.name.padEnd(5)} 바위 곁 E ${JSON.stringify(out.e || null)} · 판 [${(out.board || []).join(',')}] 새 사람 ${(out.newbie || []).length}`);
    } catch (e) { rows.push({ vid: v.id, name: v.name, err: String(e && e.message || e) }); }
    if (P) { clearInterval(P.beat); try { P.ws.close(); } catch (e) {} }
    await sleep(300);
  }
  const peb = rows.filter((r) => r.e && r.e.pebble > 0).length, withRock = rows.filter((r) => r.rock).length;
  const nb0 = rows.filter((r) => r.board && r.newbie.length === 0).length;
  const sum = { villages: rows.length, knob: KN, rockPebble: `${peb}/${withRock}`, eKinds: rows.reduce((o, r) => { const k = r.e ? (Object.keys(r.e).join('+') || '없음') : '바위 없음'; o[k] = (o[k] || 0) + 1; return o; }, {}),
    newbieZero: nb0, emptyBoard: rows.filter((r) => r.board && r.board.length === 0).length, sec: Math.round((Date.now() - t0) / 1000) };
  console.log('합 ' + JSON.stringify(sum));
  fs.writeFileSync(OUT, JSON.stringify({ sum, rows }, null, 1));
  down(); process.exit(0);
})().catch((e) => { console.log('예외 ' + (e && e.stack || e)); down(); process.exit(1); });
