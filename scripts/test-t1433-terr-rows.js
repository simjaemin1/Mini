#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1433-terr-rows.js — 영토 행 묶어 적기(`T1433_TERR_SEQ` 끔 기본 · `=1` 켬) [T1433 · S2 · 2026-11-22] ==========================
//
// ★지키는 것(정본 함수를 그대로 부른다 — 마을 몫은 임시 DB + `__labProbe` 주입구 · 부팅 몫은 씨앗 세계 사본으로 존을 띄운다 `t538-boot-mem --boot`):
//   ① 글 꼴(`server/terr-rows.js`) — 차례 그대로 · 가로 줄 묶음 · 뺌 · 증거 · 되읽기 = Set 뜻(같은 칸 두 번 = 그대로 · 뺐다 다시 들면 끝으로)
//   ② 끔 = 종전 — `_terrAdd` 가 칸마다 `terr` 행 하나(묶음 행 0) · `_t1238Remove` 는 그 칸 행을 지운다(뺌 토막 0) · 묶음 행 0 인 DB 는 종전 문장으로 읽는다
//   ③ 켬 — `_terrAdd` 한 번 = 묶음 행 하나(칸 행 0 · 같은 칸이 행에 한 번) · 풀린 칸(`_t1238Remove`)은 다시 읽어도 없다 · 뺐다 다시 든 칸은 끝으로 ·
//      되읽은 차례 = 메모리 차례 · 부팅 반지름(`getVillageFarthest`) = 칸 행 판의 그 값
//   ④ 겹친 칸 — 묶음 행이 있는 DB 의 가르기(`_t1433Contest` — 메모리 집합 + 그 칸만 되읽기) = 칸 행 DB 의 SQL(`getTerrContestOwners`) 같은 답
//   ⑤ 이관 한 거래 — `_t1433CompactAll` 이 둘째 마을에서 죽으면 DB 가 통째로 앞 그대로 · 성공하면 마을마다 묶음 행 하나(겹친 칸의 진 쪽 · 같은 칸 두 행이 빠진다 ·
//      죽은 행이 더 멀면 증거) · 다시 부르면 쓰기 0
//   ⑥ 존 부팅(씨앗 세계 사본 + 마을마다 영토 행 · 같은 칸 두 행 · 두 마을이 가진 칸) — 끔 부팅 지문 = 켬 부팅(이관) = 이관한 DB 끔 부팅(되돌림) = 이관한 DB 켬 다시 부팅(쓰기 0) ·
//      이관 뒤 칸 행 0 · 묶음 행 = 영토 있는 마을 수 · 이관 도구 `--forward` 행 = 부팅 이관 행 · `--back` 한 DB 의 종전 로드(칸 행 SQL — 옛 코드의 글자) = 끔 부팅 영토 지문
//   ⑦ 미끼 셋(한 자리만 바꾼 사본 · 정본 파일 무변): rmkeep(풀린 칸의 뺌 토막을 안 쓴다 → ③ 빨강) · twice(켬에서도 칸 행을 같이 적는다 → ③ 빨강) ·
//      skipmig(부팅 이관을 건너뛴다 → ⑥ 빨강)
//
// 실행: node scripts/test-t1433-terr-rows.js        env: T1433H_SKIP_BOOT=1(⑥ 건너뜀 — 손으로 빨리 볼 때만 · 러너는 다 돈다)
'use strict';
if (require.main === module && !process.env.T1433H_CHILD) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const VSF = 'server/villages.js';
const CHILD = process.env.T1433H_CHILD || '', MUT = process.env.T1433H_MUT || '';

// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자]
const BAITS = {
  rmkeep: [VSF, "      if ((T1433_TERR_SEQ || _t1433SeqV.has(vil.dbId)) && typeof state.db.insertTerrSeq === 'function') state.db.insertTerrSeq(vil.dbId, vil.ccx, vil.ccy, [[TerrRows.DEL, x, y]]);\n", ''],
  twice: [VSF, '    } else\n    if (state.db && state.db.insertVillageBuilding && vil.dbId != null && added.size) {', '    }\n    if (state.db && state.db.insertVillageBuilding && vil.dbId != null && added.size) {'],
  skipmig: [VSF, "    if (T1433_TERR_SEQ && typeof db.terrCompact === 'function') _t1433CompactAll(db);", "    if (false) _t1433CompactAll(db);"],
};

