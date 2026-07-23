# Attend75 Backend Deployment Guide

## Server: Oracle Cloud Free Tier (Ubuntu)
- **IP:** 129.159.239.36
- **User:** ubuntu
- **SSH:** `ssh -i ~/Downloads/oracle-vps.key ubuntu@129.159.239.36`

---

## Quick Deploy (When updating existing server)

After pushing code to GitHub:

```bash
# 1. SSH into the server
ssh ubuntu@129.159.239.36

# 2. Pull latest code
cd /opt/attend75/repo
git pull origin main

# 3. Copy backend files to deployment directory
sudo cp -r /opt/attend75/repo/backend/* /opt/attend75/backend/

# 4. Restore the production .env (git pull may overwrite it)
sudo cat > /opt/attend75/backend/.env << 'EOF'
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
sudo systemctl restart attend75

# 7. Verify it's running
sudo systemctl status attend75
curl http://localhost:8000/health
```

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
