/**
 * 防御塔实体类
 */
import { TowerType, TowerConfig, Rarity } from '../config/GameConfig.js';
import { Enemy } from './Enemy.js';
import { VfxStyle, TowerVfxSink } from '../core/VfxSystem.js';
/** 全局升级累计状态，由 UpgradeSystem 维护 */
export interface GlobalUpgradeState {
    damageMultiplier: number;
    speedMultiplier: number;
    frostSlowBonus: number;
    electricChainBonus: number;
    poisonDurationBonus: number;
    bombRadiusMultiplier: number;
    anesthesiaStunBonus: number;
    mergeBonusDamage: number;
    fusionBonusChance: number;
    towerDamageMultipliers: Partial<Record<TowerType, number>>;
    towerSpeedMultipliers: Partial<Record<TowerType, number>>;
}
/**
 * 视觉配方查询（供特效层 / 渲染层使用）。
 * 放在这里而不是 VfxSystem，是避免 Tower → VfxSystem → Enemy → ... 的值依赖：
 * 只导入类型和这一个纯函数，运行时没有循环。
 */
export declare function isBombType(type: TowerType): boolean;
export declare const DEFAULT_GLOBAL_STATE: GlobalUpgradeState;
/**
 * 技能修饰物 —— 一次技能选择就是往这个袋子里加一项。
 *
 * 为什么用一个袋子而不是"解析 effect 字符串"：
 * 旧实现是 `applySkillEffect` 里一串 `if (effect.includes('...'))`，
 * 新增技能时只要忘了加分支，那个技能就在 UI 上能选、实际什么都不发生
 * （项目里曾有 18/32 个技能是这种死技能）。改成显式的可观测状态后，
 * tools/verify_skills.mjs 可以逐个技能断言"它真的改变了什么"。
 *
 * 所有字段都可以叠加（多次选择同类技能 = 叠层），默认值是"没有该技能"。
 */
export interface TowerSkillMods {
    chainDamageRatio: number;
    multiShot: number;
    critChance: number;
    critDamage: number;
    critVsMarkedBonus: number;
    shatterMult: number;
    firstStrikeMult: number;
    focusRamp: boolean;
    burnDamageMult: number;
    poisonDamageMult: number;
    rangeMult: number;
    aoeSlow: boolean;
    aoeRadius: number;
    explosionRadiusMult: number;
    stunChanceBonus: number;
    stunSpread: boolean;
    armorPierce: number;
    shieldCorrosion: number;
    markBonus: number;
    weakBonus: number;
    vulnBonus: number;
    poisonSpread: boolean;
    clusterBombs: number;
    napalm: boolean;
    beamSplit: number;
    sniperPierce: boolean;
    pullMult: number;
    vanishSpeed: boolean;
    vanishSpeedBonus: number;
}
export declare const DEFAULT_SKILL_MODS: TowerSkillMods;
/**
 * 技能变体数量 —— 每档技能有 3 个候选，对应 3 种"变体"。
 *
 * 升级不再弹三选一，而是**按塔实例自动发技能**：每座塔在构造时领到一个
 * `skillVariant`（全局创建序号 % 3），此后每一档都取该档的第 `skillVariant` 个技能。
 *
 * 为什么按实例轮换，而不是"每档永远发第一个"：
 * 每个塔型有 3 档 × 3 个 = 9 个技能，固定发第一个会让其中 6 个永远见不到
 * （内容直接死掉）。轮换则保证第 1/2/3 座同名塔走三条不同的 build 线，
 * 玩家的建造选择依然有意义，而且**完全确定性**（可写断言验证）。
 */
