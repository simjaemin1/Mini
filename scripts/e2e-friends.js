#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-friends.js — 친구 · 함께 도착 (T115) ===========================
//
// ★[재민 확정 2026-09-05 · T115] 대상: central `friends` 표 · `/친구` 명령 ·
//   `startInfo.friendsHere` · 이름표 `fr` 1비트.
//
// ★★이 하네스가 **브라우저를 안 띄우는 이유** — 재는 것이 그림이 아니라 **계약**이라서다.
//   ① 친구는 **둘**이 필요하고, 이 컨테이너(2코어)에서 크로미움 두 판은 붙는 데만 몇 분이 든다.
//   ② 이름표 표지의 진짜 물음은 "서버가 보는 사람 기준으로 1비트를 보내는가"이고, 그건 **틱 페이로드**에
//      있다. 픽셀로 재면 폰트·카메라·시야가 끼어들어 무엇이 틀렸는지 못 가른다.
//   ⇒ 계약은 ws 로 재고, "그 비트가 낱말이 되는가"는 **소스 검사**로 못 박는다(⑦).
//     ⚠이건 절충이지 승리가 아니다 — 실클라 눈으로 본 표지는 여전히 안 쟀다(보고에 적었다).
//
// 실행: node scripts/e2e-friends.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-fr-central-${process.pid}.db`, ZDB = `/tmp/e2e-fr-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
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

