import React from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import CommonCurrencySymbol from '../common/CurrencySymbol';

/**
 * Dashboard currency wrapper.
 * Uses company currency from context and delegates rendering to the shared component.
 */
const CurrencySymbol = ({ className = '', style = {}, ...props }) => {
  const { companyCurrency } = useCurrency();

  return (
    <CommonCurrencySymbol
      code={companyCurrency?.code}
      symbol={companyCurrency?.symbol}
      className={className}
      style={style}
      {...props}
    />
  );
};

export default CurrencySymbol;
