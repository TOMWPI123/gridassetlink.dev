from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def main() -> int:
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name",
        "GridAssetLink",
        "--add-data",
        f"{ROOT / 'frontend'};frontend",
        "--add-data",
        f"{ROOT / 'data' / 'demo_assets.json'};data",
        "--add-data",
        f"{ROOT / '.env.example'};.",
        "--collect-submodules",
        "PySide6",
        "--collect-submodules",
        "PySide6.QtWebEngineWidgets",
        str(ROOT / "main.py"),
    ]
    print("Building GridAssetLink.exe with PyInstaller...")
    print(" ".join(f'"{part}"' if " " in part else part for part in command))
    subprocess.check_call(command, cwd=ROOT)
    print(f"Executable build complete: {ROOT / 'dist' / 'GridAssetLink.exe'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
