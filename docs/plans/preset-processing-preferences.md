# Preset Processing Preferences - Implementation Plan

## Overview

Allow users to preset their processing preferences so videos can be automatically processed after upload without requiring additional user input. This enables a "set and forget" workflow where users can upload videos and walk away, returning to find them fully processed.

## Current State

- Processing preferences stored in **localStorage only** (client-side)
- Preferences are NOT associated with user accounts
- Preferences don't sync across devices/browsers
- Upload and processing are **separate manual steps**
- User must stay on page and configure each batch

## Goals

1. **Persist preferences per-user** in the database
2. **Allow preset selection** that persists across sessions/devices
3. **Enable auto-processing** after upload with saved preferences
4. **Background processing** that continues even if user leaves

---

## Phase 1: Database Schema for User Preferences

### New Prisma Model

```prisma
model UserProcessingPreferences {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Auto-processing toggle
  autoProcessOnUpload  Boolean @default(false)

  // Selected preset (null = custom)
  activePreset         String?  // 'youtube-shorts' | 'instagram-reels' | 'youtube' | 'instagram-feed' | null

  // Caption Settings
  generateCaptions     Boolean @default(true)
  captionStyle         String  @default("instagram")

  // Headline Settings
  headline             String  @default("")
  headlinePosition     String  @default("top")      // 'top' | 'center' | 'bottom'
  headlineStyle        String  @default("speech-bubble") // 'classic' | 'speech-bubble'
  useHookAsHeadline    Boolean @default(false)
  generateAIHeadline   Boolean @default(false)

  // Audio Settings
  silenceThreshold     Float   @default(-25)
  silenceDuration      Float   @default(0.5)
  autoSilenceThreshold Boolean @default(true)
  normalizeAudio       Boolean @default(true)

  // Video Settings
  aspectRatio          String  @default("original") // 'original' | '9:16' | '16:9' | '1:1' | '4:5'

  // Speech Correction (Beta)
  speechCorrection           Boolean @default(false)
  removeFillerWords          Boolean @default(true)
  removeRepeatedWords        Boolean @default(true)
  removeRepeatedPhrases      Boolean @default(true)
  removeFalseStarts          Boolean @default(true)
  removeSelfCorrections      Boolean @default(true)
  speechAggressiveness       String  @default("moderate") // 'conservative' | 'moderate' | 'aggressive'

  // B-Roll (future)
  generateBRoll        Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Files to Modify

- `prisma/schema.prisma` - Add model + relation to User
- Run `npx prisma migrate dev`

---

## Phase 2: API Endpoints for Preferences

### New API Routes

#### `GET /api/user/preferences`
Fetch user's saved processing preferences.

```typescript
// Returns UserProcessingPreferences or default config if none saved
```

#### `PUT /api/user/preferences`
Save/update user's processing preferences.

```typescript
// Body: Partial<ProcessingConfig> + autoProcessOnUpload + activePreset
// Returns: Updated UserProcessingPreferences
```

#### `POST /api/user/preferences/apply-preset`
Apply a preset and optionally save it as default.

```typescript
// Body: { preset: string, saveAsDefault?: boolean }
// Returns: Full config after applying preset
```

### Files to Create

- `src/app/api/user/preferences/route.ts` - GET/PUT handlers
- `src/lib/processingPreferences.ts` - Preference utilities and defaults

---

## Phase 3: Frontend Integration

### 3.1 Update ProcessingOptions Component

**Current behavior:** Loads/saves to localStorage
**New behavior:**
1. On mount: Fetch from API (with localStorage fallback for offline)
2. On change: Debounced save to API + localStorage
3. Add "Save as Default" button
4. Add "Auto-process uploads" toggle

### 3.2 New Settings Page Section

Add a dedicated "Processing Defaults" section in user settings:
- Select default preset
- Configure custom defaults
- Toggle auto-processing
- Preview what will happen on upload

### 3.3 Update VideoUploader Component

Add checkbox/toggle: **"Process automatically with saved preferences"**

When enabled:
1. After successful upload, immediately queue for processing
2. Use saved preferences from database
3. Show notification that processing has started
4. User can navigate away

### Files to Modify

- `src/components/ProcessingOptions.tsx` - API integration + new controls
- `src/components/VideoUploader.tsx` - Auto-process toggle
- `src/app/dashboard/VideoProcessor.tsx` - Handle auto-process flow
- `src/app/settings/page.tsx` or new settings component

---

## Phase 4: Auto-Processing Workflow

### Upload Flow with Auto-Processing

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Upload Flow                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. User uploads video(s) with "Auto-process" enabled            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Upload completes → File stored in S3/local                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. System fetches user's saved preferences from DB              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. POST /api/process called automatically with preferences      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Video record created in DB with status 'PROCESSING'          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. User can leave - processing continues server-side            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. User returns → Dashboard shows completed videos              │
└─────────────────────────────────────────────────────────────────┘
```

### Server-Side Processing Continuation

The current `/api/process` endpoint already handles:
- Long-running operations (600s timeout configured)
- Status updates in database
- S3 upload of processed files

