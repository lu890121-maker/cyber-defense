/**
 * 敌人实体类
 */
import { EnemyType, EnemyConfig } from '../config/GameConfig.js';
export declare class Enemy {
    private type;
    private x;
    private y;
    private hp;
    private maxHp;
    private speed;
    private baseSpeed;
    private waveMultiplier;
    private timedSpeedMultiplier;
    private timedSpeedTimer;
    private reward;
    private size;
    private escapeDamage;
    /** 关卡索引（0-9），用于视觉变体 */
    private levelIndex;
    private pathIndex;
    /** 传送门段号集合：段 i 表示 points[i] → points[i+1] 是瞬移 */
    private warpSegments;
    /** 刚完成一次瞬移后的表现计时（秒），供渲染层画空间扰动 */
    private teleportFlash;
    private pathPoints;
    private bossSkill?;
    private bossSkillTimer;
    private bossSkillWarningTimer;
    private bossSkillTriggered;
    private alive;
    private reachedEnd;
    /** 行走相位：按真实位移推进（眩晕时冻结） */
    private animPhase;
    /** 与速度无关的 idle 时钟 */
    private animIdle;
    /** 朝向：1 向右 / -1 向左 */
    private facing;
    /** 出生年龄（秒）：入场弹出用 */
    private age;
    private slowFactor;
    private slowTimer;
    private poisonDamage;
    private poisonTimer;
    private poisonTickTimer;
    private stunTimer;
    private burnDamage;
    private burnTimer;
    private burnTickTimer;
    private markMultiplier;
    private markTimer;
    /**
     * 磁力拉扯预算（px）。初始「无限制」，首次 update 时收敛到上限。
     *
     * 见 `takePullBudget` —— 这是"引力场不再能把敌人定身"的唯一防线。
     */
    private pullBudget;
    private weakBonus;
    private vulnBonus;
    /** 护盾腐蚀比例 0~1。每次命中按比例削掉当前护盾，专克高护盾的护盾机兵。 */
    private shieldCorrosion;
    /** 本次命中是否已经结算过腐蚀（避免一发伤害把腐蚀叠两次） */
    private corrosionApplied;
    private healTimer;
    private healCooldown;
    private healAmount;
    private healRange;
    private mutation;
    private regenRate;
    private damageReduction;
    /** 剩余护盾值。护盾未破时，低单发伤害会被大幅削减。 */
    private shield;
    private maxShield;
    /**
     * 单发伤害低于这个阈值时，对护盾只造成 35% 效果。
     * 这是护盾机兵的核心设计意图：它不是"血更厚"，而是"克制速射流"。
     * 连射防御塔（10 伤害/0.35s）打护盾几乎无效，鹰眼防御塔（60 伤害/2.8s）轻松破盾。
     */
    private static readonly SHIELD_BREAK_THRESHOLD;
    private static readonly SHIELD_SMALL_HIT_MULT;
    private phaseCycle;
    private phaseDuration;
    private phaseTimer;
    private phased;
    private deathParalyzeRadius;
    private deathParalyzeDuration;
    private empRadius;
    private empDuration;
    private empCooldown;
    private empTimer;
    private deathEmpRadius;
    private deathEmpDuration;
    private reflectRatio;
    private auraRadius;
    private auraSpeedBoost;
    private auraDamageReduction;
    private stealthAlpha;
    private coreRevealDistance;
    private stealthed;
    private attractRadius;
    private newRegenRate;
    private lowHpRegenRate;
    private deathSplitCount;
    private deathCoreDamage;
    private hitFlash;
    private hitDir;
    private knockX;
    private knockY;
    private counted;
    constructor(type: EnemyType, waveMultiplier?: number, pathPoints?: Array<{
        x: number;
        y: number;
    }>, bossSkill?: string, levelIndex?: number, warpSegments?: number[]);
    getPathPoints(): Array<{
        x: number;
        y: number;
    }>;
    /** 传送门段号（分裂子体等派生实体需要继承，否则子体会把传送段当普通路走） */
    getWarpSegments(): number[];
    /** 0..0.34 秒的瞬移余辉；>0 时渲染层画空间扰动环 */
    getTeleportFlash(): number;
    getBossSkill(): string | undefined;
    getWaveMultiplier(): number;
    /** 根据 Boss 技能类型获取冷却时间 */
    private getBossSkillCooldown;
    /** Boss技能按冷却触发，第一次入场后延迟施放，留给玩家反应时间。 */
    consumeBossSkillPulse(deltaTime: number): boolean;
    isBossSkillCharging(): boolean;
    /** 是否处于相位化（免疫伤害）状态 */
    isPhased(): boolean;
    getShield(): number;
    getMaxShield(): number;
    /** 自爆机雷的死亡瘫痪参数；非自爆单位返回 null */
    getDeathParalyze(): {
        radius: number;
        duration: number;
    } | null;
    /** EMP 无人机/精英：是否应该释放 EMP */
    shouldEmp(): boolean;
    /** EMP 无人机/精英：重置 EMP 计时器 */
    resetEmpTimer(): void;
    /** EMP 无人机/精英：获取 EMP 参数 */
    getEmpParams(): {
        radius: number;
        duration: number;
    } | null;
    /**
     * EMP 蓄能进度 0..1（0 = 刚放完，1 = 即将再次释放）。
     * 纯表现层用：渲染层据此决定头顶电弧的亮度，让玩家能预判下一次干扰。
     */
    getEmpChargeRatio(): number;
    /** 精英·电磁风暴：死亡 EMP 参数 */
    getDeathEmpParams(): {
        radius: number;
        duration: number;
    } | null;
    /** 反射甲虫/精英：获取反射比例 */
    getReflectRatio(): number;
    /** 加速引擎兵/指挥官：获取光环参数 */
    getAuraParams(): {
        radius: number;
        speedBoost: number;
        damageReduction: number;
    } | null;
    /** 隐身刺客/虚空行者：是否隐身状态 */
    isStealthed(): boolean;
    /** 隐身刺客/虚空行者：获取透明度 */
    getStealthAlpha(): number;
    /** 磁力盾卫：获取吸引半径 */
    getAttractRadius(): number;
    /** 精英·反射堡垒：死亡分裂数量 */
    getDeathSplitCount(): number;
    /** 精英·虚空行者：死亡对核心伤害 */
    getDeathCoreDamage(): number;
    getType(): EnemyType;
    getLevelIndex(): number;
    getX(): number;
    getY(): number;
    getHp(): number;
    getMaxHp(): number;
    getSize(): number;
    isAlive(): boolean;
    hasReachedEnd(): boolean;
    getReward(): number;
    /** 漏过核心病房时扣除的生命值（Boss 5 / 精英 2 / 杂兵 1） */
    getEscapeDamage(): number;
    update(deltaTime: number, allEnemies: Enemy[]): void;
    private updateStatusEffects;
    private move;
    /** 行走相位（渲染用；按位移推进，眩晕时冻结） */
    getAnimPhase(): number;
    /** 与速度无关的 idle 时钟（呼吸/漂浮） */
    getAnimIdle(): number;
    /** 朝向：1 向右 / -1 向左 */
    getFacing(): number;
    /** 出生年龄（秒）：用于入场弹出 */
    getAge(): number;
    private healNearby;
    /**
     * 受到伤害。
     *
     * @param damage 原始伤害
     * @param options.pierce 护甲穿透 0~1 —— 这部分伤害绕过护盾直接打血。
     *   设计意图：护盾机兵的核心是"低单发伤害被削减到 35%"，玩家可以用
     *   连射防御塔 Lv2 的「穿甲弹」等技能把穿透叠上去，而不是只能换塔。
     *   持续伤害（毒/灼烧）不能穿透 —— 穿透是"一发打破甲"的概念。
     * @param options.ignoreShield 完全无视护盾（用于熔甲后的腐蚀结算）
     */
    takeDamage(damage: number, options?: {
        pierce?: number;
        ignoreShield?: boolean;
    }): void;
    /**
     * 当前受伤倍率：标记 ×（中毒时虚弱）×（眩晕时脆弱）。
     * 虚弱/脆弱挂在已有计时器上，所以会自动随状态消失而结束。
     */
    getDamageTakenMultiplier(): number;
    /** 虚弱：中毒期间受到的伤害提升（技能 poison_weak） */
    applyWeak(bonus: number): void;
    /** 脆弱：被眩晕期间受到的伤害提升（技能 anes_vuln） */
    applyVuln(bonus: number): void;
    getWeakBonus(): number;
    getVulnBonus(): number;
    /** 施加护盾腐蚀（熔甲）。取较大值，避免连续命中把腐蚀刷低。 */
    applyShieldCorrosion(ratio: number): void;
    /** 施加护盾（用于 Boss 技能如能量护盾、金币汲取等） */
    applyShield(amount: number): void;
    getShieldCorrosion(): number;
    heal(amount: number): void;
    applySlow(factor: number, duration: number): void;
    /** 拉扯质量系数：越重的单位越难被引力场拉动 */
    private pullMass;
    /**
     * 消耗磁力拉扯预算，返回**实际允许**的拉扯距离（px）。
     *
     * ── 为什么要有这道闸门 ──
     * 引力场原本每次命中瞬移固定距离，净向后速度 = 拉扯距离 ÷ 攻击间隔。
     * 20px / 0.77s ≈ 26 px/s，比最慢敌人减速后的速度（12~13 px/s）还快
     * → 敌人被永久顶住甚至倒推，Boss 也逃不掉；多放几座还会线性叠加。
     *
     * 现在把上限**记在敌人身上**（每秒最多被拉走 有效速度 × ratio），
     * 于是拉扯总量与引力场的数量无关：净推进速度恒 ≥ (1 − ratio) 倍。
     * 拉扯只能是"减速"，不可能变成"倒推" —— 无论玩家怎么叠塔。
     */
    takePullBudget(want: number): number;
    isSlowed(): boolean;
    applyPoison(damage: number, duration: number): void;
    /** 是否正在中毒（特效层要冒毒泡） */
    isPoisoned(): boolean;
    applyBurn(damagePerSecond: number, duration: number): void;
    /** 是否正在燃烧（特效层要冒火星） */
    isBurning(): boolean;
    /** 是否被眩晕（特效层要冒电弧） */
    isStunned(): boolean;
    /**
     * 当前最显眼的一个状态色（描边 + 半透明内充用）。
     * 优先级：燃烧 > 中毒 > 冻结 > 眩晕 —— 燃烧最扎眼，玩家会先处理火里的怪。
     */
    getStatusTint(): {
        color: string;
        glow: boolean;
    } | null;
    /**
     * 被命中：记一次白闪 + 按命中方向给一点击退位移。
     * 顿帧/震动由 VfxSystem 管，这里只负责"这只怪自己"的表现。
     */
    applyHitFeedback(angle: number, power: number): void;
    /** 每帧更新受击表现（由渲染前的逻辑帧驱动） */
    updateHitFeedback(deltaTime: number): void;
    /** 受击位移偏移（渲染用） */
    getRenderOffset(): {
        x: number;
        y: number;
    };
    /** 受击白闪强度 0~1 */
    getHitFlash(): number;
    /** 受击方向（用于把喷血扇面摆向正确一侧） */
    getHitDirection(): number;
    applyMark(multiplier: number): void;
    /** 是否处于标记状态（技能「死亡标记」等要判断） */
    isMarked(): boolean;
    getMarkMultiplier(): number;
    applyStun(duration: number): void;
    kill(): void;
    isElite(): boolean;
    hasBeenCounted(): boolean;
    markCounted(): void;
    getConfig(): EnemyConfig;
    setPositionAndPathIndex(x: number, y: number, pathIndex: number): void;
    getPathIndex(): number;
    setPathIndex(index: number): void;
    applyTimedSpeedBoost(multiplier: number, duration: number): void;
    applyMutation(mutationType: string, hpMultiplier: number, speedMultiplier: number, special?: string): void;
    getMutation(): string;
    getDamageReduction(): number;
    setPosition(x: number, y: number): void;
}
