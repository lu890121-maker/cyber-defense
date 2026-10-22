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
import { TowerType } from '../config/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
/** 弹头外观 */
export type ProjKind = 'bullet' | 'shard' | 'orb' | 'shell' | 'dart' | 'fire' | 'wisp' | 'glob';
/** 弹头拖尾 */
export type TrailKind = 'none' | 'spark' | 'frost' | 'smoke' | 'ember' | 'goo' | 'vapor' | 'dark';
/** 撞击溅射 */
export type ImpactKind = 'ichor' | 'ice' | 'shock' | 'bio' | 'boom' | 'flame' | 'dark' | 'spark' | 'gas';
/** 枪口形式 */
export type MuzzleKind = 'flash' | 'frost' | 'spark' | 'puff' | 'boom' | 'vapor' | 'dark';
/** 一种攻击的完整视觉配方 */
export interface VfxStyle {
    proj: ProjKind;
    trail: TrailKind;
    impact: ImpactKind;
    muzzle: MuzzleKind;
    /** 弹速 px/s */
    speed: number;
    /** 弹头半径 */
    size: number;
    /** 主色 */
    color: string;
    /** 抛物线抬升高度（0=直射） */
    arc: number;
    /** 后坐力位移 */
    recoil: number;
    /** 撞击时屏幕震动 */
    shake: number;
    /**
     * 等级 1..4（可选，缺省 = 1）。由 `styleForLevel()` 派生。
     * 只影响表现层（弹道光环 / 残影 / 碎屑 / 拖尾密度），**不影响伤害与 DPS**。
     */
    tier?: number;
}
/** 11 种防御塔的攻击视觉配方（数据驱动，改外观只改表） */
export declare const TOWER_VFX: Record<TowerType, VfxStyle>;
/** 取某种塔的视觉配方；拿不到就退回机关枪（不会崩） */
export declare function styleOf(type: TowerType): VfxStyle;
/**
 * 等级对弹道的视觉增益（索引 = 等级 − 1）。**唯一事实来源** —— 想让升级"看起来更强"只改这行。
 *
 * 为什么是乘法而不是各字段单独标：塔的等级只在战斗内可见，玩家没有耐心读数值，
 * 只能靠"这一发比上一发更粗更亮更响"来建立"我升级了"的感知。四个梯度的间距
 * 必须逐档拉开（1 → 1.3 → 1.65 → 2.05），否则 Lv2 和 Lv3 在满屏乱斗里根本分不出。
 */
export declare const VFX_TIER_GROWTH: readonly [1, 1.3, 1.65, 2.05];
/** 等级越界安全地取增益倍数（超出 4 级仍按 4 级算） */
export declare function vfxTierGrowth(level: number): number;
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
export declare function styleForLevel(type: TowerType, level: number): VfxStyle;
/** 取某种塔的主色（配方色 → 配置色 兜底） */
export declare function colorOf(type: TowerType): string;
/**
 * Tower 需要的表现接口。GameManager 把 VfxSystem 适配成这个接口注入给每座塔。
 * 目的：Tower 只管"发生了什么事"，不知道谁在画、怎么画。
 */
