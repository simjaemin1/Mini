// @@split:48-a-audio — A 소리 — 오디오 층 하나 (AudioContext · 키 표 · 거리 감쇠 · 볼륨 · BGM) [T261 2026-09-13]
//
// ★★§0 실측이 카드의 전제를 하나 뒤집었다 — 클라에 재생 문이 **0** 이었다는 것은 맞고
//   (`AudioContext`·`<audio`·`.play(` 전부 없었다), BGM 이 "13곡 음원 + 재생기"라는 것은 **틀렸다**:
//   `public/assets/audio/bgm/bgm.js` 는 파일을 한 장도 안 받는 **절차적 엔진**이다
//   (`DurangoBGM.create → start/setScene/setMood/setIntensity/setDayPhase/setVolume`).
//   디스크의 13곡(.ogg/.m4a)은 그 엔진을 `compose.py` 로 **오프라인으로 뽑아 둔 것**이고
//   런타임이 읽지 않는다. ⇒ "잇기"는 파일을 트는 것이 아니라 **엔진을 부르는 것**이다(재구현 0).
//
// ★이 파일의 경계(다른 세션과 안 부딪히려고):
//   · 전역은 `window.__sfx` **하나**. 다른 클라 파일에는 **훅 한 줄**씩만 들어간다(로직 0).
//   · **최상위 실행문 0** — `test-client-globals ③` 의 기준선을 안 늘린다(T0-b 규약: 실행은 99-main).
//     `99-main.js` 가 `initAudio()` 를 한 번 부른다. 그 전엔 이 파일은 아무 일도 안 한다.
//   · 수는 하나도 여기 없다 — 전부 `public/assets/sfx/manifest.json` 이다(눈대중 금지 · 족보 74).
//
// ★브라우저 규약: `AudioContext` 는 **첫 사용자 제스처 전에 만들지 않는다**(만들면 suspended 로
//   깨어나 첫 소리를 놓치고, 크롬이 콘솔에 경고를 남긴다). 그래서 `initAudio()` 는 리스너만 걸고,
//   컨텍스트는 첫 클릭/키/터치에서 만든다. `test-audio ⑤` 가 그걸 **정적으로** 검사한다.

// ── 상태 (전부 모듈 지역 — 전역으로 새지 않는다) ─────────────────────────────────
let _sfxCtx = null;                 // AudioContext 하나
let _sfxBus = null;                 // { master, sfx, music } GainNode
let _sfxMan = null;                 // 키 표(manifest.json)
let _sfxManErr = null;
let _sfxBuf = new Map();            // key -> AudioBuffer | null(못 받음)
let _sfxLive = new Map();           // key -> [{src, gain}]  단발 겹침 세기
let _sfxLoops = new Map();          // loopId -> {src, gain, key, seen}
let _sfxLast = new Map();           // key -> 마지막 발화 ms (쿨다운)
let _sfxVol = null;                 // { master, sfx, music, on }
let _sfxBgm = null;                 // DurangoBGM 인스턴스
let _sfxBgmScene = null;
let _sfxArmed = false;              // initAudio() 가 리스너를 걸었나
let _sfxStepPrev = null;            // 발자국 에지 검출용 {clip, frame}
let _sfxPanel = null;
let _sfxScanAt = 0;
let _sfxGroundCell = null;          // { k, kind } 발밑 지형 캐시(셀 하나)
let _sfxWaterCell = null;           // ★[T283] { k, d } 가장 가까운 물 셀까지의 거리(내 셀이 바뀔 때만 다시 잰다)
let _sfxWx = { precip: 0, indoor: false };
let _sfxWxKind = null;   // ★[T397] 그리는 층이 마지막으로 정한 강수 종류('rain'|'snow') — 눈이면 빗소리 0   // ★[T283] 날씨 훅이 넣어 둔 마지막 값 — 새(bird) 게이트가 읽는다
// ★`missing`(표에 파일이 없다 = 영영 무음) 과 `pending`(받는 중 = 곧 난다) 을 **갈라 센다** —
//   한 칸에 뭉치면 진단이 "음원이 없다"와 "아직 안 왔다"를 구분 못 한다(실측에서 실제로 헷갈렸다).
let _sfxStat = { played: 0, missing: 0, pending: 0, blocked: 0, loops: 0, noLimiter: 0 };
// ★[T417] 울린 단발의 **고리 장부**(키 · 시각) — 헤드룸 실측 자(`scripts/sfx-cooccur.js`)가 `__sfx.tap()` 으로 읽는다.
//   고정 크기(덮어쓰기) · 층의 판정에는 안 쓴다(읽기 전용 관측).
const SFX_TAP_N = 2048;
const _sfxTap = [];
let _sfxTapN = 0;

const SFX_MANIFEST_URL = '/assets/sfx/manifest.json';
const SFX_SCAN_MS = 250;            // 개체 훑기 주기 — 프레임마다 훑지 않는다(렌더 예산)

// ── 값 읽기 ────────────────────────────────────────────────────────────────────
function sfxKey(k) { return (_sfxMan && _sfxMan.keys && _sfxMan.keys[k]) || null; }
function sfxBusDef(b) {
  const t = _sfxMan && _sfxMan.bus && _sfxMan.bus[b];
  return t && typeof t.default === 'number' ? t.default : 0.8;
}
function sfxStorageKey() { return (_sfxMan && _sfxMan.storageKey) || 'durango.audio'; }

function sfxLoadVol() {
  const d = { master: sfxBusDef('master'), sfx: sfxBusDef('sfx'), music: sfxBusDef('music'), on: true };
  try {
    const raw = localStorage.getItem(sfxStorageKey());
    if (raw) {
      const j = JSON.parse(raw);
      for (const k of ['master', 'sfx', 'music']) if (typeof j[k] === 'number') d[k] = Math.max(0, Math.min(1, j[k]));
      if (typeof j.on === 'boolean') d.on = j.on;
    }
  } catch (e) { /* 사파리 프라이빗 등 — 기본값으로 간다 */ }
  return d;
}
function sfxSaveVol() {
  try { localStorage.setItem(sfxStorageKey(), JSON.stringify(_sfxVol)); } catch (e) { /* 저장 못 해도 소리는 난다 */ }
}

