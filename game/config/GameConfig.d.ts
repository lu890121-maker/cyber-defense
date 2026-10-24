/**
 * 游戏配置数据
 * 所有游戏参数集中在此配置
 */
import { getLevelMap } from './MapConfig.js';
export { getLevelMap };
export declare const GAME_CONSTANTS: {
    CANVAS_WIDTH: number;
    CANVAS_HEIGHT: number;
    GAME_AREA_TOP: number;
    GAME_AREA_BOTTOM: number;
    GRID_SIZE: number;
    GRID_COLS: number;
    GRID_ROWS: number;
    INITIAL_GOLD: number;
    INITIAL_LIVES: number;
    GAME_SPEED: {
        NORMAL: number;
        FAST: number;
    };
};
export declare enum Rarity {
    N = "N",// 普通
    R = "R",// 稀有
    SR = "SR",// 超稀有
    SSR = "SSR"
}
export interface RarityConfig {
    key: Rarity;
    name: string;
    /** 卡面主色 / 场上光环色 */
    color: string;
    /** 星级，用于卡面与防御塔角标 */
    stars: number;
    /** 抽卡权重（相对值，不必归一化） */
    weight: number;
    /** 伤害乘数 */
    dmgMult: number;
    /** 射程绝对加成（px） */
    rangeBonus: number;
    /** 攻击间隔乘数（<1 表示更快） */
    intervalMult: number;
    /** 售出价乘数 */
    sellMult: number;
}
export declare const RARITY_CONFIGS: Record<Rarity, RarityConfig>;
/** 由低到高 */
export declare const RARITY_ORDER: Rarity[];
export declare function rarityIndex(r: Rarity): number;
/** 取两者中较高的稀有度（合成时低品阶的塔被吸收，结果不降级） */
export declare function maxRarity(a: Rarity, b: Rarity): Rarity;
/** 取两者的平均稀有度（四舍五入） */
export declare function averageRarity(a: Rarity, b: Rarity): Rarity;
/**
 * 滚一个稀有度。floor 为保底下限 —— 保底触发时传 Rarity.SR，
 * 就只会在 SR / SSR 里按权重二选一，而不是强行给 SR。
 */
export declare function rollRarity(floor?: Rarity): Rarity;
/**
 * 特级召唤稀有度配置（无N卡，高级卡概率高）
 * 权重：R 45 / SR 40 / SSR 15
 */
export declare const PREMIUM_RARITY_CONFIGS: Record<Rarity, RarityConfig>;
/** 特级召唤固定价格：50金 */
export declare const PREMIUM_SUMMON_COST = 50;
/** 特级召唤保底：10次必出SSR */
export declare const PREMIUM_SUMMON_PITY_LIMIT = 10;
/**
 * 特级召唤：滚稀有度（无N卡，高级卡概率高）
 * @param floor 保底下限，默认R
 */
export declare function rollPremiumRarity(floor?: Rarity): Rarity;
/** 召唤保底：连续多少次没出 SR 以上就强制保底 */
export declare const SUMMON_PITY_LIMIT = 10;
export declare enum TowerType {
    MACHINE_GUN = "machine_gun",// 连射防御塔
    FROST = "frost",// 霜寒防御塔
    ELECTRIC = "electric",// 雷弧防御塔
    POISON = "poison",// 瘴毒防御塔
    BOMB = "bomb",// 爆裂防御塔
    LASER = "laser",// 光束防御塔
    SNIPER = "sniper",// 鹰眼灵
    FLAME = "flame",// 焚焰防御塔
    MAGNETIC = "magnetic",// 磁引防御塔
    SINGULARITY = "singularity"
}
export interface TowerConfig {
    type: TowerType;
    name: string;
    icon: string;
    color: string;
    cost: number;
    damage: number;
    range: number;
    attackSpeed: number;
    special?: string;
    /** 召唤卡展示的简短攻击特效说明，需与 Tower 的实际攻击逻辑一致。 */
    attackEffect: string;
    levelUpDamageMultiplier: number;
    levelUpRangeBonus: number;
    levelUpSpeedMultiplier: number;
}
export declare const TOWER_CONFIGS: Record<TowerType, TowerConfig>;
export declare const MAX_TOWER_LEVEL = 5;
export declare function toRoman(n: number): string;
/** 敌人每秒最多被拉走「自身有效速度 × 该比例」的距离。0.6 → 净推进恒 ≥ 40% */
export declare const MAGNETIC_PULL_BUDGET_RATIO = 0.6;
/** 单次命中的基础拉扯距离（px）。还要过敌人预算闸门，所以偏大也不会破 */
export declare const MAGNETIC_PULL_BASE = 7;
/** 拉扯质量系数：越重的单位越难被拉动（乘在预算上） */
export declare const MAGNETIC_PULL_MASS: {
    readonly normal: 1;
    readonly elite: 0.6;
    readonly boss: 0.35;
};
/** 拉扯附带的减速强度（0.30 = 30%）与持续时间（秒）。旧值 0.40 / 2.0 太强 */
export declare const MAGNETIC_SLOW_FACTOR = 0.3;
export declare const MAGNETIC_SLOW_DURATION = 1.5;
export declare const SUMMON_PRICE_MIN = 60;
export declare const SUMMON_PRICE_MAX = 200;
/**
 * 召唤一座防御塔要花多少钱 —— 只看品阶。
 * @param rarity 这次抽到的品阶
 */
