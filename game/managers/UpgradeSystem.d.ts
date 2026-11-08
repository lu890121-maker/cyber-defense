/**
 * 强化系统
 * 管理随机强化选择和应用
 */
import { UpgradeType, TowerType } from '../config/GameConfig.js';
import { TowerMergeSystem } from './TowerMergeSystem.js';
import { ResourceManager } from './ResourceManager.js';
import { GlobalUpgradeState } from '../entities/Tower.js';
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
    /**
     * 全局升级状态读写。UpgradeSystem 本身不另存一份 —— 它一直通过
     * TowerMergeSystem 的 state 生效（见 executeUpgradeEffect）。这里补两个委托，
     * 让「恢复指挥官存档」时能显式把两边同步到同一份 state：
     * forcePlace() 会用 TowerMergeSystem 持有的 state 重算新塔乘区，必须同步。
     */
    getGlobalUpgradeState(): GlobalUpgradeState;
    setGlobalUpgradeState(state: GlobalUpgradeState): void;
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
