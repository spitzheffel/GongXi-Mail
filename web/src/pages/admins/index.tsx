import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DeleteOutlined,
    EditOutlined,
    LockOutlined,
    PlusOutlined,
    ReloadOutlined,
    TeamOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { adminApi } from '../../api';
import { PageHeader, StatCard } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { getAdminRoleLabel, getAdminStatusLabel, isSuperAdmin, normalizeAdminStatus } from '../../utils/auth';
import { getErrorMessage } from '../../utils/error';
import { requestData } from '../../utils/request';

const { Text } = Typography;

interface Admin {
    id: number;
    username: string;
    email: string | null;
    role: 'SUPER_ADMIN' | 'ADMIN';
    status: 'ACTIVE' | 'DISABLED';
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    createdAt: string;
}

interface AdminListResult {
    list: Admin[];
    total: number;
}

const roleOptions = [
    { value: 'ADMIN', label: '管理员' },
    { value: 'SUPER_ADMIN', label: '超级管理员' },
];

const statusOptions = [
    { value: 'ACTIVE', label: '启用' },
    { value: 'DISABLED', label: '禁用' },
];

const AdminsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Admin[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingTwoFactorEnabled, setEditingTwoFactorEnabled] = useState(false);
    const [form] = Form.useForm();
    const { admin: currentAdmin } = useAuthStore();

    const fetchData = useCallback(async () => {
        setLoading(true);
        const result = await requestData<AdminListResult>(
            () => adminApi.getList({ page, pageSize }),
            '获取数据失败'
        );
        if (result) {
            setData(result.list);
            setTotal(result.total);
        }
        setLoading(false);
    }, [page, pageSize]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchData();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchData]);

    const activeAdmins = useMemo(
        () => data.filter((item) => normalizeAdminStatus(item.status) === 'ACTIVE').length,
        [data]
    );

    const disabledAdmins = useMemo(
        () => data.filter((item) => normalizeAdminStatus(item.status) !== 'ACTIVE').length,
        [data]
    );

    const twoFactorEnabledCount = useMemo(
        () => data.filter((item) => item.twoFactorEnabled).length,
        [data]
    );

    const handleCreate = useCallback(() => {
        setEditingId(null);
        setEditingTwoFactorEnabled(false);
        form.resetFields();
        form.setFieldsValue({
            role: 'ADMIN',
            status: 'ACTIVE',
            password: '',
        });
        setModalVisible(true);
    }, [form]);

    const handleEdit = useCallback((record: Admin) => {
        setEditingId(record.id);
        setEditingTwoFactorEnabled(record.twoFactorEnabled);
        form.setFieldsValue({
            username: record.username,
            email: record.email || undefined,
            role: record.role,
            status: record.status,
            twoFactorEnabled: record.twoFactorEnabled,
            password: '',
        });
        setModalVisible(true);
    }, [form]);

    const handleDelete = useCallback(async (id: number) => {
        try {
            const res = await adminApi.delete(id);
            if (res.code === 200) {
                message.success('删除成功');
                void fetchData();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '删除失败'));
        }
    }, [fetchData]);

    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();

            if (editingId) {
                if (!values.password) {
                    delete values.password;
                }
                const res = await adminApi.update(editingId, values);
                if (res.code === 200) {
                    message.success('更新成功');
                    setModalVisible(false);
                    void fetchData();
                } else {
                    message.error(res.message);
                }
            } else {
                const res = await adminApi.create(values);
                if (res.code === 200) {
                    message.success('创建成功');
                    setModalVisible(false);
                    void fetchData();
                } else {
                    message.error(res.message);
                }
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, '保存失败'));
        }
    }, [editingId, fetchData, form]);

    const columns: ColumnsType<Admin> = useMemo(
        () => [
            {
                title: '账号',
                dataIndex: 'username',
                key: 'username',
                width: 240,
                render: (_, record) => (
                    <div>
                        <Space wrap size={8}>
                            <Text strong>{record.username}</Text>
                            {record.id === currentAdmin?.id && <Tag color="processing">当前账号</Tag>}
                        </Space>
                        <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                            {record.email || '未填写邮箱'}
                        </Text>
                    </div>
                ),
            },
            {
                title: '角色',
                dataIndex: 'role',
                key: 'role',
                width: 120,
                render: (role: Admin['role']) => (
                    <Tag color={isSuperAdmin(role) ? 'gold' : 'blue'}>
                        {getAdminRoleLabel(role)}
                    </Tag>
                ),
            },
            {
                title: '安全状态',
                key: 'security',
                width: 180,
                render: (_, record) => (
                    <Space wrap size={[8, 8]}>
                        <Tag color={normalizeAdminStatus(record.status) === 'ACTIVE' ? 'green' : 'red'}>
                            {getAdminStatusLabel(record.status)}
                        </Tag>
                        <Tag color={record.twoFactorEnabled ? 'success' : 'default'}>
                            {record.twoFactorEnabled ? '2FA 已启用' : '2FA 未启用'}
                        </Tag>
                    </Space>
                ),
            },
            {
                title: '最后登录',
                dataIndex: 'lastLoginAt',
                key: 'lastLoginAt',
                width: 220,
                render: (value: string | null, record) => (
                    value ? (
                        <div>
                            <Text strong>{dayjs(value).format('YYYY-MM-DD')}</Text>
                            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                                {dayjs(value).format('HH:mm:ss')}
                            </Text>
                            <Tooltip title="最后登录 IP">
                                <Text className="gx-code-pill" style={{ marginTop: 8 }}>
                                    {record.lastLoginIp || '未知 IP'}
                                </Text>
                            </Tooltip>
                        </div>
                    ) : (
                        <Text type="secondary">从未登录</Text>
                    )
                ),
            },
            {
                title: '创建时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 160,
                render: (value: string) => (
                    <div>
                        <Text strong>{dayjs(value).format('YYYY-MM-DD')}</Text>
                        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                            {dayjs(value).format('HH:mm')}
                        </Text>
                    </div>
                ),
            },
            {
                title: '操作',
                key: 'action',
                width: 130,
                render: (_, record) => (
                    <Space size="small">
                        <Tooltip title="编辑">
                            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                        </Tooltip>
                        {record.id !== currentAdmin?.id && (
                            <Tooltip title="删除">
                                <Popconfirm
                                    title="确定要删除此管理员吗？"
                                    description="删除后该账号将无法再登录控制台。"
                                    onConfirm={() => void handleDelete(record.id)}
                                >
                                    <Button type="text" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Tooltip>
                        )}
                    </Space>
                ),
            },
        ],
        [currentAdmin?.id, handleDelete, handleEdit]
    );

    return (
        <div className="gx-ops-shell">
            <PageHeader
                title="管理员管理"
                extra={(
                    <>
                        <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                            添加管理员
                        </Button>
                    </>
                )}
            />

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                    <StatCard title="管理员总数" value={total} icon={<TeamOutlined />} iconBgColor="#0369A1" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="当前页启用" value={activeAdmins} suffix={`/ ${data.length || 0}`} icon={<UserOutlined />} iconBgColor="#0F766E" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="2FA 已启用" value={twoFactorEnabledCount} suffix={`/ ${data.length || 0}`} icon={<LockOutlined />} iconBgColor="#0EA5E9" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="当前页停用" value={disabledAdmins} icon={<WarningOutlined />} iconBgColor="#EF4444" />
                </Col>
            </Row>

            <Card className="gx-panel-card gx-data-table" bordered={false}>
                <div className="gx-ops-note" style={{ marginBottom: 18 }}>
                    <Text className="gx-ops-note__label">治理规则</Text>
                    <Text className="gx-ops-note__text">
                        超级管理员拥有账号治理能力，但不能在这里直接帮别人开启 2FA。2FA 的真正绑定需要管理员本人在“设置”页完成；当前账号也不会显示删除按钮，避免误删自身。
                    </Text>
                </div>

                <Table
                    className="gx-dashboard-table"
                    columns={columns}
                    dataSource={data}
                    rowKey="id"
                    loading={loading}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: '暂无管理员数据' }}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        showTotal: (count) => `共 ${count} 条`,
                        onChange: (nextPage, nextPageSize) => {
                            setPage(nextPage);
                            setPageSize(nextPageSize);
                        },
                    }}
                />
            </Card>

            <Modal
                className="gx-console-modal"
                title={editingId ? '编辑管理员' : '添加管理员'}
                open={modalVisible}
                onOk={() => void handleSubmit()}
                onCancel={() => setModalVisible(false)}
                destroyOnClose
                okText={editingId ? '保存更新' : '创建管理员'}
                cancelText="取消"
                width={720}
            >
                <div className="gx-modal-stack">
                    <div className="gx-modal-section">
                        <Text className="gx-modal-section__label">Account Boundary</Text>
                        <Text className="gx-modal-section__text">
                            先明确角色和状态，再决定是否允许该账号继续登录控制台。若需要 2FA，请让管理员本人在设置页完成绑定。
                        </Text>
                    </div>

                    <Form form={form} layout="vertical">
                        <Row gutter={[16, 0]}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="username"
                                    label="用户名"
                                    rules={[
                                        { required: true, message: '请输入用户名' },
                                        { min: 3, message: '用户名至少 3 个字符' },
                                    ]}
                                >
                                    <Input placeholder="请输入用户名" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="password"
                                    label="密码"
                                    rules={
                                        editingId
                                            ? []
                                            : [
                                                { required: true, message: '请输入密码' },
                                                { min: 6, message: '密码至少 6 个字符' },
                                            ]
                                    }
                                >
                                    <Input.Password placeholder={editingId ? '留空则不修改密码' : '请输入密码'} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="email" label="邮箱">
                                    <Input placeholder="可选，用于联系或安全通知" type="email" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="role" label="角色">
                                    <Select options={roleOptions} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="status" label="状态">
                                    <Select options={statusOptions} />
                                </Form.Item>
                            </Col>
                            {editingId && (
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="twoFactorEnabled"
                                        label="二次验证（2FA）"
                                        extra={!editingTwoFactorEnabled ? '启用 2FA 需管理员本人在“设置”页完成绑定。' : undefined}
                                    >
                                        <Select>
                                            <Select.Option value={true} disabled={!editingTwoFactorEnabled}>
                                                已启用
                                            </Select.Option>
                                            <Select.Option value={false}>未启用</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            )}
                        </Row>
                    </Form>

                    <div className={`gx-ops-note${editingId ? '' : ' gx-ops-note--warning'}`}>
                        <Text className="gx-ops-note__label">
                            {editingId ? 'Edit Note' : 'Create Note'}
                        </Text>
                        <Text className="gx-ops-note__text">
                            {editingId
                                ? '如果密码留空，将只更新账号资料和状态，不会覆盖现有密码。'
                                : '新建后请尽快把初始密码交付给目标管理员，并建议对方首次登录后立即修改密码。'}
                        </Text>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminsPage;
