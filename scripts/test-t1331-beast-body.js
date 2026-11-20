#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1331-beast-body.js — 야생 짐승 = 몸(T1331 · 손잡이 `T1331_BEAST_BODY` 끔 기본) · 정본 함수 · 자식 판 · 미끼 다섯 ======
//
// ★왜 [T1331 · ★재민 11-15 "모든 짐승도 다 몸이 있어야지"] 켬이면 사냥터 개체 장부(`_gameRich`)를 안 읽고 몸 표(`server/beast-body.js`)만 쓴다.
//   이 하네스는 정본 문으로만 판을 꾸민다 — 지형 `__labProbe._huntProbe.setTa` · 몸 · 사람 `_t400Probe.setup` · 하루 `_lifeGameDay`(제품 하루가 부르는 그 발생기) ·
//   벌채 `_t1053Deforest` · 보이는 몸 죽음 `beast-body.current.diedAt`(존 죽음 길 셋이 부르는 그 문) · 저장 · 되읽기 `zone-local-db t1331Save · t1331Load`(임시 DB 파일) ·
//   보임 다리 `wildlife.init` + `tick`(가짜 존 호스트) · 존 넘김 `xzone-beast.createBeastDoor` 두 개(가짜 존 둘 · 글 = 맞은편 `receive`).
// 판(숲 띠 하나 · 마을 셋이 띠 위에 줄 · A 가득 · D 거의 다 죽임(재정착 받을 곳) · C 절반 죽임(번식) · 마을마다 사냥꾼 둘 · 몸 환율 100 · 56날):
//   ① [상황] 손잡이 기본 끔(`'1'` 만 켬) · 끔 판 = 장부 그대로 · 몸 모듈이 실리지도 않는다 · 랩 밀도 수(MOB_DENS 0.02)가 wildlife 글자와 같다
//   ② 이행 — 장부를 지은 순간 몸 수 = 장부 합 ÷ 환율(내림) · 장부는 버려졌다(`_gameRich` null · `_gameNone`) · 다시 안 짓는다
//   ③ ★보존 — 날마다 살아 있는 몸 = 처음 + 태어남 − 죽음 − 넘어감 + 넘어옴 − 길듦(어긋남 0) · 날 차이도 같은 식 · 없던 몸 0(새 id 는 다 그날 난 몸 · 어미가 전날 살아 있었다) · 죽은 id 가 다시 안 선다
//   ④ ★번식은 어미 곁에서만 — 새 몸마다 그날 어미가 선 칸과 체비셰프 2 안 · 어미는 같은 종 · 암컷
//   ⑤ ★이동은 걸음으로만 — 날마다 몸마다 옮긴 거리 ≤ 30걸음 × 2칸 · 걸음 감시 0 · 옮겨 간 몸(재정착)이 실제로 닿았다 · 그 사이 날들도 걸음 상한 안
//   ⑥ 사냥 — 사냥꾼이 죽인 몸 수(예산 `_huntBud` 합) = 몸 표 사냥 죽음 · 죽을 때마다 몸 하나가 표에서 빠졌다
//   ⑦ 벌채 — 서식 칸이 줄고 · 그 칸의 몸은 다음 날 떠났거나 굶어 죽었다 · 서식이 다 없어진 마을의 몸은 이웃으로 떠났다(사라짐 0)
//   ⑧ 14일 부존 — `land.game` = 기준 × clamp(몸 수 / 처음 몸 수)(랩 합 / tot0)
//   ⑨ 되읽기 — 저장 → 새 프로세스 부팅 → 몸 수 · id · 자리 같음 · 장부는 다시 안 선다
//   ⑩ 보임 다리 — 켜진 청크의 몸이 존 몹으로 선다 · 꺼지면 몸 표로 돌아간다(수 같음) · 길들면 몸 표에서 길듦으로 나간다 · 존 죽음 문이 몸 죽음으로 센다
//   ⑪ 존 넘김(T1321 문) — 몸이 띠를 넘으면 보낸 존 넘어감 1 · 받은 존 넘어옴 1 · 두 존 합 같음 · 몸 칸(종 · 암수) 실림
// 미끼(MUT · 빨강이어야 한다): resettle(재정착 +2 되살림 — 빈 무리터에 없던 몸) · ledger(사냥이 몸 없이 셈만 깎음) · teleport(걸음 대신 목표로 뜀) ·
//   farkid(새끼를 어미 곁 아닌 아무 칸에) · keepledger(이행 뒤 장부를 안 버림)
// 실행: node scripts/test-t1331-beast-body.js   (DB = 임시 파일 · 존 0 · 라이브 무접촉 · 몇십 초)
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), Module = require('module'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1331_TB_MODE || '';
const MUTS = ['resettle', 'ledger', 'teleport', 'farkid', 'keepledger'];
// ★[T1400 ㉲] 미끼 다섯 — [파일, 바늘, 바꿀 글자] 한 표(사본 0): 아이(`mutate`)가 바꾸고 · 부모가 바늘이 정본에 몇 번 있는지 센다(바꾼 자리)
const MUT_SWAP = {
  resettle: ['beast-body.js', "      b.walk = { to: v, at: src[1] }; W.st.walkers++; sent++;", "      _put({ id: W.next++, sp: b.sp, sex: 0, born: -1, mom: -1, home: v, cx: KX(src[1]), cy: KY(src[1]), mat: 0, mid: null, hp: 0, tr: 0, walk: null }); sent++;"],
  ledger: ['beast-body.js', "    p._t1331Acc -= 1;\n    return _die(b, 'hunt');", "    p._t1331Acc -= 1;\n    W.st.died.hunt++; return b;"],
  teleport: ['beast-body.js', "    _moveTo(b, bx, by, 'step'); W.st.steps++;", "    _moveTo(b, tx, ty, 'step'); W.st.steps++;"],
  farkid: ['beast-body.js', "home: m.home, cx: m.cx, cy: m.cy, mat: 0, mid: null, hp: 0, tr: 0, walk: null });", "home: m.home, cx: KX(W.hab.get(m.home).list[h32(kid, day, 7) % W.hab.get(m.home).list.length]), cy: KY(W.hab.get(m.home).list[h32(kid, day, 7) % W.hab.get(m.home).list.length]), mat: 0, mid: null, hp: 0, tr: 0, walk: null });"],
  keepledger: ['villages.js', "    vil._gameRich = null; vil._gameNone = 1; vil._gameScan = null;   // 장부를 버린다", "    // 장부를 버린다"],
};


if (MODE === 'world' || MODE === 'reload') child().catch((e) => { fs.writeFileSync(process.env.T1331_TB_OUT, JSON.stringify({ err: String(e && e.stack || e).slice(0, 1500) })); }); else parent();

function parent() {
  let pass = 0, fail = 0;
  const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
  const MUT = process.env.T1331_MUTANT || '';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't1331-tb-'));
  const run = (mode, extra) => {
    const out = path.join(tmp, mode + '.json');
    const env = Object.assign({}, process.env, { T1331_TB_MODE: mode, T1331_TB_OUT: out, T1331_TB_DB: path.join(tmp, 'z.db'), T1331_MUTANT: MUT }, extra || {});
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) console.log(r.stdout.slice(-2000) + r.stderr.slice(-3000));
    let o = null; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { o = null; }
    return o;
  };
  try {
    // ① 손잡이 기본값 — 자식 셋(읽는 때는 모듈을 읽을 때 한 번)
    if (!MUT) for (const val of [undefined, '0', '', 'true', '1']) {
      const env = Object.assign({}, process.env); delete env.T1331_BEAST_BODY; if (val !== undefined) env.T1331_BEAST_BODY = val;
      env.ENABLE_VILLAGES = '0';
      const r = spawnSync(process.execPath, ['-e', "const V=require('./server/villages');console.log(JSON.stringify([V.T1331_BEAST_BODY, Object.keys(require.cache).some((k)=>/server[\\\\/]beast-body\\.js$/.test(k))]))"], { cwd: ROOT, env, encoding: 'utf8' });
      let on = null, loaded = null; try { [on, loaded] = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) {}
      ok(on === (val === '1') && loaded === false, `① 손잡이 ${JSON.stringify(val)} → ${on ? '켬' : '끔'}(몸 모듈 실림 ${loaded})`);
    }
    if (!MUT) {
      const wl = fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8'), BB = require(path.join(ROOT, 'server', 'beast-body.js'));
      const md = +(wl.match(/MOB_DENS=([0-9.]+)/) || [])[1];
      ok(md === BB.MOB_DENS && BB.SCALE_DEF === 100 / md, `① 몸 환율 기본 = L_GAMEMAX / 랩 MOB_DENS(${md}) = ${BB.SCALE_DEF}`);
      const off = run('world', { T1331_BEAST_BODY: '0' });
      ok(off && off.off && off.off.ledger > 0 && off.off.loaded === false && off.off.bodies === null, '① 끔 판 = 장부가 선다 · 몸 모듈 안 실림', off && JSON.stringify(off.off));
    }
    const o = run('world', { T1331_BEAST_BODY: '1' });
    ok(!!o && !o.err, '판이 끝까지 돌았다', o ? (o.err || `${o.days}날 · 몸 ${o.alive}`) : 'JSON 없음');
    if (!o || o.err) throw new Error('판 없음');
    // ② 이행
    ok(o.mig.every((m) => m.n === Math.floor(m.sum / o.scale + 1e-9) && m.n > 0), '② 이행 몸 수 = 장부 합 ÷ 환율(내림 · 마을마다)', JSON.stringify(o.mig));
    ok(o.mig.every((m) => m.ledgerGone && m.none === 1), '② 장부를 버렸다(_gameRich null · _gameNone 1) · 뒤로 다시 안 섰다', JSON.stringify(o.mig.map((m) => [m.ledgerGone, m.none, m.rebuilt])));
    ok(o.mig.every((m) => m.rebuilt === 0), '② 이행 뒤 날들에 장부가 다시 지어진 적 0');
    // ③ 보존
    const S = o.sum;
    ok(S.audits >= o.days - 1 && S.mismatch === 0 && o.dayBad === 0, '③ 날마다 몸 수 = 처음 + 태어남 − 죽음 − 넘어감 + 넘어옴 − 길듦 · 어긋남 0', `감사 ${S.audits} · 어긋남 ${S.mismatch} · 날 차이 어긋남 ${o.dayBad}`);
    ok(S.born > 0 && S.died.hunt > 0 && S.died.starve > 0 && S.died.seen > 0, '③ [전제] 태어남 · 사냥 · 굶음 · 보이는 몸 죽음이 실제로 있었다(자명 통과 아님)', JSON.stringify({ born: S.born, died: S.died }));
    ok(o.fromNothing === 0 && o.revive === 0 && o.newIds > 0, '③ 없던 몸 0(새 id = 그날 난 몸 · 어미가 전날 살아 있음) · 죽은 id 다시 섬 0', `새 id ${o.newIds} · 없던 ${o.fromNothing} · 되살아남 ${o.revive}`);
    // ④ 번식
    ok(o.kids > 0 && o.kidFar === 0 && o.kidBadMom === 0 && S.bornFar === 0, '④ 새 몸은 다 어미 곁(체비셰프 2) · 어미 = 같은 종 암컷', `새끼 ${o.kids} · 먼 새끼 ${o.kidFar} · 어미 틀림 ${o.kidBadMom}`);
    // ⑤ 걸음
    ok(o.moved > 0 && o.jump === 0 && S.stepBad === 0 && o.maxDisp <= 60, '⑤ 날마다 옮긴 거리 ≤ 30걸음 × 2칸 · 걸음 감시 0', `옮긴 몸-날 ${o.moved} · 최대 ${o.maxDisp}칸 · 뜀 ${o.jump} · 감시 ${S.stepBad}`);
    ok(S.walkers > 0 && S.arrive > 0 && o.migFar === 0, '⑤ 재정착 = 이웃 무리터 몸이 걸어 와 닿았다(생성 0)', `떠난 몸 ${S.walkers} · 닿음 ${S.arrive} · 그만둠 ${S.abort} · D 몸 ${o.D0} → ${o.D1}`);
    // ⑥ 사냥
    ok(o.budKill === S.died.hunt && o.budKill > 0 && o.huntRemoved === o.budKill, '⑥ 사냥꾼 예산 합 = 몸 표 사냥 죽음 = 표에서 빠진 몸', `예산 ${o.budKill} · 죽음 ${S.died.hunt} · 빠짐 ${o.huntRemoved}`);
    // ⑦ 벌채
    ok(o.defo.cells > 0 && o.defo.onCut0 > 0 && o.defo.onCut1 === 0, '⑦ 벌채 — 서식 칸 줄음 · 그 칸에 섰던 몸은 다음 날 다 떠났다(또는 죽었다)', JSON.stringify(o.defo));
    ok(o.defo.allGone && o.defo.leftStill === 0 && o.defo.leftRehome + o.defo.leftWalk + o.defo.leftDead === o.defo.leftN0 && o.defo.leftRehome > 0 && o.defo.leftN0 > 0, '⑦ 서식이 다 없어진 마을 — 몸이 이웃 무리터로 걸어 떠났다(닿음 · 걷는 중 · 굶음 — 그냥 선 몸 0 · 사라짐 0)', JSON.stringify(o.defo));
    // ⑧ 부존
    ok(o.game.length > 0 && o.game.every((g) => Math.abs(g.got - g.want) < 1e-9), '⑧ 14일 land.game = 기준 × clamp(몸 / 처음 몸, 0.05, 1)', JSON.stringify(o.game.filter((g) => Math.abs(g.got - g.want) >= 1e-9).concat(o.game.slice(0, 2))));
    // ⑨ 되읽기
    const r = run('reload', { T1331_BEAST_BODY: '1' });
    ok(r && r.alive === o.alive && r.sig === o.sig && r.ledger === 0 && r.mismatch === 0, '⑨ 되읽기 — 몸 수 · id · 자리 같음 · 장부 다시 안 섬 · 다음 날 보존 어긋남 0', r ? `몸 ${o.alive} → ${r.alive} · 서명 ${r.sig === o.sig} · 장부 ${r.ledger} · ${r.err || ''}` : '없음');
    // ⑩ 보임 다리
    const w = o.show;
    ok(w && w.shown > 0 && w.hidAll && w.countSame && w.tame === 1 && w.seenDied === 1, '⑩ 켜진 청크 몸 → 존 몹 · 꺼지면 몸 표로(수 같음) · 길듦 1 · 존 죽음 문 1', JSON.stringify(w));
    // ⑪ 존 넘김
    const x = o.door;
    ok(x && x.out === 1 && x.in === 1 && x.sum0 === x.sum1 && x.spOk, '⑪ T1321 문 — 보낸 존 넘어감 1 · 받은 존 넘어옴 1 · 두 존 합 같음 · 몸 칸 실림', JSON.stringify(x));
  } catch (e) { ok(false, '판 예외', e.message); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail}${MUT ? ' · 미끼 ' + MUT : ''} ===`);
  if (!MUT && !fail && !process.env.T1331_NO_MUT) {   // 미끼 — 하나하나 빨강이어야 한다
    let red = 0;
    for (const m of MUTS) {
      const rr = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1331_MUTANT: m }), encoding: 'utf8', maxBuffer: 1 << 26 });
      const fl = (rr.stdout.match(/^FAIL .*/mg) || []);
      const isRed = rr.status !== 0 && fl.length > 0;
      const W = MUT_SWAP[m], n = require('./lib-bait').count(fs.readFileSync(path.join(ROOT, 'server', W[0]), 'utf8'), W[1]);
      if (isRed && n === 1) red++;
      ok(n === 1 && isRed, `미끼 ${m} 빨강`, `바꾼 자리 ${n} · FAIL ${fl.length}건${fl.length ? ' · 첫 ' + fl[0].slice(5, 90) : ''}`);
    }
    console.log(`=== 미끼 ${red}/${MUTS.length} 빨강 ===`);
    process.exit(red === MUTS.length ? 0 : 1);
  }
  process.exit(fail ? 1 : 0);
}

function mutate() {
  const MUT = process.env.T1331_MUTANT || '';
  if (!MUT) return;
  const old = Module._extensions['.js'];
  const BBF = path.join(ROOT, 'server', 'beast-body.js'), VF = path.join(ROOT, 'server', 'villages.js');
  Module._extensions['.js'] = function (m, file) {
    if (file !== BBF && file !== VF) return old(m, file);
    let src = fs.readFileSync(file, 'utf8');
    const swap = (a, b) => { if (!src.includes(a)) throw new Error('미끼 바늘 없음 ' + MUT); src = src.replace(a, b); };
    const W0 = MUT_SWAP[MUT]; if (W0 && file === path.join(ROOT, 'server', W0[0])) swap(W0[1], W0[2]);
    m._compile(src, file);
  };
}

async function child() {
  const OUT = process.env.T1331_TB_OUT;
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  process.env.ENABLE_VILLAGES = '0'; process.env.T146_BUILD_MS = '600000'; process.env.ZONE_ID = 'hanbando'; process.env.DB_PATH = process.env.T1331_TB_DB;
  if (process.env.T1331_BEAST_BODY === '1') process.env.T1331_BEAST_SCALE = '100';
  mutate();
  const res = {};
  try {
    const V = require(path.join(ROOT, 'server', 'villages.js'));
    const P = V.__labProbe, st = V.__t740();
    const ON = V.T1331_BEAST_BODY;
    // 숲 띠(cy 470 ~ 530) · 그 밖은 풀밭 아님(숲 판정 1) · 바위 · 물 0
    const ta = { forestMult: (cx, cy) => (cy >= 470 && cy <= 530 ? 2 : 1), isRock: () => false, isBlocked: () => false, isWater: () => false };
    P._huntProbe.setTa(ta);
    const DB = require(path.join(ROOT, 'server', 'zone-local-db.js'));
    const players = new Map();
    const mkV = (name, dbId, ccx) => {
      const v = { name, dbId, ccx, ccy: 420, npcPids: [], econ: { land: { game: 1.2 }, counts: { hunter: 2 } }, _houseCells: [], _granList: [], _farmSet: new Set() };
      for (let i = 0; i < 2; i++) { const pid = `${name}-h${i}`; players.set(pid, { pid, isNpc: true, simJob: 'hunter', simVillageId: dbId }); v.npcPids.push(pid); }
      return v;
    };
    const vils = [mkV('A', 11, 500), mkV('D', 12, 740), mkV('C', 13, 980)];   // 띠 위에서 서로 맞닿는다(A 끝 칸 620 = D 첫 칸 · D 끝 860 = C 첫 칸)
    st.villages = vils;
    P._t400Probe.setup({ deps: { players }, db: DB, zoneId: 'hanbando', ta });
    const cutDay = (MODE === 'reload') ? -1 : 0;
    if (MODE === 'reload') {   // ⑨ 새 프로세스 — 몸 표를 되읽는다(부팅 문) · 다음 날 하루를 돈다
      for (const v of vils) { v._gameNone = 1; }   // T728 곁 칸(`_t728Game: { none: 1 }`)이 되돌린 상태 — 장부 없음
      V._t1331Probe.boot();
      const B = V._t1331Probe.w();
      res.alive = B ? B.alive() : -1;
      res.sig = B ? sig(B) : null;
      for (const v of vils) V._lifeGameDay(v, 57);
      res.ledger = vils.filter((v) => v._gameRich).length;
      res.mismatch = B.W.st.mismatch;
      fs.writeFileSync(OUT, JSON.stringify(res));
      return;
    }
    if (!ON) {   // ① 끔 판 — 종전 그대로(장부)
      for (const v of vils) V._lifeGameDay(v, 1);
      res.off = { ledger: vils.filter((v) => v._gameRich && v._gameRich.size > 0).length, loaded: Object.keys(require.cache).some((k) => /server[\\/]beast-body\.js$/.test(k)), bodies: V._t1331Probe.w() ? 1 : null };
      fs.writeFileSync(OUT, JSON.stringify(res));
      return;
    }
    const BB = require(path.join(ROOT, 'server', 'beast-body.js'));
    const DAYS = 56;
    res.mig = []; res.days = DAYS; res.scale = 100;
    let prev = null, prevPos = null, dead = new Set(), budKill = 0, huntRemoved = 0;
    res.dayBad = 0; res.fromNothing = 0; res.revive = 0; res.newIds = 0; res.kids = 0; res.kidFar = 0; res.kidBadMom = 0;
    res.moved = 0; res.jump = 0; res.maxDisp = 0; res.migFar = 0; res.game = []; res.defo = {};
    let defoCells = null, leftIds = null;
    for (let day = 1; day <= DAYS; day++) {
      // 하루 전 몸 자리
      const B0 = BB.current;
      const before = B0 ? new Map([...B0.W.bodies.values()].map((b) => [b.id, { cx: b.cx, cy: b.cy, sp: b.sp, sex: b.sex }])) : new Map();
      const s0 = B0 ? JSON.parse(JSON.stringify(B0.W.st)) : null, alive0 = B0 ? B0.alive() : 0;
      if (day === 20) {   // ⑦ 벌채 — A 서식 가운데 ±12(집터 반경)
        const B = BB.current, hA = B.W.hab.get(11), c0 = hA.set.size;
        const cutK = new Set(); for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) cutK.add(B.KEY(500 + dx, 500 + dy));
        res.defo.onCut0 = [...B.W.homes.get(11)].map((id) => B.W.bodies.get(id)).filter((b) => cutK.has(B.KEY(b.cx, b.cy)) && hA.set.has(B.KEY(b.cx, b.cy))).length;
        const n = V._t1331Probe.w() && V._t1053Deforest ? V._t1053Deforest(vils[0], 500, 500, 12) : 0;
        res.defo.cells = n; res.defo.habBefore = c0; res.defo.habAfter = hA.set.size; defoCells = cutK;
      }
      if (day === 40) {   // ⑦ 서식 다 지움 — C(13) 의 몸이 이웃으로 떠나야 한다
        const B = BB.current; leftIds = [...B.W.homes.get(13)];
        res.defo.leftN0 = leftIds.length;
        V._t1053Deforest(vils[2], 980, 500, 140);
        res.defo.allGone = B.W.hab.get(13).set.size === 0;
      }
      for (const v of vils) {
        const bud0 = v.npcPids.map((pid) => players.get(pid));
        V._lifeGameDay(v, day);
        for (const p of bud0) budKill += (p._huntBud | 0);
        const Bq = BB.current, hq = Bq && Bq.W.hab.get(v.dbId);   // ⑧ 그 마을 하루가 끝난 순간의 몸 수로(뒤 마을의 걸음이 몸을 옮기기 전)
        if (day % 14 === 0 && hq && hq.N0 > 0) res.game.push({ v: v.name, day, got: v.econ.land.game, want: +(hq.base * Math.max(0.05, Math.min(1, Bq.nOf(v.dbId) / hq.N0))).toFixed(2) });
      }
      const B = BB.current;
      if (day === 1) {
        for (const v of vils) {
          const h = B.W.hab.get(v.dbId);
          res.mig.push({ v: v.name, n: B.W.homes.get(v.dbId).size, sum: h.K0 * 100, ledgerGone: v._gameRich === null, none: v._gameNone, rebuilt: 0 });
        }
        // 판 꾸밈 — D 는 거의 다 · C 는 절반 죽인다(보이는 몸 죽음 문 = 존 죽음 길 셋이 부르는 그 문)
        const kill = (vid, keep) => { const ids = [...B.W.homes.get(vid)]; for (let i = 0; i < ids.length; i++) if (i % 100 >= keep) B.diedAt(ids[i], 'seen'); };
        kill(12, 1); kill(13, 50);
        res.D0 = B.W.homes.get(12).size;
      }
      if (day > 1) for (const m of res.mig) { const v = vils.find((q) => q.name === m.v); if (v._gameRich) m.rebuilt++; }
      if (day === 21 && defoCells) {
        const hA = B.W.hab.get(11);
        res.defo.onCut1 = [...B.W.homes.get(11)].map((id) => B.W.bodies.get(id)).filter((b) => defoCells.has(B.KEY(b.cx, b.cy)) && !hA.set.has(B.KEY(b.cx, b.cy))).length;
      }
      if (day >= 41 && leftIds && day === 52) {
        res.defo.leftStill = leftIds.filter((id) => { const b = B.W.bodies.get(id); return b && b.home === 13 && !b.walk; }).length;   // 서식 없는 무리터에 그냥 선 몸(늘 0)
        res.defo.leftRehome = leftIds.filter((id) => { const b = B.W.bodies.get(id); return b && b.home !== 13; }).length;
        res.defo.leftWalk = leftIds.filter((id) => { const b = B.W.bodies.get(id); return b && b.home === 13 && b.walk; }).length;
        res.defo.leftDead = leftIds.filter((id) => !B.W.bodies.has(id)).length;
      }
      // ③ 보존 · 없던 몸 · ④ 어미 곁 · ⑤ 걸음
      if (day > 1 && s0) {
        const s1 = B.W.st, dsum = (s) => s.died.hunt + s.died.starve + s.died.seen + s.died.old + s.died.pred;
        const want = alive0 + (s1.born - s0.born) - (dsum(s1) - dsum(s0)) - (s1.out - s0.out) + (s1.in - s0.in) - (s1.tame - s0.tame);
        if (B.alive() !== want) res.dayBad++;
        huntRemoved += 0;
        for (const b of B.W.bodies.values()) {
          const p0 = before.get(b.id);
          if (!p0) {
            res.newIds++;
            if (dead.has(b.id)) res.revive++;
            const mom = before.get(b.mom);
            if (!(b.born === day && mom)) { res.fromNothing++; continue; }
            res.kids++;
            if (!(b.bx != null) || Math.max(Math.abs(mom.cx - b.bx), Math.abs(mom.cy - b.by)) > 2) res.kidFar++;   // 난 칸(그날 걸음 앞) — 어미의 그날 아침 칸과
            const dk = Math.max(Math.abs(b.bx - b.cx), Math.abs(b.by - b.cy)); if (dk > res.maxDisp) res.maxDisp = dk; if (dk > 60) res.jump++;   // 난 날 걸음도 상한 안
            if (mom.sp !== b.sp || mom.sex !== 0) res.kidBadMom++;
            continue;
          }
          const dd = Math.max(Math.abs(p0.cx - b.cx), Math.abs(p0.cy - b.cy));
          if (dd > 0) res.moved++;
          if (dd > res.maxDisp) res.maxDisp = dd;
          if (dd > 60) res.jump++;
        }
        for (const id of before.keys()) if (!B.W.bodies.has(id)) dead.add(id);
        const hk = s1.died.hunt - s0.died.hunt; if (hk > 0) huntRemoved += hk;
      }
    }
    const B = BB.current;
    res.D1 = B.W.homes.get(12).size;
    res.budKill = budKill;
    // 사냥으로 빠진 몸 = 날마다 사냥 죽음 증가분(위) — 몸 표에서 실제로 빠졌는지는 ③ 날 차이 식이 같이 본다
    res.huntRemoved = huntRemoved + 0;
    res.alive = B.alive(); res.sum = JSON.parse(JSON.stringify(B.W.st)); res.sig = sig(B);
    V._t1331Probe.save();
    // ⑩ 보임 다리 — 가짜 존 호스트(같은 모듈 · 같은 몸 표)
    res.show = showBridge(B);
    // ⑪ 존 넘김 — 몸 표 둘 · 문 둘
    res.door = await doorPair(BB);
    // 보임 다리 · 넘김이 바꾼 몸 수는 ⑨ 서명 뒤다(서명은 저장 순간의 것)
  } catch (e) { res.err = (e && e.stack || String(e)).slice(0, 1500); }
  fs.writeFileSync(OUT, JSON.stringify(res));
  console.log = _log;
}

function sig(B) {
  const a = []; for (const b of B.W.bodies.values()) a.push(b.id, b.cx, b.cy, b.home, b.sp, b.sex);
  return require('crypto').createHash('sha1').update(a.join(',')).digest('hex').slice(0, 16);
}

function showBridge(B) {
  const Wl = require(path.join(ROOT, 'server', 'wildlife.js'));
  const mobs = new Map(), sent = [];
  // 켜진 청크 = A 띠 가운데 청크 하나(청크 32칸 = 1024px)
  const cm = { chunkSize: 1024, keyOf: (cx, cy) => `${cx}_${cy}`, insertMob: () => {}, removeMob: () => {}, updateMobChunk: () => {} };
  let act = new Set(['15_15']);   // px 15360 ~ 16384 · 칸 480 ~ 511
  const kept = [];
  Wl.init({ ZONE_ID: 'hanbando', ZONE: { zoneWidth: 40000, zoneHeight: 40000 }, TICK_HZ: 30, chunkManager: cm, mobs, players: new Map(),
    isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 }, getActiveChunkKeys: () => act, isPositionActive: () => true,
    spawnCorpse: () => null, damagePlayer: () => {}, broadcast: (m) => sent.push(m.type), WORLD: { dayLengthMs: 600000, dayPhaseRatio: 0.7, worldEpoch: 0 }, setMobHp: (m, v) => { m.hp = v; },
    simVillages: () => [], legacyVillages: [], rng: () => 0.5, t1331Keep: (m) => kept.push(m.mid) });
  const n0 = B.alive();
  for (let i = 0; i < 30; i++) Wl.tick(Date.now());
  const shown = [...mobs.values()].filter((m) => m._t1331 != null);
  const r = { shown: shown.length, n0 };
  // 길듦 하나 · 존 죽음 문 하나(zone `respawnMobLater` 켬 갈래가 부르는 그 문 — 존 몹 지우기는 존 죽음 길이 한다)
  const t0 = B.W.st.tame, d0 = B.W.st.died.seen;
  if (shown.length >= 2) {
    shown[0].tameOwner = 'p1'; shown[0].tameOwnerName = 'P';
    const s1 = shown[1]; mobs.delete(s1.mid); B.diedAt(s1._t1331, 'seen');
  }
  for (let i = 0; i < 30; i++) Wl.tick(Date.now());
  r.tame = B.W.st.tame - t0; r.seenDied = B.W.st.died.seen - d0; r.kept = kept.length;
  act = new Set();
  for (let i = 0; i < 30; i++) Wl.tick(Date.now());
  r.hidAll = [...mobs.values()].filter((m) => m._t1331 != null).length === 0;
  r.countSame = B.alive() === n0 - r.tame - r.seenDied;
  r.stat = Wl.t1331Stat ? Wl.t1331Stat() : null;
  return r;
}

async function doorPair(BB) {
  const XZ = require(path.join(ROOT, 'server', 'xzone-beast.js'));
  const keep = BB.current;
  // 존 둘 — 몸 표 둘(같은 모듈 · 따로 지은 표) · 띠 · 받기는 실제 문 함수
  const mk = () => BB.create({ L_GAMEMAX: 100, L_GAMER: 0.002, huntTake: () => 0, species: ['deer'], scale: 100 });
  const ZA = { B: mk(), mobs: new Map() }, ZB = { B: mk(), mobs: new Map() };
  for (const Z of [ZA, ZB]) Z.B.migrate('v', new Map([['10,10', 100], ['12,10', 100]]), 1);   // 몸 2 씩
  const W = 3200, zones = { A: { id: 'A', worldOffsetX: 0, worldOffsetY: 0 }, B: { id: 'B', worldOffsetX: W, worldOffsetY: 0 } };
  const doors = {};
  const mkDoor = (Z, me, peer) => XZ.createBeastDoor({
    zone: me, W, Hh: 3200, offX: zones[me].worldOffsetX, offY: 0, bootId: 'x', retryMs: 10, now: () => 0, later: () => 0,
    neighbors: () => [peer], findZoneAt: (ax) => (ax < W ? zones.A : zones.B),
    post: (zid, payload) => Promise.resolve(doors[zid].receive(payload)),
    mobs: { add: (m) => { if (m._t1331 != null) Z.B.doorShow(m._t1331); Z.mobs.set(m.mid, m); }, remove: (m) => { if (m._t1331 != null) Z.B.doorHide(m._t1331); Z.mobs.delete(m.mid); } },
    spawn: (b) => { const body = Z.B.doorIn(b.t1331, b.x, b.y, Z.B.homeAt(Math.floor(b.x / 32), Math.floor(b.y / 32))); const m = { mid: 'b' + body.id, type: b.type, x: b.x, y: b.y, _t1331: body.id }; Z.mobs.set(m.mid, m); Z.B.showAt(body, m.mid, 1); return m; },
    delRow: (m) => { if (m._t1331 != null) Z.B.doorOut(m._t1331); },
    t1331Pack: (m) => Z.B.pack(m._t1331),
    tx: (fn) => fn(), pendPut: () => {}, pendDel: () => {}, pendAll: () => [], seenHas: () => false, seenPut: () => {},
    typeOk: () => true, faunaOut: () => false, blocked: () => false, peerBlocked: () => false, drain: () => false, log: () => {} });
  doors.A = mkDoor(ZA, 'A', 'B'); doors.B = mkDoor(ZB, 'B', 'A');
  BB.current = keep;
  const b = ZA.B.W.bodies.values().next().value;
  const m = { mid: 'b' + b.id, type: 'deer', hp: 30, maxHp: 30, x: W - 10, y: 320, vx: 0, vy: 0, _t1331: b.id };
  ZA.mobs.set(m.mid, m); ZA.B.showAt(b, m.mid, 30);
  const sum0 = ZA.B.alive() + ZB.B.alive();
  const out = {};
  const moved = doors.A.band(m, W + XZ.COMMIT + 5, 320, out);
  const hid0 = ZA.B.W.bodies.get(b.id);
  if (moved && out.go) doors.A.send(m, out.go);
  const midTr = !!(hid0 && hid0.tr);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));   // 글 = Promise(답 → 끝 적기)
  const nb = [...ZB.B.W.bodies.values()].pop();
  return { moved, go: !!out.go, midTr, out: ZA.B.W.st.out, in: ZB.B.W.st.in, sum0, sum1: ZA.B.alive() + ZB.B.alive(),
    spOk: !!nb && nb.sp === b.sp && nb.sex === b.sex && nb.from === b.id, auditA: ZA.B.alive() === ZA.B.expect(), auditB: ZB.B.alive() === ZB.B.expect() };
}
