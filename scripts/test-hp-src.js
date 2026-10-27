#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-hp-src.js — hp 를 쓰는 문이 하나다(소스만 · 브라우저 · 서버 0 · 1초 안) ==========================
//
// ★왜(T953 · T930 회부 2): `e2e-hp` ⓪(소스만 보는 절)이 야간 묶음 C(사흘에 한 밤)에만 있어, 몸 잇기 카드(T868 · T873 · T890)가 돌린
//   묶음엔 없었다 — 그 사이 맞선 계약(문 밖에서 hp 를 직접 쓰는 줄)이 사흘 동안 초록으로 섰다.
//   ⇒ 같은 검사를 브라우저 없이 상설 러너에 세운다. 검사 몸통은 `scripts/lib-hp-src.js` **한 벌**이고 `e2e-hp` ⓪ 도 그것을 부른다(사본 0).
// ★자명 통과 금지: 같은 함수를 **미끼 소스**에도 돌린다 — 진짜 `server/zone.js` 에 직접 대입 한 줄을 되살린 사본은 잡혀야 하고(빨강 하나 ·
//   잡힌 줄이 그 줄), 몹 한 줄(`mob_damaged` 를 방송하는 곁)을 끼운 사본은 안 잡혀야 한다(거름망이 사람만 본다).
// ★늘리기: 문이 하나 더 생기면(T942 마을 NPC 몸 hp) `lib-hp-src.js` `SPECS` 에 칸을 더하고 여기 같은 꼴 절 하나 — 그 칸의 미끼도 같이.
//
// 실행: node scripts/test-hp-src.js
'use strict';
const L = require('./lib-hp-src');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

console.log('\n=== hp 를 쓰는 문이 하나다 — 소스만(e2e-hp ⓪ 와 같은 함수) ===');
console.log('\n⓪ 진짜 소스');
const real = L.readSrcs();
ok(real.zone.length > 100000 && real.net.length > 1000 && real.wildlife.length > 1000, '[상황] 세 파일을 실제로 읽었다(못 읽으면 아래가 자명 통과다)',
  `zone ${real.zone.length} · net ${real.net.length} · wildlife ${real.wildlife.length}`);
L.hpSourceChecks(ok, real);

// ── 미끼 — 같은 함수를 고친 사본에 돌린다(빨강은 세기만 · 이 하네스의 통과로 안 센다) ──
const quiet = () => { const bad = []; return { bad, ok: (c, m) => { if (!c) bad.push(m); } }; };
const ANCHOR = 'function _hpRegenStep(p, act) {';
console.log('\n① 미끼 — 직접 대입 한 줄을 되살린 사본은 잡힌다 · 몹 한 줄은 안 잡힌다');
ok(real.zone.split(ANCHOR).length === 2, `[상황] 미끼를 끼울 자리(\`${ANCHOR}\`)가 진짜 소스에 한 번 있다`);
{
  const LINE = '  p.hp = Math.min(p.maxHp, p.hp + 1);';
  const decoy = Object.assign({}, real, { zone: real.zone.replace(ANCHOR, ANCHOR + '\n' + LINE) });
  const q = quiet(); const r = L.hpSourceChecks(q.ok, decoy);
  ok(q.bad.length === 1 && /직접 쓰는 자리가 없다/.test(q.bad[0]) && r.stray.length === 1 && r.stray[0].endsWith(LINE.trim()),
    '★★① 문 밖 직접 대입 한 줄(`p.hp = …` · 회복 걸음에 되살림)은 잡힌다 — 빨강 하나 · 잡힌 줄이 그 줄', `빨강 ${q.bad.length} · ${r.stray.join(' | ')}`);
}
{
  const LINE2 = '  player.hp -= 3;';
  const decoy = Object.assign({}, real, { zone: real.zone.replace(ANCHOR, ANCHOR + '\n' + LINE2) });
  const q = quiet(); const r = L.hpSourceChecks(q.ok, decoy);
  ok(q.bad.length === 1 && r.stray.length === 1, '① 다른 꼴(`player.hp -= …`)도 잡힌다', `빨강 ${q.bad.length}`);
}
{
  const MOB = ['  target.hp -= dmg;', '  broadcast({ type: \'mob_damaged\', mid: target.mid });'].join('\n');
  const decoy = Object.assign({}, real, { zone: real.zone.replace(ANCHOR, ANCHOR + '\n' + MOB) });
  const q = quiet(); L.hpSourceChecks(q.ok, decoy);
  ok(q.bad.length === 0, '① 몹 한 줄(곁에 `mob_damaged`)을 끼운 사본은 안 잡힌다(거름망이 사람만 본다)', `빨강 ${q.bad.length}`);
}
{
  const decoy = Object.assign({}, real, { zone: real.zone.replace(ANCHOR, '// ' + ANCHOR.replace('{', '') + '\n' + ANCHOR + '\n  // p.hp = 0;   옛 줄(주석)') });
  const q = quiet(); L.hpSourceChecks(q.ok, decoy);
  ok(q.bad.length === 0, '① 주석에 적은 옛 줄은 안 잡힌다(주석을 걷어낸 뒤 본다 — 거짓 빨강 0)', `빨강 ${q.bad.length}`);
}

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
