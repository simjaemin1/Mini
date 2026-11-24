#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5
// === scripts/test-t1461-beast-unseen.js — [T1461 · T1432 회부 1 · 2 · 3] 보는 사람이 없어도 짐승은 사람을 친다(손잡이 `T1461_BEAST_UNSEEN` · `T1432_NPC_DEATH` 안 · 끔 기본) ===
//
// ★지키는 계약:
//   ① 깨우는 이 — 마을 밖에 선 NPC 몸(영토 칸 밖 · 캐러밴 · 마을 없는 몸)이 사냥판을 깨운다(보는 사람 곁이 아니어도) · 마을 안 몸 · 걸어 나가는 몸 · 끔 = 아니다
//      (같은 술어를 야생 층에서 부른다 — `wildlife._t1461Waker`) · 마을 밖 = 마을이 답한다(`t1461Out` · 제 마을 영토 칸 `_terrSet`)
//   ② 몸이 없는 사람은 안 죽는다 — 명부 밖 몸(마을 없는 몸)이 죽어도 어느 마을 econ 도 안 준다
//   ③ 캐러밴 상인 · 호위 · 마을 없는 몸이 짐승에 쓰러지면 T1432 길(주검 · 30초 되살림 0) — 상인 = 행상 피살과 같은 문(`killTrader` · econ 한 번 −1) · 호위 = 출발 마을 전사 −1 · 호위 수 −1
//   ④ 낙하로 HP 0 인 NPC — 같은 문(`damagePlayer`)으로 쓰러져 죽는다(HP 0 으로 남지 않는다)
//   ⑤ 끔 = 종전(명부 밖 몸 30초 되살림 · 낙하 `setHp` 만)
// ★미끼 다섯(이 파일 안 · 바꾼 자리 1곳씩 · 자식이 원문을 메모리에서 비틀어 같은 경로로 싣는다):
//   ㉠ 보는 사람이 있을 때만 맞는 사본(= 지금 — 깨우는 이 술어가 늘 거짓) ㉡ 몸 없는 사람이 죽는 사본(마을 없는 몸의 죽음에 첫 마을 사람 하나를 뺀다)
//   ㉢ 같은 죽음을 두 번 세는 사본(호위 하나가 죽었는데 econ 사람을 둘 뺀다) ㉣ 30초 뒤 되살아나는 사본(존의 T1461 한 줄을 뺀다) ㉤ 낙하 HP 0 으로 남는 사본(낙하 줄을 종전으로)
// ★날짜 · 벽시계 0(되살림 타이머는 세고 지운다).
// 실행: node scripts/test-t1461-beast-unseen.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js'), WF = path.join(ROOT, 'server', 'wildlife.js');
const BAIT = {
  a: { file: WF, from: 'return T1461 && p.isNpc && !hunter', to: 'return false && p.isNpc && !hunter' },
  b: { file: VF, from: "    _bxDie(null, p, { k }); _t1461Stat.lone++;", to: "    _bxDie(null, p, { k }); _t1461Stat.lone++; { const v0 = (state.villages || []).find((x) => x.econ && x.econ.npcs.length); if (v0) v0.econ.npcs.splice(0, 1); }" },
  c: { file: VF, from: "const rd = home.npcs.splice(j, 1)[0];", to: "const rd = home.npcs.splice(j, 2)[0];" },
  d: { file: ZF, from: "      if (T1461_BEAST_UNSEEN && SimVillages.t1461Die && SimVillages.t1461Die(p, source)) {", to: "      if (false) {" },
  e: { file: ZF, from: "          if (typeof T1461_BEAST_UNSEEN !== 'undefined' && T1461_BEAST_UNSEEN && entity.isNpc) damagePlayer(entity, dmg, 'fall');", to: "          if (false) damagePlayer(entity, dmg, 'fall');" },
};
if (process.env.T1461_ROLE === 'zone') { zoneChild(); return; }
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); return !!c; };
const sec = (t) => console.log('\n' + t);

