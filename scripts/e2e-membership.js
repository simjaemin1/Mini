#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-membership.js — 마을 소속·곳간 인출 **실클라** E2E [T11] =======
//
// ★왜: `test-membership` 은 **판정 층**에서 계약을 잰다(게이트·한도·역연산·직렬화).
//   그런데 이 카드가 플레이어에게 약속하는 것은 그게 아니다:
//     *"몇 번 갖다 주면 촌장이 마을 사람으로 받아 주고, 그때부터 곳간에서 곡식을 꺼내 먹을 수 있다."*
//   그 문장은 **납품 훅 → 계량기 → 문턱 → 채팅 명령 → 거래소 창 한 줄 → 인출 통로**가
//   전부 맞물려야 참이 된다. 판정이 다 맞아도 화면에 줄이 없으면 플레이어에겐 없는 기능이다.
//
// ★★문턱을 낮춰 돌린다 — 그리고 그 사실을 여기 적는다(`e2e-chronicle` 과 같은 규약).
//   소속 문턱 12(K-2 확정)를 실클라에서 채우려면 **의뢰 12건을 완수**해야 하고, 의뢰는 하루
//   경계마다 서므로 이 검사가 재는 것이 배선이 아니라 **경제 속도**가 된다.
//   ⇒ `MEMBER_N=3` 으로 낮춰 켠다. **문턱의 값 자체는 `test-membership ①` 이 정본으로 잰다**
//     (거기서는 11 거절 / 12 제안을 실제 상수로 검사한다). 여기서 재는 것은 **통로**다.
//
// ★재는 것 — 실기 3줄 그대로
//   ① 마을에 도착해 의뢰를 채운다 → 계량기가 오른다 → 촌장이 **먼저** 권한다.
//   ② 채팅에 `/소속` — **새 클라 조건 0**(채팅은 이미 있다). 마을 사람이 된다.
//   ③ 거래소 창에 **소속 한 줄**이 뜨고, 거기 있는 버튼으로 곳간에서 곡식을 꺼낸다.
//   ④ 오늘 몫을 다 쓰면 거절당한다(한도가 살아 있다).
//   ⑤ 재접속해도 소속이 살아 있다(몸에 실려 있다).
//   ⑥ `/탈퇴` 하면 나가지되 **누적 기여는 남는다**.
//   ⑦ ★자명 통과 방지 — 소속 전에는 인출이 거절되는가.
//
// 실행: node scripts/e2e-membership.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-mb-central-${process.pid}.db`, ZDB = `/tmp/e2e-mb-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

