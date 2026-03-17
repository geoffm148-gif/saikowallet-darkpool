import { useState, useCallback } from 'react';

let _currency = 'USD';

export function useCurrency() {
  const [currency, setCurrencyState] = useState(_currency);

  const setCurrency = useCallback((code: string) => {
    _currency = code;
    setCurrencyState(code);
  }, []);

  return { currency, setCurrency } as const;
}

export function getCurrency(): string {
  return _currency;
}
