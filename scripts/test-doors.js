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
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

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
function boot(file, env, io) {
  // ★[T349 2026-09-21] **아이의 입을 연다.** 기동 증인이 포트가 아니라 아이가 제 `listen` 콜백에서
  //   찍는 줄이라(정본 `fixture-boot.waitUp`), stdio 가 'ignore' 면 그 줄이 이쪽에 안 온다 —
  //   이 카드가 그걸 실제로 물었다(`✗ ⓪ central 기동` 인데 나머지 62문은 전부 통과 = 세계는 떠 있었다).
  //   기본은 그대로 두고 **부르는 쪽이 필요할 때만** 연다(출력은 아무도 안 읽으니 무해하다).
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: io || ['ignore', 'ignore', 'ignore'],
  });
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', shutdown);
async function waitHttp(url, tries = 120) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(400); }
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
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }, ['ignore', 'pipe', 'pipe']);
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답(`waitHttp(/zones)`)은 증인이 아니었다 — 앞 판 central 이 포트를 쥔 채면 새 central 은
  //   `EADDRINUSE` 로 즉시 죽는데 `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다.
  //   ⚠**듣기는 여기서 시작한다**(`await` 는 아래 `ok` 자리에서) — 아이가 표식을 찍는 것은 ~120ms 뒤라
  //     그 사이 다른 `await` 를 지나면 줄을 놓친다. 띄운 **그 틱에** 귀를 붙인다.
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT),
    CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
  }, ['ignore', 'pipe', 'pipe']);   // ★[T355] 존의 **입도** 연다 — 기본이 'ignore' 라 표식이 이쪽에 안 온다
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, '⓪ central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  ok(await (await _zp).ok, '⓪ zone 기동');
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
  ok(안문목록.length === 41 && 안문목록.every(([, s]) => s === 404 || s === 401),   // ★[T363] 40 → 41(`/check_username` 이 들어왔다)
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
    const _zone2 = boot('zone.js', {
      PORT: String(ZP2), ZONE_ID: 'hanbando', DB_PATH: ZDB2, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT),
      ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
    }, ['ignore', 'pipe', 'pipe']);   // ★[T355] 둘째 존도 같다
    // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
    //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
    //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
    //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
    //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
    //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
    //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
    const _zp2 = FB.waitUp(_zone2, /zone server up on/, { name: 'zone', capMs: 300000 });
    const up = await (await _zp2).ok;
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
    // ★[T363] 남음이 **1 → 0** 이다 — `/check_username`(#48)을 안 문으로 옮겼다. 회부된 둘이 다 닫혔다.
    //   ⚠라우트 수는 **62 그대로**다(지운 게 아니라 바깥만 닫았다 · 갈래가 공개 → 안문).
    ok(c.n === 62 && c.공개 === 15 && c.안문 === 41 && c.본인 === 3 && c.투영 === 3 && c.남음 === 0 && c.회부됨 === 0,
      `ⓓ ★T245 의 그 줄 · T319·T363 이 둘을 닫았다 — 라우트 ${c.n} · 공개 ${c.공개} · 안문 ${c.안문} · 본인 ${c.본인} · 투영 ${c.투영} · 남음 ${c.남음}(쓰기 ${c.쓰기남음} · 읽힘 ${c.읽힘남음} · 회부됨 ${c.회부됨})`);
    ok(LR.ROUTES['zone GET ^/startinfo'][1] === '닫힘DEV_AS' && LR.ROUTES['central POST =/check_username'][0] === '안문',
      'ⓓ2 표가 그 둘을 그렇게 적고 있다 — `/startinfo` 는 `닫힘DEV_AS` · `/check_username` 은 **안문**(아래 ⓔ·ⓖ 가 그 말이 참인지 본다)');
  }

  // ── ⓔ [T319] `?as=` 는 **손잡이 뒤**다 — 두 팔(env 유/무) ────────────────
  //   묻는 것 하나: **열쇠 없이 이름만으로 남의 벗·소속이 나오나.**
  //   ⚠이 판의 존은 `ENABLE_VILLAGES=0` 이라 온보딩이 안 선다 — 그러면 `?as=` 를 줘도 응답이 같아
  //     **자명 통과**가 된다. 그래서 여기서는 `httpStartInfo` 가 실제로 그 칸을 보는지를
  //     **소스 계약 + 문 앞의 겹**으로 나눠 본다(세계를 안 띄우고도 무는 검사).
  say('\n[ⓔ ?as= — DEV_AS 뒤]');
  {
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const osrc = fs.readFileSync(path.join(ROOT, 'server', 'onboarding.js'), 'utf8');
    // ⓔ1 전제 — 온보딩은 **여전히** 그 칸을 읽는다(안 읽으면 아래가 자명 통과다)
    ok(/as=\(\[\^&\]\*\)/.test(osrc) && /friendVidsByName/.test(osrc) && /memberVidByName/.test(osrc),
      'ⓔ1 전제: `onboarding.httpStartInfo` 는 **그대로** `?as=` 로 벗·소속을 태운다(막은 것은 문이지 온보딩이 아니다)');
    // ⓔ2 문 앞에 겹이 서 있다 — 라우트가 `_devAsGate` 를 지난다(사본 0: 정책은 문에서 정한다)
    ok(/startsWith\('\/startinfo'\)[\s\S]{0,120}?_devAsGate\(req\)/.test(zsrc),
      'ⓔ2 라우트가 `_devAsGate(req)` 를 지난다 — `onboarding.js` 는 한 줄도 안 달라졌다');
    // ⓔ3 ★그 겹이 실제로 그 칸을 지운다 — **소스의 그 함수를 그대로** 떠서 두 팔로 부른다(사본 0).
    //   ⚠`process` 를 인자로 넘겨 env 를 이 하네스가 쥔다 — 손잡이가 **부를 때** 읽히는지까지 같이 본다
    //     (모듈 상수면 팔 하나가 안 움직인다 = 아래 ⓔ4·ⓔ5 가 같은 값을 내고 빨개진다).
    const src = (zsrc.match(/function _devAsOn\(\)[\s\S]*?\nfunction _devAsGate\(req\) \{[\s\S]*?\n\}/) || [null])[0];
    ok(!!src && src.length > 200, 'ⓔ3 전제: `_devAsGate` 를 소스에서 그대로 떠 왔다(못 뜨면 아래가 자명 통과다)');
    if (src) {
      const env = {};
      const gate = new Function('process', src + '\nreturn _devAsGate;')({ env });
      const g = (u) => gate({ url: u, method: 'GET' }).url;
      env.DEV_AS = '1';
      const 켬 = [g('/startinfo?as=%EC%9E%AC%EB%AF%BC'), g('/startinfo?as=x&z=1')];
      delete env.DEV_AS;
      const 끔 = [g('/startinfo?as=%EC%9E%AC%EB%AF%BC'), g('/startinfo?as=x&z=1'), g('/startinfo'), g('/startinfo?z=1')];
      ok(켬[0] === '/startinfo?as=%EC%9E%AC%EB%AF%BC' && 켬[1] === '/startinfo?as=x&z=1',
        'ⓔ4 ★`DEV_AS=1` 이면 그 칸이 **그대로** 간다(개발자는 여전히 쓴다) · ' + 켬.join(' '));
      ok(끔[0] === '/startinfo' && 끔[1] === '/startinfo?z=1',
        'ⓔ5 ★★손잡이가 없으면 `as` **한 칸만** 지워진다 — 다른 칸(`z=1`)은 남는다 · ' + 끔.slice(0, 2).join(' '));
      ok(끔[2] === '/startinfo' && 끔[3] === '/startinfo?z=1',
        'ⓔ6 그 칸이 없던 요청은 **한 글자도 안 달라진다**(과잉 수리 방지) · ' + 끔.slice(2).join(' '));
      ok(켬[0] !== 끔[0],
        'ⓔ6b ★자명 통과 금지 — 두 팔이 **실제로 다른 값**을 낸다(손잡이가 부를 때 읽힌다) · ' + 켬[0] + ' vs ' + 끔[0]);
    }
    // ⓔ7 ★문 자체는 **여전히 200** 이다 — 닫은 것은 칸이지 문이 아니다(시작 화면은 그대로 뜬다)
    const si = await call(ZPORT, 'GET', '/startinfo', OUT);
    const siAs = await call(ZPORT, 'GET', '/startinfo?as=doorsv', OUT);
    ok(si.s === 200 && siAs.s === 200,
      'ⓔ7 ★`/startinfo` 는 두 판 다 **200** — 공개 문 그대로다(막은 것은 한 칸) · ' + si.s + '/' + siAs.s);
  }

  // ── ⓕ [T319] `/health` 칸 둘 — 모양과 규약 ──────────────────────────────
  say('\n[ⓕ /health 칸 둘]');
  {
    const h = (await call(ZPORT, 'GET', '/health', OUT)).d || {};
    ok('villages' in h && 'tickP50Ms' in h,
      'ⓕ1 ★칸 둘이 바깥 판에 있다 — `/perf` 는 안 문이라 이 둘만 여기로 낸다 · villages=' + JSON.stringify(h.villages) + ' tickP50Ms=' + JSON.stringify(h.tickP50Ms));
    ok(h.villages === null || (Number.isInteger(h.villages) && h.villages >= 0),
      'ⓕ2 `villages` 는 정수이거나 `null` 이다 — 마을 층이 안 서면 **0 이 아니라 null**(0 은 "다 죽었다"는 거짓말이다) · ' + JSON.stringify(h.villages));
    ok(h.tickP50Ms === null || (typeof h.tickP50Ms === 'number' && h.tickP50Ms >= 0),
      'ⓕ3 `tickP50Ms` 는 수이거나 `null` · ' + JSON.stringify(h.tickP50Ms));
    // ⓕ4 ★T225 투영 규약 — **수만** 나간다. 이름·좌표·id·열쇠 0.
    const flat = JSON.stringify(h);
    ok(!/"(name|cx|cy|id|x|y|b|lon|guest_token|password_hash|salt|token|secret)"/.test(flat),
      'ⓕ4 ★★수만 나간다 — 마을 이름·좌표·id·열쇠 칸이 **한 개도** 없다(T225 투영 규약) · ' + flat.slice(0, 120));
    // ⓕ5 ★사본 0 — `/perf` 의 그 값과 **같은 함수**다(소스 계약)
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const perfUses = /tick: Object\.assign\(\{\}, _tick, \{ ms: _tickMsStats\(_rst\)/.test(zsrc);
    const healthUses = /tickP50Ms: _p50/.test(zsrc) && /_ms = _tickMsStats\(false\)/.test(zsrc);
    ok(perfUses && healthUses,
      'ⓕ5 ★★`/perf` 와 `/health` 가 **같은 함수**(`_tickMsStats`)를 부른다 — p50 을 두 벌로 짜지 않았다');
    ok(/_tickMsStats\(false\)/.test(zsrc),
      'ⓕ6 ★`/health` 는 **영점 조정을 안 한다**(`false`) — 안부를 묻는 일이 계측 창을 지우면 안 된다');
    // ⓕ6b ★표본 0 이면 `null` — `p50: 0` 은 "틱이 0ms"라는 **없는 말**이다(`/perf` 는 `n` 을 같이 주지만 여기엔 그 칸이 없다)
    ok(/_ms\.n > 0\) \? _ms\.p50 : null/.test(zsrc),
      'ⓕ6b ★표본이 0 이면 `tickP50Ms` 는 `null` 이다 — 없는 수를 말하지 않는다(`villages` 의 null 과 같은 뜻)');
    ok(/clientVillages/.test(zsrc) && /\(v\.pop \| 0\) > 0/.test(zsrc),
      'ⓕ7 ★마을 수도 정본 목록(`SimVillages.clientVillages`)에서 **센다** — 여기서 목록을 다시 만들지 않는다');
    // ⓕ9 ★★값이 **같은 수**다 — 소스 계약만이 아니라 두 문이 같은 순간에 같은 답을 낸다.
    //   `/perf` 는 안 문이라 비밀 헤더로 묻는다(그 문의 규약 그대로).
    {
      const pf = (await call(ZPORT, 'GET', '/perf', IN)).d;
      const h2 = (await call(ZPORT, 'GET', '/health', OUT)).d || {};
      const p50 = pf && pf.tick && pf.tick.ms ? pf.tick.ms.p50 : undefined;
      const n = pf && pf.tick && pf.tick.ms ? (pf.tick.ms.n | 0) : -1;
      ok(n === 0 ? h2.tickP50Ms === null : (p50 !== undefined && p50 === h2.tickP50Ms),
        'ⓕ9 ★★`/perf` tick.ms.p50 과 `/health` tickP50Ms 이 **같은 답**이다(표본 0 이면 둘 다 "없다") · n=' + n + ' · ' + JSON.stringify(p50) + ' vs ' + JSON.stringify(h2.tickP50Ms));
      // 그리고 안부를 물은 뒤에도 계측 창이 살아 있다(영점 조정 안 함 — ⓕ6 의 값 판)
      const pf2 = (await call(ZPORT, 'GET', '/perf', IN)).d;
      ok(pf2 && pf2.tick && pf2.tick.ms && pf2.tick.ms.n >= (pf.tick.ms.n | 0),
        'ⓕ9b ★`/health` 를 부른 뒤에도 틱 히스토그램이 **안 지워진다** · n ' + (pf.tick.ms.n | 0) + ' → ' + (pf2 && pf2.tick ? pf2.tick.ms.n : '?'));
    }
    // ⓕ8 ★자명 통과 금지 — 옛 칸들이 그대로 있다(칸을 더한 것이지 갈아치운 게 아니다)
    ok(['zone', 'players', 'humans', 'cap', 'observers', 'resources', 'buildings', 'mobs', 'claims', 'latency_ms', 'uptime']
        .every((k) => k in h),
      'ⓕ8 ★옛 칸 열하나가 **그대로** 있다 — 더한 것이지 갈아치운 게 아니다');
  }

  // ── ⓖ [T363] `/check_username` — 바깥은 닫히고 안은 그대로 ────────────────────
  //   묻는 것 하나: **비밀 없이 남의 이름 존재를 셀 수 있나.**
  //   ⚠지우지 못한 이유는 표 주석에 있다 — `zone.js` 게스트 갈래가 `findAccount` 술어를 이 문으로 쓴다.
  //     그래서 검사도 둘이다: 바깥은 404(몸통까지) · 안은 **종전 그대로 참/거짓을 답한다**.
  say('\n[ⓖ /check_username — 안 문]');
  {
    const OUTr = await call(CPORT, 'POST', '/check_username', OUT, { username: 'doorsv' });
    ok(문숨김(OUTr), 'ⓖ1 ★★바깥에서는 **404** 다 — 몸통도 `{"error":"not found"}` 하나(이름 존재가 안 샌다) · ' + OUTr.s + ' ' + JSON.stringify(OUTr.d));
    const INr = await call(CPORT, 'POST', '/check_username', IN, { username: 'doorsv' });
    ok(INr.s === 200 && INr.d && INr.d.taken === true,
      'ⓖ2 ★안 문으로는 **그대로 답한다** — 존의 게스트 갈래가 그 답으로 남의 이름 도용을 막는다 · ' + JSON.stringify(INr.d));
    const INfree = await call(CPORT, 'POST', '/check_username', IN, { username: '없는이름' + Date.now() });
    ok(INfree.s === 200 && INfree.d && INfree.d.taken === false,
      'ⓖ3 자명 통과 금지 — 없는 이름엔 `false` 다(늘 true 면 위가 뜻이 없다) · ' + JSON.stringify(INfree.d));
    // ⓖ4 ★클라가 그 문을 더 안 부른다(소스 계약 — 부르면 바깥이라 404 고, 로비가 조용히 망가진다)
    const cli = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    const calls = cli.split('\n').filter((l) => !l.trim().startsWith('//') && /check_username/.test(l));
    ok(calls.length === 0, 'ⓖ4 ★클라에 이 문을 부르는 줄이 **0** 이다(주석은 역사라 센다 치지 않는다) · ' + calls.length + '줄');
    // ⓖ5 ★그 대신 제출 때 `/auth` 를 부른다 — **새 문 0**(있는 문 하나로 옮겼다)
    ok(/fetch\('\/auth'/.test(cli) && /d\.isNew === false/.test(cli),
      'ⓖ5 로비가 제출 때 **있는 문** `/auth` 로 묻는다 — 새 라우트 0 · 비밀번호를 같이 내야 답한다');
  }

  shutdown();
  say(`\n=== 문 전수 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
