import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Table, Tag, Typography, Spin, Button, Space, Progress } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import {
    MailOutlined,
    KeyOutlined,
    CheckCircleOutlined,
    ApiOutlined,
    ThunderboltOutlined,
    HistoryOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { StatCard, PageHeader } from '../../components';
import { dashboardApi, emailApi, apiKeyApi } from '../../api';

const { Text, Title, Paragraph } = Typography;

const LineChart = lazy(async () => {
    const mod = await import('@ant-design/charts');
    return { default: mod.Line as React.ComponentType<Record<string, unknown>> };
});

const PieChart = lazy(async () => {
    const mod = await import('@ant-design/charts');
    return { default: mod.Pie as React.ComponentType<Record<string, unknown>> };
});

interface Stats {
    apiKeys: {
        total: number;
        active: number;
        totalUsage: number;
        todayActive: number;
    };
    emails: {
        total: number;
        active: number;
        error: number;
    };
}

interface DashboardEmailItem {
    id: number;
    email: string;
    status: 'ACTIVE' | 'ERROR' | 'DISABLED';
    createdAt: string;
}

interface DashboardApiKeyItem {
    id: number;
    name: string;
    usageCount: number;
    status: 'ACTIVE' | 'DISABLED';
}

interface ApiTrendItem {
    date: string;
    count: number;
}

const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [coreLoading, setCoreLoading] = useState(true);
    const [trendLoading, setTrendLoading] = useState(true);
    const [chartsReady, setChartsReady] = useState(false);
    const [chartsInView, setChartsInView] = useState(false);
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentEmails, setRecentEmails] = useState<DashboardEmailItem[]>([]);
    const [recentApiKeys, setRecentApiKeys] = useState<DashboardApiKeyItem[]>([]);
    const [apiTrend, setApiTrend] = useState<ApiTrendItem[]>([]);
    const chartsSectionRef = useRef<HTMLDivElement | null>(null);
    const trendRequestedRef = useRef(false);

    useEffect(() => {
        let disposed = false;
        let idleId: number | null = null;
        let timerId: number | null = null;
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const loadCore = async () => {
            try {
                const [statsRes, emailsRes, apiKeysRes] = await Promise.all([
                    dashboardApi.getStats<Stats>(),
                    emailApi.getList<DashboardEmailItem>({ page: 1, pageSize: 5 }),
                    apiKeyApi.getList<DashboardApiKeyItem>({ page: 1, pageSize: 5 }),
                ]);

                if (disposed) return;

                if (statsRes.code === 200) {
                    setStats(statsRes.data);
                }
                if (emailsRes.code === 200) {
                    setRecentEmails(emailsRes.data.list);
                }
                if (apiKeysRes.code === 200) {
                    setRecentApiKeys(apiKeysRes.data.list);
                }
            } catch (err) {
                console.error('Failed to fetch core dashboard data:', err);
            } finally {
                if (!disposed) {
                    setCoreLoading(false);
                }
            }
        };

        void loadCore();

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleId = idleWindow.requestIdleCallback(() => {
                if (!disposed) {
                    setChartsReady(true);
                }
            }, { timeout: 1200 });
        } else {
            timerId = window.setTimeout(() => {
                if (!disposed) {
                    setChartsReady(true);
                }
            }, 350);
        }

        return () => {
            disposed = true;
            if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
                idleWindow.cancelIdleCallback(idleId);
            }
            if (timerId !== null) {
                window.clearTimeout(timerId);
            }
        };
    }, []);

    useEffect(() => {
        const target = chartsSectionRef.current;
        if (!target || typeof IntersectionObserver === 'undefined') {
            setChartsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setChartsInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '120px 0px' }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!chartsReady || !chartsInView || trendRequestedRef.current) {
            return;
        }

        trendRequestedRef.current = true;
        let cancelled = false;

        const loadTrend = async () => {
            try {
                const trendRes = await dashboardApi.getApiTrend<ApiTrendItem>(7);
                if (!cancelled && trendRes.code === 200) {
                    setApiTrend(trendRes.data);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard trend:', err);
            } finally {
                if (!cancelled) {
                    setTrendLoading(false);
                }
            }
        };

        void loadTrend();
        return () => {
            cancelled = true;
        };
    }, [chartsInView, chartsReady]);

    const emailColumns = [
        {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
            ellipsis: true,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 88,
            render: (status: string) => {
                const config: Record<string, { color: string; text: string }> = {
                    ACTIVE: { color: 'success', text: '正常' },
                    ERROR: { color: 'error', text: '异常' },
                    DISABLED: { color: 'default', text: '禁用' },
                };
                return <Tag color={config[status]?.color}>{config[status]?.text}</Tag>;
            },
        },
        {
            title: '添加时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 126,
            render: (val: string) => dayjs(val).format('MM-DD HH:mm'),
        },
    ];

    const apiKeyColumns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: '使用次数',
            dataIndex: 'usageCount',
            key: 'usageCount',
            width: 116,
            render: (val: number) => <Text strong>{(val || 0).toLocaleString()}</Text>,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 88,
            render: (status: string) => (
                <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>
                    {status === 'ACTIVE' ? '启用' : '禁用'}
                </Tag>
            ),
        },
    ];

    const lineConfig = useMemo(() => ({
        data: apiTrend,
        xField: 'date',
        yField: 'count',
        smooth: true,
        height: 280,
        point: { size: 4, shape: 'circle' },
        color: '#0369A1',
        areaStyle: {
            fill: 'l(270) 0:#ffffff 1:#0ea5e930',
        },
        xAxis: {
            label: {
                formatter: (v: string) => dayjs(v).format('MM-DD'),
            },
        },
    }), [apiTrend]);

    const statsData: Stats = stats || {
        apiKeys: { total: 0, active: 0, totalUsage: 0, todayActive: 0 },
        emails: { total: 0, active: 0, error: 0 },
    };

    const pieData = useMemo(() => (stats ? [
        { type: '正常', value: stats.emails.active },
        { type: '异常', value: stats.emails.error },
        { type: '禁用', value: Math.max(0, stats.emails.total - stats.emails.active - stats.emails.error) },
    ].filter((d) => d.value > 0) : []), [stats]);

    const pieConfig = useMemo(() => ({
        data: pieData,
        angleField: 'value',
        colorField: 'type',
        height: 280,
        radius: 0.8,
        innerRadius: 0.6,
        color: ['#22c55e', '#ef4444', '#bae6fd'],
        label: {
            type: 'inner',
            offset: '-50%',
            content: '{value}',
            style: { textAlign: 'center', fontSize: 14 },
        },
        statistic: {
            title: { content: '邮箱' },
            content: { content: statsData.emails.total.toString() },
        },
    }), [pieData, statsData.emails.total]);

    const mailboxHealth = statsData.emails.total > 0
        ? Math.round((statsData.emails.active / statsData.emails.total) * 100)
        : 0;
    const apiKeyActivity = statsData.apiKeys.total > 0
        ? Math.round((statsData.apiKeys.active / statsData.apiKeys.total) * 100)
        : 0;

    const actionCards = [
        {
            key: 'emails',
            title: '邮箱池调度',
            description: '集中维护账号、分组和邮件查看，适合高频验证场景。',
            metricLabel: 'Active',
            metricValue: `${statsData.emails.active}/${statsData.emails.total || 0}`,
            icon: <MailOutlined />,
            path: '/emails',
        },
        {
            key: 'api-keys',
            title: 'API 权限边界',
            description: '管理调用速率、权限粒度和邮箱池占用策略。',
            metricLabel: 'Usage',
            metricValue: statsData.apiKeys.totalUsage.toLocaleString(),
            icon: <ThunderboltOutlined />,
            path: '/api-keys',
        },
        {
            key: 'logs',
            title: '操作审计',
            description: '回看 get-email、拉信与清空操作，快速定位异常行为。',
            metricLabel: 'Today',
            metricValue: statsData.apiKeys.todayActive.toString(),
            icon: <HistoryOutlined />,
            path: '/operation-logs',
        },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Operations Console"
                title="数据概览"
                subtitle="把邮箱池可用率、API 活跃度和审计趋势压缩到一个更聚焦的首页，让排障和运维判断更快。"
                extra={(
                    <>
                        <Button onClick={() => navigate('/emails')}>邮箱池</Button>
                        <Button type="primary" onClick={() => navigate('/operation-logs')}>查看审计</Button>
                    </>
                )}
            />

            <Card className="gx-hero-card gx-panel-card" bordered={false}>
                <Row gutter={[24, 24]} align="middle">
                    <Col xs={24} xl={14}>
                        <Text className="gx-hero-card__eyebrow">Command Overview</Text>
                        <Title level={2} className="gx-hero-card__title">
                            邮箱资源、API 调度与审计状态都在首屏。
                        </Title>
                        <Paragraph className="gx-hero-card__subtitle">
                            这个首页现在更偏向控制台而不是普通后台列表页。关键判断点被前置：健康度、活跃度、分布趋势和最近变更一眼可读。
                        </Paragraph>
                        <Space wrap className="gx-hero-card__actions">
                            <Button type="primary" icon={<MailOutlined />} onClick={() => navigate('/emails')}>管理邮箱池</Button>
                            <Button icon={<KeyOutlined />} onClick={() => navigate('/api-keys')}>管理 API Key</Button>
                        </Space>
                    </Col>
                    <Col xs={24} xl={10}>
                        <div className="gx-hero-card__metrics">
                            <div className="gx-hero-signal">
                                <Text className="gx-hero-signal__label">Mailbox Health</Text>
                                <Text className="gx-hero-signal__value">{mailboxHealth}%</Text>
                                <Progress percent={mailboxHealth} showInfo={false} strokeColor="#22c55e" trailColor="#d7eff9" />
                                <Text className="gx-hero-signal__description">
                                    {statsData.emails.error > 0
                                        ? `当前有 ${statsData.emails.error} 个异常邮箱需要优先处理。`
                                        : '当前没有异常邮箱，邮箱池处于稳定状态。'}
                                </Text>
                            </div>
                            <div className="gx-hero-signal__grid">
                                <div className="gx-hero-mini">
                                    <Text className="gx-hero-mini__label">今日活跃 Key</Text>
                                    <Text className="gx-hero-mini__value">{statsData.apiKeys.todayActive}</Text>
                                </div>
                                <div className="gx-hero-mini">
                                    <Text className="gx-hero-mini__label">Key 活跃率</Text>
                                    <Text className="gx-hero-mini__value">{apiKeyActivity}%</Text>
                                </div>
                            </div>
                        </div>
                    </Col>
                </Row>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={12} sm={12} md={6}>
                    <StatCard
                        title="邮箱总数"
                        value={statsData.emails.total}
                        icon={<MailOutlined />}
                        iconBgColor="#0369A1"
                    />
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <StatCard
                        title="正常邮箱"
                        value={statsData.emails.active}
                        icon={<CheckCircleOutlined />}
                        iconBgColor="#22C55E"
                        suffix={`/ ${statsData.emails.total}`}
                    />
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <StatCard
                        title="API 调用总数"
                        value={statsData.apiKeys.totalUsage}
                        icon={<ApiOutlined />}
                        iconBgColor="#0EA5E9"
                    />
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <StatCard
                        title="活跃 API Key"
                        value={statsData.apiKeys.active}
                        icon={<KeyOutlined />}
                        iconBgColor="#0F766E"
                        suffix={`/ ${statsData.apiKeys.total}`}
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                {actionCards.map((item) => (
                    <Col key={item.key} xs={24} md={8}>
                        <Link to={item.path} className="gx-action-card">
                            <Card bordered={false}>
                                <div className="gx-action-card__icon">{item.icon}</div>
                                <Text className="gx-action-card__title">{item.title}</Text>
                                <Text className="gx-action-card__desc">{item.description}</Text>
                                <div className="gx-action-card__meta">
                                    <div>
                                        <Text className="gx-action-card__meta-label">{item.metricLabel}</Text>
                                        <Text className="gx-action-card__meta-value">{item.metricValue}</Text>
                                    </div>
                                    <ArrowRightOutlined style={{ color: '#0369A1' }} />
                                </div>
                            </Card>
                        </Link>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }} ref={chartsSectionRef}>
                <Col xs={24} md={16}>
                    <Card title="API 调用趋势（近 7 天）" bordered={false} className="gx-panel-card">
                        {!chartsReady || !chartsInView || trendLoading ? (
                            <div className="gx-dashboard-empty"><Spin /></div>
                        ) : (
                            <Suspense fallback={<div className="gx-dashboard-empty"><Spin /></div>}>
                                <LineChart {...lineConfig} />
                            </Suspense>
                        )}
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card title="邮箱状态分布" bordered={false} className="gx-panel-card">
                        {coreLoading || !chartsReady || !chartsInView ? (
                            <div className="gx-dashboard-empty"><Spin /></div>
                        ) : pieData.length > 0 ? (
                            <Suspense fallback={<div className="gx-dashboard-empty"><Spin /></div>}>
                                <PieChart {...pieConfig} />
                            </Suspense>
                        ) : (
                            <div className="gx-dashboard-empty">
                                <Text type="secondary">暂无数据</Text>
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={12}>
                    <Card
                        title="最近添加的邮箱"
                        bordered={false}
                        className="gx-panel-card gx-dashboard-table"
                        styles={{ body: { padding: 0 } }}
                        extra={<Link to="/emails">查看全部</Link>}
                    >
                        <Table
                            dataSource={recentEmails}
                            columns={emailColumns}
                            rowKey="id"
                            loading={coreLoading}
                            pagination={false}
                            size="small"
                            locale={{ emptyText: '暂无数据' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card
                        title="API Key 使用排行"
                        bordered={false}
                        className="gx-panel-card gx-dashboard-table"
                        styles={{ body: { padding: 0 } }}
                        extra={<Link to="/api-keys">查看全部</Link>}
                    >
                        <Table
                            dataSource={recentApiKeys}
                            columns={apiKeyColumns}
                            rowKey="id"
                            loading={coreLoading}
                            pagination={false}
                            size="small"
                            locale={{ emptyText: '暂无数据' }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default DashboardPage;
