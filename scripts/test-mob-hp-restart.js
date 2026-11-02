#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-mob-hp-restart.js — 짐승(존 몹) hp · DB 행이 재기동을 건너나(T967 ② · T975 ② · 실서버 · 자식 프로세스 · 몇십 초) =====
//
// ★왜 [T954 회부 2 · ★PM 결함] "화살만 맞은 몹은 주기 저장이 그 hp 를 안 적는다(재기동 뒤 되살아남)". 재 보니 더 넓다 — 종전 주기 저장(10초)은
//   **한 마리도 못 적었다**: 그 글자 `db.db.transaction(…)` 은 node:sqlite `DatabaseSync` 에 없는 함수라 매번 TypeError 를 그 catch 가 삼켰다
//   (3e03fabb 2026-06-25 부터). 그래서 SIGKILL(메모리 부족 · docker kill · 호스트 재부팅) 재기동이면 화살뿐 아니라 사람 공격 · NPC 피해도
//   다 잃고, SIGTERM 재기동은 종료 flush(`_shutdownFlush`)가 몹 전부를 적어 손잡이를 꺼도 남는다(자명 통과의 길 — 그래서 SIGKILL 창을 잰다).
//   T967(손잡이 `T967_MOB_HP` · 켬 기본 · `=0` 되돌림): ① 화살도 저장 표 · ② 죽음 하한 0(문 안) · ③ 주기 저장이 실제로 적는다(`BEGIN IMMEDIATE … COMMIT`).
//   ★[T975 · T967 회부 2 · 3 · ★PM 결함 둘] 손잡이 `T975_MOB_DB`(켬 기본 · `=0` 되돌림): ① 화살 죽음 길도 같은 삭제 문(`db.deleteMob`) — 종전엔 행이 남아
//     재기동마다 되살아났다 · ② 종료 flush 가 주인 칸 둘을 그대로 넘긴다 — 종전엔 넷만 넘겨 우아한 종료마다 길들임이 NULL 이 됐다.
//     판 둘을 더 돈다(T967 켬 · `T975_MOB_DB=0` × SIGKILL · SIGTERM) — ⑥ 화살로 죽인 C · ⑦ 길들인 T 를 끔 빨강 · 켬 초록으로 본다.
//
// 판 = T967 손잡이(끔 `=0` · 켬 env 없음) × 내리는 꼴(SIGKILL · SIGTERM) 넷(T975 는 기본 켬) + T975 끔 둘(T967 켬). 판마다 자식 둘(이 파일을 자식 모드로):
//   ⓐ hit  — 임시 DB · 임시 포트로 존을 한 프로세스에 띄운다(마을 · 야생 · 도적 · 길 끔 — 몹은 존 부팅이 낳은 그대로). DB 행이 있는 몹(`spawnMob`)을
//            조용한 자리(둘레 400px 에 다른 몹 0)에 세운다: A 화살 한 대만(죽지 않게) · B 사람 공격 한 번(대조 — 종전에도 저장 표를 세우던 갈래) ·
//            C 화살로 죽임 · D 사람 공격으로 죽임(0 밑 방송) · T 길들인 짐승(진짜 `tryFeed` — 주인 칸).
//            그다음 **진짜 주기 저장 함수**(`saveDirtyMobs` — 10초 setInterval 이 부르는 그 함수)를 한 번 부르고 SIGKILL(종료 flush 없음) · SIGTERM(종료 flush)으로 내린다.
//   ⓑ boot — 같은 DB 로 존을 다시 띄워(부팅 몹 적재 = 운영 그 길 · `db.getMobs` → `spawnMob`) A · B · C · T 의 행을 읽는다.
//            켬 판이면 그다음 몹 전부에 표를 세워 주기 저장 한 번의 시간을 잰다(관찰 · 문턱 없음) · 그리고 SIGKILL(이 판 DB 를 더 안 쓴다).
// 보는 것:
//   ① [상황] 판마다 A · B 가 실제로 맞았다(hp 가 줄고 방송) · 저장 함수가 실제로 불렸다 — 아니면 아래가 자명 통과다
//   ② ★★켬 · SIGKILL — A(화살만)의 hp 가 맞은 값으로 돌아온다 · B 도
//   ③ ★★끔 · SIGKILL — A · B 가 맞기 전 값으로 돌아온다(결함 재현 — 켬 초록이 자명 통과가 아니다)
//   ④ ★SIGTERM — 끔 · 켬 다 A 가 맞은 값으로 돌아온다(종료 flush 가 몹 전부를 적는다 — 결함은 SIGKILL 창에만 있다)
//   ⑤ ★★방송 값 0 밑 0 — 켬 판 hit 의 `mob_damaged` hp 최소 0(D 가 0 에서 멈춘다) · 끔 판은 0 밑(그 검사가 문다)
//   ⑥ ★★[T975] 화살로 죽인 C — T975 켬(판 넷)은 다시 뜬 뒤 행이 없다 · T975 끔(판 둘)은 hp 20 으로 되살아난다(결함 재현)
//   ⑦ ★★[T975] 길들인 T 주인 칸 — SIGTERM: T975 켬(T967 켬 · 끔 다)은 남는다 · T975 끔은 NULL(결함 재현) · SIGKILL 은 주기 저장의 몫(T967)
//   [관찰] 켬 주기 저장 한 번의 시간
// 실행: node scripts/test-mob-hp-restart.js   (임시 DB · 임시 포트 · 라이브 무접촉)
'use strict';
// ★[T1065 판 꾸밈] 이 하네스가 재는 것 = 짐승 hp 가 재기동을 건너나(화살 · 사람 공격 픽스처) — 도구 문(`T1065_TOOL_GATE` · 맨손 거부 · 활 없음)은 `test-t1065-tool-gate` 가 잰다. 단언 무변 · 손으로 켜 볼 수 있다(env 를 주면 그 값).
process.env.T1065_TOOL_GATE = process.env.T1065_TOOL_GATE || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T967_RS_MODE || '';

