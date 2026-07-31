/*!
 * bgm-loops.js — 렌더된 루프 트랙용 무결(gapless) 재생기
 *
 * <audio loop> 은 코덱에 따라 한 바퀴 돌 때 미세한 틈이 생긴다.
 * 여기서는 decodeAudioData 로 통째로 받아 AudioBufferSourceNode(loop=true) 로
 * 샘플 단위로 이어 붙이고, 장면 전환은 등파워 크로스페이드로 처리한다.
 *
 *   const bgm = DurangoLoops.create({ base: '/assets/audio/', volume: 0.35 });
 *   await bgm.start('village_day', 'trad');
 *   bgm.setScene('battle');          // 2.5초 크로스페이드
 *   bgm.setMood('amb');           // trad | amb | ari
 *   bgm.setDayPhase(0.9);            // 낮/밤 자동 전환
 *   bgm.setVolume(0.2); bgm.stop();
 */
(function (global) {
  'use strict';
  const SCENES = ['village_day', 'village_night', 'battle', 'journey'];

  function create(opts) {
    opts = opts || {};
    const base = opts.base || './audio/';
    const S = {
      ctx: null, master: null, layers: [], buffers: {},
      scene: opts.scene || 'village_day', mood: opts.mood || 'trad',
      volume: opts.volume === undefined ? 0.4 : opts.volume,
      autoDayNight: opts.autoDayNight !== false, running: false
    };

    function ext() {
      const a = document.createElement('audio');
      if (a.canPlayType('audio/ogg; codecs=vorbis')) return '.ogg';
      return '.m4a';
    }
    const EXT = opts.format ? ('.' + opts.format.replace('.', '')) : null;

    function url(name) { return base + name + (EXT || ext()); }
    const nameOf = (scene, mood) => scene + '_' + mood;

    async function load(name) {
      if (S.buffers[name]) return S.buffers[name];
      const res = await fetch(url(name));
      if (!res.ok) throw new Error('BGM 로드 실패: ' + url(name));
      const ab = await res.arrayBuffer();
      const buf = await S.ctx.decodeAudioData(ab);
      S.buffers[name] = buf;
      return buf;
    }

    function ensureCtx() {
      if (S.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      S.ctx = new AC();
      S.master = S.ctx.createGain();
      S.master.gain.value = S.volume;
      S.master.connect(S.ctx.destination);
    }

    function fadeOutAll(fade) {
      const now = S.ctx.currentTime;
      for (const L of S.layers) {
        if (L.dying) continue;
        L.dying = true;
        L.gain.gain.cancelScheduledValues(now);
        L.gain.gain.setValueAtTime(L.gain.gain.value, now);
        L.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
        try { L.src.stop(now + fade + 0.05); } catch (e) { }
        setTimeout(() => {
          const i = S.layers.indexOf(L);
          if (i >= 0) S.layers.splice(i, 1);
          try { L.gain.disconnect(); } catch (e) { }
        }, (fade + 0.2) * 1000);
      }
    }

    async function playName(name, fade) {
      ensureCtx();
      if (S.ctx.state === 'suspended') await S.ctx.resume();
      fade = fade === undefined ? 2.5 : fade;
      const buf = await load(name);
      const now = S.ctx.currentTime;
      fadeOutAll(fade);
      const g = S.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(1, now + Math.min(fade, 2.0));
      g.connect(S.master);
      const src = S.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.loopStart = 0; src.loopEnd = buf.duration;   // 샘플 단위 무결 반복
      src.connect(g); src.start(now);
      S.layers.push({ src: src, gain: g, name: name, dying: false });
      S.running = true;
      // 다음에 쓸 법한 트랙 미리 받아두기
      setTimeout(() => { prefetchNeighbors(name); }, 1500);
      return api;
    }

    function prefetchNeighbors(name) {
      const mood = name.slice(name.lastIndexOf('_') + 1);
      for (const sc of SCENES) {
        const n = nameOf(sc, mood);
        if (!S.buffers[n]) { load(n).catch(() => { }); break; }
      }
    }

    const api = {
      async start(scene, mood) {
        if (scene) S.scene = scene;
        if (mood) S.mood = mood;
        return playName(nameOf(S.scene, S.mood), 1.5);
      },
      setScene(scene, fade) {
        if (SCENES.indexOf(scene) < 0 || scene === S.scene) return api;
        S.scene = scene;
        if (S.running) playName(nameOf(scene, S.mood), fade);
        return api;
      },
      setMood(mood, fade) {
        if (mood === S.mood) return api;
        S.mood = mood;
        if (S.running) playName(nameOf(S.scene, mood), fade);
        return api;
      },
      setDayPhase(v) {
        if (!S.autoDayNight) return api;
        if (S.scene !== 'village_day' && S.scene !== 'village_night') return api;
        const want = (v < 0.22 || v > 0.80) ? 'village_night' : 'village_day';
        if (want !== S.scene) api.setScene(want, 4.0);
        return api;
      },
      setVolume(v) {
        S.volume = Math.max(0, Math.min(1, v));
        if (S.master) S.master.gain.setTargetAtTime(S.volume, S.ctx.currentTime, 0.08);
        return api;
      },
      stop(fade) {
        if (!S.running) return api;
        fadeOutAll(fade === undefined ? 1.5 : fade);
        S.running = false;
        return api;
      },
      preload(names) { ensureCtx(); return Promise.all((names || []).map(load)); },
      get scene() { return S.scene; },
      get mood() { return S.mood; },
      get running() { return S.running; },
      get volume() { return S.volume; }
    };
    return api;
  }

  global.DurangoLoops = { create: create, SCENES: SCENES };
})(typeof window !== 'undefined' ? window : globalThis);
