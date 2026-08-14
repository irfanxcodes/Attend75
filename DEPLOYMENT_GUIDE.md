# Attend75 Backend Deployment Guide

## Server: Oracle Cloud Free Tier (Ubuntu)
- **IP:** 129.159.239.36
- **User:** ubuntu
- **SSH:** `ssh -i ~/Downloads/oracle-vps.key ubuntu@129.159.239.36`

---

## Quick Deploy (When updating existing server)

After pushing code to GitHub:

```bash
# 1. From your LOCAL machine — upload the .env safely via scp (never copy-paste hashes in terminal)
scp -i ~/Downloads/oracle-vps.key backend/.env ubuntu@129.159.239.36:/tmp/attend75_new.env
ssh -i ~/Downloads/oracle-vps.key ubuntu@129.159.239.36 "sudo mv /tmp/attend75_new.env /opt/attend75/backend/.env && sudo chmod 600 /opt/attend75/backend/.env"

# 2. SSH into the server
ssh -i ~/Downloads/oracle-vps.key ubuntu@129.159.239.36

# 3. Pull latest code
cd /opt/attend75/repo
git pull origin main

# 4. Copy backend files to deployment directory (excludes .env — already uploaded above)
sudo rsync -a --exclude='.env' --exclude='.venv/' --exclude='__pycache__/' --exclude='*.db' /opt/attend75/repo/backend/ /opt/attend75/backend/

# 5. (Optional) Install new Python packages if requirements.txt changed
cd /opt/attend75/backend
source .venv/bin/activate
pip install -r requirements.txt

# 5a. (One-time) Install Tesseract OCR for timetable image uploads
sudo apt-get install -y tesseract-ocr

# 6. Restart the backend
sudo systemctl restart attend75

# 7. Verify it's running
sudo systemctl status attend75
curl http://localhost:8000/health
```

> **IMPORTANT — Never use `cat > .env << 'EOF'` with the hash inline.**
> Shell heredocs and `export` statements interpret `$` as variable expansion, which corrupts the PBKDF2 hash silently.
> Always use `scp` to copy the `.env` from your local machine to the server.

---

## Full Setup Guide (Oracle Cloud Free Tier - Fresh)

### Prerequisites
- Oracle Cloud Free Tier VM (Ubuntu 22.04/24.04, ARM Ampere A1 or AMD)
- Domain name with DNS configured
- Firebase service account JSON
- SSH key configured in Oracle Cloud Console

### Step 0: Oracle Cloud Networking (CRITICAL)

Oracle VMs have TWO firewalls. You must open ports in BOTH:

**A) Oracle Cloud Console — VCN Security List:**
1. Go to Networking → Virtual Cloud Networks → your VCN
2. Click on the Subnet → Security Lists → Default Security List
3. Add Ingress Rules:

| Source CIDR | Protocol | Dest Port | Description |
|-------------|----------|-----------|-------------|
| `0.0.0.0/0` | TCP | 80 | HTTP |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

**B) OS-level iptables (done in Step 1 below)**

### Step 1: Initial Server Setup

```bash
ssh ubuntu@129.159.239.36

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx git libpq-dev

# Open ports in iptables (Oracle Ubuntu images block ports by default)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Add swap space (recommended for free tier)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Step 2: PostgreSQL Database

```bash
sudo -u postgres psql -c "CREATE USER attend75user WITH PASSWORD 'attend75db2026';"
sudo -u postgres psql -c "CREATE DATABASE attend75 OWNER attend75user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE attend75 TO attend75user;"
```

### Step 3: Clone and Setup Backend

```bash
# Create project directory
sudo mkdir -p /opt/attend75/backend
sudo chown -R ubuntu:ubuntu /opt/attend75

# Clone repo
cd /opt/attend75
git clone https://github.com/irfanxcodes/Attend75.git repo

