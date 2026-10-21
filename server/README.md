# 恋爱笔记统一 API 服务

媒体与记录管理网页：`/api/v1/admin/`。复用内部运维口令，支持账号筛选、COS 检查、持久化批量补图任务、隐藏与恢复。部署及使用见[管理端使用说明](../docs/管理端使用说明.md)。

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
- 共同可见时刻的真实回应与单层短评；回应每人每条保留一个，短评支持幂等防重复提交；
- 应用内信笺：共享记录、回应和短评自动生成消息，支持列表、单条已读和全部已读；
- 云宠物：配对后自动创建宠物，喂食/玩耍按用户每日幂等，成长值和共同日志服务端持久化；
- 年度回顾：共同可见记录候选、敏感片段排除、草稿选择、生成状态和解绑隔离；小程序端负责 Canvas 长图保存；
- 媒体上传会话、时刻媒体绑定和短期访问地址；开发环境模拟上传，生产环境签发腾讯云 COS STS 单对象临时凭证；
- 生产媒体处理 Worker：图片同步审核、视频异步审核轮询；审核通过前仅作者看到处理状态，敏感或疑似内容不会发布；
- 图片审核通过后生成去除 EXIF 的 `display/` 展示 WebP 和 `thumbnail/` 缩略 WebP；
- 回收站超过 30 天后清理原件、展示图和缩略图；未绑定记录的上传超过 24 小时后清理；
- Flyway MySQL 迁移、Redis 会话/幂等存储、统一错误和 request ID；
- H2 隔离集成测试，不连接生产 MySQL、Redis 或 COS。

图片/视频上传后进入 `PROCESSING`，审核通过才把时刻迁移到 `PUBLISHED`。图片生成展示图和缩略图，视频通过 COS 截帧生成封面，缺少封面时有自动补图；管理端支持实际文件检查和手动修复。必要的视频转码与 iOS/Android 实际编码兼容性仍需生产验收。

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

服务器只维护 `/opt/love-notes/.env` 一份配置值，完整变量见 [.env.example](.env.example)。真实值不进入 Git、镜像或 Jenkins 参数。项目中的 `application.yml` 和 `application-prod.yml` 保留为 `${变量名:默认值}` 模板；密码、密钥无真实值默认项，生产游标密钥也不能回退到开发值。不在服务器挂载另一份应用 YAML。

Compose 通过 `env_file` 把整份 `.env` 注入应用，新变量无需逐一修改 Compose 映射。`--env-file` 同时用于解析端口/资源等编排参数。Jenkins 只读取固定目录的 `compose.yml` 和 `.env`，不再依赖 `love-notes-prod-env` Secret file。

`COS_SECRET_ID/COS_SECRET_KEY` 只保存在受控服务器 `.env`。小程序收到的是约 30 分钟、只允许上传一个随机对象 Key 的 STS 临时凭证。COS 仍需完成数据万象角色授权，优先使用最小权限 CAM 子用户或云角色。

`SERVER_BIND_ADDRESS` 是监听 IP，不是域名。同机 Nginx 反向代理时保持 `127.0.0.1`；只有反向代理在另一台主机且网络已受防火墙保护时才绑定服务器私网 IP。

## Docker Compose

仓库根目录提供 `docker-compose.yml`，镜像由 `server/Dockerfile` 构建。Compose 只运行 API，MySQL、Redis 和 COS 使用外部托管资源。

`server/Dockerfile` 只负责把已经打好的 Spring Boot jar 放进 Java 21 运行镜像，不在镜像构建阶段重复执行 Maven，也不执行 `apt-get update`。Jenkins 的 `Backend test` 阶段会先运行 `mvn clean verify` 生成 `server/target/love-notes-server-*.jar`，随后 `Build image` 阶段直接复制该 jar。Compose 健康检查使用基础镜像自带的 `bash` 和 `grep` 请求 Actuator，不需要在镜像里安装 `curl`。

首次部署或从旧 Jenkins 密钥文件迁移时，先按[部署指南](../docs/Jenkins-Docker-Compose服务端部署指南.md)准备固定目录、真实变量、权限及 Jenkins 挂载。发布成功后，修改配置不需要重新打包：

```bash
unset IMAGE_TAG APP_ENV_FILE
sudoedit /opt/love-notes/.env
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml config --quiet
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 300 api
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml ps api
```

配置不会热生效，重建应用容器会短暂中断。`production` 镜像别名只在 Jenkins 健康发布成功后更新；具体提交镜像保留用于回滚。不要在 `.env` 固定 `IMAGE_TAG`，不要和 Jenkins 同时重建容器。Compose 不再包含依赖仓库相对路径的 `build`；镜像由流水线的 `docker build ... server` 构建。

默认只将容器端口映射到宿主机 `127.0.0.1:8080`。公网流量应先经过 Nginx、负载均衡或 API 网关终止 HTTPS，不要直接开放 8080。

完整的服务器配置、分支、发布、验证和回滚步骤见：

```text
docs/Jenkins-Docker-Compose服务端部署指南.md
```

## 数据库初始化

应用启动时由 Flyway 自动执行 `src/main/resources/db/migration`。生产账号需要目标 schema 的建表/变更权限；稳定运行后可将迁移身份和应用运行身份拆分。

当前迁移版本为 V22。不要手工修改已在共享环境执行过的迁移文件，应新增更高版本迁移。

## 测试

```powershell
mvn test
```

覆盖：鉴权拒绝、未配对共享拦截、邀请幂等、双账号配对、共享访问、解绑隔离、真实记录闭环、真实回应与短评、应用内信笺、云宠物、年度回顾、上传会话、媒体处理、派生文件、过期媒体清理以及 UUIDv7。

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
ACCOUNT_DELETION_POLL_MS=600000
INTERNAL_OPERATION_TOKEN_HASH=replace_with_sha256_of_internal_operation_token
MEDIA_TRASH_RETENTION_DAYS=30
MEDIA_ORPHAN_RETENTION_HOURS=24
```

## 尚未完成

- Outbox 和消息队列；
- 必要的视频转码及实际编码兼容性验收；
- 周/月/年时间线摘要；
- 审计日志、注销和通知任务；
- OpenAPI 生成小程序 DTO。

年度回顾的状态和内容已接入真实 API，长图由小程序端根据当前回顾内容临时绘制并保存到用户相册，不上传 COS。回应、短评、应用内信笺、云宠物和年度回顾均已接入真实 API；互动只在共同可见且当前仍配对的记录中开放。
