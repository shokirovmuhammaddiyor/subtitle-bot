import { MongoClient } from 'mongodb';

export class Database {
  constructor(filePath = 'db.json') {
    this.client = null;
    this.db = null;
    this.saveQueue = Promise.resolve();
    this.data = {
      users: [],
      projects: [],
      episodes: [],
      teams: [],
      payments: [],
      ratings: [],
      settings: null,
      automatedAnimes: [],
      promocodes: [],
      backups: [],
      translationCache: [],
      translationCacheMetadata: {}
    };
  }

  async init() {
    try {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/subtitle_bot';
      // Format URI for safe logging (hiding credentials)
      const safeUri = uri.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/, 'mongodb$1://$2:***@');
      console.log(`[DB] Connecting to MongoDB at ${safeUri}...`);
      
      this.client = new MongoClient(uri);
      await this.client.connect();

      let dbName = 'subtitle_bot';
      try {
        const parsedUri = new URL(uri);
        if (parsedUri.pathname && parsedUri.pathname !== '/') {
          dbName = parsedUri.pathname.substring(1);
        }
      } catch (e) {}

      this.db = this.client.db(dbName);
      console.log(`[DB] Connected successfully to MongoDB: ${dbName}`);

      const collections = [
        'users', 'projects', 'episodes', 'teams', 'payments', 
        'ratings', 'automatedAnimes', 'promocodes', 'backups', 'translationCache'
      ];

      for (const colName of collections) {
        const col = this.db.collection(colName);
        this.data[colName] = await col.find({}).toArray();
        // Remove mongo-internal _id keys from in-memory objects to prevent downstream bugs
        if (Array.isArray(this.data[colName])) {
          for (const item of this.data[colName]) {
            if (item && item._id) delete item._id;
          }
        }
      }

      // Load settings
      const settingsCol = this.db.collection('settings');
      const settingsDoc = await settingsCol.findOne({ _id: 'global' });
      if (settingsDoc) {
        this.data.settings = settingsDoc;
        delete this.data.settings._id;
      } else {
        this.data.settings = null;
      }

      // Load translationCacheMetadata
      const metaCol = this.db.collection('translationCacheMetadata');
      const metaDocs = await metaCol.find({}).toArray();
      this.data.translationCacheMetadata = {};
      for (const doc of metaDocs) {
        this.data.translationCacheMetadata[doc._id] = {
          createdAt: doc.createdAt,
          expiresAt: doc.expiresAt,
          fileName: doc.fileName
        };
      }

      if (!this.data.settings) {
        this.data.settings = {
          defaultBatchSize: 45,
          aiModel: 'gemini-2.0-flash',
          systemPrompt: `Sen professional subtitr tarjimoni va o'zbek tiliga mahalliylashtirish mutaxassisisan. Vazifang berilgan matnlarni yuqori sifatli, tabiiy va dublyajbop o'zbek tiliga to'liq tarjima qilish.

Hozirgi loyiha nomi: {movie_name}
Qism raqami: {episode_number}-qism

Quyidagi qoidalarga qat'iy va to'liq amal qil:
1. To'liqlik (Chala qolmasligi shart):
- Berilgan har bir qator va butun dialog oxirigacha, chala qoldirilmasdan to'liq o'zbek tiliga tarjima qilinishi shart.

2. "Sen" va "Siz" munosabatlari (Juda Muhim):
- Do'stlar, tengdoshlar, oila a'zolari va yosh bolalar o'rtasidagi suhbatlarda jonli va tabiiy o'zbek tilini ta'minlash uchun iloji boricha ko'proq "SEN" shaklidan foydalan.
- Faqatgina kattalarga, ota-onaga, notanish shaxslarga va boshliqlarga murojaatda "SIZ" shaklini qo'lla. Suhbat davomida ushbu uslub izchilligini saqlab qol.

3. Dublyajbop va Tabiiy oqim:
- So'zma-so'z, kitobiy yoki rasmiy tarjimadan qoch. Dialoglarni xuddi o'zbek tilida gaplashilgandek jonli, eshitilishga qulay va dublyajga mos qilib tarjima qil. Qator uzunligi asl holatga yaqin bo'lsin.

4. His-tuyg'ular va Jargonlar:
- Sahnadagi hissiyotlarni (kesatiq, hazil, hayajon, g'azab) mos o'zbekcha iboralar, maqollar va jargonlar yordamida sifatli va aniq yetkazib ber.`,
          cardNumber: "8600 1234 5678 9012",
          cardOwner: "Sherzodbek To'xtasinov",
          packages: [
            { id: 'pack_1000', name: "1,000 dona Token", type: 'tokens', value: 1000, price: "15,000 O'zS" },
            { id: 'pack_5000', name: "5,000 dona Token", type: 'tokens', value: 5000, price: "60,000 O'zS" },
            { id: 'pack_15000', name: "15,000 dona Token", type: 'tokens', value: 15000, price: "150,000 O'zS" },
            { id: 'monthly_starter', name: "Boshlang'ich (Oxirgi 10 ta Subtitle)", type: 'monthly_starter', value: 10, price: "50,000 O'zS" },
            { id: 'monthly_fandub', name: "FanDub (Oxirgi 25 ta Subtitle)", type: 'monthly_fandub', value: 25, price: "120,000 O'zS" },
            { id: 'monthly_studio', name: "Studio (Oxirgi 50 ta Subtitle)", type: 'monthly_studio', value: 50, price: "200,000 O'zS" }
          ]
        };
        await this.save();
      } else if (!this.data.settings.packages || !this.data.settings.packages.some(p => p.id === 'monthly_starter')) {
        this.data.settings.packages = [
          { id: 'pack_1000', name: "1,000 dona Token", type: 'tokens', value: 1000, price: "15,000 O'zS" },
          { id: 'pack_5000', name: "5,000 dona Token", type: 'tokens', value: 5000, price: "60,000 O'zS" },
          { id: 'pack_15000', name: "15,000 dona Token", type: 'tokens', value: 15000, price: "150,000 O'zS" },
          { id: 'monthly_starter', name: "Boshlang'ich (Oxirgi 10 ta Subtitle)", type: 'monthly_starter', value: 10, price: "50,000 O'zS" },
          { id: 'monthly_fandub', name: "FanDub (Oxirgi 25 ta Subtitle)", type: 'monthly_fandub', value: 25, price: "120,000 O'zS" },
          { id: 'monthly_studio', name: "Studio (Oxirgi 50 ta Subtitle)", type: 'monthly_studio', value: 50, price: "200,000 O'zS" }
        ];
        if (!this.data.settings.cardNumber) {
          this.data.settings.cardNumber = "8600 1234 5678 9012";
          this.data.settings.cardOwner = "Sherzodbek To'xtasinov";
        }
        await this.save();
      }
    } catch (error) {
      console.error('[DB INIT ERROR] Failed to connect or initialize MongoDB:', error);
      // Fallback for settings to allow boot
      this.data.settings = this.data.settings || {
        defaultBatchSize: 45,
        cardNumber: "8600 1234 5678 9012",
        cardOwner: "Sherzodbek To'xtasinov",
        packages: []
      };
    }
  }

  async save() {
    this.saveQueue = this.saveQueue.then(async () => {
      try {
        if (!this.db) return;

        const collections = [
          'users', 'projects', 'episodes', 'teams', 'payments', 
          'ratings', 'automatedAnimes', 'promocodes', 'backups', 'translationCache'
        ];

        for (const colName of collections) {
          await this.syncCollection(colName, this.data[colName], 'id');
        }

        // Sync settings
        if (this.data.settings) {
          const settingsCol = this.db.collection('settings');
          const doc = JSON.parse(JSON.stringify(this.data.settings));
          doc._id = 'global';
          await settingsCol.replaceOne({ _id: 'global' }, doc, { upsert: true });
        }

        // Sync translationCacheMetadata
        const metaCol = this.db.collection('translationCacheMetadata');
        const bulkOps = [];
        const currentHashes = new Set();

        if (this.data.translationCacheMetadata) {
          for (const [hash, val] of Object.entries(this.data.translationCacheMetadata)) {
            currentHashes.add(hash);
            const doc = JSON.parse(JSON.stringify(val));
            doc._id = hash;
            bulkOps.push({
              replaceOne: {
                filter: { _id: hash },
                replacement: doc,
                upsert: true
              }
            });
          }
        }

        if (bulkOps.length > 0) {
          await metaCol.bulkWrite(bulkOps);
        }

        const query = {};
        if (currentHashes.size > 0) {
          query._id = { $nin: Array.from(currentHashes) };
        }
        await metaCol.deleteMany(query);
      } catch (err) {
        console.error('[DB WRITE ERROR] Failed to sync database to MongoDB:', err);
      }
    });
    return this.saveQueue;
  }

  async syncCollection(collectionName, inMemoryArray, idField = 'id') {
    const collection = this.db.collection(collectionName);
    if (!Array.isArray(inMemoryArray)) return;

    const bulkOps = [];
    const currentIds = new Set();

    for (const item of inMemoryArray) {
      const doc = JSON.parse(JSON.stringify(item));
      const idVal = doc[idField];
      if (idVal === undefined || idVal === null) continue;

      currentIds.add(idVal);
      doc._id = idVal;

      bulkOps.push({
        replaceOne: {
          filter: { _id: idVal },
          replacement: doc,
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }

    const query = {};
    if (currentIds.size > 0) {
      query._id = { $nin: Array.from(currentIds) };
    }
    await collection.deleteMany(query);
  }

  async restoreData(parsed) {
    this.data.users = parsed.users || [];
    this.data.projects = parsed.projects || [];
    this.data.episodes = parsed.episodes || [];
    this.data.teams = parsed.teams || [];
    this.data.payments = parsed.payments || [];
    this.data.ratings = parsed.ratings || [];
    this.data.automatedAnimes = parsed.automatedAnimes || [];
    this.data.promocodes = parsed.promocodes || [];
    this.data.backups = parsed.backups || [];
    this.data.translationCache = parsed.translationCache || [];
    this.data.translationCacheMetadata = parsed.translationCacheMetadata || {};
    this.data.settings = parsed.settings || this.data.settings || {};

    const collections = [
      'users', 'projects', 'episodes', 'teams', 'payments', 
      'ratings', 'automatedAnimes', 'promocodes', 'backups', 'translationCache'
    ];
    for (const col of collections) {
      if (Array.isArray(this.data[col])) {
        for (const item of this.data[col]) {
          if (item && item._id) delete item._id;
        }
      }
    }
    if (this.data.settings && this.data.settings._id) {
      delete this.data.settings._id;
    }

    await this.save();
  }

  async getSettings() {
    if (!this.data.settings) {
      await this.init();
    }
    return this.data.settings;
  }

  async updateSettings(updates) {
    const s = await this.getSettings();
    Object.assign(s, updates);
    await this.save();
    return s;
  }

  async getUser(id) {
    const numericId = Number(id);
    let user = this.data.users.find(u => Number(u.id) === numericId);
    if (!user) {
      user = {
        id: numericId,
        state: 'IDLE',
        language: 'uz',
        teamId: null,
        settings: {
          qualityPrompt: '',
          batchSize: 45
        },
        currentSession: null
      };
      this.data.users.push(user);
      await this.save();
    }
    return user;
  }

  async updateUser(id, updates) {
    const user = await this.getUser(id);
    Object.assign(user, updates);
    await this.save();
    return user;
  }

  async getProject(id) {
    return this.data.projects.find(p => p.id === id);
  }

  async getProjectsByUser(userId) {
    const numericUserId = Number(userId);
    const user = await this.getUser(numericUserId);
    if (user && user.teamId) {
      return this.data.projects.filter(p => p.teamId === user.teamId);
    }
    return this.data.projects.filter(p => Number(p.userId) === numericUserId);
  }

  async createProject(userId, type, title, isMulti, teamId = null) {
    const project = {
      id: Date.now().toString(),
      userId: Number(userId),
      teamId: teamId,
      type,
      title,
      isMulti
    };
    this.data.projects.push(project);
    await this.save();
    return project;
  }

  async getEpisode(projectId, episodeNumber) {
    return this.data.episodes.find(e => e.projectId === projectId && String(e.episodeNumber) === String(episodeNumber));
  }

  async createEpisode(projectId, episodeNumber) {
    let episode = await this.getEpisode(projectId, episodeNumber);
    if (!episode) {
      episode = {
        id: Date.now().toString(),
        projectId,
        episodeNumber,
        chatHistory: []
      };
      this.data.episodes.push(episode);
      await this.save();
    }
    return episode;
  }

  async updateEpisodeHistory(episodeId, history) {
    const episode = this.data.episodes.find(e => e.id === episodeId);
    if (episode) {
      episode.chatHistory = history;
      await this.save();
    }
  }

  generateTeamCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.data.teams.some(t => t.id === code)) {
      return this.generateTeamCode();
    }
    return code;
  }

  async getTeam(id) {
    if (!id) return null;
    return this.data.teams.find(t => t.id === id.toUpperCase());
  }

  async getTeams() {
    return this.data.teams;
  }

  async createTeam(ownerId, name, channelLink) {
    const code = this.generateTeamCode();
    const numericOwnerId = Number(ownerId);

    const team = {
      id: code,
      name,
      channelLink,
      status: 'PENDING',
      ownerId: numericOwnerId,
      members: [numericOwnerId],
      tokens: 500,
      maxConcurrentJobs: 5,
      createdAt: new Date().toISOString()
    };

    this.data.teams.push(team);

    await this.updateUser(numericOwnerId, { teamId: code });
    await this.save();
    return team;
  }

  async updateTeam(id, updates) {
    const team = await this.getTeam(id);
    if (team) {
      Object.assign(team, updates);
      if (team.tokens >= 100) {
        team.hasLowBalanceWarned = false;
      }
      await this.save();
    }
    return team;
  }

  async addUserToTeam(id, userId) {
    const team = await this.getTeam(id);
    const numericUserId = Number(userId);
    if (team) {
      if (!team.members.includes(numericUserId)) {
        team.members.push(numericUserId);
      }
      await this.updateUser(numericUserId, { teamId: team.id });
      await this.save();
    }
    return team;
  }

  async removeUserFromTeam(id, userId) {
    const team = await this.getTeam(id);
    const numericUserId = Number(userId);
    let newOwnerId = null;
    if (team) {
      team.members = team.members.filter(m => m !== numericUserId);
      if (team.ownerId === numericUserId) {
        team.ownerId = team.members[0] || null;
        newOwnerId = team.ownerId;
      }
      await this.updateUser(numericUserId, { teamId: null, state: 'IDLE' });
      if (team.members.length === 0) {
        this.data.teams = this.data.teams.filter(t => t.id !== team.id);
      }
      await this.save();
    }
    return { team, newOwnerId };
  }

  async getPayments() {
    return this.data.payments;
  }

  async createPayment(userId, teamId, amount, screenshot, type, value, packageName = '', days = null, packageId = null) {
    const payment = {
      id: Date.now().toString(),
      userId: Number(userId),
      teamId,
      amount,
      screenshot,
      type,
      value: Number(value),
      packageName,
      days: days ? Number(days) : null,
      packageId: packageId || null,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    this.data.payments.push(payment);
    await this.save();
    return payment;
  }

  async approvePayment(paymentId) {
    const payment = this.data.payments.find(p => p.id === paymentId);
    if (payment && payment.status === 'PENDING') {
      payment.status = 'APPROVED';
      const team = await this.getTeam(payment.teamId);
      if (team) {
        if (payment.type === 'package' || payment.type.startsWith('monthly_') || payment.type === 'unlimited') {
          team.activeSubscription = payment.packageId || payment.type;
          let subDays = payment.days;
          if (!subDays && payment.type.startsWith('monthly_')) {
            subDays = 30;
          }
          if (subDays) {
            team.subscriptionExpiresAt = new Date(Date.now() + subDays * 24 * 3600 * 1000).toISOString();
          } else {
            team.subscriptionExpiresAt = null;
          }
          team.maxConcurrentJobs = 10;
        } else {
          team.tokens = (team.tokens || 0) + Number(payment.value);
        }
        if (team.tokens >= 100) {
          team.hasLowBalanceWarned = false;
        }
        await this.save();
      }
      await this.save();
      return true;
    }
    return false;
  }

  async rejectPayment(paymentId) {
    const payment = this.data.payments.find(p => p.id === paymentId);
    if (payment && payment.status === 'PENDING') {
      payment.status = 'REJECTED';
      await this.save();
      return true;
    }
    return false;
  }

  async getPromocodes() {
    return this.data.promocodes || [];
  }

  async createPromocode(code, type, value, days, maxUses) {
    if (!this.data.promocodes) {
      this.data.promocodes = [];
    }
    const promo = {
      id: Date.now().toString(),
      code: String(code).toUpperCase().trim(),
      type,
      value: Number(value) || 0,
      days: Number(days) || 0,
      maxUses: Number(maxUses) || 1,
      uses: 0,
      usedTeams: [],
      createdAt: new Date().toISOString()
    };
    this.data.promocodes.push(promo);
    await this.save();
    return promo;
  }

  async deletePromocode(id) {
    if (this.data.promocodes) {
      this.data.promocodes = this.data.promocodes.filter(p => p.id !== id);
      await this.save();
    }
  }

  async usePromocode(code, teamId) {
    if (!this.data.promocodes) {
      this.data.promocodes = [];
    }
    const promo = this.data.promocodes.find(p => p.code === String(code).toUpperCase().trim());
    if (!promo) {
      return { success: false, error: "Promokod noto'g'ri yoki mavjud emas." };
    }
    if (promo.uses >= promo.maxUses) {
      return { success: false, error: "Ushbu promokodning faollashtirish limiti tugagan." };
    }
    if (promo.usedTeams && promo.usedTeams.includes(teamId)) {
      return { success: false, error: "Sizning jamoangiz ushbu promokoddan allaqachon foydalangan." };
    }

    const team = await this.getTeam(teamId);
    if (!team) {
      return { success: false, error: "Jamoa topilmadi." };
    }

    if (promo.type === 'tokens') {
      team.tokens = (team.tokens || 0) + Number(promo.value);
    } else {
      team.activeSubscription = promo.type;
      if (promo.days > 0) {
        team.subscriptionExpiresAt = new Date(Date.now() + promo.days * 24 * 3600 * 1000).toISOString();
      } else {
        team.subscriptionExpiresAt = null;
      }
      team.maxConcurrentJobs = 10;
    }

    if (!promo.usedTeams) {
      promo.usedTeams = [];
    }
    promo.uses += 1;
    promo.usedTeams.push(teamId);

    await this.save();
    return { success: true, promo };
  }
}

export const db = new Database();
await db.init();
