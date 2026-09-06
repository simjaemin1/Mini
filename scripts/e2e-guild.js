#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-guild.js — 길드 초대 · 승인제 · 마을 소개문 (T128) =============
//
// ★[재민 확정 2026-09-05 · T128] 대상: central `tribe_invites` 표 · `tribes.join_mode`·`intro` ·
//   `/초대` `/수락` `/길드` `/소개` · `startInfo.intro`.
//
// ★★브라우저를 안 띄우는 이유는 `e2e-friends`(T115) 머리말과 같다 — 재는 것이 그림이 아니라 **계약**이고,
//   길드는 **셋**이 필요하다(부르는 사람 · 불린 사람 · 남). 계약은 ws 로 재고, 화면 쪽은 소스로 못 박는다.
//
// 실행: node scripts/e2e-guild.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-gu-central-${process.pid}.db`, ZDB = `/tmp/e2e-gu-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 110)}\n`); });
  p.stderr.on('data', () => {});
  procs.push({ name, p });
  return p;
}
function shutdown() { for (const x of procs) { try { x.p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(500); }
  return false;
}
const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
const jpost = async (u, body) => {
  try {
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return null; }
};

function connect(username, password) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username, password, name: username, color: '#5a9ae0' });
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const C = { ws, username, pid: null, playerId: null, notices: [], kinds: [], closed: false };
    const to = setTimeout(() => reject(new Error(`${username} 접속 시간초과`)), 30000);
    ws.on('message', (raw) => {
      let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') { C.pid = m.pid; C.playerId = m.playerId; clearTimeout(to); resolve(C); }
      else if (m.type === 'notice') { C.notices.push(String(m.text || '')); C.kinds.push(String(m.kind || '')); }
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { C.closed = true; });
    C.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const say = (C, text) => { try { C.ws.send(JSON.stringify({ type: 'chat', text })); } catch (e) {} };
const close = (C) => { try { clearInterval(C.beat); C.ws.close(); } catch (e) {} };
const last = (C) => JSON.stringify(C.notices.slice(-1));

(async () => {
  console.log('\n=== 길드 초대 · 승인제 · 마을 소개문 (T128) ===\n');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '2000',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), '⓪ central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), '⓪ zone 기동');
  for (let i = 0; i < 60; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages.length) break; await sleep(1000); }

  const L = await connect('leader', 'pw1');     // 길드장
  const M = await connect('member', 'pw2');     // 불릴 사람
  const O = await connect('outsider', 'pw3');   // 남
  ok(!!(L.playerId && M.playerId && O.playerId), '⓪ 셋이 다른 신원으로 들어왔다', `${L.playerId}/${M.playerId}/${O.playerId}`);
  const CEN = `http://localhost:${CPORT}`;
  const cr = await jpost(`${CEN}/tribe/create`, { player_id: L.playerId, name: '돌칼' });
  ok(!!(cr && cr.ok && cr.tribe_id), '⓪ 길드를 하나 세웠다(종전 경로 그대로)', JSON.stringify(cr));
  const TID = cr.tribe_id;
  //   ★대조용 열린 길드는 **네 번째 사람**이 세워서 지킨다 — 길드장이 나가고 아무도 안 남으면
  //     그 길드는 **해체된다**(종전 규약 · `/tribe/leave`). 초안은 남이 세우고 바로 나갔다가
  //     "길드 없음"을 받았다(하네스 ②b 가 잡았다).
  const K = await connect('keeper', 'pw4');
  const cr2 = await jpost(`${CEN}/tribe/create`, { player_id: K.playerId, name: '열린뜰' });
  ok(!!(cr2 && cr2.ok), '⓪ 대조용 **열린 길드**도 하나 세웠다(길드장이 남아 지킨다)', JSON.stringify(cr2 && cr2.tribe_id));
  const OPEN_TID = cr2.tribe_id;

  // ── ① 초대 → 알림 → 수락 → 가입 ─────────────────────────────────────────
  L.notices.length = 0; M.notices.length = 0; M.kinds.length = 0;
  say(L, '/초대 member'); await sleep(1500);
  ok(L.notices.some((t) => /불렀다/.test(t)), '① 부른 쪽이 그 사실을 듣는다', last(L));
  ok(M.notices.some((t) => /부른다/.test(t)), '① ★불린 쪽에게 **알림이 간다**', last(M));
  ok(M.kinds.includes('guild'), '①b ★그 알림의 종류가 `guild` 다(새 종류 하나 · 그림은 이미 있던 것)', JSON.stringify(M.kinds.slice(-2)));
  const beforeJoin = await jget(`${CEN}/player/${encodeURIComponent(M.playerId)}`);
  ok(!!beforeJoin && !beforeJoin.player.tribe_id, '①c 전제 — 아직 길드에 안 들어 있다(아래가 자명 통과가 아니다)');
  M.notices.length = 0;
  say(M, '/수락'); await sleep(2000);
  ok(M.notices.some((t) => /에 들었다/.test(t)), '① ★`/수락` 한 마디로 든다', last(M));
  const afterJoin = await jget(`${CEN}/player/${encodeURIComponent(M.playerId)}`);
  ok(!!afterJoin && afterJoin.player.tribe_id === TID, '①d 가입의 정본(`players.tribe_id`)이 실제로 바뀌었다', afterJoin && afterJoin.player.tribe_id);
  const invLeft = await jpost(`${CEN}/tribe/invites`, { player_id: M.playerId });
  ok(!!invLeft && invLeft.invites.length === 0, '①e ★들어갔으면 **문을 치운다** — 부름 행이 안 남는다', JSON.stringify(invLeft && invLeft.invites));
  // ★자명 통과 금지 — 부름이 없는 사람은 `/수락` 해도 못 든다
  O.notices.length = 0; say(O, '/수락'); await sleep(1200);
  ok(O.notices.some((t) => /부른 길드가 없다/.test(t)), '①f ★★부름이 없으면 `/수락` 은 아무것도 안 한다', last(O));

  // ── ② 승인제 — 초대 없이는 못 든다(대조: 열린 길드는 된다) ──────────────
  L.notices.length = 0;
  say(L, '/길드 초대제'); await sleep(1500);
  ok(L.notices.some((t) => /부름을 받아야/.test(t)), '② 길드장이 문을 걸었다', last(L));
  const joinClosed = await jpost(`${CEN}/tribe/join`, { player_id: O.playerId, tribe_id: TID });
  ok(!!joinClosed && joinClosed.ok === false && joinClosed.reason === 'invite_only',
    '② ★초대제 길드에는 **부름 없이 못 든다**', JSON.stringify(joinClosed));
  const joinOpen = await jpost(`${CEN}/tribe/join`, { player_id: O.playerId, tribe_id: OPEN_TID });
  ok(!!joinOpen && joinOpen.ok, '②b ★★대조 — **열린 길드는 종전 그대로** 든다(승격이 아무것도 안 깼다)', JSON.stringify(joinOpen));
  await jpost(`${CEN}/tribe/leave`, { player_id: O.playerId });
  // ★부름을 주면 그 잠긴 문도 열린다
  say(L, '/초대 outsider'); await sleep(1500);
  const joinInvited = await jpost(`${CEN}/tribe/join`, { player_id: O.playerId, tribe_id: TID });
  ok(!!joinInvited && joinInvited.ok, '②c 부름을 받은 사람은 잠긴 문도 지난다', JSON.stringify(joinInvited && joinInvited.ok));
  await jpost(`${CEN}/tribe/leave`, { player_id: O.playerId });
  // ★길드장만 문을 건다
  M.notices.length = 0; say(M, '/길드 공개'); await sleep(1200);
  ok(M.notices.some((t) => /길드장만/.test(t)), '②d ★길드원이라도 **길드장이 아니면** 문을 못 건다', last(M));

  // ── ③ 마을 소개문 ───────────────────────────────────────────────────────
  L.notices.length = 0;
  say(L, '/소개 돌칼 사람들은 강가에 산다'); await sleep(1500);
  ok(L.notices.some((t) => /소개를 적었다/.test(t)), '③ 길드장이 소개를 적었다', last(L));
  const intros = await jget(`${CEN}/tribe_intros`);
  ok(!!intros && intros.intros.some((r) => r.id === TID && /강가에 산다/.test(r.intro)),
    '③b ★central 에 남는다', JSON.stringify(intros && intros.intros));
  let gd = null;
  for (let i = 0; i < 10; i++) { gd = await jget(`http://localhost:${ZPORT}/guilddbg?warm=1`); if (gd && gd.intros && gd.intros.length) break; await sleep(700); }
  ok(!!(gd && gd.intros && gd.intros.some((e) => e[0] === TID)), '③c ★존의 소개문 캐시가 그걸 집는다(요청 경로에서 안 기다린다)', JSON.stringify(gd && gd.intros));
  // ★길이 상한은 **한 자리**다
  say(L, '/소개 ' + '가'.repeat(120)); await sleep(1500);
  const intros2 = await jget(`${CEN}/tribe_intros`);
  const row2 = intros2 && intros2.intros.find((r) => r.id === TID);
  ok(!!row2 && row2.intro.length === 60, '③d ★길이 상한이 **서버 한 자리**에서 걸린다(60자)', row2 && row2.intro.length);
  M.notices.length = 0; say(M, '/소개 나도 쓴다'); await sleep(1200);
  ok(M.notices.some((t) => /길드장만/.test(t)), '③e ★길드원이라도 소개는 못 쓴다');
  // ★시작 화면 줄에 칸이 있다(NPC 마을은 빈 문자열 — 세운 길드가 없다)
  const si = await jget(`http://localhost:${ZPORT}/startinfo`);
  ok(!!si && si.ok && si.villages.every((v) => typeof v.intro === 'string'),
    '③f 시작 화면의 **모든 줄에 소개 칸**이 있다(있으면 문장 · 없으면 빈 칸)');
  ok(!!si && si.villages.every((v) => v.player || v.intro === ''),
    '③g ★NPC 마을엔 소개가 안 붙는다 — 세운 길드가 없다');

  // ── ④ central 이 죽어도 세계는 안 멎는다 ────────────────────────────────
  for (const x of procs) if (x.name === 'central') { try { x.p.kill('SIGKILL'); } catch (e) {} }
  await sleep(1500);
  L.notices.length = 0; say(L, '/초대 member'); await sleep(7000);
  ok(!L.closed, '④ ★central 이 죽어도 **놀던 사람은 안 끊긴다**');
  ok(L.notices.some((t) => /못 불렀다/.test(t)), '④b ★조용히 실패하지 않는다 — 말로 알려 준다', last(L));
  const siDown = await jget(`http://localhost:${ZPORT}/startinfo`);
  ok(!!(siDown && siDown.ok), '④c 시작 화면은 그대로 뜬다');

  // ── ⑤ 소스 — 표 하나·컬럼 둘 · 사람이 쓴 문장은 그리는 쪽이 막는다 ──────
  {
    const cen = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    const lob = fs.readFileSync(path.join(ROOT, 'public', 'client', '70-lobby.js'), 'utf8');
    const nt = fs.readFileSync(path.join(ROOT, 'server', 'notice.js'), 'utf8');
    const codeOnly = (x) => x.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    ok((cen.match(/CREATE TABLE IF NOT EXISTS tribe_invites/g) || []).length === 1, '⑤ central 에 새 표는 **하나**다');
    //   ⚠`codeOnly` 를 안 쓴다 — 블록 주석 지우개가 문자열 안의 `/*` 를 만나면 그 뒤를 통째로 먹는다
    //     (초안이 그래서 0건을 봤다). 여기서 세는 것은 **SQL 문**이라 원문 그대로가 맞다.
    const added = (cen.match(/ALTER TABLE tribes ADD COLUMN (\w+)/g) || []).map((x) => x.split(' ').pop());
    ok(added.includes('join_mode') && added.includes('intro'), '⑤b 새 컬럼 **둘**이 있다', added.join(' '));
    ok(added.length === 7, '⑤b2 ★`tribes` 의 컬럼 증설은 **일곱**이다(종전 다섯 + 이 카드 둘) — 하나 더 늘면 여기가 빨개진다', added.length);
    ok(/onbEsc\(v\.intro\)/.test(lob), '⑤c ★사람이 쓴 문장은 **그리는 쪽이 막는다**(꺾쇠 이스케이프)');
    ok(!/slice\(0, ?60\)|substring\(0, ?60\)/.test(codeOnly(lob)), '⑤d ★길이 상한을 로비가 **다시 자르지 않는다**(사본 0)');
    ok(/'guild'/.test(codeOnly(nt)) && (codeOnly(nt).match(/KINDS = \[/g) || []).length === 1, '⑤e 알림 종류 표는 **하나**이고 거기에 `guild` 가 있다');
    ok(cen.length > 1000 && lob.length > 1000 && nt.length > 500, '⑤f (자명 통과 방지) 세 파일을 실제로 읽었다');
  }

  close(L); close(M); close(O); close(K);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
