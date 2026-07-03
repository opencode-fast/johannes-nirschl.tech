#!/usr/bin/env python3
"""Tiny static file server for local testing of the rPPG web app.

Camera access (getUserMedia) is only allowed on a "secure context": HTTPS, or
http://localhost / http://127.0.0.1. This server binds to localhost so the
camera works out of the box for development.

    python3 server.py            # serve on http://localhost:8000
    python3 server.py 8080       # custom port

For real hosting, just copy the whole folder to any static host (see README).
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"rPPG app running at  http://localhost:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
