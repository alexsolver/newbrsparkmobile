'use strict';

const { sendExpoPushToMany } = require('../services/expoPush');
const { resolveGlobalLiveActivityBadgeKey, resolveTenantAppDisplayName } = require('./mobileTenantBranding');
const { resolveActiveUsersForDispatchOwnerEmail } = require('./userEmailUnique');

/**
 * Resolve tokens Expo Push para um e-mail de prestador (mesma lógica tenant que o despacho).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ ownerEmail: string, templateTenantId?: string|null, assigneeTenantId?: string|null, label?: string }}
 * @returns {Promise<Array<{ token: string }>>}
 */
async function resolvePushTokensForAssigneeEmail(prisma, {
    ownerEmail,
    templateTenantId,
    assigneeTenantId,
    label,
}) {
    const emailRaw = String(ownerEmail || '').trim();
    if (!emailRaw) return [];

    const templateTid = templateTenantId || null;
    const assigneeTid = assigneeTenantId || null;
    const logLabel = label || 'fieldTaskPush';

    const allEmailRows = await resolveActiveUsersForDispatchOwnerEmail(prisma, emailRaw);

    if (allEmailRows.length === 0) {
        console.warn(`[${logLabel}] Push ignorado: nenhum usuário ativo (email nem AppAccount):`, emailRaw);
        return [];
    }
    if (allEmailRows.length > 1) {
        console.warn(
            `[${logLabel}] Vários usuários ativos com o mesmo e-mail (${allEmailRows.length}):`,
            emailRaw
        );
    }

    const preferTid = String(assigneeTid || templateTid || '').trim();
    let userIds = allEmailRows.map((r) => r.id);
    if (preferTid) {
        const inTenantIds = allEmailRows
            .filter((r) => String(r.tenantId || '') === preferTid)
            .map((r) => r.id);
        if (inTenantIds.length) {
            userIds = inTenantIds;
        } else {
            console.warn(
                `[${logLabel}] Nenhum utilizador no tenant de contexto (${preferTid}) para ${emailRaw}; ` +
                    `push dirigido a todas as contas ativas com este e-mail (${userIds.length}).`
            );
        }
    }

    let pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
    if (pushTokens.length === 0 && userIds.length < allEmailRows.length) {
        console.warn(
            `[${logLabel}] Sem token Expo nas contas do tenant preferido; ` +
                `nova tentativa com todos os utilizadores ativos deste e-mail (${allEmailRows.length}).`
        );
        userIds = allEmailRows.map((r) => r.id);
        pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
    }

    if (pushTokens.length === 0) {
        console.warn(
            `[${logLabel}] Push ignorado: sem token Expo (app com sessão + notificações). email=`,
            emailRaw
        );
    }
    return pushTokens;
}

function buildFieldTaskActivityPushPayload(opts, appDisplayName, liveActivityBadgeKey) {
    const executionId = String(opts.executionId || '').trim();
    const hint =
        String(opts.pushSubtitle || '').trim() ||
        'Deslize para expandir. Ações: Aceitar, Recusar ou OK.';
    const baseData = {
        taskId: executionId,
        type: 'os_dispatched',
        appDisplayName,
        liveActivityBadgeKey,
    };
    const extra = opts.extraData && typeof opts.extraData === 'object' ? opts.extraData : {};
    const main = String(opts.pushBody || 'Nova atividade na sua lista.').trim();
    const body = `${main}\n\n${hint}`.slice(0, 240);

    return {
        title: String(opts.pushTitle || `Nova atividade · ${appDisplayName}`).slice(0, 120),
        body,
        /** iOS 15+ (Expo): explícito; «time-sensitive» exige capability no App ID. */
        interruptionLevel: 'active',
        categoryId: 'BRSPARK_TECH_ACTIVITY',
        /** Top-level + android.* — em Android em background o canal explícito evita cair em «Miscellaneous» sem som/cabeçalho. */
        channelId: 'brspark-tecnico',
        android: {
            channelId: 'brspark-tecnico',
            sound: 'default',
        },
        ios: {
            sound: 'default',
        },
        data: {
            ...baseData,
            ...extra,
        },
    };
}