export declare function summonPrice(rarity: Rarity): number;
/**
 * 波次自动推进倒计时（秒）。
 *
 * 一波清空后固定等这么久就强制开下一波，**没有「下一波」按钮**。
 * 这样战斗节奏完全由系统掌控：玩家必须在这段时间内完成布防/合成/召唤，
 * 而不是无限期地攒钱等最优解。
 */
export declare const WAVE_AUTO_ADVANCE_SECONDS = 5;
/** 所有波次完整清场后才开始5秒倒计时；30只小怪不会被超时规则截断。 */
export declare const WAVE_FORCE_ADVANCE_SECONDS: number;
/** 无波次强制时限的哨兵值：所有波次均等待完整清场。 */
export declare const NO_WAVE_TIME_LIMIT: number;
/** 某一波是否有强制推进时限。 */
export declare function waveHasTimeLimit(wave: number): boolean;
/**
 * 取某一波（1 起）的强制推进时限。优先用 WaveConfig.timeLimit，
 * 否则按 archetype 判定 —— **不要**用 `wave >= 10` 之类硬编码，
 * 关卡会变、波数会变，硬编码必然漂。
 */
export declare function getWaveTimeLimit(wave: number): number;
export declare enum EnemyType {
    NORMAL = "normal",// 纳米虫群
    FAST = "fast",// 侦察机兵
    HEAVY = "heavy",// 重装装甲车
    SPLIT = "split",// 分裂孢子机
    HEALER = "healer",// 修复无人机
    MINI = "mini",// 分裂出的小怪
    GHOST = "ghost",// 相位隐形机：周期性相位化，相位期间免疫伤害
    SHIELD = "shield",// 护盾机兵：护盾吸收伤害且克制低单发攻击
    BOMBER = "bomber",// 自爆机雷：死亡时瘫痪附近防御塔
    EMP_DRONE = "emp_drone",// EMP无人机：沉默防御塔
    REFLECTOR = "reflector",// 反射甲虫：反弹伤害
    ACCELERATOR = "accelerator",// 加速引擎兵：群体加速光环
    ASSASSIN = "assassin",// 隐身刺客：半透明不可锁定
    MAGNETIC_GUARD = "magnetic_guard",// 磁力盾卫：吸引弹道
    REGENERATOR = "regenerator",// 再生巨虫：快速回复
    ELITE_STORM = "elite_storm",// 精英·电磁风暴
    ELITE_FORTRESS = "elite_fortress",// 精英·反射堡垒
    ELITE_COMMANDER = "elite_commander",// 精英·战旗指挥官
    ELITE_VOIDWALKER = "elite_voidwalker",// 精英·虚空行者
    BOSS = "boss",// 第1关：机械统领
    BOSS_WARDEN = "boss_warden",// 第2关：要塞核心
    BOSS_NIGHTMARE = "boss_nightmare",// 第3关：机械神谕
    BOSS_STORM = "boss_storm",// 第4关：风暴使者
    BOSS_PHANTOM = "boss_phantom",// 第5关：幻影猎手
    BOSS_TITAN = "boss_titan",// 第6关：泰坦巨像
    BOSS_VENOM = "boss_venom",// 第7关：剧毒领主
    BOSS_INFERNO = "boss_inferno",// 第8关：炼狱魔王
    BOSS_FROST = "boss_frost",// 第9关：寒冰女皇
    BOSS_OMEGA = "boss_omega"
}
/** 是否是 Boss 类单位（三种关卡 Boss 共用一套渲染与判定路径） */
export declare function isBossType(type: EnemyType): boolean;
export interface EnemyConfig {
    type: EnemyType;
    name: string;
    color: string;
    hp: number;
    speed: number;
    reward: number;
    size: number;
    /** 漏过核心病房时扣除的生命值。原来所有敌人一律扣 1 点，
     *  导致 Boss 漏过和杂兵漏过代价相同，玩家没有"必须拦住 Boss"的压力。 */
    escapeDamage: number;
    special?: string;
    /** 护盾值占最大生命的比例（护盾机兵）。护盾未破时低单发伤害被大幅削减。 */
    shieldRatio?: number;
    /** 相位周期（秒）：每隔这么久进入一次相位化 */
    phaseCycle?: number;
    /** 单次相位持续时间（秒），期间免疫所有伤害 */
    phaseDuration?: number;
    /** 死亡时瘫痪附近防御塔的半径（自爆机雷） */
    deathParalyzeRadius?: number;
    /** 死亡时瘫痪时长（秒） */
    deathParalyzeDuration?: number;
    /** Boss 外观调色（不填则用默认紫色生化体配色） */
    bossPalette?: {
        glow: string;
        core: string;
        shell: string;
        eye: string;
    };
    /** EMP 无人机/精英：沉默半径 */
    empRadius?: number;
    /** EMP 无人机/精英：沉默持续时间 */
    empDuration?: number;
    /** EMP 无人机/精英：沉默冷却 */
    empCooldown?: number;
    /** 反射甲虫/精英：反射伤害比例 */
    reflectRatio?: number;
    /** 加速引擎兵/指挥官：光环半径 */
    auraRadius?: number;
    /** 加速引擎兵/指挥官：速度加成倍率 */
    auraSpeedBoost?: number;
    /** 指挥官：伤害减免 */
    auraDamageReduction?: number;
    /** 隐身刺客/虚空行者：透明度 */
    stealthAlpha?: number;
    /** 隐身刺客：核心揭示距离 */
    coreRevealDistance?: number;
    /** 磁力盾卫：弹道吸引半径 */
    attractRadius?: number;
    /** 再生巨虫：常规回复率 */
    regenRate?: number;
    /** 再生巨虫：低血量回复率 */
    lowHpRegenRate?: number;
    /** 精英·电磁风暴：死亡 EMP 半径 */
    deathEmpRadius?: number;
    /** 精英·电磁风暴：死亡 EMP 持续时间 */
    deathEmpDuration?: number;
    /** 精英·反射堡垒：死亡分裂数量 */
    deathSplitCount?: number;
    /** 精英·虚空行者：死亡对核心伤害 */
    deathCoreDamage?: number;
}
/**
 * 敌人配置。
 *
 * 小怪单体生命值明显上调，移动速度下调，击杀奖励统一为1金币；每波另有固定100金币结算。
 */
