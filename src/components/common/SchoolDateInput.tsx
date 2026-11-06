import React from 'react';
import { gregorianToSchoolDate, schoolDateToGregorian, type CalendarType } from '../../lib/ethiopian-calendar.ts';

interface SchoolDateInputProps {
  value: string;
  onChange: (gregorianIsoDate: string) => void;
  calendarType?: CalendarType;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export const SchoolDateInput: React.FC<SchoolDateInputProps> = ({
  value,
  onChange,
  calendarType = 'gregorian',
  className,
  required,
  disabled,
  ariaLabel
}) => {
  let displayValue = value;
  if (value) {
    try {
      displayValue = gregorianToSchoolDate(value, calendarType);
    } catch {
      // Keep an invalid in-progress edit visible so the parent save validator can reject it.
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={calendarType === 'ethiopian' ? 'YYYY-MM-DD (E.C.)' : 'YYYY-MM-DD'}
      value={displayValue}
      onChange={event => {
        const nextValue = event.target.value.trim();
        if (!nextValue) {
          onChange('');
          return;
        }
        try {
          onChange(schoolDateToGregorian(nextValue, calendarType));
        } catch {
          onChange(nextValue);
        }
      }}
      className={className}
    />
  );
};
