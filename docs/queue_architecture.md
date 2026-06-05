# Queue Architecture Blueprint: Migrating to BullMQ & Redis

Currently, your translation job limits and anime downloads are managed using an in-memory array (`activeJobs`) and a recursive worker loop. 

### Limitations of the In-Memory Approach:
1. **Volatile State**: If Render restarts the application (common on the free tier or during deployments), all queued/active jobs are lost.
2. **Event Loop Blocking**: Downloader operations, file system scans, and heavy CPU parsing block the main thread.
3. **No Retries or Delay Hooks**: Handling API rate limits or network issues requires manual retry loops.

### The Solution: BullMQ & Redis
By migrating to **BullMQ** (a Redis-backed queue library), your jobs are persisted in Redis, supporting seamless restarts, robust concurrency management, rate limiting, and distributed worker execution.

---

## 1. Directory Structure Setup

To implement a clean queue system, separate the queue configuration, job workers, and main bot logic:

```text
├── src/
│   ├── queues/
│   │   ├── connection.js       # Redis connection config
│   │   └── translationQueue.js # BullMQ Queue initialization
│   └── workers/
│       └── translationWorker.js# Worker that processes tasks
├── bot.js                      # Telegram Bot (adds tasks to queue)
```

---

## 2. Component Implementation Blueprints

### A. Redis Connection Config (`src/queues/connection.js`)
Install BullMQ: `npm install bullmq ioredis`

```javascript
import IORedis from 'ioredis';

// Fetch Redis URL from environment variables
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

console.log('[Redis] Connection established for Queueing System');
```

---

### B. Defining the Queue (`src/queues/translationQueue.js`)

```javascript
import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

// Define the queue name
export const translationQueue = new Queue('translation-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,                 // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000,               // Start with 5 seconds backoff
    },
    removeOnComplete: true,      // Keep Redis storage clean
    removeOnFail: false,         // Keep failed logs for debugging
  }
});

/**
 * Enqueue a new translation job
 */
export async function addTranslationJob(userId, sessionData, teamId) {
  const jobId = `job_${userId}_${Date.now()}`;
  
  await translationQueue.add(
    'translate', 
    {
      userId,
      sessionData,
      teamId
    },
    { 
      jobId,
      // You can assign priority based on user levels or team balances
      priority: sessionData.isPriority ? 1 : 10 
    }
  );
  
  console.log(`[Queue] Added job ${jobId} for User: ${userId}`);
  return jobId;
}
```

---

### C. The Queue Worker (`src/workers/translationWorker.js`)
The Worker runs in a loop, fetches jobs from Redis, processes them, and posts updates. This worker can run on the same server or be scaled horizontally to run on completely separate servers.

