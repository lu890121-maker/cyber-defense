/**
 * 战斗特效系统（赛博防线 · 机械入侵）
 *
 * 设计目标：把"一个点一下"的命中改成有飞行、有撞击、有余波、有残留的战斗反馈。
 * 统一视觉语言 —— 赛博防线 + 机械入侵：
 *   · 打中机械单位先崩「金属碎屑 + 机油」，元素色只决定"为什么会崩"
 *   · 冰=冷却液结晶、电=电弧+火花、毒=腐蚀气泡、火=余烬、爆炸=冲击环+碎屑+焦痕
 *   · 亮部一律加 composite 'lighter' 发光，暗部用烟雾粒子做体积
 *
 * ⚠️ 主题换皮时最容易漏的一处：这里的"溅血"必须换成"溅机油"。
 * 机械军团流红血会立刻把整套赛博主题拉回生化恐怖片。
 *
 * 与游戏逻辑的关系：**只做表现，不结算伤害**。伤害仍由 Tower/Enemy 立即结算，
 * 这样弹道飞行期不会改变 DPS，测试（verify_skills / verify_browser）也能保持确定。
 * 表现层想看的是"打出去→飞→撞→溅→留下痕迹"这条完整时间线。
 */
import { TowerType, TOWER_CONFIGS } from '../config/GameConfig.js';
import { lightenHex } from '../config/CyberTheme.js';
/** 11 种防御塔的攻击视觉配方（数据驱动，改外观只改表） */
export const TOWER_VFX = {
    // 机关枪：嗒嗒嗒的黄铜弹壳 + 火药白烟 + 血雾
    [TowerType.MACHINE_GUN]: {
        proj: 'bullet', trail: 'spark', impact: 'ichor', muzzle: 'flash',
        speed: 620, size: 2.6, color: '#fde68a', arc: 0, recoil: 3.5, shake: 0.6
    },
    // 霜冻塔：玻璃质感的冰晶，拖一条霜雾，命中碎成冰渣
    [TowerType.FROST]: {
        proj: 'shard', trail: 'frost', impact: 'ice', muzzle: 'frost',
        speed: 420, size: 4.2, color: '#7dd3fc', arc: 0, recoil: 2, shake: 0.4
    },
    // 雷弧防御塔：瞬发光球 + 强烈火花与电弧（弹射链本身也是电）
    [TowerType.ELECTRIC]: {
        proj: 'orb', trail: 'spark', impact: 'shock', muzzle: 'spark',
        speed: 900, size: 3.4, color: '#67e8f9', arc: 0, recoil: 2.5, shake: 1.0
    },
    // 瘴毒防御塔：晃动鼓包的脓液囊，拖毒液，命中炸开毒雾气泡
    [TowerType.POISON]: {
        proj: 'glob', trail: 'goo', impact: 'bio', muzzle: 'puff',
        speed: 340, size: 4.6, color: '#a3e635', arc: 7, recoil: 2, shake: 0.3
    },
    // 爆裂防御塔：抛物线抛射的炮弹，落地冲击环 + 碎屑 + 焦痕
    [TowerType.BOMB]: {
        proj: 'shell', trail: 'smoke', impact: 'boom', muzzle: 'boom',
        speed: 300, size: 5.2, color: '#fb923c', arc: 26, recoil: 5, shake: 3.2
    },
    // 光束防御塔：弹速极快的光弹，落地一根贯穿光束
    [TowerType.LASER]: {
        proj: 'orb', trail: 'none', impact: 'spark', muzzle: 'flash',
        speed: 1400, size: 3.0, color: '#f472b6', arc: 0, recoil: 1.5, shake: 0.5
    },
    // 鹰眼防御塔：超音速曳光弹 + 音爆环
    [TowerType.SNIPER]: {
        proj: 'bullet', trail: 'none', impact: 'ichor', muzzle: 'flash',
        speed: 1900, size: 2.2, color: '#fca5a5', arc: 0, recoil: 6, shake: 1.6
    },
    // 焚焰防御塔：火球，拖一路余烬
    [TowerType.FLAME]: {
        proj: 'fire', trail: 'ember', impact: 'flame', muzzle: 'puff',
        speed: 380, size: 5.0, color: '#fb923c', arc: 4, recoil: 2, shake: 0.5
    },
    // 磁引防御塔：带环绕碎屑的金属球
    [TowerType.MAGNETIC]: {
        proj: 'orb', trail: 'spark', impact: 'spark', muzzle: 'spark',
        speed: 460, size: 4.0, color: '#c4b5fd', arc: 0, recoil: 3, shake: 0.9
    },
    [TowerType.SINGULARITY]: {
        proj: 'shell', trail: 'dark', impact: 'dark', muzzle: 'dark',
        speed: 320, size: 5.4, color: '#c084fc', arc: 16, recoil: 5, shake: 2.5
    },
};
/** 取某种塔的视觉配方；拿不到就退回机关枪（不会崩） */
export function styleOf(type) {
    return TOWER_VFX[type] || TOWER_VFX[TowerType.MACHINE_GUN];
}
/**
 * 等级对弹道的视觉增益（索引 = 等级 − 1）。**唯一事实来源** —— 想让升级"看起来更强"只改这行。
 *
 * 为什么是乘法而不是各字段单独标：塔的等级只在战斗内可见，玩家没有耐心读数值，
 * 只能靠"这一发比上一发更粗更亮更响"来建立"我升级了"的感知。四个梯度的间距
 * 必须逐档拉开（1 → 1.3 → 1.65 → 2.05），否则 Lv2 和 Lv3 在满屏乱斗里根本分不出。
 */
