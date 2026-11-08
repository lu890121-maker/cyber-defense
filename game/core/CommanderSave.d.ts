/**
 * 指挥官存档 v2 —— 纯函数模块（只依赖 localStorage 与配置/实体，便于单测）
 *
 * ── 存档语义（落地由 GameManager 负责，这里只管序列化 / 反序列化）──
 * 存档 = 「当前关卡开始时的指挥官状态」+ 已解锁进度。
 * 关卡内赚的钱、买的塔、掉的血只在内存，**不写盘**：
 *   · 进关写一次盘 = checkpoint；
 *   · 过关把「过关后的资产」写盘（作为下一关 checkpoint），并解锁下一关；
 *   · 闯关失败不写盘 → 重开从存档重建 = 自然回到闯关前状态；
 *   · 玩家中途刷新页面也回到闯关前状态（刻意设计，防刷钱）。
 *
 * ── 为什么塔要「快照 + 重建」而不是存实例 ──
 * damage / range / attackInterval / skillMods 都是可叠加的运行时状态，
 * 直接 JSON 化再赋值会让乘区被二次乘（applySkillMod 是叠加式）。
 * 塔的基础数值由 type + level + rarity 确定性重算；技能只记 id，
 * 重建时用 reapplyLearnedSkills 按 id 重放一次效果 —— 少了这一步，
 * 技能会「面板上有、实战静默失效」。
 */
import { Tower, GlobalUpgradeState } from '../entities/Tower.js';
export interface TowerSnapshot {
    /** TowerType 的字符串值 */
    type: string;
    level: number;
    /** Rarity 的字符串值 */
    rarity: string;
    /** >=0 为战场塔位；<0 为合成区第 (-slotIndex-1) 格 */
    slotIndex: number;
    x: number;
    y: number;
    skillVariant: number;
    /** 只存技能 id，不存 skillMods */
    learnedSkills: string[];
}
export interface CommanderSave {
    version: 2;
    /** 0-based，已解锁到的最大关卡；初始 0 */
    maxUnlockedLevel: number;
    currentLevelIndex: number;
    gold: number;
    lives: number;
    towers: TowerSnapshot[];
    globalUpgradeState: GlobalUpgradeState;
    timestamp: number;
}
export declare const SAVE_KEY = "cyber-defense.save";
/** 深拷贝两份「按塔型」倍率表，避免存档对象与运行时 state 共享引用 */
export declare function cloneGlobalState(gs: GlobalUpgradeState): GlobalUpgradeState;
/** 构造一份「全新指挥官」默认档（无存档时用它开局） */
export declare function createDefaultCommanderSave(): CommanderSave;
/**
 * 读档：try/catch + 逐字段校验。
 * 兼容旧档（没有 version===2）：maxUnlockedLevel = clamp(currentLevelIndex,0,8)、
 * towers=[]、globalUpgradeState=DEFAULT_GLOBAL_STATE，其余字段保留旧值。
 */
export declare function readCommanderSave(): CommanderSave | null;
export declare function writeCommanderSave(d: CommanderSave): void;
export declare function clearCommanderSave(): void;
/** 用 getter 取塔的「可重建」字段；getLearnedSkills() 再 slice 一次拿副本 */
export declare function snapshotTower(t: Tower): TowerSnapshot;
/**
 * 重建一座塔。顺序错会静默失效：
 *   1. new Tower(...) —— 构造内已按序做 applyRarityGrowth → applyLevelGrowth，
 *      并自动分配 skillVariant（towerSerial 轮换），basetype 自带技能也已就位
 *   2. setSkillVariant —— 覆盖构造里自动轮换的变体
 *   3. learnSkill(id) —— 只记 id，不落效果
 *   4. reapplyLearnedSkills —— 按 id 反查 effect 重放（关键！）
 *   5. applyGlobalUpgradeState —— 绝对值设置，幂等
 *   6. 补 mergeBonusDamage / fusionBonusChance（applyGlobalUpgradeState 不管这两项）
 * 不在这里注入 vfx：由 GameManager 的 injectVfxSink() 统一处理。
 * 非法快照返回 null（由调用方跳过），保证坏档不会让整个进关流程崩溃。
 */
export declare function rebuildTower(d: TowerSnapshot, gs: GlobalUpgradeState): Tower | null;
