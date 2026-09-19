// === scripts/lib-routes.js — 라우트 전수표 **정본 한 벌** (하네스 둘이 함께 읽는다) ==============
//
// ⚠**계측·검사용 라이브러리다. 하네스가 아니다**(`@regress` 없음 — 러너가 직접 안 돈다).
// ⚠**왜 파일로 뺐나**(T290): 이 표를 읽는 곳이 둘이 됐다 —
//     `scripts/test-guest-identity.js` §⑧ 파수꾼(코드↔표 대조)
//     `scripts/test-doors.js`          (서버 띄워 바깥/안에서 실제로 두드린다)
//   표를 두 벌 두면 그게 사본이고, 문이 하나 늘 때 **한 벌만** 고쳐져 조용히 갈린다.
//
// ★표의 값은 **판정**이다(갈래 · 남의 것이 읽히나/바뀌나). 판정의 근거는 `보고/T242_*.md` §0-ⓐ ·
//   `보고/T245_*.md` §0-ⓒ · `인계/N-네트워크.md` N-전수표.
//   `갈래` 넷: 공개 · 안문(`internal-door`) · 본인(자격증명을 들고 온다) · 투영(바깥엔 줄여서 준다).
//   `판정` 넷: `공개뜻` · `닫힘` · `쓰기남음`/`읽힘남음` · `회부2`/`회부9`.
//   ⚠판정 값에 이모지를 쓰지 않는다 — `test-harness-lint` ②(판정 자리에 이모지 0).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ROUTES = {
  // ── central ──────────────────────────────────────────────────────────
  'central GET =/health':                    ['공개', '공개뜻'],
  'central GET =/economy/villages':          ['공개', '공개뜻'],
  'central GET ^/economy/prices/':           ['공개', '공개뜻'],
  'central GET =/economy/canadia/villages':  ['공개', '공개뜻'],
  'central GET =/economy/canadia/prices':    ['공개', '공개뜻'],
  'central GET =/economy/canadia/tradelog':  ['공개', '공개뜻'],
  'central GET =/economy/canadia/caravans':  ['공개', '공개뜻'],
  'central GET =/economy/prices':            ['공개', '공개뜻'],
  'central GET =/zones':                     ['공개', '공개뜻'],
  'central POST =/auth':                     ['본인', '공개뜻'],
  'central POST =/guest':                    ['본인', '공개뜻'],
  'central POST =/promote':                  ['본인', '공개뜻'],
  'central POST =/check_username':           ['공개', '회부2'],
  'central POST =/friend/req': ['안문', '닫힘'],
  'central POST =/friend/del': ['안문', '닫힘'],
  'central POST =/friend/pending':           ['안문', '닫힘'],
  'central GET ^/friends/':                  ['투영', '닫힘'],
  'central GET ^/player/':                   ['투영', '닫힘'],
  'central POST ^/player/':                  ['안문', '닫힘'],
  'central GET =/market/orders': ['안문', '닫힘'],
  'central POST =/market/order':             ['안문', '닫힘'],
  'central POST =/market/cancel':            ['안문', '닫힘'],
  'central GET =/tribes': ['투영', '닫힘'],
  'central GET ^/tribe/': ['안문', '닫힘'],
  'central POST =/tribe/add_vp': ['안문', '닫힘'],
  'central POST =/tribe/treasury': ['안문', '닫힘'],
  'central GET =/wars/active':               ['공개', '공개뜻'],
  'central POST =/war/declare':              ['안문', '닫힘'],
  'central POST =/war/end':                  ['안문', '닫힘'],
  'central POST =/tribe/npc_upsert': ['안문', '닫힘'],
  'central POST =/tribe/invite': ['안문', '닫힘'],
  'central POST =/tribe/invites':            ['안문', '닫힘'],
  'central POST =/tribe/invite_accept': ['안문', '닫힘'],
  'central POST =/tribe/granary': ['안문', '닫힘'],
  'central POST =/tribe/granary_set': ['안문', '닫힘'],
  'central POST =/tribe/mode': ['안문', '닫힘'],
  'central POST =/tribe/intro': ['안문', '닫힘'],
  'central GET =/tribe_intros':              ['공개', '공개뜻'],
  'central POST =/tribe/create': ['안문', '닫힘'],
  'central POST =/tribe/join': ['안문', '닫힘'],
  'central POST =/tribe/leave':              ['안문', '닫힘'],
  'central GET =/terrain.json':              ['공개', '공개뜻'],
  // ── zone ─────────────────────────────────────────────────────────────
  'zone GET ^/perf': ['안문', '닫힘'],
  'zone GET =/health':                       ['공개', '공개뜻'],
  'zone GET ^/routedbg':                     ['안문', '닫힘'],
  'zone GET ^/bodydbg':                      ['안문', '닫힘'],
  'zone GET ^/claimdbg':                     ['안문', '닫힘'],
  'zone GET ^/followdbg':                    ['안문', '닫힘'],
  'zone GET ^/friendsdbg':                   ['안문', '닫힘'],
  'zone GET ^/guilddbg':                     ['안문', '닫힘'],
  'zone GET ^/shelterdbg':                   ['안문', '닫힘'],
  'zone GET ^/welcomedbg':                   ['안문', '닫힘'],
  // ★★[T319 2026-09-19 · 회부 #9 닫음] 문은 **공개 그대로**고, 닫힌 것은 `?as=<이름>` **한 칸**이다
  //   (`zone.js` `_devAsGate` · `DEV_AS=1` 일 때만 온보딩에 닿는다 · 실서버엔 env 가 없다).
  //   ⇒ 판정이 `회부9` → `닫힘DEV_AS` 로 간다. **갈래는 안 바뀐다**(62·공개 16 그대로).
  'zone GET ^/startinfo':                    ['공개', '닫힘DEV_AS'],
  'zone GET ^/lifedbg':                      ['안문', '닫힘'],
  'zone GET ^/roomdbg':                      ['안문', '닫힘'],
  'zone GET =/metrics': ['안문', '닫힘'],
  'zone POST =/ghost_sync': ['안문', '닫힘'],
  'zone POST =/cross_damage': ['안문', '닫힘'],
  'zone POST =/handoff_prepare': ['안문', '닫힘'],
  'zone POST =/kick_player': ['안문', '닫힘'],
  'zone POST =/handoff_ack': ['안문', '닫힘'],
  // ── dispatcher ───────────────────────────────────────────────────────
  'dispatcher GET =/health/zones':           ['공개', '공개뜻'],
};

