"""악보 화면에 악기별 켜고 끄기 믹서를 넣는다.

★층을 <audio> 태그 여러 개로 각자 loop 시키면 **반복할수록 어긋난다.**
  태그마다 제 클럭으로 돌고, mp3 는 앞뒤에 인코더 패딩이 붙어 층마다 실제
  길이가 미세하게 다르기 때문이다. 한 바퀴 돌 때마다 그 차이가 쌓인다.
  그래서 AudioContext **하나**에 BufferSource 를 물리고, 같은 시각에 띄우고,
  loopEnd 를 똑같이 못 박는다. 클럭이 하나면 어긋날 수가 없다.
"""
import os, base64, subprocess, numpy as np
import sampler as S, gugak as G, compose as C, render_score as R
import score_village_day as SC

INST = ["daegeum", "danso", "piri", "gayageum", "geomungo", "janggu_gung",
        "janggu_chae", "wind", "water", "crickets"]
GRP = [("daegeum", ["daegeum"], "대금 (주선율)"),
       ("gayageum", ["gayageum"], "가야금 (반주)"),
       ("geomungo", ["geomungo"], "거문고 (베이스)"),
       ("wind2", ["danso", "piri"], "단소·피리 (응답)"),
       ("janggu", ["janggu_gung", "janggu_chae"], "장구"),
       ("amb", ["wind", "water", "crickets"], "자연음")]
LOOP = SC.NBAR * SC.NCY_S * SC.SOBAK          # 22 장단 = 104.28 초


def sil(*a, **k):
    return np.zeros(0, np.float32)


def only(keep):
    sv = {}
    for mod in (C, R, G):
        for n in INST:
            if hasattr(mod, n):
                sv[(mod, n)] = getattr(mod, n)
                if keep is not None and n not in keep:
                    setattr(mod, n, sil)
    try:
        return R.build()
    finally:
        for (m, n), f in sv.items():
            setattr(m, n, f)


def fold(y, k=0.012):
    """22 장단 뒤로 넘어간 여운을 앞으로 접는다 — 이어 붙여도 이음매가 없게."""
    n = int(LOOP * G.SR)
    head, tail = y[:, :n].copy(), y[:, n:]
    kk = int(k * G.SR)
    head[:, :kk] *= np.linspace(0, 1, kk, dtype=np.float32) ** 0.5
    m = min(tail.shape[1], n)
    if m > 0:
        head[:, :m] += tail[:, :m]
    return head


