/**
 * 技能效果系统
 *
 * 背景：旧实现是 GameManager.applySkillEffect 里一串
 * `if (effect.includes('speed+')) ... else if ...`，新增技能时只要忘了加分支，
 * 那个技能就"UI 上能选、实际什么都不发生"。项目里曾有 18/32 个技能是这种死技能。
 *
 * 现在改成：
 *   1. effect 字符串在这里**一次性解析**成 (kind, value, unit)
 *   2. kind 必须在 HANDLERS 里注册，否则直接返回 null（调用方报警）
 *   3. handlers/verify_skills.mjs 可以拿着 TOWER_SKILLS 全表逐个 kind 校验，
 *      不再需要人肉比对"这个 effect 有没有对应的 if 分支"
 *
 * 约定：`effect` 的格式是 `<kind>[+<value><unit>]`，例如
 *   speed+50%   攻速 +50%
 *   stun+1s     眩晕时间 +1 秒
 *   crit+5x     暴击伤害设为 5 倍
 *   chain+2     弹射次数 +2
 *   napalm      无参数布尔技能
 *
 * 多个效果可以用 `;` 连写（用于 Lv3 的"大招"型技能，一个技能同时改两件事）：
 *   speed+60%;multi+1   攻速 +60% 且额外攻击 1 个目标
 */
import { TOWER_SKILLS } from '../config/GameConfig.js';
const EFFECT_RE = /^([a-z_]+)(?:\+([\d.]+)(%|s|x)?)?$/;
/** 解析 effect 字符串。格式非法返回 null。 */
export function parseSkillEffect(effect) {
    const m = EFFECT_RE.exec(effect.trim());
    if (!m)
        return null;
    return {
        kind: m[1],
        value: m[2] !== undefined ? parseFloat(m[2]) : 0,
        unit: m[3] || '',
        raw: effect
    };
}
/** 减速效果上限（与原 setSlowEffect 的 clamp 一致） */
const SLOW_CAP = 0.9;
/**
 * kind → 效果。**新增技能时必须在这里加一条**，
 * 否则 verify_skills.mjs 会把它报成"注册表里没有的死技能"。
 */
