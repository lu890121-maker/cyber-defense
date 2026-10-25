/**
 * 防御塔合成系统
 *
 * 只有**完全相同的防御塔**（同类型 + 同等级）才能合成升级。
 * 不同种类的防御塔之间不能组合 —— 合法性判定单点收敛在 Tower.canMergeWith()，
 * 本系统只做"查表 + 落地"，不重复实现规则。
 */
import { TOWER_CONFIGS, TOWER_SLOTS, Rarity, averageRarity, rarityIndex, toRoman } from '../config/GameConfig.js';
import { Tower } from '../entities/Tower.js';
import { reapplyLearnedSkills } from '../core/SkillEffects.js';
export class TowerMergeSystem {
    constructor() {
        this.towers = new Map(); // slotIndex -> Tower
        this.globalUpgradeState = {
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
    }
    getTowers() {
        return this.towers;
    }
    getTowerAt(slotIndex) {
        return this.towers.get(slotIndex);
    }
    getTowerCount() {
        return this.towers.size;
    }
    /**
     * 更新全局升级状态（由 UpgradeSystem 调用）
     */
    setGlobalUpgradeState(state) {
        this.globalUpgradeState = state;
    }
    getGlobalUpgradeState() {
        return this.globalUpgradeState;
    }
    // 放置新防御塔
    placeTower(type, slotIndex, rarity = Rarity.N) {
        if (this.towers.has(slotIndex)) {
            return null;
        }
        const slot = TOWER_SLOTS[slotIndex];
        if (!slot)
            return null;
        const tower = new Tower(type, slot.x, slot.y, slotIndex, 1, rarity);
        // 应用当前全局升级状态
        tower.applyGlobalUpgradeState(this.globalUpgradeState);
        this.towers.set(slotIndex, tower);
        slot.occupied = true;
        return tower;
    }
    // 放置已存在的防御塔（用于拖拽移动）
    placeExistingTower(tower, slotIndex) {
        if (this.towers.has(slotIndex)) {
            return false;
        }
        const slot = TOWER_SLOTS[slotIndex];
        if (!slot)
            return false;
        // 更新防御塔位置
        tower.setPosition(slot.x, slot.y);
        tower.setSlotIndex(slotIndex);
        // 塔可能在合成区时错过了之后获得的全局强化；每次回到战场时按当前状态重算。
        tower.applyGlobalUpgradeState(this.globalUpgradeState);
        this.towers.set(slotIndex, tower);
        slot.occupied = true;
        return true;
    }
    // 移除防御塔
    removeTower(slotIndex) {
        const tower = this.towers.get(slotIndex);
        if (tower) {
            this.towers.delete(slotIndex);
            TOWER_SLOTS[slotIndex].occupied = false;
        }
        return tower;
    }
    // 按实例移除防御塔（Boss「毁灭射线」等场景只有 Tower 引用、没有槽位号）
    removeTowerByInstance(tower) {
        for (const [slotIndex, t] of this.towers.entries()) {
            if (t === tower) {
                return this.removeTower(slotIndex);
            }
        }
        return undefined;
    }
    // 检查同类合成
    canMergeSame(slot1, slot2) {
        const tower1 = this.towers.get(slot1);
        const tower2 = this.towers.get(slot2);
        if (!tower1 || !tower2)
            return false;
        if (slot1 === slot2)
            return false;
        // 同一座塔的两个槽位引用也算自己和自己
        if (tower1 === tower2)
            return false;
        return tower1.canMergeWith(tower2);
    }
    // 执行同类合成
    mergeSame(slot1, slot2) {
        const tower1 = this.towers.get(slot1);
        const tower2 = this.towers.get(slot2);
        if (!tower1 || !tower2) {
            return { success: false, message: '防御塔不存在' };
        }
        // 兜底：Tower.canMergeWith(self) 恒为 true（类型/等级当然等于自己），
        // 所以这里必须显式拦掉"自己和自己的引用"。少了这一句，
        // 任何让同一座塔登记到两个槽位的 bug 都会变成无限升级。
        if (tower1 === tower2) {
            return { success: false, message: '同一座防御塔不能和自己合成' };
        }
        if (!tower1.canMergeWith(tower2)) {
            return { success: false, message: '无法合成：类型或等级不同' };
        }
        // 合成：保留slot1位置，移除slot2
        const slot = TOWER_SLOTS[slot1];
        this.towers.delete(slot1);
        this.towers.delete(slot2);
        TOWER_SLOTS[slot2].occupied = false;
        const newTower = TowerMergeSystem.combine(tower1, tower2);
        newTower.setPosition(slot.x, slot.y);
        newTower.setSlotIndex(slot1);
        // 应用当前全局升级状态（包括合成加成）
        this.applyMergeUpgrades(newTower);
        this.towers.set(slot1, newTower);
        return { success: true, message: `合成成功！${TOWER_CONFIGS[tower1.getType()].name} Lv.${toRoman(newTower.getLevel())}`, tower: newTower };
    }
    /**
     * 所有合成入口在落位前都必须调用：新塔按当前全局状态重算乘区，
     * 并获得当前累计的合成攻击加成，避免拖拽/自动合成漏继承。
     */
    applyMergeUpgrades(tower) {
        tower.applyGlobalUpgradeState(this.globalUpgradeState);
        if (this.globalUpgradeState.mergeBonusDamage > 0) {
            tower.addMergeBonus(this.globalUpgradeState.mergeBonusDamage);
        }
    }
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
    static combine(a, b) {
        if (!a.canMergeWith(b))
            return null;
        const newLevel = a.getLevel() + 1;
        // 稀有度取两者平均值（四舍五入）
        const newRarity = averageRarity(a.getRarity(), b.getRarity());
        const tower = new Tower(a.getType(), a.getX(), a.getY(), a.getSlotIndex(), newLevel, newRarity);
        // 技能变体跟着**被升级的那座塔**（a）走，而不是让新塔重新轮换 ——
        // 否则"合成一次就换一条 build 线"，玩家刚看到的技能组合会莫名跳掉。
        tower.setSkillVariant(a.getSkillVariant());
        // 归属同理跟着 a（结果所占槽位的塔）走：合成是"谁的塔被升级了"，
        // 双人模式下贡献统计才不会因为一次合成就把战功记到另一个人头上。
        tower.setOwner(a.getOwner());
        // 继承两侧学过的技能，但只保留 newLevel - 2 个 ——
        // 「技能数 = 等级 - 1」，最后一个名额留给升级时**自动发放**的本档技能
        // （由 GameManager.autoGrantSkill 按变体取）。
        tower.inheritSkills([a, b], Math.max(0, newLevel - 2));
        reapplyLearnedSkills(tower, tower.getLearnedSkills());
        return tower;
    }
    // 获取空闲格子数
    getEmptySlotCount() {
        return TOWER_SLOTS.filter(s => !s.occupied).length;
    }
    // 获取第一个空闲格子
    getFirstEmptySlot() {
        return TOWER_SLOTS.findIndex(s => !s.occupied);
    }
    // 获取所有防御塔列表
    getAllTowers() {
        return Array.from(this.towers.values());
    }
    /**
     * 防御塔价值评分：用于关卡搬迁时决定"谁的位子优先保留"。
     * 稀有度的权重远高于等级 —— 一座 SSR Lv1 塔的实战价值通常高于
     * 一座 N Lv3 塔（2.70 倍伤害 vs 1.4^2 = 1.96 倍），
     * 而且 SSR 不可复得，被折价卖掉更可惜。
     */
    static towerValue(t) {
        const config = TOWER_CONFIGS[t.getType()];
        return rarityIndex(t.getRarity()) * 1000 + t.getLevel() * 100 + config.cost;
    }
    /**
     * 关卡搬迁：把当前所有防御塔从场上取下，返回按价值降序排列的列表。
     * 调用方负责把它们重新安置到新地图的塔位上（放不下的自行处理）。
     */
    collectAllForRelocation() {
        const list = Array.from(this.towers.values());
        this.towers.clear();
        for (const slot of TOWER_SLOTS)
            slot.occupied = false;
        list.sort((a, b) => TowerMergeSystem.towerValue(b) - TowerMergeSystem.towerValue(a));
        return list;
    }
    /**
     * 把防御塔强制放到指定塔位（跳过占用检查）。
     * 用于关卡搬迁 —— 此时占位状态刚刚被清空，一定是安全的。
     */
    forcePlace(tower, slotIndex) {
        const slot = TOWER_SLOTS[slotIndex];
        if (!slot)
            return false;
        tower.setPosition(slot.x, slot.y);
        tower.setSlotIndex(slotIndex);
        tower.applyGlobalUpgradeState(this.globalUpgradeState);
        this.towers.set(slotIndex, tower);
        slot.occupied = true;
        return true;
    }
    reset() {
        this.towers.clear();
        for (const slot of TOWER_SLOTS) {
            slot.occupied = false;
        }
        // 重置全局升级状态
        this.globalUpgradeState = {
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
    }
}
//# sourceMappingURL=TowerMergeSystem.js.map