// ══ 아이 — 마을 몫(임시 DB · 정본 함수) ══════════════════════════════════════════════════════════════════════════════
if (CHILD) {
  const out = { arm: CHILD, mut: MUT || null, err: null };
  try {
    process.env.ENABLE_VILLAGES = '0';
    process.env.DB_PATH = path.join(os.tmpdir(), `t1433h-${process.pid}.db`);
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + s); } catch (e) {} }
    if (CHILD === 'on') process.env.T1433_TERR_SEQ = '1'; else delete process.env.T1433_TERR_SEQ;
    if (MUT) {   // 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
      const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
      M._extensions['.js'] = function (m, f) { if (f !== path.join(ROOT, B[0])) return old(m, f); m._compile(fs.readFileSync(f, 'utf8').replace(B[1], B[2]), f); };
    }
    const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
    const DB = quiet(() => require(path.join(ROOT, 'server/zone-local-db.js')));
    const V = quiet(() => require(path.join(ROOT, VSF)));
    const TR = require(path.join(ROOT, 'server/terr-rows.js'));
    out.knob = V.T1433_TERR_SEQ;
    const db = DB.db;
    const n = (sql, ...a) => db.prepare(sql).get(...a).n;
    const ta = { isBlocked: () => false, isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
    const deps = { players: new Map(), dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {}, t325TreesAtCell: () => [], t325CutTreeAt: () => null,
      t325LootOf: () => ({}), clearTreesInCells: () => 0, t1238BuiltCells: () => null };
    // 마을 셋 — A(가운데 1000,1000 · 9×9) · B(동쪽 1008 · 9×9 — A 와 한 줄 겹친다) · C(먼 곳)
    const mkV = (name, cx, cy) => DB.insertVillage({ zone: 'hanbando', name, cx, cy, population: 10, econ_state: null, day: 0 });
    const ids = { A: mkV('A', 1000, 1000), B: mkV('B', 1008, 1000), C: mkV('C', 2000, 2000) };
    const ins = (vid, x, y) => DB.insertVillageBuilding({ village_id: vid, type: 'terr', cx: x, cy: y, floors: 0, data: null });
    ins(ids.B, 1004, 1002);   // B 가 먼저 가진 겹친 칸 하나(A 의 행보다 id 가 작다)
    ins(ids.A, 2010, 2000);   // A 가 먼저 가진 먼 칸 — C 의 같은 칸 행은 죽은 행이 되고 C 의 가장 먼 점이다(이관 증거 `@`)
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) ins(ids.A, 1000 + dx, 1000 + dy);
    ins(ids.A, 1001, 1001);   // 같은 칸 두 행(A)
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!(dx === -4 && dy === 2)) ins(ids.B, 1008 + dx, 1000 + dy);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) ins(ids.C, 2000 + dx, 2000 + dy);
    ins(ids.C, 2010, 2000);
    DB.insertVillageBuilding({ village_id: ids.A, type: 'house', cx: 1003, cy: 999, floors: 1, data: null });   // 칸 행 아닌 행(반지름 · 다른 행 그대로)
    const loadSet = (vid) => { const s = new Set(); DB.eachVillageCell(vid, 'terr', (x, y) => s.add(x + ',' + y)); return s; };
    const mkVil = (name) => ({ dbId: ids[name], name, ccx: name === 'A' ? 1000 : name === 'B' ? 1008 : 2000, ccy: name === 'C' ? 2000 : 1000, _terrSet: loadSet(ids[name]), _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
      _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [], _crop: new Map(), econ: null });
    const vils = ['A', 'B', 'C'].map(mkVil);
    const [vA, vB, vC] = vils;
    const radius = (vid, cx, cy) => { let m = 4; for (const f of DB.getVillageFarthest(vid, cx, cy)) { const r = Math.hypot(f.cx - cx, f.cy - cy); if (r > m) m = r; } return +m.toFixed(6); };
    quiet(() => { V.__labProbe._t569Probe.setup({ ta, villages: vils, db: DB }); V.__labProbe._t400Probe.setup({ deps, dayMs: 250, world: { day: 10 } }); V.__labProbe._t1238Probe.setup({ villages: vils, day: 10 }); });
    const terrRows = () => n("SELECT COUNT(*) n FROM village_buildings WHERE type = 'terr'"), seqRows = () => n("SELECT COUNT(*) n FROM village_buildings WHERE type = 'terrseq'");
    const ord = (s) => [...s].join(';');
    out.pre = { terr: terrRows(), seq: seqRows(), A: vA._terrSet.size, B: vB._terrSet.size };
    out.raw0 = { A: ord(loadSet(ids.A)), B: ord(loadSet(ids.B)), C: ord(loadSet(ids.C)) };
    //   부팅과 같은 되읽기 — 마을마다 `eachVillageCell` → 겹친 칸 가르기(묶음 행 있으면 `_t1433Contest` · 없으면 SQL — 존 부팅과 같은 갈래) → 차례 글
    const bootLike = () => {
      const tmp = vils.map((v) => Object.assign({}, v, { _terrSet: loadSet(v.dbId) }));
      const any = vils.some((v) => DB.terrHasSeq(v.dbId));
      quiet(() => V.__labProbe._t569Probe.setup({ villages: tmp }));
      try { V.__labProbe._t569Probe.resolve(any ? V._t1433Contest(DB) : DB.getTerrContestOwners()); } finally { quiet(() => V.__labProbe._t569Probe.setup({ villages: vils })); }
      return { A: ord(tmp[0]._terrSet), B: ord(tmp[1]._terrSet), C: ord(tmp[2]._terrSet) };
    };
    // ④ 겹친 칸 — 칸 행 DB(SQL) ↔ 메모리 + 되읽기(묶음 행 DB 에서 쓰는 길)
    const sqlOwn = DB.getTerrContestOwners().map((o) => `${o.cx},${o.cy}:${o.village_id}`).sort();
    const jsOwn = V._t1433Contest(DB).map((o) => `${o.cx},${o.cy}:${o.village_id}`).sort();
    out.contest = { sql: sqlOwn, js: jsOwn, same: sqlOwn.join('|') === jsOwn.join('|') };
    V.__labProbe._t569Probe.resolve(DB.getTerrContestOwners());   // 부팅과 같은 가르기(메모리)
    out.mem0 = { A: ord(vA._terrSet), B: ord(vB._terrSet), C: ord(vC._terrSet) };
    out.rad0 = { A: radius(ids.A, 1000, 1000), B: radius(ids.B, 1008, 1000), C: radius(ids.C, 2000, 2000) };
    if (CHILD === 'on') {
      // ⑤ 이관 — 둘째 마을에서 죽는 db(같은 정본 + 그 자리만 던진다) → 통째로 앞 그대로
      let calls = 0;
      const bad = Object.assign(Object.create(DB), { terrCompact: (...a) => { if (++calls === 2) throw new Error('이관 도중 죽음(하네스)'); return DB.terrCompact(...a); } });
      const r0 = quiet(() => V._t1433CompactAll(bad));
      out.fail = { r: r0, terr: terrRows(), seq: seqRows(), raw: ord(loadSet(ids.A)) === out.raw0.A && ord(loadSet(ids.B)) === out.raw0.B && ord(loadSet(ids.C)) === out.raw0.C, flagA: V._t1433SeqV.has(ids.A) };
      const r1 = quiet(() => V._t1433CompactAll(DB));
      out.mig = { r: r1, terr: terrRows(), seq: seqRows(), perVil: db.prepare("SELECT village_id v, COUNT(*) n FROM village_buildings WHERE type = 'terrseq' GROUP BY village_id ORDER BY village_id").all().map((r) => r.n),
        A: ord(loadSet(ids.A)) === out.mem0.A, B: ord(loadSet(ids.B)) === out.mem0.B, C: ord(loadSet(ids.C)) === out.mem0.C,
        rad: { A: radius(ids.A, 1000, 1000), B: radius(ids.B, 1008, 1000), C: radius(ids.C, 2000, 2000) }, house: n("SELECT COUNT(*) n FROM village_buildings WHERE type = 'house'") };
      const r2 = quiet(() => V._t1433CompactAll(DB));
      out.mig2 = { r: r2, seq: seqRows(), maxId: n('SELECT MAX(id) n FROM village_buildings') };
    }
    // ②③ 쓰기 — 더함(새 칸 셋 · 가로 줄 둘 + 하나) · 풀림 · 다시 듦
    const id0 = n('SELECT MAX(id) n FROM village_buildings');
    const t0 = terrRows(), s0 = seqRows();
    const add1 = ['1005,995', '1006,995', '990,1000'];
    const got = quiet(() => V._terrAdd(vA, add1, null, false));
    const newRows = db.prepare('SELECT type, cx, cy, data FROM village_buildings WHERE id > ? ORDER BY id').all(id0);
    let stored = 0; for (const r of newRows) { if (r.type === 'terr') stored++; else if (r.type === 'terrseq') TR.decode(r.data, (op) => { if (op === TR.ADD) stored++; }); }
    { const b = bootLike(); out.add = { got, terr: terrRows() - t0, seq: seqRows() - s0, stored, reload: b.A === ord(vA._terrSet) && b.B === ord(vB._terrSet) && b.C === ord(vC._terrSet), size: vA._terrSet.size }; }
    const gone = '999,999';
    const had = vA._terrSet.has(gone);
    const rm = quiet(() => V._t1238Remove(vA, gone));
    out.rm = { had, rm, mem: vA._terrSet.has(gone), reload: bootLike().A.split(';').includes(gone), terr: terrRows(), seq: seqRows() };
    quiet(() => V._terrAdd(vA, [gone], null, false));
    const L = bootLike().A.split(';'), M = [...vA._terrSet];
    out.back = { memLast: M[M.length - 1] === gone, reloadLast: L[L.length - 1] === gone, same: L.join(';') === M.join(';') };
    out.rad1 = radius(ids.A, 1000, 1000);
    out.stat = V._t1433Stat;
    if (CHILD === 'on') {   // ⑥′ 지형 처리 도구(t721-apply) — 묶음 행 마을의 막힌 칸(사본에만 · 뺌 토막)
      const W3 = 3000, bx = 1002, by = 1002, cells = [by * W3 + bx];   // 칸 하나(작은 Buffer — t721 디코더가 풀 조각이 아니라 제 바이트만 읽는지도 같이 본다)
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't1433h-721-')), diffF = path.join(dir, 'diff.json'), outF = path.join(dir, 'out.db');
      fs.writeFileSync(diffF, JSON.stringify({ W: W3, H: W3, zone: 'hanbando', old: 'a', new: 'b', cells: { '통행→막힘': Buffer.from(new Uint32Array(cells).buffer).toString('base64') } }));
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts/t721-apply.js'), diffF, '--db', process.env.DB_PATH, '--apply', '--out', outF], { cwd: ROOT, encoding: 'utf8' });
      let S = null; try { const { DatabaseSync } = require('node:sqlite'); const d2 = new DatabaseSync(outF);
        S = TR.replay(d2.prepare("SELECT id, type, cx, cy, data FROM village_buildings WHERE village_id = ? AND type IN ('terr','terrseq') ORDER BY id").all(ids.A)); d2.close(); } catch (e) {}
      out.t721 = { rc: r.status, has: S ? S.has(bx + ',' + by) : null, size: S ? S.size : null, mem: vA._terrSet.size, memHas: vA._terrSet.has(bx + ',' + by), tail: String(r.stdout || '').slice(-200) };
      for (const f of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} } try { fs.rmdirSync(dir); } catch (e) {}
    }
  } catch (e) { out.err = String((e && e.stack) || e).slice(0, 600); }
  console.log('@@T1433 ' + JSON.stringify(out));
  try { for (const s of ['', '-wal', '-shm']) fs.unlinkSync(process.env.DB_PATH + s); } catch (e) {}
  process.exit(0);
}

