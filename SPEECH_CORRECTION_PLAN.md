# Speech Correction Feature — Improvement Plan

## Current State Assessment

The existing speech correction system is a solid foundation with a three-stage detection pipeline:

1. **Programmatic pre-detection** — pattern matching for ~40 filler words, repeated words, stutters, repeated phrases
2. **GPT-4o-mini analysis** — context-aware detection of false starts, self-corrections, and nuanced fillers
3. **Audio-level analysis** — FFmpeg silence detection to find short voiced segments that could be fillers

It supports configurable aggressiveness (conservative/moderate/aggressive), per-type toggles, and uses Whisper with a verbatim prompt to capture filler words that would normally be cleaned up. The feature is currently gated as beta.

### What Works Well

- Multi-stage detection combining rule-based + LLM + audio signals
- Context-aware "like" detection (verb vs. filler)
- Asymmetric padding (250ms before, 200ms after speech) for natural transitions
- Whisper prompt engineering to preserve filler words in transcription
- Graceful fallbacks — if correction fails, processing continues without it
- Re-transcription after correction to maintain caption alignment

### Key Weaknesses

| Area | Problem |
|------|---------|
| **No preview** | Corrections are auto-applied with no user review. Users can't see what will be cut before it happens. |
| **No per-correction control** | It's all-or-nothing per category. Can't keep one "you know" and remove another. |
| **Hard audio cuts** | No crossfading between segments — can produce clicks/pops at edit points. |
| **Encoding quality** | Uses `ultrafast` preset with `crf 28` — visibly degrades quality on re-encode. |
| **No correction history** | Corrections aren't stored per video. No way to review or revert what was changed. |
| **Single GPT call** | Entire transcript sent in one call. Accuracy degrades on longer videos (>3 min). |
| **No confidence scoring** | All detections treated equally. No way to filter borderline cases. |
| **Visual jump cuts** | Removing mid-sentence fillers creates jarring visual discontinuity. |
| **English only** | Filler word lists, GPT prompt, and detection patterns are English-specific. |
| **False positive risk** | Words like "so", "well", "right", "just" are aggressively included in `SINGLE_FILLER_WORDS` — these are legitimate words far more often than they're fillers. |

---

## Improvement Plan

### Phase 1: Fix the Fundamentals

These changes address correctness and quality issues that directly impact user trust.

#### 1.1 Reduce False Positives in Filler Word Detection

**Problem:** The `SINGLE_FILLER_WORDS` set includes words like `so`, `well`, `just`, `right`, `yeah`, `no`, `maybe`, `really`, `basically` — words that are meaningful in normal speech far more often than they're fillers. The current context check only handles `like` and partially handles `so`/`well` (gap-based). Every other word in the set gets removed unconditionally.

**Fix:**
- **Split filler words into tiers:**
  - **Tier 1 (Always fillers):** `um`, `uh`, `uhm`, `er`, `ah`, `hmm`, `mm`, `mhm` — safe to remove in any context
  - **Tier 2 (Usually fillers):** `like` (non-verb), `you know` (non-question), `I mean` (non-clarification), `basically`, `literally`, `actually` — need light context checks
  - **Tier 3 (Context-dependent):** `so`, `well`, `right`, `just`, `really`, `okay`, `yeah`, `no`, `maybe` — only flag after a gap >0.5s, at sentence boundaries, or when confirmed by GPT
- **Add context checks for each tier:** Require gap-based evidence (preceded/followed by a pause) or GPT confirmation for Tier 2/3 words
- **Add duration-based filtering:** True fillers tend to be shorter. If a word is >0.4s, it's more likely meaningful speech. Weight this into the decision.

**Files:** `src/lib/speechCorrection.ts` — `SINGLE_FILLER_WORDS`, `isFillerWord()`, `preDetectMistakes()`

#### 1.2 Add Confidence Scoring

**Problem:** All detections are treated equally regardless of source or certainty.

