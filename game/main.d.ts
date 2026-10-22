/**
 * 游戏入口
 */
import { GameManager } from './core/GameManager.js';
declare global {
    interface Window {
        game?: GameManager;
    }
}
