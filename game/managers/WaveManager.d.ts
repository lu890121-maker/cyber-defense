/**
 * 波次管理器
 * 管理敌人生成、波次推进、波次结算
 *
 * 关卡设计相关职责：
 *   · buildSpawnQueue —— 把一波的敌人「混编」成一条生成序列（而不是分块）
 *   · getWavePreview  —— 给 UI 提供下一波的构成/词缀/新敌人预告
 */
import { EnemyType } from '../config/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
export type WaveState = 'waiting' | 'spawning' | 'fighting' | 'cleared'
/** 本关最后一波清空 —— 不是通关，是"该进下一关了" */
 | 'level_cleared' | 'upgrade_select' | 'game_over' | 'victory';
/** 波次预告数据（供 UI 渲染「下一波」面板） */
export interface WavePreview {
    wave: number;
    name: string;
    archetype: string;
    /** 本波词缀（无则为 undefined） */
    modifier?: {
        type: string;
        name: string;
        icon: string;
        description: string;
    };
    /** 敌人构成，按数量降序 */
    composition: Array<{
        type: EnemyType;
        name: string;
        color: string;
        count: number;
        /** 该类型是否为本波首次登场 */
        isNew: boolean;
    }>;
    totalCount: number;
    isBoss: boolean;
    bossSkill?: string;
}
export declare class WaveManager {
    private currentWave;
    private waveState;
    private enemies;
    private spawnQueue;
    private spawnTimer;
    private totalEnemiesInWave;
    private killedEnemies;
    private escapedEnemies;
    private totalKilledAllWaves;
    private pendingSplitCount;
    /** 超时结束的波次允许残敌继续跨波，但残敌分裂不能撤销强制推进。 */
    private waveForcedToEnd;
    private currentMutation;
    private currentBossSkill?;
    getCurrentWave(): number;
    getWaveState(): WaveState;
    getEnemies(): Enemy[];
    getAliveEnemies(): Enemy[];
    getKilledCount(): number;
    getTotalKilled(): number;
    getRemainingCount(): number;
    /** 当前波次的词缀类型（'' 表示无） */
    getCurrentMutation(): string;
    /** 总波数（当前关卡） */
    getTotalWaves(): number;
    /** 是否已到本关最后一波 */
    isFinalWave(): boolean;
    /**
     * 生成第 wave 波的预告数据。wave 从 1 开始。
     * 「新敌人」的判定是静态的：只要该类型没有出现在**更早的任何波次**里，
     * 就算首次登场 —— 这样预告面板与实际体验一致，且可复现。
     *
     * 注意「更早」要跨越关卡：第 2 关第 1 波里出现的纳米虫群在第 1 关就见过，
     * 如果只在本关内查找，会把一堆老面孔全标成"新敌人"，预告就失去意义了。
     */
    static getWavePreview(wave: number): WavePreview | null;
    startNextWave(): void;
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
    private buildSpawnQueue;
    /**
     * 通知波次管理器有分裂怪即将生成
     * 在分裂怪实际生成前调用，防止波次提前结束
     */
    addPendingSplit(count: number): void;
    /**
     * 分裂怪实际生成后调用
     */
    confirmSplitSpawned(count: number): void;
    update(deltaTime: number): {
        newEnemies: Enemy[];
        escaped: number;
        killed: Enemy[];
    };
    enterUpgradePhase(): void;
    /**
     * 波次是否正在进行中（还在涌出或还在打）。
     * 用于「强制推进计时器」判断该不该累计 —— upgrade_select / waiting / cleared
     * 期间不该计时，否则玩家在强化面板里发呆也会把下一波的时间烧掉。
     */
    isWaveActive(): boolean;
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
    forceEndWave(): boolean;
    exitUpgradePhase(): void;
    enterGameOver(): void;
    isWaveCleared(): boolean;
    /** 本关最后一波已清空（需要 GameManager 处理关卡切换） */
    isLevelCleared(): boolean;
    /** 明确进入通关状态（第 3 关打完时由 GameManager 调用） */
    enterVictory(): void;
    isGameOver(): boolean;
    isVictory(): boolean;
    reset(): void;
}
