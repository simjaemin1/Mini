// === scripts/lib-e2e-src.js — e2e 의 **소스만 보는 절** 정본 한 벌(e2e 와 빠른 상설 `test-e2e-src` 가 같이 부른다) ==================
//
// ⚠**검사용 라이브러리다. 하네스가 아니다**(`@regress` 없음 — 러너가 직접 안 돈다).
// ★왜(T964 · T953 회부): 소스만 보는 절이 야간 묶음(사흘에 한 밤)의 e2e 안에만 있으면 그 계약이 사흘 초록으로 선다(T930 · T953).
//   ⇒ 절 몸통을 여기 한 벌로 옮기고, 원래 e2e 는 제 절을 부르고(사본 0 · 글자 · 말 무변) `scripts/test-e2e-src.js`(`@regress` · 서버 · 브라우저 0)가
//     같은 함수를 진짜 소스 · 미끼 사본에 돌린다. hp 문은 `lib-hp-src.js`(T953 — 같은 꼴 · 따로 둔 까닭: 문 칸 `SPECS` 이 늘어날 자리).
// ★절 = `SECTIONS.<이름>(ok, S)` — `ok(조건, 말, 덧)` 은 부르는 쪽 셈 · `S(상대 경로)` 는 원문(주면 그 글자로 · 안 주면 디스크 — 미끼 판이 바꿔 끼운다).
//   옮기면서 바꾼 것은 원문 읽는 꼴뿐이다: `fs.readFileSync(path.join(ROOT, 'a', 'b'), 'utf8')` → `S('a/b')`.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 원문 — 같은 판에서 한 번만 읽는다(못 읽으면 빈 글자 · 절의 "실제로 읽었다" 줄이 빨개진다)
function reader(over) {
  const cache = new Map();
  return (rel) => {
    if (over && Object.prototype.hasOwnProperty.call(over, rel)) return over[rel];
    if (!cache.has(rel)) { let t = ''; try { t = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { t = ''; } cache.set(rel, t); }
    return cache.get(rel);
  };
}
const SECTIONS = {};

// ── guild — `e2e-guild` ⑥ 소스 — 표 하나·컬럼 둘 · 사람이 쓴 문장은 그리는 쪽이 막는다(야간 A)
SECTIONS.guild = function (ok, S) {
  S = S || reader();
  const cen = S('server/central.js');
  const lob = S('public/client/70-lobby.js');
  const nt = S('server/notice.js');
  const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다
  ok((cen.match(/CREATE TABLE IF NOT EXISTS tribe_invites/g) || []).length === 1, '⑥ central 에 새 표는 **하나**다');
  //   ⚠`codeOnly` 를 안 쓴다 — 블록 주석 지우개가 문자열 안의 `/*` 를 만나면 그 뒤를 통째로 먹는다
  //     (초안이 그래서 0건을 봤다). 여기서 세는 것은 **SQL 문**이라 원문 그대로가 맞다.
  const added = (cen.match(/ALTER TABLE tribes ADD COLUMN (\w+)/g) || []).map((x) => x.split(' ').pop());
  ok(added.includes('join_mode') && added.includes('intro'), '⑥b 새 컬럼 **둘**이 있다', added.join(' '));
  //   ★[T159 2026-09-07] 일곱 → **여덟**. `granary_open` 하나를 더했다. 이 줄은 손으로 세는 자리라
  //     늘 때마다 고쳐야 하고, **고치는 그 행위가 곧 "컬럼을 늘렸다"는 자백**이다(그게 이 검사의 뜻이다).
  ok(added.length === 8, '⑥b2 ★`tribes` 의 컬럼 증설은 **여덟**이다(T128 일곱 + T159 하나) — 하나 더 늘면 여기가 빨개진다', added.length);
  ok(/onbEsc\(v\.intro\)/.test(lob), '⑥c ★사람이 쓴 문장은 **그리는 쪽이 막는다**(꺾쇠 이스케이프)');
  ok(!/slice\(0, ?60\)|substring\(0, ?60\)/.test(codeOnly(lob)), '⑥d ★길이 상한을 로비가 **다시 자르지 않는다**(사본 0)');
  ok(/'guild'/.test(codeOnly(nt)) && (codeOnly(nt).match(/KINDS = \[/g) || []).length === 1, '⑥e 알림 종류 표는 **하나**이고 거기에 `guild` 가 있다');
  ok(cen.length > 1000 && lob.length > 1000 && nt.length > 500, '⑥f (자명 통과 방지) 세 파일을 실제로 읽었다');
  // ★[T139] 알림함이 **아무것도 안 늘렸다** — 표도 컬럼도(⑥b2 가 컬럼을, 여기서 표를 센다).
  const tables = (cen.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || []).map((x) => x.split(' ').pop());
  ok(tables.length >= 5 && new Set(tables).size === tables.length,
     '⑥g 전제: central 의 표를 실제로 세었다(중복 0)', `${tables.length}개: ${tables.join(' ')}`);
  ok(!tables.some((t2) => /inbox|pending|call/i.test(t2)),
     '★⑥g2 부름 알림함은 **새 표를 안 만들었다** — 있는 두 표를 읽기만 한다', tables.join(' '));
  // ★접는 수를 zone 이 **손으로 안 적었다** — 정본에서 읽는다
  const zn = S('server/zone.js');
  const hook = zn.slice(zn.indexOf('Friends.pendingLines'), zn.indexOf('Friends.pendingLines') + 1200);
  ok(hook.length > 200, '⑥h 전제: welcome 훅을 실제로 찾았다(못 찾으면 아래가 자명 통과다)', hook.length);
  ok(/Notice\.NOTICE_MAX/.test(hook), '★★⑥h2 접는 수는 **정본에서 읽는다**(`Notice.NOTICE_MAX` · 새 수 0)');
  ok(!/[^\w.]3[^\w]/.test(hook.replace(/\/\/.*$/gm, '')), '⑥h3 ★그 훅에 **수 3이 손으로 적혀 있지 않다**');
  // ★"○○이 청했다"·"[△△]이 부른다" 문장은 **한 자리**다 — 그 자리에서 하는 말과 밀린 말이 같아야 한다
  const fj = codeOnly(S('server/friends.js'));
  const gj = codeOnly(S('server/guild.js'));
  //   ⚠**받는 쪽 문장**만 센다. 청한 쪽에게 하는 말("…에게 벗이 되자고 청했다")은 다른 문장이라
  //     그것까지 세면 초록이 될 길이 없다(초안이 여기서 2를 봤다).
  ok((fj.match(/님이 벗이 되자고 청했습니다/g) || []).length === 1, '★⑥i 친구 청함 문장은 **한 자리**다(`askedLine`)',
     (fj.match(/님이 벗이 되자고 청했습니다/g) || []).length);
  ok((gj.match(/당신을 부릅니다/g) || []).length === 1, '★⑥i2 길드 부름 문장도 **한 자리**다(`calledLine`)',
     (gj.match(/당신을 부릅니다/g) || []).length);
};

// ── friends — `e2e-friends` ⑦ 소스 — 1비트가 낱말이 되고, 로비는 다시 세지 않는다(야간 B)
SECTIONS.friends = function (ok, S) {
  S = S || reader();
  const rl = S('public/client/34-m-renderloop.js');
  const net = S('public/client/30-n-net.js');
  const lob = S('public/client/70-lobby.js');
  const cen = S('server/central.js');
  ok(/o\.fr \? '벗 ' :/.test(rl), '⑦ 이름표 — 서버 1비트가 **낱말 하나**가 된다');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test((rl.match(/o\.fr \? [^\n]*/) || [''])[0]), '⑦b 그 낱말에 이모지가 **없다**(화면 규칙 B)');
  ok(/fr: pp\.fr !== undefined \? pp\.fr : prev\?\.fr/.test(net), '⑦c 클라는 `fr` 을 **받아서 승계**할 뿐 스스로 안 정한다');
  //   ★주석은 걷어내고 본다 — 설명문이 증거로 오독되면 하네스가 없는 결함을 보고한다(족보 ㊻).
  const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다
  ok(!/isFriend\(|friendsOf\(|friendRequest\(/.test(codeOnly(rl) + codeOnly(net) + codeOnly(lob)),
    '⑦d ★★클라에 친구 **판정이 없다** — 누가 누구와 친구인지 클라는 모른다');
  ok(/v\.friendsHere/.test(lob) && !/friendsOf|isFriend|friends\.length/.test(lob), '⑦e 로비는 서버가 센 수를 **그대로** 쓴다(재계산 0)');
  ok((cen.match(/CREATE TABLE IF NOT EXISTS friends/g) || []).length === 1, '⑦f central 에 친구 표는 **하나**다');
  ok(!/ALTER TABLE players ADD COLUMN friend/.test(cen), '⑦g 기존 표에 새 컬럼 **0**');
  // ★자명 통과 금지 — 검사가 실제로 그 파일을 읽었는지
  ok(rl.length > 1000 && lob.length > 1000 && cen.length > 1000, '⑦h (자명 통과 방지) 네 파일을 실제로 읽었다');

  // ★★[T147] 화살은 **T110 것을 그대로 부른다** — 그리는 함수도, 반경도, 걸음도, 방위도.
  const zn = S('server/zone.js');
  const znCode = codeOnly(zn);
  ok(/function drawFollowArrow\(\)/.test(rl), '⑦i 전제: 따라가기 화살 함수를 실제로 찾았다(못 찾으면 아래가 자명 통과다)');
  const fa = rl.slice(rl.indexOf('function drawFollowArrow()'), rl.indexOf('function drawDownedArrows()'));
  ok(/drawWorldArrow\(/.test(fa), '★★⑦i 따라가기 화살은 **T110 의 그리는 함수를 그대로 부른다**(사본 0)');
  ok(!/ctx\.(beginPath|moveTo|lineTo|fill)\(/.test(fa), '⑦i2 ★그 함수는 화살을 **다시 그리지 않는다**(붓질 0줄)');
  //   ★자리가 둘이라 **같이 뜬다** — 한 자리에 밀어 넣으면 외침과 따라가기가 서로를 지운다.
  ok(/__downedCries/.test(rl) && /__followTarget/.test(rl), '★★⑦j 외침과 따라가기는 **자리가 둘**이다(같이 뜬다)');
  const frame = rl.slice(rl.indexOf('__downedArrowN'), rl.indexOf('__downedArrowN') + 260);
  ok(/__followArrowN/.test(frame), '★★⑦j2 그리고 **같은 프레임에서 둘 다** 그린다', JSON.stringify(frame.split('\n')[1] || ''));
  //   ★반경·걸음·방위에 손으로 적은 수가 없다 — 전부 정본을 부른다
  const fp = znCode.slice(znCode.indexOf('function _followPayload'), znCode.indexOf('function followChat'));
  ok(fp.length > 200, '⑦k 전제: 서버 쪽 갱신 함수를 실제로 찾았다', fp.length);
  ok(/RESCUE_RANGE_PX/.test(fp) && /Rescue\.shoutRange\(\)/.test(fp) && /Rescue\.steps\(/.test(fp),
     '★★⑦k 반경 둘과 걸음이 **전부 T110/T43 정본에서 온다**');
  ok(!/[^\w.]\d{2,}[^\w]/.test(fp), '⑦k2 ★그 함수에 **손으로 적은 수가 없다**',
     JSON.stringify((fp.match(/[^\w.]\d{2,}[^\w]/g) || []).slice(0, 3)));
  //   ★따라가기가 **알림 축을 안 쓴다** — 초당 한 줄이면 `window.__notices` 규약이 더러워진다
  ok(!/type: 'notice'/.test(fp), '★★⑦l 갱신은 **알림으로 나가지 않는다**(`__notices` 규약 무변)');
  ok(/'follow' in msg/.test(net), '⑦m 클라는 `null` 을 **"거두라"로 읽는다**(`in` 검사 · `if (msg.follow)` 아님)');
  //   ★친구 판정은 여전히 서버다(⑦d 의 짝) — 이름→벗 대응도 클라에 없다
  ok(!/friendByName/.test(codeOnly(rl) + codeOnly(net) + codeOnly(lob)), '⑦n ★클라에 이름→벗 대응이 **없다**');
};

// ── events — `e2e-events` ⑤-c 판 소스 — 이모지 0 · 인라인 색 0(야간 C · T80)
SECTIONS.events = function (ok, S) {
  S = S || reader();
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => {
    let q = null, out = '';
    for (let i = 0; i < l.length; i++) {
      const c = l[i], n = l[i + 1];
      if (q) { out += c; if (c === '\\') { out += n || ''; i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
      if (c === '/' && n === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
  const EMO = /\p{Extended_Pictographic}/u;
  const COL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
  for (const f of ['public/client/47-s-board.js', 'public/client/51-s-side.js']) {
    const src = strip(S(f));
    ok(!EMO.test(src), `★★⑤-c ${f.split('/').pop()} — 이모지 0(T66)`);
    ok(!COL.test(src), `★★⑤-c ${f.split('/').pop()} — 인라인 색 0(값은 style.css 토큰 하나)`);
  }
  ok(EMO.test("h += '\u{1F6D6} 쉼터';"), '★⑤-c 자명 통과 금지 — 이모지 한 줄을 되살린 소스는 잡힌다');
  ok(COL.test("background:#2b3a4a"), '★⑤-c 자명 통과 금지 — 인라인 hex 한 줄을 되살리면 잡힌다');
};

// ── npcsprite — `e2e-npcsprite` ② 양성 갈래를 대신 거는 자 — 지게 비트 한 줄 · 깃발 정본(야간 C · T134 · T316)
SECTIONS.npcsprite = function (ok, S) {
  S = S || reader();
  const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다
  const cs = codeOnly(S('public/client/42-r2-char.js'));
  const backLines = cs.split('\n').filter((L) => /back_carrier/.test(L) || /const back = /.test(L));
  ok(/const back = isMe \? [^:]+: !!\(o && o\.carrier\);/.test(cs),
     '★★[T134] 주민과 사람이 지게를 **같은 한 줄**로 고른다 (갈래 0)', backLines.map((L) => L.trim()).join(' | ').slice(0, 160));
  const zs = codeOnly(S('server/zone.js'));
  // ★★[T316 2026-09-19] 주민의 손이 `inventory.grain_sheaf` 로 흡수되면서 이 비트의 출처가 한 자리로 모였다.
  //   전: `zone.js` 가 손(`_carry`)을 **다시 읽었다** — 비트와 `_wornAt` 도장이 두 파일에 나뉘어 있었다.
  //   후: `villages.js` 가 손을 보고 `_carryOn` 을 뒤집으며 **같은 줄에서** 도장을 찍고, zone 은 그 깃발만 탄다.
  //   ⇒ 전송 값은 동일하고(창이 열리는 순간 둘은 늘 같은 값) 읽는 자리가 하나 줄었다(사본 0).
  ok(/e\.carrier = o\.isNpc \? \(o\._carryOn \? 1 : 0\)/.test(zs),
     '★★[T134·T316] 서버가 주민의 **진 짐 깃발**(`_carryOn`)로 그 비트를 놓는다(손을 다시 읽지 않는다)');
  ok(!/o\._carry\b(?!On)/.test(zs), '★[T316] zone 에 주민 손(`_carry`)을 직접 읽는 자리가 **없다**');
  const vs = codeOnly(S('server/villages.js'));
  ok(/npc\._carryOn = on; npc\._wornAt = Date\.now\(\);/.test(vs),
     '★[T134] 0↔1 이 뒤집힌 순간에만 전송 창을 연다 (매 틱 도장 금지)');
  ok(/const on = _handOf\(npc\) > 0;/.test(vs),
     '★★[T316] 그 깃발의 근거가 **손 술어 정본**(`_handOf`)이다 — 품목 칸을 센다');
};

// ── verbs0 — `e2e-verbs` ⓪ 전제 — 새 조각이 실재한다(야간 B)
SECTIONS.verbs0 = function (ok, S) {
  S = S || reader();
  const src = S('public/client/46-h-verbs.js');
  ok(/function pickAt\(/.test(src) && /function verbsFor\(/.test(src),
     '★⓪ 전제: `pickAt`·`verbsFor` 가 그 파일에 실재한다');
  const idx = S('public/index.html');
  ok(/client\/46-h-verbs\.js/.test(idx), '★⓪ 전제: `index.html` 이 그 조각을 싣는다');
};

// ── verbs10 — `e2e-verbs` ⑩ ★[T82 ⓪] 빚 셋 — boot() 한 자리 · 진단 훅 0 · 메뉴 테두리(야간 B)
SECTIONS.verbs10 = function (ok, S) {
  S = S || reader();
  const rd = (f) => S('public/client/' + f);
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  const main = strip(rd('99-main.js')), panel = strip(rd('50-i-panel.js')), net = strip(rd('30-n-net.js'));
  ok(/^\s*boot\(\);/m.test(main), '★★⑩ `boot()` 은 **`99-main.js`** 에서 불린다(T0-b)');
  ok(!/^\s*boot\(\);/m.test(panel), '★★⑩ `50-i-panel.js` 최상위의 `boot();` 는 **없다**');
  ok(!/setTimeout\([^)]*onbLobbyInit/.test(net), '★⑩ T68 이 두었던 **임시 지연 두 줄이 사라졌다**');
  const verbs = strip(rd('46-h-verbs.js'));
  ok(!/__rmbDbg/.test(verbs), '★★⑩ 진단 훅 `__rmbDbg` 가 제품 코드에 **없다**(T57 규약)');
  ok(/border:1px solid var\(--line\)/.test(strip(rd('44-h-hud.js'))), '★⑩ 메뉴 테두리가 `--line` 이다(먹선)');
  // ★자명 통과 금지 — 이 검사기가 되살린 코드를 잡는가
  ok(/__rmbDbg/.test("window.__rmbDbg = { tap: true };"), '★⑩ 자명 통과 금지 — 훅을 되살린 소스는 잡힌다');
};

// ── aim — `e2e-aim` ⓕ 배치 모드 회전 — 우클릭이 회전을 먹는 길(정적 확인 · 야간 C)
SECTIONS.aim = function (ok, S) {
  S = S || reader();
  const src = S('public/client/30-n-net.js');
  ok(/placementMode\.dir/.test(src) && /contextmenu/.test(src),
     'ⓕ 배치 회전이 `contextmenu` 길에 그대로 있다(캡처가 그 길을 안 먹었다)');
};

// ── charsprite — `e2e-charsprite` ④′ [T134] 도구 층 표를 소스에서 읽는다 — 표를 돌려준다(뒤 지급 → 장착 → 층 절이 쓴다 · 야간 A)
SECTIONS.charsprite = function (ok, S) {
  S = S || reader();
  const src = S('public/client/40-r2-sprites.js');
  const m = /const PLAYER_TOOL_LAYER = \{([\s\S]*?)\};/.exec(src);
  ok(!!m, '★[T134] 도구 표를 소스에서 읽었다 (하네스에 표 사본 0)', m ? '' : '정규식 불일치(표가 옮겨졌나)');
  const tbl = {};
  if (m) for (const mm of m[1].matchAll(/(\w+)\s*:\s*'([\w_]+)'/g)) tbl[mm[1]] = mm[2];
  // ★주석에 옛 줄을 **인용해 남겨 뒀다**(왜 갈렸는지가 거기 있다) — 그래서 주석을 걷고 **코드만** 본다.
  const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다
  const charSrc = codeOnly(S('public/client/42-r2-char.js'));
  ok(!/rod\|fish\|낚/.test(charSrc), '★[T134] 옛 정규식이 **코드에서** 없어졌다 (표로 갈렸다)');
  ok(/PLAYER_TOOL_LAYER\[t\]/.test(charSrc), '★[T134] 층 함수가 그 표를 부른다');
  return { tbl };
};

// ── handoffProto — `e2e-handoff-proto` ⓢ0 소스 — 판 칸 · 응답 코드 검사가 자리에 있다(야간 C · T564)
SECTIONS.handoffProto = function (ok, S) {
  S = S || reader();
  const Z = S('server/zone.js');
  ok(/const HANDOFF_PROTO = /.test(Z) && /proto: HANDOFF_PROTO,/.test(Z) && /ok: true, proto: HANDOFF_PROTO/.test(Z), 'ⓢ0 인계 규약 판 — 요청 · 응답에 칸 하나씩(`HANDOFF_PROTO`)');
  ok(/if \(res\.statusCode >= 400\)/.test(Z), 'ⓢ0 존↔존 `postJSON` 이 응답 코드를 본다(404 를 성공으로 안 읽는다)');
};

// ── pidCollide — `e2e-pid-collide` 전제 둘 — 서버가 정말 그렇게 하나(철자가 아니라 꼴로 · 야간 B · T397)
SECTIONS.pidCollide = function (ok, S) {
  S = S || reader();
  const zsrc = S('server/zone.js');
  ok(/const pid = `p\$\{nextPid\+\+\}`/.test(zsrc) && /let nextPid = 1;/.test(zsrc),
     '전제 ① pid 는 존 프로세스마다 1 부터 센다(`let nextPid = 1` · `p${nextPid++}`)');
  const bc = zsrc.slice(zsrc.indexOf('function broadcast(obj)'), zsrc.indexOf('function broadcast(obj)') + 400);
  ok(/for \(const ws of observers\.keys\(\)\) rawSend\(ws, str\)/.test(bc),
     '전제 ② `broadcast` 는 관전자에게도 보낸다(`observers.keys()`)');
};

// ── zoneCross — `e2e-zone-cross` 소스 한 줄 — 이웃 관측 문턱이 화면 반경과 같은 상수다(야간 A · T428)
SECTIONS.zoneCross = function (ok, S) {
  S = S || reader();
  const MV = S('public/client/31-m-move.js');
  ok(/const PEEK_THRESHOLD = NAT_VIEW_PAD;/.test(MV), 'ⓢ 이웃 관측 문턱 = 렌더 반경 상수(`NAT_VIEW_PAD` 1,500 — 새 수 0)',
    (MV.match(/const PEEK_THRESHOLD = [^;]+;/) || ['(없음)'])[0]);
};

// ── npcWalk — `e2e-npc-walk` 머리 — 손잡이 한 자리 · 배회 배율 한 글자를 두 자리가 같이 쓴다(야간 B · T888)
//   (앞줄 "기대 걸음을 소스에서 읽었다"는 뒤 실측이 쓰는 상수라 e2e 에 남는다 — 판정이 아니다)
SECTIONS.npcWalk = function (ok, S) {
  S = S || reader();
  const ZSRC = S('server/zone.js');
  ok((ZSRC.match(/process\.env\.T888_NPC_WALK/g) || []).length === 1 && /\nconst T888_NPC_WALK = process\.env\.T888_NPC_WALK !== '0';/.test(ZSRC)
    && /MOVE_SPEED \* \(speedMult \|\| NPC_WALK_MULT\)/.test(ZSRC) && /let speedMult = npc\.behavior === 'flee' \? 2\.5 : NPC_WALK_MULT;/.test(ZSRC),
    '손잡이 한 자리(`!== \'0\'` = 켬 기본) · 배회 배율 한 글자를 두 자리(`npcStep` 기본 배속 · `followNpcPath` 기본값)가 같이 쓴다');
};

module.exports = { ROOT, reader, SECTIONS };
