# Deployment Guide

## Overview

This guide covers the deployment and operations procedures for the UAIP platform, including production setup, monitoring, scaling, and maintenance tasks.

## Production Deployment

### System Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+
- 16GB RAM minimum
- 4 CPU cores minimum
- 100GB storage minimum

### Environment Preparation

1. **Security Configuration**

```bash
# Generate production secrets
./scripts/generate-secrets.sh

# Configure environment variables
cp .env.production.example .env.production
```

Required environment variables:

```env
# Core Settings
NODE_ENV=production
LOG_LEVEL=info

# Database URLs
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
NEO4J_URI=bolt://user:pass@host:7687
REDIS_URL=redis://user:pass@host:6379
RABBITMQ_URL=amqp://user:pass@host:5672

# Security
JWT_SECRET=<generated-secret>
ENCRYPTION_KEY=<generated-key>
API_KEYS=<comma-separated-keys>

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ADMIN_PASSWORD=<secure-password>
```

2. **SSL Certificate Setup**

```bash
# Generate or install SSL certificates
./scripts/setup-ssl.sh

# Configure Nginx SSL
cp nginx/ssl.conf.example nginx/ssl.conf
```

### Deployment Process

1. **Build Production Images**

```bash
# Build all services
docker-compose -f docker-compose.prod.yml build

# Build specific service
docker-compose -f docker-compose.prod.yml build agent-intelligence
```

2. **Database Migration**

```bash
# Run production migrations
NODE_ENV=production npm run db:migrate

# Verify database schema
npm run db:verify
```

3. **Service Deployment**

```bash
# Deploy all services
docker-compose -f docker-compose.prod.yml up -d

# Deploy with scaling
docker-compose -f docker-compose.prod.yml up -d --scale agent-intelligence=3
```

4. **Verify Deployment**

```bash
# Check service health
./scripts/health-check.sh

# Verify all endpoints
./scripts/verify-endpoints.sh
```

## Monitoring Setup

### Prometheus Configuration

1. **Metrics Collection**

```yaml
# prometheus/prometheus.yml
scrape_configs:
  - job_name: 'uaip-services'
    scrape_interval: 15s
    static_configs:
      - targets:
          - 'agent-intelligence:3001'
          - 'orchestration-pipeline:3002'
          - 'capability-registry:3003'
          - 'security-gateway:3004'
          - 'discussion-orchestration:3005'
```

2. **Alert Rules**

```yaml
# prometheus/alert.rules
groups:
  - name: service_alerts
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
      - alert: HighLatency
        expr: http_request_duration_seconds > 0.5
        for: 5m
```

### Grafana Dashboards

1. **Service Dashboard**

- Request rates
- Error rates
- Response times
- Resource usage

2. **Database Dashboard**

- Connection pool stats
- Query performance
- Cache hit rates
- Storage metrics

3. **System Dashboard**

- CPU usage
- Memory usage
- Network I/O
- Disk usage

## Scaling Guidelines

### Horizontal Scaling

```bash
# Scale specific services
docker-compose -f docker-compose.prod.yml up -d --scale agent-intelligence=3
docker-compose -f docker-compose.prod.yml up -d --scale discussion-orchestration=2
```

### Load Balancing

```nginx
# nginx/load-balancer.conf
upstream agent_intelligence {
    least_conn;
    server agent-intelligence-1:3001;
    server agent-intelligence-2:3001;
    server agent-intelligence-3:3001;
}
```

### Database Scaling

1. **PostgreSQL Replication**

```bash
# Setup streaming replication
./scripts/setup-pg-replication.sh

# Monitor replication status
./scripts/check-pg-replication.sh
```

2. **Neo4j Clustering**

```bash
# Configure Neo4j cluster
./scripts/setup-neo4j-cluster.sh
```

## Backup Procedures

### Database Backups

1. **PostgreSQL Backup**

```bash
# Full backup
./scripts/backup-postgres.sh

# Scheduled backups
0 2 * * * /path/to/backup-postgres.sh
```

2. **Neo4j Backup**

```bash
# Full backup
./scripts/backup-neo4j.sh

# Verify backup
./scripts/verify-neo4j-backup.sh
```

### Configuration Backups

```bash
# Backup all configs
./scripts/backup-configs.sh

# Restore configs
./scripts/restore-configs.sh
```

## Maintenance Procedures

### Regular Maintenance

1. **Log Rotation**

```bash
# Setup log rotation
./scripts/setup-log-rotation.sh

# Verify rotation
./scripts/check-logs.sh
```

2. **Database Maintenance**

```bash
# PostgreSQL maintenance
./scripts/pg-maintenance.sh

# Neo4j maintenance
./scripts/neo4j-maintenance.sh
```

### Security Updates

1. **System Updates**

```bash
# Update base images
docker-compose -f docker-compose.prod.yml pull

# Rebuild services
docker-compose -f docker-compose.prod.yml build --no-cache
```

2. **Security Scans**

```bash
# Run security scan
./scripts/security-scan.sh

# Update security configs
./scripts/update-security.sh
```

## Troubleshooting

### Common Issues

1. **Service Recovery**

```bash
# Restart failed service
docker-compose -f docker-compose.prod.yml restart service-name

# Check service logs
docker-compose -f docker-compose.prod.yml logs --tail=100 service-name
```

2. **Database Issues**

```bash
# Check database connections
./scripts/check-db-connections.sh

# Reset connection pools
./scripts/reset-connections.sh
```

### Performance Issues

1. **Identify Bottlenecks**

```bash
# Run performance analysis
./scripts/analyze-performance.sh

# Generate performance report
./scripts/performance-report.sh
```

2. **Resource Optimization**

```bash
# Optimize cache settings
./scripts/optimize-cache.sh

# Tune database parameters
./scripts/tune-database.sh
```

## Disaster Recovery

### Recovery Procedures

1. **Service Recovery**

```bash
# Full system recovery
./scripts/disaster-recovery.sh

# Individual service recovery
./scripts/recover-service.sh service-name
```

2. **Data Recovery**

```bash
# Database restoration
./scripts/restore-database.sh

# Verify data integrity
./scripts/verify-data.sh
```

### Failover Procedures

1. **Database Failover**

```bash
# Trigger failover
./scripts/db-failover.sh

# Verify failover
./scripts/verify-failover.sh
```

2. **Service Failover**

```bash
# Switch to backup services
./scripts/service-failover.sh

# Validate system state
./scripts/validate-system.sh
```
