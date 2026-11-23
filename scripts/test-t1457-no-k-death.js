#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1457] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1457-no-k-death.js — 식이 사람을 지우지 않는다(`T1457_NO_K_DEATH` · ★재민 판정 73) ==========
//
// ★작은 v2 세계(마을 8 · 지도 시딩 0 · 서버 0) 200날 → 마을 0 의 땅을 40 % 로 줄여 K 를 사람 밑으로(N ÷ K > 1) · 마을 2 의 곳간을 날마다 비워 굶김 → 60날 더.
//   ① 켬: 마을 0 이 K 위에 선 날 내내 로지스틱 몫(`_dpDebug.logi`) ≥ 0 · 식 죽음(누계 − 자연사 − 굶음)은 건강 몫 음수 + 줄이기 앞에 남은 빚 만큼뿐 — 끔은 음수 · 죽음 > 0(전제)
//   ② 켬: K 위에서 로지스틱 몫은 정확히 0(K 위에서 그 식이 태어나게 하지 않는다)
//   ③ K 아래 태어남 몫은 끔과 같다 — 어느 마을도 K 를 안 넘은 날(끔 판 첫 로지스틱 음수 앞)까지 켬 판 = 끔 판
//   ④ 굶어 죽음은 그대로 산다 — 켬에서도 굶긴 마을 2 의 식량 빚 죽음 > 0
//   ⑤ 랩 = 서버 — 서버가 싣는 `sim/economy-sim.js` 와 랩 번들(`sim/economy-engine.browser.js` · 랩 인라인 두 HTML)이 같은 손잡이 줄을 쥔다
//   ⑥ 끔 = 종전 바이트 — 손잡이 끔 판 = 손잡이 줄을 지운 사본 판(마을 8 · 260날 · 날마다 인구 · 누계 죽음)
//   미끼 다섯(이 파일 안 — 아이 프로세스가 `sim/economy-sim.js` 를 싣는 순간 글자 한 자리를 바꾼다):
//     `kdeath` 켬에서도 음수를 남김 → ① 빨강 · `above` K 위에서 그 몫을 양수로 → ② 빨강 · `loose` K 아래 태어남까지 키움 → ③ 빨강 ·
//     `famine` 굶어 죽음까지 막음 → ④ 빨강 · `lab` 번들에서 손잡이 줄을 뺀 사본 → ⑤ 빨강
// 실행: node scripts/test-t1457-no-k-death.js   (아이 일곱 · 약 70초)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const LINE = '  if (T1457_NO_K_DEATH && _logiTerm < 0) _logiTerm = 0;';
const BAITS = {
  kdeath: [LINE, '  if (T1457_NO_K_DEATH && _logiTerm < 0) _logiTerm = _logiTerm * 0.5;'],
  above: [LINE, '  if (T1457_NO_K_DEATH && _logiTerm < 0) _logiTerm = -_logiTerm;'],
  loose: [LINE, '  if (T1457_NO_K_DEATH && _logiTerm < 0) _logiTerm = 0;\n  if (T1457_NO_K_DEATH && _logiTerm > 0) _logiTerm *= 1.5;'],
  famine: ['  if (T1074_FOOD_DEBT && v.npcs.length > POP_MIN) {\n    const _fdk = _fdDeathIdx(v);', '  if (T1074_FOOD_DEBT && v.npcs.length > POP_MIN && !T1457_NO_K_DEATH) {\n    const _fdk = _fdDeathIdx(v);'],
  noline: [LINE + '   // ★[T1457]', '   // (지운 줄)'],
};

