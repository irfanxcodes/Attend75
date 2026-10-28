# 📂 Attend75 - Clean Project Structure

**Last Updated**: October 28, 2026  
**Status**: ✅ Production-Ready & Organized

---

## 🎯 Root Directory

```
Attend75/
│
├── 📄 Documentation (8 files)
│   ├── README.md                          # Main project overview
│   ├── DEPLOYMENT_GUIDE.md                # Production deployment instructions
│   ├── STUDYME_DOCUMENTATION.md           # StudyMe feature documentation
│   ├── PERFORMANCE_TEST_RESULTS.md        # Historical performance data
│   ├── PRODUCTION_LAMBDA_DEPLOYED.md      # Current Lambda deployment state
│   ├── WORKER_DEPLOYMENT_GUIDE.md         # Cloudflare Worker deployment
│   ├── CLEANUP_SUMMARY.md                 # Cleanup log (this session)
│   └── PROJECT_STRUCTURE.md               # This file
│
├── ⚡ Lambda Functions (3 files)
│   ├── lambda_function.py                 # Current Lambda source code
│   ├── lambda_function_v3.zip             # Deployed package (Mumbai + Singapore)
│   └── lambda_requirements.txt            # Lambda dependencies
│
├── 🔧 Cloudflare Workers (3 files)
│   ├── cloudflare-worker-proxy.js         # Active session-managing proxy
│   ├── cloudflare-worker-simple-proxy.js  # Simple pass-through proxy
│   └── wrangler.toml                      # Cloudflare deployment config
│
├── 🚀 Deployment Scripts (2 files)
│   ├── deploy-workers.sh                  # Deploy all 10 Cloudflare Workers
│   └── cleanup_project.sh                 # Project cleanup script
│
├── 📦 Configuration (2 files)
│   ├── package.json                       # Node.js dependencies (Workers)
│   └── .gitignore                         # Git ignore rules
│
├── 🗂️ Directories
│   ├── backend/                           # Python FastAPI backend
│   ├── frontend/                          # React frontend (Vite)
│   ├── scripts/                           # Utility scripts
│   ├── .git/                              # Git repository
│   ├── .vscode/                           # VS Code settings
│   ├── .kiro/                             # Kiro AI configuration
│   ├── .vercel/                           # Vercel deployment config
│   └── .wrangler/                         # Wrangler cache
│
└── 🗑️ Backup (cleanup)
    └── cleanup_backup_20261028_222257/    # Backup of removed files
```

---

## 🐍 Backend Directory

```
backend/
│
├── 🎯 Core Application (2 files)
│   ├── app.py                             # Main FastAPI application
│   └── conftest.py                        # Pytest configuration
│
├── 📊 Database (2 files)
│   ├── attend75.db                        # Production SQLite database
│   └── alembic.ini                        # Alembic migration config
│
├── 🔐 Configuration (3 files)
│   ├── .env                               # Environment variables (secrets)
│   ├── requirements.txt                   # Python dependencies
│   └── category_config.json               # Subject categories config
│
├── 📁 Source Code Modules
│   ├── alembic/                           # Database migrations
│   │   ├── env.py                         # Migration environment
│   │   └── versions/                      # Migration versions (20+ files)
│   │
│   ├── db/                                # Database layer
│   │   ├── base.py                        # Database connection
│   │   └── models/                        # SQLAlchemy models (25+ models)
│   │
│   ├── routes/                            # API endpoints
│   │   ├── admin_routes.py                # Admin dashboard
│   │   ├── login_routes.py                # Authentication
│   │   ├── attendance_routes.py           # Attendance tracking
│   │   ├── marks_routes.py                # Marks/grades
│   │   ├── studyme_routes.py              # StudyMe AI features
│   │   └── ... (15+ route files)
│   │
│   ├── scrapers/                          # Portal scraping
│   │   ├── portal_scraper.py              # Main scraper (3-tier system)
│   │   └── portal_types.py                # Type definitions
│   │
│   └── services/                          # Business logic
│       ├── captcha_solver.py              # Captcha OCR (ddddocr + Tesseract)
│       ├── cookie_manager.py              # Cookie persistence
│       ├── tier_selector.py               # Lambda/API Gateway/HTTP proxy rotation
│       ├── push_worker.py                 # Push notifications
│       └── ... (25+ service files)
│
└── 📚 Documentation (2 files)
    └── README.md                          # Backend-specific documentation
```

---

## ⚛️ Frontend Directory

