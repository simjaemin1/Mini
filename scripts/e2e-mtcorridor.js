#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e-mtcorridor — **통로(갱)** 실클라 회귀. 산 아크의 세일즈 포인트를 박제한다.
//
// ★사실부터: 산 부수기의 **서버 이벤트가 아직 없다**(client.js `_mtDestroyed` 주석 "§A-6 회부",
//   server/terrain.js "산은 완벽한 콜라이더다 — 뚫려 있는 곳은 처음부터 뚫려 있는 두 종류뿐").
//   `__mtDestroy` 는 **렌더 층만** 연다. 서버 통행 판정(isTerrainBlockedLocal → isRockCellLocal)은
//   그대로 막는다. 그래서 "파낸 통로를 걸어서 통과"는 **오늘 규격에서 불가능**하다.
//   ⇒ 이 회귀는 두 가지를 한다:
//      ⑴ 오늘 지켜지는 것(렌더 계약·부수기 합법성·복원)을 **정확히** 박제하고,
//      ⑵ 아직 없는 것(서버 통행 이벤트)을 **판정으로 고정**해 둔다 — 생기는 날 이 회귀가 알려 준다.
//   판정을 느슨하게 둔 게 아니라, **없는 기능을 있는 척 통과시키지 않기 위해** 이렇게 쓴다.
//
// ★자명 통과 금지 — 걸음이 막힌 게 '다리가 안 움직여서'가 아님을 대조군으로 증명한다.
// ★텔레포트 금지 — 이동은 키 입력뿐. 키→방향 대응은 **빈 땅에서 실측으로 배운다**(하드코딩 금지).
// 사용: node scripts/e2e-mtcorridor.js
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const SHOTS = process.env.SHOTS || '/tmp/e2e-mtcorridor';
fs.mkdirSync(SHOTS, { recursive: true });
const DEPTH = +(process.env.DEPTH || 12);
let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };

// ── 자리 고르기: 정본 술어로 **산 가장자리**를 찾는다(입구는 뭍, 안쪽으로 DEPTH칸 바위) ──
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZID = 'hanbando';
const rock = (i, j) => T.isRockCellLocal(ZID, i * 32 + 16, j * 32 + 16);
const water = (i, j) => T.isWaterCellLocal(ZID, i * 32 + 16, j * 32 + 16);
function pickSite() {
  // 축 방향 네 가지 중, 입구(뭍)에서 안으로 DEPTH칸이 전부 바위이고 물이 없는 자리
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 200; j < 900; j += 3) {
    for (let i = 1760; i < 2260; i += 3) {
      if (rock(i, j) || water(i, j)) continue;                 // 입구는 뭍이어야 한다
      for (const [dx, dy] of DIRS) {
        let okAll = true;
        for (let k = 1; k <= DEPTH + 2; k++) {
          const a = i + dx * k, b = j + dy * k;
          if (!rock(a, b) || water(a, b)) { okAll = false; break; }
        }
        if (!okAll) continue;
        // 입구 반대쪽도 뭍이어야 걸어 들어가는 그림이 된다
        if (rock(i - dx, j - dy) || water(i - dx, j - dy)) continue;
        return { i, j, dx, dy };
      }
    }
  }
  return null;
}

