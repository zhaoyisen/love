# Jenkins + Docker Compose 服务端部署指南

本指南用于把 `server/` 中的 Spring Boot API 部署到一台 Linux 服务器。数据库、Redis 和腾讯云 COS 使用外部托管资源，不由 Docker Compose 创建。

## 1. 最终结构

```text
GitHub main 分支
    ↓ Jenkins Pipeline
Maven 测试与打包
    ↓
Docker 镜像 love-notes-server:<Git提交短哈希>
    ↓ Docker Compose
Spring Boot API 容器
    ├── 托管 MySQL
    ├── 托管 Redis
    ├── 腾讯云 COS
    └── 微信 jscode2session

公网 HTTPS
    ↓ Nginx / 负载均衡 / API 网关
127.0.0.1:8080
    ↓
Spring Boot API
```

分支规则：

- `develop`：执行测试、镜像构建和 Compose 配置校验，不部署生产；
- `main`：完成相同检查后，使用 Jenkins 生产密钥文件执行部署；
- 生产发布应通过 Pull Request 将 `develop` 合并到 `main`，不要直接在服务器修改代码。

## 2. 仓库中的部署文件

```text
Jenkinsfile                 Jenkins Pipeline
docker-compose.yml          生产 API 编排
server/Dockerfile           Java 21 多阶段镜像
server/.dockerignore        镜像构建上下文排除规则
server/.env.example         生产环境变量模板，不含真实密钥
```

镜像以非 root 用户运行，根文件系统只读，仅 `/tmp` 可写；端口默认只绑定到宿主机 `127.0.0.1`。Compose 配置了健康检查、优雅停止、日志轮转、CPU/内存限制和禁止提权。

## 3. 部署服务器前置条件

建议使用 Ubuntu 22.04/24.04 或兼容 Linux，至少准备：

- Docker Engine；
- Docker Compose v2.20 或更高版本，需支持 `docker compose up --wait`；
- Git；
- Java 21；
- Maven 3.9；
- Jenkins LTS；
- Jenkins Pipeline、Git、Credentials Binding、JUnit 插件；
- Nginx、腾讯云负载均衡或其他 HTTPS 入口。

执行检查：

```bash
git --version
java -version
mvn -version
docker version
docker compose version
```

Jenkins 执行用户必须可以运行 Docker。将用户加入 `docker` 组等同于授予较高宿主机权限，因此 Jenkins 节点必须专用，不能运行不可信仓库的任务。

在 Jenkins 的“Manage Nodes and Clouds”中为实际 Linux 构建/部署节点添加标签：

```text
linux-docker
```

仓库中的 `Jenkinsfile` 固定选择该标签，确保 Maven 测试、Linux 镜像构建和 Docker Compose 发布都发生在服务器，而不是 Windows 开发机。

## 4. 网络与云资源

部署前完成：

1. MySQL 创建独立数据库和应用账号；
2. MySQL 安全组只允许部署服务器私网 IP；
3. Redis 只允许部署服务器私网访问，并启用密码；
4. 条件允许时启用 MySQL/Redis TLS；
5. COS 使用私有桶和最小权限 CAM 子用户；
6. 部署服务器能够访问微信 API、COS、MySQL 和 Redis；
7. 公网安全组只开放 80/443，禁止直接开放 MySQL、Redis 和 8080。

应用启动时 Flyway 会自动执行数据库迁移。第一次上线或新增迁移前必须先备份 MySQL；应用回滚不会自动回滚数据库结构。

## 5. 创建 Jenkins 生产密钥文件

在本地复制 `server/.env.example`，填入真实生产值。不要把真实文件保存进 Git。

示例结构：

```dotenv
COMPOSE_PROJECT_NAME=love-notes
SERVER_BIND_ADDRESS=127.0.0.1
SERVER_HTTP_PORT=8080
APP_MEMORY_LIMIT=768m
APP_CPU_LIMIT=1.0
LOG_LEVEL_ROOT=INFO

MYSQL_URL=jdbc:mysql://你的MySQL内网地址:3306/love_notes?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC
MYSQL_USERNAME=你的数据库账号
MYSQL_PASSWORD=你的数据库密码
MYSQL_POOL_SIZE=20
MYSQL_MIN_IDLE=4

REDIS_HOST=你的Redis内网地址
REDIS_PORT=6379
REDIS_PASSWORD=你的Redis密码
REDIS_SSL=false

WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret

COS_BUCKET=你的存储桶名称
COS_REGION=ap-shanghai
COS_SECRET_ID=CAM子用户SecretId
COS_SECRET_KEY=CAM子用户SecretKey
```

