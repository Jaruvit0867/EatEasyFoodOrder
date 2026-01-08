# EatEasy Food Order System

A voice-controlled food ordering system for Thai restaurants, designed for deployment on Azure.

## System Architecture

- **Frontend**: Next.js 16 (Deployed on Azure Static Web Apps)
- **Backend**: Python FastAPI (Deployed on Azure App Service)
- **Database**: SQLite (Persisted via Azure Files Mount)
- **Authentication**: JWT & LocalStorage (Single-user Admin System)

## Features

- **Voice Ordering**: Customers can order using Thai voice commands via Web Speech API.
- **Smart Menu**: Fuzzy matching and suggestions for menu items.
- **Admin Dashboard**: Secure dashboard for viewing sales, managing menu items, and order history.
- **Kitchen Display**: Real-time order view for kitchen staff.
- **Authentication**: Secure login system for Dashboard and Kitchen views.
- **Responsive Design**: Works on mobile, tablets, and desktop.

## Deployment Instructions

### 1. Backend (Azure App Service)

The backend is a Dockerized FastAPI application.

**Environment Variables Configuration:**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `DATABASE_PATH` | Path to persistent database file | `/data/orders.sqlite` |
| `ADMIN_USERNAME` | Admin username for login | `admin` |
| `ADMIN_PASSWORD` | Secure password for login | `your-secure-password` |
| `JWT_SECRET` | Secret key for token generation | `random-secret-string` |
| `ALLOWED_ORIGINS` | Frontend URL for CORS | `https://your-frontend.azurestaticapps.net` |

**Persistent Storage Setup:**

To ensure data persistence (SQLite), you must mount an Azure File Share:
1. Create an Azure Storage Account.
2. Create a File Share named `data`.
3. In App Service > Configuration > Path mappings, mount this share to `/data`.
4. Set `DATABASE_PATH` to `/data/orders.sqlite`.

### 2. Frontend (Azure Static Web Apps)

The frontend is a Next.js Static Export application.

- Node.js Version: 20 (Specified in `.nvmrc` and `package.json`).
- API Configuration: The frontend automatically detects the environment. In production, it connects to the backend URL defined in `src/config.ts`.

## Authentication

The system uses a single-user authentication model for simplicity.

- **Login Page**: `/login`
- **Protected Routes**: `/dashboard`, `/kitchen` (Redirects to login if unauthenticated)
- **Public Routes**: `/` (Ordering page) requires login as well to prevent unauthorized access from external devices.

**Credential Management:**
Credentials are managed via Azure App Service Environment Variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).

## Printer Integration

*Note: The thermal printer integration is currently configured for local network printing but requires further setup for cloud deployment (e.g., via a local print proxy or VPN endpoint). This feature is currently disabled in the production environment.*

## Project Structure

```
EatEasyFoodOrder/
├── backend/
│   ├── main.py              # FastAPI server & Logic
│   ├── Dockerfile           # Backend container definition
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js Pages (Order, Login, Dashboard, Kitchen)
│   │   ├── auth.ts          # Authentication logic (LocalStorage + Headers)
│   │   └── config.ts        # Runtime configuration
│   └── package.json
└── README.md
```

## License

MIT License
