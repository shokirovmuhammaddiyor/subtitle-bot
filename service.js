import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'crypto';
import { db } from './database.js';

let aiClients = {};
const keyStates = {};
let lastKeysInput = '';

let logger = (type, message) => {
  console.warn(`[${type}] ${message}`);
};

export function setLogger(customLogger) {
  logger = customLogger;
}

export function resetAi() {
  aiClients = {};
  for (const k in keyStates) {
    delete keyStates[k];
  }
  lastKeysInput = '';
}

function getKeyState(key) {
  if (!keyStates[key]) {
    keyStates[key] = {
      blockedUntil: 0,
      invalid: false,
      lastUsed: 0,
      reservedUntil: 0,
      consecutiveFailures: 0
    };
  }
  return keyStates[key];
}

function getAvailableKey(keys) {
  const now = Date.now();
  const validKeys = keys.filter(k => !getKeyState(k).invalid);
  if (validKeys.length === 0) {
    throw new Error('All configured Gemini API keys are invalid.');
  }

  let bestKey = null;
  let minWaitTime = Infinity;

  for (const key of validKeys) {
    const state = getKeyState(key);
    
    // Key is available after its block cooldown, its reservation cooldown,
    // and its 3 seconds idle cooldown have all expired.
    const nextAvailableTime = Math.max(
      state.blockedUntil,
      state.reservedUntil,
      state.lastUsed + 3000
    );
    
    const waitTime = Math.max(0, nextAvailableTime - now);
    if (waitTime < minWaitTime) {
      minWaitTime = waitTime;
      bestKey = key;
    }
  }

  if (!bestKey) {
    throw new Error('No key could be selected.');
  }

  const state = getKeyState(bestKey);
  if (minWaitTime > 0) {
    // Reserve this slot so other concurrent workers don't grab it
    state.reservedUntil = now + minWaitTime;
  } else {
    // If it's ready immediately, mark it as used now and clear any reservations
    state.lastUsed = now;
    state.reservedUntil = 0;
  }

  return { key: bestKey, waitTimeMs: minWaitTime };
}

export function cleanupTranslationCache() {
  db.data.translationCache = db.data.translationCache || [];
  const hashes = [];
  for (const entry of db.data.translationCache) {
    if (!hashes.includes(entry.fileHash)) {
      hashes.push(entry.fileHash);
    }
  }
  if (hashes.length > 20) {
    const hashesToRemove = hashes.slice(0, hashes.length - 20);
    db.data.translationCache = db.data.translationCache.filter(
      entry => !hashesToRemove.includes(entry.fileHash)
    );
  }
}

export async function getRemainingTokenCount(content, ext, targetLanguage) {
  const parsed = parseSubtitles(content, ext);
  const dialogues = parsed.filter(l => l.isDialogue);
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');

  const cachedEntries = await db.getTranslationCache(fileHash, targetLanguage);

  const cacheMap = new Map();
  for (const entry of cachedEntries) {
    cacheMap.set(`${entry.lineIndex}_${entry.originalText}`, entry.translatedText);
  }

  let remaining = 0;
  for (let i = 0; i < dialogues.length; i++) {
    const d = dialogues[i];
    if (!cacheMap.has(`${i}_${d.cleanText}`)) {
      remaining++;
    }
  }

  return { total: dialogues.length, remaining, fileHash };
}

