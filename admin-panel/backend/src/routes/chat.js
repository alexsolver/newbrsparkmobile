const express = require('express');
const router = express.Router();
const prisma = require('../db'); 
const authUser = require('../middleware/authUser');

router.use(authUser);

// =========================================================================
// CONTATOS (1 a 1 via Email)
// =========================================================================

// Envia uma solicitação de contato
router.post('/contacts/request', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { contactEmail } = req.body;

    if (!contactEmail) return res.status(400).json({ error: 'Email inválido' });
    if (email.toLowerCase() === contactEmail.toLowerCase()) {
      return res.status(400).json({ error: 'Você não pode se adicionar' });
    }

    // Verificar se o usuário existe no sistema
    const userExists = await prisma.user.findFirst({
      where: { email: contactEmail.toLowerCase() }
    });

    if (!userExists) {
      return res.status(404).json({ error: 'Usuário não encontrado na plataforma Brspark' });
    }

    // Upsert contato (se foi rejeitado antes, pode tentar de novo e volta pra PENDING)
    const contact = await prisma.chatContact.upsert({
      where: {
        requesterId_addresseeId: {
          requesterId: email,
          addresseeId: contactEmail.toLowerCase()
        }
      },
      update: { status: 'PENDING' },
      create: {
        requesterId: email,
        addresseeId: contactEmail.toLowerCase(),
        status: 'PENDING'
      }
    });

    // Create a Notification so the Bell icon shows it!
    await prisma.notification.create({
      data: {
        userId: userExists.id,
        title: 'Novo Pedido de Contato',
        body: `${req.user.name || email} enviou uma solicitação de chat corporativo.`,
        category: 'alert'
      }
    });

    res.json({ success: true, contact });
  } catch (err) {
    console.error('[Chat] Request Error:', err);
    res.status(500).json({ error: 'Erro ao enviar solicitação' });
  }
});