(async () => {
  say('\n=== 통로(갱) 실클라 E2E ===');
  const site = pickSite();
  if (!site) { console.error('통로 자리를 못 찾았다'); die(1); }
  say(`  자리: 입구 셀 (${site.i},${site.j}) · 방향 (${site.dx},${site.dy}) · 깊이 ${DEPTH}`);
  const digCells = [];
  for (let k = 1; k <= DEPTH; k++) digCells.push([site.i + site.dx * k, site.j + site.dy * k]);

  fs.writeFileSync('/tmp/zw-corr-e2e.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-corr-e2e.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/corr-e2e.db',
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.i * 32 + 16, y: site.j * 32 + 16, name: '통로입구' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);

  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => say('  [err] ' + String(e.message).slice(0, 160)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await pg.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await pg.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; });
  // ★[T98 2026-09-05] **하늘도 끈다** — 바람을 끈 것과 같은 자리다. T98 이 `weatherFor` 에
  //   `precip` 을 실으면서 세계가 실제로 비를 보낸다. 비는 매 프레임 다시 그려지고 **안개 합성 뒤**에
  //   그려지므로, 두 프레임 동일·안개 위 밝은 픽셀 같은 판정이 하늘 때문에 빨개진다.
  //   이 하네스가 재는 건 하늘이 아니다 ⇒ 끄는 문은 T93 이 남긴 진단 훅 하나(안 켜져 있으면 무해).
  await pg.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
  await sleep(2000);

  const cell = () => pg.evaluate(() => { const m = window.__getMyAbs(); return [Math.floor(m.x / 32), Math.floor(m.y / 32)]; });
  const cellLocal = () => pg.evaluate(() => window.__camCellLocal());
  // ★연결이 잠깐 끊기면 정본 훅이 null 을 돌려준다. 그걸 결과로 읽지 않는다 — 값이 올 때까지 기다린다.
  const evalRetry = async (fn, arg, tries = 12) => {
    for (let k = 0; k < tries; k++) {
      const v = await pg.evaluate(fn, arg);
      if (v !== null && v !== undefined && !(v && typeof v === 'object' && v.cutRock === null)) return v;
      await sleep(1500);
    }
    return null;
  };
  // 키 하나 또는 **동시 두 개**를 누른다 — 등각 조작이라 축 이동은 두 키를 같이 눌러야 한다.
  const press = async (k, ms) => {
    for (const c of k) await pg.keyboard.down(c);
    await sleep(ms);
    for (const c of k) await pg.keyboard.up(c);
    await sleep(220);
  };
  const shot = (n) => pg.screenshot({ path: path.join(SHOTS, n + '.png') });

  // ── ⓐ 키 → 방향 대응을 **실측으로 배운다** (하드코딩 금지) ─────────────────
  say('\n[ⓐ 키→방향 대응을 빈 땅에서 배운다]');
  //   ★등각 조작이라 단일 키는 **대각**(±1,±1)으로 움직인다. 축 이동은 두 키를 같이 눌러야 한다.
  //     그래서 단일 4가지 + 조합 4가지를 다 배운다. 하드코딩 대신 **실측**이다.
  const OPP = { w: 's', s: 'w', a: 'd', d: 'a' };
  //   ★한 번 눌러 안 움직였다고 '그 방향은 못 간다'로 적으면 안 된다 — 그 순간 나무·바위에
  //     막혔을 수 있다(실측: 같은 자리에서 'sd' 가 어떤 판엔 (1,0), 어떤 판엔 (0,0) 이었다).
  //     ⇒ 조합마다 **최대 3번** 시도하고, 그래도 안 움직이면 '모름'으로 남긴다.
  //     그래도 축과 딱 맞는 조작을 못 찾으면 **자리를 옮겨** 한 번 더 배운다.
  const KEYS = ['w', 'a', 's', 'd', 'ws', 'wd', 'as', 'ad', 'sd', 'wa'];
  const learnOnce = async () => {
    const out = {};
    for (const k of KEYS) {
      if (k.length === 2 && OPP[k[0]] === k[1]) continue;
      for (let t = 0; t < 3; t++) {
        const p0 = await cell();
        await press(k, 900);
        const p1 = await cell();
        const d = [p1[0] - p0[0], p1[1] - p0[1]];
        if (d[0] || d[1]) { out[k] = d; await press([...k].map((c) => OPP[c]).join(''), 900); break; }
        if (t === 2) out[k] = null;
      }
    }
    return out;
  };
  const bestOf = (L) => { let key = null, dot = 0;
    for (const [k, v] of Object.entries(L)) { if (!v) continue;
      const n = Math.hypot(v[0], v[1]); if (!n) continue;
      const c = (v[0] * site.dx + v[1] * site.dy) / n; if (c > dot) { dot = c; key = k; } }
    return { key, dot }; };
  let learned = await learnOnce();
  let pick = bestOf(learned);
  if (pick.dot < 0.95) {                                     // 자리를 옮겨 한 번 더
    const mover = Object.entries(learned).find(([, v]) => v && (v[0] || v[1]));
    if (mover) { for (let t = 0; t < 3; t++) await press(mover[0], 900); }
    say('    (축과 딱 맞는 조작을 못 찾아 자리를 옮겨 다시 배운다)');
    const L2 = await learnOnce();
    for (const [k, v] of Object.entries(L2)) if (v) learned[k] = v;
    pick = bestOf(learned);
  }
  say(`    ${JSON.stringify(learned)}`);
  const moved = Object.values(learned).filter((v) => v && (v[0] || v[1])).length;
  ok(moved >= 4, `★대조군 — 빈 땅에서는 걸으면 실제로 움직인다 (${moved}/${Object.keys(learned).length} 조합)`);
  const key = pick.key, bestDot = pick.dot;
  say(`    통로 방향 (${site.dx},${site.dy}) 에 맞는 키 = '${key}' (일치도 ${bestDot.toFixed(2)})`);
  ok(!!key && bestDot > 0.95, `★통로 축과 **정확히** 맞는 조작을 실측으로 찾았다 ('${key}', 일치도 ${bestDot.toFixed(2)})`);

  // ── ⓑ 부수기 — 가장자리 규칙을 정본 술어로 매 삽 검사 ─────────────────────
  say('\n[ⓑ 통로를 정본 부수기로 뚫는다 — 가장자리에서만]');
  await shot('A-부수기전');
  const mid0 = digCells[Math.floor(DEPTH / 2)];
  const hMid0 = await pg.evaluate((m) => window.__mtHeightAt(m[0], m[1]), mid0);   // ★파기 **전** 높이(복원 기준값)
  const dig = await pg.evaluate((cs) => {
    const out = { dug: 0, illegal: 0 };
    for (const [i, j] of cs) {
      const isR = window.__mtIsRock(i, j);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => window.__mtIsRock(i + a, j + b) === false);
      if (!isR || !edge) { out.illegal++; continue; }
      window.__mtDestroy([[i, j]]); out.dug++;
    }
    return out;
  }, digCells);
  say(`    삽질 ${dig.dug}칸 · 규칙 위반 ${dig.illegal}칸`);
  ok(dig.dug === DEPTH, `★통로 ${DEPTH}칸을 다 뚫었다 (${dig.dug})`);
  ok(dig.illegal === 0, `★★가장자리에서만 팠다 (위반 ${dig.illegal})`);
  await sleep(4000);
  await shot('B-부순뒤');

  // ── ⓒ 렌더 계약 — 파낸 셀은 렌더에서 열리고, 옆벽은 제 높이로 선다 ─────────
  say('\n[ⓒ 렌더 계약 — 파낸 셀은 도려내지고 옆벽은 제 높이]');
  const mid = digCells[Math.floor(DEPTH / 2)];
  const rc = await pg.evaluate((m) => ({
    cutRock: window.__mtIsRock(m[0], m[1]),
    mesh: window.__mt3MeshAt(m[0], m[1]),
    hSide: [window.__mtHeightAt(m[0] + 1, m[1]), window.__mtHeightAt(m[0] - 1, m[1]),
            window.__mtHeightAt(m[0], m[1] + 1), window.__mtHeightAt(m[0], m[1] - 1)],
  }), mid);
  const wallMax = Math.max(...rc.hSide);
  say(`    가운데 셀 (${mid}) — 렌더 바위 ${rc.cutRock} · cut ${rc.mesh && rc.mesh.cut} · 옆 4칸 높이 ${JSON.stringify(rc.hSide)}`);
  ok(rc.cutRock === false, `★파낸 셀은 렌더 판정에서 바위가 아니다`);
  ok(!!(rc.mesh && rc.mesh.cut), `★파낸 셀이 메시에서 **갱(cut)** 으로 표시된다`);
  // ★★"협곡이냐 도랑이냐"는 **장면 상수**로 못 가른다(자리마다 dE 가 달라 마루가 다르다).
  //   정본 대조군: 마스크 이원화를 끄면(옛 판) 옆벽이 파낸 깊이만큼 **같이 주저앉는다**.
  //   켠 판이 끈 판보다 확실히 높아야 '협곡'이다.
  const wallAB = await pg.evaluate(async (m) => {
    const out = {};
    for (const d of [0, 1]) {
      window.__mtDual(d);
      out[d] = Math.max(window.__mtHeightAt(m[0] + 1, m[1]), window.__mtHeightAt(m[0] - 1, m[1]),
                        window.__mtHeightAt(m[0], m[1] + 1), window.__mtHeightAt(m[0], m[1] - 1));
    }
    window.__mtDual(1);
    return out;
  }, mid);
  say(`    옆벽 높이 — 이원화 끔(옛 판/도랑) ${wallAB[0].toFixed(2)}m · 켬(협곡) ${wallAB[1].toFixed(2)}m`);
  ok(wallAB[0] > 0.5, `★자명 통과 금지 — 옛 판에서도 높이가 0 은 아니다 (${wallAB[0].toFixed(2)}m)`);
  ok(wallAB[1] > wallAB[0] * 2.5, `★★옆벽이 제 높이로 선다 — 협곡 ${wallAB[1].toFixed(2)}m 가 도랑 ${wallAB[0].toFixed(2)}m 의 2.5배 넘는다`);

  // ── ⓓ 오늘 규격 — 서버는 파괴를 모른다: 걸어서 못 들어간다 ─────────────────
  say('\n[ⓓ 오늘 규격 — 파낸 통로는 **렌더만** 열린다(서버 통행 이벤트 §A-6 미구현)]');
  //   ★입구 앞에 정확히 서서 축으로만 민다. 옆으로 샜으면 '들어갔다'가 아니다 — 두 성분을 다 본다.
  //   ★판정은 '몇 칸 갔나'가 아니라 **'파낸 칸을 밟았나'** 다. 스폰이 한두 칸 밀릴 수 있어
  //     걸음 수로 재면 그 밀림을 '진입'으로 잘못 센다(실측에서 그렇게 틀렸다).
  const p0 = await cell(), l0 = await cellLocal();
  //   ★한 걸음마다 밟은 칸을 적는다 — '끝에 어디 있나'가 아니라 **'가는 동안 파낸 칸을 밟았나'** 를 본다.
  const path2 = [];
  for (let s = 0; s < 10; s++) { await press(key, 900); path2.push(await cellLocal()); }
  const p1 = await cell(), l1 = path2[path2.length - 1];
  const dI = p1[0] - p0[0], dJ = p1[1] - p0[1];
  const into = dI * site.dx + dJ * site.dy;                       // 통로 축 성분(참고값)
  const side = Math.abs(dI * site.dy - dJ * site.dx);             // 축에서 벗어난 성분
  const onDug = digCells.some(([a, b]) => a === l1[0] && b === l1[1]);
  const wasRock = rock(l1[0], l1[1]);                             // 정본 술어 — 원래 바위였나
  say(`    출발 ${p0}(로컬 ${l0}) → 도착 ${p1}(로컬 ${l1}) · 축 진행 ${into}셀 · 이탈 ${side}셀 · 파낸 칸 위? ${onDug} · 원래 바위? ${wasRock}`);
  //   ★옆으로 밀린 건 결함이 아니다 — 벽에 부딪히면 면을 따라 미끄러진다(서버 이동 규약).
  //     "옆길로 샌 걸 진입으로 세지 않는다"는 목적은 아래 두 판정이 **정확히** 대신한다.
  const touchedDug = path2.filter((c) => digCells.some(([a, b]) => a === c[0] && b === c[1])).length;
  say(`    걸은 자취 ${path2.length}칸 중 파낸 칸을 밟은 횟수 ${touchedDug} (벽에 밀려 면을 따라 ${side}셀 미끄러짐)`);
  ok(touchedDug === 0, `★★걸어가는 **동안에도** 파낸 칸을 한 번도 못 밟는다 (${touchedDug}회)`);
  ok(!onDug, `★★도착 칸도 통로 밖이다 (${l1})`);
  ok(!wasRock, `★★도착 칸은 원래 바위가 아니다 — 서버 통행 판정이 산을 막는다`);
  ok(moved >= 2, `★반례 — 다리가 안 움직인 게 아니다(위 ⓐ에서 빈 땅 이동 확인)`);
  await shot('C-걸어서진입시도');

  // ── ⓔ 복원 — 렌더가 닫힌다 ───────────────────────────────────────────────
  say('\n[ⓔ 복원하면 렌더가 닫힌다]');
  await pg.evaluate(() => window.__mtClearDestroy());
  await sleep(4000);
  const rc2 = await evalRetry((m) => ({
    cutRock: window.__mtIsRock(m[0], m[1]),
    mesh: window.__mt3MeshAt(m[0], m[1]),
    h: window.__mtHeightAt(m[0], m[1]),
  }), mid);
  say(`    복원 뒤 — 렌더 바위 ${rc2 && rc2.cutRock} · cut ${rc2 && rc2.mesh && rc2.mesh.cut} · 높이 ${rc2 && rc2.h}m`);
  ok(!!rc2 && rc2.cutRock === true, `★★복원하면 파낸 셀이 다시 바위다`);
  ok(!!rc2 && !(rc2.mesh && rc2.mesh.cut), `★복원하면 갱 표시가 사라진다`);
  ok(!!rc2 && Math.abs(rc2.h - hMid0) < 0.01, `★★복원하면 그 자리 높이가 **파기 전 값 그대로** 돌아온다 (${rc2.h}m vs ${hMid0}m)`);
  await shot('D-복원뒤');

  say(`\n=== 통로(갱) E2E: 통과 ${pass} · 실패 ${fail} ===`);
  say(`  ※미구현으로 남긴 것: **서버 바위 파괴 이벤트**(§A-6). 생기면 ⓓ 판정이 뒤집혀 알려 준다.`);
  await br.close(); die(fail ? 1 : 0);
})().catch((e) => { console.error(e); die(1); });
