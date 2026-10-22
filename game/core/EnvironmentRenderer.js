/**
 * 环境渲染器：分层赛博防线场景
 *
 * 《赛博防线：机械入侵》的地面。原版是「分层医院场景」（地砖 + 病床 + 输液架），
 * 现在换成赛博工业场景，但分层架构不变：
 *
 *   L0 地面基色     —— 关卡主题色系的地面渐变（俯视）
 *   L1 赛博网格     —— 40px 网格 + 每 5 格亮线 + 交点光点（PRD 硬性规范）
 *   L2 地面贴花     —— 警戒带、数据流箭头、泄漏液、烧灼痕、数据碎片
 *   L3 边缘陈设     —— 服务器机柜 / 机械茧舱 / 反应堆柱（贴屏幕边缘，不压路径）
 *   ── 以上烘焙进离屏 canvas，按关卡缓存，每帧只 blit ──
 *   L4 动态光效     —— 顶灯光池闪烁、光锥、尘埃、电火花（每帧绘制）
 *
 * 三关主题（对齐 LEVELS.accent）：
 *   外环防线   青 #00F0FF  数据中心外围：机柜阵列、全息导视、电缆桥架
 *   机械巢穴   紫 #9D00FF  地下机库：机械茧舱、悬垂电缆、机械臂残骸
 *   核心反应堆 红 #FF0033  主控中枢：反应堆柱、冷却管、监控屏
 */