if (MODE) child(); else parent();

// ───────────────────────────────────────── 자식: 존 한 프로세스 ─────────────────────────────────────────
function child() {
  const OUT = process.env.T967_RS_OUT;
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T967_RS_DB, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0' });
  const _log = console.log;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const res = { mode: MODE, knob: H.T967_MOB_HP, knob975: H.T975_MOB_DB, hasSave: typeof H.saveDirtyMobs === 'function', hasSpawn: typeof H.spawnMob === 'function' };
  const done = (sig) => { fs.writeFileSync(OUT, JSON.stringify(res)); process.kill(process.pid, sig); };
  if (!res.hasSave || !res.hasSpawn) { res.err = '하네스 문(`saveDirtyMobs` · `spawnMob`) 없음 — T967 앞 트리'; fs.writeFileSync(OUT, JSON.stringify(res)); process.exit(0); }
  if (MODE === 'boot') {
    const ids = JSON.parse(process.env.T967_RS_IDS);
    const rows = new Map(H.db.getMobs().map((r) => [r.id, r]));
    const live = new Map([...H.mobs.values()].filter((m) => m.dbId).map((m) => [m.dbId, m]));
    res.got = {};
    for (const [k, id] of Object.entries(ids)) {
      const r = rows.get(id), m = live.get(id);
      res.got[k] = { row: r ? { hp: r.hp, owner: r.tame_owner || null } : null, live: m ? { hp: m.hp, owner: m.tameOwner || null } : null };
    }
    res.mobs = H.mobs.size;
    if (H.T967_MOB_HP) {   // 켬 판 — 몹 전부에 표를 세워 주기 저장 한 번의 시간(관찰 · 운영 무게)
      for (const m of H.mobs.values()) m.dirty = true;
      const t0 = process.hrtime.bigint(); const n = H.saveDirtyMobs(); res.saveAll = { n, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
    }
    return done('SIGKILL');
  }
  // MODE === 'hit'
  const msgs = [];
  H.players.set('t967_watch', { pid: 't967_watch', playerId: 't967_watch', name: '눈', x: -1e7, y: -1e7, floor: 0, isNpc: false,
    ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } } });
  const D = H.MOB_DEFS;
  const typeWith = (pred) => Object.keys(D).find((k) => pred(D[k]));
  const big = typeWith((d) => !d.tameFood && d.aggroRange === 0 && d.maxHp >= 60);   // 화살 한 대(25)에 안 죽는 순한 짐승
  const Era = require(path.join(ROOT, 'server', 'era.js'));
  const pet = Object.keys(D).filter((k) => D[k].tameFood && D[k].maxHp >= 10 && Era.canTame(k)).sort()[0];
  // 조용한 자리 — 둘레 400px 에 몹 0(화살 · 근접 · 먹이가 엉뚱한 몹을 안 고르게) · 결정론(존 부팅의 몹 자리는 씨 그대로)
  const W = 32 * 2000, Hh = 32 * 3800;
  const spots = [];
  for (let y = 4000; y < Hh && spots.length < 6; y += 1600) for (let x = 4000; x < W && spots.length < 6; x += 1600) {
    let near = false; for (const m of H.mobs.values()) if (Math.abs(m.x - x) < 400 && Math.abs(m.y - y) < 400) { near = true; break; }
    if (!near && !spots.some((s) => Math.abs(s[0] - x) < 1200 && Math.abs(s[1] - y) < 1200)) spots.push([x, y]);
  }
  let _pid = 0;
  const mkPlayer = (x, y, inv) => ({ pid: `t967p${++_pid}`, playerId: `t967_${_pid}`, name: '사냥꾼', ws: { readyState: 1, send: () => {} }, x, y, floor: 0,
    inventory: Object.assign({}, inv || {}), toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null, tribeId: null, tribeName: null,
    hunger: 100, thirst: 100, oreCarry: {}, lastAttackAt: 0, lastRangedAt: 0, vp: 0 });
  const shoot = (p, m) => {   // 화살 한 대 — 맞을 때까지 화살 걸음(1/30초)
    p.lastRangedAt = 0; H.tryRangedAttack(p, m.x, m.y);
    for (let i = 0; i < 90; i++) { const h0 = m.hp, had = H.mobs.has(m.mid); H.stepArrows(1 / 30); if (m.hp !== h0 || (had && !H.mobs.has(m.mid))) return true; }
    return false;
  };
  const bc = (m) => msgs.filter((o) => o.type === 'mob_damaged' && o.mid === m.mid).map((o) => o.hp);
  res.types = { big, pet };
  res.spots = spots.length;
  // A — 화살만 한 대
  const [ax, ay] = spots[0];
  const A = H.spawnMob(big, { x: ax, y: ay });
  const pA = mkPlayer(ax - 150, ay);
  const a0 = A.hp; const aHit = shoot(pA, A);
  res.A = { id: A.dbId, type: big, pre: a0, post: A.hp, hit: aHit, bc: bc(A), dirty: A.dirty };
  // B — 사람 공격 한 번(대조)
  const [bx, by] = spots[1];
  const B = H.spawnMob(big, { x: bx, y: by });
  const pB = mkPlayer(bx - 20, by);
  const b0 = B.hp; pB.lastAttackAt = 0; H.tryAttack(pB);
  res.B = { id: B.dbId, pre: b0, post: B.hp, bc: bc(B), dirty: B.dirty };
  // C — 화살로 죽임(hp 20 · 화살 25)
  const [cx, cy] = spots[2];
  const C = H.spawnMob(big, { x: cx, y: cy, hp: 20 });
  const pC = mkPlayer(cx - 150, cy);
  const cHit = shoot(pC, C);
  res.C = { id: C.dbId, pre: 20, gone: !H.mobs.has(C.mid), hit: cHit, bc: bc(C) };
  // D — 사람 공격으로 죽임(hp 15 · 10씩 → 5 → 0 밑)
  const [dx, dy] = spots[3];
  const Dm = H.spawnMob(big, { x: dx, y: dy, hp: 15 });
  const pD = mkPlayer(dx - 20, dy);
  const dh = [];
  for (let i = 0; i < 3 && H.mobs.has(Dm.mid); i++) { pD.lastAttackAt = 0; H.tryAttack(pD); dh.push(Dm.hp); }
  res.D = { id: Dm.dbId, hs: dh, bc: bc(Dm), gone: !H.mobs.has(Dm.mid) };
  // T — 길들인 짐승(진짜 tryFeed — 주인 칸 · 저장 표)
  const [tx, ty] = spots[4];
  const T = H.spawnMob(pet, { x: tx, y: ty });
  const pT = mkPlayer(tx + 10, ty, { [D[pet].tameFood]: 10 });
  for (let i = 0; i < (D[pet].tameNeed || 3); i++) H.tryFeed(pT);
  res.T = { id: T.dbId, type: pet, owner: T.tameOwner || null, dirty: T.dirty };
  // 진짜 주기 저장 한 번
  res.saved = H.saveDirtyMobs();
  res.after = { A: A.dirty, B: B.dirty, T: T.dirty };
  res.allBc = msgs.filter((o) => o.type === 'mob_damaged').map((o) => o.hp);
  H.players.delete('t967_watch');
  return done(process.env.T967_RS_END === 'term' ? 'SIGTERM' : 'SIGKILL');
}

