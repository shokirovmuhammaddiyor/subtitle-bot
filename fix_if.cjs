const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

code = code.replace(/      \}\n\n       && user\.pendingPurchase\) \{/g, "      }\n\n      if (ctx.message.photo && user.state === 'AWAITING_PAYMENT_RECEIPT' && user.pendingPurchase) {");

fs.writeFileSync('bot.js', code);
