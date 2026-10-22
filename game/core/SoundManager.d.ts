/**
 * 游戏音频系统（Game Audio System）v2 —— 真实音源素材版
 * 赛博防线：机械入侵
 *
 * ── 与 v1 的区别 ─────────────────────────────────────────
 *  v1：运行时用振荡器实时合成音效（零素材，但音色单薄）
 *  v2：加载 assets/audio/*.wav 预渲染素材（离线 DSP 管线产出：
 *      多层叠音 → 双二阶塑形 → 卷积混响 → 饱和染色 → 母带归一化）
 *      音色厚实、有空间感、响度统一；运行时零合成开销。
 *
 * ── 保留的核心机制 ───────────────────────────────────────
 *  · 总线：Master(限幅器) → Music / SFX / UI / Ambience
 *  · 声部池 + 优先级抢占：并发上限 28，超限抢占最低优先级声部
 *  · 空间化：按画布 X 坐标做 StereoPanner 定位
 *  · 反重复：playbackRate 音高抖动 + 频率限制
 *  · 环境层 / 音乐层：无缝循环素材，张力层随战况渐入
 *  · 素材缺失时回退到轻量合成音，保证游戏始终有反馈
 * ────────────────────────────────────────────────────────
 */
/** 音频总线 */
export declare enum AudioBus {
    MASTER = "master",
    MUSIC = "music",
    SFX = "sfx",
    UI = "ui",
    AMBIENCE = "ambience"
}
/** 声部优先级（数值越大越优先，用于声部池抢占） */
export declare enum SoundPriority {
    AMBIENT = 0,
    LOW = 1,
    NORMAL = 2,
    HIGH = 3,
    CRITICAL = 4
}
/** 单次播放参数 */
export interface SoundOptions {
    /** 相对音量 0~1（默认 1） */
    volume?: number;
    /** 音高倍率（默认 1） */
    pitch?: number;
    /** 音高随机抖动幅度（默认 0.04） */
    pitchJitter?: number;
    /** 立体声定位 -1(左) ~ 1(右) */
    pan?: number;
    /** 优先级 */
    priority?: SoundPriority;
    /** 目标总线 */
    bus?: AudioBus;
}
/** 素材清单（不含扩展名） */
export declare const ASSET_NAMES: string[];
/** 背景音乐曲目 */
export type BgmTrack = 'menu' | 'battle' | 'battle_mid' | 'battle_hard' | 'boss';
export declare class SoundManager {
    private ctx;
    private enabled;
    private muted;
    private buses;
    private masterGain;
    private limiter;
    private voices;
    private readonly MAX_VOICES;
    private buffers;
    private loadPromise;
    private loadedCount;
    private readonly totalCount;
    private readonly basePath;
    private loops;
    /** 期望播放的循环层（素材未就绪时挂起，加载完成后自动补播） */
    private desiredLoops;
    /** 当前 BGM 曲目 */
    private bgmCurrent;
    private prepFilter;
    private rhythmDrumsLayer;
    private isPrepPhase;
    private noiseBuffer;
    private busVolumes;
    private rateLimit;
    private lastWatchdog;
    private tension;
    private readonly STORAGE_KEY;
    constructor();
    private init;
    /**
     * 预加载全部音频素材（fetch + decodeAudioData）。
     * 可在首次用户交互前调用，decode 在 suspended 状态下同样可用。
     */
    load(onProgress?: (loaded: number, total: number) => void): Promise<void>;
    isReady(): boolean;
    getLoadProgress(): {
        loaded: number;
        total: number;
    };
    /** 用户首次交互时调用,解锁 AudioContext(浏览器自动播放策略) */
    unlock(): void;
    private _resume;
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;
    setBusVolume(bus: AudioBus, volume: number): void;
    getBusVolume(bus: AudioBus): number;
    setMuted(muted: boolean): void;
    isMuted(): boolean;
    toggleMute(): boolean;
    private _applyMasterGain;
    private _saveSettings;
    private loadSettings;
    private _voice;
    /** 播放一个音频素材 */
    private _playAsset;
    /** 频率限制：同一 key 在 minMs 内只播放一次 */
    private _rateOk;
    private _jitter;
    private _noiseBuffer;
    /** 素材缺失时的兜底合成音（短促噪声+音调） */
    private _fallback;
    playMachineGunShot(pan?: number): void;
    playFrostShot(pan?: number): void;
    playElectricShot(pan?: number): void;
    playPoisonShot(pan?: number): void;
    playBombExplosion(pan?: number): void;
    playLaserShot(pan?: number): void;
    playSniperShot(pan?: number): void;
    playFlameShot(pan?: number): void;
    playMagneticShot(pan?: number): void;
    playSingularityShot(pan?: number): void;
    /** 按防御塔类型分发音效（供游戏逻辑统一调用） */
    playTowerShot(type: string, pan?: number): void;
    /** 命中反馈（体型越大音高越低） */
    playEnemyHit(pan?: number, size?: number): void;
    playEnemyDeath(pan?: number): void;
    playEnemyDeathBig(pan?: number): void;
    playBossDeath(): void;
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
    /**
     * 声明一个循环层。若素材尚未加载完成，则登记为「期望层」，
     * 等 load() 完成后由 _tryStartLoop 自动补播，避免因时序问题丢音乐。
     */
    private _startLoop;
    /** 若期望层对应的素材已就绪，则真正开始播放 */
    private _tryStartLoop;
    private _stopLoop;
    /** 启动赛博环境层（无缝循环） */
    startAmbience(): void;
    stopAmbience(): void;
    /**
     * 启动音乐系统：张力层 + 指定 BGM 曲目
     * @param track 初始曲目，默认菜单曲
     */
    startMusic(track?: BgmTrack): void;
    stopMusic(): void;
    /**
     * 切换背景音乐曲目（交叉淡化）。
     * 相同曲目重复调用会被忽略，不会重启音乐 —— 但前提是那层循环确实还在跑。
     * 若循环层已丢失（设备切后台被回收 / 素材晚到 / 淡出后未重建），
     * 必须重新起播，否则会出现"曲目记录是 battle，实际一声都没有"。
     * @param track 目标曲目；传 null 表示淡出停止 BGM
     */
    setBgm(track: BgmTrack | null): void;
    /**
     * 自愈巡检（每帧可调，内部节流）。
     *
     * 只做一件事：确保「期望播放的循环层」真的在播。
     * 触发场景：素材晚于调用到达、AudioContext 被系统挂起后恢复、
     * 浏览器在后台回收了 BufferSource —— 这些都会让音乐静默消失，
     * 而 UI 上看不出任何异常。
     */
    tick(): void;
    /** 当前 BGM 曲目 */
    getBgm(): BgmTrack | null;
    /** 设置张力 0~1（随波次 / 生命值变化），控制张力层音量 */
    setTension(level: number): void;
    /**
     * 设置准备期低通滤波（动态音轨）。
     * 准备期（波次间隙）BGM 闷声，出怪时恢复清亮。
     */
    setPrepFilter(on: boolean): void;
    /**
     * 根据关卡索引选择 BGM 档位。
     * L1-3: battle（轻）
     * L4-6: battle_mid（中）
     * L7-9: battle_hard（重）
     */
    setLevelTier(levelIndex: number): void;
    /** 启动节奏鼓点层（出怪时叠加） */
    private _startRhythmDrums;
    /** 停止节奏鼓点层 */
    private _stopRhythmDrums;
    /** 全局静音全部（用于页面隐藏等） */
    suspend(): void;
    resume(): void;
    /** 诊断快照（供 verify 脚本 / 控制台排查"没声音"） */
    getDebugState(): Record<string, unknown>;
}
