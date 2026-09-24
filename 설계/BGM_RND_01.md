# BGM R&D-01 — 아리랑 대금 프레이즈 수직 슬라이스

## 목적

절차형 작곡은 유지한다. 첫 목표는 AI 작곡이나 13곡 교체가 아니라, 실제 게임의 `village_day` · `ari` 대금이 음마다 끊어 재발음되는 문제를 프레이즈 단위 연주로 바꾸고 A/B로 검증하는 것이다.

## 현재 사실

- 제품 재생 경로는 `public/index.html → public/client/48-a-audio.js → public/assets/audio/bgm/bgm.js`다.
- `bgm.js`의 `blow()`는 음마다 oscillator · envelope · vibrato LFO를 새로 만든다.
- Python `phrase.py`와 `tools/ddsp/`는 제품 재생 경로에 아직 연결되지 않았다. 현 DDSP 스캐폴드는 실제 조건부 악기 렌더러가 아니다.
- 아리랑(`mood: 'ari'`)은 엔진 안의 선택 모드이며, 현재 기본 실게임 BGM(`trad`)을 몰래 바꾸지 않는다.

## R&D-01 범위

1. `PerformancePhrase` 계약을 정한다: 시작·길이·목표 F0·쉼·legato·퇴성·시김새·다이내믹.
2. `village_day / ari / daegeum` 한 악구에서만 프레이즈 지속 voice를 구현한다. 첫 청취 표본은 1–4마디(8.64초)로 고정한다.
3. 연결 음은 F0·gain·vibrato 자동화로 잇고, 실제 쉼·맺음에서만 새 호흡을 만든다.
4. 같은 악구의 기존 음별 렌더와 새 프레이즈 렌더를 OfflineAudioContext로 뽑아 기술 측정과 청취 A/B를 가능하게 한다. 음량 맞춘 청취본, resolved score, 경계별 F0·RMS·dropout·click 측정은 gitignore 대상 산출물로 보관한다.

## 명시적 비범위

- AI Hub 다운로드·학습·원본 음원 반입
- 일반 텍스트-음악 생성 모델 도입
- 13곡 전면 교체, 런타임 스템 전환, 타 악기 이식
- 메인 브랜치 병합

## 통과 조건

- 기본 경로는 기존 BGM 동작을 보존한다.
- R&D 플래그에서 대금 하나가 legato 구간 동안 하나의 연속 voice로 렌더된다.
- 진짜 쉼에서는 재어택한다.
- 순수 계획 함수와 오프라인 렌더 경로를 자동 검증한다.
- A/B 산출물·측정표·청취 판정 기준을 남긴다. 기능 OFF 결과는 재현 가능해야 하며, 고의로 끊은 실패 표본도 검사기가 잡아야 한다. "학습 스크립트 종료"는 성공 기준이 아니다.

## 구현·판정 현황 (2026-09-24)

- 구현은 `performancePhrases.villageDayAriDaegeum: true`라는 명시 opt-in에만 있다. 제품 소리 층은 이 flag를 모르므로 현재 실게임 기본(`trad`)에는 변화가 없다.
- `planPerformancePhrase()`가 score를 F0·gain·요성·퇴성·legato/reattack 제어 계획으로 바꾸고, `PerformancePhrase`가 대금 한 pass 동안 지속 oscillator/LFO/숨 voice 하나를 유지한다.
- 빈 마디, 마디 끝 쉼, scene 전환, `stop()` fade 중 scene/mood 갱신까지 회귀로 검사한다. 특히 `stop()`은 terminal이며 fade 중 새 Program/phrase를 다시 열지 않는다.
- Chrome `OfflineAudioContext`에서 unit 16/16·e2e 12/12을 통과했다. 같은 score/control trace는 정확히 같아야 하고, native compressor/convolver의 LSB-level float drift만 max Δ 1.5e-6 · RMS Δ 1e-7까지 허용한다.
- `scripts/render-bgm-phrase-ab.js`는 실제 Chrome 렌더를 44.1 kHz stereo PCM16 WAV로 뽑는다. 첫 청취는 숨겨진 A/B 배치와 RMS 맞춤본으로 한다. 청취 운영자가 생성 순간 `--reveal` 매핑을 비공개로 기록하고, 답변 뒤에만 공개한다(출력 폴더에는 mapping file을 남기지 않는다). 이는 간이 RMS matching이며 LUFS 기반 지각 loudness 정규화는 다음 평가 카드다.

### 사람 청취 게이트

청취자는 매핑을 모른 채 A/B에서 다음만 기록한다.

1. 연결 음에서 숨·요성이 자연스럽게 이어지는가.
2. 실제 쉼과 맺음에서만 새 어택이 들리는가.
3. 평음↔요성·퇴성이 기계적으로 튀거나 뭉개지는가.
4. 전체 선호와 그 근거는 무엇인가.

이 판정이 통과해도 "AI 악기 학습 성공"은 아니다. 그때 비로소 권리 확인된 대금 단선율 프레이즈로 data/rendering 카드를 연다.

### 남은 기술 메모 (다음 카드에서 판단)

- Chrome e2e는 기존 야간 Playwright 관례를 따른다. 새 개발 장비는 nightly 환경 또는 `playwright-core`와 `CHROMIUM_PATH`가 있어야 같은 검사를 직접 실행할 수 있다. 단위 CI에는 browser 의존성을 추가하지 않는다.
- `cancelAndHoldAtTime`이 없는 구형 Safari fallback은 미래 envelope 값을 정확히 hold하지 못해 scene fade 때 미세 click 가능성이 있다.
- phrase send는 shared convolver **앞**에서 fade한다. 이미 들어간 잔향 tail은 자연스럽게 남는다. 완전한 scene-tail 제거가 요구될 때만 per-program post-convolver 구조를 검토한다.

## 다음 게이트

R&D-01 청취 판정을 통과한 뒤에만, 권리 확인된 대금 단선율 프레이즈로 신경 렌더러(DDSP/NSF 계열)와 score-to-expression 모델을 별도 카드로 연다.
