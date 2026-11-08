/**
 * 环境渲染器：Q版赛博朋克分层场景
 *
 * Q版改造方向：
 *   - 更柔和的深蓝紫渐变背景（不是纯黑）
 *   - 更圆润可爱的建筑物（圆角机柜、圆润茧舱）
 *   - 增强立体感（柔和阴影、高光、渐变）
 *   - 发光植物等可爱环境元素
 *   - 减少工业粗粝感，增加风格化
 *
 * 分层架构不变：
 *   L0 地面基色     —— 关卡主题色系的地面渐变
 *   L1 赛博网格     —— 40px 网格 + 每 5 格亮线 + 交点光点
 *   L2 地面贴花     —— 发光花纹、数据流、能量池
 *   L3 边缘陈设     —— 圆润机柜 / 可爱茧舱 / 风格化反应堆
 *   ── 以上烘焙进离屏 canvas，按关卡缓存，每帧只 blit ──
 *   L4 动态光效     —— 顶灯光池、氛围粒子（每帧绘制）
 */
interface EnvPalette {
    key: string;
    /** 地面基色渐变（上 → 中 → 下）—— Q版：更柔和的深蓝紫 */
    floorTop: string;
    floorMid: string;
    floorBot: string;
    /** 网格线 */
    grid: string;
    gridMajor: string;
    gridNode: string;
    /** 顶部结构带 */
    wallTop: string;
    wallBot: string;
    /** 陈设主色 / 暗部 —— Q版：更饱和 */
    prop: string;
    propDark: string;
    /** Q版新增：陈设高光色 */
    propHighlight: string;
    /** 陈设描边（霓虹边缘） */
    rim: string;
    /** 主霓虹色 */
    neon: string;
    /** 顶灯颜色 */
    lamp: string;
    /** 光池中心色 */
    pool: string;
    /** 大气雾色 */
    haze: string;
    /** 泄漏液颜色 */
    spill: string;
    /** 氛围粒子 */
    motes: 'dust' | 'spark' | 'ember';
}
export declare function paletteFor(levelKey: string): EnvPalette;
/** 关卡 id → 主题 key */
export declare function levelKeyOf(id: number): string;
export declare class EnvironmentRenderer {
    private canvas;
    private ctx;
    private time;
    /** 烘焙缓存 */
    private floorLayer;
    private propLayer;
    private builtKey;
    private builtAccent;
    private lamps;
    private motes;
    private rng;
    constructor(canvas: HTMLCanvasElement);
    update(deltaTime: number): void;
    invalidate(): void;
    renderBackdrop(levelKey: string, accent: string): void;
    /**
     * 前景层：顶灯、光锥、氛围粒子
     * Q版：更柔和的光效，粒子更圆润可爱
     */
    renderOverlay(): void;
    private build;
    private offscreen;
    private paintFloor;
    /** Q版：圆润的发光井盖 */
    private paintHatch;
    private paintArrow;
    /** Q版：能量池（代替泄漏液，更可爱的发光效果） */
    private paintEnergyPool;
    private paintProps;
    /** Q版：圆润的服务器机柜（带高光和阴影） */
    private paintRack;
    /** Q版：可爱的机械茧舱（更圆润，带高光） */
    private paintPod;
    /** Q版：可爱的悬垂电缆 */
    private paintCable;
    /** Q版：风格化的反应堆柱（更圆润，带高光） */
    private paintReactorColumn;
    /** Q版：圆润的冷却管 */
    private paintCoolantPipe;
    /** Q版：可爱的全息导视牌 */
    private paintHoloSign;
    /** Q版：圆润的机械臂残骸 */
    private paintMechArm;
    /** Q版：可爱的监控屏 */
    private paintMonitor;
    private layoutLamps;
    private seedMotes;
    private respawnMote;
    private rr;
}
/** 供外部取主题霓虹色 */
export declare function levelNeon(levelKey: string): string;
/** 供外部把十六进制色转成 [r,g,b] */
export declare function rgbTriple(hex: string): [number, number, number];
export {};
