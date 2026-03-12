#!/usr/bin/env python3
"""
Local HTTPS server for PWA testing.
Usage: python3 serve_https.py
Then open https://localhost:8443 in browser (accept the self-signed cert warning).
"""
import http.server
import ssl
import os
import sys

PORT = 8443
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pwa')

# Generate cert if not exists
CERT = '/tmp/cert.pem'
KEY  = '/tmp/key.pem'
if not os.path.exists(CERT) or not os.path.exists(KEY):
    import subprocess
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', KEY, '-out', CERT, '-days', '30', '-nodes',
        '-subj', '/CN=localhost'
    ], check=True, capture_output=True)

os.chdir(DIRECTORY)
handler = http.server.SimpleHTTPRequestHandler

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(CERT, KEY)

server = http.server.HTTPServer(('0.0.0.0', PORT), handler)
server.socket = context.wrap_socket(server.socket, server_side=True)

print(f'🔒 HTTPS server running at:')
print(f'   https://localhost:{PORT}')
print(f'   Serving: {DIRECTORY}')
print(f'   (Accept the self-signed certificate warning in browser)')
print(f'   Press Ctrl+C to stop')

try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nServer stopped.')
