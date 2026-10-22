/**
 * 2.5D 等距投影渲染器
 *
 * 将 3D 世界坐标 (x, y, z) 投影到 2D 屏幕坐标
 * 支持多层地图渲染、深度排序、立体视觉效果
 */
export interface IsoPoint {
    x: number;
    y: number;
}
export interface WorldPoint {
    x: number;
    y: number;
    z: number;
}
/**
 * 等距投影参数
 */
export declare class IsometricConfig {
    /** 画布宽度 */
    canvasWidth: number;
    /** 画布高度 */
    canvasHeight: number;
    /** 等距角度（默认 30°） */
    isoAngle: number;
    /** X/Y 缩放系数 */
    scaleXY: number;
    /** Z 轴缩放（每层高度差） */
    scaleZ: number;
    /** 中心偏移 X */
    offsetX: number;
    /** 中心偏移 Y */
    offsetY: number;
    constructor(canvasWidth: number, canvasHeight: number);
}
/**
 * 等距投影核心函数
 */
export declare class IsometricRenderer {
    private config;
    constructor(config: IsometricConfig);
    /**
     * 3D 世界坐标 → 2D 屏幕坐标
     */
    project(x: number, y: number, z: number): IsoPoint;
    /**
     * 2D 屏幕坐标 → 3D 世界坐标（给定 Z 层）
     */
    unproject(screenX: number, screenY: number, z: number): WorldPoint;
    /**
     * 绘制等距格子（菱形）
     */
    drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, fillColor: string, strokeColor: string, alpha?: number): void;
    /**
     * 绘制等距立方体（用于塔/敌人）
     */
    drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, w: number, h: number, d: number, // 宽高深
    color: string, topColor?: string): void;
    /**
     * 计算深度排序值（用于画家算法）
     */
    depthSortValue(x: number, y: number, z: number): number;
    /**
     * 颜色明暗调整
     */
    private shadeColor;
    /**
     * 绘制射程圈（椭圆投影）
     */
    drawRangeCircle(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, centerZ: number, range: number, color: string, alpha?: number): void;
    /**
     * 绘制路线段
     */
    drawRouteSegment(ctx: CanvasRenderingContext2D, p1: WorldPoint, p2: WorldPoint, color: string, lineWidth?: number, alpha?: number): void;
}