// ── 아이 ──────────────────────────────────────────────────────────────────────────────────
if (process.argv[2] === '--child') {
  const M = require('module'), old = M._extensions['.js'], B = process.env.T1457_BAIT;
  if (B) {
    const R = BAITS[B]; const tgt = path.join(ROOT, 'sim', 'economy-sim.js');
    M._extensions['.js'] = function (m, f) {
      if (f !== tgt) return old(m, f);
      let x = fs.readFileSync(f, 'utf8');
      if (!x.includes(R[0])) { process.stdout.write('\n' + JSON.stringify({ err: '미끼 자리 없음 ' + B })); process.exit(0); }
      m._compile(x.replace(R[0], R[1]), f);
    };
  }
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const w = econV2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  require(path.join(ROOT, 'server', 'trees')).attachToWorld(w);
  const V = w.villages, form = (v) => (v._deadTot || 0) - (v._natDeadTot || 0) - (v._fdDeadTot || 0);
  const out = { days: [], v0: { overDays: 0, minLogi: Infinity, maxLogi: -Infinity, form0: 0, form1: 0, acc0: 0, healthNeg: 0 }, below: { n: 0, bad: 0 }, fd0: 0, fd1: 0, firstNeg: null };
  for (let d = 0; d < 260; d++) {
    if (d === 200) { V[0].land.size *= 0.4; out.v0.form0 = form(V[0]); out.fd0 = V[2]._fdDeadTot || 0; out.v0.acc0 = V[0]._dPAccum || 0; }
    if (d >= 200) {   // 마을 2 를 굶긴다 — 곳간 식량을 날마다 비우고(교역 · 채집으로 들어온 것도) 사람마다 빚을 죽음 문턱 위로(그날 모자람이 서면 죽는다)
      for (const k of Object.keys(V[2].storage)) if (typeof V[2].storage[k] === 'number' && /food|grain|meat|fish|berry|bread|fruit|veg|rice|barley|millet|wheat|bean|honey|milk|jerky|smoked|dried|pickled|acorn|nut|forage/i.test(k)) V[2].storage[k] = 0;
      if (d === 200) for (const p of V[2].npcs) p._fd = 30;
    }
    econV2.tickWorldV2(w);
    out.days.push(V.map((v) => [v.npcs.length, v._deadTot || 0]));
    if (out.firstNeg == null) for (const v of V) if (v._dpDebug && v._dpDebug.logi < 0) { out.firstNeg = d; break; }
    if (d >= 200) {
      const dd = V[0]._dpDebug; if (dd && dd.health < 0) out.v0.healthNeg += dd.health; if (dd && V[0].npcs.length > dd.K) { out.v0.overDays++; out.v0.minLogi = Math.min(out.v0.minLogi, dd.logi); out.v0.maxLogi = Math.max(out.v0.maxLogi, dd.logi); }
    }
    for (const i of [1, 3, 4, 5, 6, 7]) {   // ③ K 아래 날의 로지스틱 몫 = r · N · (1 − (N/K)^θ)(같은 꼴 식 · `_homeN` 은 `_dpDebug` 에 없어 몸 수 대신 econ 명부 수 — 원정 0 판)
      const v = V[i], dd = v._dpDebug, N = v.npcs.length; if (!dd || !(dd.K > 0) || N >= dd.K || N === 0) continue;
      out.below.n++;
      const want = 0.04 * N * (1 - Math.pow(N / Math.max(1, dd.K), 4));
      if (Math.abs(want - dd.logi) > 0.02 * Math.max(1, Math.abs(want))) out.below.bad++;
    }
  }
  out.v0.form1 = form(V[0]); out.fd1 = V[2]._fdDeadTot || 0;
  process.stdout.write('\n' + JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const kid = (env) => { const r = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: Object.assign({}, process.env, { T1457_NO_K_DEATH: '', T1457_BAIT: '' }, env), encoding: 'utf8', maxBuffer: 64 << 20 }); try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (e) { return { err: (r.stderr || '').slice(-300) }; } };
