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
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(500); }
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
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',   // 마을 층은 이 검사의 대상이 아니다(e2e-village 가 잰다)
    E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

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
    ok((await postJ(CPORT, '/check_username', { username: 'chon1' })).taken === false, '★검사 전제 — 승계 전 그 이름은 비어 있다');
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
    ok((await postJ(CPORT, '/check_username', { username: 'chon1' })).taken === true,
      '★승계된 이름이 **중복 검사에 잡힌다**(player_id ≠ name 이라 PK 조회만 하면 놓친다)');
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
    const cl = fs.readFileSync(path.join(ROOT, 'public', 'client.js'), 'utf8');
    ok(!/cl\.ownerPid !== myUsername/.test(cl), '★클라 사유지 목록이 `myUsername` 대조를 안 쓴다(게스트는 그게 빈 문자열이라 제 사유지가 남의 것으로 보였다)');
    ok(/msg\.playerId/.test(cl) && /myPlayerId/.test(cl), '클라가 welcome 의 playerId 를 받아 소유 대조에 쓴다');
    ok(!/showNotice\([^)]*[gG]uestToken|myGuestToken[^;]*innerHTML|innerHTML[^;]*myGuestToken/.test(cl), '★클라가 토큰을 화면·알림에 그리지 않는다');
  }

  shutdown();
  say(`\n=== 게스트 영속 신원 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
