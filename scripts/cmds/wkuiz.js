const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://qizapi.onrender.com/api';

// ========== Gestion base de données JSON ==========
const getDatabasePath = (dbName) => {
  const dbPath = path.join(__dirname, 'database', `${dbName}.json`);
  const dbDir = path.join(__dirname, 'database');
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}));
  }
  
  return dbPath;
};

const getDatabase = (dbName) => {
  const dbPath = getDatabasePath(dbName);
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
};

const saveDatabase = (dbName, data) => {
  const dbPath = getDatabasePath(dbName);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// ========== Traduction ==========
async function translate(text, targetLang = 'fr') {
  if (!text || text.includes('http')) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url);
    return res.data[0].map(segment => segment[0]).join("");
  } catch (e) {
    return text;
  }
}

/**
 * Traduit uniquement la question, la catégorie et la difficulté.
 * Les options de réponse restent dans leur langue originale.
 */
async function translateQuestion(questionData, targetLang = 'fr') {
  try {
    if (questionData.category === 'flag' || questionData.question?.includes('http')) {
      return questionData;
    }

    const [translatedQuestion, translatedCategory, translatedDifficulty] = await Promise.all([
      translate(questionData.question, targetLang),
      translate(questionData.category || '', targetLang),
      translate(questionData.difficulty || '', targetLang)
    ]);

    return {
      ...questionData,
      question: translatedQuestion || questionData.question,
      options: questionData.options,
      category: translatedCategory || questionData.category,
      difficulty: translatedDifficulty || questionData.difficulty,
      originalAnswer: questionData.answer
    };
  } catch (error) {
    console.error("Translation error:", error);
    return questionData;
  }
}

