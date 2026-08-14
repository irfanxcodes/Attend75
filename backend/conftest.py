"""
conftest.py — makes backend/ the root for all test imports.
Ensures `services`, `db`, `models`, etc. are importable from tests/.
"""
import sys
import os

# Add the backend directory to sys.path so test files can import
# services, db, models, etc. without any package prefix.
sys.path.insert(0, os.path.dirname(__file__))
