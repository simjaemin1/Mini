#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-save-race.js — 몸 저장 길의 **차례(경합)** 상설 회귀(T927 + T940 · T940 ③) ==========================
//
// ★왜: 몸 소실 결함 넷(T868 · T890 · T894→T916 · T927)과 T940 은 모두 "저장이 엉뚱한 값으로 행을 덮거나 · 옛 행에서 시작함"이었고, 그 차례는
//   실서버 두 존 + central + 지연 주입(탐침 프록시)으로만 보인다. 탐침 둘은 러너 밖이라 다음 고침이 그 길을 다시 열어도 아무도 모른다 —
//   이 하네스가 두 탐침을 **켬 · 끔 증인**으로 한 판씩 돌려 숫자로 판정한다(탐침 글자 그대로 · 사본 0 · 판정은 여기).
//   · T927 `t927-save-race-probe` — 넘기는 중 출발 존의 늦게 닿은 옛 저장이 도착 존 새 저장을 덮나(token · promote · calm)
//   · T940 `t940-stale-read-probe` — 존 A 에서 끊고 곧바로 존 B 로 붙으면 B 가 A 의 마지막 저장을 받나(race · calm · live)
//   T916(central 이 없는 동안 로그아웃 — 줄에 남겨 다시 보내기)은 `test-handoff-body` ⑧(U 켬 · V 끔)이 이미 러너에 있다 — 여기선 안 겹쳐 돈다.
//
// ★켬 판은 칸 같음 n/n · 끔 판은 결함이 **보여야** 한다(끔 증인 — 켬의 "같다"가 자명하지 않다는 증인). calm(늦춤 0) T927 은 이 자가 "같다"를 말할 줄 아는 대조다.
//   T940 끔 calm 은 판마다 갈려(보통 망에서 1~3 ms 차 경합) 정보로만 센다.
//
// 실행: node scripts/test-save-race.js   (약 4분 · 포트 3010 · 3011 · 3012 · 3020 · 3021)
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const J = (x) => JSON.stringify(x === undefined ? null : x);

function probe(file, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', file), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 1500 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const out = String(r.stdout || '');
  const i = out.lastIndexOf('== JSON ==');
  let j = null; if (i >= 0) { try { j = JSON.parse(out.slice(i + 10).trim().split('\n')[0]); } catch (e) { j = null; } }
  if (!j) console.log(`  · ${file} ${args.join(' ')} 출력 끝:\n${(out + String(r.stderr || '')).split('\n').slice(-8).map((l) => '      ' + l).join('\n')}`);
  return { rc: r.status, j };
}

console.log('\n=== 몸 저장 길의 차례(경합) — T927 늦게 닿은 옛 저장 · T940 옛 행 읽기 (2존 실서버 + 지연 주입) ===');

console.log('\n① T927 — 넘기는 중 출발 존의 늦게 닿은 옛 저장(켬 기본 `T927_BODY_VER`)');
{
  const on = probe('t927-save-race-probe.js', ['1']), off = probe('t927-save-race-probe.js', ['1', 'token,promote,calm', '--off']);
  const S = (on.j || {}).sum || {}, F = (off.j || {}).sum || {};
  const n = (x) => (x && x.n) || 0;
  ok(on.rc === 0 && off.rc === 0 && n(S.token) === 1 && n(S.promote) === 1 && n(S.calm) === 1 && n(F.token) === 1 && n(F.promote) === 1,
    '[상황] 켬 · 끔 판 다 넘겼고 늦춘 저장이 도착 존 저장 **뒤에** 닿았다(token · promote — 아니면 차례를 못 잰 판) · calm 대조 한 판', `켬 ${J(S && Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.n])))} · 끔 ${J(F && Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.n])))}`);
  ok(n(S.token) >= 1 && S.token.same === S.token.n && n(S.promote) >= 1 && S.promote.same === S.promote.n,
    '★★① [T927 켬] 늦게 닿은 옛 저장을 central 이 안 쓴다 — 행 = 도착 존 몸(kg 원장 · 도구 · 로트 · `last_zone`) · 토큰 · 승격 둘 다', `토큰 ${S.token && S.token.same}/${n(S.token)} · 승격 ${S.promote && S.promote.same}/${n(S.promote)}`);
  ok(S.calm && S.calm.same === S.calm.n && F.calm && F.calm.same === F.calm.n, '① [대조] 늦춤 0 판은 켬 · 끔 다 같다(이 자가 "같다"를 말할 줄 안다)', `켬 ${S.calm && S.calm.same} · 끔 ${F.calm && F.calm.same}`);
  ok(n(F.token) >= 1 && F.token.same === 0 && n(F.promote) >= 1 && F.promote.same === 0,
    '① [T927 끔 증인] 끔이면 늦게 닿은 옛 저장이 행을 넘기기 전으로 되돌린다(켬의 "같다"가 자명하지 않다)', `토큰 ${F.token && F.token.same}/${n(F.token)} · 승격 ${F.promote && F.promote.same}/${n(F.promote)}`);
}

