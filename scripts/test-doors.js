#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-doors.js — 문 62 를 서버 띄워 바깥/안에서 전수 대조 =========================
//
// ★★[T290 2026-09-14] **배포 뒤 절을 사람이 아니라 하네스가 돈다.**
//   T217→T245 가 넉 장에 걸쳐 문 39 를 닫았는데, 그걸 지키는 자가 문서(`인계/N-네트워크.md` N-배포뒤)와
//   파수꾼의 **표↔코드 대조**뿐이었다. 파수꾼은 *"표가 코드와 같은가"* 를 묻고, 이 하네스는
//   *"그래서 실제로 그렇게 도는가"* 를 묻는다 — **서버를 띄워 바깥에서 두드린다.**
//
// ⚠표는 **정본 한 벌**(`scripts/lib-routes.js`)에서 `require` 한다(문서에서 베끼지 않는다 · 사본 0).
//   ⇒ 문이 하나 늘면 파수꾼과 이 하네스가 **같이** 빨강이고, 표를 고쳐야 둘 다 지나간다.
//
// 재는 것 넷
//   ⓐ 62 전수 — 갈래별 기대: 공개 200 · 안문 404/401 · 투영 = **칸 목록 일치** · 본인 = 자격증명 없이 안 열림
//   ⓑ 안 문은 **존 경유로 살아 있나**(T245 §0-ⓔ 문법 — 열쇠를 들고 부르면 200)
//   ⓒ `CENTRAL_SECRET` 두 팔 — 열쇠 판에서 존↔존 다섯이 열쇠로 200 · 열쇠 없이 404
//   ⓓ 파수꾼 재집계 — T245 의 `62 · 16 · 40 · 3 · 3 · 2` 와 일치
//   ★자명 통과 금지 — 안 문 하나를 **일부러 열어** 대조가 실제로 무는지 본다
//
// 실행: node scripts/test-doors.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LR = require(path.join(ROOT, 'scripts', 'lib-routes'));
const CPORT = 3310, ZPORT = 3320;
const CDB = `/tmp/doors-c-${process.pid}.db`, ZDB = `/tmp/doors-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const say = console.log;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'ignore', 'ignore'],
  });
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', shutdown);
async function waitHttp(url, tries = 120) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(400); }
  return false;
}
//   ★★**문을 숨기는 404 와 그냥 없는 404 는 다르다.** `internal-door.denyOutside` 는 몸을 정확히
//     `{"error":"not found"}` 로 적는다(문이 있는지도 안 알리는 것이 그 뜻이다). 공개 라우트가 내는 404
//     (`/economy/prices/<없는 마을>` 처럼)는 제 사정을 적는다 — 둘을 상태코드만으로 가르면 **접두 라우트를
//     빈 이름으로 두드린 것**이 "닫혔다"로 읽힌다(첫 판에서 실제로 그렇게 어긋났다 · 보고 §0-ⓐ).
const 문숨김 = (r) => r.s === 404 && r.d && r.d.error === 'not found' && Object.keys(r.d).length === 1;
//   ★바깥 = 헤더 없음. 비밀을 잡고 띄우므로 사설 주소 폴백이 안 걸린다(T217 문법 · 하네스도 되돌이라 이게 필수다).
const call = async (port, meth, p, hdr, body) => {
  const init = { method: meth, headers: Object.assign({}, hdr || {}) };
  if (meth !== 'GET') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body || {}); }
  try { const r = await fetch(`http://localhost:${port}${p}`, init); let d = null; try { d = JSON.parse(await r.text()); } catch (e) {} return { s: r.status, d }; }
  catch (e) { return { s: 0, d: null }; }
};

