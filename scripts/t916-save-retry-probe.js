#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T916 ② 탐침 · central + 존 둘 실서버 · T894 탐침 꼴)
// === scripts/t916-save-retry-probe.js — central 이 내려간 동안의 저장이 **다시 닿나** · 옛 저장이 새 몸을 **안 덮나** ====================
//
// 왜(T916 · T894 회부 1): central 이 내려가 있는 동안 로그아웃하면 마지막 저장 뒤 산 몸의 칸이 영구로 사라졌다(T894 2/2) — 존이 저장 실패를 다시 보내지 않았다.
//   T916 은 못 닿은 저장을 존 로컬 줄에 남기고 central 이 돌아오면 다시 보낸다(조건부 쓰기 — central 몸 칸이 그 사이 바뀌었으면 안 쓴다).
//
// 판마다 새 게스트 하나(T894 픽스처 그대로 — 지급 · 장착 · 저장 안 하는 산 몸 값) 뒤, central 을 내리고 산 몸을 **한 번 더** 바꾼다(숙련 9 · 추위 0.7):
//   down_logout        central 내림 → 바꿈 → 로그아웃 → central 올림 → 같은 존에 다시 접속(복원 전 줄 보내기)
//   down_periodic      central 내림 → 바꿈 → 로그아웃 → central 올림 → 다시 접속 없이 주기 간격(`SAVE_INTERVAL_MS` + 여유)만 기다려 central 행을 본다
//   down_zone_restart  central 내림 → 바꿈 → 로그아웃 → **존 재기동(central 내린 채)** → central 올림 → 다시 접속(줄이 재기동을 넘었나)
//   down_shutdown      central 내림 → 바꿈 → **붙은 채 존 SIGTERM**(종료 flush) → 존 다시 띄움 → central 올림 → 다시 접속
//   cross_zone         central 내림 → 바꿈 → 로그아웃 → central 올림 → **다른 존(nippon)에 먼저 접속** · 거기서 저장하는 지급 → 끊음 → 첫 존이 줄을 보낸다
//                      ⇒ 옛 줄이 새 몸(nippon 의 저장)을 덮지 않았나(central 행 = nippon 마지막 저장)
//   `--off` = `T916_SAVE_RETRY=0`(종전) 대조.
//
// 쓰는 법: node scripts/t916-save-retry-probe.js [판=2] [길,길,...] [--off]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021;
const DDIR = '/tmp/t916-probe' + (process.argv.includes('--off') ? '-off' : '');
const N = +(process.argv[2] || 2);
const ALL = ['down_logout', 'down_periodic', 'down_zone_restart', 'down_shutdown', 'cross_zone'];
const PATHS = process.argv[3] ? process.argv[3].split(',') : ALL;
const OFF = process.argv.includes('--off');   // 대조 — `T916_SAVE_RETRY=0`(종전 바이트)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let C = null, Z = null, Z2 = null, nLog = 0;
function boot(file, env, tag) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${tag}-${++nLog}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  return p;
}
process.on('exit', () => { for (const p of [C, Z, Z2]) { try { if (p) p.kill('SIGKILL'); } catch (e) {} } });
const CENV = { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' };
const ZENV = { PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1', CENTRAL_URL: `http://localhost:${CPORT}`,
  ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
if (OFF) ZENV.T916_SAVE_RETRY = '0';
const Z2ENV = Object.assign({}, ZENV, { PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db` });
async function upC() { C = boot('central.js', CENV, 'central'); if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패'); }
async function upZ() { Z = boot('zone.js', ZENV, 'zone'); if (!(await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) throw new Error('zone 기동 실패'); }
async function upZ2() { Z2 = boot('zone.js', Z2ENV, 'zone2'); if (!(await FB.waitUp(Z2, /zone server up on/, { name: 'zone2', capMs: 300000 })).ok) throw new Error('zone2 기동 실패'); }
const downP = (p, sig) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', () => r()); try { p.kill(sig); } catch (e) { r(); } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
function open(qs, port) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${port || HPORT}/?${qs}`); const st = { ws, welcome: null, kicked: false, down: null, notices: [] };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; clearTimeout(t); res(st); }
      if (m.type === 'kicked') st.kicked = true;
      if (m.type === 'notice') st.notices.push(m.text); });
    st.hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 3000);
  });
}
const close = (st) => new Promise((r) => { if (!st) return r(); clearInterval(st.hb); if (st.ws.readyState === 3) return r(); st.ws.once('close', r); try { st.ws.close(); } catch (e) { r(); } setTimeout(r, 2000); });
const bodyOf = async (name, port) => { const o = await jget(`http://localhost:${port || HPORT}/bodydbg?name=${encodeURIComponent(name)}`); return (o.bodies || {})[name] || null; };
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowBody = (row) => { try { return JSON.parse((row && row.tools_json) || 'null'); } catch (e) { return null; } };
// 행의 짐 = 컬럼(wood · stone) + inventory_json · 허기 · 갈증 컬럼 — 존이 쓰는 `_savePatch` 꼴 그대로 되읽는다
const rowInv = (row) => { if (!row) return null; let x = {}; try { x = JSON.parse(row.inventory_json || '{}'); } catch (e) {} return Object.assign({ wood: row.wood | 0, stone: row.stone | 0 }, x); };

