/**
 * 环境渲染器：Q版赛博朋克分层场景
 *
 * Q版改造方向：
 *   - 更柔和的深蓝紫渐变背景（不是纯黑）
 *   - 更圆润可爱的建筑物（圆角机柜、圆润茧舱）
 *   - 增强立体感（柔和阴影、高光、渐变）
 *   - 发光植物等可爱环境元素
 *   - 减少工业粗粝感，增加风格化
 *
 * 分层架构不变：
 *   L0 地面基色     —— 关卡主题色系的地面渐变
 *   L1 赛博网格     —— 40px 网格 + 每 5 格亮线 + 交点光点
 *   L2 地面贴花     —— 发光花纹、数据流、能量池
 *   L3 边缘陈设     —— 圆润机柜 / 可爱茧舱 / 风格化反应堆
 *   ── 以上烘焙进离屏 canvas，按关卡缓存，每帧只 blit ──
 *   L4 动态光效     —— 顶灯光池、氛围粒子（每帧绘制）
 */
import { GAME_CONSTANTS, LEVELS } from '../config/GameConfig.js';
import { CYBER, paintCyberGrid, rgba, hexRgb } from '../config/CyberTheme.js';
const W = GAME_CONSTANTS.CANVAS_WIDTH;
const H = GAME_CONSTANTS.CANVAS_HEIGHT;
// ── 确定性随机：同一关卡每次生成完全一致 ──
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
    // 外环防线：冷青 —— Q版：更柔和的蓝紫色调
    outer: {
        key: 'outer',
        floorTop: '#141833', floorMid: '#1A2040', floorBot: '#10152E',
        grid: CYBER.grid, gridMajor: CYBER.gridMajor, gridNode: CYBER.gridNode,
        wallTop: '#1E2650', wallBot: '#0E1230',
        prop: '#2A3560', propDark: '#161D40',
        propHighlight: '#3D4D80',
        rim: rgba(CYBER.cyan, 0.50),
        neon: CYBER.cyan,
        lamp: '#99FFFF', pool: 'rgba(51, 255, 255,',
        haze: rgba(CYBER.cyan, 0.04),
        spill: '#1E3045',
        motes: 'dust'
    },
    // 机械巢穴：暗紫 —— Q版：更鲜艳的紫色调
    nest: {
        key: 'nest',
        floorTop: '#1E1540', floorMid: '#241A4D', floorBot: '#150F35',
        grid: rgba(CYBER.purple, 0.05), gridMajor: rgba(CYBER.purple, 0.13), gridNode: rgba(CYBER.purple, 0.30),
        wallTop: '#2D1F5A', wallBot: '#140D38',
        prop: '#3A2870', propDark: '#1E1448',
        propHighlight: '#5040A0',
        rim: rgba(CYBER.purple, 0.55),
        neon: CYBER.purple,
        lamp: '#DD99FF', pool: 'rgba(204, 102, 255,',
        haze: rgba(CYBER.purple, 0.05),
        spill: '#2D1850',
        motes: 'spark'
    },
    // 核心反应堆：暗红 —— Q版：更明亮的红粉色调
    reactor: {
        key: 'reactor',
        floorTop: '#2A1020', floorMid: '#331528', floorBot: '#1E0A15',
        grid: rgba(CYBER.red, 0.06), gridMajor: rgba(CYBER.red, 0.15), gridNode: rgba(CYBER.red, 0.32),
        wallTop: '#3D1830', wallBot: '#1A0C18',
        prop: '#4D2040', propDark: '#281020',
        propHighlight: '#6A3058',
        rim: rgba(CYBER.red, 0.55),
        neon: CYBER.red,
        lamp: '#FF99AA', pool: 'rgba(255, 68, 102,',
        haze: rgba(CYBER.red, 0.05),
        spill: '#3A1020',
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
        rim: `rgba(${r}, ${g}, ${b}, 0.50)`, pool: `rgba(${r}, ${g}, ${b},`,
        haze: `rgba(${r}, ${g}, ${b}, 0.045)`, grid: `rgba(${r}, ${g}, ${b}, 0.05)`,
        gridMajor: `rgba(${r}, ${g}, ${b}, 0.13)`, gridNode: `rgba(${r}, ${g}, ${b}, 0.28)` };
}
/** 关卡 id → 主题 key */
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
        /** 烘焙缓存 */
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
    invalidate() {
        this.builtKey = '';
        this.builtAccent = '';
        this.floorLayer = null;
        this.propLayer = null;
    }
    // ══════════════════════════════════════════════════════════
    // 主入口：背景
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
     * 前景层：顶灯、光锥、氛围粒子
     * Q版：更柔和的光效，粒子更圆润可爱
     */
    renderOverlay() {
        const ctx = this.ctx;
        const pal = paletteFor(this.builtKey);
        // 顶灯光池（Q版：更柔和的闪烁）
        for (const l of this.lamps) {
            const flick = l.flicker > 0 ? (0.82 + Math.sin(this.time * 18 + l.phase) * 0.18 * l.flicker) : 1;
            const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
            g.addColorStop(0, `${pal.pool}${(0.11 * flick).toFixed(3)})`);
            g.addColorStop(0.45, `${pal.pool}${(0.05 * flick).toFixed(3)})`);
            g.addColorStop(1, `${pal.pool}0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
            ctx.fill();
        }
        // 氛围粒子（Q版：更圆润的粒子）
        for (const m of this.motes) {
            const t = m.life / m.max;
            let a = 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.4));
            if (pal.motes === 'ember')
                a *= 1.4;
            if (a <= 0.01)
                continue;
            ctx.globalAlpha = Math.min(0.45, a);
            ctx.fillStyle = pal.lamp;
            // Q版：所有粒子都画成圆形
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.size * 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 核心反应堆：柔和的垂直光锥
        if (pal.key === 'reactor') {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 2; i++) {
                const l = this.lamps[i * 2] || this.lamps[0];
                if (!l)
                    break;
                const breathe = 0.045 + Math.sin(this.time * 1.4 + i * 2) * 0.015;
                const g = ctx.createLinearGradient(l.x, l.y, l.x, l.y + 240);
                g.addColorStop(0, `${pal.pool}${breathe.toFixed(3)})`);
                g.addColorStop(1, `${pal.pool}0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(l.x - 22, l.y);
                ctx.lineTo(l.x + 22, l.y);
                ctx.lineTo(l.x + 80, l.y + 240);
                ctx.lineTo(l.x - 80, l.y + 240);
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
    // ── L0/L1/L2：地面（Q版：更柔和） ─────────────────────────
    paintFloor(g, pal) {
        // L0 基色（Q版：更柔和的渐变）
        const base = g.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, pal.floorTop);
        base.addColorStop(0.42, pal.floorMid);
        base.addColorStop(1, pal.floorBot);
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
        // L1 赛博网格
        paintCyberGrid(g, W, H, {
            size: CYBER.gridSize,
            major: 5,
            minorColor: pal.grid,
            majorColor: pal.gridMajor,
            nodeColor: pal.gridNode,
            nodeRadius: 1.8
        });
        // 顶棚结构带（Q版：更柔和的过渡）
        const wall = g.createLinearGradient(0, 0, 0, 74);
        wall.addColorStop(0, pal.wallTop);
        wall.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = wall;
        g.fillRect(0, 0, W, 74);
        g.fillStyle = pal.rim;
        g.globalAlpha = 0.15;
        g.fillRect(0, 66, W, 2);
        g.globalAlpha = 1;
        // Q版：柔和的发光斑块代替烧灼痕
        for (let i = 0; i < 30; i++) {
            const x = this.rng() * W, y = this.rng() * H;
            const r = 12 + this.rng() * 28;
            const a = 0.025 + this.rng() * 0.04;
            const s = g.createRadialGradient(x, y, 0, x, y, r);
            s.addColorStop(0, rgba(pal.neon, a));
            s.addColorStop(0.6, rgba(pal.neon, a * 0.4));
            s.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = s;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
        // Q版：发光裂纹（更柔和的曲线）
        for (let i = 0; i < 5; i++) {
            let x = this.rng() * W, y = this.rng() * H;
            let a = this.rng() * Math.PI * 2;
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.strokeStyle = rgba(pal.neon, 0.12);
            g.lineWidth = 1.5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(x, y);
            const seg = 3 + Math.floor(this.rng() * 4);
            for (let j = 0; j < seg; j++) {
                a += (this.rng() - 0.5) * 0.9;
                const nx = x + Math.cos(a) * (12 + this.rng() * 18);
                const ny = y + Math.sin(a) * (12 + this.rng() * 18);
                g.quadraticCurveTo((x + nx) / 2 + (this.rng() - 0.5) * 8, (y + ny) / 2 + (this.rng() - 0.5) * 8, nx, ny);
                x = nx;
                y = ny;
            }
            g.stroke();
            g.restore();
        }
        // L2 发光井盖（Q版：更圆润）
        for (let i = 0; i < 2; i++) {
            const dx = 70 + this.rng() * (W - 140);
            const dy = 180 + this.rng() * (H - 420);
            this.paintHatch(g, pal, dx, dy);
        }
        // Q版：柔和的通道边界光带（代替警戒带）
        g.save();
        g.globalAlpha = 0.12;
        g.strokeStyle = pal.neon;
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.setLineDash([20, 16]);
        g.beginPath();
        g.moveTo(10, 120);
        g.lineTo(10, H - 120);
        g.stroke();
        g.beginPath();
        g.moveTo(W - 10, 120);
        g.lineTo(W - 10, H - 120);
        g.stroke();
        g.setLineDash([]);
        g.restore();
        // L2 数据流箭头
        g.save();
        g.globalAlpha = 0.18;
        g.fillStyle = pal.lamp;
        for (let i = 0; i < 4; i++) {
            const ax = W / 2 + (i % 2 === 0 ? -1 : 1) * 150;
            const ay = 170 + i * 150;
            this.paintArrow(g, ax, ay, Math.PI / 2, 14);
        }
        g.restore();
        // Q版：能量池（代替泄漏液，更可爱）
        const poolCount = pal.key === 'reactor' ? 10 : pal.key === 'nest' ? 7 : 5;
        for (let i = 0; i < poolCount; i++) {
            const bx = 30 + this.rng() * (W - 60);
            const by = 90 + this.rng() * (H - 200);
            this.paintEnergyPool(g, pal, bx, by, 8 + this.rng() * 20);
        }
        // Q版：发光数据碎片（更圆润）
        for (let i = 0; i < 7; i++) {
            const px = 20 + this.rng() * (W - 40);
            const py = 90 + this.rng() * (H - 180);
            const pw = 10 + this.rng() * 10, ph = 8 + this.rng() * 8;
            g.save();
            g.translate(px, py);
            g.rotate((this.rng() - 0.5) * 1.0);
            // 圆角碎片
            this.rr(g, -pw / 2, -ph / 2, pw, ph, 3);
            g.fillStyle = rgba(pal.neon, 0.12);
            g.fill();
            // 顶部高光线
            this.rr(g, -pw / 2, -ph / 2, pw, 2, 1);
            g.fillStyle = rgba(pal.neon, 0.25);
            g.fill();
            g.restore();
        }
    }
    /** Q版：圆润的发光井盖 */
    paintHatch(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 柔和阴影
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.arc(0, 2, 16, 0, Math.PI * 2);
        g.fill();
        // 主体
        g.fillStyle = pal.propDark;
        g.beginPath();
        g.arc(0, 0, 15, 0, Math.PI * 2);
        g.fill();
        // 发光边缘
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(0, 0, 15, 0, Math.PI * 2);
        g.stroke();
        // 内部发光纹路
        g.globalAlpha = 0.3;
        g.strokeStyle = rgba(pal.neon, 0.4);
        g.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            g.beginPath();
            g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
            g.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
            g.stroke();
        }
        g.restore();
    }
    paintArrow(g, x, y, angle, s) {
        g.save();
        g.translate(x, y);
        g.rotate(angle);
        // Q版：更圆润的箭头
        g.beginPath();
        g.moveTo(0, -s);
        g.quadraticCurveTo(s * 0.5, -s * 0.3, s * 0.7, s * 0.2);
        g.lineTo(0, 0);
        g.lineTo(-s * 0.7, s * 0.2);
        g.quadraticCurveTo(-s * 0.5, -s * 0.3, 0, -s);
        g.closePath();
        g.fill();
        g.restore();
    }
    /** Q版：能量池（代替泄漏液，更可爱的发光效果） */
    paintEnergyPool(g, pal, x, y, r) {
        g.save();
        // 柔和外发光
        g.globalCompositeOperation = 'lighter';
        const outerGlow = g.createRadialGradient(x, y, 0, x, y, r * 1.5);
        outerGlow.addColorStop(0, rgba(pal.neon, 0.08));
        outerGlow.addColorStop(0.6, rgba(pal.neon, 0.03));
        outerGlow.addColorStop(1, rgba(pal.neon, 0));
        g.fillStyle = outerGlow;
        g.beginPath();
        g.arc(x, y, r * 1.5, 0, Math.PI * 2);
        g.fill();
        // 主体池
        const pool = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
        pool.addColorStop(0, rgba(pal.neon, 0.25));
        pool.addColorStop(0.5, rgba(pal.neon, 0.12));
        pool.addColorStop(1, rgba(pal.neon, 0));
        g.fillStyle = pool;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        // 高光点
        g.fillStyle = rgba(pal.lamp, 0.3);
        g.beginPath();
        g.arc(x - r * 0.3, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
        g.fill();
        // 溅射小圆点
        for (let i = 0; i < 4; i++) {
            const a = this.rng() * Math.PI * 2;
            const d = r * (0.8 + this.rng() * 0.6);
            const dotR = 1.5 + this.rng() * 2;
            g.fillStyle = rgba(pal.neon, 0.2);
            g.beginPath();
            g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, dotR, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();
    }
    // ── L3：边缘陈设（Q版：更圆润可爱） ────────────────────────
    paintProps(g, pal, accent) {
        const leftX = 26;
        const rightX = W - 26;
        if (pal.key === 'outer') {
            // Q版：圆润的服务器机柜
            for (let i = 0; i < 4; i++)
                this.paintRack(g, pal, leftX, 150 + i * 96);
            for (let i = 0; i < 4; i++)
                this.paintRack(g, pal, rightX, 150 + i * 96);
            this.paintHoloSign(g, pal, accent, rightX - 4, 96);
            this.paintHoloSign(g, pal, accent, leftX + 4, H - 150);
        }
        else if (pal.key === 'nest') {
            // Q版：可爱的机械茧舱
            for (let i = 0; i < 3; i++)
                this.paintPod(g, pal, leftX, 150 + i * 150);
            for (let i = 0; i < 3; i++)
                this.paintCable(g, pal, rightX, 190 + i * 150);
            this.paintMechArm(g, pal, W - 30, 100);
        }
        else {
            // Q版：风格化的反应堆柱
            for (let i = 0; i < 3; i++)
                this.paintReactorColumn(g, pal, leftX, 170 + i * 160);
            for (let i = 0; i < 2; i++)
                this.paintCoolantPipe(g, pal, rightX, 210 + i * 170);
            this.paintMonitor(g, pal, rightX - 2, 96);
        }
        // Q版：更柔和的上下压边
        const topFade = g.createLinearGradient(0, 0, 0, 40);
        topFade.addColorStop(0, 'rgba(10, 8, 24, 0.5)');
        topFade.addColorStop(1, 'rgba(10, 8, 24, 0)');
        g.fillStyle = topFade;
        g.fillRect(0, 0, W, 40);
        const botFade = g.createLinearGradient(0, H - 60, 0, H);
        botFade.addColorStop(0, 'rgba(10, 8, 24, 0)');
        botFade.addColorStop(1, 'rgba(10, 8, 24, 0.5)');
        g.fillStyle = botFade;
        g.fillRect(0, H - 60, W, 60);
    }
    /** Q版：圆润的服务器机柜（带高光和阴影） */
    paintRack(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 柔和阴影
        g.fillStyle = 'rgba(0,0,0,0.35)';
        this.rr(g, -13, -26 + 4, 26, 52, 8);
        g.fill();
        // 主体（更圆润）
        const bodyGrad = g.createLinearGradient(-13, -26, 13, 26);
        bodyGrad.addColorStop(0, pal.propHighlight);
        bodyGrad.addColorStop(0.5, pal.propDark);
        bodyGrad.addColorStop(1, pal.propDark);
        g.fillStyle = bodyGrad;
        this.rr(g, -13, -26, 26, 52, 8);
        g.fill();
        // 散热格栅（圆润）
        g.fillStyle = pal.prop;
        for (let i = 0; i < 5; i++) {
            this.rr(g, -9, -21 + i * 9, 18, 5, 2.5);
            g.fill();
        }
        // 状态灯（更亮的圆点）
        g.fillStyle = pal.neon;
        g.globalAlpha = 0.9;
        g.beginPath();
        g.arc(-7, 20, 2, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(-2, 20, 2, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        // 霓虹描边
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.2;
        this.rr(g, -13, -26, 26, 52, 8);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：可爱的机械茧舱（更圆润，带高光） */
    paintPod(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 阴影
        g.fillStyle = 'rgba(0,0,0,0.4)';
        this.rr(g, -16, -44 + 5, 32, 88, 16);
        g.fill();
        // 主体（更圆润）
        const bodyGrad = g.createLinearGradient(-16, -44, 16, 44);
        bodyGrad.addColorStop(0, pal.propHighlight);
        bodyGrad.addColorStop(0.3, pal.propDark);
        bodyGrad.addColorStop(1, pal.propDark);
        g.fillStyle = bodyGrad;
        this.rr(g, -16, -44, 32, 88, 16);
        g.fill();
        // 培养窗（柔和发光）
        g.save();
        g.globalCompositeOperation = 'lighter';
        const windowGrad = g.createLinearGradient(0, -38, 0, 38);
        windowGrad.addColorStop(0, rgba(pal.neon, 0.15));
        windowGrad.addColorStop(0.5, rgba(pal.neon, 0.25));
        windowGrad.addColorStop(1, rgba(pal.neon, 0.15));
        g.fillStyle = windowGrad;
        this.rr(g, -11, -38, 22, 76, 11);
        g.fill();
        g.restore();
        // 舱内剪影（更可爱）
        g.fillStyle = rgba(pal.neon, 0.30);
        g.beginPath();
        g.arc(0, -14, 6, 0, Math.PI * 2);
        g.fill();
        this.rr(g, -5, -7, 10, 24, 4);
        g.fill();
        // 顶部接口
        g.fillStyle = pal.prop;
        this.rr(g, -6, -50, 12, 8, 4);
        g.fill();
        // 描边
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.5;
        this.rr(g, -16, -44, 32, 88, 16);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：可爱的悬垂电缆 */
    paintCable(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 主线
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(0, 26);
        g.lineTo(0, -24);
        g.stroke();
        g.globalAlpha = 1;
        // 线束（更圆润的曲线）
        g.strokeStyle = rgba(pal.neon, 0.50);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-3, 22);
        g.bezierCurveTo(-8, 0, -6, -15, -2, -30);
        g.stroke();
        g.beginPath();
        g.moveTo(3, 22);
        g.bezierCurveTo(8, 0, 6, -15, 2, -30);
        g.stroke();
        // 束线夹（圆润）
        g.fillStyle = pal.prop;
        this.rr(g, -7, -34, 14, 6, 3);
        g.fill();
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.4;
        g.lineWidth = 1;
        this.rr(g, -7, -34, 14, 6, 3);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：风格化的反应堆柱（更圆润，带高光） */
    paintReactorColumn(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 阴影
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(0, 5, 14, 30, 0, 0, Math.PI * 2);
        g.fill();
        // 主体
        const bodyGrad = g.createLinearGradient(-13, 0, 13, 0);
        bodyGrad.addColorStop(0, pal.propDark);
        bodyGrad.addColorStop(0.4, pal.propHighlight);
        bodyGrad.addColorStop(1, pal.propDark);
        g.fillStyle = bodyGrad;
        this.rr(g, -13, -30, 26, 60, 10);
        g.fill();
        // 中心辉光柱
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gg = g.createLinearGradient(0, -30, 0, 30);
        gg.addColorStop(0, rgba(pal.neon, 0));
        gg.addColorStop(0.5, rgba(pal.neon, 0.45));
        gg.addColorStop(1, rgba(pal.neon, 0));
        g.fillStyle = gg;
        this.rr(g, -4, -28, 8, 56, 4);
        g.fill();
        g.restore();
        // 冷却环（圆润）
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.5;
        g.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(-12, -18 + i * 18);
            g.quadraticCurveTo(0, -16 + i * 18, 12, -18 + i * 18);
            g.stroke();
        }
        g.globalAlpha = 1;
        // 描边
        this.rr(g, -13, -30, 26, 60, 10);
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.4;
        g.lineWidth = 1.2;
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：圆润的冷却管 */
    paintCoolantPipe(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 阴影
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(0, 21, 9, 4, 0, 0, Math.PI * 2);
        g.fill();
        // 主体
        const bodyGrad = g.createLinearGradient(-8, 0, 8, 0);
        bodyGrad.addColorStop(0, pal.propDark);
        bodyGrad.addColorStop(0.5, pal.propHighlight);
        bodyGrad.addColorStop(1, pal.propDark);
        g.fillStyle = bodyGrad;
        this.rr(g, -8, -20, 16, 40, 8);
        g.fill();
        // 顶部
        g.fillStyle = pal.propDark;
        this.rr(g, -4, -25, 8, 7, 3);
        g.fill();
        // 法兰（圆润）
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.5;
        this.rr(g, -10, -6, 20, 4, 2);
        g.stroke();
        this.rr(g, -10, 6, 20, 4, 2);
        g.stroke();
        g.globalAlpha = 1;
        // 液位窗（柔和发光）
        const liquidGrad = g.createLinearGradient(0, -18, 0, 14);
        liquidGrad.addColorStop(0, rgba(pal.neon, 0.5));
        liquidGrad.addColorStop(0.5, rgba(pal.neon, 0.7));
        liquidGrad.addColorStop(1, rgba(pal.neon, 0.5));
        g.fillStyle = liquidGrad;
        this.rr(g, -3, -18, 6, 32, 3);
        g.fill();
        // 描边
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.35;
        g.lineWidth = 1;
        this.rr(g, -8, -20, 16, 40, 8);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：可爱的全息导视牌 */
    paintHoloSign(g, pal, accent, x, y) {
        g.save();
        g.translate(x, y);
        // 阴影
        g.fillStyle = 'rgba(0,0,0,0.3)';
        this.rr(g, -11, -18 + 3, 22, 36, 6);
        g.fill();
        // 主体
        g.fillStyle = pal.propDark;
        this.rr(g, -11, -18, 22, 36, 6);
        g.fill();
        // 全息内容（柔和发光）
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(accent, 0.35);
        this.rr(g, -8, -14, 16, 5, 2);
        g.fill();
        g.fillStyle = rgba(accent, 0.25);
        this.rr(g, -8, -6, 16, 3, 1.5);
        g.fill();
        this.rr(g, -8, 0, 10, 3, 1.5);
        g.fill();
        g.restore();
        // 描边
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.2;
        this.rr(g, -11, -18, 22, 36, 6);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    /** Q版：圆润的机械臂残骸 */
    paintMechArm(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 臂段（圆润的线条）
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.5;
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(-10, 30);
        g.quadraticCurveTo(-6, 17, -2, 4);
        g.stroke();
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-2, 4);
        g.quadraticCurveTo(2, -5, 6, -14);
        g.stroke();
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(6, -14);
        g.quadraticCurveTo(10, -20, 14, -26);
        g.stroke();
        g.globalAlpha = 1;
        // 关节（圆润的圆球）
        g.fillStyle = pal.prop;
        g.beginPath();
        g.arc(-2, 4, 5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(6, -14, 4, 0, Math.PI * 2);
        g.fill();
        // 关节高光
        g.fillStyle = pal.propHighlight;
        g.beginPath();
        g.arc(-3, 3, 2, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(5, -15, 1.5, 0, Math.PI * 2);
        g.fill();
        // 断口火花（柔和发光）
        g.save();
        g.globalCompositeOperation = 'lighter';
        const sparkGlow = g.createRadialGradient(14, -26, 0, 14, -26, 6);
        sparkGlow.addColorStop(0, rgba(pal.neon, 0.6));
        sparkGlow.addColorStop(0.5, rgba(pal.neon, 0.2));
        sparkGlow.addColorStop(1, rgba(pal.neon, 0));
        g.fillStyle = sparkGlow;
        g.beginPath();
        g.arc(14, -26, 6, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.restore();
    }
    /** Q版：可爱的监控屏 */
    paintMonitor(g, pal, x, y) {
        g.save();
        g.translate(x, y);
        // 阴影
        g.fillStyle = 'rgba(0,0,0,0.3)';
        this.rr(g, -13, -12 + 3, 26, 24, 6);
        g.fill();
        // 外框
        g.fillStyle = pal.propDark;
        this.rr(g, -13, -12, 26, 24, 6);
        g.fill();
        // 屏幕
        g.fillStyle = 'rgba(8, 30, 40, 0.85)';
        this.rr(g, -10, -9, 20, 18, 4);
        g.fill();
        // 波形（更圆润）
        g.strokeStyle = pal.neon;
        g.globalAlpha = 0.8;
        g.lineWidth = 1.5;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(-8, 1);
        g.quadraticCurveTo(-6, 1, -4, 1);
        g.lineTo(-2, -5);
        g.lineTo(0, 5);
        g.lineTo(2, 1);
        g.quadraticCurveTo(5, 1, 8, 1);
        g.stroke();
        g.globalAlpha = 1;
        // 描边
        g.strokeStyle = pal.rim;
        g.globalAlpha = 0.4;
        g.lineWidth = 1.2;
        this.rr(g, -13, -12, 26, 24, 6);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
    }
    // ── 顶灯布局与氛围粒子 ───────────────────────────────────
    layoutLamps(pal) {
        this.lamps = [];
        if (pal.key === 'outer') {
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 3; r++) {
                    this.lamps.push({
                        x: 80 + c * 145,
                        y: 150 + r * 200,
                        r: 108,
                        phase: this.rng() * 6.28,
                        flicker: (c === 1 && r === 1) ? 0.7 : 0.12
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
                    flicker: r === 2 ? 0.8 : 0.2
                });
            }
        }
        else {
            this.lamps.push({ x: 140, y: 220, r: 150, phase: 0, flicker: 0.08 });
            this.lamps.push({ x: 310, y: 420, r: 150, phase: 2.1, flicker: 0.08 });
            this.lamps.push({ x: 225, y: 600, r: 120, phase: 4.2, flicker: 0.25 });
        }
    }
    seedMotes(pal) {
        this.motes = [];
        const n = pal.motes === 'dust' ? 22 : pal.motes === 'spark' ? 15 : 18;
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
            m.vx = (r() - 0.5) * 6;
            m.vy = -3 - r() * 10;
            m.size = 0.8 + r() * 1.2;
            m.max = 3 + r() * 3;
        }
        else if (pal.motes === 'spark') {
            m.x = r() * W;
            m.y = 120 + r() * (H - 240);
            m.vx = (r() - 0.5) * 14;
            m.vy = (r() - 0.5) * 24;
            m.size = 1.0 + r() * 1.0;
            m.max = 1.2 + r() * 1.4;
        }
        else {
            m.x = r() * W;
            m.y = 120 + r() * (H - 240);
            m.vx = (r() - 0.5) * 10;
            m.vy = -14 - r() * 20;
            m.size = 0.8 + r() * 1.0;
            m.max = 2 + r() * 2;
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
/** 供外部取主题霓虹色 */
export function levelNeon(levelKey) {
    return paletteFor(levelKey).neon;
}
/** 供外部把十六进制色转成 [r,g,b] */
export function rgbTriple(hex) {
    return hexRgb(hex);
}
//# sourceMappingURL=EnvironmentRenderer.js.map