export declare const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig>;
/** 波次原型 —— 决定预告面板的图标与配色，也表达这一波的"设计身份" */
export type WaveArchetype = 'tutorial' | 'swarm' | 'armored' | 'split' | 'support' | 'mixed' | 'boss';
export interface WaveConfig {
    wave: number;
    /** 波次代号，显示在预告面板 */
    name: string;
    /** 波次原型 */
    archetype: WaveArchetype;
    /** 本波词缀（作用于全波敌人），对应 MUTATION_TYPES[].type；缺省表示无词缀 */
    modifier?: string;
    /**
     * 本波敌人构成。**不再逐组写 `delay`** —— 生成节奏统一由 `spawnWindow` 决定
     * （见下），逐组 delay 会导致"数量一多生成时长就爆表"，与 20 秒强制推进直接冲突。
     */
    enemies: Array<{
        type: EnemyType;
        count: number;
    }>;
    /**
     * 生成窗口（秒）：这一波的所有敌人**均匀铺满**这段时间涌出。
     *
     * 为什么从「逐组 delay」改成「整波窗口」：
     *   · 逐组 delay 下，生成总时长 = Σ(count × delay)，数量一翻倍时长就翻倍。
     *     v1.6 把数量提到 ×1.9 后，第 3 关 Boss 波会变成 80 只 × 0.55s = 44 秒才出完 ——
     *     比 20 秒强制推进的窗口还长，玩家会看到"波次超时了怪还在往外冒"。
     *   · 改成整波窗口后，数量与时长彻底解耦：想加密度只改 count，想改节奏只改这里。
     *
     * 约束：**必须 < 该波的强制推进时限**（普通 20s；Boss 波无时限所以天然满足），
     * 否则敌人还没出完波次就结束了。`analyze_level.mjs` 会断言这一点。
     */
    spawnWindow: number;
    /** 本波强制推进时限（秒）；缺省按 archetype 取 —— Boss 波为 `NO_WAVE_TIME_LIMIT`（无时限） */
    timeLimit?: number;
    reward: number;
    /** 多入口关卡的分流方式；默认使用主路。 */
    routeMode?: 'main' | 'random' | 'balanced';
    /** Boss专属战场技能，在技能名上方显示并触发。 */
    bossSkill?: 'emp_stun' | 'overload_aura' | 'energy_shield' | 'gold_drain' | 'earthquake' | 'silence_field' | 'time_stop' | 'death_ray' | 'eclipse_protocol';
}
/**
 * 每波敌人的基础属性膨胀（不含词缀）。
 * 1.055^35 ≈ 6.6 —— 36波战役的终局敌人约为开场的6.6倍；
 * 难度还由每关敌群规模、分路和关卡机制共同提供，避免只靠血条膨胀。
 */
