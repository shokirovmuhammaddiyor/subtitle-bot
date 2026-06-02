import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export async function getConnectedClient(apiId, apiHash, sessionString) {
  if (!sessionString || !apiId || !apiHash) return null;
  const client = new TelegramClient(new StringSession(sessionString), Number(apiId), apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}
