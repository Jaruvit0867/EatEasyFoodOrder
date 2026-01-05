"""
Voice-Controlled Ordering System for Rice & Curry Shop
FastAPI Backend with Web Speech API (frontend) and Database-driven Menu
"""

import os
import json
import sqlite3
import difflib
import socket
import requests  # For Ollama LLM API calls
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple
from contextlib import asynccontextmanager
from PIL import Image, ImageDraw, ImageFont
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============ Configuration ============
DATABASE_PATH = "orders.sqlite"
THAI_TZ = timezone(timedelta(hours=7))

# ============ Ollama LLM Configuration ============
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:1.5b"
OLLAMA_TIMEOUT = 15

# ============ Printer Configuration ============
PRINTER_IP = "192.168.1.200"
PRINTER_PORT = 9100
PAPER_WIDTH = 576  # 80mm paper = ~576 pixels for full width
THAI_FONT_PATHS = [
    # Windows fonts (checked first)
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/cordia.ttc",
    "C:/Windows/Fonts/angsana.ttc",
    # macOS fonts
    "/System/Library/Fonts/Supplemental/Thonburi.ttc",
    "/System/Library/Fonts/Thonburi.ttc",
    "/Library/Fonts/Thonburi.ttf",
]

# ============ Protein Keywords (Must match exactly) ============
PROTEIN_KEYWORDS = ["หมู", "ไก่", "เนื้อ", "กุ้ง", "หมึก", "ปู", "ทะเล", "หมูกรอบ", "หมูสับ"]

# ============ Menu Cache (Loaded from DB on startup) ============
MENU_CACHE = {
    "items": [],           # List of all menu items
    "keywords_map": {},    # keyword -> menu_item mapping for fast lookup
    "last_updated": None
}