We need to ensure:
- Video record exists in DB before processing starts
- Status updates are persisted (not just in localStorage queue)
- User can see processing status on return (dashboard query)

---

## Phase 5: Dashboard/History Enhancement

### Show Processing Status on Return

When user returns to dashboard:
1. Query `Video` table for user's videos with status `PROCESSING` or `PENDING`
2. Show progress indicators for in-progress videos
3. Show completed videos ready for download

### New API Endpoint

#### `GET /api/videos/status`
Get status of user's recent videos.

```typescript
// Query params: ?status=processing,pending,completed&limit=50
// Returns: Video[] with status, progress, downloadUrl
```

### Files to Create/Modify

- `src/app/api/videos/status/route.ts` - Video status endpoint
- `src/app/dashboard/page.tsx` - Show processing status
- `src/components/VideoQueue.tsx` - Hybrid local+DB queue display

---

## Implementation Tasks

### Task 1: Database Schema (Est. complexity: Low)
- [ ] Add `UserProcessingPreferences` model to schema
- [ ] Add relation to `User` model
- [ ] Run migration

### Task 2: Preferences API (Est. complexity: Medium)
- [ ] Create `GET /api/user/preferences` endpoint
- [ ] Create `PUT /api/user/preferences` endpoint
- [ ] Add preference utilities library
- [ ] Handle unauthenticated users (localStorage fallback)

### Task 3: Frontend Preferences Integration (Est. complexity: Medium)
- [ ] Update `ProcessingOptions` to fetch/save via API
- [ ] Add debounced saving with optimistic updates
- [ ] Add "Save as Default" button
- [ ] Add "Auto-process uploads" toggle
- [ ] Maintain localStorage as cache/offline fallback

### Task 4: Auto-Process on Upload (Est. complexity: High)
- [ ] Add auto-process toggle to `VideoUploader`
- [ ] Fetch preferences before processing
- [ ] Trigger `/api/process` automatically after upload
- [ ] Create Video DB record before processing
- [ ] Handle batch uploads with auto-processing

### Task 5: Status Tracking & Dashboard (Est. complexity: Medium)
- [ ] Create `/api/videos/status` endpoint
- [ ] Update dashboard to query processing status
- [ ] Merge DB status with localStorage queue
- [ ] Show appropriate UI for all states

### Task 6: Polish & Edge Cases (Est. complexity: Low)
- [ ] Handle network errors gracefully
- [ ] Add loading states
- [ ] Add error recovery options
- [ ] Mobile-friendly toggle placement
- [ ] Test across browsers/devices

---

## UI Mockup - Auto-Process Toggle

```
┌──────────────────────────────────────────────────────────────────┐
│  Upload Videos                                                    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │         Drag & drop videos here or click to browse         │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ☑ Auto-process with saved preferences                      │  │
│  │                                                             │  │
│  │   Using: "YouTube Shorts" preset                           │  │
│  │   • 9:16 vertical • Auto silence removal • Captions        │  │
│  │                                                             │  │
│  │   [Change preferences]                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  You can close this page after upload. Videos will process       │
│  automatically and appear in your dashboard when ready.          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Settings Page - Processing Defaults

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Processing Defaults                                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Default Preset                                              │  │
│  │ ┌──────────────────────────────────────────────────────┐   │  │
│  │ │ YouTube Shorts                                    ▼  │   │  │
│  │ └──────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │ ☑ Auto-process videos after upload                         │  │
│  │                                                             │  │
│  │ ───────────────────────────────────────────────────────    │  │
│  │                                                             │  │
│  │ Custom Settings Override                                    │  │
│  │                                                             │  │
│  │ Aspect Ratio: [9:16 ▼]  Audio: [✓ Normalize] [✓ Remove]   │  │
│  │ Captions: [✓ Enabled]   Style: [Instagram ▼]              │  │
│  │                                                             │  │
│  │ [Save as Default]                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Migration Path

### Existing Users
1. On first API call, check if preferences exist in DB
2. If not, create with defaults (not localStorage values - clean slate)
3. User can then configure and save

### localStorage Handling
- Keep localStorage as **read cache** for instant loads
- Always **write to both** API and localStorage
- On load: Show localStorage immediately, then sync from API
- Conflict resolution: API wins (most recent save)

---

## Security Considerations

1. **Auth Required** - All preference endpoints require authentication
2. **User Isolation** - Users can only access their own preferences
3. **Input Validation** - Validate all preference values server-side
4. **Rate Limiting** - Apply rate limits to preference saves

---

## Success Metrics

1. **Adoption** - % of users who enable auto-processing
2. **Completion** - % of auto-processed videos that complete successfully
3. **Return Rate** - % of users who leave and return to find processed videos
4. **Time Saved** - Average reduction in time from upload to download

---

## Future Enhancements

1. **Multiple Saved Presets** - Save custom presets with names
2. **Per-Folder Presets** - Different presets for different upload folders
3. **Email Notifications** - Notify when processing completes
4. **Mobile Push Notifications** - Notify mobile users
5. **Scheduled Processing** - Process during off-peak hours
6. **Batch Rules** - Apply different presets based on video characteristics
