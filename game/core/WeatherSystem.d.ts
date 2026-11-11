/**
 * 天气系统 - 每关不同的天气效果
 * 支持：雨、雪、雾、沙尘暴、极光、糖果雨、陨石雨
 */
export declare enum WeatherType {
    NONE = "none",
    RAIN = "rain",
    SNOW = "snow",
    FOG = "fog",
    SANDSTORM = "sandstorm",
    AURORA = "aurora",
    CANDY_RAIN = "candy_rain",
    METEOR_RAIN = "meteor_rain"
}
export declare class WeatherSystem {
    private particles;
    private weatherType;
    private canvasWidth;
    private canvasHeight;
    private time;
    constructor(canvasWidth: number, canvasHeight: number);
    setWeather(type: WeatherType): void;
    getWeather(): WeatherType;
    update(deltaTime: number): void;
    private spawnParticles;
    private spawnRain;
    private spawnSnow;
    private spawnFog;
    private spawnSandstorm;
    private spawnAurora;
    private spawnCandyRain;
    private spawnMeteorRain;
    render(ctx: CanvasRenderingContext2D): void;
    private renderRain;
    private renderSnow;
    private renderFog;
    private renderSand;
    private renderAurora;
    private renderCandy;
    private renderMeteor;
}