# ============ Default Menu Data (for initial DB population) ============
DEFAULT_MENU_ITEMS = [
    # Standard dishes (50 THB)
    {"name": "ข้าวกะเพราหมู", "keywords": "กะเพรา,กระเพรา,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวกะเพราหมูสับ", "keywords": "กะเพรา,กระเพรา,หมูสับ", "base_price": 50, "category": "standard"},
    {"name": "ข้าวกะเพราไก่", "keywords": "กะเพรา,กระเพรา,ไก่", "base_price": 50, "category": "standard"},
    {"name": "ข้าวกะเพรากุ้ง", "keywords": "กะเพรา,กระเพรา,กุ้ง", "base_price": 50, "category": "standard"},
    {"name": "ข้าวกะเพราหมึก", "keywords": "กะเพรา,กระเพรา,หมึก,ปลาหมึก", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดหมู", "keywords": "ข้าวผัด,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดไก่", "keywords": "ข้าวผัด,ไก่", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดกุ้ง", "keywords": "ข้าวผัด,กุ้ง", "base_price": 50, "category": "standard"},
    {"name": "ข้าวไข่เจียว", "keywords": "ไข่เจียว", "base_price": 50, "category": "standard"},
    {"name": "ข้าวไข่ดาว", "keywords": "ไข่ดาว", "base_price": 50, "category": "standard"},
    {"name": "ข้าวหมูทอดกระเทียม", "keywords": "กระเทียม,ทอดกระเทียม,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวไก่ทอดกระเทียม", "keywords": "กระเทียม,ทอดกระเทียม,ไก่", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดคะน้าหมู", "keywords": "คะน้า,ผัดคะน้า,หมู", "base_price": 50, "category": "standard"},
    {"name": "ผัดผักบุ้งหมูราดข้าว", "keywords": "ผักบุ้ง,ผัดผักบุ้ง,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดซีอิ๊วหมู", "keywords": "ผัดซีอิ๊ว,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวราดหน้าหมู", "keywords": "ราดหน้า,หมู", "base_price": 50, "category": "standard"},
    {"name": "ก๋วยเตี๋ยวคั่วไก่", "keywords": "ก๋วยเตี๋ยวคั่วไก่,ก๋วยเตี๋ยว,คั่วไก่", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดแหนม", "keywords": "ข้าวผัด,แหนม", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดหมูยอ", "keywords": "ข้าวผัด,หมูยอ", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดไส้กรอก", "keywords": "ข้าวผัด,ไส้กรอก", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดแฮม", "keywords": "ข้าวผัด,แฮม", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดกุนเชียง", "keywords": "ข้าวผัด,กุนเชียง", "base_price": 50, "category": "standard"},
    {"name": "ต้มจืดเต้าหู้หมูสับ", "keywords": "ต้มจืด,เต้าหู้,หมูสับ", "base_price": 50, "category": "standard"},
    
    # Premium dishes (60 THB) - Beef, Crispy Pork
    {"name": "ข้าวกะเพราเนื้อ", "keywords": "กะเพรา,กระเพรา,เนื้อ", "base_price": 60, "category": "premium"},
    {"name": "ข้าวกะเพราหมูกรอบ", "keywords": "กะเพรา,กระเพรา,หมูกรอบ", "base_price": 60, "category": "premium"},
    {"name": "ข้าวผัดเนื้อ", "keywords": "ข้าวผัด,เนื้อ", "base_price": 60, "category": "premium"},
    {"name": "ข้าวหมูกรอบทอดกระเทียม", "keywords": "กระเทียม,ทอดกระเทียม,หมูกรอบ", "base_price": 60, "category": "premium"},
    {"name": "ลาบหมู", "keywords": "ลาบ,หมู", "base_price": 60, "category": "premium"},
    {"name": "ลาบไก่", "keywords": "ลาบ,ไก่", "base_price": 60, "category": "premium"},
    {"name": "ลาบเนื้อ", "keywords": "ลาบ,เนื้อ", "base_price": 60, "category": "premium"},
    {"name": "ปีกไก่ทอด", "keywords": "ปีกไก่,ปีกไก่ทอด,ไก่ทอด", "base_price": 60, "category": "premium"},
    {"name": "ไข่เยี่ยวม้ากะเพรากรอบ", "keywords": "ไข่เยี่ยวม้า,กะเพรากรอบ", "base_price": 60, "category": "premium"},
    
    # Crab dishes (Special pricing)
    {"name": "ข้าวผัดปู", "keywords": "ข้าวผัด,ปู", "base_price": 55, "category": "special"},
    {"name": "ข้าวกะเพราปู", "keywords": "กะเพรา,กระเพรา,ปู", "base_price": 70, "category": "special"},
    {"name": "ข้าวไข่เจียวปู", "keywords": "ไข่เจียว,ปู", "base_price": 60, "category": "special"},
    {"name": "ข้าวหน้าปูผัดผงกะหรี่", "keywords": "ปู,ผัดผงกะหรี่,ผงกะหรี่", "base_price": 60, "category": "special"},
    
    # Seafood dishes
    {"name": "ผัดซีอิ๊วทะเล", "keywords": "ผัดซีอิ๊ว,ทะเล", "base_price": 60, "category": "special"},
    {"name": "สุกี้ทะเล", "keywords": "สุกี้,ทะเล", "base_price": 70, "category": "special"},
    {"name": "สุกี้กุ้ง", "keywords": "สุกี้,กุ้ง", "base_price": 60, "category": "special"},
    {"name": "สุกี้หมึก", "keywords": "สุกี้,หมึก,ปลาหมึก", "base_price": 60, "category": "special"},
    {"name": "สปาเก็ตตี้ขี้เมาทะเล", "keywords": "สปาเก็ตตี้,ขี้เมา,ทะเล", "base_price": 80, "category": "special"},
    {"name": "ข้าวผัดต้มยำทะเล", "keywords": "ข้าวผัด,ต้มยำ,ทะเล", "base_price": 70, "category": "special"},
    
    # Soups
    {"name": "ต้มยำกุ้ง", "keywords": "ต้มยำ,กุ้ง", "base_price": 100, "category": "soup"},
    {"name": "ต้มยำทะเล", "keywords": "ต้มยำ,ทะเล", "base_price": 120, "category": "soup"},
    {"name": "ต้มยำรวมมิตร", "keywords": "ต้มยำ,รวมมิตร", "base_price": 120, "category": "soup"},
    
    # Salads
    {"name": "ยำวุ้นเส้น", "keywords": "ยำ,วุ้นเส้น", "base_price": 80, "category": "salad"},
    {"name": "ยำรวมทะเล", "keywords": "ยำ,ทะเล,รวมทะเล", "base_price": 80, "category": "salad"},
    
    # Kap Khao (Side dishes for extra)
    {"name": "ผัดผักบุ้งหมูกรอบ", "keywords": "ผักบุ้ง,ผัดผักบุ้ง,หมูกรอบ", "base_price": 80, "category": "kapkhao"},
    {"name": "ผัดคะน้าหมูกรอบ", "keywords": "คะน้า,ผัดคะน้า,หมูกรอบ", "base_price": 80, "category": "kapkhao"},
]

# Add-on options (still in code as they're fixed)
ADD_ONS = {
    "ไข่ดาว": {"price": 10, "emoji": "🍳"},
    "ไข่เจียว": {"price": 10, "emoji": "🥚"},
    "พิเศษ": {"price": 10, "emoji": "⭐"},
    "กับข้าว": {"price": 10, "emoji": "🍲"},
    "เพิ่มข้าว": {"price": 5, "emoji": "🍚"},
}

THAI_NUMBERS = {
    "หนึ่ง": 1, "สอง": 2, "สาม": 3, "สี่": 4, "ห้า": 5,
    "หก": 6, "เจ็ด": 7, "แปด": 8, "เก้า": 9, "สิบ": 10,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
    "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
}

# ============ Pydantic Models ============
class AddOn(BaseModel):
    name: str
    price: int
    selected: bool = False

class OrderItem(BaseModel):
    menu_name: str
    quantity: int
    note: Optional[str] = None
    price: Optional[int] = None
    add_ons: list[AddOn] = []

class OrderResponse(BaseModel):
    success: bool
    transcript: Optional[str] = None
    items: list[OrderItem] = []
    total_price: int = 0
    error: Optional[str] = None
    suggestions: list[str] = [] # Suggestions for failed orders

class ConfirmOrderRequest(BaseModel):
    items: list[OrderItem]
    total_price: int

class ConfirmOrderResponse(BaseModel):
    success: bool
    order_id: Optional[int] = None
    message: str

class MenuItemCreate(BaseModel):
    name: str
    keywords: str
    base_price: int
    category: str = "standard"

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[str] = None
    base_price: Optional[int] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

# ============ Database Setup ============
def get_db_connection():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    """Initialize SQLite database for orders and menu"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Orders table (with status for kitchen display)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            items_json TEXT NOT NULL,
            total_price INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Add status column if not exists (migration for existing DB)
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Menu items table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            keywords TEXT NOT NULL,
            base_price INTEGER NOT NULL,
            category TEXT DEFAULT 'standard',
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

def seed_menu_if_empty():
    """Seed default menu items if table is empty"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM menu_items")
    count = cursor.fetchone()[0]
    
    if count == 0:
        print("Seeding default menu items...")
        for item in DEFAULT_MENU_ITEMS:
            try:
                cursor.execute(
                    "INSERT INTO menu_items (name, keywords, base_price, category) VALUES (?, ?, ?, ?)",
                    (item["name"], item["keywords"], item["base_price"], item["category"])
                )
            except sqlite3.IntegrityError:
                pass  # Skip duplicates
        conn.commit()
        print(f"Seeded {len(DEFAULT_MENU_ITEMS)} menu items")
    
    conn.close()

def reload_menu_cache():
    """Reload menu from database into cache"""
    global MENU_CACHE
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Load active items
    cursor.execute("SELECT * FROM menu_items WHERE is_active = 1")
    active_rows = cursor.fetchall()
    
    # Load inactive items (for sold-out detection)
    cursor.execute("SELECT * FROM menu_items WHERE is_active = 0")
    inactive_rows = cursor.fetchall()
    
    conn.close()
    
    items = []
    inactive_items = []
    keywords_map = {}
    
    for row in active_rows:
        item = {
            "id": row["id"],
            "name": row["name"],
            "keywords": row["keywords"].split(","),
            "base_price": row["base_price"],
            "category": row["category"]
        }
        items.append(item)
        
        # Build keyword map for fast lookup
        for keyword in item["keywords"]:
            keyword = keyword.strip()
            if keyword:
                if keyword not in keywords_map:
                    keywords_map[keyword] = []
                keywords_map[keyword].append(item)
    
    # Process inactive items for sold-out detection
    for row in inactive_rows:
        item = {
            "id": row["id"],
            "name": row["name"],
            "keywords": row["keywords"].split(","),
            "base_price": row["base_price"],
            "category": row["category"]
        }
        inactive_items.append(item)
    
    MENU_CACHE["items"] = items
    MENU_CACHE["keywords_map"] = keywords_map
    MENU_CACHE["inactive_items"] = inactive_items  # Store inactive items for sold-out check
    MENU_CACHE["last_updated"] = datetime.now(THAI_TZ)
    
    print(f"Menu cache loaded: {len(items)} active, {len(inactive_items)} inactive items")

# ============ Order Database Functions ============
def save_order_to_db(items: list[OrderItem], total_price: int) -> int:
    """Save order to database and return order ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    items_json = json.dumps([item.model_dump() for item in items], ensure_ascii=False)
    
    # Use Thai Time (UTC+7)
    
    # Use Thai Time (UTC+7)
    created_at = datetime.now(THAI_TZ).strftime("%Y-%m-%d %H:%M:%S")

    
    cursor.execute(
        "INSERT INTO orders (items_json, total_price, status, created_at) VALUES (?, ?, 'pending', ?)",
        (items_json, total_price, created_at)
    )
    order_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return order_id

# ============ Printer Functions ============
def get_thai_font(size=24):
    """Load Thai font from system fonts."""
    for path in THAI_FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
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
    
    # Use full paper width for centering
    img_width = PAPER_WIDTH
    img_height = text_height + 12
    img = Image.new('1', (img_width, img_height), color=1)
    draw = ImageDraw.Draw(img)
    
    if center:
        x = (img_width - text_width) // 2
    else:
        x = 10
    
    # Draw text (multiple times for bold effect)
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

def print_order_receipt(order_id: int, items: list, total_price: int):
    """Print order receipt to thermal printer using image rendering.
    Format matches the kitchen display slip style with larger fonts.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((PRINTER_IP, PRINTER_PORT))
        
        # Reset & Disable Chinese mode
        sock.sendall(b'\x1c\x2e')  # Cancel Chinese
        sock.sendall(b'\x1b\x40')  # Reset
        
        # === HEADER (Centered, Bold) ===
        sock.sendall(image_to_escpos(text_to_image("เจ๊ดา อาหารตามสั่ง", font_size=44, center=True, bold=True)))
        sock.sendall(image_to_escpos(text_to_image("Original Thai Food", font_size=26, center=True)))
        sock.sendall(b'\n')
        
        # === ORDER INFO ===
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(image_to_escpos(text_to_image(f"ORDER: #{order_id}", font_size=38, center=True, bold=True)))
        created_at = datetime.now(THAI_TZ).strftime("%d/%m/%Y %H:%M")
        sock.sendall(image_to_escpos(text_to_image(f"DATE: {created_at}", font_size=28, center=True)))
        
        # === ORDER TYPE (Takeaway/Dine-in) ===
        is_takeaway = any("ใส่กล่องกลับบ้าน" in item.get('note', '') for item in items)
        if is_takeaway:
            sock.sendall(image_to_escpos(text_to_image("ใส่กล่องกลับบ้าน", font_size=36, center=True, bold=True)))
        else:
            sock.sendall(image_to_escpos(text_to_image("ทานที่ร้าน", font_size=36, center=True, bold=True)))
        
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(b'\n')
        
        # === ITEMS (Large font, Bold) ===
        for item in items:
            menu_name = item.get('menu_name', str(item))
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)
            add_ons = item.get('add_ons', [])
            note = item.get('note', '')
            # Clean note (remove takeaway indicator since it's shown globally)
            clean_note = note.replace("ใส่กล่องกลับบ้าน", "").replace(",", " ").strip()
            
            # Main item (Large, Bold)
            line = f"{quantity}x {menu_name}"
            sock.sendall(image_to_escpos(text_to_image(line, font_size=36, bold=True)))
            
            # Price line
            if price:
                sock.sendall(image_to_escpos(text_to_image(f"   ราคา: {price}.-", font_size=30)))
            
            # Add-ons (Large for elderly)
            for addon in add_ons:
                addon_name = addon.get('name', str(addon))
                addon_price = addon.get('price', 0)
                addon_line = f"   + {addon_name} (+{addon_price})"
                sock.sendall(image_to_escpos(text_to_image(addon_line, font_size=28)))
            
            # Note (Large for elderly) - only show if has content after cleaning
            if clean_note:
                note_line = f"   * {clean_note}"
                sock.sendall(image_to_escpos(text_to_image(note_line, font_size=28)))
            
            sock.sendall(b'\n')
        
        # === TOTAL (Extra Large, Centered, Bold) ===
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image(f"TOTAL: {total_price} B", font_size=40, center=True, bold=True)))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        
        # === FOOTER ===
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image("* THANK YOU *", font_size=30, center=True)))
        
        # Feed and cut
        sock.sendall(b'\n\n\n\x1d\x56\x42\x00')
        
        sock.close()
        print(f"[Printer] Order #{order_id} printed successfully")
        return True
        
    except Exception as e:
        print(f"[Printer] Error printing order #{order_id}: {e}")
        return False

