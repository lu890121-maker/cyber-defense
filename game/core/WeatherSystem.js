/**
 * 天气系统 - 每关不同的天气效果
 * 支持：雨、雪、雾、沙尘暴、极光、糖果雨、陨石雨
 */
export var WeatherType;
(function (WeatherType) {
    WeatherType["NONE"] = "none";
    WeatherType["RAIN"] = "rain";
    WeatherType["SNOW"] = "snow";
    WeatherType["FOG"] = "fog";
    WeatherType["SANDSTORM"] = "sandstorm";
    WeatherType["AURORA"] = "aurora";
    WeatherType["CANDY_RAIN"] = "candy_rain";
    WeatherType["METEOR_RAIN"] = "meteor_rain";
})(WeatherType || (WeatherType = {}));
export class WeatherSystem {
    constructor(canvasWidth, canvasHeight) {
        this.particles = [];
        this.weatherType = WeatherType.NONE;
        this.time = 0;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }
    setWeather(type) {
        this.weatherType = type;
        this.particles = [];
    }
    getWeather() {
        return this.weatherType;
    }
    update(deltaTime) {
        this.time += deltaTime;
        // 生成新粒子
        this.spawnParticles(deltaTime);
        // 更新现有粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * deltaTime;
            p.y += p.vy * deltaTime;
            p.rotation += p.rotationSpeed * deltaTime;
            p.life -= deltaTime;
            // 移除死亡或出界的粒子
            if (p.life <= 0 || p.y > this.canvasHeight + 50 || p.x < -50 || p.x > this.canvasWidth + 50) {
                this.particles.splice(i, 1);
            }
        }
    }
    spawnParticles(deltaTime) {
        switch (this.weatherType) {
            case WeatherType.RAIN:
                this.spawnRain(deltaTime);
                break;
            case WeatherType.SNOW:
                this.spawnSnow(deltaTime);
                break;
            case WeatherType.FOG:
                this.spawnFog(deltaTime);
                break;
            case WeatherType.SANDSTORM:
                this.spawnSandstorm(deltaTime);
                break;
            case WeatherType.AURORA:
                this.spawnAurora(deltaTime);
                break;
            case WeatherType.CANDY_RAIN:
                this.spawnCandyRain(deltaTime);
                break;
            case WeatherType.METEOR_RAIN:
                this.spawnMeteorRain(deltaTime);
                break;
        }
    }
    spawnRain(deltaTime) {
        // 每帧至少生成1个粒子，确保可见
        const count = Math.max(1, Math.floor(120 * deltaTime));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: -10,
                vx: -50, // 风向
                vy: 600 + Math.random() * 200,
                life: 2,
                maxLife: 2,
                size: 2,
                rotation: 0,
                rotationSpeed: 0,
                color: 'rgba(150, 200, 255, 0.6)',
                type: 'rain'
            });
        }
    }
    spawnSnow(deltaTime) {
        const count = Math.max(1, Math.floor(60 * deltaTime));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: -10,
                vx: Math.sin(this.time * 2 + i) * 20, // 飘动
                vy: 80 + Math.random() * 40,
                life: 5,
                maxLife: 5,
                size: 3 + Math.random() * 3,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 2,
                color: 'rgba(255, 255, 255, 0.8)',
                type: 'snow'
            });
        }
    }
    spawnFog(deltaTime) {
        const count = Math.max(1, Math.floor(10 * deltaTime));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: Math.random() * this.canvasHeight,
                vx: 10 + Math.random() * 10,
                vy: 0,
                life: 4,
                maxLife: 4,
                size: 80 + Math.random() * 60,
                rotation: 0,
                rotationSpeed: 0,
                color: 'rgba(200, 200, 220, 0.15)',
                type: 'fog'
            });
        }
    }
    spawnSandstorm(deltaTime) {
        const count = Math.max(1, Math.floor(160 * deltaTime));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.canvasWidth + 10,
                y: Math.random() * this.canvasHeight,
                vx: -400 - Math.random() * 200,
                vy: (Math.random() - 0.5) * 100,
                life: 1.5,
                maxLife: 1.5,
                size: 2 + Math.random() * 2,
                rotation: 0,
                rotationSpeed: 0,
                color: 'rgba(210, 180, 140, 0.5)',
                type: 'sand'
            });
        }
    }
    spawnAurora(deltaTime) {
        // 极光用大尺寸半透明粒子
        const count = Math.max(1, Math.floor(4 * deltaTime));
        for (let i = 0; i < count; i++) {
            const colors = ['rgba(100, 255, 200, 0.3)', 'rgba(150, 200, 255, 0.3)', 'rgba(200, 150, 255, 0.3)'];
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: Math.random() * this.canvasHeight * 0.6, // 只在上半部分
                vx: 5 + Math.random() * 5,
                vy: 0,
                life: 6,
                maxLife: 6,
                size: 100 + Math.random() * 80,
                rotation: 0,
                rotationSpeed: 0,
                color: colors[Math.floor(Math.random() * colors.length)],
                type: 'aurora'
            });
        }
    }
    spawnCandyRain(deltaTime) {
        const count = Math.max(1, Math.floor(30 * deltaTime));
        const colors = ['rgba(255, 150, 200, 0.9)', 'rgba(255, 200, 100, 0.9)', 'rgba(150, 255, 200, 0.9)', 'rgba(200, 150, 255, 0.9)'];
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: -20,
                vx: (Math.random() - 0.5) * 40,
                vy: 100 + Math.random() * 60,
                life: 5,
                maxLife: 5,
                size: 8 + Math.random() * 6,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                type: 'candy'
            });
        }
    }
    spawnMeteorRain(deltaTime) {
        const count = Math.max(1, Math.floor(6 * deltaTime));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvasWidth,
                y: -30,
                vx: (Math.random() - 0.5) * 100,
                vy: 300 + Math.random() * 200,
                life: 2,
                maxLife: 2,
                size: 4 + Math.random() * 4,
                rotation: 0,
                rotationSpeed: 0,
                color: 'rgba(255, 100, 50, 0.9)',
                type: 'meteor'
            });
        }
    }
    render(ctx) {
        ctx.save();
        for (const p of this.particles) {
            const alpha = Math.min(1, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            switch (p.type) {
                case 'rain':
                    this.renderRain(ctx, p);
                    break;
                case 'snow':
                    this.renderSnow(ctx, p);
                    break;
                case 'fog':
                    this.renderFog(ctx, p);
                    break;
                case 'sand':
                    this.renderSand(ctx, p);
                    break;
                case 'aurora':
                    this.renderAurora(ctx, p);
                    break;
                case 'candy':
                    this.renderCandy(ctx, p);
                    break;
                case 'meteor':
                    this.renderMeteor(ctx, p);
                    break;
            }
        }
        ctx.restore();
    }
    renderRain(ctx, p) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02);
        ctx.stroke();
    }
    renderSnow(ctx, p) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    renderFog(ctx, p) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'rgba(200, 200, 220, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    renderSand(ctx, p) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.5);
    }
    renderAurora(ctx, p) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    renderCandy(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        // 糖果形状（简化为圆形+条纹）
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        // 条纹
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size, 0);
        ctx.stroke();
        ctx.restore();
    }
    renderMeteor(ctx, p) {
        // 陨石主体
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        // 拖尾
        const gradient = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 0.1, p.y - p.vy * 0.1);
        gradient.addColorStop(0, 'rgba(255, 150, 50, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = p.size * 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.1, p.y - p.vy * 0.1);
        ctx.stroke();
    }
}
//# sourceMappingURL=WeatherSystem.js.map