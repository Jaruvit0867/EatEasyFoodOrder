import os
import time
import json
import socket
import requests
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv
import pytz

# Load environment variables
load_dotenv()

# Configuration
API_URL = os.getenv("API_URL", "https://your-backend-app.azurewebsites.net")  # Change this to your Azure URL
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "password")
PRINTER_IP = os.getenv("PRINTER_IP", "192.168.1.201")
PRINTER_PORT = int(os.getenv("PRINTER_PORT", "9100"))
PAPER_WIDTH = 576  # 80mm printer (Match original main.py config)
POLL_INTERVAL = 2  # Check every 2 seconds

# Fonts
THAI_FONT_PATHS = [
    os.path.join(os.getcwd(), "backend", "fonts", "NotoSansThai-Regular.ttf"), # Priority: Bundled font
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    "/System/Library/Fonts/Thonburi.ttc",
    "/Library/Fonts/Thonburi.ttf",
    "C:\\Windows\\Fonts\\tahoma.ttf",
]

THAI_TZ = pytz.timezone('Asia/Bangkok')

# State
last_printed_id = 0
auth_token = None

def get_latest_order_id_from_backend():
    """Fetch the latest order ID from backend on startup."""
    global auth_token
    try:
        # Login first if needed
        if not auth_token:
            res = requests.post(f"{API_URL}/auth/login", json={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }, timeout=10)
            if res.status_code == 200:
                auth_token = res.json().get("token")
            else:
                return 0
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        res = requests.get(f"{API_URL}/orders", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            orders = data.get("orders", [])
            if orders:
                return max(o['id'] for o in orders)
        return 0
    except Exception as e:
        print(f"Could not fetch latest order ID: {e}")
        return 0

def get_thai_font(size=24):
    """Load Thai font from system fonts."""
    for path in THAI_FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    # Fallback to default
    print("Warning: No Thai font found, using default.")
    return ImageFont.load_default()

def text_to_image(text: str, font_size: int = 24, center: bool = False, bold: bool = False) -> Image.Image:
    """Render Thai text as a black-and-white image."""
    font = get_thai_font(font_size)
    
    # Calculate text size
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
    
    # Draw text
    draw.text((x, 0), text, font=font, fill=0)
    if bold:
        draw.text((x+1, 0), text, font=font, fill=0)
        draw.text((x, 1), text, font=font, fill=0)
    
    return img

def image_to_escpos(img: Image.Image) -> bytes:
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

def separator_image() -> Image.Image:
    """Create a centered separator line as image."""
    line = "=" * 40
    return text_to_image(line, font_size=20, center=True)

def print_receipt(order):
    """Print order to thermal printer."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((PRINTER_IP, PRINTER_PORT))
        
        # Reset & Disable Chinese mode
        sock.sendall(b'\x1c\x2e')
        sock.sendall(b'\x1b\x40')
        
        # Header
        sock.sendall(image_to_escpos(text_to_image("เจ๊ดา อาหารตามสั่ง", font_size=44, center=True, bold=True)))
        sock.sendall(image_to_escpos(text_to_image("Original Thai Food", font_size=26, center=True)))
        sock.sendall(b'\n')
        
        # Order Info
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(image_to_escpos(text_to_image(f"ORDER: #{order['id']}", font_size=38, center=True, bold=True)))
        
        # Creation Date conversion
        try:
            # Parse ISO format from JSON
            dt = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00'))
            created_at = dt.astimezone(THAI_TZ).strftime("%d/%m/%Y %H:%M")
        except:
            created_at = datetime.now(THAI_TZ).strftime("%d/%m/%Y %H:%M")
            
        sock.sendall(image_to_escpos(text_to_image(f"DATE: {created_at}", font_size=28, center=True)))
        
        # Order Type
        items = order['items']
        is_takeaway = any("ใส่กล่องกลับบ้าน" in (item.get('note') or '') for item in items)
        if is_takeaway:
            sock.sendall(image_to_escpos(text_to_image("ใส่กล่องกลับบ้าน", font_size=36, center=True, bold=True)))
        else:
            sock.sendall(image_to_escpos(text_to_image("ทานที่ร้าน", font_size=36, center=True, bold=True)))
            
        sock.sendall(image_to_escpos(separator_image()))
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
            sock.sendall(image_to_escpos(text_to_image(line, font_size=36, bold=True)))
            
            if price:
                sock.sendall(image_to_escpos(text_to_image(f"   ราคา: {price}.-", font_size=30)))
            
            for addon in add_ons:
                addon_name = addon.get('name', '')
                addon_price = addon.get('price', 0)
                addon_line = f"   + {addon_name} (+{addon_price})"
                sock.sendall(image_to_escpos(text_to_image(addon_line, font_size=28)))
            
            if clean_note:
                note_line = f"   * {clean_note}"
                sock.sendall(image_to_escpos(text_to_image(note_line, font_size=28)))
            
            sock.sendall(b'\n')
            
        # Total
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image(f"TOTAL: {order['total_price']} B", font_size=40, center=True, bold=True)))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        
        # Footer
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image("* THANK YOU *", font_size=30, center=True)))
        
        # Cut
        sock.sendall(b'\n\n\n\x1d\x56\x42\x00')
        sock.close()
        print(f"✅ Printed Order #{order['id']}")
        return True
    except Exception as e:
        print(f"❌ Print Error: {e}")
        return False

def login():
    """Authenticate and get JWT token."""
    global auth_token
    try:
        print("Logging in...")
        res = requests.post(f"{API_URL}/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if res.status_code == 200:
            data = res.json()
            auth_token = data.get("token")
            # If server uses cookie-only (old version), this might fail.
            # But we just updated backend to return token in body! ✅
            print("Login successful! Token acquired.")
            return True
        else:
            print(f"Login failed: {res.text}")
            return False
    except Exception as e:
        print(f"Connection error during login: {e}")
        return False

def check_orders():
    """Poll for new orders."""
    global last_printed_id, auth_token
    
    if not auth_token:
        if not login():
            return
            
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Fetch ALL orders (or limit logic on backend would be better, but we filter client-side for now)
        res = requests.get(f"{API_URL}/orders", headers=headers, timeout=10)
        
        if res.status_code == 401:
            print("Token expired, re-logging in...")
            auth_token = None
            return # Retry next loop
            
        if res.status_code != 200:
            print(f"Error fetching orders: {res.status_code}")
            return
            
        data = res.json()
        if not data.get("success"):
            print(f"API Error: {data.get('error')}")
            return
            
        orders = data.get("orders", [])
        orders.sort(key=lambda x: x['id']) # Ensure sorted by ID
        
        new_orders = [o for o in orders if o['id'] > last_printed_id]
        
        for order in new_orders:
            print(f"Found new order #{order['id']}")
            if print_receipt(order):
                last_printed_id = order['id']
                    
    except Exception as e:
        print(f"Polling error: {e}")

if __name__ == "__main__":
    print("-" * 40)
    print("🖨️  EAT EASY PRINTER AGENT STARTED")
    print(f"Target Backend: {API_URL}")
    print(f"Printer IP: {PRINTER_IP}")
    
    # Fetch latest order ID from backend on startup (real-time detection)
    print("Fetching latest order ID from backend...")
    last_printed_id = get_latest_order_id_from_backend()
    print(f"Starting from Order ID: {last_printed_id} (will print new orders after this)")
    print("-" * 40)
    
    while True:
        check_orders()
        time.sleep(POLL_INTERVAL)
