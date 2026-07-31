"""preview_score.py — 손으로 쓴 악보를 ① 정간보로 보이고 ② 중립적인 소리로 들려준다.
국악기 음색을 빼고 가락·장단만 판단하실 수 있게, 소리는 일부러 밋밋한 합성음이다."""
import os, base64, subprocess, numpy as np
import score_village_day as S
import compose as C
import gugak as G

PYE = [0, 2, 5, 7, 9]
NAMES = {0: "궁", 1: "상", 2: "각", 3: "치", 4: "우", 5: "궁˙", 6: "상˙", 7: "각˙",
         -1: "우̣", -2: "치̣", -3: "각̣"}
SOL = {0: "G", 1: "A", 2: "C", 3: "D", 4: "E", 5: "G", 6: "A", 7: "C", -1: "E", -2: "D"}
KIND = {"G": "덩", "g": "쿵", "c": "덕", "d": "더", "i": "기덕", "r": "더러러러"}


def dmidi(root, deg):
    o, i = divmod(int(deg), 5)
    return root + 12 * o + PYE[i]


def tone(f, dur, amp, kind="flute", seed=0):
    n = int(dur * G.SR)
    if n < 32:
        return np.zeros(0, np.float32)
    t = np.arange(n) / G.SR
    rng = np.random.default_rng(seed)
    if kind == "flute":
        h = [(1, 1.0), (2, .28), (3, .12), (4, .05)]
        env = G.adsr(n, .05, .10, .78, .18)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - .25) / .3, 0, 1)
    elif kind == "pluck":
        h = [(1, 1.0), (2, .45), (3, .22), (4, .12), (5, .06)]
        env = G.expdecay(n, .55) * G.adsr(n, .004, .02, .9, .25)
        vib = np.ones(n)
    else:
        h = [(1, 1.0), (2, .5), (3, .3)]
        env = G.expdecay(n, .35)
        vib = np.ones(n)
    y = np.zeros(n, np.float32)
    for k, a in h:
        y += a * np.sin(2 * np.pi * f * k * np.cumsum(vib) / G.SR).astype(np.float32)
    return (y / max(1e-9, np.abs(y).max()) * env * amp).astype(np.float32)


def render():
    sob, nsb = S.SOBAK, S.NCY_S
    dur = S.NBAR * nsb * sob + 3.0
    mix = G.Mix(dur, tail=2.5)
    bt = lambda b: b * nsb * sob
    for b, bar in enumerate(S.MELODY):
        for s, d, g in bar:
            mix.add(tone(G.mtof(dmidi(67, g)), d * sob * .95, .55, "flute", int(b * 31 + s * 2)),
                    bt(b) + s * sob, 1.0, 0.05, 0.0)
    for b, ns in S.DANSO.items():
        for s, d, g in ns:
            mix.add(tone(G.mtof(dmidi(79, g)), d * sob * .95, .30, "flute", int(b * 7 + s * 2)),
                    bt(b) + s * sob, 1.0, 0.35, 0.0)
    for b, ns in S.PIRI_BARS.items():
        for s, d, g in ns:
            mix.add(tone(G.mtof(dmidi(67, g)), d * sob * .95, .22, "flute", int(b * 5 + s * 2)),
                    bt(b) + s * sob, 1.0, -0.35, 0.0)
    for b in range(S.NBAR):
        for s, d, g in S.GAYA[S.GAYA_PLAN[b]]:
            mix.add(tone(G.mtof(dmidi(55, g)), d * sob, .34, "pluck", int(b * 13 + s * 2)),
                    bt(b) + s * sob, 1.0, -0.22, 0.0)
        if S.GEO_ON[b]:
            for s, d, g in S.GEO:
                mix.add(tone(G.mtof(dmidi(43, g)), d * sob, .30, "pluck", int(b * 17 + s * 2)),
                        bt(b) + s * sob, 1.0, 0.25, 0.0)
        g = S.DRUM[b]
        if g > 0:
            for pos, kind, v in C.JANGDAN["gutgeori"][1]:
                lo = kind in ("G", "g")
                mix.add(tone(90 if lo else 620, .16 if lo else .08, .40 * v * g,
                             "drum", b * 3 + int(pos)),
                        bt(b) + pos * sob, 1.0, -0.1 if lo else 0.2, 0.0)
    return mix.render(G.Reverb(dur=1.2, decay=0.6, pre=0.01, damp=2400, seed=2),
                      wet=0.0, loop=False, target_db=-16.0)