export const VFX_TIER_GROWTH = [1, 1.3, 1.65, 2.05];
/** 等级越界安全地取增益倍数（超出 4 级仍按 4 级算） */
export function vfxTierGrowth(level) {
    const i = Math.max(0, Math.min(VFX_TIER_GROWTH.length - 1, Math.round(level) - 1));
    return VFX_TIER_GROWTH[i];
}
/**
 * 按「塔型配方 × 等级」派生这一发应有的视觉配方。
 * Lv1 直接返回基础配方（零改动，线上行为不变）；Lv2 起逐档加码：
 *   · size / 发光半径 → 弹头更大更亮
 *   · color             → Lv3 起提亮（`lightenHex`），Lv4 明显发亮
 *   · speed             → 略快，手感更"锐"（有 45ms 上限兜底，不会瞬移）
 *   · shake / recoil    → 开火与命中的分量感
 *   · tier              → 记录等级，交给 `renderProjectile` 画额外层
 *
 * 纯函数 + 确定性：`verify_art` / `verify_vfx` 可以对同一 (type, level) 反复比对。
 */
export function styleForLevel(type, level) {
    const base = styleOf(type);
    const lv = Math.max(1, Math.min(VFX_TIER_GROWTH.length, Math.round(level)));
    if (lv <= 1)
        return base;
    const g = vfxTierGrowth(lv);
    return {
        ...base,
        size: base.size * g,
        speed: base.speed * (1 + 0.035 * (lv - 1)),
        shake: base.shake * (1 + 0.2 * (lv - 1)),
        recoil: base.recoil * (1 + 0.12 * (lv - 1)),
        // Lv2 保持原色（刚升级不该抢戏），Lv3 / Lv4 才明显提亮
        color: lv >= 3 ? lightenHex(base.color, 0.12 * (lv - 2)) : base.color,
        tier: lv,
    };
}
/** 取某种塔的主色（配方色 → 配置色 兜底） */
export function colorOf(type) {
    return styleOf(type).color || TOWER_CONFIGS[type].color;
}
const MAX_PARTICLES = 620;
const rand = (a, b) => a + Math.random() * (b - a);
/** hex '#rrggbb' → rgb */
function hexRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
/**
 * 特效中枢。
 *
 * 三条时间线：
 *  · 发射（muzzle + recoil）：塔开火的瞬间，枪口火光 + 后坐位移
 *  · 飞行（projectile）：按配方飞过去，途中持续掉拖尾粒子
 *  · 命中（impact + shockwave + decal + shake）：炸开、溅血、留焦痕、震屏
 * 外加脱离这三条线的：状态粒子（燃烧/中毒/冻结）、死亡爆散、飘字、镜头震动/顿帧。
 */
