# BGM R&D-02 — 대금 발음 모델과 원본 데이터 게이트

## 결정

R&D-01의 사람 청취에서 두 극단이 모두 탈락했다.

- 지속 oscillator는 음을 무조건 연결해 실제 운지·입김 전환이 사라졌다.
- 음별 oscillator는 모든 음을 첫 음처럼 재발음해 툭툭 끊겼다.

따라서 다음 문제는 `glide` 값이나 빈틈 길이를 조절하는 일이 아니다. 악보가 어떤 **발음 상태**인지 명시하고, 그 상태를 실제 대금 소리로 렌더하는 일이다.

## 현재 사실

- 브라우저 A/B의 `daegeum()`은 실제 녹음이 아니라 sine harmonic·noise·envelope 합성이다.
- **원본은 있다.** 일반 파일 탐색에서 제외된 `public/assets/audio/bgm/bk_*.zip`·`bk_*.part` 백업 안에 있다. 이 파일은 게임 런타임이 직접 읽지는 않는다.
  - `bk_daegeum_a.zip`·`bk_daegeum_b.zip`: 산조대금 긴 PCM WAV 6개. 실제 새 숨·지속부·시김새를 관찰하는 원본이다.
  - `bk_jdae_aa.part` → `bk_jdae_ab.part`: 정악대금 5 원본을 잘라 만든 실녹음 113조각과 `_index.json`·`_hold.json`이다. 이쪽은 이미 색인된 bank이므로 **재-scan하지 않고** 그대로 복원한다.
- `CREDITS.md`의 국립국악원 「단음 다운로드」·공공누리 제1유형 표기는 이 사용 근거로 유지한다. 다만 백업 안에는 개별 원본의 다운로드 영수증/전이 라벨이 없으므로, 새 모델이나 raw 파일을 외부 배포하기 전에는 출처 연결과 범위를 다시 확인한다.
- 기존 Python sampler에는 새 숨의 `head`와 이어 부는 `mid`를 구분해 크로스페이드하는 틀이 있다. 정확히 사용자가 지적한 첫 음/이어 부는 음의 차이를 다루지만, 현재 브라우저 `bgm.js` A/B에는 연결되어 있지 않다.
- 이 자료만으로 자연스러운 모든 운지 전이를 학습할 수 있다는 뜻은 아니다. 긴 산조 원본에서 실제 연속 전이를 찾아 청취·라벨해야 하며, 정악 113조각은 이미 잘린 단음 bank라 일반 slur의 정답 데이터로 꾸며 쓰지 않는다.
- 대금은 청공의 갈대청 떨림이 음색 정체성이다. harmonic 수와 백색 noise 하나로 대체하지 않는다.

## score → expression 계약

각 이벤트는 pitch/duration만이 아니라 적어도 아래를 가진다.

```text
articulation: phrase_start | slur | rearticulate | detached | breath_start
onset:        soft | normal | accented
sigim:        none | yoseong | chuseong | toeseong | ttuieo
```

표현 컨트롤러가 frame 단위로 내보낼 값은 다음이다.

```text
F0 residual / glide shape
air & loudness envelope
brightness / spectral envelope
breath-noise and cheong/buzz activation
vibrato depth/rate/phase behavior
onset-transient and release type
```

| 상태 | 렌더 계약 |
|---|---|
| `phrase_start`, `breath_start` | 새 숨·청 반응·F0 scoop·밝기 상승을 포함한 onset |
| `slur` | 공기는 유지, 운지 변화에 따른 F0/음색 전이. 새 onset 없음 |
| `rearticulate` | 공기는 유지하되 짧은 gain notch·혀/지공 transient·부분 brightness 변화 |
| `detached` | 명시 release와 실제 작은 공백, 뒤 event는 새 onset |
| 시김새 | F0만이 아니라 transient/brightness/buzz까지 묶어 제어 |

## 순서

1. **복원·출처 게이트** — backup을 원본 checkout이 아닌 격리된 작업 폴더에 CRC 검증 후 복원한다. finished mix, 추출 stem, 임의 웹 음원은 쓰지 않는다. 정악 bank의 index/hold는 보존한다.
2. **원본 청취 게이트** — 긴 산조 원본에서 실제 숨 시작·지속·시김새 전이 후보를, 정악 bank에서 head·hold 진입을 따로 듣는다. 원본에 없는 일반 slur/portato는 합성해서 “정답”이라 부르지 않는다.
3. **파일럿 articulation bank** — 같은 음, 상행·하행 전이, 넓은 도약을 위 다섯 상태와 두세 음량 단계로 녹음/라벨한다. 실제 대금 연주자 또는 국악 전문가가 라벨을 검수한다.
4. **2음 ABX 게이트** — 곡 전체가 아니라 첫 음·연결·혀 재발음·쉼 뒤 재진입을 블라인드로 비교한다. R&D-01의 두 극단보다 낫다는 사람 판정이 먼저다.
5. **hybrid baseline** — raw head/mid/verified-transition/ornament 조각을 쓰는 샘플 기반 렌더를 기준선으로 만든다. 이 단계는 ML 없이도 통과 가능해야 한다.
6. **ML 카드** — score+articulation에서 위 control curves를 예측하고, 대금 전용 DDSP/신경 renderer와 onset residual을 분리 학습한다. 모델은 런타임 WebAudio를 즉시 대체하지 않고 오프라인 stem을 먼저 굽는다.

## 금지선

- generic text-to-music, MIDI만 넣는 범용 모델, 지속 oscillator의 parameter tweak를 해결책으로 부르지 않는다.
- 데이터 권리·원본·사람 청취 게이트 전에는 WSL GPU 학습을 시작하지 않는다.
- 이 카드가 통과할 때까지 R&D-01 opt-in은 실게임 기본 경로에 연결하지 않는다.
