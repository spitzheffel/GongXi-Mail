import React, { useMemo } from 'react';
import { Button, Card, Col, Divider, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    KeyOutlined,
    LinkOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components';
import { LOG_ACTION_OPTIONS } from '../../constants/logActions';

const { Paragraph, Text, Title } = Typography;

interface EnumRule {
    key: string;
    name: string;
    values: string;
    desc: string;
}

interface LogActionRow {
    action: string;
    label: string;
    description: string;
}

interface AuthMethod {
    method: string;
    example: string;
    description: string;
}

interface EnvironmentRequirement {
    key: string;
    name: string;
    requirement: string;
}

interface QuickStartMode {
    key: string;
    eyebrow: string;
    title: string;
    description: string;
    endpoint: string;
    focus: string;
}

interface ApiParam {
    name: string;
    type: string;
    required: boolean;
    desc: string;
}

interface ApiEndpoint {
    key: string;
    name: string;
    method: string;
    path: string;
    category: string;
    useCase: string;
    responseType: string;
    description: string;
    highlights: string[];
    notes: string[];
    params: ApiParam[];
    example: string;
    successResponse: string;
    errorResponse: string;
}

const enumRules: EnumRule[] = [
    { key: 'role', name: '管理员角色', values: 'SUPER_ADMIN / ADMIN', desc: '用于后台权限判定' },
    { key: 'status', name: '管理员 / API Key 状态', values: 'ACTIVE / DISABLED', desc: '统一使用大写枚举值' },
];

const authMethods: AuthMethod[] = [
    {
        method: 'Header (推荐)',
        example: 'X-API-Key: sk_your_api_key',
        description: '最适合服务端接入，日志中也更容易单独识别认证头。',
    },
    {
        method: 'Bearer Token',
        example: 'Authorization: Bearer sk_your_api_key',
        description: '兼容通用 HTTP 客户端或现有鉴权中间件。',
    },
    {
        method: 'Query 参数',
        example: '?api_key=sk_your_api_key',
        description: '仅建议临时调试使用，生产环境容易被日志和代理记录。',
    },
];

const environmentRequirements: EnvironmentRequirement[] = [
    { key: 'JWT_SECRET', name: 'JWT_SECRET', requirement: '至少 32 字符，使用高强度随机值。' },
    { key: 'ENCRYPTION_KEY', name: 'ENCRYPTION_KEY', requirement: '固定 32 字符，用于敏感字段加密。' },
    { key: 'ADMIN_PASSWORD', name: 'ADMIN_PASSWORD', requirement: '必须覆盖默认值，并单独妥善保管。' },
];

const quickStartModes: QuickStartMode[] = [
    {
        key: 'direct',
        eyebrow: 'Known Mailbox',
        title: '已知邮箱，直接拉信',
        description: '只要邮箱地址已存在于系统中，就可以直接读取最新邮件或全部邮件，不需要先做分配。',
        endpoint: '/api/mail_new · /api/mail_all',
        focus: '适合回查验证码、补抓历史邮件。',
    },
    {
        key: 'allocate',
        eyebrow: 'Pool Allocation',
        title: '需要新邮箱，先自动分配',
        description: '当你需要一个未使用过的邮箱时，先调用分配接口，再继续拉信或清箱流程。',
        endpoint: '/api/get-email',
        focus: '会自动占用，避免重复发放。',
    },
    {
        key: 'script',
        eyebrow: 'Automation',
        title: '脚本抓码，优先纯文本',
        description: '自动化脚本更适合走 text/plain 输出，再用正则直接提取验证码或关键字。',
        endpoint: '/api/mail_text',
        focus: '减少 JSON 解析和脚本分支处理。',
    },
];

const logActionDescriptions: Record<string, string> = {
    get_email: '分配邮箱',
    mail_new: '获取最新邮件',
    mail_text: '获取邮件文本',
    mail_all: '获取所有邮件',
    process_mailbox: '清空邮箱',
    list_emails: '获取邮箱列表',
    pool_stats: '邮箱池统计',
    pool_reset: '重置邮箱池',
};

const logActionRows: LogActionRow[] = LOG_ACTION_OPTIONS.map((item) => ({
    action: item.value,
    label: item.label,
    description: logActionDescriptions[item.value] || item.label,
}));

const createApiEndpoints = (baseUrl: string): ApiEndpoint[] => [
    {
        key: 'get-email',
        name: '获取邮箱地址',
        method: 'GET / POST',
        path: '/api/get-email',
        category: 'Allocation',
        useCase: '从池里拿一个当前未占用的邮箱，并为当前 API Key 标记使用。',
        responseType: 'application/json',
        description: '从邮箱池分配一个可用邮箱，支持通过 group 参数只从指定分组内取号。',
        highlights: ['支持 group 过滤', '返回 email 与 id', '会标记为已使用'],
        notes: [
            '如果你需要一次性拿到一个全新邮箱，这是所有流程的起点。',
            '按 group 收窄范围后，分配结果只会落在该分组里。',
        ],
        params: [
            { name: 'group', type: 'string', required: false, desc: '分组名称，仅从该分组中分配。' },
        ],
        example: `curl -X POST "${baseUrl}/api/get-email" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "id": 1
  }
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "NO_UNUSED_EMAIL",
    "message": "No unused emails available."
  }
}`,
    },
    {
        key: 'mail-new',
        name: '获取最新邮件',
        method: 'GET / POST',
        path: '/api/mail_new',
        category: 'Mailbox Read',
        useCase: '读取单个邮箱在指定文件夹中的最新一封邮件。',
        responseType: 'application/json',
        description: '已知邮箱地址时可直接调用，不依赖前置分配；mailbox 参数支持别名和完整文件夹路径。',
        highlights: ['支持 mailbox 别名', '支持代理参数', '返回 messages 数组'],
        notes: [
            '默认文件夹是 inbox，也可以传入 Inbox、Junk Email、Archive 或完整层级路径。',
            '当你只关心最新一封邮件时，这个接口会比拉全量列表更省成本。',
        ],
        params: [
            { name: 'email', type: 'string', required: true, desc: '邮箱地址。' },
            { name: 'mailbox', type: 'string', required: false, desc: '邮件文件夹，默认 inbox；支持常见别名或完整文件夹路径。' },
            { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 代理地址。' },
            { name: 'http', type: 'string', required: false, desc: 'HTTP 代理地址。' },
        ],
        example: `curl -X POST "${baseUrl}/api/mail_new" \\
  -H "X-API-Key: sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "example@outlook.com", "mailbox": "inbox"}'`,
        successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "count": 1,
    "messages": [
      {
        "id": "AAMk...",
        "subject": "验证码邮件",
        "from": "noreply@example.com",
        "text": "您的验证码是 123456"
      }
    ],
    "method": "graph_api"
  },
  "email": "example@outlook.com"
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
        key: 'mail-text',
        name: '获取邮件文本（脚本）',
        method: 'GET / POST',
        path: '/api/mail_text',
        category: 'Automation',
        useCase: '直接为脚本返回 text/plain，减少 JSON 解析和分支判断。',
        responseType: 'text/plain',
        description: '适合自动化抓码或关键字提取，可结合正则表达式直接返回匹配结果。',
        highlights: ['纯文本返回', '支持正则 match', '适合验证码脚本'],
        notes: [
            'match 参数建议传入精确正则，例如 \\d{6} 或特定前缀关键字。',
            '如果只要验证码或 token，不必先请求 JSON 再在脚本里二次处理。',
        ],
        params: [
            { name: 'email', type: 'string', required: true, desc: '邮箱地址。' },
            { name: 'mailbox', type: 'string', required: false, desc: '邮件文件夹，默认 inbox；支持常见别名或完整文件夹路径。' },
            { name: 'match', type: 'string', required: false, desc: '正则表达式，例如 \\d{6}。' },
        ],
        example: `curl "${baseUrl}/api/mail_text?email=example@outlook.com&mailbox=inbox&match=\\d{6}" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `123456`,
        errorResponse: `Error: No match found`,
    },
    {
        key: 'mail-all',
        name: '获取所有邮件',
        method: 'GET / POST',
        path: '/api/mail_all',
        category: 'Mailbox Read',
        useCase: '一次取回指定文件夹中的全部邮件，用于回放或历史检索。',
        responseType: 'application/json',
        description: '当你需要完整消息列表时使用，同样支持 mailbox 参数与代理透传。',
        highlights: ['返回完整列表', '支持 mailbox 切换', '支持代理参数'],
        notes: [
            '如果调用频率较高，建议优先限定 mailbox，避免在无关文件夹里拉全量。',
            '接口返回的 method 字段可以帮助你判断底层使用了哪种取信通道。',
        ],
        params: [
            { name: 'email', type: 'string', required: true, desc: '邮箱地址。' },
            { name: 'mailbox', type: 'string', required: false, desc: '邮件文件夹，默认 inbox；支持常见别名或完整文件夹路径。' },
            { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 代理地址。' },
            { name: 'http', type: 'string', required: false, desc: 'HTTP 代理地址。' },
        ],
        example: `curl "${baseUrl}/api/mail_all?email=example@outlook.com&mailbox=inbox" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "count": 2,
    "messages": [
      { "id": "...", "subject": "邮件1" },
      { "id": "...", "subject": "邮件2" }
    ],
    "method": "imap"
  },
  "email": "example@outlook.com"
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
        key: 'process-mailbox',
        name: '清空邮箱',
        method: 'GET / POST',
        path: '/api/process-mailbox',
        category: 'Mailbox Maintenance',
        useCase: '删除指定邮箱在目标文件夹中的全部邮件，恢复干净状态。',
        responseType: 'application/json',
        description: '用于重置测试邮箱或跑批前清理旧邮件，支持 mailbox、代理与幂等排障。',
        highlights: ['清空目标文件夹', '返回删除数量', '支持代理透传'],
        notes: [
            '清空前先确认当前文件夹是否正确，避免误删其他归档邮件。',
            '自动化场景里通常会在下一轮注册前先执行一次清箱。',
        ],
        params: [
            { name: 'email', type: 'string', required: true, desc: '邮箱地址。' },
            { name: 'mailbox', type: 'string', required: false, desc: '邮件文件夹，默认 inbox；支持常见别名或完整文件夹路径。' },
            { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 代理地址。' },
            { name: 'http', type: 'string', required: false, desc: 'HTTP 代理地址。' },
        ],
        example: `curl -X POST "${baseUrl}/api/process-mailbox" \\
  -H "X-API-Key: sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "example@outlook.com", "mailbox": "inbox"}'`,
        successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "status": "success",
    "deletedCount": 5,
    "message": "Successfully deleted 5 messages"
  },
  "email": "example@outlook.com"
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
        key: 'list-emails',
        name: '获取可用邮箱列表',
        method: 'GET / POST',
        path: '/api/list-emails',
        category: 'Pool Query',
        useCase: '查看当前可访问的邮箱清单，并按 group 维度筛选。',
        responseType: 'application/json',
        description: '适合在接入前先确认当前 API Key 能访问哪些邮箱资源。',
        highlights: ['支持 group 过滤', '返回邮箱状态', '适合预检查'],
        notes: [
            '如果你是白名单模式接入，这个接口可以先确认当前 Key 的可见范围。',
            '返回结果用于展示和预检更合适，不建议把它当成高频轮询接口。',
        ],
        params: [
            { name: 'group', type: 'string', required: false, desc: '分组名称，仅返回该分组内的邮箱。' },
        ],
        example: `curl "${baseUrl}/api/list-emails?group=default" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `{
  "success": true,
  "data": {
    "total": 100,
    "emails": [
      { "email": "user1@outlook.com", "status": "ACTIVE" },
      { "email": "user2@outlook.com", "status": "ACTIVE" }
    ]
  }
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
    {
        key: 'pool-stats',
        name: '邮箱池统计',
        method: 'GET / POST',
        path: '/api/pool-stats',
        category: 'Pool Query',
        useCase: '查看当前 API Key 在某个范围内的池使用率与剩余额度。',
        responseType: 'application/json',
        description: '适合做容量判断、预警和用量监控，可配合 group 参数聚焦某个分组。',
        highlights: ['返回 total / used / remaining', '支持 group 过滤', '适合容量监控'],
        notes: [
            'remaining 接近 0 时应该优先补充邮箱或触发 pool reset。',
            '接口统计的是当前 API Key 的使用状态，不是全局邮箱池的总占用。',
        ],
        params: [
            { name: 'group', type: 'string', required: false, desc: '分组名称，仅统计该分组。' },
        ],
        example: `curl "${baseUrl}/api/pool-stats?group=default" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `{
  "success": true,
  "data": {
    "total": 100,
    "used": 3,
    "remaining": 97
  }
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
    {
        key: 'reset-pool',
        name: '重置分配记录',
        method: 'GET / POST',
        path: '/api/reset-pool',
        category: 'Pool Reset',
        useCase: '清空当前 API Key 的占用记录，让邮箱重新可被分配。',
        responseType: 'application/json',
        description: '当某个 Key 需要重新获得邮箱分配资格时使用，可按 group 范围单独重置。',
        highlights: ['支持按 group 重置', '恢复可分配资格', '建议审慎执行'],
        notes: [
            '这是影响分配行为的动作，建议在流程空窗期执行并留意审计日志。',
            '如果只想恢复某个分组的资格，优先传入 group 避免扩大影响范围。',
        ],
        params: [
            { name: 'group', type: 'string', required: false, desc: '分组名称，仅重置该分组。' },
        ],
        example: `curl -X POST "${baseUrl}/api/reset-pool" \\
  -H "X-API-Key: sk_your_api_key"`,
        successResponse: `{
  "success": true,
  "data": {
    "message": "Pool reset successfully"
  }
}`,
        errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
];

const ApiDocsPage: React.FC = () => {
    const navigate = useNavigate();
    const baseUrl = window.location.origin;

    const apiEndpoints = useMemo(() => createApiEndpoints(baseUrl), [baseUrl]);

    const authColumns: ColumnsType<AuthMethod> = useMemo(
        () => [
            { title: '方式', dataIndex: 'method', key: 'method', width: 140 },
            {
                title: '示例',
                dataIndex: 'example',
                key: 'example',
                render: (value: string) => <Text className="gx-code-pill" copyable>{value}</Text>,
            },
            { title: '说明', dataIndex: 'description', key: 'description' },
        ],
        []
    );

    const envColumns: ColumnsType<EnvironmentRequirement> = useMemo(
        () => [
            {
                title: '变量',
                dataIndex: 'name',
                key: 'name',
                width: 160,
                render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
            },
            { title: '要求', dataIndex: 'requirement', key: 'requirement' },
        ],
        []
    );

    const enumColumns: ColumnsType<EnumRule> = useMemo(
        () => [
            { title: '类型', dataIndex: 'name', key: 'name', width: 180 },
            {
                title: '枚举值',
                dataIndex: 'values',
                key: 'values',
                render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
            },
            { title: '说明', dataIndex: 'desc', key: 'desc' },
        ],
        []
    );

    const logActionColumns: ColumnsType<LogActionRow> = useMemo(
        () => [
            {
                title: 'Action',
                dataIndex: 'action',
                key: 'action',
                width: 180,
                render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
            },
            { title: '中文含义', dataIndex: 'label', key: 'label', width: 140 },
            { title: '说明', dataIndex: 'description', key: 'description' },
        ],
        []
    );

    const paramColumns: ColumnsType<ApiParam> = useMemo(
        () => [
            {
                title: '参数名',
                dataIndex: 'name',
                key: 'name',
                width: 150,
                render: (value: string) => <Text className="gx-code-pill">{value}</Text>,
            },
            { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
            {
                title: '必填',
                dataIndex: 'required',
                key: 'required',
                width: 96,
                render: (required: boolean) => (
                    <Tag color={required ? 'error' : 'default'}>
                        {required ? '必填' : '可选'}
                    </Tag>
                ),
            },
            { title: '说明', dataIndex: 'desc', key: 'desc' },
        ],
        []
    );

    return (
        <div className="gx-docs-shell">
            <PageHeader
                title="API 文档"
                extra={(
                    <>
                        <Button icon={<LinkOutlined />} onClick={() => window.open(`${baseUrl}/health`, '_blank', 'noopener,noreferrer')}>
                            健康检查
                        </Button>
                        <Button icon={<KeyOutlined />} onClick={() => navigate('/api-keys')}>
                            密钥管理
                        </Button>
                    </>
                )}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={14}>
                    <Card className="gx-panel-card gx-data-table" title="接入路径与认证" bordered={false}>
                        <div className="gx-ops-note">
                            <Text className="gx-ops-note__label">接入建议</Text>
                            <Text className="gx-ops-note__text">
                                文档优先回答三个问题：邮箱是否已知、是否需要分配新邮箱、脚本是否只要纯文本结果。先选接入路径，再选具体接口。
                            </Text>
                        </div>

                        <div className="gx-docs-quick-grid" style={{ marginTop: 18 }}>
                            {quickStartModes.map((item) => (
                                <div key={item.key} className="gx-docs-quick-card">
                                    <Text className="gx-docs-quick-card__eyebrow">{item.eyebrow}</Text>
                                    <Text className="gx-docs-quick-card__title">{item.title}</Text>
                                    <Text className="gx-docs-quick-card__text">{item.description}</Text>
                                    <div className="gx-docs-quick-card__meta">
                                        <Text className="gx-code-pill">{item.endpoint}</Text>
                                        <Text className="gx-code-pill">{item.focus}</Text>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Divider style={{ margin: '20px 0' }} />

                        <Title level={3} className="gx-docs-section__title">
                            认证方式
                        </Title>
                        <Table
                            dataSource={authMethods}
                            columns={authColumns}
                            rowKey="method"
                            pagination={false}
                            size="small"
                            scroll={{ x: 720 }}
                            style={{ marginTop: 12 }}
                        />
                    </Card>
                </Col>

                <Col xs={24} xl={10}>
                    <Card className="gx-panel-card gx-data-table" title="运行要求与枚举约定" bordered={false}>
                        <div className="gx-ops-note gx-ops-note--warning">
                            <Text className="gx-ops-note__label">生产基线</Text>
                            <Text className="gx-ops-note__text">
                                `JWT_SECRET`、`ENCRYPTION_KEY`、`ADMIN_PASSWORD` 必须通过外部环境变量注入，不要写死在仓库、镜像或启动脚本里。
                            </Text>
                            <div className="gx-docs-highlight-list">
                                <Text className="gx-code-pill">{`${baseUrl}/health`}</Text>
                                <Text className="gx-code-pill">ACTIVE / DISABLED</Text>
                                <Text className="gx-code-pill">SUPER_ADMIN / ADMIN</Text>
                            </div>
                        </div>

                        <Title level={3} className="gx-docs-section__title" style={{ marginTop: 20 }}>
                            环境变量
                        </Title>
                        <Table
                            dataSource={environmentRequirements}
                            columns={envColumns}
                            rowKey="key"
                            pagination={false}
                            size="small"
                            style={{ marginTop: 12 }}
                        />

                        <Divider style={{ margin: '20px 0' }} />

                        <Title level={3} className="gx-docs-section__title">
                            枚举值
                        </Title>
                        <Table
                            dataSource={enumRules}
                            columns={enumColumns}
                            rowKey="key"
                            pagination={false}
                            size="small"
                            style={{ marginTop: 12 }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card className="gx-panel-card gx-data-table" title="审计动作映射" bordered={false}>
                <div className="gx-ops-note" style={{ marginBottom: 18 }}>
                    <Text className="gx-ops-note__label">日志筛选值</Text>
                    <Text className="gx-ops-note__text">
                        这些 Action 值会出现在操作日志页的筛选器中。联调或排障时，可以直接按 Action 缩小到某一类邮箱动作。
                    </Text>
                </div>
                <Table
                    dataSource={logActionRows}
                    columns={logActionColumns}
                    rowKey="action"
                    pagination={false}
                    size="small"
                    scroll={{ x: 720 }}
                />
            </Card>

            <Card className="gx-panel-card gx-data-table" title="接口规格" bordered={false}>
                <div className="gx-ops-note" style={{ marginBottom: 18 }}>
                    <Text className="gx-ops-note__label">路由说明</Text>
                    <Text className="gx-ops-note__text">
                        所有带 mailbox 参数的接口默认读取 inbox，同时支持常见别名或完整文件夹路径。自动化接入前，先确认目标邮件是否真的落在对应文件夹中。
                    </Text>
                </div>

                <Tabs
                    className="gx-ops-tabs"
                    items={apiEndpoints.map((api) => ({
                        key: api.key,
                        label: (
                            <span className="gx-ops-tab-label">
                                <span>{api.name}</span>
                                <Tag className="gx-ops-tab-count">{api.params.length} 参数</Tag>
                            </span>
                        ),
                        children: (
                            <div className="gx-docs-endpoint">
                                <div className="gx-docs-spec-grid">
                                    <div className="gx-docs-spec-item">
                                        <Text className="gx-docs-spec-item__label">Method / Path</Text>
                                        <Space wrap>
                                            <Tag color="processing">{api.method}</Tag>
                                            <Text className="gx-code-pill" copyable>{`${baseUrl}${api.path}`}</Text>
                                        </Space>
                                    </div>
                                    <div className="gx-docs-spec-item">
                                        <Text className="gx-docs-spec-item__label">Use Case</Text>
                                        <Text className="gx-docs-spec-item__value">{api.useCase}</Text>
                                    </div>
                                    <div className="gx-docs-spec-item">
                                        <Text className="gx-docs-spec-item__label">Response Type</Text>
                                        <Text className="gx-docs-spec-item__value">{api.responseType}</Text>
                                    </div>
                                </div>

                                <div className="gx-ops-note">
                                    <Text className="gx-ops-note__label">{api.category}</Text>
                                    <Text className="gx-ops-note__text">{api.description}</Text>
                                    <div className="gx-docs-highlight-list">
                                        {api.highlights.map((item) => (
                                            <Text key={item} className="gx-code-pill">{item}</Text>
                                        ))}
                                    </div>
                                </div>

                                {api.params.length > 0 && (
                                    <div className="gx-docs-section">
                                        <Title level={3} className="gx-docs-section__title">
                                            请求参数
                                        </Title>
                                        <Table
                                            dataSource={api.params}
                                            columns={paramColumns}
                                            rowKey="name"
                                            pagination={false}
                                            size="small"
                                            scroll={{ x: 720 }}
                                        />
                                    </div>
                                )}

                                <div className="gx-docs-block">
                                    <div className="gx-docs-block__header">
                                        <Text className="gx-docs-block__label">调用示例</Text>
                                        <Tag color="processing">{api.method}</Tag>
                                    </div>
                                    <Paragraph className="gx-docs-codeblock" copyable={{ text: api.example }}>
                                        {api.example}
                                    </Paragraph>
                                </div>

                                <div className="gx-docs-response-grid">
                                    <div className="gx-docs-block">
                                        <div className="gx-docs-block__header">
                                            <Text className="gx-docs-block__label">成功响应</Text>
                                            <Tag color="success">{api.responseType}</Tag>
                                        </div>
                                        <Paragraph className="gx-docs-codeblock" copyable={{ text: api.successResponse }}>
                                            {api.successResponse}
                                        </Paragraph>
                                    </div>
                                    <div className="gx-docs-block">
                                        <div className="gx-docs-block__header">
                                            <Text className="gx-docs-block__label">错误响应</Text>
                                            <Tag color="error">error</Tag>
                                        </div>
                                        <Paragraph className="gx-docs-codeblock" copyable={{ text: api.errorResponse }}>
                                            {api.errorResponse}
                                        </Paragraph>
                                    </div>
                                </div>

                                <div className="gx-docs-quick-grid">
                                    {api.notes.map((note, index) => (
                                        <div key={`${api.key}-${index}`} className="gx-docs-quick-card">
                                            <Text className="gx-docs-quick-card__eyebrow">Implementation Note {index + 1}</Text>
                                            <Text className="gx-docs-quick-card__text">{note}</Text>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ),
                    }))}
                />
            </Card>
        </div>
    );
};

export default ApiDocsPage;
