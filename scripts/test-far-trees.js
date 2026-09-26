#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @pixel     ← ★프레임을 화소로 잰다(`page.screenshot` → `PNG.sync.read`) — 렌더 층을 만지므로.
// === scripts/test-far-trees.js — 원경 나무 층 [T380] ==========================
//
// ★무엇을 재나 (카드 T380 ③)
//   ⓐ **손잡이 기본 끔 = 방송 0** — 클라가 요청을 **보냈는데도** 서버가 `far_trees` 를 0통 보낸다
//      (요청 0통이면 자명 통과다 — 그래서 요청 수를 **먼저** assert 한다).
//   ⓑ **겹침 0** — 원경이 준 자리와 **개체가 선 자리**의 교집합이 0. 서버가 활성 청크를
//      보내는 쪽에서 빼므로, 이 수가 0 이 아니면 그 가드가 샌 것이다.
//   ⓒ **원경 자리 = 색인 답** — 하네스가 `chunk.generateChunkResources` + `overflowInto` 로
//      **다시 계산**해 부분집합인지 본다(서버가 지형으로 거른 몫은 수로 적는다).
//   ⓓ **화소** — 층을 끄면 프레임이 달라진다(=이 층이 실제로 그린다) · 다시 켜면 **원래대로**.
//   ⓔ **세계 무변** — 개체 수·id 집합이 요청 전후로 같다(활성화 0 · `resources` 무접촉).
//   ⓕ **부하 표** — 청크당 µs · 캐시 적중률 · 청크 수 · 나무 수 · 클라 그리기 ms.
//   ⓗ ★[T392] **띠 0 · 컬링 n** — `VIEW_RADIUS` 가 `TILE_RENDER_RADIUS` 의 별칭이 되어 띠는 비고 개체가
//      1,500 까지 선다(ⓐ5·ⓐ6). 원경은 큰지도 전용(ⓑ9~ⓑ11). ⓑ12 는 개간·나무꾼이 바꾸는 세계와 **가른다**.
//   ⓖ ★[T384] **띠는 서버 없이 켜진다** — 손잡이 끔 서버에서도 650~1,500 띠를 그린다(ⓐ5).
//      "끔 비트 동일" 은 이제 **원경(ⓑ)에만** 남는다(ⓐ4). 띠의 자는 "띠 안 나무 수 = 모은 수 =
//      그린 수 + 화면 밖 + 상한" 항등식이고, 하네스가 같은 상자로 `conns` 를 **다시 센다**.
//      대조군(`__farOff(1)`)은 띠도 끈다(ⓐ6 · ⓑ9).
//
// ★자명 통과 금지
//   · ⓐ 는 "요청을 보냈다"를 먼저 세운다(안 보냈으면 0통은 아무것도 증명 못 한다).
//   · ⓒ 는 좌표를 **일부러 1px 비틀어** 대조가 깨지는지 본다(늘 통과하는 자가 아니다).
//   · ⓓ 는 "끄면 다르다"와 "켜면 원래대로" **둘 다** 본다(한쪽만 보면 잡음도 통과한다).
//
// ★자리 — `임업3`(57382, 61114). **숲이 제일 빽빽한 곳 중 하나**를 고른다(5×5 청크 5,142그루).
//   빈 들에서 재면 원경 층이 0그루를 그려도 전부 초록이 된다.
//
// 실행: node scripts/test-far-trees.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T344/T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const HEADED = process.argv.includes('--headed');
const AT = { x: 57382, y: 61114, name: '임업3' };

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ★세계를 두 팔에서 **같게** 만든다 — 존 래퍼가 게임 시계를 못 박는다(e2e-fogray 선례).
const WRAP = '/tmp/zone-wrap-fartree.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);

async function bootWorld(db, farOn) {
  killAll();
  await sleep(1500);
  const c = boot('central', path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { say(cu.why); return false; }
  const z = boot('zone', WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: db,
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
    T380_FAR_TREES: farOn ? '1' : '' });
  const zp = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const r = await zp;
  if (!r.ok) { say(r.why); return false; }
  await sleep(20000);
  return true;
}