console.log('\n② T940 — 존 A 에서 끊고 곧바로 존 B 로 붙는다(켬 기본 `T940_LOGIN_FLUSH`)');
{
  const on = probe('t940-stale-read-probe.js', ['1', 'race,calm,live']), off = probe('t940-stale-read-probe.js', ['1', 'race,calm', '--off']);
  const S = (on.j || {}).sum || {}, F = (off.j || {}).sum || {};
  const n = (x) => (x && x.n) || 0;
  ok(on.rc === 0 && off.rc === 0 && n(S.race) === 1 && n(S.calm) === 1 && n(S.live) === 1 && n(F.race) === 1,
    '[상황] 판마다 A 산 몸만 숙련 · 어획 기록을 가졌고 행은 아직 몰랐다(닫힐 때 저장이 유일한 길) · 같은 사람으로 B 에 붙었다', `켬 race ${n(S.race)} · calm ${n(S.calm)} · live ${n(S.live)} · 끔 race ${n(F.race)}`);
  ok(S.race && S.race.bGotA === 1 && S.race.kept === 1 && S.calm && S.calm.bGotA === 1 && S.calm.kept === 1,
    '★★② [T940 켬] B 는 A 의 마지막 저장이 닿은 뒤 행을 읽는다 — B 산 몸이 A 의 마지막 칸을 가졌고 B 를 닫은 뒤 행도(영구 소실 0) · A 저장 3초 늦춤 · 늦춤 0 둘 다',
    `race B ${S.race && S.race.bGotA} · 행 ${S.race && S.race.kept} · calm B ${S.calm && S.calm.bGotA} · 행 ${S.calm && S.calm.kept} · race 접속 ${J(S.race && S.race.joinMs)}ms`);
  ok(S.live && S.live.aKicked === 1 && S.live.bGotA === 1 && S.live.kept === 1,
    '② [T940 켬] A 에 아직 붙어 있는 몸 — A 가 지금 저장하고 그 세션을 내린다 · B 가 그 몸을 받는다 · 행도', `A 내려짐 ${S.live && S.live.aKicked} · B ${S.live && S.live.bGotA} · 행 ${S.live && S.live.kept}`);
  ok(n(F.race) === 1 && F.race.bGotA === 0 && F.race.lost === 1,
    '② [T940 끔 증인] 끔이면 B 가 옛 행으로 태어나 A 의 마지막 칸이 영구로 사라진다(켬의 "받는다"가 자명하지 않다)', `B ${F.race && F.race.bGotA} · 잃음 ${F.race && F.race.lost}`);
  if (F.calm) console.log(`  · [정보 · T940 끔] 늦춤 0 판 — B 가 A 칸 받음 ${F.calm.bGotA}/${n(F.calm)} · 잃음 ${F.calm.lost} · 여유 ${J(F.calm.marginMs)}ms(보통 망에서도 1~3 ms 차로 갈린다)`);
}

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
