# 修复 ChatGPT Windows 界面不显示问题

[English](README.en.md)

**这是一个非官方、源码公开的 Windows 修复工具，用于处理 ChatGPT/Codex Windows 正式版升级后“后台有进程，但界面不显示”的问题。**

它会在 `WindowsApps` 之外安全重建不完整的本地运行环境，保留仍可用的外置 `CODEX_CLI_PATH`，并且只重启正式版。仓库不包含、也不会从网络下载任何 OpenAI 可执行文件。

> [!IMPORTANT]
> **我已经在自己的 Windows x64 电脑上亲自遇到并复现了这个问题。本脚本经过两次真实升级测试，运行正常并成功恢复了 ChatGPT 界面；最近一次测试的正式版版本是 `26.917.6896.0`(2026-09-23)。**
>
> **如果你下载后仍未修好，请[提交 Bug Report Issue](../../issues/new?template=bug_report.yml)。请附上脱敏后的检查结果或日志，我会和你一起继续定位问题，并尽力完善脚本。**

> [!WARNING]
> 本项目依赖桌面应用的内部文件布局，而这不是公开的兼容性承诺。建议先审阅源码并运行 `--check`。未来应用更新可能需要同步修改本工具。

## 为什么会出现“后台有进程，但界面不显示”

**根据我对两次真实升级故障的现场检查和修复日志，直接原因是：升级后应用依赖的运行文件没有完整搬运或初始化到当前 Windows 用户可执行的本地目录，导致界面启动链停在后台进程阶段。**

ChatGPT/Codex 的 Microsoft Store 安装文件位于受保护的 `C:\Program Files\WindowsApps`，启动时还会使用 `%LOCALAPPDATA%\OpenAI\Codex` 下按版本生成的本地运行环境。在我遇到的两次故障中：

1. 第一次故障涉及应用内置 Codex CLI 的读取或执行，设置一个持久、有效的外置 `CODEX_CLI_PATH` 后恢复。
2. 后续升级又留下了不完整的 CUA Node 运行环境。脚本为正式版 `26.903.9818.0` 重新构建并核验了包含 4,052 个文件、共 261,658,315 字节的运行目录，重启后界面恢复显示。

这说明应用的后台进程本身可以先启动，但如果 Codex CLI 或 CUA Node 等依赖没有准备完整，后续初始化就可能无法完成，最终表现为任务管理器中有进程、桌面上却没有窗口。这里的因果判断来自修复前后的文件状态、脚本日志和恢复结果。

[OpenAI 官方 Windows 应用文档](https://learn.chatgpt.com/zh-Hans/docs/windows/windows-app)介绍了 Windows 原生应用；[官方故障排除说明](https://learn.chatgpt.com/zh-Hans/docs/reference/troubleshooting)也指出桌面应用与 CLI 可能捆绑不同版本的 Codex。**但 OpenAI 官方目前没有把这里描述的具体故障原因公布为适用于所有用户的统一结论，因此上面的说明是本项目基于实机证据作出的诊断。**

**相同的“后台有进程但界面不显示”现象也可能由其他原因造成。本工具只针对“更新后运行文件搬运或落盘不完整”这一类故障。**

**重置 `config.toml` 适用于另一类配置损坏问题；在本项目的两次实测中，它不是根因，因此脚本不会重置你的配置。**

## 使用条件

- Windows 已安装正式版 `OpenAI.Codex` AppX 应用
- `PATH` 中存在 Node.js 18 或更高版本
- 不需要管理员权限

完整修复流程已在 x64 正式版 `26.903.8094.0` 和 `26.903.9818.0` 上实机验证。代码包含 ARM64 包识别逻辑，但尚未实机测试。

## 快速使用

1. 下载或克隆本仓库。
2. 先执行只读检查：

   ```powershell
   .\Repair-ChatGPT.cmd --check
   ```

3. 如果提示需要修复，双击 `Repair-ChatGPT.cmd`，或运行：

   ```powershell
   .\Repair-ChatGPT.cmd
   ```

4. 请等待控制台显示 `Operation completed.` 后再关闭窗口。

请使用日常登录的 Windows 账户正常运行，不要选择“以管理员身份运行”，否则每用户环境变量可能被写入另一个 Windows 账户。

第一次处理某个新版本时，可能需要复制约 250–700 MB，耗时可能达到数分钟。

## 它会做什么

- 只选择包名完全等于 `OpenAI.Codex` 的正式版，不会选择 Beta。
- 根据当前安装包自带文件计算运行目录编号，不写死应用版本号。
- 检测 CUA 运行环境是否缺失或不完整，仅在需要时重建。
- 核验所有复制文件的大小，以及关键运行文件的 SHA-256。
- 保留仍然有效的外置 `CODEX_CLI_PATH`。
- 当该路径缺失、失效，或指向工具管理的过期引擎时，将应用自带 Codex 引擎复制到 `%LOCALAPPDATA%\OpenAI\Codex\bin`，并保存新的每用户路径。
- 只关闭可执行文件路径属于所检测正式包的进程，然后重新启动正式版。

## 它不会做什么

- 不联网。
- 不重置 `config.toml`。
- 不修改账号、项目、插件或对话数据。
- 不关闭 Beta，也不写入 Beta 安装目录。
- 不会静默删除不完整的运行目录；旧目录会被改名为 `.broken-*`，以便恢复和排查。

## 可用命令

```text
Repair-ChatGPT.cmd                 修复并重新启动
Repair-ChatGPT.cmd --check         只读检查
Repair-ChatGPT.cmd --no-launch     修复但不重新启动
node Repair-ChatGPT-Windows.mjs --self-test
node Repair-ChatGPT-Windows.mjs --help
node Repair-ChatGPT-Windows.mjs --version
```

`--install-root=PATH` 和 `--cli-path=PATH` 是用于夹具测试及安装包检查的开发参数。

## 日志与隐私

工具会在脚本旁边生成 `Repair-ChatGPT-Windows.log`。日志可能包含 Windows 用户名和本机路径。Git 已默认忽略日志文件，但在把日志附到 Issue 前，仍应手动隐去个人路径。

工具不会读取或输出 API Key、访问令牌、Cookie、密码或 ChatGPT 账号数据。

## 开发与验证

本项目没有 npm 依赖。

```powershell
npm run check:syntax
npm test
```

自测只使用操作系统中新建的临时目录，验证哈希、分块复制、目录核验和原子启用；不会检查或修改已经安装的应用。

报告问题或提交修改前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。严禁提交 OpenAI 二进制文件、解包的 `app.asar`、复制出来的 CUA 文件或私人日志。

## 许可证与免责声明

本仓库的原创代码采用 [MIT License](LICENSE)。

这是一个独立社区项目，与 OpenAI 没有隶属、背书或支持关系。OpenAI、ChatGPT 和 Codex 是其各自权利人的商标。本仓库不包含 OpenAI 应用二进制文件或应用源代码。