// 페이지를 열고 숲 한가운데로 옮긴다. 원경 층은 **요청을 스스로** 보낸다(첫 그리기에서).
async function enter(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const clog = []; page.on('console', (m) => clog.push(m.text())); page.on('pageerror', (e) => clog.push('PAGEERROR ' + e.message));
  // ★수신을 **페이지가 열리기 전에** 건다 — `far_trees` 는 입장 직후에 온다(놓치면 0통으로 보인다).
  await page.addInitScript(() => {
    window.__t380Spy = { req: 0, trees: 0, done: 0, doneAfterTrees: 0 };
    const OS = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      try { if (typeof d === 'string' && d.indexOf('far_trees_req') >= 0) window.__t380Spy.req++; } catch (e) {}
      return OS.apply(this, arguments);
    };
    const OA = WebSocket.prototype.addEventListener;
    const _wire = (ws) => {
      if (ws.__t380Spied) return; ws.__t380Spied = true;
      OA.call(ws, 'message', (ev) => {
        const d = ev.data;
        if (typeof d !== 'string') return;
        // ★[T392] 개체 장부 — 기록 중일 때만 **생긴 id · 없어진 id** 를 모은다(ⓑ12 가 세계 변화를 가른다).
        if (window.__t392Rec && d.lastIndexOf('{"type":"resource', 0) === 0) {
          try {
            const m = JSON.parse(d), R = window.__t392Rec;
            if (m.type === 'resources_spawn') for (const r of (m.resources || [])) R.spawn.push([r.id, r.x, r.y]);
            else if (m.type === 'resource_spawn' && m.resource) R.spawn.push([m.resource.id, m.resource.x, m.resource.y]);
            else if (m.type === 'resources_removed') for (const id of (m.ids || [])) R.gone.push(id);
            else if (m.type === 'resource_removed') R.gone.push(m.id);
          } catch (e) {}
        }
        if (d.lastIndexOf('{"type":"far_trees"', 0) === 0) window.__t380Spy.trees++;
        else if (d.lastIndexOf('{"type":"far_trees_done"', 0) === 0) {
          window.__t380Spy.done++;
          if (window.__t380Spy.trees > 0) window.__t380Spy.doneAfterTrees++;   // 조각을 받은 **뒤의** 끝 표식
        }
      });
    };
    const OW = window.WebSocket;
    window.WebSocket = function (...a) { const ws = new OW(...a); _wire(ws); return ws; };
    window.WebSocket.prototype = OW.prototype;
    Object.assign(window.WebSocket, OW);
  });
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()),
    { timeout: 90000 }).then(() => true).catch(() => false);
  // ★[T98 §4-c · `test-harness-lint ⑤d`] `@pixel` 하네스는 **하늘과 바람을 끈다** —
  //   안 끄면 렌더 층이 늘 때마다 프레임이 흔들리고, 그 흔들림이 판정을 삼킨다
  //   (1차 판 실측: 같은 팔 두 프레임이 7,200화소 달랐다 — 이 층이 낸 차이와 구분이 안 됐다).
  if (entered) await page.evaluate(() => {
    if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 });
    if (window.__terrain19) window.__terrain19.windOff = true;
  });
  return { page, clog, entered };
}
async function goTo(page, x, y) {
  // ★★[T392] **도착은 서버 권위로 잰다**(`__getSrvAbs` · 족보: 예측으로 재면 헛것을 본다).
  //   T380~T384 판은 텔레포트를 보내고 6초를 잤다. T392 실측: 서버는 즉시 옮기지만 클라의 권위 위치는
  //   개체 수천 개가 쏟아지는 동안 **~5초 늦게** 오고, 한 판은 그 사이 재접속으로 **스폰 자리로 되돌아갔다**
  //   (개체 4,557 → 109). 그 판의 ⓐ5 는 스폰 마을(농촌22)에서 잰 것이었다 — 자리를 안 물었기 때문이다.
  //   ⇒ 도착할 때까지 기다리고(못 오면 다시 보낸다), 개체가 **더 안 늘 때까지** 기다린다(고정 초 0).
  const where = () => page.evaluate(() => {
    const c = conns.get(window.__getPrimaryZoneId()); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
    if (!c || !c.meta) return { x: null, y: null, n: 0, t: 0 };   // 재접속 중(welcome 전) — 다음 표본에서 다시
    let n = 0, t = 0; for (const r of c.resources.values()) { n++; if (r.type === 'tree') t++; }
    return { x: m ? Math.round(m.x - c.meta.worldOffsetX) : null, y: m ? Math.round(m.y - (c.meta.worldOffsetY || 0)) : null, n, t };
  });
  let at = null;
  for (let tries = 0; tries < 4; tries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [x, y]);
    const arrived = await page.waitForFunction(([x, y]) => {
      const c = conns.get(window.__getPrimaryZoneId()); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
      return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 64 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 64;
    }, [x, y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
    if (!arrived) continue;
    // 개체가 다 올 때까지 — 1초 간격 두 번 연속 늘지 않으면(개간·나무꾼이 **줄이는** 것은 괜찮다)
    let prev = -1, still = 0;
    for (let k = 0; k < 40 && still < 2; k++) { await sleep(1000); const w = await where(); still = (w.n <= prev) ? still + 1 : 0; prev = w.n; }
    at = await where();
    if (Math.abs(at.x - x) < 64 && Math.abs(at.y - y) < 64) break;   // 기다리는 사이 되돌아갔으면 다시
  }
  if (!at) at = await where();
  say(`  · 자리 — 로컬 (${at.x}, ${at.y}) · 목표 (${x}, ${y}) · 개체 ${at.n} · 나무 ${at.t}`);
  return at;
}
const shot = async (page, f) => { fs.mkdirSync('/tmp/t380-shots', { recursive: true }); await page.screenshot({ path: f }); return f; };
function pxDiff(a, b) {
  const { PNG } = require('pngjs');
  const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { n: -1, mx: -1 };
  let n = 0, mx = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d) { n++; if (d > mx) mx = d; }
  }
  return { n, mx };
}

