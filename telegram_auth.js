import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export const clients = new Map();

export async function sendCode(phone, apiId, apiHash) {
  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, Number(apiId), apiHash, {
    connectionRetries: 5,
  });
  client.setLogLevel("none");

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
    try { await client.destroy(); } catch (e) {}
    clients.delete(phone); // cleanup: xotira sizishini oldini olish
    return { sessionString, needs2fa: false };
  } catch (err) {
    if (err.message.includes("SESSION_PASSWORD_NEEDED") || (err.errorMessage && err.errorMessage.includes("SESSION_PASSWORD_NEEDED"))) {
      // 2FA kerak — clientni saqlab qolamiz verify2fa uchun
      return { needs2fa: true };
    }
    // Boshqa xatolar uchun clientni tozalab disconnect qilamiz
    try { await client.destroy(); } catch (e) {}
    clients.delete(phone);
    throw err;
  }
}

export async function verify2fa(phone, password) {
  const data = clients.get(phone);
  if (!data) throw new Error("Client not found for phone");
  const { client } = data;

  const { computeCheck } = await import("telegram/Password.js");

  try {
    const passwordData = await client.invoke(new Api.account.GetPassword());

    await client.invoke(
      new Api.auth.CheckPassword({
        password: await computeCheck(passwordData, password),
      })
    );
    const sessionString = client.session.save();
    try { await client.destroy(); } catch (e) {}
    clients.delete(phone); // cleanup: muvaffaqiyatli ulanishdan keyin xotirani tozalash
    return { sessionString };
  } catch (err) {
    try { await client.destroy(); } catch (e) {}
    clients.delete(phone);
    throw err;
  }
}

export const qrSessions = new Map();

export async function startQrLogin(apiId, apiHash) {
  const sessionId = 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, Number(apiId), apiHash, {
    connectionRetries: 5,
  });
  client.setLogLevel("none");

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
      password: async (hint) => {
        qrSession.status = 'NEEDS_2FA';
        qrSession.passwordHint = hint;
        return new Promise((resolve, reject) => {
          qrSession.resolvePassword = resolve;
          qrSession.rejectPassword = reject;
          qrSession.passwordTimeout = setTimeout(() => {
            if (qrSession.status === 'NEEDS_2FA') {
              qrSession.status = 'ERROR';
              qrSession.error = '2FA parolini kiritish vaqti tugadi';
              reject(new Error('2FA_TIMEOUT'));
            }
          }, 5 * 60 * 1000);
        });
      },
      onError: async (err) => {
        const errMsg = err.message || String(err);
        qrSession.status = 'ERROR';
        qrSession.error = errMsg;
        try { await client.destroy(); } catch (e) {}
        return true;
      }
    }
  ).then(async (user) => {
    try {
      const me = await client.getMe();
      qrSession.phone = me.phone ? `+${me.phone}` : (me.username ? `@${me.username}` : 'Connected');
      qrSession.sessionString = client.session.save();
      qrSession.status = 'CONNECTED';
    } catch (e) {
      qrSession.status = 'ERROR';
      qrSession.error = e.message;
      try { await client.destroy(); } catch (_) {}
    }
  }).catch(async (err) => {
    if (err.message === '2FA_TIMEOUT') return;
    qrSession.status = 'ERROR';
    qrSession.error = err.message || String(err);
    try { await client.destroy(); } catch (e) {}
  });

  const authInterval = setInterval(async () => {
    try {
      if (!qrSessions.has(sessionId) || qrSession.status === 'CONNECTED' || qrSession.status === 'ERROR') {
        clearInterval(authInterval);
        return;
      }
      const isAuthorized = await client.isUserAuthorized().catch(() => false);
      if (isAuthorized) {
        clearInterval(authInterval);
        const me = await client.getMe().catch(() => null);
        qrSession.phone = me && me.phone ? `+${me.phone}` : (me && me.username ? `@${me.username}` : 'Connected');
        qrSession.sessionString = client.session.save();
        qrSession.status = 'CONNECTED';
      }
    } catch (e) {
      // Ignore errors during check
    }
  }, 2000);

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

export async function verifyQr2fa(sessionId, password) {
  const qrSession = qrSessions.get(sessionId);
  if (!qrSession) throw new Error("QR ulanish seansi topilmadi.");
  
  if (!qrSession.resolvePassword) {
    throw new Error("Ushbu seans 2FA parol kiritish holatida emas.");
  }

  if (qrSession.passwordTimeout) {
    clearTimeout(qrSession.passwordTimeout);
  }

  // Resolve the pending promise in the password callback
  qrSession.resolvePassword(password);

  // Wait for the background signInUserWithQrCode process to complete
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (qrSession.status === 'CONNECTED') {
        clearInterval(checkInterval);
        resolve({ sessionString: qrSession.sessionString, phone: qrSession.phone });
      } else if (qrSession.status === 'ERROR') {
        clearInterval(checkInterval);
        reject(new Error(qrSession.error || "2FA paroli xato."));
      }
    }, 500);
  });
}

export async function cancelQrLogin(sessionId) {
  const qrSession = qrSessions.get(sessionId);
  if (qrSession) {
    try {
      await qrSession.client.destroy();
    } catch (e) {}
    qrSessions.delete(sessionId);
    return true;
  }
  return false;
}
