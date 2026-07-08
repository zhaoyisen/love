# 恋爱笔记统一 API 服务

Spring Boot 3 / Java 21 后端基础版，按详细设计提供统一 `/api/v1` API。

完整的生产资源、Jenkins、域名、微信后台和提审顺序见[《生产上线唯一操作手册》](../docs/生产上线唯一操作手册.md)。

## 当前已实现

- 微信 code 会话接口、短 access token、轮换 refresh token；
- 开发环境稳定模拟微信身份，生产环境调用微信 `jscode2session`；
- 当前用户摘要与昵称修改；
- 一次性邀请、24 小时过期、预览、接受、撤销；
- 一人一个有效情侣空间、关系资料乐观锁、单方解绑即时撤权；
- 文字/图片/视频时刻校验、PRIVATE/SHARED 服务端权限；
- 时刻详情、标签编辑、回收站、恢复和 HMAC 稳定游标分页；
- 媒体上传会话、时刻媒体绑定和短期访问地址；开发环境模拟上传，生产环境签发腾讯云 COS STS 单对象临时凭证；
- 生产媒体处理 Worker：图片同步审核、视频异步审核轮询；审核通过前仅作者看到处理状态，敏感或疑似内容不会发布；
- 图片审核通过后生成去除 EXIF 的 `display/` 展示 WebP 和 `thumbnail/` 缩略 WebP；
- 回收站超过 30 天后清理原件、展示图和缩略图；未绑定记录的上传超过 24 小时后清理；
- Flyway MySQL 迁移、Redis 会话/幂等存储、统一错误和 request ID；
- H2 隔离集成测试，不连接生产 MySQL、Redis 或 COS。

图片/视频上传后进入 `PROCESSING`，审核通过才把时刻迁移到 `PUBLISHED`。图片时间线使用缩略图，详情使用展示图，不再向客户端签发原图 URL。视频当前在审核通过后使用原视频播放，尚未生成视频封面或转码版本，生产验收必须覆盖 iOS/Android 实际编码兼容性。

## 本地启动

默认 `dev` profile 使用文件型 H2 和内存会话，不需要准备 MySQL、Redis、COS 或微信 AppSecret。

```powershell
cd D:\devlop\love_records\server
mvn test
mvn spring-boot:run
```

启动后：

- API 根地址：`http://127.0.0.1:8080/api/v1`
- Swagger UI：`http://127.0.0.1:8080/api/v1/swagger-ui.html`
- 健康检查：`http://127.0.0.1:8080/api/v1/actuator/health`

开发登录示例：

```http
POST /api/v1/auth/wechat/session
Content-Type: application/json

{"code":"dev-user-a"}
```

除登录、邀请预览和健康检查外，请求需要：

```http
Authorization: Bearer <access_token>
```

关键 POST 还需要：

```http
Idempotency-Key: <每次业务操作生成的 UUID>
```

## 生产配置

复制 `.env.example` 中的变量到部署平台的 Secret Manager 或环境变量，不要把真实值写进文件。

生产启动：

```powershell
$env:SPRING_PROFILES_ACTIVE='prod'
$env:MYSQL_URL='jdbc:mysql://...'
$env:MYSQL_USERNAME='...'
$env:MYSQL_PASSWORD='...'
$env:REDIS_HOST='...'
$env:WECHAT_APP_ID='...'
$env:WECHAT_APP_SECRET='...'
$env:COS_BUCKET='...'
$env:COS_REGION='ap-shanghai'
$env:COS_SECRET_ID='...'
$env:COS_SECRET_KEY='...'
$env:TIMELINE_CURSOR_SECRET='至少32位随机字符串'
$env:MEDIA_CLEANUP_POLL_MS='3600000'
$env:MEDIA_TRASH_RETENTION_DAYS='30'
$env:MEDIA_ORPHAN_RETENTION_HOURS='24'
java -jar target\love-notes-server-0.1.0-SNAPSHOT.jar
```

`COS_SECRET_ID/COS_SECRET_KEY` 只允许存在于受控服务端。小程序收到的是约 30 分钟、只允许上传一个随机对象 Key 的 STS 临时凭证。如果坚持使用主账号密钥，代码可以运行，但密钥泄露影响整个云账号；必须放在 Jenkins Secret file 中并完成数据万象主账号角色授权。更安全的长期方案仍是 CAM 子用户或云角色。

