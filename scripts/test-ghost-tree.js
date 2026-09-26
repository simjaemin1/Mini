#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-ghost-tree.js — 뺀 나무가 다시 방송되나 (T393) ===========================
//
// ★왜 [T378 §1-5 → T393 ②] T378 보고가 **코드로만** 읽은 것: 자원을 세계에서 빼는 문들이
//   `resourcesByDbId`(DB 행 → 개체 · 중복 적재 방지 표)에서 그 나무를 **안 뺀다**. 그런데
//   `_shapePlantedAll` 은 그 표를 돌며 심은 나무의 단계를 정산하고, 단계가 바뀌면
//   `resource_spawn` 을 **방송한다** ⇒ 이미 뺀 나무가 클라에만 다시 선다(서버엔 없다 · 유령).
//   카드: *"재현 먼저 — 하네스로 유령을 세운다 · 재현되면 두 문에 같은 한 줄 · 안 오면 왜 한 줄로 끝."*
//
// ★재는 것 — 문 **셋**(카드는 둘을 불렀고, 재 보니 플레이어 채집이 제 몸을 따로 가졌다):
//   ⓐ 플레이어 채집 `tryGather` → `gatherResource`   ⓑ 문 하나 `_takeResourceEntity`(NPC 채집·나무꾼)
//   ⓒ 개간 `clearTreesInCells`(T378)
//   심은 묘목을 그 문으로 뺀 뒤 → 시계를 **성목이 되는 날**까지 돌리고(`__e2e_clock` · 이미 있는 손잡이)
//   → 플레이어를 멀리 옮겨 **청크를 새로 켠다**(`activateChunk` → `_shapePlantedAll` — 제품이 부르는 그 자리)
//   → 그 id 의 `resource_spawn` 이 다시 오나.
// ★자명 통과 금지 — 대조: 안 뺀 심은 묘목은 성목이 되며 `resource_spawn` 이 **와야 한다**(방송이 산다는 증거).
//   그리고 고치기 전 코드에서 ⓐⓑ 가 **빨갰다**(보고/T393 §0-ⓑ 에 그 실행을 적었다 — 손잡이가 없으므로
//   소스를 되돌려 확인한다).
//
// ⚠존을 **이 프로세스 안에서** 띄운다(`test-regrow ⑦` 과 같은 문법 · `Zone.__testBind`).
// 실행: node scripts/test-ghost-tree.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 정본(사본 0)

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n=== 뺀 나무가 다시 방송되나 — 유령 나무 (T393) ===\n');
  const TMP = `/tmp/test-ghost-tree-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(38900 + (process.pid % 500));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.E2E_GIVE = '1';                        // `__e2e_clock` 분기(테스트 전용 · 이미 있는 손잡이)
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  //   존의 말(`[hanbando] …` · central 저장 실패 따위)은 걸러 낸다 — 이 하네스의 줄만 남긴다
  const _mute = (f) => (...a) => { if (typeof a[0] === 'string' && /^\[hanbando\]|^\s{4,}biome=/.test(a[0])) return; f(...a); };
  console.log = _mute(_l); console.warn = _mute(_w); console.error = _mute(_e);
  const H = Zone.__testBind();
  const SZ = H.BUILDING_SIZE;

  // 받는 귀 — 방송은 `players` 의 ws 로 간다(가짜 ws 는 test-regrow ⑦ 과 같은 꼴)
  const msgs = [];
  const me = { pid: 'p_ghost', playerId: 'tr_ghost', name: 'ghost', persistent: false,
    ws: { readyState: 1, send: (t) => { try { msgs.push(JSON.parse(t)); } catch (e) {} } },
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {},
    isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  H.players.set(me.pid, me);
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  const spawnsOf = (id, from) => msgs.slice(from).filter((m) => m.type === 'resource_spawn' && m.resource && m.resource.id === id).length;

  // 자리 — 걸을 수 있고 자원·건물이 없는 셀을 **세계에 물어서** 고른다(족보 73)
  const taken = new Set();
  const freeCellNear = (x0, y0) => {
    for (let r = 0; r <= 60; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r]]) {
      const px = Math.floor((x0 + dx * SZ) / SZ) * SZ + SZ / 2, py = Math.floor((y0 + dy * SZ) / SZ) * SZ + SZ / 2;
      const k = Math.floor(px / SZ) + ',' + Math.floor(py / SZ);
      if (taken.has(k) || H.isTerrainBlockedLocal(px, py)) continue;
      let busy = false;
      for (const rr of H.resources.values()) if (Math.floor(rr.x / SZ) === Math.floor(px / SZ) && Math.floor(rr.y / SZ) === Math.floor(py / SZ)) { busy = true; break; }
      if (busy) continue;
      for (const b of H.buildings.values()) if (Math.floor(b.x / SZ) === Math.floor(px / SZ) && Math.floor(b.y / SZ) === Math.floor(py / SZ)) { busy = true; break; }
      if (busy) continue;
      taken.add(k);
      return { x: px, y: py };
    }
    return null;
  };
  const plant = (spot) => {
    me.x = spot.x; me.y = spot.y;
    me.inventory.acorn = (me.inventory.acorn || 0) + 1;
    return H.tryPlantTree(me, spot.x, spot.y, 'acorn');
  };
  // 성목까지 며칠 — **정본에게 묻는다**(종 햇수 `Trees.stageYearsOf` × 한 해 `yearDaysOf`) · 하네스가 수를 안 적는다
  const TR = require(path.join(ROOT, 'server', 'trees.js'));
  const RG = require(path.join(ROOT, 'server', 'chunk.js')).REGROW;
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const sp = H.PLANT_SEEDS.acorn;
  const g = TR.stageYearsOf(sp, RG.TREE_STUMP_Y(), RG.TREE_FULL_Y());
  const NEED = Math.ceil((g[1] - g[0]) * YD) + 1;
  pre(NEED > 0 && Number.isFinite(NEED), `묘목 → 성목 ${NEED} 게임일(종 ${sp} · ${g[0].toFixed(2)} → ${g[1]}년 · 한 해 ${YD}일 — 정본)`);
  // 청크를 새로 켠다 — 플레이어를 멀리 옮기면 틱이 `activateChunk` 를 부르고 그 안에서 `_shapePlantedAll` 이 돈다
  let hop = 0;
  const activate = async () => {
    hop++;
    me.x = 20000 + (hop % 2) * 9000; me.y = 20000 + (hop % 2) * 9000;
    await sleep(2500);
  };

  // ── ① 심는다 — 넷(대조 · 문 ⓐ · 문 ⓑ · 문 ⓒ) ─────────────────────────────
  const D0 = 1000;
  clock(D0);
  pre(H.gameDayNow() === D0, `시계를 세웠다 — gameDayNow() = ${H.gameDayNow()}`);
  const base = { x: 30000, y: 60000 };
  const T = {};
  for (const k of ['ctl', 'a', 'b', 'c']) {
    const s = freeCellNear(base.x + Object.keys(T).length * 8 * SZ, base.y);
    T[k] = s ? plant(s) : null;
  }
  pre(Object.values(T).every((t) => t && t.type === 'sapling' && t.dbId && H.resourcesByDbId.has(t.dbId)),
    '심은 묘목 넷 — DB 행 · `resourcesByDbId` 에 있다', Object.entries(T).map(([k, t]) => `${k}#${t && t.id}`).join(' '));
  if (!Object.values(T).every((t) => t)) { console.log(`\n=== FAIL (전제) ===\n`); process.exit(1); }

  // ── ② 뺀다 — 문 ⓐ 플레이어 채집 · 문 ⓑ 문 하나 ──────────────────────────
  {
    const t = T.a; me.x = t.x; me.y = t.y;
    for (let i = 0; i < 20 && H.resources.has(t.id); i++) H.tryGather(me, t.id);
    pre(!H.resources.has(t.id), 'ⓐ 플레이어 채집이 묘목을 뺐다(서버 세계에 없다)');
  }
  H._takeResourceEntity(T.b, true);
  pre(!H.resources.has(T.b.id), 'ⓑ 문 하나(`_takeResourceEntity`)가 묘목을 뺐다');

  // ── ③ 성목이 되는 날까지 → 청크를 켠다 ──────────────────────────────────
  const m0 = msgs.length;
  clock(D0 + NEED);
  await activate();
  const ctlSeen = spawnsOf(T.ctl.id, m0);
  ok(ctlSeen >= 1, '★ⓞ 대조 — **안 뺀** 심은 나무는 성목이 되며 `resource_spawn` 이 온다(이 귀가 방송을 듣는다)', `${ctlSeen}번`);
  for (const k of ['a', 'b']) {
    const t = T[k];
    ok(!H.resourcesByDbId.has(t.dbId), `★★${k === 'a' ? 'ⓐ 플레이어 채집' : 'ⓑ 문 하나'} — 뺀 나무가 \`resourcesByDbId\` 에서도 빠졌다`,
      H.resourcesByDbId.has(t.dbId) ? '남았다' : '');
    const n = spawnsOf(t.id, m0);
    ok(n === 0 && !H.resources.has(t.id), `★★${k === 'a' ? 'ⓐ 플레이어 채집' : 'ⓑ 문 하나'} — 뺀 나무의 \`resource_spawn\` 이 **다시 안 온다**(유령 0)`,
      n ? `유령 ${n}번 — 서버 세계엔 없다(resources.has=${H.resources.has(t.id)})` : '');
  }

  // ── ④ 개간 — 성목만 벤다(T378 문법) ⇒ 먼저 자란 뒤에 벤다 ───────────────
  {
    const t = T.c;
    pre(t.type === 'tree', `ⓒ 개간 대상은 성목이다 — ③ 에서 자랐다(${t.type})`);
    const cell = Math.floor(t.x / 32) + ',' + Math.floor(t.y / 32);
    const n0 = H.clearTreesInCells(new Set([cell]));
    pre(!H.resources.has(t.id), `ⓒ 개간이 그 셀의 성목을 뺐다(${n0}그루)`);
    ok(!H.resourcesByDbId.has(t.dbId), '★★ⓒ 개간 — 뺀 나무가 `resourcesByDbId` 에서도 빠졌다',
      H.resourcesByDbId.has(t.dbId) ? '남았다' : '');
    const m1 = msgs.length;
    clock(D0 + NEED * 3);
    await activate();
    const n = spawnsOf(t.id, m1);
    ok(n === 0, '★ⓒ 개간 — 시계를 더 돌려도 뺀 나무의 `resource_spawn` 이 안 온다', n ? `유령 ${n}번` : '');
  }

  // ── ⑤ 문이 하나다 — 빼는 몸을 세 자리에 따로 적지 않는다(사본 0) ─────────
  {
    const Z = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const body = (name) => { const i = Z.indexOf(`function ${name}(`); if (i < 0) return ''; const j = Z.indexOf('\nfunction ', i + 10); return Z.slice(i, j < 0 ? undefined : j); };
    const take = body('_takeResourceEntity'), gath = body('gatherResource'), clr = body('clearTreesInCells');
    ok(/resourcesByDbId\.delete\(/.test(take), '★⑤ 그 한 줄(`resourcesByDbId.delete`)은 **문 하나** `_takeResourceEntity` 안에 있다');
    ok(/_takeResourceEntity\(/.test(gath) && !/resources\.delete\(/.test(gath),
      '★⑤ 플레이어 채집은 제 몸 대신 **그 문**을 부른다(`resources.delete` 사본 0)');
    ok(/_takeResourceEntity\(/.test(clr) && !/resources\.delete\(/.test(clr),
      '★⑤ 개간도 **그 문**을 부른다(`resources.delete` 사본 0)');
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
