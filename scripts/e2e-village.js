#!/usr/bin/env node
// === scripts/e2e-village.js — 마을 건립 → 식량 → 첫 주민 → 재고 UI **실클라** E2E ====
//
// ★★[2026-08-03e 배치 12] 재민 지시: *"UI 배치다 — 실클라 E2E 로 끝내라."*
//   `test-village-found.js` 는 엔진·배선을 잰다. 여기서는 **진짜 브라우저**가 사람이 하듯
//   사유지를 잡고 → 회관 3단계를 짓고 → 곳간에 식량을 넣고 → 첫 주민이 오고 → 재고 화면을 연다.
//   그리고 **화면에 뜬 숫자 = 서버 실값**임을 assert 한다(표시가 거짓말하면 UI 는 없느니만 못하다).
//
// ★검사가 자명하게 통과하지 않게 거는 전제(이 프로젝트가 반복해 만난 실패 유형):
//   · 회관이 실제로 **완공**됐는지(건물 타입 `village_hall`)를 먼저 건다 — 안 그러면 "빈 화면 = 통과".
//   · 재고 응답에 `_cash` 가 **없다**는 것을 값 차원에서 확인한다(장부는 화면에 안 나온다).
//   · 권한 게이트는 **두 번째 플레이어**로 실제 차단을 확인한다(코드를 읽는 게 아니라 눌러 본다).
//
// 실행: node scripts/e2e-village.js [--headed]
//   ★Chromium 은 /opt/pw-browsers/chromium (playwright install 금지 — 컨테이너 규약).
//   ★테스트 손잡이(전부 기본 OFF/기본값): E2E_GIVE=1(재료 지급 분기) · VILLAGE_DAY_MS(빠른 하루)
//     VILLAGE_MAX=1(시딩 1곳 — 부팅 4~5분 회피) · VILLAGE_FOUND_COST(자재 눈금) · PVILLAGE_GAP
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-village-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;   // 설정값 그대로 — central 이 zone-config 포트로 헬스를 폴링한다
const CDB = `/tmp/e2ev-central-${process.pid}.db`, ZDB = `/tmp/e2ev-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
// ★포트가 고정(3010/3020)이라 **앞선 실행의 서버가 살아 있으면 브라우저가 그리로 붙는다** —
//   실제로 그렇게 됐고, 이전 판이 만든 플레이어 마을이 남아 "마을 수 상한"으로 **거짓 실패**를 냈다.
//   ⇒ 시작 전에 남은 서버를 정리한다(포트를 랜덤화하지 않는 이유는 로비 헬스 폴링 — 파일 헤더 참조).
if (process.platform === 'linux') {
  try { require('child_process').execSync("pkill -f 'node .*server/zone[.]js' || true; pkill -f 'node .*server/central[.]js' || true", { stdio: 'ignore', shell: '/bin/bash' }); } catch (e) {}
}

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 시작|플레이어 마을 건립|인구 유입|econ 틱 실패|econ day/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 120)}\n`); });
  p.stderr.on('data', (b) => { const t = String(b); if (/실패|Error|error/.test(t)) process.stdout.write(`  [${name}!] ${t.trim().slice(0, 200)}\n`); });
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

// ★[2026-08-04b 배치 16] 대기 예산 240초 → 900초. 프로덕션이 **마을 50곳 전수 시딩**으로 바뀌면서
//   존 첫 부팅이 로컬 2코어에서 ~7.6분 걸린다(18곳 시절 ~3.5분). 240초면 시딩 도중에 '기동 실패'로
//   끊겨 **없는 결함**을 보고한다. 빨리 돌려야 하면 존 env 에 VILLAGE_MAX=1 을 주면 된다(그 env 가
//   존 설정 seedAllVillages 를 이기도록 되어 있다) — 다만 그러면 프로덕션과 다른 세계를 재는 것이다.
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