// ⓑ 산 몸에만 세울 값(저장 안 함) — 빈 칸이 아닌 값이어야 "같다"가 자명하지 않다(T890 과 같은 값)
const LIVE = { craftSkill: { toolmaking: 7, mining: 3 }, craftLog: { carrier: { n: 1, q: 5 } }, oreLedger: { iron: 1.25 }, oreCarry: { iron: 0.05 },
  fishStats: { caught: 4, maxKg: 2.0, lostMaxKg: 1.5 }, member: { zone: 'hanbando', vid: 7, name: '검사마을', since: 33, wdDay: 33, wdUsed: 2 } };
const SOFT = { cold: 0.8, fatigue: 0.6, injury: 0.4, morale: 0.3 };
const HP = 42, HUNGER = 37, THIRST = 41;
const LEDGER = ['craftSkill', 'craftLog', 'oreLedger', 'oreCarry', 'fishStats', 'member'];
const DUR = ['tools', 'equipped', 'hotkey1', 'equipment', 'equipSlots', 'kgLedger', 'lots', 'inventory'];
const J = (x) => JSON.stringify(x === undefined ? null : x);
const TOL = 0.05;   // 몇 초 사이 틱이 신체 칸(0~1)을 움직이는 몫 — T890 · `test-handoff-body` softNear 와 같은 뜻
const softOf = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0), morale: +(b.body.morale || 0) } : null;
const softNear = (x, y) => !!x && !!y && ['cold', 'fatigue', 'injury', 'morale'].every((k) => Math.abs(x[k] - y[k]) <= TOL);
// 내구 칸 견줄 꼴 — 도구는 id 를 뺀 종류 · 내구(재발급 id 는 다른 칸이다 — 장착 · 1번 슬롯이 id 로 가리키므로 그 둘은 id 그대로 견준다)
const lotsDur = (L) => J(L == null ? null : Object.fromEntries(Object.entries(L).map(([k, a]) => [k, (Array.isArray(a) ? a : []).map((r) => (r && typeof r === 'object') ? { d: r.d, k: r.k, n: r.n, m: r.m, w: r.w } : r)])));
function durOf(b, inv) {
  return {
    tools: J((b.toolItems || []).map((t) => [t.id, t.type, t.d]).sort()), equipped: J(b.equipped), hotkey1: J(b.hotkey1),
    equipment: J(b.equipment), equipSlots: J(b.equipSlots), kgLedger: J(b.kgLedger), lots: lotsDur(b.lots), inventory: J(inv || null),
  };
}

