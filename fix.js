const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

code = code.replace(/'Ulanish so'rovi topilmadi\. Avval kodni yuboring\.'/g, '"Ulanish so\'rovi topilmadi. Avval kodni yuboring."');

const leftover1 = `    
    const s = await db.getSettings();
    if (!s.telegram_account || s.telegram_account.status !== 'AWAITING_CODE') {
      return res.status(400).json({ error: "Ulanish so'rovi topilmadi. Avval kodni yuboring." });
    }
    
    if (s.telegram_account.code !== code.trim()) {
      return res.status(400).json({ error: "Xato tasdiqlash kodi! Iltimos, qaytadan urinib ko'ring." });
    }
    
    s.telegram_account.status = 'CONNECTED';
    await db.save();
    
    logEvent('SUCCESS', \`Telegram akkaunti muvaffaqiyatli ulandi: \${s.telegram_account.phone}\`);
    return res.json({ success: true, status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

const leftover2 = `    
    const s = await db.getSettings();
    s.telegram_account.status = 'CONNECTED';
    await db.save();
    
    logEvent('SUCCESS', \`Telegram akkaunt 2FA orqali muvaffaqiyatli ulandi: \${s.telegram_account.phone}\`);
    res.json({ success: true, status: 'CONNECTED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

code = code.replace(leftover1, '');
code = code.replace(leftover2, '');

fs.writeFileSync('bot.js', code);
