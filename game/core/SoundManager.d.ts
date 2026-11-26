/**
 * 游戏音频系统 v4 —— 专业级音频管理
 * 霓虹壁垒
 *
 * 设计理念：
 * - 音乐与音效完全分离，独立控制
 * - 支持外部音频文件加载（MP3/OGG/WAV）
 * - 完整的淡入淡出和交叉淡化
 * - 多层音效叠加（冲击+主体+余波）
 * - 智能并发控制和防堆积
 * - 本地存储音量设置
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
/** 音乐曲目 */
export type MusicTrack = 'menu' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9' | 'victory' | 'boss';
/** 兼容旧代码的类型别名 */
export type BgmTrack = MusicTrack;
export declare class SoundManager {
    private ctx;
    private enabled;
    private muted;
    private buses;
    private masterGain;
    private compressor;
    private voices;
    private readonly MAX_VOICES;
    private musicBuffers;
    private currentMusicSource;
    private currentMusicGain;
    private currentTrack;
    private musicLoading;
    private sfxBuffers;
    private busVolumes;
    private cooldowns;
    private readonly STORAGE_KEY;
    private readonly basePath;
    constructor();
    private init;
    /** 加载音乐文件 */
    loadMusic(track: MusicTrack): Promise<void>;
    /** 预加载所有音乐 */
    preloadAllMusic(): Promise<void>;
    /** 播放音乐（带淡入） */
    playMusic(track: MusicTrack, fadeDuration?: number): void;
    private _startMusicInternal;
    /** 淡出音乐 */
    fadeOutMusic(duration?: number): void;
    /** 停止音乐 */
    stopMusic(): void;
    /** 暂停音乐 */
    pauseMusic(): void;
    /** 恢复音乐 */
    resumeMusic(): void;
    /** 获取当前音乐 */
    getCurrentMusic(): MusicTrack | null;
    /** 加载音效文件 */
    loadSfx(name: string): Promise<void>;
    /** 预加载所有音效 */
    preloadAllSfx(): Promise<void>;
    /** 播放音效 */
    playSfx(name: string, opts?: SoundOptions): void;
    /** 合成音效兜底（当音频文件不存在时） */
    private playSynthSfx;
    /** 连射塔：快速"哒哒" */
    playMachineGunShot(pan?: number): void;
    /** 霜寒塔：冰冻"嘶嘶" */
    playFrostShot(pan?: number): void;
    /** 雷弧塔：电弧"噼啪" */
    playElectricShot(pan?: number): void;
    /** 瘴毒塔：毒液"咕噜" */
    playPoisonShot(pan?: number): void;
    /** 爆裂塔：爆炸"嘭"（三层：冲击+主体+余波） */
    playBombExplosion(pan?: number): void;
    /** 光束塔：激光"嗞" */
    playLaserShot(pan?: number): void;
    /** 鹰眼塔：狙击"砰" */
    playSniperShot(pan?: number): void;
    /** 焚焰塔：火焰"呼呼" */
    playFlameShot(pan?: number): void;
    /** 磁引塔：磁力"嗡" */
    playMagneticShot(pan?: number): void;
    /** 奇点塔：奇点"咻" */
    playSingularityShot(pan?: number): void;
    /** 按塔类型分发 */
    playTowerShot(type: string, pan?: number): void;
    /** 敌人受击（根据体型分层） */
    playEnemyHit(pan?: number, size?: number): void;
    /** 暴击命中 */
    playCritHit(pan?: number): void;
    /** 基地受击 */
    playBaseHit(): void;
    /** 小怪死亡 */
    playEnemyDeath(pan?: number): void;
    /** 精英死亡 */
    playEnemyDeathBig(pan?: number): void;
    /** Boss死亡 */
    playBossDeath(): void;
    /** 怪物逃脱 */
    playEnemyEscape(pan?: number): void;
    playButtonClick(): void;
    playButtonHover(): void;
    playSummon(): void;
    playPlaceTower(): void;
    playSellTower(): void;
    playDenied(): void;
    playGoldGain(): void;
    playMergeSuccess(): void;
    playFusionSuccess(): void;
    playUpgradeSelect(): void;
    playSkillReady(): void;
    playWaveStart(): void;
    playWaveClear(): void;
    playBossSpawn(): void;
    playCountdownTick(urgent?: boolean): void;
    playOverloadActivate(): void;
    playOverloadEnd(): void;
    playParalyze(): void;
    playMenuStart(): void;
    playGameOver(): void;
    playVictory(): void;
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
    private _canPlay;
    /** 解锁音频上下文 */
    unlock(): void;
    /** 兼容性方法 */
    load(onProgress?: (loaded: number, total: number) => void): Promise<void>;
    startMusic(track?: MusicTrack): void;
    setBgm(track: MusicTrack | null): void;
    setTension(level: number): void;
    setLevelTier(levelIndex: number): void;
    tick(): void;
    setPrepFilter(on: boolean): void;
    suspend(): void;
    resume(): void;
    getDebugState(): Record<string, unknown>;
}
