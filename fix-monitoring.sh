#!/bin/bash

echo "🔧 Fixing Grafana Dashboard Issues..."

# Stop problematic monitoring services
echo "📡 Stopping monitoring services..."
docker-compose stop node-exporter prometheus grafana

# Remove containers to ensure clean restart
echo "🗑️  Removing old containers..."
docker-compose rm -f node-exporter prometheus grafana

# Remove prometheus data to clear old metrics
echo "🧹 Clearing prometheus data..."
docker volume rm council-of-nycea_prometheus_data 2>/dev/null || true

echo "🚀 Starting fixed monitoring stack..."

# Start services in order
docker-compose up -d node-exporter
sleep 10
docker-compose up -d prometheus
sleep 10
docker-compose up -d grafana

echo "✅ Monitoring stack restarted!"
echo ""
echo "📊 Access points:"
echo "   Grafana:    http://localhost:3000 (admin/admin)"
echo "   Prometheus: http://localhost:9090"
echo "   Node Exp:   http://localhost:9100/metrics"
echo ""
echo "🔍 Check logs with:"
echo "   docker-compose logs node-exporter"
echo "   docker-compose logs prometheus"
echo "   docker-compose logs grafana"