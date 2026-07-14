# 腾讯云 COS 私有对象存储接入指南

> 如果你的目标是正式上线，请先按[《生产上线唯一操作手册》](生产上线唯一操作手册.md)的顺序执行。本文只解释 COS、STS、数据万象和媒体安全细节。

适用项目：爱刻日记 / 恋爱笔记微信小程序。

## 1. 结论

可以使用腾讯云对象存储 COS。建议架构：

```text
微信小程序
  ├─ 向爱刻日记 API 申请上传凭证
  ├─ 使用短期临时凭证直传 COS 私有桶
  └─ 查看图片前向爱刻日记 API 申请短期下载地址

爱刻日记 API
  ├─ 校验登录用户和情侣关系
  ├─ 生成仅能操作一个对象路径的短期凭证
  ├─ 保存媒体元数据到 MySQL
  └─ 驱动内容安全、缩略图、EXIF 清理等任务

腾讯云 COS 私有桶
  ├─ original/   原始媒体
  ├─ display/    清理后的展示媒体
  ├─ thumbnail/  缩略图和视频封面
  ├─ derived/    图片模板和回顾产物
  └─ tmp/        临时上传文件
```

禁止把腾讯云永久 SecretId、SecretKey 写进小程序。

## 2. 怎么购买

COS 不需要先购买服务器实例。第一次使用时开通服务，默认可采用按量计费。

1. 注册并登录腾讯云：<https://cloud.tencent.com/>
2. 完成实名认证。
3. 打开对象存储控制台：<https://console.cloud.tencent.com/cos>
4. 按页面提示开通 COS 服务。
5. 暂时选择按量计费，不急着购买资源包。
6. 进入费用中心，设置预算和余额告警。
7. 运行一段时间后，根据实际存储容量和外网下行流量决定是否购买资源包。

主要计费来源：

- 存储容量；
- 读写请求次数；
- 外网下行流量；
- 图片处理、审核、转码等数据处理；
- 如果接入 CDN/EdgeOne，还可能产生 CDN 和回源费用。

不要只看“每 GB 存储价格”。图片类应用通常还要关注外网下行流量和图片处理费用。

## 3. 创建第一个私有桶

进入“对象存储控制台 → 存储桶列表 → 创建存储桶”。

建议填写：

| 配置 | 建议值 | 原因 |
|---|---|---|
| 存储桶类型 | 通用存储桶 | 满足图片、视频和派生文件需求 |
| 名称 | `love-notes-media-dev` | 当前先建测试桶；正式上线再单独创建生产桶 |
| 地域 | 与未来后端相同 | 地域创建后不能修改；同地域延迟和成本更可控 |
| 访问权限 | 私有读写 | 禁止匿名读取用户照片 |
| 存储类型 | 标准存储 | 恋爱记录需要随时回看，不建议一开始归档 |
| 多 AZ | MVP 可暂不开 | 根据预算和灾备目标决定 |
| 版本控制 | MVP 暂不开 | 避免删除和隐私清理复杂化 |
| 服务端加密 | 优先启用 SSE-COS | 增强静态数据保护，最终以控制台能力和成本为准 |
| 日志 | 后续启用 | 正式生产环境建议保存访问日志到独立日志桶 |

如果主要用户和后端都在华东，可以选择上海地域；如果后端最终部署在广州，则选择广州。不要先随便创建，因为桶名称和地域不能修改。

创建成功后记录以下三项，后续开发要用：

```text
Bucket：例如 love-notes-media-dev-1250000000
Region：例如 ap-shanghai
访问域名：例如 love-notes-media-dev-1250000000.cos.ap-shanghai.myqcloud.com
```

不要记录或发送主账号 SecretKey。

## 4. 创建目录规划

COS 没有传统磁盘目录，控制台看到的目录本质是对象 Key 前缀。推荐：

```text
original/{userPublicId}/{yyyy}/{mm}/{uuid}.jpg
display/{userPublicId}/{yyyy}/{mm}/{uuid}.webp
thumbnail/{userPublicId}/{yyyy}/{mm}/{uuid}.webp
derived/moment/{momentId}/{templateVersion}/{uuid}.jpg
derived/recap/{recapId}/{snapshotVersion}/{uuid}.jpg
tmp/{userPublicId}/{uploadSessionId}/{uuid}.part
```

规则：

- 使用 UUID，不直接使用原始文件名；
- Key 中不要出现昵称、手机号、微信号、正文等个人信息；
- 小程序不能自行指定其他用户目录；
- 服务端必须根据当前登录用户生成 Key；
- 数据库保存 `storage_key`，不要把临时签名 URL 当成永久字段保存。

## 5. 第一次控制台测试

1. 打开刚创建的存储桶。
2. 进入“文件列表”。
3. 创建 `test/` 目录或直接上传一张无隐私的测试图片。
4. 上传完成后复制对象 URL。
5. 使用浏览器无痕窗口直接打开 URL。
6. 私有桶应返回无权限或 AccessDenied，而不是直接显示图片。
7. 在控制台生成临时访问链接，再打开验证。
8. 等临时链接过期后重新访问，确认不能继续读取。
9. 删除测试图片。