def get_pending_orders():
    """Retrieve pending orders for kitchen display"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, items_json, total_price, created_at FROM orders WHERE status = 'pending' ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "items": json.loads(row["items_json"]),
            "total_price": row["total_price"],
            "created_at": row["created_at"]
        }
        for row in rows
    ]

def get_all_orders():
    """Retrieve all orders from database (for analytics)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, items_json, total_price, status, created_at FROM orders ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "items": json.loads(row["items_json"]),
            "total_price": row["total_price"],
            "status": row["status"],
            "created_at": row["created_at"]
        }
        for row in rows
    ]

def complete_order(order_id: int):
    """Mark a single order as completed"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = 'completed' WHERE id = ?", (order_id,))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def cancel_order(order_id: int):
    """Mark a single order as cancelled"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", (order_id,))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def complete_all_pending_orders():
    """Mark all pending orders as completed (kitchen reset)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = 'completed' WHERE status = 'pending'")
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count

def clear_all_orders():
    """Actually delete all orders (admin only)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM orders")
    conn.commit()
    conn.close()

# ============ Menu Database Functions ============
def get_all_menu_items():
    """Get all menu items from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu_items ORDER BY category, name")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def create_menu_item(item: MenuItemCreate):
    """Create a new menu item"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO menu_items (name, keywords, base_price, category) VALUES (?, ?, ?, ?)",
        (item.name, item.keywords, item.base_price, item.category)
    )
    item_id = cursor.lastrowid
    conn.commit()
    conn.close()
    reload_menu_cache()  # Refresh cache
    return item_id

