/**
 * 2.5D 多维空间塔防 — 游戏主引擎
 *
 * 整合等距投影、多层地图、多维机制
 */
import { IsometricRenderer, IsometricConfig } from './IsometricRenderer.js';
import { HeightLayer, LAYER_COLORS, TargetHeight, MULTI_TOWER_CONFIGS, MULTI_ENEMY_CONFIGS, MULTI_LEVEL_MAPS, MULTI_WAVES, } from '../config/MultiDimensionConfig.js';
// ══════════════════════════════════════════════════════════
//  游戏引擎
// ══════════════════════════════════════════════════════════
export class MultiDimensionGame {
    constructor(canvas, levelIndex = 0) {
        this.lastTime = 0;
        this.animationId = 0;
        this.gameLoop = (timestamp) => {
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.lastTime = timestamp;
            if (!this.state.paused) {
                this.update(dt);
            }
            this.render();
            this.animationId = requestAnimationFrame(this.gameLoop);
        };
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        const config = new IsometricConfig(canvas.width, canvas.height);
        this.renderer = new IsometricRenderer(config);
        this.currentLevel = MULTI_LEVEL_MAPS[levelIndex];
        this.state = this.createInitialState();
    }
    createInitialState() {
        return {
            gold: 300,
            lives: 20,
            wave: 0,
            paused: false,
            currentLayer: HeightLayer.GROUND,
            selectedTowerType: null,
            towers: [],
            enemies: [],
            projectiles: [],
            particles: [],
            waveActive: false,
            enemiesToSpawn: [],
            spawnTimer: 0,
            currentPhase: 'alpha',
            phaseTimer: 0,
            foldLinesActive: this.currentLevel.foldLines?.map(f => f.active) || [],
            nextTowerId: 1,
            nextEnemyId: 1,
            nextProjectileId: 1,
        };
    }
    // ══════════════════════════════════════════════════════
    //  游戏循环
    // ══════════════════════════════════════════════════════
    start() {
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);
    }
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    // ═════════════════════════════════════════════════════
    //  更新逻辑
    // ══════════════════════════════════════════════════════
    update(dt) {
        // 更新时间相位
        this.updateTimePhase(dt);
        // 更新折叠线
        this.updateFoldLines(dt);
        // 生成敌人
        this.spawnEnemies(dt);
        // 更新敌人
        this.updateEnemies(dt);
        // 更新塔（攻击）
        this.updateTowers(dt);
        // 更新子弹
        this.updateProjectiles(dt);
        // 更新粒子
        this.updateParticles(dt);
        // 检查波次结束
        this.checkWaveEnd();
        // 通知 UI
        this.onStateChange?.();
    }
    updateTimePhase(dt) {
        if (!this.currentLevel.timePhases || this.currentLevel.timePhases.length === 0)
            return;
        this.state.phaseTimer += dt;
        const phases = this.currentLevel.timePhases;
        const currentPhaseDef = phases.find(p => p.id === this.state.currentPhase);
        if (currentPhaseDef && this.state.phaseTimer >= currentPhaseDef.duration) {
            this.state.phaseTimer = 0;
            // 切换相位
            const currentIndex = phases.indexOf(currentPhaseDef);
            const nextIndex = (currentIndex + 1) % phases.length;
            this.state.currentPhase = phases[nextIndex].id;
            // 相位切换时，所有敌人重新计算路线
            this.recalculateEnemyRoutes();
        }
    }
    updateFoldLines(dt) {
        if (!this.currentLevel.foldLines)
            return;
        // 简单实现：周期性切换折叠线激活状态
        const cycleTime = 15; // 15 秒周期
        const phase = (Date.now() / 1000) % cycleTime;
        for (let i = 0; i < this.currentLevel.foldLines.length; i++) {
            const foldLine = this.currentLevel.foldLines[i];
            this.state.foldLinesActive[i] = phase < cycleTime / 2;
        }
    }
    spawnEnemies(dt) {
        if (!this.state.waveActive || this.state.enemiesToSpawn.length === 0)
            return;
        this.state.spawnTimer += dt;
        if (this.state.spawnTimer >= 0.8) {
            this.state.spawnTimer = 0;
            const enemyType = this.state.enemiesToSpawn.shift();
            this.spawnEnemy(enemyType);
        }
    }
    spawnEnemy(type) {
        const config = MULTI_ENEMY_CONFIGS.find(c => c.type === type);
        if (!config)
            return;
        // 找到该类型敌人的路线
        const route = this.getRouteForEnemy(config);
        if (!route || route.points.length === 0)
            return;
        const startPoint = route.points[0];
        this.state.enemies.push({
            id: this.state.nextEnemyId++,
            type: type,
            x: startPoint.x,
            y: startPoint.y,
            z: startPoint.z,
            hp: config.hp,
            maxHp: config.hp,
            speed: config.speed * (route.speedMult || 1),
            routeIndex: 0,
            progress: 0,
            slowTimer: 0,
            route: route.points,
            flipped: false,
            dimension: 'outer',
            phase: this.state.currentPhase,
        });
    }
    getRouteForEnemy(config) {
        const phases = this.currentLevel.timePhases;
        const activePhase = phases?.find(p => p.id === this.state.currentPhase);
        // 根据敌人类型和当前相位选择路线
        for (const route of this.currentLevel.routes) {
            const firstPoint = route.points[0];
            // 检查高度层匹配
            if (firstPoint.z !== config.defaultLayer)
                continue;
            // 检查相位激活
            if (activePhase) {
                const routeIndex = this.currentLevel.routes.indexOf(route);
                if (!activePhase.activeRoutes.includes(routeIndex))
                    continue;
            }
            return route;
        }
        // 默认返回第一条匹配高度的路线
        return this.currentLevel.routes.find(r => r.points[0].z === config.defaultLayer) || null;
    }
    recalculateEnemyRoutes() {
        // 相位切换时，敌人重新计算路线
        for (const enemy of this.state.enemies) {
            const config = MULTI_ENEMY_CONFIGS.find(c => c.type === enemy.type);
            if (!config)
                continue;
            const newRoute = this.getRouteForEnemy(config);
            if (newRoute) {
                enemy.route = newRoute.points;
                enemy.speed = config.speed * (newRoute.speedMult || 1);
                enemy.phase = this.state.currentPhase;
            }
        }
    }
    updateEnemies(dt) {
        for (let i = this.state.enemies.length - 1; i >= 0; i--) {
            const enemy = this.state.enemies[i];
            const config = MULTI_ENEMY_CONFIGS.find(c => c.type === enemy.type);
            if (!config)
                continue;
            // 减速效果
            let speed = enemy.speed;
            if (enemy.slowTimer > 0) {
                speed *= 0.4;
                enemy.slowTimer -= dt;
            }
            // 沿路线移动
            if (enemy.routeIndex >= enemy.route.length - 1) {
                // 到达核心
                this.state.lives--;
                this.state.enemies.splice(i, 1);
                if (this.state.lives <= 0) {
                    this.onGameOver?.();
                }
                continue;
            }
            const target = enemy.route[enemy.routeIndex + 1];
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const dz = target.z - enemy.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 0.1) {
                enemy.routeIndex++;
                enemy.x = target.x;
                enemy.y = target.y;
                enemy.z = target.z;
                // 莫比乌斯翻转检查
                if (this.currentLevel.topology === 'mobius' && enemy.routeIndex >= enemy.route.length - 1) {
                    enemy.flipped = !enemy.flipped;
                }
            }
            else {
                const moveSpeed = speed * dt * 0.5;
                enemy.x += (dx / dist) * moveSpeed;
                enemy.y += (dy / dist) * moveSpeed;
                enemy.z += (dz / dist) * moveSpeed;
            }
        }
    }
    updateTowers(dt) {
        for (const tower of this.state.towers) {
            const config = MULTI_TOWER_CONFIGS.find(c => c.type === tower.type);
            if (!config)
                continue;
            if (config.isSlow) {
                // 减速塔
                for (const enemy of this.state.enemies) {
                    if (!this.canTowerHitEnemy(tower, enemy, config))
                        continue;
                    const dx = enemy.x - tower.x;
                    const dy = enemy.y - tower.y;
                    const dz = enemy.z - tower.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist <= config.range) {
                        enemy.slowTimer = 0.5;
                    }
                }
                continue;
            }
            tower.cooldown -= dt;
            if (tower.cooldown > 0)
                continue;
            // 找目标
            let target = null;
            let minDist = Infinity;
            for (const enemy of this.state.enemies) {
                if (!this.canTowerHitEnemy(tower, enemy, config))
                    continue;
                const dx = enemy.x - tower.x;
                const dy = enemy.y - tower.y;
                const dz = enemy.z - tower.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist <= config.range && dist < minDist) {
                    minDist = dist;
                    target = enemy;
                }
            }
            if (target) {
                tower.cooldown = config.fireRate;
                tower.target = target;
                this.state.projectiles.push({
                    id: this.state.nextProjectileId++,
                    x: tower.x,
                    y: tower.y,
                    z: tower.z,
                    prevX: tower.x,
                    prevY: tower.y,
                    target: target,
                    speed: config.projectileSpeed,
                    damage: config.damage,
                    color: config.color,
                });
            }
        }
    }
    canTowerHitEnemy(tower, enemy, config) {
        // 检查高度层
        if (config.targetHeight === TargetHeight.GROUND_ONLY && enemy.z !== HeightLayer.GROUND)
            return false;
        if (config.targetHeight === TargetHeight.AIR_ONLY && enemy.z !== HeightLayer.AIR)
            return false;
        // 跨层塔可以打所有层
        if (config.isCrossLayer)
            return true;
        // 普通塔只能打同层
        return tower.z === enemy.z;
    }
    updateProjectiles(dt) {
        for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
            const proj = this.state.projectiles[i];
            const target = proj.target;
            if (!target || !this.state.enemies.includes(target)) {
                this.state.projectiles.splice(i, 1);
                continue;
            }
            proj.prevX = proj.x;
            proj.prevY = proj.y;
            const dx = target.x - proj.x;
            const dy = target.y - proj.y;
            const dz = target.z - proj.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 0.3) {
                // 命中
                target.hp -= proj.damage;
                // 创建命中粒子
                this.createHitParticles(target.x, target.y, target.z, proj.color);
                if (target.hp <= 0) {
                    const config = MULTI_ENEMY_CONFIGS.find(c => c.type === target.type);
                    if (config) {
                        this.state.gold += config.reward;
                    }
                    const idx = this.state.enemies.indexOf(target);
                    if (idx >= 0)
                        this.state.enemies.splice(idx, 1);
                }
                this.state.projectiles.splice(i, 1);
            }
            else {
                const moveSpeed = proj.speed * dt;
                proj.x += (dx / dist) * moveSpeed;
                proj.y += (dy / dist) * moveSpeed;
                proj.z += (dz / dist) * moveSpeed;
            }
        }
    }
    createHitParticles(x, y, z, color) {
        for (let i = 0; i < 5; i++) {
            this.state.particles.push({
                x: x + 0.5,
                y: y + 0.5,
                z: z + 0.3,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 0.5,
                color: color,
                size: 2 + Math.random() * 2,
            });
        }
    }
    updateParticles(dt) {
        for (let i = this.state.particles.length - 1; i >= 0; i--) {
            const p = this.state.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) {
                this.state.particles.splice(i, 1);
            }
        }
    }
    checkWaveEnd() {
        if (this.state.waveActive &&
            this.state.enemiesToSpawn.length === 0 &&
            this.state.enemies.length === 0) {
            this.state.waveActive = false;
            this.state.gold += 50; // 波次奖励
            if (this.state.wave >= MULTI_WAVES.length) {
                this.onVictory?.();
            }
        }
    }
    // ══════════════════════════════════════════════════════
    //  渲染
    // ══════════════════════════════════════════════════════
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // 背景网格
        this.drawBackgroundGrid();
        // 绘制地图（按 Z 从低到高）
        this.drawMap();
        // 收集所有实体按深度排序
        const entities = [];
        for (const tower of this.state.towers) {
            entities.push({ type: 'tower', obj: tower, depth: this.renderer.depthSortValue(tower.x, tower.y, tower.z) });
        }
        for (const enemy of this.state.enemies) {
            entities.push({ type: 'enemy', obj: enemy, depth: this.renderer.depthSortValue(enemy.x, enemy.y, enemy.z) });
        }
        for (const proj of this.state.projectiles) {
            entities.push({ type: 'projectile', obj: proj, depth: this.renderer.depthSortValue(proj.x, proj.y, proj.z) });
        }
        entities.sort((a, b) => a.depth - b.depth);
        for (const entity of entities) {
            if (entity.type === 'tower')
                this.drawTower(entity.obj);
            else if (entity.type === 'enemy')
                this.drawEnemy(entity.obj);
            else if (entity.type === 'projectile')
                this.drawProjectile(entity.obj);
        }
        // 绘制粒子
        this.drawParticles();
        // 绘制放置预览
        this.drawPlacementPreview();
    }
    drawBackgroundGrid() {
        this.ctx.strokeStyle = 'rgba(26, 42, 58, 0.3)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 12; i++) {
            for (let j = 0; j <= 12; j++) {
                const pos = this.renderer.project(i, j, 0);
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }
    drawMap() {
        const layers = [HeightLayer.UNDERGROUND, HeightLayer.GROUND, HeightLayer.AIR];
        for (const z of layers) {
            const alpha = z === this.state.currentLayer ? 1 : 0.25;
            const layerColor = LAYER_COLORS[z];
            // 绘制路线
            for (const route of this.currentLevel.routes) {
                // 检查相位激活
                if (this.currentLevel.timePhases) {
                    const routeIndex = this.currentLevel.routes.indexOf(route);
                    const activePhase = this.currentLevel.timePhases.find(p => p.id === this.state.currentPhase);
                    if (activePhase && !activePhase.activeRoutes.includes(routeIndex))
                        continue;
                }
                for (let i = 0; i < route.points.length - 1; i++) {
                    const p1 = route.points[i];
                    const p2 = route.points[i + 1];
                    // 只绘制当前层或透明绘制其他层
                    if (p1.z !== z && p2.z !== z)
                        continue;
                    this.renderer.drawRouteSegment(this.ctx, p1, p2, layerColor, 8, alpha * 0.6);
                }
            }
            // 绘制塔位
            for (const slot of this.currentLevel.slots) {
                if (slot.z !== z)
                    continue;
                const occupied = this.state.towers.some(t => Math.abs(t.x - slot.x) < 0.5 && Math.abs(t.y - slot.y) < 0.5 && t.z === slot.z);
                if (!occupied) {
                    this.renderer.drawTile(this.ctx, slot.x, slot.y, slot.z, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)', alpha * 0.5);
                }
            }
        }
        // 绘制核心
        this.drawCore();
    }
    drawCore() {
        const core = this.currentLevel.core;
        const pos = this.renderer.project(core.x + 0.5, core.y + 0.5, core.z);
        const pulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
        // 核心底座
        this.renderer.drawBox(this.ctx, core.x + 0.1, core.y + 0.1, core.z, 0.8, 0.8, 0.5, '#ff6b6b', '#ff8888');
        // 核心发光
        this.ctx.save();
        this.ctx.globalAlpha = pulse * 0.5;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y - 10, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fill();
        this.ctx.restore();
        // 核心文字
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('CORE', pos.x, pos.y - 25);
    }
    drawTower(tower) {
        const config = MULTI_TOWER_CONFIGS.find(c => c.type === tower.type);
        if (!config)
            return;
        const basePos = this.renderer.project(tower.x + 0.5, tower.y + 0.5, tower.z);
        // 塔基座
        this.renderer.drawBox(this.ctx, tower.x + 0.2, tower.y + 0.2, tower.z, 0.6, 0.6, 0.3, config.color);
        // 塔身
        this.renderer.drawBox(this.ctx, tower.x + 0.3, tower.y + 0.3, tower.z + 0.3, 0.4, 0.4, config.height, config.color);
        // 炮口
        const topPos = this.renderer.project(tower.x + 0.5, tower.y + 0.5, tower.z + 0.3 + config.height);
        this.ctx.beginPath();
        this.ctx.arc(topPos.x, topPos.y, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        // 射程圈（只在当前层显示）
        if (tower.z === this.state.currentLayer) {
            this.renderer.drawRangeCircle(this.ctx, tower.x, tower.y, tower.z, config.range, config.color, 0.15);
        }
    }
    drawEnemy(enemy) {
        const config = MULTI_ENEMY_CONFIGS.find(c => c.type === enemy.type);
        if (!config)
            return;
        const pos = this.renderer.project(enemy.x + 0.5, enemy.y + 0.5, enemy.z + 0.3);
        // 阴影
        const shadowPos = this.renderer.project(enemy.x + 0.5, enemy.y + 0.5, 0);
        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        this.ctx.beginPath();
        this.ctx.ellipse(shadowPos.x, shadowPos.y, 12, 6, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = '#000';
        this.ctx.fill();
        this.ctx.restore();
        // 敌人身体
        const size = config.size * 15;
        this.ctx.save();
        // 飞行敌人有浮动效果
        let drawY = pos.y;
        if (enemy.z > 0) {
            drawY += Math.sin(Date.now() * 0.003 + enemy.id) * 3;
        }
        // 身体
        this.ctx.beginPath();
        this.ctx.arc(pos.x, drawY, size, 0, Math.PI * 2);
        this.ctx.fillStyle = config.color;
        this.ctx.fill();
        this.ctx.strokeStyle = this.shadeColor(config.color, 40);
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        // 血条
        const hpRatio = enemy.hp / enemy.maxHp;
        const barW = size * 2;
        const barH = 4;
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(pos.x - barW / 2, drawY - size - 8, barW, barH);
        this.ctx.fillStyle = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#fbbf24' : '#f87171';
        this.ctx.fillRect(pos.x - barW / 2, drawY - size - 8, barW * hpRatio, barH);
        // 减速效果
        if (enemy.slowTimer > 0) {
            this.ctx.beginPath();
            this.ctx.arc(pos.x, drawY, size + 3, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }
    drawProjectile(proj) {
        const pos = this.renderer.project(proj.x + 0.5, proj.y + 0.5, proj.z + 0.5);
        const prevPos = this.renderer.project(proj.prevX + 0.5, proj.prevY + 0.5, proj.z + 0.5);
        // 拖尾
        this.ctx.beginPath();
        this.ctx.moveTo(prevPos.x, prevPos.y);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.strokeStyle = proj.color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        // 弹头
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
    }
    drawParticles() {
        for (const p of this.state.particles) {
            const pos = this.renderer.project(p.x, p.y, p.z);
            this.ctx.save();
            this.ctx.globalAlpha = p.life * 2;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
            this.ctx.restore();
        }
    }
    drawPlacementPreview() {
        if (!this.state.selectedTowerType)
            return;
        // 需要鼠标位置，这里简化处理
        // 实际实现需要跟踪鼠标位置
    }
    shadeColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + percent));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
        return `rgb(${r},${g},${b})`;
    }
    // ═════════════════════════════════════════════════════
    //  公共 API
    // ══════════════════════════════════════════════════════
    selectTower(type) {
        this.state.selectedTowerType = type;
    }
    deselectTower() {
        this.state.selectedTowerType = null;
    }
    placeTower(gridX, gridY) {
        if (!this.state.selectedTowerType)
            return false;
        const config = MULTI_TOWER_CONFIGS.find(c => c.type === this.state.selectedTowerType);
        if (!config)
            return false;
        // 检查金币
        if (this.state.gold < config.cost)
            return false;
        // 检查是否是有效塔位
        const validSlot = this.currentLevel.slots.some(s => Math.abs(s.x - gridX) < 0.5 && Math.abs(s.y - gridY) < 0.5 && s.z === this.state.currentLayer);
        if (!validSlot)
            return false;
        // 检查是否已有塔
        const occupied = this.state.towers.some(t => Math.abs(t.x - gridX) < 0.5 && Math.abs(t.y - gridY) < 0.5 && t.z === this.state.currentLayer);
        if (occupied)
            return false;
        this.state.gold -= config.cost;
        this.state.towers.push({
            id: this.state.nextTowerId++,
            type: this.state.selectedTowerType,
            x: gridX,
            y: gridY,
            z: this.state.currentLayer,
            cooldown: 0,
            target: null,
        });
        return true;
    }
    switchLayer(z) {
        this.state.currentLayer = z;
    }
    startWave() {
        if (this.state.waveActive || this.state.wave >= MULTI_WAVES.length)
            return;
        const waveConfig = MULTI_WAVES[this.state.wave];
        this.state.enemiesToSpawn = [];
        for (const group of waveConfig) {
            for (let i = 0; i < group.count; i++) {
                this.state.enemiesToSpawn.push(group.type);
            }
        }
        // 随机打乱
        this.state.enemiesToSpawn.sort(() => Math.random() - 0.5);
        this.state.waveActive = true;
        this.state.spawnTimer = 0;
        this.state.wave++;
    }
    togglePause() {
        this.state.paused = !this.state.paused;
    }
    getState() {
        return this.state;
    }
    getCurrentLevel() {
        return this.currentLevel;
    }
}
//# sourceMappingURL=MultiDimensionGame.js.map