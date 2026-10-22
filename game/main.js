/**
 * 游戏入口
 */
import { GameManager } from './core/GameManager.js';
// 等待DOM加载完成
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const loading = document.getElementById('loading');
    if (!canvas) {
        console.error('Canvas not found');
        return;
    }
    // 隐藏加载提示
    if (loading) {
        loading.classList.add('hidden');
    }
    // 创建游戏管理器并启动
    const game = new GameManager(canvas);
    game.start();
    // 移动端音频解锁：iOS Safari / Android Chrome 要求用户交互后才能播放音频
    // 在第一次触摸/点击时解锁 AudioContext
    const unlockAudio = () => {
        if (window.game) {
            window.game.unlockAudio();
        }
        // 解锁后移除监听器，避免重复调用
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio);
    console.log('赛博防线：机械入侵 - 游戏已启动');
    console.log('操作说明：');
    console.log('- 点击"召唤"按钮消耗金币获得随机防御塔（品阶 N / R / SR / SSR）');
    console.log('- 点击空格子放置防御塔');
    console.log('- 拖动防御塔到别的塔位可以搬家（放回原格子不会有任何变化）');
    console.log('- 只有"完全相同的防御塔"（同类型 + 同等级）才能合成升级，不同种类的防御塔不能组合');
    console.log('- 每波结束后选择强化，每关通关后可以抽取一张新防御塔');
    console.log('- 击败全部 9 关（共 90 波）获得胜利');
    // 导出到全局用于调试
    window.game = game;
    // 调试命令：直接跳到指定关卡（1-9）
    // 用法：jumpToLevel(6) 跳到第6关
    window.jumpToLevel = (level) => {
        if (level < 1 || level > 9) {
            console.log('关卡范围：1-9');
            return;
        }
        // 给玩家足够的金币测试
        game['resourceManager'].setGold(9999);
        // 跳到指定关卡（索引从0开始）
        game['startLevel'](level - 1);
        console.log(`已跳到第${level}关`);
    };
});
//# sourceMappingURL=main.js.map