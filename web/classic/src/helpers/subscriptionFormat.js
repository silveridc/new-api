export function formatSubscriptionDuration(plan, t) {
  const unit = plan?.duration_unit || 'month';
  const value = plan?.duration_value || 1;
  const unitLabels = {
    year: t('年'),
    month: t('个月'),
    day: t('天'),
    hour: t('小时'),
    custom: t('自定义'),
  };
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    return `${seconds} ${t('秒')}`;
  }
  return `${value} ${unitLabels[unit] || unit}`;
}

export function formatSubscriptionResetPeriod(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
}

// 与后端扣费同口径（model/subscription.go:745-756 calcSubscriptionBalanceQuota）：
// 后端用 decimal 做 ceil，这里必须先消掉浮点尾差再向上取整，
// 否则 4.03 × 500000 在 JS 里是 2015000.0000000002，会多算 1 个额度、
// 把「刚好够付」误判成余额不足。
export const DEFAULT_QUOTA_PER_UNIT = 500 * 1000;

export function getSubscriptionBalanceQuota(priceAmount, quotaPerUnit) {
  const price = Number(priceAmount || 0);
  if (!(price > 0)) return 0;
  const perUnit = Number(quotaPerUnit);
  // status 未就绪时 localStorage 里的 quota_per_unit 可能取不到，退回后端默认值。
  const unit = perUnit > 0 ? perUnit : DEFAULT_QUOTA_PER_UNIT;
  return Math.ceil(Number((price * unit).toPrecision(12)));
}
