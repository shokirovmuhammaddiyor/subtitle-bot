import React, { useState, useEffect } from 'react';
import {
  Terminal, Cpu, Database as DbIcon,
  Settings, AlertCircle, RefreshCw, Send, CheckCircle2,
  Layers, Zap, Clock, Code, Activity, Globe, Server, Download, Upload, Shield, Save,
  Trash2, Plus, Users, CreditCard, Check, X, Eye, ShieldAlert, Lock, LogOut, FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';

// Local Fetch Interceptor to handle Session Header Fallback for iFrame Cookie Limitations
const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('admin_session_token');
  const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input && 'url' in (input as any) ? (input as any).url : ''));
  const isApi = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin) || urlStr.includes('/api/');

  if (token && isApi) {
    init = init || {};
    let headers: Record<string, string> = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        headers = { ...init.headers } as Record<string, string>;
      }
    }
    headers['x-admin-token'] = token;
    headers['Authorization'] = `Bearer ${token}`;
    init.headers = headers;
  }

  const res = await window.fetch(input, init);

  // Safe JSON interceptor to avoid "Unexpected end of JSON" or "Unexpected token < animate" crashes
  res.json = async function () {
    try {
      const text = await res.text();
      if (!text || !text.trim()) {
        return { error: `Server bo'sh javob qaytardi (Status: ${res.status})` };
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        if (text.trim().startsWith('<')) {
          return { error: `Server xatosi (HTML markup qaytdi, Status: ${res.status})` };
        }
        return { error: text.length > 200 ? text.substring(0, 200) + '...' : text };
      }
    } catch (err: any) {
      return { error: err.message || 'Javobni o\'qishda xatolik yuz berdi' };
    }
  };

  return res;
};