function extractRoutes() {
  const found = [];
  const rd = (f) => fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').split('\n');
  for (const [svc, file] of [['central', 'central.js'], ['zone', 'zone.js']]) {
    const lines = rd(file);
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!/req\.url/.test(L) || !/^\s*(if|\} else if|else if)\s*\(/.test(L)) continue;
      const methods = [...L.matchAll(/req\.method\s*===\s*'([A-Z]+)'/g)].map((m) => m[1]);
      if (!methods.length) continue;
      const ps = [...L.matchAll(/req\.url(?:\s*\.\s*split\([^)]*\)\[0\])?\s*(===|\.startsWith\()\s*'([^']+)'/g)]
        .map((m) => (m[1] === '===' ? '=' : '^') + m[2]);
      for (const p of ps) found.push({ key: `${svc} ${methods.join('|')} ${p}`, file, line: i + 1, src: L });
    }
  }
  const dl = rd('dispatcher.js');
  for (let i = 0; i < dl.length; i++) {
    const m = dl[i].match(/app\.(get|post|put|delete|patch)\(\s*'([^']+)'/);
    if (m) found.push({ key: `dispatcher ${m[1].toUpperCase()} =${m[2]}`, file: 'dispatcher.js', line: i + 1, src: dl[i] });
  }
  return found;
}

// ★[T290] 투영이 바깥에 주는 **칸 목록** — `test-doors` 가 이 목록과 실제 응답을 대조한다.
//   정본은 `server/central.js` 의 `projectPublic`·`projectTribe` 이고, 여기 적은 것은 **그 결과의 기대**다
//   (칸이 늘거나 줄면 하네스가 빨강 — 투영은 "줄여서 준다"가 뜻이라 늘어나는 쪽이 사고다).
const PROJECTION = {
  'central GET ^/player/': ['player_id', 'name', 'color', 'last_zone', 'home_zone'],
  'central GET =/tribes':  ['id', 'name', 'member_count', 'vp', 'is_npc', 'behavior_tier'],
  //   ⚠`/friends/` 는 **수만** 준다(T217) — 칸 목록이 곧 그 규약이다(`friends` 가 있으면 이름이 샌 것).
  'central GET ^/friends/': ['ok', 'n'],
};

// 갈래별 셈 — 답 한 줄의 근거(사람이 세지 않는다).
function counts() {
  const k = Object.keys(ROUTES);
  const c = (f) => k.filter(f).length;
  return {
    n: k.length,
    공개: c((x) => ROUTES[x][0] === '공개'),
    안문: c((x) => ROUTES[x][0] === '안문'),
    본인: c((x) => ROUTES[x][0] === '본인'),
    투영: c((x) => ROUTES[x][0] === '투영'),
    남음: c((x) => ROUTES[x][1].endsWith('남음') || ROUTES[x][1].startsWith('회부')),
    쓰기남음: c((x) => ROUTES[x][1] === '쓰기남음'),
    읽힘남음: c((x) => ROUTES[x][1] === '읽힘남음'),
    회부됨: c((x) => ROUTES[x][1].startsWith('회부')),
  };
}

// 표의 열쇠 → { svc, method, path, prefix } (부르는 쪽이 문자열을 다시 쪼개지 않게)
function parseKey(key) {
  const [svc, methods, spec] = key.split(' ');
  return { svc, method: methods.split('|')[0], methods: methods.split('|'), prefix: spec[0] === '^', path: spec.slice(1) };
}

module.exports = { ROUTES, PROJECTION, extractRoutes, counts, parseKey, ROOT };