// ========== Utilitaires d'affichage ==========
function generateProgressBar(percentile) {
  const filled = Math.round(percentile / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getUserTitle(correct) {
  if (correct >= 50000) return '🌟 Quiz Omniscient';
  if (correct >= 25000) return '👑 Quiz Divin';
  if (correct >= 15000) return '⚡ Quiz Titan';
  if (correct >= 10000) return '🏆 Quiz Légende';
  if (correct >= 7500) return '🎓 Grand Maître';
  if (correct >= 5000) return '👨‍🎓 Maître du Quiz';
  if (correct >= 2500) return '🔥 Expert en Quiz';
  if (correct >= 1500) return '📚 Savant du Quiz';
  if (correct >= 1000) return '🎯 Apprenti Quiz';
  if (correct >= 750) return '🌟 Chercheur de Savoir';
  if (correct >= 500) return '📖 Apprenant Rapide';
  if (correct >= 250) return '🚀 Étoile Montante';
  if (correct >= 100) return '💡 Débutant';
  if (correct >= 50) return '🎪 Premiers Pas';
  if (correct >= 25) return '🌱 Nouveau Venu';
  if (correct >= 10) return '🔰 Débutant';
  if (correct >= 1) return '👶 Recrue';
  return '🆕 Nouveau Joueur';
}

async function getAvailableCategories() {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    return res.data.map(cat => cat.toLowerCase());
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

module.exports = {
  config: {
    name: "quiz",
    aliases: ["q", "qz", "kuiz"],
    version: "4.0.0",
    author: "Christus",
    countDown: 5,
    role: 0,
    description: {
      en: "Advanced quiz game with social features, multiplayer, achievements and complete analytics"
    },
    category: "game",
    nixPrefix: true,
    guide: {
      en: "   {pn} <category> - Start a quiz in a category\n"
        + "   {pn} rank - View your profile\n"
        + "   {pn} lb - Leaderboard\n"
        + "   {pn} daily - Daily challenge\n"
        + "   {pn} torf - True/False quiz\n"
        + "   {pn} flag - Flag quiz\n"
        + "   {pn} anime - Anime quiz"
    }
  },

  onStart: async function ({ sock, chatId, args, event, senderId, reply, prefix, commandName }) {
    const command = args[0]?.toLowerCase();
    const userId = senderId;
    const userName = event.pushName || "Joueur";

    try {
      await axios.post(`${BASE_URL}/user/update`, {
        userId: userId,
        name: userName
      }).catch(() => {});

      if (!args[0] || command === "help") {
        return handleDefaultView(chatId, sock, reply, event);
      }

      switch (command) {
        case "rank":
        case "profile":
        case "rang":
        case "profil":
          return await handleRank(chatId, event, sock, userId, userName, reply);
          
        case "leaderboard":
        case "lb":
        case "classement":
          return await handleLeaderboard(chatId, event, sock, args.slice(1), reply);
          
        case "category":
        case "categorie":
          if (args.length > 1) {
            return await handleCategoryLeaderboard(chatId, event, sock, args.slice(1), reply);
          }
          return await handleCategories(chatId, sock, reply, event);
          
        case "daily":
        case "quotidien":
          return await handleDailyChallenge(chatId, event, sock, userId, userName, reply);
          
        case "torf":
        case "vrai/faux":
          return await handleTrueOrFalse(chatId, event, sock, userId, userName, reply);
          
        case "flag":
        case "drapeau":
          return await handleFlagQuiz(chatId, event, sock, userId, userName, reply);
          
        case "anime":
          return await handleAnimeQuiz(chatId, event, sock, userId, userName, reply);
          
        case "hard":
        case "difficile":
          return await handleQuiz(chatId, event, sock, userId, userName, [], reply, "hard");
          
        case "medium":
        case "moyen":
          return await handleQuiz(chatId, event, sock, userId, userName, [], reply, "medium");
          
        case "easy":
        case "facile":
          return await handleQuiz(chatId, event, sock, userId, userName, [], reply, "easy");
          
        case "random":
        case "aleatoire":
          return await handleQuiz(chatId, event, sock, userId, userName, [], reply);
          
        default:
          const categories = await getAvailableCategories();
          if (categories.includes(command)) {
            return await handleQuiz(chatId, event, sock, userId, userName, [command], reply);
          } else {
            return handleDefaultView(chatId, sock, reply, event);
          }
      }
    } catch (err) {
      console.error("Quiz start error:", err);
      return reply("⚠️ Erreur, réessayez plus tard.");
    }
  },

  onReply: async function ({ sock, chatId, message, senderId, event }) {
    const repliedMsgId = event.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (!repliedMsgId) return;

    const data = global.NixBot.onReply.find(
      r => r.commandName === "quiz" && r.author === senderId && r.messageID === repliedMsgId
    );
    if (!data) return;

    try {
      const ans = (message.message?.conversation || message.message?.extendedTextMessage?.text || "").trim().toUpperCase();
      if (!["A", "B", "C", "D"].includes(ans)) {
        return sock.sendMessage(chatId, {
          text: "❌ Veuillez répondre avec A, B, C ou D uniquement !"
        }, { quoted: event });
      }

      const timeSpent = (Date.now() - data.startTime) / 1000;
      if (timeSpent > 30) {
        // Remove data to prevent further replies
        const idx = global.NixBot.onReply.findIndex(r => r.messageID === data.messageID);
        if (idx !== -1) global.NixBot.onReply.splice(idx, 1);
        return sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${data.correctAnswer}`
        }, { quoted: event });
      }

      const userName = event.pushName || "Joueur";

      let userAnswer = ans;
      if ((data.isFlag || data.isAnime) && data.options) {
        const optionIndex = ans.charCodeAt(0) - 65;
        if (optionIndex >= 0 && optionIndex < data.options.length) {
          userAnswer = data.options[optionIndex];
        }
      }

      const answerData = {
        userId: senderId,
        questionId: data.questionId,
        answer: userAnswer,
        timeSpent,
        userName
      };

      const res = await axios.post(`${BASE_URL}/answer`, answerData);

      if (!res.data) {
        throw new Error('Aucune donnée reçue');
      }

      const { result, user } = res.data;
      let responseMsg;

      const balances = getDatabase('balances');
      if (!balances[senderId]) balances[senderId] = { money: 0 };

      if (result === "correct") {
        let baseMoneyReward = 10000;
        if (data.difficulty === 'hard') baseMoneyReward = 15000;
        if (data.difficulty === 'easy') baseMoneyReward = 7500;
        if (data.isFlag) baseMoneyReward = 12000;
        if (data.isAnime) baseMoneyReward = 15000;
        if (data.isDaily) baseMoneyReward = 20000;

        const streakBonus = (user.currentStreak || 0) * 1000;
        const totalMoneyReward = baseMoneyReward + streakBonus;

        balances[senderId].money += totalMoneyReward;
        saveDatabase('balances', balances);

        const difficultyBonus = data.difficulty === 'hard' ? ' 🔥' : data.difficulty === 'easy' ? ' ⭐' : '';
        const streakBonus2 = (user.currentStreak || 0) >= 5 ? ` 🚀 ${user.currentStreak}x série !` : '';
        
        responseMsg = 
          `🎉 𝗕𝗼𝗻𝗻𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲 !\n` +
          `━━━━━━━━━━\n\n` +
          `💰 𝗔𝗿𝗴𝗲𝗻𝘁: +${totalMoneyReward.toLocaleString()}\n` +
          `✨ 𝗫𝗣: +${user.xpGained || 15}\n` +
          `📊 𝗦𝗰𝗼𝗿𝗲: ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
          `🔥 𝗦𝗲́𝗿𝗶𝗲: ${user.currentStreak || 0}\n` +
          `⚡ 𝗧𝗲𝗺𝗽𝘀: ${timeSpent.toFixed(1)}s\n` +
          `🎯 𝗫𝗣 𝗧𝗼𝘁𝗮𝗹: ${user.xp || 0}/1000\n` +
          `💰 𝗦𝗼𝗹𝗱𝗲: ${balances[senderId].money.toLocaleString()}\n` +
          `👤 ${userName}` + difficultyBonus + streakBonus2;
      } else {
        responseMsg = 
          `❌ 𝗠𝗮𝘂𝘃𝗮𝗶𝘀𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲\n` +
          `━━━━━━━━━━\n\n` +
          `🎯 𝗕𝗼𝗻𝗻𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲: ${data.correctAnswer}\n` +
          `📊 𝗦𝗰𝗼𝗿𝗲: ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
          `💔 𝗦𝗲́𝗿𝗶𝗲 𝗿𝗲́𝗶𝗻𝗶𝘁𝗶𝗮𝗹𝗶𝘀𝗲́𝗲\n` +
          `👤 ${userName}` + (data.isFlag ? ' 🏁' : '') + (data.isAnime ? ' 🎌' : '');
      }

      await sock.sendMessage(chatId, { text: responseMsg }, { quoted: event });

      if (user.achievements && user.achievements.length > 0) {
        balances[senderId].money += 50000;
        saveDatabase('balances', balances);
        
        const achievementMsg = user.achievements.map(ach => `🏆 ${ach}`).join('\n');
        await sock.sendMessage(chatId, {
          text: `🏆 𝗦𝘂𝗰𝗰𝗲̀𝘀 𝗱𝗲́𝗯𝗹𝗼𝗾𝘂𝗲́ !\n${achievementMsg}\n💰 +50 000 pièces bonus !\n✨ +100 XP bonus !`
        }, { quoted: event });
      }

      // Remove reply data
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === data.messageID);
      if (idx !== -1) global.NixBot.onReply.splice(idx, 1);
      
    } catch (err) {
      console.error("Answer error:", err);
      const errorMsg = err.response?.data?.error || err.message || "Erreur inconnue";
      sock.sendMessage(chatId, {
        text: `⚠️ Erreur lors du traitement: ${errorMsg}`
      }, { quoted: event });
    }
  }
};

// ========== Gestionnaires ==========
async function handleDefaultView(chatId, sock, reply, event) {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    const categories = res.data;

    const catText = categories.map(c => `📍 ${c.charAt(0).toUpperCase() + c.slice(1)}`).join("\n");

    const msg = 
      `🎯 𝗤𝘂𝗶𝘇\n━━━━━━━━\n\n` +
      `📚 𝗖𝗮𝘁𝗲́𝗴𝗼𝗿𝗶𝗲𝘀\n\n${catText}\n\n` +
      `━━━━━━━━━\n\n` +
      `🏆 𝗨𝘁𝗶𝗹𝗶𝘀𝗮𝘁𝗶𝗼𝗻\n` +
      `• /quiz rang - Voir votre rang\n` +
      `• /quiz classement - Voir le classement\n` +
      `• /quiz vrai/faux - Jouer au quiz Vrai/Faux\n` +
      `• /quiz drapeau - Jouer au quiz de drapeaux\n` +
      `• /quiz anime - Jouer au quiz de personnages anime\n\n` +
      `🎮 Utilisez: /quiz <catégorie> pour commencer`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: event });
  } catch (err) {
    console.error("Default view error:", err);
    reply("⚠️ Impossible de récupérer les catégories. Essayez '/quiz help' pour les commandes.");
  }
}

async function handleRank(chatId, event, sock, userId, userName, reply) {
  try {
    const res = await axios.get(`${BASE_URL}/user/${userId}`);
    const user = res.data;

    if (!user || user.total === 0) {
      return reply(`❌ Vous n'avez pas encore joué au quiz ! Utilisez '/quiz aléatoire' pour commencer.\n👤 Bienvenue, ${userName}!`);
    }

    const position = user.position ?? "N/A";
    const totalUser = user.totalUsers ?? "N/A";
    const progressBar = generateProgressBar(user.percentile ?? 0);
    const title = getUserTitle(user.correct || 0);

    const balances = getDatabase('balances');
    const userMoney = balances[userId]?.money || 0;

    const currentXP = user.xp ?? 0;
    const xpProgress = Math.min(100, (currentXP / 1000) * 100);
    const xpProgressBar = generateProgressBar(xpProgress);

    const msg =
      `🎮 𝗣𝗿𝗼𝗳𝗶𝗹 𝗤𝘂𝗶𝘇\n━━━━━━━━━\n\n` +
      `👤 ${userName}\n` +
      `🎖️ ${title}\n` +
      `🏆 𝗥𝗮𝗻𝗴 𝗴𝗹𝗼𝗯𝗮𝗹: #${position}/${totalUser}\n` +
      `📈 𝗣𝗲𝗿𝗰𝗲𝗻𝘁𝗶𝗹𝗲: ${progressBar} ${user.percentile ?? 0}%\n\n` +
      `📊 𝗦𝘁𝗮𝘁𝗶𝘀𝘁𝗶𝗾𝘂𝗲𝘀\n` +
      `✅ 𝗖𝗼𝗿𝗿𝗲𝗰𝘁: ${user.correct ?? 0}\n` +
      `❌ 𝗜𝗻𝗰𝗼𝗿𝗿𝗲𝗰𝘁: ${user.wrong ?? 0}\n` +
      `📝 𝗧𝗼𝘁𝗮𝗹: ${user.total ?? 0}\n` +
      `🎯 𝗣𝗿𝗲́𝗰𝗶𝘀𝗶𝗼𝗻: ${user.accuracy ?? 0}%\n` +
      `⚡ 𝗧𝗲𝗺𝗽𝘀 𝗠𝗼𝘆𝗲𝗻: ${(user.avgResponseTime ?? 0).toFixed(1)}s\n\n` +
      `💰 𝗥𝗶𝗰𝗵𝗲𝘀𝘀𝗲 & 𝗫𝗣\n` +
      `💵 𝗔𝗿𝗴𝗲𝗻𝘁: ${userMoney.toLocaleString()}\n` +
      `✨ 𝗫𝗣: ${currentXP}/1000\n` +
      `${xpProgressBar} ${xpProgress.toFixed(1)}%\n\n` +
      `🔥 𝗜𝗻𝗳𝗼 𝗦𝗲́𝗿𝗶𝗲\n` +
      `🔥 𝗦𝗲́𝗿𝗶𝗲 𝗮𝗰𝘁𝘂𝗲𝗹𝗹𝗲: ${user.currentStreak || 0}${user.currentStreak >= 5 ? ' 🚀' : ''}\n` +
      `🏅 𝗠𝗲𝗶𝗹𝗹𝗲𝘂𝗿𝗲 𝘀𝗲́𝗿𝗶𝗲: ${user.bestStreak || 0}${user.bestStreak >= 10 ? ' 👑' : user.bestStreak >= 5 ? ' ⭐' : ''}\n\n` +
      `🎯 𝗣𝗿𝗼𝗰𝗵𝗮𝗶𝗻 𝗼𝗯𝗷𝗲𝗰𝘁𝗶𝗳: ${user.nextMilestone || "Continuez à jouer !"}`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: event });
  } catch (err) {
    console.error("Rank error:", err);
    reply("⚠️ Impossible de récupérer votre rang. Veuillez réessayer plus tard.");
  }
}

async function handleLeaderboard(chatId, event, sock, args, reply) {
  try {
    const page = parseInt(args?.[0]) || 1;
    const res = await axios.get(`${BASE_URL}/leaderboards?page=${page}&limit=8`);
    const { rankings, pagination } = res.data;

    if (!rankings || rankings.length === 0) {
      return reply("🏆 Aucun joueur trouvé dans le classement. Commencez à jouer pour être le premier !");
    }

    const players = rankings.map((u, i) => {
      const position = (pagination.currentPage - 1) * 8 + i + 1;
      const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏅";
      const title = getUserTitle(u.correct || 0);
      
      const accuracy = u.accuracy ?? (u.total > 0 ? Math.round((u.correct / u.total) * 100) : 0);
      
      return `${crown} #${position} ${u.name || 'Joueur Anonyme'}\n` +
             `🎖️ ${title}\n` +
             `📊 ${u.correct || 0} ✅ / ${u.wrong || 0} ❌ (${accuracy}%)\n` +
             `🔥 Série: ${u.currentStreak || 0} | 🏅 Meilleure: ${u.bestStreak || 0}`;
    });

    const msg = `🏆 𝗖𝗹𝗮𝘀𝘀𝗲𝗺𝗲𝗻𝘁 𝗚𝗹𝗼𝗯𝗮𝗹\n━━━━━━━━━\n\n${players.join('\n\n')}\n\n` +
                `📖 Page ${pagination.currentPage}/${pagination.totalPages}`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: event });
  } catch (err) {
    console.error("Leaderboard error:", err);
    reply("⚠️ Impossible de récupérer le classement.");
  }
}

