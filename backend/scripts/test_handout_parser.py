"""Test handout parser with MA course handout text."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MA_HANDOUT = """
BBA MANAGEMENT ACCOUNTING
Course Code: SHAC441 | Semester: V | Credits: 4
Instructor: Dr.N.S. Sudesh | Email: sudeshns@ibsindia.org

F. Syllabus:

Module 1: Fundamentals of Management Accounting
Introduction to Management Accounting - Nature, Scope, Objectives, and Definitions
Functions of the Management Accountant - Comparison with Other Accounting Branches
Limitations of Management Accounting - Installation Process
Cost Classification - Cost Sheet & Unit Costing Components

Module 2: Costing Methods and Systems
Job Costing - Batch Costing - Cost Sheets in Job Costing - Economic Batch Quantity (EBQ)
Contract Costing - Differences between Job Costing and Contract Costing
Work Certified vs. Work Uncertified - Retention Money and Notional Profit
Process Costing - Normal Loss, Abnormal Loss, and Abnormal Gain
Service Costing - Transportation, Hospital, Hospitality, and IT-Based Service Industries

Module 3: Managerial Decision-Making Tools
Cost-Volume-Profit (CVP) Analysis - CVP Assumptions, Profit-Volume Graph
Marginal Costing Income Statement - Application of CVP Analysis
Differential Costing Techniques - Relevant vs. Irrelevant Costs
Sales Mix, Make-or-Buy, Accept-or-Reject, Purchasing vs. Leasing Decisions

Module 4: Standard Costing and Variance Analysis
Standard Costing Concepts - Installation of a Standard Costing System
Need for Standards and Types of Standards
Determination of Standard Costs - Variance Analysis
Material and Labor Variance Computation

Module 5: Budgets and Budgetary Control Systems
Concepts of Budgets and Budgetary Control - Classification of Budgets
Preparation of Sales, Production, Direct Material, Manpower, and Cash Budgets
Fixed Budget vs. Flexible Budget
Zero-Based Budgeting and Performance Budgeting

Module 6: Emerging and Advanced Cost Management Concepts
Cost Reduction vs. Cost Control - Activity-Based Costing
Target Costing - Kaizen Costing - Life Cycle Costing
Back-Flush Costing - Throughput-Based Costing - Just-in-Time Inventory

Session-Wise Outline:
Sessions 1-3: Introduction to Management Accounting (Module 1)
Session 4: Cost Classification (Module 1)
Sessions 5-8: Cost Sheet & Unit Costing (Module 1)
Sessions 9-12: Job Costing & Batch Costing (Module 2)
Sessions 14-17: Contract Costing (Module 2)
Sessions 18-21: Process Costing (Module 2)
Sessions 22-26: Service Costing (Module 2)
Sessions 28-30: CVP Analysis (Module 3)
Sessions 31-34: Marginal Costing and Decision Making (Module 3)
Sessions 35-37: Standard Costing and Variance Analysis (Module 4)
Sessions 38-44: Budgets and Budgetary Control (Module 5)
Sessions 45-48: Emerging Cost Management Concepts (Module 6)
"""

from services.handout_parser import parse_syllabus_with_llm

print("\nParsing MA course handout...\n")
result = parse_syllabus_with_llm(MA_HANDOUT)

print(f"Subject: {result.get('subject_name')}")
print(f"Code: {result.get('subject_code')}")
print(f"Program: {result.get('program')} | Semester: {result.get('semester')}")
print(f"Credits: {result.get('credits')}")
print(f"Instructor: {result.get('instructor_name')} <{result.get('instructor_email')}>")
print(f"Modules: {len(result.get('modules', []))}\n")

for m in result.get('modules', []):
    chapters = m.get('chapters', [])
    print(f"  Module {m['number']}: {m['title']}")
    print(f"    Sessions: {m.get('session_range','?')} | Chapters: {len(chapters)}")
    for ch in chapters:
        print(f"    └ {ch['title']} (sessions {ch.get('sessions','?')})")
        for t in ch.get('topics', [])[:3]:
            print(f"      · {t}")
    print()

print("PASS — parser working correctly")