const q1 = (o) => !!(o && o.v0 && o.v0.overDays > 0 && o.v0.minLogi >= 0 && (o.v0.form1 - o.v0.form0) <= Math.ceil(-o.v0.healthNeg + Math.max(0, -o.v0.acc0)));   // 남는 죽음 = 건강 몫 음수 + 줄이기 앞 남은 빚만큼(K 넘김 몫 0)
const q2 = (o) => !!(o && o.v0 && o.v0.overDays > 0 && o.v0.maxLogi === 0);
const q3 = (o, base) => !!(o && base && base.firstNeg >= 30 && JSON.stringify(o.days.slice(0, base.firstNeg)) === JSON.stringify(base.days.slice(0, base.firstNeg)));   // 어느 마을도 K 를 안 넘은 날까지 = 끔과 한 글자도 안 다르다
const q4 = (o) => !!(o && o.fd1 - o.fd0 > 0);
const BUNDLE = [path.join(ROOT, 'sim', 'economy-engine.browser.js'), path.join(ROOT, 'lab', '마을실험실.html'), path.join(ROOT, 'lab', '전쟁실험실.html')];
const q5 = (files) => { const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8'); if (!src.includes(LINE)) return false; return files.every((f) => { const t = fs.readFileSync(f, 'utf8'); return t.includes(LINE.trim()) && t.includes("process.env.T1457_NO_K_DEATH === '1'"); }); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1457-'));
try {
  console.log('[T1457] 식이 사람을 지우지 않는다 — 작은 세계 8마을 · 200날 뒤 마을 0 땅 40 % · 마을 2 굶김 · 60날');
  const off = kid({}), on = kid({ T1457_NO_K_DEATH: '1' });
  ok(off.v0 && off.v0.overDays > 0 && off.v0.minLogi < 0 && off.v0.form1 - off.v0.form0 > 0, '[전제] 끔: 마을 0 이 K 위에 선 날 로지스틱 몫 음수 · K 넘김 죽음 > 0', off.v0 && `K 위 ${off.v0.overDays}날 · 최소 ${off.v0.minLogi} · 죽음 ${off.v0.form1 - off.v0.form0}`);
  ok(q1(on), '★① 켬: K 위 날 내내 로지스틱 몫 ≥ 0 · 식 죽음은 건강 몫 음수 + 줄이기 앞 남은 빚 만큼뿐(K 넘김 몫 0)', on.v0 && `K 위 ${on.v0.overDays}날 · 최소 ${on.v0.minLogi} · 식 죽음 ${on.v0.form1 - on.v0.form0} ≤ 건강 ${(-on.v0.healthNeg).toFixed(2)} + 빚 ${Math.max(0, -on.v0.acc0).toFixed(2)}`);
  ok(q2(on), '★② 켬: K 위에서 그 몫은 정확히 0(K 위에서 식이 태어나게 하지 않는다)', on.v0 && `최대 ${on.v0.maxLogi}`);
  ok(q3(on, off), '★③ K 아래 태어남 몫은 그대로 — 어느 마을도 K 를 안 넘은 날(끔 판 첫 로지스틱 음수 앞)까지 켬 판 = 끔 판(날마다 인구 · 누계 죽음)', `첫 음수 날 ${off.firstNeg}`);
  ok(q4(on), '★④ 굶어 죽음은 그대로 — 켬에서도 굶긴 마을 2 의 식량 빚 죽음 > 0', `켬 ${on.fd1 - on.fd0} · 끔 ${off.fd1 - off.fd0}`);
  ok(q5(BUNDLE), '★⑤ 랩 = 서버 — 서버가 싣는 econ 과 랩 번들 · 랩 인라인 두 HTML 이 같은 손잡이 줄', BUNDLE.map((f) => path.basename(f)).join(' · '));
  const noline = kid({ T1457_BAIT: 'noline' });
  ok(!noline.err && JSON.stringify(noline.days) === JSON.stringify(off.days), '★⑥ 끔 = 종전 바이트 — 끔 판 = 손잡이 줄을 지운 사본 판(마을 8 · 260날 · 날마다 인구 · 누계 죽음)', noline.err || `${off.days.length}날`);

  // ── 미끼 다섯 ─────────────────────────────────────────────────────────────────────────
  // @bait kdeath — 켬에서도 음수를 남긴다
  const b1 = kid({ T1457_NO_K_DEATH: '1', T1457_BAIT: 'kdeath' });
  ok(!b1.err && !q1(b1), '[미끼 kdeath] 바꾼 자리 1곳(켬에서 음수를 절반만 걷음) — K 넘김으로 죽는 사본은 ① 빨강', b1.err || (b1.v0 && `최소 ${b1.v0.minLogi}`));
  // @bait above — K 위에서 그 몫을 양수로
  const b2 = kid({ T1457_NO_K_DEATH: '1', T1457_BAIT: 'above' });
  ok(!b2.err && !q2(b2), '[미끼 above] 바꾼 자리 1곳(K 위 몫을 양수로) — K 위에서 태어나는 사본은 ② 빨강', b2.err || (b2.v0 && `최대 ${b2.v0.maxLogi}`));
  // @bait loose — 죽음을 0 으로 하면서 K 아래 태어남까지 키움
  const b3 = kid({ T1457_NO_K_DEATH: '1', T1457_BAIT: 'loose' });
  ok(!b3.err && !q3(b3, off), '[미끼 loose] 바꾼 자리 1곳(K 아래 몫 × 1.5) — 태어남까지 풀어 준 사본은 ③ 빨강', b3.err || '');
  // @bait famine — 굶어 죽음까지 막음
  const b4 = kid({ T1457_NO_K_DEATH: '1', T1457_BAIT: 'famine' });
  ok(!b4.err && !q4(b4), '[미끼 famine] 바꾼 자리 1곳(켬이면 식량 빚 죽음 문을 닫음) — 굶어 죽음까지 막은 사본은 ④ 빨강', b4.err || `${b4.fd1 - b4.fd0}`);
  // @bait lab — 번들에서 손잡이 줄을 뺀 사본(랩과 서버가 다름)
  const bf = path.join(T, 'economy-engine.browser.js'); fs.writeFileSync(bf, fs.readFileSync(BUNDLE[0], 'utf8').split(LINE.trim()).join('/* (뺌) */'));
  ok(!q5([bf, BUNDLE[1], BUNDLE[2]]), '[미끼 lab] 바꾼 자리 1곳(번들에서 손잡이 줄 뺌) — 랩과 서버가 다른 사본은 ⑤ 빨강');
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
