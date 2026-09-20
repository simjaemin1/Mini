#!/usr/bin/env node
// === scripts/t335-gap.js — T335 계측기: **17 팔**(통로 항만 뺀 값)을 **제품 코드 0** 으로 잰다 ========
//   (러너 밖 — `@regress` 표 없음. 카드가 허용한 계측 스크립트 하나다.)
//
// ★왜 [T335 카드 ② — "17 팔 · 코드 0 — env 만"]
//   ⚠**카드의 전제를 정정한다: 17 로 가는 env 문이 없다.** T315 는 진단 팔을 `T315_HOUSE_GAP=2` 로 뒀지만
//   **T326 이 그 팔을 지웠다**(15 가 기본이 되어 죽은 칸이 됐으므로 · 카드 T326 ① 지시대로). 지금 손잡이는
//     `T315_HOUSE_GAP=0` → `LIFE_HOUSE_GAP_AISLE`(18) · 그 밖 → `LIFE_HOUSE_GAP`(15)
//   둘뿐이다. 그래서 env 만으로는 17 을 만들 수 없다.
//
// ★그러면 어떻게 코드 0 을 지키나 — **적재 시점에 수출값 하나만 갈아 끼운다**(제품 파일 무수정).
//   생활층은 간격을 `_lifeVL().LIFE_HOUSE_GAP` 으로 **호출 때마다** 읽는다(`villages.js:3959` 접근자).
//   그래서 `--require` 선적재로 `server/village-layout.js` 의 **수출 객체 한 칸**을 17 로 바꾸면
//   생활층만 17 로 돈다. 시딩 배치(`generate` 안의 지역 `HOUSE_GAP` = 18/22)는 **안 건드린다** —
//   제품 손잡이가 그랬을 자리와 정확히 같은 범위다.
//   ⇒ 커밋 diff 의 제품 코드 변경 **0**. 바뀌는 것은 이 계측기가 띄운 프로세스의 메모리 한 칸뿐이다.
//
// 쓰는 법(둘 다 이 한 파일이 한다):
//   ① 선적재:  node --require scripts/t335-gap.js …            (T335_GAP=17 이면 그 값으로 갈아 끼운다)
//   ② 판 돌리기: T335_GAP=17 node scripts/t335-gap.js run <라벨> <포트베이스> [일수]
'use strict';
const path = require('path');

const GAP = process.env.T335_GAP ? Number(process.env.T335_GAP) : null;

// ── ① 선적재 모드 — 수출 한 칸 교체 ────────────────────────────────────────────
if (GAP != null && Number.isFinite(GAP)) {
  const VLPATH = path.join(__dirname, '..', 'server', 'village-layout.js');
  const Module = require('module');
  const orig = Module.prototype.require;
  let done = false;
  Module.prototype.require = function (req) {
    const m = orig.apply(this, arguments);
    if (!done && m && typeof m === 'object' && m.LIFE_HOUSE_GAP !== undefined) {
      try {
        const real = Module._resolveFilename(req, this);
        if (real === VLPATH) {
          const was = m.LIFE_HOUSE_GAP;
          // ★값만 갈아 끼운다 — 유도식(정본)은 그대로 두고, 이 프로세스의 생활층만 다른 수를 읽는다.
          Object.defineProperty(m, 'LIFE_HOUSE_GAP', { value: GAP, writable: false, enumerable: true, configurable: true });
          done = true;
          process.stderr.write(`[t335-gap] 생활층 집 간격 수출값 ${was} → **${GAP}** (제품 파일 무수정 · 시딩 18/22 무영향)\n`);
        }
      } catch (e) {}
    }
    return m;
  };
}

// ── ② 러너 모드 ───────────────────────────────────────────────────────────────
if (require.main === module && process.argv[2] === 'run') {
  const { spawn } = require('child_process');
  const label = process.argv[3] || 'G' + (GAP == null ? 'def' : GAP);
  const port = parseInt(process.argv[4] || '3910', 10);
  const days = parseInt(process.argv[5] || '200', 10);
  const out = process.env.T335_OUT || '/tmp/t335rs';
  require('fs').mkdirSync(out, { recursive: true });
  const env = Object.assign({}, process.env, {
    T212_DAYS: String(days), T212_DAY_MS: '4000',
    T212_CPORT: String(port), T212_ZPORT: String(port + 1),
    T212_CDB: `${out}/${label}-c.db`, T212_DB: `${out}/${label}-z.db`,
    T212_SNAP: `${out}/${label}-snap.json`,
    // ★선적재를 **자식(중앙·존)까지** 물려준다 — 생활층은 존에서 돈다.
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.join(__dirname, 't335-gap.js')}`.trim(),
  });
  const log = require('fs').createWriteStream(`${out}/${label}.txt`);
  const p = spawn(process.execPath, [path.join(__dirname, 't212-beds.js')], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.pipe(log); p.stderr.pipe(log);
  p.on('exit', (c) => { require('fs').appendFileSync(`${out}/progress`, `${label} rc=${c}\n`); process.exit(c || 0); });
}
