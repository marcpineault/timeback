# Timeback SaaS Scaling Plan

> A pragmatic, phased approach to scaling a video processing SaaS while keeping costs low

## Current State Assessment

### What You Have
- **Tech Stack**: Next.js 16 + React 19 + TypeScript + FFmpeg + OpenAI APIs
- **Deployment**: Railway/Render with Docker (Alpine Linux)
- **Storage**: Local filesystem (10GB persistent volume)
- **Processing**: Synchronous, single-threaded FFmpeg
- **Database**: None (stateless)
- **Authentication**: None
- **Payment**: None

### Current Limitations
| Limitation | Impact | Priority |
|------------|--------|----------|
| No database | Can't track users, usage, or video history | High |
| No job queue | Blocking requests, timeouts on long videos | High |
| Local file storage | Can't scale horizontally | High |
| No auth | Can't identify users or limit usage | High |
| 1GB memory limit | SIGKILL on complex videos | Medium |
| No payment system | Can't monetize | Medium |
| No monitoring | Blind to errors in production | Medium |

---

## Phase 1: Foundation (Week 1-2)
**Goal**: Enable user identification and basic persistence without breaking the bank

### 1.1 Add PostgreSQL Database
**Why**: You need to track users, videos, and usage before anything else.

**Cost-effective approach**: Use Railway's PostgreSQL addon ($5/month for starter)

```bash
# Add to package.json
npm install prisma @prisma/client
npx prisma init
```

**Schema** (`prisma/schema.prisma`):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  createdAt     DateTime  @default(now())
  videos        Video[]
  usage         Usage?
}

model Video {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  originalName  String
  fileKey       String    // S3 key or local path
  status        VideoStatus @default(PENDING)
  config        Json      // Processing options
  outputKey     String?   // Processed video location
  createdAt     DateTime  @default(now())
  processedAt   DateTime?
  error         String?
}

model Usage {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  videosProcessed Int      @default(0)
  minutesUsed     Float    @default(0)
  apiCostsUsd     Float    @default(0)
  periodStart     DateTime @default(now())
}

enum VideoStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### 1.2 Add Simple Authentication
**Why**: Identify users without building auth from scratch.

**Cost-effective approach**: Use Clerk ($0 for first 10k MAU) or NextAuth.js (free)

```bash
npm install @clerk/nextjs
# OR
npm install next-auth @auth/prisma-adapter
```

**Recommendation**: Start with **Clerk** - it's faster to implement and free tier is generous.

### 1.3 Add Basic Rate Limiting
**Why**: Prevent abuse before you have payment in place.

```bash
npm install @upstash/ratelimit @upstash/redis
```

**Implementation** (`src/middleware.ts`):
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 h"), // 5 videos per hour
});
```

**Cost**: Upstash Redis free tier = 10k commands/day (plenty for early stage)

### Phase 1 Monthly Cost: ~$5-10

---

## Phase 2: Background Processing (Week 3-4)
**Goal**: Stop blocking requests and handle longer videos reliably

### 2.1 Implement Job Queue
**Why**: Video processing can take minutes. HTTP requests shouldn't wait.

**Cost-effective approach**: Use **BullMQ** with **Upstash Redis** (or Railway Redis)

```bash
npm install bullmq ioredis
```

**Architecture Change**:
```
BEFORE:
POST /api/process → Process video → Return result (blocks for minutes)

AFTER:
POST /api/process → Add to queue → Return job ID immediately
Worker process → Process video → Update database
GET /api/status/:jobId → Check progress
WebSocket/Polling → Real-time updates to client
```

**Queue Implementation** (`src/lib/queue.ts`):
```typescript
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!);

export const videoQueue = new Queue('video-processing', { connection });