def grid():
    rows = []
    sec = {a: n for n, a, _ in S.SECTIONS}
    for b, bar in enumerate(S.MELODY):
        cells = ["·"] * S.NCY_S
        for s, d, g in bar:
            i = int(s)
            tag = f'<b>{NAMES.get(g, g)}</b><i>{SOL.get(g,"")}</i>'
            # 반소박 잔가락은 같은 칸에 붙여 적는다(정간보에서 한 칸을 쪼개는 것과 같다)
            cells[i] = tag if cells[i] in ("·", "—") else cells[i] + tag
            for k in range(i + 1, min(S.NCY_S, i + int(d))):
                if cells[k] == "·":
                    cells[k] = "—"
        head = f'<td class="sec">{sec.get(b,"")}</td><td class="bn">{b+1}</td>'
        rows.append("<tr>" + head +
                    "".join(f'<td class="{"beat" if i%3==0 else ""}">{c}</td>'
                            for i, c in enumerate(cells)) + "</tr>")
    jd = ["·"] * S.NCY_S
    for pos, kind, _ in C.JANGDAN["gutgeori"][1]:
        jd[int(pos)] = KIND[kind]
    drum = ('<tr class="jd"><td class="sec"></td><td class="bn">장단</td>' +
            "".join(f'<td class="{"beat" if i%3==0 else ""}">{c}</td>' for i, c in enumerate(jd)) +
            "</tr>")
    return drum + "".join(rows)


def main():
    os.makedirs("_sc", exist_ok=True)
    G.write_wav("_sc/preview.wav", render())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "_sc/preview.wav",
                    "-c:a", "libmp3lame", "-b:a", "128k", "_sc/preview.mp3"], check=True)
    b64 = "data:audio/mpeg;base64," + base64.b64encode(open("_sc/preview.mp3", "rb").read()).decode()
    n = sum(len(b) for b in S.MELODY)
    secs = "".join(f'<tr><td>{a}</td><td class="c">{s+1}–{e}장단</td><td>{d}</td></tr>'
                   for (a, s, e), d in zip(S.SECTIONS, [
                       "치에서 나가 궁˙까지 올랐다가 궁에 앉는다. 물음–답",
                       "대비. 궁 아래로 한 번 내려갔다 치에서 열어 둔다",
                       "가를 다시. 잔가락을 얹는다",
                       "가장 높은 자리. 상˙까지 올라 정점",
                       "가를 크게. 피리가 두께를 더한다",
                       "내려와 궁에서 잦아든다"]))
    html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>마을 낮 — 악보</title><style>
:root{{--bg:#12100e;--fg:#efe7db;--dim:#a99a86;--line:#332c25;--acc:#d8a25a;--acc2:#6fa8b8}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}}
.wrap{{max-width:880px;margin:0 auto;padding:26px 18px 70px}}
h1{{font-size:23px;margin:0 0 6px}} h2{{font-size:17px;margin:30px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}}
.lead{{color:var(--dim);margin:0 0 16px}}
audio{{width:100%;height:36px;margin:8px 0}}
table.g{{border-collapse:collapse;font-size:13px;margin:10px 0;width:100%}}
table.g td{{border:1px solid #2a231d;padding:3px 2px;text-align:center;width:7%;height:30px}}
table.g td.beat{{border-left:2px solid #4a3c2e}}
table.g td.sec{{width:5%;color:var(--acc);font-size:12px;border:none;text-align:right;padding-right:6px}}
table.g td.bn{{width:5%;color:var(--dim);font-size:11px;border:none}}
table.g b{{color:var(--acc);font-size:14px;font-weight:600}}
table.g i{{display:block;color:var(--dim);font-size:9.5px;font-style:normal}}
tr.jd td{{color:var(--acc2);font-size:12px;background:#141b1d}}
table.s{{border-collapse:collapse;font-size:13px;width:100%}}
table.s td{{border:1px solid var(--line);padding:4px 9px}} table.s td.c{{color:var(--dim);white-space:nowrap}}
.note{{color:var(--dim);font-size:12.5px}}
footer{{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);color:var(--dim);font-size:12.5px}}
</style></head><body><div class="wrap">
<h1>마을 낮 — 손으로 쓴 악보</h1>
<p class="lead">알고리즘으로 굴리지 않고 음 하나하나 정해서 적었습니다.
굿거리 12소박 · G 평조 · 22장단 · 주선율 {n}음 · 104초.<br>
소리는 일부러 <b>밋밋한 합성음</b>입니다 — 국악기 음색을 빼고 가락과 장단만 보시라고요.</p>
<audio controls preload="none" src="{b64}"></audio>
<p class="note">MIDI 파일(<code>마을낮.mid</code>)도 같이 보냈습니다. 원하시는 음원으로 열어보실 수 있습니다.</p>

<h2>짜임</h2>
<table class="s">{secs}</table>

<h2>정간보</h2>
<p class="note">한 줄이 한 장단(12소박). 굵은 세로줄이 대박입니다.
<b>궁상각치우</b>는 평조 음이름, 아래 작은 글씨는 실제 음이름입니다.
<code>—</code> 는 앞 음이 이어지는 것, <code>·</code> 는 빈 자리입니다.</p>
<table class="g">{grid()}</table>

<footer>궁=G 상=A 각=C 치=D 우=E · 점은 한 옥타브 위(˙) / 아래(̣)<br>
장단 배열 — 위키백과 「장단」 · 이보형 「韓國民俗音樂 長短의 리듬型에 관한 硏究」</footer>
</div></body></html>"""
    open("마을낮_악보.html", "w").write(html)
    print(f"마을낮_악보.html  {os.path.getsize('마을낮_악보.html')/1e6:.1f}MB · 주선율 {n}음")


if __name__ == "__main__":
    main()
