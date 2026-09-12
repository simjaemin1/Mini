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
      //   ★[T174] 짐 — **떠내려가지 않는 자리**다. 곳간은 주민이 먹어 스스로 줄지만 짐은 안 그렇다.
      else if (m.type === 'inventory' && m.inventory) C.inv = m.inventory;
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { C.closed = true; });
    C.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
// ── ★[T211] 게스트 손님 — 이름·비밀번호가 아니라 **토큰**으로 붙는다(클라가 하는 그대로) ──
//   ⚠`username` 을 안 보낸다. 그게 게스트의 정의다(`myUsername = inputName; // 빈 문자열이면 게스트`).
function connectGuest(token) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ name: '여행자', color: '#5a9ae0' });
    if (token) q.set('guest_token', token);
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const C = { ws, username: null, pid: null, playerId: null, notices: [], kinds: [], closed: false };
    const to = setTimeout(() => reject(new Error('게스트 접속 시간초과')), 30000);
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
    E2E_GIVE: '1',        // ★[T159] `__e2e_body` 로 소속을 앉힌다(T11 이 낸 검사 전용 손잡이)
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

  // ── ④ [T139] 부름 알림함 — 접속 중이 아니어도 부름은 남는다 ─────────────
  //   ★이 절이 재는 것: **끊겨 있던 사이에 온 부름이 다음 접속에 말이 되는가.**
  //     T128 까지는 `tellPlayer` 가 접속 중인 사람만 찾았고, 없으면 그 말은 허공으로 갔다.
  {
    const NMAX = require(path.join(ROOT, 'server', 'notice.js')).NOTICE_MAX;
    ok(Number.isInteger(NMAX) && NMAX >= 2, '④ 전제: 접는 수를 **정본에서 읽었다**(손으로 안 적는다)', NMAX);

    // ⓐ 길드 부름 — 받는 사람이 **꺼져 있는 동안** 부른다
    const I1 = await connect('inbox', 'pw5');           // 계정을 만들고
    await sleep(600); close(I1); await sleep(1200);      // 나간다
    L.notices.length = 0; say(L, '/초대 inbox'); await sleep(1500);
    ok(L.notices.some((t) => /불렀다/.test(t)), '④a 전제: 꺼져 있는 사람도 부를 수는 있다(central 이 행을 남긴다)', last(L));
    const inv0 = await jpost(`${CEN}/tribe/invites`, { player_id: I1.playerId });
    ok(!!inv0 && inv0.invites.length === 1, '④a2 전제: 부름 행이 실제로 남아 있다', JSON.stringify(inv0 && inv0.invites.map((x) => x.name)));

    // ⓑ 다시 들어오면 **그 말이 선다**
    const I2 = await connect('inbox', 'pw5');
    await sleep(2500);
    ok(I2.playerId === I1.playerId, '④b 전제: 같은 사람으로 다시 들어왔다', I2.playerId);
    ok(I2.notices.some((t) => /\[돌칼\] 이\(가\) 자네를 부른다/.test(t)),
       '★★④ 끊겨 있던 사이의 **길드 부름이 다음 접속에 말이 된다**', JSON.stringify(I2.notices));
    ok(I2.kinds.includes('guild'), '④b2 그 줄의 종류는 `guild` 다(T128 이 만든 그 종류 그대로 · 새 종류 0)', JSON.stringify(I2.kinds));
    //   ★자명 통과 금지 — 부름은 **읽기만** 했다. 그 자리에서 사라지지 않는다(수락이 지운다).
    const inv1 = await jpost(`${CEN}/tribe/invites`, { player_id: I2.playerId });
    ok(!!inv1 && inv1.invites.length === 1, '④b3 ★★세었다고 **부름이 지워지지 않는다** — 지우는 것은 수락뿐이다',
       JSON.stringify(inv1 && inv1.invites.map((x) => x.name)));

    // ⓒ 밀린 **친구 요청**도 같다 — 표만 다르고 자리가 같다
    const F1 = await connect('offfriend', 'pw6'); await sleep(600); close(F1); await sleep(1200);
    O.notices.length = 0; say(O, '/친구 offfriend'); await sleep(1500);
    ok(O.notices.some((t) => /청했다/.test(t)), '④c 전제: 꺼져 있는 사람에게도 청할 수 있다', last(O));
    const pend = await jpost(`${CEN}/friend/pending`, { player_id: F1.playerId });
    ok(!!(pend && pend.ok && pend.requests.length === 1 && pend.requests[0].name === 'outsider'),
       '④c2 ★밀린 요청을 세는 문이 **새 표 없이** 답한다(`since IS NULL` 술어 하나)', JSON.stringify(pend && pend.requests));
    const F2 = await connect('offfriend', 'pw6'); await sleep(2500);
    ok(F2.notices.some((t) => /outsider 이\(가\) 벗이 되자고 청했다/.test(t)),
       '★★④c 끊겨 있던 사이의 **친구 요청도 다음 접속에 말이 된다**', JSON.stringify(F2.notices));
    ok(F2.kinds.includes('info'), '④c3 그 줄의 종류는 `info` 다(친구는 종전 종류 그대로)', JSON.stringify(F2.kinds));
    close(F2);

    // ⓓ 둘이 부르면 **이름으로 고른다**(T128 회부 5)
    say(K, '/초대 inbox'); await sleep(1500);           // 열린뜰도 부른다
    const inv2 = await jpost(`${CEN}/tribe/invites`, { player_id: I2.playerId });
    ok(!!inv2 && inv2.invites.length === 2, '④d 전제: 두 길드가 같은 사람을 불렀다', JSON.stringify(inv2 && inv2.invites.map((x) => x.name)));
    I2.notices.length = 0; say(I2, '/수락 열린뜰'); await sleep(2000);
    ok(I2.notices.some((t) => /\[열린뜰\] 에 들었다/.test(t)), '★★④d `/수락 <이름>` 이 **부른 곳 중 하나를 고른다**', last(I2));
    const who = await jget(`${CEN}/player/${encodeURIComponent(I2.playerId)}`);
    ok(!!who && who.player.tribe_id === OPEN_TID, '④d2 고른 쪽으로 실제로 들었다(가장 최근이 아니다)', who && who.player.tribe_id);
    //   ★자명 통과 금지 — 안 부른 이름은 못 고른다
    const G1 = await connect('picker', 'pw7'); await sleep(600); close(G1); await sleep(800);
    say(L, '/초대 picker'); await sleep(1500);
    const G2 = await connect('picker', 'pw7'); await sleep(1500);
    G2.notices.length = 0; say(G2, '/수락 없는길드'); await sleep(1500);
    ok(G2.notices.some((t) => /부르지 않았다/.test(t)), '④d3 ★★안 부른 이름을 대면 **안 든다**(그리고 부른 곳을 알려 준다)', last(G2));
    const still = await jget(`${CEN}/player/${encodeURIComponent(G2.playerId)}`);
    ok(!!still && !still.player.tribe_id, '④d4 그때 소속은 **안 바뀐다**');
    close(G2);

    // ⓔ N 을 넘으면 **접는다** — 넘겨 보내면 오래된 줄이 소리 없이 밀려난다
    const H1 = await connect('manycall', 'pw8'); await sleep(600); close(H1); await sleep(1200);
    for (const [C0, nm] of [[L, 'leader'], [M, 'member'], [O, 'outsider'], [K, 'keeper']]) {
      say(C0, '/친구 manycall'); await sleep(900);
    }
    const pend4 = await jpost(`${CEN}/friend/pending`, { player_id: H1.playerId });
    ok(!!pend4 && pend4.requests.length === NMAX + 1, `④e 전제: 밀린 부름이 **N+1(${NMAX + 1})건**이다`, pend4 && pend4.requests.length);
    const H2 = await connect('manycall', 'pw8'); await sleep(2500);
    ok(H2.notices.length === NMAX, `★★④e 넘쳐도 **정확히 N(${NMAX})줄**만 온다 — 오래된 줄이 소리 없이 사라지지 않는다`,
       `${H2.notices.length}줄 ${JSON.stringify(H2.notices)}`);
    ok(H2.notices.some((t) => /외 2건의 부름이 더 있다/.test(t)), '★★④e2 그리고 **접힌 만큼을 말한다**("… 외 k건")', last(H2));
    close(H2);

    // ⓕ 부름이 없으면 **아무 말도 안 한다**(자명 통과 금지의 뒷면)
    const Q1 = await connect('quiet', 'pw9'); await sleep(2500);
    ok(Q1.notices.length === 0, '④f ★부름이 없는 사람에게는 **한 줄도 안 뜬다**', JSON.stringify(Q1.notices));
    close(Q1);
  }

  // ── ⑨ ★★[T211] **게스트도 길드에 불린다** — 지목 술어 하나가 남아 있었다 ──
  //   T208 이 친구 셋(`/friend/req`·`/friend/del`·`?by=name`)을 `findPerson` 으로 옮길 때
  //   `/tribe/invite` 하나가 `findAccount`(= 예약 술어 · `password_hash IS NOT NULL`)로 남았다.
  //   그래서 **벗은 될 수 있는데 길드에는 못 불리는** 사람이 생겼다 — 문이 아니라 벽이다.
  //   ⚠이 절은 §② 가 걸어 둔 **초대제** 길드에 든다 — 부름이 진짜 문 노릇을 하는지 같이 잰다.
  {
    const g1 = await jpost(`${CEN}/guest`, {});
    const gname = g1 && g1.player && g1.player.name;
    ok(!!(g1 && g1.ok && gname && /^여행자/.test(gname)), '⑨ 전제: 게스트 신원이 **제 이름**을 갖고 발급된다(T208)', gname);
    const G = await connectGuest(g1.token); await sleep(1200);
    ok(G.playerId === g1.player_id, '⑨a 전제: 존이 그 신원을 그대로 받는다(1회용 폴백이 아니다)', G.playerId);
    //   ⓐ 부른다 — 고치기 전엔 여기서 `'여행자XXXX' 은 없는 이름이다` 가 나왔다
    L.notices.length = 0; G.notices.length = 0;
    say(L, `/초대 ${gname}`); await sleep(1800);
    ok(L.notices.some((t) => /불렀다/.test(t)), '⑨ ★★**게스트를 길드로 부를 수 있다**(T208 회부 1 이 닫힌다)', last(L));
    ok(G.notices.some((t) => /부른다/.test(t)), '⑨b 불린 게스트에게 **알림이 간다**', JSON.stringify(G.notices.slice(-1)));
    ok(G.kinds.includes('guild'), '⑨b2 그 알림의 종류는 `guild` 다(새 종류 0)', JSON.stringify(G.kinds.slice(-2)));
    //   ⓑ 든다 — 초대제 길드라 **부름이 있어야** 지난다
    const before = await jget(`${CEN}/player/${encodeURIComponent(G.playerId)}`);
    ok(!!before && !before.player.tribe_id, '⑨c 전제 — 아직 길드에 안 들어 있다(아래가 자명 통과가 아니다)');
    G.notices.length = 0; say(G, '/수락'); await sleep(2000);
    ok(G.notices.some((t) => /에 들었다/.test(t)), '⑨ ★게스트가 `/수락` 한 마디로 든다', JSON.stringify(G.notices.slice(-1)));
    const after = await jget(`${CEN}/player/${encodeURIComponent(G.playerId)}`);
    ok(!!after && after.player.tribe_id === TID, '⑨d 가입의 정본(`players.tribe_id`)이 실제로 바뀌었다', after && after.player.tribe_id);
    //   ⓒ **밀린 부름**도 게스트에게 선다(T139 의 그 자리 — 표도 코드도 그대로다)
    const g2 = await jpost(`${CEN}/guest`, {});
    const gname2 = g2 && g2.player && g2.player.name;
    const G2a = await connectGuest(g2.token); await sleep(600); close(G2a); await sleep(1200);
    L.notices.length = 0; say(L, `/초대 ${gname2}`); await sleep(1800);
    ok(L.notices.some((t) => /불렀다/.test(t)), '⑨e 전제: 꺼져 있는 게스트도 부를 수는 있다', last(L));
    const G2b = await connectGuest(g2.token); await sleep(2500);
    ok(G2b.notices.some((t) => /\[돌칼\] 이\(가\) 자네를 부른다/.test(t)),
      '⑨ ★밀린 부름이 **게스트에게도** 다음 접속에 말이 된다(T139 문법 그대로)', JSON.stringify(G2b.notices));
    close(G2b);
    //   ⓓ 승계 뒤에도 **길드가 그대로다** — 행을 갈아치우지 않으니(배치 14 ①) 당연해야 한다
    const pr = await jpost(`${CEN}/promote`, { token: g1.token, username: 'promoted-g', password: 'pw-t211' });
    ok(!!(pr && pr.ok && pr.player && pr.player.player_id === g1.player_id), '⑨f 승계는 같은 `player_id` 위에 이름을 얹는다', pr && pr.player && pr.player.name);
    ok(!!(pr && pr.player && pr.player.tribe_id === TID), '⑨ ★승계 뒤에도 **길드가 그대로다**(소속은 pid 에 달려 있다)', pr && pr.player && pr.player.tribe_id);
    //   ⓔ 자명 통과 금지 — 아무 이름이나 불리는 게 아니다
    L.notices.length = 0; say(L, '/초대 여행자없음'); await sleep(1500);
    ok(L.notices.some((t) => /없는 이름이다/.test(t)), '⑨g ★자명 통과 금지 — 없는 이름은 여전히 없다', last(L));
    close(G);
  }

  // ── ⑤ central 이 죽어도 세계는 안 멎는다 ────────────────────────────────
  for (const x of procs) if (x.name === 'central') { try { x.p.kill('SIGKILL'); } catch (e) {} }
  await sleep(1500);
  L.notices.length = 0; say(L, '/초대 member'); await sleep(7000);
  ok(!L.closed, '⑤ ★central 이 죽어도 **놀던 사람은 안 끊긴다**');
  ok(L.notices.some((t) => /못 불렀다/.test(t)), '⑤b ★조용히 실패하지 않는다 — 말로 알려 준다', last(L));
  const siDown = await jget(`http://localhost:${ZPORT}/startinfo`);
  ok(!!(siDown && siDown.ok), '⑤c 시작 화면은 그대로 뜬다');
  //   ★[T139] **문이 닫혀 있을 때 알림함이 어떻게 실패하나** — 던지면 로그인 경로가 죽는다.
  //     죽은 포트를 향한 별도 프로세스로 잰다(공통.md §2 ⑨ · export 바꿔치기 금지).
  {
    const code = `
      process.env.CENTRAL_URL = 'http://127.0.0.1:1';
      const F = require(${JSON.stringify(path.join(ROOT, 'server', 'friends.js'))});
      const G = require(${JSON.stringify(path.join(ROOT, 'server', 'guild.js'))});
      const central = require(${JSON.stringify(path.join(ROOT, 'server', 'central-client.js'))});
      F.init({ central }); G.init({ central });
      Promise.all([F.pendingLines('nobody'), G.pendingLines('nobody')])
        .then((r) => { console.log('OK ' + JSON.stringify(r)); process.exit(0); })
        .catch((e) => { console.log('THREW ' + e.message); process.exit(2); });
      setTimeout(() => { console.log('HUNG'); process.exit(3); }, 20000);
    `;
    const out = await new Promise((res) => {
      const c = spawn(process.execPath, ['-e', code], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = ''; c.stdout.on('data', (b) => { buf += String(b); });
      c.on('close', () => res(buf.trim()));
    });
    ok(/^OK \[\[\],\[\]\]$/.test(out), '★★⑤d central 이 없으면 알림함은 **빈 줄을 답한다** — 던지지도 멎지도 않는다', JSON.stringify(out));
  }

  // ── ⑥ 소스 — 표 하나·컬럼 둘 · 사람이 쓴 문장은 그리는 쪽이 막는다 ──────
  {
    const cen = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    const lob = fs.readFileSync(path.join(ROOT, 'public', 'client', '70-lobby.js'), 'utf8');
    const nt = fs.readFileSync(path.join(ROOT, 'server', 'notice.js'), 'utf8');
    const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다
    ok((cen.match(/CREATE TABLE IF NOT EXISTS tribe_invites/g) || []).length === 1, '⑥ central 에 새 표는 **하나**다');
    //   ⚠`codeOnly` 를 안 쓴다 — 블록 주석 지우개가 문자열 안의 `/*` 를 만나면 그 뒤를 통째로 먹는다
    //     (초안이 그래서 0건을 봤다). 여기서 세는 것은 **SQL 문**이라 원문 그대로가 맞다.
    const added = (cen.match(/ALTER TABLE tribes ADD COLUMN (\w+)/g) || []).map((x) => x.split(' ').pop());
    ok(added.includes('join_mode') && added.includes('intro'), '⑥b 새 컬럼 **둘**이 있다', added.join(' '));
    //   ★[T159 2026-09-07] 일곱 → **여덟**. `granary_open` 하나를 더했다. 이 줄은 손으로 세는 자리라
    //     늘 때마다 고쳐야 하고, **고치는 그 행위가 곧 "컬럼을 늘렸다"는 자백**이다(그게 이 검사의 뜻이다).
    ok(added.length === 8, '⑥b2 ★`tribes` 의 컬럼 증설은 **여덟**이다(T128 일곱 + T159 하나) — 하나 더 늘면 여기가 빨개진다', added.length);
    ok(/onbEsc\(v\.intro\)/.test(lob), '⑥c ★사람이 쓴 문장은 **그리는 쪽이 막는다**(꺾쇠 이스케이프)');
    ok(!/slice\(0, ?60\)|substring\(0, ?60\)/.test(codeOnly(lob)), '⑥d ★길이 상한을 로비가 **다시 자르지 않는다**(사본 0)');
    ok(/'guild'/.test(codeOnly(nt)) && (codeOnly(nt).match(/KINDS = \[/g) || []).length === 1, '⑥e 알림 종류 표는 **하나**이고 거기에 `guild` 가 있다');
    ok(cen.length > 1000 && lob.length > 1000 && nt.length > 500, '⑥f (자명 통과 방지) 세 파일을 실제로 읽었다');
    // ★[T139] 알림함이 **아무것도 안 늘렸다** — 표도 컬럼도(⑥b2 가 컬럼을, 여기서 표를 센다).
    const tables = (cen.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || []).map((x) => x.split(' ').pop());
    ok(tables.length >= 5 && new Set(tables).size === tables.length,
       '⑥g 전제: central 의 표를 실제로 세었다(중복 0)', `${tables.length}개: ${tables.join(' ')}`);
    ok(!tables.some((t2) => /inbox|pending|call/i.test(t2)),
       '★⑥g2 부름 알림함은 **새 표를 안 만들었다** — 있는 두 표를 읽기만 한다', tables.join(' '));
    // ★접는 수를 zone 이 **손으로 안 적었다** — 정본에서 읽는다
    const zn = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const hook = zn.slice(zn.indexOf('Friends.pendingLines'), zn.indexOf('Friends.pendingLines') + 1200);
    ok(hook.length > 200, '⑥h 전제: welcome 훅을 실제로 찾았다(못 찾으면 아래가 자명 통과다)', hook.length);
    ok(/Notice\.NOTICE_MAX/.test(hook), '★★⑥h2 접는 수는 **정본에서 읽는다**(`Notice.NOTICE_MAX` · 새 수 0)');
    ok(!/[^\w.]3[^\w]/.test(hook.replace(/\/\/.*$/gm, '')), '⑥h3 ★그 훅에 **수 3이 손으로 적혀 있지 않다**');
    // ★"○○이 청했다"·"[△△]이 부른다" 문장은 **한 자리**다 — 그 자리에서 하는 말과 밀린 말이 같아야 한다
    const fj = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'friends.js'), 'utf8'));
    const gj = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'guild.js'), 'utf8'));
    //   ⚠**받는 쪽 문장**만 센다. 청한 쪽에게 하는 말("…에게 벗이 되자고 청했다")은 다른 문장이라
    //     그것까지 세면 초록이 될 길이 없다(초안이 여기서 2를 봤다).
    ok((fj.match(/이\(가\) 벗이 되자고 청했다/g) || []).length === 1, '★⑥i 친구 청함 문장은 **한 자리**다(`askedLine`)',
       (fj.match(/이\(가\) 벗이 되자고 청했다/g) || []).length);
    ok((gj.match(/자네를 부른다/g) || []).length === 1, '★⑥i2 길드 부름 문장도 **한 자리**다(`calledLine`)',
       (gj.match(/자네를 부른다/g) || []).length);
  }

  // ── ⑦ [T159] 마을 소속 · 곳간 인출 — 길드 마을의 문 ─────────────────────
  //   ⚠central 은 ⑤에서 죽였다 ⇒ 이 절은 **central 없이 되는 것만** 잰다:
  //     소속 표지 · 인출 한 자리 · 곳간 실제 감소 · 비소속 거절. 길드 문(central 판정)은
  //     `test-membership ⑪e` 가 "못 물어보면 열린 것으로 본다"까지, central 라우트 자체는 ⑧이 소스로 본다.
  {
    const si7 = await jget(`http://localhost:${ZPORT}/startinfo`);
    ok(!!(si7 && si7.ok && si7.villages.length), '⑦ 전제: 시작 화면이 마을을 안다', si7 && si7.villages.length);
    ok(si7.villages.every((v) => typeof v.member === 'number'),
       '★★⑦ 시작 화면의 **모든 줄에 소속 칸**이 있다(T115 `friendsHere` 와 같은 문법)');
    ok(si7.villages.every((v) => v.member === 0), '⑦b 아직 아무도 마을 사람이 아니다(자명 통과 금지의 앞면)');
    const V0 = si7.villages[0];

    // ⓐ 소속이 없으면 곳간이 안 열린다
    O.notices.length = 0; say(O, '/곳간'); await sleep(1200);
    ok(O.notices.some((t) => /마을 사람이 아니다/.test(t)), '★⑦c 마을 사람이 아니면 **곳간을 못 연다**', last(O));

    // ⓑ 소속을 앉히고(검사 전용 손잡이) 마을 앞에 선다
    O.ws.send(JSON.stringify({ type: '__e2e_body', quiet: true,
      member: { zone: 'hanbando', vid: V0.vid | 0, name: V0.name, since: 0, wdDay: -1, wdUsed: 0 } }));
    await sleep(800);
    //   ⚠`startInfo` 의 `cx,cy` 는 **존 로컬 셀**이다 — 텔레포트는 **px** 를 받는다(`cx*32+16` · e2e-verbs 규약).
    //     초안이 셀 값을 그대로 보내 "마을 중심에서 너무 멀다"를 받았다(근접 게이트가 제 일을 한 것이다).
    const AX = (V0.cx | 0) * 32 + 16, AY = (V0.cy | 0) * 32 + 16;
    for (let i = 0; i < 20; i++) {
      O.notices.length = 0;
      O.ws.send(JSON.stringify({ type: 'teleport_debug', x: AX + i * 31, y: AY + i * 17 }));
      await sleep(400);
      if (O.notices.some((t) => /텔레포트 →/.test(t))) break;
    }
    O.notices.length = 0; say(O, '/곳간'); await sleep(1500);
    const line0 = O.notices.find((t) => /곳간 —/.test(t)) || '';
    ok(!!line0, '★⑦d 마을 사람이 되니 **곳간이 형편을 말한다**', JSON.stringify(line0));
    const stock0 = parseFloat((/식량 재고 ([\d.]+)/.exec(line0) || [])[1]);
    ok(Number.isFinite(stock0) && stock0 > 0, '⑦d2 전제: 곳간에 식량이 실제로 있다', stock0);

    // ⓒ 사람 말로 꺼낸다 — 그리고 곳간이 **실제로 준다**
    O.notices.length = 0; say(O, '/곳간 식량 1'); await sleep(1800);
    ok(!O.notices.some((t) => /그런 물건은 없다/.test(t)), '⑦e ★"식량"이라는 우리말이 재화로 풀린다', last(O));
    O.notices.length = 0; say(O, '/곳간'); await sleep(1500);
    const line1 = O.notices.find((t) => /곳간 —/.test(t)) || '';
    const stock1 = parseFloat((/식량 재고 ([\d.]+)/.exec(line1) || [])[1]);
    ok(Number.isFinite(stock1) && stock1 < stock0,
       '★★⑦e2 곳간이 **실제로 줄었다** — 가짜 인출이 아니다', `${stock0} → ${stock1}`);

    // ⓓ 모르는 말은 아무것도 안 준다(자명 통과 금지의 뒷면)
    //   ⚠**곳간으로 재지 마라** — 마을은 살아 있어서 주민이 먹는다(실측: 두 번 읽는 사이 341 → 340).
    //     초안이 `stock2 === stock1` 로 재다 그 자연 감소에 걸렸다. 안 움직이는 자리는 **짐**이다.
    const packOf = (C) => Object.entries(C.inv || {}).reduce((a, [, v]) => a + (Number(v) || 0), 0);
    const pack0 = packOf(O);
    O.notices.length = 0; say(O, '/곳간 없는물건 1'); await sleep(1500);
    ok(O.notices.some((t) => /그런 물건은 없다/.test(t)), '★⑦f 모르는 말엔 **아무것도 안 나온다**', last(O));
    ok(packOf(O) === pack0, '★★⑦f2 그리고 **짐이 한 톨도 안 늘었다**(거절이 진짜다 · 곳간은 주민이 먹어 스스로 준다)',
       `${pack0} → ${packOf(O)}`);

    // ⓔ 시작 화면이 소속을 안다 — **접속 중인 사람만**(honest: 그 한계를 여기 적는다)
    const si8 = await jget(`http://localhost:${ZPORT}/startinfo?as=outsider`);
    const row = si8 && si8.ok && si8.villages.find((v) => v.vid === V0.vid);
    ok(!!row && row.member === 1, '★★⑦g `startInfo?as=<이름>` 이 **그 사람의 소속**을 답한다', row && row.member);
    const si9 = await jget(`http://localhost:${ZPORT}/startinfo?as=leader`);
    const row9 = si9 && si9.ok && si9.villages.find((v) => v.vid === V0.vid);
    ok(!!row9 && row9.member === 0, '⑦g2 ★남의 소속은 안 붙는다(보는 사람 기준)', row9 && row9.member);
  }

  // ── ⑧ [T159] 소스 — 컬럼 하나 · 인출 경로 하나 · 이름표 한 자리 ──────────
  {
    const cen = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    const zn = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const mem = fs.readFileSync(path.join(ROOT, 'server', 'membership.js'), 'utf8');
    const rl = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
    const added = (cen.match(/ALTER TABLE tribes ADD COLUMN (\w+)/g) || []).map((x) => x.split(' ').pop());
    ok(added.includes('granary_open'), '⑧ 길드 표에 **컬럼 하나**를 더했다', added.join(' '));
    ok(added.length === 8, '★⑧b `tribes` 컬럼 증설은 **여덟**이다(T128 일곱 + 이 카드 하나)', added.length);
    //   ★인출 경로는 하나다 — `/곳간` 이 제 손으로 재고를 만지지 않는다
    const gran = mem.slice(mem.indexOf("if (cmd === '/곳간')"), mem.indexOf("if (cmd === '/인출')"));
    ok(gran.length > 400, '⑧c 전제: `/곳간` 절을 실제로 찾았다', gran.length);
    ok(/withdraw\(player, vid, r0, n\)/.test(gran), '★★⑧c2 `/곳간` 은 **인출 정본을 부른다**(제 길을 안 낸다)');
    ok(!/storage\[/.test(gran) && !/playerVillageWithdraw\(/.test(gran),
       '★★⑧c3 그 절은 **곳간을 직접 안 만진다**(사본 0)');
    //   ★이름표 표지는 벗 비트와 같은 자리
    ok(/e\.mb = Membership\.memberOf\(o\) \? 1 : 0/.test(zn), '⑧d 마을 표지 1비트는 **정본을 부를 뿐**이다');
    ok(/o\.fr \? '벗 ' : \(o\.mb \? '마을 ' : ''\)/.test(rl), '★⑧d2 그 비트가 화면에서 **낱말 하나**가 된다(이모지 0)');
    ok(!/[\u{1F300}-\u{1FAFF}]/u.test((rl.match(/o\.fr \? '벗 '[^\n]*/) || [''])[0]), '⑧d3 그 낱말에 이모지가 없다');
    ok(cen.length > 1000 && zn.length > 1000 && mem.length > 1000 && rl.length > 1000, '⑧e (자명 통과 방지) 네 파일을 실제로 읽었다');
  }

  close(L); close(M); close(O); close(K);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