在 Jenkins 中依次操作：

1. 进入“Manage Jenkins”→“Credentials”；
2. 选择 Jenkins 作业可访问的凭据域；
3. 点击“Add Credentials”；
4. Kind 选择“Secret file”；
5. 上传生产 `.env` 文件；
6. ID 必须填写 `love-notes-prod-env`；
7. Description 填写“恋爱笔记生产环境变量”。

流水线只在 `main` 部署阶段读取该 Secret file，并且不会执行会打印完整配置和密钥的 `docker compose config`。

## 6. 创建 Jenkins 流水线

推荐创建 Multibranch Pipeline：

1. Jenkins 首页点击“New Item”；
2. 输入名称 `love-notes-server`；
3. 选择“Multibranch Pipeline”；
4. Branch Sources 选择 Git；
5. Repository URL 填写 `https://github.com/zhaoyisen/love.git`；
6. 私有仓库需要配置 GitHub 凭据，公开仓库可直接读取；
7. Build Configuration 选择“by Jenkinsfile”；
8. Script Path 填写 `Jenkinsfile`；
9. 保存并执行“Scan Multibranch Pipeline Now”。

首次建议先构建 `develop`。预期阶段：

```text
Checkout
Verify toolchain
Backend test
Build image
Validate Compose
```

`develop` 不会出现生产部署。合并并构建 `main` 时才会继续执行 `Deploy production`。

## 7. 首次部署验证

Jenkins 的 `main` 流水线成功后，在部署服务器执行：

```bash
docker compose --env-file /安全路径/prod.env ps api
docker compose --env-file /安全路径/prod.env logs --tail=200 api
curl --fail http://127.0.0.1:8080/api/v1/actuator/health
```

健康响应应包含：

```json
{"status":"UP"}
```

如果容器不健康，优先检查：

```bash
docker compose --env-file /安全路径/prod.env logs --tail=300 api
docker inspect love-notes-api-1
```

常见原因包括 MySQL/Redis 安全组未放行、内网地址错误、密码错误、Redis TLS 配置不一致、COS 地域或桶名错误。

## 8. 配置 HTTPS 入口

Compose 默认监听 `127.0.0.1:8080`，建议由同机 Nginx 转发：

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

完成证书和 DNS 后，验证：

```bash
curl --fail https://api.example.com/api/v1/actuator/health
```

然后在微信公众平台把 `https://api.example.com` 加入 request 合法域名。

## 9. 日常发布流程

```text
本地在 develop 开发
→ 提交并推送 develop
→ Jenkins 自动测试和构建
→ 创建 Pull Request：develop → main
→ 审核并合并
→ Jenkins 构建 main
→ 以 Git 提交短哈希构建镜像
→ Docker Compose 等待新容器健康
→ 发布完成
```

每个镜像标签对应一个 Git 提交，例如：

```text
love-notes-server:fdbc746301c6
```

## 10. 回滚

先从 Jenkins 构建记录或 `docker image ls love-notes-server` 找到上一个健康版本标签，然后执行：

```bash
IMAGE_TAG=上一个提交短哈希 docker compose \
  --env-file /安全路径/prod.env \
  up -d --no-deps --wait --wait-timeout 180 api
```

回滚后再次检查健康接口和核心登录流程。不要随意执行 `docker system prune -a`，否则会删除用于快速回滚的旧镜像。

## 11. 当前发布边界

这套配置已经支持服务端容器化构建、自动测试、生产变量注入、健康等待和按提交版本回滚，但不代表当前业务已经满足小程序正式上线条件。媒体 Worker、内容安全、剩余领域 API、生产 MySQL/Redis/COS 联调和完整真机测试仍需继续完成。