export class VfxSystem {
    constructor() {
        this.particles = [];
        this.projectiles = [];
        this.beams = [];
        this.waves = [];
        this.floaters = [];
        this.decals = [];
        this.flashes = [];
        /** 上一帧还活着的敌人，用于检测死亡 */
        this.tracked = new Map();
        this.shakePower = 0;
        this.shakeDecay = 6;
        this.shakeX = 0;
        this.shakeY = 0;
        this.hitStopTimer = 0;
        this.hitStopTotal = 0;
        this.time = 0;
        /** 场景氛围计时（手术灯闪烁/尘埃） */
        this.ambientTimer = 0;
    }
    clear() {
        this.particles = [];
        this.projectiles = [];
        this.beams = [];
        this.waves = [];
        this.floaters = [];
        this.decals = [];
        this.flashes = [];
        this.tracked.clear();
        this.shakePower = 0;
        this.hitStopTimer = 0;
    }
    // ── 粒子基元 ─────────────────────────────────────────────
    addParticle(p) {
        if (this.particles.length >= MAX_PARTICLES) {
            // 池满时替换掉最快死掉的那个（不阻塞特效，也不无限增内存）
            let worst = 0;
            for (let i = 1; i < this.particles.length; i++) {
                if (this.particles[i].life / this.particles[i].maxLife < this.particles[worst].life / this.particles[worst].maxLife)
                    worst = i;
            }
            this.particles[worst] = p;
            return;
        }
        this.particles.push(p);
    }
    mkParticle(x, y, vx, vy, life, size, color, shape, glow, drag = 2.2, grav = 0) {
        const { r, g, b } = hexRgb(color);
        this.addParticle({
            x, y, vx, vy,
            life, maxLife: life, size,
            r, g, b, drag, grav, shape,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: rand(-9, 9),
            glow
        });
    }
    /**
     * 锥形喷射（枪口、爆炸都用它）
     * @param drag 空气阻力：越大越快停下（烟雾低、火花高）
     * @param grav 重力：正数下落（弹壳/碎屑），负数上浮（火焰/气泡）
     */
    burst(x, y, angle, spread, count, speed, life, size, color, shape, glow, drag = 2.2, grav = 0) {
        for (let i = 0; i < count; i++) {
            const a = angle + rand(-spread, spread);
            const s = rand(speed[0], speed[1]);
            this.mkParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life[0], life[1]), rand(size[0], size[1]), color, shape, glow, drag, grav);
        }
    }
    /** 全向迸发 */
    burst360(x, y, count, speed, life, size, color, shape, glow, drag = 2.2, grav = 0) {
        for (let i = 0; i < count; i++) {
            const a = rand(0, Math.PI * 2);
            const s = rand(speed[0], speed[1]);
            this.mkParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life[0], life[1]), rand(size[0], size[1]), color, shape, glow, drag, grav);
        }
    }
    // ── 对外事件 API ─────────────────────────────────────────
    /** 塔开火：枪口表现 + 生成飞行弹道。返回是否成功发射。 */
    fire(style, sx, sy, tx, ty, power = 1, onArrive) {
        const dist = Math.hypot(tx - sx, ty - sy);
        const angle = Math.atan2(ty - sy, tx - sx);
        const duration = Math.max(0.02, Math.min(0.45, dist / Math.max(60, style.speed * rand(0.92, 1.08))));
        this.spawnMuzzle(style, sx, sy, angle, power);
        this.projectiles.push({
            x: sx, y: sy, fromX: sx, fromY: sy, toX: tx, toY: ty,
            t: 0, duration, style, power,
            rot: angle, seed: Math.random() * 1000, onArrive
        });
    }
    /** 枪口火光 + 弹壳/碎屑 + 反向烟雾 */
    spawnMuzzle(style, x, y, angle, power = 1) {
        const c = style.color;
        const k = style.muzzle;
        // 光源闪光（t=0 的一帧亮斑，配合 shadowBlur 一起构成"枪口"）
        this.flashes.push({ x, y, r: 10 + 12 * power, life: 0.07, maxLife: 0.07, color: k === 'frost' ? '#e0f2fe' : k === 'vapor' ? '#f1f5f9' : '#fff7ed' });
        switch (k) {
            case 'flash':
                this.burst(x, y, angle, 0.28, 5 + Math.round(3 * power), [90, 260], [0.05, 0.14], [1.5, 3.4], '#fef3c7', 'spark', true);
                this.burst(x, y, angle + Math.PI, 0.9, 3, [20, 60], [0.2, 0.4], [1.6, 3.2], '#94a3b8', 'smoke', false);
                // 抛壳
                const ea = angle + Math.PI / 2 + rand(-0.3, 0.3);
                this.mkParticle(x, y, Math.cos(ea) * 90, Math.sin(ea) * 90 - 70, 0.7, 1.8, '#fbbf24', 'shard', true, 3, 420);
                break;
            case 'frost':
                this.burst(x, y, angle, 0.5, 8, [70, 170], [0.12, 0.3], [1.4, 3.2], '#bae6fd', 'shard', true, 3, 90);
                break;
            case 'spark':
                this.burst(x, y, angle, 0.5, 9, [110, 300], [0.06, 0.18], [1.2, 2.8], '#a5f3fc', 'spark', true, 1.5);
                this.burst(x, y, angle, 0.7, 4, [30, 90], [0.3, 0.5], [2, 4], '#64748b', 'smoke', false);
                break;
            case 'boom':
                this.burst(x, y, angle, 0.6, 10, [140, 340], [0.1, 0.26], [2, 4.6], '#fed7aa', 'spark', true, 2);
                this.burst(x, y, angle + Math.PI, 0.8, 5, [40, 110], [0.25, 0.5], [3, 6], '#57534e', 'smoke', false);
                break;
            case 'vapor':
                this.burst(x, y, angle, 0.6, 7, [50, 130], [0.3, 0.6], [2, 4.6], '#e2e8f0', 'smoke', false, 4);
                break;
            case 'dark':
                this.burst(x, y, angle, 0.5, 8, [60, 150], [0.25, 0.55], [2.4, 5], '#4c1d95', 'smoke', false, 3);
                break;
            case 'puff':
            default:
                this.burst(x, y, angle, 0.55, 6, [60, 170], [0.2, 0.45], [2, 4.4], '#a8a29e', 'smoke', false, 3);
                break;
        }
    }
    /**
     * 命中：溅血 + 元素效果 + 冲击环 + 焦痕 + 震屏。
     * @param angle 命中方向（用于把溅射扇面摆向正确一侧）
     */
    impact(x, y, kind, angle, power = 1) {
        const p = Math.max(0.4, power);
        // 无论什么元素，先崩一层"金属碎屑 + 火花"——这是机械单位受击的底色
        // （原来这里溅的是脓血；主题换成机械军团后，溅血立刻变回生化恐怖片）
        this.burst(x, y, angle, 1.0, 4 + Math.round(3 * p), [80, 260], [0.12, 0.3], [1.2, 2.8], '#ffd9a0', 'spark', true, 230);
        this.burst(x, y, angle, 1.25, 3, [40, 130], [0.3, 0.6], [1.6, 3.2], '#4b5563', 'shard', false, 340);
        switch (kind) {
            case 'ichor':
                // 基础弹种：打穿装甲 → 机油喷溅 + 环形震波 + 地面油渍
                this.burst360(x, y, 4, [40, 120], [0.35, 0.7], [2, 4.4], '#6b7280', 'dot', false, 300);
                this.waves.push({ x, y, life: 0.22, maxLife: 0.22, r0: 2, r1: 14 + 8 * p, color: '#fde68a', width: 1.6, kind: 'ring' });
                this.decals.push({ x, y, r: 6 + 5 * p, life: 4.5, maxLife: 4.5, color: '#1f2937', kind: 'splat', seed: Math.random() * 10 });
                break;
            case 'ice':
                this.burst360(x, y, 8 + Math.round(5 * p), [110, 300], [0.25, 0.55], [1.6, 3.6], '#e0f2fe', 'shard', true, 340);
                this.waves.push({ x, y, life: 0.3, maxLife: 0.3, r0: 3, r1: 22 + 12 * p, color: '#bae6fd', width: 2, kind: 'shatter' });
                break;
            case 'shock':
                // EMP 波纹：内层亮环 + 外层扩散脉冲 + 电弧 + 短促白光，
                // 这是「电磁干扰」的视觉签名（PRD 要求的 EMP 波纹）
                this.burst360(x, y, 10 + Math.round(6 * p), [140, 380], [0.08, 0.24], [1.2, 2.6], '#a5f3fc', 'spark', true, 120);
                this.waves.push({ x, y, life: 0.18, maxLife: 0.18, r0: 1, r1: 18 + 10 * p, color: '#67e8f9', width: 2.2, kind: 'ring' });
                this.waves.push({ x, y, life: 0.44, maxLife: 0.44, r0: 2, r1: 30 + 14 * p, color: '#22d3ee', width: 1.4, kind: 'pulse' });
                this.beams.push({ x1: x, y1: y, x2: x + rand(-16, 16), y2: y + rand(-16, 16), life: 0.09, maxLife: 0.09, color: '#cffafe', kind: 'arc', seed: Math.random() * 99 });
                this.flashes.push({ x, y, r: 16 * p, life: 0.1, maxLife: 0.1, color: '#a5f3fc' });
                this.shake(1.2 * p);
                break;
            case 'bio':
                this.burst360(x, y, 7 + Math.round(4 * p), [40, 130], [0.4, 0.8], [2.4, 5.4], '#bef264', 'bubble', false, -30);
                this.burst(x, y, angle, 1.2, 6, [60, 170], [0.25, 0.5], [1.6, 3.4], '#4d7c0f', 'dot', false, 3, 260);
                break;
            case 'boom':
                this.waves.push({ x, y, life: 0.42, maxLife: 0.42, r0: 6, r1: 34 * (1 + 0.28 * (p - 1)) + 26, color: '#fdba74', width: 3.5, kind: 'ring' });
                this.waves.push({ x, y, life: 0.3, maxLife: 0.3, r0: 2, r1: 20, color: '#fff7ed', width: 6, kind: 'ring' });
                this.burst360(x, y, 14 + Math.round(8 * p), [160, 460], [0.2, 0.5], [1.6, 4], '#fdba74', 'spark', true, 300);
                this.burst360(x, y, 8, [40, 110], [0.5, 0.9], [5, 10], '#57534e', 'smoke', false, -20);
                this.burst360(x, y, 6, [80, 220], [0.4, 0.8], [2, 4.4], '#78350f', 'shard', false, 420);
                this.flashes.push({ x, y, r: 30 * p, life: 0.12, maxLife: 0.12, color: '#fed7aa' });
                this.decals.push({ x, y, r: 16 + 8 * p, life: 6, maxLife: 6, color: '#1c1917', kind: 'scorch', seed: Math.random() * 10 });
                this.shake(3.2 * p);
                break;
            case 'flame':
                this.burst360(x, y, 9 + Math.round(5 * p), [50, 160], [0.3, 0.7], [2.4, 5.6], '#fb923c', 'dot', true, -60);
                this.burst360(x, y, 4, [30, 90], [0.5, 0.9], [4, 8], '#44403c', 'smoke', false, -40);
                break;
            case 'dark':
                this.burst360(x, y, 8 + Math.round(4 * p), [50, 170], [0.3, 0.7], [2.6, 6], '#4c1d95', 'smoke', false, -25);
                this.waves.push({ x, y, life: 0.35, maxLife: 0.35, r0: 4, r1: 26 + 10 * p, color: '#7c3aed', width: 2, kind: 'pulse' });
                break;
            case 'gas':
                this.burst360(x, y, 6 + Math.round(4 * p), [40, 120], [0.5, 0.9], [3, 7], '#e2e8f0', 'smoke', false, -12);
                break;
            case 'spark':
            default:
                this.burst360(x, y, 7 + Math.round(4 * p), [130, 330], [0.1, 0.28], [1.4, 3], '#fecdd3', 'spark', true, 160);
                this.waves.push({ x, y, life: 0.2, maxLife: 0.2, r0: 2, r1: 13 + 8 * p, color: '#fda4af', width: 1.8, kind: 'ring' });
                break;
        }
    }
    /** 闪电链 / 光束 / 贯穿线 */
    beam(x1, y1, x2, y2, kind, color, life = 0.12) {
        this.beams.push({ x1, y1, x2, y2, life, maxLife: life, color, kind, seed: Math.random() * 99 });
    }
    /** 冲击环（爆炸/护盾破碎/磁力场） */
    shockwave(x, y, color, r1, life = 0.3, width = 3, kind = 'ring') {
        this.waves.push({ x, y, life, maxLife: life, r0: 2, r1, color, width, kind });
    }
    /** 全屏光源闪（大爆炸/暴击） */
    flash(x, y, r, color, life = 0.1) {
        this.flashes.push({ x, y, r, life, maxLife: life, color });
    }
    /** 飘字（伤害数字 / 治疗 / 闪避） */
    floater(x, y, text, color, size = 11, crit = false) {
        this.floaters.push({
            x: x + rand(-3, 3), y, vy: crit ? -52 : -38,
            life: crit ? 0.95 : 0.7, maxLife: crit ? 0.95 : 0.7,
            text, color, size, crit
        });
    }
    /** 震屏 */
    shake(power) {
        this.shakePower = Math.min(14, Math.max(this.shakePower, power));
    }
    /** 顿帧：命中瞬间的极短冻结，用来强化"打实了"的手感 */
    hitStop(duration) {
        this.hitStopTimer = Math.min(0.09, Math.max(this.hitStopTimer, duration));
        this.hitStopTotal = Math.max(this.hitStopTotal, duration);
    }
    /** 是否处于顿帧中（调用方据此跳过游戏逻辑更新） */
    isFrozen() {
        return this.hitStopTimer > 0;
    }
    // ── 每帧更新 ─────────────────────────────────────────────
    /**
     * @param enemies 当前存活敌人列表，用于状态粒子与死亡检测
     * @param fast 顿帧时传 true，只推进表现层不推进逻辑
     */
    update(deltaTime, enemies, fast = false) {
        this.time += deltaTime;
        // 顿帧：表现层继续走，但只走一半速度，制造"打实了"的黏滞感
        const vdt = fast ? deltaTime * 0.35 : deltaTime;
        this.spawnStatusParticles(enemies, vdt);
        this.trackDeaths(enemies);
        // 弹道飞行
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            pr.t += vdt;
            const k = Math.min(1, pr.t / pr.duration);
            // 抛物线抬升：飞行中段最高
            const lift = pr.style.arc > 0 ? Math.sin(k * Math.PI) * pr.style.arc : 0;
            const nx = pr.fromX + (pr.toX - pr.fromX) * k;
            const ny = pr.fromY + (pr.toY - pr.fromY) * k - lift;
            const px = pr.x, py = pr.y;
            pr.x = nx;
            pr.y = ny;
            pr.rot += (pr.style.proj === 'shard' ? 14 : 6) * vdt * (pr.seed % 2 === 0 ? 1 : -1);
            this.spawnTrail(pr, px, py);
            if (k >= 1) {
                this.projectiles.splice(i, 1);
                this.impact(pr.toX, pr.toY, pr.style.impact, Math.atan2(pr.toY - pr.fromY, pr.toX - pr.fromX), pr.power);
                if (pr.onArrive)
                    pr.onArrive();
            }
        }
        // 粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= vdt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            const d = Math.max(0, 1 - p.drag * vdt);
            p.vx *= d;
            p.vy *= d;
            p.vy += p.grav * vdt;
            p.x += p.vx * vdt;
            p.y += p.vy * vdt;
            p.rot += p.rotSpeed * vdt;
            // 气泡上浮、烟雾轻微上飘
            if (p.shape === 'bubble')
                p.y -= 12 * vdt;
            if (p.shape === 'smoke')
                p.vy -= 14 * vdt;
        }
        for (let i = this.beams.length - 1; i >= 0; i--) {
            const b = this.beams[i];
            b.life -= vdt;
            if (b.life <= 0)
                this.beams.splice(i, 1);
        }
        for (let i = this.waves.length - 1; i >= 0; i--) {
            const w = this.waves[i];
            w.life -= vdt;
            if (w.life <= 0)
                this.waves.splice(i, 1);
        }
        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const f = this.flashes[i];
            f.life -= vdt;
            if (f.life <= 0)
                this.flashes.splice(i, 1);
        }
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            const f = this.floaters[i];
            f.life -= vdt;
            f.y += f.vy * vdt;
            f.vy *= Math.max(0, 1 - 2.6 * vdt);
            if (f.life <= 0)
                this.floaters.splice(i, 1);
        }
        for (let i = this.decals.length - 1; i >= 0; i--) {
            const d = this.decals[i];
            d.life -= deltaTime;
            if (d.life <= 0)
                this.decals.splice(i, 1);
        }
        // 震动衰减
        this.shakePower = Math.max(0, this.shakePower - this.shakeDecay * this.shakePower * deltaTime - 2 * deltaTime);
        this.shakeX = rand(-1, 1) * this.shakePower;
        this.shakeY = rand(-1, 1) * this.shakePower;
        if (this.hitStopTimer > 0)
            this.hitStopTimer = Math.max(0, this.hitStopTimer - vdt);
        else
            this.hitStopTotal = 0;
        // 场景氛围：手术灯尘、漂浮尘埃
        this.ambientTimer -= deltaTime;
        if (this.ambientTimer <= 0) {
            this.ambientTimer = 0.09;
            this.mkParticle(rand(0, 450), rand(40, 700), rand(-6, 6), rand(-14, -4), rand(2.5, 5), rand(0.6, 1.6), '#94a3b8', 'dot', false, 0.2);
        }
    }
    /** 弹道拖尾 */
    spawnTrail(pr, px, py) {
        const t = pr.style.trail;
        // 等级越高，拖尾越密越大 —— "弹道看起来更强"里最省成本的一层。
        // 密度和尺寸都走乘法，保证 Lv1 的观感与改动前完全一致（verify_vfx 才不会被扰动）。
        const tier = pr.style.tier ?? 1;
        const dens = 1 + 0.3 * (tier - 1);
        const big = 1 + 0.22 * (tier - 1);
        switch (t) {
            case 'spark':
                if (Math.random() < Math.min(0.98, 0.7 * dens))
                    this.mkParticle(px, py, rand(-20, 20), rand(-20, 20), rand(0.08, 0.2), rand(1, 2.2) * big, '#fef9c3', 'spark', true, 4);
                break;
            case 'frost':
                if (Math.random() < Math.min(0.98, 0.8 * dens))
                    this.mkParticle(px, py, rand(-16, 16), rand(-16, 16), rand(0.2, 0.45), rand(1.2, 2.6) * big, '#bae6fd', 'shard', true, 3);
                break;
            case 'smoke':
                if (Math.random() < Math.min(0.98, 0.85 * dens))
                    this.mkParticle(px, py, rand(-12, 12), rand(-12, 12), rand(0.3, 0.6), rand(2, 4.4) * big, '#57534e', 'smoke', false, 2.5);
                break;
            case 'ember':
                if (Math.random() < Math.min(0.98, 0.9 * dens))
                    this.mkParticle(px, py, rand(-24, 24), rand(-30, 6), rand(0.25, 0.55), rand(1.2, 2.8) * big, '#fdba74', 'dot', true, 2.5, -40);
                break;
            case 'goo':
                if (Math.random() < Math.min(0.98, 0.5 * dens))
                    this.mkParticle(px, py, rand(-18, 18), rand(-18, 18), rand(0.2, 0.4), rand(1.4, 3) * big, '#a3e635', 'dot', false, 3, 260);
                break;
            case 'vapor':
                if (Math.random() < Math.min(0.98, 0.6 * dens))
                    this.mkParticle(px, py, rand(-14, 14), rand(-14, 14), rand(0.35, 0.7), rand(2, 4) * big, '#e2e8f0', 'smoke', false, 3);
                break;
            case 'dark':
                if (Math.random() < Math.min(0.98, 0.8 * dens))
                    this.mkParticle(px, py, rand(-16, 16), rand(-16, 16), rand(0.3, 0.6), rand(2.4, 5) * big, '#4c1d95', 'smoke', false, 2.5);
                break;
            case 'none': {
                // 高速光束和磁轨弹也留下彩色曳光，不再出现“看不见弹道”。
                const { r, g, b } = hexRgb(pr.style.color);
                const color = `rgb(${r},${g},${b})`;
                if (Math.random() < Math.min(0.99, 0.82 * dens)) {
                    this.mkParticle(px, py, rand(-8, 8), rand(-8, 8), rand(0.08, 0.17), rand(1.1, 2.0) * big, color, 'spark', true, 4);
                }
                if (tier >= 2 && Math.random() < Math.min(0.95, 0.5 * dens)) {
                    this.mkParticle(px, py, rand(-4, 4), rand(-4, 4), rand(0.08, 0.15), rand(1.3, 2.2) * big, '#e0f2fe', 'dot', true, 3);
                }
                break;
            }
        }
        // Lv3 起额外挂一格"能量余烬"：紧贴弹头尾端的发光点，
        // 单看这一粒就能把 Lv2 和 Lv3 的弹道分开。
        if (tier >= 3) {
            const { r, g, b } = hexRgb(pr.style.color);
            this.mkParticle(px, py, rand(-6, 6), rand(-6, 6), rand(0.12, 0.22), rand(1.4, 2.4), `rgb(${r},${g},${b})`, 'dot', true, 1.5);
        }
    }
    /**
     * 状态粒子：燃烧 / 中毒 / 冻结 / 眩晕 在敌人身上持续冒出来的表现。
     * 这是"敌人被打中之后"的关键——玩家要能看出它正处在什么状态。
     */
    spawnStatusParticles(enemies, dt) {
        for (const e of enemies) {
            if (!e.isAlive())
                continue;
            const x = e.getX(), y = e.getY(), s = e.getSize();
            if (e.isBurning()) {
                if (Math.random() < 0.55) {
                    this.mkParticle(x + rand(-s, s), y + rand(-s * 0.6, s * 0.6), rand(-14, 14), rand(-70, -34), rand(0.25, 0.5), rand(1.4, 3), Math.random() < 0.5 ? '#fb923c' : '#fde68a', 'dot', true, 2, -60);
                }
                // 火焰底部偶尔一粒上升的黑烟
                if (Math.random() < 0.12)
                    this.mkParticle(x, y - s, rand(-8, 8), -22, 0.8, rand(2, 4), '#44403c', 'smoke', false, 2);
            }
            if (e.isPoisoned()) {
                if (Math.random() < 0.35) {
                    this.mkParticle(x + rand(-s, s), y - rand(0, s), rand(-10, 10), rand(-34, -14), rand(0.5, 0.9), rand(1.4, 3.4), '#bef264', 'bubble', false, 1.2);
                }
                if (Math.random() < 0.1)
                    this.mkParticle(x + rand(-s, s), y + s, rand(-8, 8), -6, 0.6, rand(1.2, 2.6), '#4d7c0f', 'dot', false, 3, 240);
            }
            if (e.isSlowed() && Math.random() < 0.4) {
                this.mkParticle(x + rand(-s, s), y + rand(-s, s), rand(-8, 8), rand(-8, 8), rand(0.2, 0.4), rand(1, 2.4), '#e0f2fe', 'shard', true, 3);
            }
            if (e.isStunned() && Math.random() < 0.3) {
                this.beams.push({
                    x1: x - s, y1: y + rand(-s, s),
                    x2: x + s, y2: y + rand(-s, s),
                    life: 0.06, maxLife: 0.06, color: '#fef08a', kind: 'arc', seed: Math.random() * 99
                });
            }
            // 标记（影缚防御塔）：脚下转一圈符文环
            if (e.isMarked() && Math.random() < 0.12) {
                const a = rand(0, Math.PI * 2);
                this.mkParticle(x + Math.cos(a) * s * 1.4, y + Math.sin(a) * s * 1.4, 0, 0, 0.3, 2.4, '#a78bfa', 'dot', true, 3);
            }
            void dt;
        }
    }
    /** 死亡检测：敌人这一帧死掉 → 爆散 */
    trackDeaths(enemies) {
        const aliveSet = new Set(enemies);
        // 存活列表里没了 → 死
        this.tracked.forEach((_wasAlive, enemy) => {
            if (!aliveSet.has(enemy) || !enemy.isAlive()) {
                if (!aliveSet.has(enemy)) {
                    this.deathBurst(enemy.getX(), enemy.getY(), enemy.getSize(), enemy.getType());
                    this.tracked.delete(enemy);
                }
                else if (!enemy.isAlive()) {
                    this.deathBurst(enemy.getX(), enemy.getY(), enemy.getSize(), enemy.getType());
                    this.tracked.delete(enemy);
                }
            }
        });
        for (const e of enemies)
            if (e.isAlive())
                this.tracked.set(e, true);
    }
    /** 死亡爆散：按体型缩放的血肉爆开 + 地面残留 */
    deathBurst(x, y, size, _type) {
        const n = Math.round(10 + size * 1.1);
        this.burst360(x, y, n, [60, 260 + size * 6], [0.3, 0.8], [1.4, 3.4], '#b91c1c', 'dot', false, 380);
        this.burst360(x, y, Math.round(n * 0.4), [40, 180], [0.4, 0.9], [1.6, 4], '#7f1d1d', 'shard', false, 320);
        this.burst360(x, y, 4, [20, 70], [0.6, 1.0], [3, 6], '#450a0a', 'smoke', false, -20);
        this.waves.push({ x, y, life: 0.25, maxLife: 0.25, r0: 3, r1: 12 + size * 2, color: '#fca5a5', width: 2, kind: 'ring' });
        this.decals.push({ x, y, r: 10 + size * 1.4, life: 7, maxLife: 7, color: '#7f1d1d', kind: 'splat', seed: Math.random() * 10 });
        this.shake(0.8 + size * 0.12);
    }
    // ── 渲染 ─────────────────────────────────────────────────
    /** 进入/退出镜头扰动（世界层调用，返回可直接 setTransform 的偏移） */
    getShakeOffset() {
        return { x: this.shakeX, y: this.shakeY };
    }
    /** 世界空间特效：焦痕（最底）→ 弹道 → 粒子 → 光束 → 冲击环 → 闪光 */
    renderWorld(ctx) {
        // 地面残留：焦痕 + 血泊
        for (const d of this.decals) {
            const a = d.kind === 'scorch' ? 0.45 * (d.life / d.maxLife) : 0.3 * (d.life / d.maxLife);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = d.color;
            ctx.beginPath();
            if (d.kind === 'scorch') {
                // 烧焦：不规则多边形
                ctx.ellipse(d.x, d.y, d.r * 0.7, d.r * 0.8, d.seed, 0, Math.PI * 2);
            }
            else {
                // 溅血：主斑 + 若干卫星小点（用 seed 决定，保证每摊形状稳定）
                ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.seed, 0, Math.PI * 2);
            }
            ctx.fill();
            for (let i = 0; i < 3; i++) {
                const a2 = d.seed + i * 2.1;
                const rr = d.r * (1.5 + 0.4 * i);
                ctx.beginPath();
                ctx.ellipse(d.x + Math.cos(a2) * rr, d.y + Math.sin(a2) * rr * 0.7, d.r * 0.16, d.r * 0.12, a2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        // 弹道
        for (const pr of this.projectiles)
            this.renderProjectile(ctx, pr);
        // 粒子：发光体走 'lighter'
        ctx.save();
        for (const p of this.particles) {
            const a = Math.min(1, p.life / p.maxLife);
            ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
            this.drawParticleShape(ctx, p);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.restore();
        // 光束（电/激光）在最上层，'lighter' 叠加发光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of this.beams)
            this.renderBeam(ctx, b);
        ctx.restore();
        // 冲击环
        for (const w of this.waves)
            this.renderWave(ctx, w);
        // 光源闪光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const f of this.flashes) {
            const k = f.life / f.maxLife;
            const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.4 + 0.6 * (1 - k)));
            const { r, g: gg, b } = hexRgb(f.color);
            g.addColorStop(0, `rgba(${r},${gg},${b},${0.9 * k})`);
            g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * (1 - k)), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    drawParticleShape(ctx, p) {
        const a = Math.min(1, p.life / p.maxLife);
        switch (p.shape) {
            case 'shard': {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.beginPath();
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size * 0.7, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size * 0.7, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'spark': {
                // 沿运动方向拉长的一道亮线
                const len = Math.min(9, p.size + Math.hypot(p.vx, p.vy) * 0.02);
                const ang = Math.atan2(p.vy, p.vx);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(ang);
                ctx.fillRect(-len * 0.5, -p.size * 0.35, len, Math.max(0.6, p.size * 0.7));
                ctx.restore();
                break;
            }
            case 'bubble': {
                ctx.save();
                ctx.globalAlpha = a * 0.75;
                ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.8 + 0.2 * a), 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = a * 0.25;
                ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'smoke': {
                const k = 1 + (1 - a) * 1.6;
                ctx.save();
                ctx.globalAlpha = a * 0.4;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'dot':
            default: {
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.4, p.size * (0.4 + 0.6 * a)), 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }
    }
    renderProjectile(ctx, pr) {
        const st = pr.style;
        const ang = Math.atan2(pr.toY - pr.fromY, pr.toX - pr.fromX);
        const { r, g, b } = hexRgb(st.color);
        const tier = st.tier ?? 1;
        ctx.save();
        ctx.translate(pr.x, pr.y);
        // 亮尾光（lighter）。半径随等级外扩 —— Lv4 的弹头自带一团"能量场"
        ctx.globalCompositeOperation = 'lighter';
        const glowR = st.size * (2.6 + 0.3 * (tier - 1));
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
        gg.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
        gg.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(ang);
        // ── 等级带来的额外视觉层（Lv2 起，纯表现，不碰任何数值结算）──
        // 为什么要"分层累加"而不是只把 size 调大：满屏乱斗里玩家只会扫一眼，
        // 光度上的突变比尺寸上的渐进更早被感知。三层分别对应
        //   Lv2 = 能量环 / Lv3 = 残影 / Lv4 = 环绕碎屑，逐档都有"看得出的新增元素"。
        if (tier >= 2) {
            // 能量环：贴弹头外一圈 lighter 亮环，Lv3/Lv4 逐档加宽加亮
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + 0.14 * (tier - 2)})`;
            ctx.lineWidth = 0.8 + 0.5 * (tier - 2);
            ctx.beginPath();
            ctx.arc(0, 0, st.size * (1.75 + 0.3 * (tier - 2)), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
        if (tier >= 3) {
            // 残影：沿运动反方向拖两段半透明圆，制造"高速"错觉
            ctx.fillStyle = `rgba(${r},${g},${b},0.42)`;
            ctx.beginPath();
            ctx.arc(-st.size * 2.4, 0, st.size * 0.75, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
            ctx.beginPath();
            ctx.arc(-st.size * 4.4, 0, st.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        if (tier >= 4) {
            // 满级专属：外圈三粒环绕碎屑。相位由 pr.rot 驱动（确定性，不用 random）
            ctx.globalCompositeOperation = 'lighter';
            const ringR = st.size * 2.7;
            for (let i = 0; i < 3; i++) {
                const a = pr.rot + (i * Math.PI * 2) / 3;
                ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * ringR, Math.sin(a) * ringR, Math.max(0.8, st.size * 0.32), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        switch (st.proj) {
            case 'bullet': {
                // 带尾迹的弹头：细长胶囊 + 尾端拖影
                const len = st.size * 2.6;
                ctx.fillStyle = '#fefce8';
                ctx.beginPath();
                ctx.ellipse(0, 0, len, st.size * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
                ctx.beginPath();
                ctx.ellipse(-len * 0.8, 0, len * 0.9, st.size * 0.45, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'shard': {
                ctx.rotate(pr.rot);
                ctx.fillStyle = '#e0f2fe';
                ctx.beginPath();
                ctx.moveTo(st.size * 1.9, 0);
                ctx.lineTo(-st.size * 0.7, st.size * 0.8);
                ctx.lineTo(-st.size * 0.3, 0);
                ctx.lineTo(-st.size * 0.7, -st.size * 0.8);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
                break;
            }
            case 'glob': {
                // 晃动鼓包的脓液囊
                const wob = 1 + Math.sin(pr.seed + pr.t * 42) * 0.16;
                ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
                ctx.beginPath();
                ctx.ellipse(0, 0, st.size * wob, st.size / wob, Math.sin(pr.seed + pr.t * 30) * 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(236, 252, 203, 0.65)';
                ctx.beginPath();
                ctx.arc(-st.size * 0.3, -st.size * 0.3, st.size * 0.26, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'shell': {
                ctx.rotate(pr.rot * 1.6);
                ctx.fillStyle = '#1c1917';
                ctx.beginPath();
                ctx.ellipse(0, 0, st.size, st.size * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
                ctx.fillRect(-st.size * 0.3, -st.size * 1.1, st.size * 0.6, st.size * 0.5);
                ctx.strokeStyle = 'rgba(251,191,36,0.8)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(-st.size * 0.9, 0);
                ctx.lineTo(st.size * 0.9, 0);
                ctx.stroke();
                break;
            }
            case 'dart': {
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.moveTo(st.size * 2.2, 0);
                ctx.lineTo(-st.size, st.size * 0.6);
                ctx.lineTo(-st.size * 0.4, 0);
                ctx.lineTo(-st.size, -st.size * 0.6);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'fire': {
                const k = 1 + Math.sin(pr.seed + pr.t * 40) * 0.2;
                ctx.fillStyle = '#fed7aa';
                ctx.beginPath();
                ctx.ellipse(0, 0, st.size * 1.25 * k, st.size * 0.85 * k, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
                ctx.beginPath();
                ctx.ellipse(st.size * 0.2, 0, st.size * k, st.size * 0.7 * k, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,247,237,0.9)';
                ctx.beginPath();
                ctx.arc(st.size * 0.5, 0, st.size * 0.3, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'wisp': {
                ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
                ctx.beginPath();
                ctx.ellipse(0, 0, st.size * 1.1, st.size * 0.8, Math.sin(pr.t * 18) * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(76, 29, 149, 0.8)';
                ctx.beginPath();
                ctx.arc(st.size * 0.4, 0, st.size * 0.45, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'orb':
            default: {
                ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
                ctx.beginPath();
                ctx.arc(0, 0, st.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(-st.size * 0.3, -st.size * 0.3, st.size * 0.35, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }
        ctx.restore();
    }
    renderBeam(ctx, b) {
        const a = b.life / b.maxLife;
        const { r, g, b: bb } = hexRgb(b.color);
        ctx.strokeStyle = `rgba(${r},${g},${bb},${a})`;
        if (b.kind === 'arc') {
            // 闪电：折线 + 抖动
            const segs = 5;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(b.x1, b.y1);
            const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
            const amp = Math.min(12, 6 + len * 0.06);
            for (let i = 1; i < segs; i++) {
                const k = i / segs;
                const nx = b.x1 + (b.x2 - b.x1) * k;
                const ny = b.y1 + (b.y2 - b.y1) * k;
                const off = Math.sin(b.seed + i * 2.7) * amp * (1 - Math.abs(k - 0.5) * 1.6);
                ctx.lineTo(nx + off, ny - off);
            }
            ctx.lineTo(b.x2, b.y2);
            ctx.stroke();
            // 外发光
            ctx.globalAlpha = a * 0.35;
            ctx.lineWidth = 5;
            ctx.stroke();
        }
        else {
            ctx.lineWidth = b.kind === 'laser' ? 2.4 : 1.4;
            ctx.beginPath();
            ctx.moveTo(b.x1, b.y1);
            ctx.lineTo(b.x2, b.y2);
            ctx.stroke();
            ctx.globalAlpha = a * 0.3;
            ctx.lineWidth = 7;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    renderWave(ctx, w) {
        const k = 1 - w.life / w.maxLife;
        const r = w.r0 + (w.r1 - w.r0) * Math.min(1, k * 1.5);
        const a = 1 - k;
        const { r: rr, g, b } = hexRgb(w.color);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${rr},${g},${b},${a})`;
        ctx.lineWidth = w.width * (1 - k * 0.6);
        ctx.beginPath();
        if (w.kind === 'shatter') {
            // 碎冰环：锯齿多边形
            const pts = 9;
            for (let i = 0; i <= pts; i++) {
                const th = (i / pts) * Math.PI * 2;
                const rad = r * (i % 2 === 0 ? 1 : 0.78);
                const px = w.x + Math.cos(th) * rad;
                const py = w.y + Math.sin(th) * rad;
                if (i === 0)
                    ctx.moveTo(px, py);
                else
                    ctx.lineTo(px, py);
            }
        }
        else {
            ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
    }
    /** 世界之上的 UI 层特效（飘字等） */
    renderOverlay(ctx) {
        for (const f of this.floaters) {
            const k = f.life / f.maxLife;
            const a = k > 0.75 ? (1 - k) / 0.25 : k / 0.75;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (f.crit) {
                ctx.font = `bold ${f.size + 5}px sans-serif`;
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(f.text, f.x, f.y);
            }
            else {
                ctx.font = `bold ${f.size}px sans-serif`;
            }
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
            ctx.restore();
        }
    }
    /** 调试信息（可选） */
    stats() {
        return {
            particles: this.particles.length,
            projectiles: this.projectiles.length,
            beams: this.beams.length,
            waves: this.waves.length,
            decals: this.decals.length
        };
    }
}
//# sourceMappingURL=VfxSystem.js.map