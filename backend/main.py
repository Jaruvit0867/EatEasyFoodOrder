"""
Voice-Controlled Ordering System for Rice & Curry Shop
FastAPI Backend with faster-whisper STT and Gemini NLU
"""

import os
import json
import time
import random
import tempfile
import sqlite3
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Lazy imports for heavy libraries
whisper_model = None
genai = None

# ============ Configuration ============
WHISPER_MODEL_SIZE = "medium"
GEMINI_MODEL = "gemini-2.0-flash-lite"
MAX_RETRIES = 5
BASE_DELAY = 1.0  # seconds
DATABASE_PATH = "orders.sqlite"

# ============ Thai Menu Definition ============
# ============ Thai Menu Definition (Specific Pricing) ============

# 1. Specific Menu Prices (Exact Match Priority)
# Only items with irregular pricing need to be here. 
# "Standard" items will be caught by logic.
SPECIFIC_MENU_PRICES = {
    # Crab
    "ข้าวผัดปู": 55,
    "ข้าวกะเพราปู": 70, "กะเพราปู": 70,
    "ข้าวไข่เจียวปู": 60, "ไข่เจียวปู": 60,
    "ข้าวปูผัดผงกะหรี่": 60, "ปูผัดผงกะหรี่": 60,

    # Tom Yum / Soup
    "ต้มยำกุ้ง": 100,
    "ต้มยำทะเล": 120,
    "ต้มยำรวมมิตร": 120,
    "ข้าวผัดต้มยำทะเล": 70,
    "ต้มจืดเต้าหู้หมูสับ": 50, # Approximate matching name
    
    # Suki / Noodles / Special
    "สุกี้ทะเล": 70,
    "สปาเก็ตตี้ขี้เมาทะเล": 80,
    "ผัดซีอิ๊วทะเล": 60,
    "ก๋วยเตี๋ยวคั่วไก่": 50,
    "ปีกไก่ทอด": 60,
    "ไข่เยี่ยวม้ากะเพรากรอบ": 60,
    "ข้าวผัดแหนม": 50,
    "ข้าวผัดหมูยอ": 50,
    "ข้าวผัดไส้กรอก": 50,
    "ข้าวผัดแฮม": 50,
    "ข้าวผัดกุนเชียง": 50,
    
    # Salad / Larb
    "ยำวุ้นเส้น": 80,
    "ยำรวมทะเล": 80,
    "ลาบหมู": 60, "ลาบไก่": 60, "ลาบเนื้อ": 60,
    
    # Vegetable Stir-Fry (Kap Khao)
    "ผัดผักบุ้งหมูกรอบ": 80, # If Kap Khao
    "ผัดคะน้าหมูกรอบ": 80,   # If Kap Khao
}

# 2. General Pricing Groups (Fallback)
# Group 1: Standard (50 THB) - Rice/Noodle dishes
# Group 2: Premium (60 THB) - Beef, Crispy Pork
PRICE_GROUPS = {
    "standard": 50,
    "premium": 60
}

# Meats mapping to Groups
MEAT_GROUPS = {
    # Standard (50)
    "หมู": "standard", "หมูชิ้น": "standard", "หมูสับ": "standard",
    "ไก่": "standard", "ไก่ชิ้น": "standard",
    "กุ้ง": "standard", # As per user request (Rice dishes 50, unless specified otherwise)
    "หมึก": "standard", "ปลาหมึก": "standard",
    "แหนม": "standard", "หมูยอ": "standard", "ไส้กรอก": "standard", "แฮม": "standard", "กุนเชียง": "standard",
    
    # Premium (60)
    "เนื้อ": "premium",
    "หมูกรอบ": "premium"
}

