#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 **세 밤** 분할(T238 · 소요로 균등) · `run-regress.sh --list "nightly C"`
// === scripts/e2e-membership.js — 마을 소속 · 곳간(꺼내기 촌장만 · 기부 누구나) **실클라** E2E [T11 · ★T779 새 세계] =======
//
// ★왜: `test-membership` 은 **판정 층**에서 계약을 잰다(게이트·촌장 도장·역연산·직렬화).
//   그런데 이 카드가 플레이어에게 약속하는 것은 그게 아니다:
//     *"몇 번 갖다 주면 촌장이 마을 사람으로 받아 준다. 곳간에는 누구나 기부할 수 있고(받는 것 없음), 꺼내는 건 촌장만이다."*
//   그 문장은 **납품 훅 → 계량기 → 문턱 → 채팅 명령 → 거래소 창 한 줄 → 기부 · 꺼내기 통로**가
//   전부 맞물려야 참이 된다. 판정이 다 맞아도 화면에 줄이 없으면 플레이어에겐 없는 기능이다.
// ★[T779 2026-10-18 · 재민 10-15 "마음대로 빼는 건 안 돼 · 관리자만 뺄 수 있어" · "기부는 상시 되고 보상도 없음"]
//   옛 "마을 사람 = 오늘 몫만큼 꺼낸다"(기여 한도)는 걷었다 — 꺼내기는 촌장 한 사람 · 기부는 기본으로 열려 있다(`T769_DONATE` 기본 켬).
//   시딩 마을은 NPC 마을(창설자 없음 = 사람 촌장 없음)이라 이 사람은 마을 사람이 되어도 곳간을 못 연다 — 그 말을 그대로 잰다.
//
// ★★문턱을 낮춰 돌린다 — 그리고 그 사실을 여기 적는다(`e2e-chronicle` 과 같은 규약).
//   소속 문턱 12(K-2 확정)를 실클라에서 채우려면 **의뢰 12건을 완수**해야 하고, 의뢰는 하루
//   경계마다 서므로 이 검사가 재는 것이 배선이 아니라 **경제 속도**가 된다.
//   ⇒ `MEMBER_N=3` 으로 낮춰 켠다. **문턱의 값 자체는 `test-membership ①` 이 정본으로 잰다**
//     (거기서는 11 거절 / 12 제안을 실제 상수로 검사한다). 여기서 재는 것은 **통로**다.
//
// ★재는 것 — 실기 그대로
//   ① 마을에 도착해 의뢰를 채운다 → 계량기가 오른다 → 촌장이 **먼저** 권한다.
//   ② 채팅에 `/소속` — **새 클라 조건 0**(채팅은 이미 있다). 마을 사람이 된다(받아들이는 말에 곳간 말 없음).
//   ③ 거래소 창에 **소속 한 줄 · "곳간 꺼내기 — 촌장만" · 기부 한 줄**이 뜨고, 기부 단추를 누르면 짐이 곳간으로 간다(기여 그대로).
//   ④ 마을 사람이 되어도 `/인출` 은 거절된다(촌장 판정) · `/곳간` 형편 한 줄(꺼내기 촌장만 · 기부 누구나 · 한도 말 없음).
//   ⑤ 재접속해도 소속이 살아 있다(몸에 실려 있다).
//   ⑥ `/탈퇴` 하면 나가지되 **누적 기여는 남는다** · 그 뒤에도 곳간은 촌장만.
//   ⑦ ★자명 통과 방지 — 소속 전에도 `/인출` 은 거절된다(같은 촌장 문 · 곡식이 안 들어온다).
//
// 실행: node scripts/e2e-membership.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-mb-central-${process.pid}.db`, ZDB = `/tmp/e2e-mb-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

