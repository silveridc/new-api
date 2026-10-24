/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * 服务器消息 i18n。
 *
 * 后端把面向 Web 控制台的消息以英文原文作为 message_key 下发（common.Message /
 * ApiErrorT 等），同时在 message 字段里保留渲染后的英文原文供 API 调用方使用；
 * 部分中间件响应只带稳定错误码 code（如安全验证失败），不带 message_key。
 * 新版前端用自身 locale 表在本地翻译这些 key，而 classic 的 i18n 采用
 * 「中文原文作 key」的习惯，无法直接命中英文 key，因此这里内置一张
 * 「英文 key → 中文」的静态映射表：key 取自后端实际下发的 message_key 全集
 * （与新版前端 zh 表一致），缺 key 或界面非中文时回退显示原始 message。
 */

import i18next from 'i18next';

// message_key（英文原文，含 {{param}} 占位符）→ 中文
const SERVER_MESSAGE_TRANSLATIONS = {
  "A channel test task is already running or queued. Cannot start this manual task": "已有通道测试任务正在运行或等待中，不能启动本次手动任务",
  "A model update task is already running or queued. Cannot start this manual task": "已有模型更新任务正在运行或等待中，不能启动本次手动任务",
  "A repair task is already running. Please try again later": "已经有一个修复任务在运行中，请稍后再试",
  "A token can select at most {{max}} Auto groups": "每个令牌最多可选择 {{max}} 个 Auto 分组",
  "API info #{{index}} URL cannot exceed 500 characters": "第{{index}}个API信息的URL长度不能超过500字符",
  "API info #{{index}} description cannot exceed 200 characters": "第{{index}}个API信息的说明长度不能超过200字符",
  "API info #{{index}} has an invalid color value": "第{{index}}个API信息的颜色值不合法",
  "API info #{{index}} is missing the URL field": "第{{index}}个API信息缺少URL字段",
  "API info #{{index}} is missing the color field": "第{{index}}个API信息缺少颜色字段",
  "API info #{{index}} is missing the description field": "第{{index}}个API信息缺少说明字段",
  "API info #{{index}} is missing the route description field": "第{{index}}个API信息缺少线路描述字段",
  "API info #{{index}} route description cannot exceed 100 characters": "第{{index}}个API信息的线路描述长度不能超过100字符",
  "API info cannot exceed 50 entries": "API信息数量不能超过50个",
  "Action {{action}}": "操作 {{action}}",
  "Adjusted by the channel adaptor": "渠道适配器计费调整",
  "Administrator completed the order, amount added: {{quota}}, payment amount: {{amount}}": "管理员补单成功，充值额度: {{quota}}，支付金额: {{amount}}",
  "Already checked in today": "今日已签到",
  "Announcement #{{index}} content cannot exceed 500 characters": "第{{index}}个公告的内容长度不能超过500字符",
  "Announcement #{{index}} has an invalid publish date format": "第{{index}}个公告的发布日期格式错误",
  "Announcement #{{index}} has an invalid type value": "第{{index}}个公告的类型值不合法",
  "Announcement #{{index}} is missing the content field": "第{{index}}个公告缺少内容字段",
  "Announcement #{{index}} is missing the publish date field": "第{{index}}个公告缺少发布日期字段",
  "Announcement #{{index}} note cannot exceed 100 characters": "第{{index}}个公告的说明长度不能超过100字符",
  "Announcement #{{index}} publish date cannot be empty": "第{{index}}个公告的发布日期不能为空",
  "Announcements cannot exceed 100 entries": "系统公告数量不能超过100个",
  "Audio input cost {{quota}}": "音频输入花费 {{quota}}",
  "Auto group {{group}} is duplicated": "Auto 分组 {{group}} 重复",
  "Auto group {{group}} is unavailable or unauthorized": "Auto 分组 {{group}} 不可用或无权访问",
  "Backup codes regenerated successfully": "备份代码重新生成成功",
  "Bark push URL cannot be empty": "Bark 推送 URL 不能为空",
  "Batch-adding Vertex AI keys requires a JSON array, for example {{example}}. Check the input: {{error}}": "批量添加 Vertex AI 必须使用标准的 JSON 数组格式，例如 {{example}}，请检查输入：{{error}}",
  "Billed per request": "按次计费",
  "Billing expressions must be a JSON object mapping models to expressions: {{error}}": "计费表达式配置必须是模型到表达式的 JSON 对象：{{error}}",
  "Billing parameters: {{params}}": "计算参数：{{params}}",
  "Binding successful": "绑定成功",
  "Bonus for inviting a user {{quota}}": "邀请用户赠送 {{quota}}",
  "Callback URL configuration error": "回调地址配置错误",
  "Cannot create users with permission level equal to or higher than yourself": "无法创建权限大于等于自己的用户",
  "Cannot delete super administrator account": "不能删除超级管理员账户",
  "Cannot delete the last key": "不能删除最后一个密钥",
  "Cannot demote super administrator user": "无法降级超级管理员用户",
  "Cannot disable super administrator user": "无法禁用超级管理员用户",
  "Cannot enable Turnstile verification. Enter the Turnstile settings first.": "无法启用 Turnstile 校验，请先填入 Turnstile 校验相关配置信息！",
  "Cannot enable WeChat login. Enter the WeChat login settings first.": "无法启用微信登录，请先填入微信登录相关配置信息！",
  "Cannot enable the email domain restriction. Enter the allowed email domains first.": "无法启用邮箱域名限制，请先填入限制的邮箱域名！",
  "Cannot enable {{provider}}. Enter the {{provider}} Client ID and Client Secret first.": "无法启用 {{provider}}，请先填入 {{provider}} 的 Client ID 和 Client Secret！",
  "Channel affinity settings are not initialized": "渠道亲和性设置未初始化",
  "Channel does not exist": "渠道不存在",
  "Check-in failed, please try again later": "签到失败，请稍后重试",
  "Check-in failed: quota update error": "签到失败：更新额度出错",
  "Check-in feature is not enabled": "签到功能未启用",
  "Check-in successful": "签到成功",
  "Compliance confirmation fields cannot be changed through the general settings API": "合规确认字段不允许通过通用设置接口修改",
  "Creem webhook is not configured": "Creem Webhook 未配置",
  "CreemProductId is not configured for this plan": "该套餐未配置 CreemProductId",
  "Custom reset cycle must be greater than 0 seconds": "自定义重置周期需大于0秒",
  "Daily check-in, received {{quota}}": "用户签到，获得额度 {{quota}}",
  "Database error, please contact the administrator": "数据库出错，请联系管理员",
  "Deleted {{count}} auto-disabled keys": "已删除 {{count}} 个自动禁用的密钥",
  "Deployment region cannot be empty": "部署地区不能为空",
  "Deployment region must be valid JSON, for example {{example}}": "部署地区必须是标准的 JSON 格式，例如 {{example}}",
  "Deployment region must include a default field": "部署地区必须包含 default 字段",
  "Disabled {{count}} keys": "已禁用 {{count}} 个密钥",
  "Discord ID is empty!": "Discord ID 为空！",
  "Downgrade group does not exist": "降级分组不存在",
  "Email address is already in use": "邮箱地址已被占用",
  "Email is empty!": "邮箱为空！",
  "Email or password is empty!": "邮箱地址或密码为空！",
  "Email verification is enabled, please enter email address and verification code": "管理员开启了邮箱验证，请输入邮箱地址和验证码",
  "Enabled {{count}} keys": "已启用 {{count}} 个密钥",
  "Enter the Discovery URL or Issuer URL first": "请先填写 Discovery URL 或 Issuer URL",
  "Expiration time cannot be earlier than current time": "过期时间不能早于当前时间",
  "FAQ #{{index}} answer cannot exceed 1000 characters": "第{{index}}个FAQ的答案长度不能超过1000字符",
  "FAQ #{{index}} is missing the answer field": "第{{index}}个FAQ缺少答案字段",
  "FAQ #{{index}} is missing the question field": "第{{index}}个FAQ缺少问题字段",
  "FAQ #{{index}} question cannot exceed 200 characters": "第{{index}}个FAQ的问题长度不能超过200字符",
  "FAQ cannot exceed 100 entries": "FAQ数量不能超过100个",
  "Failed to check user bindings, please try again later": "检查用户绑定时发生错误，请稍后重试",
  "Failed to copy channel. Please try again later": "复制渠道失败，请稍后重试",
  "Failed to count channel types. Please try again later": "获取渠道类型统计失败，请稍后重试",
  "Failed to count channels. Please try again later": "获取渠道数量失败，请稍后重试",
  "Failed to count tags. Please try again later": "获取标签数量失败，请稍后重试",
  "Failed to create default token": "创建默认令牌失败",
  "Failed to create order": "创建订单失败",
  "Failed to create redemption code, please try again later": "创建兑换码失败，请稍后重试",
  "Failed to create the Discovery request: {{error}}": "创建 Discovery 请求失败: {{error}}",
  "Failed to create the administrator account: {{error}}": "创建管理员账号失败: {{error}}",
  "Failed to create the plan product": "创建套餐产品失败",
  "Failed to encode Vertex AI key JSON: {{error}}": "Vertex AI 密钥 JSON 编码失败：{{error}}",
  "Failed to fetch Ollama version: {{error}}": "获取 Ollama 版本失败：{{error}}",
  "Failed to fetch channel. Please try again later": "获取渠道信息失败，请稍后重试",
  "Failed to fetch channels with this tag. Please try again later": "获取标签渠道失败，请稍后重试",
  "Failed to fetch channels. Please try again later": "获取渠道列表失败，请稍后重试",
  "Failed to fetch models: {{error}}": "获取模型列表失败：{{error}}",
  "Failed to fetch tags. Please try again later": "获取标签失败，请稍后重试",
  "Failed to fetch the Discovery configuration: {{error}}": "获取 Discovery 配置失败: {{error}}",
  "Failed to fetch the catalog": "拉取目录失败",
  "Failed to fetch the product list": "拉取产品列表失败",
  "Failed to generate default token": "生成默认令牌失败",
  "Failed to generate token": "生成令牌失败",
  "Failed to get the token count": "获取令牌数量失败",
  "Failed to get the user group": "获取用户分组失败",
  "Failed to initialize the system: {{error}}": "系统初始化失败: {{error}}",
  "Failed to parse appended keys: {{error}}": "追加密钥解析失败：{{error}}",
  "Failed to parse credentials. Please check the channel configuration": "解析凭证失败，请检查渠道配置",
  "Failed to parse the Discovery configuration: {{error}}": "解析 Discovery 配置失败: {{error}}",
  "Failed to parse tool prices: {{error}}": "解析工具价格失败：{{error}}",
  "Failed to query channels": "查询渠道失败",
  "Failed to query logs": "查询日志失败",
  "Failed to query statistics": "查询统计数据失败",
  "Failed to refresh credentials. Please try again later": "刷新凭证失败，请稍后重试",
  "Failed to regenerate backup codes": "重新生成备份代码失败",
  "Failed to save backup codes": "保存备用码失败",
  "Failed to save configuration": "保存配置失败",
  "Failed to save the demo site mode setting: {{error}}": "保存演示站点模式设置失败: {{error}}",
  "Failed to save the self-use mode setting: {{error}}": "保存自用模式设置失败: {{error}}",
  "Failed to search tokens": "搜索令牌失败",
  "Failed to search top-up records": "搜索充值记录失败",
  "Failed to set the audio completion ratio: {{error}}": "音频补全倍率设置失败：{{error}}",
  "Failed to set the audio ratio: {{error}}": "音频倍率设置失败：{{error}}",
  "Failed to set the cache creation ratio: {{error}}": "缓存创建倍率设置失败：{{error}}",
  "Failed to set the image ratio: {{error}}": "图片倍率设置失败：{{error}}",
  "Failed to start payment": "拉起支付失败",
  "Fetched successfully": "获取成功",
  "Fuzzy search keywords must be at least 2 characters long": "使用模糊搜索时，关键词长度至少为 2 个字符",
  "GC executed": "GC 已执行",
  "GitHub ID is empty!": "GitHub ID 为空！",
  "Gotify server URL cannot be empty": "Gotify 服务器地址不能为空",
  "Gotify token cannot be empty": "Gotify 令牌不能为空",
  "Group #{{index}} URL cannot exceed 500 characters": "第{{index}}个分组的URL长度不能超过500字符",
  "Group #{{index}} category name cannot exceed 50 characters": "第{{index}}个分组的分类名称长度不能超过50字符",
  "Group #{{index}} category name duplicates another group": "第{{index}}个分组的分类名称与其他分组重复",
  "Group #{{index}} description cannot exceed 200 characters": "第{{index}}个分组的描述长度不能超过200字符",
  "Group #{{index}} is missing the URL field": "第{{index}}个分组缺少URL字段",
  "Group #{{index}} is missing the category name field": "第{{index}}个分组缺少分类名称字段",
  "Group #{{index}} is missing the slug field": "第{{index}}个分组缺少Slug字段",
  "Group #{{index}} slug can only contain letters, numbers, underscores and hyphens": "第{{index}}个分组的Slug只能包含字母、数字、下划线和连字符",
  "Group #{{index}} slug cannot exceed 100 characters": "第{{index}}个分组的Slug长度不能超过100字符",
  "Group name already exists": "组名称已存在",
  "Group name and type cannot be empty": "组名称和类型不能为空",
  "Header override must be valid JSON format": "请求头覆盖必须是合法的 JSON 格式",
  "ID is empty": "ID 为空",
  "ID is empty!": "ID 为空！",
  "Image count {{count}}": "生成数量 {{count}}",
  "Inactive disk cache cleared": "不活跃的磁盘缓存已清理",
  "Insufficient balance": "余额不足",
  "Invalid Bark push URL": "无效的 Bark 推送 URL",
  "Invalid Discovery URL. Only http and https are supported": "Discovery URL 无效，仅支持 http/https",
  "Invalid Gotify server URL": "无效的 Gotify 服务器地址",
  "Invalid ID": "无效的 ID",
  "Invalid Passkey domain. Enter a domain without a scheme, port, path or wildcard.": "通行密钥域名无效。请填写域名，不包含协议、端口、路径或通配符。",
  "Invalid Passkey login state": "Passkey 登录状态异常",
  "Invalid Passkey verification request": "无效的 Passkey 验证请求",
  "Invalid Webhook URL": "无效的 Webhook 地址",
  "Invalid billing expression for model {{model}}: {{error}}": "模型 {{model}} 的计费表达式无效：{{error}}",
  "Invalid channel ID": "渠道ID格式错误",
  "Invalid channel settings format: {{error}}": "渠道额外设置格式错误：{{error}}",
  "Invalid email address": "无效的邮箱地址",
  "Invalid input": "输入不合法",
  "Invalid input {{error}}": "输入不合法 {{error}}",
  "Invalid parameters": "无效的参数",
  "Invalid provider ID": "无效的提供商 ID",
  "Invalid request": "无效的请求",
  "Invalid request parameter format": "请求参数格式错误",
  "Invalid request parameters: {{error}}": "无效的请求参数: {{error}}",
  "Invalid subscription ID": "无效的订阅ID",
  "Invalid top-up amount": "充值数量无效",
  "Invalid top-up quota": "无效的充值额度",
  "Invalid user ID": "无效的用户 ID",
  "Invalid warning type": "无效的预警类型",
  "Invitation code bonus {{quota}}": "使用邀请码赠送 {{quota}}",
  "Invitation quota is insufficient!": "邀请额度不足！",
  "Key deleted": "密钥已删除",
  "Key disabled": "密钥已禁用",
  "Key enabled": "密钥已启用",
  "Key index out of range": "密钥索引超出范围",
  "Legacy access tokens have been retired. Create a new access token in security settings": "旧版访问令牌已停用，请在安全设置中创建新的访问令牌",
  "Linux DO trust level does not meet the minimum required by administrator": "Linux DO 信任等级未达到管理员设置的最低信任等级",
  "Maximum 100 redemption codes can be generated at once": "一次兑换码批量生成的个数不能大于 100",
  "Maximum number of tokens reached ({{max}})": "已达到最大令牌数量限制 ({{max}})",
  "Minimum transfer quota is {{min}}!": "转移额度最小为{{min}}！",
  "Missing group ID": "缺少组 ID",
  "Missing model ID": "缺少模型 ID",
  "Missing parameter rule_name, or use all=true to clear everything": "缺少参数：rule_name，或使用 all=true 清空全部",
  "Missing vendor ID": "缺少供应商 ID",
  "Model fixed price {{model_price}}, group ratio {{group_ratio}}, action {{action}}": "模型固定价格 {{model_price}}，分组倍率 {{group_ratio}}，操作 {{action}}",
  "Model fixed price {{model_price}}, group ratio {{group_ratio}}, action {{action}}, ID {{id}}": "模型固定价格 {{model_price}}，分组倍率 {{group_ratio}}，操作 {{action}}，ID {{id}}",
  "Model name already exists": "模型名称已存在",
  "Model name cannot be empty": "模型名称不能为空",
  "Model name is too long: {{model}}": "模型名称过长：{{model}}",
  "Model price {{model_price}}, group ratio {{group_ratio}}": "模型价格 {{model_price}}，分组倍率 {{group_ratio}}",
  "Model ratio {{model_ratio}}, completion ratio {{completion_ratio}}, audio ratio {{audio_ratio}}, audio completion ratio {{audio_completion_ratio}}, group ratio {{group_ratio}}": "模型倍率 {{model_ratio}}，补全倍率 {{completion_ratio}}，音频倍率 {{audio_ratio}}，音频补全倍率 {{audio_completion_ratio}}，分组倍率 {{group_ratio}}",
  "Model ratios reset": "重置模型倍率成功",
  "Model test": "模型测试",
  "Model {{model}}": "模型 {{model}}",
  "Multi-key channels do not support balance queries": "多密钥渠道不支持余额查询",
  "New user registration has been disabled by administrator": "管理员关闭了新用户注册",
  "New user sign-up bonus {{quota}}": "新用户注册赠送 {{quota}}",
  "No Passkey is registered.": "尚未注册 Passkey。",
  "No auto-disabled keys to delete": "没有需要删除的自动禁用密钥",
  "No key index specified to delete": "未指定要删除的密钥索引",
  "No key index specified to disable": "未指定要禁用的密钥索引",
  "No key index specified to enable": "未指定要启用的密钥索引",
  "No keys to disable": "没有可禁用的密钥",
  "No permission to access users of same or higher level": "无权获取同级或更高等级用户的信息",
  "No permission to change the 2FA settings of users at the same or higher level": "无权操作同级或更高级用户的2FA设置",
  "No permission to update users of same or higher permission level": "无权更新同权限等级或更高权限等级的用户信息",
  "No valid upstream channel": "无有效上游渠道",
  "Not implemented yet": "尚未实现",
  "Not logged in": "未登录",
  "OAuth provider not found": "未找到该 OAuth 提供商",
  "OIDC ID is empty!": "OIDC ID 为空！",
  "Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}": "在线充值成功，充值额度: {{quota}}，支付金额: {{amount}}",
  "Order is not pending payment and cannot be completed": "订单状态不是待支付，无法补单",
  "Order number not provided": "未提供订单号",
  "Parameter override must be valid JSON format": "参数覆盖必须是合法的 JSON 格式",
  "Passkey authentication is disabled.": "Passkey 认证已关闭。",
  "Passkey registered successfully": "Passkey 注册成功",
  "Passkey removed successfully": "通行密钥已成功移除",
  "Passkey reset successfully": "通行密钥已成功重置",
  "Password login has been disabled by administrator": "管理员关闭了密码登录",
  "Password registration has been disabled by administrator, please use third-party account verification": "管理员关闭了通过密码进行注册，请使用第三方账户验证的形式进行注册",
  "Password reset link is invalid or has expired": "重置链接非法或已过期",
  "Passwords do not match": "密码不匹配",
  "Payment amount is too low": "充值金额过低",
  "Payment cancel redirect URL is not in the trusted domain list": "支付取消重定向URL不在可信任域名列表中",
  "Payment configuration error": "支付配置错误",
  "Payment information has not been configured by administrator": "当前管理员未配置支付信息",
  "Payment method does not exist": "支付方式不存在",
  "Payment success redirect URL is not in the trusted domain list": "支付成功重定向URL不在可信任域名列表中",
  "Payment, redemption, subscription, and invitation reward features are disabled. The administrator must confirm compliance terms before enabling them.": "支付、兑换码、订阅计划和邀请返利功能已禁用。管理员需先确认合规声明后方可启用。",
  "Plan amount is too low": "套餐金额过低",
  "Plan name cannot be empty": "套餐名称不能为空",
  "Plan price cannot be empty": "套餐价格不能为空",
  "Please confirm the compliance statement": "请确认合规声明",
  "Please select a product": "请选择产品",
  "Please wait before requesting another verification code.": "请稍后再请求验证码。",
  "Please wait {{seconds}} seconds before requesting another verification code.": "发送过于频繁，请等待 {{seconds}} 秒后再试",
  "Plugin metadata contains an unknown field \"{{field}}\". If this plugin was downloaded from the official marketplace, it may require a newer version of new-api. Try updating new-api and installing the plugin again.": "插件元数据包含未知字段“{{field}}”。如果插件来自官方市场，可能需要更高版本的 new-api。请尝试更新 new-api 后重新安装插件。",
  "Possibly an upstream timeout": "可能是上游超时",
  "Price cannot be negative": "价格不能为负数",
  "Price cannot exceed 9999": "价格不能超过9999",
  "Product configuration error": "产品配置错误",
  "Product does not exist": "产品不存在",
  "Provider created successfully": "提供商创建成功",
  "Provider deleted successfully": "提供商删除成功",
  "Provider updated successfully": "提供商更新成功",
  "Purchase limit cannot be negative": "购买上限不能为负数",
  "Purchase limit for this plan has been reached": "已达到该套餐购买上限",
  "Quality {{quality}}": "品质 {{quality}}",
  "Quota change amount cannot be zero": "额度变更量不能为 0",
  "Quota unit is misconfigured": "额度单位配置错误",
  "Quota value cannot be negative": "额度值不能为负数",
  "Quota value exceeds valid range, maximum is {{max}}": "额度值超出有效范围，最大值为 {{max}}",
  "Recalculated from tokens: tokens {{tokens}}, model ratio {{model_ratio}}, group ratio {{group_ratio}}, other multiplier {{other_multiplier}}": "按 token 重算：tokens {{tokens}}，模型倍率 {{model_ratio}}，分组倍率 {{group_ratio}}，其他倍数 {{other_multiplier}}",
  "Redemption code count must be greater than 0": "兑换码个数必须大于0",
  "Redemption code name length must be between 1-20": "兑换码名称长度必须在1-20之间",
  "Redemption failed, please try again later": "兑换失败，请稍后重试",
  "Redemption quota must be positive": "兑换码额度必须大于 0",
  "Regular administrators cannot promote other users to administrator": "普通管理员用户无法提升其他用户为管理员",
  "Review the affected Passkeys and confirm the domain removal. If the settings or impact have changed, confirmation is required again.": "请核对受影响的通行密钥并确认删除域名。配置或影响范围发生变化后，需要重新确认。",
  "SMTP server is not configured": "SMTP 服务器未配置",
  "Settings updated": "设置已更新",
  "Settled by the task usage expression": "按任务用量表达式结算",
  "Size {{size}}": "大小 {{size}}",
  "Some files could not be deleted ({{failed}}/{{total}})": "部分文件删除失败（{{failed}}/{{total}}）",
  "Statistics reset": "统计已重置",
  "Stripe is not configured or key is invalid": "Stripe 未配置或密钥无效",
  "Stripe webhook is not configured": "Stripe Webhook 未配置",
  "StripePriceId is not configured for this plan": "该套餐未配置 StripePriceId",
  "Subscription plan is not enabled": "套餐未启用",
  "Subscription plan title cannot be empty": "套餐标题不能为空",
  "Subscription purchased with balance, plan: {{plan}}, payment amount: {{amount}}, quota deducted: {{quota}}": "使用余额购买订阅成功，套餐: {{plan}}，支付金额: {{amount}}，扣除额度: {{quota}}",
  "Subscription purchased, plan: {{plan}}, payment amount: {{amount}}, payment method: {{method}}": "订阅购买成功，套餐: {{plan}}，支付金额: {{amount}}，支付方式: {{method}}",
  "System error: {{error}}": "系统错误: {{error}}",
  "System initialized successfully": "系统初始化成功",
  "Tag cannot be empty": "标签不能为空",
  "Telegram ID is empty!": "Telegram ID 为空！",
  "The Classic frontend has been removed. The theme can only be set to default": "Classic 前端已移除，主题只能设置为 default",
  "The access token lacks the required permission: {{scope}}": "访问令牌缺少所需权限：{{scope}}",
  "The action details are invalid.": "操作信息无效。",
  "The current sign-in method does not support security verification": "当前认证方式不支持安全验证",
  "The ratio config API is not enabled": "倍率配置接口未启用",
  "The search pattern can contain at most 2 % wildcards": "搜索模式中最多允许包含 2 个 % 通配符",
  "The search pattern cannot contain consecutive % wildcards": "搜索模式中不允许包含连续的 % 通配符",
  "The system is already initialized": "系统已经初始化完成",
  "The time range cannot exceed 1 month": "时间跨度不能超过 1 个月",
  "This API is deprecated": "该接口已废弃",
  "This OAuth provider still has linked users and cannot be deleted. Unbind all users first.": "该 OAuth 提供商还有用户绑定，无法删除。请先解除所有用户绑定。",
  "This Passkey domain is not available on this website. Use its original website or another verification method.": "此通行密钥域名无法在当前网站使用。请前往原网站或选择其他验证方式。",
  "This Telegram account is already bound.": "此 Telegram 账户已被绑定。",
  "This Telegram account is not linked. Sign in using another method and link it first.": "此 Telegram 账号尚未绑定，请先通过其他方式登录并绑定。",
  "This channel is not in multi-key mode": "该渠道不是多密钥模式",
  "This email address is already in use.": "此邮箱地址已被使用。",
  "This external account is already bound.": "此第三方账户已被绑定。",
  "This plan does not allow balance redemption": "该套餐不允许使用余额兑换",
  "This rule does not have include_rule_name enabled, so its cache cannot be cleared by rule": "该规则未启用 include_rule_name，无法按规则清空缓存",
  "This slug conflicts with a built-in OAuth provider": "该 Slug 与内置 OAuth 提供商冲突",
  "This slug is already in use": "该 Slug 已被使用",
  "This user account is disabled.": "此用户账户已被禁用。",
  "This user has no active subscription to this plan": "该用户没有有效的此套餐订阅",
  "This user is already a common user": "该用户已经是普通用户",
  "This user is already an administrator": "该用户已经是管理员",
  "This verification method is currently unavailable.": "此验证方式当前不可用。",
  "This verification method is not allowed for this action.": "此操作不允许使用该验证方式。",
  "This verification method requires its dedicated verification flow.": "此验证方式需要通过专用验证流程完成。",
  "This {{provider}} account cannot be linked to an existing account automatically, please sign in or register another way and then link {{provider}} in account settings": "无法自动将该 {{provider}} 账户关联到现有账户，请使用其他方式登录或注册后，在账户设置中绑定 {{provider}}",
  "This {{provider}} account has already been bound": "该 {{provider}} 账户已被绑定",
  "Token ID or user ID is empty": "令牌 ID 或用户 ID 为空",
  "Token IDs cannot be empty": "令牌 ID 不能为空",
  "Token count exceeds the limit. Only exact search is allowed, do not use the % wildcard": "令牌数量超过上限，仅允许精确搜索，请勿使用 % 通配符",
  "Token has expired and cannot be enabled. Please modify the expiration time or set it to never expire": "令牌已过期，无法启用，请先修改令牌过期时间，或者设置为永不过期",
  "Token name is too long": "令牌名称过长",
  "Token quota is exhausted and cannot be enabled. Please modify the remaining quota or set it to unlimited": "令牌可用额度已用尽，无法启用，请先修改令牌剩余额度，或者设置为无限额度",
  "Too many email requests. Please wait {{seconds}} seconds and try again.": "邮件发送过于频繁，请等待 {{seconds}} 秒后再试",
  "Too many items in batch request, maximum is {{max}}": "批量请求数量过多，最多 {{max}} 条",
  "Tool prices must be a JSON object": "工具价格必须是 JSON 对象",
  "Top-up amount cannot be less than {{min}}": "充值数量不能小于 {{min}}",
  "Top-up amount cannot exceed {{max}}": "充值数量不能大于 {{max}}",
  "Top-up is processing, please try again later": "充值处理中，请稍后重试",
  "Top-up order does not exist": "充值订单不存在",
  "Top-up quota exceeds the range the system can represent": "充值额度超出系统可表示范围",
  "Top-up quota limit exceeded": "超出充值额度上限",
  "Top-up quota must be greater than 0": "充值额度必须大于 0",
  "Topped up {{quota}} with a redemption code, code ID {{id}}": "通过兑换码充值 {{quota}}，兑换码ID {{id}}",
  "Total quota cannot be negative": "总额度不能为负数",
  "Transfer failed {{error}}": "划转失败 {{error}}",
  "Transfer successful": "转账成功",
  "Turnstile token is empty": "Turnstile token 为空",
  "Turnstile verification failed, please refresh and try again!": "Turnstile 校验失败，请刷新重试！",
  "Two-factor authentication disabled": "两因素认证已禁用",
  "Two-factor authentication is already enabled.": "两步验证已启用。",
  "Two-factor authentication is not enabled.": "两步验证尚未启用。",
  "Two-factor authentication is temporarily locked.": "两步验证已暂时锁定。",
  "Two-factor authentication reset": "两因素认证已重置",
  "URL must start with http:// or https://": "URL 必须以 http:// 或 https:// 开头",
  "Unable to create the Passkey credential": "无法创建 Passkey 凭证",
  "Unauthorized, insufficient privileges": "无权进行此操作，权限不足",
  "Unauthorized, invalid access token": "无权进行此操作，access token 无效",
  "Unauthorized, invalid user info": "无权进行此操作，用户信息无效",
  "Unauthorized, not logged in and no access token provided": "无权进行此操作，未登录且未提供 access token",
  "Unauthorized, the access token has expired": "访问令牌已过期",
  "Unbound successfully": "解绑成功",
  "Unknown rule name": "未知规则名称",
  "Unknown setting type: {{type}}": "未知的设置类型：{{type}}",
  "Unsupported add mode": "不支持的添加模式",
  "Unsupported operation": "不支持的操作",
  "Unsupported payment channel": "不支持的支付渠道",
  "Unsupported payment method": "不支持的支付方式",
  "Update failed": "更新失败",
  "Update successful": "更新成功",
  "Upgrade group does not exist": "升级分组不存在",
  "Upstream returned no usage": "上游无计费信息",
  "Upstream returned no usage, so nothing was charged (possibly an upstream timeout)": "上游没有返回计费信息，无法扣费（可能是上游超时）",
  "Uptime Kuma groups cannot exceed 20 entries": "Uptime Kuma分组数量不能超过20个",
  "User does not exist": "用户不存在",
  "User group will be reverted to {{group}}": "用户分组将回退到 {{group}}",
  "User group will be upgraded to {{group}}": "用户分组将升级到 {{group}}",
  "User has been banned": "用户已被封禁",
  "User has been deleted": "用户已注销",
  "User registration failed or user ID retrieval failed": "用户注册失败或用户ID获取失败",
  "Username already exists or has been deleted": "用户名已存在，或已注销",
  "Username must be {{max}} characters or fewer": "用户名长度不能超过{{max}}个字符",
  "Username or password is incorrect, or user has been banned": "用户名或密码错误，或用户已被封禁",
  "Verification code is incorrect or has expired": "验证码错误或已过期",
  "Verification does not match this action.": "验证与此操作不匹配。",
  "Verification failed. Please try again.": "验证失败，请重试。",
  "Verification flow expired": "验证流程已过期",
  "Vertex AI keys for batch adding cannot be empty": "批量添加 Vertex AI 的密钥不能为空",
  "Violation fee charged": "已收取违规费用",
  "Waffo Pancake configuration is incomplete": "Waffo Pancake 配置不完整",
  "Waffo Pancake credentials are not configured": "Waffo Pancake 凭证未配置",
  "Waffo Pancake is not configured or key is invalid": "Waffo Pancake 未配置或密钥无效",
  "Waffo Pancake is not fully configured. Complete the gateway binding in payment settings first.": "Waffo Pancake 未完成配置，请先在支付设置中完成网关绑定",
  "Waffo payment is not enabled": "Waffo 支付未启用",
  "WaffoPancakeProductId is not configured for this plan": "该套餐未配置 WaffoPancakeProductId",
  "Wallet quota limit exceeded": "超出钱包额度范围",
  "Warning threshold must be greater than 0": "预警阈值必须大于 0",
  "WeChat ID is empty!": "微信 ID 为空！",
  "Webhook URL cannot be empty": "Webhook 地址不能为空",
  "You do not have permission to perform this action.": "你没有执行此操作的权限。",
  "invalid or duplicate selection": "所选记录无效或存在重复",
  "select a saved target vendor": "请选择已保存的目标供应商",
  "select a saved vendor": "请选择已保存的供应商",
  "select between 1 and 1000 records": "请选择 1 到 1000 条记录",
  "target vendor cannot also be a source": "目标供应商不能同时作为源供应商",
  "unsupported vendor operation": "不支持的供应商操作",
  "vendor data changed; preview again before applying": "供应商数据已变更，请重新预览后再执行",
  "vendor does not exist": "供应商不存在",
  "vendor name already exists": "供应商名称已存在",
  "vendor name and icon must not exceed 128 characters": "供应商名称与图标长度不能超过 128 个字符",
  "vendor name is required": "供应商名称不能为空",
  "vendors are still referenced by models; transfer or clear their assignments first": "供应商仍被模型引用，请先转移或清空关联",
  "rule_name cannot be empty": "rule_name 不能为空",
  "{{name}} called {{count}} times, cost {{quota}}": "{{name}} 调用 {{count}} 次，调用花费 {{quota}}",
  "{{provider}} login and registration has not been enabled by administrator": "管理员未开启通过 {{provider}} 登录以及注册",
  "{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}": "{{provider}} 充值成功，充值额度: {{quota}}，支付金额: {{amount}}",
  // oauth/types.go 的 7 条授权登录错误文案：后端下发 message_key + message_params，
  // 缺 provider/field 时中文会露出占位符，所以必须成对补齐。
  "Invalid authorization code": "授权码无效",
  "Failed to get token from {{provider}}, please check settings": "从 {{provider}} 获取令牌失败，请检查系统设置",
  "{{provider}} returned empty user info, please check settings": "{{provider}} 返回的用户信息为空，请检查系统设置",
  "Unable to connect to {{provider}} server, please try again later": "无法连接 {{provider}} 服务器，请稍后重试",
  "Failed to get user information": "获取用户信息失败",
  "{{provider}} settings are incomplete, please fill in {{field}} in system settings first": "{{provider}} 配置不完整，请先在系统设置中填写 {{field}}",
  "Server Address must be a valid http(s) URL for {{provider}} to build the sign-in callback address": "{{provider}} 需要有效的服务器地址（http/https）才能构造登录回调地址",
};

