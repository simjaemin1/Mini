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
let _sfxWx = { precip: 0, indoor: false };   // ★[T283] 날씨 훅이 넣어 둔 마지막 값 — 새(bird) 게이트가 읽는다
// ★`missing`(표에 파일이 없다 = 영영 무음) 과 `pending`(받는 중 = 곧 난다) 을 **갈라 센다** —
//   한 칸에 뭉치면 진단이 "음원이 없다"와 "아직 안 왔다"를 구분 못 한다(실측에서 실제로 헷갈렸다).
let _sfxStat = { played: 0, missing: 0, pending: 0, blocked: 0, loops: 0 };

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
//   ★★[T283] **효과음 버스에 리미터를 단다.** T261 이 세운 헤드룸(최악 동시 합 1.67 × 0.8 × 0.7 = 0.94)은
//     키가 여덟일 때의 수였다. T283 이 반복 셋(비·물·새)을 더하면서 최악 합이 **3.2** 가 됐고
//     (`wind .5 + rain .6 + water .55 + fire .75 + 단발 .8` — 새는 비 게이트에 막혀 빠진다)
//     ×0.8×0.7 = 1.79 ⇒ **목적지에서 잘린다.** 버스 기본값을 0.34 로 내리면 소리 하나가 반토막이 되므로
//     대신 **마지막에 소프트 리미터**를 둔다 — 같은 문제를 이 집이 이미 푼 자리가 있고(`bgm.js buildGraph`
//     의 "마지막 안전장치 — tanh 소프트 리미터"), **그 곡선을 그대로** 쓴다(자를 두 벌 만들지 않는다).
//   ⚠BGM 은 이 버스를 안 지난다 — `bgm.js` 가 제 그래프를 `ctx.destination` 에 직접 물리고
//     제 리미터를 이미 갖고 있다(재생기 수정 0 이므로 돌릴 길이 없다). 남는 합은 보고 ⓒ 에 적었다.
function sfxSoftLimiter(ctx) {
  const lim = ctx.createWaveShaper();
  const CN = 2048, curve = new Float32Array(CN);
  for (let i = 0; i < CN; i++) {
    const x = (i / (CN - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35) / Math.tanh(1.35) * 0.93;   // ← bgm.js 와 같은 곡선·같은 상수
  }
  lim.curve = curve; lim.oversample = '2x';
  return lim;
}
function sfxBuildGraph() {
  const ctx = _sfxCtx;
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const lim = sfxSoftLimiter(ctx);
  sfx.connect(lim); lim.connect(master); music.connect(master); master.connect(ctx.destination);
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
function sfxBuffer(key) {
  if (_sfxBuf.has(key)) return _sfxBuf.get(key);
  const m = sfxKey(key);
  if (!m || !m.file) { _sfxBuf.set(key, null); return null; }
  _sfxBuf.set(key, null);                              // 받는 동안은 무음(중복 요청 방지)
  fetch('/assets/sfx/' + sfxSrcOf(m))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((ab) => _sfxCtx.decodeAudioData(ab))
    .then((buf) => { _sfxBuf.set(key, buf); })
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
  const buf = sfxBuffer(key);
  _sfxLast.set(key, now);
  if (!buf) { m.file ? _sfxStat.pending++ : _sfxStat.missing++; return false; }   // 무음. 났다고 안 적는다.
  const src = _sfxCtx.createBufferSource(); src.buffer = buf;
  const gn = _sfxCtx.createGain(); gn.gain.value = g;
  src.connect(gn); gn.connect(_sfxBus.sfx);
  src.start();
  live.push({ until: now + buf.duration * 1000 });
  _sfxStat.played++;
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
  if (_sfxGroundCell && _sfxGroundCell.k === ck) return _sfxGroundCell.v;
  let v = 'step_dirt';
  try {
    const ts = (typeof window.__tileStateAt === 'function') ? window.__tileStateAt(cell[0], cell[1]) : null;
    if (ts && ts.kind === 'land' && !ts.geo && typeof SoilBase !== 'undefined') {
      const c = (typeof conns !== 'undefined' && typeof primaryZoneId !== 'undefined') ? conns.get(primaryZoneId) : null;
      const B = SoilBase.biomeOf(c && c.meta ? c.meta.biome : undefined);
      const t = Math.max(0, Math.min(1, (ts.soil - B.grass[0]) / (B.grass[1] - B.grass[0])));
      if (t * t * (3 - 2 * t) * B.capG >= 0.5) v = 'step_grass';
    }
  } catch (e) { /* 지형이 아직 안 왔다 — 흙으로 둔다 */ }
  _sfxGroundCell = { k: ck, v };
  return v;
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
// 장면은 **두 축**이다: 마을 안/밖(`__evNearVid`) × 낮/밤(`isNight`). 표에 없는 축은 안 짓는다.
function sfxBgmScene(force) {
  if (!_sfxBgm) return;
  const inVillage = (typeof window.__evNearVid !== 'undefined' && window.__evNearVid != null);
  const night = (typeof isNight === 'function') ? !!isNight() : false;
  const s = inVillage ? (night ? 'village_night' : 'village_day') : 'journey';
  if (!force && s === _sfxBgmScene) return;
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
      // 먹기 — `gauges` 아홉 자리 중 `carry` 를 싣는 것이 `doEat` 하나다(`test-audio ⑦` 이 그 수를 지킨다).
      if (t === 'gauges') { if (msg.carry) sfxPlay('eat'); return; }
      // 낚시 셋 — 서버가 상태를 그대로 말한다. 좌표는 **존 로컬**이라 절대로 접어야 한다(찌 그리기와 같은 함정).
      if (t === 'fish_state') {
        const key = (_sfxMan.fishState || {})[msg.state];
        if (!key) return;
        const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
        if (msg.x != null) sfxPlay(key, { x: msg.x + ox, y: msg.y + oy }); else sfxPlay(key);
        return;
      }
      if (t === 'fish_catch') { sfxPlay('hook'); return; }
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
      window.__sfx.ambient('wind', w.wind, { indoor });
      window.__sfx.ambient('rain', _sfxWx.precip, { indoor });
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
    /** 진단 — 하네스·실기가 읽는다(읽기 전용). */
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
