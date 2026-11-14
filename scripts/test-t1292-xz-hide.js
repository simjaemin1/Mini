#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1292-xz-hide.js — 넘기는 캐러밴 몸은 보내기 직전에 숨는다 · 답에 따라 지우거나 드러낸다 (T1292 · 2026-11-13) ==========
//
// ★왜(캐논 797 — 몸은 경계에서 둘이 되면 안 된다): 종전 넘김은 받는 존이 몸을 세운 **뒤** 보낸 존이 답(OK)을 듣고서야 지웠다 ⇒ 넘길 때마다
//   한 상인 · 호위가 두 존에 함께 있었다(두 존 판 120날 963번 · 가운데 0.39초 · 가장 길게 7.1초 — 그 사이 두 존 도적 · 맹수 · 사람이 따로 칠 수 있다).
//   고침(`server/villages.js` `_xzSend` · `_xzAfterSend` · `_xzHide` · 손잡이 `T1292_XZ_HIDE` 켬 기본 · `=0` = 종전 글자):
//   보내기 직전 상인 · 호위를 사람 넘기 껍데기와 같은 칸(`handingOff`)으로 숨긴다 → 답 OK 면 지운다 · 받는 존이 "안 받는다"고 답했거나 연결이 아예 안 섰으면
//   (기록이 닿지 않은 것이 확실) 드러내고 종전 되돌림 · 답을 못 들었으면(시한 · 끊김 — 받았는지 모른다) **숨긴 채** 다음 경계에 다시 민다(받는 쪽 `dup`).
// 판(판정 사본 0 — 운영 함수를 그대로: `__labProbe._caravanBodyProbe` 의 `xzMakeBody` · `sendXz` · `afterSendXz` 를 `deps.xzonePost` 흉내로 · econ 되돌림은 진짜 `xzoneBounce`):
//   ⓐ 답 OK · ⓑ 답 없음(시한) → 다음 경계 다시 밂 → `dup` OK · ⓒ 연결 안 섬(ECONNREFUSED) 두 번 · ⓔ 오류 코드(HTTP 404 — 안 문 거절) 두 번 · ⓓ 답 "안 받는다"(why geo)
// 지키는 것:
//   ⓪ 글자 — 손잡이 한 줄(`!== '0'`) · `handingOff` 몸은 안 보이고(`visiblePlayers`) · 맹수 표적 밖(wildlife) · 미끼 자리가 소스에 꼭 한 번
//   ① 켬(기본) — 보내는 순간(같은 동기 턴) 상인 · 호위가 다 `handingOff` · 몸 `_xzHidden` · 표 줄 `hide` ·
//      ⓐ OK → 몸 표 · 사람 표에서 빠진다(드러냄 0) · ⓑ 시한 → 숨긴 채 · 다시 밂 줄 1 · 되돌림 0 · 다음 경계 `dup` OK → 빠진다(그 사이 드러냄 0) ·
//      ⓒ 연결 안 섬 · ⓔ 오류 코드 → 드러냄 · 종전 글자 그대로(첫 번은 보인 채 한 번 다시 밂 · 둘째에 econ 되돌림 — 빈손 귀환) · ⓓ "안 받는다" → 드러냄 · 되돌림
//   ② 끔(`T1292_XZ_HIDE=0` = 종전) — 보내는 동안 상인이 보인다(handingOff 거짓 — 받는 존이 세운 동안 두 존 동시) · ⓑ 종전 한 번 다시 밂
//   ③ 미끼(아이 안 · 파일 무변) — 숨김을 뺀 사본 → ① 보내는 순간 빨강 · 답 없음에 숨긴 채 다시 밀기를 뺀 사본 → ⓑ 빨강(답 없음에 드러난다) ·
//      확실한 실패 가름을 뺀 사본 → ⓒ 빨강(드러나지 않고 숨은 채 다시 민다)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  nohide: ['if (T1292_XZ_HIDE && body) _xzHide(body, true);', 'if (false) _xzHide(body, true);'],
  nokeep: ['  else if (T1292_XZ_HIDE && !answered) {\n    X.retry.push({ r, tries: (tries | 0) + 1 }); _t1292Stat.keepUnknown++;', '  else if (false) {\n    X.retry.push({ r, tries: (tries | 0) + 1 }); _t1292Stat.keepUnknown++;'],
  nosure: ['if (T1292_XZ_HIDE && !answered && _t1292Sure(why)) _t1292Stat.sure++;', 'if (false) _t1292Stat.sure++;'],
};

