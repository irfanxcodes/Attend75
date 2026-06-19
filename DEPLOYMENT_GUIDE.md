# Attend75 Backend Deployment Guide

## Quick Deploy (When updating existing server)

After pushing code to GitHub:

```bash
# 1. SSH into the server
ssh root@168.144.112.20

# 2. Pull latest code
cd /opt/attend75/repo
git pull origin main

# 3. Copy backend files to deployment directory
cp -r /opt/attend75/repo/backend/* /opt/attend75/backend/

# 4. Restore the production .env (git pull may overwrite it)
cat > /opt/attend75/backend/.env << 'EOF'
DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
CREDENTIAL_ENCRYPTION_KEY=aRC25brJebPQXJq9cH6OmzRJ3krZYpFVP2yglU2NmMM=
FIREBASE_SERVICE_ACCOUNT_FILE=/opt/attend75/backend/firebase-service-account.json
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=pbkdf2_sha256$260000$864805143b3686f7f8365cfab5a55f25$13d40a198bccaaf827e676aa8a8bb2ec743389c393e6620d1537546f8a1250ad
CORS_ALLOW_ORIGINS=https://attend75.xyz,https://www.attend75.xyz,http://localhost:5173
CORS_ALLOW_ORIGIN_REGEX=https?://(.*\.)?attend75\.xyz$
EOF

# 5. (Optional) Install new Python packages if requirements.txt changed
cd /opt/attend75/backend
source .venv/bin/activate
pip install -r requirements.txt

# 6. Restart the backend
systemctl restart attend75

# 7. Verify it's running
systemctl status attend75
curl http://localhost:8000/health
```

That's it. Takes about 30 seconds.

---

## Full Setup Guide (Fresh server from scratch)

### Prerequisites
- DigitalOcean droplet with Ubuntu 24.04
- Domain name with DNS configured
- Firebase service account JSON

### Step 1: Initial Server Setup

```bash
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx git
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
mkdir -p /opt/attend75/backend

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
# Create the file (paste your JSON content between the EOF markers)
cat > /opt/attend75/backend/firebase-service-account.json << 'EOF'
{
  "type": "service_account",
  "project_id": "attend75-534c2",
  ... (your full JSON here)
}
EOF
```

### Step 5: Production Environment Variables

```bash
cat > /opt/attend75/backend/.env << 'EOF'
DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
CREDENTIAL_ENCRYPTION_KEY=aRC25brJebPQXJq9cH6OmzRJ3krZYpFVP2yglU2NmMM=
FIREBASE_SERVICE_ACCOUNT_FILE=/opt/attend75/backend/firebase-service-account.json
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=pbkdf2_sha256$260000$864805143b3686f7f8365cfab5a55f25$13d40a198bccaaf827e676aa8a8bb2ec743389c393e6620d1537546f8a1250ad
CORS_ALLOW_ORIGINS=https://attend75.xyz,https://www.attend75.xyz,http://localhost:5173
CORS_ALLOW_ORIGIN_REGEX=https?://(.*\.)?attend75\.xyz$
EOF
```

### Step 6: Database Tables

```bash
cd /opt/attend75/backend
source .venv/bin/activate

# Option A: Run the app once (init_database creates all tables)
timeout 5 uvicorn app:app --host 0.0.0.0 --port 8000 || true

# Option B: Run alembic migrations
export DATABASE_URL=postgresql://attend75user:attend75db2026@localhost:5432/attend75
alembic upgrade head
```

### Step 7: Systemd Service (auto-start on boot)

```bash
cat > /etc/systemd/system/attend75.service << 'EOF'
[Unit]
Description=Attend75 Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/attend75/backend
Environment=PATH=/opt/attend75/backend/.venv/bin:/usr/bin:/bin
EnvironmentFile=/opt/attend75/backend/.env
ExecStart=/opt/attend75/backend/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable attend75
systemctl start attend75
```

### Step 8: Nginx Reverse Proxy

```bash
cat > /etc/nginx/sites-available/attend75 << 'EOF'
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

ln -sf /etc/nginx/sites-available/attend75 /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### Step 9: SSL Certificate

```bash
certbot --nginx -d api.attend75.xyz --non-interactive --agree-tos --email irfanxcodes@gmail.com
```

### Step 10: DNS Setup (Namecheap)

Add these DNS records on Namecheap → Advanced DNS:

| Type | Host | Value |
|------|------|-------|
| A Record | `@` | `216.198.79.1` (Vercel's IP) |
| A Record | `api` | `168.144.112.20` (your droplet IP) |
| CNAME | `www` | `fc029b5438e93b6d.vercel-dns-017.com.` |

### Step 11: Vercel Frontend

Add `attend75.xyz` and `www.attend75.xyz` as domains in Vercel project settings.

---

## Useful Commands

```bash
# Check backend status
systemctl status attend75

# View live logs
journalctl -u attend75 -f

# Restart backend
systemctl restart attend75

# Check nginx status
systemctl status nginx

# Renew SSL (auto-renews, but manual command)
certbot renew

# Check database
sudo -u postgres psql -d attend75 -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"

# Check disk space
df -h

# Check memory
free -m
```

## Architecture

```
Internet
    │
    ├── attend75.xyz ──────→ Vercel (frontend)
    │
    └── api.attend75.xyz ──→ Nginx (port 443, SSL)
                                │
                                └──→ Uvicorn (port 8000)
                                        │
                                        ├── FastAPI app
                                        ├── PostgreSQL (localhost:5432)
                                        └── Firebase Admin SDK
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

## Troubleshooting

**Backend won't start:**
```bash
journalctl -u attend75 --no-pager -n 50
```

**502 Bad Gateway from nginx:**
```bash
# Check if uvicorn is running
ss -tlnp | grep 8000
# If not, check logs
journalctl -u attend75 -n 20
```

**Database connection error:**
```bash
sudo -u postgres psql -c "\l"  # List databases
sudo systemctl status postgresql
```

**SSL certificate expired:**
```bash
certbot renew
systemctl restart nginx
```