def update_menu_item(item_id: int, updates: MenuItemUpdate):
    """Update a menu item"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Build dynamic update query
    fields = []
    values = []
    for field, value in updates.model_dump(exclude_unset=True).items():
        if value is not None:
            fields.append(f"{field} = ?")
            values.append(value)
    
    if not fields:
        conn.close()
        return False
    
    fields.append("updated_at = ?")
    values.append(datetime.now(THAI_TZ).strftime("%Y-%m-%d %H:%M:%S"))

    
    query = f"UPDATE menu_items SET {', '.join(fields)} WHERE id = ?"
    values.append(item_id)  # Add item_id for WHERE clause
    cursor.execute(query, values)
    conn.commit()
    conn.close()
    reload_menu_cache()  # Refresh cache
    return True

def delete_menu_item(item_id: int):
    """Delete a menu item"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if deleted:
        reload_menu_cache()  # Refresh cache
    return deleted

# ============ Analytics Functions ============
def get_analytics_summary():
    """Get sales analytics summary"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_thai = datetime.now(THAI_TZ)
    today = now_thai.strftime("%Y-%m-%d")
    week_ago = (now_thai - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (now_thai - timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Today's stats
    cursor.execute("""
        SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
        FROM orders WHERE DATE(created_at) = ?
    """, (today,))
    today_stats = dict(cursor.fetchone())
    
    # This week's stats
    cursor.execute("""
        SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
        FROM orders WHERE DATE(created_at) >= ?
    """, (week_ago,))
    week_stats = dict(cursor.fetchone())
    
    # This month's stats
    cursor.execute("""
        SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
        FROM orders WHERE DATE(created_at) >= ?
    """, (month_ago,))
    month_stats = dict(cursor.fetchone())
    
    # All time stats
    cursor.execute("SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total FROM orders")
    all_time_stats = dict(cursor.fetchone())
    
    conn.close()
    
    return {
        "today": today_stats,
        "week": week_stats,
        "month": month_stats,
        "all_time": all_time_stats
    }

def get_top_items(limit: int = 10):
    """Get top selling menu items"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT items_json FROM orders")
    rows = cursor.fetchall()
    conn.close()
    
    # Count menu items
    item_counts = {}
    item_revenue = {}
    
    for row in rows:
        items = json.loads(row["items_json"])
        for item in items:
            name = item.get("menu_name", "Unknown")
            qty = item.get("quantity", 1)
            price = item.get("price", 0) * qty
            
            item_counts[name] = item_counts.get(name, 0) + qty
            item_revenue[name] = item_revenue.get(name, 0) + price
    
    # Sort by count
    sorted_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    return [
        {"name": name, "count": count, "revenue": item_revenue.get(name, 0)}
        for name, count in sorted_items
    ]

def get_daily_sales(days: int = 7):
    """Get daily sales for the past N days"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    results = []
    now_thai = datetime.now(THAI_TZ)
    for i in range(days - 1, -1, -1):
        date = (now_thai - timedelta(days=i)).strftime("%Y-%m-%d")
        cursor.execute("""
            SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
            FROM orders WHERE DATE(created_at) = ?
        """, (date,))
        row = dict(cursor.fetchone())
        results.append({
            "date": date,
            "orders": row["count"],
            "revenue": row["total"]
        })
    
    conn.close()
    return results

def get_order_statistics(days: int = 7):
    """Get order counts by status for the past N days"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if days >= 365:
        date_filter = ""
        params = ()
    else:
        date_filter = "WHERE DATE(created_at) >= ?"
        cutoff_date = (datetime.now(THAI_TZ) - timedelta(days=days)).strftime("%Y-%m-%d")
        params = (cutoff_date,)
    
    # Total orders
    cursor.execute(f"SELECT COUNT(*) FROM orders {date_filter}", params)
    total = cursor.fetchone()[0]
    
    # Pending orders
    filter_with_status = f"{date_filter} {'AND' if date_filter else 'WHERE'} status = 'pending'"
    cursor.execute(f"SELECT COUNT(*) FROM orders {filter_with_status.replace('WHERE AND', 'WHERE')}", params)
    pending = cursor.fetchone()[0]
    
    # Completed orders
    filter_with_status = f"{date_filter} {'AND' if date_filter else 'WHERE'} status = 'completed'"
    cursor.execute(f"SELECT COUNT(*) FROM orders {filter_with_status.replace('WHERE AND', 'WHERE')}", params)
    completed = cursor.fetchone()[0]
    
    # Cancelled orders
    filter_with_status = f"{date_filter} {'AND' if date_filter else 'WHERE'} status = 'cancelled'"
    cursor.execute(f"SELECT COUNT(*) FROM orders {filter_with_status.replace('WHERE AND', 'WHERE')}", params)
    cancelled = cursor.fetchone()[0]
    
    # Revenue (from completed orders only)
    filter_with_status = f"{date_filter} {'AND' if date_filter else 'WHERE'} status = 'completed'"
    cursor.execute(f"SELECT COALESCE(SUM(total_price), 0) FROM orders {filter_with_status.replace('WHERE AND', 'WHERE')}", params)
    revenue = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "total": total,
        "pending": pending,
        "completed": completed,
        "cancelled": cancelled,
        "revenue": revenue
    }


