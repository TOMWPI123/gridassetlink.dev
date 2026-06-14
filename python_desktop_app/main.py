from __future__ import annotations

import argparse
import socket
import sys
import threading
import time
import urllib.request
from dataclasses import dataclass

import uvicorn

from backend.app import create_app
from backend.config import APP_NAME, SYNTHETIC_NOTICE, settings


@dataclass
class ServerHandle:
    server: uvicorn.Server
    thread: threading.Thread
    url: str


def find_free_port(preferred: int | None = None) -> int:
    if preferred:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            if probe.connect_ex((settings.host, preferred)) != 0:
                return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((settings.host, 0))
        return int(sock.getsockname()[1])


def start_backend(port: int, reset_demo_data: bool = False) -> ServerHandle:
    app = create_app(reset_demo_data=reset_demo_data)
    config = uvicorn.Config(app, host=settings.host, port=port, log_level="warning", access_log=False)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="gridassetlink-local-api", daemon=True)
    thread.start()
    url = f"http://{settings.host}:{port}"
    wait_for_backend(url)
    return ServerHandle(server=server, thread=thread, url=url)


def wait_for_backend(url: str, timeout_seconds: float = 12.0) -> None:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=1.0) as response:
                if response.status == 200:
                    return
        except Exception as error:  # pragma: no cover - timing dependent
            last_error = error
            time.sleep(0.15)
    raise RuntimeError(f"Local backend did not start at {url}: {last_error}")


def run_desktop_window(url: str, server_handle: ServerHandle) -> int:
    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox
        from PySide6.QtWebEngineWidgets import QWebEngineView
    except ImportError as error:
        print("PySide6 and PySide6-WebEngine are required for desktop window mode.")
        print("Install dependencies with: pip install -r requirements.txt")
        print(f"Local dashboard API is running at {url}")
        raise SystemExit(2) from error

    class MainWindow(QMainWindow):
        def __init__(self) -> None:
            super().__init__()
            self.setWindowTitle(APP_NAME)
            self.resize(1440, 920)
            self.web_view = QWebEngineView(self)
            self.web_view.setUrl(QUrl(url))
            self.setCentralWidget(self.web_view)

    qt_app = QApplication(sys.argv)
    QMessageBox.information(None, "GridAssetLink Desktop Demo", SYNTHETIC_NOTICE)
    window = MainWindow()
    window.show()

    def shutdown_server() -> None:
        server_handle.server.should_exit = True
        server_handle.thread.join(timeout=3)

    qt_app.aboutToQuit.connect(shutdown_server)
    return int(qt_app.exec())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the GridAssetLink desktop dashboard.")
    parser.add_argument("--port", type=int, default=None, help="Preferred local backend port.")
    parser.add_argument("--server-only", action="store_true", help="Run only the local FastAPI backend.")
    parser.add_argument("--reset-demo-data", action="store_true", help="Recreate the local synthetic/demo SQLite data.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    port = find_free_port(args.port)
    server_handle = start_backend(port, reset_demo_data=args.reset_demo_data)
    if args.server_only:
        print(f"{APP_NAME} local API running at {server_handle.url}")
        print("Press Ctrl+C to stop.")
        try:
            while server_handle.thread.is_alive():
                time.sleep(0.5)
        except KeyboardInterrupt:
            server_handle.server.should_exit = True
            server_handle.thread.join(timeout=3)
        return 0
    return run_desktop_window(server_handle.url, server_handle)


if __name__ == "__main__":
    raise SystemExit(main())