function getAi(key) {
  if (!aiClients[key]) {
    aiClients[key] = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClients[key];
}

export function parseSubtitles(content, ext) {
  const normExt = ext.toLowerCase();
  if (normExt === 'ass') {
    const lines = content.split(/\r?\n/);
    const parsed = [];
    let currentId = 1;
    for (const line of lines) {
      if (line.startsWith('Dialogue:') || line.startsWith('Comment:')) {
        const colonIndex = line.indexOf(':');
        const type = line.substring(0, colonIndex + 1);
        const rest = line.substring(colonIndex + 1);
        const parts = rest.split(',');
        const meta = parts.slice(0, 9).join(',');
        const text = parts.slice(9).join(',');
        const tags = [];
        const cleanText = text.replace(/<[^>]+>|\{[^\}]+\}/g, (match) => {
          tags.push(match);
          return '';
        });
        parsed.push({
          isDialogue: true,
          id: currentId++,
          type,
          meta,
          tags,
          cleanText,
          translatedText: ''
        });
      } else {
        parsed.push({
          isDialogue: false,
          text: line
        });
      }
    }
    return parsed;
  } else {
    const blocks = content.split(/\r?\n\r?\n/);
    const parsed = [];
    let currentId = 1;
    for (const block of blocks) {
      const fileLines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (fileLines.length === 0 || fileLines[0] === 'WEBVTT' || fileLines[0].startsWith('NOTE')) continue;
      let timelineIndex = -1;
      for (let i = 0; i < fileLines.length; i++) {
        if (fileLines[i].includes('-->')) {
          timelineIndex = i;
          break;
        }
      }
      if (timelineIndex !== -1) {
        const originalId = timelineIndex > 0 ? fileLines[timelineIndex - 1] : String(currentId);
        const timeline = fileLines[timelineIndex];
        const text = fileLines.slice(timelineIndex + 1).join('\n');
        const tags = [];
        const cleanText = text.replace(/<[^>]+>|\{[^\}]+\}/g, (match) => {
          tags.push(match);
          return '';
        });
        parsed.push({
          isDialogue: true,
          id: currentId++,
          originalId,
          timeline,
          tags,
          cleanText,
          translatedText: ''
        });
      }
    }
    return parsed;
  }
}

export function rebuildSubtitles(parsed, ext) {
  const normExt = ext.toLowerCase();
  if (normExt === 'ass') {
    const out = [];
    for (const line of parsed) {
      if (line.isDialogue) {
        const text = line.tags.join('') + (line.translatedText || line.cleanText);
        out.push(`${line.type}${line.meta},${text}`);
      } else {
        out.push(line.text);
      }
    }
    return out.join('\n');
  } else {
    let out = normExt === 'vtt' ? 'WEBVTT\n\n' : '';
    for (const line of parsed) {
      if (line.isDialogue) {
        out += `${line.originalId || line.id}\n`;
        out += `${line.timeline}\n`;
        out += `${line.tags.join('')}${line.translatedText || line.cleanText}\n\n`;
      }
    }
    return out;
  }
}