// ── ws 손님 하나 ─────────────────────────────────────────────────────────────
//   ★심장박동을 붙인다 — zone 은 30초간 조용한 접속을 끊는다(족보: T89 가 이 자리에서 물렸다).
function connect(username, password, startVid) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username, password, name: username, color: '#5a9ae0' });
    if (startVid != null) q.set('start_vid', String(startVid));
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const C = { ws, username, pid: null, playerId: null, notices: [], others: new Map(), closed: false };
    const to = setTimeout(() => reject(new Error(`${username} 접속 시간초과`)), 30000);
    ws.on('message', (raw) => {
      let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') { C.pid = m.pid; C.playerId = m.playerId; clearTimeout(to); resolve(C); }
      else if (m.type === 'notice') C.notices.push(String(m.text || ''));
      else if (m.type === 'tick' && Array.isArray(m.players)) {
        for (const e of m.players) {
          const prev = C.others.get(e.pid) || {};
          C.others.set(e.pid, Object.assign({}, prev, e,
            { name: e.name !== undefined ? e.name : prev.name, fr: e.fr !== undefined ? e.fr : prev.fr }));
        }
      }
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { C.closed = true; });
    C.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const say = (C, text) => { try { C.ws.send(JSON.stringify({ type: 'chat', text })); } catch (e) {} };
const close = (C) => { try { clearInterval(C.beat); C.ws.close(); } catch (e) {} };
const seen = (C, pid) => C.others.get(pid) || null;

(async () => {
  console.log('\n=== 친구 · 함께 도착 (T115) ===\n');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: '2000',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), '⓪ central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), '⓪ zone 기동');

  // 시작 화면이 마을을 알 때까지(도착 지점을 배경에서 굽는다)
  let info = null;
  for (let i = 0; i < 60; i++) { info = await jget(`http://localhost:${ZPORT}/startinfo`); if (info && info.ok && info.villages && info.villages.length) break; await sleep(1000); }
  ok(!!(info && info.ok && info.villages.length), '⓪ 시작 화면이 마을을 안다', info ? `${info.villages.length}곳` : 'X');
  // ★도착 지점이 **실제로 구워진** 마을만 고른다 — 없으면 `arriveFor` 가 추천으로 접어
  //   둘이 같은 마을에서 시작하고, 그러면 ④(함께 도착)가 무엇을 재는지 알 수 없게 된다.
  const arrivable = info.villages.filter((v) => v.arrive);
  ok(arrivable.length >= 2, '⓪ 전제 — 도착 지점이 구워진 마을이 둘 이상이다', `${arrivable.length}/${info.villages.length}`);
  const VID_A = arrivable[0].vid, VID_B = arrivable[1].vid;

  const A = await connect('alice', 'pw1', VID_A);
  const B = await connect('bob', 'pw2', VID_B);
  const C3 = await connect('carol', 'pw3', VID_A);
  ok(!!(A.playerId && B.playerId && A.playerId !== B.playerId), '⓪ 셋이 다른 신원으로 들어왔다',
    `${A.playerId} / ${B.playerId} / ${C3.playerId}`);
  await sleep(1500);

  const dbg = async (pid) => (await jget(`http://localhost:${ZPORT}/friendsdbg?pid=${encodeURIComponent(pid)}`)) || {};
  const nFriends = async (pid) => { const d = await dbg(pid); return d.me && d.me.ok ? d.me.n : -1; };

  // ── ① 한쪽만 청하면 **아직 친구가 아니다** ──────────────────────────────
  A.notices.length = 0;
  say(A, '/친구 bob');
  await sleep(1200);
  ok(A.notices.some((t) => /청했다/.test(t)), '① 청했다는 말을 들었다', JSON.stringify(A.notices.slice(-1)));
  say(A, '/친구'); await sleep(1200);
  ok(await nFriends(A.playerId) === 0, '① ★한쪽만 청한 것은 **아직 친구가 아니다**', await nFriends(A.playerId));
  ok(B.notices.some((t) => /벗이 되자고 청했다/.test(t)), '①b 상대도 그 사실을 듣는다(접속 중이라면)');
  // ★자명 통과 금지 — 같은 말을 두 번 해도 성립하지 않는다(내가 두 번 부른 건 수락이 아니다)
  A.notices.length = 0; say(A, '/친구 bob'); await sleep(1000);
  ok(A.notices.some((t) => /이미 청해/.test(t)), '①c ★★같은 사람이 두 번 청해도 **성립하지 않는다**', JSON.stringify(A.notices.slice(-1)));
  ok(await nFriends(A.playerId) === 0, '①d 그래서 아직 0 명이다');

  // ── ② 상대가 같은 말을 하면 **그 자리에서 성립** ────────────────────────
  B.notices.length = 0;
  say(B, '/친구 alice');
  await sleep(1500);
  ok(B.notices.some((t) => /벗이 되었다/.test(t)), '② ★서로 청하면 그 자리에서 벗이 된다', JSON.stringify(B.notices.slice(-1)));
  say(A, '/친구'); say(B, '/친구'); await sleep(1200);
  ok(await nFriends(A.playerId) === 1, '②b alice 쪽에서 1명', await nFriends(A.playerId));
  ok(await nFriends(B.playerId) === 1, '②c bob 쪽에서도 1명 — **쌍은 하나**다', await nFriends(B.playerId));

  // ── ③ 이름표 1비트 — **보는 사람 기준** ─────────────────────────────────
  await sleep(2500);
  const aSeesB = seen(A, B.pid), bSeesA = seen(B, A.pid), aSeesC = seen(A, C3.pid), cSeesA = seen(C3, A.pid);
  ok(!!aSeesB && !!aSeesC, '③ 전제 — alice 의 시야에 bob 과 carol 이 **둘 다** 있다(없으면 아래가 자명 통과다)',
    `bob ${!!aSeesB} · carol ${!!aSeesC}`);
  ok(!!aSeesB && aSeesB.fr === 1, '③ ★alice 가 보는 bob 에게 벗 표지가 붙는다', aSeesB && aSeesB.fr);
  ok(!!bSeesA && bSeesA.fr === 1, '③b 반대쪽도 마찬가지다', bSeesA && bSeesA.fr);
  ok(!!aSeesC && !aSeesC.fr, '③c ★★자명 통과 금지 — 벗이 아닌 carol 에겐 **안 붙는다**', aSeesC && aSeesC.fr);
  ok(!!cSeesA && !cSeesA.fr, '③d ★★남의 쌍은 남의 것이다 — carol 이 보는 alice 에도 안 붙는다', cSeesA && cSeesA.fr);

  // ── ④ 함께 도착 — 시작 화면이 **그 마을을 처음 고른 벗**을 센다 ──────────
  {   // ★0 이 나오면 "친구가 없나 · vid 를 모르나 · 이름을 못 찾나" 를 갈라야 한다 — 셋 다 찍는다.
    const cen = await jget(`http://localhost:${CPORT}/friends/alice?by=name`);
    const dA = await dbg(A.playerId), dB = await dbg(B.playerId);
    console.log(`     [진단] central(이름 alice) ${JSON.stringify(cen)} · alice 시작마을 ${dA.myVid} · bob 시작마을 ${dB.myVid} · 벗들 vid ${JSON.stringify(dA.me && dA.me.vids)}`);
    ok(!!(cen && cen.friends && cen.friends.length === 1), '④ 전제 — central 이 **이름으로도** 벗을 안다(id 만 준다)', JSON.stringify(cen));
    ok(dB.myVid === VID_B, '④ 전제 — bob 의 **처음 고른 마을**이 실제로 적혔다', `${dB.myVid} vs ${VID_B}`);
  }
  // ★첫 물음은 **아직 모른다** — 서버가 요청 경로에서 central 을 안 기다린다(로비가 멎지 않게).
  //   두 번째 물음부터 답한다. 로비도 같은 이유로 한 번 더 묻는다(`70-lobby.js onbFriendRetried`).
  let asAlice = null;
  for (let i = 0; i < 8; i++) {
    asAlice = await jget(`http://localhost:${ZPORT}/startinfo?as=alice`);
    if (asAlice && asAlice.villages.some((v) => (v.friendsHere | 0) > 0)) break;
    await sleep(700);
  }
  const rowB = asAlice && asAlice.villages.find((v) => v.vid === VID_B);
  const rowA = asAlice && asAlice.villages.find((v) => v.vid === VID_A);
  ok(!!rowB && (rowB.friendsHere | 0) === 1, '④ ★벗이 처음 고른 마을에 `friendsHere 1`',
    `vid ${VID_B} · ${rowB && rowB.friendsHere}`);
  ok(!!rowA && (rowA.friendsHere | 0) === 0, '④b ★자명 통과 금지 — 벗이 없는 마을은 0(전 마을에 붙는 표지가 아니다)',
    `vid ${VID_A} · ${rowA && rowA.friendsHere}`);
  const asNobody = await jget(`http://localhost:${ZPORT}/startinfo?as=nosuchperson`);
  ok(!!asNobody && asNobody.ok && asNobody.villages.every((v) => !(v.friendsHere | 0)),
    '④c 없는 이름으로 물어도 **시작 화면은 그대로** 뜬다(막지 않는다 · 표지만 0)');
  const asNone = await jget(`http://localhost:${ZPORT}/startinfo`);
  ok(!!asNone && asNone.ok && asNone.villages.every((v) => (v.friendsHere | 0) === 0),
    '④d 이름을 안 주면 0 — 종전 시작 화면과 **같은 답**이다');

  // ── ⑤ 끊기 — 표지가 **지워진다** ────────────────────────────────────────
  A.notices.length = 0;
  say(A, '/친구 끊기 bob');
  await sleep(2500);
  ok(A.notices.some((t) => /끊었다/.test(t)), '⑤ 끊었다는 말을 들었다', JSON.stringify(A.notices.slice(-1)));
  ok(await nFriends(A.playerId) === 0 && await nFriends(B.playerId) === 0, '⑤b 양쪽 다 0 명이 된다');
  await sleep(2500);
  const aSeesB2 = seen(A, B.pid);
  ok(!!aSeesB2 && aSeesB2.fr === 0, '⑤c ★★표지가 **실제로 지워진다** — 1 만 보내면 옛 값이 남는다(승계 규약의 함정)',
    aSeesB2 && aSeesB2.fr);

  // ── ⑥ central 을 못 물어봐도 **친구가 세계를 막지 않는다** ──────────────
  //   ⚠정직 보고: **등록 계정의 로그인은 원래 central 이 권위**다(계정 표가 거기 있다). 그건 이 카드가
  //     만든 제약이 아니고 고칠 자리도 아니다. 여기서 재는 것은 **친구가 새 벽을 세웠는가**이다:
  //     이미 들어와 있는 사람이 계속 놀 수 있고, 명령은 말로 실패하고, 시작 화면은 그대로 뜨는가.
  for (const x of procs) if (x.name === 'central') { try { x.p.kill('SIGKILL'); } catch (e) {} }
  await sleep(1500);
  const tickBefore = A.others.size;
  A.notices.length = 0;
  say(A, '/친구 bob');
  await sleep(7000);                       // central 클라 타임아웃(5초)보다 길게 기다린다
  ok(!A.closed, '⑥ ★central 이 죽어도 **놀던 사람은 안 끊긴다**', `열림 ${!A.closed}`);
  ok(A.notices.some((t) => /못 청했다/.test(t)), '⑥b ★조용히 실패하지 않는다 — 말로 알려 준다',
    JSON.stringify(A.notices.slice(-1)));
  ok(A.others.size >= 1 && tickBefore >= 1, '⑥c 틱이 계속 온다(세계가 멎지 않았다)', `${tickBefore} → ${A.others.size}`);
  const infoDown = await jget(`http://localhost:${ZPORT}/startinfo?as=alice`);
  ok(!!(infoDown && infoDown.ok), '⑥d central 이 죽어도 **시작 화면은 뜬다**');

  // ── ⑦ 소스 — 1비트가 낱말이 되고, 로비는 다시 세지 않는다 ───────────────
  {
    const rl = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
    const net = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    const lob = fs.readFileSync(path.join(ROOT, 'public', 'client', '70-lobby.js'), 'utf8');
    const cen = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    ok(/o\.fr \? '벗 ' :/.test(rl), '⑦ 이름표 — 서버 1비트가 **낱말 하나**가 된다');
    ok(!/[\u{1F300}-\u{1FAFF}]/u.test((rl.match(/o\.fr \? [^\n]*/) || [''])[0]), '⑦b 그 낱말에 이모지가 **없다**(화면 규칙 B)');
    ok(/fr: pp\.fr !== undefined \? pp\.fr : prev\?\.fr/.test(net), '⑦c 클라는 `fr` 을 **받아서 승계**할 뿐 스스로 안 정한다');
    //   ★주석은 걷어내고 본다 — 설명문이 증거로 오독되면 하네스가 없는 결함을 보고한다(족보 ㊻).
    const codeOnly = (x) => x.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    ok(!/isFriend\(|friendsOf\(|friendRequest\(/.test(codeOnly(rl) + codeOnly(net) + codeOnly(lob)),
      '⑦d ★★클라에 친구 **판정이 없다** — 누가 누구와 친구인지 클라는 모른다');
    ok(/v\.friendsHere/.test(lob) && !/friendsOf|isFriend|friends\.length/.test(lob), '⑦e 로비는 서버가 센 수를 **그대로** 쓴다(재계산 0)');
    ok((cen.match(/CREATE TABLE IF NOT EXISTS friends/g) || []).length === 1, '⑦f central 에 친구 표는 **하나**다');
    ok(!/ALTER TABLE players ADD COLUMN friend/.test(cen), '⑦g 기존 표에 새 컬럼 **0**');
    // ★자명 통과 금지 — 검사가 실제로 그 파일을 읽었는지
    ok(rl.length > 1000 && lob.length > 1000 && cen.length > 1000, '⑦h (자명 통과 방지) 네 파일을 실제로 읽었다');
  }

  close(A); close(B); close(C3);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
