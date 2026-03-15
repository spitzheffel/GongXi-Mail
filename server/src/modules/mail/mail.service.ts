import { emailService } from '../email/email.service.js';
import { poolService } from './pool.service.js';
import { AppError } from '../../plugins/error.js';
import { logger } from '../../lib/logger.js';
import { setCache, getCache } from '../../lib/redis.js';
import { proxyFetch } from '../../lib/proxy.js';
import prisma from '../../lib/prisma.js';
import type { MailRequestInput } from './mail.schema.js';
import Imap from 'node-imap';
import { simpleParser, type ParsedMail, type Source } from 'mailparser';

type MailFetchStrategy = 'GRAPH_FIRST' | 'IMAP_FIRST' | 'GRAPH_ONLY' | 'IMAP_ONLY';

interface Credentials {
    id: number;
    email: string;
    clientId: string;
    refreshToken: string;
    autoAssigned: boolean;
    fetchStrategy?: MailFetchStrategy;
}

interface EmailMessage {
    id: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    date: string;
}

interface OAuthTokenResponse {
    access_token?: string;
    expires_in?: number;
    scope?: string;
}

interface GraphMessage {
    id?: string;
    from?: {
        emailAddress?: {
            address?: string;
        };
    };
    subject?: string;
    bodyPreview?: string;
    body?: {
        content?: string;
    };
    createdDateTime?: string;
}

interface GraphMessagesResponse {
    value?: GraphMessage[];
}

interface GraphMailFolder {
    id?: string;
    displayName?: string;
    childFolderCount?: number;
    wellKnownName?: string;
}

interface GraphMailFolderResponse {
    value?: GraphMailFolder[];
    '@odata.nextLink'?: string;
}

interface MailboxFolder {
    name: string;
    path: string;
    mailbox: string;
    provider: 'graph' | 'imap';
    specialUse: string | null;
}

interface GraphMailboxFolder extends MailboxFolder {
    id: string;
    childFolderCount: number;
}

interface ImapBoxNode {
    attribs?: string[];
    delimiter?: string | null;
    delim?: string | null;
    children?: Record<string, ImapBoxNode>;
}

interface ImapMailboxFolder extends MailboxFolder {
    actualPath: string;
    attribs: string[];
}

const GRAPH_MAILBOX_ALIASES: Record<string, string> = {
    'inbox': 'inbox',
    'junk': 'junkemail',
    'junk email': 'junkemail',
    'junkemail': 'junkemail',
    'spam': 'junkemail',
    'sent': 'sentitems',
    'sent items': 'sentitems',
    'sent mail': 'sentitems',
    'sentitems': 'sentitems',
    'draft': 'drafts',
    'drafts': 'drafts',
    'archive': 'archive',
    'outbox': 'outbox',
    'deleted': 'deleteditems',
    'deleted items': 'deleteditems',
    'deleteditems': 'deleteditems',
    'trash': 'deleteditems',
    'recycle bin': 'deleteditems',
    '收件箱': 'inbox',
    '垃圾邮件': 'junkemail',
    '垃圾邮件箱': 'junkemail',
    '已发送': 'sentitems',
    '草稿': 'drafts',
    '草稿箱': 'drafts',
    '归档': 'archive',
    '发件箱': 'outbox',
    '已删除': 'deleteditems',
    '垃圾箱': 'deleteditems',
};

const IMAP_SPECIAL_USE_TO_MAILBOX: Record<string, string> = {
    '\\inbox': 'inbox',
    '\\junk': 'junkemail',
    '\\spam': 'junkemail',
    '\\sent': 'sentitems',
    '\\drafts': 'drafts',
    '\\trash': 'deleteditems',
    '\\archive': 'archive',
    '\\outbox': 'outbox',
};

const MAILBOX_SORT_ORDER = ['inbox', 'junkemail', 'sentitems', 'drafts', 'deleteditems', 'archive', 'outbox'];

function normalizeMailboxKey(value: string): string {
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/\s+/g, ' ')
        .replace(/^\/+|\/+$/g, '')
        .toLowerCase();
}

