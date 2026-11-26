/**
 * 游戏音频系统（Game Audio System）v2 —— 真实音源素材版
 * 霓虹壁垒
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
        this.MAX_VOICES = 24; // 提高并发数，支持更密集的战斗音效
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
        // 优化：降低音乐和环境音，让音效更突出，增强打击感
        this.busVolumes = {
            [AudioBus.MASTER]: 0.9,
            [AudioBus.MUSIC]: 0.65, // 降低音乐音量，避免掩盖音效
            [AudioBus.SFX]: 0.95, // 提高音效音量，增强打击感
            [AudioBus.UI]: 0.75,
            [AudioBus.AMBIENCE]: 0.20 // 降低环境音，减少背景噪音
        };
        // 频率限制
        this.rateLimit = {};
        // 循环层自愈巡检节流
        this.lastWatchdog = 0;
        // 张力（0~1）
        this.tension = 0;
        /** 关卡变奏参数（变速 + 滤波），每关不同 */
        this.levelVariation = null;
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
    //  防御塔攻击音效（纯合成机械质感）
    // ══════════════════════════════════════════════════════
    /** 通用：创建噪声 buffer */
    _noiseBuf(duration) {
        const ctx = this.ctx;
        const len = Math.floor(ctx.sampleRate * duration);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++)
            d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        return src;
    }
    /** 通用：创建声部并连接到 pan */
    _synthVoice(pan, duration, priority = SoundPriority.NORMAL) {
        const v = this._voice(AudioBus.SFX, priority, duration, { pan });
        if (!v)
            return null;
        return { gain: v.gain, pan: v.pan };
    }
    /** 脉冲炮：快速连射，短促金属撞击 */
    playMachineGunShot(pan = 0) {
        if (!this._rateOk('mg', 60) || !this.ctx)
            return; // 降低冷却，支持快速连射
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.08);
        if (!v)
            return;
        // 金属撞击：短促方波 + 快速衰减
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180 + Math.random() * 40, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.7, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.06);
        // 气动释放：高频噪声短脉冲
        const noise = this._noiseBuf(0.04);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3500;
        bp.Q.value = 2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.4, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.04);
    }
    /** 冰霜炮：嘶嘶声 + 结晶叮当 */
    playFrostShot(pan = 0) {
        if (!this._rateOk('frost', 100) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.15);
        if (!v)
            return;
        // 高压气体释放：高频噪声扫频
        const noise = this._noiseBuf(0.12);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(2000, t);
        hp.frequency.exponentialRampToValueAtTime(6000, t + 0.08);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.12);
        // 冰晶碎裂：高频正弦短脉冲
        const cry = ctx.createOscillator();
        cry.type = 'sine';
        cry.frequency.setValueAtTime(4200, t + 0.02);
        cry.frequency.exponentialRampToValueAtTime(1800, t + 0.1);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.3, t + 0.02);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        cry.connect(cg);
        cg.connect(v.gain);
        cry.start(t + 0.02);
        cry.stop(t + 0.12);
    }
    /** 电磁炮：电弧噼啪 + 放电噪声 */
    playElectricShot(pan = 0) {
        if (!this._rateOk('elec', 80) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.12);
        if (!v)
            return;
        // 电弧噼啪：锯齿波快速频率跳变
        const arc = ctx.createOscillator();
        arc.type = 'sawtooth';
        arc.frequency.setValueAtTime(120, t);
        arc.frequency.setValueAtTime(800, t + 0.01);
        arc.frequency.setValueAtTime(200, t + 0.02);
        arc.frequency.setValueAtTime(1200, t + 0.03);
        arc.frequency.setValueAtTime(150, t + 0.05);
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(0.5, t);
        ag.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        arc.connect(ag);
        ag.connect(v.gain);
        arc.start(t);
        arc.stop(t + 0.1);
        // 放电噪声
        const noise = this._noiseBuf(0.06);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 5000;
        bp.Q.value = 3;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.35, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.06);
    }
    /** 毒液炮：黏液声 */
    playPoisonShot(pan = 0) {
        if (!this._rateOk('poison', 120) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.18);
        if (!v)
            return;
        // 腐蚀冒泡：噪声 + 低通滤波 + 颤音
        const noise = this._noiseBuf(0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(600, t + 0.03);
        lp.frequency.linearRampToValueAtTime(300, t + 0.15);
        lp.Q.value = 5;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.15);
    }
    /** 导弹台：发射呼啸 + 撞击 */
    playBombExplosion(pan = 0) {
        if (!this._rateOk('bomb', 180) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.25, SoundPriority.HIGH);
        if (!v)
            return;
        // 发射呼啸：噪声扫频（低频→高频）
        const noise = this._noiseBuf(0.2);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(300, t + 0.02);
        bp.frequency.exponentialRampToValueAtTime(2000, t + 0.15);
        bp.Q.value = 1.5;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.7, t + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.2);
        // 撞击：低频爆发
        const impact = ctx.createOscillator();
        impact.type = 'sine';
        impact.frequency.setValueAtTime(50, t + 0.15);
        impact.frequency.exponentialRampToValueAtTime(30, t + 0.22);
        const ig = ctx.createGain();
        ig.gain.setValueAtTime(0.6, t + 0.15);
        ig.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        impact.connect(ig);
        ig.connect(v.gain);
        impact.start(t + 0.15);
        impact.stop(t + 0.24);
    }
    /** 激光炮：充能嗡鸣 */
    playLaserShot(pan = 0) {
        if (!this._rateOk('laser', 80) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.14);
        if (!v)
            return;
        // 充能嗡鸣：快速上升的正弦
        const charge = ctx.createOscillator();
        charge.type = 'sine';
        charge.frequency.setValueAtTime(800, t);
        charge.frequency.exponentialRampToValueAtTime(3200, t + 0.04);
        charge.frequency.exponentialRampToValueAtTime(400, t + 0.12);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.001, t);
        cg.gain.exponentialRampToValueAtTime(0.45, t + 0.03);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        charge.connect(cg);
        cg.connect(v.gain);
        charge.start(t);
        charge.stop(t + 0.12);
    }
    /** 磁轨炮：加速嗡鸣 + 音爆 */
    playSniperShot(pan = 0) {
        if (!this._rateOk('sniper', 200) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.3, SoundPriority.HIGH);
        if (!v)
            return;
        // 电磁加速：锯齿波频率上升
        const accel = ctx.createOscillator();
        accel.type = 'sawtooth';
        accel.frequency.setValueAtTime(60, t);
        accel.frequency.exponentialRampToValueAtTime(600, t + 0.12);
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(0.001, t);
        ag.gain.exponentialRampToValueAtTime(0.35, t + 0.1);
        ag.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.exponentialRampToValueAtTime(2000, t + 0.12);
        accel.connect(lp);
        lp.connect(ag);
        ag.connect(v.gain);
        accel.start(t);
        accel.stop(t + 0.15);
        // 超音速音爆：短促噪声冲击
        const crack = this._noiseBuf(0.05);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.001, t + 0.1);
        cg.gain.exponentialRampToValueAtTime(0.8, t + 0.12);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        crack.connect(hp);
        hp.connect(cg);
        cg.connect(v.gain);
        crack.start(t + 0.1);
        crack.stop(t + 0.18);
    }
    /** 焚化器：点火 + 咆哮 */
    playFlameShot(pan = 0) {
        if (!this._rateOk('flame', 70) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.12, SoundPriority.LOW);
        if (!v)
            return;
        // 点火爆燃：短促噪声冲击
        const ign = this._noiseBuf(0.03);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 1;
        const ig = ctx.createGain();
        ig.gain.setValueAtTime(0.6, t);
        ig.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        ign.connect(bp);
        bp.connect(ig);
        ig.connect(v.gain);
        ign.start(t);
        ign.stop(t + 0.03);
        // 持续喷射：低通噪声
        const jet = this._noiseBuf(0.1);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(800, t + 0.02);
        lp.frequency.linearRampToValueAtTime(400, t + 0.1);
        lp.Q.value = 2;
        const jg = ctx.createGain();
        jg.gain.setValueAtTime(0.001, t);
        jg.gain.exponentialRampToValueAtTime(0.45, t + 0.03);
        jg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        jet.connect(lp);
        lp.connect(jg);
        jg.connect(v.gain);
        jet.start(t + 0.02);
        jet.stop(t + 0.1);
    }
    /** 引力场：低频脉冲 + 共鸣 */
    playMagneticShot(pan = 0) {
        if (!this._rateOk('mag', 150) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.2);
        if (!v)
            return;
        // 引力脉冲：深沉低频
        const pulse = ctx.createOscillator();
        pulse.type = 'sine';
        pulse.frequency.setValueAtTime(45, t);
        pulse.frequency.exponentialRampToValueAtTime(30, t + 0.15);
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(0.6, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        pulse.connect(pg);
        pg.connect(v.gain);
        pulse.start(t);
        pulse.stop(t + 0.18);
        // 金属共振：带通滤波噪声
        const noise = this._noiseBuf(0.15);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(200, t);
        bp.frequency.exponentialRampToValueAtTime(800, t + 0.08);
        bp.frequency.exponentialRampToValueAtTime(150, t + 0.15);
        bp.Q.value = 8;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.15);
    }
    /** 奇点炮：扭曲 + 内爆 */
    playSingularityShot(pan = 0) {
        if (!this._rateOk('sing', 250) || !this.ctx)
            return; // 降低冷却
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.35, SoundPriority.HIGH);
        if (!v)
            return;
        // 空间撕裂：锯齿波频率下坠
        const tear = ctx.createOscillator();
        tear.type = 'sawtooth';
        tear.frequency.setValueAtTime(2000, t);
        tear.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.001, t);
        tg.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
        tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3000, t);
        lp.frequency.exponentialRampToValueAtTime(200, t + 0.25);
        tear.connect(lp);
        lp.connect(tg);
        tg.connect(v.gain);
        tear.start(t);
        tear.stop(t + 0.3);
        // 内爆压缩：反向包络噪声
        const imp = this._noiseBuf(0.15);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(4000, t + 0.15);
        bp.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        bp.Q.value = 4;
        const ig = ctx.createGain();
        ig.gain.setValueAtTime(0.001, t + 0.1);
        ig.gain.exponentialRampToValueAtTime(0.6, t + 0.2);
        ig.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        imp.connect(bp);
        bp.connect(ig);
        ig.connect(v.gain);
        imp.start(t + 0.1);
        imp.stop(t + 0.32);
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
    //  命中 / 死亡 / 逃脱（实时合成，简洁有力）
    // ══════════════════════════════════════════════════════
    /** 命中反馈：星际争霸风格的清晰金属撞击 */
    playEnemyHit(pan = 0, size = 15) {
        if (!this._rateOk('hit', 50) || !this.ctx)
            return; // 降低冷却，支持密集火力
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.08);
        if (!v)
            return;
        // 主音：清晰的金属撞击（类似星际机枪兵命中）
        const osc1 = ctx.createOscillator();
        osc1.type = 'triangle';
        const baseFreq = Math.max(180, Math.min(320, 320 - size * 6));
        osc1.frequency.setValueAtTime(baseFreq, t);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, t + 0.05);
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.6, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc1.connect(g1);
        g1.connect(v.gain);
        osc1.start(t);
        osc1.stop(t + 0.07);
        // 高频泛音：增加清晰度
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(baseFreq * 2.5, t);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, t + 0.03);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.25, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc2.connect(g2);
        g2.connect(v.gain);
        osc2.start(t);
        osc2.stop(t + 0.05);
        // 瞬态噪声：增加打击感
        const noise = this._noiseBuf(0.02);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.02);
    }
    /** 暴击命中：明亮叮当 + 轻微混响 */
    playCritHit(pan = 0) {
        if (!this._rateOk('crit', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.15);
        if (!v)
            return;
        // 明亮叮当：高频正弦波
        const ding = ctx.createOscillator();
        ding.type = 'sine';
        ding.frequency.setValueAtTime(1200, t);
        ding.frequency.exponentialRampToValueAtTime(800, t + 0.1);
        const dg = ctx.createGain();
        dg.gain.setValueAtTime(0.5, t);
        dg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        ding.connect(dg);
        dg.connect(v.gain);
        ding.start(t);
        ding.stop(t + 0.12);
        // 泛音层
        const harm = ctx.createOscillator();
        harm.type = 'sine';
        harm.frequency.setValueAtTime(2400, t);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.2, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        harm.connect(hg);
        hg.connect(v.gain);
        harm.start(t);
        harm.stop(t + 0.08);
    }
    /** 基地受击：警告号角 */
    playBaseHit() {
        if (!this._rateOk('base_hit', 300) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(0, 0.3, SoundPriority.CRITICAL);
        if (!v)
            return;
        // 警告号角：低频锯齿波
        const horn = ctx.createOscillator();
        horn.type = 'sawtooth';
        horn.frequency.setValueAtTime(150, t);
        horn.frequency.setValueAtTime(120, t + 0.1);
        horn.frequency.setValueAtTime(150, t + 0.2);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.001, t);
        hg.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;
        horn.connect(lp);
        lp.connect(hg);
        hg.connect(v.gain);
        horn.start(t);
        horn.stop(t + 0.3);
    }
    /** 普通怪物死亡：星际争霸风格的干脆爆裂 */
    playEnemyDeath(pan = 0) {
        if (!this._rateOk('death', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.18);
        if (!v)
            return;
        // 爆裂主音：快速频率下坠（类似星际虫族死亡）
        const burst = ctx.createOscillator();
        burst.type = 'sawtooth';
        burst.frequency.setValueAtTime(400, t);
        burst.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.5, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2000, t);
        lp.frequency.exponentialRampToValueAtTime(400, t + 0.12);
        burst.connect(lp);
        lp.connect(bg);
        bg.connect(v.gain);
        burst.start(t);
        burst.stop(t + 0.14);
        // 碎裂噪声：短促高频（增加质感）
        const crack = this._noiseBuf(0.06);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.4, t);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        crack.connect(hp);
        hp.connect(cg);
        cg.connect(v.gain);
        crack.start(t);
        crack.stop(t + 0.06);
        // 低频余震：增加重量感
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(100, t + 0.02);
        sub.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.35, t + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        sub.connect(sg);
        sg.connect(v.gain);
        sub.start(t + 0.02);
        sub.stop(t + 0.16);
    }
    /** 大型怪物死亡：星际争霸风格的重型爆裂 */
    playEnemyDeathBig(pan = 0) {
        if (!this._rateOk('death_big', 180) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.28);
        if (!v)
            return;
        // 重型爆裂：多层频率下坠（类似星际重型单位死亡）
        const heavy = ctx.createOscillator();
        heavy.type = 'sawtooth';
        heavy.frequency.setValueAtTime(500, t);
        heavy.frequency.exponentialRampToValueAtTime(60, t + 0.2);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.6, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3000, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
        heavy.connect(lp);
        lp.connect(hg);
        hg.connect(v.gain);
        heavy.start(t);
        heavy.stop(t + 0.22);
        // 金属碎裂：宽频噪声（增加质感）
        const debris = this._noiseBuf(0.12);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(4000, t);
        bp.frequency.exponentialRampToValueAtTime(800, t + 0.1);
        bp.Q.value = 2;
        const dg = ctx.createGain();
        dg.gain.setValueAtTime(0.5, t);
        dg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        debris.connect(bp);
        bp.connect(dg);
        dg.connect(v.gain);
        debris.start(t);
        debris.stop(t + 0.12);
        // 深层低频：增加重量感（类似星际爆炸余震）
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(120, t + 0.03);
        sub.frequency.exponentialRampToValueAtTime(30, t + 0.25);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.5, t + 0.03);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        sub.connect(sg);
        sg.connect(v.gain);
        sub.start(t + 0.03);
        sub.stop(t + 0.26);
    }
    /** Boss 死亡：星际争霸风格的史诗级爆裂 */
    playBossDeath() {
        if (!this._rateOk('boss_death', 300) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(0, 0.45, SoundPriority.CRITICAL);
        if (!v)
            return;
        // 主爆裂：多层锯齿波下坠（类似星际Boss死亡）
        const main = ctx.createOscillator();
        main.type = 'sawtooth';
        main.frequency.setValueAtTime(600, t);
        main.frequency.exponentialRampToValueAtTime(50, t + 0.35);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(0.7, t);
        mg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(4000, t);
        lp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
        main.connect(lp);
        lp.connect(mg);
        mg.connect(v.gain);
        main.start(t);
        main.stop(t + 0.38);
        // 高频瞬态：增加爆裂感
        const crack = this._noiseBuf(0.15);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(5000, t);
        hp.frequency.exponentialRampToValueAtTime(1000, t + 0.12);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.6, t);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        crack.connect(hp);
        hp.connect(cg);
        cg.connect(v.gain);
        crack.start(t);
        crack.stop(t + 0.15);
        // 深层低频：史诗级余震
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(150, t + 0.05);
        sub.frequency.exponentialRampToValueAtTime(25, t + 0.4);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.6, t + 0.05);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        sub.connect(sg);
        sg.connect(v.gain);
        sub.start(t + 0.05);
        sub.stop(t + 0.42);
    }
    /** 怪物逃脱：低沉警告音 */
    playEnemyEscape(pan = 0) {
        if (!this._rateOk('escape', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._synthVoice(pan, 0.15);
        if (!v)
            return;
        // 警告音：低频正弦波下坠
        const warn = ctx.createOscillator();
        warn.type = 'sine';
        warn.frequency.setValueAtTime(180, t);
        warn.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.5, t);
        wg.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        warn.connect(wg);
        wg.connect(v.gain);
        warn.start(t);
        warn.stop(t + 0.15);
    }
    // ══════════════════════════════════════════════════════
    //  UI 音效
    // ══════════════════════════════════════════════════════
    playButtonClick() {
        if (!this._rateOk('click', 80))
            return;
        this._playAsset('ui_click', { volume: 0.75, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playButtonHover() {
        if (!this._rateOk('hover', 150))
            return;
        this._playAsset('ui_hover', { volume: 0.3, priority: SoundPriority.LOW, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playSummon() {
        if (!this._rateOk('summon', 100))
            return;
        this._playAsset('ui_summon', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playPlaceTower() {
        if (!this._rateOk('place', 80))
            return;
        this._playAsset('ui_place', { volume: 0.9, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.05 });
    }
    playSellTower() {
        if (!this._rateOk('sell', 100))
            return;
        this._playAsset('ui_sell', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.04 });
    }
    playDenied() {
        if (!this._rateOk('denied', 100))
            return;
        this._playAsset('ui_denied', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playGoldGain() {
        if (!this._rateOk('gold', 80))
            return;
        this._playAsset('ui_gold', { volume: 0.45, priority: SoundPriority.LOW, bus: AudioBus.UI, pitchJitter: 0.06 });
    }
    playMergeSuccess() {
        if (!this._rateOk('merge', 120))
            return;
        this._playAsset('ui_merge', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playFusionSuccess() {
        if (!this._rateOk('fusion', 150))
            return;
        this._playAsset('ui_fusion', { volume: 0.95, priority: SoundPriority.CRITICAL, bus: AudioBus.UI, pitchJitter: 0 });
    }
    playUpgradeSelect() {
        if (!this._rateOk('upgrade', 120))
            return;
        this._playAsset('ui_upgrade', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
    }
    playSkillReady() {
        if (!this._rateOk('skill', 150))
            return;
        this._playAsset('ui_skill_ready', { volume: 0.75, priority: SoundPriority.HIGH, bus: AudioBus.UI, pitchJitter: 0.03 });
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
        // 应用关卡变奏参数（变速 + 滤波）
        const variation = this.levelVariation;
        if (variation) {
            src.playbackRate.value = variation.rate;
            if (variation.filterFreq > 0) {
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = variation.filterFreq;
                filter.Q.value = 1;
                src.connect(filter);
                filter.connect(g);
                this.loops.set(key, { src, gain: g, filter });
            }
            else {
                src.connect(g);
                this.loops.set(key, { src, gain: g });
            }
        }
        else {
            src.connect(g);
            this.loops.set(key, { src, gain: g });
        }
        src.start(t);
        // 张力层音量由 setTension 动态驱动
        const target = key === 'tension'
            ? Math.max(0.0001, this.tension * 0.85)
            : Math.max(0.0001, want.gain);
        g.gain.exponentialRampToValueAtTime(target, t + Math.max(0.05, want.fade));
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
     * 设置关卡变奏参数（变速 + 滤波）。
     * 每关调用一次，让同一首曲子听起来不同。
     * @param rate 播放速率（0.8~1.3），影响音高和速度
     * @param filterFreq 低通滤波频率（Hz），0 表示不滤波，800~20000 有效
     */
    setLevelVariation(rate, filterFreq) {
        this.levelVariation = { rate: Math.max(0.5, Math.min(2.0, rate)), filterFreq };
        // 如果当前有 bgm 循环层，需要重建以应用新参数
        if (this.loops.has('bgm')) {
            const want = this.desiredLoops.get('bgm');
            if (want) {
                this.loops.delete('bgm');
                this._tryStartLoop('bgm');
            }
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
    /**
     * 按关卡索引选曲 + 施加关卡专属变奏（变速 + 滤波）。
     * 9 关各有不同的听感：
     *   L1 原速原调（轻松入门）
     *   L2 降调 -2 半音（略低沉）
     *   L3 加速 1.15x（紧张感上升）
     *   L4 低通滤波 3000Hz + 降调（压抑感）
     *   L5 加速 1.25x + 升调（激烈）
     *   L6 原速 + 低通 5000Hz（空旷感）
     *   L7 降调 -4 + 加速 1.1x（压迫）
     *   L8 高通滤波 400Hz + 加速 1.3x（尖锐紧迫）
     *   L9 全效果叠加（最终决战）
     */
    setLevelTier(levelIndex) {
        // 所有关卡使用同一首战斗 BGM
        this.setBgm('battle');
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