export interface TowerVfxSink {
    fire(style: VfxStyle, sx: number, sy: number, tx: number, ty: number, power?: number, onArrive?: () => void): void;
    beam(x1: number, y1: number, x2: number, y2: number, kind: 'laser' | 'arc' | 'pierce', color: string, life?: number): void;
    shockwave(x: number, y: number, color: string, r1: number, life?: number, width?: number, kind?: 'ring' | 'shatter' | 'pulse'): void;
    impact(x: number, y: number, kind: ImpactKind, angle: number, power?: number): void;
    flash(x: number, y: number, r: number, color: string, life?: number): void;
    floater(x: number, y: number, text: string, color: string, size?: number, crit?: boolean): void;
    shake(power: number): void;
    hitStop(duration: number): void;
}
interface Beam {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    life: number;
    maxLife: number;
    color: string;
    kind: 'laser' | 'arc' | 'pierce';
    seed: number;
}
interface Shockwave {
    x: number;
    y: number;
    life: number;
    maxLife: number;
    r0: number;
    r1: number;
    color: string;
    width: number;
    kind: 'ring' | 'shatter' | 'pulse';
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
export declare class VfxSystem {
    private particles;
    private projectiles;
    private beams;
    private waves;
    private floaters;
    private decals;
    private flashes;
    /** 上一帧还活着的敌人，用于检测死亡 */
    private tracked;
    private shakePower;
    private shakeDecay;
    private shakeX;
    private shakeY;
    private hitStopTimer;
    private hitStopTotal;
    private time;
    /** 场景氛围计时（手术灯闪烁/尘埃） */
    private ambientTimer;
    clear(): void;
    private addParticle;
    private mkParticle;
    /**
     * 锥形喷射（枪口、爆炸都用它）
     * @param drag 空气阻力：越大越快停下（烟雾低、火花高）
     * @param grav 重力：正数下落（弹壳/碎屑），负数上浮（火焰/气泡）
     */
    private burst;
    /** 全向迸发 */
    private burst360;
    /** 塔开火：枪口表现 + 生成飞行弹道。返回是否成功发射。 */
    fire(style: VfxStyle, sx: number, sy: number, tx: number, ty: number, power?: number, onArrive?: () => void): void;
    /** 枪口火光 + 弹壳/碎屑 + 反向烟雾 */
    spawnMuzzle(style: VfxStyle, x: number, y: number, angle: number, power?: number): void;
    /**
     * 命中：溅血 + 元素效果 + 冲击环 + 焦痕 + 震屏。
     * @param angle 命中方向（用于把溅射扇面摆向正确一侧）
     */
    impact(x: number, y: number, kind: ImpactKind, angle: number, power?: number): void;
    /** 闪电链 / 光束 / 贯穿线 */
    beam(x1: number, y1: number, x2: number, y2: number, kind: Beam['kind'], color: string, life?: number): void;
    /** 冲击环（爆炸/护盾破碎/磁力场） */
    shockwave(x: number, y: number, color: string, r1: number, life?: number, width?: number, kind?: Shockwave['kind']): void;
    /** 全屏光源闪（大爆炸/暴击） */
    flash(x: number, y: number, r: number, color: string, life?: number): void;
    /** 飘字（伤害数字 / 治疗 / 闪避） */
    floater(x: number, y: number, text: string, color: string, size?: number, crit?: boolean): void;
    /** 震屏 */
    shake(power: number): void;
    /** 顿帧：命中瞬间的极短冻结，用来强化"打实了"的手感 */
    hitStop(duration: number): void;
    /** 是否处于顿帧中（调用方据此跳过游戏逻辑更新） */
    isFrozen(): boolean;
    /**
     * @param enemies 当前存活敌人列表，用于状态粒子与死亡检测
     * @param fast 顿帧时传 true，只推进表现层不推进逻辑
     */
    update(deltaTime: number, enemies: readonly Enemy[], fast?: boolean): void;
    /** 弹道拖尾 */
    private spawnTrail;
    /**
     * 状态粒子：燃烧 / 中毒 / 冻结 / 眩晕 在敌人身上持续冒出来的表现。
     * 这是"敌人被打中之后"的关键——玩家要能看出它正处在什么状态。
     */
    private spawnStatusParticles;
    /** 死亡检测：敌人这一帧死掉 → 爆散 */
    private trackDeaths;
    /** 死亡爆散：按体型缩放的血肉爆开 + 地面残留 */
    deathBurst(x: number, y: number, size: number, _type: unknown): void;
    /** 进入/退出镜头扰动（世界层调用，返回可直接 setTransform 的偏移） */
    getShakeOffset(): {
        x: number;
        y: number;
    };
    /** 世界空间特效：焦痕（最底）→ 弹道 → 粒子 → 光束 → 冲击环 → 闪光 */
    renderWorld(ctx: CanvasRenderingContext2D): void;
    private drawParticleShape;
    private renderProjectile;
    private renderBeam;
    private renderWave;
    /** 世界之上的 UI 层特效（飘字等） */
    renderOverlay(ctx: CanvasRenderingContext2D): void;
    /** 调试信息（可选） */
    stats(): {
        particles: number;
        projectiles: number;
        beams: number;
        waves: number;
        decals: number;
    };
}
export {};
