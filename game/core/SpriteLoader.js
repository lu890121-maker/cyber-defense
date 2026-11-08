/**
 * 精灵图系统（图片化 + 程序化兜底）
 *
 * 每座塔 / 每种敌人都有独立像素画素材（assets/sprites/*.png）：
 *   - 用户提供素材 → tools/make_sprites.py 切片去背景
 *   - 缺失素材     → tools/derive_sprites.py 从已有素材派生（色相融合/特效叠加）
 * 任何单张图加载失败时，该类型自动回退到程序化矢量绘制，
 * 不会出现"隐形单位"；isLoaded() 只在至少一张图就绪后为 true。
 */
import { TowerType, EnemyType, TOWER_CONFIGS, ENEMY_CONFIGS } from '../config/GameConfig.js';
/**
 * 机械军团通用装甲色（敌人绘制用）。
 * 各兵种的识别色来自 ENEMY_CONFIGS[type].color，只用在发光镜头 / 能量缝 / 条纹上，
 * 装甲底色统一压暗 —— 否则同屏十几只怪会变成一团彩色噪声。
 *
 * ⚠️ 但不能压得太暗：通道中段是暗轨（#12131C），敌人正好走在上面，
 * 装甲若取 #232833 就会糊成一块黑。所以基准亮度定在「明显亮于通道」这一档。
 */
const MECH_DARK = '#333B4A';
const MECH_MID = '#4E5A6E';
const MECH_HI = '#76869F';
const MECH_EDGE = '#9BACC7';
const SPRITE_BASE = 'assets/sprites/';
/**
 * 炮塔刻意不加载旧的静态 PNG：单帧图会盖掉炮口朝向、开火后坐和等级装甲。
 * 战场与 UI 统一走下方的矢量机甲绘制，11 种武器头各自带实时动画。
 */
const TOWER_SPRITE = {};
/**
 * 每种防御塔的拍翅相位偏移。同屏多座防御塔如果同步拍翅会很假（像齿轮），
 * 所以按类型给一个固定偏移量；用枚举序数手写，不依赖 TS 枚举运行时顺序。
 */
const SERAPH_SEED = {
    [TowerType.MACHINE_GUN]: 0.0,
    [TowerType.FROST]: 1.1,
    [TowerType.ELECTRIC]: 2.3,
    [TowerType.POISON]: 3.5,
    [TowerType.BOMB]: 4.7,
    [TowerType.LASER]: 7.1,
    [TowerType.SNIPER]: 8.3,
    [TowerType.FLAME]: 9.5,
    [TowerType.MAGNETIC]: 10.7,
    [TowerType.SINGULARITY]: 16.7
};
/** 敌人维持程序化机械造型，避免使用和世界观不符的丧尸题材旧素材。 */
const ENEMY_SPRITE = {};
const GAIT = {
    [EnemyType.NORMAL]: { hop: 3.2, squash: 0.075, sway: 2.2, lean: 0.040, freq: 1.00, mode: 'ground' },
    [EnemyType.FAST]: { hop: 4.8, squash: 0.110, sway: 3.0, lean: 0.065, freq: 1.45, mode: 'ground' },
    [EnemyType.HEAVY]: { hop: 2.0, squash: 0.145, sway: 1.5, lean: 0.028, freq: 0.62, mode: 'ground' },
    [EnemyType.SPLIT]: { hop: 3.4, squash: 0.095, sway: 2.8, lean: 0.055, freq: 1.05, mode: 'ground' },
    [EnemyType.HEALER]: { hop: 2.6, squash: 0.060, sway: 1.8, lean: 0.035, freq: 0.90, mode: 'ground' },
    [EnemyType.MINI]: { hop: 3.8, squash: 0.130, sway: 3.4, lean: 0.080, freq: 1.70, mode: 'ground' },
    [EnemyType.GHOST]: { hop: 0.0, squash: 0.030, sway: 2.6, lean: 0.025, freq: 0.55, mode: 'float' },
    [EnemyType.SHIELD]: { hop: 2.4, squash: 0.100, sway: 1.6, lean: 0.028, freq: 0.75, mode: 'ground' },
    [EnemyType.BOMBER]: { hop: 3.0, squash: 0.110, sway: 2.6, lean: 0.060, freq: 1.10, mode: 'ground' },
    // v1.9：悬浮系（无人机/虚空行者）用 float，重甲系用低频大压扁
    [EnemyType.EMP_DRONE]: { hop: 0.0, squash: 0.020, sway: 2.4, lean: 0.020, freq: 0.50, mode: 'float' },
    [EnemyType.REFLECTOR]: { hop: 2.2, squash: 0.120, sway: 1.4, lean: 0.026, freq: 0.70, mode: 'ground' },
    [EnemyType.ACCELERATOR]: { hop: 3.0, squash: 0.090, sway: 2.0, lean: 0.040, freq: 1.15, mode: 'ground' },
    [EnemyType.ASSASSIN]: { hop: 4.2, squash: 0.090, sway: 2.8, lean: 0.070, freq: 1.35, mode: 'ground' },
    [EnemyType.MAGNETIC_GUARD]: { hop: 1.8, squash: 0.130, sway: 1.2, lean: 0.022, freq: 0.58, mode: 'ground' },
    [EnemyType.REGENERATOR]: { hop: 2.6, squash: 0.110, sway: 2.0, lean: 0.030, freq: 0.72, mode: 'ground' },
    [EnemyType.ELITE_STORM]: { hop: 0.0, squash: 0.030, sway: 1.8, lean: 0.022, freq: 0.45, mode: 'float' },
    [EnemyType.ELITE_FORTRESS]: { hop: 1.6, squash: 0.075, sway: 1.0, lean: 0.018, freq: 0.48, mode: 'ground' },
    [EnemyType.ELITE_COMMANDER]: { hop: 2.4, squash: 0.085, sway: 1.6, lean: 0.030, freq: 0.66, mode: 'ground' },
    [EnemyType.ELITE_VOIDWALKER]: { hop: 0.0, squash: 0.030, sway: 2.8, lean: 0.030, freq: 0.55, mode: 'float' },
    [EnemyType.BOSS]: { hop: 1.9, squash: 0.070, sway: 1.1, lean: 0.020, freq: 0.45, mode: 'ground' },
    [EnemyType.BOSS_WARDEN]: { hop: 2.4, squash: 0.090, sway: 1.5, lean: 0.030, freq: 0.52, mode: 'ground' },
    [EnemyType.BOSS_NIGHTMARE]: { hop: 2.8, squash: 0.075, sway: 1.8, lean: 0.040, freq: 0.60, mode: 'ground' }
};
/**
 * 由行走相位算出姿态。相位按「真实位移」推进，所以步频天然跟着速度走：
 * 侦察机兵步子密而小跳，重装装甲车一步一顿、落地砸得最扁。
 */
export function computeEnemyAnim(type, phase, idle = 0) {
    const g = GAIT[type] || GAIT[EnemyType.NORMAL];
    if (g.mode === 'float') {
        // 幽灵：没有步态，整体漂浮 + 半透明脉动（配合相位化机制一起读）
        const f = Math.sin(idle * 1.9 + phase * 0.35);
        return {
            hop: 0, sx: 1, sy: 1 + f * 0.022,
            sway: Math.sin(idle * 1.1) * g.sway,
            lean: Math.sin(idle * 0.8) * g.lean,
            alpha: 0.72 + f * 0.14,
            lift: f * 3
        };
    }
    const p = phase * g.freq;
    // 腾空时纵向拉伸、落地时压扁 —— 这是"有重量"的关键一帧
    const squash = -Math.cos(p * 2) * g.squash;
    return {
        hop: Math.abs(Math.sin(p)) * g.hop,
        sx: 1 - squash * 0.55,
        sy: 1 + squash,
        sway: Math.sin(p * 0.5) * g.sway,
        lean: Math.sin(p * 0.5) * g.lean,
        alpha: 1,
        lift: 0
    };
}
/**
 * 等级视觉档位（Lv1..Lv4）——「升级要看得出来」的唯一事实来源。
 *
 * 为什么需要它：等级此前只体现为一枚 10px 的 "Lv.II" 小字角标，在 40px 的塔身上
 * 几乎读不出来 —— 玩家辛苦合成完，画面没有给出"变强了"的反馈。
 * 视觉必须自己会说话，所以每个档位在**四个维度同时加码**：
 *
 *   ① 体量 —— 整机按 TIER_SCALE 放大（剪影变大，这是最强信号）
 *   ② 结构 —— 逐档叠加装甲件：侧裙 → 能量罐 + 肩甲尖刺 → 支撑稳定腿
 *   ③ 光能 —— 主题色辉光按 TIER_GLOW 提亮，Lv4 再加环绕能量环与悬浮粒子
 *   ④ 徽记 —— 角标随塔高上移，不会被长大的塔盖住
 *
 * 剪影优先：40px 下细节会糊成一团（见 MEMORY「剪影 + 元素色 + 法器形」三信号），
 * 所以主要靠"外轮廓变宽变高"来传达，细节点到为止。
 *
 * 放大锚点是**底座接触点**（局部坐标 (0, 15)）—— 塔是"从脚下长高"，
 * 而不是整体上浮，否则底座会脱离它自己那块地砖。
 */
const TIER_SCALE = [1, 1.0, 1.08, 1.16, 1.26, 1.38];
const TIER_GLOW = [1, 1.0, 1.40, 1.85, 2.30, 2.80];
/** 等级 → 档位索引（越界一律夹到合法范围，UI 传 0 也不会炸） */
function tierOf(level) {
    const n = Math.round(level ?? 1);
    return Math.max(1, Math.min(TIER_SCALE.length - 1, n));
}
/**
 * 等级档位缩放（Lv1..Lv4 → 1.00 / 1.08 / 1.16 / 1.26）。
 * GameManager 画底座光圈 / 品阶光环 / 等级角标时也用它 ——
 * 保证"塔变大了"和"底座跟着变大"用的是同一个数，不会各算各的。
 */
export function towerTierScale(level) {
    return TIER_SCALE[tierOf(level)];
}
/** 各器械炮口在武器局部坐标中的前伸距离（size=40 基准）。 */
const TOWER_MUZZLE_LOCAL_REACH = {
    [TowerType.MACHINE_GUN]: 33, [TowerType.FROST]: 30, [TowerType.ELECTRIC]: 29,
    [TowerType.POISON]: 28, [TowerType.BOMB]: 21,
    [TowerType.LASER]: 30, [TowerType.SNIPER]: 42, [TowerType.FLAME]: 28,
    [TowerType.MAGNETIC]: 14, [TowerType.SINGULARITY]: 25
};
/** 返回同一炮口在世界平面中的偏移，供等级特效球与弹道共用。 */
export function getTowerMuzzleOffset(type, level, aim, recoil = 0) {
    const tierScale = towerTierScale(level);
    const reach = (TOWER_MUZZLE_LOCAL_REACH[type] ?? 28) * tierScale;
    // 武器枢轴在局部 y=-3；整塔按底座 (0,15) 锚定放大。
    const pivotY = 15 + (-3 - 15) * tierScale;
    // 开火时机身前扑与反向后坐的合成位移，令光球/弹道与炮管口保持贴合。
    // 前扑/后坐位移发生在档位缩放变换之外。
    const lunge = recoil * 1.3;
    return {
        x: Math.cos(aim) * (reach + lunge),
        y: pivotY + Math.sin(aim) * (reach + lunge)
    };
}
/**
 * 塔的**可视顶端**（局部坐标，负值向上，size=40 基准，未乘 size/40）。
 * 档位放大是以底座 (0,15) 为锚的，所以 GameManager 换算成屏幕坐标是
 *   `y + 15 + (localTop - 15) * tierScale`
 * —— 等级角标必须挂在这条线之上，避免贴近 Lv4 炮口的能源核心。
 *
 * ⚠️ 实测包围盒（`tools/.tmp_bbox` 那类扫描，size=40 / aim=0）：11 座塔的机身顶端在
 * 局部 y ≈ -11 ~ -15，**不是**文档里曾写的 -30。改档位造型时必须同步这里。
 */
