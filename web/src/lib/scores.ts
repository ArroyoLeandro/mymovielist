export const SCORE_LABELS = ['Horrible', 'Malo', 'Flojo', 'Regular', 'Pasable', 'Decente', 'Bueno', 'Muy bueno', 'Excelente', 'Obra maestra']
export const scoreTier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')
