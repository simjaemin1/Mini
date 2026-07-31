"""정악풍 판을 악보 페이지에 붙인다."""
import os, base64, subprocess, sys
import numpy as np, sampler as S, gugak as G, compose as C, render_jeongak as J

def main():
    bank = S.Bank(["samples_jgaya", "samples_jdae", "samples_piri",
                   "samples_danso", "samples_geomungo", "samples_janggu"])
    S.install(bank, [C, J])
    y = J.build()
    os.makedirs("_sc", exist_ok=True)
    G.write_wav("_sc/jeongak.wav", y)
    subprocess.run(["ffmpeg","-v","error","-y","-i","_sc/jeongak.wav",
                    "-c:a","libmp3lame","-b:a","96k","_sc/jeongak.mp3"], check=True)
    e = "data:audio/mpeg;base64," + base64.b64encode(open("_sc/jeongak.mp3","rb").read()).decode()
    h = open("마을낮_악보.html", encoding="utf-8").read()
    blk = f'''<div class="lbl">④ 같은 악보, <b>정악</b> — 정악대금 · 정악가야금</div>
<audio controls preload="none" src="{e}"></audio>
<p class="note"><b>대금·가야금 모두 진짜 정악 악기 녹음입니다.</b>
정악대금은 국악원 「단음 다운로드」 관악기 탭에 있었는데 받아두신 파일에 빠져 있었습니다 —
오늘 새로 받아 조각 113개를 만들었습니다(jungak_deageum 5파일).
가야금은 정악가야금 조각 100개(jungak_gayageum).
바꾼 것: 소박 0.395→0.50초(한 장단 6.0초) · 깊은 농현을 걷어내고 요성(±8센트·3Hz)만 ·
맺음은 퇴성 · 여운 2.0초 · 장단에서 굴림을 빼고 세기 0.62배.
음색 보정(EQ)은 걸지 않았습니다 — 진짜 악기라 기울일 이유가 없습니다.
음정을 옮긴 폭 중앙 0.30반음(산조판 0.89반음)으로, 오히려 산조대금보다 음역이 잘 맞습니다.</p>
<p class="note">MIDI 파일'''
    h = h.replace('<p class="note">MIDI 파일', blk, 1)
    open("마을낮_악보.html","w").write(h)
    print(f"붙임 완료 · {os.path.getsize('마을낮_악보.html')/1e6:.1f}MB")

if __name__ == "__main__":
    main()
