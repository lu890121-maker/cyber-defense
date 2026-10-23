/**
 * 游戏配置数据
 * 所有游戏参数集中在此配置
 */
import { getLevelMap } from './MapConfig.js';
export { getLevelMap };
// 游戏常量
export const GAME_CONSTANTS = {
    // 画布尺寸（竖屏9:16）
    CANVAS_WIDTH: 450,
    CANVAS_HEIGHT: 800,
    // 游戏区域
    GAME_AREA_TOP: 80, // 顶部UI高度
    GAME_AREA_BOTTOM: 120, // 底部UI高度
    // 格子尺寸
    GRID_SIZE: 50,
    GRID_COLS: 7,
    GRID_ROWS: 8,
    // 初始资源
    // A wider opening budget lets new players field a small, mixed defense before
    // the first swarm reaches the core; extra lives soften early leaks without
    // changing the later wave curve.
    INITIAL_GOLD: 250,
    INITIAL_LIVES: 25,
    // 战斗速度
    GAME_SPEED: {
        NORMAL: 1,
        FAST: 2
    }
};
// ══════════════════════════════════════════════════════════════
//  稀有度系统
// ══════════════════════════════════════════════════════════════
//
// 设计要点：稀有度不是防御塔类型的固有属性，而是每次抽卡独立滚出来的「品阶」。
// 也就是说「连射防御塔」可以抽到 N，也可以抽到 SSR —— 后者伤害是前者的 2.7 倍。
// 这样同一张卡池能产生 11 种防御塔 × 4 个品阶 = 44 种实际战力组合，
// 而玩家在抽卡时面对的是「类型 + 品阶」两个维度的期待感。
//
// 权重 62 / 26 / 9.5 / 2.5 ≈ 100：
//   SSR 期望 40 抽出一次，配合 10 抽保底（SR 以上），既稀有又不至于绝望。
export var Rarity;
(function (Rarity) {
    Rarity["N"] = "N";
    Rarity["R"] = "R";
    Rarity["SR"] = "SR";
    Rarity["SSR"] = "SSR"; // 超超稀有
})(Rarity || (Rarity = {}));
export const RARITY_CONFIGS = {
    // 品阶配色对齐赛博四色：灰(钢) / 青 / 紫 / 金 —— 与 PRD 的 #00F0FF #9D00FF #FFD700 同源。
    // ⚠️ 四色色相必须保持「灰 / 蓝通道最高 / 蓝最高红次之 / 红通道最高」的分离，
    //    tools/verify_hud.mjs 的 hueOk() 就是按这个方向判的。
    [Rarity.N]: {
        key: Rarity.N, name: 'N', color: '#8A94A6', stars: 1,
        weight: 75, dmgMult: 1.00, rangeBonus: 0, intervalMult: 1.00, sellMult: 1.0
    },
    [Rarity.R]: {
        key: Rarity.R, name: 'R', color: '#00F0FF', stars: 2,
        weight: 20, dmgMult: 1.40, rangeBonus: 8, intervalMult: 0.92, sellMult: 1.8
    },
    [Rarity.SR]: {
        key: Rarity.SR, name: 'SR', color: '#9D00FF', stars: 3,
        weight: 4, dmgMult: 1.90, rangeBonus: 16, intervalMult: 0.84, sellMult: 3.2
    },
    [Rarity.SSR]: {
        key: Rarity.SSR, name: 'SSR', color: '#FFD700', stars: 4,
        weight: 1, dmgMult: 2.70, rangeBonus: 26, intervalMult: 0.76, sellMult: 6.0
    }
};
/** 由低到高 */
export const RARITY_ORDER = [Rarity.N, Rarity.R, Rarity.SR, Rarity.SSR];
export function rarityIndex(r) {
    const i = RARITY_ORDER.indexOf(r);
    return i < 0 ? 0 : i;
}
/** 取两者中较高的稀有度（合成时低品阶的塔被吸收，结果不降级） */
export function maxRarity(a, b) {
    return rarityIndex(a) >= rarityIndex(b) ? a : b;
}
/** 取两者的平均稀有度（四舍五入） */
export function averageRarity(a, b) {
    const avg = Math.round((rarityIndex(a) + rarityIndex(b)) / 2);
    return RARITY_ORDER[Math.max(0, Math.min(RARITY_ORDER.length - 1, avg))];
}
/**
 * 滚一个稀有度。floor 为保底下限 —— 保底触发时传 Rarity.SR，
 * 就只会在 SR / SSR 里按权重二选一，而不是强行给 SR。
 */
export function rollRarity(floor = Rarity.N) {
    const pool = RARITY_ORDER.filter(r => rarityIndex(r) >= rarityIndex(floor));
    if (pool.length === 0)
        return Rarity.N;
    const total = pool.reduce((s, r) => s + RARITY_CONFIGS[r].weight, 0);
    let x = Math.random() * total;
    for (const r of pool) {
        x -= RARITY_CONFIGS[r].weight;
        if (x <= 0)
            return r;
    }
    return pool[pool.length - 1];
}
/**
 * 特级召唤稀有度配置（无N卡，高级卡概率高）
 * 权重：R 45 / SR 40 / SSR 15
 */
export const PREMIUM_RARITY_CONFIGS = {
    [Rarity.N]: {
        key: Rarity.N, name: 'N', color: '#8A94A6', stars: 1,
        weight: 0, dmgMult: 1.00, rangeBonus: 0, intervalMult: 1.00, sellMult: 1.0
    },
    [Rarity.R]: {
        key: Rarity.R, name: 'R', color: '#00F0FF', stars: 2,
        weight: 45, dmgMult: 1.40, rangeBonus: 8, intervalMult: 0.92, sellMult: 1.8
    },
    [Rarity.SR]: {
        key: Rarity.SR, name: 'SR', color: '#9D00FF', stars: 3,
        weight: 40, dmgMult: 1.90, rangeBonus: 16, intervalMult: 0.84, sellMult: 3.2
    },
    [Rarity.SSR]: {
        key: Rarity.SSR, name: 'SSR', color: '#FFD700', stars: 4,
        weight: 15, dmgMult: 2.70, rangeBonus: 26, intervalMult: 0.76, sellMult: 6.0
    }
};
/** 特级召唤固定价格：50金 */
export const PREMIUM_SUMMON_COST = 50;
/** 特级召唤保底：10次必出SSR */
export const PREMIUM_SUMMON_PITY_LIMIT = 10;
/**
 * 特级召唤：滚稀有度（无N卡，高级卡概率高）
 * @param floor 保底下限，默认R
 */
export function rollPremiumRarity(floor = Rarity.R) {
    // 特级召唤池：R/SR/SSR
    const pool = RARITY_ORDER.filter(r => rarityIndex(r) >= rarityIndex(floor) && r !== Rarity.N);
    if (pool.length === 0)
        return Rarity.R;
    const total = pool.reduce((s, r) => s + PREMIUM_RARITY_CONFIGS[r].weight, 0);
    let x = Math.random() * total;
    for (const r of pool) {
        x -= PREMIUM_RARITY_CONFIGS[r].weight;
        if (x <= 0)
            return r;
    }
    return pool[pool.length - 1];
}
/** 召唤保底：连续多少次没出 SR 以上就强制保底 */
export const SUMMON_PITY_LIMIT = 10;
// 防御塔类型
export var TowerType;
(function (TowerType) {
    TowerType["MACHINE_GUN"] = "machine_gun";
    TowerType["FROST"] = "frost";
    TowerType["ELECTRIC"] = "electric";
    TowerType["POISON"] = "poison";
    TowerType["BOMB"] = "bomb";
    TowerType["LASER"] = "laser";
    TowerType["SNIPER"] = "sniper";
    TowerType["FLAME"] = "flame";
    TowerType["MAGNETIC"] = "magnetic";
    TowerType["SINGULARITY"] = "singularity"; // 奇点炮：重型范围爆发
})(TowerType || (TowerType = {}));
export const TOWER_CONFIGS = {
    [TowerType.MACHINE_GUN]: {
        type: TowerType.MACHINE_GUN,
        name: '脉冲炮',
        icon: 'GAUGE_GUN',
        color: '#00F0FF',
        cost: 50,
        damage: 8,
        range: 110,
        attackSpeed: 0.42,
        special: '单体快速攻击',
        attackEffect: '连续脉冲弹快速集火',
        levelUpDamageMultiplier: 1.4,
        levelUpRangeBonus: 8,
        levelUpSpeedMultiplier: 0.92
    },
    [TowerType.FROST]: {
        type: TowerType.FROST,
        name: '冷冻炮',
        icon: 'CRYOROAD',
        color: '#5AA9FF',
        cost: 60,
        damage: 7,
        range: 95,
        attackSpeed: 0.9,
        special: '减速50%持续2秒',
        attackEffect: '冰弹命中后减速目标',
        levelUpDamageMultiplier: 1.3,
        levelUpRangeBonus: 10,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.ELECTRIC]: {
        type: TowerType.ELECTRIC,
        name: '电磁炮',
        icon: 'TESLA_COIL',
        color: '#FFD700',
        cost: 70,
        damage: 18,
        range: 100,
        attackSpeed: 1.1,
        special: '可弹射',
        attackEffect: '闪电命中后向附近弹射',
        levelUpDamageMultiplier: 1.4,
        levelUpRangeBonus: 8,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.POISON]: {
        type: TowerType.POISON,
        name: '毒蚀炮',
        icon: 'BIO_FLASK',
        color: '#39FF88',
        cost: 65,
        damage: 5,
        range: 95,
        attackSpeed: 1.3,
        special: '持续伤害5秒',
        attackEffect: '命中后施加持续毒伤',
        levelUpDamageMultiplier: 1.3,
        levelUpRangeBonus: 8,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.BOMB]: {
        type: TowerType.BOMB,
        name: '导弹台',
        icon: 'MORTAR_BOMB',
        color: '#FF8A1F',
        cost: 80,
        damage: 30,
        range: 85,
        attackSpeed: 2.2,
        special: '范围伤害',
        attackEffect: '导弹命中后造成范围爆炸',
        levelUpDamageMultiplier: 1.5,
        levelUpRangeBonus: 8,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.LASER]: {
        type: TowerType.LASER,
        name: '激光炮',
        icon: 'LASER_EMITTER',
        color: '#FF2D55',
        cost: 90,
        damage: 20,
        range: 120,
        attackSpeed: 0.6,
        special: '远程精准打击',
        attackEffect: '激光穿透直线上的敌人',
        levelUpDamageMultiplier: 1.5,
        levelUpRangeBonus: 15,
        levelUpSpeedMultiplier: 0.92
    },
    [TowerType.SNIPER]: {
        type: TowerType.SNIPER,
        name: '磁轨炮',
        icon: 'SNIPER_SCOPE',
        color: '#9D00FF',
        cost: 100,
        damage: 60,
        range: 180,
        attackSpeed: 2.8,
        special: '超远距离高伤害',
        attackEffect: '超远重弹，具备高暴击',
        levelUpDamageMultiplier: 1.6,
        levelUpRangeBonus: 20,
        levelUpSpeedMultiplier: 0.88
    },
    [TowerType.FLAME]: {
        type: TowerType.FLAME,
        name: '焚化器',
        icon: 'FLAME_THROWER',
        color: '#FF6A00',
        cost: 75,
        damage: 12,
        range: 75,
        attackSpeed: 0.4,
        special: '持续灼烧伤害',
        attackEffect: '命中后持续灼烧目标',
        levelUpDamageMultiplier: 1.4,
        levelUpRangeBonus: 8,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.MAGNETIC]: {
        type: TowerType.MAGNETIC,
        name: '引力场',
        icon: 'MAGNET_CORE',
        color: '#00E5B0',
        cost: 85,
        damage: 10,
        range: 110,
        attackSpeed: 1.3,
        special: '拉扯敌人减速',
        attackEffect: '引力牵引并减速敌人',
        levelUpDamageMultiplier: 1.3,
        levelUpRangeBonus: 10,
        levelUpSpeedMultiplier: 0.95
    },
    [TowerType.SINGULARITY]: {
        type: TowerType.SINGULARITY, name: '奇点炮', icon: 'SINGULARITY', color: '#C084FC', cost: 110,
        damage: 40, range: 120, attackSpeed: 1.55, special: '重弹范围爆发，克制密集装甲', attackEffect: '奇点爆炸波及周围敌人',
        levelUpDamageMultiplier: 1.42, levelUpRangeBonus: 7, levelUpSpeedMultiplier: 0.93
    },
};
// ── 等级 / 罗马数字 ────────────────────────────────────────
//
// 防御塔的等级上限是 5，而不是"两个 Lv4 合成 Lv5 然后无限升"。
// 定成 5 是因为技能发放规则：**每升 1 级给 1 个技能**，
// Lv1 无技能 → Lv2 一个 → Lv3 两个 → Lv4 三个 → Lv5 四个。
// 四个技能是一套完整的 build，再往上加只会让数值失控。
export const MAX_TOWER_LEVEL = 5;
/** 等级显示统一用罗马数字（I / II / III / IV）—— 比阿拉伯数字更像"防御塔"的符文标记 */
const ROMAN_TABLE = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
];
export function toRoman(n) {
    let v = Math.max(1, Math.floor(n));
    let out = '';
    for (const [num, sym] of ROMAN_TABLE) {
        while (v >= num) {
            out += sym;
            v -= num;
        }
    }
    return out;
}
// ── 引力场（MAGNETIC）拉扯平衡 ─────────────────────────────
//
// ⚠️ 这套参数是"引力场曾经强到破坏游戏"之后的修正版，改之前先读完。
//
// 旧实现：每次命中把敌人**瞬移**固定距离，净向后速度 = 拉扯距离 ÷ 攻击间隔。
//   20px ÷ (1/1.3s) = 26 px/s
// 而最慢的敌人（机械神谕 20 / 要塞核心 22）被减速 40% 后只剩 12~13 px/s
//   → 敌人被永久顶在原地，甚至被**倒推**；Boss 一样逃不掉。
//   Lv2「强力拉扯」(+100%) 变 40px/次 → 52 px/s，Lv3「黑洞」(+150%) → 65 px/s，
//   全场定身。而且**多放几座会线性叠加**，没有任何上限。
//
// 修正思路不是"把数字调小"（那只是把阈值推后，多放两座又会破），
// 而是给**敌人**一个每秒拉扯预算（见 `Enemy.takePullBudget`）：
//   每秒最多被拉走 `有效速度 × MAGNETIC_PULL_BUDGET_RATIO` 的距离
// → 与场上引力场的**数量完全无关**，敌人净推进速度恒 ≥ (1 − ratio) 倍。
//   拉扯从"倒推"变成纯粹的"减速"，无论怎么叠塔都不可能定身。
//
// 于是单次拉扯距离和技能加成只决定"能不能吃满预算"，不再决定"会不会破"。
/** 敌人每秒最多被拉走「自身有效速度 × 该比例」的距离。0.6 → 净推进恒 ≥ 40% */
export const MAGNETIC_PULL_BUDGET_RATIO = 0.6;
/** 单次命中的基础拉扯距离（px）。还要过敌人预算闸门，所以偏大也不会破 */
export const MAGNETIC_PULL_BASE = 7;
/** 拉扯质量系数：越重的单位越难被拉动（乘在预算上） */
export const MAGNETIC_PULL_MASS = { normal: 1.0, elite: 0.6, boss: 0.35 };
/** 拉扯附带的减速强度（0.30 = 30%）与持续时间（秒）。旧值 0.40 / 2.0 太强 */
export const MAGNETIC_SLOW_FACTOR = 0.30;
export const MAGNETIC_SLOW_DURATION = 1.5;
// ── 召唤定价 ──────────────────────────────────────────────
//
// 「稀有塔更贵、普通塔便宜」：**每个品阶一个统一价**（整十），同品阶的所有塔同价。
//   N 50 / R 80 / SR 120 / SSR 150
//
// 为什么不按基础造价微调：一旦造价参与定价，就会出现「N 档鹰眼灵（造价 100）比
// R 档霜寒防御塔（60）还贵」—— 玩家就无法用品阶解释价格了。品阶是卡面唯一的定价依据，
// 造价只用来决定召唤池权重（1/造价）和卖塔回收价。
//
// 结果恒定落在 [SUMMON_PRICE_MIN, SUMMON_PRICE_MAX] 内。
export const SUMMON_PRICE_MIN = 60;
export const SUMMON_PRICE_MAX = 200;
/** 各品阶的统一售价 */
const RARITY_PRICE = {
    [Rarity.N]: 60,
    [Rarity.R]: 100,
    [Rarity.SR]: 150,
    [Rarity.SSR]: 200
};
/**
 * 召唤一座防御塔要花多少钱 —— 只看品阶。
 * @param rarity 这次抽到的品阶
 */
