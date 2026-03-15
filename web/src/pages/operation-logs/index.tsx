import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Row, Select, Table, Tag, Typography } from 'antd';
import { HistoryOutlined, ReloadOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { logsApi } from '../../api';
import { PageHeader, StatCard } from '../../components';
import { LOG_ACTION_OPTIONS, getLogActionColor, getLogActionLabel } from '../../constants/logActions';
import type { LogAction } from '../../constants/logActions';
import { requestData } from '../../utils/request';

const { Text } = Typography;

interface LogItem {
    id: number;
    action: string;
    apiKeyName: string;
    email: string;
    requestIp: string;
    requestId: string | null;
    responseCode: number;
    responseTimeMs: number;
    createdAt: string;
}

const OperationLogsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [actionFilter, setActionFilter] = useState<LogAction | undefined>();

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const result = await requestData<{ list: LogItem[]; total: number }>(
            () => logsApi.getList({ page, pageSize, action: actionFilter }),
            '获取日志失败'
        );
        if (result) {
            setLogs(result.list);
            setTotal(result.total);
        }
        setLoading(false);
    }, [actionFilter, page, pageSize]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchLogs();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchLogs]);

    const successCount = useMemo(
        () => logs.filter((item) => item.responseCode >= 200 && item.responseCode < 300).length,
        [logs]
    );

    const errorCount = useMemo(
        () => logs.filter((item) => item.responseCode >= 400).length,
        [logs]
    );

    const averageResponseTime = useMemo(() => {
        if (logs.length === 0) {
            return 0;
        }
        return Math.round(logs.reduce((sum, item) => sum + item.responseTimeMs, 0) / logs.length);
    }, [logs]);

    const columns = useMemo(() => [
        {
            title: '时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 176,
            render: (value: string) => (
                <div>
                    <Text strong>{dayjs(value).format('YYYY-MM-DD')}</Text>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        {dayjs(value).format('HH:mm:ss')}
                    </Text>
                </div>
            ),
        },
        {
            title: 'API Key',
            dataIndex: 'apiKeyName',
            key: 'apiKeyName',
            width: 160,
            render: (name: string) => (
                name === '-'
                    ? <Text type="secondary">匿名或未绑定</Text>
                    : <Tag color="processing">{name}</Tag>
            ),
        },
        {
            title: '操作',
            dataIndex: 'action',
            key: 'action',
            width: 150,
            render: (action: string) => (
                <Tag color={getLogActionColor(action)}>{getLogActionLabel(action)}</Tag>
            ),
        },
        {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
            ellipsis: true,
            render: (email: string) => (
                email === '-'
                    ? <Text type="secondary">-</Text>
                    : <Text>{email}</Text>
            ),
        },
        {
            title: '状态码',
            dataIndex: 'responseCode',
            key: 'responseCode',
            width: 100,
            align: 'center' as const,
            render: (code: number) => (
                <Tag color={code >= 200 && code < 300 ? 'success' : 'error'}>{code}</Tag>
            ),
        },
        {
            title: '耗时',
            dataIndex: 'responseTimeMs',
            key: 'responseTimeMs',
            width: 110,
            align: 'right' as const,
            render: (ms: number) => {
                const color = ms >= 3000 ? '#dc2626' : ms >= 1000 ? '#d97706' : '#0f766e';
                return <Text style={{ color, fontWeight: 600 }}>{ms} ms</Text>;
            },
        },
        {
            title: 'IP 地址',
            dataIndex: 'requestIp',
            key: 'requestIp',
            width: 150,
            render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
        },
        {
            title: 'Request ID',
            dataIndex: 'requestId',
            key: 'requestId',
            width: 230,
            render: (requestId: string | null) => (
                requestId
                    ? <Text copyable className="gx-code-pill">{requestId}</Text>
                    : <Text type="secondary">-</Text>
            ),
        },
    ], []);

    const pagination = useMemo(
        () => ({
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (nextPage: number, nextPageSize: number) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
            },
        }),
        [page, pageSize, total]
    );

    return (
        <div className="gx-ops-shell">
            <PageHeader
                title="API 调用日志"
                extra={<Button icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</Button>}
            />

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                    <StatCard title="日志总量" value={total} icon={<HistoryOutlined />} iconBgColor="#0369A1" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="当前页成功" value={successCount} suffix={`/ ${logs.length || 0}`} icon={<ThunderboltOutlined />} iconBgColor="#0F766E" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="当前页异常" value={errorCount} icon={<WarningOutlined />} iconBgColor="#dc2626" />
                </Col>
                <Col xs={12} md={6}>
                    <StatCard title="平均耗时" value={averageResponseTime} suffix="ms" icon={<ReloadOutlined />} iconBgColor="#f59e0b" />
                </Col>
            </Row>

            <Card className="gx-panel-card gx-data-table" bordered={false}>
                <div className="gx-ops-toolbar">
                    <div className="gx-ops-toolbar__cluster">
                        <Select
                            placeholder="筛选操作类型"
                            style={{ width: 220, maxWidth: '100%' }}
                            allowClear
                            value={actionFilter}
                            options={LOG_ACTION_OPTIONS}
                            onChange={(value) => {
                                setActionFilter(value as LogAction | undefined);
                                setPage(1);
                            }}
                        />
                        <Text type="secondary">仅展示外部 API 调用，便于按操作类型回看排障。</Text>
                    </div>
                    <div className="gx-ops-toolbar__cluster gx-ops-toolbar__cluster--actions">
                        {actionFilter && (
                            <Tag color={getLogActionColor(actionFilter)}>
                                当前筛选：{getLogActionLabel(actionFilter)}
                            </Tag>
                        )}
                    </div>
                </div>

                <div className={`gx-ops-note${errorCount > 0 ? ' gx-ops-note--warning' : ''}`} style={{ marginBottom: 18 }}>
                    <Text className="gx-ops-note__label">Audit Note</Text>
                    <Text className="gx-ops-note__text">
                        Request ID 可直接复制用于服务端排查；若异常数偏高，优先按操作类型缩小范围，再结合耗时和状态码定位问题。
                    </Text>
                </div>

                <Table
                    className="gx-dashboard-table"
                    dataSource={logs}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={pagination}
                    scroll={{ x: 1300 }}
                    locale={{ emptyText: '暂无 API 调用日志' }}
                />
            </Card>
        </div>
    );
};

export default OperationLogsPage;