// ───────────────────────────────────────── 부모: 판 여섯 ─────────────────────────────────────────
function parent() {
  const { spawnSync } = require('child_process');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const seen = (m) => console.log(`  [관찰] ${m}`);
  const TMPD = fs.mkdtempSync('/tmp/t967-rs-');
  const PORT0 = 38200 + (process.pid % 8) * 12;   // 판 여섯 × 자식 둘 = 열두 자리(다른 하네스가 안 쓰는 띠)
  let port = PORT0;
  function run(board, end, d975) {
    const key = `${board}-${end}${d975 ? '-d0' : ''}`;
    const db = path.join(TMPD, `${key}.db`), o1 = path.join(TMPD, `${key}-hit.json`), o2 = path.join(TMPD, `${key}-boot.json`);
    const base = Object.assign({}, process.env);
    delete base.T967_MOB_HP; delete base.T975_MOB_DB; delete base.NODE_OPTIONS;
    if (board === 'off') base.T967_MOB_HP = '0';
    if (d975) base.T975_MOB_DB = '0';   // ★[T975] 끔 판(종전 글자)
    const go = (mode, out, extra) => spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, base, { T967_RS_MODE: mode, T967_RS_DB: db, T967_RS_OUT: out, T967_RS_END: end, PORT: String(port++) }, extra || {}) });
    const r1 = go('hit', o1);
    let hit = null; try { hit = JSON.parse(fs.readFileSync(o1, 'utf8')); } catch (e) {}
    if (!hit || hit.err) return { hit, boot: null, sig: r1.signal, err: (hit && hit.err) || `hit 자식 결과 없음(종료 ${r1.status} · 신호 ${r1.signal})` };
    const ids = { A: hit.A.id, B: hit.B.id, C: hit.C.id, T: hit.T.id };
    const r2 = go('boot', o2, { T967_RS_IDS: JSON.stringify(ids) });
    let boot = null; try { boot = JSON.parse(fs.readFileSync(o2, 'utf8')); } catch (e) {}
    return { hit, boot, sig: r1.signal, sig2: r2.signal, err: boot ? null : `boot 자식 결과 없음(종료 ${r2.status} · 신호 ${r2.signal})` };
  }
  console.log('\n=== 짐승(존 몹) hp · DB 행이 재기동을 건너나 — T967 ②(`T967_MOB_HP` 끔 · 켬 × SIGKILL · SIGTERM) · T975 ②(`T975_MOB_DB` 끔 판 둘) ===');
  const R = {};
  for (const board of ['off', 'on']) for (const end of ['kill', 'term']) R[`${board}-${end}`] = run(board, end, false);
  for (const end of ['kill', 'term']) R[`on-${end}-d0`] = run('on', end, true);   // ★[T975] T967 켬 · T975 끔
  const K = (k) => R[k] || {};
  const allOk = Object.values(R).every((r) => r && !r.err);
  if (!allOk) for (const [k, r] of Object.entries(R)) if (r.err) console.log(`  · ${k}: ${r.err}`);
  ok(allOk, '[상황] 판 여섯 다 섰다(자식 hit · boot 결과 · 하네스 문 `saveDirtyMobs` · `spawnMob`)', Object.entries(R).map(([k, r]) => `${k} ${r.err ? '없음' : 'ㅇ'}`).join(' · '));
  if (!allOk) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {} process.exit(1); }

  console.log('\n① 상황 — 맞았고 · 저장 함수가 불렸다(아니면 아래가 자명 통과다)');
  const h = (k) => K(k).hit, b = (k) => K(k).boot;
  const KEYS = ['off-kill', 'off-term', 'on-kill', 'on-term'];   // T967 판 넷(T975 기본 켬)
  const ALL = Object.keys(R);
  ok(ALL.every((k) => h(k).knob === (k.startsWith('on')) && h(k).knob975 === !k.endsWith('-d0')), '[상황] 손잡이가 판대로 섰다(T967 끔 = false · 켬 = true · T975 는 `-d0` 판만 끔)',
    ALL.map((k) => `${k} ${h(k).knob}/${h(k).knob975}`).join(' · '));
  ok(KEYS.every((k) => h(k).spots >= 5 && h(k).A.hit && h(k).A.post < h(k).A.pre && h(k).A.bc.length === 1), '[상황] A 가 화살 한 대에 실제로 맞았다(조용한 자리 · hp 줄고 방송 한 건 · 안 죽음)',
    `${h('on-kill').A.type} ${h('on-kill').A.pre} → ${h('on-kill').A.post}`);
  ok(KEYS.every((k) => h(k).B.post < h(k).B.pre && h(k).B.dirty === true), '[상황] B(대조)가 사람 공격에 맞았고 저장 표를 세웠다(종전에도 세우던 갈래)', `${h('on-kill').B.pre} → ${h('on-kill').B.post}`);
  ok(KEYS.every((k) => h(k).T.owner && h(k).T.dirty === true), '[상황] T 가 길들었고(진짜 `tryFeed`) 저장 표를 세웠다', `${h('on-kill').T.type} 주인 ${h('on-kill').T.owner}`);
  ok(h('off-kill').A.dirty === false && h('on-kill').A.dirty === true, '★① 화살만 맞은 A 의 저장 표 — 끔 안 세움 · 켬 세움(★PM 결함 ①)', `끔 ${h('off-kill').A.dirty} · 켬 ${h('on-kill').A.dirty}`);
  ok(h('off-kill').saved === 0 && h('on-kill').saved >= 3 && h('on-kill').after.A === false && h('on-kill').after.B === false && h('off-kill').after.B === true,
    '★★① 주기 저장 함수 — 끔은 한 마리도 못 적는다(표가 안 내려간다 · 종전 글자) · 켬은 표 세운 몹을 적고 표를 내린다',
    `끔 ${h('off-kill').saved}건(B 표 ${h('off-kill').after.B}) · 켬 ${h('on-kill').saved}건(A · B 표 ${h('on-kill').after.A} · ${h('on-kill').after.B})`);

  console.log('\n② · ③ SIGKILL 재기동(종료 flush 없음 — 죽은 프로세스)');
  const ga = (k, x) => (b(k).got[x] || {});
  const rowHp = (k, x) => (ga(k, x).row ? ga(k, x).row.hp : null);
  const liveHp = (k, x) => (ga(k, x).live ? ga(k, x).live.hp : null);
  seen(`끔: A ${h('off-kill').A.pre} → 맞음 ${h('off-kill').A.post} → 다시 뜸 ${liveHp('off-kill', 'A')} · B ${h('off-kill').B.pre} → ${h('off-kill').B.post} → ${liveHp('off-kill', 'B')}`);
  seen(`켬: A ${h('on-kill').A.pre} → 맞음 ${h('on-kill').A.post} → 다시 뜸 ${liveHp('on-kill', 'A')} · B ${h('on-kill').B.pre} → ${h('on-kill').B.post} → ${liveHp('on-kill', 'B')}`);
  ok(liveHp('on-kill', 'A') === h('on-kill').A.post && rowHp('on-kill', 'A') === h('on-kill').A.post, '★★② 켬 — 화살만 맞은 A 의 hp 가 맞은 값으로 돌아온다(DB 행 · 다시 뜬 몹)', `${liveHp('on-kill', 'A')}`);
  ok(liveHp('on-kill', 'B') === h('on-kill').B.post, '★② 켬 — B(사람 공격)도 맞은 값으로 돌아온다', `${liveHp('on-kill', 'B')}`);
  ok(liveHp('off-kill', 'A') === h('off-kill').A.pre && liveHp('off-kill', 'A') !== h('off-kill').A.post, '★★③ 끔 — A 는 맞기 전 값으로 돌아온다(결함 재현 — ② 가 자명 통과가 아니다)', `${liveHp('off-kill', 'A')}`);
  ok(liveHp('off-kill', 'B') === h('off-kill').B.pre, '★③ 끔 — B 도 맞기 전 값(종전 주기 저장은 갈래를 가리지 않고 한 마리도 못 적었다 — 화살만의 일이 아니었다)', `${liveHp('off-kill', 'B')}`);

  console.log('\n④ SIGTERM 재기동(종료 flush)');
  seen(`끔: A → 다시 뜸 ${liveHp('off-term', 'A')}(맞은 값 ${h('off-term').A.post}) · 켬: A → ${liveHp('on-term', 'A')}(맞은 값 ${h('on-term').A.post})`);
  ok(liveHp('off-term', 'A') === h('off-term').A.post && liveHp('on-term', 'A') === h('on-term').A.post && liveHp('off-term', 'B') === h('off-term').B.post,
    '★④ SIGTERM 이면 끔 · 켬 다 남는다 — 종료 flush 가 표와 상관없이 몹 전부를 적는다(결함은 SIGKILL 창에만 · 이 하네스가 SIGKILL 을 재는 까닭)');

  console.log('\n⑤ 방송 값 0 밑 0(★PM 결함 ② — 죽음 하한 0)');
  const mn = (k) => Math.min(...h(k).allBc);
  seen(`끔: D(hp 15 · 사람 공격) ${h('off-kill').D.hs.join(' → ')} · 방송 ${h('off-kill').D.bc.join(',')} · 켬: ${h('on-kill').D.hs.join(' → ')} · 방송 ${h('on-kill').D.bc.join(',')}`);
  ok(['on-kill', 'on-term'].every((k) => h(k).allBc.length >= 5 && mn(k) === 0 && h(k).D.gone && h(k).D.bc.join() === '5,0'),
    '★★⑤ 켬 — hit 판의 `mob_damaged` hp 가 0 밑으로 안 간다(D 는 5 → 0 에서 멈추고 죽는다 · 죽음 차례 그대로)', `최소 ${mn('on-kill')} · 방송 ${h('on-kill').allBc.length}건`);
  ok(['off-kill', 'off-term'].every((k) => mn(k) < 0 && h(k).D.bc.join() === '5,-5'), '★⑤ 끔 — 같은 판에서 0 밑 방송이 난다(−5 · 위 검사가 문다)', `최소 ${mn('off-kill')}`);

  console.log('\n⑥ [T975] 화살로 죽인 몹 C(hp 20 · 화살 25) — 죽음이 DB 에 닿나');
  const cOf = (k) => (ga(k, 'C').live ? `되살아남 hp ${ga(k, 'C').live.hp}` : (ga(k, 'C').row ? `행 hp ${ga(k, 'C').row.hp}` : '행 없음'));
  seen(ALL.map((k) => `${k} ${cOf(k)}`).join(' · '));
  ok(ALL.every((k) => h(k).C.hit && h(k).C.gone), '[상황] 판마다 C 가 화살 한 대에 실제로 죽었다(맞고 · 존 몹에서 빠짐)');
  ok(KEYS.every((k) => !ga(k, 'C').row && !ga(k, 'C').live), '★★⑥ T975 켬 — 화살로 죽인 C 의 DB 행이 없다(같은 삭제 문 · SIGKILL · SIGTERM · T967 켬 · 끔 다) — 다시 뜬 뒤 안 되살아난다', KEYS.map((k) => `${k} ${cOf(k)}`).join(' · '));
  ok(['on-kill-d0', 'on-term-d0'].every((k) => ga(k, 'C').live && ga(k, 'C').live.hp === 20), '★⑥ T975 끔 — 같은 판에서 C 가 hp 20 으로 되살아난다(결함 재현 — 위가 자명 통과가 아니다)', `${cOf('on-kill-d0')} · ${cOf('on-term-d0')}`);

  console.log('\n⑦ [T975] 길들인 짐승 T — 주인 칸이 재기동을 건너나');
  const own = (k) => (ga(k, 'T').row ? (ga(k, 'T').row.owner || 'NULL') : '행 없음');
  seen(`T(${h('on-kill').T.type} · 주인 ${h('on-kill').T.owner}) 다시 뜬 뒤 주인 칸: ` + ALL.map((k) => `${k} ${own(k)}`).join(' · '));
  const kept = (k) => ga(k, 'T').row && ga(k, 'T').row.owner === h(k).T.owner && ga(k, 'T').live && ga(k, 'T').live.owner === h(k).T.owner;
  ok(kept('on-term') && kept('off-term'), '★★⑦ T975 켬 · SIGTERM — 종료 flush 가 주인 칸을 그대로 넘겨 길들임이 남는다(DB 행 · 다시 뜬 몹 · T967 켬 · 끔 다)', `${own('on-term')} · ${own('off-term')}`);
  ok(own('on-term-d0') === 'NULL', '★⑦ T975 끔 · SIGTERM — 같은 판에서 주인 칸이 NULL(종전 flush 넷만 — 주기 저장이 적어 둔 주인까지 지운다 · 결함 재현)', own('on-term-d0'));
  ok(kept('on-kill') && kept('on-kill-d0'), '⑦ SIGKILL(종료 flush 없음)은 주기 저장의 몫 — T967 켬이면 T975 와 상관없이 남는다', `${own('on-kill')} · ${own('on-kill-d0')}`);
  seen(`T967 끔 · SIGKILL 은 ${own('off-kill')} — 주기 저장이 죽어 주인 칸이 DB 에 닿은 적이 없다(T967 의 몫)`);
  const sa = b('on-kill').saveAll;
  if (sa) seen(`켬 주기 저장 한 번 — 몹 전부 표(${sa.n}마리) ${sa.ms.toFixed(1)}ms · 다시 뜬 존 몹 ${b('on-kill').mobs}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
}