// ── 그래프 ─────────────────────────────────────────────────────────────────────
//   master ← sfx  (효과음)
//   master ← music(BGM — bgm.js 는 제 그래프를 destination 에 직접 물리므로 여기 안 지나간다.
//                  음악 볼륨은 `_sfxBgm.setVolume()` 으로 준다. 칸은 셋이되 경로는 둘이다.)
// ══ 리미터 ═══════════════════════════════════════════════════════════════════
//   ★★★[T292] **T283 의 곡선은 리미터가 아니었다 — 실측이 잡았다.**
//     T283 은 `bgm.js buildGraph` 의 tanh 곡선을 그대로 가져왔다(`tanh(1.35x)/tanh(1.35)*0.93`).
//     그 곡선의 **원점 기울기가 1.4364(= +3.15 dB)** 다 — 작은 신호를 **키운다.**
//     실측(오프라인 렌더 · `__sfx.probe`): 모닥불 **하나만** 울렸는데 피크가 −15.88 → **−12.90 dBFS**
//     (+2.98 dB). 넘침을 막는 장치가 **평소에 전체를 3dB 키우고 있었다.**
//   ★그리고 T283 의 셈 자체가 과했다: 합(3.2)은 **상한**이지 피크가 아니다 — 파형이 같은 순간에
//     같은 부호로 겹치지 않는다. 카드가 지목한 최악 조합(합 4.37)을 실제로 동시에 울려도
//     리미터 **없이** 피크 −3.40 dBFS · 클리핑 **0** 이었다. 넘치는 것은 소리 나는 16종을 **전부**
//     동시에 울렸을 때뿐이고(피크 +1.10 dBFS · 클리핑 8/352,800), 그건 게임에서 날 수 없는 조합이다.
//   ⇒ **자를 고친다**: 문턱 아래는 **손대지 않고**(기울기 정확히 1) 그 위만 1.0 으로 부드럽게 수렴시킨다.
//     문턱은 표(`bus.limiter.knee`)이고, **실측 최악 피크보다 위**여야 한다 — 그래야 평소엔 리미터가
//     아무 일도 안 한다(`test-audio ⑧` 이 그 부등식을 지킨다). 안전장치는 보이지 않아야 안전장치다.
//   ⚠`bgm.js` 의 곡선은 **안 고친다**(재생기 수정 0). 음악도 같은 이유로 +3.15dB 를 먹고 있다 ⇒ 회부.
// ★★[T305 2026-09-19] **곡선은 여기서 만들지 않는다 — `bgm.js` 의 정본을 부른다(사본 0).**
//   T283 이 `bgm.js` 의 곡선을 **베껴** 여기 달았고, T292 가 그 사본을 실측해 +3.15 dB 증폭기임을 찾아
//   여기만 고쳤다. 음악 쪽 원본은 그대로라 **5일 더 3 dB 크게 울었다** — 두 벌이면 한 벌만 고쳐진다.
//   ⇒ 한 벌로 합쳤다. 문턱은 **이 층의 표**(`manifest.json bus.limiter.knee`)가 주고,
//     곡선의 모양은 `bgm.js` 가 준다. 값과 모양의 임자가 갈려 있는 것이 이 구조의 요점이다.
//   ⚠`bgm.js` 가 없으면 리미터를 **안 단다**(사본을 두느니 없는 편이 낫다 — T292 실측으로
//     최악 조합 피크가 0.6763 < 문턱 0.8 이라 평소엔 한 번도 안 무는 장치다).
//     제품에서는 일어나지 않는다: `index.html` 이 `bgm.js` 를 이 파일 **앞에** 싣고
//     `test-audio ⑪d` 가 그 순서를 지킨다.
function sfxSoftLimiter(ctx) {
  const K = (_sfxMan && _sfxMan.bus && _sfxMan.bus.limiter && _sfxMan.bus.limiter.knee);
  const T = typeof K === 'number' ? K : 0.7;
  const mk = (typeof window !== 'undefined' && window.DurangoBGM && window.DurangoBGM.softLimiterCurve);
  if (!mk) { _sfxStat.noLimiter++; return null; }
  const lim = ctx.createWaveShaper();
  lim.curve = mk(T);
  lim.oversample = '2x';
  return lim;
}
function sfxBuildGraph() {
  const ctx = _sfxCtx;
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const lim = sfxSoftLimiter(ctx);
  if (lim) { sfx.connect(lim); lim.connect(master); } else { sfx.connect(master); }
  music.connect(master); master.connect(ctx.destination);
  _sfxBus = { master, sfx, music, lim };
  sfxApplyVol();
}
function sfxApplyVol() {
  if (!_sfxBus || !_sfxCtx) return;
  const on = _sfxVol.on ? 1 : 0;
  const now = _sfxCtx.currentTime;
  _sfxBus.master.gain.setTargetAtTime(_sfxVol.master * on, now, 0.05);
  _sfxBus.sfx.gain.setTargetAtTime(_sfxVol.sfx, now, 0.05);
  if (_sfxBgm) _sfxBgm.setVolume(_sfxVol.music * _sfxVol.master * on);
}

// ── 음원 ───────────────────────────────────────────────────────────────────────
//   file: null = 미확보. 그 키는 **무음**이고 결함이 아니다.
//   ★한 소리에 두 파일(`.ogg` + `.m4a`)인 이유는 형식 하나로는 안 되기 때문이다 —
//     사파리는 **Ogg Vorbis 를 안 튼다**. 브라우저에게 물어보고 고른다(짐작 0).
function sfxSrcOf(m) {
  const a = document.createElement('audio');
  const canOgg = !!a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') !== '';
  return (canOgg || !m.fileAlt) ? m.file : m.fileAlt;
}
// ★★★[T354] **변주 — 한 키에 파일 여럿.** 재민 09-22: 도끼·호랑이에 "다양한 소리가 있다면".
//   표가 `files: [...]` 를 주면 그중 하나가 난다. 단일 `file` 은 **그대로**다(기존 키 비트 동일).
//   ⚠고르는 것은 **주사위가 아니다**(`Math.random` 0 — 존 캐논과 같다). 사건에서 씨를 뽑는다:
//     자리가 있는 소리는 **그 자리**로(같은 나무를 같은 자리에서 때리면 늘 같은 소리 — 세계가 일관된다),
//     자리가 없는 소리는 그 키의 **울린 횟수**로(발자국은 걸음마다 다른 사건이다).
//   ⇒ 같은 사건은 몇 번을 다시 재생해도 같은 파일이고, 하네스가 그 결정성을 잰다.
function sfxVarIndex(m, o) {
  const n = (m.files && m.files.length) || 0;
  if (n < 2) return 0;
  let seed;
  if (o && o.x != null && o.y != null) seed = (Math.floor(o.x) * 73856093) ^ (Math.floor(o.y) * 19349663);
  else seed = (m._n = (m._n || 0) + 1) * 2654435761;
  seed = seed >>> 0;
  seed ^= seed >>> 15; seed = Math.imul(seed, 2246822507); seed ^= seed >>> 13;
  return (seed >>> 0) % n;
}
/** 이 키가 이번에 쓸 파일 이름. 배열이면 `sfxVarIndex` 가 고른 하나. */
function sfxFileOf(m, o) {
  if (m.files && m.files.length) {
    // ★[T358] `o.file` 이 오면 **그 파일로 못 박는다**. 재는 자(`probe`)가 쓰는 구멍이다 —
    //   변주는 부를 때마다 다른 파일을 주므로, 데우는 줄과 찾는 줄이 **같은 파일**을 가리켜야 한다.
    if (o && o.file) return o.file;
    const f = m.files[sfxVarIndex(m, o)];
    const nm = (typeof f === 'string') ? f : (f && f.file);
    // ★[T387] 변주도 **단일 파일과 같은 규칙**으로 짝을 고른다 — ogg 를 못 여는 브라우저(Safari)는 m4a.
    //   T358 부터 `files` 칸은 ogg 이름만 적혀 있었고 `sfxSrcOf` 를 안 거쳐서, 단일 파일은 m4a 를 받는 브라우저도
    //   변주 키(`tiger_growl`)만은 ogg 를 받으러 갔다 — 해독 못 하면 무음이고 `_sfxStat.missing` 에만 쌓인다
    //   (Safari 실기는 안 했다 · 규칙을 한 벌로 맞춘 것이다). 짝은 `fileAlt` 가
    //   있는 키에서만 바꾼다(그 키가 짝을 약속한 것이다) · Chromium 은 ogg 그대로 = 비트 동일.
    return (nm && m.fileAlt && sfxSrcOf(m) === m.fileAlt) ? nm.replace(/\.ogg$/, '.m4a') : nm;
  }
  return sfxSrcOf(m);
}
function sfxBuffer(key, o) {
  const m0 = sfxKey(key);
  const nm = m0 ? sfxFileOf(m0, o) : null;
  const ck = (m0 && m0.files && m0.files.length) ? (key + '#' + nm) : key;   // 변주는 파일마다 한 벌
  if (_sfxBuf.has(ck)) return _sfxBuf.get(ck);
  const m = m0;
  if (!m || !nm) { _sfxBuf.set(ck, null); return null; }
  _sfxBuf.set(ck, null);                              // 받는 동안은 무음(중복 요청 방지)
  fetch('/assets/sfx/' + nm)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((ab) => _sfxCtx.decodeAudioData(ab))
    .then((buf) => { _sfxBuf.set(ck, buf); })
    .catch(() => { _sfxStat.missing++; });
  return null;
}

// ── 거리 감쇠 ──────────────────────────────────────────────────────────────────
//   표의 `attenuation` 하나만 따른다. radius 0 = 위치 없는 소리(항상 제 볼륨).
function sfxGain(m, x, y) {
  const base = typeof m.volume === 'number' ? m.volume : 0.7;
  const r = m.radius || 0;
  if (!r || x == null || y == null) return base;
  const me = (typeof myAbsPredicted !== 'undefined' && myAbsPredicted) ? myAbsPredicted : null;
  if (!me) return base;
  const d = Math.hypot(x - me.x, y - me.y);
  if (d >= r) return 0;
  const mode = (_sfxMan && _sfxMan.attenuation) || 'linear';
  const f = mode === 'inverse_square' ? 1 / (1 + (d / r) * (d / r) * 8) : (1 - d / r);
  return base * Math.max(0, f);
}

