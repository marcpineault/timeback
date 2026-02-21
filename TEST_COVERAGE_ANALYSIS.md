# Test Coverage Analysis

## Current State

**The Timeback codebase has zero automated tests.** There is no test framework configured, no test runner, no coverage tooling, and no test files. Out of 167 TypeScript source files across 59 API routes, 38 components, 6 hooks, and 38 library modules, none have accompanying tests.

---

## Recommended Test Framework Setup

Before writing any tests, the project needs a test infrastructure:

- **Test runner**: [Vitest](https://vitest.dev/) — native TypeScript/ESM support, fast, compatible with the Next.js ecosystem
- **Component testing**: `@testing-library/react` + `jsdom` environment for React components
- **API route testing**: Direct function imports with mocked `NextRequest`/`NextResponse` objects
- **Database mocking**: `prisma-mock` or manual mock of the Prisma client singleton
- **Coverage**: Vitest's built-in `--coverage` flag (uses `v8` or `istanbul` under the hood)

---

## Priority Areas for Test Coverage

The areas below are ranked by risk and impact — modules where bugs would be most damaging to users, where the logic is most complex, or where regressions are most likely.

### Priority 1: Pure Logic & Utility Functions (High Value, Low Effort)

These modules contain pure or near-pure functions that are straightforward to test without mocking external services. They offer the highest return on investment.

#### 1.1 `src/lib/timezone.ts` — `localTimeToUTC()`

- **Why**: This function is used by the scheduling system to convert user-specified local times to UTC. A timezone bug means posts publish at the wrong time — a high-severity user-facing issue.
- **What to test**:
  - Standard offsets (EST, PST, UTC)
  - DST transitions (spring forward / fall back for US, EU timezones)
  - Edge cases: midnight crossing, date rollover, southern hemisphere DST
  - Non-US timezones: `Asia/Kolkata` (UTC+5:30), `Pacific/Auckland`
- **Estimated tests**: 10–15

#### 1.2 `src/lib/fillerWords/` — `getFillerConfig()`, `getFillerTier()`

- **Why**: Filler word detection drives the speech correction feature. Misclassifying a real word as a filler would cause it to be cut from the user's video.
- **What to test**:
  - Language code normalization (`"en-US"` → `"en"`, unknown code → English fallback)
  - Tier classification for each supported language (en, fr, es, de, pt)
  - Regex patterns matching variations (`"ummm"`, `"uhhh"`)
  - Boundary: empty string, punctuation-only input, non-ASCII characters
- **Estimated tests**: 15–20

#### 1.3 `src/lib/ffmpeg.ts` — `getNonSilentSegments()`, `splitHeadlineIntoTwoLines()`, `estimateTextWidth()`

- **Why**: `getNonSilentSegments` is the core algorithm that decides which parts of a video to keep after silence detection. Bugs here mean content gets cut or silence gets kept. The headline functions are pure and easy to test.
- **What to test**:
  - `getNonSilentSegments`: No silences (returns full video), single silence, multiple silences, overlapping segments after padding, merging adjacent segments, segments shorter than minimum duration
  - `splitHeadlineIntoTwoLines`: Single word, two words, long headline balancing, very short text
  - `estimateTextWidth`: Various character classes, empty string
- **Estimated tests**: 20–25

#### 1.4 `src/lib/speechCorrection.ts` — `calculateSegmentsToKeep()`, `normalizeWord()`, `findRemovedWordIndices()`, `detectRepeatedPhrases()`, `generateCorrectionReport()`

- **Why**: Speech correction is the most algorithmically complex feature. The `calculateSegmentsToKeep` function determines what video content survives editing — getting this wrong permanently damages user content.
- **What to test**:
  - `calculateSegmentsToKeep`: No mistakes, single mistake, overlapping mistakes, confidence threshold filtering, segment merging, edge cases (mistake at start/end of video)
  - `findRemovedWordIndices` (LCS diff): Identical texts, single word removed, multiple removals, GPT returning reordered words, empty cleaned text
  - `detectRepeatedPhrases`: Adjacent repeated phrases, phrases with gaps, common phrases that should be skipped, overlapping detections
  - `preDetectMistakes`: Filler words at different tiers, repeated words, stutters, multi-word filler phrases, self-corrections, false starts (these can be tested by providing synthetic `TranscriptionWord[]` arrays)
  - `generateCorrectionReport`: Empty list, mixed mistake types
- **Estimated tests**: 30–40

#### 1.5 `src/lib/plans.ts` — Plan definitions and limits

- **Why**: Plan limits gate access to features. If `PLANS.FREE.videosPerMonth` is wrong, users get incorrect access.
- **What to test**:
  - Each plan has expected values (price, video limits, resolution, watermark)
  - `PlanType` matches keys of `PLANS`
  - Feature list strings exist and are non-empty
- **Estimated tests**: 5–8

#### 1.6 `src/lib/rateLimit.ts` — `checkRateLimit()`, `getRateLimitIdentifier()`

- **Why**: Rate limiting protects against abuse. Bugs here either block legitimate users or fail to limit abusive ones.
- **What to test**:
  - First request is allowed, Nth request exceeds limit
  - Window expiration resets the counter
  - Different endpoints have different limits
  - `getRateLimitIdentifier`: With userId, without userId (falls back to IP), x-forwarded-for parsing
  - Cleanup of expired entries, max store size enforcement
- **Estimated tests**: 12–15

#### 1.7 `src/lib/cronAuth.ts` — `verifyCronAuth()`

- **Why**: This protects cron endpoints. A bypass means anyone can trigger publishing or token refresh.
- **What to test**:
  - Valid Bearer token → `true`
  - Invalid token → `false`
  - Missing Authorization header → `false`
  - Missing CRON_SECRET env var → `false`
- **Estimated tests**: 4–5

---

### Priority 2: Business Logic with External Dependencies (High Value, Medium Effort)

These modules contain critical business logic but require mocking Prisma, external APIs, or the filesystem.

#### 2.1 `src/lib/scheduleQueue.ts` — `findNextOpenSlot()`, `reorderQueue()`

- **Why**: The scheduling queue determines when posts are published. Bugs in slot-finding logic could cause missed posts, double-posting, or posts scheduled in the past.
- **What to test** (with Prisma mocked):
  - `findNextOpenSlot`: No slots configured → `null`, all slots occupied → `null`, first available slot returned, skips past slots, handles 30-day lookahead
  - `reorderQueue`: Correctly reassigns times in new order, handles subset of posts, empty list
  - `getPostingQueue`: Status filtering, limit, include published toggle
- **Estimated tests**: 15–20

#### 2.2 `src/lib/instagramPublisher.ts` — `publishDuePosts()`, `publishPost()`, `refreshExpiringTokens()`

- **Why**: This is the core publishing pipeline. Bugs mean posts don't get published, retries don't work, or stuck posts never recover.
- **What to test** (with Prisma + Instagram API mocked):
  - `publishDuePosts`: No due posts, successful publish, publish failure with retry, max retries → FAILED, atomic claim prevents double-publish, stale UPLOADING recovery
  - `publishPost`: Post not found, already published, successful immediate publish, publish failure
  - `refreshExpiringTokens`: No expiring tokens, successful refresh, failed refresh creates notification, legacy account without userAccessToken
  - `resolveVideoUrl`: Full URL passthrough, S3 key presigning, local path with APP_URL, local path without APP_URL → error
- **Estimated tests**: 20–25

#### 2.3 `src/lib/captionGenerator.ts` — `generateCaption()`

- **Why**: Captions are user-facing content. The function has important post-processing logic (hashtag filtering, caption assembly, length capping) that should be tested independently of the OpenAI call.
- **What to test** (with OpenAI mocked):
  - Blocked hashtags are filtered out
  - Custom hashtags are included
  - Full caption respects 2200-char Instagram limit
  - CTA inclusion/exclusion based on preferences
  - JSON parsing handles markdown-wrapped responses
  - Missing preferences use defaults
- **Estimated tests**: 10–12

#### 2.4 `src/lib/cleanup.ts` — `cleanupOldFiles()`

- **Why**: Cleanup deletes user files. Bugs could delete active uploads or fail to clean up, causing disk exhaustion.
- **What to test** (with filesystem mocked):
  - Files older than 1 hour are deleted
  - Files newer than 1 hour are kept
  - `.gitkeep` files are never deleted
  - Locked files are skipped
  - Symlinks are skipped (security check)
  - Non-existent directories handled gracefully
- **Estimated tests**: 8–10

---

### Priority 3: API Route Integration Tests (Medium Value, Medium Effort)

API routes are the system's external interface. Integration-style tests that call the route handlers with mocked auth and database can catch regressions in request validation, authorization, and response formatting.

#### 3.1 Webhook handlers

- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook processing (subscription changes, payment events)
- `src/app/api/webhooks/clerk/route.ts` — Clerk webhook processing (user creation/update)
- **Why**: Webhook handlers process external events that modify user state. Bugs can cause users to lose access to paid features or fail to provision new accounts.

#### 3.2 Scheduling API routes

- `src/app/api/schedule/queue/route.ts` — Queue management
- `src/app/api/schedule/slots/route.ts` — Slot CRUD
- `src/app/api/schedule/queue/[postId]/publish/route.ts` — Publish Now
- **Why**: These routes orchestrate the scheduling feature. They should validate inputs (e.g., invalid dayOfWeek, missing instagramAccountId) and return correct HTTP status codes.

#### 3.3 Video processing routes

- `src/app/api/process/route.ts` — Main processing pipeline
- `src/app/api/upload/route.ts` — File upload
- **Why**: These routes handle file I/O, plan limit enforcement, and coordinate the processing pipeline.

#### 3.4 Ideate routes

- `src/app/api/ideate/ideas/route.ts` — Idea generation
- `src/app/api/ideate/scripts/route.ts` — Script generation
- **Why**: These routes enforce plan limits (`ideateGenerationsPerMonth`) and interact with AI services.

**Estimated tests per route group**: 8–15 each

---

### Priority 4: React Component Tests (Medium Value, Higher Effort)

Component tests with `@testing-library/react` can verify interactive behavior and state management.

#### 4.1 `src/components/VideoSplitter.tsx`, `src/components/VideoTrimmer.tsx`

- **Why**: These are the most interactive components, handling time-range inputs and video preview state.

#### 4.2 `src/components/schedule/QueueView.tsx`, `src/components/schedule/PostEditor.tsx`

- **Why**: Queue reordering and post editing are core scheduling features with complex client state.

#### 4.3 Custom hooks: `src/hooks/useSchedule.ts`, `src/hooks/useIdeate.ts`

- **Why**: These hooks encapsulate API interaction patterns and state management. Testing them ensures correct loading states, error handling, and cache invalidation.

---

### Priority 5: Edge Cases and Security (Ongoing)

These aren't a separate test suite but cross-cutting concerns that should be verified across the above priorities:

- **Authorization**: Every API route enforces Clerk authentication — test that unauthenticated requests return 401
- **Plan limits**: Video processing and ideation routes enforce monthly limits — test that exceeding limits returns 403
- **Input validation**: API routes should reject malformed inputs (missing required fields, invalid types) — test that they return 400 with helpful messages
- **File path traversal**: Upload/download routes should prevent path traversal attacks — test inputs like `../../etc/passwd`
- **Rate limiting**: Verify that rate limits are enforced on upload, processing, and Google Drive endpoints

---

## Suggested Implementation Order

| Phase | Scope | Modules | Est. Tests |
|-------|-------|---------|------------|
| **1** | Pure functions | timezone, fillerWords, getNonSilentSegments, plans, cronAuth, estimateTextWidth, splitHeadline | ~60 |
| **2** | Core algorithms | speechCorrection (calculateSegmentsToKeep, findRemovedWordIndices, preDetectMistakes, detectRepeatedPhrases), rateLimit | ~50 |
| **3** | Business logic (mocked DB) | scheduleQueue, instagramPublisher, captionGenerator, cleanup | ~65 |
| **4** | API routes | webhooks, scheduling, processing, ideate | ~50 |
| **5** | Components & hooks | VideoSplitter, QueueView, useSchedule, useIdeate | ~30 |

**Total estimated**: ~255 tests across 5 phases.

---

## Quick Start: Vitest Setup

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Use 'jsdom' for component tests
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/app/api/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```
