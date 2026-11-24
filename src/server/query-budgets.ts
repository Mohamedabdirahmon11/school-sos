/**
 * Conservative per-route database request ceilings. These are regression
 * guards, not claimed production p95 measurements; tune only from observed
 * request-scoped metrics and seeded staging runs.
 */
export const API_QUERY_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  'POST /auth/login': 12,
  'GET /auth/me': 12,
  'GET /superadmin/dashboard': 16,
  'GET /parent/children': 16,
  'GET /student/me': 12,
  'GET /students': 8,
  'GET /students/options': 4,
  'GET /messages/contacts': 12,
  'GET /classes/:id/details': 8,
  'GET /school/reports/summary': 2,
  'GET /exams/rankings/yearly': 12,
  'GET /teachers': 16,
  'GET /classes': 16,
  'GET /attendance': 16,
  'POST /attendance': 18,
  'PUT /attendance': 18,
  'GET /exams/marks': 20,
  'POST /exams/marks': 24,
  'GET /term-marks/entry': 20,
  'POST /term-marks/entry': 24,
  'GET /assignments': 16,
  'GET /notices': 14,
  'GET /messages': 12,
  'POST /messages/read': 12,
  'GET /timetable': 20,
  'GET /school/dashboard': 18,
  'GET /school/setup-progress': 18,
  'GET /teacher-assignments': 16
});

export function getApiQueryBudget(method: string, route: string): number | null {
  const normalizedRoute = route.startsWith('/api/') ? route.slice(4) : route;
  return API_QUERY_BUDGETS[`${method.toUpperCase()} ${normalizedRoute}`] ?? null;
}

export function isApiQueryBudgetExceeded(method: string, route: string, queryCount: number): boolean {
  const budget = getApiQueryBudget(method, route);
  return budget !== null && queryCount > budget;
}
