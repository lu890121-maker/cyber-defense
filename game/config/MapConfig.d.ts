/**
 * 九关地图拓扑 —— 唯一事实来源。
 *
 * ⚠️ 为什么单独一个文件、而不是写进 `LEVELS[i].path`：
 * `GameConfig.ts` 末尾的 `for (const level of LEVELS)` 会用生成器**整体覆盖**
 * `level.routes / level.path / level.slots / level.waves`。也就是说
 * `LEVELS[3].path = [...]` 这种手写字面量是**死数据**，改了没有任何效果。
 * 真正的地图入口只有这里 —— `GameConfig` 从这个表读取 routes，再交给
 * `makeExtraSlots()` 生成塔位。想改地图就改这个文件，改完必须重跑
 * `node tools/analyze_level.mjs` 校验塔位覆盖率。
 *
 * ── 坐标系 ────────────────────────────────────────────────────
 * 画布 450 × 800（竖屏）。可玩区域约 x∈[45,405]、y∈[126,638]：
 *   · y < 120 被顶部 HUD 占用，入口必须从 y ≥ 126 起
 *   · y > 640 是底部操作栏（召唤/卖出区），核心放在 638 左右
 *   · L5「蛛网阵中」是例外：核心居中 (225,380)，四角出怪（见 allowUpward）
 *
 * ── 三条硬约束（`tools/analyze_level.mjs` 会逐条校验）────────────
 *   1. **纵向不可回退**：每条路线每一段都必须 `b.y >= a.y`
 *      （敌人只会"往下推"）。`allowUpward: true` 的关卡豁免此条。
 *   2. **同一条路线内不许重走同一段路**（无向边去重）。
 *   3. **入口 y ≥ 126**；普通关所有路线终点必须落在 `core` 上。
 *
 * ── 传送门（两种，互斥使用）──────────────────────────────────
 * A. 旧式定点折叠（route.warps）：`warps:[3]` = points[3]→points[4] 瞬移。
 * B. 随机传送门网络（level.portals，L6/L7/L8 使用）：
 *    每条 route 的**最后一个点即入口门坐标**；敌人走到路线终点时，
 *    从**其余门中随机选一个**跳出，把自身 path 换成该门的 `outgoing`
 *    （outgoing[0] = 门自身位置，终点 = core）。门关卡不再写 warps。
 *    可行走集合 = routes + 所有 outgoing（塔位生成/覆盖率/渲染同口径）。
 */
export interface MapPoint {
    x: number;
    y: number;
}
export interface MapRoute {
    points: MapPoint[];
    /** 旧式定点折叠：段 i = points[i] → points[i+1] 为瞬移，不绘制路面 */
    warps?: number[];
}
/** 随机传送门网络的节点。outgoing 是「从这张门出来后通往核心的路」 */
export interface PortalNode {
    id: string;
    label: string;
    color: string;
    x: number;
    y: number;
    outgoing: MapPoint[];
}
/** 迷雾区：矩形内的敌人无法被防御塔锁定/攻击（L8） */
export interface FogZone {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface LevelMap {
    /** 关卡 id（1 起） */
    id: number;
    /** 所有路线必须汇合到的核心位置 */
    core: MapPoint;
    /** 机制标签：关卡开场提示用，也方便一眼看出这张图的玩法差异 */
    mechanics: string[];
    /** 进攻路线；数量 = 入口数。传送门关卡：末点 = 入口门 */
    routes: MapRoute[];
    /**
     * 双人合作模式的路线（可选）。
     *
     * 只有"入口数 < 2"的关卡才需要它 —— 双人玩法要求至少两个出怪口，
     * 而 L1 是单入口教学图，直接沿用会让两个玩家抢同一条路，失去合作意义。
     * 单人模式**永远走 `routes`**，这里的数据不会影响原有平衡。
     */
    coopRoutes?: MapRoute[];
    /** 随机传送门网络（L6/L7/L8） */
    portals?: PortalNode[];
    /** 迷雾禁区（L8） */
    fogZones?: FogZone[];
    /** 允许路线向上走（仅 L5 中心核心放射图；analyze 的无回退检查豁免） */
    allowUpward?: boolean;
}
/**
 * 九关拓扑。
 *
 * 难度节奏与地图是**两件事**：难度由 `LEVEL_DIFFICULTY_MULTIPLIERS` +
 * `LEVEL_TROOP_TUNING` 控制，这里只管"敌人从哪来、走什么形状"。
 */
export declare const LEVEL_MAPS: LevelMap[];
/** 按关卡 id 取地图定义（越界钳制，避免调用方拿到 undefined） */
export declare function getLevelMap(levelId: number): LevelMap;
