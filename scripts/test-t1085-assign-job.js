#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1085-assign-job.js — T1085: 촌장이 구성원에게 일을 맡긴다(`assign_job`) ==========================
//
// ★[T1085 · ★재민 11-02] "마을 촌장일 때 NPC 의 직업을 강제할 수 있게" — 이 카드는 **지정 기능만**.
//   ① econ — `assignNPCJob` 이 자율 전환과 **같은 규칙**만 묻는다(자리 · 개인 쿨다운 · 징발 · 포로 무기 직 · 전사 = 무기 하나에 한 사람).
//            지정한 사람은 쿨다운 동안 자율 전환에서 빠진다 · 굶는 날의 식량직 전환은 지정보다 앞선다(배고픈 사람은 밭으로).
//            지정 표지가 없으면 자율 전환 비트가 종전 그대로다(자명 통과 금지 대조 — 표지 없는 같은 판).
//   ② 서버 — 진짜 문(`tryAssignJob`)을 가짜 소켓 사람으로 부른다: 촌장 아님 · NPC 마을 · 멀리서 · 된다(econ 행 · 몸 `simJob` · 방송) · 쿨다운 · 자리 없음.
//            게시판(`tryVillageBoard`)은 촌장에게만 명부(`members`)를 싣는다.
//   ③ 글자 — 하십시오체 · 이모지 0 · 버튼 명사형("일 맡기기").
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const HASIPSIO = /(니다|십시오)\.$/;

// ─────────────────────────────── ① econ ────────────────────────────────────────────
console.log('① econ — assignNPCJob · 자율 전환과의 관계');
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
ok(typeof E.assignNPCJob === 'function' && typeof E.assignableJobs === 'function' && E.JOB_SWITCH_COOLDOWN === 30,
  '①-0 econ 이 지정 함수 · 직업 목록 · 쿨다운 이름(값 30 = 종전 두 자리 그대로)을 낸다');
const mkV = (o) => {
  const v = E.createVillage(Object.assign({ name: '시험', initialPop: 12, fertility: 1, water: 0, game: 0.6, wood: 1, ore: 0.5, stone: 1 }, o || {}));
  v.storage.food = 5000; v.storage.weapon = 0;
  for (const n of v.npcs) n.lastJobChangeDay = -999;
  return v;
};
{
  const v = mkV();
  const D = 100;
  const n = v.npcs.find((x) => x.currentJob !== 'mason') || v.npcs[0];
  const from = n.currentJob;
  ok(E.assignNPCJob(v, n, from, D).why === 'same', '①-1 같은 일 = same');
  ok(E.assignNPCJob(v, n, 'fisher', D).why === 'slot', '①-2 물 없는 땅의 어부 = slot(jobCapacity 0 · 자리 규칙 그대로)');
  ok(E.assignNPCJob(v, n, 'warrior', D).why === 'weapon', '①-3 무기 0 인데 전사 = weapon(무장불가 전사 동원해제 문과 같은 비교)');
  ok(E.assignNPCJob(v, n, 'nojob', D).why === 'job', '①-4 없는 직업 = job');
  ok(E.assignNPCJob(v, { id: 'x' }, 'mason', D).why === 'member', '①-5 이 마을 행이 아니면 member');
  n._warDraft = true; ok(E.assignNPCJob(v, n, 'mason', D).why === 'draft', '①-6 원정 중 = draft'); delete n._warDraft;
  n.captive = true; ok(E.assignNPCJob(v, n, 'hunter', D).why === 'captive', '①-7 포로에게 사냥꾼 = captive'); delete n.captive;
  const c0 = Object.assign({}, v.counts);
  const r = E.assignNPCJob(v, n, 'mason', D);
  ok(r.ok && n.currentJob === 'mason' && n.lastJobChangeDay === D && n._chiefAssignDay === D, '①-8 된다 — 직업 · 바뀐 날 · 지정 표지', r);
  ok(v.counts.mason === (c0.mason || 0) + 1 && v.counts[from] === c0[from] - 1, '①-9 직업 셈(counts)이 한 칸 옮겨졌다(합 무변)');
  const r2 = E.assignNPCJob(v, n, 'forager', D + 5);
  ok(r2.why === 'cool' && r2.left === 25, '①-10 5일 뒤 다시 = cool · 남은 25일', r2);
  ok(E.assignNPCJob(v, n, 'forager', D + 30).ok, '①-11 30일 뒤엔 다시 맡길 수 있다');
  const J = E.assignableJobs(v);
  ok(J.some((j) => j.job === 'farmer') && !J.some((j) => j.job === 'fisher') && !J.some((j) => j.job === 'merchant'),
    '①-12 고를 직업 = 이 땅에 자리가 있는 것(어부 · 행상 없음)', J.map((j) => j.job));
}
// 자율 전환 — 지정 보호 · 굶는 날 예외 · 표지 없는 대조
const runSwitch = (hungry, mark) => {
  const v = mkV();
  const D = 200;
  for (const x of v.npcs) x.lastJobChangeDay = D - 1;          // 모두 쿨다운 중 — 자율 전환이 고를 사람은 '쿨다운을 넘는 사람'뿐
  const n = v.npcs[0];
  if (mark) { n.lastJobChangeDay = -999; E.assignNPCJob(v, n, 'mason', D - 1); }
  else { E._switchNPCJobForTest(n, 'mason', D - 1, v); }        // 표지 없는 같은 전환(자율 전환이 한 것과 같다)
  if (hungry) { for (const r of Object.keys(v.storage)) if (r !== 'weapon') v.storage[r] = 0; }
  E._autoSwitchJobForTest(v, D, null);
  return { job: n.currentJob, others: v.npcs.slice(1).filter((x) => x.lastJobChangeDay === D).length };
};
{
  ok(typeof E._autoSwitchJobForTest === 'function', '①-13 자율 전환 함수를 그대로 부른다(시험 이름 · 사본 0)');
  const a = runSwitch(false, true), b = runSwitch(true, true), c = runSwitch(true, false);
  ok(a.job === 'mason', '①-14 배부른 날 — 촌장이 맡긴 사람은 쿨다운 동안 자율 전환에서 빠진다', a);
  ok(['farmer', 'fisher', 'hunter', 'forager'].includes(b.job), '①-15 굶는 날 — 식량직 자율 전환이 지정보다 앞선다(배고픈 사람은 밭으로)', b);
  ok(c.job === 'mason', '①-16 [대조] 굶는 날이라도 표지 없는 쿨다운(자율 전환)은 종전대로 지킨다 — 예외는 지정에만', c);
}

