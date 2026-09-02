#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-claim-v2.js — 사유지 v2 [재민 확정 2026-09-02 · T45] ==========
//
// ★설계 정본 `설계/소속_사유지_기여_설계안.md` §3 · 구현 정본 `server/claims.js`.
//   확정 L-1 S0=9 유지 · L-2 길드 땅 위 개인 선언 기본 개방 · L-3 임시 3일 ·
//   L-4 `pref` 14+14 · L-5 인접 **소급 안 함**.
//
// ★★이 하네스가 재는 것 — 카드의 합격 기준 순서 그대로
//   ⓪ **검사 상황 assert** — 실서버의 정본 함수를 쥐고 있나(랩을 새로 짓지 않았나).
//   ① **종류가 재시작을 넘어 산다.** ★**현재 실패하는 것을 먼저 보인다** — 옛 `insertClaim`
//      (일곱 열)으로 넣은 행을 읽으면 종류가 `undefined` 다. 새 경로는 살아남는다.
//   ② **부활 지점이 재시작을 넘어 산다.** ★실측이 문서보다 나빴다 — `listRespawnOptions` 가
//      `c.ownerId` 를 봤는데 클레임엔 `ownerPid` 밖에 없다 ⇒ **처음부터 한 번도 안 잡혔다.**
//   ③ **인접**: 떨어진 자리 거절 · 변 공유 허용 · **대각 거절** · 첫 셀 예외.
//   ④ **연결성**: ㄷ 자의 **목**을 포기하면 거절 · **끝**은 허용(일부러 갈라지는 픽스처).
//   ⑤ **부재 상태기**: T1 이전/직후/T1+T2 직후 셋으로 `active/held/pref` 3분기 ·
//      임시는 더 짧다(L-3) · `held_by` 3분기(길드/마을/무주)가 **각각 다른 픽스처**에서 나온다.
//   ⑥ **시설 승계**: 이어받은 셀 위의 노를 새 주인이 `_furnaceCanUse` 로 쓴다.
//      ★**새 권한 술어를 안 만들었음을 소스로 확인**한다.
//   ⑦ **econ 무접촉** — 이 배치가 만진 파일에 `sim/` 이 0건.
//   ⑧ ★**검사기 자가 검사** — 일부러 틀린 것을 넣으면 위 판정이 실제로 실패하는가.
//
// 실행: node scripts/test-claim-v2.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37100 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-claim-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CLAIM_ABSENCE = '0';           // 배치 타이머는 끈다 — 상태기는 아래에서 **정본 함수로** 직접 밟는다
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { claims, buildings, players, BUILDING_SIZE: SZ, Claims, db } = H;
const DAY = 24 * 60 * 60 * 1000;

function mkPlayer(name, inv) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'tcl_' + name, name, persistent: false, ws,
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: Object.assign({ wood: 999, stone: 999 }, inv), equipment: [], equipSlots: {}, craftSkill: {} };
  p._msgs = msgs;
  players.set(p.pid, p);
  return p;
}
const lastNote = (p) => (p._msgs.filter((m) => m.type === 'notice').map((m) => m.text).slice(-1)[0] || '');
const clearNotes = (p) => { p._msgs.length = 0; };
// ★셀 하나를 **정본 경로**(`tryClaim`)로 선언한다 — 손으로 `claims.set` 하면 그게 사본이다.
function claimAt(p, cx, cy, kind) {
  p.x = cx * SZ + SZ / 2; p.y = cy * SZ + SZ / 2;
  clearNotes(p);
  H.tryClaim(p, kind || 'personal');
  return lastNote(p);
}
const myCells = (p) => [...claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind !== 'guild')
  .map((c) => `${Math.floor(c.x / SZ)},${Math.floor(c.y / SZ)}`).sort();
