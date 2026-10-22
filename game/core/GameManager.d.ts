/**
 * 游戏主管理器
 * 控制游戏状态、循环、交互
 */
export declare class GameManager {
    private canvas;
    private ctx;
    private spriteLoader;
    private soundManager;
    private taRenderer;
    private env;
    private resourceManager;
    private waveManager;
    private towerMergeSystem;
    private upgradeSystem;
    private gameState;
    /** 教程状态 */
    private tutorialPage;
    /** 教程界面的独立时钟（暂停状态下也要驱动扫描线/呼吸动画） */
    private tutorialElapsed;
    /** 从哪进的教程，退出时回到哪（菜单 / 战场 / 召唤面板） */
    private tutorialReturn;
    /** 开场序幕时间，点击开始后自动播放，点击可跳过 */
    private openingElapsed;
    private gameTime;
    private lastTime;
    private gameSpeed;
    private paused;
    private selectedSlot;
    private placingTower;
    private summonCostPaid;
    private upgradeOptions;
    private upgradeNoticeText;
    /**
     * 通关强化挂起标志（v1.6.2 修复）：每关通关后弹一次强化面板，
     * 选完后不是回 playing，而是进关卡结算（handleLevelCleared）。
     * 普通波不再有强化机会 —— 判据是"关内最后一波清空"。
     */
    private pendingLevelClearAfterUpgrade;
    /** 当前强化面板是否由"通关"触发（渲染标题/副标题区分） */
    private isLevelClearUpgrade;
    /** 通关强化面板上展示的最终波次奖励文案 */
    private levelClearRewardText;
    private normalSummonOptions;
    private premiumSummonOptions;
    /**
     * 召唤改为「看牌免费、选中才付钱」，价格由品阶决定（见 summonPrice）。
     * 因此不再有固定的 SUMMON_COST —— 唯一需要的是"能不能开出面板"的下限，
     * 即最便宜的一档价格。真正的扣费发生在 handleSummonSelect 里按卡计价。
     */
    private readonly SUMMON_ENTRY_COST;
    /** 刷新卡池的费用 */
    private readonly SUMMON_REROLL_COST;
    /** 强化提示横幅的剩余显示时间（秒）与文案 */
    private enhanceToast;
    private enhanceToastText;
    private enhanceToastColor;
    private mergeCount;
    /** Boss 出场红色警告横幅的剩余显示时间（秒） */
    private bossWarningTimer;
    /** 当前关卡序号（0 起） */
    private currentLevelIndex;
    /** 连续多少次召唤没有出 SR 以上 —— 达到 SUMMON_PITY_LIMIT 时强制保底 */
    private summonPity;
    /** 新解锁的塔型；只解锁卡池，不白送实体塔。 */
    private newlyUnlockedTowerType;
    private unlockedTowerTypes;
    private carryCandidates;
    private carrySelection;
    private carryPage;
    private pendingCarryTowers;
    /** 本关击杀总数，用于结算面板展示 */
    private levelKillCount;
    private attackEffects;
    private mergeEffects;
    /**
     * 升级（UP!）特效。合成 / 同卡自动升级时压入一条，
     * 画面上会出现"金色扩散环 + 上浮的 UP! Lv.Ⅳ" ——
     * 光靠角标数字变化，玩家在混战里根本注意不到自己升级了。
     */
    private levelUpFlashes;
    /**
     * 「自动获得技能」飘字。
     *
     * 升级不再弹三选一，玩家如果不看到"这次给了我什么技能"，
     * 就会觉得技能是凭空冒出来的 —— 这条飘字是自动发放的**唯一反馈通道**。
     */
    private skillGainToasts;
    /**
     * 渲染层动画时钟（秒）。**不用 `performance.now()`** ——
     * 像素断言要求同一串 dt 得到同一帧，墙上时钟会让"脉冲环画在哪"每次都不同。
     */
    private animTime;
    /** UP 特效时长（秒）。比合成光环(0.5s)长一倍多，保证眼睛能追上 */
    private static readonly LEVEL_UP_FX_DURATION;
    /** 技能飘字时长（秒）—— 比 UP 特效长，要够玩家把技能名读完 */
    private static readonly SKILL_TOAST_DURATION;
    private pulseEffects;
    private bgParticles;
    private vfx;
    /** 注入给所有防御塔的表现出口（Tower 只发事件，不知道 GameManager） */
    private vfxSink;
    private draggingTower;
    private dragStartX;
    private dragStartY;
    private hasDragged;
    private showTowerInfo;
    private towerInfoTower;
    private premiumSummonCount;
    private premiumSummonPity;
    private isPremiumSummonMode;
    private nextWaveCountdown;
    private nextWaveCountdownActive;
    private waveElapsed;
    private waveTimeLimit;
    /** 本波是否因超时而被强制结束（用于给出明确反馈，而不是让玩家以为卡住了） */
    private waveTimedOut;
    private mergeAreaSlots;
    private buttons;
    private touchHandled;
    private audioStarted;
    private lastCountdownTick;
    constructor(canvas: HTMLCanvasElement);
    private initBgParticles;
    private roundRect;
    /**
     * 面板内的分组分隔线：中间亮、两端透明的细横线。
     * 用它把信息面板切成「属性 / 已学技能 / 基础特性」三段 ——
     * 没有分隔线时，技能名会和属性行糊成一片，看不出分组。
     */
    private drawPanelDivider;
    private setupButtons;
    private setupInput;
    /**
     * 首次用户交互后解锁音频（浏览器自动播放策略），
     * 并启动赛博环境层与动态音乐。
     * @param track 首曲；若首次点击即「开始游戏」，直接进战斗曲，避免无谓的交叉淡化
     */
    private startAudio;
    private getCanvasCoords;
    private handlePointerDown;
    private handlePointerMove;
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
    private towerAtSlot;
    /**
     * 拖拽落点解析：指针当前悬停在哪个可放置区域上。
     * 检查顺序与 handlePointerUp 完全一致（合成区 → 卖钱 → 战场），
     * 否则"看到的提示"和"松手后真正发生的事"会不一致，那比没有提示更糟。
     */
    private resolveDropTarget;
    private handlePointerUp;
    /**
     * 卖出区：**拖拽落点**，不是按钮（不参与 handleClick 的按钮循环）。
     * 与底部三键同排，但更矮更窄 —— 它是"拖过来松手"的目标，不需要按钮那么大的点击面。
     * 左缘 346 与加速键右缘 334 留 12px 间隙，红面板不会再盖住「1x」。
     * 尺寸 86×46（旧值 80×60：高度减 23%、面积减 18%），中心 (389, 754)。
     * 改这里必须同步 `verify_drag.mjs` 里"卖出"用例的注释坐标。
     */
    private getSellArea;
    private handleClick;
    private isInButton;
    private handleButtonClick;
    private openTutorial;
    private handleTutorialClick;
    private handleGridClick;
    private handleSlotClick;
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
    private checkAndTriggerSkillSelect;
    private applySkillEffect;
    private tryMerge;
    /**
     * 可召唤的防御塔池：11 种防御塔，各带一个元素/机制特色。
     * 抽卡按 1/造价 加权 —— 便宜的更常见，贵的属于「运气好才出现」。
     */
    private get summonPool();
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
    private generateSummonOptions;
    /** 更新保底计数：抽到 SR 以上就清零，否则累加 */
    private registerSummonResult;
    /** 距离保底还差几抽 */
    private getPityRemaining;
    /**
     * 把防御塔放进合成区第一个空位；无空位返回 false。
     *
     * ── 同卡自动升级 ──
     * 买入的防御塔永远是 Lv1。如果合成区里已经躺着一张**同类型 Lv1** 的卡，
     * 就不占新格子，直接把它吃掉升到 Lv2（带 UP 特效 + 技能三选一）。
     * 没有这一步，玩家买重复卡只会把 6 个格子塞满，还得手动拖一次才算合成 ——
     * 而"买到重复卡 = 白白浪费一次召唤"本身就是最劝退的体验。
     */
    private placeTowerInMergeArea;
    /**
     * 自动合成检查：扫描合成区，如果有两个同类型+同等级的塔，自动合成升级。
     * 在每次向合成区放置塔后调用。
     */
    private autoMergeCheck;
    /**
     * 统一的"升级了"反馈：合成光环 + UP 特效 + 音效 + 技能三选一。
     *
     * 所有会让防御塔涨等级的入口都必须走这里（塔位合成 / 合成区合成 / 同卡自动升级），
     * 否则会出现"升了级但没有技能可选"这种半截状态。
     */
    private triggerLevelUpFeedback;
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
    private summonTower;
    private handleSummonSelect;
    /** 关卡结算面板：点击「进入下一关」推进 */
    private handleLevelClearClick;
    /** 关卡结算面板按钮位置（render 与 click 必须共用） */
    private levelClearButtonRect;
    private handleUpgradeSelect;
    /**
     * 强化选择完成后的统一收尾（v1.6.2）。
     * 通关强化 → 清挂起标志并进入关卡结算（handleLevelCleared）；
     * 普通强化 → 回 playing + exitUpgradePhase。
     * 两个入口（随机 / 点选卡片）都必须走这里，否则通关后会卡在 upgrade_select。
     */
    private finishUpgradeSelection;
    /** 随机强化按钮位置（render 与 click 共用） */
    private upgradeRandomButtonRect;
    private startGame;
    /**
     * 进入指定关卡。这是关卡系统的中枢：
     *   1. setActiveLevel() 重绑定 PATH_POINTS / TOWER_SLOTS / WAVE_CONFIGS
     *   2. 应用关卡环境词缀（目前只有攻速惩罚是全局的，死亡分裂在击杀处处理）
     *   3. 把上一关的防御塔搬迁到新地图的塔位上，由玩家选择最多六座带走
     *   4. 重置波次管理器，开始第一波
     */
    private startLevel;
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
    private resetWaveClock;
    /**
     * 关卡搬迁：把场上所有防御塔按价值降序塞进新地图的塔位。
     *
     * 三张地图的塔位数量不同（14 / 16 / 12），从机械巢穴（16）搬到核心反应堆（12）
     * 会有 4 座塔放不下。溢出处理分两级：
     *   ① 先进合成区的空位（6 个）—— 玩家还能把它们拖到场上
     *   ② 合成区也满了 → 按造价 × 稀有度倍率折价回收成金币
     * 这样"塔位变少"不是惩罚，而是一次被迫的取舍与资源回收。
     */
    private relocateTowersForLevel;
    private handleLevelCleared;
    private advanceToNextLevel;
    private restartGame;
    start(): void;
    /** 首次运行自动弹教程（localStorage 标记，只弹一次） */
    private maybeFirstRunTutorial;
    private markTutorialSeen;
    unlockAudio(): void;
    private gameLoop;
    private update;
    /**
     * 自爆机雷死亡：瘫痪半径内的所有防御塔。
     * 用 playParalyze 而不是新的音效 —— 玩家已经建立了"这个声音 = 我的塔不能打了"
     * 的条件反射（过载结束时也是这个音），复用它比引入新音效更容易理解。
     */
    private applyBomberParalyze;
    /**
     * 本波结束后是否给强化机会。
     * 强化只在**每关通关时**给一次（用户诉求：每一关只能强化一次，就是这一关通过后），
     * 由 isLevelCleared 分支直接触发，因此这里恒返回 false 是预期行为。
     * ⚠️ 历史 bug：曾按关内波号 `wave === 10` 判，但每关只有 5 波 → 永假 → 强化面板
     * 一次都没弹过。判据必须落在"关内最后一波清空"上，不要按具体波号写死。
     */
    private shouldOfferEnhancement;
    /** 距离本关通关（=下一次强化机会）还差几波（0 = 本波通关就有） */
    private getEnhanceCountdown;
    private showEnhanceToast;
    private startNextWave;
    /** 根据关卡进度与剩余生命值更新音乐张力（0~1） */
    private updateTension;
    /**
     * 修复：精英爆炸效果
     */
    private applyEliteExplosion;
    /**
     * 修复：正确生成分裂小怪
     * 使用 Enemy 的正式方法设置位置和路径进度
     */
    private spawnMiniEnemies;
    /** Boss技能有统一预警和冷却；普通护卫不会继承Boss技能。 */
    private updateBossSkills;
    private castBossSkill;
    /**
     * 确保场上每座塔都拿到表现出口。
     * 合成/换关后会造新塔，这里逐帧补一次（`setVfxSink` 幂等，开销是一次引用赋值）。
     */
    private injectVfxSink;
    private updateTowers;
    private updateEffects;
    private render;
    private renderBgParticles;
    private updateBgParticles;
    /**
     * 主菜单：赛博标题 + 霓虹装饰框 + 切角开始按钮。
     */
    private renderMenu;
    /** 赛博防线启动序幕：扫描网格、核心点亮、敌方入侵警报，最后自动进入第一波。 */
    private renderOpening;
    private renderGame;
    private renderMap;
    private renderCoreOverlay;
    /**
     * 这张召唤卡能升级的同类目标（战场塔 + 合成区卡）。
     *
     * 判据与 `Tower.canMergeWith` 严格一致：**同类型 + 同等级 + 未满级**。
     * 召唤出来的卡永远是 Lv1，所以实际上就是"找场上的 Lv1 同名塔/卡"。
     *
     * 为什么不按"同类就标"来写：Lv1 的卡合不掉 Lv3 的塔 —— 标了就是骗玩家，
     * 玩家照着标记去拖却合不了，比不标还糟。
     */
    private findUpgradeTargets;
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
    private findSameTypeTargets;
    /**
     * 当前召唤面板里所有卡的可升级目标类型集合。
     * 非召唤态返回 null —— 调用方据此决定要不要画高亮（战场高亮只在选卡时出现）。
     */
    private getSummonUpgradeTypes;
    /**
     * 召唤面板里"场上有同类、但没有一个能自动升级"的类型集合（弱一档的青色标记）。
     * 只有可升级优先 —— 一个类型不会同时出现在两个集合里，避免卡面画两条色带。
     */
    private getSummonSameOnlyTypes;
    private renderTowers;
    private darkenColor;
    private lightenColor;
    private hexToRgb;
    private playTowerAttackSound;
    /** 将画布 X 坐标映射为立体声定位：-1(左) ~ 1(右) */
    private panFromX;
    private renderEnemies;
    private renderEffects;
    private renderUI;
    private renderMergeArea;
    private renderSellArea;
    /**
     * 落点提示环：拖动时把"松手后会发生什么"画在目标格子上。
     * 绿 = 能放 / 能合成，红 = 放不了，灰 = 放回原位（空操作），金 = 卖出。
     */
    private drawDropHint;
    /**
     * 拖拽中的防御塔 + 落点提示。
     *
     * 玩家必须时刻看见"我拖着的是谁、放到哪里会怎样"：
     * 手指下面只有一个光标的塔战没有任何策略性，玩家既看不清也看不懂。
     * 这也是为什么下面 6 个合成格的塔也必须能拖出来并一直显示。
     */
    private renderDraggingTower;
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
    private drawCrossedSwords;
    /**
     * 本波词缀常驻角标（右上角）。
     * 旧设计里变异是纯随机且不可见的，玩家打到一半才发现敌人打不动。
     */
    private renderModifierChip;
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
    private renderEnhanceToast;
    private renderNextWavePreview;
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
    private renderLevelUpFlashes;
    /**
     * 「自动获得技能」飘字。
     *
     * 升级不再弹三选一，这条飘字是**唯一**能告诉玩家"这次给了我什么"的通道 ——
     * 没有它，技能就是凭空冒出来的。画在 UP! 标签**上方**（`-72` 起步），
     * 两条标签各自有独立生命周期，靠固定间距避免叠字。
     */
    private renderSkillGainToasts;
    /**
     * Boss 出场警告：屏幕中央红色大字「⚠ BOSS 来袭 ⚠」+ 副标题 Boss 名称。
     * 持续 2 秒，带闪烁与缩放动画，确保玩家第一时间注意到。
     */
    private renderBossWarning;
    /**
     * 赛博按钮：暗底 + 霓虹描边 + 切角 + 内侧高光。
     * color 决定霓虹色（召唤=紫 / 速度=青 / 过载=橙/红/灰）。
     */
    private renderButton;
    private renderOverloadButton;
    private renderMuteButton;
    /**
     * 特级召唤：50金，无N卡，高级卡概率高，10次保底SSR
     * 进入三选一面板，支持换卡（40金/次）
     *
     * 付费逻辑：首次进入扣50金并生成3张卡；如果没买就退出，保留这批卡，
     * 再次进入时不重复扣费（与普通召唤一致）。
     */
    private premiumSummon;
    /**
     * 生成特级召唤选项：无N卡，高级卡概率高，10次保底SSR
     */
    private generatePremiumSummonOptions;
    private drawWrappedText;
    private renderUpgradeSelect;
    private renderSummonSelect;
    /** 面板底部通用「玩法教程」入口 */
    private renderTutorialLink;
    /**
     * 关卡通关结算面板。
     * 展示三件事：本关战绩、搬迁折价回收、以及最重要的 —— 通关奖励抽卡。
     * 奖励卡用大尺寸展示 + 稀有度色描边，让"抽到什么品阶"成为这一刻的焦点。
     */
    private renderLevelClear;
    private renderTowerInfoPanel;
    private renderGameOver;
    private renderVictory;
}
