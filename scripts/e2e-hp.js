#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-hp.js — HP 가 변하면 화면이 안다 (실클라 E2E · T109) ============
//
// ★왜 이 하네스가 생겼나 — `인계/회부.md` 가 두 번(T44 B-4 · T83) 적은 자리:
//   *"HP 자연 회복이 화면에 안 실린다 — 굶다가 먹었는데 왜 안 낫지."*
//   T109 §0 이 그 자리를 다시 재 보니 **절반은 이미 닫혀 있었다**: T61 이 초당 하나 나가는
//   `gauges` 에 `hp`·`maxHp` 를 실어 뒀고(`zone.js` 게이지 절), 클라 `30-n-net.js` 가 그 칸을 읽는다.
//   ⇒ 남은 결함은 "화면이 모른다" 가 아니라 **hp 를 쓰는 자리가 열 군데로 흩어져 규칙이 제각각**인 것이었다.
//     이 하네스가 그 둘을 갈라 잰다: ① 화면은 정말 아는가(회복·다침·구조) ② 문은 정말 하나인가(소스).
//
// ★HP 는 클라 훅을 새로 만들지 않고 **화면이 말하는 값**(`#hpText`)으로 읽는다(클라 접점 0 카드).
// ★메시지 수는 브라우저에서 `WebSocket` 을 감싸 **실제로 온 프레임**을 센다(서버 로그 추정 금지).
//
// 실행: node scripts/e2e-hp.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-hp-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-hp-central-${process.pid}.db`, ZDB = `/tmp/e2e-hp-zone-${process.pid}.db`;
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
  console.log('\n=== HP 가 변하면 화면이 안다 — setHp 한 문 (실클라 둘) ===');

  // ── ⓪ 소스 — **문이 하나인가**(하네스를 띄우기 전에 답이 나오는 절) ─────────────
  console.log('\n⓪ 소스 — hp 를 쓰는 문이 하나다');
  {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    // 주석을 걷어낸 뒤 본다 — 주석에 옛 코드를 적어 두는 카드라 그대로 세면 거짓 빨강이 난다.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
    ok(/function setHp\(p, v, why\)/.test(code), '★⓪ 전제: `setHp(p, v, why)` 가 실재한다');
    // ★사람의 hp 를 **직접** 쓰는 자리 — `setHp` 안의 한 줄(`p.hp = next`)만 남아야 한다.
    //   ⚠몹·자원·건물의 hp 는 이 카드 소관이 아니다(문은 **사람** hp 의 문이다). 이름만으로는
    //     사람과 몹을 못 가르므로(`target` 은 두 곳 다 쓴다) **바로 곁에 무엇을 방송하는지**로 가른다:
    //     `mob_damaged` 를 내는 줄은 몹이다. 그렇게 걸러도 남는 것이 있으면 그건 사람이고, 사본이다.
    const lines = code.split('\n');
    const stray = [];
    lines.forEach((l, i) => {
      if (!/^\s*(?:player|target|entity|p)\.hp\s*(?:=|\+=|-=)[^=]/.test(l)) return;
      if (/^\s*p\.hp = next/.test(l)) return;                                   // 문 안의 그 한 줄
      const near = lines.slice(Math.max(0, i - 2), i + 4).join(' ');
      if (/mob_damaged|\.mid\b/.test(near)) return;                             // 몹이다(방송이 말한다)
      stray.push(`${i + 1}: ${l.trim()}`);
    });
    ok(stray.length === 0, '★★⓪ 사람 hp 를 **직접 쓰는 자리가 없다**(문 하나 · 사본 0)',
       stray.length ? stray.join(' | ') : '남은 것은 `p.hp = next` 하나뿐');
    // ★자명 통과 금지 — 한 줄을 되살리면 잡는가(몹 걸러내기가 사람까지 먹지 않는다)
    {
      const probe = ['function f() {', '  player.hp = Math.max(0, player.hp - 3);', '}'];
      const hit = probe.filter((l, i) => /^\s*(?:player|target|entity|p)\.hp\s*(?:=|\+=|-=)[^=]/.test(l)
        && !/mob_damaged|\.mid\b/.test(probe.slice(Math.max(0, i - 2), i + 4).join(' ')));
      ok(hit.length === 1, '★⓪ 자명 통과 금지 — 직접 대입 한 줄을 되살리면 잡힌다');
      const mobProbe = ['  target.hp -= dmg;', '  broadcast({ type: \'mob_damaged\', mid: target.mid });'];
      ok(mobProbe.filter((l, i) => /^\s*(?:player|target|entity|p)\.hp\s*(?:=|\+=|-=)[^=]/.test(l)
        && !/mob_damaged|\.mid\b/.test(mobProbe.slice(Math.max(0, i - 2), i + 4).join(' '))).length === 0,
        '★⓪ 그리고 몹 한 줄은 **안** 잡는다(거름망이 사람만 본다)');
    }
    // ★남에게 가는 규약 — 방송하는 `why` 는 종전 넷 그대로다(늘리지도 줄이지도 않았다)
    const m = code.match(/const HP_PEER = new Set\(\[([^\]]*)\]\)/);
    const peers = m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort() : [];
    ok(JSON.stringify(peers) === JSON.stringify(['damage', 'debug', 'dish', 'food']),
       '★★⓪ 방송하는 갈래는 **종전 넷 그대로**다(남의 규약 무변)', JSON.stringify(peers));
    // ★새 메시지 타입 0 — `player_damaged` 말고 hp 전용 타입을 만들지 않았다
    ok(!/type:\s*'hp_changed'|type:\s*'hp_update'/.test(code), '★★⓪ 새 메시지 타입 0');
    // ★클라 접점 0 — `player_damaged` 핸들러가 이미 자기 hp 를 세운다(T109 는 클라를 안 만졌다)
    const net = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    ok(/msg\.type === 'player_damaged'/.test(net) && /msg\.pid === myPid.*myHp = msg\.hp/s.test(net),
       '★★⓪ 클라는 **이미** 그 메시지로 자기 hp 를 세운다(클라 접점 0)');
    ok(/typeof msg\.hp === 'number'.*myHp = msg\.hp/s.test(net),
       '★⓪ 그리고 `gauges` 의 hp 칸도 이미 읽는다(T61 — 자연 회복이 실리는 통로)');
  }

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(6000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const errs = [];
  const newPage = async () => {
    const pg = await browser.newPage({ viewport: { width: 1100, height: 720 } });
    pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    // ★온 프레임을 **종류별로** 센다 — "메시지가 늘었나"는 추정이 아니라 셈이어야 한다.
    await pg.addInitScript(() => {
      window.__frames = {};
      const OWS = window.WebSocket;
      window.WebSocket = function (...a) {
        const ws = new OWS(...a);
        ws.addEventListener('message', (ev) => {
          try { const m = JSON.parse(ev.data); if (m && m.type) window.__frames[m.type] = (window.__frames[m.type] || 0) + 1; } catch (e) {}
        });
        return ws;
      };
      window.WebSocket.prototype = OWS.prototype;
      for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = OWS[k];
    });
    return pg;
  };
  const enter = async (pg) => {
    await pg.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const b = await pg.$('#enter'); if (b) await b.click();
    for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.__inWorld && window.__inWorld()))); i++) await sleep(500);
    await sleep(1500);
    return pg.evaluate(() => !!(window.__inWorld && window.__inWorld()));
  };

  const A = await newPage(), Bp = await newPage();
  ok(await enter(A), '[A] 존 입장');
  ok(await enter(Bp), '[B] 존 입장 — 남의 규약을 재는 둘째 클라');

  // 화면이 말하는 HP(정수) — 새 훅 0
  const hpOf = (pg) => pg.evaluate(() => {
    const el = document.getElementById('hpText');
    const m = el ? String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/) : null;
    return m ? +m[1] : null;
  });
  const srvHp = (pg) => pg.evaluate(() => (typeof myHp !== 'undefined' ? Math.round(myHp) : null));
  const frames = (pg) => pg.evaluate(() => JSON.parse(JSON.stringify(window.__frames || {})));
  const body = (pg, o) => pg.evaluate((m) => window.__sendPrimary(m), Object.assign({ type: '__e2e_body' }, o));

  // ── ① 다침은 **즉시** 화면에 온다(종전 규약 — 안 흔들렸다는 증거) ────────────
  console.log('\n① 다침은 즉시');
  {
    // ⚠"1초 뒤에 정확히 40" 을 기대하면 안 된다 — 픽스처는 `lastDamagedAt` 을 안 건드려서
    //   회복(초당 ~10hp)이 곧바로 돈다(초안이 `화면 45` 로 두 판 빨갰다 — 제품이 아니라 기대가 틀렸다).
    //   ⇒ **즉시성**은 초 단위 숫자가 아니라 **프레임**으로 잰다: 400ms 안에 `player_damaged` 가 왔는가.
    //     그게 `gauges`(초당 하나)가 아니라 방송이 날랐다는 증거다.
    //   ⚠고정 400ms 로 잘라 재면 안 된다 — 크로미움 둘이 2코어에서 지도를 그리는 중엔 왕복이
    //     그보다 늦는 판이 있다(초안이 `+0건` 으로 빨갰는데, 같은 판의 ③ 은 같은 경로로 `+1` 을 셌다.
    //     즉 경로는 멀쩡하고 **시계가 짧았다**). ⇒ 기다리면서 재고, **걸린 시간을 값으로 적는다**.
    const f0 = await frames(A);
    const t0 = Date.now();
    await body(A, { hp: 40, hunger: 100, thirst: 100 });
    let dmgMs = null;
    for (let i = 0; i < 30 && dmgMs === null; i++) {
      const f = await frames(A);
      if ((f.player_damaged || 0) - (f0.player_damaged || 0) >= 1) dmgMs = Date.now() - t0;
      else await sleep(100);
    }
    ok(dmgMs !== null, '★★① hp 가 바뀌자 `player_damaged` 가 **방송으로** 왔다(다침 규약 무변)',
       dmgMs === null ? '3초 안에 안 왔다' : `${dmgMs}ms`);
    const h = await hpOf(A);
    ok(h !== null && h < 60, '★① 그리고 화면이 깎인 값을 말한다', `화면 ${h}`);
  }

  // ── ② 굶다가 먹으면 **오른다** — 회부가 두 번 적은 그 자리 ────────────────────
  //   ★T61 이 `gauges` 에 hp 를 실은 뒤로 이건 이미 참이다. 이 절은 그 사실을 **박아 둔다** —
  //     누가 그 한 줄을 지우면 여기가 빨개진다(회부가 다시 열리는 걸 검사가 막는다).
  console.log('\n② 회복이 화면에 온다 — 3초 안');
  {
    await body(A, { hp: 30, hunger: 100, thirst: 100 });
    await sleep(1200);
    const h0 = await hpOf(A);
    // ⚠30 을 세우고 1.2초 뒤에 읽으면 **이미 37 이다** — 픽스처는 `lastDamagedAt` 을 안 건드리므로
    //   회복(초당 ~10hp)이 곧바로 돈다. "정확히 30" 을 기대하면 없는 결함이 난다(초안이 그랬다).
    //   여기서 볼 것은 "깎인 값이 화면에 앉았는가" 하나다 ⇒ 만피와 확실히 다르면 된다.
    pre(h0 !== null && h0 < 60, '깎인 값이 화면에 앉았다', `화면 ${h0}`);
    // 회복은 서버가 돌린다(초당 ~10hp · `lastDamagedAt` 뒤 1초부터). 하네스는 **기다리고 본다**.
    const seq = [];
    for (let i = 0; i < 6; i++) { await sleep(500); seq.push(await hpOf(A)); }
    const rose = h0 !== null && seq.some((v) => v !== null && v > h0);
    ok(rose, '★★② 아무것도 안 눌러도 **화면 hp 가 3초 안에 오른다**(회복이 실린다)',
       `${h0} → ${JSON.stringify(seq)}`);
    // ★자명 통과 금지 — 화면이 서버 값과 **같은 것**을 말한다(굳은 숫자가 아니다)
    //   ⚠둘을 **한 번에** 읽는다. 따로 읽으면 그 사이 초당 10hp 가 아물어 `84 vs 95` 가 나온다
    //     (초안이 그렇게 없는 결함을 냈다 — 화면이 틀린 게 아니라 두 번 물어본 것이 틀렸다).
    const both = await A.evaluate(() => {
      const el = document.getElementById('hpText');
      const m = el ? String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/) : null;
      return { screen: m ? +m[1] : null, mine: (typeof myHp !== 'undefined' ? Math.round(myHp) : null) };
    });
    ok(both.screen !== null && Math.abs(both.screen - both.mine) <= 1,
       '★② 화면 숫자 = 클라가 든 서버 값(굳은 그림 아님 · 한 프레임 차 허용)',
       `${both.screen} vs ${both.mine}`);
  }

  // ── ③ 남의 hp 규약 **무변** — 둘째 클라가 받는 프레임 수 ─────────────────────
  //   ★이 카드가 자기에게 보내기를 늘렸으므로, "남에게도 늘었나"를 **셈으로** 답해야 한다.
  console.log('\n③ 남에게 가는 규약은 안 늘었다');
  {
    const b0 = await frames(Bp);
    const a0 = await frames(A);
    await body(A, { hp: 25, hunger: 100, thirst: 100 });   // A 가 깎이고 → 다시 아문다
    await sleep(6000);
    const b1 = await frames(Bp), a1 = await frames(A);
    const dB = (b1.player_damaged || 0) - (b0.player_damaged || 0);
    const dA = (a1.player_damaged || 0) - (a0.player_damaged || 0);
    // A 가 6초 동안 30→100 까지 아무는 동안, B 에게는 **픽스처 한 방(방송)** 말고 아무것도 안 간다.
    ok(dB <= 2, '★★③ 6초 회복 동안 **남(B)에게 간 `player_damaged` 는 두 건 이하**(방송 규약 무변)', `B +${dB}`);
    ok(dA <= 2, '★★③ 그리고 자기(A)에게도 회복분이 **따로 안 간다**(`gauges` 가 이미 나른다 · 새 수 0)', `A +${dA}`);
    // ★초당 메시지 표 — `gauges` 는 초당 하나다(양자화의 정본). 이게 무너지면 위 둘이 무의미하다.
    const g = ((a1.gauges || 0) - (a0.gauges || 0)) / 6;
    ok(g > 0.5 && g < 1.6, '★★③ `gauges` 는 **초당 한 건**이다 — 그게 hp 양자화의 틱 정본이다',
       `${g.toFixed(2)}건/초`);
    const hEnd = await hpOf(A);
    ok(hEnd !== null && hEnd > 25, '★③ (상황) 그 6초 동안 실제로 아물었다 — 아니면 위가 자명 통과다', `화면 ${hEnd}`);
  }

  // ── ④ 구조로 일어나면 그 hp 가 **바로** 온다(종전엔 조용하던 자리) ────────────
  //   ★`setHp(.., 'rescue')` 가 자기에게 보내는 유일한 **새** 전송이다. 여기 말고는 안 늘었다.
  console.log('\n④ 조용하던 자리 — 소스로 잰다');
  {
    const code = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/setHp\(p, Math\.max\(1, Math\.round\(p\.maxHp \* hpFrac\)\), 'rescue'\)/.test(code),
       '★★④ 일어나는 자리가 문을 지난다(`rescue`)');
    ok(/setHp\(p, p\.hp \+ 2 \* dt \* 5 \* _rm, 'regen'\)/.test(code), '★★④ 자연 회복도 문을 지난다(`regen` · 조용)');
    ok(/setHp\(p, p\.hp - dmg, 'damage'\)/.test(code), '★★④ 다침도 문을 지난다(`damage` · 방송)');
    ok(!/p\.hp = 0;/.test(code), '★★④ 죽음의 `p.hp = 0` 사본은 사라졌다(문이 하한을 누른다)');
  }

  // ── ⑤ 재접속 — welcome 의 hp 가 서버 정본과 같다 ──────────────────────────
  console.log('\n⑤ 재접속 뒤 welcome hp');
  {
    await body(A, { hp: 55, hunger: 100, thirst: 100 });
    await sleep(700);
    const before = await srvHp(A);
    await A.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const b = await A.$('#enter'); if (b) await b.click();
    for (let i = 0; i < 60 && !(await A.evaluate(() => !!(window.__inWorld && window.__inWorld()))); i++) await sleep(500);
    await sleep(1500);
    // ⚠여기도 **한 번에** 읽는다(②의 그 함정 — 따로 읽으면 그 사이 아물어 `100 vs 93` 이 나온다).
    const pair = await A.evaluate(() => {
      const el = document.getElementById('hpText');
      const m = el ? String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/) : null;
      return { screen: m ? +m[1] : null, mine: (typeof myHp !== 'undefined' ? Math.round(myHp) : null) };
    });
    const after = pair.mine, afterScreen = pair.screen;
    // ★재접속 풀피는 **정책**이다(캐논 · 회부 유지) — 그러니 "같은 값" 이 아니라
    //   "welcome 이 실어 온 값과 화면이 같다" 를 잰다. 화면이 낡지 않는 것이 이 카드의 몫이다.
    ok(after !== null && afterScreen !== null && Math.abs(afterScreen - after) <= 1,
       '★★⑤ 재접속 직후 **화면 = welcome 이 실어 온 hp**(낡은 값 0 · 한 프레임 차 허용)',
       `화면 ${afterScreen} · self.hp ${after} (전 ${before})`);
  }

  ok(errs.length === 0, '클라 JS 예외 0', errs.slice(0, 3).join(' | '));
  await A.screenshot({ path: path.join(SHOTS, 'hp-01.png') });
  console.log(`\n  스크린샷: ${path.join(SHOTS, 'hp-01.png')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  await browser.close();
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
