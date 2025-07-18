# System Utilities and Commands

## Linux System Commands
The system is running on **Linux** (specifically WSL2 on Windows):

### File Operations
```bash
# List files and directories
ls -la

# Find files
find . -name "*.ts" -type f

# Search file contents
grep -r "pattern" .

# Directory navigation
cd /path/to/directory
pwd
```

### Process Management
```bash
# View running processes
ps aux

# Kill processes
kill -9 <pid>
pkill -f "node"

# View system resources
top
htop
```

### Network Operations
```bash
# Check ports
netstat -tulpn
ss -tulpn

# Test connectivity
curl http://localhost:8081/health
wget -qO- http://localhost:8081/health
```

### Docker Operations
```bash
# View containers
docker ps -a

# View logs
docker logs <container-name>

# Execute commands in container
docker exec -it <container-name> bash

# Docker compose operations
docker-compose up -d
docker-compose down
docker-compose logs -f
```

## Git Operations
```bash
# Standard git commands
git status
git add .
git commit -m "message"
git push origin main

# Branch operations
git branch
git checkout -b feature/new-feature
git merge main
```

## Package Management
```bash
# pnpm commands (preferred)
pnpm install
pnpm add package-name
pnpm remove package-name
pnpm run script-name

# Workspace operations
pnpm -r run build  # Run across all workspaces
pnpm --filter "./packages/*" build  # Filter specific packages
```

## Environment Variables
```bash
# View environment
env
printenv

# Set environment variables
export VAR_NAME=value
```

## System Information
```bash
# System info
uname -a
lscpu
free -h
df -h
```