export const SKILL_EFFECT_HANDLERS = {
    // ── 攻速 / 减速 ──
    speed: (t, p) => t.setSpeedMultiplier(t.getSpeedMultiplier() * (1 + p.value / 100)),
    slow: (t, p) => t.setSlowEffect(Math.min(SLOW_CAP, t.getSlowEffect() + p.value / 100)),
    // freeze+30% → 冰冻按减速处理（同一套 slow 状态，上限也一致）
    freeze: (t, p) => t.setSlowEffect(Math.min(SLOW_CAP, t.getSlowEffect() + p.value / 100)),
    // freeze_duration+1s → 减速/冰冻持续时间 +1 秒
    freeze_duration: (t, p) => t.setSlowDuration(t.getSlowDuration() + p.value),
    // damage+50% → 单塔伤害倍率（与全局强化分乘区，重复学按乘算叠加）
    damage: (t, p) => t.setDamageMultiplier(t.getDamageMultiplier() * (1 + p.value / 100)),
    // ── 弹射 / 眩晕 / 毒素 / 爆炸 ──
    chain: (t, p) => t.setChainCount(t.getChainCount() + p.value),
    'chain_damage': (t, p) => t.applySkillMod({ chainDamageRatio: p.value / 100 }),
    stun: (t, p) => {
        if (p.unit === 's') {
            t.setStunDuration(t.getStunDuration() + p.value);
        }
        else {
            // stun+20% → 眩晕触发概率 +20%
            t.applySkillMod({ stunChanceBonus: p.value / 100 });
        }
    },
    stun_spread: (t) => t.applySkillMod({ stunSpread: true }),
    poison: (t, p) => {
        // poison+100% → 毒素伤害翻倍
        // （旧实现误改成加持续时间；不带数值的 poison_spread 是另一个 kind，不在这里处理）
        t.applySkillMod({ poisonDamageMult: 1 + p.value / 100 });
    },
    poison_spread: (t) => t.applySkillMod({ poisonSpread: true }),
    // aoe_poison → 毒素随命中扩散到主目标周围（与「瘟疫扩散」同一实现）
    aoe_poison: (t) => t.applySkillMod({ poisonSpread: true }),
    burn: (t, p) => t.applySkillMod({ burnDamageMult: 1 + p.value / 100 }),
    aoe_slow: (t) => t.applySkillMod({ aoeSlow: true }),
    range: (t, p) => t.applySkillMod({ rangeMult: 1 + p.value / 100 }),
    explosion: (t, p) => t.setExplosionRadius(t.getExplosionRadius() * (1 + p.value / 100)),
    heavy: (t) => {
        // 重型炸弹：爆炸范围 +50%，伤害 +30%
        t.setExplosionRadius(t.getExplosionRadius() * 1.5);
        t.setDamageMultiplier(t.getDamageMultiplier() * 1.3);
    },
    cluster: (t, p) => t.applySkillMod({ clusterBombs: p.value > 0 ? p.value : 3 }),
    napalm: (t) => t.applySkillMod({ napalm: true }),
    // ── 破甲 ──
    pierce: (t, p) => t.applySkillMod({
        // pierce+30% → 穿透 30%；不带数值的 pierce → 穿透 50%
        armorPierce: p.value > 0 ? p.value / 100 : 0.5
    }),
    armor_break: (t) => t.applySkillMod({ shieldCorrosion: 0.25 }),
    // pierce_all → 完全无视护甲（穿透率拉满 100%）
    pierce_all: (t) => t.applySkillMod({ armorPierce: 1 }),
    // ── debuff ──
    mark: (t, p) => t.applySkillMod({ markBonus: p.value / 100 }),
    weak: (t, p) => t.applySkillMod({ weakBonus: p.value / 100 }),
    vuln: (t, p) => t.applySkillMod({ vulnBonus: p.value / 100 }),
    crit_mark: (t) => t.applySkillMod({ critVsMarkedBonus: 0.5 }),
    // ── 输出形态 ──
    multi: (t, p) => t.applySkillMod({ multiShot: p.value }),
    crit: (t, p) => {
        if (p.unit === 'x') {
            // crit+5x → 暴击伤害设为 5 倍（"提升至"）
            if (p.value > t.getSkillMods().critDamage)
                t.applySkillMod({ critDamage: p.value });
        }
        else {
            // crit+25% → 暴击率 +25%
            t.applySkillMod({ critChance: p.value / 100 });
        }
    },
    shatter: (t, p) => t.applySkillMod({ shatterMult: p.value / 100 }),
    first: (t, p) => t.applySkillMod({ firstStrikeMult: 1 + p.value / 100 }),
    focus: (t) => t.applySkillMod({ focusRamp: true }),
    split: (t) => t.applySkillMod({ beamSplit: 2 }),
    vanish: (t) => t.applySkillMod({ vanishSpeed: true }),
    pull: (t, p) => t.applySkillMod({ pullMult: 1 + p.value / 100 })
};
/** 所有已注册的 kind（工具用） */
export const REGISTERED_EFFECT_KINDS = Object.keys(SKILL_EFFECT_HANDLERS);
/** 把一个（可能含 `;` 的）effect 拆成单个效果列表 */
export function splitSkillEffect(effect) {
    return effect.split(';').map(s => s.trim()).filter(Boolean);
}
/**
 * 把技能效果应用到防御塔上。
 * @returns true = 全部生效；false = 有未注册 / 格式非法的效果（调用方必须处理）
 */
export function applySkillEffect(tower, effect) {
    const parts = splitSkillEffect(effect);
    if (parts.length === 0) {
        console.error(`[SkillEffects] 空 effect: "${effect}"`);
        return false;
    }
    let allOk = true;
    for (const part of parts) {
        if (!applySingleSkillEffect(tower, part))
            allOk = false;
    }
    return allOk;
}
function applySingleSkillEffect(tower, effect) {
    const parsed = parseSkillEffect(effect);
    if (!parsed) {
        console.error(`[SkillEffects] 无法解析 effect: "${effect}"`);
        return false;
    }
    const handler = SKILL_EFFECT_HANDLERS[parsed.kind];
    if (!handler) {
        console.error(`[SkillEffects] 未注册的 effect kind: "${parsed.kind}"（来自 "${effect}"）`);
        return false;
    }
    handler(tower, parsed);
    return true;
}
/**
 * 按技能 id 列表重新应用一遍效果。
 *
 * 用途：合成继承。合成时新塔是 new 出来的（技能修饰物全空），如果直接把
 * 两侧父塔的 skillMods 拷过来，乘区型字段（rangeMult、poisonDamageMult…）
 * 会被叠两次 —— 一座 range+50% 的塔合成后会变成 +125%。
 * 正确做法是记住"学过哪些技能 id"，按 id 重新各应用一次。
 */
export function reapplyLearnedSkills(tower, learnedIds) {
    let applied = 0;
    for (const id of learnedIds) {
        let done = false;
        for (const entry of TOWER_SKILLS) {
            const skill = entry.skills.find(s => s.id === id);
            if (skill) {
                if (applySkillEffect(tower, skill.effect))
                    applied++;
                done = true;
                break;
            }
        }
        if (!done)
            console.error(`[SkillEffects] 已学技能 id 在 TOWER_SKILLS 里找不到：${id}`);
    }
    return applied;
}
//# sourceMappingURL=SkillEffects.js.map