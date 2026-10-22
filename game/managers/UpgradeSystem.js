/**
 * 强化系统
 * 管理随机强化选择和应用
 */
import { UpgradeType, UPGRADE_CONFIGS } from '../config/GameConfig.js';
export class UpgradeSystem {
    constructor(towerMergeSystem, resourceManager) {
        this.acquiredUpgrades = new Map(); // type -> count
        this.towerMergeSystem = towerMergeSystem;
        this.resourceManager = resourceManager;
    }
    getAcquiredUpgrades() {
        return this.acquiredUpgrades;
    }
    // 生成3个随机强化选项
    generateOptions(unlockedTypes) {
        const available = this.getAvailableTypes(unlockedTypes);
        // Fisher–Yates 均匀洗牌。用 sort(() => Math.random() - 0.5) 会违反
        // sort 比较器的传递性，导致候选强化的出现概率偏斜且依赖引擎实现。
        const shuffled = [...available];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const selected = shuffled.slice(0, Math.min(3, shuffled.length));
        return selected.map(type => this.toOption(type));
    }
    /** 从当前可用强化中随机抽一项，并排除本轮已展示的选项。 */
    generateRandomOption(unlockedTypes, excludedTypes) {
        const excluded = new Set(excludedTypes);
        const available = this.getAvailableTypes(unlockedTypes).filter(type => !excluded.has(type));
        if (available.length === 0)
            return null;
        const type = available[Math.floor(Math.random() * available.length)];
        return this.toOption(type);
    }
    getAvailableTypes(unlockedTypes) {
        return Object.values(UpgradeType).filter(type => {
            const config = UPGRADE_CONFIGS[type];
            const count = this.acquiredUpgrades.get(type) || 0;
            const targetUnlocked = !config.targetTypes || !unlockedTypes ||
                config.targetTypes.some(target => unlockedTypes.includes(target));
            return count < config.maxStack && targetUnlocked;
        });
    }
    toOption(type) {
        const config = UPGRADE_CONFIGS[type];
        return {
            type,
            name: config.name,
            icon: config.icon,
            description: config.description,
            targetLabel: config.targetLabel
        };
    }
    // 应用强化
    applyUpgrade(type) {
        const config = UPGRADE_CONFIGS[type];
        const currentCount = this.acquiredUpgrades.get(type) || 0;
        if (currentCount >= config.maxStack) {
            console.warn(`强化 ${config.name} 已达上限`);
            return;
        }
        this.acquiredUpgrades.set(type, currentCount + 1);
        this.executeUpgradeEffect(type);
    }
    executeUpgradeEffect(type) {
        const state = this.towerMergeSystem.getGlobalUpgradeState();
        const config = UPGRADE_CONFIGS[type];
        if (config.targetTypes) {
            for (const target of config.targetTypes) {
                if (config.damageScale) {
                    state.towerDamageMultipliers[target] = (state.towerDamageMultipliers[target] ?? 1) * config.damageScale;
                }
                if (config.speedScale) {
                    state.towerSpeedMultipliers[target] = (state.towerSpeedMultipliers[target] ?? 1) * config.speedScale;
                }
            }
        }
        switch (type) {
            case UpgradeType.ALL_DAMAGE:
            case UpgradeType.ALL_SPEED:
            case UpgradeType.CONTROL_MATRIX:
            case UpgradeType.SIEGE_PROTOCOL:
                // 精确目标倍率已在上方按塔型写入状态，供已有和新召唤的塔继承。
                break;
            case UpgradeType.FROST_SLOW:
                // 冰霜减速效果+20%（加算）
                state.frostSlowBonus += 0.2;
                break;
            case UpgradeType.ELECTRIC_CHAIN:
                // 电击弹射+1
                state.electricChainBonus += 1;
                break;
            case UpgradeType.POISON_DURATION:
                // 毒素持续+2秒
                state.poisonDurationBonus += 2;
                break;
            case UpgradeType.BOMB_RANGE:
                // 炸弹爆炸范围+20%（乘算）
                state.bombRadiusMultiplier *= 1.2;
                break;
            case UpgradeType.MERGE_BONUS:
                // 合成防御塔获得额外攻击力+5
                state.mergeBonusDamage += 5;
                break;
            case UpgradeType.FUSION_BONUS:
                // 高级塔（麻醉/镇压/雷麻）技能触发概率+15%
                state.fusionBonusChance += 0.15;
                break;
            case UpgradeType.GOLD_BONUS:
                // 每波结束获得30额外金币
                const currentBonus = this.resourceManager.getGoldBonusPerWave();
                this.resourceManager.setGoldBonusPerWave(currentBonus + 30);
                break;
            case UpgradeType.HEAL:
                // 核心病房恢复3点生命
                this.resourceManager.healBase(3);
                break;
            case UpgradeType.ELITE_EXPLODE:
                // 精英怪死亡时产生范围爆炸（标记已启用，实际效果在GameManager中处理）
                break;
        }
        // 更新全局状态到 TowerMergeSystem
        this.towerMergeSystem.setGlobalUpgradeState(state);
        // 对现有防御塔应用新的全局状态
        const towers = this.towerMergeSystem.getAllTowers();
        for (const tower of towers) {
            tower.applyGlobalUpgradeState(state);
        }
    }
    // 检查是否启用了精英爆炸
    hasEliteExplode() {
        return (this.acquiredUpgrades.get(UpgradeType.ELITE_EXPLODE) || 0) > 0;
    }
    // 波次结束奖励
    applyWaveEndReward() {
        const bonus = this.resourceManager.getGoldBonusPerWave();
        if (bonus > 0) {
            this.resourceManager.addGold(bonus);
        }
        return bonus;
    }
    reset() {
        this.acquiredUpgrades.clear();
        this.resourceManager.setGoldBonusPerWave(0);
    }
}
//# sourceMappingURL=UpgradeSystem.js.map