async function handleCategories(chatId, sock, reply, event) {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    const categories = res.data;

    const catText = categories.map(c => `📍 ${c.charAt(0).toUpperCase() + c.slice(1)}`).join("\n");

    const msg = `📚 𝗖𝗮𝘁𝗲́𝗴𝗼𝗿𝗶𝗲𝘀 𝗱𝘂 𝗤𝘂𝗶𝘇\n━━━━━━━━\n\n${catText}\n\n` +
                `🎯 Utilisez: /quiz <catégorie>\n` +
                `🎲 Aléatoire: /quiz aléatoire\n` +
                `🏆 Quotidien: /quiz quotidien\n` +
                `🌟 Spécial: /quiz vrai/faux, /quiz drapeau`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: event });
  } catch (err) {
    console.error("Categories error:", err);
    reply("⚠️ Impossible de récupérer les catégories.");
  }
}

async function handleCategoryLeaderboard(chatId, event, sock, args, reply) {
  try {
    const category = args[0]?.toLowerCase();
    if (!category) {
      return reply("📚 Veuillez spécifier une catégorie pour voir le classement.");
    }

    const page = parseInt(args[1]) || 1;
    const res = await axios.get(`${BASE_URL}/leaderboard/category/${category}?page=${page}&limit=10`);
    const { users, pagination } = res.data;

    if (!users || users.length === 0) {
      return reply(`🏆 Aucun joueur trouvé pour la catégorie : ${category}.`);
    }

    const players = users.map((u, i) => {
      const position = (pagination.currentPage - 1) * 10 + i + 1;
      const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏅";
      const title = getUserTitle(u.correct || 0);
      return `${crown} #${position} ${u.name || 'Joueur Anonyme'}\n🎖️ ${title}\n📊 ${u.correct || 0}/${u.total || 0} (${u.accuracy || 0}%)`;
    });

    const msg = `🏆 𝗖𝗹𝗮𝘀𝘀𝗲𝗺𝗲𝗻𝘁 : ${category.charAt(0).toUpperCase() + category.slice(1)}\n━━━━━━━━━\n\n${players.join('\n\n')}\n\n` +
                `📖 Page ${pagination.currentPage}/${pagination.totalPages}`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: event });
  } catch (err) {
    console.error("Category leaderboard error:", err);
    reply("⚠️ Impossible de récupérer le classement de la catégorie.");
  }
}

