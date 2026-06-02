const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "  const [storageChannelId, setStorageChannelId] = useState('');\n  const [telegramPhone, setTelegramPhone] = useState('');",
  "  const [storageChannelId, setStorageChannelId] = useState('');\n  const [telegramApiId, setTelegramApiId] = useState('');\n  const [telegramApiHash, setTelegramApiHash] = useState('');\n  const [telegramPhone, setTelegramPhone] = useState('');"
);

content = content.replace(
  "body: JSON.stringify({ phone: telegramPhone })",
  "body: JSON.stringify({ phone: telegramPhone, apiId: telegramApiId, apiHash: telegramApiHash })"
);

fs.writeFileSync(file, content);
console.log("Patched App.tsx states");
