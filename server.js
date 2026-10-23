/**
 * 发布用的静态文件服务（CommonJS，无任何依赖）。
 *
 * 为什么需要它：发布沙箱的默认静态托管是 `python3 -m http.server $PORT`，
 * 但沙箱镜像不保证有 python3 —— 实测就撞上过 `SITES_START_FAILED`
 * （3000 端口 60s 未监听，而同样的目录本地 python 起服务完全正常）。
 * 自带一个 Node 服务把这条依赖彻底去掉。
 *
 * 契约（发布器要求）：
 *   · 监听 `process.env.PORT`，绑定 0.0.0.0
 *   · 目录根部有 server.js 即被认作启动入口
 *
 * 用法：node server.js   （PORT 默认 3000）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8'
};

function reply(res, code, text, extra) {
    const headers = Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, extra || {});
    res.writeHead(code, headers);
    res.end(text);
}

const server = http.createServer(function (req, res) {
    let urlPath = '/';
    try {
        urlPath = decodeURIComponent((req.url || '/').split('?')[0]) || '/';
    } catch (e) {
        return reply(res, 400, 'Bad Request');
    }
    if (urlPath === '/') urlPath = '/index.html';

    // 目录穿越防护：逐段过滤掉 . 与 ..，再拼到 ROOT 下
    const rel = urlPath.split('/').filter(function (seg) {
        return seg && seg !== '.' && seg !== '..';
    }).join('/');
    const filePath = path.join(ROOT, rel);

    fs.stat(filePath, function (err, st) {
        if (err || !st.isFile()) {
            return reply(res, 404, 'Not Found: ' + urlPath);
        }
        const ext = path.extname(filePath).toLowerCase();
        const headers = {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // html 不缓存，避免发版后浏览器还拿旧入口；其余短缓存即可
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
            'Accept-Ranges': 'bytes'
        };

        // 音频共 12.7MB，支持 Range 让浏览器分段取，不要一次占满连接
        const range = req.headers.range;
        if (range && range.indexOf('bytes=') === 0) {
            const parts = range.slice(6).split('-');
            const start = parts[0] ? parseInt(parts[0], 10) : 0;
            const end = parts[1] ? parseInt(parts[1], 10) : st.size - 1;
            if (isNaN(start) || isNaN(end) || start > end || start >= st.size) {
                return reply(res, 416, 'Range Not Satisfiable', { 'Content-Range': 'bytes */' + st.size });
            }
            const last = Math.min(end, st.size - 1);
            headers['Content-Range'] = 'bytes ' + start + '-' + last + '/' + st.size;
            headers['Content-Length'] = last - start + 1;
            res.writeHead(206, headers);
            fs.createReadStream(filePath, { start: start, end: last }).pipe(res);
            return;
        }

        headers['Content-Length'] = st.size;
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', function () {
    console.log('[publish-server] listening on 0.0.0.0:' + PORT + '  root=' + ROOT);
});