// Worker runs in separate process
export const videoWorker = new Worker('video-processing',
  async (job) => {
    const { videoId, config } = job.data;
    // Your existing processing logic here
    await processVideo(videoId, config);
  },
  {
    connection,
    concurrency: 1, // Process one at a time (memory constraint)
  }
);
```

### 2.2 Add Progress Tracking
**Why**: Users need feedback during long processing.

```typescript
// In worker
await job.updateProgress(25); // Silence removal complete
await job.updateProgress(50); // Transcription complete
await job.updateProgress(75); // Captions burned
await job.updateProgress(100); // Done
```

**Frontend Polling** (`src/hooks/useVideoStatus.ts`):
```typescript
export function useVideoStatus(videoId: string) {
  const [status, setStatus] = useState<VideoStatus>();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/status/${videoId}`);
      const data = await res.json();
      setStatus(data);
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [videoId]);

  return status;
}
```

### 2.3 Separate Worker Process
**Why**: Don't let video processing crash your web server.

**Railway Setup**: Add a second service for the worker

```json
// railway.json (updated)
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "numReplicas": 1,
    "startCommand": "node server.js",
    "healthcheckPath": "/",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Create `worker.js` for dedicated processing:
```javascript
// worker.js
require('./dist/lib/queue-worker');
console.log('Video processing worker started');
```

### Phase 2 Monthly Cost: ~$10-20 (Redis + extra service)

---

## Phase 3: Cloud Storage (Week 5-6)
**Goal**: Enable horizontal scaling and reliable file handling

### 3.1 Migrate to S3-Compatible Storage
**Why**: Local filesystem can't scale. S3 is cheap and reliable.

**Cost-effective options**:
1. **Cloudflare R2**: $0 egress, $0.015/GB storage (RECOMMENDED)
2. **Backblaze B2**: $0.005/GB storage, cheap egress
3. **AWS S3**: More expensive but most compatible

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Implementation** (`src/lib/storage.ts`):
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

export async function uploadToStorage(file: Buffer, key: string) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: file,
  }));
  return key;
}

export async function getDownloadUrl(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  }), { expiresIn: 3600 });
}
```

### 3.2 Update Processing Pipeline
**Changes needed**:
1. Download from S3 to temp directory before processing
2. Upload result to S3 after processing
3. Clean up temp files immediately
4. Generate presigned URLs for downloads

```typescript
// In video processing worker
async function processVideo(videoId: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });

  // Download to temp
  const tempInput = `/tmp/${videoId}_input.mp4`;
  await downloadFromStorage(video.fileKey, tempInput);

  // Process (your existing logic)
  const tempOutput = await runProcessingPipeline(tempInput, video.config);

  // Upload result
  const outputKey = `processed/${videoId}.mp4`;
  await uploadToStorage(tempOutput, outputKey);

  // Cleanup temp files
  await fs.unlink(tempInput);
  await fs.unlink(tempOutput);

  // Update database
  await prisma.video.update({
    where: { id: videoId },
    data: { outputKey, status: 'COMPLETED' },
  });
}
```

### 3.3 Implement Auto-Cleanup
**Why**: Don't pay to store videos forever.

```typescript
// Cron job or scheduled task
async function cleanupOldVideos() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

  const oldVideos = await prisma.video.findMany({
    where: { createdAt: { lt: cutoff } },
  });

  for (const video of oldVideos) {
    await deleteFromStorage(video.fileKey);
    if (video.outputKey) await deleteFromStorage(video.outputKey);
    await prisma.video.delete({ where: { id: video.id } });
  }
}
```

### Phase 3 Monthly Cost: ~$5-15 (depends on usage)
- Cloudflare R2: First 10GB free, then $0.015/GB
- Typical early SaaS: 50-100GB = $0.75-1.50/month

---

## Phase 4: Monetization (Week 7-8)
**Goal**: Start generating revenue with a simple pricing model

### 4.1 Define Pricing Tiers

| Tier | Price | Videos/Month | Features |
|------|-------|--------------|----------|
| Free | $0 | 3 videos | Basic processing, 720p max |
| Creator | $19/mo | 30 videos | All features, 1080p, priority |
| Pro | $49/mo | 100 videos | All features, 4K, API access |
| Team | $99/mo | 300 videos | Everything + team seats |

### 4.2 Integrate Stripe
**Why**: Industry standard, great DX, handles everything.

```bash
npm install stripe @stripe/stripe-js
```

**Backend** (`src/lib/stripe.ts`):
```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(userId: string, priceId: string) {
  return stripe.checkout.sessions.create({
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/dashboard?success=true`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    metadata: { userId },
  });
}
```

**Webhook Handler** (`src/app/api/webhooks/stripe/route.ts`):
```typescript
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(
    await req.text(),
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'checkout.session.completed':
      await activateSubscription(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await cancelSubscription(event.data.object);
      break;
  }

  return new Response('OK');
}
```

### 4.3 Implement Usage Limits

```typescript
// Middleware to check limits
async function checkUsageLimits(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { usage: true, subscription: true },
  });

  const limits = TIER_LIMITS[user.subscription?.tier || 'FREE'];

  if (user.usage.videosProcessed >= limits.videosPerMonth) {
    throw new Error('Monthly video limit reached. Please upgrade.');
  }
}
```

### Phase 4 Monthly Cost: ~$0 (Stripe takes 2.9% + $0.30 per transaction)

---

## Phase 5: Reliability & Monitoring (Week 9-10)
**Goal**: Know when things break before users tell you

### 5.1 Add Error Tracking
**Recommendation**: Sentry (free tier: 5k errors/month)

```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
```

### 5.2 Add Application Monitoring
**Recommendation**: Highlight.io (free tier generous) or Better Stack

Key metrics to track:
- Video processing success rate
- Average processing time by video length
- OpenAI API costs per user
- Queue depth and wait times
- Memory usage during FFmpeg operations

### 5.3 Add Health Checks

```typescript
// src/app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    storage: await checkStorage(),
    openai: await checkOpenAI(),
  };

  const healthy = Object.values(checks).every(Boolean);

  return Response.json(checks, {
    status: healthy ? 200 : 503
  });
}
```

### 5.4 Implement Alerting
Set up alerts for:
- Processing failure rate > 5%
- Queue depth > 50 videos
- Memory usage > 800MB
- API error rate spike
- Payment failures

### Phase 5 Monthly Cost: ~$0-20

---

## Phase 6: Performance Optimization (Week 11-12)
**Goal**: Handle more load without proportionally increasing costs

### 6.1 Optimize OpenAI Costs

**Problem**: Every B-roll generation costs $0.04/image (DALL-E 3)

**Solutions**:
1. **Cache common prompts**: Store generated images by prompt hash
2. **Use DALL-E 2 for non-premium**: $0.016/image (60% cheaper)
3. **Batch transcription**: Combine short clips
4. **Implement prompt caching**: OpenAI's prompt caching for system prompts

```typescript
// Image cache implementation
async function getOrGenerateBRollImage(prompt: string) {
  const hash = createHash('sha256').update(prompt).digest('hex');

  // Check cache
  const cached = await prisma.imageCache.findUnique({ where: { hash } });
  if (cached) return cached.imageUrl;

  // Generate new
  const imageUrl = await generateDallEImage(prompt);

  // Cache it
  await prisma.imageCache.create({
    data: { hash, prompt, imageUrl },
  });

  return imageUrl;
}
```

### 6.2 Optimize FFmpeg Processing

**Current State**: Already optimized for low memory (ultrafast, 1 thread)

**Additional Optimizations**:
1. **Pre-analyze videos**: Reject videos that will fail (too long, wrong codec)
2. **Use hardware encoding on larger instances**: When you scale up
3. **Implement chunked processing**: For videos > 10 minutes

```typescript
// Pre-validation
async function validateVideo(filePath: string) {
  const probe = await ffprobe(filePath);

  if (probe.duration > 600) { // 10 minutes
    throw new Error('Video too long. Max 10 minutes.');
  }

  if (probe.size > 500 * 1024 * 1024) { // 500MB
    throw new Error('File too large. Max 500MB.');
  }

  return probe;
}
```

### 6.3 Implement CDN for Delivery
**Why**: Faster downloads, cheaper bandwidth

**Recommendation**: Cloudflare (free plan works for most SaaS)

1. Put Cloudflare in front of your domain
2. Use their caching for static assets
3. Presigned S3 URLs still work through Cloudflare

### Phase 6 Monthly Cost: Savings! (-$50 to -$200 depending on usage)

---

## Phase 7: Scale Horizontally (Month 3+)
**Goal**: Handle 10x-100x growth

### 7.1 Multi-Worker Setup
When ready to scale beyond one worker:

```yaml
# docker-compose.production.yml
services:
  web:
    build: .
    command: node server.js
    deploy:
      replicas: 2

  worker:
    build: .
    command: node worker.js
    deploy:
      replicas: 3
    environment:
      - WORKER_CONCURRENCY=1
