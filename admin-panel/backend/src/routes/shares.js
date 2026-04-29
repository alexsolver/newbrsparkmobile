const express = require('express');
const router = express.Router();
const prisma = require('../db'); 
const authUser = require('../middleware/authUser');
const { resolvePreferredActiveUserForDispatchOwnerEmail } = require('../lib/userEmailUnique');

router.use(authUser);

// The main logic is:
// 1. Owner shares with Email
// 2. We check if User exists.
// 3. We create AssetShare 
// 4. We notify (Push if exists, Email if not)

router.post('/invite', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { assetId, sharedWithEmail, permission, modules, shareChildren, expiresAt } = req.body;

    if (!assetId || !sharedWithEmail || !permission || !modules) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (email.toLowerCase() === sharedWithEmail.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }

    // Prepare list of assets to share
    let assetsToShare = [assetId];

    if (shareChildren) {
      // Find all children of this asset where ownerEmail = email
      // To get current linked assets, we need to find items in UserModuleData where module="info" and parentId === assetId
      // Actually, the asset logic is entirely JSON based in UserModuleData natively!
      // This is tricky: we must fetch all "info" modules of this user, parse JSON, and find ones with rootId/parentId = assetId.
      const infoData = await prisma.userModuleData.findMany({
         where: { ownerEmail: email, module: 'info' }
      });
      for (const row of infoData) {
         try {
           const parsed = JSON.parse(row.data);
           if (parsed.parentId === assetId || parsed.rootId === assetId) {
              if (parsed.id) assetsToShare.push(parsed.id);
           }
         } catch(e){}
      }
    }

    // Check if the invited user exists just to see if we can dispatch push vs email
    const invitedUser = await resolvePreferredActiveUserForDispatchOwnerEmail(prisma, sharedWithEmail, {
       select: { id: true }
    });
    // ALWAYS start as PENDING so the user has to accept it.
    const status = 'PENDING';

    const sharesCreated = [];

    // Create shares exactly
    for (const aId of assetsToShare) {
       const share = await prisma.assetShare.upsert({
          where: {
            assetId_sharedWithEmail: {
              assetId: aId,
              sharedWithEmail: sharedWithEmail.toLowerCase()
            }
          },
          update: {
            permission,
            modules,
            status,
            expiresAt: expiresAt ? new Date(expiresAt) : null
          },
          create: {
            assetId: aId,
            ownerEmail: email,
            sharedWithEmail: sharedWithEmail.toLowerCase(),
            permission,
            modules,
            status,
            expiresAt: expiresAt ? new Date(expiresAt) : null
          }
       });
       sharesCreated.push(share);
    }
    
    // Notifications (Mocked or real via Resend / NotificationService)
    if (invitedUser) {
       console.log(`[Shares] Push notification dispatched to ${sharedWithEmail} for ${assetsToShare.length} assets.`);
       // TODO: Call Notification Service when integrated
    } else {
       console.log(`[Shares] Magic Link Email sent to ${sharedWithEmail} for ${assetsToShare.length} assets.`);
       // TODO: Call Nodemailer/Resend when integrated
    }

    res.json({ success: true, shares: sharesCreated, status });
  } catch (err) {
    console.error('[Shares] Invite Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a share
router.delete('/:assetId/:sharedWithEmail', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { assetId, sharedWithEmail } = req.params;

    const share = await prisma.assetShare.findUnique({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: sharedWithEmail.toLowerCase() } }
    });

    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.ownerEmail !== email) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.assetShare.delete({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: sharedWithEmail.toLowerCase() } }
    });

    res.json({ success: true });
  } catch(e) {
    console.error('[Shares] Delete Error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a share (permission and modules)
router.put('/:assetId/:sharedWithEmail', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { assetId, sharedWithEmail } = req.params;
    const { permission, modules, expiresAt } = req.body;

    const share = await prisma.assetShare.findUnique({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: sharedWithEmail.toLowerCase() } }
    });

    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.ownerEmail !== email) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.assetShare.update({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: sharedWithEmail.toLowerCase() } },
       data: { 
         permission, 
         modules,
         expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined
       }
    });

    res.json({ success: true, share: updated });
  } catch(e) {
    console.error('[Shares] Update Error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending shares for the logged in user
router.get('/pending', async (req, res) => {
  try {
     const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
     const shares = await prisma.assetShare.findMany({
        where: { sharedWithEmail: email.toLowerCase(), status: 'PENDING' }
     });
     
     // Optionally fetch minimal asset info to display the invitation properly
     const assetIds = shares.map(s => s.assetId);
     const assets = await prisma.asset.findMany({
       where: { id: { in: assetIds } },
       select: { id: true, title: true, type: true }
     });

     const enriched = shares.map(share => ({
       ...share,
       asset: assets.find(a => a.id === share.assetId) || null
     }));

     res.json(enriched);
  } catch(e) {
     res.status(500).json({ error: 'Internal error' });
  }
});

// Accept an invite
router.post('/:assetId/accept', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { assetId } = req.params;

    const share = await prisma.assetShare.findUnique({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: email.toLowerCase() } }
    });

    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.sharedWithEmail !== email.toLowerCase()) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.assetShare.update({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: email.toLowerCase() } },
       data: { status: 'ACCEPTED' }
    });

    res.json({ success: true, share: updated });
  } catch(e) {
    console.error('[Shares] Accept Error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject an invite
router.post('/:assetId/reject', async (req, res) => {
  try {
    const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
    const { assetId } = req.params;

    const share = await prisma.assetShare.findUnique({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: email.toLowerCase() } }
    });

    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.sharedWithEmail !== email.toLowerCase()) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.assetShare.delete({
       where: { assetId_sharedWithEmail: { assetId, sharedWithEmail: email.toLowerCase() } }
    });

    res.json({ success: true });
  } catch(e) {
    console.error('[Shares] Reject Error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List shares for an asset (For the owner to manage)
router.get('/asset/:assetId', async (req, res) => {
  try {
     const { email: rawEmail } = req.user;
    const email = rawEmail.toLowerCase();
     const shares = await prisma.assetShare.findMany({
        where: { assetId: req.params.assetId, ownerEmail: email }
     });
     res.json(shares);
  } catch(e) {
     res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
