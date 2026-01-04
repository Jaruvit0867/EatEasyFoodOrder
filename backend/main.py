"""
Voice-Controlled Ordering System for Rice & Curry Shop
FastAPI Backend with Web Speech API (frontend) and Database-driven Menu
"""

import os
import json
import sqlite3
import difflib
import requests  # For Ollama LLM API calls
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple
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


def extract_order_with_llm(transcript: str, menu_items: List[dict]) -> Optional[OrderItem]:
    """
    Use LLM to extract menu item, quantity, addons, and notes strictly from the transcript.
    Uses basic keyword scoring to pre-filter candidates (RAG) for the LLM context.
    """
    try:
        # 1. Candidate Retrieval (Pre-filtering)
        # Limit context to ~6 items. High precision required.
        candidates = menu_items
        if len(menu_items) > 6:
            scored_candidates = []
            clean_text = transcript.replace("เอา", "").replace("ขอ", "").replace("ผม", "").replace("ดิฉัน", "")
            
            for item in menu_items:
                score = 0
                # Exact name substring match (Strong signal)
                if item["name"] in clean_text:
                    score += 50
                
                # Keyword overlap
                item_keywords = item.get("keywords", [])
                if isinstance(item_keywords, str):
                    item_keywords = item_keywords.split(",")
                    
                for k in item_keywords:
                    k = k.strip()
                    if k and k in clean_text:
                        score += 10
                
                scored_candidates.append((score, item))
            
            # Sort by score descending
            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            
            # Keep top 6
            candidates = [x[1] for x in scored_candidates[:6]]
            
        print(f"[RAG] Selected {len(candidates)} candidates: {[c['name'] for c in candidates]}")

        # 2. Build Prompt
        menu_text = "\n".join([f"- {item['name']} ({item['base_price']}฿)" for item in candidates])
        
        addons_text = ", ".join([f"{name} ({info['price']}฿)" for name, info in ADD_ONS.items()])
        
        prompt = f"""You are an expert Thai food ordering AI assistant.
Your task is to extract the order details based on the strict MENU and ADDONS provided.

MENU:
{menu_text}

ADDONS:
{addons_text}

INSTRUCTIONS:
1. Find the best matching menu item. Only set "found": false if the input is gibberish or unrelated to food.
2. Extract quantity (default 1).
3. Identify valid add-ons from the ADDONS list.
4. Extract any other details (spiciness, special instructions) as "note".
5. Return JSON ONLY.

Example:
User: "เอาข้าวกะเพราหมู 1 ที่ ไข่ดาวด้วย"
Response:
{{
  "found": true,
  "menu_name": "ข้าวกะเพราหมู",
  "quantity": 1,
  "addons": ["ไข่ดาว"],
  "note": "ไข่ดาวด้วย"
}}

User: "ข้าวกะเพราเนื้อ 2 จาน"
Response:
{{
  "found": true,
  "menu_name": "ข้าวกะเพราเนื้อ",
  "quantity": 2,
  "addons": [],
  "note": ""
}}

User: "ข้าวกะเพราไก่ 1 ที่"
Response:
{{
  "found": true,
  "menu_name": "ข้าวกะเพราไก่",
  "quantity": 1,
  "addons": [],
  "note": ""
}}

User: "ข้าวกะเพราหมึก"
Response:
{{
  "found": true,
  "menu_name": "ข้าวกะเพราหมึก",
  "quantity": 1,
  "addons": [],
  "note": ""
}}

User: "{transcript}"
Response:
"""
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 100},
                # "format": "json"  <-- REMOVED to improve speed (7s -> 1.8s)
            },
            timeout=10
        )
        response.raise_for_status()
        result_json = response.json().get("response", "")
        print(f"[LLM] Raw response: {result_json}")
        
        try:
            data = json.loads(result_json)
        except:
             # Try to find JSON block if raw text
            import re
            match = re.search(r'\{.*\}', result_json, re.DOTALL)
            if match:
                data = json.loads(match.group())
            else:
                return None
                
        if not data.get("found"):
            # We will handle fallback at the end if not found
            pass
            
        target_name = data.get("menu_name", "").strip() # Strip whitespace
        
        # === VALIDATION LAYER ===
        # Prevent Hallucinations (e.g. Kai -> Kung)
        # Rule: If result has a specific meat, that meat (or synonym) MUST be in transcript 
        # OR transcript must NOT have a conflicting meat.
        
        MEAT_MAP = {
            "กุ้ง": ["กุ้ง", "kung"],
            "เนื้อ": ["เนื้อ", "nuea", "beef"],
            "ไก่": ["ไก่", "kai", "chicken"],
            "หมู": ["หมู", "moo", "pork"],
            "หมึก": ["หมึก", "sqid", "pla muek"],
            "ปู": ["ปู", "pu", "crab"],
            "ปลา": ["ปลา", "pla", "fish"],
            "ทะเล": ["ทะเล", "talay", "seafood"]
        }
        
        is_valid = True
        for meat, keywords in MEAT_MAP.items():
            if meat in target_name:
                # Check if transcript contains conflicting meat
                has_meat_keyword = any(k in transcript.lower() for k in keywords)
                if not has_meat_keyword:
                    # Target meat NOT in transcript.
                    # Check if ANY other meat is in transcript?
                    for other_meat, other_keywords in MEAT_MAP.items():
                        if other_meat == meat: continue
                        if any(k in transcript.lower() for k in other_keywords):
                            print(f"[Validation] REJECTED '{target_name}' (Input has '{other_meat}' not '{meat}')")
                            is_valid = False
                            break
            if not is_valid: break
            
        if not is_valid:
            print(f"[Validation] Result invalid. Trying fallback...")
            data["found"] = False # Trigger fallback logic below

        # Validate Menu Name (Only if still found)
        if data.get("found"):
            matched_item = next((item for item in menu_items if item["name"] == target_name), None)
            if not matched_item:
                # Try fuzzy match if exact match failed but LLM said found
                names = [item["name"] for item in menu_items]
                matches = difflib.get_close_matches(target_name, names, n=1, cutoff=0.6)
                if matches:
                     matched_item = next((item for item in menu_items if item["name"] == matches[0]), None)
                
                if not matched_item:
                     # Fuzzy fail -> Trigger fallback
                     data["found"] = False
                     
        if not data.get("found"):
            # Fallback: Check for exact substring match in candidates
            best_fallback = None
            longest_len = 0
            for item in menu_items:
                if item["name"] in transcript:
                    if len(item["name"]) > longest_len:
                        longest_len = len(item["name"])
                        best_fallback = item
            
            if best_fallback:
                print(f"[Fallback] Recovered '{best_fallback['name']}' from exact substring.")
                return OrderItem(
                    menu_name=best_fallback['name'],
                    quantity=1,
                    price=best_fallback['base_price'],
                    addons=[],
                    note=""
                )
            return None
        # Build Order Objects
        add_ons_objects = []
        for addon_name in data.get("addons", []):
            # Careful with whitespace
            addon_name = addon_name.strip()
            if addon_name in ADD_ONS:
                add_ons_objects.append(AddOn(name=addon_name, price=ADD_ONS[addon_name]["price"], selected=True))
        
        total = matched_item["base_price"] + sum(a.price for a in add_ons_objects)
        quant = data.get("quantity", 1)
        if isinstance(quant, str): # Handle if LLM returns string "1"
             try: quant = int(quant)
             except: quant = 1
             
        return OrderItem(
            menu_name=matched_item["name"], 
            quantity=max(1, quant), 
            price=int(total * max(1, quant)), 
            add_ons=add_ons_objects, 
            note=data.get("note")
        )

    except Exception as e:
        print(f"[LLM Error] {e}")
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
        
        # === AI-Based Order Extraction (No Keyword Matching) ===
        print(f"[AIv3] Processing: {transcript}")
        
        extracted_order = extract_order_with_llm(transcript, MENU_CACHE["items"])
        
        if extracted_order:
             print(f"[AIv3] Success: {extracted_order.menu_name} ({extracted_order.price} THB)")
             return OrderResponse(
                success=True,
                transcript=transcript,
                items=[extracted_order],
                total_price=extracted_order.price
             )
        else:
             print(f"[AIv3] Failed to extract order, showing suggestions")
             suggestions = get_suggestions(transcript)
             return OrderResponse(
                success=False,
                transcript=transcript,
                error="ไม่พบรายการที่สั่ง กรุณาพูดใหม่อีกครั้ง หรือเลือกจากรายการด้านล่าง",
                suggestions=suggestions[:8]
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
