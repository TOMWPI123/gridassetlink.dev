@echo off
python -m pip install requests pyinstaller
pyinstaller --onefile app.py
