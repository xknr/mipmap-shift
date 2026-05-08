# serve.py
import http.server
import socketserver

PORT = 8088

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
  def end_headers(self):
    # Set headers to prevent caching
    self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    self.send_header("Pragma", "no-cache")
    self.send_header("Expires", "0")
    self.send_header("Cross-Origin-Opener-Policy", "same-origin")
    self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
    self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
    super().end_headers()

Handler = NoCacheHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
  print(f"Serving HTTP on port {PORT} (http://0.0.0.0:{PORT}/) ...")
  try:
    httpd.serve_forever()
  except KeyboardInterrupt:
    print("\nServer stopped.")
    httpd.server_close()
