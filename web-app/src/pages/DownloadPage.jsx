import { Download, Chrome, ExternalLink, CheckCircle, ArrowRight, BookOpen, Zap, Shield } from 'lucide-react';

function DownloadPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
          <Download className="w-7 h-7 text-primary-500" />
          下载与安装
        </h1>
        <p className="text-surface-500 mt-1">
          安装浏览器扩展，开始使用 Reading Clipper
        </p>
      </div>

      {/* 安装步骤 */}
      <div className="bg-white rounded-xl border border-surface-100 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-surface-900 flex items-center gap-2">
          <Chrome className="w-5 h-5 text-primary-500" />
          Chrome / Edge 浏览器扩展
        </h2>

        <div className="space-y-4">
          {/* 步骤1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">下载扩展文件</h3>
              <p className="text-sm text-surface-600 mb-3">
                从 GitHub Releases 或项目仓库下载扩展的 ZIP 文件
              </p>
              <a
                href="https://github.com/your-repo/reading-clipper-extension/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                下载扩展
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 步骤2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">解压文件</h3>
              <p className="text-sm text-surface-600 mb-3">
                将下载的 ZIP 文件解压到一个固定位置（建议不要删除解压后的文件夹）
              </p>
              <div className="bg-surface-50 rounded-lg p-3 font-mono text-sm text-surface-700">
                reading-clipper-extension/
                <br />
                ├── manifest.json
                <br />
                ├── background.js
                <br />
                └── ...
              </div>
            </div>
          </div>

          {/* 步骤3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">打开扩展管理页面</h3>
              <p className="text-sm text-surface-600 mb-3">
                在浏览器地址栏输入以下地址，或通过菜单进入扩展管理页面
              </p>
              <div className="space-y-2">
                <div className="bg-surface-50 rounded-lg p-3">
                  <div className="text-xs text-surface-500 mb-1">Chrome:</div>
                  <code className="text-sm text-surface-700">chrome://extensions/</code>
                </div>
                <div className="bg-surface-50 rounded-lg p-3">
                  <div className="text-xs text-surface-500 mb-1">Edge:</div>
                  <code className="text-sm text-surface-700">edge://extensions/</code>
                </div>
              </div>
            </div>
          </div>

          {/* 步骤4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                4
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">启用开发者模式</h3>
              <p className="text-sm text-surface-600 mb-3">
                在扩展管理页面的右上角，打开"开发者模式"开关
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>注意：</strong>开发者模式允许安装未发布的扩展，请确保只安装可信来源的扩展
                </p>
              </div>
            </div>
          </div>

          {/* 步骤5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                5
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">加载扩展</h3>
              <p className="text-sm text-surface-600 mb-3">
                点击"加载已解压的扩展程序"，选择解压后的扩展文件夹
              </p>
              <div className="bg-surface-50 rounded-lg p-3">
                <p className="text-sm text-surface-700">
                  选择包含 <code className="bg-white px-1 py-0.5 rounded">manifest.json</code> 的文件夹
                </p>
              </div>
            </div>
          </div>

          {/* 步骤6 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">
                6
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-surface-900 mb-1">完成安装</h3>
              <p className="text-sm text-surface-600 mb-3">
                扩展安装成功后，浏览器工具栏会显示 Reading Clipper 图标
              </p>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                扩展已成功安装
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 使用指南 */}
      <div className="bg-white rounded-xl border border-surface-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-500" />
          使用指南
        </h2>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Zap className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-surface-900 mb-1">快速开始</h3>
              <p className="text-sm text-surface-600">
                在网页上选中文本，右键点击选择"保存为知识卡片"，或点击扩展图标打开控制面板
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-surface-900 mb-1">登录账号</h3>
              <p className="text-sm text-surface-600">
                首次使用需要在本页面登录账号，卡片数据会同步到云端
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 常见问题 */}
      <div className="bg-white rounded-xl border border-surface-100 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900">常见问题</h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-surface-900 mb-1">Q: 扩展安装后无法使用？</h3>
            <p className="text-sm text-surface-600">
              A: 请确保已在本页面登录账号，并检查扩展是否已启用。如果问题仍然存在，请尝试重新加载扩展。
            </p>
          </div>

          <div>
            <h3 className="font-medium text-surface-900 mb-1">Q: 如何更新扩展？</h3>
            <p className="text-sm text-surface-600">
              A: 下载新版本的扩展文件，在扩展管理页面点击"重新加载"按钮即可更新。
            </p>
          </div>

          <div>
            <h3 className="font-medium text-surface-900 mb-1">Q: 支持哪些浏览器？</h3>
            <p className="text-sm text-surface-600">
              A: 目前支持基于 Chromium 的浏览器（Chrome、Edge、Brave 等）。Firefox 版本正在开发中。
            </p>
          </div>

          <div>
            <h3 className="font-medium text-surface-900 mb-1">Q: 数据存储在哪里？</h3>
            <p className="text-sm text-surface-600">
              A: 所有数据存储在云端，支持多设备同步。你也可以在设置中配置使用自己的 API 和存储服务。
            </p>
          </div>
        </div>
      </div>

      {/* 获取帮助 */}
      <div className="bg-primary-50 rounded-xl border border-primary-200 p-6">
        <h3 className="font-medium text-primary-900 mb-2">需要帮助？</h3>
        <p className="text-sm text-primary-700 mb-4">
          如果遇到问题，可以查看文档或联系支持团队
        </p>
        <div className="flex gap-3">
          <a
            href="https://github.com/your-repo/reading-clipper-extension"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            查看文档
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href="https://github.com/your-repo/reading-clipper-extension/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
          >
            提交问题
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default DownloadPage;


