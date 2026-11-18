#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1372] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1372-resume.js — 서버를 껐다 켠 뒤에도 같은 세계: 캐러밴 몸 · 첫 거름 표(T1372 · T1340 회부 1 · 4) ==========================
//
// ★무엇을 보나(서버 판 자 조건 · 가상 시계 · 시드 1020 · 6날 · 5날에 끊고 잇는다 — 판 넷 · 동시 둘)
//   끊고 이은 판(B · 마디 5 + 1)이 다시 뜬 **첫 틱**과, 그 V 에서 한 번에 돈 판(A · 마디 하나)의 같은 틱을 견준다(`t1372-moment-hook` · `-cmp`).
//   ① [전제] 그 순간 길 위 캐러밴이 있고(A > 0) 첫 거름 표를 든 마을 몸이 있다(0 이면 아래가 자명 통과다)
//   ② 캐러밴 몸 — A 의 캐러밴이 B 에 다 섰다 · pid 가 같다 · 몸 칸 · 상인 몸 칸 · 호위 몸 칸 · 호위 기록 칸 갈림 0
//      (`playerId` 는 뺀다 — 낳을 때 `Math.random` 꼬리가 붙어 **한 번에 돈 판끼리도** 판마다 다르다 · 재기동과 무관 · T1340 §1)
//   ③ 첫 거름 표(T1322 · T1337 · T1348) — 표 든 마을 몸 행이 같고 열 갈림 0
//   ④ 6날 판 끝 — econ 날 지문 6/6 · 마을 칸 지문 6/6(닿음 기억 도장 = 벽 세대 · T1372 ⓒ) · 판 JSON 같음
//   ⑤ 미끼 둘(이 파일이 프리로드로 실린다 · `T1372_BAIT`): 종료 저장 줄(메타)에서 **한 자리**만 뺀 사본 — 뺀 자리 수 1 을 세고 그 물음만 빨강:
//      `car` = 캐러밴 몸 객체 줄(`t1034.x`) → ② 빨강 · ③ 초록 / `ss` = 첫 거름 표 줄(T742 `zone.t1372SS`) → ③ 빨강 · ② 초록
// 실행: node scripts/test-t1372-resume.js   (판 넷 · 동시 둘 · 약 6 ~ 9분)
'use strict';
const path = require('path');
const fs = require('fs');

// ── 미끼 프리로드(아이 존 프로세스에서만 — `T1372_BAIT` 가 있고 이 파일이 `-r` 로 실렸을 때) ─────────────────────────────────
if (require.main !== module) {
  const B = process.env.T1372_BAIT;
  if (B && process.env.T577_OUT && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
    const Module = require('module'), ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
    const DBF = path.join(ROOT, 'server', 'zone-local-db.js'), _p = Module._extensions['.js'];
    let n = 0;
    Module._extensions['.js'] = function (m, filename) {
      const r = _p(m, filename);
      if (filename === DBF && m.exports && typeof m.exports.saveVillagesAndMeta === 'function') {
        const f = m.exports.saveVillagesAndMeta;
        m.exports.saveVillagesAndMeta = function (rows, zone, metaJson, day) {
          try {
            const M = JSON.parse(metaJson);
            if (B === 'car' && M.t1034 && M.t1034.x) { delete M.t1034.x; n++; }
            if (B === 'ss' && M.t742 && M.t742['zone.t1372SS'] != null) { delete M.t742['zone.t1372SS']; n++; }
            metaJson = JSON.stringify(M);
            fs.writeFileSync(process.env.T577_OUT + '.t1372-bait.json', JSON.stringify({ bait: B, n }));
          } catch (e) { console.error('[t1372 미끼] 메타 읽기 실패', e.message); }
          return f.call(this, rows, zone, metaJson, day);
        };
      }
      return r;
    };
  }
  return;
}

