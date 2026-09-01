#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-cold.js — 겨울 야생 밤 → 마을 → 모닥불 실클라 E2E ==============
//
// ★왜 [온도 소배치 2026-08-31 재민 확정]
//   `test-body ⑭` 은 **곡선이 맞는가**를 잰다(116/0). 이 레포가 배치 5 에서 배운 것은
//   계약도 역학도 멀쩡한데 **화면에 도달하지 못하는 층**이 하나 더 있다는 것이다.
//   이번 배치의 약속은 *"마을 = 안전망 · 야생 = 위험"* 인데, 그게 화면에서 안 보이면
//   플레이어는 마을을 **선택**할 수 없다. 그래서 진짜 Chromium 을 띄우고 걸어서 확인한다.
//
// ★★시간 손잡이: 한 해가 실시간 6시간이고 밤이 12분이라 "겨울 밤"을 기다릴 수 없다.
//   `__e2e_clock`(E2E_GIVE 게이트)으로 **몸·날씨가 보는 날짜/밤만** 세운다. econ 틱·하늘은 그대로다.
//
// ★검사 대상은 **배선과 도달**이다: 서버 값이 배지에 오는가 · 마을로 걸어 들어가면 완충이
//   실제로 오르는가 · 모닥불이 몸을 되돌리는가 · 클라가 온도 산수를 **혼자 하지 않는가**.
//
// 실행: node scripts/e2e-cold.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-cold-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-cold-central-${process.pid}.db`, ZDB = `/tmp/e2e-cold-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
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
  console.log('\n=== 겨울 추위 — 야생 밤 → 마을 → 모닥불 실클라 E2E (Chromium) ===');
  const Wx = require(path.join(ROOT, 'server', 'weather.js'));
  const WINTER = Math.round(Wx.anchors().winterMid);   // ★한겨울 = econ 기온 곡선의 최한일(사본 금지)
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',   // ★`__e2e_clock`·`__e2e_body` 픽스처가 이 게이트로만 산다
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(6000);   // 마을 시딩이 끝나야 welcome 에 영토가 실린다

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); return f; };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  if (enterBtn) await enterBtn.click();
  // ★입장 판정은 `__inWorld()` — `__getMyAbs` 는 초기값이 있어 **언제나 truthy** 라 자명 통과였다(족보).
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__inWorld && window.__inWorld()))); i++) await sleep(500);
  await sleep(1800);
  ok(await page.evaluate(() => !!(window.__inWorld && window.__inWorld())), '존 입장 — 월드 안이다');

  // ── ① 배지가 실제로 뜬다 — 서버가 준 값으로 ────────────────────────────────
  await page.evaluate((d) => window.__sendPrimary({ type: '__e2e_clock', day: d, night: true }), WINTER);
  await sleep(2500);
  const wx0 = await page.evaluate(() => (window.__wx ? window.__wx() : null));
  ok(!!wx0, '★① 클라가 서버 날씨 페이로드를 받았다', wx0 ? JSON.stringify(wx0) : 'null');
  const badge = await page.evaluate(() => {
    const el = document.getElementById('wxBadge');
    return el ? { hidden: el.hidden, text: el.textContent.trim(), title: el.title } : null;
  });
  ok(badge && !badge.hidden && badge.text.length > 2, '★★① **날씨 배지가 화면에 떴다**', badge ? badge.text : 'X');
  ok(badge && /℃/.test(badge.title), '★① 툴팁이 기온(℃)을 말한다 — "왜 추운지"에 답한다', badge ? badge.title : '');
  ok(wx0 && wx0.cold > 0.75, '★★① 한겨울 밤이 실제로 **혹한급**이다(자명 통과 금지)', wx0 ? wx0.cold : '');
  await snap('cold-01-winter-night');

  // ── ② 야생 — 완충이 없다 · 몸이 실제로 언다 ────────────────────────────────
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`, rows.slice(0, 3).map((r) => `${r.name}(${r.cx},${r.cy})`).join(' '));
  if (!rows.length) { console.log('\n마을 0 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0];
  const vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;

  const warpTo = async (x, y, want, tries) => {
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(1200);
      const w = await page.evaluate(() => (window.__wx ? window.__wx() : null));
      if (w && want(w)) return w;
    }
    return await page.evaluate(() => (window.__wx ? window.__wx() : null));
  };
  // 야생 = **완충이 0 인 자리**. 마을 반경(`_maxRPx`)은 마을마다 다르고 50곳이 흩어져 있으니
  //   좌표를 지어내지 않고 **게임이 답하는 값**(payload.shelter)이 0 이 될 때까지 넓혀 가며 찾는다.
  let wxWild = null, wildAt = null;
  outer:
  for (const r of [3000, 8000, 16000, 30000, 60000]) {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
      const tx = vx + dx * r, ty = vy + dy * r;
      if (tx < 200 || ty < 200) continue;
      const w = await warpTo(tx, ty, (q) => (q.shelter || 0) < 0.01, 3);
      if (w && (w.shelter || 0) < 0.01) { wxWild = w; wildAt = [tx, ty]; break outer; }
    }
  }
  const posWild = await page.evaluate(() => window.__getMyAbs());
  ok(wxWild && (wxWild.shelter || 0) < 0.01, '★★② 야생에는 **완충이 없다**',
    wxWild ? `shelter ${wxWild.shelter} @ ${wildAt} (abs ${Math.round(posWild.x)},${Math.round(posWild.y)})` : '야생을 못 찾음');
  // 몸을 0 에서 출발시키고 실제로 언다(픽스처는 상태만 세운다 — 역학은 서버가 돌린다)
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0, quiet: true }));
  await sleep(600);
  const cold0 = await page.evaluate(() => (window.__bodyState || {}).cold);
  await sleep(9000);
  const coldWild = await page.evaluate(() => (window.__bodyState || {}).cold);
  ok(coldWild > cold0 + 0.02, '★★② 야생 겨울밤에 서 있으면 **몸이 실제로 언다**', `${cold0} → ${coldWild}`);
  // ★★A/B 의 A — **같은 몸 상태(0.5)** 를 야생에 두면 계속 오른다(평형이 그보다 높으니까)
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0.5, quiet: true }));
  await sleep(700);
  const abWild0 = await page.evaluate(() => (window.__bodyState || {}).cold);
  await sleep(12000);
  const abWild1 = await page.evaluate(() => (window.__bodyState || {}).cold);
  ok(abWild1 > abWild0, '★★② 야생에선 0.5 에서도 **계속 나빠진다**(쉴 곳이 없다)', `${abWild0} → ${abWild1}`);
  await snap('cold-02-wild');

  // ── ③ 마을 진입 — 완충이 오르고 몸이 되돌아온다 ────────────────────────────
  const wxVil = await warpTo(vx, vy, (w) => (w.shelter || 0) > 0.5);
  ok(wxVil && (wxVil.shelter || 0) > 0.5, '★★③ **마을 안에서 완충이 붙는다**', `shelter ${wxVil && wxVil.shelter}`);
  ok(wxVil && wxVil.cut > 0.3, '★③ 서버가 "몇 % 막아 주는지"를 보내 준다(클라 상수 사본 금지)', `cut ${wxVil && wxVil.cut}`);
  const badgeVil = await page.evaluate(() => {
    const el = document.getElementById('wxBadge');
    return el ? { text: el.textContent.trim(), title: el.title } : null;
  });
  ok(badgeVil && /마을/.test(badgeVil.text + badgeVil.title),
    '★★③ **배지가 "마을이 막아 준다"고 말한다** — 안전망을 화면이 알려 준다', badgeVil ? badgeVil.text : '');
  // ★★A/B 의 B — **똑같은 0.5** 를 마을에서 두면 내려간다. 야생과 유일하게 다른 것이 장소다.
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0.5, quiet: true }));
  await sleep(700);
  const coldAtVilEntry = await page.evaluate(() => (window.__bodyState || {}).cold);
  await sleep(12000);
  const coldVil = await page.evaluate(() => (window.__bodyState || {}).cold);
  ok(coldVil < coldAtVilEntry, '★★③ 마을에 들어오면 **얼던 몸이 되돌아온다**(불도 실내도 없이)',
    `${coldAtVilEntry} → ${coldVil}`);
  ok(coldVil < abWild1, '★★③ **같은 0.5 에서 시작해도 마을과 야생의 12초 뒤가 갈린다**(안전망의 실체)',
    `마을 ${coldVil} < 야생 ${abWild1}`);
  await snap('cold-03-village');

  // ── ④ 모닥불 — **야생에서** 불이 사람을 살린다 ─────────────────────────────
  //   완충은 장소이고 불은 **행동**이다. 그래서 야생(완충 0)으로 돌아가 **불 없음 → 불 있음** A/B 로 묻는다.
  //   (마을 한복판은 이미 집이 빼곡해 불을 놓을 빈 칸이 없다 — 그리고 그건 이 판정의 주제가 아니다.)
  //   (초안은 "내려가기만 하면 통과"였다 — 마을 완충만으로도 내려가니 그건 자명 통과였다.)
  await warpTo(wildAt[0], wildAt[1], (w) => (w.shelter || 0) < 0.01, 8);
  const wxBack = await page.evaluate(() => (window.__wx ? window.__wx() : null));
  ok(wxBack && (wxBack.shelter || 0) < 0.01, '★④ 야생으로 돌아왔다(완충 0 — 불의 효과만 남는다)',
    `shelter ${wxBack && wxBack.shelter}`);
  const dropOver = async (secs) => {
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0.9, quiet: true }));
    await sleep(800);
    const a = await page.evaluate(() => (window.__bodyState || {}).cold);
    await sleep(secs * 1000);
    const b = await page.evaluate(() => (window.__bodyState || {}).cold);
    return { a, b, drop: a - b };
  };
  const noFire = await dropOver(9);
  ok(noFire.drop <= 0.005, '★★④ 전제 — 야생 겨울밤엔 **가만히 있으면 안 낫는다**',
    `${noFire.a} → ${noFire.b}`);
  // 제작창을 거치지 않고 **정본 배치 경로**(`place_building`)로 놓는다 — 좌표를 안 주면 발밑이다.
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { item_campfire: 3 } }));
  await sleep(900);
  await page.evaluate(() => { window.__notices = []; });
  await page.evaluate(() => window.__sendPrimary({ type: 'place_building', itemType: 'item_campfire', floor: 0, dir: 'N' }));
  await sleep(2200);
  const buildNotices = await page.evaluate(() => (window.__notices || []).slice(-4));
  ok(!buildNotices.some((t) => /이미|너무 멉|없음|불가|막혀|알 수 없는/.test(t)),
    '★④ 모닥불이 **정본 배치 경로로** 실제로 놓였다(거절 알림 없음)', JSON.stringify(buildNotices));
  const withFire = await dropOver(9);
  // ★기대치는 손으로 정하지 않는다 — 평형 수렴의 산수 그대로다:
  //   9초 · τ=COLD_TAU_SEC ⇒ k = 1−e^(−9/τ), 목표점은 불 옆 상한(COLD_FIRE_TARGET).
  const Bcfg = require(path.join(ROOT, 'server', 'body.js')).CFG;
  const kExp = 1 - Math.exp(-9 / Bcfg.COLD_TAU_SEC);
  const expect = (0.9 - Bcfg.COLD_FIRE_TARGET) * kExp;
  ok(withFire.drop > expect * 0.7,
    '★★④ **모닥불을 피우면 야생 한겨울 밤에도 몸이 풀린다**(행동이 만드는 안전)',
    `${withFire.a} → ${withFire.b} (Δ${withFire.drop.toFixed(4)} · 산수 기대 ${expect.toFixed(4)})`);
  ok(withFire.drop > Math.max(0.01, noFire.drop) * 5, '★★④ 불 있음이 불 없음보다 **압도적으로** 낫다(자명 통과 금지 A/B)',
    `불 없음 ${noFire.drop.toFixed(4)} → 불 옆 ${withFire.drop.toFixed(4)}`);
  await snap('cold-04-fire');

  // ── ⑤ 옷 티어 — **입은 옷이 겨울을 가른다** [추위 2차 2026-08-31] ──────────
  //   재민: *"조잡한 베옷은 한겨울 야생 밤을 못 막는다 — 겨울 = 가죽·모피 수요."*
  //   ★픽스처로 옷을 빚지 않는다 — **정본 구매 경로**(`craft_buy` = 마을 장인)로 짓는다.
  //     재료만 지급하고 나머지는 게임이 한다. 그래야 "화면에서 실제로 되는가"를 재는 것이다.
  //   ⚠여기서 재는 건 **같은 장인이 지은 두 옷의 차이**다. "맨손 조잡한 베옷은 절반의 밤에
  //     3단계까지 간다"는 **분포** 주장이라 24년 표본이 필요하고, 그건 `test-body ⑮㉣` 의 몫이다
  //     (실클라로 24년을 돌 수는 없다 — 하네스마다 잴 수 있는 것이 다르다).
  await warpTo(vx, vy, (w) => (w.shelter || 0) > 0.5, 8);   // 장인은 마을에 있다
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { hemp: 9, leather: 9, fur: 9 } }));
  await sleep(900);
  const buyWear = async (mat) => {
    await page.evaluate(() => { window.__notices = []; });
    await page.evaluate((m) => window.__sendPrimary({ type: 'craft_buy', itemType: 'clothes', material: m }), mat);
    await sleep(1600);
    const ns = await page.evaluate(() => (window.__notices || []).slice(-2));
    const id = await page.evaluate(() => {
      const st = window.__equipState && window.__equipState();
      const cl = ((st && st.equipment) || []).filter((e) => e.type === 'clothes');
      return cl.length ? cl[cl.length - 1].id : null;
    });
    if (id) { await page.evaluate((i2) => window.__sendPrimary({ type: 'equip_item', id: i2 }), id); await sleep(1400); }
    const wx2 = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    return { notices: ns, insC: wx2 ? wx2.insC : null, worn: id };
  };
  // ★★불에서 **멀리** 떨어진 야생으로 간다 — ④에서 피운 모닥불이 그 자리에 아직 탄다.
  //   (초안은 같은 좌표로 돌아가 옷 대신 **모닥불을 재고 있었다**: 삼베·갖옷 둘 다 Δ−0.069 로
  //    똑같이 나왔는데, 그게 불 옆 목표점 0.05 였다. 계측기가 먼저 틀린 자리 — 족보 ㊻.)
  const FAR = [wildAt[0] + 1200, wildAt[1] + 1200];
  const goFar = async () => {
    const w = await warpTo(FAR[0], FAR[1], (q) => (q.shelter || 0) < 0.01, 8);
    return w;
  };
  const settle = async (secs) => {
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0.9, quiet: true }));
    await sleep(900);
    const a2 = await page.evaluate(() => (window.__bodyState || {}).cold);
    await sleep(secs * 1000);
    const b2 = await page.evaluate(() => (window.__bodyState || {}).cold);
    return { a: a2, b: b2, d: b2 - a2 };
  };
  const hemp = await buyWear('hemp');
  ok(hemp.notices.some((t) => /삼베옷/.test(t)), '★★⑤ 장인이 **삼베옷**이라 부른다(재료가 곧 이름 — 고증)',
    JSON.stringify(hemp.notices));
  const wxFar = await goFar();
  ok(wxFar && (wxFar.shelter || 0) < 0.01, '★⑤ 불도 마을도 없는 야생이다(옷만 남는다)', `shelter ${wxFar && wxFar.shelter}`);
  const sHemp = await settle(45);
  const wxHemp = await page.evaluate(() => (window.__wx ? window.__wx() : null));

  await warpTo(vx, vy, (w) => (w.shelter || 0) > 0.5, 8);
  const fur = await buyWear('fur');
  ok(fur.notices.some((t) => /갖옷/.test(t)), '★★⑤ 모피를 맡기면 **갖옷**이 나온다', JSON.stringify(fur.notices));
  ok(fur.insC > (wxHemp ? wxHemp.insC : 0), '★★⑤ 배지가 **옷이 몇 ℃ 를 벌어 주는지** 말한다(삼베 < 갖옷)',
    `삼베 +${wxHemp && wxHemp.insC}℃ → 갖옷 +${fur.insC}℃`);
  await goFar();
  const sFur = await settle(45);
  ok(sFur.b < sHemp.b - 0.005,
    '★★⑤ **같은 밤·같은 자리·같은 0.9 에서 시작해도 갖옷 쪽이 결정적으로 덜 춥다**',
    `삼베옷 ${sHemp.b} → 갖옷 ${sFur.b} (차 ${(sHemp.b - sFur.b).toFixed(4)})`);
  ok(sFur.d < 0 && sFur.d < sHemp.d,
    '★★⑤ 자명 통과 금지 — 갖옷이 삼베옷보다 **더 많이 되돌린다**',
    `삼베 Δ${sHemp.d.toFixed(4)} vs 갖옷 Δ${sFur.d.toFixed(4)}`);
  await snap('cold-05-clothes');

  // ── ⑤ 클라가 온도 산수를 **혼자 하지 않는다**(사본 금지 — 달력과 같은 규약) ─
  const csrc = require('./client-src.js').readClientSrc()
    .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/coldOfC|temperatureAt|annualAmp|diurnalAmp|COLD_SEASON_W/.test(csrc),
    '★★⑤ `client.js` 에 온도 산수가 **한 줄도 없다** — 서버가 준 문장 재료만 그린다');
  ok(/myWeather\s*=\s*msg\.weather/.test(csrc), '★⑤ 배지의 원천은 서버 페이로드 하나다');

  // ── ⑥ 콘솔 결백 ────────────────────────────────────────────────────────────
  ok(errs.length === 0, '★⑥ 페이지 에러 0', errs.slice(0, 3).join(' | ') || '없음');

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  console.log(`    스크린샷: ${SHOTS}`);
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