export declare const WAVE_STAT_GROWTH = 1.015;
/**
 * 关卡难度系数（索引 0 = 第 1 关）—— **难度曲线的唯一调节旋钮**。
 *
 * 这张表取代了原来写死的 `Math.pow(1.6, chapter)`。旧曲线的问题是
 * 「每关 ×1.6」从第 2 关就开始发力：L2 就 1.6 倍、L3 2.56 倍，前三关
 * 一点也不轻松；而到第 9 关又膨胀到 1.6^8 ≈ 43.0 倍，血量全靠堆数字。
 *
 * 新曲线是**平滑加速型**的：前段近乎平坦（1.0 → 1.12 → 1.32），中段
 * 每关约 ×1.3~1.37 稳步抬升，末段 L7→L8→L9（4.5 → 6.5 → 10.0）收在
 * ×1.44 / ×1.54 —— 既保留「前松后紧」的手感，又不会出现单关 ×3 的断崖。
 * 旧版 L7/L8/L9 = 7.5 / 13.0 / 40.0 属于纯堆血条，已被本次平衡替换。
 *
 * ⚠️ 改这里必须同时改 `LEVEL_TROOP_TUNING` 的怪潮规模，两者相乘才是
 * 真实压力（单波压力 ≈ 小怪数 × 该关倍率）。改完跑 `npm run verify:all`。
 */