// ══ 어미 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const J = (o) => JSON.stringify(o);
function child(arm, mut) {
  const env = Object.assign({}, process.env, { T1433H_CHILD: arm });
  delete env.T1433_TERR_SEQ; if (mut) env.T1433H_MUT = mut; else delete env.T1433H_MUT;
  const r = spawnSync(process.execPath, ['--no-warnings', __filename], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000, maxBuffer: 64 << 20 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1433 '));
  return line ? JSON.parse(line.slice(8)) : { err: 'no output · ' + String(r.stderr || '').slice(-400) };
}
const siteN = (name) => { const B = BAITS[name]; return LB.count(fs.readFileSync(path.join(ROOT, B[0]), 'utf8'), B[1]); };

console.log('\n=== T1433 — 영토 행 묶어 적기(끔 = 종전 · 켬 = 마을 하나 하루 몫 = 행 하나 · 부팅 이관 한 거래) ===');
// ① 글 꼴
console.log('\n① 글 꼴(terr-rows)');
{
  let TR = null; try { TR = require(path.join(ROOT, 'server/terr-rows.js')); } catch (e) { ok(false, '글 꼴 모듈(`server/terr-rows.js`)이 있다', String(e.message).slice(0, 120)); }
  if (TR) {
  const ops = [[1, 10, 5], [1, 11, 5], [1, 12, 5], [1, 20, 7], [-1, 11, 5], [0, 40, 40], [1, 11, 5], [1, -3, -4], [1, 10, 5]];
  const s = TR.encode(ops, 10, 5), back = []; TR.decode(s, (op, x, y) => back.push([op, x, y]));
  ok(s === '1|10,5|0,0,3;10,2;!1,0;@30,35;1,0;-13,-9;0,0' && J(back) === J(ops), '차례 그대로 되읽는다(가로 줄 셋 = 한 토막 · 뺌 · 증거 · 음수 좌표)', s);
  const S = [...TR.replay([{ type: 'terr', cx: 10, cy: 5 }, { type: 'terrseq', data: s }])];
  ok(J(S) === J(['10,5', '12,5', '20,7', '11,5', '-3,-4']), '되읽기 = Set 뜻 — 같은 칸 두 번은 그대로(처음 자리) · 뺐다 다시 든 칸은 끝으로 · 증거는 칸이 아니다', J(S));
  let threw = false; try { TR.decode('2|0,0|1,1', () => {}); } catch (e) { threw = true; }
  ok(threw, '모르는 꼴(판 2)은 던진다 — 조용히 0 칸으로 읽지 않는다');
  }
}
const OFF = child('off'), ON = child('on');
console.log('\n② 끔 = 종전');
ok(!OFF.err && OFF.knob === false && OFF.add.terr === 3 && OFF.add.seq === 0 && OFF.add.stored === 3 && OFF.add.reload, '`_terrAdd` 칸 셋 = 칸 행 셋 · 묶음 행 0 · 되읽은 차례 = 메모리', J(OFF.err || OFF.add));
ok(!OFF.err && OFF.rm.had && OFF.rm.rm && !OFF.rm.mem && !OFF.rm.reload && OFF.rm.seq === 0, '`_t1238Remove` = 그 칸 행 지움 · 뺌 토막 0 · 다시 읽어도 없다', J(OFF.rm));
ok(!OFF.err && OFF.back.memLast && OFF.back.reloadLast && OFF.back.same && OFF.stat && OFF.stat.anySeq === false && OFF.stat.compact == null, '다시 든 칸은 끝으로(메모리 · 되읽기) · 묶음 행 셈 0 · 이관 0', J({ back: OFF.back, stat: OFF.stat }));
console.log('\n③ 켬 — 쓰기');
ok(!ON.err && ON.knob === true && ON.add.got === 3 && ON.add.terr === 0 && ON.add.seq === 1 && ON.add.stored === 3 && ON.add.reload, '`_terrAdd` 한 번 = 묶음 행 하나(칸 행 0 · 같은 칸 행에 한 번) · 되읽은 차례 = 메모리', J(ON.err || ON.add));
ok(!ON.err && ON.rm.had && ON.rm.rm && !ON.rm.mem && !ON.rm.reload, '풀린 칸(`_t1238Remove`)은 다시 읽어도 없다(뺌 토막)', J(ON.rm));
ok(!ON.err && ON.back.memLast && ON.back.reloadLast && ON.back.same, '뺐다 다시 든 칸은 끝으로 — 메모리 · 되읽기 같은 차례', J(ON.back));
ok(!ON.err && ON.rad0.A === ON.mig.rad.A && ON.rad0.B === ON.mig.rad.B && ON.rad0.C === ON.mig.rad.C && OFF.rad1 === ON.rad1, '부팅 반지름(`getVillageFarthest`) = 칸 행 판의 그 값(이관 앞뒤 · 끔 · 켬 쓰기 뒤)', J({ off: OFF.rad0, mig: ON.mig && ON.mig.rad, rad1: [OFF.rad1, ON.rad1] }));
console.log('\n④ 겹친 칸 가르기');
ok(!ON.err && ON.contest.same && ON.contest.sql.length === 10 && ON.contest.sql.includes('1004,1002:2') && ON.contest.sql.includes('1004,1000:1') && ON.contest.sql.includes('2010,2000:1'), '메모리 + 되읽기 가르기 = SQL `getTerrContestOwners`(겹친 칸 10 · 먼저 가진 마을 — B 가 먼저 쥔 칸 · A 가 먼저 쥔 먼 칸 포함)', J(ON.contest));
console.log('\n⑤ 이관 한 거래');
ok(!ON.err && ON.fail.r && ON.fail.r.err && ON.fail.terr === ON.pre.terr && ON.fail.seq === 0 && ON.fail.raw === true && !ON.fail.flagA, '둘째 마을에서 죽으면 통째로 앞 그대로(칸 행 그대로 · 묶음 행 0 · 표지도 되돌림)', J(ON.fail));
ok(!ON.err && ON.mig.r.vils === 3 && ON.mig.terr === 0 && J(ON.mig.perVil) === '[1,1,1]' && ON.mig.A && ON.mig.B && ON.mig.C && ON.mig.house === 1 && ON.mig.r.before === ON.pre.terr && ON.mig.r.wit === 1 && ON.rad0.C === 10,
  '성공 = 마을마다 묶음 행 하나(칸 행 0 · 겹친 진 쪽 · 같은 칸 두 행 빠짐) · 되읽은 차례 = 메모리 · 다른 행 그대로 · 죽은 행이 더 먼 C 에 증거 하나(반지름 10 그대로)', J(ON.mig));
ok(!ON.err && ON.mig2.r.vils === 0 && ON.mig2.r.skip === 3 && ON.mig2.seq === 3, '다시 부르면 쓰기 0(이미 행 하나 · 같은 차례)', J(ON.mig2));
ok(!ON.err && ON.t721 && ON.t721.rc === 0 && ON.t721.memHas && ON.t721.has === false && ON.t721.size === ON.t721.mem - 1, '지형 처리 도구(t721-apply)가 묶음 행 마을의 막힌 칸을 뺀다(사본 · 뺌 토막 · 다른 칸 그대로)', J(ON.t721));

// ⑥ 존 부팅
const BOOT = [];
if (process.env.T1433H_SKIP_BOOT === '1') console.log('\n⑥ 존 부팅 — 건너뜀(T1433H_SKIP_BOOT=1)');
else {
  console.log('\n⑥ 존 부팅(씨앗 세계 사본)');
  const { SEED_Z, ensureSeed } = require('./slicer-seed.js');
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 't1433h-'));
  const boot = (db, tag, env, keep) => {
    const out = path.join(W, tag + '.json');
    const e = Object.assign({}, process.env); for (const k of ['T1433_TERR_SEQ', 'T538_MUT', 'T538_KEEP_DB', 'T538_TREE']) delete e[k];
    execFileSync(process.execPath, [path.join(__dirname, 't538-boot-mem.js'), '--boot', db, '1500', out], { cwd: ROOT, stdio: 'ignore', timeout: 20 * 60 * 1000,
      env: Object.assign(e, { T538_DUMP: '1', T538_PORT: String(4960 + BOOT.length * 2), T538_AFTER_MS: '1500' }, keep ? { T538_KEEP_DB: keep } : {}, env) });
    const r = JSON.parse(fs.readFileSync(out, 'utf8')); r.log = fs.readFileSync(out.replace(/\.json$/, '.log'), 'utf8'); BOOT.push(tag); return r;
  };
  const cmp = (A, B) => { if (!A || !B || A.length !== B.length) return [`길이 ${A && A.length} ≠ ${B && B.length}`]; const d = []; for (let i = 0; i < A.length; i++) for (const k of Object.keys(A[i])) if (A[i][k] !== B[i][k]) d.push(`${A[i].name}.${k}`); return d; };
  const rowsOf = (f) => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(f); const q = (s) => d.prepare(s).get().n;
    const o = { terr: q("SELECT COUNT(*) n FROM village_buildings WHERE type='terr'"), seq: q("SELECT COUNT(*) n FROM village_buildings WHERE type='terrseq'"), seqVils: q("SELECT COUNT(DISTINCT village_id) n FROM village_buildings WHERE type='terrseq'"),
      maxId: q('SELECT MAX(id) n FROM village_buildings'), seqHash: crypto.createHash('sha1').update(d.prepare("SELECT village_id, cx, cy, floors, data FROM village_buildings WHERE type='terrseq' ORDER BY village_id").all().map((r) => J(r)).join('\n')).digest('hex').slice(0, 12) };
    d.close(); return o; };
  //   옛 코드의 글자로 읽는 영토(칸 행 · id 차례 · T569 SQL) — 지문은 t538 덤프와 같은 식(정렬 H · 차례 O)
  const legacyTerr = (f) => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(f);
    const V = d.prepare("SELECT id, name FROM villages WHERE zone = 'hanbando' ORDER BY id").all(), st = d.prepare("SELECT cx, cy FROM village_buildings WHERE village_id = ? AND type = 'terr' ORDER BY id");
    const S = V.map((v) => { const s = new Set(); for (const r of st.iterate(v.id)) s.add(r.cx + ',' + r.cy); return { v, s }; });
    for (const o of d.prepare("SELECT cx, cy, village_id FROM village_buildings WHERE id IN (SELECT MIN(id) FROM village_buildings WHERE type = 'terr' GROUP BY cx, cy HAVING COUNT(DISTINCT village_id) > 1)").all()) for (const x of S) if (x.v.id !== o.village_id) x.s.delete(o.cx + ',' + o.cy);
    d.close(); const hs = (a) => crypto.createHash('sha256').update(a.join('|')).digest('hex').slice(0, 16);
    return S.map((x) => ({ id: x.v.id, terr: x.s.size, terrH: hs([...x.s].sort()), terrO: hs([...x.s]) })); };
  const seedOk = (() => { try { return fs.existsSync(SEED_Z); } catch (e) { return false; } })();
  const run = async () => { try { await run0(); } catch (e) { ok(false, '존 부팅 절이 끝까지 돈다', String((e && e.message) || e).slice(0, 200)); } };
  const run0 = async () => {
    if (!seedOk) { const r = await ensureSeed(); if (!r.ok) { ok(false, `씨앗 준비 실패 — ${r.why}`); return; } }
    //   씨앗 사본 + 마을마다 영토 바깥 고리 1,500 칸 · 같은 칸 두 행(첫 마을) · 두 마을이 가진 칸(둘째 마을이 첫 마을 칸 다섯을 늦게 쥔다)
    const F = path.join(W, 'fat.db');
    fs.copyFileSync(SEED_Z, F); try { fs.copyFileSync(SEED_Z + '-wal', F + '-wal'); } catch (e) {}
    { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(F);
      const vs = d.prepare("SELECT id, cx, cy FROM villages WHERE zone = 'hanbando' ORDER BY id").all();
      const have = d.prepare("SELECT cx, cy FROM village_buildings WHERE village_id = ? AND type = 'terr' ORDER BY id");
      const ins = d.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'terr', ?, ?, 0, NULL, 0)");
      d.exec('BEGIN');
      for (const v of vs) { const own = new Set(have.all(v.id).map((r) => r.cx + ',' + r.cy)); let add = 0;
        for (let R = 1; add < 1500 && R < 200; R++) for (let dx = -R; dx <= R && add < 1500; dx++) for (const dy of (Math.abs(dx) === R ? Array.from({ length: 2 * R + 1 }, (_, i) => i - R) : [-R, R])) {
          if (add >= 1500) break; const x = v.cx + dx, y = v.cy + dy, k = x + ',' + y; if (x < 1 || y < 1 || own.has(k)) continue; own.add(k); ins.run(v.id, x, y); add++; } }
      const a = have.all(vs[0].id); ins.run(vs[0].id, a[3].cx, a[3].cy);
      for (let i = 10; i < 15; i++) ins.run(vs[1].id, a[i].cx, a[i].cy);
      d.exec('COMMIT'); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close(); }
    const r0 = rowsOf(F);
    const A = boot(F, 'A-off', {});
    const DBB = path.join(W, 'B.db'), DBD = path.join(W, 'D.db');
    const B = boot(F, 'B-on', { T1433_TERR_SEQ: '1' }, DBB);
    const rB = rowsOf(DBB);
    const C = boot(DBB, 'C-off', {});
    const D = boot(DBB, 'D-on', { T1433_TERR_SEQ: '1' }, DBD);
    const rD = rowsOf(DBD);
    const dAB = cmp(A.dump, B.dump), dAC = cmp(A.dump, C.dump), dAD = cmp(A.dump, D.dump);
    const nV = (A.dump || []).length, withTerr = (A.dump || []).filter((v) => v.terr > 0).length;
    ok(!A.died && !B.died && nV >= 10 && r0.terr > 10000, '[상황] 살찐 씨앗 사본이 뜬다(끔 · 켬)', `마을 ${nV} · 칸 행 ${r0.terr} · up ${A.upS}s / ${B.upS}s`);
    ok(dAB.length === 0, '켬 부팅(이관) 지문 = 끔 부팅 지문(영토 · 차례 · 반지름 · 다른 칸 전부)', dAB.slice(0, 6).join(' · '));
    ok(rB.terr === 0 && rB.seq === withTerr && rB.seqVils === withTerr && /\[T1433\] 영토 행 묶기 — 마을 \d+곳/.test(B.log), '이관 뒤 칸 행 0 · 묶음 행 = 영토 있는 마을 수(마을마다 하나)', J({ before: r0.terr, after: rB, withTerr }));
    ok(dAC.length === 0, '이관한 DB 를 끔으로 띄워도 같은 지문(되돌림 = 손잡이만 끈다)', dAC.slice(0, 6).join(' · '));
    ok(dAD.length === 0 && rD.seqHash === rB.seqHash && rD.maxId === rB.maxId && /그대로 \d+ ·/.test(D.log), '이관한 DB 켬 다시 부팅 = 같은 지문 · 쓰기 0(묶음 행 · 마지막 id 그대로)', J({ rB, rD }));
    //   이관 도구 — `--forward` 행 = 부팅 이관 행 · `--back` 의 옛 글자 로드 = 끔 부팅 영토
    const FW = path.join(W, 'fw.db'), BK = path.join(W, 'bk.db');
    execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 't1433-terr-migrate.js'), '--forward', F, '--out', FW], { cwd: ROOT, stdio: 'ignore' });
    execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 't1433-terr-migrate.js'), '--back', DBB, '--out', BK], { cwd: ROOT, stdio: 'ignore' });
    const rF = rowsOf(FW), rK = rowsOf(BK);
    const lg = legacyTerr(BK), dl = [];
    for (const x of lg) { const a = (A.dump || []).find((v) => v.id === x.id); if (!a || a.terr !== x.terr || a.terrH !== x.terrH || a.terrO !== x.terrO) dl.push(x.id); }
    const seqDiff = (() => { const q = (f) => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(f); const o = d.prepare("SELECT village_id, cx, cy, floors, data FROM village_buildings WHERE type='terrseq' ORDER BY village_id").all().map((r) => J(r)); d.close(); return o; };
      const a = q(FW), b = q(DBB); return a.length === b.length && a.every((s, i) => s === b[i]); })();
    ok(rF.terr === 0 && rF.seq === rB.seq && seqDiff, '이관 도구 `--forward` 의 묶음 행 = 부팅 이관 묶음 행(같은 글 · 같은 증거)', J({ rF, rB }));
    ok(rK.seq === 0 && rK.terr > 0 && dl.length === 0 && lg.length === nV, '`--back` 한 DB 를 옛 코드 글자(칸 행 SQL · id 차례 · T569)로 읽은 영토 = 끔 부팅 영토(모인 것 · 차례)', J({ rK, diff: dl.slice(0, 5) }));
    // ⑦ 미끼 셋째 — 이관을 건너뛰는 사본으로 켬 부팅
    const MB = BAITS.skipmig, DBM = path.join(W, 'M.db');
    const M = boot(F, 'M-skip', { T1433_TERR_SEQ: '1', T538_MUT: J(MB) }, DBM);
    const rM = rowsOf(DBM);
    ok(siteN('skipmig') === 1 && M.mut && M.mut.n === 1 && !M.died && !(rM.terr === 0 && rM.seq === withTerr), `★미끼 skipmig — 부팅 이관을 건너뛰는 사본 → ⑥ "이관 뒤 칸 행 0 · 마을마다 묶음 행 하나" 빨강(바꾼 자리 ${siteN('skipmig')})`, J(rM));
    for (const f of fs.readdirSync(W)) { try { fs.unlinkSync(path.join(W, f)); } catch (e) {} } try { fs.rmdirSync(W); } catch (e) {}
  };
  module.exports.__run = run;
}

(async () => {
  if (module.exports.__run) await module.exports.__run();
  console.log('\n⑦ 미끼 — 한 자리만 바꾼 사본(마을 몫)');
  { const n = siteN('rmkeep'), R = child('on', 'rmkeep');
    ok(n === 1 && !R.err && R.rm && R.rm.rm && !R.rm.mem && R.rm.reload === true, `★미끼 rmkeep — 풀린 칸의 뺌 토막을 안 쓰는 사본 → ③ "다시 읽어도 없다" 빨강(바꾼 자리 ${n})`, J(R.err || R.rm)); }
  { const n = siteN('twice'), R = child('on', 'twice');
    ok(n === 1 && !R.err && R.add && R.add.seq === 1 && R.add.terr === 3 && R.add.stored === 6, `★미끼 twice — 켬에서도 칸 행을 같이 적는 사본 → ③ "칸 행 0 · 한 번" 빨강(바꾼 자리 ${n})`, J(R.err || R.add)); }
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
