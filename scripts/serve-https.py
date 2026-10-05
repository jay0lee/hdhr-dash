#!/usr/bin/env python3
"""
HDHR Dash — Local HTTPS Static Server
Serves HDHR Dash over HTTPS using a self-signed certificate.

Required for full modern Chrome & browser functionality (Clipboard API copy,
Service Worker caching, PWA installation, etc.) when testing locally or hosting
across a local home network.
"""

import argparse
import http.server
import mimetypes
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
from pathlib import Path

# Ensure correct MIME types for web assets
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('audio/x-mpegurl', '.m3u')


def get_lan_ip():
    """Attempt to detect the primary local LAN IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not actually transmit packets; connects to external route
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'
    finally:
        s.close()


def generate_self_signed_cert(cert_path, key_path, lan_ip='127.0.0.1'):
    """Generate a self-signed certificate using openssl CLI."""
    openssl_bin = shutil.which('openssl')
    if not openssl_bin:
        print("❌ Error: 'openssl' command not found in PATH.")
        print("Please install OpenSSL or provide your own 'cert.pem' and 'key.pem'.")
        sys.exit(1)

    # Subject Alternative Names for localhost and LAN IP
    san_entries = ["DNS:localhost", "IP:127.0.0.1"]
    if lan_ip and lan_ip not in ("127.0.0.1", "0.0.0.0"):
        san_entries.append(f"IP:{lan_ip}")
    san_str = ",".join(san_entries)

    cmd_with_ext = [
        openssl_bin, "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", str(key_path),
        "-out", str(cert_path),
        "-days", "365",
        "-subj", "/CN=localhost",
        "-addext", f"subjectAltName={san_str}"
    ]

    try:
        subprocess.run(cmd_with_ext, check=True, capture_output=True)
    except subprocess.CalledProcessError:
        # Fallback for older OpenSSL/LibreSSL without -addext support
        cmd_fallback = [
            openssl_bin, "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(key_path),
            "-out", str(cert_path),
            "-days", "365",
            "-subj", "/CN=localhost"
        ]
        subprocess.run(cmd_fallback, check=True, capture_output=True)


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler that adds security/caching headers."""
    def end_headers(self):
        # Allow cross-origin requests for local API queries if needed
        self.send_header('Access-Control-Allow-Origin', '*')
        # Prevent aggressive browser caching during local development
        if self.path.endswith(('.html', '.js', '.css', '.json')):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Cleaner console logs
        sys.stderr.write(f"[{self.log_date_time_string()}] {args[0]} {args[1]}\n")


def main():
    parser = argparse.ArgumentParser(description="Serve HDHR Dash over local HTTPS with a self-signed certificate.")
    parser.add_argument("port", nargs="?", type=int, default=8443, help="Port to serve on (default: 8443)")
    parser.add_argument("--bind", "-b", default="0.0.0.0", help="Address to bind to (default: 0.0.0.0)")
    parser.add_argument("--temp", action="store_true", help="Use an ephemeral certificate that is deleted on exit")
    parser.add_argument("--cert", default=None, help="Custom certificate file path (default: cert.pem)")
    parser.add_argument("--key", default=None, help="Custom private key file path (default: key.pem)")
    args = parser.parse_args()

    # Determine project root (directory containing index.html)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    os.chdir(project_root)

    lan_ip = get_lan_ip()
    temp_dir = None

    if args.cert and args.key:
        cert_path = Path(args.cert).resolve()
        key_path = Path(args.key).resolve()
    elif args.temp:
        temp_dir = tempfile.TemporaryDirectory()
        cert_path = Path(temp_dir.name) / "cert.pem"
        key_path = Path(temp_dir.name) / "key.pem"
        print("🔐 Generating temporary self-signed certificate...")
        generate_self_signed_cert(cert_path, key_path, lan_ip)
    else:
        cert_path = project_root / "cert.pem"
        key_path = project_root / "key.pem"
        if not cert_path.exists() or not key_path.exists():
            print("🔐 Generating local self-signed certificate (cert.pem & key.pem)...")
            generate_self_signed_cert(cert_path, key_path, lan_ip)

    # Initialize SSL context
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))

    server_address = (args.bind, args.port)
    httpd = http.server.HTTPServer(server_address, CustomHTTPRequestHandler)
    httpd.socket = ssl_ctx.wrap_socket(httpd.socket, server_side=True)

    print()
    print("=" * 68)
    print("  🚀 HDHR Dash — Local HTTPS Server")
    print("=" * 68)
    print(f"  Local:    https://localhost:{args.port}")
    if lan_ip and lan_ip != "127.0.0.1":
        print(f"  Network:  https://{lan_ip}:{args.port}")
    print("-" * 68)
    print("  ⚠️  BROWSER SECURITY OVERRIDE REQUIRED:")
    print("  Because this uses a self-signed certificate, your browser will")
    print("  display a warning (e.g., 'Your connection is not private').")
    print()
    print("  To bypass the warning:")
    print("  • Chrome / Edge:  Click 'Advanced' -> 'Proceed to ... (unsafe)'")
    print("    (If no link appears, click anywhere on the page and type 'thisisunsafe')")
    print("  • Safari:         Click 'Show Details' -> 'visit this website'")
    print("  • Firefox:        Click 'Advanced' -> 'Accept the Risk and Continue'")
    print("  • Android Chrome: Tap 'Advanced' -> 'Proceed to ... (unsafe)'")
    print("-" * 68)
    print("  💡 Why HTTPS?")
    print("  Chrome and mobile browsers require HTTPS for Clipboard copy,")
    print("  Service Worker offline caching, and PWA installation on LAN IPs.")
    print("=" * 68)
    print("  Press Ctrl+C to stop the server.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Stopping server...")
    finally:
        httpd.server_close()
        if temp_dir:
            temp_dir.cleanup()
        print("✓ Server stopped.")


if __name__ == '__main__':
    main()