**Fix:**
- Add a `confidence` field to `SpeechMistake` (0.0–1.0)
- Score by source:
  - Programmatic Tier 1 + audio-confirmed: **0.95**
  - Programmatic Tier 1 alone: **0.85**
  - GPT-detected + programmatic match: **0.90**
  - GPT-detected alone: **0.70**
  - Audio-only (no transcript match): **0.40**
  - Programmatic Tier 3 alone: **0.50**
- Allow users to set a confidence threshold (default: 0.60 for moderate, 0.40 for aggressive, 0.80 for conservative)
- Only auto-apply corrections above the threshold; surface lower-confidence detections as suggestions in the preview

**Files:** `src/lib/speechCorrection.ts` — `SpeechMistake` interface, all detection functions

#### 1.3 Audio Crossfading at Edit Points

**Problem:** Hard cuts between segments produce audible clicks/pops, especially when cutting mid-sentence.

**Fix:**
- Replace the current `atrim` + `concat` approach with crossfade transitions between adjacent segments
- Use FFmpeg's `acrossfade` filter with a 30ms crossfade duration — short enough to be inaudible but long enough to eliminate artifacts
- For video, maintain the current hard cut approach (30ms video crossfade would be imperceptible and adds encoding cost)

**Files:** `src/lib/speechCorrection.ts` — `applySpeechCorrections()`

#### 1.4 Improve Encoding Quality

**Problem:** `-preset ultrafast -crf 28` produces visible quality loss. Users notice degradation after processing.

**Fix:**
- Change to `-preset fast -crf 22` — significantly better quality with only moderate speed increase
- Add `-movflags +faststart` for better streaming compatibility
- Consider using `-c:v copy` when possible (when all segments align with keyframes) — this avoids re-encoding entirely
- Increase audio bitrate from `96k` to `128k` to match source quality

**Files:** `src/lib/speechCorrection.ts` — `applySpeechCorrections()` FFmpeg options

#### 1.5 Chunked GPT Analysis

**Problem:** Sending the entire transcript in one GPT call degrades accuracy on longer videos. GPT-4o-mini has limited attention for word-level indexing across hundreds of words.

**Fix:**
- Chunk transcripts into windows of ~100 words with 20-word overlap
- Run GPT analysis on each chunk independently
- Merge results across chunks, deduplicating detections in overlap zones
- Benefits: better accuracy per chunk, supports longer videos, parallelizable for speed

**Files:** `src/lib/speechCorrection.ts` — `detectSpeechMistakesWithGPT()`

---

### Phase 2: User Control and Preview

These changes transform the feature from "auto-magic" to "user-guided" — the single biggest differentiator from competitors.

#### 2.1 Correction Preview API

**Problem:** Users can't see what will be cut before it happens.

**Fix:**
- Create a new API endpoint: `POST /api/speech-correction/detect`
  - Input: video ID (already transcribed with word timestamps)
  - Output: array of `SpeechMistake` objects with confidence scores, plus a summary (counts per type, total time to be removed)
  - Does NOT apply corrections — detection only
- Create a corresponding apply endpoint: `POST /api/speech-correction/apply`
  - Input: video ID + array of accepted mistake IDs (user selects which to apply)
  - Applies only the user-approved corrections
- Store detection results in the database (new `SpeechCorrection` model) so they persist across sessions

**New files:** `src/app/api/speech-correction/detect/route.ts`, `src/app/api/speech-correction/apply/route.ts`
**Schema change:** New `SpeechCorrection` and `DetectedMistake` models in Prisma

#### 2.2 Interactive Transcript Editor

**Problem:** Users have no word-level control over corrections.

**Fix:**
- Build a transcript viewer component that displays the full transcript with word-level timestamps
- Color-code detected mistakes by type:
  - Red: filler words
  - Orange: repeated words/phrases
  - Yellow: false starts / self-corrections
  - Blue: stutters
- Each highlighted word/phrase is clickable to toggle accept/reject
- Show confidence badges (high/medium/low) on each detection
- "Accept All" / "Reject All" bulk controls per category
- Playback integration: clicking a word seeks the video to that timestamp