// ─────────────────────────────── ② 서버 ────────────────────────────────────────────
console.log('② 서버 — 진짜 문(tryAssignJob · tryVillageBoard)');
(async () => {
  const TMP = `/tmp/test-t1085-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  //   ★[T1254] 포트 = 커널이 고른 빈 포트(`fixture-boot` `freePort` 정본 · 종전 `43000 + pid % 900` — 지어낸 번호는 임시 포트 범위 안이라 남이 쥐고 있을 수 있다).
  process.env.ZONE_ID = 'hanbando'; process.env.PORT = String(await require(path.join(__dirname, 'fixture-boot.js')).freePort()); process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '1'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0';
  process.env.LATENCY_MS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  //   ★[T1254] 존 기동 중 오류 줄은 버리지 않고 모은다 — ② 에 닿기 전에 프로세스가 끝나면(야간 11-10: 결과줄 17 = ① 만 · RC 1 — 존의 `uncaughtException` 이
  //     막힌 `console.error` 로 까닭을 찍고 `exit(1)`) 그 까닭을 찍는다. 기동 잡음(`console.log` · `warn`)은 종전대로 버린다.
  const _bootErr = []; let _bootDone = false;
  process.on('exit', (code) => { if (!_bootDone && code) { _l('  ✗ ②-부팅 존이 뜨다 끝났다(그 까닭 줄)  ' + JSON.stringify(_bootErr.slice(-5))); } });
  console.log = () => {}; console.warn = () => {}; console.error = (...a) => { _bootErr.push(a.map(String).join(' ').slice(0, 300)); };
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const SV = require(path.join(ROOT, 'server', 'villages.js'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let vil = null;
  for (let i = 0; i < 600 && !vil; i++) {
    await sleep(500);
    for (const cv of ((SV.clientVillages && SV.clientVillages()) || [])) {
      const x = SV.villageByDbId(cv.id);
      if (x && x.econ && x.econ.npcs && x.econ.npcs.length >= 6 && x.npcPids && x.npcPids.some((p) => H.players.has(p))) { vil = x; break; }
    }
  }
  console.log = _l; console.warn = _w; console.error = _e; _bootDone = true;
  ok(!!vil, '②-0 마을과 그 몸이 섰다');
  if (!vil) return done();
  const vid = vil.dbId;
  const A = SV.villageAnchorPx(vil);
  let _pid = 0;
  const mk = (x, y) => {
    const notices = [], msgs = [];
    const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); msgs.push(o); if (o.type === 'notice') notices.push(o); } catch (e) {} } };
    return { pid: `t1085p${++_pid}`, playerId: `t1085_${_pid}`, name: '촌장', ws, x, y, inventory: {}, notices, msgs };
  };
  const last = (p) => (p.notices.length ? p.notices[p.notices.length - 1].text : null);
  const chief = mk(A.x, A.y), other = mk(A.x, A.y), far = mk(A.x + 99999, A.y);
  const keepFounder = vil.econ.founder, keepKin = vil._kin;
  // NPC 마을 그대로(창설자 없음) — 손대지 않는다(④)
  const n0 = vil.econ.npcs[0];
  const job0 = n0.currentJob;
  await H.tryAssignJob(chief, vid, n0.id, 'mason');
  ok(n0.currentJob === job0 && /사람이 세운 마을에서만/.test(last(chief) || ''), '②-1 NPC 마을 = 안 된다 · 이유 한 줄', last(chief));
  ok(H.tryVillageBoard && (H.tryVillageBoard(chief, vid), !((chief.msgs.filter((m) => m.type === 'village_board').pop() || {}).board || {}).members),
    '②-2 NPC 마을 게시판엔 명부가 없다');
  // 사람 마을로 꾸민다 — 창설자 = 시험 촌장(T785 마을 칸이 있으면 그 칸도)
  vil.econ.founder = chief.playerId;
  if (vil._kin) vil._kin = Object.assign({}, vil._kin, { chief: chief.playerId });
  await H.tryAssignJob(other, vid, n0.id, 'mason');
  ok(n0.currentJob === job0 && last(other) === '촌장만 일을 맡길 수 있습니다.', '②-3 촌장 아님 = 안 된다(곳간과 같은 술어)', last(other));
  await H.tryAssignJob(far, vid, n0.id, 'mason');
  ok(n0.currentJob === job0 && /가까이에서만/.test(last(far) || ''), '②-4 멀리서 = 안 된다(곳간과 같은 근접 문)', last(far));
  // 명부
  chief.msgs.length = 0; H.tryVillageBoard(chief, vid);
  const bd = (chief.msgs.find((m) => m.type === 'village_board') || {}).board || {};
  const M = bd.members;
  ok(M && Array.isArray(M.rows) && M.rows.length === vil.econ.npcs.length && M.cooldown === 30, '②-5 촌장 게시판 = 명부(econ 행 수 그대로 · 쿨다운 30)',
    M ? { n: M.rows.length, econ: vil.econ.npcs.length } : null);
  ok(M && M.rows.every((r) => r.jobKo && !/^[a-z_]+$/.test(r.jobKo)) && M.jobs.every((j) => j.ko && !/^[a-z_]+$/.test(j.ko)), '②-6 명부의 직업 이름이 전부 우리말(석공 · 재봉사 칸 포함)');
  // 된다 — 맡길 사람: 쿨다운 밖 · 원정 아님 · 지금 일의 몸이 있는 사람 · 맡길 일: 빈자리 있는 다른 일(무기 직 빼고)
  const bodyJobs = new Set(vil.npcPids.map((p) => H.players.get(p)).filter(Boolean).map((b) => b.simJob));
  const R0 = M ? M.rows.find((r) => !r.left && !r.away && bodyJobs.has(r.job)) : null;
  const J0 = R0 ? M.jobs.find((j) => j.open && j.job !== R0.job && j.job !== 'warrior' && j.job !== 'hunter') : null;
  ok(!!(R0 && J0), '②-7 맡길 사람과 빈자리 일이 있다', { R0, J0 });
  if (R0 && J0) {
    const npc = vil.econ.npcs.find((n) => n.id === R0.id);
    const bodies0 = new Map(vil.npcPids.map((p) => [p, (H.players.get(p) || {}).simJob]));
    const counts0 = Object.assign({}, vil.econ.counts);
    const bc = []; const P0 = H.players; const spy = mk(A.x, A.y); spy.pid = 't1085spy'; P0.set(spy.pid, spy);
    chief.notices.length = 0;
    const r = await H.tryAssignJob(chief, vid, R0.id, J0.job);
    P0.delete(spy.pid);
    const txt = last(chief) || '';
    ok(r && r.ok && npc.currentJob === J0.job, '②-8 된다 — econ 행의 직업이 바뀌었다', r);
    ok(vil.econ.counts[J0.job] === (counts0[J0.job] || 0) + 1 && vil.econ.counts[R0.job] === counts0[R0.job] - 1, '②-9 마을 직업 셈이 한 칸 옮겨졌다');
    const moved = [...bodies0].filter(([p, j]) => (H.players.get(p) || {}).simJob !== j);
    ok(moved.length === 1 && bodies0.get(moved[0][0]) === R0.job && H.players.get(moved[0][0]).simJob === J0.job,
      '②-10 그 일을 하던 몸 하나가 새 일로(몸 수 · 자리 그대로 — 새 몸 0)', moved);
    const vj = spy.msgs.find((m) => m.type === 'village_jobs');
    ok(!!(vj && moved[0] && vj.jobs[moved[0][0]] === J0.job), '②-11 바뀐 몸을 곧바로 알린다(village_jobs · 하루 방송과 같은 꼴)', vj || spy.msgs.map((m) => m.type).slice(0, 5));
    ok(/일을 맡겼습니다\./.test(txt) && /30일 동안/.test(txt) && /굶으면/.test(txt), '②-12 알림 = 무엇을 맡겼나 · 30일 · 굶으면 먼저 식량', txt);
    const bd2 = (chief.msgs.filter((m) => m.type === 'village_board').pop() || {}).board || {};
    const row2 = bd2.members && bd2.members.rows.find((x) => x.id === R0.id);
    ok(!!(row2 && row2.job === J0.job && row2.left === 30 && row2.chief), '②-13 게시판이 새로 와서 그 줄 = 새 일 · 30일 뒤 · 촌장이 맡김', row2);
    chief.notices.length = 0;
    await H.tryAssignJob(chief, vid, R0.id, R0.job);
    ok(npc.currentJob === J0.job && /30일 뒤에 다시 맡길 수 있습니다\./.test(last(chief) || ''), '②-14 바로 다시 = 쿨다운 · 남은 날', last(chief));
  }
  // 자리 없음 · 무기 없음 — 쿨다운 밖 사람으로
  const R1 = vil.econ.npcs.find((n) => !n._warDraft && (n.lastJobChangeDay == null || n.lastJobChangeDay < -100) && n.currentJob !== 'warrior');
  if (R1) {
    const st = vil.econ.storage.weapon; vil.econ.storage.weapon = 0;
    chief.notices.length = 0; await H.tryAssignJob(chief, vid, R1.id, 'warrior');
    ok(/무기가 모자랍니다\./.test(last(chief) || ''), '②-15 무기 0 · 전사 = 이유 한 줄', last(chief));
    vil.econ.storage.weapon = st;
    chief.notices.length = 0; await H.tryAssignJob(chief, vid, R1.id, 'merchant');
    ok(/자리가 남지 않았습니다\./.test(last(chief) || ''), '②-16 자리 0(행상) = 이유 한 줄', last(chief));
  } else ok(false, '②-15/16 쿨다운 밖 사람이 없다');
  // ③ 글자
  const all = [chief, other, far].flatMap((p) => p.notices.map((n) => n.text));
  ok(all.length > 0 && all.every((t) => !EMOJI.test(t)), '③-1 알림에 이모지 0');
  ok(all.every((t) => HASIPSIO.test(t)), '③-2 알림은 하십시오체(…니다. / …십시오.)', all.filter((t) => !HASIPSIO.test(t)));
  const cli = fs.readFileSync(path.join(ROOT, 'public', 'client', '47-s-board.js'), 'utf8');
  ok(/>일 맡기기</.test(cli) && /type: 'assign_job'/.test(cli), '③-3 클라 버튼 = "일 맡기기"(명사형) · 보내는 것 = assign_job');
  vil.econ.founder = keepFounder; vil._kin = keepKin;
  done();
})().catch((e) => { console.log('예외', e && e.stack); fail++; done(); });
function done() {
  console.log(`\n=== T1085: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
