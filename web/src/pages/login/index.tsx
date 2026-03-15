import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Modal, Space } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { authApi } from '../../api';
import { ThemeModeToggle } from '../../components';
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
            <div className="gx-login__controls">
                <ThemeModeToggle />
            </div>
            <div className="gx-login__shell">
                <section className="gx-login__panel">
                    <div className="gx-login__brand">
                        <div className="gx-login__brand-mark">GX</div>
                        <div>
                            <Text className="gx-login__brand-title">GongXi Mail</Text>
                            <Text className="gx-login__brand-subtitle">后台控制台</Text>
                        </div>
                    </div>

                    <div className="gx-login__intro">
                        <Title level={1} className="gx-login__title">
                            管理邮箱池、API Key 和审计记录
                        </Title>
                        <Text className="gx-login__subtitle">
                            登录后直接进入后台，不再堆额外说明。
                        </Text>
                    </div>

                    <div className="gx-login__summary-list">
                        <div className="gx-login__summary-item">
                            <Text className="gx-login__summary-label">邮箱资源</Text>
                            <Text className="gx-login__summary-text">维护邮箱、分组和拉信流程。</Text>
                        </div>
                        <div className="gx-login__summary-item">
                            <Text className="gx-login__summary-label">权限边界</Text>
                            <Text className="gx-login__summary-text">控制 Key 可用范围、速率和有效期。</Text>
                        </div>
                        <div className="gx-login__summary-item">
                            <Text className="gx-login__summary-label">安全审计</Text>
                            <Text className="gx-login__summary-text">支持 2FA 和调用日志回溯。</Text>
                        </div>
                    </div>
                </section>

                <Card className="gx-login__card">
                    <div className="gx-login__card-header">
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
                            <Text className="gx-login__hint-title">登录说明</Text>
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