```

### 7.2 Database Scaling Path
1. **Now**: Railway PostgreSQL ($5-20/month)
2. **1k users**: Managed PostgreSQL (Supabase, Neon) - $25/month
3. **10k users**: Dedicated instance - $50-100/month
4. **100k users**: Read replicas, connection pooling

### 7.3 Consider Serverless Processing
For burst capacity without maintaining workers:

**Option**: Modal.com or AWS Lambda for video processing
- Pay per second of compute
- Auto-scales to zero
- More expensive per video but no idle costs

```python
# Modal example
@stub.function(gpu="T4", memory=4096)
def process_video(video_url: str, config: dict):
    # Download, process, upload
    pass
```

### 7.4 Geographic Distribution
When you have international users:
1. Deploy workers in multiple regions
2. Use Cloudflare R2's automatic distribution
3. Consider regional databases (if latency matters)

---

## Cost Projection Summary

| Phase | Monthly Cost | Cumulative | Users Supported |
|-------|-------------|------------|-----------------|
| Current | $7 (Railway) | $7 | ~50 |
| Phase 1 | $5-10 | $12-17 | ~100 |
| Phase 2 | $10-20 | $22-37 | ~250 |
| Phase 3 | $5-15 | $27-52 | ~500 |
| Phase 4 | $0* | $27-52 | ~500 |
| Phase 5 | $0-20 | $27-72 | ~500 |
| Phase 6 | -$50 savings | $27-52 | ~1000 |
| Phase 7 | $100-300 | $127-352 | ~5000+ |

*Stripe takes transaction fees, not monthly fees

---

## Implementation Priority Matrix

| Task | Impact | Effort | Do When |
|------|--------|--------|---------|
| Add PostgreSQL | High | Low | Now |
| Add Authentication | High | Low | Now |
| Job Queue | High | Medium | Week 2 |
| S3 Storage | High | Medium | Week 3 |
| Stripe Integration | High | Medium | Week 4 |
| Error Monitoring | Medium | Low | Week 5 |
| OpenAI Caching | Medium | Medium | Week 6 |
| CDN | Medium | Low | Week 6 |
| Multi-worker | Low* | Medium | When needed |

*Low priority until you have paying customers

---

## Quick Wins (Do This Week)

1. **Add Sentry** (2 hours)
   - Know when things break
   - Free tier is enough

2. **Add basic analytics** (1 hour)
   - Even console.log to a file
   - Track: videos processed, processing time, errors

3. **Add video validation** (2 hours)
   - Reject too-long videos upfront
   - Save processing costs on failures

4. **Set up Upstash Redis** (1 hour)
   - Prepare for rate limiting
   - Prepare for job queue

5. **Create pricing page** (2 hours)
   - Even before Stripe
   - Validate pricing with users

---

## Anti-Patterns to Avoid

### ❌ Don't Do This
1. **Kubernetes too early**: You don't need it until 10k+ users
2. **Microservices**: Keep it monolithic until it hurts
3. **Custom auth**: Use Clerk/Auth0/NextAuth
4. **Self-hosted databases**: Use managed services
5. **Premature optimization**: Ship features first
6. **Over-engineering job queue**: BullMQ is enough for years

### ✅ Do This Instead
1. **Monolithic first**: One repo, one deployment
2. **Managed services**: Let others handle infrastructure
3. **Simple pricing**: 3-4 tiers max
4. **Usage-based scaling**: Scale workers based on queue depth
5. **Feature flags**: Roll out gradually with something like LaunchDarkly (free tier)

---

## Monitoring Dashboard Checklist

Track these metrics from day one:

### Business Metrics
- [ ] Daily active users
- [ ] Videos processed per day
- [ ] Conversion rate (free → paid)
- [ ] Churn rate
- [ ] Revenue (MRR)

### Technical Metrics
- [ ] Processing success rate
- [ ] Average processing time
- [ ] Queue depth
- [ ] API error rate
- [ ] Memory usage
- [ ] OpenAI API costs

### User Experience
- [ ] Time to first video processed
- [ ] Upload success rate
- [ ] Download success rate
- [ ] Support ticket volume

---

## Final Thoughts

### The SaaS Founder Mindset

1. **Revenue before scale**: Get 10 paying customers before optimizing for 10,000
2. **Cost efficiency**: Every dollar saved is a dollar earned
3. **Ship fast**: A working product beats a perfect architecture
4. **Measure everything**: Can't improve what you can't measure
5. **Talk to users**: They'll tell you what to build next

### Your Immediate Next Steps

1. **This week**: Add Sentry + basic database
2. **Next week**: Add auth + rate limiting
3. **Week 3**: Add job queue
4. **Week 4**: Add Stripe
5. **Week 5**: Launch publicly and iterate

### When to Revisit This Plan

- [ ] First 10 paying customers
- [ ] $1k MRR
- [ ] Processing >100 videos/day
- [ ] First infrastructure incident
- [ ] $10k MRR

---

*Document created: January 2026*
*Next review: When hitting 100 paying customers*