sec('A 원문 — 손잡이 · 문 · 미끼 자리');
{
  const z = fs.readFileSync(ZF, 'utf8'), v = fs.readFileSync(VF, 'utf8'), w = fs.readFileSync(WF, 'utf8');
  ok(/const T1461_BEAST_UNSEEN = T1432_NPC_DEATH && process\.env\.T1461_BEAST_UNSEEN === '1';/.test(z) && /const T1461 = T1393 && process\.env\.T1432_NPC_DEATH === '1' && process\.env\.T1461_BEAST_UNSEEN === '1';/.test(w)
    && /const T1461_BEAST_UNSEEN = process\.env\.T1432_NPC_DEATH === '1' && process\.env\.T1461_BEAST_UNSEEN === '1';/.test(v), '손잡이 `T1461_BEAST_UNSEEN` — `1` 만 켬 · `T1432_NPC_DEATH` 안(존 · 마을 · 야생 같은 글자)');
  ok(!/Math\.random|0\.\d+\s*\*\s*dt/.test(w.slice(w.indexOf('function _t1461Waker'), w.indexOf('const _t1461St'))), '새 확률 식 0 — 깨우는 이 술어뿐(맞음 · 피해 · 요양은 블록 규칙 그대로)');
  for (const k of Object.keys(BAIT)) { const b = BAIT[k], src = b.file === ZF ? z : (b.file === VF ? v : w); ok(src.split(b.from).length - 1 === 1, `미끼 ${k} 자리 — 원문에 정확히 한 곳`, path.basename(b.file)); }
}

