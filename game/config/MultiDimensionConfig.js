/**
 * 多维空间塔防 — 配置与数据类型定义
 *
 * 支持 Z 轴（高度层）、W 轴（维度折叠）、T 轴（时间相位）
 */
// ══════════════════════════════════════════════════════════
//  高度层定义
// ══════════════════════════════════════════════════════════
export var HeightLayer;
(function (HeightLayer) {
    HeightLayer[HeightLayer["UNDERGROUND"] = -1] = "UNDERGROUND";
    HeightLayer[HeightLayer["GROUND"] = 0] = "GROUND";
    HeightLayer[HeightLayer["AIR"] = 1] = "AIR";
})(HeightLayer || (HeightLayer = {}));
export const LAYER_NAMES = {
    [HeightLayer.UNDERGROUND]: '地下层',
    [HeightLayer.GROUND]: '地面层',
    [HeightLayer.AIR]: '空中层',
};
export const LAYER_COLORS = {
    [HeightLayer.UNDERGROUND]: '#ffd700',
    [HeightLayer.GROUND]: '#00f0ff',
    [HeightLayer.AIR]: '#0066cc',
};
// ══════════════════════════════════════════════════════════
//  攻击高度类型
// ══════════════════════════════════════════════════════════
export var TargetHeight;
(function (TargetHeight) {
    TargetHeight["GROUND_ONLY"] = "ground";
    TargetHeight["AIR_ONLY"] = "air";
    TargetHeight["ALL"] = "all";
})(TargetHeight || (TargetHeight = {}));
export const MULTI_TOWER_CONFIGS = [
    {
        type: 'gunner',
        name: '机枪塔',
        cost: 50,
        range: 3,
        damage: 15,
        fireRate: 0.15,
        color: '#00f0ff',
        height: 0.5,
        targetHeight: TargetHeight.GROUND_ONLY,
        projectileSpeed: 8,
    },
    {
        type: 'sniper',
        name: '狙击塔',
        cost: 80,
        range: 6,
        damage: 50,
        fireRate: 1.5,
        color: '#9d00ff',
        height: 0.8,
        targetHeight: TargetHeight.ALL,
        projectileSpeed: 15,
        isCrossLayer: true,
    },
    {
        type: 'aagun',
        name: '防空塔',
        cost: 60,
        range: 4,
        damage: 20,
        fireRate: 0.3,
        color: '#ff6b6b',
        height: 0.6,
        targetHeight: TargetHeight.AIR_ONLY,
        projectileSpeed: 10,
    },
    {
        type: 'dimension',
        name: '维度锚',
        cost: 100,
        range: 2.5,
        damage: 0,
        fireRate: 0,
        color: '#ffd700',
        height: 0.4,
        targetHeight: TargetHeight.ALL,
        projectileSpeed: 0,
        isSlow: true,
        slowFactor: 0.4,
        isDimensionLock: true,
    },
    {
        type: 'bomb',
        name: '爆破塔',
        cost: 70,
        range: 2,
        damage: 40,
        fireRate: 1.0,
        color: '#ff8c00',
        height: 0.5,
        targetHeight: TargetHeight.GROUND_ONLY,
        projectileSpeed: 5,
    },
    {
        type: 'laser',
        name: '激光塔',
        cost: 90,
        range: 5,
        damage: 8,
        fireRate: 0.05,
        color: '#00ff88',
        height: 0.7,
        targetHeight: TargetHeight.ALL,
        projectileSpeed: 20,
        isCrossLayer: true,
    },
];
export const MULTI_ENEMY_CONFIGS = [
    {
        type: 'ground',
        name: '地面兵',
        hp: 100,
        speed: 1.2,
        reward: 10,
        color: '#4ade80',
        defaultLayer: HeightLayer.GROUND,
        size: 0.4,
    },
    {
        type: 'fast',
        name: '快速兵',
        hp: 60,
        speed: 2.5,
        reward: 15,
        color: '#fbbf24',
        defaultLayer: HeightLayer.GROUND,
        size: 0.3,
    },
    {
        type: 'heavy',
        name: '重甲兵',
        hp: 300,
        speed: 0.7,
        reward: 25,
        color: '#f87171',
        defaultLayer: HeightLayer.GROUND,
        size: 0.5,
    },
    {
        type: 'flyer',
        name: '飞行兵',
        hp: 80,
        speed: 1.8,
        reward: 20,
        color: '#60a5fa',
        defaultLayer: HeightLayer.AIR,
        size: 0.35,
        canFly: true,
    },
    {
        type: 'burrower',
        name: '钻地兵',
        hp: 120,
        speed: 1.0,
        reward: 15,
        color: '#d4a017',
        defaultLayer: HeightLayer.UNDERGROUND,
        size: 0.35,
        canBurrow: true,
    },
    {
        type: 'phase_walker',
        name: '相位行者',
        hp: 150,
        speed: 1.5,
        reward: 30,
        color: '#a855f7',
        defaultLayer: HeightLayer.GROUND,
        size: 0.4,
        canPhaseShift: true,
    },
    {
        type: 'boss_multidim',
        name: '多维Boss',
        hp: 3000,
        speed: 0.4,
        reward: 500,
        color: '#ff00ff',
        defaultLayer: HeightLayer.GROUND,
        size: 0.8,
        canFly: true,
        canBurrow: true,
        canPhaseShift: true,
        isBoss: true,
    },
];
// ══════════════════════════════════════════════════════════
//  10 关多维地图
// ══════════════════════════════════════════════════════════
const P3 = (x, y, z) => ({ x, y, z });
const CORE = P3(10, 10, HeightLayer.GROUND);
export const MULTI_LEVEL_MAPS = [
    // ── L1：教学关 —— 双层地图入门 ─────────────────────
    {
        id: 1,
        core: CORE,
        mechanics: ['双层地图', '对地/对空'],
        routes: [
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 4, HeightLayer.GROUND),
                    P3(4, 4, HeightLayer.GROUND),
                    P3(4, 8, HeightLayer.GROUND),
                    P3(8, 8, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            {
                points: [
                    P3(-1, 2, HeightLayer.AIR),
                    P3(3, 2, HeightLayer.AIR),
                    P3(6, 5, HeightLayer.AIR),
                    P3(9, 5, HeightLayer.AIR),
                    P3(10, 8, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            // 地面层
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 5, y: 2, z: HeightLayer.GROUND }, { x: 6, y: 2, z: HeightLayer.GROUND },
            { x: 1, y: 6, z: HeightLayer.GROUND }, { x: 2, y: 6, z: HeightLayer.GROUND },
            { x: 5, y: 6, z: HeightLayer.GROUND }, { x: 7, y: 6, z: HeightLayer.GROUND },
            { x: 9, y: 3, z: HeightLayer.GROUND }, { x: 9, y: 7, z: HeightLayer.GROUND },
            // 空中层
            { x: 1, y: 1, z: HeightLayer.AIR }, { x: 4, y: 1, z: HeightLayer.AIR },
            { x: 7, y: 3, z: HeightLayer.AIR }, { x: 8, y: 6, z: HeightLayer.AIR },
        ],
    },
    // ── L2：折叠走廊 ───────────────────────────────────
    {
        id: 2,
        core: CORE,
        mechanics: ['折叠线', '距离压缩'],
        routes: [
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 5, HeightLayer.GROUND),
                    P3(5, 5, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 3, y: 2, z: HeightLayer.GROUND }, { x: 1, y: 3, z: HeightLayer.GROUND },
            { x: 2, y: 3, z: HeightLayer.GROUND }, { x: 3, y: 3, z: HeightLayer.GROUND },
            { x: 6, y: 6, z: HeightLayer.GROUND }, { x: 7, y: 6, z: HeightLayer.GROUND },
            { x: 8, y: 6, z: HeightLayer.GROUND }, { x: 6, y: 7, z: HeightLayer.GROUND },
            { x: 7, y: 7, z: HeightLayer.GROUND }, { x: 8, y: 7, z: HeightLayer.GROUND },
        ],
        foldLines: [
            { y: 5, active: true, foldFactor: 0.3, cycleDuration: 20 },
        ],
    },
    // ── L3：时间相位迷宫 ───────────────────────────────
    {
        id: 3,
        core: CORE,
        mechanics: ['时间相位', '双路线切换'],
        routes: [
            // 相位 α 路线（左路）
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 5, HeightLayer.GROUND),
                    P3(3, 5, HeightLayer.GROUND),
                    P3(3, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 相位 β 路线（右路）
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 5, HeightLayer.GROUND),
                    P3(7, 5, HeightLayer.GROUND),
                    P3(7, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 4, y: 2, z: HeightLayer.GROUND }, { x: 5, y: 2, z: HeightLayer.GROUND },
            { x: 1, y: 7, z: HeightLayer.GROUND }, { x: 2, y: 7, z: HeightLayer.GROUND },
            { x: 4, y: 7, z: HeightLayer.GROUND }, { x: 5, y: 7, z: HeightLayer.GROUND },
            { x: 8, y: 2, z: HeightLayer.GROUND }, { x: 9, y: 2, z: HeightLayer.GROUND },
            { x: 8, y: 7, z: HeightLayer.GROUND }, { x: 9, y: 7, z: HeightLayer.GROUND },
            { x: 4, y: 4, z: HeightLayer.GROUND }, { x: 6, y: 4, z: HeightLayer.GROUND },
        ],
        timePhases: [
            { id: 'alpha', activeRoutes: [0], duration: 25 },
            { id: 'beta', activeRoutes: [1], duration: 25 },
        ],
    },
    // ─ L4：多层折线迷宫（借鉴 Gemini L4）──────────────
    {
        id: 4,
        core: CORE,
        mechanics: ['多层折线', '镜像对称'],
        routes: [
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 2, HeightLayer.GROUND),
                    P3(10, 2, HeightLayer.GROUND),
                    P3(10, 4, HeightLayer.GROUND),
                    P3(0, 4, HeightLayer.GROUND),
                    P3(0, 6, HeightLayer.GROUND),
                    P3(10, 6, HeightLayer.GROUND),
                    P3(10, 8, HeightLayer.GROUND),
                    P3(0, 8, HeightLayer.GROUND),
                    P3(0, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 3, HeightLayer.GROUND),
                    P3(0, 3, HeightLayer.GROUND),
                    P3(0, 5, HeightLayer.GROUND),
                    P3(10, 5, HeightLayer.GROUND),
                    P3(10, 7, HeightLayer.GROUND),
                    P3(0, 7, HeightLayer.GROUND),
                    P3(0, 9, HeightLayer.GROUND),
                    P3(10, 9, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 1, z: HeightLayer.GROUND }, { x: 3, y: 1, z: HeightLayer.GROUND },
            { x: 5, y: 1, z: HeightLayer.GROUND }, { x: 7, y: 1, z: HeightLayer.GROUND },
            { x: 9, y: 1, z: HeightLayer.GROUND },
            { x: 1, y: 3, z: HeightLayer.GROUND }, { x: 3, y: 3, z: HeightLayer.GROUND },
            { x: 5, y: 3, z: HeightLayer.GROUND }, { x: 7, y: 3, z: HeightLayer.GROUND },
            { x: 1, y: 5, z: HeightLayer.GROUND }, { x: 3, y: 5, z: HeightLayer.GROUND },
            { x: 5, y: 5, z: HeightLayer.GROUND }, { x: 7, y: 5, z: HeightLayer.GROUND },
            { x: 9, y: 5, z: HeightLayer.GROUND },
            { x: 1, y: 7, z: HeightLayer.GROUND }, { x: 3, y: 7, z: HeightLayer.GROUND },
        ],
    },
    // ── L5：X 形双交叉 + 三层立体 ────────────────────
    {
        id: 5,
        core: CORE,
        mechanics: ['X 形交叉', '三层立体'],
        routes: [
            // 地面路：X 形
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 3, HeightLayer.GROUND),
                    P3(10, 3, HeightLayer.GROUND),
                    P3(10, 6, HeightLayer.GROUND),
                    P3(0, 6, HeightLayer.GROUND),
                    P3(0, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 4, HeightLayer.GROUND),
                    P3(0, 4, HeightLayer.GROUND),
                    P3(0, 7, HeightLayer.GROUND),
                    P3(10, 7, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 空中路
            {
                points: [
                    P3(-1, 1, HeightLayer.AIR),
                    P3(4, 1, HeightLayer.AIR),
                    P3(7, 4, HeightLayer.AIR),
                    P3(10, 4, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 地下路
            {
                points: [
                    P3(3, 5, HeightLayer.UNDERGROUND),
                    P3(3, 8, HeightLayer.UNDERGROUND),
                    P3(7, 8, HeightLayer.UNDERGROUND),
                    P3(7, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            // 地面层
            { x: 1, y: 1, z: HeightLayer.GROUND }, { x: 3, y: 1, z: HeightLayer.GROUND },
            { x: 5, y: 1, z: HeightLayer.GROUND }, { x: 7, y: 1, z: HeightLayer.GROUND },
            { x: 1, y: 5, z: HeightLayer.GROUND }, { x: 3, y: 5, z: HeightLayer.GROUND },
            { x: 5, y: 5, z: HeightLayer.GROUND }, { x: 7, y: 5, z: HeightLayer.GROUND },
            { x: 9, y: 5, z: HeightLayer.GROUND },
            { x: 1, y: 8, z: HeightLayer.GROUND }, { x: 3, y: 8, z: HeightLayer.GROUND },
            { x: 5, y: 8, z: HeightLayer.GROUND }, { x: 7, y: 8, z: HeightLayer.GROUND },
            { x: 9, y: 8, z: HeightLayer.GROUND },
            // 空中层
            { x: 2, y: 2, z: HeightLayer.AIR }, { x: 5, y: 2, z: HeightLayer.AIR },
            { x: 8, y: 3, z: HeightLayer.AIR },
            // 地下层
            { x: 4, y: 6, z: HeightLayer.UNDERGROUND }, { x: 6, y: 6, z: HeightLayer.UNDERGROUND },
            { x: 4, y: 9, z: HeightLayer.UNDERGROUND }, { x: 6, y: 9, z: HeightLayer.UNDERGROUND },
        ],
    },
    // ─ L6：三层立体战场 ───────────────────────────────
    {
        id: 6,
        core: CORE,
        mechanics: ['三层独立路线', '全高度作战'],
        routes: [
            // 地面路
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 5, HeightLayer.GROUND),
                    P3(5, 5, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 空中路
            {
                points: [
                    P3(-1, 1, HeightLayer.AIR),
                    P3(3, 1, HeightLayer.AIR),
                    P3(3, 5, HeightLayer.AIR),
                    P3(8, 5, HeightLayer.AIR),
                    P3(8, 9, HeightLayer.AIR),
                    P3(10, 9, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 地下路
            {
                points: [
                    P3(2, 3, HeightLayer.UNDERGROUND),
                    P3(2, 7, HeightLayer.UNDERGROUND),
                    P3(8, 7, HeightLayer.UNDERGROUND),
                    P3(8, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 3, y: 2, z: HeightLayer.GROUND }, { x: 1, y: 3, z: HeightLayer.GROUND },
            { x: 6, y: 6, z: HeightLayer.GROUND }, { x: 7, y: 6, z: HeightLayer.GROUND },
            { x: 6, y: 7, z: HeightLayer.GROUND }, { x: 7, y: 7, z: HeightLayer.GROUND },
            { x: 1, y: 1, z: HeightLayer.AIR }, { x: 4, y: 2, z: HeightLayer.AIR },
            { x: 5, y: 4, z: HeightLayer.AIR }, { x: 9, y: 6, z: HeightLayer.AIR },
            { x: 3, y: 5, z: HeightLayer.UNDERGROUND }, { x: 5, y: 5, z: HeightLayer.UNDERGROUND },
            { x: 3, y: 8, z: HeightLayer.UNDERGROUND }, { x: 5, y: 8, z: HeightLayer.UNDERGROUND },
            { x: 7, y: 8, z: HeightLayer.UNDERGROUND }, { x: 9, y: 8, z: HeightLayer.UNDERGROUND },
        ],
    },
    // ── L7：折叠 + 时间相位 ────────────────────────────
    {
        id: 7,
        core: CORE,
        mechanics: ['折叠线', '时间相位', '双重维度'],
        routes: [
            // 相位 α 路线
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 4, HeightLayer.GROUND),
                    P3(5, 4, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 相位 β 路线
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 6, HeightLayer.GROUND),
                    P3(5, 6, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 空中路（始终存在）
            {
                points: [
                    P3(-1, 2, HeightLayer.AIR),
                    P3(5, 2, HeightLayer.AIR),
                    P3(5, 8, HeightLayer.AIR),
                    P3(10, 8, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 3, y: 2, z: HeightLayer.GROUND }, { x: 1, y: 3, z: HeightLayer.GROUND },
            { x: 6, y: 5, z: HeightLayer.GROUND }, { x: 7, y: 5, z: HeightLayer.GROUND },
            { x: 8, y: 5, z: HeightLayer.GROUND }, { x: 6, y: 7, z: HeightLayer.GROUND },
            { x: 7, y: 7, z: HeightLayer.GROUND }, { x: 8, y: 7, z: HeightLayer.GROUND },
            { x: 9, y: 2, z: HeightLayer.GROUND }, { x: 9, y: 4, z: HeightLayer.GROUND },
            { x: 2, y: 1, z: HeightLayer.AIR }, { x: 4, y: 1, z: HeightLayer.AIR },
            { x: 6, y: 3, z: HeightLayer.AIR }, { x: 6, y: 6, z: HeightLayer.AIR },
            { x: 8, y: 9, z: HeightLayer.AIR },
        ],
        foldLines: [
            { y: 4, active: true, foldFactor: 0.3, cycleDuration: 15 },
            { y: 6, active: false, foldFactor: 0.3, cycleDuration: 15 },
        ],
        timePhases: [
            { id: 'alpha', activeRoutes: [0, 2], duration: 20 },
            { id: 'beta', activeRoutes: [1, 2], duration: 20 },
        ],
    },
    // ── L8：莫比乌斯 + 四维 ────────────────────────────
    {
        id: 8,
        core: CORE,
        mechanics: ['莫比乌斯翻转', '四维内外层'],
        topology: 'mobius',
        routes: [
            // 外层路
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 5, HeightLayer.GROUND),
                    P3(5, 5, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 内层路（四维）
            {
                points: [
                    P3(3, 3, HeightLayer.GROUND),
                    P3(3, 7, HeightLayer.GROUND),
                    P3(7, 7, HeightLayer.GROUND),
                    P3(7, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ],
                speedMult: 2.0,
            },
            // 空中路
            {
                points: [
                    P3(-1, 1, HeightLayer.AIR),
                    P3(5, 1, HeightLayer.AIR),
                    P3(5, 5, HeightLayer.AIR),
                    P3(10, 5, HeightLayer.AIR),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 2, z: HeightLayer.GROUND }, { x: 2, y: 2, z: HeightLayer.GROUND },
            { x: 3, y: 2, z: HeightLayer.GROUND }, { x: 1, y: 3, z: HeightLayer.GROUND },
            { x: 6, y: 6, z: HeightLayer.GROUND }, { x: 7, y: 6, z: HeightLayer.GROUND },
            { x: 8, y: 6, z: HeightLayer.GROUND }, { x: 6, y: 8, z: HeightLayer.GROUND },
            { x: 7, y: 8, z: HeightLayer.GROUND }, { x: 8, y: 8, z: HeightLayer.GROUND },
            { x: 4, y: 4, z: HeightLayer.GROUND }, { x: 4, y: 5, z: HeightLayer.GROUND },
            { x: 6, y: 4, z: HeightLayer.GROUND }, { x: 6, y: 5, z: HeightLayer.GROUND },
            { x: 2, y: 1, z: HeightLayer.AIR }, { x: 4, y: 1, z: HeightLayer.AIR },
            { x: 6, y: 3, z: HeightLayer.AIR }, { x: 8, y: 3, z: HeightLayer.AIR },
            { x: 9, y: 7, z: HeightLayer.AIR },
        ],
    },
    // ── L9：全维度混乱 ─────────────────────────────────
    {
        id: 9,
        core: CORE,
        mechanics: ['折叠', '相位', '三层', '全维度'],
        topology: 'tesseract',
        routes: [
            // 地面路 α
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 3, HeightLayer.GROUND),
                    P3(5, 3, HeightLayer.GROUND),
                    P3(5, 7, HeightLayer.GROUND),
                    P3(10, 7, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 地面路 β
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 4, HeightLayer.GROUND),
                    P3(5, 4, HeightLayer.GROUND),
                    P3(5, 8, HeightLayer.GROUND),
                    P3(0, 8, HeightLayer.GROUND),
                    P3(0, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 空中路
            {
                points: [
                    P3(-1, 2, HeightLayer.AIR),
                    P3(4, 2, HeightLayer.AIR),
                    P3(4, 6, HeightLayer.AIR),
                    P3(9, 6, HeightLayer.AIR),
                    P3(9, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 地下路
            {
                points: [
                    P3(2, 5, HeightLayer.UNDERGROUND),
                    P3(2, 9, HeightLayer.UNDERGROUND),
                    P3(8, 9, HeightLayer.UNDERGROUND),
                    P3(8, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            }
        ],
        slots: [
            { x: 1, y: 1, z: HeightLayer.GROUND }, { x: 2, y: 1, z: HeightLayer.GROUND },
            { x: 3, y: 1, z: HeightLayer.GROUND }, { x: 1, y: 2, z: HeightLayer.GROUND },
            { x: 6, y: 4, z: HeightLayer.GROUND }, { x: 7, y: 4, z: HeightLayer.GROUND },
            { x: 8, y: 4, z: HeightLayer.GROUND }, { x: 6, y: 5, z: HeightLayer.GROUND },
            { x: 1, y: 6, z: HeightLayer.GROUND }, { x: 2, y: 6, z: HeightLayer.GROUND },
            { x: 3, y: 6, z: HeightLayer.GROUND }, { x: 1, y: 7, z: HeightLayer.GROUND },
            { x: 9, y: 5, z: HeightLayer.GROUND }, { x: 9, y: 8, z: HeightLayer.GROUND },
            { x: 2, y: 1, z: HeightLayer.AIR }, { x: 5, y: 1, z: HeightLayer.AIR },
            { x: 5, y: 4, z: HeightLayer.AIR }, { x: 8, y: 4, z: HeightLayer.AIR },
            { x: 8, y: 8, z: HeightLayer.AIR },
            { x: 3, y: 6, z: HeightLayer.UNDERGROUND }, { x: 5, y: 6, z: HeightLayer.UNDERGROUND },
            { x: 3, y: 8, z: HeightLayer.UNDERGROUND }, { x: 5, y: 8, z: HeightLayer.UNDERGROUND },
            { x: 7, y: 8, z: HeightLayer.UNDERGROUND },
        ],
        foldLines: [
            { y: 3, active: true, foldFactor: 0.4, cycleDuration: 12 },
            { y: 7, active: false, foldFactor: 0.4, cycleDuration: 12 },
        ],
        timePhases: [
            { id: 'alpha', activeRoutes: [0, 2, 3], duration: 18 },
            { id: 'beta', activeRoutes: [1, 2, 3], duration: 18 },
        ],
    },
    // ── L10：超维核心（Boss 关）────────────────────────
    {
        id: 10,
        core: CORE,
        mechanics: ['全维度', 'Boss 多维战', '四入口'],
        topology: 'tesseract',
        routes: [
            // 外层路 1
            {
                points: [
                    P3(0, 0, HeightLayer.GROUND),
                    P3(0, 4, HeightLayer.GROUND),
                    P3(5, 4, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 外层路 2
            {
                points: [
                    P3(10, 0, HeightLayer.GROUND),
                    P3(10, 5, HeightLayer.GROUND),
                    P3(5, 5, HeightLayer.GROUND),
                    P3(5, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 空中路
            {
                points: [
                    P3(-1, 1, HeightLayer.AIR),
                    P3(5, 1, HeightLayer.AIR),
                    P3(5, 5, HeightLayer.AIR),
                    P3(10, 5, HeightLayer.AIR),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 地下路
            {
                points: [
                    P3(2, 3, HeightLayer.UNDERGROUND),
                    P3(2, 7, HeightLayer.UNDERGROUND),
                    P3(8, 7, HeightLayer.UNDERGROUND),
                    P3(8, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ]
            },
            // 内层路（四维加速）
            {
                points: [
                    P3(3, 3, HeightLayer.GROUND),
                    P3(3, 6, HeightLayer.GROUND),
                    P3(7, 6, HeightLayer.GROUND),
                    P3(7, 10, HeightLayer.GROUND),
                    P3(10, 10, HeightLayer.GROUND),
                ],
                speedMult: 2.5,
            }
        ],
        slots: [
            { x: 1, y: 1, z: HeightLayer.GROUND }, { x: 2, y: 1, z: HeightLayer.GROUND },
            { x: 3, y: 1, z: HeightLayer.GROUND }, { x: 1, y: 2, z: HeightLayer.GROUND },
            { x: 2, y: 2, z: HeightLayer.GROUND }, { x: 3, y: 2, z: HeightLayer.GROUND },
            { x: 6, y: 5, z: HeightLayer.GROUND }, { x: 7, y: 5, z: HeightLayer.GROUND },
            { x: 8, y: 5, z: HeightLayer.GROUND }, { x: 6, y: 6, z: HeightLayer.GROUND },
            { x: 7, y: 6, z: HeightLayer.GROUND }, { x: 8, y: 6, z: HeightLayer.GROUND },
            { x: 6, y: 8, z: HeightLayer.GROUND }, { x: 7, y: 8, z: HeightLayer.GROUND },
            { x: 8, y: 8, z: HeightLayer.GROUND }, { x: 9, y: 8, z: HeightLayer.GROUND },
            { x: 1, y: 1, z: HeightLayer.AIR }, { x: 3, y: 1, z: HeightLayer.AIR },
            { x: 6, y: 2, z: HeightLayer.AIR }, { x: 8, y: 3, z: HeightLayer.AIR },
            { x: 9, y: 6, z: HeightLayer.AIR }, { x: 9, y: 9, z: HeightLayer.AIR },
            { x: 3, y: 5, z: HeightLayer.UNDERGROUND }, { x: 5, y: 5, z: HeightLayer.UNDERGROUND },
            { x: 3, y: 8, z: HeightLayer.UNDERGROUND }, { x: 5, y: 8, z: HeightLayer.UNDERGROUND },
            { x: 7, y: 8, z: HeightLayer.UNDERGROUND }, { x: 9, y: 8, z: HeightLayer.UNDERGROUND },
            { x: 4, y: 4, z: HeightLayer.GROUND }, { x: 4, y: 5, z: HeightLayer.GROUND },
            { x: 6, y: 4, z: HeightLayer.GROUND },
        ],
        foldLines: [
            { y: 4, active: true, foldFactor: 0.3, cycleDuration: 10 },
            { y: 6, active: false, foldFactor: 0.3, cycleDuration: 10 },
        ],
        timePhases: [
            { id: 'alpha', activeRoutes: [0, 2, 3, 4], duration: 15 },
            { id: 'beta', activeRoutes: [1, 2, 3, 4], duration: 15 },
        ],
    },
];
export const MULTI_WAVES = [
    // L1
    [{ type: 'ground', count: 5 }],
    [{ type: 'ground', count: 8 }, { type: 'fast', count: 3 }],
    [{ type: 'ground', count: 5 }, { type: 'flyer', count: 3 }],
    [{ type: 'fast', count: 10 }, { type: 'heavy', count: 2 }],
    [{ type: 'flyer', count: 6 }, { type: 'ground', count: 5 }],
    // L2
    [{ type: 'burrower', count: 8 }, { type: 'fast', count: 5 }],
    [{ type: 'heavy', count: 5 }, { type: 'flyer', count: 5 }, { type: 'burrower', count: 3 }],
    [{ type: 'ground', count: 15 }, { type: 'fast', count: 10 }],
    [{ type: 'flyer', count: 10 }, { type: 'heavy', count: 5 }, { type: 'burrower', count: 5 }],
    // L3-L10 递增...
    [{ type: 'phase_walker', count: 5 }, { type: 'flyer', count: 8 }, { type: 'heavy', count: 3 }],
    [{ type: 'ground', count: 20 }, { type: 'fast', count: 15 }, { type: 'flyer', count: 5 }],
    [{ type: 'heavy', count: 10 }, { type: 'phase_walker', count: 8 }, { type: 'burrower', count: 5 }],
    [{ type: 'flyer', count: 15 }, { type: 'burrower', count: 10 }, { type: 'fast', count: 10 }],
    [{ type: 'ground', count: 25 }, { type: 'heavy', count: 8 }, { type: 'flyer', count: 10 }],
    [{ type: 'phase_walker', count: 10 }, { type: 'flyer', count: 12 }, { type: 'burrower', count: 8 }],
    [{ type: 'heavy', count: 15 }, { type: 'fast', count: 20 }, { type: 'phase_walker', count: 5 }],
    [{ type: 'flyer', count: 20 }, { type: 'burrower', count: 12 }, { type: 'heavy', count: 8 }],
    [{ type: 'ground', count: 30 }, { type: 'fast', count: 20 }, { type: 'flyer', count: 10 }, { type: 'burrower', count: 8 }],
    [{ type: 'boss_multidim', count: 1 }, { type: 'heavy', count: 10 }, { type: 'flyer', count: 15 }, { type: 'phase_walker', count: 8 }],
];
//# sourceMappingURL=MultiDimensionConfig.js.map