export declare const LEVEL_DIFFICULTY_MULTIPLIERS: number[];
/** 取某关的难度系数（越界钳制到首尾） */
export declare function getLevelDifficultyMultiplier(levelIndex: number): number;
export declare function getWaveHpMultiplier(wave: number): number;
export interface LevelModifier {
    type: string;
    name: string;
    icon: string;
    description: string;
    /** 敌人死亡时分裂出小怪的概率（0~1） */
    deathSplitChance?: number;
    /** 防御塔攻击间隔乘数（>1 表示变慢） */
    towerIntervalMult?: number;
}
export interface LevelConfig {
    id: number;
    name: string;
    subtitle: string;
    /** 主题色，用于 HUD 与关卡切换界面 */
    accent: string;
    /** 地图路径点 */
    path: Array<{
        x: number;
        y: number;
    }>;
    /** 可选多条进攻路线；path 仍是主路以兼容旧逻辑。 */
    routes?: Array<Array<{
        x: number;
        y: number;
    }>>;
    /**
     * 每条路线的传送门段号：`warpSegments[routeIndex][n] = i` 表示
     * 第 i 段（points[i] → points[i+1]）是瞬移，不铺路面、不在地面行走。
     * 与 `routes` 等长；没有传送门时为空数组。
     */
    warpSegments?: number[][];
    /** 核心可独立于地图边缘定位；所有路线应在此汇合。 */
    core?: {
        x: number;
        y: number;
    };
    /** 塔位（occupied 由运行时维护） */
    slots: Array<{
        x: number;
        y: number;
        occupied: boolean;
    }>;
    /** 本关的波次 */
    waves: WaveConfig[];
    /** 通关奖励抽卡的稀有度保底 */
    clearFloor: Rarity;
    /** 通关额外金币 */
    clearGold: number;
    /** 关卡环境词缀（整关持续生效，与波次词缀叠加） */
    modifier?: LevelModifier;
    /**
     * 本关每波的小怪数量（默认 SMALL_ENEMIES_PER_WAVE=30）。
     * 第一关调低用：原型波次的 count 会被 makeSmallEnemyGroups 归一化掉，
     * 只改原型数量是**无效的**，必须从这里按关覆盖。
     */
    smallEnemiesPerWave?: number;
    /** 本关精英波的基础数量（默认 3，实际 count = base + floor((波-1)/3)） */
    eliteCountBase?: number;
    /** 本关敌人基础生命额外乘数（默认 1；教学关可以调低） */
    enemyHpMult?: number;
}
/** 旧存档兼容常量；新全局波号按各关实际波数累计。 */
export declare const WAVES_PER_LEVEL = 10;
export declare const LEVELS: LevelConfig[];
/**
 * 对外暴露的塔位生成器（供 `tools/probe_slots.mjs` 这类设计工具试算）。
 * 游戏内仍然只由末尾那个 `for (const level of LEVELS)` 循环调用它，
 * 所以不会产生第二套塔位。
 */
export declare function buildTowerSlots(routes: Array<Array<{
    x: number;
    y: number;
}>>, count: number, warpSegments?: number[][]): {
    x: number;
    y: number;
    occupied: boolean;
}[];
/**
 * 每关怪潮规模（索引 0 = 第 1 关）：单波小怪数 / 精英基数 / 生命额外乘数。
 *
 * 与 `LEVEL_DIFFICULTY_MULTIPLIERS` 相乘才是真实压力：
 *   单波压力 ≈ small × difficulty × hpMult
 * 前 3 关刻意做轻（20/20/22 只、血 0.8~1.0），让玩家把塔的合成与技能
 * 摸熟；7-9 关直接把怪潮拉到 40/46/52 只 —— 这就是「海量怪物」，
 * 靠数量而不是靠血量堆出压迫感，配合末段的血量指数抬升形成双重压力。
 *
 * ⚠️ 改 small 必须回头跑 `analyze_level.mjs` 的「单波预估峰值 ≤100」
 *    校验（分裂子体会把同屏数量翻倍，见 `capSplitShare`）。
 */
