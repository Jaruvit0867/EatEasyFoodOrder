# 🍛 ระบบสั่งอาหารด้วยเสียง (Voice-Controlled Ordering System)

ระบบสั่งอาหารสำหรับร้านข้าวแกง ใช้เสียงภาษาไทยในการสั่งอาหาร

![Demo](demo-screenshot.png)

## 📋 คุณสมบัติ (Features)

- 🎤 **สั่งอาหารด้วยเสียงภาษาไทย** - ใช้ faster-whisper สำหรับ Speech-to-Text
- 🎤 **สั่งอาหารด้วยเสียงภาษาไทย** - ใช้ Web Speech API สำหรับ Speech-to-Text (ไม่ต้องโหลดโมเดลหนัก)
- 💡 **ระบบแนะนำเมนูอัจฉริยะ** - เมื่อสั่งผิดหรือไม่มีในเมนู ระบบจะแนะนำรายการที่ใกล้เคียง
- 📊 **Dashboard เจ้าของร้าน** - ดูยอดขาย, จัดการเมนู, และดูประวัติออเดอร์ (Order Logs)
- 📋 **ระบบจัดการเมนู** - เพิ่ม/ลด/แก้ไขราคา เมนูได้เองทันทีจากหน้า Dashboard
- 👨‍🍳 **Kitchen Display** - หน้าจอสำหรับในครัว ดูออเดอร์ที่เข้ามาแบบ Real-time
- 📱 **รองรับ Mobile/Tablet** - UI Responsive และรองรับการติดตั้ง PWA
- ✅ **ยืนยันออเดอร์** - ตรวจสอบรายการและราคาก่อนสั่ง
- 💾 **บันทึกลง SQLite** - เก็บข้อมูลออเดอร์และเมนูทั้งหมดในไฟล์เดียว

## 🛠️ ข้อกำหนดระบบ (Prerequisites)

- **Python** 3.10 หรือสูงกว่า
- **Node.js** 18 หรือสูงกว่า
- **SSL Certificates** (สร้างอัตโนมัติด้วย script) - จำเป็นสำหรับการใช้ไมโครโฟนบนมือถือ

## 🚀 การติดตั้งและรัน (Easy Setup & Run)

เรามี Script อัตโนมัติให้แล้ว ไม่ต้องพิมพ์คำสั่งยุ่งยาก!

### สำหรับ Mac / Linux
1. **ติดตั้ง (ครั้งแรก):**
   ```bash
   ./easy_setup.sh
   ```
2. **รันโปรแกรม:**
   ```bash
   ./easy_run.sh
   ```

### สำหรับ Windows
1. **ติดตั้ง (ครั้งแรก):**
   Double-click ไฟล์ `easy_setup.bat`
2. **รันโปรแกรม:**
   Double-click ไฟล์ `easy_run.bat`

> ⚠️ **หมายเหตุ**: เมื่อเปิดบนมือถือ ถ้าเจอ Security Warning เพราะ Self-signed Certificate ให้กด **Advanced -> Proceed** เพื่อใช้งานไมโครโฟนได้

## 📱 URL การใช้งาน

เมื่อโปรแกรมรันแล้ว จะบอก IP เครื่องให้ทันที เข้าผ่านมือถือได้เลย:

- **ลูกค้าสั่งอาหาร:** `https://<YOUR_IP>:3000`
- **Dashboard เจ้าของร้าน:** `https://<YOUR_IP>:3000/dashboard`
- **หน้าจอครัว:** `https://<YOUR_IP>:3000/kitchen`

*(อย่าลืมใช้ **HTTPS** เท่านั้น ไม่งั้นจะพูดไม่ได้)*

## 📡 API Endpoints (Backend Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/menu-items` | รายการเมนูทั้งหมด |
| POST | `/menu-items` | เพิ่มเมนูใหม่ |
| POST | `/process-text-order` | ประมวลผลข้อความเสียง + แนะนำเมนู |
| POST | `/confirm-order` | บันทึกออเดอร์ลง DB |
| GET | `/orders` | ดูประวัติออเดอร์ทั้งหมด (Order Logs) |
| GET | `/analytics/summary` | ดูยอดขายและสถิติ |

## 📁 โครงสร้างโปรเจค

```
EatEasyFoodOrder/
├── backend/
│   ├── main.py              # FastAPI server (Logic + DB)
│   ├── requirements.txt     # Python libs
│   └── orders.sqlite        # Database file
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx         # หน้าสั่งอาหาร (ลูกค้า)
│   │   ├── dashboard/       # หน้าจัดการร้าน (เจ้าของ)
│   │   └── kitchen/         # หน้าจอครัว
│   ├── next.config.ts       # Config Proxy & SSL
│   └── package.json
├── certificates/            # SSL Certs (Auto-generated)
├── easy_setup.sh / .bat     # Setup Scripts
├── easy_run.sh / .bat       # Run Scripts
└── README.md
```

## 📄 License

MIT License