# ============ Two-Stage Verification Helpers ============
def extract_proteins_from_text(text: str) -> List[str]:
    """Extract protein keywords from user input"""
    found = []
    # Check longer keywords first (หมูกรอบ before หมู)
    sorted_proteins = sorted(PROTEIN_KEYWORDS, key=len, reverse=True)
    for protein in sorted_proteins:
        if protein in text:
            found.append(protein)
            # Remove to avoid double counting (หมูกรอบ contains หมู)
            text = text.replace(protein, "")
    return found


def score_menu_with_confidence(transcript: str, menu_items: list) -> Tuple[Optional[dict], int, List[dict]]:
    """
    Score menu items and return (best_match, confidence_score, top_candidates).
    Confidence: 0-100
    - 90+: Exact match or protein matches perfectly
    - 50-89: Partial match, needs verification
    - <50: Too ambiguous, show suggestions
    """
    clean_text = transcript.replace("เอา", "").replace("ขอ", "").replace("หน่อย", "").replace("ครับ", "").replace("ค่ะ", "").strip()
    
    # === Text Normalization: Handle common spelling variations ===
    clean_text = clean_text.replace("กระเพราะ", "กะเพรา")  # Common typo
    clean_text = clean_text.replace("กระเพรา", "กะเพรา")   # Alternative spelling
    
    user_proteins = extract_proteins_from_text(clean_text)
    
    # === Special Partial Match Rules ===
    # Handle abbreviated/partial orders that customers commonly use
    partial_match_rules = {
        "ผัดผักบุ้ง": "ผัดผักบุ้งหมูราดข้าว",  # Short form → Full menu name
        "ข้าวไข่เจียวหมูสับ": "ข้าวไข่เจียว",   # ข้าวไข่เจียว with หมูสับ as note
    }
    
    for short_form, full_name in partial_match_rules.items():
        # Only match if it's the EXACT short form, not part of a longer phrase
        # e.g. "ผัดผักบุ้ง" matches but "ผัดผักบุ้งหมูกรอบ" should NOT match
        if clean_text == short_form or transcript.strip() == short_form:
            for item in menu_items:
                if item["name"] == full_name:
                    return item, 95, [{"item": item, "score": 95}]
    
    scored_items = []
    
    for item in menu_items:
        score = 0
        protein_match = True
        
        # 1. Check if menu name is substring of input or vice versa (high confidence)
        if item["name"] in transcript or clean_text in item["name"]:
            score += 50
        
        # 2. Keyword matching (bag of words, order doesn't matter)
        item_keywords = item.get("keywords", [])
        matched_keywords = 0
        for keyword in item_keywords:
            if keyword in clean_text:
                score += len(keyword) * 2
                matched_keywords += 1
        
        # 3. Protein validation (CRITICAL)
        item_name = item["name"]
        item_proteins = extract_proteins_from_text(item_name)
        
        if user_proteins:
            # User specified a protein - item MUST have matching protein
            if not any(p in item_proteins for p in user_proteins):
                protein_match = False
            # Check for conflicting proteins
            for user_p in user_proteins:
                for item_p in item_proteins:
                    if user_p != item_p and user_p in PROTEIN_KEYWORDS[:7] and item_p in PROTEIN_KEYWORDS[:7]:
                        # Conflicting proteins (หมู vs ไก่ etc.)
                        protein_match = False
        
        if protein_match:
            score += 30  # Bonus for matching protein
        else:
            score = 0  # Zero out score if protein doesn't match
        
        if score > 0:
            scored_items.append({
                "item": item,
                "score": score,
                "protein_match": protein_match,
                "keywords_matched": matched_keywords
            })
    
    # Sort by score descending, then by name length ascending (prefer shorter/more specific names)
    scored_items.sort(key=lambda x: (-x["score"], len(x["item"]["name"])))
    
    if not scored_items:
        return None, 0, []
    
    best = scored_items[0]
    best_score = best["score"]
    
    # Calculate confidence
    confidence = min(best_score, 100)
    
    # Check for ties (ambiguity)
    if len(scored_items) > 1:
        second_score = scored_items[1]["score"]
        if second_score >= best_score * 0.9:  # Very close scores = ambiguous
            confidence = min(confidence, 60)
    
    return best["item"], confidence, scored_items[:5]


def verify_match_with_llm(user_text: str, candidate_item: dict) -> bool:
    """Use LLM to verify if the candidate match is correct"""
    try:
        prompt = f"""ตรวจสอบว่าการจับคู่นี้ถูกต้องหรือไม่:
ลูกค้าพูด: "{user_text}"
ระบบเลือก: "{candidate_item['name']}"

ตอบแค่ "ถูก" หรือ "ผิด" เท่านั้น"""

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 20}
            },
            timeout=OLLAMA_TIMEOUT
        )
        response.raise_for_status()
        
        result = response.json().get("response", "").strip()
        return "ถูก" in result
    except Exception as e:
        print(f"[LLM Verify Error] {e}")
        return True  # On error, trust keyword matching


