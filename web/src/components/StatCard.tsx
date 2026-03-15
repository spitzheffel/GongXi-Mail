import React, { type CSSProperties } from 'react';
import { Card, Space, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface StatCardProps {
    title: string;
    value: number | string;
    icon?: React.ReactNode;
    iconBgColor?: string;
    trend?: number; // 百分比变化，正数为上升，负数为下降
    trendLabel?: string;
    suffix?: string;
    loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    icon,
    iconBgColor = '#1890ff',
    trend,
    trendLabel,
    suffix,
    loading = false,
}) => {
    const cardStyle = {
        '--gx-stat-accent': iconBgColor,
    } as CSSProperties;

    const renderTrend = () => {
        if (trend === undefined) return null;

        const isUp = trend >= 0;
        const color = isUp ? '#52c41a' : '#ff4d4f';
        const Icon = isUp ? ArrowUpOutlined : ArrowDownOutlined;

        return (
            <Space size={4} className="gx-stat-card__trend">
                <Icon style={{ color, fontSize: 12 }} />
                <Text style={{ color, fontSize: 12 }}>
                    {Math.abs(trend)}%
                </Text>
                {trendLabel && (
                    <Text className="gx-stat-card__trend-label">
                        {trendLabel}
                    </Text>
                )}
            </Space>
        );
    };

    return (
        <Card
            className="gx-stat-card"
            bordered={false}
            loading={loading}
            style={cardStyle}
            styles={{ body: { padding: '20px 24px' } }}
        >
            <div className="gx-stat-card__inner">
                <div className="gx-stat-card__meta">
                    <Text className="gx-stat-card__title">{title}</Text>
                    <div className="gx-stat-card__value">
                        {value}
                        {suffix && <span className="gx-stat-card__suffix">{suffix}</span>}
                    </div>
                    {renderTrend()}
                </div>
                {icon && (
                    <div className="gx-stat-card__icon" style={{ backgroundColor: iconBgColor }}>
                        {icon}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default StatCard;
