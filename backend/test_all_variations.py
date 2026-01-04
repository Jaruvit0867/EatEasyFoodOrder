import sys
import os
import time
import random

# Ensure we can import from current directory
sys.path.append(os.getcwd())

try:
    from main import reload_menu_cache, extract_order_with_llm, MENU_CACHE, init_database
except ImportError:
    # If running from root, try backend.main
    sys.path.append(os.path.join(os.getcwd(), 'backend'))
    from backend.main import reload_menu_cache, extract_order_with_llm, MENU_CACHE, init_database

def generate_variations(item_name):
    """Generate diverse spoken variations for a menu item."""
    variations = [
        (f"เอา{item_name}", "Standard"),
        (f"ขอ{item_name} 1 ที่ครับ", "Polite with Qty"),
        (f"สั่ง{item_name}หน่อย", "Casual"),
        (f"{item_name} 2 จาน", "Quantity Only"),
        (f"เอา{item_name} ขอแบบเผ็ดๆ", "With Note")
    ]
    return variations

def run_suite():
    print("=== INITIALIZING SYSTEM ===")
    init_database()
    reload_menu_cache()
    
    items = MENU_CACHE["items"]
    items = MENU_CACHE["items"]
    # items = items[:3] # Debug: Test only first 3 items
    
    total_tests = 0
    passed = 0
    failed = []
    
    print(f"\n=== STARTING TEST SUITE ({len(items)} Items) ===")
    start_time = time.time()
    
    for item in items:
        name = item["name"]
        print(f"\nTesting: [ {name} ]")
        variations = generate_variations(name)
        
        for transcript, label in variations:
            total_tests += 1
            print(f"  > '{transcript}' ({label})... ", end="", flush=True)
            
            try:
                # Call AI
                result = extract_order_with_llm(transcript, items)
                
                # Verify
                if result and result.menu_name == name:
                    # Check Quantity
                    expected_qty = 2 if "2" in transcript else 1
                    if result.quantity == expected_qty:
                         print("✅ PASS")
                         passed += 1
                    else:
                         print(f"⚠️  QTY MISMATCH (Exp: {expected_qty}, Got: {result.quantity})")
                         failed.append({"input": transcript, "expected": name, "got": result.menu_name, "issue": "Qty Mismatch"})
                else:
                    got_name = result.menu_name if result else "None"
                    print(f"❌ FAIL (Got: {got_name})")
                    failed.append({"input": transcript, "expected": name, "got": got_name, "issue": "Wrong Item"})
            except Exception as e:
                print(f"🔥 ERROR: {e}")
                failed.append({"input": transcript, "expected": name, "got": "Error", "issue": str(e)})

    duration = time.time() - start_time
    print(f"\n=== TEST COMPLETE ===")
    print(f"Time Taken: {duration:.2f}s")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed}")
    print(f"Failed: {len(failed)}")
    print(f"Accuracy: {(passed/total_tests)*100:.1f}%")
    
    if failed:
        print("\n=== FAILURES ===")
        for f in failed:
            print(f"- Input: '{f['input']}' -> Expected: '{f['expected']}', Got: '{f['got']}' [{f['issue']}]")

if __name__ == "__main__":
    run_suite()