```javascript
import { Worker } from 'bullmq';
import { redisConnection } from '../queues/connection.js';
import { translateSubtitles } from '../../service.js';
import { db } from '../../database.js';

// Active bot instance holder (populated from bot.js)
let botInstance = null;

export function initWorker(bot) {
  botInstance = bot;
  
  const worker = new Worker('translation-jobs', async (job) => {
    const { userId, sessionData, teamId } = job.data;
    console.log(`[Worker] Starting job ${job.id} for user ${userId}`);
    
    // 1. Send initial progress notification to user via Telegram
    let progressMsg;
    try {
      progressMsg = await botInstance.telegram.sendMessage(
        userId, 
        `⏳ Navbat keldi! Tarjima jarayoni boshlandi...`
      );
    } catch (e) {
      console.error(`Failed to send message to user ${userId}`, e);
    }

    // 2. Perform translation
    const response = await translateSubtitles({
      content: sessionData.fileContent,
      ext: sessionData.fileExt,
      targetLanguage: sessionData.targetLanguage,
      qualityPrompt: sessionData.qualityPrompt,
      systemPrompt: sessionData.systemPrompt,
      batchSize: sessionData.batchSize,
      projectTitle: sessionData.projectTitle,
      episodeNumber: sessionData.episodeNumber,
      
      // Update job progress in Redis
      onProgress: async ({ total, translated, eta, progressBar }) => {
        const percent = Math.round((translated / total) * 100);
        await job.updateProgress(percent);
        
        // Optionally throttle messages to avoid hitting Telegram Rate Limits (max 1 edit per 2-3 seconds)
        try {
          if (progressMsg && percent % 10 === 0) {
            await botInstance.telegram.editMessageText(
              userId, 
              progressMsg.message_id, 
              null,
              `🎬 *${sessionData.projectTitle}*\n` +
              `Jarayon: ${translated}/${total} (${percent}%)\n` +
              `Progress: ${progressBar}\n` +
              `Qolgan vaqt: ${eta}`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (e) {
          // Ignore Telegram Message Not Modified warnings
        }
      }
    });

    // 3. Compile output and send the final document to Telegram
    const outputBuffer = Buffer.from(response, 'utf-8');
    await botInstance.telegram.sendDocument(userId, {
      source: outputBuffer,
      filename: `translated_${sessionData.fileName}`
    }, {
      caption: `✅ Tarjima muvaffaqiyatli yakunlandi!\n\nLoyiha: ${sessionData.projectTitle}`
    });
    
    // Delete progress message
    if (progressMsg) {
      await botInstance.telegram.deleteMessage(userId, progressMsg.message_id).catch(() => {});
    }
    
    return { success: true, fileLength: response.length };
    
  }, {
    connection: redisConnection,
    concurrency: 2, // Process up to 2 jobs concurrently per worker instance
  });

  // Global Event Listeners for telemetry
  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully!`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[Worker] Job ${job.id} failed with error: ${err.message}`);
    
    if (job) {
      const { userId, teamId } = job.data;
      // Refund tokens if job fails completely
      try {
        const team = await db.getTeam(teamId);
        if (team && job.data.requiredTokens) {
          team.tokens += job.data.requiredTokens;
          await db.save();
          await botInstance.telegram.sendMessage(
            userId, 
            `❌ Tizimda xatolik yuz berdi. Sarflangan tokenlar qaytarildi.\nXato: ${err.message}`
          );
        }
      } catch (refundErr) {
        console.error('Failed to refund tokens:', refundErr);
      }
    }
  });
}
```

---

## 3. Integration with Telegram Bot (`bot.js`)

In the event handler where a user requests translation (in `runTranslation`):

```javascript
// ❌ OLD METHOD: Blocks thread with async-await in-memory wait loop
// const response = await translateSubtitles({...});

// ✅ NEW METHOD: Add to persistent queue and exit immediately
import { addTranslationJob } from './src/queues/translationQueue.js';

async function runTranslation(ctx, user) {
  // ... verification logic ...
  
  // Calculate tokens, check balance, etc.
  const requiredTokens = totalDialoguesCount; 

  const sessionData = {
    fileContent: session.fileContent,
    fileExt: session.fileExt,
    targetLanguage: session.targetLanguage,
    qualityPrompt: user.settings.qualityPrompt,
    systemPrompt: systemPrompt,
    batchSize: user.settings.batchSize,
    projectTitle: session.projectTitle,
    episodeNumber: session.isMultiEpisode ? session.episodeNumber : '1',
    fileName: session.fileName,
    requiredTokens
  };

  // Enqueue job to Redis
  const jobId = await addTranslationJob(ctx.from.id, sessionData, team.id);
  
  await ctx.reply(`📥 Ish navbatga muvaffaqiyatli qo'shildi! ID: \`${jobId}\`\nSizga navbatingiz kelganda va ish yakunlanganda xabar beramiz.`, {
    parse_mode: 'Markdown'
  });
  
  // Update user state to IDLE immediately, since worker will process it in background
  await db.updateUser(ctx.from.id, { state: 'IDLE', currentSession: null });
}
```

And on bot startup, initialize the worker:

```javascript
import { initWorker } from './src/workers/translationWorker.js';

// After initializing activeBotInstance
initWorker(activeBotInstance);
```

---

## Summary of Benefits
1. **Persistent Queues**: If your app crashes/restarts, the worker recovers the exact job state from Redis and resumes it.
2. **Reliable Concurrency Controls**: Simply configure `concurrency: N` in worker options to precisely throttle how many API operations run in parallel.
3. **High Bot Responsiveness**: The Telegram bot process only needs to enqueue jobs (takes `< 5ms`) and remains 100% available to answer user commands instantly.