# Copy backend to deployment directory
cp -r repo/backend/* /opt/attend75/backend/

# Create Python virtual environment
cd /opt/attend75/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 4: Firebase Service Account

Upload your Firebase service account JSON to the server:

```bash
# From your LOCAL machine:
scp /path/to/firebase-service-account.json ubuntu@129.159.239.36:/opt/attend75/backend/firebase-service-account.json
```

### Step 5: Production Environment Variables

> **IMPORTANT:** Always copy `.env` via `scp` from your local machine. Never use `cat > .env << 'EOF'`
> or `export` in the shell — the `$` characters in the PBKDF2 hash will be silently corrupted by shell expansion.

```bash
# From your LOCAL machine (run this, not on the server):
scp -i ~/Downloads/oracle-vps.key backend/.env ubuntu@129.159.239.36:/tmp/attend75_new.env

# Then on the server, move it into place:
sudo mv /tmp/attend75_new.env /opt/attend75/backend/.env
sudo chmod 600 /opt/attend75/backend/.env

# Verify the hash loaded correctly (should print 4 parts, no error):
cd /opt/attend75/backend
source .venv/bin/activate
python3 -c "
from dotenv import load_dotenv; load_dotenv()
import os
h = os.getenv('ADMIN_PASSWORD_HASH', '')
parts = h.split('\$', 3)
assert len(parts) == 4 and not any(c in h for c in [' ', '\n', '\r']), f'CORRUPTED: {repr(h[:60])}'
print(f'OK — {parts[0]}, {parts[1]} iterations, {len(parts[2])}‑char salt, {len(parts[3])}‑char digest')
"
```

### Step 6: Restore Database (from old server)

```bash
# ON OLD SERVER (168.144.112.20):
pg_dump -U attend75user -d attend75 -F c -f /tmp/attend75_backup.dump

# ON YOUR LOCAL MACHINE:
scp root@168.144.112.20:/tmp/attend75_backup.dump ./attend75_backup.dump
scp ./attend75_backup.dump ubuntu@129.159.239.36:/tmp/attend75_backup.dump

# ON NEW ORACLE SERVER:
sudo -u postgres pg_restore -d attend75 /tmp/attend75_backup.dump
```

Or if starting fresh (no data to migrate):

```bash
cd /opt/attend75/backend
source .venv/bin/activate
export DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
alembic upgrade head
```

### Step 7: Systemd Service (auto-start on boot)

```bash
sudo cat > /etc/systemd/system/attend75.service << 'EOF'
[Unit]
Description=Attend75 Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/attend75/backend
Environment=PATH=/opt/attend75/backend/.venv/bin:/usr/bin:/bin
EnvironmentFile=/opt/attend75/backend/.env
ExecStart=/opt/attend75/backend/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable attend75
sudo systemctl start attend75
```

### Step 8: Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/sites-available/attend75 << 'EOF'
server {
    listen 80;
    server_name api.attend75.xyz;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/attend75 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

### Step 9: SSL Certificate

**Important:** DNS must be pointing to the new IP (129.159.239.36) FIRST before running certbot.

```bash
sudo certbot --nginx -d api.attend75.xyz --non-interactive --agree-tos --email irfanxcodes@gmail.com
```

### Step 10: DNS Setup (Namecheap)

Update these DNS records on Namecheap → Advanced DNS:

| Type | Host | Value |
|------|------|-------|
| A Record | `@` | `216.198.79.1` (Vercel's IP) |
| A Record | `api` | `129.159.239.36` (Oracle Cloud VM) |
| CNAME | `www` | `fc029b5438e93b6d.vercel-dns-017.com.` |

### Step 11: Vercel Frontend

No changes needed — frontend stays on Vercel as-is.

---

## Useful Commands

```bash
# SSH into server
ssh ubuntu@129.159.239.36

# Check backend status
sudo systemctl status attend75

# View live logs
sudo journalctl -u attend75 -f

# Restart backend
sudo systemctl restart attend75

# Check nginx status
sudo systemctl status nginx

# Renew SSL (auto-renews, but manual command)
sudo certbot renew

# Check database
sudo -u postgres psql -d attend75 -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"

# Check disk space
df -h

# Check memory
free -m

# Check swap
swapon --show
```

## Architecture

```
Internet
    │
    ├── attend75.xyz ──────→ Vercel (frontend)
    │
    └── api.attend75.xyz ──→ Oracle Cloud VM (129.159.239.36)
                                │
                                ├── Nginx (port 443, SSL)
                                │     │
                                │     └──→ Uvicorn (port 8000)
                                │             │
                                │             ├── FastAPI app
                                │             └── Firebase Admin SDK
                                │
                                └── PostgreSQL (localhost:5432)
```

## Important Files on Server

| Path | Purpose |
|------|---------|
| `/opt/attend75/repo/` | Git clone (source of truth) |
| `/opt/attend75/backend/` | Running deployment |
| `/opt/attend75/backend/.env` | Production secrets |
| `/opt/attend75/backend/.venv/` | Python virtual environment |
| `/opt/attend75/backend/firebase-service-account.json` | Firebase credentials |
| `/etc/systemd/system/attend75.service` | Systemd service config |
| `/etc/nginx/sites-available/attend75` | Nginx config |
| `/etc/letsencrypt/` | SSL certificates |

## Oracle Cloud Specific Notes

- **Default user is `ubuntu`**, not `root`. Use `sudo` for privileged commands.
- **Two firewalls:** Always check both VCN Security List (cloud console) AND iptables (OS level).
- **Free tier limits:** 1 GB RAM (AMD) or up to 24 GB RAM (4 Ampere A1 OCPUs shared). Add swap regardless.
- **Boot volume:** 47 GB by default (expandable to 200 GB for free).
- **Always-free:** The VM won't be terminated as long as you're within free tier limits.
- **ARM (Ampere A1):** If using ARM, most Python packages work fine. If any C extension fails to build, install the `-dev` headers (e.g., `libpq-dev` for psycopg2).

## Troubleshooting

**Can't reach server on port 80/443:**
```bash
# Check iptables
sudo iptables -L INPUT -n --line-numbers
# Check if nginx is listening
sudo ss -tlnp | grep -E '80|443'
# If ports are blocked, re-add rules:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
Also verify Oracle Cloud Console → VCN → Security List has ingress rules for 80 and 443.

**Backend won't start:**
```bash
sudo journalctl -u attend75 --no-pager -n 50
```

**502 Bad Gateway from nginx:**
```bash
# Check if uvicorn is running
ss -tlnp | grep 8000
# If not, check logs
sudo journalctl -u attend75 -n 20
```

**Database connection error:**
```bash
sudo -u postgres psql -c "\l"  # List databases
sudo systemctl status postgresql
```

**SSL certificate expired:**
```bash
sudo certbot renew
sudo systemctl restart nginx
```

**Out of memory (OOM kills):**
```bash
# Check if swap is active
swapon --show
free -m
# If no swap, add it:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Migration Checklist (DigitalOcean → Oracle)

- [x] Update DEPLOYMENT_GUIDE.md with new IP and Oracle instructions
- [ ] Set up Oracle VCN Security List (ports 80, 443)
- [ ] Provision and SSH into new VM
- [ ] Install packages, open iptables, add swap
- [ ] Set up PostgreSQL
- [ ] Clone repo and set up backend
- [ ] Copy firebase-service-account.json to new server
- [ ] Migrate database (pg_dump → pg_restore)
- [ ] Set up systemd service
- [ ] Set up nginx
- [ ] Update DNS (api A record → 129.159.239.36)
- [ ] Run certbot for SSL
- [ ] Verify everything works
- [ ] Decommission old DigitalOcean droplet

---

## Slide Player Setup (LibreOffice + Cloudflare R2)

### Step A: Install LibreOffice (one-time, on the VPS)

```bash
ssh ubuntu@129.159.239.36

# ~300 MB install — done once, never again
sudo apt-get update
sudo apt-get install -y libreoffice-common libreoffice-impress libreoffice-writer

# Verify
libreoffice --version
# Expected: LibreOffice 7.x.x.x ...
```

LibreOffice gives pixel-perfect PPTX → PDF → image conversion. It preserves original fonts, colors, images, gradients, and tables — exactly what the student uploaded.

Without LibreOffice (dev machines), the renderer falls back to python-pptx + Pillow (plain text reconstruction) and then PyMuPDF for PDFs.

---

### Step B: Set up Cloudflare R2 (free, zero egress fees)

**Why R2 and not local disk?**
- Slide images are permanent artifacts that survive server redeployments
- R2 free tier is 10 GB — our internal cap is 7.5 GB (25% safety margin)
- R2 has zero egress fees — no cost when students view slides
- S3-compatible API, so integration is trivial (boto3)

**Setup:**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 Object Storage → Create bucket
   - Bucket name: `attend75-slides`
   - Location: Automatic

2. R2 → Manage R2 API Tokens → Create API Token
   - Permissions: Object Read & Write
   - Bucket: `attend75-slides` (specific bucket)
   - Copy the **Access Key ID** and **Secret Access Key**

3. (Recommended) Add a custom domain to the bucket:
   - R2 → `attend75-slides` → Settings → Custom Domains → Connect Domain
   - Add: `slides.attend75.xyz`
   - This gives you clean URLs like `https://slides.attend75.xyz/slides/{upload_id}/slide_001.webp`

4. Add to `/opt/attend75/backend/.env` on the server:

```bash
# From your LOCAL machine — upload updated .env with R2 credentials:
scp -i ~/Downloads/oracle-vps.key backend/.env ubuntu@129.159.239.36:/tmp/attend75_new.env
ssh -i ~/Downloads/oracle-vps.key ubuntu@129.159.239.36 "sudo mv /tmp/attend75_new.env /opt/attend75/backend/.env && sudo chmod 600 /opt/attend75/backend/.env"
```

The `.env` R2 section looks like:
```
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY=your_r2_access_key_id
R2_SECRET_KEY=your_r2_secret_access_key
R2_BUCKET=attend75-slides
R2_PUBLIC_URL=https://slides.attend75.xyz
```

5. Restart backend:
```bash
sudo systemctl restart attend75
```

**Verify R2 is active:**
```bash
curl "https://api.attend75.xyz/studyme/chapters/test/slides/stats?token=YOUR_TOKEN"
# Should return: {"storage_mode": "r2", ...}
```

---

### Step C: Run the Alembic migration (if not already run)

```bash
ssh ubuntu@129.159.239.36
cd /opt/attend75/backend
source .venv/bin/activate
export DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
alembic upgrade head
# Should print: Running upgrade ... -> 20260810_0019, Create slide player tables
```

---

### Step D: Storage Hard Cap + Admin Alerts (zero surprise charges)

The slide player has a **hard cap system** that guarantees R2 stays within
the free tier and sends you a push notification before anything gets close.

**How it works:**
- A `storage_cap_state` table (single row) tracks the running slide count and
  alert state atomically — DB-level `SELECT FOR UPDATE` prevents race conditions.
- Before any batch of slides is rendered, `check_and_increment(n)` runs inside
  a transaction. If `current + n > cap`, it raises immediately — nothing is stored.
- Warning pushes fire at **50 %**, **75 %**, **90 %**, then a hard block + alert at **100 %**.
- The block sticks until you explicitly call `POST /admin/storage/reset-cap-block`.

**Required env vars (add to `.env` before deploying):**

```
# Hard cap — 3000 slides ≈ 120 MB, R2 free tier is 10 000 MB
STORAGE_HARD_CAP_SLIDES=3000

# Your roll number — receives push notifications at each threshold
ADMIN_ROLL_NUMBER=24fmuchh014059
```

**Run the migration after deploying:**

```bash
ssh ubuntu@129.159.239.36
cd /opt/attend75/backend
source .venv/bin/activate
export DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
alembic upgrade head
# Should print: Running upgrade 20260812_0021 -> 20260812_0022, Create storage_cap_state table
```

**Admin endpoints:**

| Endpoint | What it does |
|----------|-------------|
| `GET  /admin/storage/caps` | Current usage, % used, remaining, alert level |
| `POST /admin/storage/reset-cap-block` | Lift the hard block after raising the cap or deleting slides |
| `POST /admin/storage/sync-count` | Resync counter after manual DB deletions |

**To raise the cap when needed:**
1. Update `STORAGE_HARD_CAP_SLIDES` in `.env` on the server
2. Restart the backend: `sudo systemctl restart attend75`
3. Call `POST /admin/storage/reset-cap-block` (if uploads were blocked)

**Per-upload cap (unchanged):**
- `MAX_SLIDES_PER_UPLOAD = 120` — per-PPT limit regardless of global cap
- Deduplication by `upload_id` — same PPT uploaded twice = zero extra renders

---

### How the slide pipeline works end-to-end

```
Student uploads Accounting.pptx
         ↓
Hash check → already processed? → reuse upload_id, skip rendering
         ↓ (new file)
LibreOffice converts PPTX → PDF (headless, ~5-15 sec)
         ↓
PyMuPDF renders PDF → PNG per page → convert to WebP (actual size varies)
         ↓
Upload all WebP images to R2: slides/{upload_id}/slide_001.webp ...
         ↓
Save slide metadata to lesson_slides table (URL, title, body_preview)
         ↓
Delete original PPTX (no longer needed)
         ↓
Mark as ready


First student opens Source tab
         ↓
GET /studyme/chapters/{upload_id}/slides → full list from DB (fast)
         ↓
Student presses Play on slide 3
         ↓
GET /slides/3/teaching-script → check slide_teaching_scripts table
   ├── EXISTS → return cached script (zero LLM cost)
   └── NEW    → LLM generates action sequence → save to DB → return
                (one LLM call, ever, for this slide)
         ↓
Frontend executes action sequence:
  spotlight title region (0.6s)
  → speech "The accounting equation is..."  (TTS)
  → pause (1.0s)
  → spotlight body region (0.5s)
  → speech "Notice that assets always equal..."
  → auto-advance to slide 4 (1.4s pause)
```

Every student after the first gets the cached teaching script from DB.
Zero LLM cost. Zero re-rendering. Everyone sees the same real slides.
