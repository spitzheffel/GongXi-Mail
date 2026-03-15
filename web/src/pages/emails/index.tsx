import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    Input,
    List,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    Upload,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    GroupOutlined,
    InboxOutlined,
    MailOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SyncOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader, StatCard } from '../../components';
import { emailApi, groupApi } from '../../api';
import { getErrorMessage } from '../../utils/error';
import { requestData } from '../../utils/request';

const { Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

const MAIL_FETCH_STRATEGY_OPTIONS = [
    { value: 'GRAPH_FIRST', label: 'Graph 优先（失败回退 IMAP）' },
    { value: 'IMAP_FIRST', label: 'IMAP 优先（失败回退 Graph）' },
    { value: 'GRAPH_ONLY', label: '仅 Graph' },
    { value: 'IMAP_ONLY', label: '仅 IMAP' },
] as const;

type MailFetchStrategy = (typeof MAIL_FETCH_STRATEGY_OPTIONS)[number]['value'];

const MAIL_FETCH_STRATEGY_LABELS: Record<MailFetchStrategy, string> = {
    GRAPH_FIRST: 'Graph 优先',
    IMAP_FIRST: 'IMAP 优先',
    GRAPH_ONLY: '仅 Graph',
    IMAP_ONLY: '仅 IMAP',
};

const MAILBOX_SPECIAL_USE_LABELS: Record<string, string> = {
    inbox: '收件箱',
    junkemail: '垃圾邮件',
    sentitems: '已发送',
    drafts: '草稿箱',
    deleteditems: '已删除',
    archive: '存档',
    outbox: '发件箱',
};

const MAILBOX_NAME_LABELS: Record<string, string> = {
    inbox: '收件箱',
    junk: '垃圾邮件',
    'junk email': '垃圾邮件',
    junkemail: '垃圾邮件',
    spam: '垃圾邮件',
    sent: '已发送',
    'sent items': '已发送',
    'sent mail': '已发送',
    sentitems: '已发送',
    draft: '草稿箱',
    drafts: '草稿箱',
    deleted: '已删除',
    'deleted items': '已删除',
    deleteditems: '已删除',
    trash: '已删除',
    archive: '存档',
    outbox: '发件箱',
};

const normalizeMailboxSegment = (value: string): string =>
    value
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();

const formatMailboxSegment = (segment: string, specialUse?: string | null): string => {
    const trimmed = segment.trim();
    if (!trimmed) {
        return segment;
    }

    const translated =
        (specialUse ? MAILBOX_SPECIAL_USE_LABELS[specialUse.toLowerCase()] : undefined)
        || MAILBOX_NAME_LABELS[normalizeMailboxSegment(trimmed)];

    if (!translated || translated === trimmed) {
        return trimmed;
    }

    return `${translated}（${trimmed}）`;
};

const formatMailboxPath = (folder: MailboxFolder): string => {
    const segments = folder.path
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length === 0) {
        return formatMailboxSegment(folder.name, folder.specialUse);
    }

    return segments
        .map((segment, index) =>
            formatMailboxSegment(
                segment,
                index === segments.length - 1 ? folder.specialUse : undefined
            )
        )
        .join(' / ');
};

const EMAIL_STATUS_META: Record<'ACTIVE' | 'ERROR' | 'DISABLED', { color: string; label: string }> = {
    ACTIVE: { color: 'success', label: '正常' },
    ERROR: { color: 'error', label: '异常' },
    DISABLED: { color: 'default', label: '禁用' },
};

interface EmailGroup {
    id: number;
    name: string;
    description: string | null;
    fetchStrategy: MailFetchStrategy;
    emailCount: number;
    createdAt: string;
    updatedAt: string;
}

interface EmailAccount {
    id: number;
    email: string;
    clientId: string;
    status: 'ACTIVE' | 'ERROR' | 'DISABLED';
    groupId: number | null;
    group: { id: number; name: string } | null;
    lastCheckAt: string | null;
    errorMessage: string | null;
    createdAt: string;
}

interface EmailListResult {
    list: EmailAccount[];
    total: number;
}

interface MailItem {
    id: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    date: string;
}

interface MailboxFolder {
    name: string;
    path: string;
    mailbox: string;
    provider: 'graph' | 'imap';
    specialUse?: string | null;
}

interface MailboxListResult {
    folders: MailboxFolder[];
    method: string;
}

interface EmailDetailsResult extends EmailAccount {
    refreshToken: string;
}

const EmailsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<EmailAccount[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [importModalVisible, setImportModalVisible] = useState(false);
    const [mailModalVisible, setMailModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [keyword, setKeyword] = useState('');
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [importContent, setImportContent] = useState('');
    const [separator, setSeparator] = useState('----');
    const [importGroupId, setImportGroupId] = useState<number | undefined>(undefined);
    const [mailList, setMailList] = useState<MailItem[]>([]);
    const [mailLoading, setMailLoading] = useState(false);
    const [mailboxes, setMailboxes] = useState<MailboxFolder[]>([]);
    const [mailboxesLoading, setMailboxesLoading] = useState(false);
    const [currentEmail, setCurrentEmail] = useState<string>('');
    const [currentEmailId, setCurrentEmailId] = useState<number | null>(null);
    const [currentMailbox, setCurrentMailbox] = useState<string>('');
    const [emailDetailVisible, setEmailDetailVisible] = useState(false);
    const [emailDetailContent, setEmailDetailContent] = useState('');
    const [emailDetailSubject, setEmailDetailSubject] = useState('');
    const [emailEditLoading, setEmailEditLoading] = useState(false);
    const [groups, setGroups] = useState<EmailGroup[]>([]);
    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
    const [assignGroupModalVisible, setAssignGroupModalVisible] = useState(false);
    const [assignTargetGroupId, setAssignTargetGroupId] = useState<number | undefined>(undefined);
    const latestListRequestIdRef = useRef(0);
    const latestMailboxRequestIdRef = useRef(0);
    const [form] = Form.useForm();
    const [groupForm] = Form.useForm();

    const toOptionalNumber = (value: unknown): number | undefined => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const fetchGroups = useCallback(async () => {
        const result = await requestData<EmailGroup[]>(
            () => groupApi.getList(),
            '获取分组失败',
            { silent: true }
        );
        if (result) {
            setGroups(result);
        }
    }, []);

    const fetchData = useCallback(async () => {
        const currentRequestId = ++latestListRequestIdRef.current;
        setLoading(true);

        const params: { page: number; pageSize: number; keyword: string; groupId?: number } = {
            page,
            pageSize,
            keyword: debouncedKeyword,
        };

        if (filterGroupId !== undefined) {
            params.groupId = filterGroupId;
        }

        const result = await requestData<EmailListResult>(
            () => emailApi.getList(params),
            '获取数据失败'
        );

        if (currentRequestId !== latestListRequestIdRef.current) {
            return;
        }

        if (result) {
            setData(result.list);
            setTotal(result.total);
        }

        setLoading(false);
    }, [debouncedKeyword, filterGroupId, page, pageSize]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchGroups();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchGroups]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedKeyword(keyword.trim());
        }, 300);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchData();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchData]);

    const refreshOverview = useCallback(() => {
        void fetchData();
        void fetchGroups();
    }, [fetchData, fetchGroups]);

    const handleCreate = () => {
        setEditingId(null);
        setEmailEditLoading(false);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = useCallback(async (record: EmailAccount) => {
        setEditingId(record.id);
        setEmailEditLoading(true);
        form.resetFields();
        setModalVisible(true);
        try {
            const res = await emailApi.getById<EmailDetailsResult>(record.id, true);
            if (res.code === 200) {
                const details = res.data;
                form.setFieldsValue({
                    email: details.email,
                    clientId: details.clientId,
                    refreshToken: details.refreshToken,
                    status: details.status,
                    groupId: details.groupId,
                });
            }
        } catch {
            message.error('获取详情失败');
        } finally {
            setEmailEditLoading(false);
        }
    }, [form]);

    const handleDelete = useCallback(async (id: number) => {
        try {
            const res = await emailApi.delete(id);
            if (res.code === 200) {
                message.success('删除成功');
                refreshOverview();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '删除失败'));
        }
    }, [refreshOverview]);

    const handleBatchDelete = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请选择要删除的邮箱');
            return;
        }

        try {
            const res = await emailApi.batchDelete(selectedRowKeys as number[]);
            if (res.code === 200) {
                message.success(`成功删除 ${res.data.deleted} 个邮箱`);
                setSelectedRowKeys([]);
                refreshOverview();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '删除失败'));
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const normalizedGroupId = values.groupId === null ? null : toOptionalNumber(values.groupId);

            if (editingId) {
                const res = await emailApi.update(editingId, {
                    ...values,
                    groupId: normalizedGroupId ?? null,
                });
                if (res.code === 200) {
                    message.success('更新成功');
                    setModalVisible(false);
                    refreshOverview();
                } else {
                    message.error(res.message);
                }
                return;
            }

            const res = await emailApi.create({
                ...values,
                groupId: toOptionalNumber(values.groupId),
            });

            if (res.code === 200) {
                message.success('创建成功');
                setModalVisible(false);
                refreshOverview();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '保存失败'));
        }
    };

    const handleImport = async () => {
        if (!importContent.trim()) {
            message.warning('请输入或粘贴邮箱数据');
            return;
        }

        try {
            const res = await emailApi.import(importContent, separator, toOptionalNumber(importGroupId));
            if (res.code === 200) {
                message.success(res.message);
                setImportModalVisible(false);
                setImportContent('');
                setImportGroupId(undefined);
                refreshOverview();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '导入失败'));
        }
    };

    const handleExport = async () => {
        try {
            const ids = selectedRowKeys.length > 0 ? selectedRowKeys as number[] : undefined;
            const groupId = ids ? undefined : toOptionalNumber(filterGroupId);
            const res = await emailApi.export(ids, separator, groupId);
            if (res.code !== 200) {
                message.error(res.message || '导出失败');
                return;
            }

            const content = res.data?.content || '';
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'email_accounts.txt';
            anchor.click();
            URL.revokeObjectURL(url);

            message.success('导出成功');
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '导出失败'));
        }
    };

    const loadMails = useCallback(async (emailId: number, mailbox: string, showSuccessToast: boolean = false) => {
        if (!mailbox) {
            setMailList([]);
            return;
        }
        setMailLoading(true);
        const result = await requestData<{ messages: MailItem[] }>(
            () => emailApi.viewMails(emailId, mailbox),
            '获取邮件失败'
        );
        if (result) {
            setMailList(result.messages || []);
            if (showSuccessToast) {
                message.success('刷新成功');
            }
        }
        setMailLoading(false);
    }, []);

    const loadMailboxes = useCallback(async (emailId: number, preferredMailbox?: string) => {
        const currentRequestId = ++latestMailboxRequestIdRef.current;
        setMailboxesLoading(true);

        const result = await requestData<MailboxListResult>(
            () => emailApi.getMailboxes<MailboxFolder>(emailId),
            '获取邮箱文件夹失败'
        );

        if (currentRequestId !== latestMailboxRequestIdRef.current) {
            return null;
        }

        const folders = result?.folders || [];
        setMailboxes(folders);

        const selectedMailbox = (
            preferredMailbox && folders.some((folder) => folder.mailbox === preferredMailbox)
                ? preferredMailbox
                : folders.find((folder) => folder.specialUse === 'inbox')?.mailbox
                    || folders[0]?.mailbox
                    || ''
        );
        setCurrentMailbox(selectedMailbox);
        setMailboxesLoading(false);

        return {
            folders,
            selectedMailbox,
        };
    }, []);

    const handleOpenMails = useCallback(async (record: EmailAccount) => {
        setCurrentEmail(record.email);
        setCurrentEmailId(record.id);
        setCurrentMailbox('');
        setMailboxes([]);
        setMailList([]);
        setMailModalVisible(true);

        const mailboxResult = await loadMailboxes(record.id);
        if (!mailboxResult?.selectedMailbox) {
            return;
        }

        await loadMails(record.id, mailboxResult.selectedMailbox);
    }, [loadMailboxes, loadMails]);

    const handleMailboxChange = async (mailbox: string) => {
        if (!currentEmailId) return;
        setCurrentMailbox(mailbox);
        await loadMails(currentEmailId, mailbox);
    };

    const handleRefreshMails = async () => {
        if (!currentEmailId || !currentMailbox) return;
        await loadMails(currentEmailId, currentMailbox, true);
    };

    const handleClearMailbox = async () => {
        if (!currentEmailId || !currentMailbox) return;
        try {
            const res = await emailApi.clearMailbox(currentEmailId, currentMailbox);
            if (res.code === 200) {
                message.success(`已清空 ${res.data?.deletedCount || 0} 封邮件`);
                setMailList([]);
            } else {
                message.error(res.message || '清空失败');
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '清空失败'));
        }
    };

    const handleViewEmailDetail = (record: MailItem) => {
        setEmailDetailSubject(record.subject || '无主题');
        setEmailDetailContent(record.html || record.text || '无内容');
        setEmailDetailVisible(true);
    };

    const handleCreateGroup = () => {
        setEditingGroupId(null);
        groupForm.resetFields();
        groupForm.setFieldsValue({ fetchStrategy: 'GRAPH_FIRST' });
        setGroupModalVisible(true);
    };

    const handleEditGroup = useCallback((group: EmailGroup) => {
        setEditingGroupId(group.id);
        groupForm.setFieldsValue({
            name: group.name,
            description: group.description,
            fetchStrategy: group.fetchStrategy,
        });
        setGroupModalVisible(true);
    }, [groupForm]);

    const handleDeleteGroup = useCallback(async (id: number) => {
        try {
            const res = await groupApi.delete(id);
            if (res.code === 200) {
                message.success('分组已删除');
                refreshOverview();
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '删除失败'));
        }
    }, [refreshOverview]);

    const handleGroupSubmit = async () => {
        try {
            const values = await groupForm.validateFields();
            if (editingGroupId) {
                const res = await groupApi.update(editingGroupId, values);
                if (res.code === 200) {
                    message.success('分组已更新');
                    setGroupModalVisible(false);
                    refreshOverview();
                }
                return;
            }

            const res = await groupApi.create(values);
            if (res.code === 200) {
                message.success('分组已创建');
                setGroupModalVisible(false);
                refreshOverview();
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '分组保存失败'));
        }
    };

    const handleBatchAssignGroup = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先选择邮箱');
            return;
        }
        if (!assignTargetGroupId) {
            message.warning('请选择目标分组');
            return;
        }
        try {
            const res = await groupApi.assignEmails(assignTargetGroupId, selectedRowKeys as number[]);
            if (res.code === 200) {
                message.success(`已将 ${res.data.count} 个邮箱分配到分组`);
                setAssignGroupModalVisible(false);
                setAssignTargetGroupId(undefined);
                setSelectedRowKeys([]);
                refreshOverview();
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '分配失败'));
        }
    };

    const handleBatchRemoveGroup = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先选择邮箱');
            return;
        }

        const selectedEmails = data.filter((item) => selectedRowKeys.includes(item.id));
        const groupIds = [...new Set(selectedEmails.map((item) => item.groupId).filter(Boolean))] as number[];

        try {
            for (const groupId of groupIds) {
                const emailIds = selectedEmails
                    .filter((item) => item.groupId === groupId)
                    .map((item) => item.id);
                await groupApi.removeEmails(groupId, emailIds);
            }
            message.success('已将选中邮箱移出分组');
            setSelectedRowKeys([]);
            refreshOverview();
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '移出失败'));
        }
    };

    const groupedTotal = useMemo(
        () => groups.reduce((sum, group) => sum + group.emailCount, 0),
        [groups]
    );
    const ungroupedTotal = Math.max(total - groupedTotal, 0);
    const currentPageErrorCount = useMemo(
        () => data.filter((item) => item.status === 'ERROR').length,
        [data]
    );
    const currentPageDisabledCount = useMemo(
        () => data.filter((item) => item.status === 'DISABLED').length,
        [data]
    );
    const strategyCount = useMemo(
        () => new Set(groups.map((group) => group.fetchStrategy)).size,
        [groups]
    );

    const columns: ColumnsType<EmailAccount> = useMemo(() => [
        {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
            ellipsis: true,
            render: (value: string, record: EmailAccount) => (
                <div>
                    <Text strong>{value}</Text>
                    {record.errorMessage ? (
                        <Tooltip title={record.errorMessage}>
                            <Text type="danger" style={{ display: 'block', marginTop: 6 }}>
                                {record.errorMessage}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                            {record.group ? `当前分组：${record.group.name}` : '当前未编入任何分组'}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: '客户端 ID',
            dataIndex: 'clientId',
            key: 'clientId',
            ellipsis: true,
            render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
        },
        {
            title: '分组',
            dataIndex: 'group',
            key: 'group',
            width: 140,
            render: (group: EmailAccount['group']) => (
                group ? <Tag color="processing">{group.name}</Tag> : <Tag>未分组</Tag>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: EmailAccount['status']) => (
                <Tag color={EMAIL_STATUS_META[status].color}>{EMAIL_STATUS_META[status].label}</Tag>
            ),
        },
        {
            title: '最后检查',
            dataIndex: 'lastCheckAt',
            key: 'lastCheckAt',
            width: 160,
            render: (value: string | null) => (
                value ? dayjs(value).format('YYYY-MM-DD HH:mm') : <Text type="secondary">未执行</Text>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: '操作',
            key: 'action',
            width: 180,
            render: (_: unknown, record: EmailAccount) => (
                <Space size="small">
                    <Tooltip title="查看邮件">
                        <Button
                            type="text"
                            icon={<MailOutlined />}
                            onClick={() => void handleOpenMails(record)}
                        />
                    </Tooltip>
                    <Tooltip title="编辑">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => void handleEdit(record)}
                        />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Popconfirm title="确定要删除此邮箱吗？" onConfirm={() => void handleDelete(record.id)}>
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ], [handleDelete, handleEdit, handleOpenMails]);

    const groupColumns: ColumnsType<EmailGroup> = useMemo(() => [
        {
            title: '分组名称',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: EmailGroup) => (
                <div>
                    <Tag color="processing">{name}</Tag>
                    {record.description && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                            {record.description}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: '拉取策略',
            dataIndex: 'fetchStrategy',
            key: 'fetchStrategy',
            width: 180,
            render: (value: MailFetchStrategy) => <Tag color="purple">{MAIL_FETCH_STRATEGY_LABELS[value]}</Tag>,
        },
        {
            title: '邮箱数',
            dataIndex: 'emailCount',
            key: 'emailCount',
            width: 120,
            render: (value: number) => <Text strong>{value}</Text>,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_: unknown, record: EmailGroup) => (
                <Space size="small">
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEditGroup(record)} />
                    <Popconfirm
                        title="删除分组后，组内邮箱将变为未分组，确认继续吗？"
                        onConfirm={() => void handleDeleteGroup(record.id)}
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [handleDeleteGroup, handleEditGroup]);

    const rowSelection = useMemo(
        () => ({
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            preserveSelectedRowKeys: true,
        }),
        [selectedRowKeys]
    );

    const tablePagination = useMemo(
        () => ({
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (currentPage: number, currentPageSize: number) => {
                setPage(currentPage);
                setPageSize(currentPageSize);
            },
        }),
        [page, pageSize, total]
    );

    const mailboxOptions = useMemo(
        () =>
            mailboxes.map((folder: MailboxFolder) => ({
                value: folder.mailbox,
                label: formatMailboxPath(folder),
            })),
        [mailboxes]
    );

    const currentMailboxLabel = useMemo(
        () =>
            (() => {
                const currentFolder = mailboxes.find(
                    (folder: MailboxFolder) => folder.mailbox === currentMailbox
                );
                return currentFolder ? formatMailboxPath(currentFolder) : currentMailbox;
            })()
            || currentMailbox
            || '邮箱文件夹',
        [currentMailbox, mailboxes]
    );

    const emailDetailSrcDoc = useMemo(
        () => `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body {
                        font-family: 'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        font-size: 14px;
                        line-height: 1.7;
                        color: #0f172a;
                        margin: 0;
                        padding: 20px;
                        background: #f8fcff;
                    }
                    img { max-width: 100%; height: auto; }
                    a { color: #0369a1; }
                </style>
            </head>
            <body>${emailDetailContent}</body>
            </html>
        `,
        [emailDetailContent]
    );

    const groupFilterOptions = useMemo(
        () => groups.map((group) => ({
            value: group.id,
            label: `${group.name} (${group.emailCount})`,
        })),
        [groups]
    );

    const groupOptions = useMemo(
        () => groups.map((group) => ({
            value: group.id,
            label: group.name,
        })),
        [groups]
    );

    return (
        <div className="gx-ops-shell">
            <PageHeader
                title="邮箱管理"
                extra={<Button icon={<ReloadOutlined />} onClick={refreshOverview}>刷新数据</Button>}
            />

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                    <StatCard title="托管邮箱" value={total} icon={<MailOutlined />} iconBgColor="#0369A1" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="已纳入分组" value={groupedTotal} suffix={`/ ${total || 0}`} icon={<GroupOutlined />} iconBgColor="#0F766E" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="分组数量" value={groups.length} icon={<InboxOutlined />} iconBgColor="#0EA5E9" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="当前页异常" value={currentPageErrorCount} icon={<SyncOutlined />} iconBgColor="#f59e0b" />
                </Col>
            </Row>

            <Tabs
                defaultActiveKey="emails"
                animated={false}
                destroyInactiveTabPane
                className="gx-ops-tabs"
                items={[
                    {
                        key: 'emails',
                        label: (
                            <span className="gx-ops-tab-label">
                                邮箱列表
                                <Tag className="gx-ops-tab-count">{total}</Tag>
                            </span>
                        ),
                        children: (
                            <Card className="gx-panel-card gx-data-table" bordered={false}>
                                <div className="gx-ops-toolbar">
                                    <div className="gx-ops-toolbar__cluster">
                                        <Input
                                            allowClear
                                            placeholder="搜索邮箱地址"
                                            prefix={<SearchOutlined />}
                                            value={keyword}
                                            onChange={(event) => setKeyword(event.target.value)}
                                            style={{ width: 260, maxWidth: '100%' }}
                                        />
                                        <Select
                                            allowClear
                                            placeholder="按分组筛选"
                                            value={filterGroupId}
                                            options={groupFilterOptions}
                                            onChange={(value: number | string | undefined) => {
                                                setFilterGroupId(toOptionalNumber(value));
                                                setPage(1);
                                            }}
                                            style={{ width: 220, maxWidth: '100%' }}
                                        />
                                        {(keyword || filterGroupId !== undefined) && (
                                            <Button
                                                onClick={() => {
                                                    setKeyword('');
                                                    setFilterGroupId(undefined);
                                                    setPage(1);
                                                }}
                                            >
                                                清空筛选
                                            </Button>
                                        )}
                                    </div>
                                    <div className="gx-ops-toolbar__cluster gx-ops-toolbar__cluster--actions">
                                        <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>导入</Button>
                                        <Button icon={<DownloadOutlined />} onClick={() => void handleExport()}>导出</Button>
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>添加邮箱</Button>
                                    </div>
                                </div>

                                {selectedRowKeys.length > 0 && (
                                    <div className="gx-ops-selection">
                                        <div className="gx-ops-selection__copy">
                                            <Text className="gx-ops-selection__label">Batch Actions</Text>
                                            <Text className="gx-ops-selection__text">
                                                已选中 {selectedRowKeys.length} 个邮箱，可以继续做分组编排或清理操作。
                                            </Text>
                                        </div>
                                        <Space wrap>
                                            <Button icon={<GroupOutlined />} onClick={() => setAssignGroupModalVisible(true)}>分配分组</Button>
                                            <Button onClick={() => void handleBatchRemoveGroup()}>移出分组</Button>
                                            <Popconfirm
                                                title={`确定要删除选中的 ${selectedRowKeys.length} 个邮箱吗？`}
                                                onConfirm={() => void handleBatchDelete()}
                                            >
                                                <Button danger>批量删除</Button>
                                            </Popconfirm>
                                        </Space>
                                    </div>
                                )}

                                <div className={`gx-ops-note${currentPageErrorCount > 0 ? ' gx-ops-note--warning' : ''}`} style={{ marginBottom: 18 }}>
                                    <Text className="gx-ops-note__label">Page Health</Text>
                                    <Text className="gx-ops-note__text">
                                        当前页有 {currentPageErrorCount} 个异常邮箱、{currentPageDisabledCount} 个禁用邮箱，便于你先处理高风险项。
                                    </Text>
                                </div>

                                <Table
                                    className="gx-dashboard-table"
                                    columns={columns}
                                    dataSource={data}
                                    rowKey="id"
                                    loading={loading}
                                    rowSelection={rowSelection}
                                    pagination={tablePagination}
                                    scroll={{ y: 560, x: 1200 }}
                                    locale={{ emptyText: '暂无邮箱数据' }}
                                />
                            </Card>
                        ),
                    },
                    {
                        key: 'groups',
                        label: (
                            <span className="gx-ops-tab-label">
                                邮箱分组
                                <Tag className="gx-ops-tab-count">{groups.length}</Tag>
                            </span>
                        ),
                        children: (
                            <Card className="gx-panel-card gx-data-table" bordered={false}>
                                <div className="gx-ops-toolbar">
                                    <div className="gx-ops-toolbar__cluster">
                                        <div className="gx-ops-note" style={{ width: '100%' }}>
                                            <Text className="gx-ops-note__label">Routing Summary</Text>
                                            <Text className="gx-ops-note__text">
                                                分组现在承担的是邮箱池组织层。你可以按渠道、环境或业务线定义拉取策略，再把邮箱批量编排进去。
                                            </Text>
                                            <div className="gx-ops-note__grid">
                                                <div className="gx-ops-note__metric">
                                                    <Text className="gx-ops-note__metric-label">已分组邮箱</Text>
                                                    <Text className="gx-ops-note__metric-value">{groupedTotal}</Text>
                                                </div>
                                                <div className="gx-ops-note__metric">
                                                    <Text className="gx-ops-note__metric-label">未分组邮箱</Text>
                                                    <Text className="gx-ops-note__metric-value">{ungroupedTotal}</Text>
                                                </div>
                                                <div className="gx-ops-note__metric">
                                                    <Text className="gx-ops-note__metric-label">策略种类</Text>
                                                    <Text className="gx-ops-note__metric-value">{strategyCount}</Text>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="gx-ops-toolbar__cluster gx-ops-toolbar__cluster--actions">
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateGroup}>创建分组</Button>
                                    </div>
                                </div>

                                <Table
                                    className="gx-dashboard-table"
                                    columns={groupColumns}
                                    dataSource={groups}
                                    rowKey="id"
                                    pagination={false}
                                    locale={{ emptyText: '暂无分组数据' }}
                                />
                            </Card>
                        ),
                    },
                ]}
            />

            <Modal
                className="gx-console-modal"
                title={editingId ? '编辑邮箱账户' : '添加邮箱账户'}
                open={modalVisible}
                onOk={() => void handleSubmit()}
                onCancel={() => setModalVisible(false)}
                okText={editingId ? '保存更新' : '创建邮箱'}
                cancelText="取消"
                destroyOnClose
                width={720}
            >
                <Spin spinning={emailEditLoading}>
                    <div className="gx-modal-stack">
                        <div className="gx-modal-section">
                            <Text className="gx-modal-section__label">Credential Setup</Text>
                            <Text className="gx-modal-section__text">
                                录入邮箱凭据后，可以直接绑定到现有分组。编辑时默认保留现有凭据，只更新你调整的字段。
                            </Text>
                        </div>
                        <Form form={form} layout="vertical">
                            <Row gutter={[16, 0]}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="email"
                                        label="邮箱地址"
                                        rules={[
                                            { required: true, message: '请输入邮箱地址' },
                                            { type: 'email', message: '请输入有效的邮箱地址' },
                                        ]}
                                    >
                                        <Input placeholder="example@outlook.com" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="password" label="密码">
                                        <Input.Password placeholder="可选" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="clientId"
                                        label="客户端 ID"
                                        rules={[{ required: true, message: '请输入客户端 ID' }]}
                                    >
                                        <Input placeholder="Azure AD 应用程序 ID" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="groupId" label="所属分组">
                                        <Select placeholder="可选：选择分组" allowClear options={groupOptions} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24}>
                                    <Form.Item
                                        name="refreshToken"
                                        label="刷新令牌"
                                        rules={[{ required: !editingId, message: '请输入刷新令牌' }]}
                                    >
                                        <TextArea rows={4} placeholder="OAuth2 Refresh Token" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="status" label="状态" initialValue="ACTIVE">
                                        <Select
                                            options={[
                                                { value: 'ACTIVE', label: '正常' },
                                                { value: 'DISABLED', label: '禁用' },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </div>
                </Spin>
            </Modal>

            <Modal
                className="gx-console-modal"
                title="批量导入邮箱"
                open={importModalVisible}
                onOk={() => void handleImport()}
                onCancel={() => setImportModalVisible(false)}
                okText="开始导入"
                cancelText="取消"
                destroyOnClose
                width={760}
            >
                <div className="gx-modal-stack">
                    <div className="gx-modal-section">
                        <Text className="gx-modal-section__label">Import Rules</Text>
                        <Text className="gx-modal-section__text">
                            支持直接上传文本文件或粘贴内容。推荐格式为：邮箱{separator}密码{separator}客户端 ID{separator}刷新令牌。
                        </Text>
                    </div>
                    <div className="gx-modal-section">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={10}>
                                <Input addonBefore="分隔符" value={separator} onChange={(event) => setSeparator(event.target.value)} />
                            </Col>
                            <Col xs={24} md={14}>
                                <Select
                                    allowClear
                                    placeholder="导入到分组（可选）"
                                    value={importGroupId}
                                    options={groupOptions}
                                    onChange={(value: number | string | undefined) => setImportGroupId(toOptionalNumber(value))}
                                />
                            </Col>
                        </Row>
                        <div style={{ marginTop: 16 }}>
                            <Dragger
                                beforeUpload={(file) => {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                        const fileContent = event.target?.result as string;
                                        if (!fileContent) {
                                            return;
                                        }

                                        const lines = fileContent.split(/\r?\n/).filter((line) => line.trim());
                                        const processedLines = lines.map((line) => {
                                            const parts = line.split(separator);
                                            if (parts.length >= 5) {
                                                return `${parts[0]}${separator}${parts[1]}${separator}${parts[4]}`;
                                            }
                                            return line;
                                        });

                                        setImportContent(processedLines.join('\n'));
                                        message.success(`文件读取成功，已解析 ${lines.length} 行数据`);
                                    };
                                    reader.readAsText(file);
                                    return false;
                                }}
                                showUploadList={false}
                                maxCount={1}
                                accept=".txt,.csv"
                            >
                                <p className="ant-upload-drag-icon">
                                    <InboxOutlined />
                                </p>
                                <p className="ant-upload-text">点击或拖拽文件到此区域</p>
                                <p className="ant-upload-hint">支持 .txt 或 .csv 文件</p>
                            </Dragger>
                        </div>
                        <TextArea
                            rows={12}
                            value={importContent}
                            onChange={(event) => setImportContent(event.target.value)}
                            placeholder={`example@outlook.com${separator}client_id${separator}refresh_token`}
                            style={{ marginTop: 16 }}
                        />
                    </div>
                </div>
            </Modal>

            {mailModalVisible && (
                <Modal
                    className="gx-console-modal"
                    title={`${currentEmail} · ${currentMailboxLabel}`}
                    open={mailModalVisible}
                    onCancel={() => {
                        latestMailboxRequestIdRef.current += 1;
                        setMailModalVisible(false);
                        setCurrentEmail('');
                        setCurrentEmailId(null);
                        setCurrentMailbox('');
                        setMailboxes([]);
                        setMailboxesLoading(false);
                        setMailList([]);
                    }}
                    footer={null}
                    destroyOnClose
                    width={1040}
                >
                    <div className="gx-modal-stack">
                        <div className="gx-ops-selection" style={{ marginBottom: 0 }}>
                            <div className="gx-ops-selection__copy">
                                <Text className="gx-ops-selection__label">Mailbox Reader</Text>
                                <Text className="gx-ops-selection__text">
                                    当前支持切换邮箱文件夹，已加载 {mailList.length} 封邮件，可直接查看正文或清空当前文件夹。
                                </Text>
                            </div>
                            <Space wrap>
                                <Select
                                    showSearch
                                    placeholder={mailboxesLoading ? '加载文件夹中...' : '选择文件夹'}
                                    value={currentMailbox || undefined}
                                    options={mailboxOptions}
                                    loading={mailboxesLoading}
                                    disabled={mailboxesLoading || mailboxOptions.length === 0}
                                    optionFilterProp="label"
                                    style={{ width: 320, maxWidth: '100%' }}
                                    onChange={(value: string) => {
                                        void handleMailboxChange(value);
                                    }}
                                />
                                <Button
                                    type="primary"
                                    onClick={() => void handleRefreshMails()}
                                    loading={mailLoading}
                                    disabled={!currentMailbox || mailboxesLoading}
                                >
                                    收取新邮件
                                </Button>
                                <Popconfirm
                                    title={`确定要清空 ${currentMailboxLabel} 的所有邮件吗？`}
                                    onConfirm={() => void handleClearMailbox()}
                                >
                                    <Button danger disabled={!currentMailbox || mailboxesLoading}>清空邮箱</Button>
                                </Popconfirm>
                            </Space>
                        </div>
                        <List
                            className="gx-data-list"
                            loading={mailLoading || mailboxesLoading}
                            dataSource={mailList}
                            itemLayout="horizontal"
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: true,
                                showQuickJumper: true,
                                showTotal: (count: number) => `共 ${count} 条`,
                                style: { marginTop: 16 },
                            }}
                            renderItem={(item) => (
                                <List.Item
                                    key={item.id}
                                    actions={[
                                        <Button key={item.id} type="primary" size="small" onClick={() => handleViewEmailDetail(item)}>
                                            查看正文
                                        </Button>,
                                    ]}
                                >
                                    <List.Item.Meta
                                        title={
                                            <Typography.Text ellipsis style={{ maxWidth: 620 }}>
                                                {item.subject || '（无主题）'}
                                            </Typography.Text>
                                        }
                                        description={(
                                            <Space size="large" wrap>
                                                <Text style={{ color: '#0369a1' }}>{item.from || '未知发件人'}</Text>
                                                <Text type="secondary">
                                                    {item.date ? dayjs(item.date).format('YYYY-MM-DD HH:mm') : '-'}
                                                </Text>
                                            </Space>
                                        )}
                                    />
                                </List.Item>
                            )}
                        />
                    </div>
                </Modal>
            )}

            {emailDetailVisible && (
                <Modal
                    className="gx-console-modal"
                    title={emailDetailSubject}
                    open={emailDetailVisible}
                    onCancel={() => setEmailDetailVisible(false)}
                    footer={null}
                    destroyOnClose
                    width={960}
                >
                    <div className="gx-modal-stack">
                        <div className="gx-modal-section">
                            <Text className="gx-modal-section__label">Rendered Message</Text>
                            <Text className="gx-modal-section__text">
                                当前内容按邮件原始 HTML 或文本正文渲染，适合快速核查验证码、发件人和正文结构。
                            </Text>
                        </div>
                        <iframe
                            title="email-content"
                            sandbox="allow-same-origin"
                            srcDoc={emailDetailSrcDoc}
                            style={{
                                width: '100%',
                                height: 'calc(100vh - 320px)',
                                border: '1px solid rgba(125, 211, 252, 0.18)',
                                borderRadius: '22px',
                                backgroundColor: '#f8fcff',
                            }}
                        />
                    </div>
                </Modal>
            )}

            <Modal
                className="gx-console-modal"
                title={editingGroupId ? '编辑分组' : '创建分组'}
                open={groupModalVisible}
                onOk={() => void handleGroupSubmit()}
                onCancel={() => setGroupModalVisible(false)}
                okText={editingGroupId ? '保存分组' : '创建分组'}
                cancelText="取消"
                destroyOnClose
                width={520}
            >
                <div className="gx-modal-stack">
                    <div className="gx-modal-section">
                        <Text className="gx-modal-section__label">Strategy Binding</Text>
                        <Text className="gx-modal-section__text">
                            分组不仅用于归类，还直接决定邮箱拉取策略，适合按渠道、环境或业务线拆分。
                        </Text>
                    </div>
                    <Form form={groupForm} layout="vertical">
                        <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
                            <Input placeholder="例如：aws、discord" />
                        </Form.Item>
                        <Form.Item name="description" label="描述">
                            <Input placeholder="可选描述" />
                        </Form.Item>
                        <Form.Item
                            name="fetchStrategy"
                            label="邮件拉取策略"
                            rules={[{ required: true, message: '请选择拉取策略' }]}
                        >
                            <Select
                                options={MAIL_FETCH_STRATEGY_OPTIONS.map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                }))}
                            />
                        </Form.Item>
                    </Form>
                </div>
            </Modal>

            <Modal
                className="gx-console-modal"
                title="分配邮箱到分组"
                open={assignGroupModalVisible}
                onOk={() => void handleBatchAssignGroup()}
                onCancel={() => setAssignGroupModalVisible(false)}
                okText="确认分配"
                cancelText="取消"
                destroyOnClose
                width={460}
            >
                <div className="gx-modal-stack">
                    <div className="gx-modal-section">
                        <Text className="gx-modal-section__label">Selection Scope</Text>
                        <Text className="gx-modal-section__text">
                            已选择 {selectedRowKeys.length} 个邮箱。确认目标分组后，会一次性完成归档和后续策略绑定。
                        </Text>
                    </div>
                    <Select
                        placeholder="选择目标分组"
                        value={assignTargetGroupId}
                        options={groupOptions}
                        onChange={(value) => setAssignTargetGroupId(value)}
                        style={{ width: '100%' }}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default EmailsPage;