# Categories that imply "Rice" dish (Standard 50/60)
MENU_CATEGORIES = [
    "กระเพรา", "กะเพรา",
    "กระเทียม", "ทอดกระเทียม",
    "พริกแกง",
    "คะน้า", "ผัดคะน้า",
    "ผัดผักบุ้ง",
    "ผัดซีอิ๊ว",
    "ข้าวผัด",
    "ราดหน้า",
    "พริกเผา", "ผัดพริกเผา",
    "พริกเกลือ", "คั่วพริกเกลือ",
    "ผัดผงกะหรี่",
    "สุกี้", "สุกี้น้ำ", "สุกี้แห้ง",
    "ไข่เจียว", "ไข่ดาว" # Usually on rice
]

# Add-on options
ADD_ONS = {
    "ไข่ดาว": {"price": 10, "emoji": "🍳"},
    "ไข่เจียว": {"price": 10, "emoji": "🥚"},
    "พิเศษ": {"price": 10, "emoji": "⭐"},
    "กับข้าว": {"price": 10, "emoji": "🍲"}, # Surcharge added to dish price
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
    raw_gemini_response: Optional[str] = None
    error: Optional[str] = None

class ConfirmOrderRequest(BaseModel):
    items: list[OrderItem]
    total_price: int

class ConfirmOrderResponse(BaseModel):
    success: bool
    order_id: Optional[int] = None
    message: str

# ============ Database Setup ============
def init_database():
    """Initialize SQLite database for orders"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            items_json TEXT NOT NULL,
            total_price INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def save_order_to_db(items: list[OrderItem], total_price: int) -> int:
    """Save order to database and return order ID"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    items_json = json.dumps([item.model_dump() for item in items], ensure_ascii=False)
    cursor.execute(
        "INSERT INTO orders (items_json, total_price) VALUES (?, ?)",
        (items_json, total_price)
    )
    order_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return order_id

def get_all_orders():
    """Retrieve all orders from database"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, items_json, total_price, created_at FROM orders ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "items": json.loads(row[1]),
            "total_price": row[2],
            "created_at": row[3]
        }
        for row in rows
    ]

def clear_all_orders():
    """Clear all orders from database"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM orders")
    conn.commit()
    conn.close()

# ============ Whisper STT ============
def load_whisper_model():
    """Lazy load Whisper model"""
    global whisper_model
    if whisper_model is None:
        import whisper
        print(f"Loading Whisper model: {WHISPER_MODEL_SIZE}...")
        whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)
        print("Whisper model loaded successfully!")
    return whisper_model

