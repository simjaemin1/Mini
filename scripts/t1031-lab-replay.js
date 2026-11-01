#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1031 계측기 · 제품 무변 · 판정 0)
// === scripts/t1031-lab-replay.js — 서버 판에서 적은 전쟁을 **전쟁실험실 자기 코드**로 다시 친다(헤드리스 · 결정론) ===
//   쓰는 법: node scripts/t1031-lab-replay.js <판>.t1031.json [<판>.t1031.json …] [--k 16] [--out out.json]
//   ⇒ 전쟁 교전 훅마다(서버 war-core 가 돌격 · 출격을 고른 그 순간) 두 팔:
//     L(랩 목표)  — 랩 `toBattleSpec`(공격 = 그 전쟁 econ 편성 `w.composition` · 방어 = 랩 `conscript` 를 그 순간 방어 마을 econ 사본에) → 랩 `runBattleHeadless`
//                   = 전쟁실험실 headless 경로(warResolveBattle 이 부르는 그 둘) · 포로는 랩 `warCapture`(같은 사본 · 랩 결판 사상)
//     B(싸운 몸)  — 서버 교전이 실제로 올린 몸(정산 때 측마다 병종 몸 수 · 품질 = 서버 교전 품질)을 같은 랩 `runBattleHeadless` 에(빈 들판 · 표준 배치)
//     ⇒ 서버 ↔ B = 지형 층 · 몸 층(대형 손 · 전진 풀림 · 연속 전투 · 대치) · 결단 층(되풀이 교전 · 철수 · 항복) 몫 · B ↔ L = 몸 상한(econ 편성 수십 ↔ 마을 몸 하나) 몫
//   ★추상 금지 — 랩 파일(`lab/전쟁실험실.html`)에서 **글자 그대로** 꺼내 vm 에서 돈다:
//     battle-core = 랩의 `<!-- BATTLE-CORE -->` 인라인 블록(sim/battle-core.js 와 바이트 같은지 먼저 본다 — 서버가 싣는 그 파일)
//     toBattleSpec · runBattleHeadless · conscript · warCapture 와 그것들이 부르는 랩 선언 = 이름이 모자랄 때마다 랩에서 그 선언을 꺼낸다(닫힘 자동 수집).
//     바꾼 것은 둘뿐 — `Math.random`(랩 runBattleHeadless 는 seed 를 받아도 `__mr` 이 랩에 없어 지금 난수열을 쓴다 → 결정론 xorshift `makeRng` 을 꽂는다) ·
//     방어 마을 = econ 사본(관찰기가 그 순간 적은 칸만 · 사람 순서 그대로).
//   ★새 수 0 — k(다시 치는 판 수)는 관찰 크기(랩 자체 갈림 띠를 보려고)일 뿐 세계 수가 아니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const WC = require(path.join(ROOT, 'sim', 'war-core'));   // makeRng · hash2 만(결정론 난수 — 값 계산은 전부 랩 코드)
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const K = parseInt(opt('k', '16'), 10);
const OUTF = opt('out', '');
const LAB = opt('lab', path.join(ROOT, 'lab', '전쟁실험실.html'));
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

// ── 랩 글자 ──
const H = fs.readFileSync(LAB, 'utf8');
const m0 = H.indexOf('<!-- BATTLE-CORE'), m1 = H.indexOf('<!-- /BATTLE-CORE -->');
const blk = H.slice(m0, m1);
const s0 = blk.indexOf('<script>\n') + '<script>\n'.length, s1 = blk.lastIndexOf('\n</script>');
const BC_SRC = blk.slice(s0, s1);
const BC_FILE = fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8').replace(/<\/script>/g, '<\\/script>');
const parity = { battleCoreInlineSame: BC_SRC === BC_FILE || BC_SRC === BC_FILE.replace(/\n$/, ''), labBytes: H.length };