function claimIdAt(pid, cx, cy) {
  for (const [id, c] of claims) if (c.ownerPid === pid && Math.floor(c.x / SZ) === cx && Math.floor(c.y / SZ) === cy) return id;
  return null;
}
function wipe(p) { for (const [id, c] of [...claims]) if (c.ownerPid === p.playerId) { if (c.dbId) db.deleteClaim(c.dbId); claims.delete(id); } }
// ★개인 사유지는 **내 길드 영토 안에만** 선다(종전 규칙 — T45 가 안 바꿨다).
//   그래서 인접·연결성을 재려면 먼저 땅을 깔아야 한다. NPC 마을 영토와 **같은 모양**으로 만든다
//   (메모리 전용 · `cells` 를 갖는 유기적 폴리곤 — `spawnGuildClaimsForVillage` 가 그렇게 만든다).
let _gn = 0;
function guildLand(cx, cy, half, tribeId) {
  const id = `gland${_gn++}`;
  const cells = [];
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) cells.push([cx + dx, cy + dy]);
  claims.set(id, { id, dbId: null, ownerPid: `village_lab${_gn}`, ownerName: '랩 길드 영토',
    x: (cx - half) * SZ, y: (cy - half) * SZ, w: (half * 2 + 1) * SZ, h: (half * 2 + 1) * SZ,
    kind: 'guild', cells, guildTribeId: tribeId, guildTribeName: '랩길드', state: 'active' });
  return id;
}

