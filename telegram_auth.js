import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export const clients = new Map();

export async function sendCode(phone, apiId, apiHash) {
  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, Number(apiId), apiHash, {
    connectionRetries: 5,
  });
  
  await client.connect();
  const result = await client.sendCode(
    {
      apiId: Number(apiId),
      apiHash: apiHash,
    },
    phone
  );
  
  clients.set(phone, { client, phoneCodeHash: result.phoneCodeHash, apiId, apiHash });
  return result;
}

export async function verifyCode(phone, code) {
  const data = clients.get(phone);
  if (!data) throw new Error("Client not found for phone");
  const { client, phoneCodeHash } = data;
  
  try {
    await client.invoke(
      new Api.auth.signIn({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: code,
      })
    );
    const sessionString = client.session.save();
    return { sessionString, needs2fa: false };
  } catch (err) {
    if (err.message.includes("SESSION_PASSWORD_NEEDED")) {
      return { needs2fa: true };
    }
    throw err;
  }
}

export async function verify2fa(phone, password) {
  const data = clients.get(phone);
  if (!data) throw new Error("Client not found for phone");
  const { client } = data;
  
  const { computeCheck } = await import("telegram/password.js");
  
  const passwordData = await client.invoke(new Api.account.getPassword());
  
  await client.invoke(
    new Api.auth.checkPassword({
      password: await computeCheck(passwordData, password),
    })
  );
  const sessionString = client.session.save();
  return { sessionString };
}