export declare const LEVEL_TROOP_TUNING: Array<{
    small: number;
    elite: number;
    hp: number;
}>;
export declare const WAVE_END_GOLD_REWARD = 60;
/** 敌人基础生命的关卡额外乘数（教学关可以单独压低，其它关保持 1） */
export declare function getLevelHpFactor(levelIndex: number): number;
export declare let ACTIVE_LEVEL_INDEX: number;
export declare let PATH_POINTS: Array<{
    x: number;
    y: number;
}>;
export declare let PATH_ROUTES: Array<Array<{
    x: number;
    y: number;
}>>;
/** 每条路线的传送门段号，与 PATH_ROUTES 等长 */
export declare let PATH_WARP_SEGMENTS: number[][];
export declare let TOWER_SLOTS: Array<{
    x: number;
    y: number;
    occupied: boolean;
}>;
export declare let WAVE_CONFIGS: WaveConfig[];
export declare let TOTAL_WAVES: number;
/** 随机传送门网络（L6/L7/L8）—— 敌人走到路线终点时随机跳到其余门 */
export declare let ACTIVE_PORTALS: Array<{
    id: string;
    label: string;
    color: string;
    x: number;
    y: number;
    outgoing: Array<{
        x: number;
        y: number;
    }>;
}>;
/** 迷雾禁区（L8）—— 雾内敌人无法被防御塔锁定/攻击 */
export declare let ACTIVE_FOG_ZONES: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
}>;
export declare function getLevelCount(): number;
export declare function getActiveLevel(): LevelConfig;
/** 切换活动关卡：重绑定地图与波次，并清空塔位占位状态 */
export declare function setActiveLevel(index: number): LevelConfig;
/** 关内波号 → 全局波号（决定敌人属性倍率） */
export declare function getGlobalWave(levelIndex: number, waveInLevel: number): number;
/** 是否为 Boss 波（当前关卡的最后一波） */
export declare function isBossWave(wave: number): boolean;
export declare enum UpgradeType {
    ALL_DAMAGE = "all_damage",// 攻势编队伤害强化
    ALL_SPEED = "all_speed",// 元素编队攻速强化
    CONTROL_MATRIX = "control_matrix",// 控制编队强化
    SIEGE_PROTOCOL = "siege_protocol",// 重炮编队强化
    FROST_SLOW = "frost_slow",// 冰霜减速增强
    ELECTRIC_CHAIN = "electric_chain",// 电击弹射+1
    POISON_DURATION = "poison_duration",// 毒素持续+
    BOMB_RANGE = "bomb_range",// 炸弹范围+
    MERGE_BONUS = "merge_bonus",// 合成额外攻击
    FUSION_BONUS = "fusion_bonus",// 控制强化（枚举键沿用历史命名，实际作用于眩晕触发概率）
    GOLD_BONUS = "gold_bonus",// 额外金币
    HEAL = "heal",// 恢复生命
    ELITE_EXPLODE = "elite_explode"
}
export interface UpgradeConfig {
    type: UpgradeType;
    name: string;
    icon: string;
    description: string;
    maxStack: number;
    /** 适用塔型；让玩家知道这次选择会强化哪套阵容。 */
    targetTypes?: TowerType[];
    targetLabel?: string;
    damageScale?: number;
    speedScale?: number;
}
export declare const UPGRADE_CONFIGS: Record<UpgradeType, UpgradeConfig>;
/** 单个技能的定义（一个塔型在一个档位里有 3 个，对应 3 种变体） */
export interface TowerSkill {
    id: string;
    name: string;
    icon: string;
    description: string;
    effect: string;
}
export interface TowerSkillConfig {
    towerType: TowerType;
    level: number;
    skills: TowerSkill[];
}
export declare const TOWER_SKILLS: TowerSkillConfig[];
/**
 * 技能 id → 它属于哪一档（Lv2 / Lv3 / Lv4）。找不到返回 0。
 *
 * 合成时用来按"品阶优先"裁剪继承的技能：技能位只有 `等级 - 1` 个，
 * 必须优先保留更高级的招式（大招 > 小技能），否则 Lv4 的塔反而可能
 * 只继承到两个 Lv2 技能，把最有价值的 build 挤掉。
 */
export declare function skillTierOf(skillId: string): number;
/**
 * 按 id 取技能定义。UI 要展示"这座塔学会了什么"，
 * 但 Tower 里只存 id（存档友好），所以需要这个反查。
 */
export declare function findSkillById(skillId: string): TowerSkill | undefined;
/**
 * 某座塔在某档里**自动发放**的技能。
 *
 * 去掉三选一之后，技能不再由玩家挑，而是按塔的 `skillVariant` 取第 `variant` 个。
 * 第 1/2/3 座同名塔因此各走一条 build 线，9 个技能全都有出场机会。
 * 抽成函数是为了让 GameManager 和验证脚本用**同一套规则**（两边各写一遍必然会漂）。
 */
export declare function autoSkillFor(towerType: TowerType, level: number, variant: number): TowerSkill | undefined;
export interface MutationConfig {
    type: string;
    name: string;
    icon: string;
    description: string;
    hpMultiplier: number;
    speedMultiplier: number;
    special?: string;
}
export declare const MUTATION_TYPES: MutationConfig[];
