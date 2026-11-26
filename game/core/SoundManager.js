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
export var AudioBus;
(function (AudioBus) {
    AudioBus["MASTER"] = "master";
    AudioBus["MUSIC"] = "music";
    AudioBus["SFX"] = "sfx";
    AudioBus["UI"] = "ui";
    AudioBus["AMBIENCE"] = "ambience";
})(AudioBus || (AudioBus = {}));
/** 声部优先级 */
export var SoundPriority;
(function (SoundPriority) {
    SoundPriority[SoundPriority["AMBIENT"] = 0] = "AMBIENT";
    SoundPriority[SoundPriority["LOW"] = 1] = "LOW";
    SoundPriority[SoundPriority["NORMAL"] = 2] = "NORMAL";
    SoundPriority[SoundPriority["HIGH"] = 3] = "HIGH";
    SoundPriority[SoundPriority["CRITICAL"] = 4] = "CRITICAL";
})(SoundPriority || (SoundPriority = {}));
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.muted = false;
        // 总线
        this.buses = {};
        this.masterGain = null;
        this.compressor = null;
        // 声部池
        this.voices = [];
        this.MAX_VOICES = 24;
        // 循环层
        this.loops = new Map();
        this.currentBgm = null;
        // 音量设置
        this.busVolumes = {
            [AudioBus.MASTER]: 0.85,
            [AudioBus.MUSIC]: 0.5,
            [AudioBus.SFX]: 0.8,
            [AudioBus.UI]: 0.7,
            [AudioBus.AMBIENCE]: 0.3
        };
        // 冷却控制
        this.cooldowns = new Map();
        // 存储键
        this.STORAGE_KEY = 'neon-bastion-audio-v3';
        this.init();
        this.loadSettings();
    }
    init() {
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) {
                this.enabled = false;
                return;
            }
            const ctx = new Ctor();
            this.ctx = ctx;
            // 主总线 → 压缩器 → 输出
            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = this.busVolumes[AudioBus.MASTER];
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -12;
            this.compressor.knee.value = 10;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.1;
            this.masterGain.connect(this.compressor);
            this.compressor.connect(ctx.destination);
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
        }
        catch (e) {
            console.warn('[Audio] Web Audio API 不可用', e);
            this.enabled = false;
        }
    }
    /** 加载音频资源（兼容性方法） */
    load(onProgress) {
        // 全合成音效，无需加载
        if (onProgress)
            onProgress(1, 1);
        return Promise.resolve();
    }
    /** 启动音乐（兼容性方法） */
    startMusic(track = 'menu') {
        this.setBgm(track);
    }
    /** 设置张力（兼容性方法） */
    setTension(level) {
        // 张力影响音乐强度，这里简化处理
        // 可以根据 level 调整音量或切换音乐
    }
    /** 设置关卡层级（兼容性方法） */
    setLevelTier(levelIndex) {
        // 根据关卡选择音乐
        if (levelIndex < 3) {
            this.setBgm('menu');
        }
        else if (levelIndex < 7) {
            this.setBgm('battle');
        }
        else {
            this.setBgm('boss');
        }
    }
    /** 每帧更新（兼容性方法） */
    tick() {
        // 清理过期的冷却记录
        const now = performance.now();
        for (const [key, time] of this.cooldowns.entries()) {
            if (now - time > 1000) {
                this.cooldowns.delete(key);
            }
        }
    }
    /** 设置准备期滤镜（兼容性方法） */
    setPrepFilter(on) {
        // 准备期可以降低音乐音量
        if (on) {
            this.setBusVolume(AudioBus.MUSIC, this.busVolumes[AudioBus.MUSIC] * 0.5);
        }
        else {
            this.setBusVolume(AudioBus.MUSIC, this.busVolumes[AudioBus.MUSIC]);
        }
    }
    /** 解锁音频上下文（用户交互后调用） */
    unlock() {
        if (!this.ctx)
            return;
        if (this.ctx.state !== 'running') {
            this.ctx.resume().then(() => {
                console.log('[Audio] 音频上下文已解锁');
            }).catch((err) => {
                console.warn('[Audio] 解锁失败', err);
            });
        }
    }
    // ══════════════════════════════════════════════════════
    //  设置管理
    // ══════════════════════════════════════════════════════
    setEnabled(enabled) {
        this.enabled = enabled;
        this._applyMasterGain();
        this._saveSettings();
    }
    isEnabled() {
        return this.enabled;
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
    _applyMasterGain() {
        if (!this.masterGain || !this.ctx)
            return;
        const target = this.enabled && !this.muted ? this.busVolumes[AudioBus.MASTER] : 0;
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
                sfx: this.busVolumes[AudioBus.SFX],
                ui: this.busVolumes[AudioBus.UI]
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
            if (typeof s.ui === 'number')
                this.busVolumes[AudioBus.UI] = s.ui;
            this._applyMasterGain();
        }
        catch (e) { /* noop */ }
    }
    // ══════════════════════════════════════════════════════
    //  声部池管理
    // ══════════════════════════════════════════════════════
    _voice(bus, priority, duration, opts = {}) {
        if (!this.enabled || !this.ctx)
            return null;
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
    /** 冷却检查 */
    _canPlay(key, cooldownMs) {
        const now = performance.now();
        const last = this.cooldowns.get(key) ?? 0;
        if (now - last < cooldownMs)
            return false;
        this.cooldowns.set(key, now);
        return true;
    }
    // ══════════════════════════════════════════════════════
    //  塔攻击音效（卡通赛博朋克风格）
    // ══════════════════════════════════════════════════════
    /** 脉冲炮：快速连射，清脆"哒哒" */
    playMachineGunShot(pan = 0) {
        if (!this._canPlay('mg', 80) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.08, { pan });
        if (!v)
            return;
        // 清脆方波
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.06);
        // 噪声爆发
        const noise = this._noiseBuf(0.03);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.03);
    }
    /** 冰霜炮：冷冽"嘶嘶" */
    playFrostShot(pan = 0) {
        if (!this._canPlay('frost', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.15, { pan });
        if (!v)
            return;
        // 高频噪声
        const noise = this._noiseBuf(0.12);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(3000, t);
        hp.frequency.exponentialRampToValueAtTime(5000, t + 0.08);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.12);
        // 冰晶叮当
        const crystal = ctx.createOscillator();
        crystal.type = 'sine';
        crystal.frequency.setValueAtTime(2800, t + 0.02);
        crystal.frequency.exponentialRampToValueAtTime(2000, t + 0.1);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.2, t + 0.02);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        crystal.connect(cg);
        cg.connect(v.gain);
        crystal.start(t + 0.02);
        crystal.stop(t + 0.1);
    }
    /** 电磁炮：电弧"噼啪" */
    playElectricShot(pan = 0) {
        if (!this._canPlay('elec', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.12, { pan });
        if (!v)
            return;
        // 电弧锯齿波
        const arc = ctx.createOscillator();
        arc.type = 'sawtooth';
        arc.frequency.setValueAtTime(150, t);
        arc.frequency.setValueAtTime(600, t + 0.01);
        arc.frequency.setValueAtTime(200, t + 0.02);
        arc.frequency.setValueAtTime(800, t + 0.03);
        arc.frequency.setValueAtTime(180, t + 0.05);
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(0.35, t);
        ag.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        arc.connect(ag);
        ag.connect(v.gain);
        arc.start(t);
        arc.stop(t + 0.1);
        // 放电噪声
        const noise = this._noiseBuf(0.05);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 4000;
        bp.Q.value = 3;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.25, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.05);
    }
    /** 毒液炮：黏稠"咕噜" */
    playPoisonShot(pan = 0) {
        if (!this._canPlay('poison', 140) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.18, { pan });
        if (!v)
            return;
        // 低频振荡
        const bubble = ctx.createOscillator();
        bubble.type = 'sine';
        bubble.frequency.setValueAtTime(180, t);
        bubble.frequency.setValueAtTime(240, t + 0.04);
        bubble.frequency.setValueAtTime(160, t + 0.08);
        bubble.frequency.setValueAtTime(220, t + 0.12);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.3, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        bubble.connect(bg);
        bg.connect(v.gain);
        bubble.start(t);
        bubble.stop(t + 0.15);
        // 黏液噪声
        const noise = this._noiseBuf(0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        lp.Q.value = 4;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.15);
    }
    /** 炸弹台：Q弹"嘭" */
    playBombExplosion(pan = 0) {
        if (!this._canPlay('bomb', 200) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.25, { pan });
        if (!v)
            return;
        // 低频冲击
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(120, t);
        boom.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.5, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        boom.connect(bg);
        bg.connect(v.gain);
        boom.start(t);
        boom.stop(t + 0.2);
        // 爆炸噪声
        const noise = this._noiseBuf(0.18);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1500, t);
        lp.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.4, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.18);
    }
    /** 激光炮：锐利"嗞" */
    playLaserShot(pan = 0) {
        if (!this._canPlay('laser', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.14, { pan });
        if (!v)
            return;
        // 高频扫频
        const laser = ctx.createOscillator();
        laser.type = 'sine';
        laser.frequency.setValueAtTime(1200, t);
        laser.frequency.exponentialRampToValueAtTime(3500, t + 0.04);
        laser.frequency.exponentialRampToValueAtTime(800, t + 0.12);
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0.001, t);
        lg.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
        lg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        laser.connect(lg);
        lg.connect(v.gain);
        laser.start(t);
        laser.stop(t + 0.12);
    }
    /** 磁轨炮：有力"砰" */
    playSniperShot(pan = 0) {
        if (!this._canPlay('sniper', 250) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.3, { pan });
        if (!v)
            return;
        // 中频方波
        const shot = ctx.createOscillator();
        shot.type = 'square';
        shot.frequency.setValueAtTime(300, t);
        shot.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.4, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        shot.connect(sg);
        sg.connect(v.gain);
        shot.start(t);
        shot.stop(t + 0.15);
        // 噪声爆发
        const noise = this._noiseBuf(0.08);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.08);
    }
    /** 焚化器：持续"呼呼" */
    playFlameShot(pan = 0) {
        if (!this._canPlay('flame', 90) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.LOW, 0.12, { pan });
        if (!v)
            return;
        // 带通噪声
        const noise = this._noiseBuf(0.1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(800, t);
        bp.frequency.linearRampToValueAtTime(600, t + 0.1);
        bp.Q.value = 2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.1);
    }
    /** 引力场：深沉"嗡" */
    playMagneticShot(pan = 0) {
        if (!this._canPlay('mag', 180) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.2, { pan });
        if (!v)
            return;
        // 低频正弦
        const pulse = ctx.createOscillator();
        pulse.type = 'sine';
        pulse.frequency.setValueAtTime(60, t);
        pulse.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(0.4, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        pulse.connect(pg);
        pg.connect(v.gain);
        pulse.start(t);
        pulse.stop(t + 0.18);
    }
    /** 奇点炮：科幻"咻" */
    playSingularityShot(pan = 0) {
        if (!this._canPlay('sing', 300) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.35, { pan });
        if (!v)
            return;
        // 快速频率下坠
        const warp = ctx.createOscillator();
        warp.type = 'sawtooth';
        warp.frequency.setValueAtTime(1500, t);
        warp.frequency.exponentialRampToValueAtTime(80, t + 0.25);
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.001, t);
        wg.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
        wg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2000, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
        warp.connect(lp);
        lp.connect(wg);
        wg.connect(v.gain);
        warp.start(t);
        warp.stop(t + 0.3);
    }
    /** 按塔类型分发 */
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
    //  战斗反馈音效
    // ══════════════════════════════════════════════════════
    /** 命中：清脆"叮" */
    playEnemyHit(pan = 0, size = 15) {
        if (!this._canPlay('hit', 60) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.08, { pan });
        if (!v)
            return;
        const freq = Math.max(600, Math.min(1200, 1200 - size * 30));
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.07);
    }
    /** 暴击：明亮"叮当" */
    playCritHit(pan = 0) {
        if (!this._canPlay('crit', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.15, { pan });
        if (!v)
            return;
        // 双音叠加
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 1400;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.3, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc1.connect(g1);
        g1.connect(v.gain);
        osc1.start(t);
        osc1.stop(t + 0.12);
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 2100;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.2, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc2.connect(g2);
        g2.connect(v.gain);
        osc2.start(t + 0.02);
        osc2.stop(t + 0.1);
    }
    /** 基地受击：警告"嗡" */
    playBaseHit() {
        if (!this._canPlay('base_hit', 400) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.CRITICAL, 0.3);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.setValueAtTime(120, t + 0.1);
        osc.frequency.setValueAtTime(150, t + 0.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        osc.connect(lp);
        lp.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.3);
    }
    /** 小怪死亡：短促"噗" */
    playEnemyDeath(pan = 0) {
        if (!this._canPlay('death', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.15, { pan });
        if (!v)
            return;
        // 频率下坠
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.3, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(og);
        og.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.12);
        // 噪声
        const noise = this._noiseBuf(0.08);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.08);
    }
    /** 大怪死亡：重型"嘭" */
    playEnemyDeathBig(pan = 0) {
        if (!this._canPlay('death_big', 150) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.25, { pan });
        if (!v)
            return;
        // 低频冲击
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(100, t);
        boom.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.4, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        boom.connect(bg);
        bg.connect(v.gain);
        boom.start(t);
        boom.stop(t + 0.22);
        // 爆炸噪声
        const noise = this._noiseBuf(0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1200, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.12);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.35, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.15);
    }
    /** Boss死亡：史诗"轰" */
    playBossDeath() {
        if (!this._canPlay('boss_death', 500) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.CRITICAL, 0.5);
        if (!v)
            return;
        // 多层频率下坠
        const main = ctx.createOscillator();
        main.type = 'sawtooth';
        main.frequency.setValueAtTime(400, t);
        main.frequency.exponentialRampToValueAtTime(60, t + 0.35);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(0.5, t);
        mg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2500, t);
        lp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
        main.connect(lp);
        lp.connect(mg);
        mg.connect(v.gain);
        main.start(t);
        main.stop(t + 0.4);
        // 低频余震
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(80, t + 0.05);
        sub.frequency.exponentialRampToValueAtTime(30, t + 0.4);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.4, t + 0.05);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        sub.connect(sg);
        sg.connect(v.gain);
        sub.start(t + 0.05);
        sub.stop(t + 0.45);
    }
    /** 怪物逃脱：低沉"呜" */
    playEnemyEscape(pan = 0) {
        if (!this._canPlay('escape', 150) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.NORMAL, 0.15, { pan });
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.15);
    }
    // ══════════════════════════════════════════════════════
    //  UI 音效
    // ══════════════════════════════════════════════════════
    /** 按钮点击：柔和"哒" */
    playButtonClick() {
        if (!this._canPlay('click', 80) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.06);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.06);
    }
    /** 按钮悬停：极微妙"嗒" */
    playButtonHover() {
        if (!this._canPlay('hover', 150) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.LOW, 0.04);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.04);
    }
    /** 召唤：明亮"叮" */
    playSummon() {
        if (!this._canPlay('summon', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.1);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(1320, t + 0.03);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.1);
    }
    /** 建造：上行"叮叮" */
    playPlaceTower() {
        if (!this._canPlay('place', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.12);
        if (!v)
            return;
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 660;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.25, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc1.connect(g1);
        g1.connect(v.gain);
        osc1.start(t);
        osc1.stop(t + 0.06);
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 880;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.25, t + 0.04);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc2.connect(g2);
        g2.connect(v.gain);
        osc2.start(t + 0.04);
        osc2.stop(t + 0.1);
    }
    /** 出售：柔和"沙" */
    playSellTower() {
        if (!this._canPlay('sell', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.1);
        if (!v)
            return;
        const noise = this._noiseBuf(0.08);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1200;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        noise.connect(lp);
        lp.connect(ng);
        ng.connect(v.gain);
        noise.start(t);
        noise.stop(t + 0.08);
    }
    /** 拒绝：低沉"嗡" */
    playDenied() {
        if (!this._canPlay('denied', 120) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.12);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.setValueAtTime(150, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        osc.connect(lp);
        lp.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.12);
    }
    /** 金币获取：清脆"叮" */
    playGoldGain() {
        if (!this._canPlay('gold', 80) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.LOW, 0.08);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1600;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.08);
    }
    /** 合成成功：明亮"叮叮" */
    playMergeSuccess() {
        if (!this._canPlay('merge', 150) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.15);
        if (!v)
            return;
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 880;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.3, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc1.connect(g1);
        g1.connect(v.gain);
        osc1.start(t);
        osc1.stop(t + 0.08);
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 1320;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.3, t + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc2.connect(g2);
        g2.connect(v.gain);
        osc2.start(t + 0.05);
        osc2.stop(t + 0.13);
    }
    /** 融合成功：更亮"叮叮叮" */
    playFusionSuccess() {
        if (!this._canPlay('fusion', 200) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.CRITICAL, 0.2);
        if (!v)
            return;
        const freqs = [880, 1100, 1320];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.3, t + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.08);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.05);
            osc.stop(t + i * 0.05 + 0.1);
        });
    }
    /** 升级选择：上行音阶 */
    playUpgradeSelect() {
        if (!this._canPlay('upgrade', 150) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.18);
        if (!v)
            return;
        const freqs = [660, 880, 1100];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.25, t + i * 0.04);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.06);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.04);
            osc.stop(t + i * 0.04 + 0.08);
        });
    }
    /** 技能就绪：明亮提示 */
    playSkillReady() {
        if (!this._canPlay('skill', 180) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.15);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.setValueAtTime(1600, t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.15);
    }
    // ══════════════════════════════════════════════════════
    //  游戏流程音效
    // ══════════════════════════════════════════════════════
    /** 波次开始：警报"嘟嘟" */
    playWaveStart() {
        if (!this._canPlay('wave_start', 300) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.CRITICAL, 0.2);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.setValueAtTime(660, t + 0.08);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1000;
        osc.connect(lp);
        lp.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.2);
    }
    /** 波次结束：胜利号角 */
    playWaveClear() {
        if (!this._canPlay('wave_clear', 400) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.HIGH, 0.25);
        if (!v)
            return;
        const freqs = [523, 659, 784]; // C E G
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.25, t + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.2);
        });
    }
    /** Boss出现：深沉警告 */
    playBossSpawn() {
        if (!this._canPlay('boss_spawn', 600) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.CRITICAL, 0.4);
        if (!v)
            return;
        // 低频轰鸣
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300;
        osc.connect(lp);
        lp.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.4);
    }
    /** 倒计时滴答 */
    playCountdownTick(urgent = false) {
        if (!this._canPlay('tick', 100) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.NORMAL, 0.06);
        if (!v)
            return;
        const freq = urgent ? 880 : 660;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(urgent ? 0.3 : 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.06);
    }
    /** 过载激活 */
    playOverloadActivate() {
        if (!this._canPlay('overload', 500) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.CRITICAL, 0.3);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.28);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.3);
    }
    /** 过载结束 */
    playOverloadEnd() {
        if (!this._canPlay('overload_end', 400) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.NORMAL, 0.15);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.15);
    }
    /** 麻痹效果 */
    playParalyze() {
        if (!this._canPlay('paralyze', 300) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.SFX, SoundPriority.HIGH, 0.2);
        if (!v)
            return;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.setValueAtTime(200, t + 0.05);
        osc.frequency.setValueAtTime(300, t + 0.1);
        osc.frequency.setValueAtTime(200, t + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        osc.connect(lp);
        lp.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.2);
    }
    /** 菜单开始 */
    playMenuStart() {
        if (!this._canPlay('menu_start', 500) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.CRITICAL, 0.3);
        if (!v)
            return;
        const freqs = [523, 659, 784, 1047]; // C E G C
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.25, t + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.2);
        });
    }
    /** 游戏结束：下行音阶 */
    playGameOver() {
        if (!this._canPlay('game_over', 800) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.CRITICAL, 0.4);
        if (!v)
            return;
        const freqs = [784, 659, 523, 392]; // G E C G(低)
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.3, t + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.08);
            osc.stop(t + i * 0.08 + 0.25);
        });
    }
    /** 胜利：上行大调和弦 */
    playVictory() {
        if (!this._canPlay('victory', 1000) || !this.ctx)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(AudioBus.UI, SoundPriority.CRITICAL, 0.5);
        if (!v)
            return;
        const freqs = [523, 659, 784, 1047, 1319]; // C E G C E
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.25, t + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
            osc.connect(g);
            g.connect(v.gain);
            osc.start(t + i * 0.08);
            osc.stop(t + i * 0.08 + 0.35);
        });
    }
    // ══════════════════════════════════════════════════════
    //  背景音
    // ══════════════════════════════════════════════════════
    /** 启动菜单背景音 */
    startMenuAmbience() {
        if (!this.ctx || this.loops.has('menu'))
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(this.buses[AudioBus.AMBIENCE]);
        // 柔和的合成器垫音
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 220;
        const g1 = ctx.createGain();
        g1.gain.value = 0.15;
        osc1.connect(g1);
        g1.connect(gain);
        osc1.start(t);
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 330;
        const g2 = ctx.createGain();
        g2.gain.value = 0.1;
        osc2.connect(g2);
        g2.connect(gain);
        osc2.start(t);
        // 淡入
        gain.gain.exponentialRampToValueAtTime(this.busVolumes[AudioBus.AMBIENCE], t + 2);
        this.loops.set('menu', {
            nodes: [osc1, osc2, g1, g2],
            gain,
            stop: () => {
                const stopT = ctx.currentTime;
                gain.gain.exponentialRampToValueAtTime(0.0001, stopT + 1);
                osc1.stop(stopT + 1.1);
                osc2.stop(stopT + 1.1);
            }
        });
    }
    /** 启动战斗背景音 */
    startBattleMusic() {
        if (!this.ctx || this.loops.has('battle'))
            return;
        this.stopMenuAmbience();
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(this.buses[AudioBus.MUSIC]);
        // 鼓点节奏
        const drumLoop = () => {
            if (!this.loops.has('battle'))
                return;
            const now = ctx.currentTime;
            // 底鼓
            const kick = ctx.createOscillator();
            kick.type = 'sine';
            kick.frequency.setValueAtTime(150, now);
            kick.frequency.exponentialRampToValueAtTime(50, now + 0.08);
            const kg = ctx.createGain();
            kg.gain.setValueAtTime(0.4, now);
            kg.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            kick.connect(kg);
            kg.connect(gain);
            kick.start(now);
            kick.stop(now + 0.1);
            // 军鼓（噪声）
            setTimeout(() => {
                if (!this.loops.has('battle'))
                    return;
                const snareTime = ctx.currentTime;
                const noise = this._noiseBuf(0.05);
                const hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 2000;
                const ng = ctx.createGain();
                ng.gain.setValueAtTime(0.2, snareTime);
                ng.gain.exponentialRampToValueAtTime(0.001, snareTime + 0.04);
                noise.connect(hp);
                hp.connect(ng);
                ng.connect(gain);
                noise.start(snareTime);
                noise.stop(snareTime + 0.05);
            }, 250);
            setTimeout(drumLoop, 500);
        };
        // 贝斯线
        const bassNotes = [110, 110, 146.83, 130.81]; // A A D C
        let bassIndex = 0;
        const bassLoop = () => {
            if (!this.loops.has('battle'))
                return;
            const now = ctx.currentTime;
            const bass = ctx.createOscillator();
            bass.type = 'sawtooth';
            bass.frequency.value = bassNotes[bassIndex % bassNotes.length];
            const bg = ctx.createGain();
            bg.gain.setValueAtTime(0.15, now);
            bg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 400;
            bass.connect(lp);
            lp.connect(bg);
            bg.connect(gain);
            bass.start(now);
            bass.stop(now + 0.45);
            bassIndex++;
            setTimeout(bassLoop, 500);
        };
        // 淡入
        gain.gain.exponentialRampToValueAtTime(this.busVolumes[AudioBus.MUSIC], t + 1.5);
        setTimeout(drumLoop, 100);
        setTimeout(bassLoop, 100);
        this.loops.set('battle', {
            nodes: [],
            gain,
            stop: () => {
                const stopT = ctx.currentTime;
                gain.gain.exponentialRampToValueAtTime(0.0001, stopT + 1);
            }
        });
    }
    /** 启动Boss战音乐 */
    startBossMusic() {
        if (!this.ctx || this.loops.has('boss'))
            return;
        this.stopBattleMusic();
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(this.buses[AudioBus.MUSIC]);
        // 紧张的鼓点
        const drumLoop = () => {
            if (!this.loops.has('boss'))
                return;
            const now = ctx.currentTime;
            const kick = ctx.createOscillator();
            kick.type = 'sine';
            kick.frequency.setValueAtTime(120, now);
            kick.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            const kg = ctx.createGain();
            kg.gain.setValueAtTime(0.5, now);
            kg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            kick.connect(kg);
            kg.connect(gain);
            kick.start(now);
            kick.stop(now + 0.12);
            setTimeout(drumLoop, 400);
        };
        // 不和谐和弦
        const chordLoop = () => {
            if (!this.loops.has('boss'))
                return;
            const now = ctx.currentTime;
            const freqs = [138.59, 164.81, 196]; // C# E G
            freqs.forEach(freq => {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                const og = ctx.createGain();
                og.gain.setValueAtTime(0.08, now);
                og.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 600;
                osc.connect(lp);
                lp.connect(og);
                og.connect(gain);
                osc.start(now);
                osc.stop(now + 0.85);
            });
            setTimeout(chordLoop, 800);
        };
        // 淡入
        gain.gain.exponentialRampToValueAtTime(this.busVolumes[AudioBus.MUSIC] * 1.2, t + 1);
        setTimeout(drumLoop, 100);
        setTimeout(chordLoop, 200);
        this.loops.set('boss', {
            nodes: [],
            gain,
            stop: () => {
                const stopT = ctx.currentTime;
                gain.gain.exponentialRampToValueAtTime(0.0001, stopT + 1);
            }
        });
    }
    /** 停止菜单背景音 */
    stopMenuAmbience() {
        const loop = this.loops.get('menu');
        if (loop) {
            loop.stop();
            this.loops.delete('menu');
        }
    }
    /** 停止战斗音乐 */
    stopBattleMusic() {
        const loop = this.loops.get('battle');
        if (loop) {
            loop.stop();
            this.loops.delete('battle');
        }
    }
    /** 停止Boss音乐 */
    stopBossMusic() {
        const loop = this.loops.get('boss');
        if (loop) {
            loop.stop();
            this.loops.delete('boss');
        }
    }
    /** 设置BGM */
    setBgm(track) {
        if (track === this.currentBgm)
            return;
        // 停止当前
        this.stopMenuAmbience();
        this.stopBattleMusic();
        this.stopBossMusic();
        // 启动新的
        if (track === 'menu') {
            this.startMenuAmbience();
        }
        else if (track === 'battle') {
            this.startBattleMusic();
        }
        else if (track === 'boss') {
            this.startBossMusic();
        }
        this.currentBgm = track;
    }
    /** 获取当前BGM */
    getBgm() {
        return this.currentBgm;
    }
    // ══════════════════════════════════════════════════════
    //  辅助方法
    // ══════════════════════════════════════════════════════
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
    /** 全局暂停 */
    suspend() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => { });
        }
    }
    /** 全局恢复 */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }
    /** 诊断状态 */
    getDebugState() {
        return {
            ctx: this.ctx ? this.ctx.state : 'none',
            enabled: this.enabled,
            muted: this.muted,
            bgm: this.currentBgm,
            loops: Array.from(this.loops.keys()),
            voices: this.voices.length,
            busVolumes: this.busVolumes
        };
    }
}
//# sourceMappingURL=SoundManager.js.map