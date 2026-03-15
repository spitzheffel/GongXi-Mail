import React from 'react';
import { Typography, Breadcrumb, Space } from 'antd';
import { Link } from 'react-router-dom';

const { Title, Text } = Typography;

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    breadcrumb?: Array<{ title: string; path?: string }>;
    extra?: React.ReactNode;
    eyebrow?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    breadcrumb,
    extra,
    eyebrow,
}) => {
    return (
        <div className="gx-page-header">
            {breadcrumb && breadcrumb.length > 0 && (
                <Breadcrumb
                    className="gx-page-header__breadcrumb"
                    items={breadcrumb.map((item) => ({
                        title: item.path ? <Link to={item.path}>{item.title}</Link> : item.title,
                    }))}
                />
            )}
            {eyebrow && (
                <Text className="gx-page-header__eyebrow">
                    {eyebrow}
                </Text>
            )}
            <div className="gx-page-header__row">
                <div>
                    <Title level={2} className="gx-page-header__title">{title}</Title>
                    {subtitle && <Text className="gx-page-header__subtitle">{subtitle}</Text>}
                </div>
                {extra && <Space wrap className="gx-page-header__extra">{extra}</Space>}
            </div>
        </div>
    );
};

export default PageHeader;
