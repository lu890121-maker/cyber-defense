/**
 * 资源管理器
 * 管理金币和防线生命值
 */
import { GAME_CONSTANTS } from '../config/GameConfig.js';
export class ResourceManager {
    constructor() {
        this.goldBonusPerWave = 0;
        this.gold = GAME_CONSTANTS.INITIAL_GOLD;
        this.maxLives = GAME_CONSTANTS.INITIAL_LIVES;
        this.lives = this.maxLives;
    }
    getGold() {
        return this.gold;
    }
    getLives() {
        return this.lives;
    }
    getMaxLives() {
        return this.maxLives;
    }
    addGold(amount) {
        this.gold += amount;
    }
    spendGold(amount) {
        if (this.gold >= amount) {
            this.gold -= amount;
            return true;
        }
        return false;
    }
    setGold(amount) {
        this.gold = Math.max(0, amount);
    }
    setLives(amount) {
        this.lives = Math.max(0, Math.min(this.maxLives, amount));
    }
    damageBase(amount = 1) {
        this.lives = Math.max(0, this.lives - amount);
    }
    healBase(amount) {
        this.lives = Math.min(this.maxLives, this.lives + amount);
    }
    setGoldBonusPerWave(bonus) {
        this.goldBonusPerWave = bonus;
    }
    getGoldBonusPerWave() {
        return this.goldBonusPerWave;
    }
    isGameOver() {
        return this.lives <= 0;
    }
    /**
     * 重置资源到开局状态。
     * @param goldMultiplier 初始金币倍率。双人合作传 2 —— 怪潮翻倍了，
     *        钱不跟着翻的话，两个人只能守着两条路看怪漏过去（手速够但买不起塔）。
     */
    reset(goldMultiplier = 1) {
        this.gold = Math.round(GAME_CONSTANTS.INITIAL_GOLD * Math.max(1, goldMultiplier));
        this.lives = this.maxLives;
        this.goldBonusPerWave = 0;
    }
}
//# sourceMappingURL=ResourceManager.js.map