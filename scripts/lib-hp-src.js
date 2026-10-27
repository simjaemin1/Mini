// === scripts/lib-hp-src.js — hp 문 소스 검사 **정본 한 벌**(하네스 둘이 같이 부른다) ==========================
//
// ⚠**검사용 라이브러리다. 하네스가 아니다**(`@regress` 없음 — 러너가 직접 안 돈다).
// ★왜 파일로 뺐나(T953 · T930 회부 2): 이 검사(`e2e-hp` ⓪ — 소스만 본다 · 1초 안)를 부르는 곳이 둘이 됐다 —
//     `scripts/e2e-hp.js`      ⓪(실클라 E2E 의 머리 · 야간 묶음 C — 사흘에 한 밤)
//     `scripts/test-hp-src.js` (브라우저 · 서버 0 · 빠른 상설 `@regress` — 몸 잇기 카드가 돌리는 묶음에도 든다)
//   검사를 두 벌 두면 사본이고, 문이 바뀔 때 한 벌만 고쳐져 조용히 갈린다(T290 `lib-routes` 와 같은 까닭).
// ★늘리는 자리: 문 하나 = `SPECS` 한 칸(무엇을 쓰는 줄을 찾나 · 문 안의 그 한 줄 · 남의 것으로 거를 곁 낱말).
//   T942(마을 NPC 몸 hp 한 곳) 뒤에는 그 문의 칸을 `SPECS` 에 더하면 두 하네스가 같이 받는다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 주석을 걷어낸 뒤 본다 — 주석에 옛 코드를 적어 두는 카드라 그대로 세면 거짓 빨강이 난다(종전 `e2e-hp` ⓪ 글자 그대로).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
}

// ★문 칸 — `lhs`: 직접 쓰는 줄 · `inDoor`: 문 안의 그 한 줄(그것만 남아야 한다) · `notMine`: 곁 낱말(앞 2 · 뒤 3 줄)이 이것이면 남의 것.
//   사람 hp — 몹·자원·건물의 hp 는 이 문 소관이 아니다. 이름만으로는 사람과 몹을 못 가르므로(`target` 은 두 곳 다 쓴다)
//   **바로 곁에 무엇을 방송하는지**로 가른다: `mob_damaged` 를 내는 줄은 몹이다(종전 `e2e-hp` ⓪ 글자 그대로).
const SPECS = {
  person: {
    name: '사람 hp', file: 'server/zone.js', door: /function setHp\(p, v, why\)/, doorName: '`setHp(p, v, why)`',
    lhs: /^\s*(?:player|target|entity|p)\.hp\s*(?:=|\+=|-=)[^=]/, inDoor: /^\s*p\.hp = next/, notMine: /mob_damaged|\.mid\b/,
  },
};

// 문 밖에서 직접 쓰는 줄 — `줄번호: 글자` 목록
function strayWrites(code, spec) {
  const lines = code.split('\n');
  const stray = [];
  lines.forEach((l, i) => {
    if (!spec.lhs.test(l)) return;
    if (spec.inDoor.test(l)) return;                                            // 문 안의 그 한 줄
    const near = lines.slice(Math.max(0, i - 2), i + 4).join(' ');
    if (spec.notMine.test(near)) return;                                        // 남의 것이다(방송이 말한다)
    stray.push(`${i + 1}: ${l.trim()}`);
  });
  return stray;
}

const readSrcs = () => {
  const rd = (...p) => { try { return fs.readFileSync(path.join(ROOT, ...p), 'utf8'); } catch (e) { return ''; } };
  return { zone: rd('server', 'zone.js'), wildlife: rd('server', 'wildlife.js'), net: rd('public', 'client', '30-n-net.js') };
};

