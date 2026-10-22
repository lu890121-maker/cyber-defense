/**
 * 技术美术渲染系统
 * 负责防线通道、入侵口、能量核心、塔位与后处理。
 *
 * 《赛博防线：机械入侵》视觉规范：
 *   通道  = #12131C 暗轨 + 主题霓虹护栏 + 数据流虚线 + 行进箭头
 *   入侵口= 红色六边形传送门（旋转环 + 脉冲）
 *   核心  = 青色六边形能量核（旋转环 + 内核脉冲）
 *   塔位  = 切角方形框架 + 四角指示块
 *   后处理= 暗角 + 扫描线
 */
import { CYBER, rgba, lightenHex, darkenHex, cutRectPath, hexPath, paintScanlines, neonText } from '../config/CyberTheme.js';
/** '#rrggbb' / '#rgb' → [r, g, b] */
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(full, 16);
    if (Number.isNaN(v))
        return [255, 255, 255];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** 把颜色往白色方向提亮 t（0~1），用于生成同色系的高光 */
function lighten(rgb, t) {
    return [
        Math.round(rgb[0] + (255 - rgb[0]) * t),
        Math.round(rgb[1] + (255 - rgb[1]) * t),
        Math.round(rgb[2] + (255 - rgb[2]) * t)
    ];
}
export class TechnicalArtRenderer {
    constructor(canvas) {
        this.time = 0;
        // 环境光粒子
        this.ambientParticles = [];
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.initAmbientParticles();
    }
    initAmbientParticles() {
        // 初始化环境光粒子（赛博青 / 紫）
        for (let i = 0; i < 30; i++) {
            this.ambientParticles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -Math.random() * 0.5 - 0.2,
                size: Math.random() * 2 + 1,
                alpha: Math.random() * 0.3 + 0.1,
                color: Math.random() > 0.5 ? CYBER.cyan : CYBER.purple,
                life: Math.random() * 100,
                maxLife: 100 + Math.random() * 50
            });
        }
    }
    update(deltaTime) {
        this.time += deltaTime;
        this.updateAmbientParticles(deltaTime);
    }
    updateAmbientParticles(deltaTime) {
        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.life += deltaTime * 60;
            // 生命周期循环
            if (p.life > p.maxLife || p.y < -10) {
                p.x = Math.random() * this.canvas.width;
                p.y = this.canvas.height + 10;
                p.life = 0;
            }
            // 透明度脉动
            p.alpha = (Math.sin(this.time * 2 + p.life * 0.1) * 0.5 + 0.5) * 0.3;
        }
    }
    /**
     * 渲染多层背景（已废弃，保留兼容）。
     * 现在的背景由 EnvironmentRenderer 负责，这里只在极少数兜底路径里用。
     */
    renderBackground() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const baseGradient = ctx.createLinearGradient(0, 0, 0, h);
        baseGradient.addColorStop(0, CYBER.bgDeep);
        baseGradient.addColorStop(0.5, CYBER.bgBase);
        baseGradient.addColorStop(1, CYBER.bgDeep);
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, w, h);
        const centerGlow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
        centerGlow.addColorStop(0, rgba(CYBER.cyan, 0.07));
        centerGlow.addColorStop(0.5, rgba(CYBER.purple, 0.04));
        centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = centerGlow;
        ctx.fillRect(0, 0, w, h);
        for (const p of this.ambientParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    /**
     * 绘制敌人行进通道。
     * accent 由当前关卡提供，让三张地图在通道辉光上就能一眼分辨
     * （外环防线青 / 机械巢穴紫 / 核心反应堆红）。
     */
    renderPath(pathPoints, accent = CYBER.cyan, warpSegments = []) {
        const ctx = this.ctx;
        const rgb = hexToRgb(accent);
        const rgbLight = lighten(rgb, 0.45);
        // 传送段（points[i] → points[i+1]）不铺路面：那一段空间是"没有路"的，
        // 敌人走完 points[i] 会直接出现在 points[i+1]。所以折线在这里断开，
        // 由 renderTeleporter() 在两端各画一个传送门交代去向。
        const isWarp = (segIndex) => warpSegments.includes(segIndex);
        // 路径折线 → 描边（统一入口，避免每处重复 moveTo/lineTo）
        const strokePath = (width) => {
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                if (isWarp(i - 1))
                    ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
                else
                    ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.stroke();
        };
        // ── 1. 通道阴影（深度） ──
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.translate(0, 2);
        strokePath(38);
        ctx.restore();
        // ── 2. 霓虹护栏（先画宽，再被暗轨盖住中间，只留两侧 3px 亮边） ──
        // ⚠️ 顺序很重要：如果护栏画在暗轨之后，34px 的霓虹会整条盖住 32px 的暗轨，
        //    通道就变成一条发光的色带，塔名药丸和敌人都读不清了。
        const pulseAlpha = Math.sin(this.time * 2) * 0.12 + 0.55;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${pulseAlpha.toFixed(3)})`;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 16;
        strokePath(38);
        ctx.restore();
        // ── 3. 通道主体（PRD 路径色 #12131C） ──
        const pathGradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        pathGradient.addColorStop(0, lightenHex(CYBER.bgPath, 0.10));
        pathGradient.addColorStop(0.5, CYBER.bgPath);
        pathGradient.addColorStop(1, darkenHex(CYBER.bgPath, 0.35));
        ctx.save();
        ctx.strokeStyle = pathGradient;
        strokePath(32);
        ctx.restore();
        // 两侧数据导轨：将厚重的道路读成装甲输送带，而不是一整块发光色带。
        // 直线段各自偏移，转角由圆头主轨遮住接缝，低透明度避免压过单位。
        ctx.save();
        ctx.strokeStyle = rgba(accent, 0.34);
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        for (let i = 0; i < pathPoints.length - 1; i++) {
            if (isWarp(i))
                continue;
            const a = pathPoints[i], b = pathPoints[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 1)
                continue;
            const ox = -dy / len * 13.5, oy = dx / len * 13.5;
            for (const sign of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(a.x + ox * sign, a.y + oy * sign);
                ctx.lineTo(b.x + ox * sign, b.y + oy * sign);
                ctx.stroke();
            }
        }
        ctx.restore();
        // ── 4. 通道横向接缝（原"地砖纹理"，压暗到几乎只是纹理） ──
        ctx.strokeStyle = rgba(accent, 0.10);
        ctx.lineWidth = 1;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            if (isWarp(i))
                continue;
            const start = pathPoints[i];
            const end = pathPoints[i + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 0)
                continue;
            const steps = Math.floor(dist / 20);
            for (let j = 0; j < steps; j++) {
                const t = j / steps;
                const x = start.x + dx * t;
                const y = start.y + dy * t;
                const perpX = -dy / dist * 14;
                const perpY = dx / dist * 14;
                ctx.beginPath();
                ctx.moveTo(x - perpX, y - perpY);
                ctx.lineTo(x + perpX, y + perpY);
                ctx.stroke();
            }
        }
        // ── 5. 中心数据流虚线（沿路径流动，方向 = 敌人前进方向） ──
        ctx.save();
        ctx.strokeStyle = rgba(lightenHex(accent, 0.35), 0.6);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -this.time * 46;
        ctx.beginPath();
        ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
        for (let i = 1; i < pathPoints.length; i++) {
            if (isWarp(i - 1))
                ctx.moveTo(pathPoints[i].x, pathPoints[i].y);
            else
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // ── 6. 内边缘细描边（只 1px，勾出通道轮廓，不铺满） ──
        ctx.save();
        ctx.strokeStyle = `rgba(${rgbLight[0]}, ${rgbLight[1]}, ${rgbLight[2]}, 0.16)`;
        strokePath(29);
        ctx.restore();
        // ── 7. 行进箭头（沿路径流动的 V 形，强化"敌人往这边走"） ──
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(lightenHex(accent, 0.45), 0.5);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const flow = (this.time * 70) % 60;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            if (isWarp(i))
                continue;
            const a = pathPoints[i];
            const b = pathPoints[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 0)
                continue;
            const ux = dx / dist, uy = dy / dist;
            for (let d = flow; d < dist; d += 60) {
                const x = a.x + ux * d;
                const y = a.y + uy * d;
                const px = -uy * 7, py = ux * 7;
                ctx.beginPath();
                ctx.moveTo(x - ux * 5 + px, y - uy * 5 + py);
                ctx.lineTo(x + ux * 5, y + uy * 5);
                ctx.lineTo(x - ux * 5 - px, y - uy * 5 - py);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    /**
     * 传送门：入口端与出口端各画一个。
     * 与 `renderEntry` 的红色六边形门体刻意区分 —— 传送门是双层反向旋转的圆环，
     * 中心留一个"虚空"黑孔，读作"这里没有路，是被折叠的空间"。
     */
    renderTeleporter(x, y, accent = CYBER.cyan) {
        const ctx = this.ctx;
        const rgb = hexToRgb(accent);
        const pulse = Math.sin(this.time * 4) * 0.5 + 0.5;
        ctx.save();
        ctx.translate(x, y);
        // 虚空底：挖空路面，强调这一段不存在
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(4, 6, 12, 0.92)';
        ctx.fill();
        // 外环（顺时针，三段弧）
        ctx.save();
        ctx.rotate(this.time * 1.2);
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.55 + pulse * 0.35).toFixed(3)})`;
        ctx.lineWidth = 2.6;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a0 = (i / 3) * Math.PI * 2;
            ctx.arc(0, 0, 16, a0, a0 + Math.PI * 0.44);
        }
        ctx.stroke();
        ctx.restore();
        // 内环（逆时针，四段弧，更快）
        ctx.save();
        ctx.rotate(-this.time * 2.1);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.30 + pulse * 0.30).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a0 = (i / 4) * Math.PI * 2;
            ctx.arc(0, 0, 9, a0, a0 + Math.PI * 0.28);
        }
        ctx.stroke();
        ctx.restore();
        // 中心奇点
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 7);
        grad.addColorStop(0, `rgba(255, 255, 255, ${(0.75 + pulse * 0.20).toFixed(3)})`);
        grad.addColorStop(0.45, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.85)`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    /**
     * 随机传送门节点（L6/L7/L8）
     * 带编号标签和主题色光环，与旧式定点折叠传送门视觉区分
     */
    renderPortal(x, y, label, color) {
        const ctx = this.ctx;
        const rgb = hexToRgb(color);
        const pulse = Math.sin(this.time * 4) * 0.5 + 0.5;
        ctx.save();
        ctx.translate(x, y);
        // 外环脉动光晕
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 + pulse * 8;
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.6 + pulse * 0.3).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 内环旋转
        ctx.save();
        ctx.rotate(this.time * 1.5);
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // 中心虚空
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`);
        grad.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        // 编号标签
        ctx.fillStyle = color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }
    /**
     * 迷雾禁区（L8）
     * 半透明云雾覆盖，雾内敌人无法被防御塔锁定
     */
    renderFog(x, y, w, h) {
        const ctx = this.ctx;
        const t = this.time;
        const pulse = Math.sin(t * 2) * 0.15 + 0.85;
        ctx.save();
        // 底层浓雾（高不透明度，确保明显可见）
        const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
        grad.addColorStop(0, `rgba(80, 60, 130, ${0.82 * pulse})`);
        grad.addColorStop(0.3, `rgba(60, 45, 110, ${0.75 * pulse})`);
        grad.addColorStop(0.6, `rgba(45, 35, 90, ${0.65 * pulse})`);
        grad.addColorStop(1, `rgba(30, 20, 60, ${0.4 * pulse})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
        // 扫描线效果（赛博风格）
        ctx.globalAlpha = 0.12 * pulse;
        ctx.strokeStyle = '#b090e0';
        ctx.lineWidth = 1;
        for (let sy = y; sy < y + h; sy += 5) {
            ctx.beginPath();
            ctx.moveTo(x, sy);
            ctx.lineTo(x + w, sy);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 边缘柔化（无虚线，自然过渡）
        ctx.shadowColor = '#b090e0';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(180, 150, 240, ${0.3 * pulse})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.shadowBlur = 0;
        // 飘动云团（大、多、亮）
        for (let i = 0; i < 10; i++) {
            const cx = x + (Math.sin(t * 0.2 + i * 1.1) * 0.4 + 0.5) * w;
            const cy = y + (Math.cos(t * 0.25 + i * 1.7) * 0.4 + 0.5) * h;
            const r = 30 + Math.sin(t * 0.6 + i * 2.1) * 12;
            const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            cloudGrad.addColorStop(0, `rgba(200, 180, 255, ${0.45 * pulse})`);
            cloudGrad.addColorStop(0.5, `rgba(140, 120, 200, ${0.2 * pulse})`);
            cloudGrad.addColorStop(1, 'rgba(60, 50, 100, 0)');
            ctx.fillStyle = cloudGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // 闪烁粒子
        for (let i = 0; i < 6; i++) {
            const px = x + (Math.sin(t * 0.4 + i * 3.3) * 0.35 + 0.5) * w;
            const py = y + (Math.cos(t * 0.5 + i * 2.7) * 0.35 + 0.5) * h;
            const alpha = (Math.sin(t * 2.5 + i * 4.1) * 0.5 + 0.5) * 0.8;
            ctx.fillStyle = `rgba(220, 200, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    /**
     * 入侵口标记：红色六边形传送门。
     * 机械军团的传送通道，敌人从这里涌出。
     */
    renderEntry(x, y) {
        const ctx = this.ctx;
        const pulse = Math.sin(this.time * 3) * 0.2 + 0.8;
        // 旋转外环
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.time * 0.8);
        ctx.strokeStyle = rgba(CYBER.red, pulse * 0.75);
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 6]);
        hexPath(ctx, 0, 0, 24, Math.PI / 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // 外圈脉动光环
        ctx.save();
        ctx.shadowColor = CYBER.red;
        ctx.shadowBlur = 20 * pulse;
        ctx.strokeStyle = rgba(CYBER.red, pulse * 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 22 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 六边形门体
        const entryGradient = ctx.createRadialGradient(x - 5, y - 5, 0, x, y, 20);
        entryGradient.addColorStop(0, '#FF6B85');
        entryGradient.addColorStop(0.5, CYBER.red);
        entryGradient.addColorStop(1, '#5A0011');
        ctx.fillStyle = entryGradient;
        hexPath(ctx, x, y, 18, Math.PI / 6);
        ctx.fill();
        // 内芯暗洞
        ctx.fillStyle = 'rgba(8, 0, 4, 0.85)';
        hexPath(ctx, x, y, 10, Math.PI / 6);
        ctx.fill();
        // 中心警示光点
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#FF6B85', 0.55 + pulse * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 标签 —— 入口都在画面顶端（y≈80~100）：画上方会钻进顶部 HUD（0~74）被压暗，
        // 翻到下方又会正好压在敌人行进通道上（敌人就是从门口往下走）。
        // 所以空间不足时改画在门体侧面：靠右的入口画左侧，靠左的画右侧。
        const hudBottom = 74;
        let labelX = x;
        let labelY = y - 34;
        if (labelY < hudBottom + 6) {
            const side = x > this.canvas.width / 2 ? -1 : 1;
            labelX = x + side * 46;
            labelY = y + 5;
        }
        neonText(ctx, '入侵口', labelX, labelY, CYBER.red, { blur: 8, font: 'bold 13px sans-serif' });
    }
    /**
     * 能量核心标记：青色六边形反应核。
     * 玩家必须守住的目标，漏怪就从这里扣生命。
     */
    renderCore(x, y) {
        const ctx = this.ctx;
        const pulse = Math.sin(this.time * 2) * 0.15 + 0.85;
        // 旋转能量环（两层反向）
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = rgba(CYBER.cyan, pulse * 0.6);
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.rotate(this.time * 0.5);
        hexPath(ctx, 0, 0, 27, Math.PI / 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.rotate(-this.time * 0.95);
        ctx.strokeStyle = rgba(CYBER.cyan, pulse * 0.3);
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 7]);
        hexPath(ctx, 0, 0, 32, Math.PI / 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // 外圈辉光
        ctx.save();
        ctx.shadowColor = CYBER.cyan;
        ctx.shadowBlur = 25 * pulse;
        ctx.fillStyle = rgba(CYBER.cyan, 0.55);
        hexPath(ctx, x, y, 22, Math.PI / 6);
        ctx.fill();
        ctx.restore();
        // 主体渐变
        const coreGradient = ctx.createRadialGradient(x - 6, y - 6, 0, x, y, 22);
        coreGradient.addColorStop(0, '#C9FBFF');
        coreGradient.addColorStop(0.5, CYBER.cyan);
        coreGradient.addColorStop(1, '#00525C');
        ctx.fillStyle = coreGradient;
        hexPath(ctx, x, y, 22, Math.PI / 6);
        ctx.fill();
        // 内核
        ctx.fillStyle = 'rgba(6, 22, 26, 0.9)';
        hexPath(ctx, x, y, 12, Math.PI / 6);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#C9FBFF', 0.5 + pulse * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // CPU式能量针脚与旋转内核，让目标更像需要守护的赛博主机，而非医疗十字标记。
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-this.time * 0.35);
        ctx.strokeStyle = rgba('#B8FBFF', 0.78);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const inner = i % 2 === 0 ? 15 : 18;
            const outer = 25;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
            ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
            ctx.stroke();
        }
        ctx.rotate(this.time * 0.7);
        ctx.strokeStyle = rgba('#FFD166', 0.75);
        ctx.lineWidth = 1.3;
        hexPath(ctx, 0, 0, 8, Math.PI / 6);
        ctx.stroke();
        ctx.restore();
        // 高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(x - 6, y - 6, 3.4, 0, Math.PI * 2);
        ctx.fill();
        // 标签 —— 核心靠近底部时标签会被合成区面板压住（三关的路径终点都在 y≈620~630），
        // 所以空间不够就翻到核心上方绘制。
        const mergePanelTop = this.canvas.height - 120 - 30;
        const labelY = (y + 38) > mergePanelTop - 6 ? y - 40 : y + 38;
        neonText(ctx, '主控核心', x, labelY, CYBER.cyan, { blur: 8, font: 'bold 13px sans-serif' });
    }
    /**
     * 防御塔位：切角方形框架 + 四角指示块。
     * selected = 青色霓虹高亮；occupied = 已占位的暗色底。
     */
    renderTowerSlot(x, y, occupied, selected) {
        const ctx = this.ctx;
        const size = 44;
        const half = size / 2;
        // 阴影层
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        cutRectPath(ctx, x - half, y - half + 2, size, size, 9);
        ctx.fill();
        // 主体
        let fill;
        if (selected)
            fill = rgba(CYBER.cyan, 0.20);
        else if (occupied)
            fill = 'rgba(20, 28, 40, 0.92)';
        else
            fill = 'rgba(11, 15, 23, 0.85)';
        ctx.fillStyle = fill;
        cutRectPath(ctx, x - half, y - half, size, size, 9);
        ctx.fill();
        // 内层刻线
        ctx.strokeStyle = rgba(CYBER.cyan, selected ? 0.45 : 0.13);
        ctx.lineWidth = 1;
        cutRectPath(ctx, x - half + 3.5, y - half + 3.5, size - 7, size - 7, 7);
        ctx.stroke();
        // 外框
        ctx.save();
        if (selected) {
            ctx.shadowColor = CYBER.cyan;
            ctx.shadowBlur = 14;
            ctx.strokeStyle = CYBER.cyan;
            ctx.lineWidth = 2;
        }
        else {
            ctx.strokeStyle = occupied ? rgba(CYBER.cyan, 0.30) : rgba(CYBER.cyan, 0.16);
            ctx.lineWidth = 1.5;
        }
        cutRectPath(ctx, x - half, y - half, size, size, 9);
        ctx.stroke();
        ctx.restore();
        // 四角指示块
        const cs = 5;
        ctx.fillStyle = selected ? CYBER.cyan : rgba(CYBER.cyan, occupied ? 0.5 : 0.28);
        ctx.beginPath();
        ctx.moveTo(x - half, y - half);
        ctx.lineTo(x - half + cs, y - half);
        ctx.lineTo(x - half, y - half + cs);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + half, y - half);
        ctx.lineTo(x + half - cs, y - half);
        ctx.lineTo(x + half, y - half + cs);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - half, y + half);
        ctx.lineTo(x - half + cs, y + half);
        ctx.lineTo(x - half, y + half - cs);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + half, y + half);
        ctx.lineTo(x + half - cs, y + half);
        ctx.lineTo(x + half, y + half - cs);
        ctx.closePath();
        ctx.fill();
    }
    /**
     * 后处理：暗角 + 扫描线 + 缓慢下移的 CRT 亮带。
     * 必须画在 UI 之前（见 MEMORY 渲染顺序铁律），否则会把 HUD 压暗。
     */
    renderPostProcessing() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        // 暗角
        const vignetteGradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
        vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, w, h);
        // 扫描线
        paintScanlines(ctx, w, h, 0.05);
        // 缓慢下移的 CRT 亮带（很淡，别抢戏）
        const bandY = ((this.time * 42) % (h + 160)) - 80;
        const band = ctx.createLinearGradient(0, bandY - 60, 0, bandY + 60);
        band.addColorStop(0, rgba(CYBER.cyan, 0));
        band.addColorStop(0.5, rgba(CYBER.cyan, 0.030));
        band.addColorStop(1, rgba(CYBER.cyan, 0));
        ctx.fillStyle = band;
        ctx.fillRect(0, bandY - 60, w, 120);
    }
}
//# sourceMappingURL=TechnicalArtRenderer.js.map