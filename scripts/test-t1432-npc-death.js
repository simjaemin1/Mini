#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4
// === scripts/test-t1432-npc-death.js — [T1432 · 재민 11-22 판정 36 "ㄱ"] 쓰러진 마을 NPC 는 진짜 죽는다(손잡이 `T1432_NPC_DEATH` · 끔 기본) ==========
//
// ★재민이 정한 것: NPC 도 진짜 죽는다 — 30초 뒤 되살아나지 않고(주검이 남고) · econ 명부에서 빠지고 · 직업 수(`counts`)가 같이 준다(랩 `reapDead` 그 식).
// ★판 — 존 자식(존 프로세스 안 · 존의 진짜 `damagePlayer` · 마을 켬 · 마을 둘) · 켬 · 끔 · 미끼 넷(같은 켬 판에 원문 한 곳을 비튼 존 · 마을 모듈을 싣는다).
//   ① 마을 몸 하나가 짐승(`wild:🐯습격`)에 쓰러진다 → 켬: 되살림 타이머 0 · 그 자리 주검(쓰러짐 · 나감 `died`) · 명부 −1 · econ 명부 −1 · 그 직업 수 −1 · 야생 누계 +1 · 몸 꼬리표 `died.wild` +1
//   ② 다음 몸 동기(운영 그 문 `syncVillagePop`) 뒤 — 다른 몸이 또 줄지 않는다(명부 = 그대로)
//   ③ 촌장(명부 맨 앞)이 사람 손(`player:…`)에 쓰러진다 → 다음 사람이 촌장 · econ −1 · 야생 누계 그대로
//   ④ 끔 — 같은 손이 종전 그대로(되살림 타이머 하나 · 명부 · econ 그대로)
// ★미끼 넷(이 파일 안 · 바꾼 자리 정확히 1곳씩 · 존 자식이 원문을 메모리에서 비틀어 같은 경로로 싣는다):
//   ⓐ 되살아나는 사본(존 켬 한 줄을 뺀다) ⓑ 명부에서 안 빠지는 사본(econ 빼기를 읽기로) ⓒ `counts` 가 하나 남는 사본(직업 수 줄을 뺀다) ⓓ 주검이 안 남는 사본(눕는 문 → 걸어 나가는 문)
// ★날짜 · 벽시계 0(되살림 타이머는 세고 지운다 — 30초를 안 기다린다 · T1414 ⑤ 그 꼴).
// 실행: node scripts/test-t1432-npc-death.js [--skip-server]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
//   미끼 자리(원문 한 곳 → 사본)
const BAIT = {
  a: { file: ZF, from: "      if (T1432_NPC_DEATH && SimVillages.t1432Die && SimVillages.t1432Die(p, source)) {", to: "      if (false) {" },
  b: { file: VF, from: "    const rd = e.npcs.splice(j, 1)[0];\n", to: "    const rd = e.npcs[j];\n" },
  c: { file: VF, from: "    if (e.counts && rd && rd.currentJob) e.counts[rd.currentJob] = Math.max(0, (e.counts[rd.currentJob] || 0) - 1);", to: "" },
  d: { file: VF, from: "  _bxDie(vil, p, { k });\n  _t1432Stat.died++;", to: "  _bxWalk(vil, p, { k });\n  _t1432Stat.died++;" },
};

if (process.env.T1432_ROLE === 'zone') { zoneChild(); return; }

const SKIP_SERVER = process.argv.includes('--skip-server');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); return !!c; };
const sec = (t) => console.log('\n' + t);

