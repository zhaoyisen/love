# 小程序远端联调层

页面通过 `app-service.ts` 统一选择 Mock 或真实后端。`core/api-config.ts` 中 `useRemoteApi: false` 时可离线完整演示；改为 `true` 后，登录、时间线、纯文字发布、邀请、接受邀请和解绑会调用 Java 服务端。

Mock 与 Remote 使用两套独立本地缓存，切换模式不会把演示记录混入真实账号。图片和视频发布仍被明确标记为“接入中”；完成 COS 小程序直传和媒体处理后再开放入口。

联调模拟器前：

1. 启动 `server`；
2. 保持 `core/api-config.ts` 为 `http://127.0.0.1:8080/api/v1`；
3. 开发者工具本地设置中临时勾选“不校验合法域名”；
4. 真机时必须改为手机可访问的 HTTPS 域名，不能使用 `127.0.0.1`。

开发者工具内默认使用固定测试身份 `dev-user-a`，便于刷新后保持同一个联调账号。如需模拟第二个账号，可在 Storage 中把 `love-notes:dev-identity` 改为 `dev-user-b`，然后清除登录 token 并重新登录。

永久密钥不得进入本目录或任何小程序代码。
