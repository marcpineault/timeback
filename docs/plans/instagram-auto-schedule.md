# Instagram Auto-Schedule & AI Captions - Implementation Plan

## Overview

Allow users to upload a batch of videos, have them automatically edited (silence removal, captions, aspect ratio, etc.), get AI-written captions for each post, and auto-schedule them to Instagram across multiple time slots per day. The user uploads once and walks away — TimeBack handles editing, caption writing, and publishing on a schedule.

## Current State

- Videos are uploaded and processed with presets (Instagram Reels, Feed, etc.)
- Processing preferences can be saved per-user in the database
- Auto-process on upload exists (or is planned)
- **No direct Instagram API integration** — users download and manually post
- **No scheduling system** — no concept of posting queues or time slots
- **No AI caption generation for social posts** — captions exist only as video overlays
- Google Drive integration exists as a reference for OAuth patterns

## Goals

1. **Bulk upload → auto-edit** — User uploads N videos, all get processed with their saved preferences
2. **AI-written Instagram captions** — Each video gets an auto-generated caption with hashtags, hooks, and CTAs
3. **Multi-slot daily scheduling** — Users define posting slots (e.g., 9am, 1pm, 6pm) and videos fill them automatically
4. **Hands-off publishing** — Videos post to Instagram automatically at scheduled times
5. **Dashboard visibility** — Users can see upcoming scheduled posts, edit captions, reorder queue, and review analytics

---

## Architecture Decision: Instagram API Approach

### Option A: Instagram Graph API (Business/Creator Accounts) — RECOMMENDED

Instagram's official Content Publishing API allows programmatic posting of Reels and Feed posts for Business and Creator accounts connected to a Facebook Page.

**Requirements:**
- User must have an Instagram Business or Creator account
- Account must be linked to a Facebook Page
- App must be approved for `instagram_content_publish` permission
- Videos must be hosted at a publicly accessible URL (S3 works perfectly)

**API Flow for Publishing a Reel:**
```
1. POST /me/media
   - video_url: <S3 public URL>
   - caption: <AI-generated caption>
   - media_type: REELS
   → Returns creation_id

2. Poll GET /{creation_id}?fields=status_code
   → Wait for status = FINISHED

3. POST /me/media_publish
   - creation_id: <creation_id>
   → Returns published media_id
```

**Pros:** Official, reliable, full control, no third-party dependency
**Cons:** Facebook app review process, Business/Creator account required

### Option B: Third-Party Service (Buffer, Later, Hootsuite APIs)

Use a scheduling service's API as a middle layer.

**Pros:** Simpler integration, handles API changes
**Cons:** Additional cost per user, dependency on third party, less control

### Recommendation

**Go with Option A (Instagram Graph API)** because:
- No per-user cost for a third-party service
- Full control over the scheduling and publishing pipeline
- S3 storage already in place for public video URLs
- OAuth pattern already established with Google Drive integration
- Aligns with the Enterprise plan's "custom integrations" promise

---

## Phase 1: Database Schema — Scheduling & Instagram

### New Models

