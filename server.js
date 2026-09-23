var http = require('http')
let fs   = require('fs');
const path = require('path')

const PORT = 8181

let mime = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext  = path.extname(filePath);
    const type = mime[ext] || 'text/plain'

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
    });
})

server.listen(PORT, () => {
    console.log(`\n✅ QazAI сервері іске қосылды!`);
    console.log(`\n🌐 Браузерде ашыңыз: http://localhost:${PORT}\n`);
});
