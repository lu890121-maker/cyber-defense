/**
 * 环境渲染器：分层赛博防线场景
 *
 * 《赛博防线：机械入侵》的地面。原版是「分层医院场景」（地砖 + 病床 + 输液架），
 * 现在换成赛博工业场景，但分层架构不变：
 *
 *   L0 地面基色     —— 关卡主题色系的地面渐变（俯视）
 *   L1 赛博网格     —— 40px 网格 + 每 5 格亮线 + 交点光点（PRD 硬性规范）
 *   L2 地面贴花     —— 警戒带、数据流箭头、泄漏液、烧灼痕、数据碎片
 *   L3 边缘陈设     —— 服务器机柜 / 机械茧舱 / 反应堆柱（贴屏幕边缘，不压路径）
 *   ── 以上烘焙进离屏 canvas，按关卡缓存，每帧只 blit ──
 *   L4 动态光效     —— 顶灯光池闪烁、光锥、尘埃、电火花（每帧绘制）
 *
 * 三关主题（对齐 LEVELS.accent）：
 *   外环防线   青 #00F0FF  数据中心外围：机柜阵列、全息导视、电缆桥架
 *   机械巢穴   紫 #9D00FF  地下机库：机械茧舱、悬垂电缆、机械臂残骸
 *   核心反应堆 红 #FF0033  主控中枢：反应堆柱、冷却管、监控屏
 */
interface EnvPalette {
    key: string;
    /** 地面基色渐变（上 → 中 → 下） */
    floorTop: string;
    floorMid: string;
    floorBot: string;
    /** 网格线（小格 / 大格 / 交点） */
    grid: string;
    gridMajor: string;
    gridNode: string;
    /** 顶部结构带（屏幕最上沿的机库顶棚 / 墙体） */
    wallTop: string;
    wallBot: string;
    /** 陈设主色 / 暗部 */
    prop: string;
    propDark: string;
    /** 陈设描边（霓虹边缘） */
    rim: string;
    /** 主霓虹色（十六进制，供 rgba() 用） */
    neon: string;
    /** 顶灯颜色 */
    lamp: string;
    /** 光池中心色（rgba 前缀，末尾接 alpha） */
    pool: string;
    /** 大气雾色 */
    haze: string;
    /** 泄漏液颜色（机油 / 能量液） */
    spill: string;
    /** 氛围粒子：'dust' | 'spark' | 'ember' */
    motes: 'dust' | 'spark' | 'ember';
}
export declare function paletteFor(levelKey: string): EnvPalette;
/** 关卡 id → 主题 key（1 外环防线 / 2 机械巢穴 / 3 核心反应堆） */
export declare function levelKeyOf(id: number): string;
export declare class EnvironmentRenderer {
    private canvas;
    private ctx;
    private time;
    /** 烘焙缓存：key = 关卡 key */
    private floorLayer;
    private propLayer;
    private builtKey;
    private builtAccent;
    private lamps;
    private motes;
    private rng;
    constructor(canvas: HTMLCanvasElement);
    update(deltaTime: number): void;
    /** 关卡切换时重置缓存（GameManager 在 startLevel 里调） */
    invalidate(): void;
    renderBackdrop(levelKey: string, accent: string): void;
    /**
     * 前景层：顶灯、光锥、氛围粒子。
     * 在世界层（塔/怪/特效）之后、后处理之前调用 —— 光池压在单位上才有"顶灯照下来"的感觉，
     * 但透明度必须很低，否则会糊住血条和伤害数字。
     */
    renderOverlay(): void;
    private build;
    private offscreen;
    private paintFloor;
    /** 检修井盖（六边形，替代原排水口） */
    private paintHatch;
    private paintArrow;
    /** 泄漏液：深色机油底 + 主题色反光边 */
    private paintSpill;
    private paintProps;
    /** 服务器机柜（俯视：柜体 + 散热格栅 + 状态灯） */
    private paintRack;
    /** 机械茧舱（俯视：舱体 + 培养窗 + 顶部接口） */
    private paintPod;
    /** 悬垂电缆（俯视：多股线束 + 束线夹） */
    private paintCable;
    /** 反应堆柱（俯视：柱体 + 中心辉光 + 冷却环） */
    private paintReactorColumn;
    /** 冷却管（俯视：管体 + 法兰 + 液位窗） */
    private paintCoolantPipe;
    /** 全息导视牌（外环防线） */
    private paintHoloSign;
    /** 机械臂残骸（机械巢穴） */
    private paintMechArm;
    /** 监控屏（核心反应堆）：屏 + 波形 */
    private paintMonitor;
    private layoutLamps;
    private seedMotes;
    private respawnMote;
    private rr;
}
/** 供外部（如 HUD）取主题霓虹色的便捷出口 */
export declare function levelNeon(levelKey: string): string;
/** 供外部把十六进制色转成 [r,g,b]（避免各处重复实现） */
export declare function rgbTriple(hex: string): [number, number, number];
export {};
