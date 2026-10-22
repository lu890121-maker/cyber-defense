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
    reset() {
        this.gold = GAME_CONSTANTS.INITIAL_GOLD;
        this.lives = this.maxLives;
        this.goldBonusPerWave = 0;
    }
}
//# sourceMappingURL=ResourceManager.js.map