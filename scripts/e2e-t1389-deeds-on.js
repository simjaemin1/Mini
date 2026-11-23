#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 실서버 판 하나 · 실클라 하나(약 3분)
// @bait 1
// === scripts/e2e-t1389-deeds-on.js — 사유지 돌봄 켬 판 실클라 한 바퀴(★T1389 켬 기본 점검표): 선포 · 돌봄 · 빚 · 먼 칸 풀림 · 돌아온 알림 · 다시 선포 ==========
//
//   central + 존(`T1305_DEEDS=1` · 시험 값: 하루 4초 · D0 0.02 → 1칸 버티는 날 32날 = 128초 · 2칸 8날 = 32초 · 서 있기 초당 20점)을 띄우고 실클라로:
//   ① C 로 첫 칸 · 옆으로 한 칸 걸어 C 로 둘째 칸(집 = 첫 칸) · 패널에 "내 땅 합 2칸"
//   ② 청크 밖으로 걸어 나가 접속을 끊는다 → 저축이 바닥나고(32초) 빚 100점(16초)마다 한 칸 — **먼 칸(둘째)이 먼저 풀리고 집(첫 칸)은 남는다**
//   ③ 다시 접속하면 알림 한 줄 "비운 동안 내 땅 1칸이 풀렸습니다" · 패널에 빚 · "지금대로면 … 뒤 한 칸"
//   ④ 걸어 돌아가 집 칸에서 머물고(빚부터 갚는다) 풀린 칸에서 C — 값을 내고 다시 잡는다(이어받음) · 집은 그대로
//   영토 안 인정 문(마을 영토 안은 그 마을 인정 구성원만)은 마을이 있는 세계가 필요하다 — 존 정본 경로로 `test-claim-v2` ⑨ 가 잰다(insideNonMember · insideMember).
//   ★미끼(파일 안 · 1): 먼 차례를 뒤집은 `deeds.js` 사본 + 그 사본을 싣는 존 사본(`server/_t1389bait-*` · 판 끝에 지움)으로 ① ~ ② 를 다시 돈다 → ② "먼 칸이 먼저 · 집은 남는다" 빨강.
//   node scripts/e2e-t1389-deeds-on.js     (약 6분 · 판 둘)
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트 — 띄우는 동안 혼자 쥔다
process.env.T1392_FIRST_LOT = process.env.T1392_FIRST_LOT || '0';   // ★[T1428] 이 판은 한 칸 선포를 전제로 쓴다 — 첫 집터(-on 가지에서 돌봄과 같이 켬 기본 후보)는 글자로 끈다(제 하네스 test-t1392-first-lot · e2e-first30 이 잰다)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
FB.mustBeFree([CPORT, ZPORT], 'e2e-t1389-deeds-on');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
FB.reapOnExit(procs);
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`/tmp/e2e-t1389-${path.basename(file, '.js')}-${process.pid}.log`); p.stdout.pipe(lg); p.stderr.pipe(lg);   // 관 비우기(안 읽으면 존이 쓰다 멈춘다)
  procs.push(p); return p;
}
// 한 판 — zoneFile = 정본 `zone.js` 또는 미끼 사본 · full = ③ ④ 까지(미끼 판은 ② 까지)
async function round(zoneFile, full) {
  const R = {};
  const CDB = `/tmp/t1389e-central-${process.pid}-${Date.now() % 1e6}.db`, ZDB = `/tmp/t1389e-zone-${process.pid}-${Date.now() % 1e6}.db`;
  const c0 = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cUp = FB.waitUp(c0, /central server up on/, { name: 'central' });
  const z0 = boot(zoneFile, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
    T1305_DEEDS: '1', T1305_DAY_MS: '4000', T1305_TICK_MS: '10000', T1305_CARE_S: '2', T1343_D0: '0.02', T1343_Q_IDLE: '20' });
  const zUp = FB.waitUp(z0, /zone server up on/, { name: 'zone', capMs: 300000 });
  R.up = (await cUp).ok && (await zUp).ok;
  for (let i = 0; i < 120; i++) { try { const z = await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(3000) })).json(); const h = (z.zones || {}).hanbando || {}; if (h.population != null && h.cap) break; } catch (e) {} await sleep(1000); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const perrs = [];
  const name = 'debt' + Date.now().toString(36).slice(-5);
  const login = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => perrs.push(String(e.message).slice(0, 200)));
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await page.fill('#name', name); await page.fill('#password', 'pw1234'); await page.click('#enter');
    for (let i = 0; i < 80 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(2000); return page;
  };
  let page = await login();
  R.in = await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()));
  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  for (let i = 0; i < 5; i++) { await send({ type: '__e2e_give', items: { wood: 80, stone: 80 } }); await sleep(1000); const inv = await page.evaluate(() => window.__getInv && window.__getInv()); if (inv && inv.wood >= 30) break; }
  const mine = () => page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'personal'));
  const cellOf = (p) => [Math.floor(p.x / 32), Math.floor(p.y / 32)];
  const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(250); };
  //   화면이 아이소메트릭이다 — 키 하나는 세계 대각(d = (+, −) · s = (+, +) · a = (−, +) · w = (−, −))라 세계 축 한 칸은 키 둘을 함께 누른다
  const hold2 = async (k1, k2, ms) => { await page.keyboard.down(k1); await page.keyboard.down(k2); await sleep(ms); await page.keyboard.up(k1); await page.keyboard.up(k2); await sleep(250); };
  const AX = { '+x': ['d', 's'], '-x': ['a', 'w'], '+y': ['s', 'a'], '-y': ['w', 'd'] };
  const goCell = async (tc) => {   // 세계 칸 tc 에 설 때까지(축마다 짧게 · 넘으면 되돌아)
    for (let i = 0; i < 300; i++) {
      const c = cellOf(await page.evaluate(() => window.__getMyAbs()));
      if (c[0] === tc[0] && c[1] === tc[1]) return true;
      const ax = c[0] !== tc[0] ? (c[0] < tc[0] ? '+x' : '-x') : (c[1] < tc[1] ? '+y' : '-y');
      const far = ax[1] === 'x' ? Math.abs(c[0] - tc[0]) : Math.abs(c[1] - tc[1]);   // 그 축의 남은 칸
      await hold2(AX[ax][0], AX[ax][1], far > 2 ? Math.min(2000, (far - 1) * 300) : 50);
    }
    return false;
  };
  // ① 첫 칸 · 옆 칸
  const tStart = Date.now(), tl = []; const mark = (k) => tl.push(`${k} ${((Date.now() - tStart) / 1000).toFixed(0)}s`);
  const p0 = await page.evaluate(() => window.__getMyAbs()), c0c = cellOf(p0);
  await page.keyboard.press('c'); await sleep(1200);
  await goCell([c0c[0] + 1, c0c[1]]);
  const c1c = cellOf(await page.evaluate(() => window.__getMyAbs()));
  await page.keyboard.press('c'); await sleep(1500); mark('둘째');
  const m1 = await mine();
  R.two = m1.length === 2 && c1c[0] === c0c[0] + 1 && c1c[1] === c0c[1];
  R.two_ = `${m1.length}칸 · 집 (${c0c}) · 둘째 (${c1c})`;
  await page.keyboard.press('y'); await sleep(1000);
  const txt1 = await page.evaluate(() => (document.getElementById('spBody') || {}).innerText || '');
  R.panel1 = /내 땅 합 2칸/.test(txt1); R.panel1_ = (txt1.match(/내 땅 합[^\n]*/) || [''])[0].slice(0, 140);
  await page.keyboard.press('y'); await sleep(300);
  // ② 청크 밖으로 나가 끊는다
  let p1 = await page.evaluate(() => window.__getMyAbs()), held = 0;
  const dirs = ['s', 'd', 'a', 'w']; let di = 0, last = p1;   // 막히면 다른 방향(물 · 바위)
  while (held < 40000 && Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) <= 2 * 4 * 32) { await hold(dirs[di], 1000); held += 1000; p1 = await page.evaluate(() => window.__getMyAbs()); if (Math.hypot(p1.x - last.x, p1.y - last.y) < 8) di = (di + 1) % 4; last = p1; }
  R.away = Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) > 2 * 4 * 32;
  await page.context().close(); mark('끊음');
  const key = (c) => c[0] + ',' + c[1];
  // 서버가 푼 차례는 다시 들어와 클라가 받은 칸 상태로 잰다 — 저축 바닥(약 32초) + 빚 100점(약 16초) 뒤 · 집 칸 풀림(그 뒤 128초) 앞
  await sleep(62000);
  page = await login(); mark('다시');
  const m2 = await page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'personal').map((c) => ({ id: c.id, cx: Math.floor(c.wx / 32), cy: Math.floor(c.wy / 32), state: c.state, care: c.care })));
  const st = (c) => { const q = m2.find((x) => x.cx === c[0] && x.cy === c[1]); return q ? (q.state || 'active') : '없음'; };
  R.farFirst = st(c1c) === 'free' && st(c0c) !== 'free' && st(c0c) !== '없음';
  R.farFirst_ = `둘째 ${st(c1c)} · 집 ${st(c0c)} · ${tl.join(' · ')}`;
  if (full) {
    const notes = await page.evaluate(() => (window.__notices || []).slice(-6));   // @notice-ok [PM land1086] 접속 직후 고리 끝 여섯 줄(풀림 알림 한 줄을 찾는다) — 표지 꼴로 옮기기는 T1402
    R.notice = notes.some((n) => /비운 동안 내 땅 1칸이 풀렸습니다/.test(n)); R.notice_ = notes.filter((n) => /비운 동안/.test(n)).join(' | ').slice(0, 140) || notes.slice(-2).join(' | ').slice(0, 140);
    await page.keyboard.press('y'); await sleep(1200);
    const txt2 = await page.evaluate(() => (document.getElementById('spBody') || {}).innerText || '');
    R.panel2 = /내 땅 합 1칸/.test(txt2) && /빚 \d+점/.test(txt2) && /지금대로면 .+ 뒤 한 칸/.test(txt2); R.panel2_ = txt2.split('\n').filter((l) => /내 땅 합|빚|지금대로면/.test(l)).join(' / ').slice(0, 200);
    await page.keyboard.press('y'); await sleep(300);
    // ④ 걸어 돌아가 풀린 칸에서 C
    const eta = await page.evaluate(() => { const M = window.__deedsMeter; return M && M.first ? Math.round((M.first - M.now) / 1000) : null; });
    const tw = Date.now(); await goCell(c0c);   // 집 칸으로 돌아와 머문다(머묾 2초 뒤 서 있기 초당 20점 — 빚부터 갚는다)
    const st0 = await page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'personal').map((c) => c.state || 'active').join(','));
    await sleep(6000); await goCell(c1c);
    R.walk_ = `집 풀림까지 ${eta}초 남았을 때 출발 · 돌아오기 ${((Date.now() - tw) / 1000).toFixed(0)}초 · 집에 닿을 때 ${st0}`;
    await page.evaluate(() => { window.__notices = []; });
    await page.keyboard.press('c'); await sleep(1500);
    const notes2 = await page.evaluate(() => (window.__notices || []).slice(-3));   // @notice-ok [PM land1086] 바로 앞 줄에서 고리를 비웠다(표지와 같은 뜻)
    const m3 = await page.evaluate(() => (window.__getClaims ? window.__getClaims() : []).filter((c) => c.kind === 'personal').map((c) => ({ cx: Math.floor(c.wx / 32), cy: Math.floor(c.wy / 32), state: c.state })));
    const st3 = (c) => { const q = m3.find((x) => x.cx === c[0] && x.cy === c[1]); return q ? (q.state || 'active') : '없음'; };
    R.retake = notes2.some((n) => /이어받았습니다|사유지를 두었습니다/.test(n)) && st3(c1c) === 'active' && st3(c0c) === 'active';
    R.retake_ = `${notes2.join(' | ').slice(0, 120)} · 둘째 ${st3(c1c)} · 집 ${st3(c0c)} · ${R.walk_}`;
  }
  R.perr = perrs.length === 0; R.perr_ = perrs.slice(0, 2).join(' | ');
  try { await browser.close(); } catch (e) {}
  await FB.stopKids(procs); procs.length = 0; await FB.waitFree([CPORT, ZPORT]);
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  return R;
}

