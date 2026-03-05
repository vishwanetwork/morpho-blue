import { formatUnits } from 'ethers';

export function formatAmount(amount: bigint, decimals: number = 18): string {
    if (amount === 0n) return '0.00';
    const str = formatUnits(amount, decimals);
    // Simple heuristic for formatting
    const [intPart, fracPart] = str.split('.');
    if (!fracPart) return str;
    if (fracPart.length > 4) {
        return `${intPart}.${fracPart.slice(0, 4)}`;
    }
    return str;
}

export function formatPercent(percentAmount: bigint): string {
    // Assuming LLTV comes as standard 18 decimal wad or similar representing typical 0.8 => 80%
    const str = formatUnits(percentAmount * 100n, 18);
    const [intPart, fracPart] = str.split('.');
    if (!fracPart || fracPart.startsWith('00')) return `${intPart}%`;
    return `${intPart}.${fracPart.slice(0, 2)}%`;
}
