# Jenkins + Docker Compose 服务端部署指南

生产配置只在服务器的 `/opt/love-notes/.env` 维护。Jenkins 负责检出代码、测试、构建镜像和替换 API 容器，**不会创建或覆盖服务器的 `.env`、`compose.yml`**。本次变更必须先完成下面的目录准备，再发布新版 `main`；否则流水线会在替换容器前停止。

## 配置与发布的关系

```text
Gitee/GitHub main → Jenkins → love-notes-server:<Git提交短哈希>
                                    ↓
服务器 /opt/love-notes/compose.yml + .env → API 容器
                                    ↓ 健康检查通过
                         镜像别名 love-notes-server:production
```

- `develop` 只运行检查和构建；`main` 才执行 `Deploy production`。
- 当前已有 Jenkins 作业可继续使用；保持它实际连接的仓库，当前使用 Gitee 时必须把提交同步到 Gitee。
- `compose.yml` 描述服务、网络、端口、资源限制；所有可调整的配置值放 `.env`。
- 项目内 `application.yml`、`application-prod.yml` 是随 JAR 发布的模板，用 `${变量名:默认值}` 读取环境变量。不在服务器放第二份应用 YAML，不挂载 `config/`。
- Compose 的 `--env-file` 解析端口等编排参数；`env_file` 把同一份文件的变量注入应用容器。只指定前者不会自动传入所有应用变量。
- 不再依赖 Jenkins 的 `love-notes-prod-env` Secret file。不向 Git、Jenkins 参数或构建日志写真实密钥。

## 1. 首次准备服务器目录（现有部署也要迁移一次）

前提：Linux 构建节点与生产 API 使用同一个 Docker daemon，具备 Java 21、Git、Docker、Compose v2.20+，节点标签为 `linux-docker`。MySQL、Redis、COS 沿用原有资源；不要删除数据库、数据卷或重建 schema。

先记录现有容器的项目和镜像，只读取这些字段，不要输出容器完整环境：

```bash
sudo docker inspect love-notes-api-1 --format '{{index .Config.Labels "com.docker.compose.project"}} {{.Config.Image}}'
```

本方案沿用项目 `love-notes`、服务 `api`，通常容器名为 `love-notes-api-1`。若现有项目名不同，先对齐 Jenkins/运维命令中的 `--project-name`，避免启动第二套服务抢占端口。

创建配置目录和仅供运维/部署读取的组：

```bash
getent group love-notes-ops >/dev/null || sudo groupadd --system love-notes-ops
sudo install -d -m 0750 -o root -g love-notes-ops /opt/love-notes
```

在服务器上进入包含本次修改的项目根目录，**仅在目标文件不存在时**安装模板：

```bash
if ! sudo test -e /opt/love-notes/compose.yml; then
  sudo install -m 0640 -o root -g love-notes-ops docker-compose.yml /opt/love-notes/compose.yml
fi
if ! sudo test -e /opt/love-notes/.env; then
  sudo install -m 0640 -o root -g love-notes-ops server/.env.example /opt/love-notes/.env
fi
sudoedit /opt/love-notes/.env
```

已有生产环境：从你保管的原生产变量文件迁移真实值，保留 MySQL、Redis、COS、微信、`TIMELINE_CURSOR_SECRET` 和运维口令哈希；不要换成示例值。如果唯一副本在旧 Jenkins 凭据中，先通过受控运维方式保存到这个服务器文件，再切换流水线。确认迁移成功前可以保留旧凭据，但新流水线不再读取它。

如果原 API 容器仍健康运行，可使用 [migrate-production-env.py](../scripts/migrate-production-env.py) 从容器直接迁移，无需把密钥复制到终端或聊天。需要服务器 Python 3，先将新版 `server/.env.example` 上传为 `/tmp/love-notes-env.example`，将脚本上传为 `/tmp/migrate-production-env.py`；安装后的 `/opt/love-notes/.env` 必须仍是该示例模板或尚不存在。先检查，再应用：

```bash
sudo python3 /tmp/migrate-production-env.py
# 只有上一条显示 Dry run passed 后才执行：
sudo python3 /tmp/migrate-production-env.py --apply
```

脚本私下读取固定容器 `love-notes-api-1` 的 Docker 元数据，沿用已知应用变量以及实际宿主机端口、内存/CPU和日志限制。缺少必要变量、容器不健康、配置已经被人工修改或端口有歧义时停止，不打印真实值，也不重启容器。新参数保留模板默认值；空的运维口令哈希仍保持空，不会自动启用管理登录。生成的双引号值按 Compose dotenv 规则转义，`$$` 表示字面量 `$`；不要为了让文件“看起来一致”删除转义。目录/网络、Jenkins 挂载仍按本指南检查，脚本不修改 Compose 或容器网络。