(async () => {
  say('=== 원경 나무 층 — 방송 0 · 겹침 0 · 색인 답 · 부하 (T380 2026-09-23) ===');
  const { chromium } = require('playwright');

  // ══ 팔 ⓐ — 손잡이 **끔**(기본) ═══════════════════════════════════════════════
  if (!await bootWorld('/tmp/t380-off.db', false)) { say('  ★팔 ⓐ 세계를 못 세웠다'); process.exit(1); }
  let browser = await chromium.launch({ headless: !HEADED });
  {
    const { page, clog, entered } = await enter(browser);
    ok(entered, 'ⓐ1 입장(손잡이 끔)');
    if (!entered) { for (const l of clog.slice(-10)) say('    ' + l.slice(0, 150)); await browser.close(); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
    const atA = await goTo(page, AT.x, AT.y);
    const arrivedA = Math.abs(atA.x - AT.x) < 64 && Math.abs(atA.y - AT.y) < 64;
    const spy = await page.evaluate(() => window.__t380Spy);
    const dbg = await page.evaluate(() => (window.__farDbg ? window.__farDbg() : null));
    // ★전제 먼저 — 요청을 안 보냈으면 "방송 0" 은 아무것도 증명 못 한다.
    ok(spy.req >= 1, `ⓐ2 ★전제 — 클라가 원경을 **요청했다** (far_trees_req ${spy.req}통)`);
    ok(spy.trees === 0 && spy.done === 0, `ⓐ3 ★손잡이 끔 = **방송 0** (far_trees ${spy.trees}통 · done ${spy.done}통)`);
    // ★[T384] "끔 비트 동일" 절은 **ⓑ 원경에만** 남는다 — 띠(ⓐ)는 서버 답 없이 클라 혼자 켠다.
    ok(!!dbg && dbg.on === false && dbg.far === 0 && dbg.chunks === 0,
       `ⓐ4 ★손잡이 끔 = **원경(ⓑ) 0그루** (on=${dbg && dbg.on} · 원경 ${dbg && dbg.far} · 받은 청크 ${dbg && dbg.chunks})`);
    // ── ⓐ5 ★[T392] **띠 0 · 컬링 n** — T384 의 ⓐ 절을 뒤집었다 ─────────────────────────
    //   `VIEW_RADIUS` 가 `TILE_RENDER_RADIUS` 의 별칭이 되어 개체가 1,500 까지 선다. 원경 층의 띠는 비고,
    //   나무는 **개체 길**로 그려진다 — 안개 게이트(`_seenFor`)를 지나 **본 셀만**.
    //   ★자: "안개 밖 나무 수 = 그린 수". 하네스가 **같은 프레임**에서 둘을 따로 센다 —
    //     ⓐ 게이트를 통과한 자리(`__fogGateProbe` · 제품이 제 손으로 적은 목록) 중 나무
    //     ⓑ `conns` 의 나무 중 1,500 상자 안 · 본 셀(`window._seenChunks` — 안개가 '봤다'를 적는 그 자료)
    //   ⚠ⓑ 의 셀 판정은 렌더 함수 지역 `_seenCell1` 의 **다시 쓴 것**이다(하네스라서 — 독립 재계산).
    //   ⚠문턱은 **그 자리의 수**다(새 수 0) — T384 의 "500 이상"은 관측 자리가 개간(T378) 영토 안이면
    //     깨졌다(PM 컨테이너 ⓑ10 "그린 56 < 100"). 이제 두 수가 **같은가**를 묻고, 0 이면 빨갛다.
    const cull = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
      const d = window.__farDbg ? window.__farDbg() : {};
      const pos = new Map();
      const R = d.tileR || 1500, cx0 = d.cx, cy0 = d.cy;
      const seen = (wx, wy) => {
        const sc = window._seenChunks; if (!sc) return true;
        const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
        const s = sc.get((cx >> 4) + '_' + (cy >> 4)); return !!s && s.has(cx * 65536 + cy);
      };
      let mine = 0, mineOut650 = 0;
      for (const c of conns.values()) {
        if (!c.meta || !c.resources) continue;
        const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
        for (const r of c.resources.values()) {
          const ax = ox + r.x, ay = oy + r.y;
          pos.set(ax + ',' + ay, r.type);
          if (r.type !== 'tree') continue;
          if (Math.abs(ax - cx0) > R || Math.abs(ay - cy0) > R) continue;
          if (!seen(ax, ay)) continue;
          mine++;
          if (Math.abs(ax - cx0) > 650 || Math.abs(ay - cy0) > 650) mineOut650++;
        }
      }
      let probe = 0, probeOut650 = 0;
      for (const [wx, wy, kind] of (window.__fogGateProbe ? window.__fogGateProbe() : [])) {
        if (kind !== 'resource' || pos.get(wx + ',' + wy) !== 'tree') continue;
        probe++;
        if (Math.abs(wx - cx0) > 650 || Math.abs(wy - cy0) > 650) probeOut650++;
      }
      res({ d, mine, mineOut650, probe, probeOut650 });
    })));
    ok(arrivedA && cull.d.viewR === cull.d.tileR && cull.d.near === 0 && cull.probe > 0 && cull.probe === cull.mine,
       `ⓐ5 ★띠 0 · 컬링 ${cull.probe}${arrivedA ? '' : ' · ★목표에 못 갔다'} — 원경 층 띠 ${cull.d.near}그루(viewR ${cull.d.viewR} = tileR ${cull.d.tileR}) ·`
       + ` 개체 길이 그린 나무 ${cull.probe} = 1,500 안 본 셀의 나무 ${cull.mine}`);
    // ── ⓐ6 반례 — 컬링이 **옛 650 상자 밖** 나무를 실제로 그리고, 스프라이트가 그만큼 돈다 ─────────
    //   650 밖이 0 이면 "컬링이 넓어졌다"는 아무것도 증명 못 한다. 그리고 게이트를 통과한 것이
    //   **정말 그려졌나**는 `40-r2-sprites` 의 제 계수기로 잰다(내 자가 아니다 · 여덟 프레임 평균).
    const drawDelta0 = () => page.evaluate(() => new Promise((res) => {
      const n0 = window.__natDbg.treeDraw.n; let k = 0;
      const step = () => { if (++k < 8) requestAnimationFrame(step); else res((window.__natDbg.treeDraw.n - n0) / 8); };
      requestAnimationFrame(step);
    }));
    const perF = await drawDelta0();
    ok(cull.probeOut650 > 0 && cull.probeOut650 === cull.mineOut650 && perF >= cull.probe * 0.9,
       `ⓐ6 반례 — 옛 650 상자 **밖** 나무 ${cull.probeOut650}그루(재계산 ${cull.mineOut650})를 개체 길이 그린다 ·`
       + ` 나무 그리기 호출 프레임당 ${perF.toFixed(1)} ≥ 그린 ${cull.probe}`);
    await page.close();
  }
  await browser.close();

  // ══ 팔 ⓑ — 손잡이 **켬** ═══════════════════════════════════════════════════
  if (!await bootWorld('/tmp/t380-on.db', true)) { say('  ★팔 ⓑ 세계를 못 세웠다'); process.exit(1); }
  browser = await chromium.launch({ headless: !HEADED });
  const { page, clog, entered } = await enter(browser);
  ok(entered, 'ⓑ1 입장(손잡이 켬)');
  if (!entered) { for (const l of clog.slice(-10)) say('    ' + l.slice(0, 150)); await browser.close(); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
  const atB = await goTo(page, AT.x, AT.y);
  const arrivedB = Math.abs(atB.x - AT.x) < 64 && Math.abs(atB.y - AT.y) < 64;
  // ★§0 — 화면 반경(1,500px)만 물으면 **보낼 청크가 0개**다: 그 상자는 통째로 활성 청크이기 때문이다
  //   (`ceil(1200/1024)=2` ⇒ 5×5 청크 ⇒ 어느 방향으로든 최소 2,048px). 그래서 첫 답은 **빈 답**이고,
  //   그 빈 답이 곧 "손잡이가 켜져 있다"는 악수다. 자료가 정말 필요한 곳은 **큰지도 배율**이다.
  const gotDone = await page.waitForFunction(() => window.__t380Spy.done >= 1, { timeout: 60000 }).then(() => true).catch(() => false);
  ok(gotDone, 'ⓑ2 ★화면 반경은 **빈 답**이 온다(그 상자는 통째로 활성 청크다 — 보낼 것이 없다)');
  const spy0 = await page.evaluate(() => window.__t380Spy);
  ok(spy0.trees === 0, `ⓑ3 ★겹침 0 은 **보내는 쪽에서** 선다 — 화면 반경 요청에 far_trees ${spy0.trees}통`);
  // 큰지도 배율 — 여기가 자료가 **정말 없는** 곳이다.
  // ★[T384] 큰지도 반경은 **제품이 묻는 길**(`_farWant` — 80-bigmap 이 부르는 그것)로 묻는다.
  //   T380 판은 날 요청(`r: 6000`)을 한 번 보냈는데, 클라가 4초마다 보내는 화면 반경 요청(1,500)이
  //   서버 큐를 **갈아 끼워** 흐름을 끊었다(서버는 새 요청마다 큐를 새로 짠다). 그리고 끝 판정이
  //   `done >= 2` 였는데 **그 둘을 화면 반경 악수 두 번이 채울 수 있었다** — T384 첫 판이 그 모양을 냈다(ⓑ4 녹색 · ⓑ5 조각 0통).
  //   T380 이 통과한 것은 흐름이 4초 안에 끝난 **운**이었다(족보 130 — 끝 표식이 무엇의 끝인지 묻지 않았다).
  //   ⇒ 제품 길로 묻고, **조각을 받은 뒤의** 끝 표식을 기다린다.
  await page.evaluate(() => _farWant(6000));
  const gotFar = await page.waitForFunction(() => window.__t380Spy.doneAfterTrees >= 1, { timeout: 120000 }).then(() => true).catch(() => false);
  ok(gotFar, 'ⓑ4 큰지도 반경(6,000px · `_farWant`) — 조각을 받은 **뒤의** 끝 표식이 왔다');
  await sleep(1000);
  const spy = await page.evaluate(() => window.__t380Spy);
  const dbg = await page.evaluate(() => window.__farDbg());
  ok(arrivedB && spy.trees >= 1, `ⓑ5 손잡이 켬 = 방송 **온다** (far_trees ${spy.trees}통 · 청크 ${dbg.chunks})${arrivedB ? '' : ' · ★목표에 못 갔다'}`);

  // ── ⓑ4 겹침 0 — 원경 자리 ∩ 개체 자리 = ∅ ────────────────────────────────
  const ov = await page.evaluate(() => {
    const ent = new Set();
    for (const c of conns.values()) for (const r of c.resources.values())
      if (r.type === 'tree') ent.add(Math.round(r.x) + ',' + Math.round(r.y));
    let far = 0, hit = 0;
    for (const [k, n] of Object.entries(window.__farPts())) { far += n.length / 5;
      for (let i = 0; i + 4 < n.length; i += 5) if (ent.has(n[i] + ',' + n[i + 1])) hit++; }
    return { ent: ent.size, far, hit };
  }).catch(() => null);
  ok(!!ov && ov.far > 0 && ov.hit === 0, `ⓑ6 ★겹침 0 — 원경 ${ov ? ov.far : '?'}그루 ∩ 개체 ${ov ? ov.ent : '?'}그루 = ${ov ? ov.hit : '?'}`);

  // ── ⓑ5 원경 자리 = 색인 답(하네스가 다시 계산한다) ───────────────────────
  const cells = await page.evaluate(() => window.__farPts());
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const terr = require(path.join(ROOT, 'server', 'terrain'));
  if (terr.setZonesMeta) terr.setZonesMeta(ZONES);
  const chunk = require(path.join(ROOT, 'server', 'chunk'));
  const Z = ZONES.hanbando, cs = chunk.CHUNK_SIZE;
  const keys = Object.keys(cells).filter((k) => cells[k].length).slice(0, 6);
  let sub = 0, subMiss = 0, dropped = 0, checked = 0;
  for (const k of keys) {
    const i = k.indexOf('_'); const cx = +k.slice(0, i), cy = +k.slice(i + 1);
    const mine = new Set();
    const add = (list) => { for (const r of list) if (r.type === 'tree') mine.add(Math.round(r.x) + ',' + Math.round(r.y)); };
    add(chunk.generateChunkResources('hanbando', Z.biome, cx, cy, cs, null, 0));
    add(chunk.overflowInto('hanbando', Z.biome, cx, cy, cs, null, 0));
    const pts = cells[k];
    for (let j = 0; j + 4 < pts.length; j += 5) { checked++; if (mine.has(pts[j] + ',' + pts[j + 1])) sub++; else subMiss++; }
    dropped += mine.size - (pts.length / 5);
  }
  ok(checked > 0 && subMiss === 0,
     `ⓑ7 ★원경 자리 = 색인 답 — 청크 ${keys.length}개 · ${checked}그루 전부 색인에 있다(빗나감 ${subMiss}) · 서버가 지형으로 거른 몫 ${dropped}`);
  // 반례 — 1px 비틀면 이 자가 잡는가(늘 통과하는 자가 아니다)
  let cxMiss = 0;
  if (keys.length) {
    const k = keys[0]; const i = k.indexOf('_'); const cx = +k.slice(0, i), cy = +k.slice(i + 1);
    const mine = new Set();
    const add = (list) => { for (const r of list) if (r.type === 'tree') mine.add(Math.round(r.x) + ',' + Math.round(r.y)); };
    add(chunk.generateChunkResources('hanbando', Z.biome, cx, cy, cs, null, 0));
    add(chunk.overflowInto('hanbando', Z.biome, cx, cy, cs, null, 0));
    const pts = cells[k];
    for (let j = 0; j + 4 < pts.length; j += 5) if (!mine.has((pts[j] + 1) + ',' + pts[j + 1])) cxMiss++;
  }
  ok(cxMiss > 0, `ⓑ8 자명 통과 금지 — 좌표를 1px 비틀면 대조가 깨진다(빗나감 ${cxMiss})`);

  // ── ⓑ9 ★[T392] 원경은 **큰지도 전용** — 화면에선 0그루 ───────────────────────
  //   받은 원경 청크는 전부 활성 청크 밖(≥2,048px)이고 화면 상자는 1,500 이다 ⇒ 화면엔 한 그루도 안 든다.
  //   띠도 꺼졌다(viewR = tileR). ⇒ 원경 층은 **화면 프레임에 손대지 않는다** — 화소로도 본다.
  const scr = await page.evaluate(() => window.__farDbg());
  const A1 = await shot(page, '/tmp/t380-shots/A1_on.png');
  await sleep(800);
  const A2 = await shot(page, '/tmp/t380-shots/A2_on.png');
  const noise = pxDiff(A1, A2);
  await page.evaluate(() => window.__farOff(1)); await sleep(800);
  const B = await shot(page, '/tmp/t380-shots/B_off.png');
  const dAB = pxDiff(A2, B);
  ok(scr.chunks > 0 && scr.drawn === 0 && scr.near === 0 && scr.far === 0,
     `ⓑ9 ★화면에선 원경 0 — 받은 청크 ${scr.chunks} · 이번 프레임 원경 ${scr.far} · 띠 ${scr.near} · 그린 ${scr.drawn}`);
  say(`  · 화소(참고) — 켬↔켬 잡음 ${noise.n} · 층 켬↔끔 ${dAB.n}(${(dAB.n / Math.max(1, noise.n)).toFixed(1)}배) — 같은 잡음 층이어야 한다(층이 화면에 0그루)`);
  // ── ⓑ10 큰지도 숲 점 = 받은 원경 나무 수 · ⓑ11 대조군 ────────────────────────
  //   `_farBigmapDots` 는 80-bigmap 이 부르는 **그 함수**다. 화면 밖 캔버스에 그려 **돌려준 수**와
  //   **찍힌 화소**(숲 색) 둘 다 본다 — 수만 보면 그리지 않고 세기만 해도 통과한다.
  const bm = (label) => page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
    const cx = cv.getContext('2d');
    let far = 0; for (const v of Object.values(window.__farPts())) far += v.length / 5;
    const d = window.__farDbg();
    // 원경 청크들의 무게 중심을 캔버스 가운데로 — 배율 0.02(청크 하나 ≈ 20px)
    let sx = 0, sy = 0, n = 0;
    for (const v of Object.values(window.__farPts())) for (let i = 0; i + 4 < v.length; i += 5) { sx += v[i]; sy += v[i + 1]; n++; }
    const c = conns.get(window.__getPrimaryZoneId()); const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    const z = 0.02, px = 200 - (ox + sx / Math.max(1, n)) * z, py = 200 - (oy + sy / Math.max(1, n)) * z;
    const k = _farBigmapDots(cx, z, px, py, '#2a5a2a');
    const im = cx.getImageData(0, 0, 400, 400).data; let lit = 0;
    for (let i = 0; i < im.length; i += 4) if (im[i + 3] && im[i] === 0x2a && im[i + 1] === 0x5a) lit++;
    return { k, far, lit, on: d.on };
  });
  const bOff = await bm('off');
  await page.evaluate(() => window.__farForce(1)); await sleep(300);
  const bOn = await bm('on');
  ok(bOn.far > 0 && bOn.k === bOn.far && bOn.lit > 0,
     `ⓑ10 ★큰지도 숲 점 = 받은 원경 나무 — 점 ${bOn.k} = 원경 ${bOn.far} · 찍힌 숲 화소 ${bOn.lit}`);
  ok(bOff.k === 0 && bOff.lit === 0 && bOn.k > 0,
     `ⓑ11 대조군 — 층을 끄면 큰지도 점 ${bOff.k}(화소 ${bOff.lit}) · 켜면 ${bOn.k}`);

  // ── ⓑ12 ★[T392] 세계 무변 — **세계 변화와 가른다** ──────────────────────────────
  //   T384 판은 "요청 전후 개체 수가 같다"를 봤다. 그런데 세계는 **멈춰 있지 않다** — 개간(T378 ·
  //   `_terrGrow` → `clearTreesInCells`)이 게임일마다 관측 마을 영토 안 나무를 베고, 나무꾼이 벤다.
  //   PM 컨테이너가 그걸 잡았다(5,222 → 5,201 · 원경과 무관). 자가 세계를 정지로 가정했다.
  //   ⇒ 이 절이 재야 하는 것은 "원경 요청이 **개체를 만들지 않는다**"(활성화 0)이다. 그래서
  //     요청 동안 서버가 보낸 **생김·없어짐**을 장부로 받고, 항등식으로 센다:
  //       뒤 = (앞 − 없어진 것) ∪ 생긴 것        ← 장부 밖으로 바뀐 개체 0
  //       생긴 것 중 **앞에 없던 청크**의 것 0   ← 원경 요청이 청크를 켜지 않았다
  //   반례 — 페이지에서 개체 하나를 **장부 없이** 지우면 항등식이 깨져야 한다.
  const snap = () => page.evaluate(() => {
    const ids = []; const ch = new Set();
    for (const c of conns.values()) for (const r of c.resources.values()) { ids.push(r.id); ch.add(Math.floor(r.x / 1024) + '_' + Math.floor(r.y / 1024)); }
    return { ids, ch: [...ch] };
  });
  //   ⚠스냅샷과 장부 켜기는 **한 evaluate 안에서**(페이지는 한 줄기라 그 사이에 메시지가 못 끼어든다).
  //     따로 부르면 그 틈에 온 없어짐이 장부에 안 적힌다 — 첫 판 전수 러너가 "장부 밖 1"로 그걸 잡았다.
  const snapIn = `(() => { const ids = []; const ch = new Set();
    for (const c of conns.values()) for (const r of c.resources.values()) { ids.push(r.id); ch.add(Math.floor(r.x / 1024) + '_' + Math.floor(r.y / 1024)); }
    return { ids, ch: [...ch] }; })()`;
  const before = await page.evaluate((src) => { const s = eval(src); window.__t392Rec = { spawn: [], gone: [] }; return s; }, snapIn);
  await page.evaluate(() => _farWant(9000));   // 제품 길(ⓑ4 와 같은 이유)
  await page.waitForFunction(() => window.__t380Spy.doneAfterTrees >= 2, { timeout: 120000 }).catch(() => {});
  const { rec, after } = await page.evaluate((src) => { const R = window.__t392Rec; window.__t392Rec = null; return { rec: R, after: eval(src) }; }, snapIn);
  const ident = (B, A) => {
    const gone = new Set(rec.gone), sp = new Set(rec.spawn.map((x) => x[0]));
    const want = new Set(B.ids.filter((id) => !gone.has(id))); for (const id of sp) want.add(id);
    // 생겼다가 같은 창 안에서 없어진 것은 뒤에 없다 — 장부 순서를 따르지 않고 둘 다 본 것은 뺀다
    for (const id of gone) if (sp.has(id) && !A.ids.includes(id)) want.delete(id);
    const got = new Set(A.ids);
    let extra = 0, missing = 0;
    for (const id of got) if (!want.has(id)) extra++;
    for (const id of want) if (!got.has(id)) missing++;
    return { extra, missing };
  };
  const I = ident(before, after);
  const chB = new Set(before.ch);
  const newChunk = rec.spawn.filter(([, x, y]) => !chB.has(Math.floor(x / 1024) + '_' + Math.floor(y / 1024))).length;
  // 반례 — 장부 없이 하나를 지운다(실제 페이지 상태를 바꾼다)
  await page.evaluate(() => { for (const c of conns.values()) { const k = c.resources.keys().next().value; if (k) { c.resources.delete(k); break; } } });
  const after2 = await snap();
  const I2 = ident(before, after2);
  ok(I.extra === 0 && I.missing === 0 && newChunk === 0 && (I2.extra + I2.missing) > 0,
     `ⓑ12 ★세계 무변(세계 변화와 가름) — 개체 ${before.ids.length} → ${after.ids.length} · 장부: 생김 ${rec.spawn.length} · 없어짐 ${rec.gone.length}`
     + ` · 장부 밖 변화 ${I.extra + I.missing} · 새 청크에서 생김 ${newChunk} · 반례(장부 없이 하나 지움) 장부 밖 ${I2.extra + I2.missing}`);

  // ── ⓑ10 부하 표 ──────────────────────────────────────────────────────────
  const fin = await page.evaluate(() => window.__farDbg());
  const d2 = fin.done || {};
  ok(d2.perChunkUs > 0, `ⓑ13 부하 — 청크당 ${d2.perChunkUs}µs · 계산 ${d2.calc}청크 · 캐시 적중 ${(d2.hitRate * 100).toFixed(1)}% (적중 ${d2.hit}/빗 ${d2.miss}) · 보낸 청크 ${d2.chunks} · 나무 ${d2.trees}`);
  say(`  · 클라 그리기 ${fin.ms}ms/f · 이번 프레임 그린 수 ${fin.drawn} (띠 ${fin.near} · 원경 ${fin.far}) · 요청 반경 ${fin.reqR}px`);

  await browser.close(); killAll();
  say(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { say('★예외: ' + (e && e.stack || e)); killAll(); process.exit(1); });
