# 推送到 GitHub 指南

## 前提条件

1. **安装 Git**
   - 下载地址：https://git-scm.com/download/win
   - 安装时选择 "Add Git to PATH" 选项

2. **创建 GitHub 仓库**
   - 登录 GitHub (https://github.com)
   - 点击右上角 "+" -> "New repository"
   - 输入仓库名称（例如：reading-clipper-extension）
   - 不要初始化 README、.gitignore 或 license（因为项目已有文件）
   - 点击 "Create repository"

## 推送步骤

在项目根目录执行以下命令：

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件
git add .

# 3. 提交更改
git commit -m "Initial commit: Reading Clipper Extension"

# 4. 添加远程仓库（将 YOUR_USERNAME 和 YOUR_REPO_NAME 替换为你的实际值）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 5. 推送到 GitHub
git branch -M main
git push -u origin main
```

## 注意事项

- 如果 GitHub 仓库使用 SSH，将第 4 步的 URL 改为：`git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git`
- 首次推送可能需要输入 GitHub 用户名和密码（或使用 Personal Access Token）
- 如果遇到认证问题，建议使用 GitHub CLI 或配置 SSH 密钥
