if (process.argv[2] === '--child') {
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  if (bait) {
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      const src = fs.readFileSync(f, 'utf8');
      if (src.split(bait[0]).length !== 2) { process.stdout.write('@@' + JSON.stringify({ err: '미끼 자리가 한 번이 아니다' }) + '\n'); process.exit(3); }
      m._compile(src.replace(bait[0], bait[1]), f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  const V = require(VFILE), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')), ZC = require(path.join(ROOT, 'server', 'zone-config'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100;
  let CLK = E0 + (G0 + 0.3) * M; Date.now = () => CLK;
  const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
  const [a, b] = w.villages; w.day = D0; w.caravans = [];
  const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [], econ: b };
  let nid = 0, post = null;
  const players = new Map(), npcs = new Map();
  Object.assign(S, { zoneId: 'hanbando', world: w, ready: true, dayMs: M, lastGameDay: G0, epoch: E0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, villages: [vA, vB],
    byEcon: new Map([[a, vA], [b, vB]]), econV2: E2, _t1034Saved: null, _t775: null, caravanBodies: new Map(), _carTickAt: undefined,
    deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
      spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name, handingOff: false }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
      xzonePost: (zone, payload) => post(zone, payload) } });
  const stub = { name: '저쪽마을', zone: 'nippon', _xz: true };
  const flush = () => new Promise((r) => setImmediate(r));
  const out = { knob: process.env.T1292_XZ_HIDE !== '0', cases: {} };
  const visible = (bd) => { const ps = [bd.pid].concat((bd.escorts || []).map((e) => e.pid)).map((pid) => players.get(pid)).filter(Boolean); return { n: ps.length, shown: ps.filter((p) => !p.handingOff).length }; };
  //   한 넘김 — 집 존 캐러밴(econ 이 'xzone' 으로 넘긴 그 캐러밴 · 경계 칸에 선 몸)을 민다 · `answer` = 첫 답 · `answer2` = 다음 경계의 답(있으면)
  async function run(tag, answer, answer2) {
    S.xzone = { st: { sent: 0, sentOk: 0, sentFail: 0, bounced: 0, retried: 0, dup: 0, bodyOut: 0, crossArrive: 0, crossReturn: 0, walkWait: 0, walkWaitLate: 0, soldOk: 0 }, track: new Map(), trace: [], retry: [], core: { splitNames: () => null } };
    S.caravanBodies = new Map(); w.caravans = [];
    const id = 500 + Object.keys(out.cases).length;
    const c = { id, from: a, to: stub, trader: a.npcs[0], state: 'xzone', departDay: D0 - 1, arriveDay: D0 + 1, returnArriveDay: D0 + 3, escort: 2, giveRes: 'wood', giveAmt: 5, travelDays: 2,
      _xzCross: { day: D0, ptLocal: null, ptPeer: { x: 0, y: 700 } }, _xzFHome: 0.5 };
    w.caravans.push(c);
    //   경계 칸 = 받는 존 칸(`ptPeer` · 닛폰 로컬)을 이 존 로컬로 옮긴 자리(zone-config 오프셋 · `_xzBorderOf` 와 같은 식) — 몸은 거기까지 걸어와 섰다
    const ZA = ZC.ZONES.hanbando, ZB = ZC.ZONES.nippon;
    const tgt = { x: Math.min(Math.max(0 + ZB.worldOffsetX - ZA.worldOffsetX, 0), ZA.zoneWidth - 1), y: Math.min(Math.max(700 + (ZB.worldOffsetY || 0) - (ZA.worldOffsetY || 0), 0), ZA.zoneHeight - 1) };
    const bd = mute(() => P.xzMakeBody(id, c, [{ x: tgt.x - 600, y: tgt.y }, { x: tgt.x, y: tgt.y }], 'outbound', Date.now(), E0 + (G0 + 1) * M, stub, { tribeId: 'simvil_1', tribeName: '가', simVid: 1 }));
    bd.prog = bd.len;
    for (const pid of [bd.pid].concat((bd.escorts || []).map((e) => e.pid))) { const q = players.get(pid); if (q) { q.x = tgt.x; q.y = tgt.y; } }
    const r = { kind: 'arrive', id, toZone: 'nippon', to: '저쪽마을', ptPeer: { x: 0, y: 700 }, ptHome: { x: tgt.x, y: tgt.y }, giveRes: 'wood', giveAmt: 5, remain: 1, home: { name: '가', zone: 'hanbando' } };
    const R = { tag, n0: visible(bd), seq: [] };
    const note = (k) => { const v = visible(bd); R.seq.push([k, v.shown, v.n, S.caravanBodies.has(id), !!bd._xzHidden]); };
    let resolve1; post = () => new Promise((ok, no) => { resolve1 = { ok, no }; });
    mute(() => P.sendXz(r, G0, 0, true));
    note('sent');                                   // 보낸 순간(같은 동기 턴 — 받는 존이 세우기 전)
    if (answer.ok != null) resolve1.ok(answer); else resolve1.no(Object.assign(new Error(answer.err), answer.status ? { status: answer.status } : {}));
    await flush(); await flush();
    note('answer');
    if (answer2 && S.xzone.retry.length) {           // 다음 경계 — `_xzDayOut` 이 다시 민다(숨긴 채인지 본다)
      CLK += M; S.lastGameDay++;
      const q = S.xzone.retry.splice(0)[0]; S.xzone.st.retried++;
      let r2; post = () => new Promise((ok, no) => { r2 = { ok, no }; });
      mute(() => P.sendXz(q.r, S.lastGameDay, q.tries));
      note('resent');
      if (answer2.ok != null) r2.ok(answer2); else r2.no(Object.assign(new Error(answer2.err), answer2.status ? { status: answer2.status } : {}));
      await flush(); await flush();
      note('answer2');
    }
    R.trace = S.xzone.trace.map((t) => t.k); R.retry = S.xzone.retry.length; R.st = Object.assign({}, S.xzone.st); R.cState = c.state; R.cDone = !!c._done; R.ret = c._returningAmt || 0;
    R.inMap = S.caravanBodies.has(id); R.players = players.has(bd.pid);
    out.cases[tag] = R;
  }
  (async () => {
    await run('ok', { ok: true });
    await run('timeout', { err: 'The operation was aborted due to timeout' }, { ok: true, dup: true });
    await run('refused', { err: 'connect ECONNREFUSED 10.0.0.2:3021' }, { err: 'connect ECONNREFUSED 10.0.0.2:3021' });
    await run('door', { err: 'HTTP 404', status: 404 }, { err: 'HTTP 404', status: 404 });   // 안 문 거절(두 호스트 비밀 어긋남 — T564 V1 꼴)
    await run('no', { ok: false, why: 'geo' });
    process.stdout.write('@@' + JSON.stringify(out) + '\n');
    process.exit(0);
  })().catch((e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack || e) }) + '\n'); process.exit(1); });
  return;
}

