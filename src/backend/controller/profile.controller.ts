import { NextRequest } from "next/server";
import { ProfileService, updateProfileSchema } from "../service/profile.service";
import { createClient } from "@/shared/db/supabase.server";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";
import { auditRequest } from "@/shared/security/audit-log";

export class ProfileController {
  static async getMyProfile(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const supabase = await createClient();
    const service = new ProfileService(supabase);

    const profile = await service.getProfile(authUser);
    return apiSuccess(profile);
  }

  static async updateMyProfile(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    const validatedData = updateProfileSchema.parse(body);

    const supabase = await createClient();
    const service = new ProfileService(supabase);

    const profile = await service.updateProfile(authUser, validatedData);
    // Which fields changed, not their values (profiles hold personal data).
    auditRequest(req, authUser, {
      action: "update_profile",
      module: "profiles",
      recordId: authUser.id,
      metadata: { fields: Object.keys(validatedData ?? {}) },
    });
    return apiSuccess(profile, "Profile updated successfully");
  }
}
