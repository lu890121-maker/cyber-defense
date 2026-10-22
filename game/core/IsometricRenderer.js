/**
 * 2.5D 等距投影渲染器
 *
 * 将 3D 世界坐标 (x, y, z) 投影到 2D 屏幕坐标
 * 支持多层地图渲染、深度排序、立体视觉效果
 */
/**
 * 等距投影参数
 */
export class IsometricConfig {
    constructor(canvasWidth, canvasHeight) {
        /** 等距角度（默认 30°） */
        this.isoAngle = Math.PI / 6;
        /** X/Y 缩放系数 */
        this.scaleXY = 0.8;
        /** Z 轴缩放（每层高度差） */
        this.scaleZ = 30;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.offsetX = canvasWidth / 2;
        this.offsetY = canvasHeight / 2 - 50;
    }
}
/**
 * 等距投影核心函数
 */
export class IsometricRenderer {
    constructor(config) {
        this.config = config;
    }
    /**
     * 3D 世界坐标 → 2D 屏幕坐标
     */
    project(x, y, z) {
        const { isoAngle, scaleXY, scaleZ, offsetX, offsetY } = this.config;
        const screenX = (x - y) * Math.cos(isoAngle) * scaleXY + offsetX;
        const screenY = (x + y) * Math.sin(isoAngle) * scaleXY - z * scaleZ + offsetY;
        return { x: screenX, y: screenY };
    }
    /**
     * 2D 屏幕坐标 → 3D 世界坐标（给定 Z 层）
     */
    unproject(screenX, screenY, z) {
        const { isoAngle, scaleXY, scaleZ, offsetX, offsetY } = this.config;
        const dx = screenX - offsetX;
        const dy = screenY - offsetY + z * scaleZ;
        const worldX = (dx / Math.cos(isoAngle) / scaleXY + dy / Math.sin(isoAngle) / scaleXY) / 2;
        const worldY = (dy / Math.sin(isoAngle) / scaleXY - dx / Math.cos(isoAngle) / scaleXY) / 2;
        return { x: worldX, y: worldY, z };
    }
    /**
     * 绘制等距格子（菱形）
     */
    drawTile(ctx, x, y, z, fillColor, strokeColor, alpha = 1) {
        const corners = [
            this.project(x, y, z),
            this.project(x + 1, y, z),
            this.project(x + 1, y + 1, z),
            this.project(x, y + 1, z),
        ];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
    /**
     * 绘制等距立方体（用于塔/敌人）
     */
    drawBox(ctx, x, y, z, w, h, d, // 宽高深
    color, topColor) {
        const corners = [
            this.project(x, y, z),
            this.project(x + w, y, z),
            this.project(x + w, y + h, z),
            this.project(x, y + h, z),
            this.project(x, y, z + d),
            this.project(x + w, y, z + d),
            this.project(x + w, y + h, z + d),
            this.project(x, y + h, z + d),
        ];
        // 顶面
        ctx.beginPath();
        ctx.moveTo(corners[4].x, corners[4].y);
        ctx.lineTo(corners[5].x, corners[5].y);
        ctx.lineTo(corners[6].x, corners[6].y);
        ctx.lineTo(corners[7].x, corners[7].y);
        ctx.closePath();
        ctx.fillStyle = topColor || this.shadeColor(color, 30);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 右面
        ctx.beginPath();
        ctx.moveTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[6].x, corners[6].y);
        ctx.lineTo(corners[5].x, corners[5].y);
        ctx.closePath();
        ctx.fillStyle = this.shadeColor(color, -20);
        ctx.fill();
        ctx.stroke();
        // 左面
        ctx.beginPath();
        ctx.moveTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.lineTo(corners[7].x, corners[7].y);
        ctx.lineTo(corners[6].x, corners[6].y);
        ctx.closePath();
        ctx.fillStyle = this.shadeColor(color, -40);
        ctx.fill();
        ctx.stroke();
    }
    /**
     * 计算深度排序值（用于画家算法）
     */
    depthSortValue(x, y, z) {
        return x + y + z * 0.1;
    }
    /**
     * 颜色明暗调整
     */
    shadeColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + percent));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
        return `rgb(${r},${g},${b})`;
    }
    /**
     * 绘制射程圈（椭圆投影）
     */
    drawRangeCircle(ctx, centerX, centerY, centerZ, range, color, alpha = 0.15) {
        const center = this.project(centerX + 0.5, centerY + 0.5, centerZ);
        const radiusPixels = range * 40 * 0.8; // TILE_W * scaleXY
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radiusPixels, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }
    /**
     * 绘制路线段
     */
    drawRouteSegment(ctx, p1, p2, color, lineWidth = 8, alpha = 0.6) {
        const s1 = this.project(p1.x + 0.5, p1.y + 0.5, p1.z + 0.1);
        const s2 = this.project(p2.x + 0.5, p2.y + 0.5, p2.z + 0.1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.restore();
    }
}
//# sourceMappingURL=IsometricRenderer.js.map