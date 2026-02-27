/**
 * 数值夹紧工具函数 — 统一替代各文件中的重复定义。
 */

/** 将 value 限制在 [min, max] 范围内。 */
export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** clampNumber + Math.round，适用于只接受整数的参数。 */
export function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
}

/** clampNumber + 小数精度截断，precision 为小数位数。 */
export function clampDecimal(value: number, min: number, max: number, precision: number): number {
    if (!Number.isFinite(value)) return min;
    const factor = 10 ** precision;
    return Math.round(Math.min(max, Math.max(min, value)) * factor) / factor;
}
