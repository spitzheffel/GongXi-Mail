import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Modal, Space } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { authApi } from '../../api';
import { useAuthStore } from '../../stores/authStore';
import { getErrorMessage } from '../../utils/error';

const { Title, Text } = Typography;

interface LoginForm {
    username: string;
    password: string;
}

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { setAuth } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [otpModalVisible, setOtpModalVisible] = useState(false);
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password: string } | null>(null);

    const finishLogin = (result: { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } }) => {
        setAuth(result.token, result.admin);
        message.success('登录成功');
        navigate('/');
    };

    const handleSubmit = async (values: LoginForm) => {
        setLoading(true);
        try {
            const response = await authApi.login(values.username, values.password);
            if (response.code === 200) {
                finishLogin(response.data as { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } });
            }
        } catch (err: unknown) {
            const errCode = String((err as { code?: unknown })?.code || '').toUpperCase();
            if (errCode === 'INVALID_OTP') {
                setPendingCredentials({ username: values.username, password: values.password });
                setOtpCode('');
                setOtpModalVisible(true);
                message.info('该账号已启用二次验证，请输入 6 位验证码');
            } else {
                message.error(getErrorMessage(err, '登录失败'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOtpConfirm = async () => {
        if (!pendingCredentials) {
            return;
        }
        const otp = otpCode.trim();
        if (!/^\d{6}$/.test(otp)) {
            message.error('请输入 6 位验证码');
            return;
        }

        setOtpLoading(true);
        try {
            const response = await authApi.login(pendingCredentials.username, pendingCredentials.password, otp);
            if (response.code === 200) {
                setOtpModalVisible(false);
                setPendingCredentials(null);
                setOtpCode('');
                finishLogin(response.data as { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } });
            }
        } catch (err: unknown) {
            const errCode = String((err as { code?: unknown })?.code || '').toUpperCase();
            if (errCode === 'INVALID_OTP') {
                message.error('验证码错误，请重试');
            } else {
                message.error(getErrorMessage(err, '验证失败'));
            }
        } finally {
            setOtpLoading(false);
        }
    };

    return (
        <div className="gx-login">
            <div className="gx-login__shell">
                <section className="gx-login__hero">
                    <div>
                        <div className="gx-login__brand">
                            <div className="gx-login__brand-mark">GX</div>
                            <div>
                                <Text className="gx-login__brand-title">GongXi Mail</Text>
                                <Text className="gx-login__brand-subtitle">Secure mail operations console</Text>
                            </div>
                        </div>

                        <div style={{ marginTop: 34 }}>
                            <Text className="gx-login__eyebrow">Operations Entry</Text>
                            <Title level={1} className="gx-login__title">
                                把邮箱调度、API 调用和审计行为收束到一套后台操作流里。
                            </Title>
                            <Text className="gx-login__subtitle">
                                适合高频拉信、验证码邮箱分配和权限受控的运营场景。这个入口现在更像一个运维控制台，而不是默认后台登录框。
                            </Text>
                        </div>

                        <div className="gx-login__feature-grid">
                            <div className="gx-login__feature">
                                <Text className="gx-login__feature-label">Security</Text>
                                <Text className="gx-login__feature-value">2FA</Text>
                                <Text className="gx-login__feature-desc">支持二次验证与后台账号保护。</Text>
                            </div>
                            <div className="gx-login__feature">
                                <Text className="gx-login__feature-label">Operations</Text>
                                <Text className="gx-login__feature-value">Pool</Text>
                                <Text className="gx-login__feature-desc">围绕邮箱池分配和回收设计工作流。</Text>
                            </div>
                            <div className="gx-login__feature">
                                <Text className="gx-login__feature-label">Audit</Text>
                                <Text className="gx-login__feature-value">Trace</Text>
                                <Text className="gx-login__feature-desc">调用路径和行为日志可追溯。</Text>
                            </div>
                        </div>
                    </div>

                    <div className="gx-login__notes">
                        <div className="gx-login__note">
                            <Text className="gx-login__note-title">适合谁在这里工作</Text>
                            <Text className="gx-login__note-text">
                                日常管理邮箱资源、API Key、分组策略和验证码收取的运营与管理员。
                            </Text>
                        </div>
                        <div className="gx-login__note">
                            <Text className="gx-login__note-title">这次界面优化的重点</Text>
                            <Text className="gx-login__note-text">
                                更清晰的信息层级、更强的后台识别度，以及更稳定的技术控制台气质。
                            </Text>
                        </div>
                    </div>
                </section>

                <Card className="gx-login__card">
                    <div className="gx-login__card-header">
                        <Text className="gx-login__card-kicker">Admin Access</Text>
                        <Title level={3} className="gx-login__card-title">
                            登录控制台
                        </Title>
                        <Text className="gx-login__card-subtitle">
                            请输入管理员凭据。若账号开启 2FA，验证器验证码会在下一步要求输入。
                        </Text>
                    </div>

                    <Form
                        name="login"
                        onFinish={handleSubmit}
                        size="large"
                        layout="vertical"
                    >
                        <Form.Item
                            label="用户名"
                            name="username"
                            rules={[{ required: true, message: '请输入用户名' }]}
                        >
                            <Input
                                prefix={<UserOutlined />}
                                placeholder="请输入后台用户名"
                            />
                        </Form.Item>

                        <Form.Item
                            label="密码"
                            name="password"
                            rules={[{ required: true, message: '请输入密码' }]}
                        >
                            <Input.Password
                                prefix={<LockOutlined />}
                                placeholder="请输入账号密码"
                            />
                        </Form.Item>

                        <div className="gx-login__hint">
                            <Text className="gx-login__hint-title">安全提示</Text>
                            <Text className="gx-login__hint-text">
                                若账号已启用 2FA，提交用户名和密码后会弹窗输入 6 位动态验证码。
                            </Text>
                        </div>

                        <Form.Item style={{ marginTop: 22, marginBottom: 0 }}>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                block
                                size="large"
                            >
                                进入控制台
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </div>

            <Modal
                title="二次验证"
                open={otpModalVisible}
                onOk={handleOtpConfirm}
                onCancel={() => {
                    setOtpModalVisible(false);
                    setPendingCredentials(null);
                    setOtpCode('');
                }}
                okText="验证并登录"
                cancelText="取消"
                confirmLoading={otpLoading}
                destroyOnClose
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">请输入验证器中的 6 位动态码</Text>
                    <Input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        prefix={<SafetyCertificateOutlined />}
                        maxLength={6}
                        placeholder="6 位验证码"
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default LoginPage;
