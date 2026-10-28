# Project Cleanup Plan

## 📋 Analysis Complete

### Files to DELETE (Safe to Remove):

#### Root Directory - Duplicate/Old Documentation (31 files):
- ANSWER.md (temporary)
- BOTH_LAMBDAS_DEPLOYED.md (duplicate)
- CAN_LAMBDA_WORK_STANDALONE.md (outdated)
- COOKIE_FLOW_EXPLAINED.md (outdated)
- COOKIE_PERSISTENCE_TEST_RESULTS.md (test results)
- CREATIVE_FREE_ALTERNATIVES.md (outdated)
- DEPLOYMENT_COMPLETE.md (duplicate)
- DEPLOYMENT_OPTIONS.md (outdated)
- DEPLOYMENT_PLAN.md (outdated)
- DEPLOYMENT_READY_SUMMARY.md (duplicate)
- DEPLOY_PRELOGIN.md (outdated)
- FIX_LAMBDA_TIMEOUT.md (outdated)
- FIX_VERIFICATION.md (outdated)
- FREE_OPTIMIZATION_PLAN.md (outdated)
- HISTORY_FIX_SUMMARY.md (outdated)
- LAMBDA_BUGS_FOUND.md (outdated)
- LAMBDA_COOKIE_ANALYSIS.md (outdated)
- LAMBDA_COOKIE_FIX_DEPLOYMENT.md (outdated)
- LAMBDA_COOKIE_ISSUE.md (outdated)
- LAMBDA_DEPLOYMENT_SUCCESS.md (duplicate)
- LAMBDA_FINAL_ANALYSIS.md (outdated)
- LAMBDA_FIXES_COMPLETE.md (outdated)
- LAMBDA_FIX_COMPLETE.md (outdated)
- LAMBDA_INVESTIGATION_REPORT.md (outdated)
- LAMBDA_ISSUES_ANALYSIS.md (outdated)
- LAMBDA_PRODUCTION_SUCCESS.md (duplicate)
- LAMBDA_ROLLBACK_PLAN.md (outdated, Lambda working)
- LAMBDA_SESSION_SOLUTIONS.md (outdated)
- LAMBDA_V5_DEPLOYMENT.md (outdated)
- LAMBDA_VERIFICATION_COMPLETE.md (duplicate)
- LOCAL_TEST_RESULTS.md (test results)
- LOGIN_OPTIMIZATION_QUICK_START.md (outdated)
- LOGIN_OPTIMIZATION_RESEARCH.md (outdated)
- LOGIN_TIME_ANALYSIS.md (outdated)
- LOGIN_TIME_QUICK_REF.md (outdated)
- MANUAL_WORKER_DEPLOYMENT.md (outdated)
- OPTIMIZATION_EXECUTIVE_SUMMARY.md (outdated)
- OPTIMIZATION_INDEX.md (outdated)
- PRELOGIN_IMPLEMENTATION_SUMMARY.md (outdated)
- PRELOGIN_TEST_GUIDE.md (outdated)
- PRODUCTION_DEPLOYMENT_STEPS.md (duplicate)
- PRODUCTION_READY.md (outdated)
- PRODUCTION_RECOMMENDATION.md (outdated)
- SAFE_DEPLOYMENT_GUIDE.md (outdated)
- WORKER_DEPLOYMENT.md (outdated)

#### Root Directory - Test/Debug Scripts (15 files):
- check_lambda_direct.py (one-time test)
- deploy-lambda-fix.sh (old version)
- deploy_lambda_fix.sh (duplicate)
- deploy_prelogin.sh (outdated)
- lambda_function.zip (old version)
- lambda_function_v2.zip (old version)
- lambda_test_output.txt (test output)
- measure_login_time.py (one-time test)
- test_history_debug.py (debugging)
- test_history_simple.py (debugging)
- test_lambda_cookie_fix.py (one-time test)
- test_lambda_locally.py (one-time test)
- test_prelogin_speed.py (outdated)
- verify_fix.py (one-time test)
- verify_lambda_issue.py (one-time test)

