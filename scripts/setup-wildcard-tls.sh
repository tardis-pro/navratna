#!/usr/bin/env bash
# =============================================================================
# TARDIS Platform - Wildcard TLS Certificate Setup
# =============================================================================
# Obtains a wildcard TLS certificate for *.tardis.digital using certbot
# with the DNS-01 challenge via Cloudflare DNS plugin.
#
# Two scenarios are covered:
#
# SCENARIO A: Cloudflare-Proxied (orange cloud) -- NO ACTION NEEDED
#   When traffic is proxied through Cloudflare, TLS is handled automatically.
#   Cloudflare provides Universal SSL for the root domain and first-level
#   subdomains. For wildcard proxy (Enterprise), Cloudflare manages the cert.
#   This script is NOT needed in that scenario.
#
# SCENARIO B: Self-hosted / DNS-only (grey cloud)
#   When running your own edge (e.g., nginx on a VPS, Fly.io, etc.),
#   you need your own TLS certificate. This script automates obtaining
#   a wildcard cert from Let's Encrypt via DNS-01 challenge.
#
# Required environment variables:
#   CF_API_TOKEN  - Cloudflare API token with DNS edit permissions
#
# Usage:
#   ./setup-wildcard-tls.sh obtain     # Get new wildcard cert
#   ./setup-wildcard-tls.sh renew      # Renew existing cert
#   ./setup-wildcard-tls.sh status     # Check cert status
#   ./setup-wildcard-tls.sh install    # Install certbot + Cloudflare plugin
# =============================================================================

set -euo pipefail

DOMAIN="tardis.digital"
EMAIL="${CERTBOT_EMAIL:-admin@tardis.digital}"
CERTBOT_CF_CREDS="/etc/letsencrypt/cloudflare.ini"

# ---------------------------------------------------------------------------
# Command: install - Install certbot and Cloudflare DNS plugin
# ---------------------------------------------------------------------------
cmd_install() {
  echo "=== Installing certbot with Cloudflare DNS plugin ==="
  echo ""

  if command -v apt-get &>/dev/null; then
    echo "Detected Debian/Ubuntu. Installing via apt..."
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-dns-cloudflare
  elif command -v dnf &>/dev/null; then
    echo "Detected Fedora/RHEL. Installing via dnf..."
    sudo dnf install -y certbot python3-certbot-dns-cloudflare
  elif command -v brew &>/dev/null; then
    echo "Detected macOS. Installing via Homebrew..."
    brew install certbot
    pip3 install certbot-dns-cloudflare
  elif command -v pip3 &>/dev/null; then
    echo "Installing via pip..."
    pip3 install certbot certbot-dns-cloudflare
  else
    echo "ERROR: Cannot detect package manager. Install certbot manually:" >&2
    echo "  https://certbot.eff.org/instructions" >&2
    exit 1
  fi

  echo ""
  echo "certbot installed successfully."
  certbot --version
}

# ---------------------------------------------------------------------------
# Helper: Write Cloudflare credentials file for certbot
# ---------------------------------------------------------------------------
write_cf_credentials() {
  if [[ -z "${CF_API_TOKEN:-}" ]]; then
    echo "ERROR: CF_API_TOKEN is not set." >&2
    echo "Create a token at https://dash.cloudflare.com/profile/api-tokens" >&2
    echo "Required permissions: Zone > DNS > Edit" >&2
    exit 1
  fi

  sudo mkdir -p "$(dirname "$CERTBOT_CF_CREDS")"
  sudo tee "$CERTBOT_CF_CREDS" > /dev/null <<EOF
# Cloudflare API token for certbot DNS-01 challenge
dns_cloudflare_api_token = ${CF_API_TOKEN}
EOF
  sudo chmod 600 "$CERTBOT_CF_CREDS"
  echo "  Cloudflare credentials written to ${CERTBOT_CF_CREDS}"
}

