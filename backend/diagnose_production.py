#!/usr/bin/env python3
"""
Production Diagnostics Script for Attend75
Checks all portal access tiers and reports their status
"""

import os
import sys
import requests
from datetime import datetime

def check_endpoint(name, url, timeout=10):
    """Check if an endpoint is responding"""
    try:
        start = datetime.now()
        resp = requests.get(url, timeout=timeout)
        duration = (datetime.now() - start).total_seconds()
        
        status = "✅ OK" if resp.status_code == 200 else f"⚠️  Status {resp.status_code}"
        print(f"{status} {name:30} ({duration:.2f}s) - {url}")
        return resp.status_code == 200
    except requests.Timeout:
        print(f"❌ TIMEOUT {name:30} - {url}")
        return False
    except Exception as e:
        print(f"❌ ERROR {name:30} - {url}")
        print(f"   └─ {str(e)[:80]}")
        return False

def main():
    print("=" * 80)
    print("Attend75 Production Diagnostics")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 80)
    
    print("\n1. Backend API Health")
    print("-" * 80)
    check_endpoint("Backend Health", "https://api.attend75.xyz/health")
    check_endpoint("Portal Status Check", "https://api.attend75.xyz/portal-status")
    
    print("\n2. AWS Lambda Endpoints (Tier 1)")
    print("-" * 80)
    check_endpoint("Lambda Mumbai", "https://rtqxcric1k.execute-api.ap-south-1.amazonaws.com/proxy/sz/login.aspx", timeout=15)
    check_endpoint("Lambda Singapore", "https://pkro6m3w2e.execute-api.ap-southeast-1.amazonaws.com/proxy/sz/login.aspx", timeout=15)
    
    print("\n3. AWS API Gateway Endpoints (Tier 2)")
    print("-" * 80)
    check_endpoint("API Gateway Mumbai", "https://pfob2x3bd0.execute-api.ap-south-1.amazonaws.com/fireprox/sz/login.aspx", timeout=15)
    check_endpoint("API Gateway Singapore", "https://apzgvkhap5.execute-api.ap-southeast-1.amazonaws.com/fireprox/sz/login.aspx", timeout=15)
    check_endpoint("API Gateway Virginia", "https://l5p4a0zdti.execute-api.us-east-1.amazonaws.com/fireprox/sz/login.aspx", timeout=15)
    
    print("\n4. Direct Portal Access (Tier 4)")
    print("-" * 80)
    check_endpoint("College Portal", "http://111.93.16.209/sz/login.aspx", timeout=15)
    
    print("\n5. Frontend")
    print("-" * 80)
    check_endpoint("Frontend (Cloudflare)", "https://attend75.xyz")
    
    print("\n" + "=" * 80)
    print("Diagnostics Complete")
    print("=" * 80)
    
    print("\n📊 Next Steps:")
    print("   1. If all checks pass but users report issues, check browser console")
    print("   2. If Lambda timeouts, they may be on cooldown (check .env caps)")
    print("   3. If portal is down, fallback tiers should activate automatically")
    print("   4. Check production logs: ssh to Oracle Cloud and check systemd logs")

if __name__ == "__main__":
    main()
