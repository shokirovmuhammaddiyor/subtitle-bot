import fs from 'fs';

let code = fs.readFileSync('bot.js', 'utf8');

// Insert import at the top
code = code.replace(/import express from 'express';/, "import express from 'express';\nimport { sendCode, verifyCode, verify2fa } from './telegram_auth.js';");

const newSendCode = `app.post('/api/admin/telegram-client/send-code', async (req, res) => {
  try {
    const { phone, apiId, apiHash } = req.body;
    if (!phone || !apiId || !apiHash) {
      return res.status(400).json({ error: "Telegram Telefon raqami, API ID va API Hash kiritilishi shart" });
    }
    
    const s = await db.getSettings();
    await sendCode(phone.trim(), apiId.trim(), apiHash.trim());

    s.telegram_account = {
      phone: phone.trim(),
      status: 'AWAITING_CODE',
      apiId: apiId.trim(),
      apiHash: apiHash.trim(),
      session: null,
      createdAt: Date.now()
    };
    await db.save();

    logEvent('INFO', PTelegram GramJS tasdiqlash kodi so\'raldi: ${phone}`);
    return res.json({ success: true, status: 'AWAITING_CODE' });
  } catch (err) {
    console.error("Send code error:", err);
    res.status(500).json({ error: err.message });
  }
});`;

const newVerifyCode = `app.post('/api/admin/telegram-client/verify-code', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Tasdiqlash kodi talab qilinadi" });
    
    const s = await db.getSettings();
    if (!s.telegram_account || s.telegram_account.status !== 'AWAITING_CODE') {
      return res.status(400).json({ error: "Ulanish so\'rovi topilmadi. Avval kodni yuboring." });
    }
    
    const result = await verifyCode(s.telegram_account.phone, code.trim());
    
    if (result.needs2fa) {
      s.telegram_account.status = 'AWAITING_PASSWORD';
      await db.save();
      return res.json({ success: true, status: 'AWAITING_PASSWORD', needs2fa: true });
    }

    s.telegram_account.status = 'CONNECTED';
    s.telegram_account.session = result.sessionString;
    await db.save();
    
    logEvent('SUCCESS', `Telegram akkaunti muvaffaqiyatli ulandi: ${s.telegram_account.phone}`);
    return res.json({ success: true, status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

const newVerify2fa = `app.post('/api/admin/telegram-client/verify-2fa', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    
    const s = await db.getSettings();
    const result = await verify2fa(s.telegram_account.phone, password);

    s.telegram_account.status = 'CONNECTED';
    s.telegram_account.session = result.sessionString;
    await db.save();
    
    logEvent('SUCCESS', `Telegram akkaunt 2FA orqali muvaffaqiyatli ulandi: ${s.telegram_account.phone}`);
    res.json({ success: true, status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

// Replace send-code
const sendCodeRegex = /app\.post\(\'/api\/(admin\/)telegram-client\/send-code\',i+[\s\S]*?\\}\\);/m;
code = code.replace(sendCodeRegex, newSendCode);

// Replace verify-code
const verifyCodeRegex = /app\.post\l\'\/api\/(admin\/)telegram-client\/½•É¥™äµ½‘•pœ±¤­mqÍqMt¨ıqqõqp¤ì½´ì)½‘”€ô½‘”¹É•Á±…”¡Ù•É¥™å½‘•I••à°¹•İY•É¥™å½‘”¤ì((¼¼I•Á±…”Ù•É¥™ä´É™„)½¹ÍĞÙ•É¥™äÉ™…I••à€ô€½…ÁÁp¹Á½ÍÑq±pp½…Á¥p¼¡…‘µ¥¹p¼¥Ñ•±•É…´µ±¥•¹Ñp¾öW&–g’Ó&fÂrÅµÇ5Å5Ò£õÅÇÕÅÂ“²öÓ°¦6öFRÒ6öFRç&WÆ6R‡fW&–g“&f&VvW‚ÂæWufW&–g“&f“° ¦g2çw&—FTf–ÆU7–æ2‚v&÷Bæ§2rÂ6öFR“°¦6öç6öÆRæÆör‚v&÷Bæ§2’VæGö–çG2WFFVBr“°