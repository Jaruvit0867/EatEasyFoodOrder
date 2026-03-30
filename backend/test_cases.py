import os
import requests
import time
from dotenv import load_dotenv

load_dotenv()

API_BASE = "http://localhost:8000"
PROCESS_URL = f"{API_BASE}/process-text-order"
LOGIN_URL = f"{API_BASE}/auth/login"
AUTH_HEADERS = {}
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

# Extracted from backend/main.py
MENU_ITEMS = [
    "ข้าวกะเพราหมู", "ข้าวกะเพราหมูสับ", "ข้าวกะเพราไก่", "ข้าวกะเพรากุ้ง", "ข้าวกะเพราหมึก",
    "ข้าวผัดหมู", "ข้าวผัดไก่", "ข้าวผัดกุ้ง", "ข้าวไข่เจียว", "ข้าวไข่ดาว",
    "ข้าวหมูทอดกระเทียม", "ข้าวไก่ทอดกระเทียม", "ข้าวผัดคะน้าหมู", "ผัดผักบุ้งหมูราดข้าว",
    "ผัดซีอิ๊วหมู", "ราดหน้าหมู", "ก๋วยเตี๋ยวคั่วไก่", "ข้าวผัดแหนม", "ข้าวผัดหมูยอ",
    "ข้าวผัดไส้กรอก", "ข้าวผัดแฮม", "ข้าวผัดกุนเชียง", "ต้มจืดเต้าหู้หมูสับ",
    "ข้าวกะเพราเนื้อ", "ข้าวกะเพราหมูกรอบ", "ข้าวผัดเนื้อ", "ข้าวหมูกรอบทอดกระเทียม",
    "ลาบหมู", "ลาบไก่", "ลาบเนื้อ", "ปีกไก่ทอด", "ไข่เยี่ยวม้ากะเพรากรอบ",
    "ข้าวผัดปู", "ข้าวกะเพราปู", "ข้าวไข่เจียวปู", "ข้าวหน้าปูผัดผงกะหรี่",
    "ผัดซีอิ๊วทะเล", "สุกี้ทะเล", "สุกี้กุ้ง", "สุกี้หมึก", "สปาเก็ตตี้ขี้เมาทะเล",
    "ข้าวผัดต้มยำทะเล", "ต้มยำกุ้ง", "ต้มยำทะเล", "ต้มยำรวมมิตร",
    "ยำวุ้นเส้น", "ยำรวมทะเล", "ผัดผักบุ้งหมูกรอบ", "ผัดคะน้าหมูกรอบ"
]

# Variations to test natural language
VARIATIONS = [
    "เอา{}",
    "ขอ{}หน่อยครับ",
    "อยากกิน{}จานนึง",
]

# Special cases (Edge cases)
SPECIAL_CASES = [
    "ผัดซีอิ๊วหมูพิเศษ",
    "ข้าวกะเพราหมูไม่เผ็ด",
    "ต้มยำทะเลน้ำข้น",
    "ข้าวไข่เจียวหมูสับ", # Confusing?
    "ผัดผักบุ้ง", # Partial match
    "หมูกรอบ", # Ambiguous
]

print(f"🚀 Starting Comprehensive Stress Test against {PROCESS_URL}")
print(f"📦 Total Menu Items: {len(MENU_ITEMS)}")
print(f"🔄 Variations per Item: {len(VARIATIONS)}")
print("-" * 50)

passed = 0
failed = 0
total_tests = 0

def login():
    global AUTH_HEADERS
    response = requests.post(
        LOGIN_URL,
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    response.raise_for_status()
    token = response.json()["token"]
    AUTH_HEADERS = {"Authorization": f"Bearer {token}"}

def run_test(text, expected_keyword=None):
    global passed, failed, total_tests
    total_tests += 1
    print(f"🔹 Input: \"{text}\"", end=" ")
    
    try:
        start_time = time.time()
        response = requests.post(
            PROCESS_URL,
            json={"transcript": text},
            headers=AUTH_HEADERS,
            timeout=30,
        )
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            
            if items:
                result_name = items[0]['menu_name']
                note = items[0].get('note')
                # Check correctness (basic substring check)
                is_correct = True
                if expected_keyword and expected_keyword not in result_name:
                    is_correct = False
                
                # Check for "Forbidden" mistakes (e.g. Crispy Pork -> Pork)
                if "หมูกรอบ" in text and "หมูกรอบ" not in result_name:
                    is_correct = False
                    
                if is_correct:
                    print(f"✅ -> {result_name} ({note}) [{elapsed:.2f}s]")
                    passed += 1
                else:
                    print(f"❌ -> {result_name} (Expected: {expected_keyword})")
                    failed += 1
            else:
                print(f"❌ -> No Match")
                failed += 1
        else:
            print(f"❌ Error {response.status_code}")
            failed += 1
            
    except Exception as e:
        print(f"❌ Network Error: {e}")
        failed += 1

login()

# 1. Test every menu item with variations
for item in MENU_ITEMS:
    for var in VARIATIONS:
        phrase = var.format(item)
        run_test(phrase, expected_keyword=item)

# 2. Test special cases
print("-" * 50)
print("🧐 Testing Special Cases...")
for case in SPECIAL_CASES:
    run_test(case)

print("-" * 50)
print(f"📊 SUMMARY: Passed {passed}/{total_tests} ({(passed/total_tests)*100:.1f}%)")
print(f"💥 Failed: {failed}")