export function summonPrice(rarity) {
    const p = RARITY_PRICE[rarity] ?? SUMMON_PRICE_MIN;
    return Math.min(SUMMON_PRICE_MAX, Math.max(SUMMON_PRICE_MIN, p));
}
/**
 * 波次自动推进倒计时（秒）。
 *
 * 一波清空后固定等这么久就强制开下一波，**没有「下一波」按钮**。
 * 这样战斗节奏完全由系统掌控：玩家必须在这段时间内完成布防/合成/召唤，
 * 而不是无限期地攒钱等最优解。
 */
export const WAVE_AUTO_ADVANCE_SECONDS = 5;
/** 所有波次完整清场后才开始5秒倒计时；30只小怪不会被超时规则截断。 */
export const WAVE_FORCE_ADVANCE_SECONDS = Infinity;
/** 无波次强制时限的哨兵值：所有波次均等待完整清场。 */
export const NO_WAVE_TIME_LIMIT = Infinity;
/** 某一波是否有强制推进时限。 */
export function waveHasTimeLimit(wave) {
    return Number.isFinite(getWaveTimeLimit(wave));
}
/**
 * 取某一波（1 起）的强制推进时限。优先用 WaveConfig.timeLimit，
 * 否则按 archetype 判定 —— **不要**用 `wave >= 10` 之类硬编码，
 * 关卡会变、波数会变，硬编码必然漂。
 */
export function getWaveTimeLimit(wave) {
    const cfg = WAVE_CONFIGS[wave - 1];
    if (!cfg)
        return WAVE_FORCE_ADVANCE_SECONDS;
    if (cfg.timeLimit !== undefined)
        return cfg.timeLimit;
    return NO_WAVE_TIME_LIMIT;
}
// 合成规则
//
// 只有**完全相同的防御塔**（同类型 + 同等级）才能合成升级。
// 不同种类的防御塔之间不能组合 —— 这条规则由 Tower.canMergeWith() 单点保证，
// 所有交互路径（拖拽落点 / 点击两格 / 合成区）都必须走它，不允许自己再写一套判断。
// 稀有度不参与判定：低品阶的同名塔作为升级材料被吸收，结果取两者中较高的品阶。
// 敌人类型
export var EnemyType;
(function (EnemyType) {
    EnemyType["NORMAL"] = "normal";
    EnemyType["FAST"] = "fast";
    EnemyType["HEAVY"] = "heavy";
    EnemyType["SPLIT"] = "split";
    EnemyType["HEALER"] = "healer";
    EnemyType["MINI"] = "mini";
    // ── 第 2 关「机械巢穴」新增 ──
    EnemyType["GHOST"] = "ghost";
    // ── 第 3 关「核心反应堆」新增 ──
    EnemyType["SHIELD"] = "shield";
    EnemyType["BOMBER"] = "bomber";
    // ── 三个关卡各自的 Boss ──
    EnemyType["BOSS"] = "boss";
    EnemyType["BOSS_WARDEN"] = "boss_warden";
    EnemyType["BOSS_NIGHTMARE"] = "boss_nightmare";
    EnemyType["BOSS_STORM"] = "boss_storm";
    EnemyType["BOSS_PHANTOM"] = "boss_phantom";
    EnemyType["BOSS_TITAN"] = "boss_titan";
    EnemyType["BOSS_VENOM"] = "boss_venom";
    EnemyType["BOSS_INFERNO"] = "boss_inferno";
    EnemyType["BOSS_FROST"] = "boss_frost";
    EnemyType["BOSS_OMEGA"] = "boss_omega"; // 第9关：终极欧米伽
})(EnemyType || (EnemyType = {}));
/** 是否是 Boss 类单位（三种关卡 Boss 共用一套渲染与判定路径） */
export function isBossType(type) {
    return type === EnemyType.BOSS ||
        type === EnemyType.BOSS_WARDEN ||
        type === EnemyType.BOSS_NIGHTMARE ||
        type === EnemyType.BOSS_STORM ||
        type === EnemyType.BOSS_PHANTOM ||
        type === EnemyType.BOSS_TITAN ||
        type === EnemyType.BOSS_VENOM ||
        type === EnemyType.BOSS_INFERNO ||
        type === EnemyType.BOSS_FROST ||
        type === EnemyType.BOSS_OMEGA;
}
/**
 * 敌人配置。
 *
 * 小怪单体生命值明显上调，移动速度下调，击杀奖励统一为1金币；每波另有固定100金币结算。
 */
export const ENEMY_CONFIGS = {
    [EnemyType.NORMAL]: {
        type: EnemyType.NORMAL,
        name: '纳米虫群',
        color: '#8A94A6',
        hp: 190,
        speed: 36,
        reward: 1,
        size: 15,
        escapeDamage: 1
    },
    [EnemyType.FAST]: {
        type: EnemyType.FAST,
        name: '侦察机兵',
        color: '#FFD700',
        hp: 145,
        speed: 72,
        reward: 1,
        size: 12,
        escapeDamage: 1
    },
    [EnemyType.HEAVY]: {
        type: EnemyType.HEAVY,
        name: '重装装甲车',
        color: '#5A6577',
        hp: 520,
        speed: 22,
        reward: 2,
        size: 20,
        escapeDamage: 2
    },
    [EnemyType.SPLIT]: {
        type: EnemyType.SPLIT,
        name: '分裂孢子机',
        color: '#39FF88',
        hp: 260,
        speed: 30,
        reward: 2,
        size: 18,
        escapeDamage: 2,
        special: '死亡分裂'
    },
    [EnemyType.HEALER]: {
        type: EnemyType.HEALER,
        name: '修复无人机',
        color: '#FF6FD8',
        hp: 210,
        speed: 25,
        reward: 2,
        size: 16,
        escapeDamage: 2,
        special: '治疗周围'
    },
    [EnemyType.MINI]: {
        type: EnemyType.MINI,
        name: '微型机虫',
        color: '#7CFFB2',
        hp: 80,
        speed: 44,
        reward: 1,
        size: 10,
        escapeDamage: 1
    },
    // ── 第2关新敌种：相位隐形机 ──
    // 相位化是对「持续输出流」的直接反制：无论你 DPS 多高，相位期间打不动。
    // 玩家必须靠射程覆盖广（让它长时间处于可被打状态）或爆发窗口取胜。
    [EnemyType.GHOST]: {
        type: EnemyType.GHOST,
        name: '相位隐形机',
        color: '#A8B4FF',
        hp: 200,
        speed: 42,
        reward: 1,
        size: 16,
        escapeDamage: 1,
        special: '相位化',
        phaseCycle: 3.5,
        phaseDuration: 1.5
    },
    // ── 第3关新敌种：护盾机兵 ──
    // 护盾对低单发伤害有额外减免，专门克制连射防御塔 / 焚焰防御塔这类速射流。
    // 反制手段：鹰眼灵、光束防御塔、爆裂防御塔这类高单发伤害的防御塔。
    [EnemyType.SHIELD]: {
        type: EnemyType.SHIELD,
        name: '护盾机兵',
        color: '#38BDF8',
        hp: 340,
        speed: 27,
        reward: 2,
        size: 19,
        escapeDamage: 2,
        special: '护盾（低单发伤害减伤）',
        shieldRatio: 0.75
    },
    // ── 第3关新敌种：自爆机雷 ──
    // 死亡时瘫痪附近防御塔 —— 这是唯一能直接削弱玩家场上资产的敌人，
    // 逼玩家做「纵深布置」而不是把塔全堆在一个卡口。
    [EnemyType.BOMBER]: {
        type: EnemyType.BOMBER,
        name: '自爆机雷',
        color: '#FF4D6D',
        hp: 240,
        speed: 37,
        reward: 4,
        size: 17,
        escapeDamage: 2,
        special: '死亡瘫痪附近防御塔',
        deathParalyzeRadius: 95,
        deathParalyzeDuration: 3.0
    },
    // ── 三个关卡 Boss ──
    [EnemyType.BOSS]: {
        type: EnemyType.BOSS,
        name: '机械统领',
        color: '#FF0033',
        hp: 2500,
        speed: 18,
        reward: 5,
        size: 30,
        escapeDamage: 5,
        special: '局部干扰',
        bossPalette: { glow: '#FF0033', core: '#FF3B5C', shell: '#4A0010', eye: '#FFD700' }
    },
    [EnemyType.BOSS_WARDEN]: {
        type: EnemyType.BOSS_WARDEN,
        name: '要塞核心',
        color: '#00F0FF',
        hp: 6800,
        speed: 15,
        reward: 5,
        size: 34,
        escapeDamage: 5,
        special: '能量护盾',
        bossPalette: { glow: '#00F0FF', core: '#6BF6FF', shell: '#05303A', eye: '#B9FFF5' }
    },
    [EnemyType.BOSS_NIGHTMARE]: {
        type: EnemyType.BOSS_NIGHTMARE,
        name: '机械神谕',
        color: '#9D00FF',
        hp: 17500,
        speed: 14,
        reward: 5,
        size: 38,
        escapeDamage: 5,
        special: '规则篡改',
        bossPalette: { glow: '#9D00FF', core: '#C77BFF', shell: '#2A0050', eye: '#FFD700' }
    },
    [EnemyType.BOSS_STORM]: {
        type: EnemyType.BOSS_STORM,
        name: '机械统领·改',
        color: '#43F5C8',
        hp: 4200,
        speed: 17,
        reward: 5,
        size: 32,
        escapeDamage: 5,
        special: '战术过载',
        bossPalette: { glow: '#43F5C8', core: '#7FFFD4', shell: '#0A3D32', eye: '#FFFFFF' }
    },
    [EnemyType.BOSS_PHANTOM]: {
        type: EnemyType.BOSS_PHANTOM,
        name: '要塞核心·改',
        color: '#B58CFF',
        hp: 9500,
        speed: 15,
        reward: 5,
        size: 36,
        escapeDamage: 5,
        special: '金币汲取',
        bossPalette: { glow: '#B58CFF', core: '#D4B5FF', shell: '#1F0A3D', eye: '#FF69B4' }
    },
    [EnemyType.BOSS_TITAN]: {
        type: EnemyType.BOSS_TITAN,
        name: '要塞核心·重装',
        color: '#FF873D',
        hp: 13000,
        speed: 12,
        reward: 5,
        size: 40,
        escapeDamage: 5,
        special: '震撼重击',
        bossPalette: { glow: '#FF873D', core: '#FFA500', shell: '#3D1F0A', eye: '#FFD700' }
    },
    [EnemyType.BOSS_VENOM]: {
        type: EnemyType.BOSS_VENOM,
        name: '机械神谕·狂暴',
        color: '#72E06A',
        hp: 23000,
        speed: 17,
        reward: 5,
        size: 40,
        escapeDamage: 5,
        special: '时空停滞',
        bossPalette: { glow: '#72E06A', core: '#90EE90', shell: '#0A3D0A', eye: '#FF00FF' }
    },
    [EnemyType.BOSS_INFERNO]: {
        type: EnemyType.BOSS_INFERNO,
        name: '机械神谕·核心',
        color: '#FF2D55',
        hp: 30000,
        speed: 14,
        reward: 5,
        size: 42,
        escapeDamage: 5,
        special: '毁灭射线',
        bossPalette: { glow: '#FF2D55', core: '#FF4500', shell: '#3D0A0A', eye: '#FFFF00' }
    },
    [EnemyType.BOSS_FROST]: {
        type: EnemyType.BOSS_FROST,
        name: '终焉·机械神谕',
        color: '#43BDF5',
        hp: 40000,
        speed: 12,
        reward: 5,
        size: 46,
        escapeDamage: 5,
        special: '日蚀协议',
        bossPalette: { glow: '#43BDF5', core: '#87CEEB', shell: '#0A2A3D', eye: '#FFFFFF' }
    },
    [EnemyType.BOSS_OMEGA]: {
        type: EnemyType.BOSS_OMEGA,
        name: '终极欧米伽',
        color: '#FFD166',
        hp: 50000,
        speed: 12,
        reward: 5,
        size: 48,
        escapeDamage: 5,
        special: '终极协议',
        bossPalette: { glow: '#FFD166', core: '#FFD700', shell: '#3D3D0A', eye: '#FF0000' }
    }
};
/**
 * 每波敌人的基础属性膨胀（不含词缀）。
 * 1.055^35 ≈ 6.6 —— 36波战役的终局敌人约为开场的6.6倍；
 * 难度还由每关敌群规模、分路和关卡机制共同提供，避免只靠血条膨胀。
 */
