#!/usr/bin/env node
// === scripts/test-emptystart.js — 빈손 시작 서버 E2E ============================
//
// ★[재민 확정 2026-08-28] 재민 원문: *"지급 아이템은 없어야 할 거 같은데"* ·
//   *"돌멩이를 줍고 나뭇가지를 줍고"*.
//   설계 근거는 온보딩 캐논 §9 — **"나루터에서 온 이방인"은 빈손으로 배고픈 채 도착한다.**
//   무료 보상 세례는 결핍을 없애고, **결핍이 첫 30분의 엔진**이다.
//
// ★★이 하네스가 지키는 것 둘:
//   ① **지급이 정말 없는가** — 그리고 **재접속으로 되살아나지 않는가**.
//      (§0 실측: 옛 지급 조건은 "신규"가 아니라 **"도구가 하나도 없으면"**이라 매 접속 되살아났다.
//       그래서 이 절은 소스 검사로 끝내지 않고 **실제로 두 번 접속해서** 본다.)
//   ② **빈손이 성립하는가** — 맨손으로 줍고, 조잡한 석기를 엮고, 그게 **명확히 나쁜가**.
//      나쁘지 않으면 마을 장인 경제가 죽는다(듀랑고의 자급자족 병) — ⑥이 그 방지선을 잰다.
//
// ★★족보 준수: 픽스처가 검사 대상을 우회로 만들지 않는다 —
//   ①②는 **`__e2e_give` 를 쓰지 않고** 맨몸으로 접속해 본다(줬다가 "빈손"을 재면 아무것도 안 잰다).
//   ④만 픽스처로 물건을 준 뒤 **재접속으로 살아남는지**를 본다(그게 "기존 소지품 불변"의 뜻이다).
//
// 실행: node scripts/test-emptystart.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/es-central-${process.pid}.db`, ZDB = `/tmp/es-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 300) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function openSession(token) {
  const url = `ws://localhost:${ZPORT}` + (token ? `?guest_token=${encodeURIComponent(token)}` : '');
  const s = { ws: new WS(url), pid: null, playerId: null, guestToken: null,
              inv: null, tools: null, welcomed: false, notices: [] };
  s.ws.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.type === 'welcome') {
      s.welcomed = true; s.pid = m.pid; s.playerId = m.playerId || null; s.guestToken = m.guestToken || null;
      if (m.inventory) s.inv = { ...m.inventory };
      if (m.toolItems) s.tools = m.toolItems.slice();
      if (m.self && m.self.toolItems) s.tools = m.self.toolItems.slice();
    } else if (m.type === 'inventory') { s.inv = { ...m.inventory }; }
    else if (m.type === 'tools') { s.tools = (m.toolItems || []).slice(); }
    else if (m.type === 'notice') { s.notices.push(m.text); }
  });
  s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
  s.close = () => { try { s.ws.close(); } catch (e) {} };
  s.ready = new Promise((res, rej) => { s.ws.on('open', res); s.ws.on('error', rej); });
  return s;
}
async function waitWelcome(s, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (s.welcomed) return true; await sleep(100); }
  return false;
}
const invSum = (inv) => Object.entries(inv || {}).filter(([k]) => !['floor', 'tribe_id', 'sim', 'kind'].includes(k))
  .reduce((n, [, v]) => n + (Number(v) || 0), 0);

