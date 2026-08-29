import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "frontend2026"))
sys.path.insert(0, str(root_dir / "frontend2026" / "backend2026"))

from frontend2026.backend2026.main import app