**New file:** `src/components/TranscriptEditor.tsx`

#### 2.3 Before/After Audio Preview

**Problem:** Users can't hear the result before committing to corrections.

**Fix:**
- Generate a short preview clip (10–15 seconds around a correction) with and without the correction applied
- Let users toggle between "original" and "corrected" versions
- Use lightweight server-side FFmpeg processing for the preview clip (not the full video)
- This helps users judge whether corrections sound natural

**New file:** `src/app/api/speech-correction/preview/route.ts`

#### 2.4 Correction History per Video

**Problem:** Corrections are fire-and-forget. No record of what was changed.

**Fix:**
- Store correction results on the `Video` model:
  - `speechCorrectionApplied: Boolean`
  - `mistakesDetected: Int`
  - `mistakesApplied: Int`
  - `timeRemoved: Float`
  - `corrections: Json` (serialized array of applied mistakes)
- Show a "Corrections Applied" summary in the video details view
- Allow "Undo Corrections" by reprocessing from the pre-correction video (which should be cached)

**Schema change:** Additional fields on `Video` model

---

### Phase 3: Cutting-Edge Quality

These changes push the feature from "good" to "best-in-class."

#### 3.1 Visual Discontinuity Smoothing

**Problem:** Removing a filler word mid-sentence creates a visual jump — the speaker's face/body suddenly shifts position.

**Fix:**
- After calculating segments to keep, analyze the visual difference between the last frame of one segment and first frame of the next
- If the pixel difference exceeds a threshold, apply a 3-frame (100ms) dissolve transition
- Use FFmpeg's `xfade` filter with `transition=fade` for these specific cut points
- Only apply to cuts where the visual discontinuity is significant (skip for B-roll or slide content)

**Files:** `src/lib/speechCorrection.ts` — new `detectVisualJumps()` function, modified `applySpeechCorrections()`

#### 3.2 Custom Filler Word/Phrase Lists

**Problem:** Speakers have unique verbal tics. One person's filler might be "at the end of the day" while another says "if that makes sense" constantly.

**Fix:**
- Add user-configurable custom filler words/phrases in processing preferences
- New fields: `customFillerWords: String[]`, `customFillerPhrases: String[]`
- These get merged into the detection pipeline alongside the built-in lists
- Include a "Learn from this video" button that analyzes a transcript and suggests frequently repeated phrases as potential custom fillers

**Schema change:** New array fields on `UserProcessingPreferences`
**Files:** `src/lib/speechCorrection.ts`, `src/components/ProcessingOptions.tsx`, preferences API

#### 3.3 Prosody-Aware Detection

**Problem:** Audio analysis currently only uses silence detection. It can't distinguish a confidently spoken "so" (meaningful) from a hesitant "soooo..." (filler).

**Fix:**
- Extract pitch (F0) contour and energy envelope using FFmpeg's `aformat` + `astats` or a lightweight library
- Fillers tend to have:
  - Flat or falling pitch
  - Lower energy than surrounding speech
  - Longer duration relative to the word's typical length
- Use these prosodic features as additional signals in confidence scoring
- This is an advanced improvement — implement after the confidence system is in place

**Files:** `src/lib/speechCorrection.ts` — new `analyzeProsody()` function

#### 3.4 Multi-Language Support

**Problem:** Detection is English-only.

**Fix:**
- Create language-specific filler word configs:
  - French: `euh`, `bah`, `en fait`, `du coup`, `genre`, `voilà`
  - Spanish: `eh`, `pues`, `bueno`, `o sea`, `este`, `es que`
  - German: `äh`, `ähm`, `also`, `halt`, `quasi`, `sozusagen`
  - Portuguese: `tipo`, `né`, `então`, `bom`
- Auto-detect language from Whisper response (it returns a `language` field)
- Select the appropriate filler config based on detected language
- GPT prompts should be language-aware

**Files:** New `src/lib/fillerWords/` directory with per-language configs

#### 3.5 Speaker-Aware Correction

