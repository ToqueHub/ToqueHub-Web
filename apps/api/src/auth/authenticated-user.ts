export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
}
