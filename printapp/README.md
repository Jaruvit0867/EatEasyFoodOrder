# EatEasy Printer Agent - Desktop App

Cross-platform desktop application สำหรับจัดการการพิมพ์ใบเสร็จ EatEasy

## 🚀 Quick Start (Development)

### macOS
```bash
# ติดตั้ง dependencies
pip install customtkinter pillow requests python-dotenv pytz

# รัน app
python app.py
```

### Windows
```batch
REM ติดตั้ง dependencies
pip install customtkinter pillow requests python-dotenv pytz

REM รัน app
python app.py
```

## 📦 Build Standalone App

### macOS (.app)
```bash
chmod +x build_mac.sh
./build_mac.sh
```
ผลลัพธ์: `dist/EatEasyPrinter.app`

### Windows (.exe)
```batch
build_windows.bat
```
ผลลัพธ์: `dist\EatEasyPrinter\EatEasyPrinter.exe`

## 🖥️ การใช้งาน

1. **ตั้งค่า Settings**
   - Base URL: URL ของ Static Web App หรือ Backend root (เช่น `https://your-app.azurestaticapps.net` หรือ `https://eateasy-backend.azurewebsites.net`)
   - แอปจะเติม `/api` ให้เองอัตโนมัติ
   - Username/Password: ข้อมูล Admin login
   - Printer IP/Port: IP ของเครื่องพิมพ์ Xprinter (เช่น `192.168.1.200:9100`)

2. **กด Save Settings** เพื่อบันทึก

3. **กด START** เพื่อเริ่มรับ order และพิมพ์อัตโนมัติ

4. **กด STOP** เพื่อหยุด

## 📁 Files

| File | Description |
|------|-------------|
| `app.py` | Main GUI application |
| `printer_core.py` | Printer agent logic |
| `config_manager.py` | Settings save/load |
| `build_mac.sh` | macOS build script |
| `build_windows.bat` | Windows build script |

## 💾 Config Location

Settings จะถูกบันทึกอัตโนมัติที่:
- **macOS**: `~/EatEasyPrinter/config.json`
- **Windows**: `%APPDATA%/EatEasyPrinter/config.json`