// 稳定错误码 → 中文（后端 securityProofError 等只带 code 不带 message_key 的响应）
const SERVER_ERROR_CODE_TRANSLATIONS = {
  "TELEGRAM_OAUTH_NOT_CONFIGURED": "Telegram OAuth 尚未配置或启用，请联系管理员。",
  "TELEGRAM_OAUTH_CONFLICT": "telegram 是保留的 OAuth 提供方名称，请联系管理员重命名冲突的自定义提供方。",
  "TELEGRAM_OAUTH_FAILED": "Telegram 授权失败，请重试。",
  "TELEGRAM_ACCOUNT_NOT_BOUND": "此 Telegram 账号尚未绑定，请先通过其他方式登录并绑定。",
  "TELEGRAM_LEGACY_AUTH_REMOVED": "Telegram 登录方式已更新，请刷新页面并重新发起 Telegram OAuth 登录。",
  "AUTH_INTERNAL_ERROR": "请稍后再试。",
  "SECURITY_VERIFICATION_FAILED": "验证失败，请重试。",
  "PASSKEY_RP_ID_UNAVAILABLE": "此通行密钥域名无法在当前网站使用。请前往原网站或选择其他验证方式。",
  "PASSKEY_RP_ID_INVALID": "通行密钥域名无效。请填写域名，不包含协议、端口、路径或通配符。",
  "SECURITY_VERIFICATION_FLOW_REQUIRED": "此验证方式需要通过专用验证流程完成。",
  "SECURITY_VERIFICATION_LOCKED": "两步验证已暂时锁定。",
  "OAUTH_ACCOUNT_MISMATCH": "此 OAuth 账号与已绑定的账号不一致。",
  "TWOFA_CODE_INVALID": "认证器验证码错误。",
  "TWOFA_ALREADY_ENABLED": "两步验证已启用。",
  "TWOFA_NOT_ENABLED": "两步验证尚未启用。",
  "PASSKEY_NOT_FOUND": "尚未注册 Passkey。",
  "AUTH_FLOW_INVALID": "验证流程已过期",
  "SECURITY_PROOF_REQUIRED": "需要进一步验证",
  "SECURITY_PROOF_EXPIRED": "安全验证已过期，请重新验证。",
  "SECURITY_PROOF_INVALID": "安全验证已失效，请重新验证。",
  "SECURITY_PROOF_SCOPE_MISMATCH": "验证与此操作不匹配。",
  "SECURITY_PROOF_CONSUMED": "此验证凭证已使用，请重新验证。",
  "SECURITY_PROOF_CONTEXT_MISMATCH": "验证与本次操作的具体内容不匹配，请重新验证。",
  "SECURITY_CONTEXT_INVALID": "操作信息无效。",
  "SECURITY_ACTION_FORBIDDEN": "你没有执行此操作的权限。",
  "SECURITY_PROOF_METHOD_MISMATCH": "此操作不允许使用该验证方式。",
  "SECURITY_METHOD_UNAVAILABLE": "此验证方式当前不可用。",
  "TWOFA_SETUP_INVALID": "两步验证设置已过期或变更，请重新设置。",
  "AUTH_SESSION_LIMIT": "活跃登录会话数量已达上限。请在一台已登录的设备上打开“登录会话”，使用“退出其他登录会话”将其撤销。如果无法访问任何已登录设备，请重置密码以退出所有会话。",
  "AUTH_SESSION_ISSUANCE_LIMIT": "近期创建的登录会话过多。请等待滚动时间窗口结束后再试。",
  "TELEGRAM_BIND_DISABLED": "Telegram 绑定已禁用。",
  "TELEGRAM_BIND_INVALID_REQUEST": "Telegram 授权请求无效或已过期。",
  "TELEGRAM_BIND_FLOW_INVALID": "此 Telegram 绑定请求已过期或已使用。",
  "TELEGRAM_BIND_SESSION_INVALID": "发起此 Telegram 绑定的登录会话已失效。",
  "TELEGRAM_BIND_ALREADY_BOUND": "此 Telegram 账户已被绑定。",
  "TELEGRAM_BIND_USER_DELETED": "此用户账户已不存在。",
  "TELEGRAM_BIND_USER_DISABLED": "此用户账户已被禁用。",
  "TELEGRAM_BIND_INTERNAL_ERROR": "Telegram 绑定失败，请重试。",
};