const os = require('os');
const { spawn, execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 't1372-'));
const HOOKS = ['t650-print.js', 't1308-bodyprint.js', 't1372-moment-hook.js'].map((f) => `-r ${path.join(__dirname, f)}`).join(' ');
const ENV = Object.assign({}, process.env, { T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1', T1308_KEEP: '0', NODE_OPTIONS: HOOKS });
for (const k of ['T1372_BAIT', 'T1340_AT_V', 'T1308_BAIT_RNG', 'T1340_BAIT', 'T1340_RESUME_EXACT']) delete ENV[k];
const DAYS = '6', SEED = '1020', CUT = '5';
const run = (dir, every, extra) => new Promise((res) => {
  const c = spawn(process.execPath, [path.join(__dirname, 't1308-long-run.js'), DAYS, SEED, '--every', every, '--tag', 'X', '--dir', path.join(BASE, dir)], { env: Object.assign({}, ENV, extra || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => res({ code, out }));
});
const D = (n) => path.join(BASE, n);
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const mom = (a, b, tag) => { const j = path.join(BASE, `mom-${tag}.json`); try { execFileSync(process.execPath, [path.join(__dirname, 't1372-moment-cmp.js'), a, b, '--json', j], { stdio: 'ignore' }); } catch (e) { return null; } return rd(j); };
const cmp = (a, b) => { const j = path.join(BASE, `cmp-${path.basename(a)}-${path.basename(b)}.json`); try { execFileSync(process.execPath, [path.join(__dirname, 't1308-cmp.js'), a, b, '--json', j], { stdio: 'ignore' }); } catch (e) { return null; } return rd(j); };
const full = (r) => r && r.both > 0 && r.same === r.both;
//   물음 셋(② ③ 은 미끼 판이 다시 부른다 — 같은 식)
const NOPID = new Set(['playerId']);
const nDiff = (g, deny) => Object.entries(g || {}).filter(([k]) => !(deny && deny.has(k))).length;
const qCar = (M) => !!M && M.A.cars > 0 && M.onlyA.length === 0 && M.onlyB.length === 0 && M.pidSame === M.both && M.both === M.A.cars
  && nDiff(M.groups['캐러밴 몸']) === 0 && nDiff(M.groups['상인 몸'], NOPID) === 0 && nDiff(M.groups['호위 몸'], NOPID) === 0 && nDiff(M.groups['호위 기록']) === 0;
const qSS = (Xa, Yb) => { if (!Xa || !Yb) return false; const keys = new Set([...Object.keys(Xa.ss), ...Object.keys(Yb.ss)].filter((p) => (Xa.ss[p] && Xa.ss[p].TK !== '0') || (Yb.ss[p] && Yb.ss[p].TK !== '0')));
  if (!keys.size) return false; for (const p of keys) { const a = Xa.ss[p], b = Yb.ss[p]; if (!a || !b) return false; for (const k of Object.keys(a)) if (a[k] !== b[k]) return false; } return true; };
const ssN = (S) => (S ? Object.values(S.ss).filter((r) => r.TK !== '0').length : 0);

(async () => {
  console.log(`\n=== T1372 껐다 켠 뒤에도 같은 세계 — 캐러밴 몸 · 첫 거름 표 (${BASE}) ===`);
  const [B, Bc] = await Promise.all([run('B', CUT), run('Bc', CUT, { T1372_BAIT: 'car', NODE_OPTIONS: HOOKS + ` -r ${__filename}` })]);
  const RB = rd(path.join(D('B'), `seg-${CUT}.json.t1372-ready.json`));
  const V = RB ? RB.V : null;
  const [A, Bs] = await Promise.all([V ? run('A', DAYS, { T1340_AT_V: String(V) }) : Promise.resolve({ code: -1 }), run('Bs', CUT, { T1372_BAIT: 'ss', NODE_OPTIONS: HOOKS + ` -r ${__filename}` })]);
  const AT = rd(path.join(D('A'), 'seg-0.json.t1372-at.json'));
  ok(B.code === 0 && A.code === 0 && RB && AT && AT.V === RB.V, '판 둘이 끝까지 돌았고 같은 순간(다시 뜬 첫 틱 V)을 떴다', `B ${B.code} · A ${A.code} · V ${V}`);

  console.log('\n① 전제');
  ok(AT && Object.keys(AT.cars).length > 0 && ssN(AT) > 0, '[전제] 그 순간 길 위 캐러밴이 있고 첫 거름 표를 든 마을 몸이 있다(0 이면 아래가 자명 통과다)', AT ? `캐러밴 ${Object.keys(AT.cars).length} · 표 든 몸 ${ssN(AT)}` : '');

  console.log('\n② 캐러밴 몸 · ③ 첫 거름 표');
  const M = AT && RB ? mom(path.join(D('A'), 'seg-0.json.t1372-at.json'), path.join(D('B'), `seg-${CUT}.json.t1372-ready.json`), 'B') : null;
  ok(qCar(M), '② 다시 뜬 첫 틱의 캐러밴 몸 = 한 번에 돈 판의 그 몸(같은 pid · 몸 · 상인 · 호위 칸 갈림 0 — playerId 뺌)',
    M ? `캐러밴 A ${M.A.cars} · B ${M.B.cars} · pid 같음 ${M.pidSame} · 갈린 칸 몸 ${nDiff(M.groups['캐러밴 몸'])} · 상인 ${nDiff(M.groups['상인 몸'], NOPID)} · 호위 ${nDiff(M.groups['호위 몸'], NOPID)} · 기록 ${nDiff(M.groups['호위 기록'])}` : '');
  ok(qSS(AT, RB), '③ 첫 거름 표 — 표 든 마을 몸 행 같음 · 열 갈림 0', `표 든 몸 A ${ssN(AT)} · B ${ssN(RB)}`);

  console.log('\n④ 6날 판 끝');
  const R = A.code === 0 && B.code === 0 ? cmp(D('A'), D('B')) : null;
  ok(R && full(R.econ) && R.econ.both === 6 && full(R.side) && R.runJson && R.runJson.same, '④ econ 날 지문 6/6 · 마을 칸 지문 같음 · 판 JSON 같음',
    R ? `econ ${R.econ && R.econ.same}/${R.econ && R.econ.both} · 마을 칸 ${R.side && R.side.same}/${R.side && R.side.both} · 판 JSON ${R.runJson && R.runJson.same ? '같음' : '다름'} · (기록) 몸 자리 ${R.body && R.body.same}/${R.body && R.body.both}` : '');

  console.log('\n⑤ 미끼 — 종료 저장 줄에서 한 자리만 뺀 사본');
  const bait = (dir) => rd(path.join(D(dir), 'seg-0.json.t1372-bait.json'));
  const RC = rd(path.join(D('Bc'), `seg-${CUT}.json.t1372-ready.json`)), KC = bait('Bc');
  const MC = AT && RC ? mom(path.join(D('A'), 'seg-0.json.t1372-at.json'), path.join(D('Bc'), `seg-${CUT}.json.t1372-ready.json`), 'Bc') : null;
  ok(Bc.code === 0 && KC && KC.n === 1 && !qCar(MC) && qSS(AT, RC), '[미끼] 바꾼 자리 1 — 캐러밴 몸 객체 줄(t1034.x)을 뺀 사본은 ② 만 빨강(③ 초록)',
    `뺀 자리 ${KC ? KC.n : '?'} · 캐러밴 B ${MC ? MC.B.cars : '?'} · ② ${qCar(MC) ? '초록' : '빨강'} · ③ ${qSS(AT, RC) ? '초록' : '빨강'}`);
  const RS = rd(path.join(D('Bs'), `seg-${CUT}.json.t1372-ready.json`)), KS = bait('Bs');
  const MS = AT && RS ? mom(path.join(D('A'), 'seg-0.json.t1372-at.json'), path.join(D('Bs'), `seg-${CUT}.json.t1372-ready.json`), 'Bs') : null;
  ok(Bs.code === 0 && KS && KS.n === 1 && qCar(MS) && !qSS(AT, RS), '[미끼] 바꾼 자리 1 — 첫 거름 표 줄(zone.t1372SS)을 뺀 사본은 ③ 만 빨강(② 초록)',
    `뺀 자리 ${KS ? KS.n : '?'} · 표 든 몸 B ${ssN(RS)} · ② ${qCar(MS) ? '초록' : '빨강'} · ③ ${qSS(AT, RS) ? '초록' : '빨강'}`);

  console.log(`\n=== T1372 결과: ${pass} 통과 · ${fail} 실패 ===`);
  if (!fail) fs.rmSync(BASE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
