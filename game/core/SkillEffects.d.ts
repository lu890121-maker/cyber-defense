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
import { Tower } from '../entities/Tower.js';
export interface ParsedSkillEffect {
    kind: string;
    /** 数值参数；无参数技能为 0 */
    value: number;
    /** 单位：'%' | 's' | 'x' | '' */
    unit: string;
    /** 原始字符串，用于报错信息 */
    raw: string;
}
/** 解析 effect 字符串。格式非法返回 null。 */
export declare function parseSkillEffect(effect: string): ParsedSkillEffect | null;
type SkillHandler = (tower: Tower, p: ParsedSkillEffect) => void;
/**
 * kind → 效果。**新增技能时必须在这里加一条**，
 * 否则 verify_skills.mjs 会把它报成"注册表里没有的死技能"。
 */
export declare const SKILL_EFFECT_HANDLERS: Record<string, SkillHandler>;
/** 所有已注册的 kind（工具用） */
export declare const REGISTERED_EFFECT_KINDS: string[];
/** 把一个（可能含 `;` 的）effect 拆成单个效果列表 */
export declare function splitSkillEffect(effect: string): string[];
/**
 * 把技能效果应用到防御塔上。
 * @returns true = 全部生效；false = 有未注册 / 格式非法的效果（调用方必须处理）
 */
export declare function applySkillEffect(tower: Tower, effect: string): boolean;
/**
 * 按技能 id 列表重新应用一遍效果。
 *
 * 用途：合成继承。合成时新塔是 new 出来的（技能修饰物全空），如果直接把
 * 两侧父塔的 skillMods 拷过来，乘区型字段（rangeMult、poisonDamageMult…）
 * 会被叠两次 —— 一座 range+50% 的塔合成后会变成 +125%。
 * 正确做法是记住"学过哪些技能 id"，按 id 重新各应用一次。
 */
export declare function reapplyLearnedSkills(tower: Tower, learnedIds: string[]): number;
export {};
