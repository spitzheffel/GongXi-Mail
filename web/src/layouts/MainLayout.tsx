import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Layout,
    Menu,
    Avatar,
    Dropdown,
    Typography,
    Breadcrumb,
    Button,
    Tag,
    Drawer,
    Grid,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    KeyOutlined,
    MailOutlined,
    SettingOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FileTextOutlined,
    HistoryOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api';
import { isSuperAdmin } from '../utils/auth';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const menuConfig = [
    { key: '/dashboard', icon: <DashboardOutlined />, title: '数据概览', description: '总览邮箱池、调用活跃度和系统健康度' },
    { key: '/emails', icon: <MailOutlined />, title: '邮箱管理', description: '维护邮箱池、分组策略和收信操作' },
    { key: '/api-keys', icon: <KeyOutlined />, title: 'API Key 管理', description: '控制权限边界、速率限制和池分配' },
    { key: '/api-docs', icon: <FileTextOutlined />, title: 'API 文档', description: '查看接口用法、调用示例和参数说明' },
    { key: '/operation-logs', icon: <HistoryOutlined />, title: '操作日志', description: '审计分配、拉信和清理行为的执行轨迹' },
    { key: '/admins', icon: <UserOutlined />, title: '管理员管理', description: '管理后台账号与角色边界', superAdmin: true },
    { key: '/settings', icon: <SettingOutlined />, title: '系统设置', description: '维护个人安全设置和二次验证' },
];

const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { admin, clearAuth } = useAuthStore();
    const screens = useBreakpoint();

    const hasSuperAdminPermission = isSuperAdmin(admin?.role);
    const isMobile = !screens.lg;
    const displayName = admin?.username?.trim() || 'Admin';
    const avatarText = displayName.charAt(0).toUpperCase();

    const availableMenu = useMemo(
        () => menuConfig.filter((item) => !item.superAdmin || hasSuperAdminPermission),
        [hasSuperAdminPermission]
    );

    const currentMenu = availableMenu.find((item) =>
        location.pathname === item.key || location.pathname.startsWith(`${item.key}/`)
    );

    const selectedKeys = currentMenu ? [currentMenu.key] : [];
    const sidebarOffset = isMobile ? 0 : (collapsed ? 128 : 312);

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch {
            // ignore
        }
        clearAuth();
        navigate('/login');
    };

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        navigate(String(key));
        if (isMobile) {
            setMobileNavOpen(false);
        }
    };

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: '个人设置',
            onClick: () => navigate('/settings'),
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            danger: true,
            onClick: handleLogout,
        },
    ];

    const menuItems: MenuProps['items'] = availableMenu.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: (
            <div className="gx-shell__menu-copy">
                <span className="gx-shell__menu-label">{item.title}</span>
                {(!collapsed || isMobile) && (
                    <span className="gx-shell__menu-hint">{item.description}</span>
                )}
            </div>
        ),
    }));

    const navigationContent = (
        <div className="gx-shell__nav">
            <div className={`gx-shell__brand ${collapsed && !isMobile ? 'is-collapsed' : ''}`}>
                <div className="gx-shell__brand-mark">GX</div>
                {(!collapsed || isMobile) && (
                    <div className="gx-shell__brand-copy">
                        <Title level={5} className="gx-shell__brand-title">GongXi Mail</Title>
                        <Text className="gx-shell__brand-subtitle">Secure mail operations console</Text>
                    </div>
                )}
            </div>

            {(!collapsed || isMobile) && (
                <div className="gx-shell__status-card">
                    <Text className="gx-shell__status-label">Command Layer</Text>
                    <Text className="gx-shell__status-value">
                        聚合邮箱池、API 调度和审计日志，适合高频运营和故障排查。
                    </Text>
                    <div className="gx-shell__status-meta">
                        <Tag color="cyan">2FA Ready</Tag>
                        <Tag color="green">Traceable</Tag>
                    </div>
                </div>
            )}

            <Menu
                className="gx-shell__menu"
                theme="dark"
                mode="inline"
                selectedKeys={selectedKeys}
                items={menuItems}
                onClick={handleMenuClick}
            />

            {(!collapsed || isMobile) && (
                <div className="gx-shell__footer-note">
                    <Text className="gx-shell__footer-note-label">Ops Signal</Text>
                    <Text className="gx-shell__footer-note-text">
                        当前会话已进入受保护后台，建议保持二次验证开启。
                    </Text>
                </div>
            )}
        </div>
    );

    return (
        <Layout className="gx-shell">
            {!isMobile && (
                <Sider
                    className="gx-shell__sider"
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    width={280}
                    collapsedWidth={96}
                    theme="dark"
                >
                    {navigationContent}
                </Sider>
            )}

            <Drawer
                placement="left"
                open={isMobile && mobileNavOpen}
                onClose={() => setMobileNavOpen(false)}
                closable={false}
                width={300}
                rootClassName="gx-shell__drawer"
            >
                {navigationContent}
            </Drawer>

            <Layout className="gx-shell__main" style={{ marginLeft: sidebarOffset }}>
                <Header className="gx-shell__header">
                    <div className="gx-shell__header-left">
                        <Button
                            type="text"
                            className="gx-shell__toggle"
                            icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
                            onClick={() => {
                                if (isMobile) {
                                    setMobileNavOpen(true);
                                    return;
                                }
                                setCollapsed((prev) => !prev);
                            }}
                            aria-label="切换导航"
                        />
                        <div className="gx-shell__header-copy">
                            <Breadcrumb
                                className="gx-shell__header-breadcrumb"
                                items={[
                                    { title: '控制台' },
                                    { title: currentMenu?.title || '管理后台' },
                                ]}
                            />
                            <Text className="gx-shell__header-note">
                                {currentMenu?.description || '统一管理邮箱资源、API 权限和操作轨迹。'}
                            </Text>
                        </div>
                    </div>

                    <div className="gx-shell__header-right">
                        <div className="gx-shell__header-chip">
                            <Text className="gx-shell__header-chip-label">Session</Text>
                            <Text className="gx-shell__header-chip-value">{dayjs().format('YYYY/MM/DD')}</Text>
                        </div>
                        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                            <button type="button" className="gx-shell__profile">
                                <Avatar size={40} style={{ backgroundColor: '#0369A1' }}>
                                    {avatarText}
                                </Avatar>
                                <div className="gx-shell__profile-copy">
                                    <Text className="gx-shell__profile-name">{displayName}</Text>
                                    <Text className="gx-shell__profile-role">
                                        {hasSuperAdminPermission ? 'SUPER ADMIN' : 'ADMIN OPERATOR'}
                                    </Text>
                                </div>
                                <SafetyCertificateOutlined style={{ color: '#0369A1' }} />
                            </button>
                        </Dropdown>
                    </div>
                </Header>

                <Content className="gx-shell__content">
                    <div className="gx-shell__content-inner">
                        <Outlet />
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
};

export default MainLayout;
