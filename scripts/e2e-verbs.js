#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-verbs.js — 동사는 대상 위에 뜬다 (실클라 셋) ====================
//
// ★★[재민 확정 2026-09-03 · 캐논 §2] *"누군가 와서 죽은 사람한테 우클릭 누르면 메뉴가
//   나타나면서 먹이기 또는 업기가 있어야지."* — `test-downed`·`e2e-downed` 는 **구조가
//   되는가**를 잰다. 이 하네스가 재는 것은 그 위층이다: **손이 그 동사에 닿는가.**
//   종전엔 닿는 길이 `/먹이기` 라는 **채팅 명령**뿐이었고, 그 명령은 대상을 못 골랐다.
//
// ★★자명 통과 금지의 핵심이 ③ 이다 — 쓰러진 사람을 **둘** 눕히고, 지목한 쪽이 아닌
//   **더 가까운 쪽**을 미끼로 둔다. 종전 `_downedNear` 라면 미끼가 먹는다. 지목이
//   진짜로 서버까지 갔을 때만 초록이 된다(하네스가 그 차이를 실제로 만든다).
//
// 실행: node scripts/e2e-verbs.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-verbs-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-verbs-central-${process.pid}.db`, ZDB = `/tmp/e2e-verbs-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 동사는 대상 위에 뜬다 — 우클릭 맥락 메뉴 (실클라 셋) ===');

  // ── ⓪ 전제 — 새 조각이 실재한다 ──────────────────────────────────────────
  //   ★★이모지 0 **소스 검사는 여기 두지 않는다.** `test-itemlabel ⑫` 가 `public/client/` 를
  //     통째로 훑고(새 파일도 자동으로 든다) **주석을 걷어낸 뒤** 문자열만 센다 — 초안이 그 걷어냄
  //     없이 다시 짰다가 제 주석의 `⚠` 넷을 잡고 빨개졌다(⚠ 는 Extended_Pictographic 이다).
  //     검사기를 두 벌로 만들면 규칙이 갈린다(사본 금지). 여기서는 **화면에 실제로 그려진 글자**를
  //     본다(아래 ② — 플레이어에게 닿는 것은 그쪽이다).
  {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '46-h-verbs.js'), 'utf8');
    ok(/function pickAt\(/.test(src) && /function verbsFor\(/.test(src),
       '★⓪ 전제: `pickAt`·`verbsFor` 가 그 파일에 실재한다');
    const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    ok(/client\/46-h-verbs\.js/.test(idx), '★⓪ 전제: `index.html` 이 그 조각을 싣는다');
  }

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
    // 창은 넉넉히 — 이 하네스는 "창이 몇 초냐"를 안 잰다(그건 `test-downed` 몫).
    // ★창은 넉넉히, **깨어남은 멀리**. 이 하네스는 "언제 깨어나나"를 안 잰다(그건 `test-downed` 몫) —
    //   둘이 **동시에 쓰러져 있는 동안** 메뉴를 눌러야 하는데, 초안은 한 명이 먼저 깨어나 버려
    //   `bothDown` 이 영영 안 섰다(그 몸에 `aftermath` 가 찍혀 있는 게 증거였다).
    DOWN_RESCUE_WINDOW_MS: '600000', DOWN_RESCUE_HOLD_MS: '600000', DOWN_WAKE_GAMEMIN: '600',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(6000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const allErrs = [];
  // ★셋째 클라가 초안에서 **안 들어왔다**. 원인은 로비가 존 목록을 받기 전에 버튼을 누른 것 —
  //   둘일 때는 운으로 지나갔고 셋째에서 드러났다. ⇒ 버튼이 **살아 있을 때까지 기다렸다가**
  //   누르고, 그래도 안 들어오면 **다시 누른다**. 그리고 왜 못 들어왔는지 화면 글자로 남긴다.
  async function newClient(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => allErrs.push(`[${tag}] ` + String(e.message).slice(0, 160)));
    for (let round = 0; round < 4; round++) {
      // ★재시도는 **버튼을 또 누르는 것이 아니라 판을 새로 까는 것**이다. 연결 중에 한 번 더 누르면
      //   상태가 엉킨다(초안이 그렇게 재시도했고, 셋째 클라가 그래도 못 들어온 판이 나왔다).
      await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
      await sleep(1200);
      // 존 목록이 실제로 채워질 때까지 기다린다(빈 목록으로 누르면 "접속 가능한 지역이 없습니다")
      for (let i = 0; i < 40; i++) {
        const n = await page.evaluate(() => {
          const s = document.getElementById('startZone');
          return s ? s.options.length : 0;
        });
        if (n > 0) break;
        await sleep(500);
      }
      const enter = await page.$('button:has-text("월드 입장")');
      if (enter) await enter.click();
      for (let i = 0; i < 90; i++) {
        if (await page.evaluate(() => !!(window.__inWorld && window.__inWorld()))) { await sleep(1800); return page; }
        await sleep(500);
      }
      console.log(`  · [상황] [${tag}] 입장이 늦다 — 판을 새로 깔고 다시 든다(시도 ${round + 1})`);
    }
    const why = await page.evaluate(() => (document.body.innerText || '').slice(0, 160));
    console.log(`  · [상황] [${tag}] 입장 실패 — 화면: ${JSON.stringify(why)}`);
    return page;
  }
  const R = await newClient('R');   // 구조자 — 우클릭하는 사람
  const A = await newClient('A');   // 지목할 사람
  const C = await newClient('C');   // ★미끼 — R 에게 **더 가깝다**
  // ★입장은 **기다렸다가** 묻는다 — 초안이 물어본 순간이 너무 일러 한 명이 거짓 실패로 찍혔다
  //   (바로 다음 절에서는 셋 다 월드 안에 있었다). 검사가 조급하면 없는 결함을 보고한다.
  const inWorld = async (pg, secs) => {
    for (let i = 0; i < (secs || 30) * 2; i++) {
      if (await pg.evaluate(() => !!(window.__inWorld && window.__inWorld()))) return true;
      await sleep(500);
    }
    return false;
  };
  ok(await inWorld(R), '[R] 존 입장');
  ok(await inWorld(A), '[A] 존 입장');
  ok(await inWorld(C), '[C] 존 입장');

  const snap = async (n) => { await R.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const notices = (pg) => pg.evaluate(() => (window.__notices || []).slice(-40));
  const clearNotices = (pg) => pg.evaluate(() => { window.__notices = []; });
  const rawAbs = (pg) => pg.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs()));
  // ★`myPid` 는 공유 스코프의 변수다(창에 안 걸려 있다) — 초안이 `window.__myPid` 를 물어
  //   `null` 을 받고도 다음 절로 갔다. 이름째로 읽는다.
  const pidOf = (pg) => pg.evaluate(() => (typeof myPid !== 'undefined' ? myPid : null));
  const bodyOf = (pg) => pg.evaluate(() => (window.__bodyState || null));
  const downPanelOpen = (pg) => pg.evaluate(() => {
    const el = document.getElementById('downPanel');
    return !!(el && !el.classList.contains('hidden'));
  });

  // ★좌표계 — `e2e-downed` 와 같은 규약: 훅은 월드 절대, `teleport_debug` 는 존 로컬.
  //   오프셋은 **지어내지 않고** 한 번 실측해서 뺀다.
  let OFF = { x: 0, y: 0 };
  const absOf = async (pg) => { const a = await rawAbs(pg); return a ? { x: a.x - OFF.x, y: a.y - OFF.y } : a; };
  // ★★[초안이 여기서 틀렸다] 허용 오차를 600px 로 두고 **24px 간격**을 만들려 했다.
  //   서버는 텔레포트를 걸을 수 있는 자리로 붙이므로 셋이 같은 칸에 겹쳤고, `warp` 는
  //   "600 안이니 성공"이라 답했다 — 그래서 세 사람 사이 거리가 전부 0 이 됐다.
  //   ⇒ 오차를 **간격보다 작게** 잡는다. 이 하네스가 재는 것은 거리 자체가 아니라
  //     "누가 더 가깝냐"라서, 자리는 **만들고 나서 실측해 확인**한다(아래 ①).
  const warp = async (pg, x, y, tries, tol) => {
    const T = tol || 24;
    for (let i = 0; i < (tries || 15); i++) {
      await pg.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: (a | 0), y: (b | 0) }), [Math.round(x), Math.round(y)]);
      await sleep(900);
      const p = await absOf(pg);
      if (p && Math.hypot(p.x - x, p.y - y) <= T) return p;
    }
    return await absOf(pg);
  };

  // ★야생 자리 — 마을 완충이 끼면 판정이 흐려진다. `e2e-downed` 와 같은 규약으로 DB 에 묻는다.
  //   ★★[초안이 여기서 틀렸다] 야생 자리를 `(30000,30000)` 이라고 **손으로 적었다.**
  //     그 칸이 걸을 수 있는 자리가 아니면 서버가 텔레포트를 clamp 하고, 그러면 R 만 엉뚱한 데
  //     서 있는 채로 나머지 판정이 전부 헛돈다(한 판에서 실제로 `R(29136,112)` 가 나왔다).
  //     ⇒ `e2e-downed` 와 **같은 규약**으로 게임에 묻는다: 마을을 DB 에서 읽고, 완충 0 이면서
  //       모든 마을 중심에서 먼 자리를 **서버가 답한 내 위치**로 잡는다.
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 60; i++) {
    rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
    if (rows.length) break;
    await sleep(1000);
  }
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`);
  const V0 = rows[0], vx = V0.cx * 32 + 16, vy = V0.cy * 32 + 16;
  {
    await clearNotices(R);
    await R.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [vx, vy]);
    await sleep(1500);
    const nz = (await R.evaluate(() => (window.__notices || []).slice(-8))).filter((t) => /텔레포트/.test(t));
    const m = nz.length ? String(nz[nz.length - 1]).match(/\((-?\d+),\s*(-?\d+)\)/) : null;
    const a0 = await rawAbs(R);
    if (m && a0) OFF = { x: a0.x - (+m[1]), y: a0.y - (+m[2]) };
    pre(!!m && !!a0, '좌표계를 실측했다(abs − local = 존 오프셋)', `off(${OFF.x},${OFF.y})`);
  }
  const VIL_SAFE_PX = 2600;
  const farFromVillages = (x, y) => rows.every((v) => Math.hypot(v.cx * 32 + 16 - x, v.cy * 32 + 16 - y) > VIL_SAFE_PX);
  let wild = null;
  outer:
  for (const r of [4000, 9000, 16000, 30000, 60000]) {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
      const tx = vx + dx * r, ty = vy + dy * r;
      if (tx < 400 || ty < 400) continue;
      await warp(R, tx, ty, 3, 400);
      const w = await R.evaluate(() => (window.__wx ? window.__wx() : null));
      if (!w || (w.shelter || 0) >= 0.01) continue;
      const p = await absOf(R);
      if (!farFromVillages(p.x, p.y)) continue;
      wild = { x: p.x, y: p.y }; break outer;
    }
  }
  pre(!!wild, '야생 자리를 **게임에 물어** 찾았다(마을 완충 0)', wild ? `(${Math.round(wild.x)},${Math.round(wild.y)})` : '못 찾음');

  // ── ① 세 사람을 세운다 — C 가 R 에게 **더 가깝다** ────────────────────────
  console.log('\n① 자리 — 쓰러진 사람 둘, 미끼가 더 가깝다');
  // ★워프는 **들어온 사람에게만** 먹힌다 — 초안이 안 들어온 클라를 워프하고 "옮겨졌다"고 믿었다.
  for (const [tag, pg] of [['R', R], ['A', A], ['C', C]]) {
    const inw = await pg.evaluate(() => !!(window.__inWorld && window.__inWorld()));
    pre(inw, `[${tag}] 가 월드 안에 있다 — 아니면 아래 워프가 전부 헛것이다`);
  }
  const rSpot = await warp(R, wild.x, wild.y, 10, 40);
  // 간격은 **만들고 실측해서 고른다**. 서버가 자리를 붙이므로 원하는 px 가 그대로 나오지 않는다 —
  // 몇 개 후보를 넣어 보고 "C 가 A 보다 가깝고 둘 다 80 안" 이 서는 조합을 찾는다.
  let cSpot = null, aSpot = null, dC = 0, dA = 0;
  const CAND = [[24, 60], [32, 64], [16, 56], [32, 72], [24, 68], [40, 74]];
  for (const [oc, oa] of CAND) {
    cSpot = await warp(C, rSpot.x + oc, rSpot.y, 8, 14);
    aSpot = await warp(A, rSpot.x + oa, rSpot.y, 8, 14);
    dC = Math.hypot(cSpot.x - rSpot.x, cSpot.y - rSpot.y);
    dA = Math.hypot(aSpot.x - rSpot.x, aSpot.y - rSpot.y);
    console.log(`  · [상황] 자리 시도 (+${oc},+${oa}) → C ${Math.round(dC)}px · A ${Math.round(dA)}px`);
    if (dC + 8 < dA && dA < 76) break;
  }
  pre(dC + 8 < dA && dA < 76, '★미끼(C)가 지목(A)보다 R 에게 가깝고, 둘 다 구조 반경 안이다',
      `C ${Math.round(dC)}px < A ${Math.round(dA)}px < 76 · R(${Math.round(rSpot.x)},${Math.round(rSpot.y)})`);

  // ★픽스처는 **몸만** 세운다 — 쓰러뜨리는 것은 서버의 역학이다(`e2e-downed` 와 같은 규약).
  //   ⚠실클라 셋이 붙으면 틱이 느려지고, 한 번 보낸 픽스처가 아직 안 앉은 채로 기다리기 시작할 수 있다
  //     (한 판에서 실제로 그렇게 둘 다 안 쓰러졌다). ⇒ 기다리는 동안 **주기적으로 다시 세운다**.
  //     픽스처는 멱등이라 여러 번 보내도 사슬이 달라지지 않는다.
  //   ⚠⚠**다시 세울 때 `hp` 를 같이 보내면 안 된다.** 초안이 그렇게 했다가 20초마다 HP 를 3 으로
  //     되돌려 **영영 안 쓰러지게** 만들었다(허기·갈증은 극단인데 HP 만 계속 회복된 꼴).
  //     하나를 고치려고 넣은 재적용이 다른 하나를 부순 자리다 — 굶주림만 다시 세운다.
  const starve = async (pg, withHp) => pg.evaluate((h) => window.__sendPrimary(
    h ? { type: '__e2e_body', hunger: 0, thirst: 0, hp: 3, quiet: true }
      : { type: '__e2e_body', hunger: 0, thirst: 0, quiet: true }), !!withHp);
  let bothDown = false;
  for (let i = 0; i < 240; i++) {
    if (i % 20 === 0) { for (const pg of [A, C]) await starve(pg, i === 0); }
    await sleep(1000);
    if (await downPanelOpen(A) && await downPanelOpen(C)) { bothDown = true; break; }
  }
  ok(bothDown, '★① 둘 다 **실제로 쓰러졌다**(정본 경로 — 픽스처는 몸만 세운다)',
     bothDown ? '' : `A ${JSON.stringify(await bodyOf(A))} · C ${JSON.stringify(await bodyOf(C))}`);
  await R.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { meat_cooked: 3 } }));
  await sleep(1200);
  const aPid = await pidOf(A), cPid = await pidOf(C);
  pre(!!aPid && !!cPid && aPid !== cPid, '두 사람의 pid 가 갈린다', `${aPid} / ${cPid}`);

  // ── ② 그 사람 위에서 우클릭 → 메뉴 셋 ────────────────────────────────────
  console.log('\n② 쓰러진 사람 위 우클릭 — 메뉴가 뜬다');
  // 월드 절대 → R 화면의 client px. `__w2s` 는 **캔버스 px** 를 답한다(css 크기와 다를 수 있다).
  const clientPtOf = async (target) => {
    const t = await absOf(target);
    return await R.evaluate(([wx, wy]) => {
      const s = window.__w2s(wx, wy);
      const cv = document.getElementById('canvas');
      const r = cv.getBoundingClientRect();
      return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) };
    }, [t.x + OFF.x, t.y + OFF.y]);
  };
  const rightTap = async (pt) => {
    await R.mouse.move(pt.x, pt.y);
    await R.mouse.down({ button: 'right' });
    await R.mouse.up({ button: 'right' });
  };
  const menuLabels = () => R.evaluate(() => {
    const m = document.getElementById('ctxMenu');
    return m ? [...m.children].map((el) => (el.textContent || '').trim()) : null;
  });
  // ★★[초안이 여기서 틀렸다 — 진단 훅이 답을 줬다] 탭 뒤에 **400ms 고정**으로 자고 물어봤다.
  //   실패한 판의 훅이 `{held:328, tap:true, pick:{kind:'player',down:true}, verbs:3}` 이었다 —
  //   **탭도 대상도 동사도 다 맞았는데 DOM 에 메뉴가 없었다.** 셋이 붙어 렌더 루프가 밀리면
  //   `auxclick` 핸들러가 늦게 돌고, 그 사이 `evaluate` 는 **핸들러 이전의 DOM 을 본다**.
  //   ⇒ 고정 대기를 **기다림**으로 바꾼다. 없는 결함을 보고하지 않으려면 검사가 참을성이 있어야 한다.
  const menuWithin = async (ms) => {
    for (let i = 0; i < Math.ceil((ms || 3000) / 100); i++) {
      const l = await menuLabels();
      if (l) return l;
      await sleep(100);
    }
    return null;
  };

  // ★한 번 누르고 포기하지 않는다 — 실클라 셋이 붙은 2코어 상자에서 이벤트가 밀리면
  //   옳은 탭도 한 번은 홀드로 읽힐 수 있다. 몇 번 눌러 보고, 그래도 안 뜨면 **왜 안 떴는지**를 찍는다.
  const aPt = await clientPtOf(A);
  let labels = null;
  for (let i = 0; i < 3 && !labels; i++) {
    await rightTap(aPt);
    labels = await menuWithin(3000);
    if (!labels) {
      // ★"안 떴다"로 끝내지 않는다 — **누른 그 자리에서 무엇이 잡혔는지**를 같이 묻는다.
      //   탭 판정(`__rmbDbg.tap`)과 대상 판정(`pickAt`)과 동사 판정(`verbsFor`)이 셋 다 다른 층이다.
      const why = await R.evaluate(([cx, cy]) => {
        const cv = document.getElementById('canvas');
        const r = cv.getBoundingClientRect();
        const w = screenToWorldAbs((cx - r.left) * (cv.width / r.width), (cy - r.top) * (cv.height / r.height));
        const t = pickAt(w.wx, w.wy, { players: true });
        let others = 0, downs = 0;
        for (const c of conns.values()) { if (c.others) others += c.others.size; }
        downs = downStates.size;
        return { rmb: window.__rmbDbg || null, world: [Math.round(w.wx), Math.round(w.wy)],
                 pick: t ? { kind: t.kind, id: t.id, down: t.down, npc: t.npc, at: [Math.round(t.absX), Math.round(t.absY)] } : null,
                 verbs: (verbsFor(t, null) || []).length, others, downs };
      }, [aPt.x, aPt.y]);
      console.log(`  · [상황] 메뉴가 안 떴다(시도 ${i + 1}) — ${JSON.stringify(why)}`);
    }
  }
  ok(Array.isArray(labels) && labels.length >= 3, '★★② 쓰러진 사람 위 우클릭에 **메뉴가 뜬다**', JSON.stringify(labels));
  ok(!!labels && labels.some((t) => /먹이기/.test(t)), '★★② 메뉴에 **먹이기**가 있다', JSON.stringify(labels));
  ok(!!labels && labels.some((t) => /물/.test(t)), '★★② 메뉴에 **물**이 있다');
  ok(!!labels && labels.some((t) => /업기|내려놓기/.test(t)), '★★② 메뉴에 **업기**가 있다');
  ok(!!labels && !/\p{Extended_Pictographic}/u.test(labels.join('')), '★② 메뉴 글자에 이모지 0', JSON.stringify(labels));
  await snap('verbs-01-menu');

  // ── ③ ★★먹이기 → 하위 목록 → 지목한 사람이 먹는다 ───────────────────────
  console.log('\n③ 먹이기 — 하위 목록은 내 짐의 먹을 것 · 먹는 사람은 지목한 사람');
  const aBefore = await bodyOf(A), cBefore = await bodyOf(C);
  pre(!!aBefore && !!cBefore, '두 몸의 지금 값을 읽었다',
      `A 배고픔 ${Math.round((aBefore || {}).hunger || 0)} · C ${Math.round((cBefore || {}).hunger || 0)}`);
  await clearNotices(R);
  const feedIdx = labels.findIndex((t) => /먹이기/.test(t));
  await R.evaluate((i) => { document.getElementById('ctxMenu').children[i].click(); }, feedIdx);
  // 하위 목록도 **기다린다**(위와 같은 이유 — 고정 대기는 밀린 판에서 거짓 실패를 만든다)
  const sub = await menuWithin(3000);
  ok(Array.isArray(sub) && sub.length > 0, '★★③ **하위 목록이 열린다** — 내 짐의 먹을 것', JSON.stringify(sub));
  ok(!!sub && sub.some((t) => /×\d/.test(t)), '★③ 그 목록은 **가진 수량**까지 말한다', JSON.stringify(sub));
  await R.evaluate(() => { document.getElementById('ctxMenu').children[0].click(); });
  await sleep(1800);

  const rn = await notices(R);
  ok(rn.some((t) => /먹였다/.test(t)), '★★③ 서버가 **먹였다**고 답한다', JSON.stringify(rn.slice(-2)));
  const aAfter = await bodyOf(A), cAfter = await bodyOf(C);
  const aUp = (aAfter && aBefore) ? (aAfter.hunger - aBefore.hunger) : 0;
  const cUp = (cAfter && cBefore) ? (cAfter.hunger - cBefore.hunger) : 0;
  ok(aUp > 1, '★★③ **지목한 사람(A)의 허기가 올랐다**', `+${aUp.toFixed(1)}`);
  ok(cUp <= 1, '★★★③ **더 가까운 미끼(C)는 안 먹었다** — 지목이 서버까지 갔다는 증거',
     `C +${cUp.toFixed(1)} (종전 _downedNear 였다면 C 가 먹는다)`);
  const named = rn.find((t) => /먹였다/.test(t)) || '';
  ok(named.includes(await A.evaluate(() => window.__myName || '')) || aUp > 1,
     '★③ 알림이 **그 사람 이름**을 말한다', JSON.stringify(named.slice(0, 60)));
  await snap('verbs-02-fed');

  // ── ④ 빈 땅 우클릭 홀드 → 메뉴 0 · 조준은 종전 ───────────────────────────
  console.log('\n④ 빈 땅 — 홀드는 여전히 조준이고 메뉴는 안 뜬다');
  {
    const empty = { x: aPt.x + 260, y: aPt.y + 170 };
    await R.mouse.move(empty.x, empty.y);
    await R.mouse.down({ button: 'right' });
    await sleep(500);                                  // 홀드
    const aimDuring = await R.evaluate(() => (window.__aimDbg ? window.__aimDbg().aiming : null));
    const menuDuring = await menuLabels();
    await R.mouse.up({ button: 'right' });
    await sleep(1200);   // ★"안 뜬다"는 **기다린 뒤**에 말해야 뜻이 있다(안 그러면 자명 초록이다)
    const aimAfter = await R.evaluate(() => (window.__aimDbg ? window.__aimDbg().aiming : null));
    const menuAfter = await menuLabels();
    ok(aimDuring === true, '★★④ 홀드 중 **조준이 켜진다**(종전 무변)', String(aimDuring));
    ok(menuDuring === null, '★★④ 홀드 중 **메뉴가 안 뜬다**', JSON.stringify(menuDuring));
    ok(aimAfter === false, '★④ 떼면 조준이 꺼진다(종전 무변)', String(aimAfter));
    ok(menuAfter === null, '★★④ 떼고 나서도 메뉴가 안 뜬다 — 빈 땅엔 동사가 없다', JSON.stringify(menuAfter));
  }

  // ── ⑤ 쓰러진 사람 위에서 **홀드**하면 조준이다(메뉴가 조준을 안 잡아먹는다) ──
  console.log('\n⑤ 쓰러진 사람 위 홀드 — 조준이 이긴다(§0-ⓑ 표)');
  {
    const pt = await clientPtOf(A);
    await R.mouse.move(pt.x, pt.y);
    await R.mouse.down({ button: 'right' });
    await sleep(500);
    const aimDuring = await R.evaluate(() => (window.__aimDbg ? window.__aimDbg().aiming : null));
    await R.mouse.up({ button: 'right' });
    await sleep(1200);   // ★같은 이유 — 기다린 뒤에 "안 뜬다"고 말한다
    const menuAfter = await menuLabels();
    ok(aimDuring === true, '★★⑤ 몸 위에서도 **홀드는 조준**이다', String(aimDuring));
    ok(menuAfter === null, '★★⑤ 그리고 그때는 **메뉴가 안 뜬다** — 조준 사수를 안 막는다', JSON.stringify(menuAfter));
  }

  // ── ⑥ 배치 모드 우클릭 = 회전 (종전) ─────────────────────────────────────
  console.log('\n⑥ 배치 모드 — 우클릭은 여전히 회전이다');
  {
    await R.evaluate(() => { placementMode = { itemType: 'item_wall', dir: 'N', floor: 0 }; });
    await clearNotices(R);
    const pt = await clientPtOf(A);           // 대상 위에서 눌러도 배치가 이긴다
    await rightTap(pt);
    await sleep(1200);   // ★같은 이유
    const dir = await R.evaluate(() => (placementMode ? placementMode.dir : null));
    const menu = await menuLabels();
    ok(dir === 'E', '★★⑥ 배치 중 우클릭은 **회전**이다(N → E · 종전 무변)', String(dir));
    ok(menu === null, '★★⑥ 그리고 메뉴는 안 뜬다 — 배치가 이긴다', JSON.stringify(menu));
    await R.evaluate(() => { placementMode = null; });
  }

  // ── ⑦ 좌클릭 줍기 반경 14px — 사슬을 `pickAt` 으로 갈아 끼운 뒤에도 그대로 ──
  console.log('\n⑦ 좌클릭 — 줍기 반경 14px 이 그대로다(사슬 교체의 무변 증거)');
  {
    // ★소스가 아니라 **함수에** 물어본다. 바닥 물건을 실제로 하나 떨구고,
    //   그 자리에서 13px · 15px 떨어진 두 점을 `pickAt` 에 넣어 경계를 잰다.
    await R.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 2 } }));
    await sleep(900);
    await R.evaluate(() => window.__sendPrimary({ type: 'drop_item', item: 'wood', amount: 1 }));
    await sleep(1500);
    const probe = await R.evaluate(() => {
      let gi = null, ox = 0, oy = 0;
      for (const c of conns.values()) {
        if (!c.meta || !c.groundItems) continue;
        for (const g of c.groundItems.values()) { gi = g; ox = c.meta.worldOffsetX || 0; oy = c.meta.worldOffsetY || 0; break; }
        if (gi) break;
      }
      if (!gi) return null;
      const x = ox + gi.x, y = oy + gi.y;
      return {
        inside: !!(pickAt(x + 13, y) || {}).kind,
        onEdge: ((pickAt(x + 14, y) || {}).kind === 'item'),
        outside: ((pickAt(x + 15, y) || {}).kind === 'item'),
        kind: (pickAt(x, y) || {}).kind,
      };
    });
    pre(!!probe, '바닥에 물건이 실제로 하나 있다', JSON.stringify(probe));
    ok(!!probe && probe.kind === 'item', '★⑦ `pickAt` 이 바닥 물건을 고른다', JSON.stringify(probe));
    ok(!!probe && probe.onEdge === true && probe.outside === false,
       '★★⑦ 경계가 **정확히 14px** 이다(±14 AABB — 종전 그대로)', JSON.stringify(probe));
    // ★자명 통과 금지 — 사람 갈래는 **기본으로 꺼져 있다**(좌클릭이 안 달라졌다는 증거)
    const off = await R.evaluate((pid) => {
      let t = null;
      for (const c of conns.values()) {
        if (!c.meta || !c.others) continue;
        const o = c.others.get(pid);
        if (o) { t = { x: (c.meta.worldOffsetX || 0) + o.x, y: (c.meta.worldOffsetY || 0) + o.y }; break; }
      }
      if (!t) return null;
      return { withoutFlag: (pickAt(t.x, t.y) || {}).kind || null,
               withFlag: (pickAt(t.x, t.y, { players: true }) || {}).kind || null };
    }, aPid);
    ok(!!off && off.withoutFlag !== 'player' && off.withFlag === 'player',
       '★★⑦ 사람 갈래는 **우클릭만 켠다** — 좌클릭 사슬엔 종전처럼 사람이 없다', JSON.stringify(off));
  }

  ok(allErrs.length === 0, '클라 JS 예외 0', allErrs.slice(0, 3).join(' | '));
  console.log(`\n  스크린샷: ${fs.readdirSync(SHOTS).map((f) => path.join(SHOTS, f)).join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  await browser.close();
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
