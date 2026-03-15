import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Layout,
    Menu,
    Avatar,
    Dropdown,
    Typography,
    Button,
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
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api';
import { isSuperAdmin } from '../utils/auth';
import { ThemeModeToggle } from '../components';
import { useThemeMode } from '../theme';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const menuConfig = [
    { key: '/dashboard', icon: <DashboardOutlined />, title: '数据概览' },
    { key: '/emails', icon: <MailOutlined />, title: '邮箱管理' },
    { key: '/api-keys', icon: <KeyOutlined />, title: 'API Key 管理' },
    { key: '/api-docs', icon: <FileTextOutlined />, title: 'API 文档' },
    { key: '/operation-logs', icon: <HistoryOutlined />, title: '操作日志' },
    { key: '/admins', icon: <UserOutlined />, title: '管理员管理', superAdmin: true },
    { key: '/settings', icon: <SettingOutlined />, title: '系统设置' },
];

const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { admin, clearAuth } = useAuthStore();
    const { isDark } = useThemeMode();
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
    const sidebarOffset = isMobile ? 0 : (collapsed ? 108 : 268);

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
        label: <span className="gx-shell__menu-label">{item.title}</span>,
    }));

    const navigationContent = (
        <div className="gx-shell__nav">
            <div className={`gx-shell__brand ${collapsed && !isMobile ? 'is-collapsed' : ''}`}>
                <div className="gx-shell__brand-mark">GX</div>
                {(!collapsed || isMobile) && (
                    <div className="gx-shell__brand-copy">
                        <Title level={5} className="gx-shell__brand-title">GongXi Mail</Title>
                    </div>
                )}
            </div>

            <Menu
                className="gx-shell__menu"
                theme={isDark ? 'dark' : 'light'}
                mode="inline"
                selectedKeys={selectedKeys}
                items={menuItems}
                onClick={handleMenuClick}
            />
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
                    width={236}
                    collapsedWidth={76}
                    theme={isDark ? 'dark' : 'light'}
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
                    </div>

                    <div className="gx-shell__header-right">
                        <ThemeModeToggle compact={isMobile} />
                        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                            <button type="button" className="gx-shell__profile">
                                <Avatar size={40} style={{ backgroundColor: 'var(--gx-primary-strong)' }}>
                                    {avatarText}
                                </Avatar>
                                <div className="gx-shell__profile-copy">
                                    <Text className="gx-shell__profile-name">{displayName}</Text>
                                    <Text className="gx-shell__profile-role">
                                        {hasSuperAdminPermission ? '超级管理员' : '管理员'}
                                    </Text>
                                </div>
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