function zoneChild() {
  const out = {};
  const put = () => { try { fs.writeFileSync(process.env.T1461_OUT, JSON.stringify(out)); } catch (e) {} };
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '1', VILLAGE_MAX: '2', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0', CENTRAL_URL: 'http://127.0.0.1:9' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const bk = process.env.T1461_BAIT;
    if (bk && BAIT[bk]) {
      const Module = require('module'), b = BAIT[bk], src = fs.readFileSync(b.file, 'utf8');
      out.baitN = src.split(b.from).length - 1;
      const m = new Module(b.file, module); m.filename = b.file; m.paths = Module._nodeModulePaths(path.dirname(b.file));
      require.cache[b.file] = m;
      m._compile(src.replace(b.from, b.to), b.file); m.loaded = true;
    }
    const Zone = require(ZF);
    const H = Zone.__testBind(), SV = H.SimVillages, players = H.players, W = require(WF);
    const timers = [];
    const st0 = global.setTimeout;
    global.setTimeout = function (f, ms, ...a) { const h = st0(f, ms, ...a); if (typeof f === 'function' && /player_respawn/.test(String(f))) { timers.push(ms); clearTimeout(h); } return h; };
    const t0 = Date.now();
    const find = () => { for (let id = 1; id <= 64; id++) { const v = SV.villageByDbId(id); if (v && v.econ && v._terrSet && v._terrSet.size && v.npcPids && v.npcPids.filter((pid) => players.has(pid)).length >= 5 && v.econ.npcs.length >= 5) return v; } return null; };
    const step = () => {
      const vil = find();
      if (!vil) { if (Date.now() - t0 > 400000) { out.err = '마을 몸 없음'; put(); process.exit(0); } st0(step, 1000); return; }
      const S = SV.__t1461 ? SV.__t1461.st() : null;
      const tot = () => (S.villages || []).reduce((a, x) => a + ((x.econ && x.econ.npcs.length) || 0), 0);
      const pids = vil.npcPids.filter((pid) => players.has(pid));
      const P = (i) => players.get(pids[i]);
      //   ① 깨우는 이 — 마을 안 · 밖 · 캐러밴 · 걸어 나가는 몸
      const pIn = P(1), tIn = [...vil._terrSet][0].split(',').map(Number);
      pIn.x = tIn[0] * 32 + 16; pIn.y = tIn[1] * 32 + 16;
      const host = { t1461Out: (p) => SV.t1461Out(p) };
      const pOut = P(2); pOut.x = (vil.ccx + 400) * 32; pOut.y = vil.ccy * 32;
      const wk = { inside: W._t1461Waker ? W._t1461Waker(pIn, false, host) : null, outside: W._t1461Waker ? W._t1461Waker(pOut, false, host) : null,
        hunterOut: W._t1461Waker ? W._t1461Waker(pOut, true, host) : null, out: SV.t1461Out(pOut), in: SV.t1461Out(pIn) };
      pOut._bxExit = 'walk'; wk.walking = W._t1461Waker ? W._t1461Waker(pOut, false, host) : null; pOut._bxExit = undefined;
      out.wk = wk;
      //   ③ 캐러밴 상인 · 호위 — 명부 밖 몸으로 바꿔 세운다(존 캐러밴 몸 문법: simCaravan · 장부 줄 caravanBodies)
      const e = vil.econ, trader = e.npcs[e.npcs.length - 1];
      if (e.npcs[0].currentJob !== 'warrior') { e.npcs[0].currentJob = 'warrior'; e.counts = e.counts || {}; e.counts.warrior = (e.counts.warrior || 0) + 1; }   // 첫 사람 = 전사(호위의 사람)
      const c = { id: 't1461c', from: e, to: e, trader, escort: 1, state: 'outbound', giveRes: 'food', giveAmt: 5 };
      S.world.caravans = S.world.caravans || []; S.world.caravans.push(c);
      const pm = P(3), pe = P(4);
      for (const q of [pm, pe]) { vil.npcPids.splice(vil.npcPids.indexOf(q.pid), 1); q.simCaravan = true; q.x = (vil.ccx + 300) * 32; q.y = vil.ccy * 32; }
      S.caravanBodies = S.caravanBodies || new Map(); S.caravanBodies.set('t1461c', { pid: pm.pid, escorts: [{ pid: pe.pid }] });
      out.car0 = { econ: e.npcs.length, warrior: (e.counts || {}).warrior | 0, killed: (e.tradeStats && e.tradeStats.tradersKilled) | 0, tot: tot(), wk: W._t1461Waker ? W._t1461Waker(pm, false, host) : null };
      H.damagePlayer(pm, (pm.hp || 100) + 50, 'wild:🐺습격');
      H.damagePlayer(pe, (pe.hp || 100) + 50, 'wild:🐯습격');
      out.car1 = { econ: e.npcs.length, warrior: (e.counts || {}).warrior | 0, killed: (e.tradeStats && e.tradeStats.tradersKilled) | 0, tot: tot(), done: !!c._done, escort: c.escort,
        mExit: pm._bxExit || null, eExit: pe._bxExit || null, mAlive: players.has(pm.pid), mDown: !!pm.isDown, traderIn: e.npcs.includes(trader), t: timers.length };
      //   ② 마을 없는 몸 — 어느 마을 econ 도 안 준다
      const pl = P(5); vil.npcPids.splice(vil.npcPids.indexOf(pl.pid), 1); pl.simVillageId = null; pl.x = (vil.ccx + 200) * 32;
      const T0 = tot(); H.damagePlayer(pl, (pl.hp || 100) + 50, 'wild:🐗습격');
      out.lone = { tot0: T0, tot1: tot(), exit: pl._bxExit || null, t: timers.length };
      //   ④ 낙하 — 마을 몸 하나를 2층 허공에(받침 없음) · HP 10 → 25 피해
      const pf = P(6) || P(0); pf.canadiaVillage = true; pf.floor = 1; pf.z = 0; pf.hp = 10; pf.falling = false; pf.x = (vil.ccx + 150) * 32 + 16; pf.y = vil.ccy * 32 + 16;
      out.stat0 = SV.t1461Stat ? SV.t1461Stat() : null;
      st0(() => {
        out.fall = { hp: pf.hp, exit: pf._bxExit || null, down: !!pf.isDown, floor: pf.floor, t: timers.length, inList: vil.npcPids.includes(pf.pid) };
        out.stat = SV.t1461Stat ? (({ died, car, esc, lone, skip }) => ({ died, car, esc, lone, skip }))(SV.t1461Stat()) : null;
        out.timers = timers.slice();
        put(); process.exit(0);
      }, 3000);
    };
    st0(step, 2000);
  } catch (e) { out.err = String(e && e.stack || e); put(); process.exit(0); }
}

