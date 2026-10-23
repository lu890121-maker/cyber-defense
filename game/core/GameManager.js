/**
 * 游戏主管理器
 * 控制游戏状态、循环、交互
 */
import { GAME_CONSTANTS, TowerType, TOWER_CONFIGS, TOWER_SLOTS, PATH_POINTS, PATH_ROUTES, PATH_WARP_SEGMENTS, EnemyType, MUTATION_TYPES, TOTAL_WAVES, isBossWave, autoSkillFor, findSkillById, isBossType, ENEMY_CONFIGS, LEVELS, getActiveLevel, setActiveLevel, getLevelCount, Rarity, RARITY_CONFIGS, rarityIndex, rollRarity, SUMMON_PITY_LIMIT, summonPrice, SUMMON_PRICE_MIN, SUMMON_PRICE_MAX, getGlobalWave, WAVE_AUTO_ADVANCE_SECONDS, WAVE_END_GOLD_REWARD, MAX_TOWER_LEVEL, toRoman, WAVE_FORCE_ADVANCE_SECONDS, NO_WAVE_TIME_LIMIT, getWaveTimeLimit, PREMIUM_SUMMON_COST, PREMIUM_SUMMON_PITY_LIMIT, rollPremiumRarity, ACTIVE_PORTALS, ACTIVE_FOG_ZONES } from '../config/GameConfig.js';
import { ResourceManager } from '../managers/ResourceManager.js';
import { WaveManager } from '../managers/WaveManager.js';
import { TowerMergeSystem } from '../managers/TowerMergeSystem.js';
import { UpgradeSystem } from '../managers/UpgradeSystem.js';
import { Tower, resetTowerSerial } from '../entities/Tower.js';
import { Enemy } from '../entities/Enemy.js';
import { SpriteLoader, computeEnemyAnim, towerTierScale } from './SpriteLoader.js';
import { applySkillEffect } from './SkillEffects.js';
import { VfxSystem } from './VfxSystem.js';
import { EnvironmentRenderer, levelKeyOf } from './EnvironmentRenderer.js';
import { SoundManager } from './SoundManager.js';
import { TechnicalArtRenderer } from './TechnicalArtRenderer.js';
import { CYBER, cutRectPath, neonText } from '../config/CyberTheme.js';
import { renderTutorial, getTutorialLayout, TUTORIAL_PAGES } from './TutorialScreen.js';
/** 主菜单两个按钮的位置：渲染与点击判定共用，避免画的和点的错位 */
const MENU_BUTTONS = {
    start: { x: 60, y: 400, w: 160, h: 62 },
    tutorial: { x: 230, y: 400, w: 160, h: 62 },
};
/** 召唤面板底部的「玩法教程」入口 —— 战斗中想看教程，不必等这局结束 */
const SUMMON_TUTORIAL_BTN = { x: 105, y: 650, w: 240, h: 40 };
/** 结算面板（失败/胜利）的「玩法教程」入口 */
const RESULT_TUTORIAL_BTN = { x: 150, y: 562, w: 150, h: 44 };
/** 每次通关可带入下一关的炮塔数量。999表示无限制，所有塔都能带入。 */
const CARRY_TOWER_LIMIT = 999;
export class GameManager {
    constructor(canvas) {
        this.gameState = 'menu';
        /** 教程状态 */
        this.tutorialPage = 0;
        /** 教程界面的独立时钟（暂停状态下也要驱动扫描线/呼吸动画） */
        this.tutorialElapsed = 0;
        /** 从哪进的教程，退出时回到哪（菜单 / 战场 / 召唤面板） */
        this.tutorialReturn = 'menu';
        /** 开场序幕时间，点击开始后自动播放，点击可跳过 */
        this.openingElapsed = 0;
        this.gameTime = 0;
        this.lastTime = 0;
        this.gameSpeed = 1;
        this.paused = false;
        // UI状态
        this.selectedSlot = -1;
        this.placingTower = null;
        this.summonCostPaid = false; // 追踪是否已扣费
        this.upgradeOptions = [];
        this.upgradeNoticeText = '';
        /**
         * 通关强化挂起标志（v1.6.2 修复）：每关通关后弹一次强化面板，
         * 选完后不是回 playing，而是进关卡结算（handleLevelCleared）。
         * 普通波不再有强化机会 —— 判据是"关内最后一波清空"。
         */
        this.pendingLevelClearAfterUpgrade = false;
        /** 当前强化面板是否由"通关"触发（渲染标题/副标题区分） */
        this.isLevelClearUpgrade = false;
        /** 通关强化面板上展示的最终波次奖励文案 */
        this.levelClearRewardText = '';
        this.normalSummonOptions = []; // 普通召唤的三选一选项
        this.premiumSummonOptions = []; // 特级召唤的三选一选项
        /**
         * 召唤改为「看牌免费、选中才付钱」，价格由品阶决定（见 summonPrice）。
         * 因此不再有固定的 SUMMON_COST —— 唯一需要的是"能不能开出面板"的下限，
         * 即最便宜的一档价格。真正的扣费发生在 handleSummonSelect 里按卡计价。
         */
        this.SUMMON_ENTRY_COST = SUMMON_PRICE_MIN;
        /** 刷新卡池的费用 */
        this.SUMMON_REROLL_COST = 20;
        /** 强化提示横幅的剩余显示时间（秒）与文案 */
        this.enhanceToast = 0;
        this.enhanceToastText = '';
        this.enhanceToastColor = '#fbbf24';
        this.mergeCount = 0;
        /** Boss 出场红色警告横幅的剩余显示时间（秒） */
        this.bossWarningTimer = 0;
        // ── 关卡进度 ──
        /** 当前关卡序号（0 起） */
        this.currentLevelIndex = 0;
        /** 连续多少次召唤没有出 SR 以上 —— 达到 SUMMON_PITY_LIMIT 时强制保底 */
        this.summonPity = 0;
        /** 新解锁的塔型；只解锁卡池，不白送实体塔。 */
        this.newlyUnlockedTowerType = null;
        // 所有10种塔一开始就全部可用
        this.unlockedTowerTypes = new Set([
            TowerType.MACHINE_GUN, TowerType.FROST, TowerType.ELECTRIC,
            TowerType.POISON, TowerType.BOMB, TowerType.LASER,
            TowerType.SNIPER, TowerType.FLAME, TowerType.MAGNETIC,
            TowerType.SINGULARITY
        ]);
        this.carryCandidates = [];
        this.carrySelection = new Set();
        this.carryPage = 0;
        this.pendingCarryTowers = null;
        /** 本关击杀总数，用于结算面板展示 */
        this.levelKillCount = 0;
        // 动画效果
        this.attackEffects = [];
        this.mergeEffects = [];
        /**
         * 升级（UP!）特效。合成 / 同卡自动升级时压入一条，
         * 画面上会出现"金色扩散环 + 上浮的 UP! Lv.Ⅳ" ——
         * 光靠角标数字变化，玩家在混战里根本注意不到自己升级了。
         */
        this.levelUpFlashes = [];
        /**
         * 「自动获得技能」飘字。
         *
         * 升级不再弹三选一，玩家如果不看到"这次给了我什么技能"，
         * 就会觉得技能是凭空冒出来的 —— 这条飘字是自动发放的**唯一反馈通道**。
         */
        this.skillGainToasts = [];
        /**
         * 渲染层动画时钟（秒）。**不用 `performance.now()`** ——
         * 像素断言要求同一串 dt 得到同一帧，墙上时钟会让"脉冲环画在哪"每次都不同。
         */
        this.animTime = 0;
        this.pulseEffects = [];
        // 背景粒子（雾气/灰尘）
        this.bgParticles = [];
        // 战斗特效中枢：弹道 / 撞击溅射 / 冲击环 / 焦痕 / 飘字 / 震屏 / 顿帧
        this.vfx = new VfxSystem();
        // 拖拽系统
        this.draggingTower = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasDragged = false;
        // 防御塔信息面板
        this.showTowerInfo = false;
        this.towerInfoTower = null;
        // 特级召唤（原过载按钮）
        this.premiumSummonCount = 0; // 特级召唤次数（用于保底）
        this.premiumSummonPity = 0; // 距离SSR保底的剩余次数
        this.isPremiumSummonMode = false; // 当前是否为特级召唤模式
        // 波次自动开始倒计时
        this.nextWaveCountdown = 0;
        this.nextWaveCountdownActive = false;
        // ── 波次强制推进（v1.6）──
        // 从波次开始计时，到点无论清没清完都结束本波。防止玩家留一只怪无限拖延。
        this.waveElapsed = 0;
        this.waveTimeLimit = WAVE_FORCE_ADVANCE_SECONDS;
        /** 本波是否因超时而被强制结束（用于给出明确反馈，而不是让玩家以为卡住了） */
        this.waveTimedOut = false;
        this.mergeAreaSlots = Array.from({ length: 6 }, () => ({ x: 0, y: 0, tower: null }));
        // 按钮区域
        this.buttons = new Map();
        // 防止双重输入
        this.touchHandled = false;
        // 音频：首次用户交互后解锁并启动环境层/音乐
        this.audioStarted = false;
        // 音频：上一秒的倒计时读数（避免重复播放滴答）
        this.lastCountdownTick = 99;
        this.gameLoop = () => {
            const now = performance.now();
            let deltaTime = (now - this.lastTime) / 1000;
            this.lastTime = now;
            // 修复：限制 deltaTime 上限，防止切换标签页后时间差过大
            deltaTime = Math.min(deltaTime, 0.1);
            // 环境层（灯光闪烁/尘埃/滴水）在所有状态下都跑，菜单背景也是活的
            this.env.update(deltaTime);
            // 强化提示横幅：走真实时间、且不放在 update() 里 ——
            // update() 在 upgrade_select / summon_select 会提前 return，
            // 那样横幅会在面板背后冻住不消失。
            if (this.enhanceToast > 0)
                this.enhanceToast -= deltaTime;
            // 3.6 秒开场序幕；使用受 deltaTime 上限保护的时钟，标签页切回时不会跳过整段动画。
            if (this.gameState === 'opening') {
                this.openingElapsed += deltaTime;
                if (this.openingElapsed >= 3.6)
                    this.startGame();
            }
            // 教程界面用独立时钟：背后的战场是暂停的，但扫描线/卡片呼吸要一直动
            if (this.gameState === 'tutorial')
                this.tutorialElapsed += deltaTime;
            // 循环层自愈：任何状态下都巡检，避免音乐静默消失后无人发现
            this.soundManager.tick();
            this.update(deltaTime);
            this.render();
            requestAnimationFrame(this.gameLoop);
        };
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.spriteLoader = new SpriteLoader();
        this.soundManager = new SoundManager();
        this.taRenderer = new TechnicalArtRenderer(canvas);
        // 分层环境：地面/陈设烘焙缓存 + 每帧光效
        this.env = new EnvironmentRenderer(canvas);
        // 把特效中枢适配成 TowerVfxSink 注入给所有防御塔。
        // 显式绑定：把 VfxSystem 的方法拿出来包一层，Tower 侧只看接口。
        const v = this.vfx;
        this.vfxSink = {
            fire: (style, sx, sy, tx, ty, power, onArrive) => v.fire(style, sx, sy, tx, ty, power, onArrive),
            beam: (x1, y1, x2, y2, kind, color, life) => v.beam(x1, y1, x2, y2, kind, color, life),
            shockwave: (x, y, color, r1, life, width, kind) => v.shockwave(x, y, color, r1, life, width, kind),
            impact: (x, y, kind, angle, power) => v.impact(x, y, kind, angle, power),
            flash: (x, y, r, color, life) => v.flash(x, y, r, color, life),
            floater: (x, y, text, color, size, crit) => v.floater(x, y, text, color, size, crit),
            shake: (power) => v.shake(power),
            hitStop: (duration) => v.hitStop(duration)
        };
        canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
        canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
        this.resourceManager = new ResourceManager();
        this.waveManager = new WaveManager();
        this.towerMergeSystem = new TowerMergeSystem();
        this.upgradeSystem = new UpgradeSystem(this.towerMergeSystem, this.resourceManager);
        // 初始化背景粒子
        this.initBgParticles();
        this.setupInput();
        this.setupButtons();
        // 预加载音频素材（真实音源，异步进行，不阻塞游戏启动）
        this.soundManager.load((loaded, total) => {
            if (loaded === total) {
                console.log(`[Audio] 全部 ${total} 个音频素材就绪`);
            }
        }).catch((err) => {
            console.warn('[Audio] 素材加载异常，将使用兜底合成音', err);
        });
        // 异步加载精灵图素材（assets/sprites/*.png，29 张）。
        // 单张失败时该类型自动回退程序化绘制；在就绪前走矢量兜底，不阻塞启动。
        this.spriteLoader.load().catch(err => {
            console.warn('[Sprite] 素材加载异常，将使用矢量兜底:', err);
        });
    }
    initBgParticles() {
        for (let i = 0; i < 30; i++) {
            this.bgParticles.push({
                x: Math.random() * GAME_CONSTANTS.CANVAS_WIDTH,
                y: Math.random() * GAME_CONSTANTS.CANVAS_HEIGHT,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.3 + 0.1,
                alpha: Math.random() * 0.3 + 0.1,
                drift: (Math.random() - 0.5) * 0.2
            });
        }
    }
    // 辅助：绘制圆角矩形
    roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    /**
     * 面板内的分组分隔线：中间亮、两端透明的细横线。
     * 用它把信息面板切成「属性 / 已学技能 / 基础特性」三段 ——
     * 没有分隔线时，技能名会和属性行糊成一片，看不出分组。
     */
    drawPanelDivider(x, y, w) {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, 'rgba(0, 240, 255, 0)');
        g.addColorStop(0.5, 'rgba(0, 240, 255, 0.45)');
        g.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, 1);
    }
    setupButtons() {
        const bottomY = GAME_CONSTANTS.CANVAS_HEIGHT - 48;
        // 底部三键：召唤 / 过载 / 加速（+ 右侧卖出区，见 getSellArea()）。
        // 「下一波」按钮已移除 —— 波次清空后固定 10 秒自动推进（见 update()），
        // 玩家不需要（也不应该）手动催波，节奏由系统统一控制。
        // 重开按钮也已移除：它从未被渲染，却在 (350,730) 留了一个 30×30 的
        // 隐形热区，误触会直接重开整局 —— 属于隐患。重开只在结算面板里提供。
        //
        // 整排等距重排（画布 450 宽，左右各留 18，三处间隙各 12）：
        // 18..136 / 148..266 / 278..334 / 卖出区 346..432。
        // 起因：旧布局加速键 295..365 与卖出区 350..430 横向叠压 15px，
        // 而卖出区画在按钮之后 → 红面板把「1x」的右半边盖掉。
        this.buttons.set('summon', { x: 18, y: bottomY, w: 96, h: 40 });
        this.buttons.set('overload', { x: 124, y: bottomY, w: 102, h: 40 });
        this.buttons.set('speed', { x: 236, y: bottomY, w: 48, h: 40 });
        // 静音开关（右上角）
        this.buttons.set('mute', { x: 410, y: 8, w: 32, h: 32 });
        // 六个合成格均匀铺满底栏，留出塔名显示空间。
        const mergeAreaY = GAME_CONSTANTS.CANVAS_HEIGHT - 100;
        const mergeAreaStartX = 53;
        const mergeAreaSpacing = 68;
        for (let i = 0; i < this.mergeAreaSlots.length; i++) {
            this.mergeAreaSlots[i].x = mergeAreaStartX + i * mergeAreaSpacing;
            this.mergeAreaSlots[i].y = mergeAreaY;
        }
    }
    setupInput() {
        // 修复：只使用 touchstart，不再同时绑定 click，防止双重触发
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.touchHandled = true;
            this.handlePointerDown(touch);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handlePointerMove(touch);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            // 拖拽结束后不应再触发 handleClick，否则刚放下的塔会被"点"一下，
            // 导致意外合成（例如：把第二座塔拖到空塔位 → 立即与第一座合成）。
            // 只有非拖拽的轻触才应走 handleClick 路径。
            const wasDragging = this.draggingTower !== null || this.hasDragged;
            this.handlePointerUp();
            const touch = e.changedTouches[0];
            if (touch && !wasDragging) {
                this.handleClick(touch);
            }
        });
        // 只在没有触摸事件时处理 click（用于桌面浏览器）
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.touchHandled) {
                this.touchHandled = false;
                return;
            }
            this.handlePointerDown(e);
        });
        this.canvas.addEventListener('mousemove', (e) => {
            this.handlePointerMove(e);
        });
        this.canvas.addEventListener('mouseup', (e) => {
            this.handlePointerUp();
        });
        // 拖到画布外面松手：canvas 上的 mouseup 根本不会触发，draggingTower 会
        // 一直留在"拖拽中"状态。此时鼠标哪怕只是在画布上空晃一圈（mousemove 会
        // 把 draggingTower.x/y 改到指针位置），下一次 mouseup 就会把塔甩到指针
        // 所在的格子上 —— 玩家看到的就是"塔自己飞走了 / 莫名其妙合成了"。
        // 所以画布外的松手统一按"取消拖拽"处理：塔留在原地，什么都不发生。
        window.addEventListener('mouseup', (e) => {
            if (!this.draggingTower)
                return;
            if (e.target === this.canvas)
                return; // 画布内的松手交给上面的处理器
            this.draggingTower = null;
        });
        // 切窗口 / 触摸被系统打断同样按取消处理
        window.addEventListener('blur', () => { this.draggingTower = null; });
        this.canvas.addEventListener('touchcancel', () => { this.draggingTower = null; });
        this.canvas.addEventListener('click', (e) => {
            if (this.touchHandled) {
                this.touchHandled = false;
                return;
            }
            this.handleClick(e);
        });
        // 键盘快捷键：M 静音切换
        window.addEventListener('keydown', (e) => {
            if (e.key === 'm' || e.key === 'M') {
                const muted = this.soundManager.toggleMute();
                console.log(muted ? '[Audio] 已静音' : '[Audio] 已恢复声音');
            }
        });
        // 页面隐藏时挂起音频，返回时恢复（节省资源）
        document.addEventListener('visibilitychange', () => {
            if (document.hidden)
                this.soundManager.suspend();
            else
                this.soundManager.resume();
        });
    }
    /**
     * 首次用户交互后解锁音频（浏览器自动播放策略），
     * 并启动赛博环境层与动态音乐。
     * @param track 首曲；若首次点击即「开始游戏」，直接进战斗曲，避免无谓的交叉淡化
     */
    startAudio(track = 'menu') {
        // 每次用户操作都重试恢复，兼容首次 resume 被浏览器拒绝或页面切回后挂起。
        this.soundManager.unlock();
        if (this.audioStarted)
            return;
        this.audioStarted = true;
        this.soundManager.startAmbience();
        this.soundManager.startMusic(track);
        this.soundManager.setTension(0.15);
    }
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    handlePointerDown(e) {
        // 重置拖拽状态，确保 upgrade_select 等状态下点击不会被误判为拖拽
        const prevState = this.hasDragged;
        this.hasDragged = false;
        if (this.gameState !== 'playing')
            return;
        const { x, y } = this.getCanvasCoords(e);
        // 关闭信息面板（如果有）
        if (this.showTowerInfo) {
            this.showTowerInfo = false;
            this.towerInfoTower = null;
            return;
        }
        this.dragStartX = x;
        this.dragStartY = y;
        // 检查是否点击了合成区域的防御塔
        for (let i = 0; i < this.mergeAreaSlots.length; i++) {
            const slot = this.mergeAreaSlots[i];
            if (slot.tower && Math.abs(x - slot.x) < 32 && Math.abs(y - slot.y) < 34) {
                this.draggingTower = { slotIndex: -1 - i, x: slot.x, y: slot.y };
                return;
            }
        }
        // 检查是否点击了战场上的防御塔
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
            const slot = TOWER_SLOTS[i];
            const tower = this.towerMergeSystem.getTowerAt(i);
            if (tower && Math.abs(x - slot.x) < 22 && Math.abs(y - slot.y) < 22) {
                this.draggingTower = { slotIndex: i, x: slot.x, y: slot.y };
                return;
            }
        }
    }
    handlePointerMove(e) {
        if (!this.draggingTower)
            return;
        const { x, y } = this.getCanvasCoords(e);
        // 检测是否真的发生了拖拽（移动距离超过阈值）
        const dx = x - this.dragStartX;
        const dy = y - this.dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            this.hasDragged = true;
        }
        this.draggingTower.x = x;
        this.draggingTower.y = y;
    }
    /**
     * 槽位编码 → 防御塔。全游戏只有这一处解码逻辑，别再各写一遍。
     *
     * slotIndex >= 0 : 战场第 slotIndex 格
     * slotIndex <  0 : 合成区第 (-slotIndex - 1) 格
     *
     * 注意合成区第 0 格编码成 -1，所以判据必须是 `< 0`。
     * 曾经写成 `< -1`，结果"从下面 6 格里的第 1 格拖塔"时拖动过程什么都不显示
     * —— 玩家只看到手指下面空空如也，完全无法理解这一拖意味着什么。
     */
    towerAtSlot(slotIndex) {
        if (slotIndex >= 0)
            return this.towerMergeSystem.getTowerAt(slotIndex) ?? null;
        const mergeIndex = -slotIndex - 1;
        const slot = this.mergeAreaSlots[mergeIndex];
        return slot ? slot.tower : null;
    }
    /**
     * 拖拽落点解析：指针当前悬停在哪个可放置区域上。
     * 检查顺序与 handlePointerUp 完全一致（合成区 → 卖钱 → 战场），
     * 否则"看到的提示"和"松手后真正发生的事"会不一致，那比没有提示更糟。
     */
    resolveDropTarget(x, y) {
        for (let i = 0; i < this.mergeAreaSlots.length; i++) {
            const slot = this.mergeAreaSlots[i];
            if (Math.abs(x - slot.x) < 32 && Math.abs(y - slot.y) < 34) {
                return { kind: 'merge', index: i, tower: slot.tower };
            }
        }
        const sellArea = this.getSellArea();
        if (x >= sellArea.x && x <= sellArea.x + sellArea.w && y >= sellArea.y && y <= sellArea.y + sellArea.h) {
            return { kind: 'sell', index: -1, tower: null };
        }
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
            const slot = TOWER_SLOTS[i];
            if (Math.abs(x - slot.x) < 22 && Math.abs(y - slot.y) < 22) {
                return { kind: 'field', index: i, tower: this.towerMergeSystem.getTowerAt(i) ?? null };
            }
        }
        return { kind: null, index: -1, tower: null };
    }
    handlePointerUp() {
        if (!this.draggingTower)
            return;
        const { x, y } = this.draggingTower;
        const fromSlot = this.draggingTower.slotIndex;
        this.draggingTower = null;
        // 如果没有真正拖拽，视为点击，显示防御塔信息
        if (!this.hasDragged) {
            const tower = this.towerAtSlot(fromSlot);
            if (tower) {
                this.showTowerInfo = true;
                this.towerInfoTower = tower;
            }
            return;
        }
        // 辅助：获取拖拽来源的防御塔
        const getFromTower = () => this.towerAtSlot(fromSlot);
        // 辅助：移除来源防御塔
        const removeFrom = () => {
            if (fromSlot >= 0) {
                this.towerMergeSystem.removeTower(fromSlot);
            }
            else {
                const mergeIndex = -fromSlot - 1;
                this.mergeAreaSlots[mergeIndex].tower = null;
            }
        };
        // 检查是否放在合成区域
        for (let i = 0; i < this.mergeAreaSlots.length; i++) {
            const slot = this.mergeAreaSlots[i];
            if (Math.abs(x - slot.x) < 32 && Math.abs(y - slot.y) < 34) {
                const fromMergeIndex = fromSlot < 0 ? -fromSlot - 1 : -1;
                // 不能放到自己（同格子自投会变成"自己和自己合成"，必须拦掉）
                if (fromMergeIndex === i)
                    return;
                if (slot.tower) {
                    // 目标格子有防御塔 -> 只有「完全相同的防御塔」才能合成升级
                    const fromTower = getFromTower();
                    const targetTower = slot.tower;
                    // 第二道防线：即使槽位账本出错导致同一座塔同时出现在两个格子里，
                    // 对象相同也一律拒绝 —— 否则 canMergeWith(self) 恒为 true，
                    // 每拖一次就升一级（无限升级 bug）。
                    if (fromTower && fromTower !== targetTower && fromTower.canMergeWith(targetTower)) {
                        // 升级算法单点在 TowerMergeSystem.combine（同卡自动升级也走它）。
                        // 第一个参数必须是**结果所占格子的那座塔**（targetTower）——
                        // 子塔的技能变体继承自它，玩家看到的 build 线才不会莫名跳档。
                        const newTower = TowerMergeSystem.combine(targetTower, fromTower);
                        if (newTower) {
                            this.towerMergeSystem.applyMergeUpgrades(newTower);
                            newTower.setPosition(slot.x, slot.y);
                            newTower.setSlotIndex(-i - 1);
                            removeFrom();
                            this.mergeAreaSlots[i].tower = newTower;
                            this.mergeCount++;
                            this.triggerLevelUpFeedback(newTower, slot.x, slot.y);
                        }
                    }
                    else if (fromTower && targetTower) {
                        // 不同塔型/等级不合成时直接交换位置，拖拽行为符合直觉。
                        removeFrom();
                        this.mergeAreaSlots[i].tower = null;
                        if (fromSlot >= 0)
                            this.towerMergeSystem.removeTower(fromSlot);
                        targetTower.setPosition(fromSlot >= 0 ? TOWER_SLOTS[fromSlot].x : this.mergeAreaSlots[-fromSlot - 1].x, fromSlot >= 0 ? TOWER_SLOTS[fromSlot].y : this.mergeAreaSlots[-fromSlot - 1].y);
                        targetTower.setSlotIndex(fromSlot);
                        if (fromSlot >= 0)
                            this.towerMergeSystem.placeExistingTower(targetTower, fromSlot);
                        else
                            this.mergeAreaSlots[-fromSlot - 1].tower = targetTower;
                        fromTower.setPosition(slot.x, slot.y);
                        fromTower.setSlotIndex(-i - 1);
                        this.mergeAreaSlots[i].tower = fromTower;
                    }
                }
                else {
                    // 目标格子为空 -> 移动过去
                    const fromTower = getFromTower();
                    if (fromTower) {
                        removeFrom();
                        fromTower.setPosition(slot.x, slot.y);
                        fromTower.setSlotIndex(-i - 1);
                        slot.tower = fromTower;
                        // 放置后检查自动合成
                        this.autoMergeCheck();
                    }
                }
                return;
            }
        }
        // 检查是否放在卖钱区域
        const sellArea = this.getSellArea();
        if (x >= sellArea.x && x <= sellArea.x + sellArea.w && y >= sellArea.y && y <= sellArea.y + sellArea.h) {
            const fromTower = getFromTower();
            if (fromTower) {
                const config = fromTower.getConfig();
                // 稀有度影响回收价：越稀有的塔越值钱
                const refund = Math.floor(config.cost * 0.5 * RARITY_CONFIGS[fromTower.getRarity()].sellMult);
                this.resourceManager.addGold(refund);
                removeFrom();
                this.soundManager.playSellTower();
            }
            return;
        }
        // 检查是否放在战场格子
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
            const slot = TOWER_SLOTS[i];
            if (Math.abs(x - slot.x) < 22 && Math.abs(y - slot.y) < 22) {
                // 拖回自己原来的格子 = 空操作。
                // 这里必须提前返回：否则 existingTower 就是 fromTower 本身，
                // "同类型 + 同等级" 恒成立，每拖一次就升一级（无限升级 bug）。
                if (i === fromSlot)
                    return;
                const existingTower = this.towerMergeSystem.getTowerAt(i);
                if (existingTower) {
                    // 目标格子有防御塔 -> 只有「完全相同的防御塔」才能合成升级
                    const fromTower = getFromTower();
                    // 第二道防线：fromTower === existingTower 时直接拒绝。
                    // 第一道防线是上面的 `i === fromSlot`，但那只覆盖"格子号相同"；
                    // 对象比较覆盖任何槽位账本不一致的情况（see towerAtSlot 注释）。
                    if (fromTower && fromTower !== existingTower && fromTower.canMergeWith(existingTower)) {
                        // 升级算法单点在 TowerMergeSystem.combine（同卡自动升级也走它）。
                        // 第一个参数必须是**结果所占槽位的那座塔**（existingTower）——
                        // 见 combine 的参数顺序说明：子塔变体继承自它。
                        const newTower = TowerMergeSystem.combine(existingTower, fromTower);
                        if (newTower) {
                            this.towerMergeSystem.applyMergeUpgrades(newTower);
                            removeFrom();
                            this.towerMergeSystem.removeTower(i);
                            this.towerMergeSystem.placeExistingTower(newTower, i);
                            this.mergeCount++;
                            this.triggerLevelUpFeedback(newTower, slot.x, slot.y);
                        }
                        return;
                    }
                    // 不同塔不能合成时交换两座塔的位置。
                    if (fromTower && existingTower) {
                        removeFrom();
                        this.towerMergeSystem.removeTower(i);
                        this.towerMergeSystem.placeExistingTower(fromTower, i);
                        if (fromSlot >= 0)
                            this.towerMergeSystem.placeExistingTower(existingTower, fromSlot);
                        else {
                            const mergeIndex = -fromSlot - 1;
                            existingTower.setPosition(this.mergeAreaSlots[mergeIndex].x, this.mergeAreaSlots[mergeIndex].y);
                            existingTower.setSlotIndex(fromSlot);
                            this.mergeAreaSlots[mergeIndex].tower = existingTower;
                        }
                    }
                }
                else {
                    // 目标格子为空 -> 移动过去
                    const fromTower = getFromTower();
                    if (fromTower) {
                        if (fromSlot >= 0) {
                            // 场上拖到场上
                            this.towerMergeSystem.removeTower(fromSlot);
                            this.towerMergeSystem.placeExistingTower(fromTower, i);
                        }
                        else {
                            // 从合成区拖到场上
                            removeFrom();
                            this.towerMergeSystem.placeExistingTower(fromTower, i);
                            this.soundManager.playPlaceTower();
                        }
                    }
                }
                return;
            }
        }
    }
    /**
     * 卖出区：**拖拽落点**，不是按钮（不参与 handleClick 的按钮循环）。
     * 与底部三键同排，但更矮更窄 —— 它是"拖过来松手"的目标，不需要按钮那么大的点击面。
     * 左缘 346 与加速键右缘 334 留 12px 间隙，红面板不会再盖住「1x」。
     * 尺寸 86×46（旧值 80×60：高度减 23%、面积减 18%），中心 (389, 754)。
     * 改这里必须同步 `verify_drag.mjs` 里"卖出"用例的注释坐标。
     */
    getSellArea() {
        return { x: 294, y: 752, w: 138, h: 40 };
    }
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        // 右上角静音开关：任何状态下都可点击
        const muteBtn = this.buttons.get('mute');
        const isMuteClick = !!muteBtn && this.isInButton(x, y, muteBtn);
        // 首次交互：解锁音频并启动环境层/音乐。
        // 一律先起菜单曲 —— 菜单里除了「开始游戏」还有「游戏教程」，
        // 早先在这里直接起战斗曲，点教程后会带着战斗曲进教程、回菜单也不换回来。
        // 真正的战斗曲由 startLevel() 切换（2s 交叉淡化，听感上就是"入场"）。
        this.startAudio('menu');
        if (isMuteClick) {
            this.soundManager.toggleMute();
            return;
        }
        if (this.gameState === 'tutorial') {
            this.handleTutorialClick(x, y);
            return;
        }
        if (this.gameState === 'menu') {
            // 教程按钮优先：主菜单里任何点击都等于"开始游戏"，必须先拦住它
            if (this.isInButton(x, y, MENU_BUTTONS.tutorial)) {
                this.soundManager.playButtonClick();
                this.openTutorial('menu');
                return;
            }
            // 解锁音频上下文（浏览器要求用户交互后才能播放音频）
            this.soundManager.unlock();
            this.soundManager.playMenuStart();
            this.openingElapsed = 0;
            this.gameState = 'opening';
            return;
        }
        if (this.gameState === 'opening') {
            this.startGame();
            return;
        }
        if (this.gameState === 'game_over' || this.gameState === 'victory') {
            // 检查重新开始按钮
            const restartBtn = { x: 150, y: 500, w: 150, h: 50 };
            if (this.isInButton(x, y, restartBtn)) {
                this.soundManager.playButtonClick();
                this.restartGame();
                return;
            }
            // 玩法教程入口：看完返回菜单（这局已经结束了，回战场没有意义）
            if (this.isInButton(x, y, RESULT_TUTORIAL_BTN)) {
                this.soundManager.playButtonClick();
                this.openTutorial('menu');
                return;
            }
            return;
        }
        if (this.gameState === 'upgrade_select') {
            this.handleUpgradeSelect(x, y);
            return;
        }
        if (this.gameState === 'summon_select') {
            this.handleSummonSelect(x, y);
            return;
        }
        if (this.gameState === 'level_clear') {
            this.handleLevelClearClick(x, y);
            return;
        }
        // 检查底部按钮
        for (const [name, btn] of this.buttons) {
            if (this.isInButton(x, y, btn)) {
                this.handleButtonClick(name);
                return;
            }
        }
        // 检查防御塔格子点击
        this.handleGridClick(x, y);
    }
    isInButton(x, y, btn) {
        return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
    }
    handleButtonClick(name) {
        this.soundManager.playButtonClick();
        switch (name) {
            case 'summon':
                this.summonTower();
                break;
            case 'overload':
                this.premiumSummon();
                break;
            case 'speed':
                this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
                break;
            case 'mute':
                this.soundManager.toggleMute();
                break;
        }
    }
    // ── 教程 ──
    openTutorial(from) {
        this.tutorialReturn = from;
        this.tutorialPage = 0;
        this.tutorialElapsed = 0;
        this.gameState = 'tutorial';
    }
    handleTutorialClick(x, y) {
        const layout = getTutorialLayout(this.canvas.width, this.canvas.height);
        const isLast = this.tutorialPage === TUTORIAL_PAGES.length - 1;
        if (this.isInButton(x, y, layout.close)) {
            this.soundManager.playButtonClick();
            this.gameState = this.tutorialReturn;
            this.markTutorialSeen();
            return;
        }
        if (this.isInButton(x, y, layout.prev) && this.tutorialPage > 0) {
            this.soundManager.playButtonClick();
            this.tutorialPage--;
            return;
        }
        if (this.isInButton(x, y, layout.next)) {
            this.soundManager.playButtonClick();
            if (isLast) {
                // 末页按钮是「返回」：回战场继续，回菜单则留在菜单
                this.gameState = this.tutorialReturn;
                this.markTutorialSeen();
            }
            else {
                this.tutorialPage++;
            }
            return;
        }
        // 面板空白处不做事：避免小白到处乱点把教程点没
    }
    handleGridClick(x, y) {
        // 检查点击了哪个格子
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
            const slot = TOWER_SLOTS[i];
            if (Math.abs(x - slot.x) < 25 && Math.abs(y - slot.y) < 25) {
                this.handleSlotClick(i);
                return;
            }
        }
        // 点击空白处取消选择
        // 修复：如果正在放置防御塔且已扣费，取消时退还金币
        if (this.placingTower && this.summonCostPaid) {
            this.resourceManager.addGold(this.SUMMON_ENTRY_COST);
            this.summonCostPaid = false;
        }
        this.selectedSlot = -1;
        this.placingTower = null;
    }
    handleSlotClick(slotIndex) {
        const tower = this.towerMergeSystem.getTowerAt(slotIndex);
        // 如果正在放置防御塔
        if (this.placingTower) {
            if (!tower) {
                // 放置防御塔到空格
                const newTower = this.towerMergeSystem.placeTower(this.placingTower, slotIndex);
                if (newTower) {
                    // 放置成功，金币已扣，清除标记
                    this.summonCostPaid = false;
                    this.placingTower = null;
                    this.soundManager.playPlaceTower();
                }
                else {
                    // 放置失败，退还金币
                    this.resourceManager.addGold(this.SUMMON_ENTRY_COST);
                    this.summonCostPaid = false;
                    this.placingTower = null;
                    this.soundManager.playDenied();
                }
            }
            else {
                // 点击了已有防御塔的格子，退还金币并取消放置
                this.resourceManager.addGold(this.SUMMON_ENTRY_COST);
                this.summonCostPaid = false;
                this.placingTower = null;
                this.soundManager.playDenied();
            }
            return;
        }
        // 如果已选中一个防御塔
        if (this.selectedSlot >= 0 && this.selectedSlot !== slotIndex) {
            // 尝试合成
            this.tryMerge(this.selectedSlot, slotIndex);
            this.selectedSlot = -1;
            return;
        }
        // 选中/取消选中
        if (tower) {
            if (this.selectedSlot === slotIndex) {
                // 双击同一个防御塔，取消选中
                this.selectedSlot = -1;
            }
            else {
                this.selectedSlot = slotIndex;
            }
        }
        else {
            this.selectedSlot = -1;
        }
    }
    /**
     * 升级后**自动发放**本档技能（不再弹三选一）。
     *
     * 规则：**一座防御塔的技能数 = 等级 − 1**（每升 1 级发 1 个技能，
     * 所以 Lv4 的防御塔正好带 3 个技能）。技能档位按等级取：
     * Lv2 拿 Lv2 档、Lv3 拿 Lv3 档、Lv4 拿 Lv4 档。
     *
     * ── 发哪一个 ──
     * 每档有 3 个候选，按塔的 `skillVariant`（构造时轮换分配）取第 `variant` 个。
     * 于是第 1/2/3 座同名塔各走一条 build 线，9 个技能全都有出场机会，
     * 而且完全确定性 —— 可写断言验证。
     *
     * 已经填满技能位就直接返回 —— 合成、搬迁、重复落位都可能多次调到这里，
     * 少了这道闸门，同一座塔会被反复塞技能。
     */
    checkAndTriggerSkillSelect(tower) {
        const level = tower.getLevel();
        const towerType = tower.getType();
        if (tower.getLearnedSkills().length >= level - 1)
            return;
        // 规则单点在 autoSkillFor —— 验证脚本用的是同一个函数，
        // 两边各写一遍"第 variant 个"必然会漂
        const skill = autoSkillFor(towerType, level, tower.getSkillVariant());
        if (!skill)
            return;
        this.applySkillEffect(tower, skill);
        this.soundManager.playSkillReady();
        this.skillGainToasts.push({
            x: tower.getX(),
            y: tower.getY(),
            name: skill.name,
            icon: skill.icon,
            time: 0
        });
    }
    applySkillEffect(tower, skill) {
        // 统一走 SkillEffects 注册表。返回 false 说明这个 effect 没实现 ——
        //  loudly 报出来，让"技能点了没反应"在开发期就暴露，而不是等玩家发现。
        const ok = applySkillEffect(tower, skill.effect);
        if (!ok) {
            console.error(`[技能] ${skill.name}（${skill.effect}）没有对应实现，本次选择无效`);
        }
        tower.learnSkill(skill.id);
        // 添加特效
        this.mergeEffects.push({ x: tower.getX(), y: tower.getY(), time: 0 });
    }
    tryMerge(slot1, slot2) {
        // 只有「完全相同的防御塔」能合成升级；不同种类的防御塔不能组合
        if (this.towerMergeSystem.canMergeSame(slot1, slot2)) {
            const result = this.towerMergeSystem.mergeSame(slot1, slot2);
            if (result.success) {
                this.mergeCount++;
                const newTower = result.tower;
                if (newTower) {
                    this.triggerLevelUpFeedback(newTower, TOWER_SLOTS[slot1].x, TOWER_SLOTS[slot1].y);
                }
            }
            else {
                this.soundManager.playDenied();
            }
            return;
        }
        this.soundManager.playDenied();
    }
    /**
     * 可召唤的防御塔池：11 种防御塔，各带一个元素/机制特色。
     * 抽卡按 1/造价 加权 —— 便宜的更常见，贵的属于「运气好才出现」。
     */
    get summonPool() {
        return Array.from(this.unlockedTowerTypes);
    }
    /**
     * 抽 3 张互不重复的防御塔卡。
     *
     * 两个维度独立滚动：
     *   · 类型 —— 按造价反比加权。召唤费只要 50 金，不该轻易白嫖 100 金的鹰眼防御塔，
     *     所以便宜的塔权重更高，贵塔属于「运气好才出现」。
     *   · 稀有度 —— 按 RARITY_CONFIGS 的权重滚（62/26/9.5/2.5）。
     *
     * 稀有度保底：连续 SUMMON_PITY_LIMIT 次（=10）没出 SR 以上时，这一抽
     * 强制 floor = SR。触发后计数归零。三张卡共用一次保底判定，
     * 避免"一次三连抽同时把保底用掉三次"。
     */
    generateSummonOptions() {
        const floor = this.summonPity >= SUMMON_PITY_LIMIT ? Rarity.SR : Rarity.N;
        const pool = this.summonPool.slice();
        const picked = [];
        for (let k = 0; k < 3 && pool.length > 0; k++) {
            const weights = pool.map(t => 1 / Math.max(1, TOWER_CONFIGS[t].cost));
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            let idx = pool.length - 1;
            for (let i = 0; i < pool.length; i++) {
                r -= weights[i];
                if (r <= 0) {
                    idx = i;
                    break;
                }
            }
            // 只有第一张卡吃保底，后两张回到正常概率，否则一次召唤会刷出 3 个 SR
            const rarity = rollRarity(k === 0 ? floor : Rarity.N);
            picked.push({ type: pool[idx], rarity });
            pool.splice(idx, 1);
        }
        this.registerSummonResult(picked);
        return picked;
    }
    /** 更新保底计数：抽到 SR 以上就清零，否则累加 */
    registerSummonResult(options) {
        const gotHigh = options.some(o => rarityIndex(o.rarity) >= rarityIndex(Rarity.SR));
        this.summonPity = gotHigh ? 0 : this.summonPity + 1;
    }
    /** 距离保底还差几抽 */
    getPityRemaining() {
        return Math.max(0, SUMMON_PITY_LIMIT - this.summonPity);
    }
    /**
     * 把防御塔放进合成区第一个空位；无空位返回 false。
     *
     * ── 同卡自动升级 ──
     * 买入的防御塔永远是 Lv1。如果合成区里已经躺着一张**同类型 Lv1** 的卡，
     * 就不占新格子，直接把它吃掉升到 Lv2（带 UP 特效 + 技能三选一）。
     * 没有这一步，玩家买重复卡只会把 6 个格子塞满，还得手动拖一次才算合成 ——
     * 而"买到重复卡 = 白白浪费一次召唤"本身就是最劝退的体验。
     */
    placeTowerInMergeArea(type, rarity = Rarity.N) {
        const twinIndex = this.mergeAreaSlots.findIndex(s => s.tower !== null
            && s.tower.getType() === type
            && s.tower.getLevel() === 1
            && s.tower.getLevel() < MAX_TOWER_LEVEL);
        if (twinIndex !== -1) {
            const twin = this.mergeAreaSlots[twinIndex].tower;
            const incoming = new Tower(type, twin.getX(), twin.getY(), -1, 1, rarity);
            const upgraded = TowerMergeSystem.combine(twin, incoming);
            if (upgraded) {
                this.towerMergeSystem.applyMergeUpgrades(upgraded);
                this.mergeAreaSlots[twinIndex].tower = upgraded;
                // 同卡自动升级也是一次合成，必须计入 mergeCount，
                // 否则结算界面「合成次数」会比玩家实际合成的少
                this.mergeCount++;
                this.triggerLevelUpFeedback(upgraded, twin.getX(), twin.getY());
                // 升级后可能和合成区里另一座同型同级的塔凑成新的一对，
                // 必须再扫一次，否则会出现「两个 Lv2 躺在那儿却不合成」
                this.autoMergeCheck();
                return true;
            }
        }
        const emptySlot = this.mergeAreaSlots.findIndex(s => s.tower === null);
        if (emptySlot === -1)
            return false;
        const slot = this.mergeAreaSlots[emptySlot];
        slot.tower = new Tower(type, slot.x, slot.y, -1, 1, rarity);
        // 放置后检查自动合成（包括同卡升级和同等级合成）
        this.autoMergeCheck();
        return true;
    }
    /**
     * 自动合成检查：扫描合成区，如果有两个同类型+同等级的塔，自动合成升级。
     * 在每次向合成区放置塔后调用。
     */
    autoMergeCheck() {
        for (let i = 0; i < this.mergeAreaSlots.length; i++) {
            const towerA = this.mergeAreaSlots[i].tower;
            if (!towerA)
                continue;
            for (let j = i + 1; j < this.mergeAreaSlots.length; j++) {
                const towerB = this.mergeAreaSlots[j].tower;
                if (!towerB)
                    continue;
                // 同类型 + 同等级 + 未满级
                if (towerA.getType() === towerB.getType() &&
                    towerA.getLevel() === towerB.getLevel() &&
                    towerA.getLevel() < MAX_TOWER_LEVEL) {
                    // 合成（towerA 保留位置，towerB 被消耗）
                    const upgraded = TowerMergeSystem.combine(towerA, towerB);
                    if (upgraded) {
                        this.towerMergeSystem.applyMergeUpgrades(upgraded);
                        upgraded.setPosition(this.mergeAreaSlots[i].x, this.mergeAreaSlots[i].y);
                        upgraded.setSlotIndex(-i - 1);
                        this.mergeAreaSlots[i].tower = upgraded;
                        this.mergeAreaSlots[j].tower = null;
                        this.mergeCount++;
                        this.triggerLevelUpFeedback(upgraded, upgraded.getX(), upgraded.getY());
                        // 合成后可能还能继续合成，递归检查
                        this.autoMergeCheck();
                        return;
                    }
                }
            }
        }
    }
    /**
     * 统一的"升级了"反馈：合成光环 + UP 特效 + 音效 + 技能三选一。
     *
     * 所有会让防御塔涨等级的入口都必须走这里（塔位合成 / 合成区合成 / 同卡自动升级），
     * 否则会出现"升了级但没有技能可选"这种半截状态。
     */
    triggerLevelUpFeedback(tower, x, y) {
        this.mergeEffects.push({ x, y, time: 0 });
        this.levelUpFlashes.push({ x, y, level: tower.getLevel(), time: 0 });
        this.soundManager.playMergeSuccess();
        this.checkAndTriggerSkillSelect(tower);
    }
    /**
     * 点击「召唤」：抽 3 张卡并进入三选一界面。
     *
     * 抽卡本身**不扣费** —— 价格随品阶浮动，抽之前无法定价，所以扣费推迟到玩家选定某张卡时
     * （见 handleSummonSelect）。这里只拦两种开不了面板的情况：合成区满、以及连最便宜的
     * 一张都买不起。
     *
     * 若上一次没选就退出了，会**复用同一批卡**。否则"退出再进"等于免费换一批，
     * 20 金的换牌费就形同虚设了。
     */
    summonTower() {
        // 合成区满则无法接收新防御塔
        if (this.mergeAreaSlots.every(s => s.tower !== null)) {
            this.soundManager.playDenied();
            return;
        }
        if (this.resourceManager.getGold() < this.SUMMON_ENTRY_COST) {
            this.soundManager.playDenied();
            return;
        }
        this.isPremiumSummonMode = false; // 普通召唤模式
        if (this.normalSummonOptions.length === 0) {
            this.normalSummonOptions = this.generateSummonOptions();
        }
        this.soundManager.playSummon();
        this.gameState = 'summon_select';
    }
    handleSummonSelect(x, y) {
        // 3 张卡的布局（必须与 renderSummonSelect 保持一致）
        const optionWidth = 120;
        const optionHeight = 214;
        const startX = (GAME_CONSTANTS.CANVAS_WIDTH - optionWidth * 3 - 20) / 2;
        const startY = 330;
        // 根据当前模式选择对应的卡池
        const currentOptions = this.isPremiumSummonMode ? this.premiumSummonOptions : this.normalSummonOptions;
        // 刷新卡池
        const refreshBtnX = GAME_CONSTANTS.CANVAS_WIDTH / 2 - 70;
        const refreshBtnY = 552;
        const refreshBtnW = 140;
        const refreshBtnH = 44;
        const rerollCost = this.isPremiumSummonMode ? 40 : 20;
        if (x >= refreshBtnX && x <= refreshBtnX + refreshBtnW &&
            y >= refreshBtnY && y <= refreshBtnY + refreshBtnH) {
            if (this.resourceManager.getGold() >= rerollCost) {
                this.resourceManager.spendGold(rerollCost);
                if (this.isPremiumSummonMode) {
                    this.premiumSummonOptions = this.generatePremiumSummonOptions();
                }
                else {
                    this.normalSummonOptions = this.generateSummonOptions();
                }
                this.soundManager.playButtonClick();
            }
            else {
                this.soundManager.playDenied();
            }
            return;
        }
        // 玩法教程入口：战斗中也能看，看完原样返回召唤面板
        if (this.isInButton(x, y, SUMMON_TUTORIAL_BTN)) {
            this.soundManager.playButtonClick();
            this.openTutorial('summon_select');
            return;
        }
        // 选中某张卡 → 按这张卡的品阶价格扣费，防御塔进入合成区
        for (let i = 0; i < currentOptions.length; i++) {
            const btnX = startX + i * (optionWidth + 10);
            if (x >= btnX && x <= btnX + optionWidth && y >= startY && y <= startY + optionHeight) {
                const opt = currentOptions[i];
                const price = summonPrice(opt.rarity);
                // 买不起：面板不关，让玩家去「换一批」或者攒钱，而不是把三张卡丢掉
                if (this.resourceManager.getGold() < price) {
                    this.soundManager.playDenied();
                    return;
                }
                this.resourceManager.spendGold(price);
                if (this.placeTowerInMergeArea(opt.type, opt.rarity)) {
                    this.soundManager.playPlaceTower();
                }
                else {
                    // 合成区满了：退钱
                    this.resourceManager.addGold(price);
                    this.soundManager.playDenied();
                }
                // 清空对应模式的卡池
                if (this.isPremiumSummonMode) {
                    this.premiumSummonOptions = [];
                }
                else {
                    this.normalSummonOptions = [];
                }
                this.gameState = 'playing';
                return;
            }
        }
        // 点击空白处：关面板，但**保留这批卡**（免费换牌的口子不能开）
        this.gameState = 'playing';
        this.soundManager.playButtonClick();
    }
    /** 关卡结算面板：点击「进入下一关」推进 */
    handleLevelClearClick(x, y) {
        const btn = this.levelClearButtonRect();
        const hitButton = x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
        if (hitButton) {
            if (this.carrySelection.size !== Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length)) {
                this.soundManager.playDenied();
                return;
            }
            this.soundManager.playButtonClick();
            this.advanceToNextLevel();
            return;
        }
        const pageCount = Math.max(1, Math.ceil(this.carryCandidates.length / 6));
        if (y >= 535 && y <= 575) {
            if (x < 125 && this.carryPage > 0)
                this.carryPage--;
            else if (x > 325 && this.carryPage < pageCount - 1)
                this.carryPage++;
            return;
        }
        const cardW = 128, cardH = 86, gapX = 13;
        const startX = (GAME_CONSTANTS.CANVAS_WIDTH - (cardW * 3 + gapX * 2)) / 2;
        for (let local = 0; local < 6; local++) {
            const idx = this.carryPage * 6 + local;
            if (idx >= this.carryCandidates.length)
                break;
            const col = local % 3, row = Math.floor(local / 3);
            const cx = startX + col * (cardW + gapX), cy = 342 + row * 94;
            if (x < cx || x > cx + cardW || y < cy || y > cy + cardH)
                continue;
            const tower = this.carryCandidates[idx];
            if (this.carrySelection.has(tower))
                this.carrySelection.delete(tower);
            else if (this.carrySelection.size < CARRY_TOWER_LIMIT)
                this.carrySelection.add(tower);
            else
                this.soundManager.playDenied();
            this.soundManager.playButtonClick();
            return;
        }
    }
    /** 关卡结算面板按钮位置（render 与 click 必须共用） */
    levelClearButtonRect() {
        const W = GAME_CONSTANTS.CANVAS_WIDTH;
        return { x: W / 2 - 105, y: 632, w: 210, h: 54 };
    }
    handleUpgradeSelect(x, y) {
        const randomBtn = this.upgradeRandomButtonRect();
        if (x >= randomBtn.x && x <= randomBtn.x + randomBtn.w &&
            y >= randomBtn.y && y <= randomBtn.y + randomBtn.h) {
            const randomOption = this.upgradeSystem.generateRandomOption(this.summonPool, this.upgradeOptions.map(option => option.type));
            if (!randomOption) {
                this.upgradeNoticeText = '没有其他可用强化，请从上方三项中选择';
                this.soundManager.playDenied();
                return;
            }
            this.upgradeSystem.applyUpgrade(randomOption.type);
            this.soundManager.playUpgradeSelect();
            const detail = randomOption.targetLabel
                ? `${randomOption.targetLabel}：${randomOption.description}`
                : randomOption.description;
            this.showEnhanceToast(`🎲 随机强化：${randomOption.name} · ${detail}`, '#fbbf24');
            this.finishUpgradeSelection();
            return;
        }
        // 3个选项的按钮位置
        const optionWidth = 120;
        const optionHeight = 166;
        const startX = (GAME_CONSTANTS.CANVAS_WIDTH - optionWidth * 3 - 20) / 2;
        const startY = 350;
        for (let i = 0; i < this.upgradeOptions.length; i++) {
            const btnX = startX + i * (optionWidth + 10);
            if (x >= btnX && x <= btnX + optionWidth && y >= startY && y <= startY + optionHeight) {
                this.upgradeSystem.applyUpgrade(this.upgradeOptions[i].type);
                this.soundManager.playUpgradeSelect();
                this.finishUpgradeSelection();
                return;
            }
        }
    }
    /**
     * 强化选择完成后的统一收尾（v1.6.2）。
     * 通关强化 → 清挂起标志并进入关卡结算（handleLevelCleared）；
     * 普通强化 → 回 playing + exitUpgradePhase。
     * 两个入口（随机 / 点选卡片）都必须走这里，否则通关后会卡在 upgrade_select。
     */
    finishUpgradeSelection() {
        this.upgradeNoticeText = '';
        if (this.pendingLevelClearAfterUpgrade) {
            this.pendingLevelClearAfterUpgrade = false;
            this.isLevelClearUpgrade = false;
            this.levelClearRewardText = '';
            this.handleLevelCleared();
        }
        else {
            this.gameState = 'playing';
            this.waveManager.exitUpgradePhase();
        }
    }
    /** 随机强化按钮位置（render 与 click 共用） */
    upgradeRandomButtonRect() {
        const W = GAME_CONSTANTS.CANVAS_WIDTH;
        return { x: W / 2 - 112, y: 548, w: 224, h: 46 };
    }
    startGame() {
        this.pendingCarryTowers = [];
        this.startLevel(0);
    }
    /**
     * 进入指定关卡。这是关卡系统的中枢：
     *   1. setActiveLevel() 重绑定 PATH_POINTS / TOWER_SLOTS / WAVE_CONFIGS
     *   2. 应用关卡环境词缀（目前只有攻速惩罚是全局的，死亡分裂在击杀处处理）
     *   3. 把上一关的防御塔搬迁到新地图的塔位上，由玩家选择最多六座带走
     *   4. 重置波次管理器，开始第一波
     */
    startLevel(index) {
        const lv = setActiveLevel(index);
        this.currentLevelIndex = index;
        // 关卡环境词缀：电磁干扰会拉长全场防御塔的攻击间隔
        Tower.envIntervalMult = lv.modifier?.towerIntervalMult ?? 1.0;
        // 按玩家上关选择搬迁炮塔
        this.relocateTowersForLevel(this.pendingCarryTowers ?? []);
        this.pendingCarryTowers = null;
        // 波次管理器复位，重新开始本关第 1 波
        this.waveManager.reset();
        this.levelKillCount = 0;
        this.newlyUnlockedTowerType = null;
        this.gameState = 'playing';
        // 按关卡档位选 BGM：L1-3 轻 / L4-7 中 / L8-10 重
        this.soundManager.setLevelTier(index);
        this.waveManager.startNextWave();
        this.resetWaveClock();
        this.updateTension();
    }
    /**
     * 重置波次强制推进计时（每波开始时调用）。
     *
     * 时限按**即将开始的这一波**取：普通波 20s、**Boss 波无时限**
     * （`NO_WAVE_TIME_LIMIT`，见 getWaveTimeLimit —— 用户诉求"最后一关必须清场才解锁"）。
     * 必须在 `waveManager.startNextWave()` **之后**调用，因为那一步才会自增波号。
     *
     * 顺带把「下一波倒数」也清掉：`startLevel()` 不走 `startNextWave()`，
     * 如果上一波/上一关留下的倒计时没清，新关卡第一波会在"倒计时进行中"启动 ——
     * 那会让强制推进计时器**永远不累计**（它有个 `!nextWaveCountdownActive` 的前置条件）。
     */
    resetWaveClock() {
        this.nextWaveCountdownActive = false;
        this.nextWaveCountdown = 0;
        this.waveElapsed = 0;
        this.waveTimedOut = false;
        this.waveTimeLimit = getWaveTimeLimit(this.waveManager.getCurrentWave());
    }
    /**
     * 关卡搬迁：把场上所有防御塔按价值降序塞进新地图的塔位。
     *
     * 三张地图的塔位数量不同（14 / 16 / 12），从机械巢穴（16）搬到核心反应堆（12）
     * 会有 4 座塔放不下。溢出处理分两级：
     *   ① 先进合成区的空位（6 个）—— 玩家还能把它们拖到场上
     *   ② 合成区也满了 → 按造价 × 稀有度倍率折价回收成金币
     * 这样"塔位变少"不是惩罚，而是一次被迫的取舍与资源回收。
     */
    relocateTowersForLevel(selectedTowers) {
        const fieldTowers = this.towerMergeSystem.collectAllForRelocation();
        const mergeTowers = this.mergeAreaSlots.flatMap(slot => slot.tower ? [slot.tower] : []);
        for (const slot of this.mergeAreaSlots)
            slot.tower = null;
        const owned = new Set([...fieldTowers, ...mergeTowers]);
        const carried = selectedTowers.slice(0, CARRY_TOWER_LIMIT).filter(tower => owned.has(tower));
        // ① 先占场上塔位
        let cursor = 0;
        const overflow = [];
        for (const tower of carried) {
            if (cursor < TOWER_SLOTS.length)
                this.towerMergeSystem.forcePlace(tower, cursor++);
            else
                overflow.push(tower);
        }
        // ② 场上的塔位不够（后期地图路线密集，塔位会比塔少）→ 进合成区空位，
        //    玩家还能把它们拖上场、就地合成或卖掉，而不是凭空消失。
        let mergeCursor = 0;
        const refunded = [];
        for (const tower of overflow) {
            while (mergeCursor < this.mergeAreaSlots.length && this.mergeAreaSlots[mergeCursor].tower)
                mergeCursor++;
            if (mergeCursor >= this.mergeAreaSlots.length) {
                refunded.push(tower);
                continue;
            }
            this.mergeAreaSlots[mergeCursor].tower = tower;
            mergeCursor++;
        }
        // ③ 连合成区都满了 → 按半价 × 稀有度倍率折价回收成金币
        for (const tower of refunded) {
            const cfg = tower.getConfig();
            const gold = Math.floor(cfg.cost * 0.5 * RARITY_CONFIGS[tower.getRarity()].sellMult);
            this.resourceManager.addGold(gold);
        }
        // 玩家未选择的塔留在上一关，不自动折价、不挤进合成栏。
    }
    handleLevelCleared() {
        const lv = getActiveLevel();
        if (lv.clearGold > 0)
            this.resourceManager.addGold(lv.clearGold);
        // 所有塔类型一开始就可用，不再解锁新塔
        this.newlyUnlockedTowerType = null;
        // 所有塔自动带入下一关，跳过选择界面
        const allTowers = [
            ...this.towerMergeSystem.getAllTowers(),
            ...this.mergeAreaSlots.flatMap(slot => slot.tower ? [slot.tower] : [])
        ];
        this.pendingCarryTowers = allTowers;
        // 从"通关强化面板"进来时 WaveManager 还停在 upgrade_select，这里显式退出
        this.waveManager.exitUpgradePhase();
        this.nextWaveCountdownActive = false;
        this.soundManager.setTension(0);
        this.soundManager.playVictory();
        // 直接进入下一关
        if (this.currentLevelIndex + 1 >= getLevelCount()) {
            this.gameState = 'victory';
            this.waveManager.enterVictory();
        }
        else {
            this.startLevel(this.currentLevelIndex + 1);
        }
    }
    advanceToNextLevel() {
        if (this.currentLevelIndex + 1 >= getLevelCount()) {
            this.gameState = 'victory';
            return;
        }
        if (this.carrySelection.size !== Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length))
            return;
        this.pendingCarryTowers = Array.from(this.carrySelection).slice(0, CARRY_TOWER_LIMIT);
        this.carryCandidates = [];
        this.carrySelection.clear();
        this.startLevel(this.currentLevelIndex + 1);
    }
    restartGame() {
        this.resourceManager.reset();
        this.waveManager.reset();
        this.towerMergeSystem.reset();
        this.upgradeSystem.reset();
        // 合成区不属于 TowerMergeSystem，必须单独清空 —— 否则重开后上一局的
        // 防御塔会白送给新的一局（而且它们的品阶/等级也一起带过来）。
        for (const slot of this.mergeAreaSlots)
            slot.tower = null;
        // 关卡进度复位：回到第 1 关，地图与波次也要跟着重绑定
        setActiveLevel(0);
        this.currentLevelIndex = 0;
        Tower.envIntervalMult = 1.0;
        this.summonPity = 0;
        this.newlyUnlockedTowerType = null;
        // 所有塔类型一开始就可用
        this.unlockedTowerTypes = new Set([
            TowerType.MACHINE_GUN, TowerType.FROST, TowerType.ELECTRIC,
            TowerType.POISON, TowerType.BOMB, TowerType.LASER,
            TowerType.SNIPER, TowerType.FLAME, TowerType.MAGNETIC,
            TowerType.SINGULARITY
        ]);
        this.carryCandidates = [];
        this.carrySelection.clear();
        this.pendingCarryTowers = [];
        this.carryPage = 0;
        this.levelKillCount = 0;
        this.gameState = 'menu';
        this.gameTime = 0;
        this.gameSpeed = 1;
        this.paused = false;
        this.selectedSlot = -1;
        this.placingTower = null;
        this.summonCostPaid = false;
        this.upgradeOptions = [];
        this.pendingLevelClearAfterUpgrade = false;
        this.isLevelClearUpgrade = false;
        this.levelClearRewardText = '';
        this.normalSummonOptions = [];
        this.premiumSummonOptions = [];
        this.mergeCount = 0;
        this.attackEffects = [];
        this.vfx.clear();
        this.mergeEffects = [];
        this.levelUpFlashes = [];
        this.skillGainToasts = [];
        // 技能变体轮换归零 —— 每局第一座塔都从变体 0 开始，保证一局内可复现
        resetTowerSerial();
        // 波次强制推进计时归零（新一局从第 1 波重新计时）
        this.waveElapsed = 0;
        this.waveTimedOut = false;
        this.waveTimeLimit = WAVE_FORCE_ADVANCE_SECONDS;
        this.soundManager.setBgm('menu');
        this.soundManager.setTension(0.15);
    }
    // 主循环
    start() {
        this.lastTime = performance.now();
        // 启动菜单背景音乐（用户首次交互后会自动解锁）
        this.soundManager.setBgm('menu');
        this.gameLoop();
        // 第一次打开游戏：直接把教程怼到脸上。
        // 小白玩家的诉求是"迅速了解玩法"，等他自己发现按钮太慢；
        // 看完一次就写本地标记，以后只保留菜单里的「游戏教程」入口。
        this.maybeFirstRunTutorial();
    }
    /** 首次运行自动弹教程（localStorage 标记，只弹一次） */
    maybeFirstRunTutorial() {
        const KEY = 'cyber-defense.tutorial.seen';
        try {
            if (localStorage.getItem(KEY))
                return;
        }
        catch (e) {
            return; // 隐私模式 / file:// 下读不到就放弃自动弹，不影响正常进游戏
        }
        this.openTutorial('menu');
    }
    markTutorialSeen() {
        const KEY = 'cyber-defense.tutorial.seen';
        try {
            localStorage.setItem(KEY, '1');
        }
        catch (e) { /* 忽略：写不了只是下次还会再弹 */ }
    }
    // 解锁音频（移动端需要用户交互后才能播放）
    unlockAudio() {
        this.soundManager.unlock();
    }
    update(deltaTime) {
        if (this.paused || this.gameState === 'menu' || this.gameState === 'opening' ||
            this.gameState === 'game_over' || this.gameState === 'victory' ||
            this.gameState === 'upgrade_select' || this.gameState === 'summon_select' ||
            this.gameState === 'level_clear' || this.gameState === 'tutorial') {
            return;
        }
        const scaledDelta = deltaTime * this.gameSpeed;
        this.gameTime += scaledDelta;
        this.injectVfxSink();
        this.spriteLoader.update(scaledDelta);
        // 顿帧：命中瞬间的极短冻结。
        // 逻辑不走、弹道不走，只让表现层继续跑 → 视觉上是"这一下砸实了"。
        // 没有顿帧的塔防，打得再多也像在刮痧。
        if (this.vfx.isFrozen()) {
            this.vfx.update(deltaTime, this.waveManager.getAliveEnemies(), true);
            this.updateEffects(scaledDelta * 0.2);
            return;
        }
        // 更新波次
        const waveResult = this.waveManager.update(scaledDelta);
        this.updateBossSkills(scaledDelta);
        // 更新Boss警告计时器
        if (this.bossWarningTimer > 0) {
            this.bossWarningTimer -= scaledDelta;
        }
        // 处理逃脱的敌人
        if (waveResult.escaped > 0) {
            this.resourceManager.damageBase(waveResult.escaped);
            this.soundManager.playEnemyEscape();
            this.updateTension();
        }
        // 处理击杀的敌人
        for (const enemy of waveResult.killed) {
            this.resourceManager.addGold(enemy.getReward());
            this.soundManager.playGoldGain();
            this.levelKillCount++;
            // 击杀音效（按敌人类型分级 + 空间定位）
            const pan = this.panFromX(enemy.getX());
            if (isBossType(enemy.getType())) {
                this.soundManager.playBossDeath();
            }
            else if (enemy.isElite()) {
                this.soundManager.playEnemyDeathBig(pan);
            }
            else {
                this.soundManager.playEnemyDeath(pan);
            }
            // 修复：精英爆炸效果
            if (this.upgradeSystem.hasEliteExplode() && enemy.isElite()) {
                this.applyEliteExplosion(enemy.getX(), enemy.getY());
            }
            // 分裂怪处理
            if (enemy.getType() === EnemyType.SPLIT) {
                this.spawnMiniEnemies(enemy.getX(), enemy.getY(), enemy.getPathIndex(), enemy.getPathPoints(), enemy.getWaveMultiplier(), enemy.getWarpSegments());
            }
            // 自爆机雷：死亡时瘫痪附近防御塔。
            // 这是唯一能直接削弱玩家场上资产的敌人 —— 逼玩家把塔分散布置，
            // 而不是把所有火力堆在一个卡口位。
            const paralyze = enemy.getDeathParalyze();
            if (paralyze) {
                this.applyBomberParalyze(enemy.getX(), enemy.getY(), paralyze.radius, paralyze.duration);
            }
            // 关卡环境词缀「感染扩散」：任何敌人死亡都有概率裂变出小怪。
            // 与分裂孢子机的固定裂变叠加，让机械巢穴这一关的清场压力贯穿始终。
            const lvMod = getActiveLevel().modifier;
            if (lvMod?.deathSplitChance && enemy.getType() !== EnemyType.MINI && Math.random() < lvMod.deathSplitChance) {
                this.spawnMiniEnemies(enemy.getX(), enemy.getY(), enemy.getPathIndex(), enemy.getPathPoints(), enemy.getWaveMultiplier(), enemy.getWarpSegments());
            }
        }
        // 防御塔攻击
        this.updateTowers(scaledDelta);
        // 受击表现衰减（白闪 / 击退回位）+ 特效层（弹道、状态粒子、死亡爆散）
        for (const enemy of this.waveManager.getAliveEnemies()) {
            enemy.updateHitFeedback(scaledDelta);
        }
        this.vfx.update(scaledDelta, this.waveManager.getAliveEnemies());
        // 更新全局过载技能
        // 更新全局过载技能（已移除，过载按钮改为特级召唤）
        // 更新防御塔过载状态
        for (const tower of this.towerMergeSystem.getAllTowers()) {
            const wasOverloaded = tower.isOverloaded();
            tower.updateOverload(scaledDelta);
            // 过载结束 → 进入瘫痪，播放故障音
            if (wasOverloaded && !tower.isOverloaded()) {
                this.soundManager.playParalyze();
            }
        }
        // 更新动画效果
        this.updateEffects(scaledDelta);
        // 更新背景粒子
        this.updateBgParticles(scaledDelta);
        // 更新技术美术渲染器
        this.taRenderer.update(scaledDelta);
        // ── 波次强制推进（v1.6）──
        // 用户诉求：「怪物 20s 没有清理完直接开始下一局倒数，不能卡怪卡时间一直清理。」
        // 只在波次进行中累计 —— upgrade_select / summon_select 期间 update() 已经提前
        // return，所以玩家在面板里布防不会烧掉波次时间（那是正当操作，不是卡怪）。
        //
        // ⚠️ **Boss 波没有时限**（NO_WAVE_TIME_LIMIT，用户诉求「最后一关必须场上一个怪
        // 没有的时候才能解锁下一关」）：这一波只会在 spawnQueue 空 + 场上无敌人 +
        // 无待分裂 时自然结束（见 WaveManager.update 的波次结束判定）。
        // 这里显式判断而不是靠 `elapsed >= Infinity` 恒假 —— 后者虽然等价，但读代码的人
        // 看不出"这是故意的"，会以为是漏写。
        if (this.waveTimeLimit !== NO_WAVE_TIME_LIMIT
            && this.waveManager.isWaveActive() && !this.nextWaveCountdownActive) {
            this.waveElapsed += deltaTime;
            if (this.waveElapsed >= this.waveTimeLimit) {
                // 到点：丢弃未出场的敌人，场上残留的继续走（仍有代价、仍能被打死拿钱），
                // 但**波次照常推进** —— 拖延时间的路被彻底堵死。
                if (this.waveManager.forceEndWave()) {
                    this.waveTimedOut = true;
                }
            }
        }
        // 更新下一波倒计时（使用真实时间，不受游戏速度影响）
        if (this.nextWaveCountdownActive) {
            this.nextWaveCountdown -= deltaTime;
            if (this.nextWaveCountdown <= 0) {
                // 倒计时结束，自动开始下一波
                this.nextWaveCountdownActive = false;
                this.nextWaveCountdown = 0;
                this.startNextWave();
            }
            else {
                // 最后 5 秒滴答提示（越接近越急促）
                const sec = Math.ceil(this.nextWaveCountdown);
                if (sec <= 5 && sec !== this.lastCountdownTick) {
                    this.lastCountdownTick = sec;
                    this.soundManager.playCountdownTick(sec <= 3);
                }
            }
        }
        // 检查游戏状态
        if (this.resourceManager.isGameOver()) {
            this.gameState = 'game_over';
            this.waveManager.enterGameOver();
            this.soundManager.setTension(0);
            this.soundManager.setBgm(null);
            this.soundManager.playGameOver();
        }
        else if (this.waveManager.isWaveCleared()) {
            // 波次结束：先发本波的金币奖励（这是每波都有的）
            this.resourceManager.addGold(WAVE_END_GOLD_REWARD);
            const waveGoldBonus = WAVE_END_GOLD_REWARD + this.upgradeSystem.applyWaveEndReward();
            this.soundManager.playWaveClear();
            // 动态音轨：波次结束 → 准备期低通滤波开启（BGM 闷声）
            this.soundManager.setPrepFilter(true);
            // ── 强化机会只在每关通关时给一次（v1.6.2，用户诉求）──
            // 普通波结束只发金币奖励 + 引导 toast，把注意力还给布防。
            // ⚠️ 历史 bug：曾在这里按关内波号 `wave === 10` 判，但每关只有 5 波 → 永假，
            // 强化面板一次都没弹过。通关强化改由下面的 isLevelCleared 分支触发。
            this.gameState = 'playing';
            this.waveManager.exitUpgradePhase();
            // 没有强化机会时给一句明确反馈，否则玩家会以为"升级面板没弹出来 = 出 bug 了"
            this.showEnhanceToast(waveGoldBonus > 0
                ? `波次奖励 +${waveGoldBonus} 金币 · 通关本关可强化 1 次（再 ${this.getEnhanceCountdown()} 波）`
                : `本波无强化机会 · 通关本关可强化（再 ${this.getEnhanceCountdown()} 波）`, waveGoldBonus > 0 ? '#fbbf24' : '#8FA3BF');
            // 超时强制结束的反馈放在最后 —— 它会盖掉上面的"本波无强化机会"，
            // 因为"为什么突然就进下一波了"才是玩家此刻最需要知道的
            if (this.waveTimedOut) {
                this.showEnhanceToast(waveGoldBonus > 0 ? `⏱ 波次超时 · 奖励 +${waveGoldBonus} 金币` : '⏱ 波次超时 · 强制推进下一波', '#FF8A1F');
            }
            // 启动自动推进倒计时（无按钮，到点强制开下一波）
            this.nextWaveCountdown = WAVE_AUTO_ADVANCE_SECONDS;
            this.nextWaveCountdownActive = true;
            this.lastCountdownTick = WAVE_AUTO_ADVANCE_SECONDS + 1;
        }
        else if (this.waveManager.isLevelCleared()) {
            // 本关最后一波清空 —— 每关通关后给且仅给一次强化机会（v1.6.2），
            // 选完才进关卡结算。最后一关（真通关）直接 victory，不再强化。
            // 最后一波使用 level_cleared 状态，不会经过 isWaveCleared 分支，需在此结算一次。
            const waveGoldBonus = WAVE_END_GOLD_REWARD + this.upgradeSystem.applyWaveEndReward();
            if (this.currentLevelIndex + 1 >= getLevelCount()) {
                if (waveGoldBonus > 0)
                    this.showEnhanceToast(`最终波次奖励 +${waveGoldBonus} 金币`, '#fbbf24');
                this.gameState = 'victory';
                this.waveManager.enterVictory();
                this.soundManager.setTension(0);
                this.soundManager.setBgm(null);
                this.soundManager.playVictory();
            }
            else {
                this.upgradeOptions = this.upgradeSystem.generateOptions(this.summonPool);
                this.upgradeNoticeText = '';
                this.levelClearRewardText = `最终波次奖励 +${waveGoldBonus} 金币`;
                this.pendingLevelClearAfterUpgrade = true;
                this.isLevelClearUpgrade = true;
                this.gameState = 'upgrade_select';
                this.waveManager.enterUpgradePhase();
            }
        }
        else if (this.waveManager.isVictory()) {
            this.gameState = 'victory';
            this.soundManager.setTension(0);
            this.soundManager.setBgm(null);
            this.soundManager.playVictory();
        }
    }
    /**
     * 自爆机雷死亡：瘫痪半径内的所有防御塔。
     * 用 playParalyze 而不是新的音效 —— 玩家已经建立了"这个声音 = 我的塔不能打了"
     * 的条件反射（过载结束时也是这个音），复用它比引入新音效更容易理解。
     */
    applyBomberParalyze(x, y, radius, duration) {
        let hit = 0;
        for (const tower of this.towerMergeSystem.getAllTowers()) {
            const d = Math.hypot(tower.getX() - x, tower.getY() - y);
            if (d <= radius) {
                tower.paralyze(duration);
                hit++;
            }
        }
        if (hit > 0) {
            this.soundManager.playParalyze();
            // 用一个明显的红色脉冲标记爆炸范围，让玩家知道是哪座塔被打瘫了
            this.pulseEffects.push({
                x, y, radius: 10, maxRadius: radius,
                alpha: 0.8, color: '#FF4D6D'
            });
        }
    }
    // ── 强化机会（每关通关时一次，v1.6.2 修复）────────────────
    /**
     * 本波结束后是否给强化机会。
     * 强化只在**每关通关时**给一次（用户诉求：每一关只能强化一次，就是这一关通过后），
     * 由 isLevelCleared 分支直接触发，因此这里恒返回 false 是预期行为。
     * ⚠️ 历史 bug：曾按关内波号 `wave === 10` 判，但每关只有 5 波 → 永假 → 强化面板
     * 一次都没弹过。判据必须落在"关内最后一波清空"上，不要按具体波号写死。
     */
    shouldOfferEnhancement() {
        return false;
    }
    /** 距离本关通关（=下一次强化机会）还差几波（0 = 本波通关就有） */
    getEnhanceCountdown() {
        const wave = this.waveManager.getCurrentWave();
        const total = getActiveLevel().waves.length;
        return Math.max(0, total - wave);
    }
    showEnhanceToast(text, color) {
        this.enhanceToastText = text;
        this.enhanceToastColor = color;
        this.enhanceToast = 3.0;
    }
    startNextWave() {
        // 取消倒计时
        this.nextWaveCountdownActive = false;
        this.nextWaveCountdown = 0;
        // 开始下一波
        this.waveManager.startNextWave();
        this.gameState = 'playing';
        this.resetWaveClock();
        // 波次开始音效 + 张力提升
        const wave = this.waveManager.getCurrentWave();
        this.soundManager.playWaveStart();
        this.updateTension();
        // 动态音轨：出怪 → 关闭低通滤波（BGM 恢复清亮 + 叠加节奏鼓点）
        this.soundManager.setPrepFilter(false);
        // Boss 波额外提示（由波次配置的 archetype 决定，不再是硬编码第10波）
        if (isBossWave(wave)) {
            this.soundManager.setBgm('boss');
            this.soundManager.playBossSpawn();
            this.bossWarningTimer = 2.0; // 显示2秒红色警告
        }
        else {
            // 普通波：按关卡档位选 BGM（L1-3 轻 / L4-7 中 / L8-10 重）
            this.soundManager.setLevelTier(this.currentLevelIndex);
        }
    }
    /** 根据关卡进度与剩余生命值更新音乐张力（0~1） */
    updateTension() {
        const wave = this.waveManager.getCurrentWave();
        // 张力要反映「整局游戏」的进度，而不是当前关卡内的进度 ——
        // 否则每进一关音乐张力都会掉回起点，第 3 关听起来和第 1 关一样轻松。
        const totalWavesAllLevels = Math.max(1, LEVELS.reduce((sum, level) => sum + level.waves.length, 0));
        const overall = getGlobalWave(this.currentLevelIndex, wave);
        const waveRatio = Math.min(1, Math.max(0, overall / totalWavesAllLevels));
        const lives = this.resourceManager.getLives();
        const maxLives = this.resourceManager.getMaxLives();
        const lifeRatio = maxLives > 0 ? lives / maxLives : 1;
        const danger = 1 - Math.min(1, Math.max(0, lifeRatio));
        // 波次权重 0.6 + 危险度权重 0.4
        this.soundManager.setTension(waveRatio * 0.6 + danger * 0.4);
    }
    /**
     * 修复：精英爆炸效果
     */
    applyEliteExplosion(x, y) {
        const explosionRadius = 80;
        const explosionDamage = 50;
        const enemies = this.waveManager.getAliveEnemies();
        for (const enemy of enemies) {
            if (!enemy.isAlive())
                continue;
            const dx = enemy.getX() - x;
            const dy = enemy.getY() - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= explosionRadius) {
                enemy.takeDamage(explosionDamage);
            }
        }
        // 添加爆炸特效
        this.mergeEffects.push({ x, y, time: 0 });
    }
    /**
     * 修复：正确生成分裂小怪
     * 使用 Enemy 的正式方法设置位置和路径进度
     */
    spawnMiniEnemies(x, y, pathIndex, pathPoints = PATH_POINTS, waveMultiplier = 1, warps = []) {
        // 通知波次管理器即将生成2个分裂怪
        this.waveManager.addPendingSplit(2);
        const enemies = this.waveManager.getEnemies();
        for (let i = 0; i < 2; i++) {
            // 传送门段号必须一起继承：否则子体会把传送段当成普通路面，
            // 从传送门入口一路"走"到出口，凭空多出一段不存在的走廊。
            const mini = new Enemy(EnemyType.MINI, waveMultiplier, pathPoints, undefined, this.currentLevelIndex, warps);
            // 使用正式方法设置位置和路径进度
            const offsetX = (Math.random() - 0.5) * 30;
            const offsetY = (Math.random() - 0.5) * 30;
            mini.setPositionAndPathIndex(x + offsetX, y + offsetY, pathIndex);
            enemies.push(mini);
        }
        // 确认分裂怪已生成
        this.waveManager.confirmSplitSpawned(2);
    }
    /** Boss技能有统一预警和冷却；普通护卫不会继承Boss技能。 */
    updateBossSkills(deltaTime) {
        for (const boss of this.waveManager.getAliveEnemies()) {
            if (!isBossType(boss.getType()) || !boss.getBossSkill())
                continue;
            const charging = boss.isBossSkillCharging();
            const cast = boss.consumeBossSkillPulse(deltaTime);
            if (!charging && boss.isBossSkillCharging()) {
                const previews = {
                    emp_stun: 'EMP瘫痪预警：最近的炮塔将被瘫痪3秒',
                    overload_aura: '过载气场预警：周围炮塔攻速将下降',
                    energy_shield: '能量护盾预警：Boss将获得护盾并免控',
                    gold_drain: '金币汲取预警：Boss将抽取大量金币',
                    earthquake: '震撼重击预警：全场炮塔将受到伤害并震晕',
                    silence_field: '全域沉默预警：所有炮塔技能将被禁止',
                    time_stop: '时空停滞预警：所有炮塔将完全停止',
                    death_ray: '毁灭射线预警：最强炮塔将被摧毁',
                    eclipse_protocol: '日蚀协议预警：全场炮塔将被削弱'
                };
                this.showEnhanceToast(`⚠ ${previews[boss.getBossSkill()] || 'Boss技能蓄能中'}`, '#ff6b8a');
            }
            if (cast)
                this.castBossSkill(boss);
        }
    }
    castBossSkill(boss) {
        const towers = this.towerMergeSystem.getAllTowers();
        const skill = boss.getBossSkill();
        const skillLabels = {
            emp_stun: '局部干扰',
            overload_aura: '战术过载',
            energy_shield: '能量护盾',
            gold_drain: '金币汲取',
            earthquake: '震撼重击',
            silence_field: '规则篡改',
            time_stop: '时空停滞',
            death_ray: '毁灭射线',
            eclipse_protocol: '日蚀协议'
        };
        switch (skill) {
            case 'emp_stun': {
                // L1: 锁定离 Boss 最近的 1 座炮塔，使其瘫痪 3 秒
                const targets = [...towers].sort((a, b) => Math.hypot(a.getX() - boss.getX(), a.getY() - boss.getY()) -
                    Math.hypot(b.getX() - boss.getX(), b.getY() - boss.getY()));
                if (targets.length > 0) {
                    targets[0].paralyze(3.0);
                    this.showEnhanceToast(`Boss发动「局部干扰」：瘫痪最近的炮塔`, '#ff6b8a');
                }
                return;
            }
            case 'overload_aura': {
                // L2: 半径 600px 以内的所有炮塔攻击速度 -40%，持续 5 秒
                const radius = 600;
                for (const tower of towers) {
                    const dist = Math.hypot(tower.getX() - boss.getX(), tower.getY() - boss.getY());
                    if (dist <= radius) {
                        tower.slowAttacks(5.0, 1.67); // 攻速 -40%
                    }
                }
                this.showEnhanceToast(`Boss发动「战术过载」：周围炮塔攻速 -40%`, '#ff6b8a');
                return;
            }
            case 'energy_shield': {
                // L3: 血量低于 50% 时获得 50% 最大血量的护盾，免控 6 秒
                const maxHp = boss.getMaxHp();
                const currentHp = boss.getHp();
                if (currentHp < maxHp * 0.5) {
                    const shieldAmount = maxHp * 0.5;
                    boss.applyShield(shieldAmount);
                    boss.applyTimedSpeedBoost(1.0, 6.0); // 免控效果（通过速度不变实现）
                    this.showEnhanceToast(`Boss发动「能量护盾」：获得 ${Math.floor(shieldAmount)} 点护盾`, '#ff6b8a');
                }
                return;
            }
            case 'gold_drain': {
                // L4: 抽取玩家 150 金币，不足部分转化为护盾
                const gold = this.resourceManager.getGold();
                const drainAmount = 150;
                if (gold >= drainAmount) {
                    this.resourceManager.spendGold(drainAmount);
                    this.showEnhanceToast(`Boss发动「金币汲取」：抽取 ${drainAmount} 金币`, '#ff6b8a');
                }
                else {
                    this.resourceManager.setGold(0);
                    const shortage = drainAmount - gold;
                    const shieldFromShortage = shortage * 15;
                    boss.applyShield(shieldFromShortage);
                    this.showEnhanceToast(`Boss发动「金币汲取」：抽取 ${gold} 金币，获得 ${Math.floor(shieldFromShortage)} 点护盾`, '#ff6b8a');
                }
                return;
            }
            case 'earthquake': {
                // L5: 全场炮塔震晕 2 秒
                for (const tower of towers) {
                    tower.paralyze(2.0);
                }
                this.showEnhanceToast(`Boss发动「震撼重击」：全场炮塔震晕 2 秒`, '#ff6b8a');
                return;
            }
            case 'silence_field': {
                // L6: 全场炮塔进入沉默状态，禁止释放任何技能，持续 6 秒
                for (const tower of towers) {
                    tower.silenceSkills(6.0);
                }
                this.showEnhanceToast(`Boss发动「规则篡改」：全场炮塔沉默 6 秒`, '#ff6b8a');
                return;
            }
            case 'time_stop': {
                // L7: 所有炮塔完全停止攻击 3.5 秒，同时全场小怪 +40% 移动速度
                for (const tower of towers) {
                    tower.paralyze(3.5);
                }
                for (const enemy of this.waveManager.getAliveEnemies()) {
                    if (!isBossType(enemy.getType())) {
                        enemy.applyTimedSpeedBoost(1.4, 3.5);
                    }
                }
                this.showEnhanceToast(`Boss发动「时空停滞」：全场静止 3.5 秒`, '#ff6b8a');
                return;
            }
            case 'death_ray': {
                // L8: 锁定全场输出最高的 1 座炮塔，2 秒蓄力后摧毁
                const target = [...towers].sort((a, b) => {
                    const aDps = a.getDamage() / a.getAttackInterval();
                    const bDps = b.getDamage() / b.getAttackInterval();
                    return bDps - aDps;
                })[0];
                if (target) {
                    target.paralyze(2.0); // 蓄力期间无法移动
                    // 2 秒后摧毁炮塔：造成 1000 点伤害（炮塔默认 100 HP，必定摧毁）
                    setTimeout(() => {
                        if (target && !target.isDestroyed()) {
                            target.takeDamage(1000);
                            this.showEnhanceToast(`Boss发动「毁灭射线」：最强炮塔被摧毁！`, '#ff6b8a');
                        }
                    }, 2000);
                    this.showEnhanceToast(`Boss发动「毁灭射线」：锁定最强炮塔，2 秒后摧毁`, '#ff6b8a');
                }
                return;
            }
            case 'eclipse_protocol': {
                // L9: 双阶段技能
                // 一阶段（100%-50% HP）：全场炮塔攻速 -50%，范围 -50%
                // 二阶段（< 50% HP）：一阶段效果 + 随机 2 座炮塔被锁定 15 秒
                const hpPercent = boss.getHp() / boss.getMaxHp();
                if (hpPercent > 0.5) {
                    // 一阶段
                    for (const tower of towers) {
                        tower.slowAttacks(8.0, 2.0); // 攻速 -50%，持续 8 秒
                        tower.reduceRange(0.5, 8.0); // 范围 -50%，持续 8 秒
                    }
                    this.showEnhanceToast(`Boss发动「日蚀协议·一阶段」：全场炮塔攻速 -50%，范围 -50%`, '#ff6b8a');
                }
                else {
                    // 二阶段：一阶段效果 + 随机 2 座炮塔被锁定
                    for (const tower of towers) {
                        tower.slowAttacks(8.0, 2.0); // 攻速 -50%，持续 8 秒
                        tower.reduceRange(0.5, 8.0); // 范围 -50%，持续 8 秒
                    }
                    const shuffled = [...towers].sort(() => Math.random() - 0.5);
                    const targets = shuffled.slice(0, 2);
                    for (const tower of targets) {
                        tower.paralyze(15.0); // 锁定 15 秒
                    }
                    this.showEnhanceToast(`Boss发动「日蚀协议·二阶段」：全场削弱 + 2 座炮塔被锁定`, '#ff6b8a');
                }
                return;
            }
        }
        this.showEnhanceToast(`Boss发动「${skillLabels[skill || ''] || '特殊协议'}」`, '#ff6b8a');
    }
    /**
     * 确保场上每座塔都拿到表现出口。
     * 合成/换关后会造新塔，这里逐帧补一次（`setVfxSink` 幂等，开销是一次引用赋值）。
     */
    injectVfxSink() {
        for (const tower of this.towerMergeSystem.getAllTowers()) {
            tower.setVfxSink(this.vfxSink);
        }
    }
    updateTowers(deltaTime) {
        const enemies = this.waveManager.getAliveEnemies();
        for (const tower of this.towerMergeSystem.getAllTowers()) {
            tower.updateRecoil(deltaTime);
            const target = tower.findTarget(enemies);
            if (target && tower.canAttack(this.gameTime)) {
                // selectTargets 处理「多重射击」—— 一座塔可以同时打好几个目标
                const targets = tower.selectTargets(enemies, target);
                tower.attackTargets(targets, this.gameTime, enemies);
                // 播放攻击音效（按防御塔 X 坐标做立体声定位）
                this.playTowerAttackSound(tower.getType(), this.panFromX(tower.getX()));
                // 命中反馈（按目标体型改变音色）
                this.soundManager.playEnemyHit(this.panFromX(target.getX()), target.getSize());
                // 视觉表现已整体交给 VfxSystem（枪口火光 → 弹道飞行 → 命中溅射）。
                // 旧版"一条拖尾直线"在有了真实弹道后属于重复绘制，已移除——
                // 两条线叠在一条飞行轨迹上只会让画面更脏。
                tower.setVfxSink(this.vfxSink);
            }
            // 技能计时器（消失、聚焦衰减）
            tower.updateSkills(deltaTime);
        }
    }
    updateEffects(deltaTime) {
        this.attackEffects = this.attackEffects.filter(e => {
            e.time += deltaTime;
            return e.time < 0.2;
        });
        this.mergeEffects = this.mergeEffects.filter(e => {
            e.time += deltaTime;
            return e.time < 0.5;
        });
        // UP 特效比合成光环活得久（1.15s vs 0.5s）—— 混战里玩家需要更长时间
        // 才能注意到"我这座塔升级了"，顺便把新等级的数字看清楚。
        this.levelUpFlashes = this.levelUpFlashes.filter(f => {
            f.time += deltaTime;
            return f.time < GameManager.LEVEL_UP_FX_DURATION;
        });
        // 技能飘字活得再久一点（1.8s）：要让玩家把技能名读完
        this.skillGainToasts = this.skillGainToasts.filter(t => {
            t.time += deltaTime;
            return t.time < GameManager.SKILL_TOAST_DURATION;
        });
        this.animTime += deltaTime;
    }
    // 渲染
    render() {
        const ctx = this.ctx;
        // 分层背景：地面 + 陈设（按关卡主题烘焙，切关自动重建）
        const lvBg = getActiveLevel();
        this.env.renderBackdrop(levelKeyOf(lvBg.id), lvBg.accent);
        if (this.gameState === 'menu') {
            this.renderMenu();
            return;
        }
        if (this.gameState === 'opening') {
            this.renderOpening();
            return;
        }
        // 教程：先画它背后的那一层（战场 / 召唤面板 / 菜单），再压半透明面板
        if (this.gameState === 'tutorial') {
            if (this.tutorialReturn === 'menu') {
                this.renderMenu();
            }
            else {
                this.renderGame();
                if (this.tutorialReturn === 'summon_select')
                    this.renderSummonSelect();
            }
            renderTutorial(ctx, this.canvas.width, this.canvas.height, this.tutorialPage, this.tutorialElapsed);
            return;
        }
        this.renderGame();
        if (this.gameState === 'upgrade_select') {
            this.renderUpgradeSelect();
        }
        else if (this.gameState === 'summon_select') {
            this.renderSummonSelect();
        }
        else if (this.gameState === 'level_clear') {
            this.renderLevelClear();
        }
        else if (this.gameState === 'game_over') {
            this.renderGameOver();
        }
        else if (this.gameState === 'victory') {
            this.renderVictory();
        }
        // 升级 UP! 特效：画在所有面板之上（见 renderLevelUpFlashes 的注释）。
        // 跟着世界层的震屏一起位移，但不受面板遮罩影响。
        ctx.save();
        const sh = this.vfx.getShakeOffset();
        if (sh.x !== 0 || sh.y !== 0)
            ctx.translate(sh.x, sh.y);
        this.renderLevelUpFlashes();
        this.renderSkillGainToasts();
        ctx.restore();
    }
    renderBgParticles() {
        const ctx = this.ctx;
        for (const p of this.bgParticles) {
            // 赛博氛围粒子：青 / 紫交替
            ctx.fillStyle = p.size > 1.6
                ? `rgba(157, 0, 255, ${p.alpha})`
                : `rgba(0, 240, 255, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    updateBgParticles(deltaTime) {
        for (const p of this.bgParticles) {
            p.y -= p.speed * deltaTime * 10;
            p.x += p.drift * deltaTime * 10;
            // 超出屏幕后重置
            if (p.y < -10) {
                p.y = this.canvas.height + 10;
                p.x = Math.random() * this.canvas.width;
            }
            if (p.x < -10)
                p.x = this.canvas.width + 10;
            if (p.x > this.canvas.width + 10)
                p.x = -10;
        }
    }
    /**
     * 主菜单：赛博标题 + 霓虹装饰框 + 切角开始按钮。
     */
    renderMenu() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const t = this.gameTime;
        // ── 标题装饰框（切角 + 四角标记） ──
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.30)';
        ctx.lineWidth = 1;
        cutRectPath(ctx, 40, 128, this.canvas.width - 80, 208, 18);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
        cutRectPath(ctx, 50, 138, this.canvas.width - 100, 188, 15);
        ctx.stroke();
        ctx.restore();
        // 四角亮块
        ctx.fillStyle = CYBER.cyan;
        const corners = [
            [40, 128, 1, 1], [this.canvas.width - 40, 128, -1, 1],
            [40, 336, 1, -1], [this.canvas.width - 40, 336, -1, -1]
        ];
        for (const [x, y, sx, sy] of corners) {
            ctx.fillRect(x, y - (sy > 0 ? 0 : 3), 3 * sx, 3);
            ctx.fillRect(x - (sx > 0 ? 0 : 3), y, 3, 3 * sy);
        }
        // ── 标题：双层霓虹 + 轻微故障偏移 ──
        const glitch = Math.sin(t * 7.3) > 0.86 ? 2.5 : 0;
        ctx.save();
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 品红残影
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = CYBER.red;
        ctx.fillText('赛博防线', cx + 2 + glitch, 182);
        // 青色残影
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = CYBER.cyan;
        ctx.fillText('赛博防线', cx - 2 - glitch, 182);
        ctx.globalAlpha = 1;
        ctx.restore();
        neonText(ctx, '赛博防线', cx, 182, CYBER.cyan, { blur: 16, font: 'bold 34px sans-serif' });
        neonText(ctx, '机械入侵', cx, 226, CYBER.purple, { blur: 16, font: 'bold 34px sans-serif' });
        // ── 副标题 ──
        ctx.fillStyle = CYBER.textMid;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('防御塔合成 × 随机强化 × 赛博塔防', cx, 282);
        // ── 装饰性数据条 ──
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const y = 306 + i * 8;
            const w = 60 + Math.sin(t * 1.4 + i * 1.7) * 34;
            ctx.fillStyle = i === 1 ? CYBER.purple : CYBER.cyan;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(cx - w / 2, y, w, 2);
        }
        ctx.restore();
        // ── 开始 / 教程 两个主按钮（位置见 MENU_BUTTONS，点击判定共用）──
        const drawMenuButton = (r, label, color, glow) => {
            const breathe = 0.55 + Math.sin(t * 2.4) * 0.25;
            ctx.save();
            if (glow) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 18 * breathe;
            }
            ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
            cutRectPath(ctx, r.x, r.y, r.w, r.h, 14);
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = glow
                ? `rgba(0, 240, 255, ${breathe.toFixed(3)})`
                : 'rgba(157, 0, 255, 0.55)';
            ctx.lineWidth = 2;
            cutRectPath(ctx, r.x, r.y, r.w, r.h, 14);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.20)';
            ctx.lineWidth = 1;
            cutRectPath(ctx, r.x + 5, r.y + 5, r.w - 10, r.h - 10, 11);
            ctx.stroke();
            neonText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, color, { blur: glow ? 10 : 6, font: 'bold 20px sans-serif' });
        };
        drawMenuButton(MENU_BUTTONS.start, '开始游戏', CYBER.cyan, true);
        drawMenuButton(MENU_BUTTONS.tutorial, '游戏教程', CYBER.purple, false);
        // ── 玩法速览：把新手需要做的三件事放在主按钮下方，避免压缩标题区 ──
        const tipX = 48, tipY = 480, tipW = this.canvas.width - 96, tipH = 166;
        ctx.fillStyle = 'rgba(7, 13, 23, 0.82)';
        cutRectPath(ctx, tipX, tipY, tipW, tipH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.32)';
        ctx.lineWidth = 1;
        cutRectPath(ctx, tipX, tipY, tipW, tipH, 12);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = CYBER.cyan;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('作战简报  /  QUICK BRIEF', tipX + 18, tipY + 23);
        const tips = [
            ['01  合成炮塔', '同类型同等级的塔拖到一起就能升级（最高 Lv5）'],
            ['02  升级得技能', '每升 1 级自动发 1 个技能，满级共 4 个'],
            ['03  守到第 10 波', '10 波后是 Boss，通关可强化并把塔带进下一关'],
        ];
        tips.forEach(([title, detail], i) => {
            const y = tipY + 54 + i * 32;
            ctx.fillStyle = i === 2 ? CYBER.gold : CYBER.purple;
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(title, tipX + 18, y);
            ctx.fillStyle = CYBER.textMid;
            ctx.font = '12px sans-serif';
            ctx.fillText(detail, tipX + 108, y, tipW - 124);
            if (i < tips.length - 1) {
                ctx.fillStyle = 'rgba(143, 163, 191, 0.14)';
                ctx.fillRect(tipX + 18, y + 16, tipW - 36, 1);
            }
        });
        // ── 底部版本 / 提示 ──
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('9 关战役  ·  10 种炮塔  ·  4 种品阶  ·  120 种塔技', cx, this.canvas.height - 96);
        ctx.fillText('第一次玩会自动弹出教程；之后点上面「游戏教程」随时再看', cx, this.canvas.height - 78);
        // 右上角静音开关
        this.renderMuteButton();
    }
    /** 赛博防线启动序幕：扫描网格、核心点亮、敌方入侵警报，最后自动进入第一波。 */
    renderOpening() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        const t = this.openingElapsed;
        const cx = W / 2;
        const progress = Math.min(1, t / 3.6);
        // 深色背景 + 扫描线
        ctx.fillStyle = '#030710';
        ctx.fillRect(0, 0, W, H);
        // 数据雨效果（矩阵风格）
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.font = '10px monospace';
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ';
        for (let i = 0; i < 30; i++) {
            const x = (i * 17 + 5) % W;
            const speed = 40 + (i % 5) * 15;
            const y = ((t * speed + i * 73) % (H + 100)) - 50;
            const charIdx = Math.floor((t * 8 + i * 3) % chars.length);
            ctx.fillStyle = i % 4 === 0 ? CYBER.purple : CYBER.cyan;
            ctx.fillText(chars[charIdx], x, y);
        }
        ctx.restore();
        // 六边形网格背景
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = CYBER.cyan;
        ctx.lineWidth = 0.5;
        const hexSize = 32;
        const hexH = hexSize * Math.sqrt(3);
        for (let row = -1; row < H / hexH + 1; row++) {
            for (let col = -1; col < W / (hexSize * 1.5) + 1; col++) {
                const x = col * hexSize * 1.5;
                const y = row * hexH + (col % 2) * hexH / 2;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 6;
                    const px = x + hexSize * Math.cos(angle);
                    const py = y + hexSize * Math.sin(angle);
                    if (i === 0)
                        ctx.moveTo(px, py);
                    else
                        ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.restore();
        // 扫描线
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const scanY = (t * 180) % H;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.15 + Math.sin(t * 10) * 0.05})`;
        ctx.fillRect(0, scanY, W, 2);
        ctx.fillStyle = `rgba(157, 0, 255, ${0.1 + Math.sin(t * 8 + 1) * 0.05})`;
        ctx.fillRect(0, (scanY + H / 3) % H, W, 1);
        ctx.restore();
        // 中央核心 - 旋转的六边形
        const coreY = H * 0.38;
        const pulse = 0.5 + Math.sin(t * 6) * 0.5;
        const coreSize = 45 + pulse * 8;
        ctx.save();
        ctx.translate(cx, coreY);
        ctx.rotate(t * 0.3);
        // 外圈光环
        for (let i = 0; i < 3; i++) {
            const radius = coreSize + 20 + i * 15;
            const alpha = 0.4 - i * 0.1;
            ctx.strokeStyle = i % 2 === 0 ? `rgba(0, 240, 255, ${alpha})` : `rgba(157, 0, 255, ${alpha})`;
            ctx.lineWidth = 2 - i * 0.5;
            ctx.beginPath();
            const startAngle = t * (i % 2 === 0 ? 1 : -0.7);
            ctx.arc(0, 0, radius, startAngle, startAngle + Math.PI * 1.3);
            ctx.stroke();
        }
        // 核心六边形
        ctx.shadowColor = CYBER.cyan;
        ctx.shadowBlur = 20 + pulse * 15;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.6 + pulse * 0.3})`;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const x = Math.cos(angle) * coreSize;
            const y = Math.sin(angle) * coreSize;
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        // 内部细节
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#030710';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const x = Math.cos(angle) * (coreSize * 0.6);
            const y = Math.sin(angle) * (coreSize * 0.6);
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        // 粒子环绕
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
            const angle = (Math.PI * 2 * i) / 16 + t * 0.8;
            const radius = 80 + Math.sin(t * 3 + i) * 15;
            const x = cx + Math.cos(angle) * radius;
            const y = coreY + Math.sin(angle) * radius;
            const alpha = 0.5 + Math.sin(t * 5 + i * 0.5) * 0.3;
            ctx.fillStyle = i % 3 === 0 ? `rgba(157, 0, 255, ${alpha})` : `rgba(0, 240, 255, ${alpha})`;
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        ctx.restore();
        // 顶部副标题
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const subAlpha = Math.max(0, Math.min(1, (t - 0.2) / 0.4));
        ctx.save();
        ctx.globalAlpha = subAlpha;
        ctx.fillStyle = CYBER.textLow;
        ctx.font = 'bold 11px monospace';
        ctx.fillText('NEURAL LINK // DEFENSE NETWORK', cx, 160);
        ctx.restore();
        // 主标题 - 带色差效果
        const titleAlpha = Math.max(0, Math.min(1, (t - 0.5) / 0.6));
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        // 色差效果 - 红蓝偏移
        const glitchOffset = Math.sin(t * 25) > 0.95 ? 2 : 0;
        const chromaOffset = 1.5 + Math.sin(t * 4) * 0.5;
        // 红色偏移层
        ctx.fillStyle = `rgba(255, 50, 100, ${0.3 * titleAlpha})`;
        ctx.font = 'bold 38px sans-serif';
        ctx.fillText('赛博防线', cx - chromaOffset + glitchOffset, 230);
        // 蓝色偏移层
        ctx.fillStyle = `rgba(0, 200, 255, ${0.3 * titleAlpha})`;
        ctx.fillText('赛博防线', cx + chromaOffset + glitchOffset, 230);
        // 主层
        neonText(ctx, '赛博防线', cx + glitchOffset, 230, CYBER.cyan, { blur: 20, font: 'bold 38px sans-serif' });
        ctx.restore();
        // 副标题
        const sub2Alpha = Math.max(0, Math.min(1, (t - 0.9) / 0.5));
        ctx.save();
        ctx.globalAlpha = sub2Alpha;
        ctx.fillStyle = CYBER.purple;
        ctx.font = 'bold 16px sans-serif';
        ctx.shadowColor = CYBER.purple;
        ctx.shadowBlur = 8;
        ctx.fillText('机 械 入 侵', cx, 275);
        ctx.restore();
        // 分隔线
        const lineAlpha = Math.max(0, Math.min(1, (t - 1.1) / 0.3));
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = CYBER.cyan;
        ctx.lineWidth = 1;
        ctx.shadowColor = CYBER.cyan;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx - 80, 300);
        ctx.lineTo(cx + 80, 300);
        ctx.stroke();
        ctx.restore();
        // 分阶段播报信息 - 固定位置，避免重叠
        const messageY1 = 540;
        const messageY2 = 570;
        let msg1 = '', msg2 = '', msg1Color = CYBER.textHi, msg2Color = CYBER.textMid;
        if (t < 1.2) {
            const a = Math.max(0, Math.min(1, (t - 1.0) / 0.2));
            msg1 = '正在扫描城市网络…';
            msg2 = '同步节点与防御塔数据';
            ctx.save();
            ctx.globalAlpha = a;
        }
        else if (t < 2.2) {
            const a = Math.max(0, Math.min(1, (t - 1.2) / 0.2));
            msg1 = '主核心上线';
            msg2 = '能源护盾正在充能';
            ctx.save();
            ctx.globalAlpha = a;
        }
        else if (t < 3.0) {
            const a = Math.max(0, Math.min(1, (t - 2.2) / 0.2));
            msg1 = '多路异常信号接近';
            msg2 = '机械军团正在突破外环';
            msg1Color = CYBER.red;
            ctx.save();
            ctx.globalAlpha = a;
        }
        else {
            const a = Math.max(0, Math.min(1, (t - 3.0) / 0.2));
            msg1 = '防线已就绪';
            msg2 = '守住核心，开始迎击';
            msg1Color = CYBER.cyan;
            ctx.save();
            ctx.globalAlpha = a;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = msg1Color;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(msg1, cx, messageY1);
        ctx.fillStyle = msg2Color;
        ctx.font = '13px sans-serif';
        ctx.fillText(msg2, cx, messageY2);
        ctx.restore();
        // 进度条
        const barW = 220;
        const barY = 660;
        const barH = 4;
        // 进度条背景
        ctx.fillStyle = 'rgba(143, 163, 191, 0.15)';
        ctx.fillRect(cx - barW / 2, barY, barW, barH);
        // 进度条填充
        const barColor = t >= 2.2 && t < 3.0 ? CYBER.red : CYBER.cyan;
        ctx.save();
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = barColor;
        ctx.fillRect(cx - barW / 2, barY, barW * progress, barH);
        ctx.restore();
        // 进度百分比
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`LINK ${Math.floor(progress * 100).toString().padStart(3, '0')}%`, cx, barY + 22);
        // 跳过提示
        const skipAlpha = 0.4 + Math.sin(t * 3) * 0.2;
        ctx.save();
        ctx.globalAlpha = skipAlpha;
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.fillText('点击画面跳过序幕', cx, H - 50);
        ctx.restore();
    }
    renderGame() {
        this.renderMap();
        // 震屏：世界层整体偏移，HUD 不动。
        // 只在爆炸/大伤害/死亡时触发，幅度上限 14px，不会让人晕。
        const sh = this.vfx.getShakeOffset();
        const ctx = this.ctx;
        ctx.save();
        if (sh.x !== 0 || sh.y !== 0)
            ctx.translate(sh.x, sh.y);
        this.renderTowers();
        this.renderEnemies();
        // 战斗特效：焦痕 → 弹道 → 粒子 → 光束 → 冲击环 → 光闪
        this.vfx.renderWorld(ctx);
        // 旧版线性拖尾特效（保留作轻量补充，弹道的主视觉见 VfxSystem）
        this.renderEffects();
        ctx.restore();
        // 环境前景：顶灯光池 + 光锥 + 氛围粒子（压在单位上才有"灯照下来"的纵深）
        this.env.renderOverlay();
        // 核心永远处于最上层，避免被敌人、炮塔、光效或环境前景遮住。
        this.renderCoreOverlay();
        // 后处理（暗角）只作用于世界层，必须在 HUD 之前执行。
        // 之前它在整个 render() 的最后调用，连金币、生命值、波次预告条一起压暗：
        // 暗角在屏幕边缘是 rgba(0,0,0,0.3)，而预告条正好贴在顶部边缘，
        // 标题 #fbbf24 (251,191,36) 被削成 (175,133,25) —— 亮度只剩 70%，
        // 玩家要在最需要看清的地方读最暗的字。后处理不该碰 UI。
        this.taRenderer.renderPostProcessing();
        // 飘字（伤害数字）跟着世界层一起被震动，但要在 UI 之上才看得清
        ctx.save();
        if (sh.x !== 0 || sh.y !== 0)
            ctx.translate(sh.x, sh.y);
        this.vfx.renderOverlay(ctx);
        ctx.restore();
        this.renderUI();
        // 渲染Boss警告横幅
        if (this.bossWarningTimer > 0) {
            this.renderBossWarning();
        }
        // 渲染防御塔信息面板
        if (this.showTowerInfo && this.towerInfoTower) {
            this.renderTowerInfoPanel();
        }
    }
    renderMap() {
        // 使用技术美术渲染器绘制路径、入口、核心和格子
        // 路径辉光用当前关卡的主题色，三张地图在地面上一眼可辨
        const routes = PATH_ROUTES.length ? PATH_ROUTES : [PATH_POINTS];
        const accent = getActiveLevel().accent;
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const warps = PATH_WARP_SEGMENTS[i] ?? [];
            this.taRenderer.renderPath(route, accent, warps);
            this.taRenderer.renderEntry(route[0].x, route[0].y);
            // 传送门：每段的入口端与出口端各画一个，交代"这里被折叠了"
            for (const seg of warps) {
                const from = route[seg];
                const to = route[seg + 1];
                if (from)
                    this.taRenderer.renderTeleporter(from.x, from.y, accent);
                if (to)
                    this.taRenderer.renderTeleporter(to.x, to.y, accent);
            }
        }
        // 渲染随机传送门网络（L6/L7/L8）
        for (const portal of ACTIVE_PORTALS) {
            this.taRenderer.renderPortal(portal.x, portal.y, portal.label, portal.color);
        }
        // 绘制防御塔格子
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
            const slot = TOWER_SLOTS[i];
            const isSelected = this.selectedSlot === i;
            this.taRenderer.renderTowerSlot(slot.x, slot.y, slot.occupied, isSelected);
        }
        // 渲染迷雾禁区（L8）—— 必须在道路之后渲染，否则会被道路盖住
        for (const fog of ACTIVE_FOG_ZONES) {
            this.taRenderer.renderFog(fog.x, fog.y, fog.w, fog.h);
        }
    }
    renderCoreOverlay() {
        const level = getActiveLevel();
        const routes = PATH_ROUTES.length ? PATH_ROUTES : [PATH_POINTS];
        const cores = level.core ? [level.core] : routes.map(route => route[route.length - 1]).filter(Boolean);
        const rendered = new Set();
        for (const core of cores) {
            const key = `${core.x},${core.y}`;
            if (rendered.has(key))
                continue;
            this.taRenderer.renderCore(core.x, core.y);
            rendered.add(key);
        }
    }
    /**
     * 这张召唤卡能升级的同类目标（战场塔 + 合成区卡）。
     *
     * 判据与 `Tower.canMergeWith` 严格一致：**同类型 + 同等级 + 未满级**。
     * 召唤出来的卡永远是 Lv1，所以实际上就是"找场上的 Lv1 同名塔/卡"。
     *
     * 为什么不按"同类就标"来写：Lv1 的卡合不掉 Lv3 的塔 —— 标了就是骗玩家，
     * 玩家照着标记去拖却合不了，比不标还糟。
     */
    findUpgradeTargets(type) {
        const out = [];
        const isMergeable = (t) => t.getType() === type && t.getLevel() === 1 && t.getLevel() < MAX_TOWER_LEVEL;
        for (const t of this.towerMergeSystem.getAllTowers()) {
            if (isMergeable(t))
                out.push({ x: t.getX(), y: t.getY(), inMergeArea: false });
        }
        for (const slot of this.mergeAreaSlots) {
            if (slot.tower && isMergeable(slot.tower)) {
                out.push({ x: slot.x, y: slot.y, inMergeArea: true });
            }
        }
        return out;
    }
    /**
     * 场上"同类型"的可继续培养塔（战场 + 合成区），满级塔不做重复标记。
     *
     * 与 `findUpgradeTargets` 的区别：那个只找 Lv1（买下这张卡能直接自动升级的），
     * 满级塔没有可合成目标，不应造成误导；玩家买入同名 Lv1 后再显示可升级标记。
     * 于是面板里会出现两档信息：
     *   · 有 Lv1 同类 → `▲ 可升级 ×N`（绿，买下立刻变 Lv2）
     *   · 只有 Lv2/Lv3 同类 → `◆ 同类 ×N`（青，可手动与同等级塔合成）
     *   · 只有满级塔 → 不标记
     */
    findSameTypeTargets(type) {
        const out = [];
        for (const t of this.towerMergeSystem.getAllTowers()) {
            if (t.getType() === type && t.getLevel() < MAX_TOWER_LEVEL) {
                out.push({ x: t.getX(), y: t.getY(), inMergeArea: false });
            }
        }
        for (const slot of this.mergeAreaSlots) {
            if (slot.tower && slot.tower.getType() === type && slot.tower.getLevel() < MAX_TOWER_LEVEL) {
                out.push({ x: slot.x, y: slot.y, inMergeArea: true });
            }
        }
        return out;
    }
    /**
     * 当前召唤面板里所有卡的可升级目标类型集合。
     * 非召唤态返回 null —— 调用方据此决定要不要画高亮（战场高亮只在选卡时出现）。
     */
    getSummonUpgradeTypes() {
        if (this.gameState !== 'summon_select')
            return null;
        const currentOptions = this.isPremiumSummonMode ? this.premiumSummonOptions : this.normalSummonOptions;
        if (currentOptions.length === 0)
            return null;
        const types = new Set();
        for (const opt of currentOptions) {
            if (this.findUpgradeTargets(opt.type).length > 0)
                types.add(opt.type);
        }
        return types;
    }
    /**
     * 召唤面板里"场上有同类、但没有一个能自动升级"的类型集合（弱一档的青色标记）。
     * 只有可升级优先 —— 一个类型不会同时出现在两个集合里，避免卡面画两条色带。
     */
    getSummonSameOnlyTypes() {
        if (this.gameState !== 'summon_select')
            return null;
        const currentOptions = this.isPremiumSummonMode ? this.premiumSummonOptions : this.normalSummonOptions;
        if (currentOptions.length === 0)
            return null;
        const types = new Set();
        for (const opt of currentOptions) {
            if (this.findUpgradeTargets(opt.type).length > 0)
                continue;
            if (this.findSameTypeTargets(opt.type).length > 0)
                types.add(opt.type);
        }
        return types;
    }
    renderTowers() {
        const ctx = this.ctx;
        // 召唤选卡时才有值：这些塔型的 Lv1 塔会被打上「可升级」脉冲环
        const upgradeTypes = this.getSummonUpgradeTypes();
        // 弱一档：场上有同类但不足自动升级 → 青色细环（用户诉求"有相同的卡都要标记"）
        const sameOnlyTypes = this.getSummonSameOnlyTypes();
        for (const tower of this.towerMergeSystem.getAllTowers()) {
            const config = tower.getConfig();
            const x = tower.getX();
            const y = tower.getY();
            const rarityCfg = RARITY_CONFIGS[tower.getRarity()];
            // ── 等级档位体量 ──
            // 塔随等级长大（1.00 / 1.08 / 1.16 / 1.26），底座光圈与品阶光环必须用**同一个数**
            // 跟着放大 —— 否则 Lv4 的塔会明显溢出它自己那块底座，看着像"贴错位"。
            const tier = tower.getLevel();
            const ts = towerTierScale(tier);
            // ── 稀有度光环 ──
            // N 不画（否则满场都是圈，视觉噪音），R 以上画一圈品阶色，
            // SSR 额外加一道旋转的缺口弧，让它在满屏塔里一眼可辨。
            if (tower.getRarity() !== Rarity.N) {
                ctx.save();
                ctx.strokeStyle = rarityCfg.color;
                ctx.lineWidth = tower.getRarity() === Rarity.SSR ? 3 : 2;
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                ctx.arc(x, y, 25 * ts, 0, Math.PI * 2);
                ctx.stroke();
                if (tower.getRarity() === Rarity.SSR) {
                    ctx.globalAlpha = 1;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(x, y, 29 * ts, this.gameTime * 2, this.gameTime * 2 + Math.PI * 0.6);
                    ctx.stroke();
                }
                ctx.restore();
            }
            // 过载状态光环（脉动效果）
            if (tower.isOverloaded()) {
                const pulse = Math.sin(this.gameTime * 10) * 0.3 + 0.7;
                ctx.shadowColor = '#FF0033';
                ctx.shadowBlur = 20 * pulse;
                ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, 26 * ts, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            // 瘫痪状态效果
            if (tower.isParalyzed()) {
                ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
                ctx.beginPath();
                ctx.arc(x, y, 22 * ts, 0, Math.PI * 2);
                ctx.fill();
            }
            // 冷却指示器
            if (!tower.isOverloaded() && !tower.isParalyzed() && tower.getOverloadCooldown() > 0) {
                const cooldown = tower.getOverloadCooldown();
                const maxCooldown = 30;
                const progress = 1 - (cooldown / maxCooldown);
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 24 * ts, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
            }
            // 底座金属光圈 —— 固定不动：后坐的是炮身，不是底座
            ctx.shadowColor = config.color;
            ctx.shadowBlur = 10 * ts;
            ctx.fillStyle = '#0B0E14';
            ctx.beginPath();
            ctx.arc(x, y, 22 * ts, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.shadowBlur = 0;
            // ── 「消失」技能：攻击后短暂隐身 ──
            // 技能描述写着"攻击后短暂隐身"，但表现层以前**完全不读** isVanishing()
            // —— 玩家只会看到攻速数字变了、塔却好端端站在原处，
            // 结论自然是"这技能没生效"。这里用纯矢量补上（项目铁律：零 PNG、程序化绘制）：
            // 机身半透明 + 脚下残影环。角标/塔名不参与透明，否则会一起糊掉。
            const vanishing = tower.isVanishing();
            if (vanishing) {
                ctx.save();
                ctx.globalAlpha = 0.42;
            }
            // 防御塔：idle 呼吸 / 瞄准倾斜 / 开火挤压后坐 / 逐塔特色（转管·电弧·冒泡·火焰…）
            // 位移由 drawTowerAnim 内部处理，所以这里传原始坐标。
            // level 一并传入 → 档位体量 + 附加装甲 + 辉光都在 SpriteLoader 里统一处理。
            this.spriteLoader.drawTowerAnim(ctx, x, y, tower.getType(), 40, {
                aim: tower.getAimAngle(),
                recoil: tower.getRecoilAmount(),
                seed: tower.getSlotIndex() * 0.73,
                overload: tower.isOverloaded(),
                paralyzed: tower.isParalyzed(),
                level: tier
            });
            if (vanishing) {
                ctx.restore();
                // 残影环：原地一圈淡紫虚线，告诉玩家"塔还在，只是相位化了"
                // 线型用 setLineDash 而不是随机抖动 —— 像素断言才能稳定。
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = '#a78bfa';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(x, y - 8 * ts, 24 * ts, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            // ── 炮口指向指示：一根细短的瞄准线，让"它在打谁"变明确 ──
            // 起点跟着档位体量走，否则 Lv4 的线会从机身中段冒出来，像画错了。
            if (tower.getAimAngle() !== -Math.PI / 2 || tower.getOverloadCooldown() > 0) {
                const a = tower.getAimAngle();
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.strokeStyle = config.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * 22 * ts, y - 30 * ts + Math.sin(a) * 16 * ts);
                ctx.lineTo(x + Math.cos(a) * 30 * ts, y - 30 * ts + Math.sin(a) * 22 * ts);
                ctx.stroke();
                ctx.restore();
            }
            // 状态提示留在塔身上方；等级数字统一放在塔名旁边的下方标签。
            const statusY = y - 38 * ts;
            if (tower.isOverloaded()) {
                ctx.fillStyle = '#FF0033';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('过载', x, statusY);
            }
            if (tower.isParalyzed()) {
                ctx.fillStyle = '#7A8699';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('瘫痪', x, statusY);
            }
            // ── 塔名 ──
            // 压在底座下方（底座半径 22×ts，名字从 y+24 起）。
            // 必须带一条深色药丸底衬：地图是分层实景，浅色地砖上直接写白字读不清。
            // 塔间距最小 78px，最长的塔名（5 字）在 10px 字号下约 50px，不会串到邻座。
            // 名字位置**不随档位下移**：档位放大是以底座接触点为锚的，底座并没有变矮。
            {
                const towerName = `${config.name} ${toRoman(tier)}`;
                ctx.save();
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const tw = ctx.measureText(towerName).width;
                const padX = 5;
                const pw = tw + padX * 2;
                const ph = 13;
                const px = x - pw / 2;
                const py = y + 24;
                // 实景路线可能从塔名下方经过；不透明铭牌遮住底层道路，保持字和道路明显分层。
                ctx.fillStyle = 'rgba(8, 12, 22, 1)';
                this.roundRect(px, py, pw, ph, 4);
                ctx.fill();
                // 品阶非 N 时描边用品阶色 —— 名字顺带承担"这是几品"的信息
                ctx.strokeStyle = tower.getRarity() === Rarity.N
                    ? 'rgba(143, 163, 191, 0.35)'
                    : rarityCfg.color;
                ctx.lineWidth = 1;
                this.roundRect(px, py, pw, ph, 4);
                ctx.stroke();
                // 名字用品阶色：战场上"这座塔是几品"应该从名字就能读出来，
                // 而不是只能靠底座外圈那一道细光环去认。
                ctx.fillStyle = rarityCfg.color;
                ctx.fillText(towerName, x, py + ph / 2 + 0.5);
                ctx.restore();
            }
            // 选中时显示射程（虚线圆）
            if (this.selectedSlot === tower.getSlotIndex()) {
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(x, y, tower.getRange(), 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(0, 240, 255, 0.10)';
                ctx.beginPath();
                ctx.arc(x, y, tower.getRange(), 0, Math.PI * 2);
                ctx.fill();
            }
            // ── 「可升级」高亮（仅召唤选卡时）──
            // 选卡面板打开时，把"这张卡能吃掉哪座塔"直接标在塔身上。
            // 光在卡面打标记还不够 —— 观众看不到卡和场上哪座塔是一对。
            if (upgradeTypes && upgradeTypes.has(tower.getType())
                && tower.getLevel() === 1 && tower.getLevel() < MAX_TOWER_LEVEL) {
                // 脉冲：1.1s 一个周期，半径 30→38 且透明度反向，做出"呼吸"感
                const pulse = (this.animTime % 1.1) / 1.1;
                const ringR = (30 + pulse * 8) * ts;
                ctx.save();
                ctx.globalAlpha = 0.85 * (1 - pulse);
                ctx.strokeStyle = '#39FF88';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#39FF88';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                // 常驻细环：脉冲淡出后仍能看出"这座塔被选中了"
                ctx.globalAlpha = 0.7;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 28 * ts, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            else if (sameOnlyTypes && sameOnlyTypes.has(tower.getType())) {
                // 有同名塔但等级不匹配（或已满级）→ 只画一圈青色细环。
                // 不脉冲、不加粗：它表示"你已经有这个了"，不是"你该升级它"。
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = '#7DD3FC';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x, y, 26 * ts, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }
        // 放置预览
        if (this.placingTower) {
            const config = TOWER_CONFIGS[this.placingTower];
            ctx.globalAlpha = 0.6;
            this.spriteLoader.drawTower(ctx, this.canvas.width / 2, 100, this.placingTower, 40);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#E8F6FF';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('点击空格放置', this.canvas.width / 2, 125);
        }
    }
    // 颜色辅助方法
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) * (1 - amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) * (1 - amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) * (1 - amount));
        return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
    }
    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.substr(0, 2), 16) * (1 + amount));
        const g = Math.min(255, parseInt(hex.substr(2, 2), 16) * (1 + amount));
        const b = Math.min(255, parseInt(hex.substr(4, 2), 16) * (1 + amount));
        return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
    }
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }
    playTowerAttackSound(towerType, pan = 0) {
        // 统一交由音频系统的 playTowerShot 分派
        this.soundManager.playTowerShot(towerType, pan);
    }
    /** 将画布 X 坐标映射为立体声定位：-1(左) ~ 1(右) */
    panFromX(x) {
        const p = (x / GAME_CONSTANTS.CANVAS_WIDTH) * 2 - 1;
        return Math.max(-1, Math.min(1, p));
    }
    renderEnemies() {
        const ctx = this.ctx;
        for (const enemy of this.waveManager.getAliveEnemies()) {
            const config = enemy.getConfig();
            // 受击位移：命中瞬间朝受击方向顶一下再弹簧回位。
            // 少了这个，敌人被重炮糊脸也纹丝不动，"打中了"完全读不出来。
            const off = enemy.getRenderOffset();
            const x = enemy.getX() + off.x;
            const y = enemy.getY() + off.y;
            const size = enemy.getSize();
            // 行走动画姿态（和 SpriteLoader 内部用的是同一个纯函数，阴影才跟得上步伐）
            const anim = computeEnemyAnim(enemy.getType(), enemy.getAnimPhase(), enemy.getAnimIdle());
            // 出生弹出：0.28s 内从 85% 长到 100%，别让怪凭空出现
            const age = enemy.getAge();
            const spawn = age < 0.28 ? 0.85 + 0.15 * (age / 0.28) : 1;
            // 敌人阴影：随离地高度收缩变淡（跳起来的时候影子要变小）
            const lift = anim.hop + anim.lift;
            const shk = Math.max(0.45, 1 - lift * 0.075);
            ctx.fillStyle = `rgba(0, 0, 0, ${(0.4 * shk).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(enemy.getX(), enemy.getY() + size + 2, size * 0.9 * shk, size * 0.35 * shk, 0, 0, Math.PI * 2);
            ctx.fill();
            // 优先使用精灵图，否则使用矢量绘制
            // 状态色（中毒/燃烧/冻结）以预染色形式进入精灵，而不是在精灵上糊一个纯色圆碟
            const statusEarly = enemy.getStatusTint();
            this.spriteLoader.drawEnemy(ctx, x, y, enemy.getType(), size * 2.5 * spawn, statusEarly?.color, anim, this.currentLevelIndex);
            // 每个章节Boss有独立的技能徽记与配色，轮廓环和技能名可在混战中快速辨认。
            if (isBossType(enemy.getType())) {
                const bossSkill = enemy.getBossSkill() || 'freeze';
                const identities = {
                    freeze: { color: '#42E8FF', mark: '❄', label: '冻结' }, silence: { color: '#D18BFF', mark: '∅', label: '沉默' },
                    jam: { color: '#FFB347', mark: '⌁', label: 'EMP' }, drain: { color: '#55F2B8', mark: '↓', label: '汲取' },
                    quake: { color: '#FF725E', mark: '✹', label: '震荡' }, surge: { color: '#FFE66D', mark: '»', label: '超频' },
                    mark: { color: '#FF4F83', mark: '◎', label: '猎杀' }, overload: { color: '#B987FF', mark: 'ϟ', label: '过载' },
                    ambush: { color: '#85FF67', mark: '⌖', label: '增援' }, eclipse: { color: '#F5F1FF', mark: '◐', label: '日蚀' }
                };
                const identity = identities[bossSkill] || identities.freeze;
                ctx.save();
                ctx.globalAlpha = 0.78 + Math.sin(this.gameTime * 4) * 0.12;
                ctx.strokeStyle = identity.color;
                ctx.shadowColor = identity.color;
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(x, y, size * 1.28, this.gameTime * 0.65, this.gameTime * 0.65 + Math.PI * 1.55);
                ctx.stroke();
                ctx.shadowBlur = 0;
                const badgeY = Math.max(114, y - size * 1.48);
                ctx.fillStyle = 'rgba(5, 12, 26, 0.9)';
                ctx.strokeStyle = identity.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(x - 27, badgeY - 10, 54, 20, 7);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = identity.color;
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${identity.mark} ${identity.label}`, x, badgeY);
                ctx.restore();
            }
            // ── 受击白闪：命中瞬间叠一层暖白，越痛越亮 ──
            // 这是"被攻击"最直接的一帧反馈；没有它，命中只剩血条变短。
            const flash = enemy.getHitFlash();
            if (flash > 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.min(0.55, flash * 0.55);
                const fg = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
                fg.addColorStop(0, 'rgba(255, 214, 150, 0.95)');
                fg.addColorStop(1, 'rgba(255, 120, 90, 0)');
                ctx.fillStyle = fg;
                ctx.beginPath();
                ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            // ── 状态光晕：燃烧(橙) / 中毒(绿) / 冻结(青) 常驻描边 ──
            // 玩家要一眼看出"这只怪现在吃的是什么状态"，而不是靠猜。
            // 精灵图模式下颜色已经预染进本体，这里只留一圈脉冲光环；矢量兜底时才填充。
            const status = enemy.getStatusTint();
            if (status) {
                ctx.save();
                ctx.globalAlpha = 0.55 + Math.sin(this.gameTime * 9) * 0.12;
                ctx.strokeStyle = status.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, size * 1.25, 0, Math.PI * 2);
                ctx.stroke();
                if (status.glow && !this.spriteLoader.isLoaded()) {
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = status.color;
                    ctx.fill();
                }
                ctx.restore();
            }
            // ── 相位化（相位隐形机）：叠一层青白色半透明壳 + 虚线圈 ──
            // 必须一眼看出"现在打它没用"，否则玩家会以为是自己输出不够。
            if (enemy.isPhased()) {
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = 'rgba(168, 180, 255, 0.45)';
                ctx.beginPath();
                ctx.arc(x, y, size * 1.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.9;
                ctx.strokeStyle = '#C9D4FF';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(x, y, size * 1.35, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
            // 动态血条渲染（锚在未位移的位置，避免受击抖动让血条一起晃）
            const hpPercent = enemy.getHp() / enemy.getMaxHp();
            const barWidth = size * 2.2;
            const barHeight = 4;
            const barX = enemy.getX() - barWidth / 2;
            const barY = enemy.getY() - size - 8;
            ctx.fillStyle = '#12131C';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = hpPercent > 0.3 ? '#39FF88' : '#FF0033';
            ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
            // ── 最近受击飘血条：掉血时血条闪一下红 ──
            if (flash > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.7})`;
                ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
            }
            // ── 护盾条（护盾机兵）：血条上方叠一条青色护盾条 ──
            // 护盾是"低单发伤害打不动"的机制，玩家必须看得见护盾还剩多少，
            // 才能判断该不该把鹰眼防御塔转火过来。
            const maxShield = enemy.getMaxShield();
            if (maxShield > 0) {
                const shieldPercent = Math.max(0, enemy.getShield() / maxShield);
                const shieldY = barY - 6;
                ctx.fillStyle = '#05303A';
                ctx.fillRect(barX, shieldY, barWidth, 3);
                ctx.fillStyle = '#00F0FF';
                ctx.fillRect(barX, shieldY, barWidth * shieldPercent, 3);
            }
            // ── 自爆机雷：头顶一个红色警示三角，提示"别让它死在你塔旁边" ──
            if (enemy.getDeathParalyze()) {
                const ty = y - size - (maxShield > 0 ? 20 : 14);
                ctx.fillStyle = '#FF4D6D';
                ctx.beginPath();
                ctx.moveTo(x, ty - 5);
                ctx.lineTo(x - 5, ty + 3);
                ctx.lineTo(x + 5, ty + 3);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
    renderEffects() {
        const ctx = this.ctx;
        // 攻击特效 - 粒子轨迹
        for (const effect of this.attackEffects) {
            const progress = effect.time / 0.2;
            const alpha = 1 - progress;
            // 计算当前粒子位置
            const currentX = effect.x + (effect.targetX - effect.x) * progress;
            const currentY = effect.y + (effect.targetY - effect.y) * progress;
            // 解析颜色
            const color = this.hexToRgb(effect.color);
            // 拖尾效果 - 多个渐隐的粒子
            for (let i = 0; i < 5; i++) {
                const trailProgress = Math.max(0, progress - i * 0.05);
                const trailX = effect.x + (effect.targetX - effect.x) * trailProgress;
                const trailY = effect.y + (effect.targetY - effect.y) * trailProgress;
                const trailAlpha = alpha * (1 - i * 0.2);
                const trailSize = 4 - i * 0.6;
                // 外发光
                ctx.shadowColor = effect.color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${trailAlpha * 0.6})`;
                ctx.beginPath();
                ctx.arc(trailX, trailY, trailSize, 0, Math.PI * 2);
                ctx.fill();
                // 核心亮点
                ctx.shadowBlur = 0;
                ctx.fillStyle = `rgba(255, 255, 255, ${trailAlpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(trailX, trailY, trailSize * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            // 命中爆炸效果
            if (progress > 0.8) {
                const explodeAlpha = (progress - 0.8) / 0.2;
                const explodeRadius = 8 + explodeAlpha * 12;
                ctx.shadowColor = effect.color;
                ctx.shadowBlur = 15;
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${(1 - explodeAlpha) * 0.7})`;
                ctx.beginPath();
                ctx.arc(effect.targetX, effect.targetY, explodeRadius, 0, Math.PI * 2);
                ctx.fill();
                // 爆炸粒子
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const dist = explodeRadius * 1.5;
                    const px = effect.targetX + Math.cos(angle) * dist * explodeAlpha;
                    const py = effect.targetY + Math.sin(angle) * dist * explodeAlpha;
                    const particleSize = 3 * (1 - explodeAlpha);
                    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${(1 - explodeAlpha) * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(px, py, particleSize, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
            }
        }
        // 合成特效（多层扩散光环）
        for (const effect of this.mergeEffects) {
            const alpha = 1 - effect.time / 0.5;
            // 第一层（快速扩散）
            const radius1 = 30 + effect.time * 80;
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.8})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = '#9D00FF';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, radius1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            // 第二层（慢速扩散）
            const radius2 = 20 + effect.time * 50;
            ctx.strokeStyle = `rgba(139, 92, 246, ${alpha * 0.6})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, radius2, 0, Math.PI * 2);
            ctx.stroke();
            // 中心闪光
            if (effect.time < 0.2) {
                const flashAlpha = (0.2 - effect.time) / 0.2;
                ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 25, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // 脉冲特效
        for (let i = this.pulseEffects.length - 1; i >= 0; i--) {
            const pulse = this.pulseEffects[i];
            pulse.radius += 2;
            pulse.alpha -= 0.02;
            if (pulse.alpha <= 0) {
                this.pulseEffects.splice(i, 1);
                continue;
            }
            ctx.strokeStyle = pulse.color + Math.floor(pulse.alpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    renderUI() {
        const ctx = this.ctx;
        // 顶部UI（渐变背景）
        const topGradient = ctx.createLinearGradient(0, 0, 0, 96);
        topGradient.addColorStop(0, 'rgba(9, 12, 19, 0.95)');
        topGradient.addColorStop(1, 'rgba(9, 12, 19, 0.88)');
        ctx.fillStyle = topGradient;
        ctx.fillRect(0, 0, this.canvas.width, 96);
        // 顶部边框
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 96);
        ctx.lineTo(this.canvas.width, 96);
        ctx.stroke();
        // 关卡 + 关内波次信息
        const curWave = Math.max(1, this.waveManager.getCurrentWave());
        const lv = getActiveLevel();
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`第 ${curWave}/${TOTAL_WAVES} 波`, 20, 15);
        // 关卡标识：主题色方块 + 第N关·关名
        ctx.fillStyle = lv.accent;
        ctx.fillRect(112, 19, 3, 14);
        ctx.fillStyle = lv.accent;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${lv.id}.${lv.name}`, 121, 19);
        // 波次时间：普通波画倒计时（20s 强制推进）；Boss 波**没有时限**，
        // 改画「清场解锁」—— 用户诉求「最后一关必须场上一个怪没有的时候才能解锁下一关」。
        // 必须常驻可见：否则"打着打着突然进下一波"在玩家眼里就是 bug，
        // 而反过来"明明没时限却显示一个倒计时"同样是 bug。
        // 最后 5 秒转琥珀色 + 发光，把"该收尾了"的信号推到台面上。
        // 右上方为战斗计时与词缀，分栏显示避免与关卡名、静音按钮冲突。
        if (this.waveManager.isWaveActive()) {
            ctx.font = 'bold 15px sans-serif';
            if (this.waveTimeLimit === NO_WAVE_TIME_LIMIT) {
                // Boss 波：没有"该收尾了"这回事，只有"打完才放你走"
                ctx.fillStyle = '#FFD700';
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 6;
                // ⚠️ 图标必须用 drawCrossedSwords() 矢量画，不能写字面量 U+2694（交叉双剑）：
                // 该码位在本机 Chrome 下会回退到文本字体并渲染成"一横杠 + 三竖条"的残字
                // （已用离屏掩码 + 颜色探针实测：同页 66 个 emoji 全是彩色字形，只有它是残字）。
                // 加 FE0F 变体选择符（'⚔️'）虽能走彩色 emoji，但会把卡通多色图标塞进霓虹单色 HUD，
                // 和左边的单色 '⏱' 语言不一致。矢量画法与项目「零 PNG 依赖、全程序化」的美术铁律同源。
                this.drawCrossedSwords(226, 22, 16, '#FFD700');
                ctx.fillText('清场解锁', 239, 16);
                ctx.shadowBlur = 0;
            }
            else {
                const left = Math.max(0, this.waveTimeLimit - this.waveElapsed);
                const urgent = left <= 5;
                ctx.fillStyle = urgent ? '#FF334F' : '#00F0FF';
                if (urgent) {
                    ctx.shadowColor = '#FF334F';
                    ctx.shadowBlur = 10;
                }
                ctx.fillText(`⏱ ${Math.ceil(left)}s`, 218, 16);
                ctx.shadowBlur = 0;
            }
        }
        // 本波词缀常驻显示 —— 旧设计里变异是战斗中才发现的黑箱，
        // 现在玩家随时能看到当前生效的规则。
        this.renderModifierChip(296, 13, 92);
        // 金币（带图标光晕）
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`💰 ${this.resourceManager.getGold()}`, 20, 40);
        ctx.shadowBlur = 0;
        // 生命值（带图标光晕）
        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FF0033';
        ctx.fillText(`❤️ ${this.resourceManager.getLives()}`, 100, 40);
        ctx.shadowBlur = 0;
        // 速度显示
        ctx.fillStyle = '#9D00FF';
        ctx.font = '14px sans-serif';
        ctx.fillText(`${this.gameSpeed}x`, 178, 40);
        // 剩余敌人
        ctx.fillStyle = '#8FA3BF';
        ctx.fillText(`剩余: ${this.waveManager.getRemainingCount()}`, 218, 40);
        // 强化机会计数（v1.6.2）：每关通关时一次，让玩家知道还差几波
        {
            const left = this.getEnhanceCountdown();
            ctx.font = 'bold 12px sans-serif';
            if (left === 0) {
                ctx.fillStyle = '#fbbf24';
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 8;
            }
            else {
                ctx.fillStyle = '#5A6B85';
            }
            ctx.fillText(left === 0 ? '⚡通关强化 就绪' : `⚡通关强化 再${left}波`, 306, 40);
            ctx.shadowBlur = 0;
        }
        // 下一波摘要放在HUD第三行，并独立预留倒计时栏位。
        this.renderNextWavePreview();
        // 强化节奏提示横幅（波次刚结束那几秒）
        this.renderEnhanceToast();
        // 右上角静音开关
        this.renderMuteButton();
        // 底部按钮区域背景
        const bottomGradient = ctx.createLinearGradient(0, this.canvas.height - 80, 0, this.canvas.height);
        bottomGradient.addColorStop(0, 'rgba(9, 12, 19, 0.88)');
        bottomGradient.addColorStop(1, 'rgba(9, 12, 19, 0.95)');
        ctx.fillStyle = bottomGradient;
        ctx.fillRect(0, this.canvas.height - 80, this.canvas.width, 80);
        // 底部边框
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.canvas.height - 80);
        ctx.lineTo(this.canvas.width, this.canvas.height - 80);
        ctx.stroke();
        // 底部按钮（无「下一波」——波次自动推进，倒计时画在场景里）
        // 召唤不再有固定价：价格随品阶浮动（50~150），所以按钮只显示"召唤"
        this.renderButton('summon', '召唤\n免费', '#9D00FF');
        this.renderOverloadButton();
        this.renderButton('speed', `${this.gameSpeed}x`, '#00F0FF');
        // 渲染合成区域
        this.renderMergeArea();
        // 渲染卖钱区域
        this.renderSellArea();
        // 渲染拖拽中的防御塔
        if (this.draggingTower) {
            this.renderDraggingTower();
        }
    }
    renderMergeArea() {
        const ctx = this.ctx;
        const mergeAreaY = GAME_CONSTANTS.CANVAS_HEIGHT - 100;
        const panelTop = mergeAreaY - 44;
        const panelHeight = 82;
        const mergeGradient = ctx.createLinearGradient(8, panelTop, 8, panelTop + panelHeight);
        mergeGradient.addColorStop(0, 'rgba(16, 22, 32, 0.98)');
        mergeGradient.addColorStop(1, 'rgba(9, 12, 19, 0.98)');
        ctx.fillStyle = mergeGradient;
        cutRectPath(ctx, 8, panelTop, 434, panelHeight, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        ctx.lineWidth = 1.5;
        cutRectPath(ctx, 8, panelTop, 434, panelHeight, 12);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
        ctx.lineWidth = 1;
        cutRectPath(ctx, 13, panelTop + 5, 424, panelHeight - 10, 9);
        ctx.stroke();
        for (const slot of this.mergeAreaSlots) {
            ctx.fillStyle = slot.tower ? CYBER.cyan : 'rgba(0,240,255,0.28)';
            ctx.beginPath();
            ctx.arc(slot.x, panelTop + 12, slot.tower ? 2.5 : 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
        for (const slot of this.mergeAreaSlots) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            cutRectPath(ctx, slot.x - 31, slot.y - 31, 62, 66, 8);
            ctx.fill();
            ctx.fillStyle = slot.tower ? 'rgba(18,19,28,0.98)' : 'rgba(11,14,20,0.98)';
            cutRectPath(ctx, slot.x - 31, slot.y - 33, 62, 66, 8);
            ctx.fill();
            ctx.strokeStyle = slot.tower ? 'rgba(0,240,255,0.40)' : 'rgba(0,240,255,0.16)';
            ctx.lineWidth = 1.5;
            cutRectPath(ctx, slot.x - 31, slot.y - 33, 62, 66, 8);
            ctx.stroke();
            if (!slot.tower)
                continue;
            const tower = slot.tower;
            const config = tower.getConfig();
            const rarity = RARITY_CONFIGS[tower.getRarity()];
            ctx.shadowColor = tower.getRarity() === Rarity.N ? config.color : rarity.color;
            ctx.shadowBlur = tower.getRarity() === Rarity.N ? 8 : 14;
            ctx.fillStyle = '#0B0E14';
            ctx.beginPath();
            ctx.arc(slot.x, slot.y, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = tower.getRarity() === Rarity.N ? config.color : rarity.color;
            ctx.lineWidth = tower.getRarity() === Rarity.N ? 2 : 3;
            ctx.stroke();
            ctx.shadowBlur = 0;
            this.spriteLoader.drawTower(ctx, slot.x, slot.y - 6, tower.getType(), 27, 'center', undefined, tower.getLevel());
            ctx.save();
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = config.color;
            ctx.shadowColor = config.color;
            ctx.shadowBlur = 4;
            ctx.fillText(`${config.name} ${toRoman(tower.getLevel())}`, slot.x, slot.y + 26, 54);
            ctx.restore();
            ctx.save();
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const rarityX = slot.x + 20;
            const rarityY = slot.y + 15;
            const rarityWidth = tower.getRarity() === Rarity.SSR ? 22 : tower.getRarity() === Rarity.SR ? 19 : 15;
            ctx.fillStyle = 'rgba(5, 8, 14, 0.92)';
            this.roundRect(rarityX - rarityWidth / 2, rarityY - 6, rarityWidth, 12, 3);
            ctx.fill();
            ctx.strokeStyle = rarity.color;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = rarity.color;
            ctx.fillText(tower.getRarity(), rarityX, rarityY);
            ctx.restore();
        }
    }
    renderSellArea() {
        const ctx = this.ctx;
        const sellArea = this.getSellArea();
        // 卖钱区域（红色切角面板）
        const sellGradient = ctx.createLinearGradient(sellArea.x, sellArea.y, sellArea.x, sellArea.y + sellArea.h);
        sellGradient.addColorStop(0, 'rgba(255, 0, 51, 0.16)');
        sellGradient.addColorStop(1, 'rgba(255, 0, 51, 0.26)');
        ctx.fillStyle = sellGradient;
        cutRectPath(ctx, sellArea.x, sellArea.y, sellArea.w, sellArea.h, 12);
        ctx.fill();
        // 边框（红色外发光）
        ctx.save();
        ctx.shadowColor = CYBER.red;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(255, 0, 51, 0.75)';
        ctx.lineWidth = 1.5;
        cutRectPath(ctx, sellArea.x, sellArea.y, sellArea.w, sellArea.h, 12);
        ctx.stroke();
        ctx.restore();
        // 图标 + 文案
        // 只写「卖钱」玩家未必知道要把塔拖过来 —— 卖钱区是个**拖拽落点**，
        // 所以把动作本身写进文案（「拖至此处卖钱」）。11px × 6 字 = 66px，
        // 内宽 86-8=78，放得下；再大就会顶到切角边框。
        const cx = sellArea.x + sellArea.w / 2;
        ctx.fillStyle = '#FF0033';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰', cx, sellArea.y + 14);
        ctx.fillStyle = '#FFB3C1';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('拖至此处卖钱', cx, sellArea.y + 32);
    }
    /**
     * 落点提示环：拖动时把"松手后会发生什么"画在目标格子上。
     * 绿 = 能放 / 能合成，红 = 放不了，灰 = 放回原位（空操作），金 = 卖出。
     */
    drawDropHint(cx, cy, color, label) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(6, 9, 15, 0.90)';
        this.roundRect(cx - w / 2, cy + 28, w, 17, 4);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        this.roundRect(cx - w / 2, cy + 28, w, 17, 4);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(label, cx, cy + 37);
        ctx.restore();
    }
    /**
     * 拖拽中的防御塔 + 落点提示。
     *
     * 玩家必须时刻看见"我拖着的是谁、放到哪里会怎样"：
     * 手指下面只有一个光标的塔战没有任何策略性，玩家既看不清也看不懂。
     * 这也是为什么下面 6 个合成格的塔也必须能拖出来并一直显示。
     */
    renderDraggingTower() {
        const drag = this.draggingTower;
        if (!drag)
            return;
        const ctx = this.ctx;
        const tower = this.towerAtSlot(drag.slotIndex);
        // 落点（用于最后画提示环）
        const target = this.resolveDropTarget(drag.x, drag.y);
        // ── 手指下面的塔（半透明 + 稀有度描边 + 等级角标）──
        if (tower) {
            const config = tower.getConfig();
            const rarity = RARITY_CONFIGS[tower.getRarity()];
            const px = drag.x, py = drag.y;
            ctx.save();
            ctx.globalAlpha = 0.78;
            // 底座
            ctx.fillStyle = '#0B0E14';
            ctx.beginPath();
            ctx.arc(px, py, 18, 0, Math.PI * 2);
            ctx.fill();
            // 稀有度外圈（玩家一眼看出拖的是 N 还是 SSR）
            ctx.strokeStyle = rarity.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 20, 0, Math.PI * 2);
            ctx.stroke();
            // 优先使用精灵图（拖动幽灵会带着档位体量一起走 —— 拖 Lv4 就是拖一台更大的机器）
            this.spriteLoader.drawTower(ctx, px, py, tower.getType(), 36, 'center', undefined, tower.getLevel());
            ctx.restore();
        }
        // ── 落点提示环（最后画，压在塔之上，确保任何情况下都看得见）──
        if (target.kind === 'sell') {
            const refund = tower
                ? Math.floor(tower.getConfig().cost * 0.5 * RARITY_CONFIGS[tower.getRarity()].sellMult)
                : 0;
            const area = this.getSellArea();
            this.drawDropHint(area.x + area.w / 2, area.y + area.h / 2, '#fbbf24', `卖出 +${refund}金`);
        }
        else if (target.kind === 'merge' || target.kind === 'field') {
            const slot = target.kind === 'merge'
                ? this.mergeAreaSlots[target.index]
                : TOWER_SLOTS[target.index];
            const cx = slot.x, cy = slot.y;
            if (target.index === drag.slotIndex) {
                // 放回原来的格子 = 空操作，明确画出来，别让玩家以为能刷级
                this.drawDropHint(cx, cy, '#8FA3BF', '原位');
            }
            else if (target.tower) {
                if (tower && tower !== target.tower && tower.canMergeWith(target.tower)) {
                    this.drawDropHint(cx, cy, '#4ADE9A', `合成 Lv.${toRoman(tower.getLevel() + 1)}`);
                }
                else {
                    this.drawDropHint(cx, cy, '#f87171', '无法合成');
                }
            }
            else {
                this.drawDropHint(cx, cy, '#4ADE9A', '放置');
            }
        }
    }
    /**
     * 交叉双剑图标（Boss 波 HUD「清场解锁」用）。
     *
     * 为什么不用 U+2694（交叉双剑）这个字符：该码位在本机 Chrome 下会回退到文本字体，
     * 渲染成"一横杠 + 三竖条"的残字（已实测：同页 66 个 emoji 全是彩色字形，只有它坏）。
     * 加 FE0F（'⚔️'）虽然能走彩色 emoji，但会把卡通多色图标塞进霓虹单色 HUD，
     * 和左边的单色 '⏱' 视觉语言不一致。
     * 所以按项目「零 PNG 依赖、全程序化绘制」的美术铁律用路径画：跨平台表现完全一致。
     *
     * @param cx/cy 图标中心
     * @param s     整体尺寸（外接方块边长）
     */
    drawCrossedSwords(cx, cy, s, color) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // 剑刃：根部宽、尖端收窄的四边形，两柄镜像交叉成 X。
        // 不用"细线 + 圆头"画法 —— 14~18px 下细线会糊成一团，实心锥形刃才保形。
        for (const dir of [1, -1]) {
            ctx.save();
            ctx.scale(dir, 1);
            ctx.beginPath();
            ctx.moveTo(-s * 0.42, s * 0.10); // 刃根一侧
            ctx.lineTo(s * 0.46, -s * 0.46); // 剑尖
            ctx.lineTo(s * 0.24, -s * 0.24); // 剑尖另一侧
            ctx.lineTo(-s * 0.10, s * 0.42); // 刃根另一侧
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // 护手：贴在刃根的一短横。长度压在 0.5s 以内 —— 再长就会在 HUD 尺度上
        // 从"剑"退化成"带横杠的 X"，反而更难认。
        ctx.lineWidth = Math.max(1, s * 0.13);
        for (const dir of [1, -1]) {
            ctx.save();
            ctx.scale(dir, 1);
            ctx.beginPath();
            ctx.moveTo(-s * 0.02, s * 0.50);
            ctx.lineTo(-s * 0.50, s * 0.02);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
    /**
     * 本波词缀常驻角标（右上角）。
     * 旧设计里变异是纯随机且不可见的，玩家打到一半才发现敌人打不动。
     */
    renderModifierChip(x, y, w) {
        const mut = this.waveManager.getCurrentMutation();
        if (!mut)
            return;
        const cfg = MUTATION_TYPES.find(m => m.type === mut);
        if (!cfg)
            return;
        const ctx = this.ctx;
        const label = `${cfg.icon} ${cfg.name}`;
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width;
        const cw = tw + 14;
        const cx = x + w - cw;
        ctx.fillStyle = 'rgba(255, 0, 51, 0.18)';
        this.roundRect(cx, y, cw, 20, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
        ctx.lineWidth = 1;
        this.roundRect(cx, y, cw, 20, 6);
        ctx.stroke();
        ctx.fillStyle = '#FF8A9E';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + 7, y + 11);
    }
    /**
     * 下一波预告条。
     *
     * 塔防的核心决策是「提前布局」，而旧设计里玩家完全不知道下一波是什么，
     * 只能等敌人走到脸上才反应 —— 这等于取消了布局决策。
     * 现在在波间倒计时期间显示：波次代号、敌人构成、新敌人角标、本波词缀、剩余秒数。
     * 只在该阶段显示，此时场上没有敌人（上一波已清空），不会遮挡战斗。
     */
    /**
     * 强化节奏提示横幅。
     * 只在"本波没给强化机会"时出现 —— 给强化机会时升级面板会盖住全屏，
     * 横幅画了也看不见，没必要画。
     */
    renderEnhanceToast() {
        if (this.enhanceToast <= 0)
            return;
        // 弹窗（召唤/强化/结算）自带全屏遮罩，横幅透出来只会变成噪点
        if (this.gameState === 'summon_select' || this.gameState === 'upgrade_select' ||
            this.gameState === 'level_clear' || this.gameState === 'menu')
            return;
        const ctx = this.ctx;
        const W = this.canvas.width;
        // 提示位于作战区上沿，避开合并后的顶部 HUD 预告行。
        const y = 150;
        // 最后 0.6 秒淡出
        const alpha = Math.min(1, this.enhanceToast / 0.6);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px sans-serif';
        const tw = ctx.measureText(this.enhanceToastText).width;
        const maxTextWidth = W - 48;
        const wraps = tw > maxTextWidth;
        const toastLines = [];
        let line = '';
        for (const char of this.enhanceToastText) {
            if (line && ctx.measureText(line + char).width > maxTextWidth) {
                if (toastLines.length === 0) {
                    toastLines.push(line);
                    line = char;
                }
                else {
                    while (line && ctx.measureText(line + '…').width > maxTextWidth)
                        line = line.slice(0, -1);
                    toastLines.push(line + '…');
                    line = '';
                    break;
                }
            }
            else {
                line += char;
            }
        }
        if (line)
            toastLines.push(line);
        const w = wraps ? W - 24 : tw + 28;
        const h = wraps ? 42 : 28;
        const x = (W - w) / 2;
        ctx.fillStyle = 'rgba(9, 12, 19, 0.93)';
        this.roundRect(x, y - h / 2, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = this.enhanceToastColor;
        ctx.lineWidth = 1.5;
        this.roundRect(x, y - h / 2, w, h, 8);
        ctx.stroke();
        ctx.fillStyle = this.enhanceToastColor;
        if (wraps) {
            const visibleLines = toastLines.slice(0, 2);
            visibleLines.forEach((toastLine, index) => {
                ctx.fillText(toastLine, W / 2, y + (index - (visibleLines.length - 1) / 2) * 14);
            });
        }
        else {
            ctx.fillText(this.enhanceToastText, W / 2, y);
        }
        ctx.restore();
        // 恢复文本状态，避免影响后续渲染
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
    renderNextWavePreview() {
        const preview = WaveManager.getWavePreview(this.waveManager.getCurrentWave() + 1);
        if (!preview)
            return;
        const ctx = this.ctx;
        const ordered = preview.composition.slice().sort((a, b) => {
            const ab = isBossType(a.type) ? 1 : 0;
            const bb = isBossType(b.type) ? 1 : 0;
            return ab !== bb ? bb - ab : b.count - a.count;
        });
        const brief = ordered.slice(0, 2).map(enemy => `${isBossType(enemy.type) ? 'Boss' : enemy.name.slice(0, 2)}×${enemy.count}`).join(' · ');
        const bossSkills = {
            freeze: '冻结', silence: '静默', jam: 'EMP', drain: '抽金', surge: '减速',
            mark: '标记', quake: '震波', overload: '打断', ambush: '伏击', eclipse: '日蚀'
        };
        const skill = preview.bossSkill ? ` · ${bossSkills[preview.bossSkill] ?? 'Boss技能'}` : '';
        const label = `下波 ${preview.wave}/${TOTAL_WAVES} · ${preview.name} · ${brief}${skill}`;
        const countdownUrgent = this.nextWaveCountdownActive && Math.ceil(this.nextWaveCountdown) <= 5;
        ctx.save();
        ctx.fillStyle = 'rgba(2, 12, 25, 0.74)';
        this.roundRect(12, 66, this.canvas.width - 24, 25, 7);
        ctx.fill();
        ctx.strokeStyle = preview.isBoss ? 'rgba(201,168,255,0.48)' : 'rgba(0,240,255,0.24)';
        ctx.lineWidth = 1;
        this.roundRect(12, 66, this.canvas.width - 24, 25, 7);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = preview.isBoss ? '#E2D2FF' : '#C7E7F4';
        ctx.fillText(label, 20, 78.5, this.canvas.width - 105);
        if (this.nextWaveCountdownActive) {
            const seconds = Math.max(0, Math.ceil(this.nextWaveCountdown));
            ctx.textAlign = 'right';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillStyle = countdownUrgent ? '#FF334F' : '#00F0FF';
            if (countdownUrgent) {
                ctx.shadowColor = '#FF334F';
                ctx.shadowBlur = 10;
            }
            ctx.fillText(`⏱ ${seconds}s`, this.canvas.width - 22, 78.5);
        }
        ctx.restore();
    }
    /**
     * 升级 UP! 特效。
     *
     * 合成 / 同卡自动升级时出现。光把角标从 Lv.II 改成 Lv.III 玩家根本注意不到，
     * 必须给一个明确的"我变强了"宣告：金色扩散环 + 升起的光柱 + UP! + 罗马数字等级。
     *
     * 画在**所有面板之上**（在 render() 末尾调用，而不是跟着 renderEffects 走）：
     * 买入重复卡会立刻弹出技能三选一面板，如果 UP 特效留在世界层，就会被那层
     * rgba(0,0,0,0.7) 的遮罩整个盖住 —— 玩家永远看不到自己升级了。
     */
    renderLevelUpFlashes() {
        if (this.levelUpFlashes.length === 0)
            return;
        const ctx = this.ctx;
        for (const fx of this.levelUpFlashes) {
            const t = fx.time / GameManager.LEVEL_UP_FX_DURATION; // 0 → 1
            const fade = 1 - t;
            ctx.save();
            // ① 金色主环（扩散 + 淡出）
            ctx.globalAlpha = Math.min(1, fade * 1.6);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 5;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, 16 + t * 78, 0, Math.PI * 2);
            ctx.stroke();
            // ② 青色副环（慢半拍，做出两层层次）
            ctx.strokeStyle = '#6BF6FF';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#6BF6FF';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, 8 + Math.max(0, t - 0.12) * 62, 0, Math.PI * 2);
            ctx.stroke();
            // ③ 竖直光柱（只在前半段，像是"从塔里升起"）
            if (t < 0.55) {
                const bh = 70 * (1 - t / 0.55);
                const beam = ctx.createLinearGradient(fx.x, fx.y - bh, fx.x, fx.y + 10);
                beam.addColorStop(0, 'rgba(251, 191, 36, 0)');
                beam.addColorStop(0.55, `rgba(251, 191, 36, ${0.55 * fade})`);
                beam.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = beam;
                ctx.fillRect(fx.x - 13, fx.y - bh, 26, bh + 10);
            }
            // ④ 放射火花
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 10;
            ctx.fillStyle = `rgba(255, 246, 200, ${0.9 * fade})`;
            for (let k = 0; k < 8; k++) {
                const ang = (Math.PI * 2 * k) / 8 + t * 1.2;
                const dist = 14 + t * 62;
                ctx.beginPath();
                ctx.arc(fx.x + Math.cos(ang) * dist, fx.y + Math.sin(ang) * dist, 2.6 * fade + 0.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            // ⑤ 「UP! Lv.IV」文字：上浮 + 先亮后淡，深色底衬保证任何地图（以及面板遮罩）上都读得清
            const label = `UP! Lv.${toRoman(fx.level)}`;
            const ty = fx.y - 34 - t * 34;
            ctx.save();
            ctx.globalAlpha = t < 0.12 ? t / 0.12 : Math.min(1, fade * 2.2);
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(8, 12, 22, 0.82)';
            this.roundRect(fx.x - tw / 2 - 10, ty - 15, tw + 20, 30, 8);
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            this.roundRect(fx.x - tw / 2 - 10, ty - 15, tw + 20, 30, 8);
            ctx.stroke();
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#FFD700';
            ctx.fillText(label, fx.x, ty + 1);
            ctx.restore();
        }
    }
    /**
     * 「自动获得技能」飘字。
     *
     * 升级不再弹三选一，这条飘字是**唯一**能告诉玩家"这次给了我什么"的通道 ——
     * 没有它，技能就是凭空冒出来的。画在 UP! 标签**上方**（`-72` 起步），
     * 两条标签各自有独立生命周期，靠固定间距避免叠字。
     */
    renderSkillGainToasts() {
        if (this.skillGainToasts.length === 0)
            return;
        const ctx = this.ctx;
        for (const toast of this.skillGainToasts) {
            const t = toast.time / GameManager.SKILL_TOAST_DURATION; // 0 → 1
            const fade = 1 - t;
            // 前 0.12 淡入，末尾 0.3 淡出 —— 中段保持全亮，保证技能名读得完
            const alpha = t < 0.12 ? t / 0.12 : (fade < 0.3 ? fade / 0.3 : 1);
            if (alpha <= 0.01)
                continue;
            const label = `${toast.icon} ${toast.name}`;
            const ty = toast.y - 72 - t * 26;
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(label).width;
            // 深色药丸底衬：混战里技能名会压到敌人/通道上，没有底衬读不清
            ctx.fillStyle = 'rgba(8, 12, 22, 0.88)';
            this.roundRect(toast.x - tw / 2 - 9, ty - 12, tw + 18, 24, 7);
            ctx.fill();
            // 紫色描边 = 技能系统的专属色（与 UP! 的金色区分开）
            ctx.strokeStyle = '#9D00FF';
            ctx.lineWidth = 1.6;
            this.roundRect(toast.x - tw / 2 - 9, ty - 12, tw + 18, 24, 7);
            ctx.stroke();
            ctx.shadowColor = '#9D00FF';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#E8D9FF';
            ctx.fillText(label, toast.x, ty + 1);
            ctx.restore();
        }
    }
    /**
     * Boss 出场警告：屏幕中央红色大字「⚠ BOSS 来袭 ⚠」+ 副标题 Boss 名称。
     * 持续 2 秒，带闪烁与缩放动画，确保玩家第一时间注意到。
     */
    renderBossWarning() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const remain = this.bossWarningTimer;
        // 进度 1 → 0（用于淡出与缩放）
        const t = Math.max(0, Math.min(1, remain / 2.0));
        const alpha = t > 0.15 ? 1 : (t / 0.15); // 最后 0.3s 淡出
        // 前 0.35s 缩放入场（从 0.7 → 1.0）
        const inT = Math.min(1, (2.0 - remain) / 0.35);
        const scale = 0.7 + 0.3 * inT;
        // 持续闪烁：每 0.25s 一次
        const blink = Math.floor(this.gameTime * 4) % 2 === 0 ? 1 : 0.72;
        ctx.save();
        ctx.globalAlpha = alpha * blink;
        ctx.translate(W / 2, H / 2 - 40);
        ctx.scale(scale, scale);
        // 半透明暗底条，保证红字在任何背景上都读得清
        const bw = 320, bh = 96;
        ctx.fillStyle = 'rgba(10, 4, 8, 0.72)';
        this.roundRect(-bw / 2, -bh / 2, bw, bh, 10);
        ctx.fill();
        // 红色霓虹描边
        ctx.strokeStyle = '#FF0033';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = 18;
        this.roundRect(-bw / 2, -bh / 2, bw, bh, 10);
        ctx.stroke();
        // 主标题
        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#FF2D4F';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠ BOSS 来袭 ⚠', 0, -16);
        // 副标题：Boss 名称
        const bossEnemy = this.waveManager.getAliveEnemies().find(e => isBossType(e.getType()));
        const bossName = bossEnemy ? ENEMY_CONFIGS[bossEnemy.getType()].name : '机械军团首领';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(bossName, 0, 22);
        ctx.restore();
    }
    /**
     * 赛博按钮：暗底 + 霓虹描边 + 切角 + 内侧高光。
     * color 决定霓虹色（召唤=紫 / 速度=青 / 过载=橙/红/灰）。
     */
    renderButton(name, text, color) {
        const ctx = this.ctx;
        const btn = this.buttons.get(name);
        const cut = 10;
        // 外发光底
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(9, 12, 19, 0.88)';
        cutRectPath(ctx, btn.x, btn.y, btn.w, btn.h, cut);
        ctx.fill();
        ctx.restore();
        // 顶部内侧高光（塑料感 → 玻璃感）
        ctx.save();
        cutRectPath(ctx, btn.x, btn.y, btn.w, btn.h, cut);
        ctx.clip();
        const hl = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        hl.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
        hl.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = hl;
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.restore();
        // 霓虹描边
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        cutRectPath(ctx, btn.x, btn.y, btn.w, btn.h, cut);
        ctx.stroke();
        // 左下 / 右上角短亮线（切角处补一笔，强化"切"的感觉）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(btn.x + cut, btn.y + btn.h);
        ctx.lineTo(btn.x + cut + 10, btn.y + btn.h);
        ctx.moveTo(btn.x + btn.w - cut, btn.y);
        ctx.lineTo(btn.x + btn.w - cut - 10, btn.y);
        ctx.stroke();
        // 文字
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, btn.x + btn.w / 2, btn.y + btn.h / 2);
        ctx.restore();
    }
    renderOverloadButton() {
        const ctx = this.ctx;
        const btn = this.buttons.get('overload');
        const cut = 10;
        // 特级召唤按钮样式
        const canAfford = this.resourceManager.getGold() >= PREMIUM_SUMMON_COST;
        const accent = canAfford ? CYBER.gold : CYBER.textLow;
        const text = `特级召唤\n${PREMIUM_SUMMON_COST}金`;
        // 外发光底
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = canAfford ? 16 : 8;
        ctx.fillStyle = canAfford
            ? 'rgba(255, 215, 0, 0.18)'
            : 'rgba(9, 12, 19, 0.88)';
        cutRectPath(ctx, btn.x, btn.y, btn.w, btn.h, cut);
        ctx.fill();
        ctx.restore();
        // 内侧高光
        ctx.save();
        cutRectPath(ctx, btn.x, btn.y, btn.w, btn.h, cut);
        ctx.clip();
        const hl = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        hl.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        hl.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = hl;
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.restore();
        // 霓虹描边
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = canAfford ? 2.0 : 1.2;
        ctx.stroke();
        ctx.restore();
        // 文字
        ctx.save();
        ctx.fillStyle = accent;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = text.split('\n');
        const lineHeight = 16;
        const startY = btn.y + btn.h / 2 - (lines.length - 1) * lineHeight / 2;
        lines.forEach((line, i) => {
            ctx.fillText(line, btn.x + btn.w / 2, startY + i * lineHeight);
        });
        ctx.restore();
    }
    renderMuteButton() {
        const ctx = this.ctx;
        const btn = this.buttons.get('mute');
        if (!btn)
            return;
        const muted = this.soundManager.isMuted();
        const bgColor = muted ? '#243040' : '#00F0FF';
        const cx = btn.x + btn.w / 2;
        const cy = btn.y + btn.h / 2;
        // 背景圆（更精致）
        ctx.fillStyle = muted ? 'rgba(36, 48, 64, 0.85)' : 'rgba(0, 240, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, btn.w / 2, 0, Math.PI * 2);
        ctx.fill();
        // 边框
        ctx.strokeStyle = muted ? '#3a4a5a' : '#00F0FF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, btn.w / 2, 0, Math.PI * 2);
        ctx.stroke();
        // 喇叭图标（矢量绘制，不使用 emoji）
        ctx.save();
        ctx.translate(cx, cy);
        // 喇叭主体
        ctx.fillStyle = muted ? '#6a7a8a' : '#00F0FF';
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(-3, -4);
        ctx.lineTo(1, -7);
        ctx.lineTo(1, 7);
        ctx.lineTo(-3, 4);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        // 声波（未静音时）
        if (!muted) {
            ctx.strokeStyle = '#00F0FF';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            // 第一道声波
            ctx.beginPath();
            ctx.arc(3, 0, 3, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
            // 第二道声波
            ctx.beginPath();
            ctx.arc(3, 0, 5, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
        }
        else {
            // 静音叉号
            ctx.strokeStyle = '#ff6b8a';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(2, -3);
            ctx.lineTo(6, 3);
            ctx.moveTo(6, -3);
            ctx.lineTo(2, 3);
            ctx.stroke();
        }
        ctx.restore();
    }
    /**
     * 特级召唤：50金，无N卡，高级卡概率高，10次保底SSR
     * 进入三选一面板，支持换卡（40金/次）
     *
     * 付费逻辑：首次进入扣50金并生成3张卡；如果没买就退出，保留这批卡，
     * 再次进入时不重复扣费（与普通召唤一致）。
     */
    premiumSummon() {
        const cost = PREMIUM_SUMMON_COST;
        // 检查合成区是否有空位
        if (this.mergeAreaSlots.every(s => s.tower !== null)) {
            this.soundManager.playDenied();
            this.showEnhanceToast('合成区已满 · 无法召唤', '#ff6b8a');
            return;
        }
        // 如果已有未消费的卡（上次进入但没买），不重复扣费
        if (this.premiumSummonOptions.length === 0) {
            // 首次进入：检查金币并扣费
            if (this.resourceManager.getGold() < cost) {
                this.soundManager.playDenied();
                this.showEnhanceToast(`金币不足 · 特级召唤需要 ${cost} 金`, '#ff6b8a');
                return;
            }
            // 扣费
            this.resourceManager.addGold(-cost);
            this.premiumSummonCount++;
            this.premiumSummonPity++;
            // 生成特级召唤选项（无N卡，高级卡概率高）
            this.premiumSummonOptions = this.generatePremiumSummonOptions();
        }
        // 设置为特级召唤模式
        this.isPremiumSummonMode = true;
        // 进入三选一面板
        this.soundManager.playSummon();
        this.gameState = 'summon_select';
    }
    /**
     * 生成特级召唤选项：无N卡，高级卡概率高，10次保底SSR
     */
    generatePremiumSummonOptions() {
        // 保底判定：10次必出SSR
        const floor = this.premiumSummonPity >= PREMIUM_SUMMON_PITY_LIMIT ? Rarity.SSR : Rarity.R;
        const pool = this.summonPool.slice();
        const picked = [];
        for (let k = 0; k < 3 && pool.length > 0; k++) {
            const weights = pool.map(t => 1 / Math.max(1, TOWER_CONFIGS[t].cost));
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            let idx = pool.length - 1;
            for (let i = 0; i < pool.length; i++) {
                r -= weights[i];
                if (r <= 0) {
                    idx = i;
                    break;
                }
            }
            // 第一张卡吃保底，后两张回到特级召唤概率
            const rarity = k === 0 ? (floor === Rarity.SSR ? Rarity.SSR : rollPremiumRarity()) : rollPremiumRarity();
            picked.push({ type: pool[idx], rarity });
            pool.splice(idx, 1);
        }
        // 如果触发了SSR保底，重置计数
        if (floor === Rarity.SSR) {
            this.premiumSummonPity = 0;
        }
        return picked;
    }
    drawWrappedText(text, centerX, y, maxWidth, lineHeight, align = 'left', maxLines = 4) {
        const ctx = this.ctx;
        ctx.textAlign = align;
        let line = '';
        let lineIndex = 0;
        for (const char of text) {
            const next = line + char;
            if (line && ctx.measureText(next).width > maxWidth) {
                ctx.fillText(line, centerX, y + lineIndex * lineHeight);
                line = char;
                if (++lineIndex >= maxLines - 1)
                    break;
            }
            else
                line = next;
        }
        if (line && lineIndex < maxLines)
            ctx.fillText(line, centerX, y + lineIndex * lineHeight, maxWidth);
    }
    renderUpgradeSelect() {
        const ctx = this.ctx;
        // 半透明遮罩
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // 标题（通关强化与普通强化两种文案，v1.6.2）
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.isLevelClearUpgrade ? '通关强化' : '选择强化', this.canvas.width / 2, 300);
        if (this.isLevelClearUpgrade) {
            ctx.fillStyle = '#00F0FF';
            ctx.font = '12px sans-serif';
            ctx.fillText(`本关已通关 · ${this.levelClearRewardText || '奖励已发放'} · 选择后进入关卡结算`, this.canvas.width / 2, 322);
        }
        // 3个选项
        const optionWidth = 120;
        const optionHeight = 166;
        const startX = (this.canvas.width - optionWidth * 3 - 20) / 2;
        const startY = 350;
        for (let i = 0; i < this.upgradeOptions.length; i++) {
            const option = this.upgradeOptions[i];
            const x = startX + i * (optionWidth + 10);
            // 卡片背景
            ctx.fillStyle = '#12131C';
            ctx.fillRect(x, startY, optionWidth, optionHeight);
            ctx.strokeStyle = '#9D00FF';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, startY, optionWidth, optionHeight);
            // 卡片内容限制在卡片边框内，避免长目标名单或效果文案溢出。
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 5, startY + 5, optionWidth - 10, optionHeight - 10);
            ctx.clip();
            // 图标
            ctx.font = '30px sans-serif';
            ctx.fillText(option.icon, x + optionWidth / 2, startY + 40);
            // 名称
            ctx.fillStyle = '#E8F6FF';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(option.name, x + optionWidth / 2, startY + 80);
            // 目标名单用亮青色加粗并加轻微辉光，提升辨识度。
            if (option.targetLabel) {
                ctx.fillStyle = '#00F0FF';
                ctx.font = 'bold 10px sans-serif';
                ctx.shadowColor = 'rgba(0, 240, 255, 0.45)';
                ctx.shadowBlur = 5;
                this.drawWrappedText(option.targetLabel, x + optionWidth / 2, startY + 99, optionWidth - 12, 11, 'center', 3);
                ctx.shadowBlur = 0;
            }
            // 实际效果用更醒目的浅色粗体，最多三行且裁剪边界与卡片一致。
            ctx.fillStyle = '#E7F7FF';
            ctx.font = 'bold 11px sans-serif';
            this.drawWrappedText(option.description, x + optionWidth / 2, startY + 133, optionWidth - 12, 12, 'center', 3);
            ctx.restore();
        }
        // 随机强化：直接从本次三张以外的可用强化中抽取并应用。
        const randomBtn = this.upgradeRandomButtonRect();
        const randomGrad = ctx.createLinearGradient(randomBtn.x, randomBtn.y, randomBtn.x + randomBtn.w, randomBtn.y + randomBtn.h);
        randomGrad.addColorStop(0, '#6D28D9');
        randomGrad.addColorStop(0.55, '#3B1E75');
        randomGrad.addColorStop(1, '#075985');
        ctx.fillStyle = randomGrad;
        this.roundRect(randomBtn.x, randomBtn.y, randomBtn.w, randomBtn.h, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
        ctx.lineWidth = 1.6;
        this.roundRect(randomBtn.x, randomBtn.y, randomBtn.w, randomBtn.h, 10);
        ctx.stroke();
        ctx.fillStyle = '#F3E8FF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎲 随机选一项强化', this.canvas.width / 2, randomBtn.y + randomBtn.h / 2);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '11px sans-serif';
        ctx.fillText('从其他可用强化中随机抽取，并立即应用', this.canvas.width / 2, randomBtn.y + randomBtn.h + 20);
        if (this.upgradeNoticeText) {
            ctx.fillStyle = '#FF8A1F';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(this.upgradeNoticeText, this.canvas.width / 2, randomBtn.y + randomBtn.h + 40);
        }
        ctx.textAlign = 'left';
    }
    renderSummonSelect() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        // 半透明遮罩
        ctx.fillStyle = 'rgba(4, 6, 14, 0.84)';
        ctx.fillRect(0, 0, W, this.canvas.height);
        // 标题
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#C9A8FF';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('召  唤', W / 2, 250);
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '13px sans-serif';
        ctx.fillText(`随机 3 张任选其一 · 抽卡免费，选中才按品阶付费（${SUMMON_PRICE_MIN}~${SUMMON_PRICE_MAX} 金）`, W / 2, 278);
        // 保底进度提示：让玩家知道"再抽几次必出 SR"
        const pityLeft = this.getPityRemaining();
        ctx.fillStyle = pityLeft <= 3 ? '#fbbf24' : '#5A6B85';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(pityLeft <= 0 ? '★ 本抽保底：必出 SR 以上' : `★ 保底进度 ${SUMMON_PITY_LIMIT - pityLeft}/${SUMMON_PITY_LIMIT}（再 ${pityLeft} 抽必出 SR）`, W / 2, 300);
        // 3 张卡（布局必须与 handleSummonSelect 保持一致）
        const optionWidth = 120;
        const optionHeight = 214;
        const startX = (W - optionWidth * 3 - 20) / 2;
        const startY = 330;
        const gold = this.resourceManager.getGold();
        // 根据当前模式选择对应的卡池
        const currentOptions = this.isPremiumSummonMode ? this.premiumSummonOptions : this.normalSummonOptions;
        for (let i = 0; i < currentOptions.length; i++) {
            const opt = currentOptions[i];
            const config = TOWER_CONFIGS[opt.type];
            const r = RARITY_CONFIGS[opt.rarity];
            const x = startX + i * (optionWidth + 10);
            // 防御：这条代码跑在 requestAnimationFrame 里，一个畸形选项就能让异常
            // 冒到 rAF 回调之外，把整个游戏循环打死（画面直接冻结）。
            // 这里选择"跳过这一张"而不是"让它崩"——代价是少画一张卡，收益是游戏还能动。
            if (!opt || !config || !r)
                continue;
            // 品阶加成后的实际属性（与 Tower 构造时应用的是同一套公式）
            const dmg = Math.round(config.damage * r.dmgMult);
            const rng = config.range + r.rangeBonus;
            const interval = config.attackSpeed * r.intervalMult;
            const aps = (1 / interval).toFixed(1);
            const dps = Math.round(dmg / interval);
            // 这张卡的售价：只看品阶（N 50 / R 80 / SR 120 / SSR 150）
            const price = summonPrice(opt.rarity);
            const affordable = gold >= price;
            // 卡片背景
            ctx.fillStyle = '#131b2e';
            ctx.fillRect(x, startY, optionWidth, optionHeight);
            // 稀有度顶条 —— SSR 加粗到 6px，一眼能认出
            ctx.fillStyle = r.color;
            ctx.fillRect(x, startY, optionWidth, r.stars >= 4 ? 6 : 4);
            // 边框用稀有度色（不是防御塔色）：品阶是这张卡最重要的信息
            ctx.strokeStyle = r.color;
            ctx.lineWidth = opt.rarity === Rarity.SSR ? 3 : 2;
            ctx.strokeRect(x, startY, optionWidth, optionHeight);
            // 图标 —— 卡面防御塔（赛博炮塔）。尺寸与位置必须让炮塔顶端留在顶条之下：
            // 程序化炮塔的包围盒约「顶端 -15 / 底座 +19」。上移塔图，为名称与图像留出清晰间距，
            // 顶端仍在稀有度顶条（0..6px）下方，卡片后半部留给攻击说明与属性文字。
            this.spriteLoader.drawTower(ctx, x + optionWidth / 2, startY + 48, opt.type, 40);
            // 名称 —— 用品阶色，不是防御塔色。
            // 同一品阶的卡名字必须是同一种颜色，玩家扫一眼就能按颜色归类；
            // 用防御塔色的话每种塔一个颜色，品阶反而看不出来（防御塔类型已经由精灵图标表达了）。
            ctx.fillStyle = r.color;
            ctx.font = 'bold 15px sans-serif';
            ctx.fillText(config.name, x + optionWidth / 2, startY + 83);
            // 简短攻击特效说明，让玩家选卡前能看懂炮塔的输出方式。
            ctx.fillStyle = '#00F0FF';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText('攻击特效', x + optionWidth / 2, startY + 98);
            ctx.fillStyle = '#D5E4F2';
            ctx.font = '10px sans-serif';
            this.drawWrappedText(config.attackEffect, x + optionWidth / 2, startY + 111, optionWidth - 10, 11, 'center', 2);
            // 品阶直接使用 N / R / SR / SSR，避免星级与中文名称造成混淆。
            ctx.fillStyle = r.color;
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(r.key, x + optionWidth / 2, startY + 137);
            // 属性（已含品阶加成）
            ctx.fillStyle = '#8FA3BF';
            ctx.font = '11px sans-serif';
            ctx.fillText(`伤害 ${dmg}`, x + optionWidth / 2, startY + 155);
            ctx.fillText(`范围 ${rng}`, x + optionWidth / 2, startY + 169);
            ctx.fillText(`${aps}/s · ${dps} DPS`, x + optionWidth / 2, startY + 183);
            // ── 售价 ──
            // 价格是这次改动的核心信息，所以给它一条独立的分隔带 + 更大的字号，
            // 而不是塞进属性列表里。买不起时整张卡压暗，一眼知道"这张现在拿不到"。
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(x + 1, startY + 191, optionWidth - 2, 20);
            ctx.fillStyle = affordable ? '#fbbf24' : '#f87171';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(`💰 ${price}`, x + optionWidth / 2, startY + 207);
            if (!affordable) {
                // 压暗整张卡（价格条画完之后再压，保证"买不起"这三个字还读得清）
                ctx.fillStyle = 'rgba(4, 6, 14, 0.55)';
                ctx.fillRect(x, startY + (r.stars >= 4 ? 6 : 4), optionWidth, 184);
                ctx.fillStyle = '#f87171';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(`💰 ${price}`, x + optionWidth / 2, startY + 207);
            }
            // ── 「有同类」标记（两档，画在最上面）──
            // 放在最后画：买不起的卡会被整张压暗，而"这张卡和你场上的塔什么关系"是
            // 决策信息，不能跟着一起变灰。观众也要能一眼扫到哪张卡是有用的。
            //
            // 两档的语义差别很重要：
            //   ▲ 可升级 ×N —— 场上有 Lv1 同名塔，买下这张卡会**自动**升到 Lv2（强信号，绿）
            //   ◆ 同类   ×N —— 场上有同名塔但等级不匹配/已满级，只能自己拖着合（弱信号，青）
            // 用户诉求是「只要场上有相同的卡，都要标记」，所以后者不能省；
            // 但也不能用"可升级"这个词 —— 那会让玩家以为买了就能升。
            // ⚠️ 这里在 `for` 循环里，跳过要用 `continue`（写 return 会让刷新按钮一起消失）。
            const targets = this.findUpgradeTargets(opt.type);
            const sameOnly = targets.length === 0;
            const markCount = sameOnly ? this.findSameTypeTargets(opt.type).length : targets.length;
            if (sameOnly && markCount === 0)
                continue;
            const markColor = sameOnly ? '#7DD3FC' : '#39FF88';
            const markText = sameOnly ? `◆ 同类 ×${markCount}` : `▲ 可升级 ×${markCount}`;
            {
                const bandY = startY + (r.stars >= 4 ? 6 : 4);
                const bandH = 20;
                // 整卡描边发光 —— 在 3 张卡里最快把这一张挑出来
                ctx.save();
                ctx.strokeStyle = markColor;
                ctx.lineWidth = 3;
                ctx.shadowColor = markColor;
                ctx.shadowBlur = 16;
                ctx.strokeRect(x - 1, startY - 1, optionWidth + 2, optionHeight + 2);
                ctx.restore();
                // 顶部色带 + 文案
                ctx.fillStyle = markColor;
                ctx.fillRect(x, bandY, optionWidth, bandH);
                ctx.fillStyle = sameOnly ? '#04121A' : '#04140A';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(markText, x + optionWidth / 2, bandY + bandH / 2 + 1);
                // 复位成循环外设定的状态（center/alphabetic）—— 下一张卡还要用
                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'center';
            }
        }
        // 刷新按钮
        const refreshBtnX = W / 2 - 70;
        const refreshBtnY = 552;
        const refreshBtnW = 140;
        const refreshBtnH = 44;
        const rerollCost = this.isPremiumSummonMode ? 40 : 20;
        const canRefresh = this.resourceManager.getGold() >= rerollCost;
        ctx.fillStyle = canRefresh ? '#00F0FF' : '#3E4756';
        ctx.fillRect(refreshBtnX, refreshBtnY, refreshBtnW, refreshBtnH);
        ctx.strokeStyle = canRefresh ? '#4FA8FF' : '#5A6577';
        ctx.lineWidth = 2;
        ctx.strokeRect(refreshBtnX, refreshBtnY, refreshBtnW, refreshBtnH);
        ctx.fillStyle = canRefresh ? '#E8F6FF' : '#A9BBD3';
        ctx.font = 'bold 12px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🔄 换一批 (${rerollCost}金)`, refreshBtnX + refreshBtnW / 2, refreshBtnY + refreshBtnH / 2);
        // 提示文字
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '12px sans-serif';
        ctx.fillText('点击卡片买下 · 点击空白处先看看（保留这批卡，不退款也不换牌）', W / 2, refreshBtnY + refreshBtnH + 24);
        // 玩法教程入口（战斗中也能看：合成 / 技能 / 等级上限，6 页讲完）
        this.renderTutorialLink(ctx, SUMMON_TUTORIAL_BTN);
        // 恢复画布文本状态，避免影响后续渲染
        ctx.textAlign = 'left';
    }
    /** 面板底部通用「玩法教程」入口 */
    renderTutorialLink(ctx, r) {
        ctx.strokeStyle = 'rgba(157, 0, 255, 0.65)';
        ctx.lineWidth = 1.5;
        this.roundRect(r.x, r.y, r.w, r.h, 10);
        ctx.stroke();
        ctx.fillStyle = 'rgba(157, 0, 255, 0.10)';
        this.roundRect(r.x, r.y, r.w, r.h, 10);
        ctx.fill();
        ctx.fillStyle = '#C9A8FF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📖 玩法教程 · 合成/技能/上限', r.x + r.w / 2, r.y + r.h / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
    /**
     * 关卡通关结算面板。
     * 展示三件事：本关战绩、搬迁折价回收、以及最重要的 —— 通关奖励抽卡。
     * 奖励卡用大尺寸展示 + 稀有度色描边，让"抽到什么品阶"成为这一刻的焦点。
     */
    renderLevelClear() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const lv = getActiveLevel();
        const nextLv = LEVELS[this.currentLevelIndex + 1];
        ctx.fillStyle = 'rgba(4, 6, 14, 0.96)';
        ctx.fillRect(0, 0, W, this.canvas.height);
        ctx.fillStyle = lv.accent;
        ctx.fillRect(0, 94, W, 3);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 25px sans-serif';
        ctx.fillText('关卡通关', W / 2, 70);
        ctx.fillStyle = lv.accent;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('第 ' + lv.id + ' 关 · ' + lv.name, W / 2, 124);
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '12px sans-serif';
        ctx.fillText('击破 ' + this.levelKillCount + ' 台机械单位　·　通关金币 +' + lv.clearGold, W / 2, 148);
        const unlock = this.newlyUnlockedTowerType;
        if (unlock) {
            const cfg = TOWER_CONFIGS[unlock];
            ctx.fillStyle = 'rgba(12,24,36,0.96)';
            this.roundRect(28, 174, W - 56, 104, 12);
            ctx.fill();
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 1.5;
            this.roundRect(28, 174, W - 56, 104, 12);
            ctx.stroke();
            this.spriteLoader.drawTower(ctx, 76, 226, unlock, 42);
            ctx.textAlign = 'left';
            ctx.fillStyle = cfg.color;
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText('新塔型解锁：' + cfg.name, 112, 207);
            ctx.fillStyle = '#C8D5E6';
            ctx.font = '12px sans-serif';
            ctx.fillText(cfg.special ?? '新增战术选择，加入本关召唤池', 112, 232, 280);
            ctx.fillStyle = '#6D8099';
            ctx.font = '11px sans-serif';
            ctx.fillText('造价 ' + cfg.cost + '　·　伤害 ' + cfg.damage + '　·　射程 ' + cfg.range, 112, 255);
        }
        else {
            ctx.fillStyle = '#A9BBD3';
            ctx.font = '13px sans-serif';
            ctx.fillText('塔型数据库已全部开放', W / 2, 220);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('选择带往下一关的炮塔　' + this.carrySelection.size + ' / ' + Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length), W / 2, 310);
        ctx.fillStyle = '#7F91AA';
        ctx.font = '11px sans-serif';
        ctx.fillText('必须选择 ' + Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length) + ' 座；未选的塔不会跟随进入下一关', W / 2, 329);
        const pageSize = 6;
        const start = this.carryPage * pageSize;
        const cardW = 128, cardH = 86, gapX = 13;
        const startX = (W - (cardW * 3 + gapX * 2)) / 2;
        for (let local = 0; local < pageSize; local++) {
            const tower = this.carryCandidates[start + local];
            if (!tower)
                continue;
            const col = local % 3, row = Math.floor(local / 3);
            const x = startX + col * (cardW + gapX), y = 342 + row * 94;
            const selected = this.carrySelection.has(tower);
            ctx.fillStyle = selected ? 'rgba(0,240,255,0.16)' : 'rgba(15,21,32,0.96)';
            this.roundRect(x, y, cardW, cardH, 9);
            ctx.fill();
            ctx.strokeStyle = selected ? '#00F0FF' : 'rgba(128,155,183,0.35)';
            ctx.lineWidth = selected ? 2 : 1;
            this.roundRect(x, y, cardW, cardH, 9);
            ctx.stroke();
            this.spriteLoader.drawTower(ctx, x + 28, y + 43, tower.getType(), 32, 'center', undefined, tower.getLevel());
            ctx.textAlign = 'left';
            ctx.fillStyle = TOWER_CONFIGS[tower.getType()].color;
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${TOWER_CONFIGS[tower.getType()].name} ${toRoman(tower.getLevel())}`, x + 49, y + 29, 74);
            ctx.fillStyle = '#A9BBD3';
            ctx.font = '10px sans-serif';
            ctx.fillText(RARITY_CONFIGS[tower.getRarity()].key, x + 49, y + 49, 74);
            ctx.fillStyle = selected ? '#00F0FF' : '#708098';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(selected ? '已选中 ✓' : '点击携带', x + 49, y + 68);
        }
        const pageCount = Math.max(1, Math.ceil(this.carryCandidates.length / pageSize));
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6D8099';
        ctx.font = '11px sans-serif';
        ctx.fillText(this.carryCandidates.length ? '‹ 上一页　　 ' + (this.carryPage + 1) + ' / ' + pageCount + '　　 下一页 ›' : '暂无可携带的炮塔', W / 2, 560);
        if (nextLv) {
            ctx.fillStyle = nextLv.accent;
            ctx.font = '12px sans-serif';
            ctx.fillText('下一站：第 ' + nextLv.id + ' 关 · ' + nextLv.name + '　—　' + nextLv.subtitle, W / 2, 598);
        }
        const btn = this.levelClearButtonRect();
        const gradient = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
        gradient.addColorStop(0, this.lightenColor(lv.accent, 0.16));
        gradient.addColorStop(1, lv.accent);
        ctx.fillStyle = gradient;
        this.roundRect(btn.x, btn.y, btn.w, btn.h, 11);
        ctx.fill();
        ctx.strokeStyle = '#E8F6FF';
        ctx.lineWidth = 1.5;
        this.roundRect(btn.x, btn.y, btn.w, btn.h, 11);
        ctx.stroke();
        ctx.fillStyle = '#07111A';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.carrySelection.size === Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length)
            ? '携带 ' + this.carrySelection.size + ' 座　进入下一关 →'
            : '先选择 ' + Math.min(CARRY_TOWER_LIMIT, this.carryCandidates.length) + ' 座炮塔', W / 2, btn.y + btn.h / 2);
        ctx.textBaseline = 'alphabetic';
    }
    renderTowerInfoPanel() {
        if (!this.towerInfoTower)
            return;
        const ctx = this.ctx;
        const tower = this.towerInfoTower;
        const config = tower.getConfig();
        // 面板尺寸和位置。
        // 高度 280 → 420：技能不再由玩家三选一，信息面板必须自己把
        // "这座塔学会了什么"讲清楚（3 个技能 + 规则说明），280 装不下。
        // 最坏情况（Lv4 带 3 技能 + 正在过载）内容画到 panelY+384，
        // 底部关闭提示落在 panelY+405，离合成区面板还有 18px。
        const panelW = 300;
        const panelH = 420;
        const panelX = (GAME_CONSTANTS.CANVAS_WIDTH - panelW) / 2;
        const panelY = 200;
        // 半透明面板背景（不遮挡地图）
        ctx.fillStyle = 'rgba(18, 19, 28, 0.88)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(panelX, panelY, panelW, panelH);
        // 标题栏 —— 暗底 + 塔色强调线（PRD：面板一律暗色半透明，颜色只做强调，
        // 整块铺满塔色会让面板变成一块高饱和色板，和赛博主题的"暗底霓虹"冲突）。
        // 高度 58（原 40）：品阶角标画在 panelY+36..54，
        // 40px 的栏会让角标有一半掉到栏外、压在深色面板上，看着像画坏了。
        ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
        ctx.fillRect(panelX, panelY, panelW, 58);
        ctx.fillStyle = config.color;
        ctx.fillRect(panelX, panelY + 56, panelW, 2);
        // 图标和名称
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 标题栏图标 —— 赛博炮塔是「宽而矮」的（炮管朝右，包围盒约 x∈[-21,+40]、y∈[-15,+19]），
        // 塞进 58px 高的标题栏必须缩小并上移：size 26 时顶端 panelY+16、底座 panelY+38、
        // 右端 panelX+50，正好留在栏内，也不压到 panelX+55 起的塔名。
        // 等级档位：这里用 `26 / ts` 把外框钉死 —— 面板要的是"看得出这是几档的机体"，
        // 不是"图标比别人的大"；直接传 26 会让 Lv4 的炮管伸到 panelX+57，压住塔名。
        const panelIconLevel = tower.getLevel();
        this.spriteLoader.drawTower(ctx, panelX + 24, panelY + 26, tower.getType(), 26 / towerTierScale(panelIconLevel), 'center', undefined, panelIconLevel);
        ctx.fillStyle = config.color;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${config.name}  ${toRoman(tower.getLevel())}`, panelX + 55, panelY + 22);
        // 始终显示标准品阶代码，包含 N，和合成区保持一致。
        {
            const rc = RARITY_CONFIGS[tower.getRarity()];
            const badge = rc.key;
            ctx.font = 'bold 12px sans-serif';
            const bw = ctx.measureText(badge).width + 14;
            const bx = panelX + 55;
            const by = panelY + 36;
            ctx.fillStyle = rc.color;
            this.roundRect(bx, by, bw, 18, 5);
            ctx.fill();
            ctx.fillStyle = '#080B12';
            ctx.textBaseline = 'middle';
            ctx.fillText(badge, bx + 7, by + 10);
            ctx.textBaseline = 'alphabetic';
        }
        // 属性信息（起始 y 从 +60 下移到 +74：品阶角标占到 panelY+54，
        // 14px 字的上缘会往上吃 ~10px，+60 会和角标叠在一起）
        ctx.textAlign = 'left';
        ctx.font = '14px sans-serif';
        let infoY = panelY + 74;
        const lineH = 28;
        const labelX = panelX + 20;
        const valueX = panelX + 130;
        // 单发伤害：与普通命中飘字使用相同的四舍五入；暴击/条件技能会使实战单次伤害浮动。
        ctx.fillStyle = '#FF0033';
        ctx.fillText('⚔️ 单发伤害', labelX, infoY);
        ctx.fillStyle = '#E8F6FF';
        ctx.fillText(`${Math.max(1, Math.round(tower.getDamage()))}`, valueX, infoY);
        infoY += lineH;
        // 射程
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('🎯 射程', labelX, infoY);
        ctx.fillStyle = '#E8F6FF';
        ctx.fillText(`${Math.floor(tower.getRange())}`, valueX, infoY);
        infoY += lineH;
        // 攻速
        ctx.fillStyle = '#FFD700';
        ctx.fillText('💨 攻速', labelX, infoY);
        ctx.fillStyle = '#E8F6FF';
        const atkSpeed = 1 / tower.getAttackInterval();
        ctx.fillText(`${atkSpeed.toFixed(2)}/s`, valueX, infoY);
        infoY += lineH;
        // 理论单体 DPS = 当前基础单发伤害 × 当前攻击频率，不含暴击及条件伤害。
        ctx.fillStyle = '#FF8A1F';
        ctx.fillText('📊 理论DPS', labelX, infoY);
        ctx.fillStyle = '#E8F6FF';
        const dps = tower.getDamage() * atkSpeed;
        ctx.fillText(`${dps.toFixed(1)}`, valueX, infoY);
        infoY += lineH;
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#73839A';
        ctx.fillText('基础值；暴击与条件技能会改变实战伤害', labelX, infoY - 7);
        infoY += 10;
        // 过载状态（跟着属性走，不跟技能走 —— 它是状态不是 build）
        if (tower.isOverloaded()) {
            ctx.fillStyle = '#FF0033';
            ctx.fillText('🔥 过载中', labelX, infoY);
            ctx.fillStyle = '#E8F6FF';
            ctx.fillText('伤害x3 射程x1.5', valueX, infoY);
            infoY += lineH;
        }
        else if (tower.isParalyzed()) {
            ctx.fillStyle = '#4E5A6B';
            ctx.fillText('💤 瘫痪中', labelX, infoY);
            ctx.fillStyle = '#E8F6FF';
            ctx.fillText('无法攻击', valueX, infoY);
            infoY += lineH;
        }
        else if (tower.areSkillsSilenced()) {
            ctx.fillStyle = '#B58CFF';
            ctx.fillText('🔇 技能静默', labelX, infoY);
            ctx.fillStyle = '#E8F6FF';
            ctx.fillText('普通攻击仍有效', valueX, infoY);
            infoY += lineH;
        }
        else if (tower.isBossAttackSlowed()) {
            ctx.fillStyle = '#FF8A1F';
            ctx.fillText('🐌 攻速受扰', labelX, infoY);
            ctx.fillStyle = '#E8F6FF';
            ctx.fillText('Boss技能减速中', valueX, infoY);
            infoY += lineH;
        }
        // ── 基础特性 ──
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('📌 特性', labelX, infoY);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#E8F6FF';
        ctx.fillText(config.special || '无', valueX, infoY);
        infoY += lineH;
        // ── 已学技能 ──
        // 去掉三选一后，这里是玩家唯一能查到"这座塔拿到了哪些技能"的地方。
        // 放在面板最后：技能数量随等级变化（0~3），是最容易长高的那一段，
        // 让它贴着底部生长，上面的固定行不会被挤出去。
        const learnedIds = tower.getLearnedSkills();
        const skillSlots = MAX_TOWER_LEVEL - 1;
        infoY += 4;
        this.drawPanelDivider(panelX + 16, infoY, panelW - 32);
        infoY += 20;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#9D00FF';
        ctx.fillText('✨ 已学技能', labelX, infoY);
        ctx.fillStyle = learnedIds.length > 0 ? '#E8D9FF' : '#5A6B85';
        ctx.textAlign = 'right';
        ctx.fillText(`${learnedIds.length} / ${skillSlots}`, panelX + panelW - 20, infoY);
        ctx.textAlign = 'left';
        infoY += 18;
        // 规则说明 —— 必须标注出来：技能是"每升 1 级自动发放"的，
        // 玩家没有选择权，所以要让他知道"再升一级还会多一个"。
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#5A6B85';
        ctx.fillText(`每升 1 级自动获得 1 个技能（到 Lv.${toRoman(MAX_TOWER_LEVEL)} 共 ${skillSlots} 个）`, labelX, infoY);
        infoY += 20;
        if (learnedIds.length === 0) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#5A6B85';
            ctx.fillText(`尚未获得技能 · 升到 Lv.${toRoman(2)} 解锁第 1 个`, labelX, infoY);
            infoY += 22;
        }
        else {
            for (const id of learnedIds) {
                const sk = findSkillById(id);
                if (!sk)
                    continue;
                // 技能名用紫色（技能系统的专属色），与属性行的白字区分开
                ctx.font = 'bold 12px sans-serif';
                ctx.fillStyle = '#E8D9FF';
                ctx.fillText(`${sk.icon} ${sk.name}`, labelX, infoY);
                // 效果说明跟在后面一行，字号更小、颜色更暗
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#8FA3BF';
                ctx.fillText(sk.description, labelX + 14, infoY + 13);
                infoY += 30;
            }
        }
        // 关闭提示
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('点击任意处关闭', GAME_CONSTANTS.CANVAS_WIDTH / 2, panelY + panelH - 15);
    }
    renderGameOver() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#FF0033';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('游戏失败', this.canvas.width / 2, 290);
        ctx.fillStyle = '#E8F6FF';
        ctx.font = '18px sans-serif';
        const reached = Math.max(1, this.waveManager.getCurrentWave());
        const lv = getActiveLevel();
        ctx.fillText(`第 ${lv.id} 关 · 第 ${reached}/${TOTAL_WAVES} 波`, this.canvas.width / 2, 348);
        ctx.fillStyle = '#8FA3BF';
        ctx.font = '14px sans-serif';
        ctx.fillText(`倒在「${lv.name}」`, this.canvas.width / 2, 374);
        ctx.fillStyle = '#E8F6FF';
        ctx.font = '18px sans-serif';
        ctx.fillText(`通关进度 ${this.currentLevelIndex}/${getLevelCount()} 关`, this.canvas.width / 2, 404);
        ctx.fillText(`击杀敌人: ${this.waveManager.getTotalKilled()}`, this.canvas.width / 2, 432);
        ctx.fillText(`合成次数: ${this.mergeCount}`, this.canvas.width / 2, 460);
        // 重新开始按钮
        ctx.fillStyle = '#9D00FF';
        ctx.fillRect(150, 500, 150, 50);
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('重新开始', this.canvas.width / 2, 530);
        // 玩法教程：输了往往是没搞懂合成/技能，给个回头补课的入口
        this.renderTutorialLink(ctx, RESULT_TUTORIAL_BTN);
    }
    renderVictory() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#39FF88';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('胜利！', this.canvas.width / 2, 288);
        ctx.fillStyle = '#E8F6FF';
        ctx.font = '18px sans-serif';
        ctx.fillText('机械军团已被清除！', this.canvas.width / 2, 336);
        ctx.fillStyle = '#39FF88';
        const totalCampaignWaves = LEVELS.reduce((sum, level) => sum + level.waves.length, 0);
        ctx.fillText(`全 ${getLevelCount()} 关 · ${totalCampaignWaves} 波通关`, this.canvas.width / 2, 366);
        ctx.fillStyle = '#E8F6FF';
        ctx.fillText(`击杀敌人: ${this.waveManager.getTotalKilled()}`, this.canvas.width / 2, 398);
        ctx.fillText(`合成次数: ${this.mergeCount}`, this.canvas.width / 2, 426);
        ctx.fillText(`剩余生命: ${this.resourceManager.getLives()} / ${this.resourceManager.getMaxLives()}`, this.canvas.width / 2, 454);
        // 重新开始按钮
        ctx.fillStyle = '#9D00FF';
        ctx.fillRect(150, 500, 150, 50);
        ctx.fillStyle = '#E8F6FF';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('再来一局', this.canvas.width / 2, 530);
        // 玩法教程：想教朋友玩，或者自己补课，都在这里
        this.renderTutorialLink(ctx, RESULT_TUTORIAL_BTN);
    }
}
/** UP 特效时长（秒）。比合成光环(0.5s)长一倍多，保证眼睛能追上 */
GameManager.LEVEL_UP_FX_DURATION = 1.15;
/** 技能飘字时长（秒）—— 比 UP 特效长，要够玩家把技能名读完 */
GameManager.SKILL_TOAST_DURATION = 1.8;
//# sourceMappingURL=GameManager.js.map