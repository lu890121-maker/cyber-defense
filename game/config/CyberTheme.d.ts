/**
 * 赛博主题：全局配色 / UI 样式单一事实来源
 *
 * 《赛博防线：机械入侵》重构后的视觉规范集中在这里。
 * 之前配色散落在 GameManager / EnvironmentRenderer / TechnicalArtRenderer 三处，
 * 每改一次主题要翻四个文件、还容易漏 —— 现在所有新代码只准从这里取色。
 *
 * 规范（PRD）：
 *   背景 #0B0E14 · 路径 #12131C · 青 #00F0FF · 紫 #9D00FF · 黄 #FFD700 · 红 #FF0033
 *   UI 面板 = 暗色半透明 + 1px 青色描边；按钮 = 切角（右上 / 左下切掉）
 *   地面 = 40px 赛博网格
 *
 * ⚠️ 稀有度四色必须保持「灰 / 蓝(青) / 紫 / 金(黄)」的色相分离：
 *    tools/verify_hud.mjs 的 hueOk() 用「墨减纸」差分验色相方向
 *    （N 低饱和 / R 蓝通道最高 / SR 蓝最高且红次之 / SSR 红通道最高）。
 *    青色满足 R（b 远大于 r），金色满足 SSR（r 远大于 b），所以这套映射天然兼容。
 */
export declare const CYBER: {
    readonly bgDeep: "#05070C";
    readonly bgBase: "#0B0E14";
    readonly bgPath: "#12131C";
    readonly bgPanel: "#12131C";
    readonly bgRaised: "#171A26";
    readonly cyan: "#00F0FF";
    readonly purple: "#9D00FF";
    readonly gold: "#FFD700";
    readonly red: "#FF0033";
    /** 辅助：生体/纳米绿、警示橙 */
    readonly green: "#39FF88";
    readonly orange: "#FF8A1F";
    readonly textHi: "#E8F6FF";
    readonly textMid: "#8FA3BF";
    readonly textLow: "#5A6B85";
    /** 小格线（40px） */
    readonly grid: "rgba(0, 240, 255, 0.055)";
    /** 大格线（每 5 小格 = 200px） */
    readonly gridMajor: "rgba(0, 240, 255, 0.13)";
    /** 网格交点光点 */
    readonly gridNode: "rgba(0, 240, 255, 0.30)";
    readonly gridSize: 40;
    readonly panelFill: "rgba(9, 12, 19, 0.90)";
    readonly panelFillSoft: "rgba(9, 12, 19, 0.72)";
    readonly panelBorder: "rgba(0, 240, 255, 0.45)";
    readonly panelBorderDim: "rgba(0, 240, 255, 0.16)";
    readonly ok: "#4ade80";
    readonly warn: "#FFD700";
    readonly danger: "#FF0033";
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
 * 切角矩形路径：右上 / 左下切掉一个直角，这是赛博 UI 的标准按钮形状。
 * 只建路径不填充，调用方自己 fill / stroke / clip。
 */
export declare function cutRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut?: number): void;
/** 四角都切（八边形）—— 用于「框架」类元素 */
export declare function octRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut?: number): void;
/** 切角面板：暗底 + 1px 霓虹描边（可选外发光） */
export declare function cutPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts?: {
    fill?: string;
    border?: string;
    cut?: number;
    glow?: number;
}): void;
/**
 * 赛博网格：40px 小格 + 每 5 格一条亮线 + 交点光点。
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
/** 霓虹文字：先铺一层发光再写字 */
export declare function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, opts?: {
    blur?: number;
    font?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
}): void;
/** 六边形路径（塔位 / 节点用） */
export declare function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot?: number): void;
/** 扫描线（后处理用）：每 3px 一条极淡暗线 */
export declare function paintScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, alpha?: number): void;
