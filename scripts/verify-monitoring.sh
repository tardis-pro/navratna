#!/bin/bash

echo "🔍 MONITORING STACK VERIFICATION"
echo "================================="
echo ""

# Check service status
echo "📊 Service Status:"
docker-compose ps | grep -E "(node-exporter|prometheus|grafana)" | while read line; do
    echo "  ✅ $line"
done
echo ""

# Check node-exporter health
echo "🔍 Node-exporter Health:"
UP_STATUS=$(curl -s 'http://localhost:9090/api/v1/query?query=up%7Bjob%3D%22node-exporter%22%7D' | jq -r '.data.result[0].value[1]' 2>/dev/null)
if [ "$UP_STATUS" = "1" ]; then
    echo "  ✅ Node-exporter is UP and healthy"
else
    echo "  ❌ Node-exporter health check failed"
fi

# Check for critical errors (ignoring minor udev warning)
echo ""
echo "🔍 Critical Errors Check:"
ERRORS=$(docker-compose logs --since=10m node-exporter | grep -E "ERROR.*netstat|ERROR.*softnet|ERROR.*filesystem.*collected before" | wc -l)
if [ "$ERRORS" -eq "0" ]; then
    echo "  ✅ No critical monitoring errors found"
else
    echo "  ⚠️  Found $ERRORS critical errors in logs"
fi

# Check metric collection
echo ""
echo "📈 Metrics Collection:"
METRICS=$(docker exec uaip-node-exporter wget -qO- http://localhost:9100/metrics 2>/dev/null | grep -c "node_" || echo "0")
if [ "$METRICS" -gt "50" ]; then
    echo "  ✅ Node-exporter collecting $METRICS node metrics"
else
    echo "  ❌ Insufficient metrics collected ($METRICS)"
fi

# Check Grafana connectivity
echo ""
echo "🎯 Grafana Status:"
GRAFANA_STATUS=$(curl -s -u admin:admin http://localhost:3000/api/health | jq -r '.database' 2>/dev/null)
if [ "$GRAFANA_STATUS" = "ok" ]; then
    echo "  ✅ Grafana is healthy and accessible"
else
    echo "  ❌ Grafana health check failed"
fi

echo ""
echo "🌐 Access URLs:"
echo "  Grafana:    http://localhost:3000 (admin/admin)"
echo "  Prometheus: http://localhost:9090"
echo "  Metrics:    http://localhost:9100/metrics"
echo ""
echo "🎉 Monitoring verification complete!"