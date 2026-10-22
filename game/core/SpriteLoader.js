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
import { CYBER } from '../config/CyberTheme.js';
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
     * 通用机械基座：切角装甲板 + 液压杆 + 黄黑警戒斜纹 + 主题色能量环 + 六角螺栓。
     * 造型语言对齐 PRD「赛博机械」：**硬边棱角 + 霓虹发光缝 + 工业警示色**，
     * 不要画回圆润的医疗设备（那是被否掉的一版）。
     */
    drawDeviceBase(ctx, acc, seed, rec, glow = 1) {
        // 档位越高，主题色越亮 —— 所有 A(...) 调用点自动受益，不必逐处改
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const t = this.time;
        // 地面暗影
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 15, 19, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // 接地发光环
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = A(0.32 + rec * 0.35);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 14.5, 15, 4.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 主装甲基座（切角八边形，硬边）
        ctx.beginPath();
        ctx.moveTo(-13, 14);
        ctx.lineTo(-15, 6);
        ctx.lineTo(-10, -2);
        ctx.lineTo(10, -2);
        ctx.lineTo(15, 6);
        ctx.lineTo(13, 14);
        ctx.closePath();
        const baseGrad = ctx.createLinearGradient(0, -2, 0, 14);
        baseGrad.addColorStop(0, '#3A4150');
        baseGrad.addColorStop(0.5, '#232833');
        baseGrad.addColorStop(1, '#14171E');
        ctx.fillStyle = baseGrad;
        ctx.fill();
        // 上层装甲板
        ctx.fillStyle = '#2B313D';
        ctx.beginPath();
        ctx.moveTo(-10, -2);
        ctx.lineTo(-7, -7);
        ctx.lineTo(7, -7);
        ctx.lineTo(10, -2);
        ctx.closePath();
        ctx.fill();
        // 黄黑警戒斜纹带
        ctx.save();
        ctx.beginPath();
        ctx.rect(-11.5, 6.5, 23, 4.4);
        ctx.clip();
        ctx.fillStyle = '#C9A21F';
        ctx.fillRect(-11.5, 6.5, 23, 4.4);
        ctx.fillStyle = CYBER.bgPath;
        for (let i = -1; i < 7; i++) {
            ctx.save();
            ctx.translate(-11.5 + i * 4.4, 6.5);
            ctx.rotate(0.6);
            ctx.fillRect(0, -3, 2.2, 12);
            ctx.restore();
        }
        ctx.restore();
        // 散热格栅（两侧）
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(-13.5, i * 2.4, 4, 1.2);
            ctx.fillRect(9.5, i * 2.4, 4, 1.2);
        }
        // 六角螺栓
        ctx.fillStyle = '#5A6577';
        for (const [bx, by] of [[-10.5, 4], [10.5, 4], [-11.5, 11], [11.5, 11]]) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const px = bx + Math.cos(a) * 1.5, py = by + Math.sin(a) * 1.5;
                if (i === 0)
                    ctx.moveTo(px, py);
                else
                    ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }
        // 主题色能量环（脉冲，开火时更亮）
        const pulse = Math.min(1, 0.42 + Math.abs(Math.sin(t * 2.4 + seed)) * 0.36 + rec * 0.45);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = A(pulse * 0.8);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 8.4, 9, 2.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 云台转轴 + 能量核心
        ctx.fillStyle = '#1B1F27';
        ctx.beginPath();
        ctx.arc(0, -4, 6.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333A47';
        ctx.beginPath();
        ctx.arc(0, -4, 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = A(0.9);
        ctx.beginPath();
        ctx.arc(0, -4, 2.2 + rec * 0.8, 0, Math.PI * 2);
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
     * 11 件赛博机械武器。基座直立不动，武器头绕 (0, PIV) 按 aim 旋转朝目标。
     * 造型语言：暗金属棱角机身 + 主题色能量核心/能量条 + 开火能量团。
     * 其中 4 件对齐 PRD 的原型：激光炮台(LASER) / EMP 塔(ELECTRIC) /
     * 导弹发射器(BOMB) / 无人机塔(ANESTHESIA，悬浮无人机 + 束缚场)。
     */
    drawDevice(ctx, type, t, seed, acc, rec, aim, glow = 1) {
        // 档位越高，武器头的能量核心 / 能量条越亮（11 件共用这一个 A()，改一处全生效）
        const A = (a) => this.rgbaStr(acc, Math.min(1, a * glow));
        const PIV = -3;
        const r = Math.min(1, rec);
        switch (type) {
            case TowerType.MACHINE_GUN: {
                // 脉冲炮：双联炮管 + 电容鼓 + 枪口能量团
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-10, -7, 16, 14);
                ctx.fillStyle = '#1B1F27';
                ctx.beginPath();
                ctx.arc(-4, -1, 5.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = A(0.9);
                ctx.beginPath();
                ctx.arc(-4, -1, 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#5A6577';
                ctx.fillRect(4, -6, 26, 4.4);
                ctx.fillRect(4, 1.6, 26, 4.4);
                ctx.fillStyle = '#3A4150';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(9 + i * 5, -6.6, 2, 5.6);
                    ctx.fillRect(9 + i * 5, 1, 2, 5.6);
                }
                ctx.fillStyle = A(0.95);
                ctx.fillRect(30, -5.4, 2.6, 3.6);
                ctx.fillRect(30, 2.2, 2.6, 3.6);
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.arc(34, -3.6, 2.2 + rec * 2.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(34, 3.8, 2.2 + rec * 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.FROST: {
                // 冷冻炮：低温罐 + 管路 + 外扩喷口 + 霜雾
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-11, -12, 13, 20);
                ctx.fillStyle = '#3A4150';
                ctx.fillRect(-11, -12, 13, 3);
                ctx.fillStyle = A(0.75);
                ctx.fillRect(-8, -9, 7, 14);
                ctx.fillStyle = '#5A6577';
                ctx.fillRect(0, -6, 22, 9);
                ctx.fillStyle = '#7C8290';
                ctx.beginPath();
                ctx.moveTo(22, -7);
                ctx.lineTo(30, -10);
                ctx.lineTo(30, 10);
                ctx.lineTo(22, 7);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = A(0.9);
                ctx.beginPath();
                ctx.arc(12, 0, 2.6, 0, Math.PI * 2);
                ctx.fill();
                if (rec > 0.05) {
                    ctx.fillStyle = A(r * 0.85);
                    ctx.beginPath();
                    ctx.moveTo(30, -8);
                    ctx.lineTo(45, -12);
                    ctx.lineTo(45, 12);
                    ctx.lineTo(30, 8);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.ELECTRIC: {
                // EMP 塔：线圈塔身 + 双电极 + 电弧
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-8, -9, 17, 18);
                ctx.strokeStyle = '#5A6577';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(-1, 0, 4 + i * 2.6, -1.1, 1.1);
                    ctx.stroke();
                }
                ctx.fillStyle = '#7C8290';
                ctx.fillRect(14, -10, 9, 5);
                ctx.fillRect(14, 5, 9, 5);
                ctx.strokeStyle = A(0.95);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(23, -7.5);
                ctx.lineTo(28, 0);
                ctx.lineTo(24, 0);
                ctx.lineTo(29, 7.5);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(23, -7.5);
                ctx.lineTo(28, 0);
                ctx.lineTo(24, 0);
                ctx.lineTo(29, 7.5);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case TowerType.POISON: {
                // 毒蚀炮：纳米毒剂罐 + 扇形喷头
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.beginPath();
                ctx.arc(-4, -1, 7.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = A(0.8);
                ctx.beginPath();
                ctx.arc(-4, 0, 4.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#5A6577';
                ctx.fillRect(3, -3.4, 19, 7);
                ctx.fillStyle = '#7C8290';
                ctx.beginPath();
                ctx.moveTo(22, -5.6);
                ctx.lineTo(28, -8);
                ctx.lineTo(28, 8);
                ctx.lineTo(22, 5.6);
                ctx.closePath();
                ctx.fill();
                if (rec > 0.05) {
                    ctx.fillStyle = A(r * 0.85);
                    ctx.beginPath();
                    ctx.moveTo(28, -7);
                    ctx.lineTo(42, -11);
                    ctx.lineTo(42, 11);
                    ctx.lineTo(28, 7);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.BOMB: {
                // 导弹发射器：双联发射箱 + 两枚导弹 + 导焰
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-4, -10, 22, 20);
                ctx.fillStyle = '#1B1F27';
                ctx.fillRect(-4, -10, 3, 20);
                ctx.fillStyle = CYBER.bgPath;
                ctx.beginPath();
                ctx.arc(13, -5.4, 3.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(13, 5.4, 3.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#C7CCD4';
                for (const oy of [-5.4, 5.4]) {
                    ctx.beginPath();
                    ctx.moveTo(11, oy - 2.4);
                    ctx.lineTo(19, oy - 1.2);
                    ctx.lineTo(21, oy);
                    ctx.lineTo(19, oy + 1.2);
                    ctx.lineTo(11, oy + 2.4);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.fillStyle = A(0.9);
                ctx.fillRect(-2, -1.4, 16, 2.8);
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    for (const oy of [-5.4, 5.4]) {
                        ctx.beginPath();
                        ctx.arc(23, oy, 2.6 + rec * 2.4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
                break;
            }
            case TowerType.LASER: {
                // 激光炮台：聚焦环 ×3 + 透镜 + 光束
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-9, -7, 19, 14);
                ctx.fillStyle = '#5A6577';
                ctx.fillRect(6, -4.4, 22, 8.8);
                ctx.strokeStyle = A(0.9);
                ctx.lineWidth = 1.6;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(12 + i * 6, 0, 4.8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.fillStyle = A(0.95);
                ctx.beginPath();
                ctx.arc(28, 0, 3.4, 0, Math.PI * 2);
                ctx.fill();
                if (rec > 0.05) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.moveTo(30, -1.8);
                    ctx.lineTo(49, -4);
                    ctx.lineTo(49, 4);
                    ctx.lineTo(30, 1.8);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.SNIPER: {
                // 磁轨炮：电容组 + 双导轨 + 加速段 + 弹丸
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-11, -8, 13, 16);
                ctx.fillStyle = '#5A6577';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(-5, -5 + i * 5, 2.1, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#7C8290';
                ctx.fillRect(2, -6.4, 38, 3.4);
                ctx.fillRect(2, 3, 38, 3.4);
                ctx.strokeStyle = A(0.6);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(6, 0);
                ctx.lineTo(28, 0);
                ctx.stroke();
                ctx.fillStyle = A(0.95);
                ctx.beginPath();
                ctx.arc(32, 0, 3.2, 0, Math.PI * 2);
                ctx.fill();
                if (rec > 0.1) {
                    ctx.fillStyle = A(r);
                    ctx.beginPath();
                    ctx.arc(42, 0, 2.4 + rec * 2.6, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.FLAME: {
                // 焚化器：等离子燃料罐 + 喷管 + 火舌
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#2B313D';
                ctx.fillRect(-11, -10, 15, 20);
                ctx.fillStyle = A(0.8);
                ctx.fillRect(-11, -3, 15, 4);
                ctx.fillStyle = '#5A6577';
                ctx.fillRect(3, -4.4, 20, 8.8);
                ctx.fillStyle = '#7C8290';
                ctx.fillRect(22, -5.4, 5, 10.8);
                const f = 0.75 + Math.sin(t * 11 + seed) * 0.25;
                ctx.fillStyle = A(0.95);
                ctx.beginPath();
                ctx.ellipse(33, 0, 9 * f, 6 * f, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,236,180,0.95)';
                ctx.beginPath();
                ctx.ellipse(33, 0, 4 * f, 3 * f, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case TowerType.MAGNETIC: {
                // 引力场：环形发生器 + 三轴旋转场环 + 悬浮核心
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.strokeStyle = '#5A6577';
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.arc(4, 0, 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = A(0.7);
                ctx.lineWidth = 1.3;
                for (let i = 0; i < 3; i++) {
                    const a = t * 1.6 + i * 2.1 + seed;
                    ctx.beginPath();
                    ctx.ellipse(4, 0, 10 + Math.cos(a) * 2, 4.4 + Math.sin(a) * 1.6, a * 0.4, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.fillStyle = A(0.95);
                ctx.beginPath();
                ctx.arc(4, 0, 3.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = CYBER.textHi;
                ctx.beginPath();
                ctx.arc(3, 0, 1.4, 0, Math.PI * 2);
                ctx.fill();
                if (rec > 0.1) {
                    ctx.fillStyle = A(r * 0.7);
                    ctx.beginPath();
                    ctx.arc(4, 0, 14 + rec * 6, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }
            case TowerType.SINGULARITY: {
                // 奇点炮：暗物质弹仓与引力环
                ctx.save();
                ctx.translate(0, PIV);
                ctx.rotate(aim);
                ctx.fillStyle = '#20202E';
                ctx.fillRect(-10, -9, 20, 18);
                ctx.strokeStyle = A(0.85);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(12, 0, 12, 6, t * 1.4 + seed, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(12, 0, 7, 12, -t * 1.1, 0, Math.PI * 2);
                ctx.stroke();
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
     * 纳米虫群：矮胖的六足侦察机体。
     * 剪影 = 圆角机体 + 横贯的主题色扫描缝 + 下方四足。
     */
    drawNormalEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const legSwing = Math.sin(t * 7) * 1.6;
        // 四足
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const sx = i < 2 ? -1 : 1;
            const sw = i % 2 === 0 ? legSwing : -legSwing;
            ctx.beginPath();
            ctx.moveTo(sx * 6, 8);
            ctx.lineTo(sx * 11, 13 + sw);
            ctx.stroke();
        }
        // 机体
        const body = ctx.createLinearGradient(0, -12, 0, 10);
        body.addColorStop(0, hi);
        body.addColorStop(0.45, mid);
        body.addColorStop(1, dark);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-12, -3);
        ctx.lineTo(-7, -10);
        ctx.lineTo(7, -10);
        ctx.lineTo(12, -3);
        ctx.lineTo(10, 8);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 顶部散热格栅
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        for (let i = 0; i < 3; i++)
            ctx.fillRect(-5 + i * 4, -8.4, 2.4, 5);
        // 扫描缝（主题色）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 7;
        ctx.fillStyle = accent;
        ctx.fillRect(-9, -1.2, 18, 2.6);
        ctx.restore();
        // 单只大镜头
        this.drawLens(ctx, 0, 4.4, 4.2, accent, 0.6 + Math.sin(t * 5) * 0.4);
        // 铆钉
        ctx.fillStyle = MECH_EDGE;
        ctx.beginPath();
        ctx.arc(-9.5, 5.5, 1.1, 0, Math.PI * 2);
        ctx.arc(9.5, 5.5, 1.1, 0, Math.PI * 2);
        ctx.fill();
    }
    /**
     * 侦察机兵：高速俯冲的箭形侦察机。
     * 剪影 = 前掠尖锥 + 后掠翼 + 尾鳍，尾部拖出速度线。
     */
    drawFastEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const streak = (t * 40) % 12;
        const rgb = this.hexRgb(accent);
        // 速度线（向后拖）
        ctx.strokeStyle = this.rgbaStr(rgb, 0.45);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
            const yy = -4 + i * 4;
            ctx.beginPath();
            ctx.moveTo(-11 - streak - i * 3, yy);
            ctx.lineTo(-18 - streak - i * 3, yy);
            ctx.stroke();
        }
        // 后掠翼
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.lineTo(-9, -11);
        ctx.lineTo(-5, 1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-2, 3);
        ctx.lineTo(-9, 11);
        ctx.lineTo(-5, 1);
        ctx.closePath();
        ctx.fill();
        // 机身（朝右的尖锥）
        const g = ctx.createLinearGradient(0, -6, 0, 6);
        g.addColorStop(0, hi);
        g.addColorStop(0.5, mid);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(2, -6);
        ctx.lineTo(-8, -5);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-8, 5);
        ctx.lineTo(2, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.stroke();
        // 主题色机腹条纹
        ctx.fillStyle = accent;
        ctx.fillRect(-7, -1, 12, 2);
        // 尾鳍
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(-9, -1);
        ctx.lineTo(-14, -6.5);
        ctx.lineTo(-9, -4);
        ctx.closePath();
        ctx.fill();
        // 机首镜头
        this.drawLens(ctx, 8.5, 0, 3, accent, 0.7 + Math.sin(t * 8) * 0.3);
    }
    /**
     * 重装装甲车：履带式重装甲载具。
     * 剪影 = 方正车体 + 左右履带（齿纹滚动）+ 炮塔与炮管。
     */
    drawHeavyEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const tread = (t * 26) % 6;
        // 履带
        for (const sx of [-1, 1]) {
            const bx = sx * 10 - 4;
            ctx.fillStyle = '#171A21';
            ctx.fillRect(bx, -2, 8, 14);
            ctx.strokeStyle = edge;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, -2, 8, 14);
            ctx.strokeStyle = '#0B0D12';
            ctx.lineWidth = 1.6;
            for (let i = 0; i < 5; i++) {
                const yy = -1 + ((i * 3 + tread) % 13);
                ctx.beginPath();
                ctx.moveTo(bx + 0.8, yy);
                ctx.lineTo(bx + 7.2, yy);
                ctx.stroke();
            }
        }
        // 车体
        const g = ctx.createLinearGradient(0, -12, 0, 8);
        g.addColorStop(0, hi);
        g.addColorStop(0.5, mid);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-12, -4);
        ctx.lineTo(-9, -11);
        ctx.lineTo(8, -11);
        ctx.lineTo(13, -5);
        ctx.lineTo(13, 7);
        ctx.lineTo(-12, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        // 装甲分块
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2, -11);
        ctx.lineTo(-2, 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-12, 2);
        ctx.lineTo(13, 2);
        ctx.stroke();
        // 观察窗（主题色）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.fillStyle = accent;
        ctx.fillRect(-9, -8.4, 13, 2.6);
        ctx.restore();
        // 炮塔 + 炮管
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(-1, -11, 5.5, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = mid;
        ctx.fillRect(-1, -15, 12, 3.2);
        ctx.fillStyle = '#151820';
        ctx.fillRect(11, -15.6, 3, 4.4);
        // 铆钉
        ctx.fillStyle = edge;
        for (const p of [[-10, -2], [-10, 5], [11, -2], [11, 5]]) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    /**
     * 分裂孢子机：三段式裂变舱。
     * 剪影 = 圆舱 + 两条纵向能量缝 —— 死亡裂成 3 段，剪影提前把机制说清楚。
     */
    drawSplitEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const seam = 0.55 + Math.sin(t * 4) * 0.45;
        // 舱体
        const g = ctx.createRadialGradient(-4, -5, 0, 0, 0, 15);
        g.addColorStop(0, hi);
        g.addColorStop(0.55, mid);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 13.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 顶部注入阀
        ctx.fillStyle = dark;
        ctx.fillRect(-3, -16, 6, 3.5);
        ctx.fillStyle = edge;
        ctx.beginPath();
        ctx.arc(0, -16.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        // 两条能量缝（主题色）—— 死亡裂变的预告
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 8 * seam;
        ctx.strokeStyle = this.rgbaStr(this.hexRgb(accent), 0.5 + seam * 0.45);
        ctx.lineWidth = 2.2;
        for (const dx of [-4.5, 4.5]) {
            ctx.beginPath();
            ctx.moveTo(dx, -11.5);
            ctx.quadraticCurveTo(dx * 1.6, 0, dx, 11.5);
            ctx.stroke();
        }
        ctx.restore();
        // 中央核心
        this.drawLens(ctx, 0, 0, 4, accent, 0.6 + Math.sin(t * 6) * 0.4);
    }
    /**
     * 修复无人机：悬停四旋翼维修机。
     * 剪影 = 十字机身 + 四个旋转桨盘 + 底部主题色维修光束。
     */
    drawHealerEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const spin = t * 14;
        const rgb = this.hexRgb(accent);
        ctx.save();
        ctx.translate(0, Math.sin(t * 3) * 1.2);
        // 旋翼臂 + 桨盘
        for (const p of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const cx = p[0] * 10, cy = p[1] * 8;
            ctx.strokeStyle = dark;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p[0] * 3, p[1] * 2.5);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(spin * (p[0] * p[1] > 0 ? 1 : -1));
            ctx.fillStyle = this.rgbaStr(rgb, 0.5);
            ctx.fillRect(-6, -1, 12, 2);
            ctx.fillRect(-1, -6, 2, 12);
            ctx.restore();
            ctx.fillStyle = edge;
            ctx.beginPath();
            ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        // 十字机身（维修标记）
        ctx.fillStyle = mid;
        ctx.fillRect(-4, -9, 8, 18);
        ctx.fillRect(-9, -4, 18, 8);
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.strokeRect(-4, -9, 8, 18);
        ctx.strokeRect(-9, -4, 18, 8);
        // 主题色维修核心
        this.drawLens(ctx, 0, 0, 4.4, accent, 0.65 + Math.sin(t * 5) * 0.35);
        // 底部维修光束
        ctx.save();
        ctx.globalAlpha = 0.32 + Math.sin(t * 6) * 0.14;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(-4, 9);
        ctx.lineTo(4, 9);
        ctx.lineTo(7, 16);
        ctx.lineTo(-7, 16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
    /**
     * 微型机虫：分裂残片，最小的单眼三足机。
     */
    drawMiniEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const edge = mechColors?.edge || MECH_EDGE;
        // 三足
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const a = Math.PI * 0.5 + (i - 1) * 0.75;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 4, 5);
            ctx.lineTo(Math.cos(a) * 8, 11 + Math.sin(t * 9 + i) * 1.2);
            ctx.stroke();
        }
        // 六边机体
        ctx.fillStyle = mid;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * 7, py = Math.sin(a) * 7;
            if (i === 0)
                ctx.moveTo(px, py);
            else
                ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.stroke();
        // 单眼
        this.drawLens(ctx, 0, 0, 3, accent, 0.6 + Math.sin(t * 8) * 0.4);
    }
    /**
     * 相位隐形机：无翼棱锥隐形机。
     * 剪影 = 尖锐的三角楔形 + 断续的棱边（表达"相位不稳定"）。
     */
    drawGhostEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const flick = Math.sin(t * 5) * 0.5 + 0.5;
        // 机体
        const g = ctx.createLinearGradient(-12, 0, 12, 0);
        g.addColorStop(0, dark);
        g.addColorStop(1, mid);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-2, -11);
        ctx.lineTo(-12, -5);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-12, 5);
        ctx.lineTo(-2, 11);
        ctx.closePath();
        ctx.fill();
        // 主题色棱边（断续 = 相位不稳定）
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 9 * flick;
        ctx.strokeStyle = this.rgbaStr(this.hexRgb(accent), 0.5 + flick * 0.5);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -t * 12;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // 视觉核心
        this.drawLens(ctx, 4, 0, 3.6, accent, 0.5 + flick * 0.5);
    }
    /**
     * 护盾机兵：正面举盾的步兵机。
     * 剪影 = 宽肩机体 + 身前六边盾（主题色描边 = 护盾量）。
     */
    drawShieldEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const pulse = 0.6 + Math.sin(t * 4) * 0.4;
        const rgb = this.hexRgb(accent);
        // 腿
        ctx.fillStyle = dark;
        ctx.fillRect(-7, 6, 5, 8);
        ctx.fillRect(2, 6, 5, 8);
        // 机体
        const g = ctx.createLinearGradient(0, -12, 0, 8);
        g.addColorStop(0, hi);
        g.addColorStop(0.5, mid);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.fillRect(-8, -8, 16, 15);
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-8, -8, 16, 15);
        // 肩甲
        ctx.fillStyle = mid;
        ctx.fillRect(-13, -11, 6, 7);
        ctx.fillRect(7, -11, 6, 7);
        ctx.strokeRect(-13, -11, 6, 7);
        ctx.strokeRect(7, -11, 6, 7);
        // 头盔 + 目镜
        ctx.fillStyle = dark;
        ctx.fillRect(-4.5, -14, 9, 7);
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.fillStyle = accent;
        ctx.fillRect(-3.5, -11.5, 7, 2.2);
        ctx.restore();
        // 身前六边盾（朝右 = 前进方向）
        ctx.save();
        ctx.translate(10, 1);
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = this.rgbaStr(rgb, 0.16);
        ctx.strokeStyle = this.rgbaStr(rgb, 0.55 + pulse * 0.4);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = Math.cos(a) * 6, py = Math.sin(a) * 7.5;
            if (i === 0)
                ctx.moveTo(px, py);
            else
                ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    /**
     * 自爆机雷：布满尖刺的浮游机雷。
     * 剪影 = 球形弹体 + 8 根尖刺 + 急促闪烁的红芯
     * （警告玩家"别让它死在你的塔旁边"）。
     */
    drawBomberEnemy(ctx, accent, mechColors) {
        const t = this.time;
        const dark = mechColors?.dark || MECH_DARK;
        const mid = mechColors?.mid || MECH_MID;
        const hi = mechColors?.hi || MECH_HI;
        const edge = mechColors?.edge || MECH_EDGE;
        const blink = Math.sin(t * 9) > 0 ? 1 : 0.25;
        // 尖刺（用亮装甲色，暗色尖刺在暗通道上等于没画）
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
            ctx.lineTo(Math.cos(a) * 13.5, Math.sin(a) * 13.5);
            ctx.stroke();
        }
        // 球体
        const g = ctx.createRadialGradient(-4, -4, 0, 0, 0, 12);
        g.addColorStop(0, hi);
        g.addColorStop(0.55, mid);
        g.addColorStop(1, '#151920');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 环形警示带（主题色，上下断口）
        ctx.strokeStyle = this.rgbaStr(this.hexRgb(accent), 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0.25, Math.PI - 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 7, Math.PI + 0.25, Math.PI * 2 - 0.25);
        ctx.stroke();
        // 中心红芯（急促闪烁）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = 12 * blink;
        ctx.fillStyle = `rgba(255, 0, 51, ${0.45 + blink * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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