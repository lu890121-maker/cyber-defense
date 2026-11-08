/**
 * Q版赛博主题：全局配色 / UI 样式单一事实来源
 *
 * 《赛博防线：机械入侵》Q版改造后的视觉规范集中在这里。
 * 改造方向：更可爱、更鲜艳、更立体，减少工业粗粝感。
 *
 * 规范（Q版赛博朋克）：
 *   背景 深蓝紫渐变（不是纯黑）· 路径 柔和暗紫 · 青 #33FFFF · 紫 #CC66FF · 黄 #FFE44D · 红 #FF4466
 *   粉彩辅助色：#FFB3D9（粉）· #B3E6FF（淡蓝）· #C9FFB3（淡绿）
 *   UI 面板 = 暗色半透明 + 圆角描边；按钮 = 圆角矩形（代替切角）
 *   地面 = 40px 赛博网格（更柔和）
 *
 * ⚠️ 稀有度四色必须保持「灰 / 蓝(青) / 紫 / 金(黄)」的色相分离。
 */
export declare const CYBER: {
    readonly bgDeep: "#0A0818";
    readonly bgBase: "#12102A";
    readonly bgPath: "#1A1535";
    readonly bgPanel: "#1A1535";
    readonly bgRaised: "#221D42";
    readonly cyan: "#33FFFF";
    readonly purple: "#CC66FF";
    readonly gold: "#FFE44D";
    readonly red: "#FF4466";
    /** 辅助：生体/纳米绿、警示橙 */
    readonly green: "#66FFAA";
    readonly orange: "#FFAA44";
    readonly pink: "#FFB3D9";
    readonly skyBlue: "#B3E6FF";
    readonly mintGreen: "#C9FFB3";
    readonly lavender: "#D9B3FF";
    readonly textHi: "#F0F8FF";
    readonly textMid: "#A8BDD9";
    readonly textLow: "#6B7FA0";
    /** 小格线（40px） */
    readonly grid: "rgba(51, 255, 255, 0.045)";
    /** 大格线（每 5 小格 = 200px） */
    readonly gridMajor: "rgba(51, 255, 255, 0.11)";
    /** 网格交点光点（更大更圆） */
    readonly gridNode: "rgba(51, 255, 255, 0.28)";
    readonly gridSize: 40;
    readonly panelFill: "rgba(18, 16, 42, 0.92)";
    readonly panelFillSoft: "rgba(18, 16, 42, 0.75)";
    readonly panelBorder: "rgba(51, 255, 255, 0.50)";
    readonly panelBorderDim: "rgba(51, 255, 255, 0.18)";
    readonly ok: "#66FFAA";
    readonly warn: "#FFE44D";
    readonly danger: "#FF4466";
    /** 默认按钮圆角 */
    readonly buttonRadius: 14;
    /** 面板圆角 */
    readonly panelRadius: 16;
    /** 小元素圆角 */
    readonly smallRadius: 8;
};
/** '#rrggbb' / '#rgb' → [r, g, b]；非法输入回退白色 */
export declare function hexRgb(hex: string): [number, number, number];
/** 十六进制 → rgba() 字符串 */
export declare function rgba(hex: string, a: number): string;
/** 线性混合两色，t=0 → a，t=1 → b */
export declare function mixHex(a: string, b: string, t: number): string;
/** 往白色方向提亮 */
export declare function lightenHex(hex: string, t: number): string;
/** 往黑色方向压暗 */
export declare function darkenHex(hex: string, t: number): string;
/**
 * 圆角矩形路径：Q版标准按钮形状，替代原来的切角矩形。
 * 只建路径不填充，调用方自己 fill / stroke / clip。
 */
export declare function cutRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut?: number): void;
/** 圆角矩形面板 —— 用于「框架」类元素（Q版：全圆角代替八边形） */
export declare function octRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut?: number): void;
/** 圆角面板：暗底 + 圆角描边 + 柔和外发光（Q版） */
export declare function cutPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts?: {
    fill?: string;
    border?: string;
    cut?: number;
    glow?: number;
}): void;
/**
 * Q版赛博网格：40px 小格 + 每 5 格一条亮线 + 交点光点（更圆润）。
 * 只画网格线，底色由调用方铺好。
 */
export declare function paintCyberGrid(ctx: CanvasRenderingContext2D, w: number, h: number, opts?: {
    size?: number;
    major?: number;
    minorColor?: string;
    majorColor?: string;
    nodeColor?: string;
    nodeRadius?: number;
}): void;
/** 霓虹文字：先铺一层发光再写字（Q版：更柔和的发光） */
export declare function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, opts?: {
    blur?: number;
    font?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
}): void;
/** 六边形路径（塔位 / 节点用）—— Q版：更圆润的六角 */
export declare function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot?: number): void;
/** 扫描线（后处理用）：Q版更轻柔，每 4px 一条极淡线 */
export declare function paintScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, alpha?: number): void;