// ── A. 원문 ──────────────────────────────────────────────────────────────────
sec('A 원문 — 손잡이 · 문 · 미끼 자리');
{
  const z = fs.readFileSync(ZF, 'utf8'), v = fs.readFileSync(VF, 'utf8'), w = fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8');
  ok(/const T1432_NPC_DEATH = process\.env\.T1432_NPC_DEATH === '1';/.test(z) && (z.match(/process\.env\.T1432_NPC_DEATH/g) || []).length === 1, '손잡이 `T1432_NPC_DEATH` — `1` 만 켬 · env 읽는 자리 하나', '');
  ok(/const _rd=s\.econ\.npcs\.splice\(k,1\)\[0\];if\(s\.econ\.counts&&_rd&&_rd\.currentJob\)s\.econ\.counts\[_rd\.currentJob\]=Math\.max\(0,\(s\.econ\.counts\[_rd\.currentJob\]\|\|0\)-1\);/.test(w), '서버 블록 `reapDead` 잠든 econ 갈래에 T311 직업 수 줄(랩 그 식 — T1414 회부 2)', '');
  for (const k of Object.keys(BAIT)) { const b = BAIT[k], src = b.file === ZF ? z : v; ok(src.split(b.from).length - 1 === 1, `미끼 ${k} 자리 — 원문에 정확히 한 곳`, path.basename(b.file)); }
}

// ── 존 자식 ──────────────────────────────────────────────────────────────────
function zoneChild() {
  const out = {};
  const put = () => { try { fs.writeFileSync(process.env.T1432_OUT, JSON.stringify(out)); } catch (e) {} };
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '1', VILLAGE_MAX: '2', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0', CENTRAL_URL: 'http://127.0.0.1:9' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const bk = process.env.T1432_BAIT;
    if (bk && BAIT[bk]) {   // 원문을 메모리에서 비틀어 그 경로 그대로 싣는다(다른 모듈이 같은 인스턴스를 받게)
      const Module = require('module'), b = BAIT[bk], src = fs.readFileSync(b.file, 'utf8');
      out.baitN = src.split(b.from).length - 1;
      const m = new Module(b.file, module); m.filename = b.file; m.paths = Module._nodeModulePaths(path.dirname(b.file));
      require.cache[b.file] = m;
      m._compile(src.replace(b.from, b.to), b.file); m.loaded = true;
    }
    const Zone = require(ZF);
    const H = Zone.__testBind(), SV = H.SimVillages, players = H.players;
    const timers = [];
    const st0 = global.setTimeout;
    global.setTimeout = function (f, ms, ...a) { const h = st0(f, ms, ...a); if (typeof f === 'function' && /player_respawn/.test(String(f))) { timers.push(ms); clearTimeout(h); } return h; };   // 존의 NPC 되살림 타이머는 세고 지운다
    const t0 = Date.now();
    const find = () => { for (let id = 1; id <= 64; id++) { const v = SV.villageByDbId(id); if (v && v.econ && v.npcPids && v.npcPids.filter((pid) => players.has(pid)).length >= 3 && v.econ.npcs.length >= 3) return v; } return null; };
    const step = () => {
      const vil = find();
      if (!vil) { if (Date.now() - t0 > 400000) { out.err = '마을 몸 없음'; put(); process.exit(0); } st0(step, 1000); return; }
      const job = (q) => (vil.econ.counts || {})[q] | 0;
      const pids = vil.npcPids.filter((pid) => players.has(pid));
      const p = players.get(pids[1]);   // 촌장 다음 몸
      const S0 = { npc: vil.npcPids.length, econ: vil.econ.npcs.length, job: p.simJob, cnt: job(p.simJob), wild: vil.econ._wildDeadTot | 0, died: (SV.bodyExitStats().died || {}).wild | 0, t: timers.length };
      H.damagePlayer(p, (p.hp || 100) + 50, 'wild:🐯습격');
      const S1 = { npc: vil.npcPids.length, econ: vil.econ.npcs.length, cnt: job(S0.job), wild: vil.econ._wildDeadTot | 0, died: (SV.bodyExitStats().died || {}).wild | 0, t: timers.length,
        exit: p._bxExit || null, down: !!p.isDown, hp: p.hp, inList: vil.npcPids.includes(p.pid), alive: players.has(p.pid) };
      try { SV.t1432Sync(vil, 9); } catch (e) { out.syncErr = String(e); }
      const S2 = { npc: vil.npcPids.length, econ: vil.econ.npcs.length };
      //   ③ 촌장 — 사람 손
      const ch0 = SV.chiefOf(vil.dbId), next = players.get(vil.npcPids.find((pid) => players.has(pid) && pid !== (ch0 && ch0.pid)));
      const E0 = vil.econ.npcs.length, W0 = vil.econ._wildDeadTot | 0;
      if (ch0) H.damagePlayer(ch0, (ch0.hp || 100) + 50, 'player:tester');
      const ch1 = SV.chiefOf(vil.dbId);
      out.r = { vid: vil.dbId, S0, S1, S2, chief: { had: !!ch0, was: ch0 && ch0.pid, now: ch1 && ch1.pid, next: next && next.pid, econ: [E0, vil.econ.npcs.length], wild: [W0, vil.econ._wildDeadTot | 0], exit: ch0 && ch0._bxExit || null },
        timers: timers.slice(), stat: SV.t1432Stat ? (({ died, wild, other, person, paired, sameJob, first, skip }) => ({ died, wild, other, person, paired, sameJob, first, skip }))(SV.t1432Stat()) : null };
      put(); process.exit(0);
    };
    st0(step, 2000);
  } catch (e) { out.err = String(e && e.stack || e); put(); process.exit(0); }
}