如果永久对象 URL 可以匿名打开，说明桶或对象 ACL 配错，应立即改回私有读写。

## 6. 配置服务端 API 密钥与数据万象

项目支持把腾讯云主账号 API 密钥配置在服务端。如果你不创建子账号，按下面操作：

1. 打开 [API 密钥管理](https://console.cloud.tencent.com/cam/capi)，创建或查看主账号 `SecretId`、`SecretKey`；
2. 打开 COS 存储桶，确认访问权限为“私有读写”；
3. 在数据万象控制台绑定这个存储桶，开通图片处理与内容审核；
4. 按控制台提示完成主账号数据万象服务角色授权；
5. 将密钥只写入 Jenkins 的生产 Secret file：

   ```dotenv
   COS_BUCKET=love-1303187601
   COS_REGION=ap-chengdu
   COS_SECRET_ID=你的SecretId
   COS_SECRET_KEY=你的SecretKey
   ```

主账号密钥权限很大，泄漏会影响整个腾讯云账号。它不能写进小程序、Git、Docker 镜像、普通 `.env` 文件、日志或聊天记录。建议开启登录保护、费用告警并定期轮换。代码不强制子账号，但长期生产仍建议迁移到 CAM 子用户或云角色。

注意：使用主账号 `SecretId/SecretKey` 不能替代第 4 步的数据万象服务角色授权。未授权时，普通 COS 读写可能正常，但文本、图片或视频审核会返回 403，体验版发布文字时会显示“文本安全检测服务暂时不可用”。服务端会记录 `COS text audit failed`，并给出不含密钥的错误分类、腾讯云错误码和 RequestId。

服务端当前会执行：读取对象元数据、删除对象、图片/视频/文字审核、图片持久化处理，以及为小程序申请临时 STS。小程序拿到的临时凭证只允许操作后端生成的单个 `original/...` Key，动作包括：

```text
cos:PutObject
cos:InitiateMultipartUpload
cos:UploadPart
cos:ListParts
cos:CompleteMultipartUpload
cos:AbortMultipartUpload
```

最终权限策略必须同时限制：

- 指定 Bucket；
- 指定对象前缀；
- 指定操作；
- 短有效时间。

## 7. 正确的上传流程

### 7.1 创建上传会话

小程序先调用自己的后端：

```http
POST /api/v1/upload-sessions
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "file_name": "IMG_001.jpg",
  "mime_type": "image/jpeg",
  "size": 1827364,
  "sha256": "..."
}
```

服务端执行：

1. 校验登录用户；
2. 校验文件类型、大小和用户配额；
3. 生成 `asset_id`、`upload_session_id` 和随机 `storage_key`；
4. 使用 STS 申请短期临时密钥；
5. 临时策略只允许上传这一个 `storage_key`；
6. 返回 Bucket、Region、Key、临时密钥和过期时间。

临时凭证响应示例：

```json
{
  "asset_id": "asset_xxx",
  "upload_session_id": "upload_xxx",
  "bucket": "love-notes-media-dev-1250000000",
  "region": "ap-shanghai",
  "key": "original/user_xxx/2026/07/uuid.jpg",
  "credentials": {
    "tmp_secret_id": "...",
    "tmp_secret_key": "...",
    "session_token": "...",
    "start_time": 1783000000,
    "expired_time": 1783001800
  }
}
```

临时密钥泄漏的危害仍然存在，因此应控制为约 15–30 分钟，并限制到单个对象或当前上传会话目录。

### 7.2 小程序直传 COS

小程序收到临时凭证后，使用腾讯云小程序 SDK 或官方直传方式上传到 COS。

上传完成后，小程序不能直接认为成功，还应调用：

```http
POST /api/v1/media/upload-sessions/{uploadSessionId}/complete
```

服务端检查：

- 对象是否真实存在；
- Key 是否属于当前用户和上传会话；
- 文件大小是否匹配；
- 上传申请时记录的 MIME 是否允许；
- 上传会话是否已完成或过期。

当前实现会校验对象存在性和文件大小。检查通过后，生产环境将资产状态改为 `PROCESSING`：图片执行同步审核并生成去 EXIF 的展示图和缩略图，视频进入异步审核轮询。后续可再增加文件魔数和 SHA-256 的服务端复核。

## 8. 正确的下载流程

私有桶中的对象不能把永久 URL 直接返回给客户端。

小程序查看照片时：

```http
GET /api/v1/media-assets/{assetId}/access-url
Authorization: Bearer <access-token>
```

服务端必须先判断：

1. 当前用户是否是作者；或
2. 记录是否为共同可见；且
3. 当前情侣关系是否有效；且
4. 资源未删除、未冻结、未被安全审核阻断。

通过后，返回约 5 分钟的预签名 URL。图片时间线返回 `thumbnail/`，详情返回 `display/`；API 不向小程序签发 `original/` 原图 URL。视频审核通过后当前仍签发原视频 URL。

## 9. 微信公众平台域名配置

真实 AppID 下，登录微信公众平台：

```text
开发管理 → 开发设置 → 服务器域名
```

配置：

- `request` 合法域名：爱刻日记 API 域名；
- `uploadFile` 合法域名：COS 上传域名；
- `downloadFile` 合法域名：COS/鉴权 CDN 下载域名；
- 如果 SDK 通过 `wx.request` 调 COS，还需按官方 SDK 要求加入 `request` 域名。

示例：

```text
https://api.example.com
https://love-notes-media-dev-1250000000.cos.ap-shanghai.myqcloud.com
```

开发者工具中的“不校验合法域名”只能用于开发，正式版不能依赖该选项。

## 10. 生命周期和费用控制

建议配置：

| 前缀/对象 | 建议规则 |
|---|---|
| 未绑定记录的 `original/` | 应用任务 24 小时后删除，生命周期规则可再做兜底 |
| 未完成分块上传 | 1–3 天自动清理 |
| 回收站记录对象 | 应用保留 30 天，之后删除原件和派生文件 |
| `thumbnail/` | 跟随源记录删除，可重新生成 |
| `derived/` | 回顾或模板产物删除时联动清理 |
| `original/` | 不自动归档；按用户删除、注销和数据保留政策处理 |

不要一开始把原图自动转归档存储，否则用户回看时可能产生取回等待和取回费用。

同时设置：

- 月预算告警；
- 日费用异常告警；
- 外网下行流量告警；
- 存储容量趋势告警；
- 未完成分块上传碎片清理；
- 测试桶与生产桶分开。

## 11. 安全底线

- 存储桶始终私有读写；
- 永久密钥只在受控服务端使用；
- 主账号密钥虽然可用，但只允许在受控服务端；长期优先迁移 CAM 子用户或云角色；
- STS 权限必须限制 Bucket、Key、Action 和时间；
- 下载前必须经过爱刻日记服务端业务鉴权；
- 解绑时先撤销 API 授权和缓存，再异步处理对象；
- 删除数据库记录不能代替删除 COS 对象；
- 日志不能记录临时密钥、完整签名 URL、正文或原图地址；
- 内容安全通过前，不允许把对象分享给另一半；
- 不允许客户端传入任意 Bucket 或任意 Key。

## 12. 当前项目要改哪些位置

当前项目已完成服务端和小程序 COS 真实链路：

```text
server/src/main/java/com/lovenotes/server/storage/CosObjectStorage.java
server/src/main/java/com/lovenotes/server/media/MediaService.java
server/src/main/java/com/lovenotes/server/media/MediaController.java
server/src/main/java/com/lovenotes/server/media/MediaProcessingService.java
server/src/main/java/com/lovenotes/server/media/MediaCleanupService.java
miniprogram/services/media-service.ts
```

`miniprogram/core/api-config.ts` 中 `useRemoteApi: true` 时，小程序会申请上传会话、使用官方 `cos-wx-sdk-v5` 直传、上报完成并轮询资产状态。服务端审核通过后才发布记录。

媒体 service 负责：

1. 创建上传会话；
2. 获取临时凭证；
3. 调 COS 上传；
4. 上报完成；
5. 轮询处理状态；
6. 获取短期显示 URL；
7. 上传失败单项重试。

## 13. 推荐执行顺序

控制台和生产环境：

- [ ] 注册腾讯云并实名认证；
- [ ] 开通 COS 按量计费；
- [ ] 创建私有测试桶；
- [ ] 控制台上传测试图片；
- [ ] 验证永久 URL 不能匿名打开；
- [ ] 设置预算告警；
- [ ] 将主账号 SecretId/SecretKey 仅保存到 Jenkins Secret file；
- [ ] 存储桶绑定数据万象并完成主账号角色授权；
- [x] STS 临时凭证接口；
- [x] 小程序直传和失败重试；
- [x] 上传完成校验；
- [x] 文字/图片/视频内容审核；
- [x] 图片展示副本、缩略图和 EXIF 清理；
- [x] 5 分钟短期下载 URL；
- [x] 30 天回收站清理和 24 小时孤儿上传清理；
- [ ] 微信合法域名；
- [ ] 真实双账号权限、解绑和旧链接测试；
- [ ] iOS/Android 视频编码兼容性测试。

## 14. 官方文档

- COS 文档入口：<https://cloud.tencent.com/document/product/436>
- 创建存储桶：<https://cloud.tencent.com/document/product/436/14106>
- COS 按量计费：<https://cloud.tencent.com/document/product/436/36522>
- 临时密钥生成与使用：<https://cloud.tencent.com/document/product/436/14048>
- 小程序直传实践：<https://cloud.tencent.com/document/product/436/34929>
- 小程序 SDK 概览：<https://cloud.tencent.com/document/product/436/6474>
- 图片持久化处理：<https://cloud.tencent.com/document/product/436/66154>
- Java 图片审核：<https://cloud.tencent.com/document/product/436/115608>
- Java 视频审核：<https://cloud.tencent.com/document/product/436/115956>
- Java 文字审核：<https://cloud.tencent.com/document/product/436/115959>
- 生成预签名 URL：<https://cloud.tencent.com/document/product/436/36162>
- CAM 新建子用户：<https://cloud.tencent.com/document/product/598/13674>