// ── 부모 ───────────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function child(env, bait) {
  const E = Object.assign({}, process.env, env); if (!('T1292_XZ_HIDE' in env)) delete E.T1292_XZ_HIDE;
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { encoding: 'utf8', env: E, timeout: 120000, maxBuffer: 1 << 26 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` };
  return JSON.parse(line.slice(2));
}
const seqTxt = (R) => R ? R.seq.map(([k, sh, n, inMap, hid]) => `${k}: 보임 ${sh}/${n}${inMap ? '' : ' · 표 밖'}${hid ? ' · 숨김' : ''}`).join(' → ') + ` · 줄 ${R.trace.join(',')}` : '-';
const VSRC = fs.readFileSync(VFILE, 'utf8'), VC = require('./code-only.js')(VSRC);
const ZSRC = require('./code-only.js')(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')), WSRC = require('./code-only.js')(fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8'));
console.log('\n=== T1292 — 넘기는 캐러밴 몸은 보내기 직전에 숨는다(손잡이 `T1292_XZ_HIDE`) ===');
ok((VC.match(/const T1292_XZ_HIDE = process\.env\.T1292_XZ_HIDE !== '0';/g) || []).length === 1, "⓪ 손잡이 한 줄 — `!== '0'`(켬 기본 · 되돌림 `=0`)");
ok(/if \(o\.handingOff\) continue;/.test(ZSRC) && /if \(p\.hp <= 0 \|\| p\.isDown \|\| p\.handingOff\) continue;/.test(WSRC), '⓪ `handingOff` 몸은 다른 사람 화면에 안 실리고(`visiblePlayers`) · 맹수 표적에서 빠진다(wildlife) — 숨김의 뜻');
ok(Object.values(BAITS).every(([a]) => VSRC.split(a).length === 2), '⓪ 미끼 자리 셋이 소스에 꼭 한 번씩');

const on = child({}), off = child({ T1292_XZ_HIDE: '0' });
console.log('\n① 켬(기본)');
if (on.err) ok(false, '① 판이 돌았다', on.err);
else {
  const C = on.cases;
  ok(on.knob && Object.values(C).every((R) => R.n0.n === 3 && R.n0.shown === 3), '① [전제] 손잡이 켬 · 넘기는 몸 = 상인 하나 + 호위 둘 · 보내기 전엔 셋 다 보인다');
  ok(Object.values(C).every((R) => R.seq[0][1] === 0 && R.seq[0][4] && R.trace[0] === 'hide'), '★① 보내는 순간(받는 존이 세우기 전) 상인 · 호위 셋 다 숨는다(`handingOff`) · 표 줄 `hide`', seqTxt(C.ok));
  ok(!C.ok.inMap && !C.ok.players && C.ok.trace.join() === 'hide,out' && C.ok.st.sentOk === 1, '★ⓐ 답 OK → 몸 표 · 사람 표에서 빠진다 · 드러냄 0', seqTxt(C.ok));
  const T = C.timeout;
  ok(T.seq[1][1] === 0 && T.seq[1][3] && T.seq[2][1] === 0 && !T.trace.includes('unhide') && !T.trace.includes('bounce') && T.st.sentFail === 1 && T.st.bounced === 0,
    '★ⓑ 답 없음(시한) → 숨긴 채 다음 경계까지 · 되돌림 0 · 그 사이 드러냄 0', seqTxt(T));
  ok(!T.inMap && !T.players && T.trace.join() === 'hide,out' && T.st.sentOk === 1, 'ⓑ 다음 경계에 다시 밀어 `dup` OK → 빠진다(한 번만 셌다)', seqTxt(T));
  for (const [k, nm] of [['refused', '★ⓒ 연결 안 섬(ECONNREFUSED — 닿지 않은 것이 확실)'], ['door', 'ⓔ 오류 코드(HTTP 404 — 안 문 거절 · 두 호스트 비밀 어긋남 꼴)']]) {
    const F = C[k];
    ok(F.seq[1][1] === 3 && F.seq[2][1] === 0 && F.seq[3][1] === 3 && F.inMap && F.trace.join() === 'hide,unhide,hide,unhide,bounce' && F.st.bounced === 1 && F.cState === 'inbound' && F.ret === 5,
      `${nm} → 드러낸다 · 종전 글자 그대로(첫 번은 보인 채 한 번 다시 밂 · 둘째에 econ 되돌림 — 짐 그대로 빈손 귀환)`, seqTxt(F) + ` · econ ${F.cState} 귀환 짐 ${F.ret}`);
  }
  const N = C.no;
  ok(N.seq[1][1] === 3 && N.inMap && N.trace.join() === 'hide,unhide,bounce' && N.st.bounced === 1, 'ⓓ 받는 존이 "안 받는다"(geo) → 드러낸다 · 되돌림', seqTxt(N));
}
console.log('\n② 끔(`T1292_XZ_HIDE=0` = 종전 글자)');
if (off.err) ok(false, '② 판이 돌았다', off.err);
else {
  const C = off.cases;
  ok(!off.knob && C.ok.seq[0][1] === 3 && !C.ok.trace.includes('hide') && !C.ok.inMap, '★② 종전 — 보내는 동안 상인 · 호위가 보인다(받는 존이 세운 동안 두 존 동시) · OK 뒤 빠진다', seqTxt(C.ok));
  ok(C.timeout.seq[1][1] === 3 && C.timeout.st.sentFail === 1 && !C.timeout.inMap, '② 종전 — 답 없음에도 보인 채 한 번 다시 민다', seqTxt(C.timeout));
}
console.log('\n③ 미끼(아이 안 사본 · 파일 무변)');
for (const [k, chk, msg] of [
  ['nohide', (o) => o.cases.ok.seq[0][1] === 0, '숨김을 뺀 사본 → ① 보내는 순간 보인다'],
  ['nokeep', (o) => o.cases.timeout.seq[1][1] === 0 && !o.cases.timeout.trace.includes('unhide'), '답 없음에 숨긴 채 다시 밀기를 뺀 사본 → ⓑ 답 없음에 드러난다'],
  ['nosure', (o) => o.cases.refused.seq[1][1] === 3 && o.cases.refused.trace.includes('unhide'), '확실한 실패 가름을 뺀 사본 → ⓒ 숨은 채 다시 민다(드러나지 않는다)'],
]) {
  const o = child({}, k);
  ok(!o.err && !chk(o), `③ 미끼 ${k} → 빨강 — ${msg}`, o.err ? o.err.slice(0, 160) : seqTxt(k === 'nohide' ? o.cases.ok : k === 'nokeep' ? o.cases.timeout : o.cases.refused));
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
