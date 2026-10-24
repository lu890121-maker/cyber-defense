/**
 * 波次管理器
 * 管理敌人生成、波次推进、波次结算
 *
 * 关卡设计相关职责：
 *   · buildSpawnQueue —— 把一波的敌人「混编」成一条生成序列（而不是分块）
 *   · getWavePreview  —— 给 UI 提供下一波的构成/词缀/新敌人预告
 */
import { EnemyType, WAVE_CONFIGS, MUTATION_TYPES, getWaveHpMultiplier, getGlobalWave, getLevelHpFactor, ACTIVE_LEVEL_INDEX, LEVELS, ENEMY_CONFIGS, PATH_ROUTES, PATH_WARP_SEGMENTS, isBossType } from '../config/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
/** 支援单位前置比例：治疗者移动慢，先上路才能和治疗对象汇合 */
const SUPPORT_LEAD_RATIO = 0.7;
export class WaveManager {
    constructor() {
        this.currentWave = 0;
        this.waveState = 'waiting';
        this.enemies = [];
        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.totalEnemiesInWave = 0;
        this.killedEnemies = 0;
        this.escapedEnemies = 0;
        this.totalKilledAllWaves = 0;
        // 待生成的分裂怪计数（防止波次提前结束）
        this.pendingSplitCount = 0;
        /** 超时结束的波次允许残敌继续跨波，但残敌分裂不能撤销强制推进。 */
        this.waveForcedToEnd = false;
        // 当前波次的词缀类型（来自 WaveConfig.modifier，不再是随机抽取）
        this.currentMutation = '';
    }
    getCurrentWave() {
        return this.currentWave;
    }
    getWaveState() {
        return this.waveState;
    }
    getEnemies() {
        return this.enemies;
    }
    getAliveEnemies() {
        return this.enemies.filter(e => e.isAlive());
    }
    /** 动态添加敌人（用于精英怪分裂等场景） */
    addEnemy(enemy) {
        this.enemies.push(enemy);
    }
    getKilledCount() {
        return this.killedEnemies;
    }
    getTotalKilled() {
        return this.totalKilledAllWaves;
    }
    getRemainingCount() {
        return Math.max(0, this.totalEnemiesInWave - this.killedEnemies - this.escapedEnemies);
    }
    /** 当前波次的词缀类型（'' 表示无） */
    getCurrentMutation() {
        return this.currentMutation;
    }
    /** 总波数（当前关卡） */
    getTotalWaves() {
        return WAVE_CONFIGS.length;
    }
    /** 是否已到本关最后一波 */
    isFinalWave() {
        return this.currentWave >= WAVE_CONFIGS.length;
    }
    /**
     * 生成第 wave 波的预告数据。wave 从 1 开始。
     * 「新敌人」的判定是静态的：只要该类型没有出现在**更早的任何波次**里，
     * 就算首次登场 —— 这样预告面板与实际体验一致，且可复现。
     *
     * 注意「更早」要跨越关卡：第 2 关第 1 波里出现的纳米虫群在第 1 关就见过，
     * 如果只在本关内查找，会把一堆老面孔全标成"新敌人"，预告就失去意义了。
     */
    static getWavePreview(wave) {
        const cfg = WAVE_CONFIGS[wave - 1];
        if (!cfg)
            return null;
        // 收集更早波次出现过的类型（含之前所有关卡）
        const seen = new Set();
        for (let li = 0; li < ACTIVE_LEVEL_INDEX; li++) {
            for (const w of LEVELS[li].waves) {
                for (const g of w.enemies)
                    seen.add(g.type);
            }
        }
        for (let i = 0; i < wave - 1; i++) {
            for (const g of WAVE_CONFIGS[i].enemies)
                seen.add(g.type);
        }
        const composition = cfg.enemies
            .map(g => ({
            type: g.type,
            name: ENEMY_CONFIGS[g.type].name,
            color: ENEMY_CONFIGS[g.type].color,
            count: g.count,
            isNew: !seen.has(g.type)
        }))
            .sort((a, b) => b.count - a.count);
        const mutation = cfg.modifier
            ? MUTATION_TYPES.find(m => m.type === cfg.modifier)
            : undefined;
        return {
            wave: cfg.wave,
            name: cfg.name,
            archetype: cfg.archetype,
            modifier: mutation
                ? {
                    type: mutation.type,
                    name: mutation.name,
                    icon: mutation.icon,
                    description: mutation.description
                }
                : undefined,
            composition,
            totalCount: cfg.enemies.reduce((s, g) => s + g.count, 0),
            isBoss: cfg.archetype === 'boss',
            bossSkill: cfg.bossSkill
        };
    }
    startNextWave() {
        if (this.currentWave >= WAVE_CONFIGS.length) {
            // 本关打完了 —— 交给 GameManager 决定是进下一关还是真通关
            this.waveState = 'level_cleared';
            return;
        }
        this.currentWave++;
        const waveConfig = WAVE_CONFIGS[this.currentWave - 1];
        this.currentBossSkill = waveConfig.bossSkill;
        // 词缀由配置决定（可预测），不再随机抽取
        this.currentMutation = waveConfig.modifier || '';
        this.buildSpawnQueue(waveConfig);
        this.totalEnemiesInWave = this.spawnQueue.length;
        this.killedEnemies = 0;
        this.escapedEnemies = 0;
        this.spawnTimer = 0;
        this.pendingSplitCount = 0;
        this.waveForcedToEnd = false;
        this.waveState = 'spawning';
    }
    /**
     * 把一波的敌人编成生成序列。
     *
     * 旧实现是按组顺序压入队列（for group { for i<count }），结果是同一波内
     * 敌人「分块」出现。最典型的问题：
     *   第7波「12 快速 + 3 治疗」→ 12 个快速全部走完之后治疗者才出现，
     *   治疗者追不上也奶不到前排，整个"治疗"机制形同虚设。
     *   第9波更极端：普通→快速→重甲→分裂→治疗，5 个独立的"波中波"，
     *   玩家面对的是一串小潮而不是真正的混编压力。
     *
     * 新实现用「平滑加权轮询」（smooth weighted round-robin / deficit
     * round-robin）：每种类型维护一个欠账累加器，每步给所有类型加上自己的
     * 占比，然后选出欠账最多的类型。这样每种类型的实际间隔会均匀铺满整波，
     * 比例严格正确，而且序列看起来是自然交错的。
     *
     * ── 生成节奏：整波窗口，而不是逐组 delay（v1.6）──
     * 轮询只决定**顺序**，节奏统一由 `WaveConfig.spawnWindow` 决定：
     * 所有敌人均匀铺满这段时间（`interval = spawnWindow / total`）。
     * 逐组 delay 的老做法下，生成总时长 = Σ(count × delay)，数量一翻倍时长就翻倍 ——
     * 与「20 秒强制推进」直接冲突（敌人还没出完波次就结束了）。
     */
    buildSpawnQueue(waveConfig) {
        const groups = waveConfig.enemies.filter(g => g.count > 0);
        const total = groups.reduce((s, g) => s + g.count, 0);
        this.spawnQueue = [];
        if (total === 0 || groups.length === 0)
            return;
        const rate = groups.map(g => g.count / total);
        const left = groups.map(g => g.count);
        const acc = groups.map(() => 0);
        const order = [];
        for (let i = 0; i < total; i++) {
            for (let k = 0; k < groups.length; k++)
                acc[k] += rate[k];
            let best = -1;
            for (let k = 0; k < groups.length; k++) {
                if (left[k] <= 0)
                    continue;
                if (best === -1 || acc[k] > acc[best])
                    best = k;
            }
            if (best === -1)
                break;
            acc[best] -= 1;
            left[best]--;
            order.push(groups[best].type);
        }
        // 支援单位前置：治疗者速度慢（32），如果和治疗对象同时出发会一直掉队。
        // 把一部分治疗者排到队首，让它们先上路，前排追上来的时间正好和它们汇合。
        const leadTypes = new Set([EnemyType.HEALER]);
        const leadQuota = new Map();
        for (const g of groups) {
            if (leadTypes.has(g.type)) {
                leadQuota.set(g.type, Math.ceil(g.count * SUPPORT_LEAD_RATIO));
            }
        }
        let finalOrder = order;
        if (leadQuota.size > 0) {
            const lead = [];
            const rest = [];
            const taken = new Map();
            for (const t of order) {
                const quota = leadQuota.get(t) || 0;
                const used = taken.get(t) || 0;
                if (used < quota) {
                    lead.push(t);
                    taken.set(t, used + 1);
                }
                else {
                    rest.push(t);
                }
            }
            finalOrder = lead.concat(rest);
        }
        // 均匀铺满生成窗口（下限 0.02s 防止除零 / 瞬间喷完）
        const interval = Math.max(0.02, waveConfig.spawnWindow / finalOrder.length);
        // 路线随机模式使用可复现的伪随机洗牌，并循环均匀分配，避免随机规则无法复测或一整波偏向单一路线。
        let seed = ((ACTIVE_LEVEL_INDEX + 1) * 0x45d9f3b) ^ (this.currentWave * 0x119de1f3);
        const random = () => { seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b); seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b); seed ^= seed >>> 16; return (seed >>> 0) / 4294967296; };
        const routeOrder = PATH_ROUTES.map((_, i) => i);
        for (let i = routeOrder.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [routeOrder[i], routeOrder[j]] = [routeOrder[j], routeOrder[i]];
        }
        this.spawnQueue = finalOrder.map((type, index) => {
            let routeIndex = 0;
            if (PATH_ROUTES.length > 1 && waveConfig.routeMode === 'random')
                routeIndex = routeOrder[index % routeOrder.length];
            else if (PATH_ROUTES.length > 1 && waveConfig.routeMode === 'balanced')
                routeIndex = index % PATH_ROUTES.length;
            // 每波安排三次可读的突入：一架空降单位与两只地面侧切单位；固定序号便于复现。
            const arrival = index > 0 && index % 10 === 7 ? (Math.floor(index / 10) % 2 === 0 ? 'air' : 'ground') : undefined;
            return { type, delay: interval, routeIndex, arrival };
        });
    }
    /**
     * 通知波次管理器有分裂怪即将生成
     * 在分裂怪实际生成前调用，防止波次提前结束
     */
    addPendingSplit(count) {
        if (count <= 0)
            return;
        // update() 会先结算敌人死亡并判定波次是否清空，GameManager 随后才处理
        // 分裂并把子怪放进 enemies。若父怪是本帧最后一只，清空状态已被设定；
        // 在自然清空时撤回该状态，确保子怪真的被打完后才进入结算/下一波。
        // 超时强制结束的波次例外：残敌与其分裂怪仍可继续战斗，但不阻断推进。
        if (!this.waveForcedToEnd &&
            (this.waveState === 'cleared' || this.waveState === 'level_cleared')) {
            this.waveState = 'fighting';
        }
        this.pendingSplitCount += count;
        this.totalEnemiesInWave += count;
    }
    /**
     * 分裂怪实际生成后调用
     */
    confirmSplitSpawned(count) {
        this.pendingSplitCount = Math.max(0, this.pendingSplitCount - count);
    }
    update(deltaTime) {
        const result = { newEnemies: [], escaped: 0, killed: [] };
        if (this.waveState === 'spawning') {
            this.spawnTimer += deltaTime;
            while (this.spawnQueue.length > 0) {
                const next = this.spawnQueue[0];
                if (this.spawnTimer >= next.delay) {
                    this.spawnTimer -= next.delay;
                    // 属性倍率用「全局波号」（关卡序号 × 每关波数 + 关内波号），
                    // 这样三关的难度是连续爬升的一条曲线，而不是每关重置一次。
                    const waveMultiplier = getWaveHpMultiplier(getGlobalWave(ACTIVE_LEVEL_INDEX, this.currentWave)) * getLevelHpFactor(ACTIVE_LEVEL_INDEX);
                    const route = PATH_ROUTES[next.routeIndex] ?? PATH_ROUTES[0];
                    let spawnPath = route;
                    if (next.arrival && route.length >= 2) {
                        const first = route[0], second = route[1];
                        if (next.arrival === 'air') {
                            spawnPath = [{ x: first.x, y: Math.max(24, first.y - 58) }, ...route];
                        }
                        else {
                            const dx = second.x - first.x, dy = second.y - first.y;
                            const length = Math.max(1, Math.hypot(dx, dy));
                            spawnPath = [{ x: first.x + dy / length * 34, y: first.y - dx / length * 34 }, ...route];
                        }
                    }
                    const enemy = new Enemy(next.type, waveMultiplier, spawnPath, isBossType(next.type) ? this.currentBossSkill : undefined, ACTIVE_LEVEL_INDEX, 
                    // 传送门段号跟着路线一起下发：spawnPath 可能被空降/侧切
                    // 前置了一个点（数组整体后移一位），所以段号也要 +1。
                    PATH_WARP_SEGMENTS[next.routeIndex]?.map(i => i + (spawnPath === route ? 0 : 1)) ?? []);
                    // 应用词缀
                    if (this.currentMutation) {
                        const mutation = MUTATION_TYPES.find(m => m.type === this.currentMutation);
                        if (mutation) {
                            enemy.applyMutation(mutation.type, mutation.hpMultiplier, mutation.speedMultiplier, mutation.special);
                        }
                    }
                    this.enemies.push(enemy);
                    result.newEnemies.push(enemy);
                    this.spawnQueue.shift();
                }
                else {
                    break;
                }
            }
            if (this.spawnQueue.length === 0) {
                this.waveState = 'fighting';
            }
        }
        // 更新所有敌人
        for (const enemy of this.enemies) {
            if (!enemy.isAlive())
                continue;
            enemy.update(deltaTime, this.enemies);
            if (enemy.hasReachedEnd() && !enemy.hasBeenCounted()) {
                enemy.markCounted();
                this.escapedEnemies++;
                // 逃脱扣血按敌人类型加权（Boss 5 点 / 精英 2 点 / 杂兵 1 点）
                result.escaped += enemy.getEscapeDamage();
            }
        }
        // 检查被击杀的敌人
        for (const enemy of this.enemies) {
            if (!enemy.isAlive() && !enemy.hasReachedEnd() && !enemy.hasBeenCounted()) {
                enemy.markCounted();
                this.killedEnemies++;
                this.totalKilledAllWaves++;
                result.killed.push(enemy);
            }
        }
        // 清理已处理的敌人
        this.enemies = this.enemies.filter(e => e.isAlive());
        // 检查波次是否结束
        // 必须等待：1) 生成队列清空 2) 所有敌人死亡或逃脱 3) 没有待生成的分裂怪
        if ((this.waveState === 'fighting' || this.waveState === 'spawning') &&
            this.spawnQueue.length === 0 &&
            this.getAliveEnemies().length === 0 &&
            this.pendingSplitCount === 0) {
            if (this.currentWave >= WAVE_CONFIGS.length) {
                // 本关最后一波清空 → 关卡通关（是否真·通关由 GameManager 判断）
                this.waveState = 'level_cleared';
            }
            else {
                this.waveState = 'cleared';
            }
        }
        return result;
    }
    enterUpgradePhase() {
        this.waveState = 'upgrade_select';
    }
    /**
     * 波次是否正在进行中（还在涌出或还在打）。
     * 用于「强制推进计时器」判断该不该累计 —— upgrade_select / waiting / cleared
     * 期间不该计时，否则玩家在强化面板里发呆也会把下一波的时间烧掉。
     */
    isWaveActive() {
        return this.waveState === 'spawning' || this.waveState === 'fighting';
    }
    /**
     * 波次超时 —— 无论清没清完，立刻结束本波（用户诉求：「不能卡怪卡时间一直清理」）。
     *
     * 处理方式（两条都很关键）：
     *   · **还没出场的敌人直接丢弃**：否则下一波开始时场上会瞬间堆两波怪，
     *     而且"数量翻倍"的观感是假的（怪根本没出完）。
     *   · **已经在场上的敌人保留**：继续走、继续能被击杀拿钱、走到核心照样扣血。
     *     玩家因此仍有清场动力，"漏怪"也仍然有代价，只是**不能再靠它拖延时间**。
     *
     * 顺带把 `totalEnemiesInWave` 修正为"实际出场过的数量"，否则 HUD 的
     * 「剩余 N」会把被丢弃的怪也算进去，显示成一个永远掉不到 0 的数字。
     *
     * @returns 是否真的结束了本波（不在进行中时返回 false）
     */
    forceEndWave() {
        if (!this.isWaveActive())
            return false;
        this.waveForcedToEnd = true;
        // 丢弃尚未出场的敌人，并修正本波总数 = 已结算 + 场上存活
        this.spawnQueue = [];
        this.pendingSplitCount = 0;
        this.totalEnemiesInWave = this.killedEnemies + this.escapedEnemies + this.getAliveEnemies().length;
        // 最后一波超时也要走「关卡清空」分支，交给 GameManager 决定进下一关还是通关
        this.waveState = this.currentWave >= WAVE_CONFIGS.length ? 'level_cleared' : 'cleared';
        return true;
    }
    exitUpgradePhase() {
        // 升级选择完成后，状态变为 waiting，等待玩家点击"下一波"
        // 不能设为 cleared，否则 GameManager 会再次检测到 isWaveCleared() 重复弹出升级界面
        this.waveState = 'waiting';
    }
    enterGameOver() {
        this.waveState = 'game_over';
    }
    isWaveCleared() {
        return this.waveState === 'cleared';
    }
    /** 本关最后一波已清空（需要 GameManager 处理关卡切换） */
    isLevelCleared() {
        return this.waveState === 'level_cleared';
    }
    /** 明确进入通关状态（第 3 关打完时由 GameManager 调用） */
    enterVictory() {
        this.waveState = 'victory';
    }
    isGameOver() {
        return this.waveState === 'game_over';
    }
    isVictory() {
        return this.waveState === 'victory';
    }
    reset() {
        this.currentWave = 0;
        this.waveState = 'waiting';
        this.enemies = [];
        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.totalEnemiesInWave = 0;
        this.killedEnemies = 0;
        this.escapedEnemies = 0;
        this.totalKilledAllWaves = 0;
        this.pendingSplitCount = 0;
        this.waveForcedToEnd = false;
        this.currentMutation = '';
    }
}
//# sourceMappingURL=WaveManager.js.map