let K = 0;
async function fixture(qs) {
  const a = await open(qs);
  const pid = a.welcome.playerId, tok = a.welcome.guestToken || null;
  const name = ((await rowOf(pid)) || {}).name;   // 존의 사람 이름 = central 행 이름(T208 — 게스트도 central 이 지은 이름)
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3, wood: 5 }, tools: ['axe', 'pickaxe'], equip: [{ type: 'carrier', lvl: 5 }],
    kgs: { fish: [1.7, 0.4] }, lots: { berry: [[2, 3], [0, 2]] }, quiet: true }));
  await sleep(900);
  let B = await bodyOf(name);
  const axe = (B.toolItems || []).find((t) => t.type === 'axe'), pk = (B.toolItems || []).find((t) => t.type === 'pickaxe');
  if (axe) a.ws.send(JSON.stringify({ type: 'equip', toolItemId: axe.id }));
  if (pk) a.ws.send(JSON.stringify({ type: 'set_hotkey', toolItemId: pk.id }));
  await sleep(700);
  a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', hp: HP, hunger: HUNGER, thirst: THIRST, quiet: true }, SOFT, LIVE)));
  await sleep(700);
  const live = await bodyOf(name);
  const liveInvRow = rowInv(await rowOf(pid));   // 짐은 ⓐ 지급이 저장했다 — 산 짐 = 행 짐(아래 · 산 짐은 `/bodydbg` 에 없다)
  const row0 = await rowOf(pid);
  const rb0 = rowBody(row0);
  const pre = {   // 상황 선행 — 행이 ⓑ 값을 아직 안 가졌다
    ledgerStale: LEDGER.filter((f) => J((rb0 || {})[f]) !== J(live[f])).length === LEDGER.length,
    softStale: !softNear(softOf(rb0), softOf(live)), hpStale: !(rb0 && rb0.vital && rb0.vital.hp === live.vital.hp),
    hungerStale: !(row0 && Math.abs(row0.hunger - HUNGER) <= 2),
  };
  return { a, pid, tok, name, live, liveInv: liveInvRow, pre, row0 };
}
function compare(live, liveInv, after, afterInv, row, rowB) {
  const D0 = durOf(live, liveInv), D1 = durOf(after || {}, afterInv);
  const out = { dur: {}, ledger: {}, soft: null, hp: null, hunger: null, thirst: null, rowLedger: {}, rowSoft: null };
  for (const k of DUR) out.dur[k] = D0[k] === D1[k];
  for (const k of LEDGER) { out.ledger[k] = J((after || {})[k]) === J(live[k]); out.rowLedger[k] = J((rowB || {})[k]) === J(live[k]); }
  out.softV = softOf(after); out.soft = softNear(softOf(after), softOf(live)); out.rowSoft = softNear(softOf(rowB), softOf(live));
  out.hpV = after && after.vital ? after.vital.hp : null; out.downV = after && after.vital ? !!after.vital.isDown : null;
  out.hungerV = row ? row.hunger : null; out.thirstV = row ? row.thirst : null;
  return out;
}


