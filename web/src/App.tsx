import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAuthStore } from './stores/authStore';
import { isSuperAdmin } from './utils/auth';
import { ThemeModeProvider, useThemeMode } from './theme';

// Pages (lazy loaded)
const LoginPage = lazy(() => import('./pages/login'));
const MainLayout = lazy(() => import('./layouts/MainLayout'));
const DashboardPage = lazy(() => import('./pages/dashboard'));
const EmailsPage = lazy(() => import('./pages/emails'));
const ApiKeysPage = lazy(() => import('./pages/api-keys'));
const ApiDocsPage = lazy(() => import('./pages/api-docs'));
const OperationLogsPage = lazy(() => import('./pages/operation-logs'));
const AdminsPage = lazy(() => import('./pages/admins'));
const SettingsPage = lazy(() => import('./pages/settings'));

const PageFallback: React.FC = () => (
  <div className="gx-page-fallback">
    <Spin />
  </div>
);

// 路由守卫组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, token, admin } = useAuthStore();

  if (!isAuthenticated || !token || !admin?.username) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// 超级管理员路由守卫
const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, token, admin } = useAuthStore();

  if (!isAuthenticated || !token || !admin?.username) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin(admin?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppShell: React.FC = () => {
  const { isDark } = useThemeMode();

  const withSuspense = (element: React.ReactElement) => (
    <Suspense fallback={<PageFallback />}>
      {element}
    </Suspense>
  );

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        cssVar: { key: 'gx' },
        token: {
          colorPrimary: isDark ? '#7DD3FC' : '#0369A1',
          colorInfo: isDark ? '#38BDF8' : '#0EA5E9',
          colorSuccess: '#22C55E',
          colorWarning: '#F59E0B',
          colorError: '#EF4444',
          colorBgBase: isDark ? '#0B1220' : '#F3F6F8',
          colorBgContainer: isDark ? '#121A29' : '#FFFFFF',
          colorBgElevated: isDark ? '#0F1725' : '#FFFFFF',
          colorBorder: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.1)',
          colorSplit: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)',
          colorText: isDark ? '#F8FAFC' : '#0F172A',
          colorTextSecondary: isDark ? '#94A3B8' : '#64748B',
          borderRadius: 16,
          boxShadowSecondary: isDark
            ? '0 14px 32px rgba(2, 6, 23, 0.24)'
            : '0 12px 28px rgba(15, 23, 42, 0.08)',
          fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
          fontFamilyCode: '"IBM Plex Mono", "SFMono-Regular", monospace',
        },
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            siderBg: 'transparent',
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'transparent',
            darkItemBg: 'transparent',
            darkItemSelectedBg: 'transparent',
            subMenuItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
          },
          Card: {
            colorBgContainer: 'transparent',
          },
          Table: {
            headerBg: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(248, 250, 252, 0.96)',
          },
          Drawer: {
            colorBgElevated: 'transparent',
          },
          Modal: {
            contentBg: isDark ? 'rgba(8, 15, 26, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* 登录页 */}
            <Route path="/login" element={withSuspense(<LoginPage />)} />

            {/* 需要认证的页面 */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  {withSuspense(<MainLayout />)}
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={withSuspense(<DashboardPage />)} />
              <Route path="emails" element={withSuspense(<EmailsPage />)} />
              <Route path="api-keys" element={withSuspense(<ApiKeysPage />)} />
              <Route path="api-docs" element={withSuspense(<ApiDocsPage />)} />
              <Route path="operation-logs" element={withSuspense(<OperationLogsPage />)} />
              <Route
                path="admins"
                element={
                  <SuperAdminRoute>
                    {withSuspense(<AdminsPage />)}
                  </SuperAdminRoute>
                }
              />
              <Route path="settings" element={withSuspense(<SettingsPage />)} />
            </Route>

            {/* 404 重定向 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

const App: React.FC = () => (
  <ThemeModeProvider>
    <AppShell />
  </ThemeModeProvider>
);

export default App;
