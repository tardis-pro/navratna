#!/bin/bash

# UAIP Backend Monitoring - Deploy Infrastructure Exporters
# This script deploys the missing exporters for complete metrics coverage

set -e

echo "🚀 Deploying UAIP Backend Infrastructure Exporters..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if container exists
container_exists() {
    docker ps -a --format "table {{.Names}}" | grep -q "^$1$"
}

# Function to check if container is running
container_running() {
    docker ps --format "table {{.Names}}" | grep -q "^$1$"
}

echo -e "${YELLOW}📋 Checking current container status...${NC}"

# Check existing containers
containers=("nginx-exporter" "postgres-exporter" "redis-exporter" "node-exporter")
for container in "${containers[@]}"; do
    if container_running "$container"; then
        echo -e "${GREEN}✅ $container is running${NC}"
    elif container_exists "$container"; then
        echo -e "${YELLOW}⚠️  $container exists but is not running${NC}"
    else
        echo -e "${RED}❌ $container does not exist${NC}"
    fi
done

echo ""
echo -e "${YELLOW}🔧 Deploying exporters...${NC}"

# 1. Deploy Nginx Exporter
echo -e "${YELLOW}📊 Deploying Nginx Exporter...${NC}"
if ! container_running "nginx-exporter"; then
    if [ -f "nginx-exporter.yml" ]; then
        docker-compose -f nginx-exporter.yml up -d
        echo -e "${GREEN}✅ Nginx Exporter deployed${NC}"
    else
        echo -e "${RED}❌ nginx-exporter.yml not found${NC}"
    fi
else
    echo -e "${GREEN}✅ Nginx Exporter already running${NC}"
fi

# 2. Deploy PostgreSQL Exporter
echo -e "${YELLOW}🐘 Deploying PostgreSQL Exporter...${NC}"
if ! container_running "postgres-exporter"; then
    # Note: Update these credentials based on your actual PostgreSQL setup
    docker run -d --name postgres-exporter \
        --network monitoring \
        -p 9187:9187 \
        -e DATA_SOURCE_NAME="postgresql://postgres:password@postgres:5432/postgres?sslmode=disable" \
        prometheuscommunity/postgres-exporter
    echo -e "${GREEN}✅ PostgreSQL Exporter deployed${NC}"
    echo -e "${YELLOW}⚠️  Update DATA_SOURCE_NAME with your actual PostgreSQL credentials${NC}"
else
    echo -e "${GREEN}✅ PostgreSQL Exporter already running${NC}"
fi

# 3. Deploy Redis Exporter
echo -e "${YELLOW}🔴 Deploying Redis Exporter...${NC}"
if ! container_running "redis-exporter"; then
    docker run -d --name redis-exporter \
        --network monitoring \
        -p 9121:9121 \
        oliver006/redis_exporter \
        --redis.addr=redis://redis:6379
    echo -e "${GREEN}✅ Redis Exporter deployed${NC}"
else
    echo -e "${GREEN}✅ Redis Exporter already running${NC}"
fi

# 4. Deploy Node Exporter
echo -e "${YELLOW}🖥️  Deploying Node Exporter...${NC}"
if ! container_running "node-exporter"; then
    docker run -d --name node-exporter \
        --network monitoring \
        -p 9100:9100 \
        -v "/proc:/host/proc:ro" \
        -v "/sys:/host/sys:ro" \
        -v "/:/rootfs:ro" \
        --pid="host" \
        prom/node-exporter \
        --path.procfs=/host/proc \
        --path.rootfs=/rootfs \
        --path.sysfs=/host/sys \
        --collector.filesystem.mount-points-exclude="^/(sys|proc|dev|host|etc|run|mnt|tmp|wsl|snap)($$|/)" \
        --collector.filesystem.fs-types-exclude="^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs|tmpfs|9p|drvfs)$$"
    echo -e "${GREEN}✅ Node Exporter deployed${NC}"
else
    echo -e "${GREEN}✅ Node Exporter already running${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Verification Commands:${NC}"
echo "curl http://localhost:9113/metrics  # Nginx Exporter"
echo "curl http://localhost:9187/metrics  # PostgreSQL Exporter"
echo "curl http://localhost:9121/metrics  # Redis Exporter"
echo "curl http://localhost:9100/metrics  # Node Exporter"
echo ""
echo -e "${YELLOW}🔍 Check Prometheus Targets:${NC}"
echo "Open http://localhost:9090/targets in your browser"
echo ""
echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo "1. Update PostgreSQL credentials in postgres-exporter if needed"
echo "2. Ensure 'monitoring' network exists: docker network create monitoring"
echo "3. Restart Prometheus to reload configuration if needed"
echo "4. Check that all services (postgres, redis, etc.) are running" 