// ── 단발 ───────────────────────────────────────────────────────────────────────
function sfxPlay(key, o) {
  o = o || {};
  const m = sfxKey(key);
  if (!m) return false;                                 // 표에 없는 키는 안 난다(하네스가 따로 문다)
  if (!_sfxCtx || !_sfxVol.on) return false;
  const now = _sfxCtx.currentTime * 1000;
  const cd = m.cooldownMs || 0;
  if (cd && now - (_sfxLast.get(key) || -1e9) < cd) return false;
  const g = sfxGain(m, o.x, o.y);
  if (g <= 0.001) return false;
  const live = (_sfxLive.get(key) || []).filter((e) => e.until > now);
  _sfxLive.set(key, live);
  if (live.length >= (m.maxSame || 3)) { _sfxStat.blocked++; return false; }
  const buf = sfxBuffer(key, o);
  _sfxLast.set(key, now);
  if (!buf) { m.file ? _sfxStat.pending++ : _sfxStat.missing++; return false; }   // 무음. 났다고 안 적는다.
  const src = _sfxCtx.createBufferSource(); src.buffer = buf;
  const gn = _sfxCtx.createGain(); gn.gain.value = g;
  src.connect(gn); gn.connect(_sfxBus.sfx);
  src.start();
  live.push({ until: now + buf.duration * 1000 });
  _sfxStat.played++;
  _sfxTap[_sfxTapN % SFX_TAP_N] = { i: _sfxTapN, k: key, t: now }; _sfxTapN++;
  return true;
}

// ── 반복(환경음) ───────────────────────────────────────────────────────────────
//   id 로 구분한다(모닥불은 개체마다 하나). 볼륨 0 이면 멎고, 다시 0 보다 커지면 다시 난다.
//   ★[T283] 페이드는 **표 값**이다(`fade` 초 · T272 회부 ④). 1차 판은 0.12/0.2 를 코드에 박아 뒀는데
//     그건 눈대중이었다. 세기가 크게 흔들리는 소리(바람·비)는 2초, 켜고 끄기만 하는 소리는 1초다.
//     `setTargetAtTime` 의 셋째 인자는 **시상수**라 값의 63%까지 걸리는 시간이다 — 표의 초를 그대로 준다.
function sfxLoop(id, key, gain) {
  const m = sfxKey(key);
  if (!m || !m.loop || !_sfxCtx) return;
  const fade = typeof m.fade === 'number' ? m.fade : 1.0;
  let e = _sfxLoops.get(id);
  if (gain <= 0.001 || !_sfxVol.on) { if (e) { try { e.src.stop(); } catch (err) {} _sfxLoops.delete(id); } return; }
  if (e) { e.gain.gain.setTargetAtTime(gain, _sfxCtx.currentTime, fade); e.seen = _sfxScanAt; return; }
  const buf = sfxBuffer(key);
  if (!buf) { m.file ? _sfxStat.pending++ : _sfxStat.missing++; return; }
  const src = _sfxCtx.createBufferSource(); src.buffer = buf; src.loop = true;
  const gn = _sfxCtx.createGain(); gn.gain.value = 0;
  src.connect(gn); gn.connect(_sfxBus.sfx); src.start();
  gn.gain.setTargetAtTime(gain, _sfxCtx.currentTime, fade);
  _sfxLoops.set(id, { src, gain: gn, key, seen: _sfxScanAt });
  _sfxStat.loops++;
}
function sfxLoopSweep(prefix) {      // 이번 훑기에 안 보인 개체의 반복을 멎힌다
  for (const [id, e] of _sfxLoops) {
    if (prefix && id.indexOf(prefix) !== 0) continue;
    if (e.seen === _sfxScanAt) continue;
    try { e.src.stop(); } catch (err) {}
    _sfxLoops.delete(id);
  }
}
function sfxStopAll() {
  for (const [, e] of _sfxLoops) { try { e.src.stop(); } catch (err) {} }
  _sfxLoops.clear();
}

// ── 발밑 지형 — 흙이냐 풀이냐 ──────────────────────────────────────────────────
//   ★사본 금지: 셀 상태는 `window.__tileStateAt`(34-m-renderloop 이 프레임마다 세우는 읽기 훅),
//   풀 알파는 `SoilBase` 램프 — **클라가 땅을 그릴 때 쓰는 그 자 그대로**다. 문턱을 여기서 안 짓는다.
function sfxGroundKey() {
  const cell = (typeof window.__camCellLocal === 'function') ? window.__camCellLocal() : null;
  if (!cell) return 'step_dirt';
  const ck = cell[0] + ',' + cell[1];
  if (_sfxGroundCell && _sfxGroundCell.k === ck && _sfxGroundCell.n === sfxSurfaceVer()) return _sfxGroundCell.v;
  // ★★[T354] 지면 키는 **표**가 고른다(`ground`). 셋이 된 것은 재민 09-22 귀 판정이다 —
  //   "좋긴 한데 돌바닥 걷는 소리야"(옛 step_dirt) · "이게 흙바닥에 가까운데?"(옛 step_grass).
  //   CREDITS 가 T262 부터 달고 있던 "지면 표시가 팩에 없다 — 가설이다" 경고가 그 귀로 닫혔다.
  const G = (_sfxMan && _sfxMan.ground) || {};
  let v = G._기본 || 'step_dirt';
  // ★★[T397] **발밑 표면 타일이 지형보다 먼저다** — 밭(`farmland`)·실내 바닥(`floor`)·마당(`vtile`)은 건물이라
  //   `__tileStateAt` 이 모른다. 어느 타입이 어느 키인지·무엇이 먼저인지는 **표**(`surface` · `_순서`)가 정한다.
  const surf = sfxSurfaceKeyAt(cell);
  if (surf) { _sfxGroundCell = { k: ck, v: surf, n: _sfxSurfN }; return surf; }
  try {
    const ts = (typeof window.__tileStateAt === 'function') ? window.__tileStateAt(cell[0], cell[1]) : null;
    // 바위·산터 = 돌 — 이 술어는 `step_dirt` 의 `땅` 칸이 T261 부터 적어 두고도 **안 쓰던** 그것이다.
    if (ts && (ts.kind === 'rock' || ts.geo) && G.rock) v = G.rock;
    else if (ts && ts.kind === 'land' && !ts.geo && typeof SoilBase !== 'undefined') {
      const c = (typeof conns !== 'undefined' && typeof primaryZoneId !== 'undefined') ? conns.get(primaryZoneId) : null;
      const B = SoilBase.biomeOf(c && c.meta ? c.meta.biome : undefined);
      const t = Math.max(0, Math.min(1, (ts.soil - B.grass[0]) / (B.grass[1] - B.grass[0])));
      if (t * t * (3 - 2 * t) * B.capG >= 0.5 && G.grass) v = G.grass;
    }
  } catch (e) { /* 지형이 아직 안 왔다 — 흙으로 둔다 */ }
  _sfxGroundCell = { k: ck, v, n: _sfxSurfN };
  return v;
}
// ★[T397] 표면 타일 셀 지도 — 주 연결의 `buildings` 에서 표(`surface`)에 있는 타입만 셀→타입으로 접는다.
//   셀 환산은 지면 그리기가 쓰는 그 식(`Math.floor(b.x / 32)` · `10-r1-terrain _tsFarmSet`)이다. 층(`floor`)까지 같아야 밟는다.
//   다시 접는 때: 건물 수가 바뀌거나 내 층이 바뀌면(버전 = 수 × 층). 매 걸음 훑지 않는다.
let _sfxSurf = null, _sfxSurfN = -1;
function sfxSurfaceVer() {
  const c = (typeof conns !== 'undefined' && typeof primaryZoneId !== 'undefined') ? conns.get(primaryZoneId) : null;
  const fl = (typeof myFloor !== 'undefined' && myFloor) || 0;
  return c && c.buildings ? (c.buildings.size * 64 + fl) : -1;
}
function sfxSurfaceKeyAt(cell) {
  const T = (_sfxMan && _sfxMan.surface) || null;
  if (!T || !cell) return null;
  const ver = sfxSurfaceVer();
  if (ver < 0) return null;
  if (ver !== _sfxSurfN) {
    const c = conns.get(primaryZoneId);
    const fl = (typeof myFloor !== 'undefined' && myFloor) || 0;
    const order = Array.isArray(T._순서) ? T._순서 : [];
    const rank = (t) => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
    const map = new Map();
    for (const b of c.buildings.values()) {
      if (!b || typeof T[b.type] !== 'string' || (b.floor || 0) !== fl) continue;
      const k = Math.floor(b.x / 32) + ',' + Math.floor(b.y / 32);
      const prev = map.get(k);
      if (!prev || rank(b.type) < rank(prev)) map.set(k, b.type);
    }
    _sfxSurf = map; _sfxSurfN = ver;
  }
  const t = _sfxSurf.get(cell[0] + ',' + cell[1]);
  return t ? T[t] : null;
}

