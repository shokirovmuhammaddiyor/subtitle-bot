const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

code = code.replace(/' token qo'shildi\.'/g, "\" token qo'shildi.\"");

fs.writeFileSync('bot.js', code);