def main():
    os.makedirs("_sc", exist_ok=True)
    bank = S.Bank(["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso",
                   "samples_geomungo", "samples_janggu"])
    orig = G.Mix.render
    G.Mix.render = lambda self, *a, **k: orig(self, *a, **{**k, "norm": False})
    S.install(bank, [C, R])
    full = only(None)
    rms = float(np.sqrt(np.mean(full ** 2))) + 1e-12
    gain = (10 ** (-15.0 / 20)) / rms
    rows = []
    for key, keep, ko in GRP:
        S.install(bank, [C, R])
        y = only(set(keep))
        r = float(np.sqrt(np.mean(y ** 2)))
        if r < 1e-6:
            continue
        G.write_wav(f"_sc/st_{key}.wav", np.clip(fold(y) * gain, -1, 1))
        rows.append((key, ko, round(20 * np.log10(r / rms + 1e-12), 1)))
        print(f"  {ko:18s} {rows[-1][2]:+.0f}dB", flush=True)
    G.Mix.render = orig
    S.install(bank, [C, R])
    G.write_wav("out_samples/village_day_score.wav", R.build())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "out_samples/village_day_score.wav",
                    "-c:a", "libmp3lame", "-b:a", "96k", "_sc/gugak.mp3"], check=True)

    def e(p):
        return "data:audio/mpeg;base64," + base64.b64encode(open(p, "rb").read()).decode()

    chs = auds = ""
    for key, ko, db in rows:
        m = f"_sc/st_{key}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"_sc/st_{key}.wav",
                        "-c:a", "libmp3lame", "-b:a", "40k", "-ac", "1", m], check=True)
        chs += (f'<button class="ch on" data-k="{key}">{ko}'
                f'<span class="db">{db:+.0f}dB</span></button>')
        auds += f'<audio data-st="{key}" src="{e(m)}"></audio>'
    h = open("마을낮_악보.html", encoding="utf-8").read()
    h = h.replace('<audio controls preload="none" src=',
                  '<div class="lbl">① 밋밋한 합성음 — 가락만 보기</div>'
                  '<audio controls preload="none" src=', 1)
    h = h.replace('<p class="note">MIDI 파일', f'''<div class="lbl">② 같은 악보, 국립국악원 음원</div>
<audio controls preload="none" src="{e("_sc/gugak.mp3")}"></audio>
<div class="mix"><div class="mixhead">③ 악기별 켜고 끄기 — 재생 중에 눌러도 됩니다.
전곡 {LOOP:.0f}초를 반복합니다. 층 여섯을 <b>한 클럭</b>에 물려 두었으므로
몇 바퀴를 돌아도 서로 밀리지 않습니다.</div>
<div class="chs">{chs}</div>{auds}
<div class="ctl"><button class="play">재생</button><button class="all">전부 켜기</button>
<span class="st">멈춤</span></div></div>
<p class="note">①②③ 모두 <b>같은 음표</b>입니다. 합성음 0개.</p>
<p class="note">MIDI 파일''', 1)
    h = h.replace('.note{', ''' .lbl{color:var(--acc);font-size:13px;margin:14px 0 2px;font-weight:600}
.mix{margin:12px 0;padding:11px;border:1px solid var(--acc2);border-radius:9px;background:#141b1d}
.mixhead{font-size:12px;color:var(--dim);margin-bottom:9px;line-height:1.6}
.chs{display:flex;gap:6px;flex-wrap:wrap}
.ch{padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:#1b1512;
 color:var(--dim);font-size:13px;cursor:pointer;font-family:inherit;display:flex;gap:7px;align-items:center}
.ch.on{background:var(--acc2);color:#0d1416;border-color:var(--acc2);font-weight:700}
.ch .db{font-size:11px;opacity:.75}
.ctl{margin-top:9px;display:flex;gap:9px;align-items:center}
.play,.all{padding:6px 15px;border-radius:7px;border:1px solid var(--acc);background:transparent;
 color:var(--acc);cursor:pointer;font-family:inherit;font-size:13px}
.st{color:var(--dim);font-size:12px}
audio[data-st]{display:none}
.note{''', 1)
    h = h.replace('</div></body></html>', '''</div>
<script>
// 층 여섯을 AudioContext 하나에 물린다. <audio> 태그 여섯을 각자 loop 시키면
// 태그마다 제 클럭으로 돌아 한 바퀴마다 어긋남이 쌓인다 — 그래서 안 쓴다.
document.querySelectorAll('.mix').forEach(function(mix){
  var LOOP = %.4f, ctx=null, bufs={}, srcs={}, gains={}, playing=false, loading=false;
  var st=mix.querySelector('.st'), pb=mix.querySelector('.play');
  var els=[].slice.call(mix.querySelectorAll('audio[data-st]'));
  function on(k){var c=mix.querySelector('.ch[data-k="'+k+'"]');return c&&c.classList.contains('on');}
  function setv(){els.forEach(function(a){var g=gains[a.dataset.st];
    if(g) g.gain.setTargetAtTime(on(a.dataset.st)?1:0, ctx.currentTime, 0.015);});}
  mix.querySelectorAll('.ch').forEach(function(c){
    c.onclick=function(){c.classList.toggle('on'); if(ctx) setv();};});
  mix.querySelector('.all').onclick=function(){
    mix.querySelectorAll('.ch').forEach(function(c){c.classList.add('on');});
    if(ctx) setv();};
  function load(){
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    return Promise.all(els.map(function(a){
      return fetch(a.src).then(function(r){return r.arrayBuffer();})
        .then(function(b){return new Promise(function(res,rej){
          ctx.decodeAudioData(b, function(d){bufs[a.dataset.st]=d;res();}, rej);});});
    }));
  }
  function start(){
    var t0 = ctx.currentTime + 0.25;          // 여섯 개를 **같은 시각**에 띄운다
    els.forEach(function(a){
      var k=a.dataset.st, s=ctx.createBufferSource(), g=ctx.createGain();
      s.buffer=bufs[k]; s.loop=true; s.loopStart=0;
      s.loopEnd=Math.min(LOOP, s.buffer.duration);   // 층마다 **똑같은 길이**로 못 박는다
      g.gain.value = on(k)?1:0;
      s.connect(g); g.connect(ctx.destination); s.start(t0);
      srcs[k]=s; gains[k]=g;
    });
    playing=true; pb.textContent='정지'; st.textContent='재생 중 (전곡 반복)';
  }
  function stop(){
    Object.keys(srcs).forEach(function(k){try{srcs[k].stop();}catch(e){}});
    srcs={}; gains={}; playing=false; pb.textContent='재생'; st.textContent='멈춤';
  }
  pb.onclick=function(){
    if(playing){stop();return;}
    if(loading) return;
    if(ctx){ctx.resume(); start(); return;}
    loading=true; st.textContent='읽는 중…';
    load().then(function(){loading=false; ctx.resume(); start();})
          .catch(function(e){loading=false; st.textContent='재생 실패: '+e;});
  };
});
</script></body></html>''' % LOOP, 1)
    open("마을낮_악보.html", "w").write(h)
    print(f"\n마을낮_악보.html {os.path.getsize('마을낮_악보.html')/1e6:.1f}MB · 층 {len(rows)}개"
          f" · 루프 {LOOP:.2f}초")


if __name__ == "__main__":
    main()
