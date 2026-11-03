/**
 * Read-Only & Grace Period Banner Component
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AlertCircle, Clock, ShieldAlert } from 'lucide-react';

interface ReadOnlyBannerProps {
  onRenewClick?: () => void;
}

export const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({ onRenewClick }) => {
  const { school, t } = useAuth();
  if (!school) return null;

  const status = school.subscription?.status || 'read_only';

  if (status === 'read_only') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between gap-3 text-red-900 text-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> {t('read_only_banner')}
          </span>
        </div>
        {onRenewClick && (
          <button
            onClick={onRenewClick}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium shrink-0 transition-colors"
          >
            {t('renew_subscription')}
          </button>
        )}
      </div>
    );
  }

  if (status === 'grace') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-amber-900 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Grace Period:</strong> Your subscription has ended. You have {school.subscription?.graceDays ?? 0} grace days remaining before access enters Read-Only.
          </span>
        </div>
        {onRenewClick && (
          <button
            onClick={onRenewClick}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium shrink-0 transition-colors"
          >
            {t('renew_subscription')}
          </button>
        )}
      </div>
    );
  }

  return null;
};
