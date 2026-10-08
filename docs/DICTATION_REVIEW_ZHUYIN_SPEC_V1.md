# Dictation Review & Written Zhuyin Spec v1

> Plan: PLAN-20261008-DICTATION-FOUNDATION-v1  
> Status: IMPLEMENTING / M1 foundation  
> Scope: C Learning Events + E Hanzi/Written-Zhuyin scoring  
> Production behavior: unchanged in M1

## 1. Goal

Extend the existing learning loop without replacing it.

Current runtime already has `review_events`, `skill_state`, `stateKey(char, skill)`, and spaced-review stages. M1 formalizes new event metadata and written-Zhuyin layout rules, but does not yet change the production quiz UI.

## 2. Learning-event rule

Separate **exposure** from **testing**.

- `exposed`: character was visible in the prompt/context; never advances spaced-review mastery.
- `tested`: learner had to retrieve/write the character or its written Zhuyin; may update the corresponding skill state.

The prior-character review switch only controls creation of additional old-character questions. If an old character is actually written inside a dictation unit, its test result is recorded regardless of switch state.

Skills remain independent via `stateKey(char, skill)`, for example:

- `貓|hanzi_dictation`
- `貓|zhuyin_write`
- `貓|context_write`

## 3. Written Zhuyin layout

All possible positions are always visible.

Slots:

- `neutral`: neutral-tone dot above the syllable
- `g0`: upper main-symbol slot
- `g1`: middle main-symbol slot
- `g2`: lower main-symbol slot
- `t0`, `t1`, `t2`: tone-mark positions to the right of the matching main-symbol row

Placement rules:

- 1 main symbol -> `g1`
- 2 main symbols -> `g0 + g2`
- 3 main symbols -> `g0 + g1 + g2`
- tone 2/3/4 -> right of the last main symbol
- tone 1 -> all tone slots blank
- neutral tone -> `neutral` only; regular tone slots blank

A non-required slot containing any ink is an error.

Verified examples include:

- 貓 ㄇㄠ
- 巷 ㄒㄧㄤˋ
- 一 ㄧ
- 叔 ㄕㄨˊ
- 叔 ㄕㄨ˙
- 雨/語 ㄩˇ
- 園 ㄩㄢˊ
- 徐 ㄒㄩˊ
- 旋 ㄒㄩㄢˊ

## 4. Recognition policy

Do **not** perform 37-way forced classification.

Each occupied slot has a known expected symbol from the question. The handwriting verifier answers only:

> Does this stroke/image sufficiently match the expected symbol?

Only a verified slot is converted into that symbol. Low confidence returns `UNCERTAIN`; it must not be relabeled as another random Bopomofo symbol.

Neutral tone is gesture-special-cased: a short concentrated tap/small dot is accepted; a long stroke or large scribble is not.

## 5. Spoken vs written pronunciation

Future dictation data must distinguish:

- `spokenZhuyin`: pronunciation used for playback/context
- `expectedWrittenZhuyin`: answer expected from the learner

They are often identical but must not be conceptually merged because neutral tone, context pronunciation, pedagogical notation, and TTS behavior may diverge.

Existing `token.zhuyin` remains backward-compatible during migration.

## 6. Timing telemetry

Do not freeze the final time formula yet. Events may collect:

- `responseMs`
- `firstStrokeMs`
- `strokeCount`
- `mistakeCount`
- `hintUsed`
- `audioReplayCount`
- `timedOut`

These fields support later calibration of total-review timing. Full raw stroke coordinates are not required for M1 telemetry.

## 7. M1 acceptance

- Existing production app behavior is unchanged.
- Written-Zhuyin slot parser has deterministic smoke tests.
- Tone-1 blank handling is regression tested.
- `ㄩ` placement is tested at upper/middle/lower positions.
- Neutral-tone short-tap policy is represented as a pure function.
- Review Event v2 schema distinguishes `exposed` and `tested`.
