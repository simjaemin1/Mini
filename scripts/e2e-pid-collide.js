#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 브라우저를 띄운다(존 서버 0 · 정적 파일만 · 20초 안팎)
//
// ══════════════════════════════════════════════════════════════════════════════
// e2e-pid-collide — **이웃 존 관전 연결의 p1 이 나로 읽히나** [T397 ① 2026-09-26 · 세션9]
//
//   pid 는 존 프로세스마다 `p${nextPid++}` 로 **1 부터** 센다(`zone.js`). 그리고 존의 `broadcast` 는
//   제 플레이어와 **관전자(observers)** 모두에게 보낸다. 그러니 내가 A 존의 p1 이고 이웃 B 존을
//   관전 연결로 보고 있으면, B 존의 p1 에게 일어난 일이 **같은 글자의 pid** 로 내게 온다.
//   T387 §4-8 은 이것을 코드로만 봤다. 이 자는 **진짜 클라의 `handleMessage`** 에 진짜 모양의 전문을
//   두 연결(주 A · 관전 B)로 먹여 **내 상태가 바뀌는가**를 잰다(사본 0 — 제품이 쓰는 그 함수).
//
//   재는 세 자리(`30-n-net.js`): `hp_changed` → `myHp` · `player_respawn` → `myAbsPos`(텔레포트) ·
//   `player_down_state` → `downStates`(남의 쓰러짐이 "나"로 읽혀 **빠진다**).
//   ★대조(자명 통과 금지): 같은 전문을 **주 연결**로 먹이면 내 상태가 바뀌어야 한다 — 안 바뀌면
//     자가 아무것도 안 먹인 것이다.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PORT || 0) || (3920 + (process.pid % 60));
let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail !== undefined && detail !== '' ? '  ' + detail : ''}`);
}

(async () => {
  console.log('=== e2e-pid-collide — 관전 연결의 같은 pid 가 나로 읽히나 (T397 ①) ===\n');
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  // 전제 둘 — 서버가 정말 그렇게 하나(철자가 아니라 꼴로)
  ok(/const pid = `p\$\{nextPid\+\+\}`/.test(zsrc) && /let nextPid = 1;/.test(zsrc),
     '전제 ① pid 는 존 프로세스마다 1 부터 센다(`let nextPid = 1` · `p${nextPid++}`)');
  const bc = zsrc.slice(zsrc.indexOf('function broadcast(obj)'), zsrc.indexOf('function broadcast(obj)') + 400);
  ok(/for \(const ws of observers\.keys\(\)\) rawSend\(ws, str\)/.test(bc),
     '전제 ② `broadcast` 는 관전자에게도 보낸다(`observers.keys()`)');

  const http = require('http');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const f = path.join(ROOT, 'public', rel);
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof handleMessage === 'function' && typeof conns === 'object', null, { timeout: 20000 });

    // 두 연결을 세운다 — `connect()` 가 만드는 그 모양(ws 는 가짜 · 보내기 0)
    const setup = () => page.evaluate(() => {
      const mk = (zoneId, role, ox) => ({
        ws: { readyState: 1, send() {}, close() {} }, role, zoneId,
        meta: { worldOffsetX: ox, worldOffsetY: 0, zoneWidth: 100000, zoneHeight: 100000 },
        resources: new Map(), claims: new Map(), buildings: new Map(), mobs: new Map(),
        groundItems: new Map(), others: new Map(), corpses: new Map(),
      });
      conns.clear();
      const A = mk('zA', 'primary', 0), B = mk('zB', 'observer', 100000);
      conns.set('zA', A); conns.set('zB', B);
      primaryZoneId = 'zA';
      zonesMeta.zA = Object.assign({ id: 'zA', displayName: 'A', worldOffsetX: 0, worldOffsetY: 0 }, zonesMeta.zA || {});
      zonesMeta.zB = Object.assign({ id: 'zB', displayName: 'B', worldOffsetX: 100000, worldOffsetY: 0 }, zonesMeta.zB || {});
      myPid = 'p1';                                   // 나 = A 존의 p1
      myHp = 100;
      myAbsPos = { x: 500, y: 500 }; myAbsPredicted = { x: 500, y: 500 };
      downStates.clear();
      return true;
    });
    const feed = (zoneId, msg) => page.evaluate(({ zoneId, msg }) => {
      try { handleMessage(zoneId, msg, conns.get(zoneId)); return null; } catch (e) { return String(e).slice(0, 120); }
    }, { zoneId, msg });
    const state = () => page.evaluate(() => ({ hp: myHp, pos: myAbsPos && { x: myAbsPos.x, y: myAbsPos.y }, down: downStates.has('p1') }));

    const rows = [];
    // ① hp_changed — 이웃 존의 p1 이 다쳤다
    await setup();
    const e1 = await feed('zB', { type: 'hp_changed', pid: 'p1', hp: 7 });
    const s1 = await state();
    rows.push(['hp_changed (관전 B · p1 hp 7)', `내 HP ${s1.hp}`, e1]);
    ok(s1.hp === 100, '① ★★이웃 존 p1 의 `hp_changed` 가 **내 HP 를 안 바꾼다**', `내 HP ${s1.hp}${e1 ? ' · 오류 ' + e1 : ''}`);
    // ② player_respawn — 이웃 존의 p1 이 (50,50) 에서 깨어났다
    await setup();
    const e2 = await feed('zB', { type: 'player_respawn', pid: 'p1', hp: 100, x: 50, y: 50 });
    const s2 = await state();
    rows.push(['player_respawn (관전 B · p1 @50,50)', `내 좌표 ${s2.pos && s2.pos.x},${s2.pos && s2.pos.y}`, e2]);
    ok(s2.pos && s2.pos.x === 500 && s2.pos.y === 500, '② ★★이웃 존 p1 의 부활이 **나를 텔레포트시키지 않는다**',
       `내 좌표 ${s2.pos && s2.pos.x},${s2.pos && s2.pos.y}${e2 ? ' · 오류 ' + e2 : ''}`);
    // ③ player_down_state — 이웃 존의 p1 이 쓰러졌다(남의 쓰러짐이 기록돼야 한다)
    await setup();
    const e3 = await feed('zB', { type: 'player_down_state', pid: 'p1', isDown: true });
    const s3 = await state();
    rows.push(['player_down_state (관전 B · p1 down)', `downStates p1 ${s3.down}`, e3]);
    ok(s3.down === true, '③ ★이웃 존 p1 의 쓰러짐이 **남의 쓰러짐으로 기록된다**(나로 읽혀 버려지지 않는다)',
       `downStates.has(p1) ${s3.down}${e3 ? ' · 오류 ' + e3 : ''}`);

    // ④ 대조 — 같은 전문을 **주 연결**로 먹이면 내 상태가 바뀐다(자가 살아 있다)
    await setup();
    await feed('zA', { type: 'hp_changed', pid: 'p1', hp: 7 });
    const c1 = await state();
    await setup();
    await feed('zA', { type: 'player_respawn', pid: 'p1', hp: 100, x: 50, y: 50 });
    const c2 = await state();
    await setup();
    await feed('zA', { type: 'player_down_state', pid: 'p1', isDown: true });
    const c3 = await state();
    ok(c1.hp === 7, '④a 대조 — 주 연결의 내 `hp_changed` 는 내 HP 를 바꾼다', `내 HP ${c1.hp}`);
    ok(c2.pos && c2.pos.x === 50 && c2.pos.y === 50, '④b 대조 — 주 연결의 내 부활은 나를 옮긴다', `${c2.pos && c2.pos.x},${c2.pos && c2.pos.y}`);
    ok(c3.down === false, '④c 대조 — 주 연결의 내 `player_down_state` 는 남 목록에 안 들어간다(본인은 downed/respawn 길)', `${c3.down}`);
    // ⑤ 남(다른 pid)은 두 연결 어디서 와도 남이다
    await setup();
    await feed('zB', { type: 'player_down_state', pid: 'p2', isDown: true });
    const o1 = await page.evaluate(() => downStates.has('p2'));
    ok(o1 === true, '⑤ 다른 pid 는 관전 연결에서도 남으로 기록된다(종전 그대로)', `${o1}`);

    // ⑥ ★[T402] 남이 쓰러지는 소리 — **진짜 수신 길**(`handleMessage` 머리의 `__sfx.recv`)로 센다.
    //   같은 존(주 연결)의 p2 가 쓰러지면 운다 · 재접속 복원(`why:relogin`)은 안 운다 · 관전 연결의 p1 쓰러짐은 '나'가 아니다.
    {
      await page.mouse.click(5, 5);                                          // 소리 층은 첫 제스처에서만 연다(계약)
      await page.waitForFunction(() => window.__sfx && window.__sfx.dbg && window.__sfx.dbg().ctx && window.__sfx.dbg().manifest > 0, null, { timeout: 20000 });
      const played = () => page.evaluate(() => window.__sfx.dbg().stat.played);
      const withP2 = () => page.evaluate(() => { conns.get('zA').others.set('p2', { pid: 'p2', x: 520, y: 500 }); });   // [T417] 내 곁(500,500) — `downed` 반경 384(멀면 안 들리는 게 맞다)
      const down = (zoneId, pid, why) => feed(zoneId, Object.assign({ type: 'player_down_state', pid, isDown: true }, why ? { why } : {}));
      await setup(); await withP2(); await down('zA', 'p2', 'down'); await page.waitForTimeout(900);   // 데우기
      await setup(); await withP2(); let b = await played(); await down('zA', 'p2', 'down'); const s1 = (await played()) - b;
      await page.waitForTimeout(900);
      await setup(); await withP2(); b = await played(); await down('zA', 'p2', 'relogin'); const s0 = (await played()) - b;
      await setup(); b = await played(); await down('zB', 'p1', 'down'); const sB = (await played()) - b;   // 관전 B 의 p1 · B 의 others 에 없음
      ok(s1 === 1, '⑥a ★★같은 존의 p2 가 쓰러지면 **소리가 난다**(진짜 수신 길 · `why:down`)', `울린 ${s1}`);
      ok(s0 === 0, '⑥b 재접속 복원(`why:relogin`)은 안 운다', `울린 ${s0}`);
      ok(sB === 0, '⑥c 관전 연결의 p1 쓰러짐은 **내 몸 소리가 아니다**(나 판정은 주 연결만)', `울린 ${sB}`);
    }

    console.log('\n    ── 재현 표 ──');
    for (const [n, v, e] of rows) console.log(`      ${n.padEnd(34)} ${v}${e ? ' · 오류 ' + e : ''}`);
    const bad = errs.filter((e) => !/json|JSON|fetch|Failed to load/.test(e));
    ok(bad.length === 0, '페이지 오류 0(정적 페이지의 표 받기 실패는 뺀다)', bad.slice(0, 2).join(' | ') || '없다');
  } catch (e) {
    ok(false, '하네스가 끝까지 못 갔다', String(e && e.message).slice(0, 160));
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
