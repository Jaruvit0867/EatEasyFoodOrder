# EatEasy Food Order - Tech Stack & Architecture

## 📦 Project Overview
Voice-controlled food ordering system for Thai rice & curry restaurants. Customers order by speaking, staff sees orders on kitchen display.

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
│         └────────────────┴─────────────────────┘             │
│                          │                                   │
│                     MENU_CACHE (In-Memory)                   │
│                     + SQLite Database                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Frontend (Next.js 15 + React 19)

### Tech Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first styling |
| Web Speech API | Native | Voice recognition (browser) |

### Key Files
```
frontend/
├── src/app/
│   ├── page.tsx          # Main order page (voice UI)
│   ├── kitchen/page.tsx  # Kitchen display
│   ├── dashboard/page.tsx # Admin dashboard
│   ├── layout.tsx        # Root layout + fonts
│   └── globals.css       # Global styles + animations
├── next.config.ts        # API rewrites config
└── package.json
```

### Voice Input Flow
```
User speaks → Web Speech API → Transcript → POST /api/process-text-order → Cart Update
```

### Key Features
- **Accordion Cart**: Collapsible items with auto-expand on new additions
- **Auto-scroll**: Tracks newly added items
- **Glassmorphism UI**: Premium frosted glass effects
- **Glow Animations**: Mic button pulse, selection glow
- **Dine-in/Takeaway**: Selection per item with validation

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
| FastAPI | 0.100+ | REST API framework |
| Python | 3.11+ | Backend language |
| SQLite | 3.x | Database |
| Uvicorn | Latest | ASGI server |

### Key File
```
backend/
├── main.py              # All API logic in single file
└── orders.db            # SQLite database (auto-created)
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/process-text-order` | Process voice transcript → menu item |
| POST | `/confirm-order` | Save order to database |
| GET | `/orders` | List all orders |
| GET | `/orders/pending` | Kitchen display orders |
| PUT | `/orders/{id}/status` | Update order status |
| GET/POST/PUT/DELETE | `/menu-items` | Menu CRUD |
| GET | `/analytics/*` | Stats, top items, daily sales |

### Core Functions

#### 1. Menu Cache (In-Memory)
```python
MENU_CACHE = {
    "items": [...],           # Active menu items
    "inactive_items": [...],  # Sold-out items
    "keywords_map": {...},    # Keyword → items lookup
    "last_updated": datetime
}
```

#### 2. Order Processing Flow
```
Transcript → check_sold_out() → process_order() → OrderItem
                 │                    │
                 ▼                    ▼
          "หมดแล้วครับ"        Match by keywords
                              Score-based ranking
```

#### 3. Keyword Matching Algorithm
```python
for keyword in item["keywords"]:
    if keyword in transcript:
        score += len(keyword)  # Longer = better match
```

### Database Schema
```sql
-- menu_items
id, name, keywords, base_price, category, is_active, created_at, updated_at

-- orders
id, items (JSON), total_price, status, created_at
```

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

### Quick Start
```bash
./easy_run.sh    # Starts both frontend (3000) + backend (8000)
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
cd frontend && npm run dev -- --experimental-https
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
- [x] Auto-detect menu items from speech
- [x] Silence detection auto-stop
- [x] Accordion cart with animations
- [x] Dine-in/Takeaway selection
- [x] Sold-out item detection
- [x] Note per item (voice)
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

## 📄 Files Modified in This Session

### Frontend
- `frontend/src/app/page.tsx` - Voice UI, accordion cart, validation
- `frontend/src/app/globals.css` - Glassmorphism, animations
- `frontend/src/app/dashboard/page.tsx` - Menu status toggle

### Backend
- `backend/main.py` - Sold-out detection, menu toggle fix

---

## 🔧 Environment

- **OS**: macOS
- **Node.js**: 18+
- **Python**: 3.11+
- **Browser**: Chrome (best for Web Speech API)
