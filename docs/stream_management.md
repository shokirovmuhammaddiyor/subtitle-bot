# Memory Management: Buffer-Free Streaming for Large Files (up to 2GB)

When running on environments with strict RAM limits (like Render's 512MB Free Tier), processing files like movies or anime MKV files (up to 2GB) using in-memory `Buffer`s will lead to `OutOfMemory` crashes. 

This guide explains how to convert buffer-heavy code into stream-based execution using Node.js Stream APIs, GramJS, and FFmpeg.

---

## 1. Stream-Based File Upload with Telegraf

Currently, files are often read completely into memory before being sent to Telegram:
```javascript
// ❌ RAM INTENSIVE: Loads whole file into RAM Buffer
const buf = Buffer.from(response, 'utf-8');
await ctx.telegram.sendDocument(ctx.chat.id, {
  source: buf,
  filename: `translated_${session.fileName}`
});
```

### Stream Alternative
Telegraf natively supports Node.js readable streams. Create a read stream directly from the filesystem or a stream of data. The file is uploaded chunk-by-chunk (typically in 64KB increments), keeping RAM usage below 1MB.

```javascript
import fs from 'fs';
import path from 'path';

// Helper to stream file directly to user/channel
async function sendFileAsStream(ctx, filePath, filename, caption) {
  const fileStream = fs.createReadStream(filePath);
  
  await ctx.telegram.sendDocument(ctx.chat.id, {
    source: fileStream,
    filename: filename
  }, {
    caption: caption
  });
}
```

---

## 2. GramJS Stream Upload for Large Files (Up to 2GB)

GramJS's `client.sendFile` reads the entire file into a buffer internally if a simple file path is provided in certain environments, causing heap exhaustion. To prevent this, we implement a custom **chunked file reader** that reads files in small chunks (e.g., 512KB) on demand.

### Implementation Blueprint

```javascript
import fs from 'fs';
import { Api } from 'telegram';

/**
 * Custom GramJS Upload Helper utilizing a small, fixed-size Buffer.
 * Reads the file chunk by chunk, uploading each chunk sequentially to Telegram.
 * RAM usage remains constant (~512KB) regardless of file size (up to 2GB).
 */
async function uploadLargeFileGramJS(client, peer, filePath, filename, caption) {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  
  // 512KB chunk size (Telegram standard chunk size)
  const chunkSize = 512 * 1024;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  
  const fileId = Math.floor(Math.random() * 10000000);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(chunkSize);
  
  try {
    for (let i = 0; i < totalChunks; i++) {
      const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, i * chunkSize);
      const chunkData = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer;
      
      // Upload part to Telegram
      await client.invoke(
        new Api.upload.SaveBigFilePart({
          fileId: BigInt(fileId),
          filePart: i,
          fileTotalParts: totalChunks,
          bytes: chunkData
        })
      );
      
      console.log(`[GramJS Upload] Progress: ${Math.round(((i + 1) / totalChunks) * 100)}%`);
    }
    
    // Complete the file upload and send message
    await client.invoke(
      new Api.messages.SendMedia({
        peer: peer,
        media: new Api.InputMediaUploadedDocument({
          file: new Api.InputFileBig({
            id: BigInt(fileId),
            parts: totalChunks,
            name: filename
          }),
          mimeType: 'video/x-matroska', // Or appropriate mime type
          attributes: [
            new Api.DocumentAttributeFilename({
              fileName: filename
            })
          ]
        }),
        message: caption
      })
    );
    
    console.log(`[GramJS Upload] Successfully sent media via streams.`);
  } finally {
    fs.closeSync(fd);
  }
}
```

---

## 3. Streaming FFmpeg Subtitle Extraction

When extracting subtitles from huge MKV files using FFmpeg, running `execPromise` captures the process's standard output/error entirely in memory, which blocks the thread and takes up RAM. Instead, pipe the command's outputs directly to the filesystem or a parsing stream.

### Implementation Blueprint

```javascript
import { spawn } from 'child_process';
import fs from 'fs';

/**
 * Extract subtitle stream from MKV file directly into a file writer stream.
 * Prevents memory buffering of the standard output or error.
 */
function extractSubtitleAsStream(mkvPath, outputPath) {
  return new Promise((resolve, reject) => {
    // -i input -map 0:s:0 -f ass pipe:1 -> pipes output directly to stdout
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', mkvPath,
      '-map', '0:s:0',
      '-f', 'ass',
      'pipe:1'
    ]);

    const writeStream = fs.createWriteStream(outputPath);
    ffmpeg.stdout.pipe(writeStream);

    // Track execution errors
    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });

    writeStream.on('error', (err) => {
      reject(new Error(`Write stream error: ${err.message}`));
    });

    ffmpeg.stderr.on('data', (data) => {
      // Log process status, don't accumulate in memory
      const logLine = data.toString().trim();
      if (logLine.startsWith('frame=')) {
        console.log(`[FFmpeg Progress] ${logLine}`);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}
```

---

## Summary of Benefits

1. **Deterministic RAM Footprint**: Maximum RAM remains fixed around ~2MB (a few buffers for stream chunking) instead of scaling linearly with file size (2GB file = 2GB RAM Buffer = Crash).
2. **Backpressure Handling**: If Telegram is slow to read incoming upload parts, Node streams automatically pause reading from disk, preventing memory accumulation.
3. **No Garbage Collection Spikes**: Reusing a single pre-allocated Buffer for GramJS chunk reading avoids creating millions of short-lived buffer objects, keeping garbage collection (GC) pauses virtually zero.
