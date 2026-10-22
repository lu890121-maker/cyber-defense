/**
 * 2.5D 多维空间塔防 — 游戏主引擎
 *
 * 整合等距投影、多层地图、多维机制
 */
import { HeightLayer, MultiMapPoint, MultiLevelMap } from '../config/MultiDimensionConfig.js';
export interface Tower {
    id: number;
    type: string;
    x: number;
    y: number;
    z: HeightLayer;
    cooldown: number;
    target: Enemy | null;
}
export interface Enemy {
    id: number;
    type: string;
    x: number;
    y: number;
    z: HeightLayer;
    hp: number;
    maxHp: number;
    speed: number;
    routeIndex: number;
    progress: number;
    slowTimer: number;
    route: MultiMapPoint[];
    flipped: boolean;
    dimension: 'inner' | 'outer';
    phase: 'alpha' | 'beta';
}
export interface Projectile {
    id: number;
    x: number;
    y: number;
    z: HeightLayer;
    prevX: number;
    prevY: number;
    target: Enemy;
    speed: number;
    damage: number;
    color: string;
}
export interface Particle {
    x: number;
    y: number;
    z: HeightLayer;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}
export interface GameState {
    gold: number;
    lives: number;
    wave: number;
    paused: boolean;
    currentLayer: HeightLayer;
    selectedTowerType: string | null;
    towers: Tower[];
    enemies: Enemy[];
    projectiles: Projectile[];
    particles: Particle[];
    waveActive: boolean;
    enemiesToSpawn: string[];
    spawnTimer: number;
    currentPhase: 'alpha' | 'beta';
    phaseTimer: number;
    foldLinesActive: boolean[];
    nextTowerId: number;
    nextEnemyId: number;
    nextProjectileId: number;
}
export declare class MultiDimensionGame {
    private canvas;
    private ctx;
    private renderer;
    private state;
    private currentLevel;
    private lastTime;
    private animationId;
    onStateChange?: () => void;
    onGameOver?: () => void;
    onVictory?: () => void;
    constructor(canvas: HTMLCanvasElement, levelIndex?: number);
    private createInitialState;
    start(): void;
    stop(): void;
    private gameLoop;
    private update;
    private updateTimePhase;
    private updateFoldLines;
    private spawnEnemies;
    private spawnEnemy;
    private getRouteForEnemy;
    private recalculateEnemyRoutes;
    private updateEnemies;
    private updateTowers;
    private canTowerHitEnemy;
    private updateProjectiles;
    private createHitParticles;
    private updateParticles;
    private checkWaveEnd;
    private render;
    private drawBackgroundGrid;
    private drawMap;
    private drawCore;
    private drawTower;
    private drawEnemy;
    private drawProjectile;
    private drawParticles;
    private drawPlacementPreview;
    private shadeColor;
    selectTower(type: string): void;
    deselectTower(): void;
    placeTower(gridX: number, gridY: number): boolean;
    switchLayer(z: HeightLayer): void;
    startWave(): void;
    togglePause(): void;
    getState(): GameState;
    getCurrentLevel(): MultiLevelMap;
}
