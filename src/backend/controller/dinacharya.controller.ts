import { NextRequest } from "next/server";
import { DinacharyaService } from "../service/dinacharya.service";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";

export class DinacharyaController {
  static async getTasks(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const tasks = await DinacharyaService.getTasks(authUser);
    return apiSuccess(tasks);
  }

  static async toggleTask(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    
    if (typeof body.taskId !== "string" || typeof body.done !== "boolean") {
      throw new Error("Invalid request body");
    }

    const result = await DinacharyaService.toggleTask(authUser, body.taskId, body.done);
    return apiSuccess(result);
  }
}
