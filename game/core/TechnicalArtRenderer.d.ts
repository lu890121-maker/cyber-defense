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
export declare class TechnicalArtRenderer {
    private time;
    private canvas;
    private ctx;
    private ambientParticles;
    constructor(canvas: HTMLCanvasElement);
    private initAmbientParticles;
    update(deltaTime: number): void;
    private updateAmbientParticles;
    /**
     * 渲染多层背景（已废弃，保留兼容）。
     * 现在的背景由 EnvironmentRenderer 负责，这里只在极少数兜底路径里用。
     */
    renderBackground(): void;
    /**
     * 绘制敌人行进通道。
     * accent 由当前关卡提供，让三张地图在通道辉光上就能一眼分辨
     * （外环防线青 / 机械巢穴紫 / 核心反应堆红）。
     */
    renderPath(pathPoints: Array<{
        x: number;
        y: number;
    }>, accent?: string, warpSegments?: number[]): void;
    /**
     * 传送门：入口端与出口端各画一个。
     * 与 `renderEntry` 的红色六边形门体刻意区分 —— 传送门是双层反向旋转的圆环，
     * 中心留一个"虚空"黑孔，读作"这里没有路，是被折叠的空间"。
     */
    renderTeleporter(x: number, y: number, accent?: string): void;
    /**
     * 随机传送门节点（L6/L7/L8）
     * 带编号标签和主题色光环，与旧式定点折叠传送门视觉区分
     */
    renderPortal(x: number, y: number, label: string, color: string): void;
    /**
     * 迷雾禁区（L8）
     * 半透明云雾覆盖，雾内敌人无法被防御塔锁定
     */
    renderFog(x: number, y: number, w: number, h: number): void;
    /**
     * 入侵口标记：红色六边形传送门。
     * 机械军团的传送通道，敌人从这里涌出。
     */
    renderEntry(x: number, y: number): void;
    /**
     * 能量核心标记：青色六边形反应核。
     * 玩家必须守住的目标，漏怪就从这里扣生命。
     */
    renderCore(x: number, y: number): void;
    /**
     * 防御塔位：切角方形框架 + 四角指示块。
     * selected = 青色霓虹高亮；occupied = 已占位的暗色底。
     */
    renderTowerSlot(x: number, y: number, occupied: boolean, selected: boolean): void;
    /**
     * 后处理：暗角 + 扫描线 + 缓慢下移的 CRT 亮带。
     * 必须画在 UI 之前（见 MEMORY 渲染顺序铁律），否则会把 HUD 压暗。
     */
    renderPostProcessing(): void;
}