function buildMailboxPath(segments: string[]): string {
    return segments
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
}

function getWellKnownMailbox(mailbox: string): string | null {
    const normalized = normalizeMailboxKey(mailbox);
    if (!normalized) {
        return null;
    }
    return GRAPH_MAILBOX_ALIASES[normalized] ?? null;
}

function getImapSpecialUseMailbox(attribs?: string[]): string | null {
    for (const attr of attribs ?? []) {
        const mapped = IMAP_SPECIAL_USE_TO_MAILBOX[attr.trim().toLowerCase()];
        if (mapped) {
            return mapped;
        }
    }
    return null;
}

function dedupeMailboxFolders<T extends MailboxFolder>(folders: T[]): T[] {
    const seen = new Set<string>();
    return folders.filter((folder) => {
        const key = normalizeMailboxKey(folder.path);
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function sortMailboxFolders<T extends MailboxFolder>(folders: T[]): T[] {
    return [...folders].sort((left, right) => {
        const leftRank = MAILBOX_SORT_ORDER.indexOf(left.specialUse ?? '');
        const rightRank = MAILBOX_SORT_ORDER.indexOf(right.specialUse ?? '');
        const normalizedLeftRank = leftRank === -1 ? MAILBOX_SORT_ORDER.length : leftRank;
        const normalizedRightRank = rightRank === -1 ? MAILBOX_SORT_ORDER.length : rightRank;

        if (normalizedLeftRank !== normalizedRightRank) {
            return normalizedLeftRank - normalizedRightRank;
        }

        const leftDepth = left.path.split('/').length;
        const rightDepth = right.path.split('/').length;
        if (leftDepth !== rightDepth) {
            return leftDepth - rightDepth;
        }

        return left.path.localeCompare(right.path, 'zh-CN');
    });
}

function createImapClient(email: string, authString: string) {
    const imapConfig: ConstructorParameters<typeof Imap>[0] = {
        user: email,
        password: '',
        xoauth2: authString,
        host: 'outlook.office365.com',
        port: 993,
        tls: true,
        tlsOptions: {
            rejectUnauthorized: false,
        },
    };

    return new Imap(imapConfig);
}

function getErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
        return 'Unknown error';
    }
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message : 'Unknown error';
}

export const mailService = {
    /**
     * 解析凭证
     */
    async resolveCredentials(
        input: MailRequestInput,
        apiKeyId?: number
    ): Promise<Credentials> {
        const { email, auto } = input;

        // 自动分配模式
        if (!email && auto) {
            if (!apiKeyId) {
                throw new AppError('AUTH_REQUIRED', 'Auto assignment requires API Key authentication', 400);
            }

            const account = await poolService.getUnusedEmail(apiKeyId);
            if (!account) {
                const stats = await poolService.getStats(apiKeyId);
                throw new AppError(
                    'NO_UNUSED_EMAIL',
                    `No unused emails available. Used: ${stats.used}/${stats.total}`,
                    400
                );
            }

            return { ...account, autoAssigned: true };
        }

        // 必须提供邮箱
        if (!email) {
            throw new AppError('EMAIL_REQUIRED', 'Email is required. Set auto=true to auto-assign.', 400);
        }

        // 从数据库查询
        const account = await emailService.getByEmail(email);
        if (!account) {
            throw new AppError('EMAIL_NOT_FOUND', 'Email account not found', 404);
        }

        return { ...account, autoAssigned: false };
    },

    /**
     * 更新邮箱状态
     */
    async updateEmailStatus(emailId: number, success: boolean, errorMessage?: string) {
        await emailService.updateStatus(
            emailId,
            success ? 'ACTIVE' : 'ERROR',
            errorMessage
        );
    },

    /**
     * 记录 API 调用
     */
    async logApiCall(
        action: string,
        apiKeyId: number | undefined,
        emailAccountId: number | undefined,
        requestIp: string,
        responseCode: number,
        responseTimeMs: number,
        requestId?: string
    ) {
        try {
            await prisma.apiLog.create({
                data: {
                    action,
                    apiKeyId,
                    emailAccountId,
                    requestIp,
                    responseCode,
                    responseTimeMs,
                    metadata: requestId ? { requestId } : undefined,
                },
            });
        } catch (err) {
            logger.error({ err }, 'Failed to log API call');
        }
    },

    /**
     * 获取 Microsoft Graph API Access Token
     */
    async getGraphAccessToken(
        credentials: Credentials,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<{ accessToken: string; hasMailRead: boolean } | null> {
        const cacheKey = `graph_api_access_token_${credentials.email}`;

        // 尝试从缓存获取（缓存的 token 一定有 Mail.Read 权限）
        const cachedToken = await getCache(cacheKey);
        if (cachedToken) {
            logger.debug({ email: credentials.email }, 'Using cached Graph API token');
            return { accessToken: cachedToken, hasMailRead: true };
        }

        try {
            const response = await proxyFetch(
                'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: credentials.clientId,
                        grant_type: 'refresh_token',
                        refresh_token: credentials.refreshToken,
                        scope: 'https://graph.microsoft.com/.default',
                    }).toString(),
                },
                proxyConfig
            );

            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ email: credentials.email, status: response.status, error: errorText }, 'Graph API token request failed');
                return null;
            }

            const data = await response.json() as OAuthTokenResponse;

            // 检查是否有邮件读取权限
            const scopeText = typeof data.scope === 'string' ? data.scope : '';
            const hasMailRead = scopeText.includes('https://graph.microsoft.com/Mail.Read');
            const accessToken = typeof data.access_token === 'string' ? data.access_token : null;

            if (!accessToken) {
                logger.warn({ email: credentials.email }, 'Graph API token missing access_token');
                return null;
            }

            if (hasMailRead) {
                // 只有有 Mail.Read 权限时才缓存
                const expireTime = ((typeof data.expires_in === 'number' ? data.expires_in : 3600) - 60);
                await setCache(cacheKey, accessToken, expireTime);
            } else {
                logger.warn({ email: credentials.email }, 'No Mail.Read scope in token, will fallback to IMAP');
            }

            return { accessToken, hasMailRead };
        } catch (err) {
            logger.error({ err, email: credentials.email }, 'Failed to get Graph API token');
            return null;
        }
    },

    async fetchGraphMailFoldersPage(
        accessToken: string,
        url: string,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<{ folders: GraphMailFolder[]; nextLink?: string }> {
        const response = await proxyFetch(
            url,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            },
            proxyConfig
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Graph API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as GraphMailFolderResponse;
        return {
            folders: Array.isArray(data.value) ? data.value : [],
            nextLink: typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : undefined,
        };
    },

    async getGraphMailboxFolders(
        accessToken: string,
        proxyConfig?: { socks5?: string; http?: string },
        parentId?: string,
        parentPath: string[] = []
    ): Promise<GraphMailboxFolder[]> {
        const folders: GraphMailboxFolder[] = [];
        let nextLink: string | undefined = parentId
            ? `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(parentId)}/childFolders?$top=200&includeHiddenFolders=true&$select=id,displayName,childFolderCount,wellKnownName`
            : 'https://graph.microsoft.com/v1.0/me/mailFolders?$top=200&includeHiddenFolders=true&$select=id,displayName,childFolderCount,wellKnownName';

        while (nextLink) {
            const page = await mailService.fetchGraphMailFoldersPage(accessToken, nextLink, proxyConfig);
            for (const folder of page.folders) {
                if (typeof folder.id !== 'string' || !folder.id) {
                    continue;
                }

                const name = typeof folder.displayName === 'string' && folder.displayName.trim()
                    ? folder.displayName.trim()
                    : folder.id;
                const path = buildMailboxPath([...parentPath, name]);
                const specialUse = typeof folder.wellKnownName === 'string'
                    ? folder.wellKnownName.toLowerCase()
                    : null;

                folders.push({
                    id: folder.id,
                    name,
                    path,
                    mailbox: path,
                    provider: 'graph',
                    specialUse,
                    childFolderCount: typeof folder.childFolderCount === 'number'
                        ? folder.childFolderCount
                        : 0,
                });

                if ((folder.childFolderCount ?? 0) > 0) {
                    const childFolders = await mailService.getGraphMailboxFolders(
                        accessToken,
                        proxyConfig,
                        folder.id,
                        [...parentPath, name]
                    );
                    folders.push(...childFolders);
                }
            }

            nextLink = page.nextLink;
        }

        return folders;
    },

    async listMailboxesViaGraphApi(
        accessToken: string,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<GraphMailboxFolder[]> {
        const folders = await mailService.getGraphMailboxFolders(accessToken, proxyConfig);
        return sortMailboxFolders(dedupeMailboxFolders(folders));
    },

    async resolveGraphMailbox(
        accessToken: string,
        mailbox: string,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<string> {
        const trimmedMailbox = mailbox?.trim();
        if (!trimmedMailbox) {
            return 'inbox';
        }

        const wellKnownMailbox = getWellKnownMailbox(trimmedMailbox);
        if (wellKnownMailbox) {
            return wellKnownMailbox;
        }

        const folders = await mailService.listMailboxesViaGraphApi(accessToken, proxyConfig);
        const normalizedMailbox = normalizeMailboxKey(trimmedMailbox);

        const pathMatch = folders.find((folder) => normalizeMailboxKey(folder.path) === normalizedMailbox);
        if (pathMatch) {
            return pathMatch.id;
        }

        const nameMatches = folders.filter((folder) => normalizeMailboxKey(folder.name) === normalizedMailbox);
        if (nameMatches.length === 1) {
            return nameMatches[0].id;
        }

        throw new AppError('MAILBOX_NOT_FOUND', `Mailbox '${mailbox}' not found`, 404);
    },

    async getEmailsViaResolvedGraphMailbox(
        accessToken: string,
        resolvedMailbox: string,
        limit: number = 100,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<EmailMessage[]> {
        try {
            const response = await proxyFetch(
                `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(resolvedMailbox)}/messages?$top=${limit}&$orderby=receivedDateTime desc`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                },
                proxyConfig
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Graph API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json() as GraphMessagesResponse;
            const emails = Array.isArray(data.value) ? data.value : [];

            return emails.map((item: GraphMessage, index: number) => ({
                id: item.id || `graph_${Date.now()}_${index}`,
                from: item.from?.emailAddress?.address || '',
                subject: item.subject || '',
                text: item.bodyPreview || '',
                html: item.body?.content || '',
                date: item.createdDateTime || '',
            }));
        } catch (err) {
            logger.error({ err, mailbox: resolvedMailbox }, 'Failed to fetch emails via Graph API');
            throw err;
        }
    },

    /**
     * 使用 Graph API 获取邮件
     */
    async getEmailsViaGraphApi(
        accessToken: string,
        mailbox: string,
        limit: number = 100,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<EmailMessage[]> {
        const resolvedMailbox = await mailService.resolveGraphMailbox(accessToken, mailbox, proxyConfig);
        return mailService.getEmailsViaResolvedGraphMailbox(
            accessToken,
            resolvedMailbox,
            limit,
            proxyConfig
        );
    },

    /**
     * 获取 IMAP Access Token (不带 scope)
     */
    async getImapAccessToken(
        credentials: Credentials,
        proxyConfig?: { socks5?: string; http?: string }
    ): Promise<string | null> {
        const cacheKey = `imap_api_access_token_${credentials.email}`;

        const cachedToken = await getCache(cacheKey);
        if (cachedToken) {
            logger.debug({ email: credentials.email }, 'Using cached IMAP token');
            return cachedToken;
        }

        try {
            const response = await proxyFetch(
                'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: credentials.clientId,
                        grant_type: 'refresh_token',
                        refresh_token: credentials.refreshToken,
                        // 注意：IMAP 不需要 scope
                    }).toString(),
                },
                proxyConfig
            );

            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ email: credentials.email, status: response.status, error: errorText }, 'IMAP token request failed');
                return null;
            }

            const data = await response.json() as OAuthTokenResponse;
            const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
            if (!accessToken) {
                logger.warn({ email: credentials.email }, 'IMAP token missing access_token');
                return null;
            }

            const expireTime = ((typeof data.expires_in === 'number' ? data.expires_in : 3600) - 60);
            await setCache(cacheKey, accessToken, expireTime);

            return accessToken;
        } catch (err) {
            logger.error({ err, email: credentials.email }, 'Failed to get IMAP token');
            return null;
        }
    },

    /**
     * 生成 IMAP XOAUTH2 认证字符串
     */
    generateAuthString(email: string, accessToken: string): string {
        const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
        return Buffer.from(authString).toString('base64');
    },

    flattenImapMailboxes(
        boxes: Record<string, ImapBoxNode>,
        parentPath: string[] = [],
        parentActualPath?: string
    ): ImapMailboxFolder[] {
        const folders: ImapMailboxFolder[] = [];

        for (const [name, box] of Object.entries(boxes)) {
            const attribs = Array.isArray(box.attribs) ? box.attribs : [];
            const specialUse = getImapSpecialUseMailbox(attribs);
            const delimiter = typeof box.delimiter === 'string' && box.delimiter.length > 0
                ? box.delimiter
                : typeof box.delim === 'string' && box.delim.length > 0
                    ? box.delim
                    : '/';
            const path = buildMailboxPath([...parentPath, name]);
            const actualPath = parentActualPath ? `${parentActualPath}${delimiter}${name}` : name;
            const isSelectable = !attribs.some((attr) => attr.trim().toLowerCase() === '\\noselect');

            if (isSelectable) {
                folders.push({
                    name,
                    path,
                    mailbox: path,
                    provider: 'imap',
                    specialUse,
                    actualPath,
                    attribs,
                });
            }

            if (box.children && typeof box.children === 'object') {
                folders.push(
                    ...mailService.flattenImapMailboxes(
                        box.children,
                        [...parentPath, name],
                        actualPath
                    )
                );
            }
        }

        return folders;
    },

    async listMailboxesViaImap(
        email: string,
        authString: string
    ): Promise<ImapMailboxFolder[]> {
        return new Promise((resolve, reject) => {
            const imap = createImapClient(email, authString);
            let settled = false;

            const finishResolve = (folders: ImapMailboxFolder[]) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(sortMailboxFolders(dedupeMailboxFolders(folders)));
            };

            const finishReject = (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(error);
            };

            imap.once('ready', () => {
                imap.getBoxes((err: Error | null, boxes: unknown) => {
                    if (err) {
                        imap.end();
                        finishReject(err);
                        return;
                    }

                    try {
                        const flattened = mailService.flattenImapMailboxes(
                            (boxes ?? {}) as Record<string, ImapBoxNode>
                        );
                        imap.end();
                        finishResolve(flattened);
                    } catch (flattenErr) {
                        imap.end();
                        finishReject(flattenErr);
                    }
                });
            });

            imap.once('error', (err: Error) => {
                logger.error({ err, email }, 'IMAP mailbox listing error');
                finishReject(err);
            });

            imap.connect();
        });
    },

    async resolveImapMailboxPath(
        email: string,
        authString: string,
        mailbox: string
    ): Promise<string> {
        const trimmedMailbox = mailbox?.trim();
        if (!trimmedMailbox) {
            return 'INBOX';
        }

        const folders = await mailService.listMailboxesViaImap(email, authString);
        const normalizedMailbox = normalizeMailboxKey(trimmedMailbox);
        const wellKnownMailbox = getWellKnownMailbox(trimmedMailbox);

        if (wellKnownMailbox) {
            const specialUseMatch = folders.find((folder) => folder.specialUse === wellKnownMailbox);
            if (specialUseMatch) {
                return specialUseMatch.actualPath;
            }

            if (wellKnownMailbox === 'inbox') {
                return 'INBOX';
            }
        }

        const pathMatch = folders.find((folder) =>
            normalizeMailboxKey(folder.path) === normalizedMailbox ||
            folder.actualPath.trim().toLowerCase() === trimmedMailbox.toLowerCase()
        );
        if (pathMatch) {
            return pathMatch.actualPath;
        }

        const nameMatches = folders.filter((folder) => normalizeMailboxKey(folder.name) === normalizedMailbox);
        if (nameMatches.length === 1) {
            return nameMatches[0].actualPath;
        }

        return trimmedMailbox;
    },

    /**
     * 使用 IMAP 获取邮件
     */
    async getEmailsViaImap(
        email: string,
        authString: string,
        mailbox: string = 'INBOX',
        limit: number = 100
    ): Promise<EmailMessage[]> {
        const resolvedMailbox = await mailService.resolveImapMailboxPath(email, authString, mailbox);
        return new Promise((resolve, reject) => {
            const imap = createImapClient(email, authString);
            const emailList: EmailMessage[] = [];
            let messageCount = 0;
            let processedCount = 0;
            let settled = false;

            const finishResolve = (messages: EmailMessage[]) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(messages);
            };

            const finishReject = (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(error);
            };

            imap.once('ready', async () => {
                try {
                    await new Promise<void>((res, rej) => {
                        imap.openBox(resolvedMailbox, true, (err) => {
                            if (err) return rej(err);
                            res();
                        });
                    });

                    imap.search(['ALL'], (err: Error | null, results: number[]) => {
                        if (err) {
                            imap.end();
                            finishReject(err);
                            return;
                        }

                        if (!results || results.length === 0) {
                            imap.end();
                            finishResolve([]);
                            return;
                        }

                        // 限制返回数量
                        const limitedResults = results.slice(-limit);
                        messageCount = limitedResults.length;

                        const f = imap.fetch(limitedResults, { bodies: '' });

                        f.on('message', (msg) => {
                            msg.on('body', (stream) => {
                                simpleParser(stream as unknown as Source)
                                    .then((mail: ParsedMail) => {
                                        const html = typeof mail.html === 'string' ? mail.html : '';
                                        emailList.push({
                                            id: `imap_${Date.now()}_${processedCount}`,
                                            from: mail.from?.text || '',
                                            subject: mail.subject || '',
                                            text: mail.text || '',
                                            html,
                                            date: mail.date?.toISOString() || '',
                                        });
                                    })
                                    .catch((parseErr: Error) => {
                                        logger.error({ parseErr }, 'Error parsing email');
                                    })
                                    .finally(() => {
                                        processedCount++;
                                        if (processedCount === messageCount) {
                                            imap.end();
                                        }
                                    });
                            });
                        });

                        f.once('error', (fetchErr: Error) => {
                            logger.error({ fetchErr }, 'IMAP fetch error');
                            imap.end();
                            finishReject(fetchErr);
                        });

                        f.once('end', () => {
                            // 如果没有消息，直接结束
                            if (messageCount === 0) {
                                imap.end();
                            }
                        });
                    });
                } catch (err) {
                    imap.end();
                    finishReject(err);
                }
            });

            imap.once('error', (err: Error) => {
                logger.error({ err, mailbox: resolvedMailbox }, 'IMAP connection error');
                finishReject(err);
            });

            imap.once('end', () => {
                logger.debug({ email }, 'IMAP connection ended');
                // 按日期降序排序（最新的在前面）
                emailList.sort((a: EmailMessage, b: EmailMessage) => {
                    const dateA = a.date ? new Date(a.date).getTime() : 0;
                    const dateB = b.date ? new Date(b.date).getTime() : 0;
                    return dateB - dateA;
                });
                finishResolve(emailList);
            });

            imap.connect();
        });
    },

    async getMailboxes(
        credentials: Credentials,
        options?: { socks5?: string; http?: string }
    ) {
        const proxyConfig = { socks5: options?.socks5, http: options?.http };
        const strategy: MailFetchStrategy = credentials.fetchStrategy || 'GRAPH_FIRST';

        const listViaGraph = async () => {
            const tokenResult = await this.getGraphAccessToken(credentials, proxyConfig);
            if (!tokenResult) {
                throw new AppError('GRAPH_TOKEN_FAILED', 'Failed to get Graph API access token', 502);
            }
            if (!tokenResult.hasMailRead) {
                throw new AppError('GRAPH_SCOPE_MISSING', 'Graph token missing Mail.Read scope', 502);
            }

            logger.info({ email: credentials.email, strategy }, 'Using Graph API for mailbox listing');
            const folders = await this.listMailboxesViaGraphApi(tokenResult.accessToken, proxyConfig);
            return {
                folders: folders.map(({ name, path, mailbox, provider, specialUse }) => ({
                    name,
                    path,
                    mailbox,
                    provider,
                    specialUse,
                })),
                method: 'graph_api' as const,
            };
        };

        const listViaImap = async () => {
            logger.info({ email: credentials.email, strategy }, 'Using IMAP for mailbox listing');
            const imapToken = await this.getImapAccessToken(credentials, proxyConfig);
            if (!imapToken) {
                throw new AppError('IMAP_TOKEN_FAILED', 'Failed to get IMAP access token', 502);
            }

            const authString = this.generateAuthString(credentials.email, imapToken);
            const folders = await this.listMailboxesViaImap(credentials.email, authString);
            return {
                folders: folders.map(({ name, path, mailbox, provider, specialUse }) => ({
                    name,
                    path,
                    mailbox,
                    provider,
                    specialUse,
                })),
                method: 'imap' as const,
            };
        };

        if (strategy === 'GRAPH_ONLY') {
            return listViaGraph();
        }

        if (strategy === 'IMAP_ONLY') {
            return listViaImap();
        }

        if (strategy === 'IMAP_FIRST') {
            try {
                return await listViaImap();
            } catch (imapErr) {
                logger.warn({ imapErr, email: credentials.email }, 'IMAP mailbox listing failed, fallback to Graph API');
                return listViaGraph();
            }
        }

        try {
            return await listViaGraph();
        } catch (graphErr) {
            logger.warn({ graphErr, email: credentials.email }, 'Graph mailbox listing failed, fallback to IMAP');
            return listViaImap();
        }
    },

    /**
     * 获取邮件（主入口）- 支持 Graph API 和 IMAP 回退
     */
    async getEmails(
        credentials: Credentials,
        options: { mailbox: string; limit?: number; socks5?: string; http?: string }
    ) {
        const proxyConfig = { socks5: options.socks5, http: options.http };
        const strategy: MailFetchStrategy = credentials.fetchStrategy || 'GRAPH_FIRST';
        const limit = options.limit || 100;

        const fetchViaGraph = async () => {
            const tokenResult = await this.getGraphAccessToken(credentials, proxyConfig);
            if (!tokenResult) {
                throw new AppError('GRAPH_TOKEN_FAILED', 'Failed to get Graph API access token', 502);
            }
            if (!tokenResult.hasMailRead) {
                throw new AppError('GRAPH_SCOPE_MISSING', 'Graph token missing Mail.Read scope', 502);
            }

            logger.info({ email: credentials.email, strategy }, 'Using Graph API for email retrieval');
            const messages = await this.getEmailsViaGraphApi(
                tokenResult.accessToken,
                options.mailbox,
                limit,
                proxyConfig
            );

            return {
                email: credentials.email,
                mailbox: options.mailbox,
                count: messages.length,
                messages,
                method: 'graph_api',
            };
        };

        const fetchViaImap = async () => {
            logger.info({ email: credentials.email, strategy }, 'Using IMAP for email retrieval');
            const imapToken = await this.getImapAccessToken(credentials, proxyConfig);
            if (!imapToken) {
                throw new AppError('IMAP_TOKEN_FAILED', 'Failed to get IMAP access token', 502);
            }

            const authString = this.generateAuthString(credentials.email, imapToken);
            const messages = await this.getEmailsViaImap(
                credentials.email,
                authString,
                options.mailbox,
                limit
            );

            return {
                email: credentials.email,
                mailbox: options.mailbox,
                count: messages.length,
                messages,
                method: 'imap',
            };
        };

        if (strategy === 'GRAPH_ONLY') {
            return fetchViaGraph();
        }

        if (strategy === 'IMAP_ONLY') {
            return fetchViaImap();
        }

        if (strategy === 'IMAP_FIRST') {
            try {
                return await fetchViaImap();
            } catch (imapErr) {
                logger.warn({ imapErr, email: credentials.email }, 'IMAP failed, fallback to Graph API');
                return fetchViaGraph();
            }
        }

        try {
            return await fetchViaGraph();
        } catch (graphErr) {
            logger.warn({ graphErr, email: credentials.email }, 'Graph API failed, fallback to IMAP');
            return fetchViaImap();
        }
    },

    /**
     * 清空邮箱（通过 Graph API 删除所有邮件）
     */
    async processMailbox(
        credentials: Credentials,
        options: { mailbox: string; socks5?: string; http?: string }
    ) {
        const strategy: MailFetchStrategy = credentials.fetchStrategy || 'GRAPH_FIRST';
        if (strategy === 'IMAP_ONLY') {
            throw new AppError(
                'MAILBOX_CLEAR_UNSUPPORTED',
                'Mailbox clear is not available for IMAP_ONLY strategy',
                400
            );
        }

        logger.info({ email: credentials.email, mailbox: options.mailbox }, 'Processing mailbox via Graph API');

        const proxyConfig = { socks5: options.socks5, http: options.http };
        const tokenResult = await this.getGraphAccessToken(credentials, proxyConfig);

        if (!tokenResult) {
            throw new AppError('GRAPH_API_FAILED', 'Failed to get access token', 500);
        }

        const resolvedMailbox = await this.resolveGraphMailbox(
            tokenResult.accessToken,
            options.mailbox,
            proxyConfig
        );

        // 1. 获取所有邮件 ID
        let page = 0;
        let deletedCount = 0;
        let hasMore = true;

        try {
            while (hasMore && page < 10) { // 限制最大页数防止超时
                const messages = await this.getEmailsViaResolvedGraphMailbox(
                    tokenResult.accessToken,
                    resolvedMailbox,
                    500, // 每次取 500
                    proxyConfig
                );

                if (messages.length === 0) {
                    hasMore = false;
                    break;
                }

                // 2. 批量删除（Graph API 不支持批量删除，只能并发逐个删除）
                // 限制并发数为 10
                const batchSize = 10;
                for (let i = 0; i < messages.length; i += batchSize) {
                    const chunk = messages.slice(i, i + batchSize);
                    await Promise.all(chunk.map(msg =>
                        this.deleteMessageViaGraphApi(tokenResult.accessToken, msg.id, proxyConfig)
                    ));
                    deletedCount += chunk.length;
                }

                page++;
            }

            return {
                email: credentials.email,
                mailbox: options.mailbox,
                message: `Successfully deleted ${deletedCount} messages`,
                status: 'success',
                deletedCount,
            };

        } catch (err: unknown) {
            logger.error({ err, email: credentials.email }, 'Error processing mailbox');
            return {
                email: credentials.email,
                mailbox: options.mailbox,
                message: `Partial success or error: ${getErrorMessage(err)}`,
                status: 'error',
                deletedCount,
            };
        }
    },

    /**
     * 单个删除邮件
     */
    async deleteMessageViaGraphApi(
        accessToken: string,
        messageId: string,
        proxyConfig?: { socks5?: string; http?: string }
    ) {
        try {
            await proxyFetch(
                `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                },
                proxyConfig
            );
        } catch (_err) {
            // 忽略删除错误，继续下一个
            logger.warn({ messageId }, 'Failed to delete message');
        }
    },
};
