"""Seeded Python app (P4-T03): crashes on missing config key. Sensor SDK: sdk-python."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import os


def total(items):
    # Seeded bug: items is None when CART_JSON is missing.
    return sum(i["price"] * i["qty"] for i in items)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = b"ok"
        else:
            try:
                body = str(total(None)).encode()
            except TypeError as e:
                body = f"boom: {e}".encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if os.environ.get("AEGIS_SEED_FAULT") == "1":
        total(None)
    HTTPServer(("127.0.0.1", 18083), Handler).serve_forever()
