# XEM20 Stremio Addon

Addon hoàn chỉnh cho **Stremio** tích hợp kho phim chất lượng cao từ **xem20.net** (tiền thân là Xem14 / DownFshare).

## Các tính năng chính

- **Chất lượng siêu cao**: 4K UHD 2160p, 1080p Bluray Remux, HEVC 10bit, x264, âm thanh AAC 7.1 / 5.1.
- **Thuyết minh & Vietsub**: Phân loại rõ ràng các bản Thuyết minh tiếng Việt và Vietsub/Phụ đề chuẩn.
- **Tốc độ tải trực tiếp (HTTP Direct Stream)**: Phát video qua luồng trực tiếp của downfshare với hỗ trợ Range Request (HTTP 206 Partial Content), tua nhanh mượt mà trên Stremio.
- **Tích hợp kép**:
  1. **Catalog xem20.net**: Duyệt Phim Lẻ, Phim Bộ, Phim Mới trực tiếp trong mục Khám phá (Discover) của Stremio.
  2. **Tìm kiếm & Khớp phim theo IMDb (Cinemeta)**: Khi mở bất kỳ phim nào trên Stremio qua IMDb ID (`tt...`), addon sẽ tự động đối soát và cung cấp link xem20.
- **Tự động quản lý tài khoản**: Tự động đăng nhập và duy trì session để lấy vé tải trơn tru, không gián đoạn.

---

## Cách cài đặt và sử dụng

### 1. Chạy trên máy tính (Windows)

1. Mở thư mục dự án `stremio-xem20-addon`.
2. Chạy file `start.bat` (hoặc mở Terminal gõ `npm start`).
3. Mở trình duyệt truy cập: [http://localhost:7000](http://localhost:7000).
4. Bấm nút **"Cài Đặt Vào Stremio (1-Click)"** hoặc bấm **"Sao chép"** link Manifest:
   ```
   http://localhost:7000/manifest.json
   ```
5. Trong ứng dụng Stremio, vào mục **Addons**, dán link trên vào thanh tìm kiếm rồi bấm **Install**.

---

### 2. Cài đặt lên Android TV / Điện thoại / FireStick

- **Cách 1**: Cài addon trên máy tính đăng nhập cùng tài khoản Stremio. Addon sẽ tự động đồng bộ sang Android TV / điện thoại của bạn qua đám mây Stremio!
- **Cách 2**: Chạy server trên mạng LAN (thay `localhost` bằng IP máy tính trong mạng, ví dụ `192.168.1.100:7000`) và dán link vào Stremio trên TV.

---

### 3. Deploy lên Cloud (Render / Koyeb / VPS) để xem mọi lúc mọi nơi

Bạn có thể đưa mã nguồn này lên GitHub và deploy miễn phí lên [Render.com](https://render.com) hoặc [Koyeb.com](https://koyeb.com):
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `PORT`: `7000` (hoặc do Cloud cấp tự động)
  - `BASE_URL`: `https://ten-app-cua-ban.onrender.com`
  - `XEM20_USERNAME`: tài khoản của bạn (hoặc để mặc định)
  - `XEM20_PASSWORD`: mật khẩu của bạn (hoặc để mặc định)

---

## Cấu trúc mã nguồn

```
stremio-xem20-addon/
├── src/
│   ├── config.js              # Quản lý cấu hình, biến môi trường
│   ├── addon.js               # Manifest, Catalogs, Meta, Streams router
│   ├── server.js              # Express web server & UI cài đặt
│   └── services/
│       ├── xem20Client.js     # Trình crawler, auth session, giải mã stream
│       └── cinemeta.js        # Tra cứu tên phim từ IMDb ID
├── .env                       # Cấu hình tài khoản & cổng mạng
├── package.json               # Danh sách thư viện cần thiết
├── start.bat                  # File khởi động 1-click trên Windows
└── README.md                  # Hướng dẫn chi tiết
```
