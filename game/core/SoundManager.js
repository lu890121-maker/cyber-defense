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
/** 音乐清单 */
const MUSIC_TRACKS = {
    menu: 'menu_theme',
    L1: 'level_1',
    L2: 'level_2',
    L3: 'level_3',
    L4: 'level_4',
    L5: 'level_5',
    L6: 'level_6',
    L7: 'level_7',
    L8: 'level_8',
    L9: 'level_9',
    victory: 'victory_theme',
    boss: 'boss_theme'
};
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.muted = false;
        // 总线
        this.buses = {};
        this.masterGain = null;
        this.compressor = null;
        // 声部池（音效）
        this.voices = [];
        this.MAX_VOICES = 32;
        // 音乐管理
        this.musicBuffers = new Map();
        this.currentMusicSource = null;
        this.currentMusicGain = null;
        this.currentTrack = null;
        this.musicLoading = new Set();
        // 音效缓存
        this.sfxBuffers = new Map();
        // 音量设置
        this.busVolumes = {
            [AudioBus.MASTER]: 0.85,
            [AudioBus.MUSIC]: 0.35, // 音乐35%
            [AudioBus.SFX]: 0.75, // 战斗音效75%
            [AudioBus.UI]: 0.60, // UI音效60%
            [AudioBus.AMBIENCE]: 0.30
        };
        // 冷却控制
        this.cooldowns = new Map();
        // 存储键
        this.STORAGE_KEY = 'neon-bastion-audio-v4';
        this.basePath = 'assets/audio/';
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
            // 压缩器防止破音
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -6;
            this.compressor.knee.value = 12;
            this.compressor.ratio.value = 6;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.15;
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
    // ══════════════════════════════════════════════════════
    //  音乐管理
    // ══════════════════════════════════════════════════════
    /** 加载音乐文件 */
    async loadMusic(track) {
        if (!this.ctx || this.musicBuffers.has(MUSIC_TRACKS[track]))
            return;
        if (this.musicLoading.has(track))
            return;
        this.musicLoading.add(track);
        const filename = MUSIC_TRACKS[track];
        try {
            // 优先尝试OGG，回退到MP3
            let res = await fetch(`${this.basePath}music/${filename}.ogg`);
            if (!res.ok) {
                res = await fetch(`${this.basePath}music/${filename}.mp3`);
                if (!res.ok)
                    throw new Error(`音乐文件不存在: ${filename}`);
            }
            const arr = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this.musicBuffers.set(filename, buf);
            console.log(`[Audio] 音乐加载完成: ${filename}`);
        }
        catch (e) {
            console.warn(`[Audio] 音乐加载失败: ${filename}`, e);
        }
        finally {
            this.musicLoading.delete(track);
        }
    }
    /** 预加载所有音乐 */
    async preloadAllMusic() {
        const tracks = Object.keys(MUSIC_TRACKS);
        await Promise.all(tracks.map(t => this.loadMusic(t)));
    }
    /** 播放音乐（带淡入） */
    playMusic(track, fadeDuration = 2.0) {
        if (!this.ctx || track === this.currentTrack)
            return;
        const filename = MUSIC_TRACKS[track];
        const buffer = this.musicBuffers.get(filename);
        if (!buffer) {
            // 音乐未加载，尝试加载后播放
            this.loadMusic(track).then(() => {
                this.playMusic(track, fadeDuration);
            });
            return;
        }
        // 淡出当前音乐
        if (this.currentMusicGain) {
            this.fadeOutMusic(fadeDuration);
        }
        // 延迟启动新音乐
        setTimeout(() => {
            this._startMusicInternal(track, buffer, fadeDuration);
        }, fadeDuration * 1000);
    }
    _startMusicInternal(track, buffer, fadeDuration) {
        if (!this.ctx)
            return;
        const ctx = this.ctx;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(this.buses[AudioBus.MUSIC]);
        source.connect(gain);
        source.start();
        // 淡入
        const t = ctx.currentTime;
        gain.gain.exponentialRampToValueAtTime(this.busVolumes[AudioBus.MUSIC], t + fadeDuration);
        this.currentMusicSource = source;
        this.currentMusicGain = gain;
        this.currentTrack = track;
        console.log(`[Audio] 开始播放音乐: ${track}`);
    }
    /** 淡出音乐 */
    fadeOutMusic(duration = 2.0) {
        if (!this.ctx || !this.currentMusicGain || !this.currentMusicSource)
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        try {
            this.currentMusicGain.gain.cancelScheduledValues(t);
            this.currentMusicGain.gain.setValueAtTime(Math.max(0.0001, this.currentMusicGain.gain.value), t);
            this.currentMusicGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
            this.currentMusicSource.stop(t + duration + 0.1);
        }
        catch (e) {
            console.warn('[Audio] 淡出音乐失败', e);
        }
        this.currentMusicSource = null;
        this.currentMusicGain = null;
        this.currentTrack = null;
    }
    /** 停止音乐 */
    stopMusic() {
        if (!this.currentMusicSource)
            return;
        try {
            this.currentMusicSource.stop();
        }
        catch (e) { /* noop */ }
        this.currentMusicSource = null;
        this.currentMusicGain = null;
        this.currentTrack = null;
    }
    /** 暂停音乐 */
    pauseMusic() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
    }
    /** 恢复音乐 */
    resumeMusic() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    /** 获取当前音乐 */
    getCurrentMusic() {
        return this.currentTrack;
    }
    // ══════════════════════════════════════════════════════
    //  音效管理
    // ══════════════════════════════════════════════════════
    /** 加载音效文件 */
    async loadSfx(name) {
        if (!this.ctx || this.sfxBuffers.has(name))
            return;
        try {
            let res = await fetch(`${this.basePath}sfx/${name}.ogg`);
            if (!res.ok) {
                res = await fetch(`${this.basePath}sfx/${name}.wav`);
                if (!res.ok)
                    throw new Error(`音效文件不存在: ${name}`);
            }
            const arr = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this.sfxBuffers.set(name, buf);
        }
        catch (e) {
            console.warn(`[Audio] 音效加载失败: ${name}`, e);
        }
    }
    /** 预加载所有音效 */
    async preloadAllSfx() {
        const sfxNames = [
            // UI
            'ui_click', 'ui_hover', 'ui_confirm', 'ui_cancel',
            // 塔攻击
            'tower_machine_gun', 'tower_frost', 'tower_electric', 'tower_poison',
            'tower_bomb', 'tower_laser', 'tower_sniper', 'tower_flame',
            'tower_magnetic', 'tower_singularity',
            // 战斗
            'enemy_hit_light', 'enemy_hit_medium', 'enemy_hit_heavy',
            'enemy_death_small', 'enemy_death_elite', 'enemy_death_boss',
            'critical_hit', 'base_hit',
            // 流程
            'wave_start', 'wave_clear', 'boss_appear', 'boss_defeated',
            'victory', 'game_over', 'countdown',
            // 其他
            'upgrade', 'merge', 'sell', 'gold'
        ];
        await Promise.all(sfxNames.map(name => this.loadSfx(name)));
    }
    /** 播放音效 */
    playSfx(name, opts = {}) {
        if (!this.ctx || !this.enabled)
            return;
        const buffer = this.sfxBuffers.get(name);
        if (!buffer) {
            // 音效未加载，使用合成音兜底
            this.playSynthSfx(name, opts);
            return;
        }
        const ctx = this.ctx;
        const t = ctx.currentTime;
        // 清理已结束声部
        for (let i = this.voices.length - 1; i >= 0; i--) {
            if (this.voices[i].end <= t)
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
            const priority = opts.priority ?? SoundPriority.NORMAL;
            if (idx >= 0 && lowest < priority) {
                this.voices[idx].cut();
                this.voices.splice(idx, 1);
            }
            else {
                return;
            }
        }
        const gain = ctx.createGain();
        gain.gain.value = opts.volume ?? 1.0;
        const pan = ctx.createStereoPanner();
        pan.pan.value = opts.pan ?? 0;
        gain.connect(pan);
        pan.connect(this.buses[opts.bus ?? AudioBus.SFX]);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = opts.pitch ?? 1.0;
        source.connect(gain);
        source.start();
        const voice = {
            gain,
            pan,
            priority: opts.priority ?? SoundPriority.NORMAL,
            start: t,
            end: t + buffer.duration + 0.1,
            sources: [source],
            cut: () => {
                try {
                    gain.gain.cancelScheduledValues(t);
                    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
                    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
                    source.stop(t + 0.03);
                }
                catch (e) { /* noop */ }
            }
        };
        this.voices.push(voice);
    }
    /** 合成音效兜底（当音频文件不存在时） */
    playSynthSfx(name, opts = {}) {
        if (!this.ctx)
            return;
        // 冷却检查
        if (!this._canPlay(name, 80))
            return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const v = this._voice(opts.bus ?? AudioBus.SFX, opts.priority ?? SoundPriority.NORMAL, 0.1, opts);
        if (!v)
            return;
        // 简单的合成音
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(v.gain);
        osc.start(t);
        osc.stop(t + 0.1);
    }
    // ══════════════════════════════════════════════════════
    //  塔攻击音效（分层设计）
    // ══════════════════════════════════════════════════════
    /** 连射塔：快速"哒哒" */
    playMachineGunShot(pan = 0) {
        if (!this._canPlay('mg', 60))
            return;
        this.playSfx('tower_machine_gun', { pan, volume: 0.8, priority: SoundPriority.NORMAL });
    }
    /** 霜寒塔：冰冻"嘶嘶" */
    playFrostShot(pan = 0) {
        if (!this._canPlay('frost', 100))
            return;
        this.playSfx('tower_frost', { pan, volume: 0.7, priority: SoundPriority.NORMAL });
    }
    /** 雷弧塔：电弧"噼啪" */
    playElectricShot(pan = 0) {
        if (!this._canPlay('elec', 80))
            return;
        this.playSfx('tower_electric', { pan, volume: 0.75, priority: SoundPriority.NORMAL });
    }
    /** 瘴毒塔：毒液"咕噜" */
    playPoisonShot(pan = 0) {
        if (!this._canPlay('poison', 120))
            return;
        this.playSfx('tower_poison', { pan, volume: 0.7, priority: SoundPriority.NORMAL });
    }
    /** 爆裂塔：爆炸"嘭"（三层：冲击+主体+余波） */
    playBombExplosion(pan = 0) {
        if (!this._canPlay('bomb', 200))
            return;
        this.playSfx('tower_bomb', { pan, volume: 0.9, priority: SoundPriority.HIGH });
    }
    /** 光束塔：激光"嗞" */
    playLaserShot(pan = 0) {
        if (!this._canPlay('laser', 80))
            return;
        this.playSfx('tower_laser', { pan, volume: 0.75, priority: SoundPriority.NORMAL });
    }
    /** 鹰眼塔：狙击"砰" */
    playSniperShot(pan = 0) {
        if (!this._canPlay('sniper', 250))
            return;
        this.playSfx('tower_sniper', { pan, volume: 0.85, priority: SoundPriority.HIGH });
    }
    /** 焚焰塔：火焰"呼呼" */
    playFlameShot(pan = 0) {
        if (!this._canPlay('flame', 70))
            return;
        this.playSfx('tower_flame', { pan, volume: 0.7, priority: SoundPriority.LOW });
    }
    /** 磁引塔：磁力"嗡" */
    playMagneticShot(pan = 0) {
        if (!this._canPlay('mag', 150))
            return;
        this.playSfx('tower_magnetic', { pan, volume: 0.75, priority: SoundPriority.NORMAL });
    }
    /** 奇点塔：奇点"咻" */
    playSingularityShot(pan = 0) {
        if (!this._canPlay('sing', 300))
            return;
        this.playSfx('tower_singularity', { pan, volume: 0.9, priority: SoundPriority.HIGH });
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
    /** 敌人受击（根据体型分层） */
    playEnemyHit(pan = 0, size = 15) {
        if (!this._canPlay('hit', 50))
            return;
        let sfxName = 'enemy_hit_light';
        let volume = 0.6;
        if (size > 25) {
            sfxName = 'enemy_hit_heavy';
            volume = 0.8;
        }
        else if (size > 18) {
            sfxName = 'enemy_hit_medium';
            volume = 0.7;
        }
        this.playSfx(sfxName, { pan, volume, priority: SoundPriority.NORMAL });
    }
    /** 暴击命中 */
    playCritHit(pan = 0) {
        if (!this._canPlay('crit', 100))
            return;
        this.playSfx('critical_hit', { pan, volume: 0.85, priority: SoundPriority.HIGH });
    }
    /** 基地受击 */
    playBaseHit() {
        if (!this._canPlay('base_hit', 300))
            return;
        this.playSfx('base_hit', { volume: 0.9, priority: SoundPriority.CRITICAL });
    }
    /** 小怪死亡 */
    playEnemyDeath(pan = 0) {
        if (!this._canPlay('death', 80))
            return;
        this.playSfx('enemy_death_small', { pan, volume: 0.7, priority: SoundPriority.NORMAL });
    }
    /** 精英死亡 */
    playEnemyDeathBig(pan = 0) {
        if (!this._canPlay('death_big', 120))
            return;
        this.playSfx('enemy_death_elite', { pan, volume: 0.85, priority: SoundPriority.HIGH });
    }
    /** Boss死亡 */
    playBossDeath() {
        if (!this._canPlay('boss_death', 500))
            return;
        this.playSfx('enemy_death_boss', { volume: 1.0, priority: SoundPriority.CRITICAL });
    }
    /** 怪物逃脱 */
    playEnemyEscape(pan = 0) {
        if (!this._canPlay('escape', 100))
            return;
        this.playSfx('enemy_escape', { pan, volume: 0.6, priority: SoundPriority.LOW });
    }
    // ══════════════════════════════════════════════════════
    //  UI 音效
    // ══════════════════════════════════════════════════════
    playButtonClick() {
        if (!this._canPlay('click', 60))
            return;
        this.playSfx('ui_click', { volume: 0.7, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playButtonHover() {
        if (!this._canPlay('hover', 120))
            return;
        this.playSfx('ui_hover', { volume: 0.3, priority: SoundPriority.LOW, bus: AudioBus.UI });
    }
    playSummon() {
        if (!this._canPlay('summon', 100))
            return;
        this.playSfx('ui_summon', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playPlaceTower() {
        if (!this._canPlay('place', 80))
            return;
        this.playSfx('ui_place', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playSellTower() {
        if (!this._canPlay('sell', 100))
            return;
        this.playSfx('sell', { volume: 0.7, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playDenied() {
        if (!this._canPlay('denied', 100))
            return;
        this.playSfx('ui_error', { volume: 0.7, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playGoldGain() {
        if (!this._canPlay('gold', 60))
            return;
        this.playSfx('gold', { volume: 0.5, priority: SoundPriority.LOW, bus: AudioBus.UI });
    }
    playMergeSuccess() {
        if (!this._canPlay('merge', 120))
            return;
        this.playSfx('merge', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playFusionSuccess() {
        if (!this._canPlay('fusion', 150))
            return;
        this.playSfx('ui_confirm', { volume: 0.85, priority: SoundPriority.CRITICAL, bus: AudioBus.UI });
    }
    playUpgradeSelect() {
        if (!this._canPlay('upgrade', 120))
            return;
        this.playSfx('upgrade', { volume: 0.8, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playSkillReady() {
        if (!this._canPlay('skill', 150))
            return;
        this.playSfx('skill_ready', { volume: 0.75, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    // ══════════════════════════════════════════════════════
    //  游戏流程音效
    // ══════════════════════════════════════════════════════
    playWaveStart() {
        if (!this._canPlay('wave_start', 300))
            return;
        this.playSfx('wave_start', { volume: 0.9, priority: SoundPriority.CRITICAL, bus: AudioBus.UI });
    }
    playWaveClear() {
        if (!this._canPlay('wave_clear', 400))
            return;
        this.playSfx('wave_clear', { volume: 0.85, priority: SoundPriority.HIGH, bus: AudioBus.UI });
    }
    playBossSpawn() {
        if (!this._canPlay('boss_spawn', 600))
            return;
        this.playSfx('boss_appear', { volume: 1.0, priority: SoundPriority.CRITICAL });
    }
    playCountdownTick(urgent = false) {
        if (!this._canPlay('tick', 80))
            return;
        this.playSfx('countdown', { volume: urgent ? 0.8 : 0.6, priority: SoundPriority.NORMAL, bus: AudioBus.UI });
    }
    playOverloadActivate() {
        if (!this._canPlay('overload', 400))
            return;
        this.playSfx('skill_activate', { volume: 0.9, priority: SoundPriority.CRITICAL });
    }
    playOverloadEnd() {
        if (!this._canPlay('overload_end', 300))
            return;
        this.playSfx('ui_cancel', { volume: 0.6, priority: SoundPriority.NORMAL, bus: AudioBus.UI });
    }
    playParalyze() {
        if (!this._canPlay('paralyze', 250))
            return;
        this.playSfx('skill_impact', { volume: 0.8, priority: SoundPriority.HIGH });
    }
    playMenuStart() {
        if (!this._canPlay('menu_start', 500))
            return;
        this.playSfx('ui_confirm', { volume: 0.9, priority: SoundPriority.CRITICAL, bus: AudioBus.UI });
    }
    playGameOver() {
        if (!this._canPlay('game_over', 800))
            return;
        this.playSfx('game_over', { volume: 1.0, priority: SoundPriority.CRITICAL, bus: AudioBus.UI });
    }
    playVictory() {
        if (!this._canPlay('victory', 1000))
            return;
        this.playSfx('victory', { volume: 1.0, priority: SoundPriority.CRITICAL, bus: AudioBus.UI });
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
    //  辅助方法
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
    _canPlay(key, cooldownMs) {
        const now = performance.now();
        const last = this.cooldowns.get(key) ?? 0;
        if (now - last < cooldownMs)
            return false;
        this.cooldowns.set(key, now);
        return true;
    }
    /** 解锁音频上下文 */
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
    /** 兼容性方法 */
    load(onProgress) {
        if (onProgress)
            onProgress(1, 1);
        return Promise.resolve();
    }
    startMusic(track = 'menu') {
        this.playMusic(track);
    }
    setBgm(track) {
        if (track === null) {
            this.stopMusic();
        }
        else {
            this.playMusic(track);
        }
    }
    setTension(level) {
        // 张力影响音乐强度，这里简化处理
    }
    setLevelTier(levelIndex) {
        // 根据关卡选择音乐
        const track = `L${levelIndex + 1}`;
        if (MUSIC_TRACKS[track]) {
            this.playMusic(track);
        }
    }
    tick() {
        // 清理过期的冷却记录
        const now = performance.now();
        for (const [key, time] of this.cooldowns.entries()) {
            if (now - time > 1000) {
                this.cooldowns.delete(key);
            }
        }
    }
    setPrepFilter(on) {
        // 准备期可以降低音乐音量
        if (on) {
            this.setBusVolume(AudioBus.MUSIC, this.busVolumes[AudioBus.MUSIC] * 0.5);
        }
        else {
            this.setBusVolume(AudioBus.MUSIC, this.busVolumes[AudioBus.MUSIC]);
        }
    }
    suspend() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => { });
        }
    }
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }
    getDebugState() {
        return {
            ctx: this.ctx ? this.ctx.state : 'none',
            enabled: this.enabled,
            muted: this.muted,
            currentMusic: this.currentTrack,
            musicBuffers: this.musicBuffers.size,
            sfxBuffers: this.sfxBuffers.size,
            voices: this.voices.length,
            busVolumes: this.busVolumes
        };
    }
}
//# sourceMappingURL=SoundManager.js.map