def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio file to Thai text using OpenAI Whisper"""
    model = load_whisper_model()
    result = model.transcribe(audio_path, language="th")
    return result["text"].strip()

# ============ Gemini NLU (Disabled for now as we use implicit logic) ============
# def load_gemini(): ...

# ============ Fallback Rule-based Parser ============
def extract_quantity(text: str) -> int:
    """Extract quantity from Thai text"""
    for word, num in THAI_NUMBERS.items():
        if word in text:
            return num
    return 1


def process_order(transcript: str) -> Optional[OrderItem]:
    """
    Parse order using Specific List -> General Logic Fallback.
    
    1. Check Specific Menu Prices (e.g. "ข้าวผัดปู").
    2. If NOT found, build name from Category + Meat.
       - Calculate price based on Meat Group (Standard 50, Premium 60).
    3. Apply Add-ons.
    """
    
    # Clean transcript for checking
    clean_text = transcript.replace("เอา", "").replace("ขอ", "").strip()
    
    detected_menu_name = None
    base_price = 0
    
    # 1. Attempt Specific Match first (Check substrings)
    # Sort specific keys by length to match longest first
    sorted_specific = sorted(SPECIFIC_MENU_PRICES.keys(), key=len, reverse=True)
    
    for menu in sorted_specific:
        if menu in clean_text:
            detected_menu_name = menu
            base_price = SPECIFIC_MENU_PRICES[menu]
            break
            
    # 2. Parsing Components (Category + Meat) if no specific match
    if not detected_menu_name:
        detected_category = None
        detected_meat = None
        meat_group = "standard" # Default
        
        # Check Category (Sort by length desc to avoid substring collisions)
        # e.g. "ทอดกระเทียม" vs "กระเทียม"
        sorted_categories = sorted(MENU_CATEGORIES, key=len, reverse=True)
        for cat in sorted_categories:
            if cat in clean_text:
                detected_category = cat
                break
        
        # Check Meat (Sort by length desc)
        # e.g. "หมูกรอบ" vs "หมู"
        sorted_meats = sorted(MEAT_GROUPS.keys(), key=len, reverse=True)
        for meat in sorted_meats:
            if meat in clean_text:
                detected_meat = meat
                meat_group = MEAT_GROUPS[meat]
                break
        
        if detected_category:
            # Construct Name
            # Prefix Logic
            no_rice_prefix_categories = [
                "ข้าวผัด", "ผัดซีอิ๊ว", "ราดหน้า", "สุกี้", "สุกี้น้ำ", "สุกี้แห้ง", 
                "ก๋วยเตี๋ยว", "ต้มยำ", "แกงจืด", "ต้มจืด", "ข้าวไข่เจียว", "ข้าวไข่ดาว", "ไข่เจียว", "ไข่ดาว",
                "ยำ", "ลาบ"
            ]
            
            if detected_category.startswith("ข้าว") or detected_category in no_rice_prefix_categories:
                name_prefix = detected_category
            else:
                name_prefix = f"ข้าว{detected_category}"
            
            if detected_meat:
                detected_menu_name = f"{name_prefix}{detected_meat}"
            else:
                detected_menu_name = name_prefix # No meat specified
                
            # Pricing Logic based on Meat Group
            if meat_group == "premium":
                base_price = 60
            else:
                base_price = 50
                
            # Special Exception: Suki/Noodles with Seafood?
            # If logic fell through here (meaning not in specific list), defaults apply.
            # "สุกี้ทะเล" is in specific list (70). "สุกี้กุ้ง" is NOT -> So counts as Standard (50)?
            # User request: "สุกี้ (กุ้ง/หมึก) 60".
            # My MEAT_GROUPS has Shrimp/Squid as "standard" (50) for Rice dishes.
            # I need an exception for Suki/Noodles + Shrimp/Squid?
            # Or just add specific items for them.
            # Adding checking:
            if detected_category and "สุกี้" in detected_category and detected_meat in ["กุ้ง", "หมึก", "ปลาหมึก"]:
                base_price = 60
                
        elif detected_meat:
            # Meat Only -> Rice + Meat (e.g. "ข้าวหมูกรอบ")
            detected_menu_name = f"ข้าว{detected_meat}"
            if meat_group == "premium":
                base_price = 60
            else:
                base_price = 50

    if detected_menu_name:
        # 3. Check Add-ons
        add_ons = []
        is_gap_khao = False
        
        # Check "Gap Khao" first as it affects price logic?
        if "กับข้าว" in transcript:
            is_gap_khao = True
            add_ons.append(AddOn(name="กับข้าว", price=ADD_ONS["กับข้าว"]["price"], selected=True))
            
        for addon_name, addon_info in ADD_ONS.items():
             if addon_name == "กับข้าว": continue
             
             # Avoid self-match (e.g. don't add "fried egg" addon if main dish is "fried egg")
             if addon_name in transcript and addon_name not in detected_menu_name:
                  add_ons.append(AddOn(name=addon_name, price=addon_info["price"], selected=True))
        
        # Calculate Total
        # Gap Khao logic: Usually Dish Price + 10 (or higher base).
        # User said "เป็นกับอย่างเดียว เพิ่ม 10 บาท".
        # So Total = Base + 10 (if Gap Khao) + Addons.
        
        # Note: If Gap Khao, maybe remove "ข้าว" from name?
        # e.g. "ข้าวกะเพราหมู" -> "กะเพราหมู (กับข้าว)"
        if is_gap_khao:
            detected_menu_name = detected_menu_name.replace("ข้าว", "").replace("ราดข้าว", "") + " (กับข้าว)"
            # Ensure "กะเพรา" stays "กะเพรา" not empty if "ข้าวกะเพรา" -> "กะเพรา"
            
        total = base_price + sum(a.price for a in add_ons)
        
        return OrderItem(menu_name=detected_menu_name, quantity=1, price=total, add_ons=add_ons)

    return None # No menu detected

# ============ FastAPI App ============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup"""
    init_database()
    print("Database initialized")
    yield