```prisma
// Instagram account connection
model InstagramAccount {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Instagram identifiers
  instagramUserId       String   @unique  // IG user ID from Graph API
  instagramUsername      String             // Display name
  instagramProfilePic   String?            // Profile picture URL

  // Facebook connection (required for IG API)
  facebookPageId        String             // Linked Facebook Page ID
  facebookPageName      String?

  // OAuth tokens
  accessToken           String             // Long-lived access token
  tokenExpiresAt        DateTime           // Token expiry (60 days for long-lived)

  // Account status
  isActive              Boolean  @default(true)
  lastPublishedAt       DateTime?
  lastError             String?

  // Relations
  scheduledPosts        ScheduledPost[]
  scheduleSlots         ScheduleSlot[]

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
}

// User-defined posting schedule (recurring time slots)
model ScheduleSlot {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  instagramAccountId    String
  instagramAccount      InstagramAccount @relation(fields: [instagramAccountId], references: [id], onDelete: Cascade)

  // Schedule definition
  dayOfWeek             Int               // 0=Sunday, 1=Monday, ..., 6=Saturday
  timeOfDay             String            // "09:00", "13:00", "18:00" (24h format)
  timezone              String            // "America/New_York", etc.

  isActive              Boolean  @default(true)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
  @@index([instagramAccountId])
  @@unique([instagramAccountId, dayOfWeek, timeOfDay]) // No duplicate slots
}

// Individual scheduled post
model ScheduledPost {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  instagramAccountId    String
  instagramAccount      InstagramAccount @relation(fields: [instagramAccountId], references: [id], onDelete: Cascade)

  videoId               String
  video                 Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  // Post content
  caption               String              // AI-generated or user-edited caption
  captionGenerated      Boolean  @default(true) // Was the caption AI-generated?
  hashtags              String[]             // Extracted/generated hashtags
  coverImageUrl         String?             // Custom cover image (thumbnail)

  // Scheduling
  scheduledFor          DateTime            // When to publish
  publishedAt           DateTime?           // When it actually published
  status                PostStatus @default(QUEUED)

  // Instagram API tracking
  igContainerId         String?             // IG media container ID (creation_id)
  igMediaId             String?             // Published media ID
  igPermalink           String?             // Link to published post

  // Error tracking
  retryCount            Int      @default(0)
  lastError             String?
  lastAttemptAt         DateTime?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
  @@index([instagramAccountId])
  @@index([scheduledFor])
  @@index([status])
  @@index([status, scheduledFor])  // For the cron job to find due posts
}

enum PostStatus {
  QUEUED          // Waiting in queue, not yet scheduled to a time slot
  SCHEDULED       // Assigned to a specific time slot
  PROCESSING      // Video still being edited
  UPLOADING       // Uploading to Instagram
  PUBLISHED       // Successfully posted
  FAILED          // Failed to post (will retry)
  CANCELLED       // User cancelled
}
```

### Modify Existing Models

```prisma
// Add to User model:
model User {
  // ... existing fields ...
  instagramAccounts   InstagramAccount[]
  scheduledPosts      ScheduledPost[]
  scheduleSlots       ScheduleSlot[]
}

// Add to Video model:
model Video {
  // ... existing fields ...
  scheduledPosts      ScheduledPost[]
}
```

### Files to Modify
- `prisma/schema.prisma` — Add new models, enums, relations
- Run `npx prisma migrate dev --name add-instagram-scheduling`

---

## Phase 2: Instagram OAuth & Account Connection

### Facebook App Setup (One-Time)

1. Create a Facebook App at developers.facebook.com
2. Add "Instagram Graph API" product
3. Configure OAuth redirect URI
4. Request permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`
5. Submit for App Review (required for production)

### OAuth Flow

```
User clicks "Connect Instagram"
        │
        ▼
Redirect to Facebook OAuth:
  https://www.facebook.com/v21.0/dialog/oauth
  ?client_id={app-id}
  &redirect_uri={callback-url}
  &scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement
  &response_type=code
        │
        ▼
User grants permissions → redirect back with ?code=xxx
        │
        ▼
Exchange code for short-lived token:
  GET /oauth/access_token?code=xxx&client_id=...&client_secret=...&redirect_uri=...
        │
        ▼
Exchange for long-lived token (60 days):
  GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=...
        │
        ▼
Get user's Facebook Pages:
  GET /me/accounts
        │
        ▼
Get Instagram Business Account linked to Page:
  GET /{page-id}?fields=instagram_business_account
        │
        ▼
Get Instagram profile info:
  GET /{ig-user-id}?fields=id,username,profile_picture_url
        │
        ▼
