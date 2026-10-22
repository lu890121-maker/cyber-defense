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
    damageBase(amount?: number): void;
    healBase(amount: number): void;
    setGoldBonusPerWave(bonus: number): void;
    getGoldBonusPerWave(): number;
    isGameOver(): boolean;
    reset(): void;
}
