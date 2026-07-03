# 恋爱笔记统一 API 服务

Spring Boot 3 / Java 21 后端基础版，按详细设计提供统一 `/api/v1` API。

## 当前已实现

- 微信 code 会话接口、短 access token、轮换 refresh token；
- 开发环境稳定模拟微信身份，生产环境调用微信 `jscode2session`；
- 当前用户摘要；
- 一次性邀请、24 小时过期、预览、接受、撤销；
- 一人一个有效情侣空间、关系资料乐观锁、单方解绑即时撤权；
- 文字/图片/视频时刻校验、PRIVATE/SHARED 服务端权限；
- 时刻详情、编辑、回收站、恢复和时间线首屏；
- 媒体上传会话；开发环境模拟上传，生产环境签发腾讯云 COS STS 单对象临时凭证；
- Flyway MySQL 迁移、Redis 会话/幂等存储、统一错误和 request ID；
- H2 隔离集成测试，不连接生产 MySQL、Redis 或 COS。

图片/视频完成上传后当前状态为 `UPLOADING`。内容安全、缩略图、EXIF 清理、Worker 和 Outbox 是下一迭代，不应在这些任务完成前把媒体时刻暴露给另一半。

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
java -jar target\love-notes-server-0.1.0-SNAPSHOT.jar
```

`COS_SECRET_ID/COS_SECRET_KEY` 必须属于最小权限 CAM 子用户或云角色，只存在于受控服务端。小程序收到的是约 30 分钟、只允许上传一个随机对象 Key 的 STS 临时凭证。

## 数据库初始化

应用启动时由 Flyway 自动执行 `src/main/resources/db/migration`。生产账号需要目标 schema 的建表/变更权限；稳定运行后可将迁移身份和应用运行身份拆分。

不要手工修改已在共享环境执行过的迁移文件，应新增 `V2__...sql`。

## 测试

```powershell
mvn test
```

覆盖：鉴权拒绝、未配对共享拦截、邀请幂等、双账号配对、共享访问、解绑隔离、上传会话以及 UUIDv7。

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

STS 策略仅允许对该 Key 执行 `name/cos:PutObject`。客户端上传结束必须调用 `/upload-sessions/{id}/complete`，服务端会读取 COS 对象元数据并校验文件大小。

## 尚未完成

- Outbox、消息队列和媒体 Worker；
- 内容安全、缩略图、视频封面、EXIF 清理；
- 回应、短评、消息、宠物和回顾 API；
- 稳定游标/HMAC、时间线摘要；
- 审计日志、注销、异步物理删除；
- OpenAPI 生成小程序 DTO 与完整远端联调切换。