// 现在战役扩展到36波，成长曲线按总波数重标定，避免旧的1.10令终局敌人膨胀到数十倍。
export const WAVE_STAT_GROWTH = 1.015;
/**
 * 关卡难度系数（索引 0 = 第 1 关）—— **难度曲线的唯一调节旋钮**。
 *
 * 这张表取代了原来写死的 `Math.pow(1.6, chapter)`。旧曲线的问题是
 * 「每关 ×1.6」从第 2 关就开始发力：L2 就 1.6 倍、L3 2.56 倍，前三关
 * 一点也不轻松；而到第 9 关又膨胀到 1.6^8 ≈ 43.0 倍，血量全靠堆数字。
 *
 * 新曲线是**加速型**的：前段近乎平坦（1.0 → 1.12 → 1.32），中段稳步
 * 抬升，7→8→9 关陡然拉起来（7.5 → 13.0 → 40.0），关间增幅从 1.12
 * 一路走到 3.08，这就是「前松后紧、末段指数级」的数学表达。
 *
 * ⚠️ 改这里必须同时改 `LEVEL_TROOP_TUNING` 的怪潮规模，两者相乘才是
 * 真实压力（单波压力 ≈ 小怪数 × 该关倍率）。改完跑 `npm run verify:all`。
 */
export const LEVEL_DIFFICULTY_MULTIPLIERS = [
    1.00, // L1  外环循轨   —— 教学，血少怪少
    1.12, // L2  机械蛇穴
    1.32, // L3  核心反应堆
    1.85, // L4  螺旋岔口   —— 开始施压
    2.75, // L5  蛛网阵中
    4.20, // L6  跃迁迷宫
    7.50, // L7  紊乱空间   —— 高压
    13.00, // L8  迷雾回廊   —— 海量
    40.00 // L9  终焉核心   —— 终局，血量指数级
];
/** 取某关的难度系数（越界钳制到首尾） */
export function getLevelDifficultyMultiplier(levelIndex) {
    const i = Math.max(0, Math.min(LEVEL_DIFFICULTY_MULTIPLIERS.length - 1, Math.floor(levelIndex)));
    return LEVEL_DIFFICULTY_MULTIPLIERS[i];
}
export function getWaveHpMultiplier(wave) {
    const safeWave = Math.max(1, Math.floor(wave));
    // 每关固定 10 波（WAVES_PER_LEVEL），所以 chapter 等价于「关卡序号」。
    const chapter = Math.floor((safeWave - 1) / 10);
    const waveInChapter = (safeWave - 1) % 10;
    // 关间用分段倍率，关内保留 1.5%/波 的平缓爬升。
    return getLevelDifficultyMultiplier(chapter) * Math.pow(WAVE_STAT_GROWTH, waveInChapter);
}
/** 旧存档兼容常量；新全局波号按各关实际波数累计。 */
export const WAVES_PER_LEVEL = 10;
// ══ 第1关「外环防线」══════════════════════════════════════════
// 逐个引入敌人类型，让玩家建立基本认知。没有环境词缀，是纯粹的教学关。
const L1_WAVES = [
    {
        wave: 1, name: '侦察接触', archetype: 'tutorial',
        enemies: [{ type: EnemyType.NORMAL, count: 8 }],
        spawnWindow: 9,
        reward: 30
    },
    {
        wave: 2, name: '虫群突袭', archetype: 'swarm',
        enemies: [
            { type: EnemyType.NORMAL, count: 6 },
            { type: EnemyType.FAST, count: 6 }
        ],
        spawnWindow: 10,
        reward: 40
    },
    {
        wave: 3, name: '装甲推进', archetype: 'armored',
        enemies: [
            { type: EnemyType.NORMAL, count: 8 },
            { type: EnemyType.HEAVY, count: 1 }
        ],
        spawnWindow: 9,
        reward: 55
    },
    {
        wave: 4, name: '裂变', archetype: 'split',
        enemies: [
            { type: EnemyType.NORMAL, count: 6 },
            { type: EnemyType.FAST, count: 8 },
            { type: EnemyType.SPLIT, count: 3 }
        ],
        spawnWindow: 11,
        reward: 65
    },
    {
        wave: 5, name: '机械统领', archetype: 'boss', bossSkill: 'emp_stun',
        enemies: [
            { type: EnemyType.NORMAL, count: 6 },
            { type: EnemyType.FAST, count: 4 },
            { type: EnemyType.HEAVY, count: 1 },
            { type: EnemyType.BOSS, count: 1 }
        ],
        spawnWindow: 10,
        reward: 150
    }
];
// ══ 第2关「机械巢穴」══════════════════════════════════════════
// 走廊很长（1445px），敌人有充足时间被治疗；相位隐形机的相位化专门反制
// 「靠一两座高 DPS 塔解决一切」的思路。
// 环境词缀「自我复制」：任何敌人死亡都有概率裂变出小怪，清场压力贯穿整关。
const L2_WAVES = [
    {
        wave: 1, name: '潜入扫描', archetype: 'tutorial',
        enemies: [
            { type: EnemyType.NORMAL, count: 11 },
            { type: EnemyType.FAST, count: 15 },
            { type: EnemyType.GHOST, count: 8 },
            { type: EnemyType.HEAVY, count: 2 }
        ],
        spawnWindow: 11,
        reward: 95
    },
    {
        wave: 2, name: '蜂群强袭', archetype: 'swarm', modifier: 'swift',
        enemies: [
            // 纯人海波不放治疗者：治疗者速度 32，侦察机兵 90，
            // 无论前置还是后置都追不上，等于浪费一个敌种槽位。
            { type: EnemyType.NORMAL, count: 8 },
            { type: EnemyType.FAST, count: 23 },
            { type: EnemyType.GHOST, count: 8 },
            { type: EnemyType.HEALER, count: 2 }
        ],
        spawnWindow: 12,
        reward: 110
    },
    {
        wave: 3, name: '裂变扩散', archetype: 'split',
        enemies: [
            { type: EnemyType.NORMAL, count: 8 },
            { type: EnemyType.FAST, count: 15 },
            { type: EnemyType.GHOST, count: 8 },
            { type: EnemyType.SPLIT, count: 5 },
            { type: EnemyType.HEALER, count: 3 }
        ],
        spawnWindow: 12,
        reward: 125
    },
    {
        wave: 4, name: '混编压力', archetype: 'mixed', modifier: 'resistant',
        enemies: [
            { type: EnemyType.NORMAL, count: 6 },
            { type: EnemyType.FAST, count: 11 },
            { type: EnemyType.GHOST, count: 6 },
            { type: EnemyType.SPLIT, count: 2 },
            { type: EnemyType.HEALER, count: 4 },
            { type: EnemyType.HEAVY, count: 2 }
        ],
        spawnWindow: 11,
        reward: 145
    },
    {
        wave: 5, name: '机械统领·改', archetype: 'boss', bossSkill: 'overload_aura', modifier: 'armored',
        enemies: [
            { type: EnemyType.NORMAL, count: 8 },
            { type: EnemyType.FAST, count: 13 },
            { type: EnemyType.GHOST, count: 8 },
            { type: EnemyType.HEAVY, count: 6 },
            { type: EnemyType.HEALER, count: 6 },
            { type: EnemyType.BOSS_STORM, count: 1 }
        ],
        spawnWindow: 12,
        reward: 260
    }
];
// ══ 第3关「核心反应堆」══════════════════════════════════════════
// 塔位只有 12 个（三关最少），路径也不长 —— 敌人到核心很快。
// 护盾机兵克制速射流（低单发伤害被削减），自爆机雷死亡会瘫痪附近防御塔，
// 逼玩家放弃「所有塔堆在一个卡口」的惯性。
// 环境词缀「电磁干扰」：全场防御塔攻速 -15%。
const L3_WAVES = [
    {
        wave: 1, name: '自修复协议', archetype: 'support', modifier: 'healing',
        enemies: [
            { type: EnemyType.NORMAL, count: 10 },
            { type: EnemyType.SHIELD, count: 10 },
            { type: EnemyType.GHOST, count: 10 },
            { type: EnemyType.HEALER, count: 6 },
            { type: EnemyType.HEAVY, count: 4 }
        ],
        spawnWindow: 12,
        reward: 190
    },
    {
        wave: 2, name: '超频突进', archetype: 'swarm', modifier: 'swift',
        enemies: [
            { type: EnemyType.FAST, count: 20 },
            { type: EnemyType.BOMBER, count: 8 },
            { type: EnemyType.SHIELD, count: 7 },
            { type: EnemyType.HEALER, count: 5 },
            { type: EnemyType.HEAVY, count: 6 }
        ],
        spawnWindow: 12,
        reward: 215
    },
    {
        wave: 3, name: '重装壁垒', archetype: 'armored', modifier: 'armored',
        enemies: [
            { type: EnemyType.HEAVY, count: 5 },
            { type: EnemyType.SHIELD, count: 11 },
            { type: EnemyType.BOMBER, count: 6 },
            { type: EnemyType.HEALER, count: 6 },
            { type: EnemyType.SPLIT, count: 6 }
        ],
        spawnWindow: 12,
        reward: 240
    },
    {
        wave: 4, name: '全面入侵', archetype: 'mixed', modifier: 'resistant',
        enemies: [
            { type: EnemyType.NORMAL, count: 7 },
            { type: EnemyType.FAST, count: 12 },
            { type: EnemyType.SHIELD, count: 8 },
            { type: EnemyType.BOMBER, count: 4 },
            { type: EnemyType.GHOST, count: 7 },
            { type: EnemyType.HEALER, count: 5 },
            { type: EnemyType.HEAVY, count: 1 }
        ],
        spawnWindow: 12,
        reward: 280
    },
    {
        wave: 5, name: '要塞核心', archetype: 'boss', bossSkill: 'energy_shield',
        enemies: [
            { type: EnemyType.HEAVY, count: 12 },
            { type: EnemyType.SHIELD, count: 9 },
            { type: EnemyType.BOMBER, count: 6 },
            { type: EnemyType.HEALER, count: 5 },
            { type: EnemyType.SPLIT, count: 4 },
            { type: EnemyType.BOSS_WARDEN, count: 1 }
        ],
        spawnWindow: 12,
        reward: 0
    }
];
// ══ 三张地图的塔位 ══════════════════════════════════════════
// 全部由 tools/design_maps.mjs 的覆盖度优化器生成：
//   约束 1：塔位中心离路径中线 ≥46px（路径视觉半宽 19 + 塔半径 20 + 余量）
//   约束 2：塔位之间 ≥78px（避免视觉重叠）
//   约束 3：射程 100 下覆盖的路径长度 ≥100px（保证放了塔就能打到怪）
//   目标：满足约束的前提下最大化总覆盖，并奖励覆盖多个路段的「卡口位」
// 修改路径后请重新运行该工具，不要手改坐标。
// 外环防线：S 形折返，路径 1040px，14 塔位，8 个卡口位
const L1_SLOTS = [
    { x: 154, y: 152, occupied: false }, // 3段 覆盖279px
    { x: 274, y: 168, occupied: false }, // 2段 覆盖165px
    { x: 50, y: 272, occupied: false }, // 3段 覆盖182px
    { x: 162, y: 272, occupied: false }, // 4段 覆盖406px
    { x: 242, y: 272, occupied: false }, // 3段 覆盖205px
    { x: 314, y: 304, occupied: false }, // 2段 覆盖172px
    { x: 394, y: 336, occupied: false }, // 2段 覆盖131px
    { x: 50, y: 352, occupied: false }, // 2段 覆盖135px
    { x: 122, y: 400, occupied: false }, // 2段 覆盖157px
    { x: 202, y: 424, occupied: false }, // 3段 覆盖197px
    { x: 282, y: 424, occupied: false }, // 4段 覆盖408px
    { x: 402, y: 424, occupied: false }, // 3段 覆盖178px
    { x: 178, y: 536, occupied: false }, // 2段 覆盖166px
    { x: 298, y: 552, occupied: false } // 3段 覆盖278px
];
// 机械巢穴：四条横向回廊的长蛇形，路径 1445px，16 塔位，8 个卡口位
const L2_SLOTS = [
    { x: 178, y: 152, occupied: false }, // 2段 覆盖128px
    { x: 298, y: 216, occupied: false }, // 4段 覆盖416px
    { x: 218, y: 224, occupied: false }, // 3段 覆盖246px
    { x: 138, y: 240, occupied: false }, // 2段 覆盖178px
    { x: 42, y: 256, occupied: false }, // 2段 覆盖121px
    { x: 146, y: 360, occupied: false }, // 3段 覆盖424px
    { x: 226, y: 360, occupied: false }, // 2段 覆盖294px
    { x: 306, y: 360, occupied: false }, // 4段 覆盖294px
    { x: 386, y: 360, occupied: false }, // 4段 覆盖188px
    { x: 50, y: 464, occupied: false }, // 2段 覆盖125px
    { x: 138, y: 472, occupied: false }, // 2段 覆盖182px
    { x: 218, y: 488, occupied: false }, // 3段 覆盖246px
    { x: 298, y: 496, occupied: false }, // 4段 覆盖422px
    { x: 178, y: 560, occupied: false }, // 2段 覆盖118px
    { x: 402, y: 600, occupied: false }, // 2段 覆盖121px
    { x: 314, y: 608, occupied: false } // 3段 覆盖243px
];
// 核心反应堆：紧凑折返，路径 1120px，12 塔位（三关最少），9 个卡口位
const L3_SLOTS = [
    { x: 178, y: 176, occupied: false }, // 2段 覆盖156px
    { x: 202, y: 256, occupied: false }, // 4段 覆盖242px
    { x: 282, y: 256, occupied: false }, // 4段 覆盖434px
    { x: 106, y: 304, occupied: false }, // 2段 覆盖129px
    { x: 98, y: 384, occupied: false }, // 3段 覆盖178px
    { x: 314, y: 384, occupied: false }, // 4段 覆盖238px
    { x: 234, y: 392, occupied: false }, // 4段 覆盖402px
    { x: 106, y: 472, occupied: false }, // 2段 覆盖128px
    { x: 226, y: 512, occupied: false }, // 5段 覆盖400px
    { x: 354, y: 512, occupied: false }, // 3段 覆盖180px
    { x: 154, y: 544, occupied: false }, // 4段 覆盖131px
    { x: 298, y: 616, occupied: false } // 3段 覆盖194px
];
// ══ 关卡定义 ════════════════════════════════════════════════
export const LEVELS = [
    {
        id: 1,
        name: '外环防线',
        subtitle: '数据中枢外围 · 机械先遣',
        accent: '#00F0FF',
        path: [
            { x: 225, y: 80 }, { x: 225, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 350 },
            { x: 350, y: 350 }, { x: 350, y: 500 }, { x: 225, y: 500 }, { x: 225, y: 620 }
        ],
        slots: L1_SLOTS,
        waves: L1_WAVES,
        clearFloor: Rarity.R,
        clearGold: 250,
        // 第一关是教学关：单方面下调，其它关不动。
        // ⚠️ 只改 L1_WAVES 里的 count 是**无效的** —— makeSmallEnemyGroups 会把
        // 每波小怪归一化回 SMALL_ENEMIES_PER_WAVE，必须从这里按关覆盖才真的生效。
        smallEnemiesPerWave: 20,
        eliteCountBase: 2,
        enemyHpMult: 0.85
    },
    {
        id: 2,
        name: '机械巢穴',
        subtitle: '地下机库 · 增殖协议',
        accent: '#9D00FF',
        path: [
            { x: 225, y: 80 }, { x: 225, y: 155 }, { x: 375, y: 155 }, { x: 375, y: 290 },
            { x: 75, y: 290 }, { x: 75, y: 425 }, { x: 375, y: 425 }, { x: 375, y: 560 },
            { x: 225, y: 560 }, { x: 225, y: 625 }
        ],
        slots: L2_SLOTS,
        waves: L2_WAVES,
        clearFloor: Rarity.SR,
        clearGold: 400,
        modifier: {
            type: 'infection',
            name: '自我复制',
            icon: '🧬',
            description: '敌人死亡时有 18% 概率裂变出微型机虫',
            deathSplitChance: 0.18
        }
    },
    {
        id: 3,
        name: '核心反应堆',
        subtitle: '主控中枢 · 神谕降临',
        accent: '#FF0033',
        path: [
            { x: 225, y: 90 }, { x: 225, y: 195 }, { x: 360, y: 195 }, { x: 360, y: 320 },
            { x: 150, y: 320 }, { x: 150, y: 455 }, { x: 305, y: 455 }, { x: 305, y: 570 },
            { x: 225, y: 570 }, { x: 225, y: 630 }
        ],
        slots: L3_SLOTS,
        waves: L3_WAVES,
        clearFloor: Rarity.SSR,
        clearGold: 0,
        modifier: {
            type: 'emp',
            name: '电磁干扰',
            icon: '⚡',
            description: '全场防御塔攻速 -15%',
            towerIntervalMult: 1.18
        }
    }
];
const extraLevelData = [
    // L4 螺旋岔口：4 入口树状收拢
    { name: '螺旋岔口', subtitle: '四路汇聚 · 分流协议', accent: '#43F5C8', theme: 'decoy', desc: '敌人从四条分岔路线交替推进', skill: 'gold_drain', mode: 'balanced', routes: [
            [{ x: 60, y: 80 }, { x: 60, y: 220 }, { x: 150, y: 360 }, { x: 225, y: 560 }, { x: 225, y: 640 }],
            [{ x: 170, y: 80 }, { x: 170, y: 220 }, { x: 150, y: 360 }, { x: 225, y: 560 }, { x: 225, y: 640 }],
            [{ x: 280, y: 80 }, { x: 280, y: 220 }, { x: 300, y: 360 }, { x: 225, y: 560 }, { x: 225, y: 640 }],
            [{ x: 390, y: 80 }, { x: 390, y: 220 }, { x: 300, y: 360 }, { x: 225, y: 560 }, { x: 225, y: 640 }]
        ],
        groups: [[{ type: EnemyType.GHOST, count: 12 }, { type: EnemyType.FAST, count: 12 }], [{ type: EnemyType.SPLIT, count: 10 }, { type: EnemyType.HEALER, count: 5 }], [{ type: EnemyType.HEAVY, count: 7 }, { type: EnemyType.BOSS_PHANTOM, count: 1 }]] },
    // L5 蛛网阵中：4 入口中心放射（allowUpward）
    { name: '蛛网阵中', subtitle: '四向放射 · 核心协议', accent: '#FF873D', theme: 'forge', desc: '敌人从四角向中心核心推进', skill: 'earthquake', mode: 'random', routes: [
            [{ x: 45, y: 80 }, { x: 120, y: 200 }, { x: 225, y: 380 }],
            [{ x: 405, y: 80 }, { x: 330, y: 200 }, { x: 225, y: 380 }],
            [{ x: 45, y: 680 }, { x: 120, y: 540 }, { x: 225, y: 380 }],
            [{ x: 405, y: 680 }, { x: 330, y: 540 }, { x: 225, y: 380 }]
        ],
        groups: [[{ type: EnemyType.BOMBER, count: 8 }, { type: EnemyType.FAST, count: 12 }], [{ type: EnemyType.HEAVY, count: 8 }, { type: EnemyType.SHIELD, count: 8 }], [{ type: EnemyType.BOMBER, count: 10 }, { type: EnemyType.BOSS_TITAN, count: 1 }]] },
    // L6 跃迁迷宫：3 入口 + 3 传送门
    { name: '跃迁迷宫', subtitle: '空间折叠 · 跃迁协议', accent: '#43BDF5', theme: 'tide', desc: '敌人通过传送门在空间内跳跃', skill: 'silence_field', mode: 'random', routes: [
            [{ x: 60, y: 80 }, { x: 60, y: 200 }, { x: 120, y: 300 }],
            [{ x: 225, y: 80 }, { x: 225, y: 200 }, { x: 280, y: 300 }],
            [{ x: 390, y: 80 }, { x: 390, y: 200 }, { x: 340, y: 300 }]
        ],
        groups: [[{ type: EnemyType.FAST, count: 16 }, { type: EnemyType.NORMAL, count: 10 }], [{ type: EnemyType.HEALER, count: 6 }, { type: EnemyType.GHOST, count: 12 }], [{ type: EnemyType.SHIELD, count: 10 }, { type: EnemyType.BOSS_NIGHTMARE, count: 1 }]] },
    // L7 紊乱空间：4 入口 + 4 传送门
    { name: '紊乱空间', subtitle: '紊乱跃迁 · 超载协议', accent: '#C084FC', theme: 'gravity', desc: '四座传送门构成紊乱网络', skill: 'time_stop', mode: 'balanced', routes: [
            [{ x: 60, y: 80 }, { x: 60, y: 180 }, { x: 100, y: 280 }],
            [{ x: 390, y: 80 }, { x: 390, y: 180 }, { x: 350, y: 280 }],
            [{ x: 60, y: 440 }, { x: 100, y: 360 }, { x: 150, y: 300 }],
            [{ x: 390, y: 440 }, { x: 350, y: 360 }, { x: 300, y: 300 }]
        ],
        groups: [[{ type: EnemyType.HEAVY, count: 7 }, { type: EnemyType.NORMAL, count: 12 }], [{ type: EnemyType.SPLIT, count: 12 }, { type: EnemyType.BOMBER, count: 7 }], [{ type: EnemyType.SHIELD, count: 12 }, { type: EnemyType.BOSS_VENOM, count: 1 }]] },
    // L8 迷雾回廊：2 入口 + 2 传送门 + 2 雾区
    { name: '迷雾回廊', subtitle: '信号盲区 · 迷雾协议', accent: '#B58CFF', theme: 'archive', desc: '迷雾笼罩禁区，炮塔无法锁定其中目标', skill: 'death_ray', mode: 'balanced', routes: [
            [{ x: 80, y: 80 }, { x: 80, y: 220 }, { x: 130, y: 360 }],
            [{ x: 370, y: 80 }, { x: 370, y: 220 }, { x: 320, y: 360 }]
        ],
        groups: [[{ type: EnemyType.GHOST, count: 15 }, { type: EnemyType.SHIELD, count: 6 }], [{ type: EnemyType.HEALER, count: 9 }, { type: EnemyType.SPLIT, count: 8 }], [{ type: EnemyType.GHOST, count: 12 }, { type: EnemyType.BOSS_INFERNO, count: 1 }]] },
    // L9 终焉核心：4 入口复杂迷宫
    { name: '终焉核心', subtitle: '终焉双路 · 日蚀协议', accent: '#FFD166', theme: 'eclipse', desc: '炮塔攻速降低15%；终局Boss周期冻结全场', skill: 'eclipse_protocol', mode: 'random', routes: [
            [{ x: 60, y: 80 }, { x: 60, y: 170 }, { x: 160, y: 170 }, { x: 160, y: 300 }, { x: 280, y: 300 }, { x: 280, y: 430 }, { x: 225, y: 430 }, { x: 225, y: 640 }],
            [{ x: 390, y: 80 }, { x: 390, y: 170 }, { x: 290, y: 170 }, { x: 290, y: 300 }, { x: 170, y: 300 }, { x: 170, y: 430 }, { x: 225, y: 430 }, { x: 225, y: 640 }],
            [{ x: 60, y: 500 }, { x: 120, y: 500 }, { x: 120, y: 420 }, { x: 190, y: 420 }, { x: 225, y: 500 }, { x: 225, y: 640 }],
            [{ x: 225, y: 80 }, { x: 225, y: 180 }, { x: 180, y: 260 }, { x: 270, y: 340 }, { x: 225, y: 430 }, { x: 225, y: 640 }]
        ],
        groups: [[{ type: EnemyType.FAST, count: 20 }, { type: EnemyType.HEAVY, count: 8 }], [{ type: EnemyType.SHIELD, count: 12 }, { type: EnemyType.HEALER, count: 8 }, { type: EnemyType.BOMBER, count: 8 }], [{ type: EnemyType.SPLIT, count: 12 }, { type: EnemyType.BOSS_FROST, count: 1 }]] }
];
/** 塔位中心到任一路径中线至少50px：塔位框半宽22px、道路半宽19px，边缘净空至少9px。 */
const MIN_TOWER_SLOT_PATH_DISTANCE = 50;
function makeExtraSlots(routes, count, warpSegments = []) {
    const slots = [];
    // 传送段（points[i] → points[i+1]）不是可行走的路面，既不铺路也不该
    // 占掉塔位的净空、更不该被算成"有效射程覆盖"。所以从几何里整体剔除。
    const isWarp = (routeIndex, segIndex) => (warpSegments[routeIndex] ?? []).includes(segIndex);
    const segments = routes.map((route, ri) => route.slice(0, -1)
        .map((p, i) => ({ a: p, b: route[i + 1] }))
        .filter((_, i) => !isWarp(ri, i)));
    const nearestPath = (x, y, routeSegments) => {
        let best = Infinity;
        for (const { a, b } of routeSegments) {
            const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
            const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
            best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
        }
        return best;
    };
    const candidates = [];
    for (let y = 128; y <= 620; y += 8)
        for (let x = 42; x <= 408; x += 8) {
            const distances = segments.map(s => nearestPath(x, y, s));
            if (Math.min(...distances) < MIN_TOWER_SLOT_PATH_DISTANCE)
                continue;
            // 多路线图只要求每个点位至少能压住一条可选路线；所有分支另由实战覆盖检验。
            const cover = Math.max(...segments.map(route => (() => {
                let total = 0;
                for (const { a, b } of route) {
                    const length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(length / 4);
                    for (let i = 0; i < steps; i++) {
                        const t = (i + 0.5) / steps;
                        if (Math.hypot(x - (a.x + (b.x - a.x) * t), y - (a.y + (b.y - a.y) * t)) <= 100)
                            total += length / steps;
                    }
                }
                return total;
            })()));
            if (cover >= 100)
                candidates.push({ x, y, cover });
        }
    // 贪心分散塔位：先保证实际射程覆盖，再偏好远离已选塔位的位置，避免点位挤在一个路口。
    while (slots.length < count) {
        let best;
        for (const c of candidates) {
            if (slots.some(s => Math.hypot(s.x - c.x, s.y - c.y) < 78))
                continue;
            const spread = slots.length ? Math.min(140, ...slots.map(s => Math.hypot(s.x - c.x, s.y - c.y))) : 0;
            const score = c.cover + spread * 0.22;
            if (!best || score > best.score)
                best = { ...c, score };
        }
        if (!best)
            break;
        slots.push({ x: best.x, y: best.y, occupied: false });
        candidates.splice(candidates.findIndex(c => c.x === best.x && c.y === best.y), 1);
    }
    return slots;
}
/**
 * 对外暴露的塔位生成器（供 `tools/probe_slots.mjs` 这类设计工具试算）。
 * 游戏内仍然只由末尾那个 `for (const level of LEVELS)` 循环调用它，
 * 所以不会产生第二套塔位。
 */