import { GAME_CONSTANTS, LEVELS } from '../config/GameConfig.js';
import { CYBER, paintCyberGrid, rgba, hexRgb } from '../config/CyberTheme.js';
const W = GAME_CONSTANTS.CANVAS_WIDTH;
const H = GAME_CONSTANTS.CANVAS_HEIGHT;
// ── 确定性随机：同一关卡每次生成完全一致，便于截图比对与缓存 ──
function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    };
}
const PALETTES = {
    // 外环防线：冷青，数据中心外围 —— 机柜阵列 + 全息导视 + 电缆桥架
    outer: {
        key: 'outer',
        floorTop: '#0C1219', floorMid: '#101822', floorBot: '#090E15',
        grid: CYBER.grid, gridMajor: CYBER.gridMajor, gridNode: CYBER.gridNode,
        wallTop: '#131C27', wallBot: '#080C12',
        prop: '#1B2531', propDark: '#0D141C',
        rim: rgba(CYBER.cyan, 0.45),
        neon: CYBER.cyan,
        lamp: '#7FF6FF', pool: 'rgba(0, 240, 255,',
        haze: rgba(CYBER.cyan, 0.035),
        spill: '#1A2A33',
        motes: 'dust'
    },
    // 机械巢穴：暗紫，地下机库 —— 机械茧舱 + 悬垂电缆 + 机械臂残骸
    nest: {
        key: 'nest',
        floorTop: '#120E1E', floorMid: '#171029', floorBot: '#0C0916',
        grid: rgba(CYBER.purple, 0.055), gridMajor: rgba(CYBER.purple, 0.14), gridNode: rgba(CYBER.purple, 0.32),
        wallTop: '#1D1435', wallBot: '#0D0918',
        prop: '#241A42', propDark: '#120C24',
        rim: rgba(CYBER.purple, 0.5),
        neon: CYBER.purple,
        lamp: '#C79BFF', pool: 'rgba(157, 0, 255,',
        haze: rgba(CYBER.purple, 0.05),
        spill: '#241338',
        motes: 'spark'
    },
    // 核心反应堆：暗红，主控中枢 —— 反应堆柱 + 冷却管 + 监控屏
    reactor: {
        key: 'reactor',
        floorTop: '#1A0C10', floorMid: '#221015', floorBot: '#12070A',
        grid: rgba(CYBER.red, 0.065), gridMajor: rgba(CYBER.red, 0.16), gridNode: rgba(CYBER.red, 0.34),
        wallTop: '#2A1119', wallBot: '#14080C',
        prop: '#33161E', propDark: '#1A0A0F',
        rim: rgba(CYBER.red, 0.5),
        neon: CYBER.red,
        lamp: '#FF8095', pool: 'rgba(255, 0, 51,',
        haze: rgba(CYBER.red, 0.05),
        spill: '#2E0D14',
        motes: 'ember'
    }
};
export function paletteFor(levelKey) {
    const [baseKey, idText] = levelKey.split('@');
    const base = PALETTES[baseKey] || PALETTES.outer;
    const lv = Number(idText);
    if (!Number.isInteger(lv) || lv < 4 || !LEVELS[lv - 1])
        return base;
    const accent = LEVELS[lv - 1].accent;
    const [r, g, b] = hexRgb(accent);
    return { ...base, key: `${base.key}-${lv}`, neon: accent,
        rim: `rgba(${r}, ${g}, ${b}, 0.48)`, pool: `rgba(${r}, ${g}, ${b},`,
        haze: `rgba(${r}, ${g}, ${b}, 0.045)`, grid: `rgba(${r}, ${g}, ${b}, 0.055)`,
        gridMajor: `rgba(${r}, ${g}, ${b}, 0.14)`, gridNode: `rgba(${r}, ${g}, ${b}, 0.3)` };
}
/** 关卡 id → 主题 key（1 外环防线 / 2 机械巢穴 / 3 核心反应堆） */
export function levelKeyOf(id) {
    if (id === 2)
        return 'nest';
    if (id === 3)
        return 'reactor';
    const base = id % 3 === 0 ? 'reactor' : id % 3 === 2 ? 'nest' : 'outer';
    return id > 3 ? `${base}@${id}` : 'outer';
}
export class EnvironmentRenderer {
    constructor(canvas) {
        this.time = 0;
        /** 烘焙缓存：key = 关卡 key */
        this.floorLayer = null;
        this.propLayer = null;
        this.builtKey = '';
        this.builtAccent = '';
        this.lamps = [];
        this.motes = [];
        this.rng = makeRng(1);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }
    update(deltaTime) {
        this.time += deltaTime;
        const pal = paletteFor(this.builtKey);
        for (const m of this.motes) {
            m.x += m.vx * deltaTime;
            m.y += m.vy * deltaTime;
            m.life += deltaTime;
            if (m.life > m.max)
                this.respawnMote(m, pal);
        }
    }
    /** 关卡切换时重置缓存（GameManager 在 startLevel 里调） */
    invalidate() {
        this.builtKey = '';
        this.builtAccent = '';
        this.floorLayer = null;
        this.propLayer = null;
    }
    // ══════════════════════════════════════════════════════════
    // 主入口：背景（地面 + 陈设 + 顶棚）
    // ══════════════════════════════════════════════════════════
    renderBackdrop(levelKey, accent) {
        if (this.builtKey !== levelKey || this.builtAccent !== accent) {
            this.build(levelKey, accent);
        }
        const ctx = this.ctx;
        ctx.drawImage(this.floorLayer, 0, 0);
        ctx.drawImage(this.propLayer, 0, 0);
    }
    /**
     * 前景层：顶灯、光锥、氛围粒子。
     * 在世界层（塔/怪/特效）之后、后处理之前调用 —— 光池压在单位上才有"顶灯照下来"的感觉，
     * 但透明度必须很低，否则会糊住血条和伤害数字。
     */
    renderOverlay() {
        const ctx = this.ctx;
        const pal = paletteFor(this.builtKey);
        // 顶灯光池（带闪烁）
        for (const l of this.lamps) {
            const flick = l.flicker > 0 ? (0.75 + Math.sin(this.time * 22 + l.phase) * 0.25 * l.flicker) : 1;
            const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
            g.addColorStop(0, `${pal.pool}${(0.13 * flick).toFixed(3)})`);
            g.addColorStop(0.45, `${pal.pool}${(0.06 * flick).toFixed(3)})`);
            g.addColorStop(1, `${pal.pool}0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
            ctx.fill();
        }
        // 氛围粒子
        for (const m of this.motes) {
            const t = m.life / m.max;
            let a = 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.4));
            if (pal.motes === 'ember')
                a *= 1.6;
            if (a <= 0.01)
                continue;
            ctx.globalAlpha = Math.min(0.55, a);
            ctx.fillStyle = pal.lamp;
            if (pal.motes === 'spark') {
                // 电火花：短竖线
                ctx.fillRect(m.x, m.y, m.size * 0.5, m.size * 2.0);
            }
            else {
                ctx.beginPath();
                ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        // 核心反应堆：反应堆柱的垂直光锥
        if (pal.key === 'reactor') {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 2; i++) {
                const l = this.lamps[i * 2] || this.lamps[0];
                if (!l)
                    break;
                const breathe = 0.055 + Math.sin(this.time * 1.6 + i * 2) * 0.018;
                const g = ctx.createLinearGradient(l.x, l.y, l.x, l.y + 240);
                g.addColorStop(0, `${pal.pool}${breathe.toFixed(3)})`);
                g.addColorStop(1, `${pal.pool}0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(l.x - 26, l.y);
                ctx.lineTo(l.x + 26, l.y);
                ctx.lineTo(l.x + 92, l.y + 240);
                ctx.lineTo(l.x - 92, l.y + 240);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }
        // 主题大气雾
        ctx.fillStyle = pal.haze;
        ctx.fillRect(0, 0, W, H);
    }
    // ══════════════════════════════════════════════════════════
    // 烘焙
    // ══════════════════════════════════════════════════════════
    build(levelKey, accent) {
        const pal = paletteFor(levelKey);
        this.builtKey = levelKey;
        this.builtAccent = accent;
        this.rng = makeRng(levelKey.length * 7919 + levelKey.charCodeAt(0) * 31 + 13);
        this.floorLayer = this.offscreen();
        this.propLayer = this.offscreen();
        this.paintFloor(this.floorLayer.getContext('2d'), pal);
        this.paintProps(this.propLayer.getContext('2d'), pal, accent);
        this.layoutLamps(pal);
        this.seedMotes(pal);
    }
    offscreen() {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        return c;
    }
    // ── L0/L1/L2：地面 ───────────────────────────────────────
    paintFloor(g, pal) {
        // L0 基色
        const base = g.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, pal.floorTop);
        base.addColorStop(0.42, pal.floorMid);
        base.addColorStop(1, pal.floorBot);
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
        // L1 赛博网格（PRD：40px，每 5 格一条亮线 + 交点光点）
        paintCyberGrid(g, W, H, {
            size: CYBER.gridSize,
            major: 5,
            minorColor: pal.grid,
            majorColor: pal.gridMajor,
            nodeColor: pal.gridNode,
            nodeRadius: 1.3
        });
        // 顶棚结构带（屏幕最上沿留一条"机库顶"，暗示这是有顶的室内）
        const wall = g.createLinearGradient(0, 0, 0, 74);
        wall.addColorStop(0, pal.wallTop);
        wall.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = wall;
        g.fillRect(0, 0, W, 74);
        g.fillStyle = pal.rim;
        g.globalAlpha = 0.2;
        g.fillRect(0, 66, W, 2);
        g.globalAlpha = 1;
        // 烧灼痕 / 油污：几十处不规则暗斑
        for (let i = 0; i < 40; i++) {
            const x = this.rng() * W, y = this.rng() * H;
            const r = 8 + this.rng() * 34;
            const a = 0.035 + this.rng() * 0.06;
            const s = g.createRadialGradient(x, y, 0, x, y, r);
            s.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
            s.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = s;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
        // 数据裂纹：发光细线（比原版的纯黑裂缝更"通电"）
        for (let i = 0; i < 6; i++) {
            let x = this.rng() * W, y = this.rng() * H;
            let a = this.rng() * Math.PI * 2;
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.strokeStyle = rgba(pal.neon, 0.16);
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x, y);
            const seg = 4 + Math.floor(this.rng() * 5);
            for (let j = 0; j < seg; j++) {
                a += (this.rng() - 0.5) * 1.1;
                x += Math.cos(a) * (10 + this.rng() * 22);
                y += Math.sin(a) * (10 + this.rng() * 22);
                g.lineTo(x, y);
            }
            g.stroke();
            g.restore();
        }
        // L2 检修井盖（每关 2 个）
        for (let i = 0; i < 2; i++) {
            const dx = 70 + this.rng() * (W - 140);
            const dy = 180 + this.rng() * (H - 420);
            this.paintHatch(g, pal, dx, dy);
        }
        // L2 通道警戒带（贴两侧走）
        g.save();
        g.globalAlpha = 0.18;
        g.strokeStyle = CYBER.gold;
        g.lineWidth = 4;
        g.setLineDash([16, 12]);
        g.beginPath();
        g.moveTo(8, 120);
        g.lineTo(8, H - 120);
        g.stroke();
        g.beginPath();
        g.moveTo(W - 8, 120);
        g.lineTo(W - 8, H - 120);
        g.stroke();
        g.setLineDash([]);
        g.restore();
        // L2 数据流箭头（指向核心方向）
        g.save();
        g.globalAlpha = 0.22;
        g.fillStyle = pal.lamp;
        for (let i = 0; i < 4; i++) {
            const ax = W / 2 + (i % 2 === 0 ? -1 : 1) * 150;
            const ay = 170 + i * 150;
            this.paintArrow(g, ax, ay, Math.PI / 2, 16);
        }
        g.restore();
        // L2 泄漏液（机油 + 能量液发光边）—— 反应堆更多更艳
        const spillCount = pal.key === 'reactor' ? 14 : pal.key === 'nest' ? 9 : 6;
        for (let i = 0; i < spillCount; i++) {
            const bx = 30 + this.rng() * (W - 60);
            const by = 90 + this.rng() * (H - 200);
            this.paintSpill(g, pal, bx, by, 10 + this.rng() * 26, pal.key === 'reactor' ? 0.3 : 0.2);
        }
        // L2 数据碎片（发光薄片，替代散落病历纸）
        for (let i = 0; i < 9; i++) {
            const px = 20 + this.rng() * (W - 40);
            const py = 90 + this.rng() * (H - 180);
            const pw = 12 + this.rng() * 12, ph = 8 + this.rng() * 10;
            g.save();
            g.translate(px, py);
            g.rotate((this.rng() - 0.5) * 1.4);
            g.fillStyle = rgba(pal.neon, 0.14);
            g.fillRect(-pw / 2, -ph / 2, pw, ph);
            g.fillStyle = rgba(pal.neon, 0.30);
            g.fillRect(-pw / 2, -ph / 2, pw, 1.5);
            g.restore();
        }
    }
    /** 检修井盖（六边形，替代原排水口） */
    paintHatch(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
            const px = Math.cos(a) * 15, py = Math.sin(a) * 15;
            if (i === 0)
                g.moveTo(px, py);
            else
                g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.2;
        g.stroke();
        g.globalAlpha = 0.6;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        for (let i = -1; i <= 1; i++) {
            g.beginPath();
            g.moveTo(i * 5 - 3, -9);
            g.lineTo(i * 5 + 3, 9);
            g.stroke();
        }
        g.restore();
    }
    paintArrow(g, x, y, angle, s) {
        g.save();
        g.translate(x, y);
        g.rotate(angle);
        g.beginPath();
        g.moveTo(0, -s);
        g.lineTo(s * 0.85, s * 0.35);
        g.lineTo(0, s * 0.1);
        g.lineTo(-s * 0.85, s * 0.35);
        g.closePath();
        g.fill();
        g.restore();
    }
    /** 泄漏液：深色机油底 + 主题色反光边 */
    paintSpill(g, pal, x, y, r, alpha) {
        g.save();
        g.globalAlpha = alpha;
        const s = g.createRadialGradient(x, y, 0, x, y, r);
        s.addColorStop(0, pal.spill);
        s.addColorStop(0.6, rgba(pal.spill, 0.6));
        s.addColorStop(1, rgba(pal.spill, 0));
        g.fillStyle = s;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        // 溅射小点
        for (let i = 0; i < 5; i++) {
            const a = this.rng() * Math.PI * 2;
            const d = r * (0.7 + this.rng() * 0.8);
            g.fillStyle = rgba(pal.spill, 0.5);
            g.beginPath();
            g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 1 + this.rng() * 2.4, 0, Math.PI * 2);
            g.fill();
        }
        // 能量液的反光边（让泄漏"发光"）
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = alpha * 0.5;
        g.strokeStyle = rgba(pal.neon, 0.5);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(x, y, r * 0.72, 0, Math.PI * 2);
        g.stroke();
        g.restore();
    }
    // ── L3：边缘陈设 ─────────────────────────────────────────
    paintProps(g, pal, accent) {
        // 只在屏幕左右窄边与上下留白里摆陈设，绝不压到中间的战斗区/路径
        const leftX = 26;
        const rightX = W - 26;
        if (pal.key === 'outer') {
            // 数据中心外围：服务器机柜阵列 + 全息导视牌
            for (let i = 0; i < 4; i++)
                this.paintRack(g, pal, leftX, 150 + i * 96);
            for (let i = 0; i < 4; i++)
                this.paintRack(g, pal, rightX, 150 + i * 96);
            this.paintHoloSign(g, pal, accent, rightX - 4, 96);
            this.paintHoloSign(g, pal, accent, leftX + 4, H - 150);
        }
        else if (pal.key === 'nest') {
            // 地下机库：机械茧舱 + 悬垂电缆 + 机械臂残骸
            for (let i = 0; i < 3; i++)
                this.paintPod(g, pal, leftX, 150 + i * 150);
            for (let i = 0; i < 3; i++)
                this.paintCable(g, pal, rightX, 190 + i * 150);
            this.paintMechArm(g, pal, W - 30, 100);
        }
        else {
            // 主控中枢：反应堆柱 + 冷却管 + 监控屏
            for (let i = 0; i < 3; i++)
                this.paintReactorColumn(g, pal, leftX, 170 + i * 160);
            for (let i = 0; i < 2; i++)
                this.paintCoolantPipe(g, pal, rightX, 210 + i * 170);
            this.paintMonitor(g, pal, rightX - 2, 96);
        }
        // 屏幕上下沿的暗压边（世界边界感，避免"悬空平铺"）
        const topFade = g.createLinearGradient(0, 0, 0, 40);
        topFade.addColorStop(0, 'rgba(0,0,0,0.6)');
        topFade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = topFade;
        g.fillRect(0, 0, W, 40);
        const botFade = g.createLinearGradient(0, H - 60, 0, H);
        botFade.addColorStop(0, 'rgba(0,0,0,0)');
        botFade.addColorStop(1, 'rgba(0,0,0,0.65)');
        g.fillStyle = botFade;
        g.fillRect(0, H - 60, W, 60);
    }
    /** 服务器机柜（俯视：柜体 + 散热格栅 + 状态灯） */
    paintRack(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        this.rr(g, -13, -26 + 3, 26, 52, 4);
        g.fill();
        g.fillStyle = pal.propDark;
        this.rr(g, -13, -26, 26, 52, 4);
        g.fill();
        // 散热格栅
        g.fillStyle = pal.prop;
        for (let i = 0; i < 5; i++) {
            this.rr(g, -9, -21 + i * 9, 18, 5, 1.5);
            g.fill();
        }
        // 状态灯
        g.fillStyle = pal.neon;
        g.globalAlpha = 0.85;
        g.fillRect(-9, 18, 3, 3);
        g.fillRect(-4, 18, 3, 3);
        g.globalAlpha = 1;
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.4;
        g.lineWidth = 1;
        this.rr(g, -13, -26, 26, 52, 4);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** 机械茧舱（俯视：舱体 + 培养窗 + 顶部接口） */
    paintPod(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        this.rr(g, -16, -44 + 4, 32, 88, 14);
        g.fill();
        g.fillStyle = pal.propDark;
        this.rr(g, -16, -44, 32, 88, 14);
        g.fill();
        // 培养窗（发光）
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(pal.neon, 0.22);
        this.rr(g, -11, -38, 22, 76, 10);
        g.fill();
        g.restore();
        // 舱内机骸剪影
        g.fillStyle = rgba(pal.neon, 0.35);
        g.beginPath();
        g.arc(0, -14, 5, 0, Math.PI * 2);
        g.fill();
        g.fillRect(-4, -8, 8, 22);
        // 顶部接口
        g.fillStyle = pal.prop;
        this.rr(g, -6, -50, 12, 8, 2);
        g.fill();
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.4;
        this.rr(g, -16, -44, 32, 88, 14);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** 悬垂电缆（俯视：多股线束 + 束线夹） */
    paintCable(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(0, 26);
        g.lineTo(0, -24);
        g.stroke();
        g.beginPath();
        g.moveTo(-9, 26);
        g.lineTo(9, 26);
        g.stroke();
        g.globalAlpha = 1;
        // 线束
        g.strokeStyle = rgba(pal.neon, 0.55);
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(-3, 22);
        g.quadraticCurveTo(-7, -6, -2, -30);
        g.stroke();
        g.beginPath();
        g.moveTo(3, 22);
        g.quadraticCurveTo(7, -4, 2, -30);
        g.stroke();
        // 束线夹
        g.fillStyle = pal.prop;
        this.rr(g, -7, -34, 14, 5, 1.5);
        g.fill();
        g.restore();
    }
    /** 反应堆柱（俯视：柱体 + 中心辉光 + 冷却环） */
    paintReactorColumn(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath();
        g.ellipse(0, 4, 14, 30, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = pal.propDark;
        this.rr(g, -13, -30, 26, 60, 6);
        g.fill();
        // 中心辉光柱
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gg = g.createLinearGradient(0, -30, 0, 30);
        gg.addColorStop(0, rgba(pal.neon, 0));
        gg.addColorStop(0.5, rgba(pal.neon, 0.5));
        gg.addColorStop(1, rgba(pal.neon, 0));
        g.fillStyle = gg;
        this.rr(g, -4, -28, 8, 56, 3);
        g.fill();
        g.restore();
        // 冷却环
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(-13, -18 + i * 18);
            g.lineTo(13, -18 + i * 18);
            g.stroke();
        }
        g.globalAlpha = 1;
        this.rr(g, -13, -30, 26, 60, 6);
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.35;
        g.lineWidth = 1;
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** 冷却管（俯视：管体 + 法兰 + 液位窗） */
    paintCoolantPipe(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath();
        g.ellipse(0, 20, 9, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = pal.prop;
        this.rr(g, -8, -20, 16, 40, 7);
        g.fill();
        g.fillStyle = pal.propDark;
        this.rr(g, -4, -25, 8, 7, 2);
        g.fill();
        // 法兰
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.2;
        this.rr(g, -10, -6, 20, 4, 1);
        g.stroke();
        this.rr(g, -10, 6, 20, 4, 1);
        g.stroke();
        g.globalAlpha = 1;
        // 液位窗
        g.fillStyle = rgba(pal.neon, 0.7);
        this.rr(g, -3, -18, 6, 32, 2);
        g.fill();
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.35;
        g.lineWidth = 1;
        this.rr(g, -8, -20, 16, 40, 7);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** 全息导视牌（外环防线） */
    paintHoloSign(g, pal, accent, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        this.rr(g, -11, -18 + 3, 22, 36, 3);
        g.fill();
        g.fillStyle = pal.propDark;
        this.rr(g, -11, -18, 22, 36, 3);
        g.fill();
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(accent, 0.4);
        this.rr(g, -8, -14, 16, 5, 1);
        g.fill();
        this.rr(g, -8, -6, 16, 3, 1);
        g.fill();
        this.rr(g, -8, 0, 10, 3, 1);
        g.fill();
        g.restore();
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1;
        this.rr(g, -11, -18, 22, 36, 3);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** 机械臂残骸（机械巢穴） */
    paintMechArm(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.55;
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-10, 30);
        g.lineTo(-2, 4);
        g.lineTo(6, -14);
        g.stroke();
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(6, -14);
        g.lineTo(14, -26);
        g.stroke();
        g.globalAlpha = 1;
        // 关节
        g.fillStyle = pal.prop;
        g.beginPath();
        g.arc(-2, 4, 4, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(6, -14, 3.4, 0, Math.PI * 2);
        g.fill();
        // 断口火花
        g.fillStyle = rgba(pal.neon, 0.8);
        g.beginPath();
        g.arc(14, -26, 2.2, 0, Math.PI * 2);
        g.fill();
        g.restore();
    }
    /** 监控屏（核心反应堆）：屏 + 波形 */
    paintMonitor(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        g.fillStyle = pal.propDark;
        this.rr(g, -13, -12, 26, 24, 3);
        g.fill();
        g.fillStyle = 'rgba(4, 26, 30, 0.9)';
        this.rr(g, -10, -9, 20, 18, 2);
        g.fill();
        g.strokeStyle = pal.neon;
        g.globalAlpha = 0.85;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(-9, 1);
        g.lineTo(-4, 1);
        g.lineTo(-2, -6);
        g.lineTo(0, 6);
        g.lineTo(2, 1);
        g.lineTo(9, 1);
        g.stroke();
        g.globalAlpha = 1;
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.35;
        g.lineWidth = 1;
        this.rr(g, -13, -12, 26, 24, 3);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    // ── 顶灯布局与氛围粒子 ───────────────────────────────────
    layoutLamps(pal) {
        this.lamps = [];
        if (pal.key === 'outer') {
            // 顶棚灯阵列（3 列 × 3 行）
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 3; r++) {
                    this.lamps.push({
                        x: 80 + c * 145,
                        y: 150 + r * 200,
                        r: 108,
                        phase: this.rng() * 6.28,
                        flicker: (c === 1 && r === 1) ? 0.9 : 0.15
                    });
                }
            }
        }
        else if (pal.key === 'nest') {
            for (let r = 0; r < 4; r++) {
                this.lamps.push({
                    x: 225 + (r % 2 ? 40 : -40),
                    y: 130 + r * 165,
                    r: 96,
                    phase: this.rng() * 6.28,
                    flicker: r === 2 ? 1 : 0.25
                });
            }
        }
        else {
            // 反应堆：两盏主灯 + 一盏应急红灯
            this.lamps.push({ x: 140, y: 220, r: 150, phase: 0, flicker: 0.1 });
            this.lamps.push({ x: 310, y: 420, r: 150, phase: 2.1, flicker: 0.1 });
            this.lamps.push({ x: 225, y: 600, r: 120, phase: 4.2, flicker: 0.35 });
        }
    }
    seedMotes(pal) {
        this.motes = [];
        const n = pal.motes === 'dust' ? 26 : pal.motes === 'spark' ? 18 : 22;
        for (let i = 0; i < n; i++) {
            const m = { x: 0, y: 0, vx: 0, vy: 0, size: 1, life: this.rng() * 3, max: 3 };
            this.respawnMote(m, pal, true);
            this.motes.push(m);
        }
    }
    respawnMote(m, pal, initial = false) {
        const r = this.rng;
        if (pal.motes === 'dust') {
            m.x = r() * W;
            m.y = r() * H;
            m.vx = (r() - 0.5) * 8;
            m.vy = -4 - r() * 12;
            m.size = 0.7 + r() * 1.3;
            m.max = 3 + r() * 3;
        }
        else if (pal.motes === 'spark') {
            m.x = r() * W;
            m.y = 120 + r() * (H - 240);
            m.vx = (r() - 0.5) * 18;
            m.vy = (r() - 0.5) * 30;
            m.size = 1.0 + r() * 1.2;
            m.max = 1.2 + r() * 1.6;
        }
        else {
            m.x = r() * W;
            m.y = 120 + r() * (H - 240);
            m.vx = (r() - 0.5) * 14;
            m.vy = -18 - r() * 26;
            m.size = 0.8 + r() * 1.2;
            m.max = 2 + r() * 2.5;
        }
        m.life = initial ? r() * m.max : 0;
    }
    rr(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        g.quadraticCurveTo(x + w, y, x + w, y + r);
        g.lineTo(x + w, y + h - r);
        g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        g.lineTo(x + r, y + h);
        g.quadraticCurveTo(x, y + h, x, y + h - r);
        g.lineTo(x, y + r);
        g.quadraticCurveTo(x, y, x + r, y);
        g.closePath();
    }
}
/** 供外部（如 HUD）取主题霓虹色的便捷出口 */
export function levelNeon(levelKey) {
    return paletteFor(levelKey).neon;
}
/** 供外部把十六进制色转成 [r,g,b]（避免各处重复实现） */
export function rgbTriple(hex) {
    return hexRgb(hex);
}
//# sourceMappingURL=EnvironmentRenderer.js.map