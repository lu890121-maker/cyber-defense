/**
 * 防御塔实体类
 */
import { TowerType, TOWER_CONFIGS, Rarity, RARITY_CONFIGS, MAX_TOWER_LEVEL, skillTierOf, MAGNETIC_PULL_BASE, MAGNETIC_SLOW_FACTOR, MAGNETIC_SLOW_DURATION, ACTIVE_FOG_ZONES } from '../config/GameConfig.js';
import { styleForLevel } from '../core/VfxSystem.js';
import { getTowerMuzzleOffset } from '../core/SpriteLoader.js';
// ── 眩晕（控制）平衡参数 ──
// v1.8 削弱：以前 tryApplyStun 是死代码，实际生效的只有「眩晕扩散」，
// 而扩散是每发必中、不看概率 → 电磁炮 Lv4/Lv5 变成全场永久锁死。
// 现在改成「先掷概率、中了才谈扩散」，并加内部冷却兜底。
/** 眩晕基础触发概率（原 0.30） */
const STUN_BASE_CHANCE = 0.10;
/** 眩晕概率上限，防止强化 + 技能叠到必中 */
const STUN_CHANCE_CAP = 0.45;
/** 同一座塔两次眩晕之间的最小间隔（秒） */
const STUN_INTERNAL_COOLDOWN = 1.0;
/**
 * 视觉配方查询（供特效层 / 渲染层使用）。
 * 放在这里而不是 VfxSystem，是避免 Tower → VfxSystem → Enemy → ... 的值依赖：
 * 只导入类型和这一个纯函数，运行时没有循环。
 */
