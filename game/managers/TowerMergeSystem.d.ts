/**
 * 防御塔合成系统
 *
 * 只有**完全相同的防御塔**（同类型 + 同等级）才能合成升级。
 * 不同种类的防御塔之间不能组合 —— 合法性判定单点收敛在 Tower.canMergeWith()，
 * 本系统只做"查表 + 落地"，不重复实现规则。
 */
import { TowerType, Rarity } from '../config/GameConfig.js';
import { Tower, GlobalUpgradeState } from '../entities/Tower.js';
export interface MergeResult {
    success: boolean;
    message: string;
    tower?: Tower;
}
export declare class TowerMergeSystem {
    private towers;
    private globalUpgradeState;
    constructor();
    getTowers(): Map<number, Tower>;
    getTowerAt(slotIndex: number): Tower | undefined;
    getTowerCount(): number;
    /**
     * 更新全局升级状态（由 UpgradeSystem 调用）
     */
    setGlobalUpgradeState(state: GlobalUpgradeState): void;
    getGlobalUpgradeState(): GlobalUpgradeState;
    placeTower(type: TowerType, slotIndex: number, rarity?: Rarity): Tower | null;
    placeExistingTower(tower: Tower, slotIndex: number): boolean;
    removeTower(slotIndex: number): Tower | undefined;
    canMergeSame(slot1: number, slot2: number): boolean;
    mergeSame(slot1: number, slot2: number): MergeResult;
    /**
     * 所有合成入口在落位前都必须调用：新塔按当前全局状态重算乘区，
     * 并获得当前累计的合成攻击加成，避免拖拽/自动合成漏继承。
     */
    applyMergeUpgrades(tower: Tower): void;
    /**
     * 把两座防御塔合成升级后的新塔**造出来**（不碰任何塔位账本）。
     *
     * 抽出来的理由是"合成即升级"现在有多条入口：塔位之间拖拽合成、
     * 合成区点击两格合成、以及**买入后合成区里出现同卡时自动升级**。
     * 三条路径必须产出完全一致的结果（等级、品阶、继承技能、乘区不叠加），
     * 所以升级的算法只写在这里一处，调用方只负责把它落到自己的账本上。
     *
     * ── 参数顺序是有语义的，别随便换 ──
     * `a` 必须是**合成后留下来的那座塔**（= 结果所占槽位上的那座，也就是"被升级方"），
     * `b` 是被吃掉的那座（拖过来的 / 新买的那张）。
     * 因为新塔的 `skillVariant` 继承自 `a`（见下），而变体决定每一档自动发哪个技能 ——
     * 参数顺序一换，同一个合成动作在不同入口就会落到不同的 build 线上：
     *   · 塔位拖拽：`combine(existingTower, fromTower)`   结果留在 existingTower 的槽位
     *   · 合成区拖拽：`combine(targetTower, fromTower)`   结果留在 targetTower 的格子
     *   · 合成区格子互合（mergeSame）：`combine(tower1, tower2)` 结果留在 slot1
     *   · 同卡自动升级：`combine(twin, incoming)`         结果留在 twin 的格子
     * 统一规则：**"留在原位的那座塔保留自己的技能线"**，玩家看到的 build 不会莫名跳档。
     *
     * @returns 新塔；不合法（类型/等级不同、或已满级）时返回 null
     */
    static combine(a: Tower, b: Tower): Tower | null;
    getEmptySlotCount(): number;
    getFirstEmptySlot(): number;
    getAllTowers(): Tower[];
    /**
     * 防御塔价值评分：用于关卡搬迁时决定"谁的位子优先保留"。
     * 稀有度的权重远高于等级 —— 一座 SSR Lv1 塔的实战价值通常高于
     * 一座 N Lv3 塔（2.70 倍伤害 vs 1.4^2 = 1.96 倍），
     * 而且 SSR 不可复得，被折价卖掉更可惜。
     */
    static towerValue(t: Tower): number;
    /**
     * 关卡搬迁：把当前所有防御塔从场上取下，返回按价值降序排列的列表。
     * 调用方负责把它们重新安置到新地图的塔位上（放不下的自行处理）。
     */
    collectAllForRelocation(): Tower[];
    /**
     * 把防御塔强制放到指定塔位（跳过占用检查）。
     * 用于关卡搬迁 —— 此时占位状态刚刚被清空，一定是安全的。
     */
    forcePlace(tower: Tower, slotIndex: number): boolean;
    reset(): void;
}
