import fs from 'fs';
let code = fs.readFileSync('bot.js', 'utf8');
code = code.replace("import { sendCode, verifyCode, verify2fa } from './telegram_auth.js';", "import { sendCode, verifyCode, verify2fa } from './telegram_auth.js';\nimport { getConnectedClient } from './get_client.mjs';\nimport { Api } from 'telegram';\nimport { CustomFile } from 'telegram/client/uploads.js';");
fs.writeFileSync('bot.js', code);