// 선언 꺼내기 — 문자열 · 주석 · 템플릿을 건너뛰며 괄호 깊이를 센다
function scanTo(src, i, stopFn) {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') { depth--; if (stopFn(c, depth)) return i + 1; }
    else if (stopFn(c, depth)) return i + 1;
  }
  return src.length;
}
const lineStarts = (() => { const a = [0]; for (let i = 0; i < H.length; i++) if (H[i] === '\n') a.push(i + 1); return a; })();
const lineOf = (pos) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
function extract(name) {
  // 함수 선언(줄 머리)
  const out = (i) => i < m0 || i >= m1;   // 인라인 battle-core 블록 밖(랩 본문 · 다른 인라인 엔진)만 — battle-core 는 위에서 통째로 싣는다
  let re = new RegExp('^function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'gm');
  let m; while ((m = re.exec(H)) && !out(m.index)) { /* 블록 안이면 다음 */ }
  if (m) {
    const b = H.indexOf('{', m.index);
    const end = scanTo(H, b, (c, d) => c === '}' && d === 0);
    return { name, line: lineOf(m.index), src: H.slice(m.index, end) };
  }
  // const/let/var 선언(줄 머리 · 한 줄에 여럿일 수 있다)
  re = new RegExp('^(?:const|let|var)\\s+(?:[^\\n]*?[\\s,])?' + name.replace(/\$/g, '\\$') + '\\s*=(?!=)', 'm');
  const all = []; let mm; const g = new RegExp(re.source, 'gm');
  while ((mm = g.exec(H))) { if (out(mm.index)) all.push(mm); }
  if (all.length) {
    const st = all[0].index;
    const end = scanTo(H, st, (c, d) => c === ';' && d === 0);
    return { name, line: lineOf(st), src: H.slice(st, end) };
  }
  return null;
}
// ── vm 세계 — 랩 battle-core 를 먼저, 그다음 필요한 랩 선언을 모자랄 때마다 ──
const ctx = vm.createContext({ console });
vm.runInContext(BC_SRC, ctx, { filename: 'lab:BATTLE-CORE' });
const pulled = [];
const have = new Set();
function pull(name) {
  if (have.has(name)) return false;
  const d = extract(name); if (!d) throw new Error('랩에 선언 없음: ' + name);
  // 같은 줄 여럿 선언이면 그 줄의 이름 모두가 생긴다
  vm.runInContext(d.src.replace(/^(const|let)\s/, 'var '), ctx, { filename: 'lab:' + d.line });
  have.add(name); pulled.push({ name, line: d.line, len: d.src.length });
  const decl = /^(?:const|let|var)\s([\s\S]*)$/.exec(d.src);
  if (decl) for (const mm of decl[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)) have.add(mm[1]);
  return true;
}
const notDef = (e) => e && /^([A-Za-z_$][\w$]*) is not defined$/.exec(e.message);
function pullDeep(name, depth) {   // 그 선언의 초기값이 다른 랩 이름을 부르면 그것부터
  if ((depth | 0) > 60) throw new Error('닫힘 수집 깊이 상한: ' + name);
  for (let g = 0; g < 200; g++) { try { pull(name); return; } catch (e) { const m = notDef(e); if (!m) throw e; pullDeep(m[1], (depth | 0) + 1); } }
  throw new Error('닫힘 수집 상한: ' + name);
}
function withPull(fn) {
  for (let g = 0; g < 200; g++) { try { return fn(); } catch (e) { const m = notDef(e); if (!m) throw e; pullDeep(m[1], 0); } }
  throw new Error('닫힘 수집 상한');
}
['toBattleSpec', 'runBattleHeadless', 'conscript', 'warCapture'].forEach(pullDeep);

// ── econ 사본 → 랩이 읽는 모양 ──
function econOf(s) {
  if (!s) return null;
  const npcs = s.npcs.map((a, i) => { const n = { id: i, currentJob: a[0], skills: { archery: a[2] || 0 } };
    if (a[1]) n.captive = { home: '?', since: 0 }; if (a[3] != null) n._wsSword = a[3]; if (a[4] != null) n._wsSpear = a[4]; if (a[5] != null) n._wsSling = a[5]; if (a[6] != null) n._wsInit = a[6]; return n; });
  return { npcs, counts: Object.assign({}, s.counts), storage: Object.assign({}, s.storage), land: Object.assign({}, s.land),
    _swordFrac: s._swordFrac != null ? s._swordFrac : undefined, _weapQ: s._weapQ != null ? s._weapQ : undefined, _palisade: s._palisade || 0 };
}
const COMP_K = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
const tot = (c) => COMP_K.reduce((a, k) => a + ((c && c[k]) || 0), 0);
const pick = (c) => { const o = {}; for (const k of COMP_K) if (c && c[k]) o[k] = c[k]; return o; };
function runLab(spec, seed) {
  ctx.__rng = WC.makeRng(seed >>> 0);
  vm.runInContext('Math.random = __rng;', ctx);
  return withPull(() => ctx.runBattleHeadless(spec, seed));
}
function slim(r, aPop, dPop) {
  // 랩 warResolveBattle 첫 줄들과 같은 자르기(인구 − 1 상한 · 랩 20811) — 사상 비교는 자른 값 · 원값 둘 다
  return { w: r.winner, aS: r.atkStart, aD: r.atkDead, dS: r.defStart, dD: r.defDead, rA: r.routA, rB: r.routB, t: r.tick,
    aDc: aPop != null ? Math.min(aPop - 1, Math.max(0, r.atkDead)) : null, dDc: dPop != null ? Math.min(dPop - 1, Math.max(0, r.defDead)) : null };
}
function capLab(r, spec, hook, o, seed) {
  // 랩 warResolveBattle 포로 줄(20813 ~ 20818)을 같은 순서로 — 패자 · 승자 마을 = econ 사본 · 로스터 = 랩 spec 방어 로스터(공격 패배면 없음 — 공격 로스터는 선포 때 것이라 사본에 없다)
  const atkWin = r.winner === 'A';
  const A = econOf(hook.snap.A), D = econOf(hook.snap.D);
  if (!A || !D || A.npcs.length < 2 || D.npcs.length < 2) return null;
  const _atkDead = Math.min(A.npcs.length - 1, Math.max(0, r.atkDead)), _defDead = Math.min(D.npcs.length - 1, Math.max(0, r.defDead));
  const atkV = { name: o.atk, econ: A }, defV = { name: o.def, econ: D };
  const J = hook.J != null ? hook.J : 0.5;
  const lose = atkWin ? defV : atkV, win = atkWin ? atkV : defV;
  const LD = atkWin ? _defDead : _atkDead, WS = atkWin ? Math.max(0, r.atkSurv || 0) : Math.max(0, r.defSurv || 0);
  const R0 = atkWin ? ((spec && spec._defComp && spec._defComp.veteranRoster) || null) : null;
  const roster = R0 ? R0.map((it) => ({ npc: it && it.npc ? D.npcs[it.npc.id] : null, wtype: it && it.wtype })) : null;   // 같은 사람(사본 번호)을 새 사본에서
  const out = withPull(() => ctx.warCapture(lose, win, LD, WS, J, hook.day, roster, null));
  return { cand: out.cand, take: out.take.length, freed: out.freed, side: atkWin ? 'B' : 'A' };
}

const recs = [];
for (const f of files) {
  const R = JSON.parse(fs.readFileSync(f, 'utf8'));
  const run = { file: path.basename(path.dirname(f)) + '/' + path.basename(f), seed: R.seed, knob: R.knob, wars: [] };
  for (const o of Object.values(R.wars)) {
    const wo = { id: o.id, atk: o.atk, def: o.def, den: o.den, hooks: [] };
    o.hook.forEach((h, hi) => {
      if (!h.snap || !h.snap.D || !h.snap.A) { wo.hooks.push({ hi, day: h.day, why: h.why, miss: 'snap' }); return; }
      const hr = { hi, day: h.day, why: h.why, L: null, B: null };
      // L — 랩 목표(랩 toBattleSpec · 랩 conscript)
      try {
        const army = { composition: Object.assign({}, o.comp), force: o.force, weapQ: o.weapQ, atkEcon: { _weapQ: h.aWeapQ } };
        if (!tot(army.composition)) army.composition = null;
        const D0 = econOf(h.snap.D);
        if (D0.npcs.length < 2) hr.L = { walkover: true, dPop: D0.npcs.length };   // 랩 warResolveBattle/_opResolveEngage — 방어 주민 < 2 면 무저항 함락
        else {
          const spec = withPull(() => ctx.toBattleSpec(army.composition ? army : Object.assign(army, { composition: { champion: 0, dagger: Math.max(1, o.force - (o.warriors || 0)), spear: 0, pike: 0, archer: 0 } }), { name: o.def, econ: D0 }, { terrain: 'village' }));
          const runs = [];
          for (let k = 0; k < K; k++) {
            const seed = WC.hash2(WC.hash2(R.seed | 0, o.id | 0), (hi * 1000 + k) | 0);
            const S2 = Object.assign({}, spec);   // spec 은 buildArmies 가 읽기만 한다
            const r = runLab(S2, seed);
            const x = slim(r, h.aPop, h.dPop); x.cap = capLab(r, spec, h, o, seed); runs.push(x);
          }
          hr.L = { A: pick(spec.A), B: pick(spec.B), qA: spec.quality.A.weapQ, qB: spec.quality.B.weapQ, ex: !!spec._existential, defForce: spec._defComp ? spec._defComp.force : null, runs };
        }
      } catch (e) { hr.L = { err: String(e && e.message || e) }; }
      wo.hooks.push(hr);
    });
    // B — 싸운 몸(정산 때 몸 · 서버 교전 품질) — 전쟁마다 한 번(서버 교전은 한 전쟁에 교전 객체 하나)
    const st = o.set && o.set[0];
    if (st && st.types && st.start && st.start.A > 0 && st.start.B > 0) {
      const A = { form: 'line' }, Bs = { form: 'line' };
      for (const [t, v] of Object.entries(st.types.A)) A[t] = v.n;
      for (const [t, v] of Object.entries(st.types.B)) Bs[t] = v.n;
      const spec = { A, B: Bs, terrain: 'zone', quality: { A: st.qA != null ? { weapQ: st.qA } : null, B: st.qB != null ? { weapQ: st.qB } : null }, playerCmd: false };
      const runs = [];
      for (let k = 0; k < K; k++) { const seed = WC.hash2(WC.hash2(R.seed | 0, o.id | 0), (777000 + k) | 0); runs.push(slim(runLab(Object.assign({}, spec), seed), null, null)); }
      wo.B = { A: pick(A), B: pick(Bs), runs };
    }
    run.wars.push(wo);
  }
  recs.push(run);
}
const out = { ver: 1, k: K, parity, pulled, runs: recs };
if (OUTF) fs.writeFileSync(OUTF, JSON.stringify(out));
console.log(`랩 다시 치기 — 판 ${recs.length} · k ${K} · battle-core 인라인 = sim/battle-core.js: ${parity.battleCoreInlineSame ? '같음' : '다름'} · 꺼낸 랩 선언 ${pulled.length}개 (${pulled.map((p) => p.name + ':' + p.line).join(' ')})`);
for (const r of recs) {
  const n = r.wars.reduce((a, w) => a + w.hooks.filter((h) => h.L && h.L.runs).length, 0);
  const e = r.wars.reduce((a, w) => a + w.hooks.filter((h) => h.L && h.L.err).length, 0);
  console.log(`  ${r.file} 시드 ${r.seed} — 전쟁 ${r.wars.length} · 랩 L 판 교전 ${n} · 오류 ${e} · B 팔 ${r.wars.filter((w) => w.B).length}`);
  const e0 = r.wars.flatMap((w) => w.hooks.filter((h) => h.L && h.L.err).map((h) => h.L.err))[0]; if (e0) console.log('    첫 오류: ' + e0);
}