console.log('\n=== 사유지 v2 — 종류·인접·연결성·부재 상태기 (T45) ===');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⓪ 검사 상황 — 실서버의 정본을 쥐고 있나');
{
  ok(typeof H.tryClaim === 'function' && typeof H.tryUnclaim === 'function' && typeof H.listRespawnOptions === 'function',
    '실서버 클레임 함수 셋을 정본 그대로 쥐었다');
  ok(!!Claims && typeof Claims.adjacencyOf === 'function', '`server/claims.js` 정본이 붙어 있다');
  ok(SZ === 32, `셀 크기 ${SZ}px — 사람 클레임은 정확히 1셀이다(문서 §0-ⓐ)`);
  ok(H.CLAIM_SLOT_PERSONAL_START === 9, `개인 슬롯 S0 = ${H.CLAIM_SLOT_PERSONAL_START} (L-1 확정: 9 유지)`);
  ok(Claims.CFG.HOLD_DAYS === 14 && Claims.CFG.HOLD_DAYS_TEMP === 3 && Claims.CFG.PREF_DAYS === 14,
    `시계 확정값 — 개인 T1 ${Claims.CFG.HOLD_DAYS}일 · 임시 ${Claims.CFG.HOLD_DAYS_TEMP}일(L-3) · T2 ${Claims.CFG.PREF_DAYS}일(L-4)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① 종류가 재시작을 넘어 산다 — ★고치기 전엔 무엇이 일어났는지 먼저 보인다');
{
  // ★★**옛 DB 마이그레이션은 별도 프로세스로 잰다.** 이 프로세스는 이미 새 스키마를 열어 뒀으니
  //   여기서 옛 행을 흉내 내면 그건 이행이 아니라 그냥 NULL 삽입이다(1차 판이 그렇게 틀렸다).
  //   ⇒ **옛 여덟 열 스키마 그대로의 DB 파일**을 만들고, 자식 프로세스가 `zone-local-db` 로 연다.
  {
    const LEG = `/tmp/test-claim-legacy-${process.pid}.db`;
    for (const f of [LEG, LEG + '-wal', LEG + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    const { DatabaseSync } = require('node:sqlite');
    const ldb = new DatabaseSync(LEG);
    ldb.exec(`CREATE TABLE claims (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
      created_at INTEGER NOT NULL)`);
    ldb.prepare('INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('tcl_old', '옛사람', 1000 * SZ, 1000 * SZ, SZ, SZ, Date.now());
    const cols0 = ldb.prepare('PRAGMA table_info(claims)').all().map((c) => c.name);
    ldb.close();
    ok(!cols0.includes('kind'), '★상황 assert — 옛 스키마에는 종류 열이 **없다**(이 DB 가 진짜 옛것이다)', cols0.join(','));
    const out = require('child_process').execFileSync(process.execPath, ['-e',
      "const d=require(process.argv[1]);console.log(JSON.stringify(d.getClaims()))",
      path.join(ROOT, 'server', 'zone-local-db.js')],
      { env: Object.assign({}, process.env, { DB_PATH: LEG }), encoding: 'utf8' });
    const rows0 = JSON.parse(out.trim().split('\n').pop());
    ok(rows0.length === 1 && rows0[0].kind === 'personal',
      '① 이행이 **옛 DB 의 행**을 `personal` 로 채운다 — 현행 부팅이 사실상 그렇게 취급해 왔다(`countMyClaims` 의 `else p++`)',
      JSON.stringify(rows0[0] && { kind: rows0[0].kind, state: rows0[0].state }));
    ok(rows0[0] && rows0[0].state === 'active', '① 이행된 행은 `active` 로 선다');
    for (const f of [LEG, LEG + '-wal', LEG + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  }

  // 새 경로 — 세 종류를 넣고 **DB 왕복**으로 읽는다(재시작이 곧 이 왕복이다)
  const ids = {};
  for (const k of ['personal', 'temporary', 'guild']) {
    ids[k] = db.insertClaim({ owner_id: 'tcl_r', owner_name: '왕복', x: (2000 + Object.keys(ids).length) * SZ, y: 2000 * SZ,
      w: SZ, h: SZ, kind: k, guild_tribe_id: k === 'guild' ? 77 : null });
  }
  const rows = db.getClaims();
  const got = {};
  for (const k of Object.keys(ids)) { const r = rows.find((x) => x.id === ids[k]); got[k] = r && r.kind; }
  ok(got.personal === 'personal' && got.temporary === 'temporary' && got.guild === 'guild',
    '① 개인·임시·길드 세 종류가 DB 왕복(=재시작)을 넘는다', JSON.stringify(got));
  const g = rows.find((x) => x.id === ids.guild);
  ok(g && g.guild_tribe_id === 77, '① 길드 id 도 같이 산다 — 이게 없으면 `findGuildClaimContaining` 이 늘 null 이다', `${g && g.guild_tribe_id}`);
  // 그리고 그 종류로 세면 슬롯이 갈린다(§0-ⓐ 파생 ⓐ 가 닫혔다)
  for (const k of Object.keys(ids)) claims.set(`t${k}`, { id: `t${k}`, dbId: ids[k], ownerPid: 'tcl_r', ownerName: '왕복',
    x: 2000 * SZ, y: 2000 * SZ, w: SZ, h: SZ, kind: k, guildTribeId: k === 'guild' ? 77 : null, state: 'active' });
  const cnt = H.countMyClaims('tcl_r');
  ok(cnt.personal === 1 && cnt.temporary === 1 && cnt.guild === 1,
    '① `countMyClaims` 가 `{personal:1, temporary:1, guild:1}` 을 낸다', JSON.stringify(cnt));
  // ★통제: 종류를 지우면 셋이 전부 개인 슬롯을 먹는다(고장의 모양)
  for (const k of Object.keys(ids)) claims.get(`t${k}`).kind = undefined;
  const bad = H.countMyClaims('tcl_r');
  ok(bad.personal === 3, '★①-b 통제 실험: 종류가 없으면 셋이 전부 **개인 슬롯**을 먹는다(고장의 모양)', JSON.stringify(bad));
  for (const k of Object.keys(ids)) { claims.delete(`t${k}`); db.deleteClaim(ids[k]); }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② 부활 지점 — ★실측이 문서보다 나빴다');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const fn = src.slice(src.indexOf('function listRespawnOptions'), src.indexOf('function listRespawnOptions') + 1800);
  ok(!/c\.ownerId\s*!==\s*p\.playerId/.test(fn), '② `listRespawnOptions` 가 더는 없는 필드(`ownerId`)를 안 본다');
  ok(/c\.ownerPid\s*!==\s*p\.playerId/.test(fn), '② 사유지의 진짜 주인 필드(`ownerPid`)를 본다');
  const p = mkPlayer('resp');
  const dbId = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: 3000 * SZ, y: 3000 * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('cresp', { id: 'cresp', dbId, ownerPid: p.playerId, ownerName: p.name, x: 3000 * SZ, y: 3000 * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  const opts = H.listRespawnOptions(p);
  ok(opts.some((o) => o.claimId === 'cresp'), '② 내 개인 사유지가 부활 지점으로 잡힌다', `${opts.length}곳`);
  // ★통제: 종류가 사라지면(=옛 결함) 다시 안 잡힌다 — 이 판정이 종류에 실제로 매달려 있다
  claims.get('cresp').kind = undefined;
  ok(!H.listRespawnOptions(p).some((o) => o.claimId === 'cresp'),
    '★②-b 통제 실험: 종류가 사라지면 부활 지점에서 빠진다 — ①의 수리가 이 판정을 떠받친다');
  claims.get('cresp').kind = 'personal';
  // 개방(free)된 땅은 더는 내 집이 아니다
  claims.get('cresp').state = 'free';
  ok(!H.listRespawnOptions(p).some((o) => o.claimId === 'cresp'), '② 개방된 땅은 부활 지점이 아니다');
  claims.delete('cresp'); db.deleteClaim(dbId);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ 인접 — 변은 되고 모서리는 안 된다');
{
  const p = mkPlayer('adj');
  p.tribeId = 900; p.tribeName = '랩길드';
  const BX = 4000, BY = 4000;
  const gl = guildLand(BX + 20, BY, 40, 900);
  wipe(p);
  ok(!!H.findGuildClaimContaining(BX * SZ + SZ / 2, BY * SZ + SZ / 2, 900),
    '③ 상황 assert — 검사 자리가 내 길드 영토 안이다(아니면 아래가 전부 "길드 영토 밖"으로 죽는다)');
  ok(/사유지 설치/.test(claimAt(p, BX, BY)), '③ 첫 셀은 어디든 된다(내 셀 0개 — 예외)', `${myCells(p).length}칸`);
  ok(/붙여서만/.test(claimAt(p, BX + 5, BY)), '③ 떨어진 자리는 거절', '');
  ok(/모서리로만/.test(claimAt(p, BX + 1, BY + 1)), '③ **대각은 거절** — 모서리로만 닿는 땅은 걸어서 안 이어진다');
  ok(/사유지 설치/.test(claimAt(p, BX + 1, BY)), '③ 변을 공유하면 허용');
  ok(/사유지 설치/.test(claimAt(p, BX + 1, BY + 1)), '③ 이제 그 대각 자리도 된다 — 옆 셀이 생겨 **변으로** 닿기 때문이다');
  ok(myCells(p).length === 3, '③ 상황 assert — 실제로 3칸이 섰다(자명 통과가 아니다)', myCells(p).join(' '));
  // ★L-5 소급 안 함 — 흩뿌려진 옛 셀 옆에도 계속 이어 붙을 수 있다
  const far = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: (BX + 40) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('cfar', { id: 'cfar', dbId: far, ownerPid: p.playerId, ownerName: p.name, x: (BX + 40) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  ok(/사유지 설치/.test(claimAt(p, BX + 41, BY)), '③ L-5: 옛 흩뿌린 셀 옆에도 이어 붙는다(규칙을 소급하지 않는다)');
  wipe(p); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 연결성 — ㄷ 자의 목을 빼면 갈라진다');
{
  const p = mkPlayer('bfs');
  p.tribeId = 901;
  //  (0,0) (1,0) (2,0)      ← 가로 막대. (1,0) 이 **목**이고 (0,0)·(2,0) 이 **끝**이다.
  const BX = 5000, BY = 5000;
  const gl = guildLand(BX + 15, BY, 40, 901);
  wipe(p);
  claimAt(p, BX, BY); claimAt(p, BX + 1, BY); claimAt(p, BX + 2, BY);
  ok(myCells(p).length === 3, '④ 상황 assert — 일부러 갈라질 수 있는 모양(막대 3칸)을 세웠다', myCells(p).join(' '));
  const neck = claimIdAt(p.playerId, BX + 1, BY), end = claimIdAt(p.playerId, BX + 2, BY);
  const spNeck = Claims.unclaimSplits(p.playerId, neck), spEnd = Claims.unclaimSplits(p.playerId, end);
  ok(spNeck.splits && spNeck.before === 1 && spNeck.after === 2, '④ 목을 빼면 1덩이 → 2덩이', JSON.stringify(spNeck));
  ok(!spEnd.splits, '④ 끝을 빼면 안 갈라진다', JSON.stringify(spEnd));
  clearNotes(p); H.tryUnclaim(p, neck);
  ok(/갈라진다/.test(lastNote(p)) && claims.has(neck), '④ 목 포기는 **정본 경로에서 거절**된다', JSON.stringify(lastNote(p)));
  clearNotes(p); H.tryUnclaim(p, end);
  ok(/해제/.test(lastNote(p)) && !claims.has(end), '④ 끝 포기는 통과한다');
  // ★L-5 — 이미 갈라져 있는 사람도 버릴 수 있어야 한다(절대 기준이면 아무것도 못 버린다)
  const iso = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: (BX + 30) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('ciso', { id: 'ciso', dbId: iso, ownerPid: p.playerId, ownerName: p.name, x: (BX + 30) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  ok(Claims.components(Claims.mySet(p.playerId)) === 2, '④ 상황 assert — 지금 내 땅은 이미 2덩이다', '');
  clearNotes(p); H.tryUnclaim(p, 'ciso');
  ok(!claims.has('ciso'), '④ L-5: 이미 갈라진 사람도 외딴 셀을 버릴 수 있다(증분 기준이라서)');
  wipe(p); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ 부재 상태기 — 3분기 · 임시는 더 짧다 · held_by 3갈래');
{
  const per = { kind: 'personal' }, tmp = { kind: 'temporary' };
  const T1 = Claims.CFG.HOLD_DAYS * DAY, T2 = Claims.CFG.PREF_DAYS * DAY, T3 = Claims.CFG.FREE_DAYS * DAY;
  ok(Claims.stageFor(per, T1 - DAY) === 'active', `⑤ T1 이전(${Claims.CFG.HOLD_DAYS - 1}일) → active`);
  ok(Claims.stageFor(per, T1 + DAY) === 'held', '⑤ T1 직후 → held (보관 — 몰수가 아니다)');
  ok(Claims.stageFor(per, T1 + T2 + DAY) === 'pref', '⑤ T1+T2 직후 → pref (우선권 창)');
  ok(Claims.stageFor(per, T1 + T2 + T3 + DAY) === 'free', '⑤ 창이 지나면 → free (세계의 것)');
  // L-3 — 임시는 더 짧다. **같은 부재에서 답이 갈려야** 그 손잡이가 살아 있는 것이다.
  const at = (Claims.CFG.HOLD_DAYS_TEMP + 1) * DAY;
  ok(Claims.stageFor(tmp, at) === 'held' && Claims.stageFor(per, at) === 'active',
    `⑤ L-3: 같은 ${Claims.CFG.HOLD_DAYS_TEMP + 1}일 부재에 임시는 held · 개인은 아직 active`,
    `${Claims.stageFor(tmp, at)} vs ${Claims.stageFor(per, at)}`);
  // held_by 3갈래 — **각각 다른 픽스처**에서 나온다
  ok(Claims.heldByOf({ tribe_id: 12, tools_json: '{}' }) === 'guild:12', '⑤ 길드원 → `guild:<id>`');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: JSON.stringify({ member: { zone: 'hanbando', vid: 5 } }) }) === 'village:5',
    '⑤ 마을 소속자(T11 이 몸에 실어 둔 그 필드) → `village:<vid>`');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: '{}' }) === null, '⑤ 무소속 → 무주(null)');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: JSON.stringify({ member: { zone: 'nippon', vid: 5 } }) }) === null,
    '⑤ 다른 존의 소속은 이 존에서 우선권이 아니다');
  // 우선권 — 누가 가져갈 수 있나
  const held = { kind: 'personal', ownerPid: 'x', state: 'held', heldBy: null };
  const prefG = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: 'guild:12' };
  const prefV = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: 'village:5' };
  const prefN = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: null };
  const free = { kind: 'personal', ownerPid: 'x', state: 'free', heldBy: null };
  const mate = { playerId: 'y', tribeId: 12, member: null };
  const vill = { playerId: 'y', tribeId: null, member: { vid: 5 } };
  const nobody = { playerId: 'y', tribeId: null, member: null };
  ok(!Claims.takeableBy(nobody, held).ok, '⑤ `held` 는 아무도 못 가져간다 — 보관이 보관이다');
  ok(Claims.takeableBy(mate, prefG).ok && !Claims.takeableBy(nobody, prefG).ok, '⑤ 길드 우선권은 그 길드원만');
  ok(Claims.takeableBy(vill, prefV).ok && !Claims.takeableBy(mate, prefV).ok, '⑤ 마을 우선권은 그 마을 사람만');
  ok(!Claims.takeableBy(nobody, prefN).ok, '⑤ 무주는 창 동안 아무도 못 가져간다(개방을 기다린다)');
  ok(Claims.takeableBy(nobody, free).ok, '⑤ 개방된 땅은 아무나');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 승계 — 셀을 이어받으면 그 위 시설도 따라온다 (새 권한 술어 0)');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const csrc = fs.readFileSync(path.join(ROOT, 'server', 'claims.js'), 'utf8');
  const n = (src.match(/_furnaceCanUse\(/g) || []).length;
  ok(n >= 3, `⑥ 상황 assert — `+'`_furnaceCanUse`'+` 호출부가 실제로 있다 (${n}곳)`);
  ok(!/function\s+\w*[Cc]anUse/.test(csrc) && !/tribeId\s*===\s*.*tribeId/.test(csrc),
    '⑥ ★`claims.js` 에 **권한 술어를 다시 적지 않았다** — 승계는 주인 필드를 바꿀 뿐이다');

  const owner = mkPlayer('own'), heir = mkPlayer('heir');
  owner.tribeId = 902; heir.tribeId = 902;
  const CX = 6000, CY = 6000;
  const gl = guildLand(CX + 10, CY, 40, 902);
  wipe(owner); wipe(heir);
  claimAt(owner, CX, CY);
  const cid = claimIdAt(owner.playerId, CX, CY);
  const c = claims.get(cid);
  const b = { id: 'bf1', dbId: null, type: 'furnace', ownerId: owner.playerId, ownerName: owner.name,
    x: CX * SZ + SZ / 2, y: CY * SZ + SZ / 2, data: { owner: owner.playerId, tribeId: null } };
  buildings.set('bf1', b);
  ok(H._furnaceCanUse(owner, b) && !H._furnaceCanUse(heir, b), '⑥ 상황 assert — 지금은 주인만 그 노를 쓴다');
  // 우선권 창을 열고 상속인이 이어받는다 — **정본 경로**(`tryClaim`)로
  Claims.setState(cid, c, 'pref', 'village:9', Date.now());
  heir.member = { vid: 9, zone: 'hanbando' };
  const note = claimAt(heir, CX, CY);
  ok(/이어받았다/.test(note), '⑥ 우선권이 있는 사람이 그 자리를 이어받는다', JSON.stringify(note));
  ok(claims.get(cid).ownerPid === heir.playerId, '⑥ 셀의 주인이 바뀌었다');
  ok(claims.get(cid).state === 'active' && !claims.get(cid).heldBy, '⑥ 이어받은 땅은 다시 active 다');
  ok(H._furnaceCanUse(heir, b) && !H._furnaceCanUse(owner, b),
    '⑥ ★그 위의 노를 **새 주인이** 쓴다 — 같은 술어 `_furnaceCanUse` 그대로');
  // 우선권이 없으면 못 가져간다
  const c2id = (() => { wipe(owner); claimAt(owner, CX + 20, CY); return claimIdAt(owner.playerId, CX + 20, CY); })();
  Claims.setState(c2id, claims.get(c2id), 'pref', 'guild:99', Date.now());
  const stranger = mkPlayer('stranger');
  stranger.tribeId = 902;                       // 길드 영토 요건은 통과시키되(자리 문제 아님)
  const note2 = claimAt(stranger, CX + 20, CY); // 우선권은 `guild:99` 라 이 사람에겐 없다
  ok(/길드 사람만/.test(note2), '⑥ 우선권이 없으면 거절', JSON.stringify(note2));
  ok(claims.get(c2id).ownerPid === owner.playerId, '⑥ 거절이 말뿐이 아니다 — 주인이 안 바뀌었다');
  buildings.delete('bf1'); wipe(owner); wipe(heir); wipe(stranger); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 복귀 · 상자 잠김 · econ 무접촉');
{
  const p = mkPlayer('back');
  p.tribeId = 903;
  const gl = guildLand(7000, 7000, 10, 903);
  wipe(p);
  claimAt(p, 7000, 7000);
  const cid = claimIdAt(p.playerId, 7000, 7000);
  Claims.setState(cid, claims.get(cid), 'held', null, Date.now());
  const chest = { id: 'bch1', dbId: null, type: 'chest', ownerId: p.playerId, ownerName: p.name,
    x: 7000 * SZ + SZ / 2, y: 7000 * SZ + SZ / 2, data: { wood: 3 } };
  buildings.set('bch1', chest);
  const other = mkPlayer('thief');
  ok(!!Claims.chestLocked(other, chest), '⑦ 보관 중인 **무주** 사유지의 상자는 남에게 잠긴다', JSON.stringify(Claims.chestLocked(other, chest)));
  ok(!Claims.chestLocked(p, chest), '⑦ 주인 본인은 언제나 연다');
  Claims.setState(cid, claims.get(cid), 'held', 'guild:12', Date.now());
  ok(!Claims.chestLocked(other, chest), '⑦ 길드가 맡은 땅은 안 잠근다 — 그쪽이 쓰라고 맡은 것이다');
  Claims.setState(cid, claims.get(cid), 'held', null, Date.now());
  ok(Claims.onPlayerActive(p) === 1 && claims.get(cid).state === 'active', '⑦ 돌아오면 맡겨 둔 땅이 **전량** 돌아온다');
  Claims.setState(cid, claims.get(cid), 'free', null, Date.now());
  ok(Claims.onPlayerActive(p) === 0 && claims.get(cid).state === 'free', '⑦ 개방된 땅은 안 돌아온다 — 이미 세계의 것이다');
  buildings.delete('bch1'); wipe(p); claims.delete(gl);

  const csrc = fs.readFileSync(path.join(ROOT, 'server', 'claims.js'), 'utf8');
  ok(!/require\(.*sim\//.test(csrc) && !/economy-sim/.test(csrc), '⑦ econ 무접촉 — `claims.js` 가 `sim/` 을 안 부른다');
  ok(!/gameDay/.test(csrc.replace(/★[^\n]*gameDay[^\n]*/g, '')) || /일부러 안 넘긴다|gameDay` 를 아예 받지 않는다/.test(csrc),
    '⑦ 부재 시계는 **실시간**이다 — 게임일을 안 받는다(환산해 보여 주면 거짓말이 된다)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑧ ★이 하네스가 실패할 줄 아는가 — 일부러 틀린 것을 넣는다');
{
  // ⑧-a 인접 검사가 **대각을 실제로 가르는가** — 같은 상태에서 두 답이 달라야 한다.
  //   ★정본 함수를 갈아 끼우지 않는다(1차 판이 `Claims.mySet` 을 monkey-patch 했는데
  //     `adjacencyOf` 는 모듈 안의 것을 부르므로 **아무 효과가 없었고 검사는 자명 통과**했다).
  //     실제 클레임을 하나 세우고 그 위에서 잰다.
  {
    const q = mkPlayer('ctl');
    const CX = 8000, CY = 8000;
    const gl = guildLand(CX, CY, 6, 904);
    q.tribeId = 904; wipe(q);
    claimAt(q, CX, CY);
    ok(Claims.mySet(q.playerId).size === 1, '⑧-a 상황 assert — 실제로 한 칸을 세웠다(빈 집합이면 아래가 자명 통과다)');
    const side = Claims.adjacencyOf(q.playerId, CX + 1, CY), diag = Claims.adjacencyOf(q.playerId, CX + 1, CY + 1);
    ok(side.ok && !side.first && !diag.ok && diag.diag,
      '⑧-a 통제 실험: 같은 상태에서 변은 통과·모서리는 거절(상수가 아니다)',
      `변 ${side.ok} · 대각 ${diag.ok}(diag=${diag.diag})`);
    wipe(q); claims.delete(gl);
  }
  // ⑧-b 연결성 산수가 **실제로 덩이를 세는가**
  ok(Claims.components(new Set(['0,0', '1,0', '2,0'])) === 1 && Claims.components(new Set(['0,0', '2,0'])) === 2,
    '⑧-b 통제 실험: 이어진 3칸은 1덩이 · 떨어진 2칸은 2덩이');
  // ⑧-c 상태기가 **문턱 위아래에서 답을 바꾸는가**(상수면 여기서 걸린다)
  const T1 = Claims.CFG.HOLD_DAYS * DAY;
  ok(Claims.stageFor({ kind: 'personal' }, T1 - 1) !== Claims.stageFor({ kind: 'personal' }, T1 + 1),
    '⑧-c 통제 실험: T1 을 1ms 넘기면 답이 바뀐다');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
