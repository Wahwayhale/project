#!/bin/bash

# ============================================
# 聊天室 - 一键部署脚本
# ============================================

set -e

echo "========================================"
echo "  聊天室 - 自动化部署脚本"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 root 用户运行此脚本！${NC}"
    exit 1
fi

# 更新系统
echo -e "${YELLOW}[1/8] 更新系统...${NC}"
apt update && apt upgrade -y

# 安装Node.js 18.x
echo -e "${YELLOW}[2/8] 安装 Node.js 18.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
node -v
npm -v

# 安装Nginx
echo -e "${YELLOW}[3/8] 安装 Nginx...${NC}"
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 安装PM2
echo -e "${YELLOW}[4/8] 安装 PM2...${NC}"
npm install -g pm2
pm2 install pm2-logrotate

# 创建网站目录
echo -e "${YELLOW}[5/8] 创建目录...${NC}"
mkdir -p /var/www/wechat-app
mkdir -p /var/www/wechat-app/server/uploads
mkdir -p /var/www/wechat-app/server/uploads/chunks

# 克隆GitHub代码
echo -e "${YELLOW}[6/8] 克隆代码 from GitHub...${NC}"
cd /var/www/wechat-app
git init
git remote add origin https://github.com/Wahwayhale/project.git
git config core.sparseCheckout true
echo "server/*" >> .git/info/sparse-checkout
echo "client/*" >> .git/info/sparse-checkout
git pull origin master --depth=1

# 安装后端依赖
echo -e "${YELLOW}[7/8] 安装后端依赖...${NC}"
cd /var/www/wechat-app/server
npm install --production

# 配置后端环境变量
echo "PORT=3001" > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# 使用PM2启动后端
pm2 delete wechat-backend 2>/dev/null || true
pm2 start server.js --name wechat-backend
pm2 save

# 构建前端
echo -e "${YELLOW}[8/8] 构建前端...${NC}"
cd /var/www/wechat-app/client
npm install
npm run build

# 配置Nginx
echo -e "${YELLOW}[配置Nginx]${NC}"
cat > /etc/nginx/sites-available/wechat-app << 'EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root /var/www/wechat-app/client/build;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO代理
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/wechat-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试并重启Nginx
nginx -t
systemctl restart nginx

# 设置防火墙
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "========================================"
echo -e "${GREEN}  部署完成！${NC}"
echo "========================================"
echo ""
echo -e "请访问: http://$(curl -s ifconfig.me)"
echo ""
echo "查看服务状态:"
echo "  pm2 status"
echo "  pm2 logs wechat-backend"
echo ""
echo "重启服务:"
echo "  pm2 restart wechat-backend"
echo "  systemctl restart nginx"
echo ""