(async () => {
  say('\n=== 빈손 시작 (서버 정본 E2E) ===');

  // ═══ 0. 소스 — 지급 코드가 정말 없는가 ════════════════════════════════════
  say('\n⓪ 소스 — 지급 코드가 남아 있지 않은가');
  {
    const z = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(!/ensureStart/.test(z), '★★⓪ `ensureStart`(톱·망치·도끼 지급)가 **없다**');
    ok(!/inventory\.plank\s*=\s*10/.test(z), '★★⓪ 판자 10장 지급이 **없다**');
    // ★자명 통과 금지 — 대신 들어선 것(줍기·조잡 석기)은 살아 있어야 한다
    ok(/tryForage/.test(z) && /crude_axe/.test(z), '★★⓪ 자명 통과 금지 — 대체 경로(맨손 채집·조잡 석기)는 **살아 있다**');
  }

  // ═══ 실서버 — 진짜로 접속해 본다 ══════════════════════════════════════════
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  // ═══ ① 신규 → 빈손 ════════════════════════════════════════════════════════
  say('\n① 새로 들어온 사람은 빈손인가');
  const A = openSession(null);
  await A.ready;
  ok(await waitWelcome(A), '★전제 — 새 손님이 입장했다');
  await sleep(1500);
  say(`    입장 직후 인벤: ${JSON.stringify(A.inv)} · 도구: ${JSON.stringify(A.tools)}`);
  ok(invSum(A.inv) === 0, '★★① **인벤이 비었다** — 지급 0', `합계 ${invSum(A.inv)}`);
  ok(!A.tools || A.tools.length === 0, '★★① **도구가 없다** — 톱·망치·도끼 지급 0',
    A.tools ? `${A.tools.length}개` : '없음');
  const token = A.guestToken, pidA = A.playerId;
  ok(!!token, '★전제 — 영속 게스트 신원을 받았다(재접속 검사를 하려면 필요)', token ? '토큰 있음' : '없음');

  // ═══ ② 재접속해도 지급이 되살아나지 않는가 ═══════════════════════════════
  //   ★★§0 실측: 옛 조건은 "도구가 하나도 없으면"이라 **매 접속** 되살아났다.
  //     지금은 도구가 0 인 채로 다시 들어와도 아무것도 안 생겨야 한다 — 그게 이 절의 전부다.
  say('\n② 도구 0 인 채로 다시 들어와도 지급이 안 되살아나는가');
  A.close();
  await sleep(1200);
  const B = openSession(token);
  await B.ready;
  ok(await waitWelcome(B), '★전제 — 같은 토큰으로 재접속했다');
  await sleep(1500);
  ok(B.playerId === pidA, '★전제 — 같은 영속 신원이다', `${pidA} vs ${B.playerId}`);
  say(`    재접속 인벤: ${JSON.stringify(B.inv)} · 도구: ${JSON.stringify(B.tools)}`);
  ok(invSum(B.inv) === 0, '★★② 재접속해도 **인벤이 여전히 비어 있다**', `합계 ${invSum(B.inv)}`);
  ok(!B.tools || B.tools.length === 0, '★★② 재접속해도 **도구가 안 생긴다**(옛 무한 수도꼭지 봉쇄)',
    B.tools ? `${B.tools.length}개` : '없음');

  // ═══ ④ 기존 소지품은 불변 ═════════════════════════════════════════════════
  say('\n④ 이미 가진 사람의 물건은 그대로인가');
  B.send({ type: '__e2e_give', items: { wood: 7, stone: 3 }, tools: ['axe'] });
  await sleep(1600);
  const invBefore = { ...B.inv }, toolsBefore = (B.tools || []).length;
  ok((invBefore.wood | 0) === 7 && toolsBefore === 1, '★전제 — 물건과 도구를 갖게 됐다',
    `나무 ${invBefore.wood} · 도구 ${toolsBefore}`);
  B.close();
  await sleep(1200);
  const C = openSession(token);
  await C.ready;
  ok(await waitWelcome(C), '★전제 — 세 번째 접속');
  await sleep(1500);
  say(`    재접속 인벤: ${JSON.stringify(C.inv)} · 도구 ${(C.tools || []).length}개`);
  ok((C.inv.wood | 0) === 7 && (C.inv.stone | 0) === 3, '★★④ **가진 물건이 그대로 살아남았다**',
    `나무 ${C.inv.wood} · 돌 ${C.inv.stone}`);
  ok((C.tools || []).length === 1, '★★④ 가진 도구도 그대로다 — **더 늘지도 않았다**', `${(C.tools || []).length}개`);
  C.close();
  await sleep(600);
  shutdown();
  await sleep(1500);

  // ═══ 인프로세스 — 줍기·제작·효율 ═════════════════════════════════════════
  const TMP = `/tmp/es-inproc-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(36200 + (process.pid % 190));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const H = Zone.__testBind();

  function mkPlayer(name) {
    const msgs = [];
    const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
    const p = { pid: 'p_' + name, playerId: 'es_' + name, name, persistent: false,
      x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
      inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
      oreLedger: {}, oreCarry: {}, ws, isNpc: false, isDown: false, vx: 0, vy: 0 };
    p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
    return p;
  }

  // ═══ ③ 맨손 기초 동사 ═════════════════════════════════════════════════════
  say('\n③ 맨손으로 되는가 — 채집원·게이트·고갈');
  let forageSpots = null;
  {
    const F = H.Forage;
    const p0 = mkPlayer('scan');
    const ctx = H._forageCtx(p0);
    // ⓐ 채집원이 **세계에 실재하는가** — 지도를 훑어 세 종류를 다 찾는다.
    //    ★[족보 (56)] 분포부터 잰다. 1차 실장은 죽은 지형 신호(`stoneMult` 어디서나 1.00)를 읽어
    //      **풀이 한 번도 안 나왔다** — 규칙이 조용히 한쪽으로만 답하고 있었다.
    const found = { twig: null, pebble: null, fiber: null };
    const seen = { twig: 0, pebble: 0, fiber: 0, none: 0 };
    for (let i = 0; i < 4000; i++) {
      const x = 2000 + (i * 977) % 58000, y = 2000 + (i * 1361) % 58000;
      if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;      // 못 서는 자리는 뺀다
      const src = F.sourceAt(x, y, ctx);
      if (!src) { seen.none++; continue; }
      seen[src.kind]++;
      if (!found[src.kind]) found[src.kind] = { x, y, src };
    }
    const tot = seen.twig + seen.pebble + seen.fiber + seen.none;
    say(`    채집원 분포(설 수 있는 자리 ${tot}): 잔가지 ${seen.twig} · 자갈 ${seen.pebble} · 풀 ${seen.fiber} · 없음 ${seen.none}`);
    ok(found.twig && found.pebble && found.fiber,
      '★★③ 세 재료가 **다 실재한다**(하나라도 0 이면 조잡한 석기를 못 만든다)',
      Object.entries(seen).map(([k, v]) => `${k} ${v}`).join(' '));
    ok(seen.none > 0, '★③ 그리고 **아무 데서나 나오진 않는다** — "어디서 주울까"가 판단이 된다',
      `${(100 * seen.none / tot).toFixed(0)}% 는 빈 땅`);
    forageSpots = found;
    // ⓑ 실제로 채집된다 + **개체별로** 마른다(전역 공유 풀이 아니다)
    const p = mkPlayer('forage');
    const spot = found.pebble || found.twig || found.fiber;
    p.x = spot.x; p.y = spot.y;
    H.tryForage(p);
    const got = Object.entries(p.inventory).filter(([, v]) => v > 0);
    ok(got.length === 1 && got[0][1] === 1, '★★③ **맨손으로 실제로 채집된다**', got.map(([k, v]) => `${k} ${v}`).join(' '));
    p._forageAt = 0; H.tryForage(p); p._forageAt = 0; H.tryForage(p);
    p._forageAt = 0; H.tryForage(p); p._forageAt = 0; H.tryForage(p);   // 상한(4)을 넘겨 훑는다
    const total = Object.values(p.inventory).reduce((a, b) => a + b, 0);
    ok(total === F.CFG.CAP, '★★③ 한 개체는 **정해진 양만** 품는다 — 훑으면 마른다',
      `${total} = 상한 ${F.CFG.CAP}`);
    ok(/다 훑었다/.test(p.__notices().slice(-1)[0] || ''), '★③ 마르면 그렇다고 말해 준다',
      (p.__notices().slice(-1)[0] || '').slice(0, 40));
    // ⓒ ★★반독점 — **옆 개체는 멀쩡하다**(전역 공유 풀이면 여기서 같이 말라야 한다)
    const other = Object.values(found).find((f) => f && f.src.key !== spot.src.key);
    if (other) {
      const q = mkPlayer('forage2');
      q.x = other.x; q.y = other.y;
      H.tryForage(q);
      ok(Object.values(q.inventory).reduce((a, b) => a + b, 0) === 1,
        '★★★③ **반독점** — 한 자리를 말려도 옆 개체는 멀쩡하다(전역 공유 풀 아님)',
        `${other.src.where} 에서 1 획득`);
    }
    // ⓓ 시간이 지나면 **다시 자란다**(분 단위 리필 — 시작 재료는 희귀해질 이유가 없다)
    const k = spot.src.key, now = Date.now();
    ok(F.left(k, now) < 0.01, '★전제 — 지금은 말라 있다', `${F.left(k, now).toFixed(2)}`);
    ok(F.left(k, now + F.CFG.REFILL_MIN * 60000) >= F.CFG.CAP - 1e-6,
      '★★③ **분 단위로 다시 찬다**(편재성 캐논 — 시작 재료는 귀해지지 않는다)',
      `${F.CFG.REFILL_MIN}분 뒤 ${F.left(k, now + F.CFG.REFILL_MIN * 60000).toFixed(1)}/${F.CFG.CAP}`);
    // ⓔ 채집은 도구가 **필수가 아니다**(§0-ⓑ 실측: 맨손 1, 도구 3 — 게이트가 아니라 가속)
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(/let dmg = 1;/.test(zsrc), '★★③ 채집 기본 피해가 **1**이다 — 도구 없이도 캔다(도구는 가속기)');
    ok(!/groundItems\.set\([^)]*forage|scatter/i.test(zsrc), '★③ **낙하물 스캐터가 없다** — 땅에 아이템을 흩뿌리지 않는다');
  }

  // ═══ ⑤ 조잡한 석기 ════════════════════════════════════════════════════════
  say('\n⑤ 조잡한 석기 — 만들어지고, 쓰이고, 부서지는가');
  {
    const R = H.RECIPES, TE = H.TOOL_EFFECTS, TD = H.TOOL_MAX_DURABILITY;
    ok(!!R.crude_axe && !!R.crude_pick && !!R.crude_blade, '★전제 — 조잡한 석기 레시피가 있다',
      Object.keys(R).filter((k) => R[k].crude).join(' '));
    const cost = R.crude_axe.cost;
    ok(Object.keys(cost).every((k) => ['pebble', 'twig', 'fiber'].includes(k)),
      '★★⑤ 재료가 **주운 것뿐**이다 — 나무도 돌괴도 필요 없다', JSON.stringify(cost));
    const p = mkPlayer('crude');
    // 재료를 **직접 채집해서** 모은다(픽스처로 주면 "주워서 만든다"를 안 재게 된다).
    //   ★한 개체는 상한(4)까지만 품으므로, 모자라면 **다른 자리로 걸어간다** — 그게 이 층의 리듬이다.
    H.Forage.reset();
    let guard = 0;
    while (guard++ < 400) {
      const need = Object.keys(cost).find((k) => (p.inventory[k] || 0) < cost[k]);
      if (!need) break;
      const spot = forageSpots[need];
      if (!spot) break;
      // 같은 종류의 다른 자리를 찾아 옮긴다(한 자리는 금방 마른다)
      const ctx = H._forageCtx(p);
      for (let i = guard * 37; i < guard * 37 + 600; i++) {
        const x = 2000 + (i * 977) % 58000, y = 2000 + (i * 1361) % 58000;
        if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
        const src = H.Forage.sourceAt(x, y, ctx);
        if (src && src.kind === need && H.Forage.left(src.key, Date.now()) >= 1) { p.x = x; p.y = y; break; }
      }
      p._forageAt = 0;                            // 쿨다운만 건너뛴다(기다리는 게 검사 대상이 아니다)
      H.tryForage(p);
    }
    ok(Object.entries(cost).every(([k, v]) => (p.inventory[k] || 0) >= v),
      '★★⑤ **주워서** 재료를 다 모았다', Object.entries(cost).map(([k, v]) => `${k} ${p.inventory[k]}/${v}`).join(' '));
    H.doCraft(p, 'crude_axe');
    const inst = (p.toolItems || [])[0];
    ok(!!inst && inst.type === 'crude_axe', '★★⑤ **맨손으로 조잡한 돌도끼를 만들었다**(시설 없이)',
      inst ? `내구 ${inst.d}/${inst.max}` : (p.__notices().slice(-1)[0] || '실패'));
    if (!inst) { say('    ⚠제작 실패 — 아래 장착·파손 절은 잴 게 없어 건너뛴다(자명 통과 방지)'); }
    // 사이값 — 맨손 < 조잡 < 정품
    const bare = 1, crude = TE.crude_axe.gatherWoodMult, proper = TE.axe.gatherWoodMult;
    say(`    나무 채집 배수: 맨손 ${bare} · 조잡 ${crude} · 정품 ${proper}`);
    ok(crude > bare && crude < proper, '★★⑤ 조잡본은 **맨손보다 낫고 정품보다 못하다**',
      `${bare} < ${crude} < ${proper}`);
    ok(TD.crude_axe < TD.axe, '★★⑤ 그리고 **금방 닳는다**', `내구 ${TD.crude_axe} vs 정품 ${TD.axe}`);
    // 장착 → 내구 소진 → 파손 → 재제작
    if (inst) {
    H.doEquip(p, inst.id);
    ok(H.getEquippedTool(p) && H.getEquippedTool(p).id === inst.id, '★⑤ 장착된다');
    for (let i = 0; i < TD.crude_axe + 2 && (p.toolItems || []).length; i++) H.consumeEquippedDurability(p, 1);
    ok((p.toolItems || []).length === 0, '★★⑤ 다 쓰면 **부서져 사라진다**(재제작 루프)',
      `${(p.toolItems || []).length}개 남음`);
    ok(p.__notices().some((t) => /깨짐/.test(t)), '★⑤ 부서졌다고 알려 준다');
    // 재제작 — 재료만 있으면 다시 만든다
    p.inventory.pebble = (p.inventory.pebble || 0) + cost.pebble;
    p.inventory.twig = (p.inventory.twig || 0) + cost.twig;
    p.inventory.fiber = (p.inventory.fiber || 0) + cost.fiber;
    H.doCraft(p, 'crude_axe');
    ok((p.toolItems || []).length === 1, '★★⑤ **다시 만들 수 있다** — 그게 이 층의 리듬이다');
    }
  }

  // ═══ ⑥ 자급 병 방지선 — 자작 vs 구매 ═════════════════════════════════════
  say('\n⑥ 자작 vs 구매 — 정품이 실제로 나은가(자급자족 병 방지선)');
  {
    const TE = H.TOOL_EFFECTS, TD = H.TOOL_MAX_DURABILITY;
    const rate = { 맨손: 1, 조잡: TE.crude_axe.gatherWoodMult, 정품: TE.axe.gatherWoodMult };
    // 장인 정품(장비 슬롯) — 마을 품질 EMA 0.6 기준으로 **정본 함수**가 만든 인스턴스의 효율
    let artisan = null;
    try { artisan = H.PlayerItems.materializeFromVillage('tool', 0.6, () => 0.5); } catch (e) {}
    const artisanBonus = artisan && artisan.attrs && artisan.attrs.efficiency
      ? Math.round(artisan.attrs.efficiency * H.TOOL_EQUIP_EFF_SCALE) : 0;
    rate['정품+장인장비'] = rate.정품 + artisanBonus;
    const life = { 조잡: rate.조잡 * TD.crude_axe, 정품: rate.정품 * TD.axe };
    say(`    한 번 두드릴 때: ${Object.entries(rate).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    say(`    도구 한 자루가 평생 하는 일: 조잡 ${life.조잡} · 정품 ${life.정품} (×${(life.정품 / life.조잡).toFixed(1)})`);
    ok(rate.정품 > rate.조잡, '★★⑥ **시간당 산출은 정품이 낫다**', `${rate.조잡} → ${rate.정품}`);
    ok(life.정품 > life.조잡 * 2, '★★⑥ **도구 한 자루가 평생 하는 일은 정품이 몇 배**다 — 자급으로 버티면 손해다',
      `×${(life.정품 / life.조잡).toFixed(1)}`);
    ok(artisanBonus > 0, '★⑥ 장인 장비는 그 위에 또 얹힌다(살 이유가 남는다)', `+${artisanBonus}`);
    // ★손잡이가 실제로 걸려 있다(0 이면 위 부등식이 공짜다)
    ok(H.CRUDE_EFF_FRAC > 0 && H.CRUDE_EFF_FRAC < 1 && H.CRUDE_DURA_FRAC > 0 && H.CRUDE_DURA_FRAC < 1,
      '★⑥ 손잡이가 살아 있다', `EFF ${H.CRUDE_EFF_FRAC} · DURA ${H.CRUDE_DURA_FRAC}`);
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm', CDB, ZDB]) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
