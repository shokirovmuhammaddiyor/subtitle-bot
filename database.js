import fs from 'fs/promises';

export class Database {
  constructor(filePath = 'db.json') {
    this.filePath = filePath;
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
      backups: []
    };
  }

  async init() {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);

      this.data = {
        users: parsed.users || [],
        projects: parsed.projects || [],
        episodes: parsed.episodes || [],
        teams: parsed.teams || [],
        payments: parsed.payments || [],
        ratings: parsed.ratings || [],
        settings: parsed.settings || null,
        automatedAnimes: parsed.automatedAnimes || [],
        promocodes: parsed.promocodes || [],
        backups: parsed.backups || []
      };

      if (!this.data.settings) {
        this.data.settings = {
          defaultBatchSize: 45,
          aiModel: 'gemini-2.0-flash',
          systemPrompt: `Sen professional subtitr tarjimoni va o'zbek tiliga mahalliylashtirish mutaxassisisan. Vazifang berilgan matnlarni yuqori sifatli, tabiiy va dublyajbop o'zbek tiliga tarjima qilish.

Hozirgi loyiha nomi: {movie_name}
Qism raqami: {episode_number}-qism

Quyidagi qoidalarga qat'iy amal qil:
1. "Sen" va "Siz" munosabatlari (Muhim):
- Do'stlar, tengdoshlar va oila a'zolari o'rtasida o'ta jonli, tabiiy o'zbek tilini ta'minlash uchun "SEN" munosabatidan foydalan.
- Faqatgina ota-onaga, kattalarga, boshliq va notanish shaxslarga murojaatda "SIZ" shaklini qo'lla. Bir muloqot davomida tanlangan uslubni o'zgartirma.
2. Dublyajbop va Tabiiy oqim:
- So'zma-so'z, kitobiy tarjimadan qoch. Qator uzunligi va timing asl holatga yaqin saqlansin.
3. His-tuyg'u va Jargonlar:
- Sahnadagi har bir hissiyotni (hazil, kesatiq, taranglik) mos o'zbekcha ibora va jargonlar bilan boyit.`,
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
      this.data.settings = {
        defaultBatchSize: 45,
        systemPrompt: `Sen professional subtitr tarjimoni va o'zbek tiliga mahalliylashtirish mutaxassisisan. Vazifang berilgan matnlarni yuqori sifatli, tabiiy va dublyajbop o'zbek tiliga tarjima qilish.

Hozirgi loyiha nomi: {movie_name}
Qism raqami: {episode_number}-qism

Quyidagi qoidalarga qat'iy amal qil:
1. "Sen" va "Siz" munosabatlari (Muhim):
- Do'stlar, tengdoshlar va oila a'zolari o'rtasida o'ta jonli, tabiiy o'zbek tilini ta'minlash uchun "SEN" munosabatidan foydalan.
- Faqatgina ota-onaga, kattalarga, boshliq va notanish shaxslarga murojaatda "SIZ" shaklini qo'lla. Bir muloqot davomida tanlangan uslubni o'zgartirma.
2. Dublyajbop va Tabiiy oqim:
- So'zma-so'z, kitobiy tarjimadan qoch. Qator uzunligi va timing asl holatga yaqin saqlansin.
3. His-tuyg'u va Jargonlar:
- Sahnadagi har bir hissiyotni (hazil, kesatiq, taranglik) mos o'zbekcha ibora va jargonlar bilan boyit.`,
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
    }
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
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
    // Find projects linked to user's team or user directly
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

  // --- Teams functionality ---
  generateTeamCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // ensure unique
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
      tokens: 500, // start with 500 tokens for evaluation
      maxConcurrentJobs: 1,
      createdAt: new Date().toISOString()
    };

    this.data.teams.push(team);

    // Update owner's user state & linkage
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
    if (team) {
      team.members = team.members.filter(m => m !== numericUserId);
      if (team.ownerId === numericUserId) {
        // If owner leaves, pick another or set first
        team.ownerId = team.members[0] || null;
      }
      await this.updateUser(numericUserId, { teamId: null, state: 'IDLE' });
      await this.save();
    }
    return team;
  }

  // --- Payments functionality ---
  async getPayments() {
    return this.data.payments;
  }

  async createPayment(userId, teamId, amount, screenshot, type, value, packageName = '', days = null, packageId = null) {
    const payment = {
      id: Date.now().toString(),
      userId: Number(userId),
      teamId,
      amount,
      screenshot, // base64 or description
      type, // 'tokens' or 'unlimited'
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
            subDays = 30; // default to 30 days for monthly packages
          }
          if (subDays) {
            team.subscriptionExpiresAt = new Date(Date.now() + subDays * 24 * 3600 * 1000).toISOString();
          } else {
            team.subscriptionExpiresAt = null; // Cheksiz muddat
          }
          team.maxConcurrentJobs = 3;
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

    // Apply reward
    if (promo.type === 'tokens') {
      team.tokens = (team.tokens || 0) + Number(promo.value);
    } else {
      // Obuna
      team.activeSubscription = promo.type;
      if (promo.days > 0) {
        team.subscriptionExpiresAt = new Date(Date.now() + promo.days * 24 * 3600 * 1000).toISOString();
      } else {
        team.subscriptionExpiresAt = null; // cheksiz
      }
      team.maxConcurrentJobs = 3;
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
