const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

code = code.replace(/'GramJS orqali yuklashda xato, Telegrafga o'tilmoqda\. xato: '/g, '"GramJS orqali yuklashda xato, Telegrafga o\'tilmoqda. xato: "');

fs.writeFileSync('bot.js', code);
