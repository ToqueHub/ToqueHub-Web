export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
  permissions: string[];
  employeeId?: string | null;
}
