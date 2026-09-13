const express = require('express');
const cors = require('cors');
const addonRouter = require('./addon');
const config = require('./config');
const xem20Client = require('./services/xem20Client');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTML Web Configuration & Install Page
app.get('/', (req, res) => {
  const manifestUrl = 'http://127.0.0.1:7000/manifest.json';

  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XEM20 Stremio Addon</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    body { background: radial-gradient(circle at top, #1e1b4b 0%, #030712 100%); }
  </style>
</head>
<body class="min-h-screen text-slate-100 flex items-center justify-center p-4">
  <div class="max-w-xl w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
    <div class="text-center space-y-3">
      <div class="inline-flex p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 text-3xl">
        <i class="fa-solid fa-film"></i>
      </div>
      <h1 class="text-3xl font-black tracking-tight text-white">XEM20 Stremio Addon</h1>
      <p class="text-slate-400 text-sm">Xem phim 4K UHD, 1080p Bluray, Thuyết Minh & Vietsub đỉnh cao từ xem20.net (Xem14)</p>
    </div>

    <div class="space-y-3 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80 text-sm">
      <div class="flex items-center justify-between">
        <span class="text-slate-400">Trạng thái máy chủ:</span>
        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Sẵn sàng hoạt động
        </span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-slate-400">Tài khoản XEM20:</span>
        <span class="font-mono text-xs text-indigo-300">${config.xem20.username}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-slate-400">Giao thức phát:</span>
        <span class="text-xs text-slate-300">HTTP 206 Direct Range Stream</span>
      </div>
    </div>

    <div class="space-y-4">
      <div class="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl space-y-2">
        <p class="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Link cài đặt Addon:</p>
        <div class="flex gap-2">
          <input type="text" readonly value="${manifestUrl}" id="manifestInput"
                 class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-emerald-400 focus:outline-none select-all">
          <button onclick="navigator.clipboard.writeText(document.getElementById('manifestInput').value); alert('Đã sao chép link! Hãy mở Stremio và dán vào ô tìm kiếm Addons.');"
                  class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md">
            Sao Chép
          </button>
        </div>
      </div>

      <div class="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl text-xs text-slate-300 space-y-2">
        <p class="font-bold text-slate-200 text-sm">👉 Cách cài đặt chuẩn vào Stremio:</p>
        <ol class="list-decimal list-inside space-y-1.5 text-slate-400">
          <li>Mở ứng dụng <span class="text-slate-200 font-semibold">Stremio</span> trên máy tính.</li>
          <li>Bấm vào biểu tượng <span class="text-slate-200 font-semibold">Addons</span> (mảnh ghép 🧩 ở thanh bên trái).</li>
          <li>Dán link <code class="text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded font-mono">${manifestUrl}</code> vào ô tìm kiếm Addons rồi nhấn <span class="text-slate-200 font-semibold">Enter</span>.</li>
          <li>Bấm nút <span class="text-indigo-400 font-bold">Install</span> (Cài đặt) màu xanh vừa hiện ra.</li>
        </ol>
      </div>
    </div>

    <div class="border-t border-slate-800/80 pt-4 text-xs text-slate-500 space-y-1">
      <p>• Hỗ trợ Stremio trên Windows, macOS, Linux, Android, Android TV, Google TV.</p>
      <p>• Với điện thoại/Smart TV khác: Dán link Manifest trên vào ô tìm kiếm Addon trong app Stremio.</p>
    </div>
  </div>
</body>
</html>`);
});

// Attach Stremio router
app.use(addonRouter);

app.listen(config.port, async () => {
  console.log(`====================================================`);
  console.log(`🚀 XEM20 Stremio Addon đang chạy tại: http://localhost:${config.port}`);
  console.log(`👉 Link Manifest: http://127.0.0.1:${config.port}/manifest.json`);
  console.log(`====================================================`);

  try {
    await xem20Client.ensureLoggedIn();
  } catch (e) {
    console.warn('[Startup] Sẽ tự động đăng nhập khi có yêu cầu đầu tiên.');
  }
});
