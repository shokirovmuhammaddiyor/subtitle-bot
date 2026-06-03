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
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: code,
      })
    );
    const sessionString = client.session.save();
    return { sessionString, needs2fa: false };
  } catch (err) {
    if (err.message.includes("SESSION_PASSWORD_NEEDED") || (err.errorMessage && err.errorMessage.includes("SESSION_PASSWORD_NEEDED"))) {
      return { needs2fa: true };
    }
    throw err;
  }
}

export async function verify2fa(phone, password) {
  const data = clients.get(phone);
  if (!data) throw new Error("Client not found for phone");
  const { client } = data;

  const { computeCheck } = await import("telegram/Password.js");

  const passwordData = await client.invoke(new Api.account.GetPassword());

  await client.invoke(
    new Api.auth.CheckPassword({
      password: await computeCheck(passwordData, password),
    })
  );
  const sessionString = client.session.save();
  return { sessionString };
}

export const qrSessions = new Map();

export async function startQrLogin(apiId, apiHash) {
  const sessionId = 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, Number(apiId), apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  const qrSession = {
    id: sessionId,
    status: 'WAITING_QR',
    qrUrl: '',
    sessionString: null,
    error: null,
    client,
    apiId,
    apiHash
  };

  qrSessions.set(sessionId, qrSession);

  // Start auth loop in background
  client.signInUserWithQrCode(
    { apiId: Number(apiId), apiHash },
    {
      qrCode: async (code) => {
        const tokenStr = code.token.toString("base64url");
        qrSession.qrUrl = `tg://login?token=${tokenStr}`;
        qrSession.status = 'SCANNING';
      },
      onError: async (err) => {
        qrSession.status = 'ERROR';
        qrSession.error = err.message || String(err);
        try { await client.disconnect(); } catch (e) {}
        return true;
      }
    }
  ).then(async (user) => {
    try {
      const me = await client.getMe();
      qrSession.phone = me.phone || me.username || 'Connected';
      qrSession.sessionString = client.session.save();
      qrSession.status = 'CONNECTED';
    } catch (e) {
      qrSession.status = 'ERROR';
      qrSession.error = e.message;
    }
  }).catch((err) => {
    qrSession.status = 'ERROR';
    qrSession.error = err.message || String(err);
    try { client.disconnect(); } catch (e) {}
  });

  return sessionId;
}

export async function getQrStatus(sessionId) {
  const qrSession = qrSessions.get(sessionId);
  if (!qrSession) {
    return { status: 'NOT_FOUND' };
  }
  return {
    status: qrSession.status,
    qrUrl: qrSession.qrUrl,
    phone: qrSession.phone,
    sessionString: qrSession.sessionString,
    error: qrSession.error
  };
}

export async function cancelQrLogin(sessionId) {
  const qrSession = qrSessions.get(sessionId);
  if (qrSession) {
    try {
      await qrSession.client.disconnect();
    } catch (e) {}
    qrSessions.delete(sessionId);
    return true;
  }
  return false;
}