def ask_llm_to_parse(user_text: str, menu_items: list) -> Optional[dict]:
    """Use LLM to parse order when keyword matching fails"""
    try:
        # Build compact menu list
        menu_lines = [f"{item['id']}|{item['name']}" for item in menu_items[:30]]  # Limit to 30 for speed
        menu_str = "\n".join(menu_lines)
        
        prompt = f"""คุณคือผู้ช่วยรับออเดอร์ร้านอาหาร

เมนู:
{menu_str}

ลูกค้าสั่ง: "{user_text}"

หาเมนูที่ตรงกับที่ลูกค้าสั่ง ตอบเป็น ID เท่านั้น (ตัวเลข)
ถ้าไม่มีเมนูตรง ตอบ 0"""

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 20}
            },
            timeout=OLLAMA_TIMEOUT
        )
        response.raise_for_status()
        
        result = response.json().get("response", "").strip()
        print(f"[LLM Parse] Result: {result}")
        
        # Try to extract ID from response
        import re
        match = re.search(r'\d+', result)
        if match:
            menu_id = int(match.group())
            if menu_id > 0:
                for item in menu_items:
                    if item.get("id") == menu_id:
                        return item
        
        # Fallback: Try to match by name if LLM returned a name
        # First try exact match
        for item in menu_items:
            if item["name"] == result:
                return item
        
        # Then try finding longest matching name (to prefer ข้าวกะเพราหมูกรอบ over ข้าวกะเพราหมู)
        best_match = None
        best_len = 0
        for item in menu_items:
            if item["name"] in result:
                if len(item["name"]) > best_len:
                    best_len = len(item["name"])
                    best_match = item
        if best_match:
            return best_match
        
        return None
    except Exception as e:
        print(f"[LLM Parse Error] {e}")
        return None


# ============ Order Parsing (using cache) ============
def process_order(transcript: str) -> Optional[OrderItem]:
    """Parse order using cached menu data (note is added separately via frontend)"""
    
    clean_text = transcript.replace("เอา", "").replace("ขอ", "").strip()
    
    candidates = []
    best_score = 0
    
    # Score each menu item by keyword matches
    for item in MENU_CACHE["items"]:
        score = 0
        for keyword in item["keywords"]:
            if keyword in clean_text:
                score += len(keyword)  # Longer matches score higher
        
        if score > best_score:
            best_score = score
            candidates = [item]
        elif score == best_score and score > 0:
            candidates.append(item)
    
    # Ambiguity check: if multiple items have the COMPETING best score, return None to trigger suggestions
    # Exception: if they are identical name (duplicate) or very obvious logic overrides
    if len(candidates) > 1:
        return None

    if len(candidates) == 1:
        best_match = candidates[0]
        # Check Add-ons
        add_ons = []
        is_gap_khao = False
        
        if "กับข้าว" in transcript:
            is_gap_khao = True
            add_ons.append(AddOn(name="กับข้าว", price=ADD_ONS["กับข้าว"]["price"], selected=True))
        
        for addon_name, addon_info in ADD_ONS.items():
            if addon_name == "กับข้าว":
                continue
            if addon_name in transcript and addon_name not in best_match["name"]:
                add_ons.append(AddOn(name=addon_name, price=addon_info["price"], selected=True))
        
        # Calculate total
        menu_name = best_match["name"]
        base_price = best_match["base_price"]
        
        if is_gap_khao:
            menu_name = menu_name.replace("ข้าว", "") + " (กับข้าว)"
        
        total = base_price + sum(a.price for a in add_ons)
        
        # Note is None - will be added separately via frontend
        return OrderItem(menu_name=menu_name, quantity=1, price=total, add_ons=add_ons, note=None)
    
    return None


def get_suggestions(transcript: str, limit: int = 10) -> list[str]:
    """Find menu suggestions based on keyword scoring and fuzzy matching"""
    clean_text = transcript.replace("เอา", "").replace("ขอ", "").strip()
    if not clean_text:
        return []

    # 1. Weighted Keyword Scoring
    scored_items = []
    
    for item in MENU_CACHE["items"]:
        score = 0
        for keyword in item["keywords"]:
            if keyword in clean_text:
                score += len(keyword) * 2 # Give higher weight to matches
        
        if score > 0:
            scored_items.append((score, item["name"]))
            
    # Sort by score descending
    scored_items.sort(key=lambda x: x[0], reverse=True)
    suggestions = [x[1] for x in scored_items]
    
    # 2. Fallback to fuzzy matching if we need more suggestions
    if len(suggestions) < limit:
        all_names = [item["name"] for item in MENU_CACHE["items"]]
        # Remove already found
        candidates = [n for n in all_names if n not in suggestions]
        
        matches = difflib.get_close_matches(clean_text, candidates, n=limit - len(suggestions), cutoff=0.3)
        suggestions.extend(matches)
            
    return suggestions[:limit]


def check_sold_out(transcript: str) -> Optional[str]:
    """Check if the order matches any inactive (sold-out) menu item.
    Only returns sold-out if inactive item has HIGHER score than any active item.
    This prevents false positives like 'กระเพราหมูกรอบหมด' when ordering 'กระเพราหมู'."""
    clean_text = transcript.replace("เอา", "").replace("ขอ", "").strip()
    
    inactive_items = MENU_CACHE.get("inactive_items", [])
    active_items = MENU_CACHE.get("items", [])
    
    if not inactive_items:
        return None
    
    # Calculate best score for INACTIVE items
    best_inactive_score = 0
    best_inactive_match = None
    
    for item in inactive_items:
        score = 0
        for keyword in item["keywords"]:
            keyword = keyword.strip()
            if keyword and keyword in clean_text:
                score += len(keyword)
        
        if score > best_inactive_score:
            best_inactive_score = score
            best_inactive_match = item
    
    # No inactive match at all
    if not best_inactive_match or best_inactive_score == 0:
        return None
    
    # Calculate best score for ACTIVE items
    best_active_score = 0
    
    for item in active_items:
        score = 0
        for keyword in item["keywords"]:
            keyword = keyword.strip()
            if keyword and keyword in clean_text:
                score += len(keyword)
        
        if score > best_active_score:
            best_active_score = score
    
    # Only return sold-out if inactive score is STRICTLY HIGHER than active score
    # This means user is specifically ordering the sold-out item, not a similar one
    if best_inactive_score > best_active_score:
        return best_inactive_match["name"]
    
    return None


