/**
 * 多维空间塔防 — 配置与数据类型定义
 *
 * 支持 Z 轴（高度层）、W 轴（维度折叠）、T 轴（时间相位）
 */
export declare enum HeightLayer {
    UNDERGROUND = -1,
    GROUND = 0,
    AIR = 1
}
export declare const LAYER_NAMES: Record<HeightLayer, string>;
export declare const LAYER_COLORS: Record<HeightLayer, string>;
export declare enum TargetHeight {
    GROUND_ONLY = "ground",// 只对地
    AIR_ONLY = "air",// 只对空
    ALL = "all"
}
export interface MultiMapPoint {
    x: number;
    y: number;
    z: HeightLayer;
}
export interface MultiMapRoute {
    points: MultiMapPoint[];
    /** 传送门段号 */
    warps?: number[];
    /** 速度倍率（内层加速等） */
    speedMult?: number;
}
export interface TowerSlot3D {
    x: number;
    y: number;
    z: HeightLayer;
}
export interface MultiLevelMap {
    id: number;
    core: MultiMapPoint;
    mechanics: string[];
    routes: MultiMapRoute[];
    slots: TowerSlot3D[];
    /** 折叠线配置 */
    foldLines?: FoldLine[];
    /** 时间相位配置 */
    timePhases?: TimePhase[];
    /** 拓扑类型 */
    topology?: 'normal' | 'mobius' | 'tesseract';
}
export interface FoldLine {
    y: number;
    active: boolean;
    foldFactor: number;
    cycleDuration: number;
}
export interface TimePhase {
    id: 'alpha' | 'beta';
    activeRoutes: number[];
    duration: number;
}
export interface MultiTowerConfig {
    type: string;
    name: string;
    cost: number;
    range: number;
    damage: number;
    fireRate: number;
    color: string;
    height: number;
    targetHeight: TargetHeight;
    projectileSpeed: number;
    /** 特殊效果 */
    isSlow?: boolean;
    slowFactor?: number;
    isDimensionLock?: boolean;
    isCrossLayer?: boolean;
}
export declare const MULTI_TOWER_CONFIGS: MultiTowerConfig[];
export interface MultiEnemyConfig {
    type: string;
    name: string;
    hp: number;
    speed: number;
    reward: number;
    color: string;
    defaultLayer: HeightLayer;
    size: number;
    /** 特殊能力 */
    canFly?: boolean;
    canBurrow?: boolean;
    canPhaseShift?: boolean;
    isBoss?: boolean;
}
export declare const MULTI_ENEMY_CONFIGS: MultiEnemyConfig[];
export declare const MULTI_LEVEL_MAPS: MultiLevelMap[];
export interface WaveGroup {
    type: string;
    count: number;
}
export declare const MULTI_WAVES: WaveGroup[][];
