/**
 * 指挥官存档 v2 —— 纯函数模块（只依赖 localStorage 与配置/实体，便于单测）
 *
 * ── 存档语义（落地由 GameManager 负责，这里只管序列化 / 反序列化）──
 * 存档 = 「当前关卡开始时的指挥官状态」+ 已解锁进度。
 * 关卡内赚的钱、买的塔、掉的血只在内存，**不写盘**：
 *   · 进关写一次盘 = checkpoint；
 *   · 过关把「过关后的资产」写盘（作为下一关 checkpoint），并解锁下一关；
 *   · 闯关失败不写盘 → 重开从存档重建 = 自然回到闯关前状态；
 *   · 玩家中途刷新页面也回到闯关前状态（刻意设计，防刷钱）。
 *
 * ── 为什么塔要「快照 + 重建」而不是存实例 ──
 * damage / range / attackInterval / skillMods 都是可叠加的运行时状态，
 * 直接 JSON 化再赋值会让乘区被二次乘（applySkillMod 是叠加式）。
 * 塔的基础数值由 type + level + rarity 确定性重算；技能只记 id，
 * 重建时用 reapplyLearnedSkills 按 id 重放一次效果 —— 少了这一步，
 * 技能会「面板上有、实战静默失效」。
 */
import { GAME_CONSTANTS, TowerType, Rarity, TOWER_CONFIGS, MAX_TOWER_LEVEL, getLevelCount } from '../config/GameConfig.js';
import { Tower, DEFAULT_GLOBAL_STATE, SKILL_VARIANT_COUNT } from '../entities/Tower.js';
import { reapplyLearnedSkills } from './SkillEffects.js';
export const SAVE_KEY = 'cyber-defense.save';
/** 合成区格数（见 GameManager.mergeAreaSlots），用于校验负 slotIndex 下界 */
const MERGE_SLOT_COUNT = 6;
// ── 小工具：全部对 unknown 做防御，坏档绝不抛错 ──
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function finiteOr(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clampNumber(v, lo, hi, fallback) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return fallback;
    return Math.max(lo, Math.min(hi, v));
}
function clampInt(v, lo, hi, fallback) {
    return Math.round(clampNumber(v, lo, hi, fallback));
}
/** 深拷贝两份「按塔型」倍率表，避免存档对象与运行时 state 共享引用 */
export function cloneGlobalState(gs) {
    return {
        ...gs,
        towerDamageMultipliers: { ...gs.towerDamageMultipliers },
        towerSpeedMultipliers: { ...gs.towerSpeedMultipliers }
    };
}
function cleanTowerMultipliers(v) {
    const out = {};
    if (!isPlainObject(v))
        return out;
    const valid = new Set(Object.values(TowerType));
    for (const [k, val] of Object.entries(v)) {
        if (valid.has(k) && typeof val === 'number' && Number.isFinite(val)) {
            out[k] = val;
        }
    }
    return out;
}
function normalizeGlobalState(raw) {
    const d = DEFAULT_GLOBAL_STATE;
    if (!isPlainObject(raw))
        return cloneGlobalState(d);
    return {
        damageMultiplier: finiteOr(raw.damageMultiplier, d.damageMultiplier),
        speedMultiplier: finiteOr(raw.speedMultiplier, d.speedMultiplier),
        frostSlowBonus: finiteOr(raw.frostSlowBonus, d.frostSlowBonus),
        electricChainBonus: finiteOr(raw.electricChainBonus, d.electricChainBonus),
        poisonDurationBonus: finiteOr(raw.poisonDurationBonus, d.poisonDurationBonus),
        bombRadiusMultiplier: finiteOr(raw.bombRadiusMultiplier, d.bombRadiusMultiplier),
        anesthesiaStunBonus: finiteOr(raw.anesthesiaStunBonus, d.anesthesiaStunBonus),
        mergeBonusDamage: finiteOr(raw.mergeBonusDamage, d.mergeBonusDamage),
        fusionBonusChance: finiteOr(raw.fusionBonusChance, d.fusionBonusChance),
        towerDamageMultipliers: cleanTowerMultipliers(raw.towerDamageMultipliers),
        towerSpeedMultipliers: cleanTowerMultipliers(raw.towerSpeedMultipliers)
    };
}
/** 校验并清洗一张塔快照；非法返回 null（调用方跳过而不是抛错） */
function normalizeTowerSnapshot(v) {
    if (!isPlainObject(v))
        return null;
    const type = v.type;
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(TOWER_CONFIGS, type))
        return null;
    const level = v.level;
    if (typeof level !== 'number' || !Number.isInteger(level) ||
        level < 1 || level > MAX_TOWER_LEVEL)
        return null;
    const rarity = v.rarity;
    if (typeof rarity !== 'string' || !Object.values(Rarity).includes(rarity))
        return null;
    if (!Array.isArray(v.learnedSkills))
        return null;
    return {
        type,
        level,
        rarity,
        slotIndex: clampInt(v.slotIndex, -MERGE_SLOT_COUNT, 9999, 0),
        x: finiteOr(v.x, 0),
        y: finiteOr(v.y, 0),
        skillVariant: clampInt(v.skillVariant, 0, SKILL_VARIANT_COUNT - 1, 0),
        learnedSkills: v.learnedSkills.filter((s) => typeof s === 'string')
    };
}
/** 构造一份「全新指挥官」默认档（无存档时用它开局） */
export function createDefaultCommanderSave() {
    return {
        version: 2,
        maxUnlockedLevel: 0,
        currentLevelIndex: 0,
        gold: GAME_CONSTANTS.INITIAL_GOLD,
        lives: GAME_CONSTANTS.INITIAL_LIVES,
        towers: [],
        globalUpgradeState: cloneGlobalState(DEFAULT_GLOBAL_STATE),
        unlockedSlotCount: GAME_CONSTANTS.INITIAL_UNLOCKED_SLOTS,
        timestamp: Date.now()
    };
}
/**
 * 读档：try/catch + 逐字段校验。
 * 兼容旧档（没有 version===2）：maxUnlockedLevel = clamp(currentLevelIndex,0,8)、
 * towers=[]、globalUpgradeState=DEFAULT_GLOBAL_STATE，其余字段保留旧值。
 */
