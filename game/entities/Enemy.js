/**
 * 敌人实体类
 */
import { EnemyType, ENEMY_CONFIGS, PATH_POINTS, isBossType, MAGNETIC_PULL_BUDGET_RATIO, MAGNETIC_PULL_MASS, ACTIVE_PORTALS } from '../config/GameConfig.js';
export class Enemy {
    constructor(type, waveMultiplier = 1.0, pathPoints = PATH_POINTS, bossSkill, levelIndex = 0, warpSegments) {
        this.timedSpeedMultiplier = 1;
        this.timedSpeedTimer = 0;
        /** 关卡索引（0-9），用于视觉变体 */
        this.levelIndex = 0;
        this.pathIndex = 0;
        /** 传送门段号集合：段 i 表示 points[i] → points[i+1] 是瞬移 */
        this.warpSegments = new Set();
        /** 刚完成一次瞬移后的表现计时（秒），供渲染层画空间扰动 */
        this.teleportFlash = 0;
        this.bossSkillTimer = 7;
        this.bossSkillWarningTimer = 0;
        this.bossSkillTriggered = false; // 用于一次性技能（如能量护盾）
        this.alive = true;
        this.reachedEnd = false;
        // ── 动画状态（纯表现，不参与任何数值结算）──
        /** 行走相位：按真实位移推进（眩晕时冻结） */
        this.animPhase = 0;
        /** 与速度无关的 idle 时钟 */
        this.animIdle = 0;
        /** 朝向：1 向右 / -1 向左 */
        this.facing = 1;
        /** 出生年龄（秒）：入场弹出用 */
        this.age = 0;
        // 状态效果
        this.slowFactor = 1.0;
        this.slowTimer = 0;
        this.poisonDamage = 0;
        this.poisonTimer = 0;
        this.poisonTickTimer = 0;
        this.stunTimer = 0;
        this.burnDamage = 0;
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.markMultiplier = 1.0;
        this.markTimer = 0;
        /**
         * 磁力拉扯预算（px）。初始「无限制」，首次 update 时收敛到上限。
         *
         * 见 `takePullBudget` —— 这是"引力场不再能把敌人定身"的唯一防线。
         */
        this.pullBudget = Number.POSITIVE_INFINITY;
        // ── 易伤 debuff（技能：「虚弱」「脆弱」）──
        // 触发条件直接挂在已有的状态计时器上（中毒 → 虚弱，被眩晕 → 脆弱），
        // 不另开计时器 —— 少一套需要同步的时钟，语义也更好理解：
        // "中毒期间受到的伤害 +25%" / "被眩晕期间受到的伤害 +40%"。
        this.weakBonus = 0;
        this.vulnBonus = 0;
        // ── 熔甲（技能 flame_armor）──
        /** 护盾腐蚀比例 0~1。每次命中按比例削掉当前护盾，专克高护盾的护盾机兵。 */
        this.shieldCorrosion = 0;
        /** 本次命中是否已经结算过腐蚀（避免一发伤害把腐蚀叠两次） */
        this.corrosionApplied = false;
        // 治疗能力
        this.healTimer = 0;
        this.healCooldown = 3.0;
        this.healAmount = 20;
        // 治疗半径 80 → 130。
        // 治疗者速度 32，而它要奶的重甲是 28、Boss 是 22 —— 它其实跑得比队友快，
        // 会慢慢走到队伍前面，80px 的半径根本够不到身后的目标，整个治疗机制是空转的。
        // 加大到 130 之后，无论队友在它前面还是后面都能被覆盖。
        this.healRange = 130;
        // 变异系统
        this.mutation = '';
        this.regenRate = 0;
        this.damageReduction = 0;
        // ── 护盾（护盾机兵）──
        /** 剩余护盾值。护盾未破时，低单发伤害会被大幅削减。 */
        this.shield = 0;
        this.maxShield = 0;
        // ── 相位化（相位隐形机）──
        this.phaseCycle = 0;
        this.phaseDuration = 0;
        this.phaseTimer = 0;
        this.phased = false;
        // ── 死亡特效（自爆机雷）──
        this.deathParalyzeRadius = 0;
        this.deathParalyzeDuration = 0;
        // ── 新怪物机制 ──
        // EMP无人机/精英
        this.empRadius = 0;
        this.empDuration = 0;
        this.empCooldown = 0;
        this.empTimer = 0;
        this.deathEmpRadius = 0;
        this.deathEmpDuration = 0;
        // 反射甲虫/精英
        this.reflectRatio = 0;
        // 加速引擎兵/指挥官
        this.auraRadius = 0;
        this.auraSpeedBoost = 1;
        this.auraDamageReduction = 0;
        // 隐身刺客/虚空行者
        this.stealthAlpha = 1;
        this.coreRevealDistance = 0;
        this.stealthed = false;
        // 磁力盾卫
        this.attractRadius = 0;
        // 再生巨虫
        this.newRegenRate = 0;
        this.lowHpRegenRate = 0;
        // 精英·反射堡垒
        this.deathSplitCount = 0;
        // 精英·虚空行者
        this.deathCoreDamage = 0;
        // 受击表现（白闪 + 击退位移），不参与任何数值计算
        this.hitFlash = 0;
        this.hitDir = 0;
        this.knockX = 0;
        this.knockY = 0;
        // 计数标记
        this.counted = false;
        this.type = type;
        this.waveMultiplier = Math.max(0.01, Number.isFinite(waveMultiplier) ? waveMultiplier : 1);
        this.pathPoints = pathPoints.length >= 2 ? pathPoints : PATH_POINTS;
        this.bossSkill = bossSkill;
        this.levelIndex = levelIndex;
        // 传送门段号：段 i（points[i] → points[i+1]）是瞬移，不在地面行走。
        this.warpSegments = new Set(warpSegments ?? []);
        const config = ENEMY_CONFIGS[type];
        this.maxHp = config.hp * this.waveMultiplier;
        this.hp = this.maxHp;
        this.speed = config.speed;
        this.baseSpeed = config.speed;
        this.reward = config.reward;
        this.size = config.size;
        this.escapeDamage = config.escapeDamage;
        // 护盾机兵：护盾值按最大生命的比例给，也随波次倍率一起膨胀
        if (config.shieldRatio) {
            this.maxShield = this.maxHp * config.shieldRatio;
            this.shield = this.maxShield;
        }
        // 相位隐形机：相位周期从随机偏移开始，避免同波幽灵整齐划一地一起变透明
        if (config.phaseCycle && config.phaseDuration) {
            this.phaseCycle = config.phaseCycle;
            this.phaseDuration = config.phaseDuration;
            this.phaseTimer = Math.random() * this.phaseCycle;
        }
        // 自爆机雷：死亡时的瘫痪参数
        if (config.deathParalyzeRadius) {
            this.deathParalyzeRadius = config.deathParalyzeRadius;
            this.deathParalyzeDuration = config.deathParalyzeDuration || 3;
        }
        // EMP无人机/精英
        if (config.empRadius) {
            this.empRadius = config.empRadius;
            this.empDuration = config.empDuration || 1.5;
            this.empCooldown = config.empCooldown || 8;
            this.empTimer = this.empCooldown * Math.random(); // 随机初始冷却
        }
        if (config.deathEmpRadius) {
            this.deathEmpRadius = config.deathEmpRadius;
            this.deathEmpDuration = config.deathEmpDuration || 2;
        }
        // 反射甲虫/精英
        if (config.reflectRatio) {
            this.reflectRatio = config.reflectRatio;
        }
        // 加速引擎兵/指挥官
        if (config.auraRadius) {
            this.auraRadius = config.auraRadius;
            this.auraSpeedBoost = config.auraSpeedBoost || 1.2;
            this.auraDamageReduction = config.auraDamageReduction || 0;
        }
        // 隐身刺客/虚空行者
        if (config.stealthAlpha !== undefined) {
            this.stealthAlpha = config.stealthAlpha;
            this.coreRevealDistance = config.coreRevealDistance || 50;
            this.stealthed = true;
        }
        // 磁力盾卫
        if (config.attractRadius) {
            this.attractRadius = config.attractRadius;
        }
        // 再生巨虫
        if (config.regenRate) {
            this.newRegenRate = config.regenRate;
            this.lowHpRegenRate = config.lowHpRegenRate || 0.05;
        }
        // 精英·反射堡垒
        if (config.deathSplitCount) {
            this.deathSplitCount = config.deathSplitCount;
        }
        // 精英·虚空行者
        if (config.deathCoreDamage) {
            this.deathCoreDamage = config.deathCoreDamage;
        }
        // 初始位置
        this.x = this.pathPoints[0].x;
        this.y = this.pathPoints[0].y;
    }
    getPathPoints() { return this.pathPoints; }
    /** 传送门段号（分裂子体等派生实体需要继承，否则子体会把传送段当普通路走） */
    getWarpSegments() { return [...this.warpSegments]; }
    /** 0..0.34 秒的瞬移余辉；>0 时渲染层画空间扰动环 */
    getTeleportFlash() { return this.teleportFlash; }
    getBossSkill() { return this.bossSkill; }
    getWaveMultiplier() { return this.waveMultiplier; }
    /** 根据 Boss 技能类型获取冷却时间 */
    getBossSkillCooldown() {
        const cooldowns = {
            'emp_stun': 9, // L1: 9秒
            'overload_aura': 15, // L2: 15秒
            'energy_shield': 999, // L3: 一次性触发（血量低于50%）
            'gold_drain': 18, // L4: 18秒
            'earthquake': 8, // L5: 8秒
            'silence_field': 10, // L6: 10秒
            'time_stop': 15, // L7: 15秒
            'death_ray': 18, // L8: 18秒
            'eclipse_protocol': 15 // L9: 15秒（二阶段）
        };
        return cooldowns[this.bossSkill || ''] || 10;
    }
    /** Boss技能按冷却触发，第一次入场后延迟施放，留给玩家反应时间。 */
    consumeBossSkillPulse(deltaTime) {
        if (!this.bossSkill || !this.isAlive() || !isBossType(this.type))
            return false;
        // L3 能量护盾：血量低于 50% 时触发
        if (this.bossSkill === 'energy_shield') {
            const hpPercent = this.hp / this.maxHp;
            if (hpPercent < 0.5 && !this.bossSkillTriggered) {
                this.bossSkillTriggered = true;
                this.bossSkillWarningTimer = 1.25;
                return false;
            }
            return false;
        }
        if (this.bossSkillWarningTimer > 0) {
            this.bossSkillWarningTimer -= deltaTime;
            if (this.bossSkillWarningTimer <= 0) {
                this.bossSkillWarningTimer = 0;
                this.bossSkillTimer = this.getBossSkillCooldown();
                return true;
            }
            return false;
        }
        this.bossSkillTimer -= deltaTime;
        if (this.bossSkillTimer <= 0)
            this.bossSkillWarningTimer = 1.25;
        return false;
    }
    isBossSkillCharging() { return this.bossSkillWarningTimer > 0; }
    /** 是否处于相位化（免疫伤害）状态 */
    isPhased() {
        return this.phased;
    }
    getShield() {
        return this.shield;
    }
    getMaxShield() {
        return this.maxShield;
    }
    /** 自爆机雷的死亡瘫痪参数；非自爆单位返回 null */
    getDeathParalyze() {
        if (this.deathParalyzeRadius <= 0)
            return null;
        return { radius: this.deathParalyzeRadius, duration: this.deathParalyzeDuration };
    }
    /** EMP 无人机/精英：是否应该释放 EMP */
    shouldEmp() {
        return this.empRadius > 0 && this.empTimer <= 0;
    }
    /** EMP 无人机/精英：重置 EMP 计时器 */
    resetEmpTimer() {
        this.empTimer = this.empCooldown;
    }
    /** EMP 无人机/精英：获取 EMP 参数 */
    getEmpParams() {
        if (this.empRadius <= 0)
            return null;
        return { radius: this.empRadius, duration: this.empDuration };
    }
    /**
     * EMP 蓄能进度 0..1（0 = 刚放完，1 = 即将再次释放）。
     * 纯表现层用：渲染层据此决定头顶电弧的亮度，让玩家能预判下一次干扰。
     */
    getEmpChargeRatio() {
        if (this.empRadius <= 0 || this.empCooldown <= 0)
            return 0;
        return Math.max(0, Math.min(1, 1 - this.empTimer / this.empCooldown));
    }
    /** 精英·电磁风暴：死亡 EMP 参数 */
    getDeathEmpParams() {
        if (this.deathEmpRadius <= 0)
            return null;
        return { radius: this.deathEmpRadius, duration: this.deathEmpDuration };
    }
    /** 反射甲虫/精英：获取反射比例 */
    getReflectRatio() {
        return this.reflectRatio;
    }
    /** 加速引擎兵/指挥官：获取光环参数 */
    getAuraParams() {
        if (this.auraRadius <= 0)
            return null;
        return { radius: this.auraRadius, speedBoost: this.auraSpeedBoost, damageReduction: this.auraDamageReduction };
    }
    /** 隐身刺客/虚空行者：是否隐身状态 */
    isStealthed() {
        return this.stealthed;
    }
    /** 隐身刺客/虚空行者：获取透明度 */
    getStealthAlpha() {
        return this.stealthAlpha;
    }
    /** 磁力盾卫：获取吸引半径 */
    getAttractRadius() {
        return this.attractRadius;
    }
    /** 精英·反射堡垒：死亡分裂数量 */
    getDeathSplitCount() {
        return this.deathSplitCount;
    }
    /** 精英·虚空行者：死亡对核心伤害 */
    getDeathCoreDamage() {
        return this.deathCoreDamage;
    }
    getType() {
        return this.type;
    }
    getLevelIndex() {
        return this.levelIndex;
    }
    getX() {
        return this.x;
    }
    getY() {
        return this.y;
    }
    getHp() {
        return this.hp;
    }
    getMaxHp() {
        return this.maxHp;
    }
    getSize() {
        return this.size;
    }
    isAlive() {
        return this.alive;
    }
    hasReachedEnd() {
        return this.reachedEnd;
    }
    getReward() {
        return this.reward;
    }
    /** 漏过核心病房时扣除的生命值（Boss 5 / 精英 2 / 杂兵 1） */
    getEscapeDamage() {
        return this.escapeDamage;
    }
    update(deltaTime, allEnemies) {
        if (!this.alive)
            return;
        if (this.teleportFlash > 0)
            this.teleportFlash = Math.max(0, this.teleportFlash - deltaTime);
        if (this.timedSpeedTimer > 0) {
            this.timedSpeedTimer = Math.max(0, this.timedSpeedTimer - deltaTime);
            if (this.timedSpeedTimer === 0)
                this.timedSpeedMultiplier = 1;
        }
        // ── 相位化（相位隐形机）──
        // 周期内前 phaseDuration 秒处于相位（免疫伤害），其余时间可被打。
        if (this.phaseCycle > 0) {
            this.phaseTimer -= deltaTime;
            if (this.phaseTimer <= 0) {
                if (this.phased) {
                    // 相位结束 → 补足本周期剩余的可被攻击时间
                    this.phased = false;
                    this.phaseTimer = Math.max(0.1, this.phaseCycle - this.phaseDuration);
                }
                else {
                    // 进入相位
                    this.phased = true;
                    this.phaseTimer = this.phaseDuration;
                }
            }
        }
        // 更新状态效果
        this.updateStatusEffects(deltaTime, allEnemies);
        // 持续伤害可能在本帧击杀目标；死亡实体不能再移动到终点被重复算作漏怪。
        if (!this.alive)
            return;
        // 变异再生效果
        if (this.regenRate > 0) {
            this.heal(this.regenRate * deltaTime);
        }
        // 如果眩晕，不移动
        if (this.stunTimer > 0)
            return;
        // 动画时钟。放在眩晕 return 之后 —— 被麻住的怪必须定格，
        // 否则"它已经停了"和"它还在走"在视觉上分不出来。
        this.animIdle += deltaTime;
        this.age += deltaTime;
        // 移动
        this.move(deltaTime);
        // 治疗者逻辑
        if (this.type === EnemyType.HEALER) {
            this.healTimer += deltaTime;
            if (this.healTimer >= this.healCooldown) {
                this.healTimer = 0;
                this.healNearby(allEnemies);
            }
        }
        // EMP 无人机/精英：定期沉默防御塔
        if (this.empRadius > 0) {
            this.empTimer -= deltaTime;
            if (this.empTimer <= 0) {
                this.empTimer = this.empCooldown;
                // EMP 效果由 GameManager 处理
            }
        }
        // 再生巨虫：持续回复
        if (this.newRegenRate > 0) {
            const hpPercent = this.hp / this.maxHp;
            const rate = hpPercent < 0.5 ? this.lowHpRegenRate : this.newRegenRate;
            this.heal(this.maxHp * rate * deltaTime);
        }
        // 隐身刺客/虚空行者：根据距离核心的距离决定是否可见
        if (this.stealthAlpha < 1) {
            // 计算到核心的距离（假设核心在路径终点）
            const corePoint = this.pathPoints[this.pathPoints.length - 1];
            const distToCore = Math.sqrt((this.x - corePoint.x) ** 2 + (this.y - corePoint.y) ** 2);
            this.stealthed = distToCore > this.coreRevealDistance;
        }
    }
    updateStatusEffects(deltaTime, allEnemies) {
        // ── 磁力拉扯预算回填 ──
        // 上限 = 当前有效速度 × 比例 × 质量系数，按时间线性回填（1 秒回满）。
        // 放在状态效果之前算，用的是**本帧减速生效后**的速度，所以"减速"和"拉扯"
        // 不会互相放大成定身。
        const pullCap = this.speed * this.slowFactor
            * MAGNETIC_PULL_BUDGET_RATIO * this.pullMass();
        this.pullBudget = Math.min(pullCap, this.pullBudget + pullCap * deltaTime);
        // 减速效果
        if (this.slowTimer > 0) {
            this.slowTimer -= deltaTime;
            if (this.slowTimer <= 0) {
                this.slowFactor = 1.0;
            }
        }
        // 毒素效果
        if (this.poisonTimer > 0) {
            this.poisonTimer -= deltaTime;
            this.poisonTickTimer += deltaTime;
            // 每秒造成伤害
            if (this.poisonTickTimer >= 1.0) {
                this.poisonTickTimer = 0;
                this.takeDamage(this.poisonDamage);
            }
            if (this.poisonTimer <= 0) {
                this.poisonDamage = 0;
            }
        }
        // 眩晕效果
        if (this.stunTimer > 0) {
            this.stunTimer -= deltaTime;
        }
        // 灼烧效果
        if (this.burnTimer > 0) {
            this.burnTimer -= deltaTime;
            this.burnTickTimer += deltaTime;
            // 每秒造成伤害
            if (this.burnTickTimer >= 1.0) {
                this.burnTickTimer = 0;
                this.takeDamage(this.burnDamage);
            }
            if (this.burnTimer <= 0) {
                this.burnDamage = 0;
            }
        }
        // 标记效果
        if (this.markTimer > 0) {
            this.markTimer -= deltaTime;
            if (this.markTimer <= 0) {
                this.markMultiplier = 1.0;
            }
        }
    }
    move(deltaTime) {
        if (this.pathIndex >= this.pathPoints.length - 1) {
            // ── 传送门网络跳跃（L6/L7/L8）──
            // 敌人走到路线终点时，检查是否到达某个传送门。如果是，从其余门中随机选一个跳出。
            if (ACTIVE_PORTALS.length > 0) {
                const currentPos = this.pathPoints[this.pathIndex];
                const arrivedPortal = ACTIVE_PORTALS.find(p => Math.abs(p.x - currentPos.x) < 5 && Math.abs(p.y - currentPos.y) < 5);
                if (arrivedPortal) {
                    // 入口传送门（id 以 'E' 开头）→ 随机跳到非入口传送门
                    // 非入口传送门 → 直接走 outgoing 到核心，不再跳跃
                    if (arrivedPortal.id.startsWith('E')) {
                        const exitPortals = ACTIVE_PORTALS.filter(p => !p.id.startsWith('E'));
                        if (exitPortals.length > 0) {
                            const nextPortal = exitPortals[Math.floor(Math.random() * exitPortals.length)];
                            this.pathPoints = nextPortal.outgoing.map(pt => ({ x: pt.x, y: pt.y }));
                            this.pathIndex = 0;
                            this.x = nextPortal.x;
                            this.y = nextPortal.y;
                            this.teleportFlash = 0.34;
                            return;
                        }
                    }
                    else {
                        // 非入口传送门：走 outgoing 到核心，不再跳跃
                        this.pathPoints = arrivedPortal.outgoing.map(pt => ({ x: pt.x, y: pt.y }));
                        this.pathIndex = 0;
                        this.x = arrivedPortal.x;
                        this.y = arrivedPortal.y;
                        this.teleportFlash = 0.34;
                        return;
                    }
                }
            }
            this.reachedEnd = true;
            this.alive = false;
            return;
        }
        const target = this.pathPoints[this.pathIndex + 1];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const moveSpeed = this.speed * this.slowFactor * this.timedSpeedMultiplier * deltaTime;
        let prevX = this.x;
        let prevY = this.y;
        if (distance <= moveSpeed) {
            this.x = target.x;
            this.y = target.y;
            this.pathIndex++;
            // ── 传送门 ──
            // 到达 points[i] 且段 i 是传送段时，直接出现在 points[i+1]，
            // 中间那段路不存在（渲染层也不铺路面）。while 是为了支持连续多段。
            // 注意：不能用 for 遍历 warpSegments 判断"是否经过"，段号必须
            // 精确等于刚走完的那一段，否则会被前面的段重复触发。
            while (this.warpSegments.has(this.pathIndex) && this.pathIndex + 1 < this.pathPoints.length) {
                this.pathIndex++;
                this.x = this.pathPoints[this.pathIndex].x;
                this.y = this.pathPoints[this.pathIndex].y;
                this.teleportFlash = 0.34;
                // 瞬移不是"走"过去的：把参考点跟着挪到落点，
                // 否则 animPhase 会按 200px 位移暴涨，敌人一到传送门就原地狂蹬腿。
                prevX = this.x;
                prevY = this.y;
            }
        }
        else {
            this.x += (dx / distance) * moveSpeed;
            this.y += (dy / distance) * moveSpeed;
        }
        // ── 行走相位：按「真实位移」推进，不是按时间 ──
        // 于是走得快的怪步子也快、被减速的怪步子也慢，步频天然跟速度挂钩；
        // 停下来（堵在路口）相位不再推进，也不会出现"原地踏步"。
        const movedX = this.x - prevX;
        const movedY = this.y - prevY;
        const moved = Math.abs(movedX) + Math.abs(movedY);
        this.animPhase += moved * 0.14;
        if (Math.abs(movedX) > 0.05)
            this.facing = movedX > 0 ? 1 : -1;
    }
    /** 行走相位（渲染用；按位移推进，眩晕时冻结） */
    getAnimPhase() {
        return this.animPhase;
    }
    /** 与速度无关的 idle 时钟（呼吸/漂浮） */
    getAnimIdle() {
        return this.animIdle;
    }
    /** 朝向：1 向右 / -1 向左 */
    getFacing() {
        return this.facing;
    }
    /** 出生年龄（秒）：用于入场弹出 */
    getAge() {
        return this.age;
    }
    healNearby(allEnemies) {
        for (const enemy of allEnemies) {
            if (enemy === this || !enemy.isAlive())
                continue;
            const dx = enemy.getX() - this.x;
            const dy = enemy.getY() - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= this.healRange) {
                enemy.heal(this.healAmount);
            }
        }
    }
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
    takeDamage(damage, options) {
        if (!this.alive || !Number.isFinite(damage) || damage <= 0)
            return;
        // 相位化期间免疫一切伤害（相位隐形机）。
        // 注意：这里直接返回而不是"减伤 100%"，是因为燃烧/毒素的持续伤害
        // 也是走 takeDamage 的 —— 相位应该让所有伤害来源都失效，这样
        // 「挂上毒再走开」的取巧解法不成立，玩家必须真的在可攻击窗口里输出。
        if (this.phased)
            return;
        const pierce = Math.max(0, Math.min(1, options?.pierce ?? 0));
        // 护盾在腐蚀下先被削掉一层，剩下的才参与本次结算
        if (this.shieldCorrosion > 0 && this.shield > 0 && !this.corrosionApplied) {
            this.shield *= (1 - this.shieldCorrosion);
            this.corrosionApplied = true;
        }
        // 总受伤倍率：标记 ×（中毒时虚弱）×（眩晕时脆弱）
        const takenMult = this.getDamageTakenMultiplier();
        let totalDamage = damage * takenMult;
        const bypass = totalDamage * pierce;
        let remaining = totalDamage - bypass;
        // ── 护盾结算（护盾机兵）──
        // 先扣护盾，护盾未破时低单发伤害被削减到 35%。
        // 设计意图：让"高频低伤"的连射防御塔/焚焰防御塔在护盾面前吃瘪，
        // 而鹰眼防御塔/光束防御塔/爆裂防御塔这种高单发伤害的塔能快速破盾。
        if (this.shield > 0 && !options?.ignoreShield && remaining > 0) {
            const mult = remaining < Enemy.SHIELD_BREAK_THRESHOLD ? Enemy.SHIELD_SMALL_HIT_MULT : 1.0;
            const shieldDamage = remaining * mult;
            if (shieldDamage >= this.shield) {
                // 护盾被打破，溢出部分按原始伤害打进血量
                const overflowRatio = (shieldDamage - this.shield) / Math.max(0.0001, shieldDamage);
                remaining = remaining * overflowRatio;
                this.shield = 0;
            }
            else {
                this.shield -= shieldDamage;
                remaining = 0; // 护盾吸收了全部非穿透伤害
            }
        }
        // 应用变异抗性（抗性变异 -30%）
        const actualDamage = (remaining + bypass) * (1 - this.damageReduction);
        this.hp -= actualDamage;
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
        }
    }
    /**
     * 当前受伤倍率：标记 ×（中毒时虚弱）×（眩晕时脆弱）。
     * 虚弱/脆弱挂在已有计时器上，所以会自动随状态消失而结束。
     */
    getDamageTakenMultiplier() {
        let mult = this.markMultiplier;
        if (this.weakBonus > 0 && this.poisonTimer > 0)
            mult *= 1 + this.weakBonus;
        if (this.vulnBonus > 0 && this.stunTimer > 0)
            mult *= 1 + this.vulnBonus;
        return mult;
    }
    /** 虚弱：中毒期间受到的伤害提升（技能 poison_weak） */
    applyWeak(bonus) {
        if (bonus > this.weakBonus)
            this.weakBonus = bonus;
    }
    /** 脆弱：被眩晕期间受到的伤害提升（技能 anes_vuln） */
    applyVuln(bonus) {
        if (bonus > this.vulnBonus)
            this.vulnBonus = bonus;
    }
    getWeakBonus() { return this.weakBonus; }
    getVulnBonus() { return this.vulnBonus; }
    /** 施加护盾腐蚀（熔甲）。取较大值，避免连续命中把腐蚀刷低。 */
    applyShieldCorrosion(ratio) {
        if (ratio > this.shieldCorrosion) {
            this.shieldCorrosion = ratio;
            this.corrosionApplied = false;
        }
    }
    /** 施加护盾（用于 Boss 技能如能量护盾、金币汲取等） */
    applyShield(amount) {
        this.shield += amount;
        if (this.shield > this.maxShield) {
            this.maxShield = this.shield;
        }
    }
    getShieldCorrosion() {
        return this.shieldCorrosion;
    }
    heal(amount) {
        if (!this.alive)
            return;
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }
    applySlow(factor, duration) {
        this.slowFactor = Math.max(0.1, 1.0 - factor);
        this.slowTimer = duration;
    }
    /** 拉扯质量系数：越重的单位越难被引力场拉动 */
    pullMass() {
        if (isBossType(this.type))
            return MAGNETIC_PULL_MASS.boss;
        if (this.isElite())
            return MAGNETIC_PULL_MASS.elite;
        return MAGNETIC_PULL_MASS.normal;
    }
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
    takePullBudget(want) {
        if (want <= 0)
            return 0;
        const allowed = Math.min(want, this.pullBudget);
        this.pullBudget -= allowed;
        return allowed;
    }
    isSlowed() {
        return this.slowTimer > 0;
    }
    applyPoison(damage, duration) {
        this.poisonDamage = damage;
        this.poisonTimer = duration;
        this.poisonTickTimer = 0;
    }
    /** 是否正在中毒（特效层要冒毒泡） */
    isPoisoned() {
        return this.poisonTimer > 0;
    }
    applyBurn(damagePerSecond, duration) {
        this.burnDamage = damagePerSecond;
        this.burnTimer = duration;
        this.burnTickTimer = 0;
    }
    /** 是否正在燃烧（特效层要冒火星） */
    isBurning() {
        return this.burnTimer > 0;
    }
    /** 是否被眩晕（特效层要冒电弧） */
    isStunned() {
        return this.stunTimer > 0;
    }
    /**
     * 当前最显眼的一个状态色（描边 + 半透明内充用）。
     * 优先级：燃烧 > 中毒 > 冻结 > 眩晕 —— 燃烧最扎眼，玩家会先处理火里的怪。
     */
    getStatusTint() {
        if (this.timedSpeedTimer > 0)
            return { color: '#fb7185', glow: true };
        if (this.burnTimer > 0)
            return { color: '#fb923c', glow: true };
        if (this.poisonTimer > 0)
            return { color: '#a3e635', glow: false };
        if (this.slowTimer > 0)
            return { color: '#7dd3fc', glow: false };
        if (this.stunTimer > 0)
            return { color: '#fde047', glow: false };
        return null;
    }
    // ── 受击反馈（纯表现，不影响数值）──
    /**
     * 被命中：记一次白闪 + 按命中方向给一点击退位移。
     * 顿帧/震动由 VfxSystem 管，这里只负责"这只怪自己"的表现。
     */
    applyHitFeedback(angle, power) {
        this.hitFlash = 1; // 1 → 0 衰减，渲染时叠白
        this.hitDir = angle;
        this.knockX += Math.cos(angle) * Math.min(4.5, power * 1.5);
        this.knockY += Math.sin(angle) * Math.min(4.5, power * 1.5);
    }
    /** 每帧更新受击表现（由渲染前的逻辑帧驱动） */
    updateHitFeedback(deltaTime) {
        if (this.hitFlash > 0)
            this.hitFlash = Math.max(0, this.hitFlash - deltaTime * 7);
        // 弹簧回位：越远回得越快，回正后停
        this.knockX *= Math.max(0, 1 - 14 * deltaTime);
        this.knockY *= Math.max(0, 1 - 14 * deltaTime);
        if (Math.abs(this.knockX) < 0.02)
            this.knockX = 0;
        if (Math.abs(this.knockY) < 0.02)
            this.knockY = 0;
    }
    /** 受击位移偏移（渲染用） */
    getRenderOffset() {
        return { x: this.knockX, y: this.knockY };
    }
    /** 受击白闪强度 0~1 */
    getHitFlash() {
        return this.hitFlash;
    }
    /** 受击方向（用于把喷血扇面摆向正确一侧） */
    getHitDirection() {
        return this.hitDir;
    }
    applyMark(multiplier) {
        this.markMultiplier = Math.max(this.markMultiplier, multiplier);
        this.markTimer = 5; // 标记持续5秒
    }
    /** 是否处于标记状态（技能「死亡标记」等要判断） */
    isMarked() {
        return this.markTimer > 0;
    }
    getMarkMultiplier() {
        return this.markMultiplier;
    }
    applyStun(duration) {
        // Boss受到的控制效果大幅衰减（10 种 Boss 都要走这条，不能只判老 BOSS 类型）
        if (isBossType(this.type)) {
            this.stunTimer = Math.max(this.stunTimer, duration * 0.25);
        }
        else {
            this.stunTimer = Math.max(this.stunTimer, duration);
        }
    }
    kill() {
        this.alive = false;
        this.hp = 0;
    }
    isElite() {
        // 用「漏过代价」来定义精英，而不是逐个列举类型 ——
        // 新增敌种时只要它值得被拦（escapeDamage ≥ 2），就自动算精英，
        // 不会再出现"加了新敌人却忘了加进 isElite 列表"的漏改。
        return this.escapeDamage >= 2;
    }
    hasBeenCounted() {
        return this.counted;
    }
    markCounted() {
        this.counted = true;
    }
    getConfig() {
        return ENEMY_CONFIGS[this.type];
    }
    // 分裂小怪专用：设置位置和路径进度
    setPositionAndPathIndex(x, y, pathIndex) {
        this.x = x;
        this.y = y;
        this.pathIndex = pathIndex;
    }
    getPathIndex() {
        return this.pathIndex;
    }
    setPathIndex(index) {
        this.pathIndex = index;
    }
    applyTimedSpeedBoost(multiplier, duration) {
        if (!Number.isFinite(multiplier) || !Number.isFinite(duration) || duration <= 0)
            return;
        this.timedSpeedMultiplier = Math.max(this.timedSpeedMultiplier, Math.max(1, Math.min(1.35, multiplier)));
        this.timedSpeedTimer = Math.max(this.timedSpeedTimer, Math.min(5, duration));
    }
    // 变异系统方法
    applyMutation(mutationType, hpMultiplier, speedMultiplier, special) {
        this.mutation = mutationType;
        this.maxHp *= hpMultiplier;
        this.hp = this.maxHp;
        this.speed *= speedMultiplier;
        this.baseSpeed *= speedMultiplier;
        if (special === 'regen') {
            this.regenRate = this.maxHp * 0.01; // 每秒恢复1%最大生命值
        }
        else if (special === 'resistant') {
            this.damageReduction = 0.3; // 减少30%伤害
        }
    }
    getMutation() {
        return this.mutation;
    }
    getDamageReduction() {
        return this.damageReduction;
    }
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
}
/**
 * 单发伤害低于这个阈值时，对护盾只造成 35% 效果。
 * 这是护盾机兵的核心设计意图：它不是"血更厚"，而是"克制速射流"。
 * 连射防御塔（10 伤害/0.35s）打护盾几乎无效，鹰眼防御塔（60 伤害/2.8s）轻松破盾。
 */
Enemy.SHIELD_BREAK_THRESHOLD = 25;
Enemy.SHIELD_SMALL_HIT_MULT = 0.35;
//# sourceMappingURL=Enemy.js.map