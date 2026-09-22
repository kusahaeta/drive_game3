"""開発用サーバー。ブラウザにキャッシュさせないので、編集したファイルが必ず読み直される。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import sys


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    root = os.path.dirname(os.path.abspath(__file__))
    print(f"http://localhost:{port}")
    ThreadingHTTPServer(("", port), partial(NoCacheHandler, directory=root)).serve_forever()