// Lista solicitações que eu recebi e estão pendentes
router.get('/contacts/pending', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const pending = await prisma.chatContact.findMany({
      where: { addresseeId: email, status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });

    // Pega os dados dos solicitantes
    const emails = pending.map(p => p.requesterId);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, name: true, avatarUrl: true }
    });

    const results = pending.map(p => {
      const u = users.find(x => x.email === p.requesterId);
      return { ...p, user: u };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aceita ou Rejeita convite
router.put('/contacts/:id/status', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { id } = req.params;
    const { status, userIds: rawUserIds } = req.body; // ACCEPTED ou REJECTED

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    if (rawUserIds && !Array.isArray(rawUserIds)) { // Added check for userIds if present
      return res.status(400).json({ error: 'Lista de participantes inválida' });
    }
    const userIds = rawUserIds ? rawUserIds.map(u => u.toLowerCase()) : []; // Lowercase if present

    const contact = await prisma.chatContact.findUnique({ where: { id } });
    if (!contact || contact.addresseeId !== email) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    const updated = await prisma.chatContact.update({
      where: { id },
      data: { status }
    });

    // Se aceitou, cria uma sala 1-1 se não existir
    if (status === 'ACCEPTED') {
      // Procura sala 1-1 existente entre os dois
      let room = await prisma.chatRoom.findFirst({
        where: {
          isGroup: false,
          AND: [
             { members: { some: { userId: email } } },
             { members: { some: { userId: contact.requesterId } } }
          ]
        }
      });

      if (!room) {
        room = await prisma.chatRoom.create({
          data: {
            isGroup: false,
            members: {
              create: [
                { userId: email, role: 'ADMIN' },
                { userId: contact.requesterId, role: 'ADMIN' }
              ]
            }
          }
        });
      }
    }

    res.json({ success: true, contact: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista contatos disponíveis (União de ChatContacts aceitos + AssetShares aceitos)
router.get('/contacts', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const lowerEmail = email.toLowerCase();

    // 1. Contatos Diretos Onde sou Requester e foi aceito
    const myRequests = await prisma.chatContact.findMany({
      where: { requesterId: lowerEmail, status: 'ACCEPTED' }
    });
    
    // 2. Contatos Diretos Onde sou Destinatário e aceitei
    const acceptedRequests = await prisma.chatContact.findMany({
      where: { addresseeId: lowerEmail, status: 'ACCEPTED' }
    });

    const directEmails = new Set();
    myRequests.forEach(r => directEmails.add(r.addresseeId));
    acceptedRequests.forEach(r => directEmails.add(r.requesterId));

    // 3. Contatos Vindos de Compartilhamento (AssetShare)
    // Pessoas que eu convidei e aceitaram
    const sharedByMe = await prisma.assetShare.findMany({
      where: { ownerEmail: lowerEmail, status: 'ACCEPTED' }
    });
    // Pessoas que me convidaram e eu aceitei
    const sharedWithMe = await prisma.assetShare.findMany({
      where: { sharedWithEmail: lowerEmail, status: 'ACCEPTED' }
    });

    const shareEmails = new Set();
    sharedByMe.forEach(s => shareEmails.add(s.sharedWithEmail));
    sharedWithMe.forEach(s => shareEmails.add(s.ownerEmail));

    // Unir tudo
    const allEmails = Array.from(new Set([...directEmails, ...shareEmails]));

    const users = await prisma.user.findMany({
      where: { email: { in: allEmails } },
      select: { email: true, name: true, avatarUrl: true }
    });

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// SALAS (Grupos e 1-1)
// =========================================================================

// Cria um grupo ou sala 1-1
router.post('/rooms', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { isGroup, name, userIds: rawUserIds } = req.body;
    
    if (!rawUserIds || rawUserIds.length === 0) return res.status(400).json({ error: 'Selecione participantes' });
    const userIds = rawUserIds.map(u => u.toLowerCase());

    // Incluir o criador
    const allUsers = Array.from(new Set([email, ...userIds]));

    if (!isGroup && allUsers.length > 2) {
      return res.status(400).json({ error: 'Salas 1-a-1 só podem ter 2 pessoas' });
    }

    // Se 1-1, previne duplicata
    if (!isGroup) {
      const existing = await prisma.chatRoom.findFirst({
        where: {
          isGroup: false,
          AND: allUsers.map(u => ({ members: { some: { userId: u } } }))
        }
      });
      if (existing) return res.json(existing);
    }

    const membersData = allUsers.map(u => ({
      userId: u,
      role: u === email ? 'ADMIN' : 'MEMBER'
    }));

    const room = await prisma.chatRoom.create({
      data: {
        isGroup,
        name: isGroup ? name : null,
        creatorId: isGroup ? email : null,
        members: { create: membersData }
      },
      include: { members: true }
    });

    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualiza membros de um grupo
router.put('/rooms/:roomId/members', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { roomId } = req.params;
    const { userIds: rawUserIds } = req.body; // lista completa de emails desejados
    const userIds = rawUserIds ? rawUserIds.map(u => u.toLowerCase()) : [];

    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { members: true }
    });

    if (!room || !room.isGroup) return res.status(404).json({ error: 'Grupo não encontrado' });
    if (room.creatorId !== email) return res.status(403).json({ error: 'Apenas o criador pode gerenciar membros' });

    // Todos os membros finais
    const finalUsers = Array.from(new Set([email, ...userIds]));
    
    // Apaga quem não está na lista final
    await prisma.chatRoomMember.deleteMany({
      where: {
        roomId,
        userId: { notIn: finalUsers }
      }
    });

    // Insere quem falta (upsert ou find missing)
    for (const u of finalUsers) {
      await prisma.chatRoomMember.upsert({
        where: { roomId_userId: { roomId, userId: u } },
        update: {},
        create: { roomId, userId: u, role: u === email ? 'ADMIN' : 'MEMBER' }
      });
    }

    res.json({ success: true, memberCount: finalUsers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista salas que participo
router.get('/rooms', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const rooms = await prisma.chatRoom.findMany({
      where: { members: { some: { userId: email } } },
      include: {
        members: { select: { userId: true, role: true, lastReadAt: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Pega dados básicos para os avatares/nomes
    const memberEmails = new Set();
    rooms.forEach(r => r.members.forEach(m => memberEmails.add(m.userId)));

    const users = await prisma.user.findMany({
      where: { email: { in: Array.from(memberEmails) } },
      select: { email: true, name: true, avatarUrl: true }
    });

    const userDict = {};
    users.forEach(u => userDict[u.email] = u);

    const mapped = await Promise.all(rooms.map(async (r) => {
      let displayName = r.name;
      let displayAvatar = null;
      let myLastReadAt = r.members.find(m => m.userId === email)?.lastReadAt || new Date(0);

      if (!r.isGroup) {
        // Encontra o outro membro
        const other = r.members.find(m => m.userId !== email)?.userId;
        if (other && userDict[other]) {
          displayName = userDict[other].name;
          displayAvatar = userDict[other].avatarUrl;
        }
      }

      const unreadCount = await prisma.chatMessage.count({
        where: {
          roomId: r.id,
          createdAt: { gt: myLastReadAt },
          senderId: { not: email }
        }
      });

      const lastMsg = r.messages[0];

      return {
        id: r.id,
        name: displayName || 'Chat',
        isGroup: r.isGroup,
        creatorId: r.creatorId,
        avatarColor: r.avatarColor,
        avatarUrl: displayAvatar,
        unreadCount,
        lastMessage: lastMsg?.content || (lastMsg?.mediaUrl ? 'Mídia enviada' : null),
        lastSender: lastMsg?.senderId === email ? 'Você' : (userDict[lastMsg?.senderId]?.name || null),
        lastMessageAt: lastMsg ? lastMsg.createdAt.getTime() : r.createdAt.getTime(),
        memberCount: r.members.length,
        members: r.members.map(m => ({
          userId: m.userId,
          role: m.role,
          name: userDict[m.userId]?.name || m.userId,
          avatarUrl: userDict[m.userId]?.avatarUrl
        }))
      };
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MENSAGENS
// =========================================================================

// Envia mensagem
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { email: rawEmail, name } = req.user;
    const email = rawEmail.toLowerCase();
    const { roomId } = req.params;
    const { type, content, mediaUrl } = req.body;

    // Verifica se é membro
    const member = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: email } }
    });

    if (!member) return res.status(403).json({ error: 'Acesso negado à sala' });

    const msg = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: email,
        senderName: name || 'Usuário',
        type: type || 'text',
        content,
        mediaUrl
      }
    });

    // Empurra a sala para cima (updatedAt)
    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() }
    });

    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista mensagens
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { roomId } = req.params;
    const { since = 0 } = req.query;

    const member = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: email } }
    });

    if (!member) return res.status(403).json({ error: 'Acesso negado à sala' });

    const condition = { roomId };
    if (since > 0) {
      condition.createdAt = { gt: new Date(parseInt(since, 10)) };
    }

    const messages = await prisma.chatMessage.findMany({
      where: condition,
      orderBy: { createdAt: 'asc' }
    });

    const senderEmails = Array.from(new Set(messages.map(m => m.senderId)));
    const senders = await prisma.user.findMany({
      where: { email: { in: senderEmails } },
      select: { email: true, avatarUrl: true }
    });
    const senderDict = {};
    senders.forEach(s => senderDict[s.email] = s.avatarUrl);

    // Converter para formato do App
    const mapped = messages.map(m => ({
      id: m.id,
      roomId: m.roomId,
      senderId: m.senderId,
      senderName: m.senderName,
      senderAvatarUrl: senderDict[m.senderId],
      type: m.type,
      content: m.content,
      mediaUrl: m.mediaUrl,
      timestamp: m.createdAt.getTime()
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Marca a sala como lida
router.put('/rooms/:roomId/read', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { roomId } = req.params;

    const member = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: email } }
    });

    if (!member) return res.status(404).json({ error: 'Membro não encontrado na sala' });

    await prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId: email } },
      data: { lastReadAt: new Date() }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