export declare const SKILL_VARIANT_COUNT = 3;
/** 重置变体轮换（仅供测试/重开一局使用，保证断言可复现） */
export declare function resetTowerSerial(): void;
export declare class Tower {
    /**
     * 关卡环境攻速乘数（如第3关「电磁干扰」= 1.18 表示攻击间隔拉长 18%）。
     * 设为 static 是因为它由关卡决定、作用于全场，没必要逐个塔同步；
     * GameManager 在切关时设置一次即可。
     */
    static envIntervalMult: number;
    private type;
    private level;
    /** 稀有度品阶：同一类型可抽到 N/R/SR/SSR，决定属性倍率 */
    private rarity;
    private x;
    private y;
    private slotIndex;
    private damage;
    private range;
    private attackInterval;
    private lastAttackTime;
    private slowEffect;
    private slowDuration;
    private poisonDamage;
    private poisonDuration;
    private stunDuration;
    /** 眩晕内部冷却（秒）：高速连发的塔也不能连续控住同一批敌人 */
    private stunCooldown;
    private chainCount;
    private explosionRadius;
    private damageMultiplier;
    private speedMultiplier;
    private globalDamageMultiplier;
    private globalSpeedMultiplier;
    private mergeBonusDamage;
    private fusionBonusChance;
    private overloadActive;
    private overloadTimer;
    private overloadCooldown;
    private paralyzed;
    private paralyzeTimer;
    private infected;
    private infectionType;
    private infectionDamageMultiplier;
    private infectionRangeMultiplier;
    private infectionSpeedMultiplier;
    private infectionSideEffect;
    private infectionVampiric;
    private orbs;
    private orbSpawned;
    /** 技能修饰物。Lv2/Lv3 选技能时往里叠。 */
    private skillMods;
    /** 「聚焦」：连续攻击同一目标的层数 */
    private focusStacks;
    private lastTarget;
    /** 「消失」：攻击后隐身提攻速的剩余时间 */
    private vanishTimer;
    /** 已选择的技能 id 列表（用于 UI 展示与存档） */
    private learnedSkills;
    /**
     * 技能变体（0 / 1 / 2）。构造时按全局创建序号自动分配，决定这座塔在
     * 每一档里拿第几个技能。合成时由 `TowerMergeSystem` 从父塔继承。
     */
    private skillVariant;
    private skillSilenceTimer;
    private bossSlowTimer;
    private bossSlowMultiplier;
    /**
     * 表现层出口。由 GameManager 注入（null = 无特效，测试/纯逻辑场景用）。
     * Tower 不知道 GameManager 的存在：它只往这里发"我开火了 / 我炸了 / 我电到了谁"。
     */
    private vfx;
    /** 瞄准角（开火方向），渲染层用它画炮口朝向 */
    private aimAngle;
    /** 后坐位移：开火时朝反方向顶一下，弹簧回位 */
    private recoil;
    private recoilAngle;
    setVfxSink(sink: TowerVfxSink | null): void;
    /** 当前瞄准角（弧度） */
    getAimAngle(): number;
    /** 后坐位移（渲染用：把塔朝反方向推 recoil 像素） */
    getRecoilOffset(): {
        x: number;
        y: number;
    };
    /**
     * 后坐强度 0~1（渲染用：归一化后驱动挤压拉伸与枪口火光）。
     * TOWER_VFX 里 recoil 取值 1.5~6，这里以 6 为满值。
     */
    getRecoilAmount(): number;
    /**
     * 这种塔的视觉配方（供渲染/特效层查询）。
     * ⚠️ 带等级：`styleForLevel(type, level)` —— Lv2 起弹头更大更亮、速度更快、
     * 还会被标记 tier 让 VfxSystem 画能量环/残影/环绕碎屑。
     * 直接 `styleOf(type)` 会丢掉全部等级感（用户诉求：升级后弹道要看起来更强）。
     */
    getVfxStyle(): VfxStyle;
    /**
     * 等级带来的命中表现强度倍率（Lv1 = 1 → Lv4 ≈ 1.6）。
     * **只影响视觉**（溅射粒子数、冲击环半径、焦痕、震屏），**不影响任何伤害与 DPS** ——
     * 升完级除了面板数字，还要能"看出这一下更狠"。
     * 会随 levelUp() 自动变化，无需传参。
     */
    getVfxPower(): number;
    updateRecoil(deltaTime: number): void;
    constructor(type: TowerType, x: number, y: number, slotIndex: number, level?: number, rarity?: Rarity);
    /**
     * 稀有度成长。直接烘进 damage / range / attackInterval 三个基础值，
     * 这样 getDamage() / getRange() / getAttackInterval() 里的过载、感染、
     * 全局升级等所有既有乘区都不需要改动，天然叠加。
     */
    private applyRarityGrowth;
    /** 计算从Lv1升到指定等级的累计成长（只用于构造时或levelUp） */
    private applyLevelGrowth;
    getRarity(): Rarity;
    getType(): TowerType;
    getLevel(): number;
    getX(): number;
    getY(): number;
    getSlotIndex(): number;
    getDamage(): number;
    getRange(): number;
    /** 返回实际攻击间隔（秒），speedMultiplier越大攻击越快（间隔越小） */
    getAttackInterval(): number;
    getConfig(): TowerConfig;
    setDamageMultiplier(value: number): void;
    getDamageMultiplier(): number;
    setSpeedMultiplier(value: number): void;
    getSpeedMultiplier(): number;
    setMergeBonusDamage(value: number): void;
    addMergeBonus(value: number): void;
    setFusionBonusChance(value: number): void;
    getFusionBonusChance(): number;
    addFusionBonus(value: number): void;
    setSlowEffect(value: number): void;
    getSlowEffect(): number;
    setSlowDuration(value: number): void;
    getSlowDuration(): number;
    setPoisonDuration(value: number): void;
    getPoisonDuration(): number;
    setStunDuration(value: number): void;
    getStunDuration(): number;
    setChainCount(value: number): void;
    getChainCount(): number;
    setExplosionRadius(value: number): void;
    getExplosionRadius(): number;
    canAttack(currentTime: number): boolean;
    silenceSkills(duration: number): void;
    areSkillsSilenced(): boolean;
    slowAttacks(duration: number, intervalMultiplier?: number): void;
    isBossAttackSlowed(): boolean;
    /** 对炮塔造成伤害（用于 Boss 技能如震撼重击） */
    private hp;
    private maxHp;
    takeDamage(amount: number): void;
    getHp(): number;
    getMaxHp(): number;
    isDestroyed(): boolean;
    /** 缩减射程（用于 Boss 技能如日蚀协议） */
    private rangeMultiplier;
    reduceRange(multiplier: number, duration: number): void;
    /** 激活过载模式 */
    activateOverload(): boolean;
    /** 更新过载和瘫痪状态 */
    updateOverload(deltaTime: number): void;
    /** 更新奇点炮光球位置和攻击 */
    private updateOrbs;
    /** 光球攻击敌人 */
    private orbAttack;
    /** 查找最近敌人 */
    private findNearestEnemy;
    /** 更新光球（供GameManager调用） */
    updateOrbsWithEnemies(deltaTime: number, enemies: Enemy[]): void;
    /** 获取光球列表（供渲染使用） */
    getOrbs(): Array<{
        x: number;
        y: number;
        level: number;
    }>;
    isOverloaded(): boolean;
    isParalyzed(): boolean;
    /**
     * 外部施加瘫痪（自爆机雷死亡效果）。
     * 取较长的剩余时间，避免连续自爆把瘫痪时间刷短。
     */
    paralyze(duration: number): void;
    getParalyzeTimer(): number;
    getOverloadCooldown(): number;
    infect(infectionType: string, damageMultiplier: number, rangeMultiplier: number, speedMultiplier: number, sideEffect: string): void;
    isInfectionVampiric(): boolean;
    isInfected(): boolean;
    getInfectionType(): string;
    findTarget(enemies: Enemy[]): Enemy | null;
    /**
     * 选出本回合要攻击的所有目标（含「多重射击」）。
     * 主目标一定是第一个，调用方按这个顺序结算。
     */
    selectTargets(enemies: Enemy[], primary: Enemy): Enemy[];
    /**
     * 攻击一组目标。
     * @param currentTime 当前游戏时间（秒），用于攻击间隔判定
     *
     * 表现与结算的关系：**伤害仍然立即结算**，弹道飞行只负责"把命中那一瞬间"
     * 推迟到子弹到达时。这样飞行期不改变 DPS（不会因为目标中途死掉就丢伤害），
     * 测试也保持确定性（伤害数字在子弹落地时才飘出来，读起来反而更对）。
     */
    attackTargets(targets: Enemy[], currentTime: number, allEnemies: Enemy[]): void;
    /**
     * 开火的表现链路：枪口火光 → 弹道飞行 → 命中溅射。
     * 特殊效果里的爆炸/弹射仍立即结算（它们是逻辑），但视觉跟着弹道一起落地。
     */
    private emitAttackVisual;
    /** 这种塔会不会炸（用于挑震屏强度/表现） */
    isBombType(): boolean;
    /** 兼容旧调用点：单目标攻击 */
    attack(enemy: Enemy, currentTime: number, allEnemies: Enemy[]): void;
    /**
     * 结算对某个目标的伤害：聚焦 / 碎裂 / 首击 / 暴击。
     * 与 getDamage() 分开 —— getDamage() 是"面板值"，这里是"这一发实际打多少"。
     */
    private resolveDamage;
    /** 命中落地后的收尾：聚焦层数、消失计时、目标标记 */
    private onHitLanded;
    isVanishing(): boolean;
    /** 每帧更新技能相关的计时器（由 GameManager 调用） */
    updateSkills(deltaTime: number): void;
    getSkillMods(): TowerSkillMods;
    /**
     * 叠加一项技能修饰物。
     * 数值型字段取"更有利"的合并方式（乘区取最大/相加依字段而定），
     * 布尔型字段一旦学到就永久生效。
     */
    applySkillMod(patch: Partial<TowerSkillMods>): void;
    learnSkill(skillId: string): void;
    getLearnedSkills(): string[];
    /** 技能变体（0/1/2）：决定每档自动发第几个技能 */
    getSkillVariant(): number;
    /** 继承父塔的技能变体（合成时用，保证子塔的 build 线不跳档） */
    setSkillVariant(v: number): void;
    /**
     * 继承技能（合成 / 同卡自动升级时调用）。
     *
     * 规则：**一座防御塔的技能数 = 等级 − 1**（每升 1 级发 1 个技能）。
     * 其中最后一个名额留给"升级时新选的那个技能"（由 GameManager 弹三选一发放），
     * 所以这里最多只继承 `limit` 个，调用方传 `newLevel - 2`。
     *
     * 设计取舍：两个 Lv2 塔合成成 Lv3 时，如果之前的技能全部清零，
     * 玩家之前做的 build 选择就被抹掉了 —— "合起来反而变弱"是最挫败的体验。
     * 所以合成时把两侧学过的技能都带过来（并集），只是**按档位从高到低保留**：
     * 大招比小技能更值得留，也保证新塔总能再挑一个本档的大招。
     */
    inheritSkills(sources: Tower[], limit?: number): void;
    /**
     * ── 特殊效果分成两半，时机完全不同 ──
     *
     * `applyHitEffects`　单体 debuff，**开火当帧结算**（和伤害同一帧）。
     * `applyImpactEffects`　范围/穿透效果，**跟着弹道落地**才触发。
     *
     * 为什么必须拆开：弹道最长要飞 0.45s（`VfxSystem.fire` 的
     * `Math.min(0.45, dist / speed)`），而 Lv4 焚焰塔的攻击间隔只有 0.26s ——
     * 目标往往在子弹飞到之前就被后续几发打死，debuff 全打在尸体上被静默丢弃。
     * 而且等级越高 DPS 越高、丢得越频繁，玩家看到的就是
     * **"升级之后技能好像失效了"**。
     *
     * 这也正是本项目的铁律：**伤害即时结算，弹道只做表现**。
     * debuff 是逻辑不是表现，本来就不该等子弹。
     */
    /**
     * 单体 debuff：只作用于主目标，开火当帧结算。
     * 任何塔学到下面这些技能都会生效，与塔种无关。
     */
    private applyHitEffects;
    /**
     * 着陆效果：跟着弹道落地那一刻触发。
     * 这些本来就是"炮弹落在哪里、发生什么"，与表现同步是语义正确的 ——
     * 爆炸就该在弹着点炸，弹射就该从弹着点往外跳。
     */
    private applyImpactEffects;
    /** 「寒霜领域」/「磁力场」：攻击时对范围内所有敌人施加减速 */
    private applyAoESlow;
    /** 「瘟疫扩散」：毒素传染到主目标周围的敌人 */
    private applyPoisonSpread;
    /** 「麻醉气体」/「磁暴」：眩晕扩散到主目标周围的敌人（时长打折，且不再是每发必中） */
    private applyStunSpread;
    /**
     * 眩晕判定：基础概率 + 强化/技能加成，命中后进入内部冷却。
     * 返回 true 表示这一次真的麻住了目标 —— 只有 true 才允许扩散，
     * 否则「眩晕扩散」会退化成每发必中的范围控制。
     */
    private tryApplyStun;
    private applyChainLightning;
    private applyExplosion;
    /** 一次圆形爆炸。primary 为 null 表示这是集束小爆炸（不给主目标双倍）。 */
    private detonate;
    private applyLaserBeam;
    private applyMagneticPull;
    /**
     * 修复：levelUp 只应用一级的增量，不重复累加
     */
    levelUp(): void;
    /** 生成奇点炮光球 */
    private spawnOrb;
    canMergeWith(other: Tower): boolean;
    setSlotIndex(index: number): void;
    setPosition(x: number, y: number): void;
    /**
     * 应用全局升级状态（用于新防御塔继承已有升级）
     * 此方法设置绝对值，不会重复叠加
     */
    applyGlobalUpgradeState(state: GlobalUpgradeState): void;
}
