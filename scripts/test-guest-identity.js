#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-guest-identity.js — 게스트 **영속 신원** + 소유 판정 전수 =============
//
// ★★[2026-08-03f 배치 13] 재민 확정: *"네 추천대로 하자"* — 배치 12 회부 2 를 막는다.
//   종전 게스트는 접속마다 `anon_<난수>` 를 새로 받았다. 그런데 이 세계의 소유 판정은
//   **전부 playerId 대조**다(사유지 `ownerPid` · 건물 `ownerId` · 노/숯가마/회관 `data.owner` ·
//   마을 `founder`). 그래서 게스트가 한 번 끊겼다 붙으면 **제가 지은 것의 주인이 아니게 됐다.**
//
// ★이 하네스가 증명해야 하는 것 넷:
//   ① **토큰 계약** — 같은 토큰 = 같은 playerId · 없는 토큰 = 새 사람 · 형식 위반 = 새 사람
//   ② **보안** — 토큰이 등록 계정의 열쇠가 되지 않는다 · 토큰이 **로그에 안 찍힌다**
//   ③ **소유가 재접속을 넘는다** — 실서버에 진짜 WebSocket 으로 두 번 붙어서 잰다
//      (사유지·노 터·움집터를 짓고 끊고 다시 붙어 "내 것"인지)
//   ④ **소유 판정 전수** — 7종(사유지·노·숯가마·움집·회관·마을 founder·길드)이 전부
//      playerId 대조인지, **이름 대조로 새는 곳이 없는지**("말만 막히나"의 역방향)
//
// ⚠검사 상황이 실제로 그 코드를 밟는지 assert 한다(자명한 통과 금지 — 이 프로젝트의 반복 실패 유형):
//   재접속 소유 검사는 **먼저 지어졌는지**를 걸고 시작한다. 안 지어졌으면 "거부 안 됨"이 자명해진다.
//
// 실행: node scripts/test-guest-identity.js
//   central + zone(마을 OFF — 이 검사의 대상이 아니다)을 임시 DB·설정 포트로 띄운다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2eg-central-${process.pid}.db`, ZDB = `/tmp/e2eg-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
if (process.platform === 'linux') {
  try { require('child_process').execSync("pkill -f 'node .*server/zone[.]js' || true; pkill -f 'node .*server/central[.]js' || true", { stdio: 'ignore', shell: '/bin/bash' }); } catch (e) {}
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;

// ★서버 표준출력을 통째로 모은다 — **토큰이 로그에 새는지**를 값으로 검사하기 위해서다.
const logBuf = { central: '', zone: '' };
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { logBuf[name] += String(b); });
  p.stderr.on('data', (b) => { logBuf[name] += String(b); });
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 120) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(500); }
  return false;
}
const postJ = async (port, p, body) => (await (await fetch(`http://localhost:${port}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})).json());

// ── 실서버에 진짜 WebSocket 으로 붙는 최소 클라 ────────────────────────────────
//   ★클라 JS 를 흉내 내지 않는다 — 프로토콜만 그대로 쓴다(브라우저 층은 e2e-village 가 잰다).
const WebSocket = require('ws');
function connectWs(qs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${qs}`);
    const state = { ws, welcome: null, notices: [], msgs: [] };
    const t = setTimeout(() => reject(new Error('welcome timeout')), 20000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      state.msgs.push(m);
      if (m.type === 'notice') state.notices.push(m.text);
      if (m.type === 'welcome' && !state.welcome) { state.welcome = m; clearTimeout(t); resolve(state); }
    });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
const sendWs = (st, m) => st.ws.send(JSON.stringify(m));
const closeWs = (st) => new Promise((r) => { st.ws.on('close', r); try { st.ws.close(); } catch (e) { r(); } setTimeout(r, 1500); });

(async () => {
  say('\n=== 게스트 영속 신원 + 소유 판정 전수 ===');
  //   ★★[T217] **비밀을 잡고 띄운다.** 안 그러면 하네스도 되돌이라 `isInternal` 이 참이 되고,
  //     "바깥에서 보면 무엇이 보이나"를 **잴 수가 없다**(폴백이 검사를 자명 통과시킨다).
  //     비밀을 잡으면 헤더 없는 요청이 곧 바깥이다 — 브라우저가 보는 그것.
  const SECRET = 't217-harness-secret-' + Math.random().toString(36).slice(2);
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답(`waitHttp(/zones)`)은 증인이 아니었다 — 앞 판 central 이 포트를 쥔 채면 새 central 은
  //   `EADDRINUSE` 로 즉시 죽는데 `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다.
  //   ⚠**듣기는 여기서 시작한다**(`await` 는 아래 `ok` 자리에서) — 아이가 표식을 찍는 것은 ~120ms 뒤라
  //     그 사이 다른 `await` 를 지나면 줄을 놓친다. 띄운 **그 틱에** 귀를 붙인다.
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',   // 마을 층은 이 검사의 대상이 아니다(e2e-village 가 잰다)
    E2E_GIVE: '1',
  });
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  ok(await (await _zp).ok, 'zone 기동');

  // ── ① 토큰 계약 ─────────────────────────────────────────────────────────────
  say('\n[① 토큰 계약 — 같은 토큰이면 같은 사람]');
  const g1 = await postJ(CPORT, '/guest', {});
  ok(g1 && g1.ok && typeof g1.player_id === 'string', `첫 게스트 발급 — ${g1 && g1.player_id}`);
  ok(/^anon_/.test(g1.player_id), '★playerId 가 `anon_` 접두사를 유지한다 — 코드 전역 28곳이 그걸로 "등록 계정 아님"을 판정한다');
  ok(/^[0-9a-f]{64}$/.test(g1.token), `토큰이 64자 hex (암호학적 난수 32바이트) — 길이 ${g1.token.length}`);
  const g1b = await postJ(CPORT, '/guest', { token: g1.token });
  ok(g1b.ok && g1b.player_id === g1.player_id && g1b.isNew === false, `★같은 토큰 → 같은 playerId (재접속 = 같은 사람)`);
  const g2 = await postJ(CPORT, '/guest', {});
  ok(g2.ok && g2.player_id !== g1.player_id, `토큰 없이 오면 새 사람 — ${g2.player_id} ≠ ${g1.player_id}`);
  const gBad = await postJ(CPORT, '/guest', { token: 'not-a-token' });
  ok(gBad.ok && gBad.player_id !== g1.player_id && gBad.player_id !== g2.player_id, '형식 위반 토큰 = 새 사람(에러가 아니라 새 신원 — 입장을 막지 않는다)');
  const gMiss = await postJ(CPORT, '/guest', { token: 'f'.repeat(64) });
  ok(gMiss.ok && gMiss.player_id !== g1.player_id, '없는 토큰(형식은 맞음) = 새 사람 — 남의 신원으로 못 들어간다');

  // ── ② 보안 ─────────────────────────────────────────────────────────────────
  say('\n[② 보안 — 토큰은 계정 열쇠가 아니고, 로그에 안 찍힌다]');
  {
    // 게스트 행에 비밀번호가 생기면(= 등록 계정으로 승격) 그 토큰으로는 못 들어와야 한다.
    const { DatabaseSync } = require('node:sqlite');
    const cdb = new DatabaseSync(CDB);
    const before = cdb.prepare('SELECT COUNT(*) c FROM players WHERE guest_token IS NOT NULL').get().c;
    ok(before >= 3, `★검사 전제 — 게스트 행이 실재한다(${before}행). 0 이면 아래 검사가 자명하다`);
    cdb.prepare('UPDATE players SET password_hash=?, password_salt=? WHERE player_id=?').run('x', 'y', g1.player_id);
    cdb.close();
    const gEsc = await postJ(CPORT, '/guest', { token: g1.token });
    ok(gEsc.ok && gEsc.player_id !== g1.player_id,
      `★비밀번호가 생긴 행은 게스트 토큰으로 못 연다 — ${gEsc.player_id} ≠ ${g1.player_id} (토큰이 계정 탈취 열쇠가 되지 않는다)`);
  }
  {
    const all = logBuf.central + logBuf.zone;
    const leaked = [g1.token, g2.token, gBad.token, gMiss.token].filter((t) => t && all.includes(t));
    ok(all.length > 200, `★검사 전제 — 서버 로그를 실제로 모았다(${all.length}자). 0 이면 이 검사가 자명하다`);
    ok(leaked.length === 0, `★토큰이 서버 로그에 한 번도 안 찍혔다 — 누출 ${leaked.length}건`);
    ok(/게스트 신원 발급: anon_/.test(logBuf.central), '발급 로그는 playerId 만 남긴다(추적은 되되 열쇠는 안 남는다)');
  }

  // ── ③ 소유가 재접속을 넘는다 — 실서버 WebSocket ─────────────────────────────
  say('\n[③ 재접속 소유 — 실서버에 두 번 붙어서 잰다]');
  const A = await connectWs('name=%EA%B2%8C%EC%8A%A4%ED%8A%B81');
  ok(!!A.welcome, '게스트 A 접속(welcome 수신)');
  const pidA = A.welcome.playerId, tokA = A.welcome.guestToken;
  ok(typeof pidA === 'string' && /^anon_/.test(pidA), `★welcome 이 **playerId** 를 준다 — ${pidA} (종전엔 세션 손잡이 pid 만 줬다)`);
  ok(typeof tokA === 'string' && /^[0-9a-f]{64}$/.test(tokA), '★welcome 이 게스트 토큰을 준다(클라가 localStorage 에 넣을 값)');
  {
    const shown = JSON.stringify(A.msgs.filter((m) => m.type === 'notice' || m.type === 'chat'));
    ok(!shown.includes(tokA), '★토큰이 알림·채팅으로 새지 않는다(welcome 한 곳에서만 온다)');
  }
  // 재료 지급 → 사유지 · 노 터 · 움집터를 **실제로** 짓는다
  sendWs(A, { type: '__e2e_give', items: { stone: 400, wood: 400 }, tools: ['pickaxe', 'pickaxe'] });
  await sleep(800);
  sendWs(A, { type: 'claim', kind: 'temporary' });
  await sleep(800);
  const myAbs = A.welcome.self ? { x: A.welcome.self.x, y: A.welcome.self.y } : { x: 0, y: 0 };
  const claimA = A.msgs.filter((m) => m.type === 'claim_added').map((m) => m.claim).filter((c) => c.ownerPid === pidA);
  ok(claimA.length === 1, `★사유지를 실제로 잡았다 — ${claimA.length}개 (0 이면 아래 재접속 검사가 자명하다)`);
  // 움집터(사유지 불필요) · 노 터(사유지 필요) 착공
  sendWs(A, { type: 'hut_start', atX: myAbs.x, atY: myAbs.y });
  await sleep(700);
  sendWs(A, { type: 'furnace_start', atX: myAbs.x, atY: myAbs.y, kind: 'crucible' });
  await sleep(700);
  const builtA = A.msgs.filter((m) => m.type === 'building_added').map((m) => m.building);
  const hutA = builtA.find((b) => b.type === 'hut_site');
  ok(!!hutA, `★움집터가 실제로 섰다${hutA ? '' : ` — 알림: ${A.notices.slice(-2).join(' / ')}`}`);
  const furA = builtA.find((b) => b.type === 'furnace_site');
  //   ★노 터는 **2×2 전체가 사유지**여야 선다. 이 하네스의 최소 클라는 걷지 않으므로 한 칸만 잡혀
  //     보통 안 선다 — 자명한 통과를 만들지 않으려고 **아래 검사를 조건부로 둔다.**
  //     노·숯가마·회관은 움집터와 달리 `_furnaceCanUse` 한 함수를 공유하고(④가 소스로 확인),
  //     그 술어의 실동작은 **`e2e-village.js` 의 회관**이 진짜 브라우저로 2×2 를 잡아 잰다.
  if (!furA) say('    (노 터 미착공 — 2×2 사유지 필요. `_furnaceCanUse` 실동작은 e2e-village 의 회관이 잰다)');
  await closeWs(A);
  await sleep(1200);

  // 같은 토큰으로 다시 붙는다 — **여기가 이 배치의 핵심**
  const B = await connectWs(`guest_token=${tokA}&name=%EA%B2%8C%EC%8A%A4%ED%8A%B81`);
  ok(!!B.welcome, '재접속(같은 토큰) 성공');
  ok(B.welcome.playerId === pidA, `★★재접속해도 **같은 사람**이다 — ${B.welcome.playerId} === ${pidA}`);
  {
    const mine = (B.welcome.claims || []).filter((c) => c.ownerPid === pidA);
    ok(mine.length >= 1, `★사유지가 여전히 내 것이다 — ${mine.length}개 (ownerPid 대조)`);
  }
  // 실제로 **권한이 통하는지** 눌러 본다 — 필드 비교가 아니라 서버 판정이다
  if (hutA) {
    B.notices.length = 0;
    sendWs(B, { type: 'hut_advance', buildingId: hutA.id });
    await sleep(900);
    ok(!B.notices.some((t) => /내 움집터가 아닙니다/.test(t)),
      `★움집터 시공이 소유 거부를 안 당한다 — 알림: ${B.notices.slice(-1)[0] || '(없음)'}`);
  }
  if (furA) {
    B.notices.length = 0;
    sendWs(B, { type: 'furnace_advance', buildingId: furA.id });
    await sleep(900);
    ok(!B.notices.some((t) => /내 노\(.*\) 터가 아닙니다|내 .*터가 아닙니다/.test(t)),
      `★노 터 시공이 소유 거부를 안 당한다 — 알림: ${B.notices.slice(-1)[0] || '(없음)'}`);
  }
  // 토큰 없는 **다른 사람**은 여전히 막힌다 — 영속화가 게이트를 느슨하게 만들지 않았는지
  const C = await connectWs('name=%EB%82%A8');
  ok(!!C.welcome && C.welcome.playerId !== pidA, `다른 게스트 접속 — ${C.welcome.playerId} ≠ ${pidA}`);
  if (hutA) {
    C.notices.length = 0;
    sendWs(C, { type: 'hut_advance', buildingId: hutA.id });
    await sleep(900);
    ok(C.notices.some((t) => /내 움집터가 아닙니다/.test(t)),
      `★★남의 움집터는 **여전히 막힌다** — "${C.notices.slice(-1)[0] || '(거부 없음 — 보안 퇴보!)'}"`);
  }
  {
    B.notices.length = 0;
    // 남의 사유지를 해제해 보기 — 소유 게이트의 다른 갈래
    const cid = claimA[0] && claimA[0].id;
    if (cid) {
      C.notices.length = 0;
      sendWs(C, { type: 'unclaim', claimId: cid });
      await sleep(800);
      ok(C.notices.some((t) => /내 사유지가 아닙니다/.test(t)), `★남의 사유지는 해제 못 한다 — "${C.notices.slice(-1)[0] || '(거부 없음 — 보안 퇴보!)'}"`);
    }
  }
  await closeWs(B); await closeWs(C);

  // ── ⑤ 승계 — playerId 가 유지된 채 비밀번호만 얹힌다 [2026-08-03g 배치 14 ①] ────
  say('\n[⑤ 승계 — 등록해도 playerId 가 안 바뀐다(= 소유가 안 사라진다)]');
  {
    const g = await postJ(CPORT, '/guest', {});
    ok(g.ok && /^anon_/.test(g.player_id), `승계용 게스트 발급 — ${g.player_id}`);
    // 승계 전: 그 이름은 비어 있다
    // ★[T363] `/check_username` 은 **안 문**이 됐다(#48 ⓑ) — 하네스도 존처럼 비밀을 실어야 답을 받는다.
    const IN0 = { 'x-zone-secret': SECRET };
    const cu = async (u) => (await (await fetch(`http://localhost:${CPORT}/check_username`,
      { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, IN0), body: JSON.stringify({ username: u }) })).json());
    ok((await cu('chon1')).taken === false, '★검사 전제 — 승계 전 그 이름은 비어 있다');
    const pr = await postJ(CPORT, '/promote', { token: g.token, username: 'chon1', password: 'pw12345678' });
    ok(pr.ok && pr.player && pr.player.player_id === g.player_id,
      `★★승계해도 **playerId 가 그대로**다 — ${pr.player && pr.player.player_id} === ${g.player_id} (소유가 안 사라진다)`);
    ok(pr.player.name === 'chon1', `표시 이름이 등록 이름으로 바뀐다 — "${pr.player.name}"`);
    ok(!!pr.player.password_hash, '비밀번호가 얹혔다(이제 계정이다)');
    ok(pr.player.guest_token === null, '★승계와 동시에 게스트 토큰이 **죽는다**(NULL) — 벨트와 멜빵의 벨트');
    // 구 토큰으로는 더 못 들어온다(멜빵 — 배치 13 의 "비밀번호 생긴 행은 못 연다" 게이트)
    const reuse = await postJ(CPORT, '/guest', { token: g.token });
    ok(reuse.ok && reuse.player_id !== g.player_id, `★★구 게스트 토큰으로는 **더 못 들어온다** — ${reuse.player_id} ≠ ${g.player_id}`);
    // 이제 그 이름은 예약됐다 — 승계 계정은 player_id ≠ name 이라 PK 조회만 하면 놓친다
    ok((await cu('chon1')).taken === true,
      '★승계된 이름이 **중복 검사에 잡힌다**(player_id ≠ name 이라 PK 조회만 하면 놓친다 — 이 술어를 쓰는 문은 이것 하나다 · T363)');
    // 비밀번호로 로그인하면 같은 playerId 로 돌아온다
    const login = await postJ(CPORT, '/auth', { username: 'chon1', password: 'pw12345678' });
    ok(login.ok && login.player.player_id === g.player_id,
      `★★비밀번호 로그인 → **같은 playerId** — ${login.player && login.player.player_id}`);
    const wrong = await postJ(CPORT, '/auth', { username: 'chon1', password: 'nope' });
    ok(wrong.ok === false && wrong.reason === 'wrong_password', `틀린 비밀번호는 거절 — ${wrong.reason}`);
    // 남이 같은 이름을 승계 시도 → 막힌다
    const g2b = await postJ(CPORT, '/guest', {});
    const steal = await postJ(CPORT, '/promote', { token: g2b.token, username: 'chon1', password: 'other12345' });
    ok(steal.ok === false && steal.reason === 'username_taken', `★남이 같은 이름을 가져갈 수 없다 — ${steal.reason}`);
    // ★옛 토큰이 남은 채 **기존 계정**으로 로그인 → 막지 말고 흘려보내야 한다(사고 방지)
    const flow = await postJ(CPORT, '/promote', { token: g2b.token, username: 'chon1', password: 'pw12345678' });
    ok(flow.ok === false && flow.reason === 'not_promotable',
      `★★제 계정에 로그인하는 길을 막지 않는다 — reason=${flow.reason} (username_taken 이면 제 계정에 못 들어간다)`);
    // 승계된 계정 토큰은 로그에 안 찍힌다
    const all2 = logBuf.central + logBuf.zone;
    ok(!all2.includes(g.token) && !all2.includes(g2b.token), '★승계 경로에서도 토큰이 로그에 안 샌다');
    ok(/게스트 승계: anon_/.test(logBuf.central), '승계 로그는 playerId 와 이름만 남긴다');
  }

  // ── ⑥ 몸의 영속 — 인벤·좌표가 재접속을 넘는가 [배치 14 ②] ────────────────────
  say('\n[⑥ 몸의 영속 — 신원만이 아니라 인벤·좌표도 남는다]');
  {
    const D = await connectWs('name=%EB%AA%B8');
    const pidD = D.welcome.playerId, tokD = D.welcome.guestToken;
    ok(!!tokD, '영속 게스트로 접속(토큰 수령)');
    sendWs(D, { type: '__e2e_give', items: { berry: 77, stone: 12 }, tools: ['axe'] });
    await sleep(1200);
    const invD = D.msgs.filter((m) => m.type === 'inventory').slice(-1)[0];
    ok(invD && invD.inventory && invD.inventory.berry === 77, `★검사 전제 — 몸에 물건이 실렸다(베리 ${invD && invD.inventory && invD.inventory.berry})`);
    await closeWs(D);
    await sleep(2500);   // savePlayer 는 fire-and-forget — central 쓰기가 끝날 틈을 준다
    const E = await connectWs(`guest_token=${tokD}&name=%EB%AA%B8`);
    ok(E.welcome.playerId === pidD, `같은 사람으로 재접속 — ${E.welcome.playerId}`);
    ok((E.welcome.inventory || {}).berry === 77,
      `★★재접속해도 **인벤이 그대로**다 — 베리 ${(E.welcome.inventory || {}).berry} (종전엔 빈 몸이었다)`);
    ok(((E.welcome.toolItems || []).some((t) => t.type === 'axe')), '도구 인스턴스도 남는다(도끼)');
    const sx = E.welcome.self && E.welcome.self.x, sy = E.welcome.self && E.welcome.self.y;
    ok(typeof sx === 'number' && typeof sy === 'number', `좌표를 받았다 — (${Math.round(sx)},${Math.round(sy)})`);
    await closeWs(E);
    // ★대조군 — **1회용 폴백 신원**은 저장 대상이 아니다. central 행이 없는 신원은 애초에 만들 수 없으니
    //   여기서는 술어 자체를 검사한다(canPersist 가 `persistent` 를 보는가).
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/function canPersist\(player\)[\s\S]{0,400}player\.persistent/.test(zsrc),
      '★저장 판정이 접두사가 아니라 `player.persistent` 를 본다(영속 게스트 O · 1회용 폴백 X)');
    ok(!/if \(!player\.playerId\.startsWith\('anon_'\)\) savePlayer/.test(zsrc),
      '★호출부 17곳의 `anon_` 사본 검사가 사라졌다 — 술어가 한 곳에만 있다(사본 금지)');
    ok(/persistent: !!player\.persistent/.test(zsrc), '존 핸드오프에도 영속 여부가 실린다(존을 넘어도 몸이 저장된다)');
  }

  // ── ④ 소유 판정 전수 — 7종이 전부 playerId 대조인가 ─────────────────────────
  say('\n[④ 소유 판정 전수 — 이름으로 새는 곳이 없는가]');
  {
    const z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const v = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const CHECKS = [
      ['사유지(해제)', /c\.ownerPid !== player\.playerId/, z],
      ['사유지(발자국 권리)', /c\.ownerPid === player\.playerId/, z],
      ['노·숯가마·회관 공용 술어', /function _furnaceCanUse[\s\S]{0,300}d\.owner === player\.playerId/, z],
      ['움집터', /b\.data\.owner !== player\.playerId/, z],
      ['회관 재고(같은 술어 재사용)', /function tryVillageInventory[\s\S]{0,600}_furnaceCanUse\(player, b\)/, z],
      ['마을 창설자', /founder: player\.playerId/, z],
      ['길드', /player\.tribeId === d\.tribeId/, z],
      ['마을 founder 저장', /const founder = String\(opts\.founder \|\| ''\)/, v],
    ];
    for (const [ko, re, src] of CHECKS) ok(re.test(src), `${ko} — playerId 대조 그대로(토큰이 신원을 고정하므로 **고칠 것이 없다**)`);
    // ★역방향: 이름으로 소유를 판정하는 곳이 하나라도 있으면 토큰으로도 못 막는다.
    const nameCmp = [];
    for (const [f, src] of [['zone.js', z], ['villages.js', v]]) {
      const lines = src.split('\n');
      lines.forEach((ln, i) => {
        if (/(ownerName|owner_name|tameOwnerName)\s*(===|!==)/.test(ln)) nameCmp.push(`${f}:${i + 1}`);
      });
    }
    ok(nameCmp.length === 0, `★이름(ownerName)으로 소유를 판정하는 곳 ${nameCmp.length}곳${nameCmp.length ? ' — ' + nameCmp.join(' · ') : ' (표시 전용으로만 쓰인다)'}`);
    // ★클라도 마찬가지 — 사유지 목록이 username 이 아니라 영속 신원과 대조해야 한다
    const cl = require('./client-src.js').readClientSrc();
    ok(!/cl\.ownerPid !== myUsername/.test(cl), '★클라 사유지 목록이 `myUsername` 대조를 안 쓴다(게스트는 그게 빈 문자열이라 제 사유지가 남의 것으로 보였다)');
    ok(/msg\.playerId/.test(cl) && /myPlayerId/.test(cl), '클라가 welcome 의 playerId 를 받아 소유 대조에 쓴다');
    ok(!/showNotice\([^)]*[gG]uestToken|myGuestToken[^;]*innerHTML|innerHTML[^;]*myGuestToken/.test(cl), '★클라가 토큰을 화면·알림에 그리지 않는다');
  }

  // ══ ⑤ ★★[T217 · P0] **열쇠는 HTTP 로 안 나간다** ══════════════════════════
  //   T216 이 잰 사슬: 벗 이름 → id → `guest_token` → `/guest` → ws 접속. 네 걸음 전부 200 이었다.
  //   여기서 재는 것은 **그 사슬이 ②에서 끊기는가**, 그리고 **저장 경로는 사는가**.
  say('\n[⑤ 투영 · 안 문 · 사슬 — T217]');
  {
    const OUT = {};                                   // 바깥(브라우저) — 헤더 없음
    const IN = { 'x-zone-secret': SECRET };           // 안 문(존)
    const getRaw = async (path2, hdr) => {
      try { const r = await fetch(`http://localhost:${CPORT}${path2}`, { headers: hdr || {} }); return { s: r.status, d: await r.json(), cors: r.headers.get('access-control-allow-origin') }; }
      catch (e) { return { s: 0, d: { err: e.message } }; }
    };
    const postRaw = async (path2, body, hdr) => {
      try { const r = await fetch(`http://localhost:${CPORT}${path2}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || {}), body: JSON.stringify(body) }); return { s: r.status, d: await r.json() }; }
      catch (e) { return { s: 0, d: { err: e.message } }; }
    };
    const gv = await postJ(CPORT, '/guest', {});
    await postJ(CPORT, '/auth', { username: 't217acct', password: 'pw-t217', color: '#5a9ae0', home_zone: 'hanbando', home_x: 111, home_y: 222 });

    // ⓐ 바깥에서 본 `/player/<id>` — 열쇠·좌표·소지품이 **한 칸도 없어야** 한다
    const outRow = await getRaw(`/player/${encodeURIComponent(gv.player_id)}`, OUT);
    const KEYS = ['password_hash', 'password_salt', 'guest_token', 'home_x', 'home_y', 'last_x', 'last_y', 'inventory_json', 'tools_json'];
    const leaked = KEYS.filter((k) => outRow.d && outRow.d.player && outRow.d.player[k] !== undefined);
    ok(leaked.length === 0, '⑤a ★★바깥의 `GET /player/<id>` 에 **열쇠·좌표·소지품이 0칸**', leaked.length ? leaked.join(',') : `칸: ${Object.keys((outRow.d && outRow.d.player) || {}).join(',')}`);
    ok(!!(outRow.d && outRow.d.player && outRow.d.player.last_zone !== undefined && outRow.d.player.name !== undefined),
      '⑤a2 ★그런데 **로비가 쓰는 칸은 그대로 있다**(`name`·`last_zone`·`home_zone` — 클라 0)');
    // ⓑ 안 문에서는 행 전체가 온다 — 존이 `last_seen`·`tribe_id`·`tools_json` 을 읽어야 한다
    const inRow = await getRaw(`/player/${encodeURIComponent(gv.player_id)}`, IN);
    ok(!!(inRow.d && inRow.d.player && inRow.d.player.guest_token), '⑤b ★안 문(존)에서는 **행 전체가 온다**(저장·복원이 산다)');
    // ⓒ 쓰기 — 바깥은 거절, 안 문은 통과
    const wOut = await postRaw(`/player/${encodeURIComponent(gv.player_id)}`, { wood: 99999 }, OUT);
    ok(wOut.s === 401, '⑤c ★★바깥의 `POST /player/<id>` 는 **거절**된다(T217 §0-ⓑ: 여태 누구나 남의 몸을 덮어썼다)', `status ${wOut.s} · ${JSON.stringify(wOut.d).slice(0, 60)}`);
    const wIn = await postRaw(`/player/${encodeURIComponent(gv.player_id)}`, { wood: 42 }, IN);
    const chk = await getRaw(`/player/${encodeURIComponent(gv.player_id)}`, IN);
    ok(wIn.s === 200 && chk.d.player.wood === 42, '⑤c2 ★안 문의 쓰기는 **산다**(저장 경로 무변)', `wood ${chk.d.player.wood}`);
    // ⓓ T216 사슬이 **②에서 끊긴다**
    const byName = await getRaw(`/friends/${encodeURIComponent('t217acct')}?by=name`, OUT);
    ok(byName.d && byName.d.friends === undefined && typeof byName.d.n === 'number',
      '⑤d ★`?by=name` 은 바깥에 **수만** 준다(id 가 사슬의 첫 걸음이었다)', JSON.stringify(byName.d));
    const byNameIn = await getRaw(`/friends/${encodeURIComponent('t217acct')}?by=name`, IN);
    ok(!!(byNameIn.d && Array.isArray(byNameIn.d.friends)), '⑤d2 ★안 문에는 id 가 온다 — `friendsHere` 가 그걸로 센다(기능 무변)');
    ok(!(outRow.d && outRow.d.player && outRow.d.player.guest_token),
      '⑤ ★★**T216 네 걸음 사슬이 ②에서 끊긴다** — id 를 알아도 토큰이 안 나온다');
    // ⓔ CORS — 기본은 헤더가 없다(로비는 central 과 같은 오리진이다)
    ok(outRow.cors === null, '⑤e ★CORS `*` 가 **기본으로 안 붙는다**(필요한 판만 `CENTRAL_CORS`)', String(outRow.cors));
    // ⓕ ★토큰 회전 — 이미 샜을 수 있는 열쇠가 제 주인의 다음 접속에 죽는다
    const again = await postJ(CPORT, '/guest', { token: gv.token });
    ok(again.ok && again.player_id === gv.player_id, '⑤f 전제: 같은 토큰이면 **같은 사람**이다(배치 13 계약 무변)', again.player_id);
    ok(again.token && again.token !== gv.token, '⑤ ★★열쇠가 **회전한다** — 쓸 때마다 새 토큰(#27 판정)', `${String(again.token).slice(0, 8)}… ≠ ${String(gv.token).slice(0, 8)}…`);
    //   ★유예 — 옛 열쇠는 **곧바로 죽지 않는다**. 존이 `/guest` 를 부른 뒤 welcome 이 닿기 전에
    //     접속이 깨지면 클라는 새 토큰을 못 받은 채 옛것으로 다시 붙는다. 그때 신원을 잃으면
    //     그 사람은 제 마을을 잃는다 ⇒ 몇 분만 살려 둔다(메모리 · 새 컬럼 0).
    const grace = await postJ(CPORT, '/guest', { token: gv.token });
    ok(grace.ok && grace.player_id === gv.player_id, '⑤f2 ★유예 — 옛 열쇠로 곧바로 다시 붙으면 **같은 사람**이다(접속이 깨진 판을 살린다)', grace.player_id);
    const live = await postJ(CPORT, '/guest', { token: again.token });
    ok(live.ok && live.player_id === gv.player_id, '⑤f3 ★주인은 **새 토큰으로 그대로** 들어온다(신원 안 잃는다)', live.player_id);
    //   ★그리고 유예가 끝나면 옛 열쇠는 **죽는다** — 유예를 0 으로 띄운 판으로 잰다(자명 통과 금지).
    const CP2 = CPORT + 7, CDB2 = `/tmp/t217-grace0-${process.pid}.db`;
    boot('central0', 'central.js', { PORT: String(CP2), DB_PATH: CDB2, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET, GUEST_TOKEN_GRACE_MS: '0' });
    await waitHttp(`http://localhost:${CP2}/zones`);
    const z1 = await postJ(CP2, '/guest', {});
    const z2 = await postJ(CP2, '/guest', { token: z1.token });          // 회전
    const z3 = await postJ(CP2, '/guest', { token: z1.token });          // 옛것 — 유예 0 이면 죽는다
    ok(z2.token !== z1.token && z3.isNew === true && z3.player_id !== z1.player_id,
      '⑤ ★★유예가 끝난 옛 열쇠는 **더는 그 사람이 아니다**(훔친 열쇠가 죽는 자리)', `${z3.player_id} · isNew=${z3.isNew}`);
    for (const f of [CDB2, CDB2 + '-wal', CDB2 + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  }

  // ══ ⑥ ★★[T225] **T216 열셋을 같은 순서로 다시 두드린다** ═══════════════════
  //   자명 통과 금지: 고치기 전 표(T216 §0-ⓐ)의 "남의 이름/ID 하나로 나오나" 열을 **다시 잰다**.
  //   ⚠하네스가 비밀을 잡고 띄웠으므로 **헤더 없는 요청이 곧 바깥**이다(브라우저가 보는 그것).
  say('\n[⑥ T216 열셋 재실측 — T225]');
  {
    const OUT2 = {}, IN2 = { 'x-zone-secret': SECRET };
    const g = async (base, path2, hdr) => {
      try { const r = await fetch(`http://localhost:${base}${path2}`, { headers: hdr || {} }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch (e) { d = t; } return { s: r.status, d }; }
      catch (e) { return { s: 0, d: String(e.message) }; }
    };
    const pst = async (base, path2, body, hdr) => {
      try { const r = await fetch(`http://localhost:${base}${path2}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || {}), body: JSON.stringify(body) }); return { s: r.status, d: await r.json() }; }
      catch (e) { return { s: 0, d: String(e.message) }; }
    };
    await pst(CPORT, '/auth', { username: 't225v', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 }, IN2);
    await pst(CPORT, '/auth', { username: 't225p', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 3, home_y: 4 }, IN2);
    await pst(CPORT, '/friend/req', { player_id: 't225v', name: 't225p' }, IN2);
    await pst(CPORT, '/friend/req', { player_id: 't225p', name: 't225v' }, IN2);

    // #3 · #4 · #5 — T217 이 닫은 셋이 **여전히** 닫혀 있나(되돌아오지 않았나)
    const p3 = await g(CPORT, '/player/t225v', OUT2);
    ok(!(p3.d && p3.d.player && (p3.d.player.password_hash || p3.d.player.guest_token || p3.d.player.home_x !== undefined)),
      '⑥#3 `GET /player/<id>` — 열쇠·좌표 **없음**(T217 무변)', JSON.stringify(p3.d).slice(0, 90));
    const p4 = await g(CPORT, '/friends/t225v?by=name', OUT2);
    const p5 = await g(CPORT, '/friends/t225v', OUT2);
    ok(p4.d && p4.d.friends === undefined && typeof p4.d.n === 'number', '⑥#4 `?by=name` — **수만**', JSON.stringify(p4.d));
    ok(p5.d && p5.d.friends === undefined && typeof p5.d.n === 'number', '⑥#5 `GET /friends/<id>` — **수만**(이름·id 안 준다)', JSON.stringify(p5.d));
    // #6 · #7 — 이름을 주던 둘이 안 문으로 갔나
    const p6 = await pst(CPORT, '/friend/pending', { player_id: 't225v' }, OUT2);
    const p7 = await pst(CPORT, '/tribe/invites', { player_id: 't225v' }, OUT2);
    ok(p6.s === 401 && p7.s === 401, '⑥#6#7 밀린 요청·부름은 **바깥에서 401**(이름을 주던 갈래)', `${p6.s}/${p7.s}`);
    const p6in = await pst(CPORT, '/friend/pending', { player_id: 't225v' }, IN2);
    ok(p6in.s === 200 && Array.isArray(p6in.d.requests), '⑥#6b ★안 문에서는 **산다** — 존이 `pendingLines` 로 그렇게 쓴다', JSON.stringify(p6in.d).slice(0, 60));
    // #11~#13 + 관측창 다섯 — 열 개 전부
    const DBG = ['/welcomedbg', '/guilddbg', '/lifedbg', '/followdbg', '/friendsdbg?pid=t225v', '/claimdbg', '/shelterdbg', '/roomdbg'];
    const outs = [];
    for (const d of DBG) outs.push([d, (await g(ZPORT, d, OUT2)).s]);
    ok(outs.every(([, st]) => st === 404), '⑥#11~13+ ★★관측창 여덟이 **바깥에서 404**(`/followdbg` 는 접속자 전원의 자리였다)',
      outs.map(([d, st]) => `${d.split('?')[0]}:${st}`).join(' '));
    const ins = [];
    for (const d of DBG) ins.push([d, (await g(ZPORT, d, IN2)).s]);
    ok(ins.every(([, st]) => st === 200), '⑥ ★안 문에서는 관측창이 **그대로 산다**(하네스는 사설 주소라 무변)',
      ins.map(([d, st]) => `${d.split('?')[0]}:${st}`).join(' '));
    // ★★[T363 2026-09-23 · #48 ⓑ] **이 줄이 뒤집혔다.** T225 는 `/check_username` 을 *"연 채로 둔다"* 고 적었고
    //   그 근거는 로그인 UX 였다. T310 이 그 문을 회부했고, 재민이 ⓑ(닫는다)를 골랐다.
    //   ⇒ 이제 **바깥은 404** 이고, 로비는 제출 때 `/auth` 응답으로 같은 답을 받는다(새 문 0).
    //   ⚠지우지는 못했다 — `zone.js` 게스트 갈래가 `findAccount` 술어를 이 문으로 쓴다(보고 §0-ⓐ).
    const p2 = await pst(CPORT, '/check_username', { username: 't225v' }, OUT2);
    ok(p2.s === 404 && p2.d && p2.d.error === 'not found',
      '⑥#2 ★`/check_username` 은 **닫혔다**(T363 · 바깥 404 · 몸통도 숨긴다) — 이름 존재가 더는 안 샌다', `${p2.s} ${JSON.stringify(p2.d)}`);
    const p2in = await pst(CPORT, '/check_username', { username: 't225v' }, IN2);
    ok(p2in.s === 200 && p2in.d.taken === true,
      '⑥#2b 안 문으로는 그대로 답한다 — 존의 게스트 갈래가 남의 이름 도용을 막는 그 답이다', JSON.stringify(p2in.d));
    const p9 = await g(ZPORT, '/startinfo?as=t225v', OUT2);
    //   ⚠이 하네스는 `ENABLE_VILLAGES=0` 이라 마을 목록이 비어 있다 — 재는 것은 **문이 여전히 바깥에 열려 있다**는 것뿐이다.
    ok(p9.s === 200 && !!p9.d, '⑥#9 `?as=` 는 **이 카드가 안 건드린다**(#27 로비 순서 · 여전히 열려 있다)', `status ${p9.s} · ${JSON.stringify(p9.d).slice(0, 60)}`);
  }

  // ══ ⑦ ★★[T235] **남은 무인증 POST 다섯** — 바깥 404 · 안 문은 산다 ═════════
  //   고치기 전 실측(보고 §0-ⓐ): 남의 주문 취소 200 · 남의 이름으로 주문 200 ·
  //   남의 길드로 전쟁 선포 200 · 아무 전쟁이나 종료 200 · **남을 길드에서 빼기 200**.
  say('\n[⑦ 무인증 POST 다섯 — T235]');
  {
    const OUT3 = {}, IN3 = { 'x-zone-secret': SECRET };
    const pj = async (path2, body, hdr) => {
      try { const r = await fetch(`http://localhost:${CPORT}${path2}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || {}), body: JSON.stringify(body) }); let d; try { d = await r.json(); } catch (e) { d = null; } return { s: r.status, d }; }
      catch (e) { return { s: 0, d: String(e.message) }; }
    };
    const gj = async (path2, hdr) => { try { const r = await fetch(`http://localhost:${CPORT}${path2}`, { headers: hdr || {} }); return { s: r.status, d: await r.json() }; } catch (e) { return { s: 0, d: null }; } };
    // 전제 — 피해자와 남을 세운다(전부 안 문으로 · 이게 곧 "존이 대신 부른다"의 그 길이다)
    await pj('/auth', { username: 't235vic', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 }, IN3);
    await pj('/auth', { username: 't235atk', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 }, IN3);
    await pj('/player/t235vic', { wood: 500, stone: 500 }, IN3);
    const tv = await pj('/tribe/create', { player_id: 't235vic', name: 'T235피해' }, IN3);
    const ta = await pj('/tribe/create', { player_id: 't235atk', name: 'T235남' }, IN3);
    const ord = await pj('/market/order', { player_id: 't235vic', side: 'sell', item: 'wood', amount: 5, price_item: 'stone', price_amount: 2 }, IN3);
    ok(!!(tv.d && tv.d.tribe_id) && !!(ord.d && ord.d.ok), '⑦ 전제: 피해자의 길드와 주문이 실제로 섰다(아래가 자명 통과가 아니다)', `길드 ${tv.d && tv.d.tribe_id} · 주문 ${ord.d && ord.d.order_id}`);
    const oid = ord.d && ord.d.order_id;

    // ⓐ 바깥에서 다섯을 두드린다 — 전부 404(문이 있는지도 안 알린다)
    const outs = [
      ['market/order', await pj('/market/order', { player_id: 't235vic', side: 'sell', item: 'stone', amount: 99, price_item: 'wood', price_amount: 1 }, OUT3)],
      ['market/cancel', await pj('/market/cancel', { player_id: 't235vic', order_id: oid }, OUT3)],
      ['war/declare', await pj('/war/declare', { attacker_guild_id: tv.d && tv.d.tribe_id, defender_guild_id: ta.d && ta.d.tribe_id, declared_by: 't235vic' }, OUT3)],
      ['war/end', await pj('/war/end', { war_id: 1 }, OUT3)],
      ['tribe/leave', await pj('/tribe/leave', { player_id: 't235vic' }, OUT3)],
    ];
    ok(outs.every(([, r]) => r.s === 404), '⑦ ★★다섯 문이 **바깥에서 404**(남의 이름을 실어도 문이 안 열린다)',
      outs.map(([n, r]) => `${n}:${r.s}`).join(' '));
    // ⓑ ★자명 통과 금지 — 그 다섯이 **실제로 아무것도 안 바꿨다**
    const vAfter = await gj('/player/t235vic', IN3);
    //   ⚠[T245] `/market/orders` 는 이제 **안 문**이다(호가창이 남의 id 를 싣는다) — 안에서 읽는다.
    const ordsAfter = await gj('/market/orders', IN3);
    const mine = ((ordsAfter.d && ordsAfter.d.orders) || []).filter((o) => o.player_id === 't235vic');
    ok(!!(vAfter.d && vAfter.d.player && vAfter.d.player.tribe_id === (tv.d && tv.d.tribe_id)),
      '⑦b ★피해자가 **길드에 그대로 있다**(고치기 전엔 `tribe_id` 가 null 이 됐다)', `tribe_id ${vAfter.d && vAfter.d.player && vAfter.d.player.tribe_id}`);
    ok(mine.length === 1 && mine[0].id === oid, '⑦b2 ★주문이 **그대로 하나**다(물리지도, 남의 이름으로 늘지도 않았다)', `주문 ${mine.length}개`);
    const warsAfter = await gj('/wars/active', OUT3);
    ok(((warsAfter.d && warsAfter.d.wars) || []).length === 0, '⑦b3 ★전쟁이 **안 났다**(남의 길드로 선포되지 않았다)', JSON.stringify((warsAfter.d && warsAfter.d.wars) || []).slice(0, 60));
    // ⓒ 안 문(=존이 대신 부르는 그 길)은 **산다**
    const inCancel = await pj('/market/cancel', { player_id: 't235vic', order_id: oid }, IN3);
    const ordsIn = await gj('/market/orders', IN3);   // ★[T245] 안 문
    ok(inCancel.s === 200 && ((ordsIn.d && ordsIn.d.orders) || []).filter((o) => o.player_id === 't235vic').length === 0,
      '⑦c ★안 문에서는 **그대로 산다** — 존이 제 신원을 붙여 부르는 길이 이것이다', `status ${inCancel.s}`);
    const inLeave = await pj('/tribe/leave', { player_id: 't235vic' }, IN3);
    ok(inLeave.s === 200 && !!(inLeave.d && inLeave.d.ok), '⑦c2 ★길드 탈퇴도 안 문에서는 산다', JSON.stringify(inLeave.d));
  }

  // ══ ⑧ ★★[T242] **라우트 전수표 파수꾼** — 손 목록 0 · 새 문이 생기면 빨강 ════════
  //   T216 이 13 을 셌고 T225 가 관측창 열을 옮겼고 T235 가 다섯을 닫았다. 하나씩 닫아 왔으니
  //   이제 **전수표**가 있어야 한다 — 그리고 그 표는 **사람이 세는 순간 낡는다**.
  //   ⇒ 라우트 목록을 **코드에서 정규식으로 뽑아** 아래 표와 대조한다. 새 라우트가 생기면
  //     표에 없어서 빨강이고, 지워진 라우트가 있으면 표에 남아서 빨강이다.
  //   ⚠표의 값은 **판정**이다(갈래 · 남의 것이 읽히나/바뀌나). 판정의 근거는 `보고/T242_*.md` §0-ⓐ.
  //   ⚠`갈래` 넷: 공개 · 안문(`internal-door`) · 본인(자격증명을 들고 온다) · 투영(바깥엔 줄여서 준다).
  //     `판정` 넷: `공개뜻` · `닫힘` · `쓰기남음`/`읽힘남음`(바깥에서 남의 것이 바뀌거나 읽힌다) · `회부2`/`회부9`.
  //     ⚠판정 값에 이모지를 쓰지 않는다 — `test-harness-lint` ②(판정 자리에 이모지 0).
  say('\n[⑧ 라우트 전수표 파수꾼 — T242]');
  {
    //   ★★[T290] 표와 뽑기는 **정본 한 벌**(`scripts/lib-routes.js`)에서 읽는다 — `test-doors` 가 같은 표를 쓴다.
    //     표를 두 벌 두면 문이 하나 늘 때 한 벌만 고쳐져 조용히 갈린다(사본 0).
    const LR = require(path.join(ROOT, 'scripts', 'lib-routes'));
    const ROUTES = LR.ROUTES;

    // ── 기계로 뽑는다(손 목록 0) ───────────────────────────────────────────
    //   central·zone 은 `http.createServer` 한 덩이라 `if (req.url … && req.method …)` 가 곧 라우트다.
    //   dispatcher 는 express 라 `app.get/post/…` 다. 두 문법 **둘뿐**이고, 셋째가 생기면 아래가 못 본다
    //   — 그래서 `줄수 하한` 을 같이 건다(뽑기가 조용히 0 이 되면 이 절 전체가 자명 통과한다).
    const extractRoutes = LR.extractRoutes;
    const found = extractRoutes();
    ok(found.length >= 55, `⑧ ★전제 — 코드에서 라우트를 실제로 뽑았다(${found.length}개). 0·소수면 아래가 전부 자명 통과다`);

    const tableKeys = Object.keys(ROUTES);
    const foundKeys = found.map((r) => r.key);
    const 표에없음 = foundKeys.filter((k) => !ROUTES[k]);
    const 코드에없음 = tableKeys.filter((k) => !foundKeys.includes(k));
    ok(표에없음.length === 0, '⑧ ★★코드에 있는데 **표에 없는** 라우트 0 — 새 문이 생기면 여기가 빨강이다 · ' + (표에없음.join(' · ') || '없음'));
    ok(코드에없음.length === 0, '⑧ 표에 있는데 **코드에 없는** 라우트 0(지워진 문이 표에 남아 있지 않다) · ' + (코드에없음.join(' · ') || '없음'));

    // ★자명 통과 금지 — 없는 라우트를 하나 끼워 넣어 **대조가 실제로 문는지** 본다.
    const 가짜 = 'central POST =/__t242_없는_문__';
    const 물었나 = [...foundKeys, 가짜].filter((k) => !ROUTES[k]);
    ok(물었나.length === 1 && 물었나[0] === 가짜,
      '⑧ ★자명 통과 금지 — 없는 라우트를 끼우면 대조가 **문다**(대조가 늘 통과하는 코드가 아니다) · ' + 물었나.join(' · '));

    // 표의 `안문` 판정이 **코드에 실재하나** — 그 줄 뒤 3줄 안에 `isInternal` 이 있어야 한다.
    const 안문틀림 = [];
    for (const r of found) {
      const 갈래 = (ROUTES[r.key] || [])[0];
      if (갈래 !== '안문') continue;
      const lines = fs.readFileSync(path.join(ROOT, 'server', r.file), 'utf8').split('\n');
      const 창 = lines.slice(r.line - 1, r.line + 8).join('\n');
      if (!/isInternal/.test(창)) 안문틀림.push(r.key);
    }
    ok(안문틀림.length === 0, '⑧ ★표가 `안문` 이라 적은 라우트는 **코드에도 `isInternal` 이 붙어 있다**(표만 고치고 문을 안 닫는 일이 없다) · ' + (안문틀림.join(' · ') || '없음'));

    // 표의 `안문` 이 **바깥에서 실제로 안 열린다** — 표가 아니라 서버에 묻는다.
    const 안문실측 = [];
    for (const r of found) {
      if (((ROUTES[r.key] || [])[0]) !== '안문') continue;
      const port = r.key.startsWith('zone') ? ZPORT : CPORT;
      const p = r.key.split(' ')[2].slice(1);
      const meth = r.key.split(' ')[1].split('|')[0];
      let st = 0;
      try {
        const res = await fetch(`http://localhost:${port}${p}`, meth === 'GET'
          ? {} : { method: meth, headers: { 'Content-Type': 'application/json' }, body: '{}' });
        st = res.status;
      } catch (e) { st = 0; }
      안문실측.push([p, st]);
    }
    ok(안문실측.length >= 15 && 안문실측.every(([, st]) => st === 404 || st === 401),
      '⑧ ★★표가 `안문` 이라 적은 ' + 안문실측.length + ' 문이 **바깥에서 전부 404·401**(표의 ✗ 가 참인지 서버에 물었다) · ' + 안문실측.map(([p, st]) => p + ':' + st).join(' '));

    // 셈 — 답 한 줄의 근거(사람이 세지 않는다)
    const cnt = (f) => tableKeys.filter(f).length;
    say(`  · 라우트 ${found.length} · 공개 ${cnt((k) => ROUTES[k][0] === '공개')} · 안문 ${cnt((k) => ROUTES[k][0] === '안문')}`
      + ` · 본인 ${cnt((k) => ROUTES[k][0] === '본인')} · 투영 ${cnt((k) => ROUTES[k][0] === '투영')}`
      + ` · 남음 ${cnt((k) => ROUTES[k][1].endsWith('남음') || ROUTES[k][1].startsWith('회부'))}`
      + ` (쓰기 ${cnt((k) => ROUTES[k][1] === '쓰기남음')} · 읽힘 ${cnt((k) => ROUTES[k][1] === '읽힘남음')}`
      + ` · 회부됨 ${cnt((k) => ROUTES[k][1].startsWith('회부'))})`);
  }

  // ══ ⑨ ★★[T245] **남은 스물셋** — 두 문법으로 닫았다(안 문 · 존 경유 · 투영) ══════
  //   T242 §0-ⓐ 가 센 ⚠ 25 중 #2·#9 를 뺀 23 이다. 고치기 전 실측(보고 T245 §0-ⓐ):
  //   남의 이름으로 벗을 청하고 끊고 · 남을 길드장으로 만들고 · 남의 금고를 채우고 · 남의 명성을 올리고 ·
  //   남을 길드에 넣고 · **접속 중인 사람을 끊고 때렸다** — 전부 `200`.
  //   ★새 인증 0 — 존만 부르던 것은 안 문, 클라가 부르던 넷은 존 경유(ws 접속이 본인 · 족보 179).
  say('\n[⑨ 남은 스물셋 — T245]');
  {
    const OUT9 = {}, IN9 = { 'x-zone-secret': SECRET };
    const pj = async (port, path2, body, hdr) => {
      try {
        const r = await fetch(`http://localhost:${port}${path2}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || {}), body: JSON.stringify(body) });
        let d; try { d = await r.json(); } catch (e) { d = null; } return { s: r.status, d };
      } catch (e) { return { s: 0, d: null }; }
    };
    const gj = async (port, path2, hdr) => {
      try { const r = await fetch(`http://localhost:${port}${path2}`, { headers: hdr || {} }); let d; try { d = await r.json(); } catch (e) { d = null; } return { s: r.status, d }; }
      catch (e) { return { s: 0, d: null }; }
    };
    // ── 전제 — 피해자를 **안 문으로** 세운다(그 길이 곧 존이 쓰는 길이다) ──
    await pj(CPORT, '/auth', { username: 't245vic', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 }, IN9);
    await pj(CPORT, '/auth', { username: 't245oth', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 }, IN9);
    const tv9 = await pj(CPORT, '/tribe/create', { player_id: 't245vic', name: 'T245피해길드' }, IN9);
    const TID9 = tv9.d && tv9.d.tribe_id;
    await pj(CPORT, '/tribe/intro', { player_id: 't245vic', intro: '원래 소개문' }, IN9);
    await pj(CPORT, '/tribe/treasury', { tribe_id: TID9, delta: { wood: 7 } }, IN9);
    ok(!!TID9, '⑨ 전제: 피해자의 길드가 **안 문으로** 실제로 섰다(아래가 자명 통과가 아니다) · tribe_id ' + TID9);

    // ── ⓐ 바깥에서 스물셋을 남의 이름으로 두드린다 ──────────────────────────
    const 바깥 = [];
    const P = async (n, port, path2, body) => 바깥.push([n, (await pj(port, path2, body, OUT9)).s]);
    const G = async (n, port, path2) => 바깥.push([n, (await gj(port, path2, OUT9)).s]);
    await P('friend/req', CPORT, '/friend/req', { player_id: 't245vic', name: 't245oth' });
    await P('friend/del', CPORT, '/friend/del', { player_id: 't245vic', name: 't245oth' });
    await P('tribe/add_vp', CPORT, '/tribe/add_vp', { tribe_id: TID9, amount: 99, reason: '바깥' });
    await P('tribe/treasury', CPORT, '/tribe/treasury', { tribe_id: TID9, delta: { wood: 999 } });
    await P('tribe/npc_upsert', CPORT, '/tribe/npc_upsert', { name: '바깥이만든NPC', tier: 'strategic' });
    await P('tribe/invite', CPORT, '/tribe/invite', { player_id: 't245vic', name: 't245oth' });
    await P('tribe/invite_accept', CPORT, '/tribe/invite_accept', { player_id: 't245oth', tribe_id: TID9 });
    await P('tribe/granary', CPORT, '/tribe/granary', { tribe_id: TID9 });
    await P('tribe/granary_set', CPORT, '/tribe/granary_set', { player_id: 't245vic', open: false });
    await P('tribe/mode', CPORT, '/tribe/mode', { player_id: 't245vic', mode: 'invite' });
    await P('tribe/intro', CPORT, '/tribe/intro', { player_id: 't245vic', intro: '바깥이 쓴 소개문' });
    await P('tribe/create', CPORT, '/tribe/create', { player_id: 't245oth', name: '바깥이만든길드' });
    await P('tribe/join', CPORT, '/tribe/join', { player_id: 't245oth', tribe_id: TID9 });
    await G('market/orders', CPORT, '/market/orders');
    await G('tribe/<id>', CPORT, '/tribe/' + TID9);
    await G('perf', ZPORT, '/perf');
    await G('metrics', ZPORT, '/metrics');
    ok(바깥.length === 17 && 바깥.every(([, st]) => st === 404),
      '⑨ⓐ ★★열일곱이 **바깥에서 404**(문이 있는지도 안 알린다) · ' + 바깥.map(([n, st]) => n + ':' + st).join(' '));

    // ── ⓑ ★자명 통과 금지 — **아무것도 안 바뀌었다** ─────────────────────────
    const tAfter = await gj(CPORT, '/tribe/' + TID9, IN9);
    const t9 = tAfter.d && tAfter.d.tribe;
    ok(!!t9 && String(t9.intro || '') === '원래 소개문',
      '⑨ⓑ ★소개문이 **그대로**다(고치기 전엔 바깥 글로 바뀌었다) · ' + JSON.stringify(t9 && t9.intro));
    ok(!!tAfter.d && JSON.stringify(tAfter.d.treasury || {}) === '{"wood":7}',
      '⑨ⓑ2 ★금고가 **그대로**다(고치기 전엔 wood 999 가 들어갔다) · ' + JSON.stringify(tAfter.d && tAfter.d.treasury));
    ok(!!t9 && (t9.vp | 0) === 0, '⑨ⓑ3 ★명성이 **그대로 0**이다(고치기 전엔 77 이 올랐다) · vp ' + (t9 && t9.vp));
    ok(!!t9 && (t9.granary_open == null || !!t9.granary_open) && String(t9.join_mode || 'open') === 'open',
      '⑨ⓑ4 ★곳간·가입 모드가 **그대로**다 · 곳간 ' + (t9 && t9.granary_open) + ' · 모드 ' + (t9 && t9.join_mode));
    const mem9 = (tAfter.d && tAfter.d.members) || [];
    ok(mem9.length === 1 && mem9[0].player_id === 't245vic',
      '⑨ⓑ5 ★길드원이 **한 사람 그대로**다(고치기 전엔 남이 들어왔다) · ' + mem9.map((m) => m.player_id).join(','));
    const pend9 = await pj(CPORT, '/friend/pending', { player_id: 't245oth' }, IN9);
    ok(!!(pend9.d && Array.isArray(pend9.d.requests) && pend9.d.requests.length === 0),
      '⑨ⓑ6 ★밀린 벗 요청이 **0**이다(고치기 전엔 피해자 이름으로 꽂혔다) · ' + JSON.stringify(pend9.d && pend9.d.requests));
    const allT9 = await gj(CPORT, '/tribes', IN9);
    ok(!((allT9.d && allT9.d.tribes) || []).some((t) => /바깥이만든/.test(String(t.name))),
      '⑨ⓑ7 ★바깥이 만든 길드가 **없다**(`/tribe/create`·`/tribe/npc_upsert` 둘 다) · 길드 ' + ((allT9.d && allT9.d.tribes) || []).length + '개');

    // ── ⓒ `/tribes` 는 **투영**이다 — 공개가 뜻이되 남의 열쇠는 안 준다 ──────
    const pubT = await gj(CPORT, '/tribes', OUT9);
    const pubRow = ((pubT.d && pubT.d.tribes) || [])[0];
    ok(pubT.s === 200 && !!pubRow, '⑨ⓒ `/tribes` 는 **바깥에서도 산다**(가입하려면 명부가 보여야 한다) · ' + ((pubT.d && pubT.d.tribes) || []).length + '개');
    ok(!!pubRow && pubRow.leader_id === undefined && pubRow.treasury_json === undefined && pubRow.vp_updated_at === undefined,
      '⑨ⓒ2 ★★그런데 `leader_id`·`treasury_json` 은 **없다**(투영 · T217 문법) · 칸 ' + (pubRow ? Object.keys(pubRow).join(',') : ''));
    ok(!!pubRow && pubRow.name !== undefined && pubRow.member_count !== undefined && pubRow.vp !== undefined,
      '⑨ⓒ3 패널이 그리는 칸(이름·인원·명성)은 **그대로 있다** — 투영이 화면을 깨지 않는다');
    const inRow = ((allT9.d && allT9.d.tribes) || [])[0];
    ok(!!inRow && inRow.leader_id !== undefined && inRow.treasury_json !== undefined,
      '⑨ⓒ4 ★안 문에서는 **전부 준다**(자명 통과 금지 — 투영이 늘 비어 있는 게 아니다)');

    // ── ⓓ 존↔존 다섯 — 바깥에서 못 두드린다 · **접속자가 멀쩡하다** ─────────
    const B = await connectWs('name=%ED%94%BC%ED%95%B4%EC%9E%90T245');
    ok(!!B.welcome, '⑨ⓓ 전제: 사람 하나가 실제로 존에 붙어 있다(아래가 자명 통과가 아니다)');
    const bpid = B.welcome.playerId;
    await sleep(800);
    B.msgs.length = 0;
    const zOut = [];
    zOut.push(['ghost_sync', (await pj(ZPORT, '/ghost_sync', { srcZone: '가짜존', players: [{ playerId: '유령', ax: 0, ay: 0, name: '유령' }], buildings: [] }, OUT9)).s]);
    zOut.push(['cross_damage', (await pj(ZPORT, '/cross_damage', { targetId: bpid, dmg: 55, attackerId: '아무도아님' }, OUT9)).s]);
    zOut.push(['handoff_prepare', (await pj(ZPORT, '/handoff_prepare', { token: 'a'.repeat(32), name: '위조', x: 0, y: 0 }, OUT9)).s]);
    zOut.push(['kick_player', (await pj(ZPORT, '/kick_player', { player_id: bpid }, OUT9)).s]);
    zOut.push(['handoff_ack', (await pj(ZPORT, '/handoff_ack', { token: 'b'.repeat(32) }, OUT9)).s]);
    await sleep(1200);
    ok(zOut.every(([, st]) => st === 404), '⑨ⓓ2 ★★존↔존 다섯이 **바깥에서 404** · ' + zOut.map(([n, st]) => n + ':' + st).join(' '));
    const hit = B.msgs.filter((m) => m.type === 'hp_changed' || m.type === 'kicked');
    ok(hit.length === 0 && B.ws.readyState === 1,
      '⑨ⓓ3 ★★그리고 **그 사람이 멀쩡하다** — 안 맞았고 안 끊겼다(고치기 전엔 hp 100→45 · 소켓 CLOSED) · 피격·강퇴 ' + hit.length + '건 · 소켓 ' + B.ws.readyState);
    await closeWs(B);

    // ── ⓔ 안 문(= 존이 대신 부르는 그 길)은 **산다** ────────────────────────
    const inLive = [];
    inLive.push(['tribe/intro', (await pj(CPORT, '/tribe/intro', { player_id: 't245vic', intro: '존이 쓴 소개문' }, IN9))]);
    inLive.push(['tribe/join', (await pj(CPORT, '/tribe/join', { player_id: 't245oth', tribe_id: TID9 }, IN9))]);
    inLive.push(['market/orders', (await gj(CPORT, '/market/orders', IN9))]);
    inLive.push(['tribe/<id>', (await gj(CPORT, '/tribe/' + TID9, IN9))]);
    ok(inLive.every(([, r]) => r.s === 200), '⑨ⓔ ★안 문에서는 **넷 다 산다** — 존이 제 신원을 붙여 부르는 길이 이것이다 · '
      + inLive.map(([n, r]) => n + ':' + r.s).join(' '));
    const t9b = await gj(CPORT, '/tribe/' + TID9, IN9);
    ok(String(((t9b.d && t9b.d.tribe) || {}).intro || '') === '존이 쓴 소개문' && ((t9b.d && t9b.d.members) || []).length === 2,
      '⑨ⓔ2 ★자명 통과 금지 — 안 문으로 부른 것은 **실제로 바뀌었다**(소개문·길드원 2) · '
      + JSON.stringify(((t9b.d && t9b.d.tribe) || {}).intro) + ' · 길드원 ' + ((t9b.d && t9b.d.members) || []).length);
  }

  shutdown();
  say(`\n=== 게스트 영속 신원 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