# ============ FastAPI App ============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup"""
    init_database()
    seed_menu_if_empty()
    reload_menu_cache()
    print("Server ready!")
    yield

app = FastAPI(
    title="Voice Order API",
    description="Thai Voice-Controlled Ordering System for Rice & Curry Shop",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ Health Check ============
@app.get("/")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "message": "Voice Order API is running", "version": "2.0.0"}

# ============ Order Endpoints ============
class TextOrderRequest(BaseModel):
    transcript: str

@app.post("/process-text-order", response_model=OrderResponse)
async def process_text_order(request: TextOrderRequest):
    """Process order from text using Two-Stage Verification"""
    try:
        transcript = request.transcript.strip()
        
        # === Global Text Normalization ===
        # Fix common Thai spelling variations BEFORE any processing
        transcript = transcript.replace("กระเพราะ", "กะเพรา")
        transcript = transcript.replace("กระเพรา", "กะเพรา")
        
        print(f"[V2] Processing: {transcript}")
        
        if not transcript:
            return OrderResponse(success=False, error="ไม่มีข้อความที่จะประมวลผล")
        
        # Check for sold-out items FIRST
        sold_out_item = check_sold_out(transcript)
        if sold_out_item:
            print(f"Item sold out: {sold_out_item}")
            return OrderResponse(
                success=False,
                transcript=transcript,
                error=f"❌ {sold_out_item} หมดแล้วครับ",
                suggestions=[]
            )
        
        # === STAGE 1: Keyword Matching with Confidence ===
        best_match, confidence, candidates = score_menu_with_confidence(transcript, MENU_CACHE["items"])
        print(f"[V2] Confidence: {confidence}%, Best: {best_match['name'] if best_match else 'None'}")
        
        if not best_match or confidence < 30:
            # Check if input is too short/ambiguous (just a protein keyword)
            clean_input = transcript.replace("เอา", "").replace("ขอ", "").replace("หน่อย", "").replace("ครับ", "").strip()
            is_just_protein = clean_input in PROTEIN_KEYWORDS or len(clean_input) < 8
            
            if not is_just_protein:
                # Try LLM parsing as fallback before showing suggestions
                print(f"[V2] Low confidence ({confidence}%), trying LLM parsing...")
                llm_match = ask_llm_to_parse(transcript, MENU_CACHE["items"])
                if llm_match:
                    print(f"[V2] LLM found match: {llm_match['name']}")
                    best_match = llm_match
                    confidence = 80  # Trust LLM match
            
            if not best_match or confidence < 30:
                # LLM also couldn't parse OR input was too short - show suggestions
                suggestions = [c["item"]["name"] for c in candidates] if candidates else get_suggestions(transcript)
                return OrderResponse(
                    success=False,
                    transcript=transcript,
                    error="ไม่พบรายการที่ตรงกัน กรุณาเลือกจากรายการด้านล่าง",
                    suggestions=suggestions[:8]
                )
        
        # === STAGE 2: LLM Verification for Medium Confidence ===
        if 30 <= confidence < 85:
            # Check if input is too short/ambiguous (just a protein keyword)
            clean_input = transcript.replace("เอา", "").replace("ขอ", "").replace("หน่อย", "").replace("ครับ", "").strip()
            is_just_protein = clean_input in PROTEIN_KEYWORDS or len(clean_input) < 8
            
            if is_just_protein:
                # Too ambiguous - show suggestions instead of trusting LLM
                print(f"[V2] Input too short/ambiguous, showing suggestions")
                suggestions = get_suggestions(transcript)
                return OrderResponse(
                    success=False,
                    transcript=transcript,
                    error="รายการคลุมเครือ กรุณาเลือกจากรายการด้านล่าง",
                    suggestions=suggestions[:8]
                )
            
            print(f"[V2] Medium confidence ({confidence}%), calling LLM to verify...")
            is_correct = verify_match_with_llm(transcript, best_match)
            if not is_correct:
                # LLM rejected, but if keyword matching had decent confidence (>50%), trust it anyway
                # LLM parsing is unreliable and often returns wrong results
                if confidence >= 50:
                    print(f"[V2] LLM rejected but confidence {confidence}% is good, trusting keyword match")
                    # Continue with keyword match result
                else:
                    # Low confidence AND LLM rejected - show suggestions
                    print(f"[V2] LLM rejected and low confidence, showing suggestions")
                    suggestions = [c["item"]["name"] for c in candidates] if candidates else get_suggestions(transcript)
                    return OrderResponse(
                        success=False,
                        transcript=transcript,
                        error="ระบบไม่แน่ใจ กรุณาเลือกจากรายการด้านล่าง",
                        suggestions=suggestions[:8]
                    )
            else:
                print(f"[V2] LLM confirmed match!")
        
        # === Create Order Item ===
        add_ons = []
        is_gap_khao = False
        
        if "กับข้าว" in transcript:
            is_gap_khao = True
            add_ons.append(AddOn(name="กับข้าว", price=ADD_ONS["กับข้าว"]["price"], selected=True))
        
        for addon_name, addon_info in ADD_ONS.items():
            if addon_name == "กับข้าว":
                continue
            if addon_name in transcript and addon_name not in best_match["name"]:
                add_ons.append(AddOn(name=addon_name, price=addon_info["price"], selected=True))
        
        menu_name = best_match["name"]
        base_price = best_match["base_price"]
        
        if is_gap_khao:
            menu_name = menu_name.replace("ข้าว", "") + " (กับข้าว)"
        
        total = base_price + sum(a.price for a in add_ons)
        
        # === Extract extra keywords as Note ===
        note = None
        extra_keywords = ["หมูสับ", "ไม่เผ็ด", "เผ็ดมาก", "พิเศษ", "น้ำข้น", "ไข่ดาว", "ไข่เจียว"]
        for extra in extra_keywords:
            if extra in transcript and extra not in menu_name:
                note = extra
                break
        
        item = OrderItem(menu_name=menu_name, quantity=1, price=total, add_ons=add_ons, note=note)
        print(f"[V2] Success: {menu_name} (${total})")
        
        return OrderResponse(
            success=True,
            transcript=transcript,
            items=[item],
            total_price=total
        )
        
    except Exception as e:
        print(f"Error processing text order: {e}")
        return OrderResponse(success=False, error=f"เกิดข้อผิดพลาด: {str(e)}")

