#!/usr/bin/env python3
"""Original Tianming static-site launcher: local files only, AI via browser."""
import argparse, functools, http.server, mimetypes, pathlib, sys, threading, webbrowser
mimetypes.add_type("application/wasm", ".wasm")
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()
    def do_GET(self):
        if self.path == "/__tianming_health":
            data = b"tianming-offline-local-ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-browser", action="store_true")
    a = p.parse_args()
    base = pathlib.Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
    root = base / "www"
    if not (root / "index.html").is_file():
        print("Missing www/index.html: extract the full ZIP first", file=sys.stderr)
        return 2
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(Handler, directory=str(root)))
    except OSError as e:
        print("Port unavailable (use the same port for saved games):", e, file=sys.stderr)
        return 3
    url = "http://127.0.0.1:%d/index.html" % a.port
    print("Original Tianming local web:", url)
    print("Gemini API requests require internet. No server-side AI proxy is used.")
    if not a.no_browser:
        threading.Timer(.4, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0
if __name__ == "__main__":
    sys.exit(main())