**Problem:** In multi-speaker videos, different speakers may need different correction levels.

**Fix:**
- Use Whisper's speaker diarization (or a separate diarization step) to identify speakers
- Allow per-speaker aggressiveness settings
- Show speaker labels in the transcript editor
- This is lower priority — most TimeBack users create single-speaker content

---

### Phase 4: Intelligence and Learning

Long-term improvements that compound over time.

#### 4.1 Learning from User Decisions

- Track which corrections users accept vs. reject in the transcript editor
- Build a per-user profile of correction preferences
- Over time, adjust confidence scores based on historical accept/reject patterns
- Example: if a user always rejects "right" being flagged as a filler, stop suggesting it

#### 4.2 Processing Speed Optimization

- Cache Whisper transcription results — don't re-transcribe if only correction settings change
- Run audio analysis and GPT analysis in parallel (currently sequential)
- For re-processing, only re-encode the changed segments rather than the full video
- Consider using a faster local whisper model (whisper.cpp) for shorter videos

#### 4.3 Correction Profiles / Presets

- Let users save named correction profiles (e.g., "Podcast Clean", "Quick Polish", "Full Scrub")
- Include preset profiles for common use cases:
  - **Minimal:** Only Tier 1 fillers (um, uh), conservative aggressiveness
  - **Professional:** All fillers + repeated words, moderate aggressiveness
  - **Broadcast:** Everything including false starts and self-corrections, aggressive

---

## Recommended Implementation Order

```
Phase 1 (Fundamentals)
├── 1.1 Fix filler word false positives  ← Highest impact fix
├── 1.2 Add confidence scoring           ← Enables Phase 2
├── 1.3 Audio crossfading                ← Quick quality win
├── 1.4 Better encoding settings         ← Quick quality win
└── 1.5 Chunked GPT analysis             ← Accuracy improvement

Phase 2 (User Control)
├── 2.1 Detection preview API            ← Foundation for editor
├── 2.2 Interactive transcript editor    ← The differentiator
├── 2.3 Before/after audio preview       ← Trust builder
└── 2.4 Correction history per video     ← Accountability

Phase 3 (Quality)
├── 3.1 Visual discontinuity smoothing   ← Polish
├── 3.2 Custom filler word lists         ← Personalization
├── 3.3 Prosody-aware detection          ← Advanced accuracy
├── 3.4 Multi-language support           ← Market expansion
└── 3.5 Speaker-aware correction         ← Multi-speaker videos

Phase 4 (Intelligence)
├── 4.1 Learning from user decisions     ← Long-term accuracy
├── 4.2 Processing speed optimization    ← Scale
└── 4.3 Correction profiles/presets      ← UX convenience
```

## Database Schema Changes (Preview)

```prisma
model SpeechCorrection {
  id        String   @id @default(cuid())
  videoId   String
  video     Video    @relation(fields: [videoId], references: [id])
  config    Json     // SpeechCorrectionConfig used
  mistakes  Json     // Full array of DetectedMistake objects
  applied   Json?    // Subset of mistakes that were applied
  totalDetected    Int
  totalApplied     Int?
  timeRemoved      Float?
  status    String   @default("detected") // detected | applied | reverted
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Additional fields on Video:
// speechCorrectionId  String?  (link to applied correction)
```

## Key Architectural Decisions

1. **Detection and application are separate steps.** Detection is fast, reversible, and previewable. Application is the expensive FFmpeg step that only runs after user approval (or auto-approval in the fast path).

2. **Confidence scoring is the backbone.** Every improvement feeds into confidence scores. Programmatic detection, GPT analysis, audio analysis, and prosody all contribute evidence. The user's threshold setting determines what gets auto-applied vs. suggested.

3. **Backward compatibility.** The current auto-apply flow continues to work for users who don't want to preview. The new preview/editor flow is opt-in. Both paths share the same detection pipeline.

4. **Quality over speed.** Speech correction is a premium feature. Users expect it to take a bit longer in exchange for better results. Don't optimize for speed at the cost of cut quality.
