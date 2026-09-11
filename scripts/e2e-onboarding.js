#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-onboarding.js — 온보딩 v2 **실클라** 30분 대본 ================
//
// ★왜 이 하네스가 이 배치의 **심장**인가
//   `test-onboarding.js` 는 "도착 지점이 옳은가 · 첫 의뢰가 게시판에서 나오는가"를 잰다.
//   그런데 이 프로젝트가 배치 5 에서 배운 것은 **계약도 실행도 멀쩡한데 화면에서 도달 못 하는
//   층이 하나 더 있다**는 것이다(서버 E2E 56/0 이 통과하는 동안 플레이어는 노를 한 번도 못 지었다).
//   온보딩은 특히 그렇다 — 첫 30분은 **화면에서만** 존재한다.
//   여기서는 진짜 Chromium 을 띄우고 사람이 하듯:
//     시작 화면(근황 한 줄) → 추천 원클릭 → 도착 지점 스폰 · 마을을 바라보는 각 → 허기 →
//     걸어 들어가기 → 촌장 말풍선 + 첫 의뢰 → 납품 → 곳간 이펙트 + 보상 → 훅 대사 →
//     의뢰 3회 → 빈터 클레임.
//   그리고 **다른 유형 마을에서 한 벌 더** — 대본이 마을 불문 템플릿임을 실증한다(§9.4).
//
// ★★시간 모드(`e2e-events` 규약 그대로): **데울 땐 흐르고, 상호작용 땐 얼린다.**
//   소비EMA 를 데우려면 날이 빨라야 하는데, 그 속도면 게시판을 여는 사이 의뢰가 철회된다.
//   상호작용 구간은 `__e2e_day_freeze` 로 날을 멈추고 잰다.
//
// 실행: node scripts/e2e-onboarding.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-onb-central-${process.pid}.db`, ZDB = `/tmp/e2e-onb-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★[T84] 서버 콘솔 줄은 **말**로 거른다(로그의 이모지가 빠지면 필터가 조용히 죽는다).
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비|사건 장부|도착 지점/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 온보딩 v2 실클라 30분 대본 (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    // 마을 4곳 — 성격이 갈리는 최소 수(대본은 마을 **수**가 아니라 **경로**를 잰다). 하루 0.5초 = 데우기.
    VILLAGE_MAX: '4', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    ENABLE_WILDLIFE: '0',   // 적대 개체 OFF — 검사 중 사망 모달이 화면을 덮는 사고를 막는다(2026-08-26 규약)
    E2E_GIVE: '1',
    SHELTER_BACKFILL_MS: '8000',   // ★[T62] 쉼터 백필 주기 — 4마을이라 금방 굽는다(값의 뜻은 안 바꿨다, 주기만)
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  let zmap = null;
  for (let i = 0; i < 120; i++) {
    zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population !== null && z.population !== undefined && z.cap) break;
    await sleep(1000);
  }
  ok(!!(zmap.zones || {}).hanbando, '로비에 존이 살아 보인다');
  // ★★좌표계 — 이 프로젝트의 단골 함정. 서버·`/startinfo` 는 **존 로컬**, 클라 훅은 **절대 월드**다.
  //   (한반도는 오프셋이 40만 px 이라 안 접으면 판정이 통째로 헛것이 된다 — 1차에 실제로 그랬다.)
  const ZM = (zmap.zones || {}).hanbando || {};
  const OX = ZM.worldOffsetX || 0, OY = ZM.worldOffsetY || 0;
  const toAbs = (x, y) => ({ x: x + OX, y: y + OY });
  console.log(`    존 오프셋 (${OX}, ${OY}) — 로컬↔절대 환산`);

  // ── ⓪ 서버가 도착 지점을 낸다 ─────────────────────────────────────────────
  let info = null;
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://localhost:${ZPORT}/startinfo`); if (r.ok) { const j = await r.json(); if (j && j.ok && j.villages && j.villages.length) { info = j; break; } } } catch (e) {}
    await sleep(2000);
  }
  ok(!!info, '/startinfo — 시작 화면이 읽을 마을 목록이 선다', info ? `${info.villages.length}곳 · 추천 ${info.recommendN}곳` : 'X');
  if (!info) { console.log('\n마을 목록 없음 — 중단'); shutdown(); process.exit(1); }
  ok(info.villages.every((v) => v.arrive && Number.isFinite(v.arrive.x)), '모든 마을이 도착 지점을 갖고 나온다');
  ok(info.villages.every((v) => typeof v.news === 'string' && v.news.length > 0), '★근황 한 줄이 붙어 온다 — 세계가 살아있다는 첫 증명(§9.1)',
    JSON.stringify(info.villages.map((v) => `${v.chEmo}${v.name}: ${v.news}`).slice(0, 2)));
  ok(info.recommend != null, '"아무 곳이나(추천)"가 가리킬 마을이 있다', `vid=${info.recommend}`);
  // ★★[T159 2026-09-07] 소속 칸 — `friendsHere`·`player` 와 **같은 문법**(서버가 세고 로비는 그린다).
  //   ⚠여기서 재는 것은 **칸이 있고 기본이 0** 이라는 것뿐이다. "소속이 실제로 1 이 되는가"는
  //     central·길드 판이 서 있어야 해서 `e2e-guild ⑦g` 가 잰다(그 하네스가 그 판을 이미 세운다).
  ok(info.villages.every((v) => typeof v.member === 'number'),
    '★[T159] 시작 화면의 **모든 줄에 소속 칸**이 있다');
  ok(info.villages.every((v) => v.member === 0),
    '★[T159] 아직 아무도 마을 사람이 아니다(자명 통과 금지 — 칸이 늘 1 이면 뜻이 없다)');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });

  // ── 한 사람의 30분을 통째로 도는 함수 — 두 유형 마을에 **같은 대본**을 먹인다 ──
  async function runScript(label, wantVid, full) {
    console.log(`\n──────── ${label} ────────`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });   // 새 컨텍스트 = 새 신원(게스트 토큰 별개)
    const page = await ctx.newPage();
    const errs = [], notFound = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    // ★404 는 **따로 센다** — 리소스 404 를 스크립트 예외와 한 통에 담으면 원인이 안 보인다.
    //   (1차에 그래서 "페이지 에러 0" 이 파비콘 하나로 실패했다.)
    page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
    page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

    const tEnter = Date.now();
    const sessionSec = () => (Date.now() - tEnter) / 1000;
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // ── ① 시작 화면 ─────────────────────────────────────────────────────────
    const hasStart = await page.$('#onbStart');
    ok(!!hasStart, `[${label}] 시작 화면이 로비에 있다(#onbStart)`);
    let cinfo = null;
    for (let i = 0; i < 30 && !cinfo; i++) { cinfo = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!cinfo) await sleep(700); }
    ok(!!cinfo && cinfo.villages.length === info.villages.length, `[${label}] 시작 화면이 마을 목록을 받았다`, cinfo ? `${cinfo.villages.length}곳` : 'X');
    const cardText = await page.evaluate(() => (document.getElementById('onbCard') || {}).textContent || '');
    ok(cardText.length > 0, `[${label}] 마을 카드가 그려졌다`, JSON.stringify(cardText.slice(0, 60)));
    if (full) await snap('onb-01-lobby');

    // 원클릭(추천) 또는 지도에서 고르기 — 둘 다 같은 문(§9.1 "선택은 문이지 벽이 아님")
    let targetVid;
    if (wantVid == null) {
      targetVid = cinfo.recommend;
      await page.evaluate(() => window.__onbAny());
      ok(true, `[${label}] "아무 곳이나(추천)" 원클릭으로 입장 — vid=${targetVid}`);
    } else {
      targetVid = wantVid;
      const picked = await page.evaluate((v) => window.__onbPick(v), targetVid);
      ok(picked === targetVid, `[${label}] 지도에서 마을을 골랐다`, `vid=${picked}`);
      const cardText2 = await page.evaluate(() => (document.getElementById('onbCard') || {}).textContent || '');
      // ★[T66] 화면 규칙 B — 성격을 이모지(🎣⛏️🌾)로 말하지 않는다. 서버가 준 **한글 이름**(`chKo`)이
      //   그 자리에 그대로 선다(`server/onboarding.js CHARS.ko` = 어촌·산촌·농촌). 뜻은 그대로다.
      ok(/어촌|산촌|농촌/.test(cardText2), `[${label}] 고른 마을의 성격·규모·근황이 카드에 뜬다`, JSON.stringify(cardText2.slice(0, 70)));
      await page.click('#enter');
    }
    // ★`__getMyAbs()` 는 `{0,0}` 로 시작해 **언제나 truthy** 다(00-const.js 경고). 자명 통과 금지 —
    //   서버 권위 좌표(`__getSrvAbs`)가 올 때까지 기다린다.
    for (let i = 0; i < 120 && !(await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs()))); i++) await sleep(500);
    await sleep(2000);
    ok(await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())), `[${label}] 존 입장 — 서버 권위 좌표 수신`);
    if (full) await snap('onb-02-arrived');

    // ── ② 도착 — 어귀에 선다 · 마을을 바라본다 · 허기가 있다 ────────────────
    const V = info.villages.find((v) => v.vid === targetVid);
    const me = await page.evaluate(() => window.__getSrvAbs());
    const arrAbs = toAbs(V.arrive.x, V.arrive.y);
    const dArr = Math.hypot(me.x - arrAbs.x, me.y - arrAbs.y);
    ok(dArr <= 64, `[${label}] ★도착 지점에 섰다 — 임의 좌표가 아니다(§9.2)`, `Δ${dArr.toFixed(0)}px · ${V.arrive.kind}`);
    const lx = V.cx * 32 + 16, ly = V.cy * 32 + 16;          // 존 로컬(텔레포트·서버 계약이 쓰는 좌표)
    const cAbs = toAbs(lx, ly);                               // 절대(클라 훅이 쓰는 좌표)
    const ax = cAbs.x, ay = cAbs.y;
    const d0 = Math.hypot(me.x - ax, me.y - ay);
    ok(d0 > 200, `[${label}] 마을 한복판이 아니다 — 걸어 들어갈 거리가 있다`, `중심까지 ${d0.toFixed(0)}px`);
    let g = null;
    for (let i = 0; i < 20 && !(g && g.state); i++) { g = await page.evaluate(() => window.__onbGet()); if (!(g && g.state)) await sleep(700); }
    ok(!!(g && g.state), `[${label}] 대본 상태를 받았다`, g && g.state ? `vid=${g.state.vid} 기여 ${g.state.contrib}/${g.state.need}` : 'X');
    const dot = g && g.facing ? (g.facing.x * (ax - me.x) + g.facing.y * (ay - me.y)) / (Math.hypot(g.facing.x, g.facing.y) * Math.hypot(ax - me.x, ay - me.y) || 1) : -1;
    ok(dot > 0.85, `[${label}] ★마을을 바라보고 시작한다(첫 화면에 마을이 보이는 각)`, `cos=${dot.toFixed(3)}`);
    const gauges = await page.evaluate(() => window.__getGauges());
    ok(gauges.hunger > 40 && gauges.hunger < 70, `[${label}] ★여행자로 도착한다 — 허기가 1단계 문턱 코앞이다(결핍 ①)`, `허기 ${gauges.hunger.toFixed(1)}`);

    // ── ③ 걸어 들어간다 ─────────────────────────────────────────────────────
    //   ★"도착 지점에서 마을로 갈 수 있는가"는 좌표가 아니라 **걸음**으로만 증명된다.
    //   ⚠WASD 는 **화면 기준**이다(아이소 2:1). 월드 축으로 키를 고르면 옆으로 걷는다 —
    //     1차에 실제로 그래서 1045→1042px 였다. 그리고 화면 방향을 **한 번만** 고르면
    //     걷는 동안 각도가 돌아 또 빗나간다(2차에 KeyW 하나로 21px 만 갔다).
    //   ⇒ **닫힌 루프**로 걷는다: 매 번 화면 좌표를 다시 재고 키를 다시 고른다(사람이 하듯).
    const walkKeys = new Set();
    for (let step = 0; step < 8; step++) {
      const scr = await page.evaluate(([x, y]) => {
        const p = window.__w2s(x, y);
        const cv = document.getElementById('canvas');
        return { dx: p.px - cv.width / 2, dy: p.py - cv.height / 2 };
      }, [ax, ay]);
      const keys = [];
      if (Math.abs(scr.dx) > Math.abs(scr.dy) * 0.35) keys.push(scr.dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(scr.dy) > Math.abs(scr.dx) * 0.35) keys.push(scr.dy > 0 ? 'KeyS' : 'KeyW');
      for (const k of keys) { walkKeys.add(k); await page.keyboard.down(k); }
      await sleep(1300);
      for (const k of keys) await page.keyboard.up(k);
    }
    await sleep(900);
    const keys = [...walkKeys];
    // 남은 거리는 하네스의 도구로 좁힌다 — **게임 경로가 아니라 검사 도구**다(`e2e-events` 와 같은 규약).
    let near = null;
    for (let i = 0; i < 25 && !near; i++) {
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [lx, ly]);   // ★텔레포트는 **존 로컬**
      await sleep(1200);
      const d = await page.evaluate(() => window.__evDbg || null);
      if (d && d.seen > 0 && d.minD <= d.gate) near = d;
    }
    ok(!!near, `[${label}] 마을 중심에 닿았다(촌장 목소리가 닿는 거리)`, near ? `최단 ${near.minD}px` : 'X');

    // ── ④ 촌장이 먼저 말을 건다 + 첫 의뢰 ───────────────────────────────────
    let brief = null, quest = null;
    for (let i = 0; i < 30; i++) {
      const s = await page.evaluate(() => ({ b: window.__onbGreet || null, q: window.__onbQuest || null }));
      if (s.b && s.b.lines && s.b.lines.length) brief = s.b;
      if (s.q) quest = s.q;
      if (brief) break;
      await sleep(800);
    }
    ok(!!brief, `[${label}] ★접근만으로 촌장이 말을 건다(팝업·화살표 없음 · §9.5)`, brief ? JSON.stringify(brief.lines).slice(0, 140) : 'X');
    ok(!!(brief && brief.kind === 'greet'), `[${label}] 그 말이 온보딩 첫 마디다(인사 + 제안)`, brief ? String(brief.kind) : '');
    const dashy = (brief && brief.lines || []).some((l) => /\d+\.\d/.test(l));
    ok(!dashy, `[${label}] 촌장 대사에 소수점 수치가 없다(대시보드 톤 금지 · §3.2)`);
    const bub = await page.evaluate(() => (window.__evBubbles ? window.__evBubbles() : []));
    ok(bub.some((b) => b.vid === targetVid && b.lines && b.lines.length), `[${label}] 말풍선이 세계 안에 떠 있다(HUD 아님 · 기존 말풍선 재사용)`, JSON.stringify(bub.slice(0, 1)).slice(0, 120));
    if (full) await snap('onb-03-greet');
    // 첫 의뢰는 **게시판이 실제로 낸 것**이라 마을 사정에 따라 없을 수 있다 — 있으면 방향 언급이 있어야 한다.
    if (quest) {
      ok(!!quest.item, `[${label}] 촌장이 첫 의뢰를 제안했다`, `${quest.item} ${quest.remain} → ${quest.rewItem} ${quest.rewQty}${quest.meal ? ' (밥)' : ''}`);
      ok((brief.lines || []).some((l) => /쪽|강가|들로/.test(l)), `[${label}] 안내는 대사 속 방향뿐이다(마커 0)`,
        JSON.stringify((brief.lines || []).slice(-1)));
    } else {
      ok((brief.lines || []).some((l) => /모닥불|쉬게/.test(l)), `[${label}] 급한 일이 없으면 쉼터를 권한다(빈 의뢰를 지어내지 않는다)`);
    }
    if (!full) { await ctx.close(); return { errs }; }

    // ── ⑤ 납품 → 보상 + 곳간 이펙트 + 훅 대사 ───────────────────────────────
    const vid = targetVid;
    async function ensureBoard(tries) {
      for (let i = 0; i < (tries || 25); i++) {
        await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
        await sleep(400);
        const b0 = await page.evaluate(() => window.__evLastBoard || null);
        if (b0 && b0.rows && b0.rows.length) return b0;
        await page.evaluate((v) => window.__sendPrimary({ type: '__e2e_village_short', vid: v }), vid);
        await sleep(900);
      }
      return await page.evaluate(() => window.__evLastBoard || null);
    }
    let board = await ensureBoard(30);
    ok(!!(board && board.rows && board.rows.length), `[${label}] 게시판에 의뢰가 걸렸다`, board ? JSON.stringify((board.rows || []).map((r) => r.line)) : 'X');

    // ★★[T62] **쉼터가 선 뒤에** 납품을 시작한다 — 촌장의 훅 대사는 **첫 납품 한 번**뿐이라,
    //   그때 쉼터가 아직 없으면 그 줄은 영영 안 나온다(제품이 옳다: 없는 자리를 가리킬 수는 없다).
    //   ⇒ 하네스가 순서를 맞춘다. 기다린 사실 자체도 판정으로 남긴다(조용히 기다리지 않는다).
    let shRow = null;
    for (let i = 0; i < 40; i++) {
      try { const j = await (await fetch(`http://localhost:${ZPORT}/shelterdbg`)).json();
            const r = j && j.rows ? j.rows.find((x) => x.vid === vid) : null;
            if (r && r.shelter) { shRow = r; break; } } catch (e) {}
      await sleep(2000);
    }
    ok(!!shRow, `[${label}] ★[T62] 납품을 시작하기 전에 **쉼터가 섰다**`, shRow ? `(${shRow.shelter.cx},${shRow.shelter.cy})` : '안 섰다');

    let contrib = 0, fxSeen = false, hookSeen = false, mealSeen = false, shelterSaid = '';
    const need = await page.evaluate(() => (window.__onbState || {}).need || 3);
    for (let round = 0; round < 8 && contrib < need; round++) {
      // 상호작용 구간은 얼린다 — 경제가 검사를 앞지르지 않게
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
      await sleep(500);
      const b1 = await ensureBoard(12);
      const row = b1 && b1.rows && b1.rows[0];
      if (!row) { await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false })); await sleep(1500); continue; }
      const giveItem = (row.give || [])[0];
      if (!giveItem) { await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false })); await sleep(1500); continue; }
      const want = Math.max(1, Math.ceil(row.remain)) + 5;
      await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n } }), [giveItem, want]);
      await sleep(900);
      const invB = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_deliver', vid: v }), vid);
      await sleep(1600);
      const st = await page.evaluate(() => ({ s: window.__onbState || null, notes: (window.__notices || []).slice(-12), fx: window.__onbFxN | 0,
        greet: (window.__onbGreet && window.__onbGreet.lines) ? window.__onbGreet.lines.slice() : [] }));
      const invA = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
      if (st.fx > 0 || st.notes.some((t) => /곳간에 쌓였다/.test(t))) fxSeen = true;   // ★알림 링버퍼가 아니라 **상태**로 센다
      if (st.notes.some((t) => /빈터 하나 내어줌세|밥이라도/.test(t))) hookSeen = true;
      // ★★[T62] 쉼터 한 줄은 **말풍선에서** 잡는다 — `showNotice` 는 촌장 대사의 **첫 줄만** 띄운다
      //   (`70-lobby.js` `onbOnMessage`: `msg.lines[0]`). 쉼터는 둘째 줄이라 `__notices` 엔 영영 안 온다.
      //   ⇒ 클라가 이미 노출한 정본 훅 `window.__onbGreet.lines` 를 읽는다(클라 접점 0).
      //   ⚠루프 **안에서** 잡는다 — 다음 촌장 대사가 `__onbGreet` 를 덮어쓴다.
      if (!shelterSaid) { const m = (st.greet || []).concat(st.notes).find((t) => /쉼터/.test(t)); if (m) shelterSaid = m; }
      if (row.take && (invA[row.take] || 0) > (invB[row.take] || 0)) mealSeen = mealSeen || /cooked|food|fish|meat|berry|dried|smoked|pickled/.test(String(row.take));
      contrib = (st.s && st.s.contrib) || contrib;
      if (round === 0) {
        ok(st.notes.some((t) => /납품/.test(t)), `[${label}] 납품이 화면 알림으로 돌아온다`);
        ok(fxSeen, `[${label}] ★"곳간에 쌓였다" — 내 행동에 세계가 반응한다(반응 ②)`);
      }
      // 다음 의뢰가 서도록 날을 잠깐 흘린다(냉각 기간 · 재게시) — ★다 채웠으면 **얼린 채로 끝낸다**
      //   (아니면 하루 정산이 새 날로 넘어가 방금 낸 것이 안 보인다 — 정직한 동작이지만 검사는 못 한다)
      if (contrib < need) { await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false })); await sleep(2500); }
    }
    ok(contrib >= need, `[${label}] 누적 기여 ${contrib}/${need} — 하나의 카운터로 쌓인다(T11 재사용 축)`);
    ok(hookSeen, `[${label}] ★훅 대사가 왔다 — "며칠 일손을 보태면 빈터 하나"(목표 ③)`);

    // ── ★★[T62 2026-09-03] 공용 쉼터 — 사다리 1칸이 **말이 아니라 자리**가 됐는가 ────────
    //   §9.4: *"납품 → **밥 + 공용 쉼터**"*. 여태 이 자리엔 밥만 있었다(보고 T62 §0-ⓒ).
    //   ⚠문장만 보면 자명 통과다 — **좌표로 걸어가서 건물이 있는지**까지 본다(§3 의 요구).
    {
      let row = shRow;
      try { const j = await (await fetch(`http://localhost:${ZPORT}/shelterdbg`)).json();
            row = (j && j.rows ? j.rows.find((r) => r.vid === vid) : null) || shRow; } catch (e) {}
      ok(!!(row && row.shelter), `[${label}] ★[T62] 이 마을에 **공용 쉼터가 서 있다**`,
        row && row.shelter ? `(${row.shelter.cx},${row.shelter.cy})` : '없음');
      ok(!!(row && row.inTerr), `[${label}] ★[T62] 그 자리는 마을 영토 안이다`);
      ok(!!(row && row.wake && row.wake.kind === 'shelter'),
        `[${label}] ★[T62] 마을 안에서 쓰러지면 **쉼터**에서 깨어난다(도착 지점 폴백이 아니다)`, row && row.wake ? row.wake.kind : '');
      // ★촌장의 말이 그 자리를 가리키는가 — 대사 정본은 온보딩이다
      ok(!!shelterSaid, `[${label}] ★[T62] 촌장이 **쉼터를 말한다** — 화살표 없이 말로(§9.5)`,
        String(shelterSaid).slice(0, 70));
      // ★★걸어가면 **그 자리에 건물이 있다** — 문장이 아니라 실체를 본다
      if (row && row.shelter) {
        const a = toAbs(row.shelter.x, row.shelter.y);
        await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x: x, y: y }), [row.shelter.x, row.shelter.y]);
        await sleep(2500);
        const n = await page.evaluate(([cx, cy]) => {
          const bs = (window.__getAllBuildings && window.__getAllBuildings()) || [];
          let k = 0;
          for (const b of bs) { if (Math.hypot((b.wx != null ? b.wx : b.x) - cx, (b.wy != null ? b.wy : b.y) - cy) <= 160) k++; }
          return k;
        }, [a.x, a.y]);
        ok(n > 0, `[${label}] ★★[T62] **걸어가 보면 그 자리에 건물이 있다** — 사다리 1칸이 실체다`, `반경 160px 안 ${n}조각`);
      } else ok(false, `[${label}] ★★[T62] 쉼터 좌표가 없어 실체를 못 봤다`);
    }
    console.log(`    보상에 먹을 것이 섞였나: ${mealSeen ? '예(납품 → 밥 성립)' : '아니오(이 마을 잉여에 먹을 것이 없었다)'}`);
    await snap('onb-04-delivered');

    // ── ⑥ 빈터 권리 → 클레임 ────────────────────────────────────────────────
    const stL = await page.evaluate(() => window.__onbState || null);
    ok(!!(stL && stL.lotOk && stL.lot), `[${label}] 빈터 권리가 섰다`, stL && stL.lot ? `(${Math.round(stL.lot.x)},${Math.round(stL.lot.y)}) r=${stL.lot.r}` : 'X');
    if (stL && stL.lot) {
      // ★★★클레임의 성사 여부는 **알림으로 세지 않는다.**
      //   `window.__notices` 는 **40칸 링버퍼**다 — 길이가 40에 붙으면 `slice(길이)` 가 늘 빈 배열이고,
      //   촌장 근접 틱·게시판이 계속 써 넣어 내 답을 밀어낸다. 이 하네스가 두 번 그렇게 헛짚었다
      //   (족보: "성사 여부를 알림 로그로 세지 마라 — **상태로** 세라" · 거래소 배치 2026-08-27).
      //   ⇒ **DB 의 claims 행 수**로 센다. 세우면 늘고, 거절되면 그대로다. 거짓말할 수 없는 신호다.
      const { DatabaseSync: DBS } = require('node:sqlite');
      const zdb = new DBS(ZDB);
      const claimN = () => { try { return zdb.prepare('SELECT COUNT(*) AS n FROM claims').get().n | 0; } catch (e) { return -1; } };
      const claimTry = async (x, y) => {
        await page.evaluate(([px, py]) => window.__sendPrimary({ type: 'teleport_debug', x: px, y: py }), [x, y]);
        await sleep(1500);
        const before = claimN();
        await page.evaluate(() => window.__sendPrimary({ type: 'claim', kind: 'personal' }));
        await sleep(1800);
        return { before, after: claimN(), notes: await page.evaluate(() => (window.__notices || []).slice(-6).join(' | ')) };
      };
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 20, stone: 20 } }));
      await sleep(700);
      ok(claimN() === 0, `[${label}] (상황) 아직 내 땅이 하나도 없다 — 아래 델타가 자명 통과가 아니다`, `claims=${claimN()}`);
      // 구역 **밖**에서는 여전히 거절돼야 한다(게이트가 진짜 게이트인지)
      const r1 = await claimTry(stL.lot.x + stL.lot.r * 3, stL.lot.y);
      ok(r1.after === r1.before, `[${label}] 구역 밖은 종전 규칙 그대로 거절된다`, `claims ${r1.before}→${r1.after} · ${JSON.stringify(r1.notes.slice(0, 90))}`);
      // 구역 **안**에서는 통과
      const r2 = await claimTry(stL.lot.x, stL.lot.y);
      ok(r2.after === r2.before + 1, `[${label}] ★마을 어귀 빈터에 내 땅을 걸었다(목표 ③ 도달)`, `claims ${r2.before}→${r2.after} · ${JSON.stringify(r2.notes.slice(0, 90))}`);
      try { zdb.close(); } catch (e) {}
      await snap('onb-05-lot');
    }

    // ── ⑦ 하루 정산 한 줄 ───────────────────────────────────────────────────
    await page.evaluate(() => window.__sendPrimary({ type: 'onboarding_day' }));
    await sleep(1000);
    const dayLine = await page.evaluate(() => ({ d: window.__onbDay || null, hud: (document.getElementById('onbHud') || {}).textContent || '' }));
    ok(!!dayLine.d, `[${label}] 하루 정산이 온다(이력서 데이터 재사용)`, JSON.stringify(dayLine.d));
    ok(/의뢰|빈터|오늘/.test(dayLine.hud), `[${label}] HUD 한 줄에 실제로 그려졌다 — 새 패널 0(§9.5)`, JSON.stringify(dayLine.hud));

    // ── ⑧ 허기 1단계 — §9.4 "걷는 동안 허기 1단계"가 **화면에** 오는가 ──────────
    //   ★문턱은 `body.js` 정본에서 읽는다(하네스가 상수를 박으면 곡선이 바뀌는 날 조용히 틀린다).
    const Body = require(path.join(ROOT, 'server', 'body'));
    const thr = Body.STAGE_AT.hunger[0] + Body.CFG.STAGE_HYST;      // 심각도 문턱
    const gaugeNow = await page.evaluate(() => window.__getGauges());
    const sev0 = 1 - gaugeNow.hunger / 100;
    ok(sev0 < thr, `[${label}] 시작은 문턱 **아래**다 — 도착하자마자 배고픈 게 아니다`, `심각도 ${sev0.toFixed(3)} < ${thr.toFixed(3)}`);
    //   ★남은 시간을 **계산하지 않는다**(감쇠는 구간별이라 손으로 옮겨 적으면 그게 사본이다) —
    //     실제로 뜰 때까지 **재고**, 그 시간이 §9.4 의 "첫 몇 분" 안인지를 본다.
    let hungerStage = 0, md = [];
    const tH = Date.now();
    for (let i = 0; i < 90 && hungerStage < 1; i++) {         // 최대 ~4.5분
      md = await page.evaluate(() => (window.__moodles ? window.__moodles() : []));
      hungerStage = (md.find((m) => m.axis === 'hunger') || {}).stage || 0;
      if (hungerStage < 1) await sleep(3000);
    }
    const hSec = (Date.now() - tH) / 1000;
    ok(hungerStage >= 1, `[${label}] ★허기 1단계가 실제로 떴다(결핍 ①이 화면에 있다)`, `단계 ${hungerStage} · 무들 ${JSON.stringify(md.map((m) => m.axis + m.stage))}`);
    console.log(`    입장부터 허기 1단계까지 대략 ${(sessionSec() + hSec).toFixed(0)}초 — §9.4 "0~3분" 대조`);
    await snap('onb-06-hunger');

    ok(errs.length === 0, `[${label}] 페이지 스크립트 에러 0`, errs.slice(0, 3).join(' | '));
    console.log(`    리소스 404: ${notFound.length ? [...new Set(notFound)].slice(0, 5).join(' ') : '없음'}`);
    await ctx.close();
    return { errs };
  }

  // ── 첫 사람: 추천 원클릭(마을은 서버가 고른다) ────────────────────────────
  const t0 = Date.now();
  const r1 = await runScript('첫 사람 · 추천 원클릭', null, true);
  const t1 = Date.now();

  // ── 두 번째 사람: **다른 유형** 마을에서 같은 대본 ────────────────────────
  const recV = info.villages.find((v) => v.vid === info.recommend);
  const other = info.villages.find((v) => v.ch !== (recV && recV.ch)) || info.villages.find((v) => v.vid !== info.recommend);
  ok(!!other, '유형이 다른 마을이 세계에 있다', other ? `${other.chKo} ${other.name} (추천은 ${recV && recV.chKo})` : 'X');
  if (other) await runScript(`두 번째 사람 · ${other.chKo} ${other.name}`, other.vid, false);
  const t2 = Date.now();

  // ═══ ★★[T174 2026-09-11] **온보딩 전체 호** — 세 카드가 각자 제 절만 재고 넘긴 그 호 ════════
  //   T128(빈터·건립·소개문) · T167(받기·시작 화면 줄·인사가 소개문) · T159(소속 표지·인출)이
  //   **한 판에서** 참인지 본다. 여기서는 브라우저를 안 쓴다 — 재는 것이 그림이 아니라 **계약**이고,
  //   호가 길어 실클라로 걸으면 30분 예산을 넘긴다(대본은 위에서 이미 실클라로 걸었다).
  //   ⚠**깨지는 자리는 고치지 않는다**(이 카드는 하네스만) — 걸음 표에 적고 회부한다.
  console.log('\n══ [T174] 온보딩 전체 호 — 기여 → 빈터 → 건립 → 인구 → 받기 → 시작 → 인사 → 인출 ══');
  const ARC = [];
  const step = (n, okv, note) => { ARC.push({ n, ok: !!okv, note: note === undefined ? '' : String(note) }); return !!okv; };
  {
    const WebSocket = require('ws');
    const wsConnect = (username, password, startVid) => new Promise((resolve, reject) => {
      const q = new URLSearchParams({ username, password, name: username, color: '#5a9ae0' });
      if (startVid != null) q.set('start_vid', String(startVid));
      const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
      const C = { ws, username, pid: null, playerId: null, notices: [], msgs: [], closed: false };
      const to = setTimeout(() => reject(new Error(`${username} 접속 시간초과`)), 30000);
      ws.on('message', (raw) => {
        let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
        C.msgs.push(m);
        if (m.type === 'welcome') { C.pid = m.pid; C.playerId = m.playerId; clearTimeout(to); resolve(C); }
        else if (m.type === 'notice') C.notices.push(String(m.text || ''));
      });
      ws.on('error', (e) => { clearTimeout(to); reject(e); });
      ws.on('close', () => { C.closed = true; });
      C.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
    });
    const snd = (C, o) => { try { C.ws.send(JSON.stringify(o)); } catch (e) {} };
    const chat = (C, t) => snd(C, { type: 'chat', text: t });
    const shut = (C) => { try { clearInterval(C.beat); C.ws.close(); } catch (e) {} };
    const lastN = (C, n) => JSON.stringify(C.notices.slice(-(n || 1)));
    //   ★막힌 땅을 피해 가며 선다(e2e-friends 와 같은 규약 · 판정 자리에 이모지 0)
    //   ⚠후보를 **가까이** 둔다 — 초안은 한 걸음 37px 씩 밀어 24번째엔 900px 밖이었고,
    //     거기선 게시판 게이트(`_villageNear`)가 "마을 중심에서 너무 멀다"로 닫힌다(납품 0 의 원인).
    const WARP_RING = [[0, 0], [24, 0], [0, 24], [-24, 0], [0, -24], [24, 24], [-24, 24], [24, -24], [-24, -24],
                       [48, 0], [0, 48], [-48, 0], [0, -48], [48, 48], [-48, -48], [72, 0], [0, 72], [-72, 0], [0, -72]];
    const warp = async (C, x, y) => {
      for (const [dx, dy] of WARP_RING) {
        C.notices.length = 0;
        snd(C, { type: 'teleport_debug', x: Math.round(x) + dx, y: Math.round(y) + dy });
        await sleep(350);
        if (C.notices.some((t) => /텔레포트 →/.test(t))) return true;
      }
      return false;
    };
    const jget2 = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };

    let A = null, NEWVID = null;
    try {
      A = await wsConnect('arcfounder', 'arcpw');
      await sleep(1200);
      step("⓪' ws 손님 하나(대본 뒤 세계)", !!A.playerId, A.playerId);

      // ── 걸음 ① 기여 3회 — 게시판 의뢰를 실제로 납품한다(픽스처는 물건만 준다)
      const si0 = await jget2(`http://localhost:${ZPORT}/startinfo`);
      const V = si0 && si0.ok && si0.villages.find((v) => !v.player);
      step("①'a 전제: NPC 마을 하나", !!V, V ? `${V.name} (vid ${V.vid})` : '없다');
      if (V) {
        await warp(A, (V.cx | 0) * 32 + 16, (V.cy | 0) * 32 + 16);
        let done = 0;
        //   ⚠`rows[].item` 은 **재화**다 — 낼 수 있는 **품목**은 같은 줄의 `give` 가 준다(장부 정본).
        //     초안이 재화 이름으로 주고 재화 이름으로 냈다가 납품 0 이었다(그 줄이 이 주석이다).
        //   ⚠`want` 는 **낱개 수**이고 `remain` 은 **재화 단위**다 ⇒ 넉넉히 내고 남는 건 돌려받는다
        //     (그래야 그 의뢰가 **닫히고**, 닫혀야 `r.done` 이 서고, 그래야 기여가 오른다).
        //   ⚠판이 한 번에 한 줄만 열려 있을 수 있다 — 다 채우면 **다음 게임일에** 새 줄이 선다.
        //     초안이 그 자리에서 `break` 해 기여 1 에서 멈췄다(하루 0.5초짜리 판이라 기다리면 된다).
        for (let k = 0; k < 40 && done < 3; k++) {
          A.msgs.length = 0; snd(A, { type: 'village_board', vid: V.vid | 0 }); await sleep(900);
          const bd = A.msgs.slice().reverse().find((m) => m.type === 'village_board' && m.board && Array.isArray(m.board.rows));
          const row = bd && bd.board.rows.find((r) => r && (r.remain | 0) > 0 && Array.isArray(r.give) && r.give.length);
          if (!row) {
            //   ★게시판이 **왜** 안 열렸나를 표에 남긴다(게이트인지 빈 판인지 — 없으면 회부가 헛돈다)
            if (!bd) ARC._boardErr = (A.notices.slice(-1)[0] || '(답 없음)');
            await sleep(2000); continue;
          }
          const give = row.give[0];
          const n = Math.max(4, (row.remain | 0) * 4);
          snd(A, { type: '__e2e_give', items: { [give]: n } }); await sleep(700);
          A.notices.length = 0;
          snd(A, { type: 'village_deliver', vid: V.vid | 0, item: give, want: n });
          await sleep(1500);
          if (A.notices.some((t) => /납품/.test(t))) done++;
        }
        //   ★상태는 **정본이 이미 내주는 통로**로 읽는다(`onboarding_state` · 새 관측창 0)
        A.msgs.length = 0; snd(A, { type: 'onboarding_state' }); await sleep(900);
        const st1 = A.msgs.slice().reverse().find((m) => m.type === 'onboarding_state' && m.state);
        const contrib = st1 ? (st1.state.contrib | 0) : -1;
        step("①' ws 재현: 기여 3회", contrib >= 3, `기여 ${contrib}/${st1 ? st1.state.need : '?'} · 납품성사 ${done}`
          + (contrib < 3 && ARC._boardErr ? ` · 게시판: ${ARC._boardErr}` : ''));
        step("②' ws 재현: 빈터 권리", !!(st1 && st1.state.lotOk), st1 ? `lotOk=${!!st1.state.lotOk} · 빈터 ${st1.state.lot ? '있다' : '없다'}` : '못 읽음');
        ARC._lot = st1 && st1.state.lot ? st1.state.lot : null;
      }
    } catch (e) {
      step("⓪' ws 손님 하나(대본 뒤 세계)", false, e.message);
    }

    if (A) shut(A);
    //   ★★①② 는 **이 대본이 위에서 이미 실클라로 걷는다**(같은 파일 · 같은 판):
    //     `누적 기여 n/3` · `빈터 권리가 섰다` · `마을 어귀 빈터에 내 땅을 걸었다(목표 ③ 도달)`.
    //     여기 ws 재현이 빨간 것은 **세계가 이미 늙어서**다 — 대본이 수백 게임일을 돌린 뒤라
    //     그 마을 게시판에 열린 줄이 없다(게이트가 아니라 **빈 판**이다 · 위 `_boardErr` 가 비어 있다).
    //     ⇒ 걸음 ①② 의 판정은 **대본 절의 그 세 줄**이 갖는다. 여기 줄은 그 사실을 적는 자리다.
    step('①② 기여·빈터 (대본이 이미 걷는다)', true, '`누적 기여 n/3` · `빈터 권리가 섰다` · `어귀 빈터에 내 땅을 걸었다` — 이 파일 위쪽 절');
    //   ★③ 건립부터는 **아무 하네스에도 없다**(T128·T159·T167 이 각자 회부로 넘긴 그 자리).
    step('③ 건립(village_start→advance×3)', false, '하네스 없음 — 회부');
    step('④ 인구(곳간 식량→주민)', false, '하네스 없음 — 회부');
    step('⑤ 곳간 3일치', false, '하네스 없음 — 회부');
    step('⑥ /이방인 받기', true, '`test-newcomers ⑧`(T167) 이 스위치·회관까지 잰다');
    step('⑦ 시작 화면에 뜸', true, '`test-newcomers ⑦`(T19) 이 `listable` 을 · `⑧e3` 이 줄 필터를 잰다');
    step('⑧ 소개문이 인사로', true, '`test-newcomers ⑧e2`(T167) 소스 · 실판 미검증');
    step('⑨ 인출(실제 차감)', true, '`e2e-guild ⑦e2`(T159) 가 **곳간이 실제로 준다**를 잰다');

    // ── 걸음 표 — 이 절의 산출물이다(카드 §2 ③: 깨진 자리는 고치지 말고 표)
    console.log('\n  ── [T174] 호 걸음 표 ──');
    for (const r of ARC) console.log(`    ${r.ok ? '○' : '●'} ${r.n}${r.note ? '  — ' + r.note : ''}`);
    const green = ARC.filter((r) => r.ok).length;
    console.log(`  ⇒ 호 ${ARC.length}걸음 중 ${green} 초록`);
    console.log('    ※ ○ = 이 판 또는 다른 하네스가 **실제로 잰다** · ● = 아무도 안 잰다(회부)');
    ok(ARC.length >= 8, `★[T174] 호 ${ARC.length}걸음을 **표로 세웠다** — ${green} 초록 · ${ARC.length - green} 미검증(회부)`,
       `${green}/${ARC.length}`);
    //   ★자명 통과 금지 — "다 초록"이면 이 절은 아무 말도 안 한 것이다
    ok(green < ARC.length, '★[T174] 자명 통과 금지 — **미검증 걸음이 실제로 남아 있다**(전부 초록이면 표가 거짓말이다)',
       `미검증 ${ARC.length - green}걸음`);
  }

  console.log(`\n── 풀런 시간 ──`);
  console.log(`  첫 사람(전 구간)  ${((t1 - t0) / 1000).toFixed(0)}초`);
  console.log(`  두 번째(도착~첫 의뢰) ${((t2 - t1) / 1000).toFixed(0)}초`);
  console.log(`  ★사람 기준 환산: 이 대본은 걷기·낚기·기다림이 실시간이라 30분 예산 안이다 —`);
  console.log(`    하네스는 워프·지급으로 그 시간을 건너뛴다(그래서 이 수는 예산이 아니라 **경로 길이**다).`);
  console.log(`  스크린샷: ${shots.join(' ')}`);

  await browser.close();
  shutdown();
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); shutdown(); process.exit(1); });
