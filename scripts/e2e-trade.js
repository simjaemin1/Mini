#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-trade.js — 마을 거래소 물물교환 **실클라** E2E ==================
//
// ★왜 [재민 확정 2026-08-27]
//   `test-trade` 38/0 은 "교환 계약이 지켜지는가"를 잰다. 이 레포가 배치 5 에서 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다
//   (서버 E2E 56/0 이 도는 동안 플레이어는 노를 한 번도 못 지었다 — 버튼이 `display:none` 안에 있었다).
//   거래소는 특히 그렇다: 이 배치의 존재 이유가 **첫 30분 ② "내가 판 물건에 값이 실제로 움직인다"**인데,
//   그 움직임은 **화면에 보여야** 존재한다. 장부에서만 움직이면 없는 기능이다.
//   그래서 진짜 Chromium 을 띄우고, 사람처럼 마을에 걸어가 → 탭을 누르고 → 세 번 클릭해 바꾼다.
//
// ★★시간 모드: **데울 땐 흐르고, 상호작용 땐 얼린다**(`e2e-events` 와 같은 규약).
//   하루 0.5초로 마을 시뮬을 데운 뒤 `__e2e_day_freeze` 로 날을 멈춘다. 왜 반드시 얼려야 하나:
//   ⑤의 판정이 "**내 거래가** 시세를 움직였는가"인데, 날이 흐르면 NPC 생산·소비·교역이 같은 창에서
//   재고를 흔들어 **원인이 섞인다**. 얼리면 그 창에서 재고를 움직인 건 내 거래 하나뿐이다(대조 실험).
//   (하루 경계·의뢰 철회처럼 **시간이 주제인** 검사는 `test-events` 가 맡는다 — 거긴 안 얼린다.)
//
// ★★[2026-08-27 갱신] 이 하네스를 처음 쓸 땐 "물고기→**곡물**"이 **문자 그대로는 실행 불가**였다 —
//   곳간 대응표에 `food` 를 가리키는 플레이어 아이템이 없어 곡식이 거래소 행에 서지 않았다(회부 B-2).
//   **무게·곡물 배치가 그걸 해소했다**(`PV_DEPOSIT_MAP` 에 `food: 'food'` 한 줄). 이제 곡식은 표에 선다.
//   ②의 판정도 그에 맞춰 뒤집었다 — 옛 사실을 못 박던 자리가 새 사실을 못 박는 자리가 됐다.
//   대신 지시의 두 뜻은 **둘 다** 지켜진다:
//     ⓐ 표시는 곡식 환산이다(`PRICE_NUMERAIRE=food`) — ②가 화면에서 확인한다.
//     ⓑ 교환은 물고기를 낸다 — 받을 품목은 **그 마을 시세표에서 살아 있는 것**을 골라 쓰고
//        무엇을 골랐는지 로그에 남긴다(없는 쌍을 억지로 만들어 자명 통과시키지 않는다).
//
// 실행: node scripts/e2e-trade.js [--headed]
//   ★`e2e-events` 와 함께 마을을 켜는 두 하네스 중 하나 — `VILLAGE_MAX=2` 로 부팅을 짧게 한다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-trade-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-tr-central-${process.pid}.db`, ZDB = `/tmp/e2e-tr-zone-${process.pid}.db`;
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
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩|마을 시뮬 준비/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 110)}\n`); });
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
  console.log('\n=== 마을 거래소 물물교환 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',    // 데우기용. 상호작용은 아래서 얼린다(머리 주석).
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',   // 재료 지급 + 날 얼리기(둘 다 이 게이트로만 분기가 산다)
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  let zmap = null;
  for (let i = 0; i < 90; i++) {
    zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population !== null && z.population !== undefined && z.cap) break;
    await sleep(1000);
  }
  ok(!!(zmap.zones || {}).hanbando, '로비에 존이 살아 보인다');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  const openTrade = async () => {
    await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="trade"]').click());
    await sleep(700);
  };
  const closePanel = async () => { await page.keyboard.press('Escape'); await sleep(250); };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // 마을 앵커 — 서버가 쓰는 좌표 그대로(DB 원본). 좌표를 클라에서 되짚으면 존 오프셋 혼선을 새로 만든다.
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`, rows.map((r) => `${r.name}(${r.cx},${r.cy})`).join(' '));
  if (!rows.length) { console.log('\n마을 0 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];
  const ax = V.cx * 32 + 16, ay = V.cy * 32 + 16;

  // ── ① 반경 밖 — 거래소가 안 열린다(§3.2 정보 비대칭) ──────────────────────
  //   ★두 겹으로 잰다. 클라 문구만 보면 **서버 게이트가 없어도 통과**하기 때문이다 —
  //     클라가 예의상 안 물어보는 것과, 서버가 안 답하는 것은 전혀 다른 보안이다.
  {
    const far = await page.evaluate(() => window.__getMyAbs());
    const farD = Math.round(Math.hypot(far.x - ax, far.y - ay));
    console.log(`    스폰 (${Math.round(far.x)},${Math.round(far.y)}) · 마을 (${ax},${ay}) · 거리 ${farD}px — 멀리서 시험`);
    ok(farD > 260, '★전제 — 스폰이 마을 반경(260px) 밖이다', `${farD}px`);
    await openTrade();
    const t = await page.evaluate(() => (window.__panelText() || ''));
    ok(/가까이/.test(t), '★① 반경 밖에서는 패널이 "마을 가까이에서만"이라 말한다', t.trim().slice(0, 48));
    ok(await page.evaluate(() => !window.__tradeBoard), '★① 반경 밖에선 시세표가 아예 안 온다');
    // ★★서버 게이트 — 클라를 우회해 **vid 를 알고 직접 물어봐도** 거절해야 한다.
    const n0 = (await notices()).length;
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_trade', vid }), V.id);
    await sleep(900);
    const gated = (await notices()).slice(n0).filter((s) => /🏪/.test(s));
    ok(gated.length > 0 && !(await page.evaluate(() => !!window.__tradeBoard)),
      '★★① **서버가 게이트다** — vid 를 알고 직접 물어도 멀면 시세표를 안 준다(원격 조회 API 없음)',
      (gated[0] || '거절 없음!').slice(0, 60));
    // 교환 시도도 같은 게이트를 통과해야 한다(읽기만 막고 쓰기를 열어 두는 실수 방지)
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_trade_exec', vid, give: 'fish', take: 'wood', qty: 1 }), V.id);
    await sleep(900);
    const gated2 = (await notices()).filter((s) => /🏪/.test(s));
    ok(gated2.length >= 2, '★★① 멀리서 **교환도** 거절된다(읽기만 막지 않는다)', (gated2[gated2.length - 1] || '').slice(0, 60));
    await closePanel();
  }

  // ── 마을로 워프 — 수렴할 때까지 되풀이한다(게스트 세션 1회 재접속이 첫 워프를 씻는다) ──
  let tpTries = 0, tpOk = false;
  for (; tpTries < 25 && !tpOk; tpTries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [ax, ay]);
    await sleep(1200);
    const d = await page.evaluate(() => window.__evDbg || null);
    if (d && d.seen > 0 && d.minD <= d.gate) tpOk = true;
  }
  let near = null;
  for (let i = 0; i < 45; i++) {
    near = await page.evaluate(() => ({ vid: window.__evNearVid, dbg: window.__evDbg || null, err: window.__evTickErr || null }));
    if (near.dbg && near.dbg.seen > 0 && near.vid != null) break;
    await sleep(1000);
  }
  console.log(`    워프 ${tpTries}회 · 근접 ${JSON.stringify(near)}`);
  ok(!near.err, '근접 틱이 예외 없이 돈다', near.err || '');
  ok(near.vid != null, '마을 반경 안에 들어왔다', `vid=${near.vid} · ${near.dbg ? near.dbg.minD + 'px (게이트 ' + near.dbg.gate + ')' : ''}`);
  if (near.vid == null) { console.log('\n마을 접근 실패 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  await snap('tr-01-at-village');

  // ★날을 얼린다 — 이제부터 재고를 움직이는 건 **내 거래뿐**이다(⑤의 대조 조건).
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
  await sleep(800);
  ok((await notices()).some((s) => /🧊/.test(s)), '★전제 — 게임일을 얼렸다(상호작용 창에서 NPC 가 재고를 안 흔든다)');

  // ── ② 패널이 열리고 **시세가 보인다** ──────────────────────────────────────
  await openTrade();
  let board = null;
  for (let i = 0; i < 20 && !board; i++) { board = await page.evaluate(() => window.__tradeBoard || null); if (!board) await sleep(400); }
  ok(!!board, '★② 마을 앞에서 거래소 패널이 열리고 시세표가 온다', board ? `${board.name} · ${board.rows.length}품목` : '안 옴');
  if (!board) { console.log('\n시세표 미수신 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const title = await page.evaluate(() => (document.getElementById('spTitle') || {}).textContent || '');
  ok(/거래소/.test(title), '★② 패널 제목이 **한글**이다(프레임 등록 3단계를 다 밟았다)', JSON.stringify(title));
  const ptxt = await page.evaluate(() => window.__panelText());
  ok(board.numeraire === 'food' && /곡식/.test(ptxt),
    '★★② 시세가 **곡식 환산**으로 화면에 뜬다(PRICE_NUMERAIRE · 지시의 "곡물"의 실제 자리)',
    `numeraire=${board.numeraire}`);
  const priced = board.rows.filter((r) => r.num != null && r.num > 0);
  ok(priced.length >= 3, '★② 값이 매겨진 품목이 여럿이다', priced.map((r) => `${r.ko} ${r.num}`).join(' · ').slice(0, 110));
  ok(board.rows.every((r) => typeof r.sell === 'number' && typeof r.mine === 'number'),
    '★② 세 칸이 다 있다 — 시세 · 마을이 팔 수 있는 양 · 내 보유량');
  // ★★[2026-08-27 무게·곡물 배치] **뒤집혔다.** 종전엔 곡식이 "기준 품목인데 정작 표에 없는" 재화라
  //   이 자리에서 그 사실을 못 박았다(거래소 배치 회부 B-2). 곡물 품목화가 그걸 해소했으므로
  //   판정도 **반대로** 세운다 — 이제 곡식은 표에 **있어야** 하고, 기준 품목이기도 하다.
  //   (지시서가 말한 "물고기→곡물"이 이제 문자 그대로 성립한다.)
  const foodRow = board.rows.find((r) => r.res === 'food');
  ok(!!foodRow, '★★② **곡식이 교환 품목이 됐다** — 기준 품목이면서 실물로도 거래된다',
    foodRow ? `시세 ${foodRow.num} · 마을 ${foodRow.sell} · 낼 수 있음 ${foodRow.canGive}` : '없음');
  ok(!!foodRow && foodRow.num === 1, '★② 기준 품목이라 자기 환산은 1이다', foodRow ? `${foodRow.num}` : '');
  await snap('tr-02-board');

  // ── ③ 물고기를 내고 무언가를 받는다 — 세 클릭 ─────────────────────────────
  const GIVE = 'fish';
  const GIVE_N_PLAN = 12;      // ★아래 GIVE_N 과 같은 수 — 후보를 고를 때 미리 알아야 해서 앞에 둔다
  const giveRow = board.rows.find((r) => r.res === GIVE);
  ok(!!giveRow && giveRow.canGive, '★전제 — 물고기는 낼 수 있는 품목이다', giveRow ? `시세 ${giveRow.num}` : '없음');
  // 받을 품목: 살아 있는 것 중 **마을이 실제로 내줄 수 있는 양이 가장 큰** 것(상한에 안 걸리게).
  // ★★[2026-08-28] 그런데 그것만으로는 부족하다 — **낼 물건 값으로 한 개도 못 사는 쌍**이 뽑힌다.
  //   실제로 그랬다: 생선(0.004728) 12개 = 0.057 곡식 → 곡식(1) **0개**. 견적은 정상으로 서고
  //   버튼만 죽는다(제품은 옳다 — 못 사는 걸 팔 수는 없다). 그런데 하네스는 그걸 **회귀로** 보고했다.
  //   ⇒ 족보 (56)의 재적용: "X 가 변하는가"를 묻기 전에 **X 가 변할 수 있는 쌍인지** 먼저 확인한다.
  //   ⚠이건 값 문제가 아니라 **후보 선택** 문제다. 시세는 매 판 다르고(부팅 지연만큼 게임일이 흐른다)
  //     어떤 판에선 성사되고 어떤 판에선 안 된다 — 그게 이 검사가 간헐적으로 빨개진 이유다.
  const SPREAD = 0.9;          // 마을 몫 10% 를 뺀 몫(패널이 화면에 그대로 밝히는 수)
  const WANT_UNITS = 2;        // ④가 "+n 들어왔다"를 세려면 최소 2개는 와야 안전하다
  const _afford = (r) => (GIVE_N_PLAN * (giveRow ? giveRow.num : 0) * SPREAD) / r.num;
  const _cands = board.rows.filter((r) => r.canTake && r.res !== GIVE && r.sell > 0 && r.num > 0);
  const _feasible = _cands.filter((r) => _afford(r) >= WANT_UNITS && r.sell >= WANT_UNITS);
  const takeRow = _feasible.sort((a, b) => b.sell - a.sell)[0];
  if (!takeRow) {
    console.log(`    ⚠살 수 있는 후보 없음 — 후보 ${_cands.length}종: ` +
      _cands.map((r) => `${r.ko}(${r.num}·최대 ${_afford(r).toFixed(2)}개)`).join(' '));
  } else {
    console.log(`    후보 ${_cands.length}종 중 살 수 있는 것 ${_feasible.length}종 → ` +
      `${takeRow.ko} (낼 값으로 ${_afford(takeRow).toFixed(1)}개까지)`);
  }
  ok(!!takeRow, '★전제 — 마을이 내줄 수 있고 **내 물건 값으로 살 수 있는** 품목이 있다',
    takeRow ? `${takeRow.ko} 재고 ${takeRow.stock} · 팔 수 있는 양 ${takeRow.sell}` : '없음');
  if (!giveRow || !takeRow) { console.log('\n교환 가능한 쌍 없음 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  console.log(`    고른 쌍: 📤 ${giveRow.ko}(${giveRow.num}) → 📥 ${takeRow.ko}(${takeRow.num})  ※지시의 "곡물"은 위 머리 주석 참조`);

  const GIVE_N = GIVE_N_PLAN;
  await page.evaluate((n) => window.__sendPrimary({ type: '__e2e_give', items: { fish: n } }), GIVE_N + 8);
  await sleep(900);
  await closePanel(); await openTrade();
  for (let i = 0; i < 20; i++) { board = await page.evaluate(() => window.__tradeBoard || null); if (board && (board.rows.find((r) => r.res === GIVE) || {}).mine > 0) break; await sleep(400); }
  ok(((board.rows.find((r) => r.res === GIVE) || {}).mine || 0) >= GIVE_N,
    '★③ 내 보유량 칸이 인벤을 비춘다', `내것 ${(board.rows.find((r) => r.res === GIVE) || {}).mine}`);

  // 클릭 1 — 낼 물건 / 클릭 2 — 받을 물건 (진짜 DOM 클릭. 훅으로 상태를 밀어 넣지 않는다)
  await page.evaluate((res) => document.querySelector(`.tr-row[data-res="${res}"]`).click(), GIVE);
  await sleep(400);
  await page.evaluate((res) => document.querySelector(`.tr-row[data-res="${res}"]`).click(), takeRow.res);
  await sleep(900);
  const sel = await page.evaluate(() => window.__tradeSel());
  ok(sel.give === GIVE && sel.take === takeRow.res, '★③ 두 번 클릭으로 낼 것·받을 것이 잡힌다', JSON.stringify(sel));
  // 수량 입력 후 견적
  await page.evaluate((n) => { const el = document.getElementById('trQty'); el.value = String(n); el.dispatchEvent(new Event('change')); }, GIVE_N);
  let quote = null;
  for (let i = 0; i < 25 && !(quote && quote.give === GIVE_N); i++) { await sleep(400); quote = await page.evaluate(() => window.__tradeQuote || null); }
  ok(!!quote && quote.ok, '★③ 견적이 온다', quote ? `${quote.give} → ${quote.take} (한 개당 ${quote.ratio})` : '안 옴');
  if (!quote || !quote.ok) { console.log(`\n견적 실패 — 중단  ${JSON.stringify(quote)}`); await snap('tr-03-quote-fail'); await browser.close(); shutdown(); process.exit(1); }
  const qtxt = await page.evaluate(() => window.__panelText());
  ok(/한 개당/.test(qtxt) && new RegExp(String(quote.take)).test(qtxt), '★★③ 견적이 **화면에** 뜬다(비율·수량)',
    (qtxt.match(/📤[^\n]{0,60}/) || [''])[0].trim());
  await snap('tr-03-quote');

  const invBefore = await page.evaluate(() => window.__getInv());
  const takeItem = takeRow.item;
  const n1 = (await notices()).length;
  // 클릭 3 — 확정
  const btnOn = await page.evaluate(() => { const b = document.getElementById('trGo'); return !!b && !b.disabled; });
  ok(btnOn, '★③ "바꾼다" 버튼이 살아 있다(견적이 서면 활성)');
  await page.evaluate(() => document.getElementById('trGo').click());
  await sleep(1600);

  // ── ④ 인벤이 실제로 바뀐다 · 알림이 사실을 말한다 ─────────────────────────
  const invAfter = await page.evaluate(() => window.__getInv());
  const dGive = (invAfter.fish || 0) - (invBefore.fish || 0);
  const dTake = (invAfter[takeItem] || 0) - (invBefore[takeItem] || 0);
  ok(dGive < 0, '★★④ 낸 물건이 인벤에서 **빠졌다**', `${invBefore.fish || 0} → ${invAfter.fish || 0} (${dGive})`);
  ok(dTake > 0, '★★④ 받은 물건이 인벤에 **들어왔다**', `${takeItem} ${invBefore[takeItem] || 0} → ${invAfter[takeItem] || 0} (+${dTake})`);
  const nn = (await notices()).slice(n1).filter((s) => /🏪/.test(s));
  ok(nn.length > 0 && /거래소/.test(nn[0]), '★④ 알림이 무엇을 주고 무엇을 받았는지 말한다', (nn[0] || '없음').slice(0, 80));
  // 견적이 약속한 수와 실제로 받은 수가 같아야 한다(화면과 실제가 갈리면 그게 보이지 않는 손이다)
  ok(dTake === quote.take || quote.capped,
    '★★④ **견적이 약속한 수 그대로** 받았다(견적과 실행이 같은 계획을 쓴다)', `견적 ${quote.take} · 실제 ${dTake}`);
  await snap('tr-04-after');

  // ── ⑤ ★★내가 판 물건 값이 **화면에서** 움직인다 — 이 배치의 존재 이유 ─────
  //
  // ★★여기서 **세 번** 실패했고 원인이 매번 달랐다. 셋 다 남겨 둔다 — 다음 사람이 같은 길을 안 걷게.
  //   ⓐ **하루 캐시(제품 결함)** — `trade.board/quote` 가 `Events.pricesOf`(=`v._priceCache`)를 봤다.
  //      NPC 교역 틱이 하루 한 번 덮는 값이라 같은 날 안에서는 재고가 어떻게 움직여도 **소수점까지 같다**.
  //      별도 프로브 실측(캐시 warm + 날 얼림 + 대량 매도): 나무 재고 +35%·돌 −23%인데 표시도 견적가도
  //      그대로였고, 해동 후 하루 지나서야 1.208→1.098. ⇒ `pricesFresh` 로 고쳤다(trade.js 머리 주석).
  //   ⓑ **가격 바닥(계측기 결함)** — `computeShadowPrices` 는 희소도를 `PRICE_ADJ_MIN..maxAdj` 로
  //      **클램프**한다. 과잉 재고 품목은 바닥에 붙어 재고가 더 늘어도 값이 안 움직인다(글럿 바닥의 존재 이유).
  //      1차 하네스는 "마을이 팔 수 있는 양이 가장 많은" 품목을 골랐는데 그건 곧 **가장 과잉인 품목**이라
  //      바닥에 붙어 있을 확률이 가장 높은 선택이었다. **자기가 못 움직일 걸 골라 놓고 "안 움직인다"고 보고했다.**
  //   ⓒ **한 짝에 두 판정을 묶은 것(계측기 결함)** — 2차 하네스는 "판 것 ↓ **그리고** 산 것 ↑"을
  //      **한 짝에서 동시에** 요구했다. 러너 실행에서 실측된 것: `가죽→고기` 에서 가죽(판 것)은
  //      0.03226 → 0.0164 로 **반토막 났는데** 고기(산 것)가 바닥이라 안 올라 **전체가 실패**로 잡혔다.
  //      한 짝에 묶으면 **바닥 품목 하나가 두 판정을 다 죽인다** — 마을 재고 사정에 따라 들쭉날쭉해진다.
  //   ⇒ 지금 모양: **두 판정을 따로, 각자 후보를 순회하며** 실측한다. 어느 품목으로 성공했는지 남기고,
  //     전부 실패하면 **후보별 이동을 다 찍은 뒤** 실패로 센다(조용한 통과도 조용한 실패도 없다).
  //   ⓓ **거래가 아예 안 일어난 걸 "값이 안 움직였다"로 읽었다(계측기 결함)** — 3차 실행 실측:
  //      받을 것 후보 6종 전부 `재고 10.41 → 10.41` 로 **한 톨도 안 줄었다**. 값이 안 움직인 게 아니라
  //      **거래 자체가 실패**한 것이었다(비싼 물건을 내려는데 마을이 그 값을 못 치르면 거절된다.
  //      그리고 실패엔 서버가 시세표를 다시 안 보내니 **화면도 그대로**다 — 완벽하게 "안 움직인 것처럼" 보인다).
  //      ⇒ 하네스는 **자기 행동이 실제로 일어났는지 먼저 확인**해야 한다. `push()` 가 성사 건수를 세고,
  //        0 이면 서버가 뭐라고 거절했는지 찍은 뒤 다음 후보로 넘어간다.
  const askBoard = async () => {
    await page.evaluate((vid) => window.__sendPrimary({ type: 'village_trade', vid }), near.vid);
    await sleep(600);
    return page.evaluate(() => (window.__tradeBoard || { rows: [] }).rows);
  };
  const rowsNow = () => page.evaluate(() => (window.__tradeBoard || { rows: [] }).rows);
  const numOf = (rs, res) => (rs.find((r) => r.res === res) || {}).num;
  const stockOf = (rs, res) => (rs.find((r) => r.res === res) || {}).stock;
  // 한 후보를 실제로 밀어 본다 — 값이 움직이려면 재고를 **의미 있게** 움직여야 하고, 그러려면 여러 번 바꿔야 한다.
  //   ★전후 시세는 **직접 새로 받아서** 읽는다. 실패한 교환엔 서버가 시세표를 안 보내므로
  //     푸시만 기다리면 옛 표를 새 표로 착각한다(ⓓ 가 정확히 그거였다).
  async function push(gRow, tRow, times = 6) {
    const bfr = await askBoard();
    const others0 = bfr.filter((r) => r.res !== gRow.res && r.res !== tRow.res && r.num > 0).map((r) => [r.res, r.num]);
    await page.evaluate((it) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: 100000 } }), gRow.give[0]);
    await sleep(600);
    // ★성사 여부는 **알림이 아니라 재고**로 센다. 알림 링버퍼는 40칸에서 앞을 버려서
    //   `slice(n0)` 가 조용히 빈 배열이 될 수 있다 — 그러면 성사한 거래를 "거절"로 읽는다.
    //   서버는 **성공했을 때만** 시세표를 다시 보내므로, 재고가 줄었다는 건 거래가 실제로 붙었다는 뜻이다.
    const n0 = (await notices()).length;
    let dealt = 0, cur = stockOf(await rowsNow(), tRow.res);
    for (let k = 0; k < times; k++) {
      await page.evaluate(([vid, g, t]) => window.__sendPrimary({ type: 'village_trade_exec', vid, give: g, take: t, qty: 100000 }),
        [near.vid, gRow.res, tRow.res]);
      await sleep(650);
      const nx = stockOf(await rowsNow(), tRow.res);
      if (nx < cur - 1e-9) dealt++;
      cur = nx;
      if (!(cur > 0.5)) break;
    }
    const said = (await notices()).slice(n0).filter((x) => /🏪/.test(x));
    const err = (said.find((x) => !/거래소 —/.test(x)) || '').replace(/^🏪\s*/, '');
    const aft = await askBoard();
    const moved = others0.filter(([res, n0v]) => Math.abs((numOf(aft, res) || 0) - n0v) > 1e-12);
    return { dealt, err, gN0: numOf(bfr, gRow.res), gN1: numOf(aft, gRow.res),
             tN0: numOf(bfr, tRow.res), tN1: numOf(aft, tRow.res),
             tS0: stockOf(bfr, tRow.res), tS1: stockOf(aft, tRow.res),
             others: others0.length, movedN: moved.length };
  }

  // ★★[2026-08-28] **놀고 있는 동안 값이 움직이는가** — 날 얼림의 직접 대조.
  //   종전 대조는 "무관 품목이 **전부** 움직였으면 날이 흐른 것"이라고 읽었다. 그건 틀렸다:
  //   그림자 가격은 **바구니 전체를 한꺼번에** 푸는 값이라, 큰 거래 하나면 무관 품목도 같이 움직인다
  //   (`push` 는 일부러 수량 100000 을 6번 밀어 넣는다 — 작을 수가 없다).
  //   실제로 이 판정은 **어떤 품목이 뽑히느냐에 따라** 통과·실패가 갈렸다(약초면 통과, 익힌 음식이면 실패).
  //   ⇒ 재고를 안 건드리고 **같은 시간만큼 기다렸다가** 다시 읽는다. 여기서 0 이 나와야
  //     "방금 움직인 건 내 거래 때문"이 성립한다. 독립성 가정을 안 쓴다.
  async function idleDrift(times = 6) {
    const bfr = await askBoard();
    const before = bfr.filter((r) => r.num > 0).map((r) => [r.res, r.num]);
    await sleep(600 + times * 650);
    const aft = await askBoard();
    const moved = before.filter(([res, v]) => Math.abs((numOf(aft, res) || 0) - v) > 1e-12);
    return { n: before.length, movedN: moved.length, moved: moved.map(([r]) => r) };
  }
  // 후보 풀. ★짝을 고를 때 **마을이 값을 치를 수 있는지**를 먼저 본다 —
  //   비싼 물건 한 개 값이 마을이 내줄 수 있는 전량보다 비싸면 교환은 성립조차 안 한다(ⓓ).
  const pool = async () => {
    const rs = await askBoard();
    return {
      gives: rs.filter((r) => r.canGive && r.num > 0 && (r.give || []).length),
      takes: rs.filter((r) => r.canTake && r.num > 0 && r.sell > 0),
    };
  };
  const payPower = (t) => t.sell * t.num;                       // 마을이 그 품목으로 치를 수 있는 총액(곡식 환산)
  const feasible = (g, t) => g.res !== t.res && payPower(t) > g.num * 1.3;   // 한 개 값 + 스프레드 여유
  const P0 = await pool();
  ok(P0.gives.length > 0 && P0.takes.length > 0, '★전제 — 시험할 후보가 양쪽에 있다',
    `낼 것 ${P0.gives.length} · 받을 것 ${P0.takes.length}  [${P0.takes.slice().sort((a, b) => b.num - a.num).slice(0, 5).map((r) => `${r.ko}(${r.num}·${r.sell}개)`).join(' ')}]`);

  // ⑤-a **내가 판 물건 값이 떨어진다** — 낼 것 후보를 순회한다(비싼 쪽부터: 바닥에 붙어 있을 확률이 낮다).
  //   ★★[T17 2026-09-02] **상위 7종 자름을 뺐다.** T17 이 납품 표에 다섯 품목(보존식 4 + 소금)을
  //     더하자 상위 7종이 통째로 바뀌어 *"성사된 거래가 없다"* 로 떨어졌다 — 제품 결함이 아니라
  //     **픽스처가 "상위 7종 안에 답이 있다"를 가정**하고 있었던 것이다(`test-events ⑦a` 와 같은 결).
  //     성사되면 곧바로 break 하므로 평시 비용은 그대로다. 판정의 뜻도 그대로다.
  let sellHit = null; const sellTried = [];
  for (const g of P0.gives.slice().sort((a, b) => b.num - a.num)) {
    const P = await pool();
    const t = P.takes.filter((x) => feasible(g, x)).sort((a, b) => payPower(b) - payPower(a))[0];
    if (!t) { console.log(`    [판다] ${g.ko}(${g.num}) — 이 마을이 값을 치를 수 있는 품목이 없다 · 건너뜀`); continue; }
    const r = await push(g, t);
    console.log(`    [판다] ${g.ko} → ${t.ko} (성사 ${r.dealt}회): ${g.ko} ${r.gN0} → ${r.gN1}`
      + `  [무관 ${r.others}중 ${r.movedN} 이동]${r.dealt ? '' : `  ⚠거절: ${r.err}`}`);
    if (!r.dealt) continue;                                     // 거래가 안 일어났으면 판정 대상이 아니다
    sellTried.push(`${g.ko} ${r.gN0}→${r.gN1}`);
    if (r.gN1 < r.gN0) { sellHit = { g, t, r }; break; }
  }
  ok(!!sellHit, '★★⑤ **내가 판 물건 값이 화면에서 떨어졌다** — 첫 30분 ②의 그 장면',
    sellHit ? `${sellHit.g.ko} ${sellHit.r.gN0} → ${sellHit.r.gN1} (${sellHit.g.ko}→${sellHit.t.ko} 성사 ${sellHit.r.dealt}회)`
            : `실제로 거래된 후보 ${sellTried.length}종 전부 안 움직임: ${sellTried.join(' · ') || '(성사된 거래가 없다)'}`);
  if (sellHit) {
    // ★자명 통과 금지 — **아무것도 안 하면 아무것도 안 움직여야** 한다(날 얼림의 직접 대조).
    const idle = await idleDrift();
    console.log(`    [대조] 거래 없이 같은 시간 대기 → ${idle.n}품목 중 ${idle.movedN} 이동` +
      (idle.movedN ? ` (${idle.moved.join(' ')})` : ''));
    ok(idle.n > 0 && idle.movedN === 0,
      '★★⑤ 대조 — **거래를 안 하면 값이 안 움직인다**(방금 움직인 게 내 거래 때문임을 못 박는다)',
      `놀린 ${idle.n}품목 중 ${idle.movedN} 이동`);
    // ★★그리고 그 값이 **진짜 화면에 그려져 있다** — 페이로드만 바뀌고 DOM 이 안 바뀌면 없는 기능이다.
    const shown = await page.evaluate(() => window.__panelText());
    ok(shown.includes(String(sellHit.r.gN1)),
      '★★⑤ 바뀐 값이 **패널에 실제로 그려져 있다**', `"${sellHit.r.gN1}" 화면에 있음`);
  }

  // ⑤-b **내가 산 물건 값이 오른다** — 이번엔 **받을 것**을 순회한다(바닥 품목 하나가 위 판정을 못 죽이게).
  //   ★낼 것은 **가장 싼 것**을 쓴다 — 한 개 값이 쌀수록 마을이 값을 치르기 쉬워 거래가 성립하고,
  //     많이 낼수록 상한(재고의 25%)까지 긁어 **재고를 실제로 뺄** 수 있다.
  let buyHit = null; const buyTried = [];
  for (const t of (await pool()).takes.slice().sort((a, b) => b.num - a.num)) {   // ★[T17] 위 ⑤-a 와 같은 이유로 자름 제거
    const P = await pool();
    const g = P.gives.filter((x) => feasible(x, t)).sort((a, b) => a.num - b.num)[0];
    if (!g) { console.log(`    [산다] ${t.ko}(${t.num}·${t.sell}개) — 낼 수 있는 짝이 없다 · 건너뜀`); continue; }
    const r = await push(g, t);
    console.log(`    [산다] ${g.ko} → ${t.ko} (성사 ${r.dealt}회): ${t.ko} 재고 ${r.tS0} → ${r.tS1} · 시세 ${r.tN0} → ${r.tN1}`
      + `${r.dealt ? '' : `  ⚠거절: ${r.err}`}`);
    if (!r.dealt) continue;
    buyTried.push(`${t.ko} ${r.tN0}→${r.tN1}(재고 ${r.tS0}→${r.tS1})`);
    if (r.tN1 > r.tN0) { buyHit = { g, t, r }; break; }
  }
  ok(!!buyHit, '★★⑤ 내가 **산** 물건 값은 화면에서 올랐다',
    buyHit ? `${buyHit.t.ko} ${buyHit.r.tN0} → ${buyHit.r.tN1} (재고 ${buyHit.r.tS0} → ${buyHit.r.tS1})`
           : `실제로 거래된 후보 ${buyTried.length}종 전부 안 움직임: ${buyTried.join(' · ') || '(성사된 거래가 없다)'}`);
  if (buyHit) {
    ok(buyHit.r.tS1 < buyHit.r.tS0, '★⑤ 마을 재고도 실제로 줄었다(값만 움직인 게 아니다)',
      `${buyHit.r.tS0} → ${buyHit.r.tS1}`);
  }
  await snap('tr-05-price-moved');

  // ── ⑥ 게시판이 늘 낫다는 사실이 화면에 있다(거래소가 게시판을 잡아먹지 않는다) ──
  const hint = await page.evaluate(() => window.__panelText());
  ok(/게시판/.test(hint), '★⑥ 패널이 "마을이 원하는 건 게시판이 값을 더 쳐 준다"를 말한다',
    (hint.match(/[^\n]*게시판[^\n]*/) || [''])[0].trim().slice(0, 70));
  ok(/마을 몫\s*\d+%/.test(hint) || new RegExp(`${Math.round(board.spread * 100)}\\s*%`).test(hint),
    '★⑥ 마을이 떼는 몫(스프레드)을 숨기지 않는다', `${Math.round(board.spread * 100)}%`);

  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
