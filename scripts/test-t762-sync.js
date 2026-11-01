#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t762-sync.js — 손잡이 `T762_CARAVAN_BODY`(기본 끔): ① 그날 econ 이 띄운 캐러밴도 **그날** 몸 동기에 · ② 재라우팅 몸은 옛 길 끝에서 [T762] ==========
//
// ★왜 [T762 실제 날 판] 하루 문은 캐러밴 동기 조각을 문을 여는 순간의 명부(`world.caravans.slice()`)로 세운다 — econ 틱(같은 문의 앞 조각)이
//   띄운 캐러밴은 그 명부에 없어 **다음 경계**에야 몸이 선다. `T474_CARAVAN_WALK` 켬(다리 거의 다 1일)이면 가는 길이 통째로 장부만 간다.
//   켜면 명부 뒤에 조각 하나가 더 서고, 그 조각이 돌 때(econ 뒤) 명부에 없던 캐러밴만 같은 `_caravanSyncOne` 으로 보낸다.
//
// 재는 것:
//   ① 술어 — `=== '1'` 만 켬 · 읽는 자리 = `server/villages.js` 하나(sim · public · 다른 server 파일은 안 읽는다)
//   ② 두 문(`_openDayJobs` · `_t731Jobs`) 모두: 명부 `_cl` 로 한 대씩 → 끔: 쓸기(종전) · 켬: 쓸기 → 새 캐러밴 조각 — 이 차례
//      (켬에서 쓸기가 앞인 까닭: 어제 집에 닿은 몸이 자리를 쥔 채면 새 몸이 상한 60 에 걸린다 · 쓸기는 몸만 훑어 새 캐러밴과 무관)
//   ③ 끔 = 종전 — 한 대씩 조각은 명부 `_cl` 만 돈다(그 밖의 캐러밴 조각 0) · 손잡이가 안 켜지면 덧 조각이 안 선다(글자)
//   ④ 덧 조각의 행동(정본 함수 글자를 그대로 평가 · 가짜 세계):
//      ⓐ 명부에 있던 캐러밴은 건너뛴다 · ⓑ 명부는 **조각이 처음 돌 때** 뜬다(문을 연 뒤 econ 이 띄운 것까지) ·
//      ⓒ `'retry'` 면 같은 자리에서 멈추고 다음 부름이 그 자리부터 잇는다(T85 계약) · ⓓ 차례 = `world.caravans` 차례
//   ⑤ 자명 통과 금지 — 덧 조각이 없는 문(돌연변이: 명부만)이면 ④ⓑ 의 새 캐러밴이 한 대도 안 불린다
//   ⑥ ② 재라우팅 — 켬이면 다시 떠나는 자리 = 옛 장부 길 끝(`path.len`) · 남은 구간 답압 한 번(길이 다 파인 뒤 · 재진입 0) · 끔이면 종전 `body._t661.L`
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const codeOnly = require('./code-only.js');   // 주석 제거기 정본(T171 · 사본 0)

console.log('\n① 술어 · 읽는 자리');
{
  const decl = V.match(/const T762_CARAVAN_BODY = process\.env\.T762_CARAVAN_BODY === '1';/g) || [];
  ok(decl.length === 1, '① 선언 하나 · `=== \'1\'` 만 켬(기본 끔)', `선언 ${decl.length}`);
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T762_CARAVAN_BODY')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'villages.js'), '① 읽는 자리 = server/villages.js 하나', readers.join(','));
}