`.env` 必须设置/检查：

```dotenv
COMPOSE_PROJECT_NAME=love-notes
SPRING_PROFILES_ACTIVE=prod
SERVER_BIND_ADDRESS=127.0.0.1
SERVER_HTTP_PORT=8080
SERVER_PORT=8080
```

完整变量以 [server/.env.example](../server/.env.example) 为准。删除旧文件中的 `IMAGE_TAG=local` 等 `IMAGE_TAG` 行，也不要添加 `APP_ENV_FILE`；这些属于发布过程，不能由业务配置固定。已有 Compose 也需要手动对照新模板改为 `env_file`，去掉旧的 `environment` 映射和 `build`，默认镜像使用 `production`，以后 Jenkins 不替你覆盖它。

密码含 `$`、`#` 或空格时，使用单引号保留字面值，例如 `MYSQL_PASSWORD='example-$-#-with space'`；值本身含单引号时按 Compose dotenv 规则转义。不要 `source .env`、`set -x`、输出完整的 `docker compose config` 或完整 `docker inspect`，这些可能泄露配置。不要把 `.env` 放进仓库或镜像。

保持现有 MySQL/Redis 连接网络：若使用 `host.docker.internal`，模板已保留 `host-gateway`；若使用数据库容器名，则需要在服务器 Compose 中保留原来共享的 external 网络/别名。不要把原来的共享 external 网络换成一个新建的同名 bridge。

每次改配置前，在仅 root 可读的安全备份目录保存旧文件。备份是恢复副本，不参与运行时配置加载：

```bash
sudo install -d -m 0700 /root/love-notes-backups
sudo cp -p /opt/love-notes/.env "/root/love-notes-backups/env-$(date +%Y%m%d-%H%M%S)"
sudo cp -p /opt/love-notes/compose.yml "/root/love-notes-backups/compose-$(date +%Y%m%d-%H%M%S).yml"
```

## 2. 让 Jenkins 能只读服务器配置

宿主机运行 Jenkins 时，将实际执行用户加入读取组，随后重新登录/重启对应 agent 以刷新组权限：

```bash
sudo usermod -aG love-notes-ops jenkins
sudo -u jenkins test -r /opt/love-notes/.env
sudo -u jenkins test -r /opt/love-notes/compose.yml
```

Docker 运行 Jenkins 时，修改**现有 Jenkins 的 Compose**，在原服务的 `volumes` 下增加：

```yaml
volumes:
  # 保留所有原有 Jenkins 数据卷、Docker socket 等挂载
  - /opt/love-notes:/opt/love-notes:ro
```

如果 Jenkins 容器不是 root，执行 `getent group love-notes-ops` 获取数字 GID，把该 GID 添加到原服务的 `group_add`，保留已有补充组。然后在 Jenkins 的原 Compose 目录执行 `docker compose up -d` 重建 Jenkins；保留 `/var/jenkins_home` 的原挂载、原端口和 Docker socket，不要执行 `down -v`。

用实际容器名验证，不会显示密钥：

```bash
sudo docker exec Jenkins容器名 sh -c 'test -r /opt/love-notes/.env && test -r /opt/love-notes/compose.yml'
```

这里的配置目录路径要在宿主机和 Jenkins 容器内一致。节点必须是受信任的专用节点；不要为方便改成所有用户可读。

## 3. Jenkins 日常发布

原多分支流水线保留，Script Path 仍为 `Jenkinsfile`：

```text
Checkout → Verify toolchain → Mini Program checks → Backend test
→ Build image → Validate Compose → Deploy production（仅 main）
```

`Validate Compose` 只检查仓库模板与示例变量；生产阶段调用 [scripts/deploy-production.sh](../scripts/deploy-production.sh)，验证服务器真实 Compose 后运行 `up --wait`。校验使用 `config --quiet`；生产 Compose 的错误诊断也不进入 Jenkins 日志，避免 dotenv 语法错误把原值带进报错。失败时流水线保留退出码并提示到服务器受控终端检查，切勿复制含真实值的错误到聊天或工单。

发布时 Jenkins 从 `DEPLOY_DIR=/opt/love-notes` 读取已有文件，通过环境变量临时指定 `<Git提交短哈希>` 镜像，不写 `.env`。容器健康检查通过后，才把该镜像另标为 `love-notes-server:production`，供以后手动应用配置使用。服务器文件缺失/无读取权限时直接失败，不会退回旧凭据或自动写模板。

首次切换前先备份数据库并完成第 1、2 节，再提交、推送代码到 Jenkins 实际连接的仓库，经 `develop` 检查后合并 `main`。本地打包成功不代表已经发布。

发布失败不会自动回滚容器；若失败发生在重建之后，需要查看日志并按第 5 节恢复旧镜像。旧的 `production` 标签只在成功后改变，不代表当前运行的失败容器也已自动恢复。

