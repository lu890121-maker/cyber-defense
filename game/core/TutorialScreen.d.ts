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
export interface TutorialBullet {
    /** 小标题，如「同类型 + 同等级」 */
    head: string;
    /** 说明文字，自动折行 */
    body: string;
}
export type TutorialDiagram = 'core' | 'summon' | 'merge' | 'skill' | 'wave' | 'coop' | 'coopgold' | 'coopwave' | 'coopupgrade';
export interface TutorialPage {
    /** 左上角章节号 */
    tag: string;
    title: string;
    lead: string;
    bullets: TutorialBullet[];
    diagram: TutorialDiagram;
}
/** 教程页内容。改文案只改这里，渲染逻辑不用动。 */
export declare const TUTORIAL_PAGES: TutorialPage[];
/**
 * 双人合作模式教程（4 页）。
 *
 * 单独一套而不是往单人教程里塞两页，原因：
 *  - 单人 6 页已经压到 30 秒的量，再加双人内容会让新人一次性吃 10 页；
 *  - 双人玩家其实**已经会玩塔防**了（他是拉着朋友一起玩，不是第一次接触），
 *    真正需要讲清楚的只有「分工 / 金币共享 / 怪翻倍 / 强化各选一次」这四件事。
 * 所以双人教程刻意做成 4 页，只讲与单人**不一样**的地方。
 */
export declare const COOP_TUTORIAL_PAGES: TutorialPage[];
/** 教程页按钮位置（点击判定与渲染共用一份，避免画的和点的错位） */
export interface TutorialLayout {
    prev: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    next: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    close: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
export declare function getTutorialLayout(_W: number, H: number): TutorialLayout;
/** 渲染整页教程。调用方负责先画背景（菜单或战场）。 */
export declare function renderTutorial(ctx: CanvasRenderingContext2D, W: number, H: number, pageIndex: number, t: number, 
/** 页集合：单人 TUTORIAL_PAGES / 双人 COOP_TUTORIAL_PAGES。默认单人，保持旧调用兼容 */
pages?: TutorialPage[]): void;
