"""
Printer Agent Core - Refactored as a class for GUI integration
"""
import socket
import requests
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import pytz
import threading
import time
import os

PAPER_WIDTH = 576  # 80mm printer
THAI_TZ = pytz.timezone('Asia/Bangkok')

# Fonts
THAI_FONT_PATHS = [
    os.path.join(os.getcwd(), "fonts", "NotoSansThai-Regular.ttf"),
    os.path.join(os.getcwd(), "backend", "fonts", "NotoSansThai-Regular.ttf"),
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    # macOS - Silom has better Thai vowel combining than Thonburi
    "/System/Library/Fonts/Supplemental/Silom.ttf",
    "/Library/Fonts/Silom.ttf",
    "C:\\Windows\\Fonts\\tahoma.ttf",
]

def normalize_api_url(raw_url: str) -> str:
    """Normalize a user-provided base URL to the /api root."""
    url = raw_url.strip().rstrip("/")
    if not url:
        return ""
    return url if url.endswith("/api") else f"{url}/api"

class PrinterAgent:
    def __init__(self, config: dict, log_callback=None):
        """
        Initialize printer agent with config dict.
        
        config should have:
        - api_url
        - admin_username
        - admin_password
        - printer_ip
        - printer_port
        """
        self.config = config
        self.api_url = normalize_api_url(config.get("api_url", ""))
        self.log_callback = log_callback or print
        self.auth_token = None
        self.last_printed_id = 0
        self.running = False
        self._thread = None
        
    def log(self, message: str):
        """Log message via callback."""
        self.log_callback(message)
        
    def get_thai_font(self, size=24):
        """Load Thai font from system fonts."""
        for path in THAI_FONT_PATHS:
            try:
                return ImageFont.truetype(path, size)
            except:
                continue
        self.log("⚠️ No Thai font found, using default")
        return ImageFont.load_default()
    
    def text_to_image(self, text: str, font_size: int = 24, center: bool = False, bold: bool = False) -> Image.Image:
        """Render Thai text as a black-and-white image."""
        font = self.get_thai_font(font_size)
        
        dummy_img = Image.new('1', (1, 1))
        dummy_draw = ImageDraw.Draw(dummy_img)
        bbox = dummy_draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        img_width = PAPER_WIDTH
        img_height = text_height + 12
        img = Image.new('1', (img_width, img_height), color=1)
        draw = ImageDraw.Draw(img)
        
        if center:
            x = (img_width - text_width) // 2
        else:
            x = 10
        
        draw.text((x, 0), text, font=font, fill=0)
        if bold:
            draw.text((x+1, 0), text, font=font, fill=0)
            draw.text((x, 1), text, font=font, fill=0)
        
        return img
    
    def image_to_escpos(self, img: Image.Image) -> bytes:
        """Convert PIL Image to ESC/POS raster bitmap command."""
        if img.width > PAPER_WIDTH:
            ratio = PAPER_WIDTH / img.width
            img = img.resize((PAPER_WIDTH, int(img.height * ratio)))
        
        width = (img.width + 7) // 8 * 8
        height = img.height
        img = img.convert('1')
        pixels = img.load()
        
        data = bytearray()
        for y in range(height):
            for x_byte in range(width // 8):
                byte = 0
                for bit in range(8):
                    x = x_byte * 8 + bit
                    if x < img.width and pixels[x, y] == 0:
                        byte |= (0x80 >> bit)
                data.append(byte)
        
        xL = (width // 8) & 0xFF
        xH = ((width // 8) >> 8) & 0xFF
        yL = height & 0xFF
        yH = (height >> 8) & 0xFF
        
        return b'\x1d\x76\x30\x00' + bytes([xL, xH, yL, yH]) + bytes(data)
    
    def separator_image(self) -> Image.Image:
        """Create a centered separator line as image."""
        line = "=" * 40
        return self.text_to_image(line, font_size=20, center=True)
    
    def login(self) -> bool:
        """Authenticate and get JWT token."""
        try:
            if not self.api_url:
                self.log("❌ Base URL is empty. Please save the app URL or backend URL first.")
                return False

            self.log("🔐 Logging in...")
            url = f"{self.api_url}/auth/login"
            res = requests.post(url, json={
                "username": self.config["admin_username"],
                "password": self.config["admin_password"]
            }, timeout=10)
            
            if res.status_code == 200:
                data = res.json()
                self.auth_token = data.get("token")
                self.log("✅ Login successful!")
                return True
            else:
                self.log(f"❌ Login failed: {res.text}")
                return False
        except Exception as e:
            self.log(f"❌ Connection error: {e}")
            return False
    
    def get_latest_order_id(self) -> int:
        """Fetch the latest order ID from backend on startup."""
        try:
            if not self.auth_token:
                if not self.login():
                    return 0
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            res = requests.get(f"{self.api_url}/orders", headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                orders = data.get("orders", [])
                if orders:
                    return max(o['id'] for o in orders)
            return 0
        except Exception as e:
            self.log(f"⚠️ Could not fetch latest order ID: {e}")
            return 0
    
    def print_receipt(self, order) -> bool:
        """Print order to thermal printer."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            sock.connect((self.config["printer_ip"], self.config["printer_port"]))
            
            # Reset & Disable Chinese mode
            sock.sendall(b'\x1c\x2e')
            sock.sendall(b'\x1b\x40')
            
            # Header
            sock.sendall(self.image_to_escpos(self.text_to_image("เจ๊ดา อาหารตามสั่ง", font_size=44, center=True, bold=True)))
            sock.sendall(self.image_to_escpos(self.text_to_image("Original Thai Food", font_size=26, center=True)))
            sock.sendall(b'\n')
            
            # Order Info
            sock.sendall(self.image_to_escpos(self.separator_image()))
            sock.sendall(self.image_to_escpos(self.text_to_image(f"ORDER: #{order['id']}", font_size=38, center=True, bold=True)))
            
            # Creation Date conversion
            try:
                dt = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00'))
                created_at = dt.astimezone(THAI_TZ).strftime("%d/%m/%Y %H:%M")
            except:
                created_at = datetime.now(THAI_TZ).strftime("%d/%m/%Y %H:%M")
                
            sock.sendall(self.image_to_escpos(self.text_to_image(f"DATE: {created_at}", font_size=28, center=True)))
            
            # Order Type
            items = order['items']
            is_takeaway = any("ใส่กล่องกลับบ้าน" in (item.get('note') or '') for item in items)
            if is_takeaway:
                sock.sendall(self.image_to_escpos(self.text_to_image("ใส่กล่องกลับบ้าน", font_size=36, center=True, bold=True)))
            else:
                sock.sendall(self.image_to_escpos(self.text_to_image("ทานที่ร้าน", font_size=36, center=True, bold=True)))
                
            sock.sendall(self.image_to_escpos(self.separator_image()))
            sock.sendall(b'\n')
            
            # Items
            for item in items:
                menu_name = item.get('menu_name', str(item))
                quantity = item.get('quantity', 1)
                price = item.get('price', 0)
                add_ons = item.get('add_ons', [])
                note = item.get('note') or ''
                clean_note = note.replace("ใส่กล่องกลับบ้าน", "").replace(",", " ").strip()
                
                line = f"{quantity}x {menu_name}"
                sock.sendall(self.image_to_escpos(self.text_to_image(line, font_size=36, bold=True)))
                
                if price:
                    sock.sendall(self.image_to_escpos(self.text_to_image(f"   ราคา: {price}.-", font_size=30)))
                
                for addon in add_ons:
                    addon_name = addon.get('name', '')
                    addon_price = addon.get('price', 0)
                    addon_line = f"   + {addon_name} (+{addon_price})"
                    sock.sendall(self.image_to_escpos(self.text_to_image(addon_line, font_size=28)))
                
                if clean_note:
                    note_line = f"   * {clean_note}"
                    sock.sendall(self.image_to_escpos(self.text_to_image(note_line, font_size=28)))
                
                sock.sendall(b'\n')
                
            # Total
            sock.sendall(b'\n')
            sock.sendall(self.image_to_escpos(self.separator_image()))
            sock.sendall(b'\n')
            sock.sendall(self.image_to_escpos(self.text_to_image(f"TOTAL: {order['total_price']} B", font_size=40, center=True, bold=True)))
            sock.sendall(b'\n')
            sock.sendall(self.image_to_escpos(self.separator_image()))
            
            # Footer
            sock.sendall(b'\n')
            sock.sendall(self.image_to_escpos(self.text_to_image("* THANK YOU *", font_size=30, center=True)))
            
            # Cut
            sock.sendall(b'\n\n\n\x1d\x56\x42\x00')
            sock.close()
            return True
        except Exception as e:
            self.log(f"❌ Print Error: {e}")
            return False
    
    def check_orders(self):
        """Poll for new orders."""
        if not self.auth_token:
            if not self.login():
                return
                
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            res = requests.get(f"{self.api_url}/orders", headers=headers, timeout=10)
            
            if res.status_code == 401:
                self.log("🔄 Token expired, re-logging in...")
                self.auth_token = None
                return
                
            if res.status_code != 200:
                self.log(f"⚠️ Error fetching orders: {res.status_code}")
                return
                
            data = res.json()
            if not data.get("success"):
                self.log(f"⚠️ API Error: {data.get('error')}")
                return
                
            orders = data.get("orders", [])
            orders.sort(key=lambda x: x['id'])
            
            new_orders = [o for o in orders if o['id'] > self.last_printed_id]
            
            for order in new_orders:
                self.log(f"📋 Found new order #{order['id']}")
                if self.print_receipt(order):
                    self.last_printed_id = order['id']
                    self.log(f"✅ Printed Order #{order['id']}")
                        
        except Exception as e:
            self.log(f"❌ Polling error: {e}")
    
    def _run_loop(self):
        """Main polling loop (runs in thread)."""
        self.log("🔄 Fetching latest order ID...")
        self.last_printed_id = self.get_latest_order_id()
        self.log(f"📍 Starting from Order #{self.last_printed_id}")
        
        while self.running:
            self.check_orders()
            time.sleep(2)
    
    def start(self):
        """Start the agent in a background thread."""
        if self.running:
            return
        
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self.log("🚀 Agent started!")
    
    def stop(self):
        """Stop the agent."""
        self.running = False
        self.auth_token = None
        self.log("🛑 Agent stopped.")