// 界面语言为中文时才查表；其它语言直接显示英文原文（与旧行为一致）
function shouldTranslateServerText() {
  const language = (i18next.language || '').toLowerCase();
  return language.startsWith('zh');
}

// 用 params 填充模板里的 {{name}} 占位符；缺失的占位符保持原样
function interpolateServerMessage(template, params) {
  if (!params || typeof params !== 'object') {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = params[name];
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
}

/**
 * 翻译后端以英文原文下发的文本（message_key、日志 content_parts 的 key、
 * 渠道测试的 token_name 等）。映射表没有的文本原样返回，保证上游报错、
 * 管理员自定义文案等不受影响。
 */
export function translateServerText(text, params) {
  if (typeof text !== 'string' || text === '' || !shouldTranslateServerText()) {
    return text;
  }
  const translation = SERVER_MESSAGE_TRANSLATIONS[text];
  if (translation === undefined) {
    return text;
  }
  return interpolateServerMessage(translation, params);
}

/**
 * 翻译响应体/错误对象携带的服务器消息：优先 message_key + message_params，
 * 其次稳定错误码 code。返回 undefined 表示没有可翻译的内容，调用方继续
 * 使用原始 message。
 */
export function getServerMessage(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  // 兼容直接传入 axios 错误对象的情况
  const body =
    value.response && typeof value.response === 'object' ? value.response.data : value;
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  if (typeof body.message_key === 'string' && body.message_key !== '') {
    const translated = translateServerText(body.message_key, body.message_params);
    if (translated !== body.message_key) {
      return translated;
    }
    // message_key 未命中映射表时再尝试错误码兜底
  }
  if (typeof body.code === 'string' && body.code !== '') {
    const byCode = SERVER_ERROR_CODE_TRANSLATIONS[body.code];
    if (byCode !== undefined) {
      return byCode;
    }
  }
  return undefined;
}

/**
 * 翻译使用日志 other.content_parts（后端存英文 key + params 的结构化内容）。
 * 没有 content_parts 时返回 null，调用方回退显示原始 content 字段。
 * 注意与 helpers/render.jsx 面向消费日志的 renderLogContent 区分。
 */
export function renderLogContentParts(other) {
  if (!other || typeof other !== 'object' || !Array.isArray(other.content_parts)) {
    return null;
  }
  const parts = other.content_parts
    .filter(
      (part) =>
        part &&
        typeof part === 'object' &&
        typeof part.key === 'string' &&
        part.key !== '',
    )
    .map((part) => translateServerText(part.key, part.params));
  if (parts.length === 0) {
    return null;
  }
  return parts.join(', ');
}