@app.post("/confirm-order", response_model=ConfirmOrderResponse)
async def confirm_order(request: ConfirmOrderRequest):
    """Save confirmed order to database and print receipt"""
    try:
        order_id = save_order_to_db(request.items, request.total_price)
        
        # Print receipt to kitchen printer (non-blocking, don't fail if printer is offline)
        try:
            items_data = [item.model_dump() for item in request.items]
            print_order_receipt(order_id, items_data, request.total_price)
        except Exception as print_error:
            print(f"[Printer] Warning: Could not print receipt: {print_error}")
        
        return ConfirmOrderResponse(
            success=True,
            order_id=order_id,
            message=f"บันทึกออเดอร์สำเร็จ (หมายเลข: {order_id})"
        )
    except Exception as e:
        return ConfirmOrderResponse(success=False, message=f"เกิดข้อผิดพลาด: {str(e)}")

@app.get("/orders")
async def list_orders():
    """Get all orders (for analytics/admin)"""
    try:
        orders = get_all_orders()
        return {"success": True, "orders": orders}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/orders/pending")
async def list_pending_orders():
    """Get pending orders (for kitchen display)"""
    try:
        orders = get_pending_orders()
        return {"success": True, "orders": orders}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/orders/{order_id}/complete")
async def mark_order_complete(order_id: int):
    """Mark a single order as completed"""
    try:
        success = complete_order(order_id)
        if success:
            return {"success": True, "message": f"ออเดอร์ #{order_id} เสร็จสิ้น"}
        return {"success": False, "message": "ไม่พบออเดอร์"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/orders/{order_id}/cancel")
async def mark_order_cancelled(order_id: int):
    """Mark a single order as cancelled"""
    try:
        success = cancel_order(order_id)
        if success:
            return {"success": True, "message": f"ยกเลิกออเดอร์ #{order_id} แล้ว"}
        return {"success": False, "message": "ไม่พบออเดอร์"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/orders")
async def complete_all_orders():
    """Mark all pending orders as completed (kitchen reset - data preserved for analytics)"""
    try:
        count = complete_all_pending_orders()
        return {"success": True, "message": f"เคลียร์ออเดอร์ {count} รายการ (ข้อมูลยังเก็บไว้ในระบบ)"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.delete("/orders/delete-all")
async def delete_all_orders():
    """Actually delete all orders (admin only - use with caution)"""
    try:
        clear_all_orders()
        return {"success": True, "message": "ลบออเดอร์ทั้งหมดสำเร็จ"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============ Menu Management Endpoints ============
@app.get("/menu-items")
async def list_menu_items():
    """Get all menu items"""
    try:
        items = get_all_menu_items()
        return {"success": True, "items": items, "total": len(items)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/menu-items")
async def add_menu_item(item: MenuItemCreate):
    """Add a new menu item"""
    try:
        item_id = create_menu_item(item)
        return {"success": True, "id": item_id, "message": "เพิ่มเมนูสำเร็จ"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="ชื่อเมนูนี้มีอยู่แล้ว")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/menu-items/{item_id}")
async def edit_menu_item(item_id: int, updates: MenuItemUpdate):
    """Update a menu item"""
    try:
        success = update_menu_item(item_id, updates)
        if success:
            return {"success": True, "message": "แก้ไขเมนูสำเร็จ"}
        return {"success": False, "message": "ไม่พบเมนู"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/menu-items/{item_id}")
async def remove_menu_item(item_id: int):
    """Delete a menu item"""
    try:
        success = delete_menu_item(item_id)
        if success:
            return {"success": True, "message": "ลบเมนูสำเร็จ"}
        return {"success": False, "message": "ไม่พบเมนู"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/menu-cache/reload")
async def refresh_cache():
    """Manually reload menu cache"""
    try:
        reload_menu_cache()
        return {
            "success": True,
            "message": "โหลด cache ใหม่สำเร็จ",
            "items_count": len(MENU_CACHE["items"]),
            "last_updated": MENU_CACHE["last_updated"].isoformat() if MENU_CACHE["last_updated"] else None
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============ Analytics Endpoints ============
@app.get("/analytics/summary")
async def get_summary():
    """Get sales summary analytics"""
    try:
        summary = get_analytics_summary()
        return {"success": True, "data": summary}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/analytics/top-items")
async def get_top_selling(limit: int = 10):
    """Get top selling items"""
    try:
        items = get_top_items(limit)
        return {"success": True, "data": items}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/analytics/daily-sales")
async def get_daily(days: int = 7):
    """Get daily sales data"""
    try:
        data = get_daily_sales(days)
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/analytics/order-stats")
async def get_order_stats(days: int = 7):
    """Get order statistics by status"""
    try:
        stats = get_order_statistics(days)
        return {"success": True, "data": stats}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/addons")
async def get_addons():
    """Get available add-on options"""
    return {"addons": [
        {"name": name, "price": info["price"], "emoji": info["emoji"]}
        for name, info in ADD_ONS.items()
    ]}

# ============ Run Server ============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
