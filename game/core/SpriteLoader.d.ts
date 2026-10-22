/**
 * 精灵图系统（图片化 + 程序化兜底）
 *
 * 每座塔 / 每种敌人都有独立像素画素材（assets/sprites/*.png）：
 *   - 用户提供素材 → tools/make_sprites.py 切片去背景
 *   - 缺失素材     → tools/derive_sprites.py 从已有素材派生（色相融合/特效叠加）
 * 任何单张图加载失败时，该类型自动回退到程序化矢量绘制，
 * 不会出现"隐形单位"；isLoaded() 只在至少一张图就绪后为 true。
 */
import { TowerType, EnemyType } from '../config/GameConfig.js';
/** 敌人一帧的动画姿态（纯函数，GameManager 也用它来同步阴影） */
export interface EnemyAnim {
    /** 离地高度（正数向上） */
    hop: number;
    /** 横向缩放 */
    sx: number;
    /** 纵向缩放 */
    sy: number;
    /** 横向偏移 */
    sway: number;
    /** 旋转（弧度） */
    lean: number;
    /** 透明度 */
    alpha: number;
    /** 额外抬升（幽灵漂浮） */
    lift: number;
}
/**
 * 由行走相位算出姿态。相位按「真实位移」推进，所以步频天然跟着速度走：
 * 侦察机兵步子密而小跳，重装装甲车一步一顿、落地砸得最扁。
 */
export declare function computeEnemyAnim(type: EnemyType, phase: number, idle?: number): EnemyAnim;
/**
 * 等级档位缩放（Lv1..Lv4 → 1.00 / 1.08 / 1.16 / 1.26）。
 * GameManager 画底座光圈 / 品阶光环 / 等级角标时也用它 ——
 * 保证"塔变大了"和"底座跟着变大"用的是同一个数，不会各算各的。
 */
export declare function towerTierScale(level: number | undefined): number;
/** 返回同一炮口在世界平面中的偏移，供等级特效球与弹道共用。 */
export declare function getTowerMuzzleOffset(type: TowerType, level: number, aim: number, recoil?: number): {
    x: number;
    y: number;
};
/**
 * 塔的**可视顶端**（局部坐标，负值向上，size=40 基准，未乘 size/40）。
 * 档位放大是以底座 (0,15) 为锚的，所以 GameManager 换算成屏幕坐标是
 *   `y + 15 + (localTop - 15) * tierScale`
 * —— 等级角标必须挂在这条线之上，避免贴近 Lv4 炮口的能源核心。
 *
 * ⚠️ 实测包围盒（`tools/.tmp_bbox` 那类扫描，size=40 / aim=0）：11 座塔的机身顶端在
 * 局部 y ≈ -11 ~ -15，**不是**文档里曾写的 -30。改档位造型时必须同步这里。
 */
