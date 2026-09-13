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
function sfxBuildGraph() {
  const ctx = _sfxCtx;
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  sfx.connect(master); music.connect(master); master.connect(ctx.destination);
  _sfxBus = { master, sfx, music };
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
function sfxLoop(id, key, gain) {
  const m = sfxKey(key);
  if (!m || !m.loop || !_sfxCtx) return;
  let e = _sfxLoops.get(id);
  if (gain <= 0.001 || !_sfxVol.on) { if (e) { try { e.src.stop(); } catch (err) {} _sfxLoops.delete(id); } return; }
  if (e) { e.gain.gain.setTargetAtTime(gain, _sfxCtx.currentTime, 0.12); e.seen = _sfxScanAt; return; }
  const buf = sfxBuffer(key);
  if (!buf) { m.file ? _sfxStat.pending++ : _sfxStat.missing++; return; }
  const src = _sfxCtx.createBufferSource(); src.buffer = buf; src.loop = true;
  const gn = _sfxCtx.createGain(); gn.gain.value = 0;
  src.connect(gn); gn.connect(_sfxBus.sfx); src.start();
  gn.gain.setTargetAtTime(gain, _sfxCtx.currentTime, 0.2);
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
    /** 동사 발신 훅 — `30-n-net.js sendPrimary` 한 줄이 부른다. 표가 키를 고른다(로직은 여기). */
    verb: (t) => {
      if (!t) return;
      if (t === 'eat' || t === 'eat_dish') sfxPlay('eat');
      else if (t === 'harvest') sfxPlay('harvest');
      else if (t === 'gather') {
        const eq = (typeof equipped !== 'undefined' && equipped) ? String(equipped) : '';
        if (eq.indexOf('axe') >= 0) sfxPlay('axe'); else sfxPlay('harvest');
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
    /** 환경 훅 — `37-r1-weather.js drawWeather` 한 줄이 바람 세기와 실내 여부를 준다. */
    ambient: (key, strength, o) => {
      if (!_sfxCtx) return;
      const m = sfxKey(key); if (!m) return;
      const s = (o && o.indoor) ? 0 : Math.min(1, Math.abs(strength || 0) * (m.gainK || 1));
      sfxLoop('amb:' + key, key, (m.volume || 0) * s);
    },
    /** 개체 훑기 — `34-m-renderloop.js` 한 줄이 이번 프레임의 renderables 와 카메라 중심을 준다.
     *  늑대(단발·쿨다운)와 모닥불(반복·개체마다 하나)을 여기서 가른다. 호출자는 로직 0. */
    scan: (list, cx, cy) => {
      if (!_sfxCtx || !_sfxMan || !list) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - _sfxScanAt < SFX_SCAN_MS) return;
      _sfxScanAt = now;
      const fire = sfxKey('fire');
      for (const r of list) {
        if (!r) continue;
        if (r.kind === 'mob' && r.m && r.m.type === 'wolf') sfxPlay('wolf_growl', { x: r.ax, y: r.ay });
        else if (fire && r.kind === 'building' && r.b && r.b.type === 'campfire') {
          sfxLoop('fire:' + r.b.id, 'fire', sfxGain(fire, r.ax, r.ay));
        }
      }
      sfxLoopSweep('fire:');
      sfxBgmScene(false);
    },
    /** 진단 — 하네스·실기가 읽는다(읽기 전용). */
    dbg: () => ({
      ctx: _sfxCtx ? _sfxCtx.state : null,
      manifest: _sfxMan ? Object.keys(_sfxMan.keys || {}).length : 0,
      manifestErr: _sfxManErr,
      vol: _sfxVol ? Object.assign({}, _sfxVol) : null,
      bgm: _sfxBgm ? { running: _sfxBgm.running, scene: _sfxBgm.scene, mood: _sfxBgm.mood } : null,
      loops: [..._sfxLoops.keys()],
      stat: Object.assign({}, _sfxStat),
      missingFiles: _sfxMan ? Object.keys(_sfxMan.keys || {}).filter((k) => !_sfxMan.keys[k].file) : [],
    }),
  };
}
