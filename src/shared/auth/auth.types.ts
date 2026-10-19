import { Role } from "../security/roles";
import { Permission } from "../security/permissions";

export interface AuthUser {
  id: string;
  email: string;
  phone?: string;
  role: Role;
  name?: string;
  permissions: Permission[];
}