export default function App() {
  const [stats, setStats] = useState({
    usersCount: 0,
    projectsCount: 0,
    episodesCount: 0,
    activeJobs: [],
    settings: { defaultBatchSize: 45, systemPrompt: '' }
  });
  const [logs, setLogs] = useState([]);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsTypeFilter, setLogsTypeFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Authentication & Multi-Session Control States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const [adminSessionsLoading, setAdminSessionsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'config' | 'teams' | 'payments' | 'yaml' | 'stats' | 'admin_users' | 'backups' | 'subtitles'>('config');

  // Mandatory Channels States
  const [mandatoryChannels, setMandatoryChannels] = useState<any[]>([]);
  const [mandatoryChannelsLoading, setMandatoryChannelsLoading] = useState(false);
  const [newChanId, setNewChanId] = useState('');
  const [newChanInvite, setNewChanInvite] = useState('');
  const [newChanTitle, setNewChanTitle] = useState('');

  // Subtitles States
  const [subtitles, setSubtitles] = useState<any[]>([]);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [subtitlesError, setSubtitlesError] = useState('');
  const [subtitlesDownloadingId, setSubtitlesDownloadingId] = useState<string | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [projectsData, setProjectsData] = useState<{ projects: any[], episodes: any[] }>({ projects: [], episodes: [] });
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Backup States
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState('');
  const [backupsSuccess, setBackupsSuccess] = useState('');

  // Live API Health Metrics
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [apiHealthLoading, setApiHealthLoading] = useState(false);

  // Core App Initialization Routine
  const initAppCore = async () => {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchLogs(),
      fetchConfig(),
      fetchLocales(),
      fetchTeams(),
      fetchPayments(),
      fetchPromocodes(),
      fetchApiHealth(),
      fetchSessionsList(),
      fetchMandatoryChannels(),
      fetchSubtitles()
    ]);
    setLoading(false);
  };

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/admin/session-check');
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
        return true;
      } else {
        localStorage.removeItem('admin_session_token');
        setIsAuthenticated(false);
        // Load sessions anyway so they show up on the login security wall
        fetchSessionsList();
        return false;
      }
    } catch (err) {
      console.error("Auth validation failed:", err);
      setIsAuthenticated(false);
      return false;
    }
  };

  const fetchSessionsList = async () => {
    try {
      setAdminSessionsLoading(true);
      const res = await fetch('/api/admin/sessions-list');
      if (res.ok) {
        const data = await res.json();
        setAdminSessions(data);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setAdminSessionsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError("Iltimos, barcha maydonlarni kiritish majburiy!");
      return;
    }
    try {
      setLoggingIn(true);
      setLoginError('');
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem('admin_session_token', data.token);
        }
        setIsAuthenticated(true);
        setLoginUsername('');
        setLoginPassword('');
        // Boot core app details once successfully logged in
        await initAppCore();
      } else {
        setLoginError(data.error || "Foydalanuvchi nomi yoki parol xato!");
      }
    } catch (err: any) {
      setLoginError("Server bilan bog'lanishda xato: " + err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Haqiqatan ham boshqaruv panelidan chiqmoqchimisiz?")) return;
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      localStorage.removeItem('admin_session_token');
      setIsAuthenticated(false);
      fetchSessionsList();
    } catch (err) {
      console.error("Logout runtime error:", err);
    }
  };

  // States to locally adjust and modify balance & limits
  const [tokenAdjustment, setTokenAdjustment] = useState<{ [teamId: string]: string }>({});
  const [directUserMessage, setDirectUserMessage] = useState<{ [userId: string]: string }>({});
  const [sendingMessageStatus, setSendingMessageStatus] = useState<{ [userId: string]: string }>({});

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTargetTeam, setBroadcastTargetTeam] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState('');

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) { }
    setUsersLoading(false);
  };

  const fetchProjectsData = async () => {
    try {
      setProjectsLoading(true);
      const res = await fetch('/api/admin/projects');
      if (res.ok) {
        const data = await res.json();
        setProjectsData(data);
      }
    } catch (e) { }
    setProjectsLoading(false);
  };

  const fetchApiHealth = async () => {
    try {
      setApiHealthLoading(true);
      const res = await fetch('/api/health');
      const data = await res.json();
      setApiHealth(data);
    } catch (err) {
      console.error("Error fetching api health metrics:", err);
    } finally {
      setApiHealthLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      setBackupsLoading(true);
      setBackupsError('');
      const res = await fetch('/api/admin/backups');
      if (!res.ok) throw new Error("Zaxiralar ro'yxatini yuklashda xatolik yuz berdi");
      const data = await res.json();
      setBackups(data);
    } catch (err: any) {
      setBackupsError(err.message || "Xatolik yuz berdi");
    } finally {
      setBackupsLoading(false);
    }
  };

  const fetchMandatoryChannels = async () => {
    try {
      setMandatoryChannelsLoading(true);
      const res = await fetch('/api/admin/mandatory-channels');
      if (res.ok) {
        const data = await res.json();
        setMandatoryChannels(data);
      }
    } catch (e) { }
    setMandatoryChannelsLoading(false);
  };

  const fetchSubtitles = async () => {
    try {
      setSubtitlesLoading(true);
      const res = await fetch('/api/admin/subtitles');
      if (res.ok) {
        const data = await res.json();
        setSubtitles(data);
      }
    } catch (e) { }
    setSubtitlesLoading(false);
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChanId || !newChanInvite || !newChanTitle) {
      alert("Barcha maydonlarni to'ldiring");
      return;
    }
    try {
      const res = await fetch('/api/admin/mandatory-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newChanId, inviteLink: newChanInvite, title: newChanTitle })
      });
      if (res.ok) {
        setNewChanId('');
        setNewChanInvite('');
        setNewChanTitle('');
        fetchMandatoryChannels();
      } else {
        const data = await res.json();
        alert(data.error || "Kanal qo'shishda xatolik");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!window.confirm("Haqiqatan ham ushbu kanalni majburiy obuna ro'yxatidan o'chirmoqchimisiz?")) return;
    try {
      const res = await fetch(`/api/admin/mandatory-channels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchMandatoryChannels();
      }
    } catch (e) { }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupsLoading(true);
      setBackupsError('');
      setBackupsSuccess('');
      const res = await fetch('/api/admin/backups/create', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setBackupsSuccess('Zaxira nusxasi muvaffaqiyatli yaratildi! 🎉');
        await fetchBackups();
      } else {
        throw new Error(data.error || 'Nomalum xatolik');
      }
    } catch (err: any) {
      setBackupsError(err.message);
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleRestoreBackup = async (id: string, filename: string) => {
    if (!window.confirm(`Haqiqatan ham tizim holatini "${filename}" zaxira nusxasiga qaytarmoqchimisiz?\nUshbu amal barcha joriy holatni o'zgartiradi (Lekin bundan oldin favqulodda zaxira nusxa yaratiladi).`)) {
      return;
    }
    try {
      setBackupsLoading(true);
      setBackupsError('');
      setBackupsSuccess('');
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        setBackupsSuccess(`Tizim holati "${filename}" zaxirasidan muvaffaqiyatli tiklandi! Barcha ma'lumotlar yangilandi. 🎉`);
        fetchStats();
        fetchTeams();
        fetchPayments();
        fetchUsers();
        fetchBackups();
        fetchConfig();
        fetchTelegramStatus();
      } else {
        throw new Error(data.error || 'Nomalum xatolik');
      }
    } catch (err: any) {
      setBackupsError(err.message);
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleDownloadBackup = async (id: string, filename: string) => {
    try {
      setBackupsError('');
      const res = await fetch(`/api/admin/backups/download/${id}`);
      if (!res.ok) throw new Error("Yuklab olishda xatolik yuz berdi");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setBackupsError(err.message);
    }
  };

  const handleDownloadSubtitle = async (episodeId: string, fileType: 'original' | 'translated', filename: string) => {
    try {
      setSubtitlesError('');
      setSubtitlesDownloadingId(`${episodeId}_${fileType}`);
      const res = await fetch(`/api/admin/subtitles/download/${episodeId}/${fileType}`);
      if (!res.ok) throw new Error("Yuklab olishda xatolik yuz berdi");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setSubtitlesError(err.message);
    } finally {
      setSubtitlesDownloadingId(null);
    }
  };

  const handleUploadBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Haqiqatan ham ma'lumotlar bazasini ushbu fayl bilan almashtirmoqchimisiz?")) return;
    setBackupsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        JSON.parse(text); // validation
        const res = await fetch('/api/admin/backups/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dbContent: text })
        });
        if (res.ok) {
          setBackupsSuccess("Ma'lumotlar bazasi fayldan muvaffaqiyatli tiklandi!");
          fetchBackups();
          fetchStats();
          fetchTeams();
          fetchPayments();
          fetchUsers();
          fetchConfig();
          fetchTelegramStatus();
        } else {
          const d = await res.json();
          setBackupsError(d.error || "Xatolik yuz berdi");
        }
      } catch (err) { setBackupsError("Yaroqsiz JSON fayl"); }
      finally { setBackupsLoading(false); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportConfig = async () => {
    try {
      const res = await fetch('/api/admin/export-config');
      const data = await res.json();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const dl = document.createElement('a');
      dl.setAttribute("href", dataStr);
      dl.setAttribute("download", `subtrans_config_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(dl);
      dl.click();
      dl.remove();
    } catch (e) { alert("Export qilishda xato"); }
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Barcha API kalitlari va sozlamalar ushbu fayldagiga o'zgartiriladi. Davom etamizmi?")) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const res = await fetch('/api/admin/import-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });
        if (res.ok) {
          alert("Tizim sozlamalari muvaffaqiyatli tiklandi!");
          fetchConfig();
        } else {
          alert("Yuklashda xatolik yuz berdi");
        }
      } catch (err) { alert("Faylni o'qishda xatolik yuz berdi"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBlockUser = async (userId: number, isBlocked: boolean) => {
    try {
      const endpoint = isBlocked ? 'unblock' : 'block';
      const res = await fetch(`/api/admin/users/${userId}/${endpoint}`, { method: 'POST' });
      if (res.ok) {
        await fetchUsers();
        await fetchStats();
      }
    } catch (e) { }
  };

  const handleKickUser = async (userId: number) => {
    if (!window.confirm("Haqiqatan ham foydalanuvchini jamoadan haydamoqchimisiz?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/kick`, { method: 'POST' });
      if (res.ok) {
        await fetchUsers();
        await fetchTeams();
        await fetchStats();
      }
    } catch (e) { }
  };

  const handleSendDirectMessage = async (userId: number) => {
    const msg = directUserMessage[userId] || '';
    if (!msg.trim()) return;
    try {
      setSendingMessageStatus(prev => ({ ...prev, [userId]: 'Yuborilmoqda...' }));
      const res = await fetch(`/api/admin/users/${userId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      if (res.ok) {
        setSendingMessageStatus(prev => ({ ...prev, [userId]: 'Xabar yuborildi! ✅' }));
        setDirectUserMessage(prev => ({ ...prev, [userId]: '' }));
        setTimeout(() => {
          setSendingMessageStatus(prev => ({ ...prev, [userId]: '' }));
        }, 3000);
      } else {
        setSendingMessageStatus(prev => ({ ...prev, [userId]: 'Xato yuz berdi ❌' }));
      }
    } catch (e) {
      setSendingMessageStatus(prev => ({ ...prev, [userId]: 'Xato yuz berdi ❌' }));
    }
  };

  const handleAlterTokens = async (teamId: string, isAdd: boolean) => {
    const rawVal = tokenAdjustment[teamId] || '';
    const numericVal = Number(rawVal);
    if (!rawVal || isNaN(numericVal) || numericVal <= 0) {
      alert("Iltimos, musbat son kiriting!");
      return;
    }
    const signedValue = isAdd ? numericVal : -numericVal;
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: signedValue })
      });
      if (res.ok) {
        setTokenAdjustment(prev => ({ ...prev, [teamId]: '' }));
        await fetchTeams();
        await fetchStats();
      } else {
        alert("Xato yuz berdi");
      }
    } catch (e) { }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    try {
      setBroadcastStatus('Yuborilmoqda...');
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: broadcastMessage,
          targetTeamId: broadcastTargetTeam || undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        setBroadcastStatus(`Muvaffaqiyatli: ${data.sentCount} ta foydalanuvchiga e'lon yuborildi! ✅`);
        setBroadcastMessage('');
        setTimeout(() => setBroadcastStatus(''), 5000);
      } else {
        setBroadcastStatus('Xatolik yuz berdi ❌');
      }
    } catch (e) {
      setBroadcastStatus('Xatolik yuz berdi ❌');
    }
  };

  const [botToken, setBotToken] = useState('');
  const [apiKeys, setApiKeys] = useState<string[]>(['']);
  const [aiModel, setAiModel] = useState('gemini-2.0-flash');
  const [defaultBatchSize, setDefaultBatchSize] = useState('45');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardOwner, setCardOwner] = useState('');
  const [packages, setPackages] = useState<any[]>([]);

  // Automated Anime & Telegram User Account Pairing States
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(false);
  const [storageChannelId, setStorageChannelId] = useState('');
  const [telegramApiId, setTelegramApiId] = useState('');
  const [telegramApiHash, setTelegramApiHash] = useState('');
  const [telegramPhone, setTelegramPhone] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramPassword, setTelegramPassword] = useState('');
  const [telegramStatus, setTelegramStatus] = useState({ phone: '', status: 'DISCONNECTED', session: null });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [automatedAnimes, setAutomatedAnimes] = useState<any[]>([]);

  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch('/api/admin/telegram-client/status');
      if (res.ok) {
        const data = await res.json();
        setTelegramStatus(data);
      }
    } catch (e) { }
  };

  const fetchAutomatedAnimes = async () => {
    try {
      const res = await fetch('/api/admin/automated-animes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAutomatedAnimes(data);
        } else {
          console.error("fetchAutomatedAnimes: returned data is not an array", data);
          setAutomatedAnimes([]);
        }
      }
    } catch (e) {
      console.error("fetchAutomatedAnimes error:", e);
      setAutomatedAnimes([]);
    }
  };

  const handleSendTelegramCode = async () => {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/admin/telegram-client/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telegramPhone, apiId: telegramApiId, apiHash: telegramApiHash })
      });
      if (res.ok) {
        await fetchTelegramStatus();
      } else {
        const data = await res.json();
        setTelegramError(data.error || 'Ulanish xatosi');
      }
    } catch (err: any) {
      setTelegramError(err.message);
    }
    setTelegramLoading(false);
  };

  const handleVerifyTelegramCode = async () => {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/admin/telegram-client/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: telegramCode })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTelegramStatus();
      } else {
        setTelegramError(data.error || 'Tasdiqlash kodi noto\'g\'ri');
      }
    } catch (err: any) {
      setTelegramError(err.message);
    }
    setTelegramLoading(false);
  };

  const handleVerifyTelegram2fa = async () => {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/admin/telegram-client/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: telegramPassword })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTelegramStatus();
      } else {
        setTelegramError(data.error || '2FA kaliti xato');
      }
    } catch (err: any) {
      setTelegramError(err.message);
    }
    setTelegramLoading(false);
  };

  const handleDisconnectTelegram = async () => {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/admin/telegram-client/disconnect', { method: 'POST' });
      if (res.ok) {
        setTelegramPhone('');
        setTelegramCode('');
        setTelegramPassword('');
        await fetchTelegramStatus();
      }
    } catch (err: any) {
      setTelegramError(err.message);
    }
    setTelegramLoading(false);
  };

  const [loginMethod, setLoginMethod] = useState<'phone' | 'qr'>('phone');
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('');

  const handleStartQrLogin = async () => {
    setTelegramLoading(true);
    setTelegramError('');
    setQrUrl('');
    setQrStatus('WAITING_QR');
    try {
      const res = await fetch('/api/admin/telegram-client/qr-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId: telegramApiId, apiHash: telegramApiHash })
      });
      const data = await res.json();
      if (res.ok) {
        setQrSessionId(data.qrSessionId);
      } else {
        setTelegramError(data.error || 'QR loginni boshlashda xatolik');
      }
    } catch (err: any) {
      setTelegramError(err.message);
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleCancelQrLogin = async () => {
    if (!qrSessionId) return;
    try {
      await fetch('/api/admin/telegram-client/qr-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: qrSessionId })
      });
    } catch (e) {}
    setQrSessionId(null);
    setQrUrl('');
    setQrStatus('');
  };

  const handleQrVerify2fa = async () => {
    if (!qrSessionId || !telegramPassword) return;
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/admin/telegram-client/qr-verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: qrSessionId, password: telegramPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setQrSessionId(null);
        setQrUrl('');
        setQrStatus('');
        setTelegramPassword('');
        await fetchTelegramStatus();
      } else {
        setTelegramError(data.error || '2FA paroli xato');
      }
    } catch (err: any) {
      setTelegramError(err.message);
    } finally {
      setTelegramLoading(false);
    }
  };

  useEffect(() => {
    if (!qrSessionId) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/telegram-client/qr-status?id=${qrSessionId}`);
        if (!res.ok || !active) return;
        const data = await res.json();
        
        if (data.status === 'SCANNING' || data.status === 'WAITING_QR') {
          setQrUrl(data.qrUrl || '');
          setQrStatus(data.status);
        } else if (data.status === 'NEEDS_2FA') {
          setQrStatus(data.status);
        } else if (data.status === 'CONNECTED') {
          setQrSessionId(null);
          setQrUrl('');
          setQrStatus('');
          setTelegramPassword('');
          await fetchTelegramStatus();
        } else if (data.status === 'ERROR') {
          setTelegramError(data.error || 'QR kod skanerlashda xatolik yuz berdi');
          setQrSessionId(null);
          setQrUrl('');
          setQrStatus('');
        }
      } catch (err) {
        console.error("QR status poll error:", err);
      }
    };

    const interval = setInterval(poll, 2000);
    poll(); // run immediately

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [qrSessionId]);

  const handleAddApiKey = () => {
    setApiKeys([...apiKeys, '']);
  };

  const handleRemoveApiKey = (index: number) => {
    const updated = apiKeys.filter((_, idx) => idx !== index);
    setApiKeys(updated.length > 0 ? updated : ['']);
  };

  const handleApiKeyChange = (index: number, value: string) => {
    const updated = [...apiKeys];
    updated[index] = value;
    setApiKeys(updated);
  };

  const handleDownloadGeminiKeys = () => {
    const validKeys = apiKeys.map(k => k.trim()).filter(Boolean);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ keys: validKeys }, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "gemini_keys.json");
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
  };

  const handleUploadGeminiKeys = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApiKeys(parsed);
        } else if (parsed.keys && Array.isArray(parsed.keys) && parsed.keys.length > 0) {
          setApiKeys(parsed.keys);
        } else {
          alert("Noto'g'ri JSON formati!");
        }
      } catch (err) {
        alert("JSON o'qishda xatolik yuz berdi!");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const [locales, setLocales] = useState<{ name: string, lang: string, size: number, mtime: string }[]>([]);
  const [selectedLang, setSelectedLang] = useState('uz');
  const [newLangCode, setNewLangCode] = useState('');
  const [isAddingLang, setIsAddingLang] = useState(false);

  const [yamlContent, setYamlContent] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlSaveSuccess, setYamlSaveSuccess] = useState(false);

  const [teams, setTeams] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const pendingTeamsCount = teams.filter((t: any) => t.status === 'PENDING').length;
  const pendingPaymentsCount = payments.filter((p: any) => p.status === 'PENDING').length;

  // States to locally adjust and modify balance & limits during approvals
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTokens, setEditTokens] = useState<number>(1000);
  const [editConcurrency, setEditConcurrency] = useState<number>(2);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [errorPrompt, setErrorPrompt] = useState('');
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({ ...prev, ...data }));
      }
    } catch (e) { }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) { }
  };

  const fetchLocales = async () => {
    try {
      const res = await fetch('/api/locales');
      if (res.ok) {
        const data = await res.json();
        setLocales(data);
      }
    } catch (e) { }
  };

  const fetchTeams = async () => {
    try {
      setTeamsLoading(true);
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (e) { }
    setTeamsLoading(false);
  };

  const fetchPayments = async () => {
    try {
      setPaymentsLoading(true);
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (e) { }
    setPaymentsLoading(false);
  };

  const fetchLocaleContent = async (lang: string) => {
    setYamlLoading(true);
    setErrorPrompt('');
    try {
      const res = await fetch(`/api/locales/${lang}`);
      if (res.ok) {
        const data = await res.json();
        setYamlContent(data.content);
      } else {
        const errData = await res.json();
        setErrorPrompt(errData.error || 'Til yuklashda xato');
      }
    } catch (err: any) {
      setErrorPrompt(err.message);
    }
    setYamlLoading(false);
  };

  const [newPackName, setNewPackName] = useState('');
  const [newPackType, setNewPackType] = useState('tokens');
  const [newPackValue, setNewPackValue] = useState('1000');
  const [newPackPrice, setNewPackPrice] = useState("15,000 O'zS");
  const [newPackDays, setNewPackDays] = useState('');

  const handleAddPackage = () => {
    if (!newPackName.trim() || !newPackPrice.trim()) {
      alert("Iltimos, nom va narx kiriting!");
      return;
    }
    const id = newPackType === 'package' ? `pkg_${Date.now()}` : `pack_${Date.now()}`;
    const newPack = {
      id,
      name: newPackName.trim(),
      type: newPackType,
      value: parseInt(newPackValue) || 0,
      price: newPackPrice.trim(),
      days: newPackDays.trim() ? parseInt(newPackDays) : null
    };
    setPackages([...packages, newPack]);
    setNewPackName('');
    setNewPackPrice('');
  };

  const handleRemovePackage = (idToRemove: string) => {
    setPackages(packages.filter(p => p.id !== idToRemove));
  };


  const [promocodes, setPromocodes] = useState<any[]>([]);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoType, setNewPromoType] = useState('tokens');
  const [newPromoValue, setNewPromoValue] = useState('1000');
  const [newPromoDays, setNewPromoDays] = useState('');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('1');
  const [promoError, setPromoError] = useState('');

  const fetchPromocodes = async () => {
    try {
      const res = await fetch('/api/admin/promocodes');
      if (res.ok) {
        setPromocodes(await res.json());
      }
    } catch (e) { }
  };

  const handleAddPromocode = async () => {
    if (!newPromoCode.trim()) return setPromoError('Promokodni kiriting');
    try {
      const res = await fetch('/api/admin/promocodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newPromoCode,
          type: newPromoType,
          value: newPromoValue,
          days: newPromoDays || null,
          maxUses: newPromoMaxUses || 1
        })
      });
      if (res.ok) {
        setNewPromoCode('');
        setNewPromoValue('1000');
        setNewPromoDays('');
        setNewPromoMaxUses('1');
        setPromoError('');
        await fetchPromocodes();
      } else {
        const data = await res.json();
        setPromoError(data.error || 'Xato yuz berdi');
      }
    } catch (e: any) {
      setPromoError(e.message);
    }
  };

  const handleDeletePromocode = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/promocodes/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchPromocodes();
    } catch (e) { }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setBotToken(data.botToken);
        const keysArr = (data.geminiApiKey || '').split(/[,\s;\n]+/).map((k: string) => k.trim()).filter(Boolean);
        setApiKeys(keysArr.length > 0 ? keysArr : ['']);
        setDefaultBatchSize(String(data.defaultBatchSize));
        setSystemPrompt(data.systemPrompt || '');
        setAutoDownloadEnabled(!!data.auto_download_enabled);
        setStorageChannelId(data.storage_channel_id || '');
        setCardNumber(data.cardNumber || '');
        setCardOwner(data.cardOwner || '');
        setPackages(data.packages || []);
        setTelegramApiId(data.telegramApiId || '');
        setTelegramApiHash(data.telegramApiHash || '');
        setAiModel(data.aiModel || 'gemini-2.0-flash');
      }
    } catch (e) { }
  };

  useEffect(() => {
    const init = async () => {
      const authed = await checkAuthStatus();
      if (authed) {
        await initAppCore();
      } else {
        setLoading(false);
      }
    };
    init();

    const interval = setInterval(() => {
      // Avoid querying secure operations if unauthenticated
      if (isAuthenticated === true) {
        fetchStats();
        fetchLogs();
        fetchAutomatedAnimes();
      }
    }, 2500);

    const intervalHealth = setInterval(() => {
      if (isAuthenticated === true) {
        fetchApiHealth();
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(intervalHealth);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedLang) {
      fetchLocaleContent(selectedLang);
    }
  }, [selectedLang]);

  useEffect(() => {
    if (isAuthenticated !== true) return;
    if (activeTab === 'config') {
      fetchConfig();
      fetchTelegramStatus();
      fetchAutomatedAnimes();
      fetchMandatoryChannels();
    }
    if (activeTab === 'yaml') fetchLocales();
    if (activeTab === 'teams') fetchTeams();
    if (activeTab === 'payments') fetchPayments();
    if (activeTab === 'backups') fetchBackups();
    if (activeTab === 'subtitles') fetchSubtitles();
    if (activeTab === 'admin_users') {
      fetchUsers();
      fetchProjectsData();
      fetchTeams();
      fetchSessionsList();
    }
    if (activeTab === 'stats') {
      fetchStats();
      fetchProjectsData();
      fetchTeams();
    }
  }, [activeTab, isAuthenticated]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaveSuccess(false);
    setErrorPrompt('');
    try {
      const geminiApiKey = apiKeys.map(k => k.trim()).filter(Boolean).join(',');
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken,
          geminiApiKey,
          defaultBatchSize: parseInt(defaultBatchSize) || 45,
          systemPrompt,
          auto_download_enabled: autoDownloadEnabled,
          storage_channel_id: storageChannelId,
          cardNumber,
          cardOwner,
          packages,
          telegramApiId,
          telegramApiHash,
          aiModel
        })
      });
      if (res.ok) {
        setConfigSaveSuccess(true);
        setTimeout(() => setConfigSaveSuccess(false), 3000);
        await fetchStats();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Tizim sozlamalarini saqlab boʻlmadi');
      }
    } catch (err: any) {
      setErrorPrompt(err.message);
    }
  };

  const handleSaveYaml = async () => {
    setYamlSaveSuccess(false);
    setErrorPrompt('');
    try {
      const res = await fetch(`/api/locales/${selectedLang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: yamlContent })
      });
      if (res.ok) {
        setYamlSaveSuccess(true);
        setTimeout(() => setYamlSaveSuccess(false), 3000);
        await fetchLocales();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Muvofiqlik xatosi yuz berdi');
      }
    } catch (err: any) {
      setErrorPrompt(err.message);
    }
  };

  const handleDeleteYaml = async (lang: string) => {
    if (lang === 'uz') return;
    if (!window.confirm(`Haqiqatan ham '${lang}.yaml' tarjima faylini tizmizdan butunlay oʻchirib yubormoqchimisiz?`)) return;
    setErrorPrompt('');
    try {
      const res = await fetch(`/api/locales/${lang}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedLang('uz');
        await fetchLocales();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Tilni oʻchirib boʻlmadi');
      }
    } catch (err: any) {
      setErrorPrompt(err.message);
    }
  };

  const handleCreateLocale = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLangCode.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (!clean) return;
    setErrorPrompt('');
    try {
      let templateContent = yamlContent;
      if (!templateContent) {
        const resUz = await fetch('/api/locales/uz');
        if (resUz.ok) {
          const dataUz = await resUz.json();
          templateContent = dataUz.content;
        }
      }
      const res = await fetch(`/api/locales/${clean}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: templateContent })
      });
      if (res.ok) {
        setNewLangCode('');
        setIsAddingLang(false);
        await fetchLocales();
        setSelectedLang(clean);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Yangi til yaratib boʻlmadi');
      }
    } catch (err: any) {
      setErrorPrompt(err.message);
    }
  };

  const handleUpdateTeamStatus = async (id: string, status: 'APPROVED' | 'BLOCKED', tk?: number, maxC?: number) => {
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          tokens: tk !== undefined ? tk : 1000,
          maxConcurrentJobs: maxC !== undefined ? maxC : 2
        })
      });
      if (res.ok) {
        setEditingTeamId(null);
        await fetchTeams();
        await fetchStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApprovePayment = async (id: string) => {
    try {
      const res = await fetch(`/api/payments/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        await fetchPayments();
        await fetchStats();
        await fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectPayment = async (id: string) => {
    try {
      const res = await fetch(`/api/payments/${id}/reject`, { method: 'POST' });
      if (res.ok) {
        await fetchPayments();
        await fetchStats();
        await fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadYaml = () => {
    const element = document.createElement("a");
    const file = new Blob([yamlContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${selectedLang}.yaml`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadStatsCSV = () => {
    const teamsList = teams || [];
    const projectsList = projectsData.projects || [];

    const teamsHeaders = ["ID (Kod)", "Jamoa Nomi", "Status", "Balans (Tokenlar)", "Parallel Slotlar", "A'zolar Soni", "Yaratuvchi Telegram ID"];
    const teamsRows = teamsList.map(t => [
      t.id,
      t.name || "Noma'lum",
      t.status || 'PENDING',
      t.tokens || 0,
      t.maxConcurrentJobs || 0,
      t.members?.length || 0,
      t.ownerId || ''
    ]);

    const projectsHeaders = ["Loyiha ID", "Kategoriya", "Loyiha Nomi", "Jamoa ID", "Epizodli", "Yaratilgan Sana"];
    const projectsRows = projectsList.map(p => [
      p.id,
      p.type || "Noma'lum",
      p.title || "Noma'lum",
      p.teamId || '',
      p.isMulti ? 'Ha' : "Yo'q",
      p.createdAt ? new Date(p.createdAt).toLocaleString() : ''
    ]);

    // Build Teams CSV content safely handling quotes & commas
    const csvTeamsContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [teamsHeaders.join(","), ...teamsRows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedTeamsUri = encodeURI(csvTeamsContent);
    const linkTeams = document.createElement("a");
    linkTeams.setAttribute("href", encodedTeamsUri);
    linkTeams.setAttribute("download", `subtrans_all_teams_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(linkTeams);
    linkTeams.click();
    document.body.removeChild(linkTeams);

    // Build Projects CSV content with slight delay to prevent popup-blockers
    setTimeout(() => {
      const csvProjContent = "data:text/csv;charset=utf-8,\uFEFF"
        + [projectsHeaders.join(","), ...projectsRows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      const encodedProjUri = encodeURI(csvProjContent);
      const linkProj = document.createElement("a");
      linkProj.setAttribute("href", encodedProjUri);
      linkProj.setAttribute("download", `subtrans_all_projects_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(linkProj);
      linkProj.click();
      document.body.removeChild(linkProj);
    }, 450);
  };

  const handleUploadYaml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setYamlContent(text);
    };
    reader.readAsText(file);
  };

  if (isAuthenticated === null) {
    return (
      <div className="w-full min-h-screen bg-slate-950 text-slate-300 font-sans flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Checking session logs...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="w-full min-h-screen bg-slate-950 text-slate-300 font-sans flex flex-col lg:flex-row items-stretch justify-center p-0 select-text overflow-y-auto">
        {/* Left Side: Modern Interactive Login form */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 border-b lg:border-b-0 lg:border-r border-slate-900 bg-slate-950/60 relative min-h-[450px]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500"></div>

          <div className="max-w-md w-full space-y-6">
            <div className="text-center lg:text-left space-y-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono uppercase mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> Tizim Himoyasi
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">SubTrans Admin Panel</h1>
              <p className="text-xs text-slate-400">
                Tizimning monitoring va sozlamalarni tahrirlash bo'limi. Admin hisobingizga kiring.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 bg-slate-900/80 border border-slate-800 p-6 rounded-lg shadow-2xl relative">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Foydalanuvchi nomi</label>
                <input
                  type="text"
                  placeholder="admin"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  disabled={loggingIn}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Yashirin parol</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={loggingIn}
                />
              </div>

              {loginError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold py-2.5 rounded text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 select-none"
              >
                {loggingIn ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Seans yaratilmoqda...
                  </>
                ) : (
                  <>
                    Kirish (Admin Login)
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Security Session Jurnali (Displaying recently active sessions) */}
        <div className="flex-1 bg-slate-900/20 p-6 md:p-12 flex flex-col justify-center select-text min-h-[450px]">
          <div className="max-w-2xl w-full mx-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400 animate-pulse" /> Tizimdagi Oxirgi Seanslar (Security Logs)
                </h2>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Xavfsiz monitoring • {adminSessions.length} ta faollik aniqlandi</p>
              </div>
              <button
                onClick={fetchSessionsList}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                disabled={adminSessionsLoading}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adminSessionsLoading ? 'animate-spin' : ''}`} />
                Yangilash
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-normal">
              Ushbu panelda oxirgi tizimga kirish urinishlari va ularning holati real vaqtda ko'rsatiladi. Tizim IP manzili va User-Agent'larini tekshiring.
            </p>

            <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800/60 max-h-[350px] overflow-y-auto">
              {adminSessions.map((sess, idx) => (
                <div key={sess.id || idx} className="p-3 hover:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white font-mono">{sess.id}</span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.2 rounded uppercase tracking-wider font-mono">
                        {sess.username}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full ${sess.status === 'Faol' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      IP: <span className="font-sans font-semibold text-slate-300 select-all">{sess.ip}</span> •
                      Qurilma: <span className="font-sans text-slate-500" title={sess.userAgent}>{sess.userAgent}</span>
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-[10px] font-mono text-slate-400">Kirish: {sess.loginTime}</p>
                    <p className="text-[10px] font-mono text-emerald-400 mt-0.5">Faollik: {sess.lastActive}</p>
                    <p className="mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${sess.status === 'Faol'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : sess.status === 'Chiqilgan'
                          ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                        {sess.status}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
              {adminSessions.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  Sessiyalar jurnali bo'sh.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="subtrans-dashboard" className="w-full min-h-screen bg-slate-950 text-slate-300 font-sans flex flex-col overflow-hidden select-none">
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-500 rounded flex items-center justify-center text-slate-900">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight uppercase">SubTrans AI Dashboard Team Suite</h1>
            <p className="text-[10px] text-slate-500 font-mono">v2.7.0-PRODUCTION // TEAMS & AUTO-PAY_VERIFIED</p>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">Gemini Latency</p>
              {apiHealth && apiHealth.gemini ? (
                <p className={`text-xs font-mono font-bold ${apiHealth.gemini.status === 'connected' ? 'text-emerald-500' : 'text-rose-400'}`}>
                  {apiHealth.gemini.status === 'connected' ? `${apiHealth.gemini.latency} ms` : 'Disconnected ⚠️'}
                </p>
              ) : (
                <p className="text-xs font-mono text-yellow-500 animate-pulse">Checking...</p>
              )}
            </div>
          </div>
          <div className="h-8 w-[1px] bg-slate-800"></div>
          <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded border border-slate-700">
            <div className={`w-2 h-2 rounded-full ${botToken ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <span className="text-xs font-medium text-slate-200 uppercase">
              {botToken ? 'Bot Online' : 'No Token'}
            </span>
          </div>
          <div className="h-8 w-[1px] bg-slate-800"></div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all text-xs font-semibold px-3 py-1.5 rounded border border-rose-500/20 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Boshqaruvdan Chiqish
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col bg-slate-950 max-h-full overflow-y-auto">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-800 border-b border-slate-800 shrink-0">
            <div className="bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Active Projects</p>
              <p className="text-2xl font-mono text-white">{stats.projectsCount}</p>
            </div>
            <div className="bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Users</p>
              <p className="text-2xl font-mono text-white">{stats.usersCount}</p>
            </div>
            <div className="bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Avg Batch Size</p>
              <p className="text-2xl font-mono text-white">
                {stats.settings?.defaultBatchSize || 45} <span className="text-xs text-slate-600 font-sans">L/B</span>
              </p>
            </div>
            <div className="bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Active Queue Jobs</p>
              <p className="text-2xl font-mono text-sky-400">{stats.activeJobs?.length || 0}</p>
            </div>
          </section>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[350px]">
            <div className="w-full md:w-1/2 border-r border-slate-800 flex flex-col min-h-[250px] max-h-full">
              <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center shrink-0">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-sky-400" /> Real-Time Translation Queue
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] border border-emerald-500/20">
                  {stats.activeJobs?.length || 0} active
                </span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[150px]">
                {stats.activeJobs && stats.activeJobs.length > 0 ? (
                  stats.activeJobs.map((job: any) => (
                    <div key={job.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1 pr-2">
                          <h3 className="text-xs font-semibold text-white truncate">[{job.type}] {job.title}</h3>
                          <p className="text-[9px] text-slate-500">Lines Progress: {job.batch} • User ID: {job.userId}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono text-sky-400">{job.progress}%</p>
                          <p className="text-[9px] text-slate-600 uppercase font-bold italic truncate max-w-[120px]">{job.eta}</p>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)] transition-all duration-500"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 py-12">
                    <CheckCircle2 className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-xs font-mono">Real-time queue is waiting for Telegram users...</p>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full md:w-1/2 bg-slate-900/30 flex flex-col max-h-full">
              <div className="min-h-[48px] py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
                <div className="flex flex-wrap gap-1.5 w-full">
                  <button
                    onClick={() => setActiveTab('config')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'config'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <Server className="w-3 h-3" /> Settings
                  </button>
                  <button
                    onClick={() => setActiveTab('teams')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'teams'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <Users className="w-3 h-3" /> Teams ({teams.length})
                    {pendingTeamsCount > 0 && (
                      <span className="relative flex h-2 w-2 ml-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'payments'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <CreditCard className="w-3 h-3" /> Receipts ({payments.length})
                    {pendingPaymentsCount > 0 && (
                      <span className="relative flex h-2 w-2 ml-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('yaml')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'yaml'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <Globe className="w-3 h-3" /> Localization
                  </button>
                  <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'stats'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <Activity className="w-3 h-3" /> Stats & Ratings
                  </button>
                  <button
                    onClick={() => setActiveTab('admin_users')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'admin_users'
                      ? 'bg-rose-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <ShieldAlert className="w-3 h-3" /> Admin Users
                  </button>
                  <button
                    onClick={() => setActiveTab('backups')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'backups'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <DbIcon className="w-3 h-3" /> Backups
                  </button>
                  <button
                    onClick={() => setActiveTab('subtitles')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 shrink-0 ${activeTab === 'subtitles'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800/50'
                      }`}
                  >
                    <FileText className="w-3 h-3" /> Subtitles
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'config' && (
                  <div className="space-y-4 text-left">
                    {/* Gemini API Health Status Card */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> Gemini API Health Status
                        </span>
                        <button
                          type="button"
                          onClick={fetchApiHealth}
                          className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                          disabled={apiHealthLoading}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${apiHealthLoading ? 'animate-spin' : ''}`} />
                          Tekshirish
                        </button>
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex flex-col justify-between">
                          <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Ulanish Holati</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-2 h-2 rounded-full ${apiHealth?.gemini?.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                            <span className="text-xs font-mono font-bold text-white uppercase">
                              {apiHealth?.gemini?.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex flex-col justify-between">
                          <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Kechikish (Latency)</span>
                          <span className="text-sm font-mono font-bold text-sky-400 mt-1">
                            {apiHealth?.gemini?.status === 'connected' ? `${apiHealth.gemini.latency} ms` : 'N/A'}
                          </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex flex-col justify-between">
                          <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Tizim holati (HTTP)</span>
                          <span className={`text-[11px] font-mono font-bold mt-1 uppercase ${apiHealth?.status === 'ok' || apiHealth?.gemini?.status === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {apiHealth?.status === 'ok' || apiHealth?.gemini?.status === 'connected' ? 'ONLINE (200)' : 'OFFLINE/ERROR'}
                          </span>
                        </div>
                      </div>

                      {apiHealth?.gemini?.error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded p-2.5 flex gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div className="text-[10px] font-mono text-rose-300">
                            <p className="font-bold">API ERROR DETAIL:</p>
                            <p className="select-text break-all">{apiHealth.gemini.error}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-4">
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                          <Shield className="w-3.5 h-3.5 text-sky-400" /> SubTrans Engine Keys & Limits Config
                        </h3>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Telegram Bot Token</label>
                            <span className="text-[9px] text-slate-600 font-mono">Auto-restarts connection</span>
                          </div>
                          <input
                            type="password"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                            placeholder="Telegram Bot Token"
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Gemini API Keys List</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleAddApiKey}
                                className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[10px] font-bold px-2.5 py-1 rounded border border-sky-500/20 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Plus className="w-3 h-3 text-sky-400" /> Kalit qoʻshish
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadGeminiKeys}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Download className="w-3 h-3 text-slate-300" /> JSON
                              </button>
                              <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors">
                                <Upload className="w-3 h-3 text-slate-300" /> JSON
                                <input type="file" accept=".json" onChange={handleUploadGeminiKeys} className="hidden" />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-2 max-h-40 overflow-y-auto mb-1.5 p-1.5 bg-slate-950/40 rounded border border-slate-800/60">
                            {apiKeys.map((key, index) => (
                              <div key={index} className="flex gap-2">
                                <input
                                  type="password"
                                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                                  placeholder={`API Key #${index + 1}`}
                                  value={key}
                                  onChange={(e) => handleApiKeyChange(index, e.target.value)}
                                  required={index === 0}
                                />
                                {apiKeys.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveApiKey(index)}
                                    className="text-slate-500 hover:text-rose-400 px-2.5 py-1 border border-slate-800 rounded bg-slate-900/40 hover:bg-slate-900 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                                    title="Oʻchirish / Delete"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-500 font-mono leading-relaxed">
                            Tizim kiritilgan barcha kalitlarni aylanma tartibda (Key Rotation) ishlashini ta'minlaydi. Har bir kalit alohida inputga yozilishi lozim.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">AI Model</label>
                            <select
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={aiModel}
                              onChange={(e) => setAiModel(e.target.value)}
                            >
                              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                              <option value="gemini-2.5-flash-lite-preview-06-17">gemini-2.5-flash-lite</option>
                              <option value="gemini-2.0-flash">gemini-2.0-flash (Default)</option>
                              <option value="gemini-2.5-flash-preview-05-20">gemini-2.5-flash-preview</option>
                              <option value="gemma-3-27b-it">gemma-3-27b-it</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Default Batch Size (Lines/Req)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={defaultBatchSize}
                              onChange={(e) => setDefaultBatchSize(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Telegram API ID (.env)</label>
                            <input
                              type="text"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={telegramApiId}
                              onChange={(e) => setTelegramApiId(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Telegram API Hash (.env)</label>
                            <input
                              type="text"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={telegramApiHash}
                              onChange={(e) => setTelegramApiHash(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                          <Code className="w-3.5 h-3.5 text-sky-400" /> Active System Prompt Guidelines
                        </h3>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Global Translation System Instruction</label>
                          <textarea
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-sans h-24 resize-none leading-relaxed"
                            placeholder="Uslublarni saqlagan holda o'zbek tiliga tarjima qiling..."
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-extrabold text-xs h-9 rounded flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider transition-colors"
                      >
                        <Save className="w-3.5 h-3.5 text-slate-950" />
                        Save Settings & Restart Bot
                      </button>

                      {configSaveSuccess && (
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Configuration and System Prompt saved! Active Telegram Bot restarted!</span>
                        </div>
                      )}
                    </form>

                    {/* Telegram User Account Client Pairing Wizard */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                        <Users className="w-3.5 h-3.5 text-sky-400" /> Telegram User Akkauntini Ulash
                      </h3>

                      <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                        Katta hajmli MKV metallarini to'g'ridan-to'g'ri storage kanalga yuklash uchun foydalanuvchi akkauntini ulang. Bu sizga bot cheklovlarini aylanib o'tish imkonini beradi.
                      </p>

                      {telegramError && (
                        <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-800 p-2 rounded">
                          {telegramError}
                        </div>
                      )}

                      {telegramStatus.status === 'DISCONNECTED' && (
                        <div className="space-y-3">
                          {/* Login Method Toggle */}
                          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setLoginMethod('phone')}
                              className={`flex-1 text-center py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                                loginMethod === 'phone'
                                  ? 'bg-sky-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              📞 Telefon raqami
                            </button>
                            <button
                              type="button"
                              onClick={() => setLoginMethod('qr')}
                              className={`flex-1 text-center py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                                loginMethod === 'qr'
                                  ? 'bg-sky-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              📷 QR Kod orqali
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">API ID</label>
                              <input
                                type="text"
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                                placeholder="2040..."
                                value={telegramApiId}
                                onChange={(e) => setTelegramApiId(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">API Hash</label>
                              <input
                                type="text"
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                                placeholder="b184c..."
                                value={telegramApiHash}
                                onChange={(e) => setTelegramApiHash(e.target.value)}
                              />
                            </div>
                          </div>

                          {loginMethod === 'phone' ? (
                            <>
                              <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Telefon raqami (xalqaro formatda)</label>
                                <input
                                  type="text"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                                  placeholder="+998901234567"
                                  value={telegramPhone}
                                  onChange={(e) => setTelegramPhone(e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={telegramLoading}
                                onClick={handleSendTelegramCode}
                                className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 px-3.5 py-1.8 text-xs font-bold rounded cursor-pointer uppercase tracking-wider transition-colors"
                              >
                                {telegramLoading ? 'Yuborilmoqda...' : 'Tasdiqlash kodini yuborish'}
                              </button>
                            </>
                          ) : (
                            <div className="space-y-3 pt-2">
                              {qrSessionId ? (
                                <div className="flex flex-col items-center justify-center p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3 text-center">
                                  {qrStatus === 'NEEDS_2FA' ? (
                                    <div className="w-full space-y-3 text-left">
                                      <div className="text-xs text-amber-500 font-mono">
                                        QR kod skanerlandi. Akkaunt 2FA paroli bilan himoyalangan. Parolingizni kiriting:
                                      </div>
                                      <div>
                                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">2FA Paroli</label>
                                        <input
                                          type="password"
                                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                                          placeholder="2FA parolini kiriting"
                                          value={telegramPassword}
                                          onChange={(e) => setTelegramPassword(e.target.value)}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        disabled={telegramLoading}
                                        onClick={handleQrVerify2fa}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 px-3.5 py-1.5 text-xs font-bold rounded cursor-pointer uppercase transition-colors"
                                      >
                                        {telegramLoading ? 'Tasdiqlanmoqda...' : 'Tasdiqlash'}
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      {qrUrl ? (
                                        <div className="p-3 bg-white rounded-lg shadow-lg shadow-sky-500/10">
                                          <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                                            alt="Telegram Login QR Code"
                                            className="w-[180px] h-[180px]"
                                          />
                                        </div>
                                      ) : (
                                        <div className="w-[180px] h-[180px] flex items-center justify-center bg-slate-900 border border-slate-800 rounded-lg">
                                          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                      )}
                                      <div className="space-y-1">
                                        <div className="text-xs font-bold text-sky-400 font-sans">Telegram ilovangizdan skanerlang</div>
                                        <div className="text-[10px] text-slate-400 leading-normal font-sans">
                                          Sozlamalar &gt; Qurilmalar &gt; Qurilmani ulash bo'limiga o'ting va ushbu QR kodni skanerlang.
                                        </div>
                                        <div className="text-[10px] text-amber-400 animate-pulse pt-1 font-mono">
                                          Holat: {qrStatus === 'SCANNING' ? 'Skanerlanishi kutilmoqda...' : 'QR kod tayyorlanmoqda...'}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={handleCancelQrLogin}
                                    className="text-slate-400 hover:text-rose-400 text-xs py-1 cursor-pointer underline"
                                  >
                                    Bekor qilish
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={telegramLoading}
                                  onClick={handleStartQrLogin}
                                  className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 px-3.5 py-2 text-xs font-bold rounded cursor-pointer uppercase tracking-wider transition-colors"
                                >
                                  {telegramLoading ? 'Yuklanmoqda...' : 'QR Kodni Ko\'rsatish'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {telegramStatus.status === 'AWAITING_CODE' && (
                        <div className="space-y-3">
                          <div className="text-xs text-amber-400 font-mono">
                            Kutilmoqda: Tasdiqlash ko'di yuborildi. Iltimos, Telegram ilovangizga kelgan 5 xonali kodni kiriting.
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">SMS/Telegram kod</label>
                            <input
                              type="text"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Kodni kiriting"
                              value={telegramCode}
                              onChange={(e) => setTelegramCode(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={telegramLoading}
                              onClick={handleVerifyTelegramCode}
                              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3.5 py-1.5 text-xs font-bold rounded cursor-pointer uppercase transition-colors"
                            >
                              Kodni tekshirish
                            </button>
                            <button
                              type="button"
                              onClick={handleDisconnectTelegram}
                              className="text-slate-400 hover:text-rose-400 text-xs py-1.5 cursor-pointer underline"
                            >
                              Bekor qilish
                            </button>
                          </div>
                        </div>
                      )}

                      {telegramStatus.status === 'AWAITING_2FA' && (
                        <div className="space-y-3">
                          <div className="text-xs text-amber-500 font-mono">
                            Ushbu akkaunt ikki bosqichli tasdiqlash (2FA) paroli bilan himoyalangan. Parolingizni kiriting:
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">2FA Paroli</label>
                            <input
                              type="password"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="2FA parolini kiriting"
                              value={telegramPassword}
                              onChange={(e) => setTelegramPassword(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={telegramLoading}
                              onClick={handleVerifyTelegram2fa}
                              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3.5 py-1.5 text-xs font-bold rounded cursor-pointer uppercase"
                            >
                              2FA parolini tasdiqlash
                            </button>
                            <button
                              type="button"
                              onClick={handleDisconnectTelegram}
                              className="text-slate-400 hover:text-rose-400 text-xs py-1.5 underline"
                            >
                              Bekor qilish
                            </button>
                          </div>
                        </div>
                      )}

                      {telegramStatus.status === 'CONNECTED' && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg p-3 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <div className="text-xs font-bold font-mono">
                              Akkaunt Ulangan: {telegramStatus.phone}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleDisconnectTelegram}
                            className="text-[10px] uppercase bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 px-2.5 py-1.2 rounded font-extrabold cursor-pointer transition-colors"
                          >
                            Akkauntni uzish
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Automatic Downloader Configuration settings */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                        <Code className="w-3.5 h-3.5 text-sky-400" /> Avtomatik Yuklovchi Sozlamalari
                      </h3>

                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
                          <div>
                            <span className="block text-xs font-bold text-white uppercase font-mono">Avtomatik yuklashni yoqish</span>
                            <span className="text-[9px] text-slate-500 font-mono">Anime yangi chiqqanida torrent mkv yuklanadi va o'zbekchalashtiriladi</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAutoDownloadEnabled(!autoDownloadEnabled)}
                            className={`w-11 h-6 rounded-full p-1 transition-colors ${autoDownloadEnabled ? 'bg-sky-500' : 'bg-slate-800'}`}
                          >
                            <div className={`bg-slate-950 w-4 h-4 rounded-full shadow transition-transform ${autoDownloadEnabled ? 'translate-x-5' : ''}`} />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Storage Channel (Kanal ID)</label>
                          <input
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                            placeholder="Masalan: @my_anim_storage yoki -1002345678"
                            value={storageChannelId}
                            onChange={(e) => setStorageChannelId(e.target.value)}
                          />
                          <p className="text-[9px] text-slate-500 mt-1 font-mono leading-relaxed">
                            Barcha yuklangan va o'girilgan mkv/subtitrlar ushbu kanalga joylanadi hamda userlar nomidan yuboriladi.
                          </p>
                        </div>

                        <button
                          onClick={handleSaveConfig}
                          className="bg-sky-500 hover:bg-sky-600 text-slate-950 text-xs font-extrabold px-4 py-2 rounded uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Sozlamalarni saqlash
                        </button>
                      </div>
                    </div>

                    {/* Tariff & Billing Card details configuration */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4 animate-none">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Tariflar, billing va to'lov karta sozlamalari
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Karta Raqami (Chek yuborish uchun)</label>
                          <input
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            placeholder="Masalan: 8600 0000 0000 0000"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Karta Egasi</label>
                          <input
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            placeholder="Masalan: Sherzodbek To'xtasinov"
                            value={cardOwner}
                            onChange={(e) => setCardOwner(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2 mt-2">
                        <span className="block text-[10px] uppercase font-bold text-slate-400 font-mono mb-2">Mavjud Tarif va Paketlar Ro'yxati ({packages.length})</span>

                        {packages.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded font-mono">
                            Hozircha hech qanday paket yaratilmagan. Iltimos, pastdan yangisini qo'shing.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {packages.map((pack) => (
                              <div key={pack.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col justify-between relative space-y-2 font-mono">
                                <div>
                                  <div className="text-xs font-bold text-white flex justify-between items-center">
                                    <span>{pack.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePackage(pack.id)}
                                      className="text-rose-400 hover:text-rose-500 text-[10px] font-bold p-1 hover:bg-rose-500/10 rounded cursor-pointer transition-colors"
                                    >
                                      O'chirish
                                    </button>
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-1 space-y-1">
                                    <div>Turi: <span className="text-emerald-400 font-bold">{
                                      pack.type === 'tokens' ? 'Token (Qo\'lda tarjima)' :
                                        pack.type === 'package' ? 'Obuna Paketi' :
                                          pack.type.startsWith('monthly_') ? 'Obuna (Legacy)' : pack.type
                                    }</span></div>
                                    <div>Qiymati: <span className="text-sky-400">{pack.value?.toLocaleString()} {pack.type === 'tokens' ? 'token' : 'subtitle'}</span></div>
                                    <div className="text-xs text-white font-bold mt-1.5 pt-1.5 border-t border-slate-900">Narxi: <span className="text-amber-400">{pack.price}</span></div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add new package form inline */}
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <span className="block text-[10px] uppercase font-bold text-slate-300 font-mono">➕ Yangi Tarif/Paket Qo'shish</span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Paket Nomi</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: Boshlang'ich"
                              value={newPackName}
                              onChange={(e) => setNewPackName(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Paket Turi</label>
                            <select
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={newPackType}
                              onChange={(e) => setNewPackType(e.target.value)}
                            >
                              <option value="tokens">Tokenlar (Qo'lda tarjima qilish)</option>
                              <option value="package">Obuna Paketi (Kun/Oy)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Maksimal limit/qiymat</label>
                            <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: 10"
                              value={newPackValue}
                              onChange={(e) => setNewPackValue(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Narxi (Tekst shaklda)</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: 50,000 O'zS"
                              value={newPackPrice}
                              onChange={(e) => setNewPackPrice(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Amal qilish muddati (kun)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Bo'sh=cheksiz"
                              value={newPackDays}
                              onChange={(e) => setNewPackDays(e.target.value)}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleAddPackage}
                          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs px-3.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Paketni unga qo'shish
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center bg-slate-950/20 p-2 rounded">
                        <p className="text-[9px] text-slate-500 font-mono leading-relaxed">Billing va kartaga oid o'zgarishlarni bevosita saqlash uchun o'ngdagi tugmani bosing:</p>
                        <button
                          onClick={handleSaveConfig}
                          className="bg-sky-500 hover:bg-sky-600 text-slate-950 text-xs font-bold px-4 py-2 rounded uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Karta va Tariflarni Saqlash
                        </button>
                      </div>

                      <div className="pt-2 mt-2 flex flex-wrap gap-2 rounded">
                        <button
                          onClick={handleExportConfig}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 transition-colors border border-slate-700"
                        >
                          <Download className="w-3.5 h-3.5" /> Barcha Sozlamalarni Eksport Qilish (.json)
                        </button>
                        <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-700">
                          <Upload className="w-3.5 h-3.5" /> Sozlamalarni Import Qilish
                          <input type="file" accept=".json" onChange={handleImportConfig} className="hidden" />
                        </label>
                      </div>
                    </div>


                    {/* PROMOCODES SECTION */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                        🎁 Promokodlar Tizimi
                      </h3>

                      {promoError && (
                        <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-800 p-2 rounded">
                          {promoError}
                        </div>
                      )}

                      <div className="space-y-2 mt-2">
                        <span className="block text-[10px] uppercase font-bold text-slate-400 font-mono mb-2">Mavjud Promokodlar ({promocodes.length})</span>
                        {promocodes.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded font-mono">
                            Hozircha hech qanday promokod yaratilmagan.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {promocodes.map((promo) => (
                              <div key={promo.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col justify-between relative space-y-2 font-mono">
                                <div>
                                  <div className="text-xs font-bold text-white flex justify-between items-center">
                                    <span className="text-emerald-400">{promo.code}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePromocode(promo.id)}
                                      className="text-rose-400 hover:text-rose-500 text-[10px] font-bold p-1 hover:bg-rose-500/10 rounded cursor-pointer transition-colors"
                                    >
                                      O'chirish
                                    </button>
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-1 space-y-1">
                                    <div>Turi: <span className="text-sky-400 font-bold">{promo.type}</span></div>
                                    <div>Qiymati: <span className="text-sky-400">{promo.value}</span></div>
                                    <div>Muddat (kun): <span className="text-amber-400">{promo.days ? promo.days : 'Cheksiz'}</span></div>
                                    <div>Ishlatilgan: <span className="text-slate-300">{promo.usedBy.length} / {promo.maxUses === 0 ? 'Cheksiz' : promo.maxUses} marta</span></div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <span className="block text-[10px] uppercase font-bold text-slate-300 font-mono">➕ Yangi Promokod Qo'shish</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Kod Nomi</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono uppercase"
                              placeholder="Masalan: NEWYEAR2026"
                              value={newPromoCode}
                              onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Turi</label>
                            <select
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={newPromoType}
                              onChange={(e) => setNewPromoType(e.target.value)}
                            >
                              <option value="tokens">Tokenlar</option>
                              <option value="package">Paket/Obuna</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Qiymati / Limiti</label>
                            <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={newPromoValue}
                              onChange={(e) => setNewPromoValue(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Kun (Bo'sh=Cheksiz)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              value={newPromoDays}
                              onChange={(e) => setNewPromoDays(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Ishlatish Limiti (0=cheksiz)</label>
                            <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="1"
                              value={newPromoMaxUses}
                              onChange={(e) => setNewPromoMaxUses(e.target.value)}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddPromocode}
                          className="bg-sky-500 hover:bg-sky-600 text-slate-950 font-extrabold text-xs px-3.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Promokod Yaratish
                        </button>
                      </div>
                    </div>


                    {/* Anime Pipeline Live Queue Status */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4 mb-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> Anime Navbat Holati (So'nggi 25 tasi)
                        </h3>
                        <button
                          onClick={fetchAutomatedAnimes}
                          className="text-[9px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-bold border border-slate-700"
                        >
                          Yangilash
                        </button>
                      </div>

                      {!Array.isArray(automatedAnimes) || automatedAnimes.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500 font-mono">
                          Hozircha navbatda faol loyihalar yo'q. Yangi animalar chiqishlarini kutmoqda.
                        </div>
                      ) : (
                        <div className="space-y-3 font-mono">
                          {Array.isArray(automatedAnimes) && automatedAnimes.map((item) => (
                            <div key={item.id} className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg space-y-2">
                              <div className="flex justify-between items-start flex-wrap gap-1">
                                <div>
                                  <div className="text-xs font-bold text-white">{item.title}</div>
                                  <div className="text-[9px] text-slate-500">Epizod: {item.episode} | Yaratildi: {new Date(item.createdAt).toLocaleTimeString()}</div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${item.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  item.status === 'TRANSLATING' ? 'bg-sky-500/10 text-sky-400 border border-sky-505/20 animate-pulse' :
                                    item.status === 'DOWNLOADING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                      'bg-slate-850 text-slate-400 border border-slate-800'
                                  }`}>
                                  {item.status} ({item.progress}%)
                                </span>
                              </div>

                              <div className="text-[9px] text-sky-300 space-y-1 bg-slate-900/60 p-2 rounded border border-slate-900/80">
                                {item.quality && <div>🎞 <span className="text-slate-500">Sifat:</span> <span className="font-bold text-amber-400">{item.quality}</span> {item.sizeBytes ? `(${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB)` : ''}</div>}
                                <div>📝 <span className="text-slate-500">Sub File:</span> <span className="select-all">{item.subName}</span></div>
                                <div>🎬 <span className="text-slate-500">MKV Name:</span> <span className="select-all">{item.mkvName}</span></div>
                                {item.magnet && (
                                  <div className="truncate">🧲 <span className="text-slate-500">Magnet:</span> <span className="text-slate-400 select-all" title={item.magnet}>{item.magnet.substring(0, 45)}...</span></div>
                                )}
                                {item.subLink && (
                                  <div>🔗 <span className="text-slate-500">Kanal Havolasi:</span> <a href={item.subLink} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">Telegram Link</a></div>
                                )}
                              </div>

                              {item.status !== 'COMPLETED' && (
                                <div className="space-y-1">
                                  <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                                    <div className="bg-sky-500 h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                                  </div>
                                  <div className="flex justify-between text-[8px] text-slate-500">
                                    <span>Progress: {item.progress}%</span>
                                    <span>ETA: {item.eta}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* MAJBURIY OBUNA (MANDATORY CHANNELS) SECTION */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-left mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                        <Users className="w-3.5 h-3.5 text-sky-400" /> Majburiy Obuna Kanallari (Mandatory Channels)
                      </h3>

                      {mandatoryChannelsLoading && mandatoryChannels.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-500 font-mono">
                          Kanallar ro'yxati yuklanmoqda...
                        </div>
                      ) : (
                        <div className="space-y-2 mt-2">
                          <span className="block text-[10px] uppercase font-bold text-slate-400 font-mono mb-2">Mavjud Kanallar ({mandatoryChannels.length})</span>
                          {mandatoryChannels.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded font-mono">
                              Hozircha hech qanday kanal majburiy obunaga qo'shilmagan.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {mandatoryChannels.map((chan: any) => (
                                <div key={chan.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col justify-between relative space-y-2 font-mono">
                                  <div>
                                    <div className="text-xs font-bold text-white flex justify-between items-center">
                                      <span className="text-emerald-400 truncate max-w-[120px]" title={chan.title}>{chan.title}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteChannel(chan.id)}
                                        className="text-rose-400 hover:text-rose-500 text-[10px] font-bold p-1 hover:bg-rose-500/10 rounded cursor-pointer transition-colors"
                                      >
                                        O'chirish
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-1 space-y-1">
                                      <div className="truncate">ID: <span className="text-sky-400 select-all">{chan.id}</span></div>
                                      <div className="truncate">Havola: <a href={chan.inviteLink} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline truncate max-w-[150px] inline-block align-bottom">{chan.inviteLink}</a></div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <form onSubmit={handleAddChannel} className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <span className="block text-[10px] uppercase font-bold text-slate-300 font-mono">➕ Yangi Kanal Qo'shish</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Kanal Nomi</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: VoiPlayStudio"
                              value={newChanTitle}
                              onChange={(e) => setNewChanTitle(e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Kanal ID (Channel ID)</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: -100123456789"
                              value={newChanId}
                              onChange={(e) => setNewChanId(e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase font-bold text-slate-500 font-mono mb-1">Havola (Invite / Join request link)</label>
                            <input
                              type="text"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                              placeholder="Masalan: https://t.me/+AbCdEfGh"
                              value={newChanInvite}
                              onChange={(e) => setNewChanInvite(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="bg-sky-500 hover:bg-sky-600 text-slate-950 font-extrabold text-xs px-3.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Kanalni qo'shish
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === 'teams' && (
                  <div className="space-y-4 text-left">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-sky-400" /> Team Applications Pending and Approved status
                      </h3>
                      <button
                        onClick={fetchTeams}
                        className="text-[10px] bg-slate-800/50 hover:bg-slate-850 px-2.5 py-1.2 text-xs border border-slate-700 rounded text-slate-300 flex items-center gap-1 animate-none cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh list
                      </button>
                    </div>

                    {teamsLoading ? (
                      <div className="py-12 text-center text-xs text-slate-500 font-mono">Teams loading...</div>
                    ) : teams.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-500 font-mono">Hali birorta ham jamoa yaratilmagan.</div>
                    ) : (
                      <div className="space-y-3">
                        {teams.map((team) => (
                          <div key={team.id} className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
                            <div className="flex justify-between items-start flex-wrap gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                  {team.name}
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${team.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    team.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>
                                    {team.status}
                                  </span>
                                </h4>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">Kod: <span className="text-sky-400 font-bold">{team.id}</span> • Admin: ID #{team.ownerId}</p>
                              </div>

                              <div className="flex gap-2">
                                {team.status === 'PENDING' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingTeamId(team.id);
                                        setEditTokens(1000);
                                        setEditConcurrency(2);
                                      }}
                                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-[10px] h-7 px-3 rounded uppercase flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" /> Ruxsat Berish
                                    </button>
                                    <button
                                      onClick={() => handleUpdateTeamStatus(team.id, 'BLOCKED')}
                                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-extrabold text-[10px] h-7 px-3 rounded uppercase flex items-center gap-1 border border-rose-500/20 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" /> Rad Etish
                                    </button>
                                  </>
                                )}
                                {team.status === 'APPROVED' && (
                                  <button
                                    onClick={() => handleUpdateTeamStatus(team.id, 'BLOCKED')}
                                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-extrabold text-[10px] h-7 px-3 rounded uppercase flex items-center gap-1 border border-rose-500/20 cursor-pointer"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5" /> Bloklash
                                  </button>
                                )}
                                {team.status === 'BLOCKED' && (
                                  <button
                                    onClick={() => handleUpdateTeamStatus(team.id, 'APPROVED', team.tokens, team.maxConcurrentJobs)}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-[10px] h-7 px-3 rounded uppercase flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Blokdan Chiqish
                                  </button>
                                )}
                              </div>
                            </div>

                            {editingTeamId === team.id && (
                              <div className="p-3 bg-slate-950 border border-slate-800 rounded-md space-y-3">
                                <h5 className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">Jamoaning boshlang'ich limitlarini sozlang:</h5>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">Boshlang'ich Tokenlar</label>
                                    <input
                                      type="number"
                                      className="w-full bg-slate-900 border border-slate-800 text-xs px-2 py-1.5 focus:outline-none focus:border-sky-500 font-mono text-white rounded"
                                      value={editTokens}
                                      onChange={(e) => setEditTokens(Number(e.target.value))}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">Maksimal Parallel Sloti</label>
                                    <select
                                      className="w-full bg-slate-900 border border-slate-800 text-xs px-2 py-1.5 focus:outline-none focus:border-sky-500 font-mono text-white rounded"
                                      value={editConcurrency}
                                      onChange={(e) => setEditConcurrency(Number(e.target.value))}
                                    >
                                      <option value={1}>1 ta parallel slot</option>
                                      <option value={2}>2 ta parallel slot</option>
                                      <option value={3}>3 ta parallel slot</option>
                                      <option value={4}>4 ta parallel slot</option>
                                      <option value={5}>5 ta parallel slot</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleUpdateTeamStatus(team.id, 'APPROVED', editTokens, editConcurrency)}
                                    className="bg-sky-500 text-slate-950 text-[10px] font-extrabold h-7 px-3 rounded uppercase hover:bg-sky-600 transition-colors cursor-pointer"
                                  >
                                    Tasdiqlash
                                  </button>
                                  <button
                                    onClick={() => setEditingTeamId(null)}
                                    className="bg-slate-850 text-slate-300 text-[10px] h-7 px-3 rounded hover:bg-slate-800 cursor-pointer"
                                  >
                                    Yopish
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded text-[11px] font-mono">
                              <div>
                                <span className="text-slate-500 block text-[9px]">Guruh Kanal:</span>
                                <a href={team.channelLink} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline truncate block">{team.channelLink || 'Nomalum'}</a>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px]">Balans:</span>
                                <span className="text-white font-bold">{team.tokens} token</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[9px]">Parallel / A'zolar:</span>
                                <span className="text-white">{team.maxConcurrentJobs} ta slot / {team.members?.length || 0} kishi</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'payments' && (
                  <div className="space-y-4 text-left font-sans">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-sky-400" /> Payment & Screenshot Transactions Verification Queue
                      </h3>
                      <button
                        onClick={fetchPayments}
                        className="text-[10px] bg-slate-800/50 hover:bg-slate-850 px-2.5 py-1.2 text-xs border border-slate-700 rounded text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh
                      </button>
                    </div>

                    {paymentsLoading ? (
                      <div className="py-12 text-center text-xs text-slate-500 font-mono">Payments loading...</div>
                    ) : payments.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-500 font-mono">Xozircha hech qanday to'lovlar yuklanmagan.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {payments.map((p) => (
                          <div key={p.id} className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col sm:flex-row gap-4 justify-between items-start">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white capitalize">{p.packName}</span>
                                <span className={`px-2 py-0.2 rounded text-[8px] font-bold ${p.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  p.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}>
                                  {p.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono">Foydalanuvchi: ID #{p.userId} • Jamoa: **{p.teamId}**</p>
                              <div className="text-[11px] font-mono grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-950/40 p-2 rounded">
                                <div><span className="text-slate-500 text-[9px]">Mablag':</span> <span className="text-white font-bold">{p.price}</span></div>
                                <div><span className="text-slate-500 text-[9px]">Token Qiymati:</span> <span className="text-white font-bold">+{p.value} token</span></div>
                                <div><span className="text-slate-500 text-[9px]">Vaqt:</span> <span className="text-white font-bold">{p.createdAt ? p.createdAt.slice(11, 19) + ' ' + p.createdAt.slice(0, 10) : 'N/A'}</span></div>
                              </div>
                            </div>

                            {/* Show Image preview block */}
                            {p.screenshot && (
                              <div className="flex flex-col items-center shrink-0 w-24 gap-1.5">
                                <div className="text-[9px] font-mono text-slate-500 uppercase">Payment Receipt</div>
                                <div className="w-20 h-24 bg-slate-950 border border-slate-800 rounded overflow-hidden relative group">
                                  <img
                                    className="w-full h-full object-cover"
                                    src={`/api/telegram-file/${p.screenshot}`}
                                    alt="Chek"
                                    referrerPolicy="no-referrer"
                                  />
                                  <button
                                    onClick={() => setPreviewImage(`/api/telegram-file/${p.screenshot}`)}
                                    className="absolute inset-0 bg-slate-950/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded text-sky-400 text-xs"
                                  >
                                    <Eye className="w-4 h-4" /> Check
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-row sm:flex-col gap-2 shrink-0 self-stretch sm:justify-center">
                              {p.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(p.id)}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-[10px] h-8 px-3 rounded uppercase flex items-center justify-center gap-1 cursor-pointer flex-1"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Tasdiqlash
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayment(p.id)}
                                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-extrabold text-[10px] h-8 px-3 border border-rose-500/20 rounded uppercase flex items-center justify-center gap-1 cursor-pointer flex-1"
                                  >
                                    <X className="w-3.5 h-3.5" /> Rad Qilish
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'yaml' && (
                  <div className="space-y-4 flex flex-col h-full text-left font-sans">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2 flex-wrap gap-2">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-sky-400" /> Localization Files Manager
                        </h3>
                        <button
                          onClick={() => setIsAddingLang(!isAddingLang)}
                          className="text-[10px] bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded px-2 py-1 font-bold flex items-center gap-1 border border-sky-500/20 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Language
                        </button>
                      </div>

                      {isAddingLang && (
                        <form onSubmit={handleCreateLocale} className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Til kodi (masalan: en, ru, tr)"
                            className="bg-slate-900 border border-slate-800 text-xs text-white rounded px-2 py-1 flex-1 focus:outline-none focus:border-sky-500 font-mono lowercase"
                            value={newLangCode}
                            onChange={(e) => setNewLangCode(e.target.value)}
                            required
                          />
                          <button
                            type="submit"
                            className="bg-sky-500 text-slate-950 text-[10px] font-extrabold h-7 px-3 rounded uppercase hover:bg-sky-600 transition-colors cursor-pointer"
                          >
                            Create
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddingLang(false)}
                            className="bg-slate-800 text-slate-300 text-[10px] h-7 px-3 rounded hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </form>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {locales.map((loc) => (
                          <div
                            key={loc.name}
                            onClick={() => setSelectedLang(loc.lang)}
                            className={`p-2.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${selectedLang === loc.lang
                              ? 'bg-sky-500/10 border-sky-500/40 text-sky-400 font-bold'
                              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono uppercase">{loc.lang}.yaml</span>
                              {loc.lang !== 'uz' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteYaml(loc.lang);
                                  }}
                                  className="text-slate-600 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                                  title="Delete localization file"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-600 font-mono mt-1">{(loc.size / 1024).toFixed(1)} KB</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col space-y-2">
                      <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                          <Code className="w-3.5 h-3.5 text-sky-500" /> Editing: <span className="text-white font-mono">{selectedLang}.yaml</span>
                        </span>
                        <div className="flex gap-2">
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer select-none border border-slate-700">
                            <Upload className="w-3 h-3" /> Upload File
                            <input type="file" accept=".yaml,.yml" onChange={handleUploadYaml} className="hidden" />
                          </label>
                          <button
                            onClick={handleDownloadYaml}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer border border-slate-700"
                          >
                            <Download className="w-3 h-3" /> Download Link
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="w-full flex-1 bg-slate-950 border border-slate-800 rounded p-3 font-mono text-[10px] text-slate-300 leading-relaxed focus:outline-none focus:border-sky-500 h-[220px]"
                        value={yamlContent}
                        onChange={(e) => setYamlContent(e.target.value)}
                        placeholder="Til kalitlari..."
                      />

                      <button
                        onClick={handleSaveYaml}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-extrabold text-xs h-9 rounded flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider transition-colors"
                      >
                        <Save className="w-3.5 h-3.5 text-slate-950" /> Save Locale & Validate Schema
                      </button>

                      {yamlSaveSuccess && (
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2 font-sans">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Muntazam tekshiruv muvaffaqiyatli yakunlandi! Til sozlamalari yangilandi.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'stats' && (
                  <div className="space-y-4 text-left font-sans">
                    <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-tight">Tizim Statistikasi va Tahlillar</h3>
                        <p className="text-[10px] text-slate-500 font-mono">Xisobotlarni yuklab olish yoki ko'rish</p>
                      </div>
                      <button
                        onClick={handleDownloadStatsCSV}
                        className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold h-8 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Jamoalar va Loyihalar ma'lumotlarini CSV shaklida yuklab olish"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-950" />
                        Yuklab olish (CSV)
                      </button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
                      <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Foydalanuvchilar</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-xl font-bold text-white font-mono">{stats.usersCount}</span>
                          <span className="text-[9px] text-emerald-500 font-mono">Faol</span>
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Tarjima Tezligi</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-xl font-bold text-sky-400 font-mono">24.8 s/p</span>
                          <span className="text-[9px] text-sky-500 font-mono">O'rtacha</span>
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">O'rtacha Baholash</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-xl font-bold text-yellow-500 font-mono">
                            {(stats as any).ratingsMetrics?.average || '5.0'} ⭐
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {(stats as any).ratingsMetrics?.totalCount || 0} ta baho
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Jami Loyihalar</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-xl font-bold text-violet-400 font-mono">{stats.projectsCount}</span>
                          <span className="text-[9px] text-violet-500 font-mono">{stats.episodesCount} qismlar</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Ratings Distribution progress */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3 flex flex-col justify-between">
                        <h3 className="text-xs font-bold uppercase text-slate-200 border-b border-slate-800 pb-2 flex justify-between items-center">
                          <span>Baholar Taqsimoti (Recharts)</span>
                          <span className="text-[9px] text-slate-500 capitalize font-normal">Rating distribution analytics</span>
                        </h3>
                        <div className="h-52 w-full mt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              layout="vertical"
                              data={['5', '4', '3', '2', '1'].map((star) => {
                                const count = (stats as any).ratingsMetrics?.distribution?.[star] || 0;
                                return {
                                  name: `${star} ★`,
                                  "Baho soni": count
                                };
                              })}
                              margin={{ top: 5, right: 30, left: -20, bottom: 5 }}
                            >
                              <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px' }}
                                labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                itemStyle={{ color: '#fbbf24', fontSize: '11px' }}
                                cursor={{ fill: '#1e293b', opacity: 0.3 }}
                              />
                              <Bar dataKey="Baho soni" radius={[0, 4, 4, 0]}>
                                {['5', '4', '3', '2', '1'].map((star, index) => {
                                  // Color scale for star values: high ratings get bright gold, lower get muted colors
                                  const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fef08a', '#94a3b8'];
                                  return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Top Active Teams list */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <h3 className="text-xs font-bold uppercase text-slate-200 border-b border-slate-800 pb-2">
                          Eng Faol Jamoalar
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] font-mono text-left">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                <th className="py-1">Jamoa nomi</th>
                                <th className="py-1 text-center">Loyihalar</th>
                                <th className="py-1 text-center">A'zolar</th>
                                <th className="py-1 text-right">Balans</th>
                              </tr>
                            </thead>
                            <tbody>
                              {((stats as any).activeTeams || []).map((t: any) => (
                                <tr key={t.id} className="border-b border-slate-900/50 text-slate-300">
                                  <td className="py-1.5 font-bold text-white shrink-0 max-w-[120px] truncate">{t.name}</td>
                                  <td className="py-1.5 text-center text-sky-400">{t.projectsCount}</td>
                                  <td className="py-1.5 text-center text-slate-400">{t.membersCount}</td>
                                  <td className="py-1.5 text-right font-semibold text-emerald-400">{t.tokens} T</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Full reviews ledger */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <h3 className="text-xs font-bold uppercase text-slate-200 border-b border-slate-800 pb-2">
                        Foydalanuvchilar Fikr-mulohazalari va Baholari
                      </h3>
                      <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2">
                        {((stats as any).ratingsMetrics?.all || []).length > 0 ? (
                          [...(stats as any).ratingsMetrics?.all].reverse().map((r: any) => (
                            <div key={r.id} className="bg-slate-950/80 p-2.5 rounded border border-slate-800/60 flex items-center justify-between text-xs font-mono">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-bold">@{r.username}</span>
                                  <span className="text-[10px] text-slate-600">{new Date(r.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Loyiha ID: <span className="text-sky-400">{r.projectId}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-yellow-500 font-bold font-sans">
                                  {"★".repeat(r.rating || 5)}{"☆".repeat(5 - (r.rating || 5))}
                                </span>
                                <span className="text-slate-500">({r.rating || 5})</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-slate-600 font-mono py-6 text-xs">
                            Hali hech qanday baholash olingani yo'q.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'admin_users' && (
                  <div className="space-y-4 text-left font-sans">
                    {/* Fast administration actions grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Token Balances Modifier */}
                      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-3">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                          <Plus className="w-3.5 h-3.5 text-emerald-400" /> Jamoa Token Balansini O'zgartirish
                        </h3>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Jamoa token miqdorini tahrirlash. Musbat yoki manfiy o'zgarishni tanlang. Jamoa egasiga xabarnoma boradi.
                        </p>
                        <div className="space-y-2">
                          {teams.map((team: any) => (
                            <div key={team.id} className="bg-slate-950 p-2 border border-slate-900 rounded flex items-center justify-between gap-1.5 font-mono text-[11px]">
                              <span className="text-white font-bold truncate max-w-[120px]">{team.name}</span>
                              <span className="text-emerald-400 shrink-0">{team.tokens} T</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  placeholder="Soni..."
                                  className="bg-slate-900 border border-slate-800 text-xs text-white rounded px-1.5 py-0.5 w-16 text-right font-mono"
                                  value={tokenAdjustment[team.id] || ''}
                                  onChange={(e) => setTokenAdjustment({ ...tokenAdjustment, [team.id]: e.target.value })}
                                />
                                <button
                                  onClick={() => handleAlterTokens(team.id, true)}
                                  className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[10px] px-1.5 py-0.5 rounded font-extrabold cursor-pointer h-6 flex items-center"
                                  title="Add Tokens"
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => handleAlterTokens(team.id, false)}
                                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] px-1.5 py-0.5 rounded font-extrabold cursor-pointer h-6 flex items-center"
                                  title="Deduct Tokens"
                                >
                                  -
                                </button>
                              </div>
                            </div>
                          ))}
                          {teams.length === 0 && (
                            <p className="text-[10px] text-slate-600 font-mono text-center">Hech qanday jamoa topilmadi.</p>
                          )}
                        </div>
                      </div>

                      {/* Broadcast panel */}
                      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-3">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                          <Send className="w-3.5 h-3.5 text-sky-400" /> Barchaga yoki Jamoaga E'lon Yuborish
                        </h3>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Botdagi barcha foydalanuvchilarga yoki tanlangan jamoa a'zolariga e'lon yuborish.
                        </p>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 shrink-0 uppercase">Yuborish:</span>
                            <select
                              className="bg-slate-950 border border-slate-800 text-[11px] text-white rounded px-2 py-0.5 flex-1 font-mono focus:outline-none"
                              value={broadcastTargetTeam}
                              onChange={(e) => setBroadcastTargetTeam(e.target.value)}
                            >
                              <option value="">Barchaga (Barcha foydalanuvchilarga)</option>
                              {teams.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.name} jamoasiga</option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            placeholder="E'lon xabari matnini kiriting..."
                            className="w-full bg-slate-950 border border-slate-800 p-2 font-mono text-[10px] text-slate-300 rounded focus:outline-none focus:border-sky-500 h-16 leading-tight"
                            value={broadcastMessage}
                            onChange={(e) => setBroadcastMessage(e.target.value)}
                          />
                          <button
                            onClick={handleSendBroadcast}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 text-[10px] font-extrabold h-7 rounded uppercase tracking-wider transition-colors select-none cursor-pointer"
                          >
                            Xabar Jo'natish (Broadcast)
                          </button>
                          {broadcastStatus && (
                            <div className="p-1 px-2.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-center text-sky-400 leading-tight">
                              {broadcastStatus}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Full User Accounts Directory */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center justify-between border-b border-slate-800 pb-2">
                        <span>Foydalanuvchilar Ro'yxati ({users.length})</span>
                        <span className="text-[9px] text-slate-500 lowercase font-normal">Active registration database</span>
                      </h3>
                      {usersLoading ? (
                        <div className="text-center font-mono py-4 text-xs text-slate-400">Foydalanuvchilar yuklanmoqda...</div>
                      ) : (
                        <div className="space-y-3.5 max-h-[280px] overflow-y-auto pr-2">
                          {users.map((item: any) => (
                            <div key={item.id} className="bg-slate-950 border border-slate-900 rounded p-2.5 flex flex-col sm:flex-row justify-between sm:items-center gap-3 font-mono text-xs">
                              <div className="space-y-1 text-left flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-white font-bold truncate">@{item.username}</span>
                                  <span className="text-[9px] text-slate-600 bg-slate-900 px-1 py-0.2 rounded font-mono">ID: {item.id}</span>
                                  <span className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase ${item.isBlocked ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                                    }`}>
                                    {item.isBlocked ? 'BLOCKED' : 'ACTIVE'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                                  <span>Jamoa: <strong className="text-sky-300">{item.teamId || 'Mavjud emas'}</strong></span>
                                  <span>Tili: <strong className="text-amber-300 capitalize">{item.interfaceLanguage || 'uz (Standart)'}</strong></span>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1.5 shrink-0 min-w-[200px]">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleBlockUser(item.id, item.isBlocked)}
                                    className={`py-1 px-2.5 flex-1 rounded text-[10px] font-bold select-none cursor-pointer duration-150 ${item.isBlocked
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/15'
                                      : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/15'
                                      }`}
                                  >
                                    {item.isBlocked ? "Blokdan Ochish" : "Bloklash"}
                                  </button>
                                  {item.teamId && (
                                    <button
                                      onClick={() => handleKickUser(item.id)}
                                      className="py-1 px-2 rounded bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/15 text-[10px] font-bold duration-150 select-none cursor-pointer"
                                    >
                                      Haydash
                                    </button>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="Direct xabar yuborish..."
                                    className="bg-slate-900 border border-slate-800 text-[10px] text-white rounded px-1.5 py-0.5 flex-1 focus:outline-none focus:border-sky-500 font-mono"
                                    value={directUserMessage[item.id] || ''}
                                    onChange={(e) => setDirectUserMessage({ ...directUserMessage, [item.id]: e.target.value })}
                                  />
                                  <button
                                    onClick={() => handleSendDirectMessage(item.id)}
                                    className="bg-sky-500 hover:bg-sky-600 text-slate-950 text-[10px] font-bold px-2 rounded select-none cursor-pointer"
                                  >
                                    Yuborish
                                  </button>
                                </div>
                                {sendingMessageStatus[item.id] && (
                                  <span className="text-[9px] text-sky-400 text-right font-mono italic block leading-none">
                                    {sendingMessageStatus[item.id]}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {users.length === 0 && (
                            <div className="text-center font-mono py-4 text-xs text-slate-500">Hech qanday foydalanuvchi topilmadi.</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Subtitle Translation Projects history */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <h3 className="text-xs font-bold uppercase text-slate-200 border-b border-slate-800 pb-2">
                        Tarjima Qilingan Subtitr Hujjatlar
                      </h3>
                      {projectsLoading ? (
                        <div className="text-center font-mono py-4 text-xs text-slate-500">Yuklanmoqda...</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] font-mono text-left">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800 uppercase text-[9px] tracking-wider">
                                <th className="py-2">Mavzu / Nomi</th>
                                <th className="py-2 text-center">Format</th>
                                <th className="py-2 text-center">Turi</th>
                                <th className="py-2 text-center">Ulangan Jamoa</th>
                                <th className="py-2 text-right">Sanasi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {projectsData.projects?.map((proj: any) => {
                                const epCount = projectsData.episodes?.filter((e: any) => e.projectId === proj.id).length || 0;
                                return (
                                  <tr key={proj.id} className="border-b border-slate-900 text-slate-300 hover:bg-slate-950/40 select-text duration-100">
                                    <td className="py-2 font-bold text-white shrink-0 truncate max-w-[200px]">{proj.title}</td>
                                    <td className="py-2 text-center font-bold text-sky-400">{proj.type || 'ASS'}</td>
                                    <td className="py-2 text-center text-slate-400">
                                      {proj.isMulti ? `${epCount} ta qism` : 'Yakka film'}
                                    </td>
                                    <td className="py-2 text-center text-yellow-400">{proj.teamId || 'Mavjud emas'}</td>
                                    <td className="py-2 text-right text-slate-500 truncate">{new Date(proj.createdAt).toLocaleDateString()}</td>
                                  </tr>
                                );
                              })}
                              {(!projectsData.projects || projectsData.projects.length === 0) && (
                                <tr>
                                  <td colSpan={5} className="text-center py-6 text-slate-600">Hali hech qanday loyiha boshlanmagan.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Internal Admin Sessions Audit List */}
                      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-lg space-y-3 mt-4 text-left">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 font-sans">
                            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" /> Faol & Yaqindagi Admin Seanslari Audit (Sessions Audit Trail)
                          </h3>
                          <button
                            onClick={fetchSessionsList}
                            className="bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                            disabled={adminSessionsLoading}
                          >
                            <RefreshCw className={`w-2.5 h-2.5 ${adminSessionsLoading ? 'animate-spin' : ''}`} />
                            Yangilash
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          Bu bo'limda tizimga ulangan barcha administrator seanslarining to'liq ro'yxati va ularning faolligi auditi keltirilgan. Bu orqali begona qurilmalarning kirishini tekshirish mumkin.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[11px] font-mono">
                            <thead>
                              <tr className="border-b border-slate-800 text-[9px] uppercase text-slate-500 tracking-wider font-semibold">
                                <th className="pb-2">Sessiya ID</th>
                                <th className="pb-2">Foydalanuvchi</th>
                                <th className="pb-2">IP-adres</th>
                                <th className="pb-2">Qurilma / User-Agent</th>
                                <th className="pb-2">Kirish vaqti</th>
                                <th className="pb-2">Oxirgi faollik</th>
                                <th className="pb-2 text-right">Holati</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                              {adminSessions.map((sess, idx) => (
                                <tr key={sess.id || idx} className="hover:bg-slate-950/40 transition-colors">
                                  <td className="py-2.5 text-slate-400">{sess.id}</td>
                                  <td className="py-2.5 text-white font-bold flex items-center gap-1.5 font-sans">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    {sess.username}
                                  </td>
                                  <td className="py-2.5 select-all">{sess.ip}</td>
                                  <td className="py-2.5 truncate max-w-[200px]" title={sess.userAgent}>
                                    {sess.userAgent}
                                  </td>
                                  <td className="py-2.5 text-slate-400">{sess.loginTime}</td>
                                  <td className="py-2.5 text-emerald-400 font-semibold">{sess.lastActive}</td>
                                  <td className="py-2.5 text-right font-sans">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${sess.status === 'Faol'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : sess.status === 'Chiqilgan'
                                        ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      }`}>
                                      {sess.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'backups' && (
                  <div className="space-y-4 text-left font-sans">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5">
                          <DbIcon className="w-3.5 h-3.5 text-sky-400" /> Tizim Ma'lumotlar Bazasi Zaxiralari (Backups)
                        </h3>
                        <button
                          onClick={fetchBackups}
                          className="bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                          disabled={backupsLoading || loading}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${backupsLoading ? 'animate-spin' : ''}`} />
                          Yangilash
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                        Tizim doimiy barqarorlikni ta'minlash maqsadida <strong className="text-amber-400 font-sans font-semibold">har 24 soatda avtomatik ravishda</strong> zaxira nusxalarini yaratadi va faqat oxirgi 7 kunlik ma'lumotlarni saqlaydi. Tizim holatini istalgan zaxira nusxasiga qaytarishingiz mumkin. To'liq tiklanishdan avval joriy holat avtomatik ravishda zaxiralanadi!
                      </p>

                      <div className="flex items-center gap-3 flex-wrap mt-2">
                        <button
                          onClick={handleCreateBackup}
                          className="bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-[11px] px-3.5 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                          disabled={backupsLoading}
                        >
                          <Save className="w-3.5 h-3.5 text-slate-950" />
                          Hozir Zaxira Yaratish (Manual Backup)
                        </button>

                        <label className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] px-3.5 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                          DB Zaxirani Fayldan Tiklash (.json)
                          <input type="file" accept=".json" onChange={handleUploadBackup} className="hidden" />
                        </label>
                      </div>
                    </div>

                    {backupsSuccess && (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{backupsSuccess}</span>
                      </div>
                    )}

                    {backupsError && (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{backupsError}</span>
                      </div>
                    )}

                    {/* Backups table */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-4">
                      <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                        Mavjud Zaxira Nusxalari ro'yxati ({backups.length})
                      </h4>

                      {backupsLoading && backups.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 font-mono">
                          Zaxiralar ro'yxati yuklanmoqda...
                        </div>
                      ) : backups.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 font-mono flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-6 h-6 text-slate-600" />
                          Hech qanday zaxira nusxasi topilmadi.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 tracking-wider select-none font-semibold font-mono">
                                <th className="pb-2.5 font-bold">Fayl nomi</th>
                                <th className="pb-2.5 font-bold">Turi</th>
                                <th className="pb-2.5 font-bold col-span-2">Yaratilgan vaqt</th>
                                <th className="pb-2.5 font-bold">Hajmi</th>
                                <th className="pb-2.5 font-bold text-right text-sky-400">Amal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-[11px] font-mono text-slate-300">
                              {backups.map((bk, i) => {
                                const isDaily = !bk.filename.includes('_');
                                return (
                                  <tr key={i} className="hover:bg-slate-900/40 transition-colors">
                                    <td className="py-2.5 text-white font-semibold flex items-center gap-2 truncate max-w-[200px]">
                                      <DbIcon className={`w-3.5 h-3.5 ${isDaily ? 'text-emerald-400' : 'text-sky-400'}`} />
                                      {bk.filename}
                                    </td>
                                    <td className="py-2.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider ${isDaily ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20 font-sans'
                                        }`}>
                                        {isDaily ? 'AVTOMATIK (7_DAYS)' : 'MANUAL'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 text-slate-300 select-all">
                                      {new Date(bk.createdAt).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 text-slate-400 font-sans">
                                      {typeof bk.size === 'number' ? (bk.size / 1024).toFixed(2) + ' KB' : bk.size}
                                    </td>
                                    <td className="py-2.5 text-right">
                                      <button
                                        onClick={() => handleDownloadBackup(bk.id || bk.filename, bk.filename)}
                                        className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 text-[10px] font-semibold px-3 py-1 rounded cursor-pointer transition-all duration-150 inline-block mr-2"
                                      >
                                        Yuklash
                                      </button>
                                      <button
                                        onClick={() => handleRestoreBackup(bk.id || bk.filename, bk.filename)}
                                        className="bg-sky-500/10 hover:bg-sky-500 text-sky-400 hover:text-slate-950 border border-sky-500/20 text-[10px] font-semibold px-3 py-1 rounded cursor-pointer transition-all duration-150 inline-block"
                                      >
                                        Tiklash (Restore)
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'subtitles' && (
                  <div className="space-y-4 text-left font-sans">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h3 className="text-xs font-bold uppercase text-slate-200 flex items-center gap-1.5 font-mono">
                          <FileText className="w-3.5 h-3.5 text-sky-400" /> Tarjima Qilingan Subtitrlar
                        </h3>
                        <button
                          onClick={fetchSubtitles}
                          className="bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                          disabled={subtitlesLoading}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${subtitlesLoading ? 'animate-spin' : ''}`} />
                          Yangilash
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                        Ushbu bo'limda bot orqali tarjima qilingan barcha subtitrlar (originali va o'zbekchasi) ro'yxati keltirilgan. Fayllarni Telegram storage kanalidan to'g'ridan-to'g'ri yuklab olishingiz mumkin.
                      </p>

                      {subtitlesError && (
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{subtitlesError}</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-4">
                      <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                        Mavjud Subtitrlar ro'yxati ({subtitles.length})
                      </h4>

                      {subtitlesLoading && subtitles.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 font-mono">
                          Subtitrlar yuklanmoqda...
                        </div>
                      ) : subtitles.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 font-mono flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-6 h-6 text-slate-600" />
                          Hech qanday subtitr topilmadi.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 tracking-wider select-none font-semibold font-mono">
                                <th className="pb-2.5 font-bold">Loyiha Nomi</th>
                                <th className="pb-2.5 font-bold">Qism</th>
                                <th className="pb-2.5 font-bold">Fayl nomi</th>
                                <th className="pb-2.5 font-bold">Til/Qatorlar</th>
                                <th className="pb-2.5 font-bold">Yaratilgan vaqt</th>
                                <th className="pb-2.5 font-bold text-right text-sky-400">Amallar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-[11px] font-mono text-slate-300">
                              {subtitles.map((sub, i) => (
                                <tr key={i} className="hover:bg-slate-900/40 transition-colors">
                                  <td className="py-2.5 text-white font-semibold font-sans">
                                    <div className="flex flex-col">
                                      <span>{sub.projectTitle}</span>
                                      <span className="text-[9px] text-slate-500 uppercase">{sub.projectType}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-slate-300">
                                    {sub.episodeNumber ? `Qism: ${sub.episodeNumber}` : 'N/A'}
                                  </td>
                                  <td className="py-2.5 text-slate-400 select-all truncate max-w-[150px]" title={sub.fileName}>
                                    {sub.fileName}
                                  </td>
                                  <td className="py-2.5 text-slate-300">
                                    <span className="text-emerald-400 font-semibold">{sub.targetLanguage.toUpperCase()}</span> | {sub.dialogueRows} qator
                                  </td>
                                  <td className="py-2.5 text-slate-400">
                                    {new Date(sub.createdAt).toLocaleString()}
                                  </td>
                                  <td className="py-2.5 text-right font-sans">
                                    {sub.originalFileId && (
                                      <button
                                        onClick={() => handleDownloadSubtitle(sub.id, 'original', `original_${sub.fileName}`)}
                                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-semibold px-2 py-1 rounded cursor-pointer transition-all duration-150 inline-block mr-2"
                                        disabled={subtitlesDownloadingId === `${sub.id}_original`}
                                      >
                                        {subtitlesDownloadingId === `${sub.id}_original` ? 'Yuklanmoqda...' : 'Original'}
                                      </button>
                                    )}
                                    {sub.translatedFileId && (
                                      <button
                                        onClick={() => handleDownloadSubtitle(sub.id, 'translated', `translated_${sub.fileName}`)}
                                        className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 text-[10px] font-semibold px-2 py-1 rounded cursor-pointer transition-all duration-150 inline-block"
                                        disabled={subtitlesDownloadingId === `${sub.id}_translated`}
                                      >
                                        {subtitlesDownloadingId === `${sub.id}_translated` ? 'Yuklanmoqda...' : 'Tarjima (UZ)'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {errorPrompt && (
                  <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2 text-left">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorPrompt}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <section id="system-runtime-logs" className="bg-slate-900/50 border-t border-slate-800 p-4 flex-1 min-h-[160px] flex flex-col shrink-0">
            <div className="pb-2 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase text-slate-400 font-mono flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> System Runtime Logs
                </span>
                <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  {(() => {
                    const filtered = (logs || []).filter((log: any) => {
                      const matchesSearch = !logsSearch.trim() ||
                        (log.message || '').toLowerCase().includes(logsSearch.toLowerCase()) ||
                        (log.type || '').toLowerCase().includes(logsSearch.toLowerCase());
                      const matchesType = logsTypeFilter === 'ALL' || log.type === logsTypeFilter;
                      return matchesSearch && matchesType;
                    });
                    return filtered.length;
                  })()} ta topildi
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Matnli qidiruv..."
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[10px] text-white focus:outline-none focus:border-sky-500 font-sans w-32 placeholder-slate-650"
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                />
                <select
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-sky-500 font-sans cursor-pointer"
                  value={logsTypeFilter}
                  onChange={(e) => setLogsTypeFilter(e.target.value)}
                >
                  <option value="ALL">Barchasi (ALL)</option>
                  <option value="GEMINI">GEMINI</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="ERROR">ERROR</option>
                  <option value="DB">DB</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                </select>
                <span className="text-[10px] text-slate-600 font-mono hidden md:inline">Session ID: d3f2-88a1-c901</span>
              </div>
            </div>
            <div className="flex-1 py-3 font-mono text-[11px] overflow-y-auto space-y-1.5 text-slate-400 max-h-[120px]">
              {(logs || [])
                .filter((log: any) => {
                  const matchesSearch = !logsSearch.trim() ||
                    (log.message || '').toLowerCase().includes(logsSearch.toLowerCase()) ||
                    (log.type || '').toLowerCase().includes(logsSearch.toLowerCase());
                  const matchesType = logsTypeFilter === 'ALL' || log.type === logsTypeFilter;
                  return matchesSearch && matchesType;
                })
                .map((log: any, idx: number) => (
                  <div key={idx} className="flex gap-4">
                    <span className="text-slate-600 text-right w-16 select-none shrink-0">{log.time}</span>
                    <span className={`font-bold shrink-0 ${log.type === 'GEMINI' ? 'text-sky-400' :
                      log.type === 'SUCCESS' ? 'text-emerald-400' :
                        log.type === 'ERROR' ? 'text-rose-400' :
                          log.type === 'DB' ? 'text-yellow-400' : 'text-slate-500'
                      }`}>
                      [{log.type}]
                    </span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </main>

      {/* Screenshot full sized zoom Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 cursor-pointer"
        >
          <div className="max-w-md w-full max-h-[85vh] bg-slate-900 p-2 border border-slate-800 rounded-lg relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/80 rounded-full text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              className="w-full h-auto max-h-[75vh] object-contain rounded"
              src={previewImage}
              alt="Zoomed Chek"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
