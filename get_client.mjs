import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export async function getConnectedClient(apiId, apiHash, sessionString) {
  if (!sessionString || !apiId || !apiHash) return null;
  const client = new TelegramClient(new StringSession(sessionString), Number(apiId), apiHash, {
    connectionRetries: 10,
    requestRetries: 5,
    timeout: 30000, // 30 seconds timeout per request/chunk
    autoReconnect: true
  });
  client.setLogLevel("none");
  await client.connect();
  return client;
}
