#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-mob-respawn.js — 몹 죽음 길 셋의 다시 낳기는 한 문 · 한 규칙(T987 · 실서버 함수 · 자식 프로세스 · 몇 초) ===========
//
// ★왜 [T975 회부 1 · ★PM 결함] 사람 공격(`tryAttack`) · NPC(`npcStep`) 죽음 길은 15초 뒤 같은 종을 다시 낳는데 화살 죽음 길(`stepArrows`)엔
//   다시 낳기가 없었다 — 화살로 사냥할수록 몹이 영영 준다. 두 길의 규칙도 한 글자 달랐다: 사람 공격은 야생 그림자(`isWild`)를 거르고
//   NPC 는 안 걸렀다. T987(손잡이 `T987_MOB_RESPAWN` · 켬 기본 · `=0` 되돌림) = 세 길이 한 함수 `respawnMobLater(m)` 를 부른다
//   (야생 그림자 빼고 · `HOSTILES_ON` 이거나 순한 종이면 15초 뒤 같은 종 하나 · `mob_spawn`).
// 판 = 손잡이(켬 · 끔 `=0`) × `HOSTILES_ON`(`ENABLE_WILDLIFE` 끔 = 순한 종만 · 켬 = 사나운 종도) = 자식 넷. 자식마다 존을 임시 DB · 임시 포트로
//   한 프로세스에 띄우고(마을 · 도적 · 길 끔) 죽음 길 셋 × 몹 넷(DB 순한 종 · DB 사나운 늑대 · 야생 그림자 순한 종 · 야생 그림자 늑대)을
//   진짜 함수로 죽인다. 다시 낳기는 15초 `setTimeout` 이라 죽이는 그 순간만 `setTimeout` 을 감싸 **걸린 타이머를 센다**(15000ms ·
//   `spawnMob` 을 부르는 것만 · 진짜 타이머는 지운다 — 벽시계 0 · 결정론). 켬 판은 걸린 타이머를 손으로 한 번씩 불러 같은 종이 서고
//   `mob_spawn` 이 나가는지 본다.
// 보는 것:
//   ① [상황] 판마다 몹 열둘이 다 죽었다(죽음 길 셋 × 몹 넷) · 손잡이 · HOSTILES_ON 이 판대로 섰다
//   ② ★★켬 — 다시 낳기 표 = 한 규칙(야생 그림자 아님 ∧ (HOSTILES_ON ∨ 순한 종)) · 세 길이 같다 · 지연 15000ms
//   ③ ★★화살로 죽인 순한 DB 몹 — 끔 0 · 켬 1(카드 ②) · 켬은 걸린 타이머가 같은 종을 세우고 `mob_spawn`(주인 칸 null)을 낸다
//   ④ ★끔 — 종전 글자 그대로의 표(화살 0 · NPC 는 야생 그림자도 낳음 · 사람 공격은 거름) — 위가 자명 통과가 아니다
//   ⑤ ★야생 그림자 — 켬에선 어느 길로 죽여도 안 선다(NPC 길도 · 랩이 개체 수를 쥔다)
// 실행: node scripts/test-mob-respawn.js   (임시 DB · 임시 포트 · 라이브 무접촉)
'use strict';
// ★[T1065 판 꾸밈] 이 하네스가 재는 것 = 죽음 길 셋의 다시 낳기(화살 · 사람 공격 픽스처) — 도구 문(`T1065_TOOL_GATE` · 맨손 거부 · 활 없음)은 `test-t1065-tool-gate` 가 잰다. 단언 무변 · 손으로 켜 볼 수 있다(env 를 주면 그 값).
process.env.T1065_TOOL_GATE = process.env.T1065_TOOL_GATE || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T987_RS_MODE || '';

if (MODE) child(); else parent();

