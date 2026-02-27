// 允许在 React style 中使用 CSS 自定义属性（--开头）
import 'react';
declare module 'react' {
    interface CSSProperties {
        [key: `--${string}`]: string | number | undefined;
    }
}