(async () => {
  say('\n=== 문 62 전수 — 서버를 띄워 바깥에서 두드린다 (T290) ===');
  const SECRET = 't290-doors-' + Math.random().toString(36).slice(2);
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET });
  boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT),
    CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), '⓪ central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), '⓪ zone 기동');
  const OUT = {}, IN = { 'x-zone-secret': SECRET };

  // ── 전제 — 표와 코드가 같은가(파수꾼과 **같은 표**로) ─────────────────────
  const found = LR.extractRoutes();
  const foundKeys = found.map((r) => r.key);
  const tableKeys = Object.keys(LR.ROUTES);
  ok(found.length >= 55, `⓪ ★전제 — 코드에서 라우트를 뽑았다(${found.length}개). 0·소수면 아래가 전부 자명 통과다`);
  const 표에없음 = foundKeys.filter((k) => !LR.ROUTES[k]);
  const 코드에없음 = tableKeys.filter((k) => !foundKeys.includes(k));
  ok(표에없음.length === 0 && 코드에없음.length === 0,
    '⓪ ★★표와 코드가 같다 — 문이 늘거나 줄면 여기서 먼저 빨강이다 · 표밖 ' + (표에없음.join(',') || '0') + ' · 코드밖 ' + (코드에없음.join(',') || '0'));

  // ── 픽스처 — 접두 라우트를 **진짜 이름**으로 두드리려면 그 이름이 실재해야 한다 ──
  //   ⚠`GET /player/<없는 이름>` 도 몸이 `{"error":"not found"}` 라 `denyOutside` 와 **구분이 안 된다**.
  //     빈 접두로 두드리면 "닫혔다"로 오독한다(첫 판이 그랬다) ⇒ 실재하는 이름으로 두드린다.
  await call(CPORT, 'POST', '/auth', IN, { username: 'doorsv', password: 'pw', color: '#5a9ae0', home_zone: 'hanbando', home_x: 1, home_y: 2 });
  await call(CPORT, 'POST', '/tribe/create', IN, { player_id: 'doorsv', name: '문검사길드' });
  const SAMPLE = { '/player/': 'doorsv', '/friends/': 'doorsv', '/tribe/': '1', '/economy/prices/': '농촌1' };

  // ── ⓐ 62 전수 — 갈래별 기대 ────────────────────────────────────────────
  say('\n[ⓐ 62 전수 — 바깥에서]');
  const 어긋남 = [], 안문목록 = [];
  for (const key of tableKeys) {
    const { svc, method, prefix, path: rp } = LR.parseKey(key);
    if (svc === 'dispatcher') continue;                       // 디스패처는 별 프로세스다(이 판에 안 띄운다)
    const port = svc === 'zone' ? ZPORT : CPORT;
    const url = prefix ? (rp + (SAMPLE[rp] || '')) : rp;      // 접두 라우트는 **실재하는 이름**을 붙인다
    const r = await call(port, method, url, OUT, { player_id: '아무개', tribe_id: 1, username: '아무개' });
    const 갈래 = LR.ROUTES[key][0];
    let 기대, 맞나;
    if (갈래 === '안문') { 기대 = '문숨김 404 · 또는 401'; 맞나 = (문숨김(r) || r.s === 401); 안문목록.push([key, r.s]); }
    else if (갈래 === '공개' || 갈래 === '투영') {
      //   ★문이 **있다**는 것까지가 여기서 잴 것이다. 접두 라우트를 빈 이름으로 두드리면 제 사정의 404 가
      //     나는 게 정상이고(없는 마을·없는 사람), **투영의 칸 목록**은 아래 ⓐ3 이 실물로 잰다.
      기대 = '문이 있다(문숨김 404 아님)'; 맞나 = (r.s !== 0 && !문숨김(r));
    } else {
      //   본인 — 자격증명 없이 **남의 것**이 안 열린다. `/guest` 는 **새 신원을 발급**하는 문이라 200 이 정상이고
      //   (그게 그 문의 계약이다), 재는 것은 *남의 열쇠가 딸려 나오나* 다.
      //   ⚠`/guest` 는 제 몫의 **새 행**을 돌려준다 — 그 행엔 `password_hash: null` 키가 **있다**.
      //     키 이름만 보면 그게 누출로 읽힌다(첫 판이 그랬다) ⇒ **값이 있는** 열쇠만 누출로 센다.
      기대 = '값 있는 열쇠가 안 나온다';
      const 열쇠샘 = (o) => {
        if (!o || typeof o !== 'object') return false;
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (/password_hash|password_salt/.test(k) && v) return true;
          if (v && typeof v === 'object' && 열쇠샘(v)) return true;
        }
        return false;
      };
      맞나 = (r.s !== 0 && !문숨김(r) && !열쇠샘(r.d));
    }
    if (!맞나) 어긋남.push(`${key}→${r.s}(기대 ${기대} · ${JSON.stringify(r.d || {}).slice(0, 60)})`);
  }
  ok(어긋남.length === 0, `ⓐ ★★61 문이 갈래대로 답한다(디스패처 1 은 별 프로세스라 제외) · 어긋남 ${어긋남.length}건 ` + (어긋남.join(' · ') || ''));
  ok(안문목록.length === 40 && 안문목록.every(([, s]) => s === 404 || s === 401),
    `ⓐ2 ★안 문 ${안문목록.length} 이 전부 404·401 — ` + 안문목록.map(([k, s]) => LR.parseKey(k).path + ':' + s).join(' '));

  // ── 투영 — **칸 목록이 일치하나**(줄여 주는 것이 뜻이라 늘어나면 사고다) ──
  say('\n[ⓐ3 투영 — 칸 목록]');
  {
    const got = {
      'central GET ^/player/': (await call(CPORT, 'GET', '/player/doorsv', OUT)).d,
      'central GET =/tribes': (await call(CPORT, 'GET', '/tribes', OUT)).d,
      'central GET ^/friends/': (await call(CPORT, 'GET', '/friends/doorsv', OUT)).d,
    };
    for (const [key, want] of Object.entries(LR.PROJECTION)) {
      const d = got[key];
      const row = key.includes('/player/') ? (d && d.player) : key.includes('/tribes') ? ((d && d.tribes) || [])[0] : d;
      const keys = row ? Object.keys(row).sort() : null;
      ok(!!keys && keys.join(',') === want.slice().sort().join(','),
        `ⓐ3 ${key} 바깥 칸 = 정본 기대 · 받음 [${keys ? keys.join(',') : 'X'}] · 기대 [${want.join(',')}]`);
    }
  }

  // ── ⓑ 안 문은 **존 경유로 살아 있나** ───────────────────────────────────
  say('\n[ⓑ 안 문은 살아 있다 — 존이 부르는 그 길]');
  {
    const live = [
      ['tribe/info', await call(CPORT, 'GET', '/tribe/1', IN)],
      ['market/orders', await call(CPORT, 'GET', '/market/orders', IN)],
      ['tribe/intro', await call(CPORT, 'POST', '/tribe/intro', IN, { player_id: 'doorsv', intro: '문검사' })],
      ['friend/pending', await call(CPORT, 'POST', '/friend/pending', IN, { player_id: 'doorsv' })],
      ['welcomedbg', await call(ZPORT, 'GET', '/welcomedbg', IN)],
    ];
    ok(live.every(([, r]) => r.s === 200), 'ⓑ ★안 문 다섯이 열쇠를 들면 200 — 닫은 것이 죽인 것이 아니다 · ' + live.map(([n, r]) => n + ':' + r.s).join(' '));
    const after = await call(CPORT, 'GET', '/tribe/1', IN);
    ok(!!(after.d && after.d.tribe && String(after.d.tribe.intro || '') === '문검사'),
      'ⓑ2 ★자명 통과 금지 — 안 문으로 부른 것은 **실제로 바뀌었다**(소개문) · ' + JSON.stringify(after.d && after.d.tribe && after.d.tribe.intro));
  }

  // ── ★자명 통과 금지 — 안 문 하나를 **일부러 열면** 대조가 문다 ──────────
  say('\n[자명 통과 금지 — 문을 열어 본다]');
  {
    //   표를 안 고치고 **판정만** 뒤집은 판을 만든다: 그 문의 갈래를 `공개` 로 읽으면
    //   실제 응답(404)이 "열림" 기대와 어긋나므로 위 ⓐ 와 같은 대조가 **빨강이 되어야** 한다.
    const r = await call(CPORT, 'POST', '/tribe/create', OUT, { player_id: '아무개', name: 'x' });
    //   그 문의 갈래를 `공개` 로 **잘못 적은** 판을 만들면, 위 ⓐ 와 **같은 식**이 빨강이 되어야 한다.
    const 공개로읽으면 = (r.s !== 0 && !문숨김(r));
    ok(!공개로읽으면, '★자명 통과 금지 — 안 문을 `공개` 로 적은 판을 만들면 대조가 **문다**(실제 '
      + r.s + ' · 몸 ' + JSON.stringify(r.d || {}) + ')');
    //   그리고 **반대 방향**도 문다 — 공개 문을 `안문` 으로 적으면?
    const pub = await call(CPORT, 'GET', '/zones', OUT);
    ok(!(문숨김(pub) || pub.s === 401), '★자명 통과 금지(반대) — 공개 문(`/zones`)을 `안문` 으로 적으면 문다(실제 ' + pub.s + ')');
  }

  // ── ⓒ `CENTRAL_SECRET` 두 팔 ────────────────────────────────────────────
  say('\n[ⓒ 열쇠 두 팔 — 존↔존 다섯]');
  const Z2Z = ['/ghost_sync', '/cross_damage', '/handoff_prepare', '/kick_player', '/handoff_ack'];
  {
    const outs = [], ins = [];
    for (const p of Z2Z) { outs.push([p, (await call(ZPORT, 'POST', p, OUT, { player_id: '아무개', srcZone: 'x', token: 'a'.repeat(32) })).s]); }
    for (const p of Z2Z) { ins.push([p, (await call(ZPORT, 'POST', p, IN, { player_id: '아무개', srcZone: 'x', token: 'a'.repeat(32) })).s]); }
    ok(outs.every(([, s]) => s === 404), 'ⓒ1 ★열쇠 판 — 존↔존 다섯이 **열쇠 없이 404** · ' + outs.map(([p, s]) => p + ':' + s).join(' '));
    ok(ins.every(([, s]) => s === 200), 'ⓒ2 ★★그리고 **열쇠를 들면 200** — 핸드오프 길이 살아 있다 · ' + ins.map(([p, s]) => p + ':' + s).join(' '));
  }
  //   ★둘째 팔 — **비밀 없이** 띄운 존: 사설 주소 폴백이 살아난다(T217 조건 · 지금 배포가 그 판이다).
  say('\n[ⓒ3 비밀 없는 팔 — 사설 주소 폴백]');
  {
    const ZP2 = 3321, ZDB2 = `/tmp/doors-z2-${process.pid}.db`;
    boot('zone.js', {
      PORT: String(ZP2), ZONE_ID: 'hanbando', DB_PATH: ZDB2, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT),
      ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
    });
    const up = await waitHttp(`http://localhost:${ZP2}/health`);
    ok(up, 'ⓒ3 전제 — 비밀 없는 존이 떴다(아래가 자명 통과가 아니다)');
    const loop = [];
    for (const p of Z2Z) loop.push([p, (await call(ZP2, 'POST', p, OUT, { player_id: '아무개', srcZone: 'x', token: 'a'.repeat(32) })).s]);
    ok(loop.every(([, s]) => s === 200),
      'ⓒ3 ★비밀이 없으면 **루프백(사설 주소)은 안 문**이다 — 지금 배포가 설정 0 으로 도는 근거 · ' + loop.map(([p, s]) => p + ':' + s).join(' '));
    //   ⚠그리고 `x-forwarded-for` 가 붙으면 그 판정이 **취소**된다(프록시를 앞에 두면 막힌다 — N-비밀 절).
    const xff = [];
    for (const p of Z2Z) xff.push([p, (await call(ZP2, 'POST', p, { 'x-forwarded-for': '203.0.113.7' }, { player_id: '아무개', token: 'a'.repeat(32) })).s]);
    ok(xff.every(([, s]) => s === 404),
      'ⓒ4 ★`x-forwarded-for` 가 있으면 사설 주소 판정이 **취소**된다(프록시 뒤에선 비밀이 필요하다) · ' + xff.map(([p, s]) => p + ':' + s).join(' '));
    for (const f of [ZDB2, ZDB2 + '-wal', ZDB2 + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  }

  // ── ⓓ 파수꾼 재집계 ─────────────────────────────────────────────────────
  say('\n[ⓓ 재집계]');
  {
    const c = LR.counts();
    ok(c.n === 62 && c.공개 === 16 && c.안문 === 40 && c.본인 === 3 && c.투영 === 3 && c.남음 === 2,
      `ⓓ ★T245 의 그 줄과 같다 — 라우트 ${c.n} · 공개 ${c.공개} · 안문 ${c.안문} · 본인 ${c.본인} · 투영 ${c.투영} · 남음 ${c.남음}(쓰기 ${c.쓰기남음} · 읽힘 ${c.읽힘남음} · 회부됨 ${c.회부됨})`);
  }

  shutdown();
  say(`\n=== 문 전수 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