Store InstagramAccount in database
```

### API Routes

```
POST /api/instagram/auth             → Generate Facebook OAuth URL, redirect user
GET  /api/instagram/callback         → Handle OAuth callback, exchange tokens, store account
GET  /api/instagram/accounts         → List user's connected Instagram accounts
DELETE /api/instagram/accounts/:id   → Disconnect an account
POST /api/instagram/accounts/:id/refresh → Refresh long-lived token (before 60-day expiry)
```

### Token Refresh Strategy

Long-lived tokens last 60 days. Implement a cron/scheduled task:
- Run daily: check all tokens expiring within 7 days
- Refresh via: `GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token={current-token}`
- Update `tokenExpiresAt` in database
- If refresh fails, mark account as inactive and notify user

### Files to Create

- `src/app/api/instagram/auth/route.ts`
- `src/app/api/instagram/callback/route.ts`
- `src/app/api/instagram/accounts/route.ts`
- `src/app/api/instagram/accounts/[id]/route.ts`
- `src/app/api/instagram/accounts/[id]/refresh/route.ts`
- `src/lib/instagram.ts` — Instagram Graph API helper functions

### Environment Variables

```env
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
INSTAGRAM_REDIRECT_URI=https://yourdomain.com/api/instagram/callback
```

---

## Phase 3: AI Caption Generation

### Approach

Use the video's transcript (already generated by Whisper during processing) to create engaging Instagram captions. Leverage OpenAI GPT (already in the stack) or Claude to write captions tailored to the content.

### Caption Generation Pipeline

```
Processed video
        │
        ▼
Get transcript from Whisper (already exists in processing pipeline)
        │
        ▼
Send transcript + user context to AI:
  - Video transcript/summary
  - User's niche/brand voice (configurable)
  - Caption style preference (casual, professional, educational, etc.)
  - Hashtag strategy (number of hashtags, niche-specific)
  - CTA preference (follow, save, share, link in bio, etc.)
        │
        ▼
AI generates:
  - Hook (first line that appears before "...more")
  - Body (value, story, or context)
  - CTA (call to action)
  - Hashtags (mix of broad + niche)
  - Alt text (for accessibility)
        │
        ▼
Store caption with ScheduledPost
User can edit before publishing
```

### AI Prompt Template

```
You are a social media copywriter specializing in Instagram.
Write an engaging Instagram caption for a video with this transcript:

---
{transcript}
---

Brand voice: {user_brand_voice || "casual and authentic"}
Niche: {user_niche || "content creation"}
Caption style: {style || "hook-based"}

Requirements:
- First line must be a scroll-stopping hook (under 125 characters)
- Body should provide value or context (2-4 short paragraphs)
- Include a clear CTA at the end
- Generate 20-30 relevant hashtags (mix of high-volume and niche)
- Keep total caption under 2,200 characters (Instagram limit)

