#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 **세 밤** 분할(T238 · 소요로 균등 — 이 파일은 A: 셋 중 하네스 수가 가장 적은 밤 · A 21 · B 22 · C 23) · `run-regress.sh --list "nightly A"`
// === scripts/e2e-nametag-others.js — **다른 플레이어의 이름(별명)이 서로 보인다**(T1068 ② · ★재민 11-01 실기) — 손님 둘 · 서로 화면 · 시트 켬 · 끔 두 길 ===
//
// ★왜: 재민 11-01 실기 "다른 플레이어의 닉네임이 안 보인다". 이름표는 `42-r2-char.js drawNameTag` 하나다(시트 · 도형 두 길 다 부른다 · T57).
//   `e2e-charsprite ⓔ` 는 **내** 이름표만 잰다(나는 늘 화면 한가운데). 남의 이름은 다른 길을 탄다 —
//   로비 이름칸 → ws `username` → 존 게스트 갈래 → central `/guest` 행 이름 → 서버 `makeEntry` 첫 가시분 `name` → 클라 `c.others` → `displayName` → 그 함수.
//   ⇒ 손님 둘이 **이름칸에 별명을 치고**(비밀번호 없이 — 로비가 허락하는 그대로) 들어와 **서로의 화면**에서 잰다(그 길 전부가 한 판에 든다).
// ★귀속(T1068 보고 §2): 이름표는 두 길 다 그려진다 — 남의 화면엔 **별명이 아니라 central 이 지은 `여행자XXXX`** 가 실렸다(T208 · `zone.js` 공통 복원
//   `name = acct.name`), 내 화면엔 클라가 이름칸 글자를 그대로 썼다(`myName = inputName`). 고침 = 손잡이 `T1068_GUEST_NICK`(켬 기본 후보 · `=0` 종전).
// ★재는 것(A 가 B 를 · B 가 A 를 — 시트 켬 · 끔 두 길):
//   ⓪ 상황 — 두 손님이 들어왔다 · 짝이 무조건 보이는 반경(80px · `coneMultEntity`) 안 · 시트 기본 켬(T1068 ① — 존 env 에 `CHAR_SPRITE` 없음)
//   ① 이름 — 보는 쪽 `c.others` 의 짝 이름 = **짝이 이름칸에 친 별명** · 내 머리 위 이름(`myName`) = 짝이 보는 내 이름
//   ② 부름 — 그 판들에서 `drawNameTag` 가 짝의 별명으로 불렸다(isMe 거짓)
//   ③ 화소 — 짝 이름표 자리에 **글자 외곽선**(검은 3px 획 — `e2e-charsprite ⓔ` 의 어두운 문턱 45)이 실제로 있다.
//      자명 통과 금지: 같은 자리를 **짝 이름표 한 줄만 건너뛴 판**(갈고리)과 견준다 — 그린 판 셋 다 어둡고 건너뛴 판 셋 다 안 어두운 화소가
//      ⓔ 의 문턱(10)을 넘어야 한다(서 있는 몸의 숨쉬기 · 땅은 두 판에 같이 든다 — 셋씩 잡아 깜빡임을 뺀다).
//   ④ 시트 끔(`__setCharSprite(false)` — 도형 길 `drawPlayerIso` 안의 같은 함수) — ①~③ 그대로.
//   ⑤ 별명 겹침 — 셋째 손님이 둘째의 별명을 치면 남의 계정 이름과 같은 거절(`username_taken`) · 이름칸을 비운 손님은 종전 그대로 `여행자XXXX`(T208).
// 실행: node scripts/e2e-nametag-others.js [--headed]   (central 3010 · zone 3020 · Chromium · 1분 안팎)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const { openSpot } = require('./e2e-charsprite');   // 열린 자리(물 · 바위 · 자연물 없는 둘레) — 정본 하나

const ROOT = path.join(__dirname, '..');
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-nt-c-${process.pid}.db`, ZDB = `/tmp/e2e-nt-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const NICK = { A: '첫째손님', B: '둘째손님' };   // 로비 이름칸(16자 안 · 비밀번호 없음 = 게스트)

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
FB.reapOnExit(procs);
function boot(file, env) {
  const e = Object.assign({}, process.env, env);
  delete e.CHAR_SPRITE;   // ★시트 손잡이는 **코드 기본**으로 잰다(T1068 ① — env 가 빠진 라이브 길과 같은 판)
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}