## 4. 修改配置及查看状态

### 仅同步中文注释（保留生产值）

在本地项目根目录执行，将模板和注释同步脚本上传到服务器（替换实际服务器 IP）：

```powershell
scp server/.env.example ubuntu@服务器IP:/tmp/love-notes-env.example
scp scripts/sync-env-comments.py ubuntu@服务器IP:/tmp/sync-env-comments.py
```

然后在 Ubuntu 服务器的 SSH 终端执行，先预览，只有显示 `DRY_RUN_OK` 后才执行第二条：

```bash
sudo python3 /tmp/sync-env-comments.py
sudo python3 /tmp/sync-env-comments.py --apply
```

脚本只在现有配置项上方补充模板注释，不新增、删除、排序或重新转义任何配置项，保留自定义注释和未知参数。重复运行不会重复添加相同注释。应用前备份原文件到 `/root/love-notes-backups/env-before-comments-*`（仅 root 可读），原文件的所有者、组、权限保持不变。不支持的语法（例如多行引号值）会停止，不输出配置值；预览后若有其他运维操作，需重新预览再应用。请勿与人工编辑同时执行。

仅同步注释无需重启容器或触发 Jenkins。不要用示例模板覆盖生产 `.env`，也不要重新运行首次配置迁移脚本来同步注释。

### 修改配置值

以后修改业务参数、数据库/COS 信息、端口、内存等值，只编辑 `/opt/love-notes/.env`。新增业务变量只需在应用模板中引用并写入 `.env`，不再补一份 Compose `environment` 映射。

修改后在服务器执行（沿用最近一次成功发布的 `production` 镜像，不重新构建）：

```bash
unset IMAGE_TAG APP_ENV_FILE
sudoedit /opt/love-notes/.env
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml config --quiet
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 300 api
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml ps api
```

修改 `.env` 不会热生效，单纯 `restart` 不重新读取容器环境。`--force-recreate` 也保证仅修改 Worker 间隔等参数时应用会重新启动。重建会短暂中断服务；不要和 Jenkins 发布同时操作。

`compose.yml` 的网络、挂载等结构也可以在服务器编辑，再执行同一组校验/重建命令。发布不会覆盖服务器修改，但新版本若需要新的编排结构，须人工对照仓库模板合并，不能整份覆盖生产文件。

检查当前容器的真实镜像、健康和日志：

```bash
sudo docker inspect love-notes-api-1 --format '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}'
sudo docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml logs --tail=200 api
curl --fail http://127.0.0.1:8080/api/v1/actuator/health
curl --fail https://love.api.zhaoyisen.com.cn/api/v1/actuator/health
```

健康响应应包含 `"status":"UP"`。若修改了宿主机端口，相应调整本机 URL 和 Nginx 上游；默认仍仅监听 `127.0.0.1:8080`。HTTPS/Nginx、微信合法域名和私有 COS 的现有配置沿用。

应用模板约定和接口路径等协议常量仍在代码里。上传限制默认图片 20MB、视频 200MB/60 秒；调整服务端上限时还需同步客户端的校验，单改 `.env` 不会改变小程序内置限制。

## 5. 回滚

从 Jenkins 记录或 `docker image ls love-notes-server` 找到上一个健康的提交标签，使用同一份服务器配置：

```bash
unset APP_ENV_FILE
PREVIOUS_TAG=上一个提交短哈希
sudo env IMAGE_TAG="$PREVIOUS_TAG" docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml config --quiet
sudo env IMAGE_TAG="$PREVIOUS_TAG" docker compose --project-name love-notes --env-file /opt/love-notes/.env -f /opt/love-notes/compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 300 api
# 只在上一步成功、健康检查通过后执行：
sudo docker image tag "love-notes-server:$PREVIOUS_TAG" love-notes-server:production
```

如果故障源于配置，先从安全备份恢复相应文件，再执行校验和重建。不要删除数据卷、重建数据库或执行 `docker system prune -a` 丢失回滚镜像。

Flyway 随新容器自动迁移，应用回滚不会降级数据库。管理端使用隐藏功能后，回滚版本必须仍包含 `admin_hidden` 过滤，避免隐藏记录重新出现。

## 本地验证与服务器验收边界

```bash
node --test scripts/test-deployment.cjs
APP_ENV_FILE="$PWD/server/.env.example" docker compose --env-file server/.env.example config --quiet
```

自动检查覆盖文件不被改写、缺文件停止、配置/健康失败不更新别名，以及应用环境参数绑定。Docker 重建、Jenkins 挂载权限、真实 MySQL/Redis/COS/微信和小程序双账号媒体流程，需迁移后在实际服务器验收。

参考：[Docker env_file](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)、[Spring Boot 环境配置](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。
