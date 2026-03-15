import React from 'react';
import { Typography, Space } from 'antd';

const { Title } = Typography;

interface PageHeaderProps {
    title: string;
    extra?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    extra,
}) => {
    return (
        <div className="gx-page-header">
            <div className="gx-page-header__row">
                <Title level={1} className="gx-page-header__title">{title}</Title>
                {extra && <Space wrap className="gx-page-header__extra">{extra}</Space>}
            </div>
        </div>
    );
};

export default PageHeader;