export function buildTowerSlots(routes, count, warpSegments = []) {
    return makeExtraSlots(routes, count, warpSegments);
}
/**
 * 九关路线拓扑 —— 数据源在 `MapConfig.ts`。
 *
 * 历史包袱说明：这个文件里原本有一份 `maps[0..8]` 手写坐标表，和
 * `LEVELS[i].path` / `extraLevelData[].routes` 一起构成了**三份互相矛盾的
 * 地图数据**（只有这里真正生效）。现在统一收敛到 `MapConfig.ts`，
 * 这里只做"取表 + 深拷贝"，避免调用方改到共享对象。
 */
function makeCampaignRoutes(levelId) {
    return getLevelMap(levelId).routes.map(route => route.points.map(p => ({ x: p.x, y: p.y })));
}
/** 每条路线的传送门段号（与 makeCampaignRoutes 返回的数组一一对应） */
function makeCampaignWarps(levelId) {
    return getLevelMap(levelId).routes.map(route => [...(route.warps ?? [])]);
}
/** 每关采用不同分路策略；波次内以稳定顺序复现，便于玩家读图和排布。 */
const ROUTE_MODE_PATTERNS = [
    ['main'], ['balanced'], ['random'], ['random', 'main'], ['main', 'balanced', 'random'],
    ['balanced', 'random'], ['random', 'balanced', 'main'], ['random', 'random', 'balanced'],
    ['balanced', 'main', 'random']
];
/** 每波固定30只小怪；依据关卡模板分配种类，避免只把数量堆到单一敌种。 */
const SMALL_ENEMIES_PER_WAVE = 30;
/**
 * 单波分裂怪占比上限。
 *
 * 分裂怪死亡会再生成 2 只微型虫，所以「本体 + 子体」的实际同屏数是
 * `N + 2 × split`。若某波小怪全是分裂怪（历史配置里第 9 关的
 * 第 3/6/9 波就是这种），怪潮规模一抬到 50 只，峰值就会冲到 150+，
 * 既掉帧又变成纯数值碾压。这里把占比压到 35% 以内，溢出部分换成
 * 基础兵种 —— 总量不变，压力曲线不变，同屏峰值可控。
 */