Return as JSON:
{
  "hook": "...",
  "body": "...",
  "cta": "...",
  "hashtags": ["...", "..."],
  "altText": "..."
}
```

### Caption Preferences (New DB Fields)

```prisma
// Add to UserProcessingPreferences or create new model:
model CaptionPreferences {
  id                    String   @id @default(cuid())
  userId                String   @unique
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Brand voice
  brandVoice            String   @default("casual")    // casual, professional, educational, humorous
  niche                 String   @default("")           // User's content niche
  captionStyle          String   @default("hook-based") // hook-based, storytelling, educational, minimal

  // Hashtag settings
  hashtagCount          Int      @default(25)
  customHashtags        String[] // Always-include hashtags
  blockedHashtags       String[] // Never-use hashtags

  // CTA settings
  defaultCTA            String   @default("")           // e.g., "Follow for more tips!"
  includeCTA            Boolean  @default(true)

  // Caption examples (for AI to learn user's style)
  exampleCaptions       String[] // Past captions user liked

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

### API Routes

```
POST /api/captions/generate          → Generate caption for a video (from transcript)
PUT  /api/captions/:postId           → Edit/update a caption for a scheduled post
GET  /api/captions/preferences       → Get user's caption preferences
PUT  /api/captions/preferences       → Save caption preferences
POST /api/captions/regenerate/:postId → Regenerate caption with different style
```

### Files to Create

- `src/app/api/captions/generate/route.ts`
- `src/app/api/captions/[postId]/route.ts`
- `src/app/api/captions/preferences/route.ts`
- `src/app/api/captions/regenerate/[postId]/route.ts`
- `src/lib/captionGenerator.ts` — AI caption generation logic

---

## Phase 4: Schedule Configuration UI

### Schedule Builder

Users define their weekly posting schedule by setting up recurring time slots.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Posting Schedule                                    Timezone: EST ▼ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  Monday      [9:00 AM] [1:00 PM] [6:00 PM]  [+ Add Slot]      ││
│  │  Tuesday     [9:00 AM] [1:00 PM] [6:00 PM]  [+ Add Slot]      ││
│  │  Wednesday   [9:00 AM] [1:00 PM] [6:00 PM]  [+ Add Slot]      ││
│  │  Thursday    [9:00 AM] [1:00 PM] [6:00 PM]  [+ Add Slot]      ││
│  │  Friday      [9:00 AM] [1:00 PM] [6:00 PM]  [+ Add Slot]      ││
│  │  Saturday    [10:00 AM] [4:00 PM]            [+ Add Slot]      ││
│  │  Sunday      [10:00 AM] [4:00 PM]            [+ Add Slot]      ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Quick Setup:                                                        │
│  [1x/day] [2x/day] [3x/day] [Custom]                               │
│                                                                      │
│  Posts per week: 19 │ Next available slot: Mon 9:00 AM              │
│                                                                      │
│  [Save Schedule]                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### API Routes

```
GET    /api/schedule/slots            → Get all schedule slots for user
POST   /api/schedule/slots            → Create a new time slot
PUT    /api/schedule/slots/:id        → Update a time slot
DELETE /api/schedule/slots/:id        → Delete a time slot
POST   /api/schedule/slots/quick      → Quick setup (1x/day, 2x/day, 3x/day)
```

### Files to Create

- `src/app/api/schedule/slots/route.ts`
- `src/app/api/schedule/slots/[id]/route.ts`
- `src/app/api/schedule/slots/quick/route.ts`
- `src/components/ScheduleBuilder.tsx`
- `src/components/TimeSlotPicker.tsx`

---

## Phase 5: Bulk Upload → Auto-Edit → Queue Flow

### The Core User Experience

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FULL USER WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────┘

Step 1: User uploads 10 videos at once
        │
        ▼
Step 2: All 10 videos auto-process with saved preferences
        (silence removal, captions overlay, 9:16, etc.)
        │
        ▼
Step 3: As each video finishes processing:
        - AI generates an Instagram caption from transcript
        - Video is assigned to the next available schedule slot
        - Post enters the queue with status SCHEDULED
        │
        ▼
Step 4: User reviews queue (optional):
        - See all upcoming posts in calendar/list view
        - Edit any caption
        - Reorder posts (drag-and-drop)
        - Swap time slots
        - Remove posts from queue
        │
        ▼
Step 5: At each scheduled time:
        - System uploads video to Instagram via API
        - Posts caption
        - Marks as PUBLISHED
        - Moves to history
        │
        ▼
Step 6: User checks analytics dashboard:
        - See published posts
        - View engagement metrics (likes, comments, views)
        - Track posting consistency
```

### Queue Assignment Logic

When a video finishes processing and a caption is generated:

```typescript
async function assignToNextSlot(userId: string, videoId: string, caption: string) {
  // 1. Get user's schedule slots
  const slots = await getActiveSlots(userId);

  // 2. Get already-scheduled posts to find what's taken
  const scheduledPosts = await getScheduledPosts(userId, { status: ['SCHEDULED', 'QUEUED'] });

  // 3. Find the next open slot starting from now
  const nextOpenSlot = findNextOpenSlot(slots, scheduledPosts, new Date());

  // 4. Create the scheduled post
  return prisma.scheduledPost.create({
    data: {
      userId,
      videoId,
      instagramAccountId: slots[0].instagramAccountId,
      caption,
      scheduledFor: nextOpenSlot,
      status: 'SCHEDULED',
    }
  });
}

function findNextOpenSlot(
  slots: ScheduleSlot[],
  existingPosts: ScheduledPost[],
  startFrom: Date
): Date {
  // Build a set of occupied slot times
  const occupied = new Set(existingPosts.map(p => p.scheduledFor.toISOString()));

  // Iterate forward from startFrom, checking each slot
  // Return first unoccupied slot datetime
  // Look up to 30 days ahead
}
```

### API Routes

```
POST /api/schedule/queue              → Add video(s) to scheduling queue
GET  /api/schedule/queue              → Get user's posting queue
PUT  /api/schedule/queue/:postId      → Update a queued post (caption, time, etc.)
DELETE /api/schedule/queue/:postId    → Remove from queue
POST /api/schedule/queue/reorder      → Reorder queue items
GET  /api/schedule/calendar           → Get calendar view of scheduled posts
```

### Files to Create

- `src/app/api/schedule/queue/route.ts`
- `src/app/api/schedule/queue/[postId]/route.ts`
- `src/app/api/schedule/queue/reorder/route.ts`
- `src/app/api/schedule/calendar/route.ts`
- `src/lib/scheduleQueue.ts` — Queue assignment logic

---

## Phase 6: Publishing Engine (Cron Job)

### How Posts Get Published

A background job runs every minute to check for posts that are due.

```
Every 60 seconds:
        │
        ▼
Query: SELECT * FROM ScheduledPost
       WHERE status = 'SCHEDULED'
       AND scheduledFor <= NOW()
       AND scheduledFor >= NOW() - INTERVAL '10 minutes'  // Don't publish very old missed posts
       ORDER BY scheduledFor ASC
        │
        ▼
For each due post:
  1. Verify Instagram account token is valid
  2. Verify video is accessible at S3 URL
  3. Call Instagram Content Publishing API:
     a. Create media container (POST /me/media)
     b. Poll for FINISHED status (GET /{container-id}?fields=status_code)
     c. Publish (POST /me/media_publish)
  4. On success: Update status → PUBLISHED, store igMediaId + permalink
  5. On failure: Increment retryCount, set lastError
     - If retryCount < 3: Keep as SCHEDULED (retry next cycle)
     - If retryCount >= 3: Set status → FAILED, notify user
```

### Implementation Options for the Background Job

**Option A: Vercel Cron (if deployed on Vercel)** — SIMPLEST
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/publish",
    "schedule": "* * * * *"
  }]
}
```

**Option B: External Cron Service (Railway, Render, etc.)**
- Use platform's built-in cron support
- Railway: `railway cron` or a worker service
- Render: Cron job service

**Option C: Self-Hosted Worker**
- Separate Node.js process
- Uses `node-cron` or `bull` job queue
- Connects to same database

### Recommendation

Use a **Next.js API route as cron endpoint** (`/api/cron/publish`) secured with a secret key. This is compatible with any hosting platform's cron trigger and keeps everything in the same codebase.

### API Routes

```
POST /api/cron/publish              → Triggered by cron, publishes due posts (secured by API key)
POST /api/cron/refresh-tokens       → Refresh expiring Instagram tokens (run daily)
GET  /api/schedule/history          → Get published post history
```

### Files to Create

- `src/app/api/cron/publish/route.ts` — Main publishing cron handler
- `src/app/api/cron/refresh-tokens/route.ts` — Token refresh cron
- `src/lib/instagramPublisher.ts` — Instagram publishing logic with retry
- `src/lib/cronAuth.ts` — Cron endpoint authentication

### Environment Variables

```env
CRON_SECRET=<random-string-to-secure-cron-endpoints>
```

---

## Phase 7: Frontend — Schedule Dashboard

### New Pages & Components

#### 7.1 Schedule Dashboard Page (`/dashboard/schedule`)

The main hub for managing scheduled content.

```
┌──────────────────────────────────────────────────────────────────────┐
│  📅 Content Schedule                          [Connect Instagram ▼]  │
│                                                                      │
│  ┌─── Tabs ─────────────────────────────────────────────────────────┐│
│  │ [Queue]  [Calendar]  [Published]  [Settings]                     ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─── Queue View ───────────────────────────────────────────────────┐│
│  │                                                                   ││
│  │  TODAY - Feb 8                                                    ││
│  │  ┌─────────────────────────────────────────────────────────────┐ ││
│  │  │ 1:00 PM  │ 🎬 video-tips-01.mp4  │ "Stop making this..."  │ ││
│  │  │          │ [Edit Caption] [Preview] [Remove]               │ ││
│  │  └─────────────────────────────────────────────────────────────┘ ││
│  │  ┌─────────────────────────────────────────────────────────────┐ ││
│  │  │ 6:00 PM  │ 🎬 editing-hack.mp4   │ "This one trick..."    │ ││
│  │  │          │ [Edit Caption] [Preview] [Remove]               │ ││
│  │  └─────────────────────────────────────────────────────────────┘ ││
│  │                                                                   ││
│  │  TOMORROW - Feb 9                                                 ││
│  │  ┌─────────────────────────────────────────────────────────────┐ ││
│  │  │ 9:00 AM  │ 🎬 morning-routine.mp4│ "Your morning routine" │ ││
│  │  │          │ [Edit Caption] [Preview] [Remove]               │ ││
│  │  └─────────────────────────────────────────────────────────────┘ ││
│  │                                                                   ││
│  │  ... 7 more posts scheduled this week                            ││
│  │                                                                   ││
│  │  Queue: 10 videos │ Days of content: 4 │ Next post: Today 1PM   ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

#### 7.2 Calendar View

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◀ February 2026 ▶                                                   │
│                                                                      │
│  Mon    Tue    Wed    Thu    Fri    Sat    Sun                       │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐                 │
│  │      │      │      │      │      │  7   │  8   │                 │
│  │      │      │      │      │      │ ●●   │ ●●●  │                 │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤                 │
│  │  9   │  10  │  11  │  12  │  13  │  14  │  15  │                 │
│  │ ●●●  │ ●●●  │ ●●●  │ ●●●  │ ●●●  │ ●●   │ ●●   │                 │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤                 │
│  │  16  │  17  │  18  │  19  │      │      │      │                 │
│  │ ●●●  │ ●●   │      │      │      │      │      │                 │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘                 │
│                                                                      │
│  ● = scheduled post    ● (green) = published    ● (red) = failed    │
│                                                                      │
│  Click a day to see/edit posts for that day                          │
└──────────────────────────────────────────────────────────────────────┘
```

#### 7.3 Caption Editor Modal

```
┌──────────────────────────────────────────────────────────────────────┐
│  Edit Caption                                             [✕ Close]  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐ │
│  │              │  │                                               │ │
│  │  [Video      │  │  Stop making this editing mistake! 🛑         │ │
│  │   Preview]   │  │                                               │ │
│  │              │  │  Most creators spend hours editing when they  │ │
│  │   0:32       │  │  could automate 90% of the process.          │ │
│  │              │  │                                               │ │
│  └──────────────┘  │  Here's what I do instead:                    │ │
│                     │  ✅ Upload once                               │ │
│                     │  ✅ Auto-remove silences                      │ │
│                     │  ✅ Auto-add captions                         │ │
│                     │  ✅ Auto-schedule to Instagram                │ │
│                     │                                               │ │
│  Scheduled:         │  Save yourself 10+ hours a week 🔥           │ │
│  Feb 9, 9:00 AM     │                                               │ │
│  [Change Time ▼]    │  Follow @timeback for more creator tips!     │ │
│                     │                                               │ │
│                     │  #contentcreation #instagramtips #reels ...   │ │
│                     └──────────────────────────────────────────────┘ │
│                                                                      │
│  [🔄 Regenerate Caption]  [Style: Hook-based ▼]                     │
│                                                                      │
│  Character count: 847/2,200                                          │
│                                                                      │
│  [Cancel]                                          [Save Changes]    │
└──────────────────────────────────────────────────────────────────────┘
```

### Files to Create

- `src/app/dashboard/schedule/page.tsx` — Main schedule page
- `src/components/schedule/QueueView.tsx` — List of upcoming posts
- `src/components/schedule/CalendarView.tsx` — Monthly calendar view
- `src/components/schedule/PostCard.tsx` — Individual post card in queue
- `src/components/schedule/CaptionEditor.tsx` — Caption editing modal
- `src/components/schedule/ScheduleBuilder.tsx` — Weekly time slot configuration
- `src/components/schedule/InstagramConnect.tsx` — Account connection flow
- `src/components/schedule/PublishedHistory.tsx` — Past posts view
- `src/hooks/useSchedule.ts` — Schedule data fetching hook
- `src/hooks/useCaptionEditor.ts` — Caption editing state management

---

## Phase 8: Tying It All Together — The Auto-Schedule Flow

### Modified Upload Pipeline

```
User uploads videos with "Auto-Schedule to Instagram" enabled
        │
        ▼
┌───────────────────────────────────────────┐
│ For each uploaded video (parallel):        │
│                                            │
│  1. Upload file to S3                      │
│  2. Start video processing (existing flow) │
│     - Silence removal                      │
│     - Captions overlay                     │
│     - Aspect ratio (9:16 for Reels)        │
│     - Audio normalization                  │
│  3. On processing complete:                │
│     a. Get transcript (from Whisper)       │
│     b. Generate AI caption                 │
│     c. Assign to next schedule slot        │
│     d. Create ScheduledPost record         │
│  4. Video appears in schedule queue        │
│                                            │
└───────────────────────────────────────────┘
        │
        ▼
User gets notification: "10 videos processed & scheduled!"
Queue now shows 10 upcoming posts across the next 4 days
```

### Integration Points with Existing Code

| Existing Feature | How It Connects |
|---|---|
| `POST /api/upload` | Add `autoSchedule: true` flag to trigger the pipeline |
| `POST /api/process` | On completion callback, trigger caption generation + queue assignment |
| Whisper transcription | Reuse transcript output as input for caption AI |
| S3 storage | Processed video URL used for Instagram publishing |
| User preferences | Instagram Reels preset auto-applied when scheduling is enabled |
| Progress tracking | Extend to show "Processing → Captioning → Scheduled" stages |

---

## Phase 9: Notifications

### Notification Events

| Event | Channel | Content |
|---|---|---|
| Videos finished processing & scheduled | In-app + Email | "10 videos scheduled! Next post: Tomorrow 9AM" |
| Post published successfully | In-app | "Your reel was posted! View it here: [link]" |
| Post failed to publish | In-app + Email | "Failed to post: [error]. We'll retry." |
| Token expiring soon | Email | "Reconnect your Instagram account" |
| Queue running low | In-app + Email | "Only 2 posts left! Upload more content." |

### Implementation

Simple approach first — in-app notifications stored in DB:

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // 'post_published', 'post_failed', 'queue_low', etc.
  title     String
  message   String
  read      Boolean  @default(false)
  data      Json?    // Additional context (post ID, error, etc.)
  createdAt DateTime @default(now())

  @@index([userId, read])
}
```

---

## Implementation Phases & Priority

### MVP (Phase A) — Get Posts to Instagram
1. Database schema migration (Phase 1)
2. Instagram OAuth connection (Phase 2)
3. Basic schedule slot configuration (Phase 4)
4. Manual queue management — user adds processed videos to queue (Phase 5)
5. Publishing cron job (Phase 6)
6. Basic queue UI (Phase 7)

### V2 (Phase B) — AI Captions + Auto-Queue
7. AI caption generation (Phase 3)
8. Auto-queue after processing (Phase 5 + 8)
9. Caption editor UI (Phase 7)
10. Calendar view (Phase 7)

### V3 (Phase C) — Full Automation
11. Bulk upload → auto-edit → auto-caption → auto-schedule pipeline (Phase 8)
12. Notifications (Phase 9)
13. Published post analytics
14. Queue optimization suggestions (best posting times)

---

## Plan Considerations

### Instagram API Rate Limits
- Content Publishing: 25 posts per 24-hour period per account
- API calls: 200 calls per hour per user
- Video upload: Max 100MB, 15 min duration for Reels
- Build rate limit tracking into the publishing engine

### Error Handling & Edge Cases
- **Token expired mid-publish**: Attempt refresh, retry, or fail gracefully
- **Video too large for Instagram**: Compress/transcode before upload
- **Caption too long**: Truncate at 2,200 characters with warning
- **Duplicate posting prevention**: Check igContainerId before re-publishing
- **Timezone handling**: All times stored as UTC, displayed in user's timezone
- **DST transitions**: Use proper timezone library (date-fns-tz or luxon)
- **User disconnects Instagram**: Pause all scheduled posts, notify user
- **Concurrent cron runs**: Use database locking to prevent double-publishing

### Security Considerations
- Instagram tokens encrypted at rest in database
- Cron endpoints secured with secret API key
- Rate limiting on all public endpoints
- User can only access their own accounts, posts, and schedule
- OAuth state parameter to prevent CSRF
- Webhook verification for any Instagram webhooks

### Plan Tier Integration
| Feature | FREE | PRO | CREATOR | ENTERPRISE |
|---|---|---|---|---|
| Instagram accounts | 0 | 1 | 2 | Unlimited |
| Posts per month | 0 | 30 | 120 | Unlimited |
| AI captions | 0 | 30 | 120 | Unlimited |
| Schedule slots/day | 0 | 1 | 3 | Unlimited |
| Caption regeneration | 0 | 3/post | 10/post | Unlimited |

### Dependencies & Third-Party Services
- **Facebook Developer Account** — Required for Instagram Graph API
- **Facebook App Review** — Required before going live (can take 1-4 weeks)
- **S3 public URLs** — Videos must be publicly accessible for Instagram to fetch
- **Cron service** — Platform-dependent (Vercel Cron, Railway cron, etc.)
- **OpenAI API** — Already in use, needed for caption generation

---

## File Summary — Everything That Needs to Be Created/Modified

### New Files (Backend)
```
src/app/api/instagram/auth/route.ts
src/app/api/instagram/callback/route.ts
src/app/api/instagram/accounts/route.ts
src/app/api/instagram/accounts/[id]/route.ts
src/app/api/instagram/accounts/[id]/refresh/route.ts
src/app/api/schedule/slots/route.ts
src/app/api/schedule/slots/[id]/route.ts
src/app/api/schedule/slots/quick/route.ts
src/app/api/schedule/queue/route.ts
src/app/api/schedule/queue/[postId]/route.ts
src/app/api/schedule/queue/reorder/route.ts
src/app/api/schedule/calendar/route.ts
src/app/api/schedule/history/route.ts
src/app/api/captions/generate/route.ts
src/app/api/captions/[postId]/route.ts
src/app/api/captions/preferences/route.ts
src/app/api/captions/regenerate/[postId]/route.ts
src/app/api/cron/publish/route.ts
src/app/api/cron/refresh-tokens/route.ts
src/lib/instagram.ts
src/lib/instagramPublisher.ts
src/lib/captionGenerator.ts
src/lib/scheduleQueue.ts
src/lib/cronAuth.ts
```

### New Files (Frontend)
```
src/app/dashboard/schedule/page.tsx
src/components/schedule/QueueView.tsx
src/components/schedule/CalendarView.tsx
src/components/schedule/PostCard.tsx
src/components/schedule/CaptionEditor.tsx
src/components/schedule/ScheduleBuilder.tsx
src/components/schedule/InstagramConnect.tsx
src/components/schedule/PublishedHistory.tsx
src/hooks/useSchedule.ts
src/hooks/useCaptionEditor.ts
```

### Modified Files
```
prisma/schema.prisma                        — New models + enums + relations
src/app/api/process/route.ts                — Hook into post-processing pipeline
src/app/api/upload/route.ts                 — Add autoSchedule flag
src/components/VideoUploader.tsx             — Add auto-schedule toggle
src/app/dashboard/VideoProcessor.tsx         — Show scheduling status
src/app/dashboard/page.tsx                   — Add schedule nav link
src/middleware.ts                            — Add public route for Instagram callback
```

---

## Open Questions

1. **Facebook App Review** — Who will handle the app review submission? What's the business entity?
2. **Video hosting** — Are S3 URLs currently public? Instagram needs to fetch the video from a public URL.
3. **Cron hosting** — What hosting platform are you deploying to? This determines the cron approach.
4. **Caption AI model** — Use OpenAI (already in stack) or Claude for caption generation?
5. **Multi-platform future** — Should we architect this to support TikTok/YouTube Shorts later? (Recommendation: yes, make the scheduling models platform-agnostic with an enum.)
6. **Cover images** — Should users be able to pick a custom thumbnail/cover frame?
7. **Draft mode** — Should there be a "draft" status where users review everything before enabling the schedule?
