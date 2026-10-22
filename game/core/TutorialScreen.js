/**
 * 新手教程界面（纯 Canvas 绘制，不依赖任何图片资源）
 *
 * 目标：让完全没玩过塔防的玩家，在 30 秒内看懂
 * 「塔怎么来 → 怎么变强 → 技能怎么来 → 波次怎么走」这条主线。
 *
 * 设计约束：
 *  - 竖屏 450×800，正文 13px 中文约 28 字/行，必须自动折行；
 *  - 每页一个示意图 + 3~4 条要点，宁少勿多；
 *  - 配色只从 CyberTheme 取（§10 铁律），不自造颜色。
 */
import { CYBER, cutRectPath, cutPanel, neonText } from '../config/CyberTheme.js';
/** 教程页内容。改文案只改这里，渲染逻辑不用动。 */
export const TUTORIAL_PAGES = [
    {
        tag: '01 / 目标',
        title: '守住核心',
        lead: '机械军团会沿着发光通道一路冲向画面底部的核心。',
        diagram: 'core',
        bullets: [
            { head: '漏怪会掉耐久', body: '小兵漏 1 点、精英 2 点、自爆机 4 点、Boss 5 点；耐久清零就失败。' },
            { head: '塔只能放塔位', body: '通道边上有蓝圈的空位就是塔位，把塔拖上去才会开火。' },
            { head: '每关 10 波', body: '撑过第 10 波（Boss 波）就算通关，然后进入下一关。' },
        ],
    },
    {
        tag: '02 / 召唤',
        title: '塔是怎么来的',
        lead: '底部的「召唤」不是直接买塔，而是先免费抽三张卡，选中才付钱。',
        diagram: 'summon',
        bullets: [
            { head: '抽卡免费', body: '点「召唤」翻出 3 张候选卡，看中了再点它，才按品阶扣金币。' },
            { head: '品阶决定底子', body: 'N 60 / R 100 / SR 150 / SSR 200 金。品阶越高，伤害、射程、攻速越好。' },
            { head: '不满意可换卡', body: '换一批 20 金；「特级召唤」50 金入场，不出 N 卡，10 次必出 SSR。' },
        ],
    },
    {
        tag: '03 / 合成',
        title: '塔怎么变强',
        lead: '把一座塔拖到另一座塔上，只要「同类型 + 同等级」就会合成升级。',
        diagram: 'merge',
        bullets: [
            { head: '等级 +1', body: '合成后等级提升，伤害、射程、攻速一起变强，外观也会换形态。' },
            { head: '底部 6 格是待命区', body: '暂时用不上的塔先拖到合成区，方便凑出「一对」再合。' },
            { head: '不要了就卖掉', body: '把塔拖到右下角红色「卖出区」即可回收金币，腾出塔位。' },
        ],
    },
    {
        tag: '04 / 技能',
        title: '升级自动送技能',
        lead: '每升 1 级自动获得 1 个技能，系统会按三种流派轮流发给你。',
        diagram: 'skill',
        bullets: [
            { head: '最高 Lv5', body: 'Lv2 起每级 1 个技能，满级 Lv5 一共 4 个，塔身会出现光环。' },
            { head: '技能会改输出方式', body: '连锁闪电、冰冻、暴击、穿透、毒素扩散……拿到什么就围绕它打。' },
            { head: '合成不丢技能', body: '已学技能会继承到新塔上，不会因为合成而白白浪费。' },
        ],
    },
    {
        tag: '05 / 节奏',
        title: '波次与经济',
        lead: '没有时间限制，清光这一波才算过，清完自动进下一波。',
        diagram: 'wave',
        bullets: [
            { head: '每波固定 +60 金', body: '击杀敌人另有赏金，通关还有额外金币，所以别怕花钱。' },
            { head: '5 秒自动推进', body: '清场后有 5 秒空档，用来召唤、合成、调位置。' },
            { head: '通关有强化 + 带塔', body: '每关通关弹一次全局强化（三选一），并且所有塔都会跟你进下一关。' },
        ],
    },
    {
        tag: '06 / 上手',
        title: '开局三步走',
        lead: '第一次玩，照着这三步做就不会乱。',
        diagram: 'core',
        bullets: [
            { head: '① 先铺满长直道', body: '召唤 2~3 座塔放在敌人停留最久的直道上，保证有基础火力。' },
            { head: '② 优先凑对合成', body: '同类型同等级优先合，一座 Lv3 往往比三座 Lv1 更管用。' },
            { head: '③ 按技能补短板', body: '控制流（冰冻/眩晕）适合窄路拖时间，爆发流留着打 Boss。' },
        ],
    },
];
export function getTutorialLayout(_W, H) {
    const btnY = H - 96;
    return {
        prev: { x: 32, y: btnY, w: 118, h: 48 },
        next: { x: 300, y: btnY, w: 118, h: 48 },
        // ⚠️ 不能贴右边：主菜单/战场的静音按钮就在右上角（394..436 × 12..54），
        // handleClick 里静音判定跑在最前面，位置一叠就把「关闭」吃成「静音」。
        close: { x: 330, y: 20, w: 40, h: 40 },
    };
}
/** 逐字折行：中文没有空格，按测量宽度硬断 */
function wrapLines(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxW && line.length > 0) {
            lines.push(line);
            line = ch;
        }
        else {
            line = test;
        }
    }
    if (line)
        lines.push(line);
    return lines;
}
/** 极简炮塔图标：底座 + 炮管 + 等级点 */
function towerGlyph(ctx, x, y, color, level, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // 底座
    ctx.fillStyle = 'rgba(10, 16, 26, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-13, 10);
    ctx.lineTo(-9, -2);
    ctx.lineTo(9, -2);
    ctx.lineTo(13, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 炮管
    ctx.fillStyle = color;
    ctx.fillRect(-3.5, -13, 7, 12);
    // 炮口光点
    ctx.beginPath();
    ctx.arc(0, -14, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // 等级点
    for (let i = 0; i < level; i++) {
        ctx.fillStyle = CYBER.gold;
        ctx.fillRect(-9 + i * 5, 13, 3, 3);
    }
    ctx.restore();
}
function arrow(ctx, x1, y, x2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - 7, y - 4.5);
    ctx.lineTo(x2 - 7, y + 4.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}
function drawDiagram(ctx, kind, x, y, w, h, t) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    if (kind === 'core') {
        // 通道
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
        ctx.lineWidth = 22;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 46, y + 22);
        ctx.lineTo(x + 46, y + h - 46);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 46, y + 22);
        ctx.lineTo(x + 46, y + h - 46);
        ctx.stroke();
        // 核心
        const pulse = 0.6 + Math.sin(t * 3) * 0.2;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.18 * pulse})`;
        ctx.beginPath();
        ctx.arc(x + 46, y + h - 34, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CYBER.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 46, y + h - 34, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = CYBER.cyan;
        ctx.beginPath();
        ctx.arc(x + 46, y + h - 34, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // 来袭敌人
        for (let i = 0; i < 3; i++) {
            const ey = y + 34 + i * 26;
            ctx.fillStyle = i === 0 ? CYBER.red : 'rgba(255, 0, 51, 0.55)';
            ctx.beginPath();
            ctx.arc(x + 46, ey, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // 塔位 + 塔
        const slots = [[x + 118, y + 44], [x + 118, y + h - 78], [x + 200, y + h - 46]];
        slots.forEach(([sx, sy], i) => {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, 15, 0, Math.PI * 2);
            ctx.stroke();
            towerGlyph(ctx, sx, sy + 2, i === 2 ? CYBER.purple : CYBER.cyan, 2, 0.62);
        });
        // 射程弧
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(x + 118, y + 44, 52, 0.2, Math.PI * 0.8);
        ctx.stroke();
        ctx.setLineDash([]);
        // 说明
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('敌人沿通道推进 →', x + 232, y + 30);
        ctx.fillText('↓ 核心', x + 232, y + h - 30);
    }
    if (kind === 'summon') {
        const cards = [
            ['N', '60', CYBER.textMid],
            ['R', '100', CYBER.cyan],
            ['SR', '150', CYBER.purple],
            ['SSR', '200', CYBER.gold],
        ];
        const cw = 74, gap = 12;
        const totalW = cards.length * cw + (cards.length - 1) * gap;
        let px = cx - totalW / 2;
        cards.forEach(([label, price, color], i) => {
            const lift = i === 3 ? Math.sin(t * 2.4) * 3 : 0;
            ctx.fillStyle = 'rgba(12, 18, 30, 0.92)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            cutRectPath(ctx, px, cy - 44 + lift, cw, 76, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = 'bold 17px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, px + cw / 2, cy - 22 + lift);
            towerGlyph(ctx, px + cw / 2, cy + 4 + lift, color, 1, 0.62);
            ctx.fillStyle = CYBER.textMid;
            ctx.font = '11px sans-serif';
            ctx.fillText(`${price} 金`, px + cw / 2, cy + 26 + lift);
            px += cw + gap;
        });
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('抽卡免费 · 选中才扣费', cx, y + h - 14);
    }
    if (kind === 'merge') {
        towerGlyph(ctx, cx - 104, cy, CYBER.cyan, 1, 0.95);
        towerGlyph(ctx, cx - 104, cy + 34, CYBER.cyan, 1, 0.95);
        ctx.fillStyle = CYBER.textMid;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', cx - 66, cy + 16);
        arrow(ctx, cx - 40, cy + 16, cx + 4, CYBER.cyan);
        const pulse = 0.7 + Math.sin(t * 3) * 0.3;
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx + 62, cy + 14, 34, 0, Math.PI * 2);
        ctx.stroke();
        towerGlyph(ctx, cx + 62, cy + 12, CYBER.gold, 2, 1.25);
        ctx.fillStyle = CYBER.gold;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('Lv2', cx + 62, cy + 54);
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('同类型', cx - 150, y + h - 22);
        ctx.fillStyle = CYBER.cyan;
        ctx.fillText('+ 同等级', cx - 150, y + h - 8);
    }
    if (kind === 'skill') {
        const cols = 5;
        const colW = (w - 60) / cols;
        for (let i = 0; i < cols; i++) {
            const lv = i + 1;
            const px = x + 30 + colW * i + colW / 2;
            const active = lv >= 2;
            const color = lv === 5 ? CYBER.gold : active ? CYBER.cyan : CYBER.textLow;
            towerGlyph(ctx, px, cy - 10, color, Math.min(lv, 4), 0.58 + i * 0.05);
            // 技能点
            const pips = lv - 1;
            for (let k = 0; k < 4; k++) {
                const filled = k < pips;
                ctx.fillStyle = filled ? (lv === 5 ? CYBER.gold : CYBER.purple) : 'rgba(90, 107, 133, 0.35)';
                ctx.beginPath();
                ctx.arc(px - 10.5 + k * 7, cy + 26, 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = lv === 5 ? CYBER.gold : CYBER.textMid;
            ctx.font = lv === 5 ? 'bold 12px sans-serif' : '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lv === 5 ? 'Lv5 满级' : `Lv${lv}`, px, cy + 42);
        }
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('每个圆点 = 1 个已学技能', cx, y + h - 12);
    }
    if (kind === 'wave') {
        const segs = 10;
        const segW = (w - 60) / segs;
        for (let i = 0; i < segs; i++) {
            const isBoss = i === segs - 1;
            const px = x + 30 + segW * i;
            const lit = i <= (Math.floor(t * 1.6) % segs);
            ctx.fillStyle = isBoss
                ? `rgba(255, 0, 51, ${lit ? 0.85 : 0.35})`
                : `rgba(0, 240, 255, ${lit ? 0.7 : 0.18})`;
            ctx.fillRect(px + 1, cy - 22, segW - 3, 30);
            if (isBoss) {
                ctx.fillStyle = '#FFE8EC';
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('BOSS', px + segW / 2, cy - 7);
            }
        }
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('第 1 波', x + 30, cy + 24);
        ctx.textAlign = 'right';
        ctx.fillText('第 10 波', x + w - 30, cy + 24);
        // 金币 chip
        ctx.fillStyle = 'rgba(255, 215, 0, 0.14)';
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.lineWidth = 1;
        cutRectPath(ctx, cx - 62, y + h - 34, 124, 24, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = CYBER.gold;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('每波结算 +60 金', cx, y + h - 21);
    }
    ctx.restore();
}
/** 渲染整页教程。调用方负责先画背景（菜单或战场）。 */
export function renderTutorial(ctx, W, H, pageIndex, t) {
    const page = TUTORIAL_PAGES[Math.max(0, Math.min(TUTORIAL_PAGES.length - 1, pageIndex))];
    const layout = getTutorialLayout(W, H);
    // 遮罩
    ctx.fillStyle = 'rgba(3, 6, 12, 0.94)';
    ctx.fillRect(0, 0, W, H);
    // 顶部扫描线氛围
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = CYBER.cyan;
    ctx.lineWidth = 1;
    const scanY = ((t * 60) % (H + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(W, scanY);
    ctx.stroke();
    ctx.restore();
    // 主面板
    const panelX = 24, panelY = 76, panelW = W - 48, panelH = H - 200;
    cutPanel(ctx, panelX, panelY, panelW, panelH, { fill: 'rgba(9, 14, 24, 0.96)', border: CYBER.panelBorder, cut: 14 });
    // 顶部主题色条
    ctx.fillStyle = CYBER.cyan;
    ctx.fillRect(panelX + 14, panelY + 14, 3, 16);
    // 章节号
    ctx.fillStyle = CYBER.textLow;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(page.tag, panelX + 26, panelY + 22);
    // 标题
    neonText(ctx, page.title, panelX + 24, panelY + 58, CYBER.cyan, { blur: 12, font: 'bold 24px sans-serif', align: 'left' });
    // 导语（折行）
    ctx.font = '13px sans-serif';
    ctx.fillStyle = CYBER.textMid;
    let textY = panelY + 88;
    for (const line of wrapLines(ctx, page.lead, panelW - 48)) {
        ctx.fillText(line, panelX + 24, textY);
        textY += 19;
    }
    // 示意图
    const diaX = panelX + 18, diaW = panelW - 36;
    const diaY = textY + 12, diaH = 148;
    ctx.fillStyle = 'rgba(6, 11, 20, 0.9)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
    ctx.lineWidth = 1;
    cutRectPath(ctx, diaX, diaY, diaW, diaH, 10);
    ctx.fill();
    ctx.stroke();
    drawDiagram(ctx, page.diagram, diaX, diaY, diaW, diaH, t);
    // 要点
    let by = diaY + diaH + 26;
    for (const bullet of page.bullets) {
        ctx.fillStyle = CYBER.cyan;
        ctx.beginPath();
        ctx.arc(panelX + 30, by - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CYBER.textHi;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(bullet.head, panelX + 42, by - 4);
        ctx.font = '12.5px sans-serif';
        ctx.fillStyle = CYBER.textMid;
        let lineY = by + 18;
        for (const line of wrapLines(ctx, bullet.body, panelW - 76)) {
            ctx.fillText(line, panelX + 42, lineY);
            lineY += 18;
        }
        by = lineY + 24;
    }
    // 进度点
    const dots = TUTORIAL_PAGES.length;
    const dotGap = 16;
    const dotsW = (dots - 1) * dotGap;
    for (let i = 0; i < dots; i++) {
        const dx = W / 2 - dotsW / 2 + i * dotGap;
        const active = i === pageIndex;
        ctx.beginPath();
        ctx.arc(dx, H - 118, active ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = active ? CYBER.cyan : 'rgba(90, 107, 133, 0.55)';
        ctx.fill();
    }
    // 上/下一页按钮
    const isFirst = pageIndex === 0;
    const isLast = pageIndex === TUTORIAL_PAGES.length - 1;
    const drawBtn = (r, label, color, dim) => {
        ctx.save();
        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
        cutRectPath(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        cutRectPath(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
        ctx.restore();
    };
    drawBtn(layout.prev, '‹ 上一页', CYBER.textMid, isFirst);
    drawBtn(layout.next, isLast ? '返回 ›' : '下一页 ›', isLast ? CYBER.gold : CYBER.cyan, false);
    // 关闭按钮
    ctx.save();
    ctx.strokeStyle = 'rgba(143, 163, 191, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(layout.close.x + 20, layout.close.y + 20, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = CYBER.textHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(layout.close.x + 14, layout.close.y + 14);
    ctx.lineTo(layout.close.x + 26, layout.close.y + 26);
    ctx.moveTo(layout.close.x + 26, layout.close.y + 14);
    ctx.lineTo(layout.close.x + 14, layout.close.y + 26);
    ctx.stroke();
    ctx.restore();
    // 底部提示
    ctx.fillStyle = CYBER.textLow;
    ctx.font = '10.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('游戏内随时可以点右上角「?」重新查看本教程', W / 2, H - 30);
}
//# sourceMappingURL=TutorialScreen.js.map