// ── 물가까지의 거리 [T283] ─────────────────────────────────────────────────────
//   ★사본 금지: 물 판정은 `isWaterAtAbs`(00-const) 하나다. 그 함수는 **셀 단위 캐시를 이미 갖고 있다**
//     — 프레임마다 9천 타일을 돌다 fps 10 까지 떨어지던 것을 그 캐시로 고친 자리다(주석이 적어 뒀다).
//   ★예산: 훑기는 **내 셀이 바뀔 때만** 한다. 반경은 표(`water.radius`), 건너뛰는 칸도 표(`sampleStride`).
//     안쪽 고리부터 나가며 처음 만나는 물에서 멈춘다 — 물가에 서 있으면 몇 칸 만에 끝난다.
function sfxWaterDist() {
  const m = sfxKey('water');
  if (!m || !m.radius || typeof isWaterAtAbs !== 'function') return Infinity;
  const me = (typeof myAbsPredicted !== 'undefined' && myAbsPredicted) ? myAbsPredicted : null;
  if (!me) return Infinity;
  const cx = Math.floor(me.x / 32), cy = Math.floor(me.y / 32);
  const ck = cx + ',' + cy;
  if (_sfxWaterCell && _sfxWaterCell.k === ck) return _sfxWaterCell.d;
  const R = Math.ceil(m.radius / 32), st = Math.max(1, m.sampleStride || 1);
  let best = Infinity;
  for (let ring = 0; ring <= R && best === Infinity; ring += st) {
    for (let dy = -ring; dy <= ring; dy += st) {
      for (let dx = -ring; dx <= ring; dx += st) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;   // 고리의 테두리만
        const wx = (cx + dx) * 32 + 16, wy = (cy + dy) * 32 + 16;
        if (!isWaterAtAbs(wx, wy)) continue;
        const d = Math.hypot(wx - me.x, wy - me.y);
        if (d < best) best = d;
      }
    }
  }
  _sfxWaterCell = { k: ck, d: best };
  return best;
}