const SPLIT_SHARE_CAP = 0.35;
function capSplitShare(groups) {
    const split = groups.find(g => g.type === EnemyType.SPLIT);
    if (!split)
        return groups;
    const total = groups.reduce((sum, g) => sum + g.count, 0);
    const maxSplit = Math.max(1, Math.floor(total * SPLIT_SHARE_CAP));
    if (split.count <= maxSplit)
        return groups;
    const overflow = split.count - maxSplit;
    split.count = maxSplit;
    const filler = groups.find(g => g.type === EnemyType.NORMAL || g.type === EnemyType.FAST);
    if (filler)
        filler.count += overflow;
    else
        groups.push({ type: EnemyType.NORMAL, count: overflow });
    return groups;
}
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
export const LEVEL_TROOP_TUNING = [
    { small: 20, elite: 2, hp: 0.80 }, // L1 教学：血少怪少
    { small: 20, elite: 3, hp: 1.00 },
    { small: 22, elite: 3, hp: 1.00 },
    { small: 24, elite: 3, hp: 1.00 },
    { small: 26, elite: 3, hp: 1.00 },
    { small: 30, elite: 4, hp: 1.00 },
    { small: 36, elite: 4, hp: 1.00 }, // L7 高压
    { small: 44, elite: 5, hp: 1.00 }, // L8 海量
    { small: 52, elite: 5, hp: 1.00 } // L9 终局
];
export const WAVE_END_GOLD_REWARD = 60;
const WAVE_CLEAR_GOLD = WAVE_END_GOLD_REWARD;
const SMALL_ENEMY_TYPES = new Set([EnemyType.NORMAL, EnemyType.FAST, EnemyType.SPLIT, EnemyType.HEALER, EnemyType.MINI, EnemyType.GHOST]);
function makeSmallEnemyGroups(source, total = SMALL_ENEMIES_PER_WAVE) {
    const weights = source.filter(g => SMALL_ENEMY_TYPES.has(g.type));
    const usable = weights.length ? weights : [{ type: EnemyType.NORMAL, count: 1 }];
    const totalCount = usable.reduce((sum, g) => sum + g.count, 0);
    const groups = usable.map(g => ({ type: g.type, count: Math.floor(total * g.count / totalCount), remainder: (total * g.count) % totalCount }));
    const ranked = [...groups].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0, left = total - groups.reduce((sum, g) => sum + g.count, 0); i < left; i++)
        ranked[i % ranked.length].count++;
    return groups.filter(g => g.count > 0).map(({ type, count }) => ({ type, count }));
}
/** 把原型扩展为10波：每波 N 只小怪（可按关下调），每3波另加精英，最后一波保留Boss。 */
function expandLevelWaves(level) {
    const source = level.waves;
    const bossWave = [...source].reverse().find(w => w.archetype === 'boss');
    const templates = source.filter(w => w.archetype !== 'boss');
    const routeModes = ROUTE_MODE_PATTERNS[level.id - 1] ?? ['main'];
    const bossSkills = ['emp_stun', 'overload_aura', 'energy_shield', 'gold_drain', 'earthquake', 'silence_field', 'time_stop', 'death_ray', 'eclipse_protocol'];
    const smallTotal = level.smallEnemiesPerWave ?? SMALL_ENEMIES_PER_WAVE;
    const eliteBase = level.eliteCountBase ?? 3;
    const result = [];
    const eliteTypes = [EnemyType.HEAVY, EnemyType.SHIELD, EnemyType.BOMBER];
    const eliteNames = ['重装精英截击', '护盾精英推进', '自爆精英突袭'];
    for (let i = 0; i < 9; i++) {
        const template = templates[i % templates.length];
        // capSplitShare 必须在加精英之前跑：它按"当前小怪总量"算占比。
        const enemies = capSplitShare(makeSmallEnemyGroups(template.enemies, smallTotal));
        if ((i + 1) % 3 === 0)
            enemies.push({ type: eliteTypes[Math.floor(i / 3)], count: eliteBase + Math.floor(i / 3) });
        result.push({ ...template, wave: i + 1,
            name: (i + 1) % 3 === 0 ? eliteNames[Math.floor(i / 3)] : template.name,
            archetype: (i + 1) % 3 === 0 ? (i === 8 ? 'mixed' : 'armored') : template.archetype,
            enemies, spawnWindow: 18, reward: WAVE_CLEAR_GOLD, routeMode: routeModes[i % routeModes.length] });
    }
    if (bossWave)
        result.push({ ...bossWave, wave: 10,
            enemies: [...capSplitShare(makeSmallEnemyGroups(bossWave.enemies, smallTotal)), ...bossWave.enemies.filter(g => isBossType(g.type)).map(g => ({ ...g }))],
            spawnWindow: 18, reward: WAVE_CLEAR_GOLD, bossSkill: bossSkills[level.id - 1] ?? bossWave.bossSkill,
            routeMode: routeModes[9 % routeModes.length] });
    return result;
}
/** 敌人基础生命的关卡额外乘数（教学关可以单独压低，其它关保持 1） */
export function getLevelHpFactor(levelIndex) {
    const lv = LEVELS[levelIndex];
    return lv?.enemyHpMult ?? 1;
}
for (const d of extraLevelData) {
    const id = LEVELS.length + 1, routes = makeCampaignRoutes(id);
    const waves = d.groups.map((baseEnemies, w) => {
        const enemyGrowth = 1 + (id - 4) * 0.14;
        const bossUnits = baseEnemies.filter(group => isBossType(group.type)).reduce((sum, group) => sum + group.count, 0);
        const baseMinions = baseEnemies.reduce((sum, group) => sum + (isBossType(group.type) ? 0 : group.count), 0);
        const splitUnits = baseEnemies.filter(group => group.type === EnemyType.SPLIT).reduce((sum, group) => sum + group.count, 0);
        // 分裂单位预估还会生成两只微型虫；限制本体+子体规模，避免关卡高压波堆到百只同屏。
        const waveGrowth = Math.min(enemyGrowth, Math.max(0.65, (52 - bossUnits) / Math.max(1, baseMinions + splitUnits * 2)));
        const waveMinionGrowth = waveGrowth;
        const enemies = baseEnemies.map(group => ({
            ...group,
            // 每章首领只保留原定Boss数量，逐关增加护卫规模，保证压迫感递增且不刷成Boss复制波。
            count: isBossType(group.type) ? group.count : Math.max(1, Math.round(group.count * waveMinionGrowth))
        }));
        return {
            wave: w + 1, name: w === 2 ? `${d.name}守门者` : ['先遣试探', '机制协同'][w],
            archetype: w === 2 ? 'boss' : w === 1 ? 'mixed' : 'swarm', enemies,
            spawnWindow: w === 2 ? 11 : 10, reward: w === 2 ? 260 + id * 18 : 100 + id * 22,
            routeMode: d.mode, ...(w === 2 ? { bossSkill: d.skill, modifier: id >= 7 ? 'armored' : undefined } : {})
        };
    });
    LEVELS.push({ id, name: d.name, subtitle: d.subtitle, accent: d.accent, path: routes[0], routes,
        slots: makeExtraSlots(routes, id === 9 ? 14 : 16), waves, clearFloor: id === 9 ? Rarity.SSR : Rarity.SR,
        clearGold: id === 9 ? 0 : 350 + id * 35,
        modifier: { type: d.theme, name: d.theme, icon: '✦', description: d.desc,
            ...(id === 7 ? { towerIntervalMult: 1.08 } : {}),
            ...(id === 8 ? { towerIntervalMult: 1.12 } : {}),
            ...(id === 9 ? { towerIntervalMult: 1.15 } : {}) }
    });
}
// 九关地图统一装配：路线、塔位、波次、核心位置
for (const level of LEVELS) {
    const mapDef = getLevelMap(level.id);
    const routes = makeCampaignRoutes(level.id);
    const warps = makeCampaignWarps(level.id);
    level.routes = routes;
    level.path = routes[0];
    level.warpSegments = warps;
    // 核心位置统一由 MapConfig 决定：所有路线必须汇到这一点。
    level.core = { x: mapDef.core.x, y: mapDef.core.y };
    // 怪潮规模（前松后紧的"怪少/海量"那一半，另一半是难度倍率）。
    const tuning = LEVEL_TROOP_TUNING[level.id - 1];
    if (tuning) {
        level.smallEnemiesPerWave = tuning.small;
        level.eliteCountBase = tuning.elite;
        level.enemyHpMult = tuning.hp;
    }
    // 塔位目标数：路线越密净空越少，四门图（第9关）留 14 个。
    const slotTarget = level.id === 9 ? 14 : level.id === 7 ? 18 : 16;
    // 传送门关卡：把 outgoing 也加进 routes，这样塔位生成器能看到传送门后的路径
    let slotRoutes = routes;
    if (mapDef.portals?.length) {
        slotRoutes = [...routes, ...mapDef.portals.map(p => p.outgoing.map(pt => ({ x: pt.x, y: pt.y })))];
    }
    level.slots = makeExtraSlots(slotRoutes, slotTarget, warps);
    level.waves = expandLevelWaves(level);
}
// ══ 活动关卡（live binding）══════════════════════════════════
// PATH_POINTS / TOWER_SLOTS / WAVE_CONFIGS / TOTAL_WAVES 都是可重绑定的
// 导出变量，setActiveLevel() 会原地改写它们。ES2020 的模块导出是 live
// binding，所以 Enemy / TowerMergeSystem / WaveManager 里那些
// `PATH_POINTS[i]`、`TOWER_SLOTS[i]` 读取处会自动看到新值，无需改动。
//
// 注意 TOWER_SLOTS 必须返回**全新的对象**：occupied 是运行时状态，
// 直接复用 LEVELS[i].slots 会让上一关的占位标记残留到下一关。
function cloneSlots(src) {
    return src.map(s => ({ x: s.x, y: s.y, occupied: false }));
}
export let ACTIVE_LEVEL_INDEX = 0;
export let PATH_POINTS = LEVELS[0].path;
export let PATH_ROUTES = LEVELS[0].routes ?? [LEVELS[0].path];
/** 每条路线的传送门段号，与 PATH_ROUTES 等长 */
export let PATH_WARP_SEGMENTS = LEVELS[0].warpSegments ?? [];
export let TOWER_SLOTS = cloneSlots(LEVELS[0].slots);
export let WAVE_CONFIGS = LEVELS[0].waves;
export let TOTAL_WAVES = WAVE_CONFIGS.length;
/** 随机传送门网络（L6/L7/L8）—— 敌人走到路线终点时随机跳到其余门 */
export let ACTIVE_PORTALS = (getLevelMap(LEVELS[0].id).portals ?? []).map(p => ({
    id: p.id,
    label: p.label,
    color: p.color,
    x: p.x,
    y: p.y,
    outgoing: p.outgoing.map(pt => ({ x: pt.x, y: pt.y }))
}));
/** 迷雾禁区（L8）—— 雾内敌人无法被防御塔锁定/攻击 */
export let ACTIVE_FOG_ZONES = (getLevelMap(LEVELS[0].id).fogZones ?? []).map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h }));
export function getLevelCount() {
    return LEVELS.length;
}
export function getActiveLevel() {
    return LEVELS[ACTIVE_LEVEL_INDEX];
}
/** 切换活动关卡：重绑定地图与波次，并清空塔位占位状态 */
export function setActiveLevel(index) {
    const idx = Math.max(0, Math.min(LEVELS.length - 1, index));
    ACTIVE_LEVEL_INDEX = idx;
    const lv = LEVELS[idx];
    PATH_POINTS = lv.path;
    PATH_ROUTES = lv.routes ?? [lv.path];
    PATH_WARP_SEGMENTS = lv.warpSegments ?? [];
    TOWER_SLOTS = cloneSlots(lv.slots);
    WAVE_CONFIGS = lv.waves;
    TOTAL_WAVES = lv.waves.length;
    // 同步传送门网络和雾区（L6/L7/L8 使用）
    const mapDef = getLevelMap(lv.id);
    ACTIVE_PORTALS = mapDef.portals ?? [];
    ACTIVE_FOG_ZONES = mapDef.fogZones ?? [];
    return lv;
}
/** 关内波号 → 全局波号（决定敌人属性倍率） */
export function getGlobalWave(levelIndex, waveInLevel) {
    const prior = LEVELS.slice(0, Math.max(0, levelIndex)).reduce((sum, level) => sum + level.waves.length, 0);
    return prior + waveInLevel;
}
/** 是否为 Boss 波（当前关卡的最后一波） */
export function isBossWave(wave) {
    const cfg = WAVE_CONFIGS[wave - 1];
    return !!cfg && cfg.archetype === 'boss';
}
// 强化类型
export var UpgradeType;
(function (UpgradeType) {
    UpgradeType["ALL_DAMAGE"] = "all_damage";
    UpgradeType["ALL_SPEED"] = "all_speed";
    UpgradeType["CONTROL_MATRIX"] = "control_matrix";
    UpgradeType["SIEGE_PROTOCOL"] = "siege_protocol";
    UpgradeType["FROST_SLOW"] = "frost_slow";
    UpgradeType["ELECTRIC_CHAIN"] = "electric_chain";
    UpgradeType["POISON_DURATION"] = "poison_duration";
    UpgradeType["BOMB_RANGE"] = "bomb_range";
    UpgradeType["MERGE_BONUS"] = "merge_bonus";
    UpgradeType["FUSION_BONUS"] = "fusion_bonus";
    UpgradeType["GOLD_BONUS"] = "gold_bonus";
    UpgradeType["HEAL"] = "heal";
    UpgradeType["ELITE_EXPLODE"] = "elite_explode"; // 精英死亡爆炸
})(UpgradeType || (UpgradeType = {}));
export const UPGRADE_CONFIGS = {
    [UpgradeType.ALL_DAMAGE]: {
        type: UpgradeType.ALL_DAMAGE,
        name: '动能火控',
        icon: '⚔️',
        description: '伤害 +12%',
        targetLabel: '脉冲炮 / 磁轨炮',
        targetTypes: [TowerType.MACHINE_GUN, TowerType.SNIPER], damageScale: 1.12,
        maxStack: 4
    },
    [UpgradeType.ALL_SPEED]: {
        type: UpgradeType.ALL_SPEED,
        name: '元素超频',
        icon: '💨',
        description: '攻速 +10%',
        targetLabel: '冷冻炮 / 电磁炮 / 毒蚀炮 / 焚化器',
        targetTypes: [TowerType.FROST, TowerType.ELECTRIC, TowerType.POISON, TowerType.FLAME], speedScale: 1.10,
        maxStack: 4
    },
    [UpgradeType.CONTROL_MATRIX]: {
        type: UpgradeType.CONTROL_MATRIX, name: '控制矩阵', icon: '🧲',
        description: '伤害 +10%',
        targetLabel: '冷冻炮 / 引力场',
        targetTypes: [TowerType.FROST, TowerType.MAGNETIC], damageScale: 1.10,
        maxStack: 4
    },
    [UpgradeType.SIEGE_PROTOCOL]: {
        type: UpgradeType.SIEGE_PROTOCOL, name: '重炮协议', icon: '💥',
        description: '伤害 +12%',
        targetLabel: '导弹台 / 激光炮 / 奇点炮',
        targetTypes: [TowerType.BOMB, TowerType.LASER, TowerType.SINGULARITY], damageScale: 1.12,
        maxStack: 4
    },
    [UpgradeType.FROST_SLOW]: {
        type: UpgradeType.FROST_SLOW,
        name: '极寒强化',
        icon: '🥶',
        description: '减速强度 +20%',
        targetLabel: '冷冻炮',
        targetTypes: [TowerType.FROST],
        maxStack: 3
    },
    [UpgradeType.ELECTRIC_CHAIN]: {
        type: UpgradeType.ELECTRIC_CHAIN,
        name: '连锁闪电',
        icon: '⚡',
        description: '弹射目标 +1',
        targetLabel: '电磁炮', targetTypes: [TowerType.ELECTRIC],
        maxStack: 3
    },
    [UpgradeType.POISON_DURATION]: {
        type: UpgradeType.POISON_DURATION,
        name: '剧毒强化',
        icon: '🧪',
        description: '毒素持续 +2 秒',
        targetLabel: '毒蚀炮', targetTypes: [TowerType.POISON],
        maxStack: 3
    },
    [UpgradeType.BOMB_RANGE]: {
        type: UpgradeType.BOMB_RANGE,
        name: '爆破强化',
        icon: '💥',
        description: '爆炸范围 +20%',
        targetLabel: '导弹台 / 奇点炮', targetTypes: [TowerType.BOMB, TowerType.SINGULARITY],
        maxStack: 3
    },
    [UpgradeType.MERGE_BONUS]: {
        type: UpgradeType.MERGE_BONUS,
        name: '合成大师',
        icon: '🔮',
        description: '合成时攻击力 +5',
        targetLabel: '合成后获得的炮塔',
        maxStack: 3
    },
    [UpgradeType.FUSION_BONUS]: {
        type: UpgradeType.FUSION_BONUS,
        name: '控制强化',
        icon: '🌟',
        // 枚举键沿用历史命名（fusion_bonus），实际作用于电磁炮 / 磁引塔的眩晕触发概率
        description: '眩晕触发概率 +15 个百分点',
        targetLabel: '电磁炮 / 磁引塔',
        maxStack: 3
    },
    [UpgradeType.GOLD_BONUS]: {
        type: UpgradeType.GOLD_BONUS,
        name: '财富积累',
        icon: '💰',
        description: '每波结束获得30额外金币',
        targetLabel: '全局资源强化',
        maxStack: 5
    },
    [UpgradeType.HEAL]: {
        type: UpgradeType.HEAL,
        name: '紧急修复',
        icon: '❤️',
        description: '核心病房恢复3点生命',
        targetLabel: '核心',
        maxStack: 99
    },
    [UpgradeType.ELITE_EXPLODE]: {
        type: UpgradeType.ELITE_EXPLODE,
        name: '精英爆破',
        icon: '🎆',
        description: '精英怪死亡时产生范围爆炸',
        targetLabel: '精英死亡被动',
        maxStack: 1
    }
};
export const TOWER_SKILLS = [
    {
        towerType: TowerType.MACHINE_GUN,
        level: 2,
        skills: [
            {
                id: 'mg_rapid',
                name: '急速射击',
                icon: '⚡',
                description: '攻速提升35%',
                effect: 'speed+35%'
            },
            {
                id: 'mg_pierce',
                name: '穿甲弹',
                icon: '🎯',
                description: '攻击无视30%护甲',
                effect: 'pierce+30%'
            },
            {
                id: 'mg_multi',
                name: '多重射击',
                icon: '🔫',
                description: '同时攻击2个目标',
                effect: 'multi+1'
            }
        ]
    },
    {
        towerType: TowerType.FROST,
        level: 2,
        skills: [
            {
                id: 'frost_deep',
                name: '深度冻结',
                icon: '❄️',
                description: '减速效果提升至70%',
                effect: 'slow+70%'
            },
            {
                id: 'frost_aoe',
                name: '寒霜领域',
                icon: '💠',
                description: '攻击时对周围敌人造成50%减速',
                effect: 'aoe_slow'
            },
            {
                id: 'frost_shatter',
                name: '碎裂',
                icon: '💥',
                description: '对减速目标造成额外30%伤害',
                effect: 'shatter+30%'
            }
        ]
    },
    {
        towerType: TowerType.ELECTRIC,
        level: 2,
        skills: [
            {
                id: 'elec_chain',
                name: '连锁闪电',
                icon: '⚡',
                description: '弹射次数+2',
                effect: 'chain+2'
            },
            {
                id: 'elec_stun',
                name: '麻痹',
                icon: '💫',
                description: '眩晕概率+8%（基础10%），持续1.1秒',
                effect: 'stun+8%'
            },
            {
                id: 'elec_overload',
                name: '过载',
                icon: '🔥',
                description: '弹射伤害提升至100%',
                effect: 'chain_damage+100%'
            }
        ]
    },
    {
        towerType: TowerType.POISON,
        level: 2,
        skills: [
            {
                id: 'poison_spread',
                name: '瘟疫扩散',
                icon: '☠️',
                description: '毒素可扩散至周围敌人',
                effect: 'poison_spread'
            },
            {
                id: 'poison_lethal',
                name: '致命毒素',
                icon: '💀',
                description: '毒素伤害提升100%',
                effect: 'poison+100%'
            },
            {
                id: 'poison_weak',
                name: '虚弱',
                icon: '💔',
                description: '中毒目标受到伤害增加25%',
                effect: 'weak+25%'
            }
        ]
    },
    {
        towerType: TowerType.BOMB,
        level: 2,
        skills: [
            {
                id: 'bomb_cluster',
                name: '集束炸弹',
                icon: '💣',
                description: '爆炸后产生3个小爆炸',
                effect: 'cluster'
            },
            {
                id: 'bomb_napalm',
                name: '凝固汽油',
                icon: '🔥',
                description: '爆炸区域持续燃烧3秒',
                effect: 'napalm'
            },
            {
                id: 'bomb_heavy',
                name: '重型炸弹',
                icon: '💪',
                description: '爆炸范围+50%，伤害+30%',
                effect: 'heavy'
            }
        ]
    },
    {
        towerType: TowerType.LASER,
        level: 2,
        skills: [
            {
                id: 'laser_focus',
                name: '聚焦',
                icon: '🔴',
                description: '持续攻击同一目标伤害递增',
                effect: 'focus'
            },
            {
                id: 'laser_split',
                name: '分裂光束',
                icon: '✨',
                description: '光束分裂为3道',
                effect: 'split'
            },
            {
                id: 'laser_crit',
                name: '致命一击',
                icon: '💥',
                description: '25%概率造成暴击',
                effect: 'crit+25%'
            }
        ]
    },
    {
        towerType: TowerType.SNIPER,
        level: 2,
        skills: [
            {
                id: 'sniper_headshot',
                name: '爆头',
                icon: '🎯',
                description: '暴击伤害提升至5倍',
                effect: 'crit+5x'
            },
            {
                id: 'sniper_pierce',
                name: '穿透射击',
                icon: '➡️',
                description: '子弹可穿透多个敌人',
                effect: 'pierce'
            },
            {
                id: 'sniper_mark',
                name: '标记',
                icon: '🔖',
                description: '被攻击的敌人受到所有伤害+20%',
                effect: 'mark+20%'
            }
        ]
    },
    {
        towerType: TowerType.FLAME,
        level: 2,
        skills: [
            {
                id: 'flame_spread',
                name: '火焰扩散',
                icon: '🔥',
                description: '火焰范围+50%',
                effect: 'range+50%'
            },
            {
                id: 'flame_intense',
                name: '烈焰',
                icon: '☀️',
                description: '灼烧伤害提升100%',
                effect: 'burn+100%'
            },
            {
                id: 'flame_armor',
                name: '熔甲',
                icon: '🛡️',
                description: '灼烧降低敌人护甲',
                effect: 'armor_break'
            }
        ]
    },
    {
        towerType: TowerType.MAGNETIC,
        level: 2,
        skills: [
            {
                id: 'mag_pull',
                name: '强力拉扯',
                icon: '🧲',
                description: '拉扯距离+50%（受敌人抗性上限约束）',
                effect: 'pull+50%'
            },
            {
                id: 'mag_stun',
                name: '磁力束缚',
                icon: '⛓️',
                description: '眩晕时长+0.5秒（基础10%概率触发）',
                effect: 'stun+0.5s'
            },
            {
                id: 'mag_aoe',
                name: '磁力场',
                icon: '🌀',
                description: '持续减速范围内所有敌人',
                effect: 'aoe_slow'
            }
        ]
    },
    // ════════════════════════════════════════════════════════
    //  Lv3 大招技能（第二种选择）
    //  设计意图：Lv2 决定"这座塔往哪个方向特化"，Lv3 是在这个方向上再加码。
    //  所以 Lv3 的效果基本都是 Lv2 的强化版或组合版（用 `;` 连写两个效果），
    //  让玩家在 Lv3 时有"我这条路走对了"的反馈，而不是又一次随机分叉。
    // ════════════════════════════════════════════════════════
    {
        towerType: TowerType.MACHINE_GUN,
        level: 3,
        skills: [
            {
                id: 'mg3_storm',
                name: '钢铁风暴',
                icon: '🌪️',
                description: '攻速+40%，额外攻击1个目标',
                effect: 'speed+40%;multi+1'
            },
            {
                id: 'mg3_barrage',
                name: '交叉火力',
                icon: '🎆',
                description: '额外攻击3个目标',
                effect: 'multi+3'
            },
            {
                id: 'mg3_depleted',
                name: '贫铀穿甲弹',
                icon: '☢️',
                description: '护甲穿透+40%',
                effect: 'pierce+40%'
            }
        ]
    },
    {
        towerType: TowerType.FROST,
        level: 3,
        skills: [
            {
                id: 'frost3_absolute',
                name: '绝对零度',
                icon: '🧊',
                description: '减速拉满，并让攻击附带范围减速',
                effect: 'slow+20%;aoe_slow'
            },
            {
                id: 'frost3_shatter',
                name: '冰封墓地',
                icon: '💀',
                description: '对已减速目标额外造成60%伤害',
                effect: 'shatter+60%'
            },
            {
                id: 'frost3_pierce',
                name: '寒冰穿刺',
                icon: '🗡️',
                description: '护甲穿透+40%',
                effect: 'pierce+40%'
            }
        ]
    },
    {
        towerType: TowerType.ELECTRIC,
        level: 3,
        skills: [
            {
                id: 'elec3_thunder',
                name: '雷霆万钧',
                icon: '⛈️',
                description: '弹射次数+4',
                effect: 'chain+4'
            },
            {
                id: 'elec3_superconduct',
                name: '超导回路',
                icon: '🔌',
                description: '弹射伤害+60%',
                effect: 'chain_damage+60%'
            },
            {
                id: 'elec3_grid',
                name: '感电电网',
                icon: '🕸️',
                description: '弹射次数+2，触发眩晕时可扩散',
                effect: 'chain+2;stun_spread'
            }
        ]
    },
    {
        towerType: TowerType.POISON,
        level: 3,
        skills: [
            {
                id: 'poison3_extinction',
                name: '灭绝瘟疫',
                icon: '☠️',
                description: '毒素伤害+80%，并可扩散',
                effect: 'poison+80%;poison_spread'
            },
            {
                id: 'poison3_blood',
                name: '腐蚀之血',
                icon: '🩸',
                description: '中毒目标受到的伤害+35%',
                effect: 'weak+35%'
            },
            {
                id: 'poison3_cloud',
                name: '剧毒云雾',
                icon: '🌫️',
                description: '毒素可扩散，中毒目标受伤+20%',
                effect: 'poison_spread;weak+20%'
            }
        ]
    },
    {
        towerType: TowerType.BOMB,
        level: 3,
        skills: [
            {
                id: 'bomb3_rain',
                name: '集束暴雨',
                icon: '🌧️',
                description: '主爆炸后再产生5个小爆炸',
                effect: 'cluster+5'
            },
            {
                id: 'bomb3_napalm',
                name: '凝固汽油弹',
                icon: '🔥',
                description: '爆炸区域持续燃烧，灼烧伤害+50%',
                effect: 'napalm;burn+50%'
            },
            {
                id: 'bomb3_doomsday',
                name: '末日轰炸',
                icon: '💥',
                description: '爆炸范围+50%，伤害+30%',
                effect: 'heavy'
            }
        ]
    },
    {
        towerType: TowerType.LASER,
        level: 3,
        skills: [
            {
                id: 'laser3_death',
                name: '死亡光束',
                icon: '🔴',
                description: '持续攻击同一目标伤害递增，暴击率+25%',
                effect: 'focus;crit+25%'
            },
            {
                id: 'laser3_prism',
                name: '棱镜折射',
                icon: '🔺',
                description: '光束分裂为更多道',
                effect: 'split'
            },
            {
                id: 'laser3_focus',
                name: '聚能炮击',
                icon: '🎯',
                description: '暴击率+25%，射程+30%',
                effect: 'crit+25%;range+30%'
            }
        ]
    },
    {
        towerType: TowerType.SNIPER,
        level: 3,
        skills: [
            {
                id: 'sniper3_one',
                name: '一枪一个',
                icon: '💀',
                description: '暴击伤害提升至5倍，护甲穿透+30%',
                effect: 'crit+5x;pierce+30%'
            },
            {
                id: 'sniper3_execute',
                name: '穿透处决',
                icon: '➡️',
                description: '子弹穿透，被攻击目标受伤+15%',
                effect: 'pierce;mark+15%'
            },
            {
                id: 'sniper3_mark',
                name: '死亡标记',
                icon: '🔖',
                description: '被攻击目标受伤+25%，暴击对标记目标+50%',
                effect: 'mark+25%;crit_mark'
            }
        ]
    },
    {
        towerType: TowerType.FLAME,
        level: 3,
        skills: [
            {
                id: 'flame3_storm',
                name: '烈焰风暴',
                icon: '🌋',
                description: '灼烧伤害+100%，射程+40%',
                effect: 'burn+100%;range+40%'
            },
            {
                id: 'flame3_hell',
                name: '熔甲地狱',
                icon: '🛡️',
                description: '熔甲，护甲穿透+25%',
                effect: 'armor_break;pierce+25%'
            },
            {
                id: 'flame3_incinerate',
                name: '焚化炉',
                icon: '🔥',
                description: '灼烧伤害+120%',
                effect: 'burn+120%'
            }
        ]
    },
    {
        towerType: TowerType.MAGNETIC,
        level: 3,
        skills: [
            {
                id: 'mag3_blackhole',
                name: '黑洞',
                icon: '🕳️',
                description: '拉扯距离+80%（受敌人抗性上限约束），并范围减速',
                effect: 'pull+80%;aoe_slow'
            },
            {
                id: 'mag3_storm',
                name: '磁暴',
                icon: '⚡',
                description: '眩晕时长+0.5秒（概率触发），触发时可扩散',
                effect: 'stun+0.5s;stun_spread'
            },
            {
                id: 'mag3_well',
                name: '引力井',
                icon: '🌀',
                description: '范围减速，被减速目标受伤+20%',
                effect: 'aoe_slow;vuln+20%'
            }
        ]
    },
    // ══ Lv4：终极形态 ══
    // 等级上限提升到 4 之后，每升 1 级发 1 个技能（Lv2 / Lv3 / Lv4 各一次三选一），
    // 所以 Lv4 的防御塔正好带 3 个技能。这一档是"大招"：效果一律用 `;` 复合两条以上，
    // 数值也明显高于 Lv3 —— 它要能一眼看出"我练到头了"。
    {
        towerType: TowerType.MACHINE_GUN,
        level: 4,
        skills: [
            {
                id: 'mg4_typhoon',
                name: '弹幕台风',
                icon: '🌪️',
                description: '攻速+50%，额外攻击2个目标',
                effect: 'speed+50%;multi+2'
            },
            {
                id: 'mg4_apfsds',
                name: '脱壳穿甲弹',
                icon: '☄️',
                description: '护甲穿透+60%，暴击率+20%',
                effect: 'pierce+60%;crit+20%'
            },
            {
                id: 'mg4_overdrive',
                name: '超载弹链',
                icon: '🔗',
                description: '额外攻击2个目标，暴击率+25%',
                effect: 'multi+2;crit+25%'
            }
        ]
    },
    {
        towerType: TowerType.FROST,
        level: 4,
        skills: [
            {
                id: 'frost4_zero',
                name: '永冻领域',
                icon: '🧊',
                description: '减速拉满，附带范围减速与碎冰',
                effect: 'slow+30%;aoe_slow;shatter+40%'
            },
            {
                id: 'frost4_glacier',
                name: '冰川崩塌',
                icon: '🏔️',
                description: '对减速目标额外100%伤害，射程+30%',
                effect: 'shatter+100%;range+30%'
            },
            {
                id: 'frost4_permafrost',
                name: '永久冻土',
                icon: '🌨️',
                description: '范围减速，被减速目标受伤+30%',
                effect: 'aoe_slow;vuln+30%'
            }
        ]
    },
    {
        towerType: TowerType.ELECTRIC,
        level: 4,
        skills: [
            {
                id: 'elec4_storm',
                name: '雷暴领域',
                icon: '⛈️',
                description: '弹射次数+6，弹射伤害+50%',
                effect: 'chain+6;chain_damage+50%'
            },
            {
                id: 'elec4_emp',
                name: '电磁脉冲',
                icon: '📡',
                description: '眩晕时长+0.25秒，触发眩晕时可扩散',
                effect: 'stun+0.25s;stun_spread'
            },
            {
                id: 'elec4_arc',
                name: '万雷贯体',
                icon: '⚡',
                description: '弹射伤害+100%，攻速+40%',
                effect: 'chain_damage+100%;speed+40%'
            }
        ]
    },
    {
        towerType: TowerType.POISON,
        level: 4,
        skills: [
            {
                id: 'poison4_plague',
                name: '黑死病',
                icon: '☠️',
                description: '毒素伤害+120%，且毒素可扩散',
                effect: 'poison+120%;poison_spread'
            },
            {
                id: 'poison4_decay',
                name: '腐朽之触',
                icon: '🦠',
                description: '中毒目标受伤+60%，易伤+20%',
                effect: 'weak+60%;vuln+20%'
            },
            {
                id: 'poison4_toxin',
                name: '神经毒素',
                icon: '🧪',
                description: '毒素伤害+100%，减速+20%',
                effect: 'poison+100%;slow+20%'
            }
        ]
    },
    {
        towerType: TowerType.BOMB,
        level: 4,
        skills: [
            {
                id: 'bomb4_apocalypse',
                name: '天启轰炸',
                icon: '🌀',
                description: '主爆炸后产生8个小爆炸，范围+40%',
                effect: 'cluster+8;explosion+40%'
            },
            {
                id: 'bomb4_nuke',
                name: '战术核弹',
                icon: '☢️',
                description: '爆炸范围+60%，灼烧伤害+60%',
                effect: 'explosion+60%;burn+60%'
            },
            {
                id: 'bomb4_inferno',
                name: '炼狱火海',
                icon: '🔥',
                description: '爆炸区域持续燃烧，灼烧伤害+80%',
                effect: 'napalm;burn+80%'
            }
        ]
    },
    {
        towerType: TowerType.LASER,
        level: 4,
        skills: [
            {
                id: 'laser4_annihilate',
                name: '湮灭光束',
                icon: '🔆',
                description: '持续攻击伤害递增，暴击率+40%',
                effect: 'focus;crit+40%'
            },
            {
                id: 'laser4_prism',
                name: '千棱镜',
                icon: '🔺',
                description: '光束分裂为多道，暴击率+20%',
                effect: 'split;crit+20%'
            },
            {
                id: 'laser4_overload',
                name: '过载聚焦',
                icon: '🎯',
                description: '射程+50%，暴击率+30%',
                effect: 'range+50%;crit+30%'
            }
        ]
    },
    {
        towerType: TowerType.SNIPER,
        level: 4,
        skills: [
            {
                id: 'sniper4_headshot',
                name: '爆头',
                icon: '💀',
                description: '暴击伤害提升至8倍，穿透+40%',
                effect: 'crit+8x;pierce+40%'
            },
            {
                id: 'sniper4_pierce',
                name: '贯穿射击',
                icon: '➡️',
                description: '子弹穿透，被攻击目标受伤+30%',
                effect: 'pierce;mark+30%'
            },
            {
                id: 'sniper4_doom',
                name: '死神标记',
                icon: '🔖',
                description: '被攻击目标受伤+40%，暴击对标记+50%',
                effect: 'mark+40%;crit_mark'
            }
        ]
    },
    {
        towerType: TowerType.FLAME,
        level: 4,
        skills: [
            {
                id: 'flame4_hellfire',
                name: '地狱火',
                icon: '🌋',
                description: '灼烧伤害+180%，射程+30%',
                effect: 'burn+180%;range+30%'
            },
            {
                id: 'flame4_melt',
                name: '熔甲',
                icon: '🛡️',
                description: '熔甲，护甲穿透+40%',
                effect: 'armor_break;pierce+40%'
            },
            {
                id: 'flame4_wildfire',
                name: '野火燎原',
                icon: '🍂',
                description: '灼烧伤害+120%，被灼烧目标受伤+25%',
                effect: 'burn+120%;weak+25%'
            }
        ]
    },
    {
        towerType: TowerType.MAGNETIC,
        level: 4,
        skills: [
            {
                id: 'mag4_singularity',
                name: '奇点',
                icon: '🕳️',
                description: '拉扯距离+200%，并范围减速',
                effect: 'pull+200%;aoe_slow'
            },
            {
                id: 'mag4_collapse',
                name: '磁场崩塌',
                icon: '🌀',
                description: '拉扯距离+100%，眩晕时长+0.5秒',
                effect: 'pull+100%;stun+0.5s'
            },
            {
                id: 'mag4_well',
                name: '引力井',
                icon: '⚛️',
                description: '范围减速，被减速目标受伤+40%',
                effect: 'aoe_slow;vuln+40%'
            }
        ]
    },
    // ═══ Lv5 终极技能 ═══
    {
        towerType: TowerType.MACHINE_GUN,
        level: 5,
        skills: [
            {
                id: 'mg5_annihilator',
                name: '歼灭者',
                icon: '💀',
                description: '攻速+80%，额外攻击3个目标，暴击率+30%',
                effect: 'speed+80%;multi+3;crit+30%'
            },
            {
                id: 'mg5_gatling',
                name: '加特林',
                icon: '🔫',
                description: '攻速+100%，伤害+50%，额外攻击2个目标',
                effect: 'speed+100%;damage+50%;multi+2'
            },
            {
                id: 'mg5_suppress',
                name: '火力压制',
                icon: '🎯',
                description: '额外攻击4个目标，被攻击目标受伤+40%',
                effect: 'multi+4;vuln+40%'
            }
        ]
    },
    {
        towerType: TowerType.FROST,
        level: 5,
        skills: [
            {
                id: 'frost5_absolute_zero',
                name: '绝对零度',
                icon: '❄️',
                description: '减速效果拉满，冻结概率+30%，范围减速',
                effect: 'slow+100%;freeze+30%;aoe_slow'
            },
            {
                id: 'frost5_blizzard',
                name: '暴风雪',
                icon: '🌨️',
                description: '范围减速+80%，被减速目标受伤+50%',
                effect: 'aoe_slow+80%;vuln+50%'
            },
            {
                id: 'frost5_cryo_chamber',
                name: '冷冻舱',
                icon: '🧊',
                description: '冻结概率+50%，冻结持续时间+1秒',
                effect: 'freeze+50%;freeze_duration+1s'
            }
        ]
    },
    {
        towerType: TowerType.ELECTRIC,
        level: 5,
        skills: [
            {
                id: 'elec5_thunder_god',
                name: '雷神',
                icon: '⚡',
                description: '弹射次数+10，弹射伤害+100%，眩晕时长+0.4秒',
                effect: 'chain+10;chain_damage+100%;stun+0.4s'
            },
            {
                id: 'elec5_lightning_storm',
                name: '雷暴风暴',
                icon: '⛈️',
                description: '弹射次数+8，攻速+60%，触发眩晕时可扩散',
                effect: 'chain+8;speed+60%;stun_spread'
            },
            {
                id: 'elec5_plasma',
                name: '等离子体',
                icon: '🔮',
                description: '弹射伤害+150%，被攻击目标受伤+50%',
                effect: 'chain_damage+150%;vuln+50%'
            }
        ]
    },
    {
        towerType: TowerType.POISON,
        level: 5,
        skills: [
            {
                id: 'poison5_pandemic',
                name: '大瘟疫',
                icon: '☣️',
                description: '毒素伤害+200%，毒素可扩散，减速+40%',
                effect: 'poison+200%;poison_spread;slow+40%'
            },
            {
                id: 'poison5_necrosis',
                name: '坏死',
                icon: '💀',
                description: '中毒目标受伤+100%，易伤+40%',
                effect: 'weak+100%;vuln+40%'
            },
            {
                id: 'poison5_bio_weapon',
                name: '生化武器',
                icon: '🧪',
                description: '毒素伤害+150%，范围毒素扩散',
                effect: 'poison+150%;aoe_poison'
            }
        ]
    },
    {
        towerType: TowerType.BOMB,
        level: 5,
        skills: [
            {
                id: 'bomb5_armageddon',
                name: '末日审判',
                icon: '☄️',
                description: '主爆炸后产生12个小爆炸，范围+60%',
                effect: 'cluster+12;explosion+60%'
            },
            {
                id: 'bomb5_thermonuclear',
                name: '热核弹头',
                icon: '☢️',
                description: '爆炸范围+100%，灼烧伤害+100%',
                effect: 'explosion+100%;burn+100%'
            },
            {
                id: 'bomb5_hellfire_zone',
                name: '炼狱火海',
                icon: '🔥',
                description: '爆炸区域持续燃烧，灼烧伤害+150%',
                effect: 'napalm;burn+150%'
            }
        ]
    },
    {
        towerType: TowerType.LASER,
        level: 5,
        skills: [
            {
                id: 'laser5_death_ray',
                name: '死亡射线',
                icon: '💥',
                description: '持续攻击伤害递增，暴击率+60%',
                effect: 'focus;crit+60%'
            },
            {
                id: 'laser5_prismatic',
                name: '棱镜折射',
                icon: '🌈',
                description: '光束分裂为5道，暴击率+40%',
                effect: 'split+5;crit+40%'
            },
            {
                id: 'laser5_overload_beam',
                name: '过载光束',
                icon: '⚡',
                description: '射程+80%，暴击率+50%，伤害+30%',
                effect: 'range+80%;crit+50%;damage+30%'
            }
        ]
    },
    {
        towerType: TowerType.SNIPER,
        level: 5,
        skills: [
            {
                id: 'sniper5_executioner',
                name: '刽子手',
                icon: '⚰️',
                description: '暴击伤害提升至12倍，穿透+60%',
                effect: 'crit+12x;pierce+60%'
            },
            {
                id: 'sniper5_piercing_shot',
                name: '贯穿射击',
                icon: '➡️',
                description: '子弹穿透所有目标，被攻击目标受伤+50%',
                effect: 'pierce_all;mark+50%'
            },
            {
                id: 'sniper5_death_mark',
                name: '死亡印记',
                icon: '💀',
                description: '被攻击目标受伤+60%，暴击对标记+80%',
                effect: 'mark+60%;crit_mark+80%'
            }
        ]
    },
    {
        towerType: TowerType.FLAME,
        level: 5,
        skills: [
            {
                id: 'flame5_inferno',
                name: '炼狱',
                icon: '🌋',
                description: '灼烧伤害+250%，射程+50%',
                effect: 'burn+250%;range+50%'
            },
            {
                id: 'flame5_molten',
                name: '熔岩',
                icon: '🔥',
                description: '熔甲，护甲穿透+60%，灼烧伤害+100%',
                effect: 'armor_break;pierce+60%;burn+100%'
            },
            {
                id: 'flame5_wildfire_spread',
                name: '野火蔓延',
                icon: '🍂',
                description: '灼烧伤害+200%，被灼烧目标受伤+40%',
                effect: 'burn+200%;weak+40%'
            }
        ]
    },
    {
        towerType: TowerType.MAGNETIC,
        level: 5,
        skills: [
            {
                id: 'mag5_black_hole',
                name: '黑洞',
                icon: '🕳️',
                description: '拉扯距离+300%，范围减速+60%',
                effect: 'pull+300%;aoe_slow+60%'
            },
            {
                id: 'mag5_gravity_collapse',
                name: '引力崩塌',
                icon: '💫',
                description: '拉扯距离+200%，眩晕时长+0.8秒',
                effect: 'pull+200%;stun+0.8s'
            },
            {
                id: 'mag5_singularity_field',
                name: '奇点场',
                icon: '⚛️',
                description: '范围减速+80%，被减速目标受伤+60%',
                effect: 'aoe_slow+80%;vuln+60%'
            }
        ]
    }
];
// 后续关卡解锁的炮塔复用已注册的技能效果，但各自拥有完整的 Lv2–Lv5 构筑路线。
const addedTowerSkillSets = [
    { type: TowerType.SINGULARITY, prefix: 'singularity', names: [['引力壳层', '视界扩张', '潮汐牵引'], ['事件视界', '质量坍缩', '碎片捕获'], ['坍缩奇点', '黑洞风暴', '终末塌缩'], ['奇点爆发', '事件崩塌', '终极坍缩']], effects: [['explosion+20%', 'pull+25%', 'range+20%'], ['heavy', 'pull+50%', 'cluster+2'], ['explosion+35%;cluster+2', 'pull+80%;aoe_slow', 'heavy;explosion+25%'], ['explosion+50%;pull+100%', 'heavy;cluster+3', 'aoe_slow;vuln+50%']] }
];
for (const set of addedTowerSkillSets) {
    for (let level = 2; level <= 5; level++) {
        const tier = level - 2;
        TOWER_SKILLS.push({
            towerType: set.type, level,
            skills: set.names[tier].map((name, variant) => ({
                id: `${set.prefix}${level}_${variant}`, name, icon: ['✦', '⟡', '✧'][variant],
                description: `强化${TOWER_CONFIGS[set.type].name}专长`, effect: set.effects[tier][variant]
            }))
        });
    }
}
/**
 * 技能 id → 它属于哪一档（Lv2 / Lv3 / Lv4）。找不到返回 0。
 *
 * 合成时用来按"品阶优先"裁剪继承的技能：技能位只有 `等级 - 1` 个，
 * 必须优先保留更高级的招式（大招 > 小技能），否则 Lv4 的塔反而可能
 * 只继承到两个 Lv2 技能，把最有价值的 build 挤掉。
 */