app = FastAPI(
    title="Voice Order API",
    description="Thai Voice-Controlled Ordering System for Rice & Curry Shop",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "message": "Voice Order API is running"}

@app.get("/menu")
async def get_menu():
    """Get available menu items"""
    return {
        "categories": MENU_CATEGORIES,
        "meat_options": MEAT_OPTIONS,
        "standalone_items": STANDALONE_ITEMS,
        "add_ons": ADD_ONS
    }

class TextOrderRequest(BaseModel):
    transcript: str

@app.get("/addons")
async def get_addons():
    """Get available add-on options"""
    return {"addons": [
        {"name": name, "price": info["price"], "emoji": info["emoji"]}
        for name, info in ADD_ONS.items()
    ]}

@app.post("/process-text-order", response_model=OrderResponse)
async def process_text_order(request: TextOrderRequest):
    """
    Process order from text (from Web Speech API).
    Returns a single menu item with add-on options.
    """
    try:
        transcript = request.transcript.strip()
        print(f"Processing text order: {transcript}")
        
        if not transcript:
            return OrderResponse(
                success=False,
                error="ไม่มีข้อความที่จะประมวลผล"
            )
        
        # Parse order - returns single item with add-ons
        item = process_order(transcript)
        print(f"Found item: {item.menu_name if item else 'None'}")
        
        if not item:
            return OrderResponse(
                success=False,
                transcript=transcript,
                error="ไม่พบรายการอาหารในคำสั่ง"
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

@app.post("/process-voice-order", response_model=OrderResponse)
async def process_voice_order(audio: UploadFile = File(...)):
    """
    Process voice order from audio file
    1. Transcribe Thai audio using faster-whisper
    2. Extract order using implicit logic
    3. Return structured order data
    """
    try:
        # Save uploaded audio to temp file
        suffix = ".webm" if "webm" in (audio.content_type or "") else ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        try:
            # Step 1: Transcribe audio to Thai text
            print(f"Transcribing audio: {temp_path}")
            transcript = transcribe_audio(temp_path)
            print(f"Transcript: {transcript}")
            
            if not transcript:
                return OrderResponse(
                    success=False,
                    error="ไม่สามารถแปลงเสียงเป็นข้อความได้"
                )
            
            # Step 2: Extract order
            print("Extracting order...")
            item = process_order(transcript)
            print(f"Found item: {item.menu_name if item else 'None'}")
            
            if not item:
                return OrderResponse(
                    success=False,
                    transcript=transcript,
                    error="ไม่พบรายการอาหารในคำสั่ง"
                )
            
            return OrderResponse(
                success=True,
                transcript=transcript,
                items=[item],
                total_price=item.price or 0
            )
            
        finally:
            # Clean up temp file
            os.unlink(temp_path)
            
    except ValueError as e:
        return OrderResponse(success=False, error=str(e))
    except Exception as e:
        print(f"Error processing voice order: {e}")
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
        return ConfirmOrderResponse(
            success=False,
            message=f"เกิดข้อผิดพลาด: {str(e)}"
        )

@app.get("/orders")
async def list_orders():
    """Get all orders (admin endpoint)"""
    try:
        orders = get_all_orders()
        return {"success": True, "orders": orders}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.delete("/orders")
async def clear_orders():
    """Clear all orders (reset)"""
    try:
        clear_all_orders()
        return {"success": True, "message": "ล้างออเดอร์ทั้งหมดสำเร็จ"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============ Run Server ============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
