import { NextRequest } from "next/server";
import { EMRService } from "../service/emr.service";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

export class EMRController {
  static async getHealthRecords(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const records = await EMRService.getHealthRecords(authUser);
    return apiSuccess(records);
  }

  static async handlePost(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();

    const { action, payload } = body;
    let auditAction: string;
    let auditMetadata: Record<string, unknown> = {};
    let patientId: string;

    switch (action) {
      case "savePatientVitals": {
        const result = await EMRService.savePatientVitals(authUser, payload.vitals);
        patientId = result.patientId;
        auditAction = "update_patient_vitals";
        auditMetadata = { vitals: payload.vitals };
        break;
      }
      case "addPatientProblem": {
        const result = await EMRService.addPatientProblem(authUser, payload.problem);
        patientId = result.patientId;
        auditAction = "add_patient_problem";
        auditMetadata = { problem: payload.problem };
        break;
      }
      case "removePatientProblem": {
        const result = await EMRService.removePatientProblem(authUser, payload.code);
        patientId = result.patientId;
        auditAction = "remove_patient_problem";
        auditMetadata = { code: payload.code };
        break;
      }
      case "savePatientNote": {
        const result = await EMRService.savePatientNote(authUser, payload.noteText);
        patientId = result.patientId;
        auditAction = "update_patient_note";
        break;
      }
      default:
        throw new Error("Invalid action");
    }

    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: auditAction,
      module: "patients",
      recordId: patientId,
      patientId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: auditMetadata,
    });

    return apiSuccess({ success: true });
  }
}
