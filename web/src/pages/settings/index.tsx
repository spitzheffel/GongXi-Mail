import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    QRCode,
    Row,
    Space,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    ApiOutlined,
    KeyOutlined,
    LockOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    ScanOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api';
import { PageHeader, StatCard } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { getAdminRoleLabel } from '../../utils/auth';
import { requestData } from '../../utils/request';

const { Paragraph, Text, Title } = Typography;

interface TwoFactorStatus {
    enabled: boolean;
    pending: boolean;
    legacyEnv: boolean;
}

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [twoFactorLoading, setTwoFactorLoading] = useState(false);
    const [twoFactorStatusLoading, setTwoFactorStatusLoading] = useState(true);
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus>({
        enabled: false,
        pending: false,
        legacyEnv: false,
    });
    const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
    const [enableOtp, setEnableOtp] = useState('');
    const [form] = Form.useForm();
    const [disable2FaForm] = Form.useForm();
    const { admin, token, setAuth } = useAuthStore();

    const syncStoreTwoFactor = useCallback((enabled: boolean) => {
        if (!token || !admin) {
            return;
        }

        setAuth(token, { ...admin, twoFactorEnabled: enabled });
    }, [admin, setAuth, token]);

    const loadTwoFactorStatus = useCallback(async (silent: boolean = false) => {
        const result = await requestData<TwoFactorStatus>(
            () => authApi.getTwoFactorStatus(),
            '获取二次验证状态失败',
            { silent }
        );

        if (result) {
            setTwoFactorStatus(result);
            if (!result.pending) {
                setSetupData(null);
            }
            syncStoreTwoFactor(result.enabled);
        }

        setTwoFactorStatusLoading(false);
    }, [syncStoreTwoFactor]);

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const result = await requestData<TwoFactorStatus>(
                () => authApi.getTwoFactorStatus(),
                '获取二次验证状态失败',
                { silent: true }
            );

            if (cancelled) {
                return;
            }

            if (result) {
                setTwoFactorStatus(result);
                if (!result.pending) {
                    setSetupData(null);
                }
                syncStoreTwoFactor(result.enabled);
            }

            setTwoFactorStatusLoading(false);
        };

        void init();

        return () => {
            cancelled = true;
        };
    }, [syncStoreTwoFactor]);

    const handleChangePassword = async (values: {
        oldPassword: string;
        newPassword: string;
        confirmPassword: string;
    }) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('两次输入的密码不一致');
            return;
        }

        setPasswordLoading(true);
        const result = await requestData<{ message?: string }>(
            () => authApi.changePassword(values.oldPassword, values.newPassword),
            '密码修改失败'
        );

        if (result) {
            message.success('密码修改成功');
            form.resetFields();
        }

        setPasswordLoading(false);
    };

    const handleSetup2Fa = async () => {
        setTwoFactorLoading(true);
        const result = await requestData<{ secret: string; otpauthUrl: string }>(
            () => authApi.setupTwoFactor(),
            '生成二次验证密钥失败'
        );

        if (result) {
            setSetupData(result);
            setTwoFactorStatus((prev) => ({
                ...prev,
                pending: true,
                enabled: false,
                legacyEnv: false,
            }));
            message.info('请在验证器中添加密钥后输入 6 位验证码完成启用');
        }

        setTwoFactorLoading(false);
    };

    const handleEnable2Fa = async () => {
        const otp = enableOtp.trim();
        if (!/^\d{6}$/.test(otp)) {
            message.error('请输入 6 位验证码');
            return;
        }

        setTwoFactorLoading(true);
        const result = await requestData<{ enabled: boolean }>(
            () => authApi.enableTwoFactor(otp),
            '启用二次验证失败'
        );

        if (result) {
            message.success('二次验证已启用');
            setEnableOtp('');
            setSetupData(null);
            await loadTwoFactorStatus();
        }

        setTwoFactorLoading(false);
    };

    const handleDisable2Fa = async (values: { password: string; otp: string }) => {
        setTwoFactorLoading(true);
        const result = await requestData<{ enabled: boolean }>(
            () => authApi.disableTwoFactor(values.password, values.otp),
            '禁用二次验证失败'
        );

        if (result) {
            message.success('二次验证已禁用');
            disable2FaForm.resetFields();
            await loadTwoFactorStatus();
        }

        setTwoFactorLoading(false);
    };

    const securityProfile = useMemo(() => {
        if (twoFactorStatus.legacyEnv) {
            return {
                badgeColor: 'gold',
                badgeText: '环境托管',
                description: twoFactorStatus.enabled
                    ? '动态口令由部署层托管，当前页面只能查看状态，不能直接改绑。'
                    : '当前账号依赖环境变量里的 2FA 配置，请先在部署层确认密钥。',
                mode: 'Env-bound',
                nextStep: '如需改绑，请先调整部署环境中的 ADMIN_2FA_SECRET。',
                posture: 'Managed',
                statValue: 'ENV',
                toneClass: 'is-warning',
            };
        }

        if (twoFactorStatus.enabled) {
            return {
                badgeColor: 'success',
                badgeText: '2FA 已启用',
                description: '当前登录需要密码和 6 位动态口令，属于完整的双因子校验。',
                mode: 'App-bound',
                nextStep: '建议定期校验恢复路径，并在更换设备前先完成解绑流程。',
                posture: 'Protected',
                statValue: '2FA',
                toneClass: 'is-success',
            };
        }

        if (twoFactorStatus.pending) {
            return {
                badgeColor: 'processing',
                badgeText: '待验证',
                description: '绑定密钥已经生成，但必须通过一次验证码校验后才会真正生效。',
                mode: 'Binding',
                nextStep: '使用验证器扫码或手动录入密钥，然后输入当前 6 位验证码完成启用。',
                posture: 'Pending',
                statValue: 'PEND',
                toneClass: 'is-processing',
            };
        }

        return {
            badgeColor: undefined,
            badgeText: '仅密码',
            description: '当前仍是单因子登录，建议先补上 2FA 再进行密码轮换。',
            mode: 'Password',
            nextStep: '生成绑定密钥并完成一次 TOTP 验证，把登录升级成双因子模式。',
            posture: 'Basic',
            statValue: 'BASIC',
            toneClass: 'is-neutral',
        };
    }, [twoFactorStatus]);

    const currentOrigin = useMemo(
        () => (typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'),
        []
    );

    const identityItems = useMemo(() => ([
        {
            label: '用户名',
            value: admin?.username || '--',
            meta: '当前控制台会话绑定的管理员账号。',
        },
        {
            label: '角色边界',
            value: getAdminRoleLabel(admin?.role),
            meta: admin?.role === 'SUPER_ADMIN'
                ? '拥有全局配置、账号治理和权限管理能力。'
                : '受普通管理员权限范围限制。',
        },
        {
            label: '登录模式',
            value: securityProfile.mode,
            meta: securityProfile.description,
        },
        {
            label: 'API 入口',
            value: 'Header / Query',
            meta: '生产环境优先 Header，Query 更适合临时调试。',
        },
    ]), [admin?.role, admin?.username, securityProfile.description, securityProfile.mode]);

    const isTwoFactorBusy = twoFactorLoading || twoFactorStatusLoading;
    const setupButtonLabel = setupData || twoFactorStatus.pending ? '重新生成绑定密钥' : '生成绑定密钥';

    return (
        <div className="gx-ops-shell">
            <PageHeader
                eyebrow="Security Center"
                title="设置与安全中心"
                subtitle="集中维护当前管理员身份、密码轮换和二次验证状态，同时保留一份轻量的 API 接入速查。"
                extra={(
                    <Button
                        icon={<ReloadOutlined />}
                        loading={isTwoFactorBusy}
                        onClick={() => void loadTwoFactorStatus()}
                    >
                        刷新状态
                    </Button>
                )}
            />

            <Card className="gx-hero-card gx-panel-card" bordered={false}>
                <Row gutter={[24, 24]} align="middle">
                    <Col xs={24} xl={14}>
                        <Text className="gx-hero-card__eyebrow">Operator Security</Text>
                        <Title level={2} className="gx-hero-card__title">
                            把身份、密码和 2FA 放进同一个安全控制台里统一管理。
                        </Title>
                        <Paragraph className="gx-hero-card__subtitle">
                            这页现在更像一个账号安全中枢。你可以快速判断当前会话的保护层级、登录控制来源，以及 API 接入仍然暴露了哪些基础风险面。
                        </Paragraph>
                        <Space wrap className="gx-hero-card__actions">
                            {!twoFactorStatus.legacyEnv && !twoFactorStatus.enabled && (
                                <Button
                                    type="primary"
                                    icon={<SafetyCertificateOutlined />}
                                    onClick={() => void handleSetup2Fa()}
                                    loading={twoFactorLoading}
                                >
                                    {setupButtonLabel}
                                </Button>
                            )}
                            <Button icon={<ApiOutlined />} onClick={() => navigate('/api-docs')}>
                                查看 API 文档
                            </Button>
                        </Space>
                    </Col>
                    <Col xs={24} xl={10}>
                        <div className="gx-hero-card__metrics">
                            <div className="gx-hero-signal">
                                <Text className="gx-hero-signal__label">Current Security Posture</Text>
                                <Text className="gx-hero-signal__value">{securityProfile.posture}</Text>
                                <Text className="gx-hero-signal__description">
                                    {securityProfile.description}
                                </Text>
                            </div>
                            <div className="gx-hero-signal__grid">
                                <div className="gx-hero-mini">
                                    <Text className="gx-hero-mini__label">Auth Mode</Text>
                                    <Text className="gx-hero-mini__value">{securityProfile.mode}</Text>
                                </div>
                                <div className="gx-hero-mini">
                                    <Text className="gx-hero-mini__label">API Access</Text>
                                    <Text className="gx-hero-mini__value">2 Paths</Text>
                                </div>
                            </div>
                        </div>
                    </Col>
                </Row>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} xl={6}>
                    <StatCard
                        title="Role Level"
                        value={admin?.role === 'SUPER_ADMIN' ? 'Super' : 'Admin'}
                        icon={<UserOutlined />}
                        iconBgColor="#0369A1"
                        trendLabel="当前权限级别"
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <StatCard
                        title="Auth Guard"
                        value={securityProfile.statValue}
                        icon={<SafetyCertificateOutlined />}
                        iconBgColor="#0EA5E9"
                        trendLabel="登录防护状态"
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <StatCard
                        title="Password Policy"
                        value="6+"
                        suffix="chars"
                        icon={<LockOutlined />}
                        iconBgColor="#22C55E"
                        trendLabel="最小密码长度"
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <StatCard
                        title="API Paths"
                        value="2"
                        suffix="routes"
                        icon={<KeyOutlined />}
                        iconBgColor="#0F766E"
                        trendLabel="Header / Query"
                    />
                </Col>
            </Row>

            <div className="gx-settings-grid">
                <Card
                    className="gx-panel-card"
                    title="身份与控制面"
                    bordered={false}
                    extra={<Tag color="blue">Session Snapshot</Tag>}
                >
                    <div className="gx-settings-stack">
                        <div className="gx-settings-summary-grid">
                            {identityItems.map((item) => (
                                <div key={item.label} className="gx-settings-summary">
                                    <Text className="gx-settings-summary__label">{item.label}</Text>
                                    <Text className="gx-settings-summary__value">{item.value}</Text>
                                    <Text className="gx-settings-summary__meta">{item.meta}</Text>
                                </div>
                            ))}
                        </div>

                        <div className="gx-ops-note">
                            <Text className="gx-ops-note__label">Guardrails</Text>
                            <Text className="gx-ops-note__text">
                                当前页只处理你自己的密码和 2FA 绑定，不会直接修改其他管理员账号的安全状态。多人账号治理仍然在管理员管理页统一处理。
                            </Text>
                            <div className="gx-ops-note__grid">
                                <div className="gx-ops-note__metric">
                                    <Text className="gx-ops-note__metric-label">登录因子</Text>
                                    <Text className="gx-ops-note__metric-value">
                                        {twoFactorStatus.enabled ? 'Password + OTP' : 'Password'}
                                    </Text>
                                </div>
                                <div className="gx-ops-note__metric">
                                    <Text className="gx-ops-note__metric-label">控制来源</Text>
                                    <Text className="gx-ops-note__metric-value">{securityProfile.mode}</Text>
                                </div>
                                <div className="gx-ops-note__metric">
                                    <Text className="gx-ops-note__metric-label">下一步</Text>
                                    <Text className="gx-ops-note__metric-value">
                                        {twoFactorStatus.enabled ? '校验恢复' : '补齐 2FA'}
                                    </Text>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card
                    className="gx-panel-card"
                    title="密码策略与轮换"
                    bordered={false}
                    extra={<Tag color="green">Self Service</Tag>}
                >
                    <div className="gx-settings-stack">
                        <div className="gx-ops-note">
                            <Text className="gx-ops-note__label">Password Policy</Text>
                            <Text className="gx-ops-note__text">
                                当前支持管理员自助轮换密码。新密码至少 6 位，建议直接使用更长的随机字符串，并和 2FA 一起开启，避免单因子长期暴露。
                            </Text>
                        </div>

                        <div className="gx-settings-form-shell">
                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={handleChangePassword}
                                className="gx-settings-form"
                            >
                                <Form.Item
                                    name="oldPassword"
                                    label="当前密码"
                                    rules={[{ required: true, message: '请输入当前密码' }]}
                                >
                                    <Input.Password
                                        prefix={<LockOutlined />}
                                        placeholder="当前密码"
                                        autoComplete="current-password"
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="newPassword"
                                    label="新密码"
                                    rules={[
                                        { required: true, message: '请输入新密码' },
                                        { min: 6, message: '密码至少 6 个字符' },
                                    ]}
                                >
                                    <Input.Password
                                        prefix={<LockOutlined />}
                                        placeholder="新密码"
                                        autoComplete="new-password"
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="confirmPassword"
                                    label="确认新密码"
                                    rules={[
                                        { required: true, message: '请确认新密码' },
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                if (!value || getFieldValue('newPassword') === value) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('两次输入的密码不一致'));
                                            },
                                        }),
                                    ]}
                                >
                                    <Input.Password
                                        prefix={<LockOutlined />}
                                        placeholder="确认新密码"
                                        autoComplete="new-password"
                                    />
                                </Form.Item>

                                <Form.Item>
                                    <Button type="primary" htmlType="submit" loading={passwordLoading}>
                                        修改密码
                                    </Button>
                                </Form.Item>
                            </Form>
                        </div>
                    </div>
                </Card>
            </div>

            <Card
                className="gx-panel-card"
                title="二次验证指挥台"
                bordered={false}
                extra={(
                    <Space wrap>
                        <Tag color={securityProfile.badgeColor}>{securityProfile.badgeText}</Tag>
                        {twoFactorStatus.pending && !twoFactorStatus.legacyEnv && <Tag color="processing">待完成</Tag>}
                    </Space>
                )}
            >
                {twoFactorStatusLoading ? (
                    <Text type="secondary">安全状态同步中...</Text>
                ) : (
                    <div className="gx-settings-stack">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} xl={9}>
                                <div className="gx-settings-stack">
                                    <div className="gx-settings-status-strip">
                                        <div className={`gx-settings-status-card ${securityProfile.toneClass}`}>
                                            <Text className="gx-settings-status-card__label">Security Posture</Text>
                                            <Text className="gx-settings-status-card__value">{securityProfile.posture}</Text>
                                            <Text className="gx-settings-status-card__text">
                                                {securityProfile.description}
                                            </Text>
                                        </div>
                                        <div className="gx-settings-status-card">
                                            <Text className="gx-settings-status-card__label">Control Source</Text>
                                            <Text className="gx-settings-status-card__value">{securityProfile.mode}</Text>
                                            <Text className="gx-settings-status-card__text">
                                                {securityProfile.nextStep}
                                            </Text>
                                        </div>
                                    </div>

                                    {twoFactorStatus.legacyEnv ? (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="当前账号使用环境变量 2FA（ADMIN_2FA_SECRET），暂不支持在界面中直接管理。"
                                        />
                                    ) : null}

                                    <Space wrap className="gx-settings-inline-actions">
                                        {!twoFactorStatus.enabled && !twoFactorStatus.legacyEnv && (
                                            <Button
                                                type="primary"
                                                icon={<SafetyCertificateOutlined />}
                                                onClick={() => void handleSetup2Fa()}
                                                loading={twoFactorLoading}
                                            >
                                                {setupButtonLabel}
                                            </Button>
                                        )}
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={() => void loadTwoFactorStatus()}
                                            loading={isTwoFactorBusy}
                                        >
                                            刷新状态
                                        </Button>
                                    </Space>

                                    <div className="gx-ops-note">
                                        <Text className="gx-ops-note__label">Rollout Guide</Text>
                                        <Text className="gx-ops-note__text">
                                            {securityProfile.nextStep}
                                        </Text>
                                        <div className="gx-inline-tag-list">
                                            <Text className="gx-code-pill">TOTP</Text>
                                            <Text className="gx-code-pill">6 digits</Text>
                                            <Text className="gx-code-pill">Authenticator app</Text>
                                        </div>
                                    </div>
                                </div>
                            </Col>

                            <Col xs={24} xl={15}>
                                {setupData ? (
                                    <div className="gx-settings-2fa-grid">
                                        <div className="gx-settings-qr-wrap">
                                            <div className="gx-settings-qr-box">
                                                <Text className="gx-settings-summary__label">扫码绑定</Text>
                                                <QRCode value={setupData.otpauthUrl} size={184} />
                                                <Text className="gx-settings-summary__meta">
                                                    推荐直接使用验证器扫码，减少手动录入错误。
                                                </Text>
                                            </div>
                                        </div>

                                        <div className="gx-docs-block">
                                            <div className="gx-settings-code-stack">
                                                <div>
                                                    <Text className="gx-settings-summary__label">手动密钥</Text>
                                                    <Text copyable className="gx-settings-secret">
                                                        {setupData.secret}
                                                    </Text>
                                                </div>
                                                <div>
                                                    <Text className="gx-settings-summary__label">otpauth 链接</Text>
                                                    <Text copyable className="gx-settings-secret">
                                                        {setupData.otpauthUrl}
                                                    </Text>
                                                </div>
                                                <div>
                                                    <Text className="gx-settings-summary__label">完成验证</Text>
                                                    <Input
                                                        value={enableOtp}
                                                        maxLength={6}
                                                        inputMode="numeric"
                                                        autoComplete="one-time-code"
                                                        prefix={<ScanOutlined />}
                                                        placeholder="输入验证器中的 6 位验证码"
                                                        onChange={(e) => setEnableOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    />
                                                </div>
                                                <Button
                                                    type="primary"
                                                    block
                                                    onClick={() => void handleEnable2Fa()}
                                                    loading={twoFactorLoading}
                                                >
                                                    启用二次验证
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : twoFactorStatus.enabled && !twoFactorStatus.legacyEnv ? (
                                    <div className="gx-settings-2fa-grid">
                                        <div className="gx-settings-placeholder">
                                            <Text className="gx-settings-placeholder__title">
                                                2FA 已处于防护状态
                                            </Text>
                                            <Text className="gx-settings-placeholder__text">
                                                当前账号登录时需要额外的 6 位动态口令。如果要更换设备，先用右侧表单完成身份校验后禁用，再重新发起绑定。
                                            </Text>
                                            <div className="gx-inline-tag-list">
                                                <Text className="gx-code-pill">Password + OTP</Text>
                                                <Text className="gx-code-pill">Device migration via reset</Text>
                                            </div>
                                        </div>

                                        <div className="gx-docs-block">
                                            <Text className="gx-docs-block__label">禁用二次验证</Text>
                                            <Paragraph className="gx-settings-summary__meta">
                                                为了避免误操作，禁用前需要再次输入当前密码和验证码。
                                            </Paragraph>
                                            <Form
                                                form={disable2FaForm}
                                                layout="vertical"
                                                onFinish={handleDisable2Fa}
                                                className="gx-settings-form"
                                            >
                                                <Form.Item
                                                    name="password"
                                                    label="当前密码"
                                                    rules={[{ required: true, message: '请输入当前密码' }]}
                                                >
                                                    <Input.Password
                                                        prefix={<LockOutlined />}
                                                        placeholder="当前密码"
                                                        autoComplete="current-password"
                                                    />
                                                </Form.Item>

                                                <Form.Item
                                                    name="otp"
                                                    label="验证码"
                                                    rules={[
                                                        { required: true, message: '请输入验证码' },
                                                        { pattern: /^\d{6}$/, message: '请输入 6 位验证码' },
                                                    ]}
                                                >
                                                    <Input
                                                        maxLength={6}
                                                        inputMode="numeric"
                                                        autoComplete="one-time-code"
                                                        prefix={<SafetyCertificateOutlined />}
                                                        placeholder="6 位验证码"
                                                    />
                                                </Form.Item>

                                                <Form.Item>
                                                    <Button danger htmlType="submit" loading={twoFactorLoading}>
                                                        禁用二次验证
                                                    </Button>
                                                </Form.Item>
                                            </Form>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="gx-settings-placeholder">
                                        <Text className="gx-settings-placeholder__title">
                                            {twoFactorStatus.legacyEnv ? '环境变量托管中' : '尚未创建绑定信息'}
                                        </Text>
                                        <Text className="gx-settings-placeholder__text">
                                            {twoFactorStatus.legacyEnv
                                                ? '当前账号的 2FA 配置不在页面内管理。如果需要调整，请先回到部署环境修改密钥，再刷新这里确认结果。'
                                                : '点击左侧按钮生成绑定密钥，使用验证器扫码或手动录入后，再输入当前验证码完成启用。'}
                                        </Text>
                                        <div className="gx-inline-tag-list">
                                            <Text className="gx-code-pill">Authenticator required</Text>
                                            <Text className="gx-code-pill">6-digit OTP</Text>
                                        </div>
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </div>
                )}
            </Card>

            <Card
                className="gx-panel-card"
                title="API 使用速查"
                bordered={false}
                extra={(
                    <Button type="link" onClick={() => navigate('/api-docs')}>
                        打开完整文档
                    </Button>
                )}
            >
                <div className="gx-settings-stack">
                    <Paragraph className="gx-settings-summary__meta">
                        这里保留最常用的两种接入方式。Header 更适合正式环境，Query 参数建议只在临时调试或本地排查时使用。
                    </Paragraph>

                    <div className="gx-settings-api-grid">
                        <div className="gx-docs-block">
                            <div className="gx-docs-block__header">
                                <Text className="gx-docs-block__label">Header 传递 API Key</Text>
                                <Tag color="success">推荐</Tag>
                            </div>
                            <Text className="gx-docs-codeblock">
                                {`curl -H "X-API-Key: your_api_key" ${currentOrigin}/api/mail_all`}
                            </Text>
                            <div className="gx-docs-highlight-list">
                                <Text className="gx-code-pill">X-API-Key</Text>
                                <Text className="gx-code-pill">/api/mail_all</Text>
                                <Text className="gx-code-pill">服务端接入</Text>
                            </div>
                        </div>

                        <div className="gx-docs-block">
                            <div className="gx-docs-block__header">
                                <Text className="gx-docs-block__label">Query 参数传递 API Key</Text>
                                <Tag color="gold">调试用</Tag>
                            </div>
                            <Text className="gx-docs-codeblock">
                                {`curl "${currentOrigin}/api/mail_all?api_key=your_api_key&email=xxx@outlook.com"`}
                            </Text>
                            <div className="gx-docs-highlight-list">
                                <Text className="gx-code-pill">api_key=</Text>
                                <Text className="gx-code-pill">email=</Text>
                                <Text className="gx-code-pill">临时排查</Text>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default SettingsPage;
