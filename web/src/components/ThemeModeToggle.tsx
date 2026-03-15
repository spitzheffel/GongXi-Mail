import React from 'react';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useThemeMode } from '../theme';

interface ThemeModeToggleProps {
    compact?: boolean;
    className?: string;
}

const ThemeModeToggle: React.FC<ThemeModeToggleProps> = ({
    compact = false,
    className = '',
}) => {
    const { isDark, toggleTheme } = useThemeMode();
    const nextModeLabel = isDark ? '切换浅色' : '切换暗色';
    const classes = ['gx-theme-toggle', compact ? 'is-compact' : '', className]
        .filter(Boolean)
        .join(' ');

    return (
        <Button
            type="text"
            className={classes}
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            aria-label={nextModeLabel}
        >
            {!compact && nextModeLabel}
        </Button>
    );
};

export default ThemeModeToggle;
