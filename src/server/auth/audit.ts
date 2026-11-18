import { AuditAction, AuditActorType } from '@/generated/prisma/client';

export type AuthAuditInput = {
  actorType: AuditActorType;
  actorRef: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  ip: string | null;
};

export async function recordAuthAudit(
  prismaClient: {
    auditLog: { create: (args: { data: AuthAuditInput }) => Promise<unknown> };
  },
  input: AuthAuditInput,
): Promise<void> {
  await prismaClient.auditLog.create({ data: input });
}

export { AuditAction, AuditActorType };
