/*!
 * bgm.js — 두랑고 미니 절차적 배경음악 엔진 (Web Audio, 의존성 없음)
 *
 *   const bgm = DurangoBGM.create({ volume: 0.5 });
 *   await bgm.start();                       // 반드시 사용자 클릭 등 제스처 안에서
 *   bgm.setScene('village_day');             // village_day | village_night | battle | journey
 *   bgm.setMood('trad');                     // trad(전통색) | amb(앰비언트) | ari(아리랑 본가락)
 *   bgm.setIntensity(0.8);                   // 0..1 — 전투 격렬도/편성 밀도
 *   bgm.setDayPhase(0.9);                    // 0..1 게임 하루. autoDayNight 시 낮/밤 자동 전환
 *   bgm.setVolume(0.3); bgm.stop();
 *
 * 파일을 하나도 받지 않고 브라우저에서 직접 소리를 만든다.
 * 음계는 평조/계면조 5음계, 리듬은 굿거리·진양조·자진모리·휘모리·세마치 장단.
 * mood='ari' 는 본조 아리랑 16마디를 장면별 편성으로 연주한다(3/4 = 세마치 한 장단).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 잡다
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const PYEONGJO = [0, 2, 5, 7, 9];      // 평조
  const GYEMYEONJO = [0, 3, 5, 7, 10];   // 계면조

  function degMidi(root, mode, deg) {
    const o = Math.floor(deg / mode.length);
    const i = ((deg % mode.length) + mode.length) % mode.length;
    return root + 12 * o + mode[i];
  }
  const dg = (root, mode, deg) => mtof(degMidi(root, mode, deg));

  // 장단 — [소박수, [[위치, 종류, 세기], ...]]  종류 G=덩 g=궁편 c=채편
  const JANGDAN = {
    gutgeori: [12, [[0, 'G', 1.0], [2, 'c', .42], [2.5, 'c', .34], [3, 'g', .72],
      [4, 'c', .40], [5, 'c', .30], [5.5, 'c', .26], [6, 'g', .85],
      [8, 'c', .42], [8.5, 'c', .34], [9, 'g', .62], [10, 'c', .38],
      [11, 'c', .30], [11.5, 'c', .26]]],
    jungjungmori: [12, [[0, 'G', 1.0], [2, 'c', .40], [3, 'g', .66], [5, 'c', .34],
      [6, 'G', .86], [8, 'c', .40], [9, 'g', .62], [11, 'c', .34]]],
    semachi: [9, [[0, 'G', 1.0], [3, 'g', .74], [5, 'c', .46], [6, 'g', .66], [8, 'c', .40]]],
    jajinmori: [12, [[0, 'G', 1.0], [3, 'g', .78], [6, 'G', .92], [9, 'c', .62],
      [10, 'g', .70], [11, 'c', .58]]],
    hwimori: [8, [[0, 'G', 1.0], [2, 'c', .55], [4, 'g', .85], [6, 'c', .60], [7, 'c', .45]]],
    jinyang: [24, [[0, 'G', 1.0], [6, 'c', .36], [12, 'g', .70], [18, 'c', .32], [21, 'c', .24]]]
  };

  // ---------------------------------------------------------------- 본조 아리랑
  // 원본 악보(G장조 3/4 16마디)를 5음계 인덱스로 옮긴 것. do=0 기준.
  //   -2=sol(아래) -1=la(아래) 0=do 1=re 2=mi 3=sol(위)
  // 3/4 한 마디 = 세마치 한 장단(3대박×3소박) 으로 정확히 대응한다.
  const ARI_PENTA = [0, 2, 4, 7, 9];
  function ariMidi(dov, n) {
    const o = Math.floor(n / 5), i = ((n % 5) + 5) % 5;
    return dov + 12 * o + ARI_PENTA[i];
  }
  const ariF = (dov, n) => mtof(ariMidi(dov, n));

  const _A1 = [[0, 1.5, -2], [1.5, .5, -1], [2, .5, -2], [2.5, .5, -1]];
  const _A2 = [[0, 1.5, 0], [1.5, .5, 1], [2, .5, 0], [2.5, .5, 1]];
  const _A3 = [[0, 1, 2], [1, .5, 1], [1.5, .5, 2], [2, .5, 0], [2.5, .5, -1]];
  const _A6 = [[0, .5, 2], [.5, .5, 1], [1, .5, 0], [1.5, .5, -1], [2, .5, -2], [2.5, .5, -1]];
  const _A7 = [[0, 1.5, 0], [1.5, .5, 1], [2, 1, 0]];
  const ARIRANG = [
    _A1, _A2, _A3, _A1, _A2, _A6, _A7, [[0, 2, 0]],
    [[0, 2, 3], [2, 1, 3]], [[0, 1, 3], [1, 1, 2], [2, 1, 1]],
    _A3, _A1, _A2, _A6, _A7, [[0, 3, 0]]
  ];
  const ARI_BASS = [0, 0, -1, -2, 0, -1, 0, 0, 0, 0, -1, -2, 0, -1, 0, 0];
  const ARI_NBAR = ARIRANG.length;

  /** 시김새 — 잔가락(스침음) · 퇴성(끝 흘림). [[박,길이,음,퇴성,잔가락여부]] */
  function ariOrnament(bar, r, level) {
    if (!level) return bar.map((v) => [v[0], v[1], v[2], 0, 0]);
    const out = [];
    for (let k = 0; k < bar.length; k++) {
      const [t, d, n] = bar[k];
      const last = (k === bar.length - 1);
      let bend = 0, g = null;
      if (d >= 1.5 && r() < 0.55 * level) g = [t, 0.16, n + 1];
      else if (d >= 1.0 && r() < 0.30 * level) g = [t, 0.14, n - 1];
      if (last && d >= 1.0 && r() < 0.6 * level) bend = -40;
      if (g) { out.push([g[0], g[1], g[2], 0, 1]); out.push([g[0] + g[1], d - g[1], n, bend, 0]); }
      else out.push([t, d, n, bend, 0]);
    }
    return out;
  }

  // ---------------------------------------------------------------- 선율 생성기
  function Melodist(mode, seed, lo, hi, center) {
    this.mode = mode; this.r = mulberry32(seed);
    this.lo = lo; this.hi = hi; this.center = center;
  }
  Melodist.prototype.pick = function (arr, w) {
    let s = 0; for (let i = 0; i < w.length; i++) s += w[i];
    let x = this.r() * s;
    for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; }
    return arr[arr.length - 1];
  };
  Melodist.prototype.phrase = function (nSobak, density, opt) {
    opt = opt || {};
    const pool0 = opt.durs || [1, 1.5, 2, 3, 4, 6];
    const longBias = opt.longBias || 0;
    let cur = opt.start === undefined ? this.center : opt.start;
    const notes = []; let t = 0;
    while (t < nSobak - 0.4) {
      const remain = nSobak - t;
      const pool = pool0.filter((d) => d <= remain + 0.01);
      if (!pool.length) break;
      const w = pool.map((d) => Math.pow(d, 0.55 + longBias));
      const d = this.pick(pool, w);
      if (this.r() > density) { t += d; continue; }
      if (t + d >= nSobak - 0.5) {
        cur = clamp(Math.round(cur / 5) * 5, this.lo, this.hi);
      } else {
        const step = this.pick([-2, -1, -1, 0, 1, 1, 2, 3, -3],
          [.08, .21, .16, .06, .21, .12, .08, .04, .04]);
        cur = clamp(cur + step, this.lo, this.hi);
      }
      notes.push([t, d, cur]);
      t += d;
    }
    return notes;
  };
  Melodist.prototype.vary = function (notes, amount) {
    const r = this.r;
    return notes.map((n) => {
      let [t, d, p] = n;
      if (r() < amount) p = clamp(p + (r() < 0.5 ? -1 : 1) * (r() < 0.3 ? 2 : 1), this.lo, this.hi);
      if (r() < amount * 0.4) d = Math.max(1, d + (r() < 0.5 ? -1 : 1));
      return [t, d, p];
    });
  };

  // ================================================================ 엔진
  function create(opts) {
    opts = opts || {};
    const state = {
      ctx: null, master: null, dry: null, wet: null, conv: null,
      noiseBuf: null, pluck: {}, programs: [], timer: null,
      scene: opts.scene || 'village_day',
      mood: opts.mood || 'trad',
      intensity: 0.6,
      dayPhase: 0.5,
      autoDayNight: opts.autoDayNight !== false,
      volume: opts.volume === undefined ? 0.5 : opts.volume,
      running: false, seed: opts.seed || 1234
    };
    const LOOKAHEAD = 0.35, TICK = 60;

    // ------------------------------------------------------------ 그래프
    function buildGraph() {
      const ctx = state.ctx;
      const master = ctx.createGain();
      master.gain.value = state.volume;

      // 버스 EQ — 저역 정리 + 존재감 + 공기감 (파이썬 렌더러와 동일한 곡선)
      const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 40;
      const ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 135; ls.gain.value = -4.5;
      const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 265; mud.Q.value = 0.9; mud.gain.value = -2.5;
      const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2600; pres.Q.value = 0.8; pres.gain.value = 2.6;
      const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6200; air.gain.value = 4;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4;
      comp.attack.value = 0.015; comp.release.value = 0.25;

      // 마지막 안전장치 — tanh 소프트 리미터 (절대 0dBFS 를 넘기지 않게)
      const lim = ctx.createWaveShaper();
      const CN = 2048, curve = new Float32Array(CN);
      for (let i = 0; i < CN; i++) {
        const x = (i / (CN - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.35) / Math.tanh(1.35) * 0.93;   // 2배 오버샘플 오버슈트 여유
      }
      lim.curve = curve; lim.oversample = '2x';

      const dry = ctx.createGain(); dry.gain.value = 1;
      const wet = ctx.createGain(); wet.gain.value = 0.9;
      const conv = ctx.createConvolver(); conv.normalize = true;
      conv.buffer = makeIR(2.8, 1.6);

      dry.connect(hpf); wet.connect(conv); conv.connect(hpf);
      hpf.connect(ls); ls.connect(mud); mud.connect(pres); pres.connect(air);
      air.connect(comp); comp.connect(master); master.connect(lim); lim.connect(ctx.destination);

      state.master = master; state.dry = dry; state.wet = wet; state.conv = conv;
      state.eq = { hpf, ls, mud, pres, air };
    }

    function noise() {
      if (state.noiseBuf) return state.noiseBuf;
      const ctx = state.ctx, n = ctx.sampleRate * 4;
      const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      const r = mulberry32(9182);
      for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
      state.noiseBuf = b; return b;
    }

    function makeIR(dur, decay) {
      const ctx = state.ctx, n = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      const r = mulberry32(4711);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate;
          const e = Math.exp(-t / decay);
          const x = (r() * 2 - 1) * e;
          lp += (x - lp) * 0.35;            // 고역이 먼저 죽도록
          d[i] = lp * 0.7 + x * 0.3;
        }
        // 초기 반사
        for (let k = 0; k < 12; k++) {
          const idx = Math.floor((0.012 + r() * 0.07) * ctx.sampleRate);
          if (idx < n) d[idx] += (r() * 0.5 + 0.25) * (k % 2 ? -1 : 1);
        }
      }
      return b;
    }

    // 발현악기(가야금/거문고) — JS 에서 Karplus-Strong 을 직접 계산해 버퍼로 캐시
    function pluckBuf(freq, dark) {
      const key = Math.round(freq * 4) + (dark ? 'd' : 'g');
      if (state.pluck[key]) return state.pluck[key];
      const ctx = state.ctx, sr = ctx.sampleRate;
      const len = Math.floor(sr * (dark ? 3.0 : 2.6));
      const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      const D = Math.max(4, Math.round(sr / freq));
      const buf = new Float32Array(D);
      const r = mulberry32(Math.round(freq * 17) + (dark ? 3 : 0));
      let lp = 0;
      for (let i = 0; i < D; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / D);
        let x = (r() * 2 - 1) * Math.sqrt(w);
        lp += (x - lp) * (dark ? 0.18 : 0.42);   // 여기 굵기 = 명주현/술대
        buf[i] = lp;
      }
      buf[0] += dark ? 0.5 : 0.7;                // 손톱/술대 어택
      const fb = dark ? 0.9925 : 0.9958;
      let idx = 0, prev = 0, peak = 0;
      const bodyA = dark ? 0.10 : 0.22;
      let body = 0;
      for (let i = 0; i < len; i++) {
        const cur = buf[idx];
        const y = (cur * 0.62 + prev * 0.38) * fb;
        prev = cur; buf[idx] = y; idx = (idx + 1) % D;
        body += (cur - body) * bodyA;            // 통 울림 저역
        const s = cur * 0.85 + body * 0.35;
        d[i] = s;
        const a = Math.abs(s); if (a > peak) peak = a;
      }
      // 오동나무 공명통 — 현만 있으면 얇고 전자적으로 들린다
      const box = new Float32Array(len);
      const specs = dark
        ? [[102, 3.5, 0.55], [196, 4.5, 0.50], [300, 4.0, 0.30], [470, 3.0, 0.16]]
        : [[128, 3.4, 0.42], [238, 4.0, 0.34], [382, 4.0, 0.22], [560, 3.2, 0.11]];
      for (const [f0, q, g] of specs) resoAdd(d, box, f0, q, g, sr);
      peak = 0;
      for (let i = 0; i < len; i++) {
        d[i] = d[i] * (dark ? 0.75 : 0.95) + box[i] * (dark ? 0.9 : 0.55);
        const a = Math.abs(d[i]); if (a > peak) peak = a;
      }
      if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
      state.pluck[key] = b;
      return b;
    }

    // ---- 막(膜) 물리: 원형막 고유모드 (m, 베셀 영점). 비 = z / 2.4048
    const MEM = [[0, 2.4048], [1, 3.8317], [2, 5.1356], [0, 5.5201], [3, 6.3802],
    [1, 7.0156], [4, 7.5883], [2, 8.4172], [0, 8.6537], [3, 9.7610],
    [1, 10.1735], [4, 11.0647], [2, 11.6198], [0, 11.7915]];
    const J01 = 2.4048;

    /** 제1종 베셀 함수 — 적분식으로 수치 계산(버퍼 만들 때 한 번만 돈다). */
    function besselJ(m, x) {
      let s = 0; const N = 160;
      for (let i = 0; i < N; i++) {
        const th = Math.PI * (i + 0.5) / N;
        s += Math.cos(m * th - x * Math.sin(th));
      }
      return s / N;
    }

    /** 공진형 대역통과를 dst 에 더한다(통·판 울림). */
    function resoAdd(src, dst, f0, q, gain, sr) {
      const w0 = 2 * Math.PI * f0 / sr, al = Math.sin(w0) / (2 * q);
      const a0 = 1 + al, a1 = -2 * Math.cos(w0), a2 = 1 - al;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < src.length; i++) {
        const x = src[i];
        const y = (al * x - al * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        dst[i] += gain * y;
      }
    }

    /**
     * 막을 한 번 때린 소리를 버퍼로 굽는다.
     * 타점 위치(strike 0=한복판, 1=테두리)에 따라 살아나는 모드가 달라진다 —
     * 사인파 하나로는 북 소리가 나지 않는다.
     */
    function drumBuf(kind, v) {
      const key = kind + v;
      state.drum = state.drum || {};
      if (state.drum[key]) return state.drum[key];
      const ctx = state.ctx, sr = ctx.sampleRate;
      const P = {
        gung: { tune: 142, strike: 0.30 + 0.05 * v, t60: 0.34, hi: 1.25, gl: 0.16, glT: 0.022, dur: 0.95,
          body: [[84, 3.2, 0.55], [163, 5, 0.85], [298, 6, 0.40], [505, 5, 0.18]], lp: 4800, touch: 1, knock: 830 },
        chae: { tune: 430, strike: 0.66 + 0.06 * v, t60: 0.052, hi: 1.6, gl: 0.10, glT: 0.008, dur: 0.45,
          body: [[612, 6, 0.28], [1140, 8, 0.22], [298, 5, 0.12]], hp: 260, click: 1, knock: 1250 },
        buk: { tune: 88, strike: 0.28 + 0.04 * v, t60: 0.46, hi: 1.4, gl: 0.22, glT: 0.026, dur: 1.35,
          body: [[66, 3, 0.7], [124, 4.5, 0.55], [232, 5.5, 0.28]], lp: 4200, touch: 1, stickBP: 1 }
      }[kind];
      const len = Math.floor(sr * P.dur);
      const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      const r = mulberry32(9001 + v * 137 + kind.length * 31);

      // 모드 합 (장력 변조로 처음에 음이 올라갔다 내려온다)
      const head = new Float32Array(len);
      let ph = 0, tot = 0;
      const ws = [], decs = [], phs = [];
      for (const [m, z] of MEM) {
        const w = Math.abs(besselJ(m, z * Math.min(0.98, Math.max(0.02, P.strike))));
        if (w < 5e-3) { ws.push(0); decs.push(1); phs.push(0); continue; }
        ws.push(w); tot += w;
        decs.push(Math.max(0.004, P.t60 / (1 + P.hi * (z / J01 - 1))));
        phs.push(r() * 6.283);
      }
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        ph += 2 * Math.PI * P.tune * (1 + P.gl * Math.exp(-t / P.glT)) / sr;
        let s = 0;
        for (let k = 0; k < MEM.length; k++) {
          if (!ws[k]) continue;
          s += ws[k] * Math.sin(ph * (MEM[k][1] / J01) + phs[k]) * Math.exp(-t / decs[k]);
        }
        head[i] = tot ? s / tot : 0;
      }

      // 손/채가 가죽에 닿는 소리
      const touch = new Float32Array(len);
      let lpv = 0, hpv = 0, prevn = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, n = r() * 2 - 1;
        lpv += (n - lpv) * (P.click ? 0.85 : 0.16);
        let s = 0;
        if (P.touch) s += lpv * Math.exp(-t / 0.009);
        if (P.click) { hpv = 0.86 * (hpv + n - prevn); prevn = n; s += hpv * Math.exp(-t / 0.0032) * 1.7; }
        if (P.stickBP) s += (n - lpv) * Math.exp(-t / 0.0045) * 1.4;
        touch[i] = s;
      }
      if (P.knock) {
        const imp = new Float32Array(len);
        for (let i = 0; i < len; i++) imp[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.0025);
        const kn = new Float32Array(len);
        resoAdd(imp, kn, P.knock, P.click ? 10 : 7, 1.0, sr);
        for (let i = 0; i < len; i++) touch[i] += kn[i] * Math.exp(-i / sr / 0.014) * (P.click ? 0.75 : 1.1);
      }

      // 통 울림
      const mixin = new Float32Array(len);
      for (let i = 0; i < len; i++) mixin[i] = head[i] * 0.75 + touch[i];
      const box = new Float32Array(len);
      for (const [f0, q, g] of P.body) resoAdd(mixin, box, f0, q, g, sr);

      let peak = 0, lo = 0, hi1 = 0, hp1 = 0;
      for (let i = 0; i < len; i++) {
        let s = head[i] + touch[i] * 0.85 + box[i] * 0.8;
        if (P.lp) { lo += (s - lo) * (1 - Math.exp(-2 * Math.PI * P.lp / sr)); s = lo; }
        if (P.hp) { hi1 += (s - hi1) * (1 - Math.exp(-2 * Math.PI * P.hp / sr)); s = s - hi1; }
        d[i] = s;
        const a = Math.abs(s); if (a > peak) peak = a;
      }
      if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
      state.drum[key] = b;
      return b;
    }

    // ------------------------------------------------------------ 보이스
    function envGain(t0, peak, a, d, s, r, dur) {
      const g = state.ctx.createGain();
      const p = g.gain;
      p.setValueAtTime(0.0001, t0);
      p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      p.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t0 + a + d);
      p.setValueAtTime(Math.max(0.0002, peak * s), t0 + Math.max(a + d, dur - r));
      p.exponentialRampToValueAtTime(0.0001, t0 + dur);
      return g;
    }

    function noiseSrc(t0, dur) {
      const s = state.ctx.createBufferSource();
      s.buffer = noise(); s.loop = true;
      s.playbackRate.value = 0.9 + Math.random() * 0.2;
      s.start(t0, Math.random() * 3); s.stop(t0 + dur + 0.05);
      return s;
    }

    function panTo(node, pan, send) {
      const ctx = state.ctx;
      let p;
      if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = pan; }
      else { p = ctx.createGain(); }
      node.connect(p);
      const sg = ctx.createGain(); sg.gain.value = send === undefined ? 0.3 : send;
      p.connect(sg); sg.connect(state.wet);
      return p;                      // 호출부에서 p.connect(program.out)
    }

    // 관악기 (대금/단소/피리)
    function blow(out, t0, freq, dur, o) {
      o = o || {};
      const ctx = state.ctx;
      const amp = (o.amp === undefined ? 0.5 : o.amp) * 0.47;   // 관악 전체 균형
      const harm = Math.min(8, o.harm || 7), bright = o.bright === undefined ? 1 : o.bright;
      const g = envGain(t0, amp, o.attack || 0.07, 0.1, 0.82, o.release || 0.16, dur);

      // 비브라토(요성) — 지연 후 서서히 깊어진다
      const lfo = ctx.createOscillator(); lfo.frequency.value = o.vibRate || 4.8;
      const lfoG = ctx.createGain();
      const vd = Math.min(o.vibDelay === undefined ? 0.28 : o.vibDelay, dur * 0.5);
      lfoG.gain.setValueAtTime(0.001, t0);
      lfoG.gain.setValueAtTime(0.001, t0 + vd);
      lfoG.gain.linearRampToValueAtTime(o.vibCents || 28, t0 + vd + 0.35);
      lfo.connect(lfoG);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);

      const type = o.reed ? 'sawtooth' : 'sine';
      for (let k = 1; k <= harm; k++) {
        if (freq * k > 16000) break;
        const osc = ctx.createOscillator();
        osc.type = k === 1 && o.reed ? type : 'sine';
        osc.frequency.value = freq * k;
        // 어택 스쿱
        osc.detune.setValueAtTime(-(o.scoop || 35), t0);
        osc.detune.linearRampToValueAtTime(0, t0 + 0.09);
        if (o.bendEnd) {
          osc.detune.setValueAtTime(0, t0 + dur * 0.6);
          osc.detune.linearRampToValueAtTime(o.bendEnd, t0 + dur);
        }
        lfoG.connect(osc.detune);
        const kg = ctx.createGain();
        let a = 1 / Math.pow(k, 1.9 - 0.55 * bright);
        if (k % 2 === 0) a *= 0.55;
        kg.gain.setValueAtTime(0.0001, t0);
        kg.gain.linearRampToValueAtTime(a, t0 + (k <= 2 ? 0.02 : 0.02 * k + 0.08));
        osc.connect(kg); kg.connect(g);
        osc.start(t0); osc.stop(t0 + dur + 0.06);
      }
      // 숨소리
      const nz = noiseSrc(t0, dur);
      const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
      bpf.frequency.value = clamp(freq * 3, 700, 9000); bpf.Q.value = 0.7;
      const ng = ctx.createGain(); ng.gain.value = (o.breath === undefined ? 0.06 : o.breath) * 1.6;
      nz.connect(bpf); bpf.connect(ng); ng.connect(g);

      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = clamp(freq * 12 + 2500, 900, 16000);
      g.connect(lp);
      panTo(lp, o.pan || 0, o.send).connect(out);
    }

    const daegeum = (out, t, f, d, o) => blow(out, t, f, d, Object.assign(
      { breath: 0.085, vibRate: 4.6, vibCents: 34, harm: 9, bright: 1.05, scoop: 45, attack: 0.085, release: 0.2 }, o));
    const danso = (out, t, f, d, o) => blow(out, t, f, d, Object.assign(
      { breath: 0.15, vibRate: 5.4, vibCents: 22, harm: 6, bright: 0.75, scoop: 28, attack: 0.1, release: 0.24 }, o));
    const piri = (out, t, f, d, o) => blow(out, t, f, d, Object.assign(
      { breath: 0.05, vibRate: 5.0, vibCents: 30, harm: 12, bright: 1.5, scoop: 30, attack: 0.045, release: 0.13, reed: true }, o));

    // 발현악기
    function pluckPlay(out, t0, freq, dur, o) {
      o = o || {};
      const ctx = state.ctx;
      const dark = !!o.dark;
      const base = dark ? 196 : 262;                 // 캐시 절약: 반음 단위로 버퍼 공유
      const nearest = Math.pow(2, Math.round(Math.log2(freq / base) * 12) / 12) * base;
      const buf = pluckBuf(nearest, dark);
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = freq / nearest;
      if (o.nonghyeon) {                              // 농현 — 왼손 흔들기
        const lfo = ctx.createOscillator(); lfo.frequency.value = 4.4;
        const lg = ctx.createGain();
        const depth = (Math.pow(2, o.nonghyeon / 1200) - 1) * s.playbackRate.value;
        lg.gain.setValueAtTime(0.0001, t0);
        lg.gain.setValueAtTime(0.0001, t0 + 0.16);
        lg.gain.linearRampToValueAtTime(depth, t0 + 0.46);
        lfo.connect(lg); lg.connect(s.playbackRate);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      const g = ctx.createGain();
      const amp = (o.amp === undefined ? 0.5 : o.amp) * (dark ? 1.45 : 1.0);
      g.gain.setValueAtTime(amp, t0);
      g.gain.setTargetAtTime(0.0001, t0 + dur * 0.55, Math.max(0.08, dur * 0.28));
      g.gain.setValueAtTime(0.0001, t0 + dur + 0.02);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = dark ? 2200 : 7000;
      s.connect(tone); tone.connect(g);
      panTo(g, o.pan || 0, o.send).connect(out);
      s.start(t0); s.stop(t0 + dur + 0.05);
    }
    const gayageum = (out, t, f, d, o) => pluckPlay(out, t, f, d, o);

    /**
     * 거문고 — 뜯는 악기가 아니라 술대(대나무 채)로 때리는 악기.
     * 술대가 대모를 치는 '탁' 소리가 음보다 먼저 온다. 그게 빠지면 거문고가 아니다.
     */
    function geomungo(out, t0, freq, dur, o) {
      o = o || {};
      const ctx = state.ctx;
      const amp = (o.amp === undefined ? 0.5 : o.amp);
      // ① 술대 타격
      const mk = (lo, hi, dec, gain) => {
        const nz = noiseSrc(t0, dec * 6 + 0.02);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass';
        f.frequency.value = Math.sqrt(lo * hi); f.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp * gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec * 6);
        nz.connect(f); f.connect(g);
        return g;
      };
      const slap = ctx.createGain(); slap.gain.value = 1;
      mk(900, 5400, 0.0075, 1.5).connect(slap);
      mk(170, 760, 0.030, 0.8).connect(slap);
      const wood = ctx.createBiquadFilter(); wood.type = 'bandpass';
      wood.frequency.value = 1380; wood.Q.value = 9;
      const wn = noiseSrc(t0, 0.09);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(amp * 0.9, t0);
      wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
      wn.connect(wood); wood.connect(wg); wg.connect(slap);
      panTo(slap, o.pan || 0, (o.send === undefined ? 0.3 : o.send) * 0.6).connect(out);
      // ② 현
      pluckPlay(out, t0, freq, dur, Object.assign({}, o, { dark: true, amp: amp * 0.85 }));
    }

    // 타악 — 미리 구워둔 막 모드 버퍼를 타점 변형 4종으로 돌려 쓴다
    let _drumRR = 0;
    function hitDrum(out, t0, kind, amp, pan, send, gainScale) {
      const ctx = state.ctx;
      const v = (_drumRR++) & 3;
      const s = ctx.createBufferSource();
      s.buffer = drumBuf(kind, v);
      s.playbackRate.value = 0.97 + 0.06 * ((_drumRR * 7919 % 100) / 100);
      const g = ctx.createGain();
      g.gain.value = Math.max(0.0001, amp * gainScale);
      s.connect(g);
      panTo(g, pan || 0, send === undefined ? 0.3 : send).connect(out);
      s.start(t0);
      s.stop(t0 + s.buffer.duration + 0.05);
    }
    const janggu_gung = (out, t, amp, pan, send) => hitDrum(out, t, 'gung', amp, pan, send, 0.80);
    const buk = (out, t, amp, pan, send) => hitDrum(out, t, 'buk', amp, pan, send, 2.05);

    function janggu_chae(out, t0, amp, pan, send) {
      hitDrum(out, t0, 'chae', amp, pan, send, 0.55);
    }

    function metal(out, t0, o) {
      const ctx = state.ctx;
      const ratios = o.small ? [1, 1.72, 2.44, 3.19, 4.31, 5.7, 7.2]
        : [1, 1.47, 2.09, 2.61, 3.31, 4.02, 4.77, 5.61, 6.9];
      const sum = ctx.createGain(); sum.gain.value = o.amp;
      ratios.forEach((r, i) => {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = o.base * r * (1 + (i % 3 - 1) * 0.003);
        const g = ctx.createGain();
        const dec = (o.small ? 0.5 : 2.6) / (1 + (o.small ? 0.4 : 0.55) * i);
        const bloom = o.small ? 0.004 : 0.05 + 0.2 * (i / ratios.length);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(1 / (1 + 0.55 * i), t0 + bloom);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
        osc.connect(g); g.connect(sum);
        osc.start(t0); osc.stop(t0 + dec + 0.05);
      });
      const nz = noiseSrc(t0, 0.08);
      const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
      bpf.frequency.value = o.small ? 6000 : 4000; bpf.Q.value = 0.5;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(o.amp * (o.small ? 0.5 : 0.25), t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      nz.connect(bpf); bpf.connect(ng); ng.connect(sum);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.small ? 400 : 90;
      sum.connect(hp);
      panTo(hp, o.pan || 0, o.send === undefined ? 0.4 : o.send).connect(out);
    }
    const jing = (out, t, amp, pan, send, base) =>
      metal(out, t, { base: base || 118, amp: amp * 0.5, pan: pan, send: send });
    const kkwaenggwari = (out, t, amp, pan, send) =>
      metal(out, t, { base: 430, amp: amp * 0.36, small: true, pan: pan, send: send });

    // 패드 / 바람
    function pad(out, t0, freq, dur, o) {
      o = o || {};
      const ctx = state.ctx;
      const g = ctx.createGain();
      const amp = o.amp === undefined ? 0.3 : o.amp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + (o.attack || 2.5));
      g.gain.setValueAtTime(amp, t0 + Math.max(o.attack || 2.5, dur - (o.release || 3)));
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      const V = o.voices || 4, det = o.detune || 7;
      for (let v = 0; v < V; v++) {
        const osc = ctx.createOscillator();
        osc.type = o.saw ? 'sawtooth' : 'sine';
        osc.frequency.value = freq;
        osc.detune.value = (v - (V - 1) / 2) * det;
        const vg = ctx.createGain(); vg.gain.value = (o.saw ? 0.35 : 1) / V;
        osc.connect(vg); vg.connect(g);
        osc.start(t0); osc.stop(t0 + dur + 0.1);
      }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = o.cutoff || 1200; lp.Q.value = 0.4;
      // 아주 느린 필터 흔들림
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lg = ctx.createGain(); lg.gain.value = (o.cutoff || 1200) * 0.2;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.1);
      g.connect(lp);
      panTo(lp, o.pan || 0, o.send === undefined ? 0.5 : o.send).connect(out);
    }

    function windBed(out, t0, dur, o) {
      o = o || {};
      const ctx = state.ctx;
      const nz = noiseSrc(t0, dur);
      const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
      bpf.frequency.value = o.hz || 600; bpf.Q.value = o.q || 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lg = ctx.createGain(); lg.gain.value = (o.hz || 600) * 0.45;
      lfo.connect(lg); lg.connect(bpf.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.2);
      const g = ctx.createGain();
      const amp = o.amp === undefined ? 0.08 : o.amp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 2.5);
      g.gain.setValueAtTime(amp, t0 + Math.max(3, dur - 3));
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      nz.connect(bpf); bpf.connect(g);
      panTo(g, o.pan || 0, 0.25).connect(out);
    }

    function chirp(out, t0, o) {          // 풀벌레 한 마디
      const ctx = state.ctx;
      const nz = noiseSrc(t0, 0.6);
      const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
      bpf.frequency.value = o.hz; bpf.Q.value = 14;
      const g = ctx.createGain(); g.gain.value = 0;
      const rate = o.rate || 12;
      for (let i = 0; i < 7; i++) {
        const t = t0 + i / rate;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(o.amp, t + 0.012);
        g.gain.linearRampToValueAtTime(0.0001, t + 1 / rate * 0.55);
      }
      nz.connect(bpf); bpf.connect(g);
      panTo(g, o.pan || 0, 0.3).connect(out);
    }

    // ------------------------------------------------------------ 프로그램
    function makeProgram(scene, mood, seed) {
      const ctx = state.ctx;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.connect(state.dry);
      const r = mulberry32(seed);
      const P = {
        scene: scene, mood: mood, out: out, rnd: r,
        cycle: 0, nextTime: 0, dying: false, bedUntil: 0
      };

      // 장면별 설정
      const cfg = {
        village_day: { root: 58, mode: PYEONGJO, jangdan: 'gutgeori', sobak: 0.395 },
        village_night: { root: 53, mode: GYEMYEONJO, jangdan: 'jinyang', sobak: 0.30 },
        battle: { root: 56, mode: GYEMYEONJO, jangdan: 'jajinmori', sobak: 0.155 },
        journey: { root: 55, mode: PYEONGJO, jangdan: 'semachi', sobak: 0.235 }
      }[scene];
      P.cfg = cfg;

      // 아리랑 편성 — 장면마다 조(do)·박 길이·절 구성이 다르다
      P.ari = {
        village_day: {
          do: 70, beat: 0.72, drumBase: 0.62, swing: 0.14,
          gaya: [[0, 0], [.5, 2], [1, 4], [1.5, 2], [2, 3], [2.5, 4]], gayaAmp: 0.24,
          passes: [
            { drum: .75, lead: [{ i: 'daegeum', amp: .40, orn: .6, vib: 30 }], bassEvery: 2 },
            { drum: 1.0, buk: 4, lead: [{ i: 'daegeum', amp: .44, orn: 1.2, vib: 36 }], bassEvery: 1 },
            { drum: .9, lead: [{ i: 'daegeum', amp: .40, orn: 1.0, vib: 34 }, { i: 'danso', amp: .20, orn: .4, oct: 1, pan: .44 }], bassEvery: 2 }
          ]
        },
        village_night: {
          do: 65, beat: 1.26, drumBase: 0.5, swing: 0,
          gaya: [[0, 0], [1.5, 4]], gayaAmp: 0.20,
          passes: [
            { drum: .34, lead: [{ i: 'daegeum', amp: .38, orn: .8, vib: 42, send: .55 }], bassEvery: 2 },
            { drum: .28, lead: [{ i: 'danso', amp: .28, orn: 1.3, vib: 24, oct: 1, pan: -.28, send: .6 }, { i: 'daegeum', amp: .20, orn: 0, vib: 44, pan: .22, send: .6 }], bassEvery: 2 }
          ]
        },
        battle: {
          do: 68, beat: 0.555, drumBase: 0.95, swing: 0,
          gaya: [[0, 0], [1, 4], [2, 2]], gayaAmp: 0.20,
          passes: [
            { drum: .85, buk: 1, lead: [{ i: 'daegeum', amp: .34, orn: .4, vib: 26, send: .26 }], bassEvery: 1 },
            { drum: 1.0, buk: 1, kk: 1, lead: [{ i: 'piri', amp: .30, orn: .9, vib: 30, send: .26 }, { i: 'daegeum', amp: .18, orn: 0, oct: -1, pan: .25, send: .3 }], bassEvery: 1 },
            { drum: 1.0, buk: 1, kk: 1, lead: [{ i: 'piri', amp: .32, orn: 1.4, vib: 34, send: .26 }, { i: 'piri', amp: .15, orn: 0, oct: 1, pan: .42, send: .34 }], bassEvery: 1 },
            { drum: .9, buk: 2, lead: [{ i: 'daegeum', amp: .36, orn: .7, vib: 30, send: .3 }], bassEvery: 1 }
          ]
        },
        journey: {
          do: 67, beat: 0.62, drumBase: 0.6, swing: 0.12,
          gaya: [[0, 0], [.5, 2], [1, 4], [1.5, 2], [2, 4], [2.5, 3]], gayaAmp: 0.24,
          passes: [
            { drum: .55, lead: [{ i: 'daegeum', amp: .38, orn: .5, vib: 28 }], bassEvery: 2 },
            { drum: .75, buk: 8, lead: [{ i: 'daegeum', amp: .42, orn: 1.1, vib: 32 }, { i: 'danso', amp: .18, orn: 0, oct: 1, pan: .44 }], bassEvery: 1 },
            { drum: .7, lead: [{ i: 'daegeum', amp: .40, orn: .9, vib: 30 }], bassEvery: 2 }
          ]
        }
      }[scene];

      /** 아리랑 한 마디(=세마치 한 장단). 반환값은 마디 길이(초). */
      P.ariBar = function (t0, c) {
        const A = P.ari, hot = clamp(state.intensity, 0, 1);
        const beat = (scene === 'battle') ? A.beat * (1.18 - 0.28 * hot) : A.beat;
        const sob = beat / 3, barLen = beat * 3;
        const b = c % ARI_NBAR;
        const pass = A.passes[Math.floor(c / ARI_NBAR) % A.passes.length];
        const acc = A.do - 24;
        const dg2 = pass.drum * (scene === 'battle' ? (0.55 + 0.45 * hot) : 1);

        P.jangdanHit('semachi', t0, sob, A.drumBase * dg2, dg2 < 0.6, A.swing);
        if (pass.buk && b % pass.buk === 0) buk(out, t0, 0.42 * dg2, 0.12, 0.22);
        if (pass.kk && b % 2 === 0) kkwaenggwari(out, t0, 0.3 * dg2, 0.45, 0.26);
        if (b === 8 && scene === 'battle') jing(out, t0, 0.36 * dg2, 0.3, 0.3, 126);
        if (b === 0 && scene === 'journey') jing(out, t0, 0.24, 0.35, 0.42, 132);
        if (b === 0 && scene === 'village_night' && c % (ARI_NBAR * 2) === 0) jing(out, t0, 0.2, 0.45, 0.7, 104);

        const bass = ARI_BASS[b];
        if (b % (pass.bassEvery || 1) === 0) {
          geomungo(out, t0, ariF(acc, bass), barLen * 0.9, { amp: .36, pan: -.34, send: .3 });
        }
        for (let i = 0; i < A.gaya.length; i++) {
          const [pos, dn] = A.gaya[i];
          gayageum(out, t0 + pos * beat + (r() - .5) * 0.02, ariF(acc + 12, bass + dn),
            Math.min(1.6, barLen * 0.6),
            { amp: A.gayaAmp * (i ? .85 : 1), nonghyeon: i ? 0 : 14, pan: .30, send: .34 });
        }
        for (const L of pass.lead) {
          const inst = { daegeum: daegeum, danso: danso, piri: piri }[L.i];
          for (const [bt, bd, n, bend, isG] of ariOrnament(ARIRANG[b], r, L.orn)) {
            inst(out, t0 + bt * beat, ariF(A.do + 12 * (L.oct || 0), n), bd * beat * 0.95, {
              amp: L.amp * (isG ? 0.55 : 1), vibCents: bd >= 1 ? (L.vib || 30) : 18,
              vibDelay: bd >= 1 ? 0.2 : 0.34, bendEnd: bend,
              pan: L.pan === undefined ? -0.18 : L.pan, send: L.send === undefined ? 0.44 : L.send
            });
          }
        }
        return barLen;
      };

      P.mel = new Melodist(cfg.mode, seed + 7, -1, 9, 3);
      P.bank = [P.mel.phrase(JANGDAN[cfg.jangdan][0] * 2, 0.6),
      P.mel.phrase(JANGDAN[cfg.jangdan][0] * 2, 0.55, { longBias: 0.35 }),
      P.mel.phrase(JANGDAN[cfg.jangdan][0] * 2, 0.65),
      P.mel.phrase(JANGDAN[cfg.jangdan][0] * 2, 0.5, { longBias: 0.6 })];

      P.jangdanHit = function (name, t0, sobak, gain, soft, swing) {
        const [n, pat] = JANGDAN[name];
        for (const [pos, kind, v0] of pat) {
          const sw = (swing || 0) * ((pos % 3) === 2 ? 0.5 : 0);
          const t = Math.max(0, t0 + (pos + sw) * sobak + (r() - 0.5) * 0.018);
          const v = v0 * (0.92 + r() * 0.16) * gain;
          if (kind === 'G' || kind === 'g') janggu_gung(out, t, v * (soft ? 0.55 : 1), -0.16, 0.3);
          if (kind === 'G' || kind === 'c') janggu_chae(out, t, v * (soft ? 0.4 : 1) * (kind === 'G' ? 0.75 : 1), 0.2, 0.3);
        }
      };

      // 장면별 한 주기 스케줄러 — 반환값은 주기 길이(초)
      P.scheduleCycle = function (t0) {
        const c = P.cycle++;
        const I = state.intensity;
        const amb = (P.mood === 'amb');
        const ari = (P.mood === 'ari');
        const S = cfg.sobak, M = cfg.mode, R = cfg.root;
        const jd = JANGDAN[cfg.jangdan][0];

        // 배경 이불(바람/벌레) — 12초마다 갱신
        if (t0 >= P.bedUntil) {
          const L = 13;
          windBed(out, t0, L, {
            amp: (scene === 'battle' ? 0.05 : amb ? 0.10 : 0.06),
            hz: scene === 'village_night' ? 320 : 700, pan: (r() - 0.5) * 0.6
          });
          if (scene === 'village_night') {
            for (let k = 0; k < (amb ? 4 : 2); k++) {
              chirp(out, t0 + r() * L, { hz: 3400 + r() * 2200, amp: 0.012, rate: 9 + r() * 6, pan: (r() - 0.5) * 1.4 });
            }
          }
          P.bedUntil = t0 + L - 0.5;
        }

        if (ari) return P.ariBar(t0, c);

        if (scene === 'village_day') {
          const cycle = jd * S;
          const dens = (c % 20 < 4 || (c % 20 >= 12 && c % 20 < 16)) ? 0.72 : 1.0;
          if (!amb) {
            P.jangdanHit('gutgeori', t0, S, 0.62 * dens, dens < 0.9, 0.28);
            const steps = (c % 4 < 2) ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
            [0, 2, 3, 5, 6, 8, 9, 11].forEach((s, i) => {
              const deg = (steps[i % 5] % 10) - 5;
              gayageum(out, t0 + s * S + (r() - .5) * 0.02, dg(R, M, deg), 1.9,
                { amp: 0.40 * (dens < 0.9 ? 0.85 : 1), nonghyeon: i % 3 === 0 ? 16 : 0, pan: 0.3, send: 0.34 });
            });
            if (c % 4 === 0) geomungo(out, t0, dg(R - 12, M, 0), 3.4, { amp: 0.42, pan: -0.35, send: 0.3 });
            if (c % 2 === 0 && !(c % 20 >= 12 && c % 20 < 16)) {
              const ph = c % 40 < 20 ? P.bank[(c >> 1) % 4] : P.mel.vary(P.bank[(c >> 1) % 4], 0.35);
              for (const [st, d, n] of ph) {
                daegeum(out, t0 + st * S, dg(R + 12, M, n), d * S * 0.94, {
                  amp: 0.42, vibCents: d >= 3 ? 34 : 20, vibDelay: d >= 3 ? 0.22 : 0.35,
                  bendEnd: (d >= 4 && r() < 0.5) ? -38 : 0, pan: -0.18, send: 0.42
                });
              }
            } else if (c % 20 >= 12 && c % 20 < 16 && c % 2 === 1) {
              for (const [st, d, n] of P.mel.phrase(12, 0.55, { start: 6 })) {
                danso(out, t0 + st * S, dg(R + 12, M, n + 2), d * S * 0.9, { amp: 0.3, pan: 0.42, send: 0.48 });
              }
            }
          } else {
            // 앰비언트: 패드 + 성긴 뜯음
            const deg = [[0, 2, 4], [0, 3, 5], [-1, 1, 3], [1, 3, 5]][c % 4];
            deg.forEach((dgi, j) => pad(out, t0, dg(R - 12 + (j ? 12 : 0), M, dgi), cycle + 5,
              { amp: 0.26 * (j ? 0.62 : 1), cutoff: 900 + 260 * j, attack: 2.2, release: 2.8, pan: -0.3 + 0.3 * j, send: 0.45 }));
            for (let k = 0; k < 2; k++) {
              if (r() < 0.75) gayageum(out, t0 + r() * cycle, dg(R + 12, M, Math.floor(r() * 6)), 3.2,
                { amp: 0.24, nonghyeon: r() < 0.4 ? 12 : 0, pan: (r() - .5) * 1.0, send: 0.55 });
            }
            janggu_gung(out, t0, 0.16, -0.1, 0.4);
            if (c % 3 === 1) {
              for (const [st, d, n] of P.mel.phrase(6, 0.45, { durs: [2, 3, 4, 6], longBias: 0.8 })) {
                danso(out, t0 + st * 0.62, dg(R + 12, M, n), d * 0.62, { amp: 0.26, vibCents: 18, pan: -0.2, send: 0.55 });
              }
            }
          }
          return cycle;
        }

        if (scene === 'village_night') {
          const cycle = jd * S;                 // 7.2s
          if (!amb) {
            P.jangdanHit('jinyang', t0, S, 0.34, true, 0);
            if (c % 2 === 0) geomungo(out, t0, dg(R - 12, M, c % 4 === 0 ? 0 : 4), 6.0, { amp: 0.4, pan: -0.4, send: 0.4 });
            for (let k = 0; k < 3; k++) {
              const s = [0, 4, 8, 12, 16, 20][Math.floor(r() * 6)];
              gayageum(out, t0 + s * S, dg(R, M, Math.floor(r() * 6)), 3.6,
                { amp: 0.36, nonghyeon: 26, pan: 0.34, send: 0.5 });
            }
            if (c % 2 === 1) {
              for (const [st, d, n] of P.mel.phrase(24, 0.42, { durs: [3, 4, 6, 8, 12], longBias: 0.9 })) {
                daegeum(out, t0 + st * S, dg(R, M, n), d * S * 0.95, {
                  amp: 0.40, vibCents: 42, vibDelay: 0.5, breath: 0.1, attack: 0.16, release: 0.35,
                  bendEnd: d >= 6 ? -45 : 0, pan: -0.16, send: 0.55
                });
              }
            }
            if (c % 8 === 4) jing(out, t0, 0.3, 0.5, 0.7, 118);
          } else {
            pad(out, t0, dg(R - 24, M, 0), cycle + 6, { amp: 0.24, cutoff: 520, attack: 4, release: 4, saw: true, detune: 4, pan: -0.2, send: 0.4 });
            pad(out, t0, dg(R - 12, M, 4), cycle + 6, { amp: 0.16, cutoff: 720, attack: 4, release: 4, pan: 0.2, send: 0.4 });
            if (c % 2 === 0) pad(out, t0, dg(R, M, [2, 3, 2, 4, 1][c % 5]), cycle * 2,
              { amp: 0.2, cutoff: 1400, attack: 4.5, release: 5, pan: (r() - .5) * 0.8, send: 0.6 });
            if (r() < 0.7) gayageum(out, t0 + r() * cycle, dg(R + 12, M, Math.floor(r() * 5)), 4.2,
              { amp: 0.2, nonghyeon: 18, dark: false, pan: (r() - .5), send: 0.65 });
            if (c % 5 === 2) {
              [4, 2, 0].forEach((d, k) => danso(out, t0 + k * 2.6, dg(R + 12, M, d), 3.4,
                { amp: 0.2, breath: 0.2, vibCents: 16, pan: -0.3, send: 0.62 }));
            }
            if (c % 9 === 0) jing(out, t0, 0.2, 0.45, 0.75, 98);
          }
          return cycle;
        }

        if (scene === 'battle') {
          // 격렬도에 따라 자진모리 → 휘모리
          const hot = clamp(I, 0, 1);
          const name = hot > 0.75 ? 'hwimori' : 'jajinmori';
          const S2 = (hot > 0.75 ? 0.132 : 0.168 - 0.026 * hot);
          const n2 = JANGDAN[name][0];
          const cycle = n2 * S2;
          if (!amb) {
            P.jangdanHit(name, t0, S2, 0.85 * (0.5 + 0.5 * hot), false, 0);
            for (let s = 0; s < n2; s += 3) buk(out, t0 + s * S2, 0.5 * (0.5 + 0.5 * hot), 0.12, 0.2);
            if (hot > 0.3) {
              kkwaenggwari(out, t0, 0.4 * hot, 0.45, 0.25);
              if (c % 2 === 1) kkwaenggwari(out, t0 + (n2 - 2) * S2, 0.28 * hot, -0.45, 0.25);
            }
            [0, 3, 6, 9].forEach((s, i) => {
              if (s >= n2) return;
              const deg = (c % 2 === 0 ? [0, 0, 3, 2] : [0, 4, 3, 0])[i];
              geomungo(out, t0 + s * S2, dg(R - 12, M, deg), 1.2, { amp: 0.42 * (0.6 + 0.4 * hot), pan: -0.3, send: 0.18 });
            });
            if (c % 2 === 0 && hot > 0.35) {
              for (const [st, d, n] of P.mel.phrase(n2 * 2, 0.72, { durs: [1, 1.5, 2, 3, 4] })) {
                piri(out, t0 + st * S2, dg(R + 12, M, n), d * S2 * 0.95,
                  { amp: 0.3 * hot, vibCents: 26, vibDelay: 0.1, pan: -0.1, send: 0.28 });
              }
            }
            if (c % 4 === 0) jing(out, t0, 0.4 * hot, 0.3, 0.3, 126);
          } else {
            // 잠복/추격 — 압력만 높인다
            const per = 1.55 - 0.6 * hot;
            const cyc2 = per * 4;
            for (let k = 0; k < 4; k++) {
              buk(out, t0 + k * per, 0.26 + 0.3 * hot, -0.05, 0.28);
              janggu_gung(out, t0 + k * per + per * 0.5, 0.16 + 0.16 * hot, 0.1, 0.3);
            }
            pad(out, t0, dg(R - 24, M, 0), cyc2 + 4, { amp: 0.2, cutoff: 420, attack: 3, release: 3, saw: true, detune: 9, pan: 0, send: 0.25 });
            if (c % 4 === 2) pad(out, t0, mtof(degMidi(R - 12, M, 0) + 1), cyc2 * 2,
              { amp: 0.12, cutoff: 700, attack: 3, release: 4, pan: (r() - .5), send: 0.5 });
            if (hot > 0.45) {
              const kn = 2 + Math.floor(r() * 3);
              for (let k = 0; k < kn; k++) janggu_chae(out, t0 + r() * cyc2 + k * 0.115, 0.18, (r() - .5), 0.35);
            }
            if (r() < 0.5) geomungo(out, t0 + r() * cyc2, dg(R - 12, M, [0, 3, 4][Math.floor(r() * 3)]), 2.6, { amp: 0.34, pan: -0.35, send: 0.3 });
            if (c % 7 === 3) {
              [2, 3, 5].forEach((d, k) => piri(out, t0 + k * 0.34, dg(R + 12, M, d), 0.5, { amp: 0.22, vibCents: 40, pan: 0.25, send: 0.45 }));
            }
            if (c % 11 === 0) jing(out, t0, 0.26, 0.4, 0.5, 104);
            return cyc2;
          }
          return cycle;
        }

        // journey
        {
          const cycle = jd * S;
          if (!amb) {
            P.jangdanHit('semachi', t0, S, 0.58, c % 16 < 3, 0.12);
            const pat = (c % 4 < 2) ? [0, 2, 4, 2, 5, 4] : [0, 3, 5, 3, 7, 5];
            [0, 1.5, 3, 4.5, 6, 7.5].forEach((s, i) => {
              gayageum(out, t0 + s * S, dg(R, M, pat[i] - 3), 1.5,
                { amp: 0.34, nonghyeon: i === 0 ? 14 : 0, pan: 0.32, send: 0.36 });
            });
            if (c % 2 === 0) {
              const deg = [0, 0, 4, 2, 0, 3, 4, 0][(c >> 1) % 8];
              geomungo(out, t0, dg(R - 12, M, deg), 2.6, { amp: 0.38, pan: -0.36, send: 0.3 });
            }
            if (c % 2 === 0 && c % 24 >= 4) {
              const ph = c % 48 < 24 ? P.bank[(c >> 1) % 4] : P.mel.vary(P.bank[(c >> 1) % 4], 0.4);
              for (const [st, d, n] of ph) {
                daegeum(out, t0 + st * S, dg(R + 12, M, n), d * S * 0.95,
                  { amp: 0.42, vibCents: d >= 3 ? 30 : 18, bendEnd: (d >= 4 && r() < 0.4) ? -32 : 0, pan: -0.18, send: 0.44 });
              }
            }
            if (c % 16 === 0 && c > 0) jing(out, t0, 0.28, 0.35, 0.4, 132);
          } else {
            const cyc2 = 4.0;
            for (let k = 0; k < 4; k++) {
              janggu_gung(out, t0 + k, 0.24, -0.12, 0.35);
              if (k % 2 === 1) janggu_chae(out, t0 + k + 0.5, 0.09, 0.3, 0.4);
            }
            const deg = [0, 2, 0, 4, 1, 0, 3, 2][c % 8];
            pad(out, t0, dg(R - 12, M, deg), cyc2 * 3, { amp: 0.24, cutoff: 760, attack: 3, release: 3.5, pan: -0.25, send: 0.45 });
            pad(out, t0, dg(R, M, deg + 3), cyc2 * 3, { amp: 0.15, cutoff: 1400, attack: 3.5, release: 4, pan: 0.3, send: 0.55 });
            if (c % 2 === 0) {
              const b = [0, 2, 3, 5][Math.floor(r() * 4)];
              [0, 2, 4, 3].forEach((d, k) => gayageum(out, t0 + k * 0.62, dg(R, M, b + d - 2), 2.6,
                { amp: 0.22, nonghyeon: k === 3 ? 10 : 0, pan: (r() - .5) * 0.9, send: 0.5 }));
            }
            if (c % 6 === 3) {
              [4, 2, 3, 0].forEach((d, k) => daegeum(out, t0 + k * 1.9, dg(R + 12, M, d), 2.2,
                { amp: 0.3, vibCents: 26, breath: 0.11, pan: -0.22, send: 0.6 }));
            }
            return cyc2;
          }
          return cycle;
        }
      };
      return P;
    }

    // ------------------------------------------------------------ 스케줄러
    function tick() {
      if (!state.running) return;
      const now = state.ctx.currentTime;
      for (let i = state.programs.length - 1; i >= 0; i--) {
        const p = state.programs[i];
        if (p.dying && now > p.dieAt) {
          try { p.out.disconnect(); } catch (e) { }
          state.programs.splice(i, 1);
          continue;
        }
        const horizon = p.dying ? Math.min(now + LOOKAHEAD, p.dieAt) : now + LOOKAHEAD;
        let guard = 0;
        while (p.nextTime < horizon && guard++ < 8) {
          p.nextTime += p.scheduleCycle(Math.max(p.nextTime, now + 0.05));
        }
      }
    }

    function switchTo(scene, mood, fade) {
      if (!state.running) return;
      const now = state.ctx.currentTime;
      fade = fade === undefined ? 2.5 : fade;
      for (const p of state.programs) {
        if (p.dying) continue;
        p.dying = true; p.dieAt = now + fade;
        p.out.gain.cancelScheduledValues(now);
        p.out.gain.setValueAtTime(Math.max(0.0001, p.out.gain.value), now);
        p.out.gain.linearRampToValueAtTime(0.0001, now + fade);
      }
      const np = makeProgram(scene, mood, (state.seed = (state.seed * 1103515245 + 12345) & 0x7fffffff));
      np.nextTime = now + 0.08;
      np.out.gain.setValueAtTime(0.0001, now);
      np.out.gain.linearRampToValueAtTime(1, now + Math.min(fade, 1.8));
      state.programs.push(np);
    }

    // ------------------------------------------------------------ 공개 API
    const api = {
      // 오프라인 렌더용 — setInterval 없이 seconds 만큼 미리 전부 예약한다
      _offlineStart(seconds) {
        state.ctx = opts.context;
        buildGraph();
        state.running = true;
        switchTo(state.scene, state.mood, 0.6);
        const p = state.programs[state.programs.length - 1];
        p.nextTime = 0.05;
        let guard = 0;
        while (p.nextTime < seconds && guard++ < 20000) {
          p.nextTime += p.scheduleCycle(p.nextTime);
        }
        return api;
      },
      async start() {
        if (state.running) return;
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC && !opts.context) throw new Error('Web Audio 미지원');
        if (!state.ctx) { state.ctx = opts.context || new AC(); buildGraph(); }
        if (state.ctx.state === 'suspended') await state.ctx.resume();
        state.running = true;
        switchTo(state.scene, state.mood, 1.2);
        state.timer = setInterval(tick, TICK);
        tick();
        return api;
      },
      stop(fade) {
        if (!state.running) return api;
        fade = fade === undefined ? 1.5 : fade;
        const now = state.ctx.currentTime;
        state.master.gain.cancelScheduledValues(now);
        state.master.gain.setValueAtTime(state.master.gain.value, now);
        state.master.gain.linearRampToValueAtTime(0.0001, now + fade);
        setTimeout(() => {
          clearInterval(state.timer); state.timer = null; state.running = false;
          for (const p of state.programs) { try { p.out.disconnect(); } catch (e) { } }
          state.programs.length = 0;
          state.master.gain.setValueAtTime(state.volume, state.ctx.currentTime);
        }, fade * 1000 + 80);
        return api;
      },
      setScene(scene, fade) {
        if (!(scene in { village_day: 1, village_night: 1, battle: 1, journey: 1 })) return api;
        if (scene === state.scene) return api;
        state.scene = scene;
        switchTo(scene, state.mood, fade);
        return api;
      },
      setMood(mood, fade) {
        if (mood === state.mood) return api;
        state.mood = mood;
        switchTo(state.scene, mood, fade);
        return api;
      },
      setIntensity(v) { state.intensity = clamp(v, 0, 1); return api; },
      setDayPhase(v) {
        state.dayPhase = v;
        if (state.autoDayNight && (state.scene === 'village_day' || state.scene === 'village_night')) {
          const night = (v < 0.22 || v > 0.80);
          const want = night ? 'village_night' : 'village_day';
          if (want !== state.scene) api.setScene(want, 4.0);
        }
        return api;
      },
      setVolume(v) {
        state.volume = clamp(v, 0, 1);
        if (state.master) {
          const now = state.ctx.currentTime;
          state.master.gain.cancelScheduledValues(now);
          state.master.gain.setTargetAtTime(state.volume, now, 0.08);
        }
        return api;
      },
      setAutoDayNight(b) { state.autoDayNight = !!b; return api; },
      get scene() { return state.scene; },
      get mood() { return state.mood; },
      get volume() { return state.volume; },
      get running() { return state.running; },
      _state: state
    };
    return api;
  }

  /** 엔진이 만드는 소리를 오프라인으로 뽑아본다(미리듣기/검증용). */
  async function renderOffline(o) {
    o = o || {};
    const sr = o.sampleRate || 44100;
    const secs = o.seconds || 30;
    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(secs * sr), sr);
    const bgm = create(Object.assign({}, o, { context: ctx, volume: o.volume === undefined ? 0.9 : o.volume }));
    if (o.intensity !== undefined) bgm.setIntensity(o.intensity);
    bgm._offlineStart(secs);
    return await ctx.startRendering();
  }

  global.DurangoBGM = {
    create: create, renderOffline: renderOffline,
    PYEONGJO: PYEONGJO, GYEMYEONJO: GYEMYEONJO, JANGDAN: JANGDAN
  };
})(typeof window !== 'undefined' ? window : globalThis);