# ---------------------------------------------------------------------------
# Command: obtain - Obtain a new wildcard certificate
# ---------------------------------------------------------------------------
cmd_obtain() {
  echo "=== Obtaining wildcard TLS certificate for *.${DOMAIN} ==="
  echo ""

  if ! command -v certbot &>/dev/null; then
    echo "ERROR: certbot is not installed. Run: $0 install" >&2
    exit 1
  fi

  write_cf_credentials

  echo ""
  echo "Running certbot with DNS-01 challenge..."
  echo ""

  sudo certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials "$CERTBOT_CF_CREDS" \
    --dns-cloudflare-propagation-seconds 30 \
    -d "${DOMAIN}" \
    -d "*.${DOMAIN}" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring

  echo ""
  echo "=== Certificate obtained successfully ==="
  echo ""
  echo "Certificate files:"
  echo "  Cert:      /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  echo "  Key:       /etc/letsencrypt/live/${DOMAIN}/privkey.pem"
  echo "  Chain:     /etc/letsencrypt/live/${DOMAIN}/chain.pem"
  echo ""
  echo "Nginx configuration snippet:"
  echo "  ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;"
  echo "  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;"
  echo ""
  echo "Auto-renewal is configured via 'certbot renew' (systemd timer or cron)."
  echo "To test renewal: sudo certbot renew --dry-run"
}

# ---------------------------------------------------------------------------
# Command: renew - Renew existing certificates
# ---------------------------------------------------------------------------
cmd_renew() {
  echo "=== Renewing TLS certificates ==="
  echo ""

  if ! command -v certbot &>/dev/null; then
    echo "ERROR: certbot is not installed. Run: $0 install" >&2
    exit 1
  fi

  # Ensure credentials file is current
  if [[ -n "${CF_API_TOKEN:-}" ]]; then
    write_cf_credentials
  fi

  sudo certbot renew \
    --deploy-hook "systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true"

  echo ""
  echo "=== Renewal complete ==="
}

# ---------------------------------------------------------------------------
# Command: status - Check certificate status
# ---------------------------------------------------------------------------
cmd_status() {
  echo "=== TLS certificate status ==="
  echo ""

  if ! command -v certbot &>/dev/null; then
    echo "certbot is not installed."
    echo ""
    echo "--- Cloudflare-Proxied TLS (Scenario A) ---"
    echo "If your DNS records are proxied (orange cloud), Cloudflare handles TLS."
    echo "Check your SSL/TLS settings at: https://dash.cloudflare.com"
    echo ""
    echo "--- Self-Hosted TLS (Scenario B) ---"
    echo "Install certbot: $0 install"
    return 0
  fi

  sudo certbot certificates

  echo ""
  echo "--- Quick Reference ---"
  echo ""
  echo "Scenario A (Cloudflare-proxied, orange cloud):"
  echo "  TLS is automatic. No local cert needed."
  echo "  Universal SSL covers ${DOMAIN} and *.${DOMAIN}."
  echo "  Full (Strict) mode recommended in Cloudflare SSL settings."
  echo ""
  echo "Scenario B (self-hosted, grey cloud / DNS-only):"
  echo "  Use this script to manage Let's Encrypt wildcard certs."
  echo "  Cert path: /etc/letsencrypt/live/${DOMAIN}/"
  echo "  Auto-renew: sudo certbot renew --dry-run"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-help}" in
  obtain)
    cmd_obtain
    ;;
  renew)
    cmd_renew
    ;;
  status)
    cmd_status
    ;;
  install)
    cmd_install
    ;;
  help|--help|-h)
    echo "TARDIS Platform - Wildcard TLS Certificate Setup"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install   Install certbot and Cloudflare DNS plugin"
    echo "  obtain    Obtain a new wildcard certificate via DNS-01"
    echo "  renew     Renew existing certificates"
    echo "  status    Show current certificate status and guidance"
    echo ""
    echo "Environment variables:"
    echo "  CF_API_TOKEN   (required for obtain/renew) Cloudflare API token"
    echo "  CERTBOT_EMAIL  (optional) Email for Let's Encrypt (default: admin@tardis.digital)"
    echo ""
    echo "--- When do you need this script? ---"
    echo ""
    echo "  Cloudflare-proxied (orange cloud): You do NOT need this."
    echo "    Cloudflare provides Universal SSL automatically."
    echo ""
    echo "  Self-hosted / DNS-only (grey cloud): Use this script."
    echo "    Run: $0 install && $0 obtain"
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run '$0 help' for usage." >&2
    exit 1
    ;;
esac
