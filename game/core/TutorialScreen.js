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
/**
 * 双人合作模式教程（4 页）。
 *
 * 单独一套而不是往单人教程里塞两页，原因：
 *  - 单人 6 页已经压到 30 秒的量，再加双人内容会让新人一次性吃 10 页；
 *  - 双人玩家其实**已经会玩塔防**了（他是拉着朋友一起玩，不是第一次接触），
 *    真正需要讲清楚的只有「分工 / 金币共享 / 怪翻倍 / 强化各选一次」这四件事。
 * 所以双人教程刻意做成 4 页，只讲与单人**不一样**的地方。
 */
export const COOP_TUTORIAL_PAGES = [
    {
        tag: '01 / 分工',
        title: '两个人，一个核心',
        lead: '同屏双人：一颗核心、一张地图，两个出怪口。漏哪一路，掉的都是同一份耐久。',
        diagram: 'coop',
        bullets: [
            { head: '各有一条操作条', body: '屏幕下方上下两条：青色是 P1、粉色是 P2。谁的操作条谁点。' },
            { head: '可以同时拖塔', body: '两根手指同时按住屏幕，各拖各的塔，不会互相抢。' },
            { head: '核心是共享的', body: '没有「你的核心 / 我的核心」，任何一路漏怪都扣同一个数字。' },
        ],
    },
    {
        tag: '02 / 金币',
        title: '金币是共享的',
        lead: '不管谁打死的怪，赏金都进同一个金币池 —— 两个人都能花。',
        diagram: 'coopgold',
        bullets: [
            { head: '不用分账', body: '打死就进公共池，没有「你的钱 / 我的钱」，谁缺钱谁先花。' },
            { head: '别抢着买', body: '两个人同时点卡会一起扣钱。开局先说好谁先铺前排。' },
            { head: '击杀分开记', body: '顶栏 P1 / P2 各记各的击破数，只算荣誉，不影响分钱。' },
        ],
    },
    {
        tag: '03 / 压力',
        title: '双入口 · 怪潮翻倍',
        lead: '双人模式固定至少两个出怪口，每波小怪数量是单人的两倍。',
        diagram: 'coopwave',
        bullets: [
            { head: '两路一起出兵', body: '多入口的波次会两边同时出怪，别把塔全堆在自己那一路。' },
            { head: 'Boss 不翻倍', body: 'Boss 只有一只、血量也不翻倍，双人打反而比单人更快。' },
            { head: '开局双倍金币', body: '初始金币是单人的两倍，够两个人各铺两座塔起步。' },
        ],
    },
    {
        tag: '04 / 强化',
        title: '每人各选一次强化',
        lead: '每关通关后 P1 先选一次强化，选完自动轮到 P2 再选一次。',
        diagram: 'coopupgrade',
        bullets: [
            { head: '两次都全局生效', body: '两次强化都作用于场上所有塔，不会只给某一个人。' },
            { head: '轮流选，别抢', body: '面板会标出当前轮到谁，选完自动换人，顺序固定。' },
            { head: '为什么要两次', body: '怪翻倍了，成长也得翻倍，否则双人只会比单人更难。' },
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
    // ── 双人模式三张示意图 ──
    // 这几张刻意画成"缩小版真实 UI"而不是抽象符号：双人模式的难点不在概念，
    // 而在"屏幕上突然多出一条操作条、地图上多出一条路"，画成 UI 才能对上号。
    if (kind === 'coop') {
        // 上半：双入口 → 合流 → 单核心；下半：两条操作条
        const mapH = h - 56;
        const laneY = y + 44;
        const drawLane = (sx) => {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.20)';
            ctx.lineWidth = 16;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx, y + 14);
            ctx.lineTo(sx, laneY);
            ctx.lineTo(cx, laneY);
            ctx.lineTo(cx, y + mapH - 16);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(sx, y + 14);
            ctx.lineTo(sx, laneY);
            ctx.lineTo(cx, laneY);
            ctx.lineTo(cx, y + mapH - 16);
            ctx.stroke();
        };
        drawLane(x + 58);
        drawLane(x + w - 58);
        // 两个入口各来一只怪，说明"两边同时出"
        for (const sx of [x + 58, x + w - 58]) {
            ctx.fillStyle = CYBER.red;
            ctx.beginPath();
            ctx.arc(sx, y + 22, 3.4, 0, Math.PI * 2);
            ctx.fill();
        }
        // 共享核心（唯一一个，故意画在正中）
        const pulse = 0.6 + Math.sin(t * 3) * 0.2;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.18 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, y + mapH - 14, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CYBER.cyan;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, y + mapH - 14, 8.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = CYBER.cyan;
        ctx.beginPath();
        ctx.arc(cx, y + mapH - 14, 3.6, 0, Math.PI * 2);
        ctx.fill();
        // 两条操作条（P1 上 / P2 下），这是双人模式最需要先认出来的东西
        const bars = [
            ['P1', CYBER.cyan, y + mapH + 4],
            ['P2', '#FF4FD8', y + mapH + 26],
        ];
        for (const [label, color, by] of bars) {
            ctx.fillStyle = 'rgba(12, 18, 30, 0.95)';
            cutRectPath(ctx, x + 16, by, w - 32, 18, 6);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1;
            cutRectPath(ctx, x + 16, by, w - 32, 18, 6);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 22, by + 9);
            // 三张卡 + 一个卖出格的示意
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = 'rgba(90, 107, 133, 0.5)';
                ctx.fillRect(x + 42 + i * 26, by + 4, 22, 10);
            }
            ctx.fillStyle = 'rgba(255, 107, 138, 0.45)';
            ctx.fillRect(x + w - 60, by + 4, 34, 10);
        }
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('共享核心', cx + 58, y + mapH - 12);
    }
    if (kind === 'coopgold') {
        // 两座塔打怪，赏金都汇进中间同一个池子
        towerGlyph(ctx, x + 64, cy - 16, CYBER.cyan, 2, 0.72);
        towerGlyph(ctx, x + w - 64, cy - 16, '#FF4FD8', 2, 0.72);
        ctx.fillStyle = CYBER.cyan;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P1', x + 64, cy + 6);
        ctx.fillStyle = '#FF4FD8';
        ctx.fillText('P2', x + w - 64, cy + 6);
        // 中间的金币池
        ctx.fillStyle = 'rgba(255, 215, 0, 0.14)';
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
        ctx.lineWidth = 1.4;
        cutRectPath(ctx, cx - 74, cy + 26, 148, 30, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = CYBER.gold;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('共享金币池 +25', cx, cy + 41);
        // 两条汇聚箭头
        for (const [sx, ex] of [[x + 88, cx - 34], [x + w - 88, cx + 34]]) {
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(sx, cy + 4);
            ctx.quadraticCurveTo((sx + ex) / 2, cy + 30, ex, cy + 30);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = CYBER.gold;
            ctx.beginPath();
            ctx.moveTo(ex, cy + 30);
            ctx.lineTo(ex + (ex < cx ? -5 : 5), cy + 26);
            ctx.lineTo(ex + (ex < cx ? -5 : 5), cy + 34);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('谁打死的都算 · 不分账', cx, y + 18);
    }
    if (kind === 'coopwave') {
        // 两条路各一排波次块，末尾共用一只 Boss（不翻倍）
        const lanes = [
            ['左路', CYBER.cyan, cy - 30],
            ['右路', '#FF4FD8', cy + 6],
        ];
        const segs = 8;
        const segW = (w - 120) / segs;
        for (const [label, color, ly] of lanes) {
            ctx.fillStyle = CYBER.textLow;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 20, ly + 11);
            for (let i = 0; i < segs; i++) {
                const px = x + 58 + segW * i;
                const lit = i <= (Math.floor(t * 2) % segs);
                ctx.fillStyle = color;
                ctx.globalAlpha = lit ? 0.62 : 0.14;
                ctx.fillRect(px + 1, ly, segW - 3, 22);
            }
            ctx.globalAlpha = 1;
        }
        // 共用 Boss：只画一只，跨两行
        const bossX = x + 58 + segW * segs + 8;
        ctx.fillStyle = 'rgba(255, 0, 51, 0.8)';
        ctx.fillRect(bossX, cy - 30, 44, 58);
        ctx.fillStyle = '#FFE8EC';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOSS', bossX + 22, cy - 6);
        ctx.font = '8px sans-serif';
        ctx.fillText('只一只', bossX + 22, cy + 8);
        // ×2 徽标
        ctx.fillStyle = 'rgba(255, 215, 0, 0.16)';
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.lineWidth = 1.2;
        cutRectPath(ctx, x + 20, y + h - 26, 66, 22, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = CYBER.gold;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('小怪 ×2', x + 53, y + h - 15);
        ctx.fillStyle = CYBER.textLow;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('两个出怪口同时出兵', x + 96, y + h - 15);
    }
    if (kind === 'coopupgrade') {
        // P1 选 → P2 选，两次都作用到全场（不是各管各的塔）
        const cardW = 30, cardH = 42, gap = 6;
        const groupW = cardW * 3 + gap * 2;
        const groupY = cy - 32;
        const drawGroup = (gx, color, label, picked) => {
            for (let i = 0; i < 3; i++) {
                const px = gx + i * (cardW + gap);
                const isPicked = i === picked;
                ctx.fillStyle = isPicked ? 'rgba(30, 40, 58, 0.98)' : 'rgba(12, 18, 30, 0.92)';
                cutRectPath(ctx, px, groupY, cardW, cardH, 6);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.globalAlpha = isPicked ? 1 : 0.32;
                ctx.lineWidth = isPicked ? 1.8 : 1;
                cutRectPath(ctx, px, groupY, cardW, cardH, 6);
                ctx.stroke();
                ctx.globalAlpha = 1;
                // 卡面：一条横杠代表图标，两条短线代表文案
                ctx.fillStyle = isPicked ? color : 'rgba(90, 107, 133, 0.5)';
                ctx.fillRect(px + 9, groupY + 9, 12, 12);
                ctx.fillStyle = 'rgba(90, 107, 133, 0.45)';
                ctx.fillRect(px + 6, groupY + 27, 18, 3);
                ctx.fillRect(px + 6, groupY + 33, 12, 3);
            }
            ctx.fillStyle = color;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, gx + groupW / 2, groupY - 12);
        };
        drawGroup(x + 26, CYBER.cyan, 'P1 先选', 0);
        drawGroup(x + w - 26 - groupW, '#FF4FD8', 'P2 后选', 1);
        // 中间箭头：顺序固定，别抢
        arrow(ctx, x + 26 + groupW + 10, cy - 11, x + w - 26 - groupW - 10, CYBER.textLow);
        // 底部：两次都汇进同一个全局状态
        ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
        ctx.lineWidth = 1.3;
        cutRectPath(ctx, cx - 104, cy + 30, 208, 28, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = CYBER.cyan;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('两次都作用于全场所有塔', cx, cy + 44);
        // 两条虚线从池子指向两组卡：说明"不是各管各的"
        for (const gx of [x + 26 + groupW / 2, x + w - 26 - groupW / 2]) {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.30)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(gx, groupY + cardH + 4);
            ctx.lineTo(gx, cy + 30);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    ctx.restore();
}
/** 渲染整页教程。调用方负责先画背景（菜单或战场）。 */
export function renderTutorial(ctx, W, H, pageIndex, t, 
/** 页集合：单人 TUTORIAL_PAGES / 双人 COOP_TUTORIAL_PAGES。默认单人，保持旧调用兼容 */
pages = TUTORIAL_PAGES) {
    const page = pages[Math.max(0, Math.min(pages.length - 1, pageIndex))];
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
    const dots = pages.length;
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
    const isLast = pageIndex === pages.length - 1;
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
    // 底部提示。原文写的是"点右上角「?」"，但战场里并没有这个按钮 ——
    // 实际入口只有菜单、召唤面板底部、结算界面三处，照实写。
    ctx.fillStyle = CYBER.textLow;
    ctx.font = '10.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('随时可以从主菜单或结算界面重新打开教程', W / 2, H - 30);
}
//# sourceMappingURL=TutorialScreen.js.map