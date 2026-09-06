export type DataDeletionRequestStatus = "pending" | "handled";

export interface DataDeletionRequest {
  id: string;
  userId: string | null;
  discordId: string;
  discordName: string;
  displayName: string | null;
  steamId: string | null;
  status: DataDeletionRequestStatus;
  handledAt: string | null;
  handledBy: string | null;
  createdAt: string;
}

export interface DataDeletionRequestSummary {
  pending: number;
}
