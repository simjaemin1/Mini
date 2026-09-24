# BGM R&D-02 — 대금 발음 모델과 원본 데이터 게이트

## 결정

R&D-01의 사람 청취에서 두 극단이 모두 탈락했다.

- 지속 oscillator는 음을 무조건 연결해 실제 운지·입김 전환이 사라졌다.
- 음별 oscillator는 모든 음을 첫 음처럼 재발음해 툭툭 끊겼다.

따라서 다음 문제는 `glide` 값이나 빈틈 길이를 조절하는 일이 아니다. 악보가 어떤 **발음 상태**인지 명시하고, 그 상태를 실제 대금 소리로 렌더하는 일이다.

## 현재 사실

- 브라우저 A/B의 `daegeum()`은 실제 녹음이 아니라 sine harmonic·noise·envelope 합성이다.
- 저장소에는 완성 믹스 `village_day_jeongak`만 있고, 독립 대금 원본/어택/전이 조각은 없다. 완성 믹스에서 앞머리를 떼면 반주·잔향이 섞이므로 학습·샘플용으로 쓰지 않는다.
- 기존 Python sampler에는 새 숨의 `head`와 이어 부는 `mid`를 구분해 크로스페이드하는 틀이 있으나, 그것을 먹일 원본 뱅크가 현재 없다.
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

1. **원본 게이트** — 권리와 재배포 범위가 확인된 monophonic 대금 원본을 확보한다. finished mix, 추출 stem, 임의 웹 음원은 쓰지 않는다.
2. **파일럿 articulation bank** — 같은 음, 상행·하행 전이, 넓은 도약을 위 다섯 상태와 두세 음량 단계로 녹음/라벨한다. 실제 대금 연주자 또는 국악 전문가가 라벨을 검수한다.
3. **2음 ABX 게이트** — 곡 전체가 아니라 첫 음·연결·혀 재발음·쉼 뒤 재진입을 블라인드로 비교한다. R&D-01의 두 극단보다 낫다는 사람 판정이 먼저다.
4. **hybrid baseline** — raw head/mid/transition/ornament 조각을 쓰는 샘플 기반 렌더를 기준선으로 만든다. 이 단계는 ML 없이도 통과 가능해야 한다.
5. **ML 카드** — score+articulation에서 위 control curves를 예측하고, 대금 전용 DDSP/신경 renderer와 onset residual을 분리 학습한다. 모델은 런타임 WebAudio를 즉시 대체하지 않고 오프라인 stem을 먼저 굽는다.

## 금지선

- generic text-to-music, MIDI만 넣는 범용 모델, 지속 oscillator의 parameter tweak를 해결책으로 부르지 않는다.
- 데이터 권리·원본·사람 청취 게이트 전에는 WSL GPU 학습을 시작하지 않는다.
- 이 카드가 통과할 때까지 R&D-01 opt-in은 실게임 기본 경로에 연결하지 않는다.