// ── 페이지 안 갈고리 — `drawNameTag` 를 감싸 부름을 적는다(그대로 부른다 · `__t1068Hide` 가 맞는 짝 이름표 한 줄만 건너뜀) ──
//   `42-r2-char.js` 의 함수 선언은 고전 스크립트 꼭대기라 전역 객체의 칸이다 — 부르는 두 자리(`34-m-renderloop` 시트 길 ·
//   `drawPlayerIso` 도형 길)가 그 이름을 전역에서 찾으므로 감싼 것이 불린다(제품 무접촉 · 하네스 판에서만).
const HOOK = () => {
  if (window.__t1068Hook) return window.__t1068Hook;
  const orig = window.drawNameTag;
  if (typeof orig !== 'function') return (window.__t1068Hook = 'no-fn');
  window.__t1068Tags = [];
  window.__t1068Hide = null;
  window.drawNameTag = function (x, y, name, isMe, act) {
    const m = ctx.getTransform();
    const rec = { name: String(name), isMe: !!isMe, alpha: +ctx.globalAlpha.toFixed(3),
      // 글자 기준선(y − 22)의 캔버스 화소 자리 · 배율(줌 · DPR)
      px: m.a * x + m.c * (y - 22) + m.e, py: m.b * x + m.d * (y - 22) + m.f, sx: Math.hypot(m.a, m.b), sy: Math.hypot(m.c, m.d) };
    const T = window.__t1068Tags; T.push(rec); if (T.length > 300) T.splice(0, T.length - 300);
    if (!isMe && window.__t1068Hide && String(name).indexOf(window.__t1068Hide) !== -1) return;   // 대조 판 — 짝 이름표 한 줄만 안 그린다
    return orig.apply(this, arguments);
  };
  return (window.__t1068Hook = 'ok');
};
// 짝 이름표 상자의 밝기 판 하나(글자 기준선 둘레 — 11px 글자 · 3px 외곽선이 드는 120 × 20 · 배율 곱)
const LUMA = (b) => {
  const cv = document.getElementById('canvas'); const g = cv.getContext('2d'); const W = cv.width, H = cv.height;
  const x0 = Math.max(0, Math.round(b.px - 60 * b.sx)), y0 = Math.max(0, Math.round(b.py - 14 * b.sy));
  const w = Math.min(W - x0, Math.round(120 * b.sx)), h = Math.min(H - y0, Math.round(20 * b.sy));
  if (w < 8 || h < 8) return null;
  const im = g.getImageData(x0, y0, w, h).data, L = new Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = im[i * 4] * 0.3 + im[i * 4 + 1] * 0.6 + im[i * 4 + 2] * 0.1;
  return { L, box: [x0, y0, w, h] };
};

// ── ws 손님(브라우저 없이 · ⑤) — 이름칸 글자만 실어 붙는다 ─────────────────────
function wsGuest(username) {
  return new Promise((resolve) => {
    const q = new URLSearchParams({ name: username || '여행자', color: '#5a9ae0' });
    if (username) q.set('username', username);
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const done = (v) => { clearTimeout(to); try { ws.close(); } catch (e) {} resolve(v); };
    const to = setTimeout(() => done({ kind: 'timeout' }), 30000);
    ws.on('message', (raw) => { let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') done({ kind: 'welcome', name: m.name, playerId: m.playerId });
      else if (m.type === 'auth_error') done({ kind: 'auth_error', reason: m.reason }); });
    ws.on('error', () => done({ kind: 'error' }));
  });
}

