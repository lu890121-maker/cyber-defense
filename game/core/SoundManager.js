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
export var AudioBus;
(function (AudioBus) {
    AudioBus["MASTER"] = "master";
    AudioBus["MUSIC"] = "music";
    AudioBus["SFX"] = "sfx";
    AudioBus["UI"] = "ui";
    AudioBus["AMBIENCE"] = "ambience";
})(AudioBus || (AudioBus = {}));
/** 声部优先级（数值越大越优先，用于声部池抢占） */
export var SoundPriority;
(function (SoundPriority) {
    SoundPriority[SoundPriority["AMBIENT"] = 0] = "AMBIENT";
    SoundPriority[SoundPriority["LOW"] = 1] = "LOW";
    SoundPriority[SoundPriority["NORMAL"] = 2] = "NORMAL";
    SoundPriority[SoundPriority["HIGH"] = 3] = "HIGH";
    SoundPriority[SoundPriority["CRITICAL"] = 4] = "CRITICAL";
})(SoundPriority || (SoundPriority = {}));
/** 素材清单（不含扩展名） */
export const ASSET_NAMES = [
    // 防御塔攻击（与 TowerType 一一对应）
    'tower_machine_gun', 'tower_frost', 'tower_electric', 'tower_poison', 'tower_bomb',
    'tower_laser', 'tower_sniper', 'tower_flame', 'tower_magnetic', 'tower_singularity',
    // 战斗反馈
    'enemy_hit', 'enemy_death', 'enemy_death_big', 'boss_death', 'enemy_escape',
    // UI
    'ui_click', 'ui_hover', 'ui_summon', 'ui_place', 'ui_sell', 'ui_denied', 'ui_gold',
    'ui_merge', 'ui_fusion', 'ui_upgrade', 'ui_skill_ready',
    // 流程
    'flow_wave_start', 'flow_wave_clear', 'flow_boss_spawn', 'flow_countdown',
    'flow_countdown_urgent', 'flow_paralyze',
    'flow_menu_start', 'flow_game_over', 'flow_victory',
    // 循环
    'ambience_cyber', 'music_menu', 'music_battle', 'music_battle_mid', 'music_battle_hard',
    'music_boss', 'music_tension', 'rhythm_drums'
];
/** 曲目 → 素材名映射 */
const BGM_TRACKS = {
    menu: 'music_menu',
    battle: 'music_battle',
    battle_mid: 'music_battle_mid',
    battle_hard: 'music_battle_hard',
    boss: 'music_boss'
};
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.muted = false;
        // 总线
        this.buses = {};
        this.masterGain = null;
        this.limiter = null;
        // 声部池
        this.voices = [];
        this.MAX_VOICES = 28;
        // 素材
        this.buffers = new Map();
        this.loadPromise = null;
        this.loadedCount = 0;
        this.totalCount = ASSET_NAMES.length;
        this.basePath = 'assets/audio/';
        // 循环层
        this.loops = new Map();
        /** 期望播放的循环层（素材未就绪时挂起，加载完成后自动补播） */
        this.desiredLoops = new Map();
        /** 当前 BGM 曲目 */
        this.bgmCurrent = null;
        // 动态音轨：准备期低通滤波 + 节奏鼓点层
        this.prepFilter = null;
        this.rhythmDrumsLayer = null;
        this.isPrepPhase = false;
        // 回退合成用的噪声缓冲
        this.noiseBuffer = null;
        // 总线音量
        // ⚠️ 音乐不能低于 SFX 太多：战斗时枪声密集，音乐一低就被彻底淹没
        //    （用户反馈"背景音乐好像没了"的成因之一）。这里音乐 0.92 / 音效 0.88。
        this.busVolumes = {
            [AudioBus.MASTER]: 1.0,
            [AudioBus.MUSIC]: 0.92,
            [AudioBus.SFX]: 0.88,
            [AudioBus.UI]: 0.80,
            [AudioBus.AMBIENCE]: 0.30
        };
        // 频率限制
        this.rateLimit = {};
        // 循环层自愈巡检节流
        this.lastWatchdog = 0;
        // 张力（0~1）
        this.tension = 0;
        this.STORAGE_KEY = 'nightmare-hospital-audio-v2';
        this.init();
        this.loadSettings();
    }
    // ══════════════════════════════════════════════════════
    //  初始化 / 素材加载
    // ══════════════════════════════════════════════════════
    init() {
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) {
                this.enabled = false;
                return;
            }
            const ctx = new Ctor();
            this.ctx = ctx;
            // 主总线 → 限幅器 → 输出
            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = this.busVolumes[AudioBus.MASTER];
            this.limiter = ctx.createDynamicsCompressor();
            // 母带限幅：只做"防破音"，不做"压缩器"。
            // 早期设成 threshold -3 / ratio 8，密集枪声一响整条母线被压下去，
            // 背景音乐跟着一起消失 —— 这是"音乐没了"最隐蔽的成因。
            this.limiter.threshold.value = -4;
            this.limiter.knee.value = 6;
            this.limiter.ratio.value = 4;
            this.limiter.attack.value = 0.005;
            this.limiter.release.value = 0.25;
            this.masterGain.connect(this.limiter);
            this.limiter.connect(ctx.destination);
            // 子总线
            Object.keys(this.busVolumes).forEach((name) => {
                if (name === AudioBus.MASTER) {
                    this.buses[AudioBus.MASTER] = this.masterGain;
                    return;
                }
                const g = ctx.createGain();
                g.gain.value = this.busVolumes[name];
                g.connect(this.masterGain);
                this.buses[name] = g;
            });
            // 准备期低通滤波器：插入到 MUSIC 总线，准备期闷声，出怪时恢复
            this.prepFilter = ctx.createBiquadFilter();
            this.prepFilter.type = 'lowpass';
            this.prepFilter.frequency.value = 20000; // 默认全通
            this.prepFilter.Q.value = 0.7;
            // 重新路由：MUSIC → prepFilter → masterGain
            const musicBus = this.buses[AudioBus.MUSIC];
            musicBus.disconnect();
            musicBus.connect(this.prepFilter);
            this.prepFilter.connect(this.masterGain);
        }
        catch (e) {
            console.warn('[Audio] Web Audio API 不可用，音频系统已禁用', e);
            this.enabled = false;
        }
    }
    /**
     * 预加载全部音频素材（fetch + decodeAudioData）。
     * 可在首次用户交互前调用，decode 在 suspended 状态下同样可用。
     */
    load(onProgress) {
        if (!this.ctx)
            return Promise.resolve();
        if (this.loadPromise)
            return this.loadPromise;
        this.loadPromise = Promise.all(ASSET_NAMES.map(async (name) => {
            try {
                // 优先尝试加载 OGG 格式（压缩后体积小 89%）
                let res = await fetch(`${this.basePath}${name}.ogg`);
                if (!res.ok) {
                    // OGG 不可用时回退到 WAV
                    res = await fetch(`${this.basePath}${name}.wav`);
                    if (!res.ok)
                        throw new Error(`HTTP ${res.status}`);
                }
                const arr = await res.arrayBuffer();
                const buf = await this.ctx.decodeAudioData(arr);
                this.buffers.set(name, buf);
            }
            catch (e) {
                console.warn(`[Audio] 素材加载失败: ${name}`, e);
            }
            finally {
                this.loadedCount++;
                onProgress?.(this.loadedCount, this.totalCount);
            }
        })).then(() => {
            console.log(`[Audio] 素材加载完成 ${this.buffers.size}/${this.totalCount}`);
            // 补播加载期间被请求、但因素材未就绪而挂起的循环层（环境/音乐/张力）
            for (const key of Array.from(this.desiredLoops.keys())) {
                this._tryStartLoop(key);
            }
        });
        return this.loadPromise;
    }
    isReady() {
        return this.buffers.size > 0;
    }
    getLoadProgress() {
        return { loaded: this.loadedCount, total: this.totalCount };
    }
    /** 用户首次交互时调用,解锁 AudioContext(浏览器自动播放策略) */
    unlock() {
        if (!this.ctx)
            return;
        // 移动端浏览器要求用户交互后才能播放音频
        // resume 成功后重新触发期望的音频层
        // ⚠️ 不能只判 'suspended'：iOS Safari 在来电/切后台后会进入 'interrupted'，
        // 那也是"没在跑"，同样要靠用户交互 resume 回来。
        if (this.ctx.state !== 'running') {
            this.ctx.resume().then(() => {
                console.log('[Audio] AudioContext 已解锁');
                // 等待素材加载完成后再启动循环
                if (this.loadPromise) {
                    this.loadPromise.then(() => {
                        // 重新触发所有期望的循环层(音乐/环境/张力)
                        for (const key of Array.from(this.desiredLoops.keys())) {
                            this._tryStartLoop(key);
                        }
                    });
                }
                else {
                    // 素材已加载完成，直接启动
                    for (const key of Array.from(this.desiredLoops.keys())) {
                        this._tryStartLoop(key);
                    }
                }
            }).catch((err) => {
                console.warn('[Audio] AudioContext 解锁失败,将在下次交互时重试', err);
            });
        }
        else {
            // 已经是 running 状态,等待素材加载完成后再启动循环
            if (this.loadPromise) {
                this.loadPromise.then(() => {
                    for (const key of Array.from(this.desiredLoops.keys())) {
                        this._tryStartLoop(key);
                    }
                });
            }
            else {
                // 素材已加载完成，直接启动
                for (const key of Array.from(this.desiredLoops.keys())) {
                    this._tryStartLoop(key);
                }
            }
        }
    }
    _resume() {
        if (!this.ctx || this.ctx.state === 'closed' || this.ctx.state === 'running')
            return;
        // 首次 resume 可能被移动端 WebView / 自动播放策略短暂拒绝。
        // 保留下次用户交互重试的机会,而不是静默吞掉后永久无声。
        this.ctx.resume().catch((err) => {
            console.warn('[Audio] AudioContext 恢复失败,将在下次交互时重试', err);
        });
    }
    // ══════════════════════════════════════════════════════
    //  设置 / 开关
    // ══════════════════════════════════════════════════════
    setEnabled(enabled) {
        this.enabled = enabled;
        this._applyMasterGain();
        this._saveSettings();
    }
    isEnabled() {
        return this.enabled;
    }
    setVolume(volume) {
        this.busVolumes[AudioBus.MASTER] = Math.max(0, Math.min(1, volume));
        this._applyMasterGain();
        this._saveSettings();
    }
    getVolume() {
        return this.busVolumes[AudioBus.MASTER];
    }
    setBusVolume(bus, volume) {
        this.busVolumes[bus] = Math.max(0, Math.min(1, volume));
        const g = this.buses[bus];
        if (g && this.ctx) {
            g.gain.setTargetAtTime(this.busVolumes[bus], this.ctx.currentTime, 0.05);
        }
        this._saveSettings();
    }
    getBusVolume(bus) {
        return this.busVolumes[bus];
    }
    setMuted(muted) {
        this.muted = muted;
        this._applyMasterGain();
        this._saveSettings();
    }
    isMuted() {
        return this.muted;
    }
    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }
    _applyMasterGain() {
        if (!this.masterGain || !this.ctx)
            return;
        const target = this.enabled && !this.muted ? this.busVolumes[AudioBus.MASTER] : 0.0001;
        const t = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(t);
        this.masterGain.gain.setTargetAtTime(target, t, 0.04);
    }
    _saveSettings() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                enabled: this.enabled,
                muted: this.muted,
                master: this.busVolumes[AudioBus.MASTER],
                music: this.busVolumes[AudioBus.MUSIC],
                sfx: this.busVolumes[AudioBus.SFX]
            }));
        }
        catch (e) { /* noop */ }
    }
    loadSettings() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw)
                return;
            const s = JSON.parse(raw);
            if (typeof s.enabled === 'boolean')
                this.enabled = s.enabled;
            if (typeof s.muted === 'boolean')
                this.muted = s.muted;
            if (typeof s.master === 'number')
                this.busVolumes[AudioBus.MASTER] = s.master;
            if (typeof s.music === 'number')
                this.busVolumes[AudioBus.MUSIC] = s.music;
            if (typeof s.sfx === 'number')
                this.busVolumes[AudioBus.SFX] = s.sfx;
            this._applyMasterGain();
        }
        catch (e) { /* noop */ }
    }
    // ══════════════════════════════════════════════════════
    //  声部池
    // ══════════════════════════════════════════════════════
    _voice(bus, priority, duration, opts = {}) {
        if (!this.enabled || !this.ctx)
            return null;
        this._resume();
        const ctx = this.ctx;
        const now = ctx.currentTime;
        // 清理已结束声部
        for (let i = this.voices.length - 1; i >= 0; i--) {
            if (this.voices[i].end <= now)
                this.voices.splice(i, 1);
        }
        // 声部池满 → 抢占最低优先级
        if (this.voices.length >= this.MAX_VOICES) {
            let idx = -1;
            let lowest = Number.POSITIVE_INFINITY;
            for (let i = 0; i < this.voices.length; i++) {
                if (this.voices[i].priority < lowest) {
                    lowest = this.voices[i].priority;
                    idx = i;
                }
            }
            if (idx >= 0 && lowest < priority) {
                this.voices[idx].cut();
                this.voices.splice(idx, 1);
            }
            else {
                return null;
            }
        }
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0.0001, opts.volume ?? 1);
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
        gain.connect(pan);
        pan.connect(this.buses[bus] ?? this.buses[AudioBus.SFX]);
        let voice;
        const cut = () => {
            const t = ctx.currentTime;
            try {
                gain.gain.cancelScheduledValues(t);
                gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
            }
            catch (e) { /* noop */ }
            for (const s of voice.sources) {
                try {
                    s.stop(t + 0.03);
                }
                catch (e) { /* noop */ }
            }
        };
        voice = {
            gain,
            pan,
            priority,
            start: now,
            end: now + duration + 0.1,
            sources: [],
            cut
        };
        this.voices.push(voice);
        return voice;
    }
    /** 播放一个音频素材 */
    _playAsset(name, opts = {}) {
        if (!this.enabled || !this.ctx)
            return;
        const buf = this.buffers.get(name);
        if (!buf) {
            // 素材尚未就绪 → 用轻量合成音兜底，保证有反馈
            this._fallback(opts);
            return;
        }
        const rate = Math.max(0.25, Math.min(4.0, (opts.pitch ?? 1) * this._jitter(1, opts.pitchJitter ?? 0.04)));
        const dur = buf.duration / rate;
        const bus = opts.bus ?? AudioBus.SFX;
        const v = this._voice(bus, opts.priority ?? SoundPriority.NORMAL, dur, opts);
        if (!v)
            return;
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        src.connect(v.gain);
        src.start();
        v.sources.push(src);
        // 按实际播放速率修正声部结束时间
        v.end = ctx.currentTime + dur + 0.1;
    }
    /** 频率限制：同一 key 在 minMs 内只播放一次 */
    _rateOk(key, minMs) {
        const t = performance.now();
        if (this.rateLimit[key] !== undefined && t - this.rateLimit[key] < minMs)
            return false;
        this.rateLimit[key] = t;
        return true;
    }
    _jitter(base, amount) {
        return base * (1 + (Math.random() * 2 - 1) * amount);
    }
    _noiseBuffer() {
        const ctx = this.ctx;
        if (!this.noiseBuffer) {
            const len = Math.floor(ctx.sampleRate * 0.5);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++)
                d[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buf;
        }
        return this.noiseBuffer;
    }
    /** 素材缺失时的兜底合成音（短促噪声+音调） */
    _fallback(opts = {}) {
        if (!this.ctx)
            return;
        const v = this._voice(opts.bus ?? AudioBus.SFX, opts.priority ?? SoundPriority.LOW, 0.09, opts);
        if (!v)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const n = ctx.createBufferSource();
        n.buffer = this._noiseBuffer();
        n.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1400;
        bp.Q.value = 1.2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        n.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        n.start(t);
        n.stop(t + 0.09);
        v.sources.push(n);
    }
    // ══════════════════════════════════════════════════════
    //  防御塔攻击音效
    // ══════════════════════════════════════════════════════
    playMachineGunShot(pan = 0) {
        if (!this._rateOk('mg', 45))
            return;
        this._playAsset('tower_machine_gun', { pan, volume: 1.0, priority: SoundPriority.NORMAL, pitchJitter: 0.06 });
    }
    playFrostShot(pan = 0) {
        if (!this._rateOk('frost', 90))
            return;
        this._playAsset('tower_frost', { pan, volume: 0.85, priority: SoundPriority.NORMAL, pitchJitter: 0.05 });
    }
    playElectricShot(pan = 0) {
        if (!this._rateOk('elec', 80))
            return;
        this._playAsset('tower_electric', { pan, volume: 0.9, priority: SoundPriority.NORMAL, pitchJitter: 0.06 });
    }
    playPoisonShot(pan = 0) {
        if (!this._rateOk('poison', 110))
            return;
        this._playAsset('tower_poison', { pan, volume: 0.9, priority: SoundPriority.NORMAL, pitchJitter: 0.05 });
    }
    playBombExplosion(pan = 0) {
        if (!this._rateOk('bomb', 130))
            return;
        this._playAsset('tower_bomb', { pan, volume: 1.0, priority: SoundPriority.HIGH, pitchJitter: 0.04 });
    }
    playLaserShot(pan = 0) {
        if (!this._rateOk('laser', 80))
            return;
        this._playAsset('tower_laser', { pan, volume: 0.85, priority: SoundPriority.NORMAL, pitchJitter: 0.04 });
    }
    playSniperShot(pan = 0) {
        if (!this._rateOk('sniper', 150))
            return;
        this._playAsset('tower_sniper', { pan, volume: 1.0, priority: SoundPriority.HIGH, pitchJitter: 0.03 });
    }
    playFlameShot(pan = 0) {
        if (!this._rateOk('flame', 60))
            return;
        this._playAsset('tower_flame', { pan, volume: 0.7, priority: SoundPriority.LOW, pitchJitter: 0.07 });
    }
    playMagneticShot(pan = 0) {
        if (!this._rateOk('mag', 130))
            return;
        this._playAsset('tower_magnetic', { pan, volume: 0.8, priority: SoundPriority.NORMAL, pitchJitter: 0.05 });
    }
    playSingularityShot(pan = 0) {
        if (!this._rateOk('sing', 220))
            return;
        this._playAsset('tower_singularity', { pan, volume: 0.95, priority: SoundPriority.HIGH, pitchJitter: 0.03 });
    }
    /** 按防御塔类型分发音效（供游戏逻辑统一调用） */
    playTowerShot(type, pan = 0) {
        switch (type) {
            case 'machine_gun':
                this.playMachineGunShot(pan);
                break;
            case 'frost':
                this.playFrostShot(pan);
                break;
            case 'electric':
                this.playElectricShot(pan);
                break;
            case 'poison':
                this.playPoisonShot(pan);
                break;
            case 'bomb':
                this.playBombExplosion(pan);
                break;
            case 'laser':
                this.playLaserShot(pan);
                break;
            case 'sniper':
                this.playSniperShot(pan);
                break;
            case 'flame':
                this.playFlameShot(pan);
                break;
            case 'magnetic':
                this.playMagneticShot(pan);
                break;
            case 'singularity':
                this.playSingularityShot(pan);
                break;
            default:
                this.playMachineGunShot(pan);
                break;
        }
    }
    // ══════════════════════════════════════════════════════
    //  命中 / 死亡 / 逃脱
    // ══════════════════════════════════════════════════════
    /** 命中反馈（体型越大音高越低） */
    playEnemyHit(pan = 0, size = 15) {
        if (!this._rateOk('hit', 30))
            return;
        const pitch = Math.max(0.6, Math.min(1.25, 1.25 - size / 60));
        this._playAsset('enemy_hit', { pan, volume: 0.55, priority: SoundPriority.LOW, pitch, pitchJitter: 0.08 });
    }
    playEnemyDeath(pan = 0) {
        if (!this._rateOk('death', 45))
            return;
        this._playAsset('enemy_death', { pan, volume: 0.8, priority: SoundPriority.NORMAL, pitchJitter: 0.08 });
    }
    playEnemyDeathBig(pan = 0) {
        this._playAsset('enemy_death_big', { pan, volume: 1.0, priority: SoundPriority.HIGH, pitchJitter: 0.04 });
    }
    playBossDeath() {
        this._playAsset('boss_death', { volume: 1.0, priority: SoundPriority.CRITICAL, pitchJitter: 0 });
    }
    playEnemyEscape(pan = 0) {
        this._playAsset('enemy_escape', { pan, volume: 0.9, priority: SoundPriority.HIGH, pitchJitter: 0.03 });
    }
    // ══════════════════════════════════════════════════════
    //  UI 音效
    // ══════════════════════════════════════════════════════
    playButtonClick() {
        if (!this._rateOk('click', 55))
            return;
        this._playAsset('ui_click', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playButtonHover() {
        if (!this._rateOk('hover', 120))
            return;
        this._playAsset('ui_hover', { volume: 0.35, priority: SoundPriority.LOW, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playSummon() {
        this._playAsset('ui_summon', { volume: 0.9, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playPlaceTower() {
        this._playAsset('ui_place', { volume: 0.95, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playSellTower() {
        this._playAsset('ui_sell', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.04 });
    }
    playDenied() {
        this._playAsset('ui_denied', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playGoldGain() {
        if (!this._rateOk('gold', 50))
            return;
        this._playAsset('ui_gold', { volume: 0.5, priority: SoundPriority.LOW, bus: AudioBus.UI, pitchJitter: 0.06 });
    }
    playMergeSuccess() {
        this._playAsset('ui_merge', { volume: 0.9, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playFusionSuccess() {
        this._playAsset('ui_fusion', { volume: 1.0, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playUpgradeSelect() {
        this._playAsset('ui_upgrade', { volume: 0.9, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playSkillReady() {
        this._playAsset('ui_skill_ready', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    // ══════════════════════════════════════════════════════
    //  游戏流程音效
    // ══════════════════════════════════════════════════════
    playWaveStart() {
        this._playAsset('flow_wave_start', { volume: 0.95, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playWaveClear() {
        this._playAsset('flow_wave_clear', { volume: 0.9, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playBossSpawn() {
        this._playAsset('flow_boss_spawn', { volume: 1.0, priority: SoundPriority.CRITICAL, pitchJitter: 0 });
    }
    playCountdownTick(urgent = false) {
        if (!this._rateOk('tick', 100))
            return;
        this._playAsset(urgent ? 'flow_countdown_urgent' : 'flow_countdown', { volume: urgent ? 0.85 : 0.6, priority: SoundPriority.NORMAL, bus: AudioBus.UI, pitchJitter: 0.02 });
    }
    playOverloadActivate() {
        this._playAsset('flow_paralyze', { volume: 1.0, priority: SoundPriority.CRITICAL, pitchJitter: 0, pitch: 1.22 });
    }
    playOverloadEnd() {
        this._playAsset('flow_countdown', { volume: 0.7, priority: SoundPriority.NORMAL, bus: AudioBus.UI, pitch: 0.7 });
    }
    playParalyze() {
        this._playAsset('flow_paralyze', { volume: 0.8, priority: SoundPriority.HIGH, pitchJitter: 0.05 });
    }
    playMenuStart() {
        this._playAsset('flow_menu_start', { volume: 0.95, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playGameOver() {
        this._playAsset('flow_game_over', { volume: 1.0, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playVictory() {
        this._playAsset('flow_victory', { volume: 1.0, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    // ══════════════════════════════════════════════════════
    //  循环层（环境 / 音乐 / 张力）
    // ══════════════════════════════════════════════════════
    /**
     * 声明一个循环层。若素材尚未加载完成，则登记为「期望层」，
     * 等 load() 完成后由 _tryStartLoop 自动补播，避免因时序问题丢音乐。
     */
    _startLoop(name, key, bus, gainValue, fadeIn) {
        if (!this.enabled)
            return;
        this.desiredLoops.set(key, { asset: name, bus, gain: gainValue, fade: fadeIn });
        this._tryStartLoop(key);
    }
    /** 若期望层对应的素材已就绪，则真正开始播放 */
    _tryStartLoop(key) {
        const want = this.desiredLoops.get(key);
        if (!want)
            return;
        if (!this.ctx || !this.enabled || this.loops.has(key))
            return;
        const buf = this.buffers.get(want.asset);
        if (!buf)
            return; // 素材仍在加载中，保持挂起
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.connect(this.buses[want.bus]);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(g);
        src.start(t);
        // 张力层音量由 setTension 动态驱动
        const target = key === 'tension'
            ? Math.max(0.0001, this.tension * 0.85)
            : Math.max(0.0001, want.gain);
        g.gain.exponentialRampToValueAtTime(target, t + Math.max(0.05, want.fade));
        this.loops.set(key, { src, gain: g });
    }
    _stopLoop(key, fadeOut) {
        this.desiredLoops.delete(key);
        const layer = this.loops.get(key);
        if (!layer || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        try {
            layer.gain.gain.cancelScheduledValues(t);
            layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), t);
            layer.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fadeOut));
        }
        catch (e) { /* noop */ }
        // 淡出结束后再停止音源，让尾音自然衰减（交叉淡化时旧曲自行退场）
        const stopAt = t + Math.max(0.05, fadeOut) + 0.1;
        try {
            layer.src.stop(stopAt);
        }
        catch (e) { /* noop */ }
        this.loops.delete(key);
    }
    /** 启动赛博环境层（无缝循环） */
    startAmbience() {
        this._startLoop('ambience_cyber', 'ambience', AudioBus.AMBIENCE, 1.0, 4);
    }
    stopAmbience() {
        this._stopLoop('ambience', 1.2);
    }
    /**
     * 启动音乐系统：张力层 + 指定 BGM 曲目
     * @param track 初始曲目，默认菜单曲
     */
    startMusic(track = 'menu') {
        // 张力层初始静音，由 setTension 控制
        this._startLoop('music_tension', 'tension', AudioBus.MUSIC, 0.0001, 1);
        this.setTension(this.tension);
        this.setBgm(track);
    }
    stopMusic() {
        this._stopLoop('tension', 1.0);
        this.bgmCurrent = null;
        this._stopLoop('bgm', 1.5);
    }
    /**
     * 切换背景音乐曲目（交叉淡化）。
     * 相同曲目重复调用会被忽略，不会重启音乐 —— 但前提是那层循环确实还在跑。
     * 若循环层已丢失（设备切后台被回收 / 素材晚到 / 淡出后未重建），
     * 必须重新起播，否则会出现"曲目记录是 battle，实际一声都没有"。
     * @param track 目标曲目；传 null 表示淡出停止 BGM
     */
    setBgm(track) {
        const same = track === this.bgmCurrent;
        const alive = this.loops.has('bgm') && this.desiredLoops.has('bgm');
        if (same && alive)
            return;
        const prev = this.bgmCurrent;
        this.bgmCurrent = track;
        // 先淡出旧曲目，再淡入新曲目 —— 形成 2s 交叉淡化
        if (prev && prev !== track)
            this._stopLoop('bgm', 2.0);
        if (track && this.enabled) {
            this._startLoop(BGM_TRACKS[track], 'bgm', AudioBus.MUSIC, 1.0, same ? 0.4 : 2.0);
        }
    }
    /**
     * 自愈巡检（每帧可调，内部节流）。
     *
     * 只做一件事：确保「期望播放的循环层」真的在播。
     * 触发场景：素材晚于调用到达、AudioContext 被系统挂起后恢复、
     * 浏览器在后台回收了 BufferSource —— 这些都会让音乐静默消失，
     * 而 UI 上看不出任何异常。
     */
    tick() {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running')
            return;
        const now = performance.now();
        if (now - this.lastWatchdog < 1200)
            return;
        this.lastWatchdog = now;
        for (const key of Array.from(this.desiredLoops.keys())) {
            if (!this.loops.has(key))
                this._tryStartLoop(key);
        }
    }
    /** 当前 BGM 曲目 */
    getBgm() {
        return this.bgmCurrent;
    }
    /** 设置张力 0~1（随波次 / 生命值变化），控制张力层音量 */
    setTension(level) {
        this.tension = Math.max(0, Math.min(1, level));
        const layer = this.loops.get('tension');
        if (layer && this.ctx) {
            const t = this.ctx.currentTime;
            layer.gain.gain.cancelScheduledValues(t);
            layer.gain.gain.setTargetAtTime(Math.max(0.0001, this.tension * 0.85), t, 0.7);
        }
    }
    /**
     * 设置准备期低通滤波（动态音轨）。
     * 准备期（波次间隙）BGM 闷声，出怪时恢复清亮。
     */
    setPrepFilter(on) {
        if (!this.prepFilter || !this.ctx)
            return;
        this.isPrepPhase = on;
        const t = this.ctx.currentTime;
        const targetFreq = on ? 800 : 20000; // 准备期 800Hz 闷声，出怪时全通
        this.prepFilter.frequency.cancelScheduledValues(t);
        this.prepFilter.frequency.setTargetAtTime(targetFreq, t, on ? 0.3 : 0.5);
        // 准备期关闭节奏鼓点层，出怪时启动
        if (on) {
            this._stopRhythmDrums();
        }
        else {
            this._startRhythmDrums();
        }
    }
    /**
     * 根据关卡索引选择 BGM 档位。
     * L1-3: battle（轻）
     * L4-6: battle_mid（中）
     * L7-9: battle_hard（重）
     */
    setLevelTier(levelIndex) {
        let track;
        if (levelIndex <= 2) {
            track = 'battle';
        }
        else if (levelIndex <= 5) {
            track = 'battle_mid';
        }
        else {
            track = 'battle_hard';
        }
        this.setBgm(track);
    }
    /** 启动节奏鼓点层（出怪时叠加） */
    _startRhythmDrums() {
        if (!this.ctx || !this.enabled || this.rhythmDrumsLayer)
            return;
        const buf = this.buffers.get('rhythm_drums');
        if (!buf)
            return; // 素材未加载
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.connect(this.buses[AudioBus.MUSIC]);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(g);
        src.start(t);
        // 淡入 1.5s
        g.gain.exponentialRampToValueAtTime(0.85, t + 1.5);
        this.rhythmDrumsLayer = { src, gain: g };
    }
    /** 停止节奏鼓点层 */
    _stopRhythmDrums() {
        if (!this.rhythmDrumsLayer || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        try {
            this.rhythmDrumsLayer.gain.gain.cancelScheduledValues(t);
            this.rhythmDrumsLayer.gain.gain.setValueAtTime(Math.max(0.0001, this.rhythmDrumsLayer.gain.gain.value), t);
            this.rhythmDrumsLayer.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        }
        catch (e) { /* noop */ }
        const stopAt = t + 1.1;
        try {
            this.rhythmDrumsLayer.src.stop(stopAt);
        }
        catch (e) { /* noop */ }
        this.rhythmDrumsLayer = null;
    }
    /** 全局静音全部（用于页面隐藏等） */
    suspend() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => { });
        }
    }
    resume() {
        this._resume();
    }
    /** 诊断快照（供 verify 脚本 / 控制台排查"没声音"） */
    getDebugState() {
        const loops = {};
        this.loops.forEach((layer, key) => {
            loops[key] = Math.round(layer.gain.gain.value * 1000) / 1000;
        });
        return {
            ctx: this.ctx ? this.ctx.state : 'none',
            enabled: this.enabled,
            muted: this.muted,
            buffers: this.buffers.size,
            total: this.totalCount,
            bgm: this.bgmCurrent,
            desired: Array.from(this.desiredLoops.keys()),
            loops,
            busMusic: this.busVolumes[AudioBus.MUSIC],
            busSfx: this.busVolumes[AudioBus.SFX],
            busAmb: this.busVolumes[AudioBus.AMBIENCE],
            master: this.busVolumes[AudioBus.MASTER],
            tension: this.tension
        };
    }
}
//# sourceMappingURL=SoundManager.js.map