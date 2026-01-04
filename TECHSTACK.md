# EatEasy Food Order - Tech Stack & Architecture

## 📦 Project Overview
Voice-controlled food ordering system for Thai rice & curry restaurants. Customers order by speaking, staff sees orders on kitchen display.

**Last Updated:** January 5, 2026

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Order Page  │  │   Kitchen   │  │     Dashboard       │  │
│  │ (Voice UI)  │  │   Display   │  │ (Menu/Stats/Logs)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┴─────────────────────┘             │
│                          │                                   │
│                   Next.js Rewrites                           │
│                   /api/* → localhost:8000/*                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────────┐
│                      Backend (FastAPI)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Voice Order │  │    Menu     │  │     Analytics       │  │
│  │  Processing │  │  Management │  │     & Orders        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         ├────────────────┴─────────────────────┘             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Two-Stage Verification                  │    │
│  │  Stage 1: Keyword + Protein Matching                 │    │
│  │  Stage 2: LLM Verification (Ollama - Optional)       │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                     MENU_CACHE (In-Memory)                   │
│                     + SQLite Database                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Frontend (Next.js 16 + React 19)

### Tech Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.1 | React framework with App Router |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first styling |
| Web Speech API | Native | Voice recognition (browser) |

### Key Files
```
frontend/
├── src/app/
│   ├── page.tsx          # Main order page (voice UI) ~55KB
│   ├── kitchen/page.tsx  # Kitchen display
│   ├── dashboard/page.tsx # Admin dashboard
│   ├── layout.tsx        # Root layout + fonts
│   └── globals.css       # Global styles + animations
├── next.config.ts        # API rewrites config
└── package.json
```

### Voice Input Flow
```
User speaks → Web Speech API → Transcript → POST /api/process-text-order → Two-Stage Verification → Cart Update
```

### Key Features
- **Accordion Cart**: Collapsible items with auto-expand on new additions
- **Auto-scroll**: Tracks newly added items
- **Glassmorphism UI**: Premium frosted glass effects
- **Glow Animations**: Mic button pulse, selection glow
- **Dine-in/Takeaway**: Selection per item with validation
- **Smart Suggestions**: Menu suggestions when voice is ambiguous

### Custom CSS Classes (globals.css)
```css
.glass, .glass-dark      /* Glassmorphism effects */
.glow-pulse-orange       /* Mic button glow animation */
.glow-recording          /* Recording state glow */
.glow-blue, .glow-green  /* Selection glow */
.accordion-content       /* Expand/collapse animation */
.animate-slide-in        /* New item entrance */
.animate-float           /* Floating animation */
.gradient-text-orange    /* Gradient text */
```

---

## ⚡ Backend (FastAPI + Python)

### Tech Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.109.0 | REST API framework |
| Python | 3.11+ | Backend language |
| SQLite | 3.x | Database |
| Uvicorn | 0.27.0 | ASGI server |
| Pydantic | 2.x | Data validation |
| Requests | 2.31+ | HTTP client (for Ollama) |

### Key Files
```
backend/
├── main.py              # All API logic (~1300 lines)
├── requirements.txt     # Python dependencies
├── orders.sqlite        # SQLite database (auto-created)
└── test_cases.py        # Test cases
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/process-text-order` | Process voice transcript → menu item |
| POST | `/confirm-order` | Save order to database |
| GET | `/orders` | List all orders |
| GET | `/orders/pending` | Kitchen display orders |
| POST | `/orders/{id}/complete` | Mark order as completed |
| POST | `/orders/{id}/cancel` | Cancel order |
| DELETE | `/orders` | Complete all pending orders |
| GET/POST/PUT/DELETE | `/menu-items` | Menu CRUD |
| POST | `/menu-cache/reload` | Reload menu cache |
| GET | `/analytics/summary` | Sales summary stats |
| GET | `/analytics/top-items` | Top selling items |
| GET | `/analytics/daily-sales` | Daily sales data |
| GET | `/analytics/order-stats` | Order status statistics |
| GET | `/addons` | Get available add-ons |

---

## 🧠 Two-Stage Verification System

### Overview
Advanced order processing with confidence scoring and optional LLM verification.

### Stage 1: Keyword Matching with Confidence
```python
# Scoring System:
# - Menu name in transcript: +50 points
# - Each keyword match: +len(keyword)*2 points
# - Protein match: +30 bonus
# - Protein mismatch: score = 0

# Confidence Levels:
# 90+: Exact match → Auto-accept
# 50-89: Partial match → LLM verify (if enabled)
# 30-49: Low confidence → Show suggestions
# <30: No match → LLM parse or suggestions
```

### Stage 2: LLM Verification (Optional)
```python
# Uses Ollama local LLM (default: llama3.2)
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2"
OLLAMA_TIMEOUT = 5  # seconds