console.log('\n② ③ 두 문의 차례 · 끔 글자');
{
  const blk = /\{ const _cl = state\.world\.caravans\.slice\(\);\n\s+for \(const c of _cl\) add\('caravan', \(\) => _t851Sync\(C, c\), 'caravan_sync', _t851Tag\);[^\n]*\n\s+if \(T762_CARAVAN_BODY\) \{ add\('caravan', \(\) => \{ _caravanSyncSweep\(C\.car\); \}, 'caravan_sync'\); add\('caravan', _t762SyncNewJob\(C, new Set\(_cl\)\), 'caravan_sync'\); \}[^\n]*\n\s+else add\('caravan', \(\) => \{ _caravanSyncSweep\(C\.car\); \}, 'caravan_sync'\); \}/g;   // ★[T828] 조각 속 이름 `caravan_sync`(값 0)
  const n = (V.match(blk) || []).length;
  ok(n === 2, '② 두 문 모두 — 명부 한 대씩 → 끔: 쓸기 · 켬: 쓸기 → 새 캐러밴 조각(집에 닿은 몸이 자리를 먼저 비운다)', `${n}/2`);
  const perCar = (codeOnly(V).match(/add\('caravan', \(\) => _t851Sync\(C, c\)/g) || []).length;   // ★[T851] 한 대씩 = `_t851Sync`(속 이름을 고르는 겉 · 안은 `_caravanSyncOne` 그대로)
  const fromCl = (codeOnly(V).match(/for \(const c of _cl\) add\('caravan', \(\) => _t851Sync\(C, c\)/g) || []).length;
  ok(perCar === 2 && fromCl === 2, '③ 끔 = 종전 — 한 대씩 조각은 문을 연 명부(`_cl`)만 돈다', `한 대씩 ${perCar} · 명부 ${fromCl}`);
  const extra = (codeOnly(V).match(/_t762SyncNewJob\(/g) || []).length;
  const guarded = (codeOnly(V).match(/if \(T762_CARAVAN_BODY\) \{ add\('caravan', \(\) => \{ _caravanSyncSweep\(C\.car\); \}, 'caravan_sync'\); add\('caravan', _t762SyncNewJob\(/g) || []).length;
  ok(extra === 3 && guarded === 2, '③ 덧 조각은 손잡이 아래에서만 선다(정의 1 · 부름 2 = 둘 다 `if (T762_CARAVAN_BODY)`)', `글자 ${extra} · 손잡이 아래 ${guarded}`);
  const sweeps = (codeOnly(V).match(/add\('caravan', \(\) => \{ _caravanSyncSweep\(C\.car\); \}, 'caravan_sync'\)/g) || []).length;
  ok(sweeps === 4, '③ 쓸기는 문마다 한 번만 선다(켬 갈래 하나 · 끔 갈래 하나 × 두 문)', `쓸기 글자 ${sweeps}`);
}

console.log('\n④ 덧 조각의 행동(정본 글자 · 가짜 세계)');
// 정본 함수 글자를 그대로 떠서 가짜 `state` · `_caravanSyncOne` 위에서 평가한다(사본 0 — 글자가 바뀌면 여기서 바로 갈린다)
const src = (V.match(/function _t762SyncNewJob\(C, had\) \{[\s\S]*?\n\}\n/) || [])[0];
ok(!!src, '④ 전제: 정본 `_t762SyncNewJob` 글자를 떴다');
function mk(jobSrc, plan) {
  const calls = [];
  const state = { world: { caravans: [] } };
  const _caravanSyncOne = (now, c) => { calls.push(c.id); const r = plan[c.id]; if (r && r.length) return r.shift(); return undefined; };
  const f = new Function('state', '_caravanSyncOne', jobSrc + '\nreturn _t762SyncNewJob;')(state, _caravanSyncOne);
  return { state, calls, f };
}
if (src) {
  const A = { id: 'a' }, B = { id: 'b' }, N1 = { id: 'n1' }, N2 = { id: 'n2' }, N3 = { id: 'n3' };
  const { state, calls, f } = mk(src, { n2: ['retry'] });   // n2 는 첫 부름에 길이 아직(retry) · 둘째에 선다
  state.world.caravans = [A, B];
  const had = new Set(state.world.caravans.slice());            // 문을 여는 순간의 명부
  const job = f({ now: 0, car: {} }, had);
  state.world.caravans = [A, B, N1, N2, N3];                     // econ 조각이 셋을 띄웠다(문을 연 뒤)
  const r1 = job();
  ok(r1 === 'retry' && calls.join(',') === 'n1,n2', '④ⓑⓒ 첫 부름 — 명부 밖 첫째(n1) → 둘째(n2) 에서 길이 아직이라 멈춘다', `반환 ${r1} · 부름 ${calls.join(',')}`);
  state.world.caravans = [A, B, N1, N2, N3, { id: 'late' }];   // 조각 사이에 더 들어와도 이 하루 명부는 첫 부름에 정해졌다
  const r2 = job();
  ok(r2 === undefined && calls.join(',') === 'n1,n2,n2,n3', '④ⓒⓓ 둘째 부름 — 멈춘 자리(n2)부터 · 차례 = world.caravans 차례 · 다 돌면 끝', `반환 ${r2} · 부름 ${calls.join(',')}`);
  ok(!calls.includes('a') && !calls.includes('b'), '④ⓐ 명부에 있던 캐러밴(a · b)은 덧 조각이 안 부른다(한 대씩 조각이 이미 부른다 — 두 번 0)');
  ok(!calls.includes('late'), '④ⓑ 덧 조각의 명부는 첫 부름에 정해진다(조각 사이에 든 것은 다음 경계 몫)');
  // ⑤ 자명 통과 금지 — 덧 조각이 없는 문(명부만)이면 새 캐러밴은 그날 한 대도 안 불린다
  const seen = [];
  const day = (withNew) => { const W = { caravans: [A, B] }; const cl = W.caravans.slice(); const jobs = cl.map((c) => () => seen.push(c.id));
    if (withNew) jobs.push(() => { for (const c of W.caravans.filter((x) => !new Set(cl).has(x))) seen.push(c.id); });
    W.caravans = [A, B, N1]; for (const j of jobs) j(); return seen.splice(0); };
  const off = day(false), on = day(true);
  ok(!off.includes('n1') && on.includes('n1'), '⑤ 자명 통과 금지 — 명부만인 문은 그날 econ 이 띄운 캐러밴을 못 본다 · 덧 조각이 있으면 본다', `끔 ${off.join(',')} · 켬 ${on.join(',')}`);
}

console.log('\n⑥ ② 재라우팅 자리');
{
  const C = codeOnly(V);
  const gate = /const _t762End = T762_CARAVAN_BODY && T661_ON && body\._t661 && body\._t661\.leg === 'outbound';/.test(C);
  const pos = /caravanPointAt\(body\._t661\.path, _t762End \? body\._t661\.path\.len : body\._t661\.L, \{ segIdx: 0 \}\)/.test(C);
  ok(gate && pos, '⑥ 켬이면 다시 떠나는 자리 = 옛 길 끝 · 끔이면 종전 장부 자리(`body._t661.L`) — 한 식 두 갈래');
  const i0 = C.indexOf("const rr2 = _t1026Door('reroute', () => getRouteResumable(oldToVil, newToVil, _pb));")   /* ★[PM land1034] T1026 꼬리표(값 무변) */, i1 = C.indexOf('if (_t762End && body._t661.L < body._t661.path.len) { _t661Stamp(body, body._t661.L, body._t661.path.len); body._t661.L = body._t661.path.len; }'), i2 = C.indexOf('setBodyPts(body, pts);', i1);
  ok(i0 > 0 && i1 > i0 && i2 > i1, '⑥ 남은 구간 답압은 길이 다 파인 뒤(`retry` 갈래 뒤) · 몸 길을 바꾸기 앞 — 재진입해도 두 번 안 찍는다', `${i0} < ${i1} < ${i2}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
