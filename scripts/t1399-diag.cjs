// (@regress 없음 — 진단 훅 · 러너 밖 · T1399 · 판정 0)
// === scripts/t1399-diag.cjs — 결정 순회 몸 하나의 시간을 직업 · 갈래로 가른다(존 글자를 읽을 때만 계측 줄을 끼운다 · 존 파일 무접촉) ===
//
// 쓰는 법(존 아이 프리로드 · 가상 시계보다 먼저 — 진짜 단조 시계를 붙잡는다):
//   몸 전부 판:  T1294_PRELOAD=$PWD/scripts/t1399-diag.cjs T1399_DIAG_OUT=/tmp/d-%p.json node scripts/t1294/run.cjs <out> 2
//   같은 자(틀 세계): NODE_OPTIONS="--require $PWD/scripts/t1399-diag.cjs" T1399_DIAG_OUT=/tmp/d-%p.json node scripts/t646-anatomy.js run inf <tag> --seg --lines --ref <커밋>
//   · 끝날 때(와 30초마다) `{ ns: {"<D|N>:<직업>|<갈래>": 나노초}, n: {…: 몸 수} }` — D = 존 해 몫 < 낮 몫 · N = 밤.
//   · 갈래: stand(첫 거름 표 1 · 2) · walk(표 3 걷는 몸 커널) · sleepD(잠 깨움 결정 건넘) · workD(일터 깨움 결정 건넘 — 판정) · workT(일터 깨움 결정 건넘 — 표 · T1399)
//           wokedec · wokestep(표를 내리고 종전 몸통 — 결정 함 · 안 함) · dec · step(표 없는 몸 종전 몸통)
//   ⚠계측 판은 시간 값이 바뀐다(시계 두 번 · 셈) — 몫(%)만 읽는다. 세계에 쓰지 않는다. 바꿀 자리가 하나라도 없으면 아무것도 안 끼운다(로그 한 줄).
'use strict';
const OUT = process.env.T1399_DIAG_OUT;
if (OUT && /zone\.js$/.test(process.argv[1] || '')) {
  const RB = process.hrtime.bigint.bind(process.hrtime); global.__t1399Clk = RB;   // 가상 시계가 `hrtime` 칸을 갈아 끼워도 이 참조는 진짜
  const Module = require('module'), _c = Module.prototype._compile, ZP = require('path').join('server', 'zone.js');
  const BLK = [
    "const _t1399D = { ns: {}, n: {} }; let _t1399Rt = ''; const _t1399Clk = global.__t1399Clk;",
    "{ const _f = process.env.T1399_DIAG_OUT.replace('%p', String(process.pid)); const put = () => { try { require('fs').writeFileSync(_f, JSON.stringify(_t1399D)); } catch (e) {} }; setInterval(put, 30000).unref(); process.on('exit', put); }",
    "function _t1399Add(job, rt, ns) { const k = (job || '-') + '|' + rt; _t1399D.ns[k] = (_t1399D.ns[k] || 0) + ns; _t1399D.n[k] = (_t1399D.n[k] || 0) + 1; }", ''].join('\n');
  const R = [
    ['function _t1348FGrant(npc, s) {', BLK + 'function _t1348FGrant(npc, s) {'],
    ['k = A.WK[s]; SS.stat.thit++; _t1399J(p)[1]++;', "k = A.WK[s]; SS.stat.thit++; _t1399J(p)[1]++; _t1399Rt = 'workT';"],
    ['if (k === 3) A.LAT[s] = Date.now();', "if (k === 3) A.LAT[s] = Date.now(); if (_t1399Rt !== 'workT') _t1399Rt = 'workD';"],
    ['A.NDA[s] = nda; A.DK[s] = now; SS.stat.dskip++;', "A.NDA[s] = nda; A.DK[s] = now; SS.stat.dskip++; _t1399Rt = 'sleepD';"],
    ['  const _decOne = (pid, _sL) => { do {', "  const _decOneD = (pid, _sL) => { const t0 = _t1399Clk(); _t1399Rt = ''; const r = _decOne0(pid, _sL); if (_t1399Rt) { const s = _sL !== undefined ? _sL : SS.slot(pid), p = s >= 0 ? SS.own[s] : null; _t1399Add((worldPhase(now) < WORLD.dayPhaseRatio ? 'D' : 'N') + ':' + (p && p.simJob), _t1399Rt, Number(_t1399Clk() - t0)); } return r; };\n  const _decOne0 = (pid, _sL) => { do {"],
    ['if (_s22 >= 0 && _t1322Skip(_s22, pid, now)) {', "if (_s22 >= 0 && SS.A.TK[_s22]) _t1399Rt = SS.A.TK[_s22] === 3 ? 'walk' : 'stand'; if (_s22 >= 0 && _t1322Skip(_s22, pid, now)) {"],
    ['    const npc = players.get(pid);\n    if (!npc || npc.hp <= 0) continue;\n    // Phase 4d-9 fix', "    if (_t1399Rt) _t1399Rt = 'woke';\n    const npc = players.get(pid);\n    if (!npc || npc.hp <= 0) continue;\n    // Phase 4d-9 fix"],
    ['    if (T1241_PROBE && _desClk) { _desTimed(npc, dt, now);', "    _t1399Rt = (_t1399Rt === 'woke' ? 'woke' : '') + (T670_SKIP_IDLE && !npc.canadiaVillage && now < npc.nextDecisionAt ? 'step' : 'dec');\n    if (T1241_PROBE && _desClk) { _desTimed(npc, dt, now);"],
    ['  } while (false); return _stopAt !== null; };\n', '  } while (false); return _stopAt !== null; };\n  const _decOne = _decOneD;\n'],
  ];
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(ZP)) {
      const miss = R.filter(([a]) => content.split(a).length !== 2).map(([a]) => a.slice(0, 40));
      if (miss.length) console.log(`[T1399 진단] 끼울 자리 없음 ${miss.length} — 계측 안 함: ${miss.join(' | ')}`);
      else { for (const [a, b] of R) content = content.replace(a, () => b); console.log('[T1399 진단] 결정 순회 계측 줄 끼움'); }
    }
    return _c.call(this, content, filename);
  };
}
