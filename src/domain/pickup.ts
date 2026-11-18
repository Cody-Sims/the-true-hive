export type PickupWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PickupWindow {
  start: string;
  end: string;
}

export type PickupWeeklyHours = Record<PickupWeekday, PickupWindow[]>;

export interface PickupSiteFields {
  key: string;
  label: string;
  area: string;
  timezone: string;
  privateInstructions: string;
  active: boolean;
  stockLocationKeys: string[];
  slotMinutes: 15 | 30 | 60;
  capacity: number;
  noticeHours: number;
  horizonDays: number;
  rescheduleCutoffHours: number;
  travelBufferMinutes: number;
  weekly: PickupWeeklyHours;
  exceptions: Record<string, PickupWindow[]>;
}

export interface PickupSite extends PickupSiteFields {
  revision: number;
}

export type PublicPickupSite = Pick<
  PickupSite,
  "key" | "label" | "area" | "timezone" | "revision"
>;

export interface PickupSettings {
  enabled: boolean;
  revision: number;
}

export interface PickupSlot {
  id: string;
  siteKey: string;
  siteRevision: number;
  date: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  label: string;
}

export interface PickupAvailability {
  site: PublicPickupSite;
  settingsRevision: number;
  orderRevision: number;
  bookingRevision: number | null;
  slots: PickupSlot[];
}

export interface PickupBooking {
  id: string;
  orderId: string;
  siteKey: string;
  siteLabel: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  travelBufferMinutes: number;
  status: "scheduled" | "needs_review" | "completed";
  rescheduleCutoffHours: number;
  revision: number;
}

export interface CustomerPickupOrder {
  id: string;
  state: string;
  revision: number;
  createdAt: string;
  booking: Omit<PickupBooking, "travelBufferMinutes"> | null;
  helpRequested: boolean;
  sites: PublicPickupSite[];
  instructions: string | null;
  canSchedule: boolean;
}

export interface CustomerPickupContext {
  enabled: boolean;
  settingsRevision: number;
  orders: CustomerPickupOrder[];
}

export interface PickupMutationReceipt {
  operationId: string;
  resourceKey: string;
  revision: number;
  replayed: boolean;
  booking?: PickupBooking;
}

export interface PickupSiteImpact {
  ack: string;
  bookings: {
    orderId: string;
    bookingId: string;
    siteLabel: string;
    startsAt: string;
    reasons: string[];
  }[];
}

export interface OperatorPickupOrder {
  id: string;
  state: string;
  revision: number;
  createdAt: string;
  stockLocationKey: string;
  booking: PickupBooking | null;
  helpRequested: boolean;
  buyerAccessRevoked: boolean;
  sites: PublicPickupSite[];
}

export interface AdminPickupDashboard {
  settings: PickupSettings;
  sites: PickupSite[];
  stockLocations: { key: string; label: string }[];
  orders: OperatorPickupOrder[];
  truncated: boolean;
}
