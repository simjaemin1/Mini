'use strict';
// (@regress 없음 — 러너 밖 · T1342 가름 판 훅 · 제품 파일 무변 · 존 프로세스가 읽는 econ · villages 원문에 한 줄씩 묶는다)
// === 계측/T1342_2026-11-16/t1342bind.js — 둘째 겨울 K 위 죽음 후보를 하나씩 묶는 프리로드(T1342 ② 가름 판) ===
//   NODE_OPTIONS="--require <이 파일> …" T1342_BIND=<갈래[,갈래]> — 판 자 아이 존(server/zone.js · T577_SEED)에서만 선다(판 자 어버이 · 랩 · 하네스 무동작).
//   묶는 법: 존이 econ(`sim/economy-sim.js`) · villages(`server/villages.js`)를 처음 읽을 때 원문의 정해진 한 줄(닻 · 꼭 한 번 나와야 한다)에
//   아래 글을 덧붙여 컴파일한다 — 제품 파일은 한 글자도 안 바뀐다 · 닻이 없거나 둘이면 판이 멈춘다(조용히 안 묶인 판 0).
//   갈래:
//     a — ⓐ 출생 문이 K 를 본다: 그날 인구(`_homeN`)가 인구 식 K(경작 자리 · 식량 흐름 · 땔감의 가장 작은 것 — 로지스틱이 쓰는 그 값) 이상이면 늘림 0(출생 문 줄 바로 뒤)
//     d — ⓓ K 위 마을 사람이 떠난다: 보호막이 걷힌 뒤 K 위 죽음 고리(가장 늙은 사람)에 들기 전에, 그 몫만큼 가장 젊은 자유민이 불행 이탈과 같은 몸 문(`t1075Emigrate`)으로
//         떠날 수 있으면 떠난다(받는 곳 고르기 · 들은 줄 · 무리 셈 그대로) — 갈 곳이 없으면 종전대로 죽음 고리
//     e — ⓔ 무리 셈이 모든 마을을 안다(전지 · 캐논 밖 — 가름용): 받는 곳 문에서 들은 인구에 더하는 수 = 같은 날 이 마을에서 고른 수 대신
//         **들은 줄 날짜 이후 어느 마을에서든 그곳을 고른 사람 수**(길 위 · 이미 닿은 사람 포함)
//     g — 문 앞에서 집으로(ⓔ 의 몸 꼴 — 고침 후보): 불행 이탈로 걸어온 사람이 받는 마을 문 앞에 닿은 날, 그 마을이 제 인구 식 K(`_dpDebug.K` — 들은 줄의 K 와 같은 값 ·
//         오늘 · 제가 안다)를 넘으면(지금 사람 + 1 > K) 그 사람은 들어가지 않고 떠난 마을로 걸어 돌아간다(한 길에 한 번 · 몸은 문 앞에서 새 길 · 짐은 지고 간다 ·
//         집에 닿으면 문 없이 든다 · 집이 해체됐으면 종전 다시 고르기). 해체 남은 사람 · 해산 도적은 문 밖(종전).
//   주사위 0 · 새 수 0.
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const MODES = new Set(String(process.env.T1342_BIND || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!MODES.size) return;
const path = require('path'), fs = require('fs'), Module = require('module');
const ROOT = process.env.T1342_ROOT || path.resolve(__dirname, '..', '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js'), F_V = path.join(ROOT, 'server', 'villages.js'), F_B = path.join(ROOT, 'server', 'bandits.js');
const P = { [F_E]: [], [F_V]: [], [F_B]: [] };
if (MODES.has('a')) P[F_E].push(['v._t1297Gate = 1; } }   // ★[T1297] 출생 곳간 문(위 머리말 · 끔 = 이 줄 무동작 · 칸 0)',
  (s) => s + '\n  if (dP > 0 && _homeN >= K) { dP = 0; v._t1342Gate = 1; v._t1342GateN = (v._t1342GateN || 0) + 1; }   // ★[T1342 bind a] 출생 문이 K 를 본다'] );
if (MODES.has('d')) P[F_E].push(['  while (v._dPAccum <= -1 && v.npcs.length > POP_MIN) {\n',
  (s) => '  { const _go2 = v._world && typeof v._world.t1075Emigrate === \'function\' ? v._world.t1075Emigrate : null;   // ★[T1342 bind d] K 위 몫만큼 가장 젊은 자유민이 먼저 떠난다\n' +
         '    while (_go2 && v._dPAccum <= -1 && v.npcs.length > POP_MIN) {\n' +
         '      let yi = -1; for (let i = 0; i < v.npcs.length; i++) { const p = v.npcs[i]; if (p._warDraft) continue; if (yi < 0 || p.age < v.npcs[yi].age) yi = i; }\n' +
         '      if (yi < 0) break; const p = v.npcs[yi]; let took = false; try { took = !!_go2(v, p, day); } catch (e) { took = false; }\n' +
         '      if (!took) break;\n' +
         '      { const at = v.npcs.indexOf(p); if (at >= 0) { v.npcs.splice(at, 1); v.counts[p.currentJob] = Math.max(0, (v.counts[p.currentJob] || 0) - 1); } }\n' +
         '      v._emigTot = (v._emigTot || 0) + 1; v._t1342Left = (v._t1342Left || 0) + 1; v._dPAccum += 1;\n' +
         '    } }\n' + s]);
if (MODES.has('e')) {
  P[F_V].push(['const pk = _t1312PickedOf(fromVil, toVil, day), nk = k.n + pk, beds',
    () => 'const pk = _t1312PickedOf(fromVil, toVil, day), nk = k.n + Math.max(pk, _t1342In(toVil, k.d)), beds']);
  P[F_V].push(['  _t1312Picked.set(fromVil.dbId + \'|\' + toVil.dbId, n + 1);\n',
    (s) => s + '  _t1342Note(toVil, day);   // ★[T1342 bind e]\n']);
  P[F_V].push(['function _t1312Note(fromVil, toVil, day) {',
    (s) => 'const _t1342Picks = new Map();   // ★[T1342 bind e] 받는 마을 dbId → 고른 날들(모든 마을 · 40날 창)\n' +
           'function _t1342Note(toVil, day) { const a = _t1342Picks.get(toVil.dbId) || []; a.push(day | 0); while (a.length && a[0] < (day | 0) - 40) a.shift(); _t1342Picks.set(toVil.dbId, a); }\n' +
           'function _t1342In(toVil, d0) { const a = _t1342Picks.get(toVil.dbId); if (!a) return 0; let n = 0; for (let i = a.length - 1; i >= 0 && a[i] >= (d0 | 0); i--) n++; return n; }\n' + s]);
}
if (MODES.has('g')) {
  P[F_B].push(['    if (w.lastDay != null && S.host.t1080Arrive) S.host.t1080Arrive(w, to);   // ★[T1080] 남은 제 짐은 받는 마을 곳간에\n',
    (s) => '    if (w.t1075 && !w.t1342Home && S.host.t1342Full && S.host.t1342Full(to)) {   // ★[T1342 bind g] 문 앞 — 그 마을이 제 K 를 넘었다 → 떠난 마을로 걸어 돌아간다\n' +
           '      const rr = S.host.t1342Home(w, day);\n' +
           '      if (rr) { w.t1342Home = 1; w.from = w.to; w.to = rr.to; w.d0 = day; w.len = rr.len; S.stats.t1342Back = (S.stats.t1342Back || 0) + 1; continue; }\n' +
           '      S.stats.t1342NoHome = (S.stats.t1342NoHome || 0) + 1;\n' +
           '    }\n' + s]);
  P[F_V].push(['t1080On: () => T1080_ROAD_LIFE, t1080Pick: _t1080Pick,', () => 't1342Full: _t1342Full, t1342Home: _t1342Home, t1080On: () => T1080_ROAD_LIFE, t1080Pick: _t1080Pick,']);
  P[F_V].push(['function _t1080Arrive(w, to) {',
    (s) => 'function _t1342Full(vil) { const e = vil && vil.econ, K = e && e._dpDebug && typeof e._dpDebug.K === "number" && isFinite(e._dpDebug.K) ? e._dpDebug.K : null; return K != null && e.npcs.length + 1 > K; }   // ★[T1342 bind g]\n' +
           'function _t1342Home(w, day) {   // ★[T1342 bind g] 문 앞에서 떠난 마을로 — 몸은 지금 자리에서 새 길(`_t1080Reroute` 그 꼴)\n' +
           '  const home = state.byDbId.get(w.from), gate = state.byDbId.get(w.to);\n' +
           '  if (!home || !home.econ || home.econ._banditized || !(home.econ.npcs.length > 0) || !gate) return null;\n' +
           '  const p = w.pid != null ? state.deps.players.get(w.pid) : null;\n' +
           '  let x, y; if (p) { x = p.x; y = p.y; } else { x = gate.ccx * SZ + SZ / 2; y = gate.ccy * SZ + SZ / 2; }\n' +
           '  const tx = home.ccx * SZ + SZ / 2, ty = home.ccy * SZ + SZ / 2;\n' +
           '  let pts = null; try { pts = computeRoutePts(x, y, tx, ty); } catch (e) { pts = null; }\n' +
           '  if (!pts || pts.length < 2) pts = [{ x, y }, { x: tx, y: ty }];\n' +
           '  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);\n' +
           '  const r = p && state.bodyExits ? state.bodyExits.get(w.pid) : null;\n' +
           '  if (r) { setBodyPts(r, [{ x: p.x, y: p.y }, ...pts.slice(1)]); r.vid = home.dbId; if (T681_ON) { r.d0 = day; r.L = 0; } }\n' +
           '  return { to: home.dbId, len, ppd: w.ppd };\n' +
           '}\n' + s]);
}
const orig = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  const L = P[filename];
  if (!L || !L.length) return orig(m, filename);
  let src = fs.readFileSync(filename, 'utf8');
  for (const [a, f] of L) {
    const n = src.split(a).length - 1;
    if (n !== 1) throw new Error(`[T1342 bind] 닻이 ${n}번 — ${path.basename(filename)} :: ${a.slice(0, 60)}`);
    const i = src.indexOf(a);
    src = src.slice(0, i) + f(a) + src.slice(i + a.length);
  }
  console.log(`[T1342 bind] ${path.basename(filename)} 묶음 ${L.length}줄 — ${[...MODES].join(',')}`);
  m._compile(src, filename);
};
