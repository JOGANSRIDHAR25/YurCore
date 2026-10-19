import { NextRequest } from "next/server";
import { FamilyService } from "../service/family.service";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";
import { auditRequest } from "@/shared/security/audit-log";

export class FamilyController {
  static async getFamilyMembers(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const members = await FamilyService.getFamilyMembers(authUser);
    return apiSuccess(members);
  }

  static async handlePost(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();

    const { action, payload } = body;

    switch (action) {
      case "addFamilyMember":
        await FamilyService.addFamilyMember(authUser, payload.member);
        auditRequest(req, authUser, {
          action: "add_family_member",
          module: "family_members",
          metadata: { name: payload.member?.fullName, relationship: payload.member?.relationship },
        });
        break;
      case "updateFamilyMember":
        await FamilyService.updateFamilyMember(authUser, payload.id, payload.member);
        auditRequest(req, authUser, {
          action: "update_family_member",
          module: "family_members",
          recordId: payload.id,
          metadata: { name: payload.member?.fullName, relationship: payload.member?.relationship },
        });
        break;
      case "deleteFamilyMember":
        await FamilyService.deleteFamilyMember(authUser, payload.id);
        auditRequest(req, authUser, { action: "remove_family_member", module: "family_members", recordId: payload.id });
        break;
      default:
        throw new Error("Invalid action");
    }

    return apiSuccess({ success: true });
  }
}
