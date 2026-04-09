'use strict';

const prisma = require('../db');
const { sendExpoPushToMany } = require('../services/expoPush');

/**
 * @param {string} userId - User.id (cuid)
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function pushToUserById(userId, { title, body, data }) {
  if (!userId) return;
  const tokens = await prisma.pushToken.findMany({ where: { userId } });
  if (!tokens.length) return;
  await sendExpoPushToMany(tokens, {
    title,
    body,
    data: data || {},
  });
}

module.exports = { pushToUserById };