(async () => {
  console.log('\n=== 다른 플레이어 이름 — 손님 둘(별명) · 서로 화면 · 시트 켬 · 끔 (T1068 ②) ===');
  const SPOT = openSpot();
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '1', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0',
  });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms` : _up.why);
  ok(await (await _zp).ok, 'zone 기동(존 env 에 CHAR_SPRITE 없음)');

  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  async function newClient(tag) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await page.fill('#name', NICK[tag]);   // ★별명만(비밀번호 칸은 비운다 — 게스트)
    const enter = await page.$('#enter');
    if (enter) await enter.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(1500);
    page._errs = errs; page._tag = tag;
    return page;
  }
  const srvAbs = (pg) => pg.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null) || (window.__getMyAbs ? window.__getMyAbs() : null));
  const teleport = async (pg, x, y) => {
    let d = Infinity;
    for (let i = 0; i < 20; i++) {
      await pg.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(700);
      const c = await srvAbs(pg);
      if (c) d = Math.hypot(c.x - (x + SPOT.WOX), c.y - (y + SPOT.WOY));
      if (d <= 40) break;
    }
    return d;
  };
  const A = await newClient('A');
  const B = await newClient('B');
  ok(!!(await A.evaluate(() => window.__getMyAbs())) && !!(await B.evaluate(() => window.__getMyAbs())), `[상황] 손님 둘이 별명을 치고 들어왔다(${NICK.A} · ${NICK.B} — 비밀번호 없음)`);

  console.log('\n=== ⓪ 상황 ===');
  const cfgA = await A.evaluate(() => (window.__uiCfg ? window.__uiCfg() : null));
  ok(!!cfgA && cfgA.charSprite === true, '★⓪ 시트 기본 켬 — 존 env 에 `CHAR_SPRITE` 가 없어도 `uiCfg.charSprite` 참(T1068 ① · 코드 기본 `!== \'off\'`)', cfgA ? `charSprite=${cfgA.charSprite}` : 'null');
  const dA = await teleport(A, SPOT.x, SPOT.y);
  const dB = await teleport(B, SPOT.x + 56, SPOT.y);   // 56 < 80 — 무조건 보이는 반경(`coneMultEntity`) 안 · 페이싱 무관
  const aAbs = await srvAbs(A), bAbs = await srvAbs(B);
  const gap = aAbs && bAbs ? Math.hypot(aAbs.x - bAbs.x, aAbs.y - bAbs.y) : Infinity;
  ok(dA <= 40 && dB <= 40 && gap < 80, '[상황] 두 손님이 열린 자리에 나란히 섰다(서버 권위) · 사이 < 80px', `A ${dA.toFixed(0)} · B ${dB.toFixed(0)} · 사이 ${Number.isFinite(gap) ? gap.toFixed(0) : 'X'}px`);
  for (const pg of [A, B]) await pg.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); if (window.__terrain19) window.__terrain19.windOff = true; });
  const hooks = [await A.evaluate(HOOK), await B.evaluate(HOOK)];
  ok(hooks.every((h) => h === 'ok'), '[상황] 두 판 다 `drawNameTag` 갈고리가 섰다(전역 함수 하나 — 시트 · 도형 두 길이 부르는 그것)', hooks.join(' · '));
  const pidOf = (pg) => pg.evaluate(() => (typeof myPid !== 'undefined' ? myPid : null));
  const meName = (pg) => pg.evaluate(() => (typeof myName !== 'undefined' ? myName : null));
  const pidA = await pidOf(A), pidB = await pidOf(B);

  // 보는 쪽 V 가 짝 P 를 — 이름 · 부름 · 화소
  async function look(V, P, otherPid, pathName) {
    const tag = `${V._tag}→${P._tag} ${pathName}`;
    let seen = null;
    for (let i = 0; i < 16 && !(seen && seen.name); i++) {
      seen = await V.evaluate((q) => { for (const c of conns.values()) { const o = c.others.get(q); if (o) return { name: o.name, npc: !!o.npc }; } return null; }, otherPid);
      if (!(seen && seen.name)) await sleep(500);
    }
    const want = NICK[P._tag], pSelf = await meName(P);
    ok(!!seen && seen.name === want && !seen.npc,
      `★★① [${tag}] 보는 쪽 \`c.others\` 의 짝 이름 = **짝이 이름칸에 친 별명**`, `"${seen && seen.name}" (별명 "${want}")`);
    ok(pSelf === want && !!seen && seen.name === pSelf, `★① [${tag}] 짝 머리 위 제 이름(\`myName\`) = 남이 보는 그 이름`, `짝 화면 "${pSelf}" · 내 화면 "${seen && seen.name}"`);
    const nm = (seen && seen.name) || want;
    // ② 부름 — 다음 판들에서 그 이름으로 `drawNameTag` 가 불렸나
    await V.evaluate(() => { window.__t1068Tags.length = 0; window.__t1068Hide = null; });
    await sleep(700);
    const calls = await V.evaluate((n) => window.__t1068Tags.filter((r) => !r.isMe && n && r.name.indexOf(n) !== -1), nm);
    const last = calls[calls.length - 1] || null;
    ok(calls.length > 0, `★★② [${tag}] 그 판들에서 \`drawNameTag\` 가 짝의 이름으로 불렸다(isMe 거짓)`, last ? `${calls.length}번 · "${last.name}" · 알파 ${last.alpha} · 자리 (${last.px.toFixed(0)},${last.py.toFixed(0)})` : '0번');
    // ③ 화소 — 짝 이름표 자리: 그린 판 셋 ↔ 그 한 줄만 건너뛴 판 셋
    let outline = null, box = null;
    if (last) {
      const grab = async () => { const r = []; for (let k = 0; k < 3; k++) { await sleep(180); r.push(await V.evaluate(LUMA, last)); } return r; };
      const on = await grab();
      await V.evaluate((n) => { window.__t1068Hide = n; }, nm);
      await sleep(400);
      const off = await grab();
      await V.evaluate(() => { window.__t1068Hide = null; });
      if (on.every(Boolean) && off.every(Boolean)) {
        box = on[0].box; outline = 0;
        for (let i = 0; i < on[0].L.length; i++) {
          if (on.every((s) => s.L[i] < 45) && off.every((s) => s.L[i] >= 45)) outline++;   // 그린 판에서만 늘 어두운 화소 = 글자 외곽선(ⓔ 의 어두운 문턱 45)
        }
      }
    }
    ok(outline != null && outline > 10,
      `★★③ [${tag}] 짝 이름표 자리에 **글자 외곽선이 실제로 그려진다** — 그린 판 셋에서만 어두운 화소가 문턱(10 · \`e2e-charsprite ⓔ\`)을 넘는다(건너뛴 판 셋 = 대조)`,
      outline != null ? `${outline} 화소 · 상자 ${JSON.stringify(box)}` : 'X');
    return { seen, pSelf, calls: calls.length, last, outline, box };
  }

  const R = {};
  for (const [pathName, flag] of [['시트 켬', true], ['시트 끔(도형)', false]]) {
    console.log(`\n=== ${pathName} ===`);
    for (const pg of [A, B]) await pg.evaluate((f) => window.__setCharSprite && window.__setCharSprite(f), flag);
    await sleep(800);
    if (flag) {
      let dbg = null;
      for (let i = 0; i < 16 && !(dbg && dbg.on === true); i++) { dbg = await A.evaluate((q) => ((window.__charDbg || {})[q] || null), pidB); if (!(dbg && dbg.on === true)) await sleep(500); }
      ok(!!dbg && dbg.on === true, `[상황 · ${pathName}] A 화면의 B 가 **시트 길**로 그려진다(\`__charDbg\` · 도형 폴백 아님)`, dbg ? `clip=${dbg.clip}` : 'null');
    }
    R[pathName] = { AB: await look(A, B, pidB, pathName), BA: await look(B, A, pidA, pathName) };
  }

  console.log('\n=== ⑤ 별명 겹침 · 별명 없음 ===');
  const dup = await wsGuest(NICK.B);
  ok(dup.kind === 'auth_error' && dup.reason === 'username_taken', `★⑤ 셋째 손님이 둘째의 별명("${NICK.B}")을 치면 거절 — 남의 계정 이름과 같은 사유(\`username_taken\`)`, JSON.stringify(dup));
  const anon = await wsGuest('');
  ok(anon.kind === 'welcome' && /^여행자/.test(anon.name || '') && anon.name !== '여행자', '★⑤ 이름칸을 비운 손님은 종전 그대로 central 이 지은 `여행자XXXX` — welcome 이 그 이름을 싣는다(머리 위 이름 = 남이 보는 이름)', JSON.stringify(anon));
  const errs = [...A._errs, ...B._errs];
  ok(errs.length === 0, '[상황] 페이지 오류 0', errs.slice(0, 3).join(' | '));
  try { await browser.close(); } catch (e) {}
  if (process.env.T1068_NT_OUT) { try { fs.writeFileSync(process.env.T1068_NT_OUT, JSON.stringify({ R, dup, anon }, null, 1)); } catch (e) {} }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ 하네스 예외 ' + (e && e.stack || e)); console.log(`\n=== ${pass + fail + 1}건 중 PASS ${pass} · FAIL ${fail + 1} ===`); process.exit(1); });