export function isBombType(type) {
    return type === TowerType.BOMB;
}
export const DEFAULT_GLOBAL_STATE = {
    damageMultiplier: 1.0,
    speedMultiplier: 1.0,
    frostSlowBonus: 0,
    electricChainBonus: 0,
    poisonDurationBonus: 0,
    bombRadiusMultiplier: 1.0,
    anesthesiaStunBonus: 0,
    mergeBonusDamage: 0,
    fusionBonusChance: 0,
    towerDamageMultipliers: {},
    towerSpeedMultipliers: {}
};
export const DEFAULT_SKILL_MODS = {
    chainDamageRatio: 0.6,
    multiShot: 0,
    critChance: 0,
    critDamage: 3,
    critVsMarkedBonus: 0,
    shatterMult: 0,
    firstStrikeMult: 1,
    focusRamp: false,
    burnDamageMult: 1,
    poisonDamageMult: 1,
    rangeMult: 1,
    aoeSlow: false,
    aoeRadius: 70,
    explosionRadiusMult: 1,
    stunChanceBonus: 0,
    stunSpread: false,
    armorPierce: 0,
    shieldCorrosion: 0,
    markBonus: 0,
    weakBonus: 0,
    vulnBonus: 0,
    poisonSpread: false,
    clusterBombs: 0,
    napalm: false,
    beamSplit: 0,
    sniperPierce: false,
    pullMult: 1,
    vanishSpeed: false,
    vanishSpeedBonus: 0.5
};
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
export const SKILL_VARIANT_COUNT = 3;
/** 全局塔创建计数器：给每座塔分配变体，保证同类型塔按建造顺序轮换 */
let towerSerial = 0;
/** 重置变体轮换（仅供测试/重开一局使用，保证断言可复现） */
export function resetTowerSerial() {
    towerSerial = 0;
}
export class Tower {
    setVfxSink(sink) {
        this.vfx = sink;
    }
    /** 当前瞄准角（弧度） */
    getAimAngle() {
        return this.aimAngle;
    }
    /** 后坐位移（渲染用：把塔朝反方向推 recoil 像素） */
    getRecoilOffset() {
        return { x: -Math.cos(this.recoilAngle) * this.recoil, y: -Math.sin(this.recoilAngle) * this.recoil };
    }
    /**
     * 后坐强度 0~1（渲染用：归一化后驱动挤压拉伸与枪口火光）。
     * TOWER_VFX 里 recoil 取值 1.5~6，这里以 6 为满值。
     */
    getRecoilAmount() {
        return Math.min(1, this.recoil / 6);
    }
    /**
     * 这种塔的视觉配方（供渲染/特效层查询）。
     * ⚠️ 带等级：`styleForLevel(type, level)` —— Lv2 起弹头更大更亮、速度更快、
     * 还会被标记 tier 让 VfxSystem 画能量环/残影/环绕碎屑。
     * 直接 `styleOf(type)` 会丢掉全部等级感（用户诉求：升级后弹道要看起来更强）。
     */
    getVfxStyle() {
        return styleForLevel(this.type, this.level);
    }
    /**
     * 等级带来的命中表现强度倍率（Lv1 = 1 → Lv4 ≈ 1.6）。
     * **只影响视觉**（溅射粒子数、冲击环半径、焦痕、震屏），**不影响任何伤害与 DPS** ——
     * 升完级除了面板数字，还要能"看出这一下更狠"。
     * 会随 levelUp() 自动变化，无需传参。
     */
    getVfxPower() {
        return 1 + 0.2 * (this.level - 1);
    }
    updateRecoil(deltaTime) {
        this.recoil *= Math.max(0, 1 - 16 * deltaTime);
        if (this.recoil < 0.05)
            this.recoil = 0;
    }
    constructor(type, x, y, slotIndex, level = 1, rarity = Rarity.N) {
        // 特殊效果参数
        this.slowEffect = 0.5;
        this.slowDuration = 2.0;
        this.poisonDamage = 5;
        this.poisonDuration = 5.0;
        this.stunDuration = 1.1;
        /** 眩晕内部冷却（秒）：高速连发的塔也不能连续控住同一批敌人 */
        this.stunCooldown = 0;
        this.chainCount = 1;
        this.explosionRadius = 60;
        // 强化加成（来自全局升级的继承值）
        // 全局强化与塔技能分乘区保存，重新应用全局状态时不能覆盖已学技能倍率。
        this.damageMultiplier = 1.0;
        this.speedMultiplier = 1.0;
        this.globalDamageMultiplier = 1.0;
        this.globalSpeedMultiplier = 1.0;
        this.mergeBonusDamage = 0;
        this.fusionBonusChance = 0;
        // 过载系统
        this.overloadActive = false;
        this.overloadTimer = 0;
        this.overloadCooldown = 0;
        this.paralyzed = false;
        this.paralyzeTimer = 0;
        // 感染系统
        this.infected = false;
        this.infectionType = '';
        this.infectionDamageMultiplier = 1.0;
        this.infectionRangeMultiplier = 1.0;
        this.infectionSpeedMultiplier = 1.0;
        this.infectionSideEffect = '';
        this.infectionVampiric = false;
        // 奇点炮光球系统
        this.orbs = [];
        this.orbSpawned = false;
        // ── 技能系统 ──
        /** 技能修饰物。Lv2/Lv3 选技能时往里叠。 */
        this.skillMods = { ...DEFAULT_SKILL_MODS };
        /** 「聚焦」：连续攻击同一目标的层数 */
        this.focusStacks = 0;
        this.lastTarget = null;
        /** 「消失」：攻击后隐身提攻速的剩余时间 */
        this.vanishTimer = 0;
        /** 已选择的技能 id 列表（用于 UI 展示与存档） */
        this.learnedSkills = [];
        /**
         * 技能变体（0 / 1 / 2）。构造时按全局创建序号自动分配，决定这座塔在
         * 每一档里拿第几个技能。合成时由 `TowerMergeSystem` 从父塔继承。
         */
        this.skillVariant = 0;
        this.skillSilenceTimer = 0;
        this.bossSlowTimer = 0;
        this.bossSlowMultiplier = 1;
        /**
         * 表现层出口。由 GameManager 注入（null = 无特效，测试/纯逻辑场景用）。
         * Tower 不知道 GameManager 的存在：它只往这里发"我开火了 / 我炸了 / 我电到了谁"。
         */
        this.vfx = null;
        /** 瞄准角（开火方向），渲染层用它画炮口朝向 */
        this.aimAngle = -Math.PI / 2;
        /** 后坐位移：开火时朝反方向顶一下，弹簧回位 */
        this.recoil = 0;
        this.recoilAngle = 0;
        /** 对炮塔造成伤害（用于 Boss 技能如震撼重击） */
        this.hp = 100; // 炮塔默认 100 HP
        this.maxHp = 100;
        /** 缩减射程（用于 Boss 技能如日蚀协议） */
        this.rangeMultiplier = 1.0;
        this.type = type;
        this.level = level;
        this.rarity = rarity;
        this.x = x;
        this.y = y;
        this.slotIndex = slotIndex;
        // 技能变体按创建顺序轮换 —— 第 1/2/3 座同名塔各走一条 build 线。
        // 放在构造函数里自动分配（而不是当参数传），这样所有 `new Tower(...)`
        // 调用点都不用改，也不会有人"忘了传"。
        this.skillVariant = towerSerial++ % SKILL_VARIANT_COUNT;
        this.lastAttackTime = -999; // 允许立即攻击
        const config = TOWER_CONFIGS[type];
        this.damage = config.damage;
        this.range = config.range;
        this.attackInterval = config.attackSpeed;
        // 塔种自带的技能基底（不进技能配置表，属于"这个塔本来就会什么"）
        if (type === TowerType.SNIPER) {
            // 鹰眼防御塔的暴击是它的核心机制，所以直接写进默认技能袋：
            // 之后选「爆头」只改 critDamage，选「致命一击」只改 critChance，互不干扰。
            this.skillMods.critChance = 0.3;
            this.skillMods.critDamage = 3;
        }
        if (type === TowerType.ELECTRIC) {
            this.skillMods.aoeRadius = 70;
        }
        // 引力塔：持续范围减速（等级越高范围越大）
        if (type === TowerType.MAGNETIC) {
            this.skillMods.aoeSlow = true;
            this.skillMods.aoeRadius = 60 + (level - 1) * 20; // Lv1: 60, Lv2: 80, Lv3: 100, Lv4: 120, Lv5: 140
        }
        // 先应用稀有度成长，再应用等级成长。
        // 顺序有讲究：稀有度是「底子」，等级是在这个底子上按百分比叠加，
        // 所以 SSR 塔每升一级的绝对收益也更高（1.4 倍乘在更大的基数上）。
        this.applyRarityGrowth();
        this.applyLevelGrowth(level);
    }
    /**
     * 稀有度成长。直接烘进 damage / range / attackInterval 三个基础值，
     * 这样 getDamage() / getRange() / getAttackInterval() 里的过载、感染、
     * 全局升级等所有既有乘区都不需要改动，天然叠加。
     */
    applyRarityGrowth() {
        const r = RARITY_CONFIGS[this.rarity];
        this.damage *= r.dmgMult;
        this.range += r.rangeBonus;
        this.attackInterval *= r.intervalMult;
    }
    /** 计算从Lv1升到指定等级的累计成长（只用于构造时或levelUp） */
    applyLevelGrowth(targetLevel) {
        const config = TOWER_CONFIGS[this.type];
        // 从Lv1开始，每升一级应用一次成长
        for (let i = 1; i < targetLevel; i++) {
            this.damage *= config.levelUpDamageMultiplier;
            this.range += config.levelUpRangeBonus;
            this.attackInterval *= config.levelUpSpeedMultiplier;
        }
    }
    getRarity() {
        return this.rarity;
    }
    getType() {
        return this.type;
    }
    getLevel() {
        return this.level;
    }
    getX() {
        return this.x;
    }
    getY() {
        return this.y;
    }
    getSlotIndex() {
        return this.slotIndex;
    }
    getDamage() {
        const baseDamage = (this.damage + this.mergeBonusDamage) * this.getDamageMultiplier();
        const overloadMultiplier = this.overloadActive ? 3 : 1;
        return baseDamage * overloadMultiplier * this.infectionDamageMultiplier;
    }
    getRange() {
        const overloadMultiplier = this.overloadActive ? 1.5 : 1;
        return this.range * this.skillMods.rangeMult * overloadMultiplier * this.infectionRangeMultiplier * this.rangeMultiplier;
    }
    /** 返回实际攻击间隔（秒），speedMultiplier越大攻击越快（间隔越小） */
    getAttackInterval() {
        const interval = this.attackInterval / this.getSpeedMultiplier();
        const overloadMultiplier = this.overloadActive ? 2 : 1;
        // 「消失」：攻击后短暂隐身，攻速提升
        const vanishBonus = this.isVanishing() ? 1 + this.skillMods.vanishSpeedBonus : 1;
        // 关卡环境攻速惩罚（如第3关电磁干扰）也乘在这里，与过载/感染同层
        const bossSlow = this.bossSlowTimer > 0 ? this.bossSlowMultiplier : 1;
        const finalInterval = interval * Tower.envIntervalMult * bossSlow
            / (overloadMultiplier * this.infectionSpeedMultiplier * vanishBonus);
        // 防止极端升级后间隔过小
        return Math.max(0.05, finalInterval);
    }
    getConfig() {
        return TOWER_CONFIGS[this.type];
    }
    // 强化方法 —— 设置绝对值（用于继承全局升级状态）
    setDamageMultiplier(value) {
        this.damageMultiplier = value / this.globalDamageMultiplier;
    }
    getDamageMultiplier() {
        return this.damageMultiplier * this.globalDamageMultiplier;
    }
    setSpeedMultiplier(value) {
        this.speedMultiplier = value / this.globalSpeedMultiplier;
    }
    getSpeedMultiplier() {
        return this.speedMultiplier * this.globalSpeedMultiplier;
    }
    setMergeBonusDamage(value) {
        this.mergeBonusDamage = value;
    }
    addMergeBonus(value) {
        this.mergeBonusDamage += value;
    }
    setFusionBonusChance(value) {
        this.fusionBonusChance = value;
    }
    getFusionBonusChance() {
        return this.fusionBonusChance;
    }
    addFusionBonus(value) {
        this.fusionBonusChance += value;
    }
    setSlowEffect(value) {
        this.slowEffect = Math.min(0.9, value);
    }
    getSlowEffect() {
        return this.slowEffect;
    }
    setSlowDuration(value) {
        this.slowDuration = value;
    }
    getSlowDuration() {
        return this.slowDuration;
    }
    setPoisonDuration(value) {
        this.poisonDuration = value;
    }
    getPoisonDuration() {
        return this.poisonDuration;
    }
    setStunDuration(value) {
        this.stunDuration = value;
    }
    getStunDuration() {
        return this.stunDuration;
    }
    setChainCount(value) {
        this.chainCount = value;
    }
    getChainCount() {
        return this.chainCount;
    }
    setExplosionRadius(value) {
        this.explosionRadius = value;
    }
    getExplosionRadius() {
        return this.explosionRadius;
    }
    // 攻击逻辑
    canAttack(currentTime) {
        if (this.paralyzed)
            return false;
        return currentTime - this.lastAttackTime >= this.getAttackInterval();
    }
    silenceSkills(duration) { this.skillSilenceTimer = Math.max(this.skillSilenceTimer, duration); }
    areSkillsSilenced() { return this.skillSilenceTimer > 0; }
    slowAttacks(duration, intervalMultiplier = 1.65) {
        this.bossSlowTimer = Math.max(this.bossSlowTimer, duration);
        this.bossSlowMultiplier = Math.max(this.bossSlowMultiplier, intervalMultiplier);
    }
    isBossAttackSlowed() { return this.bossSlowTimer > 0; }
    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
    }
    getHp() { return this.hp; }
    getMaxHp() { return this.maxHp; }
    isDestroyed() { return this.hp <= 0; }
    reduceRange(multiplier, duration) {
        this.rangeMultiplier = multiplier;
        // 注意：这里简化处理，实际应该用 timer 控制持续时间
    }
    /** 激活过载模式 */
    activateOverload() {
        if (this.overloadActive || this.overloadCooldown > 0 || this.paralyzed) {
            return false;
        }
        this.overloadActive = true;
        this.overloadTimer = 10; // 10秒过载
        return true;
    }
    /** 更新过载和瘫痪状态 */
    updateOverload(deltaTime) {
        this.skillSilenceTimer = Math.max(0, this.skillSilenceTimer - deltaTime);
        this.bossSlowTimer = Math.max(0, this.bossSlowTimer - deltaTime);
        if (this.bossSlowTimer === 0)
            this.bossSlowMultiplier = 1;
        // 过载中
        if (this.overloadActive) {
            this.overloadTimer -= deltaTime;
            if (this.overloadTimer <= 0) {
                this.overloadActive = false;
                this.paralyzed = true;
                this.paralyzeTimer = 5; // 瘫痪5秒
                this.overloadCooldown = 30; // 冷却30秒
            }
        }
        // 瘫痪中
        if (this.paralyzed) {
            this.paralyzeTimer -= deltaTime;
            if (this.paralyzeTimer <= 0) {
                this.paralyzed = false;
            }
        }
        // 冷却中
        if (this.overloadCooldown > 0 && !this.overloadActive && !this.paralyzed) {
            this.overloadCooldown -= deltaTime;
            if (this.overloadCooldown < 0)
                this.overloadCooldown = 0;
        }
    }
    /** 更新奇点炮光球位置和攻击 */
    updateOrbs(deltaTime, enemies) {
        const currentTime = Date.now() / 1000;
        for (const orb of this.orbs) {
            // 光球绕塔旋转
            orb.angle += deltaTime * 1.5; // 旋转速度
            orb.x = this.x + Math.cos(orb.angle) * 40;
            orb.y = this.y + Math.sin(orb.angle) * 40;
            // 光球攻击逻辑
            if (currentTime - orb.lastAttackTime >= orb.attackInterval) {
                orb.lastAttackTime = currentTime;
                // 攻击最近的目标
                const target = this.findNearestEnemy(orb.x, orb.y, orb.range, enemies);
                if (target) {
                    this.orbAttack(orb, target);
                }
            }
        }
    }
    /** 光球攻击敌人 */
    orbAttack(orb, target) {
        const amount = orb.damage;
        target.takeDamage(amount, { pierce: this.skillMods.armorPierce });
        // 光球减速效果
        target.applySlow(0.3, 1.5); // 30%减速，持续1.5秒
        // 视觉反馈
        if (this.vfx) {
            const ang = Math.atan2(target.getY() - orb.y, target.getX() - orb.x);
            target.applyHitFeedback(ang, 1);
            this.vfx.floater(target.getX(), target.getY() - target.getSize() - 6, Math.max(1, Math.round(amount)).toString(), '#C084FC', 10, false);
        }
    }
    /** 查找最近敌人 */
    findNearestEnemy(x, y, range, enemies) {
        let nearest = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
            if (!enemy.isAlive())
                continue;
            const dx = enemy.getX() - x;
            const dy = enemy.getY() - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range && dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }
    /** 更新光球（供GameManager调用） */
    updateOrbsWithEnemies(deltaTime, enemies) {
        if (this.type === TowerType.SINGULARITY && this.orbs.length > 0) {
            this.updateOrbs(deltaTime, enemies);
        }
    }
    /** 获取光球列表（供渲染使用） */
    getOrbs() {
        return this.orbs.map(orb => ({ x: orb.x, y: orb.y, level: orb.level }));
    }
    isOverloaded() {
        return this.overloadActive;
    }
    isParalyzed() {
        return this.paralyzed;
    }
    /**
     * 外部施加瘫痪（自爆机雷死亡效果）。
     * 取较长的剩余时间，避免连续自爆把瘫痪时间刷短。
     */
    paralyze(duration) {
        if (duration > this.paralyzeTimer) {
            this.paralyzeTimer = duration;
        }
        this.paralyzed = true;
    }
    getParalyzeTimer() {
        return Math.max(0, this.paralyzeTimer);
    }
    getOverloadCooldown() {
        return Math.max(0, this.overloadCooldown);
    }
    // 感染系统
    infect(infectionType, damageMultiplier, rangeMultiplier, speedMultiplier, sideEffect) {
        this.infected = true;
        this.infectionType = infectionType;
        this.infectionDamageMultiplier = damageMultiplier;
        this.infectionRangeMultiplier = rangeMultiplier;
        this.infectionSpeedMultiplier = speedMultiplier;
        this.infectionSideEffect = sideEffect;
        // 吸血感染特殊处理
        if (infectionType === 'vampiric') {
            this.infectionVampiric = true;
        }
    }
    isInfectionVampiric() {
        return this.infectionVampiric;
    }
    isInfected() {
        return this.infected;
    }
    getInfectionType() {
        return this.infectionType;
    }
    findTarget(enemies) {
        let closestEnemy = null;
        let minDistance = Infinity;
        // 用 getRange() 而不是 this.range —— 过载的 1.5 倍射程要真的生效，
        // 否则"过载加射程"在 UI 上写着好看，实际打不到更远的敌人。
        const range = this.getRange();
        for (const enemy of enemies) {
            if (!enemy.isAlive())
                continue;
            // ── 迷雾禁区过滤（L8）──
            // 雾内敌人无法被防御塔锁定/攻击，但移动/逃脱不受影响
            if (ACTIVE_FOG_ZONES.length > 0) {
                const ex = enemy.getX();
                const ey = enemy.getY();
                const inFog = ACTIVE_FOG_ZONES.some(z => ex >= z.x && ex <= z.x + z.w &&
                    ey >= z.y && ey <= z.y + z.h);
                if (inFog)
                    continue;
            }
            const dx = enemy.getX() - this.x;
            const dy = enemy.getY() - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= range && distance < minDistance) {
                minDistance = distance;
                closestEnemy = enemy;
            }
        }
        return closestEnemy;
    }
    /**
     * 选出本回合要攻击的所有目标（含「多重射击」）。
     * 主目标一定是第一个，调用方按这个顺序结算。
     */
    selectTargets(enemies, primary) {
        if (this.skillMods.multiShot <= 0)
            return [primary];
        const extra = this.skillMods.multiShot;
        const picked = [primary];
        // 从近到远挑，跳过已选中的，避免多重射击全打在同一只身上
        const candidates = enemies
            .filter(e => e.isAlive() && e !== primary)
            .map(e => ({ e, d: Math.hypot(e.getX() - this.x, e.getY() - this.y) }))
            .filter(c => c.d <= this.getRange())
            .sort((a, b) => a.d - b.d);
        for (const c of candidates) {
            if (picked.length > extra)
                break;
            picked.push(c.e);
        }
        return picked;
    }
    /**
     * 攻击一组目标。
     * @param currentTime 当前游戏时间（秒），用于攻击间隔判定
     *
     * 表现与结算的关系：**伤害仍然立即结算**，弹道飞行只负责"把命中那一瞬间"
     * 推迟到子弹到达时。这样飞行期不改变 DPS（不会因为目标中途死掉就丢伤害），
     * 测试也保持确定性（伤害数字在子弹落地时才飘出来，读起来反而更对）。
     */
    attackTargets(targets, currentTime, allEnemies) {
        if (!this.canAttack(currentTime))
            return;
        this.lastAttackTime = currentTime;
        const primary = targets[0];
        for (const target of targets) {
            if (!target.isAlive())
                continue;
            const { amount, isCrit } = this.resolveDamage(target);
            target.takeDamage(amount, { pierce: this.skillMods.armorPierce });
            this.onHitLanded(target, isCrit);
            // 命中瞬间：白闪 + 击退 + 伤害飘字（飘字跟着弹道落地节奏）
            const ang = Math.atan2(target.getY() - this.y, target.getX() - this.x);
            target.applyHitFeedback(ang, isCrit ? 2 : 1);
            const dcolor = isCrit ? '#fbbf24' : '#e2e8f0';
            this.vfx?.floater(target.getX(), target.getY() - target.getSize() - 6, (isCrit ? '' : '') + Math.max(1, Math.round(amount)).toString(), dcolor, isCrit ? 13 : 10, isCrit);
        }
        // 特殊效果只以主目标为锚点触发一次（否则多重射击会把特效放三遍）
        if (primary) {
            // ⚠️ 单体 debuff **必须在开火这一帧结算**，不能跟着弹道走。
            // 弹道最长飞 0.45s，而 Lv4 焚焰塔的攻击间隔只有 0.26s —— 目标常在
            // 子弹抵达前就被后续几发打死，debuff 全部打在尸体上被静默丢弃；
            // 等级越高 DPS 越高、丢得越频繁，玩家看到的就是"升级后技能失效"。
            // 范围/穿透效果仍然跟着弹道落地（炮弹就该在弹着点炸）。
            if (!this.areSkillsSilenced())
                this.applyHitEffects(primary);
            if (this.vfx) {
                this.emitAttackVisual(primary, allEnemies, !this.areSkillsSilenced());
            }
            else {
                if (!this.areSkillsSilenced())
                    this.applyImpactEffects(primary, allEnemies);
            }
        }
    }
    /**
     * 开火的表现链路：枪口火光 → 弹道飞行 → 命中溅射。
     * 特殊效果里的爆炸/弹射仍立即结算（它们是逻辑），但视觉跟着弹道一起落地。
     */
    emitAttackVisual(primary, allEnemies, skillsEnabled = true) {
        const style = this.getVfxStyle();
        // 命中强度 = 目标体形 × 等级倍率（等级只放大视觉，见 getVfxPower 注释）
        const power = (primary.getSize() > 16 ? 1.6 : 1) * this.getVfxPower();
        // 武器旋转轴位于塔身中心稍上方；炮口朝向和弹道起点共用这一瞄准角。
        const pivotY = this.y - 3;
        this.aimAngle = Math.atan2(primary.getY() - pivotY, primary.getX() - this.x);
        this.recoil = style.recoil;
        this.recoilAngle = this.aimAngle;
        const muzzleOffset = getTowerMuzzleOffset(this.type, this.level, this.aimAngle, this.getRecoilAmount());
        const muzzleX = this.x + muzzleOffset.x;
        const muzzleY = this.y + muzzleOffset.y;
        // 激光/弹射本身就是"即时光束"的塔，弹道退化为极短的光弹，落地即光束
        const isBeamish = this.type === TowerType.LASER || this.type === TowerType.SNIPER
            || this.type === TowerType.ELECTRIC;
        this.vfx.fire(style, muzzleX, muzzleY, primary.getX(), primary.getY(), power, () => {
            // 只有范围/穿透效果跟着弹道落地；单体 debuff 已在 attackTargets 里结算
            if (skillsEnabled)
                this.applyImpactEffects(primary, allEnemies);
            if (isBeamish) {
                this.vfx.beam(muzzleX, muzzleY, primary.getX(), primary.getY(), this.type === TowerType.LASER ? 'laser' : 'arc', style.color, 
                // 光束残留时间也随等级延长 —— 高等级"扫过去"的余光更明显
                0.14 + 0.02 * (this.level - 1));
            }
        });
        // 带爆炸的塔：炮弹出膛时先轻微震一下（大地震留给爆炸落地那一瞬）
        if (isBombType(this.type))
            this.vfx.shake(style.shake * 0.3);
    }
    /** 这种塔会不会炸（用于挑震屏强度/表现） */
    isBombType() {
        return isBombType(this.type);
    }
    /** 兼容旧调用点：单目标攻击 */
    attack(enemy, currentTime, allEnemies) {
        this.attackTargets([enemy], currentTime, allEnemies);
    }
    /**
     * 结算对某个目标的伤害：聚焦 / 碎裂 / 首击 / 暴击。
     * 与 getDamage() 分开 —— getDamage() 是"面板值"，这里是"这一发实际打多少"。
     */
    resolveDamage(target) {
        const m = this.skillMods;
        let dmg = this.getDamage();
        if (m.focusRamp)
            dmg *= 1 + 0.15 * this.focusStacks;
        if (m.shatterMult > 0 && target.isSlowed())
            dmg *= 1 + m.shatterMult;
        if (m.firstStrikeMult > 1 && target !== this.lastTarget)
            dmg *= m.firstStrikeMult;
        let isCrit = false;
        if (m.critChance > 0 && Math.random() < m.critChance) {
            isCrit = true;
            let critMult = m.critDamage;
            if (m.critVsMarkedBonus > 0 && target.isMarked())
                critMult += m.critVsMarkedBonus;
            dmg *= critMult;
        }
        return { amount: dmg, isCrit };
    }
    /** 命中落地后的收尾：聚焦层数、消失计时、目标标记 */
    onHitLanded(target, _isCrit) {
        const m = this.skillMods;
        // 聚焦：同一目标叠层，换目标清零
        if (m.focusRamp) {
            this.focusStacks = target === this.lastTarget ? Math.min(5, this.focusStacks + 1) : 1;
        }
        this.lastTarget = target;
        // 消失：命中后进入短暂隐身窗口
        if (m.vanishSpeed)
            this.vanishTimer = 1.0;
        // 标记：让该目标受到的所有伤害提升
        if (m.markBonus > 0)
            target.applyMark(1 + m.markBonus);
    }
    isVanishing() {
        return this.skillMods.vanishSpeed && this.vanishTimer > 0;
    }
    /** 每帧更新技能相关的计时器（由 GameManager 调用） */
    updateSkills(deltaTime) {
        if (this.vanishTimer > 0)
            this.vanishTimer = Math.max(0, this.vanishTimer - deltaTime);
        if (this.stunCooldown > 0)
            this.stunCooldown = Math.max(0, this.stunCooldown - deltaTime);
        // 目标死了就重置聚焦，避免打空气叠层
        if (this.focusStacks > 0 && (!this.lastTarget || !this.lastTarget.isAlive())) {
            this.focusStacks = 0;
            this.lastTarget = null;
        }
    }
    // ── 技能修饰物读写 ──
    getSkillMods() {
        return this.skillMods;
    }
    /**
     * 叠加一项技能修饰物。
     * 数值型字段取"更有利"的合并方式（乘区取最大/相加依字段而定），
     * 布尔型字段一旦学到就永久生效。
     */
    applySkillMod(patch) {
        const m = this.skillMods;
        // 乘算型：直接乘
        if (patch.rangeMult !== undefined)
            m.rangeMult *= patch.rangeMult;
        if (patch.explosionRadiusMult !== undefined)
            m.explosionRadiusMult *= patch.explosionRadiusMult;
        if (patch.burnDamageMult !== undefined)
            m.burnDamageMult *= patch.burnDamageMult;
        if (patch.poisonDamageMult !== undefined)
            m.poisonDamageMult *= patch.poisonDamageMult;
        if (patch.pullMult !== undefined)
            m.pullMult *= patch.pullMult;
        if (patch.firstStrikeMult !== undefined)
            m.firstStrikeMult *= patch.firstStrikeMult;
        // 加算型：直接加
        if (patch.multiShot !== undefined)
            m.multiShot += patch.multiShot;
        if (patch.critChance !== undefined)
            m.critChance = Math.min(1, m.critChance + patch.critChance);
        if (patch.critDamage !== undefined)
            m.critDamage += patch.critDamage;
        if (patch.critVsMarkedBonus !== undefined)
            m.critVsMarkedBonus += patch.critVsMarkedBonus;
        if (patch.shatterMult !== undefined)
            m.shatterMult += patch.shatterMult;
        if (patch.chainDamageRatio !== undefined)
            m.chainDamageRatio += patch.chainDamageRatio;
        if (patch.stunChanceBonus !== undefined)
            m.stunChanceBonus += patch.stunChanceBonus;
        if (patch.armorPierce !== undefined)
            m.armorPierce = Math.min(1, m.armorPierce + patch.armorPierce);
        if (patch.shieldCorrosion !== undefined)
            m.shieldCorrosion = Math.min(0.9, m.shieldCorrosion + patch.shieldCorrosion);
        if (patch.markBonus !== undefined)
            m.markBonus += patch.markBonus;
        if (patch.weakBonus !== undefined)
            m.weakBonus += patch.weakBonus;
        if (patch.vulnBonus !== undefined)
            m.vulnBonus += patch.vulnBonus;
        if (patch.clusterBombs !== undefined)
            m.clusterBombs += patch.clusterBombs;
        if (patch.beamSplit !== undefined)
            m.beamSplit += patch.beamSplit;
        if (patch.vanishSpeedBonus !== undefined)
            m.vanishSpeedBonus += patch.vanishSpeedBonus;
        if (patch.aoeRadius !== undefined)
            m.aoeRadius *= patch.aoeRadius;
        // 布尔型 / 覆盖型：学到即生效
        if (patch.focusRamp !== undefined)
            m.focusRamp = patch.focusRamp;
        if (patch.aoeSlow !== undefined)
            m.aoeSlow = patch.aoeSlow;
        if (patch.stunSpread !== undefined)
            m.stunSpread = patch.stunSpread;
        if (patch.poisonSpread !== undefined)
            m.poisonSpread = patch.poisonSpread;
        if (patch.napalm !== undefined)
            m.napalm = patch.napalm;
        if (patch.sniperPierce !== undefined)
            m.sniperPierce = patch.sniperPierce;
        if (patch.vanishSpeed !== undefined)
            m.vanishSpeed = patch.vanishSpeed;
    }
    learnSkill(skillId) {
        if (!this.learnedSkills.includes(skillId))
            this.learnedSkills.push(skillId);
    }
    getLearnedSkills() {
        return [...this.learnedSkills];
    }
    /** 技能变体（0/1/2）：决定每档自动发第几个技能 */
    getSkillVariant() {
        return this.skillVariant;
    }
    /** 继承父塔的技能变体（合成时用，保证子塔的 build 线不跳档） */
    setSkillVariant(v) {
        this.skillVariant = ((Math.round(v) % SKILL_VARIANT_COUNT) + SKILL_VARIANT_COUNT) % SKILL_VARIANT_COUNT;
    }
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
    inheritSkills(sources, limit = Number.POSITIVE_INFINITY) {
        const ids = [];
        for (const src of sources) {
            for (const id of src.getLearnedSkills())
                if (!ids.includes(id))
                    ids.push(id);
        }
        // 档位高的排前面（skillTierOf 找不到时返回 0，排到最后）
        ids.sort((a, b) => skillTierOf(b) - skillTierOf(a));
        for (const id of ids.slice(0, Math.max(0, limit)))
            this.learnSkill(id);
    }
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
    applyHitEffects(target) {
        // 调用方保证 primary 非空，但目标可能在同一帧被别的东西打死
        if (!target.isAlive())
            return;
        const m = this.skillMods;
        switch (this.type) {
            case TowerType.FROST:
                // 霜寒防御塔：减速
                target.applySlow(this.slowEffect, this.slowDuration);
                break;
            case TowerType.POISON:
                // 瘴毒防御塔：持续伤害
                target.applyPoison(this.poisonDamage, this.poisonDuration);
                break;
            case TowerType.FLAME:
                // 焚焰防御塔：灼烧
                target.applyBurn(this.getDamage() * 0.3 * m.burnDamageMult, 3);
                break;
            case TowerType.MAGNETIC:
                // 磁引防御塔：拉扯 + 减速
                this.applyMagneticPull(target);
                break;
            default:
                break;
        }
        // ── 只作用于主目标的技能附加效果（与塔种无关）──
        if (m.shieldCorrosion > 0)
            target.applyShieldCorrosion(m.shieldCorrosion);
        if (m.weakBonus > 0)
            target.applyWeak(m.weakBonus);
        if (m.vulnBonus > 0)
            target.applyVuln(m.vulnBonus);
    }
    /**
     * 着陆效果：跟着弹道落地那一刻触发。
     * 这些本来就是"炮弹落在哪里、发生什么"，与表现同步是语义正确的 ——
     * 爆炸就该在弹着点炸，弹射就该从弹着点往外跳。
     */
    applyImpactEffects(target, allEnemies) {
        const m = this.skillMods;
        switch (this.type) {
            case TowerType.ELECTRIC:
                // 雷弧防御塔：弹射
                this.applyChainLightning(target, allEnemies);
                // 先掷概率，中了才谈扩散（v1.8 眩晕削弱）
                if (this.tryApplyStun(target) && m.stunSpread)
                    this.applyStunSpread(target, allEnemies);
                break;
            case TowerType.MAGNETIC:
                // 磁引防御塔：「磁暴」的眩晕同样要过概率，不能每拉必麻
                if (this.tryApplyStun(target) && m.stunSpread)
                    this.applyStunSpread(target, allEnemies);
                break;
            case TowerType.BOMB:
                // 爆裂防御塔：范围爆炸
                this.applyExplosion(target, allEnemies);
                break;
            case TowerType.LASER:
                // 光束防御塔：穿透攻击（技能「分裂光束」时可打多道）
                this.applyLaserBeam(target, allEnemies);
                break;
            case TowerType.SNIPER:
                // 鹰眼防御塔的暴击已移入 DEFAULT_SKILL_MODS（resolveDamage 统一结算），
                // 这里只处理技能「穿透射击」的直线穿透。
                if (m.sniperPierce)
                    this.applyLaserBeam(target, allEnemies);
                break;
            case TowerType.SINGULARITY:
                this.applyExplosion(target, allEnemies);
                break;
            default:
                break;
        }
        // ── 技能附加的范围效果（与塔种无关，任何塔学到都会生效）──
        // 注意：stunSpread 不在这里，它必须跟在"这一次真的麻住了"之后（见上面两个 case）
        if (m.aoeSlow)
            this.applyAoESlow(allEnemies);
        if (m.poisonSpread)
            this.applyPoisonSpread(target, allEnemies);
    }
    /** 「寒霜领域」/「磁力场」：攻击时对范围内所有敌人施加减速 */
    applyAoESlow(allEnemies) {
        const radius = this.skillMods.aoeRadius;
        for (const enemy of allEnemies) {
            if (!enemy.isAlive())
                continue;
            if (Math.hypot(enemy.getX() - this.x, enemy.getY() - this.y) <= radius) {
                enemy.applySlow(this.slowEffect, this.slowDuration);
            }
        }
    }
    /** 「瘟疫扩散」：毒素传染到主目标周围的敌人 */
    applyPoisonSpread(target, allEnemies) {
        const radius = this.skillMods.aoeRadius;
        for (const enemy of allEnemies) {
            if (!enemy.isAlive() || enemy === target)
                continue;
            if (Math.hypot(enemy.getX() - target.getX(), enemy.getY() - target.getY()) <= radius) {
                // 扩散的毒伤减半，避免比主目标还痛
                enemy.applyPoison(this.poisonDamage * 0.5 * this.skillMods.poisonDamageMult, this.poisonDuration);
            }
        }
    }
    /** 「麻醉气体」/「磁暴」：眩晕扩散到主目标周围的敌人（时长打折，且不再是每发必中） */
    applyStunSpread(target, allEnemies) {
        const radius = this.skillMods.aoeRadius;
        for (const enemy of allEnemies) {
            if (!enemy.isAlive() || enemy === target)
                continue;
            if (Math.hypot(enemy.getX() - target.getX(), enemy.getY() - target.getY()) <= radius) {
                enemy.applyStun(this.stunDuration * 0.4);
            }
        }
    }
    /**
     * 眩晕判定：基础概率 + 强化/技能加成，命中后进入内部冷却。
     * 返回 true 表示这一次真的麻住了目标 —— 只有 true 才允许扩散，
     * 否则「眩晕扩散」会退化成每发必中的范围控制。
     */
    tryApplyStun(target) {
        if (this.stunCooldown > 0)
            return false;
        const chance = Math.min(STUN_CHANCE_CAP, STUN_BASE_CHANCE + this.fusionBonusChance + this.skillMods.stunChanceBonus);
        if (Math.random() >= chance)
            return false;
        target.applyStun(this.stunDuration);
        this.stunCooldown = STUN_INTERNAL_COOLDOWN;
        return true;
    }
    applyChainLightning(target, allEnemies) {
        let currentTarget = target;
        // 「过载」技能把弹射伤害从 60% 提到 100%，连锁才真正有威胁
        const chainDamage = this.getDamage() * this.skillMods.chainDamageRatio;
        const hitEnemies = new Set([target]); // 防止弹射回同一目标
        // 起跳的那一枪已经在弹道落地时画过光束，这里从主目标画到下一个
        for (let i = 0; i < this.chainCount; i++) {
            let nextTarget = null;
            let minDistance = 100; // 弹射范围
            for (const enemy of allEnemies) {
                if (hitEnemies.has(enemy) || !enemy.isAlive())
                    continue;
                const dx = enemy.getX() - currentTarget.getX();
                const dy = enemy.getY() - currentTarget.getY();
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    nextTarget = enemy;
                }
            }
            if (nextTarget) {
                nextTarget.takeDamage(chainDamage, { pierce: this.skillMods.armorPierce });
                // 弹射可视化：上一跳 → 这一跳的闪电弧
                if (this.vfx) {
                    this.vfx.beam(currentTarget.getX(), currentTarget.getY(), nextTarget.getX(), nextTarget.getY(), 'arc', '#67e8f9', 0.11);
                    this.vfx.impact(nextTarget.getX(), nextTarget.getY(), 'shock', Math.atan2(nextTarget.getY() - currentTarget.getY(), nextTarget.getX() - currentTarget.getX()), 0.6 * this.getVfxPower());
                }
                nextTarget.applyHitFeedback(Math.atan2(nextTarget.getY() - currentTarget.getY(), nextTarget.getX() - currentTarget.getX()), 1);
                hitEnemies.add(nextTarget);
                currentTarget = nextTarget;
            }
            else {
                break;
            }
        }
    }
    applyExplosion(target, allEnemies) {
        const radius = this.explosionRadius * this.skillMods.explosionRadiusMult;
        this.detonate(target.getX(), target.getY(), radius, this.getDamage(), allEnemies, target);
        // 「集束炸弹」：主爆炸后再来几发小的，位置在主爆周围随机散开
        const clusters = this.skillMods.clusterBombs;
        for (let i = 0; i < clusters; i++) {
            const angle = (Math.PI * 2 * i) / Math.max(1, clusters) + Math.random() * 0.6;
            const dist = radius * (0.45 + Math.random() * 0.25);
            this.detonate(target.getX() + Math.cos(angle) * dist, target.getY() + Math.sin(angle) * dist, radius * 0.45, this.getDamage() * 0.4, allEnemies, null);
        }
        // 「凝固汽油」：爆炸范围内持续燃烧 3 秒
        if (this.skillMods.napalm) {
            const burn = this.getDamage() * 0.25 * this.skillMods.burnDamageMult;
            for (const enemy of allEnemies) {
                if (!enemy.isAlive())
                    continue;
                if (Math.hypot(enemy.getX() - target.getX(), enemy.getY() - target.getY()) <= radius) {
                    enemy.applyBurn(burn, 3);
                }
            }
        }
    }
    /** 一次圆形爆炸。primary 为 null 表示这是集束小爆炸（不给主目标双倍）。 */
    detonate(x, y, radius, baseDamage, allEnemies, primary) {
        for (const enemy of allEnemies) {
            if (!enemy.isAlive())
                continue;
            // 主目标的单发伤害已在 attackTargets 里按 resolveDamage 结算过，
            // 这里若再给它一份 baseDamage，这一发就变 2×（实测 BOMB/LASER 都恰好翻倍）。
            // 爆炸的意义是"溅到弹着点周围的人"，所以跳过主目标，只打别人（半伤）。
            // 集束小爆炸传 primary=null → 没有任何敌人等于 null，谁都拦不住，照常全溅。
            if (enemy === primary)
                continue;
            if (Math.hypot(enemy.getX() - x, enemy.getY() - y) <= radius) {
                enemy.takeDamage(baseDamage * 0.5, { pierce: this.skillMods.armorPierce });
            }
        }
        // 爆炸表现：火一样的冲击环 + 二次薄环 + 地面焦痕 + 大地震
        // 视觉强度随等级放大（power 只进 impact/shake，不改伤害与爆炸半径）
        if (this.vfx) {
            const pw = this.getVfxPower();
            this.vfx.shockwave(x, y, '#fdba74', radius * 1.05, 0.4, 3.5 * pw);
            this.vfx.shockwave(x, y, '#fff7ed', radius * 0.7, 0.26, 6 * pw);
            this.vfx.impact(x, y, 'boom', Math.random() * Math.PI * 2, (primary ? 1.4 : 0.9) * pw);
            this.vfx.flash(x, y, radius * 0.8 * pw, '#fed7aa', 0.12);
            this.vfx.shake((primary ? 3.2 : 1.6) * pw);
            if (primary)
                this.vfx.hitStop(0.05);
        }
    }
    applyLaserBeam(target, allEnemies) {
        // 激光穿透效果：把伤害"捅"到主目标身后直线上的敌人。
        const laserRange = 50;
        const damage = this.getDamage();
        // 注意：**不再给主目标打第二次**。它的单发伤害已在 attackTargets 结算，
        // 早先这里又 takeDamage(damage) 一次，导致 LASER 单发恰好 2×（实测确认）。
        // 光束真正的作用是下方的"穿透段"——打到主目标周围的友军/后续敌人。
        // 主光束：从塔到目标的一根亮线（落地瞬间画出）
        if (this.vfx) {
            const muzzle = getTowerMuzzleOffset(this.type, this.level, this.aimAngle, this.getRecoilAmount());
            const muzzleX = this.x + muzzle.x;
            const muzzleY = this.y + muzzle.y;
            this.vfx.beam(muzzleX, muzzleY, target.getX(), target.getY(), 'laser', '#f472b6', 0.16);
            this.vfx.impact(target.getX(), target.getY(), 'spark', Math.atan2(target.getY() - muzzleY, target.getX() - muzzleX), 1.2 * this.getVfxPower());
        }
        // 「分裂光束」：除主光束外再打几道
        const beams = this.skillMods.beamSplit;
        const hitByBeam = (from, dmg) => {
            for (const enemy of allEnemies) {
                if (enemy === from || !enemy.isAlive())
                    continue;
                if (Math.hypot(enemy.getX() - from.getX(), enemy.getY() - from.getY()) <= laserRange) {
                    enemy.takeDamage(dmg * 0.7, { pierce: this.skillMods.armorPierce });
                    if (this.vfx) {
                        this.vfx.beam(from.getX(), from.getY(), enemy.getX(), enemy.getY(), 'laser', '#f9a8d4', 0.12);
                        enemy.applyHitFeedback(Math.atan2(enemy.getY() - from.getY(), enemy.getX() - from.getX()), 0.8);
                    }
                }
            }
        };
        for (let i = 0; i < beams; i++)
            hitByBeam(target, damage);
        // 查找直线上的其他敌人（主光束的穿透）
        for (const enemy of allEnemies) {
            if (enemy === target || !enemy.isAlive())
                continue;
            const dx = enemy.getX() - target.getX();
            const dy = enemy.getY() - target.getY();
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= laserRange) {
                enemy.takeDamage(damage * 0.7, { pierce: this.skillMods.armorPierce }); // 穿透伤害70%
                if (this.vfx)
                    enemy.applyHitFeedback(Math.atan2(dy, dx), 0.8);
            }
        }
    }
    applyMagneticPull(target) {
        // 想要的拉扯距离（技能 pullMult 会放大），但**必须过敌人的预算闸门**。
        // 闸门在 Enemy 身上、按敌人自身速度发放 —— 所以这里给多大都不会破，
        // 单次距离只决定"能不能吃满预算"。详见 Enemy.takePullBudget。
        const want = MAGNETIC_PULL_BASE * this.skillMods.pullMult;
        const allowed = target.takePullBudget(want);
        // 预算耗尽时（短时间内被多座引力场同时拉）只保留减速，不再位移
        if (allowed > 0.5) {
            const dx = this.x - target.getX();
            const dy = this.y - target.getY();
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 0) {
                target.setPosition(target.getX() + (dx / distance) * allowed, target.getY() + (dy / distance) * allowed);
                // 拉扯表现：一圈紫色脉冲 + 目标身上溅一串金属火花
                if (this.vfx) {
                    this.vfx.shockwave(target.getX(), target.getY(), '#c4b5fd', 34, 0.3, 2, 'pulse');
                    this.vfx.impact(target.getX(), target.getY(), 'spark', Math.atan2(-dy, -dx), 0.8 * this.getVfxPower());
                }
            }
        }
        // 应用减速效果（引力场的核心价值在这里，拉扯只是"看得见的牵引感"）
        target.applySlow(MAGNETIC_SLOW_FACTOR, MAGNETIC_SLOW_DURATION);
    }
    /**
     * 修复：levelUp 只应用一级的增量，不重复累加
     */
    levelUp() {
        this.level++;
        const config = TOWER_CONFIGS[this.type];
        // 只应用新升这一级的成长
        this.damage *= config.levelUpDamageMultiplier;
        this.range += config.levelUpRangeBonus;
        this.attackInterval *= config.levelUpSpeedMultiplier;
        // 奇点炮：4级生成1个光球，5级生成第2个光球
        if (this.type === TowerType.SINGULARITY) {
            if (this.level === 4 && this.orbs.length === 0) {
                this.spawnOrb(3); // 攻击力等同3级奇点炮
            }
            else if (this.level === 5 && this.orbs.length === 1) {
                this.spawnOrb(4); // 攻击力等同4级奇点炮
            }
        }
    }
    /** 生成奇点炮光球 */
    spawnOrb(orbLevel) {
        const config = TOWER_CONFIGS[TowerType.SINGULARITY];
        // 计算该等级的伤害
        let orbDamage = config.damage;
        for (let i = 1; i < orbLevel; i++) {
            orbDamage *= config.levelUpDamageMultiplier;
        }
        const orb = {
            x: this.x,
            y: this.y,
            angle: this.orbs.length * Math.PI, // 多个光球错开角度
            damage: orbDamage,
            range: config.range * 0.8, // 光球射程略小于主塔
            attackInterval: config.attackSpeed * 1.2, // 光球攻速略慢
            lastAttackTime: 0,
            level: orbLevel
        };
        this.orbs.push(orb);
    }
    canMergeWith(other) {
        // 同类合成：相同类型、相同等级。
        // 刻意**不比较稀有度** —— 稀有度取两者中较高者（见 TowerMergeSystem.mergeSame）。
        // 这样玩家可以拿低品阶的同名塔去喂高品阶的塔，把抽到的"废卡"变成升级材料，
        // 而不是因为品阶不同就永远合不掉、占着格子。
        //
        // 满级封顶：技能是「每升 1 级发 1 个」，Lv4 已经把 3 个技能位填满。
        // 再往上合只会白白吃掉一座防御塔换来一点数值，所以直接拦掉。
        if (this.level >= MAX_TOWER_LEVEL)
            return false;
        return this.type === other.type && this.level === other.level;
    }
    setSlotIndex(index) {
        this.slotIndex = index;
    }
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
    /**
     * 应用全局升级状态（用于新防御塔继承已有升级）
     * 此方法设置绝对值，不会重复叠加
     */
    applyGlobalUpgradeState(state) {
        this.globalDamageMultiplier = state.damageMultiplier * (state.towerDamageMultipliers[this.type] ?? 1);
        this.globalSpeedMultiplier = state.speedMultiplier * (state.towerSpeedMultipliers[this.type] ?? 1);
        // 根据防御塔类型应用对应的特殊升级
        switch (this.type) {
            case TowerType.FROST:
                this.slowEffect = Math.min(0.9, 0.5 + state.frostSlowBonus);
                break;
            case TowerType.ELECTRIC:
                this.chainCount = 1 + state.electricChainBonus;
                break;
            case TowerType.POISON:
                this.poisonDuration = 5.0 + state.poisonDurationBonus;
                break;
            case TowerType.BOMB:
                this.explosionRadius = 60 * state.bombRadiusMultiplier;
                break;
            case TowerType.SINGULARITY:
                this.explosionRadius = 60 * state.bombRadiusMultiplier;
                break;
        }
    }
}
/**
 * 关卡环境攻速乘数（如第3关「电磁干扰」= 1.18 表示攻击间隔拉长 18%）。
 * 设为 static 是因为它由关卡决定、作用于全场，没必要逐个塔同步；
 * GameManager 在切关时设置一次即可。
 */
Tower.envIntervalMult = 1.0;
//# sourceMappingURL=Tower.js.map