#### Root Directory - Test Databases (1 file):
- attend75_test_cookies.db (test database)

#### Backend Directory - Test Scripts (16 files):
- debug_lambda_response.py (debugging)
- diagnostic_api_gateway_investigation.py (one-time diagnostic)
- diagnostic_task_1_2_marks_priming.py (one-time diagnostic)
- diagnostic_task_1_3_history_tier.py (one-time diagnostic)
- diagnostic_task_1_4_to_1_7_lambda_performance.py (one-time diagnostic)
- test_cookie_flow.py (one-time test)
- test_cookie_persistence.py (one-time test)
- test_direct_access.py (one-time test)
- test_fixed_lambda.py (one-time test)
- test_http_proxy_tier.py (one-time test)
- test_lambda_fixed.py (one-time test)
- test_lambda_vs_api_gateway.py (one-time test)
- test_marks_page_content.py (one-time test)
- test_production_lambda.py (one-time test)
- test_real_login_performance.py (one-time test)
- test_with_api_gateway.py (one-time test)
- verify_lambda_production_ready.py (one-time test)

#### Backend Directory - Test Databases (4 files):
- attend75_cap_test.db (test)
- attend75_lambda_test.db (test)
- attend75_migration_test.db (test)
- attend75_test_cookies.db (test)

#### Backend Directory - Old Investigation Docs (5 files):
- FINAL_INVESTIGATION_SUMMARY.md (outdated)
- investigation_results.md (outdated)
- investigation_summary.md (outdated)
- investigation_task_1_1_output.log (old logs)
- investigation_task_1_2_output.log (old logs)
- investigation_task_1_3_output.log (old logs)
- investigation_task_1_4_to_1_7_output.log (old logs)

#### Other Directories to Clean:
- __pycache__/ (Python cache - safe to delete)
- .DS_Store (Mac system file)
- lambda_deployment/ (if empty or old files)
- node_modules/ (can be regenerated with npm install)

---

### Files to KEEP (Important):

#### Root - Essential Documentation:
- README.md (main project documentation)
- DEPLOYMENT_GUIDE.md (production deployment guide)
- STUDYME_DOCUMENTATION.md (feature documentation)
- PERFORMANCE_TEST_RESULTS.md (historical reference)
- PRODUCTION_LAMBDA_DEPLOYED.md (current state)
- WORKER_DEPLOYMENT_GUIDE.md (worker deployment)

#### Root - Essential Code:
- lambda_function.py (current Lambda code)
- lambda_function_v3.zip (latest deployed version)
- lambda_requirements.txt (Lambda dependencies)
- cloudflare-worker-proxy.js (active worker)
- cloudflare-worker-simple-proxy.js (backup worker)
- deploy-workers.sh (deployment script)
- wrangler.toml (Cloudflare config)
- package.json (Node dependencies)

#### Root - Essential Config:
- .gitignore (Git config)
- .vercel/ (Vercel config)
- .vscode/ (VS Code settings)
- .wrangler/ (Cloudflare cache)
- .git/ (Git repository)
- .kiro/ (Kiro config)

#### Backend - All Production Code:
- app.py (main application)
- conftest.py (pytest configuration)
- attend75.db (production database)
- README.md (backend docs)
- alembic/ (database migrations)
- db/ (database models)
- routes/ (API routes)
- scrapers/ (portal scrapers)
- services/ (business logic)
- backups/ (database backups)
- category_config.json (config)
- .env (secrets - CRITICAL)
- alembic.ini (DB config)
- requirements.txt (Python deps)

#### Frontend - All Production Code:
- (Keep entire frontend/ directory)

#### Scripts - All Utility Scripts:
- (Keep entire scripts/ directory)

---

## Summary:

**Total Files to Delete**: ~90 files
**Estimated Space Saved**: ~50-100 MB
**Risk Level**: Low (all test/debug/duplicate files)

**Categories**:
- Documentation duplicates: 45 files
- Test scripts: 31 files  
- Test databases: 5 files
- Debug logs: 7 files
- System files: 2 files
- Old builds: 2 files
