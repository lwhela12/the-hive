export const QUARTERLY_DUES_AMOUNT = 25;
export const ANNUAL_DUES_AMOUNT = QUARTERLY_DUES_AMOUNT * 4;

export type DuesCoverage = 'none' | 'quarter' | 'year';

export type DuesPeriod = {
  year: number;
  quarter: number;
};

export type DuesTransactionCoverage = {
  dues_year?: number | null;
  dues_quarter?: number | null;
  dues_covered_quarters?: number | null;
};

export const getCurrentDuesPeriod = (date = new Date()): DuesPeriod => ({
  year: date.getFullYear(),
  quarter: Math.floor(date.getMonth() / 3) + 1,
});

export const getDuesPeriodStartDate = (period: DuesPeriod): Date =>
  new Date(period.year, (period.quarter - 1) * 3, 1);

export const isDuesPeriodStartDay = (
  date = new Date(),
  period = getCurrentDuesPeriod(date)
): boolean => {
  const startDate = getDuesPeriodStartDate(period);
  return date.getFullYear() === startDate.getFullYear()
    && date.getMonth() === startDate.getMonth()
    && date.getDate() === startDate.getDate();
};

export const getDuesAmountForCoverage = (coverage: DuesCoverage) => {
  if (coverage === 'quarter') return QUARTERLY_DUES_AMOUNT;
  if (coverage === 'year') return ANNUAL_DUES_AMOUNT;
  return null;
};

export const duesTransactionCoversQuarter = (
  row: DuesTransactionCoverage,
  period = getCurrentDuesPeriod()
) => {
  if (row.dues_year !== period.year) return false;
  if ((row.dues_covered_quarters ?? 0) >= 4) return true;
  if (!row.dues_quarter) return false;

  const coveredQuarters = row.dues_covered_quarters ?? 1;
  return period.quarter >= row.dues_quarter
    && period.quarter < row.dues_quarter + coveredQuarters;
};