export function skillTierOf(skillId) {
    for (const entry of TOWER_SKILLS) {
        if (entry.skills.some(s => s.id === skillId))
            return entry.level;
    }
    return 0;
}
/**
 * 按 id 取技能定义。UI 要展示"这座塔学会了什么"，
 * 但 Tower 里只存 id（存档友好），所以需要这个反查。
 */
export function findSkillById(skillId) {
    for (const entry of TOWER_SKILLS) {
        const found = entry.skills.find(s => s.id === skillId);
        if (found)
            return found;
    }
    return undefined;
}
/**
 * 某座塔在某档里**自动发放**的技能。
 *
 * 去掉三选一之后，技能不再由玩家挑，而是按塔的 `skillVariant` 取第 `variant` 个。
 * 第 1/2/3 座同名塔因此各走一条 build 线，9 个技能全都有出场机会。
 * 抽成函数是为了让 GameManager 和验证脚本用**同一套规则**（两边各写一遍必然会漂）。
 */
export function autoSkillFor(towerType, level, variant) {
    const entry = TOWER_SKILLS.find(s => s.towerType === towerType && s.level === level);
    if (!entry || entry.skills.length === 0)
        return undefined;
    const n = entry.skills.length;
    return entry.skills[((Math.round(variant) % n) + n) % n];
}
export const MUTATION_TYPES = [
    {
        type: 'armored',
        name: '装甲变异',
        icon: '🛡️',
        description: '敌人生命值+50%',
        hpMultiplier: 1.5,
        speedMultiplier: 1.0
    },
    {
        type: 'swift',
        name: '迅捷变异',
        icon: '💨',
        description: '敌人移动速度+40%',
        hpMultiplier: 1.0,
        speedMultiplier: 1.4
    },
    {
        type: 'healing',
        name: '再生变异',
        icon: '💚',
        description: '敌人每秒恢复1%最大生命值',
        hpMultiplier: 1.0,
        speedMultiplier: 1.0,
        special: 'regen'
    },
    {
        type: 'resistant',
        name: '抗性变异',
        icon: '🔰',
        description: '敌人受到伤害-30%',
        hpMultiplier: 1.3,
        speedMultiplier: 1.0,
        special: 'resistant'
    }
];
//# sourceMappingURL=GameConfig.js.map