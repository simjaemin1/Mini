// === scripts/lib-hp-src.js — hp 문 소스 검사 **정본 한 벌**(하네스 둘이 같이 부른다) ==========================
//
// ⚠**검사용 라이브러리다. 하네스가 아니다**(`@regress` 없음 — 러너가 직접 안 돈다).
// ★왜 파일로 뺐나(T953 · T930 회부 2): 이 검사(`e2e-hp` ⓪ — 소스만 본다 · 1초 안)를 부르는 곳이 둘이 됐다 —
//     `scripts/e2e-hp.js`      ⓪(실클라 E2E 의 머리 · 야간 묶음 C — 사흘에 한 밤)
//     `scripts/test-hp-src.js` (브라우저 · 서버 0 · 빠른 상설 `@regress` — 몸 잇기 카드가 돌리는 묶음에도 든다)
//     `scripts/test-npc-hp-door.js` ⓪ ~ ④(★[T973] 마을 NPC 몸 칸 `npcSourceChecks` — 종전 그 하네스 안의 몸통을 옮겼다)
//   검사를 두 벌 두면 사본이고, 문이 바뀔 때 한 벌만 고쳐져 조용히 갈린다(T290 `lib-routes` 와 같은 까닭).
// ★늘리는 자리: 문 하나 = `SPECS` 한 칸(무엇을 쓰는 줄을 찾나 · 문 안의 그 한 줄 · 남의 것으로 거를 곁 낱말).
//   ★[T954] 짐승(존 몹) hp 문 `setMobHp` 칸 = `SPECS.mob` · 검사 = `mobSourceChecks`(이름이 사람 · 자원과 겹쳐 곁 낱말 대신 **전수** — 칸 머리 주석).
//   T942(마을 NPC 몸 hp 한 곳) 뒤에는 그 문의 칸을 `SPECS` 에 더하면 두 하네스가 같이 받는다.
//   ★[T973] 마을 NPC 몸 hp 칸 = `SPECS.npc` · 검사 = `npcSourceChecks`(종전 `test-npc-hp-door` ⓪ ~ ④ 글자 · 말 그대로 옮김 —
//     그 하네스와 `test-hp-src` ⑤ 가 같은 함수를 부른다 · 사본 0). 이로써 hp 문 셋(사람 · 짐승 · 마을 몸)의 소스 검사가 이 파일 한 벌이다.
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
  // ★[T954 2026-10-27] 짐승(존 몹 `mobs`) hp — 문 `setMobHp(m, v, why)`(zone.js · 야생은 host 로 받는다 · 사본 0).
  //   몹을 가리키는 이름이 사람 · 자원과 겹친다(`target` · `best`) ⇒ 곁 낱말로 안 가르고 **전수**로 본다 — 존 소스(주석 걷음)에서 `.hp` 를
  //   쓰는 줄은 다 넷 중 하나다: 짐승 문 안 한 줄(`m.hp = v;`) · 사람 문 안 한 줄(`p.hp = next;`) · 몸이 아닌 것(자원 셋 · 건물 · 벽 셋 — `others`
  //   글자 그대로 · 수까지). 새 쓰기 줄은 그것이 무엇이든 빨강이다(문을 지나거나 · 몸이 아니면 이 표에 이름을 올린다).
  //   야생(wildlife.js) 은 존 몹 그림자(`sh`)만 몸이다 — 랩 몹 · 랩 프록시(`lm` · `pr` · 랩 블록의 한 줄 코드)는 판 소유라 안 본다(T954 ③).
  mob: {
    name: '짐승 hp', file: 'server/zone.js', door: /function setMobHp\(m, v, why\)/, doorName: '`setMobHp(m, v, why)`',
    write: /(?:^|[^\w$.])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*\.hp\s*(?:\+\+|--|\+=|-=|=(?!=))/,
    inDoor: 'm.hp = v;', personDoor: 'p.hp = next;',
    others: {
      'if (!(r.hp > 0) || r.hp > r.maxHp) r.hp = r.maxHp;': 1,             // 자원 — 다시 자란 그루(T340 · 재생)
      'r.hp -= 1;': 1,                                                     // 자원 — NPC 채집
      'best.hp -= dmg;': 1,                                                // 자원 — 사람 채집(tryGather)
      'best.data.hp = Math.min(maxHp, (best.data.hp || 0) + 25);': 1,      // 건물 — 고치기
      'bestWall.data.hp = (bestWall.data.hp ?? maxHp) - atk;': 1,          // 벽 — 부수기
      'bestWall.data.hp = 0;': 1,                                          // 벽 — 무너짐
    },
    wildWrite: /(?:^|[^\w$.])sh\.hp\s*(?:\+\+|--|\+=|-=|=(?!=))/, wildCall: /\bH\.setMobHp\(sh, /,
    loud: ['arrow', 'feed', 'npc', 'player'], keep: ['feed', 'npc', 'player'], whys: ['arrow', 'feed', 'npc', 'player'], wildWhy: 'wild',
  },
  // ★[T973 · T942 칸 옮김] 마을 NPC 몸 hp — 마을 층(`server/villages.js`)은 존의 사람 문 `setHp`(deps)를 넘김 한 줄(`fwd`)로 부른다(사본 0).
  //   남는 `.hp` 쓰기는 전투 단위(`unit` — 몸이 아니라 판의 칸 · `gu.bu` · 교전 `ctx.units`)뿐이어야 한다. 부르는 자리 `calls` · 낱말 `whys`.
  //   주석 걷기는 `stripLineFirst`(줄 주석 먼저 — 아래 까닭) · 글자는 종전 `test-npc-hp-door` 그대로.
  npc: {
    name: '마을 NPC 몸 hp', file: 'server/villages.js', door: /\nfunction setHp\(p, v, why\) \{/, doorName: '`setHp(p, v, why)`',
    fwd: 'function _setHp(p, v, why) { return state.deps.setHp(p, v, why); }',
    unit: ['bu', 'A[i]'], calls: 9, whys: ['captive', 'died', 'regen', 'release', 'restore', 'starve', 'war'],
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
  return { zone: rd('server', 'zone.js'), wildlife: rd('server', 'wildlife.js'), net: rd('public', 'client', '30-n-net.js'), villages: rd('server', 'villages.js') };
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

// ★[T954] 존 소스의 `.hp` 쓰기 전수 — 줄마다 넷 중 하나(짐승 문 · 사람 문 · 몸 아닌 것 표 · 그 밖 = 문 밖 쓰기)
function hpWriteCensus(code, spec) {
  const M = spec || SPECS.mob;
  const out = { door: 0, person: 0, others: {}, stray: [] };
  code.split('\n').forEach((l, i) => {
    if (!M.write.test(l)) return;
    const t = l.trim();
    if (t === M.inDoor) out.door++;
    else if (t === M.personDoor) out.person++;
    else if (Object.prototype.hasOwnProperty.call(M.others, t)) out.others[t] = (out.others[t] || 0) + 1;
    else out.stray.push(`${i + 1}: ${t.slice(0, 140)}`);
  });
  return out;
}
const setWords = (code, name) => { const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(code); return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort() : null; };
// ★[T954] 짐승 hp — `ok(조건, 말, 덧)` 를 부르는 쪽이 준다 · `srcs` 를 주면 그 글자로 잰다(미끼 판)
function mobSourceChecks(ok, srcs) {
  const S = srcs || readSrcs();
  const M = SPECS.mob, code = stripComments(S.zone), wcode = stripComments(S.wildlife || '');
  ok(M.door.test(code), `★⓪ 전제: ${M.doorName} 가 실재한다`);
  const C = hpWriteCensus(code, M);
  const othersOk = Object.keys(M.others).every((k) => (C.others[k] || 0) === M.others[k]);
  ok(C.stray.length === 0 && C.door === 1 && C.person === 1 && othersOk,
    '★★짐승 hp 를 **문 밖에서 쓰는 자리가 없다** — 존 소스의 `.hp` 쓰기는 문 안 둘(짐승 `m.hp = v` · 사람 `p.hp = next`) + 몸 아닌 것(자원 셋 · 건물 · 벽 셋)뿐',
    C.stray.length ? C.stray.join(' | ') : `문 ${C.door} · 사람 문 ${C.person} · 몸 아닌 것 ${Object.values(C.others).reduce((a, b) => a + b, 0)}/${Object.keys(M.others).length}${othersOk ? '' : ' — 표와 수가 다르다 ' + JSON.stringify(C.others)}`);
  const ws = []; wcode.split('\n').forEach((l, i) => { if (M.wildWrite.test(l)) ws.push(`${i + 1}: ${l.trim().slice(0, 140)}`); });
  ok(ws.length === 0 && M.wildCall.test(wcode), '★★야생 — 존 몹 그림자(`sh`) hp 는 host 의 그 문으로만 쓴다(직접 쓰기 0 · 랩 몹 · 프록시는 판 소유라 안 본다)',
    ws.length ? ws.join(' | ') : (M.wildCall.test(wcode) ? '그림자 쓰기 0 · `H.setMobHp(sh, …)` 1' : '`H.setMobHp(sh, …)` 없음'));
  const loud = setWords(code, 'MOB_HP_LOUD'), keep = setWords(code, 'MOB_HP_KEEP');
  ok(JSON.stringify(loud) === JSON.stringify(M.loud) && JSON.stringify(keep) === JSON.stringify(M.keep),
    '★짐승 문의 낱말 표 — 방송(`mob_damaged`) 넷 · 저장 표(`dirty`) 셋 = 종전 자리마다 하던 그대로(늘리지도 줄이지도 않았다)', `방송 ${JSON.stringify(loud)} · 저장 표 ${JSON.stringify(keep)}`);
  const calls = [...code.matchAll(/(?<!function )\bsetMobHp\(\s*[A-Za-z_$][\w$]*\s*,[^\n]*?,\s*'([a-z]+)'\s*\)/g)].map((x) => x[1]).sort();
  const wcalls = [...wcode.matchAll(/\bH\.setMobHp\(\s*sh\s*,[^\n]*?,\s*'([a-z]+)'\s*\)/g)].map((x) => x[1]);
  ok(JSON.stringify(calls) === JSON.stringify(M.whys) && JSON.stringify(wcalls) === JSON.stringify([M.wildWhy]),
    '★짐승 문을 부르는 자리 다섯 — 존 넷(낱말마다 하나) · 야생 하나(조용한 `wild`)', `존 ${calls.join(' · ')} · 야생 ${wcalls.join(' · ')}`);
  return { census: C, wild: ws, calls, wcalls, loud, keep };
}

// ── ★[T973] 마을 NPC 몸 hp(T942 문) — 종전 `test-npc-hp-door` ⓪ ~ ④ 를 글자 · 말 그대로 옮김(그 하네스는 이 함수를 부르고 ⑤ 실행만 제 것) ──
// 주석을 걷는다(주석에 옛 줄을 적어 두는 카드라 그대로 세면 거짓 빨강). ⚠줄 주석을 **먼저** 걷는다 — 이 파일엔 `// … sim/* …` 줄이 있어
//   블록 주석부터 걷으면 그 `/*` 가 거짓 블록을 열어 코드 수천 줄을 삼킨다(e2e-hp ⓪ 의 차례는 zone.js 에선 무해 · 여기선 아니다). 블록은 줄바꿈만 남겨 줄 번호를 지킨다.
const stripLineFirst = (src) => src.split('\n').map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
// 몸 hp 를 직접 쓰는 자리 — `X.hp =` · `+=` · `-=` · `X['hp'] =` 중 전투 단위가 아닌 것
function npcStrays(src, spec) {
  const UNIT = new Set((spec || SPECS.npc).unit);   // 전투 단위(몸이 아니라 판의 칸 — `gu.bu` · 교전 `ctx.units`)
  const code = stripLineFirst(src), out = [], units = [];
  code.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/([A-Za-z_$][\w$]*(?:\[[^\]]+\])?)\s*(?:\.hp|\[\s*['"]hp['"]\s*\])\s*(?:=|\+=|-=)(?!=)/g)) {
      (UNIT.has(m[1]) ? units : out).push(`${i + 1}: ${l.trim().slice(0, 120)}`);
    }
  });
  return { out, units };
}
const npcDoorCalls = (src) => [...stripLineFirst(src).matchAll(/(?<!function )\b_setHp\(\s*([A-Za-z_$][\w$]*)\s*,[^\n]*?,\s*'([a-z]+)'\s*\)\s*;/g)].map((m) => ({ who: m[1], why: m[2] }));
const setOf = (src, name) => { const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(src); return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : null; };

// ★⓪ ~ ④ — `ok(조건, 말, 덧)` 를 부르는 쪽이 준다 · `srcs`(zone · villages)를 주면 그 글자로 잰다(미끼 판 — `test-hp-src` ⑤).
//   `head` 를 주면 절 머리를 그것으로 찍는다(`test-npc-hp-door` 는 `console.log` — 종전 출력 그대로).
function npcSourceChecks(ok, srcs, head) {
  const S = srcs || readSrcs(), ZSRC = S.zone, VSRC = S.villages, H = head || (() => {});
  const N = SPECS.npc, FWD = N.fwd, WANT = N.whys, strays = (src) => npcStrays(src, N);
  H('\n⓪ 전제');
  ok(N.door.test(ZSRC), '★⓪ 존의 문 `setHp(p, v, why)` 가 실재한다');
  ok(VSRC.split(FWD).length === 2 && (VSRC.match(/\bfunction _setHp\(/g) || []).length === 1,
    '★⓪ 마을의 넘김은 한 줄 — deps 의 문을 **그대로** 부른다(값 · 깎기 · 알림을 마을이 따로 갖지 않는다 · 사본 0)');
  ok(!/\bconst HP_(PEER|QUIET)\b/.test(VSRC) && !/\bfunction setHp\(/.test(VSRC), '★⓪ 마을 층에 문 사본 0(낱말 표 · 깎기 함수가 없다)');

  H('\n① 소스 — 마을 층에서 몸 hp 를 직접 쓰는 자리');
  const S0 = strays(VSRC);
  ok(S0.out.length === 0, '★★① 마을 몸 hp 를 **직접 쓰는 자리가 없다**(문 하나 · 사본 0)', S0.out.length ? S0.out.join(' | ') : `남은 \`.hp\` 쓰기 ${S0.units.length}줄은 전투 단위뿐`);
  ok(S0.units.length >= 1, '★① 전투 단위 줄은 남아 있다(판의 칸 — 걸러내기가 실제로 무는 대상이 있다)', S0.units.map((u) => u.split(':')[0]).join(' · '));

  H('\n② 자명 통과 금지');
  {
    const back = VSRC.replace("_setHp(p, 0, 'died');", 'p.hp = 0;');
    ok(back !== VSRC && strays(back).out.length === 1, '★② 옛 직접 대입 한 줄(줄어드는 몸의 그 자리 죽음 `p.hp = 0`)을 되살린 사본은 잡힌다', strays(back).out.join(' | '));
    const body2 = VSRC.replace(FWD, FWD + '\nfunction _t942Bait(b) { b.hp += 5; b[\'hp\'] = 1; }');
    ok(strays(body2).out.length === 2, '★② `+=` · `[\'hp\']` 꼴도 잡힌다');
    const unit2 = VSRC.replace(FWD, FWD + '\nfunction _t942Bait(bu) { bu.hp = 1; }');
    ok(strays(unit2).out.length === 0 && strays(unit2).units.length === S0.units.length + 1, '★② 그리고 전투 단위 줄은 **안** 잡는다(거름망이 몸만 본다)');
  }

  H('\n③ 문을 부르는 자리');
  const PEER = setOf(ZSRC, 'HP_PEER'), QUIET = setOf(ZSRC, 'HP_QUIET');
  const calls = npcDoorCalls(VSRC), whys = [...new Set(calls.map((c) => c.why))].sort();
  ok(calls.length === N.calls, '★③ 문을 부르는 자리 아홉(요양 · 전쟁 거울 · 포로 · 풀림 · 원정 굶음 둘 · 원정 굶어 죽음 · 그 자리 죽음 · 다시 뜬 판 복원)', `${calls.length} — ${calls.map((c) => c.why).join(' · ')}`);
  ok(JSON.stringify(whys) === JSON.stringify(WANT), '★③ 낱말 일곱 — 자리마다 그 일의 이름', whys.join(' · '));
  ok(!!PEER && PEER.length > 0 && whys.every((w) => !PEER.includes(w)), '★★③ 방송 낱말(`HP_PEER`)과 겹침 0 — 마을 몸 hp 는 방송되지 않는다(종전 그대로)', PEER ? `HP_PEER ${PEER.join(',')}` : '표 못 읽음');
  ok(!!QUIET && QUIET.includes('regen'), '★③ 요양 회복은 조용한 낱말(`regen` — 사람 자연 회복과 같은 뜻 · 같은 낱말)');

  H('\n④ 존 배선 — 문을 넘긴다 · 표는 init 보다 먼저');
  const initAt = (s) => s.indexOf('\nSimVillages.init({');
  const initTxt = (() => { const a = initAt(ZSRC); const b = ZSRC.indexOf('});', a); return a >= 0 && b > a ? ZSRC.slice(a, b) : ''; })();
  ok(/\n  setHp,\n/.test(initTxt), '★④ `SimVillages.init` 의 deps 가 존의 문 `setHp` 를 넘긴다');
  const orderOk = (s) => { const i = initAt(s), p = s.indexOf('\nconst HP_PEER = '), q = s.indexOf('\nconst HP_QUIET = '), mx = s.indexOf('\nconst PLAYER_MAX_HP = '); return i > 0 && p > mx && q > mx && p < i && q < i; };
  ok(orderOk(ZSRC), '★★④ 낱말 표 둘이 `SimVillages.init(...)` 보다 위 — init 안에서 도는 몸 복원(T747)이 문을 불러도 TDZ 0');
  {
    const lines = ZSRC.split('\n'), pl = lines.find((l) => l.startsWith('const HP_PEER = ')), ql = lines.find((l) => l.startsWith('const HP_QUIET = '));
    const late = ZSRC.replace('\n' + pl + '\n' + ql + '\n', '\n').replace('\nfunction setHp(p, v, why) {', '\n' + pl + '\n' + ql + '\nfunction setHp(p, v, why) {');
    ok(late !== ZSRC && !orderOk(late), '★④ 미끼 — 표를 문 곁(init 아래)으로 되돌린 사본은 잡힌다');
  }
  return { strays: S0, calls, whys, PEER, QUIET };
}

module.exports = { ROOT, SPECS, stripComments, strayWrites, readSrcs, hpSourceChecks, hpDoorCallChecks, hpWriteCensus, mobSourceChecks,
  stripLineFirst, npcStrays, npcDoorCalls, setOf, npcSourceChecks };