export function readCommanderSave() {
    let raw;
    try {
        const s = localStorage.getItem(SAVE_KEY);
        if (!s)
            return null;
        raw = JSON.parse(s);
    }
    catch (e) {
        console.warn('[CommanderSave] 读档失败，按无档处理', e);
        return null;
    }
    if (!isPlainObject(raw))
        return null;
    const maxLevel = Math.max(0, getLevelCount() - 1);
    const isV2 = raw.version === 2;
    const currentLevelIndex = clampInt(raw.currentLevelIndex, 0, maxLevel, 0);
    const maxUnlockedLevel = isV2
        ? clampInt(raw.maxUnlockedLevel, 0, maxLevel, currentLevelIndex)
        : currentLevelIndex; // 旧档：直接按当前关解锁
    let towers = [];
    if (isV2 && Array.isArray(raw.towers)) {
        for (const t of raw.towers) {
            const clean = normalizeTowerSnapshot(t);
            if (clean)
                towers.push(clean);
            else
                console.warn('[CommanderSave] 跳过非法塔快照', t);
        }
    }
    // 兼容旧档：如果没有 unlockedSlotCount，使用默认初始值
    let unlockedSlotCount;
    if (isV2 && typeof raw.unlockedSlotCount === 'number') {
        unlockedSlotCount = clampInt(raw.unlockedSlotCount, GAME_CONSTANTS.INITIAL_UNLOCKED_SLOTS, 9999, GAME_CONSTANTS.INITIAL_UNLOCKED_SLOTS);
    }
    else {
        // 旧档或无效数据：使用初始解锁数
        unlockedSlotCount = GAME_CONSTANTS.INITIAL_UNLOCKED_SLOTS;
    }
    return {
        version: 2,
        maxUnlockedLevel: Math.max(currentLevelIndex, maxUnlockedLevel),
        currentLevelIndex,
        gold: clampInt(raw.gold, 0, 1e12, GAME_CONSTANTS.INITIAL_GOLD),
        lives: clampInt(raw.lives, 0, 1e6, GAME_CONSTANTS.INITIAL_LIVES),
        towers,
        globalUpgradeState: isV2
            ? normalizeGlobalState(raw.globalUpgradeState)
            : cloneGlobalState(DEFAULT_GLOBAL_STATE),
        unlockedSlotCount,
        timestamp: finiteOr(raw.timestamp, Date.now())
    };
}
export function writeCommanderSave(d) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    }
    catch (e) {
        console.warn('[CommanderSave] 写档失败', e);
    }
}
export function clearCommanderSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    }
    catch (e) {
        console.warn('[CommanderSave] 清档失败', e);
    }
}
/** 用 getter 取塔的「可重建」字段；getLearnedSkills() 再 slice 一次拿副本 */
export function snapshotTower(t) {
    return {
        type: t.getType(),
        level: t.getLevel(),
        rarity: t.getRarity(),
        slotIndex: t.getSlotIndex(),
        x: t.getX(),
        y: t.getY(),
        skillVariant: t.getSkillVariant(),
        learnedSkills: t.getLearnedSkills().slice()
    };
}
/**
 * 重建一座塔。顺序错会静默失效：
 *   1. new Tower(...) —— 构造内已按序做 applyRarityGrowth → applyLevelGrowth，
 *      并自动分配 skillVariant（towerSerial 轮换），basetype 自带技能也已就位
 *   2. setSkillVariant —— 覆盖构造里自动轮换的变体
 *   3. learnSkill(id) —— 只记 id，不落效果
 *   4. reapplyLearnedSkills —— 按 id 反查 effect 重放（关键！）
 *   5. applyGlobalUpgradeState —— 绝对值设置，幂等
 *   6. 补 mergeBonusDamage / fusionBonusChance（applyGlobalUpgradeState 不管这两项）
 * 不在这里注入 vfx：由 GameManager 的 injectVfxSink() 统一处理。
 * 非法快照返回 null（由调用方跳过），保证坏档不会让整个进关流程崩溃。
 */
export function rebuildTower(d, gs) {
    const c = normalizeTowerSnapshot(d);
    if (!c) {
        console.warn('[CommanderSave] rebuildTower 跳过非法快照', d);
        return null;
    }
    const t = new Tower(c.type, c.x, c.y, c.slotIndex, c.level, c.rarity);
    t.setSkillVariant(c.skillVariant);
    for (const id of c.learnedSkills)
        t.learnSkill(id);
    reapplyLearnedSkills(t, c.learnedSkills);
    t.applyGlobalUpgradeState(gs);
    if (gs.mergeBonusDamage > 0)
        t.addMergeBonus(gs.mergeBonusDamage);
    if (gs.fusionBonusChance > 0)
        t.setFusionBonusChance(gs.fusionBonusChance);
    return t;
}
//# sourceMappingURL=CommanderSave.js.map