function runChild(env, label) {
  return new Promise((resolve) => {
    const LP = require('./lib-port');
    const RUN = fs.mkdtempSync(`/tmp/t1432-${label}-`); require('./lib-tmp').own(RUN);
    const OUT = path.join(RUN, 'out.json');
    const E = Object.assign({}, process.env, { T1432_ROLE: 'zone', T1432_OUT: OUT, DB_PATH: path.join(RUN, 'z.db'), PORT: String(LP.port(38470 + Object.keys(BAIT).length + label.length)) }, env);
    if (!('T1432_NPC_DEATH' in env)) delete E.T1432_NPC_DEATH;
    const ch = spawn(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: 'ignore' });
    const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 600000);
    ch.on('exit', () => { clearTimeout(to); let r = null; try { r = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { r = { err: '결과 없음' }; } try { fs.rmSync(RUN, { recursive: true, force: true }); } catch (e) {} resolve(r); });
  });
}

(async () => {
  if (SKIP_SERVER) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} === (--skip-server)`); process.exit(fail ? 1 : 0); }
  const real = (o) => !!(o && o.r && o.r.timers.length === 0 && o.r.S1.exit === 'died' && o.r.S1.down && o.r.S1.hp === 0 && !o.r.S1.inList);
  const listed = (o) => !!(o && o.r && o.r.S1.econ === o.r.S0.econ - 1 && o.r.S1.npc === o.r.S0.npc - 1);
  const counted = (o) => !!(o && o.r && o.r.S1.cnt === Math.max(0, o.r.S0.cnt - 1) && o.r.S0.cnt >= 1);
  const corpse = (o) => !!(o && o.r && o.r.S1.exit === 'died' && o.r.S1.down && o.r.S1.alive && o.r.S1.died === o.r.S0.died + 1);
  sec('B 켬(`T1432_NPC_DEATH=1`) — 마을 몸이 짐승에 쓰러진다');
  const ON = await runChild({ T1432_NPC_DEATH: '1' }, 'on');
  if (ON.err) ok(false, '켬 판', ON.err);
  else {
    const r = ON.r;
    console.log(`    마을 ${r.vid} · 앞 ${JSON.stringify(r.S0)} · 뒤 ${JSON.stringify(r.S1)} · 동기 뒤 ${JSON.stringify(r.S2)} · 문 ${JSON.stringify(r.stat)}`);
    ok(real(ON), '★① 되살림 타이머 0 · 그 자리에 쓰러진 채(HP 0 · 나감 `died`) · 명부에서 빠짐', JSON.stringify([r.timers, r.S1.exit, r.S1.hp]));
    ok(listed(ON), '★① econ 명부 −1 · 몸 명부 −1(사람과 몸을 같이 뺀다)', `econ ${r.S0.econ}→${r.S1.econ} · 몸 ${r.S0.npc}→${r.S1.npc}`);
    ok(counted(ON), `★① 그 직업 수 −1(\`counts.${r.S0.job}\` · T311 줄)`, `${r.S0.cnt}→${r.S1.cnt}`);
    ok(r.S1.wild === r.S0.wild + 1, '① econ 야생 누계 `_wildDeadTot` +1(랩 `reapDead` 그 칸 · T1315)', `${r.S0.wild}→${r.S1.wild}`);
    ok(corpse(ON), '★① 주검이 남는다(몸은 존에 그대로 · 누운 몸 꼬리표 `died.wild` +1 · 누운 시간 뒤 거둠)', `died.wild ${r.S0.died}→${r.S1.died}`);
    ok(r.S2.npc === r.S1.npc && r.S2.econ === r.S1.econ && !ON.syncErr, '② 다음 몸 동기(운영 그 문) 뒤 — 다른 몸이 또 줄지 않는다', JSON.stringify(r.S2));
    ok(r.chief.had && r.chief.exit === 'died' && r.chief.now === r.chief.next && r.chief.econ[1] === r.chief.econ[0] - 1 && r.chief.wild[1] === r.chief.wild[0], '③ 촌장이 사람 손에 쓰러짐 — 다음 사람이 촌장 · econ −1 · 야생 누계 그대로', JSON.stringify(r.chief));
  }
  sec('C 끔(`T1432_NPC_DEATH` 없음) — 종전 30초 되살림');
  const OFF = await runChild({}, 'off');
  if (OFF.err) ok(false, '끔 판', OFF.err);
  else {
    const r = OFF.r;
    ok(r.timers.length >= 1 && r.timers[0] === 30000 && r.S1.inList && r.S1.econ === r.S0.econ && r.S1.cnt === r.S0.cnt && !r.S1.exit, '④ 끔 = 종전(되살림 타이머 30초 · 명부 · econ · 직업 수 그대로)', JSON.stringify([r.timers, r.S1]));
  }
  sec('D 미끼 넷 — 켬 판에 원문 한 곳을 비틀어 싣는다');
  const want = { a: real, b: listed, c: counted, d: corpse }, what = { a: '되살아나는 사본(켬 한 줄을 뺌)', b: '명부에서 안 빠지는 사본(econ 빼기 → 읽기)', c: '`counts` 가 하나 남는 사본(직업 수 줄을 뺌)', d: '주검이 안 남는 사본(눕는 문 → 걸어 나가는 문)' };
  const BR = {};
  for (const k of Object.keys(BAIT)) BR[k] = await runChild({ T1432_NPC_DEATH: '1', T1432_BAIT: k }, 'b' + k);
  const red = (k) => !BR[k].err && BR[k].baitN === 1 && !want[k](BR[k]);
  const why = (k) => (BR[k].err ? BR[k].err : `${BR[k].baitN}곳 · ${JSON.stringify(BR[k].r && [BR[k].r.timers, BR[k].r.S1])}`);
  ok(red('a'), `★미끼 a 바꾼 자리 1곳(${what.a}) — ① 되살림 줄이 빨강`, why('a'));
  ok(red('b'), `★미끼 b 바꾼 자리 1곳(${what.b}) — ① 명부 줄이 빨강`, why('b'));
  ok(red('c'), `★미끼 c 바꾼 자리 1곳(${what.c}) — ① 직업 수 줄이 빨강`, why('c'));
  ok(red('d'), `★미끼 d 바꾼 자리 1곳(${what.d}) — ① 주검 줄이 빨강`, why('d'));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
