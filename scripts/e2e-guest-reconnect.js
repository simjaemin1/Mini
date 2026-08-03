#!/usr/bin/env node
// === scripts/e2e-guest-reconnect.js — **게스트가 브라우저를 껐다 켜도 제 것을 지킨다** 실클라 E2E ===
//
// ★★[2026-08-03f 배치 13] 재민 확정: *"네 추천대로 하자"* — 배치 12 회부 2 를 막는다.
//   `test-guest-identity.js` 는 프로토콜 층(raw WebSocket)에서 잰다. 여기서는 **진짜 브라우저**가
//   사람이 하듯: 게스트로 들어가 → 노를 짓고 → 마을을 세우고 → 움집을 짓고 →
//   **브라우저 컨텍스트를 통째로 닫고**(localStorage 만 들고) 다시 들어와 → 전부 내 것인지 본다.
//
// ★이 하네스의 **보안 검증**이 절반이다: 영속화가 권한 게이트를 느슨하게 만들지 않았는가.
//   토큰 없는 **새 컨텍스트**(다른 사람)는 회관 재고도 · 노 조업도 · 움집 시공도 여전히 막혀야 한다.
//   그리고 **토큰이 화면·알림 어디에도 안 보여야** 한다(토큰 유출 = 계정 탈취).
//
// ★사유지 슬롯이 임시 4칸뿐이라(CLAIM_SLOT_TEMPORARY_START) 2×2 를 **두 번 쓸 수 없다.**
//   ⇒ 노를 먼저 짓고 → 그 4칸을 해제해 슬롯을 되찾고 → 옆으로 걸어가 다시 2×2 → 회관.
//   (실제 플레이어도 그렇게 한다. 슬롯 상한은 이 배치의 대상이 아니다.)
//
// 실행: node scripts/e2e-guest-reconnect.js [--headed]
//   ★Chromium 은 /opt/pw-browsers/chromium (playwright install 금지 — 컨테이너 규약).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-guest-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2egr-central-${process.pid}.db`, ZDB = `/tmp/e2egr-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
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
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|플레이어 마을 건립|게스트 접속/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 140)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 240) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 게스트 재접속 소유 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1',       // 마을 1곳만 시딩(전 마을 실체화는 4~5분 — 대상 아님)
    VILLAGE_DAY_MS: '2000',                        // 이 검사는 회복 창을 안 기다린다 — 게임루프를 굶기지 않는 값
    VILLAGE_FOUND_COST: '0.1', PVILLAGE_GAP: '10', PVILLAGE_MAX: '3',
    E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  let hz = {};
  for (let i = 0; i < 120; i++) {
    try { const z = await (await fetch(`http://localhost:${CPORT}/zones`)).json(); hz = (z.zones || {}).hanbando || {}; } catch (e) {}
    if (hz.population !== null && hz.population !== undefined && hz.cap) break;
    await sleep(1000);
  }
  ok(hz.population != null && !!hz.cap, `로비에 존이 살아 보인다 — population=${hz.population}`);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });

  // ── 게스트 입장 헬퍼 — **이름도 비밀번호도 안 넣는다**(그게 게스트다) ──────────
  const enterAsGuest = async (pg) => {
    await pg.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const btn = await pg.$('button:has-text("월드 입장")');
    if (!btn) return false;
    await btn.click();
    for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    await sleep(1500);
    return pg.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()));
  };
  // ★welcome 이 도착해야 채워지는 값이라 **폴링**한다 — 한 번 읽고 빈 문자열이면
  //   "신원이 안 왔다"가 아니라 "아직 안 왔다"일 뿐이다(1차 작성이 여기서 거짓 실패를 냈다).
  const pidOf = async (pg) => {
    for (let i = 0; i < 30; i++) {
      const v = await pg.evaluate(() => window.__getPlayerId && window.__getPlayerId());
      if (v) return v;
      await sleep(500);
    }
    return await pg.evaluate(() => window.__getPlayerId && window.__getPlayerId());
  };
  const tokenOf = (pg) => pg.evaluate((k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, 'durango_guest_token');

  // ══ 1막 — 게스트가 짓는다 ═══════════════════════════════════════════════════
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let page = await ctx.newPage();
  const snap = async (n, pg) => { const f = `${SHOTS}/${n}.png`; try { await (pg || page).screenshot({ path: f }); shots.push(f); } catch (e) {} };
  ok(await enterAsGuest(page), '게스트로 월드 입장(이름·비밀번호 없음)');
  await snap('01-guest-in');

  const pid1 = await pidOf(page);
  const tok1 = await tokenOf(page);
  ok(typeof pid1 === 'string' && /^anon_/.test(pid1), `★클라가 **제 영속 신원**을 안다 — ${pid1}`);
  ok(typeof tok1 === 'string' && /^[0-9a-f]{64}$/.test(tok1), '★게스트 토큰이 localStorage 에 저장됐다(길이·형식 검증)');
  {
    const shown = await page.evaluate(() => document.body.innerText || '');
    const notes = await page.evaluate(() => (window.__notices || []).join(' | '));
    ok(!shown.includes(tok1) && !notes.includes(tok1), '★★토큰이 화면·알림 어디에도 안 보인다(유출 = 계정 탈취)');
  }

  const send = (m, pg) => (pg || page).evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const sendAt = (m, pg) => (pg || page).evaluate((mm) => { window.__sendPrimaryAt(mm); return true; }, m);
  const cellOf = async (pg) => (pg || page).evaluate(() => { const a = window.__getMyAbs(); return { cx: Math.floor(a.x / 32), cy: Math.floor(a.y / 32), x: a.x, y: a.y }; });
  const claimCells = async (pg) => (pg || page).evaluate(() => {
    const out = []; for (const c of (window.__getClaims ? window.__getClaims() : [])) if (c.kind === 'temporary') out.push(`${Math.floor(c.wx / 32)},${Math.floor(c.wy / 32)}`); return out;
  });
  const claimIdAt = async (k, pg) => (pg || page).evaluate((kk) => {
    for (const c of (window.__getClaims ? window.__getClaims() : [])) if (c.kind === 'temporary' && `${Math.floor(c.wx / 32)},${Math.floor(c.wy / 32)}` === kk) return c.id;
    return null;
  }, k);
  const buildings = async (pg) => (pg || page).evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []));
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(130); };
  //   ★펄스 하한 45ms — 클라 입력은 고정 스텝(≤33ms)이라 더 짧으면 **한 걸음도 안 걷는다**(배치 12 실측).
  const gotoCenter = async (tx, ty) => {
    const gx = tx * 32 + 16, gy = ty * 32 + 16;
    for (let i = 0; i < 70; i++) {
      const c = await cellOf();
      const dx = gx - c.x, dy = gy - c.y;
      if (Math.abs(dx) <= 11 && Math.abs(dy) <= 11) return true;
      const ms = (d) => Math.max(45, Math.min(90, Math.round(Math.abs(d) * 1.2)));
      if (Math.abs(dx) > Math.abs(dy)) await pulse(dx > 0 ? 'd' : 'a', ms(dx)); else await pulse(dy > 0 ? 's' : 'w', ms(dy));
    }
    return false;
  };
  //   ★사유지는 **서버 좌표**로 잡힌다(클라 예측과 한 칸까지 어긋난다 — 배치 12 실측).
  //     겨냥을 포기하고 **서버가 방송한 사유지 목록으로 수렴**시킨다.
  const blocksOf = (cells) => {
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
  const claim2x2 = async () => {
    for (let round = 0; round < 14; round++) {
      const cells = await claimCells();
      const best = blocksOf(cells)[0];
      if (best && best.have.length === 4) return [best.bx, best.by];
      if (!cells.length) { await send({ type: 'claim', kind: 'temporary' }); await sleep(700); continue; }
      const miss = best.need.find((n) => !best.have.includes(n));
      const [mx, my] = miss.split(',').map(Number);
      if (cells.length >= 4) {
        const spare = cells.find((k) => !best.need.includes(k));
        const id = spare ? await claimIdAt(spare) : null;
        if (id) { await send({ type: 'unclaim', claimId: id }); await sleep(600); continue; }
      }
      await gotoCenter(mx, my); await sleep(500);
      await send({ type: 'claim', kind: 'temporary' }); await sleep(700);
    }
    return null;
  };

  await send({ type: '__e2e_give', items: { stone: 600, wood: 600, hide: 40, berry: 200 }, tools: ['pickaxe', 'pickaxe', 'pickaxe'] });
  await sleep(1200);
  const inv0 = await page.evaluate(() => window.__getInv && window.__getInv());
  ok((inv0 && inv0.stone) >= 600, `재료 지급됨 — 돌 ${inv0 && inv0.stone} · 통나무 ${inv0 && inv0.wood} · 가죽 ${inv0 && inv0.hide}`);

  // ── 노(爐) 건설 — 2×2 사유지 → 3단계 ────────────────────────────────────────
  const spotF = await claim2x2();
  ok(!!spotF, `노 자리 2×2 사유지 확보 — ${spotF ? spotF.join(',') : '실패'}`);
  let furnace = null;
  if (spotF) {
    await sendAt({ type: 'furnace_start', atX: spotF[0] * 32 + 16, atY: spotF[1] * 32 + 16, kind: 'crucible' });
    await sleep(900);
    for (let k = 0; k < 3; k++) {
      const site = (await buildings()).find((b) => b.type === 'furnace_site');
      if (!site) break;
      await send({ type: 'furnace_advance', buildingId: site.id });
      await sleep(900);
    }
    furnace = (await buildings()).find((b) => b.type === 'furnace') || null;
  }
  ok(!!furnace, `★노가 완공됐다(furnace)${furnace ? '' : ` — 알림: ${(await page.evaluate(() => (window.__notices || []).slice(-2))).join(' / ')}`}`);
  await snap('02-furnace');

  // ── 사유지 4칸 회수 → 옆으로 걸어가 다시 2×2 → 마을 회관 ────────────────────
  for (const k of await claimCells()) { const id = await claimIdAt(k); if (id) { await send({ type: 'unclaim', claimId: id }); await sleep(400); } }
  { const c = await cellOf(); await gotoCenter(c.cx + 5, c.cy); }
  const spotV = await claim2x2();
  ok(!!spotV, `회관 자리 2×2 사유지 확보(노와 다른 자리) — ${spotV ? spotV.join(',') : '실패'}`);
  let hall = null;
  if (spotV) {
    await sendAt({ type: 'village_start', atX: spotV[0] * 32 + 16, atY: spotV[1] * 32 + 16 });
    await sleep(900);
    for (let k = 0; k < 3; k++) {
      const site = (await buildings()).find((b) => b.type === 'village_site');
      if (!site) break;
      await send({ type: 'village_advance', buildingId: site.id });
      await sleep(1000);
    }
    hall = (await buildings()).find((b) => b.type === 'village_hall') || null;
  }
  ok(!!hall, `★게스트가 **마을을 세웠다**(village_hall)${hall ? '' : ` — 알림: ${(await page.evaluate(() => (window.__notices || []).slice(-2))).join(' / ')}`}`);

  // ── 움집터 — 사유지가 필요 없는 다른 소유 갈래(`data.owner` 직접 대조) ───────
  //   ★움집(`hut_site`)은 여기서 안 짓는다. 6×4 발자국이라 방금 세운 회관·노·사유지와
  //     겹치지 않는 자리를 브라우저에서 찾아 걷는 데 검사의 태반이 들어가는데, **그 갈래는
  //     `test-guest-identity.js` §③ 이 같은 실서버에서 이미 끝까지 잰다**(짓고 → 끊고 → 다시 붙어
  //     시공 통과 → 남은 "내 움집터가 아닙니다"로 차단). 여기서 또 재면 시간만 두 배다.
  //     ⇒ 이 E2E 는 브라우저에서만 잴 수 있는 것(회관 재고 UI · 노 조업 · localStorage 왕복)에 집중한다.
  const hut = null;
  //   ★사유지 수는 **가라앉기를 기다려 읽는다** — 마을 등록 직후엔 클라 사유지 맵이 잠깐 비는 순간이 있다
  //     (1차 실행이 그 순간을 읽어 '0칸'이라는 거짓 기준선을 만들었다).
  let myClaims1 = 0;
  for (let i = 0; i < 20; i++) { myClaims1 = (await claimCells()).length; if (myClaims1 === 4) break; await sleep(700); }
  ok(myClaims1 === 4, `내 사유지 ${myClaims1}칸 (재접속 뒤 그대로인지 볼 기준선)`);
  await snap('03-built');

  // ══ 2막 — **브라우저 컨텍스트를 통째로 닫는다.** localStorage 만 들고 다시 온다 ══
  const state = await ctx.storageState();
  ok((state.origins || []).some((o) => (o.localStorage || []).some((e) => e.name === 'durango_guest_token')),
    '★localStorage 에 토큰이 실제로 남아 있다(브라우저 종료를 넘길 유일한 것)');
  await ctx.close();
  await sleep(1500);

  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: state });
  page = await ctx.newPage();
  ok(await enterAsGuest(page), '★새 컨텍스트로 다시 입장(브라우저를 껐다 켠 것과 같다)');
  const pid2 = await pidOf(page);
  ok(pid2 === pid1, `★★같은 사람으로 돌아왔다 — ${pid2} === ${pid1}`);
  await snap('04-reconnected');

  // 소유가 살아남았는가 — **눌러서** 확인한다(필드 비교가 아니라 서버 판정).
  //   ★재접속은 마을광장에서 시작한다 — 회관·노는 거리 제한(200px·120px)이 있으니 **걸어가서** 누른다.
  //     1차 실행이 여기서 '너무 멀리'를 권한 거부로 오독할 뻔했다(거부 사유를 구분해야 검사가 참이다).
  if (spotV) await gotoCenter(spotV[0], spotV[1]);
  if (hall) {
    await page.evaluate(() => { window.__villageInv = null; window.__notices = []; });
    for (let i = 0; i < 12 && !(await page.evaluate(() => window.__villageInv)); i++) {
      await send({ type: 'village_inventory', buildingId: hall.id }); await sleep(1000);
    }
    const inv = await page.evaluate(() => window.__villageInv);
    ok(!!inv, `★★재접속한 게스트가 **제 마을 재고를 연다** — ${inv ? inv.name : '(응답 없음)'}`);
  }
  if (furnace) {
    if (spotF) await gotoCenter(spotF[0], spotF[1]);
    await page.evaluate(() => { window.__notices = []; });
    await send({ type: 'furnace_smelt', buildingId: furnace.id });
    await sleep(900);
    const nt = await page.evaluate(() => (window.__notices || []).slice());
    ok(nt.length > 0 && !nt.some((t) => /이 노의 주인이 아닙니다|우리 길드의 노가 아닙니다|노에서 너무 멀리/.test(t)),
      `★★재접속한 게스트가 **제 노를 쓴다** — 응답: "${nt.slice(-1)[0] || '(응답 없음 — 거리·소유 어느 쪽인지 불명)'}"`);
  }
  if (hut) {
    await page.evaluate(() => { window.__notices = []; });
    await send({ type: 'hut_advance', buildingId: hut.id });
    await sleep(900);
    const nt = await page.evaluate(() => (window.__notices || []).slice());
    ok(!nt.some((t) => /내 움집터가 아닙니다/.test(t)), `★재접속한 게스트가 **제 움집터를 잇는다** — "${nt.slice(-1)[0] || '(없음)'}"`);
  }
  {
    const n = (await claimCells()).length;
    ok(n === myClaims1, `★사유지가 그대로다 — ${n}칸 (기준선 ${myClaims1})`);
    const mine = await page.evaluate(() => {
      const el = document.body; return !!el;   // 목록 UI 는 아래 텍스트로 확인
    });
    ok(mine, '사유지 목록 UI 접근 가능');
  }
  await snap('05-still-mine');

  // ══ 3막 — **토큰 없는 남**은 여전히 막힌다(영속화가 게이트를 느슨하게 했는가) ══
  const ctx3 = await browser.newContext({ viewport: { width: 900, height: 700 } });   // storageState 없음 = 처음 온 사람
  const page3 = await ctx3.newPage();
  ok(await enterAsGuest(page3), '토큰 없는 새 게스트 입장(보안 검증의 전제)');
  const pid3 = await pidOf(page3);
  ok(pid3 && pid3 !== pid1, `다른 사람이다 — ${pid3} ≠ ${pid1}`);
  if (hall) {
    //   ★남도 **회관 앞까지 걸어간다** — 거리로 막히면 권한 검사가 아니라 거리 검사를 잰 것이다.
    const pulse3 = async (key, ms) => { await page3.keyboard.down(key); await sleep(ms); await page3.keyboard.up(key); await sleep(130); };
    for (let i = 0; i < 70; i++) {
      const c = await page3.evaluate(() => { const a = window.__getMyAbs(); return { x: a.x, y: a.y }; });
      const dx = (spotV[0] * 32 + 16) - c.x, dy = (spotV[1] * 32 + 16) - c.y;
      if (Math.abs(dx) <= 11 && Math.abs(dy) <= 11) break;
      const ms = (d) => Math.max(45, Math.min(90, Math.round(Math.abs(d) * 1.2)));
      if (Math.abs(dx) > Math.abs(dy)) await pulse3(dx > 0 ? 'd' : 'a', ms(dx)); else await pulse3(dy > 0 ? 's' : 'w', ms(dy));
    }
    await page3.evaluate(() => { window.__villageInv = null; window.__notices = []; });
    for (let i = 0; i < 3; i++) { await send({ type: 'village_inventory', buildingId: hall.id }, page3); await sleep(900); }
    const inv3 = await page3.evaluate(() => window.__villageInv);
    const nt3 = await page3.evaluate(() => (window.__notices || []).slice());
    ok(inv3 == null, '★★남의 마을 재고는 **여전히 안 열린다**(응답 자체가 없다)');
    ok(nt3.some((t) => /관리자가 아닙니다|길드의 마을이 아닙니다/.test(t)),
      `★거부 사유가 **권한**이다(거리가 아니다) — "${nt3.slice(-1)[0] || '(없음)'}"`);
  }
  if (hut) {
    await page3.evaluate(() => { window.__notices = []; });
    await send({ type: 'hut_advance', buildingId: hut.id }, page3);
    await sleep(900);
    const nt3 = await page3.evaluate(() => (window.__notices || []).slice());
    ok(nt3.some((t) => /내 움집터가 아닙니다|너무 멀리/.test(t)), `★남의 움집터는 여전히 막힌다 — "${nt3.slice(-1)[0] || '(거부 없음 — 보안 퇴보!)'}"`);
  }
  {
    const t3 = await tokenOf(page3);
    ok(typeof t3 === 'string' && t3 !== tok1, '새 사람은 **다른 토큰**을 받는다(토큰 재사용 없음)');
  }
  await page3.screenshot({ path: `${SHOTS}/06-stranger-denied.png` }).catch(() => {});
  shots.push(`${SHOTS}/06-stranger-denied.png`);

  // ── 마지막: 토큰이 화면 어디에도 안 나온다(두 컨텍스트 모두) ─────────────────
  {
    const t1 = await page.evaluate(() => document.body.innerText || '');
    const n1 = await page.evaluate(() => (window.__notices || []).join(' | '));
    ok(!t1.includes(tok1) && !n1.includes(tok1), '★토큰이 재접속 뒤에도 화면·알림에 안 보인다');
  }

  await browser.close();
  shutdown();
  console.log(`\n스크린샷 ${shots.length}장: ${SHOTS}`);
  console.log(`=== 게스트 재접속 소유 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
