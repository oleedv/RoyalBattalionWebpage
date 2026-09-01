import type { Permission } from "shared";

export interface WSData {
  wsType: "live-server" | "presence";
  userId: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  permissions: Permission[];
  canManage: boolean;
  canView: boolean;
  serverKey: string;
  currentPage: string;
  hidePresence: boolean;
}
