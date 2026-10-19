/** BmApp `CurrentUserConditionsViewModel.isValidDecimalInput`: digits, one `.`/`,`, ≤ 8 decimals. */
const DECIMAL_INPUT = /^\d*([.,]\d{0,8})?$/;

export const isValidDecimalInput = (value: string) => DECIMAL_INPUT.test(value);