async function relogin(cred, name, port) {
  const qs = `username=&name=${encodeURIComponent(name)}&color=%23ffffff&guest_token=${encodeURIComponent(cred.tok)}`;
  const b = await open(qs, port); await sleep(1200);
  const after = await bodyOf(name, port);
  return { b, after };
}
const LIVE2 = { craftSkill: { toolmaking: 9, mining: 4 }, cold: 0.7 };
const qOf = () => { try { const D = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`, { readOnly: true }); const n = D.prepare('SELECT COUNT(*) AS n FROM save_queue').get().n; D.close(); return n; } catch (e) { return null; } };
const waitMs = (+(process.env.SAVE_INTERVAL_MS || 30000)) + 5000;

async function trip(P) {
  const k = ++K;
  const nm = `t916g${k}`;
  const qs = `username=&name=${nm}&color=%23ffffff`;
  const F = await fixture(qs); const name = F.name;
  await downP(C, 'SIGTERM'); C = null; await sleep(500);
  F.a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', quiet: true }, LIVE2)));
  await sleep(700);
  const live2 = await bodyOf(name);
  const ex = { want: { craftSkill: live2.craftSkill, cold: softOf(live2).cold } };
  let b = null, after = null;
  if (P === 'down_shutdown') {
    await downP(Z, 'SIGTERM'); Z = null; await close(F.a); await sleep(800);
    ex.qAfterDown = qOf();
    await upZ(); await sleep(500); await upC(); await sleep(800);
    ({ b, after } = await relogin({ tok: F.tok }, name));
  } else {
    await close(F.a); await sleep(1500);
    ex.qAfterLogout = qOf();
    if (P === 'down_zone_restart') { await downP(Z, 'SIGTERM'); Z = null; await sleep(800); ex.qAfterZoneDown = qOf(); await upZ(); await sleep(500); }
    await upC(); await sleep(800);
    if (P === 'down_periodic') {
      await sleep(waitMs); ex.qAfterWait = qOf();
      const row = await rowOf(F.pid); const rb = rowBody(row);
      ex.perRowLedger = J(rb && rb.craftSkill) === J(live2.craftSkill); ex.perRowSoft = softNear(softOf(rb), softOf(live2));
      ({ b, after } = await relogin({ tok: F.tok }, name));
    } else if (P === 'cross_zone') {
      // 첫 존(hanbando)이 줄을 보내기 전에 nippon 에 먼저 접속한다(주기 간격 안 · 첫 존엔 사람 0 이라 닿는 저장도 없다)
      const n = await open(`username=&name=${encodeURIComponent(name)}&color=%23ffffff&guest_token=${encodeURIComponent(F.tok)}`, NPORT); await sleep(1200);
      const nb0 = await bodyOf(name, NPORT);
      ex.nipSawOld = J(nb0 && nb0.craftSkill) !== J(live2.craftSkill);   // 상황 선행 — nippon 은 첫 존의 마지막 몸을 못 봤다(줄이 아직 첫 존에)
      n.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 1 }, quiet: true })); await sleep(900);   // 저장하는 지급 — nippon 이 새 몸을 행에 쓴다
      const nb = await bodyOf(name, NPORT);
      await close(n); await sleep(1500);
      const rowN = await rowOf(F.pid);
      // 첫 존이 줄을 보내게 한다 — 다른 게스트 하나가 첫 존에 붙으면 그 접속 저장이 닿고, 닿은 저장이 남은 줄을 바로 보낸다(T916 ②)
      const d = await open(`username=&name=t916d${k}&color=%23ffffff`); await sleep(2500); await close(d); await sleep(800);
      ex.qAfterTrigger = qOf();
      const row = await rowOf(F.pid);
      ex.rowKeptNip = !!rowN && !!row && row.tools_json === rowN.tools_json && row.inventory_json === rowN.inventory_json;   // 옛 줄이 nippon 저장을 안 덮었다
      ex.rowHasOld = J((rowBody(row) || {}).craftSkill) === J(live2.craftSkill);
      ex.nipCraft = nb && nb.craftSkill;
      return Object.assign({ P, k, pre: F.pre }, ex);
    } else {
      ({ b, after } = await relogin({ tok: F.tok }, name));
    }
  }
  const row = await rowOf(F.pid);
  const r = compare(live2, F.liveInv, after, rowInv(row), row, rowBody(row));
  ex.qEnd = qOf();
  await close(b); await sleep(800);
  return Object.assign({ P, k, pre: F.pre, samePid: b.welcome.playerId === F.pid }, ex, r);
}

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  await upC(); await upZ(); if (PATHS.includes('cross_zone')) await upZ2();
  console.log(`[T916 탐침] 판 ${N} · 길 ${PATHS.join(',')} · ${OFF ? '끔(T916_SAVE_RETRY=0)' : '켬(기본)'}`);
  const R = [];
  for (const P of PATHS) for (let i = 0; i < N; i++) {
    let r; try { r = await trip(P); } catch (e) { r = { P, err: e.message }; if (!C) await upC().catch(() => {}); if (!Z) await upZ().catch(() => {}); }
    R.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${DDIR}/result${OFF ? '-off' : ''}.json`, JSON.stringify(R, null, 1));
  console.log('\n[T916 표] 길 | 판 | 숙련(몸) | 신체(몸) | 행 숙련 · 신체 | 줄(로그아웃 뒤 → 끝) | 다른 존 먼저 — 행 = nippon 저장 · 옛 줄 안 씀');
  for (const P of PATHS) {
    const rs = R.filter((r) => r.P === P && !r.err);
    const c = (f) => `${rs.filter(f).length}/${rs.length}`;
    if (P === 'cross_zone') { console.log(`[T916 표] ${P} | ${rs.length} | — | — | — | ${rs.map((r) => r.qAfterLogout + '→' + r.qAfterTrigger).join(' ')} | 선행 ${c((r) => r.nipSawOld)} · 행 = nippon ${c((r) => r.rowKeptNip && !r.rowHasOld)}`); continue; }
    console.log(`[T916 표] ${P} | ${rs.length} | ${c((r) => r.ledger.craftSkill)} | ${c((r) => r.soft)} | ${c((r) => r.rowLedger.craftSkill && r.rowSoft)} | ${rs.map((r) => (r.qAfterLogout ?? r.qAfterDown) + '→' + r.qEnd).join(' ')}` + (P === 'down_periodic' ? ` | 주기만으로 행 ${c((r) => r.perRowLedger && r.perRowSoft)}` : '') + (R.some((r) => r.P === P && r.err) ? ` | 오류 ${R.filter((r) => r.P === P && r.err).map((r) => r.err).join(';')}` : ''));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
