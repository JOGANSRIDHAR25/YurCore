import * as fs from 'fs';
import * as path from 'path';

const modules = [
  "prescription",
  "dinacharya",
  "prakriti",
  "consent",
  "discover",
  "doctor",
  "booking",
  "consultation",
  "medicine",
  "order",
  "message",
  "notification",
  "availability",
  "emr",
  "pro-inbox",
  "follow-up",
  "analytics",
];

const basePath = path.join(process.cwd(), 'src', 'server');

const capitalize = (s: string) => {
  // pro-inbox -> ProInbox
  return s.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
};

const camelCase = (s: string) => {
  // pro-inbox -> proInbox
  const parts = s.split('-');
  return parts[0] + parts.slice(1).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
};

modules.forEach(mod => {
  const className = capitalize(mod);
  const repoName = `${className}Repository`;
  const serviceName = `${className}Service`;

  const repoContent = `import { createClient } from "@/server/db/supabase.server";

export class ${repoName} {
  // TODO: Migrate queries from src/lib/queries.ts
  static async getData() {
    const supabase = await createClient();
    return [];
  }
}
`;

  const serviceContent = `import { ${repoName} } from "../repositories/${mod}.repository";

export class ${serviceName} {
  static async getData() {
    return await ${repoName}.getData();
  }
}
`;

  const controllerContent = `import { NextRequest, NextResponse } from "next/server";
import { ${serviceName} } from "../services/${mod}.service";

export async function get${className}Controller(_req: NextRequest) {
  try {
    const data = await ${serviceName}.getData();
    return NextResponse.json({ success: true, data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("get${className}Controller error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
`;

  fs.writeFileSync(path.join(basePath, 'repositories', `${mod}.repository.ts`), repoContent);
  fs.writeFileSync(path.join(basePath, 'services', `${mod}.service.ts`), serviceContent);
  fs.writeFileSync(path.join(basePath, 'controllers', `${mod}.controller.ts`), controllerContent);
});

console.log("Scaffolding complete for all modules!");