# LLM is used for:
# 1. verify_match_with_llm() - Verify keyword match is correct
# 2. ask_llm_to_parse() - Parse order when keyword fails
```

### Protein Keywords (Safety Layer)
```python
PROTEIN_KEYWORDS = [
    "หมู", "ไก่", "เนื้อ", "กุ้ง", "ปลาหมึก", "ปู", "ปลา",  # Meats
    "ทะเล", "หมูกรอบ", "หมูสับ", "หมูชิ้น"                    # Variants
]
```

### Smart Fallback
When LLM fails or is rejected by Safety Layer, the system falls back to:
1. Keyword matching with exact menu name comparison
2. Menu suggestions for ambiguous orders

---

## 💾 Menu Cache System

### In-Memory Cache Structure
```python
MENU_CACHE = {
    "items": [...],           # Active menu items
    "inactive_items": [...],  # Sold-out items
    "keywords_map": {...},    # Keyword → items lookup
    "last_updated": datetime
}
```

### Features
- Auto-reload on menu changes
- Sold-out item detection
- Fast keyword lookup via `keywords_map`

---

## 📊 Database Schema

### Tables
```sql
-- menu_items
CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    keywords TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    category TEXT DEFAULT 'standard',
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- orders
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items_json TEXT NOT NULL,
    total_price INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Menu Categories
| Category | Price Range | Examples |
|----------|-------------|----------|
| standard | 50 THB | ข้าวกะเพราหมู, ข้าวไข่เจียว |
| premium | 60-70 THB | ข้าวกะเพราหมูกรอบ, ข้าวผัดเนื้อ |
| special | 70-80 THB | ข้าวกะเพราปู, ข้าวกะเพรากุ้ง |
| soup | 100-120 THB | ต้มยำกุ้ง, ต้มยำทะเล |
| kapkhao | 70-80 THB | ผัดคะน้าหมูกรอบ (กับข้าว) |

### Add-ons
| Name | Price | Emoji |
|------|-------|-------|
| ไข่ดาว | 10 THB | 🍳 |
| ไข่เจียว | 10 THB | 🥚 |
| พิเศษ | 10 THB | ⭐ |
| กับข้าว | -10 THB | 🍚 |

---

## 🔗 Frontend-Backend Communication

### Next.js Rewrites (next.config.ts)
```typescript
rewrites: async () => [{
  source: '/api/:path*',
  destination: 'http://localhost:8000/:path*'
}]
```

This solves:
- ✅ CORS issues
- ✅ Mixed content (HTTPS frontend → HTTP backend)
- ✅ Mobile network access

---

## 🚀 Running the Project

### Quick Start (Recommended)
```bash
# macOS/Linux
./easy_run.sh    # Starts both frontend (3000) + backend (8000)

# Windows
easy_run.bat
```

### Manual Start
```bash
# Backend
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend  
cd frontend && npm run dev
```

### HTTPS (for mobile mic access)
```bash
cd frontend && npm run dev:https
```

### First-time Setup
```bash
# macOS/Linux
./easy_setup.sh

# Windows
easy_setup.bat
```

---

## 📱 Endpoints

| Page | URL | Purpose |
|------|-----|---------|
| 🍛 Order | https://localhost:3000 | Customer voice ordering |
| 👨‍🍳 Kitchen | https://localhost:3000/kitchen | Kitchen display |
| 📊 Dashboard | https://localhost:3000/dashboard | Admin panel |

---

## 🧩 Key Features Implemented

### Order Page
- [x] Voice input (Web Speech API)
- [x] Two-Stage Verification (Keyword + LLM)
- [x] Auto-detect menu items from speech
- [x] Protein validation (Safety Layer)
- [x] Silence detection auto-stop
- [x] Accordion cart with animations
- [x] Dine-in/Takeaway selection
- [x] Sold-out item detection
- [x] Note per item (voice)
- [x] Smart suggestions for ambiguous orders
- [x] Validation modal (custom UI)

### Dashboard
- [x] Order statistics (today/7d/30d/all)
- [x] Top selling items chart
- [x] Daily sales bar chart
- [x] Menu CRUD
- [x] Toggle menu active status
- [x] Order history logs

### Kitchen
- [x] Real-time pending orders
- [x] Status update (pending → completed/cancelled)
- [x] Auto-refresh

---

## � Environment

- **OS**: macOS / Windows / Linux
- **Node.js**: 18+
- **Python**: 3.11+
- **Browser**: Chrome (best for Web Speech API)
- **Optional**: Ollama (for LLM verification)

---

## 📦 Dependencies

### Frontend (package.json)
```json
{
  "dependencies": {
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

### Backend (requirements.txt)
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6
pydantic>=2.0.0
requests>=2.31.0
```

---

## � Timezone

All timestamps use **Thailand timezone (UTC+7)**:
```python
THAI_TZ = timezone(timedelta(hours=7))
```
