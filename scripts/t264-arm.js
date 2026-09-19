// === scripts/t264-arm.js — T264: 반사실 팔을 `require.cache` 로 심는 프리로드 ==========
//
// ⚠**제품 파일을 한 글자도 안 건드린다.** `sim/economy-sim.js` 의 **소스 텍스트**를 읽어
//   지정한 한 줄만 바꾼 사본을 `require.cache` 에 심는다(T196·T204·T253 이 세 번 쓴 문법 · 네 번째 사용).
//   `node -r ./scripts/t264-arm.js scripts/t176-ab.js 800 <시드>` 로 **재는 자보다 먼저** 앉는다.
//
// ★왜 [지시 T264]
//   T249 가 세운 문장: "짚이 마을을 죽인 게 아니라 **너무 빨리 키웠다**"(짚 대기 → 목재 재고 → 주거 → 인구).
//   그 문장이 맞으면 **건축 속도만 끔 팔만큼 묶었을 때 소멸 1·1·2 가 사라져야** 한다. 이 파일이 그 팔을 만든다.
//   그리고 목재 재고를 읽는 자리는 넷이다(`built` · picker `:3328` · 주거 방아쇠 `:3800` · `fuelK` `:3135`) —
//   하나씩만 "짚이 아낀 몫을 못 본 것처럼" 고정한 팔 셋으로 **어느 읽기가 죽음을 만드나**를 가른다.
//
// 팔(`T264_ARM`):
//   obs      — **행동 치환 0.** 오늘 잠재생산을 `v._t264pot` 에 담기만 한다(ⓓ 감산 칸의 밑변).
//              이월 팔과 **비트 동일**이어야 한다 — 그 동일성이 이 관측이 무해하다는 증거다.
//   cap      — 하루 건축을 `T264_CAPS` 가 준 **끔 팔 실측 최대**로 자른다(마을 이름별 · 새 수 0).
//   picker   — 생계 picker 의 `wood < N*5` 비교만 **짚이 아낀 누적분을 뺀 재고**로 읽는다.
//   trigger  — 주거 방아쇠의 `wood < N*2` 비교만 같은 방식으로.
//   fuelk    — `fuelK` 의 `재고/90` 항만 같은 방식으로.
//   (셋 다 `_strawSaveCum` 이 필요하므로 그 누계 한 줄을 같이 얹는다 — 누계는 **관측 값**이고
//    그 자체로는 아무 행동도 안 바꾼다. 그래서 치환 자기검사는 **두 자리**를 따로 센다.)
//
// ⚠누계의 성질: `_strawSaveCum` 은 800일 내내 는다. 100일쯤이면 재고를 넘어서므로 세 팔은
//   *"그 읽기에서 짚의 절약이 **아예 없었던 것처럼**"* 이라는 **가장 센** 반사실이다(첫째 차수 · T210 문법).
//   약한 판(일부만 뺌)을 만들려면 새 수가 든다 — 그래서 안 만든다. 표가 그 뜻으로 읽혀야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ARM = (process.env.T264_ARM || '').trim();
if (ARM) {
  const ECON = path.join(__dirname, '..', 'sim', 'economy-sim.js');
  let src = fs.readFileSync(ECON, 'utf8');
  const hits = [];
  const sub = (what, a, b) => {
    const n = src.split(a).length - 1;
    if (n !== 1) { console.error(`[t264-arm] ★치환 대상이 ${n}개다(정확히 1이어야 한다): ${what}`); process.exit(3); }
    src = src.replace(a, b);
    hits.push(what);
  };

  // ── 관측 한 줄 — 오늘 잠재생산을 마을에 담는다(모든 팔 공통 · 행동 0) ──────
  //   정본은 `dailyProductionPotential` 을 틱 지역 `const` 로 둔다(:2238) — 밖에서 못 읽는다.
  //   `_kDbg` 를 적는 그 줄 옆(틱 끝·같은 자리)에서 **읽기만** 해서 담는다.
  sub('관측(잠재 담기)',
    "  v._kDbg = { slot: +slotK.toFixed(1), prod: +prodK.toFixed(1), fuel: +fuelK.toFixed(1) };",
    "  v._t264pot = dailyProductionPotential;   // ★[T264 관측] 오늘 잠재 — 읽기만(행동 0)\n"
    + "  v._kDbg = { slot: +slotK.toFixed(1), prod: +prodK.toFixed(1), fuel: +fuelK.toFixed(1) };");

  if (ARM === 'cap') {
    // ★건축 속도만 끔 팔 실측 최대로 자른다 — **석재 배수를 물린 뒤**(끔 팔이 잰 그 양과 같은 축).
    sub('건축 캡',
      "      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%",
      "      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%\n"
      + "      { const _c = global.__T264_CAPS && global.__T264_CAPS[v.name];   // ★[T264 ⓑ] 끔 팔 실측 최대(새 수 0)\n"
      + "        if (_c != null && built > _c) built = _c; }");
  } else if (ARM === 'picker' || ARM === 'trigger' || ARM === 'fuelk') {
    // ★누적 절약분 — 이월이 종전 산수보다 **더 태운 짚**이 곧 안 탄 목재다(같은 축 · wood-eq).
    sub('절약 누계',
      "  v._strawPend = avail - burn;",
      "  v._strawPend = avail - burn;\n"
      + "  v._strawSaveCum = (v._strawSaveCum || 0) + Math.max(0, burn - Math.min(cap, raw > 0 ? raw : 0));   // ★[T264 ⓒ] 짚이 아낀 목재 누계");
    if (ARM === 'picker') {
      sub('picker 고정',
        "  if (v.storage.wood < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
        "  if (((v.storage.wood || 0) - (v._strawSaveCum || 0)) < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';   // ★[T264 ⓒ] 절약분을 못 본 것처럼");
    } else if (ARM === 'trigger') {
      sub('방아쇠 고정',
        "  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
        "  if (v.housing !== undefined && N >= v.housing * 0.95 && ((v.storage.wood || 0) - (v._strawSaveCum || 0)) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';   // ★[T264 ⓒ] 절약분을 못 본 것처럼");
    } else {
      sub('fuelK 고정',
        "                    + (v._woodImportEMA || 0) + (v.storage.wood || 0) / 90;         // + 수입EMA + 재고 한 계절 완충",
        "                    + (v._woodImportEMA || 0) + Math.max(0, (v.storage.wood || 0) - (v._strawSaveCum || 0)) / 90;   // ★[T264 ⓒ] 절약분을 못 본 것처럼");
    }
  } else if (ARM !== 'obs') {
    console.error(`[t264-arm] ★모르는 팔: ${ARM}`);
    process.exit(3);
  }

  if (process.env.T264_CAPS) {
    global.__T264_CAPS = JSON.parse(fs.readFileSync(process.env.T264_CAPS, 'utf8'));
  }

  const m = new Module(ECON, null);
  m.filename = ECON;
  m.paths = Module._nodeModulePaths(path.dirname(ECON));
  require.cache[ECON] = m;
  m._compile(src, ECON);
  m.loaded = true;
  console.log(`[t264-arm] 팔=${ARM} · 치환 ${hits.length}자리(${hits.join(' · ')})`
    + (global.__T264_CAPS ? ` · 캡 ${Object.keys(global.__T264_CAPS).length}마을` : ''));
}