```
frontend/
│
├── 📦 Configuration (5 files)
│   ├── package.json                       # Dependencies
│   ├── vite.config.ts                     # Vite bundler config
│   ├── tsconfig.json                      # TypeScript config
│   ├── tailwind.config.js                 # Tailwind CSS config
│   └── index.html                         # Entry HTML
│
├── 🎨 Source Code
│   ├── src/
│   │   ├── main.tsx                       # React entry point
│   │   ├── App.tsx                        # Root component
│   │   │
│   │   ├── pages/                         # Route pages
│   │   │   ├── Login.tsx                  # Login page
│   │   │   ├── Dashboard.tsx              # Main dashboard
│   │   │   ├── Attendance.tsx             # Attendance view
│   │   │   ├── StudyMe.tsx                # AI study assistant
│   │   │   └── ... (20+ pages)
│   │   │
│   │   ├── components/                    # Reusable components
│   │   │   ├── Navbar.tsx                 # Navigation bar
│   │   │   ├── AttendanceCard.tsx         # Attendance widget
│   │   │   └── ... (50+ components)
│   │   │
│   │   ├── services/                      # API clients
│   │   │   ├── api.ts                     # Axios instance
│   │   │   ├── auth.ts                    # Authentication
│   │   │   └── ... (10+ services)
│   │   │
│   │   └── utils/                         # Utilities
│   │       ├── firebase.ts                # Firebase config
│   │       └── ... (helpers)
│   │
│   └── public/                            # Static assets
│       ├── vite.svg                       # Logo
│       └── ... (images, fonts)
│
└── 📚 Build Output
    └── dist/                              # Production build (deployed to Cloudflare Pages)
```

---

## 🛠️ Scripts Directory

```
scripts/
├── deploy.sh                              # Deploy backend to Oracle Cloud
├── backup_db.sh                           # Backup production database
├── restore_db.sh                          # Restore database from backup
└── ... (utility scripts)
```

---

## 📊 Key Metrics

### Project Size:
- **Total Files**: ~500 files (after cleanup)
- **Production Code**: ~400 files
- **Documentation**: 8 essential docs
- **Backup**: 88 files (1.4 MB)

### Code Distribution:
- **Backend (Python)**: ~150 files
- **Frontend (React/TS)**: ~250 files
- **Infrastructure**: ~15 files
- **Documentation**: ~8 files

### Database:
- **Production**: `backend/attend75.db` (PostgreSQL in prod, SQLite locally)
- **Migrations**: 20+ Alembic migration files
- **Models**: 25+ SQLAlchemy models

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          PRODUCTION                              │
└─────────────────────────────────────────────────────────────────┘

Frontend (Cloudflare Pages)
├── https://attend75.xyz
└── Build: frontend/dist/

Backend (Oracle Cloud VPS - 129.159.239.36)
├── https://api.attend75.xyz
├── FastAPI + Uvicorn
├── PostgreSQL database
└── Nginx reverse proxy

Lambda Functions (AWS)
├── Mumbai (ap-south-1): rtqxcric1k
└── Singapore (ap-southeast-1): pkro6m3w2e

Fireprox API Gateway (AWS)
├── Mumbai: pfob2x3bd0
├── Singapore: apzgvkhap5
└── Virginia: l5p4a0zdti

Cloudflare Workers (10 instances)
├── Session-managing proxy
└── Distributed across global edge network

HTTP Proxies
└── 100+ rotating residential proxies
```

---

## ✅ Production Checklist

### Backend:
- [x] Lambda functions deployed (Mumbai + Singapore)
- [x] API Gateway configured for binary responses
- [x] Cookie forwarding working
- [x] Captcha solver handles base64
- [x] 3-tier proxy system active
- [x] Database migrations current
- [x] All services running
- [x] SSL certificate valid

### Frontend:
- [x] Built and deployed to Cloudflare Pages
- [x] Custom domain configured
- [x] API endpoints correct
- [x] Firebase configured
- [x] Push notifications working

### Infrastructure:
- [x] Oracle Cloud VPS running
- [x] Nginx configured
- [x] PostgreSQL database healthy
- [x] Cloudflare Workers deployed
- [x] DNS records correct

---

## 📝 Maintenance Guide

### Daily:
- Monitor CloudWatch logs for Lambda errors
- Check backend health: `curl https://api.attend75.xyz/health`

### Weekly:
- Review proxy rotation statistics
- Check database size and performance
- Monitor API response times

### Monthly:
- Update dependencies: `pip install -U -r requirements.txt`
- Review and optimize database queries
- Clean up old logs and backups

### As Needed:
- Deploy backend updates: Follow `DEPLOYMENT_GUIDE.md`
- Deploy frontend updates: `git push` (auto-deploys via Cloudflare)
- Deploy Lambda updates: `aws lambda update-function-code`

---

## 🎉 Project Status

**Status**: ✅ **Production-Ready**

**Last Major Update**: October 28, 2026 (Lambda deployment + cleanup)

**Active Features**:
- ✅ Portal scraping (3-tier system)
- ✅ Attendance tracking
- ✅ Marks & history
- ✅ StudyMe AI assistant
- ✅ Push notifications
- ✅ Timetable management
- ✅ Notes solver
- ✅ Slide player

**Performance**:
- ⚡ Login: ~240 ms (via Lambda)
- ⚡ Attendance: ~130-280 ms
- ⚡ Marks: ~130-280 ms
- 🛡️ Uptime: 99.9%+ (3-tier fallback)

---

*Structure last updated: October 28, 2026*  
*Next review: November 2026*
