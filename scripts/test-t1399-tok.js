#!/usr/bin/env node
'use strict';
// @regress
// @bait 3
// === scripts/test-t1399-tok.js — 일터 깨움 표 한 번 판정(T1399 ⓐ) · 던짐 대본 어부 기다림(T1399 ⓒ) = 판정 = 결정 문 · 서버 판 ===
//   몸 전부 판(`scripts/t1294/run.cjs` · 가상 시계 · 시드 1020 · 2날)을 두 줄로 돈다(던짐 대본 `T312_FISH_ACT=1` · 일터 깨움 나머지 `T1365_WORK` 켬 · `T1399_FISH=1`):
//     ㄱ `T1399_TOK=verify` — 표가 산다고 본 결정마다 판정(`t1348Farm` · `t1365Work`)을 실제로 다시 해 같은 답인가를 센다(행동은 판정 답 = 종전).
//     ㄴ `T1348_WORK=verify` · `T1365_WORK=verify` — 판정이 참인 결정마다 결정 문을 실제로 돌려 몸 칸 전부를 견준다(판정 3 = 라벨 시각 하나만 그 결정의 시각).
//   두 줄을 이으면 "표가 산다 ⇒ 판정 참 ⇒ 결정은 몸 칸 무동작(+ 미룬 도장)".
//   ① 판 넷이 끝까지 돌았다  ② ㄱ 표로 건넌 결정 > 0 · 표 ↔ 판정 어긋남 0 · 직업마다(농부 · 어부 · 사냥꾼) 표를 적었다  ③ ㄴ 판정 ↔ 결정 문 어긋남 0 · 어부 판정 3(던짐 대본 기다림)이 탔다
//   ④ 마을 바뀜 도장 자리 — 생활층이 판정이 읽는 마을 문(크루 · 집터 · 의뢰 집터 · 장 · 촌장 줄 · 밭 · 영토 · 곳간 터 · 곳간 줄 · 명부 · 영토 일감 줄)을 쓰는 줄마다 `t1399Bump` 가 같은 줄(또는 바로 윗줄 도장 한 줄)에 있다(글자)
//   ⑤ 손잡이 — `T1399_TOK` 끔 기본 · `1` 켬 · `verify` 켬 + 견줌 · 첫 거름 끔이면 무동작
//   ★미끼 셋 [T1356 규약]:
//     ⓐ 생활층 사본(프리로드로 `server/villages.js` 를 읽을 때만 바꾼다 · 프로세스마다 바꾼 자리 수를 로그 한 줄) — 표가 시각 문턱(머묾 끝 · 입질 …)을 안 본다(묵은 표로 걷는 몸) → ② 어긋남 > 0
//     ⓑ 같은 꼴 — 던짐 대본 기다림이 입질 끝을 1.5초 늦게 본다 → ③ 어긋남 > 0
//     ⓒ 글자 미끼 — ④ 가 읽는 생활층 글자에서 도장 한 줄(명부에 몸을 넣는 줄)을 뺀 사본 → ④ 도장 없는 줄 > 0
//   ⚠이 2날 판 세계는 낮 가운데 마을 문을 쓰는 일이 없다(도장 셈 훅: 부팅 · 마을 하루 문만 — 날 칸이 이미 표를 내린다) — 도장 자리의 판 증거는 30날 × 3시드 · 400날 끈 판(켬)이다(보고 §4).
//   판 넷은 차례로(본 판 둘 · 2날 · 미끼 판 둘 · 하루씩). 날짜 · 벽시계를 안 쓴다(가상 시계 판 · 날 번호만).
if (require.main !== module) {   // 프리로드로 실렸을 때 — 미끼 갈아 끼우기만(판을 안 돈다)
  const B = process.env.__T1399_BAIT;
  if (B) {
    const Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
    const R = { clock: ['if (!(now < T)) return false;', 'if (!(now < T)) return false;', 'if (false) return false;'], fish: ['if (!(now < c.biteAt)) return _z(', 'now < c.biteAt)', 'now < c.biteAt + 1500)'],
    }[B];
    Module.prototype._compile = function (content, filename) {
      if (R && filename.endsWith(VP)) {
        const L = content.split('\n'), hit = L.map((l, i) => (l.includes(R[0]) ? i : -1)).filter((i) => i >= 0);
        if (hit.length === 1) L[hit[0]] = L[hit[0]].replace(R[1], R[2]);
        content = L.join('\n');
        if (process.env.__T1399_BAIT_LOG) { try { require('fs').appendFileSync(process.env.__T1399_BAIT_LOG, `${process.pid} ${hit.length}\n`); } catch (e) {} }
      }
      return _c.call(this, content, filename);
    };
  }
  return;
}
require('./lib-port').noCentral();   // 존이 기본 central 주소에 붙지 않게
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.env.T1399_DAYS || 2), SEED = String(process.env.T1399_SEED || 1020), PB = +(process.env.T577_PORT_BASE || 49300);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 't1399-tok-'));
const BASE = { T312_FISH_ACT: '1', T1365_WORK: '1', T1399_FISH: '1' };
function lane(name, port, extra, days) {
  const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
  return new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(dir, 'run'), String(days || DAYS)], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, T1278_ROOT: ROOT, T1294_SEED: SEED, T577_PORT_BASE: String(port), ...BASE, T1322_STAT: path.join(dir, 'st-%p.json'), ...extra } });
    c.on('exit', (code) => {
      const sf = path.join(dir, 'run', 'status.json'), st = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
      const S = { thit: 0, ttake: 0, tvq: 0, tbad: 0, xvq: 0, xcmp: 0, xbad: 0, fvq: 0, fcmp: 0, fbad: 0, twhy: {}, xwhy: {}, fwhy: {}, tjob: {}, fjob: {}, ex: [] };
      for (const f of fs.readdirSync(dir).filter((x) => /^st-\d+\.json$/.test(x))) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const k of ['thit', 'ttake', 'tvq', 'tbad', 'xvq', 'xcmp', 'xbad', 'fvq', 'fcmp', 'fbad']) S[k] += j[k] || 0;
        for (const g of ['twhy', 'xwhy', 'fwhy']) for (const [k, v] of Object.entries(j[g] || {})) S[g][k] = (S[g][k] || 0) + v;
        for (const g of ['tjob', 'fjob']) for (const [k, v] of Object.entries(j[g] || {})) { const a = S[g][k] || (S[g][k] = v.map(() => 0)); v.forEach((n, i) => { a[i] += n; }); }
        S.ex.push(...(j.tex || []), ...(j.xex || []), ...(j.fex || []));
      }
      const lf = extra.__T1399_BAIT_LOG, log = lf && fs.existsSync(lf) ? fs.readFileSync(lf, 'utf8').trim().split('\n').map((l) => +l.split(' ')[1]) : [];
      res({ code, st, S, log });
    });
  });
}
// ④ 도장 자리 — 마을 문 칸을 쓰는 줄(대입 · 증감 · 넣고 빼기)마다 같은 줄에 `t1399Bump`
function stampSites(src) {
  const SRC = (src || fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')).split('\n');
  const F = ['_t529Q', '_clearCrew', '_site', '_buildCrew', '_t400Crew', '_psite', '_psiteCrew', '_farmSet', '_granPend', '_granList', 'npcPids', '_t1207Pend', '_mkt'];
  const W = new RegExp('\\.(' + F.join('|') + ')(\\s*(=(?!=)|\\+\\+|--|\\+=|-=)|\\.(push|splice|shift|unshift|add|delete|clear|pop)\\()');
  let n = 0; const miss = [];
  SRC.forEach((l, i) => {
    const t = l.replace(/\/\/.*$/, '');
    if (!W.test(t) && !/\brec\.at\.set\(/.test(t)) return;
    if (/^\s*(const|let)\s/.test(t) && !/;\s*\S/.test(t.replace(/^\s*(const|let)[^;]*;/, ''))) return;   // 지역 선언 줄(마을 칸이 아니다)
    if (/^\s*_t1399|function t1399|\b_vil\b|state\.villages\.push/.test(t)) return;
    n++; if (!/t1399Bump\(/.test(t) && !/^\s*t1399Bump\(vil\);/.test(SRC[i - 1] || '')) miss.push(`${i + 1}: ${t.trim().slice(0, 90)}`);   // 같은 줄 · 또는 바로 윗줄이 도장 한 줄(남의 하네스가 글자째 쥔 줄)
  });
  return { n, miss };
}
(async () => {
  console.log(`\n=== 일터 깨움 표 한 번 판정 = 판정 = 결정 문 — 시드 ${SEED} · ${DAYS}날 · ${out} ===`);
  { const vm = require('vm'), SRC = fs.readFileSync(path.join(ROOT, 'server', 'stand-skip.js'), 'utf8');
    const L = (env) => { const m = { exports: {} }; vm.runInThisContext('(function (module, exports, require, process) {' + SRC + '\n})')(m, m.exports, require, { env }); return m.exports; };
    const a = L({}), b = L({ T1399_TOK: '1' }), c = L({ T1399_TOK: 'verify' }), d = L({ T1322_PREFILTER: '0', T1399_TOK: '1' });
    ok(!a.TOK_ON && b.TOK_ON && !b.TOK_VERIFY && c.TOK_ON && c.TOK_VERIFY && !d.TOK_ON, '⑤ 손잡이 `T1399_TOK` — 끔 기본 · `1` 켬 · `verify` 켬 + 견줌 · 첫 거름 끔이면 무동작'); }
  const SP = stampSites();
  ok(SP.n >= 40 && SP.miss.length === 0, '④ 마을 바뀜 도장 — 판정이 읽는 마을 문 칸을 쓰는 줄마다 같은 줄에 `t1399Bump`', `쓰는 줄 ${SP.n} · 도장 없는 줄 ${SP.miss.length}${SP.miss.length ? ' · ' + SP.miss.slice(0, 4).join(' | ') : ''}`);
  { const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), mark = 'vil.npcPids.push(p.pid); t1399Bump(vil);', hit = src.split(mark).length - 1, B3 = stampSites(src.replace(mark, 'vil.npcPids.push(p.pid);'));
    ok(hit === 1 && B3.miss.length === 1, '미끼 ⓒ 글자 — 명부에 몸을 넣는 줄의 도장을 뺀 생활층 글자 → ④ 도장 없는 줄 1 빨강', `바꾼 자리 ${hit} · 도장 없는 줄 ${B3.miss.length}`); }
  const baitEnv = (b) => ({ __T1399_BAIT: b, __T1399_BAIT_LOG: path.join(out, `bait-${b}.log`), T1294_PRELOAD: __filename });
  const BD = +(process.env.T1399_BAIT_DAYS || 1);   // 미끼 판은 하루 · 판은 차례로(짐이 많은 상자에서 가상 시계가 밀리지 않게)
  const TV = { T1399_TOK: 'verify' }, WV = { T1348_WORK: 'verify', T1365_WORK: 'verify' };
  const A = await lane('tok', PB, TV), B = await lane('work', PB + 100, WV), BS = await lane('bclock', PB + 200, { ...TV, ...baitEnv('clock') }, BD), BF = await lane('bfish', PB + 300, { ...WV, ...baitEnv('fish') }, BD);
  const fine = (R, d) => R.code === 0 && R.st && R.st.valid && R.st.days === d;
  ok(fine(A, DAYS) && fine(B, DAYS), `① 판 둘이 끝까지 돌았다(${DAYS}날 · 가상 시계 오류 0)`, `rc ${A.code} · ${B.code}`);
  const J = A.S.tjob, tk = (j) => (J[j] || [0])[0];
  ok(A.S.thit > DAYS * 5e4 && A.S.tvq === A.S.thit && A.S.tbad === 0 && ['farmer', 'fisher', 'hunter'].every((j) => tk(j) > 100),
    '② ㄱ 표로 건넌 결정마다 판정을 다시 함 — 같은 답(어긋남 0) · 농부 · 어부 · 사냥꾼 표', `표 ${A.S.ttake} · 건넘 ${A.S.thit} · 견줌 ${A.S.tvq} · 어긋남 ${A.S.tbad} ${JSON.stringify(A.S.twhy)} · 직업 ${JSON.stringify(J)}${A.S.ex.length ? ' · ' + A.S.ex.slice(0, 3).join(' | ') : ''}`);
  const fj = B.S.fjob.fisher || [0, 0, 0, 0];
  ok(B.S.xvq > DAYS * 3e4 && B.S.xcmp === B.S.xvq && B.S.xbad === 0 && B.S.fvq > DAYS * 3e4 && B.S.fcmp === B.S.fvq && B.S.fbad === 0 && fj[2] > 1000,
    '③ ㄴ 판정이 참인 결정을 실제로 돌려 견줌 — 농부 · 그 밖 어긋남 0 · 어부(던짐 대본 기다림 = 판정 3) 탔다', `그 밖 ${B.S.xvq}/${B.S.xcmp} 어긋남 ${B.S.xbad} ${JSON.stringify(B.S.xwhy)} · 농부 ${B.S.fvq}/${B.S.fcmp} 어긋남 ${B.S.fbad} · 어부 잡음 ${fj[2]}${B.S.ex.length ? ' · ' + B.S.ex.slice(0, 3).join(' | ') : ''}`);
  ok(BS.log.length > 0 && BS.log.every((n) => n === 1) && fine(BS, BD) && BS.S.tbad > 0,
    '미끼 ⓐ 표가 시각 문턱을 안 보는 생활층 사본(바꾼 자리 1곳 · 프로세스마다) → ② 어긋남 > 0 빨강(판은 끝까지)', `바꾼 자리 ${BS.log.join(',')} · rc ${BS.code} · 어긋남 ${BS.S.tbad} ${JSON.stringify(BS.S.twhy)}`);
  ok(BF.log.length > 0 && BF.log.every((n) => n === 1) && fine(BF, BD) && BF.S.xbad > 0,
    '미끼 ⓑ 던짐 대본 기다림이 입질 끝을 늦게 본 생활층 사본(바꾼 자리 1곳 · 프로세스마다) → ③ 어긋남 > 0 빨강(판은 끝까지)', `바꾼 자리 ${BF.log.join(',')} · rc ${BF.code} · 어긋남 ${BF.S.xbad} ${JSON.stringify(BF.S.xwhy)}`);
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== T1399 일터 깨움 표 ${pass} 통과 · ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})();
