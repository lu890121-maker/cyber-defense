/**
 * Q版赛博主题：全局配色 / UI 样式单一事实来源
 *
 * 《赛博防线：机械入侵》Q版改造后的视觉规范集中在这里。
 * 改造方向：更可爱、更鲜艳、更立体，减少工业粗粝感。
 *
 * 规范（Q版赛博朋克）：
 *   背景 深蓝紫渐变（不是纯黑）· 路径 柔和暗紫 · 青 #33FFFF · 紫 #CC66FF · 黄 #FFE44D · 红 #FF4466
 *   粉彩辅助色：#FFB3D9（粉）· #B3E6FF（淡蓝）· #C9FFB3（淡绿）
 *   UI 面板 = 暗色半透明 + 圆角描边；按钮 = 圆角矩形（代替切角）
 *   地面 = 40px 赛博网格（更柔和）
 *
 * ⚠️ 稀有度四色必须保持「灰 / 蓝(青) / 紫 / 金(黄)」的色相分离。
 */
export const CYBER = {
    // ── 基底（Q版：更柔和的深蓝紫，不再是纯黑）──
    bgDeep: '#0A0818',
    bgBase: '#12102A',
    bgPath: '#1A1535',
    bgPanel: '#1A1535',
    bgRaised: '#221D42',
    // ── 霓虹主色（Q版：更鲜艳饱和）──
    cyan: '#33FFFF',
    purple: '#CC66FF',
    gold: '#FFE44D',
    red: '#FF4466',
    /** 辅助：生体/纳米绿、警示橙 */
    green: '#66FFAA',
    orange: '#FFAA44',
    // ── 粉彩辅助色（Q版新增）──
    pink: '#FFB3D9',
    skyBlue: '#B3E6FF',
    mintGreen: '#C9FFB3',
    lavender: '#D9B3FF',
    // ── 文本（Q版：更明亮清晰）──
    textHi: '#F0F8FF',
    textMid: '#A8BDD9',
    textLow: '#6B7FA0',
    // ── 地面网格（Q版：更柔和的网格线）──
    /** 小格线（40px） */
    grid: 'rgba(51, 255, 255, 0.045)',
    /** 大格线（每 5 小格 = 200px） */
    gridMajor: 'rgba(51, 255, 255, 0.11)',
    /** 网格交点光点（更大更圆） */
    gridNode: 'rgba(51, 255, 255, 0.28)',
    gridSize: 40,
    // ── 面板（Q版：圆角 + 柔和阴影）──
    panelFill: 'rgba(18, 16, 42, 0.92)',
    panelFillSoft: 'rgba(18, 16, 42, 0.75)',
    panelBorder: 'rgba(51, 255, 255, 0.50)',
    panelBorderDim: 'rgba(51, 255, 255, 0.18)',
    // ── 状态色 ──
    ok: '#66FFAA',
    warn: '#FFE44D',
    danger: '#FF4466',
    // ── Q版 UI 圆角参数 ──
    /** 默认按钮圆角 */
    buttonRadius: 14,
    /** 面板圆角 */
    panelRadius: 16,
    /** 小元素圆角 */
    smallRadius: 8,
};
// ══════════════════════════════════════════════════════════════
//  颜色工具
// ══════════════════════════════════════════════════════════════
/** '#rrggbb' / '#rgb' → [r, g, b]；非法输入回退白色 */
export function hexRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(full, 16);
    if (Number.isNaN(v))
        return [255, 255, 255];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** 十六进制 → rgba() 字符串 */
export function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** 线性混合两色，t=0 → a，t=1 → b */
export function mixHex(a, b, t) {
    const A = hexRgb(a), B = hexRgb(b);
    const k = Math.max(0, Math.min(1, t));
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * k));
    return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
/** 往白色方向提亮 */
export function lightenHex(hex, t) {
    return mixHex(hex, '#ffffff', t);
}
/** 往黑色方向压暗 */
export function darkenHex(hex, t) {
    return mixHex(hex, '#000000', t);
}
// ══════════════════════════════════════════════════════════════
//  Q版 UI 形状（圆润代替切角）
// ══════════════════════════════════════════════════════════════
/**
 * 圆角矩形路径：Q版标准按钮形状，替代原来的切角矩形。
 * 只建路径不填充，调用方自己 fill / stroke / clip。
 */
export function cutRectPath(ctx, x, y, w, h, cut = 14) {
    const r = Math.max(0, Math.min(cut, Math.min(w, h) / 2));
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
/** 圆角矩形面板 —— 用于「框架」类元素（Q版：全圆角代替八边形） */
export function octRectPath(ctx, x, y, w, h, cut = 14) {
    // Q版：与 cutRectPath 相同，都是圆角矩形
    cutRectPath(ctx, x, y, w, h, cut);
}
/** 圆角面板：暗底 + 圆角描边 + 柔和外发光（Q版） */
export function cutPanel(ctx, x, y, w, h, opts = {}) {
    const radius = opts.cut ?? CYBER.panelRadius;
    const fill = opts.fill ?? CYBER.panelFill;
    const border = opts.border ?? CYBER.panelBorder;
    // Q版：柔和阴影
    ctx.save();
    if (opts.glow) {
        ctx.shadowColor = border;
        ctx.shadowBlur = opts.glow;
        ctx.shadowOffsetY = 3;
    }
    cutRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
    // 描边
    ctx.save();
    if (opts.glow) {
        ctx.shadowColor = border;
        ctx.shadowBlur = opts.glow;
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    cutRectPath(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
}
/**
 * Q版赛博网格：40px 小格 + 每 5 格一条亮线 + 交点光点（更圆润）。
 * 只画网格线，底色由调用方铺好。
 */
export function paintCyberGrid(ctx, w, h, opts = {}) {
    const size = opts.size ?? CYBER.gridSize;
    const major = opts.major ?? 5;
    const minorColor = opts.minorColor ?? CYBER.grid;
    const majorColor = opts.majorColor ?? CYBER.gridMajor;
    const nodeColor = opts.nodeColor ?? CYBER.gridNode;
    const nodeRadius = opts.nodeRadius ?? 1.8;
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0, x = 0; x <= w; i++, x += size) {
        ctx.strokeStyle = i % major === 0 ? majorColor : minorColor;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
        ctx.stroke();
    }
    for (let i = 0, y = 0; y <= h; i++, y += size) {
        ctx.strokeStyle = i % major === 0 ? majorColor : minorColor;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
        ctx.stroke();
    }
    // 大格交点上的小光点 —— Q版：更大更圆润的发光点
    ctx.fillStyle = nodeColor;
    for (let x = 0; x <= w; x += size * major) {
        for (let y = 0; y <= h; y += size * major) {
            ctx.beginPath();
            ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}
/** 霓虹文字：先铺一层发光再写字（Q版：更柔和的发光） */
export function neonText(ctx, text, x, y, color, opts = {}) {
    ctx.save();
    ctx.font = opts.font ?? 'bold 14px sans-serif';
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = opts.baseline ?? 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = opts.blur ?? 8;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = lightenHex(color, 0.45);
    ctx.fillText(text, x, y);
    ctx.restore();
}
/** 六边形路径（塔位 / 节点用）—— Q版：更圆润的六角 */
export function hexPath(ctx, cx, cy, r, rot = Math.PI / 6) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    }
    ctx.closePath();
}
/** 扫描线（后处理用）：Q版更轻柔，每 4px 一条极淡线 */
export function paintScanlines(ctx, w, h, alpha = 0.03) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < h; y += 4)
        ctx.fillRect(0, y, w, 1);
    ctx.restore();
}
//# sourceMappingURL=CyberTheme.js.map