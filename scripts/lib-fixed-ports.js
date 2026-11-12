'use strict';
// (@regress 없음 — 정본 함수 · `test-harness-lint` ⑯ 과 러너 `-j` 가 같이 쓴다)
// === scripts/lib-fixed-ports.js — 파일이 서버를 띄우는가 · 어떤 고정 포트를 쓰는가 [T1288] ==========
//   한 자를 두 곳이 쓴다(사본 0): `test-harness-lint` ⑯(쥐지 않은 고정 포트 = 빨강) · 변환 판(T1288 머리 줄 고르기).
//   · 띄움 = central/zone 을 spawn·fork·boot · zone 을 같은 프로세스로 require · `.listen(`
//   · 고정 수 = 포트 자리의 숫자 리터럴(`CPORT = 3010` · `PORT: '3020'` · `localhost:3010` · `port: 3141` · `--port=4444` · `.listen(3099)`)
//              + 존 설정에서 **포트를 읽은** 존(`ZONES.<id>.port` · `ZONES['<id>'].port` · `Z = ZONES.<id>` 뒤 `Z.port`)
//              + 존 이름을 동적으로 고르는 파일(`ZONES[z]` 의 `.port`)은 파일 안 존 이름 글자(쉼표 목록 포함) 모두
//   · 제품 고정 = 존 설정의 존 포트 · central 기본 3010(`zone-config` 를 읽는다 · 숫자 사본 0)
const path = require('path');
const CO = require('./code-only.js');
const ZC = require(path.join(__dirname, '..', 'server', 'zone-config'));
const CFG = new Map(Object.entries(ZC.ZONES).map(([id, z]) => [id, z.port]));
const CFGP = new Set([...CFG.values(), 3010]);
const PORTLIT = [
  /\b(?:[A-Z][A-Z0-9_]*)?PORT[A-Z0-9_]*\s*=\s*(?:String\(\s*)?['"`]?(\d{4,5})\b/g,
  /\b(?:[A-Z][A-Z0-9_]*)?PORT[A-Z0-9_]*\s*:\s*(?:String\(\s*)?['"`]?(\d{4,5})\b/g,
  /\b[CZHNW]P\d?\s*=\s*(\d{4,5})\b(?!\s*[*\/])/g,   // ★짧은 이름(`CP = 3630` · `ZP2 = 3321` — T1288 첫 판이 놓쳤다)
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})\b/g,
  /\bport\s*[:=]\s*(\d{4,5})\b/g,
  /--port[= ](\d{4,5})\b/g,
  /\.listen\(\s*(\d{4,5})\b/g,
  /\b(?:start|boot|serve|listen|spawn|launch|up)\w*\(\s*(\d{4,5})\b/gi,   // ★부르는 자리 인자(`startNeighbor(3020, …)` · `up(3811, …)` — T1288 -j4 첫 판이 찾았다)
];
const BOOT = (code) => (/(?:'central(?:\.js)?'|server['"],\s*['"]central|central\.js|'zone\.js'|server['"],\s*['"]zone|zone\.js)/.test(code) && /\b(?:spawn|fork|boot|sp|execFile)\w*\s*\(/.test(code))
  || /require\(\s*(?:path\.join\([^)]*['"]server['"],\s*['"]zone(?:\.js)?['"]\)|['"]\.\.\/server\/zone(?:\.js)?['"])\s*\)/.test(code) || /\.listen\(/.test(code);
const esc = (s) => s.replace(/[$]/g, '\\$');
const UNBOUND = 'lib-port: 묶지 ' + '않음';

function judge(src) {
  const code = CO(src);
  const hm = /require\('\.\/lib-port'\)\.hold\(([\d,\s]+)\)/.exec(code);
  const held = hm ? hm[1].split(',').map((x) => +x.trim()) : [];
  if (!BOOT(code)) return { boots: false, nums: [], need: [], custom: [], held, fixed: [], centralLess: false, guarded: false };
  const nums = new Set();
  const RAW = src.split('\n');
  // 포트 글자가 **묶는 자리가 아닌** 줄(도커 env 픽스처 글자 · 남의 상자 설정 흉내)은 그 줄에 `lib-port: 묶지 않음` 표지 — 린트 ⑯c 가 표와 맞댄다
  for (const [i, L] of code.split('\n').entries()) if (!(RAW[i] || '').includes(UNBOUND)) for (const re of PORTLIT) { re.lastIndex = 0; let m; while ((m = re.exec(L))) { const n = +m[1]; if (n >= 1000 && n <= 65535) nums.add(n); } }
  // 존 설정에서 포트를 읽은 존
  for (const m of code.matchAll(/\bZONES(?:\.(\w+)|\[\s*['"](\w+)['"]\s*\])\.port\b/g)) { const id = m[1] || m[2]; if (CFG.has(id)) nums.add(CFG.get(id)); }
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:\w+\.)?ZONES(?:\.(\w+)|\[\s*['"](\w+)['"]\s*\])\s*[,;)\n]/g)) {
    const id = m[2] || m[3];
    if (CFG.has(id) && new RegExp('\\b' + esc(m[1]) + '\\.port\\b').test(code)) nums.add(CFG.get(id));
  }
  let dyn = /\bZONES\[\s*[A-Za-z_$][\w$.]*\s*\]\.port\b/.test(code);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:\w+\.)?ZONES\[\s*[A-Za-z_$][\w$.]*\s*\]\s*[,;)\n]/g)) if (new RegExp('\\b' + esc(m[1]) + '\\.port\\b').test(code)) dyn = true;
  if (dyn) {
    for (const m of code.matchAll(/['"`]([a-z_]+(?:\s*,\s*[a-z_]+)*)['"`]/g)) for (const id of m[1].split(/\s*,\s*/)) if (CFG.has(id)) nums.add(CFG.get(id));
  }
  // ★central 없이 존을 띄우는 파일 — 존은 `CENTRAL_*` 가 없으면 기본 localhost:3010 에 붙는다(나란히 돌면 **남의 central 에 등록**한다).
  //   ⇒ 이 파일은 머리 줄 `lib-port.noCentral()`(닿지 않는 `http://localhost:1`)를 단다 · 린트 ⑯d.
  const zoneBoot = /(?:'zone\.js'|server['"],\s*['"]zone|zone\.js)/.test(code) && /\b(?:spawn|fork|boot|sp|execFile)\w*\s*\(/.test(code)
    || /require\(\s*(?:path\.join\([^)]*['"]server['"],\s*['"]zone(?:\.js)?['"]\)|['"]\.\.\/server\/zone(?:\.js)?['"])\s*\)/.test(code);
  const centralBoot = /(?:'central(?:\.js)?'|server['"],\s*['"]central|central\.js)/.test(code) && /\b(?:spawn|fork|boot|sp|execFile)\w*\s*\(/.test(code);
  const centralLess = zoneBoot && !centralBoot && !/\bCENTRAL_(?:URL|PORT|HOST)\b/.test(code);
  const all = [...nums].sort((a, b) => a - b);
  const fixed = all.filter((n) => CFGP.has(n));
  const guarded = /require\('\.\/lib-port'\)\.noCentral\(\)/.test(code);
  return { boots: true, nums: all, fixed, need: fixed.filter((n) => !held.includes(n)), custom: all.filter((n) => !CFGP.has(n)), held, centralLess, guarded };
}

module.exports = { judge, CFGP, CFG, UNBOUND };