// ───────────────────────────────────────── 자식: 존 한 프로세스 ─────────────────────────────────────────
function child() {
  const OUT = process.env.T987_RS_OUT;
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T987_RS_DB, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const res = { knob: H.T987_MOB_RESPAWN, hasDoor: typeof H.respawnMobLater === 'function', kills: [], spawned: [] };
  const msgs = [];
  H.players.set('t987_watch', { pid: 't987_watch', playerId: 't987_watch', name: '눈', x: -1e7, y: -1e7, floor: 0, isNpc: false,
    ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } } });
  const D = H.MOB_DEFS;
  const ANIMALS = require(path.join(ROOT, 'server', 'animals.js')).ANIMALS;
  const meek = Object.keys(D).find((k) => !D[k].tameFood && D[k].aggroRange === 0 && D[k].maxHp >= 30 && !(ANIMALS[k] && ANIMALS[k].aggressive));   // 순한 종
  const fierce = 'wolf';
  res.hostiles = !!(ANIMALS[fierce] && ANIMALS[fierce].aggressive) && process.env.ENABLE_WILDLIFE !== '0';
  res.types = { meek, fierce };
  // 조용한 자리 — 둘레 400px 에 몹 0(화살 · 근접이 엉뚱한 몹을 안 고르게) · 결정론(존 부팅의 몹 자리는 씨 그대로)
  const spots = [];
  for (let y = 4000; y < 32 * 3800 && spots.length < 14; y += 1600) for (let x = 4000; x < 32 * 2000 && spots.length < 14; x += 1600) {
    let near = false; for (const m of H.mobs.values()) if (Math.abs(m.x - x) < 400 && Math.abs(m.y - y) < 400) { near = true; break; }
    if (!near && !spots.some((s) => Math.abs(s[0] - x) < 1200 && Math.abs(s[1] - y) < 1200)) spots.push([x, y]);
  }
  res.spots = spots.length;
  let _pid = 0, _wid = 0;
  const mkPlayer = (x, y) => ({ pid: `t987p${++_pid}`, playerId: `t987_${_pid}`, name: '사냥꾼', ws: { readyState: 1, send: () => {} }, x, y, floor: 0,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null, tribeId: null, tribeName: null,
    hunger: 100, thirst: 100, oreCarry: {}, lastAttackAt: 0, lastRangedAt: 0, vp: 0 });
  const place = (kind, x, y, hp) => {
    if (kind === 'dbMeek' || kind === 'dbFierce') return H.spawnMob(kind === 'dbMeek' ? meek : fierce, { x, y, hp });
    // 야생 그림자 꼴(wildlife.js `_makeShadow` 의 칸 — DB 행 없음 · `isWild`) · 랩 짝(`_wildRef`)은 없다(랩 동기는 일찍 돌아간다)
    const type = kind === 'wildMeek' ? meek : fierce;
    const m = { mid: `w987_${++_wid}`, dbId: null, isWild: true, type, x, y, z: 0, floor: 0, vx: 0, vy: 0, hp, maxHp: D[type].maxHp,
      aggroTarget: null, lastAttackAt: 0, wanderUntil: 0, tameOwner: null, tameOwnerName: null, dirty: false };
    H.mobs.set(m.mid, m);
    return m;
  };
  // 죽이는 동안만 setTimeout 을 감싸 다시 낳기 타이머(15000ms · spawnMob 을 부르는 것)를 센다 — 진짜 타이머는 지운다
  const caught = (fn) => {
    const st = global.setTimeout, got = [];
    global.setTimeout = function (f, ms, ...a) { const t = st(f, ms, ...a); if (typeof f === 'function' && /spawnMob\(/.test(String(f))) { got.push({ f, ms }); clearTimeout(t); } return t; };
    try { fn(); } finally { global.setTimeout = st; }
    return got;
  };
  const KINDS = ['dbMeek', 'dbFierce', 'wildMeek', 'wildFierce'];
  let k = 0;
  for (const via of ['npc', 'arrow', 'player']) for (const kind of KINDS) {
    const [x, y] = spots[k++ % spots.length];
    const hp = via === 'npc' ? 8 : via === 'arrow' ? 25 : 10;   // 한 대에 죽게(NPC 8 · 화살 25 · 맨손 10)
    const m = place(kind, x, y, hp);
    let got = [];
    if (via === 'npc') {
      const npc = { pid: `t987_npc${k}`, playerId: `npc_t987_${k}`, name: '사냥 NPC', isNpc: true, x: x + 10, y, vx: 0, vy: 0, floor: 0,
        behavior: 'fight', fightTarget: m.mid, lastAttackAt: 0, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100 };
      got = caught(() => H.npcStep(npc, 1 / 30, 1e6 + k * 2000));
    } else if (via === 'arrow') {
      const p = mkPlayer(x - 150, y);
      got = caught(() => { p.lastRangedAt = 0; H.tryRangedAttack(p, m.x, m.y); for (let i = 0; i < 90 && H.mobs.has(m.mid); i++) H.stepArrows(1 / 30); });
    } else {
      const p = mkPlayer(x - 20, y);
      got = caught(() => { p.lastAttackAt = 0; H.tryAttack(p); });
    }
    res.kills.push({ via, kind, type: m.type, dead: !H.mobs.has(m.mid), timers: got.map((g) => g.ms) });
    // 켬 판 — 걸린 타이머를 손으로 한 번(같은 종이 서나 · mob_spawn)
    if (got.length) {
      const k0 = msgs.length, before = new Set(H.mobs.keys());
      got[0].f();
      const born = [...H.mobs.values()].filter((n) => !before.has(n.mid));
      const sp = msgs.slice(k0).filter((o) => o.type === 'mob_spawn').map((o) => o.mob);
      for (const n of born) H.mobs.delete(n.mid);   // 선 몹은 치운다(자리가 굴림이라 다음 조용한 자리 곁에 설 수 있다 — 다음 화살 · 근접이 엉뚱한 몹을 안 고르게)
      res.spawned.push({ via, kind, type: m.type, born: born.map((n) => ({ type: n.type, dbId: !!n.dbId, wild: !!n.isWild })),
        bc: sp.map((o) => ({ type: o.type, owner: o.tameOwner === null ? 'null' : String(o.tameOwner), ownerName: o.tameOwnerName === null ? 'null' : String(o.tameOwnerName) })) });
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(res));
  process.kill(process.pid, 'SIGKILL');
}

// ───────────────────────────────────────── 부모: 판 넷 ─────────────────────────────────────────
function parent() {
  const { spawnSync } = require('child_process');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const seen = (m) => console.log(`  [관찰] ${m}`);
  const TMPD = fs.mkdtempSync('/tmp/t987-rs-');
  let port = 38300 + (process.pid % 12) * 4;   // 판 넷 = 네 자리(다른 하네스가 안 쓰는 띠)
  const R = {};
  for (const knob of ['on', 'off']) for (const host of ['meek', 'hostile']) {
    const key = `${knob}-${host}`, db = path.join(TMPD, `${key}.db`), out = path.join(TMPD, `${key}.json`);
    const env = Object.assign({}, process.env, { T987_RS_MODE: 'run', T987_RS_DB: db, T987_RS_OUT: out, PORT: String(port++), ENABLE_WILDLIFE: host === 'hostile' ? '1' : '0' });
    delete env.T987_MOB_RESPAWN; delete env.NODE_OPTIONS;
    if (knob === 'off') env.T987_MOB_RESPAWN = '0';
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000, env });
    try { R[key] = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { R[key] = { err: `결과 없음(종료 ${r.status} · 신호 ${r.signal})` }; }
  }
  try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== 몹 죽음 길 셋의 다시 낳기 — T987(`T987_MOB_RESPAWN` 켬 · 끔 × HOSTILES_ON 끔 · 켬) ===');
  const keys = Object.keys(R);
  const allOk = keys.every((k) => !R[k].err);
  ok(allOk, '[상황] 판 넷 다 섰다(자식 결과)', keys.map((k) => `${k} ${R[k].err || 'ㅇ'}`).join(' · '));
  if (!allOk) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(1); }
  ok(keys.every((k) => R[k].hasDoor), '★ 다시 낳기 문 `respawnMobLater` 가 있다(세 길이 부를 한 함수 · 없으면 T987 앞 트리 — 아래 표는 그래도 잰다)', keys.map((k) => `${k} ${R[k].hasDoor ? 'ㅇ' : '없음'}`).join(' · '));

  console.log('\n① 상황');
  ok(keys.every((k) => R[k].knob === k.startsWith('on') && R[k].hostiles === k.endsWith('hostile')), '[상황] 손잡이 · HOSTILES_ON 이 판대로 섰다', keys.map((k) => `${k} ${R[k].knob}/${R[k].hostiles}`).join(' · '));
  ok(keys.every((k) => R[k].spots >= 12 && R[k].kills.length === 12 && R[k].kills.every((x) => x.dead)), '[상황] 판마다 몹 열둘이 다 죽었다(죽음 길 셋 × 몹 넷 · 진짜 함수)',
    `${R['on-meek'].types.meek} · ${R['on-meek'].types.fierce} · 야생 그림자 둘`);
  const table = (k) => R[k].kills.map((x) => `${x.via}:${x.kind}=${x.timers.length}`).join(' ');
  for (const k of keys) seen(`${k}: ${table(k)}`);

  console.log('\n② 켬 — 한 규칙(야생 그림자 아님 ∧ (HOSTILES_ON ∨ 순한 종)) · 세 길이 같다');
  const rule = (kind, hostiles) => !kind.startsWith('wild') && (hostiles || kind.endsWith('Meek'));
  for (const k of ['on-meek', 'on-hostile']) {
    const h = R[k].hostiles;
    const bad = R[k].kills.filter((x) => x.timers.length !== (rule(x.kind, h) ? 1 : 0) || x.timers.some((ms) => ms !== 15000));
    ok(bad.length === 0, `★★② ${k} — 다시 낳기 표가 한 규칙 그대로 · 걸린 타이머는 다 15000ms(종전 두 길의 그 수)`, bad.length ? bad.map((x) => `${x.via}:${x.kind}=${x.timers.join('/')}`).join(' ') : table(k));
    const same = ['dbMeek', 'dbFierce', 'wildMeek', 'wildFierce'].every((kind) => new Set(R[k].kills.filter((x) => x.kind === kind).map((x) => x.timers.length)).size === 1);
    ok(same, `★② ${k} — 세 길(NPC · 화살 · 사람 공격)이 몹마다 같은 답(사본 0 — 한 함수)`);
  }

  console.log('\n③ 화살로 죽인 순한 DB 몹 — 15초 뒤 같은 종(카드 ②)');
  const arrowMeek = (k) => R[k].kills.find((x) => x.via === 'arrow' && x.kind === 'dbMeek');
  ok(arrowMeek('off-meek').timers.length === 0 && arrowMeek('off-hostile').timers.length === 0, '★③ 끔 — 화살 죽음은 다시 낳기 0(종전 — 결함 재현)');
  ok(arrowMeek('on-meek').timers.length === 1 && arrowMeek('on-hostile').timers.length === 1 && arrowMeek('on-meek').timers[0] === 15000, '★★③ 켬 — 화살 죽음도 다시 낳기 1 · 15000ms');
  const sp = R['on-meek'].spawned.find((x) => x.via === 'arrow' && x.kind === 'dbMeek');
  seen(sp ? `켬 화살 ${sp.type} → 선 몹 ${JSON.stringify(sp.born)} · 방송 ${JSON.stringify(sp.bc)}` : '켬 화살 — 걸린 타이머 없음');
  ok(!!sp && sp.born.length === 1 && sp.born[0].type === sp.type && sp.born[0].dbId && !sp.born[0].wild && sp.bc.length === 1 && sp.bc[0].type === sp.type && sp.bc[0].owner === 'null' && sp.bc[0].ownerName === 'null',
    '★★③ 켬 — 그 타이머가 같은 종 하나를 세우고(DB 행 · 야생 아님) `mob_spawn` 을 낸다(주인 칸 null — NPC 길 글자)');
  const allSp = ['on-meek', 'on-hostile'].flatMap((k) => R[k].spawned);
  ok(allSp.length > 0 && allSp.every((x) => x.born.length === 1 && x.born[0].type === x.type && x.bc.length === 1 && x.bc[0].type === x.type),
    '③ 켬 — 걸린 타이머 전부(세 길 · 두 판)가 같은 종 하나 · `mob_spawn` 하나', `${allSp.length}개`);

  console.log('\n④ 끔 — 종전 글자 그대로의 표(위가 자명 통과가 아니다)');
  const old = (via, kind, hostiles) => (via === 'arrow' ? false : via === 'npc' ? (hostiles || kind.endsWith('Meek')) : rule(kind, hostiles));
  for (const k of ['off-meek', 'off-hostile']) {
    const h = R[k].hostiles;
    const bad = R[k].kills.filter((x) => x.timers.length !== (old(x.via, x.kind, h) ? 1 : 0));
    ok(bad.length === 0, `★④ ${k} — 화살 0 · NPC 는 야생 그림자도 낳음 · 사람 공격은 거름(종전 두 글자)`, bad.length ? bad.map((x) => `${x.via}:${x.kind}=${x.timers.length}`).join(' ') : table(k));
  }
  const npcWild = R['off-hostile'].kills.find((x) => x.via === 'npc' && x.kind === 'wildFierce');
  ok(npcWild && npcWild.timers.length === 1, '★④ 끔 · HOSTILES_ON — NPC 가 잡은 늑대 그림자에 DB 늑대가 다시 선다(종전 두 길이 갈린 자리 — 켬은 ⑤)');

  console.log('\n⑤ 야생 그림자 — 켬에선 어느 길로 죽여도 안 선다');
  ok(['on-meek', 'on-hostile'].every((k) => R[k].kills.filter((x) => x.kind.startsWith('wild')).every((x) => x.timers.length === 0)), '★⑤ 켬 — 야생 그림자 열둘(세 길 × 두 종 × 두 판)은 다시 낳기 0(개체 수는 랩 생태가 쥔다)');
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
