/**
 * Chart of Accounts - Code Range Rules
 *
 * This file defines the standard account coding system used throughout the ledger.
 * All account-related services and tools must follow these rules.
 */

import { AccountType } from "./types";

/**
 * Account code ranges by account type
 */
export const ACCOUNT_CODE_RANGES = {
  [AccountType.ASSET]: { start: 1000, end: 1999, prefix: "1" },
  [AccountType.LIABILITY]: { start: 2000, end: 2999, prefix: "2" },
  [AccountType.EQUITY]: { start: 3000, end: 3999, prefix: "3" },
  [AccountType.REVENUE]: { start: 4000, end: 4999, prefix: "4" },
  [AccountType.EXPENSE]: { start: 5000, end: 5999, prefix: "5" },
} as const;

/**
 * Human-readable labels for account types (English)
 */
export const ACCOUNT_TYPE_LABELS_EN = {
  [AccountType.ASSET]: "Assets",
  [AccountType.LIABILITY]: "Liabilities",
  [AccountType.EQUITY]: "Equity",
  [AccountType.REVENUE]: "Revenue",
  [AccountType.EXPENSE]: "Expenses",
} as const;

/**
 * Human-readable labels for account types (Russian)
 */
export const ACCOUNT_TYPE_LABELS_RU = {
  [AccountType.ASSET]: "Assets",
  [AccountType.LIABILITY]: "Liabilities",
  [AccountType.EQUITY]: "Equity",
  [AccountType.REVENUE]: "Revenue",
  [AccountType.EXPENSE]: "Expenses",
} as const;

/**
 * System prompt text for LLM tools and services
 */
export const CHART_OF_ACCOUNTS_SYSTEM_PROMPT = `
Chart of Accounts Numbering System:
- 1xxx (1000-1999) = Assets - cash, accounts receivable, inventory, equipment
- 2xxx (2000-2999) = Liabilities - accounts payable, loans, accrued liabilities
- 3xxx (3000-3999) = Equity - share capital, retained earnings, investments
- 4xxx (4000-4999) = Revenue - sales revenue, other income, interest received
- 5xxx (5000-5999) = Expenses - cost of goods sold, salaries, rent, utilities, other expenses
`.trim();

/**
 * Compact version for tool descriptions
 */
export const CHART_OF_ACCOUNTS_SHORT =
  "1xxx=ASSET, 2xxx=LIABILITY, 3xxx=EQUITY, 4xxx=REVENUE, 5xxx=EXPENSE";

/**
 * Validate that account code matches account type
 */
export function validateAccountCode(
  code: string,
  accountType: AccountType
): {
  isValid: boolean;
  error?: string;
} {
  const range = ACCOUNT_CODE_RANGES[accountType];
  if (!range) {
    return { isValid: false, error: `Unknown account type: ${accountType}` };
  }

  const codePrefix = code.charAt(0);
  if (codePrefix !== range.prefix) {
    return {
      isValid: false,
      error:
        `Account code ${code} doesn't match account type ${accountType}. ` +
        `Expected code starting with ${range.prefix}xxx for ${accountType} accounts. ` +
        `Chart of accounts: ${CHART_OF_ACCOUNTS_SHORT}`,
    };
  }

  const codeNum = parseInt(code);
  if (isNaN(codeNum) || codeNum < range.start || codeNum > range.end) {
    return {
      isValid: false,
      error: `Account code ${code} is outside valid range ${range.start}-${range.end} for ${accountType}`,
    };
  }

  return { isValid: true };
}

/**
 * Get the expected prefix for an account type
 */
export function getAccountTypePrefix(accountType: AccountType): string {
  return ACCOUNT_CODE_RANGES[accountType]?.prefix || "";
}

/**
 * Get the account type from code prefix
 */
export function getAccountTypeFromCode(code: string): AccountType | null {
  const prefix = code.charAt(0);

  for (const [type, range] of Object.entries(ACCOUNT_CODE_RANGES)) {
    if (range.prefix === prefix) {
      return type as AccountType;
    }
  }

  return null;
}