// ── 첫 제스처 · 컨텍스트 ───────────────────────────────────────────────────────
function sfxWake() {
  if (_sfxCtx) { if (_sfxCtx.state === 'suspended') _sfxCtx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;                                       // Web Audio 없는 브라우저 — 조용히 없는 층이 된다
  _sfxCtx = new AC();
  sfxBuildGraph();
  if (_sfxCtx.state === 'suspended') _sfxCtx.resume();
  sfxBgmStart();
}
function sfxBgmStart() {
  if (_sfxBgm || !window.DurangoBGM || !_sfxCtx) return;
  try {
    _sfxBgm = window.DurangoBGM.create({ context: _sfxCtx, volume: _sfxVol.music * _sfxVol.master * (_sfxVol.on ? 1 : 0) });
    _sfxBgm.start();
    sfxBgmScene(true);
  } catch (e) { _sfxBgm = null; }
}
// 장면은 **두 축**이다: 마을 안/밖(`__evNearVid`) × 낮/밤(`isNight`).
// ★[T292] 고르는 것은 **표**(`bgm.scenePick`)다 — 장면 이름이 코드에 없다. 1차 판엔 세 낱말이 여기 있었다.
//   표에 없는 칸은 **안 짓는다**(밤의 들판에 쓸 곡이 엔진에 없다 — 그 칸도 표가 말한다).
function sfxBgmScene(force) {
  if (!_sfxBgm || !_sfxMan) return;
  const inVillage = (typeof window.__evNearVid !== 'undefined' && window.__evNearVid != null);
  const night = (typeof isNight === 'function') ? !!isNight() : false;
  const s = ((_sfxMan.bgm && _sfxMan.bgm.scenePick) || {})[(inVillage ? 'village' : 'field') + ':' + (night ? 'night' : 'day')];
  if (!s || (!force && s === _sfxBgmScene)) return;
  _sfxBgmScene = s;
  const fade = (_sfxMan && _sfxMan.bgm && _sfxMan.bgm.sceneFadeSec) || 4.0;
  _sfxBgm.setScene(s, fade);
}

// ── 설정 칸 셋 + 끄기 ──────────────────────────────────────────────────────────
//   ★§0-ⓑ 실측: 이 레포에 **설정 패널이 없다**(`public/` 전수에 '설정'·'옵션'·'볼륨' 0곳).
//   카드가 말한 "`50-i-panel` 의 있는 설정 자리"가 없으므로 남의 파일에 패널을 짓지 않고
//   이 층이 **제 칸을 제가** 만든다(다른 파일 0줄). 여는 자리는 화면 오른쪽 아래 '소리' 단추와 Shift+Y.
function sfxPanel() {
  if (_sfxPanel) { _sfxPanel.el.hidden = !_sfxPanel.el.hidden; return; }
  const el = document.createElement('div');
  el.id = 'audioPanel';
  el.style.cssText = 'position:fixed;right:10px;bottom:42px;z-index:99998;background:rgba(var(--pane-rgb),0.97);'
    + 'border:1px solid var(--line);padding:10px 12px;font-size:12px;color:var(--fg-strong);'
    + 'font-family:sans-serif;min-width:190px';
  const rows = [['master', '전체'], ['sfx', '효과음'], ['music', '음악']];
  el.innerHTML = '<div style="font-weight:bold;padding-bottom:6px">소리</div>'
    + rows.map(([k, ko]) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">`
      + `<span style="width:44px">${ko}</span>`
      + `<input type="range" min="0" max="100" step="1" data-avol="${k}" value="${Math.round(_sfxVol[k] * 100)}" style="flex:1">`
      + `<b data-anum="${k}" style="width:30px;text-align:right">${Math.round(_sfxVol[k] * 100)}</b></div>`).join('')
    + `<label style="display:flex;align-items:center;gap:6px;padding-top:6px">`
    + `<input type="checkbox" data-aon ${_sfxVol.on ? 'checked' : ''}><span>소리 켬</span></label>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-avol]').forEach((r) => {
    r.oninput = () => {
      const k = r.dataset.avol;
      _sfxVol[k] = (+r.value) / 100;
      el.querySelector(`[data-anum="${k}"]`).textContent = r.value;
      sfxApplyVol(); sfxSaveVol();
    };
  });
  el.querySelector('[data-aon]').onchange = (e) => {
    _sfxVol.on = !!e.target.checked;
    if (!_sfxVol.on) sfxStopAll();
    sfxApplyVol(); sfxSaveVol();
  };
  _sfxPanel = { el };
}
function sfxButton() {
  const b = document.createElement('button');
  b.id = 'audioBtn';
  b.textContent = '소리';
  // ★자리 — **오른쪽 아래**. 왼쪽 아래는 채팅 판의 자리다(`style.css #chatPanel` left 12/bottom 12/폭 360 ·
  //   로그가 위로 140px 까지 자란다), 가운데 아래는 핫키 칸, 왼쪽 가운데는 사이드 레일(x 8~52)이다.
  //   1차 판이 왼쪽 아래에 놨다가 **채팅 입력칸을 덮는 것**을 스크린샷에서 봤다(§0-ⓔ).
  b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99998;padding:4px 10px;font-size:12px';
  b.onclick = () => { sfxWake(); sfxPanel(); };
  document.body.appendChild(b);
}

// ══════════════════════════════════════════════════════════════════════════════
// 입구 — `99-main.js` 가 한 번 부른다. 여기 전까지 이 파일은 아무 일도 안 한다.
// ══════════════════════════════════════════════════════════════════════════════
function initAudio() {
  if (_sfxArmed) return;
  _sfxArmed = true;
  _sfxVol = sfxLoadVol();

  // 키 표를 먼저 받는다(컨텍스트와 무관 — 제스처 전에 받아도 된다).
  fetch(SFX_MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => { _sfxMan = j; _sfxVol = sfxLoadVol(); if (_sfxBus) sfxApplyVol(); })
    .catch((e) => { _sfxManErr = String(e); });

  // ★첫 제스처에서만 컨텍스트를 만든다. 세 가지 다 건다(로비는 클릭, 게임은 키·터치).
  const wake = () => sfxWake();
  window.addEventListener('pointerdown', wake, { capture: true });
  window.addEventListener('keydown', wake, { capture: true });
  window.addEventListener('touchstart', wake, { capture: true, passive: true });

  // 페이지가 숨으면 멎고, 돌아오면 깨운다(탭 뒤에서 혼자 울지 않게).
  document.addEventListener('visibilitychange', () => {
    if (!_sfxCtx) return;
    if (document.hidden) { _sfxCtx.suspend(); } else if (_sfxVol.on) { _sfxCtx.resume(); }
  });

  // 소리 칸 — 단추 하나 + Shift+Y. 남의 키 표를 안 건드린다(99-main 의 Shift 절은 c·f·r·n·g 뿐).
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      sfxWake(); sfxPanel();
    }
  });
  sfxButton();

  // 전역은 이것 하나다.
  window.__sfx = {
    /** 위치 있는(또는 없는) 단발. o = {x, y} 는 **월드** 좌표. */
    play: (key, o) => sfxPlay(key, o),
    /** ★[T283] **수신** 훅 — `30-n-net.js handleMessage` **머리**에서 한 줄이 부른다.
     *  T261 은 이것을 `sendPrimary`(**발신**)에 붙였었다. 그래서 마을 밖에서 수확을 눌러도,
     *  거절당한 동사도 소리가 났다(회부 ①). 이제는 **세계가 그 일이 일어났다고 말할 때만** 난다.
     *  ⚠머리에서 불러야 한다 — `resource_removed` 는 아래에서 자원을 지우므로, 그 뒤에 부르면
     *    자리를 못 찾는다(위치 없는 소리가 된다). 훅이 첫 줄인 것은 장식이 아니라 계약이다.
     *  키를 고르는 것은 **표**다(`resourceHit`) — 여기 로직은 "표를 보고 자리를 붙인다"뿐이다. */
    recv: (msg, c) => {
      if (!_sfxCtx || !_sfxMan || !msg) return;
      const t = msg.type;
      if (t === 'resource_update' || t === 'resource_removed') {
        const r = c && c.resources && c.resources.get(msg.id);
        if (!r) return;
        const key = (_sfxMan.resourceHit || {})[r.type];
        if (!key) return;                                   // 표에 없는 자원은 안 운다(지어내지 않는다)
        const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
        sfxPlay(key, { x: r.x + ox, y: r.y + oy });
        return;
      }
      // ★★[T305] 먹기 — **서버가 동사를 말한다**. `gauges.ate` = `'self'`(내가 먹었다) · `'fed'`(남을 먹였다).
      //   짐작을 두 판 거쳐 여기 왔다: T283 은 메시지의 **모양**(`carry` 칸 존재)으로 갈랐고 — 그 칸이
      //   초당 게이지 틱에도 있어 **1초마다 씹었다**. T292-b 는 **값**(허기 상승)으로 갈랐고 — 모양에
      //   안 기대니 옳았지만 **배가 꽉 차면 허기가 안 올라** 무음이었다. T305 가 서버 두 자리를
      //   허락받아 `doEat` 이 `ate` 한 낱말을 대게 했다. 이제 층은 짐작하지 않는다.
      if (t === 'gauges') { if (msg.ate) sfxPlay('eat'); return; }
      // ★★[T305] 밭 수확 — `inventory` 전문의 `where` 낱말을 **표**가 키로 옮긴다(`inventoryWhere`).
      //   `sendInventory(player, where)` 는 T292 이전부터 이 값을 받고 있었는데 `Carry.assertInvariant`
      //   의 이름표로만 쓰고 **전문에 안 실었다**(T292 ⓑ 가 찾은 자리). T305 가 그 칸을 실었다.
      //   ⚠68자리 중 이름을 댄 곳만 운다 — 표에 없는 낱말은 안 운다(지어내지 않는다).
      if (t === 'inventory') {
        const key = msg.where && (_sfxMan.inventoryWhere || {})[msg.where];
        if (key) sfxPlay(key);
        return;
      }
      // 낚시 셋 — 서버가 상태를 그대로 말한다. 좌표는 **존 로컬**이라 절대로 접어야 한다(찌 그리기와 같은 함정).
      if (t === 'fish_state') {
        const key = (_sfxMan.fishState || {})[msg.state];
        if (!key) return;
        const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
        if (msg.x != null) sfxPlay(key, { x: msg.x + ox, y: msg.y + oy }); else sfxPlay(key);
        return;
      }
      if (t === 'fish_catch') { sfxPlay('hook'); return; }
      // ★★★[T321] **마을 어부의 소리** — `tick` 의 `players[].act` 낱말을 표가 키로 옮긴다(`npcAct`).
      //   ⚠새 훅 줄 0: `recv` 는 `handleMessage` **머리**에서 불리므로, 이 순간 `c.others` 에는 아직
      //     **직전** 값이 들어 있다(합치기는 아래에서 일어난다). 그래서 여기서 바로 **모서리**를 잡는다 —
      //     `30-n-net.js` 에 줄을 더하지 않아도 되고, `test-audio ⑦c`(파일당 훅 하나)도 그대로다.
      //   ⚠모서리로 잡아야 하는 이유: 라벨은 **1.2초 창** 동안 같은 값이 계속 온다(최대 25틱 · 무상태
      //     델타라 서버가 뷰어별로 안 센다). 값이 왔다고 울리면 한 번의 낚음이 스물다섯 번 난다.
      //   ⚠내가 아닌 개체만 본다 — 내 낚시는 `fish_state`·`fish_catch` 가 이미 말한다(두 번 울리지 않는다).
      if (t === 'tick' && msg.players && c && c.others) {
        const TBL = _sfxMan.npcAct || {};
        const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
        for (const pp of msg.players) {
          if (pp.act === undefined) continue;                 // 안 왔다 = 안 바뀌었다(델타 규약)
          const prev = c.others.get(pp.pid);
          if (!prev || prev.act === pp.act) continue;         // 같은 값이 또 온 것 — 모서리가 아니다
          const key = TBL[pp.act];
          if (!key) continue;                                 // 표에 없는 낱말은 안 운다(지어내지 않는다)
          sfxPlay(key, { x: pp.x + ox, y: pp.y + oy });
        }
        return;
      }
      // ★★★[T387] **사람/전투** — 서버가 이미 보내던 메시지 이름을 **표**(`combat`)가 키로 옮긴다.
      //   11자리 중 사건 넷(쏨·휘두름·쓰러짐·깨어남)만 표에 있다. 나머지 일곱은 상태 동기화라 안 운다
      //   (`hp_changed` 는 매 변화 · `pvp_state`·`player_down_state` 는 배지 · `arrow_removed` 는 맞음/사라짐을
      //   안 가른다 · `war_command_ack` 는 UI 응답 · `death` 는 `drop` 이 이미 운다 · `self_stat` 은 재민 판정).
      //   ⚠자리 — 지어내지 않는다: 좌표가 실려 오면 그 자리(존 로컬 → 절대), 사람 pid 면 그 사람(`c.others` · 합치기 전
      //     직전 값), **나**면 위치 없음, 모르는 pid 는 **안 운다**(존 반대편 휘두름이 귓가에서 나는 것보다 낫다).
      //   ⚠'나' = **주 연결에서 온 내 pid** 뿐이다. pid 는 존마다 따로 센다(`p${nextPid++}`) — 관전 연결의 p3 은
      //     내 p3 이 아니다.
      {
        // [T412] 도구/작업 갈래의 **메시지 → 키** 도 같은 자리 규칙을 쓴다(표 `work`) — 표 둘, 코드 하나.
        const CB = _sfxMan.combat || {}, WK = _sfxMan.work || {};
        const key = (typeof CB[t] === 'string') ? CB[t] : ((typeof WK[t] === 'string') ? WK[t] : null);
        if (key) {
          // 같은 이름이지만 사건이 아닌 것(다시 접속 때 복원용 재송신 등) — 표(`combatSkip`)가 칸과 값을 댄다.
          const sk = (_sfxMan.combatSkip || {})[t];
          if (sk && typeof sk === 'object' && Object.keys(sk).some((f) => !f.startsWith('_') && msg[f] === sk[f])) return;
          // [T402] 같은 이름이 여러 사건을 나를 때 — 표(`combatOnly`)의 칸이 **다 맞을 때만** 운다(쓰러짐 ≠ 업힘 ≠ 재접속).
          const only = (_sfxMan.combatOnly || {})[t];
          if (only && typeof only === 'object' && !Object.keys(only).every((f) => f.startsWith('_') || msg[f] === only[f])) return;
          const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
          const me = (typeof myPid !== 'undefined') ? myPid : null;
          const mine = !!(c && c.role === 'primary' && msg.pid != null && msg.pid === me);
          if (mine) { if (!(only && only._남만)) sfxPlay(key); return; }   // `_남만` — 내 것은 다른 메시지가 이미 운다
          if (msg.x != null && msg.y != null) { sfxPlay(key, { x: msg.x + ox, y: msg.y + oy }); return; }
          // [T412] 건물을 가리키는 메시지(`buildingId`)는 그 건물 자리에서 난다(궤 등 · 합치기 전 직전 값)
          const bb = (msg.buildingId != null && c && c.buildings) ? c.buildings.get(msg.buildingId) : null;
          if (bb && bb.x != null) { sfxPlay(key, { x: bb.x + ox, y: bb.y + oy }); return; }
          const o = (msg.pid != null && c && c.others) ? c.others.get(msg.pid) : null;
          if (o && o.x != null) sfxPlay(key, { x: o.x + ox, y: o.y + oy });
          return;
        }
      }
      // ★★[T397] **맞음** — `hp_changed` 의 `why`(서버 `setHp` 가 받던 낱말 · T397 이 전문에 실었다)를 표(`hpWhy`)가 키로.
      //   ⚠`why` 가 없는 옛 전문은 안 운다(짐작 0). 회복·먹기 낱말은 표에 없으니 안 운다.
      //   자리 규칙은 `combat` 과 같다 — 나(주 연결) = 위치 없음 · 남 = `c.others` · 모르는 pid 는 무음.
      const HW = _sfxMan.hpWhy || {};
      if (HW._msgType && t === HW._msgType) {           // 메시지 이름도 표가 댄다(층 코드에 이름 0 — test-audio ⑮g)
        const key = msg.why && HW[msg.why];
        if (typeof key !== 'string') return;
        const me = (typeof myPid !== 'undefined') ? myPid : null;
        if (c && c.role === 'primary' && msg.pid === me) { sfxPlay(key); return; }
        const o = (c && c.others) ? c.others.get(msg.pid) : null;
        const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
        if (o && o.x != null) sfxPlay(key, { x: o.x + ox, y: o.y + oy });
        return;
      }
      // ★★★[T412] **도구/작업 — 건물·줍기·심기.** 전부 서버가 이미 보내던 메시지를 **표**가 키로 옮긴다.
      //   ⚠`recv` 는 `handleMessage` **머리**에서 불린다 — `c.buildings`·`c.groundItems`·`c.resources` 에는
      //     아직 **직전** 값이 있다. 그래서 지워지는 건물의 타입·줍히는 물건의 자리·새 자원인지를 여기서 안다.
      if (t === 'building_added' || t === 'building_removed' || t === 'building_damaged' || t === 'building_updated') {
        const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
        const at = (b) => (b && b.x != null) ? { x: b.x + ox, y: b.y + oy } : null;
        const quiet = (T, ty) => Array.isArray(T._조용) && T._조용.indexOf(ty) >= 0;
        if (t === 'building_added') {                       // 무엇이 섰다 — 타입별 키(없으면 `기본`) · `_조용` 은 안 운다
          const b = msg.building, T = _sfxMan.buildAdded || {};
          if (!b || quiet(T, b.type)) return;
          const key = (typeof T[b.type] === 'string') ? T[b.type] : T.기본;
          const o = at(b); if (typeof key === 'string' && o) sfxPlay(key, o);
          return;
        }
        const prev = (c && c.buildings) ? c.buildings.get(t === 'building_updated' ? (msg.building && msg.building.id) : msg.id) : null;
        if (!prev) return;                                  // 처음 보는 건물 — 무엇이 바뀌었는지 모른다(지어내지 않는다)
        if (t === 'building_removed') {                     // 무엇이 없어졌다 — 터(`_site`)는 다음 단계로 **바뀐** 것이라 조용
          const T = _sfxMan.buildRemoved || {};
          if (quiet(T, prev.type)) return;
          const key = (typeof T[prev.type] === 'string') ? T[prev.type] : T.기본;
          const o = at(prev); if (typeof key === 'string' && o) sfxPlay(key, o);
          return;
        }
        if (t === 'building_damaged') {                     // 벽이 깎였다/고쳐졌다 — 직전 hp 와 견준다
          const T = _sfxMan.buildDamaged || {};
          const was = prev.data && prev.data.hp, now = msg.hp;
          if (typeof was !== 'number' || typeof now !== 'number' || was === now) return;
          const key = T[now < was ? 'down' : 'up'];
          const o = at(prev); if (typeof key === 'string' && o) sfxPlay(key, o);
          return;
        }
        // building_updated — 표(`buildEdge`)의 규칙: {types, field, on, off} · 칸이 **켜지면** on · **꺼지면** off
        const nd = (msg.building && msg.building.data) || {}, pd = prev.data || {};
        for (const R of (_sfxMan.buildEdge || [])) {
          if (!R || !Array.isArray(R.types) || R.types.indexOf(prev.type) < 0) continue;
          const a = !!pd[R.field], b = !!nd[R.field];
          if (a === b) continue;
          const key = b ? R.on : R.off;
          const o = at(prev); if (typeof key === 'string' && o) sfxPlay(key, o);
        }
        return;
      }
      // ★★[T417] **동물** — 짐승이 맞음(직전 hp 보다 줄 때만 · 먹여 회복은 조용) · 길들임(그 종의 울음) · 죽음(사체가 생김).
      //   자리는 직전 `c.mobs`(합치기 전) · 사체는 전문의 좌표. 표 `mobEvents` 가 키를 댄다(종 울음은 `mobs` 표 그대로).
      if (t === 'mob_damaged' || t === 'mob_tamed' || t === 'corpse_added') {
        const ME = _sfxMan.mobEvents || {};
        const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
        if (t === 'corpse_added') {
          const co = msg.corpse;
          if (co && typeof ME.death === 'string') sfxPlay(ME.death, { x: co.x + ox, y: co.y + oy });
          return;
        }
        const m = (c && c.mobs) ? c.mobs.get(msg.mid) : null;
        if (!m) return;                                     // 처음 보는 짐승 — 무엇이 바뀌었는지 모른다
        if (t === 'mob_damaged') {
          if (typeof m.hp !== 'number' || typeof msg.hp !== 'number' || !(msg.hp < m.hp)) return;
          if (typeof ME.hurt === 'string') sfxPlay(ME.hurt, { x: m.x + ox, y: m.y + oy });
          return;
        }
        const key = (ME.tamedCall && (_sfxMan.mobs || {})[m.type]) || null;   // 길들임 = 그 종이 운다(종 울음 표)
        if (typeof key === 'string') sfxPlay(key, { x: m.x + ox, y: m.y + oy });
        return;
      }
      if (t === 'ground_item_removed') {                    // 누가 주웠다(서버의 이 방송은 줍기 함수에서만 나간다)
        const key = _sfxMan.groundPick && _sfxMan.groundPick.key;
        const gi = c && c.groundItems ? c.groundItems.get(msg.id) : null;
        if (typeof key !== 'string' || !gi) return;
        sfxPlay(key, { x: gi.x + ((c.meta && c.meta.worldOffsetX) || 0), y: gi.y + ((c.meta && c.meta.worldOffsetY) || 0) });
        return;
      }
      if (t === 'resource_spawn') {                         // **새** 자원(처음 보는 id)만 — 자람·열매 갱신은 같은 id 라 조용
        const r = msg.resource, T = _sfxMan.resourceNew || {};
        if (!r || !c || !c.resources || c.resources.has(r.id) || typeof T[r.type] !== 'string') return;
        sfxPlay(T[r.type], { x: r.x + ((c.meta && c.meta.worldOffsetX) || 0), y: r.y + ((c.meta && c.meta.worldOffsetY) || 0) });
        return;
      }
      // ★★[T321] **바닥에 떨어졌다** — 버리기도 죽어 쏟기도 이 한 방송으로 나온다(`zone.js:7728`).
      //   그래서 죽은 어부의 고기는 **플레이어가 떨어뜨리는 그 소리**로 난다 — 층이 묻지 않아도 그렇다.
      //   키는 표가 준다(`groundDrop.key` · 새 키 0).
      if (t === 'ground_item_added') {
        const key = _sfxMan.groundDrop && _sfxMan.groundDrop.key;
        const gi = msg.gi;
        if (!key || !gi) return;
        sfxPlay(key, { x: gi.x + ((c && c.meta && c.meta.worldOffsetX) || 0),
                       y: gi.y + ((c && c.meta && c.meta.worldOffsetY) || 0) });
        return;
      }
    },
    /** 발자국 훅 — `42-r2-char.js drawCharSprite` 한 줄이 내 캐릭터의 (클립, 판)을 준다.
     *  새 타이머 0 — 걷기/뛰기 간격은 애니 fps 가 정한다. 판이 **바뀌는 에지**에서만 센다. */
    step: (clip, frame) => {
      if (!_sfxCtx || (clip !== 'walk' && clip !== 'run')) { _sfxStepPrev = null; return; }
      const meta = window.__charMeta && window.__charMeta.clips && window.__charMeta.clips[clip];
      const n = meta && meta.frames ? meta.frames : 0;
      if (!n) return;
      if (_sfxStepPrev && _sfxStepPrev.clip === clip && _sfxStepPrev.frame === frame) return;
      _sfxStepPrev = { clip, frame };
      // 두 발 = 한 바퀴에 두 번. 판 0 과 판 n/2 가 발 딛는 자리다(시트 규격은 메타가 준다).
      if (frame !== 0 && frame !== (n >> 1)) return;
      sfxPlay(sfxGroundKey());
    },
    /** 환경 한 갈래 — 세기(0..1)와 실내를 받아 반복 하나를 켠다. 실내 배율은 **표**(`indoorMul`). */
    ambient: (key, strength, o) => {
      if (!_sfxCtx) return;
      const m = sfxKey(key); if (!m) return;
      const inMul = (o && o.indoor) ? (typeof m.indoorMul === 'number' ? m.indoorMul : 0) : 1;
      const s = Math.min(1, Math.abs(strength || 0) * (m.gainK || 1)) * inMul;
      sfxLoop('amb:' + key, key, (m.volume || 0) * s);
    },
    /** ★[T283] 날씨 훅 — `37-r1-weather.js drawWeather` 의 **같은 한 줄**이 이제 날씨 통째를 준다.
     *  바람과 비가 한 자리에서 나온다(훅 줄이 늘지 않았다). 값은 그 층이 이미 읽어 둔 정본:
     *  `wind` = `server/wind.js seasonWind` 의 부호 있는 계절풍 · `precip` = 0..1.
     *  ⚠`precip` 은 세계가 아직 안 보낸다(T93). 보내는 날 저절로 난다 — 여기서 짐작하지 않는다. */
    weather: (w, indoor) => {
      if (!_sfxCtx || !w) return;
      _sfxWx = { precip: +w.precip || 0, indoor: !!indoor };
      // ★★[T397] **눈이 오면 빗소리가 안 난다.** 종전엔 기온과 무관하게 강수면 빗소리였다 — 화면은 눈인데 귀는 비.
      //   눈이냐 비냐는 **그리는 층이 정한다**(`37-r1-weather` · 어는점 하나) — 여기서 문턱을 다시 안 짓는다(사본 0).
      //   그 층의 판정(`__rainDbg().kind`)은 한 프레임 늦고, 실내·무강수면 비어 있으므로 **마지막 판정**을 쥔다.
      try { const k = (typeof window.__rainDbg === 'function') ? window.__rainDbg().kind : null; if (k) _sfxWxKind = k; } catch (e) {}
      const precipRain = (_sfxWxKind === 'snow') ? 0 : _sfxWx.precip;
      window.__sfx.ambient('wind', w.wind, { indoor });
      // ★★[T354] 비는 **세기로 두 파일**이 된다(`rainSplit` 표) — 재민 09-22 "이건 폭풍 버전인 거 같은데".
      //   문턱 아래는 약한 비, 위는 지금 것. 한쪽을 켜면 다른 쪽은 0 으로 꺼진다(둘이 겹쳐 울지 않는다).
      const RS = _sfxMan.rainSplit;
      if (RS && RS['아래'] && RS['위']) {
        const light = precipRain > 0 && precipRain < (RS['문턱'] || 0.5);
        window.__sfx.ambient(RS['아래'], light ? precipRain : 0, { indoor });
        window.__sfx.ambient(RS['위'], light ? 0 : precipRain, { indoor });
      } else window.__sfx.ambient('rain', precipRain, { indoor });
    },
    /** 개체·지형 훑기 — `34-m-renderloop.js` 한 줄이 이번 프레임의 renderables 와 카메라 중심을 준다.
     *  ★[T283] 무엇이 우는지는 **표 셋**(`mobs`·`buildings`·`bird.trees`)이 정한다 — 종 이름이
     *    코드에 박히지 않는다(1차 판은 `'wolf'`·`'campfire'` 두 낱말이 여기 있었다).
     *  호출자는 여전히 로직 0 · 줄 하나. */
    scan: (list, cx, cy) => {
      if (!_sfxCtx || !_sfxMan || !list) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - _sfxScanAt < SFX_SCAN_MS) return;
      _sfxScanAt = now;
      const MOB = _sfxMan.mobs || {}, BLD = _sfxMan.buildings || {};
      const bird = sfxKey('bird');
      const treeR2 = bird ? (bird.treeRadius || 0) * (bird.treeRadius || 0) : 0;
      let trees = 0;
      for (const r of list) {
        if (!r) continue;
        if (r.kind === 'mob' && r.m) { const k = MOB[r.m.type]; if (k) sfxPlay(k, { x: r.ax, y: r.ay }); }
        else if (r.kind === 'building' && r.b) {
          const k = BLD[r.b.type], m = k && sfxKey(k);
          const need = (_sfxMan.buildingsWhen || {})[r.b.type];   // [T412] 노·숯가마는 **불이 들었을 때만**(`data.job`)
          if (m && need && need.field && !(r.b.data && r.b.data[need.field])) continue;
          if (m) sfxLoop(k + ':' + r.b.id, k, sfxGain(m, r.ax, r.ay) * (_sfxWx.indoor ? (m.indoorMul || 0) : 1));
        } else if (bird && r.kind === 'resource' && r.r && r.r.type === 'tree') {
          const dx = r.ax - cx, dy = r.ay - cy;
          if (dx * dx + dy * dy <= treeR2) trees++;
        }
      }
      for (const k of Object.keys(BLD)) sfxLoopSweep(BLD[k] + ':');
      // 새 — 낮 · 숲 · 비 아님. 셋 다여야 난다(값은 전부 표).
      if (bird) {
        const night = (typeof isNight === 'function') ? !!isNight() : false;
        const ok = !night && trees >= (bird.trees || 0) && !(_sfxWx.precip > 0);
        window.__sfx.ambient('bird', ok ? 1 : 0, { indoor: _sfxWx.indoor });
      }
      // 물 — 개체가 아니라 지형이다. 내 셀이 바뀔 때만 다시 잰다.
      const water = sfxKey('water');
      if (water) {
        const d = sfxWaterDist();
        const g = (d >= water.radius) ? 0 : (water.volume || 0) * (1 - d / water.radius)
          * (_sfxWx.indoor ? (typeof water.indoorMul === 'number' ? water.indoorMul : 1) : 1);
        sfxLoop('amb:water', 'water', g);
      }
      sfxBgmScene(false);
    },
    /** ★[T292] **넘침을 재는 자**(진단 — 제품 경로 아님 · 새 전역 0).
     *  T283 이 리미터를 단 근거는 **셈**이었다(최악 합 3.2 × 0.56 = 1.79). 셈은 상한이지 실측이 아니다 —
     *  여러 소리가 동시에 나도 파형이 같은 순간에 같은 부호로 겹치지는 않으므로 **실제 피크는 합보다 낮다**.
     *  그래서 진짜 버퍼를 **오프라인으로 렌더**해서 표본을 직접 센다.
     *  ★왜 `AnalyserNode` 가 아니라 오프라인인가: Analyser 는 창(2048표본)의 **근사**를 주고 프레임에 묶인다.
     *    넘침은 **표본 하나**의 문제라 근사로는 "안 넘쳤다"를 증명할 수 없다. 오프라인은 전 표본을 준다.
     *  `keys` 를 동시에(같은 순간에) 울려 리미터 **있는 판/없는 판**을 따로 렌더하고 둘을 나란히 낸다.
     *  이득 감소(펌핑)는 두 판의 포락선 비로 잰다 — 리미터가 무는 깊이와 길이가 그 수다. */
    probe: async (keys, o) => {
      o = o || {};
      if (!_sfxMan || !_sfxCtx) return { err: 'not-ready' };
      const list = (keys && keys.length ? keys : Object.keys(_sfxMan.keys).filter((k) => !k.startsWith('_')))
        .filter((k) => sfxKey(k) && sfxKey(k).file);
      // ★[T358] 변주 키는 **첫 파일로 못 박아** 데운다(아래 `bufKeyOf` 와 같은 파일을 봐야 한다).
      const pinOf = (k) => { const m = sfxKey(k); const f0 = (m && m.files && m.files.length) ? m.files[0] : null;
        return f0 ? { file: (typeof f0 === 'string' ? f0 : f0.file) } : null; };
      for (const k of list) sfxBuffer(k, pinOf(k));              // 버퍼를 데운다(받는 중이면 아래가 기다린다)
      // ★★[T358] 변주 키는 버퍼가 `키#파일` 로 담긴다(T354 가 한 벌씩 받게 만들었다).
      //   ⇒ `_sfxBuf.get(키)` 로만 보면 **변주 키가 조용히 빠진다** — 실제로 헤드룸 실측이
      //     22키 중 21키만 재고도 아무 말 없이 통과했다. 재는 자가 대상을 빠뜨리면 그 수는 거짓이다.
      //   ⇒ 키가 지금 쓸 파일 이름으로 찾는다(단일 `file` 은 종전 그대로 키 이름이 곧 열쇠다).
      const bufKeyOf = (k) => {
        const m = sfxKey(k);
        if (!m) return k;
        //   ⚠`sfxFileOf(m, null)` 은 **부를 때마다 다른 파일**을 준다(자리 없는 키는 울린 횟수로
        //     고르므로 셈이 하나씩 는다 — 그게 변주의 뜻이다). 재는 자가 그걸 쓰면 데우는 줄과
        //     찾는 줄이 서로 다른 파일을 가리켜 **영영 못 찾는다**(실제로 그래서 21/22 였다).
        //   ⇒ 잴 때는 **첫 파일**로 못 박는다. 변주는 전부 같은 볼륨 칸을 쓰므로 헤드룸은 같다.
        const p = pinOf(k);
        return p ? (k + '#' + p.file) : k;
      };
      for (let i = 0; i < 60 && list.some((k) => !_sfxBuf.get(bufKeyOf(k))); i++) await new Promise((r) => setTimeout(r, 100));
      const bufs = list.map((k) => ({ k, b: _sfxBuf.get(bufKeyOf(k)), m: sfxKey(k) })).filter((e) => e.b);
      if (!bufs.length) return { err: 'no-buffers' };
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) return { err: 'no-offline' };
      const sr = _sfxCtx.sampleRate;
      const secs = o.seconds || 4;
      // ★값은 전부 표에서 온다 — 여기서 짓는 수는 없다(반경 감쇠만 0 으로 본다 = 최악).
      const render = async (withLim) => {
        const ctx = new OAC(2, Math.ceil(sr * secs), sr);
        const master = ctx.createGain(); master.gain.value = _sfxVol.master;
        const bus = ctx.createGain(); bus.gain.value = _sfxVol.sfx;
        if (withLim) { const lim = sfxSoftLimiter(ctx); bus.connect(lim); lim.connect(master); }
        else bus.connect(master);
        master.connect(ctx.destination);
        for (const e of bufs) {
          const src = ctx.createBufferSource(); src.buffer = e.b; src.loop = !!e.m.loop;
          const g = ctx.createGain(); g.gain.value = e.m.volume;
          src.connect(g); g.connect(bus); src.start(0);
        }
        return await ctx.startRendering();
      };
      const scan = (ab) => {
        let peak = 0, clipped = 0, sum = 0, n = 0;
        for (let c = 0; c < ab.numberOfChannels; c++) {
          const d = ab.getChannelData(c);
          for (let i = 0; i < d.length; i++) {
            const a = Math.abs(d[i]);
            if (a > peak) peak = a;
            if (a > 1) clipped++;
            sum += d[i] * d[i]; n++;
          }
        }
        const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(2) : -Infinity);
        return { peak: +peak.toFixed(4), peakDb: db(peak), clipped, rmsDb: db(Math.sqrt(sum / n)), samples: n };
      };
      const [off, on] = [await render(false), await render(true)];
      // 이득 감소(펌핑) — 10ms 창의 최대 |x| 로 포락선을 잡아 두 판을 나눈다.
      // ★★자를 먼저 좁힌다 [T292 실측]: 1차 판은 `pa > 0.02` 인 창을 전부 봤는데, 그러면
      //   **문턱 아래의 창**까지 센다. 거기서 두 판은 원리상 같아야 하지만 `oversample:'2x'` 의
      //   재표본 필터가 표본을 조금 흔들고, 그 절대 차이가 작은 pa 로 나뉘며 −10dB 짜리 허깨비를 낸다
      //   (모닥불 하나 · 피크는 한 톨도 안 변했는데 "최악 −10.92dB" 가 나왔다). **비율이 뜻을 갖는 창은
      //   리미터가 실제로 물 수 있는 창, 곧 `pa > knee` 뿐이다.** 그 밖은 자의 잡음이지 펌핑이 아니다.
      const w = Math.round(sr * 0.01);
      const a = off.getChannelData(0), b = on.getChannelData(0);
      const knee = (_sfxMan.bus && _sfxMan.bus.limiter && _sfxMan.bus.limiter.knee) || 1;
      let worstDb = 0, bitingMs = 0, windows = 0, overKnee = 0;
      for (let i = 0; i + w <= a.length; i += w) {
        let pa = 0, pb = 0;
        for (let j = i; j < i + w; j++) { const x = Math.abs(a[j]); if (x > pa) pa = x; const y = Math.abs(b[j]); if (y > pb) pb = y; }
        windows++;
        if (pa <= knee) continue;                                // 리미터가 닿지 않는 창 — 재지 않는다
        overKnee++;
        const d = 20 * Math.log10(pb / pa);
        if (d < worstDb) worstDb = d;
        if (d < -0.5) bitingMs += 10;                            // 0.5dB 넘게 물면 "무는 중"으로 센다
      }
      return {
        keys: bufs.map((e) => e.k), seconds: secs, sampleRate: sr,
        vol: { master: _sfxVol.master, sfx: _sfxVol.sfx },
        sum: +bufs.reduce((t, e) => t + e.m.volume, 0).toFixed(3),
        withoutLimiter: scan(off), withLimiter: scan(on),
        gainReduction: { worstDb: +worstDb.toFixed(2), bitingMs, windows, overKnee, knee },
      };
    },
    /** 진단 — 하네스·실기가 읽는다(읽기 전용). */
    /** ★[T417] 헤드룸 실측용 — `since` 뒤로 울린 단발(`{i,k,t}` · t = 컨텍스트 ms)과 지금 켜진 반복 키. 읽기 전용. */
    tap: (since) => {
      const from = Math.max(since || 0, _sfxTapN - SFX_TAP_N);
      const plays = [];
      for (let i = from; i < _sfxTapN; i++) plays.push(_sfxTap[i % SFX_TAP_N]);
      const loops = [];
      for (const [, e] of _sfxLoops) loops.push(e.key);
      return { n: _sfxTapN, now: _sfxCtx ? _sfxCtx.currentTime * 1000 : 0, plays, loops };
    },
    dbg: () => ({
      ctx: _sfxCtx ? _sfxCtx.state : null,
      manifest: _sfxMan ? Object.keys(_sfxMan.keys || {}).filter((k) => !k.startsWith('_')).length : 0,
      manifestErr: _sfxManErr,
      vol: _sfxVol ? Object.assign({}, _sfxVol) : null,
      bgm: _sfxBgm ? { running: _sfxBgm.running, scene: _sfxBgm.scene, mood: _sfxBgm.mood } : null,
      loops: [..._sfxLoops.keys()],
      stat: Object.assign({}, _sfxStat),
      missingFiles: _sfxMan ? Object.keys(_sfxMan.keys || {}).filter((k) => !k.startsWith('_') && !_sfxMan.keys[k].file) : [],
      wx: Object.assign({}, _sfxWx),
      waterDist: _sfxWaterCell ? (_sfxWaterCell.d === Infinity ? null : Math.round(_sfxWaterCell.d)) : undefined,
    }),
  };
}
