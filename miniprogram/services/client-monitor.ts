function safeText(value: unknown, max = 300): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text.replace(/[\r\n\t]+/g, " ").slice(0, max);
}

export function reportClientIssue(category: string, details: Record<string, unknown> = {}) {
  const payload = Object.keys(details).reduce((result, key) => {
    result[key] = safeText(details[key]);
    return result;
  }, {} as Record<string, string>);
  console.error(`[${category}]`, payload);
  try {
    const realtime = (wx as any).getRealtimeLogManager && (wx as any).getRealtimeLogManager();
    if (realtime && realtime.error) realtime.error(category.slice(0, 40), payload);
  } catch (_) {
    // 实时日志不可用时保留控制台日志，不影响用户主流程。
  }
}
