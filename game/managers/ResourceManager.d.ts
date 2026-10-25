/**
 * 资源管理器
 * 管理金币和防线生命值
 */
export declare class ResourceManager {
    private gold;
    private lives;
    private maxLives;
    private goldBonusPerWave;
    constructor();
    getGold(): number;
    getLives(): number;
    getMaxLives(): number;
    addGold(amount: number): void;
    spendGold(amount: number): boolean;
    setGold(amount: number): void;
    setLives(amount: number): void;
    damageBase(amount?: number): void;
    healBase(amount: number): void;
    setGoldBonusPerWave(bonus: number): void;
    getGoldBonusPerWave(): number;
    isGameOver(): boolean;
    /**
     * 重置资源到开局状态。
     * @param goldMultiplier 初始金币倍率。双人合作传 2 —— 怪潮翻倍了，
     *        钱不跟着翻的话，两个人只能守着两条路看怪漏过去（手速够但买不起塔）。
     */
    reset(goldMultiplier?: number): void;
}