export function towerVisualTop(level) {
    const tier = tierOf(level);
    // Lv4 能量核心随炮口朝向移动，角标仍按塔身本体上沿定位。
    return tier >= 4 ? -35 : -15;
}
export class SpriteLoader {
    constructor() {
        this.time = 0;
        this.towerImgs = new Map();
        this.enemyImgs = new Map();
        /** 状态染色缓存：key = type|color，避免每帧重算 source-atop */
        this.tintCache = new Map();
    }
    async load() {
        const jobs = [];
        const loadOne = (map, key, file) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { map.set(key, img); resolve(); };
            img.onerror = () => { console.warn(`[Sprite] 加载失败: ${file}`); resolve(); };
            img.src = SPRITE_BASE + file + '.png';
        });
        for (const [type, file] of Object.entries(TOWER_SPRITE)) {
            jobs.push(loadOne(this.towerImgs, type, file));
        }
        for (const [type, file] of Object.entries(ENEMY_SPRITE)) {
            jobs.push(loadOne(this.enemyImgs, type, file));
        }
        await Promise.all(jobs);
        // 总数从映射表算，别写死数字 —— 删掉 6 座混合塔之后这里曾经还印着 /29
        const total = Object.keys(TOWER_SPRITE).length + Object.keys(ENEMY_SPRITE).length;
        console.log(`[Sprite] ${this.towerImgs.size + this.enemyImgs.size}/${total} 张精灵图就绪`);
    }
    isLoaded() {
        return this.towerImgs.size > 0 || this.enemyImgs.size > 0;
    }
    /** 已加载数量（验证脚本用） */
    getLoadedCount() {
        return this.towerImgs.size + this.enemyImgs.size;
    }
    update(deltaTime) {
        this.time += deltaTime;
    }
    /**
     * 绘制防御塔：优先精灵图，缺失则程序化兜底。
     * anchor='bottom'：精灵坐在 y 上（战场，脚踩底座光圈）
     * anchor='center'：精灵以 y 为中心（召唤卡/拖动预览/信息面板等 UI，与旧行为一致）
     * anim 不传 = idle 自拍（UI 用）；战场由 drawTowerAnim 传 flap/rec 演出攻击动作
     * level 传 1..4 → 按档位放大并叠加装甲（见 TIER_SCALE 注释）。
     *   ⚠️ UI 若受版面尺寸约束，传 `size / towerTierScale(level)` 把外框钉住，
     *   这样"看得见档位装甲"但不会撑破卡片（信息面板标题栏就是这么用的）。
     */
    drawTower(ctx, x, y, type, size = 40, anchor = 'center', anim, level = 1) {
        const img = this.towerImgs.get(type);
        if (img) {
            const tierScale = towerTierScale(level);
            const h = size * 1.22 * tierScale;
            const w = h * (img.width / img.height);
            const top = anchor === 'bottom' ? y - h + size * 0.16 * tierScale : y - h / 2;
            ctx.drawImage(img, x - w / 2, top, w, h);
            return;
        }
        this.drawTowerProcedural(ctx, x, y, size, type, anim, level);
    }
    /**
     * 战场防御塔：赛博炮塔造型 + 全套动作反馈。
     *
     * 动作分层（这是「不像贴图」的关键，全部由时间与攻击事件驱动）：
     *   · idle   —— 机体轻微呼吸浮动 + 极缓摇摆（伺服机构在微调，不是站桩）
     *   · 瞄准   —— 炮塔头绕云台旋转到目标方向（机体主体保持直立，只有"朝目标的部分"转）
     *   · 开火   —— 后坐抖动 + 挤压拉伸 + 炮口冲击波弧 + 逐塔特色（转管/电弧/火舌/磁场环…）
     *   · 过载   —— 整机泛红脉动；瘫痪 —— 静止发灰
     *
     * UI 各处（召唤卡/信息面板）仍用 drawTower 的 idle 版本，不动。
     */
    drawTowerAnim(ctx, x, y, type, size = 40, opts = {}) {
        const aim = opts.aim ?? -Math.PI / 2;
        const rec = Math.max(0, Math.min(1, opts.recoil ?? 0));
        const seed = opts.seed ?? 0;
        const level = opts.level ?? 1;
        const t = this.time;
        // 瘫痪：静止、发灰 —— "它已经不动了"必须看得出来
        if (opts.paralyzed) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            this.drawTower(ctx, x, y, type, size, 'bottom', undefined, level);
            ctx.restore();
            return;
        }
        // 拍翅相位：idle 6.2 rad/s，攻击瞬间提到 ~24 rad/s（扇得猛）
        const flap = Math.sin(t * (6.2 + rec * 18) + seed * 1.3 + SERAPH_SEED[type]);
        const bob = Math.sin(t * 2.1 + seed * 1.7) * 1.1;
        const sway = Math.sin(t * 1.15 + seed * 2.3) * 0.013;
        const lean = Math.cos(aim) * 0.075 * (1 + rec * 0.6);
        // 朝目标前扑：攻击越猛，身体越往瞄准方向栽
        const lunge = rec * 4.5;
        const sx = 1 + rec * 0.15;
        const sy = 1 - rec * 0.13;
        const rx = -Math.cos(aim) * rec * 3.2;
        const ry = -Math.sin(aim) * rec * 3.2;
        const pivotY = y - size * 0.05;
        ctx.save();
        ctx.translate(x + rx + Math.cos(aim) * lunge, pivotY + ry + bob);
        ctx.rotate(sway + lean);
        ctx.scale(sx, sy);
        ctx.translate(-x, -pivotY);
        // 档位体量：塔越高，过载辉光 / 炮口冲击波 / 特色特效都要按同一比例外扩，
        // 否则 Lv4 的塔会"炮口冲出冲击波之外"，一眼就看出特效和机身脱节。
        const ts = towerTierScale(level);
        if (opts.overload) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.14 + Math.abs(Math.sin(t * 14)) * 0.1;
            const og = ctx.createRadialGradient(x, y - size * 0.5, 0, x, y - size * 0.5, size * 0.85 * ts);
            og.addColorStop(0, 'rgba(255,80,60,0.9)');
            og.addColorStop(1, 'rgba(255,80,60,0)');
            ctx.fillStyle = og;
            ctx.beginPath();
            ctx.arc(x, y - size * 0.5, size * 0.85 * ts, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        this.drawTower(ctx, x, y, type, size, 'bottom', { flap, rec, aim }, level);
        ctx.restore();
        // 开火：炮口冲击波（朝瞄准方向扩散的弧）
        if (rec > 0.28) {
            const k = Math.min(1, (rec - 0.28) * 2.4);
            const mx = x + Math.cos(aim) * size * 0.62 * ts;
            const my = (y - size * 0.08 * ts) + Math.sin(aim) * size * 0.42 * ts;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = k;
            ctx.strokeStyle = 'rgba(255,214,150,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(mx, my, size * (0.16 + k * 0.2) * ts, aim - 0.75, aim + 0.75);
            ctx.stroke();
            ctx.restore();
        }
        // 特色叠加画在挤压之外，免得被拉变形
        const headY = y - size * 0.62 * ts + bob;
        const mx = x + Math.cos(aim) * size * 0.36 * ts;
        const my = headY + Math.sin(aim) * size * 0.22 * ts;
        this.drawTowerFlourish(ctx, type, x, headY, mx, my, size, aim, rec, seed);
    }
    // ── 逐塔特色表现 ─────────────────────────────────────────
    drawTowerFlourish(ctx, type, bx, hy, mx, my, size, aim, rec, seed) {
        const t = this.time;
        const S = size;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const spinning = (color, r) => {
            const spin = t * (7 + rec * 30);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const a = spin + i * (Math.PI * 2 / 3);
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
                ctx.stroke();
            }
        };
        const arcs = (color, n, r) => {
            // 确定性抖动：不能用 Math.random()，否则截图/像素断言每次都不一样
            const jit = (k) => Math.sin(k * 12.9898 + Math.floor(t * 30) * 78.233) * 0.5;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            for (let i = 0; i < n; i++) {
                const a = t * 9 + i * 2.1 + seed;
                const x0 = bx + Math.cos(a) * r * 0.55;
                const y0 = hy + Math.sin(a) * r * 0.5;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x0 + jit(i * 3 + 1) * 7, y0 + jit(i * 3 + 2) * 7);
                ctx.lineTo(x0 + jit(i * 3 + 3) * 11, y0 + jit(i * 3 + 4) * 11);
                ctx.stroke();
            }
        };
        const bubbles = (color, n, baseY) => {
            ctx.fillStyle = color;
            for (let i = 0; i < n; i++) {
                const ph = (t * 0.6 + i / n + seed * 0.1) % 1;
                const r = 1 + ph * 2.2;
                const bxr = bx + Math.sin(ph * 7 + i) * 7;
                ctx.globalAlpha = (1 - ph) * 0.7;
                ctx.beginPath();
                ctx.arc(bxr, baseY - ph * S * 0.5, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        const frost = (color) => {
            for (let i = 0; i < 4; i++) {
                const ph = (t * 0.5 + i / 4 + seed * 0.2) % 1;
                ctx.globalAlpha = (1 - ph) * 0.35;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(bx + Math.sin(i * 2 + t) * 10, hy + S * 0.42 - ph * S * 0.3, 2 + ph * 4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        const fuseSpark = () => {
            const f = 0.5 + Math.abs(Math.sin(t * 18)) * 0.5;
            ctx.fillStyle = '#fde047';
            ctx.globalAlpha = f;
            ctx.beginPath();
            ctx.arc(bx + 4, hy - S * 0.34, 1.8 + f * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.arc(bx + 4, hy - S * 0.34, 3.4 + f * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        };
        const glint = (color) => {
            const f = 0.55 + Math.abs(Math.sin(t * 3 + seed)) * 0.45;
            ctx.globalAlpha = f;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(mx, my, 2.4 * f + 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = f * 0.4;
            ctx.beginPath();
            ctx.arc(mx, my, 7 * f, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        };
        const flame = () => {
            for (let i = 0; i < 3; i++) {
                const f = 0.6 + Math.sin(t * (14 + i * 5) + i) * 0.4;
                ctx.globalAlpha = 0.5 - i * 0.13;
                ctx.fillStyle = i === 0 ? '#fef3c7' : i === 1 ? '#fb923c' : '#dc2626';
                ctx.beginPath();
                ctx.ellipse(mx + i * 1.5, my - i * 2, (4 - i) * f, (7 - i * 1.6) * f, aim + Math.PI / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        const fieldRing = (color) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([4, 5]);
            ctx.save();
            ctx.translate(bx, hy);
            ctx.rotate(t * 1.6);
            ctx.beginPath();
            ctx.arc(0, 0, S * 0.46, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            ctx.setLineDash([]);
        };
        const wisp = (color) => {
            for (let i = 0; i < 3; i++) {
                const a = t * 1.1 + i * 2.1;
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.ellipse(bx + Math.cos(a) * S * 0.34, hy + Math.sin(a * 0.8) * S * 0.26, 4.5, 2.6, a, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        const drip = (color) => {
            const ph = (t * 0.7 + seed * 0.13) % 1;
            ctx.globalAlpha = (1 - ph) * 0.7;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(mx, my + ph * S * 0.5, 1.6, 2.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        };
        switch (type) {
            case TowerType.MACHINE_GUN:
                spinning('rgba(253,224,71,0.85)', S * 0.17);
                break;
            case TowerType.ELECTRIC:
                arcs('rgba(147,197,253,0.9)', 3, S * 0.4);
                break;
            case TowerType.POISON:
                bubbles('rgba(134,239,172,0.85)', 4, hy + S * 0.16);
                break;
            case TowerType.BOMB:
                fuseSpark();
                break;
            case TowerType.LASER:
                glint('rgba(244,114,182,0.95)');
                break;
            case TowerType.SNIPER:
                glint('rgba(226,232,240,0.95)');
                break;
            case TowerType.FLAME:
                flame();
                break;
            case TowerType.MAGNETIC:
                fieldRing('rgba(216,180,254,0.7)');
                break;
            case TowerType.SINGULARITY:
                wisp('rgba(192,132,252,0.95)');
                break;
            default: break;
        }
        // 枪口火光：只在开火瞬间亮，越猛越亮
        if (rec > 0.12) {
            const f = rec;
            const g = ctx.createRadialGradient(mx, my, 0, mx, my, S * 0.42 * (0.6 + f));
            g.addColorStop(0, `rgba(255,244,214,${(0.9 * f).toFixed(3)})`);
            g.addColorStop(0.4, `rgba(255,196,120,${(0.45 * f).toFixed(3)})`);
            g.addColorStop(1, 'rgba(255,150,60,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(mx, my, S * 0.42 * (0.6 + f), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    /**
     * 绘制敌人：精灵图 + 动画循环（挤压拉伸 / 跳跃 / 摇摆 / 倾斜）。
     * anim 不传时退化为"按时间自走"的 idle（召唤廊、面板等处用）。
     * tint 为状态色（中毒/燃烧/冻结）时输出预染色版本。
     * levelIndex 用于关卡变体外观（每关小怪样子不一样）。
     */
    drawEnemy(ctx, x, y, type, size = 40, tint, anim, levelIndex = 0) {
        const img = this.enemyImgs.get(type);
        if (img) {
            const a = anim || computeEnemyAnim(type, this.time * 1.6, this.time);
            const h = size * a.sy;
            const w = h * (img.width / img.height) * a.sx;
            // 脚踩阴影线：阴影画在 y + 碰撞半径处，size 参 = 半径 × 2.5
            const feet = y + (size / 2.5) * 1.05 - a.hop - a.lift;
            const src = tint ? this.tinted(img, type, tint) : img;
            ctx.save();
            ctx.globalAlpha = a.alpha;
            ctx.translate(x + a.sway, feet);
            ctx.rotate(a.lean);
            ctx.drawImage(src, -w / 2, -h, w, h);
            ctx.restore();
            return;
        }
        this.drawEnemyProcedural(ctx, x, y, size, type, anim, levelIndex);
    }
    /** 状态染色：离屏 canvas 上 source-atop 上色，只染精灵本体不染背景 */
    tinted(img, key, color) {
        const ck = key + '|' + color;
        let c = this.tintCache.get(ck);
        if (c)
            return c;
        c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = 0.4;
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        this.tintCache.set(ck, c);
        return c;
    }
    /**
     * 程序化绘制防守单位（赛博防线的武装化机械）。
     *
     * 造型 = 医院器械：金属底座 + 闪烁红色警戒灯 + 锈蚀/血渍 + 器械本体。
     * **为什么不用 PNG 贴图**：单帧图再精致也是"贴纸"——警戒灯不闪、器械不转、
     * 开火不后坐，玩家一眼就觉得死。程序化绘制后，瞄准转向 / 开火后坐 / 警戒灯脉冲
     * 全部由时间与攻击事件演出，"它是活的"不再依赖素材帧数。
     *
     * 局部坐标系：原点 = 塔心，y 向下为正；底座落在 +15，器械顶约 -30。
     * 以 size = 40 为基准作图，缩放由调用方 `scale(size/40)` 统一处理。
     *
     * @param anim.rec 攻击强度 0..1（器械前推 + 枪口/光束增亮）
     * @param anim.aim 瞄准角（朝目标；不传 = 朝右，召唤卡/面板用）
     */
    drawTowerProcedural(ctx, x, y, size, type, anim, level = 1) {
        const t = this.time;
        const seed = SERAPH_SEED[type];
        const rec = anim?.rec ?? 0;
        const aim = anim?.aim ?? 0;
        const acc = this.hexRgb(TOWER_CONFIGS[type].color);
        const tier = tierOf(level);
        const ts = TIER_SCALE[tier];
        const glow = TIER_GLOW[tier];
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(size / 40, size / 40);
        // 档位放大：**以底座接触点 (0, 15) 为锚**，塔从脚下往上长。
        // 若直接绕原点缩放，底座会随档位往下漂（Lv4 时下移 15×0.26≈4px），
        // 塔看上去会"浮起来脱离地砖"，而且会顶到 y+24 的塔名药丸。
        if (ts !== 1) {
            ctx.translate(0, 15);
            ctx.scale(ts, ts);
            ctx.translate(0, -15);
        }
        // ① 档位地面辉光（塔脚下，档位越高越大越亮 —— "威压感"的来源）
        this.drawTierGroundGlow(ctx, tier, acc, glow, seed, rec);
        // ①.5 顶级脉冲波（沿地面一圈圈外扩，仅 Lv4）—— 画在底座之后会被遮，
        // 所以放这里（底座之下）：小半径被塔身挡住、大半径露出来，读作"从塔脚往外扩散"
        this.drawTierPulse(ctx, tier, acc, glow, seed);
        // ② 通用底座（不随瞄准旋转）
        this.drawDeviceBase(ctx, acc, seed, rec, glow);
        // ③ 档位附加装甲（侧裙 / 能量罐 / 肩甲尖刺 / 稳定腿）—— 在武器头之下
        this.drawTierArmor(ctx, tier, acc, seed, rec, glow);
        // ④ 器械本体（直立；朝目标的部分按 aim 旋转）
        this.drawDevice(ctx, type, t, seed, acc, rec, aim, glow);
        // ⑤ 档位徽记（Lv4 的环绕能量环 + 悬浮粒子）—— 压在武器头之上
        this.drawTierCrest(ctx, tier, acc, seed, rec, glow, type, aim);
        // ⑥ 红色警戒灯（画在最前，任何器械都盖不住）
        this.drawWarnLight(ctx, seed, rec);
        ctx.restore();
    }
    /**
     * 档位地面辉光：塔脚下的主题色光斑 + 向外扩张的能量环。
     * Lv1 完全不画（否则满场都是光斑，反而没有"谁更强"的对比）。
     * 用 `lighter` 叠加，所以不会把地砖压黑，只加亮。
     */
    drawTierGroundGlow(ctx, tier, acc, glow, seed, rec) {
        if (tier < 2)
            return;
        const t = this.time;
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const pulse = 0.5 + Math.abs(Math.sin(t * 1.9 + seed)) * 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 脚下光斑（椭圆，贴地）
        const r = 17 + tier * 2.5;
        const g = ctx.createRadialGradient(0, 13, 0, 0, 13, r);
        g.addColorStop(0, A(0.10 + tier * 0.035));
        g.addColorStop(1, A(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 13, r, r * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        // 外扩能量环：档位越高圈越多（Lv2 一圈 / Lv3 两圈 / Lv4 三圈）
        ctx.lineWidth = 1.1;
        for (let i = 0; i < tier - 1; i++) {
            const rr = 14.5 + i * 4.2 + pulse * 0.9;
            ctx.strokeStyle = A((0.26 - i * 0.06) * pulse + 0.08);
            ctx.beginPath();
            ctx.ellipse(0, 13.5, rr, rr * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
    /**
     * 顶级专属：向外扩张的能量脉冲波（radar ping）。**Lv4+**。
     *
     * 这是用户点名要的"脉冲式的光特效"。它与已有的两层都不同：
     *   · drawTierGroundGlow —— 静态光斑 + 呼吸圈（不传播）
     *   · drawTierCrest       —— 随炮口移动的高阶能量核心
     *   · drawTierPulse（本函数）—— 三段错相的**地面传播波**持续外扩，
     *     配合塔顶能量轨道，远处也能读出"满级正在供能"。
     *
     * 铁律遵守：
     *   · 纯 `this.time` 驱动（三环错相、周期 1.35s → 连绵不断），
     *     **不用 Math.random** —— 像素断言才能稳定复现。
     *   · `lighter` 只加亮、不把地砖压黑；贴地椭圆读作"沿地面扩散"。
     *   · 只进表现层，**不碰伤害与 DPS**。
     */
    drawTierPulse(ctx, tier, acc, glow, seed) {
        if (tier < 4)
            return;
        const t = this.time;
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const period = 1.35;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.5 + Math.sin(t * 5.2 + seed) * 0.5;
        const bloom = ctx.createRadialGradient(0, 12, 2, 0, 12, 25 + pulse * 5);
        bloom.addColorStop(0, A(0.17 + pulse * 0.12));
        bloom.addColorStop(0.55, A(0.07 + pulse * 0.05));
        bloom.addColorStop(1, A(0));
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.ellipse(0, 12, 27 + pulse * 3, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        // Lv5: 5圈脉冲波，更密集更强烈
        const ringCount = tier >= 5 ? 5 : 3;
        const maxRadius = tier >= 5 ? 45 : 29;
        for (let k = 0; k < ringCount; k++) {
            const ph = ((t / period) + seed * 0.13 + k / ringCount) % 1; // 0→1 传播进度
            const rr = 11 + ph * maxRadius; // 11 → maxRadius px 沿地面外扩
            ctx.lineWidth = (tier >= 5 ? 4.0 : 3.2) * (1 - ph) + 0.55; // 起始更亮更粗，远处收细
            ctx.strokeStyle = A((1 - ph) * 0.98); // 越远越淡
            ctx.beginPath();
            ctx.ellipse(0, 13.5, rr, rr * 0.36, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
    /**
     * 档位附加装甲：把外轮廓逐档撑开（剪影宽度是 40px 下最可读的"变强"信号）。
     *
     *   局部半宽：底座 ±15 → Lv2 侧裙 ±19.5 → Lv3 肩甲尖刺 ±21 → Lv4 稳定腿
     * 叠上 TIER_SCALE 后，战场上的实际宽度约 30 → 42 → 49 → 53px。
     * 塔位最小间距 78px、离路径最小 46px，所以最宽的 Lv4 也不会串座或压到通道。
     */
    drawTierArmor(ctx, tier, acc, seed, rec, glow) {
        if (tier < 2)
            return;
        const t = this.time;
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        // ── Lv2+ 侧裙装甲板（左右各一块，斜切外缘）──
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.translate(s * 14.5, 4);
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(s * 5, -6);
            ctx.lineTo(s * 5, 7);
            ctx.lineTo(0, 10);
            ctx.closePath();
            const g = ctx.createLinearGradient(0, -9, 0, 10);
            g.addColorStop(0, '#3E4657');
            g.addColorStop(1, '#191D25');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'rgba(150,170,200,0.32)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            // 侧裙发光缝（开火时更亮）
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = A(0.45 + rec * 0.5);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s * 1.6, -5);
            ctx.lineTo(s * 1.6, 8);
            ctx.stroke();
            ctx.restore();
            ctx.restore();
        }
        // ── Lv3+ 背部能量罐 ×2（把机身上半部往上、往外撑）──
        if (tier >= 3) {
            for (const s of [-1, 1]) {
                const px = s * 9.5;
                ctx.fillStyle = '#232935';
                ctx.beginPath();
                ctx.moveTo(px - 3.6, -6);
                ctx.lineTo(px - 3.0, -17);
                ctx.lineTo(px + 3.0, -17);
                ctx.lineTo(px + 3.6, -6);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(150,170,200,0.28)';
                ctx.lineWidth = 0.7;
                ctx.stroke();
                // 罐顶能量芯（脉冲，左右错相）
                const w = 0.45 + Math.abs(Math.sin(t * 3.4 + seed + s)) * 0.55;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = A(0.45 + w * 0.55);
                ctx.beginPath();
                ctx.ellipse(px, -17.4, 2.6, 1.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        // ── Lv3+ 肩甲尖刺（左右各一根，明确"更具攻击性"）──
        if (tier >= 3) {
            ctx.fillStyle = '#5A6577';
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(s * 17, 2);
                ctx.lineTo(s * 21, -3.5);
                ctx.lineTo(s * 17.6, 5);
                ctx.closePath();
                ctx.fill();
            }
        }
        // ── Lv4 支撑稳定腿 ×2（正面斜撑，重心下沉 = 更重、更稳、更威）──
        if (tier >= 4) {
            for (const s of [-1, 1]) {
                ctx.fillStyle = '#2B313D';
                ctx.beginPath();
                ctx.moveTo(s * 8, 6);
                ctx.lineTo(s * 16.5, 14);
                ctx.lineTo(s * 13, 15.6);
                ctx.lineTo(s * 6, 9);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(150,170,200,0.28)';
                ctx.lineWidth = 0.7;
                ctx.stroke();
            }
        }
    }
    /**
     * 档位徽记：只给 Lv4（决战形态）—— 炮口能源核心 + 旋转轨道脉冲 + 粒子束。
     *
     * 设计取舍：最初画的是两个绕塔心旋转的大椭圆环（"原子轨道"），3× 放大图上很帅，
     * **但缩到实机 40px 就变成一团乱线**，横穿炮管把剪影彻底糊掉。
     * 核心锚定在器械炮口，并随瞄准方向移动，
     * 且"塔顶多了一样东西"在 40px 下是最容易读出来的变化（外轮廓增加而非内部加细节）。
     *
     * 用确定性相位（`sin/cos(t)`），**不用 `Math.random()`** —— 像素断言才稳定。
     */
    drawTierCrest(ctx, tier, acc, seed, rec, glow, type, aim) {
        if (tier < 4)
            return;
        const t = this.time;
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const bob = Math.sin(t * 1.7 + seed) * 1.4;
        const pulse = 0.5 + Math.sin(t * 5.4 + seed) * 0.5;
        // 后坐/前扑由外层动画变换统一施加，这里只定位静态瞄准方向，避免重复位移。
        const muzzle = getTowerMuzzleOffset(type, tier, aim);
        // Crest 所在的 Canvas 变换尚未应用档位缩放；反算到本地坐标，
        // 让能量球与炮管、实际弹道使用完全相同的炮口锚点。
        const tierScale = towerTierScale(tier);
        const localMuzzleX = muzzle.x / tierScale;
        const localMuzzleY = 15 + (muzzle.y - 15) / tierScale;
        const cy = bob;
        ctx.save();
        ctx.translate(localMuzzleX, localMuzzleY);
        ctx.globalCompositeOperation = 'lighter';
        // 外层脉冲辉光：随能量呼吸，向炮塔肩部洒下光晕；塔型主色决定能量色。
        const crownRadius = 13 + pulse * 1.4;
        const crownGlow = ctx.createRadialGradient(0, cy, 1, 0, cy, crownRadius);
        crownGlow.addColorStop(0, A(0.54 + pulse * 0.3));
        crownGlow.addColorStop(0.5, A(0.22 + pulse * 0.16));
        crownGlow.addColorStop(1, A(0));
        ctx.fillStyle = crownGlow;
        ctx.beginPath();
        ctx.arc(0, cy, crownRadius, 0, Math.PI * 2);
        ctx.fill();
        // 双层陀螺轨道：虚线环反向旋转，亮点沿轨道巡航，做出高阶能源稳定器的读感。
        for (let i = 0; i < 2; i++) {
            const direction = i === 0 ? 1 : -1;
            const orbitAngle = t * direction * (1.45 + i * 0.35) + seed;
            ctx.save();
            ctx.translate(0, cy);
            ctx.rotate(orbitAngle);
            ctx.globalAlpha = 0.48 + pulse * 0.38;
            ctx.strokeStyle = i === 0 ? A(0.92) : 'rgba(232,246,255,0.72)';
            ctx.lineWidth = i === 0 ? 1.35 : 0.8;
            ctx.setLineDash(i === 0 ? [7, 3, 2, 4] : [2, 5]);
            ctx.beginPath();
            ctx.ellipse(0, 0, 14.5 + i * 1.8, 5.2 + i * 1.2, i === 0 ? 0.22 : -0.24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            const nodeA = t * direction * 2.4 + seed + i * Math.PI;
            const nx = Math.cos(nodeA) * (14.5 + i * 1.8);
            const ny = Math.sin(nodeA) * (5.2 + i * 1.2);
            ctx.shadowColor = i === 0 ? this.rgbaStr(acc, 1) : '#E8F6FF';
            ctx.shadowBlur = 7 + pulse * 5;
            ctx.fillStyle = i === 0 ? A(1) : '#E8F6FF';
            ctx.beginPath();
            ctx.arc(nx, ny, i === 0 ? 1.8 : 1.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // 沿炮管方向连回武器座的供能细束；能量球随炮口转向，不再悬在塔身正上方。
        const reach = TOWER_MUZZLE_LOCAL_REACH[type] ?? 28;
        ctx.save();
        ctx.rotate(aim);
        const beam = ctx.createLinearGradient(-reach, cy, 0, cy);
        beam.addColorStop(0, A(0));
        beam.addColorStop(1, A(0.42 + rec * 0.25));
        ctx.fillStyle = beam;
        ctx.fillRect(-reach, cy - 0.9, reach, 1.8);
        ctx.restore();
        // 核心光晕
        const haloRadius = 11 + pulse * 2;
        const halo = ctx.createRadialGradient(0, cy, 0, 0, cy, haloRadius);
        halo.addColorStop(0, A(0.78 + rec * 0.2));
        halo.addColorStop(0.42, A(0.35 + pulse * 0.2));
        halo.addColorStop(1, A(0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, cy, haloRadius, 0, Math.PI * 2);
        ctx.fill();
        // 核心本体：亮边双层六边形，持续呼吸并旋转，开火时短促增亮。
        const r = 3.5 + pulse * 1.05 + rec * 0.8;
        ctx.shadowColor = this.rgbaStr(acc, 1);
        ctx.shadowBlur = 9 + pulse * 11;
        ctx.strokeStyle = '#E8F6FF';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + t * 0.5;
            const px = Math.cos(a) * r, py = cy + Math.sin(a) * r;
            if (i === 0)
                ctx.moveTo(px, py);
            else
                ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = A(1);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 四枚短促的能量刻度围绕核心闪烁，强化精密机械感而不盖住炮口。
        for (let i = 0; i < 4; i++) {
            const a = t * 0.85 + i * Math.PI / 2 + seed;
            const inner = 8.5 + pulse * 1.5;
            const outer = inner + 2.5 + pulse * 1.5;
            ctx.globalAlpha = 0.45 + pulse * 0.5;
            ctx.strokeStyle = i % 2 === 0 ? A(1) : '#E8F6FF';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * inner, cy + Math.sin(a) * inner);
            ctx.lineTo(Math.cos(a) * outer, cy + Math.sin(a) * outer);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 上升粒子：5 颗，环绕塔身上浮；粒子亮度和密度随脉冲增强。
        for (let i = 0; i < 5; i++) {
            const ph = (t * 0.58 + i * 0.2 + seed * 0.1) % 1;
            const a = i * 2.0944 + t * 0.6;
            const rr = 15 + Math.sin(t * 2 + i * 1.7 + seed) * 2.2;
            ctx.globalAlpha = (1 - ph) * (0.7 + pulse * 0.3);
            ctx.fillStyle = A(0.95);
            ctx.beginPath();
            ctx.arc(Math.cos(a) * rr, 10 - ph * 34, i % 2 === 0 ? 1.55 : 1.1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    /**
     * Q版通用机械基座：圆润底座 + 可爱能量核心 + 柔和发光。
     * 造型语言：圆润可爱 + 霓虹发光 + 柔和阴影。
     */
    drawDeviceBase(ctx, acc, seed, rec, glow = 1) {
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const t = this.time;
        // 地面暗影（更柔和）
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 15, 17, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // 接地发光环（更圆润）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = A(0.35 + rec * 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 14.5, 14, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // Q版主装甲基座（圆润椭圆形）
        const baseGrad = ctx.createRadialGradient(0, 6, 0, 0, 6, 16);
        baseGrad.addColorStop(0, '#4A5568');
        baseGrad.addColorStop(0.6, '#2D3748');
        baseGrad.addColorStop(1, '#1A202C');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.ellipse(0, 6, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // 上层装甲（圆润）
        ctx.fillStyle = '#3A4A5E';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版可爱装饰：主题色能量环（脉冲，开火时更亮）
        const pulse = Math.min(1, 0.5 + Math.abs(Math.sin(t * 2.4 + seed)) * 0.4 + rec * 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = A(pulse * 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 8, 10, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // Q版云台转轴（圆润）
        ctx.fillStyle = '#2D3748';
        ctx.beginPath();
        ctx.arc(0, -4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4A5568';
        ctx.beginPath();
        ctx.arc(0, -4, 5, 0, Math.PI * 2);
        ctx.fill();
        // Q版能量核心（更亮的发光）
        ctx.fillStyle = A(0.95);
        ctx.beginPath();
        ctx.arc(0, -4, 3 + rec * 1, 0, Math.PI * 2);
        ctx.fill();
        // 高光点
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-1, -5, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 红色警戒灯：基座前缘的小灯，脉冲发光（开火时更亮），画在所有器械之上 */
    drawWarnLight(ctx, seed, rec) {
        const w = 0.35 + Math.abs(Math.sin(this.time * 3 + seed)) * 0.55 + rec * 0.45;
        ctx.fillStyle = `rgba(255,0,51,${(0.14 * w).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(-12, 11, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,0,51,${(0.45 + w * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(-12, 11, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,180,195,${(0.5 + w * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(-12.6, 10.4, 1.0, 0, Math.PI * 2);
        ctx.fill();
    }
    /**
     * Q版 11 件可爱武器。基座直立不动，武器头绕 (0, PIV) 按 aim 旋转朝目标。
     * 造型语言：圆润可爱 + 大眼睛 + 主题色能量核心 + 开火能量团。
     */
    drawDevice(ctx, type, t, seed, acc, rec, aim, glow = 1) {
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const PIV = -3;
        const r = Math.min(1, rec);
        const accentHex = TOWER_CONFIGS[type].color;
        switch (type) {
            case TowerType.MACHINE_GUN: {
                // Q版脉冲炮：圆润炮身 + 可爱大眼睛 + 双管炮口
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润炮身
                const bodyGrad = ctx.createRadialGradient(-2, 0, 0, -2, 0, 12);
                bodyGrad.addColorStop(0, '#5A6B80');
                bodyGrad.addColorStop(1, '#2B313D');
                ctx.fillStyle = bodyGrad;
                ctx.beginPath();
                ctx.roundRect(-10, -8, 18, 16, 6);
                ctx.fill();
                // 双管炮口
                ctx.fillStyle = '#4A5568';
                ctx.beginPath();
                ctx.roundRect(6, -6, 24, 4, 2);
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect(6, 2, 24, 4, 2);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -2, -2, 3.5, accentHex, 1, 0);
                this.drawCuteEye(ctx, -2, 3, 3.5, accentHex, 1, 0);
                // 炮口能量团
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.arc(32, -4, 3 + rec * 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(32, 4, 3 + rec * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.FROST: {
                // Q版冷冻炮：像可爱的小冰块，带霜雾效果
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润冰晶身体
                const frostGrad = ctx.createRadialGradient(-4, 0, 0, -4, 0, 14);
                frostGrad.addColorStop(0, '#7DD3FC');
                frostGrad.addColorStop(0.5, '#38BDF8');
                frostGrad.addColorStop(1, '#0EA5E9');
                ctx.fillStyle = frostGrad;
                ctx.beginPath();
                ctx.roundRect(-12, -10, 20, 20, 8);
                ctx.fill();
                // 喷口
                ctx.fillStyle = '#64748B';
                ctx.beginPath();
                ctx.roundRect(6, -5, 20, 10, 3);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -4, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -4, 3, 3, accentHex, 1, 0);
                // 霜雾效果
                if (rec > 0.05) {
                    ctx.fillStyle = A(r * 0.6);
                    ctx.beginPath();
                    ctx.ellipse(32, 0, 12, 8, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.ELECTRIC: {
                // Q版 EMP 塔：像可爱的小机器人，带电弧
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润身体
                const empGrad = ctx.createRadialGradient(-2, 0, 0, -2, 0, 12);
                empGrad.addColorStop(0, '#A78BFA');
                empGrad.addColorStop(1, '#6D28D9');
                ctx.fillStyle = empGrad;
                ctx.beginPath();
                ctx.roundRect(-10, -9, 18, 18, 7);
                ctx.fill();
                // 电极
                ctx.fillStyle = '#7C3AED';
                ctx.beginPath();
                ctx.roundRect(6, -8, 8, 6, 2);
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect(6, 2, 8, 6, 2);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -2, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -2, 3, 3, accentHex, 1, 0);
                // 电弧
                ctx.strokeStyle = A(0.9);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(14, -5);
                ctx.lineTo(20, 0);
                ctx.lineTo(14, 5);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case TowerType.POISON: {
                // Q版毒蚀炮：像可爱的小毒瓶
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润毒瓶身体
                const poisonGrad = ctx.createRadialGradient(-4, 0, 0, -4, 0, 12);
                poisonGrad.addColorStop(0, '#86EFAC');
                poisonGrad.addColorStop(0.5, '#22C55E');
                poisonGrad.addColorStop(1, '#16A34A');
                ctx.fillStyle = poisonGrad;
                ctx.beginPath();
                ctx.arc(-4, 0, 9, 0, Math.PI * 2);
                ctx.fill();
                // 喷头
                ctx.fillStyle = '#4ADE80';
                ctx.beginPath();
                ctx.roundRect(4, -4, 18, 8, 3);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -4, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -4, 3, 3, accentHex, 1, 0);
                // 毒雾
                if (rec > 0.05) {
                    ctx.fillStyle = A(r * 0.7);
                    ctx.beginPath();
                    ctx.ellipse(28, 0, 10, 7, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.BOMB: {
                // Q版导弹发射器：像可爱的小火箭发射器
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润发射箱
                const bombGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
                bombGrad.addColorStop(0, '#FB923C');
                bombGrad.addColorStop(1, '#EA580C');
                ctx.fillStyle = bombGrad;
                ctx.beginPath();
                ctx.roundRect(-6, -10, 20, 20, 6);
                ctx.fill();
                // 导弹
                ctx.fillStyle = '#F97316';
                ctx.beginPath();
                ctx.ellipse(14, -5, 6, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(14, 5, 6, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, 0, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, 0, 3, 3, accentHex, 1, 0);
                // 爆炸效果
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.arc(24, -5, 4 + rec * 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(24, 5, 4 + rec * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.LASER: {
                // Q版激光炮台：像可爱的小激光枪
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润枪身
                const laserGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
                laserGrad.addColorStop(0, '#F472B6');
                laserGrad.addColorStop(1, '#DB2777');
                ctx.fillStyle = laserGrad;
                ctx.beginPath();
                ctx.roundRect(-10, -7, 20, 14, 5);
                ctx.fill();
                // 枪管
                ctx.fillStyle = '#EC4899';
                ctx.beginPath();
                ctx.roundRect(8, -4, 20, 8, 3);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -2, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -2, 3, 3, accentHex, 1, 0);
                // 激光束
                if (rec > 0.05) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.roundRect(30, -2, 20, 4, 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.SNIPER: {
                // Q版磁轨炮：像可爱的小狙击枪
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润枪身
                const sniperGrad = ctx.createRadialGradient(-4, 0, 0, -4, 0, 12);
                sniperGrad.addColorStop(0, '#FBBF24');
                sniperGrad.addColorStop(1, '#D97706');
                ctx.fillStyle = sniperGrad;
                ctx.beginPath();
                ctx.roundRect(-12, -8, 16, 16, 6);
                ctx.fill();
                // 长导轨
                ctx.fillStyle = '#F59E0B';
                ctx.beginPath();
                ctx.roundRect(2, -5, 36, 3, 2);
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect(2, 2, 36, 3, 2);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -4, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -4, 3, 3, accentHex, 1, 0);
                // 弹丸
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.arc(42, 0, 3 + rec * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.FLAME: {
                // Q版焚化器：像可爱的小火焰喷射器
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润燃料罐
                const flameGrad = ctx.createRadialGradient(-4, 0, 0, -4, 0, 12);
                flameGrad.addColorStop(0, '#FCA5A5');
                flameGrad.addColorStop(0.5, '#EF4444');
                flameGrad.addColorStop(1, '#DC2626');
                ctx.fillStyle = flameGrad;
                ctx.beginPath();
                ctx.roundRect(-12, -10, 18, 20, 7);
                ctx.fill();
                // 喷管
                ctx.fillStyle = '#F87171';
                ctx.beginPath();
                ctx.roundRect(4, -5, 20, 10, 3);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -4, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -4, 3, 3, accentHex, 1, 0);
                // 火焰
                const f = 0.75 + Math.sin(t * 11 + seed) * 0.25;
                ctx.fillStyle = A(0.9);
                ctx.beginPath();
                ctx.ellipse(30, 0, 8 * f, 5 * f, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,236,180,0.8)';
                ctx.beginPath();
                ctx.ellipse(30, 0, 4 * f, 2.5 * f, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case TowerType.MAGNETIC: {
                // Q版引力场：像可爱的小磁铁
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润磁体
                const magGrad = ctx.createRadialGradient(4, 0, 0, 4, 0, 12);
                magGrad.addColorStop(0, '#67E8F9');
                magGrad.addColorStop(1, '#06B6D4');
                ctx.fillStyle = magGrad;
                ctx.beginPath();
                ctx.arc(4, 0, 10, 0, Math.PI * 2);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, 2, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, 2, 3, 3, accentHex, 1, 0);
                // 旋转场环
                ctx.strokeStyle = A(0.7);
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 3; i++) {
                    const a = t * 1.6 + i * 2.1 + seed;
                    ctx.beginPath();
                    ctx.ellipse(4, 0, 10 + Math.cos(a) * 2, 4.4 + Math.sin(a) * 1.6, a * 0.4, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // 引力效果
                if (rec > 0.1) {
                    ctx.fillStyle = A(r * 0.5);
                    ctx.beginPath();
                    ctx.arc(4, 0, 14 + rec * 6, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.SINGULARITY: {
                // Q版奇点炮：像可爱的小黑洞
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                // 圆润暗物质核心
                const singGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
                singGrad.addColorStop(0, '#A855F7');
                singGrad.addColorStop(0.5, '#7C3AED');
                singGrad.addColorStop(1, '#581C87');
                ctx.fillStyle = singGrad;
                ctx.beginPath();
                ctx.roundRect(-10, -9, 20, 18, 7);
                ctx.fill();
                // 可爱大眼睛
                this.drawCuteEye(ctx, -2, -2, 3, accentHex, 1, 0);
                this.drawCuteEye(ctx, -2, 3, 3, accentHex, 1, 0);
                // 引力环
                ctx.strokeStyle = A(0.8);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(12, 0, 10, 5, t * 1.4 + seed, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(12, 0, 6, 10, -t * 1.1, 0, Math.PI * 2);
                ctx.stroke();
                // 奇点核心
                ctx.fillStyle = A(0.95);
                ctx.beginPath();
                ctx.arc(13, 0, 3.5 + rec * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            default: break;
        }
    }
    /** "#rrggbb" → [r,g,b] */
    hexRgb(hex) {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    /** 两色线性混合（t=0 取 a、1 取 b） */
    mixRgb(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    rgbaStr(c, a) {
        return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
    }
    // ══════════════════════════════════════════════════════════
    // Q版辅助绘制方法
    // ══════════════════════════════════════════════════════════
    /** Q版大眼睛：大圆眼白 + 主题色虹膜 + 黑色瞳孔 + 高光点 */
    drawCuteEye(ctx, cx, cy, r, accent, lookX = 0, lookY = 0) {
        // 眼白（大圆）
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // 虹膜（主题色）
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(cx + lookX * r * 0.3, cy + lookY * r * 0.3, r * 0.65, 0, Math.PI * 2);
        ctx.fill();
        // 瞳孔（黑色）
        ctx.fillStyle = '#1A1A2E';
        ctx.beginPath();
        ctx.arc(cx + lookX * r * 0.4, cy + lookY * r * 0.4, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // 高光点（两个）
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx + lookX * r * 0.2 - r * 0.15, cy + lookY * r * 0.2 - r * 0.15, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + lookX * r * 0.3 + r * 0.1, cy + lookY * r * 0.3 + r * 0.1, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    /** Q版可爱嘴巴：小弧线 */
    drawCuteMouth(ctx, cx, cy, w, happy = true) {
        ctx.strokeStyle = '#2A2A3E';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (happy) {
            ctx.arc(cx, cy, w * 0.5, 0.2, Math.PI - 0.2);
        }
        else {
            ctx.arc(cx, cy + w * 0.3, w * 0.5, Math.PI + 0.2, -0.2);
        }
        ctx.stroke();
    }
    /** Q版圆角身体 */
    drawCuteBody(ctx, x, y, w, h, color, radius = 8) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
        ctx.fill();
    }
    /** Q版小短腿 */
    drawCuteLimb(ctx, x1, y1, x2, y2, thickness, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    /**
     * 程序化敌人绘制：机械军团。
     *
     * 造型语言与防御塔共用同一套赛博机械语汇：
     *   暗金属装甲（MECH_DARK / MID / HI）+ 各兵种主题色发光镜头与能量缝 + 红色警示灯；
     *   履带滚动、旋翼旋转、警示灯闪烁、核心扫视全部由 this.time 演出 ——
     *   「机械在运转」不再依赖素材帧数（单帧 PNG 做不到，所以 ENEMY_SPRITE 已置空）。
     *
     * 局部坐标系：原点 = 身体中心，y 向下；脚底落在局部 +16 处，
     * 与 renderEnemies() 的阴影锚点（y + 半径 + 2）对齐。
     * 以 size = 40 为基准作图，缩放由外层 scale(size/40) 统一处理。
     */
    drawEnemyProcedural(ctx, x, y, size, type, anim, levelIndex = 0) {
        const a = anim || computeEnemyAnim(type, this.time * 1.6, this.time);
        const accent = ENEMY_CONFIGS[type].color;
        const s = size / 40;
        // 脚底锚点与精灵图路径保持一致：y + 半径 × 1.05（半径 = size / 2.5）
        const feet = y + (size / 2.5) * 1.05 - a.hop - a.lift;
        // 根据关卡索引调整装甲色调（每关小怪样子不一样）
        const mechColors = this.getMechColorsForLevel(levelIndex);
        ctx.save();
        ctx.globalAlpha = a.alpha;
        ctx.translate(x + a.sway, feet);
        ctx.rotate(a.lean);
        ctx.scale(s * a.sx, s * a.sy);
        ctx.translate(0, -16); // 由「脚底」回到「身体中心」
        // 主题色地照（脚下的一摊光）：机械军团走在暗轨上，没有这层光
        // 暗装甲会和通道糊成一块，玩家数不清"来了几只"。
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.ellipse(0, 14, 13, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        switch (type) {
            case EnemyType.FAST:
                this.drawFastEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.HEAVY:
                this.drawHeavyEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.SPLIT:
                this.drawSplitEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.HEALER:
                this.drawHealerEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.MINI:
                this.drawMiniEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.GHOST:
                this.drawGhostEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.SHIELD:
                this.drawShieldEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.BOMBER:
                this.drawBomberEnemy(ctx, accent, mechColors);
                break;
            // v1.9 新敌种：剪影互不相似，混战里靠轮廓就能认出来
            case EnemyType.EMP_DRONE:
                this.drawEmpDroneEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.REFLECTOR:
                this.drawReflectorEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ACCELERATOR:
                this.drawAcceleratorEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ASSASSIN:
                this.drawAssassinEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.MAGNETIC_GUARD:
                this.drawMagneticGuardEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.REGENERATOR:
                this.drawRegeneratorEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ELITE_STORM:
                this.drawEliteStormEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ELITE_FORTRESS:
                this.drawEliteFortressEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ELITE_COMMANDER:
                this.drawEliteCommanderEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.ELITE_VOIDWALKER:
                this.drawEliteVoidwalkerEnemy(ctx, accent, mechColors);
                break;
            case EnemyType.BOSS:
            case EnemyType.BOSS_WARDEN:
            case EnemyType.BOSS_NIGHTMARE:
            case EnemyType.BOSS_STORM:
            case EnemyType.BOSS_PHANTOM:
            case EnemyType.BOSS_TITAN:
            case EnemyType.BOSS_VENOM:
            case EnemyType.BOSS_INFERNO:
            case EnemyType.BOSS_FROST:
            case EnemyType.BOSS_OMEGA:
                this.drawBossEnemy(ctx, type);
                break;
            default:
                this.drawNormalEnemy(ctx, accent, mechColors);
                break;
        }
        ctx.restore();
    }
    /**
     * 根据关卡索引获取机械装甲色调（每关小怪样子不一样）
     * 10个关卡对应10种不同的装甲色调
     */
    getMechColorsForLevel(levelIndex) {
        const colorSchemes = [
            // 关卡1：默认青灰色调
            { dark: '#333B4A', mid: '#4E5A6E', hi: '#76869F', edge: '#9BACC7' },
            // 关卡2：紫灰色调
            { dark: '#3D334A', mid: '#5A4E6E', hi: '#86769F', edge: '#AC9BC7' },
            // 关卡3：红灰色调
            { dark: '#4A3333', mid: '#6E4E4E', hi: '#9F7676', edge: '#C79B9B' },
            // 关卡4：橙灰色调
            { dark: '#4A3D33', mid: '#6E5A4E', hi: '#9F8676', edge: '#C7AC9B' },
            // 关卡5：黄灰色调
            { dark: '#4A4633', mid: '#6E664E', hi: '#9F9676', edge: '#C7C09B' },
            // 关卡6：绿灰色调
            { dark: '#334A3D', mid: '#4E6E5A', hi: '#769F86', edge: '#9BC7AC' },
            // 关卡7：青绿色调
            { dark: '#334A46', mid: '#4E6E66', hi: '#769F96', edge: '#9BC7C0' },
            // 关卡8：蓝灰色调
            { dark: '#333D4A', mid: '#4E5A6E', hi: '#76869F', edge: '#9BACC7' },
            // 关卡9：靛蓝色调
            { dark: '#33334A', mid: '#4E4E6E', hi: '#76769F', edge: '#9B9BC7' },
            // 关卡10：金灰色调
            { dark: '#4A4333', mid: '#6E634E', hi: '#9F9176', edge: '#C7BA9B' }
        ];
        return colorSchemes[levelIndex % colorSchemes.length];
    }
    /**
     * 机械光学镜头：金属环 + 主题色发光芯 + 高光点。
     * 所有机兵的「眼睛」都用它，保证"谁在看我"有一致的视觉语言。
     */
    drawLens(ctx, cx, cy, r, accent, pulse) {
        ctx.fillStyle = MECH_DARK;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = MECH_EDGE;
        ctx.lineWidth = Math.max(0.8, r * 0.18);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * pulse;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.24, cy - r * 0.24, r * 0.19, 0, Math.PI * 2);
        ctx.fill();
    }
    /**
     * Q版纳米虫群：圆润可爱的侦察小机器人。
     * 剪影 = 圆形大头 + 短小四肢 + 可爱大眼睛 + 主题色装饰。
     */
    drawNormalEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const legSwing = Math.sin(t * 7) * 1.2;
        // Q版短小四肢（圆润）
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const sx = i < 2 ? -1 : 1;
            const sw = i % 2 === 0 ? legSwing : -legSwing;
            ctx.beginPath();
            ctx.moveTo(sx * 5, 6);
            ctx.lineTo(sx * 8, 10 + sw);
            ctx.stroke();
        }
        // Q版圆润大头（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 12);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, -2, 11, 0, Math.PI * 2);
        ctx.fill();
        // 主题色扫描缝（Q版：更柔和的弧形）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 2, 8, 0.3, Math.PI - 0.3);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -4, -3, 3.5, accent, 0, 0.2);
        this.drawCuteEye(ctx, 4, -3, 3.5, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 3, true);
        // Q版腮红
        ctx.fillStyle = 'rgba(255, 150, 150, 0.3)';
        ctx.beginPath();
        ctx.arc(-7, 1, 2, 0, Math.PI * 2);
        ctx.arc(7, 1, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    /**
     * Q版侦察机兵：圆润可爱的快速侦察机器人。
     * 剪影 = 圆润身体 + 小翅膀 + 速度感装饰 + 可爱大眼睛。
     */
    drawFastEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版小翅膀（圆润）
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.ellipse(-6, -5, 4, 6, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-6, 5, 4, 6, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 主题色速度条纹（Q版：更柔和）
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -2, -2, 3, accent, 0.5, 0);
        this.drawCuteEye(ctx, -2, 2, 3, accent, 0.5, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 4, 0, 2, true);
    }
    /**
     * Q版重装装甲车：圆润可爱的重型坦克机器人。
     * 剪影 = 圆润车身 + 小履带 + 可爱炮塔 + 大眼睛。
     */
    drawHeavyEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        // Q版圆润车身（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 13);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版小履带（圆润）
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(-8, 8, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, 8, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版可爱炮塔（小圆头）
        const turretGrad = ctx.createRadialGradient(-1, -8, 0, 0, -6, 6);
        turretGrad.addColorStop(0, hi);
        turretGrad.addColorStop(1, mid);
        ctx.fillStyle = turretGrad;
        ctx.beginPath();
        ctx.arc(0, -6, 6, 0, Math.PI * 2);
        ctx.fill();
        // 主题色装饰条纹
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-6, 3);
        ctx.lineTo(6, 3);
        ctx.stroke();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -7, 2.5, accent, 0.3, 0);
        this.drawCuteEye(ctx, 3, -7, 2.5, accent, 0.3, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, -3, 2, true);
    }
    /**
     * Q版分裂孢子机：圆润可爱的分裂机器人。
     * 剪影 = 圆润身体 + 分裂线装饰 + 可爱大眼睛。
     */
    drawSplitEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const seam = 0.55 + Math.sin(t * 4) * 0.45;
        // Q版圆润身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 12);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        // 分裂线装饰（Q版：更柔和的曲线）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * seam;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.quadraticCurveTo(2, 0, 0, 8);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -4, -2, 3, accent, 0, 0.2);
        this.drawCuteEye(ctx, 4, -2, 3, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2.5, true);
    }
    /**
     * Q版修复无人机：圆润可爱的治疗机器人。
     * 剪影 = 圆润身体 + 小旋翼 + 十字标志 + 可爱大眼睛。
     */
    drawHealerEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const spin = t * 14;
        const rgb = this.hexRgb(accent);
        ctx.save();
        ctx.translate(0, Math.sin(t * 3) * 1.2);
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        // Q版小旋翼（圆润）
        for (const p of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const cx = p[0] * 8, cy = p[1] * 7;
            ctx.strokeStyle = dark;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p[0] * 4, p[1] * 3);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(spin * (p[0] * p[1] > 0 ? 1 : -1));
            ctx.fillStyle = this.rgbaStr(rgb, 0.4);
            ctx.beginPath();
            ctx.ellipse(0, 0, 4, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // 十字医疗标志（Q版：更圆润）
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(-2, -5, 4, 10, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(-5, -2, 10, 4, 1);
        ctx.fill();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.5, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 2.5, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 3, 2, true);
        ctx.restore();
    }
    /**
     * Q版微型机虫：圆润可爱的小分裂体。
     * 剪影 = 圆润小身体 + 短小四肢 + 可爱大眼睛。
     */
    drawMiniEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        // Q版短小四肢
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const a = Math.PI * 0.5 + (i - 1) * 0.75;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 4, 4);
            ctx.lineTo(Math.cos(a) * 7, 8 + Math.sin(t * 9 + i) * 1);
            ctx.stroke();
        }
        // Q版圆润身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-1, -1, 0, 0, 0, 7);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -2, -1, 2, accent, 0, 0.2);
        this.drawCuteEye(ctx, 2, -1, 2, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 2, 1.5, true);
    }
    /**
     * Q版相位隐形机：圆润可爱的隐身机器人。
     * 剪影 = 圆润身体 + 闪烁效果 + 可爱大眼睛。
     */
    drawGhostEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const flick = Math.sin(t * 5) * 0.5 + 0.5;
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        // 闪烁效果（Q版：柔和的虚线圆环）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * flick;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.lineDashOffset = -t * 8;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.8, accent, 0.3, 0);
        this.drawCuteEye(ctx, 3, -2, 2.8, accent, 0.3, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 3, 2, true);
    }
    /**
     * Q版护盾机兵：圆润可爱的防御机器人。
     * 剪影 = 圆润身体 + 小短腿 + 圆形护盾 + 可爱大眼睛。
     */
    drawShieldEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const pulse = 0.6 + Math.sin(t * 4) * 0.4;
        const rgb = this.hexRgb(accent);
        // Q版小短腿
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(-4, 8, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(4, 8, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 11);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // Q版圆润护盾（圆形，更可爱）
        ctx.save();
        ctx.translate(8, 0);
        ctx.shadowColor = accent;
        ctx.shadowBlur = 8 * pulse;
        ctx.fillStyle = this.rgbaStr(rgb, 0.2);
        ctx.strokeStyle = this.rgbaStr(rgb, 0.6 + pulse * 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 3, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 3, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2.5, true);
    }
    /**
     * Q版自爆机雷：圆润可爱的爆炸机器人。
     * 剪影 = 圆润球体 + 小尖刺 + 闪烁红芯 + 可爱大眼睛。
     */
    drawBomberEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const blink = Math.sin(t * 9) > 0 ? 1 : 0.25;
        // Q版小尖刺（圆润）
        ctx.strokeStyle = hi;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
            ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
            ctx.stroke();
        }
        // Q版圆润球体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        // 闪烁红芯（Q版：更柔和的发光）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = 10 * blink;
        ctx.fillStyle = `rgba(255, 0, 51, ${0.5 + blink * 0.4})`;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.5, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 2.5, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 3, 2, true);
    }
    // ══════════════════════════════════════════════════════════
    // v1.9 新增 6 种机制小怪 + 4 种精英
    // 设计原则：每种的**剪影**必须彼此不同，玩家在混战里靠轮廓就能
    // 认出「这只是沉默我的 / 那只是会反弹的」，而不是靠血条下面的小字。
    // ══════════════════════════════════════════════════════════
    /**
     * Q版 EMP无人机：圆润可爱的电磁机器人。
     * 剪影 = 圆润身体 + 小旋翼 + 电弧装饰 + 可爱大眼睛。
     */
    drawEmpDroneEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const spark = Math.sin(t * 11) * 0.5 + 0.5;
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 9);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        // Q版小旋翼（圆润）
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(dx * 4, dy * 3);
            ctx.lineTo(dx * 7, dy * 5);
            ctx.stroke();
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = this.rgbaStr(rgb, 0.5);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(dx * 7, dy * 5, 3, 1.2, t * 9 + dx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        // 电弧装饰（Q版：柔和的弧线）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * spark;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 3, 4, 0.5, Math.PI - 0.5);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.5, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 2.5, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 3, 2, true);
    }
    /**
     * Q版反射甲虫：圆润可爱的反射机器人。
     * 剪影 = 圆润半球身体 + 短小四肢 + 镜面装饰 + 可爱大眼睛。
     */
    drawReflectorEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const glint = Math.sin(t * 3.4) * 0.5 + 0.5;
        // Q版短小四肢
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const bx = -4 + i * 4;
            ctx.beginPath();
            ctx.moveTo(bx, 4);
            ctx.lineTo(bx - 2, 8);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bx, 4);
            ctx.lineTo(bx + 2, 8);
            ctx.stroke();
        }
        // Q版圆润半球身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -3, 0, 0, 0, 11);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // 镜面装饰（Q版：柔和的高光弧线）
        ctx.save();
        ctx.globalAlpha = 0.5 + glint * 0.3;
        ctx.strokeStyle = this.rgbaStr(rgb, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -2, 6, -0.8, 0.8);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -1, 2.5, accent, 0.3, 0);
        this.drawCuteEye(ctx, 3, -1, 2.5, accent, 0.3, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2, true);
    }
    /**
     * Q版加速引擎兵：圆润可爱的加速机器人。
     * 剪影 = 圆润身体 + 小喷口 + 尾焰装饰 + 可爱大眼睛。
     */
    drawAcceleratorEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const flame = 0.6 + Math.sin(t * 14) * 0.4;
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版小喷口
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(-7, -3, 2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-7, 3, 2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // 尾焰装饰（Q版：柔和的发光）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const oy of [-3, 3]) {
            const fg = ctx.createLinearGradient(-8, oy, -14, oy);
            fg.addColorStop(0, this.rgbaStr(rgb, 0.7));
            fg.addColorStop(1, this.rgbaStr(rgb, 0));
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.ellipse(-11, oy, 3 * flame, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -2, -2, 2.8, accent, 0.4, 0);
        this.drawCuteEye(ctx, -2, 2, 2.8, accent, 0.4, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 4, 0, 2, true);
    }
    /**
     * Q版隐身刺客：圆润可爱的隐身机器人。
     * 剪影 = 圆润身体 + 小刀刃 + 闪烁效果 + 可爱大眼睛。
     */
    drawAssassinEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const shimmer = Math.sin(t * 6) * 0.5 + 0.5;
        // Q版圆润身体（占整体 45%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // 闪烁效果（Q版：柔和的虚线圆环）
        ctx.save();
        ctx.globalAlpha = 0.3 + shimmer * 0.2;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Q版小刀刃（圆润）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = this.rgbaStr(rgb, 0.8);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.quadraticCurveTo(10, -4, 12, -6);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.8, accent, 0.3, 0);
        this.drawCuteEye(ctx, 3, -2, 2.8, accent, 0.3, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 3, 2, true);
    }
    /**
     * Q版磁力盾卫：圆润可爱的磁力机器人。
     * 剪影 = 圆润身体 + 小履带 + 磁极装饰 + 可爱大眼睛。
     */
    drawMagneticGuardEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const spin = t * 2.2;
        // Q版小履带（圆润）
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(-6, 8, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, 8, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版圆润身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 11);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // 磁极装饰（Q版：柔和的圆弧）
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(rgb, 0.7);
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2;
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(sx * 8, 0, 4, sx > 0 ? -0.8 : Math.PI - 0.8, sx > 0 ? 0.8 : Math.PI + 0.8);
            ctx.stroke();
        }
        ctx.restore();
        // 磁力场装饰（Q版：柔和的虚线圆环）
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.lineDashOffset = -spin * 6;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 2.8, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 2.8, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2.5, true);
    }
    /**
     * Q版再生巨虫：圆润可爱的再生机器人。
     * 剪影 = 圆润分节身体 + 再生核心装饰 + 可爱大眼睛。
     */
    drawRegeneratorEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const beat = Math.sin(t * 3.6) * 0.5 + 0.5;
        // Q版圆润分节身体（4节，从尾到头）
        const segs = [[-9, 0, 5.5], [-4, -1, 6.5], [2, -1.5, 7], [7, -2, 6]];
        for (let i = 0; i < segs.length; i++) {
            const [sx, sy, r] = segs[i];
            const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r);
            g.addColorStop(0, hi);
            g.addColorStop(0.6, mid);
            g.addColorStop(1, dark);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // 再生核心装饰（Q版：柔和的脉冲圆环）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
            const pr = 2.5 + ((t * 6 + i * 1.6) % 3.2) * 1.8;
            ctx.globalAlpha = Math.max(0, 0.4 - ((t * 6 + i * 1.6) % 3.2) * 0.12);
            ctx.strokeStyle = this.rgbaStr(rgb, 0.8);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(2, -1.5, pr, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, 5, -3, 2, accent, 0.3, 0);
        this.drawCuteEye(ctx, 9, -3, 2, accent, 0.3, 0);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 7, 1, 1.5, true);
    }
    /**
     * Q版精英·电磁风暴：圆润可爱的电磁精英机器人。
     * 剪影 = 圆润大身体 + 小旋翼 + 电弧装饰 + 可爱大眼睛。
     */
    drawEliteStormEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const arc = Math.sin(t * 13) * 0.5 + 0.5;
        // Q版圆润大身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 12);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        // Q版小旋翼（6个，圆润）
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + t * 0.8;
            const ex = Math.cos(a) * 10, ey = Math.sin(a) * 6 - 1;
            ctx.beginPath();
            ctx.moveTo(ex * 0.5, ey * 0.5);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = this.rgbaStr(rgb, 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(ex, ey, 3, 1.2, t * 12 + i, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        // 电弧装饰（Q版：柔和的圆弧）
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(rgb, 0.7);
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * (0.4 + arc * 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -8, 5, -0.8, 0.8);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -2, 3, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -2, 3, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2.5, true);
    }
    /**
     * Q版精英·反射堡垒：圆润可爱的反射精英机器人。
     * 剪影 = 圆润大身体 + 小履带 + 反射装饰 + 可爱大眼睛。
     */
    drawEliteFortressEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const glint = Math.sin(t * 2.6) * 0.5 + 0.5;
        // Q版小履带（圆润）
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(-8, 10, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, 10, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Q版圆润大身体（占整体 55%）
        const bodyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 13);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        // 反射装饰（Q版：柔和的高光弧线）
        ctx.save();
        ctx.globalAlpha = 0.5 + glint * 0.3;
        ctx.strokeStyle = this.rgbaStr(rgb, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2, 8, -0.6, 0.6);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -4, -2, 3, accent, 0, 0.2);
        this.drawCuteEye(ctx, 4, -2, 3, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 5, 3, true);
    }
    /**
     * Q版精英·战旗指挥官：圆润可爱的指挥官机器人。
     * 剪影 = 圆润大身体 + 小旗帜 + 指挥装饰 + 可爱大眼睛。
     */
    drawEliteCommanderEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const wave = Math.sin(t * 3.2);
        // Q版圆润大身体（占整体 55%）
        const bodyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 13);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        // Q版小旗帜（圆润）
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(8, -8);
        ctx.lineTo(8, -16);
        ctx.stroke();
        // 旗面（Q版：柔和的波浪）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.fillStyle = this.rgbaStr(rgb, 0.8);
        ctx.beginPath();
        ctx.moveTo(8, -16);
        ctx.quadraticCurveTo(12 + wave, -15, 14, -14);
        ctx.quadraticCurveTo(12 + wave, -13, 8, -12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // 指挥装饰（Q版：柔和的圆弧）
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(rgb, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 8, -0.5, 0.5);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -4, -2, 3, accent, 0, 0.2);
        this.drawCuteEye(ctx, 4, -2, 3, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 5, 3, true);
    }
    /**
     * Q版精英·虚空行者：圆润可爱的虚空机器人。
     * 剪影 = 圆润身体 + 虚空核心装饰 + 闪烁效果 + 可爱大眼睛。
     */
    drawEliteVoidwalkerEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const rgb = this.hexRgb(accent);
        const breathe = Math.sin(t * 2.4) * 0.5 + 0.5;
        // Q版圆润身体（占整体 50%）
        const bodyGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 11);
        bodyGrad.addColorStop(0, hi);
        bodyGrad.addColorStop(0.6, mid);
        bodyGrad.addColorStop(1, dark);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // 虚空核心装饰（Q版：柔和的脉冲圆环）
        const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
        hole.addColorStop(0, 'rgba(0,0,0,0.8)');
        hole.addColorStop(0.6, 'rgba(10,4,26,0.6)');
        hole.addColorStop(1, this.rgbaStr(rgb, 0));
        ctx.fillStyle = hole;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        // 虚空边框（Q版：柔和的圆环）
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(rgb, 0.5 + breathe * 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // Q版可爱大眼睛
        this.drawCuteEye(ctx, -3, -3, 2.5, accent, 0, 0.2);
        this.drawCuteEye(ctx, 3, -3, 2.5, accent, 0, 0.2);
        // Q版可爱小嘴巴
        this.drawCuteMouth(ctx, 0, 4, 2, true);
    }
    /**
     * 10种关卡 Boss，每种都有独特外观：
     * - 机械统领（红）：基础重型机体
     * - 要塞核心（青）：装甲加厚，双联炮管
     * - 机械神谕（紫）：能量翼展，神秘感
     * - 风暴使者（青绿）：旋翼结构，速度感
     * - 幻影猎手（淡紫）：棱形机身，隐形感
     * - 泰坦巨像（橙）：超大型，厚重装甲
     * - 剧毒领主（绿）：毒液罐，生化感
     * - 炼狱魔王（红粉）：火焰喷射，狂暴感
     * - 寒冰女皇（蓝）：冰晶结构，优雅感
     * - 终极欧米伽（金）：最终形态，全装甲
     */
    drawBossEnemy(ctx, type) {
        const t = this.time;
        const pal = ENEMY_CONFIGS[type].bossPalette
            || { glow: '#9D00FF', core: '#C77BFF', shell: '#2A0050', eye: '#FFD700' };
        const accent = ENEMY_CONFIGS[type].color;
        const pulse = 0.6 + Math.sin(t * 2.2) * 0.4;
        // 根据 boss 类型选择不同的外观
        switch (type) {
            case EnemyType.BOSS:
                this.drawBossCommander(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_WARDEN:
                this.drawBossWarden(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_NIGHTMARE:
                this.drawBossNightmare(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_STORM:
                this.drawBossStorm(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_PHANTOM:
                this.drawBossPhantom(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_TITAN:
                this.drawBossTitan(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_VENOM:
                this.drawBossVenom(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_INFERNO:
                this.drawBossInferno(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_FROST:
                this.drawBossFrost(ctx, pal, accent, pulse);
                break;
            case EnemyType.BOSS_OMEGA:
                this.drawBossOmega(ctx, pal, accent, pulse);
                break;
            default:
                // 兜底：使用基础外观
                this.drawBossBase(ctx, pal, accent, pulse);
                break;
        }
    }
    /** 基础 Boss 外观：机械统领/要塞核心/机械神谕 */
    drawBossBase(ctx, pal, accent, pulse) {
        const t = this.time;
        // 外发光底盘
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 16 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 背部散热鳍
        ctx.fillStyle = MECH_DARK;
        for (let i = -2; i <= 2; i++) {
            ctx.save();
            ctx.rotate(i * 0.34);
            ctx.fillRect(-1.6, -18, 3.2, 7);
            ctx.restore();
        }
        // 双肩炮
        for (const sx of [-1, 1]) {
            ctx.fillStyle = MECH_MID;
            ctx.fillRect(sx * 12 - 4.5, -13, 9, 8);
            ctx.strokeStyle = MECH_EDGE;
            ctx.lineWidth = 1;
            ctx.strokeRect(sx * 12 - 4.5, -13, 9, 8);
            ctx.fillStyle = '#151920';
            ctx.fillRect(sx * 12 - 1.6, -19, 3.2, 7);
            ctx.save();
            ctx.shadowColor = accent;
            ctx.shadowBlur = 7;
            ctx.fillStyle = accent;
            ctx.fillRect(sx * 12 - 2.6, -18.4, 5.2, 1.6);
            ctx.restore();
        }
        // 主体
        const g = ctx.createLinearGradient(0, -14, 0, 14);
        g.addColorStop(0, pal.core);
        g.addColorStop(0.45, pal.shell);
        g.addColorStop(1, '#0B0D12');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-11, -9);
        ctx.lineTo(-6, -14);
        ctx.lineTo(6, -14);
        ctx.lineTo(11, -9);
        ctx.lineTo(9, 12);
        ctx.lineTo(-9, 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // 中央单眼核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 14 * pulse;
        const eg = ctx.createRadialGradient(-1, -3, 0, 0, -2, 8);
        eg.addColorStop(0, '#FFFFFF');
        eg.addColorStop(0.4, pal.eye);
        eg.addColorStop(1, pal.glow);
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(0, -2, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 瞳孔
        const look = Math.sin(t * 1.6) * 2;
        ctx.fillStyle = '#08090D';
        ctx.beginPath();
        ctx.ellipse(look, -2, 1.6, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // 悬浮警示环
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(this.hexRgb(pal.glow), 0.55);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -t * 18;
        ctx.beginPath();
        ctx.ellipse(0, 13, 12, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** 机械统领：指挥官造型，带有战术指挥感 */
    drawBossCommander(ctx, pal, accent, pulse) {
        const t = this.time;
        // 战术披风（三角形）
        ctx.save();
        ctx.fillStyle = pal.shell;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-15, -5);
        ctx.lineTo(-20, 15);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(15, -5);
        ctx.lineTo(20, 15);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // 主体装甲
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 14 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo(-8, -16);
        ctx.lineTo(8, -16);
        ctx.lineTo(12, -10);
        ctx.lineTo(10, 8);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        // 指挥天线
        ctx.save();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(0, -22);
        ctx.stroke();
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, -23, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 双眼（战术目镜）
        ctx.save();
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 8 * pulse;
        ctx.fillStyle = pal.eye;
        ctx.fillRect(-6, -8, 4, 3);
        ctx.fillRect(2, -8, 4, 3);
        ctx.restore();
        // 悬浮环
        ctx.save();
        ctx.strokeStyle = this.rgbaStr(this.hexRgb(pal.glow), 0.5);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -t * 15;
        ctx.beginPath();
        ctx.ellipse(0, 10, 14, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** 要塞核心：能量球体，防御感 */
    drawBossWarden(ctx, pal, accent, pulse) {
        const t = this.time;
        // 外层能量护盾（半透明）
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 20 * pulse;
        ctx.fillStyle = pal.glow;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 核心球体
        ctx.save();
        ctx.shadowColor = pal.core;
        ctx.shadowBlur = 16 * pulse;
        const gradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, 12);
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.3, pal.core);
        gradient.addColorStop(0.7, pal.shell);
        gradient.addColorStop(1, '#000000');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 旋转能量环
        ctx.save();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.rotate(t * 2 + i * Math.PI * 2 / 3);
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 0.6);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        // 中心能量眼
        ctx.save();
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    /** 机械神谕：神秘先知造型，带有预言感 */
    drawBossNightmare(ctx, pal, accent, pulse) {
        const t = this.time;
        // 神秘光环
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 25 * pulse;
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 主体（倒三角造型）
        ctx.save();
        ctx.shadowColor = pal.core;
        ctx.shadowBlur = 12 * pulse;
        const gradient = ctx.createLinearGradient(0, -15, 0, 15);
        gradient.addColorStop(0, pal.core);
        gradient.addColorStop(0.5, pal.shell);
        gradient.addColorStop(1, '#000000');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(-14, 5);
        ctx.lineTo(-8, 12);
        ctx.lineTo(8, 12);
        ctx.lineTo(14, 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        // 第三只眼（预言之眼）
        ctx.save();
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 15 * pulse;
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-3, -6);
        ctx.lineTo(0, -4);
        ctx.lineTo(3, -6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // 双眼
        ctx.save();
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 8 * pulse;
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(-5, 2, 2.5, 0, Math.PI * 2);
        ctx.arc(5, 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 神秘符文环绕
        ctx.save();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 6; i++) {
            const angle = t * 1.5 + i * Math.PI / 3;
            const x = Math.cos(angle) * 16;
            const y = Math.sin(angle) * 16;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    /** 风暴使者：旋翼结构，速度感 */
    drawBossStorm(ctx, pal, accent, pulse) {
        const t = this.time;
        // 旋翼底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 四片旋翼
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate(t * 8 + i * Math.PI / 2);
            ctx.fillStyle = MECH_MID;
            ctx.fillRect(-2, -18, 4, 16);
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = 1;
            ctx.strokeRect(-2, -18, 4, 16);
            ctx.restore();
        }
        // 中央核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 幻影猎手：棱形机身，隐形感 */
    drawBossPhantom(ctx, pal, accent, pulse) {
        const t = this.time;
        const flicker = 0.7 + Math.sin(t * 6) * 0.3;
        // 棱形机身
        ctx.save();
        ctx.globalAlpha = flicker;
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 14 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 16);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        // 内部能量核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 隐形眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 泰坦巨像：超大型，厚重装甲 */
    drawBossTitan(ctx, pal, accent, pulse) {
        const t = this.time;
        // 重型底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 18 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 2, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 厚重装甲板
        ctx.fillStyle = MECH_DARK;
        ctx.fillRect(-14, -8, 28, 20);
        ctx.strokeStyle = MECH_EDGE;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-14, -8, 28, 20);
        // 双肩巨炮
        for (const sx of [-1, 1]) {
            ctx.fillStyle = MECH_MID;
            ctx.fillRect(sx * 16 - 5, -12, 10, 10);
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = 1;
            ctx.strokeRect(sx * 16 - 5, -12, 10, 10);
        }
        // 中央核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 16 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 2, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 剧毒领主：毒液罐，生化感 */
    drawBossVenom(ctx, pal, accent, pulse) {
        const t = this.time;
        // 生化容器底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 14 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 毒液罐
        ctx.fillStyle = MECH_DARK;
        ctx.beginPath();
        ctx.ellipse(-8, -4, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, -4, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // 毒液流动效果
        const flow = (t * 2) % 1;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.ellipse(-8, -4 + flow * 6, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(8, -4 + flow * 6, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 中央核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 炼狱魔王：火焰喷射，狂暴感 */
    drawBossInferno(ctx, pal, accent, pulse) {
        const t = this.time;
        // 火焰底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 20 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 火焰喷射效果
        for (let i = 0; i < 6; i++) {
            const angle = (t * 3 + i * Math.PI / 3) % (Math.PI * 2);
            const flameLen = 8 + Math.sin(t * 8 + i) * 3;
            ctx.save();
            ctx.rotate(angle);
            ctx.fillStyle = pal.core;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(-2, -14 - flameLen);
            ctx.lineTo(2, -14 - flameLen);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // 狂暴核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 18 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 寒冰女皇：冰晶结构，优雅感 */
    drawBossFrost(ctx, pal, accent, pulse) {
        const t = this.time;
        // 冰晶底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 16 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 六片冰晶
        for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI / 3);
            ctx.fillStyle = pal.core;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(-3, -18);
            ctx.lineTo(0, -20);
            ctx.lineTo(3, -18);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // 冰晶核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 14 * pulse;
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 终极欧米伽：最终形态，全装甲 */
    drawBossOmega(ctx, pal, accent, pulse) {
        const t = this.time;
        // 超大型底座
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 22 * pulse;
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 全装甲外壳
        ctx.fillStyle = MECH_DARK;
        ctx.beginPath();
        ctx.moveTo(-16, -12);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-16, 12);
        ctx.lineTo(16, 12);
        ctx.lineTo(18, 0);
        ctx.lineTo(16, -12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 2;
        ctx.stroke();
        // 四门副炮
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.fillStyle = MECH_MID;
            ctx.fillRect(sx * 14 - 3, sy * 10 - 3, 6, 6);
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = 1;
            ctx.strokeRect(sx * 14 - 3, sy * 10 - 3, 6, 6);
        }
        // 终极核心
        ctx.save();
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 20 * pulse;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.3, pal.core);
        g.addColorStop(1, pal.glow);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 终极能量眼
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        // 旋转能量环
        ctx.save();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 1.5;
        ctx.rotate(t * 2);
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    getTowerSprite(type) {
        return this.towerImgs.get(type) || null;
    }
    getEnemySprite(type) {
        return this.enemyImgs.get(type) || null;
    }
}
//# sourceMappingURL=SpriteLoader.js.map