export declare function towerVisualTop(level: number | undefined): number;
/** 战场防御塔的动画入参（由 GameManager 从 Tower 取，UI 处不需要） */
export interface TowerAnimOpts {
    /** 炮口朝向（弧度） */
    aim?: number;
    /** 后坐强度 0~1 */
    recoil?: number;
    /** 相位种子（用槽位号，避免整场塔同步呼吸） */
    seed?: number;
    /** 过载：整体泛红脉动 */
    overload?: boolean;
    /** 瘫痪：静止发灰 */
    paralyzed?: boolean;
    /** 等级（1..4）：决定档位体量 / 附加装甲 / 辉光强度 */
    level?: number;
}
export declare class SpriteLoader {
    private time;
    private towerImgs;
    private enemyImgs;
    /** 状态染色缓存：key = type|color，避免每帧重算 source-atop */
    private tintCache;
    load(): Promise<void>;
    isLoaded(): boolean;
    /** 已加载数量（验证脚本用） */
    getLoadedCount(): number;
    update(deltaTime: number): void;
    /**
     * 绘制防御塔：优先精灵图，缺失则程序化兜底。
     * anchor='bottom'：精灵坐在 y 上（战场，脚踩底座光圈）
     * anchor='center'：精灵以 y 为中心（召唤卡/拖动预览/信息面板等 UI，与旧行为一致）
     * anim 不传 = idle 自拍（UI 用）；战场由 drawTowerAnim 传 flap/rec 演出攻击动作
     * level 传 1..4 → 按档位放大并叠加装甲（见 TIER_SCALE 注释）。
     *   ⚠️ UI 若受版面尺寸约束，传 `size / towerTierScale(level)` 把外框钉住，
     *   这样"看得见档位装甲"但不会撑破卡片（信息面板标题栏就是这么用的）。
     */
    drawTower(ctx: CanvasRenderingContext2D, x: number, y: number, type: TowerType, size?: number, anchor?: 'bottom' | 'center', anim?: {
        flap: number;
        rec: number;
        aim?: number;
    }, level?: number): void;
    /**
     * 战场防御塔：赛博炮塔造型 + 全套动作反馈。
     *
     * 动作分层（这是「不像贴图」的关键，全部由时间与攻击事件驱动）：
     *   · idle   —— 机体轻微呼吸浮动 + 极缓摇摆（伺服机构在微调，不是站桩）
     *   · 瞄准   —— 炮塔头绕云台旋转到目标方向（机体主体保持直立，只有"朝目标的部分"转）
     *   · 开火   —— 后坐抖动 + 挤压拉伸 + 炮口冲击波弧 + 逐塔特色（转管/电弧/火舌/磁场环…）
     *   · 过载   —— 整机泛红脉动；瘫痪 —— 静止发灰
     *
     * UI 各处（召唤卡/信息面板）仍用 drawTower 的 idle 版本，不动。
     */
    drawTowerAnim(ctx: CanvasRenderingContext2D, x: number, y: number, type: TowerType, size?: number, opts?: TowerAnimOpts): void;
    private drawTowerFlourish;
    /**
     * 绘制敌人：精灵图 + 动画循环（挤压拉伸 / 跳跃 / 摇摆 / 倾斜）。
     * anim 不传时退化为"按时间自走"的 idle（召唤廊、面板等处用）。
     * tint 为状态色（中毒/燃烧/冻结）时输出预染色版本。
     * levelIndex 用于关卡变体外观（每关小怪样子不一样）。
     */
    drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, type: EnemyType, size?: number, tint?: string, anim?: EnemyAnim, levelIndex?: number): void;
    /** 状态染色：离屏 canvas 上 source-atop 上色，只染精灵本体不染背景 */
    private tinted;
    /**
     * 程序化绘制防守单位（赛博防线的武装化机械）。
     *
     * 造型 = 医院器械：金属底座 + 闪烁红色警戒灯 + 锈蚀/血渍 + 器械本体。
     * **为什么不用 PNG 贴图**：单帧图再精致也是"贴纸"——警戒灯不闪、器械不转、
     * 开火不后坐，玩家一眼就觉得死。程序化绘制后，瞄准转向 / 开火后坐 / 警戒灯脉冲
     * 全部由时间与攻击事件演出，"它是活的"不再依赖素材帧数。
     *
     * 局部坐标系：原点 = 塔心，y 向下为正；底座落在 +15，器械顶约 -30。
     * 以 size = 40 为基准作图，缩放由调用方 `scale(size/40)` 统一处理。
     *
     * @param anim.rec 攻击强度 0..1（器械前推 + 枪口/光束增亮）
     * @param anim.aim 瞄准角（朝目标；不传 = 朝右，召唤卡/面板用）
     */
    private drawTowerProcedural;
    /**
     * 档位地面辉光：塔脚下的主题色光斑 + 向外扩张的能量环。
     * Lv1 完全不画（否则满场都是光斑，反而没有"谁更强"的对比）。
     * 用 `lighter` 叠加，所以不会把地砖压黑，只加亮。
     */
    private drawTierGroundGlow;
    /**
     * 顶级专属：向外扩张的能量脉冲波（radar ping）。**Lv4+**。
     *
     * 这是用户点名要的"脉冲式的光特效"。它与已有的两层都不同：
     *   · drawTierGroundGlow —— 静态光斑 + 呼吸圈（不传播）
     *   · drawTierCrest       —— 随炮口移动的高阶能量核心
     *   · drawTierPulse（本函数）—— 三段错相的**地面传播波**持续外扩，
     *     配合塔顶能量轨道，远处也能读出"满级正在供能"。
     *
     * 铁律遵守：
     *   · 纯 `this.time` 驱动（三环错相、周期 1.35s → 连绵不断），
     *     **不用 Math.random** —— 像素断言才能稳定复现。
     *   · `lighter` 只加亮、不把地砖压黑；贴地椭圆读作"沿地面扩散"。
     *   · 只进表现层，**不碰伤害与 DPS**。
     */
    private drawTierPulse;
    /**
     * 档位附加装甲：把外轮廓逐档撑开（剪影宽度是 40px 下最可读的"变强"信号）。
     *
     *   局部半宽：底座 ±15 → Lv2 侧裙 ±19.5 → Lv3 肩甲尖刺 ±21 → Lv4 稳定腿
     * 叠上 TIER_SCALE 后，战场上的实际宽度约 30 → 42 → 49 → 53px。
     * 塔位最小间距 78px、离路径最小 46px，所以最宽的 Lv4 也不会串座或压到通道。
     */
    private drawTierArmor;
    /**
     * 档位徽记：只给 Lv4（决战形态）—— 炮口能源核心 + 旋转轨道脉冲 + 粒子束。
     *
     * 设计取舍：最初画的是两个绕塔心旋转的大椭圆环（"原子轨道"），3× 放大图上很帅，
     * **但缩到实机 40px 就变成一团乱线**，横穿炮管把剪影彻底糊掉。
     * 核心锚定在器械炮口，并随瞄准方向移动，
     * 且"塔顶多了一样东西"在 40px 下是最容易读出来的变化（外轮廓增加而非内部加细节）。
     *
     * 用确定性相位（`sin/cos(t)`），**不用 `Math.random()`** —— 像素断言才稳定。
     */
    private drawTierCrest;
    /**
     * 通用机械基座：切角装甲板 + 液压杆 + 黄黑警戒斜纹 + 主题色能量环 + 六角螺栓。
     * 造型语言对齐 PRD「赛博机械」：**硬边棱角 + 霓虹发光缝 + 工业警示色**，
     * 不要画回圆润的医疗设备（那是被否掉的一版）。
     */
    private drawDeviceBase;
    /** 红色警戒灯：基座前缘的小灯，脉冲发光（开火时更亮），画在所有器械之上 */
    private drawWarnLight;
    /**
     * 11 件赛博机械武器。基座直立不动，武器头绕 (0, PIV) 按 aim 旋转朝目标。
     * 造型语言：暗金属棱角机身 + 主题色能量核心/能量条 + 开火能量团。
     * 其中 4 件对齐 PRD 的原型：激光炮台(LASER) / EMP 塔(ELECTRIC) /
     * 导弹发射器(BOMB) / 无人机塔(ANESTHESIA，悬浮无人机 + 束缚场)。
     */
    private drawDevice;
    /** "#rrggbb" → [r,g,b] */
    private hexRgb;
    /** 两色线性混合（t=0 取 a、1 取 b） */
    private mixRgb;
    private rgbaStr;
    /**
     * 程序化敌人绘制：机械军团。
     *
     * 造型语言与防御塔共用同一套赛博机械语汇：
     *   暗金属装甲（MECH_DARK / MID / HI）+ 各兵种主题色发光镜头与能量缝 + 红色警示灯；
     *   履带滚动、旋翼旋转、警示灯闪烁、核心扫视全部由 this.time 演出 ——
     *   「机械在运转」不再依赖素材帧数（单帧 PNG 做不到，所以 ENEMY_SPRITE 已置空）。
     *
     * 局部坐标系：原点 = 身体中心，y 向下；脚底落在局部 +16 处，
     * 与 renderEnemies() 的阴影锚点（y + 半径 + 2）对齐。
     * 以 size = 40 为基准作图，缩放由外层 scale(size/40) 统一处理。
     */
    private drawEnemyProcedural;
    /**
     * 根据关卡索引获取机械装甲色调（每关小怪样子不一样）
     * 10个关卡对应10种不同的装甲色调
     */
    private getMechColorsForLevel;
    /**
     * 机械光学镜头：金属环 + 主题色发光芯 + 高光点。
     * 所有机兵的「眼睛」都用它，保证"谁在看我"有一致的视觉语言。
     */
    private drawLens;
    /**
     * 纳米虫群：矮胖的六足侦察机体。
     * 剪影 = 圆角机体 + 横贯的主题色扫描缝 + 下方四足。
     */
    private drawNormalEnemy;
    /**
     * 侦察机兵：高速俯冲的箭形侦察机。
     * 剪影 = 前掠尖锥 + 后掠翼 + 尾鳍，尾部拖出速度线。
     */
    private drawFastEnemy;
    /**
     * 重装装甲车：履带式重装甲载具。
     * 剪影 = 方正车体 + 左右履带（齿纹滚动）+ 炮塔与炮管。
     */
    private drawHeavyEnemy;
    /**
     * 分裂孢子机：三段式裂变舱。
     * 剪影 = 圆舱 + 两条纵向能量缝 —— 死亡裂成 3 段，剪影提前把机制说清楚。
     */
    private drawSplitEnemy;
    /**
     * 修复无人机：悬停四旋翼维修机。
     * 剪影 = 十字机身 + 四个旋转桨盘 + 底部主题色维修光束。
     */
    private drawHealerEnemy;
    /**
     * 微型机虫：分裂残片，最小的单眼三足机。
     */
    private drawMiniEnemy;
    /**
     * 相位隐形机：无翼棱锥隐形机。
     * 剪影 = 尖锐的三角楔形 + 断续的棱边（表达"相位不稳定"）。
     */
    private drawGhostEnemy;
    /**
     * 护盾机兵：正面举盾的步兵机。
     * 剪影 = 宽肩机体 + 身前六边盾（主题色描边 = 护盾量）。
     */
    private drawShieldEnemy;
    /**
     * 自爆机雷：布满尖刺的浮游机雷。
     * 剪影 = 球形弹体 + 8 根尖刺 + 急促闪烁的红芯
     * （警告玩家"别让它死在你的塔旁边"）。
     */
    private drawBomberEnemy;
    /**
     * 10种关卡 Boss，每种都有独特外观：
     * - 机械统领（红）：基础重型机体
     * - 要塞核心（青）：装甲加厚，双联炮管
     * - 机械神谕（紫）：能量翼展，神秘感
     * - 风暴使者（青绿）：旋翼结构，速度感
     * - 幻影猎手（淡紫）：棱形机身，隐形感
     * - 泰坦巨像（橙）：超大型，厚重装甲
     * - 剧毒领主（绿）：毒液罐，生化感
     * - 炼狱魔王（红粉）：火焰喷射，狂暴感
     * - 寒冰女皇（蓝）：冰晶结构，优雅感
     * - 终极欧米伽（金）：最终形态，全装甲
     */
    private drawBossEnemy;
    /** 基础 Boss 外观：机械统领/要塞核心/机械神谕 */
    private drawBossBase;
    /** 机械统领：指挥官造型，带有战术指挥感 */
    private drawBossCommander;
    /** 要塞核心：能量球体，防御感 */
    private drawBossWarden;
    /** 机械神谕：神秘先知造型，带有预言感 */
    private drawBossNightmare;
    /** 风暴使者：旋翼结构，速度感 */
    private drawBossStorm;
    /** 幻影猎手：棱形机身，隐形感 */
    private drawBossPhantom;
    /** 泰坦巨像：超大型，厚重装甲 */
    private drawBossTitan;
    /** 剧毒领主：毒液罐，生化感 */
    private drawBossVenom;
    /** 炼狱魔王：火焰喷射，狂暴感 */
    private drawBossInferno;
    /** 寒冰女皇：冰晶结构，优雅感 */
    private drawBossFrost;
    /** 终极欧米伽：最终形态，全装甲 */
    private drawBossOmega;
    getTowerSprite(type: TowerType): HTMLImageElement | null;
    getEnemySprite(type: EnemyType): HTMLImageElement | null;
}