/**
 * Push a vários técnicos (oferta / broadcast): resolve tokens em paralelo e **um** POST em lote à Expo — muito mais rápido que N envios sequenciais.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   ownerEmails: string[],
 *   templateTenantId?: string|null,
 *   assigneeTenantId?: string|null,
 *   executionId: string,
 *   pushTitle: string,
 *   pushBody: string,
 *   pushSubtitle?: string|null,
 *   logLabel?: string,
 *   extraData?: Record<string, string|undefined>,
 * }} opts
 * @returns {Promise<{ sent: number, skipped?: string }>}
 */
async function sendFieldTaskActivityPushToAssignees(prisma, opts) {
    const executionId = String(opts.executionId || '').trim();
    const rawList = Array.isArray(opts.ownerEmails) ? opts.ownerEmails : [];
    const emails = [...new Set(rawList.map((e) => String(e || '').trim()).filter(Boolean))];
    if (!executionId || emails.length === 0) {
        return { sent: 0, skipped: 'bad_args' };
    }

    const label = opts.logLabel || 'fieldTaskPush';
    const templateTid = opts.templateTenantId || null;
    const assigneeTid = opts.assigneeTenantId || null;

    const [appDisplayName, liveActivityBadgeKey] = await Promise.all([
        resolveTenantAppDisplayName(prisma, assigneeTid || templateTid || null, 'BrSpark'),
        resolveGlobalLiveActivityBadgeKey(prisma, 'brspark-badge'),
    ]);

    const tokenLists = await Promise.all(
        emails.map((ownerEmail) =>
            resolvePushTokensForAssigneeEmail(prisma, {
                ownerEmail,
                templateTenantId: templateTid,
                assigneeTenantId: assigneeTid,
                label,
            })
        )
    );

    const seenTok = new Set();
    const entries = [];
    for (const rows of tokenLists) {
        for (const row of rows) {
            const tok = row && row.token != null ? String(row.token).trim() : '';
            if (tok && !seenTok.has(tok)) {
                seenTok.add(tok);
                entries.push({ token: tok });
            }
        }
    }

    if (entries.length === 0) {
        return { sent: 0, skipped: 'no_tokens' };
    }

    const pushPayload = buildFieldTaskActivityPushPayload(opts, appDisplayName, liveActivityBadgeKey);
    const pushRes = await sendExpoPushToMany(entries, pushPayload);
    if (pushRes && pushRes.ok === false) {
        console.error(`[${label}] Expo push falhou:`, pushRes);
    } else {
        console.log(`[${label}] Push Expo (lote): ${pushRes?.sent ?? '?'} ok / ${entries.length} token(s)`);
    }
    return { sent: Number(pushRes?.sent) || 0 };
}

/**
 * Push ao técnico (mesmo payload que despacho de OS: categorias/botões no app).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   ownerEmail: string,
 *   templateTenantId?: string|null,
 *   assigneeTenantId?: string|null,
 *   executionId: string,
 *   pushTitle: string,
 *   pushBody: string,
 *   pushSubtitle?: string|null,
 *   logLabel?: string,
 *   extraData?: Record<string, string|undefined> — funde em `data` do Expo (ex.: type alternativo).
 * }} opts
 * @returns {Promise<{ sent: number, skipped?: string }>}
 */
async function sendFieldTaskActivityPushToAssignee(prisma, opts) {
    const emailRaw = String(opts.ownerEmail || '').trim();
    return sendFieldTaskActivityPushToAssignees(prisma, {
        ownerEmails: emailRaw ? [emailRaw] : [],
        templateTenantId: opts.templateTenantId,
        assigneeTenantId: opts.assigneeTenantId,
        executionId: opts.executionId,
        pushTitle: opts.pushTitle,
        pushBody: opts.pushBody,
        pushSubtitle: opts.pushSubtitle,
        logLabel: opts.logLabel,
        extraData: opts.extraData,
    });
}

module.exports = {
    sendFieldTaskActivityPushToAssignee,
    sendFieldTaskActivityPushToAssignees,
};
