# 你无只因 - 微信风格聊天应用

一个类似微信的实时聊天网站，支持群聊、私聊、图片视频上传、好友系统。

## 功能特性

- ✅ 用户注册/登录（JWT认证）
- ✅ 6位数字ID搜索添加好友
- ✅ 个人主页（头像、签名编辑）
- ✅ 创建群聊
- ✅ 实时消息发送（WebSocket）
- ✅ 消息类型：文本、图片、视频
- ✅ 分片上传（支持大文件）
- ✅ 好友在线状态显示
- ✅ 好友请求通知

## 技术栈

### 后端
- Node.js + Express
- Socket.IO（实时通信）
- JWT（用户认证）
- Multer（文件上传）

### 前端
- React
- Socket.IO Client
- Axios

## 运行项目

### 1. 克隆项目
```bash
git clone <你的仓库地址>
cd wechat-app
```

### 2. 安装后端依赖
```bash
cd server
npm install
```

### 3. 安装前端依赖
```bash
cd ../client
npm install
```

### 4. 启动后端
```bash
cd server
npm start
# 服务运行在 http://localhost:3001
```

### 5. 启动前端
```bash
cd client
npm start
# 应用运行在 http://localhost:3000
```

## 使用说明

1. 打开 http://localhost:3000
2. 注册账号
3. 查看自己的6位ID（点击左上角用户名）
4. 通过ID搜索添加好友
5. 开始聊天！

## 项目结构

```
wechat-app/
├── server/                 # 后端服务
│   ├── server.js           # 主服务器
│   └── package.json
└── client/                # 前端应用
    ├── src/
    │   ├── App.js         # 主组件
    │   ├── index.js
    │   └── index.css      # 样式
    └── package.json
```

## 许可证

MIT