const MEMBER_N = 3;          // ★위 머리 주석 — 통로 검사용으로 낮춘 문턱(값 자체는 test-membership ①)
let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
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
  console.log('\n=== 마을 소속 · 곳간 인출 실클라 E2E (Chromium) ===');
  console.log(`    ★문턱을 MEMBER_N=${MEMBER_N} 으로 낮춰 켠다 — 이 검사가 재는 것은 통로다(머리 주석).`);
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: '600',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1', ONB_ENABLE: '1',
    MEMBER_N: String(MEMBER_N),
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  for (let i = 0; i < 90; i++) {
    const zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population != null && z.cap) break;
    await sleep(1000);
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let page = await ctx.newPage();
  const errs = [];
  // ★스크립트 오류만 빨간불로 센다. `Failed to load resource`(파비콘 등)는 이 카드가 만든 것이 아니라
  //   클라의 기존 상태라, 그걸 세면 **없는 회귀**를 보고하게 된다. 그래도 눈에는 보이게 따로 찍는다.
  const noise = [];
  const wire = (pg) => {
    pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    pg.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text().slice(0, 160);
      (/Failed to load resource/.test(t) ? noise : errs).push('console: ' + t);
    });
  };
  wire(page);
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  async function enter() {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const btn = await page.$('button:has-text("월드 입장")');
    if (btn) await btn.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(2000);
  }
  await enter();
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  const { DatabaseSync } = require('node:sqlite');
  const zdb = new DatabaseSync(ZDB);
  const rows = zdb.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length >= 1, `마을이 시딩됐다 (${rows.length}곳)`, rows.map((r) => r.name).join(' '));
  if (!rows.length) { console.log('\n마을 없음 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];

  async function warpTo(v, tries) {
    const x = v.cx * 32 + 16, y = v.cy * 32 + 16;
    for (let i = 0; i < (tries || 40); i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(1000);
      if ((await page.evaluate(() => window.__evNearVid)) === v.id) return true;
    }
    return false;
  }
  //   ★**링 전체를 본다 — 끝 몇 줄만 보지 않는다.** 이 검사 존은 하루가 0.6초라 근접 브리핑·게시판
  //     알림이 계속 밀려든다: `slice(-8)` 로 보면 방금 받은 답이 **뒤에서 밀려나** "답이 없다"가 된다
  //     (리베이스 뒤 ②가 그렇게 한 번 빨개졌다 — 정작 소속은 성사돼 있었다).
  //     범위는 절마다 도는 `clearNotices()` 가 잡아 준다(링은 40칸).
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  // ★★절마다 알림 링을 비운다 — 안 비우면 **앞 절의 알림에 걸려 통과**한다
  //   (1차 판이 정확히 그랬다: ②가 ①의 제안 알림을 보고 "수락됐다"고 통과했다).
  const clearNotices = () => page.evaluate(() => { window.__notices = []; });
  const contrib = () => page.evaluate(() => ((window.__onbState || {}).contrib | 0));
  const inv = () => page.evaluate(() => (window.__getInv && window.__getInv()) || {});
  // ★채팅은 **실제 클라의 입력창**으로 친다 — `__sendPrimary` 로 쏘면 "채팅 통로를 쓴다"를 안 재게 된다.
  //   ★입력창이 **실제로 열렸는지** 확인하고 친다 — 안 그러면 첫 줄이 조용히 사라지고
  //     그 절은 "명령을 안 보냈다"를 "거절이 없다"로 잘못 읽는다(1차 판 ⑦이 그랬다).
  async function say(text) {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Enter');
      await sleep(250);
      const on = await page.evaluate(() => !!(document.getElementById('chatInput') || {}).classList?.contains('active'));
      if (on) break;
    }
    await page.fill('#chatInput', text);
    const typed = await page.evaluate(() => (document.getElementById('chatInput') || {}).value || '');
    if (typed !== text) throw new Error(`채팅 입력 실패: ${JSON.stringify(typed)} ≠ ${JSON.stringify(text)}`);
    await page.keyboard.press('Enter');
    await sleep(1100);
  }
  // 거래소 창을 **아이콘을 눌러서** 연다(§8.2 등록이 실제로 됐는지도 같이 밟는다)
  //   ★**응답을 기다린다 — 고정 sleep 으로 읽지 않는다.** 창을 여는 순간 클라는 서버에 묻고,
  //     답이 오기 전에 그린 본문은 비어 있다(1차 판이 ③b~③e 를 그렇게 빨갛게 만들었다 —
  //     정작 ③f 의 버튼 클릭은 성공했으니, 없는 결함이었다).
  async function openTrade() {
    await page.evaluate(() => { window.__tradeBoard = null; });
    await page.click('.sb-icon[data-side="trade"]');
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      const got = await page.evaluate(() => !!(window.__tradeBoard && window.__tradeBoard.member)
        && !!document.getElementById('spBody') && (document.getElementById('spBody').textContent || '').length > 0);
      if (got) break;
    }
    await sleep(300);
    return await page.evaluate(() => ({
      open: !!(document.getElementById('sidePanel') || {}).classList?.contains('open'),
      body: (document.getElementById('spBody') || {}).textContent || '',
      hasBtn: !!document.getElementById('mbWd'),
      member: (window.__tradeBoard && window.__tradeBoard.member) || null,   // ★기존 진단 훅 그대로(새 훅 0)
    }));
  }

  ok(await warpTo(V, 30), `① ${V.name} 마을 중심 도착`);
  ok((await contrib()) === 0, `① 처음엔 누적 기여 0 (아래가 자명 통과가 아니다)`);

  // ── ⑦ 자명 통과 방지 — 소속 전에는 곳간이 안 열린다 ────────────────────────
  {
    const before = await inv();
    await clearNotices();
    await say('/인출');
    const n = await notices();
    ok(n.some((t) => /사람이 아니다/.test(t)), `⑦ 소속 전에는 인출이 거절된다`, JSON.stringify(n.filter((t) => /사람이 아니다|마을이 멀다/.test(t)).slice(-1)));
    const after = await inv();
    ok((after.food | 0) === (before.food | 0), `⑦b 거절이 말뿐이 아니다 — 곡식이 안 들어왔다`, `food ${before.food | 0} → ${after.food | 0}`);
  }

  // ── ① 의뢰를 채워 계량기를 올린다 ───────────────────────────────────────────
  async function ensureBoard(tries) {
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate((vid) => window.__sendPrimary({ type: '__e2e_village_short', vid }), V.id);
      await sleep(800);
      await page.evaluate((vid) => window.__sendPrimary({ type: 'village_board', vid }), V.id);
      await sleep(500);
      const b = await page.evaluate(() => window.__evLastBoard || null);
      if (b && b.rows && b.rows.length) return b;
    }
    return null;
  }
  async function deliverOnce() {
    const b = await ensureBoard(15);
    if (!b) return false;
    const row = b.rows[0];
    const give = (row.give || [])[0];
    if (!give) return false;
    const need = Math.max(1, Math.ceil(row.remain));
    await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n + 5 } }), [give, need]);
    await sleep(900);
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_deliver', vid }), V.id);
    await sleep(1400);
    return true;
  }
  //   ★제안 알림은 **문턱에 닿는 그 납품 순간** 한 번 나간다. 알림 링은 40칸이고 이 존은 하루가
  //     0.6초라 브리핑·게시판 알림이 계속 밀려든다 ⇒ 루프를 도는 동안 **그때그때 주워 둔다**
  //     (끝나고 한 번 읽으면 링에서 이미 밀려났을 수 있다).
  let k = 0, offer = '';
  for (let i = 0; i < 40 && k < MEMBER_N; i++) {
    await deliverOnce();
    k = await contrib();
    if (!offer) offer = (await notices()).find((t) => /이만하면 우리 마을 사람일세/.test(t)) || '';
  }
  ok(k >= MEMBER_N, `① 의뢰를 채우니 누적 기여가 ${MEMBER_N} 에 닿았다`, `contrib=${k}`);
  await snap('mb-01-contrib');
  {
    if (!offer) offer = (await notices()).find((t) => /이만하면 우리 마을 사람일세/.test(t)) || '';
    ok(!!offer, `① 촌장이 **먼저** 마을 사람으로 권한다`, JSON.stringify(offer));
  }

  // ── ② 채팅 한 줄로 수락 ─────────────────────────────────────────────────────
  await clearNotices();
  await say('/소속');
  {
    const n = await notices();
    // ★"오늘부터" — **수락 대사에만** 있는 말이다(제안 대사는 "이만하면"). 둘을 구별 못 하면 자명 통과다.
    ok(n.some((t) => /오늘부터 자네는/.test(t)), `② "/소속" 한 줄로 마을 사람이 된다(새 클라 조건 0)`,
       JSON.stringify(n.filter((t) => /오늘부터|사람 —/.test(t)).slice(-1)));
  }

  // ── ③ 거래소 창의 소속 한 줄 · 인출 ─────────────────────────────────────────
  const t1 = await openTrade();
  ok(t1.open, `③ 거래소 창이 열린다`);
  ok(/사람/.test(t1.body) && /곳간 몫/.test(t1.body), `③b 소속 한 줄이 **화면에 그려진다**(새 패널 0)`,
     JSON.stringify((t1.body.match(/🏘️[^\n]{0,40}/) || [''])[0]));
  ok(!!t1.member && t1.member.vid === V.id, `③c 그 줄의 값은 서버가 준 것이다(클라 재계산 0)`,
     t1.member ? `한도 ${t1.member.limit} · 남은 몫 ${t1.member.remain} · 곳간 ${t1.member.stock}` : 'X');
  ok(t1.member && t1.member.limit > 0, `③d 상황 assert — 오늘 한도가 0이 아니다(아래가 자명 통과가 아니다)`);
  ok(t1.hasBtn, `③e 곳간에서 꺼내는 버튼이 그 줄에 있다`);
  await snap('mb-02-panel');
  const invB = await inv();
  await page.click('#mbWd');
  await sleep(1600);
  const invA = await inv();
  ok((invA.food | 0) > (invB.food | 0), `③f 눌렀더니 **곡식이 실제로 손에 들어왔다**`,
     `food ${invB.food | 0} → ${invA.food | 0}`);
  {
    const n = await notices();
    ok(n.some((t) => /곳간에서/.test(t) && /꺼냈다/.test(t)), `③g 결과가 화면 알림으로 돌아온다`, JSON.stringify(n.filter((t) => /꺼냈다/.test(t)).slice(-1)));
  }
  await snap('mb-03-withdrawn');

  // ── ④ 한도 — 오늘 몫을 다 쓰면 거절 ─────────────────────────────────────────
  //   ★**날을 얼린다.** 이 존은 검사용으로 하루가 0.6초다 — 안 얼리면 인출할 때마다 날이 바뀌어
  //     한도가 매번 새로 열리고, 이 절은 "한도가 없다"를 보게 된다(재는 것이 한도가 아니라 시계다).
  await clearNotices();
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
  await sleep(900);
  {
    // ★링 **전체**를 본다 — 하루 0.6초 존에서는 브리핑·게시판 알림이 계속 밀려들어
    //   `slice(-4)` 로 보면 방금 받은 답이 뒤에서 밀려난다(러너 부하에서 실제로 그렇게 빨개졌다).
    const n = await notices();
    const froze = n.find((t) => /게임일 정지/.test(t)) || '';
    ok(!!froze, `④-0 게임일 정지(상호작용 구간) — 여기부터 시계가 검사를 앞지르지 않는다`, JSON.stringify(froze.slice(0, 60)));
  }
  {
    let refused = '';
    for (let i = 0; i < 12 && !refused; i++) {
      await clearNotices();
      await say('/인출');
      const n = await notices();
      refused = n.find((t) => /다 꺼냈다/.test(t)) || '';
    }
    ok(!!refused, `④ 오늘 몫을 다 쓰면 거절된다 — 한도가 살아 있다`, JSON.stringify(refused));
    if (!refused) console.log(`    (진단) 알림 전체: ${JSON.stringify(await page.evaluate(() => (window.__notices || []).slice(-6)))}`);
  }

  // ── ⑤ 재접속 — 소속이 몸을 따라간다 ────────────────────────────────────────
  const kBefore = await contrib();
  await page.close();
  page = await ctx.newPage();
  wire(page);
  await enter();
  await warpTo(V, 30);
  await clearNotices();
  await say('/소속');
  {
    const n = await notices();
    // ★이미 소속이면 `/소속` 은 **상태를 되읊는다**("… 사람 — N일째 · 누적 기여 K").
    //   새로 들어온 것이라면 "오늘부터" 가 뜬다 — 그 둘을 구별해야 "살아남았다"를 잰 것이다.
    ok(n.some((t) => /사람 — .*일째/.test(t)) && !n.some((t) => /오늘부터 자네는/.test(t)),
       `⑤ 재접속해도 그 마을 사람이다(몸에 실려 있다 — 새로 가입한 게 아니다)`,
       JSON.stringify(n.filter((t) => /사람 —|오늘부터/.test(t)).slice(-1)));
  }

  // ── ⑥ 탈퇴 — 나가되 기여는 남는다 ──────────────────────────────────────────
  await clearNotices();
  await say('/탈퇴');
  {
    const n = await notices();
    if (!n.length) console.log(`    (진단) '/탈퇴' 뒤 알림 0 — 근접 vid=${await page.evaluate(() => window.__evNearVid)} · 연결=${await page.evaluate(() => !!window.__sendPrimary)}`);
    ok(n.some((t) => /떠났다/.test(t)), `⑥ "/탈퇴" 로 나간다`, JSON.stringify(n.filter((t) => /떠났다/.test(t)).slice(-1)));
    const line = n.filter((t) => /떠났다/.test(t)).slice(-1)[0] || '';
    const m = line.match(/기여\s*(\d+)/);
    ok(!!m && (+m[1]) >= MEMBER_N, `⑥b 나가도 누적 기여는 그대로다(이력서 캐논)`, `${m ? m[1] : '?'} (탈퇴 전 ${kBefore})`);
    await clearNotices();
    await say('/인출');
    const n2 = await notices();
    ok(n2.some((t) => /사람이 아니다/.test(t)), `⑥c 나간 뒤엔 곳간이 다시 닫힌다`, JSON.stringify(n2.filter((t) => /사람이 아니다/.test(t)).slice(-1)));
  }
  await snap('mb-04-left');

  ok(errs.length === 0, `클라 스크립트 오류 0`, errs.slice(0, 3).join(' | '));
  if (noise.length) console.log(`    (참고) 리소스 404 등 ${noise.length}건 — 이 카드 소관 아님: ${noise.slice(0, 2).join(' | ')}`);
  console.log(`\n스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
