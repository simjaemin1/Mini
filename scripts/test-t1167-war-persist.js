#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1167-war-persist.js — 진행 중 전쟁 영속(`T1167_WAR_PERSIST` · T1167 · K15 · T1133 회부 1) ====================
//
// ★왜 [K15 · 일관된 물리 엔티티 캐논] 진행 중 전쟁(`_warWars`)은 재기동에 안 실렸다 — 다시 뜨면 전쟁이 사라지고 econ 징발 표(`_warDraft`)만 남아
//   그 사람들이 영영 생산하지 않았다(T742 ③ W380). 짐은 이미 날짜 · 표식째 몸에 남는다(T1133).
// 판정 사본 0: 운영 함수 그대로(`villages.__p3Bind` — `_t1167Pack` · `_t1167Early` · `_t1167Bind` · `_warDraftPids` · `_warRationCollect` · war-core `createWar` · `rebuildFromEcon`).
//   "다시 뜸" = **다른 프로세스**(모듈 새로 적재 · 몸 = 새 객체 · 새 pid): 판 1 이 진행 중 전쟁을 메타 칸(`_t1167Pack`)으로 내고,
//   판 2 가 그 글자를 메타 행(`db.getWorldMeta`)으로 받아 운영 되살림 두 문(이른 쪽 → 무기 거울 정산 → 몸 쪽)을 부른다.
// 지키는 것:
//   ⓪ 정적 — 손잡이 한 줄(`!== '0'`) · 메타 칸 한 줄 · 이른 되살림이 `rebuildFromEcon` **앞** · 몸 쪽이 T747 되살림 **뒤**
//   ① ★켬 — 행군 중 전쟁: 같은 번호 · 같은 마을 객체 · 단계 · 팩 · 무기 장부 그대로 · pid 표(`_armsPack` · `_debt`)가 같은 자리 몸의 **새 pid** 로 ·
//        `_vetRoster` 가 같은 econ 주민 · 징발 표의 낡은 pid 지움(표는 그대로) · 번호 계수기 앞으로
//   ② ★켬 — 무기 거울 정산이 원정 짐 몫을 곳간에 두 번 안 낸다(곳간 + 장부 = 저장 순간) · 끔(되살림 없음)이면 거울 전부 곳간(종전)
//   ③ ★켬 — 다시 징발이 그 병사 몸을 먼저(같은 병종 먼저) · 징발 표를 다시 묶는다
//   ④ ★켬 — 귀환 중 전쟁(몸 없음): 장부 귀환이 그 병사 명부 몸의 짐을 모은다(`_warRationCollect`) · 명부 밖 몸은 안 본다
//   ⑤ 교전 중 전쟁 — 다시 개전 표(`_t1167Re`) · ⑥ 다른 날 메타 — 안 되살린다(생성 금지) · ⑦ 진행 중 전쟁 없으면 칸 0
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────────
if (process.env.T1167_SUB) {
  const PH = process.env.T1167_SUB, IN = process.env.T1167_IN ? JSON.parse(fs.readFileSync(process.env.T1167_IN, 'utf8')) : null;
  const out = { ph: PH };
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const WarCore = require(path.join(ROOT, 'sim', 'war-core')), V = require(SV('villages.js'));
    const DAY0 = 400;
    const mkV = (name, dbId, pids) => ({ name, dbId, ccx: dbId * 10, ccy: 0, npcPids: pids.slice(), econ: { name, npcs: Array.from({ length: 6 }, (_, i) => ({ id: dbId * 100 + i, currentJob: 'farmer' })), counts: {}, storage: { food: 50, weapon: 0 }, _warFatigue: 0 } });
    const players = new Map(), npcs = new Map();
    const tag = PH === 'save' ? 'o' : 'n';   // 판마다 다른 pid(프로세스마다 새로 선다)
    const A = mkV('공격', 1, [tag + 'a0', tag + 'a1', tag + 'a2']), D = mkV('방어', 2, [tag + 'd0', tag + 'd1']);
    for (const v of [A, D]) for (const pid of v.npcPids) { const p = { pid, isNpc: true, hp: 100, inventory: {}, simJob: 'farmer', simVillageId: v.dbId }; players.set(pid, p); npcs.set(pid, p); }
    const world = { villages: [A.econ, D.econ], day: DAY0 };
    let H = null;
    //   판 2 — 무기 거울(`_warArmsOut`)이 econ 칸으로 남았다(serializeEcon) · 징발 표도(econ 주민 칸)
    if (PH !== 'save') { A.econ._warArmsOut = 3; A.econ.npcs[0]._warDraft = 7; A.econ.npcs[0]._warPid = 'oa0'; A.econ.npcs[1]._warDraft = 7; A.econ.npcs[1]._warPid = 'oa1'; A.econ.npcs[0]._warPack = 1; A.econ.npcs[1]._warPack = 1; }
    const war = WarCore.createWar({ villages: [A, D], world, seed: 1, log: () => {}, rationCollect: (w) => H._warRationCollect(w) });
    const meta = IN ? { data: JSON.stringify({ anchor: { day: IN.day != null ? IN.day : DAY0 }, t1167: IN.pack }) } : null;
    const WL = { bindGroupUnit: () => {}, MU: { NPC_SAMPLE: 99 } };
    H = V.__p3Bind({ deps: { players, npcs, setHp: (p, hp) => { p.hp = hp; } }, war, warCore: WarCore, world, warBodies: new Map(), villages: [A, D], warLive: WL,
      byDbId: new Map([[1, A], [2, D]]), zoneId: 't1167', db: { getWorldMeta: () => meta } });
    out.on = H.t1167Stat().on;
    if (PH === 'save') {
      out.empty = H._t1167Pack();   // ⑦ 진행 중 전쟁 없음 — 칸 0
      for (const pid of ['oa0', 'oa1']) players.get(pid)._warPackOf = 7;
      A.econ.npcs[0]._warDraft = 7; A.econ.npcs[0]._warPid = 'oa0'; A.econ.npcs[1]._warDraft = 7; A.econ.npcs[1]._warPid = 'oa1';
      const ph = process.env.T1167_PHASE || 'march';
      const w = { id: 7, atk: A, def: D, casus: 'trade', force: 2, warriors: 1, composition: { dagger: 1, spear: 1 }, phase: ph === 'return' ? 'return' : ph === 'battle' ? 'battle' : 'march', op: ph === 'return' ? 'withdraw' : 'march', eta: DAY0 + 3, marchDays: 3, born: DAY0 - 1,
        _packRem: 4.5, _packOnBodies: 2, _packKeys: ['food'], _packShare: 1, _arms: { out: 3, weapon: 3, militia: 0 }, _armsOnBodies: 2,
        _armsPack: new Map([['oa0', 2], ['oa1', 1]]), _debt: new Map([['oa1', 0.5]]), _vetRoster: [{ npc: A.econ.npcs[1], wtype: 'spear' }], _rationBook: { load: 9, days: [{ day: DAY0, eaten: 1 }] }, _capResolve: { npcs: [A.econ.npcs[2]] } };
      war.WARS.push(w); world._warSeq = 8;
      H.state.warBodies.set(7, { w, phase: 'march', pids: ['oa0', 'oa1'], defPids: [], atkGroup: { units: [{ pid: 'oa0', type: 'dagger' }, { pid: 'oa1', type: 'spear' }] } });
      const P = H._t1167Pack();
      out.pack = P; out.bytes = Buffer.byteLength(JSON.stringify(P));
      out.st = H.t1167Stat();
    } else {
      //   운영 차례 — 이른 되살림 → 무기 거울 정산 → (몸이 선 뒤) 몸 쪽 되살림
      if (process.env.T1167_NOEARLY !== '1') out.early = H._t1167Early();
      war.rebuildFromEcon();
      H._t1167Bind();
      const w = war.WARS.find((x) => x.id === 7) || null;
      out.n = war.WARS.length;
      out.w = w ? { atkSame: w.atk === A, defSame: w.def === D, phase: w.phase, op: w.op, eta: w.eta, packRem: w._packRem, arms: w._arms, armsPack: w._armsPack ? [...w._armsPack] : null,
        debt: w._debt ? [...w._debt] : null, vet: (w._vetRoster || []).map((it) => [A.econ.npcs.indexOf(it.npc), it.wtype]), book: w._rationBook, cap: w._capResolve === undefined ? 'none' : 'some', re: !!w._t1167Re } : null;
      out.pref = H._t1167Pref.get(7) ? [...H._t1167Pref.get(7)] : null;
      out.warPid = A.econ.npcs.map((n) => n._warPid == null ? null : n._warPid);
      out.marks = A.econ.npcs.map((n) => n._warDraft || 0);
      out.weapon = A.econ.storage.weapon; out.armsOut = A.econ._warArmsOut == null ? null : A.econ._warArmsOut;
      out.seq = world._warSeq;
      out.st = H.t1167Stat();
      if (w && w.phase === 'march') {   // ③ 다시 징발 — 운영 문 그대로(병종 선호가 다른 몸을 뽑을 만한 직업을 세워 둔다)
        players.get('na2').simJob = 'warrior';
        const d = H._warDraftPids(A, { dagger: 1, spear: 1 }, 1, 7);
        out.draft = d ? d.units.map((u) => [u.pid, u.type]) : null;
        out.bound = A.econ.npcs.map((n) => n._warPid == null ? null : n._warPid);
      }
      if (w && w.phase === 'return') {   // ④ 귀환 — 몸 없이 장부가 모은다
        for (const pid of ['na0', 'na1', 'na2']) { const p = players.get(pid); p.inventory = { food: 2 }; }
        players.get('na0')._warPackOf = 7; players.get('na1')._warPackOf = 7;   // (T1133 이 같은 자리 몸에 되살린 표식)
        const got = H._warRationCollect(w);
        out.collect = got; out.left = ['na0', 'na1', 'na2'].map((pid) => players.get(pid).inventory.food || 0);
      }
    }
  } catch (e) { out.err = String((e && e.stack) || e).slice(0, 800); }
  _log(JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ──────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1167_WAR_PERSIST', 'T1167_SUB', 'T1167_IN', 'T1167_PHASE', 'T1167_NOEARLY', 'T732_MOMENT_LOT', 'T403_ARMS_LEDGER'];
const BASE = (() => { const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; return e; })();
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1167-'));
let nIn = 0;
function sub(ph, extra, inObj) {
  const env = Object.assign({}, BASE, { T1167_SUB: ph }, extra || {});
  if (inObj) { const f = path.join(TMP, `in-${nIn++}.json`); fs.writeFileSync(f, JSON.stringify(inObj)); env.T1167_IN = f; }
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 400) }; }
}
console.log('\n=== 진행 중 전쟁 영속 — T1167_WAR_PERSIST ===');
{
  const Vs = fs.readFileSync(SV('villages.js'), 'utf8');
  const iE = Vs.indexOf('_t1167Early(); } catch'), iR = Vs.indexOf('state.war.rebuildFromEcon();   // 재부팅 복원'), iB = Vs.indexOf('_t1167Bind(); } catch'), iT = Vs.indexOf('if (T747_BODY) { try { _t747Restore(); }');
  ok(/const T1167_WAR = process\.env\.T1167_WAR_PERSIST !== '0';/.test(Vs) && (Vs.match(/process\.env\.T1167_WAR_PERSIST/g) || []).length === 1
    && (Vs.match(/\{ t1167: P \}/g) || []).length === 1 && iE > 0 && iR > iE && iT > iR && iB > iT,
    "⓪ 손잡이 한 줄(`!== '0'`) · 메타 칸 한 줄 · 이른 되살림 → 거울 정산 → T747 몸 → 몸 쪽 되살림 차례");
}
const S = sub('save', {});
const pre = !S.err && S.on === true && Array.isArray(S.pack) && S.pack.length === 1;
ok(pre, '[상황] 판 1 — 행군 중 전쟁 하나가 메타 칸으로 나왔다', S.err || JSON.stringify(S.pack));
ok(!S.err && S.empty === null, '⑦ 진행 중 전쟁이 없으면 칸 0(`_t1167Pack` → null — 메타 글자 종전 그대로)', String(S.empty));
if (pre) {
  const P0 = S.pack[0];
  ok(P0.atk === '공격' && P0.def === '방어' && !('_capResolve' in P0) && JSON.stringify(P0._armsPack) === JSON.stringify({ $T1167: [[[1, 0], 2], [[1, 1], 1]] })
    && JSON.stringify(P0._t1167Sol) === JSON.stringify([[[1, 0], 'dagger'], [[1, 1], 'spear']]) && JSON.stringify(P0._vetRoster) === JSON.stringify([{ id: 101, wtype: 'spear' }]),
    '① 저장 꼴 — 마을 = 이름 · pid = 몸 자리(dbId · 명부 자리) · 병사 명부(병종째) · econ 주민 = 번호 · 결판 인계 칸 안 실음', `${S.bytes} B`);
  const R = sub('restore', {}, { pack: S.pack });
  ok(!R.err && R.early === 1 && R.n === 1 && R.w && R.w.atkSame && R.w.defSame && R.w.phase === 'march' && R.w.op === 'march' && R.w.eta === 403 && R.w.packRem === 4.5 && R.w.cap === 'none'
    && JSON.stringify(R.w.book) === JSON.stringify(S.pack[0]._rationBook) && R.seq >= 8,
    '★① 켬 — 같은 번호 · 같은 마을 객체 · 단계 · 도착 날 · 팩 · 짐 장부 그대로 · 번호 계수기 앞으로', R.err || JSON.stringify(R.w));
  ok(!R.err && JSON.stringify(R.w.armsPack) === JSON.stringify([['na0', 2], ['na1', 1]]) && JSON.stringify(R.w.debt) === JSON.stringify([['na1', 0.5]]) && JSON.stringify(R.w.vet) === JSON.stringify([[1, 'spear']]),
    '★① 켬 — pid 표가 같은 자리 몸의 **새 pid** 로(무기 몸 짐 · 군량 빚) · 노병 명부가 같은 econ 주민', JSON.stringify({ armsPack: R.w && R.w.armsPack, debt: R.w && R.w.debt, vet: R.w && R.w.vet }));
  ok(!R.err && JSON.stringify(R.warPid) === JSON.stringify([null, null, null, null, null, null]) && JSON.stringify(R.marks) === JSON.stringify([7, 7, 0, 0, 0, 0]) && R.st.pidClear === 2,
    '★① 켬 — 징발 표는 그대로 · 이전 프로세스의 pid(`_warPid`)는 지웠다', JSON.stringify({ warPid: R.warPid, marks: R.marks }));
  ok(!R.err && R.weapon === 0 && R.armsOut === 3 && R.w.arms && R.w.arms.weapon === 3,
    '★② 켬 — 무기 거울 정산이 원정 짐 몫을 곳간에 안 낸다(곳간 0 + 장부 3 = 저장 순간 3 · 거울 3)', JSON.stringify({ weapon: R.weapon, armsOut: R.armsOut, arms: R.w && R.w.arms }));
  const RN = sub('restore', { T1167_NOEARLY: '1' }, { pack: S.pack });
  ok(!RN.err && RN.n === 0 && RN.weapon === 3 && RN.armsOut === null,
    '[대조 · ②] 되살림 없음(종전 꼴) — 전쟁 0 · 거울 전부 곳간(3) — 이른 되살림이 거울 앞이어야 하는 까닭', JSON.stringify({ n: RN.n, weapon: RN.weapon }));
  ok(!R.err && JSON.stringify(R.pref) === JSON.stringify([['na0', 'dagger'], ['na1', 'spear']]) && JSON.stringify(R.draft) === JSON.stringify([['na0', 'dagger'], ['na1', 'spear']])
    && JSON.stringify(R.bound) === JSON.stringify(['na0', 'na1', null, null, null, null]),
    '★③ 켬 — 다시 징발이 그 병사 몸을 같은 병종으로 먼저 뽑는다(전사 직업 몸이 옆에 있어도) · 징발 표를 다시 묶는다', JSON.stringify({ draft: R.draft, bound: R.bound }));
  const R0 = sub('restore', { T1167_WAR_PERSIST: '0' }, { pack: S.pack });
  ok(!R0.err && R0.on === false && R0.n === 0 && R0.weapon === 3 && JSON.stringify(R0.warPid) === JSON.stringify(['oa0', 'oa1', null, null, null, null]),
    "[끔 · `=0` 종전] 몸 쪽 되살림 문이 안 불린다 — 낡은 pid 그대로(운영 부팅은 이른 되살림도 안 부른다 · 이 판은 메타 칸이 있어도)", JSON.stringify({ n: R0.n, warPid: R0.warPid }));
  const RD = sub('restore', {}, { pack: S.pack, day: 399 });
  ok(!RD.err && RD.n === 0 && RD.st.lost === 1 && /메타 날 399/.test(RD.st.why), '⑥ 다른 날 메타 — 안 되살린다(이미 끝난 전쟁을 되살리지 않는다 · 생성 금지)', RD.err || RD.st.why);
  const SR = sub('save', { T1167_PHASE: 'return' });
  const RR = !SR.err ? sub('restore', {}, { pack: SR.pack }) : SR;
  ok(!RR.err && RR.w && RR.w.phase === 'return' && RR.collect && RR.collect.food === 4 && JSON.stringify(RR.left) === JSON.stringify([0, 0, 2]),
    '★④ 켬 — 귀환 중 전쟁(몸 없음) — 장부 귀환이 그 병사 명부 몸 짐을 모은다(표식 든 둘 · 명부 밖 몸 손은 그대로)', RR.err || JSON.stringify({ collect: RR.collect, left: RR.left }));
  const SB = sub('save', { T1167_PHASE: 'battle' });
  const RB = !SB.err ? sub('restore', {}, { pack: SB.pack }) : SB;
  ok(!RB.err && RB.w && RB.w.phase === 'battle' && RB.w.re === true && RB.st.byPhase.battle === 1,
    '⑤ 교전 중 전쟁 — 다시 개전 표(`_t1167Re` — 다음 몸 틱에 같은 개전 문 `_warEngage`)', RB.err || JSON.stringify(RB.w));
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