function runChild(env, label) {
  return new Promise((resolve) => {
    const LP = require('./lib-port');
    const RUN = fs.mkdtempSync(`/tmp/t1461-${label}-`); require('./lib-tmp').own(RUN);
    const OUT = path.join(RUN, 'out.json');
    const E = Object.assign({}, process.env, { T1461_ROLE: 'zone', T1461_OUT: OUT, DB_PATH: path.join(RUN, 'z.db'), PORT: String(LP.port(38520 + label.length * 7 + label.charCodeAt(label.length - 1) % 13)),
      T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1' }, env);
    for (const k of ['T1432_NPC_DEATH', 'T1461_BEAST_UNSEEN']) if (!(k in env)) delete E[k];
    const ch = spawn(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: 'ignore' });
    const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 600000);
    ch.on('exit', () => { clearTimeout(to); let r = null; try { r = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { r = { err: '결과 없음' }; } try { fs.rmSync(RUN, { recursive: true, force: true }); } catch (e) {} resolve(r); });
  });
}

(async () => {
  const waker = (o) => !!(o && o.wk && o.wk.outside === true && o.wk.inside === false && o.wk.walking === false && o.wk.hunterOut === false);
  const lone = (o) => !!(o && o.lone && o.lone.exit === 'died' && o.lone.tot1 === o.lone.tot0);
  const once = (o) => !!(o && o.car1 && o.car1.warrior === o.car0.warrior - 1 && o.car1.econ === o.car0.econ - 2);
  const noRes = (o) => !!(o && o.car1 && o.car1.t === 0 && o.car1.mExit === 'died' && o.car1.eExit === 'died');
  const fell = (o) => !!(o && o.fall && o.fall.exit === 'died' && o.fall.down && o.fall.floor === 0);
  sec('B 켬(`T1432_NPC_DEATH=1 T1461_BEAST_UNSEEN=1`) — 존 자식(마을 둘 · 사냥판 세계)');
  const ON = await runChild({ T1432_NPC_DEATH: '1', T1461_BEAST_UNSEEN: '1' }, 'on');
  if (ON.err) ok(false, '켬 판', ON.err);
  else {
    ok(waker(ON) && ON.wk.out === true && ON.wk.in === false, '★① 깨우는 이 — 마을 밖 NPC 몸 = 참 · 영토 칸 안 = 거짓 · 걸어 나가는 몸 = 거짓 · 사냥꾼은 제 갈래(이 술어 밖)', JSON.stringify(ON.wk));
    ok(ON.car0 && ON.car0.wk === true, '① 캐러밴 몸(길 위) = 깨우는 이');
    ok(noRes(ON) && ON.car1.mAlive && ON.car1.mDown, '★③ 캐러밴 상인 · 호위가 짐승에 쓰러짐 — 30초 되살림 0 · 그 자리 주검(나감 `died`)', JSON.stringify(ON.car1));
    ok(ON.car1.done && !ON.car1.traderIn && ON.car1.killed === ON.car0.killed + 1, '③ 상인 = 행상 피살과 같은 문(`killTrader` — 그 사람 econ 명부에서 · 캐러밴 끝 · 피살 누계 +1)', `${ON.car0.killed}→${ON.car1.killed}`);
    ok(once(ON) && ON.car1.escort === 0, '★③ 같은 죽음은 한 번 — 상인 −1 · 호위 = 출발 마을 전사 −1(econ 둘 · 전사 수 하나) · 호위 수 −1', `econ ${ON.car0.econ}→${ON.car1.econ} · 전사 ${ON.car0.warrior}→${ON.car1.warrior}`);
    ok(lone(ON), '★② 마을 없는 몸 — 주검만 · 어느 마을 econ 도 안 준다(몸 없는 사람은 안 죽는다)', JSON.stringify(ON.lone));
    ok(fell(ON), '★④ 낙하 HP 0 — 같은 문으로 쓰러져 죽는다(주검 · 명부 −1 · HP 0 으로 남지 않는다)', JSON.stringify(ON.fall));
    ok(ON.stat && ON.stat.car === 1 && ON.stat.esc === 1 && ON.stat.lone === 1, '셈 — 상인 1 · 호위 1 · 마을 없는 몸 1', JSON.stringify(ON.stat));
  }
  sec('C 끔(`T1432_NPC_DEATH=1` 만) — 종전(명부 밖 몸 30초 되살림 · 낙하 setHp)');
  const OFF = await runChild({ T1432_NPC_DEATH: '1' }, 'off');
  if (OFF.err) ok(false, '끔 판', OFF.err);
  else {
    ok(OFF.wk && OFF.wk.outside === false && OFF.wk.out === false, '⑤ 끔 — 깨우는 이 술어 거짓 · 마을이 안 답한다', JSON.stringify(OFF.wk));
    ok(OFF.car1 && OFF.car1.t >= 2 && !OFF.car1.mExit && OFF.car1.econ === OFF.car0.econ, '⑤ 끔 — 캐러밴 몸 30초 되살림(타이머) · econ 그대로', JSON.stringify(OFF.car1));
    ok(OFF.fall && OFF.fall.hp === 0 && !OFF.fall.exit, '⑤ 끔 — 낙하 HP 0 으로 남는다(종전 결함 그대로)', JSON.stringify(OFF.fall));
  }
  sec('D 미끼 다섯 — 켬 판에 원문 한 곳을 비틀어 싣는다');
  const BR = {};
  for (const k of Object.keys(BAIT)) BR[k] = await runChild({ T1432_NPC_DEATH: '1', T1461_BEAST_UNSEEN: '1', T1461_BAIT: k }, 'b' + k);
  const why = (k, f) => (BR[k].err ? BR[k].err : `${BR[k].baitN}곳 · ${JSON.stringify(f(BR[k]))}`);
  ok(!BR.a.err && BR.a.baitN === 1 && !waker(BR.a), '★미끼 ㉠ 바꾼 자리 1곳(보는 사람이 있을 때만 맞는 사본 — 깨우는 이 술어가 늘 거짓) — ① 줄이 빨강', why('a', (o) => o.wk));
  ok(!BR.b.err && BR.b.baitN === 1 && !lone(BR.b), '★미끼 ㉡ 바꾼 자리 1곳(몸 없는 사람이 죽는 사본 — 마을 없는 몸 죽음에 마을 사람 하나를 뺌) — ② 줄이 빨강', why('b', (o) => o.lone));
  ok(!BR.c.err && BR.c.baitN === 1 && !once(BR.c), '★미끼 ㉢ 바꾼 자리 1곳(같은 죽음을 두 번 세는 사본 — 호위 하나에 econ 사람 둘) — ③ 한 번 줄이 빨강', why('c', (o) => o.car1));
  ok(!BR.d.err && BR.d.baitN === 1 && !noRes(BR.d), '★미끼 ㉣ 바꾼 자리 1곳(30초 뒤 되살아나는 사본 — 존 T1461 한 줄을 뺌) — ③ 되살림 줄이 빨강', why('d', (o) => o.car1));
  ok(!BR.e.err && BR.e.baitN === 1 && !fell(BR.e), '★미끼 ㉤ 바꾼 자리 1곳(낙하 HP 0 으로 남는 사본 — 낙하 줄을 종전으로) — ④ 줄이 빨강', why('e', (o) => o.fall));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  require('./lib-tmp').clean && require('./lib-tmp').clean();
  process.exit(fail ? 1 : 0);
})();
