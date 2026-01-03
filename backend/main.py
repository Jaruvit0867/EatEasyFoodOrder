"""
Voice-Controlled Ordering System for Rice & Curry Shop
FastAPI Backend with Web Speech API (frontend) and Database-driven Menu
"""

import os
import json
import sqlite3
import difflib
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============ Configuration ============
# ============ Configuration ============
DATABASE_PATH = "orders.sqlite"
THAI_TZ = timezone(timedelta(hours=7))

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
    {"name": "ข้าวทอดกระเทียมหมู", "keywords": "กระเทียม,ทอดกระเทียม,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวทอดกระเทียมไก่", "keywords": "กระเทียม,ทอดกระเทียม,ไก่", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดคะน้าหมู", "keywords": "คะน้า,ผัดคะน้า,หมู", "base_price": 50, "category": "standard"},
    {"name": "ข้าวผัดผักบุ้งหมู", "keywords": "ผักบุ้ง,ผัดผักบุ้ง,หมู", "base_price": 50, "category": "standard"},
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
    {"name": "ข้าวทอดกระเทียมหมูกรอบ", "keywords": "กระเทียม,ทอดกระเทียม,หมูกรอบ", "base_price": 60, "category": "premium"},
    {"name": "ลาบหมู", "keywords": "ลาบ,หมู", "base_price": 60, "category": "premium"},
    {"name": "ลาบไก่", "keywords": "ลาบ,ไก่", "base_price": 60, "category": "premium"},
    {"name": "ลาบเนื้อ", "keywords": "ลาบ,เนื้อ", "base_price": 60, "category": "premium"},
    {"name": "ปีกไก่ทอด", "keywords": "ปีกไก่,ปีกไก่ทอด,ไก่ทอด", "base_price": 60, "category": "premium"},
    {"name": "ไข่เยี่ยวม้ากะเพรากรอบ", "keywords": "ไข่เยี่ยวม้า,กะเพรากรอบ", "base_price": 60, "category": "premium"},
    
    # Crab dishes (Special pricing)
    {"name": "ข้าวผัดปู", "keywords": "ข้าวผัด,ปู", "base_price": 55, "category": "special"},
    {"name": "ข้าวกะเพราปู", "keywords": "กะเพรา,กระเพรา,ปู", "base_price": 70, "category": "special"},
    {"name": "ข้าวไข่เจียวปู", "keywords": "ไข่เจียว,ปู", "base_price": 60, "category": "special"},
    {"name": "ข้าวปูผัดผงกะหรี่", "keywords": "ปู,ผัดผงกะหรี่,ผงกะหรี่", "base_price": 60, "category": "special"},
    
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
    cursor.execute("SELECT * FROM menu_items WHERE is_active = 1")
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    keywords_map = {}
    
    for row in rows:
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
    
    MENU_CACHE["items"] = items
    MENU_CACHE["keywords_map"] = keywords_map
    MENU_CACHE["items"] = items
    MENU_CACHE["keywords_map"] = keywords_map
    MENU_CACHE["last_updated"] = datetime.now(THAI_TZ)
    
    print(f"Menu cache loaded: {len(items)} items, {len(keywords_map)} keywords")

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
    """Process order from text (from Web Speech API)"""
    try:
        transcript = request.transcript.strip()
        print(f"Processing text order: {transcript}")
        
        if not transcript:
            return OrderResponse(success=False, error="ไม่มีข้อความที่จะประมวลผล")
        
        item = process_order(transcript)
        print(f"Found item: {item.menu_name if item else 'None'}")
        
        if not item:
            # Try to get suggestions
            suggestions = get_suggestions(transcript)
            error_msg = "ไม่พบรายการอาหารในคำสั่ง"
            if suggestions:
                error_msg = "ไม่พบรายการอาหารที่ระบุ แต่มีรายการที่ใกล้เคียง..."

            return OrderResponse(
                success=False,
                transcript=transcript,
                error=error_msg,
                suggestions=suggestions
            )
        
        return OrderResponse(
            success=True,
            transcript=transcript,
            items=[item],
            total_price=item.price or 0
        )
        
    except Exception as e:
        print(f"Error processing text order: {e}")
        return OrderResponse(success=False, error=f"เกิดข้อผิดพลาด: {str(e)}")

@app.post("/confirm-order", response_model=ConfirmOrderResponse)
async def confirm_order(request: ConfirmOrderRequest):
    """Save confirmed order to database"""
    try:
        order_id = save_order_to_db(request.items, request.total_price)
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
