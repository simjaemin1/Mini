#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1120-next-tool.js — T1120: 「지금 할 일」이 촌장 문 밖에서도 다음 막힘(돌 · 곡괭이 · 급조 돌괭이)을 말한다 ==========
//
// ★왜 [카드 T1120 · 보고/T1093] 첫 30분 실기 막힘 셋 중 둘이 돌이었다 — 곡괭이(나무 3 · 돌 5)에 드는 바위를 도구 문(T1065)이 막는데
//   급조 돌괭이 길을 몰라 6분을 걸었고, 세 막힘 자리 모두 「지금 할 일」은 "마을로 들어가기"였다.
//   고침(손잡이 `T1120_NEXT_TOOL` · 켬 기본 후보 · `=0` = 종전 바이트):
//     서버 — 도구 · 재료가 모자라 거절한 알림에 `need` 칸 하나({verb} · {tool} · {craft}) · welcome `uiCfg.nextTool`(도구 문 표 · 재료 → 그 일) ·
//            ② 맨손 E 가 도구 문에 걸린 자연물 곁에서 줍기로 빠지면 그 자리에서 이유(T1065 문장) 한 번
//     클라 — `70-lobby.js` `onbToolPlan`(순수) · `onbNeedNote` · `onbNeedPick` — 거절된 막힘을 표 · 레시피 · 짐으로 한 칸씩 잇는다
//
// ★이 하네스가 재는 것(진짜 서버 함수 · 제품 클라 글자 그대로):
//   ① 글자 — 손잡이 · welcome 칸 · 거절 자리 여섯 · ② 갈래 · 클라 걸이(30-n-net)
//   ② 켬 — 거절 알림마다 `need` 칸(문장 · stop 그대로) · ② 바위 곁 맨손 E = 자갈 줍기 그대로 + 이유 한 번(반복 E 에 안 쌓인다 · 문이 열리면 다시)
//   ③ 끔 — `need` 칸 0 · ② 한 줄 0 · 알림이 켬 판에서 그 둘을 뺀 것과 바이트 같다(자명 통과 금지 대조)
//   ④ welcome 표 — 도구 문 표(`T1065_NEED`)에서 뽑은 손 도구 · 급조 도구 · 동사 · 재료 → 그 일(돌 → 채석 · 바위) · 도구 문 끔 = 빈 표
//   ⑤ 칸 사다리 — 움집(곡괭이) → 나무 · 돌 → 조잡한 돌도끼 · 돌괭이 → 자갈 · 잔가지 · 풀 / 손에 들기 / 바위 채굴 / 곡괭이 만들기 / 풀림
//      · 칸 문장 = 서버 거절 문장(T1065) 그대로 + 지금 가진 것
//   ⑥ 말투 — 할 일 명사형 · 설명 하십시오체 · 기호 나열 · 이모지 0 · 단축키 뒤 "키로"
//   ⑦ 새 수 0 — 칸 함수 몸 수 글자 0 · 1 뿐 · 레시피를 바꾸면 글자가 따라간다
//   ⑧ 쌓기 · 풀기 · 그리기 — 거절 둘(움집 → 채석)이 쌓이고 돌괭이를 들면 앞 막힘(곡괭이)으로 돌아간다 · 끔 = 안 쌓인다 · 「마을로 들어가기」 앞에 선다
//   ⑨ 돌연변이 — 사다리 · 풀림 · ② 갈래를 걷어 낸 글자면 위 판정이 빨갛다
//
// 실행: node scripts/test-t1120-next-tool.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─────────────────────────────── 아이 — 한 판 서버 알림 JSON 한 줄 ───────────────────────────────
if (process.env.T1120_CHILD === '1') {
  const TMP = `/tmp/test-t1120-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(42000));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.LATENCY_MS = '0';
  process.env.FISH_TICK_MS = '999000';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  let Zone;
  if (process.env.T1120_MUT === 'tell') {   // ⑨ 서버 돌연변이 — ② 갈래 한 줄을 걷은 글자를 같은 파일 이름으로 올린다(상대 require 그대로)
    const fn = path.join(ROOT, 'server', 'zone.js');
    const src = fs.readFileSync(fn, 'utf8').replace(' if (refused) _t1120Tell(player, refused.r);', '');
    const mod = new Module(fn, null); mod.filename = fn; mod.paths = Module._nodeModulePaths(path.dirname(fn));
    mod._compile(src, fn);
    Zone = mod.exports;
  } else Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  let _pid = 0, _mid = 0;
  const mkPlayer = (x, y) => {
    const notices = [];
    const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notices.push(o); } catch (e) {} } };
    return { pid: `t1120p${++_pid}`, playerId: `t1120_${_pid}`, name: '빈손', ws, x, y, floor: 0, inventory: {}, toolItems: [], equipment: [], equipSlots: {},
      equipped: null, hotkey1: null, tribeId: null, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, craftSkill: {}, lastAttackAt: 0, lastRangedAt: 0,
      vp: 0, isDown: false, persistent: false, notices };
  };
  const give = (p, inv) => { for (const [k, v] of Object.entries(inv)) p.inventory[k] = (p.inventory[k] || 0) + v; };
  const make = (p, name) => { give(p, H.RECIPES[name].cost); H.doCraft(p, name); return p.toolItems.find((t) => t.type === name) || null; };
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const ZB = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando.biome;
  const pool = [];
  for (let k = 0; k < 60; k++) for (const r of (CH.generateChunkResources('hanbando', ZB, k, k, CH.CHUNK_SIZE, new Set(), 0) || [])) pool.push(r);
  const put = (r) => { if (!H.resources.has(r.id)) H.resources.set(r.id, r); return r; };
  const resOf = (type) => pool.filter((r) => r.type === type && r.hp > 0);
  const out = { knob: H.T1120_NEXT_TOOL, gate: H.T1065_TOOL_GATE, cfg: H.T1120_NEXT_TOOL ? H._t1120Cfg() : null, n: {} };
  const take = (p) => p.notices.splice(0);
  // ── 거절 자리 — 맨손 바위 · 나무(지목) · 공격 · 낚시 · 제작 · 움집 터파기 · 활 ──
  {
    const r = put(resOf('rock')[0]); const p = mkPlayer(r.x + 10, r.y); H.gatherResource(p, r); out.n.rock = take(p);
    const t = put(resOf('tree')[0]); const q = mkPlayer(t.x + 10, t.y); H.gatherResource(q, t); out.n.tree = take(q);
  }
  {
    H.mobs.clear();
    const type = Object.keys(H.MOB_DEFS).find((k) => !H.MOB_DEFS[k].tameFood && H.MOB_DEFS[k].maxHp >= 40) || 'deer';
    const p = mkPlayer(5000, 5000);
    H.mobs.set(`t1120m${++_mid}`, { mid: `t1120m${_mid}`, type, x: p.x + 20, y: p.y, z: 0, floor: 0, hp: 40, maxHp: H.MOB_DEFS[type].maxHp,
      tameOwner: null, tameOwnerName: null, tameProgress: 0, aggroTarget: null, dirty: false });
    H.tryAttack(p); out.n.attack = take(p);
    H.tryRangedAttack(p, p.x + 100, p.y); out.n.ranged = take(p);
    H.mobs.clear();
  }
  {
    let p = null;
    for (let i = 0; i < 4000 && !p; i++) { const c = mkPlayer(1000 + (i * 977) % 60000, 1000 + (i * 1361) % 60000); if (H._castTargetFor(c)) p = c; }
    if (p) { H.tryFishCast(p); out.n.fish = take(p); } else out.n.fish = null;
  }
  { const p = mkPlayer(7000, 7000); H.doCraft(p, 'pickaxe'); out.n.craft = take(p); H.doCraft(p, 'crude_pick'); out.n.craftCrude = take(p); }
  { const p = mkPlayer(7500, 7500); p.inventory.wood = 3; H.doCraftItem(p, 'pillar'); out.n.craftItem = take(p); }   // 기둥 — 도끼가 있어야(가공 레시피 `requiresTool`)
  { const p = mkPlayer(9000, 9000); H.tryHutStart(p, p.x, p.y - 64); out.n.hut = take(p); }
  // ── ② 바위 곁 맨손 E — 줍기 갈래(바위는 건너뛴다 · 둘레 자갈) ──
  {
    const ctx = H._forageCtx(mkPlayer(0, 0));
    let spot = null;
    for (const r of resOf('rock')) {
      for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
        const x = r.x + dx, y = r.y + dy;
        if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
        if ([[32, 0], [-32, 0], [0, 32], [0, -32]].some(([ax, ay]) => ctx.isWater(x + ax, y + ay))) continue;   // 물가면 `tryGather` 가 물 갈래로 간다
        if (pool.some((e) => e !== r && Math.hypot(e.x - x, e.y - y) < 60)) continue;   // 손 닿는 다른 것이 없다(덤불이 있으면 덤불을 딴다)
        const src = H.Forage.sourceAt(x, y, ctx);
        if (src && src.kind === 'pebble' && H.Forage.left(src.key, Date.now()) >= 3) { spot = { x, y, rock: r }; break; }
      }
      if (spot) break;
    }
    if (spot) {
      put(spot.rock);
      const p = mkPlayer(spot.x, spot.y);
      const hp0 = spot.rock.hp;
      H.tryGather(p); const e1 = take(p); const inv1 = p.inventory.pebble || 0;
      p._forageAt = 0; H.tryGather(p); const e2 = take(p); const inv2 = p.inventory.pebble || 0;
      // 돌괭이를 만들어 들면 그 바위를 캔다(문이 열린다) → 내려놓고 다시 맨손 E — 이번엔 "손에 들어야" 한 번
      const inst = make(p, 'crude_pick'); take(p);
      H.doEquip(p, inst.id); take(p);
      p._forageAt = 0; H.tryGather(p); const e3 = take(p);
      H.doEquip(p, null); take(p);
      p._forageAt = 0; H.tryGather(p); const e4 = take(p);
      p._forageAt = 0; H.tryGather(p); const e5 = take(p);
      out.rockSide = { found: true, hp: [hp0, H.resources.has(spot.rock.id) ? spot.rock.hp : 'gone'], e1, e2, e3, e4, e5, inv1, inv2 };
    } else out.rockSide = { found: false };
  }
  // ── ② 숲 맨손 E — 나무를 건너뛰고 잔가지(같은 갈래 · 벌목 이유) ──
  {
    const ctx = H._forageCtx(mkPlayer(0, 0));
    let spot = null;
    for (const r of resOf('tree')) {
      for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
        const x = r.x + dx, y = r.y + dy;
        if ([[32, 0], [-32, 0], [0, 32], [0, -32]].some(([ax, ay]) => ctx.isWater(x + ax, y + ay))) continue;
        if (pool.some((e) => e !== r && e.type !== 'tree' && Math.hypot(e.x - x, e.y - y) < 60)) continue;
        const src = H.Forage.sourceAt(x, y, ctx);
        if (src && src.kind === 'twig' && H.Forage.left(src.key, Date.now()) >= 1) { spot = { x, y, tree: r }; break; }
      }
      if (spot) break;
    }
    if (spot) {
      put(spot.tree);
      for (const e of pool) if (e.type === 'tree' && e !== spot.tree && Math.hypot(e.x - spot.x, e.y - spot.y) < 60) put(e);
      const p = mkPlayer(spot.x, spot.y);
      H.tryGather(p); out.forest = { found: true, e1: take(p), inv: Object.assign({}, p.inventory) };
    } else out.forest = { found: false };
  }
  out.told = (() => { const p = mkPlayer(0, 0); return p._t1120Told === undefined; })();
  console.log = _l; console.warn = _w; console.error = _e;
  process.stdout.write('@@T1120 ' + JSON.stringify(out) + '\n');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ─────────────────────────────── 부모 — 글자 · 세 판 · 칸 ───────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const run = (env) => {
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1120_CHILD: '1' }, env), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1120 '));
  if (!line) { console.log(`  (아이 ${JSON.stringify(env)} 끝 코드 ${r.status} · ${(r.stderr || '').slice(-400)})`); return null; }
  return JSON.parse(line.slice(8));
};
console.log('\n=== T1120 「지금 할 일」 다음 막힘 — 돌 · 곡괭이 · 급조 돌괭이(`T1120_NEXT_TOOL`) ===');
const Z = rd('server/zone.js');
const SRC = rd('public/client/70-lobby.js');
const NET = rd('public/client/30-n-net.js');

sec('① 글자 — 손잡이 · welcome 칸 · 거절 자리 · ② 갈래 · 클라 걸이');
ok(/const T1120_NEXT_TOOL = process\.env\.T1120_NEXT_TOOL !== '0';/.test(Z), '서버 손잡이 — 켬 기본 후보 · `=0` 만 끔');
ok(/const _t1120N = \(need\) => \(\(T1120_NEXT_TOOL && need\) \? \{ need \} : \{\}\);/.test(Z), '알림 칸 — 끔이면 빈 칸을 펼친다(키 0 · 종전 바이트)');
ok(/\.\.\.\(T1120_NEXT_TOOL \? \{ nextTool: _t1120Cfg\(\) \} : \{\}\),/.test(Z), 'welcome `uiCfg.nextTool` — 끔이면 칸이 없다(옛 welcome)');
{
  const uses = (Z.match(/\.\.\._t1120N\(\{ (verb|tool|craft): /g) || []).map((s) => s.replace(/.*\{ /, '').replace(':', '').trim());
  ok(uses.length === 7 && uses.filter((u) => u === 'verb').length === 3 && uses.filter((u) => u === 'tool').length === 3 && uses.filter((u) => u === 'craft').length === 1,
    '거절 자리 일곱에 칸 — 도구 문 셋(채집 · 낚시 · 공격) · 가질 도구 셋(움집 터파기 · 시공 · 가공) · 만들 것 하나(제작) · 활은 안 싣는다(만들 길 없음)', JSON.stringify(uses));
}
ok(/if \(!best\) \{ tryForage\(player\); if \(refused\) _t1120Tell\(player, refused\.r\); return; \}/.test(Z), '② 줍기 갈래 — 줍기는 그대로 · 건너뛴 자연물의 이유 한 번(`_t1120Tell`)');
ok(/if \(player\._t1120Told\) player\._t1120Told\[kind\] = 0; return null;/.test(Z), '② 한 번 = 문이 열릴 때까지(`_t1065Gate` 통과 갈래가 비운다)');
ok(/if \(msg\.need && typeof onbNeedNote === 'function'\) onbNeedNote\(msg\.need\);/.test(NET), '클라 걸이 — 알림의 `need` 를 「지금 할 일」에 쌓는다(30-n-net 한 줄)');
ok(/let p = onbToolPlan\(I\) \|\| onbJoinPlan\(I, s, lot, inLot, K\);/.test(SRC), '칸 차례 — 안 풀린 막힘이 맨 먼저(그다음 T1086 · T1064 종전 차례)');

const ON = run({}), OFF = run({ T1120_NEXT_TOOL: '0' }), NOGATE = run({ T1065_TOOL_GATE: '0' }), MUT = run({ T1120_MUT: 'tell' });
ok(!!ON && !!OFF && !!NOGATE && !!MUT, '[상황] 켬 · 끔 · 도구 문 끔 · 돌연변이 네 판이 떴다', `${!!ON} · ${!!OFF} · ${!!NOGATE} · ${!!MUT}`);
const strip = (arr) => (arr || []).map((n) => { const o = Object.assign({}, n); delete o.need; return o; });
if (ON && OFF) {
  sec('② 켬 — 거절 알림마다 `need` · ② 바위 곁 맨손 E');
  const N = ON.n;
  ok(ON.knob === true && OFF.knob === false && ON.gate === true, '[상황] 손잡이가 env 대로 섰다', `${ON.knob} · ${OFF.knob}`);
  const one = (a) => (a && a.length === 1 ? a[0] : null);
  const rk = one(N.rock), tr = one(N.tree);
  ok(rk && rk.need && rk.need.verb === 'quarry' && rk.stop === 'gather' && /^조잡한 돌괭이가 있어야 돌을 캘 수 있습니다\./.test(rk.text), '★맨손 바위(지목) — 이유 한 줄 그대로 · `stop` 그대로 · `need {verb: quarry}`', JSON.stringify(rk && rk.need));
  ok(tr && tr.need && tr.need.verb === 'chop' && tr.stop === 'gather', '맨손 나무 — `need {verb: chop}`', JSON.stringify(tr && tr.need));
  const at = one(N.attack);
  ok(at && at.need && at.need.verb === 'attack' && /조잡한 돌칼이 있어야 싸울 수 있습니다/.test(at.text), '맨손 공격 — `need {verb: attack}`', JSON.stringify(at && at.need));
  ok(N.fish && one(N.fish) && one(N.fish).need && one(N.fish).need.verb === 'fish', '맨손 낚시 — `need {verb: fish}`', JSON.stringify(N.fish && one(N.fish) && one(N.fish).need));
  const rg = one(N.ranged);
  ok(rg && !('need' in rg) && /활은 아직 만들 수 없습니다/.test(rg.text), '빈손 화살 — 만들 길이 없어 `need` 를 안 싣는다(칸이 말할 길이 없다)', rg && rg.text);
  const cr = one(N.craft), cc = one(N.craftCrude);
  ok(cr && cr.need && cr.need.craft === 'pickaxe' && cc && cc.need && cc.need.craft === 'crude_pick', '재료 없는 제작 — `need {craft}`(곡괭이 · 조잡한 돌괭이)', JSON.stringify([cr && cr.need, cc && cc.need]));
  const ci = one(N.craftItem);
  ok(ci && ci.need && ci.need.tool === 'axe' && /없거나 깨졌습니다/.test(ci.text), '도끼 없는 기둥 가공 — `need {tool: axe}`(글자는 그대로)', JSON.stringify(ci && [ci.text, ci.need]));
  const hu = one(N.hut);
  ok(hu && hu.need && hu.need.tool === 'pickaxe' && /곡괭이가 있어야 합니다/.test(hu.text), '★곡괭이 없는 움집 터파기 — `need {tool: pickaxe}`', JSON.stringify(hu && hu.need));
  const S = ON.rockSide;
  ok(S.found, '[상황] 바위 곁 맨손 E 자리(물가 아님 · 손 닿는 다른 것 없음 · 둘레 자갈)가 있다');
  if (S.found) {
    ok(S.inv1 === 1 && S.e1.length === 2 && /자갈/.test(S.e1[0].text) && !('need' in S.e1[0]), '★★② 맨손 E — 줍기는 그대로(자갈 하나 · 줍기 알림 종전 꼴)', `${S.inv1} · ${S.e1[0] && S.e1[0].text}`);
    ok(S.e1[1] && S.e1[1].text === rk.text && S.e1[1].need && S.e1[1].need.verb === 'quarry' && !S.e1[1].stop, '★★② 그 자리에서 이유 한 줄(T1065 문장 그대로) · `need` · `stop` 없음(줍기는 된다 — E 반복을 안 멈춘다)', S.e1[1] && S.e1[1].text);
    ok(S.inv2 === 2 && S.e2.length === 1 && !('need' in S.e2[0]), '★② 반복 E — 이유는 한 번만(쌓지 않는다) · 줍기는 계속', `자갈 ${S.inv2} · 알림 ${S.e2.length}`);
    ok(S.e3.length === 0 || S.e3.every((n) => !/있어야/.test(n.text)), '돌괭이를 들면 그 바위를 캔다(문이 열린다)', JSON.stringify(S.e3.map((n) => n.text)));
    ok(S.e4.length === 2 && /조잡한 돌괭이를 손에 들어야 돌을 캘 수 있습니다/.test((S.e4[1] || {}).text || '') && S.e5.length === 1, '★② 문이 열렸다 닫히면 다시 한 번 — 가졌는데 안 들었으면 "손에 들어야"', JSON.stringify(S.e4.map((n) => n.text.slice(0, 24))));
  }
  ok(ON.forest.found && ON.forest.inv.twig === 1 && ON.forest.e1.length === 2 && ON.forest.e1[1].need && ON.forest.e1[1].need.verb === 'chop', '② 숲 맨손 E — 잔가지 줍기 그대로 + 벌목 이유 한 번(같은 갈래)', ON.forest.found ? JSON.stringify(ON.forest.e1.map((n) => n.text.slice(0, 20))) : '자리 없음');

  sec('③ 끔 — `need` 0 · ② 한 줄 0 · 켬 판에서 그 둘을 뺀 것과 바이트 같다');
  const all = (R) => [].concat(...Object.values(R.n).filter(Boolean), R.rockSide.found ? [].concat(R.rockSide.e1, R.rockSide.e2, R.rockSide.e3, R.rockSide.e4, R.rockSide.e5) : [], R.forest.found ? R.forest.e1 : []);
  ok(all(OFF).length > 0 && all(OFF).every((n) => !('need' in n)), '★끔 — 어느 알림에도 `need` 칸이 없다', `${all(OFF).length}통`);
  for (const k of Object.keys(ON.n)) ok(JSON.stringify(strip(ON.n[k])) === JSON.stringify(OFF.n[k]), `끔 = 켬 − need · ${k} 알림 바이트 같다`, (OFF.n[k] || []).map((n) => (n.text || '').slice(0, 18)).join(' | '));
  if (ON.rockSide.found && OFF.rockSide.found) {
    const R1 = ON.rockSide, R0 = OFF.rockSide;
    ok(R0.e1.length === 1 && JSON.stringify(R0.e1[0]) === JSON.stringify(R1.e1[0]) && R0.inv1 === 1 && R0.inv2 === 2, '★★[자명 통과 금지] 끔 — 바위 곁 맨손 E 는 줍기 한 줄뿐(종전 · 이유 0) · 자갈은 같다', `${R0.e1.length}통 · 자갈 ${R0.inv1}/${R0.inv2}`);
  }
  ok(OFF.forest.found && OFF.forest.e1.length === 1, '끔 — 숲 맨손 E 도 줍기 한 줄뿐', OFF.forest.found ? OFF.forest.e1.length : '자리 없음');
  ok(OFF.cfg === null && ON.told === true, '끔 — welcome 표를 안 짓는다 · 처음 사람에게 ② 표지가 없다');

  sec('④ welcome 표 — 도구 문 표에서 뽑는다(사본 0)');
  const C = ON.cfg || {};
  const V = C.verbs || {};
  ok(C.gate === true && Object.keys(V).join(',') === 'chop,quarry,attack,fish', '동사 — 벌목 · 채석 · 공격 · 낚시(활은 만들 길이 없어 뺀다)', Object.keys(V).join(','));
  ok(JSON.stringify(V.chop && V.chop.ok) === '["axe","crude_axe"]' && JSON.stringify(V.quarry && V.quarry.ok) === '["pickaxe","crude_pick"]' && JSON.stringify(V.fish && V.fish.ok) === '["crude_rod"]',
    '손 도구 — 술어(`T1065_NEED.ok`)에 정본 도구 이름 전부를 물어 뽑았다', JSON.stringify([V.chop && V.chop.ok, V.quarry && V.quarry.ok]));
  ok(V.quarry && V.quarry.make === 'crude_pick' && V.quarry.act === '돌을 캘' && V.quarry.hint === '자갈은 바위 곁에서 맨손으로 주울 수 있습니다.' && V.chop.make === 'crude_axe' && !V.chop.hint,
    '급조 도구 · 동사 글자 · 줍는 길 한 줄 — T1065 표 그대로', JSON.stringify(V.quarry));
  ok(C.via && JSON.stringify(C.via.stone) === '{"verb":"quarry","res":"rock"}' && JSON.stringify(C.via.wood) === '{"verb":"chop","res":"tree"}', '★재료 → 그 일 · 그 자연물 — 돌 = 채석 · 바위 / 나무 = 벌목 · 나무(전리품 정본에서)', JSON.stringify(C.via));
  ok(C.via && !C.via.pebble && !C.via.twig && !C.via.fiber, '맨손으로도 얻는 재료(자갈 · 잔가지 · 풀)는 도구 문에 안 건다(줍기 · 덤불 전리품)');
  ok(NOGATE && NOGATE.cfg && NOGATE.cfg.gate === false && !Object.keys(NOGATE.cfg.verbs).length && !Object.keys(NOGATE.cfg.via).length, '도구 문 끔 — 표가 빈다(맨손으로 다 캔다 · 칸은 재료만 말한다)', NOGATE && JSON.stringify(NOGATE.cfg));
  ok(NOGATE && NOGATE.n.hut[0] && NOGATE.n.hut[0].need && NOGATE.n.hut[0].need.tool === 'pickaxe', '도구 문 끔이어도 곡괭이 없는 움집 터파기는 `need` 를 싣는다', NOGATE && JSON.stringify(NOGATE.n.hut));
}

// ─────────────────────────────── 칸 — 제품 클라 글자 그대로(vm) ───────────────────────────────
const V52 = rd('public/client/52-v-village-view.js');
const JOSA = (() => { const i = V52.indexOf('function vvJosa('); return i >= 0 ? V52.slice(i, V52.indexOf('\n}\n', i) + 3) : ''; })();
function load(src, cfg) {
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, uiCfg: cfg || {}, window: {}, document: { getElementById: () => null } };
  vm.createContext(ctx);
  if (JOSA) vm.runInContext(JOSA, ctx);
  vm.runInContext(src, ctx, { filename: 'public/client/70-lobby.js' });
  return ctx;
}
const LAB = { wood: '나무', stone: '돌', pebble: '자갈', twig: '잔가지', fiber: '풀', pickaxe: '곡괭이', axe: '도끼', crude_pick: '조잡한 돌괭이', crude_axe: '조잡한 돌도끼',
  crude_blade: '조잡한 돌칼', crude_rod: '막대 낚싯대', rock: '바위', tree: '나무' };
const REC = { pickaxe: { cost: { wood: 3, stone: 5 }, label: '곡괭이' }, axe: { cost: { wood: 5, stone: 2 }, label: '도끼' },
  crude_axe: { cost: { pebble: 2, twig: 1, fiber: 2 } }, crude_pick: { cost: { pebble: 3, twig: 1, fiber: 2 } }, crude_blade: { cost: { pebble: 2, twig: 1, fiber: 1 } }, crude_rod: { cost: { twig: 1, fiber: 2 } } };
const CFG = (ON && ON.cfg) || null;
const In = (o) => Object.assign({ toolCfg: CFG, recipes: REC, bag: {}, tools: [], held: null, slotted: () => false, resVerb: { rock: '채굴', tree: '벌목' }, itemKo: (k) => LAB[k] || k }, o || {});
const flat = (p) => (p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '');
const C1 = load(SRC, { nextTool: CFG });
const P = (o) => C1.onbToolPlan(In(o));
const pick = { id: 'p', type: 'crude_pick', d: 10 }, axe = { id: 'a', type: 'crude_axe', d: 10 };
sec('⑤ 칸 사다리 — 거절된 막힘을 표 · 레시피 · 짐으로 한 칸씩');
ok(typeof C1.onbToolPlan === 'function' && typeof C1.onbNeedNote === 'function' && typeof C1.onbNeedPick === 'function' && !!JOSA && !!CFG, '[상황] 제품 글자에 칸 함수 셋 · 조사 정본(`vvJosa`) · welcome 표(켬 판)');
let cases = [];
if (CFG) {
  const q0 = P({ need: { verb: 'quarry' } });
  ok(q0 && q0.stage === 'tool' && q0.item === '조잡한 돌괭이 만들기' && q0.target === null && q0.step.do === 'fetch' && q0.step.make === 'crude_pick',
    '★★맨손 채석 거절 → "조잡한 돌괭이 만들기" · 화살 없음', JSON.stringify(q0 && [q0.item, q0.step]));
  ok(ON && ON.n.rock[0] && flat(q0) === `${ON.n.rock[0].text} 지금 자갈 0개, 잔가지 0개, 풀 0개가 있습니다.`, '★★칸 문장 = 서버 거절 문장(T1065) 그대로 + 지금 가진 것', flat(q0));
  const q1 = P({ need: { verb: 'quarry' }, bag: { pebble: 1, fiber: 2 } });
  ok(/지금 자갈 1개, 잔가지 0개, 풀 2개가 있습니다\.$/.test(flat(q1)), '가진 것은 짐을 따라간다', flat(q1).slice(-26));
  const q2 = P({ need: { verb: 'quarry' }, bag: { pebble: 3, twig: 1, fiber: 2 } });
  ok(q2 && q2.step.do === 'craft' && /재료가 다 있습니다\. 제작 창에서 조잡한 돌괭이를 만드십시오\. 제작 창은 \[K\] 키로 엽니다\./.test(flat(q2)), '재료가 다 있으면 "만드십시오" · 제작 창 키', flat(q2));
  const q3 = P({ need: { verb: 'quarry' }, tools: [pick] });
  ok(q3 && q3.item === '조잡한 돌괭이 손에 들기' && q3.step.do === 'equip' && /조잡한 돌괭이를 손에 들어야 돌을 캘 수 있습니다\. 가방에서 골라 손에 드십시오\. 가방은 \[I\] 키로 엽니다\./.test(flat(q3)), '가졌는데 안 들었으면 "손에 들기"(T1065 문장 꼴)', flat(q3));
  ok(P({ need: { verb: 'quarry' }, tools: [pick], held: 'p' }) === null && P({ need: { verb: 'quarry' }, tools: [Object.assign({}, pick, { d: 0 })], held: 'p' }) !== null,
    '★손에 들면 풀린다(null) · 깨진 것을 들면 안 풀린다');
  ok(P({ need: { verb: 'quarry' }, slotted: (s) => s === 'tool' }) === null, '작업대 도구 장비 칸이 차면 풀린다(서버 문과 같은 뜻)');
  const h0 = P({ need: { tool: 'pickaxe' } });
  ok(h0 && h0.item === '조잡한 돌도끼 만들기' && /^곡괭이에 나무가 듭니다\. 조잡한 돌도끼가 있어야 나무를 벨 수 있습니다\. 자갈 2개, 잔가지 1개, 풀 2개로 제작 창에서 만들 수 있습니다\./.test(flat(h0)),
    '★움집 거절(곡괭이) · 맨손 → 곡괭이의 첫 재료(나무)가 도구 문 → 조잡한 돌도끼(레시피 차례 그대로)', flat(h0));
  const h1 = P({ need: { tool: 'pickaxe' }, tools: [axe], held: 'a' });
  ok(h1 && h1.item === '나무 벌목' && h1.step.do === 'gather' && h1.step.what === 'wood' && /\[E\] 키로 나무를 벨 수 있습니다\.$/.test(flat(h1)), '돌도끼를 들었으면 "나무 벌목" — 곡괭이 재료 · 지금 가진 것 · E 키', flat(h1));
  const h2 = P({ need: { tool: 'pickaxe' }, tools: [axe], held: 'a', bag: { wood: 3 } });
  ok(h2 && h2.item === '조잡한 돌괭이 만들기' && /^곡괭이에 돌이 듭니다\. 조잡한 돌괭이가 있어야 돌을 캘 수 있습니다\. 자갈 3개, 잔가지 1개, 풀 2개로 제작 창에서 만들 수 있습니다\. 자갈은 바위 곁에서 맨손으로 주울 수 있습니다\. 지금 자갈 0개, 잔가지 0개, 풀 0개가 있습니다\.$/.test(flat(h2)),
    '★★나무 3 · 돌 0 → "곡괭이에 돌이 듭니다" + 급조 돌괭이 한 줄(T1065 문장) — 돌 · 곡괭이 · 급조 돌괭이 길', flat(h2));
  const h3 = P({ need: { tool: 'pickaxe' }, tools: [axe, pick], held: 'a', bag: { wood: 3 } });
  ok(h3 && h3.item === '조잡한 돌괭이 손에 들기' && /^곡괭이에 돌이 듭니다\./.test(flat(h3)), '돌괭이를 만들었으면 "손에 들기"(앞 막힘 한 줄 그대로)', flat(h3).slice(0, 40));
  const h4 = P({ need: { tool: 'pickaxe' }, tools: [axe, pick], held: 'p', bag: { wood: 3, stone: 1 } });
  ok(h4 && h4.item === '바위 채굴' && h4.step.do === 'gather' && h4.step.res === 'rock' && flat(h4) === '곡괭이를 만들려면 나무 3개, 돌 5개가 있어야 합니다. 지금 나무 3개, 돌 1개가 있습니다. 바위 곁에서 [E] 키로 돌을 캘 수 있습니다.',
    '★돌괭이를 들었으면 "바위 채굴"(자연물 동사 정본) · 곡괭이 재료 · 지금 가진 것', flat(h4));
  const h5 = P({ need: { tool: 'pickaxe' }, tools: [pick], held: 'p', bag: { wood: 3, stone: 5 } });
  ok(h5 && h5.item === '곡괭이 만들기' && h5.step.do === 'craft' && h5.step.what === 'pickaxe', '재료가 다 모이면 "곡괭이 만들기"', flat(h5));
  const ax = P({ need: { tool: 'axe' }, tools: [axe, pick], held: 'a', bag: { wood: 5 } });
  ok(ax && ax.item === '조잡한 돌괭이 손에 들기' && /^도끼에 돌이 듭니다\./.test(flat(ax)), '기둥 거절(도끼) · 나무 5 · 돌 0 — "도끼에 돌이 듭니다" + 돌괭이 손에 들기(같은 사다리)', flat(ax).slice(0, 44));
  ok(P({ need: { tool: 'pickaxe' }, tools: [{ id: 'k', type: 'pickaxe', d: 9 }] }) === null, '★곡괭이를 가지면 움집 막힘이 풀린다(터파기는 가지면 된다)');
  const c0 = P({ need: { craft: 'crude_pick' }, bag: { pebble: 2 } });
  ok(c0 && c0.item === '조잡한 돌괭이 만들기' && /^조잡한 돌괭이가 있어야 돌을 캘 수 있습니다\./.test(flat(c0)) && P({ need: { craft: 'crude_pick' }, tools: [pick] }) === null, '제작 거절(돌괭이) — 같은 한 줄 · 만들면 풀린다');
  const cp = P({ need: { craft: 'pickaxe' }, toolCfg: { gate: false, verbs: {}, via: {} } });
  ok(cp && cp.item === '곡괭이 만들기' && flat(cp) === '곡괭이를 만들려면 나무 3개, 돌 5개가 있어야 합니다. 지금 나무 0개, 돌 0개가 있습니다.', '도구 문 끔 표 — 재료만 말한다(제작 거절 문장 꼴)', flat(cp));
  ok(P({ need: { verb: 'ranged' } }) === null && P({ need: { tool: 'nothing' } }) === null && P({ need: null }) === null, '말할 길이 없는 막힘 · 없는 막힘 — 칸 없음(null)');
  cases = [q0, q2, q3, h0, h1, h2, h4, h5, c0, cp, P({ need: { verb: 'attack' } }), P({ need: { verb: 'fish' } })];
}

sec('⑥ 말투 — 할 일 명사형 · 설명 하십시오체 · 기호 나열 0(지시_T1069)');
if (cases.length) {
  const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok(cases.every(Boolean), '[상황] 열두 칸이 섰다', cases.map((p) => p && p.item).join(' | '));
  ok(cases.every((p) => /(기|채굴|벌목)$/.test(p.item) && !/다\.?$/.test(p.item)), '할 일은 명사형(…기 · 자연물 동사 이름)', JSON.stringify(cases.map((p) => p.item)));
  ok(cases.every((p) => /(니다|십시오)\.$/.test(flat(p)) && !/요\./.test(flat(p))), '설명은 하십시오체(…니다 · …십시오) · 해요체 0');
  const txt = cases.map((p) => p.item + '|' + flat(p)).join('|');
  ok(!/[·→←↑↓()!！]/.test(txt), '가운뎃점 · 화살표 · 괄호 · 느낌표 0', (txt.match(/[·→←↑↓()!！]/g) || []).join(''));
  ok(!EMO.test(txt), '이모지 0');
  ok(cases.every((p) => p.guide.every((x, i) => !(x && x.k != null) || /^ 키로/.test(String(p.guide[i + 1] || '')))), '단축키 뒤 조사는 "키로"');
  ok(/곡괭이를 만들려면/.test(flat(cases[6])) && /돌괭이가 있어야/.test(flat(cases[0])) && /돌도끼가 있어야/.test(flat(cases[3])) && /돌칼이 있어야/.test(flat(cases[10])), '조사 — 받침에 맞게(을/를 · 이/가 — `vvJosa` 정본)');
}

sec('⑦ 새 수 0 — 칸 함수 몸 수 글자 0 · 1 · 레시피를 바꾸면 글자가 따라간다');
{
  const body = SRC.slice(SRC.indexOf('function onbNeedNote('), SRC.indexOf('// 단계 고르기 — **순수 함수**'));
  const nums = [...body.replace(/\/\/[^\n]*/g, '').matchAll(/(?<![\w$.])(\d+(?:\.\d+)?)(?![\w$])/g)].map((m) => m[1]);
  ok(body.length > 0 && nums.every((n) => n === '0' || n === '1'), '칸 함수 몸의 수 글자 = 0 · 1 뿐(레시피 · 짐 · 표가 다 준다)', JSON.stringify([...new Set(nums)]));
  if (CFG) {
    const REC2 = JSON.parse(JSON.stringify(REC)); REC2.crude_pick.cost = { pebble: 4, twig: 2, fiber: 1 }; REC2.pickaxe.cost = { wood: 2, stone: 7 };
    const a = P({ need: { verb: 'quarry' }, recipes: REC2 }), b = P({ need: { tool: 'pickaxe' }, recipes: REC2, tools: [pick], held: 'p', bag: { wood: 2 } });
    ok(/자갈 4개, 잔가지 2개, 풀 1개로/.test(flat(a)) && /나무 2개, 돌 7개가 있어야/.test(flat(b)), '레시피 수를 바꾸면 칸 글자가 따라간다(서버 `RECIPES` → welcome `recipes`)', `${flat(a).slice(26, 46)} · ${flat(b).slice(9, 30)}`);
  }
}

sec('⑧ 쌓기 · 풀기 · 그리기 — 거절이 쌓이고 · 풀리면 앞 막힘 · 「마을로 들어가기」 앞');
try {
  const off = load(SRC, {});
  ok(off.onbNeedNote({ verb: 'quarry' }) === false && vm.runInContext('onbNeeds.length', off) === 0, '★끔(welcome 에 nextTool 없음) — 쌓지 않는다(칸 종전)');
  if (CFG) {
    const c = load(SRC, { nextTool: CFG, nextStep: true });
    c.onbNeedNote({ tool: 'pickaxe' }); c.onbNeedNote({ verb: 'quarry' }); c.onbNeedNote({ tool: 'pickaxe' }); c.onbNeedNote({ verb: 'quarry' });
    ok(vm.runInContext('JSON.stringify(onbNeeds)', c) === '[{"tool":"pickaxe"},{"verb":"quarry"}]', '같은 막힘은 하나로 · 맨 끝이 마지막 거절', vm.runInContext('JSON.stringify(onbNeeds)', c));
    const I1 = In({ tools: [axe], held: 'a', bag: { wood: 3 } }); I1.need = c.onbNeedPick(I1);
    ok(I1.need && I1.need.verb === 'quarry' && c.onbToolPlan(I1).item === '조잡한 돌괭이 만들기', '맨 끝 막힘(채석) — 조잡한 돌괭이', JSON.stringify(I1.need));
    const I2 = In({ tools: [axe, pick], held: 'p', bag: { wood: 3 } }); I2.need = c.onbNeedPick(I2);
    ok(I2.need && I2.need.tool === 'pickaxe' && c.onbToolPlan(I2).item === '바위 채굴' && vm.runInContext('onbNeeds.length', c) === 1, '★★돌괭이를 들면 채석 막힘을 내려놓고 앞 막힘(곡괭이)으로 — "바위 채굴"', JSON.stringify(I2.need));
    const I3 = In({ tools: [{ id: 'k', type: 'pickaxe', d: 9 }] }); I3.need = c.onbNeedPick(I3);
    ok(I3.need === null && vm.runInContext('onbNeeds.length', c) === 0, '곡괭이를 가지면 막힘이 다 풀린다(칸은 종전 단계로)');
    // 「지금 할 일」 차례 — 막힘이 있으면 「마을로 들어가기」 앞 · 없으면 종전 그대로
    const ST0 = { vid: 1, firstItem: null, firstDone: false, contrib: 0, need: 3, lotOk: false, lot: { x: 66000, y: 67000, r: 320 } };
    const HOME = { x: 409984 + 2120 * 32 + 16, y: 2117 * 32 + 16, name: '광산1' };
    const base = { state: ST0, arrive: { vid: 1, name: '광산1', kind: 'dock' }, greet: null, nearVid: null, me: { x: 409984 + 64000, y: 64000 }, off: { x: 409984, y: 0 },
      anchor: (vid) => (vid === 1 ? HOME : null), itemKo: (k) => LAB[k] || k };
    const e0 = c.onbNextPlan(Object.assign({}, base));
    const e1 = c.onbNextPlan(Object.assign(In({ need: { verb: 'quarry' } }), base));
    ok(e0 && e0.stage === 'enter' && e1 && e1.stage === 'tool' && e1.item === '조잡한 돌괭이 만들기' && e1.place === '광산1 마을 밖' && e1.target === null,
      '★★촌장 문 밖 — 막힘이 있으면 「마을로 들어가기」 대신 다음 막힘 · 자리 이름 그대로 · 화살 없음', JSON.stringify([e0 && e0.stage, e1 && [e1.stage, e1.item, e1.place]]));
    const g1 = c.onbNextPlan(Object.assign(In({ need: { verb: 'quarry' } }), base, { nearVid: 1 }));
    ok(g1 && g1.stage === 'tool', '마을 안(촌장 기다림)이어도 안 풀린 막힘이 먼저');
    // 그리기 — 가짜 DOM 에 칸 하나 · 하네스 읽기 훅에 그 한 칸
    const byId = new Map();
    const mk = () => { const el = { style: {}, dataset: {}, _c: new Set(['hidden']), textContent: '', _h: '', children: [], appendChild(x) { this.children.push(x); return x; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
      el.classList = { add: (k) => el._c.add(k), remove: (k) => el._c.delete(k), contains: (k) => el._c.has(k) };
      Object.defineProperty(el, 'innerHTML', { get() { return el._h; }, set(v) { el._h = String(v); for (const m of el._h.matchAll(/id="([^"]+)"/g)) { const k = mk(); byId.set(m[1], k); } } });
      Object.defineProperty(el, 'firstChild', { get() { return el._h ? {} : null; } });
      return el; };
    const game = mk(); game._c.delete('hidden'); byId.set('game', game);
    c.document = { getElementById: (id) => byId.get(id) || null, createElement: () => mk(), body: mk() };
    c.innerWidth = 1440; c.innerHeight = 900; c.uiIcon = () => '<svg></svg>';
    c.conns = new Map([['hanbando', { meta: { worldOffsetX: 409984, worldOffsetY: 0 }, simVillages: [] }]]); c.primaryZoneId = 'hanbando';
    c._evVillageAnchorAbs = (vid) => (vid === 1 ? { x: HOME.x, y: HOME.y, v: { name: HOME.name } } : null);
    c.myAbsPredicted = { x: 409984 + 64000, y: 64000 }; c.evNearVid = null; c.itemKo = (k) => LAB[k] || k;
    c.recipes = REC; c.inventory = { wood: 3 }; c.toolItems = [axe]; c.equipped = 'a'; c.resourceVerbs = { rock: '채굴', tree: '벌목' };
    vm.runInContext(`onbState = ${JSON.stringify(ST0)}; onbArrive = { vid: 1, name: '광산1', kind: 'dock' }; onbHooks();`, c);
    vm.runInContext('onbNextRender()', c);
    const n0 = c.window.__t1064Next();
    c.onbNeedNote({ verb: 'quarry' });
    vm.runInContext('onbNextRender()', c);
    const n1 = c.window.__t1064Next();
    ok(n0 && n0.stage === 'enter' && !('step' in n0) && n1 && n1.stage === 'tool' && n1.step && n1.step.do === 'fetch' && n1.step.make === 'crude_pick' && byId.get('onbNextItem').textContent === '조잡한 돌괭이 만들기',
      '★그리기 — 거절이 들어오면 칸이 바뀐다 · 읽기 훅에 한 칸(무엇을 · 어느 문) · 막힘 없으면 종전 꼴(step 칸 없음)', JSON.stringify([n0 && n0.stage, n1 && n1.step]));
    c.toolItems = [axe, pick]; c.equipped = 'p';
    vm.runInContext('onbNextRender()', c);
    const n2 = c.window.__t1064Next();
    ok(n2 && n2.stage === 'enter' && vm.runInContext('onbNeeds.length', c) === 0, '돌괭이를 들면 막힘이 풀려 칸이 「마을로 들어가기」로 돌아간다', n2 && n2.stage);
  }
} catch (e) { ok(false, '⑧ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑨ 돌연변이 — 고침의 뼈를 걷어 낸 글자면 위 판정이 빨갛다(자명 통과 금지)');
try {
  const M1 = SRC.replace('if (w && V[w.verb]) {', 'if (false) {');
  const M2 = SRC.replace('if (onbToolHas(I, v.ok, true) || (v.slot && I.slotted && I.slotted(v.slot))) return null;', '');
  ok(M1 !== SRC && M2 !== SRC, '클라 돌연변이 글자를 세웠다(두 자리 다 제품 글자에 있다)');
  if (CFG) {
    const a = load(M1, { nextTool: CFG }).onbToolPlan(In({ need: { tool: 'pickaxe' }, tools: [axe], held: 'a', bag: { wood: 3 } }));
    const b = load(M2, { nextTool: CFG }).onbToolPlan(In({ need: { verb: 'quarry' }, tools: [pick], held: 'p' }));
    ok(a && a.item !== '조잡한 돌괭이 만들기' && b !== null, '클라 돌연변이 — 돌이 도구 문에 걸려도 돌괭이를 말하지 않고(⑤ "곡괭이에 돌이 듭니다"가 잡는다) · 들어도 안 풀린다(⑤ "손에 들면 풀린다"가 잡는다)', JSON.stringify([a && a.item, b && b.item]));
  }
  ok(MUT && MUT.rockSide.found && MUT.rockSide.e1.length === 1, '서버 돌연변이 — ② 한 줄을 걷으면 바위 곁 맨손 E 에 이유가 없다(② "그 자리에서 이유 한 줄"이 잡는다)', MUT && MUT.rockSide.found ? `${MUT.rockSide.e1.length}통` : '');
} catch (e) { ok(false, '⑨ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

console.log(`\n=== T1120: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
