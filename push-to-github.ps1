# 推送到 GitHub 的 PowerShell 脚本
# 使用方法：.\push-to-github.ps1 -GitHubUsername "你的用户名" -RepoName "仓库名"

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubUsername,
    
    [Parameter(Mandatory=$true)]
    [string]$RepoName
)

Write-Host "开始推送到 GitHub..." -ForegroundColor Green

# 检查 Git 是否安装
try {
    $gitVersion = git --version
    Write-Host "Git 已安装: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "错误: 未检测到 Git，请先安装 Git" -ForegroundColor Red
    Write-Host "下载地址: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# 检查是否已初始化 Git 仓库
if (-not (Test-Path .git)) {
    Write-Host "初始化 Git 仓库..." -ForegroundColor Yellow
    git init
} else {
    Write-Host "Git 仓库已存在" -ForegroundColor Green
}

# 添加所有文件
Write-Host "添加文件到暂存区..." -ForegroundColor Yellow
git add .

# 检查是否有更改需要提交
$status = git status --porcelain
if ($status) {
    Write-Host "提交更改..." -ForegroundColor Yellow
    git commit -m "Initial commit: Reading Clipper Extension"
} else {
    Write-Host "没有需要提交的更改" -ForegroundColor Yellow
}

# 设置主分支
git branch -M main

# 检查远程仓库是否已配置
$remote = git remote get-url origin -ErrorAction SilentlyContinue
if ($remote) {
    Write-Host "远程仓库已配置: $remote" -ForegroundColor Green
    Write-Host "是否要更新远程仓库地址? (Y/N)" -ForegroundColor Yellow
    $update = Read-Host
    if ($update -eq "Y" -or $update -eq "y") {
        git remote set-url origin "https://github.com/$GitHubUsername/$RepoName.git"
    }
} else {
    Write-Host "添加远程仓库..." -ForegroundColor Yellow
    git remote add origin "https://github.com/$GitHubUsername/$RepoName.git"
}

# 推送到 GitHub
Write-Host "推送到 GitHub..." -ForegroundColor Yellow
Write-Host "注意: 如果这是首次推送，可能需要输入 GitHub 用户名和密码（或 Personal Access Token）" -ForegroundColor Cyan
git push -u origin main

Write-Host "完成！" -ForegroundColor Green
















