/**
 * 赛博主题：全局配色 / UI 样式单一事实来源
 *
 * 《赛博防线：机械入侵》重构后的视觉规范集中在这里。
 * 之前配色散落在 GameManager / EnvironmentRenderer / TechnicalArtRenderer 三处，
 * 每改一次主题要翻四个文件、还容易漏 —— 现在所有新代码只准从这里取色。
 *
 * 规范（PRD）：
 *   背景 #0B0E14 · 路径 #12131C · 青 #00F0FF · 紫 #9D00FF · 黄 #FFD700 · 红 #FF0033
 *   UI 面板 = 暗色半透明 + 1px 青色描边；按钮 = 切角（右上 / 左下切掉）
 *   地面 = 40px 赛博网格
 *
 * ⚠️ 稀有度四色必须保持「灰 / 蓝(青) / 紫 / 金(黄)」的色相分离：
 *    tools/verify_hud.mjs 的 hueOk() 用「墨减纸」差分验色相方向
 *    （N 低饱和 / R 蓝通道最高 / SR 蓝最高且红次之 / SSR 红通道最高）。
 *    青色满足 R（b 远大于 r），金色满足 SSR（r 远大于 b），所以这套映射天然兼容。
 */
export const CYBER = {
    // ── 基底 ──
    bgDeep: '#05070C',
    bgBase: '#0B0E14',
    bgPath: '#12131C',
    bgPanel: '#12131C',
    bgRaised: '#171A26',
    // ── 霓虹主色（PRD 四色） ──
    cyan: '#00F0FF',
    purple: '#9D00FF',
    gold: '#FFD700',
    red: '#FF0033',
    /** 辅助：生体/纳米绿、警示橙 */
    green: '#39FF88',
    orange: '#FF8A1F',
    // ── 文本 ──
    textHi: '#E8F6FF',
    textMid: '#8FA3BF',
    textLow: '#5A6B85',
    // ── 地面网格 ──
    /** 小格线（40px） */
    grid: 'rgba(0, 240, 255, 0.055)',
    /** 大格线（每 5 小格 = 200px） */
    gridMajor: 'rgba(0, 240, 255, 0.13)',
    /** 网格交点光点 */
    gridNode: 'rgba(0, 240, 255, 0.30)',
    gridSize: 40,
    // ── 面板 ──
    panelFill: 'rgba(9, 12, 19, 0.90)',
    panelFillSoft: 'rgba(9, 12, 19, 0.72)',
    panelBorder: 'rgba(0, 240, 255, 0.45)',
    panelBorderDim: 'rgba(0, 240, 255, 0.16)',
    // ── 状态色 ──
    ok: '#4ade80',
    warn: '#FFD700',
    danger: '#FF0033',
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
//  赛博 UI 形状
// ══════════════════════════════════════════════════════════════
/**
 * 切角矩形路径：右上 / 左下切掉一个直角，这是赛博 UI 的标准按钮形状。
 * 只建路径不填充，调用方自己 fill / stroke / clip。
 */
export function cutRectPath(ctx, x, y, w, h, cut = 8) {
    const c = Math.max(0, Math.min(cut, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.closePath();
}
/** 四角都切（八边形）—— 用于「框架」类元素 */
export function octRectPath(ctx, x, y, w, h, cut = 8) {
    const c = Math.max(0, Math.min(cut, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
}
/** 切角面板：暗底 + 1px 霓虹描边（可选外发光） */
export function cutPanel(ctx, x, y, w, h, opts = {}) {
    const cut = opts.cut ?? 10;
    const fill = opts.fill ?? CYBER.panelFill;
    const border = opts.border ?? CYBER.panelBorder;
    cutRectPath(ctx, x, y, w, h, cut);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    if (opts.glow) {
        ctx.shadowColor = border;
        ctx.shadowBlur = opts.glow;
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}
/**
 * 赛博网格：40px 小格 + 每 5 格一条亮线 + 交点光点。
 * 只画网格线，底色由调用方铺好。
 */
export function paintCyberGrid(ctx, w, h, opts = {}) {
    const size = opts.size ?? CYBER.gridSize;
    const major = opts.major ?? 5;
    const minorColor = opts.minorColor ?? CYBER.grid;
    const majorColor = opts.majorColor ?? CYBER.gridMajor;
    const nodeColor = opts.nodeColor ?? CYBER.gridNode;
    const nodeRadius = opts.nodeRadius ?? 1.2;
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
    // 大格交点上的小光点 —— 让网格"通电"
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
/** 霓虹文字：先铺一层发光再写字 */
export function neonText(ctx, text, x, y, color, opts = {}) {
    ctx.save();
    ctx.font = opts.font ?? 'bold 14px sans-serif';
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = opts.baseline ?? 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = opts.blur ?? 10;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = lightenHex(color, 0.55);
    ctx.fillText(text, x, y);
    ctx.restore();
}
/** 六边形路径（塔位 / 节点用） */
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
/** 扫描线（后处理用）：每 3px 一条极淡暗线 */
export function paintScanlines(ctx, w, h, alpha = 0.055) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < h; y += 3)
        ctx.fillRect(0, y, w, 1);
    ctx.restore();
}
//# sourceMappingURL=CyberTheme.js.map