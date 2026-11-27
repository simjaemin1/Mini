// (@regress 없음 — 계측 훅 · 러너 밖 · T1467 · 판정 0 · 제품 무접촉)
// === scripts/t1467-touch-hook.cjs — 덩이마다 "몸을 몇 번 만졌나 · 그 몸에게 실제로 달라진 것이 있었나" ===
//   쓰는 법(셈 판 — 시계 판과 따로 돈다 · 감싸기가 시간을 얹는다):
//     T646_PRELOAD=$PWD/scripts/t1467-touch-hook.cjs T1467_TOUCH_OUT=<파일> node scripts/t646-anatomy.js run inf <tag> --seg --ref <커밋>
//   · 존 글자(server/zone.js)를 컴파일 때 고친다(사본 트리 · 제품 파일 무접촉):
//       몸마다 부르는 네 몸통(`_decOne` 결정 문 · `_wwPreOne` 커널 준비 · `_moveOne` 이동 문 · `_sweepOne` 계단·낙하·게이지·HP)을 감싼다 —
//       부름 수 · 몸 갈래(걷는 몸 / 서 있는 몸 — 틱 머리 vx·vy) · 시계(이 판 안 견줌용) ·
//       표본 틱(`T1467_EVERY` 틱마다 · 기본 10)엔 부름 앞뒤 몸 지문(제 칸 전부 · 원시값 = 값 · 객체 = 같은 것인가 + 배열 길이 · 작은 객체 = 칸 값 합)을 떠서 달라졌나.
//       공간 색인 재구축(`rebuildSpatialIndex`)은 부를 때 players 수를 만진 몸으로 센다.
//     틱 머리 · 꼬리(`_A6start` · `_A6end` — t646 `--seg` 탐침) 지문 = 그 틱 전체에서 몸에게 달라진 것(칸 이름 빈도 · 자리(x·y)가 그대로인 몸만 따로).
//   · 창 = 세계 국면(낮 0.10 ~ 0.62 · 밤 0.72 ~ 0.97 · 나머지 기타) · 30초마다 · 끝날 때 파일에 쓴다.
//   · `T1467_FREEZE=stand|walk` = 바닥 재기(빈 틱): 몸 결정을 안 돌린다(결정 문 몸통을 부르지 않는다) — stand = 틱 머리마다 vx·vy 0(다 서 있음) ·
//     walk = 첫 틱의 걷는 방향을 그대로 둔다(다 걸음 — 막히면 서기도 한다) · **세계 답을 바꾸는 계측 전용 판**(바닥 µs 만 읽는다).
'use strict';
const OUT = process.env.T1467_TOUCH_OUT, FREEZE = process.env.T1467_FREEZE || '';
if ((OUT || FREEZE) && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
  const Module = require('module'), _c = Module.prototype._compile, ZP = require('path').join('server', 'zone.js');
  const EVERY = +(process.env.T1467_EVERY || 10);
  // 몸통 이름 바꾸기 — [정의 머리, 끝 글자, 덩이 이름, 인자가 pid 인가]
  const SITES = [
    ['  const _decOne = (pid, _sL) => { do {', '  } while (false); return _stopAt !== null; };', '결정 문(순회)', 1],
    ['  const _moveOne = (p) => { do {', '\n  } while (false); };', '이동 문(순회)', 0],
    ['    const _sweepOne = (p) => {', '      _gaugeNetStep(p);\n    };', '계단·낙하·게이지·HP', 0],
  ];
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(ZP) && content.indexOf('function _wwPreOne(p) {') >= 0) {
      for (const [head, tail, seg, isPid] of SITES) {
        const i = content.indexOf(head); if (i < 0 || content.indexOf(head, i + 1) >= 0) throw new Error('[T1467 훅] 머리 앵커 ' + head);
        const j = content.indexOf(tail, i); if (j < 0) throw new Error('[T1467 훅] 끝 앵커 ' + tail);
        const nm = head.match(/const (\w+) =/)[1];
        content = content.slice(0, i) + head.replace(`const ${nm} =`, `const ${nm}T67 =`) + content.slice(i + head.length, j + tail.length) +
          `\n  const ${nm} = globalThis.__T67w(${JSON.stringify(seg)}, ${nm}T67, ${isPid});` + content.slice(j + tail.length);
      }
      content += `
;(function () {   // [T1467 만짐 훅 · 계측기가 박았다 · 제품엔 없다]
  const H = globalThis.__T67;
  H.bind({ players, npcs, worldPhase });
  _wwPreOne = globalThis.__T67w('화살·걸음 커널 준비', _wwPreOne, 0);
  { const f0 = rebuildSpatialIndex; rebuildSpatialIndex = function () { H.touchAll('공간 색인·입력 시한'); return f0.apply(this, arguments); }; }
  if (typeof _A6start === 'function') { const s0 = _A6start, e0 = _A6end; _A6start = function () { H.tickBeg(); s0(); }; _A6end = function () { e0(); H.tickEnd(); }; }
  else console.log('[T1467 훅] ⚠ _A6start 없음 — t646 --seg 로 띄운다');
})();
`;
      console.log('[T1467 만짐 훅] 끼움' + (FREEZE ? ' · 바닥 판 ' + FREEZE : ''));
    }
    return _c.call(this, content, filename);
  };
  const fs = require('fs'), pf = require('perf_hooks').performance;
  //   훅이 지문에 쓴 시간은 세계 시계(Date.now)에서 뺀다 — 결정 예산(15 ms) · 공용 틱 예산이 훅 몫으로 잘리지 않게(셈 판의 세계 = 시계 판의 세계에 가깝게 · 구간 시계는 performance.now 그대로)
  let OFF = 0; { const dn = Date.now; Date.now = function () { return dn() - OFF; }; }
  let D = null, sample = false, tickN = 0, W = 'other', cls = new Map(), t0 = new Map(), freezeV = new Map();
  const R = {};
  const win = () => { const ph = D.worldPhase(Date.now()); return ph >= 0.10 && ph <= 0.62 ? 'day' : ph >= 0.72 && ph <= 0.97 ? 'night' : 'other'; };
  const box = () => R[W] || (R[W] = { ticks: 0, sTicks: 0, popN: 0, cls: {}, beh: {}, seg: {}, tick: { n: 0, same: 0, sameXY: 0, keys: {}, keysXY: {} } });
  // 지문 — 제 칸 전부(원시 = 값 · 배열 = 같은 것 + 길이 · 작은 객체 = 같은 것 + 칸 값 합 · 큰 객체 = 같은 것)
  const fpv = (x) => { if (x === null || typeof x !== 'object') return x; if (Array.isArray(x)) return x.length; let s = 0, n = 0; for (const k in x) { if (++n > 16) break; const v = x[k]; if (typeof v === 'number') s += v; else if (typeof v === 'string') s += v.length; else if (typeof v === 'boolean') s += v ? 1 : 0; } return s; };
  const fp = (o) => { const ks = Object.keys(o), v = new Array(ks.length * 2); for (let i = 0; i < ks.length; i++) { const x = o[ks[i]]; v[2 * i] = x; v[2 * i + 1] = fpv(x); } return { ks, v }; };
  //   관측 도장은 "달라진 것"에서 뺀다 — 세계가 읽지 않는 칸(걸음 문을 받은 때 · 계측 탐침 칸)
  const IGN = new Set(['_t540StepAt', '_t540DecAt']), ign = (k) => IGN.has(k) || k.startsWith('_a6');
  const diff = (a, b, out) => {   // 달라진 칸 이름(없으면 빈 배열 · 관측 도장 뺌)
    const d = out || []; const m = new Map(); for (let i = 0; i < a.ks.length; i++) m.set(a.ks[i], i);
    for (let j = 0; j < b.ks.length; j++) { const k = b.ks[j], i = m.get(k); if (i === undefined) { d.push('+' + k); continue; } m.delete(k);
      if ((!Object.is(a.v[2 * i], b.v[2 * j]) || !Object.is(a.v[2 * i + 1], b.v[2 * j + 1])) && !ign(k)) d.push(k); }
    for (const k of m.keys()) d.push('-' + k);
    return d; };
  const frz = (pid, p) => {
    if (FREEZE === 'stand') { p.vx = 0; p.vy = 0; }
    else if (FREEZE === 'walk') { let v = freezeV.get(pid); if (!v) { let h = 0; const k = String(pid); for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; const a = (h % 6283) / 1000; v = [Math.cos(a) * 64, Math.sin(a) * 64]; freezeV.set(pid, v); } p.vx = v[0]; p.vy = v[1]; }
  };
  const body = (a, isPid) => (isPid ? D.players.get(a) : a);
  const cell = (S, c) => S[c] || (S[c] = { n: 0, ms: 0, sn: 0, chg: 0 });
  globalThis.__T67 = {
    bind(d) { D = d; },
    touchAll(seg) { if (!OUT) return; const B = box(), S = B.seg[seg] || (B.seg[seg] = { n: 0, ms: 0, sn: 0, chg: 0, by: {} }); S.n += D.players.size; },
    tickBeg() {
      if (!OUT) { for (const pid of D.npcs) { const p = D.players.get(pid); if (!p) continue; frz(pid, p); } return; }   // 바닥 판만 — 갈래 셈 없음
      const h0 = pf.now(); tickN++; W = win(); const B = box(); B.ticks++; B.popN += D.npcs.size; sample = tickN % EVERY === 0; if (sample) B.sTicks++;
      cls.clear(); t0.clear();
      for (const pid of D.npcs) { const p = D.players.get(pid); if (!p) continue;
        frz(pid, p);
        const c = (p.vx || p.vy) ? '걷는' : '서 있는'; cls.set(pid, c); B.cls[c] = (B.cls[c] || 0) + 1;
        if (sample) { const b = String(p.behavior || '-'); B.beh[c + '|' + b] = (B.beh[c + '|' + b] || 0) + 1; t0.set(pid, fp(p)); } }
      OFF += pf.now() - h0;
    },
    tickEnd() {
      if (!sample) return; const h0 = pf.now(), B = box(), T = B.tick;
      for (const [pid, a] of t0) { const p = D.players.get(pid); if (!p) continue; const d = diff(a, fp(p)); T.n++;
        if (!d.length) { T.same++; continue; }
        const xy = !d.includes('x') && !d.includes('y'); if (xy) T.sameXY++;
        for (const k of d) { T.keys[k] = (T.keys[k] || 0) + 1; if (xy) T.keysXY[k] = (T.keysXY[k] || 0) + 1; } }
      OFF += pf.now() - h0;
    },
  };
  globalThis.__T67w = (seg, f, isPid) => (!OUT ? (seg === '결정 문(순회)' ? function () { return false; } : f) : function (a, b) {   // 바닥 판만(셈 없음) = 결정 몸통 0 · 나머지 몸통은 감싸지 않는다(시계 판)
    if (FREEZE && seg === '결정 문(순회)') return false;   // 바닥 판 — 결정 몸통을 안 부른다(멈춤 없음)
    const p = body(a, isPid); if (!p || !p.isNpc) return f(a, b);
    const B = box(), S = B.seg[seg] || (B.seg[seg] = { n: 0, ms: 0, sn: 0, chg: 0, by: {} }), c = cell(S.by, cls.get(p.pid) || '새 몸');
    let f0 = null; if (sample) { const h0 = pf.now(); f0 = fp(p); OFF += pf.now() - h0; }
    const s = pf.now(); const r = f(a, b); const ms = pf.now() - s;
    S.n++; S.ms += ms; c.n++; c.ms += ms;
    if (f0) { const h0 = pf.now(); const d = diff(f0, fp(p)); S.sn++; c.sn++; if (d.length) { S.chg++; c.chg++; const K = c.keys || (c.keys = {}); for (const k of d) K[k] = (K[k] || 0) + 1; } OFF += pf.now() - h0; }
    return r; });
  const put = () => { try { fs.writeFileSync(OUT || '/dev/null', JSON.stringify({ every: EVERY, freeze: FREEZE || null, win: R })); } catch (e) {} };
  process.on('exit', put); process.on('SIGTERM', () => { put(); process.exit(0); }); setInterval(put, 30000).unref();
}
