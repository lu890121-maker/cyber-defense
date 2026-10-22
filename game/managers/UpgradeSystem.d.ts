/**
 * 强化系统
 * 管理随机强化选择和应用
 */
import { UpgradeType, TowerType } from '../config/GameConfig.js';
import { TowerMergeSystem } from './TowerMergeSystem.js';
import { ResourceManager } from './ResourceManager.js';
export interface UpgradeOption {
    type: UpgradeType;
    name: string;
    icon: string;
    description: string;
    targetLabel?: string;
}
export declare class UpgradeSystem {
    private acquiredUpgrades;
    private towerMergeSystem;
    private resourceManager;
    constructor(towerMergeSystem: TowerMergeSystem, resourceManager: ResourceManager);
    getAcquiredUpgrades(): Map<UpgradeType, number>;
    generateOptions(unlockedTypes?: TowerType[]): UpgradeOption[];
    /** 从当前可用强化中随机抽一项，并排除本轮已展示的选项。 */
    generateRandomOption(unlockedTypes: TowerType[] | undefined, excludedTypes: UpgradeType[]): UpgradeOption | null;
    private getAvailableTypes;
    private toOption;
    applyUpgrade(type: UpgradeType): void;
    private executeUpgradeEffect;
    hasEliteExplode(): boolean;
    applyWaveEndReward(): number;
    reset(): void;
}
