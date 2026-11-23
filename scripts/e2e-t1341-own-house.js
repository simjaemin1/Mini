#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 야간 세 밤 분할(T238) · 실서버 판 하나 · 실클라 하나(2 ~ 3분)
// === scripts/e2e-t1341-own-house.js — T1341 새 대본 실클라 판: 제 집 짓기 → 마을 의뢰(받아들임만) ====================
//
// ★왜 [★재민 11-16 · 카드 T1341 ⑤ ⑥] 켬(`T1341_OWN_HOUSE=1`) 대본을 **진짜 서버 · 진짜 로비 · 진짜 화면**에서 따라간다.
//   `e2e-onboarding`(의뢰 3건 → 빈터) · `e2e-next-step`(첫 의뢰 → 빈터 · 가입 · 터)은 끔 판(종전 대본)을 그대로 잰다 —
//   켬에서는 두 하네스의 등뼈(의뢰가 빈터를 내준다)가 바로 걷은 것이라 새 대본은 이 하네스가 잰다(같은 손 · 같은 픽스처 꼴).
//
// ★재는 것(새 게스트 한 명 · 로비 「아무 곳이나(추천)」 원클릭):
//   ① 도착 — 「지금 할 일」 = "집터 재료 모으기" · 글 차례(방위 · 걸음 → 무엇이 몇 개 → 지금 몇 개 → 어떻게) · 목표 = 서버가 고른 나무(클라가 받은 자연물에 그 나무가 있다)
//   ② 재료 — 모자라면 C 가 거절된다(재료 거절 글 · 짐 무변) · 나무가 차면 바위 쪽 · 다 차면 "집터 잡기" 단추
//   ③ 영토 안 — 미가입자가 마을 영토 안에서 C 를 누르면 거절(인정 구성원 문 글 · 이모지 0 · 짐 무변)
//   ④ 영토 밖 빈 들 — 미가입자 · 의뢰 0 건으로 단추를 눌러 집터가 선다(서버 claim_added · 짐 = 나무 −3 · 돌 −2 · 선물 0) · 칸 "움집 짓기"
//   ⑤ 움집 — 터 안에서 움집 터파기(있는 건축 흐름 · 곡괭이는 픽스처) → 칸이 마을 줄기로
//   ⑥ 의뢰 — 촌장 첫 마디 "…구해다 주면 고맙겠네"(갚음 0) · 게시판 판 "받는 것 · 받아들임 +1" · Shift N 으로 다 채우면
//      받아들임 +1(서버 계량기) · 짐 변화 = 낸 것만 · 알림 "받아들임이 1 올랐습니다" · 칸 "받아들임 1" · HUD "받아들임 1"
//   ⑦ 그림 넷(도착 · 집터 · 게시판 · 받아들임) · 페이지 오류 0 · 이 대본의 글(칸 · 촌장 말 · 알림)에 이모지 0
// ★자명 통과 금지: 판정은 서버가 돌려준 것(claim_added · 계량기 · 짐)으로만 · 거절 판정 전에 재료가 모자람 / 영토 안임을 먼저 잰다.
//
// 실행: node scripts/e2e-t1341-own-house.js [--headed] [--shots <디렉터리>]
'use strict';
const path = require('path');
const NM = require('./lib-notice-mark');   // [T1367] 표지 뒤 알림 · 조건 기다림("마지막 알림 N줄" 대신)
const fs = require('fs');
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold` · PM land1082)
process.env.T1392_FIRST_LOT = process.env.T1392_FIRST_LOT || '0';   // ★[T1428] 이 판은 한 칸 선포를 전제로 쓴다 — 첫 집터(-on 가지에서 돌봄과 같이 켬 기본 후보)는 글자로 끈다(제 하네스 test-t1392-first-lot · e2e-first30 이 잰다)
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const SHOTS = (argv.indexOf('--shots') >= 0 && argv[argv.indexOf('--shots') + 1]) || '/tmp/e2e-t1341-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-t1341-central-${process.pid}.db`, ZDB = `/tmp/e2e-t1341-zone-${process.pid}.db`;
for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}-\u{21FF}]/u;
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  console.log('\n=== T1341 새 대본 — 제 집 짓기 → 마을 의뢰(받아들임만) · 실클라 하나 ===');
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    VILLAGE_MAX: '4', VILLAGE_DAY_MS: '500', E2E_GIVE: '1',   // ★의뢰를 세우는 픽스처(`e2e-next-step` · `e2e-onboarding` 과 같은 꼴)
    T1341_OWN_HOUSE: '1' });
  const zu = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  const c0 = await cu; ok(c0.ok, 'central 기동', c0.ok ? `${c0.ms}ms` : c0.why);
  const z0 = await zu; ok(z0.ok, 'zone 기동 · T1341_OWN_HOUSE=1');
  await sleep(6000);
  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
  const shots = [];
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); try { await page.screenshot({ path: f }); shots.push(f); } catch (e) {} };
  const nx = () => page.evaluate(() => (window.__t1064Next ? window.__t1064Next() : null));
  const onbS = () => page.evaluate(() => window.__onbState || null);
  const inv = () => page.evaluate(() => Object.assign({}, (window.__getInv && window.__getInv()) || {}));
  const notices = () => page.evaluate(() => (window.__notices || []).slice());
  const tp = (x, y) => page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
  const give = (items, tools) => page.evaluate(([it, tl]) => window.__sendPrimary({ type: '__e2e_give', items: it, tools: tl || [] }), [items, tools || []]);
  const waitNext = async (pred, ms) => { let n = null; for (let i = 0; i < (ms || 15000) / 300; i++) { n = await nx(); if (n && pred(n)) return n; await sleep(300); } return n; };
  const panelText = () => page.evaluate(() => (document.getElementById('onbNext') || {}).textContent || '');
  const myClaims = () => page.evaluate(() => { const c = conns.get(primaryZoneId); const me = myPlayerId || myUsername; let n = 0; if (c && c.claims) for (const cl of c.claims.values()) if (cl.ownerPid === me && cl.kind === 'personal') n++; return n; });
  const texts = [];   // 이 대본이 낸 글(칸 · 촌장 말 · 알림) — ⑦ 이모지 0

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  let info = null;
  for (let i = 0; i < 80 && !info; i++) { info = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!info) await sleep(700); }
  pre(!!(info && info.villages && info.villages.length && info.recommend != null), '시작 화면이 마을 목록 · 추천을 받았다', info ? `${info.villages.length}곳 · 추천 ${info.recommend}` : '없음');
  const V = info ? info.villages.find((v) => v.vid === info.recommend) : null;
  await page.evaluate(() => window.__onbAny());
  let inWorld = false;
  for (let i = 0; i < 240 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
  ok(inWorld, '존 입장(서버 권위 좌표)');
  const OFF = await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 }; });
  const tArrive = Date.now();

  // ── ① 도착 ─────────────────────────────────────────────────────────────────────
  console.log('\n① 도착 — 「지금 할 일」이 제 집 재료부터');
  const n1 = await waitNext((n) => n.stage === 'gather', 20000);
  const s1 = await onbS();
  const O = s1 && s1.own;
  pre(!!O && !!O.cost && O.cost.wood > 0, '서버 대본 상태에 own 칸(집터 값 · 가까운 나무 · 바위)', JSON.stringify(O && { cost: O.cost, need: O.need, tree: !!O.tree, rock: !!O.rock }));
  ok(!!n1 && n1.stage === 'gather' && n1.item === '집터 재료 모으기', '★칸 — "집터 재료 모으기"(대본 앞 · 촌장보다 먼저)', JSON.stringify(n1 && [n1.stage, n1.item]));
  const g1 = n1 ? n1.guide : '';
  const iW = /^나무(는 .+?으로 \d+걸음입니다|가 바로 앞입니다)\. /.test(g1) ? 0 : -1, iC = g1.indexOf(`집터를 잡으려면 나무 ${O && O.cost.wood}개와 돌 ${O && O.cost.stone}개가 있어야 합니다.`), iH = g1.indexOf('지금 나무 0개와 돌 0개가 있습니다.'), iE = g1.indexOf('나무 곁에서 [E] 키로 나무를 베십시오.');
  ok(iW === 0 && iC > iW && iH > iC && iE > iH, '★글 차례 — 방위 · 걸음 → 무엇이 몇 개(서버 집터 값) → 지금 몇 개(짐) → 어떻게(E)', g1);
  ok(!!(n1 && n1.where && n1.where.steps >= 0 && (n1.where.dir || /바로 앞입니다/.test(n1.where.text))) && !(await page.evaluate(() => { const a = document.getElementById('onbNextArrow'); return !!(a && !a.classList.contains('hidden') && a.firstChild); })),
    '방위 · 걸음은 글로(T1204 꼴 — 멀면 방위 · 걸음 · 10걸음 안이면 "바로 앞" · 화살 0)', JSON.stringify(n1 && n1.where));
  const treeSeen = await page.evaluate((t) => { const c = conns.get(primaryZoneId); if (!c || !c.resources || !t) return null; for (const r of c.resources.values()) if (r && r.type === 'tree' && Math.abs(r.x - t.x) < 1 && Math.abs(r.y - t.y) < 1) return true; return false; }, O && O.tree);
  ok(treeSeen !== false, '목표 = 진짜 나무(클라가 받은 자연물 중 그 자리 · 시야 밖이면 판정 보류)', String(treeSeen));
  texts.push(g1, n1 && n1.item);
  await snap('01-도착-집터재료');

  // ── ② 재료 ─────────────────────────────────────────────────────────────────────
  console.log('\n② 재료 — 모자라면 거절 · 나무가 차면 바위 · 다 차면 단추');
  const inv0 = await inv();
  pre((inv0.wood | 0) < O.cost.wood && (inv0.stone | 0) < O.cost.stone, '빈손(재료 모자람)', JSON.stringify({ wood: inv0.wood | 0, stone: inv0.stone | 0 }));
  await page.evaluate(() => { window.__notices = []; });
  await page.keyboard.press('KeyC');
  let nt2 = []; for (let i = 0; i < 15; i++) { await sleep(300); nt2 = await notices(); if (nt2.some((t) => /재료가 모자랍니다/.test(t))) break; }
  if (!nt2.some((t) => /재료가 모자랍니다/.test(t))) { await page.evaluate(() => window.__sendPrimary({ type: 'claim', kind: 'personal' })); for (let i = 0; i < 10; i++) { await sleep(300); nt2 = await notices(); if (nt2.some((t) => /재료가 모자랍니다/.test(t))) break; } }
  const inv0b = await inv();
  ok(nt2.some((t) => t === `재료가 모자랍니다(나무 ${O.cost.wood}, 돌 ${O.cost.stone}).`) && (inv0b.wood | 0) === (inv0.wood | 0) && (await myClaims()) === 0, '★재료가 모자라면 집터 거절 글 · 짐 무변 · 터 0', JSON.stringify(nt2.slice(-2)));
  await give({ wood: O.cost.wood });
  const n2 = await waitNext((n) => n.stage === 'gather' && /^바위는 /.test(n.guide));
  ok(!!n2 && /지금 나무 \d+개와 돌 0개가 있습니다\. 바위 곁에서 \[E\] 키로 돌을 캐십시오\./.test(n2.guide), '★나무가 차면 바위 쪽(돌이 모자란다)', n2 && n2.guide);
  texts.push(n2 && n2.guide);
  await give({ stone: O.cost.stone });
  const n3 = await waitNext((n) => n.stage === 'claim');
  ok(!!n3 && n3.item === '집터 잡기' && n3.btn === 'claim' && /영토 밖 빈 들에서 집터 잡기 단추를 누르거나 \[C\] 키로/.test(n3.guide), '★다 차면 "집터 잡기" 단추 · C 키 · 영토 밖 빈 들', n3 && n3.guide);
  texts.push(n3 && n3.guide);

  // ── ③ 영토 안 — 미가입자 거절 ────────────────────────────────────────────────────
  console.log('\n③ 영토 안 — 미가입자는 거절');
  await tp(V.cx * 32 + 16, V.cy * 32 + 16);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__evNearVid)) !== V.vid; i++) await sleep(400);
  await sleep(500);
  const invIn = await inv();
  await page.evaluate(() => { window.__notices = []; window.__sendPrimary({ type: 'claim', kind: 'personal' }); });
  let nt3 = []; for (let i = 0; i < 15; i++) { await sleep(300); nt3 = await notices(); if (nt3.some((t) => /영토 안 집터는/.test(t))) break; }
  const ref3 = nt3.find((t) => /영토 안 집터는/.test(t)) || '';
  ok(!!ref3 && /인정받은 구성원만 잡을 수 있습니다\. 영토 밖 빈 들은 누구나 잡을 수 있습니다\./.test(ref3) && !EMOJI.test(ref3), '★미가입자 · 영토 안 — 인정 구성원 문 글(영토 밖은 누구나) · 이모지 0', ref3);
  const invIn2 = await inv();
  ok((invIn2.wood | 0) === (invIn.wood | 0) && (invIn2.stone | 0) === (invIn.stone | 0) && (await myClaims()) === 0, '거절이면 짐 무변 · 터 0', JSON.stringify([invIn2.wood, invIn2.stone]));
  texts.push(ref3);

  // ── ④ 영토 밖 빈 들 ────────────────────────────────────────────────────────────
  console.log('\n④ 영토 밖 빈 들 — 미가입자 · 의뢰 0 건으로 집터');
  await tp(V.arrive.x, V.arrive.y);
  const n4 = await waitNext((n) => n.stage === 'claim' && n.btn === 'claim');
  const sB = await onbS();
  pre(!!n4 && !!sB && (sB.contrib | 0) === 0 && !sB.firstDone, '도착 지점(어귀 밖 2셀) · 받아들임 0 · 의뢰 0', JSON.stringify({ contrib: sB && sB.contrib }));
  const invC = await inv(), k0 = await myClaims();
  await page.evaluate(() => { window.__notices = []; });
  await page.click('#onbNextBtn');
  let k1 = k0; for (let i = 0; i < 20 && k1 === k0; i++) { await sleep(300); k1 = await myClaims(); }
  const invC2 = await inv();
  const nt4 = await notices();
  ok(k1 === k0 + 1, '★미가입자 영토 밖 선포 — 단추 한 번에 집터(서버 claim_added)', `${k0} → ${k1}`);
  ok((invC2.wood | 0) === (invC.wood | 0) - O.cost.wood && (invC2.stone | 0) === (invC.stone | 0) - O.cost.stone, '★짐 = 나무 −3 · 돌 −2(모은 것이 곧 집 · 선물 0)', JSON.stringify([{ w: invC.wood, s: invC.stone }, { w: invC2.wood, s: invC2.stone }]));
  const ok4 = nt4.find((t) => /개인 사유지를 두었습니다/.test(t)) || '';
  ok(!!ok4 && !EMOJI.test(ok4), '알림 — 이모지 0 · 다음 할 일 한 마디', ok4);
  const n5 = await waitNext((n) => n.stage === 'build');
  ok(!!n5 && n5.item === '움집 짓기' && /\[Shift B\] 에서 움집 터파기를 고르십시오/.test(n5.guide), '★칸 — "움집 짓기"(있는 건축 흐름)', n5 && n5.guide);
  texts.push(ok4, n5 && n5.guide);
  await snap('02-집터-움집짓기');
  const tClaim = Date.now();

  // ── ⑤ 움집 터파기 ─────────────────────────────────────────────────────────────
  console.log('\n⑤ 움집 — 터파기가 서면 칸이 마을 줄기로');
  await give({}, ['pickaxe']);   // 픽스처 — 곡괭이(움집 터파기의 도구 · 길은 T1120 사다리가 잰다)
  await sleep(600);
  const me5 = await page.evaluate(() => { const a = window.__getSrvAbs(); const c = conns.get(primaryZoneId); return { x: a.x - ((c.meta && c.meta.worldOffsetX) || 0), y: a.y - ((c.meta && c.meta.worldOffsetY) || 0) }; });
  let hut = false;
  for (const [dx, dy] of [[0, -96], [0, 96], [96, 0], [-96, 0], [0, -160], [160, 0], [-160, 0], [0, 160]]) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'hut_start', atX: x, atY: y }), [me5.x + dx, me5.y + dy]);
    for (let i = 0; i < 8 && !hut; i++) { await sleep(300); hut = await page.evaluate(() => { const c = conns.get(primaryZoneId); const me = myPlayerId || myUsername; for (const b of c.buildings.values()) if (b.type === 'hut_site' && ((b.data && b.data.owner) || b.ownerId) === me) return true; return false; }); }
    if (hut) break;
  }
  pre(hut, '움집터가 섰다(서버 building_added · 내 것)');
  const n6 = await waitNext((n) => n.stage !== 'build');
  ok(!!n6 && ['enter', 'wait', 'rest', 'quest'].includes(n6.stage), '★칸이 마을 줄기로(촌장 · 의뢰 차례 — 앞서 인사를 받았으면 그 한 통대로)', JSON.stringify(n6 && [n6.stage, n6.item]));

  // ── ⑥ 의뢰 — 받아들임만 ────────────────────────────────────────────────────────
  console.log('\n⑥ 의뢰 — 갚음 0 · 받아들임 +1');
  await tp(V.cx * 32 + 16, V.cy * 32 + 16);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__evNearVid)) !== V.vid; i++) await sleep(400);
  //   의뢰를 세운다 — `e2e-next-step` ⑤ 의 그 꼴(픽스처 부족 · 날 흐름 · 한 품목에 매달리면 다음 품목)
  async function ensureBoard(vid, tries) {
    const skip = []; let lastItem = null, same = 0;
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
      await sleep(400);
      const b0 = await page.evaluate(() => window.__evLastBoard || null);
      if (b0 && b0.rows && b0.rows.length) return b0;
      const tgS = await NM.mark(page);
      await page.evaluate(([v, sk]) => window.__sendPrimary({ type: '__e2e_village_short', vid: v, skip: sk }), [vid, skip.slice()]);
      //   [T1367] 종전 0.9초 뒤 고리의 마지막 "(문턱" 줄 — 앞 판이 남긴 줄을 읽을 수 있었다 · 표지 뒤 픽스처 답이 올 때까지(상한 5초)
      const nl = (await NM.waitLine(page, tgS, /\(문턱 |소비 품목이 없다|그런 마을/, { capMs: 5000 })).list.filter((t) => /\(문턱 /.test(t)).slice(-1)[0] || '';
      const m = /\s(\S+) [-\d.]+→[-\d.]+ \(문턱/.exec(nl);
      const it = m ? m[1] : null;
      if (it && it === lastItem) same++; else { lastItem = it; same = 1; }
      if (it && same >= 2 && !skip.includes(it)) { skip.push(it); lastItem = null; same = 0; }
    }
    return await page.evaluate(() => window.__evLastBoard || null);
  }
  let greet = null, bd = null;
  for (let round = 0; round < 5 && !(bd && bd.rows && bd.rows.length); round++) {
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
    await sleep(300);
    bd = await ensureBoard(V.vid, 25);
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
    await sleep(500);
    bd = await ensureBoard(V.vid, 2);
  }
  pre(!!(bd && bd.rows && bd.rows.length), '게시판에 의뢰가 섰다(픽스처)', bd && bd.rows ? bd.rows.map((r) => `${r.item} ${r.remain}`).join(', ') : '');
  //   촌장 첫 마디 — 의뢰가 선 뒤에 인사를 청한다(클라는 한 번만 묻는다 — 칸이 인사를 받아야 의뢰 단계로)
  await page.evaluate((v) => window.__sendPrimary({ type: 'onboarding_greet', vid: v }), V.vid);
  for (let i = 0; i < 30 && !(greet && greet.kind === 'greet'); i++) { await sleep(400); greet = await page.evaluate(() => window.__onbGreet || null); }
  const qline = greet && greet.lines ? (greet.lines.find((l) => /달리네/.test(l)) || '') : '';
  ok(!!qline && /만 구해다 주면 고맙겠네\.$/.test(qline) && !greet.lines.some((l) => /갚/.test(l)), '★촌장 첫 마디 — "…구해다 주면 고맙겠네"(갚는 말 0)', JSON.stringify(greet && greet.lines));
  if (greet && greet.lines) texts.push(...greet.lines);
  const row = bd && bd.rows && bd.rows[0];
  ok(!!row && row.rewItem === null && row.take === null && /구해다 주면 고맙겠습니다\.$/.test(row.line || '') && bd.noRepay === true, '★게시판 자료 — 갚을 것 칸 비움 · 줄 "…고맙겠습니다" · noRepay', JSON.stringify(row && { rew: row.rewItem, line: row.line }));
  const pane = await page.evaluate(() => { const b = document.getElementById('boardPaneBody'); return b ? b.textContent : ''; });
  ok(/받는 것/.test(pane) && /받아들임 \+1/.test(pane) && !/갚을 것/.test(pane), '★게시판 판 — "받는 것 · 받아들임 +1"(갚을 것 0)', pane.slice(0, 120));
  await snap('03-게시판-받아들임');
  //   낼 것을 짐에 — 픽스처(품목은 판마다 갈린다 · T1291 — 상황을 세우고 판정은 서버가 돌려준 것으로)
  const giveIt = row && (row.give || [])[0];
  await give({ [giveIt]: Math.max(1, Math.ceil(row.remain)) });
  await sleep(800);
  const invQ = await inv(), sQ = await onbS();
  await page.evaluate(() => { window.__notices = []; });
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyN'); await page.keyboard.up('Shift');
  let sQ2 = sQ; for (let i = 0; i < 15; i++) { await sleep(300); sQ2 = await onbS(); if (sQ2 && (sQ2.contrib | 0) > (sQ.contrib | 0)) break; }
  if (!(sQ2 && (sQ2.contrib | 0) > (sQ.contrib | 0))) { await page.evaluate((v) => window.__sendPrimary({ type: 'village_deliver', vid: v }), V.vid); for (let i = 0; i < 15; i++) { await sleep(300); sQ2 = await onbS(); if (sQ2 && (sQ2.contrib | 0) > (sQ.contrib | 0)) break; } }
  const invQ2 = await inv();
  const ntQ = await notices();
  ok((sQ2.contrib | 0) === (sQ.contrib | 0) + 1, '★의뢰 완수 = 받아들임 +1(서버 계량기)', `${sQ.contrib} → ${sQ2.contrib}`);
  const diff = {}; for (const k of new Set([...Object.keys(invQ), ...Object.keys(invQ2)])) { const d = (invQ2[k] || 0) - (invQ[k] || 0); if (Math.abs(d) > 1e-9) diff[k] = d; }
  ok(Object.keys(diff).length >= 1 && Object.values(diff).every((d) => d < 0) && Object.keys(diff).every((k) => (row.give || []).includes(k)), '★짐 변화 = 낸 것만(늘어난 칸 0 · 갚음 0)', JSON.stringify(diff));
  const dl = ntQ.find((t) => /바쳤습니다/.test(t)) || '';
  ok(/부탁을 다 채워 받아들임이 1 올랐습니다\./.test(dl) && !/삯/.test(dl) && !EMOJI.test(dl), '★알림 — "받아들임이 1 올랐습니다" · 삯 0 · 이모지 0', dl);
  texts.push(dl);
  const hk = await page.evaluate(() => window.__onbGreet || null);
  ok(!!hk && hk.kind === 'hook' && !hk.lines.some((l) => /밥|빈터|갚/.test(l)) && hk.lines.some((l) => /부탁을 \d+건 더 채우면 우리 마을 영토 안에도 터를 잡게 해 줌세\./.test(l)), '촌장 한 통 — 밥 · 빈터 · 갚는 말 0 · 다음에 열리는 것', JSON.stringify(hk && hk.lines));
  if (hk && hk.lines) texts.push(...hk.lines);
  const sCl = await onbS();
  ok(!!sCl && sCl.lotOk === false, '빈터 선물 0(lotOk 거짓)', JSON.stringify(sCl && sCl.lotOk));
  //   칸 — 권함이 걸렸으면 "마을 가입"이 먼저 · 가입하면 "받아들임 n"
  let n7 = await nx();
  if (n7 && n7.stage === 'join') { texts.push(n7.guide); await page.click('#onbNextBtn'); n7 = await waitNext((n) => n.stage === 'more'); }
  else n7 = await waitNext((n) => n.stage === 'more');
  const need = (O && O.need) | 0;
  ok(!!n7 && n7.stage === 'more' && n7.item === '마을 부탁 들어주기' && new RegExp(`받아들임 ${sQ2.contrib | 0}\\. 부탁을 ${need - (sQ2.contrib | 0)}건 더 채우면 구성원으로 인정되어 영토 안에도 집터를 잡을 수 있습니다\\.`).test(n7.guide),
    '★칸 — "받아들임 n" · 다음에 열리는 것(인정 · 영토 안 집터)', n7 && n7.guide);
  const hud = await page.evaluate(() => (document.getElementById('onbHud') || {}).textContent || '');
  ok(new RegExp(`받아들임 ${sQ2.contrib | 0}`).test(hud), 'HUD 한 줄 — "받아들임 n"', hud);
  texts.push(n7 && n7.guide, hud);
  await page.evaluate(() => { const b = document.getElementById('boardPane'); if (b) b.classList.add('hidden'); });
  await sleep(400);
  await snap('04-받아들임-오름');

  // ── ⑦ 판 ──────────────────────────────────────────────────────────────────────
  console.log('\n⑦ 그림 · 오류 · 글');
  ok(shots.length === 4, `그림 넷 → ${SHOTS}`, shots.map((f) => path.basename(f)).join(' · '));
  ok(errs.length === 0, '페이지 오류 0', JSON.stringify(errs.slice(0, 3)));
  const emo = texts.filter((t) => t && EMOJI.test(t));
  ok(emo.length === 0, '이 대본의 글(칸 · 촌장 말 · 알림)에 이모지 0', JSON.stringify(emo.slice(0, 3)));
  console.log('  T1341_TIME ' + JSON.stringify({ arriveToClaimSec: +((tClaim - tArrive) / 1000).toFixed(1), note: '재료는 픽스처 — 걸어서 모으는 시간은 e2e-first30 --own 판' }));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  await browser.close(); shutdown(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ 하네스 예외: ' + (e && e.stack || e)); console.log(`\n=== ${pass + fail + 1}건 중 PASS ${pass} · FAIL ${fail + 1} ===`); shutdown(); process.exit(1); });
