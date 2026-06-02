import { GoogleGenAI, Type } from '@google/genai';

let aiClients = {};

export function resetAi() {
  aiClients = {};
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

  const chunks = [];
  for (let i = 0; i < dialogues.length; i += batchSize) {
    chunks.push(dialogues.slice(i, i + batchSize));
  }

  const keysInput = process.env.GEMINI_API_KEY || '';
  const keys = keysInput.split(/[,\s;\n]+/).map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const startTime = Date.now();
  let translatedCount = 0;
  let activeKeyIndex = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const payload = chunk.map(l => ({ id: l.id, text: l.cleanText }));
    
    // Interpolate dynamic placeholders like {movie_name}, {project_title}, {kino_nomi}, {episode_number}, {qism_raqami}
    let interpolatedPrompt = systemPrompt || "Do'stona va erkin uslubda tarjima qil. Ma'noni to'liq yetkaz va o'zbekcha jargonlarni o'rnida ishlat.";
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

    const combinedSystemInstruction = interpolatedPrompt + 
      (contextMeta ? `\nUshbu matn haqida ma'lumot: ${contextMeta}` : "") +
      "\n\nReturn ONLY a valid JSON array format, completely adhering to the schema rules: [{\"id\": 1, \"translated_text\": \"translated text here\"}]. No markdown wrapping blocks, no chat explanations, and no trailing characters.";
      
    const userPrompt = `Context/Tone constraints: ${qualityPrompt || 'Translate naturally.'}\n\nTask: Translate the following subtitle lines to ${targetLanguage}. Keep structural meaning and emotion. Return matching count & IDs.\n\nJSON array:\n${JSON.stringify(payload)}`;

    let attempts = 0;
    while (attempts < 12) {
      const currentKey = keys[activeKeyIndex];
      const ai = getAi(currentKey);
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
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
        for (const item of results) {
          const matched = dialogues.find(d => d.id === item.id);
          if (matched) {
            matched.translatedText = item.translated_text;
          }
        }
        break;
      } catch (err) {
        attempts++;
        const errMsg = err.message || '';
        console.warn(`[GEMINI API WARNING] Active key index #${activeKeyIndex} failed: ${errMsg}`);
        
        let backoff = 5000; // default exactly 5 seconds wait for any potential rate-limiting as requested by the user
        
        if (keys.length > 1) {
          activeKeyIndex = (activeKeyIndex + 1) % keys.length;
          console.warn(`[FAILOVER ACTIVATED] Switched to alternative key index #${activeKeyIndex}`);
          
          await onProgress({
            total,
            translated: translatedCount,
            eta: `API xatosi. Zaxira kalitga o'tilmoqda (#${activeKeyIndex + 1}). Muvaffaqiyatsiz urinish: ${attempts}...`,
            progressBar: `[${'█'.repeat(Math.round(10 * (translatedCount / total)))}${'░'.repeat(10 - Math.round(10 * (translatedCount / total)))}]`
          });
          
          // If we have alternative keys, try switching immediately
          if (attempts < keys.length) {
            continue;
          }
        }

        if (attempts >= 12) {
          throw new Error(`Gemini API limit/UNAVAILABLE: Barcha muqobil kalitlar va urinishlar yakunlandi. Oxirgi xato: ${err.message}`);
        }
        
        console.warn(`Retrying in ${backoff}ms...`);
        
        await onProgress({
          total,
          translated: translatedCount,
          eta: `API cheklovi. ${Math.round(backoff / 1000)}s kutilmoqda (Urinish ${attempts}/12)...`,
          progressBar: `[${'█'.repeat(Math.round(10 * (translatedCount / total)))}${'░'.repeat(10 - Math.round(10 * (translatedCount / total)))}]`
        });
        
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    translatedCount += chunk.length;
    const progress = translatedCount / total;
    const elapsed = Date.now() - startTime;
    const rate = elapsed / translatedCount;
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

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return rebuildSubtitles(parsed, ext);
}