async function handleDailyChallenge(chatId, event, sock, userId, userName, reply) {
  try {
    const res = await axios.get(`${BASE_URL}/challenge/daily?userId=${userId}`);
    let { question, challengeDate, reward, streak } = res.data;

    const translatedData = await translateQuestion({
      question: question.question,
      options: question.options,
      answer: question.answer,
      _id: question._id
    });

    const optText = translatedData.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

    const sent = await sock.sendMessage(chatId, {
      text: `🌟 𝗗𝗲́𝗳𝗶 𝗤𝘂𝗼𝘁𝗶𝗱𝗶𝗲𝗻\n━━━━━━━━━\n\n` +
            `📅 ${challengeDate}\n` +
            `🎯 Récompense bonus: +${reward} XP\n` +
            `🔥 Série quotidienne: ${streak}\n\n\n` +
            `❓ ${translatedData.question}\n\n${optText}\n\n⏰ 30 secondes pour répondre !`
    }, { quoted: event });

    global.NixBot.onReply.push({
      commandName: "quiz",
      messageID: sent.key.id,
      author: userId,
      correctAnswer: translatedData.answer,
      options: translatedData.options,
      questionId: translatedData._id,
      startTime: Date.now(),
      isDaily: true,
      difficulty: "daily"
    });

    setTimeout(() => {
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === sent.key.id);
      if (idx !== -1) {
        global.NixBot.onReply.splice(idx, 1);
        sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${translatedData.answer}`
        }, { quoted: event }).catch(() => {});
      }
    }, 30000);

  } catch (err) {
    console.error("Daily challenge error:", err);
    reply("⚠️ Impossible de créer le défi quotidien.");
  }
}

async function handleTrueOrFalse(chatId, event, sock, userId, userName, reply) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=torf&userId=${userId}`);
    let { _id, question, answer } = res.data;

    const translatedData = await translateQuestion({
      question: question,
      options: ["True", "False"],
      answer: answer,
      _id: _id
    });

    const sent = await sock.sendMessage(chatId, {
      text: `⚙ 𝗤𝘂𝗶𝘇 ( Vrai/Faux )\n━━━━━━━━━━\n\n💭 𝗤𝘂𝗲𝘀𝘁𝗶𝗼𝗻: ${translatedData.question}\n\n` +
            `A. Vrai\nB. Faux\n\n⏰ 30 secondes pour répondre (A/B)`
    }, { quoted: event });

    global.NixBot.onReply.push({
      commandName: "quiz",
      messageID: sent.key.id,
      author: userId,
      correctAnswer: translatedData.answer,
      options: translatedData.options,
      questionId: translatedData._id,
      startTime: Date.now(),
      isTorf: true
    });

    setTimeout(() => {
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === sent.key.id);
      if (idx !== -1) {
        global.NixBot.onReply.splice(idx, 1);
        sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${translatedData.answer === "A" ? "Vrai" : "Faux"}`
        }, { quoted: event }).catch(() => {});
      }
    }, 30000);

  } catch (err) {
    console.error("True/False error:", err);
    reply("⚠️ Impossible de créer une question Vrai/Faux.");
  }
}

async function handleFlagQuiz(chatId, event, sock, userId, userName, reply) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=flag&userId=${userId}`);
    let { _id, question, options, answer } = res.data;

    const flagEmbed = {
      caption: `🏁 𝗤𝘂𝗶𝘇 𝗱𝗲 𝗗𝗿𝗮𝗽𝗲𝗮𝘂𝘅\n━━━━━━━━\n\n🌍 Devinez le pays de ce drapeau :\n\n` +
              options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n") +
              `\n\n⏰ Temps : 30 secondes pour répondre.`
    };

    let sent;
    if (question && question.startsWith('http')) {
      sent = await sock.sendMessage(chatId, {
        image: { url: question },
        caption: flagEmbed.caption
      }, { quoted: event });
    } else {
      sent = await sock.sendMessage(chatId, {
        text: flagEmbed.caption
      }, { quoted: event });
    }

    global.NixBot.onReply.push({
      commandName: "quiz",
      messageID: sent.key.id,
      author: userId,
      correctAnswer: answer,
      options: options,
      questionId: _id,
      startTime: Date.now(),
      isFlag: true
    });

    setTimeout(() => {
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === sent.key.id);
      if (idx !== -1) {
        global.NixBot.onReply.splice(idx, 1);
        sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${answer}`
        }, { quoted: event }).catch(() => {});
      }
    }, 30000);

  } catch (err) {
    console.error("Flag quiz error:", err);
    reply("⚠️ Impossible de créer un quiz de drapeau.");
  }
}

async function handleAnimeQuiz(chatId, event, sock, userId, userName, reply) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=anime&userId=${userId}`);
    let { _id, question, options, answer, imageUrl } = res.data;

    const translatedData = await translateQuestion({
      question: question,
      options: options,
      answer: answer,
      _id: _id
    });

    const animeEmbed = {
      caption: `🎌 𝗤𝘂𝗶𝘇 𝗔𝗻𝗶𝗺𝗲\n━━━━━━━━\n\n❔ 𝗜𝗻𝗱𝗶𝗰𝗲 : ${translatedData.question}\n\n` +
              translatedData.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n") +
              `\n\n⏰ Temps : 30 secondes\n🎯 Défi de reconnaissance de personnages animés !`
    };

    let sent;
    if (imageUrl && imageUrl.startsWith('http')) {
      sent = await sock.sendMessage(chatId, {
        image: { url: imageUrl },
        caption: animeEmbed.caption
      }, { quoted: event });
    } else {
      sent = await sock.sendMessage(chatId, {
        text: animeEmbed.caption
      }, { quoted: event });
    }

    global.NixBot.onReply.push({
      commandName: "quiz",
      messageID: sent.key.id,
      author: userId,
      correctAnswer: translatedData.answer,
      options: translatedData.options,
      questionId: _id,
      startTime: Date.now(),
      isAnime: true
    });

    setTimeout(() => {
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === sent.key.id);
      if (idx !== -1) {
        global.NixBot.onReply.splice(idx, 1);
        sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${translatedData.answer}\n🎌 Continuez à regarder des animés pour améliorer vos compétences !`
        }, { quoted: event }).catch(() => {});
      }
    }, 30000);

  } catch (err) {
    console.error("Anime quiz error:", err);
    reply("⚠️ Impossible de créer un quiz anime.");
  }
}

async function handleQuiz(chatId, event, sock, userId, userName, args, reply, forcedDifficulty = null) {
  try {
    const category = args[0]?.toLowerCase() || "";

    let queryParams = { userId: userId };
    if (category && category !== "random") {
      queryParams.category = category;
    }
    if (forcedDifficulty) {
      queryParams.difficulty = forcedDifficulty;
    }

    const res = await axios.get(`${BASE_URL}/question`, { params: queryParams });
    let { _id, question, options, answer, category: qCategory, difficulty } = res.data;

    const translatedData = await translateQuestion({
      _id,
      question,
      options,
      answer,
      category: qCategory,
      difficulty
    });

    const optText = translatedData.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

    const sent = await sock.sendMessage(chatId, {
      text: `🎯 𝗗𝗲́𝗳𝗶 𝗤𝘂𝗶𝘇\n━━━━━━━━━━\n\n` +
            `📚 𝖢𝖺𝗍𝖾́𝗀𝗈𝗋𝗂𝖾: ${translatedData.category?.charAt(0).toUpperCase() + translatedData.category?.slice(1) || "Aléatoire"}\n` +
            `🎚️ 𝖣𝗂𝖿𝖿𝗂𝖼𝗎𝗅𝗍𝖾́: ${translatedData.difficulty?.charAt(0).toUpperCase() + translatedData.difficulty?.slice(1) || "Moyen"}\n` +
            `❓ 𝗤𝘂𝗲𝘀𝘁𝗶𝗼𝗻: ${translatedData.question}\n\n${optText}\n\n` +
            `⏰ 𝖵𝗈𝗎𝗌 𝖺𝗏𝖾𝗓 30 𝗌𝖾𝖼𝗈𝗇𝖽𝖾𝗌 𝗉𝗈𝗎𝗋 𝗋épondre (A/B/C/D):`
    }, { quoted: event });

    global.NixBot.onReply.push({
      commandName: "quiz",
      messageID: sent.key.id,
      author: userId,
      correctAnswer: translatedData.answer,
      options: translatedData.options,
      questionId: translatedData._id,
      startTime: Date.now(),
      difficulty: translatedData.difficulty,
      category: translatedData.category
    });

    setTimeout(() => {
      const idx = global.NixBot.onReply.findIndex(r => r.messageID === sent.key.id);
      if (idx !== -1) {
        global.NixBot.onReply.splice(idx, 1);
        sock.sendMessage(chatId, {
          text: `⏰ Temps écoulé ! La bonne réponse était: ${translatedData.answer}`
        }, { quoted: event }).catch(() => {});
      }
    }, 30000);

  } catch (err) {
    console.error("Quiz error:", err);
    reply("⚠️ Impossible de récupérer une question. Essayez '/quiz categories' pour voir les options disponibles.");
  }
}