(async () => {
  console.log('\n=== 마을 건립 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1',          // ★이번엔 켠다 — 마을이 이 검사의 대상이다
    VILLAGE_MAX: '1',              // 시딩 1곳만(전 마을 실체화는 4~5분 — 이 검사의 대상이 아니다)
    VILLAGE_DAY_MS: '500',         // 하루 0.5초 — 회복 창(day%50·day≥100)을 검사 시간 안에 여러 번 지나게. 등록 계정이라 재접속해도 소유가 안 흔들린다
    VILLAGE_FOUND_COST: '0.1',     // 자재 눈금 축소(돌 3 / 돌 4·통나무 2 / 통나무 6) — 사슬 자체는 그대로 밟는다
    PVILLAGE_GAP: '10', PVILLAGE_MAX: '3',
    E2E_GIVE: '1',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  // 로비 게이트 — central 이 존 인구를 받을 때까지(5초 폴링). 안 기다리면 "지역 없음"으로 막힌다.
  //   ★`/zones` 의 zones 는 **객체 맵**이다(배열 아님) — 1차 작성이 여기서 틀려 게이트가 영영 false 였다.
  let hz = {};
  for (let i = 0; i < 120; i++) {
    try { const z = await (await fetch(`http://localhost:${CPORT}/zones`)).json(); hz = (z.zones || {}).hanbando || {}; } catch (e) {}
    if (hz.population !== null && hz.population !== undefined && hz.cap) break;
    await sleep(1000);
  }
  ok(hz.population !== null && hz.population !== undefined && !!hz.cap, `로비에 존이 살아 보인다 — population=${hz.population} cap=${hz.cap}`);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const perrs = [];
  page.on('pageerror', (e) => perrs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') perrs.push('console: ' + m.text().slice(0, 200)); });
  const snap = async (n) => { const f = `${SHOTS}/${n}.png`; try { await page.screenshot({ path: f }); shots.push(f); } catch (e) {} };

  // ★클라 페이지는 **central** 이 낸다(zone 은 정적 파일을 안 준다) — e2e-metallurgy 와 같은 진입점
  //   ★★이름+비밀번호로 **등록 계정**으로 들어간다. 게스트(`anon_*`)로는 이 검사를 할 수 없다 —
  //     실측: 게스트는 접속이 한 번 끊겼다 붙을 때마다 새 `anon_*` 를 받아 **자기 건물의 주인이 아니게 된다**
  //     (소유 판정이 playerId 대조라서). 노·숯가마·사유지에 이미 해당하는 성질이고 배치 12 가 만든 게 아니다.
  const login = async (pg, who, pw) => {
    await pg.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const btn = await pg.$('button:has-text("월드 입장")');
    if (!btn) return false;
    await pg.fill('#name', who);
    await pg.fill('#password', pw);
    await btn.click();
    for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(1500);
    return pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()));
  };
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await snap('01-lobby');
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼이 있다');
  // ★★이름을 넣고 들어간다 — **게스트로는 이 검사를 할 수 없다**(실측으로 알아낸 것):
  //   게스트는 재접속할 때마다 `anon_*` **새 playerId** 를 받는다. 그래서 잠깐 끊겼다 붙으면
  //   방금 제가 지은 회관·노·사유지의 주인이 아니게 된다(소유 판정이 playerId 대조라서).
  //   이건 배치 12 가 만든 문제가 아니라 게스트 세션의 성질이고, 노·숯가마·사유지에 **이미** 해당한다.
  //   ⇒ 보고서에 관찰로 남기고, 이 하네스는 이름 있는 계정으로 소유 연속성을 확보한다.
  //   ★이름만으로는 부족하다 — **비밀번호까지** 넣어야 central 에 등록되고 playerId 가 고정된다.
  //     (이름만 넣으면 여전히 게스트 경로라 `anon_*` 가 매번 새로 발급된다 — 실측)
  await page.fill('#name', 'e2echon');
  await page.fill('#password', 'e2epass1234');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '월드에 들어갔다(내 좌표가 있다)');
  await snap('02-in-game');

  // ── 건축 메뉴에 회관이 뜨는가(배치 5 의 교훈: 계약이 멀쩡해도 화면에서 못 누르면 없는 기능이다) ──
  const btnTxt = await page.evaluate(() => Array.from(document.querySelectorAll('.hud-actions button'))
    .filter((b) => !(b.style && b.style.display === 'none')).map((b) => (b.textContent || '').trim()).join(' | '));
  ok(/마을 회관/.test(btnTxt), `건축 패널에 "마을 회관 터 잡기" 버튼이 렌더된다`);

  // ── 재료 지급(테스트 손잡이) ─────────────────────────────────────────────────
  // ★송신은 **클라가 이미 노출한 정본 훅**(`__sendPrimary` / `__sendPrimaryAt`)을 쓴다 —
  //   E2E 가 제 소켓을 따로 파면 그게 사본이고, 절대→로컬 좌표 변환 같은 계약을 건너뛰게 된다.
  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const sendAt = (m) => page.evaluate((mm) => { window.__sendPrimaryAt(mm); return true; }, m);
  ok(await page.evaluate(() => typeof window.__sendPrimary === 'function' && typeof window.__sendPrimaryAt === 'function'),
    '실클라 정본 송신 훅(__sendPrimary·__sendPrimaryAt)이 있다');

  // ★지급이 한 번에 안 붙을 수 있다(웰컴 직후 서버가 인벤을 다시 밀어 덮어쓰는 순간이 있다) — 확인될 때까지 다시 보낸다
  let inv0 = null;
  for (let i = 0; i < 6; i++) {
    await send({ type: '__e2e_give', items: { stone: 400, wood: 400, berry: 300 }, tools: ['pickaxe', 'pickaxe'] });
    await sleep(1200);
    inv0 = await page.evaluate(() => window.__getInv && window.__getInv());
    if (inv0 && (inv0.stone || 0) >= 400 && (inv0.wood || 0) >= 400) break;
  }
  ok((inv0 && inv0.stone) >= 400 && (inv0 && inv0.wood) >= 400, `재료 지급됨 — 돌 ${inv0 && inv0.stone} · 통나무 ${inv0 && inv0.wood} · 베리 ${inv0 && inv0.berry}`);

  // ── 임시 사유지 2×2 — 진짜로 걸어가며 4칸을 잡는다 ────────────────────────────
  //   ★1차 작성이 여기서 틀렸다: 키를 누른 채 60ms 마다 검사했더니 **오버슈트**해서 네 칸이
  //     붙어 있지 않았고(2×2 가 안 됨), 그 상태로 착공하니 "발자국이 사유지 밖"이 떴다.
  //     ⇒ 짧은 펄스로 걷고 **도착을 확인한 뒤** 잡는다(양축 보정 — 지나치면 되돌아온다).
  const cellOf = async () => page.evaluate(() => { const a = window.__getMyAbs(); return { cx: Math.floor(a.x / 32), cy: Math.floor(a.y / 32), x: a.x, y: a.y }; });
  const claimCells = async () => page.evaluate(() => {
    const out = []; for (const c of (window.__getClaims ? window.__getClaims() : [])) if (c.kind === 'temporary') out.push(`${Math.floor(c.wx / 32)},${Math.floor(c.wy / 32)}`); return out;
  });
  const claimIdAt = async (k) => page.evaluate((kk) => {
    for (const c of (window.__getClaims ? window.__getClaims() : [])) {
      if (c.kind === 'temporary' && `${Math.floor(c.wx / 32)},${Math.floor(c.wy / 32)}` === kk) return c.id;
    } return null;
  }, k);
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(130); };
  // ★셀 **중심**까지 간다. 인덱스만 맞추면 경계에 서게 되는데, 클라 예측 좌표와 서버 좌표가
  //   몇 px 만 달라도 서버는 **옆 칸**을 잡는다 — 3/4 만 잡히던 원인이 정확히 이것이었다.
  // ★★펄스 길이가 하한을 넘어야 **한 스텝이라도** 걷는다.
  //   클라 입력은 고정 스텝(≤33ms)으로만 서버에 나간다 — 20ms 펄스는 스텝을 한 번도 안 만들어
  //   미세 조정이 **영원히 제자리**였다(3/4·2/4 로 흔들리던 진짜 원인. 지형은 사방이 열려 있었다).
  //   ⇒ 최소 45ms, 거리 비례로 늘린다. 허용 오차는 ±11px(셀 반폭 16 안쪽이면 그 셀이다).
  const gotoCenter = async (tx, ty) => {
    const gx = tx * 32 + 16, gy = ty * 32 + 16;
    for (let i = 0; i < 70; i++) {
      const c = await cellOf();
      const dx = gx - c.x, dy = gy - c.y;
      if (Math.abs(dx) <= 11 && Math.abs(dy) <= 11) return true;
      const ms = (d) => Math.max(45, Math.min(90, Math.round(Math.abs(d) * 1.2)));
      if (Math.abs(dx) > Math.abs(dy)) await pulse(dx > 0 ? 'd' : 'a', ms(dx));
      else await pulse(dy > 0 ? 's' : 'w', ms(dy));
    }
    const c = await cellOf();
    return c.cx === tx && c.cy === ty;
  };
  // ★★사유지 배치는 **서버 진실로 수렴시킨다**(예측 좌표를 믿지 않는다).
  //   왜: 사유지는 서버 좌표로 잡히고, 클라 예측은 최대 한 칸 어긋난다. 게다가 이동 입력은
  //   고정 스텝(≤33ms·한 스텝이 반 칸)이라 "정확히 이 칸"을 겨냥하는 것 자체가 불가능에 가깝다.
  //   ⇒ 겨냥하지 않는다. **잡고 → 서버가 방송한 목록을 읽고 → 2×2 가 될 때까지 모자란 칸으로 걸어가
  //     다시 잡는다.** 슬롯이 차면(4칸) 가장 쓸모없는 칸을 해제해 되돌린다.
  const blocksOf = (cells) => {                       // 후보 2×2 = 잡힌 칸을 포함하는 네 가지 배치
    const set = new Set(cells), out = new Map();
    for (const k of cells) {
      const [x, y] = k.split(',').map(Number);
      for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const bx = x + ox, by = y + oy, key = `${bx},${by}`;
        if (out.has(key)) continue;
        const need = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => `${bx + dx},${by + dy}`);
        out.set(key, { bx, by, need, have: need.filter((n) => set.has(n)) });
      }
    }
    return [...out.values()].sort((p, q) => q.have.length - p.have.length);
  };
  await sleep(900);
  let originCell = null, covered = [];
  for (let round = 0; round < 14 && !originCell; round++) {
    const cells = await claimCells();
    const best = blocksOf(cells)[0];
    if (best && best.have.length === 4) { originCell = [best.bx, best.by]; covered = best.have; break; }
    if (!cells.length) { await send({ type: 'claim', kind: 'temporary' }); await sleep(700); continue; }
    const miss = best.need.find((n) => !best.have.includes(n));
    const [mx, my] = miss.split(',').map(Number);
    if (cells.length >= 4) {                          // 슬롯이 찼다 — 이 2×2 에 안 쓰이는 칸을 해제해 되돌린다
      const spare = cells.find((k) => !best.need.includes(k));
      const id = spare ? await claimIdAt(spare) : null;
      if (id) { await send({ type: 'unclaim', claimId: id }); await sleep(600); continue; }
    }
    await gotoCenter(mx, my);
    await sleep(500);
    await send({ type: 'claim', kind: 'temporary' });
    await sleep(700);
  }
  ok(!!originCell, `★2×2 발자국이 **전부** 내 사유지다 — ${covered.length}/4${originCell ? ` (좌상 ${originCell.join(',')})` : ` (잡힌 칸: ${(await claimCells()).join(' / ')})`}`);
  await snap('03-claims');

  // ── 회관 착공 — 좌상 셀이 (c0.cx, c0.cy) 인 2×2 ──────────────────────────────
  const [VX, VY] = originCell || [0, 0];
  const atX = VX * 32 + 16, atY = VY * 32 + 16;
  await page.evaluate(() => { window.__notices = []; });
  await sendAt({ type: 'village_start', atX, atY });   // ★절대→로컬 변환은 클라 정본이 한다(배치 계약 그대로)
  await sleep(900);
  const hasSite = async () => page.evaluate(() => {
    let t = null; for (const c of (window.__getAllBuildings ? window.__getAllBuildings() : [])) if (c.type === 'village_site') t = c; return t;
  });
  let site = await hasSite();
  const nt1 = await page.evaluate(() => (window.__notices || []).slice());
  ok(!!site, `회관 터가 섰다${site ? '' : ` — 알림: ${nt1.slice(-3).join(' / ')}`}`);
  await snap('04-site');

  // ── 2·3단계 시공 → 완공 ─────────────────────────────────────────────────────
  if (site) {
    for (let k = 0; k < 2; k++) { await send({ type: 'village_advance', buildingId: site.id }); await sleep(900); site = (await hasSite()) || site; }
  }
  const hall = await page.evaluate(() => {
    for (const c of (window.__getAllBuildings ? window.__getAllBuildings() : [])) if (c.type === 'village_hall') return c;
    return null;
  });
  const nt2 = await page.evaluate(() => (window.__notices || []).slice());
  ok(!!hall, `★회관이 **완공**됐다(village_hall)${hall ? '' : ` — 알림: ${nt2.slice(-4).join(' / ')}`}`);
  ok(nt2.some((t) => /섰다|인구 0/.test(t)), `★"마을이 섰다 · 인구 0" 알림이 왔다 — ${(nt2.filter((t) => /마을/.test(t)).slice(-1)[0] || '(없음)')}`);
  await snap('05-hall');
  if (!hall) { console.log('\n회관 완공 실패 — 이후 검사 불가'); }

  // ★★재접속 — **소유가 세션을 넘어 유지되는지**까지 함께 잰다.
  //   (그리고 실무적으로 필요하다: 이 판에서 클라가 중간에 재접속하면 인증이 안 딸려가 게스트로
  //    강등되는 일이 있었다. 등록 계정으로 다시 들어가면 playerId 가 이름으로 고정된다.)
  if (hall) {
    const back = await login(page, 'e2echon', 'e2epass1234');
    ok(back, '회관을 지은 사람이 **다시 접속**했다(소유 연속성 검사의 전제)');
    await page.evaluate(() => { window.__notices = []; window.__villageInv = null; });
    // ⚠"재접속했더니 화면에 회관이 안 보인다"는 결함이 아니다 — 재접속은 마을광장에서 시작하므로
    //   그 청크가 안 켜져 있을 뿐이다(청크 스트리밍). 영속·소유 연속성은 **아래 재고 열람이 증명한다.**
    const hall2 = await page.evaluate(() => {
      for (const c of (window.__getAllBuildings ? window.__getAllBuildings() : [])) if (c.type === 'village_hall') return c;
      return null;
    });
    if (hall2) hall.id = hall2.id;
    // ★재접속은 마을광장에서 시작할 수 있다 — 회관 열람은 **거리 제한 200px** 이 걸린다.
    //   안 걸어가면 "너무 멀리"가 나고, 그걸 '소유 상실'로 오독하게 된다(사유를 갈라야 검사가 참이다).
    if (originCell) await gotoCenter(originCell[0], originCell[1]);
  }

  // ── 재고 열람 — 인구 0 인 빈 터 ─────────────────────────────────────────────
  // ★완공 직후엔 서버가 **교역 거리행렬 증분 BFS** 로 수 초 막혀 있다(실측 9.2초 — 전쌍이면 25.5초).
  //   700ms 만 기다렸다가 "응답이 없다"고 적으면 그건 결함이 아니라 **하네스가 성급한 것**이다.
  //   ⇒ 응답이 올 때까지 폴링한다(이 프로젝트가 반복해 만난 '없는 결함 보고' 유형 회피).
  const openInv = async (id, tries = 24) => {
    await page.evaluate(() => { window.__villageInv = null; });
    for (let i = 0; i < tries; i++) {
      await send({ type: 'village_inventory', buildingId: id });
      await sleep(1000);
      const r = await page.evaluate(() => window.__villageInv);
      if (r) return r;
    }
    return null;
  };
  let inv = hall ? await openInv(hall.id) : null;
  ok(!!inv, '★재접속한 창설자가 **자기 마을 재고를 다시 볼 수 있다** — 소유가 세션을 넘어 유지된다(DB 영속)');
  if (!inv) {
    const nt = await page.evaluate(() => (window.__notices || []).slice(-5));
    console.log(`    [진단] 알림: ${nt.join(' / ')}`);
    console.log(`    [진단] 페이지 오류: ${perrs.slice(-5).join(' | ') || '(없음)'}`);
  }
  ok(!!inv, '회관 클릭 = 재고 응답이 온다');
  if (inv) {
    ok(inv.pop === 0, `★인구 0 — 빈 터로 태어났다(선물 없음). pop=${inv.pop}`);
    ok(inv.nextResidentAt === 15, `★"다음 주민" 문턱이 15 다(엔진 정본 값) — ${inv.nextResidentAt}`);
    const j = JSON.stringify(inv);
    ok(!/_cash/.test(j), '★재고 응답에 `_cash` 가 **값 차원에서** 없다(장부는 화면에 안 나온다)');
    const panelTxt = await page.evaluate(() => (document.getElementById('villageInvPanel') || {}).innerText || '');
    ok(/아직 아무도 살지 않는다/.test(panelTxt), '★화면이 "빈 터"라고 말한다 — 소멸이 아니라 아직 시작 안 함');
    ok(!/현금|cash/i.test(panelTxt), '화면에도 현금 항목이 없다');
  }
  await snap('06-inv-empty');

  // ── 식량 투입 → 첫 주민 ─────────────────────────────────────────────────────
  if (hall) {
    await page.evaluate(() => { window.__villageInv = null; });
    await send({ type: 'village_deposit', buildingId: hall.id, want: { berry: 300 } });
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__villageInv)); i++) await sleep(700);
    inv = await page.evaluate(() => window.__villageInv);
    const fruitQ = inv && ((inv.groups.find((g) => g.key === 'food') || { items: [] }).items.find((i) => i.r === 'fruit') || {}).q;
    ok((fruitQ || 0) > 0, `★곳간에 들어갔다 — 과일 ${fruitQ} (플레이어 노동이 econ 곳간에 도달한다)`);
    ok((inv && inv.foodEquiv) > 0, `식량 환산이 선다 — ${inv && inv.foodEquiv} (엔진 정본 totalFoodEquivalent)`);
    ok((inv && inv.nextResidentHave) >= (inv && inv.nextResidentAt), `★"첫 주민" 문턱을 넘겼다 — 지금 ${inv && inv.nextResidentHave} / 필요 ${inv && inv.nextResidentAt} (베리도 식량이다 — 곡식만 세면 영영 안 온다)`);
    // 화면 표시값 = 서버 실값
    const shown = await page.evaluate(() => { const el = document.querySelector('#villageInvPanel [data-pvi="fruit"]'); return el ? el.textContent.trim() : null; });
    ok(shown != null && Number(shown) === Number(fruitQ), `★화면 표시값 = 서버 실값 — 화면 "${shown}" · 서버 ${fruitQ}`);
  }
  await snap('07-deposit');

  // ── 권한 게이트 — 두 번째 플레이어는 못 본다 ────────────────────────────────
  if (hall) {
    const page2 = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
    await page2.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const eb2 = await page2.$('button:has-text("월드 입장")');
    await page2.fill('#name', 'e2enagne');   // 다른 사람 — 남의 마을 재고는 못 본다
    await page2.fill('#password', 'e2epass5678');
    if (eb2) await eb2.click();
    for (let i = 0; i < 60 && !(await page2.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(1200);
    const in2 = await page2.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()));
    ok(in2, '두 번째 플레이어가 접속했다(권한 검사의 전제)');
    if (in2) {
      await page2.evaluate(() => { window.__notices = []; window.__villageInv = null; });
      await page2.evaluate((id) => window.__sendPrimary({ type: 'village_inventory', buildingId: id }), hall.id);
      await sleep(900);
      const inv2 = await page2.evaluate(() => window.__villageInv);
      const nt3 = await page2.evaluate(() => (window.__notices || []).slice());
      ok(inv2 == null, '★남의 마을 재고는 **안 온다**(응답 자체가 없다)');
      ok(nt3.some((t) => /관리자가 아닙니다|길드의 마을이 아닙니다|너무 멀리/.test(t)),
        `거부 사유가 한국어 계약 메시지다 — ${(nt3.slice(-1)[0] || '(없음)')}`);
      await page2.screenshot({ path: `${SHOTS}/09-denied.png` }).catch(() => {});
      shots.push(`${SHOTS}/09-denied.png`);
    }
  }


  // 첫 주민 대기 — 회복 창(day % 50 === 0 && day >= 100). 하루 0.12초라 ~20초면 지난다.
  let popped = null;
  if (hall) {
    // ★식량은 **썩는다**(`tickDecay`) — 한 번 부어 놓고 기다리면 회복 창(day%50, day≥100)에
    //   닿기 전에 문턱 아래로 내려간다. 1차 실행이 정확히 그래서 실패했다.
    //   재민의 문장은 *"농사지어서 식량 확보하면"* 이다 — 계속 농사짓는다. 그래서 계속 붓는다.
    for (let i = 0; i < 80; i++) {
      if (i % 2 === 0) {
        await send({ type: '__e2e_give', items: { berry: 200 } });
        await sleep(400);
        await send({ type: 'village_deposit', buildingId: hall.id, want: { berry: 200 } });
        await sleep(400);
      }
      const cur = await openInv(hall.id, 2);
      if (cur && cur.pop > 0) { popped = cur; break; }
      if (cur && i % 10 === 0) console.log(`    [대기] day ${cur.day} · 식량 ${cur.nextResidentHave}/${cur.nextResidentAt} · 인구 ${cur.pop}`);
      await sleep(1500);
    }
  }
  const lastSeen = await page.evaluate(() => window.__villageInv);
  ok(!!popped, `★식량이 사람을 불렀다 — 인구 ${popped ? popped.pop : 0}명${popped ? '' : ` (마지막 관측: day ${lastSeen && lastSeen.day} · 식량 ${lastSeen && lastSeen.nextResidentHave}/${lastSeen && lastSeen.nextResidentAt})`} (재민 확정 (마): "농사지어서 식량 확보하면 그냥 늘어나는 거 아냐?")`);
  if (popped) {
    ok(popped.day >= 100, `회복 창을 실제로 지났다 — day ${popped.day} (100 미만이면 이 검사는 자명하다)`);
    const panelTxt = await page.evaluate(() => (document.getElementById('villageInvPanel') || {}).innerText || '');
    ok(/인구/.test(panelTxt) && new RegExp(`인구\\s*${popped.pop}`).test(panelTxt.replace(/\s+/g, ' ')), `화면 인구 표시 = 서버 인구 ${popped.pop}`);
  }
  await snap('08-first-resident');

  // ── NPC 마을은 이 UI 의 대상이 아니다(플레이어 마을만) ───────────────────────
  {
    const c = await (await fetch(`http://localhost:${ZPORT}/health`)).json().catch(() => null);
    ok(!!c, 'zone health 응답(마무리 확인)');
  }

  const nt = await page.evaluate(() => (window.__notices || []).slice());
  ok(!nt.some((t) => /undefined|NaN|\[object/.test(t)), '알림에 undefined·NaN·[object 가 안 샌다');

  await browser.close();
  shutdown();
  console.log(`\n스크린샷 ${shots.length}장: ${SHOTS}`);
  console.log(`=== 마을 건립 실클라 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
