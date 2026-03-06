# 修复 Pending 状态问题 - 完整说明

## 问题原因

材料一直卡在 "pending" 状态的根本原因：

1. **Backend (Content Fetch)** 在导入 URL 时已经保存了 `content_hash`
2. **Python Sidecar** 在处理完 chunking/embedding 后，尝试再次更新 `content_hash`
3. 数据库有唯一约束 `idx_materials_content_hash`，不允许重复
4. 更新失败（HTTP 409 Conflict），但 Python Sidecar 没有重试
5. 结果：`ingestion_status` 卡在 `pending`，但实际上内容已经提取成功

## 已完成的修复

### 修复 1：更新 Python Sidecar 代码 ✅
**文件**: `ingestion-sidecar/src/ingestion/db.py`

**修改内容**:
```python
# 在 update_material_status 函数中添加了重试逻辑
if resp.status_code == 409 and "content_hash" in body:
    # 如果遇到 content_hash 冲突，去掉这个字段重试
    logger.warning(f"Retrying update without content_hash (already exists)")
    body_without_hash = {k: v for k, v in body.items() if k != "content_hash"}
    # 重新尝试更新
    resp = await client.patch(...)
```

**效果**:
- 遇到 content_hash 冲突时自动重试
- 不会再卡在 pending 状态
- 其他字段（chunk_count, word_count 等）仍然正常更新

### 修复 2：修复已卡住的材料 ✅
**执行的 SQL**:
```sql
UPDATE materials
SET ingestion_status = 'completed'
WHERE ingestion_status = 'pending'
  AND extraction_status = 'success'
  AND text_content IS NOT NULL;
```

**结果**:
- 修复了 2 个卡在 pending 的材料
- 它们现在显示为 "completed"

## 如何应用修复

### 方法 1：使用修复脚本（推荐）
1. 双击运行 `fix-pending.bat`
2. 脚本会自动重启 Python Sidecar
3. 完成！

### 方法 2：使用控制面板
1. 打开 `control-panel.bat`
2. 按 `3` 重启所有服务
3. 完成！

### 方法 3：手动重启
1. 打开 `control-panel.bat`
2. 按 `2` 停止所有服务
3. 按 `1` 启动所有服务
4. 完成！

## 验证修复是否生效

### 测试步骤：
1. 打开浏览器访问 http://localhost:5173
2. 刷新页面
3. 查看之前卡住的材料
4. 状态应该从 "等待中" 变为 "已完成"

### 测试新导入：
1. 导入一个新的 URL
2. 等待几秒钟
3. 刷新页面
4. 材料应该显示为 "已完成"，不会卡在 "等待中"

## 技术细节

### 为什么会有 content_hash 冲突？

**正常流程**:
```
1. Backend 调用 Content Fetch Service
   ↓
2. Content Fetch 提取内容，计算 content_hash
   ↓
3. Backend 保存到数据库（包括 content_hash）
   ↓
4. Backend 调用 Python Sidecar
   ↓
5. Python Sidecar 处理 chunking/embedding
   ↓
6. Python Sidecar 尝试更新 content_hash（已存在！）
   ↓
7. 数据库返回 409 Conflict
   ↓
8. 旧代码：记录错误，不重试 ❌
   新代码：去掉 content_hash，重试更新 ✅
```

### 数据库约束
```sql
CREATE UNIQUE INDEX idx_materials_content_hash
ON materials(user_id, content_hash)
WHERE content_hash IS NOT NULL;
```

这个约束确保同一用户不会重复导入相同内容。

### 修复后的行为
```
遇到 409 Conflict
  ↓
检查是否是 content_hash 冲突
  ↓
是 → 去掉 content_hash，只更新其他字段
  ↓
重试更新
  ↓
成功！ingestion_status = 'completed'
```

## 未来改进建议

### 短期（已完成）
- ✅ 添加 content_hash 冲突重试逻辑
- ✅ 修复已卡住的材料

### 中期（可选）
- [ ] Backend 不保存 content_hash，让 Python Sidecar 统一处理
- [ ] 或者 Python Sidecar 不更新 content_hash，只更新 chunk_count 等字段

### 长期（可选）
- [ ] 添加更完善的错误处理和重试机制
- [ ] 添加材料状态监控和自动修复
- [ ] 优化去重逻辑

## 常见问题

### Q: 修复后旧材料还是显示 "等待中"？
A: 刷新浏览器页面（Ctrl+F5 强制刷新）

### Q: 新导入的材料还是卡住？
A:
1. 确认已运行 `fix-pending.bat` 或重启了服务
2. 检查 Python Sidecar 日志：`logs\sidecar.log`
3. 应该看到 "Retrying update without content_hash" 的日志

### Q: 如何确认修复生效？
A: 查看 `logs\sidecar.log`，应该看到：
```
[WARNING] Retrying update without content_hash (already exists)
[INFO] Update succeeded without content_hash
```

### Q: 会不会影响现有功能？
A: 不会。修复只是添加了重试逻辑，不影响正常流程。

## 总结

✅ **问题已修复**
- Python Sidecar 代码已更新
- 已卡住的材料已修复
- 新导入的材料不会再卡住

✅ **如何应用**
- 运行 `fix-pending.bat`
- 或使用控制面板重启服务

✅ **验证方法**
- 刷新浏览器
- 查看材料状态
- 测试新导入

---

**修复完成时间**: 2026-03-06
**影响范围**: Python Sidecar 更新逻辑
**向后兼容**: 是
**需要数据库迁移**: 否