const MEMBER_N = 3;          // ★위 머리 주석 — 통로 검사용으로 낮춘 문턱(값 자체는 test-membership ①)
// ★[T779] 이 판이 재는 것은 **기본 세계**다 — 존에 기부 손잡이(`T769_DONATE`)를 물려주지 않는다(바깥 셸에 '0' 이 남아 있어도 기본 켬으로 뜬다).
//   NPC 마을의 꺼내기 거절 말 — `membership._chiefNow` 의 그 한 줄(창설자 없음 = 사람 촌장 없음).
const NPC_NO = /이 마을 곳간은 사람이 열지 않습니다/;
let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const e = Object.assign({}, process.env, env);
  delete e.T769_DONATE;   // ★[T779] 기본 세계(위)
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 마을 소속 · 곳간(꺼내기 촌장만 · 기부 누구나) 실클라 E2E (Chromium) ===');
  console.log(`    ★문턱을 MEMBER_N=${MEMBER_N} 으로 낮춰 켠다 — 이 검사가 재는 것은 통로다(머리 주석).`);
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답(`waitHttp(/zones)`)은 증인이 아니었다 — 앞 판 central 이 포트를 쥔 채면 새 central 은
  //   `EADDRINUSE` 로 즉시 죽는데 `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다.
  //   ⚠**듣기는 여기서 시작한다**(`await` 는 아래 `ok` 자리에서) — 아이가 표식을 찍는 것은 ~120ms 뒤라
  //     그 사이 다른 `await` 를 지나면 줄을 놓친다. 띄운 **그 틱에** 귀를 붙인다.
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '3', VILLAGE_DAY_MS: '600',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    E2E_GIVE: '1', ONB_ENABLE: '1',
    MEMBER_N: String(MEMBER_N),
  });
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  ok(await (await _zp).ok, 'zone 기동');
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
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    const btn = await page.$('#enter');
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

  // ── ⑦ 자명 통과 방지 — 소속 전에도 곳간은 안 열린다(촌장 문) ────────────────────────
  {
    const before = await inv();
    await clearNotices();
    await say('/인출');
    const n = await notices();
    ok(n.some((t) => NPC_NO.test(t)), `⑦ 곳간은 촌장만 — \`/인출\` 이 거절된다(NPC 마을 = 사람 촌장 없음)`, JSON.stringify(n.filter((t) => /사람이 열지 않습니다|촌장만|마을에서 너무 멉니다/.test(t)).slice(-1)));
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
    ok(!n.some((t) => /오늘부터 자네는/.test(t) && /곳간을 열어|\/인출/.test(t)), `②b 받아들이는 말에 "곳간을 열어 두겠네(/인출)"가 없다(꺼내기는 촌장만)`,
       JSON.stringify(n.filter((t) => /오늘부터/.test(t)).slice(-1)));
  }

  // ── ③ 거래소 창의 소속 한 줄 · 촌장 줄 · 기부 ─────────────────────────────────────────
  //   기부 단추가 서도록 곳간이 받는 것 하나(나무)를 먼저 쥐여 준다(창이 그 짐으로 단추를 만든다)
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 3 } })); await sleep(900);
  const t1 = await openTrade();
  ok(t1.open, `③ 거래소 창이 열린다`);
  ok(/사람/.test(t1.body) && /곳간 꺼내기 — 촌장만/.test(t1.body) && /촌장 아님/.test(t1.body) && !/곳간 몫/.test(t1.body),
     `③b 소속 한 줄 + "곳간 꺼내기 — 촌장만 · 촌장이 아니다"(한도 말 없음 · 새 패널 0)`,
     JSON.stringify((t1.body.match(/[^\n]*촌장만[^\n]{0,20}/) || [''])[0]));
  ok(!!t1.member && t1.member.vid === V.id && t1.member.chief === false && !('limit' in t1.member) && !('remain' in t1.member) && Array.isArray(t1.member.donate),
     `③c 그 줄의 값은 서버가 준 것이다(촌장 false · 한도 칸 없음 · 기부 품목 표)`,
     t1.member ? `촌장 ${t1.member.chief} · 기부 품목 ${(t1.member.donate || []).length} · 칸 ${Object.keys(t1.member).sort().join(',')}` : 'X');
  ok(!t1.hasBtn, `③d 촌장이 아니면 꺼내는 단추가 없다`);
  const dnBtn = await page.$('[data-dn="wood"]');
  ok(!!dnBtn && /곳간에 기부 — 받는 것 없음/.test(t1.body), `③e 같은 창에 "곳간에 기부 — 받는 것 없음" 줄과 기부 단추가 있다`,
     JSON.stringify((t1.body.match(/[^\n]*받는 것 없음[^\n]{0,30}/) || [''])[0]));
  await snap('mb-02-panel');
  {
    const k0 = await contrib(), iv0 = await inv();
    await clearNotices();
    //   [PM 착지 10-20] 패널이 다시 그려지면 앞서 쥔 손잡이가 떨어진다(DOM detached) — 누르기 직전에 다시 찾는다(단언 무변)
    if (dnBtn) { const b = await page.$('[data-dn="wood"]'); await (b || dnBtn).click(); }
    let iv1 = iv0;
    for (let i = 0; i < 20; i++) { await sleep(300); iv1 = await inv(); if ((iv1.wood | 0) < (iv0.wood | 0)) break; }
    const k1 = await contrib();
    ok((iv1.wood | 0) < (iv0.wood | 0), `③f 눌렀더니 **짐이 실제로 곳간으로 갔다**`, `wood ${iv0.wood | 0} → ${iv1.wood | 0}`);
    let dn = '';
    for (let i = 0; i < 10 && !dn; i++) { dn = (await notices()).find((t) => /내놓았습니다/.test(t)) || ''; if (!dn) await sleep(300); }
    ok(/내놓았습니다/.test(dn) && /대가는 없습니다/.test(dn), `③g 결과 알림 — "기부했다 … 받는 것 없음"`, JSON.stringify(dn));
    ok(k1 === k0, `③h 기부는 기여를 안 올린다(기여는 게시판 납품만 센다)`, `${k0} → ${k1}`);
  }
  await snap('mb-03-donated');

  // ── ④ 마을 사람이 되어도 꺼내기는 촌장만 ─────────────────────────────────────────
  //   ★**날을 얼린다**(옛 절 그대로). 이 존은 검사용으로 하루가 0.6초다 — 얼려 두면 브리핑 · 게시판 알림이 덜 밀려든다.
  await clearNotices();
  // ★★[T214 2026-09-12] **답이 올 때까지** 기다린다 — 정해진 초를 자고 한 번 보지 않는다(족보 ⑩).
  //   러너 빨강 실측: `④-0 … ""` — 서버 회신이 900ms 안에 안 왔을 뿐이고 단독이면 25/0 이다.
  //   판정은 그대로("끝내 안 오면 빨강"). 바뀐 것은 **언제 보느냐** 하나다. 상한은 판정이 아니라 안전망이다.
  {
    const t0 = Date.now();
    let froze = '';
    for (let i = 0; i < 60 && !froze; i++) {                  // 60 × 0.9초 = 54초까지(안전망)
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
      for (let k = 0; k < 9 && !froze; k++) {                 // 0.9초를 9번에 나눠 본다 — 오면 즉시 끝
        await sleep(100);
        // ★링 **전체**를 본다 — 하루 0.6초 존에서는 브리핑·게시판 알림이 계속 밀려들어
        //   `slice(-4)` 로 보면 방금 받은 답이 뒤에서 밀려난다(러너 부하에서 실제로 그렇게 빨개졌다).
        froze = (await notices()).find((t) => /게임일 정지/.test(t)) || '';
      }
    }
    ok(!!froze, `④-0 게임일 정지(상호작용 구간) — 여기부터 시계가 검사를 앞지르지 않는다`,
       `${JSON.stringify(froze.slice(0, 60))} · ${Date.now() - t0}ms 만에`);
  }
  {
    let refused = '';
    for (let i = 0; i < 6 && !refused; i++) { await clearNotices(); await say('/인출'); refused = (await notices()).find((t) => NPC_NO.test(t)) || ''; }
    ok(!!refused, `④ 마을 사람이 되어도 꺼내기는 촌장만 — \`/인출\` 이 거절된다(옛 오늘 몫 갈래 없음)`, JSON.stringify(refused));
    let look = '';
    for (let i = 0; i < 6 && !look; i++) { await clearNotices(); await say('/곳간'); look = (await notices()).find((t) => /꺼내는 것은 촌장만/.test(t)) || ''; }
    ok(!!look && /내놓는 것은 누구나/.test(look) && !/남은 몫|누적 기여/.test(look), `④b "/곳간" 형편 한 줄 — 꺼내기 촌장만 · 기부 누구나 · 한도 말 없음`, JSON.stringify(look));
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
    ok(n.some((t) => /사람이 된 지 .*일째/.test(t)) && !n.some((t) => /오늘부터 자네는/.test(t)),
       `⑤ 재접속해도 그 마을 사람이다(몸에 실려 있다 — 새로 가입한 게 아니다)`,
       JSON.stringify(n.filter((t) => /사람이 된 지|오늘부터/.test(t)).slice(-1)));
  }

  // ── ⑥ 탈퇴 — 나가되 기여는 남는다 ──────────────────────────────────────────
  await clearNotices();
  await say('/탈퇴');
  {
    const n = await notices();
    if (!n.length) console.log(`    (진단) '/탈퇴' 뒤 알림 0 — 근접 vid=${await page.evaluate(() => window.__evNearVid)} · 연결=${await page.evaluate(() => !!window.__sendPrimary)}`);
    ok(n.some((t) => /떠났습니다/.test(t)), `⑥ "/탈퇴" 로 나간다`, JSON.stringify(n.filter((t) => /떠났습니다/.test(t)).slice(-1)));
    const line = n.filter((t) => /떠났습니다/.test(t)).slice(-1)[0] || '';
    const m = line.match(/기여\s*(\d+)/);
    ok(!!m && (+m[1]) >= MEMBER_N, `⑥b 나가도 누적 기여는 그대로다(이력서 캐논)`, `${m ? m[1] : '?'} (탈퇴 전 ${kBefore})`);
    await clearNotices();
    await say('/인출');
    const n2 = await notices();
    ok(n2.some((t) => NPC_NO.test(t)), `⑥c 나간 뒤에도 곳간은 촌장만 — 거절된다`, JSON.stringify(n2.filter((t) => /사람이 열지 않습니다|촌장만/.test(t)).slice(-1)));
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
