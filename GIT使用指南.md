# Git 使用指南

## ✅ 检查是否成功连接到 GitHub

### 方法 1：在浏览器中检查（最简单）
1. 打开浏览器访问：https://github.com/AlexZWANG1/reading-clipper-extension
2. 如果能看到你的代码文件，说明推送成功！

### 方法 2：使用 Git 命令检查

```powershell
# 检查远程分支
git branch -r

# 检查本地分支与远程的关联
git branch -vv

# 查看远程仓库信息
git remote -v

# 获取远程仓库的所有分支
git ls-remote origin
```

如果看到 `origin/main` 或 `main` 分支显示 `[origin/main]`，说明推送成功。

## 📝 日常使用 Git 的常用命令

### 1. 查看状态
```powershell
git status                    # 查看当前工作区状态
git log --oneline -10        # 查看最近10条提交记录
```

### 2. 提交更改
```powershell
git add .                     # 添加所有更改的文件
git add 文件名                # 添加特定文件
git commit -m "提交说明"      # 提交更改
git push                      # 推送到 GitHub
```

### 3. 拉取更新
```powershell
git pull                      # 从 GitHub 拉取最新代码
```

### 4. 查看差异
```powershell
git diff                      # 查看工作区的更改
git diff --staged             # 查看已暂存的更改
```

## 🔄 完整工作流程示例

```powershell
# 1. 查看当前状态
git status

# 2. 添加更改的文件
git add .

# 3. 提交更改（写清楚做了什么）
git commit -m "添加了新功能：xxx"

# 4. 推送到 GitHub
git push

# 5. 如果需要拉取远程更新
git pull
```

## 🔍 当前项目状态检查

运行以下命令检查当前状态：

```powershell
# 检查是否有未提交的更改
git status

# 检查本地和远程的同步状态
git fetch
git status

# 查看提交历史
git log --oneline --graph -10
```

## ⚠️ 注意事项

1. **每次推送前先检查状态**：使用 `git status` 查看有哪些文件被修改
2. **提交信息要清晰**：`git commit -m "描述性的提交信息"`
3. **定期拉取更新**：如果多人协作，先 `git pull` 再 `git push`
4. **不要提交敏感信息**：确保 `.gitignore` 已正确配置

## 🆘 常见问题

### 问题：推送时提示需要认证
**解决**：你的 token 已经配置在远程 URL 中，应该可以直接推送。

### 问题：提示 "repository not found"
**解决**：检查仓库名称是否正确，确保在 GitHub 上已创建仓库。

### 问题：提示 "non-fast-forward"
**解决**：远程有新的提交，先执行 `git pull` 合并后再推送。