(async () => {
  console.log('\n=== T1389 사유지 돌봄 켬 판 — 실클라 한 바퀴(선포 · 빚 · 먼 칸 풀림 · 돌아온 알림 · 다시 선포) ===');
  const R = await round('zone.js', true);
  ok(R.up && R.in, '[상황] central · 존(켬) 기동 · 실클라 입장');
  ok(R.two, '① C 로 첫 칸 · 옆으로 한 칸 걸어 둘째 칸(변 맞댐)', R.two_);
  ok(R.panel1, '① 패널 "내 땅 합 2칸"', R.panel1_);
  ok(R.away, '[상황] 청크 밖으로 걸어 나가 접속을 끊었다');
  ok(R.farFirst, '② 비운 동안 — 먼 칸(둘째)이 먼저 풀리고 집(첫 칸)은 남는다(통째로 안 풀림)', R.farFirst_);
  ok(R.notice, '③ 다시 들어오면 알림 한 줄 "비운 동안 내 땅 1칸이 풀렸습니다"', R.notice_);
  ok(R.panel2, '③ 패널 — 내 땅 합 1칸 · 빚 n점 · "지금대로면 … 뒤 한 칸"', R.panel2_);
  ok(R.retake, '④ 걸어 돌아가 집에서 머물고 풀린 칸에서 C — 다시 잡는다 · 집 그대로', R.retake_);
  ok(R.perr, '페이지 오류 0', R.perr_);
  // ★미끼 — 먼 차례를 뒤집은 deeds 사본(가까운 칸 = 집부터)
  const DS = fs.readFileSync(path.join(ROOT, 'server', 'deeds.js'), 'utf8'), ZS = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const from = '  return (a, b) => (far(b) - far(a)) || (eu(b) - eu(a)) || (a.x - b.x) || (a.y - b.y);';
  const n = DS.split(from).length - 1;
  const bd = path.join(ROOT, 'server', `_t1389bait-deeds-${process.pid}.js`), bz = path.join(ROOT, 'server', `_t1389bait-zone-${process.pid}.js`);
  let RB = null;
  try {
    fs.writeFileSync(bd, DS.split(from).join('  return (a, b) => (far(a) - far(b)) || (eu(a) - eu(b)) || (a.x - b.x) || (a.y - b.y);'));
    fs.writeFileSync(bz, ZS.split("require('./deeds')").join(`require('./${path.basename(bd, '.js')}')`));
    RB = await round(path.basename(bz), false);
  } finally { for (const f of [bd, bz]) { try { fs.unlinkSync(f); } catch (e) {} } }
  ok(n === 1 && !!RB && RB.two === true && RB.farFirst === false, '★미끼 — 먼 차례를 뒤집은 사본(집부터 푼다) → ② "먼 칸이 먼저 · 집은 남는다" 빨강(① 은 초록)', `바꾼 자리 ${n} · two=${RB && RB.two} farFirst=${RB && RB.farFirst} · ${RB ? RB.farFirst_ : ''}`);
  console.log(`\n=== T1389 사유지 켬 실클라: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill('SIGKILL'); } catch (x) {} } process.exit(1); });
