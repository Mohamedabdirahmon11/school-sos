/**
 * Holds the one-time PINs from a bulk student PIN reset in memory only.
 *
 * The server never stores raw PINs, so if the screen that shows them is
 * re-rendered or remounted (a list refresh, a lazy-loaded screen swap) the
 * only copy would be lost. Keeping the slips here lets the wizard re-open on
 * the results screen until the admin explicitly closes it. Nothing is written
 * to localStorage/sessionStorage and a page reload clears it.
 */
export type PinSlip = { studentId: string; studentName: string; newPin: string };

let pendingSchoolId = '';
let pendingSlips: PinSlip[] = [];

export function setPendingPinSlips(schoolId: string | undefined, slips: PinSlip[]) {
  pendingSchoolId = schoolId || '';
  pendingSlips = slips.map(slip => ({ ...slip }));
}

export function getPendingPinSlips(schoolId: string | undefined): PinSlip[] {
  if (!pendingSlips.length || pendingSchoolId !== (schoolId || '')) return [];
  return pendingSlips.map(slip => ({ ...slip }));
}

export function clearPendingPinSlips() {
  pendingSchoolId = '';
  pendingSlips = [];
}
