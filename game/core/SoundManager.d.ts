/**
 * 游戏音频系统 v3 —— 卡通赛博朋克风格
 * 霓虹壁垒
 *
 * 设计理念：
 * - 全合成音效，零外部依赖
 * - 明快Q弹的卡通感 + 赛博电子质感
 * - 长时间游玩不累耳（控制音量、避免刺耳高频）
 * - 完整的状态管理和性能优化
 */
/** 音频总线 */
export declare enum AudioBus {
    MASTER = "master",
    MUSIC = "music",
    SFX = "sfx",
    UI = "ui",
    AMBIENCE = "ambience"
}
/** 声部优先级 */
export declare enum SoundPriority {
    AMBIENT = 0,
    LOW = 1,
    NORMAL = 2,
    HIGH = 3,
    CRITICAL = 4
}
/** 音效播放参数 */
export interface SoundOptions {
    volume?: number;
    pitch?: number;
    pitchJitter?: number;
    pan?: number;
    priority?: SoundPriority;
    bus?: AudioBus;
}
/** BGM 曲目 */
export type BgmTrack = 'menu' | 'battle' | 'boss';
export declare class SoundManager {
    private ctx;
    private enabled;
    private muted;
    private buses;
    private masterGain;
    private compressor;
    private voices;
    private readonly MAX_VOICES;
    private loops;
    private currentBgm;
    private busVolumes;
    private cooldowns;
    private readonly STORAGE_KEY;
    constructor();
    private init;
    /** 加载音频资源（兼容性方法） */
    load(onProgress?: (loaded: number, total: number) => void): Promise<void>;
    /** 启动音乐（兼容性方法） */
    startMusic(track?: BgmTrack): void;
    /** 设置张力（兼容性方法） */
    setTension(level: number): void;
    /** 设置关卡层级（兼容性方法） */
    setLevelTier(levelIndex: number): void;
    /** 每帧更新（兼容性方法） */
    tick(): void;
    /** 设置准备期滤镜（兼容性方法） */
    setPrepFilter(on: boolean): void;
    /** 解锁音频上下文（用户交互后调用） */
    unlock(): void;
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    setMuted(muted: boolean): void;
    isMuted(): boolean;
    toggleMute(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;
    setBusVolume(bus: AudioBus, volume: number): void;
    getBusVolume(bus: AudioBus): number;
    private _applyMasterGain;
    private _saveSettings;
    private loadSettings;
    private _voice;
    /** 冷却检查 */
    private _canPlay;
    /** 脉冲炮：快速连射，清脆"哒哒" */
    playMachineGunShot(pan?: number): void;
    /** 冰霜炮：冷冽"嘶嘶" */
    playFrostShot(pan?: number): void;
    /** 电磁炮：电弧"噼啪" */
    playElectricShot(pan?: number): void;
    /** 毒液炮：黏稠"咕噜" */
    playPoisonShot(pan?: number): void;
    /** 炸弹台：Q弹"嘭" */
    playBombExplosion(pan?: number): void;
    /** 激光炮：锐利"嗞" */
    playLaserShot(pan?: number): void;
    /** 磁轨炮：有力"砰" */
    playSniperShot(pan?: number): void;
    /** 焚化器：持续"呼呼" */
    playFlameShot(pan?: number): void;
    /** 引力场：深沉"嗡" */
    playMagneticShot(pan?: number): void;
    /** 奇点炮：科幻"咻" */
    playSingularityShot(pan?: number): void;
    /** 按塔类型分发 */
    playTowerShot(type: string, pan?: number): void;
    /** 命中：清脆"叮" */
    playEnemyHit(pan?: number, size?: number): void;
    /** 暴击：明亮"叮当" */
    playCritHit(pan?: number): void;
    /** 基地受击：警告"嗡" */
    playBaseHit(): void;
    /** 小怪死亡：短促"噗" */
    playEnemyDeath(pan?: number): void;
    /** 大怪死亡：重型"嘭" */
    playEnemyDeathBig(pan?: number): void;
    /** Boss死亡：史诗"轰" */
    playBossDeath(): void;
    /** 怪物逃脱：低沉"呜" */
    playEnemyEscape(pan?: number): void;
    /** 按钮点击：柔和"哒" */
    playButtonClick(): void;
    /** 按钮悬停：极微妙"嗒" */
    playButtonHover(): void;
    /** 召唤：明亮"叮" */
    playSummon(): void;
    /** 建造：上行"叮叮" */
    playPlaceTower(): void;
    /** 出售：柔和"沙" */
    playSellTower(): void;
    /** 拒绝：低沉"嗡" */
    playDenied(): void;
    /** 金币获取：清脆"叮" */
    playGoldGain(): void;
    /** 合成成功：明亮"叮叮" */
    playMergeSuccess(): void;
    /** 融合成功：更亮"叮叮叮" */
    playFusionSuccess(): void;
    /** 升级选择：上行音阶 */
    playUpgradeSelect(): void;
    /** 技能就绪：明亮提示 */
    playSkillReady(): void;
    /** 波次开始：警报"嘟嘟" */
    playWaveStart(): void;
    /** 波次结束：胜利号角 */
    playWaveClear(): void;
    /** Boss出现：深沉警告 */
    playBossSpawn(): void;
    /** 倒计时滴答 */
    playCountdownTick(urgent?: boolean): void;
    /** 过载激活 */
    playOverloadActivate(): void;
    /** 过载结束 */
    playOverloadEnd(): void;
    /** 麻痹效果 */
    playParalyze(): void;
    /** 菜单开始 */
    playMenuStart(): void;
    /** 游戏结束：下行音阶 */
    playGameOver(): void;
    /** 胜利：上行大调和弦 */
    playVictory(): void;
    /** 启动菜单背景音 */
    startMenuAmbience(): void;
    /** 启动战斗背景音 */
    startBattleMusic(): void;
    /** 启动Boss战音乐 */
    startBossMusic(): void;
    /** 停止菜单背景音 */
    stopMenuAmbience(): void;
    /** 停止战斗音乐 */
    stopBattleMusic(): void;
    /** 停止Boss音乐 */
    stopBossMusic(): void;
    /** 设置BGM */
    setBgm(track: BgmTrack | null): void;
    /** 获取当前BGM */
    getBgm(): BgmTrack | null;
    private _noiseBuf;
    /** 全局暂停 */
    suspend(): void;
    /** 全局恢复 */
    resume(): void;
    /** 诊断状态 */
    getDebugState(): Record<string, unknown>;
}
