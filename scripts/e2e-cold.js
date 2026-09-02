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

  // ── ⑦ 바람 노출 · 옷 갈아입기 · 바닷물 [T4 2026-09-01 재민 확정 ④⑤] ────────
  //   재민 실기 3줄이 곧 이 절이다:
  //     *"한겨울 밤 같은 산의 골짜기에서 능선으로 올라가 보기"* ·
  //     *"삼베옷으로 야생 밤 → 가죽옷"* · *"바닷가에서 물 마셔 보기"*
  //   ★서버 값이 **화면까지 오는가**가 이 하네스의 몫이다(모델의 옳음은 `test-body ⑯`).
  {
    const Wind = require(path.join(ROOT, 'server', 'wind.js'));
    const Terr = require(path.join(ROOT, 'server', 'terrain.js'));
    const Salt = require(path.join(ROOT, 'server', 'salt.js'));
    const hard = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
    // ★하네스 안에서도 **정본 술어**를 주입해 쓴다(사본 금지). 존 서버는 별 프로세스라
    //   여기 바인딩은 "어디로 갈지"를 고르는 데만 쓰고, **판정은 서버가 보낸 `exp`** 로 한다.
    Terr.setZonesMeta({ hanbando: { zoneWidth: 70016, zoneHeight: 130016, biome: 'forest', isOcean: false } });
    Terr.setHardcoded('hanbando', hard);
    const isRockT = (x, y) => (x < 0 || y < 0 || x >= 70016 || y >= 130016)
      ? false : Terr.isRockCellLocal('hanbando', Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16);
    Wind.bindTerrain({ isRock: isRockT, forestMult: (x, y) => Terr.getForestMultiplier('hanbando', x, y) });
    // 자리는 **찾는다, 고르지 않는다**(족보 73)
    let RIDGE = null, rX = -1, VALLEY = null, vX = 9;
    for (const r of hard.ridges) {
      for (let i = 0; i < r.path.length; i += 3) {
        const [cx, cy] = r.path[i].pos;
        for (let a = 0; a < 16; a++) for (const d of [700, 1100, 1600]) {
          const ang = 2 * Math.PI * a / 16;
          const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
          if (x < 200 || y < 200 || isRockT(x, y) || Terr.isWaterCellLocal('hanbando', x, y)) continue;
          const e = Wind.explain(x, y, WINTER, 0);
          if (e.X > rX) { rX = e.X; RIDGE = [Math.round(x), Math.round(y)]; }
          if (e.bNW > 0.3 && e.bSE > 0.3 && e.X < vX) { vX = e.X; VALLEY = [Math.round(x), Math.round(y)]; }
        }
      }
    }
    ok(!!RIDGE && !!VALLEY, '★⑦ 산맥 둘레에서 능선(풍상 기슭)·골 자리를 찾았다',
      RIDGE && VALLEY ? `능선 ${RIDGE} X${rX} · 골 ${VALLEY} X${vX}` : 'X');

    // ── ㉠ 서버가 그 자리의 노출을 **실제로 계산해 보낸다** ────────────────
    const wxAt = async (xy) => {
      for (let i = 0; i < 12; i++) {
        await page.evaluate(([a2, b2]) => window.__sendPrimary({ type: 'teleport_debug', x: a2, y: b2 }), xy);
        await sleep(1200);
        const w = await page.evaluate(() => (window.__wx ? window.__wx() : null));
        const pos = await page.evaluate(() => window.__getMyAbs());
        if (w && w.exp != null && Math.hypot(pos.x - xy[0], pos.y - xy[1]) < 200) return w;
      }
      return await page.evaluate(() => (window.__wx ? window.__wx() : null));
    };
    const wRidge = await wxAt(RIDGE);
    ok(wRidge && wRidge.exp > 0.5, '★★⑦㉠ **능선(풍상 기슭)에서 서버가 노출을 보낸다**',
      wRidge ? `exp ${wRidge.exp} · wind ${wRidge.wind} · shelter ${wRidge.shelter}` : 'null');
    const wValley = await wxAt(VALLEY);
    ok(wValley && wValley.exp < 0.2, '★★⑦㉠ **골짜기에선 노출이 사그라든다**(같은 산 · 같은 밤)',
      wValley ? `exp ${wValley.exp}` : 'null');
    ok(wRidge && wValley && (wRidge.shelter || 0) < 0.01 && (wValley.shelter || 0) < 0.01,
      '★⑦㉠ 자명 통과 금지 — 둘 다 **마을 완충 0** 인 야생이다(갈린 것은 바람뿐)',
      `능선 ${wRidge && wRidge.shelter} · 골 ${wValley && wValley.shelter}`);

    // ── ㉡ 같은 몸 0.5 를 골 → 능선으로 옮기면 **몸이 갈린다** ──────────────
    const rise = async (xy, secs) => {
      await wxAt(xy);
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 0.5, quiet: true }));
      await sleep(900);
      const a2 = await page.evaluate(() => (window.__bodyState || {}).cold);
      await sleep(secs * 1000);
      const b2 = await page.evaluate(() => (window.__bodyState || {}).cold);
      return { a: a2, b: b2, d: b2 - a2 };
    };
    const rv = await rise(VALLEY, 12);
    const rr = await rise(RIDGE, 12);
    ok(rr.d > rv.d, '★★⑦㉡ **골짜기에서 능선으로 올라가면 같은 0.5 가 더 빨리 오른다**(재민 실기 1)',
      `골 Δ${rv.d.toFixed(4)} (${rv.a}→${rv.b}) vs 능선 Δ${rr.d.toFixed(4)} (${rr.a}→${rr.b})`);
    ok(rr.d > 0, '★⑦㉡ 능선에선 실제로 나빠진다(0 대 0 의 자명 비교가 아니다)', `Δ${rr.d.toFixed(4)}`);

    // ── ㉢ 삼베옷 → 가죽옷 [재민 확정 ⑤ · 실기 2] ──────────────────────────
    await warpTo(vx, vy, (w) => (w.shelter || 0) > 0.5, 8);   // 장인은 마을에 있다
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { hemp: 9, leather: 9 } }));
    await sleep(900);
    const hemp2 = await buyWear('hemp');
    const wxH2 = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    await warpTo(vx, vy, (w) => (w.shelter || 0) > 0.5, 8);
    const leat2 = await buyWear('leather');
    ok(leat2.notices.some((t) => /가죽옷/.test(t)), '★⑦㉢ 가죽을 맡기면 **가죽옷**이 나온다', JSON.stringify(leat2.notices));
    ok(leat2.insC > (wxH2 ? wxH2.insC : 0) + 0.4,
      '★★⑦㉢ **장인 삼베옷이 가죽옷을 못 이긴다** — 배지의 ℃ 가 갈린다(하향의 실배선)',
      `삼베 +${wxH2 && wxH2.insC}℃ → 가죽 +${leat2.insC}℃`);
    await goFar();
    const sLeat = await settle(45);
    ok(sLeat.b < sHemp.b - 0.005,
      '★★⑦㉢ 같은 밤·같은 자리·같은 0.9 에서 **가죽옷 쪽이 결정적으로 덜 춥다**',
      `삼베옷 ${sHemp.b} → 가죽옷 ${sLeat.b}`);

    // ── ㉣ 바닷가에서 물 마셔 보기 [T3 동봉 · 실기 3] ──────────────────────
    //   ★갯벌 자리는 **정본 술어 두 개를 그대로 불러** 찾는다(사본 금지 · 족보 ㊻):
    //     해안선 띠는 `chunk.generateCoastlineWaterTiles`(존 서버가 기동 때 부르는 바로 그 함수),
    //     갯벌 판정은 `salt.isTidalFlat`. 여기서 좌표를 손으로 적으면 그건 지형이 아니라 소원이다.
    const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
    const Chunk = require(path.join(ROOT, 'server', 'chunk.js'));
    const ZDEF = ZC.ZONES.hanbando;
    const OCEANS = Object.values(ZC.ZONES).filter((z) => z.isOcean)
      .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
    const WATERSET = Chunk.generateCoastlineWaterTiles(Object.assign({}, ZDEF, { id: 'hanbando' }), 32, ZC.findZoneAt, OCEANS);
    const seaAt = (x, y) => {
      const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
      return WATERSET.has(`${tx}_${ty}`) && !Terr.isWaterCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16);
    };
    let FLAT = null;
    for (let y = 118000; y < 130000 && !FLAT; y += 64) for (let x = 20000; x < 60000; x += 64) {
      if (Salt.isTidalFlat(x, y, { isSea: seaAt }) && !isRockT(x, y)) { FLAT = [x, y]; break; }
    }
    ok(!!FLAT, '★⑦㉣ 갯벌 자리를 **찾았다**(해안선·갯벌 정본 술어 그대로)', String(FLAT));
    if (FLAT) {
      for (let i = 0; i < 10; i++) {
        await page.evaluate(([a2, b2]) => window.__sendPrimary({ type: 'teleport_debug', x: a2, y: b2 }), FLAT);
        await sleep(1200);
        const pos = await page.evaluate(() => window.__getMyAbs());
        if (Math.hypot(pos.x - FLAT[0], pos.y - FLAT[1]) < 200) break;
      }
      await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', thirst: 40, quiet: true }));
      await sleep(900);
      const th0 = await page.evaluate(() => (window.__getGauges ? window.__getGauges().thirst : null));
      ok(th0 != null && th0 <= 41, '★⑦㉣ (상황) 목이 마른 채로 갯벌에 섰다 — 아니면 아래가 자명하다', `갈증 ${th0}`);
      await page.evaluate(() => { window.__notices = []; });
      await page.evaluate(() => window.__sendPrimary({ type: 'gather' }));
      await sleep(1800);
      const ns2 = await page.evaluate(() => (window.__notices || []).slice(-3));
      const th1 = await page.evaluate(() => (window.__getGauges ? window.__getGauges().thirst : null));
      ok(ns2.some((t) => /짠물/.test(t)),
        '★★⑦㉣ **바닷가에서 마시면 화면이 "짠물"이라고 말한다**(재민 실기 3)', JSON.stringify(ns2));
      ok(!ns2.some((t) => /물 마심/.test(t)), '★★⑦㉣ "물 마심 (+30)" 이 **안 뜬다** — 종전 결함이 사라졌다');
      ok(th1 != null && th0 != null && th1 <= th0, '★★⑦㉣ 갈증이 **한 점도 안 채워졌다**', `${th0} → ${th1}`);
    }
  }

  // ── ⑧ 캐논 변경 — 얼면 **죽는다** [T44 · 재민 확정 2026-09-01 §12] ─────────
  //   *"극단에 닿기 전엔 디버프만, 극단에 닿으면 HP 가 아주 천천히 깎인다."*
  //   시나리오: 한겨울 야생 밤 맨몸 → 극단 → HP 감소 시작 → **불** → 정지.
  //   ★HP 는 클라 훅을 새로 안 만들고 **화면이 말하는 값**(`#hpText`)으로 읽는다(클라 무접촉).
  {
    const hpNow = async () => page.evaluate(() => {
      const el = document.getElementById('hpText');
      if (!el) return null;
      const m = String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/);
      return m ? +m[1] : null;
    });
    // 옷을 벗는다 — ⑤·⑦ 에서 입은 게 남아 있으면 "맨몸"이 아니다
    //   ★해제는 **슬롯**으로 한다(`doUnequipItem(player, msg.slot)`) — id 를 보내면 조용히 아무 일도 안 난다.
    await page.evaluate(() => window.__sendPrimary({ type: 'unequip_item', slot: 'clothes' }));
    await sleep(1200);
    //   ★★**④ 에서 피운 모닥불이 그 자리에 아직 탄다** — `wildAt` 으로 돌아가면 불 옆 목표점(0.05)이라
    //     추위가 극단에 못 간다(초안이 그래서 "극단인데 안 깎인다"는 없는 결함을 냈다).
    //     ⑤ 가 옷을 잴 때 `FAR` 로 물러난 것과 **정확히 같은 함정**이다 — 같은 답을 쓴다.
    const wxBare = await warpTo(FAR[0], FAR[1], (w) => (w.shelter || 0) < 0.01, 8);
    ok(wxBare && (wxBare.shelter || 0) < 0.01 && (wxBare.insC || 0) === 0,
      '★⑧ (상황) 한겨울 야생 밤 · 완충 0 · **맨몸**이다', `shelter ${wxBare && wxBare.shelter} · 단열 +${wxBare && wxBare.insC}℃`);

    // ★★[이 하네스가 먼저 틀린 자리 · 족보 ㊻] **화면의 HP 는 깎일 때만 갱신된다.**
    //   서버는 `player_damaged` 로만 hp 를 보내고 **자연 회복은 브로드캐스트가 없다**
    //   (`self.hp` 는 welcome 때 한 번뿐 — 소스로 확인). 그래서 회복 뒤에 읽은 값은 **낡았다**.
    //   초안이 낡은 96 을 기준선으로 삼아 "9초에 −3HP(**늘었다**)"는 없는 결함을 냈다.
    //   ⇒ 기준선 차이 대신 **연속 관측의 단조 감소**로 판정하고, "안 깎인다"는 판정은
    //     **방금 깎인 뒤**(=값이 신선할 때)에만 건다.
    const watchHp = async (secs, stepMs) => {
      const out = []; const step = stepMs || 3000;
      for (let t = 0; t < secs * 1000; t += step) { out.push(await hpNow()); await sleep(step); }
      out.push(await hpNow()); return out;
    };
    //   ★★첫 표본은 **낡았을 수 있다**(직전 회복이 화면에 안 실렸으니까). 그래서 기준선을
    //     "처음으로 신선해진 지점" = **최댓값**으로 잡고, 거기서부터의 단조 감소로 읽는다.
    //     (초안이 낡은 첫 표본 하나 때문에 `[98,99,98,98,97,96]` 을 "안 깎였다"로 읽었다.)
    const drained = (seq) => { const v = seq.filter((x) => x !== null);
      if (v.length < 2) return false;
      let i0 = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[i0]) i0 = i;
      if (i0 >= v.length - 1) return false;
      for (let i = i0 + 1; i < v.length; i++) if (v[i] > v[i - 1]) return false;
      return v[v.length - 1] < v[i0]; };
    const dropOf = (seq) => { const v = seq.filter((x) => x !== null);
      return v.length ? Math.max(...v) - v[v.length - 1] : 0; };

    // ⓑ 극단이면 깎인다
    //   ★★시계를 **가장 추운 해**로 옮긴다. 추위는 평형 수렴이라 `cold:1` 을 찍어 둬도
    //     그 밤의 목표점이 극단 문턱(0.93) 아래면 **곧장 내려가** 감소가 멎는다.
    //     실측: 평범한 한겨울 밤의 평형은 **0.9278** 로 문턱을 아슬아슬하게 못 넘는다
    //     (그래서 `test-body ⑭㉧` 도 24년 중 19년에서만 깎인다). 픽스처가 그 사실을 알아야 한다.
    const Bcfg2 = require(path.join(ROOT, 'server', 'body.js'));
    const gate = Bcfg2.extremeAt('cold');
    let coldestDay = WINTER, bestT = -1;
    for (let k = 0; k < 24; k++) {
      const d = WINTER + 365 * k;
      const t = Bcfg2.coldTarget({ day: d, night: true, warmth: 0, villageShelter: 0 });
      if (t > bestT) { bestT = t; coldestDay = d; }
    }
    ok(bestT > 1, '★⑧ⓑ (상황) 24년 중 **목표점이 1 을 넘는 밤**을 골랐다 — 추위가 극단에 머문다',
      `day ${coldestDay} · 목표점 ${bestT}`);
    await page.evaluate((d) => window.__sendPrimary({ type: '__e2e_clock', day: d, night: true }), coldestDay);
    await sleep(1500);
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', cold: 1, hunger: 100, thirst: 100, quiet: true }));
    await sleep(1200);
    const seqB = await watchHp(15);
    ok(drained(seqB), '★★⑧ⓑ **극단에 닿으면 HP 가 실제로 깎인다**(캐논 변경 — 화면이 그렇게 말한다)',
      JSON.stringify(seqB));
    const dropB = dropOf(seqB);
    ok(dropB >= 1 && dropB <= 8, '★⑧ⓑ 그리고 **아주 천천히** 깎인다(15초에 몇 점 — 즉사가 아니다)', `${dropB}HP/15초`);

    // ⓒ 불을 피우면 멎는다 — 추위가 문턱 아래로 내려가므로 (기준선은 방금 깎여서 **신선하다**)
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { item_campfire: 2 } }));
    await sleep(900);
    await page.evaluate(() => window.__sendPrimary({ type: 'place_building', itemType: 'item_campfire', floor: 0, dir: 'N' }));
    await sleep(2500);
    await sleep(12000);   // 불 옆 목표점(0.05)으로 문턱 아래까지 수렴할 시간
    const seqC = await watchHp(12);
    ok(seqC.every((x) => x === seqC[0]),
      '★★⑧ⓒ **불을 피우면 감소가 멎는다** — 벗어나면 즉시 0(빚이 따라다니지 않는다)', JSON.stringify(seqC));
    const bodyCold = await page.evaluate(() => (window.__bodyState || {}).cold);
    ok(bodyCold < gate, '★⑧ⓒ (상황) 그때 추위가 실제로 극단 문턱 아래다 — 자명 통과 금지',
      `추위 ${bodyCold} < 문턱 ${gate.toFixed(3)}`);

    // ⓐ **평범한 한겨울 밤**은 문턱을 못 넘는다 ⇒ 한 점도 안 깎인다
    //   ★ⓒ 덕에 기준선이 신선한 지금 잰다. 그리고 시계를 평범한 밤으로 되돌린다 —
    //     가장 추운 해(목표점 1.048)에 두면 몸이 문턱 위로 **다시 올라가** 검사 대상이 바뀐다.
    await page.evaluate((d) => window.__sendPrimary({ type: '__e2e_clock', day: d, night: true }), WINTER);
    await sleep(1500);
    const tgtOrd = Bcfg2.coldTarget({ day: WINTER, night: true, warmth: 0, villageShelter: 0 });
    ok(tgtOrd < gate, '★★⑧ⓐ (상황·정직 보고) **평범한 한겨울 밤의 평형은 극단 문턱을 못 넘는다**',
      `평형 ${tgtOrd} < 문턱 ${gate.toFixed(3)} — 얼어 죽는 건 가장 추운 밤이다`);
    await page.evaluate((c) => window.__sendPrimary({ type: '__e2e_body', cold: c, hunger: 100, thirst: 100, quiet: true }), gate - 0.02);
    await sleep(1200);
    const seqA = await watchHp(12);
    const coldA = await page.evaluate(() => (window.__bodyState || {}).cold);
    ok(seqA.every((x) => x === seqA[0]) && coldA < gate,
      '★★⑧ⓐ **극단 문턱 아래에선 한 점도 안 깎인다** — 디버프 표는 그대로다(이 카드는 극단 이후만 더한다)',
      `${JSON.stringify(seqA)} · 추위 ${coldA} < 문턱 ${gate.toFixed(3)}`);
    await snap('cold-08-extreme');
  }

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
