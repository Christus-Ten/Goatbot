const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'https://qizapi.onrender.com/api';

// Fonction de traduction (MyMemory)
async function translateToFrench(text) {
  if (!text) return text;
  try {
    const { data } = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fr`);
    if (data.responseStatus === 200 && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
  } catch (e) {
    console.error("Erreur traduction:", e.message);
  }
  return text; // fallback
}

module.exports = {
  config: {
    name: "quiz",
    aliases: ["qz"],
    version: "3.0",
    author: "۝𝑪𝑯𝑹𝑰𝑺𝑻𝑼𝑺۝",
    countDown: 0,
    role: 0,
    shortDescription: "Jouez à des quiz et gagnez des récompenses",
    longDescription: "Quiz interactif avec plusieurs catégories, classements, défis quotidiens, vrai/faux, drapeaux, anime.",
    category: "game",
    guide: {
      en: "{pn} <category> — Start a quiz in the chosen category.\n" +
           "Available commands: rank, leaderboard, category, daily, torf, flag, anime, random, easy, medium, hard"
    },
    nixPrefix: true
  },

  // Helper methods
  generateProgressBar(percentile) {
    const filled = Math.round(percentile / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  },

  getUserTitle(correct) {
    if (correct >= 50000) return '🌟 Quiz Omniscient';
    if (correct >= 25000) return '💎 Quiz Divin';
    if (correct >= 15000) return '⚡ Titan du Quiz';
    if (correct >= 10000) return '🏆 Légende du Quiz';
    if (correct >= 7500) return '🎓 Grand Maître';
    if (correct >= 5000) return '👨‍🎓 Maître du Quiz';
    if (correct >= 2500) return '🔥 Expert en Quiz';
    if (correct >= 1500) return '📚 Savant du Quiz';
    if (correct >= 1000) return '🎯 Apprenti Quiz';
    if (correct >= 750) return '🌟 Chercheur de Savoir';
    if (correct >= 500) return '📖 Apprentissage Rapide';
    if (correct >= 250) return '🚀 Étoile Montante';
    if (correct >= 100) return '💡 Débutant Prometteur';
    if (correct >= 50) return '🎪 Premiers Pas';
    if (correct >= 25) return '🌱 Nouveau Venu';
    if (correct >= 10) return '🔰 Apprenti';
    if (correct >= 1) return '👶 Recrue';
    return '🆕 Nouveau Joueur';
  },

  async getUserName(usersData, senderId, pushName) {
    if (pushName) return pushName;
    try {
      const userData = await usersData.get(senderId);
      return userData.name || 'Joueur Anonyme';
    } catch {
      return 'Joueur Anonyme';
    }
  },

  async getAvailableCategories() {
    try {
      const res = await axios.get(`${BASE_URL}/categories`);
      return res.data.map(cat => cat.toLowerCase());
    } catch {
      return [];
    }
  },

  // Main handlers
  onStart: async function ({ sock, chatId, event, args, senderId, usersData, reply }) {
    const command = args[0]?.toLowerCase();

    try {
      if (!args[0] || command === "help") {
        return await this.handleDefaultView(sock, chatId, event);
      }

      switch (command) {
        case "rank":
        case "profile":
          return await this.handleRank(sock, chatId, event, senderId, usersData);
        case "leaderboard":
        case "lb":
          return await this.handleLeaderboard(sock, chatId, event, args.slice(1), usersData);
        case "category":
          if (args.length > 1) {
            return await this.handleCategoryLeaderboard(sock, chatId, event, args.slice(1), usersData);
          }
          return await this.handleCategories(sock, chatId, event);
        case "daily":
          return await this.handleDailyChallenge(sock, chatId, event, senderId, this.config.name, usersData);
        case "torf":
          return await this.handleTrueOrFalse(sock, chatId, event, senderId, this.config.name, usersData);
        case "flag":
          return await this.handleFlagQuiz(sock, chatId, event, senderId, this.config.name, usersData);
        case "anime":
          return await this.handleAnimeQuiz(sock, chatId, event, senderId, this.config.name, usersData);
        case "hard":
          return await this.handleQuiz(sock, chatId, event, senderId, ["general"], this.config.name, "hard", usersData);
        case "medium":
          return await this.handleQuiz(sock, chatId, event, senderId, ["general"], this.config.name, "medium", usersData);
        case "easy":
          return await this.handleQuiz(sock, chatId, event, senderId, ["general"], this.config.name, "easy", usersData);
        case "random":
          return await this.handleQuiz(sock, chatId, event, senderId, [], this.config.name, null, usersData);
        default:
          const categories = await this.getAvailableCategories();
          if (categories.includes(command)) {
            return await this.handleQuiz(sock, chatId, event, senderId, [command], this.config.name, null, usersData);
          } else {
            return await this.handleDefaultView(sock, chatId, event);
          }
      }
    } catch (err) {
      console.error("Erreur dans onStart:", err);
      return sock.sendMessage(chatId, { text: "⚠️ Une erreur est survenue, réessaye plus tard." }, { quoted: event });
    }
  },

  onReply: async function ({ sock, chatId, event, message, usersData }) {
    const repliedMsgId = event.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (!repliedMsgId) return;

    const replyIndex = global.NixBot.onReply.findIndex(r => r.commandName === "quiz" && r.messageID === repliedMsgId);
    if (replyIndex === -1) return;

    const Reply = global.NixBot.onReply[replyIndex];
    if (Reply.author !== event.senderId) return;

    try {
      const ans = event.message?.conversation || event.message?.extendedTextMessage?.text || "";
      const trimmedAns = ans.trim().toUpperCase();
      if (!["A", "B", "C", "D"].includes(trimmedAns)) {
        return sock.sendMessage(chatId, { text: "❌ Réponds uniquement avec A, B, C ou D." }, { quoted: event });
      }

      const timeSpent = (Date.now() - Reply.startTime) / 1000;
      if (timeSpent > 30) {
        return sock.sendMessage(chatId, { text: "⏰ Temps écoulé !" }, { quoted: event });
      }

      const pushName = event.pushName;
      const userName = await this.getUserName(usersData, event.senderId, pushName);

      let correctAnswer = Reply.answer;
      let userAnswer = trimmedAns;

      if ((Reply.isFlag || Reply.isAnime) && Reply.options) {
        const optionIndex = trimmedAns.charCodeAt(0) - 65;
        if (optionIndex >= 0 && optionIndex < Reply.options.length) {
          userAnswer = Reply.options[optionIndex];
        }
      }

      const answerData = {
        userId: event.senderId,
        questionId: Reply.questionId,
        answer: userAnswer,
        timeSpent,
        userName
      };

      const res = await axios.post(`${BASE_URL}/answer`, answerData);
      if (!res.data) throw new Error('Pas de réponse de l\'API');

      const { result, user } = res.data;
      let responseMsg;

      if (result === "correct") {
        const userData = await usersData.get(event.senderId) || {};

        let baseMoneyReward = 10000;
        if (Reply.difficulty === 'hard') baseMoneyReward = 15000;
        if (Reply.difficulty === 'easy') baseMoneyReward = 7500;
        if (Reply.isFlag) baseMoneyReward = 12000;
        if (Reply.isAnime) baseMoneyReward = 15000;
        if (Reply.isDailyChallenge) baseMoneyReward = 20000;

        const streakBonus = (user.currentStreak || 0) * 1000;
        const totalMoneyReward = baseMoneyReward + streakBonus;

        userData.money = (userData.money || 0) + totalMoneyReward;
        await usersData.set(event.senderId, userData);

        const difficultyBonus = Reply.difficulty === 'hard' ? ' 🔥' : Reply.difficulty === 'easy' ? ' ⭐' : '';
        const streakBonus2 = (user.currentStreak || 0) >= 5 ? ` 🚀 x${user.currentStreak} série !` : '';
        const flagBonus = Reply.isFlag ? ' 🏁' : '';
        const animeBonus = Reply.isAnime ? ' 🎌' : '';
        const dailyBonus = Reply.isDailyChallenge ? ' 🌟' : '';

        responseMsg = `🎉 Bonne réponse !\n` +
          `💰 Argent : +${totalMoneyReward.toLocaleString()}\n` +
          `✨ XP : +${user.xpGained || 15}\n` +
          `📊 Score : ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
          `🔥 Série : ${user.currentStreak || 0}\n` +
          `⚡ Temps : ${timeSpent.toFixed(1)}s\n` +
          `🎯 Progression XP : ${user.xp || 0}/1000\n` +
          `👤 ${userName}` + difficultyBonus + streakBonus2 + flagBonus + animeBonus + dailyBonus;
      } else {
        responseMsg = `❌ Mauvaise réponse ! Bonne réponse : ${correctAnswer}\n` +
          `📊 Score : ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
          `💔 Série réinitialisée\n` +
          `👤 ${userName}` + (Reply.isFlag ? ' 🏁' : '') + (Reply.isAnime ? ' 🎌' : '');
      }

      await sock.sendMessage(chatId, { text: responseMsg }, { quoted: event });

      if (user.achievements && user.achievements.length > 0) {
        const achievementMsg = user.achievements.map(ach => `🏆 ${ach}`).join('\n');
        await sock.sendMessage(chatId, {
          text: `🏆 Succès débloqué !\n${achievementMsg}\n💰 +50 000 pièces bonus !\n✨ +100 XP bonus !`
        });

        const userData = await usersData.get(event.senderId) || {};
        userData.money = (userData.money || 0) + 50000;
        await usersData.set(event.senderId, userData);
      }

      // Supprimer le message original de la question si possible
      try {
        await sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: Reply.messageID } });
      } catch (e) {}

      global.NixBot.onReply.splice(replyIndex, 1);
    } catch (err) {
      console.error("Erreur dans onReply:", err);
      const errorMsg = err.response?.data?.error || err.message || "Erreur inconnue";
      sock.sendMessage(chatId, { text: `⚠️ Erreur lors du traitement : ${errorMsg}` }, { quoted: event });
    }
  },

  onReaction: async function ({ sock, event, usersData }) {
    const messageId = event.message?.reactionMessage?.key?.id || event.key?.id;
    if (!messageId) return;

    const reactionData = global.NixBot.onReaction?.get(messageId);
    if (!reactionData) return;

    const { author, answer, reacted, questionId, startTime, commandName, reward } = reactionData;
    if (event.userId !== author || reacted) return;

    try {
      const timeSpent = (Date.now() - startTime) / 1000;
      if (timeSpent > 30) {
        return sock.sendMessage(event.threadId || event.chatId, { text: "⏰ Temps écoulé !" });
      }

      const userAnswer = event.reaction === '😆' ? "A" : "B"; // 😆 pour Vrai, 😮? mais on adapte selon l'emoji utilisé
      // Dans handleTrueOrFalse on a utilisé 😆 pour Vrai et 😮 pour Faux? Il faut vérifier le code original.
      // Original: "😆" et "😮" (ou autre). On va garder la même logique : si réaction = 😆 -> A (Vrai), sinon B (Faux)
      const isCorrect = userAnswer === answer;

      const pushName = event.pushName;
      const userName = await this.getUserName(usersData, author, pushName);

      const answerData = {
        userId: author,
        questionId: questionId,
        answer: userAnswer,
        timeSpent,
        userName
      };

      const res = await axios.post(`${BASE_URL}/answer`, answerData);
      const { user, xpGained } = res.data;

      const userData = await usersData.get(author) || {};
      if (isCorrect) {
        const baseMoneyReward = reward || 10000;
        const streakBonus = (user.currentStreak || 0) * 1000;
        const totalMoneyReward = baseMoneyReward + streakBonus;

        userData.money = (userData.money || 0) + totalMoneyReward;
        await usersData.set(author, userData);

        const correctText = answer === "A" ? "Vrai" : "Faux";

        const successMsg = `🎉 Bravo ! Bonne réponse !\n` +
          `──────────────\n\n` +
          `💰 Argent gagné : +${totalMoneyReward.toLocaleString()} 💰\n` +
          `✨ XP gagné : +${xpGained || 15} ⚡\n` +
          `🔥 Série : ${user.currentStreak || 0} 🚀\n` +
          `⏱️ Temps : ${timeSpent.toFixed(1)}s\n\n` +
          `🎯 Continue comme ça ! 🌟`;
        await sock.sendMessage(event.threadId || event.chatId, { text: successMsg });
      } else {
        const correctText = answer === "A" ? "Vrai" : "Faux";
        await sock.sendMessage(event.threadId || event.chatId, {
          text: `❌ Mauvaise réponse ! Bonne réponse : ${correctText} ✅\n` +
                `💔 Série réinitialisée\n` +
                `👤 ${userName}`
        });
      }

      reactionData.reacted = true;
      setTimeout(() => global.NixBot.onReaction.delete(messageId), 1000);
    } catch (err) {
      console.error("Erreur dans onReaction:", err);
    }
  },

  // Views handlers
  async handleDefaultView(sock, chatId, event) {
    try {
      const res = await axios.get(`${BASE_URL}/categories`);
      const categories = res.data;
      const catText = categories.map(c => `📚 ${c.charAt(0).toUpperCase() + c.slice(1)}`).join("\n");

      return sock.sendMessage(chatId, {
        text: `🎯 **Quiz**\n────────────────\n\n` +
              `📡 **Catégories disponibles**\n\n${catText}\n\n` +
              `────────────────\n\n` +
              `🏆 Utilisation\n` +
              `• quiz rank - Voir ton profil\n` +
              `• quiz leaderboard - Classement global\n` +
              `• quiz torf - Vrai/Faux (réagis avec 😆 ou 😮)\n` +
              `• quiz flag - Devine le drapeau\n` +
              `• quiz anime - Devine le personnage d’anime\n\n` +
              `🎮 Utilise : quiz <catégorie> pour commencer`
      }, { quoted: event });
    } catch {
      return sock.sendMessage(chatId, {
        text: "⚠️ Impossible de charger les catégories. Essaie 'quiz help' pour les commandes."
      }, { quoted: event });
    }
  },

  async handleRank(sock, chatId, event, senderId, usersData) {
    try {
      const pushName = event.pushName;
      const userName = await this.getUserName(usersData, senderId, pushName);
      await axios.post(`${BASE_URL}/user/update`, { userId: senderId, name: userName });

      const res = await axios.get(`${BASE_URL}/user/${senderId}`);
      const user = res.data;

      if (!user || user.total === 0) {
        return sock.sendMessage(chatId, {
          text: `❌ Tu n'as encore joué à aucun quiz ! Utilise 'quiz random' pour commencer.\n👤 Bienvenue, ${userName} !`
        }, { quoted: event });
      }

      const position = user.position ?? "N/A";
      const totalUser = user.totalUsers ?? "N/A";
      const progressBar = this.generateProgressBar(user.percentile ?? 0);
      const title = this.getUserTitle(user.correct || 0);
      const streakInfo = user.currentStreak > 0 ? `🔥 Série actuelle : ${user.currentStreak}${user.currentStreak >= 5 ? ' 🚀' : ''}` : `🔥 Série actuelle : 0`;
      const bestStreakInfo = user.bestStreak > 0 ? `🏅 Meilleure série : ${user.bestStreak}${user.bestStreak >= 10 ? ' 💎' : user.bestStreak >= 5 ? ' ⭐' : ''}` : `🏅 Meilleure série : 0`;
      const userData = await usersData.get(senderId) || {};
      const userMoney = userData.money || 0;
      const currentXP = user.xp ?? 0;
      const xpTo1000 = Math.max(0, 1000 - currentXP);
      const xpProgress = Math.min(100, (currentXP / 1000) * 100);
      const xpProgressBar = this.generateProgressBar(xpProgress);

      return sock.sendMessage(chatId, {
        text: `🎮 **Profil Quiz**\n────────────────\n\n` +
              `👤 ${userName}\n` +
              `🎖️ ${title}\n` +
              `🏆 Rang global : #${position}/${totalUser}\n` +
              `📈 Percentile : ${progressBar} ${user.percentile ?? 0}%\n\n` +
              `📊 **Statistiques**\n` +
              `✅ Bonnes : ${user.correct ?? 0}\n` +
              `❌ Mauvaises : ${user.wrong ?? 0}\n` +
              `📝 Total : ${user.total ?? 0}\n` +
              `🎯 Précision : ${user.accuracy ?? 0}%\n` +
              `⚡ Temps moyen : ${(user.avgResponseTime ?? 0).toFixed(1)}s\n\n` +
              `💰 **Argent & XP**\n` +
              `💰 Argent : ${userMoney.toLocaleString()}\n` +
              `✨ XP : ${currentXP}/1000\n` +
              `🎯 XP restant : ${xpTo1000}\n` +
              `${xpProgressBar} ${xpProgress.toFixed(1)}%\n\n` +
              `🔥 **Séries**\n` +
              `${streakInfo}\n` +
              `${bestStreakInfo}\n\n` +
              `🎯 Prochain palier : ${user.nextMilestone || "Continue à jouer !"}`
      }, { quoted: event });
    } catch {
      return sock.sendMessage(chatId, {
        text: "⚠️ Impossible de récupérer ton profil. Réessaie plus tard."
      }, { quoted: event });
    }
  },

  async handleLeaderboard(sock, chatId, event, args, usersData) {
    try {
      const page = parseInt(args?.[0]) || 1;
      const res = await axios.get(`${BASE_URL}/leaderboards?page=${page}&limit=8`);
      const { rankings, stats, pagination } = res.data;

      if (!rankings || rankings.length === 0) {
        return sock.sendMessage(chatId, { text: "🏆 Aucun joueur dans le classement. Sois le premier !" }, { quoted: event });
      }

      const now = new Date();
      const currentDate = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      const currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

      const players = await Promise.all(rankings.map(async (u, i) => {
        let userName = u.name || 'Joueur Anonyme';
        if (u.userId && userName === 'Joueur Anonyme') {
          userName = await this.getUserName(usersData, u.userId) || 'Joueur Anonyme';
        }
        const position = (pagination.currentPage - 1) * 8 + i + 1;
        const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : position <= 10 ? "🏅" : "🎯";
        const title = this.getUserTitle(u.correct || 0);
        const level = u.level ?? Math.floor((u.correct || 0) / 50) + 1;
        const xp = u.xp ?? (u.correct || 0) * 10;
        const accuracy = u.accuracy ?? (u.total > 0 ? Math.round((u.correct / u.total) * 100) : 0);
        const avgResponseTime = typeof u.avgResponseTime === 'number' ? `${u.avgResponseTime.toFixed(2)}s` : 'N/A';
        const fastest = u.fastestResponse?.toFixed(2) || 'N/A';
        const slowest = u.slowestResponse?.toFixed(2) || 'N/A';
        const playTime = u.totalPlayTime ? `${(u.totalPlayTime / 60).toFixed(1)} min` : '0 min';
        const games = u.gamesPlayed || u.total || 0;
        const perfectGames = u.perfectGames || 0;
        const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : 'Inconnue';

        return `${crown} #${position} ${userName}\n` +
               `🎖️ ${title} | 🌟 Niv.${level} | ✨ XP: ${xp.toLocaleString()}\n` +
               `📊 ${u.correct} ✅ / ${u.wrong} ❌ (Précision: ${accuracy}%)\n` +
               `🔥 Série actuelle: ${u.currentStreak || 0} | 🏅 Meilleure: ${u.bestStreak || 0}\n` +
               `⚡ Temps moyen: ${avgResponseTime} | 🚀 Plus rapide: ${fastest}s | 🐢 Plus lent: ${slowest}s\n` +
               `🎯 Questions: ${u.questionsAnswered} | Parties: ${games}\n` +
               `🎮 Temps de jeu: ${playTime} | 📈 Sans faute: ${perfectGames}\n` +
               `📅 Inscrit: ${joinDate}`;
      }));

      return sock.sendMessage(chatId, {
        text: `🏆 **Classement Global**\n────────────────\n\n` +
              `📅 ${currentDate}\n⏰ ${currentTime} UTC\n\n` +
              `────────────────\n\n${players.join('\n\n')}\n\n` +
              `📖 Page ${pagination?.currentPage || 1}/${pagination?.totalPages || 1} | 👥 Total: ${stats?.totalUsers || 0}\n` +
              `🔁 Utilise: quiz leaderboard <page>`
      }, { quoted: event });
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de récupérer le classement." }, { quoted: event });
    }
  },

  async handleCategories(sock, chatId, event) {
    try {
      const res = await axios.get(`${BASE_URL}/categories`);
      const categories = res.data;
      const catText = categories.map(c => `📚 ${c.charAt(0).toUpperCase() + c.slice(1)}`).join("\n");

      return sock.sendMessage(chatId, {
        text: `📡 **Catégories de Quiz**\n────────────────\n\n${catText}\n\n` +
              `🎯 Utilise: quiz <catégorie>\n` +
              `🎲 Aléatoire: quiz random\n` +
              `🏆 Défi quotidien: quiz daily\n` +
              `🌟 Spéciaux: quiz torf, quiz flag, quiz anime`
      }, { quoted: event });
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de récupérer les catégories." }, { quoted: event });
    }
  },

  async handleCategoryLeaderboard(sock, chatId, event, args, usersData) {
    try {
      const category = args[0]?.toLowerCase();
      if (!category) {
        return sock.sendMessage(chatId, { text: "📚 Précise une catégorie pour voir son classement." }, { quoted: event });
      }
      const page = parseInt(args[1]) || 1;
      const res = await axios.get(`${BASE_URL}/leaderboard/category/${category}?page=${page}&limit=10`);
      const { users, pagination } = res.data;

      if (!users || users.length === 0) {
        return sock.sendMessage(chatId, { text: `🏆 Aucun joueur trouvé pour la catégorie : ${category}.` }, { quoted: event });
      }

      const topPlayersWithNames = await Promise.all(users.map(async (u, i) => {
        let userName = 'Joueur Anonyme';
        if (u.userId) {
          userName = await this.getUserName(usersData, u.userId) || 'Joueur Anonyme';
        }
        const position = (pagination.currentPage - 1) * 10 + i + 1;
        const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏅";
        const title = this.getUserTitle(u.correct || 0);
        return `${crown} #${position} ${userName}\n🎖️ ${title}\n📊 ${u.correct || 0}/${u.total || 0} (${u.accuracy || 0}%)`;
      }));

      return sock.sendMessage(chatId, {
        text: `🏆 **Classement : ${category.charAt(0).toUpperCase() + category.slice(1)}**\n────────────────\n\n${topPlayersWithNames.join('\n\n')}\n\n` +
              `📖 Page ${pagination.currentPage}/${pagination.totalPages}\n` +
              `👥 Total Joueurs : ${pagination.totalUsers}`
      }, { quoted: event });
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de récupérer le classement de cette catégorie." }, { quoted: event });
    }
  },

  async handleDailyChallenge(sock, chatId, event, senderId, commandName, usersData) {
    try {
      const res = await axios.get(`${BASE_URL}/challenge/daily?userId=${senderId}`);
      const { question, challengeDate, reward, streak } = res.data;

      const translatedQuestion = await translateToFrench(question.question);

      const optText = question.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

      const sentMsg = await sock.sendMessage(chatId, {
        text: `🌟 **Défi Quotidien**\n────────────────\n\n` +
              `📅 ${challengeDate}\n` +
              `🎯 Bonus : +${reward} XP\n` +
              `🔥 Série quotidienne : ${streak}\n\n\n` +
              `❓ ${translatedQuestion}\n\n${optText}\n\n⏰ 30 secondes pour répondre !`
      }, { quoted: event });

      if (!global.NixBot.onReply) global.NixBot.onReply = [];
      global.NixBot.onReply.push({
        commandName,
        author: senderId,
        messageID: sentMsg.key.id,
        answer: question.answer,
        questionId: question._id,
        startTime: Date.now(),
        isDailyChallenge: true,
        bonusReward: reward
      });

      setTimeout(() => {
        const index = global.NixBot.onReply.findIndex(r => r.messageID === sentMsg.key.id);
        if (index !== -1) {
          sock.sendMessage(chatId, { text: `⏰ Temps écoulé ! La bonne réponse était : ${question.answer}` });
          try { sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: sentMsg.key.id } }); } catch (e) {}
          global.NixBot.onReply.splice(index, 1);
        }
      }, 30000);
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de créer le défi quotidien." }, { quoted: event });
    }
  },

  async handleTrueOrFalse(sock, chatId, event, senderId, commandName, usersData) {
    try {
      const res = await axios.get(`${BASE_URL}/question?category=torf&userId=${senderId}`);
      const { _id, question, answer } = res.data;

      const translatedQuestion = await translateToFrench(question);

      const sentMsg = await sock.sendMessage(chatId, {
        text: `⚙️ **Quiz ( Vrai/Faux )**\n───────────────────\n\n💬 Question : ${translatedQuestion}\n\n😆 : Vrai\n😮 : Faux\n\nRéagis avec l'emoji correspondant.\n⏰ 30 secondes pour répondre.`
      }, { quoted: event });

      const correctAnswer = answer.toUpperCase(); // Devrait être "A" ou "B"

      if (!global.NixBot.onReaction) global.NixBot.onReaction = new Map();
      global.NixBot.onReaction.set(sentMsg.key.id, {
        commandName,
        author: senderId,
        messageID: sentMsg.key.id,
        answer: correctAnswer,
        reacted: false,
        reward: 10000,
        questionId: _id,
        startTime: Date.now()
      });

      setTimeout(() => {
        const reaction = global.NixBot.onReaction.get(sentMsg.key.id);
        if (reaction && !reaction.reacted) {
          const correctText = correctAnswer === "A" ? "Vrai" : "Faux";
          sock.sendMessage(chatId, { text: `⏰ Temps écoulé ! Bonne réponse : ${correctText}` });
          try { sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: sentMsg.key.id } }); } catch (e) {}
          global.NixBot.onReaction.delete(sentMsg.key.id);
        }
      }, 30000);
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de créer une question Vrai/Faux." }, { quoted: event });
    }
  },

  async handleFlagQuiz(sock, chatId, event, senderId, commandName, usersData) {
    try {
      const res = await axios.get(`${BASE_URL}/question?category=flag&userId=${senderId}`);
      const { _id, question, options, answer } = res.data;

      // Télécharger l'image du drapeau
      let imageBuffer = null;
      if (question) {
        const imgRes = await axios.get(question, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(imgRes.data);
      }

      const optText = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

      const sentMsg = await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: `🏁 **Quiz Drapeau**\n────────────────\n\n🌍 Devine le pays de ce drapeau :\n\n${optText}\n\n⏰ Temps : 30 secondes pour répondre.`
      }, { quoted: event });

      if (!global.NixBot.onReply) global.NixBot.onReply = [];
      global.NixBot.onReply.push({
        commandName,
        author: senderId,
        messageID: sentMsg.key.id,
        answer,
        options,
        questionId: _id,
        startTime: Date.now(),
        isFlag: true,
        reward: 12000
      });

      setTimeout(() => {
        const index = global.NixBot.onReply.findIndex(r => r.messageID === sentMsg.key.id);
        if (index !== -1) {
          sock.sendMessage(chatId, { text: `⏰ Temps écoulé ! La bonne réponse était : ${answer}` });
          try { sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: sentMsg.key.id } }); } catch (e) {}
          global.NixBot.onReply.splice(index, 1);
        }
      }, 30000);
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de créer un quiz drapeau." }, { quoted: event });
    }
  },

  async handleAnimeQuiz(sock, chatId, event, senderId, commandName, usersData) {
    try {
      const res = await axios.get(`${BASE_URL}/question?category=anime&userId=${senderId}`);
      const { _id, question, options, answer, imageUrl } = res.data;

      const translatedHint = await translateToFrench(question);

      let imageBuffer = null;
      if (imageUrl) {
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(imgRes.data);
      }

      const optText = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

      const sentMsg = await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: `🎌 **Quiz Anime**\n────────────────\n\n💭 Indice : ${translatedHint}\n\n${optText}\n\n⏰ Temps : 30 secondes\n🎯 Reconnais le personnage !`
      }, { quoted: event });

      if (!global.NixBot.onReply) global.NixBot.onReply = [];
      global.NixBot.onReply.push({
        commandName,
        author: senderId,
        messageID: sentMsg.key.id,
        answer,
        options,
        questionId: _id,
        startTime: Date.now(),
        isAnime: true,
        reward: 15000
      });

      setTimeout(() => {
        const index = global.NixBot.onReply.findIndex(r => r.messageID === sentMsg.key.id);
        if (index !== -1) {
          sock.sendMessage(chatId, { text: `⏰ Temps écoulé ! La bonne réponse était : ${answer}\n🎌 Continue à regarder des animes pour t'améliorer !` });
          try { sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: sentMsg.key.id } }); } catch (e) {}
          global.NixBot.onReply.splice(index, 1);
        }
      }, 30000);
    } catch {
      return sock.sendMessage(chatId, { text: "⚠️ Impossible de créer un quiz anime." }, { quoted: event });
    }
  },

  async handleQuiz(sock, chatId, event, senderId, args, commandName, forcedDifficulty = null, usersData) {
    try {
      const pushName = event.pushName;
      const userName = await this.getUserName(usersData, senderId, pushName);
      await axios.post(`${BASE_URL}/user/update`, { userId: senderId, name: userName });

      const category = args[0]?.toLowerCase() || "";
      let queryParams = { userId: senderId };
      if (category && category !== "random") queryParams.category = category;
      if (forcedDifficulty) queryParams.difficulty = forcedDifficulty;

      const res = await axios.get(`${BASE_URL}/question`, { params: queryParams });
      const { _id, question, options, answer, category: qCategory, difficulty } = res.data;

      const translatedQuestion = await translateToFrench(question);

      const optText = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

      const sentMsg = await sock.sendMessage(chatId, {
        text: `🎯 **Quiz Interactif**\n──────────────────\n\n` +
              `📚 Catégorie : ${qCategory?.charAt(0).toUpperCase() + qCategory?.slice(1) || "Aléatoire"}\n` +
              `🎚️ Difficulté : ${difficulty?.charAt(0).toUpperCase() + difficulty?.slice(1) || "Moyenne"}\n` +
              `❓ Question : ${translatedQuestion}\n\n${optText}\n\n⏰ 30 secondes pour répondre (A/B/C/D) :`
      }, { quoted: event });

      if (!global.NixBot.onReply) global.NixBot.onReply = [];
      global.NixBot.onReply.push({
        commandName,
        author: senderId,
        messageID: sentMsg.key.id,
        answer,
        questionId: _id,
        startTime: Date.now(),
        difficulty,
        category: qCategory
      });

      setTimeout(() => {
        const index = global.NixBot.onReply.findIndex(r => r.messageID === sentMsg.key.id);
        if (index !== -1) {
          sock.sendMessage(chatId, { text: `⏰ Temps écoulé ! La bonne réponse était : ${answer}` });
          try { sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: sentMsg.key.id } }); } catch (e) {}
          global.NixBot.onReply.splice(index, 1);
        }
      }, 30000);
    } catch (err) {
      console.error("Erreur quiz:", err);
      sock.sendMessage(chatId, {
        text: "⚠️ Impossible de récupérer une question. Essaie 'quiz categories' pour voir les options disponibles."
      }, { quoted: event });
    }
  }
};