`SERVER_BIND_ADDRESS` 是监听 IP，不是域名。同机 Nginx 反向代理时保持 `127.0.0.1`；只有反向代理在另一台主机且网络已受防火墙保护时才绑定服务器私网 IP。

## Docker Compose

仓库根目录提供 `docker-compose.yml`，镜像由 `server/Dockerfile` 构建。Compose 只运行 API，MySQL、Redis 和 COS 使用外部托管资源。

`server/Dockerfile` 只负责把已经打好的 Spring Boot jar 放进 Java 21 运行镜像，不在镜像构建阶段重复执行 Maven。Jenkins 的 `Backend test` 阶段会先运行 `mvn clean verify` 生成 `server/target/love-notes-server-*.jar`，随后 `Build image` 阶段直接复制该 jar。

在 Linux 部署服务器手动验证生产编排时，先复制示例配置并填写测试资源，禁止使用生产数据做开发测试：

```bash
cp .env.example .env
docker run --rm \
  --volume "$PWD:/workspace" \
  --workdir /workspace \
  maven:3.9-eclipse-temurin-21 \
  mvn -B -ntp clean verify
cd ..
docker compose --env-file server/.env config --quiet
docker compose --env-file server/.env build api
docker compose --env-file server/.env up -d --wait api
docker compose --env-file server/.env ps api
```

Windows 开发机只需要执行 Maven 测试和 Compose 配置校验；正式 Linux 镜像由带有 `linux-docker` 标签的 Jenkins 节点构建。

默认只将容器端口映射到宿主机 `127.0.0.1:8080`。公网流量应先经过 Nginx、负载均衡或 API 网关终止 HTTPS，不要直接开放 8080。

完整的 Jenkins 凭据、分支、发布、验证和回滚步骤见：

```text
docs/Jenkins-Docker-Compose服务端部署指南.md
```

## 数据库初始化

应用启动时由 Flyway 自动执行 `src/main/resources/db/migration`。生产账号需要目标 schema 的建表/变更权限；稳定运行后可将迁移身份和应用运行身份拆分。

当前迁移版本为 V3。不要手工修改已在共享环境执行过的迁移文件，应新增更高版本迁移。

## 测试

```powershell
mvn test
```

覆盖：鉴权拒绝、未配对共享拦截、邀请幂等、双账号配对、共享访问、解绑隔离、真实记录闭环、上传会话、媒体处理、派生文件、过期媒体清理以及 UUIDv7。

JaCoCo 报告生成在：

```text
target/site/jacoco/index.html
```

## 腾讯云 COS

生产实现使用：

- `com.qcloud:cos_api:5.6.227`
- `com.tencent.cloud:cos-sts-java:3.0.8`

创建上传会话时，服务端生成：

```text
original/{userId}/{yyyy}/{MM}/{uuid}.{ext}
```

STS 策略仅允许对该随机 Key 执行简单上传或分块上传所需操作。客户端上传结束必须调用 `/upload-sessions/{id}/complete`，服务端会读取 COS 对象元数据并校验文件大小。

小程序使用官方 `cos-wx-sdk-v5`，图片和视频可能触发分块上传，因此 STS 还会对同一个随机 Key 授予分块上传所需的最小操作。生产存储桶必须开通并绑定腾讯云数据万象；后端身份需要图片/视频/文字审核、图片持久化处理、对象读取元数据和对象删除能力。没有权限时 Worker 会保留 `PROCESSING` 并持续重试，不会绕过审核直接发布。

新增清理参数：

```dotenv
MEDIA_PROCESSING_POLL_MS=5000
MEDIA_CLEANUP_POLL_MS=3600000
MEDIA_TRASH_RETENTION_DAYS=30
MEDIA_ORPHAN_RETENTION_HOURS=24
```

## 尚未完成

- Outbox 和消息队列；
- 视频封面和转码；
- 回应、短评、消息、宠物和回顾 API；
- 周/月/年时间线摘要；
- 审计日志、注销和通知任务；
- OpenAPI 生成小程序 DTO。

回应、短评、消息、宠物和回顾页面仍使用本地 store。正式版本若要开放这些入口，必须先实现真实 API；否则应在提审版本隐藏入口，不能把本地模拟数据当作生产功能。
