#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T894 ② 탐침 · 한 존 실서버 + central)
// === scripts/t894-body-paths-probe.js — 몸 칸이 **사라지는 다른 길** 전수 탐침(길 × 칸) =====================================
//
// 왜(T894): 이틀 새 몸 영구 소실 결함 둘 — T868(승격) · T890(같은 존 승계). 둘 다 "몸 칸 목록이 길마다 따로"였다(T873 이 사람에 얹는 쪽을 하나로).
//   남은 길에서도 칸이 새는지, 칸마다 값을 앉혀(픽스처) 길을 지난 뒤 같은지 잰다(T866 · T868 · T890 탐침 꼴).
//
// 판마다 새 사람 하나:
//   ⓐ 붙는다 → `__e2e_give`(도구 · 장비 착용 · 짐 · kg 개체 · 로트 — 지급은 **저장한다** = 행) → `equip` · `set_hotkey`(저장한다)
//   ⓑ `__e2e_body`(저장 안 함 — 족보 ㊻)로 **산 몸만** 바꾼다: 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · 소속 · 신체 넷 · HP · 허기 · 갈증
//      ★상황 선행: 행이 ⓑ 값을 **아직 안 가졌다**(가졌으면 그 판은 ⓑ 칸을 재지 않는다 — 따로 센다)
//   ⓒ 길을 지난다(아래 PATHS) → 다시 붙어 `/bodydbg` 의 몸을 ⓑ 직후 산 몸과 칸마다 견준다 · 행도 읽는다
//
// 칸 셋으로 가른다(`test-handoff-body` 의 두 잣대 + 행 칸):
//   내구(비트 같음): 도구(종류 · 내구) · 장착 · 1번 슬롯 · 장비 · 슬롯 · 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · kg원장 · 로트(d·k·n·m·w) · 소속 · 짐(인벤)
//   연속(이어졌나): 신체 넷(±TOL · 0/행 값으로 되돌지 않았나) · HP(행 값 100 으로 안 돌아가고 산 값 근처) · 허기 · 갈증(±2 — 정수 저장)
//
// 길(PATHS — 존 하나로 재는 것):
//   logout_guest   로그아웃(소켓 닫힘) → 게스트 토큰으로 다시 붙음
//   logout_acct    로그아웃 → 등록 계정(이름 · 비밀번호)으로 다시 로그인
//   takeover       같은 존 산 몸 승계(옛 소켓을 연 채 같은 토큰으로 새 소켓 — T890 길)
//   death          죽음(허기 · 갈증 0 · HP 2 → 쓰러짐 → `respawn_choice` → 야생 사망 → 깨어남) — T8 캐논: 짐 일부 낙하 · 후유증은 바뀌는 칸
//   zone_sigterm   존 SIGTERM(종료 flush) → 다시 띄움 → 다시 붙음
//   zone_sigkill   존 SIGKILL → 다시 띄움 → 다시 붙음(마지막 저장 뒤 손실 창 — 주기 저장 `SAVE_INTERVAL_MS` 그대로)
//   central_mid    붙은 채 central 재기동(SIGTERM → 다시 띄움) → 로그아웃 → 다시 붙음
//   central_down   central 이 내려간 동안 ⓑ → 로그아웃 → central 다시 띄움 → 다시 붙음
// (존을 넘는 길 — 핸드오프 토큰 · 승격 · 넘기기 실패 되돌림 — 은 `test-handoff-body` · `t868-promote-body-probe` 가 잰다 · 보고 §2)
//
// 쓰는 법: node scripts/t894-body-paths-probe.js [판=2] [길,길,...]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020;
const DDIR = '/tmp/t894-probe';
const N = +(process.argv[2] || 2);
const ALL = ['logout_guest', 'logout_acct', 'takeover', 'death', 'zone_sigterm', 'zone_sigkill', 'central_mid', 'central_down'];
const PATHS = process.argv[3] ? process.argv[3].split(',') : ALL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let C = null, Z = null, nLog = 0;
function boot(file, env, tag) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${tag}-${++nLog}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  return p;
}
process.on('exit', () => { for (const p of [C, Z]) { try { if (p) p.kill('SIGKILL'); } catch (e) {} } });
const CENV = { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' };
const ZENV = { PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1', CENTRAL_URL: `http://localhost:${CPORT}`,
  ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', DOWN_WAKE_GAMEMIN: '20' };   // 깨어남 기본값을 줄인다(e2e-respawn-choice 와 같은 손잡이 · 같은 값)
// ★존 → central 한 다리만 늦춘다(선택 · `T894_DELAY=<한 방향 ms>` — T498 ③ 의 `t498-delay-proxy` 그대로 · T498 은 75ms = 왕복 150ms 를 썼다).
//   종료 flush(`_shutdownFlush`)가 fire-and-forget 뒤 200ms 에 내려가므로 central 이 먼 판에서 그 저장이 닿나를 잰다.
let PX = null;
if (process.env.T894_DELAY) {
  PX = spawn(process.execPath, [path.join(__dirname, 't498-delay-proxy.js'), '3910', String(CPORT), String(+process.env.T894_DELAY)], { stdio: 'ignore' });
  ZENV.CENTRAL_PORT = '3910';
  process.on('exit', () => { try { PX.kill('SIGKILL'); } catch (e) {} });
}
async function upC() { C = boot('central.js', CENV, 'central'); if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패'); }
async function upZ() { Z = boot('zone.js', ZENV, 'zone'); if (!(await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) throw new Error('zone 기동 실패'); }
const downP = (p, sig) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', () => r()); try { p.kill(sig); } catch (e) { r(); } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
function open(qs) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${HPORT}/?${qs}`); const st = { ws, welcome: null, kicked: false, down: null, notices: [] };
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
const bodyOf = async (name) => { const o = await jget(`http://localhost:${HPORT}/bodydbg?name=${encodeURIComponent(name)}`); return (o.bodies || {})[name] || null; };
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

async function relogin(kind, cred, name) {
  const qs = kind === 'acct' ? `username=${encodeURIComponent(cred.u)}&password=${encodeURIComponent(cred.p)}&color=%23ffffff`
                             : `username=&name=${encodeURIComponent(name)}&color=%23ffffff&guest_token=${encodeURIComponent(cred.tok)}`;
  const b = await open(qs); await sleep(1200);
  const after = await bodyOf(name);
  return { b, after };
}

async function trip(P) {
  const k = ++K;
  const acct = P === 'logout_acct';
  const cred = acct ? { u: `t894a${k}${Date.now() % 100000}`, p: 'pw894' } : null;
  const nm = acct ? cred.u : `t894g${k}`;
  const qs = acct ? `username=${cred.u}&password=${cred.p}&color=%23ffffff` : `username=&name=${nm}&color=%23ffffff`;
  if (P === 'central_down') {
    // ⓑ 를 central 이 없는 동안 한다 — 그 동안의 저장(닫힐 때)이 어디로 가나
    const F = await fixture(qs); const name = F.name;
    await downP(C, 'SIGTERM'); C = null; await sleep(500);
    F.a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', quiet: true }, { craftSkill: { toolmaking: 9, mining: 4 }, cold: 0.7 })));
    await sleep(700);
    const live2 = await bodyOf(name);
    await close(F.a); await sleep(1500);
    await upC(); await sleep(500);
    const { b, after } = await relogin('guest', { tok: F.tok }, name);
    const row = await rowOf(F.pid); const r = compare(live2, F.liveInv, after, rowInv(row), row, rowBody(row));
    await close(b); await sleep(800);
    return Object.assign({ P, k, pre: F.pre, samePid: b.welcome.playerId === F.pid }, r);
  }
  const F = await fixture(qs); const name = F.name;
  let b = null, after = null, extra = {};
  if (P === 'logout_guest' || P === 'logout_acct') {
    await close(F.a); await sleep(1500);
    ({ b, after } = await relogin(acct ? 'acct' : 'guest', acct ? cred : { tok: F.tok }, name));
  } else if (P === 'takeover') {
    ({ b, after } = await relogin('guest', { tok: F.tok }, name));
    extra.kicked = F.a.kicked; await close(F.a);
  } else if (P === 'death') {
    F.a.ws.send(JSON.stringify({ type: '__e2e_body', hunger: 0, thirst: 0, hp: 2, quiet: true }));
    const t0 = Date.now(); let B;
    while (Date.now() - t0 < 120000) { await sleep(1000); B = await bodyOf(name); if (B && B.vital && B.vital.isDown) break; }
    extra.wentDown = !!(B && B.vital && B.vital.isDown);
    F.a.ws.send(JSON.stringify({ type: 'respawn_choice' }));
    const t1 = Date.now();
    while (Date.now() - t1 < 900000) { await sleep(2000); B = await bodyOf(name); if (B && B.vital && !B.vital.isDown) break; }
    extra.woke = !!(B && B.vital && !B.vital.isDown); extra.wakeMs = Date.now() - t1;
    extra.died = F.a.notices.some((t) => /정신을 잃었습니다/.test(t));
    await sleep(1500);
    after = await bodyOf(name);
    await close(F.a); await sleep(1500);
    ({ b } = await relogin('guest', { tok: F.tok }, name)); extra.afterRelogin = await bodyOf(name);
  } else if (P === 'zone_sigterm' || P === 'zone_sigkill') {
    await downP(Z, P === 'zone_sigterm' ? 'SIGTERM' : 'SIGKILL'); Z = null; await close(F.a);
    await sleep(1500); await upZ();
    ({ b, after } = await relogin('guest', { tok: F.tok }, name));
  } else if (P === 'central_mid') {
    await downP(C, 'SIGTERM'); C = null; await sleep(1500); await upC(); await sleep(500);
    await close(F.a); await sleep(1500);
    ({ b, after } = await relogin('guest', { tok: F.tok }, name));
  }
  const row = await rowOf(F.pid);
  // 짐: 다시 붙은 뒤 행(접속 저장) — 산 짐을 볼 창이 없어 행으로 본다(접속이 행 짐을 그대로 몸에 싣는다)
  const r = compare(F.live, F.liveInv, after, rowInv(row), row, rowBody(row));
  if (extra.afterRelogin) extra.reloginSame = J(extra.afterRelogin && extra.afterRelogin.craftSkill) === J(after && after.craftSkill) && softNear(softOf(extra.afterRelogin), softOf(after));
  delete extra.afterRelogin;
  await close(b); await sleep(800);
  return Object.assign({ P, k, pre: F.pre, samePid: b.welcome.playerId === F.pid }, extra, r);
}

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  await upC(); await upZ();
  console.log(`[T894 탐침] 판 ${N} · 길 ${PATHS.join(',')}`);
  const R = [];
  for (const P of PATHS) for (let i = 0; i < N; i++) {
    let r; try { r = await trip(P); } catch (e) { r = { P, err: e.message }; if (!C) await upC().catch(() => {}); if (!Z) await upZ().catch(() => {}); }
    R.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${DDIR}/result.json`, JSON.stringify(R, null, 1));
  // 길 × 칸 표
  const cols = [...DUR, ...LEDGER, 'soft', 'hp', 'hunger', 'row'];
  console.log('\n[T894 표] 길 | 판(재는 판) | ' + cols.join(' | '));
  for (const P of PATHS) {
    const rs = R.filter((r) => r.P === P && !r.err), M = rs.filter((r) => r.pre && r.pre.ledgerStale && r.pre.softStale && r.pre.hpStale);
    const cell = (f) => `${M.filter(f).length}/${M.length}`;
    const row = [
      ...DUR.map((k) => cell((r) => r.dur[k])), ...LEDGER.map((k) => cell((r) => r.ledger[k])),
      cell((r) => r.soft), `${M.map((r) => r.hpV).join('/')}`, `${M.map((r) => r.hungerV + '·' + r.thirstV).join('/')}`,
      cell((r) => LEDGER.every((k) => r.rowLedger[k]) && r.rowSoft),
    ];
    console.log(`[T894 표] ${P} | ${rs.length}(${M.length}) | ${row.join(' | ')}` + (R.some((r) => r.P === P && r.err) ? ` | 오류 ${R.filter((r) => r.P === P && r.err).map((r) => r.err).join(';')}` : ''));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