// ★⓪ 전부 — `ok(조건, 말, 덧)` 를 부르는 쪽이 준다(하네스마다 제 셈). `srcs` 를 주면 그 글자로 잰다(미끼 판 — `test-hp-src`).
//   검사 글자 · 말은 종전 `e2e-hp` ⓪ 그대로다(옮긴 것뿐 · 뜻 무변).
function hpSourceChecks(ok, srcs) {
  const S = srcs || readSrcs();
  const code = stripComments(S.zone);
  const P = SPECS.person;
  ok(P.door.test(code), `★⓪ 전제: ${P.doorName} 가 실재한다`);
  const stray = strayWrites(code, P);
  ok(stray.length === 0, '★★⓪ 사람 hp 를 **직접 쓰는 자리가 없다**(문 하나 · 사본 0)',
     stray.length ? stray.join(' | ') : '남은 것은 `p.hp = next` 하나뿐');
  // ★자명 통과 금지 — 한 줄을 되살리면 잡는가(몹 걸러내기가 사람까지 먹지 않는다)
  {
    const probe = ['function f() {', '  player.hp = Math.max(0, player.hp - 3);', '}'];
    ok(strayWrites(probe.join('\n'), P).length === 1, '★⓪ 자명 통과 금지 — 직접 대입 한 줄을 되살리면 잡힌다');
    const mobProbe = ['  target.hp -= dmg;', '  broadcast({ type: \'mob_damaged\', mid: target.mid });'];
    ok(strayWrites(mobProbe.join('\n'), P).length === 0, '★⓪ 그리고 몹 한 줄은 **안** 잡는다(거름망이 사람만 본다)');
  }
  // ★남에게 가는 규약 — 방송하는 `why` 는 종전 넷 그대로다(늘리지도 줄이지도 않았다)
  const m = code.match(/const HP_PEER = new Set\(\[([^\]]*)\]\)/);
  const peers = m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort() : [];
  // ★[T402] `damagePlayer` 가 이제 `why` 로 출처 앞 낱말(arrow·mob·…)을 보낸다 — 전부 **종전엔 'damage'** 였던 피해다.
  //   그래서 규약 무변의 뜻은 "종전 넷 + 그 낱말들 **만**" 이다. 그 낱말은 손으로 적지 않고 **호출부에서 긁는다**.
  const srcWords = new Set([...code.matchAll(/damagePlayer\([^,]+,[^,]+,\s*[`']([a-z]+)[:`']/g)].map((x) => x[1]));
  for (const x of String(S.wildlife || '').matchAll(/damagePlayer\([^,]+,[^,]+,\s*'([a-z]+):/g)) srcWords.add(x[1]);
  const want = [...new Set(['damage', 'debug', 'dish', 'food', ...srcWords])].sort();
  ok(srcWords.size >= 5 && JSON.stringify(peers) === JSON.stringify(want),
     '★★⓪ 방송하는 갈래는 **종전 넷 + 피해 출처 낱말**뿐이다(종전에 `damage` 로 방송되던 것만 · 남의 규약 무변)',
     `${JSON.stringify(peers)} · 출처 ${[...srcWords].sort().join(',')}`);
  // ★[T131] 창구는 **하나**다 — `hp_changed` 말고 hp 전용 타입을 또 만들지 않았다.
  ok(!/type:\s*'hp_update'|type:\s*'player_damaged'/.test(code),
     '★★⓪ hp 창구는 하나(`hp_changed`) — 옛 이름도 새 타입도 없다');
  // ★클라 접점 — `hp_changed` 핸들러가 자기 hp 를 세운다(T131 개명 전 이름은 `player_damaged`)
  const net = S.net;
  ok(/msg\.type === 'hp_changed'/.test(net) && /msg\.pid === myPid.*myHp = msg\.hp/s.test(net),
     '★★⓪ 클라는 **이미** 그 메시지로 자기 hp 를 세운다(클라 접점 0)');
  ok(/typeof msg\.hp === 'number'.*myHp = msg\.hp/s.test(net),
     '★⓪ 그리고 `gauges` 의 hp 칸도 이미 읽는다(T61 — 자연 회복이 실리는 통로)');
  return { stray, peers, srcWords: [...srcWords].sort() };
}

// ★④ 조용하던 자리 — 구조 · 회복 · 다침이 문을 지난다 · 죽음의 `p.hp = 0` 사본 0(★[T964] `e2e-hp` ④ 를 옮김 · 글자 · 말 무변 · 원문 그대로 본다)
//   `setHp(.., 'rescue')` 가 자기에게 보내는 유일한 **새** 전송이다. 여기 말고는 안 늘었다.
function hpDoorCallChecks(ok, srcs) {
  const code = (srcs || readSrcs()).zone;
  ok(/setHp\(p, Math\.max\(1, Math\.round\(p\.maxHp \* hpFrac\)\), 'rescue'\)/.test(code),
     '★★④ 일어나는 자리가 문을 지난다(`rescue`)');
  ok(/setHp\(p, p\.hp \+ 2 \* dt \* 5 \* _rm, 'regen'\)/.test(code), '★★④ 자연 회복도 문을 지난다(`regen` · 조용)');
  // ★[T402] 다침의 `why` 는 이제 출처 앞 낱말(arrow·mob·…)이다 — 그 낱말들은 전부 `HP_PEER`(위 ⓪ 이 대조) ⇒ 방송 그대로.
  ok(/setHp\(p, p\.hp - dmg, String\(source \|\| 'damage'\)\.split\(':'\)\[0\]\)/.test(code),
     '★★④ 다침도 문을 지난다(`why` = 출처 앞 낱말 · 전부 방송 갈래 — T402)');
  ok(!/p\.hp = 0;/.test(code), '★★④ 죽음의 `p.hp = 0` 사본은 사라졌다(문이 하한을 누른다)');
}

module.exports = { ROOT, SPECS, stripComments, strayWrites, readSrcs, hpSourceChecks, hpDoorCallChecks };