export async function translateSubtitles({
  content,
  ext,
  targetLanguage,
  qualityPrompt,
  systemPrompt,
  batchSize = 45,
  chatHistory = [],
  projectTitle = '',
  episodeNumber = '',
  onProgress = () => {}
}) {
  const parsed = parseSubtitles(content, ext);
  const dialogues = parsed.filter(l => l.isDialogue);
  const total = dialogues.length;
  if (total === 0) return rebuildSubtitles(parsed, ext);

  const fileHash = crypto.createHash('sha256').update(content).digest('hex');

  // Load from translationCache
  const cachedEntries = await db.getTranslationCache(fileHash, targetLanguage);

  const cacheMap = new Map();
  for (const entry of cachedEntries) {
    cacheMap.set(`${entry.lineIndex}_${entry.originalText}`, entry.translatedText);
  }

  // Populate already cached lines, and collect untranslated ones
  const untranslatedDialogues = [];
  for (let i = 0; i < dialogues.length; i++) {
    const d = dialogues[i];
    const cachedVal = cacheMap.get(`${i}_${d.cleanText}`);
    if (cachedVal) {
      d.translatedText = cachedVal;
    } else {
      untranslatedDialogues.push({ d, originalIndex: i });
    }
  }

  logger('INFO', `Translation session start: File hash ${fileHash}. Total lines: ${total}, Untranslated: ${untranslatedDialogues.length}.`);

  if (untranslatedDialogues.length === 0) {
    logger('SUCCESS', `All lines loaded from cache. Rebuilding subtitles instantly...`);
    return rebuildSubtitles(parsed, ext);
  }

  const chunks = [];
  for (let i = 0; i < untranslatedDialogues.length; i += batchSize) {
    chunks.push(untranslatedDialogues.slice(i, i + batchSize));
  }

  const keysInput = process.env.GEMINI_API_KEY || '';
  const keys = keysInput.split(/[,\s;\n]+/).map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // Clear/reset key states if the keys input changes
  if (keysInput !== lastKeysInput) {
    for (const k in keyStates) {
      delete keyStates[k];
    }
    lastKeysInput = keysInput;
  }

  const startTime = Date.now();
  // We initialize translatedCount to include the already cached lines!
  let translatedCount = total - untranslatedDialogues.length;

  const maxConcurrency = Math.min(keys.length, 4) || 1;
  const chunkQueue = chunks.map((chunk, index) => ({ chunk, index }));
  let nextQueueIndex = 0;

  async function translationWorker() {
    while (nextQueueIndex < chunkQueue.length) {
      const { chunk, index: c } = chunkQueue[nextQueueIndex++];
      const payload = chunk.map(item => ({ id: item.d.id, text: item.d.cleanText }));
      
      // Part 1: Customizable Translation Tone & Persona Instructions (editable from panel/settings)
      let interpolatedPrompt = systemPrompt || `Sen professional subtitr tarjimoni va o'zbek tiliga mahalliylashtirish mutaxassisisan. Vazifang berilgan matnlarni yuqori sifatli, tabiiy va dublyajbop o'zbek tiliga to'liq tarjima qilish.

Hozirgi loyiha nomi: {movie_name}
Qism raqami: {episode_number}-qism

Quyidagi qoidalarga qat'iy va to'liq amal qil:
1. To'liqlik (Chala qolmasligi shart):
- Berilgan har bir qator va butun dialog oxirigacha, chala qoldirilmasdan to'liq o'zbek tiliga tarjima qilinishi shart.

2. "Sen" va "Siz" munosabatlari (Juda Muhim):
- Do'stlar, tengdoshlar, oila a'zolari va yosh bolalar o'rtasidagi suhbatlarda jonli va tabiiy o'zbek tilini ta'minlash uchun iloji boricha ko'proq "SEN" shaklidan foydalan.
- Faqatgina kattalarga, ota-onaga, notanish shaxslarga va boshliqlarga murojaatda "SIZ" shaklini qo'lla. Suhbat davomida ushbu uslub izchilligini saqlab qol.

3. Dublyajbop va Tabiiy oqim:
- So'zma-so'z, kitobiy yoki rasmiy tarjimadan qoch. Dialoglarni xuddi o'zbek tilida gaplashilgandek jonli, eshitilishga qulay va dublyajga mos qilib tarjima qil. Qator uzunligi asl holatga yaqin bo'lsin.

4. His-tuyg'ular va Jargonlar:
- Sahnadagi hissiyotlarni (kesatiq, hazil, hayajon, g'azab) mos o'zbekcha iboralar, maqollar va jargonlar yordamida sifatli va aniq yetkazib ber.`;
      const movieVal = projectTitle || "Noma'lum kino/serial";
      const episodeVal = episodeNumber || "1";

      interpolatedPrompt = interpolatedPrompt
        .replace(/{movie_name}/gi, movieVal)
        .replace(/{project_title}/gi, movieVal)
        .replace(/{kino_nomi}/gi, movieVal)
        .replace(/{title}/gi, movieVal)
        .replace(/{episode_number}/gi, episodeVal)
        .replace(/{qism_raqami}/gi, episodeVal)
        .replace(/{episode}/gi, episodeVal);

      // Add metadata context if not explicitly substituted in the prompt
      let contextMeta = "";
      if (!interpolatedPrompt.includes(movieVal)) {
        contextMeta += `Kino/Serial nomi: ${movieVal}. `;
      }
      if (!interpolatedPrompt.includes(episodeVal)) {
        contextMeta += `Qism: ${episodeVal}-qism. `;
      }

      const customizableToneInstruction = `
[TRANSLATION STYLE & ROLE]
${interpolatedPrompt}

[SPECIFIC TONE & QUALITY CONSTRAINTS]
${qualityPrompt || 'Translate naturally and contextually.'}
`;

      // Part 2: Immutable Technical and Formatting Instruction (not editable, strict formatting rules)
      const immutableTechnicalInstruction = `
[TECHNICAL FORMATTING INSTRUCTIONS - STRICTLY MANDATORY]
You act as an automated subtitle translation pipeline. You will receive a JSON array of subtitle lines to translate.
Your task is to translate the "text" field of each item into "${targetLanguage}".

Strict rules you MUST follow:
1. Output format: You MUST return ONLY a raw JSON array.
2. Do NOT wrap the JSON in markdown code fences (e.g. do NOT write \`\`\`json ... \`\`\`). Do NOT output any markdown backticks.
3. No conversational text: Do NOT write any greetings, chat explanations, prefaces, notes, or post-processing commentary. The response must contain nothing but the JSON array.
4. Input-to-Output mapping: For every item in the input array, you MUST output a corresponding item. The number of elements in the output JSON array MUST exactly equal the number of elements in the input JSON array.
5. Preserving IDs: You MUST preserve the exact "id" of each item.
6. JSON Schema: The output must strictly conform to this JSON schema:
   [
     {
       "id": <number>,
       "translated_text": "<translated string>"
     }
   ]
7. Validity: Ensure the output is syntactically valid JSON. Properly escape double quotes, backslashes, and newlines in the translated text.
`;

      const combinedSystemInstruction = 
        customizableToneInstruction.trim() + 
        (contextMeta ? `\n\n[CONTEXT]\n${contextMeta.trim()}` : "") +
        `\n\n` + 
        immutableTechnicalInstruction.trim();
        
      const userPrompt = `Input Subtitle Lines to Translate:\n${JSON.stringify(payload)}`;

      let chunkSuccess = false;
      let chunkAttempts = 0;
      const maxChunkAttempts = 20;
      let lastError = null;

      while (!chunkSuccess && chunkAttempts < maxChunkAttempts) {
        let keyInfo;
        try {
          keyInfo = getAvailableKey(keys);
        } catch (err) {
          logger('ERROR', `API Key Selection Failed: ${err.message}`);
          throw new Error(`TRANSLATION_FAILED: Barcha kiritilgan API kalitlar yaroqsiz! Tafsilot: ${err.message}`);
        }

        const { key: currentKey, waitTimeMs } = keyInfo;

        if (waitTimeMs > 0) {
          logger('INFO', `[KEY ROTATION] All keys blocked. Waiting ${Math.ceil(waitTimeMs / 1000)}s for the next key to unblock...`);
          // Notify progress about the wait
          await onProgress({
            total,
            translated: translatedCount,
            eta: `Limit kutilmoqda (${Math.ceil(waitTimeMs / 1000)}s)...`,
            progressBar: `[${'█'.repeat(Math.round(10 * (translatedCount / total)))}${'░'.repeat(10 - Math.round(10 * (translatedCount / total)))}]`
          });
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
          continue;
        }

        chunkAttempts++;
        const ai = getAi(currentKey);

        try {
          const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
            contents: userPrompt,
            config: {
              systemInstruction: combinedSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    translated_text: { type: Type.STRING }
                  },
                  required: ['id', 'translated_text']
                }
              }
            }
          });

          const resText = response.text;
          const results = JSON.parse(resText);

          const newCacheEntries = [];
          for (const item of results) {
            const chunkItem = chunk.find(cItem => cItem.d.id === item.id);
            if (chunkItem) {
              chunkItem.d.translatedText = item.translated_text;

              // Prepare cache entry
              newCacheEntries.push({
                fileHash,
                lineIndex: chunkItem.originalIndex,
                originalText: chunkItem.d.cleanText,
                translatedText: item.translated_text,
                targetLanguage
              });
            }
          }

          // Insert directly to MongoDB (bulk upsert, async background save)
          db.insertTranslationCacheEntries(newCacheEntries).catch(err => {
            logger('ERROR', `Failed to insert cache entries: ${err.message}`);
          });

          chunkSuccess = true;

          // Reset consecutive failures on success
          const state = getKeyState(currentKey);
          state.consecutiveFailures = 0;
        } catch (err) {
          lastError = err;
          const errMsg = err.message || '';
          logger('WARNING', `[GEMINI API WARNING] Key failure (attempt ${chunkAttempts}): ${errMsg.substring(0, 150)}`);

          // Check error type
          const is429 = errMsg.includes('429') || 
                        errMsg.includes('RESOURCE_EXHAUSTED') || 
                        errMsg.includes('quota') || 
                        errMsg.includes('limit exceeded') || 
                        errMsg.includes('exhausted');

          const isInvalid = errMsg.includes('API_KEY_INVALID') || 
                            errMsg.includes('API key not valid') || 
                            errMsg.includes('invalid API key') || 
                            errMsg.includes('key not found') ||
                            errMsg.includes('401') ||
                            errMsg.includes('UNAUTHENTICATED') ||
                            errMsg.includes('ACCOUNT_STATE_INVALID') ||
                            errMsg.includes('deleted or disabled') ||
                            errMsg.includes('service account') ||
                            (errMsg.includes('API key') && (errMsg.includes('invalid') || errMsg.includes('expired')));

          const state = getKeyState(currentKey);

          if (isInvalid) {
            state.invalid = true;
            logger('WARNING', `[KEY ROTATION] Key marked as INVALID.`);
          } else if (is429) {
            let cooldownMs = 15000; // 15s cooldown
            const retryMatch = errMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/) || errMsg.match(/retry in (\d+(?:\.\d+)?)s/i);
            if (retryMatch) {
              const retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
              cooldownMs = Math.min(retrySeconds * 1000 + 1000, 60000);
            }
            state.blockedUntil = Date.now() + cooldownMs;
            logger('WARNING', `[KEY ROTATION] Key marked as BLOCKED for ${Math.ceil(cooldownMs / 1000)}s.`);
          } else {
            state.blockedUntil = Date.now() + 5000;
            logger('WARNING', `[KEY ROTATION] Key temporary failure. Cooldown: 5s.`);
          }

          // Notify progress about switching key
          await onProgress({
            total,
            translated: translatedCount,
            eta: `Kalit almashtirilmoqda...`,
            progressBar: `[${'█'.repeat(Math.round(10 * (translatedCount / total)))}${'░'.repeat(10 - Math.round(10 * (translatedCount / total)))}]`
          });
        }
      }

      if (!chunkSuccess) {
        logger('ERROR', `Translation failed for chunk after ${chunkAttempts} attempts. Last error: ${lastError ? lastError.message || lastError : 'Unknown'}`);
        throw new Error(`Tarjima xatoligi: ${lastError ? lastError.message || lastError : 'Unknown'}`);
      }

      // Update progress
      translatedCount += chunk.length;
      const progress = translatedCount / total;
      const elapsed = Date.now() - startTime;
      const actualTranslatedCount = translatedCount - (total - untranslatedDialogues.length);
      const rate = actualTranslatedCount > 0 ? elapsed / actualTranslatedCount : 0;
      const remainingTime = (total - translatedCount) * rate;
      const etaSec = Math.round(remainingTime / 1000);
      const etaStr = etaSec > 0 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : '0s';

      const barLength = 10;
      const filled = Math.round(barLength * progress);
      const empty = barLength - filled;
      const progressBar = `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(progress * 100)}%`;

      await onProgress({
        total,
        translated: translatedCount,
        eta: etaStr,
        progressBar
      });

      if (maxConcurrency === 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  }

  // Start concurrent worker promises
  const workers = [];
  for (let i = 0; i < maxConcurrency; i++) {
    workers.push(translationWorker());
  }

  // Wait for all workers to finish
  await Promise.all(workers);

  logger('SUCCESS', `Translation completed successfully for file hash: ${fileHash}`);
  return rebuildSubtitles(parsed, ext);
}
