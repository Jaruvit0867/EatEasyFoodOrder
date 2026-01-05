#!/usr/bin/env python3
"""Test script - with dine-in/takeaway indicator"""

import socket
from datetime import datetime, timedelta, timezone
from PIL import Image, ImageDraw, ImageFont

PRINTER_IP = "192.168.1.200"
PRINTER_PORT = 9100
PAPER_WIDTH = 576
THAI_TZ = timezone(timedelta(hours=7))
THAI_FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Thonburi.ttc",
    "/System/Library/Fonts/Thonburi.ttc",
    "/Library/Fonts/Thonburi.ttf",
]

def get_thai_font(size=24):
    for path in THAI_FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return ImageFont.load_default()

def text_to_image(text: str, font_size: int = 24, center: bool = False, bold: bool = False) -> Image.Image:
    font = get_thai_font(font_size)
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

def separator_image() -> Image.Image:
    line = "=" * 40
    return text_to_image(line, font_size=20, center=True)

def image_to_escpos(img: Image.Image) -> bytes:
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

def print_order_receipt(order_id: int, items: list, total_price: int):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        print(f"Connecting to {PRINTER_IP}:{PRINTER_PORT}...")
        sock.connect((PRINTER_IP, PRINTER_PORT))
        
        sock.sendall(b'\x1c\x2e')
        sock.sendall(b'\x1b\x40')
        
        # === HEADER ===
        sock.sendall(image_to_escpos(text_to_image("เจ๊ดา อาหารตามสั่ง", font_size=44, center=True, bold=True)))
        sock.sendall(image_to_escpos(text_to_image("Original Thai Food", font_size=26, center=True)))
        sock.sendall(b'\n')
        
        # === ORDER INFO ===
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(image_to_escpos(text_to_image(f"ORDER: #{order_id}", font_size=38, center=True, bold=True)))
        created_at = datetime.now(THAI_TZ).strftime("%d/%m/%Y %H:%M")
        sock.sendall(image_to_escpos(text_to_image(f"DATE: {created_at}", font_size=28, center=True)))
        
        # === ORDER TYPE ===
        is_takeaway = any("ใส่กล่องกลับบ้าน" in item.get('note', '') for item in items)
        if is_takeaway:
            sock.sendall(image_to_escpos(text_to_image("🥡 ใส่กล่องกลับบ้าน", font_size=36, center=True, bold=True)))
        else:
            sock.sendall(image_to_escpos(text_to_image("🍽️ ทานที่ร้าน", font_size=36, center=True, bold=True)))
        
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(b'\n')
        
        # === ITEMS ===
        for item in items:
            menu_name = item.get('menu_name', str(item))
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)
            add_ons = item.get('add_ons', [])
            note = item.get('note', '')
            # Clean note (remove takeaway indicator)
            clean_note = note.replace("ใส่กล่องกลับบ้าน", "").replace(",", "").strip()
            
            line = f"{quantity}x {menu_name}"
            sock.sendall(image_to_escpos(text_to_image(line, font_size=36, bold=True)))
            
            if price:
                sock.sendall(image_to_escpos(text_to_image(f"   ราคา: {price}.-", font_size=30)))
            
            for addon in add_ons:
                addon_name = addon.get('name', str(addon))
                addon_price = addon.get('price', 0)
                addon_line = f"   + {addon_name} (+{addon_price})"
                sock.sendall(image_to_escpos(text_to_image(addon_line, font_size=28)))
            
            if clean_note:
                note_line = f"   * {clean_note}"
                sock.sendall(image_to_escpos(text_to_image(note_line, font_size=28)))
            
            sock.sendall(b'\n')
        
        # === TOTAL ===
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image(f"TOTAL: {total_price} B", font_size=40, center=True, bold=True)))
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(separator_image()))
        
        # === FOOTER ===
        sock.sendall(b'\n')
        sock.sendall(image_to_escpos(text_to_image("* THANK YOU *", font_size=30, center=True)))
        
        sock.sendall(b'\n\n\n\x1d\x56\x42\x00')
        sock.close()
        print(f"Order #{order_id} printed!")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    # Test with TAKEAWAY order
    items_takeaway = [
        {'menu_name': 'ข้าวกะเพราหมู', 'quantity': 2, 'price': 100, 
         'add_ons': [{'name': 'ไข่ดาว', 'price': 10}], 'note': 'ใส่กล่องกลับบ้าน,ไม่เอาผัก'},
    ]
    print_order_receipt(1007, items_takeaway, 110)
