import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: string };

export const PasswordInput: React.FC<PasswordInputProps> = ({ label = 'password', className = '', ...props }) => {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-10`} />
    <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} aria-pressed={visible} onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-[#64748B] hover:text-[#132A29] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#0F766E] rounded-r-lg">
      {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  </div>;
};
